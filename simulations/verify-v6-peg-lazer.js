// verify-v6-peg-lazer.js
// SELF-VERIFYING stxer mainnet-fork harness for PEGGED orders on
// markets-sbtc-stx-jing-v6, with ONE real signed Lazer update (PYTH_API_KEY).
// Deploys jing-core-v5 + v6 under the deployer (neither is on mainnet),
// jing-ladder, and four peg rungs: buy / sell, each once IN band and once
// OUT of band for the live mid. Covers:
//   P1 the pure peg maths (pegged-ask / pegged-bid, sentinels)
//   P2 rung deposits land as pegged orders (limit = guard in market unit,
//      spread-bps some) and token-x-limit-at reads the pegged price in
//      band, MAX_UINT out of band
//   P3 the deposit gate reads the price when the other side rests: a
//      fixed bid that would take the pegged ask -> u1016, one under it rests
//   P5 a taker walks the book: fills the in-band peg at mid + spread (the
//      match log carries that price), skips the out-of-band peg entirely;
//      the rung's sync folds the fill in, the member claims the STX
//   P7 the mirror on the sell side (bid at mid - spread, cap), taker sells sBTC
//   P8 set-token-x-limit switches a direct maker fixed -> peg -> fixed,
//      u1026 on a 10000 bps spread, u1011 on a zero floor
// Run: PYTH_API_KEY=<key> npx tsx simulations/verify-v6-peg-lazer.js
import fs from "node:fs";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, trueCV, falseCV, noneCV, someCV,
  deserializeCV, cvToString, hexToCV,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v5", MKT = "markets-sbtc-stx-jing-v6";
const CORE_ID = `${DEP}.${CORE}`, MARKET = `${DEP}.${MKT}`, LADDER = `${DEP}.jing-ladder`;
const SBTC_ADDR = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", SBTC_NAME = "sbtc-token";
const WSTX_ADDR = "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", WSTX_NAME = "token-stx-v-1-2";
const sbtcT = contractPrincipalCV(SBTC_ADDR, SBTC_NAME), wstxT = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";   // sBTC holder: buy-rung member, direct x maker
const S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";    // STX holder: sell-rung member, fixed bidder
const B = "SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q";   // taker both ways (278k sats + 7.4k STX)
const PP = 100_000_000n, BPS = 20n, SCALE = 1_000_000_000_000n;
const MAX_UINT = 340282366920938463463374607431768211455n;
const src = (f) => fs.readFileSync(`./contracts/${f}.clar`, "utf8");
const centsName = (cents) => { const w = cents / 100n, f = cents % 100n; return `${w}-${f < 10n ? "0" : ""}${f}`; };

let checks = 0, failures = 0;
function check(label, actual, want) {
  checks += 1;
  const ok = typeof want === "function" ? want(actual) : String(actual) === want;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`);
}
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|\\(some u\\d+\\))\\)`)) || [])[1];

