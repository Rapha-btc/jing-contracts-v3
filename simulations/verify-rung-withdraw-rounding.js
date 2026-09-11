// Regression harness for the partial-withdraw share burn in jing-buy-stx
// (bounty finding, Proud Haven, 2026-09-09: floor(amount*SCALE/fi) burned too
// few shares once fi < SCALE, so 98 x withdraw(1) paid 98 sats on a 66-sat
// position and drained the other member). withdraw now rounds the burn UP:
// the same 1-sat loop stops at 50 sats, the position is gone, and the other
// member's shares still map to their full entitlement.
// Originally: reproduces cumulative share-underburn in jing-buy-stx.withdraw on a stxer
// mainnet fork. The production rung source is changed only to bind a minimal
// custody/fill market double; its accounting and withdrawal code are exact.
import fs from "node:fs";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV,
  deserializeCV, cvToString, noneCV, standardPrincipalCV,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const MARKET_NAME = "rounding-mock-market";
const MARKET = `${DEP}.${MARKET_NAME}`;
const LADDER = `${DEP}.jing-ladder-rounding-poc`;
const RUNG_NAME = "jing-buy-stx-331-50";
const RUNG = `${DEP}.${RUNG_NAME}`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const B = "SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q";
const sbtcTrait = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token");
const none = noneCV();
const noUpdate = bufferCV(Buffer.from("00", "hex"));

const ladderSrc = fs.readFileSync(new URL("../contracts/jing-ladder.clar", import.meta.url), "utf8");
const mockSrc = fs.readFileSync(new URL("./rounding-mock-market.clar", import.meta.url), "utf8");
let rungSrc = fs.readFileSync(new URL("../contracts/jing-buy-stx.clar", import.meta.url), "utf8");
rungSrc = rungSrc
  .replaceAll("SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v5", MARKET)
  .replace("(define-constant LADDER 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-ladder)",
    `(define-constant LADDER '${LADDER})`);

const plan = [];
const sim = SimulationBuilder.new();
function deploy(name, source) {
  sim.withSender(DEP).addContractDeploy({ contract_name: name, source_code: source, clarity_version: ClarityVersion.Clarity5 });
  plan.push({ kind: "deploy", label: `deploy ${name}` });
}
function call(label, sender, contractId, fn, args, expect = null) {
  sim.withSender(sender).addContractCall({ contract_id: contractId, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label, expect });
}
function evalc(label, code, key) {
  sim.addEvalCode(RUNG, code);
  plan.push({ kind: "eval", label, key });
}
function decodeTx(step) {
  const r = step?.Result?.Transaction;
  if (!r) return { ok: false, text: "<no result>" };
  if ("Err" in r) return { ok: false, text: `ENGINE-ERR: ${r.Err}` };
  if (r.Ok?.vm_error) return { ok: false, text: `VM-ERR: ${r.Ok.vm_error}` };
  try { return { ok: true, text: cvToString(deserializeCV(r.Ok.result)) }; }
  catch (e) { return { ok: false, text: `decode-failed: ${e.message}` }; }
}
function decodeEval(step) {
  const r = step?.Result?.Eval;
  if (!r || !("Ok" in r)) return `<eval-error: ${JSON.stringify(r)}>`;
  return cvToString(deserializeCV(r.Ok));
}
function uintValue(text) {
  const m = text.match(/u(\d+)/);
  if (!m) throw new Error(`No uint in ${text}`);
  return BigInt(m[1]);
}

deploy(MARKET_NAME, mockSrc);
deploy("jing-ladder-rounding-poc", ladderSrc);
deploy(RUNG_NAME, rungSrc);
call("set buy canonical", DEP, LADDER, "set-canonical",
  [stringAsciiCV("buy-stx"), contractPrincipalCV(DEP, RUNG_NAME)], "(ok true)");
call("initialize rung", DEP, RUNG, "initialize", [uintCV(33150)], "(ok true)");

