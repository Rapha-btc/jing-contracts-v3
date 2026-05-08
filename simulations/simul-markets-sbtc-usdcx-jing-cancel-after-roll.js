// simul-markets-sbtc-usdcx-jing-cancel-after-roll.js
// Stxer simulation: regression test for cancel-cycle x small-share-filter
// state-overwrite bug.
//
// Bug (now fixed): when cycle C had small depositors rolled to C+1 by
// close-deposits' small-share-filter, a subsequent cancel-cycle would
// OVERWRITE C+1's depositor list and totals with C's, dropping the
// rolled depositors. Funds remained in the deposits map but became
// invisible to settlement; whale's later cancel could underflow totals.
//
// This sim reproduces the conditions that triggered the bug and asserts
// the fix conserves state across the merge:
//   1. Whale + 3 fish (each below 0.20% threshold) deposit y in cycle 0
//   2. close-deposits triggers small-share-filter -> 3 fish moved to cycle 1
//   3. Advance 42 blocks (CANCEL_THRESHOLD)
//   4. cancel-cycle from cycle 0
//   5. Verify cycle 1 contains all 4 depositors AND merged totals
//   6. Whale cancels y -> would have underflowed if bug present
//   7. Each fish cancels y -> all funds returned cleanly
//
// Run: npx tsx simulations/simul-markets-sbtc-usdcx-jing-cancel-after-roll.js
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
  USDCX_DEPOSITOR_1,
  SBTC_DEPOSITOR_1,
  SBTC_ADDR,
  SBTC_NAME,
  SBTC_ASSET_NAME,
  USDCX_ADDR,
  USDCX_NAME,
  USDCX_ASSET_NAME,
  USDCX_FQN,
  BTC_USD_FEED_HEX,
  CANCEL_THRESHOLD,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-usdcx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

// Fish principals (reuse from small-share-filter sim — known-good addresses)
const FISH_1 = DEPLOYER;
const FISH_2 = "SP06ARSREC0N9AKZABRP23SXS62TWJ6KWPVDQHVX";
const FISH_3 = "SP08YG111N936KQXZDR6A63857NN3PFSTWS9HFHH";

const USDCX_WHALE_AMOUNT = 600_000_000;     // whale: 600 USDCx (99.5% share)
const USDCX_FISH_AMOUNT = 1_000_000;        // each fish: 1 USDCx (~0.17%, below 0.20% threshold)
const USDCX_FUND_PER_FISH = 5_000_000;      // pre-fund each fish with 5 USDCx
const SBTC_AMOUNT = 100_000;                // x-side deposit (so close-deposits can fire)

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
  console.log("=== MARKETS-SBTC-USDCX-JING CANCEL-AFTER-ROLL (regression: cancel-cycle x small-share-filter merge) ===\n");

  let builder = SimulationBuilder.new();
  builder = addRegistryInit(builder, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV,
      sbtcTrait,
      usdcxTrait,
      uintCV(MIN_SBTC),
      uintCV(MIN_USDCX),
      feedBuf,
    ],
  });

  // Fund 3 fish with USDCx
  let chain = builder.withSender(USDCX_DEPOSITOR_1);
  for (const fish of [FISH_2, FISH_3]) {
    // FISH_1 is DEPLOYER, who already has USDCx
    chain = chain.addContractCall({
      contract_id: USDCX_FQN,
      function_name: "transfer",
      function_args: [
        uintCV(USDCX_FUND_PER_FISH),
        standardPrincipalCV(USDCX_DEPOSITOR_1),
        standardPrincipalCV(fish),
        noneCV(),
      ],
    });
  }

  const sessionId = await chain
    // === Setup: whale + 3 fish on y-side, sbtc on x-side ===
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_WHALE_AMOUNT), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    .withSender(FISH_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_FISH_AMOUNT), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    .withSender(FISH_2)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_FISH_AMOUNT), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    .withSender(FISH_3)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_FISH_AMOUNT), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_AMOUNT), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })

    // Pre-close state: 603M y total, 4 y-depositors
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")          // total-y = 603M, total-x = 100k
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u0)")    // [whale, fish1, fish2, fish3]

    // === close-deposits: small-share-filter rolls 3 fish (each 0.17% < 0.20%) to cycle 1 ===
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "close-deposits",
      function_args: [],
    })

    // Post-close state — fish should be in cycle 1, whale alone in cycle 0
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")          // total-y = 600M (whale only)
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u0)")    // [whale]
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")          // total-y = 3M (3 fish)
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")    // [fish1, fish2, fish3]
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${FISH_1})`)  // 1M
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${FISH_2})`)  // 1M
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${FISH_3})`)  // 1M

    // === Advance past CANCEL_THRESHOLD, then cancel-cycle ===
    .addAdvanceBlocks({
      bitcoin_blocks: CANCEL_THRESHOLD,
      stacks_blocks_per_bitcoin: 1,
    })
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-cycle",
      function_args: [],
    })

    // === CRITICAL ASSERTIONS — fix is correct iff:
    //   - cycle 1 totals = 600M (whale rolled by cancel-cycle) + 3M (fish already there) = 603M
    //   - cycle 1 list contains ALL 4 depositors (concat-merge worked)
    //   - cycle 1 deposits map has whale's amount AND each fish's amount intact
    .addEvalCode(MARKET_ID, "(get-current-cycle)")            // u1
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")              // u0 (DEPOSIT, since advance-cycle reset closed-block)
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")          // total-y = 603M (MERGED, was 600M with bug)
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")    // 4 depositors (was [whale] only with bug)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${USDCX_DEPOSITOR_1})`)  // whale = 600M
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${FISH_1})`)  // 1M (preserved through cancel-cycle)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${FISH_2})`)  // 1M
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${FISH_3})`)  // 1M
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_DEPOSITOR_1})`)  // 100k (rolled by cancel-cycle)
    .addEvalCode(MARKET_ID, "(get-token-x-depositors u1)")    // [sbtc-depositor]

    // === Conservation test: each depositor cancels successfully ===
    // With the bug: whale's cancel would underflow because totals (= 600M with bug)
    // would be wrong after fish cancellations decremented it. With fix: totals
    // start at 603M, each cancel cleanly subtracts.
    .withSender(FISH_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-y-deposit",
      function_args: [usdcxTrait, usdcxAsset],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")          // total-y = 602M
    .withSender(FISH_2)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-y-deposit",
      function_args: [usdcxTrait, usdcxAsset],
    })
    .withSender(FISH_3)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-y-deposit",
      function_args: [usdcxTrait, usdcxAsset],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")          // total-y = 600M (whale only)

    // Whale cancel — with bug: 600M - 600M would be fine BUT only because
    // bug "preserved" wrong total of 600M. The smoking gun is more subtle:
    // with bug, fish cancels would each subtract from the wrong 600M total
    // (600M -> 599M -> 598M -> 597M), then whale (600M) would underflow.
    // With fix: 603M -> 602M -> 601M -> 600M, then whale 600M cleanly -> 0.
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "cancel-token-y-deposit",
      function_args: [usdcxTrait, usdcxAsset],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")          // total-y = 0
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")    // empty

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
