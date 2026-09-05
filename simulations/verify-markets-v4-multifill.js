// PORTED TO markets-sbtc-stx-jing-v4 (Pyth Lazer): market UNPATCHED, one real
// signed Lazer update (PYTH_API_KEY) replaces the dummy VAA; feed ids u1/u45.
// Everything below is the v2 harness otherwise. Run: PYTH_API_KEY=<key> npx tsx simulations/verify-markets-v4-multifill.js
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
  "7777777777777777777777777777777777777777777777777777777777777777" + "01";
// LIVE=1: exact deployed bytes at the mainnet contract ids (same deployer,
// on-chain source, no patches), real Granite dual-feed VAA of 2026-08-17,
// fork 8785968. See verify-markets-v2-remainder-cross.js for the rationale.
const LIVE = process.env.LIVE === "1";
const LIVE_DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const LIVE_FORK = 8785968;
const LIVE_PX = 6362215887773n;
const LIVE_PY = 12143400n;
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
const MARKET = "markets-sbtc-stx-jing-v4"; // Pyth Lazer, UNPATCHED
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
let DUMMY_VAA = bufferCV(Buffer.from("00", "hex")); // replaced by the real Lazer update in main()

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
  // v4: no sim patches, the market runs UNPATCHED on a real Lazer update
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
  console.log("=== multi-fill walk harness (8 makers, one swap) ===\n");
  const lz = await fetchLazerUpdate();
  DUMMY_VAA = bufferCV(Buffer.from(lz.hex, "hex"));
  const px = lz.px, py = lz.py;
  console.log(`Lazer update ${lz.hex.length / 2} bytes, ts ${new Date(lz.ts * 1000).toISOString()}, expo ${lz.expo}; market UNPATCHED`);
  const MID = (px * PP) / py;
  console.log(`mid=${MID} deployer=${DEPLOYER}\n`);

  const call = (sender, fn, args, cid = CID) => (b) =>
    b.withSender(sender).addContractCall({
      contract_id: cid, function_name: fn, function_args: args });
  const depositX = (sender, amount, limit) =>
    call(sender, "deposit-token-x", [uintCV(amount), uintCV(limit), DUMMY_VAA, sbtcTrait, sbtcAsset]);
  const swap = (sender, amount, limit) =>
    call(sender, "swap", [uintCV(amount), uintCV(limit), DUMMY_VAA, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset, falseCV()]);

  const N = 8;
  const makers = Array.from({ length: N }, (_, k) => mkAddr(10 + k));
  const limits = makers.map((_, k) => (MID * BigInt(1002 + k)) / 1000n); // +0.2%..+0.9%
  const AMT = 1100n;

  let b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  if (LIVE) b = b.useBlockHeight(LIVE_FORK);
  b = b
    .withSender(DEPLOYER)
    .addContractDeploy({ contract_name: CORE, source_code: coreSrc })
    .addContractDeploy({ contract_name: MARKET, source_code: mktSrc })
    .addContractCall({ contract_id: CORE_ID, function_name: "set-verified-contract", function_args: [marketCV] })
    .addContractCall({ contract_id: CID, function_name: "initialize", function_args: [
      marketCV, contractPrincipalCV(SBTC_ADDR, SBTC_NAME), contractPrincipalCV(WSTX_ADDR, WSTX_NAME),
      uintCV(MIN_SBTC), uintCV(MIN_STX), uintCV(1n), uintCV(45n) ] });

  for (const m of makers) {
    b = b.withSender(STX_DEPOSITOR_1).addSTXTransfer({ recipient: m, amount: 3_000_000 });
    b = b.withSender(SBTC_DEPOSITOR_1).addContractCall({
      contract_id: SBTC_FQN, function_name: "transfer",
      function_args: [uintCV(1500n), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(m), noneCV()] });
  }
  b = depositX(SBTC_DEPOSITOR_1, 2000n, 1n)(b); // in-range
  for (let k = 0; k < N; k++) b = depositX(makers[k], AMT, limits[k])(b);

  // taker consumes in-range 2000 at mid + ALL 8 makers fully at their limits
  const xValue = (2000n * MID) / PPDF;
  let walkCost = 0n;
  for (let k = 0; k < N; k++) walkCost += (AMT * limits[k]) / PPDF + 1n; // +1 slack per fill
  const NET_T = xValue + walkCost;
  let A = (NET_T * BPS) / (BPS - REB);
  while (A - (A * REB) / BPS < NET_T) A += 1n;

  b = b.addEvalCode(SBTC_FQN, `(get-balance '${STX_DEPOSITOR_1})`);
  b = swap(STX_DEPOSITOR_1, A, (MID * 101n) / 100n)(b);
  b = b.addEvalCode(SBTC_FQN, `(get-balance '${STX_DEPOSITOR_1})`);
  b = b.addEvalCode(CID, "(get-current-cycle)");
  for (let k = 0; k < N; k++) b = b.addEvalCode(CID, `(get-token-x-deposit u1 '${makers[k]})`);
  b = b.addEvalCode(CID, `(get-token-y-deposit u1 '${STX_DEPOSITOR_1})`);
  b = b.addEvalCode(SBTC_FQN, `(get-balance '${CID})`);
  b = b.addEvalCode(CID, "(var-get pending-rebate-y)");

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid);
  const s2 = res.steps;
  let i = 0;
  for (let k = 0; k < 4; k++) assert(`setup ${k}`, decodeTx(s2[i++]), (v) => String(v).startsWith("(ok"));
  for (let k = 0; k < N * 2; k++) assert(`fund ${k}`, decodeTx(s2[i++]), (v) => String(v).startsWith("(ok"));
  assert("in-range offer", decodeTx(s2[i++]), "(ok u2000)");
  for (let k = 0; k < N; k++) assert(`maker ${k} rests`, decodeTx(s2[i++]), `(ok u${AMT})`);
  const tBefore = uintOf(decodeEval(s2[i++]));
  assert("multi-fill swap ok", decodeTx(s2[i++]), (v) => String(v).startsWith("(ok"));
  const tAfter = uintOf(decodeEval(s2[i++]));
  const grossX = 2000n + AMT * BigInt(N);
  assert(`taker got ~all inventory net of fees (${tAfter - tBefore})`, tAfter - tBefore,
    (d) => d > grossX - (grossX * FEE) / BPS - 20n && d <= grossX);
  assert("cycle -> u1", decodeEval(s2[i++]), "u1");
  for (let k = 0; k < N; k++) assert(`maker ${k} fully consumed`, decodeEval(s2[i++]), "u0");
  assert("taker residual clean", decodeEval(s2[i++]), "u0");
  assert("escrow sBTC empty", decodeEval(s2[i++]), "u0");
  assert("pot zeroed", decodeEval(s2[i++]), "u0");
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
