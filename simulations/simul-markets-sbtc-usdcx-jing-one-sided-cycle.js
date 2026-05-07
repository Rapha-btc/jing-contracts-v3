// simul-markets-sbtc-usdcx-jing-one-sided-cycle.js
// Stxer simulation: cycle with deposits on only ONE side. close-deposits
// must fail u1012 NOTHING_TO_SETTLE because the other side hasn't met
// min-token-{x,y}-deposit. Then add the missing side and confirm
// close-deposits + settle work normally.
//
// Coverage gap closed: every previous sim has both sides funded; this
// proves the asymmetric-cycle gate fires correctly.
//
// Run: npx tsx simulations/simul-markets-sbtc-usdcx-jing-one-sided-cycle.js
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
  PYTH_STORAGE,
  PYTH_DECODER,
  WORMHOLE_CORE,
  fetchPythVAA,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-usdcx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

const SBTC_100K = 100_000;
const USDCX_100 = 100_000_000;
const MIN_SBTC = 1000;
const MIN_USDCX = 1_000_000;
const LIMIT_HIGH = 1_000_000_000_000_000;
const LIMIT_LOW = 1;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const usdcxTrait = contractPrincipalCV(USDCX_ADDR, USDCX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const usdcxAsset = stringAsciiCV(USDCX_ASSET_NAME);
const feedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);

async function main() {
  const vaaHex = await fetchPythVAA(BTC_USD_FEED_HEX);
  const vaaBuf = bufferCV(Buffer.from(vaaHex, "hex"));
  const [pythStoreAddr, pythStoreName] = PYTH_STORAGE.split(".");
  const [pythDecAddr, pythDecName] = PYTH_DECODER.split(".");
  const [wormAddr, wormName] = WORMHOLE_CORE.split(".");

  console.log("=== MARKETS-SBTC-USDCX-JING ONE-SIDED CYCLE ===\n");

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV, sbtcTrait, usdcxTrait,
      uintCV(MIN_SBTC), uintCV(MIN_USDCX), feedBuf,
    ],
  });

  const sessionId = await sim
    // Only USDCx deposits — no sBTC
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_100), uintCV(LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")          // total-x = 0
    .addEvalCode(MARKET_ID, "(get-token-x-depositors u0)")    // empty list

    // close-deposits should fail u1012 NOTHING_TO_SETTLE because
    // total-token-x = 0 < min-token-x-deposit (= 1000 sats)
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "close-deposits",
      function_args: [],
    })
    // Phase still PHASE_DEPOSIT (close failed)
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")              // = u0

    // Now add the missing x-side deposit
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_100K), uintCV(LIMIT_LOW), sbtcTrait, sbtcAsset],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")          // both sides now funded

    // close-deposits should now succeed
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "close-deposits",
      function_args: [],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")              // = u2 SETTLE

    // Settle normally
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "settle-with-refresh",
      function_args: [
        vaaBuf,
        contractPrincipalCV(pythStoreAddr, pythStoreName),
        contractPrincipalCV(pythDecAddr, pythDecName),
        contractPrincipalCV(wormAddr, wormName),
        sbtcTrait, sbtcAsset, usdcxTrait, usdcxAsset,
      ],
    })
    .addEvalCode(MARKET_ID, "(get-settlement u0)")
    .addEvalCode(MARKET_ID, "(get-current-cycle)")            // = u1

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
