// simul-markets-sbtc-usdcx-jing-dust-sweep.js
// Stxer simulation: dust sweep for sbtc-usdcx market.
// 3 USDCx + 3 sBTC depositors with amounts that maximize integer-truncation
// dust during proportional distribution.
//
// Run: npx tsx simulations/simul-markets-sbtc-usdcx-jing-dust-sweep.js
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
  STX_DEPOSITOR_1,
  SBTC_ADDR,
  SBTC_NAME,
  SBTC_ASSET_NAME,
  SBTC_FQN,
  USDCX_ADDR,
  USDCX_NAME,
  USDCX_ASSET_NAME,
  USDCX_FQN,
  BTC_USD_FEED_HEX,
PYTH_STORAGE,
  PYTH_DECODER,
  WORMHOLE_CORE,
  fetchPythVAA,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-usdcx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

const USDCX_D1 = "SP06ARSREC0N9AKZABRP23SXS62TWJ6KWPVDQHVX";
const USDCX_D2 = "SP08YG111N936KQXZDR6A63857NN3PFSTWS9HFHH";
const USDCX_D3 = "SP0CM9M95MVJ375V6DAM0G63795VAYGPZ9T0CC1N";
const SBTC_D1 = "SP0DJ8T0VQRP06JP4NNK37RF9VC1FBVHK2JH1SA5";
const SBTC_D2 = "SP119GF8QD57784VCS9SGV7YXS18ZAKSHG5WR3JSC";
const SBTC_D3 = "SP12G0X9066S6F10KVT8JDEMGPHTQEADKZN95QD1F";
const ALL_ADDRS = [USDCX_D1, USDCX_D2, USDCX_D3, SBTC_D1, SBTC_D2, SBTC_D3];

// Amounts chosen to maximize integer-truncation dust during proportional distribution.
const USDCX_D1_AMOUNT = 33_333_333;
const USDCX_D2_AMOUNT = 44_444_444;
const USDCX_D3_AMOUNT = 22_222_223;
const SBTC_D1_AMOUNT = 33_333;
const SBTC_D2_AMOUNT = 44_444;
const SBTC_D3_AMOUNT = 22_223;

const STX_GAS_PER_ADDR = 10_000_000;        // 10 STX gas funding per address
const USDCX_FUND_PER_ADDR = 50_000_000;     // 50 USDCx per addr
const SBTC_FUND_PER_ADDR = 100_000;         // 0.001 sBTC per addr

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
  const vaaHex = await fetchPythVAA(BTC_USD_FEED_HEX);
  const vaaBuf = bufferCV(Buffer.from(vaaHex, "hex"));
  const [pythStoreAddr, pythStoreName] = PYTH_STORAGE.split(".");
  const [pythDecAddr, pythDecName] = PYTH_DECODER.split(".");
  const [wormAddr, wormName] = WORMHOLE_CORE.split(".");

  console.log("=== MARKETS-SBTC-USDCX-JING DUST SWEEP ===\n");

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
  });

  // STX gas funding (STX_DEPOSITOR_1 has 2953 free)
  for (const addr of ALL_ADDRS) {
    sim = sim.withSender(STX_DEPOSITOR_1).addSTXTransfer({
      recipient: addr,
      amount: STX_GAS_PER_ADDR,
      sender: STX_DEPOSITOR_1,
    });
  }
  // USDCx funding
  for (const addr of ALL_ADDRS) {
    sim = sim.withSender(USDCX_DEPOSITOR_1).addContractCall({
      contract_id: USDCX_FQN,
      function_name: "transfer",
      function_args: [
        uintCV(USDCX_FUND_PER_ADDR),
        standardPrincipalCV(USDCX_DEPOSITOR_1),
        standardPrincipalCV(addr),
        noneCV(),
      ],
    });
  }
  // sBTC funding
  for (const addr of ALL_ADDRS) {
    sim = sim.withSender(SBTC_DEPOSITOR_1).addContractCall({
      contract_id: SBTC_FQN,
      function_name: "transfer",
      function_args: [
        uintCV(SBTC_FUND_PER_ADDR),
        standardPrincipalCV(SBTC_DEPOSITOR_1),
        standardPrincipalCV(addr),
        noneCV(),
      ],
    });
  }

  // 3 USDCx depositors
  for (const [addr, amount] of [
    [USDCX_D1, USDCX_D1_AMOUNT],
    [USDCX_D2, USDCX_D2_AMOUNT],
    [USDCX_D3, USDCX_D3_AMOUNT],
  ]) {
    sim = sim.withSender(addr).addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(amount), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    });
  }
  // 3 sBTC depositors
  for (const [addr, amount] of [
    [SBTC_D1, SBTC_D1_AMOUNT],
    [SBTC_D2, SBTC_D2_AMOUNT],
    [SBTC_D3, SBTC_D3_AMOUNT],
  ]) {
    sim = sim.withSender(addr).addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [uintCV(amount), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    });
  }

  const sessionId = await sim
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .withSender(USDCX_D1)
    .addContractCall({ contract_id: MARKET_ID, function_name: "close-deposits", function_args: [] })
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "settle-with-refresh",
      function_args: [
        vaaBuf,
        contractPrincipalCV(pythStoreAddr, pythStoreName),
        contractPrincipalCV(pythDecAddr, pythDecName),
        contractPrincipalCV(wormAddr, wormName),
        sbtcTrait, sbtcAsset, usdcxTrait, usdcxAsset,
      ],
    })
    .addEvalCode(MARKET_ID, "(get-settlement u0)")
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${USDCX_D1})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${USDCX_D2})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${USDCX_D3})`)
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_D1})`)
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_D2})`)
    .addEvalCode(MARKET_ID, `(get-token-x-deposit u1 '${SBTC_D3})`)
    .addEvalCode(MARKET_ID, "(get-token-y-depositors u1)")
    .addEvalCode(MARKET_ID, "(get-token-x-depositors u1)")
    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
