// simul-markets-sbtc-stx-jing.js
// Stxer mainnet-fork simulation: full lifecycle of markets-sbtc-stx-jing.
// Same flow as the sbtc-usdcx sim but token-y = STX (via the Bitflow wstx
// SIP-010 facade) and the clearing price is a CROSS-RATE derived from two
// Pyth feeds (BTC/USD and STX/USD), so initialize takes two feed buffers.
//
// Run: npx tsx simulations/simul-markets-sbtc-stx-jing.js
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
// Validator (gas only — only needs ~µSTX for two confirm-* calls).
// SPZSQNQF9... has ~20 STX free at this fork (rest is PoX-locked).
const VALIDATOR = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3";
// STX depositor needs free STX for the actual deposits. SP9BP4P...
// (the USDCx whale used by other sims) has ~2953 STX fully liquid.
const STX_DEPOSITOR_1 = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";
// sBTC whale: ~40.5 BTC
const SBTC_DEPOSITOR_1 = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";

// --- SIP-10 token contracts ---
// token-x = sBTC (8 decimals)
const SBTC_ADDR = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4";
const SBTC_NAME = "sbtc-token";
const SBTC_ASSET_NAME = "sbtc-token";
// token-y = STX, exposed via Bitflow's wstx SIP-010 facade. The market
// asserts contract-of(t) == token-y but actually moves stx via
// stx-transfer? internally — the trait is just the on-wire identity.
const WSTX_ADDR = "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR";
const WSTX_NAME = "token-stx-v-1-2";
const WSTX_ASSET_NAME = "wstx";

// --- Pyth feed identifiers (cross-rate = (BTC/USD * 1e8) / STX/USD) ---
const BTC_USD_FEED_HEX =
  "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const STX_USD_FEED_HEX =
  "ec7a775f46379b5e943c3526b1c8d54cd49749176b0b98e02dde68d1bd335c17";

// --- Local contract identities ---
const JING_CORE_NAME = "jing-core";
const MARKET_NAME = "markets-sbtc-stx-jing";
const JING_CORE_ID = `${DEPLOYER}.${JING_CORE_NAME}`;
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

// --- Amounts ---
const SBTC_100K = 100_000;        // 0.001 BTC
const STX_100 = 100_000_000;      // 100 STX
const STX_50 = 50_000_000;        // 50 STX

// --- Min deposits at init ---
const MIN_SBTC = 1000;            // 1000 sats
const MIN_STX = 1_000_000;        // 1 STX

// --- Limit prices (token-y per token-x at PRICE_PRECISION = 1e8) ---
// STX side accepts any clearing -> u1e15 well above any plausible STX/sBTC.
const STX_LIMIT_HIGH = 1_000_000_000_000_000;
// sBTC side accepts any clearing -> u1.
const SBTC_LIMIT_LOW = 1;

// --- Timelock (must match jing-core.clar TIMELOCK_BURN_BLOCKS) ---
const TIMELOCK_BURN_BLOCKS = 144;

