// simul-markets-sbtc-usdcx-jing-cancel-flows.js
// Stxer simulation: cancel flows for markets-sbtc-usdcx-jing.
// Tests cancel-deposit happy path, cancel-empty (should fail), cancel during
// settle phase (should fail), and cancel-cycle rollforward after the
// CANCEL_THRESHOLD = 42 stacks-block window.
//
// Run: npx tsx simulations/simul-markets-sbtc-usdcx-jing-cancel-flows.js
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
  USDCX_DEPOSITOR_1,
  SBTC_DEPOSITOR_1,
  SBTC_ADDR,
  SBTC_NAME,
  SBTC_ASSET_NAME,
  USDCX_ADDR,
  USDCX_NAME,
  USDCX_ASSET_NAME,
  BTC_USD_FEED_HEX,
  CANCEL_THRESHOLD,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-usdcx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

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
  console.log("=== MARKETS-SBTC-USDCX-JING CANCEL FLOWS ===\n");

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
    // === Part A: Cancel during deposit phase (happy path) ===
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_100), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_100K), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")

    // Cancel both
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-y-deposit",
      function_args: [usdcxTrait, usdcxAsset],
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

    // Cancel-empty (should fail with ERR_NOTHING_TO_WITHDRAW = u1008)
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-y-deposit",
      function_args: [usdcxTrait, usdcxAsset],
    })

    // === Part B: Cancel during settle phase (should fail) ===
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_100), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_100K), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "close-deposits",
      function_args: [],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")

    // Cancel during settle — both should fail with ERR_NOT_DEPOSIT_PHASE = u1002
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-y-deposit",
      function_args: [usdcxTrait, usdcxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-x-deposit",
      function_args: [sbtcTrait, sbtcAsset],
    })

    // === Part C: cancel-cycle BEFORE threshold (should fail) ===
    // close-deposits set deposits-closed-block. cancel-cycle requires
    // stacks-block-height >= closed-block + CANCEL_THRESHOLD (42).
    // We've only advanced 1 stacks block since close, so this should fail
    // with ERR_CANCEL_TOO_EARLY = u1014.
    .withSender(USDCX_DEPOSITOR_1)
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

    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-cycle",
      function_args: [],
    })

    // Cycle 1 should now hold the rolled deposits
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${USDCX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")
    .addEvalCode(MARKET_ID, "(get-token-x-depositors u1)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")

    // Cancel rolled deposits in cycle 1 (happy path again)
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-y-deposit",
      function_args: [usdcxTrait, usdcxAsset],
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
