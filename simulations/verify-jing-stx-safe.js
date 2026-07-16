// verify-jing-stx-safe.js
// stxer harness for jing-stx-safe (the redeploy of jing-mm-safe-v2 targeting the
// client-whitelist market rfq-sbtc-stx-jing-v2-2) on a mainnet fork. BOTH the
// v2-2 market and jing-stx-safe are already DEPLOYED on mainnet (but not yet
// initialized/onboarded), so this runs against the LIVE contracts and performs
// the remaining setup (initialize + set-verified + whitelist + onboard) on the
// fork, then proves the DELTA vs jing-mm-safe-v2:
//   - RFQ is operable ONLY by the rfq-operator, NOT the admin (admin fix ->
//     err-unauthorised u4001) -- this FLIPS the old "admin fixes directly" test
//   - the admin kill-switch: set-rfq-enabled(false) blocks fix/fulfill
//     (err-rfq-disabled u4028); re-enabling restores them
//   - rfq-operator defaults to tx-sender (the deployer) -- no set needed
//   - the v2-2 flow through the safe: onboard, client-whitelist, MM-whitelist,
//     fix (empty allowance, 0 uSTX moved), fulfill (exact deltas)
//   - leaked-operator containment (no stx/sip010 transfer)
//
// Run: npx tsx simulations/verify-jing-stx-safe.js
import {
  uintCV, bufferCV, stringAsciiCV, standardPrincipalCV, contractPrincipalCV,
  noneCV, trueCV, falseCV, deserializeCV, cvToString, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import {
  STX_DEPOSITOR_1, SBTC_DEPOSITOR_1, SBTC_FQN, SBTC_ASSET_NAME, WSTX_FQN,
  buildRfqAuthHashHexV2, signIntent, TEST_INTENT_PRIVKEY, TEST_INTENT_PUBKEY_HEX,
} from "./_setup.js";

const STACKS_NODE_API = "http://77.42.3.101/stacks-api";
const V9 = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // deployer/operator/rfq-operator/core owner/wallet-core deployer
const FAKFUN = "SP28MP1HQDJWQAFSQJN2HBAXBVP7H7THD1W2NYZVK";
const CHAVITA = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3"; // safe owner/admin
const RANDO = "SP3C1YFP86PVM9VT0119NXH54DW9KWDVVGS571VVT";
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const CLIENT_ADMIN_PRIVKEY = "4444444444444444444444444444444444444444444444444444444444444444" + "01";
const CLIENT_ADMIN = getAddressFromPrivateKey(CLIENT_ADMIN_PRIVKEY, "mainnet");
const CLIENT = getAddressFromPrivateKey(TEST_INTENT_PRIVKEY, "mainnet");

const MARKET = "rfq-sbtc-stx-jing-v2-2";
const SAFE = "jing-stx-safe";
const CORE_ID = `${V9}.jing-core-v2`;
const MARKET_ID = `${V9}.${MARKET}`;
const SAFE_ID = `${V9}.${SAFE}`;
const WCORE_ID = `${V9}.fakfun-wallet-core`;
const marketCV = contractPrincipalCV(V9, MARKET);
const safeCV = contractPrincipalCV(V9, SAFE);

const SBTC_IN = 200_000n;
const AUTH_BIG = 10_000_000_000n;
const CHAIN = 1;
const REF_VENUE = "kraken-mid";
const BIG_THRESHOLD = 1_000_000_000_000n;

const pcv = (s) => contractPrincipalCV(s.split(".")[0], s.split(".")[1]);
const bv = (hex) => bufferCV(Buffer.from(hex, "hex"));
const balStx = (a) => `(stx-get-balance '${a})`;
const balSbtc = (a) => `(contract-call? '${SBTC_FQN} get-balance '${a})`;
const uintFrom = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");
const decodeTx = (s) => {
  const r = s?.Result?.Transaction; if (!r) return "<no tx>";
  if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed: ${e.message}`; }
};
const decodeEval = (s) => {
  const r = s?.Result?.Eval; if (!r) return "<no eval>";
  if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; }
};

// probe native price + tip from the LIVE v2-2 market (no deploy)
async function probe() {
  const pb = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  pb.addEvalCode(MARKET_ID, "(get-native-price)");
  pb.addEvalCode(MARKET_ID, "stacks-block-time");
  const sid = await pb.run();
  const res = await getSimulationResult(sid);
  const price = uintFrom(decodeEval(res.steps[0]));
  const tipTime = uintFrom(decodeEval(res.steps[1]));
  if (price <= 0n || tipTime <= 0n) throw new Error(`probe failed: price=${price} tip=${tipTime}`);
  return { price, tipTime };
}

async function main() {
  console.log("=== jing-stx-safe harness (deploys v2-2 + jing-stx-safe as SPV9K21) ===\n");
  const { price: nativePrice, tipTime } = await probe();
  const mid = (SBTC_IN * nativePrice) / 10_000_000_000n;
  const cOk = (mid * 9950n) / 10000n;
  const minOut = mid / 2n;
  const fee = (cOk * 10n) / 10000n;
  const clientReceives = cOk - fee;
  const refOk = tipTime - 30n;
  console.log(`native=${nativePrice} mid=${mid} cOk=${cOk}\n`);

  const sig = (rfqId, quotedOut) => signIntent(
    buildRfqAuthHashHexV2({
      market: marketCV, rfqId, winner: safeCV, quotedOut,
      refPrice: nativePrice, refTimestamp: refOk, refVenue: REF_VENUE, authExpiry: AUTH_BIG,
    }, CHAIN), TEST_INTENT_PRIVKEY);
  const sig0 = sig(0, cOk);
  const sig1 = sig(1, cOk);
  const sig2 = sig(2, cOk);

  const plan = [];
  const b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  const call = (label, sender, cid, fn, args, expect) => {
    b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
    plan.push({ kind: "tx", label, expect });
  };
  const evalc = (label, code, capture) => { b.addEvalCode(SAFE_ID, code); plan.push({ kind: "eval", label, capture }); };
  const advance = (n) => { b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 1 }); plan.push({ kind: "advance", label: `advance ${n}` }); };
  const fixArgs = (id, committed, quoted, sigHex) => [
    uintCV(id), uintCV(committed), uintCV(quoted), uintCV(nativePrice), uintCV(refOk),
    stringAsciiCV(REF_VENUE), uintCV(AUTH_BIG), bv(sigHex)];
  const openArgs = () => [uintCV(SBTC_IN), uintCV(minOut), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)];
  const ffSafe = (id) => [uintCV(id), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)];
  const onboardArgs = [bv(TEST_INTENT_PUBKEY_HEX), standardPrincipalCV(CHAVITA), noneCV(), uintCV(BIG_THRESHOLD), uintCV(BIG_THRESHOLD)];

  // ---- LIVE market registry + init on the fork (contracts already deployed;
  //      the market is already set-verified in core from the deploy flow, so we
  //      go straight to initialize) ----
  call("market.initialize (client-admin != operator)", V9, MARKET_ID, "initialize",
    [marketCV, pcv(SBTC_FQN), pcv(WSTX_FQN), uintCV(0), standardPrincipalCV(CLIENT_ADMIN)], null);

  // ---- LIVE safe: set-verified + whitelist + onboard on the fork ----
  call("wallet-core.set-verified(safe)", V9, WCORE_ID, "set-verified-contract", [safeCV, noneCV()], null);
  call("market.set-mm-whitelist(safe) by operator", V9, MARKET_ID, "set-mm-whitelist", [safeCV, trueCV()], "(ok true)");
  call("market.set-client-whitelist(client) by client-admin", CLIENT_ADMIN, MARKET_ID, "set-client-whitelist",
    [standardPrincipalCV(CLIENT), trueCV()], "(ok true)");
  call("onboard by FAKFUN -> ok", FAKFUN, SAFE_ID, "onboard", onboardArgs, "(ok true)");
  evalc("rfq-operator (defaults to deployer)", "(get-rfq-operator)", "OPR");
  evalc("rfq-enabled (default true)", "(get-rfq-enabled)", "ENABLED");

  // ---- fund client sBTC + safe STX ----
  call("fund client sBTC", SBTC_WHALE, SBTC_FQN, "transfer",
    [uintCV(2_000_000), standardPrincipalCV(SBTC_WHALE), standardPrincipalCV(CLIENT), noneCV()], null);
  b.addSTXTransfer({ sender: STX_DEPOSITOR_1, recipient: SAFE_ID, amount: Number(cOk + 5_000_000n) });
  plan.push({ kind: "tx", label: "fund safe STX", expect: null });

  // ============ rfq0: fix auth (admin now REJECTED) + fulfill ============
  call("client open rfq0", CLIENT, MARKET_ID, "open-rfq", openArgs(), "(ok u0)");
  call("fix-rfq by rando -> err-unauthorised", RANDO, SAFE_ID, "fix-rfq", fixArgs(0, cOk, cOk, sig0), "(err u4001)");
  call("fix-rfq by ADMIN (chavita) -> err-unauthorised (dropped)", CHAVITA, SAFE_ID, "fix-rfq", fixArgs(0, cOk, cOk, sig0), "(err u4001)");
  evalc("safe STX before fix", balStx(SAFE_ID), "S0");
  evalc("client STX before", balStx(CLIENT), "C0");
  evalc("treasury STX before", balStx(V9), "T0");
  call("fix-rfq by rfq-operator (deployer) -> ok", V9, SAFE_ID, "fix-rfq", fixArgs(0, cOk, cOk, sig0), "(ok u0)");
  evalc("safe STX after fix (unchanged, empty allowance)", balStx(SAFE_ID), "SFIX");
  evalc("safe sBTC before fulfill", balSbtc(SAFE_ID), "SB0");
  call("fulfill-rfq by operator -> ok", V9, SAFE_ID, "fulfill-rfq", ffSafe(0), `(ok u${cOk})`);
  evalc("safe STX after fulfill", balStx(SAFE_ID), "S1");
  evalc("safe sBTC after fulfill", balSbtc(SAFE_ID), "SB1");
  evalc("client STX after", balStx(CLIENT), "C1");
  evalc("treasury STX after", balStx(V9), "T1");

  // ============ admin kill-switch ============
  call("client open rfq1", CLIENT, MARKET_ID, "open-rfq", openArgs(), "(ok u1)");
  call("set-rfq-enabled(false) by rando -> err-unauthorised", RANDO, SAFE_ID, "set-rfq-enabled", [falseCV()], "(err u4001)");
  call("set-rfq-enabled(false) by ADMIN -> ok", CHAVITA, SAFE_ID, "set-rfq-enabled", [falseCV()], "(ok true)");
  evalc("rfq-enabled now false", "(get-rfq-enabled)", "OFF");
  call("fix-rfq while disabled -> err-rfq-disabled", V9, SAFE_ID, "fix-rfq", fixArgs(1, cOk, cOk, sig1), "(err u4028)");
  call("set-rfq-enabled(true) by ADMIN -> ok", CHAVITA, SAFE_ID, "set-rfq-enabled", [trueCV()], "(ok true)");
  call("fix-rfq after re-enable -> ok", V9, SAFE_ID, "fix-rfq", fixArgs(1, cOk, cOk, sig1), "(ok u1)");
  // fulfill also gated by the switch
  call("set-rfq-enabled(false) again", CHAVITA, SAFE_ID, "set-rfq-enabled", [falseCV()], "(ok true)");
  call("fulfill-rfq while disabled -> err-rfq-disabled", V9, SAFE_ID, "fulfill-rfq", ffSafe(1), "(err u4028)");
  call("set-rfq-enabled(true)", CHAVITA, SAFE_ID, "set-rfq-enabled", [trueCV()], "(ok true)");

  // ============ leaked-operator containment: operator can't transfer ============
  call("operator stx-transfer -> err-unauthorised", V9, SAFE_ID, "stx-transfer",
    [uintCV(1_000_000), standardPrincipalCV(V9), noneCV(), noneCV(), noneCV()], "(err u4001)");
  call("operator sip010-transfer -> err-unauthorised", V9, SAFE_ID, "sip010-transfer",
    [uintCV(1), standardPrincipalCV(V9), noneCV(), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME), noneCV(), noneCV()], "(err u4001)");

  // ---- run + verify ----
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted: ${url}\n`);
  const res = await getSimulationResult(sessionId);
  const cap = {};
  let pass = 0, fail = 0;
  res.steps.forEach((s, i) => {
    const p = plan[i]; if (!p) return;
    if (p.kind === "deploy") {
      const ok = !("Err" in (s?.Result?.Transaction || {}));
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${decodeTx(s)}`); ok ? pass++ : fail++;
    } else if (p.kind === "tx") {
      const got = decodeTx(s);
      const ok = p.expect === null ? (got.startsWith("(ok") || got === "<no tx>") : got === p.expect;
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${got}${ok || p.expect === null ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++;
    } else if (p.kind === "eval") {
      const v = decodeEval(s); if (p.capture) cap[p.capture] = v;
      console.log(`ℹ️  [${i}] ${p.label}: ${v}`);
    } else if (p.kind === "advance") { console.log(`⏩ [${i}] ${p.label}`); }
  });

  console.log("\n--- assertions ---");
  const assert = (label, ok, detail = "") => { console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` ${detail}` : ""}`); ok ? pass++ : fail++; };
  assert("rfq-operator defaulted to deployer", String(cap.OPR).includes(V9), `(${cap.OPR})`);
  assert("rfq-enabled default true", String(cap.ENABLED) === "true", `(${cap.ENABLED})`);
  assert("kill-switch set false", String(cap.OFF) === "false", `(${cap.OFF})`);
  assert("fix moved ZERO uSTX from safe (empty allowance)", uintFrom(cap.SFIX) === uintFrom(cap.S0), `(before=${cap.S0} after=${cap.SFIX})`);
  assert(`client STX +net delta=${uintFrom(cap.C1) - uintFrom(cap.C0)}`, uintFrom(cap.C1) - uintFrom(cap.C0) === clientReceives, `(want ${clientReceives})`);
  assert(`safe sBTC +sbtc-in delta=${uintFrom(cap.SB1) - uintFrom(cap.SB0)}`, uintFrom(cap.SB1) - uintFrom(cap.SB0) === SBTC_IN, `(want ${SBTC_IN})`);
  assert(`safe STX -fixed delta=${uintFrom(cap.S1) - uintFrom(cap.S0)}`, uintFrom(cap.S1) - uintFrom(cap.S0) === -cOk, `(want ${-cOk})`);
  assert(`treasury STX +fee delta=${uintFrom(cap.T1) - uintFrom(cap.T0)}`, uintFrom(cap.T1) - uintFrom(cap.T0) === fee, `(want ${fee})`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===\nView: ${url}`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
