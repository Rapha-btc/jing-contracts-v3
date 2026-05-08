// simul-markets-sbtc-stx-jing-cancel-after-roll.js
// Stxer simulation: regression test for cancel-cycle x small-share-filter
// state-overwrite bug. Mirror of the usdcx variant — same scenario, but
// y-side is native STX (exercises the stx-transfer? refund path on cancel-y).
//
// See simul-markets-sbtc-usdcx-jing-cancel-after-roll.js for full bug
// description.
//
// Run: npx tsx simulations/simul-markets-sbtc-stx-jing-cancel-after-roll.js
import {
  uintCV,
  contractPrincipalCV,
  stringAsciiCV,
  bufferCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import {
  DEPLOYER,
  STX_DEPOSITOR_1,
  SBTC_DEPOSITOR_1,
  SBTC_ADDR,
  SBTC_NAME,
  SBTC_ASSET_NAME,
  WSTX_ADDR,
  WSTX_NAME,
  WSTX_ASSET_NAME,
  BTC_USD_FEED_HEX,
  STX_USD_FEED_HEX,
  CANCEL_THRESHOLD,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-stx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

// Fish principals (DEPLOYER reused as FISH_1; others need pre-funding)
const FISH_1 = DEPLOYER;
const FISH_2 = "SP06ARSREC0N9AKZABRP23SXS62TWJ6KWPVDQHVX";
const FISH_3 = "SP08YG111N936KQXZDR6A63857NN3PFSTWS9HFHH";

const STX_WHALE_AMOUNT = 600_000_000;       // whale: 600 STX (99.5% share)
const STX_FISH_AMOUNT = 1_000_000;          // each fish: 1 STX (~0.17%, below 0.20%)
const STX_FUND_PER_FISH = 5_000_000;        // 5 STX (gas + 1 STX deposit)
const SBTC_AMOUNT = 100_000;

const MIN_SBTC = 1000;
const MIN_STX = 1_000_000;
const STX_LIMIT_HIGH = 1_000_000_000_000_000;
const SBTC_LIMIT_LOW = 1;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);

async function main() {
  console.log("=== MARKETS-SBTC-STX-JING CANCEL-AFTER-ROLL (regression: cancel-cycle x small-share-filter merge) ===\n");

  let builder = SimulationBuilder.new();
  builder = addRegistryInit(builder, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV,
      sbtcTrait,
      wstxTrait,
      uintCV(MIN_SBTC),
      uintCV(MIN_STX),
      btcFeedBuf,
      stxFeedBuf,
    ],
  });

  // Fund FISH_2 and FISH_3 with STX (FISH_1 = DEPLOYER, has STX from prior funding pattern)
  let chain = builder.withSender(STX_DEPOSITOR_1);
  for (const fish of [FISH_2, FISH_3]) {
    chain = chain.addSTXTransfer({
      recipient: fish,
      amount: STX_FUND_PER_FISH,
      sender: STX_DEPOSITOR_1,
    });
  }

  const sessionId = await chain
    // === Setup ===
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(STX_WHALE_AMOUNT), uintCV(STX_LIMIT_HIGH), wstxTrait, wstxAsset],
    })
    .withSender(FISH_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(STX_FISH_AMOUNT), uintCV(STX_LIMIT_HIGH), wstxTrait, wstxAsset],
    })
    .withSender(FISH_2)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(STX_FISH_AMOUNT), uintCV(STX_LIMIT_HIGH), wstxTrait, wstxAsset],
    })
    .withSender(FISH_3)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(STX_FISH_AMOUNT), uintCV(STX_LIMIT_HIGH), wstxTrait, wstxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_AMOUNT), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })

    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")          // total-y = 603M, total-x = 100k
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u0)")    // [whale, fish1, fish2, fish3]

    // === close-deposits: rolls 3 fish to cycle 1 ===
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "close-deposits",
      function_args: [],
    })

    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")          // total-y = 600M (whale)
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u0)")    // [whale]
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")          // total-y = 3M (fish)
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")    // [fish1, fish2, fish3]

    // === Advance + cancel-cycle ===
    .addAdvanceBlocks({
      bitcoin_blocks: CANCEL_THRESHOLD,
      stacks_blocks_per_bitcoin: 1,
    })
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-cycle",
      function_args: [],
    })

    // === Critical assertions ===
    .addEvalCode(MARKET_ID, "(get-current-cycle)")            // u1
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")              // u0 (DEPOSIT)
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")          // total-y = 603M (MERGED)
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")    // 4 depositors
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${STX_DEPOSITOR_1})`)  // whale 600M
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${FISH_1})`)  // 1M
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${FISH_2})`)  // 1M
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${FISH_3})`)  // 1M
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_DEPOSITOR_1})`)  // 100k

    // === Conservation: each cancels successfully ===
    .withSender(FISH_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-y-deposit",
      function_args: [wstxTrait, wstxAsset],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")          // total-y = 602M
    .withSender(FISH_2)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-y-deposit",
      function_args: [wstxTrait, wstxAsset],
    })
    .withSender(FISH_3)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-y-deposit",
      function_args: [wstxTrait, wstxAsset],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")          // total-y = 600M (whale only)

    // Whale cancels — would underflow with bug
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-y-deposit",
      function_args: [wstxTrait, wstxAsset],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")          // total-y = 0
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")    // empty

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
