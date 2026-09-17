// verify-v7-router-v6-lazer.js
// SELF-VERIFYING stxer mainnet-fork harness for swap-router-sbtc-stx-jing-v6
// on markets-sbtc-stx-jing-v7 + jing-core-v6 (all three deployed here under
// the deployer; the ladder and the AMMs are the mainnet ones). Two real Lazer
// prints ~45 s apart, synthetic blocks around them (see the anchor harness).
//
//   block 0   deploy core-v6, v7, router v6; verify + initialize; makers rest a
//             pegged ask (A) and a pegged bid (S) with P2
//   S_a = P1 + 3   PLACE shape (update none): B swap-stx-for-sbtc 30 STX all on
//             the book -> jing-placed, order on the market keyed by B; a second
//             one while open -> the leg is refused and stays home (unsold);
//             ttl 10 -> u3005; C smart-swap-stx-for-sbtc 30 STX -> placed;
//             D swap-sbtc-for-stx 6000 sats -> placed
//   S_b = P2 - 5   settle-order B with P1 -> u1032, with P2 -> filled at mid2 + 20;
//             C and D settled by the KEEPER; B mixed split: 30 STX placed on the
//             book + 10 STX on XYK in one tx (AMM leg paid now, book leg later);
//             a placed leg with an unreachable jing-min-out refused at settlement
// Run: npx tsx simulations/verify-v7-router-v6-lazer.js
import fs from "node:fs";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV, trueCV, falseCV,
  noneCV, someCV, tupleCV, deserializeCV, cvToString, hexToCV, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdateAny, lazerFeedTimes } from "./_lazer.js";
import { installChunkedSubmit } from "./_chunked-submit.js";
installChunkedSubmit(50);

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v6", MKT = "markets-sbtc-stx-jing-v7", RTR = "swap-router-sbtc-stx-jing-v6";
const CORE_ID = `${DEP}.${CORE}`, MARKET = `${DEP}.${MKT}`, ROUTER = `${DEP}.${RTR}`;
const SBTC_ADDR = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", SBTC_NAME = "sbtc-token", SBTC = `${SBTC_ADDR}.${SBTC_NAME}`;
const WSTX_ADDR = "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", WSTX_NAME = "token-stx-v-1-2";
const sbtcT = contractPrincipalCV(SBTC_ADDR, SBTC_NAME), wstxT = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";
const B = "SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q";
const KEEPER = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3";
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + "01", "mainnet");
const C = mk(7), D = mk(8);
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
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 200)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`);
}
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 160)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 160)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|true|false|\\(some u\\d+\\))\\)`)) || [])[1];
const prints = (step) => (step?.Result?.Transaction?.Ok?.events || []).map((e) => { try { const o = typeof e === "string" ? JSON.parse(e) : e; const raw = o.contract_event?.raw_value; return raw ? cvToString(hexToCV(raw)) : ""; } catch { return ""; } });
const matchPrices = (step) => prints(step).filter((r) => r.includes('(event "match")')).map((r) => (r.match(/\(price u(\d+)\)/) || [])[1]);
const okish = (v) => String(v).startsWith("(ok");

