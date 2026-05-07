// simul-markets-sbtc-usdcx-jing-small-share-filter.js
// Stxer simulation: small-share filter (MIN_SHARE_BPS = 20 bps = 0.2%) for
// sbtc-usdcx market. 3 small fish (1 USDCx each, ~0.17% of pool) get
// rolled across cycles 0 and 1, then finally settle in cycle 2 once their
// share exceeds the threshold.
//
// Run: npx tsx simulations/simul-markets-sbtc-usdcx-jing-small-share-filter.js
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
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-usdcx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

const SMALL_1 = DEPLOYER;
const SMALL_2 = "SP06ARSREC0N9AKZABRP23SXS62TWJ6KWPVDQHVX";
const SMALL_3 = "SP08YG111N936KQXZDR6A63857NN3PFSTWS9HFHH";

const USDCX_WHALE_AMOUNT = 600_000_000;     // whale: 600 USDCx
const USDCX_SMALL_AMOUNT = 1_000_000;       // each fish: 1 USDCx (~0.17%)
const USDCX_FUND_PER_FISH = 5_000_000;      // pre-fund each fish with 5 USDCx
const SBTC_AMOUNT = 100_000;                // cycle 0 sBTC bid
const SBTC_BIG_AMOUNT = 2_000_000;          // cycle 1 sBTC clears most whale
const SBTC_SMALL_AMOUNT = 100_000;          // cycle 2 sBTC clears fish

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
  console.log("=== MARKETS-SBTC-USDCX-JING SMALL-SHARE FILTER ===\n");

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

  let chain = builder
    // Fund 3 small fish with 5 USDCx each
    .withSender(USDCX_DEPOSITOR_1);
  for (const fish of [SMALL_1, SMALL_2, SMALL_3]) {
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
    // === Cycle 0: whale + 3 fish on USDCx, 100k sats sBTC ===
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_WHALE_AMOUNT), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    .withSender(SMALL_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_SMALL_AMOUNT), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    .withSender(SMALL_2)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_SMALL_AMOUNT), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    .withSender(SMALL_3)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_SMALL_AMOUNT), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_AMOUNT), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })

    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u0)")

    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({ contract_id: MARKET_ID, function_name: "close-deposits", function_args: [] })

    // After close-deposits the small fish should have rolled to cycle 1
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u0)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${SMALL_1})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${SMALL_2})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${SMALL_3})`)

    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "settle",
      function_args: [sbtcTrait, sbtcAsset, usdcxTrait, usdcxAsset],
    })
    .addEvalCode(MARKET_ID, "(get-settlement u0)")
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")

    // === Cycle 1: big sBTC clears most of remaining whale USDCx ===
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_BIG_AMOUNT), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({ contract_id: MARKET_ID, function_name: "close-deposits", function_args: [] })

    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u2)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u2)")

    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "settle",
      function_args: [sbtcTrait, sbtcAsset, usdcxTrait, usdcxAsset],
    })
    .addEvalCode(MARKET_ID, "(get-settlement u1)")
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u2)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u2)")

    // === Cycle 2: fish finally settle ===
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_SMALL_AMOUNT), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({ contract_id: MARKET_ID, function_name: "close-deposits", function_args: [] })

    .addEvalCode(MARKET_ID, "(get-cycle-totals u2)")
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u2)")

    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "settle",
      function_args: [sbtcTrait, sbtcAsset, usdcxTrait, usdcxAsset],
    })
    .addEvalCode(MARKET_ID, "(get-settlement u2)")
    .addEvalCode(MARKET_ID, "(get-current-cycle)")

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
