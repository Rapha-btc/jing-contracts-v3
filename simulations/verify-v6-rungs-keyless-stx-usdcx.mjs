import { rungReceipt } from "./_rung-receipt.js";
// verify-v6-rungs-keyless-stx-usdcx.mjs
// STX/USDCx port of verify-v6-rungs-keyless.js. Fork at the tip on the LIVE
// jing-core-v6: ladder + market deployed as DEP, verified + initialized by the
// core owner (multisig) with the operator handed over and back, ONE rung
// walked: ladder gating (canonical, hash, bad name, twice, stranger), deposits
// held vs pushed, the operator raising the market minimum mid-flight, partial
// withdraw, whole-cancel, full exit with exact payout, second member,
// proceeds via a gift + claim, empty pool at the end. The other side of the
// book is empty, so no deposit fetches a Lazer price: keyless (the band
// rung's push reads only DIA STX/USD, on chain).
//
//   RUNG=x | y   (aliases by ROLE: buy -> x, sell -> y; the original modes)
//     x: jing-sell-stx-usdc-20 (rests STX, "sel-band", floor = DIA * 0.8)
//     y: jing-buy-stx-usdc-20  (rests USDCx, "buy-band", cap = DIA * 1.2)
// The original buy / sell modes walk FIXED rungs (jing-buy-stx-<cents>); this
// set has only band rungs, so the same walk runs on the band rung of that role.
// Rung-type specifics, rederived / N/A:
//   - order check: band order = (limit = guard at push, spread-bps (some u20))
//     instead of fixed (limit = name price, spread-bps none).
//   - ladder key = the spread (u20) instead of the cents.
//   - bad-name check: jing-*-30 initialized with bps 20 -> u7009 (ported);
//     the hundredths zero-padding arm (u7009 on "300-05") is N/A: band names
//     are prefix + bps, no padding arm.
//   - spread 10000 -> u7010 is ported from the peg modes (band rungs carry a
//     spread); peg-only "guard 0 -> u7008" is N/A (the band guard is DIA).
//   - peg modes (buy-peg / sell-peg) N/A: no market-spread rung on this set.
// Units: both 6 dp, mins 1 STX / 1 USDCx: the original's U (1 sat / 1000 uSTX
// against mins 1000 sats / 1 STX) becomes U = 1000 on both sides, so every
// amount keeps its multiple of the min (500 U under, MIN1 = 5000 U, ...).
// Run: RUNG=y node simulations/verify-v6-rungs-keyless-stx-usdcx.mjs
import {
  ClarityVersion, uintCV, stringAsciiCV, standardPrincipalCV, deserializeCV, cvToString, noneCV, trueCV, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { NODE, DEP, CORE, CORE_OWNER, N, C, USDCX, STX_WHALES, USDCX_WHALES, traits, src, MIN, P_, balanceExpr } from "./_stx-usdcx-v6-common.mjs";

const MODE = ({ buy: "x", sell: "y", x: "x", y: "y" })[(process.env.RUNG || "x").toLowerCase()];
if (!MODE) { console.error("RUNG=x|y (buy=x, sell=y by role; peg modes are N/A on this set)"); process.exit(2); }
const X = MODE === "x";
const MARKET = C.market, LADDER = C.ladder;
const A = X ? STX_WHALES[0] : USDCX_WHALES[1];
const B = getAddressFromPrivateKey("781".repeat(22).slice(0, 64) + "01", "mainnet"); // funded explicitly below
const STRANGER = "SP000000000000000000002Q6VF78";
const BPS = 20;
const RUNG = X ? `jing-sell-stx-usdc-${BPS}` : `jing-buy-stx-usdc-${BPS}`;
const RUNG_BAD = X ? "jing-sell-stx-usdc-30" : "jing-buy-stx-usdc-30";
const RID = `${DEP}.${RUNG}`, BID = `${DEP}.${RUNG_BAD}`;
const SIDE_STR = X ? "sel-band" : "buy-band";
const TPL = X ? N.sellTpl : N.buyTpl;
const U = 1000;
const u = (n) => uintCV(n * U);
const MIN1 = 5000 * U;
const balOf = (who) => balanceExpr(MODE, who);
const orderOf = `(contract-call? '${MARKET} ${X ? "get-token-x-order" : "get-token-y-order"} '${RID})`;
const guardName = X ? "floor" : "cap";

const plan = [];
const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
function deploy(sender, name, code) {
  b.withSender(sender).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 });
  plan.push({ kind: "deploy", label: `deploy ${name}` });
}
function call(label, sender, cid, fn, args, expect) {
  if (fn === "withdraw") args = [...args, noneCV()];
  b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label, expect });
}
function evalc(label, code, capture, cid = RID) { b.addEvalCode(cid, code); plan.push({ kind: "eval", label, capture }); }
function stxSend(label, from, to, ustx) { b.withSender(from).addSTXTransfer({ recipient: to, amount: ustx }); plan.push({ kind: "tx", label, expect: "(ok true)" }); }
const usdcxSend = (label, from, to, amt) => call(label, from, USDCX, "transfer", [uintCV(amt), standardPrincipalCV(from), P_(to), noneCV()], "(ok true)");

