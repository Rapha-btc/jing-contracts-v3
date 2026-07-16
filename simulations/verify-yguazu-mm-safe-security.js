// verify-yguazu-mm-safe-security.js
// Answers two questions about the LIVE deployed
//   SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.yguazu-mm-safe
// with a real large position (100,001 STX + ~1 BTC of sBTC), on a mainnet
// fork against the exact deployed contract principal:
//
//   (A) CAN IT BE STUCK?  Fund the safe and get it ALL back out through the
//       real owner. For BOTH assets: a small (<=threshold) transfer executes
//       immediately; a large transfer exceeds the per-period spend threshold
//       (100 STX / 0.001 BTC) so it routes through the pending-operation
//       timelock (cooldown 144 burn blocks) and is then executed by the
//       owner. Safe returns to its exact pre-funding balance. No outside
//       party can veto/block the owner's pending exit.
//
//   (B) CAN IT BE HACKED?  Every non-admin path to move funds reverts:
//       the rfq-operator hot key (SPV9K21) and a random attacker cannot
//       stx-transfer, sip010-transfer the sBTC, rotate the rfq-operator, or
//       veto a pending op. Only the owner/admin (SP2WRKMX) moves funds.
//       rfq-operator is NOT an admin; the onboard bootstrap admin was removed.
//
// stxer forks the deployed bytecode + state at the tip, so this exercises the
// REAL yguazu-mm-safe. The owner is impersonated via the plain-principal admin
// path (is-admin-calling tx-sender) -- no passkey needed, which is exactly the
// cold-key path that has to work for a large exit.
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
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2"; // ~40 BTC sBTC, funds the safe

const STX = (n) => n * 1_000_000n;
const SATS = (n) => n; // sBTC is 8-decimal, 1 BTC = 100,000,000 sats

// STX position
const STX_FUND = STX(100_001n); // 100k position + 1 STX for the immediate-path test
const STX_SMALL = STX(1n);      // <= 100-STX threshold: executes immediately
const STX_BIG = STX(100_000n);  // > threshold: routes through the timelock

// sBTC position
const SBTC_FUND = SATS(100_050_000n); // 1 BTC + 0.0005 BTC for the immediate-path test
const SBTC_SMALL = SATS(50_000n);     // < 0.001 BTC (100k sats) threshold: immediate
const SBTC_BIG = SATS(100_000_000n);  // 1 BTC, > threshold: routes through the timelock