// A owns 100 shares; B owns 1,400. The 500-sat fill leaves 1,000 of 1,500,
// so A's indexed entitlement becomes floor(100 * 2/3) = 66 sats.
call("A deposits 100 sats", A, RUNG, "deposit", [uintCV(100), noUpdate], "(ok true)");
call("B deposits 1400 sats", B, RUNG, "deposit", [uintCV(1400), noUpdate], "(ok true)");
call("mock consumes 500 sats as a fill", DEP, MARKET, "simulate-fill-x",
  [contractPrincipalCV(DEP, RUNG_NAME), uintCV(500)], "(ok u1000)");
call("sync records the 2/3 unfilled fraction", DEP, RUNG, "sync", [], "(ok true)");
evalc("A indexed entitlement before withdrawals", `(get-position '${A})`, "position0");
evalc("A sBTC balance immediately before withdrawals", `(contract-call? '${SBTC} get-balance '${A})`, "balance0");

// Each call requests 1 sat. floor(1*SCALE/unfilled-index) burns too few
// shares. Repeating it exhausts A's shares after receiving 98 sats.
for (let i = 1; i <= 98; i++) {
  // ceil burn: 2 shares per sat at fi = 2/3, so 100 shares last exactly 50 sats
  call(`A withdraws 1 sat (${i}/98)`, A, RUNG, "withdraw", [uintCV(1)], i <= 50 ? "(ok true)" : "(err u7006)");
}
evalc("A position after repeated withdrawals", `(get-position '${A})`, "position1");
evalc("A sBTC balance after repeated withdrawals", `(contract-call? '${SBTC} get-balance '${A})`, "balance1");
evalc("pool state after repeated withdrawals", "(get-state)", "state1");

async function main() {
  const sessionId = await sim.run();
  const result = await getSimulationResult(sessionId);
  let passed = 0, failed = 0;
  const captured = {};
  plan.forEach((item, i) => {
    const step = result.steps[i];
    if (item.kind === "deploy") {
      const r = step?.Result?.Transaction;
      const ok = !!r && !("Err" in r) && !r.Ok?.vm_error;
      ok ? passed++ : failed++;
      if (!ok) console.log(`FAIL ${item.label}: ${JSON.stringify(r)}`);
    } else if (item.kind === "tx") {
      const decoded = decodeTx(step);
      const ok = decoded.ok && (item.expect === null || decoded.text === item.expect);
      ok ? passed++ : failed++;
      if (!ok) console.log(`FAIL ${item.label}: ${decoded.text}; expected ${item.expect}`);
    } else {
      const text = decodeEval(step);
      captured[item.key] = text;
      console.log(`${item.label}: ${text}`);
    }
  });
  const before = uintValue(captured.balance0);
  const after = uintValue(captured.balance1);
  const received = after - before;
  const initialEntitlement = uintValue(captured.position0.match(/sbtc u\d+/)?.[0] ?? "");
  const positionGone = /sbtc u0/.test(captured.position1) && /shares u0/.test(captured.position1);
  const pooled = uintValue(captured.state1.match(/pooled u\d+/)?.[0] ?? "");
  const totalShares = uintValue(captured.state1.match(/total-shares u\d+/)?.[0] ?? "");
  const fi = uintValue(captured.state1.match(/unfilled-index u\d+/)?.[0] ?? "");
  // fixed: A can never take more than its entitlement; B (all remaining shares) is whole
  const fixed = initialEntitlement === 66n && received <= initialEntitlement && positionGone
    && pooled === (totalShares * fi) / 1000000000000n;
  fixed ? passed++ : failed++;
  console.log(`fixed-behaviour: received ${received} <= entitlement ${initialEntitlement}; B pooled ${pooled} == shares*fi ${(totalShares * fi) / 1000000000000n}`);
  console.log(JSON.stringify({ sessionId, initialEntitlement: String(initialEntitlement), received: String(received), excess: String(received - initialEntitlement), positionGone, passed, failed }, null, 2));
  if (failed) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });

