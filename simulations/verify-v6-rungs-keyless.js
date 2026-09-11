// verify-v6-rungs-keyless.js
// SELF-VERIFYING stxer mainnet-fork harness for the v6 stack, no Pyth key:
// deploys jing-core-v5 + markets-sbtc-stx-jing-v6 under the deployer
// (SPV9K21…, neither is on mainnet), verifies + initializes the market,
// deploys jing-ladder (with the peg sides) and ONE rung, then walks the rung:
// ladder gating (canonical, hash, bad name, twice, stranger), deposits held
// vs pushed, the operator raising the market minimum mid-flight, partial
// withdraw, whole-cancel, full exit with exact payout, second member,
// proceeds via a gift + claim, empty pool at the end. The market book is
// empty on the other side, so no deposit ever fetches a price: keyless.
//
//   RUNG=buy | sell | buy-peg | sell-peg
// Fixed rungs bind v6 with `none` in the spread slot; peg rungs rest
// `(some spread)` with the floor / cap from their name, and the harness
// reads the order back off the market to prove both landed.
//
// Run: RUNG=buy-peg npx tsx simulations/verify-v6-rungs-keyless.js
import fs from "node:fs";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  deserializeCV, cvToString, noneCV,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";

const RUNG_KIND = (process.env.RUNG || "buy").toLowerCase();
const BUY = RUNG_KIND.startsWith("buy");
const PEG = RUNG_KIND.endsWith("peg");

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // core owner, market operator, ladder owner, rung deployer
const CORE = "jing-core-v5";
const MKT = "markets-sbtc-stx-jing-v6";
const CORE_ID = `${DEP}.${CORE}`;
const MARKET = `${DEP}.${MKT}`;
const LADDER = `${DEP}.jing-ladder`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const WSTX = "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2";
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token");
const wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const A = BUY ? "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2" : "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";
const B = "SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q"; // 278k sats + 7.4k STX
const STRANGER = "SP000000000000000000002Q6VF78";

// buy 331.50 sats/STX (below ~347 mid), sell 360.00 (above); pegs 20 bps with the same guard
const CENTS = BUY ? 33150 : 36000;
const BPS = 20;
const HUMAN = BUY ? "331-50" : "360-00";
const HUMAN_BAD = BUY ? "300-00" : "400-00";
const RUNG = PEG
  ? (BUY ? `jing-buy-stx-spread-${BPS}-floor-${HUMAN}` : `jing-sell-stx-spread-${BPS}-cap-${HUMAN}`)
  : (BUY ? `jing-buy-stx-${HUMAN}` : `jing-sell-stx-${HUMAN}`);
const RUNG_BAD = PEG
  ? (BUY ? `jing-buy-stx-spread-30-floor-${HUMAN_BAD}` : `jing-sell-stx-spread-30-cap-${HUMAN_BAD}`)
  : (BUY ? `jing-buy-stx-${HUMAN_BAD}` : `jing-sell-stx-${HUMAN_BAD}`);
const RID = `${DEP}.${RUNG}`;
const BID = `${DEP}.${RUNG_BAD}`;
const SIDE_STR = PEG ? (BUY ? "buy-peg" : "sell-peg") : (BUY ? "buy-stx" : "sell-stx");
const LADDER_KEY = PEG ? CENTS * 10000 + BPS : CENTS; // (spread, guard) packed for pegs
const P = 1000000000000000000n / BigInt(CENTS);       // market unit, 1e18 / cents
const U = BUY ? 1 : 1000; // sats vs uSTX (min 1000 sats / 1,000,000 uSTX)
const u = (n) => uintCV(n * U);
const MIN0 = 1000 * U, MIN1 = 5000 * U;
const NO_UPDATE = bufferCV(Buffer.from("00", "hex"));
const initArgs = (cents, bps = BPS) => PEG ? [uintCV(bps), uintCV(cents)] : [uintCV(cents)];
const balOf = (who) => BUY ? `(contract-call? '${SBTC} get-balance '${who})` : `(stx-get-balance '${who})`;
const orderOf = `(contract-call? '${MARKET} ${BUY ? "get-token-x-order" : "get-token-y-order"} '${RID})`;
const guardName = BUY ? "floor" : "cap";

