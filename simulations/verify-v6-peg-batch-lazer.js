// verify-v6-peg-batch-lazer.js
// Pegged orders on markets-sbtc-stx-jing-v6 through the BATCH and the book's
// bookkeeping, with one real Lazer update (PYTH_API_KEY). Direct makers only.
//   Z  a zero-spread peg sits at mid and clears IN THE BATCH pro-rata next to
//      a fixed in-range bid (exact sats received and STX left); a tiny
//      zero-spread peg is rolled by the small-share filter with its order
//      intact; the settlement price is the mid; the peg-y log fires only for
//      (some ..) writes
//   N  a book that is all pegs (spread > 0) on both sides: the keeper's
//      settle-with-refresh has nothing to clear (u1009); a taker demanding
//      1 over the pegged bid fills nothing (u1017, atomic); a taker
//      whose limit is exactly the pegged bid fills it; every other peg rolls
//      with its full size and its order
//   L  lifecycle: a partial withdraw keeps the peg; cancel deletes the order;
//      a full fill through the walk deletes the order
//   E  exact arithmetic when one swap clears the batch AND walks a peg: the
//      fixed in-range maker clears at mid, the residual fills the peg at
//      mid -/+ spread; both sides
//   Q  prune-cycles: anyone deletes the depositor lists and totals of settled
//      cycles; the open cycle and a future one are refused (u1027, atomic);
//      settlements stay; the market settles the next cycle after the prune
// Run: PYTH_API_KEY=<key> npx tsx simulations/verify-v6-peg-batch-lazer.js
import fs from "node:fs";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV, trueCV, falseCV,
  noneCV, someCV, listCV, deserializeCV, cvToString, hexToCV, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v5", MKT = "markets-sbtc-stx-jing-v6";
