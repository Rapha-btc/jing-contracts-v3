// verify-rfq-sbtc-stx-jing.js
// SELF-VERIFYING stxer mainnet-fork harness for rfq-sbtc-stx-jing (two-phase
// fix-price / fulfill RFQ, sBTC -> native STX). Mirror of the USDCx harness with
// the STX-specific bits: a TWO-feed Pyth cross-rate (BTC/USD ÷ STX/USD), native
// STX payout (no `y` trait at the call boundary), and STX balance deltas.
//
// Run: npx tsx simulations/verify-rfq-sbtc-stx-jing.js
import {
  ClarityVersion,
  uintCV,
  bufferCV,
  stringAsciiCV,
  standardPrincipalCV,
  contractPrincipalCV,
  noneCV,
  trueCV,
  falseCV,
  deserializeCV,
  cvToString,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import {
  STX_DEPOSITOR_1, SBTC_DEPOSITOR_1,
  SBTC_FQN, SBTC_ASSET_NAME, WSTX_FQN,
  BTC_USD_FEED_HEX, STX_USD_FEED_HEX,
  PYTH_STORAGE, PYTH_DECODER, WORMHOLE_CORE,
  fetchPyth, buildRfqAuthHashHex, signIntent,
  TEST_INTENT_PRIVKEY, WRONG_INTENT_PRIVKEY,
} from "./_setup.js";

// Fresh deployer/owner (see usdcx harness note): the canonical deployer already
// has jing-core on mainnet, and the live jing-core predates log-rfq-*. Deploy the
// updated jing-core + rfq under a throwaway address (becomes contract-owner).
const OWNER_PRIVKEY = "3333333333333333333333333333333333333333333333333333333333333333" + "01";
const DEPLOYER = getAddressFromPrivateKey(OWNER_PRIVKEY, "mainnet");

const MARKET = "rfq-sbtc-stx-jing";
const CID = `${DEPLOYER}.${MARKET}`;
const marketCV = contractPrincipalCV(DEPLOYER, MARKET);

const STACKS_NODE_API = "http://77.42.3.101/stacks-api";

const CLIENT = getAddressFromPrivateKey(TEST_INTENT_PRIVKEY, "mainnet");
const MM = STX_DEPOSITOR_1;              // winning MM: STX whale (2953 STX free), impersonated
const mmCV = standardPrincipalCV(MM);

const SBTC_IN = 200_000n;                // 0.002 BTC -> ~100 STX payout, well under MM's free STX
const MAX_PREMIUM_BPS = 100n;
const AUTH_BIG = 10_000_000_000n;
const CHAIN = 1;

const pcv = (s) => contractPrincipalCV(s.split(".")[0], s.split(".")[1]);
const bv = (hex) => bufferCV(Buffer.from(hex, "hex"));
const balStx = (a) => `(stx-get-balance '${a})`;
const balSbtc = (a) => `(contract-call? '${SBTC_FQN} get-balance '${a})`;

const plan = [];
const b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });

function call(label, sender, fn, args, expect) {
  b.withSender(sender).addContractCall({ contract_id: CID, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label, expect });
}
function callExt(label, sender, cid, fn, args, expect) {
  b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label, expect });
}
function evalc(label, code, capture) {
  b.addEvalCode(CID, code);
  plan.push({ kind: "eval", label, capture });
}
function advance(n) {
  b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1 });
  plan.push({ kind: "advance", label: `advance ${n} burn blocks` });
}

// fix-price for STX takes TWO VAAs (vaa-x = BTC/USD, vaa-y = STX/USD)
function fixArgs(committed, maxP, authExpiry, sigHex, vaaX, vaaY) {
  return fixArgsId(0, committed, maxP, authExpiry, sigHex, vaaX, vaaY);
}
// Same, for an explicit rfq id (the guard/multi-rfq scenarios below).
function fixArgsId(id, committed, maxP, authExpiry, sigHex, vaaX, vaaY) {
  return [uintCV(id), uintCV(committed), uintCV(maxP), uintCV(authExpiry), bv(sigHex),
    bv(vaaX), bv(vaaY), pcv(PYTH_STORAGE), pcv(PYTH_DECODER), pcv(WORMHOLE_CORE)];
}

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
const uintFrom = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");

