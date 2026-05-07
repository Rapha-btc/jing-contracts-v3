// simul-markets-sbtc-usdcx-jing.js
// Stxer mainnet-fork simulation: full lifecycle of markets-sbtc-usdcx-jing.
// Mirrors simul-v3-blind-auction.js from the old v2 folder, adapted for the
// new jing-core verified-contract registry flow:
//
//   1. Deploy jing-core + the market
//   2. Owner: propose-validator(validator)        -> 144-burn-block timelock
//   3. AdvanceBlocks 144 (uses stxer 0.8.0 addAdvanceBlocks)
//   4. Anyone: confirm-validator(validator)
//   5. Owner: propose-verified-contract(market)  -> 144-burn-block timelock
//   6. AdvanceBlocks 144
//   7. Validator (NOT owner): confirm-verified-contract(market)
//   8. Owner: market.initialize(...)              -> calls jing-core.register internally
//
// After init, exercise: deposit-token-y / deposit-token-x / top-up /
// close-deposits / settle / cycle rollover reads.
//
// Run: npx tsx simulations/simul-markets-sbtc-usdcx-jing.js
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

// --- Mainnet addresses ---
const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
// Independent STX-funded address used as the jing-core validator.
// Owner cannot be a validator (asserted in propose-validator), so this is
// a different principal than DEPLOYER.
const VALIDATOR = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3";
// USDCx whale: ~28.6k USDCx (now ~832 — see README-stxer-v3.md note)
const USDCX_DEPOSITOR_1 = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";
// sBTC whale: ~40.5 BTC
const SBTC_DEPOSITOR_1 = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";

// --- SIP-10 token contracts ---
// token-x = sBTC (8 decimals)
const SBTC_ADDR = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4";
const SBTC_NAME = "sbtc-token";
const SBTC_ASSET_NAME = "sbtc-token";
// token-y = USDCx (6 decimals)
const USDCX_ADDR = "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE";
const USDCX_NAME = "usdcx";
const USDCX_ASSET_NAME = "usdcx-token";

// --- Pyth BTC/USD feed identifier ---
const BTC_USD_FEED_HEX =
  "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

// --- Local contract identities ---
const JING_CORE_NAME = "jing-core";
const MARKET_NAME = "markets-sbtc-usdcx-jing";
const JING_CORE_ID = `${DEPLOYER}.${JING_CORE_NAME}`;
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

// --- Amounts ---
const SBTC_100K = 100_000;        // 0.001 BTC
const USDCX_100 = 100_000_000;    // 100 USDCx
const USDCX_50 = 50_000_000;      // 50 USDCx

// --- Min deposits at init ---
const MIN_SBTC = 1000;            // 1000 sats
const MIN_USDCX = 1_000_000;      // 1 USDC

// --- Limit prices (BTC/USD * 1e8 scale, Pyth) ---
// USDCx side accepts any clearing -> u1e15 well above any plausible BTC/USD * 1e8.
const USDCX_LIMIT_HIGH = 1_000_000_000_000_000;
// sBTC side accepts any clearing -> u1.
const SBTC_LIMIT_LOW = 1;

// --- Timelock (must match jing-core.clar TIMELOCK_BURN_BLOCKS) ---
const TIMELOCK_BURN_BLOCKS = 144;

// --- ClarityValue helpers ---
const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const usdcxTrait = contractPrincipalCV(USDCX_ADDR, USDCX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const usdcxAsset = stringAsciiCV(USDCX_ASSET_NAME);
const feedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const marketPrincipalCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);

