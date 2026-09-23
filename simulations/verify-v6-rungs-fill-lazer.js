import { rungReceipt } from "./_rung-receipt.js";
// verify-v6-rungs-fill-lazer.js
// The FIXED rungs on markets-sbtc-stx-jing-v6-3 with a real fill (keyless signed Lazer):
// the keyless harness never fills. Deploys the v6 stack + ladder + one fixed
// rung per side priced just outside mid (buy rung asks 1% over, sell rung
// bids 1% under), a taker walks each, the rung's sync folds the fill in,
// the member claims and the balance moves by the claimed amount. Also the
// settlement roll of the other rung (a fixed order outside mid rolls with
// its own limit in the event).
// F5: the sell side SOLD OUT: three IN-RANGE sell rungs (fixed 1% over the
// mid, zero-spread peg, zero-spread band; 5 STX each) next to a deep direct
// bid, one sBTC seller clears the three whole in the batch at the mid (a
// walked y maker keeps rounding dust, a batch-cleared one does not); each
// rung's sync closes its epoch, the member claims from the closed epoch.
// Run: node simulations/verify-v6-rungs-fill-lazer.js
import { runCurrentPlan, FRESH_UPDATE } from "./_v6-submit-settle.js";
import fs from "node:fs";
import { ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, trueCV, falseCV, noneCV, standardPrincipalCV, getAddressFromPrivateKey, deserializeCV, cvToString, hexToCV } from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import { fetchLazerUpdateAny as fetchLazerUpdate } from "./_lazer.js";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v6", MKT = "markets-sbtc-stx-jing-v6-3";
const CORE_ID = `${DEP}.${CORE}`, MARKET = `${DEP}.${MKT}`, LADDER = `${DEP}.jing-ladder-v1`;
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"), wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2", S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51", B = getAddressFromPrivateKey("782".repeat(22).slice(0,64)+"01", "mainnet");
const PP = 100_000_000n, SCALE = 1_000_000_000_000n;
// comment-only lines stripped before deploying: the v6 market crossed the
// 100,000-byte deploy limit with its comments (2026-09-15); the deploy form
// is comment-free anyway, same strip as verify-markets-v6-gaps.js
const stripComments = (t) => t.split("\n").filter((l) => !/^\s*;;/.test(l)).join("\n");
const src = (f) => stripComments(fs.readFileSync(`./contracts/${f}.clar`, "utf8"));
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
  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: fn === "withdraw" ? [...args, noneCV()] : args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const swap = (sender, amount, limit, depX) => call(sender, "swap", [uintCV(amount), uintCV(limit), UPD, sbtcT, sbtcA, wstxT, wstxA, depX ? trueCV() : falseCV()]);

  deploy(CORE, src(CORE)); deploy("jing-ladder-v1", src("jing-ladder-v1")); deploy(MKT, src(MKT));
  tx("core-v6 verifies v6", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(ok true)");
  tx("v6 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)"); deploy(BUY, src("jing-buy-stx")); deploy(SELL, src("jing-sell-stx"));
  tx("canonical buy-stx", call(DEP, "set-canonical", [stringAsciiCV("buy-stx"), contractPrincipalCV(DEP, BUY)], LADDER), "(ok true)");
  tx("canonical sell-stx", call(DEP, "set-canonical", [stringAsciiCV("sell-stx"), contractPrincipalCV(DEP, SELL)], LADDER), "(ok true)");
  tx(`init ${BUY}`, call(DEP, "initialize", [uintCV(BUY_C)], rid(BUY)), "(ok true)");
  tx(`init ${SELL}`, call(DEP, "initialize", [uintCV(SELL_C)], rid(SELL)), "(ok true)");

  tx("fund fresh taker sBTC", call(A, "transfer", [uintCV(100000), standardPrincipalCV(A), standardPrincipalCV(B), noneCV()], SBTC), "(ok true)");
  tx("fund fresh taker STX", bb=>bb.withSender(S).addSTXTransfer({recipient:B,amount:100000000}), "(ok true)");
  // F1 both rungs rest: fixed orders on v6 carry spread-bps none
  tx("F1 A deposits 20000 sats into the buy rung", call(A, "deposit", [uintCV(20000)], rid(BUY)), rungReceipt("deposit"));
  tx("F1 S deposits 60 STX into the sell rung (x side rests: price read)", call(S, "deposit", [uintCV(60_000_000)], rid(SELL)), rungReceipt("deposit"));
  tx("F1 settle sell rung escrow with a newer signed print", call(B, "settle-token-y-deposit", [contractPrincipalCV(DEP, SELL), FRESH_UPDATE, wstxT, wstxA]), "(ok u60000000)");
  ev("F1 sell pending cleared", `(get-token-y-pending-deposit '${rid(SELL)})`, "none");
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
  tx("F4 A withdraws everything", call(A, "withdraw", [uintCV(999_999_999)], rid(BUY)), rungReceipt("withdraw"));
  tx("F4 S withdraws everything", call(S, "withdraw", [uintCV(999_999_999_999n)], rid(SELL)), rungReceipt("withdraw"));
  ev("F4 buy rung empty", "(get-state)", (v) => field(v, "total-shares") === "u0", rid(BUY));
  ev("F4 sell rung empty", "(get-state)", (v) => field(v, "total-shares") === "u0", rid(SELL));

  // F5 the sell side SOLD OUT: a walked y maker keeps rounding dust (its STX is derived from the
  // taker's sats), so a rung is only sold out when the BATCH clears it: three IN-RANGE sell rungs
  // (a fixed bid 1% over the mid, a zero-spread peg, a zero-spread band rung; 5 STX each) next to a
  // deep direct bid; one sBTC seller clears the three whole at the mid and walks the deep bid for
  // the rest. Each rung's market position is u0 with nothing refunded, its next sync closes the
  // epoch, the member claims from the closed epoch (paid in full, position gone), a withdraw is u7006.
  const SELLF_C = (10n ** 18n) / ((MID * 101n) / 100n); // fixed sell rung bidding 1% OVER the mid: in range
  const SELLP_C = (10n ** 18n) / ((MID * 110n) / 100n); // cap over the pegged bid: in band
  const SELLF = `jing-sell-stx-${centsName(SELLF_C)}`, SELLP = `jing-sell-stx-spread-0-cap-${centsName(SELLP_C)}`, SELLB = "jing-sell-stx-spread-0";
  deploy(SELLF, src("jing-sell-stx")); deploy(SELLP, src("jing-sell-stx-market-spread")); deploy(SELLB, src("jing-sell-stx-core-spread"));
  tx("canonical sell-peg", call(DEP, "set-canonical", [stringAsciiCV("sell-peg"), contractPrincipalCV(DEP, SELLP)], LADDER), "(ok true)");
  tx("canonical sel-band", call(DEP, "set-canonical", [stringAsciiCV("sel-band"), contractPrincipalCV(DEP, SELLB)], LADDER), "(ok true)");
  tx(`init ${SELLF} (a second fixed sell rung, same canonical hash)`, call(DEP, "initialize", [uintCV(SELLF_C)], rid(SELLF)), "(ok true)");
  tx(`init ${SELLP} (spread 0: pegged at the mid)`, call(DEP, "initialize", [uintCV(0), uintCV(SELLP_C)], rid(SELLP)), "(ok true)");
  tx(`init ${SELLB} (spread 0, seated)`, call(DEP, "initialize", [uintCV(0), trueCV()], rid(SELLB)), "(ok true)");
  const STX5 = 5_000_000;
  tx("F5 S deposits 5 STX into the in-range fixed sell rung (x side empty: no crossing)", call(S, "deposit", [uintCV(STX5)], rid(SELLF)), rungReceipt("deposit"));
  tx("F5 S deposits 5 STX into the zero-spread sell peg rung", call(S, "deposit", [uintCV(STX5)], rid(SELLP)), rungReceipt("deposit"));
  tx("F5 S deposits 5 STX into the zero-spread sell band rung (cap from the miner band)", call(S, "deposit", [uintCV(STX5)], rid(SELLB)), rungReceipt("deposit"));
  for (const r of [SELLF, SELLP, SELLB]) ev(`F5 ${r} resting 5 STX`, "(get-state)", (v) => field(v, "resting") === `u${STX5}` && field(v, "held-ustx") === "u0", rid(r));
  tx("F5 S rests a deep direct bid: 100 STX at -2%", call(S, "deposit-token-y", [uintCV(100_000_000), uintCV((MID * 98n) / 100n), noneCV(), wstxT, wstxA]), "(ok u100000000)");
  const SATS_25_STX = (25n * 10n ** 16n) / MID; // ~25 STX worth of sats: the three rungs (15 STX) cleared whole at the mid, the rest walks the deep bid
  const fill5 = tx(`F5 B sells ${SATS_25_STX} sats (~25 STX) at -3%: the batch clears the three rungs at the mid, the walk takes part of the deep bid`, swap(B, Number(SATS_25_STX), (MID * 97n) / 100n, true), (v) => String(v).startsWith("(ok"));
  for (const r of [SELLF, SELLP, SELLB]) ev(`F5 ${r} market position u0`, `(get-token-y-deposit (get-current-cycle) '${rid(r)})`, "u0");
  ev("F5 the deep bid was walked (under 100 STX, above 0)", `(get-token-y-deposit (get-current-cycle) '${S})`, (v) => uintOf(v) > 0n && uintOf(v) < 100_000_000n);
  for (const r of [SELLF, SELLP, SELLB]) {
    tx(`F5 sync ${r}: sold out -> the epoch closes`, call(B, "sync", [], rid(r)), "(ok true)");
    ev(`F5 ${r} epoch 1, shares reset, nothing resting or held`, "(get-state)", (v) => field(v, "epoch") === "u1" && field(v, "total-shares") === "u0" && field(v, "resting") === "u0" && field(v, "held-ustx") === "u0", rid(r));
    ev(`F5 ${r} S's position: from the closed epoch, only sats owed`, `(get-position '${S})`, (v) => field(v, "stx") === "u0" && uintOf(field(v, "sbtc")) > 0n, rid(r));
    tx(`F5 S claims on ${r} (old epoch: paid in full, position gone)`, call(S, "claim", [], rid(r)), rungReceipt("claim"));
    ev(`F5 ${r} S's position gone`, `(get-position '${S})`, (v) => field(v, "shares") === "u0" && field(v, "sbtc") === "u0", rid(r));
    tx(`F5 S withdraws on ${r} -> u7006 (no position)`, call(S, "withdraw", [uintCV(1)], rid(r)), "(err u7006)");
  }
  tx("F5 S cancels the rest of the deep bid", call(S, "cancel-token-y-deposit", [wstxT, wstxA]), (v) => String(v).startsWith("(ok u"));

  const {sid, result:res} = await runCurrentPlan(b);
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const s = res.steps; let i = 0;
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
  const l5 = logsOf(s[fill5.idx]);
  check("F5 the walk matched one maker (the deep bid); the rungs were cleared in the batch, not walked", l5.filter((r) => r.includes('(event "match")')).length, (n) => n === 1);
  check("F5 three y makers cleared 5 STX whole in the batch (distribute-y-depositor, y-cleared u5000000)", l5.filter((r) => r.includes('(event "distribute-y-depositor")') && r.includes("(y-cleared u5000000)")).length, (n) => n === 3);
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
