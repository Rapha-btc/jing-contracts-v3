// simul-markets-sbtc-usdcx-jing-operator-setters.js
// Stxer simulation: market-level operator-only setters on sbtc-usdcx market.
// Covers all five operator setters (set-treasury, set-paused, set-operator,
// set-min-token-y-deposit, set-min-token-x-deposit) with happy + non-operator
// negative paths.
//
// Effect-tested where the contract has no public reader for the var:
//   - set-paused(true)  -> deposit reverts u1010 ERR_PAUSED (market-level)
//   - set-paused(false) -> deposit succeeds again
//   - set-min-token-y-deposit(N) -> deposit below N reverts u1001 DEPOSIT_TOO_SMALL
//   - set-operator(new) -> old operator's set-treasury call reverts u1011 NOT_AUTHORIZED
//
// The market's per-contract `paused` flag is independent from jing-core's
// protocol-wide pause: this sim exercises the market flag only.
//
// Run: npx tsx simulations/simul-markets-sbtc-usdcx-jing-operator-setters.js
import {
  uintCV,
  boolCV,
  contractPrincipalCV,
  standardPrincipalCV,
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
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-usdcx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

// A new principal we'll transfer operator authority TO. Doesn't need to
// hold any tokens, just needs to be a valid principal.
const NEW_OPERATOR = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";    // = USDCX_DEPOSITOR_1
const NON_OPERATOR = SBTC_DEPOSITOR_1;
const NEW_TREASURY = "SP000000000000000000002Q6VF78";

const SBTC_100K = 100_000;
const USDCX_100 = 100_000_000;
const USDCX_BELOW_NEW_MIN = 5_000_000;       // 5 USDCx — below NEW_MIN_USDCX
const USDCX_ABOVE_NEW_MIN = 15_000_000;      // 15 USDCx — above
const SBTC_BELOW_NEW_MIN = 5_000;            // 5k sats
const MIN_SBTC = 1000;
const MIN_USDCX = 1_000_000;
const NEW_MIN_USDCX = 10_000_000;            // raised to 10 USDCx
const NEW_MIN_SBTC = 10_000;                 // raised to 10k sats
const LIMIT_HIGH = 1_000_000_000_000_000;
const LIMIT_LOW = 1;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const usdcxTrait = contractPrincipalCV(USDCX_ADDR, USDCX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const usdcxAsset = stringAsciiCV(USDCX_ASSET_NAME);
const feedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);

async function main() {
  console.log("=== MARKETS-SBTC-USDCX-JING operator-only setters ===\n");

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV, sbtcTrait, usdcxTrait,
      uintCV(MIN_SBTC), uintCV(MIN_USDCX), feedBuf,
    ],
  });

  const sessionId = await sim
    .addEvalCode(MARKET_ID, "(get-min-deposits)")  // initial mins

    // === set-treasury ===
    // Non-operator -> u1011
    .withSender(NON_OPERATOR)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-treasury",
      function_args: [standardPrincipalCV(NEW_TREASURY)],
    })
    // Operator -> ok
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-treasury",
      function_args: [standardPrincipalCV(NEW_TREASURY)],
    })

    // === set-paused ===
    // Non-operator -> u1011
    .withSender(NON_OPERATOR)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-paused",
      function_args: [boolCV(true)],
    })
    // Operator pauses market
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-paused",
      function_args: [boolCV(true)],
    })
    // Effect-test: deposit while paused -> u1010 ERR_PAUSED (market-level)
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_100), uintCV(LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    // Operator unpauses
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-paused",
      function_args: [boolCV(false)],
    })
    // Effect-test: deposit succeeds again
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_100), uintCV(LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })

    // === set-min-token-y-deposit ===
    // Non-operator -> u1011
    .withSender(NON_OPERATOR)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-min-token-y-deposit",
      function_args: [uintCV(NEW_MIN_USDCX)],
    })
    // Operator raises the min
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-min-token-y-deposit",
      function_args: [uintCV(NEW_MIN_USDCX)],
    })
    .addEvalCode(MARKET_ID, "(get-min-deposits)")  // confirm new mins
    // Effect-test: deposit BELOW new min -> u1001 DEPOSIT_TOO_SMALL
    // (top-up by USDCX_DEPOSITOR_1, but they already have a deposit so the
    // amount itself is checked separately — set-min checks at deposit time)
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_BELOW_NEW_MIN), uintCV(LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })

    // === set-min-token-x-deposit ===
    // Non-operator -> u1011
    .withSender(NON_OPERATOR)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-min-token-x-deposit",
      function_args: [uintCV(NEW_MIN_SBTC)],
    })
    // Operator raises the min
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-min-token-x-deposit",
      function_args: [uintCV(NEW_MIN_SBTC)],
    })
    // Effect-test: x deposit below new min -> u1001
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_BELOW_NEW_MIN), uintCV(LIMIT_LOW), sbtcTrait, sbtcAsset],
    })

    // === set-operator ===
    // Non-operator -> u1011
    .withSender(NON_OPERATOR)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-operator",
      function_args: [standardPrincipalCV(NEW_OPERATOR)],
    })
    // Operator transfers role to NEW_OPERATOR
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-operator",
      function_args: [standardPrincipalCV(NEW_OPERATOR)],
    })
    // Effect-test: OLD operator (DEPLOYER) tries set-treasury -> u1011
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-treasury",
      function_args: [standardPrincipalCV(DEPLOYER)],
    })
    // Effect-test: NEW_OPERATOR can call set-treasury
    .withSender(NEW_OPERATOR)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-treasury",
      function_args: [standardPrincipalCV(DEPLOYER)],
    })

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