const src = (f) => fs.readFileSync(`./contracts/${f}.clar`, "utf8");
const rungFile = PEG ? (BUY ? "jing-buy-stx-market-spread" : "jing-sell-stx-market-spread") : (BUY ? "jing-buy-stx" : "jing-sell-stx");

const plan = [];
const b = SimulationBuilder.new();
function deploy(sender, name, code) {
  b.withSender(sender).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 });
  plan.push({ kind: "deploy", label: `deploy ${name}` });
}
function call(label, sender, cid, fn, args, expect) {
  b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label, expect });
}
function evalc(label, code, capture) { b.addEvalCode(RID, code); plan.push({ kind: "eval", label, capture }); }
function stxGift(from, to, ustx) { b.withSender(from).addSTXTransfer({ recipient: to, amount: ustx }); plan.push({ kind: "tx", label: `gift ${ustx} uSTX ${from.slice(0, 6)} -> rung`, expect: null }); }

// ---- 1. the v6 stack: core-v5, market, verify, initialize (fresh, empty book) ----
deploy(DEP, CORE, src(CORE));
deploy(DEP, MKT, src(MKT));
call("core-v5: verify the v6 market hash", DEP, CORE_ID, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], "(ok true)");
call("v6 initialize (sbtc / wstx, min 1000 sats / 1 STX, feeds 1 / 45)", DEP, MARKET, "initialize",
  [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)], "(ok true)");

// ---- 2. ladder + rung, hash-gated register ----
deploy(DEP, "jing-ladder", src("jing-ladder"));
deploy(DEP, RUNG, src(rungFile));
deploy(DEP, RUNG_BAD, src(rungFile));
call("initialize before canonical -> ERR_NOT_VERIFIED u6003", DEP, RID, "initialize", initArgs(CENTS), "(err u6003)");
call("set-canonical by stranger -> u6001", STRANGER, LADDER, "set-canonical", [stringAsciiCV(SIDE_STR), contractPrincipalCV(DEP, RUNG)], "(ok true)".replace("(ok true)", "(err u6001)"));
call("set-canonical on an unknown side -> u6007", DEP, LADDER, "set-canonical", [stringAsciiCV("buy-xyz"), contractPrincipalCV(DEP, RUNG)], "(err u6007)");
call(`set-canonical ${SIDE_STR} (owner) -> ok`, DEP, LADDER, "set-canonical", [stringAsciiCV(SIDE_STR), contractPrincipalCV(DEP, RUNG)], "(ok true)");
call("initialize by non-deployer -> u7001", STRANGER, RID, "initialize", initArgs(CENTS), "(err u7001)");
if (PEG) {
  call("peg: spread 10000 bps -> ERR_BAD_SPREAD u7010", DEP, BID, "initialize", initArgs(CENTS, 10000), "(err u7010)");
  call(`peg: ${guardName} 0 -> ERR_ZERO_PRICE u7008`, DEP, BID, "initialize", initArgs(0), "(err u7008)");
}
call("initialize with numbers that do not match the name -> ERR_BAD_NAME u7009", DEP, BID, "initialize", initArgs(CENTS), "(err u7009)");
call(`initialize ${RUNG} -> ok (registers under ${SIDE_STR})`, DEP, RID, "initialize", initArgs(CENTS), "(ok true)");
call("initialize twice -> u7002", DEP, RID, "initialize", initArgs(CENTS), "(err u7002)");
evalc("min-market reads the v6 minimum", "(min-market)");
evalc(`ladder get-rung ${SIDE_STR} u${LADDER_KEY}`, `(contract-call? '${LADDER} get-rung "${SIDE_STR}" u${LADDER_KEY})`, "rung");
evalc("rung get-state", "(get-state)", "state0");

// ---- 3. deposits: under the minimum is held, over is pushed ----
call("deposit below MIN_DEPOSIT -> u7005", A, RID, "deposit", [uintCV(1), NO_UPDATE], "(err u7005)");
call("A deposit 500 (under market min) -> held", A, RID, "deposit", [u(500), NO_UPDATE], "(ok true)");
evalc("state after 500: held 500, resting 0", "(get-state)");
call("A deposit 600 -> 1100 pushed to market", A, RID, "deposit", [u(600), NO_UPDATE], "(ok true)");
evalc("state after 1100: held 0, resting 1100", "(get-state)");
evalc(`market order for the rung (${PEG ? `limit = ${guardName} in market unit, spread-bps (some u${BPS})` : "limit = price, spread-bps none"})`, orderOf, "order");

