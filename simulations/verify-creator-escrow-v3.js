// verify-creator-escrow-v3.js
// SELF-VERIFYING stxer mainnet-fork harness for creator-escrow-v3 (= v2 +
// budget-exhausted round close). Same v2 scenario, then a round whose whole
// budget is paid out is opened-over / swept WITHOUT advancing blocks.
//
// Unlike the demo sims (which just submit and print a URL), this one
// runs ONE scenario covering the happy path AND the edge cases, then
// pulls the results back via `getSimulationResult` and asserts every
// step behaved as intended (exact (ok ...) / (err uX) per call), plus
// asserts the USDCx payout deltas landed in the SMART WALLETS and not
// the operating wallets. Exits non-zero if any assertion fails.
//
// Runs against the REAL contract with MAINNET timing (REVIEW = 288,
// CLAIM_GRACE = 288, ROUND = 4200) -- no shrunk-timing variant. All
// steps run at the pinned tip until `addAdvanceBlocks`, so a PENDING
// delivery is NOT claimable until we advance past the 288-block review
// window, and `approve` (which requires now < review-ends-at) is
// reachable at submit height. This verifies the exact constants that
// will be deployed to mainnet.
//
// Run: npx tsx simulations/verify-creator-escrow-v3.js
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  boolCV,
  bufferCV,
  stringUtf8CV,
  standardPrincipalCV,
  contractPrincipalCV,
  deserializeCV,
  cvToString,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";

// Principal CV that handles both standard (SP…) and contract (SP….name)
// principals — the creators' smart wallets are contract principals.
const pcv = (s) =>
  s.includes(".")
    ? contractPrincipalCV(s.split(".")[0], s.split(".")[1])
    : standardPrincipalCV(s);

// --- Mainnet addresses ---
const OWNER = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51"; // USDCx whale = OWNER

// Creators' OPERATING wallets (they sign submit/amend/release from these).
const CREATOR_A = "SP3C1YFP86PVM9VT0119NXH54DW9KWDVVGS571VVT"; // Studio Sam
const CREATOR_B = "SP2QVKZ2GWP97TW4RNCT8TN65JRJPVAKERHYSS13E"; // Emmexx

// Creators' REAL PAYOUT smart wallets (contract principals; USDCx must
// land here, not in the operating wallets above).
const CREATOR_A_WALLET = "SP28MP1HQDJWQAFSQJN2HBAXBVP7H7THD1W2NYZVK.studiosam-wallet";
const CREATOR_B_WALLET = "SP28MP1HQDJWQAFSQJN2HBAXBVP7H7THD1W2NYZVK.emmex-wallet";

// A non-creator principal, used for the NOT_CREATOR guard.
const STRANGER = "SP000000000000000000002Q6VF78";

const USDCX = "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx";
const CONTRACT_NAME = "creator-escrow-v3";
const CID = `${OWNER}.${CONTRACT_NAME}`;

const P25 = 25_000_000; // $25 / video, USDCx is 6-decimal

const URI_1 = "ipfs://video-1";
const URI_2 = "ipfs://video-2";
const URI_2B = "ipfs://video-2-corrected";
const URI_3 = "ipfs://video-3";
const URI_4 = "ipfs://video-4-abandoned";
const H1 = Buffer.alloc(32, 0xaa);
const H2 = Buffer.alloc(32, 0xbb);
const H2B = Buffer.alloc(32, 0xb2);
const H3 = Buffer.alloc(32, 0xcc);
const H4 = Buffer.alloc(32, 0xdd);

const balOf = (addr) => `(contract-call? '${USDCX} get-balance '${addr})`;

// ---- scenario builder with a parallel assertion plan ----
const plan = [];
const source = fs.readFileSync("./contracts/creator-v3/creator-escrow-v3.clar", "utf8");
const b = SimulationBuilder.new();

function deploy() {
  b.withSender(OWNER).addContractDeploy({
    contract_name: CONTRACT_NAME,
    source_code: source,
    clarity_version: ClarityVersion.Clarity4,
  });
  plan.push({ kind: "deploy", label: "deploy creator-escrow-v3 (mainnet timing)" });
}
// expect: exact decoded Clarity result string, e.g. "(ok u1)" / "(err u116)"
function call(label, sender, fn, args, expect) {
  b.withSender(sender).addContractCall({ contract_id: CID, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label, expect });
}
// capture: optional key to stash the decoded eval string for later math
function evalc(label, code, capture) {
  b.addEvalCode(CID, code);
  plan.push({ kind: "eval", label, capture });
}
function advance(n) {
  b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1 });
  plan.push({ kind: "advance", label: `advance ${n} burn blocks` });
}

