// verify-markets-v2-remainder-cross.js
// Self-verifying stxer mainnet-fork harness for the REMAINDER-CROSS feature
// on markets-sbtc-stx-jing-v2 + jing-core-v3 (log-match):
//   S1 happy walk: mid fill + partial crossed maker at the maker's limit,
//      rebate split (ride to mid maker, 20bps to crossed maker, crumbs +
//      sub-min residual refunded to the taker), escrow conservation.
//   S2 no-mid-liquidity edge: only out-of-range makers. The `crossing` flag
//      lets settlement run with the maker side empty at the mid; A1 is too big
//      for the crossable book within LT -> u1023 partial revert, atomic.
//   S2b beyond-limit makers only -> u1023 partial revert, atomicity.
//   S3 dust maker: walk leaves a maker below min-deposit; a later walk SKIPS
//      that dust maker.
//   S3b sub-min remainder: refunds silently, swap succeeds on the mid fill.
//   S4 mirror direction: x-taker walks an out-of-range y bid at the bid's
//      limit; x walker leaves zero residual.
//   S5b cross-only, oversize: only Y1's rolled bid on the book, taker bigger
//      than it can absorb -> u1023, atomic (cycle + Y1 unchanged).
//   S5 cross-only, sized: same book, taker fits -> settles with zero mid
//      clearing and the walk does the WHOLE fill at Y1's limit; Y1 paid
//      net-of-fee + 20bps rebate, taker residual 0.
//   S6 mirror cross-only, sized: y-taker (fresh STX actor) against only
//      out-of-range asks; dust makers skipped, M3 filled at L3, sub-min
//      residual refunded, exact payouts both sides.
//   S7a reprice-or-swap-token-y through the walk: the resting bid reprices
//      to +3% -> takes (a live in-range ask exists; the gate requires one),
//      mid fills the in-range ask, the remainder walks the L3 ask.
//   S7b reprice-or-swap-token-x through the walk: mirror; the leftover ask
//      reprices to -1%, mid fills an in-range bid, remainder walks Y2 at LY1.
//      (reprice-or-swap cannot take on a cross-only book: would-take-* only
//      looks for a live maker at or inside the mid. Design note for Rapha.)
//   S9 ERR_ZERO_MIN_DEPOSIT (u1025): both setters and initialize (fresh
//      deploy) reject a zero min.
//   S8 (last) public settle with the flag false: a swap that reverts in the
//      walk leaves `crossing` false; plain close-deposits + settle-with-refresh
//      on an all-out-of-range book -> u1012, cycle unchanged.
//
// Hermes is key-gated since 2026-08-18, so the harness runs on the REAL
// prices already in pyth-storage-v4 (read pre-run for exact expectations)
// with two sim-only source patches, both documented in the v3 sim README
// pattern: MAX_STALENESS loosened and the two verify-and-update calls
// no-op'd. Nothing in the logic under test is touched.
//
// Run: npx tsx simulations/verify-markets-v2-remainder-cross.js
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
// LIVE=1: run the EXACT deployed bytes at the mainnet contract ids.
// Hermes is key-gated, so the harness reuses a real dual-feed PNAU VAA that
// Granite posted on 2026-08-17 (tx 0x075d0c27be4f…, block 8785969, publish
// 11:33:44) and forks at 8785968 where it is 39 s old (< MAX_STALENESS 80).
// The sim redeploys core-v3 + the market from SPV9K21… (same deployer, same
// contract ids as mainnet), source fetched from chain, no patches. Only the
// deploy block differs from mainnet. See contracts/README-pyth-core-vs-lazer.md.
const LIVE = process.env.LIVE === "1";
const LIVE_DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const LIVE_FORK = 8785968;
const LIVE_PX = 6362215887773n; // BTC/USD stored at the fork after the VAA
const LIVE_PY = 12143400n; // STX/USD
const LIVE_VAA_FILE = new URL("./fixtures/vaa-granite-8785969-btc-stx.hex", import.meta.url);
const DEPLOYER = LIVE ? LIVE_DEPLOYER : getAddressFromPrivateKey(OWNER_PRIVKEY, "mainnet");
const mkAddr = (n) =>
  getAddressFromPrivateKey(
    String(n).repeat(64).slice(0, 64) + "01",
    "mainnet",
  );
const M2 = mkAddr(5); // out-of-range x maker (walked, partial)
const M3 = mkAddr(6); // out-of-range x maker beyond taker limit (untouched)
const X4 = mkAddr(7); // in-range x maker for S3
const X5 = mkAddr(8); // in-range x maker for S3b
const Y1 = mkAddr(9); // out-of-range y bid for S4

const CORE = "jing-core-v3";
const MARKET = "markets-sbtc-stx-jing-v2";
const CID = `${DEPLOYER}.${MARKET}`;
const CORE_ID = `${DEPLOYER}.${CORE}`;
const STACKS_NODE_API = "http://77.42.3.101/stacks-api";

const MIN_SBTC = 1000n;
const MIN_STX = 1_000_000n;
const PP = 100_000_000n; // PRICE_PRECISION
const DF = 100n; // DECIMAL_FACTOR
const PPDF = PP * DF;
const FEE = 10n; // FEE_BPS
const REB = 20n; // TAKER_REBATE_BPS
const BPS = 10_000n;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET);
const DUMMY_VAA = LIVE
  ? bufferCV(Buffer.from(fs.readFileSync(LIVE_VAA_FILE, "utf8").trim(), "hex"))
  : bufferCV(Buffer.from("00", "hex"));

async function onChainSource(name) {
  const r = await fetch(`${STACKS_NODE_API}/v2/contracts/source/${LIVE_DEPLOYER}/${name}?proof=0`);
  const d = await r.json();
  if (!d.source) throw new Error(`no on-chain source for ${name}`);
  return d.source;
}
let coreSrc, mktSrc;
if (LIVE) {
  coreSrc = await onChainSource(CORE);
  mktSrc = await onChainSource(MARKET);
} else {
  coreSrc = fs.readFileSync(
    new URL(`../contracts/${CORE}.clar`, import.meta.url),
    "utf8",
  );
  mktSrc = fs.readFileSync(
    new URL(`../contracts/${MARKET}.clar`, import.meta.url),
    "utf8",
  );
  // sim-only patches (documented pattern): loosen staleness, no-op the two
  // Hermes verifies so the market reads the REAL prices resting in storage.
  mktSrc = mktSrc.replace(
    "(define-constant MAX_STALENESS u80)",
    "(define-constant MAX_STALENESS u999999999)",
  );
  const VERIFY_BLOCK = /\(try! \(contract-call\? 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y\.pyth-oracle-v4\s*\n\s*verify-and-update-price-feeds vaa \{\s*\n\s*pyth-storage-contract: 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y\.pyth-storage-v4,\s*\n\s*pyth-decoder-contract: 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y\.pyth-pnau-decoder-v3,\s*\n\s*wormhole-core-contract: 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y\.wormhole-core-v4,\s*\n\s*\}\)\)/g;
  const verifyCount = (mktSrc.match(VERIFY_BLOCK) || []).length;
  if (verifyCount !== 2)
    throw new Error(`expected 2 verify blocks, found ${verifyCount}`);
  mktSrc = mktSrc.replace(VERIFY_BLOCK, "true");
}

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

let checks = 0;
let failures = 0;
function assert(label, actual, want) {
  checks += 1;
  const ok =
    typeof want === "function" ? want(actual) : String(actual).includes(want);
  if (ok) console.log(`  ok   ${label}: ${String(actual).slice(0, 90)}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}: got "${actual}" want "${want}"`);
  }
}

async function storedPrice(feedHex) {
  const [addr, name] = PYTH_STORAGE.split(".");
  const r = await fetch(
    `${STACKS_NODE_API}/v2/contracts/call-read/${addr}/${name}/get-price`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sender: addr,
        arguments: ["0x0200000020" + feedHex],
      }),
    },
  );
  const d = await r.json();
  const j = cvToJSON(deserializeCV(d.result));
  const t = j.value.value;
  return BigInt(t.price.value);
}

