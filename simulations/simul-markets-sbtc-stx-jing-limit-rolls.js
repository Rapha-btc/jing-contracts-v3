// simul-markets-sbtc-stx-jing-limit-rolls.js
// Stxer simulation: limit-violation rolls at settle for sbtc-stx market.
// 2 STX-side and 2 sBTC-side depositors; one of each rolls because clearing
// price violates their limit. Verifies filter-limit-violating-* + log-limit-roll-*.
//
// Run: npx tsx simulations/simul-markets-sbtc-stx-jing-limit-rolls.js
import {
  uintCV,
  contractPrincipalCV,
  standardPrincipalCV,
  stringAsciiCV,
  bufferCV,
  noneCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import {
  DEPLOYER,
  STX_DEPOSITOR_1,
  SBTC_DEPOSITOR_1,
  SBTC_ADDR,
  SBTC_NAME,
  SBTC_ASSET_NAME,
  SBTC_FQN,
  WSTX_ADDR,
  WSTX_NAME,
  WSTX_ASSET_NAME,
  BTC_USD_FEED_HEX,
  STX_USD_FEED_HEX,
PYTH_STORAGE,
  PYTH_DECODER,
  WORMHOLE_CORE,
  fetchPythVAA,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-stx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

const STX_VIOLATOR = "SP06ARSREC0N9AKZABRP23SXS62TWJ6KWPVDQHVX";
const SBTC_VIOLATOR = "SP0DJ8T0VQRP06JP4NNK37RF9VC1FBVHK2JH1SA5";

const STX_AMOUNT = 100_000_000;       // 100 STX
const SBTC_AMOUNT = 100_000;

const LIMIT_HIGH = 1_000_000_000_000_000;
const LIMIT_LOW = 1;

// Cross-rate clearing for sbtc-stx ≈ 3.2e13 (STX/sBTC at 1e8 scale).
//   y-side (STX) rolls if clearing > limit-y. limit-y = u1000 -> roll.
//   x-side (sBTC) rolls if clearing < limit-x. limit-x = u1e15 (above 3.2e13) -> roll.
const RESTRICTIVE_Y = 1000;
const RESTRICTIVE_X = 1_000_000_000_000_000;

// STX violator needs deposit + funding for the deposit itself
const STX_FUND_VIOLATOR = STX_AMOUNT + 10_000_000;
const STX_GAS_FOR_SBTC_VIOLATOR = 10_000_000;
const SBTC_FUND_VIOLATOR = SBTC_AMOUNT + 1_000;

const MIN_SBTC = 1000;
const MIN_STX = 1_000_000;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);

async function main() {
  const vaaXHex = await fetchPythVAA(BTC_USD_FEED_HEX);
  const vaaYHex = await fetchPythVAA(STX_USD_FEED_HEX);
  const vaaXBuf = bufferCV(Buffer.from(vaaXHex, "hex"));
  const vaaYBuf = bufferCV(Buffer.from(vaaYHex, "hex"));
  const [pythStoreAddr, pythStoreName] = PYTH_STORAGE.split(".");
  const [pythDecAddr, pythDecName] = PYTH_DECODER.split(".");
  const [wormAddr, wormName] = WORMHOLE_CORE.split(".");

  console.log("=== MARKETS-SBTC-STX-JING LIMIT-VIOLATION ROLLS ===\n");

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV, sbtcTrait, wstxTrait,
      uintCV(MIN_SBTC), uintCV(MIN_STX), btcFeedBuf, stxFeedBuf,
    ],
  });

  const sessionId = await sim
    // Fund violators
    .withSender(STX_DEPOSITOR_1)
    .addSTXTransfer({ recipient: STX_VIOLATOR, amount: STX_FUND_VIOLATOR, sender: STX_DEPOSITOR_1 })
    .addSTXTransfer({ recipient: SBTC_VIOLATOR, amount: STX_GAS_FOR_SBTC_VIOLATOR, sender: STX_DEPOSITOR_1 })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: SBTC_FQN, function_name: "transfer",
      function_args: [
        uintCV(SBTC_FUND_VIOLATOR),
        standardPrincipalCV(SBTC_DEPOSITOR_1),
        standardPrincipalCV(SBTC_VIOLATOR),
        noneCV(),
      ],
    })

    // Permissive STX depositor
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(STX_AMOUNT), uintCV(LIMIT_HIGH), wstxTrait, wstxAsset],
    })
    // Restrictive STX depositor
    .withSender(STX_VIOLATOR)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(STX_AMOUNT), uintCV(RESTRICTIVE_Y), wstxTrait, wstxAsset],
    })
    // Permissive sBTC depositor
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_AMOUNT), uintCV(LIMIT_LOW), sbtcTrait, sbtcAsset],
    })
    // Restrictive sBTC depositor
    .withSender(SBTC_VIOLATOR)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_AMOUNT), uintCV(RESTRICTIVE_X), sbtcTrait, sbtcAsset],
    })

    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u0)")
    .addEvalCode(MARKET_ID, "(get-token-x-depositors u0)")

    .withSender(STX_DEPOSITOR_1)
    .addContractCall({ contract_id: MARKET_ID, function_name: "close-deposits", function_args: [] })
    .addContractCall({
      contract_id: MARKET_ID, function_name: "settle-with-refresh",
      function_args: [
        vaaXBuf, vaaYBuf,
        contractPrincipalCV(pythStoreAddr, pythStoreName),
        contractPrincipalCV(pythDecAddr, pythDecName),
        contractPrincipalCV(wormAddr, wormName),
        sbtcTrait, sbtcAsset, wstxTrait, wstxAsset,
      ],
    })

    .addEvalCode(MARKET_ID, "(get-settlement u0)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${STX_VIOLATOR})`)
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_VIOLATOR})`)
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")
    .addEvalCode(MARKET_ID, "(get-token-x-depositors u1)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${STX_DEPOSITOR_1})`)
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_DEPOSITOR_1})`)

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
