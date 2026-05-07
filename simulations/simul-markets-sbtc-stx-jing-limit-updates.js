// simul-markets-sbtc-stx-jing-limit-updates.js
// Stxer simulation: set-token-{x,y}-limit mechanism for sbtc-stx market.
// Mirror of usdcx variant. Same negative-path coverage:
//   - non-depositor       -> u1008
//   - limit-price = 0     -> u1017
//   - during settle phase -> u1002
//
// Run: npx tsx simulations/simul-markets-sbtc-stx-jing-limit-updates.js
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
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-stx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

const SBTC_100K = 100_000;
const STX_100 = 100_000_000;
const MIN_SBTC = 1000;
const MIN_STX = 1_000_000;
const LIMIT_HIGH = 1_000_000_000_000_000;
const LIMIT_LOW = 1;
const NEW_LIMIT_Y = 500_000;
const NEW_LIMIT_X = 250_000;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);

const NON_DEPOSITOR = DEPLOYER;

async function main() {
  console.log("=== MARKETS-SBTC-STX-JING set-token-{x,y}-limit mechanism ===\n");

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV, sbtcTrait, wstxTrait,
      uintCV(MIN_SBTC), uintCV(MIN_STX), btcFeedBuf, stxFeedBuf,
    ],
  });

  const sessionId = await sim
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(STX_100), uintCV(LIMIT_HIGH), wstxTrait, wstxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_100K), uintCV(LIMIT_LOW), sbtcTrait, sbtcAsset],
    })
    .addEvalCode(MARKET_ID, `(get-token-y-limit '${STX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, `(get-token-x-limit '${SBTC_DEPOSITOR_1})`)

    // Non-depositor -> u1008
    .withSender(NON_DEPOSITOR)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-token-y-limit",
      function_args: [uintCV(NEW_LIMIT_Y)],
    })
    .withSender(NON_DEPOSITOR)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-token-x-limit",
      function_args: [uintCV(NEW_LIMIT_X)],
    })

    // limit = 0 -> u1017
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-token-y-limit",
      function_args: [uintCV(0)],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-token-x-limit",
      function_args: [uintCV(0)],
    })

    // Happy update
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-token-y-limit",
      function_args: [uintCV(NEW_LIMIT_Y)],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-token-x-limit",
      function_args: [uintCV(NEW_LIMIT_X)],
    })
    .addEvalCode(MARKET_ID, `(get-token-y-limit '${STX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, `(get-token-x-limit '${SBTC_DEPOSITOR_1})`)

    // settle phase -> u1002
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({ contract_id: MARKET_ID, function_name: "close-deposits", function_args: [] })
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-token-y-limit",
      function_args: [uintCV(LIMIT_HIGH)],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-token-x-limit",
      function_args: [uintCV(LIMIT_LOW)],
    })

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
