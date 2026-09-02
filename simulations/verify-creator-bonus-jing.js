// verify-creator-bonus-jing.js
// SELF-VERIFYING stxer mainnet-fork harness for creator-bonus-jing.
//
// Deploys the bonus contract against the REAL deployed escrow
// (SPV9K21….creator-escrow-v2-jing) and its real state at the pinned tip:
// deliveries 1-11 exist, d4 is VETOED (round 1, swept), d8 is RELEASED
// (round 3, Emmexx), next delivery id is 12, round 3 ends at burn 966510.
//
// Covers: owner/amount/existence guards on fund, top-up, claim gate on
// RELEASED, wrong-creator claim, double claim, fund-after-claim, revoke
// only on VETOED/EXPIRED, revoke refund, revoke guards, and the full
// pending -> approved -> released -> claimed path on a fresh round 4
// (escrow owner impersonated, whale funds it). Asserts USDCx lands in the
// creators' SMART WALLETS and the bonus contract ends at zero balance.
//
// Run: npx tsx simulations/verify-creator-bonus-jing.js
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  boolCV,
  bufferCV,
  noneCV,
  stringUtf8CV,
  standardPrincipalCV,
  contractPrincipalCV,
  deserializeCV,
  cvToString,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";

const pcv = (s) =>
  s.includes(".")
    ? contractPrincipalCV(s.split(".")[0], s.split(".")[1])
    : standardPrincipalCV(s);

// --- Mainnet principals ---
const WHALE = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51"; // USDCx whale = bonus OWNER
const ESCROW_OWNER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // escrow deployer
const ESCROW = `${ESCROW_OWNER}.creator-escrow-v2-jing`;
const USDCX = "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx";

const SAM = "SP3C1YFP86PVM9VT0119NXH54DW9KWDVVGS571VVT"; // creator-a
const EMMEXX = "SP2QVKZ2GWP97TW4RNCT8TN65JRJPVAKERHYSS13E"; // creator-b
const SAM_WALLET = "SP28MP1HQDJWQAFSQJN2HBAXBVP7H7THD1W2NYZVK.studiosam-wallet";
const EMMEXX_WALLET = "SP28MP1HQDJWQAFSQJN2HBAXBVP7H7THD1W2NYZVK.emmex-wallet";
const STRANGER = "SP000000000000000000002Q6VF78";

const CONTRACT_NAME = "creator-bonus-jing";
const CID = `${WHALE}.${CONTRACT_NAME}`;

// USDCx is 6-dec
const B10 = 10_000_000, B5 = 5_000_000, B3 = 3_000_000, B7 = 7_000_000, B2 = 2_000_000;
const PER_VIDEO = 12_500_000; // round 4, same as round 3
const NUM_VIDEOS = 4;
const ROUND_DEPOSIT = PER_VIDEO * NUM_VIDEOS; // 50 USDCx
const TOPUP_ESCROW_OWNER = 60_000_000;

// Real mainnet ids at the pinned tip
const D_RELEASED = 8; // round 3, Emmexx, RELEASED
const D_VETOED = 4; // round 1, Emmexx, VETOED, round swept
const D_NO_BONUS = 7; // round 2, Sam, RELEASED, never funded here
const D_MISSING = 999;
const D_NEW_SAM = 12; // first submit in round 4
const D_NEW_EMMEXX = 13;

const balOf = (addr) => `(contract-call? '${USDCX} get-balance '${addr})`;
const escrowDelivery = (id) => `(contract-call? '${ESCROW} get-delivery u${id})`;

const plan = [];
const source = fs.readFileSync("./contracts/deploying/creator-bonus-jing.clar", "utf8");
const b = SimulationBuilder.new();

