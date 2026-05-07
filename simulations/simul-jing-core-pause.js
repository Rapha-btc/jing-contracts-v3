// simul-jing-core-pause.js
// Stxer simulation: protocol-wide pause/unpause via jing-core.
// Validator pauses; entry-side log-* (deposit) reverts with u5016 PAUSED.
// Exit-side log-* (cancel-token-y-deposit) stays open. Owner cannot unpause
// before timelock (u5008). After 144-burn-block timelock, owner unpauses
// and the entry side resumes.
//
// Run: npx tsx simulations/simul-jing-core-pause.js
import {
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
  USDCX_DEPOSITOR_1,
  SBTC_DEPOSITOR_1,
  TIMELOCK_BURN_BLOCKS,
  JING_CORE_NAME,
  SBTC_ADDR,
  SBTC_NAME,
  SBTC_ASSET_NAME,
  USDCX_ADDR,
  USDCX_NAME,
  USDCX_ASSET_NAME,
  BTC_USD_FEED_HEX,
  addRegistryInit,
} from "./_setup.js";

const JING_CORE_ID = `${DEPLOYER}.${JING_CORE_NAME}`;
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
  console.log("=== JING-CORE PAUSE/UNPAUSE PROTOCOL-WIDE ===\n");

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV, sbtcTrait, usdcxTrait,
      uintCV(MIN_SBTC), uintCV(MIN_USDCX), feedBuf,
    ],
  });

  const sessionId = await sim
    // Sanity deposit BEFORE pause works
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_100), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })

    // Validator pauses the protocol (distributed trip-wire)
    .withSender(VALIDATOR)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "pause", function_args: [],
    })
    .addEvalCode(JING_CORE_ID, "(is-paused)")

    // Entry-side: deposit must fail with u5016 PAUSED (propagated from log-deposit-y)
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_100K), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })

    // Exit-side: cancel-token-y-deposit should still work (log-refund-y has no pause check)
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "cancel-token-y-deposit",
      function_args: [usdcxTrait, usdcxAsset],
    })

    // Owner tries to unpause too early (timelock not elapsed) -> u5008
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "unpause", function_args: [],
    })

    // Non-owner tries unpause (after we advance) -> u5001
    // Actually first we need to advance past the timelock.
    .addAdvanceBlocks({
      bitcoin_blocks: TIMELOCK_BURN_BLOCKS,
      stacks_blocks_per_bitcoin: 1,
      bitcoin_interval_secs: 1,
    })

    // Validator (non-owner) tries unpause -> u5001 NOT_AUTHORIZED
    .withSender(VALIDATOR)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "unpause", function_args: [],
    })

    // Owner unpauses -> ok
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "unpause", function_args: [],
    })
    .addEvalCode(JING_CORE_ID, "(is-paused)")

    // Entry-side resumes
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_100K), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
