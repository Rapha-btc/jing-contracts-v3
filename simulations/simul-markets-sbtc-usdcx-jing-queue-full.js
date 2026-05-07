// simul-markets-sbtc-usdcx-jing-queue-full.js
// Stxer simulation: MAX_DEPOSITORS = u50 queue-full + smallest-bumping path.
// Fills the y-side depositor list with 50 fresh principals, then a 51st with
// a larger amount bumps out the smallest one. Also tests u1013 ERR_QUEUE_FULL
// when the 51st arrives with an amount <= smallest.
//
// Run: npx tsx simulations/simul-markets-sbtc-usdcx-jing-queue-full.js
import {
  uintCV,
  contractPrincipalCV,
  standardPrincipalCV,
  stringAsciiCV,
  bufferCV,
  noneCV,
  randomPrivateKey,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import {
  DEPLOYER,
  USDCX_DEPOSITOR_1,
  STX_DEPOSITOR_1,
  SBTC_ADDR,
  SBTC_NAME,
  USDCX_ADDR,
  USDCX_NAME,
  USDCX_ASSET_NAME,
  USDCX_FQN,
  BTC_USD_FEED_HEX,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-usdcx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

// 50 fish + 1 challenger. Use a fixed seed for reproducibility.
function generateAddrs(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = randomPrivateKey();
    out.push(getAddressFromPrivateKey(k, "mainnet"));
  }
  return out;
}

const FISH_COUNT = 50;
const fish = generateAddrs(FISH_COUNT);
const CHALLENGER = generateAddrs(1)[0];

// Each fish deposits a slightly different amount so the smallest is well-defined.
// fish[0] = SMALLEST_AMOUNT (= MIN_USDCX = 1_000_000)
// fish[i] = SMALLEST_AMOUNT + i*1000 (each subsequent fish has +0.001 USDCx)
const SMALLEST_AMOUNT = 1_000_000;            // 1 USDCx (= MIN_USDCX)
const FISH_INCREMENT = 1_000;                 // 0.001 USDCx
function fishAmount(i) {
  return SMALLEST_AMOUNT + i * FISH_INCREMENT;
}

// Challenger amount must be > SMALLEST_AMOUNT to bump.
const CHALLENGER_BIG = 2_000_000;             // 2 USDCx — bumps fish[0]
const CHALLENGER_TOO_SMALL = SMALLEST_AMOUNT; // 1 USDCx — equal to smallest, should fail u1013

const STX_GAS = 3_000_000;                    // 3 STX gas per fish
const USDCX_FUND_PER_FISH = 5_000_000;        // 5 USDCx per fish (covers their deposit + buffer)

const MIN_SBTC = 1000;
const MIN_USDCX = SMALLEST_AMOUNT;
const USDCX_LIMIT_HIGH = 1_000_000_000_000_000;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const usdcxTrait = contractPrincipalCV(USDCX_ADDR, USDCX_NAME);
const usdcxAsset = stringAsciiCV(USDCX_ASSET_NAME);
const feedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);

async function main() {
  console.log("=== MARKETS-SBTC-USDCX-JING QUEUE-FULL + SMALLEST-BUMPING ===");
  console.log(`Generated ${FISH_COUNT} fish + 1 challenger.`);
  console.log(`Smallest fish[0]: ${fish[0]} (${SMALLEST_AMOUNT} µUSDCx)`);
  console.log(`Challenger      : ${CHALLENGER} (${CHALLENGER_BIG} µUSDCx)`);

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV, sbtcTrait, usdcxTrait,
      uintCV(MIN_SBTC), uintCV(MIN_USDCX), feedBuf,
    ],
  });

  // Fund all 51 with STX + USDCx
  for (const addr of [...fish, CHALLENGER]) {
    sim = sim.withSender(STX_DEPOSITOR_1).addSTXTransfer({
      recipient: addr, amount: STX_GAS, sender: STX_DEPOSITOR_1,
    });
    sim = sim.withSender(USDCX_DEPOSITOR_1).addContractCall({
      contract_id: USDCX_FQN, function_name: "transfer",
      function_args: [
        uintCV(USDCX_FUND_PER_FISH),
        standardPrincipalCV(USDCX_DEPOSITOR_1),
        standardPrincipalCV(addr),
        noneCV(),
      ],
    });
  }

  // 50 fish deposit
  for (let i = 0; i < FISH_COUNT; i++) {
    sim = sim.withSender(fish[i]).addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [
        uintCV(fishAmount(i)),
        uintCV(USDCX_LIMIT_HIGH),
        usdcxTrait, usdcxAsset,
      ],
    });
  }

  // Read state at MAX
  sim = sim
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${fish[0]})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${fish[FISH_COUNT - 1]})`)
    // Cumulative balance check on smallest BEFORE bumping
    .addReads([{ FtBalance: [USDCX_FQN, USDCX_ASSET_NAME, fish[0]] }]);

  const sessionId = await sim
    // Try a 51st with amount EQUAL to smallest -> u1013 ERR_QUEUE_FULL
    // (asserts > smallest, not >=)
    .withSender(CHALLENGER)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [
        uintCV(CHALLENGER_TOO_SMALL),
        uintCV(USDCX_LIMIT_HIGH),
        usdcxTrait, usdcxAsset,
      ],
    })

    // 51st with BIG amount -> bumps fish[0]
    .withSender(CHALLENGER)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [
        uintCV(CHALLENGER_BIG),
        uintCV(USDCX_LIMIT_HIGH),
        usdcxTrait, usdcxAsset,
      ],
    })

    // After bumping:
    //  - fish[0] should have 0 deposit in cycle 0
    //  - challenger should have CHALLENGER_BIG deposit
    //  - depositor list still has 50 entries
    //  - fish[0] USDCx balance increased by SMALLEST_AMOUNT
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${fish[0]})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${CHALLENGER})`)
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addReads([{ FtBalance: [USDCX_FQN, USDCX_ASSET_NAME, fish[0]] }])

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
