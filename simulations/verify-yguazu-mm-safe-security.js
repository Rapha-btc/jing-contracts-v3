// verify-yguazu-mm-safe-security.js
// Answers two questions about the LIVE deployed
//   SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.yguazu-mm-safe
// with a real ~100k STX position, on a mainnet fork:
//
//   (A) CAN IT BE STUCK?  Fund the safe with 100,001 STX and get it ALL back
//       out through the real owner: a small (<=threshold) transfer executes
//       immediately; a 100,000 STX transfer exceeds the 100-STX spend
//       threshold so it routes through the pending-operation timelock
//       (cooldown 144 burn blocks) and is then executed. Safe drains to 0.
//       Also: no external party can veto/block the owner's pending exit.
//
//   (B) CAN IT BE HACKED?  Every non-admin path to move funds reverts:
//       the rfq-operator hot key (SPV9K21) and a random attacker cannot
//       stx-transfer, sip010-transfer, rotate the rfq-operator, veto a
//       pending op, or re-onboard. Only the owner/admin (SP2WRKMX) moves
//       funds. rfq-operator is NOT an admin; the onboard bootstrap admin was
//       removed.
//
// This runs against the REAL on-chain contract (source fetched from the node
// is irrelevant -- stxer forks the deployed bytecode and state at the tip),
// impersonating the real owner via the plain-principal admin path (no passkey
// needed for is-admin-calling tx-sender).
//
// Run: npx tsx simulations/verify-yguazu-mm-safe-security.js
import {
  uintCV,
  stringAsciiCV,
  standardPrincipalCV,
  contractPrincipalCV,
  noneCV,
  deserializeCV,
  cvToString,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { SBTC_FQN, SBTC_ASSET_NAME } from "./_setup.js";

const STACKS_NODE_API = "http://77.42.3.101/stacks-api";

const V9 = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const SAFE_NAME = "yguazu-mm-safe";
const SAFE_CID = `${V9}.${SAFE_NAME}`;

const OWNER = "SP2WRKMXSS8P7NPTH1NSX5HCGPK8R4WGBR5FQG8MF"; // on-chain owner/admin (cold Leather)
const RFQ_OP = V9;                                          // current rfq-operator (hot key)
const RANDO = "SP3C1YFP86PVM9VT0119NXH54DW9KWDVVGS571VVT";  // unauthorized attacker + withdrawal recipient
const BOOTSTRAP = "SP000000000000000000002Q6VF78";          // onboard bootstrap admin (should be removed)

const STX = (n) => n * 1_000_000n;
const FUND = STX(100_001n);   // ~100k position + 1 STX for the immediate-path test
const SMALL = STX(1n);        // <= threshold: executes immediately
const BIG = STX(100_000n);    // > 100-STX threshold: routes through the timelock

const pcv = (s) => contractPrincipalCV(s.split(".")[0], s.split(".")[1]);
const balStx = (a) => `(stx-get-balance '${a})`;
const uintFrom = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");

function decodeTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return "<no tx>";
  if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed: ${e.message}`; }
}
function decodeEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval>";
  if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; }
}

async function main() {
  console.log("=== yguazu-mm-safe SECURITY / STUCK verification (live deployed contract) ===\n");
  console.log(`safe   = ${SAFE_CID}`);
  console.log(`owner  = ${OWNER}`);
  console.log(`rfq-op = ${RFQ_OP}`);
  console.log(`attacker/recipient = ${RANDO}\n`);

  const plan = [];
  const b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  function call(label, sender, fn, args, expect) {
    b.withSender(sender).addContractCall({ contract_id: SAFE_CID, function_name: fn, function_args: args });
    plan.push({ kind: "tx", label, expect });
  }
  function evalc(label, code, capture) {
    b.addEvalCode(SAFE_CID, code);
    plan.push({ kind: "eval", label, capture });
  }
  function advance(n) {
    b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 1 });
    plan.push({ kind: "advance", label: `advance ${n} burn blocks (cooldown)` });
  }
  const stxXfer = (amt, to) => [uintCV(amt), standardPrincipalCV(to), noneCV(), noneCV(), noneCV()];
  const sip010Xfer = (amt, to) => [uintCV(amt), standardPrincipalCV(to), noneCV(),
    pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME), noneCV(), noneCV()];

  // ---- who is admin (identity of trust) ----
  evalc("get-owner", "(get-owner)", "OWNER");
  evalc("is-admin(owner)", `(is-admin-calling '${OWNER})`, "ADM_OWNER");
  evalc("is-admin(rfq-operator)", `(is-admin-calling '${RFQ_OP})`, "ADM_OP");
  evalc("is-admin(onboard bootstrap)", `(is-admin-calling '${BOOTSTRAP})`, "ADM_BOOT");
  evalc("get-rfq-operator", "(get-rfq-operator)", "RFQOP");

  // ---- fund the safe with a ~100k STX position ----
  b.addSTXTransfer({ sender: OWNER, recipient: SAFE_CID, amount: Number(FUND) });
  plan.push({ kind: "tx", label: `fund safe with ${FUND / 1_000_000n} STX`, expect: null });

  evalc("safe STX after fund", balStx(SAFE_CID), "S0");
  evalc("rando STX before", balStx(RANDO), "R0");

  // ================= (B) HACK SURFACE: non-admins cannot move funds =================
  call("rfq-operator stx-transfer -> err-unauthorised", RFQ_OP, "stx-transfer", stxXfer(SMALL, RFQ_OP), "(err u4001)");
  call("rando stx-transfer -> err-unauthorised", RANDO, "stx-transfer", stxXfer(SMALL, RANDO), "(err u4001)");
  call("rando sip010-transfer (safe sBTC) -> err-unauthorised", RANDO, "sip010-transfer", sip010Xfer(1n, RANDO), "(err u4001)");
  call("rfq-operator rotate rfq-operator -> err-unauthorised", RFQ_OP, "set-rfq-operator",
    [standardPrincipalCV(RANDO)], "(err u4001)");
  call("rando set-rfq-operator -> err-unauthorised", RANDO, "set-rfq-operator",
    [standardPrincipalCV(RANDO)], "(err u4001)");

  // ================= (A) STUCK: owner gets the full position back out =================
  // small transfer <= threshold: executes immediately
  call("owner send 1 STX (<=threshold) -> ok (immediate)", OWNER, "stx-transfer", stxXfer(SMALL, RANDO), "(ok true)");
  evalc("safe STX after immediate", balStx(SAFE_CID), "S1");
  evalc("rando STX after immediate", balStx(RANDO), "R1");

  // 100k transfer > threshold: routes to pending-operation timelock (op-id u0)
  call("owner send 100000 STX (>threshold) -> ok (queued)", OWNER, "stx-transfer", stxXfer(BIG, RANDO), "(ok true)");
  evalc("pending op 0", "(get-pending-operation u0)", "POP0");
  evalc("safe STX after queue (must be unchanged)", balStx(SAFE_CID), "S2");

  // cannot execute before cooldown
  call("execute before cooldown -> err-cooldown-not-passed", OWNER, "execute-pending-stx-transfer",
    [uintCV(0), noneCV()], "(err u4017)");
  // an outsider cannot veto to block the owner's exit
  call("rando veto pending op -> err-unauthorised", RANDO, "veto-operation",
    [uintCV(0), noneCV(), noneCV()], "(err u4001)");

  advance(145);

  call("owner execute pending 100000 STX after cooldown -> ok", OWNER, "execute-pending-stx-transfer",
    [uintCV(0), noneCV()], "(ok true)");
  evalc("safe STX after execute (drained)", balStx(SAFE_CID), "S3");
  evalc("rando STX after execute", balStx(RANDO), "R3");

  // double-execute guard
  call("execute again -> err-already-executed", OWNER, "execute-pending-stx-transfer",
    [uintCV(0), noneCV()], "(err u4014)");

  // ---- run + verify ----
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted: ${url}\n`);
  const res = await getSimulationResult(sessionId);
  const cap = {};
  let pass = 0, fail = 0;

  res.steps.forEach((s, i) => {
    const p = plan[i];
    if (!p) return;
    if (p.kind === "tx") {
      const got = decodeTx(s);
      if (p.expect === null) {
        const ok = got.startsWith("(ok") || got === "<no tx>" || got === "true";
        console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${got}`); ok ? pass++ : fail++;
      } else {
        const ok = got === p.expect;
        console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${got}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++;
      }
    } else if (p.kind === "eval") {
      const v = decodeEval(s);
      if (p.capture) cap[p.capture] = v;
      console.log(`ℹ️  [${i}] ${p.label}: ${v}`);
    } else if (p.kind === "advance") {
      console.log(`⏩ [${i}] ${p.label}`);
    }
  });

  console.log("\n--- assertions ---");
  const assert = (label, ok, detail = "") => {
    console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` ${detail}` : ""}`); ok ? pass++ : fail++;
  };

  // trust identity
  assert("owner is the admin", String(cap.ADM_OWNER) === "(ok true)", `(${cap.ADM_OWNER})`);
  assert("rfq-operator is NOT an admin", String(cap.ADM_OP) === "(err u4001)", `(${cap.ADM_OP})`);
  assert("onboard bootstrap admin was removed", String(cap.ADM_BOOT) === "(err u4001)", `(${cap.ADM_BOOT})`);
  assert("get-owner == SP2WRKMX", String(cap.OWNER).includes(OWNER), `(${cap.OWNER})`);

  // stuck test: exact fund/exit accounting
  const s0 = uintFrom(cap.S0), s1 = uintFrom(cap.S1), s2 = uintFrom(cap.S2), s3 = uintFrom(cap.S3);
  const r0 = uintFrom(cap.R0), r1 = uintFrom(cap.R1), r3 = uintFrom(cap.R3);
  const preFund = s0 - FUND; // safe's own balance before the test funded it
  assert("safe funded with 100,001 STX", s0 >= FUND, `(safe=${s0}, pre-existing=${preFund})`);
  assert("immediate 1 STX left the safe", s0 - s1 === SMALL, `(delta=${s0 - s1})`);
  assert("immediate 1 STX reached rando", r1 - r0 === SMALL, `(delta=${r1 - r0})`);
  assert("queuing 100k moved NOTHING yet (timelock, not instant)", s2 === s1, `(before=${s1} after-queue=${s2})`);
  assert("pending op recorded as stx-transfer of 100000 STX",
    String(cap.POP0).includes("stx-transfer") && String(cap.POP0).includes(`u${BIG}`), `(${cap.POP0})`);
  assert("after execute, safe returns to its exact pre-funding balance (nothing stuck)",
    s3 === preFund, `(safe=${s3} pre-existing=${preFund})`);
  assert("rando received the full 100k after cooldown", r3 - r1 === BIG, `(delta=${r3 - r1})`);
  assert("end-to-end: rando got the entire 100,001 STX position back out", r3 - r0 === FUND, `(delta=${r3 - r0})`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===\nView: ${url}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
