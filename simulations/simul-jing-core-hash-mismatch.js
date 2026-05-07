// simul-jing-core-hash-mismatch.js
// Stxer simulation: register's hash check refuses a market whose bytecode
// doesn't match the verified-contracts entry for the canonical it claims.
//
// Setup:
//   1. Verify the unmodified market-A (hash = H_A).
//   2. Deploy market-B with patched bytecode (MAX_STALENESS u999999999 -> u60),
//      so its hash is some H_B != H_A.
//   3. Call market-B.initialize(canonical = market-A.principal). The market's
//      `(try! (contract-call? .jing-core register canonical))` reads
//      contract-hash?(market-B) = H_B and looks up verified-contracts[market-A]
//      = H_A. Mismatch -> u5006 HASH_MISMATCH propagates out of initialize.
//
// Run: npx tsx simulations/simul-jing-core-hash-mismatch.js
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
const MARKET_A_NAME = "markets-sbtc-usdcx-jing";
const MARKET_B_NAME = "markets-sbtc-usdcx-jing-patched";
const marketACV = contractPrincipalCV(DEPLOYER, MARKET_A_NAME);
const marketBCV = contractPrincipalCV(DEPLOYER, MARKET_B_NAME);

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const usdcxTrait = contractPrincipalCV(USDCX_ADDR, USDCX_NAME);
const feedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));

async function main() {
  const jingCoreSource = fs.readFileSync("./contracts/jing-core.clar", "utf8");
  const marketSource = fs.readFileSync(`./contracts/${MARKET_A_NAME}.clar`, "utf8");
  const marketSourcePatched = marketSource.replace(
    "(define-constant MAX_STALENESS u999999999)",
    "(define-constant MAX_STALENESS u60)"
  );
  if (marketSource === marketSourcePatched) {
    throw new Error("Patch failed: MAX_STALENESS line not found");
  }

  console.log("=== JING-CORE REGISTER HASH-MISMATCH ===\n");

  const sessionId = await SimulationBuilder.new()
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: JING_CORE_NAME, source_code: jingCoreSource,
      clarity_version: ClarityVersion.Clarity4,
    })

    // Deploy unmodified market-A
    .addContractDeploy({
      contract_name: MARKET_A_NAME, source_code: marketSource,
      clarity_version: ClarityVersion.Clarity5,
    })

    // Deploy patched market-B (different bytecode -> different hash)
    .addContractDeploy({
      contract_name: MARKET_B_NAME, source_code: marketSourcePatched,
      clarity_version: ClarityVersion.Clarity5,
    })

    // Validator setup
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

    // Verify market-A's principal (auto-reads its hash H_A)
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "propose-verified-contract",
      function_args: [marketACV],
    })
    .addAdvanceBlocks({
      bitcoin_blocks: TIMELOCK_BURN_BLOCKS,
      stacks_blocks_per_bitcoin: 1,
      bitcoin_interval_secs: 1,
    })
    .withSender(VALIDATOR)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "confirm-verified-contract",
      function_args: [marketACV],
    })
    .addEvalCode(JING_CORE_ID, `(is-verified-contract '${DEPLOYER}.${MARKET_A_NAME})`)

    // === Test: market-B.initialize(canonical = market-A) -> u5006 ===
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: `${DEPLOYER}.${MARKET_B_NAME}`,
      function_name: "initialize",
      function_args: [
        marketACV,                  // <-- WRONG canonical: market-A
        sbtcTrait, usdcxTrait,
        uintCV(1000), uintCV(1000000), feedBuf,
      ],
    })

    // === Test: market-B.initialize(canonical = market-B) -> u5005 NOT_VERIFIED ===
    // (market-B's principal isn't in verified-contracts)
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: `${DEPLOYER}.${MARKET_B_NAME}`,
      function_name: "initialize",
      function_args: [
        marketBCV,                  // canonical = self, but not verified
        sbtcTrait, usdcxTrait,
        uintCV(1000), uintCV(1000000), feedBuf,
      ],
    })

    // Sanity: market-A.initialize(canonical = market-A) should succeed
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: `${DEPLOYER}.${MARKET_A_NAME}`,
      function_name: "initialize",
      function_args: [
        marketACV, sbtcTrait, usdcxTrait,
        uintCV(1000), uintCV(1000000), feedBuf,
      ],
    })
    .addEvalCode(JING_CORE_ID, `(is-registered '${DEPLOYER}.${MARKET_A_NAME})`)
    .addEvalCode(JING_CORE_ID, `(is-registered '${DEPLOYER}.${MARKET_B_NAME})`)

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