async function main() {
  console.log("=== router v6 on market v7 + core-v6: placed and atomic book legs ===");
  let p1, p2, tip;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    tip = (await fetch(`${API}/extended/v2/blocks?limit=1`).then((r) => r.json())).results[0];
    // synthetic time starts at the tip's burn block: S_0 = P1 - 20 must lie after it
    const young = tip.burn_block_time + 35 - Math.floor(Date.now() / 1000);
    if (young > 0) { console.log(`burn block is ${35 - young} s old; waiting ${young} s`); await sleep(young * 1000); }
    p1 = await fetchLazerUpdateAny();
    console.log(`P1 at ${p1.ts.toFixed(1)} (burn base ${tip.burn_block_time}); sleeping 45 s`); await sleep(45_000);
    p2 = await fetchLazerUpdateAny();
    console.log(`P2 at ${p2.ts.toFixed(1)}`);
    const tip2 = (await fetch(`${API}/extended/v2/blocks?limit=1`).then((r) => r.json())).results[0];
    if (tip2.burn_block_time === tip.burn_block_time) break;
    console.log(`burn block moved; refetching (attempt ${attempt})`);
    if (attempt === 3) { console.error("burn block kept moving"); process.exit(2); }
  }
  const [f1, f2] = await Promise.all([lazerFeedTimes(p1.hex), lazerFeedTimes(p2.hex)]);
  const at1 = BigInt(f1.at), at2 = BigInt(f2.at);
  console.log(`feed times: P1 ${f1.x}/${f1.y} P2 ${f2.x}/${f2.y} (envelopes ${p1.ts} ${p2.ts})`);
  const U1 = bufferCV(Buffer.from(p1.hex, "hex")), U2 = bufferCV(Buffer.from(p2.hex, "hex"));
  const mid = (p) => (p.px * PP) / p.py;
  const MID1 = mid(p1), MID2 = mid(p2);
  const ask = (m) => (m * (10000n + BPS)) / 10000n;
  const S_0 = at1 - 20n, S_a = at1 + 3n, S_b = at2 - 5n;
  let lastT = BigInt(tip.burn_block_time);
  if (!(lastT < S_0 && S_0 < S_a && S_a < S_b && S_b - at1 < 80n)) { console.error("spacing off", { burn: lastT, at1, at2, S_a, S_b }); process.exit(2); }
  console.log(`mid1 ${MID1} mid2 ${MID2}; tip ${tip.height} time ${tip.block_time}; tip - P2 = ${BigInt(tip.block_time) - at2} s`);

  const steps = [];
  let b = SimulationBuilder.new();
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const settle = (sender, who, isX, upd) => call(sender, "settle-order", [standardPrincipalCV(who), isX ? trueCV() : falseCV(), upd, sbtcT, sbtcA, wstxT, wstxA]);
  const order = (who, isX) => `(get-order '${who} ${isX})`;
  const depX = (sender, amount, limit, spread, ttl) => call(sender, "deposit-token-x", [uintCV(amount), uintCV(limit), spread, uintCV(ttl), sbtcT]);
  const depY = (sender, amount, limit, spread, ttl) => call(sender, "deposit-token-y", [uintCV(amount), uintCV(limit), spread, uintCV(ttl), wstxT]);
  const stxSend = (to, ustx) => (bb) => bb.withSender(S).addSTXTransfer({ recipient: to, amount: Number(ustx) });
  const satsSend = (to, sats) => call(A, "transfer", [uintCV(sats), standardPrincipalCV(A), standardPrincipalCV(to), noneCV()], SBTC);
  const advanceTo = (label, t) => { b = b.addAdvanceBlocks({ bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: Number(t - lastT) }); lastT = t; steps.push({ label: `advance -> ${label} (${t})`, kind: "advance" }); };
  const time = (label, want) => ev(label, "{t: stacks-block-time}", want);
  const zero3 = tupleCV({ dlmm: uintCV(0), xyk: uintCV(0), velar: uintCV(0) });
  const amm = (xyk) => tupleCV({ dlmm: uintCV(0), xyk: uintCV(xyk), velar: uintCV(0) });
  // router entries: (amount jing-amount limit ttl jing-min-out fallback amm-amounts amm-mins min-out)
  const rSellStx = (sender, amount, jing, limit, ttl, amms = zero3, minOut = 0, jingMinOut = 0) => call(sender, "swap-stx-for-sbtc", [uintCV(amount), uintCV(jing), uintCV(limit), uintCV(ttl), uintCV(jingMinOut), noneCV(), amms, zero3, uintCV(minOut)], ROUTER);
  const rSellSats = (sender, amount, jing, limit, ttl) => call(sender, "swap-sbtc-for-stx", [uintCV(amount), uintCV(jing), uintCV(limit), uintCV(ttl), uintCV(0), noneCV(), zero3, zero3, uintCV(0)], ROUTER);
  const rSmartSellStx = (sender, amount, limit, ttl, m) => call(sender, "smart-swap-stx-for-sbtc", [uintCV(amount), uintCV(limit), uintCV(ttl), uintCV(m), uintCV(0)], ROUTER);
  const LIM_SELL_STX = (m) => (m * 103n) / 100n, LIM_SELL_SATS = (m) => (m * 97n) / 100n;

  // ---- block 0 ----
  deploy(CORE, src(CORE)); deploy(MKT, src(MKT)); deploy(RTR, src(RTR));
  tx("core-v6 verifies v7", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(ok true)");
  tx("v7 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)");
  tx("fund C 100 STX", stxSend(C, 100_000_000n), okish);
  tx("fund D 10 STX", stxSend(D, 10_000_000n), okish);
  tx("fund D 20000 sats", satsSend(D, 20000n), "(ok true)");
  ev("router min deposits read through v7", "(get-jing-min-deposits)", (v) => String(v).includes("min-token-x"), ROUTER);

  // ---- S_0: makers rest 20 s before P1, so the cycle anchor predates every print ----
  advanceTo("S_0 = P1 - 20", S_0);
  tx("M A submits a pegged ask +20 bps, 200k sats (y side empty: rests at once)", depX(A, 200_000, (MID1 * 90n) / 100n, someCV(uintCV(20)), 300), okish);
  tx("M S submits a pegged bid -20 bps, 600 STX (x side rests: pending)", depY(S, 600_000_000, (MID1 * 110n) / 100n, someCV(uintCV(20)), 300), okish);
  tx("M KEEPER settles S with P1 -> rested", settle(KEEPER, S, false, U1), "(ok u0)");

  // ---- S_a: PLACE shape ----
  advanceTo("S_a = P1 + 3", S_a);
  time("S_a clock", (v) => uintOf(field(v, "t")) === S_a);
  const r1 = tx("R1 B router sells 30 STX, all on the book, update none, ttl 300 -> placed", rSellStx(B, 30_000_000, 30_000_000, LIM_SELL_STX(MID1), 300), (v) => okish(v) && field(v, "jing-placed") === "true" && field(v, "jing-in") === "u30000000" && field(v, "jing-out") === "u0" && field(v, "unsold") === "u0");
  ev("R1 market holds B's anchored order (y side, 30 STX, placed-at S_a)", order(B, false), (v) => field(v, "amount") === "u30000000" && field(v, "kind") === "u1" && field(v, "placed-at") === `u${S_a}`);
  tx("R2 B again while open: the leg is refused (u1029 inside) and stays home", rSellStx(B, 30_000_000, 30_000_000, LIM_SELL_STX(MID1), 300), (v) => okish(v) && field(v, "jing-ok") === "false" && field(v, "jing-placed") === "false" && field(v, "unsold") === "u30000000");
  tx("R3 ttl 10 with update none -> u3005", rSellStx(C, 30_000_000, 30_000_000, LIM_SELL_STX(MID1), 10), "(err u3005)");
  tx("R3b ttl 10 with jing u0 is fine (no book leg): 1 STX on XYK alone", rSellStx(C, 1_000_000, 0, LIM_SELL_STX(MID1), 10, amm(1_000_000)), (v) => okish(v) && field(v, "xyk-in") === "u1000000" && field(v, "jing-placed") === "false");
  const r4 = tx("R4 C smart-swap sells 30 STX, update none -> sized on chain, placed", rSmartSellStx(C, 30_000_000, LIM_SELL_STX(MID1), 300, MID1), (v) => okish(v) && field(v, "jing-placed") === "true" && field(v, "jing-in") === "u30000000" && field(v, "unsold") === "u0");
  ev("R4 C's order on the market", order(C, false), (v) => field(v, "amount") === "u30000000");
  tx("R5 D router sells 6000 sats, all on the book, update none -> placed (x side)", rSellSats(D, 6000, 6000, LIM_SELL_SATS(MID1), 300), (v) => okish(v) && field(v, "jing-placed") === "true" && field(v, "jing-in") === "u6000");
  ev("R5 D's order: x side", order(D, true), (v) => field(v, "kind") === "u1" && field(v, "amount") === "u6000");

  // ---- S_b: settlement, mixed split, atomic shape ----
  advanceTo("S_b = P2 - 5", S_b);
  time("S_b clock", (v) => uintOf(field(v, "t")) === S_b);
  tx("T1 KEEPER settle B with P1 -> u1032 (older than the placing block)", settle(KEEPER, B, false, U1), "(err u1032)");
  const t2 = tx("T2 KEEPER settles B with P2 -> filled, B paid by the market", settle(KEEPER, B, false, U2), "(ok u1)");
  const t3 = tx("T3 KEEPER settles C with P2 -> filled", settle(KEEPER, C, false, U2), "(ok u1)");
  const t4 = tx("T4 KEEPER settles D with P2 -> filled (walks S's bid)", settle(KEEPER, D, true, U2), "(ok u1)");
  ev("T4 no order left for B, C, D", `(list ${order(B, false)} ${order(C, false)} ${order(D, true)})`, "(list none none none)");
  ev("X0 B sats before the mixed split", `(contract-call? '${SBTC} get-balance '${B})`, () => true);
  const x1 = tx("X1 B mixed: 40 STX = 30 on the book (placed) + 10 on XYK, one tx", rSellStx(B, 40_000_000, 30_000_000, LIM_SELL_STX(MID2), 300, amm(10_000_000)), (v) => okish(v) && field(v, "jing-placed") === "true" && field(v, "jing-in") === "u30000000" && field(v, "xyk-in") === "u10000000" && uintOf(field(v, "xyk-out")) > 0n && field(v, "out") === field(v, "xyk-out"));
  ev("X0b B sats after: grew by the XYK leg only", `(contract-call? '${SBTC} get-balance '${B})`, () => true);
  tx("Y4 PLACE with jing-min-out 1 BTC: placed (the market checks it at settlement)", rSellStx(C, 30_000_000, 30_000_000, LIM_SELL_STX(MID2), 300, zero3, 0, 100_000_000), (v) => okish(v) && field(v, "jing-placed") === "true");
  tx("Y4b KEEPER settles C with P2 -> u1035, order waits", settle(KEEPER, C, false, U2), "(err u1035)");
  ev("Y4c C's order carries the min-out", order(C, false), (v) => field(v, "min-out") === "u100000000");

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
  for (const [label, st] of [["T2", t2], ["T3", t3]]) check(`${label} fill at mid2 + 20 bps (${ask(MID2)})`, px(st).join(","), (v) => px(st).length >= 1 && px(st).every((p) => p === String(ask(MID2))));
  const r1ev = prints(s[r1.idx]).find((r) => r.includes('(event "place-order")')) || "";
  check("R1 core-v6 logged place-swap for B (market field = v7)", r1ev.slice(0, 120), (v) => r1ev.includes(B) && r1ev.includes(MKT));
  const t2ev = prints(s[t2.idx]).find((r) => r.includes('(event "settle-order")')) || "";
  check("T2 core-v6 logged settle-swap: settler KEEPER, publish-time P2", t2ev.slice(0, 120), (v) => t2ev.includes(KEEPER) && t2ev.includes(`(publish-time u${at2})`));
  const before = uintOf(steps.find((x) => x.label === "X0 B sats before the mixed split").raw), after = uintOf(steps.find((x) => x.label === "X0b B sats after: grew by the XYK leg only").raw);
  check("X1 B's sats grew by exactly the XYK leg", after - before, (d) => d === uintOf(field(x1.raw, "xyk-out")));
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
