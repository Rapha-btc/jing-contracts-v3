// simul-markets-sbtc-usdcx-jing.js
// Stxer mainnet-fork simulation: full lifecycle of markets-sbtc-usdcx-jing.
// Production MAX_STALENESS = u80 means stored Pyth prices on a fork are
// stale, so this sim uses settle-with-refresh (the production keeper path)
// with a fresh BTC/USD VAA from Hermes.
//
// Run: npx tsx simulations/simul-markets-sbtc-usdcx-jing.js
import {
  uintCV,
  contractPrincipalCV,
  stringAsciiCV,
  bufferCV,
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
  PYTH_STORAGE,
  PYTH_DECODER,
  WORMHOLE_CORE,
  fetchPythVAA,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-usdcx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;
const JING_CORE_ID = `${DEPLOYER}.jing-core`;

const SBTC_100K = 100_000;
const USDCX_100 = 100_000_000;
const USDCX_50 = 50_000_000;
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

async function main() {
  const vaaHex = await fetchPythVAA(BTC_USD_FEED_HEX);
  const vaaBuf = bufferCV(Buffer.from(vaaHex, "hex"));
  const [pythStoreAddr, pythStoreName] = PYTH_STORAGE.split(".");
  const [pythDecAddr, pythDecName] = PYTH_DECODER.split(".");
  const [wormAddr, wormName] = WORMHOLE_CORE.split(".");

  console.log("=== MARKETS-SBTC-USDCX-JING FULL LIFECYCLE STXER SIM ===\n");

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV, sbtcTrait, usdcxTrait,
      uintCV(MIN_SBTC), uintCV(MIN_USDCX), feedBuf,
    ],
  });

  const sessionId = await sim
    .addEvalCode(JING_CORE_ID, `(is-registered '${MARKET_ID})`)

    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_100), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_100K), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })

    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${USDCX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u0 '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${SBTC_ADDR}.${SBTC_NAME} '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${USDCX_ADDR}.${USDCX_NAME} '${USDCX_DEPOSITOR_1})`)

    // Top-up
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_50), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${USDCX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")

    // Close + settle-with-refresh (production keeper path)
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "close-deposits", function_args: [],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")
    .addContractCall({
      contract_id: MARKET_ID, function_name: "settle-with-refresh",
      function_args: [
        vaaBuf,
        contractPrincipalCV(pythStoreAddr, pythStoreName),
        contractPrincipalCV(pythDecAddr, pythDecName),
        contractPrincipalCV(wormAddr, wormName),
        sbtcTrait, sbtcAsset, usdcxTrait, usdcxAsset,
      ],
    })

    .addEvalCode(MARKET_ID, "(get-settlement u0)")
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${USDCX_DEPOSITOR_1})`)

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