// =====================================================================
// Scenario
// =====================================================================
deploy();

// --- start-round guards ---
call("start-round odd num-videos -> ERR_VIDEOS_NOT_EVEN", OWNER, "start-round",
  [standardPrincipalCV(CREATOR_A), pcv(CREATOR_A_WALLET),
   standardPrincipalCV(CREATOR_B), pcv(CREATOR_B_WALLET),
   uintCV(P25), uintCV(7)], "(err u118)");
call("start-round by non-owner -> ERR_NOT_OWNER", CREATOR_A, "start-round",
  [standardPrincipalCV(CREATOR_A), pcv(CREATOR_A_WALLET),
   standardPrincipalCV(CREATOR_B), pcv(CREATOR_B_WALLET),
   uintCV(P25), uintCV(8)], "(err u100)");
call("start-round ok -> (ok u1)", OWNER, "start-round",
  [standardPrincipalCV(CREATOR_A), pcv(CREATOR_A_WALLET),
   standardPrincipalCV(CREATOR_B), pcv(CREATOR_B_WALLET),
   uintCV(P25), uintCV(8)], "(ok u1)");
evalc("escrow balance after start ($200)", "(get-escrow-balance)");

// pre-payout balances (for delta math)
evalc("walletA before", balOf(CREATOR_A_WALLET), "AW_before");
evalc("walletB before", balOf(CREATOR_B_WALLET), "BW_before");
evalc("opA before", balOf(CREATOR_A), "A_before");
evalc("opB before", balOf(CREATOR_B), "B_before");

// --- submit guards + submits ---
call("submit by non-creator -> ERR_NOT_CREATOR", STRANGER, "submit-delivery",
  [stringUtf8CV(URI_1), bufferCV(H1)], "(err u101)");
call("submit d1 (Sam) -> (ok u1)", CREATOR_A, "submit-delivery", [stringUtf8CV(URI_1), bufferCV(H1)], "(ok u1)");
call("submit d2 (Emmexx) -> (ok u2)", CREATOR_B, "submit-delivery", [stringUtf8CV(URI_2), bufferCV(H2)], "(ok u2)");
call("submit d3 (Sam) -> (ok u3)", CREATOR_A, "submit-delivery", [stringUtf8CV(URI_3), bufferCV(H3)], "(ok u3)");
call("submit d4 (Emmexx, will be abandoned) -> (ok u4)", CREATOR_B, "submit-delivery", [stringUtf8CV(URI_4), bufferCV(H4)], "(ok u4)");

// --- approve fast-track on d1 ---
call("release d1 before window -> ERR_NOT_CLAIMABLE", CREATOR_A, "release", [uintCV(1), boolCV(true)], "(err u116)");
call("approve d1 (owner, in-window) -> (ok true)", OWNER, "approve", [uintCV(1)], "(ok true)");
call("approve d1 again (now APPROVED) -> ERR_ALREADY_RESOLVED", OWNER, "approve", [uintCV(1)], "(err u109)");
call("release d1 fast-track (no advance) -> (ok true)", CREATOR_A, "release", [uintCV(1), boolCV(true)], "(ok true)");

// --- veto + creator-driven amend on d2 ---
call("approve d2 by non-owner -> ERR_NOT_OWNER", CREATOR_B, "approve", [uintCV(2)], "(err u100)");
call("veto d2 (owner) -> (ok true)", OWNER, "veto", [uintCV(2), stringUtf8CV("wrong hash")], "(ok true)");
call("amend d2 by non-creator -> ERR_NOT_CREATOR", CREATOR_A, "amend-delivery", [uintCV(2), stringUtf8CV(URI_2B), bufferCV(H2B)], "(err u101)");
call("amend d1 not-vetoed (RELEASED) -> ERR_NOT_VETOED", CREATOR_A, "amend-delivery", [uintCV(1), stringUtf8CV(URI_1), bufferCV(H1)], "(err u114)");
call("amend d2 (Emmexx, corrected hash) -> (ok true)", CREATOR_B, "amend-delivery", [uintCV(2), stringUtf8CV(URI_2B), bufferCV(H2B)], "(ok true)");
evalc("d2 after amend (PENDING, fresh window)", "(get-delivery u2)");

