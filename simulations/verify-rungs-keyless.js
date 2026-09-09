// verify-rungs-keyless.js
// SELF-VERIFYING stxer mainnet-fork harness for jing-ladder + one rung
// (jing-buy-stx or jing-sell-stx, SIDE=buy|sell) against the LIVE
// markets-sbtc-stx-jing-v5. Needs NO Pyth key: it first cancels the live
// depositors on the opposite side (any sender is ours on a fork), so the
// rung's market deposits carry price u0 and skip the Lazer classification.
//
// Covers: ladder canonical + hash-gated register, bad-name initialize,
// deposit below/above the market minimum (held vs pushed), the operator
// RAISING the market minimum mid-flight (the min-market read-live fix:
// a stale constant would have pushed 1000 sats into a 5000 minimum and
// aborted u1004), partial withdraw (remainder above min), whole-cancel
// (remainder below min), full exit, second member shares, and proceeds
// via a direct STX/sBTC gift + claim. Fills need a taker update -> not here.
//
// Run: SIDE=buy npx tsx simulations/verify-rungs-keyless.js
//      SIDE=sell npx tsx simulations/verify-rungs-keyless.js
import fs from "node:fs";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  deserializeCV, cvToString, noneCV,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";

const SIDE = (process.env.SIDE || "buy").toLowerCase();
const BUY = SIDE === "buy";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // ladder owner, rung deployer, market operator
const MARKET = `${DEP}.markets-sbtc-stx-jing-v5`;
const LADDER = `${DEP}.jing-ladder`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const WSTX = "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2";
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token");
const wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
// live book at cycle u0 (2026-09-08): x makers SPW81…, SPV9K21…; y maker SP1BP…
const LIVE_X = ["SPW81Q8C7S1ZD0ZDRF50TZ4RA32A1FADPHXMACF7", DEP];
const LIVE_Y = ["SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q"];
// members: buy side needs sBTC, sell side needs STX
const A = BUY ? "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2" : "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";
const B = "SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q"; // 278k sats + 7.4k STX
const STRANGER = "SP000000000000000000002Q6VF78";

// buy rung 331.50 sats/STX (below ~347 mid, never crosses); sell rung 360.00 (above)
const CENTS = BUY ? 33150 : 36000;
const RUNG = BUY ? "jing-buy-stx-331-50" : "jing-sell-stx-360-00";
const RUNG_BAD = BUY ? "jing-buy-stx-300-00" : "jing-sell-stx-400-00";
const RID = `${DEP}.${RUNG}`;
const SIDE_STR = BUY ? "buy-stx" : "sell-stx";
const U = BUY ? 1 : 1000; // unit scale: sats vs uSTX (min 1000 sats / 1,000,000 uSTX)
const u = (n) => uintCV(n * U);
const MIN0 = 1000 * U, MIN1 = 5000 * U;
const NO_UPDATE = bufferCV(Buffer.from("00", "hex"));
const held = BUY ? "held-sats" : "held-ustx";
const balOf = (who) => BUY ? `(contract-call? '${SBTC} get-balance '${who})` : `(stx-get-balance '${who})`;

const ladderSrc = fs.readFileSync("./contracts/jing-ladder.clar", "utf8");
const rungSrc = fs.readFileSync(BUY ? "./contracts/jing-buy-stx.clar" : "./contracts/jing-sell-stx.clar", "utf8");

const plan = [];
const b = SimulationBuilder.new();
function deploy(sender, name, src) {
  b.withSender(sender).addContractDeploy({ contract_name: name, source_code: src, clarity_version: ClarityVersion.Clarity5 });
  plan.push({ kind: "deploy", label: `deploy ${name}` });
}
function call(label, sender, cid, fn, args, expect) {
  b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label, expect });
}
function evalc(label, code, capture) { b.addEvalCode(RID, code); plan.push({ kind: "eval", label, capture }); }
function stxGift(from, to, ustx) { b.withSender(from).addSTXTransfer({ recipient: to, amount: ustx }); plan.push({ kind: "tx", label: `gift ${ustx} uSTX ${from.slice(0,6)} -> rung`, expect: "(ok true)" }); }

