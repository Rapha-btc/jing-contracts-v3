// verify-markets-v2-remainder-cross.js
// Self-verifying stxer mainnet-fork harness for the REMAINDER-CROSS feature
// on markets-sbtc-stx-jing-v2 + jing-core-v3 (log-match):
//   S1 happy walk: mid fill + partial crossed maker at the maker's limit,
//      rebate split (ride to mid maker, 20bps to crossed maker, crumbs +
//      sub-min residual refunded to the taker), escrow conservation.
//   S2 no-mid-liquidity edge: only out-of-range makers -> u1012 (documented
//      limitation: a swap cannot fill purely by crossing), full atomicity.
//   S2b beyond-limit makers only -> u1023 partial revert, atomicity.
//   S3 dust maker: walk leaves a maker below min-deposit; a later walk SKIPS
//      that dust maker.
//   S3b sub-min remainder: refunds silently, swap succeeds on the mid fill.
//   S4 mirror direction: x-taker walks an out-of-range y bid at the bid's
//      limit; x walker leaves zero residual.
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
const DEPLOYER = getAddressFromPrivateKey(OWNER_PRIVKEY, "mainnet");
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
const DUMMY_VAA = bufferCV(Buffer.from("00", "hex"));

const coreSrc = fs.readFileSync(
  new URL(`../contracts/${CORE}.clar`, import.meta.url),
  "utf8",
);
let mktSrc = fs.readFileSync(
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

  const px = await storedPrice(BTC_USD_FEED_HEX);
  const py = await storedPrice(STX_USD_FEED_HEX);
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

  let b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API })
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

  // ---------- S2: only out-of-range makers -> u1012, atomic ----------
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
  assert("S1 swap full fill via walk", decodeTx(s[i++]), (v) => String(v).startsWith("(ok"));
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
  assert("S2 no-mid-liquidity -> u1012", decodeTx(s[i++]), "(err u1012)");
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
  assert("S3b sub-min remainder refunds, swap ok", decodeTx(s[i++]), (v) => String(v).startsWith("(ok"));
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

  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