const CORE_ID = `${DEP}.${CORE}`, MARKET = `${DEP}.${MKT}`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"), wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2"; // sBTC whale: funds the sats side
const S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";  // STX whale (2953 STX): funds the STX side, Y2's 600 STX bid
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + "01", "mainnet");
const PP = 100_000_000n, PPDF = PP * 100n, BPS = 10_000n, FEE = 10n, REB = 20n;
const MIN_STX = 1_000_000n, MIN_SBTC = 1000n, HUGE = 999_999_999_999_999n;
const src = (f) => fs.readFileSync(`./contracts/${f}.clar`, "utf8");
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|\\(some u\\d+\\))\\)`)) || [])[1];
const prints = (step) => (step?.Result?.Transaction?.Ok?.events || []).map((e) => { try { const o = typeof e === "string" ? JSON.parse(e) : e; const raw = o.contract_event?.raw_value; return raw ? cvToString(hexToCV(raw)) : ""; } catch { return ""; } });
const grossFor = (net) => { let a = (net * BPS) / (BPS - REB); while (a - (a * REB) / BPS < net) a += 1n; return a; };

async function main() {
  console.log("=== v6 pegged: batch, all-peg book, lifecycle, exact walk arithmetic ===");
  const lz = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const MID = (lz.px * PP) / lz.py;
  const PB = (s) => (MID * (BPS - s)) / BPS, PA = (s) => (MID * (BPS + s)) / BPS;
  const USTX_PER_SAT = MID / PPDF;
  console.log(`mid ${MID} (1 sat ~ ${USTX_PER_SAT} uSTX, 1 STX ~ ${(10n ** 16n) / MID} sats)`);

  // actors (fresh keys, funded in-sim)
  const Y1 = mk(61), Y3 = mk(63), X1 = mk(64), X2 = mk(65), T1 = mk(66), T2 = mk(67), T3 = mk(68);
  const Y4 = mk(69), Y5 = mk(71), X4 = mk(72), X5 = mk(73), T4 = mk(74), S2 = mk(75), S3 = mk(76), T5 = mk(77);
  const Y2 = S; // the 600 STX in-range bid comes straight from the STX whale

  // ---- Z sizing: x binding, Y3 under 0.2% of the side ----
  const Y1_AMT = 8_000_000n, Y2_AMT = 600_000_000n, Y3_AMT = 1_000_000n, T1_NET = 3000n;
  const Z_TOTAL_Y = Y1_AMT + Y2_AMT; // Y3 is rolled by the small-share filter before totals
  const Z_YC = (T1_NET * MID) / PPDF; // uSTX cleared at mid
  if (Z_YC >= Z_TOTAL_Y) throw new Error("Z sizing: 3000 sats must be under 608 STX");
  if (Y3_AMT * BPS >= (Z_TOTAL_Y + Y3_AMT) * 20n) throw new Error("Z sizing: Y3 must be under MIN_SHARE_BPS");
  const Z_REB = grossFor(T1_NET) - T1_NET;
  const Z_X_AFTER_FEE = T1_NET - (T1_NET * FEE) / BPS + Z_REB; // ride-x is the whole rebate: x-clearing == total-x
  const Y1_SATS_Z = (Y1_AMT * Z_X_AFTER_FEE) / Z_TOTAL_Y, Y2_SATS_Z = (Y2_AMT * Z_X_AFTER_FEE) / Z_TOTAL_Y;
  const Y1_LEFT_Z = (Y1_AMT * (Z_TOTAL_Y - Z_YC)) / Z_TOTAL_Y, Y2_LEFT_Z = (Y2_AMT * (Z_TOTAL_Y - Z_YC)) / Z_TOTAL_Y;
  // ---- N sizing: T2 walks Y1 (now a 30 bps peg) at exactly its price ----
  const T2_NET = 1000n, Y1_TRADED_N = (T2_NET * PB(30n)) / PPDF, Y1_LEFT_N = Y1_LEFT_Z - Y1_TRADED_N;
  if (Y1_TRADED_N >= Y1_LEFT_Z) throw new Error("N sizing: 1000 sats must be under Y1's remainder");
  // ---- L sizing: S3 sells enough STX to take X1's 4000 sats at mid + 20 bps, leftover under 1 STX ----
  const X1_AMT = 5000n, X1_LEFT_L = 4000n, S3_NET = (X1_LEFT_L * PA(20n)) / PPDF + 500_000n;
  // ---- E sizing: y binding then walk (T4), x binding then walk (S2) ----
  const Y4_AMT = 2_000_000n, Y5_AMT = 20_000_000n, T4_NET = 2000n;
  const E_XC = (Y4_AMT * PPDF) / MID, E_RESID = T4_NET - E_XC, Y5_TRADED = (E_RESID * PB(30n)) / PPDF, Y5_LEFT = Y5_AMT - Y5_TRADED;
  if (E_RESID <= 0n || Y5_TRADED >= Y5_AMT) throw new Error("E sizing (y): 2000 sats over 2 STX, residual inside Y5");
  const X4_AMT = 3000n, X5_AMT = 20_000n, S2_NET = 20_000_000n;
  const E_YC = (X4_AMT * MID) / PPDF, E_REM = S2_NET - E_YC, X5_TRADED = (E_REM * PPDF) / PA(20n), X5_LEFT = X5_AMT - X5_TRADED;
  if (E_YC >= S2_NET || X5_TRADED >= X5_AMT || E_REM - (X5_TRADED * PA(20n)) / PPDF >= MIN_STX) throw new Error("E sizing (x)");

  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const sp = (s) => (s === null ? noneCV() : someCV(uintCV(s)));
  const depY = (who, amt, limit, spread) => call(who, "deposit-token-y", [uintCV(amt), uintCV(limit), sp(spread), UPD, wstxT, wstxA]);
  const depX = (who, amt, limit, spread) => call(who, "deposit-token-x", [uintCV(amt), uintCV(limit), sp(spread), UPD, sbtcT, sbtcA]);
  const setY = (who, limit, spread) => call(who, "set-token-y-limit", [uintCV(limit), sp(spread), UPD]);
  const swap = (who, amount, limit, depXSide) => call(who, "swap", [uintCV(amount), uintCV(limit), UPD, sbtcT, sbtcA, wstxT, wstxA, depXSide ? trueCV() : falseCV()]);
  const stxSend = (to, ustx) => (bb) => bb.withSender(S).addSTXTransfer({ recipient: to, amount: Number(ustx) });
  const satsSend = (to, sats) => call(A, "transfer", [uintCV(sats), standardPrincipalCV(A), standardPrincipalCV(to), noneCV()], SBTC);
  const ordY = (who) => `(get-token-y-order '${who})`, ordX = (who) => `(get-token-x-order '${who})`;
  const depOfY = (c, who) => `(get-token-y-deposit u${c} '${who})`, depOfX = (c, who) => `(get-token-x-deposit u${c} '${who})`;

  deploy(CORE, src(CORE)); deploy(MKT, src(MKT));
  tx("core-v5 verifies v6", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(ok true)");
  tx("v6 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(MIN_SBTC), uintCV(MIN_STX), uintCV(1), uintCV(45)]), "(ok true)");
  for (const [who, ustx, sats] of [
    [Y1, 10_000_000n, 0n], [Y3, 2_500_000n, 0n], [X1, 1_000_000n, 6000n], [X2, 1_000_000n, 4000n],
    [T1, 1_000_000n, 3100n], [T2, 1_000_000n, 1100n], [T3, 1_000_000n, 1100n],
    [Y4, 3_500_000n, 0n], [Y5, 22_000_000n, 0n], [X4, 1_000_000n, 3100n], [X5, 1_000_000n, 21_000n],
    [T4, 1_000_000n, 2100n], [S2, 22_000_000n, 0n], [S3, S3_NET + 2_000_000n, 0n],
  ]) { tx(`fund ${who.slice(0, 6)} stx`, stxSend(who, ustx), (v) => String(v).startsWith("(ok")); if (sats > 0n) tx(`fund ${who.slice(0, 6)} sats`, satsSend(who, sats), "(ok true)"); }

  // =============== Z: zero-spread pegs in the batch ===============
  const z1 = tx("Z1 Y1 zero-spread peg bid 8 STX, ceiling any", depY(Y1, Y1_AMT, HUGE, 0n), `(ok u${Y1_AMT})`);
  const z2 = tx("Z2 Y2 (STX whale) fixed in-range bid 600 STX", depY(Y2, Y2_AMT, HUGE, null), `(ok u${Y2_AMT})`);
  tx("Z3 Y3 zero-spread peg bid 1 STX (under 0.2% of the side)", depY(Y3, Y3_AMT, HUGE, 0n), `(ok u${Y3_AMT})`);
  ev("Z4 Y1 limit-at mid == mid", `(token-y-limit-at '${Y1} u${MID})`, `u${MID}`);
  ev("Z5 Y1 order (some u0)", ordY(Y1), (v) => field(v, "spread-bps") === "(some u0)");
  const zs = tx(`Z6 T1 sells ${T1_NET} sats net (x binding): batch at mid, pro-rata`, swap(T1, grossFor(T1_NET), (MID * 97n) / 100n, true), (v) => String(v).startsWith("(ok"));
  ev("Z7 cycle u1", "(get-current-cycle)", "u1");
  ev("Z8 settlement u0 price == mid", "(get price (unwrap-panic (get-settlement u0)))", `u${MID}`);
  ev(`Z9 Y1 left ${Y1_LEFT_Z} (pro-rata unfilled)`, depOfY(1, Y1), `u${Y1_LEFT_Z}`);
  ev(`Z10 Y2 left ${Y2_LEFT_Z}`, depOfY(1, Y2), `u${Y2_LEFT_Z}`);
  ev(`Z11 Y1 received ${Y1_SATS_Z} sats (had none)`, `(contract-call? '${SBTC} get-balance '${Y1})`, `(ok u${Y1_SATS_Z})`);
  ev("Z12 Y3 rolled by the small-share filter, size intact", depOfY(1, Y3), `u${Y3_AMT}`);
  ev("Z13 Y3 order intact (some u0)", ordY(Y3), (v) => field(v, "spread-bps") === "(some u0)");
  ev("Z14 Y1 order intact after a partial batch fill", ordY(Y1), (v) => field(v, "spread-bps") === "(some u0)");
  ev("Z15 T1 nothing left", depOfX(1, T1), "u0");

  // =============== N: all-peg book ===============
  tx("N1 Y2 cancels the rest of the fixed bid", call(Y2, "cancel-token-y-deposit", [wstxT, wstxA]), `(ok u${Y2_LEFT_Z})`);
  const n2 = tx("N2 Y1 -> 30 bps peg (set-limit)", setY(Y1, HUGE, 30n), "(ok true)");
  tx("N3 Y3 -> 60 bps peg", setY(Y3, HUGE, 60n), "(ok true)");
  tx("N4 X1 20 bps peg ask 5000, floor 1 (bids rest: classified, never crosses)", depX(X1, X1_AMT, 1n, 20n), `(ok u${X1_AMT})`);
  tx("N5 X2 50 bps peg ask 3000", depX(X2, 3000n, 1n, 50n), "(ok u3000)");
  ev("N6 raw totals both over the minimum", "(get-cycle-totals u1)", (v) => uintOf(field(v, "total-token-x")) >= MIN_SBTC && uintOf(field(v, "total-token-y")) >= MIN_STX);
  tx("N7 keeper settle-with-refresh on an all-peg book -> u1009 NOTHING_TO_SETTLE", call(DEP, "settle-with-refresh", [UPD, sbtcT, sbtcA, wstxT, wstxA]), "(err u1009)");
  ev("N8 still cycle u1", "(get-current-cycle)", "u1");
  tx("N9 T3 sells 1000 sats demanding 1 over the pegged bid -> u1017 (nothing fills, atomic)", swap(T3, grossFor(1000n), PB(30n) + 1n, true), "(err u1017)");
  ev("N10 book untouched: Y1 still on cycle u1", depOfY(1, Y1), `u${Y1_LEFT_Z}`);
  const ns = tx(`N11 T2 sells ${T2_NET} sats with limit == pegged bid: walks Y1 at mid - 30 bps`, swap(T2, grossFor(T2_NET), PB(30n), true), (v) => String(v).startsWith("(ok"));
  ev("N12 cycle u2", "(get-current-cycle)", "u2");
  ev(`N13 Y1 left ${Y1_LEFT_N}`, depOfY(2, Y1), `u${Y1_LEFT_N}`);
  ev("N14 Y3 rolled intact", depOfY(2, Y3), `u${Y3_AMT}`);
  ev("N15 X1 rolled intact", depOfX(2, X1), `u${X1_AMT}`);
  ev("N16 X2 rolled intact", depOfX(2, X2), "u3000");
  ev("N17 settlement u1 cleared nothing at mid", "(get token-x-cleared (unwrap-panic (get-settlement u1)))", "u0");

  // =============== L: lifecycle ===============
  tx("L1 X1 partial withdraw 1000", call(X1, "withdraw-token-x", [uintCV(1000), sbtcT, sbtcA]), `(ok u${X1_LEFT_L})`);
  ev("L2 X1 order kept (some u20)", ordX(X1), (v) => field(v, "spread-bps") === "(some u20)" && field(v, "limit") === "u1");
  tx("L3 X2 cancels", call(X2, "cancel-token-x-deposit", [sbtcT, sbtcA]), "(ok u3000)");
  ev("L4 X2 order deleted (limit u0, none)", ordX(X2), (v) => field(v, "limit") === "u0" && field(v, "spread-bps") === "none");
  const ls = tx(`L5 S3 sells ${S3_NET} uSTX with a 35 bps limit: walks X1 fully at mid + 20 bps`, swap(S3, grossFor(S3_NET), PA(35n), false), (v) => String(v).startsWith("(ok"));
  ev("L6 cycle u3", "(get-current-cycle)", "u3");
  ev("L7 X1 fully filled", depOfX(3, X1), "u0");
  ev("L8 X1 order deleted by the fill", ordX(X1), (v) => field(v, "limit") === "u0" && field(v, "spread-bps") === "none");
  ev("L9 S3 residual under the minimum was refunded (nothing resting)", depOfY(3, S3), "u0");

  // =============== E: batch + walk in one swap, exact ===============
  tx("E0 Y1 cancels", call(Y1, "cancel-token-y-deposit", [wstxT, wstxA]), `(ok u${Y1_LEFT_N})`);
  tx("E0 Y3 cancels", call(Y3, "cancel-token-y-deposit", [wstxT, wstxA]), `(ok u${Y3_AMT})`);
  ev("E0 y side empty", "(len (get-token-y-depositors u3))", "u0");
  tx("E1 Y4 fixed in-range bid 2 STX", depY(Y4, Y4_AMT, HUGE, null), `(ok u${Y4_AMT})`);
  tx("E2 Y5 30 bps peg bid 20 STX", depY(Y5, Y5_AMT, HUGE, 30n), `(ok u${Y5_AMT})`);
  const es = tx(`E3 T4 sells ${T4_NET} sats (y binding): Y4 clears at mid, residual ${E_RESID} walks Y5`, swap(T4, grossFor(T4_NET), PB(35n), true), (v) => String(v).startsWith("(ok"));
  ev("E4 cycle u4", "(get-current-cycle)", "u4");
  ev("E5 Y4 fully cleared", depOfY(4, Y4), "u0");
  ev(`E6 Y5 left ${Y5_LEFT} (residual at mid - 30 bps)`, depOfY(4, Y5), `u${Y5_LEFT}`);
  ev("E7 T4 nothing left", depOfX(4, T4), "u0");
  ev(`E8 settlement u3 x-cleared ${E_XC}`, "(get token-x-cleared (unwrap-panic (get-settlement u3)))", `u${E_XC}`);
  tx("E9 X4 fixed in-range ask 3000 (the pegged bid is under mid: no cross)", depX(X4, X4_AMT, 1n, null), `(ok u${X4_AMT})`);
  tx("E10 X5 20 bps peg ask 20000", depX(X5, X5_AMT, 1n, 20n), `(ok u${X5_AMT})`);
  const es2 = tx(`E11 S2 sells 20 STX (x binding): X4 clears at mid, ${E_REM} uSTX walk X5`, swap(S2, grossFor(S2_NET), PA(35n), false), (v) => String(v).startsWith("(ok"));
  ev("E12 cycle u5", "(get-current-cycle)", "u5");
  ev("E13 X4 fully cleared", depOfX(5, X4), "u0");
  ev(`E14 X5 left ${X5_LEFT}`, depOfX(5, X5), `u${X5_LEFT}`);
  ev("E15 S2 nothing left", depOfY(5, S2), "u0");
  ev("E16 Y5 rolled intact through a settlement it did not touch", depOfY(5, Y5), `u${Y5_LEFT}`);
  ev(`E17 settlement u4 y-cleared ${E_YC}`, "(get token-y-cleared (unwrap-panic (get-settlement u4)))", `u${E_YC}`);

  // =============== Q: prune settled cycles (permissionless) ===============
  ev("Q0 cycle u5 open; cycle u0 list still stored", "(len (get-token-y-depositors u0))", (v) => uintOf(v) > 0n);
  tx("Q1 prune u0..u4 by anyone -> (ok u5)", call(T3, "prune-cycles", [listCV([uintCV(0), uintCV(1), uintCV(2), uintCV(3), uintCV(4)])]), "(ok u5)");
  ev("Q1 cycle u0 y list gone", "(len (get-token-y-depositors u0))", "u0");
  ev("Q1 cycle u3 x list gone", "(len (get-token-x-depositors u3))", "u0");
  ev("Q1 cycle u4 totals gone", "(get-cycle-totals u4)", (v) => field(v, "total-token-x") === "u0" && field(v, "total-token-y") === "u0");
  ev("Q1 settlements kept (u4 price = mid)", "(get price (unwrap-panic (get-settlement u4)))", `u${MID}`);
  ev("Q1 the open cycle untouched (Y5, X5 still resting)", "(len (get-token-y-depositors u5))", (v) => uintOf(v) > 0n);
  tx("Q2 prune the open cycle u5 -> u1027, atomic", call(T3, "prune-cycles", [listCV([uintCV(1), uintCV(5)])]), "(err u1027)");
  tx("Q3 prune u0 again (nothing there) -> (ok u1)", call(T3, "prune-cycles", [listCV([uintCV(0)])]), "(ok u1)");
  tx("Q4 prune a future cycle u99 -> u1027", call(T3, "prune-cycles", [listCV([uintCV(99)])]), "(err u1027)");
  tx("Q4 prune the open cycle alone -> u1027", call(T3, "prune-cycles", [listCV([uintCV(5)])]), "(err u1027)");
  // the market keeps working with every settled cycle pruned: a swap settles u5
  tx("Q5 fund T5", stxSend(T5, 1_000_000n), (v) => String(v).startsWith("(ok"));
  tx("Q5 fund T5 sats", satsSend(T5, 1100n), "(ok true)");
  tx("Q5 T5 sells 1000 sats after the prune: cycle u5 settles, walks Y5 at mid - 30 bps", swap(T5, grossFor(1000n), PB(35n), true), (v) => String(v).startsWith("(ok"));
  ev("Q5 cycle u6", "(get-current-cycle)", "u6");
  ev("Q5 settlement u5 recorded at mid", "(get price (unwrap-panic (get-settlement u5)))", `u${MID}`);
  ev(`Q5 Y5 walked: ${Y5_LEFT - (1000n * PB(30n)) / PPDF} left`, depOfY(6, Y5), `u${Y5_LEFT - (1000n * PB(30n)) / PPDF}`);
  tx("Q5 prune u5 now that it is settled -> (ok u1)", call(T3, "prune-cycles", [listCV([uintCV(5)])]), "(ok u1)");

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; if (!/^(Y1 |Y3 )?fund |^Y1 filler/.test(st.label)) check(st.label, st.raw, st.want); else if (/ERR|\(err/.test(String(st.raw))) check(st.label, st.raw, st.want); }
  // logs
  const pegY = (st) => prints(s[st.idx]).filter((p) => p.includes('(event "peg-y")'));
  check("Z1 peg-y logged for the (some u0) deposit with cap and cycle", pegY(z1).join("|"), (v) => v.includes("(spread-bps u0)") && v.includes(`(cap u${HUGE})`) && v.includes("(cycle u0)"));
  check("Z2 no peg-y for a fixed (none) deposit", pegY(z2).length, (v) => v === 0);
  check("N2 set-limit to a peg logs set-limit-y AND peg-y (spread u30)", prints(s[n2.idx]).filter((p) => p.includes('(event "set-limit-y")') || p.includes("(spread-bps u30)")).length, (v) => v === 2);
  check("Z6 small-share roll logged for Y3", prints(s[zs.idx]).filter((p) => p.includes('(event "small-share-roll-y")') && p.includes(Y3)).length, (v) => v === 1);
  const matchPrices = (st) => prints(s[st.idx]).filter((p) => p.includes('(event "match")')).map((p) => (p.match(/\(price u(\d+)\)/) || [])[1]);
  check("Z6 the batch fill is not a walk (no match log)", matchPrices(zs).length, (v) => v === 0);
  check(`N11 match at exactly mid - 30 bps (${PB(30n)})`, matchPrices(ns).join(","), String(PB(30n)));
  check(`L5 match at mid + 20 bps (${PA(20n)})`, matchPrices(ls).join(","), String(PA(20n)));
  check(`E3 one walk fill at mid - 30 bps`, matchPrices(es).join(","), String(PB(30n)));
  check(`E11 one walk fill at mid + 20 bps`, matchPrices(es2).join(","), String(PA(20n)));
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
