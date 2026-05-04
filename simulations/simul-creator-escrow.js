// simul-creator-escrow.js
// Stxer mainnet-fork simulation: full happy-path lifecycle of
// creator-escrow-stxer (the all-zero-timing variant). Exercises
// start-round, submit-delivery, release (with agree-to-terms), sweep,
// and rolling into a fresh round at a different per-video rate.
//
// Run: npx tsx simulations/simul-creator-escrow.js
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
// USDCx whale acts as OWNER. The deployer is bound to OWNER at deploy
// time via `(define-constant OWNER tx-sender)`, and the whale also has
// the USDCx balance needed to fund start-round deposits.
const OWNER = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";

// The two creator wallets on the JingSwap deal.
const CREATOR_A = "SP3C1YFP86PVM9VT0119NXH54DW9KWDVVGS571VVT"; // Studio Sam
const CREATOR_B = "SP2QVKZ2GWP97TW4RNCT8TN65JRJPVAKERHYSS13E"; // Emmexx

const CONTRACT_NAME = "creator-escrow-stxer";
const CONTRACT_ID = `${OWNER}.${CONTRACT_NAME}`;

// --- Amounts (USDCx is 6-decimal) ---
const PRICE_25 = 25_000_000;   // $25 / video
const PRICE_30 = 30_000_000;   // $30 / video (round 2 bump)
const NUM_VIDEOS_8 = 8;        // round 1 budget
const NUM_VIDEOS_4 = 4;        // round 2 budget

// --- Content commitments (stand-ins for real video URIs/hashes) ---
const URI_1 = "ipfs://video-permission-vs-no-permission";
const URI_2 = "ipfs://video-bitcoin-to-usdcx-flow";
const URI_3 = "ipfs://video-jing-blind-auction-explainer";
const HASH_1 = Buffer.alloc(32, 0xaa);
const HASH_2 = Buffer.alloc(32, 0xbb);
const HASH_3 = Buffer.alloc(32, 0xcc);

async function main() {
  const source = fs.readFileSync(
    "./contracts/creator-escrow-stxer.clar",
    "utf8"
  );

  console.log("=== CREATOR-ESCROW HAPPY-PATH LIFECYCLE STXER SIM ===\n");
  console.log("Scenario:");
  console.log("0.  Deploy creator-escrow-stxer (OWNER = USDCx whale)");
  console.log("1.  Sanity reads: get-config, get-terms");
  console.log("2.  Owner: start-round(Sam, Emmexx, $25, 8 videos = $200)");
  console.log("3.  Read round 1 + escrow balance ($200)");
  console.log("4.  Sam: submit-delivery #1");
  console.log("5.  Emmexx: submit-delivery #2");
  console.log("6.  Sam: submit-delivery #3");
  console.log("7.  Read round 1 (pending = 3)");
  console.log("8.  Sam: release(1, agree=true) -> +$25");
  console.log("9.  Emmexx: release(2, agree=true) -> +$25");
  console.log("10. Sam: release(3, agree=true) -> +$25");
  console.log("11. Read round 1 (paid-out=$75, pending=0)");
  console.log("12. Owner: sweep(1) -> $125 refund");
  console.log("13. Owner: start-round(Sam, Emmexx, $30, 4 videos = $120)");
  console.log("14. Read round 2 state");
  console.log("");

  const sessionId = await SimulationBuilder.new()
    // STEP 0: deploy
    .withSender(OWNER)
    .addContractDeploy({
      contract_name: CONTRACT_NAME,
      source_code: source,
      // Clarity 4 keeps the stxer.xyz UI rendering compatible while
      // still accepting `current-contract` + `as-contract?` + `with-ft`
      // in epoch 3.4.
      clarity_version: ClarityVersion.Clarity4,
    })

    // STEP 1: sanity reads
    .addEvalCode(CONTRACT_ID, "(get-config)")
    .addEvalCode(CONTRACT_ID, "(get-terms)")
    .addEvalCode(CONTRACT_ID, "(get-current-round-id)")
    .addEvalCode(CONTRACT_ID, "(get-escrow-balance)")

    // STEP 2: open round 1 ($25 x 8 = $200)
    .withSender(OWNER)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "start-round",
      function_args: [
        standardPrincipalCV(CREATOR_A),
        standardPrincipalCV(CREATOR_B),
        uintCV(PRICE_25),
        uintCV(NUM_VIDEOS_8),
      ],
    })

    // STEP 3: read round 1 + balance
    .addEvalCode(CONTRACT_ID, "(get-current-round-id)")
    .addEvalCode(CONTRACT_ID, "(get-round u1)")
    .addEvalCode(CONTRACT_ID, "(get-escrow-balance)")

    // STEP 4: Sam submits delivery 1
    .withSender(CREATOR_A)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "submit-delivery",
      function_args: [stringUtf8CV(URI_1), bufferCV(HASH_1)],
    })

    // STEP 5: Emmexx submits delivery 2
    .withSender(CREATOR_B)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "submit-delivery",
      function_args: [stringUtf8CV(URI_2), bufferCV(HASH_2)],
    })

    // STEP 6: Sam submits delivery 3
    .withSender(CREATOR_A)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "submit-delivery",
      function_args: [stringUtf8CV(URI_3), bufferCV(HASH_3)],
    })

    // STEP 7: read state after submits
    .addEvalCode(CONTRACT_ID, "(get-round u1)")
    .addEvalCode(CONTRACT_ID, "(get-delivery u1)")
    .addEvalCode(CONTRACT_ID, "(get-delivery u2)")
    .addEvalCode(CONTRACT_ID, "(get-delivery u3)")

    // STEP 8: Sam releases delivery 1 (agreeing to TERMS)
    .withSender(CREATOR_A)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "release",
      function_args: [uintCV(1), boolCV(true)],
    })

    // STEP 9: Emmexx releases delivery 2
    .withSender(CREATOR_B)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "release",
      function_args: [uintCV(2), boolCV(true)],
    })

    // STEP 10: Sam releases delivery 3
    .withSender(CREATOR_A)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "release",
      function_args: [uintCV(3), boolCV(true)],
    })

    // STEP 11: read state after releases
    .addEvalCode(CONTRACT_ID, "(get-round u1)")
    .addEvalCode(CONTRACT_ID, "(get-escrow-balance)")
    .addEvalCode(CONTRACT_ID, "(get-delivery u1)")
    .addEvalCode(CONTRACT_ID, "(get-delivery u2)")
    .addEvalCode(CONTRACT_ID, "(get-delivery u3)")

    // STEP 12: owner sweeps round 1 (refund $125)
    .withSender(OWNER)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "sweep",
      function_args: [uintCV(1)],
    })

    // STEP 12.5: read state after sweep
    .addEvalCode(CONTRACT_ID, "(get-round u1)")
    .addEvalCode(CONTRACT_ID, "(get-escrow-balance)")

    // STEP 13: owner opens round 2 at the higher rate
    .withSender(OWNER)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "start-round",
      function_args: [
        standardPrincipalCV(CREATOR_A),
        standardPrincipalCV(CREATOR_B),
        uintCV(PRICE_30),
        uintCV(NUM_VIDEOS_4),
      ],
    })

    // STEP 14: read round 2 state
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
