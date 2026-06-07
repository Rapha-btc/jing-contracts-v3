// simul-creator-escrow-v2.js
// Stxer mainnet-fork simulation: full happy-path lifecycle of
// creator-escrow-v2-stxer (the round-2 contract with shrunk timing).
//
// Round-2 difference proven here: `release` pays each creator's SMART
// WALLET (creator-a-wallet / creator-b-wallet), NOT the operating wallet
// that signs the claim. After the releases we read the USDCx balance of
// every wallet via `(contract-call? '...usdcx get-balance <wallet>)` to
// show the payouts landed in the smart wallets and the operating
// addresses received nothing.
//
// Timing in the -stxer variant: REVIEW = 2, CLAIM_GRACE = 0, ROUND =
// 4200. We use `addAdvanceBlocks` to step over the 2-block review window
// (so PENDING deliveries become claimable) and to advance past round-end
// before sweeping.
//
// Run: npx tsx simulations/simul-creator-escrow-v2.js
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  boolCV,
  bufferCV,
  stringUtf8CV,
  standardPrincipalCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";

// --- Mainnet addresses ---
// USDCx whale acts as OWNER (bound at deploy via `(define-constant OWNER
// tx-sender)`) and funds the start-round deposit.
const OWNER = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";

// Creators' OPERATING wallets (they sign the claim from these).
const CREATOR_A = "SP3C1YFP86PVM9VT0119NXH54DW9KWDVVGS571VVT"; // Studio Sam
const CREATOR_B = "SP2QVKZ2GWP97TW4RNCT8TN65JRJPVAKERHYSS13E"; // Emmexx

// Creators' PAYOUT smart wallets (USDCx lands here). Distinct from the
// operating wallets above so the destination is unambiguous in the reads.
const CREATOR_A_WALLET = "SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R";
const CREATOR_B_WALLET = "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE";

const USDCX = "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx";

const CONTRACT_NAME = "creator-escrow-v2-stxer";
const CONTRACT_ID = `${OWNER}.${CONTRACT_NAME}`;

// --- Amounts (USDCx is 6-decimal) ---
const PRICE_25 = 25_000_000; // $25 / video
const PRICE_30 = 30_000_000; // $30 / video (round 2 bump)
const NUM_VIDEOS_8 = 8; // round 1 budget ($200)
const NUM_VIDEOS_4 = 4; // round 2 budget ($120)

// --- Content commitments ---
const URI_1 = "ipfs://video-permission-vs-no-permission";
const URI_2 = "ipfs://video-bitcoin-to-usdcx-flow";
const URI_3 = "ipfs://video-jing-blind-auction-explainer";
const HASH_1 = Buffer.alloc(32, 0xaa);
const HASH_2 = Buffer.alloc(32, 0xbb);
const HASH_3 = Buffer.alloc(32, 0xcc);

const balOf = (addr) =>
  `(contract-call? '${USDCX} get-balance '${addr})`;

