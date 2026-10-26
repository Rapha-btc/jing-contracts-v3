// verify-kairan-seat-lab-v3.js
// SELF-VERIFYING stxer mainnet-fork harness for
// contracts/charity/kairan-seat-lab-ocifarsito-v3.clar (reserve-only seat:
// FUNDRAISER deposits STX + sBTC, LAB files a use-of-funds request, OWNER
// releases the whole balance to LAB once, before DEADLINE = deploy burn
// height + 12960; a request must land more than REVIEW_WINDOW = 1008 blocks
// before DEADLINE; from DEADLINE, if nothing was released, FUNDRAISER
// recoups the whole balance). Deploys the LOCAL source as chavita.btc
// (OWNER) six times, all at the same burn height (same DEADLINE):
//  A. MAIN: whales top up the fundraiser wallet on the fork; the fundraiser
//     deposits three times (STX only, sBTC only, then the rest of its live
//     STX + sBTC); STX and sBTC are also sent straight to the contract; LAB
//     files a request, replaces it with a 512-char one; OWNER release with the
//     old description -> u115, with the new one -> LAB gets exactly the whole
//     balance (deposits + direct sends). After the release every entry point
//     is closed (u106) and the claim / request never change; STX sent in
//     after the release stays in the contract (v3 has no sweep).
//  B. EMPTY: LAB requests, release with nothing to pay -> u102; STX sent
//     straight to the contract -> release pays LAB that STX only.
//  C. SATS: sBTC-only deposit -> release pays sBTC only.
//  D. RECOUP: deposits + direct sends; recoup before DEADLINE -> u112 (also
//     one block before); LAB files a request at the last allowed block
//     (DEADLINE - 1009), one block later -> u113; at DEADLINE the owner's
//     release -> u113 even with that request, FUNDRAISER recoups exactly the
//     whole STX + sBTC balance (Deny-mode PCs), claim { to: FUNDRAISER,
//     description: "" }; then deposit / request / release / recoup -> u106.
//  E. DEADLINE: LAB requests at DEADLINE - 1009 (ok), DEADLINE - 1008
//     (u113); the owner releases at DEADLINE - 1 (ok, pays LAB); recoup
//     after that -> u106.
//  F. RECOUP-EMPTY: recoup at DEADLINE with nothing -> u102; a deposit after
//     DEADLINE still lands; recoup pays it to FUNDRAISER.
// The burn clock is moved with addAdvanceBlocks (exact block counts, each
// boundary checked with (- DEADLINE burn-block-height) evals).
// Attacks: every function from the wrong principals, and through a proxy
// contract the right principal signs (contract-caller != the principal),
// including an as-contract? hop; recoup from every non-FUNDRAISER principal
// and through the proxy -> u105.
// Deny-mode post-conditions (the builder only emits Allow txs, so the
// marked steps are re-encoded in Deny mode with explicit PCs right before
// submit): deposits pin the fundraiser's exact outflow; a Deny-mode deposit
// with no PCs and a release with an off-by-one PC abort and roll back; the
// real release pins the contract's exact STX + sBTC outflow.
// Every tx asserts its exact decoded result; read-only evals assert values;
// balance deltas are checked after the run. Exits 1 on any FAIL.
//
// API: STACKS_API_URL, else the signer box, else simulations/_api-proxy.mjs
// on 127.0.0.1:8787, else api.hiro.so (first that answers /v2/info).
// Run: npx tsx simulations/verify-kairan-seat-lab-v3.js
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  boolCV,
  stringAsciiCV,
  standardPrincipalCV,
  contractPrincipalCV,
  noneCV,
  deserializeCV,
  cvToString,
  deserializeTransaction,
  PostConditionMode,
  createLPList,
  postConditionToWire,
  Pc,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { installChunkedSubmit } from "./_chunked-submit.js";

installChunkedSubmit(60);

// ---- Deny-mode post-conditions: re-encode marked steps before submit -------
const pcSteps = new Map(); // plan index -> { fn, pcs }
{
  const inner = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (init?.method === "POST" && /\/devtools\/v2\/simulations\/[0-9a-f]+$/.test(String(url)) && typeof init.body === "string" && pcSteps.size) {
      const body = JSON.parse(init.body);
      if (Array.isArray(body?.steps) && body.steps.length === plan.length) {
        for (const [i, { fn, pcs }] of pcSteps) {
          const st = body.steps[i];
          if (!st?.Transaction) throw new Error(`PC step ${i} is not a transaction`);
          const tx = deserializeTransaction(st.Transaction);
          if (tx.payload.functionName?.content !== fn) throw new Error(`PC step ${i}: expected ${fn}, got ${tx.payload.functionName?.content}`);
          tx.postConditionMode = PostConditionMode.Deny;
          tx.postConditions = createLPList(pcs.map(postConditionToWire));
          st.Transaction = tx.serialize();
        }
        init = { ...init, body: JSON.stringify(body) };
      }
    }
    return inner(url, init);
  };
}

