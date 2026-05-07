// simul-markets-sbtc-stx-jing-dust-sweep.js
// Stxer simulation: dust sweep for sbtc-stx market.
// 3 STX-side + 3 sBTC-side depositors with amounts that maximize integer-
// truncation dust during proportional distribution.
//
// Run: npx tsx simulations/simul-markets-sbtc-stx-jing-dust-sweep.js
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
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-stx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

const STX_D1 = "SP06ARSREC0N9AKZABRP23SXS62TWJ6KWPVDQHVX";
const STX_D2 = "SP08YG111N936KQXZDR6A63857NN3PFSTWS9HFHH";
const STX_D3 = "SP0CM9M95MVJ375V6DAM0G63795VAYGPZ9T0CC1N";
const SBTC_D1 = "SP0DJ8T0VQRP06JP4NNK37RF9VC1FBVHK2JH1SA5";
const SBTC_D2 = "SP119GF8QD57784VCS9SGV7YXS18ZAKSHG5WR3JSC";
const SBTC_D3 = "SP12G0X9066S6F10KVT8JDEMGPHTQEADKZN95QD1F";
const ALL_ADDRS = [STX_D1, STX_D2, STX_D3, SBTC_D1, SBTC_D2, SBTC_D3];

const STX_D1_AMOUNT = 33_333_333;       // ~33 STX
const STX_D2_AMOUNT = 44_444_444;
const STX_D3_AMOUNT = 22_222_223;
const SBTC_D1_AMOUNT = 33_333;
const SBTC_D2_AMOUNT = 44_444;
const SBTC_D3_AMOUNT = 22_223;

// STX-side depositors need their deposit amount + gas. Plus we also fund
// them with extra STX for safety. SBTC-side need gas only.
const STX_FUND_FOR_STX_SIDE = 60_000_000;   // 60 STX (covers max 44 STX deposit + gas)
const STX_FUND_FOR_SBTC_SIDE = 10_000_000;  // 10 STX gas
const SBTC_FUND_PER_ADDR = 100_000;         // 0.001 sBTC per addr

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
  console.log("=== MARKETS-SBTC-STX-JING DUST SWEEP ===\n");

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
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

  // STX funding from STX_DEPOSITOR_1 (~2953 STX free)
  // Total: 60×3 + 10×3 = 210 STX
  for (const addr of [STX_D1, STX_D2, STX_D3]) {
    sim = sim.withSender(STX_DEPOSITOR_1).addSTXTransfer({
      recipient: addr,
      amount: STX_FUND_FOR_STX_SIDE,
      sender: STX_DEPOSITOR_1,
    });
  }
  for (const addr of [SBTC_D1, SBTC_D2, SBTC_D3]) {
    sim = sim.withSender(STX_DEPOSITOR_1).addSTXTransfer({
      recipient: addr,
      amount: STX_FUND_FOR_SBTC_SIDE,
      sender: STX_DEPOSITOR_1,
    });
  }
  // sBTC funding for the 3 sBTC depositors
  for (const addr of [SBTC_D1, SBTC_D2, SBTC_D3]) {
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

  // 3 STX depositors
  for (const [addr, amount] of [
    [STX_D1, STX_D1_AMOUNT],
    [STX_D2, STX_D2_AMOUNT],
    [STX_D3, STX_D3_AMOUNT],
  ]) {
    sim = sim.withSender(addr).addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(amount), uintCV(STX_LIMIT_HIGH), wstxTrait, wstxAsset],
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
    .withSender(STX_D1)
    .addContractCall({ contract_id: MARKET_ID, function_name: "close-deposits", function_args: [] })
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "settle",
      function_args: [sbtcTrait, sbtcAsset, wstxTrait, wstxAsset],
    })
    .addEvalCode(MARKET_ID, "(get-settlement u0)")
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-totals u1)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${STX_D1})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${STX_D2})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u1 '${STX_D3})`)
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
