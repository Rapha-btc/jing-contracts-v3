// verify-jing-mm-safe-v2.js
// SELF-VERIFYING stxer mainnet-fork harness for the jing-mm-safe-v2 MM desk:
// a per-user passkey smart wallet that quotes the rfq-sbtc-stx-jing-v2 market
// through fix-rfq / fulfill-rfq. Unlike the market harness this runs against
// the REAL deployed contracts (rfq-sbtc-stx-jing-v2, jing-core-v2,
// fakfun-wallet-core, canonical jing-mm-safe-v2) -- the per-user safe source
// is fetched from the chain at runtime, so the register-wallet hash check is
// exercised byte-exact, and the safe's hardcoded market/canonical refs point
// at what is actually live.
//
// Proves, end to end on the fork:
//   1. onboard gate: only FAKFUN-DEPLOYER, only once; register-wallet
//      hash-matches the canonical and whitelists the user copy
//   2. fix-rfq auth: admins + rfq-operator only; rotation is admin-only
//   3. fix-rfq moves NO funds (empty as-contract? allowance): safe STX
//      balance is bit-identical before/after a successful fix
//   4. fulfill-rfq allowance = exactly the on-chain fixed-stx-out: client
//      receives net, treasury the fee, safe swaps STX for the escrowed sBTC
//   5. leaked rfq-operator containment: the operator key can fix and fulfill
//      (bounded by the client-signed quote) but cannot stx-transfer,
//      sip010-transfer, or rotate itself
//   6. safe-fixed-but-walked: client reclaims from the market after expiry
//      even when the winning safe never fulfills
//
// Run: npx tsx simulations/verify-jing-mm-safe-v2.js
import {
  uintCV,
  bufferCV,
  stringAsciiCV,
  standardPrincipalCV,
  contractPrincipalCV,
  noneCV,
  trueCV,
  someCV,
  deserializeCV,
  cvToString,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import {
  STX_DEPOSITOR_1, SBTC_DEPOSITOR_1,
  SBTC_FQN, SBTC_ASSET_NAME,
  buildRfqAuthHashHexV2, signIntent,
  TEST_INTENT_PRIVKEY, TEST_INTENT_PUBKEY_HEX,
} from "./_setup.js";

const STACKS_NODE_API = "http://77.42.3.101/stacks-api";

const V9 = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // market operator + treasury + canonical deployer
const FAKFUN = "SP28MP1HQDJWQAFSQJN2HBAXBVP7H7THD1W2NYZVK"; // FAKFUN-DEPLOYER: deploys + onboards user safes
const MARKET_CID = `${V9}.rfq-sbtc-stx-jing-v2`;
const WCORE_CID = `${V9}.fakfun-wallet-core`;
const CANONICAL = `${V9}.jing-mm-safe-v2`;

const SAFE_NAME = "chavita-jing-safe";
const SAFE_CID = `${FAKFUN}.${SAFE_NAME}`;
const safeCV = contractPrincipalCV(FAKFUN, SAFE_NAME);

const CHAVITA = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3"; // safe owner/admin
const OPKEY = "SP2QVKZ2GWP97TW4RNCT8TN65JRJPVAKERHYSS13E";   // rfq-operator hot key
const RANDO = "SP3C1YFP86PVM9VT0119NXH54DW9KWDVVGS571VVT";   // unauthorized
const CLIENT = getAddressFromPrivateKey(TEST_INTENT_PRIVKEY, "mainnet");

const SBTC_IN = 200_000n;
const AUTH_BIG = 10_000_000_000n;
const CHAIN = 1;
const REF_VENUE = "kraken-mid";
const BIG_THRESHOLD = 1_000_000_000_000n; // outgoing-transfer thresholds far above test amounts

const pcv = (s) => contractPrincipalCV(s.split(".")[0], s.split(".")[1]);
const bv = (hex) => bufferCV(Buffer.from(hex, "hex"));
const balStx = (a) => `(stx-get-balance '${a})`;
const balSbtc = (a) => `(contract-call? '${SBTC_FQN} get-balance '${a})`;
const uintFrom = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");

function decodeTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return "<no tx>";
  if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed: ${e.message}`; }
}
function decodeEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval>";
  if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; }
}

// Byte-exact canonical source from the chain: the register-wallet hash check
// compares contract-hash? of the user copy against the canonical's verified
// hash, so the copy MUST be the deployed bytes, not the commented repo file.
async function fetchCanonicalSource() {
  const r = await fetch(`${STACKS_NODE_API}/v2/contracts/source/${V9}/jing-mm-safe-v2?proof=0`);
  if (!r.ok) throw new Error(`source fetch failed: ${r.status}`);
  return (await r.json()).source;
}

// ---------- phase 1: probe native price, tip time, next rfq id ----------
async function probe() {
  const pb = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  pb.addEvalCode(MARKET_CID, "(get-native-price)");
  pb.addEvalCode(MARKET_CID, "stacks-block-time");
  pb.addEvalCode(MARKET_CID, "(get-next-rfq-id)");
  const sid = await pb.run();
  const res = await getSimulationResult(sid);
  const price = uintFrom(decodeEval(res.steps[0]));
  const tipTime = uintFrom(decodeEval(res.steps[1]));
  const nextId = uintFrom(decodeEval(res.steps[2]));
  if (price <= 0n || tipTime <= 0n || nextId < 0n)
    throw new Error(`probe failed: price=${price} tipTime=${tipTime} nextId=${nextId}`);
  return { price, tipTime, nextId };
}

async function main() {
  console.log("=== jing-mm-safe-v2 SELF-VERIFYING stxer harness (real deployed market/core) ===\n");
  console.log(`user safe   = ${SAFE_CID}`);
  console.log(`owner/admin = ${CHAVITA}`);
  console.log(`rfq-op key  = ${OPKEY}`);
  console.log(`client      = ${CLIENT}\n`);

  const safeSrc = await fetchCanonicalSource();
  console.log(`canonical source fetched: ${safeSrc.length} bytes\n`);

  const { price: nativePrice, tipTime, nextId } = await probe();
  const RFQ0 = nextId, RFQ1 = nextId + 1n, RFQ2 = nextId + 2n;
  console.log(`probe: native price=${nativePrice}, tip time=${tipTime}, next rfq id=u${nextId}\n`);

  const mid = (SBTC_IN * nativePrice) / 10_000_000_000n;   // uSTX
  const cOk = (mid * 9950n) / 10000n;                      // 0.5% under mid, in-band
  const minOut = mid / 2n;
  const fee = (cOk * 10n) / 10000n;
  const clientReceives = cOk - fee;
  const refOk = tipTime - 30n;
  console.log(`mid=${mid} cOk=${cOk} fee=${fee} net=${clientReceives}\n`);

  // Client-signed quotes: winner = the USER SAFE contract principal (market
  // sees tx-sender = the safe inside the safe's as-contract? frame).
  const sig = (rfqId, quotedOut) => signIntent(
    buildRfqAuthHashHexV2({
      market: pcv(MARKET_CID), rfqId, winner: safeCV, quotedOut,
      refPrice: nativePrice, refTimestamp: refOk, refVenue: REF_VENUE,
      authExpiry: AUTH_BIG,
    }, CHAIN),
    TEST_INTENT_PRIVKEY
  );
  const hashOk = buildRfqAuthHashHexV2({
    market: pcv(MARKET_CID), rfqId: RFQ0, winner: safeCV, quotedOut: cOk,
    refPrice: nativePrice, refTimestamp: refOk, refVenue: REF_VENUE,
    authExpiry: AUTH_BIG,
  }, CHAIN);
  const sig0 = signIntent(hashOk, TEST_INTENT_PRIVKEY);
  const sig2 = sig(RFQ2, cOk);

  // ---------- build the main run ----------
  const plan = [];
  const b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  function call(label, sender, cid, fn, args, expect) {
    b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
    plan.push({ kind: "tx", label, expect });
  }
  function evalc(label, code, capture) {
    b.addEvalCode(MARKET_CID, code);
    plan.push({ kind: "eval", label, capture });
  }
  function advance(n) {
    b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 1 });
    plan.push({ kind: "advance", label: `advance ${n} burn blocks` });
  }
  // safe fix-rfq / market fix-price share the 8-arg v2 shape
  const fixArgs = (id, committed, quoted, sigHex) => [
    uintCV(id), uintCV(committed), uintCV(quoted),
    uintCV(nativePrice), uintCV(refOk), stringAsciiCV(REF_VENUE),
    uintCV(AUTH_BIG), bv(sigHex)];
  const openArgs = () => [uintCV(SBTC_IN), uintCV(minOut), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)];
  const ffSafeArgs = (id) => [uintCV(id), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)];
  const onboardArgs = [
    bv(TEST_INTENT_PUBKEY_HEX), standardPrincipalCV(CHAVITA), noneCV(),
    uintCV(BIG_THRESHOLD), uintCV(BIG_THRESHOLD)];

  // ---- deploy the per-user copy (byte-exact canonical source) ----
  b.withSender(FAKFUN).addContractDeploy({ contract_name: SAFE_NAME, source_code: safeSrc });
  plan.push({ kind: "deploy", label: `deploy ${SAFE_NAME} (byte-exact canonical copy)` });

  // ---- onboard gate ----
  call("onboard by non-fakfun-deployer -> err-unauthorised", RANDO, SAFE_CID, "onboard", onboardArgs, "(err u4001)");
  call("fix-rfq pre-onboard by rando -> err-unauthorised", RANDO, SAFE_CID, "fix-rfq",
    fixArgs(RFQ0, cOk, cOk, sig0), "(err u4001)");
  call("onboard by FAKFUN-DEPLOYER -> ok (registers vs canonical)", FAKFUN, SAFE_CID, "onboard",
    onboardArgs, "(ok true)");
  evalc("wallet-core is-whitelisted(user safe)",
    `(contract-call? '${WCORE_CID} is-whitelisted '${SAFE_CID})`, "REG");
  call("onboard again -> err-unauthorised", FAKFUN, SAFE_CID, "onboard", onboardArgs, "(err u4001)");

  // ---- MM whitelist: the USER SAFE principal is the mm the market sees ----
  call("fix-rfq before market whitelist -> ERR_RFQ_NOT_FOUND (no rfq yet)", CHAVITA, SAFE_CID, "fix-rfq",
    fixArgs(999_999n, cOk, cOk, sig0), "(err u2001)");
  call("set-mm-whitelist(user safe) by market operator -> ok", V9, MARKET_CID, "set-mm-whitelist",
    [safeCV, trueCV()], "(ok true)");
  evalc("market is-whitelisted-mm(user safe)", `(is-whitelisted-mm '${SAFE_CID})`, "WL");

  // ---- parity: on-chain build-auth-hash with a CONTRACT winner == JS mirror ----
  evalc("build-auth-hash parity (contract-principal winner)",
    `(build-auth-hash u${RFQ0} '${SAFE_CID} u${cOk} u${nativePrice} u${refOk} "${REF_VENUE}" u${AUTH_BIG})`,
    "PARITY");

  // ---- fund client sBTC + safe STX ----
  call("fund client sBTC", SBTC_DEPOSITOR_1, SBTC_FQN, "transfer",
    [uintCV(2_000_000), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(CLIENT), noneCV()], null);
  b.addSTXTransfer({ sender: STX_DEPOSITOR_1, recipient: SAFE_CID, amount: Number(cOk + 5_000_000n) });
  plan.push({ kind: "tx", label: "fund safe STX (cOk + 5 STX buffer)", expect: null });

  // ============ rfq0: full flow through the safe ============
  call("client open rfq0", CLIENT, MARKET_CID, "open-rfq", openArgs(), `(ok u${RFQ0})`);

  call("fix-rfq by rando -> err-unauthorised", RANDO, SAFE_CID, "fix-rfq", fixArgs(RFQ0, cOk, cOk, sig0), "(err u4001)");
  call("fix-rfq by client -> err-unauthorised", CLIENT, SAFE_CID, "fix-rfq", fixArgs(RFQ0, cOk, cOk, sig0), "(err u4001)");
  call("set-rfq-operator by rando -> err-unauthorised", RANDO, SAFE_CID, "set-rfq-operator",
    [standardPrincipalCV(OPKEY)], "(err u4001)");
  call("set-rfq-operator by op-key itself (pre-grant) -> err-unauthorised", OPKEY, SAFE_CID, "set-rfq-operator",
    [standardPrincipalCV(OPKEY)], "(err u4001)");
  call("set-rfq-operator by admin -> ok", CHAVITA, SAFE_CID, "set-rfq-operator",
    [standardPrincipalCV(OPKEY)], "(ok true)");
  evalc("get-rfq-operator", `(contract-call? '${SAFE_CID} get-rfq-operator)`, "OPR");

  evalc("safe STX before fix", balStx(SAFE_CID), "S_STX_0");
  evalc("safe sBTC before", balSbtc(SAFE_CID), "S_SBTC_0");
  evalc("client STX before", balStx(CLIENT), "C_STX_0");
  evalc("treasury STX before", balStx(V9), "T_STX_0");

  call("fix-rfq by rfq-operator -> ok (empty allowance)", OPKEY, SAFE_CID, "fix-rfq",
    fixArgs(RFQ0, cOk, cOk, sig0), `(ok u${RFQ0})`);
  evalc("safe STX after fix (must be unchanged)", balStx(SAFE_CID), "S_STX_FIX");
  evalc("market rfq0 state", `(get-rfq u${RFQ0})`, "RFQ_STATE");
  call("fix-rfq again -> market ERR_ALREADY_FIXED propagates", OPKEY, SAFE_CID, "fix-rfq",
    fixArgs(RFQ0, cOk, cOk, sig0), "(err u2011)");

  call("fulfill-rfq by rando -> err-unauthorised", RANDO, SAFE_CID, "fulfill-rfq", ffSafeArgs(RFQ0), "(err u4001)");
  call("fulfill-rfq missing id -> err-rfq-not-found", OPKEY, SAFE_CID, "fulfill-rfq", ffSafeArgs(999_999n), "(err u4026)");
  call("client open rfq1", CLIENT, MARKET_CID, "open-rfq", openArgs(), `(ok u${RFQ1})`);
  call("fulfill-rfq unfixed rfq1 -> err-rfq-not-fixed", OPKEY, SAFE_CID, "fulfill-rfq", ffSafeArgs(RFQ1), "(err u4027)");

  call("fulfill-rfq by rfq-operator -> ok", OPKEY, SAFE_CID, "fulfill-rfq", ffSafeArgs(RFQ0), `(ok u${cOk})`);

  evalc("safe STX after fulfill", balStx(SAFE_CID), "S_STX_1");
  evalc("safe sBTC after fulfill", balSbtc(SAFE_CID), "S_SBTC_1");
  evalc("client STX after fulfill", balStx(CLIENT), "C_STX_1");
  evalc("treasury STX after fulfill", balStx(V9), "T_STX_1");

  // ============ leaked rfq-operator containment ============
  call("op-key stx-transfer -> err-unauthorised", OPKEY, SAFE_CID, "stx-transfer",
    [uintCV(1_000_000), standardPrincipalCV(OPKEY), noneCV(), noneCV(), noneCV()], "(err u4001)");
  call("op-key sip010-transfer (safe's sBTC) -> err-unauthorised", OPKEY, SAFE_CID, "sip010-transfer",
    [uintCV(SBTC_IN), standardPrincipalCV(OPKEY), noneCV(), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME),
      noneCV(), noneCV()], "(err u4001)");
  call("op-key rotate rfq-operator -> err-unauthorised", OPKEY, SAFE_CID, "set-rfq-operator",
    [standardPrincipalCV(RANDO)], "(err u4001)");
  // owner keeps plain-principal control (passkey path not needed for admins)
  call("admin stx-transfer 1 STX out -> ok", CHAVITA, SAFE_CID, "stx-transfer",
    [uintCV(1_000_000), standardPrincipalCV(CHAVITA), noneCV(), noneCV(), noneCV()], "(ok true)");

  // ============ rfq2: admin fixes directly; safe walks; client reclaims ============
  call("client open rfq2", CLIENT, MARKET_CID, "open-rfq", openArgs(), `(ok u${RFQ2})`);
  call("fix-rfq by admin (owner is also rfq-authorized) -> ok", CHAVITA, SAFE_CID, "fix-rfq",
    fixArgs(RFQ2, cOk, cOk, sig2), `(ok u${RFQ2})`);

  advance(7);
  call("reclaim unfixed rfq1 after expiry -> ok", RANDO, MARKET_CID, "reclaim",
    [uintCV(RFQ1), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], `(ok u${SBTC_IN})`);
  call("reclaim safe-FIXED-but-walked rfq2 -> ok (client made whole)", RANDO, MARKET_CID, "reclaim",
    [uintCV(RFQ2), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], `(ok u${SBTC_IN})`);
  evalc("market sBTC after full drain", balSbtc(MARKET_CID), "MKT_SBTC");

  // ============ run + verify ============
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted: ${url}\n`);
  const res = await getSimulationResult(sessionId);
  const cap = {};
  let pass = 0, fail = 0;

  res.steps.forEach((s, i) => {
    const p = plan[i];
    if (!p) return;
    if (p.kind === "deploy") {
      const ok = !("Err" in (s?.Result?.Transaction || {}));
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${decodeTx(s)}`); ok ? pass++ : fail++;
    } else if (p.kind === "tx") {
      const got = decodeTx(s);
      if (p.expect === null) {
        const ok = got.startsWith("(ok") || got === "<no tx>" || got === "true";
        console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${got}`); ok ? pass++ : fail++;
      } else {
        const ok = got === p.expect;
        console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${got}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++;
      }
    } else if (p.kind === "eval") {
      const v = decodeEval(s);
      if (p.capture) cap[p.capture] = v;
      console.log(`ℹ️  [${i}] ${p.label}: ${v}`);
    } else if (p.kind === "advance") {
      console.log(`⏩ [${i}] ${p.label}`);
    }
  });

  console.log("\n--- assertions ---");
  const assert = (label, ok, detail = "") => {
    console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` ${detail}` : ""}`); ok ? pass++ : fail++;
  };

  assert("register-wallet whitelisted the user copy", String(cap.REG) === "true", `(${cap.REG})`);
  assert("market whitelisted the user safe as MM", String(cap.WL) === "true", `(${cap.WL})`);
  assert("build-auth-hash parity (contract winner)",
    String(cap.PARITY).toLowerCase() === `0x${hashOk}`.toLowerCase(),
    `(js=0x${hashOk} chain=${cap.PARITY})`);
  assert("rfq-operator rotated to op-key", String(cap.OPR).includes(OPKEY), `(${cap.OPR})`);
  assert("fix-rfq moved ZERO uSTX out of the safe (empty allowance)",
    uintFrom(cap.S_STX_FIX) === uintFrom(cap.S_STX_0),
    `(before=${cap.S_STX_0} after-fix=${cap.S_STX_FIX})`);
  assert("market recorded the safe as winner", String(cap.RFQ_STATE).includes(SAFE_CID), `(${cap.RFQ_STATE})`);

  const deltas = [
    ["client STX +net", cap.C_STX_1, cap.C_STX_0, clientReceives],
    ["safe sBTC +sbtc-in", cap.S_SBTC_1, cap.S_SBTC_0, SBTC_IN],
    ["safe STX -fixed-stx-out", cap.S_STX_1, cap.S_STX_0, -cOk],
    ["treasury STX +fee", cap.T_STX_1, cap.T_STX_0, fee],
  ];
  for (const [label, after, before, want] of deltas) {
    const got = uintFrom(after) - uintFrom(before);
    assert(`${label} delta=${got}`, got === want, `(want ${want})`);
  }
  assert("no sBTC stuck in market after reclaims", uintFrom(cap.MKT_SBTC) === 0n, `(${cap.MKT_SBTC})`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===\nView: ${url}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
