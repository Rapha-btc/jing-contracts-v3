// verify-v6-rungs-fill-lazer.js
// The FIXED rungs on markets-sbtc-stx-jing-v6 with a real fill (PYTH_API_KEY):
// the keyless harness never fills. Deploys the v6 stack + ladder + one fixed
// rung per side priced just outside mid (buy rung asks 1% over, sell rung
// bids 1% under), a taker walks each, the rung's sync folds the fill in,
// the member claims and the balance moves by the claimed amount. Also the
// settlement roll of the other rung (a fixed order outside mid rolls with
// its own limit in the event).
// Run: PYTH_API_KEY=<key> npx tsx simulations/verify-v6-rungs-fill-lazer.js
import fs from "node:fs";
import { ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, trueCV, falseCV, deserializeCV, cvToString, hexToCV } from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v5", MKT = "markets-sbtc-stx-jing-v6";
const CORE_ID = `${DEP}.${CORE}`, MARKET = `${DEP}.${MKT}`, LADDER = `${DEP}.jing-ladder`;
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"), wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2", S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51", B = "SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q";
const PP = 100_000_000n, SCALE = 1_000_000_000_000n;
const src = (f) => fs.readFileSync(`./contracts/${f}.clar`, "utf8");
const centsName = (c) => { const w = c / 100n, f = c % 100n; return `${w}-${f < 10n ? "0" : ""}${f}`; };
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|\\(some u\\d+\\))\\)`)) || [])[1];
const logsOf = (step) => (step?.Result?.Transaction?.Ok?.events || []).map((e) => { try { const o = typeof e === "string" ? JSON.parse(e) : e; const raw = o.contract_event?.raw_value; return raw ? cvToString(hexToCV(raw)) : ""; } catch { return ""; } });

async function main() {
  console.log("=== v6 fixed rungs, real fill ===");
  const full = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(full.hex, "hex"));
  const MID = (full.px * PP) / full.py;
  const BUY_C = (10n ** 18n) / ((MID * 101n) / 100n), SELL_C = (10n ** 18n) / ((MID * 99n) / 100n);
  const BUY_P = (10n ** 18n) / BUY_C, SELL_P = (10n ** 18n) / SELL_C;
  const BUY = `jing-buy-stx-${centsName(BUY_C)}`, SELL = `jing-sell-stx-${centsName(SELL_C)}`;
  const rid = (n) => `${DEP}.${n}`;
  console.log(`mid ${MID} (1 STX ~ ${(10n ** 16n) / MID} sats); ${BUY} asks p ${BUY_P}; ${SELL} bids p ${SELL_P}`);
  const steps = []; let b = SimulationBuilder.new();
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const swap = (sender, amount, limit, depX) => call(sender, "swap", [uintCV(amount), uintCV(limit), UPD, sbtcT, sbtcA, wstxT, wstxA, depX ? trueCV() : falseCV()]);

  deploy(CORE, src(CORE)); deploy(MKT, src(MKT));
  tx("core-v5 verifies v6", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(ok true)");
  tx("v6 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)");
  deploy("jing-ladder", src("jing-ladder")); deploy(BUY, src("jing-buy-stx")); deploy(SELL, src("jing-sell-stx"));
  tx("canonical buy-stx", call(DEP, "set-canonical", [stringAsciiCV("buy-stx"), contractPrincipalCV(DEP, BUY)], LADDER), "(ok true)");
  tx("canonical sell-stx", call(DEP, "set-canonical", [stringAsciiCV("sell-stx"), contractPrincipalCV(DEP, SELL)], LADDER), "(ok true)");
  tx(`init ${BUY}`, call(DEP, "initialize", [uintCV(BUY_C)], rid(BUY)), "(ok true)");
  tx(`init ${SELL}`, call(DEP, "initialize", [uintCV(SELL_C)], rid(SELL)), "(ok true)");

  // F1 both rungs rest: fixed orders on v6 carry spread-bps none
  tx("F1 A deposits 20000 sats into the buy rung", call(A, "deposit", [uintCV(20000), UPD], rid(BUY)), "(ok true)");
  tx("F1 S deposits 60 STX into the sell rung (x side rests: price read)", call(S, "deposit", [uintCV(60_000_000), UPD], rid(SELL)), "(ok true)");
  ev("F1 buy rung order: fixed at its price", `(get-token-x-order '${rid(BUY)})`, (v) => field(v, "limit") === `u${BUY_P}` && field(v, "spread-bps") === "none");
  ev("F1 sell rung order: fixed at its price", `(get-token-y-order '${rid(SELL)})`, (v) => field(v, "limit") === `u${SELL_P}` && field(v, "spread-bps") === "none");

  // F2 taker sells STX: walks the buy rung's ask at its price; the sell rung's bid (under mid) rolls
  const a0 = ev("F2 A STX before", `(stx-get-balance '${A})`, () => true);
  const fillX = tx("F2 B sells 30 STX (swap, 3% limit)", swap(B, 30_000_000, (MID * 103n) / 100n, false), (v) => String(v).startsWith("(ok"));
  tx("F2 buy rung sync", call(B, "sync", [], rid(BUY)), "(ok true)");
  ev("F2 buy rung: unfilled-index dropped", "(get-state)", (v) => uintOf(field(v, "unfilled-index")) < SCALE, rid(BUY));
  const posA = ev("F2 buy rung: A has STX proceeds", `(get-position '${A})`, (v) => uintOf(field(v, "stx")) > 0n, rid(BUY));
  tx("F2 A claims", call(A, "claim", [], rid(BUY)), (v) => String(v).startsWith("(ok"));
  const a1 = ev("F2 A STX after", `(stx-get-balance '${A})`, () => true);
  tx("F2 sell rung sync (rolled, not filled)", call(B, "sync", [], rid(SELL)), "(ok true)");
  ev("F2 sell rung: untouched", "(get-state)", (v) => field(v, "unfilled-index") === `u${SCALE}`, rid(SELL));

  // F3 taker sells sBTC: walks the sell rung's bid
  const s0 = ev("F3 S sBTC before", `(contract-call? '${SBTC} get-balance '${S})`, () => true);
  const fillY = tx("F3 B sells 15000 sats (swap, 3% limit)", swap(B, 15000, (MID * 97n) / 100n, true), (v) => String(v).startsWith("(ok"));
  tx("F3 sell rung sync", call(B, "sync", [], rid(SELL)), "(ok true)");
  ev("F3 sell rung: unfilled-index dropped", "(get-state)", (v) => uintOf(field(v, "unfilled-index")) < SCALE, rid(SELL));
  const posS = ev("F3 sell rung: S has sats proceeds", `(get-position '${S})`, (v) => uintOf(field(v, "sbtc")) > 0n, rid(SELL));
  tx("F3 S claims", call(S, "claim", [], rid(SELL)), (v) => String(v).startsWith("(ok"));
  const s1 = ev("F3 S sBTC after", `(contract-call? '${SBTC} get-balance '${S})`, () => true);
  // F4 exits: what is left comes back
  tx("F4 A withdraws everything", call(A, "withdraw", [uintCV(999_999_999)], rid(BUY)), "(ok true)");
  tx("F4 S withdraws everything", call(S, "withdraw", [uintCV(999_999_999_999n)], rid(SELL)), "(ok true)");
  ev("F4 buy rung empty", "(get-state)", (v) => field(v, "total-shares") === "u0", rid(BUY));
  ev("F4 sell rung empty", "(get-state)", (v) => field(v, "total-shares") === "u0", rid(SELL));

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; check(st.label, st.raw, st.want); }
  const mx = logsOf(s[fillX.idx]).filter((r) => r.includes('(event "match")')).map((r) => (r.match(/\(price u(\d+)\)/) || [])[1]);
  const my = logsOf(s[fillY.idx]).filter((r) => r.includes('(event "match")')).map((r) => (r.match(/\(price u(\d+)\)/) || [])[1]);
  check(`F2 match at the buy rung's fixed price (${BUY_P})`, mx.join(","), (v) => mx.length === 1 && mx[0] === String(BUY_P));
  check(`F3 match at the sell rung's fixed price (${SELL_P})`, my.join(","), (v) => my.length === 1 && my[0] === String(SELL_P));
  const rollY = logsOf(s[fillX.idx]).filter((r) => r.includes('(event "limit-roll-y")') && r.includes(SELL)).map((r) => (r.match(/\(limit u(\d+)\)/) || [])[1]);
  check(`F2 the sell rung's bid rolled with its own limit (${SELL_P})`, rollY.join(","), (v) => v === String(SELL_P));
  const dA = uintOf(a1.raw) - uintOf(a0.raw), pA = uintOf(field(posA.raw, "stx"));
  check(`F2 A's STX grew by the position's proceeds (${pA}, minus fees)`, dA, (d) => d > 0n && d <= pA && d >= pA - 1_000_000n);
  const dS = uintOf(s1.raw) - uintOf(s0.raw), pS = uintOf(field(posS.raw, "sbtc"));
  check(`F3 S's sats grew by exactly the position's proceeds (${pS})`, dS, (d) => d === pS);
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