async function main() {
  console.log("=== rfq-sbtc-stx-jing SELF-VERIFYING stxer harness ===\n");
  console.log(`client (synthetic) = ${CLIENT}`);
  console.log(`mm (winner)        = ${MM}\n`);

  // 1) Two Pyth VAAs + prices for the cross-rate.
  const btc = await fetchPyth(BTC_USD_FEED_HEX);
  const stx = await fetchPyth(STX_USD_FEED_HEX);
  const cross = (btc.price * 100_000_000n) / stx.price;   // (price-x * 1e8) / price-y
  const mid = (SBTC_IN * cross) / 10_000_000_000n;        // sbtc_in * cross / 1e10
  const cOk = (mid * 9950n) / 10000n;
  const cLow = (mid * 9800n) / 10000n;
  const cHigh = (mid * 12500n) / 10000n;
  const minOut = mid / 2n;
  const fee = (cOk * 10n) / 10000n;
  const clientReceives = cOk - fee;
  console.log(`btc=${btc.price} stx=${stx.price} cross=${cross} mid=${mid} cOk=${cOk} fee=${fee} net=${clientReceives}\n`);

  // 2) Signatures.
  const hashOk = buildRfqAuthHashHex({ market: marketCV, rfqId: 0, winner: mmCV, maxPremiumBps: MAX_PREMIUM_BPS, authExpiry: AUTH_BIG }, CHAIN);
  const sigOk = signIntent(hashOk, TEST_INTENT_PRIVKEY);
  const sigWrong = signIntent(hashOk, WRONG_INTENT_PRIVKEY);
  const hashExp = buildRfqAuthHashHex({ market: marketCV, rfqId: 0, winner: mmCV, maxPremiumBps: MAX_PREMIUM_BPS, authExpiry: 1 }, CHAIN);
  const sigExp = signIntent(hashExp, TEST_INTENT_PRIVKEY);
  // Per-rfq sigs for the guard scenarios below (the auth hash binds rfq-id).
  const sigOk2 = signIntent(buildRfqAuthHashHex({ market: marketCV, rfqId: 2, winner: mmCV, maxPremiumBps: MAX_PREMIUM_BPS, authExpiry: AUTH_BIG }, CHAIN), TEST_INTENT_PRIVKEY);
  const sigOk3 = signIntent(buildRfqAuthHashHex({ market: marketCV, rfqId: 3, winner: mmCV, maxPremiumBps: MAX_PREMIUM_BPS, authExpiry: AUTH_BIG }, CHAIN), TEST_INTENT_PRIVKEY);

  // ---- registry prelude ----
  const fs = await import("node:fs");
  const jingCoreSource = fs.readFileSync("./contracts/jing-core.clar", "utf8");
  const marketSource = fs.readFileSync(`./contracts/rfq/${MARKET}.clar`, "utf8");
  b.withSender(DEPLOYER).addContractDeploy({ contract_name: "jing-core", source_code: jingCoreSource, clarity_version: ClarityVersion.Clarity4 });
  plan.push({ kind: "deploy", label: "deploy jing-core" });
  b.withSender(DEPLOYER).addContractDeploy({ contract_name: MARKET, source_code: marketSource, clarity_version: ClarityVersion.Clarity5 });
  plan.push({ kind: "deploy", label: "deploy rfq-sbtc-stx-jing" });
  b.withSender(DEPLOYER).addContractCall({ contract_id: `${DEPLOYER}.jing-core`, function_name: "set-verified-contract", function_args: [marketCV] });
  plan.push({ kind: "tx", label: "jing-core.set-verified-contract", expect: null });
  call("initialize", DEPLOYER, "initialize",
    [marketCV, pcv(SBTC_FQN), pcv(WSTX_FQN), bv(BTC_USD_FEED_HEX), bv(STX_USD_FEED_HEX), uintCV(0)], null);

  // ---- parity check ----
  evalc("build-auth-hash parity", `(build-auth-hash u0 '${MM} u${MAX_PREMIUM_BPS} u${AUTH_BIG})`, "PARITY");

  // ---- fund the synthetic client with sBTC (enough for the extra rfqs below) ----
  callExt("fund client sBTC", SBTC_DEPOSITOR_1, SBTC_FQN, "transfer",
    [uintCV(2_000_000), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(CLIENT), noneCV()], null);

  // ===================== rfq 0: reverts then happy path =====================
  call("open rfq0", CLIENT, "open-rfq",
    [uintCV(SBTC_IN), uintCV(minOut), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], "(ok u0)");

  call("fix expired-auth -> ERR_AUTH_EXPIRED", MM, "fix-price", fixArgs(cOk, MAX_PREMIUM_BPS, 1n, sigExp, btc.vaa, stx.vaa), "(err u2008)");
  call("fix bad-sig -> ERR_BAD_AUTH", MM, "fix-price", fixArgs(cOk, MAX_PREMIUM_BPS, AUTH_BIG, sigWrong, btc.vaa, stx.vaa), "(err u2007)");
  call("fix below-floor -> ERR_PREMIUM_TOO_HIGH", MM, "fix-price", fixArgs(cLow, MAX_PREMIUM_BPS, AUTH_BIG, sigOk, btc.vaa, stx.vaa), "(err u2005)");
  call("fix above-ceiling -> ERR_ABOVE_MAX_OUT", MM, "fix-price", fixArgs(cHigh, MAX_PREMIUM_BPS, AUTH_BIG, sigOk, btc.vaa, stx.vaa), "(err u2009)");

  evalc("client STX before", balStx(CLIENT), "C_STX_0");
  evalc("mm sBTC before", balSbtc(MM), "M_SBTC_0");
  evalc("treasury STX before", balStx(DEPLOYER), "T_STX_0");

  call("fix-price valid -> ok", MM, "fix-price", fixArgs(cOk, MAX_PREMIUM_BPS, AUTH_BIG, sigOk, btc.vaa, stx.vaa), null);
  call("fulfill wrong-winner -> ERR_NOT_WINNER", DEPLOYER, "fulfill",
    [uintCV(0), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], "(err u2013)");
  call("fulfill -> ok", MM, "fulfill",
    [uintCV(0), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], null);

  evalc("client STX after", balStx(CLIENT), "C_STX_1");
  evalc("mm sBTC after", balSbtc(MM), "M_SBTC_1");
  evalc("treasury STX after", balStx(DEPLOYER), "T_STX_1");

  // ===================== rfq 1: reclaim path =====================
  call("open rfq1 (for reclaim)", CLIENT, "open-rfq",
    [uintCV(SBTC_IN), uintCV(minOut), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], "(ok u1)");
  call("reclaim before expiry -> ERR_NOT_EXPIRED", DEPLOYER, "reclaim",
    [uintCV(1), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], "(err u2004)");

  // ===== rfq 2: a valid fix, then a second fix is rejected (ERR_ALREADY_FIXED) =====
  // Must run PRE-advance: the first fix needs a fresh Pyth read. (The re-fix
  // short-circuits at the winner check, before Pyth, so it's robust either way.)
  call("open rfq2 (for already-fixed)", CLIENT, "open-rfq",
    [uintCV(SBTC_IN), uintCV(minOut), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], "(ok u2)");
  call("fix rfq2 valid -> ok", MM, "fix-price",
    fixArgsId(2, cOk, MAX_PREMIUM_BPS, AUTH_BIG, sigOk2, btc.vaa, stx.vaa), null);
  call("fix rfq2 again -> ERR_ALREADY_FIXED", MM, "fix-price",
    fixArgsId(2, cOk, MAX_PREMIUM_BPS, AUTH_BIG, sigOk2, btc.vaa, stx.vaa), "(err u2011)");

  // ===== rfq 3: committed clears the signed spread floor but is under the
  // client's absolute min-stx-out (opened == mid) -> ERR_BELOW_MIN_OUT. =====
  // Pre-advance (the revert is checked AFTER the Pyth read).
  call("open rfq3 (high min-out = mid)", CLIENT, "open-rfq",
    [uintCV(SBTC_IN), uintCV(mid), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], "(ok u3)");
  call("fix rfq3 under client min-out -> ERR_BELOW_MIN_OUT", MM, "fix-price",
    fixArgsId(3, cOk, MAX_PREMIUM_BPS, AUTH_BIG, sigOk3, btc.vaa, stx.vaa), "(err u2006)");

  advance(7);
  call("reclaim after expiry -> ok", DEPLOYER, "reclaim",
    [uintCV(1), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], `(ok u${SBTC_IN})`);

  // ===================== admin + guard reverts =====================
  // None of these need a fresh Pyth read: they revert before the oracle call
  // (auth/closed/not-found/not-fixed/paused/expired all short-circuit earlier).

  // ---- setter authorization: only the operator (DEPLOYER) may call ----
  call("set-treasury by non-op -> ERR_NOT_AUTHORIZED", CLIENT, "set-treasury",
    [standardPrincipalCV(CLIENT)], "(err u1011)");
  call("set-paused by non-op -> ERR_NOT_AUTHORIZED", CLIENT, "set-paused",
    [trueCV()], "(err u1011)");
  call("set-operator by non-op -> ERR_NOT_AUTHORIZED", CLIENT, "set-operator",
    [standardPrincipalCV(CLIENT)], "(err u1011)");
  call("set-min-sbtc-in by non-op -> ERR_NOT_AUTHORIZED", CLIENT, "set-min-sbtc-in",
    [uintCV(1)], "(err u1011)");

  // ---- double initialize ----
  call("initialize again -> ERR_ALREADY_INITIALIZED", DEPLOYER, "initialize",
    [marketCV, pcv(SBTC_FQN), pcv(WSTX_FQN), bv(BTC_USD_FEED_HEX), bv(STX_USD_FEED_HEX), uintCV(0)],
    "(err u1018)");

  // ---- unknown rfq id ----
  call("fulfill missing rfq -> ERR_RFQ_NOT_FOUND", MM, "fulfill",
    [uintCV(999), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], "(err u2001)");

  // ---- act on an already-closed rfq (rfq0 was fulfilled) ----
  call("reclaim fulfilled rfq0 -> ERR_RFQ_CLOSED", DEPLOYER, "reclaim",
    [uintCV(0), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], "(err u2002)");

  // ---- fulfill before any price is fixed ----
  call("open rfq4 (for not-fixed)", CLIENT, "open-rfq",
    [uintCV(SBTC_IN), uintCV(minOut), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], "(ok u4)");
  call("fulfill rfq4 before fix -> ERR_NOT_FIXED", MM, "fulfill",
    [uintCV(4), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], "(err u2012)");

  // ---- paused gates NEW commitments (open + fix); fix short-circuits on
  //      `paused` before everything else, so id/sig here are irrelevant ----
  call("set-paused true -> ok", DEPLOYER, "set-paused", [trueCV()], null);
  call("open while paused -> ERR_PAUSED", CLIENT, "open-rfq",
    [uintCV(SBTC_IN), uintCV(minOut), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], "(err u1010)");
  call("fix while paused -> ERR_PAUSED", MM, "fix-price",
    fixArgsId(4, cOk, MAX_PREMIUM_BPS, AUTH_BIG, sigOk, btc.vaa, stx.vaa), "(err u1010)");
  call("set-paused false -> ok", DEPLOYER, "set-paused", [falseCV()], null);

  // ---- min-sbtc-in floor + zero min-out guard (both ERR_AMOUNT_TOO_SMALL) ----
  call("set-min-sbtc-in 250000 -> ok", DEPLOYER, "set-min-sbtc-in", [uintCV(250_000)], null);
  call("open below min-sbtc-in -> ERR_AMOUNT_TOO_SMALL", CLIENT, "open-rfq",
    [uintCV(SBTC_IN), uintCV(minOut), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], "(err u1001)");
  call("set-min-sbtc-in 0 -> ok", DEPLOYER, "set-min-sbtc-in", [uintCV(0)], null);
  call("open zero min-out -> ERR_AMOUNT_TOO_SMALL", CLIENT, "open-rfq",
    [uintCV(SBTC_IN), uintCV(0), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], "(err u1001)");

  // ---- fix after open-expiry lapses -> ERR_EXPIRED (checked before the Pyth read) ----
  call("open rfq5 (for expired)", CLIENT, "open-rfq",
    [uintCV(SBTC_IN), uintCV(minOut), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], "(ok u5)");
  advance(7);
  call("fix after open-expiry -> ERR_EXPIRED", MM, "fix-price",
    fixArgsId(5, cOk, MAX_PREMIUM_BPS, AUTH_BIG, sigOk, btc.vaa, stx.vaa), "(err u2003)");

  // ---- happy-path setters (operator = DEPLOYER) ----
  call("set-treasury (op) -> ok", DEPLOYER, "set-treasury", [standardPrincipalCV(DEPLOYER)], null);
  call("set-operator (op) -> ok", DEPLOYER, "set-operator", [standardPrincipalCV(DEPLOYER)], null);

  // ===================== run + verify =====================
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted: ${url}\n`);
  const res = await getSimulationResult(sessionId);
  const steps = res.steps;
  const cap = {};
  let pass = 0, fail = 0;

  steps.forEach((s, i) => {
    const p = plan[i];
    if (!p) return;
    if (p.kind === "deploy") {
      const ok = !("Err" in (s?.Result?.Transaction || {}));
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${decodeTx(s)}`); ok ? pass++ : fail++;
    } else if (p.kind === "tx") {
      const got = decodeTx(s);
      if (p.expect === null) {
        const ok = got.startsWith("(ok");
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
  const parityOk = String(cap.PARITY).toLowerCase() === `0x${hashOk}`.toLowerCase();
  console.log(`${parityOk ? "✅" : "❌"} build-auth-hash parity (js=0x${hashOk} chain=${cap.PARITY})`); parityOk ? pass++ : fail++;

  const deltas = [
    ["client STX +net", cap.C_STX_1, cap.C_STX_0, clientReceives],
    ["mm sBTC +sbtc-in", cap.M_SBTC_1, cap.M_SBTC_0, SBTC_IN],
    ["treasury STX +fee", cap.T_STX_1, cap.T_STX_0, fee],
  ];
  for (const [label, after, before, want] of deltas) {
    const got = uintFrom(after) - uintFrom(before);
    const ok = got === want;
    console.log(`${ok ? "✅" : "❌"} ${label} delta=${got} (want ${want})`); ok ? pass++ : fail++;
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===\nView: ${url}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