async function main() {
  const source = fs.readFileSync(
    "./contracts/creator-escrow-v2-stxer.clar",
    "utf8"
  );

  console.log("=== CREATOR-ESCROW-V2 HAPPY-PATH LIFECYCLE STXER SIM ===\n");
  console.log("Scenario:");
  console.log("0.  Deploy creator-escrow-v2-stxer (OWNER = USDCx whale)");
  console.log("1.  Read pre-payout USDCx balances of all 4 creator wallets");
  console.log("2.  Owner: start-round(Sam, Sam-wallet, Emmexx, Emmexx-wallet, $25, 8)");
  console.log("3.  Read round 1 + escrow balance ($200)");
  console.log("4.  Sam/Emmexx/Sam submit deliveries #1/#2/#3");
  console.log("5.  Advance past 2-block review window");
  console.log("6.  Releases #1/#2/#3 (funds -> SMART WALLETS)");
  console.log("7.  Read post-payout balances: smart wallets up, op wallets flat");
  console.log("8.  Advance past round-end, sweep(1) -> $125 refund");
  console.log("9.  Open round 2 ($30 x 4 = $120)");
  console.log("");

  const sessionId = await SimulationBuilder.new()
    // STEP 0: deploy
    .withSender(OWNER)
    .addContractDeploy({
      contract_name: CONTRACT_NAME,
      source_code: source,
      clarity_version: ClarityVersion.Clarity4,
    })

    // STEP 1: pre-payout balances (operating + smart wallets)
    .addEvalCode(CONTRACT_ID, "(get-config)")
    .addEvalCode(CONTRACT_ID, balOf(CREATOR_A))
    .addEvalCode(CONTRACT_ID, balOf(CREATOR_A_WALLET))
    .addEvalCode(CONTRACT_ID, balOf(CREATOR_B))
    .addEvalCode(CONTRACT_ID, balOf(CREATOR_B_WALLET))

    // STEP 2: open round 1 ($25 x 8 = $200) with distinct smart wallets
    .withSender(OWNER)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "start-round",
      function_args: [
        standardPrincipalCV(CREATOR_A),
        standardPrincipalCV(CREATOR_A_WALLET),
        standardPrincipalCV(CREATOR_B),
        standardPrincipalCV(CREATOR_B_WALLET),
        uintCV(PRICE_25),
        uintCV(NUM_VIDEOS_8),
      ],
    })

    // STEP 3: read round 1 + escrow
    .addEvalCode(CONTRACT_ID, "(get-round u1)")
    .addEvalCode(CONTRACT_ID, "(get-escrow-balance)")

    // STEP 4: three submissions
    .withSender(CREATOR_A)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "submit-delivery",
      function_args: [stringUtf8CV(URI_1), bufferCV(HASH_1)],
    })
    .withSender(CREATOR_B)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "submit-delivery",
      function_args: [stringUtf8CV(URI_2), bufferCV(HASH_2)],
    })
    .withSender(CREATOR_A)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "submit-delivery",
      function_args: [stringUtf8CV(URI_3), bufferCV(HASH_3)],
    })
    .addEvalCode(CONTRACT_ID, "(get-round u1)")

    // STEP 5: advance past the 2-block review window
    .addAdvanceBlocks({ bitcoin_blocks: 3, stacks_blocks_per_bitcoin: 1 })

    // STEP 6: releases -> funds to SMART WALLETS
    .withSender(CREATOR_A)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "release",
      function_args: [uintCV(1), boolCV(true)],
    })
    .withSender(CREATOR_B)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "release",
      function_args: [uintCV(2), boolCV(true)],
    })
    .withSender(CREATOR_A)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "release",
      function_args: [uintCV(3), boolCV(true)],
    })

    // STEP 7: post-payout balances. PROOF: smart wallets received the
    // payouts; operating wallets did not.
    .addEvalCode(CONTRACT_ID, "(get-round u1)")
    .addEvalCode(CONTRACT_ID, balOf(CREATOR_A))         // unchanged (operating)
    .addEvalCode(CONTRACT_ID, balOf(CREATOR_A_WALLET))  // +$50 (2 videos)
    .addEvalCode(CONTRACT_ID, balOf(CREATOR_B))         // unchanged (operating)
    .addEvalCode(CONTRACT_ID, balOf(CREATOR_B_WALLET))  // +$25 (1 video)
    .addEvalCode(CONTRACT_ID, "(get-escrow-balance)")

    // STEP 8: advance past round-end (ROUND = 4200) and sweep $125
    .addAdvanceBlocks({ bitcoin_blocks: 4201, stacks_blocks_per_bitcoin: 1 })
    .withSender(OWNER)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "sweep",
      function_args: [uintCV(1)],
    })
    .addEvalCode(CONTRACT_ID, "(get-round u1)")
    .addEvalCode(CONTRACT_ID, "(get-escrow-balance)")

    // STEP 9: open round 2 at the higher rate
    .withSender(OWNER)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "start-round",
      function_args: [
        standardPrincipalCV(CREATOR_A),
        standardPrincipalCV(CREATOR_A_WALLET),
        standardPrincipalCV(CREATOR_B),
        standardPrincipalCV(CREATOR_B_WALLET),
        uintCV(PRICE_30),
        uintCV(NUM_VIDEOS_4),
      ],
    })
    .addEvalCode(CONTRACT_ID, "(get-current-round-id)")
    .addEvalCode(CONTRACT_ID, "(get-round u2)")
    .addEvalCode(CONTRACT_ID, "(get-escrow-balance)")

    .run();

  console.log("\nSimulation submitted!");
  console.log(
    `View results: https://stxer.xyz/simulations/mainnet/${sessionId}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
