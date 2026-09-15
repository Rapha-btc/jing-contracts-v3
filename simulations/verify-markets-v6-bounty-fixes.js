// PORTED TO markets-sbtc-stx-jing-v6 + jing-core-v5 (pegged orders): every
// limit-taking call passes `none` in the new spread-bps slot, nothing else
// changed. Generated from verify-markets-v4-bounty-fixes.js.
// PORTED TO markets-sbtc-stx-jing-v4 (Pyth Lazer): real signatures, ONLY the
// staleness window widened (this harness advances the clock by hours), one real
// signed Lazer update (PYTH_API_KEY) replaces the dummy VAA; feed ids u1/u45.
// Everything below is the v2 harness otherwise. Run: PYTH_API_KEY=<key> npx tsx simulations/verify-markets-v6-bounty-fixes.js
//
// REWRITTEN for 27e6f43 / aa5d4bf (phase machinery removed, cancel-cycle
// removed, error codes u1001..u1025): the market binds .jing-core-v5, so
// core-v4 is deployed here; the source is read with comment lines stripped
// (>80KB raw). There is no close and no phase any more; settle-with-refresh
// is the public keeper entry, so B3 no longer scripts a public close nor a
// cancel-cycle: see B3 below. Cycle numbers from B4 on shift down by one
// (no cancel roll).
//
// verify-markets-v2-bounty-fixes.js
// Self-verifying stxer mainnet-fork harness for the three changes that came
// out of the aibtc audit bounty mtkrbts96d961f6fae5e on
// markets-sbtc-stx-jing-v2 (+ jing-core-v3):
//
//   B1 small-share filter at settlement, AFTER the limit filter (2989f6c):
//      a 1000 STX bid at limit u1 (out of range, never fills) plus a 1.5 STX
//      taker. Under the old close-time filter the taker was 0.15% of the
//      raw side and got rolled -> u1017. Now the whale is limit-rolled
//      first, the taker is 100% of the in-range side, and the swap fills
//      by walking the +2% ask.
//   B2 in-range whale + small taker -> u1020 ERR_TAKER_TOO_SMALL, atomic.
//      The taker is under 0.2% of the in-range side; the filter flags it
//      instead of rolling it and settlement reverts with the new error.
//   B3 the filter never rolls the fish on its own: a 1 STX fish rests next
//      to the 1000 STX whale; an outsider (and the deployer) calling
//      close-deposits is REFUSED (no such function since aa5d4bf) and the
//      fish is untouched; settle-with-refresh on this book (no ask in range
//      at the mid) dies u1009 atomically: fish and whale still in cycle u1,
//      y list still 2. The whale then cancels at will (book always open).
//      (Was: public close-deposits ok -> fish not rolled -> cancel-cycle
//      after CANCEL_THRESHOLD rolled the stuck cycle to u2 -> whale cancel.
//      Both entry points are gone; nothing can be stuck between txs, so the
//      book stays in cycle u1 and B4/B4b settle into u2/u3 instead of u3/u4.)
//   B4 price-ordered walk (9f852d4): asks resting in arrival order +2%
//      (M), +5% (A), +1% (B). A y-taker with a +5.5% limit fills B only;
//      M and A untouched. Under list order M would have been hit first.
//   B4b mirror: bids -5% (C, first) then -1% (D); an x-taker with a -5.5%
//      limit fills D only, C untouched.
//   P1..P9 parked makers (6e90025) on a second market instance whose
//      MAX_DEPOSITORS is patched to u3 (sim-only): full side + in-range
//      newcomer parks the FARTHEST out-of-range bid (map only, escrow and
//      limit kept, totals reduced); out-of-range newcomer gets the old
//      smallest bump (u1010); a parked maker deposits straight back (v6:
//      free slot or bump on the combined size) and can
//      reprice; readmit needs a free slot (u1010) then succeeds; a parked
//      maker cancels from any phase; readmit of a non-parked principal is
//      u1022. X-side mirror: farthest out-of-range ask parked, cancel
//      refunds sBTC.
//
// Sim-only source patches: MAX_STALENESS loosened (one Lazer update for the
// whole run); the park instance adds MAX_DEPOSITORS u50 -> u3.
//
// Run: PYTH_API_KEY=<key> npx tsx simulations/verify-markets-v6-bounty-fixes.js
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
  someCV,
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
// DEPLOYED=1: run against the MAINNET deployments at chavita
// (markets-sbtc-stx-jingswap = v4, swap-router-sbtc-stx-jingswap = router v2)
// and the live jing-core-v3: nothing is deployed except test-only copies;
// verify + initialize run on the fork as chavita (mainnet still has to).
const DEPLOYED = process.env.DEPLOYED === "1";
const DEPLOYER = DEPLOYED ? "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22" : (getAddressFromPrivateKey(OWNER_PRIVKEY, "mainnet"));
const mkAddr = (n) =>
  getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + "01", "mainnet");

