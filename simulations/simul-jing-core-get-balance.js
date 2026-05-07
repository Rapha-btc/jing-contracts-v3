// simul-jing-core-get-balance.js
// Stxer simulation: verify jing-core's Zest-shaped (get-balance user)
// returns the same value as (get-token-equity SBTC_TOKEN user) after a
// deposit cycle. This is the read Alex's dual-stacking booster relies on.
//
// The y-side equity uses the y-token (USDCx in this sim), not sBTC, so it
// shouldn't appear in get-balance's response. Only x-side (sBTC) deposits
// affect the read.
//
// Run: npx tsx simulations/simul-jing-core-get-balance.js
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
  SBTC_FQN,
  USDCX_ADDR,
  USDCX_NAME,
  USDCX_ASSET_NAME,
  USDCX_FQN,
  BTC_USD_FEED_HEX,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-usdcx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;
const JING_CORE_ID = `${DEPLOYER}.jing-core`;

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

async function main() {
  console.log("=== JING-CORE get-balance vs get-token-equity ===\n");

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV, sbtcTrait, usdcxTrait,
      uintCV(MIN_SBTC), uintCV(MIN_USDCX), feedBuf,
    ],
  });

  const sessionId = await sim
    // Both sides deposit
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

    // Compare: get-balance vs get-token-equity for the sBTC depositor.
    // Both should equal SBTC_100K (= 100_000) since the market's log-deposit-x
    // credits sBTC equity to the depositor.
    .addEvalCode(JING_CORE_ID, `(get-balance '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${SBTC_FQN} '${SBTC_DEPOSITOR_1})`)

    // For the USDCx depositor: get-balance should be 0 (they have no sBTC),
    // get-token-equity for USDCx should equal USDCX_100.
    .addEvalCode(JING_CORE_ID, `(get-balance '${USDCX_DEPOSITOR_1})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${SBTC_FQN} '${USDCX_DEPOSITOR_1})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${USDCX_FQN} '${USDCX_DEPOSITOR_1})`)

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
