// verify-v6-band-mixed-fill-lazer.js
// A seated BAND rung and direct limit makers on the SAME side, crossed by
// one taker in one settlement (PYTH_API_KEY):
//   B side (x): jing-buy-stx-spread-20 (seated, A rests 20,000 sats, ask at
//   mid + 20 bps under the miner band), D1 a fixed ask 10,000 at +10 bps,
//   D2 a zero-spread peg 5,000 at the mid. A taker sells STX with limit
//   +30 bps: the batch clears D2 at the mid (the only in-range ask), the
//   walk then takes D1 (+10) whole and part of the rung (+20) in price
//   order; the rung's sync folds the fill in, A claims the STX.
//   S side (y): jing-sell-stx-spread-20 (seated, S rests 50 STX, bid at mid
//   - 20 bps), B1 a fixed bid 30 STX at -10 bps, B2 a zero-spread peg 20
//   STX at the mid. A taker sells sBTC with limit -30 bps: B2 clears at the
//   mid, the walk takes B1 whole and part of the rung.
// Run: PYTH_API_KEY=<key> npx tsx simulations/verify-v6-band-mixed-fill-lazer.js
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
// comment-only lines stripped before deploying: the v6 market crossed the
// 100,000-byte deploy limit with its comments (2026-09-15); the deploy form
// is comment-free anyway, same strip as verify-markets-v6-gaps.js
const stripComments = (t) => t.split("\n").filter((l) => !/^\s*;;/.test(l)).join("\n");
const src = (f) => stripComments(fs.readFileSync(`./contracts/${f}.clar`, "utf8"));
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|\\(some u\\d+\\))\\)`)) || [])[1];
const prints = (step) => (step?.Result?.Transaction?.Ok?.events || []).map((e) => { try { const o = typeof e === "string" ? JSON.parse(e) : e; const raw = o.contract_event?.raw_value; return raw ? cvToString(hexToCV(raw)) : ""; } catch { return ""; } });
const grossFor = (net) => { let a = (net * BPS) / (BPS - REB); while (a - (a * REB) / BPS < net) a += 1n; return a; };

async function main() {
  console.log("=== v6 band rung + direct makers on the same side, one taker ===");
  const lz = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const MID = (lz.px * PP) / lz.py;
  const PB = (s) => (MID * (BPS - s)) / BPS, PA = (s) => (MID * (BPS + s)) / BPS;
  const USTX_PER_SAT = MID / PPDF;
  console.log(`mid ${MID} (1 sat ~ ${USTX_PER_SAT} uSTX, 1 STX ~ ${(10n ** 16n) / MID} sats)`);

  const LADDER = `${DEP}.jing-ladder`;
  const BUY = "jing-buy-stx-spread-20", SELL = "jing-sell-stx-spread-20", BID = `${DEP}.${BUY}`, SID = `${DEP}.${SELL}`;
  const D1 = mk(85), D2 = mk(86), T1 = mk(87), B1 = mk(88), B2 = mk(89), T2 = mk(93);
  const RUNG_X = 20_000n, D1_AMT = 10_000n, D2_AMT = 5_000n;
  const RUNG_Y = 50_000_000n, B1_AMT = 30_000_000n, B2_AMT = 20_000_000n;
  // taker 1 (sells STX): enough for D2 at mid + D1 at +10 + ~6,000 of the rung at +20, plus a fee margin
  const T1_NET = ((D2_AMT * MID + D1_AMT * PA(10n) + 6_000n * PA(20n)) / PPDF) * 1002n / 1000n;
  // taker 2 (sells sBTC): enough for B2 at mid + B1 at -10 + ~6 STX of the rung at -20, plus margin
  const T2_NET = ((B2_AMT * PPDF) / MID + (B1_AMT * PPDF) / PB(10n) + (6_000_000n * PPDF) / PB(20n)) * 1002n / 1000n;

  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const sp = (s) => (s === null ? noneCV() : someCV(uintCV(s)));
  const depX = (who, amt, limit, spread) => call(who, "deposit-token-x", [uintCV(amt), uintCV(limit), sp(spread), UPD, sbtcT, sbtcA]);
  const depY = (who, amt, limit, spread) => call(who, "deposit-token-y", [uintCV(amt), uintCV(limit), sp(spread), UPD, wstxT, wstxA]);
  const swap = (who, amount, limit, depXSide) => call(who, "swap", [uintCV(amount), uintCV(limit), UPD, sbtcT, sbtcA, wstxT, wstxA, depXSide ? trueCV() : falseCV()]);
  const stxSend = (to, ustx) => (bb) => bb.withSender(S).addSTXTransfer({ recipient: to, amount: Number(ustx) });
  const satsSend = (to, sats) => call(A, "transfer", [uintCV(sats), standardPrincipalCV(A), standardPrincipalCV(to), noneCV()], SBTC);
  const depOfX = (c, who) => `(get-token-x-deposit u${c} '${who})`, depOfY = (c, who) => `(get-token-y-deposit u${c} '${who})`;
  const okTrue = "(ok true)";

  deploy(CORE, src(CORE)); deploy("jing-ladder", src("jing-ladder")); deploy(MKT, src(MKT));
  tx("core-v5 verifies v6", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), okTrue);
  tx("v6 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(MIN_SBTC), uintCV(MIN_STX), uintCV(1), uintCV(45)]), okTrue);
  deploy(BUY, src("jing-buy-stx-core-spread")); deploy(SELL, src("jing-sell-stx-core-spread"));
  tx("canonical buy-band", call(DEP, "set-canonical", [stringAsciiCV("buy-band"), contractPrincipalCV(DEP, BUY)], LADDER), okTrue);
  tx("canonical sel-band", call(DEP, "set-canonical", [stringAsciiCV("sel-band"), contractPrincipalCV(DEP, SELL)], LADDER), okTrue);
  tx("init buy rung (seated)", call(DEP, "initialize", [uintCV(20), trueCV()], BID), okTrue);
  tx("init sell rung (seated)", call(DEP, "initialize", [uintCV(20), trueCV()], SID), okTrue);
  for (const [who, ustx, sats] of [[D1, 1_000_000n, D1_AMT + 100n], [D2, 1_000_000n, D2_AMT + 100n], [T1, grossFor(T1_NET) + 1_000_000n, 0n], [B1, B1_AMT + 1_000_000n, 0n], [B2, B2_AMT + 1_000_000n, 0n], [T2, 1_000_000n, grossFor(T2_NET) + 100n]]) {
    tx(`fund ${who.slice(0, 6)} stx`, stxSend(who, ustx), (v) => String(v).startsWith("(ok"));
    if (sats > 0n) tx(`fund ${who.slice(0, 6)} sats`, satsSend(who, sats), okTrue);
  }

  // ---- X side: buy-band rung + two direct asks, one STX seller ----
  tx("X1 A deposits 20,000 sats into the seated buy rung (ask at mid + 20 bps, floor = miner band)", call(A, "deposit", [uintCV(RUNG_X), UPD], BID), okTrue);
  ev("X1 the rung rests 20,000 on the market", depOfX(0, BID), `u${RUNG_X}`);
  ev("X1 the rung's order is (some u20)", `(get-token-x-order '${BID})`, (v) => field(v, "spread-bps") === "(some u20)");
  tx("X2 D1 fixed ask 10,000 at +10 bps", depX(D1, D1_AMT, PA(10n), null), `(ok u${D1_AMT})`);
  tx("X3 D2 zero-spread peg 5,000 at the mid", depX(D2, D2_AMT, (MID * 90n) / 100n, 0n), `(ok u${D2_AMT})`);
  ev("X3 three asks on the side: rung, D1, D2", "(len (get-token-x-depositors u0))", "u3");
  ev("X3 the rung holds its seat", `(is-protected-x '${BID})`, "true");
  const xs = tx("X4 T1 sells STX, limit +30 bps: D2 clears in the batch at the mid, the walk takes D1 (+10) then part of the rung (+20)", swap(T1, grossFor(T1_NET), PA(30n), false), (v) => String(v).startsWith("(ok"));
  ev("X5 cycle u1", "(get-current-cycle)", "u1");
  ev("X5 settlement u0 at the mid", "(get price (unwrap-panic (get-settlement u0)))", `u${MID}`);
  ev("X6 D2 fully filled (batch)", depOfX(1, D2), "u0");
  ev("X6 D1 fully filled (walk, +10 first)", depOfX(1, D1), "u0");
  const rungLeft = ev("X6 the rung partly filled (walk, +20 second): between 12,000 and 16,000 left", depOfX(1, BID), (v) => uintOf(v) > 12_000n && uintOf(v) < 16_000n);
  ev("X6 D1 got STX", `(stx-get-balance '${D1})`, (v) => uintOf(v) > 1_000_000n);
  ev("X6 D2 got STX", `(stx-get-balance '${D2})`, (v) => uintOf(v) > 1_000_000n);
  tx("X7 anyone syncs the rung: the fill folds into the indices", call(T1, "sync", [], BID), okTrue);
  ev("X7 the rung's state: resting = what is left on the market, STX accrued", "(get-state)", (v) => uintOf(field(v, "resting")) > 12_000n && uintOf(field(v, "proceeds-index")) > 0n, BID);
  ev("X7 A's position: unsold sats + STX owed", `(get-position '${A})`, (v) => uintOf(field(v, "stx")) > 0n, BID);
  const aStx0 = ev("X8 A's STX before claim", `(stx-get-balance '${A})`, () => true);
  tx("X8 A claims", call(A, "claim", [], BID), okTrue);
  const aStx1 = ev("X8 A's STX after claim", `(stx-get-balance '${A})`, () => true);
  ev("X8 A's position: nothing more owed", `(get-position '${A})`, (v) => field(v, "stx") === "u0", BID);

  // ---- Y side: sell-band rung + two direct bids, one sBTC seller ----
  tx("Y1 S deposits 50 STX into the seated sell rung (bid at mid - 20 bps, cap = miner band)", call(S, "deposit", [uintCV(RUNG_Y), UPD], SID), okTrue);
  ev("Y1 the rung rests 50 STX on the market", depOfY(1, SID), `u${RUNG_Y}`);
  tx("Y2 B1 fixed bid 30 STX at -10 bps", depY(B1, B1_AMT, PB(10n), null), `(ok u${B1_AMT})`);
  tx("Y3 B2 zero-spread peg bid 20 STX at the mid", depY(B2, B2_AMT, HUGE, 0n), `(ok u${B2_AMT})`);
  ev("Y3 three bids on the side: rung, B1, B2", "(len (get-token-y-depositors u1))", "u3");
  ev("Y3 the rung holds its seat on y", `(is-protected-y '${SID})`, "true");
  const ys = tx("Y4 T2 sells sBTC, limit -30 bps: B2 clears in the batch at the mid, the walk takes B1 (-10) then part of the rung (-20)", swap(T2, grossFor(T2_NET), PB(30n), true), (v) => String(v).startsWith("(ok"));
  ev("Y5 cycle u2", "(get-current-cycle)", "u2");
  ev("Y6 B2 fully filled (batch)", depOfY(2, B2), "u0");
  ev("Y6 B1 fully filled (walk, -10 first)", depOfY(2, B1), "u0");
  ev("Y6 the rung partly filled (walk, -20 second): between 40 and 46 STX left", depOfY(2, SID), (v) => uintOf(v) > 40_000_000n && uintOf(v) < 46_000_000n);
  ev("Y6 B1 got sats", `(contract-call? '${SBTC} get-balance '${B1})`, (v) => uintOf(v) > 0n);
  ev("Y6 B2 got sats", `(contract-call? '${SBTC} get-balance '${B2})`, (v) => uintOf(v) > 0n);
  tx("Y7 anyone syncs the sell rung", call(T2, "sync", [], SID), okTrue);
  ev("Y7 S's position: unsold STX + sats owed", `(get-position '${S})`, (v) => uintOf(field(v, "sbtc")) > 0n, SID);
  const sSats0 = ev("Y8 S's sats before claim", `(contract-call? '${SBTC} get-balance '${S})`, () => true);
  tx("Y8 S claims", call(S, "claim", [], SID), okTrue);
  const sSats1 = ev("Y8 S's sats after claim", `(contract-call? '${SBTC} get-balance '${S})`, () => true);

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; if (typeof st.want === "function" && st.want.length === 0) continue; check(st.label, st.raw, st.want); }
  const matches = (st) => prints(s[st.idx]).filter((p) => p.includes('(event "match")')).map((p) => (p.match(/\(price u(\d+)\)/) || [])[1]);
  check(`X4 two walk fills in price order: +10 (${PA(10n)}) then +20 (${PA(20n)})`, matches(xs).join(","), `${PA(10n)},${PA(20n)}`);
  check(`Y4 two walk fills in price order: -10 (${PB(10n)}) then -20 (${PB(20n)})`, matches(ys).join(","), `${PB(10n)},${PB(20n)}`);
  check("X8 A's claim moved STX", uintOf(aStx1.raw) - uintOf(aStx0.raw), (d) => d > 0n);
  check("Y8 S's claim moved sats", uintOf(sSats1.raw) - uintOf(sSats0.raw), (d) => d > 0n);
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
