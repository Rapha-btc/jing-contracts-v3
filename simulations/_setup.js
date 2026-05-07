// _setup.js
// Shared helpers for jing v3 stxer simulations.
//
// The new jing-core registry adds an 8-step prelude before any market call:
//   1. Deploy jing-core
//   2. Deploy market
//   3. Owner: propose-validator
//   4. AdvanceBlocks 144 (timelock)
//   5. Validator: confirm-validator (anyone can call, simplest is validator itself)
//   6. Owner: propose-verified-contract(market)
//   7. AdvanceBlocks 144
//   8. Validator: confirm-verified-contract(market)
//   9. Owner: market.initialize(...) -> jing-core.register internally
//
// `addRegistryInit` runs steps 1-8 and lets the caller pass an
// `initializeArgs` array for step 9. The caller is responsible for any
// further senders / calls after init.

import fs from "node:fs";
import {
  ClarityVersion,
  contractPrincipalCV,
  standardPrincipalCV,
} from "@stacks/transactions";

// --- Mainnet addresses used across all v3 sims ---
export const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
// Validator (gas only; ~20 STX free, rest PoX-locked — enough for confirms).
export const VALIDATOR = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3";
// USDCx whale, doubles as STX depositor for the sbtc-stx sims (2953 STX free).
export const USDCX_DEPOSITOR_1 = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";
export const STX_DEPOSITOR_1 = USDCX_DEPOSITOR_1;
// sBTC whale: ~40.5 BTC.
export const SBTC_DEPOSITOR_1 = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";

// --- Token + feed constants ---
export const SBTC_ADDR = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4";
export const SBTC_NAME = "sbtc-token";
export const SBTC_ASSET_NAME = "sbtc-token";
export const SBTC_FQN = `${SBTC_ADDR}.${SBTC_NAME}`;

export const USDCX_ADDR = "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE";
export const USDCX_NAME = "usdcx";
export const USDCX_ASSET_NAME = "usdcx-token";
export const USDCX_FQN = `${USDCX_ADDR}.${USDCX_NAME}`;

export const WSTX_ADDR = "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR";
export const WSTX_NAME = "token-stx-v-1-2";
export const WSTX_ASSET_NAME = "wstx";
export const WSTX_FQN = `${WSTX_ADDR}.${WSTX_NAME}`;

export const BTC_USD_FEED_HEX =
  "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
export const STX_USD_FEED_HEX =
  "ec7a775f46379b5e943c3526b1c8d54cd49749176b0b98e02dde68d1bd335c17";

// --- Protocol constants (mirror the contracts) ---
export const TIMELOCK_BURN_BLOCKS = 144;
export const CANCEL_THRESHOLD = 42;
export const JING_CORE_NAME = "jing-core";

/**
 * Add registry-prelude steps + market.initialize to a SimulationBuilder.
 *
 * @param {SimulationBuilder} builder       fresh / partial builder
 * @param {object} cfg
 * @param {string} cfg.marketName           e.g. "markets-sbtc-usdcx-jing"
 * @param {ClarityValue[]} cfg.initializeArgs   args for market.initialize
 *                                          (canonical, x, y, min-x, min-y,
 *                                          feed | feed-x feed-y)
 * @param {string} [cfg.marketSourceOverride]   optional market source to deploy
 *                                          instead of reading from disk (e.g.
 *                                          patched MAX_STALENESS for refresh sims)
 * @returns {SimulationBuilder}              builder ready for further calls
 */
export function addRegistryInit(builder, { marketName, initializeArgs, marketSourceOverride }) {
  const jingCoreSource = fs.readFileSync(
    "./contracts/jing-core.clar",
    "utf8"
  );
  const marketSource = marketSourceOverride ?? fs.readFileSync(
    `./contracts/${marketName}.clar`,
    "utf8"
  );
  const jingCoreId = `${DEPLOYER}.${JING_CORE_NAME}`;
  const marketId = `${DEPLOYER}.${marketName}`;
  const marketCV = contractPrincipalCV(DEPLOYER, marketName);

  return builder
    // Step 1: deploy jing-core (Clarity 4)
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: JING_CORE_NAME,
      source_code: jingCoreSource,
      clarity_version: ClarityVersion.Clarity4,
    })
    // Step 2: deploy market (Clarity 5)
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: marketName,
      source_code: marketSource,
      clarity_version: ClarityVersion.Clarity5,
    })
    // Step 3: propose validator
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: jingCoreId,
      function_name: "propose-validator",
      function_args: [standardPrincipalCV(VALIDATOR)],
    })
    // Step 4: advance past timelock
    // bitcoin_interval_secs: 1 keeps stacks-block-time close to the fork's
    // pin so settle-with-refresh sims can pass the Pyth freshness gate
    // (default 600s/block would push stacks-block-time ~2 days past the
    // VAA's publish-time after two timelock advances).
    .addAdvanceBlocks({
      bitcoin_blocks: TIMELOCK_BURN_BLOCKS,
      stacks_blocks_per_bitcoin: 1,
      bitcoin_interval_secs: 1,
    })
    // Step 5: confirm validator (anyone — use validator itself)
    .withSender(VALIDATOR)
    .addContractCall({
      contract_id: jingCoreId,
      function_name: "confirm-validator",
      function_args: [standardPrincipalCV(VALIDATOR)],
    })
    // Step 6: propose verified-contract
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: jingCoreId,
      function_name: "propose-verified-contract",
      function_args: [marketCV],
    })
    // Step 7: advance past timelock
    // bitcoin_interval_secs: 1 keeps stacks-block-time close to the fork's
    // pin so settle-with-refresh sims can pass the Pyth freshness gate
    // (default 600s/block would push stacks-block-time ~2 days past the
    // VAA's publish-time after two timelock advances).
    .addAdvanceBlocks({
      bitcoin_blocks: TIMELOCK_BURN_BLOCKS,
      stacks_blocks_per_bitcoin: 1,
      bitcoin_interval_secs: 1,
    })
    // Step 8: validator confirms verified-contract (owner cannot)
    .withSender(VALIDATOR)
    .addContractCall({
      contract_id: jingCoreId,
      function_name: "confirm-verified-contract",
      function_args: [marketCV],
    })
    // Step 9: market.initialize -> internally calls jing-core.register
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: marketId,
      function_name: "initialize",
      function_args: initializeArgs,
    });
}
