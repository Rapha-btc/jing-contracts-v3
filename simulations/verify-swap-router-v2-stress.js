// verify-swap-router-v2-stress.js
// Breadth test of the router on real Lazer updates: makers rest random bids
// and asks on the market, takers go through the router with random split
// swaps (random book share, random split over DLMM/XYK/Velar, fallback some
// or none) and random smart swaps (random size and limit), both directions.
// After EVERY router swap:
//   R1 receipt adds up: jing-in + dlmm-in + xyk-in + velar-in + unsold == amount
//   R2 the sold asset left the wallet by exactly amount - unsold
//   R3 the bought asset grew by exactly `out` (the Lazer oracle fee is u0)
//   R4 out == the sum of the reported legs
//   R5 smart swaps: every filled leg's price is at or above the limit
//      (within the 2 input units the router concedes and 1 output unit of
//      integer rounding: a dust leg's fair 1.02 sats pays 1 sat)
//   R6 the router holds nothing, ever (STX and sBTC balance u0)
// and every 10 actions the market's book invariants (escrow == deposits +
// parked + rebate pots, totals == lists, pots zero at rest).
// Every action must be (ok ...) or a documented refusal (router u3002 when
// nothing fits the limit / min-out; venue minimums u2003/u1019/u1020/u107;
// market gate u1022, FOK u1023, u1008/u1012/u1028; token u1/u3).
// SEED / STEPS / DEPLOYED as in the market stress harness.
// Run: PYTH_API_KEY=<key> [DEPLOYED=1] [SEED=7] [STEPS=50] npx tsx simulations/verify-swap-router-v2-stress.js
import fs from "node:fs";
import { uintCV, contractPrincipalCV, stringAsciiCV, bufferCV, tupleCV, someCV, noneCV, standardPrincipalCV, cvToString, deserializeCV, getAddressFromPrivateKey } from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";
import { STX_DEPOSITOR_1, SBTC_DEPOSITOR_1, SBTC_ADDR, SBTC_NAME, SBTC_ASSET_NAME, SBTC_FQN, WSTX_ADDR, WSTX_NAME, WSTX_ASSET_NAME } from "./_setup.js";

const DEPLOYED = process.env.DEPLOYED === "1";
const SEED = Number(process.env.SEED ?? 7);
const STEPS = Number(process.env.STEPS ?? 50);
const CHAVITA = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
// chavita in both modes: the local router v2 file names chavita's market
// (JING_MARKET), so the local copies must deploy under that address too
const DEPLOYER = CHAVITA;
const CORE = "jing-core-v3";
const MARKET_FILE = "markets-sbtc-stx-jing-v4", ROUTER_FILE = "swap-router-sbtc-stx-jing-v2";
const MARKET = DEPLOYED ? "markets-sbtc-stx-jingswap" : MARKET_FILE;
const ROUTER = DEPLOYED ? "swap-router-sbtc-stx-jingswap" : ROUTER_FILE;
const CID = `${DEPLOYER}.${MARKET}`, RID = `${DEPLOYER}.${ROUTER}`, CORE_ID = `${DEPLOYER}.${CORE}`;
const STACKS_NODE_API = "http://77.42.3.101/stacks-api";
const PP = 100_000_000n, SCALE = PP * 100n;
const MIN_SBTC = 1000n, MIN_STX = 1_000_000n, HUGE = 999_999_999_999_999n;
const DLMM = 1n, XYK = 2n, VELAR = 3n;
const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME), wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME), wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const coreSrc = fs.readFileSync(new URL(`../contracts/${CORE}.clar`, import.meta.url), "utf8");
const mktSrc = fs.readFileSync(new URL(`../contracts/${MARKET_FILE}.clar`, import.meta.url), "utf8");
const routerSrc = fs.readFileSync(new URL(`../contracts/${ROUTER_FILE}.clar`, import.meta.url), "utf8");
const OK_ERRS = new Set(["u1", "u3", "u3002", "u2003", "u1019", "u1020", "u107", "u1001", "u1008", "u1012", "u1022", "u1023", "u1024", "u1026", "u1028"]);

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (lo, hi) => lo + BigInt(Math.floor(rnd() * Number(hi - lo + 1n)));

let checks = 0, failures = 0;
function check(label, actual, want) {
  checks += 1;
  const ok = typeof want === "function" ? want(actual) : String(actual) === want;
  if (!ok) failures += 1;
  if (!ok || process.env.VERBOSE) console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 150)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 70) : want})`}`);
}
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return String(r.Ok); } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const field = (s, k) => BigInt((String(s).match(new RegExp(`\\(${k} u(\\d+)\\)`)) || [, "0"])[1]);
const okPrefix = (v) => String(v).startsWith("(ok");

