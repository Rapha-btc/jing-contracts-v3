// simul-markets-sbtc-stx-jing-cancel-flows.js
// Stxer simulation: cancel flows for markets-sbtc-stx-jing.
// Mirror of the sbtc-usdcx variant: cancel-deposit happy path, cancel-empty
// (fail), cancel during settle (fail), cancel-cycle before/after the
// CANCEL_THRESHOLD = 42 stacks-block window, then cancel rolled deposits.
//
// Run: npx tsx simulations/simul-markets-sbtc-stx-jing-cancel-flows.js
import {
  ClarityVersion,
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
  CANCEL_THRESHOLD,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-stx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

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

async function main() {
  console.log("=== MARKETS-SBTC-STX-JING CANCEL FLOWS ===\n");

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
    // === Part A: Cancel during deposit phase (happy path) ===
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(STX_100), uintCV(STX_LIMIT_HIGH), wstxTrait, wstxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_100K), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")

    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-y-deposit",
      function_args: [wstxTrait, wstxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-x-deposit",
      function_args: [sbtcTrait, sbtcAsset],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u0)")
    .addEvalCode(MARKET_ID, "(get-token-x-depositors u0)")

    // Cancel-empty -> ERR_NOTHING_TO_WITHDRAW (u1008)
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-y-deposit",
      function_args: [wstxTrait, wstxAsset],
    })

    // === Part B: Cancel during settle phase (should fail) ===
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(STX_100), uintCV(STX_LIMIT_HIGH), wstxTrait, wstxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_100K), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "close-deposits",
      function_args: [],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")

    // Cancel during settle -> both should fail with ERR_NOT_DEPOSIT_PHASE (u1002)
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-y-deposit",
      function_args: [wstxTrait, wstxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-x-deposit",
      function_args: [sbtcTrait, sbtcAsset],
    })

    // === Part C: cancel-cycle BEFORE threshold (should fail with u1014) ===
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-cycle",
      function_args: [],
    })

    // === Part D: advance past CANCEL_THRESHOLD, then cancel-cycle ===
    .addAdvanceBlocks({
      bitcoin_blocks: CANCEL_THRESHOLD,
      stacks_blocks_per_bitcoin: 1,
    })
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")

    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-cycle",
      function_args: [],
    })

    // Cycle 1 should now hold the rolled deposits
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${STX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")
    .addEvalCode(MARKET_ID, "(get-token-x-depositors u1)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")

    // Cancel rolled deposits in cycle 1
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-y-deposit",
      function_args: [wstxTrait, wstxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-x-deposit",
      function_args: [sbtcTrait, sbtcAsset],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")
    .addEvalCode(MARKET_ID, "(get-token-x-depositors u1)")

    .run();

  console.log(`\nSimulation submitted!`);
  console.log(`View results: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