function deploy() {
  b.withSender(WHALE).addContractDeploy({
    contract_name: CONTRACT_NAME,
    source_code: source,
    clarity_version: ClarityVersion.Clarity5,
  });
  plan.push({ kind: "deploy", label: "deploy creator-bonus-jing (whale = OWNER)" });
}
function call(label, sender, fn, args, expect, contract = CID) {
  b.withSender(sender).addContractCall({ contract_id: contract, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label, expect });
}
function evalc(label, code, capture) {
  b.addEvalCode(CID, code);
  plan.push({ kind: "eval", label, capture });
}
function advance(n) {
  b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1 });
  plan.push({ kind: "advance", label: `advance ${n} burn blocks` });
}
const reason = (s) => stringUtf8CV(s);

// =====================================================================
// Scenario
// =====================================================================
deploy();

evalc("whale before", balOf(WHALE), "W_before");
evalc("emmexx wallet before", balOf(EMMEXX_WALLET), "EW_before");
evalc("sam wallet before", balOf(SAM_WALLET), "SW_before");
evalc("emmexx operating before", balOf(EMMEXX), "E_before");
evalc("sam operating before", balOf(SAM), "S_before");
evalc("escrow d8 (expect RELEASED u1)", escrowDelivery(D_RELEASED));

// --- fund guards ---
call("fund by non-owner -> ERR_NOT_OWNER", STRANGER, "fund", [uintCV(D_RELEASED), uintCV(B10), reason("x")], "(err u200)");
call("fund amount 0 -> ERR_AMOUNT_ZERO", WHALE, "fund", [uintCV(D_RELEASED), uintCV(0), reason("x")], "(err u204)");
call("fund missing delivery -> ERR_DELIVERY_NOT_FOUND", WHALE, "fund", [uintCV(D_MISSING), uintCV(B10), reason("x")], "(err u202)");

// --- happy path on an already-RELEASED delivery (d8, Emmexx) ---
call("fund d8 10 USDCx -> (ok u10000000)", WHALE, "fund", [uintCV(D_RELEASED), uintCV(B10), reason("spot: best cut of the month")], "(ok u10000000)");
call("top-up d8 +5 -> (ok u15000000)", WHALE, "fund", [uintCV(D_RELEASED), uintCV(B5), reason("spot: top-up")], "(ok u15000000)");
evalc("is-claimable d8 (true)", `(is-claimable u${D_RELEASED})`, "claimable_d8");
evalc("bonus d8", `(get-bonus u${D_RELEASED})`);
call("claim d8 by Sam (not creator) -> ERR_NOT_CREATOR", SAM, "claim", [uintCV(D_RELEASED)], "(err u201)");
call("claim d8 by stranger -> ERR_NOT_CREATOR", STRANGER, "claim", [uintCV(D_RELEASED)], "(err u201)");
call("claim d8 by Emmexx -> (ok u15000000)", EMMEXX, "claim", [uintCV(D_RELEASED)], "(ok u15000000)");
call("claim d8 again -> ERR_BONUS_NOT_PENDING", EMMEXX, "claim", [uintCV(D_RELEASED)], "(err u206)");
call("fund d8 after claim -> ERR_BONUS_NOT_PENDING", WHALE, "fund", [uintCV(D_RELEASED), uintCV(B5), reason("x")], "(err u206)");
evalc("is-claimable d8 after claim (false)", `(is-claimable u${D_RELEASED})`, "claimable_d8_after");

// --- revoke path on a VETOED delivery (d4, round 1 swept) ---
call("fund d4 (VETOED) 3 -> (ok u3000000)", WHALE, "fund", [uintCV(D_VETOED), uintCV(B3), reason("funded before checking status")], "(ok u3000000)");
evalc("is-claimable d4 (false)", `(is-claimable u${D_VETOED})`, "claimable_d4");
call("claim d4 by Emmexx (VETOED) -> ERR_NOT_RELEASED", EMMEXX, "claim", [uintCV(D_VETOED)], "(err u207)");
call("revoke d4 by non-owner -> ERR_NOT_OWNER", EMMEXX, "revoke", [uintCV(D_VETOED)], "(err u200)");
call("revoke d7 (no bonus) -> ERR_NO_BONUS", WHALE, "revoke", [uintCV(D_NO_BONUS)], "(err u205)");
call("revoke d4 -> (ok u3000000) refund", WHALE, "revoke", [uintCV(D_VETOED)], "(ok u3000000)");
call("revoke d4 again -> ERR_BONUS_NOT_PENDING", WHALE, "revoke", [uintCV(D_VETOED)], "(err u206)");
call("claim d4 after revoke -> ERR_BONUS_NOT_PENDING", EMMEXX, "claim", [uintCV(D_VETOED)], "(err u206)");