async function main() {
  console.log("=== remainder-cross SELF-VERIFYING stxer harness ===\n");
  console.log(`throwaway deployer = ${DEPLOYER}`);

  const px = LIVE ? LIVE_PX : await storedPrice(BTC_USD_FEED_HEX);
  const py = LIVE ? LIVE_PY : await storedPrice(STX_USD_FEED_HEX);
  if (LIVE) console.log(`LIVE mode: fork ${LIVE_FORK}, deployer ${LIVE_DEPLOYER}, real VAA, no patches`);
  const MID = (px * PP) / py;
  console.log(`stored px=${px} py=${py} mid=${MID}\n`);

  // ---- exact scenario numbers (BigInt, mirrors contract order of ops) ----
  const L2 = (MID * 1005n) / 1000n; // M2 ask, +0.5%
  const L3 = (MID * 102n) / 100n; // M3 ask, +2%
  const LT = (MID * 101n) / 100n; // taker tolerance, +1%
  const LT_LOW = (MID * 1001n) / 1000n; // S2b taker tolerance, +0.1% (< L2)
  const LY1 = (MID * 995n) / 1000n; // S4 y bid, -0.5%
  const X1_AMT = 2000n;
  const M2_AMT = 3000n;
  const M3_AMT = 2000n;

  // S1 taker: mid consumes X1 fully, walk takes ~1200 sats of M2
  const xValue = (X1_AMT * MID) / PPDF; // uSTX the mid fill costs
  const R_TARGET = (1200n * L2) / PPDF; // uSTX aimed at M2
  const NET_T = xValue + R_TARGET;
  // gross so that gross - floor(gross*20/10000) == NET_T (search adjacent)
  let A1 = (NET_T * BPS) / (BPS - REB);
  while (A1 - (A1 * REB) / BPS < NET_T) A1 += 1n;
  const REBATE1 = (A1 * REB) / BPS;
  const NET1 = A1 - REBATE1;
  const R1 = NET1 - xValue; // walked remainder
  const YFEE_MID = (xValue * FEE) / BPS;
  const RIDE_Y = (REBATE1 * xValue) / NET1;
  const PEND_Y = REBATE1 - RIDE_Y;
  const X1_STX_GAIN = xValue - YFEE_MID + RIDE_Y;
  const X2_TRADED = (R1 * PPDF) / L2;
  const X2_FEE = (X2_TRADED * FEE) / BPS;
  const Y2_TRADED = (X2_TRADED * L2) / PPDF;
  const Y2_FEE = (Y2_TRADED * FEE) / BPS;
  const REB2raw = (Y2_TRADED * REB) / BPS;
  const REB2 = REB2raw > PEND_Y ? PEND_Y : REB2raw;
  const M2_STX_GAIN = Y2_TRADED - Y2_FEE + REB2;
  const TAKER_SBTC_GAIN = X1_AMT - (X1_AMT * FEE) / BPS + (X2_TRADED - X2_FEE);
  const M2_LEFT = M2_AMT - X2_TRADED;

  console.log(
    `S1: A=${A1} net=${NET1} xValue=${xValue} R=${R1} x2=${X2_TRADED} m2left=${M2_LEFT}\n`,
  );

  const call = (sender, fn, args, cid = CID) => (b) =>
    b.withSender(sender).addContractCall({
      contract_id: cid,
      function_name: fn,
      function_args: args,
    });
  const depositX = (sender, amount, limit) =>
    call(sender, "deposit-token-x", [
      uintCV(amount),
      uintCV(limit),
      DUMMY_VAA,
      sbtcTrait,
      sbtcAsset,
    ]);
  const depositY = (sender, amount, limit) =>
    call(sender, "deposit-token-y", [
      uintCV(amount),
      uintCV(limit),
      DUMMY_VAA,
      wstxTrait,
      wstxAsset,
    ]);
  const swap = (sender, amount, limit, depositXSide) =>
    call(sender, "swap", [
      uintCV(amount),
      uintCV(limit),
      DUMMY_VAA,
      sbtcTrait,
      sbtcAsset,
      wstxTrait,
      wstxAsset,
      depositXSide ? trueCV() : falseCV(),
    ]);
  const sbtcSend = (to, amt) => (b) =>
    b.withSender(SBTC_DEPOSITOR_1).addContractCall({
      contract_id: SBTC_FQN,
      function_name: "transfer",
      function_args: [
        uintCV(amt),
        standardPrincipalCV(SBTC_DEPOSITOR_1),
        standardPrincipalCV(to),
        noneCV(),
      ],
    });
  const stxSend = (to, amt) => (b) =>
    b.withSender(STX_DEPOSITOR_1).addSTXTransfer({ recipient: to, amount: amt });
  const evalM = (code) => (b) => b.addEvalCode(CID, code);
  const evalSbtcBal = (who) => (b) =>
    b.addEvalCode(SBTC_FQN, `(get-balance '${who})`);
  const evalStxBal = (who) => (b) =>
    b.addEvalCode(CID, `(stx-get-balance '${who})`);

  let b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  if (LIVE) b = b.useBlockHeight(LIVE_FORK);
  b = b
    .withSender(DEPLOYER)
    .addContractDeploy({ contract_name: CORE, source_code: coreSrc })
    .addContractDeploy({ contract_name: MARKET, source_code: mktSrc })
    .addContractCall({
      contract_id: CORE_ID,
      function_name: "set-verified-contract",
      function_args: [marketCV],
    })
    .addContractCall({
      contract_id: CID,
      function_name: "initialize",
      function_args: [
        marketCV,
        contractPrincipalCV(SBTC_ADDR, SBTC_NAME),
        contractPrincipalCV(WSTX_ADDR, WSTX_NAME),
        uintCV(MIN_SBTC),
        uintCV(MIN_STX),
        btcFeedBuf,
        stxFeedBuf,
      ],
    });

  // fund synthetic makers (STX for gas, sBTC inventory)
  for (const [who, sats, ustx] of [
    [M2, 4000n, 3_000_000],
    [M3, 3000n, 3_000_000],
    [X4, 2600n, 3_000_000],
    [X5, 2300n, 3_000_000],
    [Y1, 0n, 9_000_000],
  ]) {
    b = stxSend(who, ustx)(b);
    if (sats > 0n) b = sbtcSend(who, sats)(b);
  }

  // ---------- S1: happy walk ----------
  b = depositX(SBTC_DEPOSITOR_1, X1_AMT, 1n)(b); // in-range
  b = depositX(M2, M2_AMT, L2)(b); // out-of-range, walkable
  b = depositX(M3, M3_AMT, L3)(b); // out-of-range, beyond taker limit
  b = evalStxBal(SBTC_DEPOSITOR_1)(b); // X1 STX before
  b = evalStxBal(M2)(b); // M2 STX before
  b = evalSbtcBal(STX_DEPOSITOR_1)(b); // taker sBTC before
  b = swap(STX_DEPOSITOR_1, A1, LT, false)(b);
  b = evalStxBal(SBTC_DEPOSITOR_1)(b);
  b = evalStxBal(M2)(b);
  b = evalSbtcBal(STX_DEPOSITOR_1)(b);
  b = evalM("(get-current-cycle)")(b); // u1
  b = evalM(`(get-token-x-deposit u1 '${M2})`)(b); // M2_LEFT
  b = evalM(`(get-token-x-deposit u1 '${M3})`)(b); // untouched
  b = evalM(`(get-token-y-deposit u1 '${STX_DEPOSITOR_1})`)(b); // 0 (residual refunded)
  b = evalM("(var-get pending-rebate-y)")(b); // 0
  b = evalM(`(stx-get-balance '${CID})`)(b); // escrow: 0 STX resting
  b = evalSbtcBal(CID)(b); // escrow: M2_LEFT + M3

  // ---------- S2: only out-of-range makers -> walk runs, A1 too big -> u1023, atomic ----------
  b = evalSbtcBal(STX_DEPOSITOR_1)(b);
  b = swap(STX_DEPOSITOR_1, A1, LT, false)(b); // book: M2_LEFT@L2, M3@L3, no in-range
  b = evalSbtcBal(STX_DEPOSITOR_1)(b); // unchanged
  b = evalM("(get-current-cycle)")(b); // still u1
  b = evalM(`(get-token-x-deposit u1 '${M2})`)(b); // unchanged

  // ---------- S2b: in-range present, crossables beyond limit -> u1023 ----------
  b = depositX(X4, 1500n, 1n)(b); // in-range mid liquidity
  const xValue4 = (1500n * MID) / PPDF;
  const NET_T2 = xValue4 + (800n * L2) / PPDF; // remainder needs M2 but...
  let A2 = (NET_T2 * BPS) / (BPS - REB);
  while (A2 - (A2 * REB) / BPS < NET_T2) A2 += 1n;
  b = swap(STX_DEPOSITOR_1, A2, LT_LOW, false)(b); // tolerance below L2 -> partial
  b = evalM("(get-current-cycle)")(b); // still u1 (reverted)
  b = evalM(`(get-token-x-deposit u1 '${X4})`)(b); // still resting 1500

  // ---------- S3: walk leaves M2 as dust; dust maker skipped later ----------
  // taker sized so walk consumes all but ~400 sats of M2
  const CONSUME = M2_LEFT - 400n;
  const NET_T3 = xValue4 + (CONSUME * L2) / PPDF;
  let A3 = (NET_T3 * BPS) / (BPS - REB);
  while (A3 - (A3 * REB) / BPS < NET_T3) A3 += 1n;
  b = swap(STX_DEPOSITOR_1, A3, LT, false)(b); // ok; M2 -> ~400 (dust)
  b = evalM("(get-current-cycle)")(b); // u2
  b = evalM(`(get-token-x-deposit u2 '${M2})`)(b); // ~400 dust rests
  b = evalM(`(get-token-y-deposit u2 '${STX_DEPOSITOR_1})`)(b); // 0

  // ---------- S3b: remainder can only reach dust -> refunded, mid fill ok ----------
  b = depositX(X5, 1200n, 1n)(b);
  const xValue5 = (1200n * MID) / PPDF;
  const NET_T4 = xValue5 + (100n * L2) / PPDF; // ~100-sats-worth remainder (< 1 STX)
  let A4 = (NET_T4 * BPS) / (BPS - REB);
  while (A4 - (A4 * REB) / BPS < NET_T4) A4 += 1n;
  b = evalStxBal(STX_DEPOSITOR_1)(b);
  b = swap(STX_DEPOSITOR_1, A4, LT, false)(b); // dust skipped, residual < MIN_STX refunds
  b = evalM("(get-current-cycle)")(b); // u3
  b = evalM(`(get-token-x-deposit u3 '${M2})`)(b); // dust untouched
  b = evalM(`(get-token-y-deposit u3 '${STX_DEPOSITOR_1})`)(b); // 0

  // ---------- S4: mirror - x-taker walks an out-of-range y bid ----------
  b = depositY(STX_DEPOSITOR_1, 20_000_000n, 999_999_999_999_999n)(b); // in-range bid 20 STX
  b = depositY(Y1, 5_000_000n, LY1)(b); // out-of-range bid 5 STX @ -0.5%
  const yInRange = 20_000_000n;
  const xValueMid4 = (yInRange * PPDF) / MID; // sats the in-range bid absorbs
  const WALK_X = 600n; // sats to walk into Y1 (taker-bound: ~3.9 STX < 5 STX bid)
  const GROSS4raw = xValueMid4 + WALK_X;
  let A5 = (GROSS4raw * BPS) / (BPS - REB);
  while (A5 - (A5 * REB) / BPS < GROSS4raw) A5 += 1n;
  b = evalSbtcBal(Y1)(b);
  b = swap(SBTC_DEPOSITOR_1, A5, (MID * 99n) / 100n, true)(b);
  b = evalSbtcBal(Y1)(b);
  b = evalM("(get-current-cycle)")(b); // u4
  b = evalM(`(get-token-x-deposit u4 '${SBTC_DEPOSITOR_1})`)(b); // 0 residual

  // ---------- S5b: cross-only, oversize -> u1023 atomic ----------
  // Book in u4: Y1's rolled bid (1.14 STX, absorbs ~177 sats) plus a fresh
  // 20 STX bid at LY1, BOTH out of range. No in-range y at all, so before the
  // `crossing` flag this died at settlement with u1012.
  const LX5 = (MID * 99n) / 100n; // x-taker floor, below LY1 -> crosses both
  const Y2_AMT = 20_000_000n;
  b = depositY(STX_DEPOSITOR_1, Y2_AMT, LY1)(b); // out-of-range bid 20 STX
  const BIG5 = 20_000n; // sats; the two bids absorb a few thousand at most
  let A7 = (BIG5 * BPS) / (BPS - REB);
  while (A7 - (A7 * REB) / BPS < BIG5) A7 += 1n;
  b = evalM(`(get-token-y-deposit u4 '${Y1})`)(b); // Y1 rolled bid before
  b = swap(SBTC_DEPOSITOR_1, A7, LX5, true)(b); // -> u1023
  b = evalM("(get-current-cycle)")(b); // still u4
  b = evalM(`(get-token-y-deposit u4 '${Y1})`)(b); // unchanged

  // ---------- S5: cross-only, sized -> whole fill by the walk ----------
  // 1500 sats net: Y1 (list-first) absorbs its ~177, the 20 STX bid the rest.
  const NET6 = 1500n;
  let A6 = (NET6 * BPS) / (BPS - REB);
  while (A6 - (A6 * REB) / BPS < NET6) A6 += 1n;
  const REBATE6 = (A6 * REB) / BPS;
  const NET6r = A6 - REBATE6; // exact net after the search (>= NET6)
  b = evalSbtcBal(Y1)(b);
  b = evalSbtcBal(STX_DEPOSITOR_1)(b);
  b = swap(SBTC_DEPOSITOR_1, A6, LX5, true)(b); // ok
  b = evalSbtcBal(Y1)(b);
  b = evalSbtcBal(STX_DEPOSITOR_1)(b);
  b = evalM("(get-current-cycle)")(b); // u5
  b = evalM(`(get-token-x-deposit u5 '${SBTC_DEPOSITOR_1})`)(b); // 0 residual
  b = evalM(`(get-token-y-deposit u5 '${Y1})`)(b); // crumbs or 0
  b = evalM(`(get-token-y-deposit u5 '${STX_DEPOSITOR_1})`)(b); // 20 STX - y2
  b = evalM("(var-get pending-rebate-x)")(b); // pot zeroed

  const repriceY = (sender, limit) =>
    call(sender, "reprice-or-swap-token-y", [uintCV(limit), DUMMY_VAA, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset]);
  const repriceX = (sender, limit) =>
    call(sender, "reprice-or-swap-token-x", [uintCV(limit), DUMMY_VAA, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset]);
  const settlePublic = (sender) =>
    call(sender, "settle-with-refresh", [DUMMY_VAA, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset]);

  // ---------- S6: mirror cross-only, sized (y-taker vs out-of-range asks) ----------
  // Book in u5, x side: M2 dust (~400 @ L2), M3 2000 @ L3 (+2%), nothing in
  // range. Fresh STX actor Y2 (no resting position -> passes u1024).
  const Y2 = mkAddr(10);
  const LT6 = (MID * 103n) / 100n; // +3%, reaches L3
  const NET8 = 1_200_000n; // uSTX, buys ~1.8k sats of M3 at L3
  let A8 = (NET8 * BPS) / (BPS - REB);
  while (A8 - (A8 * REB) / BPS < NET8) A8 += 1n;
  const REBATE8 = (A8 * REB) / BPS;
  const NET8r = A8 - REBATE8;
  b = stxSend(Y2, 6_000_000)(b);
  b = evalStxBal(M3)(b);
  b = evalSbtcBal(Y2)(b);
  b = swap(Y2, A8, LT6, false)(b); // ok
  b = evalStxBal(M3)(b);
  b = evalSbtcBal(Y2)(b);
  b = evalM("(get-current-cycle)")(b); // u6
  b = evalM(`(get-token-y-deposit u6 '${Y2})`)(b); // 0 (sub-min residual refunded)
  b = evalM(`(get-token-x-deposit u6 '${M3})`)(b); // 2000 - X8
  b = evalM("(var-get pending-rebate-y)")(b); // 0

  // ---------- S7a: reprice-or-swap-token-y through the walk ----------
  // Scale check: at this mid 1 STX ~ 155 sats. The resting ~11.5 STX bid is
  // ~1.8k sats. X4 posts a 1000-sat in-range ask (mid leg); SBTC_DEPOSITOR_1
  // posts a 2500-sat ask at L3 (walk leg). Reprice the bid to +3% -> takes.
  b = depositX(X4, 1000n, 1n)(b); // in-range ask (mid leg)
  b = depositX(SBTC_DEPOSITOR_1, 2500n, L3)(b); // out-of-range ask (walk leg)
  // NOTE: M3 still rests 1818 sats at L3 (above min) and is EARLIER in the
  // x list than the new ask, so the walk pays M3; the 2500-sat ask is a
  // same-price backstop that stays untouched (price tie: arrival order kept).
  b = evalM(`(get-token-y-deposit u6 '${STX_DEPOSITOR_1})`)(b); // Y7 (read-back)
  b = evalM(`(get-token-x-deposit u6 '${M3})`)(b); // M3 size (read-back)
  b = evalStxBal(X4)(b);
  b = evalStxBal(M3)(b);
  b = evalStxBal(SBTC_DEPOSITOR_1)(b);
  b = evalSbtcBal(STX_DEPOSITOR_1)(b);
  b = repriceY(STX_DEPOSITOR_1, LT6)(b); // ok, takes
  b = evalStxBal(X4)(b);
  b = evalStxBal(M3)(b);
  b = evalStxBal(SBTC_DEPOSITOR_1)(b);
  b = evalSbtcBal(STX_DEPOSITOR_1)(b);
  b = evalM("(get-current-cycle)")(b); // u7
  b = evalM(`(get-token-y-deposit u7 '${STX_DEPOSITOR_1})`)(b); // 0
  b = evalM(`(get-token-x-deposit u7 '${X4})`)(b); // 0 (cleared at mid)
  b = evalM(`(get-token-x-deposit u7 '${M3})`)(b); // M3 - X7
  b = evalM(`(get-token-x-deposit u7 '${SBTC_DEPOSITOR_1})`)(b); // 2500 untouched
  b = evalM("(var-get pending-rebate-y)")(b); // 0

  // ---------- S7b: reprice-or-swap-token-x through the walk ----------
  // Mirror. STX_DEPOSITOR_1 posts a 6-STX in-range bid (mid leg), Y2 an
  // 8-STX bid at LY1 (walk leg). The leftover L3 ask reprices to -1% -> takes.
  b = stxSend(Y2, 12_000_000)(b);
  b = depositY(STX_DEPOSITOR_1, 6_000_000n, 999_999_999_999_999n)(b); // in-range bid
  b = depositY(Y2, 12_000_000n, LY1)(b); // out-of-range bid (walk leg, > remainder)
  b = evalM(`(get-token-x-deposit u7 '${SBTC_DEPOSITOR_1})`)(b); // rem7 (read-back)
  b = evalSbtcBal(STX_DEPOSITOR_1)(b);
  b = evalSbtcBal(Y2)(b);
  b = repriceX(SBTC_DEPOSITOR_1, LX5)(b); // ok, takes
  b = evalSbtcBal(STX_DEPOSITOR_1)(b);
  b = evalSbtcBal(Y2)(b);
  b = evalM("(get-current-cycle)")(b); // u8
  b = evalM(`(get-token-x-deposit u8 '${SBTC_DEPOSITOR_1})`)(b); // 0
  b = evalM(`(get-token-y-deposit u8 '${STX_DEPOSITOR_1})`)(b); // 0 (cleared at mid)
  b = evalM(`(get-token-y-deposit u8 '${Y2})`)(b); // 12 STX - YW
  b = evalM("(var-get pending-rebate-x)")(b); // 0

  // ---------- S9: ERR_ZERO_MIN_DEPOSIT ----------
  const MARKET0 = `${MARKET}-zero`;
  b = call(DEPLOYER, "set-min-token-y-deposit", [uintCV(0)])(b); // u1025
  b = call(DEPLOYER, "set-min-token-x-deposit", [uintCV(0)])(b); // u1025
  b = b.withSender(DEPLOYER).addContractDeploy({ contract_name: MARKET0, source_code: mktSrc });
  b = call(DEPLOYER, "initialize", [
    contractPrincipalCV(DEPLOYER, MARKET0),
    contractPrincipalCV(SBTC_ADDR, SBTC_NAME),
    contractPrincipalCV(WSTX_ADDR, WSTX_NAME),
    uintCV(0), uintCV(MIN_STX), btcFeedBuf, stxFeedBuf,
  ], `${DEPLOYER}.${MARKET0}`)(b); // u1025
  b = call(DEPLOYER, "initialize", [
    contractPrincipalCV(DEPLOYER, MARKET0),
    contractPrincipalCV(SBTC_ADDR, SBTC_NAME),
    contractPrincipalCV(WSTX_ADDR, WSTX_NAME),
    uintCV(MIN_SBTC), uintCV(0), btcFeedBuf, stxFeedBuf,
  ], `${DEPLOYER}.${MARKET0}`)(b); // u1025

  // ---------- S8 (last): public settle with the flag false ----------
  // x side gets a 1500-sat ask at L3 so close-deposits sees min on both
  // sides; nothing is in range on either side after the limit roll.
  b = depositX(SBTC_DEPOSITOR_1, 1500n, L3)(b);
  b = evalM("(var-get crossing)")(b); // false
  const NET9 = 1_500_000n;
  let A9 = (NET9 * BPS) / (BPS - REB);
  while (A9 - (A9 * REB) / BPS < NET9) A9 += 1n;
  b = swap(X5, A9, LT, false)(b); // +1% < L3 -> walk finds nothing -> u1023
  b = evalM("(var-get crossing)")(b); // still false (revert unwound it)
  b = call(DEPLOYER, "close-deposits", [])(b); // ok (public)
  b = settlePublic(DEPLOYER)(b); // u1012: flag false, both sides empty at mid
  b = evalM("(get-current-cycle)")(b); // u8

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid);
  const s = res.steps;

  let i = 0;
  assert("deploy core", decodeTx(s[i++]), (v) => !String(v).includes("ERR"));
  assert("deploy market (patched)", decodeTx(s[i++]), (v) => !String(v).includes("ERR"));
  assert("set-verified-contract", decodeTx(s[i++]), "(ok true)");
  assert("initialize", decodeTx(s[i++]), "(ok true)");
  for (let k = 0; k < 9; k++)
    assert(`funding tx ${k}`, decodeTx(s[i++]), (v) => String(v).startsWith("(ok"));
  assert("X1 in-range offer", decodeTx(s[i++]), `(ok u${X1_AMT})`);
  assert("M2 out-of-range offer", decodeTx(s[i++]), `(ok u${M2_AMT})`);
  assert("M3 far offer", decodeTx(s[i++]), `(ok u${M3_AMT})`);
  const x1Before = uintOf(decodeEval(s[i++]));
  const m2Before = uintOf(decodeEval(s[i++]));
  const tSbtcBefore = uintOf(decodeEval(s[i++]));
  const s1Tuple = String(decodeTx(s[i++]));
  assert("S1 swap full fill via walk", s1Tuple, (v) => v.startsWith("(ok"));
  // post-walk tuple: received = mid + walk, rolled = the sub-min uSTX the
  // walk could not place (floor to sats and back), refunded to the taker,
  // rebate-refunded = the crumbs the walk did not spend. So the taker's true
  // spend is A1 - S1_REM - S1_CRUMBS.
  const S1_CRUMBS = PEND_Y - REB2;
  const S1_REM = R1 - Y2_TRADED;
  assert(`S1 tuple token-x-received = mid + walk (${TAKER_SBTC_GAIN})`, s1Tuple, (v) => v.includes(`(token-x-received u${TAKER_SBTC_GAIN})`));
  assert(`S1 tuple token-y-rolled = refunded residual (${S1_REM}, < ${MIN_STX})`, s1Tuple, (v) => S1_REM < MIN_STX && v.includes(`(token-y-rolled u${S1_REM})`));
  assert(`S1 tuple rebate-refunded = crumbs (${S1_CRUMBS})`, s1Tuple, (v) => v.includes(`(rebate-refunded u${S1_CRUMBS})`));
  const x1After = uintOf(decodeEval(s[i++]));
  const m2After = uintOf(decodeEval(s[i++]));
  const tSbtcAfter = uintOf(decodeEval(s[i++]));
  assert(`X1 mid payout incl ride (${X1_STX_GAIN})`, x1After - x1Before, (d) => d === X1_STX_GAIN);
  assert(`M2 crossed payout at own limit (${M2_STX_GAIN})`, m2After - m2Before, (d) => d === M2_STX_GAIN);
  assert(`taker sBTC gain (${TAKER_SBTC_GAIN})`, tSbtcAfter - tSbtcBefore, (d) => d === TAKER_SBTC_GAIN);
  assert("cycle -> u1", decodeEval(s[i++]), "u1");
  assert(`M2 remaining ${M2_LEFT}`, decodeEval(s[i++]), `u${M2_LEFT}`);
  assert("M3 untouched", decodeEval(s[i++]), `u${M3_AMT}`);
  assert("taker residual cleaned", decodeEval(s[i++]), "u0");
  assert("rebate pot zeroed", decodeEval(s[i++]), "u0");
  assert("escrow STX == 0 resting", decodeEval(s[i++]), "u0");
  const escrowSbtc = uintOf(decodeEval(s[i++]));
  assert(`escrow sBTC == M2left+M3 (${M2_LEFT + M3_AMT})`, escrowSbtc, (v) => v === M2_LEFT + M3_AMT);

  const t2Before = uintOf(decodeEval(s[i++]));
  assert("S2 no-mid-liquidity -> walk runs, partial -> u1023", decodeTx(s[i++]), "(err u1023)");
  const t2After = uintOf(decodeEval(s[i++]));
  assert("S2 atomic (taker sBTC unchanged)", t2After - t2Before, (d) => d === 0n);
  assert("S2 cycle unchanged", decodeEval(s[i++]), "u1");
  assert("S2 M2 unchanged", decodeEval(s[i++]), `u${M2_LEFT}`);

  assert("X4 in-range offer", decodeTx(s[i++]), "(ok u1500)");
  assert("S2b beyond-limit -> u1023", decodeTx(s[i++]), "(err u1023)");
  assert("S2b cycle unchanged", decodeEval(s[i++]), "u1");
  assert("S2b X4 still resting", decodeEval(s[i++]), "u1500");

  assert("S3 swap ok (leaves dust maker)", decodeTx(s[i++]), (v) => String(v).startsWith("(ok"));
  assert("S3 cycle -> u2", decodeEval(s[i++]), "u2");
  const dust = uintOf(decodeEval(s[i++]));
  assert(`S3 M2 dust ~400 (<${MIN_SBTC})`, dust, (v) => v > 0n && v < MIN_SBTC);
  assert("S3 taker clean", decodeEval(s[i++]), "u0");

  assert("X5 in-range offer", decodeTx(s[i++]), "(ok u1200)");
  i++; // taker STX before (informational)
  const s3bTuple = String(decodeTx(s[i++]));
  assert("S3b sub-min remainder refunds, swap ok", s3bTuple, (v) => v.startsWith("(ok"));
  const s3bRolled = uintOf(s3bTuple.match(/\(token-y-rolled (u\d+)\)/)?.[1] ?? "u0");
  assert(`S3b tuple token-y-rolled = refunded residual (0 < r < ${MIN_STX})`, s3bRolled, (v) => v > 0n && v < MIN_STX);
  assert("S3b tuple token-x-received > 0 (mid fill reported)", s3bTuple, (v) => /\(token-x-received u[1-9]\d*\)/.test(v));
  assert("S3b cycle -> u3", decodeEval(s[i++]), "u3");
  assert("S3b dust maker untouched", decodeEval(s[i++]), `u${dust}`);
  assert("S3b taker clean", decodeEval(s[i++]), "u0");

  assert("S4 in-range y bid", decodeTx(s[i++]), "(ok u20000000)");
  assert("S4 out-of-range y bid", decodeTx(s[i++]), "(ok u5000000)");
  const y1Before = uintOf(decodeEval(s[i++]));
  assert("S4 x-taker swap ok", decodeTx(s[i++]), (v) => String(v).startsWith("(ok"));
  const y1After = uintOf(decodeEval(s[i++]));
  assert("S4 Y1 received sBTC at own bid", y1After - y1Before, (d) => d > 0n);
  assert("S4 cycle -> u4", decodeEval(s[i++]), "u4");
  assert("S4 x-walker zero residual", decodeEval(s[i++]), "u0");

  assert("S5b 20 STX out-of-range bid", decodeTx(s[i++]), `(ok u${Y2_AMT})`);
  const y1Bid = uintOf(decodeEval(s[i++]));
  assert("S5b Y1 rolled bid rests (>= min)", y1Bid, (v) => v >= MIN_STX);
  assert("S5b cross-only oversize -> u1023", decodeTx(s[i++]), "(err u1023)");
  assert("S5b cycle unchanged", decodeEval(s[i++]), "u4");
  assert("S5b Y1 bid unchanged", decodeEval(s[i++]), `u${y1Bid}`);

  // walk expectations from the read-back Y1 bid (contract order of ops)
  const X6a = (y1Bid * PPDF) / LY1; // Y1 absorbs (x-from-y, clamps the taker)
  const Y6a = (X6a * LY1) / PPDF; // uSTX Y1 actually spends (floors)
  const X6b = NET6r - X6a; // remainder walks into the 20 STX bid
  const Y6b = (X6b * LY1) / PPDF;
  const REB6a = (X6a * REB) / BPS; // both below the pot (REBATE6 > NET6r*REB/BPS)
  const REB6b = (X6b * REB) / BPS;
  const Y1_GAIN = X6a - (X6a * FEE) / BPS + REB6a;
  const Y2_GAIN = X6b - (X6b * FEE) / BPS + REB6b;
  const y1SbtcBefore = uintOf(decodeEval(s[i++]));
  const y2SbtcBefore = uintOf(decodeEval(s[i++]));
  assert("S5 cross-only sized swap ok", decodeTx(s[i++]), (v) => String(v).startsWith("(ok"));
  const y1SbtcAfter = uintOf(decodeEval(s[i++]));
  const y2SbtcAfter = uintOf(decodeEval(s[i++]));
  assert(`S5 Y1 paid at own limit net+rebate (${Y1_GAIN})`, y1SbtcAfter - y1SbtcBefore, (d) => d === Y1_GAIN);
  assert(`S5 20-STX bid paid at own limit net+rebate (${Y2_GAIN})`, y2SbtcAfter - y2SbtcBefore, (d) => d === Y2_GAIN);
  assert("S5 cycle -> u5", decodeEval(s[i++]), "u5");
  assert("S5 taker residual 0", decodeEval(s[i++]), "u0");
  assert(`S5 Y1 left with crumbs (${y1Bid - Y6a})`, decodeEval(s[i++]), `u${y1Bid - Y6a}`);
  assert(`S5 20-STX bid keeps the rest (${Y2_AMT - Y6b})`, decodeEval(s[i++]), `u${Y2_AMT - Y6b}`);
  assert("S5 rebate pot zeroed", decodeEval(s[i++]), "u0");

  // S6
  assert("S6 fund Y2", decodeTx(s[i++]), (v) => String(v).startsWith("(ok"));
  const m3StxBefore = uintOf(decodeEval(s[i++]));
  const y2SbtcBefore6 = uintOf(decodeEval(s[i++]));
  assert("S6 y-taker cross-only swap ok", decodeTx(s[i++]), (v) => String(v).startsWith("(ok"));
  const m3StxAfter = uintOf(decodeEval(s[i++]));
  const y2SbtcAfter6 = uintOf(decodeEval(s[i++]));
  const X8 = (NET8r * PPDF) / L3; // sats M3 sells (< 2000)
  const Y8 = (X8 * L3) / PPDF; // uSTX M3 receives gross
  const M3_GAIN = Y8 - (Y8 * FEE) / BPS + (Y8 * REB) / BPS;
  const Y2_SBTC_GAIN = X8 - (X8 * FEE) / BPS;
  assert(`S6 M3 paid at own limit net+rebate (${M3_GAIN})`, m3StxAfter - m3StxBefore, (d) => d === M3_GAIN);
  assert(`S6 taker got sBTC net of fee (${Y2_SBTC_GAIN})`, y2SbtcAfter6 - y2SbtcBefore6, (d) => d === Y2_SBTC_GAIN);
  assert("S6 cycle -> u6", decodeEval(s[i++]), "u6");
  assert("S6 taker residual refunded (sub-min)", decodeEval(s[i++]), "u0");
  assert(`S6 M3 left with ${M3_AMT - X8}`, decodeEval(s[i++]), `u${M3_AMT - X8}`);
  assert("S6 rebate pot y zeroed", decodeEval(s[i++]), "u0");

  // S7a
  assert("S7a X4 in-range ask", decodeTx(s[i++]), "(ok u1000)");
  assert("S7a 2500-sat ask at L3", decodeTx(s[i++]), "(ok u2500)");
  const Y7 = uintOf(decodeEval(s[i++]));
  assert("S7a resting bid == S5 leftover", Y7, (v) => v === Y2_AMT - Y6b);
  const m3Size = uintOf(decodeEval(s[i++]));
  assert("S7a M3 rests above min (walk target)", m3Size, (v) => v === M3_AMT - X8 && v >= MIN_SBTC);
  const x4StxBefore = uintOf(decodeEval(s[i++]));
  const m3StxBefore7 = uintOf(decodeEval(s[i++]));
  const sd1StxBefore = uintOf(decodeEval(s[i++]));
  const stxd1SbtcBefore = uintOf(decodeEval(s[i++]));
  assert("S7a reprice-or-swap-token-y ok", decodeTx(s[i++]), (v) => String(v).startsWith("(ok"));
  const x4StxAfter = uintOf(decodeEval(s[i++]));
  const m3StxAfter7 = uintOf(decodeEval(s[i++]));
  const sd1StxAfter = uintOf(decodeEval(s[i++]));
  const stxd1SbtcAfter = uintOf(decodeEval(s[i++]));
  // mid leg: x binding (1000 sats worth less than Y7), same formulas as S1
  const YC7 = (1000n * MID) / PPDF; // uSTX cleared at mid
  const R7 = Y7 - YC7; // rolled remainder walks
  const REBATE7 = (Y7 * REB) / BPS;
  const RIDE7 = (REBATE7 * YC7) / Y7;
  const PEND7 = REBATE7 - RIDE7;
  const X4_GAIN = YC7 - (YC7 * FEE) / BPS + RIDE7;
  // walk leg
  const X7 = (R7 * PPDF) / L3;
  const Y7t = (X7 * L3) / PPDF;
  const REB7raw = (Y7t * REB) / BPS;
  const REB7 = REB7raw > PEND7 ? PEND7 : REB7raw;
  const SD1_STX_GAIN = Y7t - (Y7t * FEE) / BPS + REB7;
  const STXD1_SBTC_GAIN = 1000n - (1000n * FEE) / BPS + (X7 - (X7 * FEE) / BPS);
  assert(`S7a mid maker paid at mid + ride (${X4_GAIN})`, x4StxAfter - x4StxBefore, (d) => d === X4_GAIN);
  assert(`S7a walked maker (M3, list-first) paid at L3 net+rebate (${SD1_STX_GAIN})`, m3StxAfter7 - m3StxBefore7, (d) => d === SD1_STX_GAIN);
  assert("S7a later same-price ask untouched (tie keeps arrival order)", sd1StxAfter - sd1StxBefore, (d) => d === 0n);
  assert(`S7a repriced bid got sBTC mid+walk (${STXD1_SBTC_GAIN})`, stxd1SbtcAfter - stxd1SbtcBefore, (d) => d === STXD1_SBTC_GAIN);
  assert("S7a cycle -> u7", decodeEval(s[i++]), "u7");
  assert("S7a bid fully consumed (dust refunded)", decodeEval(s[i++]), "u0");
  assert("S7a X4 cleared at mid", decodeEval(s[i++]), "u0");
  assert(`S7a M3 left ${m3Size - X7}`, decodeEval(s[i++]), `u${m3Size - X7}`);
  assert("S7a 2500-sat ask untouched", decodeEval(s[i++]), "u2500");
  assert("S7a rebate pot y zeroed", decodeEval(s[i++]), "u0");

  // S7b
  assert("S7b top up Y2", decodeTx(s[i++]), (v) => String(v).startsWith("(ok"));
  assert("S7b 6-STX in-range bid", decodeTx(s[i++]), "(ok u6000000)");
  assert("S7b Y2 12-STX bid at LY1", decodeTx(s[i++]), "(ok u12000000)");
  const rem7 = uintOf(decodeEval(s[i++]));
  assert("S7b resting ask == 2500 (untouched in S7a)", rem7, (v) => v === 2500n);
  const stxd1SbtcBefore7 = uintOf(decodeEval(s[i++]));
  const y2SbtcBefore7 = uintOf(decodeEval(s[i++]));
  assert("S7b reprice-or-swap-token-x ok", decodeTx(s[i++]), (v) => String(v).startsWith("(ok"));
  const stxd1SbtcAfter7 = uintOf(decodeEval(s[i++]));
  const y2SbtcAfter7 = uintOf(decodeEval(s[i++]));
  // mid leg: y binding (6 STX worth fewer sats than rem7)
  const XC7 = (6_000_000n * PPDF) / MID; // sats cleared at mid
  const XW = rem7 - XC7; // rolled remainder walks
  const REBATE7x = (rem7 * REB) / BPS;
  const RIDE7x = (REBATE7x * XC7) / rem7;
  const PEND7x = REBATE7x - RIDE7x;
  const STXD1_SBTC_GAIN7 = XC7 - (XC7 * FEE) / BPS + RIDE7x;
  // walk leg
  const YW = (XW * LY1) / PPDF;
  const REBwRaw = (XW * REB) / BPS;
  const REBw = REBwRaw > PEND7x ? PEND7x : REBwRaw;
  const Y2_SBTC_GAIN7 = XW - (XW * FEE) / BPS + REBw;
  assert(`S7b mid bid paid at mid + ride (${STXD1_SBTC_GAIN7})`, stxd1SbtcAfter7 - stxd1SbtcBefore7, (d) => d === STXD1_SBTC_GAIN7);
  assert(`S7b Y2 paid at own bid net+rebate (${Y2_SBTC_GAIN7})`, y2SbtcAfter7 - y2SbtcBefore7, (d) => d === Y2_SBTC_GAIN7);
  assert("S7b cycle -> u8", decodeEval(s[i++]), "u8");
  assert("S7b x-walker residual 0", decodeEval(s[i++]), "u0");
  assert("S7b mid bid cleared", decodeEval(s[i++]), "u0");
  assert(`S7b Y2 bid left ${12_000_000n - YW}`, decodeEval(s[i++]), `u${12_000_000n - YW}`);
  assert("S7b rebate pot x zeroed", decodeEval(s[i++]), "u0");

  // S9
  assert("S9 set-min-token-y-deposit u0 -> u1025", decodeTx(s[i++]), "(err u1025)");
  assert("S9 set-min-token-x-deposit u0 -> u1025", decodeTx(s[i++]), "(err u1025)");
  assert("S9 deploy zero-min market", decodeTx(s[i++]), (v) => !String(v).includes("ERR"));
  assert("S9 initialize min-x u0 -> u1025", decodeTx(s[i++]), "(err u1025)");
  assert("S9 initialize min-y u0 -> u1025", decodeTx(s[i++]), "(err u1025)");

  // S8
  assert("S8 1500-sat ask at L3", decodeTx(s[i++]), "(ok u1500)");
  assert("S8 crossing false before", decodeEval(s[i++]), "false");
  assert("S8 swap reverts in walk -> u1023", decodeTx(s[i++]), "(err u1023)");
  assert("S8 crossing false after revert", decodeEval(s[i++]), "false");
  assert("S8 public close-deposits ok", decodeTx(s[i++]), (v) => String(v).startsWith("(ok"));
  assert("S8 public settle, all out of range -> u1012", decodeTx(s[i++]), "(err u1012)");
  assert("S8 cycle unchanged", decodeEval(s[i++]), "u8");

  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
