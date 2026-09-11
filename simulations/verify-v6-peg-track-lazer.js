// verify-v6-peg-track-lazer.js
// A peg follows a REAL mid move. Two signed Lazer updates (PYTH_API_KEY),
// fetched WAIT seconds apart (default 75), drive four taker swaps in one
// stxer fork: with update A the walk fills the peg rungs at mid_A +/- spread,
// with update B at mid_B +/- spread. The match logs carry the two prices, each
// exactly its own mid times the spread, and token-*-limit-at reads the same
// two prices at the two mids. Nothing about the pegs changes between the
// swaps: only the print does. ONE sim-only patch: MAX_STALENESS widened so
// update A is still accepted after the wait (signatures stay real).
// If the two prints happen to be identical (a flat second), the run still
// proves the arithmetic and says so instead of failing.
// Run: PYTH_API_KEY=<key> [WAIT=75] npx tsx simulations/verify-v6-peg-track-lazer.js
import fs from "node:fs";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, trueCV, falseCV,
  noneCV, someCV, deserializeCV, cvToString, hexToCV,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v5", MKT = "markets-sbtc-stx-jing-v6";
const CORE_ID = `${DEP}.${CORE}`, MARKET = `${DEP}.${MKT}`, LADDER = `${DEP}.jing-ladder`;
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"), wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2"; // sBTC whale: buy-rung member
const S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";  // STX whale: sell-rung member
const B = "SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q";  // taker both ways
const PP = 100_000_000n, PPDF = PP * 100n, BPS = 20n;
const WAIT = Number(process.env.WAIT ?? 75);
const src = (f) => fs.readFileSync(`./contracts/${f}.clar`, "utf8");
const centsName = (c) => { const w = c / 100n, f = c % 100n; return `${w}-${f < 10n ? "0" : ""}${f}`; };
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const prints = (step) => (step?.Result?.Transaction?.Ok?.events || []).map((e) => { try { const o = typeof e === "string" ? JSON.parse(e) : e; const raw = o.contract_event?.raw_value; return raw ? cvToString(hexToCV(raw)) : ""; } catch { return ""; } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`=== v6 peg tracks a real mid move (two Lazer prints ${WAIT}s apart) ===`);
  const lzA = await fetchLazerUpdate();
  console.log(`update A at ${new Date(lzA.ts * 1000).toISOString()}; waiting ${WAIT}s for a different print...`);
  await sleep(WAIT * 1000);
  const lzB = await fetchLazerUpdate();
  const UPD_A = bufferCV(Buffer.from(lzA.hex, "hex")), UPD_B = bufferCV(Buffer.from(lzB.hex, "hex"));
  const MID_A = (lzA.px * PP) / lzA.py, MID_B = (lzB.px * PP) / lzB.py;
  const PA = (m) => (m * (10000n + BPS)) / 10000n, PB = (m) => (m * (10000n - BPS)) / 10000n;
  const moved = MID_A !== MID_B;
  console.log(`update B at ${new Date(lzB.ts * 1000).toISOString()}; mid A ${MID_A}, mid B ${MID_B} (${moved ? "moved" : "IDENTICAL: flat second, arithmetic still proven"})`);
  // guards well inside the band for both mids
  const BUY_C = (10n ** 18n) / ((MID_A * 90n) / 100n), SELL_C = (10n ** 18n) / ((MID_A * 110n) / 100n);
  const BUY_RUNG = `jing-buy-stx-spread-${BPS}-floor-${centsName(BUY_C)}`, SELL_RUNG = `jing-sell-stx-spread-${BPS}-cap-${centsName(SELL_C)}`;
  const rid = (n) => `${DEP}.${n}`;

  let mktSrc = src(MKT);
  if (!mktSrc.includes("(define-constant MAX_STALENESS u80)")) throw new Error("MAX_STALENESS anchor missing");
  mktSrc = mktSrc.replace("(define-constant MAX_STALENESS u80)", "(define-constant MAX_STALENESS u999999999)");

  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const swap = (sender, amount, limit, upd, depX) => call(sender, "swap", [uintCV(amount), uintCV(limit), upd, sbtcT, sbtcA, wstxT, wstxA, depX ? trueCV() : falseCV()]);

  deploy(CORE, src(CORE)); deploy(MKT, mktSrc);
  tx("core-v5 verifies v6", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(ok true)");
  tx("v6 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)");
  deploy("jing-ladder", src("jing-ladder")); deploy(BUY_RUNG, src("jing-buy-stx-market-spread")); deploy(SELL_RUNG, src("jing-sell-stx-market-spread"));
  tx("canonical buy-peg", call(DEP, "set-canonical", [stringAsciiCV("buy-peg"), contractPrincipalCV(DEP, BUY_RUNG)], LADDER), "(ok true)");
  tx("canonical sell-peg", call(DEP, "set-canonical", [stringAsciiCV("sell-peg"), contractPrincipalCV(DEP, SELL_RUNG)], LADDER), "(ok true)");
  tx(`init ${BUY_RUNG}`, call(DEP, "initialize", [uintCV(BPS), uintCV(BUY_C)], rid(BUY_RUNG)), "(ok true)");
  tx(`init ${SELL_RUNG}`, call(DEP, "initialize", [uintCV(BPS), uintCV(SELL_C)], rid(SELL_RUNG)), "(ok true)");

  tx("T0 A deposits 20000 sats into the buy rung (y empty: no price read)", call(A, "deposit", [uintCV(20000), UPD_A], rid(BUY_RUNG)), "(ok true)");
  tx("T0 S deposits 60 STX into the sell rung (x rests: price A read)", call(S, "deposit", [uintCV(60_000_000), UPD_A], rid(SELL_RUNG)), "(ok true)");
  ev(`T1 buy rung limit-at mid A = ${PA(MID_A)}`, `(token-x-limit-at '${rid(BUY_RUNG)} u${MID_A})`, `u${PA(MID_A)}`);
  ev(`T1 buy rung limit-at mid B = ${PA(MID_B)}`, `(token-x-limit-at '${rid(BUY_RUNG)} u${MID_B})`, `u${PA(MID_B)}`);
  ev(`T1 sell rung limit-at mid A = ${PB(MID_A)}`, `(token-y-limit-at '${rid(SELL_RUNG)} u${MID_A})`, `u${PB(MID_A)}`);
  ev(`T1 sell rung limit-at mid B = ${PB(MID_B)}`, `(token-y-limit-at '${rid(SELL_RUNG)} u${MID_B})`, `u${PB(MID_B)}`);
  // four swaps, 1000 sats each way, first on print A then on print B
  const xa = tx("T2 B sells STX on print A: walks the buy rung at mid_A + 20 bps", swap(B, (1000n * PA(MID_A)) / PPDF + 200_000n, (MID_A * 103n) / 100n, UPD_A, false), (v) => String(v).startsWith("(ok"));
  const ya = tx("T2 B sells 1000 sats on print A: walks the sell rung at mid_A - 20 bps", swap(B, 1003n, (MID_A * 97n) / 100n, UPD_A, true), (v) => String(v).startsWith("(ok"));
  ev("T2 settlement of cycle u0 at mid A", "(get price (unwrap-panic (get-settlement u0)))", `u${MID_A}`);
  const xb = tx("T3 B sells STX on print B: walks the buy rung at mid_B + 20 bps", swap(B, (1000n * PA(MID_B)) / PPDF + 200_000n, (MID_B * 103n) / 100n, UPD_B, false), (v) => String(v).startsWith("(ok"));
  const yb = tx("T3 B sells 1000 sats on print B: walks the sell rung at mid_B - 20 bps", swap(B, 1003n, (MID_B * 97n) / 100n, UPD_B, true), (v) => String(v).startsWith("(ok"));
  ev("T3 settlement of cycle u2 at mid B", "(get price (unwrap-panic (get-settlement u2)))", `u${MID_B}`);
  ev("T4 both rungs still resting (partial fills, rolled four times)", "(get-current-cycle)", "u4");
  ev("T4 buy rung still pegged (some u20)", `(get-token-x-order '${rid(BUY_RUNG)})`, (v) => v.includes(`(spread-bps (some u${BPS}))`));

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; check(st.label, st.raw, st.want); }
  const m = (st) => prints(s[st.idx]).filter((p) => p.includes('(event "match")')).map((p) => (p.match(/\(price u(\d+)\)/) || [])[1]).join(",");
  check(`T2 buy-side fill at exactly mid_A + 20 bps (${PA(MID_A)})`, m(xa), String(PA(MID_A)));
  check(`T2 sell-side fill at exactly mid_A - 20 bps (${PB(MID_A)})`, m(ya), String(PB(MID_A)));
  check(`T3 buy-side fill at exactly mid_B + 20 bps (${PA(MID_B)})`, m(xb), String(PA(MID_B)));
  check(`T3 sell-side fill at exactly mid_B - 20 bps (${PB(MID_B)})`, m(yb), String(PB(MID_B)));
  if (moved) check(`T5 the print moved and the pegged prices moved with it (${PA(MID_A)} -> ${PA(MID_B)})`, m(xa) !== m(xb) && m(ya) !== m(yb), (v) => v === true);
  else console.log("  note the two prints were identical this run; rerun with a longer WAIT to see the prices move");
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
