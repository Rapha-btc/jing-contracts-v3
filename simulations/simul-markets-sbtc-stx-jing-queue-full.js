// simul-markets-sbtc-stx-jing-queue-full.js
// Stxer simulation: MAX_DEPOSITORS queue-full + smallest-bumping on the
// STX side of sbtc-stx. The bumped-out depositor's refund uses NATIVE
// `stx-transfer?` (not SIP-010), so this tests a different code path
// from the usdcx queue-full sim.
//
// Patches MAX_DEPOSITORS u50 -> u5 in deployed source so we only need
// 6 principals (5 fish + 1 challenger) instead of 51. Production stays
// u50; same logic at smaller scale.
//
// Run: npx tsx simulations/simul-markets-sbtc-stx-jing-queue-full.js
import fs from "node:fs";
import {
  uintCV,
  contractPrincipalCV,
  stringAsciiCV,
  bufferCV,
  randomPrivateKey,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import {
  DEPLOYER,
  STX_DEPOSITOR_1,
  SBTC_ADDR,
  SBTC_NAME,
  WSTX_ADDR,
  WSTX_NAME,
  WSTX_ASSET_NAME,
  BTC_USD_FEED_HEX,
  STX_USD_FEED_HEX,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-stx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;

function generateAddrs(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(getAddressFromPrivateKey(randomPrivateKey(), "mainnet"));
  }
  return out;
}

const PATCHED_MAX_DEPOSITORS = 5;
const FISH_COUNT = PATCHED_MAX_DEPOSITORS;
const fish = generateAddrs(FISH_COUNT);
const CHALLENGER = generateAddrs(1)[0];

// Each fish deposits 1 STX + small per-fish increment so the smallest
// is well-defined. fish[0] = SMALLEST (1 STX). fish[i] = 1 STX + i * 0.001 STX.
const SMALLEST_AMOUNT = 1_000_000;          // 1 STX (= MIN_STX)
const FISH_INCREMENT = 1_000;               // 0.001 STX per index
function fishAmount(i) { return SMALLEST_AMOUNT + i * FISH_INCREMENT; }

const CHALLENGER_BIG = 2_000_000;           // 2 STX -- bumps fish[0]
const CHALLENGER_TOO_SMALL = SMALLEST_AMOUNT;  // = smallest, should fail u1013

// Each fish needs gas (~5 STX for safety) + their deposit (~1 STX).
// Funding 6 STX per fish = 36 STX total — within STX_DEPOSITOR_1's 2953 STX free.
const STX_FUND_PER_FISH = 6_000_000;

const MIN_SBTC = 1000;
const MIN_STX = SMALLEST_AMOUNT;
const STX_LIMIT_HIGH = 1_000_000_000_000_000;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);

async function main() {
  console.log("=== MARKETS-SBTC-STX-JING QUEUE-FULL (native stx-transfer? refund) ===");
  console.log(`fish[0] (smallest): ${fish[0]} (${SMALLEST_AMOUNT} uSTX)`);
  console.log(`challenger        : ${CHALLENGER} (${CHALLENGER_BIG} uSTX)`);

  // Patch MAX_DEPOSITORS u50 -> u5 in deployed source
  const marketSource = fs
    .readFileSync(`./contracts/${MARKET_NAME}.clar`, "utf8")
    .replace(
      "(define-constant MAX_DEPOSITORS u50)",
      `(define-constant MAX_DEPOSITORS u${PATCHED_MAX_DEPOSITORS})`
    );

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV, sbtcTrait, wstxTrait,
      uintCV(MIN_SBTC), uintCV(MIN_STX), btcFeedBuf, stxFeedBuf,
    ],
    marketSourceOverride: marketSource,
  });

  // Fund all 6 with STX (gas + deposit)
  for (const addr of [...fish, CHALLENGER]) {
    sim = sim.withSender(STX_DEPOSITOR_1).addSTXTransfer({
      recipient: addr, amount: STX_FUND_PER_FISH, sender: STX_DEPOSITOR_1,
    });
  }

  // 5 fish deposit STX (filling the y-side depositor list at MAX)
  for (let i = 0; i < FISH_COUNT; i++) {
    sim = sim.withSender(fish[i]).addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [
        uintCV(fishAmount(i)),
        uintCV(STX_LIMIT_HIGH),
        wstxTrait, wstxAsset,
      ],
    });
  }

  // Read state at MAX
  sim = sim
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${fish[0]})`)         // = SMALLEST
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${fish[FISH_COUNT - 1]})`)  // = largest
    // STX balance of fish[0] BEFORE bumping (post-deposit, pre-refund)
    .addReads([{ StxBalance: fish[0] }]);

  const sessionId = await sim
    // 6th depositor with amount = smallest -> u1013 ERR_QUEUE_FULL
    .withSender(CHALLENGER)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [
        uintCV(CHALLENGER_TOO_SMALL),
        uintCV(STX_LIMIT_HIGH),
        wstxTrait, wstxAsset,
      ],
    })

    // 6th with BIG amount -> bumps fish[0]
    .withSender(CHALLENGER)
    .addContractCall({
      contract_id: MARKET_ID, function_name: "deposit-token-y",
      function_args: [
        uintCV(CHALLENGER_BIG),
        uintCV(STX_LIMIT_HIGH),
        wstxTrait, wstxAsset,
      ],
    })

    // After bumping:
    //   - fish[0] cycle-0 deposit = 0 (bumped out)
    //   - challenger cycle-0 deposit = CHALLENGER_BIG
    //   - fish[0] STX balance increased by SMALLEST (refunded via native stx-transfer?)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${fish[0]})`)
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${CHALLENGER})`)
    .addEvalCode(MARKET_ID, "(get-cycle-totals u0)")
    .addReads([{ StxBalance: fish[0] }])
    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
