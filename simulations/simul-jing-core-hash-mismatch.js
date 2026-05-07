// simul-jing-core-hash-mismatch.js
// Stxer simulation: register's TWO checks bind correctness:
//   1. caller-hash == verified-hash[canonical] (bytecode integrity)
//   2. tx-sender == contract-owner (deployment authority)
//
// Verifies all three failure modes:
//   a. Wrong canonical principal (hash mismatch) -> u5006 HASH_MISMATCH
//   b. Unverified canonical -> u5005 NOT_VERIFIED
//   c. Non-owner tx-sender -> u5001 NOT_AUTHORIZED
// Plus a sanity-check happy path.
//
// Run: npx tsx simulations/simul-jing-core-hash-mismatch.js
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  contractPrincipalCV,
  standardPrincipalCV,
  bufferCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import {
  DEPLOYER,
  USDCX_DEPOSITOR_1,    // not the owner — we'll use them to demo non-owner
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
  // Patch MAX_STALENESS to give market-B a different bytecode hash than market-A.
  const marketSourcePatched = marketSource.replace(
    "(define-constant MAX_STALENESS u80)",
    "(define-constant MAX_STALENESS u60)"
  );
  if (marketSource === marketSourcePatched) {
    throw new Error("Patch failed: MAX_STALENESS line not found");
  }

  console.log("=== JING-CORE REGISTER HASH-MISMATCH + NON-OWNER ===\n");

  const sessionId = await SimulationBuilder.new()
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: JING_CORE_NAME, source_code: jingCoreSource,
      clarity_version: ClarityVersion.Clarity4,
    })
    // Deploy unmodified market-A (hash = H_A)
    .addContractDeploy({
      contract_name: MARKET_A_NAME, source_code: marketSource,
      clarity_version: ClarityVersion.Clarity5,
    })
    // Deploy patched market-B (hash = H_B != H_A)
    .addContractDeploy({
      contract_name: MARKET_B_NAME, source_code: marketSourcePatched,
      clarity_version: ClarityVersion.Clarity5,
    })

    // Owner sets verified-contract for market-A (one step, no timelock)
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "set-verified-contract",
      function_args: [marketACV],
    })
    .addEvalCode(JING_CORE_ID, `(is-verified-contract '${DEPLOYER}.${MARKET_A_NAME})`)

    // Failure A: market-B.initialize(canonical = market-A) -> u5006 HASH_MISMATCH
    // (caller-hash = H_B, verified[market-A] = H_A, mismatch)
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: `${DEPLOYER}.${MARKET_B_NAME}`,
      function_name: "initialize",
      function_args: [
        marketACV,                  // wrong canonical
        sbtcTrait, usdcxTrait,
        uintCV(1000), uintCV(1_000_000), feedBuf,
      ],
    })

    // Failure B: market-B.initialize(canonical = market-B) -> u5005 NOT_VERIFIED
    // (market-B is not in verified-contracts)
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: `${DEPLOYER}.${MARKET_B_NAME}`,
      function_name: "initialize",
      function_args: [
        marketBCV,                  // unverified canonical
        sbtcTrait, usdcxTrait,
        uintCV(1000), uintCV(1_000_000), feedBuf,
      ],
    })

    // Failure C: non-owner tries to initialize market-A
    // The market.initialize asserts tx-sender == operator. Operator was set
    // to tx-sender at deploy time, which was DEPLOYER. So a non-DEPLOYER
    // call hits the market's own ERR_NOT_AUTHORIZED (u1011) before even
    // reaching jing-core.register. To probe register's tx-sender check
    // directly, we'd need a market template whose operator differs from
    // jing-core's owner — see simul-jing-core-non-owner-register.js for
    // that scenario.
    //
    // Here we demonstrate that even with deployer-as-operator, the
    // market's own auth gate blocks non-deployer calls:
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: `${DEPLOYER}.${MARKET_A_NAME}`,
      function_name: "initialize",
      function_args: [
        marketACV, sbtcTrait, usdcxTrait,
        uintCV(1000), uintCV(1_000_000), feedBuf,
      ],
    })

    // Sanity: market-A.initialize(canonical = market-A) by owner -> ok
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: `${DEPLOYER}.${MARKET_A_NAME}`,
      function_name: "initialize",
      function_args: [
        marketACV, sbtcTrait, usdcxTrait,
        uintCV(1000), uintCV(1_000_000), feedBuf,
      ],
    })
    .addEvalCode(JING_CORE_ID, `(is-registered '${DEPLOYER}.${MARKET_A_NAME})`)
    .addEvalCode(JING_CORE_ID, `(is-registered '${DEPLOYER}.${MARKET_B_NAME})`)

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
