// verify-kairan-seat-lab-ocifarsito.js
// SELF-VERIFYING stxer mainnet-fork harness for contracts/charity/kairan-seat-lab-ocifarsito.clar
// (Kairan's Seat at Let Africa Build). Deploys the LOCAL source as chavita.btc,
// runs the real donors (fundraiser wallet with its LIVE balances, an sBTC whale,
// an STX whale), walks post-run (RUNNER = ocifarsito.btc) -> claim-run (LAB),
// and adds adversarial cases (proxy contracts, non-runner/non-LAB callers,
// double claim, direct transfers, malicious donor contract) and ends with
// emergency-withdraw (whole balance to Ocifarsito, contract frozen).
// Every tx step asserts its exact decoded result; read-only evals assert values;
// LAB / contract balance deltas are checked after the run. Exits 1 on any FAIL.
//
// Run: npx tsx simulations/verify-kairan-seat-lab-ocifarsito.js
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  ClarityVersion,
  uintCV,
  boolCV,
  stringAsciiCV,
  standardPrincipalCV,
  contractPrincipalCV,
  noneCV,
  bufferCV,
  deserializeCV,
  cvToString,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { installChunkedSubmit } from "./_chunked-submit.js";

installChunkedSubmit(60);

// The signer box serves a full Stacks API with no rate limit (Hiro 429s).
const BOX = "http://77.42.3.101/stacks-api";

const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // chavita.btc
const NAME = "kairan-seat-lab-ocifarsito";
const CID = `${DEPLOYER}.${NAME}`;
const LAB = "SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF";
const RUNNER = "SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q"; // ocifarsito.btc
const FUNDRAISER = "SP12AVHNBR1K5BRAXP699V66CWK7PQTJJBT2H174F";
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const STX_WHALE = "SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR";
const ATTACKER = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51"; // deploys the attack contracts
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const PROXY = `${ATTACKER}.kairan-lab-proxy`;
const EVIL = `${ATTACKER}.kairan-evil-donor`;
const RUN_URL = "https://x.com/RaphaStacks/status/2111442457384878240";
const LAB_URL = "https://letafricabuild.com/journal/kairans-seat";
const HASH = createHash("sha256").update(RUN_URL).digest(); // placeholder proof hash
const HASH_HEX = "0x" + HASH.toString("hex");
const FEE_HEADROOM = 100_000n; // 0.1 STX kept by the fundraiser for the tx fee

const P = (s) => (s.includes(".") ? contractPrincipalCV(...s.split(".")) : standardPrincipalCV(s));
const stxOf = (who) => `(stx-get-balance '${who})`;
const satsOf = (who) => `(unwrap-panic (contract-call? '${SBTC} get-balance '${who}))`;

// ---- attack contracts -------------------------------------------------------
// Proxy: forwards every privileged call. contract-caller becomes the proxy, so
// all of them must fail even when RUNNER / LAB / OWNER sign the tx.
const PROXY_SRC = `
(define-public (proxy-post-run)
  (contract-call? '${CID} post-run "https://evil.example/fake-run" 0x00))
(define-public (proxy-claim-run (id uint))
  (contract-call? '${CID} claim-run id "https://evil.example/fake-update" true))
(define-public (proxy-claim-run-as-contract (id uint))
  (as-contract? () (try! (contract-call? '${CID} claim-run id "https://evil.example" true))))
(define-public (proxy-emergency)
  (contract-call? '${CID} emergency-withdraw))
(define-public (proxy-sync)
  (contract-call? '${CID} sync-donations))
`;
// Malicious donor: donates then tries to post a run / claim in the same tx.
const EVIL_SRC = `
(define-public (donate-then-claim (amt uint))
  (begin
    (try! (contract-call? '${CID} donate-stx amt true))
    (contract-call? '${CID} claim-run u0 "https://evil.example" true)))
(define-public (donate-then-post (amt uint))
  (begin
    (try! (contract-call? '${CID} donate-sbtc amt true))
    (contract-call? '${CID} post-run "https://evil.example" 0x00)))
(define-public (self-donate (amt uint))
  (as-contract? ((with-stx amt))
    (try! (contract-call? '${CID} donate-stx amt true))))
`;

// ---- live balances of the fundraiser ----------------------------------------
async function live(addr) {
  const r = await fetch(`${BOX}/extended/v1/address/${addr}/balances`);
  const d = await r.json();
  const ft = d.fungible_tokens[`${SBTC}::sbtc-token`];
  return { stx: BigInt(d.stx.balance) - BigInt(d.stx.locked), sats: BigInt(ft?.balance ?? 0) };
}

