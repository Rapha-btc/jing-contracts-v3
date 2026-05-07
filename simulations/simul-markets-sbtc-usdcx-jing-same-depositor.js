// simul-markets-sbtc-usdcx-jing-same-depositor.js
// Stxer simulation: same address deposits on both sides for sbtc-usdcx market.
// Funds SBTC_WHALE with USDCx so the same principal can deposit on both legs.
// Verifies the contract handles a single principal in both depositor lists,
// settles cleanly, and the same depositor receives both fills.
//
// Run: npx tsx simulations/simul-markets-sbtc-usdcx-jing-same-depositor.js
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
  USDCX_DEPOSITOR_1,
  SBTC_DEPOSITOR_1,
  SBTC_ADDR,
  SBTC_NAME,
  SBTC_ASSET_NAME,
  USDCX_ADDR,
  USDCX_NAME,
  USDCX_ASSET_NAME,
  USDCX_FQN,
  BTC_USD_FEED_HEX,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-usdcx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

// SBTC_DEPOSITOR_1 acts as both legs after USDCX_DEPOSITOR_1 funds it.
const BOTH_SIDES = SBTC_DEPOSITOR_1;

const SBTC_100K = 100_000;
const USDCX_100 = 100_000_000;
const USDCX_FUND = 200_000_000;       // fund 200 USDCx (covers deposit + buffer)
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
  console.log("=== MARKETS-SBTC-USDCX-JING SAME DEPOSITOR ===\n");

  let builder = SimulationBuilder.new();
  builder = addRegistryInit(builder, {
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

  const sessionId = await builder
    // Fund SBTC_WHALE with USDCx so it can act on both sides
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: USDCX_FQN,
      function_name: "transfer",
      function_args: [
        uintCV(USDCX_FUND),
        standardPrincipalCV(USDCX_DEPOSITOR_1),
        standardPrincipalCV(BOTH_SIDES),
        noneCV(),
      ],
    })

    // Same principal deposits USDCx (token-y)
    .withSender(BOTH_SIDES)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_100), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
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
      function_args: [sbtcTrait, sbtcAsset, usdcxTrait, usdcxAsset],
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
