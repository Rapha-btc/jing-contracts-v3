// simul-creator-escrow-v2-amend-approve.js
// Stxer mainnet-fork simulation of the round-2 owner/creator review
// actions on creator-escrow-v2-stxer:
//
//   * veto -> amend-delivery -> release   (creator fixes a vetoed slot)
//   * approve -> release                  (owner fast-tracks a slot)
//
// get-delivery reads bracket each transition to show the status codes
// (PENDING=0, RELEASED=1, VETOED=2, APPROVED=3) and the print events
// (delivery-vetoed / delivery-amended / delivery-approved /
// delivery-released) appear in the per-call event logs.
//
// Timing in the -stxer variant: REVIEW = 2, CLAIM_GRACE = 0, ROUND =
// 4200. veto/approve require `now < review-ends-at`, so they are called
// at submit height (window still open). The amended slot gets a FRESH
// 2-block window, stepped over with `addAdvanceBlocks` before its
// release. The APPROVED slot is releasable immediately (no wait).
//
// Run: npx tsx simulations/simul-creator-escrow-v2-amend-approve.js
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

const OWNER = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";

const CREATOR_A = "SP3C1YFP86PVM9VT0119NXH54DW9KWDVVGS571VVT"; // Studio Sam
const CREATOR_B = "SP2QVKZ2GWP97TW4RNCT8TN65JRJPVAKERHYSS13E"; // Emmexx
const CREATOR_A_WALLET = "SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R";
const CREATOR_B_WALLET = "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE";

const USDCX = "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx";

const CONTRACT_NAME = "creator-escrow-v2-stxer";
const CONTRACT_ID = `${OWNER}.${CONTRACT_NAME}`;

const PRICE_25 = 25_000_000;
const NUM_VIDEOS_4 = 4; // $100 budget

const URI_1 = "ipfs://video-permission-vs-no-permission";
const URI_1_FIXED = "ipfs://video-permission-vs-no-permission-fixed";
const URI_2 = "ipfs://video-bitcoin-to-usdcx-flow";
const HASH_1 = Buffer.alloc(32, 0xaa);
const HASH_1_FIXED = Buffer.alloc(32, 0xcc);
const HASH_2 = Buffer.alloc(32, 0xbb);

const balOf = (addr) => `(contract-call? '${USDCX} get-balance '${addr})`;

async function main() {
  const source = fs.readFileSync(
    "./contracts/creator-escrow-v2-stxer.clar",
    "utf8"
  );

  console.log("=== CREATOR-ESCROW-V2 AMEND + APPROVE STXER SIM ===\n");
  console.log("Scenario:");
  console.log("0.  Deploy creator-escrow-v2-stxer");
  console.log("1.  Round 1: $25 x 4 = $100");
  console.log("2.  Sam submits #1, Emmexx submits #2 (both PENDING)");
  console.log("3.  Owner vetoes #1 (-> VETOED)");
  console.log("4.  Owner approves #2 (-> APPROVED, fast-track)");
  console.log("5.  Sam amend-delivery #1 (VETOED -> PENDING, fresh window)");
  console.log("6.  Emmexx releases #2 immediately (APPROVED path) -> smart wallet");
  console.log("7.  Advance past fresh review window");
  console.log("8.  Sam releases amended #1 -> smart wallet");
  console.log("9.  Read final delivery states + payout balances");
  console.log("");

  const sessionId = await SimulationBuilder.new()
    // STEP 0: deploy
    .withSender(OWNER)
    .addContractDeploy({
      contract_name: CONTRACT_NAME,
      source_code: source,
      clarity_version: ClarityVersion.Clarity4,
    })

    // STEP 1: open round 1
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
        uintCV(NUM_VIDEOS_4),
      ],
    })

    // STEP 2: submissions (both PENDING)
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
    .addEvalCode(CONTRACT_ID, "(get-delivery u1)") // status 0
    .addEvalCode(CONTRACT_ID, "(get-delivery u2)") // status 0

    // STEP 3: owner vetoes #1 (delivery-vetoed event; status -> 2)
    .withSender(OWNER)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "veto",
      function_args: [uintCV(1), stringUtf8CV("wrong hash, please re-export")],
    })
    .addEvalCode(CONTRACT_ID, "(get-delivery u1)") // status 2 (VETOED)
    .addEvalCode(CONTRACT_ID, "(get-round u1)")    // pending decremented

    // STEP 4: owner approves #2 (delivery-approved event; status -> 3)
    .withSender(OWNER)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "approve",
      function_args: [uintCV(2)],
    })
    .addEvalCode(CONTRACT_ID, "(get-delivery u2)") // status 3 (APPROVED)

    // STEP 5: Sam amends #1 (delivery-amended event; status -> 0 PENDING)
    .withSender(CREATOR_A)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "amend-delivery",
      function_args: [uintCV(1), stringUtf8CV(URI_1_FIXED), bufferCV(HASH_1_FIXED)],
    })
    .addEvalCode(CONTRACT_ID, "(get-delivery u1)") // status 0 (PENDING), fresh window
    .addEvalCode(CONTRACT_ID, "(get-round u1)")    // pending re-incremented

    // STEP 6: Emmexx releases the APPROVED #2 immediately -> smart wallet
    .withSender(CREATOR_B)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "release",
      function_args: [uintCV(2), boolCV(true)],
    })
    .addEvalCode(CONTRACT_ID, "(get-delivery u2)") // status 1 (RELEASED)
    .addEvalCode(CONTRACT_ID, balOf(CREATOR_B_WALLET)) // +$25
    .addEvalCode(CONTRACT_ID, balOf(CREATOR_B))        // unchanged

    // STEP 7: advance past the fresh 2-block review window for #1
    .addAdvanceBlocks({ bitcoin_blocks: 3, stacks_blocks_per_bitcoin: 1 })

    // STEP 8: Sam releases the amended #1 -> smart wallet
    .withSender(CREATOR_A)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "release",
      function_args: [uintCV(1), boolCV(true)],
    })

    // STEP 9: final reads
    .addEvalCode(CONTRACT_ID, "(get-delivery u1)") // status 1 (RELEASED)
    .addEvalCode(CONTRACT_ID, balOf(CREATOR_A_WALLET)) // +$25
    .addEvalCode(CONTRACT_ID, balOf(CREATOR_A))        // unchanged
    .addEvalCode(CONTRACT_ID, "(get-round u1)")        // paid-out $50, pending 0
    .addEvalCode(CONTRACT_ID, "(get-escrow-balance)")  // $50 left ($100 - $50)

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
