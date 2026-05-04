// simul-creator-escrow-sweep-past.js
// Stxer mainnet-fork simulation: open round 1, partially fulfill it,
// open round 2 WITHOUT first sweeping round 1, then sweep round 1 mid-
// round-2. Confirms the contract handles concurrent rounds' funds in a
// single USDCx pool with per-round accounting kept clean.
//
// Run: npx tsx simulations/simul-creator-escrow-sweep-past.js
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
const CREATOR_A = "SP3C1YFP86PVM9VT0119NXH54DW9KWDVVGS571VVT";
const CREATOR_B = "SP2QVKZ2GWP97TW4RNCT8TN65JRJPVAKERHYSS13E";

const CONTRACT_NAME = "creator-escrow-stxer";
const CONTRACT_ID = `${OWNER}.${CONTRACT_NAME}`;

const PRICE_25 = 25_000_000;
const PRICE_30 = 30_000_000;
const NUM_VIDEOS_4 = 4;

const URI_1 = "ipfs://round1-video-1";
const URI_2 = "ipfs://round2-video-1";
const HASH_1 = Buffer.alloc(32, 0xaa);
const HASH_2 = Buffer.alloc(32, 0xbb);

async function main() {
  const source = fs.readFileSync(
    "./contracts/creator-escrow-stxer.clar",
    "utf8"
  );

  console.log("=== CREATOR-ESCROW: SWEEP PAST ROUND DURING ACTIVE ROUND ===\n");
  console.log("Scenario:");
  console.log("0.  Deploy creator-escrow-stxer");
  console.log("1.  Round 1: $25 x 4 = $100 deposit");
  console.log("2.  Sam submits + claims one delivery (round 1 paid-out=$25)");
  console.log("3.  Read round 1 + escrow balance ($75 unspent)");
  console.log("4.  Round 2 opens at $30 x 4 = $120 (round 1 unswept)");
  console.log("5.  Read pool: $75 (round1 leftover) + $120 (round2) = $195");
  console.log("6.  Sweep round 1 mid-round-2 -> $75 to owner");
  console.log("7.  Read pool: $120 (round 2 only)");
  console.log("8.  Round 2 still functional: Sam submits + claims");
  console.log("");

  const sessionId = await SimulationBuilder.new()
    // STEP 0
    .withSender(OWNER)
    .addContractDeploy({
      contract_name: CONTRACT_NAME,
      source_code: source,
      clarity_version: ClarityVersion.Clarity4,
    })

    // STEP 1: round 1 ($100 budget)
    .withSender(OWNER)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "start-round",
      function_args: [
        standardPrincipalCV(CREATOR_A),
        standardPrincipalCV(CREATOR_B),
        uintCV(PRICE_25),
        uintCV(NUM_VIDEOS_4),
      ],
    })

    // STEP 2: Sam delivers + claims
    .withSender(CREATOR_A)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "submit-delivery",
      function_args: [stringUtf8CV(URI_1), bufferCV(HASH_1)],
    })
    .withSender(CREATOR_A)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "release",
      function_args: [uintCV(1), boolCV(true)],
    })

    // STEP 3: read round 1 state ($75 unspent, paid-out $25, swept = false)
    .addEvalCode(CONTRACT_ID, "(get-round u1)")
    .addEvalCode(CONTRACT_ID, "(get-escrow-balance)")

    // STEP 4: round 2 opens WITHOUT sweeping round 1
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

    // STEP 5: pool = round1 leftover ($75) + round2 deposit ($120) = $195
    .addEvalCode(CONTRACT_ID, "(get-current-round-id)")
    .addEvalCode(CONTRACT_ID, "(get-round u2)")
    .addEvalCode(CONTRACT_ID, "(get-escrow-balance)")

    // STEP 6: sweep round 1 mid-round-2; refund $75
    .withSender(OWNER)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "sweep",
      function_args: [uintCV(1)],
    })

    // STEP 7: pool now = round 2's deposit only ($120); round 1 swept = true
    .addEvalCode(CONTRACT_ID, "(get-round u1)")
    .addEvalCode(CONTRACT_ID, "(get-escrow-balance)")

    // STEP 8: round 2 still works -- Sam delivers + claims at $30
    .withSender(CREATOR_A)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "submit-delivery",
      function_args: [stringUtf8CV(URI_2), bufferCV(HASH_2)],
    })
    .withSender(CREATOR_A)
    .addContractCall({
      contract_id: CONTRACT_ID,
      function_name: "release",
      function_args: [uintCV(2), boolCV(true)],
    })
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