// --- pending -> approved -> released -> claimed, on a fresh round 4 ---
// Round 3 ends at burn 966510; tip is ~965211. Past it, the escrow owner can
// start round 4. The whale tops the escrow owner up with USDCx first.
advance(1400);
call("whale -> escrow owner 60 USDCx", WHALE, "transfer",
  [uintCV(TOPUP_ESCROW_OWNER), standardPrincipalCV(WHALE), standardPrincipalCV(ESCROW_OWNER), noneCV()],
  "(ok true)", USDCX);
call("escrow: start-round 4 -> (ok u4)", ESCROW_OWNER, "start-round",
  [standardPrincipalCV(SAM), pcv(SAM_WALLET), standardPrincipalCV(EMMEXX), pcv(EMMEXX_WALLET),
   uintCV(PER_VIDEO), uintCV(NUM_VIDEOS)], "(ok u4)", ESCROW);
call("escrow: Sam submits d12 -> (ok u12)", SAM, "submit-delivery",
  [stringUtf8CV("ipfs://round4-sam-1"), bufferCV(Buffer.alloc(32, 0x41))], "(ok u12)", ESCROW);

call("fund d12 (PENDING) 7 -> (ok u7000000)", WHALE, "fund", [uintCV(D_NEW_SAM), uintCV(B7), reason("spot: round 4 opener")], "(ok u7000000)");
evalc("is-claimable d12 while PENDING (false)", `(is-claimable u${D_NEW_SAM})`, "claimable_d12_pending");
call("claim d12 while PENDING -> ERR_NOT_RELEASED", SAM, "claim", [uintCV(D_NEW_SAM)], "(err u207)");
call("revoke d12 while PENDING -> ERR_STILL_CLAIMABLE", WHALE, "revoke", [uintCV(D_NEW_SAM)], "(err u208)");
call("escrow: approve d12 -> (ok true)", ESCROW_OWNER, "approve", [uintCV(D_NEW_SAM)], "(ok true)", ESCROW);
call("claim d12 while APPROVED -> ERR_NOT_RELEASED", SAM, "claim", [uintCV(D_NEW_SAM)], "(err u207)");
call("revoke d12 while APPROVED -> ERR_STILL_CLAIMABLE", WHALE, "revoke", [uintCV(D_NEW_SAM)], "(err u208)");
call("escrow: Sam releases d12 -> (ok true)", SAM, "release", [uintCV(D_NEW_SAM), boolCV(true)], "(ok true)", ESCROW);
evalc("is-claimable d12 after release (true)", `(is-claimable u${D_NEW_SAM})`, "claimable_d12_released");
call("claim d12 by Emmexx (wrong creator) -> ERR_NOT_CREATOR", EMMEXX, "claim", [uintCV(D_NEW_SAM)], "(err u201)");
call("claim d12 by Sam -> (ok u7000000)", SAM, "claim", [uintCV(D_NEW_SAM)], "(ok u7000000)");

// --- veto after funding, then revoke; amend does not resurrect a revoked bonus ---
call("escrow: Emmexx submits d13 -> (ok u13)", EMMEXX, "submit-delivery",
  [stringUtf8CV("ipfs://round4-emmexx-1"), bufferCV(Buffer.alloc(32, 0x42))], "(ok u13)", ESCROW);