// --- ClarityValue helpers ---
const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
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

  console.log("=== MARKETS-SBTC-STX-JING FULL LIFECYCLE STXER SIM ===\n");
  console.log("Scenario:");
  console.log("0.  Deploy jing-core (Clarity 4)");
  console.log("1.  Deploy markets-sbtc-stx-jing (Clarity 5)");
  console.log("2.  Owner: propose-validator(VALIDATOR)");
  console.log("3.  AdvanceBlocks 144");
  console.log("4.  Anyone: confirm-validator(VALIDATOR)");
  console.log("5.  Owner: propose-verified-contract(market)");
  console.log("6.  AdvanceBlocks 144");
  console.log("7.  Validator: confirm-verified-contract(market)");
  console.log("8.  Owner: market.initialize(... BTC/USD + STX/USD feeds ...)");
  console.log("9.  STX depositor deposits 100 STX (permissive limit)");
  console.log("10. sBTC depositor deposits 100k sats (permissive limit)");
  console.log("11. Read cycle state");
  console.log("12. STX depositor top-up +50 STX");
  console.log("13. Close deposits");
  console.log("14. Settle using stored Pyth prices (cross-rate)");
  console.log("15. Read settlement results");
  console.log("16. Verify cycle 1 rollover state");
  console.log("");

  const sessionId = await SimulationBuilder.new()

    // STEP 0: Deploy jing-core
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

    // STEP 2: Owner proposes validator
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID,
      function_name: "propose-validator",
      function_args: [standardPrincipalCV(VALIDATOR)],
    })

    // STEP 3: Advance past timelock
    .addAdvanceBlocks({
      bitcoin_blocks: TIMELOCK_BURN_BLOCKS,
      stacks_blocks_per_bitcoin: 1,
    })

    // STEP 4: Confirm validator
    .withSender(VALIDATOR)
    .addContractCall({
      contract_id: JING_CORE_ID,
      function_name: "confirm-validator",
      function_args: [standardPrincipalCV(VALIDATOR)],
    })
    .addEvalCode(JING_CORE_ID, `(is-validator '${VALIDATOR})`)
    .addEvalCode(JING_CORE_ID, "(get-validator-count)")

    // STEP 5: Owner proposes verified-contract for the market
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID,
      function_name: "propose-verified-contract",
      function_args: [marketPrincipalCV],
    })

    // STEP 6: Advance past timelock
    .addAdvanceBlocks({
      bitcoin_blocks: TIMELOCK_BURN_BLOCKS,
      stacks_blocks_per_bitcoin: 1,
    })

    // STEP 7: Validator confirms verified-contract
    .withSender(VALIDATOR)
    .addContractCall({
      contract_id: JING_CORE_ID,
      function_name: "confirm-verified-contract",
      function_args: [marketPrincipalCV],
    })
    .addEvalCode(JING_CORE_ID, `(is-verified-contract '${MARKET_ID})`)

    // STEP 8: Owner initializes — TWO Pyth feeds
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "initialize",
      function_args: [
        marketPrincipalCV,          // canonical
        sbtcTrait,                  // x = sBTC
        wstxTrait,                  // y = STX (via wstx facade)
        uintCV(MIN_SBTC),
        uintCV(MIN_STX),
        btcFeedBuf,                 // feed-x = BTC/USD
        stxFeedBuf,                 // feed-y = STX/USD
      ],
    })
    .addEvalCode(JING_CORE_ID, `(is-registered '${MARKET_ID})`)

    // STEP 9: STX depositor deposits 100 STX (token-y)
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [
        uintCV(STX_100),
        uintCV(STX_LIMIT_HIGH),
        wstxTrait,
        wstxAsset,
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

    // STEP 11: Read cycle state
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${STX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u0 '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u0)")
    .addEvalCode(MARKET_ID, "(get-token-x-depositors u0)")
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${SBTC_ADDR}.${SBTC_NAME} '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${WSTX_ADDR}.${WSTX_NAME} '${STX_DEPOSITOR_1})`)

    // STEP 12: STX depositor top-up +50 STX
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [
        uintCV(STX_50),
        uintCV(STX_LIMIT_HIGH),
        wstxTrait,
        wstxAsset,
      ],
    })
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${STX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")

    // STEP 13: Close deposits
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "close-deposits",
      function_args: [],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")

    // STEP 14: Settle using stored Pyth BTC/USD + STX/USD prices
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "settle",
      function_args: [
        sbtcTrait,
        sbtcAsset,
        wstxTrait,
        wstxAsset,
      ],
    })

    // STEP 15: Read settlement results
    .addEvalCode(MARKET_ID, "(get-settlement u0)")
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")

    // STEP 16: Cycle 1 rollover
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${STX_DEPOSITOR_1})`)
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