const pcv = (s) => contractPrincipalCV(s.split(".")[0], s.split(".")[1]);
const balStx = (a) => `(stx-get-balance '${a})`;
const balSbtc = (a) => `(contract-call? '${SBTC_FQN} get-balance '${a})`;
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
  console.log(`attacker/recipient = ${RANDO}`);
  console.log(`position tested = ${STX_FUND / 1_000_000n} STX + ${SBTC_FUND} sats sBTC (~${SBTC_FUND / 100_000_000n} BTC)\n`);

  const plan = [];
  const b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  function call(label, sender, fn, args, expect) {
    b.withSender(sender).addContractCall({ contract_id: SAFE_CID, function_name: fn, function_args: args });
    plan.push({ kind: "tx", label, expect });
  }
  function callExt(label, sender, cid, fn, args, expect) {
    b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
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
  const sbtcXfer = (amt, to) => [uintCV(amt), standardPrincipalCV(to), noneCV(),
    pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME), noneCV(), noneCV()];

  // ---- who is admin (identity of trust) ----
  evalc("get-owner", "(get-owner)", "OWNER");
  evalc("is-admin(owner)", `(is-admin-calling '${OWNER})`, "ADM_OWNER");
  evalc("is-admin(rfq-operator)", `(is-admin-calling '${RFQ_OP})`, "ADM_OP");
  evalc("is-admin(onboard bootstrap)", `(is-admin-calling '${BOOTSTRAP})`, "ADM_BOOT");
  evalc("get-rfq-operator", "(get-rfq-operator)", "RFQOP");

  // ---- fund the safe with a large STX + sBTC position ----
  b.addSTXTransfer({ sender: OWNER, recipient: SAFE_CID, amount: Number(STX_FUND) });
  plan.push({ kind: "tx", label: `fund safe with ${STX_FUND / 1_000_000n} STX`, expect: null });
  callExt(`fund safe with ${SBTC_FUND} sats sBTC`, SBTC_WHALE, SBTC_FQN, "transfer",
    [uintCV(SBTC_FUND), standardPrincipalCV(SBTC_WHALE), pcv(SAFE_CID), noneCV()], null);

  evalc("safe STX after fund", balStx(SAFE_CID), "S_STX0");
  evalc("safe sBTC after fund", balSbtc(SAFE_CID), "S_SBTC0");
  evalc("rando STX before", balStx(RANDO), "R_STX0");
  evalc("rando sBTC before", balSbtc(RANDO), "R_SBTC0");

  // ================= (B) HACK SURFACE: non-admins cannot move funds =================
  call("rfq-operator stx-transfer -> err-unauthorised", RFQ_OP, "stx-transfer", stxXfer(STX_SMALL, RFQ_OP), "(err u4001)");
  call("rando stx-transfer -> err-unauthorised", RANDO, "stx-transfer", stxXfer(STX_SMALL, RANDO), "(err u4001)");
  call("rfq-operator sip010-transfer (safe sBTC) -> err-unauthorised", RFQ_OP, "sip010-transfer", sbtcXfer(SBTC_SMALL, RFQ_OP), "(err u4001)");
  call("rando sip010-transfer (safe sBTC) -> err-unauthorised", RANDO, "sip010-transfer", sbtcXfer(SBTC_SMALL, RANDO), "(err u4001)");
  call("rfq-operator rotate rfq-operator -> err-unauthorised", RFQ_OP, "set-rfq-operator",
    [standardPrincipalCV(RANDO)], "(err u4001)");
  call("rando set-rfq-operator -> err-unauthorised", RANDO, "set-rfq-operator",
    [standardPrincipalCV(RANDO)], "(err u4001)");

  // ================= (A) STUCK: owner gets the full position back out =================
  // ---- STX: small immediate, then 100k through the timelock (pending op 0) ----
  call("owner send 1 STX (<=threshold) -> ok (immediate)", OWNER, "stx-transfer", stxXfer(STX_SMALL, RANDO), "(ok true)");
  call("owner send 100000 STX (>threshold) -> ok (queued as op 0)", OWNER, "stx-transfer", stxXfer(STX_BIG, RANDO), "(ok true)");
  evalc("pending op 0 (stx)", "(get-pending-operation u0)", "POP_STX");

  // ---- sBTC: small immediate, then 1 BTC through the timelock (pending op 1) ----
  call("owner send 0.0005 BTC (<threshold) -> ok (immediate)", OWNER, "sip010-transfer", sbtcXfer(SBTC_SMALL, RANDO), "(ok true)");
  call("owner send 1 BTC sBTC (>threshold) -> ok (queued as op 1)", OWNER, "sip010-transfer", sbtcXfer(SBTC_BIG, RANDO), "(ok true)");
  evalc("pending op 1 (sbtc)", "(get-pending-operation u1)", "POP_SBTC");

  evalc("safe STX after both queues (unchanged by big)", balStx(SAFE_CID), "S_STX1");
  evalc("safe sBTC after both queues (unchanged by big)", balSbtc(SAFE_CID), "S_SBTC1");
  evalc("rando STX after immediates", balStx(RANDO), "R_STX1");
  evalc("rando sBTC after immediates", balSbtc(RANDO), "R_SBTC1");

  // ---- cannot execute early; outsider cannot veto ----
  call("execute stx op 0 before cooldown -> err-cooldown-not-passed", OWNER, "execute-pending-stx-transfer",
    [uintCV(0), noneCV()], "(err u4017)");
  call("execute sbtc op 1 before cooldown -> err-cooldown-not-passed", OWNER, "execute-pending-sbtc-transfer",
    [uintCV(1), noneCV()], "(err u4017)");
  call("rando veto stx op 0 -> err-unauthorised", RANDO, "veto-operation", [uintCV(0), noneCV(), noneCV()], "(err u4001)");
  call("rando veto sbtc op 1 -> err-unauthorised", RANDO, "veto-operation", [uintCV(1), noneCV(), noneCV()], "(err u4001)");

  advance(145);

  // ---- execute both after cooldown ----
  call("owner execute pending 100000 STX after cooldown -> ok", OWNER, "execute-pending-stx-transfer",
    [uintCV(0), noneCV()], "(ok true)");
  call("owner execute pending 1 BTC sBTC after cooldown -> ok", OWNER, "execute-pending-sbtc-transfer",
    [uintCV(1), noneCV()], "(ok true)");

  evalc("safe STX after execute", balStx(SAFE_CID), "S_STX2");
  evalc("safe sBTC after execute", balSbtc(SAFE_CID), "S_SBTC2");
  evalc("rando STX after execute", balStx(RANDO), "R_STX2");
  evalc("rando sBTC after execute", balSbtc(RANDO), "R_SBTC2");

  // ---- double-execute guards ----
  call("execute stx op 0 again -> err-already-executed", OWNER, "execute-pending-stx-transfer",
    [uintCV(0), noneCV()], "(err u4014)");
  call("execute sbtc op 1 again -> err-already-executed", OWNER, "execute-pending-sbtc-transfer",
    [uintCV(1), noneCV()], "(err u4014)");

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

  // ---- STX exit accounting ----
  const sStx0 = uintFrom(cap.S_STX0), sStx1 = uintFrom(cap.S_STX1), sStx2 = uintFrom(cap.S_STX2);
  const rStx0 = uintFrom(cap.R_STX0), rStx1 = uintFrom(cap.R_STX1), rStx2 = uintFrom(cap.R_STX2);
  const preStx = sStx0 - STX_FUND;
  assert("STX: funded with 100,001 STX", sStx0 >= STX_FUND, `(safe=${sStx0} pre=${preStx})`);
  assert("STX: 1 STX immediate reached rando", rStx1 - rStx0 === STX_SMALL, `(delta=${rStx1 - rStx0})`);
  assert("STX: queuing 100k moved nothing yet (timelock)", sStx1 === sStx0 - STX_SMALL, `(safe=${sStx1})`);
  assert("STX: pending op 0 is stx-transfer of 100000 STX",
    String(cap.POP_STX).includes("stx-transfer") && String(cap.POP_STX).includes(`u${STX_BIG}`), `(${cap.POP_STX})`);
  assert("STX: safe returns to exact pre-funding balance (nothing stuck)", sStx2 === preStx, `(safe=${sStx2} pre=${preStx})`);
  assert("STX: rando got the full 100,001 STX back out", rStx2 - rStx0 === STX_FUND, `(delta=${rStx2 - rStx0})`);

  // ---- sBTC exit accounting ----
  const sB0 = uintFrom(cap.S_SBTC0), sB1 = uintFrom(cap.S_SBTC1), sB2 = uintFrom(cap.S_SBTC2);
  const rB0 = uintFrom(cap.R_SBTC0), rB1 = uintFrom(cap.R_SBTC1), rB2 = uintFrom(cap.R_SBTC2);
  const preSbtc = sB0 - SBTC_FUND;
  assert("sBTC: funded with ~1.0005 BTC", sB0 >= SBTC_FUND, `(safe=${sB0} pre=${preSbtc})`);
  assert("sBTC: 0.0005 BTC immediate reached rando", rB1 - rB0 === SBTC_SMALL, `(delta=${rB1 - rB0})`);
  assert("sBTC: queuing 1 BTC moved nothing yet (timelock)", sB1 === sB0 - SBTC_SMALL, `(safe=${sB1})`);
  assert("sBTC: pending op 1 is sbtc-transfer of 1 BTC",
    String(cap.POP_SBTC).includes("sbtc-transfer") && String(cap.POP_SBTC).includes(`u${SBTC_BIG}`), `(${cap.POP_SBTC})`);
  assert("sBTC: safe returns to exact pre-funding balance (nothing stuck)", sB2 === preSbtc, `(safe=${sB2} pre=${preSbtc})`);
  assert("sBTC: rando got the full ~1.0005 BTC back out", rB2 - rB0 === SBTC_FUND, `(delta=${rB2 - rB0})`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===\nView: ${url}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
