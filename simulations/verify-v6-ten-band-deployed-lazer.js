// verify-v6-ten-band-deployed-lazer.js
// The DEPLOYED v6 set on a mainnet fork (nothing of the set is redeployed):
//   SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6 (initialized, live book)
//   SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-ladder (no canonicals, no seats yet)
//   SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-core-v5
//   SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-stx-jing-v5 (deployed, not used here)
// The ladder owner deploys the ten miner-band rungs per side at 0 10 20 ... 90 bps
// (jing-buy-stx-spread-<bps> / jing-sell-stx-spread-<bps>, the core-spread template,
// comment-stripped like the deploy form), blesses the canonicals, seats all twenty.
// ONE member per side then deposits into all ten rungs plus one direct order on the
// market; two takers cross each side, the zero-spread pair fights over the mid, one
// more taker sweeps to +95 bps, members withdraw / claim / re-deposit, seats get
// retired / re-seated, an eleventh seat is refused, and the open region (50 - 10
// seats) is filled by strangers who can park each other but never a rung.
//   D  deploy + set-canonical + initialize x20: band counts 10/10, seated lists 10/10,
//      the eleventh seated rung (100 bps) -> u6011, the same rung unseated -> ok
//   X  A deposits 20,000 sats into each buy rung: every push rests with floor = miner/2
//      and (some bps); A's direct ask 30,000 at +25 bps rests between rungs 20 and 30
//   Y  S deposits 20 STX into each sell rung: 10..90 rest with cap = miner*2;
//      the 0-bps bid would sit at the mid against the 0-bps ask already resting ->
//      the market refuses it (u1016 inside) and the rung HOLDS the 20 STX; S's direct
//      bid 30 STX at -25 bps rests
//   T1 taker sells STX, limit +55: batch clears buy-0 at the mid, the walk takes
//      10, 20, direct(+25), 30, 40 whole and ~8,000 of 50; match prints in price order
//   K1 keeper pushes sell-0 (the mid ask is gone) -> rests; A re-deposits into buy-0
//      (new epoch) -> refused by the mid bid -> held
//   W1 A withdraws 5,000 from the untouched buy-70 (partial withdraw-token-x)
//   T2 taker sells sBTC, limit -55: batch clears sell-0, walk -10 -20 direct(-25) -30
//      -40 whole and ~8 STX of -50
//   K2 keeper pushes buy-0 (the mid bid is gone) -> rests again
//   T2b the walked sell rungs keep under one sat's worth of STX (the market refunds the
//      sub-minimum remainder to the rung as held dust); under SOLD_OUT_DUST that counts
//      as sold out, the epoch closes on the first fill and the dust rides into the next:
//      S re-deposits 20 STX into sell-10 (epoch 1, pushed with the dust on top), a taker
//      takes it whole, epoch 2
//   W2 S withdraws 5 STX from sell-70 (partial), then 14.5 (cancel path, 0.5 held),
//      then deposits 1 STX (1.5 pushed back)
//   T3 taker sells STX, limit +95 (after T2b): batch buy-0 again, walk 50-rest, 60, 70 (15k), 80
//      whole and 18,000 of 90; A claims on every rung; sold-out rungs closed epochs
//   S  retire buy-band 90 -> prune -> 9 seats; seat-band -> 10; max 9 -> u6011;
//      refresh-guard on a resting rung ok, on a sold-out one u1005 (nothing to set)
//   F  37 strangers fill the open region next to the 3 non-seated residents; the
//      38th -> u1010; a seated rung still deposits; a bigger in-range stranger parks a
//      stranger, never a rung
// Run: npx tsx simulations/verify-v6-ten-band-deployed-lazer.js
//   (PYTH_API_KEY optional: without it the update comes through the faktory-dao backend)
import fs from "node:fs";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV, trueCV, falseCV,
  noneCV, someCV, deserializeCV, cvToString, hexToCV, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdateAny } from "./_lazer.js";