// ---- 1. clear the OPPOSITE side of the live book (no classification needed after) ----
if (BUY) for (const y of LIVE_Y) call(`clear live y maker ${y.slice(0,6)}`, y, MARKET, "cancel-token-y-deposit", [wstxT, stringAsciiCV("wstx")], null);
else for (const x of LIVE_X) call(`clear live x maker ${x.slice(0,6)}`, x, MARKET, "cancel-token-x-deposit", [sbtcT, stringAsciiCV("sbtc-token")], null);

// ---- 2. ladder + rung, hash-gated register ----
deploy(DEP, "jing-ladder", ladderSrc);
deploy(DEP, RUNG, rungSrc);
deploy(DEP, RUNG_BAD, rungSrc);
call("initialize before canonical -> ERR_NOT_VERIFIED u6003", DEP, RID, "initialize", [uintCV(CENTS)], "(err u6003)");
call("set-canonical by stranger -> u6001", STRANGER, LADDER, "set-canonical", [stringAsciiCV(SIDE_STR), contractPrincipalCV(DEP, RUNG)], "(err u6001)");
call("set-canonical (owner) -> ok", DEP, LADDER, "set-canonical", [stringAsciiCV(SIDE_STR), contractPrincipalCV(DEP, RUNG)], "(ok true)");
call("initialize by non-deployer -> u7001", STRANGER, RID, "initialize", [uintCV(CENTS)], "(err u7001)");
call("initialize with a price that does not match the name -> ERR_BAD_NAME u7009", DEP, `${DEP}.${RUNG_BAD}`, "initialize", [uintCV(CENTS)], "(err u7009)");
call(`initialize ${RUNG} u${CENTS} -> ok (registers)`, DEP, RID, "initialize", [uintCV(CENTS)], "(ok true)");
call("initialize twice -> u7002", DEP, RID, "initialize", [uintCV(CENTS)], "(err u7002)");
call(`register same price again via ${RUNG_BAD} (bad name anyway) -> u7009`, DEP, `${DEP}.${RUNG_BAD}`, "initialize", [uintCV(CENTS)], "(err u7009)");
evalc("min-market reads the live minimum (1000 sats / 1M uSTX)", "(min-market)");
evalc("ladder get-rung", `(contract-call? '${LADDER} get-rung "${SIDE_STR}" u${CENTS})`);

// ---- 3. deposits: under the minimum is held, over is pushed ----
call("deposit below MIN_DEPOSIT -> u7005", A, RID, "deposit", [uintCV(1), NO_UPDATE], "(err u7005)");
call("A deposit 500 (under market min) -> held", A, RID, "deposit", [u(500), NO_UPDATE], "(ok true)");
evalc("state after 500: held 500, resting 0", "(get-state)");
call("A deposit 600 -> 1100 pushed to market", A, RID, "deposit", [u(600), NO_UPDATE], "(ok true)");
evalc("state after 1100: held 0, resting 1100", "(get-state)");

// ---- 4. operator raises the market minimum to 5000: the rung must follow ----
call("operator set-min to 5000", DEP, MARKET, BUY ? "set-min-token-x-deposit" : "set-min-token-y-deposit", [uintCV(MIN1)], "(ok true)");
evalc("min-market now 5000", "(min-market)");
call("A deposit 1000 with min 5000: to-push 1000 < 5000 -> HELD (stale constant would push and abort u1004)", A, RID, "deposit", [u(1000), NO_UPDATE], "(ok true)");
evalc("state: held 1000, resting 1100", "(get-state)");
call("A deposit 4000 -> 5000 pushed, resting 6100", A, RID, "deposit", [u(4000), NO_UPDATE], "(ok true)");
evalc("state: held 0, resting 6100", "(get-state)");

// ---- 5. withdraws: partial keeps >= min on market, else whole-cancel + hold ----
call("withdraw 0 -> u7004", A, RID, "withdraw", [uintCV(0)], "(err u7004)");
call("stranger withdraw -> u7006", STRANGER, RID, "withdraw", [u(1)], "(err u7006)");
call("A withdraw 500: 6100-500=5600 >= 5000 -> partial withdraw-token", A, RID, "withdraw", [u(500)], "(ok true)");
evalc("state: held 0, resting 5600", "(get-state)");
call("A withdraw 1000: 5600-1000=4600 < 5000 -> whole cancel, 4600 held", A, RID, "withdraw", [u(1000)], "(ok true)");
evalc("state: held 4600, resting 0", "(get-state)");
evalc("A position: 4600 unsold", `(get-position '${A})`);

