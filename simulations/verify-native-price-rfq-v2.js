// verify-native-price-rfq-v2.js
// Probe harness for the native BTC/STX price in rfq-sbtc-stx-jing-v2 (miner
// commits vs coinbase, replacing Pyth). Deploys jing-core-v2 + the v2 market at
// the live mainnet tip, evals the raw per-tenure miner spends + get-native-price,
// then compares the implied STX-per-BTC against live market prices.
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

// Mirror TENURE_SAMPLE_OFFSETS in the contract
const OFFSETS = [1, 122, 244, 366, 488, 610];
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
for (const o of OFFSETS) {
  addEval(
    `spend-total@-${o}`,
    `(get-tenure-info? miner-spend-total (- stacks-block-height u${o}))`
  );
  addEval(
    `spend-winner@-${o}`,
    `(get-tenure-info? miner-spend-winner (- stacks-block-height u${o}))`
  );
  addEval(
    `burn-hash@-${o}`,
    `(get-tenure-info? burnchain-header-hash (- stacks-block-height u${o}))`
  );
}
addEval("commit-efficiency-bps", "(var-get commit-efficiency-bps)");
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
console.log(`burn height:   ${decoded["burn-block-height"]}\n`);

console.log("offset | miner-spend-total | miner-spend-winner | tenure (burn hash)");
const spends = [];
const hashes = [];
for (const o of OFFSETS) {
  const total = asUint(decoded[`spend-total@-${o}`]);
  const winner = asUint(decoded[`spend-winner@-${o}`]);
  const hash = decoded[`burn-hash@-${o}`].slice(-17, -1); // hash tail (leading zeros are Bitcoin PoW)
  if (total !== null) spends.push(total);
  hashes.push(hash);
  console.log(
    `  -${String(o).padEnd(4)}| ${String(total).padStart(12)} sats | ${String(winner).padStart(12)} sats  | ${hash}...`
  );
}
const distinct = new Set(hashes).size;
console.log(`\ndistinct tenures sampled: ${distinct}/${OFFSETS.length}`);

const avg = spends.reduce((a, x) => a + x, 0n) / BigInt(spends.length);
console.log(`avg miner-spend-total: ${avg} sats (~$${((Number(avg) / 1e8) * 100000).toFixed(0)} at $100k/BTC scale — see live below)`);

const nativePrice = decoded["get-native-price"];
console.log(`\ncommit-efficiency-bps: ${decoded["commit-efficiency-bps"]}`);
console.log(`get-native-price:      ${nativePrice}`);

// Implied STX-per-BTC at a range of efficiency assumptions
console.log("\nefficiency | implied STX/BTC | implied BTC/STX (sats)");
for (const bps of [10000n, 9000n, 8500n, 8000n, 7000n, 6000n, 5000n]) {
  const price = (NATIVE_PRICE_NUM * bps) / (10000n * avg); // oracle-price scale
  const stxPerBtc = Number(price) / Number(PRICE_PRECISION);
  const satsPerStx = 1e8 / stxPerBtc;
  console.log(
    `  ${(Number(bps) / 100).toFixed(0)}%     | ${stxPerBtc.toFixed(0).padStart(10)} STX  | ${satsPerStx.toFixed(1)} sats/STX`
  );
}

// Live market comparison
try {
  const r = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,blockstack&vs_currencies=usd"
  );
  const j = await r.json();
  const btcUsd = j.bitcoin.usd;
  const stxUsd = j.blockstack.usd;
  const marketStxPerBtc = btcUsd / stxUsd;
  const rawStxPerBtc = Number(NATIVE_PRICE_NUM / avg) / Number(PRICE_PRECISION);
  const impliedEfficiency = marketStxPerBtc / rawStxPerBtc;
  console.log(`\nlive market: BTC $${btcUsd}  STX $${stxUsd}`);
  console.log(`market STX/BTC:            ${marketStxPerBtc.toFixed(0)}`);
  console.log(`raw implied (100% eff):    ${rawStxPerBtc.toFixed(0)}`);
  console.log(`>>> implied miner efficiency: ${(impliedEfficiency * 100).toFixed(1)}% <<<`);
  console.log(`    (set commit-efficiency-bps ~u${Math.round(impliedEfficiency * 10000)} to center the band on market)`);
  const contractStxPerBtc = Number(asUint(nativePrice) ?? 0n) / Number(PRICE_PRECISION);
  const driftPct = ((contractStxPerBtc - marketStxPerBtc) / marketStxPerBtc) * 100;
  console.log(`contract mid @${asUint(decoded["commit-efficiency-bps"])}bps: ${contractStxPerBtc.toFixed(0)} STX/BTC (${driftPct >= 0 ? "+" : ""}${driftPct.toFixed(1)}% vs market)`);
} catch (e) {
  console.log(`\n(live market fetch failed: ${e.message})`);
}