// --- cross the 288-block review window (mainnet timing) ---
advance(289);

call("approve d3 after window -> ERR_REVIEW_CLOSED", OWNER, "approve", [uintCV(3)], "(err u108)");
call("release d2 (amended) -> (ok true)", CREATOR_B, "release", [uintCV(2), boolCV(true)], "(ok true)");
call("release d3 -> (ok true)", CREATOR_A, "release", [uintCV(3), boolCV(true)], "(ok true)");
evalc("round1 after releases", "(get-round u1)");

// post-payout balances (for delta math)
evalc("walletA after", balOf(CREATOR_A_WALLET), "AW_after");
evalc("walletB after", balOf(CREATOR_B_WALLET), "BW_after");
evalc("opA after", balOf(CREATOR_A), "A_after");
evalc("opB after", balOf(CREATOR_B), "B_after");

// --- sweep guards (round still live, d4 still pending) ---
call("sweep before round-end -> ERR_ROUND_NOT_ENDED", OWNER, "sweep", [uintCV(1)], "(err u105)");
call("sweep by non-owner -> ERR_NOT_OWNER", CREATOR_A, "sweep", [uintCV(1)], "(err u100)");

// --- advance past round-end + claim grace (ROUND 4200 + GRACE 288),
//     then expire the abandoned slot. Already +289, so +4200 more puts us
//     well past ends-at + grace. ---
advance(4200);
call("expire d2 (RELEASED) -> ERR_NOT_CLAIMABLE", STRANGER, "expire", [uintCV(2)], "(err u116)");
call("expire d4 (PENDING, abandoned) -> (ok true)", STRANGER, "expire", [uintCV(4)], "(ok true)");

// --- sweep success + double-sweep guard ---
call("sweep round1 -> (ok u125000000) refund", OWNER, "sweep", [uintCV(1)], "(ok u125000000)");
call("double sweep -> ERR_ALREADY_SWEPT", OWNER, "sweep", [uintCV(1)], "(err u113)");
evalc("escrow balance after sweep (0)", "(get-escrow-balance)");


// =====================================================================
// v3: budget-exhausted close. Round 1 is over (time). Open round 2 with
// only 2 videos, pay both out, and show that OWNER can open round 3 and
// sweep round 2 WITHOUT advancing past the 4200-block window (v2 answered
// ERR_ROUND_ACTIVE / ERR_ROUND_NOT_ENDED here -- the 2026-09-08 incident).
// =====================================================================
const URI_5 = "ipfs://video-5";
const URI_6 = "ipfs://video-6";
const URI_7 = "ipfs://video-7-over-capacity";
const H5 = Buffer.alloc(32, 0x55);
const H6 = Buffer.alloc(32, 0x66);
const H7 = Buffer.alloc(32, 0x77);
const startRound = (n) => [standardPrincipalCV(CREATOR_A), pcv(CREATOR_A_WALLET),
   standardPrincipalCV(CREATOR_B), pcv(CREATOR_B_WALLET), uintCV(P25), uintCV(n)];

call("start-round 2 (2 videos, $50) -> (ok u2)", OWNER, "start-round", startRound(2), "(ok u2)");
call("start-round while round 2 live + unspent -> ERR_ROUND_ACTIVE", OWNER, "start-round", startRound(2), "(err u103)");
call("submit d5 (Sam) -> (ok u5)", CREATOR_A, "submit-delivery", [stringUtf8CV(URI_5), bufferCV(H5)], "(ok u5)");
call("submit d6 (Emmexx) -> (ok u6)", CREATOR_B, "submit-delivery", [stringUtf8CV(URI_6), bufferCV(H6)], "(ok u6)");
call("approve d5 -> (ok true)", OWNER, "approve", [uintCV(5)], "(ok true)");
call("approve d6 -> (ok true)", OWNER, "approve", [uintCV(6)], "(ok true)");
call("start-round with budget unspent + 2 pending -> ERR_ROUND_ACTIVE", OWNER, "start-round", startRound(2), "(err u103)");
call("sweep round 2 (live, unspent) -> ERR_ROUND_NOT_ENDED", OWNER, "sweep", [uintCV(2)], "(err u105)");
call("release d5 -> (ok true)", CREATOR_A, "release", [uintCV(5), boolCV(true)], "(ok true)");
call("start-round with $25 left + 1 pending -> ERR_ROUND_ACTIVE", OWNER, "start-round", startRound(2), "(err u103)");
call("release d6 -> (ok true)", CREATOR_B, "release", [uintCV(6), boolCV(true)], "(ok true)");
evalc("round 2 after payouts (paid-out == deposited, pending 0)", "(get-round u2)");
call("submit into exhausted round 2 -> ERR_OVER_CAPACITY", CREATOR_A, "submit-delivery", [stringUtf8CV(URI_7), bufferCV(H7)], "(err u119)");
call("start-round 3 right after budget exhausted (NO advance) -> (ok u3)", OWNER, "start-round", startRound(8), "(ok u3)");
evalc("escrow balance after round 3 start ($200)", "(get-escrow-balance)");
call("sweep exhausted round 2 (NO advance) -> (ok u0)", OWNER, "sweep", [uintCV(2)], "(ok u0)");
call("double sweep round 2 -> ERR_ALREADY_SWEPT", OWNER, "sweep", [uintCV(2)], "(err u113)");
call("sweep live round 3 -> ERR_ROUND_NOT_ENDED", OWNER, "sweep", [uintCV(3)], "(err u105)");
evalc("escrow balance unchanged by 0-refund sweep ($200)", "(get-escrow-balance)");