// ---- 4. operator raises the market minimum to 5000: the rung must follow ----
call("operator set-min to 5000", DEP, MARKET, BUY ? "set-min-token-x-deposit" : "set-min-token-y-deposit", [uintCV(MIN1)], "(ok true)");
evalc("min-market now 5000", "(min-market)");
call("A deposit 1000 with min 5000: to-push 1000 < 5000 -> HELD", A, RID, "deposit", [u(1000), NO_UPDATE], "(ok true)");
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
evalc("state: empty pool, shares 0", "(get-state)", "stateEnd");
evalc("rung sats/ustx balance 0", balOf(RID), "rungBal");

// ---- run + verify ----
function decodeTx(s) { const r = s?.Result?.Transaction; if (!r) return { ok: false, str: "<no tx result>" }; if ("Err" in r) return { ok: false, str: `ENGINE-ERR: ${r.Err}` }; if (r.Ok?.vm_error) return { ok: false, str: `VM-ERR: ${r.Ok.vm_error}` }; try { return { ok: true, str: cvToString(deserializeCV(r.Ok.result)) }; } catch (e) { return { ok: false, str: `decode-failed: ${e.message}` }; } }
function decodeEval(s) { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `ERR: ${r.Err}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } }
const uintFromOk = (s) => BigInt((s.match(/u(\d+)/) || [])[1] ?? "-1");
async function main() {
  console.log(`=== v6 rungs keyless harness RUNG=${RUNG_KIND} (${RUNG}) ===\n`);
  const sessionId = await b.run();
  console.log(`https://stxer.xyz/simulations/mainnet/${sessionId}\n`);
  const res = await getSimulationResult(sessionId);
  const steps = res.steps; const captured = {}; let pass = 0, fail = 0;
  plan.forEach((p, i) => {
    const s = steps[i];
    if (p.kind === "deploy") { const t = s?.Result?.Transaction; const ok = !!t && !("Err" in t) && !t.Ok?.vm_error; const why = t?.Ok?.vm_error || t?.Err; console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}${ok ? "" : `  ${JSON.stringify(why)}`}`); ok ? pass++ : fail++; }
    else if (p.kind === "tx") { const d = decodeTx(s); const ok = p.expect === null ? d.ok : d.str === p.expect; console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${d.str}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++; }
    else { const v = decodeEval(s); if (p.capture) captured[p.capture] = v; console.log(`ℹ️  [${i}] ${p.label}: ${v}`); }
  });
  const check = (label, ok, detail = "") => { console.log(`${ok ? "✅" : "❌"} ${label}${detail ? `: ${detail}` : ""}`); ok ? pass++ : fail++; };
  if (captured.A0 && captured.A1) { const d = uintFromOk(captured.A1) - uintFromOk(captured.A0); check(`A exit delta ${d} (expected ${4600 * U})`, d === BigInt(4600 * U)); }
  check("ladder knows the rung under its key", (captured.rung || "").includes(RUNG), captured.rung);
  const ord = captured.order || "";
  if (PEG) {
    check(`market order carries spread-bps (some u${BPS})`, ord.includes(`(spread-bps (some u${BPS}))`), ord);
    check(`market order limit is the ${guardName} in market unit u${P}`, ord.includes(`(limit u${P})`), ord);
    check(`rung state shows ${guardName}-cents u${CENTS} and spread-bps u${BPS}`, (captured.state0 || "").includes(`(${guardName}-cents u${CENTS})`) && (captured.state0 || "").includes(`(spread-bps u${BPS})`), captured.state0);
  } else {
    check("market order is fixed (spread-bps none)", ord.includes("(spread-bps none)"), ord);
    check(`market order limit is the price u${P}`, ord.includes(`(limit u${P})`), ord);
  }
  check("pool empty at the end (total-shares u0)", (captured.stateEnd || "").includes("(total-shares u0)"), captured.stateEnd);
  console.log(`\n=== ${pass} passed, ${fail} failed ===\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
