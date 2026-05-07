// simul-markets-sbtc-stx-jing-same-depositor.js
// Stxer simulation: same address deposits on both sides for sbtc-stx market.
// STX_DEPOSITOR_1 (the USDCx whale, who also has 2953 free STX) acts as
// both legs after SBTC_DEPOSITOR_1 funds it with sBTC.
//
// Run: npx tsx simulations/simul-markets-sbtc-stx-jing-same-depositor.js
import {
  uintCV,
  contractPrincipalCV,
  standardPrincipalCV,
  stringAsciiCV,
  bufferCV,
  noneCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import {
  DEPLOYER,
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
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-stx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

// STX depositor 1 (~2953 STX free) acts as both legs after sBTC funding.
const BOTH_SIDES = STX_DEPOSITOR_1;

const SBTC_100K = 100_000;
const SBTC_FUND = 200_000;            // fund 0.002 BTC (covers deposit + buffer)
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

async function main() {
  console.log("=== MARKETS-SBTC-STX-JING SAME DEPOSITOR ===\n");

  let builder = SimulationBuilder.new();
  builder = addRegistryInit(builder, {
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

  const sessionId = await builder
    // Fund BOTH_SIDES with sBTC (they already have STX)
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: SBTC_FQN,
      function_name: "transfer",
      function_args: [
        uintCV(SBTC_FUND),
        standardPrincipalCV(SBTC_DEPOSITOR_1),
        standardPrincipalCV(BOTH_SIDES),
        noneCV(),
      ],
    })

    // Same principal deposits STX (token-y)
    .withSender(BOTH_SIDES)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(STX_100), uintCV(STX_LIMIT_HIGH), wstxTrait, wstxAsset],
    })
    // Same principal deposits sBTC (token-x)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_100K), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })

    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u0)")
    .addEvalCode(MARKET_ID, "(get-token-x-depositors u0)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${BOTH_SIDES})`)
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u0 '${BOTH_SIDES})`)

    .withSender(BOTH_SIDES)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "close-deposits",
      function_args: [],
    })
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "settle",
      function_args: [sbtcTrait, sbtcAsset, wstxTrait, wstxAsset],
    })

    .addEvalCode(MARKET_ID, "(get-settlement u0)")
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${BOTH_SIDES})`)
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${BOTH_SIDES})`)

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
