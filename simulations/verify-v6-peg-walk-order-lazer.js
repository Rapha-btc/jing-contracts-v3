// verify-v6-peg-walk-order-lazer.js
// The taker walk over a MIXED resting book on markets-sbtc-stx-jing-v6:
// pegs at several spreads interleaved with fixed orders and one pooled peg
// rung, one real Lazer update (PYTH_API_KEY).
//   O1 ask side: pegs at +10 / +20 / +50 bps, fixed at +15 / +100 bps, a
//      buy-stx peg rung at +30 bps. A taker at +35 bps fills +10, +15, +20,
//      +30 in that order (price-ordered, pegs and fixed interleaved), the
//      +30 rung partially, and never touches +50 / +100. The match log
//      carries the four prices in order. The rung folds its fill.
//   O2 boundaries: a taker whose limit is 1 under the best ask fills nothing
//      (u1017, whole swap reverted); a taker whose limit is exactly the best
//      ask fills that ask only
//   O3 bid side mirror: pegs at -10 / -20 / -50 bps, fixed at -15 / -100,
//      a sell-stx peg rung at -30 bps; a taker selling sBTC at -35 bps fills
//      -10, -15, -20, -30 in that order; boundaries mirrored
// Run: PYTH_API_KEY=<key> npx tsx simulations/verify-v6-peg-walk-order-lazer.js
import fs from "node:fs";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV, trueCV, falseCV,
  noneCV, someCV, deserializeCV, cvToString, hexToCV, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v5", MKT = "markets-sbtc-stx-jing-v6";
