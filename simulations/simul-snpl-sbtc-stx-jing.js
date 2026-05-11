// simul-snpl-sbtc-stx-jing.js
// Stxer mainnet-fork simulation: full borrower lifecycle on
// snpl-sbtc-stx-jing. Pairs with simul-reserve-sbtc-stx-jing for reserve
// admin coverage; here we drive the borrower-side flow:
//
//   1. addRegistryInit deploys jing-core + market and initializes the market.
//   2. Deploy reserve-trait + snpl-trait + reserve + snpl.
//   3. Register + initialize the reserve (LENDER = DEPLOYER).
//   4. Register + initialize the snpl (BORROWER = DEPLOYER).
//   5. Lender supplies sBTC + opens credit line.
//   6. Borrower borrows -> snpl.draw on reserve, sBTC moves snpl-wards.
//   7. Borrower swap-deposits into the market.
//   8. Borrower cancel-swap (escape hatch).
//   9. Borrower repay -> protocol fee to JING-TREASURY, principal back to
//      reserve, STX (none here) to borrower, reserve.notify-return drains
//      outstanding.
//
// Borrower = lender = DEPLOYER in this sim (both are deploy-time tx-sender).
// Production has them as separate principals; the contract logic handles
// both correctly.
//
// Run: npx tsx simulations/simul-snpl-sbtc-stx-jing.js
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  contractPrincipalCV,
  standardPrincipalCV,
  bufferCV,
  noneCV,
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
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;
const RESERVE_NAME = "reserve-sbtc-stx-jing";
const RESERVE_ID = `${DEPLOYER}.${RESERVE_NAME}`;
const SNPL_NAME = "snpl-sbtc-stx-jing";
const SNPL_ID = `${DEPLOYER}.${SNPL_NAME}`;
const RESERVE_TRAIT_NAME = "reserve-trait";
const SNPL_TRAIT_NAME = "snpl-trait";
const JING_CORE_ID = `${DEPLOYER}.jing-core`;

const SBTC_50M = 50_000_000;
const SBTC_10M = 10_000_000;
const SBTC_2M = 2_000_000;
const CAP_5M = 5_000_000;
const INTEREST_500_BPS = 500;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);
const reserveCV = contractPrincipalCV(DEPLOYER, RESERVE_NAME);
const snplCV = contractPrincipalCV(DEPLOYER, SNPL_NAME);

async function main() {
  console.log("=== SNPL-SBTC-STX-JING BORROWER LIFECYCLE STXER SIM ===\n");

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
    .addContractDeploy({
      contract_name: RESERVE_NAME,
      source_code: reserveSource,
      clarity_version: ClarityVersion.Clarity5,
    })
    .addContractDeploy({
      contract_name: SNPL_NAME,
      source_code: snplSource,
      clarity_version: ClarityVersion.Clarity5,
    })
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
    .addEvalCode(SNPL_ID, "(get-borrower)")
    .addEvalCode(SNPL_ID, "(get-reserve)")
    .addEvalCode(SNPL_ID, "(get-active-loan)")

    // Fund LENDER (DEPLOYER) with sBTC for the supply + interest top-up.
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
    // Supply 10M sBTC to reserve, leave 40M with DEPLOYER for the repay
    // top-up (5% of 2M = 100K sats).
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: RESERVE_ID,
      function_name: "supply",
      function_args: [uintCV(SBTC_10M)],
    })

    // Open credit line for the snpl.
    .addContractCall({
      contract_id: RESERVE_ID,
      function_name: "open-credit-line",
      function_args: [
        snplCV,
        standardPrincipalCV(DEPLOYER),
        uintCV(CAP_5M),
        uintCV(INTEREST_500_BPS),
      ],
    })

    // Borrower borrows 2M sBTC at 500 bps → snpl creates loan id u1.
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: SNPL_ID,
      function_name: "borrow",
      function_args: [
        uintCV(SBTC_2M),
        uintCV(INTEREST_500_BPS),
        reserveCV,
      ],
    })
    .addEvalCode(SNPL_ID, "(get-active-loan)")
    .addEvalCode(SNPL_ID, "(get-loan u1)")
    .addEvalCode(SNPL_ID, "(payoff-on-loan u1)")
    .addEvalCode(RESERVE_ID, `(get-credit-line '${SNPL_ID})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${SBTC_FQN} '${SNPL_ID})`)

    // Borrower swap-deposits the borrowed sBTC into the market at
    // limit-price = 1 (any clearing).
    .addContractCall({
      contract_id: SNPL_ID,
      function_name: "swap-deposit",
      function_args: [uintCV(1), uintCV(1)],
    })
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u0 '${SNPL_ID})`)
    .addEvalCode(SNPL_ID, "(get-loan u1)")

    // Update the limit on the in-flight market deposit.
    .addContractCall({
      contract_id: SNPL_ID,
      function_name: "set-swap-limit",
      function_args: [uintCV(1), uintCV(2)],
    })
    .addEvalCode(SNPL_ID, "(get-loan u1)")

    // Cancel-swap (escape hatch) → sBTC pulled back to snpl.
    .addContractCall({
      contract_id: SNPL_ID,
      function_name: "cancel-swap",
      function_args: [uintCV(1)],
    })
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u0 '${SNPL_ID})`)

    // Repay → protocol fee + lender payoff back to reserve, status REPAID.
    .addContractCall({
      contract_id: SNPL_ID,
      function_name: "repay",
      function_args: [uintCV(1), reserveCV],
    })
    .addEvalCode(SNPL_ID, "(get-loan u1)")
    .addEvalCode(SNPL_ID, "(get-active-loan)")
    .addEvalCode(RESERVE_ID, `(get-credit-line '${SNPL_ID})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${SBTC_FQN} '${RESERVE_ID})`)

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