// =====================================================================
// Run + verify
// =====================================================================
function decodeTx(summary) {
  const r = summary?.Result?.Transaction;
  if (!r) return { ok: false, str: "<no transaction result>" };
  if ("Err" in r) return { ok: false, str: `ENGINE-ERR: ${r.Err}` };
  try {
    return { ok: true, str: cvToString(deserializeCV(r.Ok.result)) };
  } catch (e) {
    return { ok: false, str: `decode-failed(${r.Ok.result}): ${e.message}` };
  }
}
function decodeEval(summary) {
  const r = summary?.Result?.Eval;
  if (!r) return "<no eval result>";
  if (!("Ok" in r)) return `ERR: ${r.Err}`;
  // Eval results come back SIP-005 hex-serialized, same as tx results.
  try {
    return cvToString(deserializeCV(r.Ok));
  } catch {
    return r.Ok; // non-decodable (shouldn't happen) -> raw
  }
}
const uintFromOk = (s) => BigInt((s.match(/u(\d+)/) || [])[1] ?? "-1");

async function main() {
  console.log("=== creator-escrow-v3 SELF-VERIFYING stxer harness ===\n");
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted. Fetching results...\n${url}\n`);

  const res = await getSimulationResult(sessionId);
  const steps = res.steps;
  const captured = {};
  let pass = 0;
  let fail = 0;

  steps.forEach((s, i) => {
    const p = plan[i];
    if (!p) return;
    if (p.kind === "deploy") {
      const d = decodeTx(s);
      const okDeploy = !("Err" in (s?.Result?.Transaction || {}));
      console.log(`${okDeploy ? "✅" : "❌"} [${i}] ${p.label} -> ${d.str}`);
      okDeploy ? pass++ : fail++;
    } else if (p.kind === "tx") {
      const d = decodeTx(s);
      const ok = d.str === p.expect;
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${d.str}${ok ? "" : `  EXPECTED ${p.expect}`}`);
      ok ? pass++ : fail++;
    } else if (p.kind === "eval") {
      const v = decodeEval(s);
      if (p.capture) captured[p.capture] = v;
      console.log(`ℹ️  [${i}] ${p.label}: ${v}`);
    } else if (p.kind === "advance") {
      console.log(`⏩ [${i}] ${p.label}`);
    }
  });

  // --- balance delta assertions: payout lands in SMART WALLET only ---
  console.log("\n--- payout delta checks (USDCx, 6-dec) ---");
  const deltas = [
    ["creator-A SMART wallet", captured.AW_after, captured.AW_before, 2n * BigInt(P25)], // d1 + d3
    ["creator-B SMART wallet", captured.BW_after, captured.BW_before, 1n * BigInt(P25)], // d2
    ["creator-A OPERATING wallet", captured.A_after, captured.A_before, 0n],
    ["creator-B OPERATING wallet", captured.B_after, captured.B_before, 0n],
  ];
  for (const [label, after, before, want] of deltas) {
    const got = uintFromOk(after ?? "") - uintFromOk(before ?? "");
    const ok = got === want;
    console.log(`${ok ? "✅" : "❌"} ${label} delta = ${got} (want ${want})`);
    ok ? pass++ : fail++;
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  console.log(`View: ${url}`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
