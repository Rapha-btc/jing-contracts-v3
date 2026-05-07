// simul-jing-core-multi-market.js
// Stxer simulation: register both markets in one jing-core. Same sBTC
// depositor deposits into both → get-token-equity sums to 200k. Verifies
// the equity ledger correctly aggregates per-token across markets.
//
// Run: npx tsx simulations/simul-jing-core-multi-market.js
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  contractPrincipalCV,
  stringAsciiCV,
  bufferCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import {
  DEPLOYER,
  USDCX_DEPOSITOR_1,
  STX_DEPOSITOR_1,
  SBTC_DEPOSITOR_1,
  JING_CORE_NAME,
  SBTC_ADDR,
  SBTC_NAME,
  SBTC_ASSET_NAME,
  SBTC_FQN,
  USDCX_ADDR,
  USDCX_NAME,
  USDCX_ASSET_NAME,
  USDCX_FQN,
  WSTX_ADDR,
  WSTX_NAME,
  WSTX_ASSET_NAME,
  WSTX_FQN,
  BTC_USD_FEED_HEX,
  STX_USD_FEED_HEX,
} from "./_setup.js";

const JING_CORE_ID = `${DEPLOYER}.${JING_CORE_NAME}`;
const USDCX_MARKET_NAME = "markets-sbtc-usdcx-jing";
const STX_MARKET_NAME = "markets-sbtc-stx-jing";
const USDCX_MARKET_ID = `${DEPLOYER}.${USDCX_MARKET_NAME}`;
const STX_MARKET_ID = `${DEPLOYER}.${STX_MARKET_NAME}`;
const usdcxMarketCV = contractPrincipalCV(DEPLOYER, USDCX_MARKET_NAME);
const stxMarketCV = contractPrincipalCV(DEPLOYER, STX_MARKET_NAME);

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const usdcxTrait = contractPrincipalCV(USDCX_ADDR, USDCX_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const usdcxAsset = stringAsciiCV(USDCX_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));

const SBTC_PER_MARKET = 100_000;
const USDCX_AMOUNT = 100_000_000;
const STX_AMOUNT = 100_000_000;

async function main() {
  const jingCoreSource = fs.readFileSync("./contracts/jing-core.clar", "utf8");
  const usdcxMarketSource = fs.readFileSync(`./contracts/${USDCX_MARKET_NAME}.clar`, "utf8");
  const stxMarketSource = fs.readFileSync(`./contracts/${STX_MARKET_NAME}.clar`, "utf8");

  console.log("=== JING-CORE MULTI-MARKET AGGREGATION ===\n");

  const sessionId = await SimulationBuilder.new()
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: JING_CORE_NAME, source_code: jingCoreSource,
      clarity_version: ClarityVersion.Clarity4,
    })
    .addContractDeploy({
      contract_name: USDCX_MARKET_NAME, source_code: usdcxMarketSource,
      clarity_version: ClarityVersion.Clarity5,
    })
    .addContractDeploy({
      contract_name: STX_MARKET_NAME, source_code: stxMarketSource,
      clarity_version: ClarityVersion.Clarity5,
    })

    // Verify both markets (one-step each, no timelock)
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "set-verified-contract",
      function_args: [usdcxMarketCV],
    })
    .addContractCall({
      contract_id: JING_CORE_ID, function_name: "set-verified-contract",
      function_args: [stxMarketCV],
    })

    // Initialize both
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: USDCX_MARKET_ID, function_name: "initialize",
      function_args: [
        usdcxMarketCV, sbtcTrait, usdcxTrait,
        uintCV(1000), uintCV(1_000_000), btcFeedBuf,
      ],
    })
    .addContractCall({
      contract_id: STX_MARKET_ID, function_name: "initialize",
      function_args: [
        stxMarketCV, sbtcTrait, wstxTrait,
        uintCV(1000), uintCV(1_000_000), btcFeedBuf, stxFeedBuf,
      ],
    })
    .addEvalCode(JING_CORE_ID, `(is-registered '${USDCX_MARKET_ID})`)
    .addEvalCode(JING_CORE_ID, `(is-registered '${STX_MARKET_ID})`)

    // sBTC depositor deposits into BOTH markets
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: USDCX_MARKET_ID, function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_PER_MARKET), uintCV(1), sbtcTrait, sbtcAsset],
    })
    .addContractCall({
      contract_id: STX_MARKET_ID, function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_PER_MARKET), uintCV(1), sbtcTrait, sbtcAsset],
    })

    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: USDCX_MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_AMOUNT), uintCV(1_000_000_000_000_000), usdcxTrait, usdcxAsset],
    })
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: STX_MARKET_ID, function_name: "deposit-token-y",
      function_args: [uintCV(STX_AMOUNT), uintCV(1_000_000_000_000_000), wstxTrait, wstxAsset],
    })

    // Equity reads
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${SBTC_FQN} '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(JING_CORE_ID, `(get-balance '${SBTC_DEPOSITOR_1})`)
    .addEvalCode(JING_CORE_ID, `(get-total-token-equity '${SBTC_FQN})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${USDCX_FQN} '${USDCX_DEPOSITOR_1})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${WSTX_FQN} '${STX_DEPOSITOR_1})`)
    .addEvalCode(JING_CORE_ID, `(get-total-token-equity '${USDCX_FQN})`)
    .addEvalCode(JING_CORE_ID, `(get-total-token-equity '${WSTX_FQN})`)

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