// ---- 1. the v6 stack: ladder, market, verify + initialize by the live core owner ----
deploy(DEP, N.ladder, src(N.ladder)); // before the market: it asks the ladder who holds a band seat
deploy(DEP, N.market, src(N.market));
call("market set-operator -> core owner", DEP, MARKET, "set-operator", [P_(CORE_OWNER)], "(ok true)");
call("core-v6 (live, owner = multisig) verifies the market", CORE_OWNER, CORE, "set-verified-contract", [P_(MARKET)], (s) => s.startsWith("(ok"));
call("initialize (token-stx / usdcx, min 1 STX / 1 USDCx, feeds 45 / 7)", CORE_OWNER, MARKET, "initialize",
  [P_(MARKET), traits.x, traits.y, uintCV(MIN.x), uintCV(MIN.y), uintCV(45), uintCV(7)], "(ok true)");
call("market set-operator -> DEP", CORE_OWNER, MARKET, "set-operator", [P_(DEP)], "(ok true)");

// ---- 2. ladder + rung, hash-gated register ----
deploy(DEP, RUNG, src(TPL));
deploy(DEP, RUNG_BAD, src(TPL));
call("initialize before canonical -> ERR_NOT_VERIFIED u6003", DEP, RID, "initialize", [uintCV(BPS), trueCV()], "(err u6003)");
call("set-canonical by stranger -> u6001", STRANGER, LADDER, "set-canonical", [stringAsciiCV(SIDE_STR), P_(RID)], "(err u6001)");
call("set-canonical on an unknown side -> u6007", DEP, LADDER, "set-canonical", [stringAsciiCV("buy-xyz"), P_(RID)], "(err u6007)");
call(`set-canonical ${SIDE_STR} (owner) -> ok`, DEP, LADDER, "set-canonical", [stringAsciiCV(SIDE_STR), P_(RID)], "(ok true)");
call("initialize by non-deployer -> u7001", STRANGER, RID, "initialize", [uintCV(BPS), trueCV()], "(err u7001)");
call("band: spread 10000 bps -> ERR_BAD_SPREAD u7010", DEP, BID, "initialize", [uintCV(10000), trueCV()], "(err u7010)");
call("initialize with a spread that does not match the name -> ERR_BAD_NAME u7009", DEP, BID, "initialize", [uintCV(BPS), trueCV()], "(err u7009)");
call(`initialize ${RUNG} -> ok (registers under ${SIDE_STR}, seated)`, DEP, RID, "initialize", [uintCV(BPS), trueCV()], "(ok true)");
call("initialize twice -> u7002", DEP, RID, "initialize", [uintCV(BPS), trueCV()], "(err u7002)");
evalc("min-market reads the market minimum", "(min-market)");
evalc(`ladder get-rung ${SIDE_STR} u${BPS}`, `(contract-call? '${LADDER} get-rung "${SIDE_STR}" u${BPS})`, "rung");
evalc("rung get-state", "(get-state)", "state0");
evalc(`band ${guardName} now (DIA STX/USD x ${X ? "0.8" : "1.2"})`, X ? "(current-floor)" : "(current-cap)", "guard");

