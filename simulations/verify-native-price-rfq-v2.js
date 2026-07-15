// verify-native-price-rfq-v2.js
// Band-health probe for rfq-sbtc-stx-jing-v2's native BTC/STX price (1-day /
// 48-sample miner-commit window, fixed 1.0 efficiency). Deploys jing-core-v2 +
// the v2 market at the live mainnet tip, evals get-native-price plus a spread
// of raw per-tenure spends, then reports the deviation vs live market and the
// distance to the hardcoded [0.5x, 2x] fat-finger band limits.
//
// This is the same check the backend auto-disable monitor runs: if
// native/market drifts past ~1.7x (or under ~0.55x) the operator key should
// fire set-band-enabled false before the band starts reverting honest fixes.
//
// Run: npx tsx simulations/verify-native-price-rfq-v2.js
import {
  deserializeCV,
  cvToString,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import fs from "node:fs";

const STACKS_NODE_API = "http://77.42.3.101/stacks-api";

// Throwaway deployer (canonical SPV9K21 already has jing-core on mainnet)
const OWNER_PRIVKEY =
  "3333333333333333333333333333333333333333333333333333333333333333" + "01";
const DEPLOYER = getAddressFromPrivateKey(OWNER_PRIVKEY, "mainnet");

const CORE = "jing-core-v2";
const MARKET = "rfq-sbtc-stx-jing-v2";
const CID = `${DEPLOYER}.${MARKET}`;

const coreSrc = fs.readFileSync(
  new URL("../contracts/rfq/deploying/jing-core-v2.clar", import.meta.url),
  "utf8"
);
const mktSrc = fs.readFileSync(
  new URL(`../contracts/rfq/${MARKET}.clar`, import.meta.url),
  "utf8"
);

// Spot-check a subset of the contract's 48 offsets (first/middle/last few) so
// the raw spends are visible without 144 eval steps.
const SPOT_OFFSETS = [1, 4393, 8785, 13177, 17203];
const COINBASE_USTX = 500_000_000n; // 500 STX
const PRICE_PRECISION = 100_000_000n;
const NATIVE_PRICE_NUM = 100n * COINBASE_USTX * PRICE_PRECISION; // 5e18

const b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API })
  .withSender(DEPLOYER)
  .addContractDeploy({ contract_name: CORE, source_code: coreSrc })
  .addContractDeploy({ contract_name: MARKET, source_code: mktSrc });

const evalLabels = [];
const addEval = (label, code) => {
  evalLabels.push(label);
  b.addEvalCode(CID, code);
};

addEval("stacks-block-height", "stacks-block-height");
addEval("burn-block-height", "burn-block-height");
for (const o of SPOT_OFFSETS) {
  addEval(
    `spend-total@-${o}`,
    `(get-tenure-info? miner-spend-total (- stacks-block-height u${o}))`
  );
  addEval(
    `burn-hash@-${o}`,
    `(get-tenure-info? burnchain-header-hash (- stacks-block-height u${o}))`
  );
}
addEval("band-enabled", "(get-band-enabled)");
addEval("get-native-price", "(get-native-price)");

console.log(`deployer: ${DEPLOYER}`);
const sessionId = await b.run();
console.log(`session:  https://stxer.xyz/simulations/mainnet/${sessionId}`);

const res = await getSimulationResult(sessionId);
const steps = res.steps.slice(2); // skip the two deploys

const decoded = {};
steps.forEach((step, i) => {
  const label = evalLabels[i];
  const hex = step?.Result?.Eval?.Ok;
  decoded[label] = hex
    ? cvToString(deserializeCV(hex))
    : `EVAL FAILED: ${JSON.stringify(step?.Result)}`;
});

const asUint = (s) => {
  const m = /u(\d+)/.exec(s);
  return m ? BigInt(m[1]) : null;
};

console.log(`\nstacks height: ${decoded["stacks-block-height"]}`);
console.log(`burn height:   ${decoded["burn-block-height"]}`);
console.log(`band-enabled:  ${decoded["band-enabled"]}\n`);

console.log("offset  | miner-spend-total | tenure (burn hash)");
const hashes = [];
for (const o of SPOT_OFFSETS) {
  const total = asUint(decoded[`spend-total@-${o}`]);
  const hash = decoded[`burn-hash@-${o}`].slice(-17, -1); // hash tail (leading zeros are Bitcoin PoW)
  hashes.push(hash);
  console.log(
    `  -${String(o).padEnd(6)}| ${String(total).padStart(12)} sats | ${hash}...`
  );
}
console.log(`\ndistinct tenures in spot-check: ${new Set(hashes).size}/${SPOT_OFFSETS.length}`);

const nativePrice = asUint(decoded["get-native-price"]);
if (nativePrice === null) {
  console.log(`\nget-native-price FAILED: ${decoded["get-native-price"]}`);
  console.log(">>> if this persists on mainnet, fire set-band-enabled false <<<");
  process.exit(1);
}
const nativeStxPerBtc = Number(nativePrice) / Number(PRICE_PRECISION);
const impliedAvgSpend = NATIVE_PRICE_NUM / nativePrice;
console.log(`\nget-native-price: ${nativePrice} (~${nativeStxPerBtc.toFixed(0)} STX/BTC over the 1-day window)`);
console.log(`implied 1-day avg miner-spend-total: ~${impliedAvgSpend} sats/tenure`);

// Live market comparison -> band headroom
try {
  const r = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,blockstack&vs_currencies=usd"
  );
  const j = await r.json();
  const btcUsd = j.bitcoin.usd;
  const stxUsd = j.blockstack.usd;
  const marketStxPerBtc = btcUsd / stxUsd;
  const ratio = nativeStxPerBtc / marketStxPerBtc; // native/market
  const driftPct = (ratio - 1) * 100;
  console.log(`\nlive market: BTC $${btcUsd}  STX $${stxUsd}`);
  console.log(`market STX/BTC: ${marketStxPerBtc.toFixed(0)}`);
  console.log(`native/market:  ${ratio.toFixed(3)}x (${driftPct >= 0 ? "+" : ""}${driftPct.toFixed(1)}%)`);
  // An honest quote sits at market, so quote/native = 1/ratio. The band
  // reverts when quote/native leaves [0.5, 2] => ratio leaves [0.5, 2].
  const floorHeadroom = ((2 - ratio) / 2) * 100;   // ratio -> 2.0 trips the floor
  const ceilHeadroom = ((ratio - 0.5) / ratio) * 100; // ratio -> 0.5 trips the ceiling
  console.log(`band headroom: floor trips at native/market=2.0 (${floorHeadroom.toFixed(0)}% away), ceiling at 0.5 (${ceilHeadroom.toFixed(0)}% away)`);
  if (ratio > 1.7 || ratio < 0.55) {
    console.log(">>> MONITOR THRESHOLD CROSSED: fire set-band-enabled false <<<");
    process.exit(2);
  }
  console.log("band health: OK");
} catch (e) {
  console.log(`\n(live market fetch failed: ${e.message})`);
}