call("fund d13 2 -> (ok u2000000)", WHALE, "fund", [uintCV(D_NEW_EMMEXX), uintCV(B2), reason("spot")], "(ok u2000000)");
call("escrow: veto d13 -> (ok true)", ESCROW_OWNER, "veto", [uintCV(D_NEW_EMMEXX), stringUtf8CV("wrong hash")], "(ok true)", ESCROW);
call("revoke d13 (VETOED) -> (ok u2000000)", WHALE, "revoke", [uintCV(D_NEW_EMMEXX)], "(ok u2000000)");
call("escrow: Emmexx amends d13 -> (ok true)", EMMEXX, "amend-delivery",
  [uintCV(D_NEW_EMMEXX), stringUtf8CV("ipfs://round4-emmexx-1b"), bufferCV(Buffer.alloc(32, 0x43))], "(ok true)", ESCROW);
call("fund d13 after revoke -> ERR_BONUS_NOT_PENDING", WHALE, "fund", [uintCV(D_NEW_EMMEXX), uintCV(B2), reason("x")], "(err u206)");

// --- final balances ---
evalc("bonus contract balance (0)", "(get-balance)", "C_after");
evalc("whale after", balOf(WHALE), "W_after");
evalc("emmexx wallet after", balOf(EMMEXX_WALLET), "EW_after");
evalc("sam wallet after", balOf(SAM_WALLET), "SW_after");
evalc("emmexx operating after", balOf(EMMEXX), "E_after");
evalc("sam operating after", balOf(SAM), "S_after");

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
  try {
    return cvToString(deserializeCV(r.Ok));
  } catch {
    return r.Ok;
  }
}
const uintFromOk = (s) => BigInt((s.match(/u(\d+)/) || [])[1] ?? "-1");

async function main() {
  console.log("=== creator-bonus-jing SELF-VERIFYING stxer harness ===\n");
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
      const okDeploy = !("Err" in (s?.Result?.Transaction || {}));
      console.log(`${okDeploy ? "✅" : "❌"} [${i}] ${p.label} -> ${decodeTx(s).str}`);
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

  console.log("\n--- read-only gate checks ---");
  const bools = [
    ["is-claimable d8 funded+released", captured.claimable_d8, "true"],
    ["is-claimable d8 after claim", captured.claimable_d8_after, "false"],
    ["is-claimable d4 vetoed", captured.claimable_d4, "false"],
    ["is-claimable d12 pending", captured.claimable_d12_pending, "false"],
    ["is-claimable d12 released", captured.claimable_d12_released, "true"],
  ];
  for (const [label, got, want] of bools) {
    const ok = got === want;
    console.log(`${ok ? "✅" : "❌"} ${label} = ${got} (want ${want})`);
    ok ? pass++ : fail++;
  }

  console.log("\n--- USDCx delta checks (6-dec) ---");
  const deltas = [
    ["Emmexx SMART wallet (+15 bonus d8)", captured.EW_after, captured.EW_before, BigInt(B10 + B5)],
    ["Sam SMART wallet (+12.5 escrow d12, +7 bonus d12)", captured.SW_after, captured.SW_before, BigInt(PER_VIDEO + B7)],
    ["Emmexx OPERATING wallet (0)", captured.E_after, captured.E_before, 0n],
    ["Sam OPERATING wallet (0)", captured.S_after, captured.S_before, 0n],
    // -15 (d8) -3 +3 (d4) -7 (d12) -2 +2 (d13) -60 (top-up to escrow owner)
    ["whale (-15 -7 -60)", captured.W_after, captured.W_before, -BigInt(B10 + B5 + B7 + TOPUP_ESCROW_OWNER)],
  ];
  for (const [label, after, before, want] of deltas) {
    const got = uintFromOk(after ?? "") - uintFromOk(before ?? "");
    const ok = got === want;
    console.log(`${ok ? "✅" : "❌"} ${label} delta = ${got} (want ${want})`);
    ok ? pass++ : fail++;
  }
  {
    const got = uintFromOk(captured.C_after ?? "");
    const ok = got === 0n;
    console.log(`${ok ? "✅" : "❌"} bonus contract ends empty = ${got} (want 0)`);
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