const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // chavita.btc (OWNER)
const NAME_A = "kairan-seat-lab-ocifarsito-v3";
const NAME_B = "kairan-seat-lab-ocifarsito-v3-empty";
const NAME_C = "kairan-seat-lab-ocifarsito-v3-sats";
const A = `${DEPLOYER}.${NAME_A}`;
const B = `${DEPLOYER}.${NAME_B}`;
const C = `${DEPLOYER}.${NAME_C}`;
const D = `${DEPLOYER}.kairan-seat-lab-ocifarsito-v3-recoup`;
const E = `${DEPLOYER}.kairan-seat-lab-ocifarsito-v3-deadline`;
const F_ = `${DEPLOYER}.kairan-seat-lab-ocifarsito-v3-zero`;
const LAB = "SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF";
const FUNDRAISER = "SP12AVHNBR1K5BRAXP699V66CWK7PQTJJBT2H174F";
const OCIFARSITO = "SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q"; // UASU Inc.: must never receive funds
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const STX_WHALE = "SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR";
const ATTACKER = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const PROXY = `${ATTACKER}.kairan-v3-proxy`;
const FEE_HEADROOM = 1_000_000n; // 1 STX kept by the fundraiser for its tx fees
const TOPUP_STX = 50_000_000n; // whale -> fundraiser on the fork
const TOPUP_SATS = 5_000n;
const DEP1_STX = 10_000_000n; // deposit 1: STX only
const DEP2_SATS = 1_000n; // deposit 2: sBTC only
const C_SATS = 700n; // kept for contract C
const DIRECT_STX = 2_000_000n; // straight to A before the release
const DIRECT_SATS = 300n;
const B_STX = 3_000_000n; // straight to B
const LATE_STX = 1_000_000n; // straight to A after the release
const TOPUP2_STX = 20_000_000n; // second whale -> fundraiser top-up (for D / F)
const TOPUP2_SATS = 2_000n;
const D_DEP_STX = 15_000_000n; // fundraiser deposit into D
const D_DEP_SATS = 1_500n;
const D_DIRECT_STX = 1_000_000n; // whale straight to D
const D_DIRECT_SATS = 100n;
const D_STX = D_DEP_STX + D_DIRECT_STX;
const D_SATS = D_DEP_SATS + D_DIRECT_SATS;
const E_STX = 2_000_000n; // whale straight to E
const E_SATS = 200n;
const Z_SATS = 300n; // fundraiser deposit into F after DEADLINE
const Z_STX = 500_000n; // whale straight to F after DEADLINE
const DEADLINE_OFFSET = 12960;
const REVIEW_WINDOW = 1008;
const D1 = "Kairan's Seat: one builder stipend, 6 months, Lagos cohort, laptop and data plan";
const D2 = (() => {
  const base = "Kairan's Seat at LAB 2027: stipend for one full-time Stacks builder for 12 months (monthly in STX), a laptop, mobile data, and travel to two LAB build weeks; any rest goes to the LAB builder fund pool. Milestones and receipts are posted on letafricabuild.com/journal. ";
  let s = base;
  while (s.length < 512) s += "Reviewed by Ocifarsito. ";
  return s.slice(0, 512);
})();
if (D2.length !== 512 || /["\\]/.test(D2 + D1)) throw new Error("bad description fixture");

const P = (s) => (s.includes(".") ? contractPrincipalCV(...s.split(".")) : standardPrincipalCV(s));
const stxOf = (who) => `(stx-get-balance '${who})`;
const ftOf = (token, who) => `(unwrap-panic (contract-call? '${token} get-balance '${who}))`;
const sendsStx = (who, n) => Pc.principal(who).willSendEq(n).ustx();
const sendsSats = (who, n) => Pc.principal(who).willSendEq(n).ft(SBTC, "sbtc-token");

const PROXY_SRC = `
(define-public (proxy-deposit)
  (contract-call? '${A} deposit-reserve u1 u0))
(define-public (proxy-deposit-as-contract)
  (as-contract? () (try! (contract-call? '${A} deposit-reserve u1 u0))))
(define-public (proxy-request)
  (contract-call? '${A} request-reserve "evil: send it to the attacker" true))
(define-public (proxy-release)
  (contract-call? '${A} release-reserve "${D2}"))
(define-public (proxy-release-as-contract)
  (as-contract? () (try! (contract-call? '${A} release-reserve "${D2}"))))
(define-public (proxy-recoup)
  (contract-call? '${D} recoup-reserve))
(define-public (proxy-recoup-as-contract)
  (as-contract? () (try! (contract-call? '${D} recoup-reserve))))
`;

let API;
async function pickApi() {
  const cands = [process.env.STACKS_API_URL, "http://77.42.3.101/stacks-api", "http://127.0.0.1:8787", "https://api.hiro.so"].filter(Boolean);
  for (const u of cands) {
    try {
      const r = await fetch(`${u}/v2/info`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) return u;
    } catch {}
  }
  throw new Error(`no Stacks API answered: ${cands.join(", ")}`);
}

async function live(addr) {
  const r = await fetch(`${API}/extended/v1/address/${addr}/balances`);
  const d = await r.json();
  return {
    stx: BigInt(d.stx.balance) - BigInt(d.stx.locked),
    sats: BigInt(d.fungible_tokens[`${SBTC}::sbtc-token`]?.balance ?? 0),
  };
}

// ---- plan -------------------------------------------------------------------
const plan = [];
const source = fs.readFileSync("./contracts/charity/kairan-seat-lab-ocifarsito-v3.clar", "utf8");
let b;

function deploy(label, deployer, name, src) {
  b.withSender(deployer).addContractDeploy({ contract_name: name, source_code: src, clarity_version: ClarityVersion.Clarity5 });
  plan.push({ kind: "deploy", label });
}
function call(label, sender, contract, fn, args, expect, pcs, evs) {
  if (pcs) pcSteps.set(plan.length, { fn, pcs });
  b.withSender(sender).addContractCall({ contract_id: contract, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label: pcs ? `[deny ${pcs.length} PC] ${label}` : label, expect, evs });
}
function stxSend(label, sender, recipient, amount) {
  b.withSender(sender).addSTXTransfer({ recipient, amount: Number(amount) });
  plan.push({ kind: "tx", label, expect: "(ok true)" });
}
const satsSend = (label, from, to, amount) =>
  call(label, from, SBTC, "transfer", [uintCV(amount), P(from), P(to), noneCV()], "(ok true)");
function evalc(label, code, { capture, expect, on = A } = {}) {
  b.addEvalCode(on, code);
  plan.push({ kind: "eval", label, capture, expect });
}
let clock = 0; // burn blocks since the deploys
function advance(n) {
  b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 1 });
  clock += n;
  plan.push({ kind: "advance", label: `advance ${n} Bitcoin blocks (clock ${clock}, burn - DEADLINE = ${clock - DEADLINE_OFFSET})` });
}
// the burn clock as the contract sees it: DEADLINE - burn-block-height
const clockCheck = (label) => evalc(`clock ${label}: DEADLINE - burn-block-height = ${DEADLINE_OFFSET - clock}`,
  "(- DEADLINE burn-block-height)", { expect: `u${DEADLINE_OFFSET - clock}`, on: E });
const has = (...parts) => (s) => parts.every((p) => s.includes(p));
const pcAbort = (s) => s.startsWith("PC-ABORT");
const status = (label, fields, on = A) => evalc(`get-status ${label}`, "(get-status)", { expect: has(...fields), on });
const deltas = []; // [label, afterKey, beforeKey, want]
const ranges = []; // [label, afterKey, beforeKey, lo (exclusive), hi (inclusive)]
const equals = []; // [label, keyA, keyB]
function snap(tag, who, on) {
  for (const [k, a] of Object.entries(who)) {
    evalc(`${tag}: ${k} STX`, stxOf(a), { capture: `${tag}.${k}.stx`, on });
    evalc(`${tag}: ${k} sats`, ftOf(SBTC, a), { capture: `${tag}.${k}.sats`, on });
  }
}
function delta(label, k, before, after, want) {
  for (const [asset, v] of Object.entries(want)) deltas.push([`${label}: ${k} ${asset} delta`, `${after}.${k}.${asset}`, `${before}.${k}.${asset}`, v]);
}
const tupleOk = (stx, sats) => `(ok (tuple (sats u${sats}) (stx u${stx})))`;