import { installChunkedSubmit } from "./_chunked-submit.js";
installChunkedSubmit(50);

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const MARKET = `${DEP}.markets-sbtc-stx-jing-v6`, LADDER = `${DEP}.jing-ladder`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"), wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2"; // sBTC whale: the one buy-side user (10 rungs + 1 direct)
const S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";  // STX whale: the one sell-side user (10 rungs + 1 direct)
const KEEPER = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3"; // anyone
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + "01", "mainnet");
const PP = 100_000_000n, PPDF = PP * 100n, BPS = 10_000n, REB = 20n;
const SPREADS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
const RX = 20_000n, DX = 30_000n;              // sats per buy rung, A's direct ask
const RY = 20_000_000n, DY = 30_000_000n;      // uSTX per sell rung, S's direct bid
const FILLERS = Array.from({ length: 38 }, (_, i) => mk(300 + i));
const FILL = 1000n;
const stripComments = (t) => t.split("\n").filter((l) => !/^\s*;;/.test(l)).join("\n");
const src = (f) => stripComments(fs.readFileSync(`./contracts/${f}.clar`, "utf8"));
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 160)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 160)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|true|false|\\(some u\\d+\\))\\)`)) || [])[1];
const prints = (step) => (step?.Result?.Transaction?.Ok?.events || []).map((e) => { try { const o = typeof e === "string" ? JSON.parse(e) : e; const raw = o.contract_event?.raw_value; return raw ? cvToString(hexToCV(raw)) : ""; } catch { return ""; } });
const grossFor = (net) => { let a = (net * BPS) / (BPS - REB); while (a - (a * REB) / BPS < net) a += 1n; return a; };
const between = (lo, hi) => (v) => uintOf(v) >= lo && uintOf(v) <= hi;
const okish = (v) => String(v).startsWith("(ok");

async function main() {
  console.log("=== deployed v6 set: ten band rungs per side, one user each side (10 + 1), takers, seats ===");
  const lz = await fetchLazerUpdateAny();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const MID = (lz.px * PP) / lz.py;
  const PA = (s) => (MID * (BPS + BigInt(s))) / BPS, PB = (s) => (MID * (BPS - BigInt(s))) / BPS;
  console.log(`pyth mid ${MID} (1 STX ~ ${(10n ** 16n) / MID} sats), update ts ${new Date(lz.ts * 1000).toISOString()}`);
  const BUY = (s) => `jing-buy-stx-spread-${s}`, SELL = (s) => `jing-sell-stx-spread-${s}`;
  const BID = (s) => `${DEP}.${BUY(s)}`, SID = (s) => `${DEP}.${SELL(s)}`;
  const T1 = mk(87), T2 = mk(93);
  // T1 (sells STX, +55): buy-0 at mid in the batch, then 10 20 direct(+25) 30 40 whole, 8,000 of 50
  const T1_NET = (RX * MID + RX * PA(10) + RX * PA(20) + DX * PA(25) + RX * PA(30) + RX * PA(40) + 8_000n * PA(50)) / PPDF;
  // T2 (sells sBTC, -55): sell-0 at mid in the batch, then -10 -20 direct(-25) -30 -40 whole, 8 STX of -50
  const T2_NET = (RY * PPDF) / MID + (RY * PPDF) / PB(10) + (RY * PPDF) / PB(20) + (DY * PPDF) / PB(25) + (RY * PPDF) / PB(30) + (RY * PPDF) / PB(40) + (8_000_000n * PPDF) / PB(50);
  // T3 (sells STX, +95): buy-0 (re-pushed 20k) at mid, then the ~12,000 left on 50, 60, 70 (15k after W1), 80 whole, 18,000 of 90
  const T3_NET = (RX * MID + 12_000n * PA(50) + RX * PA(60) + 15_000n * PA(70) + RX * PA(80) + 18_000n * PA(90)) / PPDF;
  // T2b (sells sBTC, -15): the 20 STX S re-deposits into sell-10 (its dust on top stays with the rung)
  const T2B_NET = (RY * PPDF) / PB(10);
  console.log(`T1 net ${T1_NET} uSTX, T2 net ${T2_NET} sats, T2b net ${T2B_NET} sats, T3 net ${T3_NET} uSTX`);

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
  const state = (label, cid, want) => ev(label, "(get-state)", want, cid);
  const okTrue = "(ok true)";

  // =============== D: deploy the twenty rungs on the deployed ladder / market ===============
  const buySrc = src("jing-buy-stx-core-spread"), sellSrc = src("jing-sell-stx-core-spread");
  for (const s of SPREADS) { deploy(BUY(s), buySrc); deploy(SELL(s), sellSrc); }
  tx("D canonical buy-band = spread-0 build", call(DEP, "set-canonical", [stringAsciiCV("buy-band"), contractPrincipalCV(DEP, BUY(0))], LADDER), okTrue);
  tx("D canonical sel-band = spread-0 build", call(DEP, "set-canonical", [stringAsciiCV("sel-band"), contractPrincipalCV(DEP, SELL(0))], LADDER), okTrue);
  for (const s of SPREADS) {
    tx(`D init ${BUY(s)} seated`, call(DEP, "initialize", [uintCV(s), trueCV()], BID(s)), okTrue);
    tx(`D init ${SELL(s)} seated`, call(DEP, "initialize", [uintCV(s), trueCV()], SID(s)), okTrue);
  }
  ev("D band count buy-band 10", '(get-band-count "buy-band")', "u10", LADDER);
  ev("D band count sel-band 10", '(get-band-count "sel-band")', "u10", LADDER);
  ev("D seated-x has 10", "(len (get-seated-x))", "u10");
  ev("D seated-y has 10", "(len (get-seated-y))", "u10");
  ev("D protected-seats 10", "(protected-seats)", "u10");
  for (const s of [0, 50, 90]) { ev(`D buy-${s} protected`, `(is-protected-x '${BID(s)})`, "true"); ev(`D sell-${s} protected`, `(is-protected-y '${SID(s)})`, "true"); }
  ev("D ladder rung buy-band u0 = the spread-0 rung", '(get-rung "buy-band" u0)', (v) => String(v).includes(`${BUY(0)})`), LADDER);
  ev("D ladder rung sel-band u90 = the spread-90 rung", '(get-rung "sel-band" u90)', (v) => String(v).includes(`${SELL(90)})`), LADDER);
  const mm = ev("D miner-mid (buy-0) > 0", "(miner-mid)", (v) => uintOf(v) > 0n, BID(0));
  const flr = ev("D current-floor (buy-0)", "(current-floor)", (v) => uintOf(v) > 0n, BID(0));
  const cap = ev("D current-cap (sell-0)", "(current-cap)", (v) => uintOf(v) > 0n, SID(0));
  deploy(BUY(100), buySrc);
  tx("D an eleventh seated buy rung (100) -> u6011 band full", call(DEP, "initialize", [uintCV(100), trueCV()], BID(100)), "(err u6011)");
  tx("D the same rung unseated -> ok (registered, no seat)", call(DEP, "initialize", [uintCV(100), falseCV()], BID(100)), okTrue);
  ev("D buy-100 registered", `(is-registered '${BID(100)})`, "true", LADDER);
  ev("D buy-100 not current (no seat)", `(is-current-rung '${BID(100)})`, "false", LADDER);
  ev("D buy-100 not protected on the market", `(is-protected-x '${BID(100)})`, "false");
  ev("D band count buy-band still 10", '(get-band-count "buy-band")', "u10", LADDER);
  tx("D set-max-band-per-side 9 under the 10 held -> u6011", call(DEP, "set-max-band-per-side", [uintCV(9)], LADDER), "(err u6011)");

  // =============== funding ===============
  tx("fund T1 stx", stxSend(T1, grossFor(T1_NET) + grossFor(T3_NET) + 2_000_000n), okish);
  tx("fund T2 stx", stxSend(T2, 1_000_000n), okish);
  tx("fund T2 sats", satsSend(T2, grossFor(T2_NET) + grossFor(T2B_NET) + 100n), okTrue);
  tx("fund KEEPER sats", satsSend(KEEPER, 3000n), okTrue);

  // =============== X: A into the ten buy rungs + one direct ask ===============
  ev("X0 x side before: the live book (2 asks)", "(len (get-token-x-depositors u0))", "u2");
  ev("X0 y side before: the live book (1 bid)", "(len (get-token-y-depositors u0))", "u1");
  for (const s of SPREADS) {
    tx(`X A deposits ${RX} sats into buy-${s}`, call(A, "deposit", [uintCV(RX), UPD], BID(s)), okTrue);
    state(`X buy-${s} pushed: held 0, resting ${RX}`, BID(s), (v) => field(v, "held-sats") === "u0" && field(v, "resting") === `u${RX}` && field(v, "epoch") === "u0");
    ev(`X buy-${s} order (some u${s})`, `(get-token-x-order '${BID(s)})`, (v) => field(v, "spread-bps") === `(some u${s})`);
    ev(`X buy-${s} effective ask at mid = mid + ${s} bps`, `(token-x-limit-at '${BID(s)} u${MID})`, `u${PA(s)}`);
  }
  const limB = ev("X buy-30 stored limit = the floor", `(get-token-x-limit '${BID(30)})`, (v) => uintOf(v) > 0n);
  tx("X A's direct ask 30,000 at +25 bps (fixed)", depX(A, DX, PA(25), null), `(ok u${DX})`);
  ev("X x side: 2 live + 10 rungs + A = 13", "(len (get-token-x-depositors u0))", "u13");
  ev("X x total = live 379,705 + 200,000 + 30,000", "(get total-token-x (get-cycle-totals u0))", "u609705");

  // =============== Y: S into the ten sell rungs + one direct bid ===============
  for (const s of SPREADS) {
    tx(`Y S deposits ${RY} uSTX into sell-${s}`, call(S, "deposit", [uintCV(RY), UPD], SID(s)), okTrue);
    if (s === 0) {
      state("Y sell-0: the mid bid meets the mid ask (u1016 inside) -> HELD 20 STX, resting 0", SID(0), (v) => field(v, "held-ustx") === `u${RY}` && field(v, "resting") === "u0");
    } else {
      state(`Y sell-${s} pushed: held 0, resting ${RY}`, SID(s), (v) => field(v, "held-ustx") === "u0" && field(v, "resting") === `u${RY}`);
      ev(`Y sell-${s} effective bid at mid = mid - ${s} bps`, `(token-y-limit-at '${SID(s)} u${MID})`, `u${PB(s)}`);
    }
  }
  const limS = ev("Y sell-30 stored limit = the cap", `(get-token-y-limit '${SID(30)})`, (v) => uintOf(v) > 0n);
  tx("Y S's direct bid 30 STX at -25 bps (fixed)", depY(S, DY, PB(25), null), `(ok u${DY})`);
  ev("Y y side: 1 live + 9 rungs + S = 11", "(len (get-token-y-depositors u0))", "u11");
  tx("Y keeper push on sell-0 now: still refused by the mid ask -> (ok false), still held", call(KEEPER, "push", [UPD], SID(0)), "(ok false)");
  state("Y sell-0 still held", SID(0), (v) => field(v, "held-ustx") === `u${RY}` && field(v, "resting") === "u0");
  ev("Y taker capacity for T1 (+55, sells STX)", `(get-taker-capacity u${MID} u${PA(55)} false '${T1})`, () => true);

  // =============== T1: sells STX, +55 ===============
  const t1 = tx("T1 sells STX limit +55: batch buy-0 at mid, walk 10 20 +25 30 40, part of 50", swap(T1, grossFor(T1_NET), PA(55), false), okish);
  ev("T1 cycle u1", "(get-current-cycle)", "u1");
  ev("T1 settlement 0 at the mid", "(get price (unwrap-panic (get-settlement u0)))", `u${MID}`);
  for (const s of [0, 10, 20, 30, 40]) ev(`T1 buy-${s} fully filled`, depOfX(1, BID(s)), "u0");
  ev("T1 A's direct ask fully filled", depOfX(1, A), "u0");
  ev("T1 buy-50 partly filled: ~12,000 left", depOfX(1, BID(50)), between(11_900n, 12_100n));
  for (const s of [60, 70, 80, 90]) ev(`T1 buy-${s} untouched`, depOfX(1, BID(s)), `u${RX}`);
  ev("T1 live ask +2.5% untouched", depOfX(1, "SPW81Q8C7S1ZD0ZDRF50TZ4RA32A1FADPHXMACF7"), "u101279");
  ev("T1 T1 holds sats now", `(contract-call? '${SBTC} get-balance '${T1})`, (v) => uintOf(v) > 130_000n);
  ev("T1 T1 rests nothing", depOfY(1, T1), "u0");
  for (const s of SPREADS) tx(`T1 keeper syncs buy-${s}`, call(KEEPER, "sync", [], BID(s)), okTrue);
  for (const s of [0, 10, 20, 30, 40]) state(`T1 buy-${s} sold out: epoch 1, shares 0, resting 0, proceeds > 0`, BID(s), (v) => field(v, "epoch") === "u1" && field(v, "total-shares") === "u0" && field(v, "resting") === "u0" && uintOf(field(v, "proceeds-index")) > 0n);
  state("T1 buy-50: epoch 0, unfilled ~0.6", BID(50), (v) => field(v, "epoch") === "u0" && between(590_000_000_000n, 610_000_000_000n)(field(v, "unfilled-index")));
  ev("T1 A's position on buy-0 (old epoch): sbtc 0, stx owed", `(get-position '${A})`, (v) => field(v, "sbtc") === "u0" && uintOf(field(v, "stx")) > 0n, BID(0));
  ev("T1 A's position on buy-50: ~12,000 sbtc, stx owed", `(get-position '${A})`, (v) => between(11_900n, 12_100n)(field(v, "sbtc")) && uintOf(field(v, "stx")) > 0n, BID(50));
  const a0 = ev("T1 A stx before claims", `(stx-get-balance '${A})`, () => true);
  for (const s of [0, 10, 20, 30, 40, 50, 60]) tx(`T1 A claims on buy-${s}`, call(A, "claim", [], BID(s)), okTrue);
  const a1 = ev("T1 A stx after claims", `(stx-get-balance '${A})`, () => true);
  ev("T1 A's position on buy-0 gone (old epoch paid out)", `(get-position '${A})`, (v) => field(v, "shares") === "u0" && field(v, "stx") === "u0", BID(0));
  ev("T1 A's position on buy-50: nothing more owed", `(get-position '${A})`, (v) => field(v, "stx") === "u0" && uintOf(field(v, "sbtc")) > 0n, BID(50));
  tx("T1 A withdraw on sold-out buy-0 -> u7006 no position", call(A, "withdraw", [uintCV(1)], BID(0)), "(err u7006)");

  // =============== K1: sell-0 gets its turn, buy-0 refused ===============
  tx("K1 keeper pushes sell-0: the mid ask is gone -> (ok true)", call(KEEPER, "push", [UPD], SID(0)), okTrue);
  state("K1 sell-0 resting 20 STX, held 0", SID(0), (v) => field(v, "held-ustx") === "u0" && field(v, "resting") === `u${RY}`);
  ev("K1 sell-0 effective bid at mid = mid", `(token-y-limit-at '${SID(0)} u${MID})`, `u${MID}`);
  tx("K1 A re-deposits 20,000 into buy-0 (new epoch): the mid bid refuses the mid ask -> held", call(A, "deposit", [uintCV(RX), UPD], BID(0)), okTrue);
  state("K1 buy-0: epoch 1, held 20,000, resting 0, shares 20,000", BID(0), (v) => field(v, "epoch") === "u1" && field(v, "held-sats") === `u${RX}` && field(v, "resting") === "u0" && field(v, "total-shares") === `u${RX}`);
  // W1: partial withdraw from an untouched buy rung
  tx("W1 A withdraws 5,000 from buy-70 (partial withdraw-token-x)", call(A, "withdraw", [uintCV(5000)], BID(70)), okTrue);
  state("W1 buy-70 resting 15,000, held 0, shares 15,000", BID(70), (v) => field(v, "resting") === "u15000" && field(v, "held-sats") === "u0" && field(v, "total-shares") === "u15000");
  ev("W1 buy-70 on the market 15,000", depOfX(1, BID(70)), "u15000");

  // =============== T2: sells sBTC, -55 ===============
  const t2 = tx("T2 sells sBTC limit -55: batch sell-0 at mid, walk -10 -20 -25 -30 -40, part of -50", swap(T2, grossFor(T2_NET), PB(55), true), okish);
  ev("T2 cycle u2", "(get-current-cycle)", "u2");
  for (const s of [0, 10, 20, 30, 40]) ev(`T2 sell-${s} fully filled`, depOfY(2, SID(s)), "u0");
  ev("T2 S's direct bid fully filled", depOfY(2, S), "u0");
  ev("T2 sell-50 partly filled: ~12 STX left", depOfY(2, SID(50)), between(11_900_000n, 12_100_000n));
  for (const s of [60, 70, 80, 90]) ev(`T2 sell-${s} untouched`, depOfY(2, SID(s)), `u${RY}`);
  ev("T2 live bid -7.5% untouched", depOfY(2, "SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q"), "u300000000");
  ev("T2 T2 holds STX now", `(stx-get-balance '${T2})`, (v) => uintOf(v) > 130_000_000n);
  for (const s of SPREADS) tx(`T2 keeper syncs sell-${s}`, call(KEEPER, "sync", [], SID(s)), okTrue);
  state("T2 sell-0 (batch fill, exact): sold out, epoch 1, shares 0", SID(0), (v) => field(v, "epoch") === "u1" && field(v, "total-shares") === "u0" && field(v, "resting") === "u0");
  for (const s of [10, 20, 30, 40]) state(`T2 sell-${s} (walk fill): resting 0, under one sat's worth of STX refunded to the rung as held dust, under SOLD_OUT_DUST -> sold out, epoch 1, shares 0`, SID(s), (v) => field(v, "epoch") === "u1" && field(v, "total-shares") === "u0" && field(v, "resting") === "u0" && between(1n, 3000n)(field(v, "held-ustx")));
  const s0 = ev("T2 S sats before claims", `(contract-call? '${SBTC} get-balance '${S})`, () => true);
  for (const s of SPREADS) tx(`T2 S claims on sell-${s}`, call(S, "claim", [], SID(s)), okTrue);
  const s1 = ev("T2 S sats after claims", `(contract-call? '${SBTC} get-balance '${S})`, () => true);
  ev("T2 S's position on sell-50: nothing more owed, ~12 STX unsold", `(get-position '${S})`, (v) => field(v, "sbtc") === "u0" && between(11_900_000n, 12_100_000n)(field(v, "stx")), SID(50));
  ev("T2 S's position on sell-10 gone (old epoch paid out at the claim)", `(get-position '${S})`, (v) => field(v, "shares") === "u0" && field(v, "sbtc") === "u0" && field(v, "stx") === "u0", SID(10));

  // =============== K2: buy-0 gets its turn back ===============
  tx("K2 keeper pushes buy-0: the mid bid is gone -> (ok true)", call(KEEPER, "push", [UPD], BID(0)), okTrue);
  state("K2 buy-0 resting 20,000, held 0", BID(0), (v) => field(v, "held-sats") === "u0" && field(v, "resting") === `u${RX}`);
  ev("K2 x side in cycle 2: 2 live + buy-0 + 50..90 = 8", "(len (get-token-x-depositors u2))", "u8");

  // =============== W2: sell-70 withdraw paths ===============
  const sS0 = ev("W2 S stx before", `(stx-get-balance '${S})`, () => true);
  tx("W2 S withdraws 5 STX from sell-70 (partial withdraw-token-y)", call(S, "withdraw", [uintCV(5_000_000)], SID(70)), okTrue);
  state("W2 sell-70 resting 15 STX, held 0", SID(70), (v) => field(v, "resting") === "u15000000" && field(v, "held-ustx") === "u0");
  tx("W2 S withdraws 14.5 STX: the remainder 0.5 would sit under the market minimum -> cancel, 0.5 held", call(S, "withdraw", [uintCV(14_500_000)], SID(70)), okTrue);
  state("W2 sell-70 resting 0, held 0.5 STX, shares 0.5 STX", SID(70), (v) => field(v, "resting") === "u0" && field(v, "held-ustx") === "u500000" && field(v, "total-shares") === "u500000");
  const sS1 = ev("W2 S stx after", `(stx-get-balance '${S})`, () => true);
  tx("W2 S deposits 1 STX into sell-70: 1.5 pushed back", call(S, "deposit", [uintCV(1_000_000), UPD], SID(70)), okTrue);
  state("W2 sell-70 resting 1.5 STX, held 0", SID(70), (v) => field(v, "resting") === "u1500000" && field(v, "held-ustx") === "u0");
  ev("W2 sell-70 on the market 1.5 STX", depOfY(2, SID(70)), "u1500000");
  tx("W2 S withdraws more than its 20 STX on the untouched sell-60 -> takes all (cancel path), ok", call(S, "withdraw", [uintCV(999_000_000)], SID(60)), okTrue);
  state("W2 sell-60 emptied: resting 0, held 0, shares 0", SID(60), (v) => field(v, "resting") === "u0" && field(v, "held-ustx") === "u0" && field(v, "total-shares") === "u0");

  // =============== T2b: the dust epoch closes on the second fill ===============
  tx("T2b S deposits 20 STX into sell-10 (epoch 1): pushed with the leftover dust on top", call(S, "deposit", [uintCV(RY), UPD], SID(10)), okTrue);
  state("T2b sell-10 resting 20 STX + dust, held 0, epoch 1, shares exactly 20 STX (fresh index)", SID(10), (v) => field(v, "held-ustx") === "u0" && between(RY + 1n, RY + 3000n)(field(v, "resting")) && field(v, "epoch") === "u1" && field(v, "total-shares") === `u${RY}` && field(v, "unfilled-index") === "u1000000000000");
  const t2b = tx("T2b taker sells sBTC limit -15: the walk takes sell-10 whole", swap(T2, grossFor(T2B_NET), PB(15), true), okish);
  ev("T2b cycle u3", "(get-current-cycle)", "u3");
  ev("T2b sell-10 emptied on the market", depOfY(3, SID(10)), "u0");
  tx("T2b keeper syncs sell-10", call(KEEPER, "sync", [], SID(10)), okTrue);
  state("T2b sell-10 sold out again: epoch 2, shares 0, only dust held", SID(10), (v) => field(v, "epoch") === "u2" && field(v, "total-shares") === "u0" && field(v, "resting") === "u0" && uintOf(field(v, "held-ustx")) < 6000n);
  ev("T2b S's position on sell-10 (epoch 1, closed): stx 0, sats owed", `(get-position '${S})`, (v) => field(v, "stx") === "u0" && uintOf(field(v, "sbtc")) > 5000n && field(v, "shares") === `u${RY}`, SID(10));
  tx("T2b S claims on sell-10", call(S, "claim", [], SID(10)), okTrue);
  ev("T2b S's position on sell-10 gone", `(get-position '${S})`, (v) => field(v, "shares") === "u0" && field(v, "sbtc") === "u0", SID(10));

  // =============== T3: sells STX, +95: sweep ===============
  const t3 = tx("T3 sells STX limit +95: batch buy-0 at mid, walk 50-rest 60 70 80 whole, 18,000 of 90", swap(T1, grossFor(T3_NET), PA(95), false), okish);
  ev("T3 cycle u4", "(get-current-cycle)", "u4");
  for (const s of [0, 50, 60, 70, 80]) ev(`T3 buy-${s} fully filled`, depOfX(4, BID(s)), "u0");
  ev("T3 buy-90 partly filled: ~2,000 left", depOfX(4, BID(90)), between(1_800n, 2_200n));
  ev("T3 live ask +2.5% untouched", depOfX(4, "SPW81Q8C7S1ZD0ZDRF50TZ4RA32A1FADPHXMACF7"), "u101279");
  for (const s of SPREADS) tx(`T3 keeper syncs buy-${s}`, call(KEEPER, "sync", [], BID(s)), okTrue);
  state("T3 buy-0 sold out twice: epoch 2", BID(0), (v) => field(v, "epoch") === "u2" && field(v, "total-shares") === "u0");
  for (const s of [50, 60, 70, 80]) state(`T3 buy-${s} sold out: epoch 1`, BID(s), (v) => field(v, "epoch") === "u1" && field(v, "total-shares") === "u0");
  state("T3 buy-90: epoch 0, ~2,000 resting", BID(90), (v) => field(v, "epoch") === "u0" && between(1_800n, 2_200n)(field(v, "resting")));
  const a2 = ev("T3 A stx before claims", `(stx-get-balance '${A})`, () => true);
  for (const s of [0, 50, 60, 70, 80, 90]) tx(`T3 A claims on buy-${s}`, call(A, "claim", [], BID(s)), okTrue);
  for (const s of [10, 20, 30, 40]) tx(`T3 A claims again on buy-${s} -> u7006 (paid out and deleted at the T1 claim)`, call(A, "claim", [], BID(s)), "(err u7006)");
  const a3 = ev("T3 A stx after claims", `(stx-get-balance '${A})`, () => true);
  for (const s of [0, 50, 60, 70, 80]) ev(`T3 A's position on buy-${s} gone`, `(get-position '${A})`, (v) => field(v, "shares") === "u0" && field(v, "stx") === "u0" && field(v, "sbtc") === "u0", BID(s));
  ev("T3 A's position on buy-90: ~2,000 unsold, nothing owed", `(get-position '${A})`, (v) => between(1_800n, 2_200n)(field(v, "sbtc")) && field(v, "stx") === "u0", BID(90));

  // =============== S: seats ===============
  tx("S refresh-guard on the resting sell-70 -> ok", call(KEEPER, "refresh-guard", [UPD], SID(70)), okish);
  tx("S refresh-guard on the sold-out buy-30 -> u1005 (no position to set a limit on)", call(KEEPER, "refresh-guard", [UPD], BID(30)), "(err u1005)");
  tx("S owner retires buy-band 90", call(DEP, "retire-band", [stringAsciiCV("buy-band"), uintCV(90)], LADDER), okTrue);
  ev("S band count buy-band 9", '(get-band-count "buy-band")', "u9", LADDER);
  ev("S buy-90 still registered", `(is-registered '${BID(90)})`, "true", LADDER);
  ev("S buy-90 not current", `(is-current-rung '${BID(90)})`, "false", LADDER);
  tx("S anyone prunes the seats", call(KEEPER, "prune-seats", []), okish);
  ev("S seated-x 9", "(len (get-seated-x))", "u9");
  ev("S buy-90 not protected", `(is-protected-x '${BID(90)})`, "false");
  ev("S buy-90 still rests its ~2,000", depOfX(4, BID(90)), between(1_800n, 2_200n));
  tx("S a stranger cannot re-seat it -> u6001", call(KEEPER, "seat-band", [contractPrincipalCV(DEP, BUY(90))], LADDER), "(err u6001)");
  tx("S owner re-seats buy-90", call(DEP, "seat-band", [contractPrincipalCV(DEP, BUY(90))], LADDER), okTrue);
  tx("S re-seat again -> u6012 already seated", call(DEP, "seat-band", [contractPrincipalCV(DEP, BUY(90))], LADDER), "(err u6012)");
  tx("S anyone syncs the seat on the market", call(KEEPER, "sync-seat", [contractPrincipalCV(DEP, BUY(90))]), okish);
  ev("S seated-x 10 again", "(len (get-seated-x))", "u10");
  ev("S buy-90 protected again", `(is-protected-x '${BID(90)})`, "true");
  tx("S owner seats the unseated buy-100 -> ok? no: band full -> u6011", call(DEP, "seat-band", [contractPrincipalCV(DEP, BUY(100))], LADDER), "(err u6011)");

  // =============== F: the open region next to the seats ===============
  tx("F A deposits 5,000 into the unseated buy-100: an ordinary maker", call(A, "deposit", [uintCV(5000), UPD], BID(100)), okTrue);
  ev("F buy-100 rests 5,000", depOfX(4, BID(100)), "u5000");
  ev("F x side: 2 live + buy-90 + buy-100 = 4", "(len (get-token-x-depositors u4))", "u4");
  FILLERS.forEach((f, i) => {
    tx(`F fund filler ${i + 1}`, satsSend(f, FILL), okTrue);
    if (i < 37) tx(`F filler ${i + 1} rests ${FILL} at +5%`, depX(f, FILL, PA(500), null), `(ok u${FILL})`);
  });
  ev("F x side: 3 non-seated + 37 fillers + buy-90 = 41", "(len (get-token-x-depositors u4))", "u41");
  tx("F filler 38 at +5%, same size: the open region (40) is full although 41 rest -> u1010", depX(FILLERS[37], FILL, PA(500), null), "(err u1010)");
  tx("F A deposits 20,000 into the sold-out buy-80 (new epoch): a seat is never full at 41", call(A, "deposit", [uintCV(RX), UPD], BID(80)), okTrue);
  state("F buy-80 epoch 1, resting 20,000", BID(80), (v) => field(v, "epoch") === "u1" && field(v, "resting") === `u${RX}` && field(v, "held-sats") === "u0");
  ev("F x side 42", "(len (get-token-x-depositors u4))", "u42");
  tx("F an in-range ask (3,000 at 1) on the full open region: parks a filler, never a rung", depX(KEEPER, 3000n, 1n, null), "(ok u3000)");
  ev("F x side still 42 (one filler parked, the parker in)", "(len (get-token-x-depositors u4))", "u42");
  ev("F buy-80 still live", depOfX(4, BID(80)), `u${RX}`);
  ev("F buy-80 not parked", `(get-token-x-parked '${BID(80)})`, "u0");
  ev("F buy-90 still live", depOfX(4, BID(90)), between(1_800n, 2_200n));
  ev("F buy-90 not parked", `(get-token-x-parked '${BID(90)})`, "u0");
  ev("F buy-100 (unseated) still live: bigger than a filler", depOfX(4, BID(100)), "u5000");
  const parkedF = FILLERS.slice(0, 37).map((f, i) => ev(`F filler ${i + 1} parked?`, `(get-token-x-parked '${f})`, () => true));

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; if (typeof st.want === "function" && st.want.length === 0) { console.log(`  info ${st.label}: ${String(st.raw).slice(0, 200)}`); continue; } check(st.label, st.raw, st.want); }
  const matches = (st) => prints(s[st.idx]).filter((p) => p.includes('(event "match")')).map((p) => (p.match(/\(price u(\d+)\)/) || [])[1]);
  check("D floor = miner-mid / 2", uintOf(flr.raw), (v) => v === uintOf(mm.raw) / 2n);
  check("D cap = miner-mid * 2", uintOf(cap.raw), (v) => v === uintOf(mm.raw) * 2n);
  check("X the market holds the band floor as buy-30's limit", uintOf(limB.raw), (v) => v === uintOf(flr.raw));
  check("Y the market holds the band cap as sell-30's limit", uintOf(limS.raw), (v) => v === uintOf(cap.raw));
  check("T1 walk fills in price order: +10 +20 +25(direct) +30 +40 +50", matches(t1).join(","), [10, 20, 25, 30, 40, 50].map((x) => PA(x)).join(","));
  check("T2 walk fills in price order: -10 -20 -25(direct) -30 -40 -50", matches(t2).join(","), [10, 20, 25, 30, 40, 50].map((x) => PB(x)).join(","));
  check("T3 walk fills in price order: +50 +60 +70 +80 +90", matches(t3).join(","), [50, 60, 70, 80, 90].map((x) => PA(x)).join(","));
  check("T2b one walk fill at -10", matches(t2b).join(","), `${PB(10)}`);
  check("T1 A's claims moved STX (six filled rungs)", uintOf(a1.raw) - uintOf(a0.raw), (d) => d > 0n);
  check("T2 S's claims moved sats", uintOf(s1.raw) - uintOf(s0.raw), (d) => d > 0n);
  check("T3 A's claims moved STX again", uintOf(a3.raw) - uintOf(a2.raw), (d) => d > 0n);
  check("W2 S got 19.5 STX back from sell-70", uintOf(sS1.raw) - uintOf(sS0.raw), (d) => d === 19_500_000n);
  check("F exactly one filler parked, for its whole 1,000", parkedF.map((e) => e.raw).filter((v) => uintOf(v) === FILL).length + "/" + parkedF.filter((e) => uintOf(e.raw) !== 0n).length, "1/1");
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