async function main() {
  console.log(`=== router v2 STRESS (seed ${SEED}, ${STEPS} actions) ===`);
  const lz = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const VAA = someCV(UPD), NO_VAA = noneCV();
  const MID = (lz.px * PP) / lz.py;
  console.log(`mid ${MID} (1 STX ~ ${(10n ** 16n) / MID} sats); ${DEPLOYED ? "DEPLOYED " + RID + " on " + CID : "local v4 + router v2"}`);

  const S = STX_DEPOSITOR_1, T = SBTC_DEPOSITOR_1;
  const makers = Array.from({ length: 6 }, (_, k) => getAddressFromPrivateKey(String(k + 1).repeat(64) + "01", "mainnet"));
  const parties = [S, T, ...makers];
  const steps = [];
  let b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  const call = (sender, fn, args, cid) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); const slot = { label, kind: "tx", want, raw: null }; steps.push(slot); return slot; };
  const cap = (label, code, cid) => { b = b.addEvalCode(cid, code); const slot = { label, kind: "eval", capture: true, value: null, raw: null }; steps.push(slot); return slot; };
  const amts = (d, x, v) => tupleCV({ dlmm: uintCV(d), xyk: uintCV(x), velar: uintCV(v) });
  const ONES = amts(1n, 1n, 1n);

  if (!DEPLOYED) {
    // jing-core-v3 is LIVE at chavita: never deployed here
    tx("deploy market v4", (bb) => bb.withSender(DEPLOYER).addContractDeploy({ contract_name: MARKET, source_code: mktSrc }), okPrefix);
    tx("deploy router v2", (bb) => bb.withSender(DEPLOYER).addContractDeploy({ contract_name: ROUTER, source_code: routerSrc }), okPrefix);
  }
  tx("verify market in core", call(DEPLOYER, "set-verified-contract", [contractPrincipalCV(DEPLOYER, MARKET)], CORE_ID), (v) => v === "(ok true)" || (DEPLOYED && v === "(err u5002)"));
  tx("initialize", call(DEPLOYER, "initialize", [contractPrincipalCV(DEPLOYER, MARKET), contractPrincipalCV(SBTC_ADDR, SBTC_NAME), contractPrincipalCV(WSTX_ADDR, WSTX_NAME), uintCV(MIN_SBTC), uintCV(MIN_STX), uintCV(1n), uintCV(45n)], CID), (v) => v === "(ok true)" || (DEPLOYED && v === "(err u1018)"));
  for (const m of makers) {
    tx(`fund ${m.slice(0, 8)} STX`, (bb) => bb.withSender(S).addSTXTransfer({ recipient: m, amount: 40_000_000 }), () => true);
    tx(`fund ${m.slice(0, 8)} sBTC`, (bb) => bb.withSender(T).addContractCall({ contract_id: SBTC_FQN, function_name: "transfer", function_args: [uintCV(200_000n), standardPrincipalCV(T), standardPrincipalCV(m), noneCV()] }), okPrefix);
  }

  const stxOf = (who, tag) => cap(`${tag} stx ${who.slice(0, 6)}`, `(stx-get-balance '${who})`, RID);
  const sbtcOf = (who, tag) => cap(`${tag} sbtc ${who.slice(0, 6)}`, `(get-balance '${who})`, SBTC_FQN);
  const book = (tag) => {
    const out = { y: {}, x: {}, yNext: {}, xNext: {}, yPark: {}, xPark: {} };
    out.totals = cap(`${tag} totals`, "(get-cycle-totals (get-current-cycle))", CID);
    out.totalsNext = cap(`${tag} totals next`, "(get-cycle-totals (+ u1 (get-current-cycle)))", CID);
    out.rebX = cap(`${tag} pending-rebate-x`, "(var-get pending-rebate-x)", CID);
    out.rebY = cap(`${tag} pending-rebate-y`, "(var-get pending-rebate-y)", CID);
    out.stx = cap(`${tag} escrow stx`, `(stx-get-balance '${CID})`, RID);
    out.sbtc = cap(`${tag} escrow sbtc`, `(get-balance '${CID})`, SBTC_FQN);
    for (const p of parties) {
      out.y[p] = cap(`${tag} y ${p.slice(0, 6)}`, `(get-token-y-deposit (get-current-cycle) '${p})`, CID);
      out.x[p] = cap(`${tag} x ${p.slice(0, 6)}`, `(get-token-x-deposit (get-current-cycle) '${p})`, CID);
      out.yNext[p] = cap(`${tag} y+1 ${p.slice(0, 6)}`, `(get-token-y-deposit (+ u1 (get-current-cycle)) '${p})`, CID);
      out.xNext[p] = cap(`${tag} x+1 ${p.slice(0, 6)}`, `(get-token-x-deposit (+ u1 (get-current-cycle)) '${p})`, CID);
      out.yPark[p] = cap(`${tag} ypark ${p.slice(0, 6)}`, `(get-token-y-parked '${p})`, CID);
      out.xPark[p] = cap(`${tag} xpark ${p.slice(0, 6)}`, `(get-token-x-parked '${p})`, CID);
    }
    return out;
  };

  const swaps = [];
  const checkpoints = [];
  const makerLimit = (side) => { const bps = BigInt(Math.floor(rnd() * 400) - 200); const l = (MID * (10_000n + bps)) / 10_000n; return side === "y" ? (rnd() < 0.4 ? HUGE : l) : (rnd() < 0.4 ? 1n : l); };
  for (let k = 0; k < STEPS; k++) {
    const r = rnd();
    if (r < 0.30) { // makers rest
      const who = pick(makers);
      if (rnd() < 0.5) { const amt = between(MIN_STX, 15_000_000n); tx(`#${k} ${who.slice(0, 6)} bids ${amt}`, call(who, "deposit-token-y", [uintCV(amt), uintCV(makerLimit("y")), UPD, wstxTrait, wstxAsset], CID), (v) => okPrefix(v) || OK_ERRS.has((String(v).match(/\(err (u\d+)\)/) || [])[1])); }
      else { const amt = between(MIN_SBTC, 40_000n); tx(`#${k} ${who.slice(0, 6)} asks ${amt}`, call(who, "deposit-token-x", [uintCV(amt), uintCV(makerLimit("x")), UPD, sbtcTrait, sbtcAsset], CID), (v) => okPrefix(v) || OK_ERRS.has((String(v).match(/\(err (u\d+)\)/) || [])[1])); }
    } else if (r < 0.38) { // a maker cancels
      const who = pick(makers); const side = rnd() < 0.5 ? "y" : "x";
      tx(`#${k} ${who.slice(0, 6)} cancels ${side}`, call(who, side === "y" ? "cancel-token-y-deposit" : "cancel-token-x-deposit", side === "y" ? [wstxTrait, wstxAsset] : [sbtcTrait, sbtcAsset], CID), (v) => okPrefix(v) || OK_ERRS.has((String(v).match(/\(err (u\d+)\)/) || [])[1]));
    } else { // a taker through the router
      const sellSbtc = rnd() < 0.5; const taker = sellSbtc ? T : S;
      const amount = sellSbtc ? between(2_000n, 80_000n) : between(2_000_000n, 60_000_000n);
      const smart = rnd() < 0.5;
      let label, fn, limit = null;
      if (smart) {
        const bps = BigInt(50 + Math.floor(rnd() * 350)); // 0.5% .. 4%
        limit = sellSbtc ? (MID * (10_000n - bps)) / 10_000n : (MID * (10_000n + bps)) / 10_000n;
        const withBook = rnd() < 0.7;
        label = `#${k} SMART ${sellSbtc ? "T sells" : "S sells"} ${amount} @ ${bps}bps ${withBook ? "with book" : "no book"}`;
        fn = call(taker, sellSbtc ? "smart-swap-sbtc-for-stx" : "smart-swap-stx-for-sbtc", [uintCV(amount), uintCV(limit), withBook ? VAA : NO_VAA, uintCV(1n)], RID);
      } else {
        const jing = rnd() < 0.6 ? between(0n, amount) : 0n;
        const rest = amount - jing;
        const a = between(0n, rest), c = between(0n, rest - a); const d = rest - a - c;
        const fb = rnd() < 0.5 ? someCV(uintCV(pick([DLMM, XYK, VELAR]))) : noneCV();
        label = `#${k} SPLIT ${sellSbtc ? "T sells" : "S sells"} ${amount}: jing ${jing} dlmm ${a} xyk ${c} velar ${d} fb ${cvToString(fb)}`;
        fn = call(taker, sellSbtc ? "swap-sbtc-for-stx" : "swap-stx-for-sbtc", [uintCV(amount), uintCV(jing), uintCV(sellSbtc ? 1n : HUGE), jing > 0n ? VAA : NO_VAA, fb, amts(a, c, d), ONES, uintCV(1n)], RID);
      }
      const s0 = sbtcOf(taker, `#${k} before`), x0 = stxOf(taker, `#${k} before`);
      const slot = tx(label, fn, (v) => okPrefix(v) || OK_ERRS.has((String(v).match(/\(err (u\d+)\)/) || [])[1]));
      const s1 = sbtcOf(taker, `#${k} after`), x1 = stxOf(taker, `#${k} after`);
      const rs = sbtcOf(RID, `#${k} router`), rx = stxOf(RID, `#${k} router`);
      swaps.push({ k, slot, sellSbtc, amount, smart, limit, s0, x0, s1, x1, rs, rx });
    }
    if ((k + 1) % 10 === 0 || k === STEPS - 1) checkpoints.push({ k, book: book(`cp${k}`) });
  }

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid);
  const s = res.steps;
  let i = 0;
  for (const st of steps) {
    while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1;
    const raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]);
    i += 1;
    st.raw = raw;
    if (st.capture) st.value = uintOf(raw);
    else check(st.label, raw, st.want);
  }
  const dist = {};
  for (const sw of swaps) { const key = okPrefix(sw.slot.raw) ? "ok" : (String(sw.slot.raw).match(/\(err (u\d+)\)/) || [, String(sw.slot.raw).slice(0, 20)])[1]; dist[key] = (dist[key] || 0) + 1; }
  console.log("  router swap outcomes:", JSON.stringify(dist));
  let filled = 0, bookFills = 0;
  for (const sw of swaps) {
    const r = sw.slot.raw; if (!okPrefix(r)) continue;
    filled += 1;
    const legsIn = ["jing-in", "dlmm-in", "xyk-in", "velar-in"].reduce((t, kk) => t + field(r, kk), 0n);
    const legsOut = ["jing-out", "dlmm-out", "xyk-out", "velar-out"].reduce((t, kk) => t + field(r, kk), 0n);
    const unsold = field(r, "unsold"), out = field(r, "out");
    if (field(r, "jing-in") > 0n) bookFills += 1;
    check(`#${sw.k} R1 legs + unsold == amount`, legsIn + unsold, (t) => t === sw.amount);
    const soldDelta = sw.sellSbtc ? sw.s0.value - sw.s1.value : sw.x0.value - sw.x1.value;
    const boughtDelta = sw.sellSbtc ? sw.x1.value - sw.x0.value : sw.s1.value - sw.s0.value;
    check(`#${sw.k} R2 sold asset left by amount - unsold`, soldDelta, (d) => d === sw.amount - unsold);
    check(`#${sw.k} R3 bought asset grew by out`, boughtDelta, (d) => d === out);
    check(`#${sw.k} R4 out == sum of legs`, legsOut, (t) => t === out);
    if (sw.smart) for (const v of ["jing", "dlmm", "xyk", "velar"]) {
      const a = field(r, `${v}-in`), o = field(r, `${v}-out`); if (a === 0n) continue;
      const a2 = a > 2n ? a - 2n : 0n;
      // within the router's 2 input units of slack AND one output unit: a dust
      // leg whose fair output is 1.02 sats pays 1 sat, the integer floor
      check(`#${sw.k} R5 ${v} price >= limit within 2 in / 1 out units (${o}/${a})`, [a2, o + 1n], ([x, y]) => sw.sellSbtc ? y * SCALE >= x * sw.limit : y * sw.limit >= x * SCALE);
    }
  }
  for (const sw of swaps) check(`#${sw.k} R6 router holds nothing`, [sw.rs.value, sw.rx.value], ([a, c]) => a === 0n && c === 0n);
  console.log(`  router swaps that went through: ${filled}/${swaps.length}, with a book fill: ${bookFills}`);
  const sumOver = (obj) => Object.values(obj).reduce((t, c) => t + c.value, 0n);
  for (const cp of checkpoints) {
    const B = cp.book, tag = `cp#${cp.k}`;
    check(`${tag} I1 escrow sBTC == x deposits + parked + pending-rebate-x`, B.sbtc.value, (v) => v === sumOver(B.x) + sumOver(B.xNext) + sumOver(B.xPark) + B.rebX.value);
    check(`${tag} I1 escrow STX == y deposits + parked + pending-rebate-y`, B.stx.value, (v) => v === sumOver(B.y) + sumOver(B.yNext) + sumOver(B.yPark) + B.rebY.value);
    check(`${tag} I2 totals == lists (this cycle)`, [field(B.totals.raw, "total-token-x"), field(B.totals.raw, "total-token-y")], ([a, c]) => a === sumOver(B.x) && c === sumOver(B.y));
    check(`${tag} I2 totals == lists (next cycle)`, [field(B.totalsNext.raw, "total-token-x"), field(B.totalsNext.raw, "total-token-y")], ([a, c]) => a === sumOver(B.xNext) && c === sumOver(B.yNext));
    check(`${tag} I3 rebate pots zero at rest`, [B.rebX.value, B.rebY.value], ([a, c]) => a === 0n && c === 0n);
  }
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