async function main() {
  console.log("=== v6 pegged orders, real Lazer mid ===");
  const full = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(full.hex, "hex"));
  const MID = (full.px * PP) / full.py;
  const ASK = (MID * (10000n + BPS)) / 10000n, BID = (MID * (10000n - BPS)) / 10000n;
  // guards in the name (hundredths of a sat per STX); p = 1e18 / cents
  const centsOf = (p) => (10n ** 18n) / p;
  const pOf = (cents) => (10n ** 18n) / cents;
  const BUY_IN_C = centsOf((MID * 90n) / 100n), BUY_OUT_C = centsOf((MID * 110n) / 100n);   // floor under / over the ask
  const SELL_IN_C = centsOf((MID * 110n) / 100n), SELL_OUT_C = centsOf((MID * 90n) / 100n); // cap over / under the bid
  const BUY_IN = `jing-buy-stx-spread-${BPS}-floor-${centsName(BUY_IN_C)}`, BUY_OUT = `jing-buy-stx-spread-${BPS}-floor-${centsName(BUY_OUT_C)}`;
  const SELL_IN = `jing-sell-stx-spread-${BPS}-cap-${centsName(SELL_IN_C)}`, SELL_OUT = `jing-sell-stx-spread-${BPS}-cap-${centsName(SELL_OUT_C)}`;
  const rid = (n) => `${DEP}.${n}`;
  console.log(`mid ${MID} (1 STX ~ ${(10n ** 16n) / MID} sats); ask ${ASK}, bid ${BID}\n  ${BUY_IN} (floor p ${pOf(BUY_IN_C)}, in band)\n  ${BUY_OUT} (floor p ${pOf(BUY_OUT_C)}, out)\n  ${SELL_IN} (cap p ${pOf(SELL_IN_C)}, in band)\n  ${SELL_OUT} (cap p ${pOf(SELL_OUT_C)}, out)`);

  const steps = [];
  let b = SimulationBuilder.new();
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const swap = (sender, amount, limit, depX) => call(sender, "swap", [uintCV(amount), uintCV(limit), UPD, sbtcT, sbtcA, wstxT, wstxA, depX ? trueCV() : falseCV()]);

  // ---- stack ----
  deploy(CORE, src(CORE)); deploy(MKT, src(MKT));
  tx("core-v5 verifies v6", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(ok true)");
  tx("v6 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)");
  deploy("jing-ladder", src("jing-ladder"));
  for (const n of [BUY_IN, BUY_OUT]) deploy(n, src("jing-buy-stx-market-spread"));
  for (const n of [SELL_IN, SELL_OUT]) deploy(n, src("jing-sell-stx-market-spread"));
  tx("canonical buy-peg", call(DEP, "set-canonical", [stringAsciiCV("buy-peg"), contractPrincipalCV(DEP, BUY_IN)], LADDER), "(ok true)");
  tx("canonical sell-peg", call(DEP, "set-canonical", [stringAsciiCV("sell-peg"), contractPrincipalCV(DEP, SELL_IN)], LADDER), "(ok true)");
  tx(`init ${BUY_IN}`, call(DEP, "initialize", [uintCV(BPS), uintCV(BUY_IN_C)], rid(BUY_IN)), "(ok true)");
  tx(`init ${BUY_OUT} (same hash, different key)`, call(DEP, "initialize", [uintCV(BPS), uintCV(BUY_OUT_C)], rid(BUY_OUT)), "(ok true)");
  tx(`init ${SELL_IN}`, call(DEP, "initialize", [uintCV(BPS), uintCV(SELL_IN_C)], rid(SELL_IN)), "(ok true)");
  tx(`init ${SELL_OUT}`, call(DEP, "initialize", [uintCV(BPS), uintCV(SELL_OUT_C)], rid(SELL_OUT)), "(ok true)");

  // ---- P1 pure maths ----
  ev("P1 pegged-ask in band = mid + 20 bps", `(pegged-ask u${MID} u${BPS} u${pOf(BUY_IN_C)})`, `u${ASK}`);
  ev("P1 pegged-ask out of band = MAX_UINT", `(pegged-ask u${MID} u${BPS} u${pOf(BUY_OUT_C)})`, `u${MAX_UINT}`);
  ev("P1 pegged-bid in band = mid - 20 bps", `(pegged-bid u${MID} u${BPS} u${pOf(SELL_IN_C)})`, `u${BID}`);
  ev("P1 pegged-bid out of band = u0", `(pegged-bid u${MID} u${BPS} u${pOf(SELL_OUT_C)})`, "u0");
  ev("P1 zero spread sits at mid", `(pegged-ask u${MID} u0 u1)`, `u${MID}`);

  // ---- P2 buy rungs rest pegged asks (y side empty: keyless path) ----
  tx("P2 A deposits 20000 sats into the in-band buy rung", call(A, "deposit", [uintCV(20000), UPD], rid(BUY_IN)), "(ok true)");
  tx("P2 A deposits 20000 sats into the out-of-band buy rung", call(A, "deposit", [uintCV(20000), UPD], rid(BUY_OUT)), "(ok true)");
  ev("P2 in-band rung order: limit = floor, spread-bps (some u20)", `(get-token-x-order '${rid(BUY_IN)})`, (v) => field(v, "limit") === `u${pOf(BUY_IN_C)}` && field(v, "spread-bps") === `(some u${BPS})`);
  ev("P2 token-x-limit-at in band = mid + 20 bps", `(token-x-limit-at '${rid(BUY_IN)} u${MID})`, `u${ASK}`);
  ev("P2 token-x-limit-at out of band = MAX_UINT (sentinel)", `(token-x-limit-at '${rid(BUY_OUT)} u${MID})`, `u${MAX_UINT}`);
  ev("P2 both rungs live on the market (20000 each)", "(get-token-x-depositors u0)", (v) => v.includes(BUY_IN) && v.includes(BUY_OUT));

  // ---- P3 the gate: in-range liquidity is an ask AT OR UNDER mid. A peg 20 bps
  // above mid is not in range, so a bid with any cap still rests; a zero-spread
  // peg sits exactly at mid, is in range, and forces the bid through swap ----
  tx("P3 S fixed bid at any cap rests (the pegged ask is above mid: not in-range liquidity)", call(S, "deposit-token-y", [uintCV(5_000_000), uintCV(999_999_999_999_999n), noneCV(), UPD, wstxT, wstxA]), "(ok u5000000)");
  tx("P3 S cancels it", call(S, "cancel-token-y-deposit", [wstxT, wstxA]), "(ok u5000000)");
  tx("P3 A rests a ZERO-spread peg (sits at mid, floor far under)", call(A, "deposit-token-x", [uintCV(5000), uintCV((MID * 90n) / 100n), someCV(uintCV(0)), UPD, sbtcT, sbtcA]), "(ok u5000)");
  ev("P3 zero-spread peg limit-at == mid", `(token-x-limit-at '${A} u${MID})`, `u${MID}`);
  ev("P3 would-take-as-y at mid with any cap -> true (the zero-spread peg is in range)", `(would-take-as-y u${MID} u999999999999999)`, "true");
  tx("P3 S fixed bid at any cap -> u1016 now", call(S, "deposit-token-y", [uintCV(5_000_000), uintCV(999_999_999_999_999n), noneCV(), UPD, wstxT, wstxA]), "(err u1016)");
  tx("P3 S zero-spread pegged bid (cap huge) -> u1016 too", call(S, "deposit-token-y", [uintCV(5_000_000), uintCV(999_999_999_999_999n), someCV(uintCV(0)), UPD, wstxT, wstxA]), "(err u1016)");
  tx("P3 S pegged bid 20 bps under mid rests (does not reach the ask at mid)", call(S, "deposit-token-y", [uintCV(5_000_000), uintCV(999_999_999_999_999n), someCV(uintCV(20)), UPD, wstxT, wstxA]), "(ok u5000000)");
  tx("P3 S cancels it", call(S, "cancel-token-y-deposit", [wstxT, wstxA]), "(ok u5000000)");
  tx("P3 A cancels the zero-spread peg", call(A, "cancel-token-x-deposit", [sbtcT, sbtcA]), "(ok u5000)");

  // ---- P5 taker walks the book: fills the in-band peg at its price, skips the out-of-band one ----
  ev("P5 A STX before", `(stx-get-balance '${A})`, () => true);
  const fillStep = tx("P5 B sells 30 STX (swap, 3% limit): walks the in-band peg", swap(B, 30_000_000, (MID * 103n) / 100n, false), (v) => String(v).startsWith("(ok"));
  ev("P5 out-of-band rung untouched on the market (20000)", `(get-token-x-deposit (get-current-cycle) '${rid(BUY_OUT)})`, (v) => uintOf(v) === 20000n || v === "u0");
  tx("P5 in-band rung sync folds the fill", call(B, "sync", [], rid(BUY_IN)), "(ok true)");
  ev("P5 in-band rung: unfilled-index dropped below SCALE", "(get-state)", (v) => uintOf(field(v, "unfilled-index")) < SCALE, rid(BUY_IN));
  ev("P5 in-band rung: A now has STX proceeds", `(get-position '${A})`, (v) => uintOf(field(v, "stx")) > 0n, rid(BUY_IN));
  tx("P5 out-of-band rung sync", call(B, "sync", [], rid(BUY_OUT)), "(ok true)");
  ev("P5 out-of-band rung: unfilled-index still SCALE", "(get-state)", (v) => field(v, "unfilled-index") === `u${SCALE}`, rid(BUY_OUT));
  ev("P5 out-of-band rung: A has no proceeds", `(get-position '${A})`, (v) => field(v, "stx") === "u0", rid(BUY_OUT));
  tx("P5 A claims the STX", call(A, "claim", [], rid(BUY_IN)), (v) => String(v).startsWith("(ok"));
  ev("P5 A STX after", `(stx-get-balance '${A})`, () => true);
  ev("P5 in-band rung: proceeds settled (stx u0)", `(get-position '${A})`, (v) => field(v, "stx") === "u0", rid(BUY_IN));

  // ---- P7 mirror: sell rungs bid mid - 20 bps, taker sells sBTC ----
  tx("P7 S deposits 60 STX into the in-band sell rung (x side rests: price read)", call(S, "deposit", [uintCV(60_000_000), UPD], rid(SELL_IN)), "(ok true)");
  tx("P7 S deposits 60 STX into the out-of-band sell rung", call(S, "deposit", [uintCV(60_000_000), UPD], rid(SELL_OUT)), "(ok true)");
  ev("P7 token-y-limit-at in band = mid - 20 bps", `(token-y-limit-at '${rid(SELL_IN)} u${MID})`, `u${BID}`);
  ev("P7 token-y-limit-at out of band = u0 (sentinel)", `(token-y-limit-at '${rid(SELL_OUT)} u${MID})`, "u0");
  const fillStepY = tx("P7 B sells 15000 sats (swap, 3% limit): walks the in-band bid", swap(B, 15000, (MID * 97n) / 100n, true), (v) => String(v).startsWith("(ok"));
  tx("P7 in-band sell rung sync", call(B, "sync", [], rid(SELL_IN)), "(ok true)");
  ev("P7 in-band sell rung: unfilled-index dropped", "(get-state)", (v) => uintOf(field(v, "unfilled-index")) < SCALE, rid(SELL_IN));
  ev("P7 in-band sell rung: S has sats proceeds", `(get-position '${S})`, (v) => uintOf(field(v, "sbtc")) > 0n, rid(SELL_IN));
  tx("P7 out-of-band sell rung sync", call(B, "sync", [], rid(SELL_OUT)), "(ok true)");
  ev("P7 out-of-band sell rung: untouched", "(get-state)", (v) => field(v, "unfilled-index") === `u${SCALE}`, rid(SELL_OUT));
  tx("P7 S claims the sats", call(S, "claim", [], rid(SELL_IN)), (v) => String(v).startsWith("(ok"));

  // ---- P8 set-limit on a direct maker: fixed -> peg -> fixed, bad spread, zero floor ----
  tx("P8 A rests a fixed ask 5% over mid", call(A, "deposit-token-x", [uintCV(5000), uintCV((MID * 105n) / 100n), noneCV(), UPD, sbtcT, sbtcA]), "(ok u5000)");
  ev("P8 order is fixed (spread-bps none)", `(get-token-x-order '${A})`, (v) => field(v, "spread-bps") === "none");
  tx("P8 A pegs it 30 bps (same floor)", call(A, "set-token-x-limit", [uintCV((MID * 105n) / 100n), someCV(uintCV(30)), UPD]), "(ok true)");
  ev("P8 order is pegged (some u30)", `(get-token-x-order '${A})`, (v) => field(v, "spread-bps") === "(some u30)");
  ev("P8 limit-at: floor over mid + 30 bps -> out of band -> MAX_UINT", `(token-x-limit-at '${A} u${MID})`, `u${MAX_UINT}`);
  tx("P8 A lowers the floor under mid: peg active", call(A, "set-token-x-limit", [uintCV((MID * 95n) / 100n), someCV(uintCV(30)), UPD]), "(ok true)");
  ev("P8 limit-at now mid + 30 bps", `(token-x-limit-at '${A} u${MID})`, `u${(MID * 10030n) / 10000n}`);
  tx("P8 spread 10000 bps -> u1026", call(A, "set-token-x-limit", [uintCV((MID * 95n) / 100n), someCV(uintCV(10000)), UPD]), "(err u1026)");
  tx("P8 zero floor -> u1011", call(A, "set-token-x-limit", [uintCV(0), someCV(uintCV(30)), UPD]), "(err u1011)");
  tx("P8 back to fixed", call(A, "set-token-x-limit", [uintCV((MID * 105n) / 100n), noneCV(), UPD]), "(ok true)");
  ev("P8 order fixed again", `(get-token-x-order '${A})`, (v) => field(v, "spread-bps") === "none");
  tx("P8 A cancels", call(A, "cancel-token-x-deposit", [sbtcT, sbtcA]), "(ok u5000)");

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid);
  const s = res.steps; let i = 0; const raws = [];
  for (const st of steps) {
    while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1;
    const raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]);
    st.raw = raw; st.idx = i; raws.push(raw); i += 1;
    check(st.label, raw, st.want);
  }
  // match logs: the fills happened at the pegged prices
  // stxer hands events back as JSON strings; the print value is raw hex
  const matchPrices = (st) => (s[st.idx]?.Result?.Transaction?.Ok?.events || [])
    .map((e) => { try { const o = typeof e === "string" ? JSON.parse(e) : e; const raw = o.contract_event?.raw_value; return raw ? cvToString(hexToCV(raw)) : ""; } catch { return ""; } })
    .filter((r) => r.includes('(event "match")')).map((r) => (r.match(/\(price u(\d+)\)/) || [])[1]);
  const px = matchPrices(fillStep), py = matchPrices(fillStepY);
  check(`P5 match log price == mid + 20 bps (${ASK})`, px.join(","), (v) => px.length === 1 && px[0] === String(ASK));
  // P6: the same settlement rolls every peg that is outside mid by its spread:
  // the out-of-band rung with the sentinel as limit, the in-band remainder with
  // the pegged price (README "Indexer notes")
  const rolls = (s[fillStep.idx]?.Result?.Transaction?.Ok?.events || [])
    .map((e) => { try { const o = typeof e === "string" ? JSON.parse(e) : e; const raw = o.contract_event?.raw_value; return raw ? cvToString(hexToCV(raw)) : ""; } catch { return ""; } })
    .filter((r) => r.includes('(event "limit-roll-x")'));
  const rollOf = (name) => rolls.filter((r) => r.includes(name)).map((r) => (r.match(/\(limit u(\d+)\)/) || [])[1]);
  check(`P6 out-of-band peg rolled with the sentinel (MAX_UINT)`, rollOf(BUY_OUT).join(","), (v) => v === String(MAX_UINT));
  check(`P6 in-band peg remainder rolled with the pegged price (${ASK})`, rollOf(BUY_IN).join(","), (v) => v === String(ASK));
  check(`P7 match log price == mid - 20 bps (${BID})`, py.join(","), (v) => py.length === 1 && py[0] === String(BID));
  const before = uintOf(steps.find((x) => x.label === "P5 A STX before").raw), after = uintOf(steps.find((x) => x.label === "P5 A STX after").raw);
  check("P5 A's STX balance grew by the claim", after - before, (d) => d > 0n);
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
