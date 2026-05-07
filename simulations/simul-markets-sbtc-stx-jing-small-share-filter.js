// simul-markets-sbtc-stx-jing-small-share-filter.js
// Stxer simulation: small-share filter (MIN_SHARE_BPS = 20 bps = 0.2%) for
// sbtc-stx market. 3 small fish (1 STX each, ~0.17% of cycle-0 pool) are
// filtered out at cycle-0 close into cycle 1, where the whale's unfilled
// residual + fish gives them a >0.2% share so they settle in cycle 1.
// (USDCx variant needs 2 rolls because its cross-rate clears less per cycle;
// here the per-sat STX value is high enough that one roll suffices.)
//
// Run: npx tsx simulations/simul-markets-sbtc-stx-jing-small-share-filter.js
import {
  uintCV,
  contractPrincipalCV,
  standardPrincipalCV,
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
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-stx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

const SMALL_1 = DEPLOYER;
const SMALL_2 = "SP06ARSREC0N9AKZABRP23SXS62TWJ6KWPVDQHVX";
const SMALL_3 = "SP08YG111N936KQXZDR6A63857NN3PFSTWS9HFHH";

const STX_WHALE_AMOUNT = 600_000_000;       // whale: 600 STX
const STX_SMALL_AMOUNT = 1_000_000;         // each fish: 1 STX (~0.17%)
const STX_FUND_PER_FISH = 5_000_000;        // pre-fund each fish with 5 STX
const SBTC_AMOUNT = 100_000;
const SBTC_BIG_AMOUNT = 2_000_000;
const SBTC_SMALL_AMOUNT = 100_000;

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
  console.log("=== MARKETS-SBTC-STX-JING SMALL-SHARE FILTER ===\n");

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

  // Fund 3 small fish with 5 STX each via STX transfer (stx-transfer-memo? or stx-transfer)
  let chain = builder.withSender(STX_DEPOSITOR_1);
  for (const fish of [SMALL_1, SMALL_2, SMALL_3]) {
    chain = chain.addSTXTransfer({
      recipient: fish,
      amount: STX_FUND_PER_FISH,
      sender: STX_DEPOSITOR_1,
    });
  }

  const sessionId = await chain
    // === Cycle 0 ===
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(STX_WHALE_AMOUNT), uintCV(STX_LIMIT_HIGH), wstxTrait, wstxAsset],
    })
    .withSender(SMALL_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(STX_SMALL_AMOUNT), uintCV(STX_LIMIT_HIGH), wstxTrait, wstxAsset],
    })
    .withSender(SMALL_2)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(STX_SMALL_AMOUNT), uintCV(STX_LIMIT_HIGH), wstxTrait, wstxAsset],
    })
    .withSender(SMALL_3)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(STX_SMALL_AMOUNT), uintCV(STX_LIMIT_HIGH), wstxTrait, wstxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_AMOUNT), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })

    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u0)")

    .withSender(STX_DEPOSITOR_1)
    .addContractCall({ contract_id: MARKET_ID, function_name: "close-deposits", function_args: [] })

    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u0)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${SMALL_1})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${SMALL_2})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${SMALL_3})`)

    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "settle",
      function_args: [sbtcTrait, sbtcAsset, wstxTrait, wstxAsset],
    })
    .addEvalCode(MARKET_ID, "(get-settlement u0)")
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")

    // === Cycle 1 ===
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_BIG_AMOUNT), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({ contract_id: MARKET_ID, function_name: "close-deposits", function_args: [] })

    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u2)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u2)")

    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "settle",
      function_args: [sbtcTrait, sbtcAsset, wstxTrait, wstxAsset],
    })
    .addEvalCode(MARKET_ID, "(get-settlement u1)")
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u2)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u2)")

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