// ---- plan -------------------------------------------------------------------
const plan = [];
const source = fs.readFileSync("./contracts/charity/kairan-seat-lab-ocifarsito.clar", "utf8");
let b;

function deploy(label, deployer, name, src) {
  b.withSender(deployer).addContractDeploy({ contract_name: name, source_code: src, clarity_version: ClarityVersion.Clarity5 });
  plan.push({ kind: "deploy", label });
}
// expect: exact string or predicate(str) -> bool
function call(label, sender, contract, fn, args, expect) {
  b.withSender(sender).addContractCall({ contract_id: contract, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label, expect });
}
const lab = (label, sender, fn, args, expect) => call(label, sender, CID, fn, args, expect);
function stxSend(label, sender, recipient, amount) {
  b.withSender(sender).addSTXTransfer({ recipient, amount: Number(amount) });
  plan.push({ kind: "tx", label, expect: "(ok true)" });
}
function evalc(label, code, { capture, expect } = {}) {
  b.addEvalCode(CID, code);
  plan.push({ kind: "eval", label, capture, expect });
}
const postRun = (label, sender, expect, url = RUN_URL) =>
  lab(label, sender, "post-run", [stringAsciiCV(url), bufferCV(HASH)], expect);
const claimRun = (label, sender, id, expect, { url = LAB_URL, agree = true } = {}) =>
  lab(label, sender, "claim-run", [uintCV(id), stringAsciiCV(url), boolCV(agree)], expect);
const amt = (id, stx, sats) => `(ok (tuple (id u${id}) (sats u${sats}) (stx u${stx})))`;
const has = (...parts) => (s) => parts.every((p) => s.includes(p));
const notOk = (s) => !s.startsWith("(ok");
function snap(tag) {
  evalc(`${tag}: LAB STX`, stxOf(LAB), { capture: `${tag}.labStx` });
  evalc(`${tag}: LAB sats`, satsOf(LAB), { capture: `${tag}.labSats` });
  evalc(`${tag}: contract STX`, stxOf(CID), { capture: `${tag}.cStx` });
  evalc(`${tag}: contract sats`, satsOf(CID), { capture: `${tag}.cSats` });
}
const status = (label, fields) => evalc(`get-status ${label}`, "(get-status)", { expect: has(...fields) });
const deltas = []; // [label, afterKey, beforeKey, want]
function claimDeltas(tag, before, after, stx, sats) {
  deltas.push([`${tag}: LAB STX delta`, `${after}.labStx`, `${before}.labStx`, stx]);
  deltas.push([`${tag}: LAB sats delta`, `${after}.labSats`, `${before}.labSats`, sats]);
  deltas.push([`${tag}: contract STX delta`, `${after}.cStx`, `${before}.cStx`, -stx]);
  deltas.push([`${tag}: contract sats delta`, `${after}.cSats`, `${before}.cSats`, -sats]);
}

