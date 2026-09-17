// verify-v7-taker-anchor-lazer.js
// SELF-VERIFYING stxer mainnet-fork harness for markets-sbtc-stx-jing-v7:
// every action that needs a price is a SUBMIT (no print) and a SETTLE (anyone,
// a print whose feed times are newer than the submit's block). Deploys
// jing-core-v6 + v7 under the deployer on top of the DEPLOYED jing-ladder;
// three real Lazer prints ~40 s apart (P1 < P2 < P3) and synthetic blocks
// placed around them (synthetic time = tip burn time + intervals).
//
//   block 0   deploy, verify, initialize, funding (no prints)
//   S_0 = P1 - 20  makers SUBMIT (deposit-token-x/y, no print) and are SETTLED
//             with P1 -> rested (kind 0, outcome 0); refresh with P1 -> u1009;
//             E: ttl gates u1034, minimum u1001, second order u1029, refund
//             before expiry u1033, settle with P1 (newer than S_0) -> filled
//   S_a = P1 + 3  C places O2 (30 STX), D places O4 (6000 sats, ttl 60),
//             F places O6 (min-out 1 BTC); settle O2 with P1 -> u1032
//   S_b = P2 - 5  B places O3; settle with P1 -> u1032 (35 s old, inside 80 s,
//             but older than the order); with P2 -> filled at P2's mid; again
//             -> u1030; C settles O2 himself; F's O6 with P2 -> u1035, stays;
//             C submits a resting bid at 0.9 mid, settle with P1 -> u1032, with
//             P2 -> rested, cancel; refresh with P1 / P2 -> u1009
//   S_c = P2 + 3  B places O5 (1000 STX): settle with P2 -> u1032 (reuse), with
//             P3 -> filled IOC, remainder back; D's O4: P1 -> u1032, P3 -> u1031
//             (after expiry), refund -> u1033; A tops up with a fixed ask at
//             0.99 mid -> rested (placed-at S_c); S submits a bid at 1.01 mid
//             -> settle refuses it (crossing, kind 0 -> money back, outcome 2)
//   S_d = E4 + 81  O4: settle -> u1031, refund -> ok; O6 refund -> ok
// Run: npx tsx simulations/verify-v7-taker-anchor-lazer.js
import fs from "node:fs";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV, trueCV, falseCV,
  noneCV, someCV, deserializeCV, cvToString, hexToCV, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdateAny, lazerFeedTimes } from "./_lazer.js";
import { installChunkedSubmit } from "./_chunked-submit.js";
installChunkedSubmit(50);

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v6", MKT = "markets-sbtc-stx-jing-v7";
const MARKET = `${DEP}.${MKT}`, CORE_ID = `${DEP}.${CORE}`;
const SBTC_ADDR = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", SBTC_NAME = "sbtc-token", SBTC = `${SBTC_ADDR}.${SBTC_NAME}`;
const WSTX_ADDR = "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", WSTX_NAME = "token-stx-v-1-2";
const sbtcT = contractPrincipalCV(SBTC_ADDR, SBTC_NAME), wstxT = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";   // sBTC whale: pegged ask
const S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";    // STX whale: pegged bid, funds C, D, E, F
const B = "SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q";   // taker (STX side)
const KEEPER = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3"; // anyone
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + "01", "mainnet");
const C = mk(7), D = mk(8), E = mk(9), F = mk(10);
const PP = 100_000_000n, BPS = 20n;
const API = process.env.STACKS_API_URL || "http://77.42.3.101/stacks-api";
const stripComments = (t) => t.split("\n").filter((l) => !/^\s*;;/.test(l)).map((l) => l.replace(/^\s+/, "")).filter((l) => l.length).join("\n");
const src = (f) => stripComments(fs.readFileSync(`./contracts/${f}.clar`, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let checks = 0, failures = 0;
function check(label, actual, want) {
  checks += 1;
  const ok = typeof want === "function" ? want(actual) : String(actual) === want;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`);
}
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 160)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 160)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|true|false|\\(some u\\d+\\))\\)`)) || [])[1];
const prints = (step) => (step?.Result?.Transaction?.Ok?.events || []).map((e) => { try { const o = typeof e === "string" ? JSON.parse(e) : e; const raw = o.contract_event?.raw_value; return raw ? cvToString(hexToCV(raw)) : ""; } catch { return ""; } });
const matchPrices = (step) => prints(step).filter((r) => r.includes('(event "match")')).map((r) => (r.match(/\(price u(\d+)\)/) || [])[1]);
const okish = (v) => String(v).startsWith("(ok");

