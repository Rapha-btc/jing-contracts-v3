// verify-sw-cashout-v2-emmex.js
// Same full money-path proof as verify-sw-cashout-v2.js, but for Emmexx:
//   1. creator-escrow-v2 `release` pays USDCx into emmex-wallet (her SMART
//      WALLET), NOT her operating address, then
//   2. Emmexx (admin of emmex-wallet, confirmed via get-owner) transfers
//      the USDCx OUT to her own creator address via `sip010-transfer`.
//
// Self-verifying on a stxer mainnet fork. Run:
//   npx tsx simulations/verify-sw-cashout-v2-emmex.js
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  boolCV,
  bufferCV,
  stringUtf8CV,
  stringAsciiCV,
  standardPrincipalCV,
  contractPrincipalCV,
  noneCV,
  deserializeCV,
  cvToString,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";

const OWNER = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51"; // USDCx whale = escrow OWNER

const SAM = "SP3C1YFP86PVM9VT0119NXH54DW9KWDVVGS571VVT";
const SAM_WALLET = "SP28MP1HQDJWQAFSQJN2HBAXBVP7H7THD1W2NYZVK.studiosam-wallet";
const EMMEXX = "SP2QVKZ2GWP97TW4RNCT8TN65JRJPVAKERHYSS13E";        // creator (operating + SW admin)
const EMMEXX_WALLET = "SP28MP1HQDJWQAFSQJN2HBAXBVP7H7THD1W2NYZVK.emmex-wallet"; // her smart wallet

const USDCX = "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx";
const USDCX_ASSET = "usdcx-token";

const CONTRACT_NAME = "creator-escrow-v2-swtest-emmex";
const CID = `${OWNER}.${CONTRACT_NAME}`;
const P25 = 25_000_000;

const pcv = (s) =>
  s.includes(".")
    ? contractPrincipalCV(s.split(".")[0], s.split(".")[1])
    : standardPrincipalCV(s);
const balOf = (addr) => `(contract-call? '${USDCX} get-balance '${addr})`;

const plan = [];
const source = fs.readFileSync("./contracts/creator-v2/creator-escrow-v2.clar", "utf8");
const b = SimulationBuilder.new();

function deploy() {
  b.withSender(OWNER).addContractDeploy({
    contract_name: CONTRACT_NAME,
    source_code: source,
    clarity_version: ClarityVersion.Clarity4,
  });
  plan.push({ kind: "deploy", label: "deploy creator-escrow-v2 (OWNER = whale)" });
}
function call(label, sender, contract, fn, args, expect) {
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

// --- scenario ---
deploy();
call("start-round (Sam->SW, Emmexx->SW, $25 x 2)", OWNER, CID, "start-round",
  [pcv(SAM), pcv(SAM_WALLET), pcv(EMMEXX), pcv(EMMEXX_WALLET), uintCV(P25), uintCV(2)], "(ok u1)");
call("Emmexx submit-delivery -> (ok u1)", EMMEXX, CID, "submit-delivery",
  [stringUtf8CV("ipfs://emmex-video-1"), bufferCV(Buffer.alloc(32, 0xbb))], "(ok u1)");
advance(289); // cross the 288-block review window (mainnet timing)

evalc("emmex-wallet USDCx before release", balOf(EMMEXX_WALLET), "SW_before");
evalc("Emmexx USDCx before release", balOf(EMMEXX), "EM_before");

// 1) release pays the SMART WALLET
call("Emmexx release(1) -> (ok true)", EMMEXX, CID, "release", [uintCV(1), boolCV(true)], "(ok true)");
evalc("emmex-wallet USDCx after release", balOf(EMMEXX_WALLET), "SW_mid");
evalc("Emmexx USDCx after release", balOf(EMMEXX), "EM_mid");

// 2) Emmexx (SW admin) cashes out to her own address
call("Emmexx cashes out SW -> own addr (sip010-transfer) -> (ok true)", EMMEXX, EMMEXX_WALLET, "sip010-transfer",
  [uintCV(P25), pcv(EMMEXX), noneCV(), pcv(USDCX), stringAsciiCV(USDCX_ASSET), noneCV(), noneCV()], "(ok true)");
evalc("emmex-wallet USDCx after cash-out", balOf(EMMEXX_WALLET), "SW_end");
evalc("Emmexx USDCx after cash-out", balOf(EMMEXX), "EM_end");

// --- run + verify ---
function decodeTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return "<no tx result>";
  if ("Err" in r) return `ENGINE-ERR: ${r.Err}`;
  try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed: ${e.message}`; }
}
function decodeEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval>";
  if (!("Ok" in r)) return `ERR: ${r.Err}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; }
}
const u = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");

async function main() {
  console.log("=== Emmexx SW cash-out (release -> SW -> creator addr) self-verifying sim ===\n");
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted: ${url}\n`);
  const { steps } = await getSimulationResult(sessionId);
  const cap = {};
  let pass = 0, fail = 0;
  steps.forEach((s, i) => {
    const p = plan[i];
    if (!p) return;
    if (p.kind === "deploy") {
      const ok = !("Err" in (s?.Result?.Transaction || {}));
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${decodeTx(s)}`); ok ? pass++ : fail++;
    } else if (p.kind === "tx") {
      const got = decodeTx(s); const ok = got === p.expect;
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${got}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++;
    } else if (p.kind === "eval") {
      const v = decodeEval(s); if (p.capture) cap[p.capture] = v;
      console.log(`ℹ️  [${i}] ${p.label}: ${v}`);
    } else if (p.kind === "advance") {
      console.log(`⏩ [${i}] ${p.label}`);
    }
  });

  console.log("\n--- balance delta checks (USDCx) ---");
  const checks = [
    ["release pays emmex-wallet (+$25)", u(cap.SW_mid) - u(cap.SW_before), BigInt(P25)],
    ["release does NOT pay Emmexx directly (0)", u(cap.EM_mid) - u(cap.EM_before), 0n],
    ["cash-out drains emmex-wallet (-$25)", u(cap.SW_mid) - u(cap.SW_end), BigInt(P25)],
    ["cash-out credits Emmexx (+$25)", u(cap.EM_end) - u(cap.EM_mid), BigInt(P25)],
  ];
  for (const [label, got, want] of checks) {
    const ok = got === want;
    console.log(`${ok ? "✅" : "❌"} ${label}: delta ${got} (want ${want})`); ok ? pass++ : fail++;
  }
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  console.log(`View: ${url}`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