// ---- 3. deposits: under the minimum is held, over is pushed ----
call("deposit below MIN_DEPOSIT -> u7005", A, RID, "deposit", [uintCV(1)], "(err u7005)");
call("A deposit 500 U (under market min) -> held", A, RID, "deposit", [u(500)], rungReceipt("deposit"));
evalc("state after 500: held 500, resting 0", "(get-state)");
call("A deposit 600 U -> 1100 pushed to market", A, RID, "deposit", [u(600)], rungReceipt("deposit"));
evalc("state after 1100: held 0, resting 1100", "(get-state)");
evalc(`market order for the rung (limit = band ${guardName}, spread-bps (some u${BPS}))`, orderOf, "order");

// ---- 4. operator raises the market minimum to 5000 U: the rung must follow ----
call("operator set-min to 5000 U", DEP, MARKET, X ? "set-min-token-x-deposit" : "set-min-token-y-deposit", [uintCV(MIN1)], "(ok true)");
evalc("min-market now 5000 U", "(min-market)");
call("A deposit 1000 U with min 5000: to-push 1000 < 5000 -> HELD", A, RID, "deposit", [u(1000)], rungReceipt("deposit"));
evalc("state: held 1000, resting 1100", "(get-state)");
call("A deposit 4000 U -> 5000 pushed, resting 6100", A, RID, "deposit", [u(4000)], rungReceipt("deposit"));
evalc("state: held 0, resting 6100", "(get-state)");

// ---- 5. withdraws: partial keeps >= min on market, else whole-cancel + hold ----
call("withdraw 0 -> u7004", A, RID, "withdraw", [uintCV(0)], "(err u7004)");
call("stranger withdraw -> u7006", STRANGER, RID, "withdraw", [u(1)], "(err u7006)");
call("A withdraw 500 U: 6100-500=5600 >= 5000 -> partial withdraw-token", A, RID, "withdraw", [u(500)], rungReceipt("withdraw"));
evalc("state: held 0, resting 5600", "(get-state)");
call("A withdraw 1000 U: 5600-1000=4600 < 5000 -> whole cancel, 4600 held", A, RID, "withdraw", [u(1000)], rungReceipt("withdraw"));
evalc("state: held 4600, resting 0", "(get-state)");
evalc("A position: 4600 U unsold", `(get-position '${A})`);

// ---- 6. second member; shares; full exits ----
if (X) stxSend("fund fresh B with 2 STX", A, B, 2000 * U);
else usdcxSend("fund fresh B with 2 USDCx", A, B, 2000 * U);
call("B deposit 2000 U -> 6600 pushed", B, RID, "deposit", [u(2000)], rungReceipt("deposit"));
evalc("state: held 0, resting 6600 U", "(get-state)");
evalc("B position 2000 U", `(get-position '${B})`);
evalc("A before exit", balOf(A), "A0");
call("A withdraw everything (999999 U): 6600-4600=2000 < 5000 -> whole cancel, pays 4600, holds 2000", A, RID, "withdraw", [u(999999)], rungReceipt("withdraw"));
evalc("A after exit", balOf(A), "A1");
evalc("state: held 2000 U, resting 0", "(get-state)");
evalc("A position gone", `(get-position '${A})`);
call("A withdraw again -> u7006", A, RID, "withdraw", [u(1)], "(err u7006)");