function build(F) {
  b = SimulationBuilder.new({ stacksNodeAPI: API });
  const F_STX = F.stx + TOPUP_STX;
  const F_SATS = F.sats + TOPUP_SATS;
  const DEP3_STX = F_STX - DEP1_STX - FEE_HEADROOM; // rest of the fundraiser's STX
  const DEP3_SATS = F_SATS - DEP2_SATS - C_SATS; // rest of its sBTC but C's share
  if (DEP3_STX <= 0n || DEP3_SATS <= 0n) throw new Error("fundraiser too poor for the plan");
  const A_STX = DEP1_STX + DEP3_STX + DIRECT_STX;
  const A_SATS = DEP2_SATS + DEP3_SATS + DIRECT_SATS;

  deploy("deploy kairan-seat-lab-ocifarsito-v3 (A, chavita.btc, Clarity 5)", DEPLOYER, NAME_A, source);
  deploy("deploy kairan-seat-lab-ocifarsito-v3-empty (B)", DEPLOYER, NAME_B, source);
  deploy("deploy kairan-seat-lab-ocifarsito-v3-sats (C)", DEPLOYER, NAME_C, source);
  deploy("deploy kairan-seat-lab-ocifarsito-v3-recoup (D)", DEPLOYER, D.split(".")[1], source);
  deploy("deploy kairan-seat-lab-ocifarsito-v3-deadline (E)", DEPLOYER, E.split(".")[1], source);
  deploy("deploy kairan-seat-lab-ocifarsito-v3-zero (F)", DEPLOYER, F_.split(".")[1], source);
  deploy("deploy attack contract kairan-v3-proxy", ATTACKER, "kairan-v3-proxy", PROXY_SRC);
  for (const [k, c] of Object.entries({ A, B, C, D, E, F: F_ })) {
    evalc(`${k}: DEADLINE = deploy burn height + ${DEADLINE_OFFSET} = get-status deadline`,
      `(and (is-eq DEADLINE (+ burn-block-height u${DEADLINE_OFFSET})) (is-eq (get deadline (get-status)) DEADLINE))`, { expect: "true", on: c });
  }
  evalc("REVIEW_WINDOW = u1008", "REVIEW_WINDOW", { expect: `u${REVIEW_WINDOW}` });
  clockCheck("at deploy");
  evalc("fork: fundraiser STX = live read", stxOf(FUNDRAISER), { expect: `u${F.stx}` });
  evalc("fork: fundraiser sats = live read", ftOf(SBTC, FUNDRAISER), { expect: `u${F.sats}` });
  evalc("get-terms", "(get-terms)", { expect: has("only that wallet can deposit", "the owner then releases the whole reserve to LAB, once, before the deadline", "at least 7 days (1,008 Bitcoin blocks) before the deadline, about 90 days (12,960 Bitcoin blocks)", "Funds in this contract only ever go to LAB's wallet SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF, or, if the reserve was not released to LAB by the deadline, back to the fundraiser wallet", "courts of Delaware.") });
  status("A fresh", [`(lab ${LAB})`, `(owner ${DEPLOYER})`, `(fundraiser ${FUNDRAISER})`, "(deadline u", "(stx u0)", "(sats u0)", "(claimed false)"]);
  evalc("A fresh: get-request none", "(get-request)", { expect: "none" });
  evalc("A fresh: get-claim none", "(get-claim)", { expect: "none" });

  // ===== A. open phase =====
  call("A: owner release with no request -> u107", DEPLOYER, A, "release-reserve", [stringAsciiCV(D1)], "(err u107)");
  call("ATTACK LAB release -> u100", LAB, A, "release-reserve", [stringAsciiCV(D1)], "(err u100)");
  call("ATTACK fundraiser release -> u100", FUNDRAISER, A, "release-reserve", [stringAsciiCV(D1)], "(err u100)");
  call("ATTACK attacker release -> u100", ATTACKER, A, "release-reserve", [stringAsciiCV(D1)], "(err u100)");
  call("ATTACK STX whale deposit-reserve -> u105", STX_WHALE, A, "deposit-reserve", [uintCV(1), uintCV(0)], "(err u105)");
  call("ATTACK LAB deposit-reserve -> u105", LAB, A, "deposit-reserve", [uintCV(1), uintCV(0)], "(err u105)");
  call("ATTACK owner deposit-reserve -> u105", DEPLOYER, A, "deposit-reserve", [uintCV(1), uintCV(0)], "(err u105)");
  call("ATTACK fundraiser signs proxy-deposit -> u105", FUNDRAISER, PROXY, "proxy-deposit", [], "(err u105)");
  call("ATTACK fundraiser signs proxy-deposit-as-contract -> u105", FUNDRAISER, PROXY, "proxy-deposit-as-contract", [], "(err u105)");
  call("fundraiser deposit-reserve 0 0 -> u102", FUNDRAISER, A, "deposit-reserve", [uintCV(0), uintCV(0)], "(err u102)");
  call("A: fundraiser recoup before DEADLINE (empty) -> u112 (deadline checked before amount)", FUNDRAISER, A, "recoup-reserve", [], "(err u112)");
  call("ATTACK LAB recoup -> u105", LAB, A, "recoup-reserve", [], "(err u105)");
  call("ATTACK owner recoup -> u105", DEPLOYER, A, "recoup-reserve", [], "(err u105)");

  stxSend(`fund: STX whale sends the fundraiser ${TOPUP_STX} uSTX`, STX_WHALE, FUNDRAISER, TOPUP_STX);
  satsSend(`fund: sBTC whale sends the fundraiser ${TOPUP_SATS} sats`, SBTC_WHALE, FUNDRAISER, TOPUP_SATS);
  evalc("fund: fundraiser sats = live + top-up", ftOf(SBTC, FUNDRAISER), { expect: `u${F_SATS}` });
  call("fundraiser deposit more STX than it holds -> err u1", FUNDRAISER, A, "deposit-reserve", [uintCV(F_STX * 10n), uintCV(0)], "(err u1)");
  call("fundraiser deposit more sats than it holds -> err u1", FUNDRAISER, A, "deposit-reserve", [uintCV(0), uintCV(F_SATS + 1n)], "(err u1)");
  call("Deny mode, no PCs: fundraiser deposit 1 STX -> aborted, rolled back", FUNDRAISER, A, "deposit-reserve", [uintCV(1_000_000), uintCV(0)], pcAbort, []);
  status("A still empty after the aborted deposit", ["(stx u0)", "(sats u0)"]);

  snap("dpre", { fr: FUNDRAISER, c: A }, A);
  call(`fundraiser deposit 1: ${DEP1_STX} uSTX only`, FUNDRAISER, A, "deposit-reserve", [uintCV(DEP1_STX), uintCV(0)], "(ok true)", [sendsStx(FUNDRAISER, DEP1_STX)]);
  call(`fundraiser deposit 2: ${DEP2_SATS} sats only`, FUNDRAISER, A, "deposit-reserve", [uintCV(0), uintCV(DEP2_SATS)], "(ok true)", [sendsSats(FUNDRAISER, DEP2_SATS)]);
  call(`fundraiser deposit 3: rest ${DEP3_STX} uSTX + ${DEP3_SATS} sats`, FUNDRAISER, A, "deposit-reserve", [uintCV(DEP3_STX), uintCV(DEP3_SATS)], "(ok true)",
    [sendsStx(FUNDRAISER, DEP3_STX), sendsSats(FUNDRAISER, DEP3_SATS)]);
  snap("dpost", { fr: FUNDRAISER, c: A }, A);
  delta("deposits", "fr", "dpre", "dpost", { sats: -(DEP2_SATS + DEP3_SATS) });
  delta("deposits", "c", "dpre", "dpost", { stx: DEP1_STX + DEP3_STX, sats: DEP2_SATS + DEP3_SATS });
  status("A after 3 deposits", [`(stx u${DEP1_STX + DEP3_STX})`, `(sats u${DEP2_SATS + DEP3_SATS})`, "(claimed false)"]);
  stxSend(`DIRECT STX ${DIRECT_STX} straight to A (not a deposit)`, STX_WHALE, A, DIRECT_STX);
  satsSend(`DIRECT sBTC ${DIRECT_SATS} straight to A`, SBTC_WHALE, A, DIRECT_SATS);
  status("A holds deposits + direct sends", [`(stx u${A_STX})`, `(sats u${A_SATS})`]);

  call("ATTACK fundraiser request-reserve -> u101", FUNDRAISER, A, "request-reserve", [stringAsciiCV(D1), boolCV(true)], "(err u101)");
  call("ATTACK owner request-reserve -> u101", DEPLOYER, A, "request-reserve", [stringAsciiCV(D1), boolCV(true)], "(err u101)");
  call("ATTACK attacker request-reserve -> u101", ATTACKER, A, "request-reserve", [stringAsciiCV(D1), boolCV(true)], "(err u101)");
  call("ATTACK LAB signs proxy-request -> u101", LAB, PROXY, "proxy-request", [], "(err u101)");
  call("LAB request terms false -> u103", LAB, A, "request-reserve", [stringAsciiCV(D1), boolCV(false)], "(err u103)");
  call("LAB request empty + terms false -> u103 (terms checked first)", LAB, A, "request-reserve", [stringAsciiCV(""), boolCV(false)], "(err u103)");
  call("LAB request empty description -> u104", LAB, A, "request-reserve", [stringAsciiCV(""), boolCV(true)], "(err u104)");
  evalc("A: still no request", "(get-request)", { expect: "none" });
  call("LAB request-reserve D1 (Deny mode, no PCs: moves nothing)", LAB, A, "request-reserve", [stringAsciiCV(D1), boolCV(true)], "(ok true)", []);
  evalc("get-request = D1", "(get-request)", { expect: `(some "${D1}")` });
  call("owner release with an unrelated description -> u115", DEPLOYER, A, "release-reserve", [stringAsciiCV("something else")], "(err u115)");
  call("LAB request-reserve D2 (512 chars) replaces D1", LAB, A, "request-reserve", [stringAsciiCV(D2), boolCV(true)], "(ok true)");
  evalc("get-request = D2", "(get-request)", { expect: `(some "${D2}")` });
  call("SWAP owner release with the old D1 -> u115", DEPLOYER, A, "release-reserve", [stringAsciiCV(D1)], "(err u115)");
  call("SWAP owner release with D2 minus its last char -> u115", DEPLOYER, A, "release-reserve", [stringAsciiCV(D2.slice(0, 511))], "(err u115)");
  advance(10);
  call("ATTACK LAB release D2 -> u100", LAB, A, "release-reserve", [stringAsciiCV(D2)], "(err u100)");
  call("ATTACK fundraiser release D2 -> u100", FUNDRAISER, A, "release-reserve", [stringAsciiCV(D2)], "(err u100)");
  call("ATTACK attacker release D2 -> u100", ATTACKER, A, "release-reserve", [stringAsciiCV(D2)], "(err u100)");
  call("ATTACK owner signs proxy-release -> u100", DEPLOYER, PROXY, "proxy-release", [], "(err u100)");
  call("ATTACK owner signs proxy-release-as-contract -> u100", DEPLOYER, PROXY, "proxy-release-as-contract", [], "(err u100)");
  call("Deny mode, PC 1 uSTX short: owner release D2 -> aborted, rolled back", DEPLOYER, A, "release-reserve", [stringAsciiCV(D2)], pcAbort,
    [sendsStx(A, A_STX - 1n), sendsSats(A, A_SATS)]);
  status("A untouched after the aborted release", [`(stx u${A_STX})`, `(sats u${A_SATS})`, "(claimed false)"]);
  call("A: fundraiser recoup with a full balance before DEADLINE -> u112", FUNDRAISER, A, "recoup-reserve", [], "(err u112)");
  evalc("A: claim still none", "(get-claim)", { expect: "none" });

  const watch = { lab: LAB, oci: OCIFARSITO, owner: DEPLOYER, fr: FUNDRAISER, atk: ATTACKER, c: A };
  snap("apre", watch, A);
  call(`owner release D2: LAB gets ${A_STX} uSTX + ${A_SATS} sats (deposits + direct)`, DEPLOYER, A, "release-reserve", [stringAsciiCV(D2)], tupleOk(A_STX, A_SATS),
    [sendsStx(A, A_STX), sendsSats(A, A_SATS)]);
  snap("apost", watch, A);
  delta("release", "lab", "apre", "apost", { stx: A_STX, sats: A_SATS });
  delta("release", "c", "apre", "apost", { stx: -A_STX, sats: -A_SATS });
  delta("release", "oci", "apre", "apost", { stx: 0n, sats: 0n });
  delta("release", "owner", "apre", "apost", { sats: 0n });
  delta("release", "fr", "apre", "apost", { stx: 0n, sats: 0n });
  delta("release", "atk", "apre", "apost", { stx: 0n, sats: 0n });
  evalc("get-claim = to LAB, D2 + amounts", "(get-claim)", { capture: "claim1", expect: has(`(to ${LAB})`, `(description "${D2}")`, `(sats u${A_SATS})`, `(stx u${A_STX})`, "(burn-height u") });
  evalc("claim burn-height = this burn block", "(is-eq (get burn-height (unwrap-panic (get-claim))) burn-block-height)", { expect: "true" });
  status("A closed", ["(stx u0)", "(sats u0)", "(claimed true)"]);

  // ===== A. closed phase =====
  call("CLOSED owner release D2 again -> u106", DEPLOYER, A, "release-reserve", [stringAsciiCV(D2)], "(err u106)");
  call("CLOSED owner release D1 -> u106", DEPLOYER, A, "release-reserve", [stringAsciiCV(D1)], "(err u106)");
  call("CLOSED attacker release -> u100", ATTACKER, A, "release-reserve", [stringAsciiCV(D2)], "(err u100)");
  call("CLOSED fundraiser deposit -> u106", FUNDRAISER, A, "deposit-reserve", [uintCV(1), uintCV(0)], "(err u106)");
  call("CLOSED fundraiser deposit 0 0 -> u106 (claim checked first)", FUNDRAISER, A, "deposit-reserve", [uintCV(0), uintCV(0)], "(err u106)");
  call("CLOSED attacker deposit -> u105", ATTACKER, A, "deposit-reserve", [uintCV(1), uintCV(0)], "(err u105)");
  call("CLOSED LAB request D1 -> u106", LAB, A, "request-reserve", [stringAsciiCV(D1), boolCV(true)], "(err u106)");
  call("CLOSED LAB request terms false -> u106", LAB, A, "request-reserve", [stringAsciiCV(D1), boolCV(false)], "(err u106)");
  call("CLOSED LAB request empty -> u106", LAB, A, "request-reserve", [stringAsciiCV(""), boolCV(true)], "(err u106)");
  call("CLOSED fundraiser recoup -> u106 (released to LAB)", FUNDRAISER, A, "recoup-reserve", [], "(err u106)");
  call("CLOSED attacker recoup -> u105", ATTACKER, A, "recoup-reserve", [], "(err u105)");
  evalc("CLOSED request still D2", "(get-request)", { expect: `(some "${D2}")` });
  stxSend(`LATE direct STX ${LATE_STX} to A after the release`, STX_WHALE, A, LATE_STX);
  satsSend("LATE direct sBTC 50 sats to A after the release", SBTC_WHALE, A, 50n);
  status("A holds the late sends (no sweep in v3)", [`(stx u${LATE_STX})`, "(sats u50)", "(claimed true)"]);
  call("CLOSED owner release with a balance -> u106", DEPLOYER, A, "release-reserve", [stringAsciiCV(D2)], "(err u106)");
  evalc("CLOSED claim unchanged", "(get-claim)", { capture: "claim2" });
  equals.push(["claim never changes after the release", "claim1", "claim2"]);

  // ===== B. empty, then direct STX only =====
  call("B: LAB request D1", LAB, B, "request-reserve", [stringAsciiCV(D1), boolCV(true)], "(ok true)");
  call("B: owner release with nothing to pay -> u102", DEPLOYER, B, "release-reserve", [stringAsciiCV(D1)], "(err u102)");
  evalc("B: no claim after u102", "(get-claim)", { expect: "none", on: B });
  stxSend(`B: direct STX ${B_STX} straight to B`, STX_WHALE, B, B_STX);
  snap("bpre", { lab: LAB, c: B }, B);
  call(`B: owner release pays LAB the ${B_STX} direct uSTX only`, DEPLOYER, B, "release-reserve", [stringAsciiCV(D1)], tupleOk(B_STX, 0n), [sendsStx(B, B_STX)]);
  snap("bpost", { lab: LAB, c: B }, B);
  delta("B release", "lab", "bpre", "bpost", { stx: B_STX, sats: 0n });
  delta("B release", "c", "bpre", "bpost", { stx: -B_STX, sats: 0n });
  call("B: fundraiser deposit after release -> u106", FUNDRAISER, B, "deposit-reserve", [uintCV(1), uintCV(0)], "(err u106)");
  call("B: LAB request after release -> u106", LAB, B, "request-reserve", [stringAsciiCV(D2), boolCV(true)], "(err u106)");

  // ===== C. sBTC only =====
  call(`C: fundraiser deposits ${C_SATS} sats only`, FUNDRAISER, C, "deposit-reserve", [uintCV(0), uintCV(C_SATS)], "(ok true)", [sendsSats(FUNDRAISER, C_SATS)]);
  call("C: owner release before any request -> u107", DEPLOYER, C, "release-reserve", [stringAsciiCV(D1)], "(err u107)");
  call("C: LAB request D1", LAB, C, "request-reserve", [stringAsciiCV(D1), boolCV(true)], "(ok true)");
  snap("cpre", { lab: LAB, c: C }, C);
  call(`C: owner release pays LAB ${C_SATS} sats only`, DEPLOYER, C, "release-reserve", [stringAsciiCV(D1)], tupleOk(0n, C_SATS), [sendsSats(C, C_SATS)]);
  snap("cpost", { lab: LAB, c: C }, C);
  delta("C release", "lab", "cpre", "cpost", { stx: 0n, sats: C_SATS });
  delta("C release", "c", "cpre", "cpost", { stx: 0n, sats: -C_SATS });
  evalc("C: claim records to LAB, D1, 0 STX", "(get-claim)", { expect: has(`(to ${LAB})`, `(description "${D1}")`, `(sats u${C_SATS})`, "(stx u0)"), on: C });

  // ===== D / E / F: the deadline =====
  clockCheck("after A/B/C");
  stxSend(`fund: STX whale sends the fundraiser ${TOPUP2_STX} uSTX more`, STX_WHALE, FUNDRAISER, TOPUP2_STX);
  satsSend(`fund: sBTC whale sends the fundraiser ${TOPUP2_SATS} sats more`, SBTC_WHALE, FUNDRAISER, TOPUP2_SATS);
  call(`D: fundraiser deposits ${D_DEP_STX} uSTX + ${D_DEP_SATS} sats`, FUNDRAISER, D, "deposit-reserve", [uintCV(D_DEP_STX), uintCV(D_DEP_SATS)], "(ok true)",
    [sendsStx(FUNDRAISER, D_DEP_STX), sendsSats(FUNDRAISER, D_DEP_SATS)]);
  stxSend(`D: direct STX ${D_DIRECT_STX} straight to D`, STX_WHALE, D, D_DIRECT_STX);
  satsSend(`D: direct sBTC ${D_DIRECT_SATS} straight to D`, SBTC_WHALE, D, D_DIRECT_SATS);
  status("D funded", [`(stx u${D_STX})`, `(sats u${D_SATS})`, "(claimed false)"], D);
  call("D: fundraiser recoup long before DEADLINE -> u112", FUNDRAISER, D, "recoup-reserve", [], "(err u112)");
  call("ATTACK D: LAB recoup -> u105", LAB, D, "recoup-reserve", [], "(err u105)");
  call("ATTACK D: owner recoup -> u105", DEPLOYER, D, "recoup-reserve", [], "(err u105)");
  call("ATTACK D: attacker recoup -> u105", ATTACKER, D, "recoup-reserve", [], "(err u105)");
  stxSend(`E: direct STX ${E_STX} straight to E`, STX_WHALE, E, E_STX);
  satsSend(`E: direct sBTC ${E_SATS} straight to E`, SBTC_WHALE, E, E_SATS);
  call("E: LAB request D1 early", LAB, E, "request-reserve", [stringAsciiCV(D1), boolCV(true)], "(ok true)");

  // the last block a request can land: burn-block-height + 1008 < DEADLINE
  const LAST_REQ = DEADLINE_OFFSET - REVIEW_WINDOW - 1;
  for (let left = LAST_REQ - clock; left > 0; left -= Math.min(4000, left)) advance(Math.min(4000, left));
  clockCheck("last request block");
  evalc("burn-block-height + REVIEW_WINDOW < DEADLINE (still open)", "(< (+ burn-block-height REVIEW_WINDOW) DEADLINE)", { expect: "true", on: E });
  call("E: LAB request D2 at DEADLINE - 1009 -> ok (replaces D1)", LAB, E, "request-reserve", [stringAsciiCV(D2), boolCV(true)], "(ok true)");
  call("D: LAB request D2 at DEADLINE - 1009 -> ok", LAB, D, "request-reserve", [stringAsciiCV(D2), boolCV(true)], "(ok true)");
  evalc("E: get-request = D2", "(get-request)", { expect: `(some "${D2}")`, on: E });
  evalc("D: get-request = D2", "(get-request)", { expect: `(some "${D2}")`, on: D });
  advance(1);
  clockCheck("first late block");
  call("E: LAB request D1 at DEADLINE - 1008 -> u113", LAB, E, "request-reserve", [stringAsciiCV(D1), boolCV(true)], "(err u113)");
  call("D: LAB request D1 at DEADLINE - 1008 -> u113", LAB, D, "request-reserve", [stringAsciiCV(D1), boolCV(true)], "(err u113)");
  call("F: LAB first request at DEADLINE - 1008 -> u113", LAB, F_, "request-reserve", [stringAsciiCV(D1), boolCV(true)], "(err u113)");
  call("E: LAB late request terms false -> u103 (terms checked before the deadline)", LAB, E, "request-reserve", [stringAsciiCV(D1), boolCV(false)], "(err u103)");
  call("E: LAB late request empty -> u104 (description checked before the deadline)", LAB, E, "request-reserve", [stringAsciiCV(""), boolCV(true)], "(err u104)");
  call("ATTACK E: attacker late request -> u101", ATTACKER, E, "request-reserve", [stringAsciiCV(D1), boolCV(true)], "(err u101)");
  evalc("E: request still D2 after the late tries", "(get-request)", { expect: `(some "${D2}")`, on: E });
  evalc("F: still no request", "(get-request)", { expect: "none", on: F_ });
  call("D: fundraiser recoup in the review window -> u112", FUNDRAISER, D, "recoup-reserve", [], "(err u112)");

  advance(DEADLINE_OFFSET - 1 - clock);
  clockCheck("one block before DEADLINE");
  call("D: fundraiser recoup at DEADLINE - 1 -> u112", FUNDRAISER, D, "recoup-reserve", [], "(err u112)");
  call("F: fundraiser recoup at DEADLINE - 1 (empty) -> u112", FUNDRAISER, F_, "recoup-reserve", [], "(err u112)");
  call("E: owner release with the old D1 -> u115", DEPLOYER, E, "release-reserve", [stringAsciiCV(D1)], "(err u115)");
  snap("epre", { lab: LAB, fr: FUNDRAISER, c: E }, E);
  call(`E: owner release D2 at DEADLINE - 1: LAB gets ${E_STX} uSTX + ${E_SATS} sats`, DEPLOYER, E, "release-reserve", [stringAsciiCV(D2)], tupleOk(E_STX, E_SATS),
    [sendsStx(E, E_STX), sendsSats(E, E_SATS)], [`stx ${E_STX} ${E} -> ${LAB}`, `ft ${E_SATS} ${E} -> ${LAB}`]);
  snap("epost", { lab: LAB, fr: FUNDRAISER, c: E }, E);
  delta("E release", "lab", "epre", "epost", { stx: E_STX, sats: E_SATS });
  delta("E release", "c", "epre", "epost", { stx: -E_STX, sats: -E_SATS });
  delta("E release", "fr", "epre", "epost", { stx: 0n, sats: 0n });
  evalc("E: claim to LAB, D2, at DEADLINE - 1", "(get-claim)", { expect: has(`(to ${LAB})`, `(description "${D2}")`, `(stx u${E_STX})`, `(sats u${E_SATS})`), on: E });
  evalc("E: claim burn-height = DEADLINE - 1", "(is-eq (get burn-height (unwrap-panic (get-claim))) (- DEADLINE u1))", { expect: "true", on: E });

  advance(1);
  clockCheck("at DEADLINE");
  call("D: owner release D2 at DEADLINE (request filed in time) -> u113", DEPLOYER, D, "release-reserve", [stringAsciiCV(D2)], "(err u113)");
  call("D: owner release unrelated description at DEADLINE -> u113 (deadline before request)", DEPLOYER, D, "release-reserve", [stringAsciiCV("x")], "(err u113)");
  call("D: LAB request at DEADLINE -> u113", LAB, D, "request-reserve", [stringAsciiCV(D1), boolCV(true)], "(err u113)");
  call("E: fundraiser recoup after the release -> u106", FUNDRAISER, E, "recoup-reserve", [], "(err u106)");
  call("E: owner release again -> u106", DEPLOYER, E, "release-reserve", [stringAsciiCV(D2)], "(err u106)");
  call("ATTACK D: LAB recoup at DEADLINE -> u105", LAB, D, "recoup-reserve", [], "(err u105)");
  call("ATTACK D: owner recoup at DEADLINE -> u105", DEPLOYER, D, "recoup-reserve", [], "(err u105)");
  call("ATTACK D: attacker recoup at DEADLINE -> u105", ATTACKER, D, "recoup-reserve", [], "(err u105)");
  call("ATTACK D: STX whale recoup at DEADLINE -> u105", STX_WHALE, D, "recoup-reserve", [], "(err u105)");
  call("ATTACK D: fundraiser signs proxy-recoup -> u105", FUNDRAISER, PROXY, "proxy-recoup", [], "(err u105)");
  call("ATTACK D: fundraiser signs proxy-recoup-as-contract -> u105", FUNDRAISER, PROXY, "proxy-recoup-as-contract", [], "(err u105)");
  call("Deny mode, no PCs: fundraiser recoup -> aborted, rolled back", FUNDRAISER, D, "recoup-reserve", [], pcAbort, []);
  call("Deny mode, PC 1 sat short: fundraiser recoup -> aborted, rolled back", FUNDRAISER, D, "recoup-reserve", [], pcAbort,
    [sendsStx(D, D_STX), sendsSats(D, D_SATS - 1n)]);
  status("D untouched after the aborted recoups", [`(stx u${D_STX})`, `(sats u${D_SATS})`, "(claimed false)"], D);
  evalc("D: claim still none", "(get-claim)", { expect: "none", on: D });

  const dwatch = { lab: LAB, oci: OCIFARSITO, owner: DEPLOYER, fr: FUNDRAISER, atk: ATTACKER, c: D };
  snap("rpre", dwatch, D);
  call(`D: fundraiser recoup at DEADLINE: FUNDRAISER gets ${D_STX} uSTX + ${D_SATS} sats (deposit + direct)`, FUNDRAISER, D, "recoup-reserve", [], tupleOk(D_STX, D_SATS),
    [sendsStx(D, D_STX), sendsSats(D, D_SATS)], [`stx ${D_STX} ${D} -> ${FUNDRAISER}`, `ft ${D_SATS} ${D} -> ${FUNDRAISER}`, `event "recoup-reserve"`]);
  snap("rpost", dwatch, D);
  delta("recoup", "c", "rpre", "rpost", { stx: -D_STX, sats: -D_SATS });
  delta("recoup", "fr", "rpre", "rpost", { sats: D_SATS });
  ranges.push(["recoup: fr STX delta = recoup less its own tx fee", "rpost.fr.stx", "rpre.fr.stx", D_STX - 1_000_000n, D_STX]);
  delta("recoup", "lab", "rpre", "rpost", { stx: 0n, sats: 0n });
  delta("recoup", "oci", "rpre", "rpost", { stx: 0n, sats: 0n });
  delta("recoup", "owner", "rpre", "rpost", { stx: 0n, sats: 0n });
  delta("recoup", "atk", "rpre", "rpost", { stx: 0n, sats: 0n });
  evalc("D: get-claim = to FUNDRAISER, empty description, amounts", "(get-claim)", { capture: "claimD1",
    expect: has(`(to ${FUNDRAISER})`, `(description "")`, `(stx u${D_STX})`, `(sats u${D_SATS})`), on: D });
  evalc("D: claim burn-height = DEADLINE", "(is-eq (get burn-height (unwrap-panic (get-claim))) DEADLINE)", { expect: "true", on: D });
  status("D closed", ["(stx u0)", "(sats u0)", "(claimed true)"], D);

  call("D CLOSED: fundraiser recoup again -> u106", FUNDRAISER, D, "recoup-reserve", [], "(err u106)");
  call("D CLOSED: attacker recoup -> u105", ATTACKER, D, "recoup-reserve", [], "(err u105)");
  call("D CLOSED: fundraiser deposit -> u106", FUNDRAISER, D, "deposit-reserve", [uintCV(1), uintCV(0)], "(err u106)");
  call("D CLOSED: LAB request -> u106", LAB, D, "request-reserve", [stringAsciiCV(D1), boolCV(true)], "(err u106)");
  call("D CLOSED: owner release D2 -> u106 (claim checked before the deadline)", DEPLOYER, D, "release-reserve", [stringAsciiCV(D2)], "(err u106)");
  stxSend("D CLOSED: direct 700000 uSTX to D after the recoup", STX_WHALE, D, 700_000n);
  call("D CLOSED: fundraiser recoup with a new balance -> u106", FUNDRAISER, D, "recoup-reserve", [], "(err u106)");
  status("D keeps the late send (no sweep)", ["(stx u700000)", "(sats u0)", "(claimed true)"], D);
  evalc("D CLOSED: request still D2", "(get-request)", { expect: `(some "${D2}")`, on: D });
  evalc("D CLOSED: claim unchanged", "(get-claim)", { capture: "claimD2", on: D });
  equals.push(["D: claim never changes after the recoup", "claimD1", "claimD2"]);

  call("F: fundraiser recoup at DEADLINE with nothing -> u102", FUNDRAISER, F_, "recoup-reserve", [], "(err u102)");
  evalc("F: no claim after u102", "(get-claim)", { expect: "none", on: F_ });
  call(`F: fundraiser deposits ${Z_SATS} sats after DEADLINE -> ok`, FUNDRAISER, F_, "deposit-reserve", [uintCV(0), uintCV(Z_SATS)], "(ok true)", [sendsSats(FUNDRAISER, Z_SATS)]);
  stxSend(`F: direct STX ${Z_STX} straight to F`, STX_WHALE, F_, Z_STX);
  snap("fpre", { fr: FUNDRAISER, lab: LAB, c: F_ }, F_);
  call(`F: fundraiser recoup pays ${Z_STX} uSTX + ${Z_SATS} sats`, FUNDRAISER, F_, "recoup-reserve", [], tupleOk(Z_STX, Z_SATS),
    [sendsStx(F_, Z_STX), sendsSats(F_, Z_SATS)], [`stx ${Z_STX} ${F_} -> ${FUNDRAISER}`, `ft ${Z_SATS} ${F_} -> ${FUNDRAISER}`]);
  snap("fpost", { fr: FUNDRAISER, lab: LAB, c: F_ }, F_);
  delta("F recoup", "c", "fpre", "fpost", { stx: -Z_STX, sats: -Z_SATS });
  delta("F recoup", "fr", "fpre", "fpost", { sats: Z_SATS });
  delta("F recoup", "lab", "fpre", "fpost", { stx: 0n, sats: 0n });
  evalc("F: claim to FUNDRAISER, empty description", "(get-claim)", { expect: has(`(to ${FUNDRAISER})`, `(description "")`, `(stx u${Z_STX})`, `(sats u${Z_SATS})`), on: F_ });
  call("F CLOSED: fundraiser deposit -> u106", FUNDRAISER, F_, "deposit-reserve", [uintCV(0), uintCV(1)], "(err u106)");
  advance(5);
  evalc("clock past DEADLINE: burn-block-height - DEADLINE = 5", "(- burn-block-height DEADLINE)", { expect: "u5", on: E });
  call("F CLOSED: fundraiser recoup later -> u106", FUNDRAISER, F_, "recoup-reserve", [], "(err u106)");
  call("F CLOSED: owner release later -> u106", DEPLOYER, F_, "release-reserve", [stringAsciiCV(D1)], "(err u106)");

  evalc("proxy got nothing (STX)", stxOf(PROXY), { expect: "u0" });
  evalc("proxy got nothing (sats)", ftOf(SBTC, PROXY), { expect: "u0" });
}

