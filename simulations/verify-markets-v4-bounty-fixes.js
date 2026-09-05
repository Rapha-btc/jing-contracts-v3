// PORTED TO markets-sbtc-stx-jing-v4 (Pyth Lazer): real signatures, ONLY the
// staleness window widened (this harness advances the clock by hours), one real
// signed Lazer update (PYTH_API_KEY) replaces the dummy VAA; feed ids u1/u45.
// Everything below is the v2 harness otherwise. Run: PYTH_API_KEY=<key> npx tsx simulations/verify-markets-v4-bounty-fixes.js
// verify-markets-v2-bounty-fixes.js
// Self-verifying stxer mainnet-fork harness for the three changes that came
// out of the aibtc audit bounty mtkrbts96d961f6fae5e on
// markets-sbtc-stx-jing-v2 (+ jing-core-v3):
//
//   B1 small-share filter at settlement, AFTER the limit filter (2989f6c):
//      a 1000 STX bid at limit u1 (out of range, never fills) plus a 1.5 STX
//      taker. Under the old close-time filter the taker was 0.15% of the
//      raw side and got rolled -> u1023. Now the whale is limit-rolled
//      first, the taker is 100% of the in-range side, and the swap fills
//      by walking the +2% ask.
//   B2 in-range whale + small taker -> u1026 ERR_TAKER_TOO_SMALL, atomic.
//      The taker is under 0.2% of the in-range side; the filter flags it
//      instead of rolling it and settlement reverts with the new error.
//   B3 the filter no longer runs at close-deposits: a 1 STX fish rests next
//      to the 1000 STX whale; public close-deposits leaves the fish in the
//      cycle (old code rolled it here). cancel-cycle after CANCEL_THRESHOLD
//      rolls the stuck cycle forward.
//   B4 price-ordered walk (9f852d4): asks resting in arrival order +2%
//      (M), +5% (A), +1% (B). A y-taker with a +5.5% limit fills B only;
//      M and A untouched. Under list order M would have been hit first.
//   B4b mirror: bids -5% (C, first) then -1% (D); an x-taker with a -5.5%
//      limit fills D only, C untouched.
//   P1..P9 parked makers (6e90025) on a second market instance whose
//      MAX_DEPOSITORS is patched to u3 (sim-only): full side + in-range
//      newcomer parks the FARTHEST out-of-range bid (map only, escrow and
//      limit kept, totals reduced); out-of-range newcomer gets the old
//      smallest bump (u1013); parked maker cannot deposit (u1027) but can
//      reprice; readmit needs a free slot (u1013) then succeeds; a parked
//      maker cancels from any phase; readmit of a non-parked principal is
//      u1028. X-side mirror: farthest out-of-range ask parked, cancel
//      refunds sBTC.
//
// Hermes is key-gated, so this runs on the REAL prices resting in
// pyth-storage-v4 with the two sim-only source patches from the v3 sim
// pattern (MAX_STALENESS loosened, both verify-and-update calls no-op'd).
// The park instance adds one more sim-only patch: MAX_DEPOSITORS u50 -> u3.
//
// Run: npx tsx simulations/verify-markets-v2-bounty-fixes.js
import fs from "node:fs";
import {
  uintCV,
  contractPrincipalCV,
  standardPrincipalCV,
  stringAsciiCV,
  bufferCV,
  trueCV,
  falseCV,
  noneCV,
  cvToString,
  cvToJSON,
  deserializeCV,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";
import {
  STX_DEPOSITOR_1,
  SBTC_DEPOSITOR_1,
  SBTC_ADDR,
  SBTC_NAME,
  SBTC_ASSET_NAME,
  SBTC_FQN,
  WSTX_ADDR,
  WSTX_NAME,
  WSTX_ASSET_NAME,
  BTC_USD_FEED_HEX,
  STX_USD_FEED_HEX,
  PYTH_STORAGE,
} from "./_setup.js";

const OWNER_PRIVKEY =
  "4444444444444444444444444444444444444444444444444444444444444444" + "01";
const DEPLOYER = getAddressFromPrivateKey(OWNER_PRIVKEY, "mainnet");
const mkAddr = (n) =>
  getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + "01", "mainnet");

const CORE = "jing-core-v3";
const MARKET = "markets-sbtc-stx-jing-v4"; // Pyth Lazer, UNPATCHED
const PARK = "markets-sbtc-stx-jing-v2-park";
const CORE_ID = `${DEPLOYER}.${CORE}`;
const CID = `${DEPLOYER}.${MARKET}`;
const PID = `${DEPLOYER}.${PARK}`;
const STACKS_NODE_API = "http://77.42.3.101/stacks-api";

const MIN_SBTC = 1000n;
const MIN_STX = 1_000_000n;
const PP = 100_000_000n;
const DF = 100n;
const PPDF = PP * DF;
const FEE = 10n;
const REB = 20n;
const BPS = 10_000n;
const HUGE = 999_999_999_999_999n;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
let DUMMY_VAA = bufferCV(Buffer.from("00", "hex")); // replaced by the real Lazer update in main()

// ---- sources + sim-only patches ----
const coreSrc = fs.readFileSync(new URL(`../contracts/${CORE}.clar`, import.meta.url), "utf8");
let mktSrc = fs.readFileSync(new URL(`../contracts/${MARKET}.clar`, import.meta.url), "utf8");
  // v4: signatures are REAL (a signed Lazer update, verified by the live
  // oracle). ONE sim-only patch remains here: MAX_STALENESS is widened,
  // because this harness advances the chain by 43 bitcoin blocks to reach
  // CANCEL_THRESHOLD and no update fetched at build time can be fresh for
  // a clock hours ahead. The 80 s window itself is proven in
  // verify-swap-router-v2-lazer.js (W10, stale fixture refused u1002).
  mktSrc = mktSrc.replace("(define-constant MAX_STALENESS u80)", "(define-constant MAX_STALENESS u999999999)");
  if (!mktSrc.includes("MAX_STALENESS u999999999")) throw new Error("staleness patch did not apply");
if (!mktSrc.includes("(define-constant MAX_DEPOSITORS u50)")) throw new Error("MAX_DEPOSITORS anchor missing");
const parkSrc = mktSrc.replace(
  "(define-constant MAX_DEPOSITORS u50)",
  "(define-constant MAX_DEPOSITORS u3)",
);

// ---- decode + assert ----
function decodeTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return "<no tx>";
  if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`;
  try {
    return cvToString(deserializeCV(r.Ok.result));
  } catch (e) {
    return `decode-failed: ${e.message}`;
  }
}
function decodeEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval>";
  if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`;
  try {
    return cvToString(deserializeCV(r.Ok));
  } catch {
    return r.Ok;
  }
}
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const okPrefix = (v) => String(v).startsWith("(ok");

let checks = 0;
let failures = 0;
function check(label, actual, want) {
  checks += 1;
  const ok = typeof want === "function" ? want(actual) : String(actual).includes(want);
  if (ok) console.log(`  ok   ${label}: ${String(actual).slice(0, 90)}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}: got "${actual}" want "${want}"`);
  }
}

async function storedPrice(feedHex) {
  const [addr, name] = PYTH_STORAGE.split(".");
  const r = await fetch(`${STACKS_NODE_API}/v2/contracts/call-read/${addr}/${name}/get-price`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sender: addr, arguments: ["0x0200000020" + feedHex] }),
  });
  const d = await r.json();
  const j = cvToJSON(deserializeCV(d.result));
  return BigInt(j.value.value.price.value);
}

async function main() {
  console.log("=== bounty-fixes SELF-VERIFYING stxer harness ===\n");
  const lz = await fetchLazerUpdate();
  DUMMY_VAA = bufferCV(Buffer.from(lz.hex, "hex"));
  const px = lz.px, py = lz.py;
  console.log(`Lazer update ${lz.hex.length / 2} bytes, ts ${new Date(lz.ts * 1000).toISOString()}, expo ${lz.expo}; market UNPATCHED`);
  const MID = (px * PP) / py;
  console.log(`deployer ${DEPLOYER}  px=${px} py=${py} mid=${MID}\n`);

  // ---- actors ----
  const W = mkAddr(11); // 1000 STX whale bid
  const T1 = mkAddr(12); // B1 small taker (fills)
  const T2 = mkAddr(13); // B2 small taker (u1026)
  const F = mkAddr(14); // 1 STX fish
  const AX = mkAddr(15); // +5% ask
  const BX = mkAddr(16); // +1% ask
  const T3 = mkAddr(17); // B4 y-taker
  const CY = mkAddr(18); // -5% bid
  const DY = mkAddr(19); // -1% bid
  const TX = mkAddr(20); // B4b x-taker
  const P1 = mkAddr(21), P2 = mkAddr(22), P3 = mkAddr(23);
  const N1 = mkAddr(24), N2 = mkAddr(25), N3 = mkAddr(26);
  const Q1 = mkAddr(27), Q2 = mkAddr(28), Q3 = mkAddr(29), N4 = mkAddr(30);
  const M = SBTC_DEPOSITOR_1; // +2% ask, rests through B1..B4

  // ---- prices ----
  const LM = (MID * 102n) / 100n; // M ask +2%
  const LA = (MID * 105n) / 100n; // A ask +5%
  const LB = (MID * 101n) / 100n; // B ask +1%
  const LT = (MID * 103n) / 100n; // B1/B2 taker +3% (reaches LM)
  const LT3 = (MID * 1055n) / 1000n; // B4 taker +5.5%
  const LC = (MID * 95n) / 100n; // C bid -5%
  const LD = (MID * 99n) / 100n; // D bid -1%
  const LTX = (MID * 945n) / 1000n; // B4b x-taker -5.5%
  const LP1 = (MID * 90n) / 100n; // parked candidate, gap 10%
  const LP3 = (MID * 95n) / 100n; // gap 5%
  const LQ1 = (MID * 110n) / 100n;
  const LQ3 = (MID * 105n) / 100n;

  // gross so that net == target after the 20 bps rebate
  const grossFor = (net) => {
    let a = (net * BPS) / (BPS - REB);
    while (a - (a * REB) / BPS < net) a += 1n;
    return a;
  };
  const NET1 = 1_500_000n; // 1.5 STX
  const A1 = grossFor(NET1);
  const NET3 = 3_000_000n; // 3 STX
  const A3 = grossFor(NET3);
  const NETX = 2000n; // sats
  const AX_AMT = grossFor(NETX);
  const W_AMT = 1_000_000_000n; // 1000 STX
  const M_AMT = 5000n;

  // B1 expected: mid clears 0 (no in-range ask), whole net walks M at LM
  const X1 = (NET1 * PPDF) / LM; // sats M sells
  const Y1 = (X1 * LM) / PPDF; // uSTX M receives gross
  const T1_SBTC_GAIN = X1 - (X1 * FEE) / BPS;
  const M_LEFT = M_AMT - X1;
  // B4 expected: 3 STX walks B at LB
  const XB = (NET3 * PPDF) / LB;
  const B_LEFT = 5000n - XB;
  // B4b expected: mid clears F's 1 STX against the taker (y binding), the
  // rest walks D at LD; the x walker leaves zero residual
  const XC = (MIN_STX * PPDF) / MID; // sats cleared at mid
  const XW = NETX - XC; // sats walked into D

  // ---- builder helpers ----
  const steps = []; // { label, kind, want, capture }
  const call = (sender, fn, args, cid = CID) => (b) =>
    b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const depositX = (sender, amount, limit, cid = CID) =>
    call(sender, "deposit-token-x", [uintCV(amount), uintCV(limit), DUMMY_VAA, sbtcTrait, sbtcAsset], cid);
  const depositY = (sender, amount, limit, cid = CID) =>
    call(sender, "deposit-token-y", [uintCV(amount), uintCV(limit), DUMMY_VAA, wstxTrait, wstxAsset], cid);
  const swap = (sender, amount, limit, depositXSide) =>
    call(sender, "swap", [uintCV(amount), uintCV(limit), DUMMY_VAA, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset, depositXSide ? trueCV() : falseCV()]);
  const cancelY = (sender, cid = CID) => call(sender, "cancel-token-y-deposit", [wstxTrait, wstxAsset], cid);
  const cancelX = (sender, cid = CID) => call(sender, "cancel-token-x-deposit", [sbtcTrait, sbtcAsset], cid);
  const setLimitY = (sender, limit, cid = CID) => call(sender, "set-token-y-limit", [uintCV(limit), DUMMY_VAA], cid);
  const readmitY = (sender, who, cid = PID) => call(sender, "readmit-token-y", [standardPrincipalCV(who), DUMMY_VAA], cid);
  const readmitX = (sender, who, cid = PID) => call(sender, "readmit-token-x", [standardPrincipalCV(who), DUMMY_VAA], cid);
  const sbtcSend = (to, amt) => (b) =>
    b.withSender(SBTC_DEPOSITOR_1).addContractCall({
      contract_id: SBTC_FQN,
      function_name: "transfer",
      function_args: [uintCV(amt), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(to), noneCV()],
    });
  const stxSend = (to, amt) => (b) => b.withSender(STX_DEPOSITOR_1).addSTXTransfer({ recipient: to, amount: amt });

  let b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); };
  const ev = (label, code, want, cid = CID) => {
    b = b.addEvalCode(cid, code);
    steps.push({ label, kind: "eval", want });
  };
  // capture an eval value for a later relative check
  const cap = (label, code, cid = CID) => {
    b = b.addEvalCode(cid, code);
    const slot = { label, kind: "eval", capture: true, value: null };
    steps.push(slot);
    return slot;
  };

  // ---- deploy both instances ----
  tx("deploy core", (b) => b.withSender(DEPLOYER).addContractDeploy({ contract_name: CORE, source_code: coreSrc }), (v) => !String(v).includes("ERR"));
  tx("deploy market (patched)", (b) => b.withSender(DEPLOYER).addContractDeploy({ contract_name: MARKET, source_code: mktSrc }), (v) => !String(v).includes("ERR"));
  tx("deploy park market (MAX u3)", (b) => b.withSender(DEPLOYER).addContractDeploy({ contract_name: PARK, source_code: parkSrc }), (v) => !String(v).includes("ERR"));
  for (const [name, cid] of [[MARKET, CID], [PARK, PID]]) {
    tx(`verify ${name} in core`, call(DEPLOYER, "set-verified-contract", [contractPrincipalCV(DEPLOYER, name)], CORE_ID), "(ok true)");
    tx(`initialize ${name}`, call(DEPLOYER, "initialize", [
      contractPrincipalCV(DEPLOYER, name),
      contractPrincipalCV(SBTC_ADDR, SBTC_NAME),
      contractPrincipalCV(WSTX_ADDR, WSTX_NAME),
      uintCV(MIN_SBTC), uintCV(MIN_STX), uintCV(1n), uintCV(45n),
    ], cid), "(ok true)");
  }

  // ---- funding ----
  for (const [who, ustx, sats] of [
    [W, 1_003_000_000, 0n],
    [T1, 3_000_000, 0n], [T2, 3_000_000, 0n], [F, 2_500_000, 0n],
    [AX, 1_000_000, 5000n], [BX, 1_000_000, 5000n],
    [T3, 5_000_000, 0n], [CY, 22_000_000, 0n], [DY, 22_000_000, 0n],
    [TX, 1_000_000, 3000n],
    [P1, 3_500_000, 0n], [P2, 3_500_000, 0n], [P3, 3_500_000, 0n],
    [N1, 3_500_000, 0n], [N2, 3_500_000, 0n], [N3, 3_500_000, 0n],
    [Q1, 1_000_000, 3000n], [Q2, 1_000_000, 3000n], [Q3, 1_000_000, 3000n], [N4, 1_000_000, 4000n],
  ]) {
    tx(`fund ${who.slice(0, 6)} stx`, stxSend(who, ustx), okPrefix);
    if (sats > 0n) tx(`fund ${who.slice(0, 6)} sbtc`, sbtcSend(who, sats), okPrefix);
  }

  // =============== B1: dead whale + small taker fills ===============
  tx("B1 W 1000 STX bid at u1 (out of range)", depositY(W, W_AMT, 1n), `(ok u${W_AMT})`);
  tx("B1 M 5000-sat ask at +2%", depositX(M, M_AMT, LM), `(ok u${M_AMT})`);
  const t1Before = cap("T1 sbtc before", `(get-balance '${T1})`, SBTC_FQN);
  tx("B1 1.5 STX swap (0.15% of raw side) -> FILLS via walk", swap(T1, A1, LT, false), okPrefix);
  const t1After = cap("T1 sbtc after", `(get-balance '${T1})`, SBTC_FQN);
  ev("B1 cycle -> u1", "(get-current-cycle)", "u1");
  ev("B1 W limit-rolled intact in u1", `(get-token-y-deposit u1 '${W})`, `u${W_AMT}`);
  ev("B1 taker residual refunded", `(get-token-y-deposit u1 '${T1})`, "u0");
  ev(`B1 M left ${M_LEFT}`, `(get-token-x-deposit u1 '${M})`, `u${M_LEFT}`);
  ev("B1 rebate pot y zeroed", "(var-get pending-rebate-y)", "u0");
  ev("B1 taker-too-small false at rest", "(var-get taker-too-small)", "false");

  // =============== B2: in-range whale + small taker -> u1026 ===============
  tx("B2 W reprices to in-range (M ask not live)", setLimitY(W, HUGE), "(ok true)");
  const escBefore = cap("escrow STX before B2", `(stx-get-balance '${CID})`);
  tx("B2 1.5 STX swap vs 1000 STX in-range side -> u1026", swap(T2, A1, LT, false), "(err u1026)");
  const escAfter = cap("escrow STX after B2", `(stx-get-balance '${CID})`);
  ev("B2 cycle unchanged", "(get-current-cycle)", "u1");
  ev("B2 W unchanged", `(get-token-y-deposit u1 '${W})`, `u${W_AMT}`);
  ev("B2 T2 has no row", `(get-token-y-deposit u1 '${T2})`, "u0");
  ev("B2 flag unwound by the revert", "(var-get taker-too-small)", "false");

  // =============== B3: no small-share roll at close-deposits ===============
  tx("B3 F 1 STX in-range bid (0.1% of side)", depositY(F, MIN_STX, HUGE), `(ok u${MIN_STX})`);
  tx("B3 public close-deposits", call(DEPLOYER, "close-deposits", []), "(ok true)");
  ev("B3 fish still in cycle after close (not rolled)", `(get-token-y-deposit u1 '${F})`, `u${MIN_STX}`);
  ev("B3 fish not moved to u2", `(get-token-y-deposit u2 '${F})`, "u0");
  ev("B3 y list still W + F", "(len (get-token-y-depositors u1))", "u2");
  b = b.addAdvanceBlocks({ bitcoin_blocks: 43, stacks_blocks_per_bitcoin: 1 });
  tx("B3 cancel-cycle after threshold", call(DEPLOYER, "cancel-cycle", []), "(ok true)");
  ev("B3 cycle -> u2", "(get-current-cycle)", "u2");
  ev("B3 fish rolled by cancel", `(get-token-y-deposit u2 '${F})`, `u${MIN_STX}`);
  ev("B3 W rolled by cancel", `(get-token-y-deposit u2 '${W})`, `u${W_AMT}`);
  ev(`B3 M rolled by cancel (${M_LEFT})`, `(get-token-x-deposit u2 '${M})`, `u${M_LEFT}`);
  tx("B3 W cancels (deposit phase)", cancelY(W), `(ok u${W_AMT})`);

  // =============== B4: price-ordered walk, asks ===============
  // list order on x: M (+2%, rolled), then A (+5%), then B (+1%)
  tx("B4 A 5000-sat ask at +5%", depositX(AX, 5000n, LA), "(ok u5000)");
  tx("B4 B 5000-sat ask at +1%", depositX(BX, 5000n, LB), "(ok u5000)");
  const t3Before = cap("T3 sbtc before", `(get-balance '${T3})`, SBTC_FQN);
  tx("B4 3 STX y-taker at +5.5% -> ok", swap(T3, A3, LT3, false), okPrefix);
  const t3After = cap("T3 sbtc after", `(get-balance '${T3})`, SBTC_FQN);
  ev("B4 cycle -> u3", "(get-current-cycle)", "u3");
  ev(`B4 B (+1%, best) filled: left ${B_LEFT}`, `(get-token-x-deposit u3 '${BX})`, `u${B_LEFT}`);
  ev(`B4 M (+2%, list-first) untouched ${M_LEFT}`, `(get-token-x-deposit u3 '${M})`, `u${M_LEFT}`);
  ev("B4 A (+5%) untouched", `(get-token-x-deposit u3 '${AX})`, "u5000");
  ev("B4 taker residual refunded", `(get-token-y-deposit u3 '${T3})`, "u0");
  ev("B4 fish rolled unfilled (mid cleared 0)", `(get-token-y-deposit u3 '${F})`, `u${MIN_STX}`);

  // =============== B4b: price-ordered walk, bids (x-taker) ===============
  tx("B4b C 20 STX bid at -5% (first)", depositY(CY, 20_000_000n, LC), "(ok u20000000)");
  tx("B4b D 20 STX bid at -1% (second)", depositY(DY, 20_000_000n, LD), "(ok u20000000)");
  tx("B4b 2000-sat x-taker at -5.5% -> ok", swap(TX, AX_AMT, LTX, true), okPrefix);
  ev("B4b cycle -> u4", "(get-current-cycle)", "u4");
  ev("B4b C (-5%, list-first) untouched", `(get-token-y-deposit u4 '${CY})`, "u20000000");
  ev("B4b D (-1%, best) filled", `(get-token-y-deposit u4 '${DY})`, (v) => {
    const left = uintOf(v);
    return left > 0n && left < 20_000_000n;
  });
  ev("B4b x-walker residual 0", `(get-token-x-deposit u4 '${TX})`, "u0");
  ev("B4b fish cleared at mid", `(get-token-y-deposit u4 '${F})`, "u0");

  // =============== P: parked makers (MAX_DEPOSITORS u3) ===============
  tx("P1 bid 2 STX at -10% (gap 10%)", depositY(P1, 2_000_000n, LP1, PID), "(ok u2000000)");
  tx("P2 bid 2 STX in range", depositY(P2, 2_000_000n, HUGE, PID), "(ok u2000000)");
  tx("P3 bid 2 STX at -5% (gap 5%)", depositY(P3, 2_000_000n, LP3, PID), "(ok u2000000)");
  ev("P side full (3)", "(len (get-token-y-depositors u0))", "u3", PID);
  tx("P N1 in-range newcomer -> parks farthest (P1)", depositY(N1, 2_000_000n, HUGE, PID), "(ok u2000000)");
  ev("P P1 parked 2 STX", `(get-token-y-parked '${P1})`, "u2000000", PID);
  ev("P P1 off the cycle", `(get-token-y-deposit u0 '${P1})`, "u0", PID);
  ev("P P3 (nearer) still live", `(get-token-y-deposit u0 '${P3})`, "u2000000", PID);
  ev("P N1 live", `(get-token-y-deposit u0 '${N1})`, "u2000000", PID);
  ev("P list still 3", "(len (get-token-y-depositors u0))", "u3", PID);
  ev("P totals exclude parked (6 STX)", "(get total-token-y (get-cycle-totals u0))", "u6000000", PID);
  ev("P P1 limit kept", `(get-token-y-limit '${P1})`, `u${LP1}`, PID);
  tx("P N2 out-of-range newcomer smaller than smallest -> u1013", depositY(N2, 1_500_000n, 1n, PID), "(err u1013)");
  tx("P P1 deposits while parked -> u1027", depositY(P1, 2_000_000n, HUGE, PID), "(err u1027)");
  tx("P P1 reprices while parked -> ok", setLimitY(P1, HUGE, PID), "(ok true)");
  ev("P P1 new limit", `(get-token-y-limit '${P1})`, `u${HUGE}`, PID);
  tx("P readmit P1 with side full -> u1013", readmitY(DEPLOYER, P1), "(err u1013)");
  tx("P P2 cancels -> slot", cancelY(P2, PID), "(ok u2000000)");
  tx("P readmit P1 (keeper) -> ok", readmitY(DEPLOYER, P1), "(ok u2000000)");
  ev("P P1 unparked", `(get-token-y-parked '${P1})`, "u0", PID);
  ev("P P1 live again", `(get-token-y-deposit u0 '${P1})`, "u2000000", PID);
  ev("P totals back to 6 STX", "(get total-token-y (get-cycle-totals u0))", "u6000000", PID);
  ev("P list 3", "(len (get-token-y-depositors u0))", "u3", PID);
  tx("P N3 in-range newcomer -> parks P3 (only out-of-range)", depositY(N3, 2_000_000n, HUGE, PID), "(ok u2000000)");
  ev("P P3 parked", `(get-token-y-parked '${P3})`, "u2000000", PID);
  const p3Before = cap("P3 stx before cancel", `(stx-get-balance '${P3})`, PID);
  tx("P P3 cancels while parked -> refund", cancelY(P3, PID), "(ok u2000000)");
  const p3After = cap("P3 stx after cancel", `(stx-get-balance '${P3})`, PID);
  ev("P P3 parked cleared", `(get-token-y-parked '${P3})`, "u0", PID);
  tx("P readmit P3 (no longer parked) -> u1028", readmitY(DEPLOYER, P3), "(err u1028)");
  tx("P readmit P1 (live, not parked) -> u1028", readmitY(DEPLOYER, P1), "(err u1028)");
  // x mirror: clear the y side first so in-range asks pass the crossing gate
  tx("P P1 cancels", cancelY(P1, PID), "(ok u2000000)");
  tx("P N1 cancels", cancelY(N1, PID), "(ok u2000000)");
  tx("P N3 cancels", cancelY(N3, PID), "(ok u2000000)");
  ev("P y side empty", "(len (get-token-y-depositors u0))", "u0", PID);
  tx("PX Q1 ask 3000 at +10% (gap 10%)", depositX(Q1, 3000n, LQ1, PID), "(ok u3000)");
  tx("PX Q2 ask 3000 in range", depositX(Q2, 3000n, 1n, PID), "(ok u3000)");
  tx("PX Q3 ask 3000 at +5% (gap 5%)", depositX(Q3, 3000n, LQ3, PID), "(ok u3000)");
  tx("PX N4 in-range newcomer -> parks Q1", depositX(N4, 3000n, 1n, PID), "(ok u3000)");
  ev("PX Q1 parked 3000", `(get-token-x-parked '${Q1})`, "u3000", PID);
  ev("PX Q3 still live", `(get-token-x-deposit u0 '${Q3})`, "u3000", PID);
  ev("PX totals exclude parked (9000)", "(get total-token-x (get-cycle-totals u0))", "u9000", PID);
  tx("PX readmit Q1 full -> u1013", readmitX(DEPLOYER, Q1), "(err u1013)");
  const q1Before = cap("Q1 sbtc before cancel", `(get-balance '${Q1})`, SBTC_FQN);
  tx("PX Q1 cancels while parked -> refund", cancelX(Q1, PID), "(ok u3000)");
  const q1After = cap("Q1 sbtc after cancel", `(get-balance '${Q1})`, SBTC_FQN);
  ev("PX Q1 parked cleared", `(get-token-x-parked '${Q1})`, "u0", PID);
  tx("PX Q2 cancels -> slot", cancelX(Q2, PID), "(ok u3000)");
  tx("PX N4 top-up (existing) needs no park", depositX(N4, 1000n, 1n, PID), "(ok u1000)");

  // ---- run ----
  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid);
  const s = res.steps;
  if (s.length !== steps.length + 1) {
    // +1 for the addAdvanceBlocks step, which also produces a result entry
    console.log(`note: ${s.length} result steps vs ${steps.length} scripted (advance-blocks accounts for one)`);
  }

  let i = 0;
  for (const st of steps) {
    // skip the advance-blocks result entry (no Transaction, no Eval)
    while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1;
    const raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]);
    i += 1;
    if (st.capture) {
      st.value = uintOf(raw);
      console.log(`  ..   ${st.label}: ${raw}`);
    } else {
      check(st.label, raw, st.want);
    }
  }

  // relative checks
  check(`B1 taker sBTC gain == ${T1_SBTC_GAIN}`, t1After.value - t1Before.value, (d) => d === T1_SBTC_GAIN);
  check("B2 escrow unchanged (atomic)", escAfter.value - escBefore.value, (d) => d === 0n);
  check(`B4 taker sBTC gain == ${XB - (XB * FEE) / BPS}`, t3After.value - t3Before.value, (d) => d === XB - (XB * FEE) / BPS);
  check("P P3 refund landed (2 STX minus fee)", p3After.value - p3Before.value, (d) => d > 1_900_000n && d <= 2_000_000n);
  check("PX Q1 refund landed (3000 sats)", q1After.value - q1Before.value, (d) => d === 3000n);

  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
