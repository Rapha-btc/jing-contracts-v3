// simul-markets-sbtc-usdcx-jing-dust-sweep-both.js
// Stxer simulation: dust sweep on USDCx side (sBTC binding) for sbtc-usdcx market.
// Heavy USDCx vs light sBTC -> large USDCx unfilled -> USDCx roll dust expected.
//
// Run: npx tsx simulations/simul-markets-sbtc-usdcx-jing-dust-sweep-both.js
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

// Heavy USDCx (~100 USDCx total) vs light sBTC (4k sats) -> sBTC binding
const USDCX_AMOUNTS = [33_333_333, 44_444_444, 22_222_223];
const SBTC_AMOUNTS = [1_333, 1_444, 1_223];

const STX_GAS_PER_ADDR = 10_000_000;
const USDCX_FUND_PER_ADDR = 50_000_000;
const SBTC_FUND_PER_ADDR = 10_000;

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
  console.log("=== MARKETS-SBTC-USDCX-JING DUST SWEEP (sBTC binding) ===\n");

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

  // STX gas for everyone (use STX_DEPOSITOR_1 as funder)
  for (const addr of ALL_ADDRS) {
    sim = sim.withSender(STX_DEPOSITOR_1).addSTXTransfer({
      recipient: addr,
      amount: STX_GAS_PER_ADDR,
      sender: STX_DEPOSITOR_1,
    });
  }
  for (const addr of [USDCX_D1, USDCX_D2, USDCX_D3]) {
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

  for (const [i, addr] of [USDCX_D1, USDCX_D2, USDCX_D3].entries()) {
    sim = sim.withSender(addr).addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-y",
      function_args: [uintCV(USDCX_AMOUNTS[i]), uintCV(USDCX_LIMIT_HIGH), usdcxTrait, usdcxAsset],
    });
  }
  for (const [i, addr] of [SBTC_D1, SBTC_D2, SBTC_D3].entries()) {
    sim = sim.withSender(addr).addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [uintCV(SBTC_AMOUNTS[i]), uintCV(SBTC_LIMIT_LOW), sbtcTrait, sbtcAsset],
    });
  }

  const sessionId = await sim
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .withSender(USDCX_D1)
    .addContractCall({ contract_id: MARKET_ID, function_name: "close-deposits", function_args: [] })
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "settle",
      function_args: [sbtcTrait, sbtcAsset, usdcxTrait, usdcxAsset],
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
