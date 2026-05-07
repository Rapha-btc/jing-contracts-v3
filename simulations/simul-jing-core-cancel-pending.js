// simul-jing-core-cancel-pending.js
// Stxer simulation: cancel-pending-validator and cancel-pending-contract
// abort proposals before the timelock; subsequent confirms fail with the
// correct error codes.
//
// Run: npx tsx simulations/simul-jing-core-cancel-pending.js
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  contractPrincipalCV,
  standardPrincipalCV,
  stringAsciiCV,
  bufferCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import {
  DEPLOYER,
  VALIDATOR,
  TIMELOCK_BURN_BLOCKS,
  JING_CORE_NAME,
  SBTC_ADDR,
  SBTC_NAME,
  USDCX_ADDR,
  USDCX_NAME,
  BTC_USD_FEED_HEX,
} from "./_setup.js";

const JING_CORE_ID = `${DEPLOYER}.${JING_CORE_NAME}`;
const MARKET_NAME = "markets-sbtc-usdcx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);

async function main() {
  const jingCoreSource = fs.readFileSync("./contracts/jing-core.clar", "utf8");
  const marketSource = fs.readFileSync(`./contracts/${MARKET_NAME}.clar`, "utf8");

  console.log("=== JING-CORE CANCEL-PENDING-{VALIDATOR,CONTRACT} ===");
  console.log("Owner aborts both pending proposals; confirm fails afterwards.\n");

  const sessionId = await SimulationBuilder.new()
    // Deploy
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: JING_CORE_NAME, source_code: jingCoreSource,
      clarity_version: ClarityVersion.Clarity4,
    })
    .addContractDeploy({
      contract_name: MARKET_NAME, source_code: marketSource,
      clarity_version: ClarityVersion.Clarity5,
    })

    // === Part A: cancel-pending-validator ===
    // Owner proposes validator
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "propose-validator",
      function_args: [standardPrincipalCV(VALIDATOR)],
    })
    .addEvalCode(JING_CORE_ID, `(get-pending-validator '${VALIDATOR})`)

    // Owner cancels BEFORE timelock
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "cancel-pending-validator",
      function_args: [standardPrincipalCV(VALIDATOR)],
    })
    .addEvalCode(JING_CORE_ID, `(get-pending-validator '${VALIDATOR})`)

    // Now even if timelock elapsed, confirm should fail with NO_PENDING_VALIDATOR (u5013)
    .addAdvanceBlocks({
      bitcoin_blocks: TIMELOCK_BURN_BLOCKS,
      stacks_blocks_per_bitcoin: 1,
      bitcoin_interval_secs: 1,
    })
    .withSender(VALIDATOR)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "confirm-validator",
      function_args: [standardPrincipalCV(VALIDATOR)],
    })

    // === Part B: cancel-pending-contract ===
    // First we need an active validator to confirm verified-contract later.
    // Re-propose the validator the proper way (this time without canceling).
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "propose-validator",
      function_args: [standardPrincipalCV(VALIDATOR)],
    })
    .addAdvanceBlocks({
      bitcoin_blocks: TIMELOCK_BURN_BLOCKS,
      stacks_blocks_per_bitcoin: 1,
      bitcoin_interval_secs: 1,
    })
    .withSender(VALIDATOR)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "confirm-validator",
      function_args: [standardPrincipalCV(VALIDATOR)],
    })

    // Owner proposes verified-contract for the market
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "propose-verified-contract",
      function_args: [marketCV],
    })
    .addEvalCode(JING_CORE_ID, `(get-pending-verified-contract '${MARKET_ID})`)

    // Owner cancels BEFORE timelock
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "cancel-pending-contract",
      function_args: [marketCV],
    })
    .addEvalCode(JING_CORE_ID, `(get-pending-verified-contract '${MARKET_ID})`)

    // Confirm should fail with NO_PENDING_PROPOSAL (u5007) even after timelock
    .addAdvanceBlocks({
      bitcoin_blocks: TIMELOCK_BURN_BLOCKS,
      stacks_blocks_per_bitcoin: 1,
      bitcoin_interval_secs: 1,
    })
    .withSender(VALIDATOR)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "confirm-verified-contract",
      function_args: [marketCV],
    })

    .addEvalCode(JING_CORE_ID, `(is-verified-contract '${MARKET_ID})`)

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
