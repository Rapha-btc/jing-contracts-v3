// simul-jing-core-remove-validator.js
// Stxer simulation: remove-validator strips a confirmed validator's
// authority. Subsequent confirm-verified-contract from the removed validator
// fails with u5001 NOT_AUTHORIZED.
//
// Run: npx tsx simulations/simul-jing-core-remove-validator.js
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  contractPrincipalCV,
  standardPrincipalCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import {
  DEPLOYER,
  VALIDATOR,
  TIMELOCK_BURN_BLOCKS,
  JING_CORE_NAME,
} from "./_setup.js";

const JING_CORE_ID = `${DEPLOYER}.${JING_CORE_NAME}`;
const MARKET_NAME = "markets-sbtc-usdcx-jing";
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);

async function main() {
  const jingCoreSource = fs.readFileSync("./contracts/jing-core.clar", "utf8");
  const marketSource = fs.readFileSync(`./contracts/${MARKET_NAME}.clar`, "utf8");

  console.log("=== JING-CORE REMOVE-VALIDATOR ===\n");

  const sessionId = await SimulationBuilder.new()
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: JING_CORE_NAME, source_code: jingCoreSource,
      clarity_version: ClarityVersion.Clarity4,
    })
    .addContractDeploy({
      contract_name: MARKET_NAME, source_code: marketSource,
      clarity_version: ClarityVersion.Clarity5,
    })

    // Add validator (full flow)
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
    .addEvalCode(JING_CORE_ID, `(is-validator '${VALIDATOR})`)
    .addEvalCode(JING_CORE_ID, "(get-validator-count)")

    // Owner proposes a verified-contract for the market (so we have something to confirm)
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "propose-verified-contract",
      function_args: [marketCV],
    })
    .addAdvanceBlocks({
      bitcoin_blocks: TIMELOCK_BURN_BLOCKS,
      stacks_blocks_per_bitcoin: 1,
      bitcoin_interval_secs: 1,
    })

    // Owner removes the validator BEFORE they get to confirm anything.
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "remove-validator",
      function_args: [standardPrincipalCV(VALIDATOR)],
    })
    .addEvalCode(JING_CORE_ID, `(is-validator '${VALIDATOR})`)
    .addEvalCode(JING_CORE_ID, "(get-validator-count)")

    // Removed validator tries to confirm-verified-contract -> u5001 NOT_AUTHORIZED
    .withSender(VALIDATOR)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "confirm-verified-contract",
      function_args: [marketCV],
    })

    // remove-validator on a non-validator -> u5014 NOT_VALIDATOR
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "remove-validator",
      function_args: [standardPrincipalCV(VALIDATOR)],
    })

    // Non-owner tries remove-validator -> u5001 NOT_AUTHORIZED
    // (Re-add a validator first.)
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
    // Now a non-owner attempt -> u5001
    .withSender(VALIDATOR)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "remove-validator",
      function_args: [standardPrincipalCV(VALIDATOR)],
    })

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