async function main() {
  const jingCoreSource = fs.readFileSync(
    "./contracts/jing-core.clar",
    "utf8"
  );
  const marketSource = fs.readFileSync(
    `./contracts/${MARKET_NAME}.clar`,
    "utf8"
  );

  console.log("=== MARKETS-SBTC-USDCX-JING FULL LIFECYCLE STXER SIM ===\n");
  console.log("Scenario:");
  console.log("0.  Deploy jing-core (Clarity 4)");
  console.log("1.  Deploy markets-sbtc-usdcx-jing (Clarity 5)");
  console.log("2.  Owner: propose-validator(VALIDATOR)");
  console.log("3.  AdvanceBlocks 144 (timelock)");
  console.log("4.  Anyone: confirm-validator(VALIDATOR)");
  console.log("5.  Owner: propose-verified-contract(market)");
  console.log("6.  AdvanceBlocks 144 (timelock)");
  console.log("7.  Validator: confirm-verified-contract(market)");
  console.log("8.  Owner: market.initialize(...) -> jing-core.register internally");
  console.log("9.  USDCx depositor deposits 100 USDCx (limit-price = 1e15)");
  console.log("10. sBTC depositor deposits 100k sats (limit-price = 1)");
  console.log("11. Read cycle state");
  console.log("12. USDCx depositor top-up +50 USDCx");
  console.log("13. Close deposits");
  console.log("14. Settle using stored Pyth prices");
  console.log("15. Read settlement results");
  console.log("16. Verify cycle 1 rollover state");
  console.log("");

  const sessionId = await SimulationBuilder.new()

    // STEP 0: Deploy jing-core (registry)
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: JING_CORE_NAME,
      source_code: jingCoreSource,
      clarity_version: ClarityVersion.Clarity4,
    })

    // STEP 1: Deploy market
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: MARKET_NAME,
      source_code: marketSource,
      clarity_version: ClarityVersion.Clarity5,
    })

    // STEP 2: Owner proposes validator (24h timelock starts)
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID,
      function_name: "propose-validator",
      function_args: [standardPrincipalCV(VALIDATOR)],
    })

    // STEP 3: Advance 144 burn blocks past timelock
    .addAdvanceBlocks({
      bitcoin_blocks: TIMELOCK_BURN_BLOCKS,
      stacks_blocks_per_bitcoin: 1,
    })

    // STEP 4: Anyone confirms the validator (we use VALIDATOR itself)
    .withSender(VALIDATOR)
    .addContractCall({
      contract_id: JING_CORE_ID,
      function_name: "confirm-validator",
      function_args: [standardPrincipalCV(VALIDATOR)],
    })
    .addEvalCode(JING_CORE_ID, `(is-validator '${VALIDATOR})`)
    .addEvalCode(JING_CORE_ID, "(get-validator-count)")

    // STEP 5: Owner proposes verified-contract for the market.
    // jing-core auto-reads (contract-hash? market) and stores it pending.
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID,
      function_name: "propose-verified-contract",
      function_args: [marketPrincipalCV],
    })

    // STEP 6: Advance 144 burn blocks
    .addAdvanceBlocks({
      bitcoin_blocks: TIMELOCK_BURN_BLOCKS,
      stacks_blocks_per_bitcoin: 1,
    })

    // STEP 7: Validator confirms verified-contract (owner cannot)
    .withSender(VALIDATOR)
    .addContractCall({
      contract_id: JING_CORE_ID,
      function_name: "confirm-verified-contract",
      function_args: [marketPrincipalCV],
    })
    .addEvalCode(JING_CORE_ID, `(is-verified-contract '${MARKET_ID})`)

    // STEP 8: Owner initializes the market. Internally calls
    // jing-core.register, which checks the market's hash matches the
    // verified-contracts entry under the canonical principal we pass.
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "initialize",
      function_args: [
        marketPrincipalCV,          // canonical (same as the market itself)
        sbtcTrait,                  // x = sBTC
        usdcxTrait,                 // y = USDCx
        uintCV(MIN_SBTC),
        uintCV(MIN_USDCX),
        feedBuf,                    // BTC/USD Pyth feed id
      ],
    })
    .addEvalCode(JING_CORE_ID, `(is-registered '${MARKET_ID})`)

    // STEP 9: USDCx depositor deposits 100 USDCx (token-y)
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [
        uintCV(USDCX_100),
        uintCV(USDCX_LIMIT_HIGH),
        usdcxTrait,
        usdcxAsset,
      ],
    })

    // STEP 10: sBTC depositor deposits 100k sats (token-x)
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [
        uintCV(SBTC_100K),
        uintCV(SBTC_LIMIT_LOW),
        sbtcTrait,
        sbtcAsset,
      ],
    })

    // STEP 11: Read cycle state after deposits
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${USDCX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u0 '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u0)")
    .addEvalCode(MARKET_ID, "(get-token-x-depositors u0)")
    // jing-core equity should now reflect the deposits (markets credit the
    // depositor side via log-deposit-{x,y})
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${SBTC_ADDR}.${SBTC_NAME} '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${USDCX_ADDR}.${USDCX_NAME} '${USDCX_DEPOSITOR_1})`)

    // STEP 12: USDCx depositor top-up +50 USDCx
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [
        uintCV(USDCX_50),
        uintCV(USDCX_LIMIT_HIGH),
        usdcxTrait,
        usdcxAsset,
      ],
    })
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${USDCX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")

    // STEP 13: Close deposits (anyone)
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "close-deposits",
      function_args: [],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")

    // STEP 14: Settle using stored Pyth BTC/USD price
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "settle",
      function_args: [
        sbtcTrait,                  // tx-trait
        sbtcAsset,                  // tx-name
        usdcxTrait,                 // ty-trait
        usdcxAsset,                 // ty-name
      ],
    })

    // STEP 15: Read settlement results
    .addEvalCode(MARKET_ID, "(get-settlement u0)")
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")

    // STEP 16: Cycle 1 rollover state
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${USDCX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")
    .addEvalCode(MARKET_ID, "(get-token-x-depositors u1)")

    .run();

  console.log(`\nSimulation submitted!`);
  console.log(
    `View results: https://stxer.xyz/simulations/mainnet/${sessionId}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
