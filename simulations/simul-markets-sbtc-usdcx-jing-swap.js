// simul-markets-sbtc-usdcx-jing-swap.js
// Stxer simulation: atomic taker swap on sbtc-usdcx market.
// USDCx pre-stages 100 USDCx of liquidity, then sBTC depositor calls
// swap(deposit-x=true) which atomically does deposit-x + close + settle-with-refresh.
//
// Run: npx tsx simulations/simul-markets-sbtc-usdcx-jing-swap.js
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
  USDCX_DEPOSITOR_1,
  SBTC_DEPOSITOR_1,
  SBTC_ADDR,
  SBTC_NAME,
  SBTC_ASSET_NAME,
  USDCX_ADDR,
  USDCX_NAME,
  USDCX_ASSET_NAME,
  BTC_USD_FEED_HEX,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-usdcx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

const PYTH_DEPLOYER = "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y";
const PYTH_STORAGE = `${PYTH_DEPLOYER}.pyth-storage-v4`;
const PYTH_DECODER = `${PYTH_DEPLOYER}.pyth-pnau-decoder-v3`;
const WORMHOLE_CORE = `${PYTH_DEPLOYER}.wormhole-core-v4`;

const SBTC_100K = 100_000;
const USDCX_100 = 100_000_000;
const MIN_SBTC = 1000;
const MIN_USDCX = 1_000_000;
const USDCX_LIMIT_HIGH = 1_000_000_000_000_000;
const SBTC_LIMIT_LOW = 1;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const usdcxTrait = contractPrincipalCV(USDCX_ADDR, USDCX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const usdcxAsset = stringAsciiCV(USDCX_ASSET_NAME);
const feedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
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
  const vaaHex = await fetchPythVAA(timestamp, BTC_USD_FEED_HEX);
  const vaaBuffer = bufferCV(Buffer.from(vaaHex, "hex"));

  console.log("\n=== MARKETS-SBTC-USDCX-JING ATOMIC SWAP ===");
  console.log("USDCx pre-stages 100 USDCx, then sBTC depositor calls swap(deposit-x=true).");
  console.log("Atomic: deposit-token-x + close-deposits + settle-with-refresh in one tx.\n");

  const [pythStoreAddr, pythStoreName] = PYTH_STORAGE.split(".");
  const [pythDecAddr, pythDecName] = PYTH_DECODER.split(".");
  const [wormAddr, wormName] = WORMHOLE_CORE.split(".");

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV,
      sbtcTrait,
      usdcxTrait,
      uintCV(MIN_SBTC),
      uintCV(MIN_USDCX),
      feedBuf,
    ],
  });

  const sessionId = await sim
    // Pre-stage USDCx liquidity in cycle 0
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_100), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u0)")

    // Atomic swap: sBTC depositor takes the USDCx liquidity in one tx.
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "swap",
      function_args: [
        uintCV(SBTC_100K),
        uintCV(SBTC_LIMIT_LOW),
        vaaBuffer,
        contractPrincipalCV(pythStoreAddr, pythStoreName),
        contractPrincipalCV(pythDecAddr, pythDecName),
        contractPrincipalCV(wormAddr, wormName),
        sbtcTrait, sbtcAsset, usdcxTrait, usdcxAsset,
        trueCV(),                    // deposit-x = true
      ],
    })

    // Verify settlement happened
    .addEvalCode(MARKET_ID, "(get-settlement u0)")
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${USDCX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
