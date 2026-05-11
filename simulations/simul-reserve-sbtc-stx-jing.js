// simul-reserve-sbtc-stx-jing.js
// Stxer mainnet-fork simulation: full lender lifecycle on
// reserve-sbtc-stx-jing. Combined with the snpl sim, these prove the
// reserve+snpl loan path against real mainnet sBTC + the v3 sBTC/STX
// market.
//
// Flow:
//   1. addRegistryInit deploys jing-core + market and initializes the market.
//   2. Deploy the snpl (per-borrower loan contract; needed only so the
//      reserve has a real snpl-trait principal to open a credit-line for).
//   3. Deploy + register + initialize the reserve (LENDER = DEPLOYER).
//   4. Initialize the snpl with the reserve as its current-reserve.
//   5. Lender supplies sBTC.
//   6. Lender opens a credit line against the snpl, then exercises the
//      cap/interest setters and the paused/min-sbtc-draw setters.
//   7. (snpl borrows + repays — snpl-side coverage in simul-snpl-sbtc-stx-jing.js)
//   8. Lender closes the credit line and withdraws remaining sBTC.
//
// Run: npx tsx simulations/simul-reserve-sbtc-stx-jing.js
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  contractPrincipalCV,
  standardPrincipalCV,
  bufferCV,
  noneCV,
  boolCV,
  trueCV,
  falseCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import {
  DEPLOYER,
  SBTC_DEPOSITOR_1,
  SBTC_ADDR,
  SBTC_NAME,
  SBTC_FQN,
  WSTX_ADDR,
  WSTX_NAME,
  BTC_USD_FEED_HEX,
  STX_USD_FEED_HEX,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-stx-jing";
const RESERVE_NAME = "reserve-sbtc-stx-jing";
const RESERVE_ID = `${DEPLOYER}.${RESERVE_NAME}`;
const SNPL_NAME = "snpl-sbtc-stx-jing";
const SNPL_ID = `${DEPLOYER}.${SNPL_NAME}`;
const RESERVE_TRAIT_NAME = "reserve-trait";
const SNPL_TRAIT_NAME = "snpl-trait";
const JING_CORE_ID = `${DEPLOYER}.jing-core`;

const SBTC_50M = 50_000_000;
const SBTC_10M = 10_000_000;
const SBTC_5M = 5_000_000;
const SBTC_2M = 2_000_000;
const CAP_5M = 5_000_000;
const INTEREST_500_BPS = 500;
const NEW_CAP_8M = 8_000_000;
const NEW_INTEREST_750_BPS = 750;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);
const reserveCV = contractPrincipalCV(DEPLOYER, RESERVE_NAME);
const snplCV = contractPrincipalCV(DEPLOYER, SNPL_NAME);