async function main() {
  console.log("=== v7 submit + settle: three Lazer prints, synthetic block times around them ===");
  let p1, p2, p3, tip;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    tip = (await fetch(`${API}/extended/v2/blocks?limit=1`).then((r) => r.json())).results[0];
    // synthetic time starts at the tip's burn block: S_0 = P1 - 20 must lie after it
    const young = tip.burn_block_time + 35 - Math.floor(Date.now() / 1000);
    if (young > 0) { console.log(`burn block is ${35 - young} s old; waiting ${young} s`); await sleep(young * 1000); }
    p1 = await fetchLazerUpdateAny();
    console.log(`P1 at ${p1.ts.toFixed(1)} (burn base ${tip.burn_block_time}); sleeping 40 s`); await sleep(40_000);
    p2 = await fetchLazerUpdateAny();
    console.log(`P2 at ${p2.ts.toFixed(1)}; sleeping 40 s`); await sleep(40_000);
    p3 = await fetchLazerUpdateAny();
    console.log(`P3 at ${p3.ts.toFixed(1)}`);
    const tip2 = (await fetch(`${API}/extended/v2/blocks?limit=1`).then((r) => r.json())).results[0];
    if (tip2.burn_block_time === tip.burn_block_time) break;
    console.log(`burn block moved; refetching (attempt ${attempt})`);
    if (attempt === 3) { console.error("burn block kept moving"); process.exit(2); }
  }
  // the market anchors on the OLDER of the two prices' own feed-update-timestamps, not the envelope
  const [f1, f2, f3] = await Promise.all([lazerFeedTimes(p1.hex), lazerFeedTimes(p2.hex), lazerFeedTimes(p3.hex)]);
  const at1 = BigInt(f1.at), at2 = BigInt(f2.at), at3 = BigInt(f3.at);
  console.log(`feed times: P1 ${f1.x}/${f1.y} P2 ${f2.x}/${f2.y} P3 ${f3.x}/${f3.y}`);
  const U1 = bufferCV(Buffer.from(p1.hex, "hex")), U2 = bufferCV(Buffer.from(p2.hex, "hex")), U3 = bufferCV(Buffer.from(p3.hex, "hex"));
  const mid = (p) => (p.px * PP) / p.py;
  const MID1 = mid(p1), MID2 = mid(p2), MID3 = mid(p3);
  const ask = (m) => (m * (10000n + BPS)) / 10000n;
  console.log(`mid1 ${MID1} mid2 ${MID2} mid3 ${MID3} (1 STX ~ ${(10n ** 16n) / MID1} sats)`);
  const S_0 = at1 - 20n, S_a = at1 + 3n, S_b = at2 - 5n, S_c = at2 + 3n, E4 = S_a + 60n, S_d = E4 + 81n;
  let lastT = BigInt(tip.burn_block_time);
  if (!(lastT < S_0 && S_0 < S_a && S_a < S_b && S_b < S_c && S_c < S_d && S_b - at1 < 80n && at3 > E4 && at3 > S_c)) {
    console.error("print spacing off", { burn: lastT, at1, at2, at3, S_0, S_a, S_b, S_c, S_d }); process.exit(2);
  }

  const steps = [];
  let b = SimulationBuilder.new();
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const traits = [sbtcT, sbtcA, wstxT, wstxA];
  const place = (sender, amount, limit, ttl, depX, minOut = 0) => call(sender, "place-swap", [uintCV(amount), uintCV(limit), uintCV(ttl), uintCV(minOut), sbtcT, depX ? trueCV() : falseCV()]);
  const depX = (sender, amount, limit, spread, ttl) => call(sender, "deposit-token-x", [uintCV(amount), uintCV(limit), spread, uintCV(ttl), sbtcT]);
  const depY = (sender, amount, limit, spread, ttl) => call(sender, "deposit-token-y", [uintCV(amount), uintCV(limit), spread, uintCV(ttl), wstxT]);
  const settle = (sender, who, isX, upd) => call(sender, "settle-order", [standardPrincipalCV(who), isX ? trueCV() : falseCV(), upd, ...traits]);
  const refund = (sender, who, isX) => call(sender, "refund-order", [standardPrincipalCV(who), isX ? trueCV() : falseCV(), ...traits]);
  const refresh = (sender, upd) => call(sender, "settle-with-refresh", [upd, ...traits]);
  const order = (who, isX) => `(get-order '${who} ${isX})`;
  const stxSend = (to, ustx) => (bb) => bb.withSender(S).addSTXTransfer({ recipient: to, amount: Number(ustx) });
  const satsSend = (to, sats) => call(A, "transfer", [uintCV(sats), standardPrincipalCV(A), standardPrincipalCV(to), noneCV()], SBTC);
  const advanceTo = (label, t) => { b = b.addAdvanceBlocks({ bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: Number(t - lastT) }); lastT = t; steps.push({ label: `advance -> ${label} (${t})`, kind: "advance" }); };
  const time = (label, want) => ev(label, "stacks-block-time", want);
  const LIM_SELL_STX = (m) => (m * 103n) / 100n, LIM_SELL_SATS = (m) => (m * 97n) / 100n;
  const RESTED = "(ok u0)", FILLED = "(ok u1)", REFUSED = "(ok u2)";

  // ---- block 0: stack + funding, no prints ----
  deploy(CORE, src(CORE)); deploy(MKT, src(MKT));
  tx("core-v6 verifies v7", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(ok true)");
  tx("v7 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)");
  for (const [who, n] of [[C, "C"], [E, "E"], [F, "F"]]) tx(`fund ${n} 100 STX`, stxSend(who, 100_000_000n), okish);
  tx("fund D 10 STX", stxSend(D, 10_000_000n), okish);
  tx("fund D 20000 sats", satsSend(D, 20000n), "(ok true)");
  tx("fund S 100k sats (for the crossing-bid refund check it needs none; sanity)", satsSend(S, 1000n), "(ok true)");

  // ---- S_0: makers submit, keeper settles with P1 ----
  advanceTo("S_0 = P1 - 20", S_0);
  time("S_0 clock", (v) => uintOf(v) === S_0);
  tx("M1 A submits a pegged ask +20 bps, 200k sats (floor mid*0.9): y side empty, no price needed -> rests at once", depX(A, 200_000, (MID1 * 90n) / 100n, someCV(uintCV(20)), 300), (v) => okish(v) && field(v, "expiry") === field(v, "placed-at"));
  ev("M1 no pending order for A", order(A, true), "none");
  ev("M1 A rests 200k on the market, order row placed-at = S_0", `(get-token-x-order '${A})`, (v) => field(v, "placed-at") === `u${S_0}` && field(v, "spread-bps") === "(some u20)");
  ev("M1 A's deposit is on the book", `(get-token-x-deposit (get-current-cycle) '${A})`, "u200000");
  tx("M2 S submits a pegged bid -20 bps, 600 STX (cap mid*1.1): x side rests -> price needed -> pending", depY(S, 600_000_000, (MID1 * 110n) / 100n, someCV(uintCV(20)), 300), okish);
  ev("M2 S's pending order: kind 0 (deposit), placed-at S_0", order(S, false), (v) => field(v, "kind") === "u0" && field(v, "placed-at") === `u${S_0}`);
  tx("M2 KEEPER settles S with P1 -> rested (outcome 0)", settle(KEEPER, S, false, U1), RESTED);
  ev("M2 S rests 600 STX, order row placed-at = S_0", `(get-token-y-order '${S})`, (v) => field(v, "placed-at") === `u${S_0}` && field(v, "spread-bps") === "(some u20)");
  tx("M3 refresh with P1: nothing in range -> u1009", refresh(KEEPER, U1), "(err u1009)");
  tx("T1 E place-swap ttl 10 -> u1034", place(E, 30_000_000, LIM_SELL_STX(MID1), 10, false), "(err u1034)");
  tx("T1 E place-swap ttl 601 -> u1034", place(E, 30_000_000, LIM_SELL_STX(MID1), 601, false), "(err u1034)");
  tx("T1 E place-swap under the minimum -> u1001", place(E, 500_000, LIM_SELL_STX(MID1), 300, false), "(err u1001)");
  tx("T2 E place-swap O1: 30 STX ttl 300 at S_0", place(E, 30_000_000, LIM_SELL_STX(MID1), 300, false), okish);
  ev("T3 E's order: kind 1, y side, 30 STX, expiry = placed-at + 300", order(E, false), (v) => field(v, "kind") === "u1" && field(v, "amount") === "u30000000" && uintOf(field(v, "expiry")) === uintOf(field(v, "placed-at")) + 300n);
  tx("T4 E refund before expiry -> u1033", refund(E, E, false), "(err u1033)");
  tx("T5 E place-swap again while open -> u1029", place(E, 30_000_000, LIM_SELL_STX(MID1), 300, false), "(err u1029)");
  const t6 = tx("T6 KEEPER settles O1 with P1 (newer than S_0) -> filled (outcome 1)", settle(KEEPER, E, false, U1), FILLED);
  ev("T7 O1 gone", order(E, false), "none");

  // ---- S_a: orders anchored AFTER P1 ----
  advanceTo("S_a = P1 + 3", S_a);
  time("S_a clock", (v) => uintOf(v) === S_a);
  tx("U1 C place-swap O2: 30 STX ttl 300", place(C, 30_000_000, LIM_SELL_STX(MID1), 300, false), okish);
  tx("U2 D place-swap O4: 6000 sats ttl 60 (x side)", place(D, 6000, LIM_SELL_SATS(MID1), 60, true), okish);
  ev("U2 D's order: placed-at S_a, expiry S_a + 60", order(D, true), (v) => field(v, "placed-at") === `u${S_a}` && field(v, "expiry") === `u${E4}`);
  ev("U2 D sats after placing (20000 - 6000)", `(contract-call? '${SBTC} get-balance '${D})`, "(ok u14000)");
  tx("U3 KEEPER settles O2 with P1 -> u1032 (P1 is 3 s older than the order)", settle(KEEPER, C, false, U1), "(err u1032)");
  tx("U4 F place-swap O6: 30 STX ttl 60, min-out 1 BTC (unreachable)", place(F, 30_000_000, LIM_SELL_STX(MID1), 60, false, 100_000_000), okish);

  // ---- S_b: P1 is stale-but-within-80s here ----
  advanceTo("S_b = P2 - 5", S_b);
  time("S_b clock", (v) => uintOf(v) === S_b);
  tx("V3 B place-swap O3: 30 STX ttl 300", place(B, 30_000_000, LIM_SELL_STX(MID2), 300, false), okish);
  tx("V4 KEEPER settles O3 with P1 -> u1032 (older than the order, inside the 80 s window)", settle(KEEPER, B, false, U1), "(err u1032)");
  const v5 = tx("V5 KEEPER settles O3 with P2 -> filled at P2's mid", settle(KEEPER, B, false, U2), FILLED);
  tx("V5b KEEPER settles O3 again -> u1030", settle(KEEPER, B, false, U2), "(err u1030)");
  tx("V5c B settles O3 again -> u1030", settle(B, B, false, U2), "(err u1030)");
  ev("V5d B has no order", order(B, false), "none");
  const v6 = tx("V6 C settles O2 HIMSELF with P2 (placed S_a, no keeper) -> filled", settle(C, C, false, U2), FILLED);
  ev("V6b C's order gone", order(C, false), "none");
  tx("V7 KEEPER settles O6 with P2 -> u1035 (fill under min-out), order stays", settle(KEEPER, F, false, U2), "(err u1035)");
  ev("V7b F's order still open with its min-out", order(F, false), (v) => String(v).startsWith("(some") && field(v, "min-out") === "u100000000");
  tx("R1 C submits a resting bid at 0.9 mid (5 STX), no print", depY(C, 5_000_000, (MID2 * 90n) / 100n, noneCV(), 300), okish);
  tx("R1b settle C's bid with P1 -> u1032 (print older than the submit)", settle(KEEPER, C, false, U1), "(err u1032)");
  tx("R1c settle C's bid with P2 -> rested", settle(KEEPER, C, false, U2), RESTED);
  tx("R1d C cancels it", call(C, "cancel-token-y-deposit", [wstxT, wstxA]), "(ok u5000000)");
  tx("R2 refresh with P1 -> u1009 (nothing in range; resting orders older than P1 settle, newer ones are skipped)", refresh(KEEPER, U1), "(err u1009)");
  tx("R2b refresh with P2 -> u1009", refresh(KEEPER, U2), "(err u1009)");

  // ---- S_c: reuse of an old print, IOC remainder, expiry, maker gate ----
  advanceTo("S_c = P2 + 3", S_c);
  time("S_c clock", (v) => uintOf(v) === S_c);
  tx("W1 B place-swap O5: 1000 STX ttl 300 (bigger than the book)", place(B, 1_000_000_000, LIM_SELL_STX(MID3), 300, false), okish);
  ev("W0b B STX after placing O5", `(stx-get-balance '${B})`, () => true);
  ev("W0c B sats after placing O5", `(contract-call? '${SBTC} get-balance '${B})`, () => true);
  tx("W2 settle O5 with P2 -> u1032 (P2 was published before the order)", settle(KEEPER, B, false, U2), "(err u1032)");
  const w3 = tx("W3 settle O5 with P3 -> filled, IOC: walks the ask, refunds the rest", settle(KEEPER, B, false, U3), FILLED);
  ev("W3b B STX after O5 settled", `(stx-get-balance '${B})`, () => true);
  ev("W3c B sats after O5 settled", `(contract-call? '${SBTC} get-balance '${B})`, () => true);
  tx("X1 settle O4 with P1 -> u1032 (before the order)", settle(KEEPER, D, true, U1), "(err u1032)");
  tx("X2 settle O4 with P3 -> u1031 (after the expiry: no print inside the window = outage)", settle(KEEPER, D, true, U3), "(err u1031)");
  tx("X3 refund O4 -> u1033 (expiry + 80 s not reached)", refund(KEEPER, D, true), "(err u1033)");
  tx("Y1 A submits a top-up: fixed ask 5000 at 0.99 mid", depX(A, 5000, (MID3 * 99n) / 100n, noneCV(), 300), okish);
  tx("Y1b settle A with P3 -> rested (the pegged bid sits under mid: not in-range liquidity, v6 gate)", settle(KEEPER, A, true, U3), RESTED);
  ev("Y1c A's order row now fixed, placed-at = S_c", `(get-token-x-order '${A})`, (v) => field(v, "placed-at") === `u${S_c}` && field(v, "spread-bps") === "none");
  ev("Y2a S STX before the crossing bid", `(stx-get-balance '${S})`, () => true);
  tx("Y2 S submits a fixed bid at 1.01 mid (5 STX): would take A's ask", depY(S, 5_000_000, (MID3 * 101n) / 100n, noneCV(), 300), okish);
  tx("Y2b settle S with P3 -> refused (crossing, outcome 2): money back, v6's u1016 as a refund", settle(KEEPER, S, false, U3), REFUSED);
  ev("Y2c S STX back (minus fees)", `(stx-get-balance '${S})`, () => true);
  tx("Y3 refresh with P3 -> u1009", refresh(KEEPER, U3), "(err u1009)");

  // ---- S_d: past O4's expiry + 80 ----
  advanceTo("S_d = E4 + 81", S_d);
  time("S_d clock", (v) => uintOf(v) === S_d);
  tx("Z1 settle O4 with P3 -> u1031 still", settle(KEEPER, D, true, U3), "(err u1031)");
  tx("Z2 KEEPER refunds O4 -> ok u6000", refund(KEEPER, D, true), "(ok u6000)");
  ev("Z3 D sats restored", `(contract-call? '${SBTC} get-balance '${D})`, "(ok u20000)");
  tx("Z4 refund again -> u1030", refund(KEEPER, D, true), "(err u1030)");
  tx("Z6 KEEPER refunds O6 (expired unfilled, min-out never met) -> ok u30000000", refund(KEEPER, F, false), "(ok u30000000)");

  console.log(`\nsubmitting ${steps.length} steps`);
  const sid = await b.run();
  console.log(`https://stxer.xyz/simulations/mainnet/${sid}`);
  const res = await getSimulationResult(sid);
  const s = res.steps; let i = 0;
  for (const st of steps) {
    if (st.kind === "advance") { while (i < s.length && !s[i]?.Result?.AdvanceBlocks) i += 1; st.idx = i; i += 1; console.log(`  --   ${st.label}`); continue; }
    while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1;
    const raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]);
    st.raw = raw; st.idx = i; i += 1;
    check(st.label, raw, st.want);
  }
  const px = (st) => matchPrices(s[st.idx]);
  check(`T6 fill at mid1 + 20 bps (${ask(MID1)})`, px(t6).join(","), (v) => px(t6).length >= 1 && px(t6).every((p) => p === String(ask(MID1))));
  check(`V5 fill at mid2 + 20 bps (${ask(MID2)}): the newer print priced it`, px(v5).join(","), (v) => px(v5).length >= 1 && px(v5).every((p) => p === String(ask(MID2))));
  check(`V6 self-settled fill at mid2 + 20 bps`, px(v6).join(","), (v) => px(v6).length >= 1 && px(v6).every((p) => p === String(ask(MID2))));
  check(`W3 O5 fill at mid3 + 20 bps (${ask(MID3)})`, px(w3).join(","), (v) => px(w3).length >= 1 && px(w3).every((p) => p === String(ask(MID3))));
  const v5ev = prints(s[v5.idx]).find((r) => r.includes('(event "settle-order")')) || "";
  check("V5 core-v6 settle-order log: market v7, settler KEEPER, outcome 1, publish-time = P2", v5ev.slice(0, 160), (v) => v5ev.includes(MKT) && v5ev.includes(KEEPER) && v5ev.includes("(outcome u1)") && v5ev.includes(`(publish-time u${at2})`));
  const g = (label) => uintOf(steps.find((x) => x.label === label).raw);
  check("W3 IOC: B's STX grew back by the unfilled remainder (> 100 STX)", g("W3b B STX after O5 settled") - g("W0b B STX after placing O5"), (d) => d > 100_000_000n);
  check("W3 IOC: B's sats grew by the fill", g("W3c B sats after O5 settled") - g("W0c B sats after placing O5"), (d) => d > 0n);
  check("Y2 refused bid: S's STX back within fees", g("Y2c S STX back (minus fees)") + 100_000n >= g("Y2a S STX before the crossing bid"), (v) => v === true);
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
