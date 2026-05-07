// simul-markets-sbtc-usdcx-jing-settle-refresh.js
// Stxer simulation: settle-with-refresh for sbtc-usdcx market using a live
// Pyth BTC/USD VAA. Patches MAX_STALENESS down to u60 (real value) so the
// freshness gate enforces:
//   - settle (with stored stale prices) -> ERR_STALE_PRICE
//   - settle-with-refresh (fresh VAA)   -> ok
//
// Run: npx tsx simulations/simul-markets-sbtc-usdcx-jing-settle-refresh.js
import fs from "node:fs";
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

const PYTH_DEPLOYER = "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y";
const PYTH_STORAGE = `${PYTH_DEPLOYER}.pyth-storage-v4`;
const PYTH_DECODER = `${PYTH_DEPLOYER}.pyth-pnau-decoder-v3`;
const WORMHOLE_CORE = `${PYTH_DEPLOYER}.wormhole-core-v4`;

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

async function fetchPythVAA(timestamp, feedHex) {
  const url = `https://hermes.pyth.network/v2/updates/price/${timestamp}?ids[]=${feedHex}`;
  console.log(`Fetching Pyth VAA at timestamp ${timestamp}, feed ${feedHex.slice(0, 8)}...`);
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const data = await response.json();
  if (!data.binary?.data?.[0]) throw new Error(`No price data at ${timestamp}`);
  for (const p of data.parsed) {
    console.log(`  ${p.id.slice(0, 8)}... = $${(Number(p.price.price) / 1e8).toFixed(4)}`);
  }
  return data.binary.data[0];
}

async function main() {
  // Patch MAX_STALENESS down to u60 to prove the freshness gate fires.
  let marketSource = fs.readFileSync(`./contracts/${MARKET_NAME}.clar`, "utf8");
  marketSource = marketSource.replace(
    "(define-constant MAX_STALENESS u999999999)",
    "(define-constant MAX_STALENESS u60)"
  );

  const timestamp = Math.floor(Date.now() / 1000) - 30;
  const vaaHex = await fetchPythVAA(timestamp, BTC_USD_FEED_HEX);
  const vaaBuffer = bufferCV(Buffer.from(vaaHex, "hex"));

  console.log("\n=== MARKETS-SBTC-USDCX-JING SETTLE-WITH-REFRESH ===");
  console.log("MAX_STALENESS = u60. Stored price likely older than gate.");
  console.log("settle should fail with ERR_STALE_PRICE; settle-with-refresh should pass.\n");

  const [pythStoreAddr, pythStoreName] = PYTH_STORAGE.split(".");
  const [pythDecAddr, pythDecName] = PYTH_DECODER.split(".");
  const [wormAddr, wormName] = WORMHOLE_CORE.split(".");

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV,
      sbtcTrait,
      usdcxTrait,
      uintCV(MIN_SBTC),
      uintCV(MIN_USDCX),
      feedBuf,
    ],
    marketSourceOverride: marketSource,
  });

  const sessionId = await sim
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_100), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    })
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_100K), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    })

    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "close-deposits",
      function_args: [],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")

    // settle with stored stale prices -> expect ERR_STALE_PRICE (u1005)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "settle",
      function_args: [sbtcTrait, sbtcAsset, usdcxTrait, usdcxAsset],
    })

    // settle-with-refresh with fresh VAA -> expect ok
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "settle-with-refresh",
      function_args: [
        vaaBuffer,
        contractPrincipalCV(pythStoreAddr, pythStoreName),
        contractPrincipalCV(pythDecAddr, pythDecName),
        contractPrincipalCV(wormAddr, wormName),
        sbtcTrait, sbtcAsset, usdcxTrait, usdcxAsset,
      ],
    })

    .addEvalCode(MARKET_ID, "(get-settlement u0)")
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