const CORE_ID = `${DEP}.${CORE}`, MARKET = `${DEP}.${MKT}`, LADDER = `${DEP}.jing-ladder`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"), wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2"; // sBTC whale: rung member, funds sats
const S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";  // STX whale: rung member, funds STX
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + "01", "mainnet");
const PP = 100_000_000n, PPDF = PP * 100n, BPS = 10_000n, REB = 20n, SCALE = 1_000_000_000_000n;
const MIN_STX = 1_000_000n, MIN_SBTC = 1000n, HUGE = 999_999_999_999_999n, RUNG_BPS = 30n;
const src = (f) => fs.readFileSync(`./contracts/${f}.clar`, "utf8");
const centsName = (c) => { const w = c / 100n, f = c % 100n; return `${w}-${f < 10n ? "0" : ""}${f}`; };
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|\\(some u\\d+\\))\\)`)) || [])[1];
const prints = (step) => (step?.Result?.Transaction?.Ok?.events || []).map((e) => { try { const o = typeof e === "string" ? JSON.parse(e) : e; const raw = o.contract_event?.raw_value; return raw ? cvToString(hexToCV(raw)) : ""; } catch { return ""; } });
const grossFor = (net) => { let a = (net * BPS) / (BPS - REB); while (a - (a * REB) / BPS < net) a += 1n; return a; };
const ceilDiv = (a, b) => (a + b - 1n) / b;

async function main() {
  console.log("=== v6 pegged: price-ordered walk over a mixed book ===");
  const lz = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const MID = (lz.px * PP) / lz.py;
  const PB = (s) => (MID * (BPS - s)) / BPS, PA = (s) => (MID * (BPS + s)) / BPS;
  const centsOf = (p) => (10n ** 18n) / p, pOf = (c) => (10n ** 18n) / c;
  const BUY_C = centsOf((MID * 90n) / 100n), SELL_C = centsOf((MID * 110n) / 100n); // guards well inside the band
  const BUY_RUNG = `jing-buy-stx-spread-${RUNG_BPS}-floor-${centsName(BUY_C)}`, SELL_RUNG = `jing-sell-stx-spread-${RUNG_BPS}-cap-${centsName(SELL_C)}`;
  const rid = (n) => `${DEP}.${n}`;
  console.log(`mid ${MID}; asks +10 ${PA(10n)}, +15 ${PA(15n)}, +20 ${PA(20n)}, +30 ${PA(30n)}, +50 ${PA(50n)}, +100 ${PA(100n)}\n  ${BUY_RUNG} / ${SELL_RUNG}`);

  const M1 = mk(81), M2 = mk(82), M3 = mk(83), M4 = mk(84), M5 = mk(85), TS = mk(86), TS0 = mk(87);
  const N1 = mk(91), N2 = mk(92), N3 = mk(93), N4 = mk(94), N5 = mk(95), TX = mk(96), TX0 = mk(97);
  const M_AMT = 3000n, RUNG_X = 4000n, N_AMT = 5_000_000n, RUNG_Y = 60_000_000n;

  // ---- O2 sizing (asks): the exact-limit taker takes ~1000 sats of M1 ----
  const Y_EXACT = (1000n * PA(10n)) / PPDF + 200_000n;
  const X_M1_EXACT = (Y_EXACT * PPDF) / PA(10n); // sats M1 sells (x-from-y), the leftover STX is under the price of one sat
  const M1_LEFT = M_AMT - X_M1_EXACT;
  if (X_M1_EXACT >= M_AMT || Y_EXACT - (X_M1_EXACT * PA(10n)) / PPDF >= MIN_STX) throw new Error("O2 sizing");
  // ---- O1 sizing (asks): consume M1 rest, M3, M2 fully, then ~2000 sats of the rung ----
  const yFor = (x, p) => ceilDiv(x * p, PPDF);
  const Y_WALK = yFor(M1_LEFT, PA(10n)) + yFor(M_AMT, PA(15n)) + yFor(M_AMT, PA(20n)) + (2000n * PA(30n)) / PPDF + 100_000n;
  // ---- O3 sizing (bids): sats to consume N1 (-10), N3 (-15), N2 (-20) fully, then ~2000 sats of the sell rung ----
  const xFor = (y, p) => (y * PPDF) / p; // the maker's capacity in sats (x-from-y), what a taker must bring to empty it
  const X_EXACT = 1200n; // over the 1000-sat minimum, well under N1's ~1700-sat capacity
  if (X_EXACT >= xFor(N_AMT, PB(10n))) throw new Error("O3 sizing: the exact-limit taker must not empty N1");
  const X_WALK = xFor(N_AMT - (X_EXACT * PB(10n)) / PPDF, PB(10n)) + xFor(N_AMT, PB(15n)) + xFor(N_AMT, PB(20n)) + 2000n + 3n;
  if (X_WALK >= xFor(RUNG_Y, PB(30n)) + xFor(N_AMT, PB(10n)) * 3n) throw new Error("O3 sizing");

  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const sp = (s) => (s === null ? noneCV() : someCV(uintCV(s)));
  const depY = (who, amt, limit, spread) => call(who, "deposit-token-y", [uintCV(amt), uintCV(limit), sp(spread), UPD, wstxT, wstxA]);
  const depX = (who, amt, limit, spread) => call(who, "deposit-token-x", [uintCV(amt), uintCV(limit), sp(spread), UPD, sbtcT, sbtcA]);
  const swap = (who, amount, limit, depXSide) => call(who, "swap", [uintCV(amount), uintCV(limit), UPD, sbtcT, sbtcA, wstxT, wstxA, depXSide ? trueCV() : falseCV()]);
  const stxSend = (to, ustx) => (bb) => bb.withSender(S).addSTXTransfer({ recipient: to, amount: Number(ustx) });
  const satsSend = (to, sats) => call(A, "transfer", [uintCV(sats), standardPrincipalCV(A), standardPrincipalCV(to), noneCV()], SBTC);
  const depOfX = (who) => `(get-token-x-deposit (get-current-cycle) '${who})`, depOfY = (who) => `(get-token-y-deposit (get-current-cycle) '${who})`;

  deploy(CORE, src(CORE)); deploy(MKT, src(MKT));
  tx("core-v5 verifies v6", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(ok true)");
  tx("v6 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(MIN_SBTC), uintCV(MIN_STX), uintCV(1), uintCV(45)]), "(ok true)");
  deploy("jing-ladder", src("jing-ladder")); deploy(BUY_RUNG, src("jing-buy-stx-market-spread")); deploy(SELL_RUNG, src("jing-sell-stx-market-spread"));
  tx("canonical buy-peg", call(DEP, "set-canonical", [stringAsciiCV("buy-peg"), contractPrincipalCV(DEP, BUY_RUNG)], LADDER), "(ok true)");
  tx("canonical sell-peg", call(DEP, "set-canonical", [stringAsciiCV("sell-peg"), contractPrincipalCV(DEP, SELL_RUNG)], LADDER), "(ok true)");
  tx(`init ${BUY_RUNG}`, call(DEP, "initialize", [uintCV(RUNG_BPS), uintCV(BUY_C)], rid(BUY_RUNG)), "(ok true)");
  tx(`init ${SELL_RUNG}`, call(DEP, "initialize", [uintCV(RUNG_BPS), uintCV(SELL_C)], rid(SELL_RUNG)), "(ok true)");
  for (const [who, ustx, sats] of [
    [M1, 1_000_000n, 3100n], [M2, 1_000_000n, 3100n], [M3, 1_000_000n, 3100n], [M4, 1_000_000n, 3100n], [M5, 1_000_000n, 3100n],
    [TS, Y_WALK + 3_000_000n, 0n], [TS0, Y_EXACT + 4_000_000n, 0n],
    [N1, 6_000_000n, 0n], [N2, 6_000_000n, 0n], [N3, 6_000_000n, 0n], [N4, 6_000_000n, 0n], [N5, 6_000_000n, 0n],
    [TX, 1_000_000n, X_WALK + 200n], [TX0, 1_000_000n, X_EXACT * 2n + 200n],
  ]) { tx(`fund ${who.slice(0, 6)} stx`, stxSend(who, ustx), (v) => String(v).startsWith("(ok")); if (sats > 0n) tx(`fund ${who.slice(0, 6)} sats`, satsSend(who, sats), "(ok true)"); }

  // =============== O1/O2: ask side ===============
  tx("O1 M1 peg +10 bps, 3000", depX(M1, M_AMT, 1n, 10n), `(ok u${M_AMT})`);
  tx("O1 M2 peg +20 bps, 3000", depX(M2, M_AMT, 1n, 20n), `(ok u${M_AMT})`);
  tx("O1 M3 fixed +15 bps, 3000", depX(M3, M_AMT, PA(15n), null), `(ok u${M_AMT})`);
  tx("O1 M4 peg +50 bps, 3000", depX(M4, M_AMT, 1n, 50n), `(ok u${M_AMT})`);
  tx("O1 M5 fixed +100 bps, 3000", depX(M5, M_AMT, PA(100n), null), `(ok u${M_AMT})`);
  tx("O1 A deposits 4000 into the +30 bps buy rung", call(A, "deposit", [uintCV(RUNG_X), UPD], rid(BUY_RUNG)), "(ok true)");
  ev("O1 six asks resting", "(len (get-token-x-depositors u0))", "u6");
  tx("O2 TS0 sells STX demanding 1 under the best ask (+10 bps) -> u1017", swap(TS0, grossFor(Y_EXACT), PA(10n) - 1n, false), "(err u1017)");
  ev("O2 book untouched (M1 3000)", depOfX(M1), `u${M_AMT}`);
  const o2 = tx("O2 TS0 sells STX with limit exactly +10 bps: only M1 fills", swap(TS0, grossFor(Y_EXACT), PA(10n), false), (v) => String(v).startsWith("(ok"));
  ev(`O2 M1 left ${M1_LEFT}`, depOfX(M1), `u${M1_LEFT}`);
  ev("O2 M3 (+15) untouched", depOfX(M3), `u${M_AMT}`);
  ev("O2 M2 (+20) untouched", depOfX(M2), `u${M_AMT}`);
  const o1 = tx(`O1 TS sells ${Y_WALK} uSTX at +35 bps: walks +10, +15, +20, +30 in order`, swap(TS, grossFor(Y_WALK), PA(35n), false), (v) => String(v).startsWith("(ok"));
  ev("O1 M1 (+10 peg) empty", depOfX(M1), "u0");
  ev("O1 M3 (+15 fixed) empty", depOfX(M3), "u0");
  ev("O1 M2 (+20 peg) empty", depOfX(M2), "u0");
  const rungLeft = ev("O1 rung (+30 peg) partially filled, ~2000 left", depOfX(rid(BUY_RUNG)), (v) => uintOf(v) > 1900n && uintOf(v) < 2100n);
  ev("O1 M4 (+50 peg) untouched", depOfX(M4), `u${M_AMT}`);
  ev("O1 M5 (+100 fixed) untouched", depOfX(M5), `u${M_AMT}`);
  ev("O1 TS nothing resting (leftover under the minimum refunded)", depOfY(TS), "u0");
  tx("O1 rung sync", call(A, "sync", [], rid(BUY_RUNG)), "(ok true)");
  ev("O1 rung unfilled-index dropped, A has STX proceeds", `(get-position '${A})`, (v) => uintOf(field(v, "stx")) > 0n, rid(BUY_RUNG));

  // =============== O3: bid side mirror ===============
  tx("O3 N1 peg -10 bps, 5 STX", depY(N1, N_AMT, HUGE, 10n), `(ok u${N_AMT})`);
  tx("O3 N2 peg -20 bps, 5 STX", depY(N2, N_AMT, HUGE, 20n), `(ok u${N_AMT})`);
  tx("O3 N3 fixed -15 bps, 5 STX", depY(N3, N_AMT, PB(15n), null), `(ok u${N_AMT})`);
  tx("O3 N4 peg -50 bps, 5 STX", depY(N4, N_AMT, HUGE, 50n), `(ok u${N_AMT})`);
  tx("O3 N5 fixed -100 bps, 5 STX", depY(N5, N_AMT, PB(100n), null), `(ok u${N_AMT})`);
  tx("O3 S deposits 60 STX into the -30 bps sell rung", call(S, "deposit", [uintCV(RUNG_Y), UPD], rid(SELL_RUNG)), "(ok true)");
  ev("O3 six bids resting", "(len (get-token-y-depositors (get-current-cycle)))", "u6");
  tx("O3 TX0 sells sats demanding 1 over the best bid (-10 bps) -> u1017", swap(TX0, grossFor(X_EXACT), PB(10n) + 1n, true), "(err u1017)");
  ev("O3 book untouched (N1 5 STX)", depOfY(N1), `u${N_AMT}`);
  const o3e = tx("O3 TX0 sells sats with limit exactly -10 bps: only N1 fills", swap(TX0, grossFor(X_EXACT), PB(10n), true), (v) => String(v).startsWith("(ok"));
  const n1Left = ev("O3 N1 partially filled", depOfY(N1), (v) => uintOf(v) > 0n && uintOf(v) < N_AMT);
  ev("O3 N3 (-15) untouched", depOfY(N3), `u${N_AMT}`);
  const o3 = tx(`O3 TX sells ${X_WALK} sats at -35 bps: walks -10, -15, -20, -30 in order`, swap(TX, grossFor(X_WALK), PB(35n), true), (v) => String(v).startsWith("(ok"));
  ev("O3 N1 (-10 peg) empty to the dust", depOfY(N1), (v) => uintOf(v) < 5000n);
  ev("O3 N3 (-15 fixed) empty to the dust", depOfY(N3), (v) => uintOf(v) < 5000n);
  ev("O3 N2 (-20 peg) empty to the dust", depOfY(N2), (v) => uintOf(v) < 5000n);
  ev("O3 sell rung (-30 peg) partially filled", depOfY(rid(SELL_RUNG)), (v) => uintOf(v) > RUNG_Y - (2100n * PB(30n)) / PPDF && uintOf(v) < RUNG_Y - (1900n * PB(30n)) / PPDF);
  ev("O3 N4 (-50 peg) untouched", depOfY(N4), `u${N_AMT}`);
  ev("O3 N5 (-100 fixed) untouched", depOfY(N5), `u${N_AMT}`);
  ev("O3 TX nothing resting", depOfX(TX), "u0");
  tx("O3 sell rung sync", call(S, "sync", [], rid(SELL_RUNG)), "(ok true)");
  ev("O3 sell rung: S has sats proceeds", `(get-position '${S})`, (v) => uintOf(field(v, "sbtc")) > 0n, rid(SELL_RUNG));

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; if (!/^(Y1 |Y3 )?fund |^Y1 filler/.test(st.label)) check(st.label, st.raw, st.want); else if (/ERR|\(err/.test(String(st.raw))) check(st.label, st.raw, st.want); }
  const matches = (st) => prints(s[st.idx]).filter((p) => p.includes('(event "match")')).map((p) => (p.match(/\(price u(\d+)\)/) || [])[1]);
  check(`O2 exactly one fill at +10 bps`, matches(o2).join(","), String(PA(10n)));
  check(`O1 fills in price order: +10, +15, +20, +30`, matches(o1).join(","), [PA(10n), PA(15n), PA(20n), PA(30n)].join(","));
  check(`O3 exactly one fill at -10 bps`, matches(o3e).join(","), String(PB(10n)));
  check(`O3 fills in price order: -10, -15, -20, -30`, matches(o3).join(","), [PB(10n), PB(15n), PB(20n), PB(30n)].join(","));
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