// ---- 7. proceeds: gift the other asset, claim ----
if (X) usdcxSend("gift 10 USDCx (the x rung's proceeds asset) to the rung", USDCX_WHALES[0], RID, 10_000_000);
else stxSend("gift 10 STX (the y rung's proceeds asset) to the rung", STX_WHALES[1], RID, 10_000_000);
call("sync (anyone) folds the gift as proceeds", STRANGER, RID, "sync", [], "(ok true)");
evalc("B position: proceeds = whole gift", `(get-position '${B})`, "Bpos");
evalc("B proceeds-asset balance before claim", balanceExpr(X ? "y" : "x", B), "B0");
call("B claim -> ok", B, RID, "claim", [], null);
evalc("B proceeds-asset balance after claim", balanceExpr(X ? "y" : "x", B), "B1");
evalc("B position after claim: proceeds 0", `(get-position '${B})`);
call("B withdraw 2000 U (from held) -> ok", B, RID, "withdraw", [u(2000)], rungReceipt("withdraw"));
evalc("state: empty pool, shares 0", "(get-state)", "stateEnd");
evalc("rung resting-asset balance 0", balOf(RID), "rungBal");

// ---- run + verify ----
function decodeTx(s) { const r = s?.Result?.Transaction; if (!r) return { ok: false, str: "<no tx result>" }; if ("Err" in r) return { ok: false, str: `ENGINE-ERR: ${r.Err}` }; if (r.Ok?.vm_error) return { ok: false, str: `VM-ERR: ${r.Ok.vm_error}` }; try { return { ok: true, str: cvToString(deserializeCV(r.Ok.result)) }; } catch (e) { return { ok: false, str: `decode-failed: ${e.message}` }; } }
function decodeEval(s) { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `ERR: ${r.Err}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } }
const uintFromOk = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");
async function main() {
  console.log(`=== v6 rungs keyless STX/USDCx RUNG=${MODE} (${RUNG}) ===\n`);
  const sessionId = await b.run();
  console.log(`https://stxer.xyz/simulations/mainnet/${sessionId}\n`);
  const res = await getSimulationResult(sessionId);
  const steps = res.steps; const captured = {}; let pass = 0, fail = 0;
  plan.forEach((p, i) => {
    const s = steps[i];
    if (p.kind === "deploy") { const t = s?.Result?.Transaction; const ok = !!t && !("Err" in t) && !t.Ok?.vm_error; const why = t?.Ok?.vm_error || t?.Err; console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}${ok ? "" : `  ${JSON.stringify(why)}`}`); ok ? pass++ : fail++; }
    else if (p.kind === "tx") { const d = decodeTx(s); const ok = p.expect === null ? d.ok : (typeof p.expect === "function" ? p.expect(d.str) : d.str === p.expect); console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${d.str}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++; }
    else { const v = decodeEval(s); if (p.capture) captured[p.capture] = v; console.log(`ℹ️  [${i}] ${p.label}: ${v}`); }
  });
  const check = (label, ok, detail = "") => { console.log(`${ok ? "✅" : "❌"} ${label}${detail ? `: ${detail}` : ""}`); ok ? pass++ : fail++; };
  if (captured.A0 && captured.A1) { const d = uintFromOk(captured.A1) - uintFromOk(captured.A0); check(`A exit delta ${d} (expected ${4600 * U})`, d === BigInt(4600 * U)); }
  check("ladder knows the rung under its key", (captured.rung || "").includes(RUNG), captured.rung);
  const ord = captured.order || "", g = uintFromOk(captured.guard);
  check(`market order carries spread-bps (some u${BPS})`, ord.includes(`(spread-bps (some u${BPS}))`), ord);
  check(`market order limit is the band ${guardName} u${g} (> 0: DIA fresh)`, g > 0n && ord.includes(`(limit u${g})`), ord);
  check(`rung state shows spread-bps u${BPS} and ${guardName} u0 before the first push`, (captured.state0 || "").includes(`(spread-bps u${BPS})`) && (captured.state0 || "").includes(`(${guardName} u0)`), captured.state0);
  const gift = 10_000_000n, got = uintFromOk(captured.B1) - uintFromOk(captured.B0);
  check(`B claim paid the gift (${got}, gift ${gift}: B is the only member)`, got > 0n && got <= gift && got >= gift - 1n, `${got}`);
  check("pool empty at the end (total-shares u0)", (captured.stateEnd || "").includes("(total-shares u0)"), captured.stateEnd);
  check("rung holds none of its resting asset at the end", uintFromOk(captured.rungBal) === 0n, captured.rungBal);
  console.log(`\n${pass}/${pass + fail} checks green\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