// ---- decode -----------------------------------------------------------------
function decodeTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return { str: `<no tx result: ${JSON.stringify(s).slice(0, 200)}>`, events: [] };
  if ("Err" in r) return { str: `ENGINE-ERR: ${String(r.Err).slice(0, 200)}`, events: [] };
  let str;
  try { str = cvToString(deserializeCV(r.Ok.result)); } catch (e) { str = `decode-failed(${r.Ok.result})`; }
  if (r.Ok.post_condition_aborted) str = `PC-ABORT ${str} (${String(r.Ok.vm_error).slice(0, 160)})`;
  else if (r.Ok.vm_error) str = `VM-ERR ${str} (${String(r.Ok.vm_error).slice(0, 160)})`;
  const evs = (r.Ok.events ?? []).map((e) => (typeof e === "string" ? JSON.parse(e) : e)).filter((e) => e.committed !== false);
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
  console.log("=== kairan-seat-lab-ocifarsito-v3 SELF-VERIFYING stxer harness ===\n");
  API = await pickApi();
  const F = await live(FUNDRAISER);
  console.log(`API ${API}\nfundraiser live: ${F.stx} uSTX, ${F.sats} sats\n`);
  build(F);
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted ${plan.length} steps (${pcSteps.size} in Deny mode). Fetching results...\n${url}\n`);
  const res = await getSimulationResult(sessionId);
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(res, null, 1));
  const cap = {};
  let pass = 0, fail = 0;
  const fails = [];
  plan.forEach((p, i) => {
    const s = res.steps[i];
    if (p.kind === "deploy") {
      const d = decodeTx(s);
      const ok = d.str.startsWith("(ok");
      console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label} -> ${d.str}`);
      ok ? pass++ : (fail++, fails.push(p.label));
    } else if (p.kind === "tx") {
      const d = decodeTx(s);
      const missing = (p.evs ?? []).filter((w) => !d.events.some((e) => e.includes(w)));
      const ok = check(p.expect, d.str) && missing.length === 0;
      if (missing.length) console.log(`        MISSING EVENTS: ${missing.join(" | ")}`);
      console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label}\n        got ${d.str.length > 400 ? d.str.slice(0, 400) + "..." : d.str}${ok ? "" : `  EXPECTED ${typeof p.expect === "function" ? "<predicate>" : p.expect}`}`);
      for (const e of d.events) console.log(`          ev: ${e.length > 300 ? e.slice(0, 300) + "..." : e}`);
      ok ? pass++ : (fail++, fails.push(p.label));
    } else if (p.kind === "eval") {
      const v = decodeEval(s);
      if (p.capture) cap[p.capture] = v;
      if (p.expect !== undefined) {
        const ok = check(p.expect, v);
        console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label}: ${v.length > 300 ? v.slice(0, 300) + "..." : v}`);
        ok ? pass++ : (fail++, fails.push(p.label));
      }
    } else if (p.kind === "advance") {
      const ok = !!s?.Result?.AdvanceBlocks?.Ok;
      console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label}${ok ? "" : ` ${JSON.stringify(s).slice(0, 200)}`}`);
      ok ? pass++ : (fail++, fails.push(p.label));
    }
  });
  console.log("\n--- balance deltas ---");
  for (const [label, a, bk, want] of deltas) {
    const got = U(cap[a]) - U(cap[bk]);
    const ok = got === want;
    console.log(`${ok ? "PASS" : "FAIL"} ${label} = ${got} (want ${want})`);
    ok ? pass++ : (fail++, fails.push(label));
  }
  for (const [label, a, bk, lo, hi] of ranges) {
    const got = U(cap[a]) - U(cap[bk]);
    const ok = got > lo && got <= hi;
    console.log(`${ok ? "PASS" : "FAIL"} ${label} = ${got} (want (${lo}, ${hi}])`);
    ok ? pass++ : (fail++, fails.push(label));
  }
  for (const [label, x, y] of equals) {
    const ok = cap[x] !== undefined && cap[x] === cap[y];
    console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
    ok ? pass++ : (fail++, fails.push(label));
  }
  console.log(`\n=== ${pass}/${pass + fail} passed, ${fail} failed ===`);
  if (fails.length) console.log("FAILED:\n  " + fails.join("\n  "));
  console.log(`View: ${url}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
