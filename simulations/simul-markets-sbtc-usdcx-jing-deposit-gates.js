// simul-markets-sbtc-usdcx-jing-deposit-gates.js
// Stxer simulation: provoke each deposit-time error gate on sbtc-usdcx market.
//   u1019 WRONG_TRAIT       — pass a non-matching SIP-010 trait
//   u1001 DEPOSIT_TOO_SMALL — amount below MIN_USDCX / MIN_SBTC
//   u1017 LIMIT_REQUIRED    — limit-price = 0
//   u1018 ALREADY_INITIALIZED — call initialize twice
//
// Run: npx tsx simulations/simul-markets-sbtc-usdcx-jing-deposit-gates.js
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
const USDCX_LIMIT_HIGH = 1_000_000_000_000_000;
const SBTC_LIMIT_LOW = 1;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const usdcxTrait = contractPrincipalCV(USDCX_ADDR, USDCX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const usdcxAsset = stringAsciiCV(USDCX_ASSET_NAME);
const feedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);

async function main() {
  console.log("=== MARKETS-SBTC-USDCX-JING DEPOSIT-TIME ERROR GATES ===\n");

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV, sbtcTrait, usdcxTrait,
      uintCV(MIN_SBTC), uintCV(MIN_USDCX), feedBuf,
    ],
  });

  const sessionId = await sim
    // === u1019 WRONG_TRAIT on token-y ===
    // deposit-token-y expects USDCx trait; pass sBTC trait instead.
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [
        uintCV(USDCX_100),
        uintCV(USDCX_LIMIT_HIGH),
        sbtcTrait,                 // WRONG — should be usdcxTrait
        sbtcAsset,
      ],
    })

    // === u1019 WRONG_TRAIT on token-x ===
    // deposit-token-x expects sBTC trait; pass USDCx trait instead.
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-x",
      function_args: [
        uintCV(SBTC_100K),
        uintCV(SBTC_LIMIT_LOW),
        usdcxTrait,                // WRONG — should be sbtcTrait
        usdcxAsset,
      ],
    })

    // === u1001 DEPOSIT_TOO_SMALL on token-y ===
    // 1 µUSDCx is below MIN_USDCX = 1_000_000
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(1), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })

    // === u1001 DEPOSIT_TOO_SMALL on token-x ===
    // 1 sat is below MIN_SBTC = 1000
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-x",
      function_args: [uintCV(1), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })

    // === u1017 LIMIT_REQUIRED on token-y ===
    // Pass limit-price = 0
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_100), uintCV(0), usdcxTrait, usdcxAsset],
    })

    // === u1017 LIMIT_REQUIRED on token-x ===
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_100K), uintCV(0), sbtcTrait, sbtcAsset],
    })

    // === u1018 ALREADY_INITIALIZED ===
    // initialize was already called in addRegistryInit; calling again should fail.
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "initialize",
      function_args: [
        marketCV, sbtcTrait, usdcxTrait,
        uintCV(MIN_SBTC), uintCV(MIN_USDCX), feedBuf,
      ],
    })

    // Sanity: a CORRECT deposit should still work
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_100), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
