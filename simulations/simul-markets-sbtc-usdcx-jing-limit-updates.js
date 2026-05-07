// simul-markets-sbtc-usdcx-jing-limit-updates.js
// Stxer simulation: set-token-y-limit / set-token-x-limit mid-cycle for
// sbtc-usdcx market. Verifies the set-* functions update the limits
// map (read confirms new value) and provokes all three negative gates:
//   - non-depositor caller            -> u1008 NOTHING_TO_WITHDRAW
//   - limit-price = 0                  -> u1017 LIMIT_REQUIRED
//   - call during settle phase         -> u1002 NOT_DEPOSIT_PHASE
//
// The "settle uses the new limit at settle time" assertion is already
// proven by the limit-rolls sim (which sets restrictive limits at
// deposit time and observes the rolls); set-limit writes to the same
// limits map, so transitivity gives us coverage of that path too.
//
// Run: npx tsx simulations/simul-markets-sbtc-usdcx-jing-limit-updates.js
import {
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
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-usdcx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

const SBTC_100K = 100_000;
const USDCX_100 = 100_000_000;
const MIN_SBTC = 1000;
const MIN_USDCX = 1_000_000;
const LIMIT_HIGH = 1_000_000_000_000_000;
const LIMIT_LOW = 1;
const NEW_LIMIT_Y = 500_000;        // arbitrary new value
const NEW_LIMIT_X = 250_000;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const usdcxTrait = contractPrincipalCV(USDCX_ADDR, USDCX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const usdcxAsset = stringAsciiCV(USDCX_ASSET_NAME);
const feedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);

// DEPLOYER never deposits in this sim, so they're a true non-depositor
// for the u1008 negative-path test. (USDCX_DEPOSITOR_1 == STX_DEPOSITOR_1
// in _setup.js, so picking the whale wouldn't work.)
const NON_DEPOSITOR = DEPLOYER;

async function main() {
  console.log("=== MARKETS-SBTC-USDCX-JING set-token-{x,y}-limit mechanism ===\n");

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV, sbtcTrait, usdcxTrait,
      uintCV(MIN_SBTC), uintCV(MIN_USDCX), feedBuf,
    ],
  });

  const sessionId = await sim
    // Initial deposits with permissive limits
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_100), uintCV(LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_100K), uintCV(LIMIT_LOW), sbtcTrait, sbtcAsset],
    })
    .addEvalCode(MARKET_ID, `(get-token-y-limit '${USDCX_DEPOSITOR_1})`)  // = LIMIT_HIGH
    .addEvalCode(MARKET_ID, `(get-token-x-limit '${SBTC_DEPOSITOR_1})`)  // = LIMIT_LOW

    // === Negative: non-depositor tries set-token-y-limit -> u1008 ===
    .withSender(NON_DEPOSITOR)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-token-y-limit",
      function_args: [uintCV(NEW_LIMIT_Y)],
    })
    // === Negative: non-depositor tries set-token-x-limit -> u1008 ===
    .withSender(NON_DEPOSITOR)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-token-x-limit",
      function_args: [uintCV(NEW_LIMIT_X)],
    })

    // === Negative: limit-price = 0 -> u1017 ===
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-token-y-limit",
      function_args: [uintCV(0)],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-token-x-limit",
      function_args: [uintCV(0)],
    })

    // === Happy: depositors update their limits ===
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-token-y-limit",
      function_args: [uintCV(NEW_LIMIT_Y)],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-token-x-limit",
      function_args: [uintCV(NEW_LIMIT_X)],
    })

    // Reads confirm the limits map was updated to the new values
    .addEvalCode(MARKET_ID, `(get-token-y-limit '${USDCX_DEPOSITOR_1})`)  // = NEW_LIMIT_Y
    .addEvalCode(MARKET_ID, `(get-token-x-limit '${SBTC_DEPOSITOR_1})`)  // = NEW_LIMIT_X

    // === Negative: set-limit during settle phase -> u1002 ===
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({ contract_id: MARKET_ID, function_name: "close-deposits", function_args: [] })
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")  // = u2 SETTLE
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-token-y-limit",
      function_args: [uintCV(LIMIT_HIGH)],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "set-token-x-limit",
      function_args: [uintCV(LIMIT_LOW)],
    })

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