function build(F) {
  b = SimulationBuilder.new({ stacksNodeAPI: BOX });
  const FSTX = F.stx - FEE_HEADROOM; // fundraiser's STX gift
  const FSATS = F.sats; // fundraiser's full sBTC

  deploy("deploy kairan-seat-lab-ocifarsito (chavita.btc, Clarity 5)", DEPLOYER, NAME, source);
  deploy("deploy attack contract kairan-lab-proxy", ATTACKER, "kairan-lab-proxy", PROXY_SRC);
  deploy("deploy attack contract kairan-evil-donor", ATTACKER, "kairan-evil-donor", EVIL_SRC);
  evalc("fork: fundraiser STX = live read", stxOf(FUNDRAISER), { expect: `u${F.stx}` });
  evalc("fork: fundraiser sats = live read", satsOf(FUNDRAISER), { expect: `u${F.sats}` });
  evalc("get-terms", "(get-terms)", { expect: has("@ocifarsito", "Kairan's Seat", "RunThrough USA") });
  status("fresh", ["(balance-stx u0)", "(run-count u0)", "(locked-stx u0)", `(runner ${RUNNER})`, `(owner ${DEPLOYER})`, `(lab ${LAB})`]);
  postRun("post-run with empty contract -> u102", RUNNER, "(err u102)");

  // ===== 1. fundraiser donates its live balances =====
  lab("donate-stx terms false -> u103", FUNDRAISER, "donate-stx", [uintCV(1), boolCV(false)], "(err u103)");
  lab("donate-sbtc terms false -> u103", SBTC_WHALE, "donate-sbtc", [uintCV(1), boolCV(false)], "(err u103)");
  evalc("get-donor-terms", "(get-donor-terms)", { expect: has("UASU Inc. (a Delaware corporation, operating as Ocifarsito)", "Gifts are voluntary and final. ", "501(c)(3)", "move all funds to UASU Inc. (Ocifarsito)", "courts of Delaware.") });
  lab("donate-stx 0 -> u102", FUNDRAISER, "donate-stx", [uintCV(0), boolCV(true)], "(err u102)");
  lab(`fundraiser donate-stx ${FSTX} (full minus 0.1 STX)`, FUNDRAISER, "donate-stx", [uintCV(FSTX), boolCV(true)], "(ok true)");
  if (FSATS > 0n) lab(`fundraiser donate-sbtc ${FSATS} (full)`, FUNDRAISER, "donate-sbtc", [uintCV(FSATS), boolCV(true)], "(ok true)");
  evalc("fundraiser STX left = headroom", stxOf(FUNDRAISER), { expect: `u${FEE_HEADROOM}` });
  evalc("fundraiser sats left = 0", satsOf(FUNDRAISER), { expect: "u0" });
  status("after fundraiser", [`(balance-stx u${FSTX})`, `(donated-stx u${FSTX})`, `(donated-sats u${FSATS})`]);
  // ===== 2. post-run guards =====
  postRun("post-run by fundraiser -> u104", FUNDRAISER, "(err u104)");
  postRun("post-run by LAB -> u104", LAB, "(err u104)");
  postRun("post-run by owner -> u104", DEPLOYER, "(err u104)");
  postRun("post-run empty url -> u108", RUNNER, "(err u108)", "");
  postRun("post-run url 257 chars -> rejected", RUNNER, notOk, "h".repeat(257));
  call("ATTACK RUNNER signs proxy-post-run -> u104", RUNNER, PROXY, "proxy-post-run", [], "(err u104)");
  call("ATTACK evil donate-then-post (sbtc whale) -> u104", SBTC_WHALE, EVIL, "donate-then-post", [uintCV(1_000)], "(err u104)");
  status("guards left no runs", ["(run-count u0)", "(locked-stx u0)"]);

  // ===== 3. run 0: RUNNER posts the real proof =====
  postRun("RUNNER post-run 0 (real X proof url)", RUNNER, amt(0, FSTX, FSATS));
  evalc("get-run u0", "(get-run u0)", { expect: has(RUN_URL, HASH_HEX, `(stx u${FSTX})`, `(sats u${FSATS})`, "(claimed none)") });
  status("run 0 locked", [`(locked-stx u${FSTX})`, `(locked-sats u${FSATS})`, "(run-count u1)"]);
  postRun("post-run again, nothing new -> u102", RUNNER, "(err u102)");

  // gifts after run 0 stay unlocked
  const G1S = 100_000_000n, G1B = 50_000n;
  lab("STX whale donate 100 STX", STX_WHALE, "donate-stx", [uintCV(G1S), boolCV(true)], "(ok true)");
  lab("sBTC whale donate 50000 sats", SBTC_WHALE, "donate-sbtc", [uintCV(G1B), boolCV(true)], "(ok true)");
  call("evil self-donate 0 -> u102", STX_WHALE, EVIL, "self-donate", [uintCV(0)], "(err u102)");
  stxSend("fund evil donor with 1 STX", STX_WHALE, EVIL, 1_000_000n);
  call("evil self-donate 1 STX (contract donor) -> ok", STX_WHALE, EVIL, "self-donate", [uintCV(1_000_000)], "(ok true)");
  stxSend("DIRECT stx-transfer 5 STX (bypasses donate)", STX_WHALE, CID, 5_000_000n);
  const U1S = G1S + 1_000_000n + 5_000_000n;
  status("later gifts unlocked", [`(locked-stx u${FSTX})`, `(locked-sats u${FSATS})`, `(balance-stx u${FSTX + U1S})`]);

  // ===== 4. claim-run guards =====
  claimRun("claim-run by fundraiser -> u101", FUNDRAISER, 0, "(err u101)");
  claimRun("claim-run by RUNNER -> u101", RUNNER, 0, "(err u101)");
  claimRun("claim-run by owner -> u101", DEPLOYER, 0, "(err u101)");
  claimRun("LAB claim-run terms false -> u103", LAB, 0, "(err u103)", { agree: false });
  claimRun("LAB claim-run empty url -> u108", LAB, 0, "(err u108)", { url: "" });
  claimRun("LAB claim-run u9 -> u105", LAB, 9, "(err u105)");
  call("ATTACK LAB signs proxy-claim-run -> u101", LAB, PROXY, "proxy-claim-run", [uintCV(0)], "(err u101)");
  call("ATTACK LAB signs proxy-claim-run-as-contract -> u101", LAB, PROXY, "proxy-claim-run-as-contract", [uintCV(0)], "(err u101)");
  call("ATTACK evil donate-then-claim (whale) -> u101", STX_WHALE, EVIL, "donate-then-claim", [uintCV(1_000_000)], "(err u101)");

  // ===== 5. LAB claims run 0: exactly the locked amounts =====
  snap("c0pre");
  claimRun("LAB claim-run 0 pays run 0 exactly", LAB, 0, amt(0, FSTX, FSATS));
  snap("c0post");
  claimDeltas("claim 0", "c0pre", "c0post", FSTX, FSATS);
  evalc("get-run u0 claimed with LAB url", "(get-run u0)", { expect: has("(claimed (some", LAB_URL) });
  claimRun("LAB double claim run 0 -> u106", LAB, 0, "(err u106)");
  status("after claim 0", [`(paid-stx u${FSTX})`, `(paid-sats u${FSATS})`, "(locked-stx u0)", "(locked-sats u0)", `(balance-stx u${U1S})`]);

  // ===== 6. run 1 locks only the new gifts (incl. direct transfer) =====
  postRun("RUNNER post-run 1 locks only new gifts", RUNNER, amt(1, U1S, G1B));
  lab("STX whale donate 3 STX after run 1", STX_WHALE, "donate-stx", [uintCV(3_000_000), boolCV(true)], "(ok true)");
  snap("c1pre");
  claimRun("LAB claim-run 1", LAB, 1, amt(1, U1S, G1B));
  snap("c1post");
  claimDeltas("claim 1", "c1pre", "c1post", U1S, G1B);
  evalc("contract STX = only the unlocked 3 STX", stxOf(CID), { expect: "u3000000" });
  lab("owner sync-donations counts the 5 STX direct", DEPLOYER, "sync-donations", [], "(ok (tuple (sats u0) (stx u5000000)))");
  call("ATTACK owner signs proxy-sync -> u100", DEPLOYER, PROXY, "proxy-sync", [], "(err u100)");

  // ===== 7. emergency: whole balance (locked too) to Ocifarsito, then frozen =====
  postRun("RUNNER post-run 2 (3 STX)", RUNNER, amt(2, 3_000_000n, 0n));
  lab("STX whale donate 1 STX unlocked", STX_WHALE, "donate-stx", [uintCV(1_000_000), boolCV(true)], "(ok true)");
  const G2B = 20_000n;
  lab("sBTC whale donate 20000 sats unlocked", SBTC_WHALE, "donate-sbtc", [uintCV(G2B), boolCV(true)], "(ok true)");
  lab("emergency-withdraw by LAB -> u100", LAB, "emergency-withdraw", [], "(err u100)");
  lab("emergency-withdraw by RUNNER -> u100", RUNNER, "emergency-withdraw", [], "(err u100)");
  lab("emergency-withdraw by fundraiser -> u100", FUNDRAISER, "emergency-withdraw", [], "(err u100)");
  call("ATTACK owner signs proxy-emergency -> u100", DEPLOYER, PROXY, "proxy-emergency", [], "(err u100)");
  status("pre-emergency", ["(frozen-at none)", "(locked-stx u3000000)", "(balance-stx u4000000)"]);
  evalc("pre: ocifarsito STX", stxOf(RUNNER), { capture: "empre.oStx" });
  evalc("pre: ocifarsito sats", satsOf(RUNNER), { capture: "empre.oSats" });
  lab("owner emergency-withdraw -> Ocifarsito (locked + unlocked)", DEPLOYER, "emergency-withdraw", [], `(ok (tuple (sats u${G2B}) (stx u4000000)))`);
  evalc("post: ocifarsito STX", stxOf(RUNNER), { capture: "empost.oStx" });
  evalc("post: ocifarsito sats", satsOf(RUNNER), { capture: "empost.oSats" });
  deltas.push(["emergency: Ocifarsito STX delta", "empost.oStx", "empre.oStx", 4_000_000n]);
  deltas.push(["emergency: Ocifarsito sats delta", "empost.oSats", "empre.oSats", G2B]);
  evalc("contract STX = 0", stxOf(CID), { expect: "u0" });
  evalc("contract sats = 0", satsOf(CID), { expect: "u0" });
  status("frozen", ["(frozen-at (some u", "(locked-stx u0)", "(locked-sats u0)", "(withdrawn-stx u4000000)", `(withdrawn-sats u${G2B})`]);
  lab("emergency-withdraw again -> u109", DEPLOYER, "emergency-withdraw", [], "(err u109)");
  lab("fundraiser donate-stx after emergency -> u109", FUNDRAISER, "donate-stx", [uintCV(1_000), boolCV(true)], "(err u109)");
  lab("donate-sbtc after emergency -> u109", SBTC_WHALE, "donate-sbtc", [uintCV(1_000), boolCV(true)], "(err u109)");
  stxSend("DIRECT stx-transfer 2 STX after emergency", STX_WHALE, CID, 2_000_000n);
  postRun("post-run after emergency -> u109", RUNNER, "(err u109)");
  claimRun("LAB claim open run 2 after emergency -> u109", LAB, 2, "(err u109)");
  lab("sync-donations after emergency -> u109", DEPLOYER, "sync-donations", [], "(err u109)");
  evalc("proxy got nothing", stxOf(PROXY), { expect: "u0" });
  status("final", [`(paid-stx u${FSTX + U1S})`, "(run-count u3)", "(balance-stx u2000000)"]);
}

