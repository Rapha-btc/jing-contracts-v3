// simul-markets-sbtc-usdcx-jing-limit-rolls.js
// Stxer simulation: limit-violation rolls at settle for sbtc-usdcx market.
// 2 USDCx depositors and 2 sBTC depositors, one of each with a restrictive
// limit that the clearing price will violate. The contract should roll the
// violators forward to cycle 1 via filter-limit-violating-token-{y,x}-depositor
// and emit log-limit-roll-{y,x} events on jing-core.
//
// Run: npx tsx simulations/simul-markets-sbtc-usdcx-jing-limit-rolls.js
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
  STX_DEPOSITOR_1,
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

// Spare addresses (from the dust-sweep sim — used here as the "violators").
const USDCX_VIOLATOR = "SP06ARSREC0N9AKZABRP23SXS62TWJ6KWPVDQHVX";
const SBTC_VIOLATOR = "SP0DJ8T0VQRP06JP4NNK37RF9VC1FBVHK2JH1SA5";

const USDCX_AMOUNT = 100_000_000;     // 100 USDCx per side
const SBTC_AMOUNT = 100_000;          // 0.001 BTC per side

// Permissive (settles): LIMIT_HIGH for y, LIMIT_LOW for x
const LIMIT_HIGH = 1_000_000_000_000_000;
const LIMIT_LOW = 1;

// Restrictive (rolls):
//   y-side (USDCx) rolls if clearing > limit-y. Clearing ≈ BTC/USD × 1e8 ≈ 7.6e12.
//   Set limit-y = u1000 (way below clearing) -> roll forward.
//   x-side (sBTC) rolls if clearing < limit-x.
//   Set limit-x = u1e15 (above clearing) -> roll forward.
const RESTRICTIVE_Y = 1000;
const RESTRICTIVE_X = 1_000_000_000_000_000;

const USDCX_FUND_PER_VIOLATOR = USDCX_AMOUNT + 1_000_000;   // deposit + buffer
const SBTC_FUND_PER_VIOLATOR = SBTC_AMOUNT + 1_000;
const STX_GAS_PER_VIOLATOR = 10_000_000;

const MIN_SBTC = 1000;
const MIN_USDCX = 1_000_000;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const usdcxTrait = contractPrincipalCV(USDCX_ADDR, USDCX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const usdcxAsset = stringAsciiCV(USDCX_ASSET_NAME);
const feedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);

async function main() {
  console.log("=== MARKETS-SBTC-USDCX-JING LIMIT-VIOLATION ROLLS ===\n");

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV, sbtcTrait, usdcxTrait,
      uintCV(MIN_SBTC), uintCV(MIN_USDCX), feedBuf,
    ],
  });

  const sessionId = await sim
    // Fund the violators
    .withSender(STX_DEPOSITOR_1)
    .addSTXTransfer({ recipient: USDCX_VIOLATOR, amount: STX_GAS_PER_VIOLATOR, sender: STX_DEPOSITOR_1 })
    .addSTXTransfer({ recipient: SBTC_VIOLATOR, amount: STX_GAS_PER_VIOLATOR, sender: STX_DEPOSITOR_1 })
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: USDCX_FQN, function_name: "transfer",
      function_args: [
        uintCV(USDCX_FUND_PER_VIOLATOR),
        standardPrincipalCV(USDCX_DEPOSITOR_1),
        standardPrincipalCV(USDCX_VIOLATOR),
        noneCV(),
      ],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: SBTC_FQN, function_name: "transfer",
      function_args: [
        uintCV(SBTC_FUND_PER_VIOLATOR),
        standardPrincipalCV(SBTC_DEPOSITOR_1),
        standardPrincipalCV(SBTC_VIOLATOR),
        noneCV(),
      ],
    })

    // Permissive USDCx depositor (will settle)
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_AMOUNT), uintCV(LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    // Restrictive USDCx depositor (will roll: clearing > 1000)
    .withSender(USDCX_VIOLATOR)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_AMOUNT), uintCV(RESTRICTIVE_Y), usdcxTrait, usdcxAsset],
    })
    // Permissive sBTC depositor (will settle)
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_AMOUNT), uintCV(LIMIT_LOW), sbtcTrait, sbtcAsset],
    })
    // Restrictive sBTC depositor (will roll: clearing < 1e16)
    .withSender(SBTC_VIOLATOR)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_AMOUNT), uintCV(RESTRICTIVE_X), sbtcTrait, sbtcAsset],
    })

    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u0)")
    .addEvalCode(MARKET_ID, "(get-token-x-depositors u0)")

    // Close + settle
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({ contract_id: MARKET_ID, function_name: "close-deposits", function_args: [] })
    .addContractCall({
      contract_id: MARKET_ID, function_name: "settle",
      function_args: [sbtcTrait, sbtcAsset, usdcxTrait, usdcxAsset],
    })

    .addEvalCode(MARKET_ID, "(get-settlement u0)")

    // Cycle 1 should now hold the rolled violators
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${USDCX_VIOLATOR})`)
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_VIOLATOR})`)
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")
    .addEvalCode(MARKET_ID, "(get-token-x-depositors u1)")

    // Permissive depositors should NOT be in cycle 1 (they settled in cycle 0)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${USDCX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_DEPOSITOR_1})`)

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
