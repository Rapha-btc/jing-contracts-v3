// verify-v6-rung-types-mixed-lazer.js
// ALL THREE rung types per side (fixed jing-buy/sell-stx, peg
// jing-buy/sell-stx-market-spread, band jing-buy/sell-stx-core-spread)
// resting NEXT TO direct makers on the same side, crossed by one taker in
// one settlement (PYTH_API_KEY):
//   X side: D2 zero-spread peg 5,000 at the mid (batch), D1 fixed ask 10,000
//   at +10 bps, fixed rung at ~+15 bps (5,000), band rung at +20 bps
//   (5,000), peg rung at +25 bps (5,000). One STX seller, limit +30 bps:
//   the batch clears D2 at the mid, the walk takes D1, the fixed rung, the
//   band rung whole and part of the peg rung, in price order. The two
//   sold-out rungs close their epoch on the next sync; every member claims.
//   Y side: the mirror with bids at -10 (B1 fixed), the fixed sell rung at
//   ~-15, the sell band at -20, the sell peg at -25, B2 a peg at the mid,
//   one sBTC seller with limit -30 bps.
// Run: PYTH_API_KEY=<key> npx tsx simulations/verify-v6-rung-types-mixed-lazer.js
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
  console.log("=== v6 three rung types + direct makers on the same side, one taker per side ===");
  const lz = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const MID = (lz.px * PP) / lz.py;
  const PB = (s) => (MID * (BPS - s)) / BPS, PA = (s) => (MID * (BPS + s)) / BPS;
  const USTX_PER_SAT = MID / PPDF;
  console.log(`mid ${MID} (1 sat ~ ${USTX_PER_SAT} uSTX, 1 STX ~ ${(10n ** 16n) / MID} sats)`);

  const LADDER = `${DEP}.jing-ladder`;
  const E18 = 10n ** 18n;
  const centsFor = (price) => E18 / price; // the rung's human number: hundredths of a sat per STX, price = 1e18 / cents
  const human = (c) => `${c / 100n}-${String(c % 100n).padStart(2, "0")}`;
  const priceOf = (c) => E18 / c;
  const C_BUY = centsFor(PA(15n)), C_SELL = centsFor(PB(15n)), C_FLOOR = centsFor((MID * 95n) / 100n), C_CAP = centsFor((MID * 105n) / 100n);
  const PF_BUY = priceOf(C_BUY), PF_SELL = priceOf(C_SELL);
  const FB = `jing-buy-stx-${human(C_BUY)}`, FS = `jing-sell-stx-${human(C_SELL)}`;
  const GB = `jing-buy-stx-spread-25-floor-${human(C_FLOOR)}`, GS = `jing-sell-stx-spread-25-cap-${human(C_CAP)}`;
  const BB = "jing-buy-stx-spread-20", BS = "jing-sell-stx-spread-20";
  const id = (n) => `${DEP}.${n}`;
  const D1 = mk(85), D2 = mk(86), T1 = mk(87), B1 = mk(88), B2 = mk(89), T2 = mk(93);
  const R = 5_000n, RY = 5_000_000n, D1_AMT = 10_000n, D2_AMT = 5_000n, B1_AMT = 30_000_000n, B2_AMT = 20_000_000n;
  const T1_NET = ((D2_AMT * MID + D1_AMT * PA(10n) + R * PF_BUY + R * PA(20n) + 2_500n * PA(25n)) / PPDF) * 1002n / 1000n;
  const T2_NET = ((B2_AMT * PPDF) / MID + (B1_AMT * PPDF) / PB(10n) + (RY * PPDF) / PF_SELL + (RY * PPDF) / PB(20n) + (2_500_000n * PPDF) / PB(25n)) * 1002n / 1000n;
  console.log(`fixed buy rung ${FB} (${PF_BUY}), fixed sell rung ${FS} (${PF_SELL}), peg rungs ${GB} / ${GS}`);

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
  deploy(FB, src("jing-buy-stx")); deploy(FS, src("jing-sell-stx"));
  deploy(GB, src("jing-buy-stx-market-spread")); deploy(GS, src("jing-sell-stx-market-spread"));
  deploy(BB, src("jing-buy-stx-core-spread")); deploy(BS, src("jing-sell-stx-core-spread"));
  for (const [side, name] of [["buy-stx", FB], ["sell-stx", FS], ["buy-peg", GB], ["sell-peg", GS], ["buy-band", BB], ["sel-band", BS]]) tx(`canonical ${side}`, call(DEP, "set-canonical", [stringAsciiCV(side), contractPrincipalCV(DEP, name)], LADDER), okTrue);
  tx(`init ${FB} (fixed, cents ${C_BUY})`, call(DEP, "initialize", [uintCV(C_BUY)], id(FB)), okTrue);
  tx(`init ${FS} (fixed, cents ${C_SELL})`, call(DEP, "initialize", [uintCV(C_SELL)], id(FS)), okTrue);
  tx(`init ${GB} (peg +25 bps, floor -5%)`, call(DEP, "initialize", [uintCV(25), uintCV(C_FLOOR)], id(GB)), okTrue);
  tx(`init ${GS} (peg -25 bps, cap +5%)`, call(DEP, "initialize", [uintCV(25), uintCV(C_CAP)], id(GS)), okTrue);
  tx(`init ${BB} (band +20 bps, seated)`, call(DEP, "initialize", [uintCV(20), trueCV()], id(BB)), okTrue);
  tx(`init ${BS} (band -20 bps, seated)`, call(DEP, "initialize", [uintCV(20), trueCV()], id(BS)), okTrue);
  for (const [who, ustx, sats] of [[D1, 1_000_000n, D1_AMT + 100n], [D2, 1_000_000n, D2_AMT + 100n], [T1, grossFor(T1_NET) + 1_000_000n, 0n], [B1, B1_AMT + 1_000_000n, 0n], [B2, B2_AMT + 1_000_000n, 0n], [T2, 1_000_000n, grossFor(T2_NET) + 100n]]) {
    tx(`fund ${who.slice(0, 6)} stx`, stxSend(who, ustx), (v) => String(v).startsWith("(ok"));
    if (sats > 0n) tx(`fund ${who.slice(0, 6)} sats`, satsSend(who, sats), okTrue);
  }

  // ---- X: five asks on one side, one STX seller ----
  tx("X1 A deposits 5,000 into the fixed buy rung (~+15 bps)", call(A, "deposit", [uintCV(R), UPD], id(FB)), okTrue);
  tx("X1 A deposits 5,000 into the band buy rung (+20 bps)", call(A, "deposit", [uintCV(R), UPD], id(BB)), okTrue);
  tx("X1 A deposits 5,000 into the peg buy rung (+25 bps)", call(A, "deposit", [uintCV(R), UPD], id(GB)), okTrue);
  tx("X2 D1 fixed ask 10,000 at +10 bps", depX(D1, D1_AMT, PA(10n), null), `(ok u${D1_AMT})`);
  tx("X3 D2 zero-spread peg 5,000 at the mid", depX(D2, D2_AMT, (MID * 90n) / 100n, 0n), `(ok u${D2_AMT})`);
  ev("X3 five asks on the side", "(len (get-token-x-depositors u0))", "u5");
  for (const [n, r] of [["fixed", FB], ["band", BB], ["peg", GB]]) ev(`X3 the ${n} rung rests 5,000`, depOfX(0, id(r)), `u${R}`);
  ev("X3 only the band rung holds a seat", `(and (is-protected-x '${id(BB)}) (not (is-protected-x '${id(FB)})) (not (is-protected-x '${id(GB)})))`, "true");
  const xs = tx("X4 T1 sells STX, limit +30 bps: D2 in the batch at the mid; the walk takes D1 (+10), the fixed rung (~+15), the band rung (+20) whole, then part of the peg rung (+25)", swap(T1, grossFor(T1_NET), PA(30n), false), (v) => String(v).startsWith("(ok"));
  ev("X5 cycle u1", "(get-current-cycle)", "u1");
  ev("X6 D2 filled (batch)", depOfX(1, D2), "u0");
  ev("X6 D1 filled", depOfX(1, D1), "u0");
  ev("X6 fixed rung sold out", depOfX(1, id(FB)), "u0");
  ev("X6 band rung sold out", depOfX(1, id(BB)), "u0");
  ev("X6 peg rung partly filled (1,500 .. 3,500 left)", depOfX(1, id(GB)), (v) => uintOf(v) > 1_500n && uintOf(v) < 3_500n);
  tx("X7 sync the fixed rung: sold out -> its epoch closes", call(T1, "sync", [], id(FB)), okTrue);
  ev("X7 fixed rung epoch 1, nothing resting", "(get-state)", (v) => field(v, "epoch") === "u1" && field(v, "resting") === "u0", id(FB));
  tx("X7 sync the band rung: sold out -> epoch closes", call(T1, "sync", [], id(BB)), okTrue);
  ev("X7 band rung epoch 1", "(get-state)", (v) => field(v, "epoch") === "u1", id(BB));
  tx("X7 sync the peg rung: partial, epoch stays 0", call(T1, "sync", [], id(GB)), okTrue);
  ev("X7 peg rung epoch 0, proceeds accrued", "(get-state)", (v) => field(v, "epoch") === "u0" && uintOf(field(v, "proceeds-index")) > 0n, id(GB));
  const a0 = ev("X8 A's STX before the claims", `(stx-get-balance '${A})`, () => true);
  tx("X8 A claims on the fixed rung (old epoch: paid in full, position gone)", call(A, "claim", [], id(FB)), okTrue);
  tx("X8 A claims on the band rung", call(A, "claim", [], id(BB)), okTrue);
  tx("X8 A claims on the peg rung (current epoch: paid, position stays)", call(A, "claim", [], id(GB)), okTrue);
  const a1 = ev("X8 A's STX after the claims", `(stx-get-balance '${A})`, () => true);
  ev("X8 A's fixed-rung position gone", `(get-position '${A})`, (v) => field(v, "shares") === "u0", id(FB));
  ev("X8 A's peg-rung position: unsold sats, nothing owed", `(get-position '${A})`, (v) => uintOf(field(v, "sbtc")) > 1_500n && field(v, "stx") === "u0", id(GB));
  tx("X8 A claims again on the fixed rung -> u7006 (no position)", call(A, "claim", [], id(FB)), "(err u7006)");

  // ---- Y: five bids on one side, one sBTC seller ----
  tx("Y1 S deposits 5 STX into the fixed sell rung (~-15 bps)", call(S, "deposit", [uintCV(RY), UPD], id(FS)), okTrue);
  tx("Y1 S deposits 5 STX into the band sell rung (-20 bps)", call(S, "deposit", [uintCV(RY), UPD], id(BS)), okTrue);
  tx("Y1 S deposits 5 STX into the peg sell rung (-25 bps)", call(S, "deposit", [uintCV(RY), UPD], id(GS)), okTrue);
  tx("Y2 B1 fixed bid 30 STX at -10 bps", depY(B1, B1_AMT, PB(10n), null), `(ok u${B1_AMT})`);
  tx("Y3 B2 zero-spread peg bid 20 STX at the mid", depY(B2, B2_AMT, HUGE, 0n), `(ok u${B2_AMT})`);
  ev("Y3 five bids on the side", "(len (get-token-y-depositors u1))", "u5");
  const ys = tx("Y4 T2 sells sBTC, limit -30 bps: B2 in the batch at the mid; the walk takes B1 (-10), the fixed rung (~-15), the band rung (-20) whole, then part of the peg rung (-25)", swap(T2, grossFor(T2_NET), PB(30n), true), (v) => String(v).startsWith("(ok"));
  ev("Y5 cycle u2", "(get-current-cycle)", "u2");
  ev("Y6 B2 filled (batch)", depOfY(2, B2), "u0");
  ev("Y6 B1 filled", depOfY(2, B1), "u0");
  ev("Y6 fixed sell rung sold out", depOfY(2, id(FS)), "u0");
  ev("Y6 band sell rung sold out", depOfY(2, id(BS)), "u0");
  ev("Y6 peg sell rung partly filled (1.5 .. 3.5 STX left)", depOfY(2, id(GS)), (v) => uintOf(v) > 1_500_000n && uintOf(v) < 3_500_000n);
  tx("Y7 sync the fixed sell rung: epoch closes", call(T2, "sync", [], id(FS)), okTrue);
  // the walk can leave the rung a remainder under the market minimum, which v6 refunds to the rung:
  // the rung then holds that dust (not sold out, epoch stays 0) instead of closing the epoch
  ev("Y7 fixed sell rung: sold out (epoch 1) or holding a refunded dust remainder under 1 STX (epoch 0)", "(get-state)", (v) => field(v, "epoch") === "u1" || (field(v, "resting") === "u0" && uintOf(field(v, "held-ustx")) < 1_000_000n), id(FS));
  tx("Y7 sync the band sell rung: epoch closes", call(T2, "sync", [], id(BS)), okTrue);
  tx("Y7 sync the peg sell rung", call(T2, "sync", [], id(GS)), okTrue);
  const s0 = ev("Y8 S's sats before the claims", `(contract-call? '${SBTC} get-balance '${S})`, () => true);
  tx("Y8 S claims on the fixed sell rung", call(S, "claim", [], id(FS)), okTrue);
  tx("Y8 S claims on the band sell rung", call(S, "claim", [], id(BS)), okTrue);
  tx("Y8 S claims on the peg sell rung", call(S, "claim", [], id(GS)), okTrue);
  const s1 = ev("Y8 S's sats after the claims", `(contract-call? '${SBTC} get-balance '${S})`, () => true);

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; if (typeof st.want === "function" && st.want.length === 0) continue; check(st.label, st.raw, st.want); }
  const matches = (st) => prints(s[st.idx]).filter((p) => p.includes('(event "match")')).map((p) => (p.match(/\(price u(\d+)\)/) || [])[1]);
  check(`X4 four walk fills in price order: +10, fixed ~+15 (${PF_BUY}), +20, +25`, matches(xs).join(","), `${PA(10n)},${PF_BUY},${PA(20n)},${PA(25n)}`);
  check(`Y4 four walk fills in price order: -10, fixed ~-15 (${PF_SELL}), -20, -25`, matches(ys).join(","), `${PB(10n)},${PF_SELL},${PB(20n)},${PB(25n)}`);
  check("X8 A's claims moved STX", uintOf(a1.raw) - uintOf(a0.raw), (d) => d > 0n);
  const sats = (v) => uintOf(String(v).replace(/^\(ok /, ""));
  check("Y8 S's claims moved sats", sats(s1.raw) - sats(s0.raw), (d) => d > 0n);
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