// ---- decode -----------------------------------------------------------------
function decodeTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return { str: `<no tx result: ${JSON.stringify(s).slice(0, 200)}>`, events: [] };
  if ("Err" in r) return { str: `ENGINE-ERR: ${String(r.Err).slice(0, 200)}`, events: [] };
  let str;
  try { str = cvToString(deserializeCV(r.Ok.result)); } catch (e) { str = `decode-failed(${r.Ok.result})`; }
  const evs = (r.Ok.events ?? r.Ok.receipt?.events ?? []).map((e) => (typeof e === "string" ? JSON.parse(e) : e)).filter((e) => e.committed !== false);
  const events = evs.map((e) => {
    if (e.contract_event) { try { return `print ${cvToString(deserializeCV(e.contract_event.raw_value))}`; } catch { return "print <?>"; } }
    if (e.stx_transfer_event) return `stx ${e.stx_transfer_event.amount} ${e.stx_transfer_event.sender} -> ${e.stx_transfer_event.recipient}`;
    if (e.ft_transfer_event) return `ft ${e.ft_transfer_event.amount} ${e.ft_transfer_event.sender} -> ${e.ft_transfer_event.recipient}`;
    return Object.keys(e).join(",");
  });
  return { str, events };
}
function decodeEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval result>";
  if (!("Ok" in r)) return `ERR: ${r.Err}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; }
}
const U = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-999999999");
const check = (want, got) => (typeof want === "function" ? want(got) : got === want);

async function main() {
  console.log("=== kairan-seat-lab-ocifarsito SELF-VERIFYING stxer harness ===\n");
  const F = await live(FUNDRAISER);
  console.log(`fundraiser live: ${F.stx} uSTX, ${F.sats} sats\n`);
  build(F);
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted ${plan.length} steps. Fetching results...\n${url}\n`);
  const res = await getSimulationResult(sessionId);
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(res, null, 1));
  const cap = {};
  let pass = 0, fail = 0;
  const fails = [];
  plan.forEach((p, i) => {
    const s = res.steps[i];
    if (p.kind === "deploy") {
      const r = s?.Result?.Transaction;
      const ok = r && !("Err" in r) && decodeTx(s).str.startsWith("(ok");
      console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label} -> ${decodeTx(s).str}`);
      ok ? pass++ : (fail++, fails.push(p.label));
    } else if (p.kind === "tx") {
      const d = decodeTx(s);
      const ok = check(p.expect, d.str);
      console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label}\n        got ${d.str}${ok ? "" : `  EXPECTED ${typeof p.expect === "function" ? "<predicate>" : p.expect}`}`);
      for (const e of d.events) console.log(`          ev: ${e}`);
      ok ? pass++ : (fail++, fails.push(p.label));
    } else if (p.kind === "eval") {
      const v = decodeEval(s);
      if (p.capture) cap[p.capture] = v;
      if (p.expect !== undefined) {
        const ok = check(p.expect, v);
        console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label}: ${v.length > 400 ? v.slice(0, 400) + "..." : v}`);
        ok ? pass++ : (fail++, fails.push(p.label));
      } else console.log(`  info [${i}] ${p.label}: ${v}`);
    }
  });
  console.log("\n--- balance deltas ---");
  for (const [label, a, bk, want] of deltas) {
    const got = U(cap[a]) - U(cap[bk]);
    const ok = got === want;
    console.log(`${ok ? "PASS" : "FAIL"} ${label} = ${got} (want ${want})`);
    ok ? pass++ : (fail++, fails.push(label));
  }
  console.log(`\n=== ${pass}/${pass + fail} passed, ${fail} failed ===`);
  if (fails.length) console.log("FAILED:\n  " + fails.join("\n  "));
  console.log(`View: ${url}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
