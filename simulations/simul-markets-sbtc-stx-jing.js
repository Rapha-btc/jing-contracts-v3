// simul-markets-sbtc-stx-jing.js
// Stxer mainnet-fork simulation: full lifecycle of markets-sbtc-stx-jing.
// Uses settle-with-refresh (production keeper path) with TWO live Pyth VAAs
// (BTC/USD + STX/USD) since MAX_STALENESS = u80 in production.
//
// Run: npx tsx simulations/simul-markets-sbtc-stx-jing.js
import {
  uintCV,
  contractPrincipalCV,
  stringAsciiCV,
  bufferCV,
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
  PYTH_STORAGE,
  PYTH_DECODER,
  WORMHOLE_CORE,
  fetchPythVAA,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-stx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;
const JING_CORE_ID = `${DEPLOYER}.jing-core`;

const SBTC_100K = 100_000;
const STX_100 = 100_000_000;
const STX_50 = 50_000_000;
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

async function main() {
  const vaaXHex = await fetchPythVAA(BTC_USD_FEED_HEX);
  const vaaYHex = await fetchPythVAA(STX_USD_FEED_HEX);
  const vaaXBuf = bufferCV(Buffer.from(vaaXHex, "hex"));
  const vaaYBuf = bufferCV(Buffer.from(vaaYHex, "hex"));
  const [pythStoreAddr, pythStoreName] = PYTH_STORAGE.split(".");
  const [pythDecAddr, pythDecName] = PYTH_DECODER.split(".");
  const [wormAddr, wormName] = WORMHOLE_CORE.split(".");

  console.log("=== MARKETS-SBTC-STX-JING FULL LIFECYCLE STXER SIM ===\n");

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV, sbtcTrait, wstxTrait,
      uintCV(MIN_SBTC), uintCV(MIN_STX), btcFeedBuf, stxFeedBuf,
    ],
  });

  const sessionId = await sim
    .addEvalCode(JING_CORE_ID, `(is-registered '${MARKET_ID})`)

    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(STX_100), uintCV(STX_LIMIT_HIGH), wstxTrait, wstxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_100K), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })

    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${STX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u0 '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${SBTC_ADDR}.${SBTC_NAME} '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${WSTX_ADDR}.${WSTX_NAME} '${STX_DEPOSITOR_1})`)

    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(STX_50), uintCV(STX_LIMIT_HIGH), wstxTrait, wstxAsset],
    })
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${STX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")

    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "close-deposits", function_args: [],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")
    .addContractCall({
      contract_id: MARKET_ID, function_name: "settle-with-refresh",
      function_args: [
        vaaXBuf, vaaYBuf,
        contractPrincipalCV(pythStoreAddr, pythStoreName),
        contractPrincipalCV(pythDecAddr, pythDecName),
        contractPrincipalCV(wormAddr, wormName),
        sbtcTrait, sbtcAsset, wstxTrait, wstxAsset,
      ],
    })

    .addEvalCode(MARKET_ID, "(get-settlement u0)")
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${STX_DEPOSITOR_1})`)

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