async function main() {
  console.log("=== RESERVE-SBTC-STX-JING LENDER LIFECYCLE STXER SIM ===\n");

  // Read all contract sources from disk.
  const reserveTraitSource = fs.readFileSync(
    "./contracts/reserve-trait.clar",
    "utf8",
  );
  const snplTraitSource = fs.readFileSync(
    "./contracts/snpl-trait.clar",
    "utf8",
  );
  const reserveSource = fs.readFileSync(
    `./contracts/${RESERVE_NAME}.clar`,
    "utf8",
  );
  const snplSource = fs.readFileSync(`./contracts/${SNPL_NAME}.clar`, "utf8");

  let sim = SimulationBuilder.new();
  // jing-core + market.
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV,
      sbtcTrait,
      wstxTrait,
      uintCV(1000),
      uintCV(1_000_000),
      btcFeedBuf,
      stxFeedBuf,
    ],
    useLive: true,
  });

  // Trait deps for reserve + snpl.
  sim = sim
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: RESERVE_TRAIT_NAME,
      source_code: reserveTraitSource,
      clarity_version: ClarityVersion.Clarity5,
    })
    .addContractDeploy({
      contract_name: SNPL_TRAIT_NAME,
      source_code: snplTraitSource,
      clarity_version: ClarityVersion.Clarity5,
    })
    // Reserve.
    .addContractDeploy({
      contract_name: RESERVE_NAME,
      source_code: reserveSource,
      clarity_version: ClarityVersion.Clarity5,
    })
    // SNPL (deployed by DEPLOYER → BORROWER = DEPLOYER).
    .addContractDeploy({
      contract_name: SNPL_NAME,
      source_code: snplSource,
      clarity_version: ClarityVersion.Clarity5,
    })
    // Register + initialize reserve.
    .addContractCall({
      contract_id: JING_CORE_ID,
      function_name: "set-verified-contract",
      function_args: [reserveCV],
    })
    .addContractCall({
      contract_id: RESERVE_ID,
      function_name: "initialize",
      function_args: [reserveCV],
    })
    // Register + initialize snpl (needs reserve principal at init time).
    .addContractCall({
      contract_id: JING_CORE_ID,
      function_name: "set-verified-contract",
      function_args: [snplCV],
    })
    .addContractCall({
      contract_id: SNPL_ID,
      function_name: "initialize",
      function_args: [snplCV, reserveCV],
    });

  const sessionId = await sim
    .addEvalCode(RESERVE_ID, "(get-lender)")
    .addEvalCode(RESERVE_ID, "(is-paused)")
    .addEvalCode(RESERVE_ID, "(get-min-sbtc-draw)")

    // Fund LENDER (DEPLOYER) with sBTC, then supply.
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: SBTC_FQN,
      function_name: "transfer",
      function_args: [
        uintCV(SBTC_50M),
        standardPrincipalCV(SBTC_DEPOSITOR_1),
        standardPrincipalCV(DEPLOYER),
        noneCV(),
      ],
    })
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: RESERVE_ID,
      function_name: "supply",
      function_args: [uintCV(SBTC_10M)],
    })
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${SBTC_FQN} '${RESERVE_ID})`)

    // Open credit line for the snpl.
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: RESERVE_ID,
      function_name: "open-credit-line",
      function_args: [
        snplCV,
        standardPrincipalCV(DEPLOYER), // borrower (= snpl's BORROWER constant)
        uintCV(CAP_5M),
        uintCV(INTEREST_500_BPS),
      ],
    })
    .addEvalCode(RESERVE_ID, `(get-credit-line '${SNPL_ID})`)
    .addEvalCode(RESERVE_ID, `(has-credit-line '${SNPL_ID})`)

    // Tweak cap + interest.
    .addContractCall({
      contract_id: RESERVE_ID,
      function_name: "set-credit-line-cap",
      function_args: [snplCV, uintCV(NEW_CAP_8M)],
    })
    .addContractCall({
      contract_id: RESERVE_ID,
      function_name: "set-credit-line-interest",
      function_args: [snplCV, uintCV(NEW_INTEREST_750_BPS)],
    })
    .addEvalCode(RESERVE_ID, `(get-credit-line '${SNPL_ID})`)

    // Paused gating: pause → expect any draw to revert ERR-PAUSED (u209).
    // We don't drive a draw here (that's snpl-side); instead just toggle
    // and unpause to exercise the setter.
    .addContractCall({
      contract_id: RESERVE_ID,
      function_name: "set-paused",
      function_args: [trueCV()],
    })
    .addEvalCode(RESERVE_ID, "(is-paused)")
    .addContractCall({
      contract_id: RESERVE_ID,
      function_name: "set-paused",
      function_args: [falseCV()],
    })

    // Min-sbtc-draw setter.
    .addContractCall({
      contract_id: RESERVE_ID,
      function_name: "set-min-sbtc-draw",
      function_args: [uintCV(SBTC_2M)],
    })
    .addEvalCode(RESERVE_ID, "(get-min-sbtc-draw)")

    // Close credit line (no outstanding) + withdraw remaining sBTC.
    .addContractCall({
      contract_id: RESERVE_ID,
      function_name: "close-credit-line",
      function_args: [snplCV],
    })
    .addEvalCode(RESERVE_ID, `(has-credit-line '${SNPL_ID})`)
    .addContractCall({
      contract_id: RESERVE_ID,
      function_name: "withdraw-sbtc",
      function_args: [uintCV(SBTC_10M)],
    })
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${SBTC_FQN} '${RESERVE_ID})`)

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