const CORE = "jing-core-v5"; // the v4 market binds .jing-core-v5
const MARKET_FILE = "markets-sbtc-stx-jing-v6"; // Pyth Lazer, UNPATCHED (the local source)
// This harness advances the clock by hours, which the live 80 s staleness
// window cannot survive, so in DEPLOYED mode it runs a test copy of the
// LIVE bytes (fetched from chain, only MAX_STALENESS widened) deployed under
// a test name; the deployed bytes are otherwise exercised as is.
const MARKET_LIVE = "markets-sbtc-stx-jingswap";
const MARKET = DEPLOYED ? `${MARKET_LIVE}-clock` : MARKET_FILE;
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
// the v4 market source is >80KB with comment lines: strip them for the deploy
const stripComments = (src) => src.split("\n").filter((l) => !/^\s*;;/.test(l)).join("\n");
const coreSrc = fs.readFileSync(new URL(`../contracts/${CORE}.clar`, import.meta.url), "utf8");
let mktSrc = stripComments(fs.readFileSync(new URL(`../contracts/${MARKET_FILE}.clar`, import.meta.url), "utf8"));
if (!mktSrc.includes("(contract-call? .jing-core-v5")) throw new Error("market source does not bind .jing-core-v5");
if (DEPLOYED) {
  const r = await fetch(`${STACKS_NODE_API}/v2/contracts/source/SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22/${MARKET_LIVE}?proof=0`);
  mktSrc = (await r.json()).source;
  console.log(`DEPLOYED: clock-test copy ${MARKET} built from the live ${MARKET_LIVE} bytes (${mktSrc.length} chars), MAX_STALENESS widened only`);
}
  // v4: signatures are REAL (a signed Lazer update, verified by the live
  // oracle). ONE sim-only patch remains here: MAX_STALENESS is widened, so
  // the single update fetched at build time stays valid for the whole run
  // (this harness no longer advances the clock: cancel-cycle and its
  // CANCEL_THRESHOLD are gone). The 80 s window itself is proven in
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
// a call to a private function: the engine refuses it (rendered "(err none)"
// or an ENGINE-ERR string by the decoders above)
const refused = (v) => v === "(err none)" || String(v).includes("ENGINE-ERR");

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