// ---- 6. second member; shares; full exits ----
call("B deposit 2000 -> 6600 pushed", B, RID, "deposit", [u(2000), NO_UPDATE], "(ok true)");
evalc("state: held 0, resting 6600, shares 6600e12", "(get-state)");
evalc("B position 2000", `(get-position '${B})`);
evalc("A before exit", balOf(A), "A0");
call("A withdraw everything (999999): 6600-4600=2000 < 5000 -> whole cancel, pays 4600, holds 2000", A, RID, "withdraw", [u(999999)], "(ok true)");
evalc("A after exit", balOf(A), "A1");
evalc("state: held 2000, resting 0, shares 2000e12", "(get-state)");
evalc("A position gone", `(get-position '${A})`);
call("A withdraw again -> u7006", A, RID, "withdraw", [u(1)], "(err u7006)");

// ---- 7. proceeds: gift the other asset, claim ----
if (BUY) stxGift("SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51", RID, 10_000_000); // 10 STX to the buy rung
else call("gift 10000 sats to the sell rung", "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2", SBTC, "transfer", [uintCV(10000), standardPrincipalCV("SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2"), contractPrincipalCV(DEP, RUNG), noneCV()], "(ok true)");
call("sync (anyone) folds the gift as proceeds", STRANGER, RID, "sync", [], "(ok true)");
evalc("B position: proceeds = whole gift", `(get-position '${B})`);
call("B claim -> ok", B, RID, "claim", [], null);
evalc("B position after claim: proceeds 0", `(get-position '${B})`);
call("B withdraw 2000 (from held) -> ok", B, RID, "withdraw", [u(2000)], "(ok true)");
evalc("state: empty pool, shares 0", "(get-state)");
evalc("rung sats/ustx balance 0", balOf(RID));

// ---- run + verify ----
function decodeTx(s) { const r = s?.Result?.Transaction; if (!r) return { ok: false, str: "<no tx result>" }; if ("Err" in r) return { ok: false, str: `ENGINE-ERR: ${r.Err}` }; try { return { ok: true, str: cvToString(deserializeCV(r.Ok.result)) }; } catch (e) { return { ok: false, str: `decode-failed: ${e.message}` }; } }
function decodeEval(s) { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `ERR: ${r.Err}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } }
const uintFromOk = (s) => BigInt((s.match(/u(\d+)/) || [])[1] ?? "-1");
async function main() {
  console.log(`=== rungs keyless harness SIDE=${SIDE} (${RUNG}) ===\n`);
  const sessionId = await b.run();
  console.log(`https://stxer.xyz/simulations/mainnet/${sessionId}\n`);
  const res = await getSimulationResult(sessionId);
  const steps = res.steps; const captured = {}; let pass = 0, fail = 0;
  plan.forEach((p, i) => {
    const s = steps[i];
    if (p.kind === "deploy") { const t = s?.Result?.Transaction; const ok = !!t && !("Err" in t) && !t.Ok?.vm_error; const why = t?.Ok?.vm_error || t?.Err; console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}${ok ? "" : ` -> ${why}`}`); ok ? pass++ : fail++; }
    else if (p.kind === "tx") { const d = decodeTx(s); const ok = p.expect === null ? d.ok : d.str === p.expect; console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${d.str}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++; }
    else { const v = decodeEval(s); if (p.capture) captured[p.capture] = v; console.log(`ℹ️  [${i}] ${p.label}: ${v}`); }
  });
  if (captured.A0 && captured.A1) { const d = uintFromOk(captured.A1) - uintFromOk(captured.A0); const ok = d === BigInt(4600 * U); console.log(`${ok ? "✅" : "❌"} A exit delta ${d} (expected ${4600 * U})`); ok ? pass++ : fail++; }
  console.log(`\n=== ${pass} passed, ${fail} failed ===\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
