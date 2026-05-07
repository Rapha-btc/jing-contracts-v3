// simul-markets-sbtc-stx-jing-swap.js
// Stxer simulation: atomic taker swap on sbtc-stx market.
// STX pre-stages 100 STX of liquidity, then sBTC depositor calls
// swap(deposit-x=true) which atomically does deposit-x + close + settle-with-refresh
// using TWO Pyth VAAs (BTC/USD + STX/USD).
//
// Run: npx tsx simulations/simul-markets-sbtc-stx-jing-swap.js
import {
  uintCV,
  contractPrincipalCV,
  stringAsciiCV,
  bufferCV,
  trueCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import {
  DEPLOYER,
  STX_DEPOSITOR_1,
  SBTC_DEPOSITOR_1,
  SBTC_ADDR,
  SBTC_NAME,
  SBTC_ASSET_NAME,
  WSTX_ADDR,
  WSTX_NAME,
  WSTX_ASSET_NAME,
  BTC_USD_FEED_HEX,
  STX_USD_FEED_HEX,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-stx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

const PYTH_DEPLOYER = "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y";
const PYTH_STORAGE = `${PYTH_DEPLOYER}.pyth-storage-v4`;
const PYTH_DECODER = `${PYTH_DEPLOYER}.pyth-pnau-decoder-v3`;
const WORMHOLE_CORE = `${PYTH_DEPLOYER}.wormhole-core-v4`;

const SBTC_100K = 100_000;
const STX_100 = 100_000_000;
const MIN_SBTC = 1000;
const MIN_STX = 1_000_000;
const STX_LIMIT_HIGH = 1_000_000_000_000_000;
const SBTC_LIMIT_LOW = 1;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);

async function fetchPythVAA(timestamp, feedHex) {
  const url = `https://hermes.pyth.network/v2/updates/price/${timestamp}?ids[]=${feedHex}`;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const data = await response.json();
  if (!data.binary?.data?.[0]) throw new Error(`No price data at ${timestamp}`);
  for (const p of data.parsed) {
    console.log(`  ${p.id.slice(0, 8)}... = $${(Number(p.price.price) / 1e8).toFixed(4)}`);
  }
  return data.binary.data[0];
}

async function main() {
  const timestamp = Math.floor(Date.now() / 1000) - 30;
  const vaaXHex = await fetchPythVAA(timestamp, BTC_USD_FEED_HEX);
  const vaaYHex = await fetchPythVAA(timestamp, STX_USD_FEED_HEX);
  const vaaXBuffer = bufferCV(Buffer.from(vaaXHex, "hex"));
  const vaaYBuffer = bufferCV(Buffer.from(vaaYHex, "hex"));

  console.log("\n=== MARKETS-SBTC-STX-JING ATOMIC SWAP ===");
  console.log("STX pre-stages 100 STX, then sBTC depositor calls swap(deposit-x=true).");
  console.log("Atomic: deposit-x + close + settle-with-refresh (BTC/USD + STX/USD VAAs).\n");

  const [pythStoreAddr, pythStoreName] = PYTH_STORAGE.split(".");
  const [pythDecAddr, pythDecName] = PYTH_DECODER.split(".");
  const [wormAddr, wormName] = WORMHOLE_CORE.split(".");

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV,
      sbtcTrait,
      wstxTrait,
      uintCV(MIN_SBTC),
      uintCV(MIN_STX),
      btcFeedBuf,
      stxFeedBuf,
    ],
  });

  const sessionId = await sim
    // Pre-stage STX liquidity in cycle 0
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(STX_100), uintCV(STX_LIMIT_HIGH), wstxTrait, wstxAsset],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u0)")

    // Atomic swap
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "swap",
      function_args: [
        uintCV(SBTC_100K),
        uintCV(SBTC_LIMIT_LOW),
        vaaXBuffer,
        vaaYBuffer,
        contractPrincipalCV(pythStoreAddr, pythStoreName),
        contractPrincipalCV(pythDecAddr, pythDecName),
        contractPrincipalCV(wormAddr, wormName),
        sbtcTrait, sbtcAsset, wstxTrait, wstxAsset,
        trueCV(),
      ],
    })

    .addEvalCode(MARKET_ID, "(get-settlement u0)")
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${STX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