const ladderSrc = fs.readFileSync(new URL("../contracts/jing-ladder.clar", import.meta.url), "utf8"); // the market asks the ladder who holds a band seat: deploy it first
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
  const T2 = mkAddr(13); // B2 small taker (u1020)
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
    call(sender, "deposit-token-x", [uintCV(amount), uintCV(limit), noneCV(), DUMMY_VAA, sbtcTrait, sbtcAsset], cid);
  const depositY = (sender, amount, limit, cid = CID) =>
    call(sender, "deposit-token-y", [uintCV(amount), uintCV(limit), noneCV(), DUMMY_VAA, wstxTrait, wstxAsset], cid);
  const depositYPeg = (sender, amount, cap, spread, cid = CID) =>
    call(sender, "deposit-token-y", [uintCV(amount), uintCV(cap), someCV(uintCV(spread)), DUMMY_VAA, wstxTrait, wstxAsset], cid);
  const depositXPeg = (sender, amount, floor, spread, cid = CID) =>
    call(sender, "deposit-token-x", [uintCV(amount), uintCV(floor), someCV(uintCV(spread)), DUMMY_VAA, sbtcTrait, sbtcAsset], cid);
  const swap = (sender, amount, limit, depositXSide, cid = CID) =>
    call(sender, "swap", [uintCV(amount), uintCV(limit), DUMMY_VAA, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset, depositXSide ? trueCV() : falseCV()], cid);
  const cancelY = (sender, cid = CID) => call(sender, "cancel-token-y-deposit", [wstxTrait, wstxAsset], cid);
  const cancelX = (sender, cid = CID) => call(sender, "cancel-token-x-deposit", [sbtcTrait, sbtcAsset], cid);
  const setLimitY = (sender, limit, cid = CID) => call(sender, "set-token-y-limit", [uintCV(limit), noneCV(), DUMMY_VAA], cid);
  const settle = (sender, cid = CID) =>
    call(sender, "settle-with-refresh", [DUMMY_VAA, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset], cid);
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
  if (DEPLOYED) { const origDeploy = b.addContractDeploy.bind(b); b.addContractDeploy = (p) => (p.contract_name === CORE) ? b : origDeploy(p); }
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
  if (!DEPLOYED) tx("deploy core", (b) => b.withSender(DEPLOYER).addContractDeploy({ contract_name: CORE, source_code: coreSrc }), (v) => !String(v).includes("ERR"));
  tx("deploy jing-ladder", (b) => b.withSender(DEPLOYER).addContractDeploy({ contract_name: "jing-ladder", source_code: ladderSrc }), (v) => !String(v).includes("ERR"));
  tx("sim-only: seats 0 on the ladder (the 3-slot park instance cannot reserve 10)", call(DEPLOYER, "set-max-band-per-side", [uintCV(0)], `${DEPLOYER}.jing-ladder`), "(ok true)");
  tx("deploy market (patched)", (b) => b.withSender(DEPLOYER).addContractDeploy({ contract_name: MARKET, source_code: mktSrc }), (v) => !String(v).includes("ERR"));
  tx("deploy park market (MAX u3)", (b) => b.withSender(DEPLOYER).addContractDeploy({ contract_name: PARK, source_code: parkSrc }), (v) => !String(v).includes("ERR"));
  tx("sim-only: main market syncs the count", call(DEPLOYER, "sync-seat-count", []), (v) => String(v).startsWith("(ok"));
  tx("sim-only: park market syncs the count", call(DEPLOYER, "sync-seat-count", [], PID), (v) => String(v).startsWith("(ok"));
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
    [Q1, 1_000_000, 3500n], [Q2, 1_000_000, 3000n], [Q3, 1_000_000, 3000n], [N4, 1_000_000, 4000n],
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

  // =============== B2: in-range whale + small taker -> u1020 ===============
  tx("B2 W reprices to in-range (M ask not live)", setLimitY(W, HUGE), "(ok true)");
  const escBefore = cap("escrow STX before B2", `(stx-get-balance '${CID})`);
  tx("B2 1.5 STX swap vs 1000 STX in-range side -> u1020", swap(T2, A1, LT, false), "(err u1020)");
  const escAfter = cap("escrow STX after B2", `(stx-get-balance '${CID})`);
  ev("B2 cycle unchanged", "(get-current-cycle)", "u1");
  ev("B2 W unchanged", `(get-token-y-deposit u1 '${W})`, `u${W_AMT}`);
  ev("B2 T2 has no row", `(get-token-y-deposit u1 '${T2})`, "u0");
  ev("B2 flag unwound by the revert", "(var-get taker-too-small)", "false");

  // =============== B3: no close at all, no roll of the fish ===============
  tx("B3 F 1 STX in-range bid (0.1% of side)", depositY(F, MIN_STX, HUGE), `(ok u${MIN_STX})`);
  tx("B3 outsider close-deposits REFUSED (no such function)", call(T2, "close-deposits", []), refused);
  tx("B3 deployer close-deposits REFUSED too", call(DEPLOYER, "close-deposits", []), refused);
  ev("B3 fish still in cycle u1 (not rolled)", `(get-token-y-deposit u1 '${F})`, `u${MIN_STX}`);
  // the keeper settle: at the mid no ask is in range (M rests at +2%), so
  // the settle dies u1009 and nothing moves
  tx("B3 settle-with-refresh, x empty at mid -> u1009", settle(DEPLOYER), "(err u1009)");
  ev("B3 cycle still u1", "(get-current-cycle)", "u1");
  ev("B3 fish still in cycle u1", `(get-token-y-deposit u1 '${F})`, `u${MIN_STX}`);
  ev("B3 fish not moved to u2", `(get-token-y-deposit u2 '${F})`, "u0");
  ev("B3 W still in cycle u1", `(get-token-y-deposit u1 '${W})`, `u${W_AMT}`);
  ev(`B3 M still in cycle u1 (${M_LEFT})`, `(get-token-x-deposit u1 '${M})`, `u${M_LEFT}`);
  ev("B3 y list still W + F", "(len (get-token-y-depositors u1))", "u2");
  tx("B3 W cancels (book always open, nothing stuck)", cancelY(W), `(ok u${W_AMT})`);
  ev("B3 y list now F only", "(len (get-token-y-depositors u1))", "u1");

  // =============== B4: price-ordered walk, asks ===============
  // list order on x: M (+2%, rolled), then A (+5%), then B (+1%)
  tx("B4 A 5000-sat ask at +5%", depositX(AX, 5000n, LA), "(ok u5000)");
  tx("B4 B 5000-sat ask at +1%", depositX(BX, 5000n, LB), "(ok u5000)");
  const t3Before = cap("T3 sbtc before", `(get-balance '${T3})`, SBTC_FQN);
  tx("B4 3 STX y-taker at +5.5% -> ok", swap(T3, A3, LT3, false), okPrefix);
  const t3After = cap("T3 sbtc after", `(get-balance '${T3})`, SBTC_FQN);
  ev("B4 cycle -> u2", "(get-current-cycle)", "u2");
  ev(`B4 B (+1%, best) filled: left ${B_LEFT}`, `(get-token-x-deposit u2 '${BX})`, `u${B_LEFT}`);
  ev(`B4 M (+2%, list-first) untouched ${M_LEFT}`, `(get-token-x-deposit u2 '${M})`, `u${M_LEFT}`);
  ev("B4 A (+5%) untouched", `(get-token-x-deposit u2 '${AX})`, "u5000");
  ev("B4 taker residual refunded", `(get-token-y-deposit u2 '${T3})`, "u0");
  ev("B4 fish rolled unfilled (mid cleared 0)", `(get-token-y-deposit u2 '${F})`, `u${MIN_STX}`);

  // =============== B4b: price-ordered walk, bids (x-taker) ===============
  tx("B4b C 20 STX bid at -5% (first)", depositY(CY, 20_000_000n, LC), "(ok u20000000)");
  tx("B4b D 20 STX bid at -1% (second)", depositY(DY, 20_000_000n, LD), "(ok u20000000)");
  tx("B4b 2000-sat x-taker at -5.5% -> ok", swap(TX, AX_AMT, LTX, true), okPrefix);
  ev("B4b cycle -> u3", "(get-current-cycle)", "u3");
  ev("B4b C (-5%, list-first) untouched", `(get-token-y-deposit u3 '${CY})`, "u20000000");
  ev("B4b D (-1%, best) filled", `(get-token-y-deposit u3 '${DY})`, (v) => {
    const left = uintOf(v);
    return left > 0n && left < 20_000_000n;
  });
  ev("B4b x-walker residual 0", `(get-token-x-deposit u3 '${TX})`, "u0");
  ev("B4b fish cleared at mid", `(get-token-y-deposit u3 '${F})`, "u0");

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
  tx("P N2 out-of-range newcomer smaller than smallest -> u1010", depositY(N2, 1_500_000n, 1n, PID), "(err u1010)");
  // bounty mtxs6nxg7a6d97081b11 (Celestial Shark): a newcomer whose peg is
  // switched off (cap under mid - 30 bps -> bid sentinel u0) used to skip the
  // park step and bump the smallest live maker on size. Dead orders get no
  // slot on a full book now, whatever their size.
  tx("P N2 switched-off peg newcomer (3 STX > smallest 2 STX) on a full book -> u1010, no bump", depositYPeg(N2, 3_000_000n, LP1, 30n, PID), "(err u1010)");
  ev("P smallest live maker (N1) still on the book", `(get-token-y-deposit u0 '${N1})`, "u2000000", PID);
  ev("P book still 3", "(len (get-token-y-depositors u0))", "u3", PID);
  tx("P P1 reprices while parked -> ok", setLimitY(P1, HUGE, PID), "(ok true)");
  ev("P P1 new limit", `(get-token-y-limit '${P1})`, `u${HUGE}`, PID);
  tx("P readmit P1 with side full -> u1010", readmitY(DEPLOYER, P1), "(err u1010)");
  tx("P P2 cancels -> slot", cancelY(P2, PID), "(ok u2000000)");
  tx("P readmit P1 (keeper) -> ok", readmitY(DEPLOYER, P1), "(ok u2000000)");
  ev("P P1 unparked", `(get-token-y-parked '${P1})`, "u0", PID);
  ev("P P1 live again", `(get-token-y-deposit u0 '${P1})`, "u2000000", PID);
  ev("P totals back to 6 STX", "(get total-token-y (get-cycle-totals u0))", "u6000000", PID);
  ev("P list 3", "(len (get-token-y-depositors u0))", "u3", PID);
  tx("P N3 in-range newcomer -> parks P3 (only out-of-range)", depositY(N3, 2_000_000n, HUGE, PID), "(ok u2000000)");
  ev("P P3 parked", `(get-token-y-parked '${P3})`, "u2000000", PID);
  // bounty mtxs6nxg7a6d97081b11 (apeirs): a parked maker taking on the SAME side
  // used to overwrite and then delete its own price row, stranding the parked
  // amount without a price. swap now refuses parked like it refuses live.
  tx("P P3 swaps STX while parked on y -> u1018", swap(P3, 1_000_000n, HUGE, false, PID), "(err u1018)");
  ev("P P3 still parked after the refused swap", `(get-token-y-parked '${P3})`, "u2000000", PID);
  ev("P P3 limit untouched", `(get-token-y-limit '${P3})`, `u${LP3}`, PID);
  // v6: a parked maker deposits straight back. Out of range (bid -5%) and the
  // side full of IN-RANGE makers (P1, N1, N3): until 2026-09-13 the combined
  // 3 STX beat the smallest (N1) on size and N1 was refunded, then parked.
  // 2026-09-14: an out-of-range newcomer with no price edge only fights
  // inside the out-of-range region, which is empty here -> u1010, P3 stays
  // parked, N1 stays live. An in-range order is never displaced by one far
  // from the mid.
  tx("P P3 deposits 1 STX while parked: out of range, nobody out of range on the book -> u1010 (no in-range maker is displaced)", depositY(P3, 1_000_000n, LP3, PID), "(err u1010)");
  ev("P P3 still parked 2 STX", `(get-token-y-parked '${P3})`, "u2000000", PID);
  ev("P N1 still live", `(get-token-y-deposit u0 '${N1})`, "u2000000", PID);
  ev("P N1 limit kept", `(get-token-y-limit '${N1})`, `u${HUGE}`, PID);
  tx("P N1 cancels its live 2 STX -> refund", cancelY(N1, PID), "(ok u2000000)");
  ev("P totals 4 STX (P1 2 + N3 2)", "(get total-token-y (get-cycle-totals u0))", "u4000000", PID);
  tx("P readmit P3 (parked, a slot is free now) -> ok", readmitY(DEPLOYER, P3), "(ok u2000000)");
  ev("P P3 live 2 STX", `(get-token-y-deposit u0 '${P3})`, "u2000000", PID);
  ev("P P3 parked cleared", `(get-token-y-parked '${P3})`, "u0", PID);
  tx("P P3 cancels -> refund", cancelY(P3, PID), "(ok u2000000)");
  tx("P readmit P3 (no longer parked) -> u1022", readmitY(DEPLOYER, P3), "(err u1022)");
  tx("P readmit P1 (live, not parked) -> u1022", readmitY(DEPLOYER, P1), "(err u1022)");
  // x mirror: clear the y side first so in-range asks pass the crossing gate
  tx("P P1 cancels", cancelY(P1, PID), "(ok u2000000)");
  tx("P N3 cancels", cancelY(N3, PID), "(ok u2000000)");
  ev("P y side empty", "(len (get-token-y-depositors u0))", "u0", PID);
  tx("PX Q1 ask 3000 at +10% (gap 10%)", depositX(Q1, 3000n, LQ1, PID), "(ok u3000)");
  tx("PX Q2 ask 3000 in range", depositX(Q2, 3000n, 1n, PID), "(ok u3000)");
  tx("PX Q3 ask 3000 at +5% (gap 5%)", depositX(Q3, 3000n, LQ3, PID), "(ok u3000)");
  tx("PX N4 in-range newcomer -> parks Q1", depositX(N4, 3000n, 1n, PID), "(ok u3000)");
  ev("PX Q1 parked 3000", `(get-token-x-parked '${Q1})`, "u3000", PID);
  tx("PX Q1 swaps sBTC while parked on x -> u1018", swap(Q1, 1000n, 1n, true, PID), "(err u1018)");
  ev("PX Q1 still parked after the refused swap", `(get-token-x-parked '${Q1})`, "u3000", PID);
  ev("PX Q3 still live", `(get-token-x-deposit u0 '${Q3})`, "u3000", PID);
  ev("PX totals exclude parked (9000)", "(get total-token-x (get-cycle-totals u0))", "u9000", PID);
  tx("PX readmit Q1 full -> u1010", readmitX(DEPLOYER, Q1), "(err u1010)");
  const q1Before = cap("Q1 sbtc before cancel", `(get-balance '${Q1})`, SBTC_FQN);
  tx("PX Q1 cancels while parked -> refund", cancelX(Q1, PID), "(ok u3000)");
  const q1After = cap("Q1 sbtc after cancel", `(get-balance '${Q1})`, SBTC_FQN);
  ev("PX Q1 parked cleared", `(get-token-x-parked '${Q1})`, "u0", PID);
  tx("PX Q1 returns as a switched-off peg ask (floor +10% over mid+30bps -> MAX_UINT), 3500 > smallest 3000, full book -> u1010, no bump", depositXPeg(Q1, 3500n, LQ1, 30n, PID), "(err u1010)");
  ev("PX smallest live ask (Q2) still on the book", `(get-token-x-deposit u0 '${Q2})`, "u3000", PID);
  ev("PX x book still 3", "(len (get-token-x-depositors u0))", "u3", PID);
  tx("PX Q2 cancels -> slot", cancelX(Q2, PID), "(ok u3000)");
  tx("PX N4 top-up (existing) needs no park", depositX(N4, 1000n, 1n, PID), "(ok u1000)");

  // =============== D: distance-slots (price-first within N slots, then size) ===============
  // y side is empty here. Book of 3: P1 at -10%, P2 at -5%, P3 in range.
  const LP7 = (MID * 93n) / 100n, LP12 = (MID * 88n) / 100n, LP6 = (MID * 94n) / 100n, LP1PCT = (MID * 99n) / 100n, LP3PCT = (MID * 97n) / 100n;
  ev("D0 distance-slots default 10", "(get-distance-slots)", "u10", PID);
  tx("D1 P1 bid 2 STX at -10%", depositY(P1, 2_000_000n, LP1, PID), "(ok u2000000)");
  tx("D1 P2 bid 2 STX at -5%", depositY(P2, 2_000_000n, LP3, PID), "(ok u2000000)");
  tx("D1 P3 bid 2 STX at -1% (closest; an in-range ask rests, so in range would be u1016)", depositY(P3, 2_000_000n, LP1PCT, PID), "(ok u2000000)");
  ev("D1 book full (3)", "(len (get-token-y-depositors u0))", "u3", PID);
  // N1: smaller than the smallest (1.6 < 2) but closer than P1: 2 residents
  // closer (P2, P3) < 10 slots -> parks P1 (the only one farther), takes the slot
  tx("D2 N1 1.6 STX at -7%: smaller than everyone, beats the worst of the top set (P1 at -10%) -> parks P1, in", depositY(N1, 1_600_000n, LP7, PID), "(ok u1600000)");
  ev("D2 P1 parked 2 STX", `(get-token-y-parked '${P1})`, "u2000000", PID);
  ev("D2 N1 live 1.6 STX", `(get-token-y-deposit u0 '${N1})`, "u1600000", PID);
  ev("D2 book still 3", "(len (get-token-y-depositors u0))", "u3", PID);
  // N2 farther than everyone: nobody to park -> size rule -> 1.6 not > 1.6 -> u1010
  tx("D3 N2 1.6 STX at -12%: worse than the worst of the top set -> size rule -> u1010", depositY(N2, 1_600_000n, LP12, PID), "(err u1010)");
  // operator dials the slots down to 1: N3 at -6% has 2 closer (P2, P3) >= 1 -> size rule
  tx("D4 operator sets distance-slots u1", call(DEPLOYER, "set-distance-slots", [uintCV(1)], PID), "(ok true)");
  tx("D4 N3 1.6 STX at -6%: the single price slot is P3 at -1%, not beaten -> size rule -> 1.6 not > 1.6 -> u1010", depositY(N3, 1_600_000n, LP6, PID), "(err u1010)");
  tx("D5 N3 2.5 STX at -6%: size rule -> the smallest (N1, 1.6) is parked", depositY(N3, 2_500_000n, LP6, PID), "(ok u2500000)");
  ev("D5 N1 off the book", `(get-token-y-deposit u0 '${N1})`, "u0", PID);
  ev("D5 N1 parked 1.6 STX", `(get-token-y-parked '${N1})`, "u1600000", PID);
  ev("D5 N3 live 2.5 STX", `(get-token-y-deposit u0 '${N3})`, "u2500000", PID);
  // the distinguishing case: book = {P3 -1%, P2 -5%, N3 -6% (2.5 STX, the
  // biggest)}; 2 price slots = {P3, P2}; the second best is P2. N2 at -3%
  // beats it -> parks P2 (2nd best), NOT N3, the farthest and biggest, which
  // sits outside the price slots and can only be bumped on size.
  tx("D5b operator sets distance-slots u2", call(DEPLOYER, "set-distance-slots", [uintCV(2)], PID), "(ok true)");
  tx("D5b N2 1.6 STX at -3%: beats the 2nd best (P2 at -5%) -> parks P2; N3 (-6%, biggest) outside the price slots is not touched", depositY(N2, 1_600_000n, LP3PCT, PID), "(ok u1600000)");
  ev("D5b P2 parked 2 STX (funds and price kept)", `(get-token-y-parked '${P2})`, "u2000000", PID);
  ev("D5b N2 live 1.6 STX", `(get-token-y-deposit u0 '${N2})`, "u1600000", PID);
  ev("D5b N3 (-6%, outside the 2 price slots) untouched", `(get-token-y-deposit u0 '${N3})`, "u2500000", PID);
  ev("D5b book still 3", "(len (get-token-y-depositors u0))", "u3", PID);
  // the demotion cascade. Book: P3 -1% (2), N2 -3% (1.6), N3 -6% (2.5, the
  // biggest, outside the 2 price slots).
  // C1: N1 (parked 1.6 by D5) tops up 1.4 at -2%, 3 STX in all, beats the
  // 2nd best (N2). N2 is demoted: 1.6 is not
  // bigger than the smallest outside (N3, 2.5) -> N2 is parked.
  const LP2PCT = (MID * 98n) / 100n, LP15 = (MID * 985n) / 1000n, LP4 = (MID * 96n) / 100n;
  tx("D5c N1 (parked 1.6) deposits 1.4 at -2% = 3 STX: beats the 2nd best (N2, 1.6); N2 demoted, smaller than the smallest outside (N3, 2.5) -> N2 parked", depositY(N1, 1_400_000n, LP2PCT, PID), "(ok u1400000)");
  ev("D5c N1 parked cleared (carried in)", `(get-token-y-parked '${N1})`, "u0", PID);
  ev("D5c N2 parked 1.6 STX", `(get-token-y-parked '${N2})`, "u1600000", PID);
  ev("D5c N3 still live 2.5 STX", `(get-token-y-deposit u0 '${N3})`, "u2500000", PID);
  ev("D5c N1 live 3 STX", `(get-token-y-deposit u0 '${N1})`, "u3000000", PID);
  // C2: P2 (parked 2 STX) deposits 0.5 more at -1.5%: combined 2.5, beats the
  // 2nd best (N1 at -2%, 3 STX). N1 is demoted: 3 > smallest outside (N3,
  // 2.5) -> N3 is parked, N1 stays in the size region.
  tx("D5d P2 (parked 2) deposits 0.5 STX at -1.5%: beats the 2nd best (N1, 3 STX); N1 demoted, bigger than the smallest outside (N3, 2.5) -> N3 parked, N1 stays", depositY(P2, 500_000n, LP15, PID), "(ok u500000)");
  ev("D5d N3 parked 2.5 STX", `(get-token-y-parked '${N3})`, "u2500000", PID);
  ev("D5d N1 still live 3 STX (demoted, survives on size)", `(get-token-y-deposit u0 '${N1})`, "u3000000", PID);
  ev("D5d P2 live 2.5 STX, parked cleared", `(get-token-y-deposit u0 '${P2})`, "u2500000", PID);
  ev("D5d P2 parked 0", `(get-token-y-parked '${P2})`, "u0", PID);
  ev("D5d book still 3", "(len (get-token-y-depositors u0))", "u3", PID);
  // D5e: in-range residents are outside both regions. Book: P3 and N1 in
  // range, P2 at -5%; one price slot. N2 (parked 1.6) tops up 0.4 at -4%:
  // the price region is {P2} (in-range not ranked), -4% beats -5% -> P2 is
  // demoted, nobody out of range outside the region -> P2 parked. With
  // in-range residents ranked, the region would be {P3} and N2 would fall to
  // the size rule (2.0 not > 2) -> u1010.
  tx("D5e P3 cancels", cancelY(P3, PID), "(ok u2000000)");
  tx("D5e N1 cancels", cancelY(N1, PID), "(ok u3000000)");
  tx("D5e P2 cancels", cancelY(P2, PID), "(ok u2500000)");
  tx("D5e N4 cancels its in-range ask so in-range bids can rest", cancelX(N4, PID), "(ok u4000)");
  tx("D5e operator sets distance-slots u1", call(DEPLOYER, "set-distance-slots", [uintCV(1)], PID), "(ok true)");
  tx("D5e P3 bid 2 STX in range", depositY(P3, 2_000_000n, HUGE, PID), "(ok u2000000)");
  tx("D5e N1 bid 2 STX in range", depositY(N1, 2_000_000n, HUGE, PID), "(ok u2000000)");
  tx("D5e P2 bid 2 STX at -5%", depositY(P2, 2_000_000n, LP3, PID), "(ok u2000000)");
  ev("D5e book full (3)", "(len (get-token-y-depositors u0))", "u3", PID);
  tx("D5e N2 (parked 1.6) tops up 0.4 at -4%: beats the only out-of-range price (P2, -5%) -> P2 parked, in-range pair untouched", depositY(N2, 400_000n, LP4, PID), "(ok u400000)");
  ev("D5e P2 parked 2 STX", `(get-token-y-parked '${P2})`, "u2000000", PID);
  ev("D5e N2 live 2 STX (1.6 carried + 0.4)", `(get-token-y-deposit u0 '${N2})`, "u2000000", PID);
  ev("D5e P3 still live", `(get-token-y-deposit u0 '${P3})`, "u2000000", PID);
  ev("D5e N1 still live", `(get-token-y-deposit u0 '${N1})`, "u2000000", PID);
  tx("D6 set-distance-slots over MAX_DEPOSITORS -> u1010", call(DEPLOYER, "set-distance-slots", [uintCV(51)], PID), "(err u1010)");
  tx("D6 stranger cannot set distance-slots", call(N2, "set-distance-slots", [uintCV(5)], PID), (v) => String(v).startsWith("(err"));
  tx("D6 operator restores to MAX_DEPOSITORS of this instance (u3; u10 default exceeds the patched cap)", call(DEPLOYER, "set-distance-slots", [uintCV(3)], PID), "(ok true)");
  ev("D6 distance-slots 3", "(get-distance-slots)", "u3", PID);

  // ---- D7 (2026-09-14, d1b32bd): an out-of-range newcomer with NO price edge fights on size
  // inside the out-of-range region only (seated, top N and in-range residents skipped).
  // Book on y: P3 in range, N2 at -4%; N1 (in range) leaves, R1 rests at -10%: full (3).
  // distance-slots 1: the price region is {N2}, the size region is {R1}, P3 is in neither.
  const R1 = mkAddr(31), R2 = mkAddr(32);
  tx("D7 fund R1", stxSend(R1, 4_500_000), okPrefix);
  tx("D7 fund R2", stxSend(R2, 4_500_000), okPrefix);
  tx("D7 N1 (in range) cancels", cancelY(N1, PID), "(ok u2000000)");
  tx("D7 R1 bid 2 STX at -10%", depositY(R1, 2_000_000n, LP1, PID), "(ok u2000000)");
  ev("D7 book full (3): P3 in range, N2 -4%, R1 -10%", "(len (get-token-y-depositors u0))", "u3", PID);
  tx("D7 operator sets distance-slots u1: price region {N2}, size region {R1}", call(DEPLOYER, "set-distance-slots", [uintCV(1)], PID), "(ok true)");
  tx("D7 R2 3 STX at -10%: no price edge (not better than N2's -4%), bigger than the region's smallest (R1, 2) -> R1 parked, R2 in", depositY(R2, 3_000_000n, LP1, PID), "(ok u3000000)");
  ev("D7 R1 parked 2 STX", `(get-token-y-parked '${R1})`, "u2000000", PID);
  ev("D7 R2 live 3 STX", `(get-token-y-deposit u0 '${R2})`, "u3000000", PID);
  ev("D7 N2 (price region) untouched", `(get-token-y-deposit u0 '${N2})`, "u2000000", PID);
  ev("D7 P3 (in range) untouched", `(get-token-y-deposit u0 '${P3})`, "u2000000", PID);
  tx("D7 R1 (parked 2) deposits 1 at -10%: size 3 = the region's smallest (R2, 3), not bigger -> u1010 (strict)", depositY(R1, 1_000_000n, LP1, PID), "(err u1010)");
  ev("D7 R1 still parked 2 STX", `(get-token-y-parked '${R1})`, "u2000000", PID);
  tx("D7 R1 deposits 1.5 at -10%: size 3.5 > 3 -> R2 parked, R1 in with 3.5", depositY(R1, 1_500_000n, LP1, PID), "(ok u1500000)");
  ev("D7 R2 parked 3 STX", `(get-token-y-parked '${R2})`, "u3000000", PID);
  ev("D7 R1 live 3.5 STX", `(get-token-y-deposit u0 '${R1})`, "u3500000", PID);
  ev("D7 R1 parked cleared", `(get-token-y-parked '${R1})`, "u0", PID);
  ev("D7 P3 still untouched", `(get-token-y-deposit u0 '${P3})`, "u2000000", PID);
  ev("D7 N2 still untouched", `(get-token-y-deposit u0 '${N2})`, "u2000000", PID);
  tx("D7 operator restores distance-slots u3", call(DEPLOYER, "set-distance-slots", [uintCV(3)], PID), "(ok true)");

  // ---- run ----
  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid);
  const s = res.steps;
  if (s.length !== steps.length) {
    console.log(`note: ${s.length} result steps vs ${steps.length} scripted`);
  }

  let i = 0;
  for (const st of steps) {
    // skip any result entry that is neither a Transaction nor an Eval
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
  check("PX Q1 refund landed (3000 sats)", q1After.value - q1Before.value, (d) => d === 3000n);

  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
