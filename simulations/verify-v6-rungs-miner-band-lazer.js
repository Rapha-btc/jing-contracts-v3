// verify-v6-rungs-miner-band-lazer.js
// Miner-band spread rungs (jing-buy-stx-core-spread / jing-sell-stx-core-spread
// a separate rung type, initialize(bps) only): the guard is not a fixed floor / cap from the
// name but the STX price Stacks miners are paying, read from the deployed
// RFQ native oracle (rfq-sbtc-stx-jing-v2-3 get-native-price, live on the
// fork), halved for the buy floor, doubled for the sell cap. A fat-finger
// Pyth print cannot fill these rungs.
//   M1 miner-mid > 0 on a mainnet fork and within 1/2 .. 2x of the Pyth mid
//      (unit sanity); current-floor = miner-mid / 2, current-cap = miner-mid * 2;
//      the guard stored at initialize is u0, the first push sets it
//   M2 a member deposit pushes with that floor as the order's limit and
//      (some u20); the effective price at mid is mid + 20 bps (in band)
//   M3 refresh-guard by a stranger re-sets the market's limit from the band
//   M4/M5 the sell rung mirror (cap = 2x, bid at mid - 20 bps, refresh-guard)
// Run: PYTH_API_KEY=<key> npx tsx simulations/verify-v6-rungs-miner-band-lazer.js
import fs from "node:fs";
import { ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV, noneCV, deserializeCV, cvToString, getAddressFromPrivateKey } from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v5", MKT = "markets-sbtc-stx-jing-v6";
const CORE_ID = `${DEP}.${CORE}`, MARKET = `${DEP}.${MKT}`, LADDER = `${DEP}.jing-ladder`;
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"), wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const wstxA = stringAsciiCV("wstx"), sbtcA = stringAsciiCV("sbtc-token");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2"; // sBTC holder: buy-rung member
const S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";  // STX holder: sell-rung member, the resting bid
const KEEPER = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3"; // anyone
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const FILLERS = Array.from({ length: 41 }, (_, i) => getAddressFromPrivateKey((i + 300).toString(16).padStart(64, "0") + "01", "mainnet"));
const FILL = 2000;
const PP = 100_000_000n, BPS = 20n;
const src = (f) => fs.readFileSync(`./contracts/${f}.clar`, "utf8");
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 80) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch { return r.Ok.result; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|true|false|\\(some u\\d+\\))\\)`)) || [])[1];
const uintOf = (v) => BigInt(String(v).replace(/^u/, ""));

async function main() {
  console.log("=== v6 rungs: miner-band guard (core-spread, cents u0) ===");
  const lz = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const MID = (lz.px * PP) / lz.py;
  const BUY = `jing-buy-stx-spread-${BPS}`, SELL = `jing-sell-stx-spread-${BPS}`;
  const rid = (n) => `${DEP}.${n}`;
  console.log(`pyth mid ${MID}; ${BUY} / ${SELL}`);

  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const state = (label, cid, want) => ev(label, "(get-state)", want, cid);

  deploy(CORE, src(CORE)); deploy("jing-ladder", src("jing-ladder")); deploy(MKT, src(MKT));
  tx("core-v5 verifies v6", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(ok true)");
  tx("v6 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)"); deploy(BUY, src("jing-buy-stx-core-spread")); deploy(SELL, src("jing-sell-stx-core-spread"));
  tx("canonical buy-band", call(DEP, "set-canonical", [stringAsciiCV("buy-band"), contractPrincipalCV(DEP, BUY)], LADDER), "(ok true)");
  tx("canonical sel-band", call(DEP, "set-canonical", [stringAsciiCV("sel-band"), contractPrincipalCV(DEP, SELL)], LADDER), "(ok true)");

  // =============== M1: the band ===============
  const mm = ev("M1 miner-mid (buy rung, via the RFQ native oracle) > 0 on a mainnet fork", "(miner-mid)", (v) => uintOf(v) > 0n, rid(BUY));
  const mmS = ev("M1 miner-mid (sell rung) same reading", "(miner-mid)", (v) => uintOf(v) > 0n, rid(SELL));
  const fl = ev("M1 current-floor (buy) = miner-mid / 2", "(current-floor)", (v) => uintOf(v) > 0n, rid(BUY));
  const cp = ev("M1 current-cap (sell) = miner-mid * 2", "(current-cap)", (v) => uintOf(v) > 0n, rid(SELL));
  tx(`init ${BUY} (u20)`, call(DEP, "initialize", [uintCV(BPS)], rid(BUY)), "(ok true)");
  tx(`init ${SELL} (u20)`, call(DEP, "initialize", [uintCV(BPS)], rid(SELL)), "(ok true)");
  ev("M1 stored floor after init is u0 (band mode: the first push sets it)", "(get-floor)", "u0", rid(BUY));
  ev("M1 stored cap after init is u0", "(get-cap)", "u0", rid(SELL));
  tx("M1 init again -> u7002", call(DEP, "initialize", [uintCV(BPS)], rid(BUY)), "(err u7002)");

  // =============== M2: a push rests with the band as its floor ===============
  tx("M2 S rests a bid at -5% (the y side is not empty: x deposits need a price)", call(S, "deposit-token-y", [uintCV(5_000_000), uintCV((MID * 95n) / 100n), noneCV(), UPD, wstxT, wstxA]), "(ok u5000000)");
  tx("M2 A deposits 20000 sats with a fresh update: pushed with floor = miner-mid / 2", call(A, "deposit", [uintCV(20000), UPD], rid(BUY)), "(ok true)");
  state("M2 held 0, resting 20000", rid(BUY), (v) => field(v, "held-sats") === "u0" && field(v, "resting") === "u20000");
  const lim = ev("M2 the market's stored limit for the rung", `(get-token-x-limit '${rid(BUY)})`, (v) => uintOf(v) > 0n);
  ev("M2 the rung's stored floor after the first push", "(get-floor)", (v) => uintOf(v) > 0n, rid(BUY));
  ev("M2 order (some u20)", `(get-token-x-order '${rid(BUY)})`, (v) => field(v, "spread-bps") === `(some u${BPS})`);
  ev("M2 effective ask at mid = mid + 20 bps (in band: the floor is far under)", `(token-x-limit-at '${rid(BUY)} u${MID})`, `u${(MID * (10000n + BPS)) / 10000n}`);

  // =============== M3: refresh-guard by a stranger ===============
  tx("M3 keeper refresh-guard (buy) -> ok", call(KEEPER, "refresh-guard", [UPD], rid(BUY)), (v) => String(v).startsWith("(ok"));
  const lim2 = ev("M3 limit after refresh (same block: unchanged)", `(get-token-x-limit '${rid(BUY)})`, (v) => uintOf(v) > 0n);

  // =============== M4/M5: the sell rung ===============
  tx("M4 S deposits 5 STX into the sell rung with a fresh update: pushed with cap = miner-mid * 2", call(S, "deposit", [uintCV(5_000_000), UPD], rid(SELL)), "(ok true)");
  state("M4 held 0, resting 5 STX", rid(SELL), (v) => field(v, "held-ustx") === "u0" && field(v, "resting") === "u5000000");
  const limS = ev("M4 the market's stored cap for the sell rung", `(get-token-y-limit '${rid(SELL)})`, (v) => uintOf(v) > 0n);
  ev("M4 effective bid at mid = mid - 20 bps (in band: the cap is far over)", `(token-y-limit-at '${rid(SELL)} u${MID})`, `u${(MID * (10000n - BPS)) / 10000n}`);
  tx("M5 keeper refresh-guard (sell) -> ok", call(KEEPER, "refresh-guard", [UPD], rid(SELL)), (v) => String(v).startsWith("(ok"));

  // =============== S: protected seats ===============
  // The rung's initialize claimed a seat; the market skips it in every
  // displacement rule and keeps the ladder's max-band-per-side slots out of the others' reach.
  const ASK_NEAR = (MID * 105n) / 100n;
  ev("S1 the buy rung holds a seat", `(is-protected-x '${rid(BUY)})`, "true");
  ev("S1 band count buy-band 1 (the ladder keeps the seats)", '(get-band-count "buy-band")', "u1", LADDER);
  ev("S1 the sell rung holds a seat on y", `(is-protected-y '${rid(SELL)})`, "true");
  ev("S1 band count sel-band 1", '(get-band-count "sel-band")', "u1", LADDER);
  ev("S1 max-band-per-side 10 (the ladder's number)", "(get-max-band-per-side)", "u10", LADDER);
  ev("S1 the market's local copy says 10 seats", "(protected-seats)", "u10");
  tx("S1 owner cannot set the max under the seats held (1) -> u6011", call(DEP, "set-max-band-per-side", [uintCV(0)], LADDER), "(err u6011)");
  tx("S1 owner sets the max to 12 -> ok", call(DEP, "set-max-band-per-side", [uintCV(12)], LADDER), "(ok true)");
  ev("S1 the market still says 10 until a sync", "(protected-seats)", "u10");
  tx("S1 anyone syncs the count", call(KEEPER, "sync-seat-count", []), (v) => String(v).startsWith("(ok"));
  ev("S1 the market now says 12", "(protected-seats)", "u12");
  tx("S1 owner sets it back to 10", call(DEP, "set-max-band-per-side", [uintCV(10)], LADDER), "(ok true)");
  tx("S1 sync again", call(KEEPER, "sync-seat-count", []), (v) => String(v).startsWith("(ok"));
  ev("S1 the market says 10", "(protected-seats)", "u10");
  tx("S1 a stranger cannot set it -> u6001", call(KEEPER, "set-max-band-per-side", [uintCV(3)], LADDER), (v) => String(v).startsWith("(err"));
  tx("S1 sync-seat on a principal the ladder does not seat -> u1028", call(KEEPER, "sync-seat", [standardPrincipalCV(KEEPER)]), "(err u1028)");
  // 40 fillers = the whole open region (MAX 50 - 10 seats); the 41st is refused
  // although only 41 orders rest: the 9 empty seats are not theirs to take
  FILLERS.forEach((f, i) => {
    tx(`S2 fund filler ${i + 1}`, call(A, "transfer", [uintCV(FILL), standardPrincipalCV(A), standardPrincipalCV(f), noneCV()], SBTC), "(ok true)");
    if (i < 40) tx(`S2 filler ${i + 1} rests ${FILL} at +5%`, call(f, "deposit-token-x", [uintCV(FILL), uintCV(ASK_NEAR), noneCV(), UPD, sbtcT, sbtcA]), `(ok u${FILL})`);
  });
  ev("S2 x side: 40 fillers + the rung = 41", "(len (get-token-x-depositors u0))", "u41");
  tx("S3 filler 41 at +5%: the open region is full (40) although 41 rest -> u1010", call(FILLERS[40], "deposit-token-x", [uintCV(FILL), uintCV(ASK_NEAR), noneCV(), UPD, sbtcT, sbtcA]), "(err u1010)");
  ev("S3 still 41", "(len (get-token-x-depositors u0))", "u41");
  tx("S4 A tops the rung up by 1000: a protected maker only sees the hard cap -> pushed", call(A, "deposit", [uintCV(1000), UPD], rid(BUY)), "(ok true)");
  state("S4 rung resting 21000", rid(BUY), (v) => field(v, "resting") === "u21000" && field(v, "held-sats") === "u0");
  tx("S5 fund the parker", call(A, "transfer", [uintCV(3000), standardPrincipalCV(A), standardPrincipalCV(KEEPER), noneCV()], SBTC), "(ok true)");
  tx("S5 an in-range ask (3000 at 1) on the full open region: parks the 10th best filler, never the rung", call(KEEPER, "deposit-token-x", [uintCV(3000), uintCV(1), noneCV(), UPD, sbtcT, sbtcA]), "(ok u3000)");
  ev("S5 the rung is still live with 21000", `(get-token-x-deposit u0 '${rid(BUY)})`, "u21000");
  ev("S5 the rung is not parked", `(get-token-x-parked '${rid(BUY)})`, "u0");
  ev("S5 still 41 on the side (one filler parked, the parker in)", "(len (get-token-x-depositors u0))", "u41");
  ev("S5 x total 102000: 39 fillers + 21000 rung + 3000 parker", "(get total-token-x (get-cycle-totals u0))", "u102000");
  // a second band rung claims the second seat: same code, another spread
  const BUY2 = `jing-buy-stx-spread-30`;
  deploy(BUY2, src("jing-buy-stx-core-spread"));
  tx(`S6 init ${BUY2} (u30): registers spread 30 = seat 2`, call(DEP, "initialize", [uintCV(30)], rid(BUY2)), "(ok true)");
  ev("S6 band count buy-band 2", '(get-band-count "buy-band")', "u2", LADDER);
  ev("S6 the second rung holds a seat", `(is-protected-x '${rid(BUY2)})`, "true");
  // the upgrade path: the same canonical code deployed by someone else at an
  // existing spread REPLACES the holder; the seat moves, the count does not
  const BUY30B = `${KEEPER}.jing-buy-stx-spread-30`;
  tx("S8 keeper deploys jing-buy-stx-spread-30 (same code)", (bb) => bb.withSender(KEEPER).addContractDeploy({ contract_name: "jing-buy-stx-spread-30", source_code: src("jing-buy-stx-core-spread"), clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  tx("S8 keeper initializes it -> u7001: only the ladder owner seats a band rung", call(KEEPER, "initialize", [uintCV(30)], BUY30B), "(err u7001)");
  ev("S8 the deployer's spread-30 rung still holds the seat", `(is-protected-x '${rid(BUY2)})`, "true");
  tx("S8 the ladder owner initializes the keeper's deploy: replaces the deployer's spread-30 rung", call(DEP, "initialize", [uintCV(30)], BUY30B), "(ok true)");
  ev("S8 band count buy-band still 2", '(get-band-count "buy-band")', "u2", LADDER);
  ev("S8 the new rung holds the seat (it synced itself)", `(is-protected-x '${BUY30B})`, "true");
  ev("S8 the old rung lost it in the same sync (prune)", `(is-protected-x '${rid(BUY2)})`, "false");
  tx("S8 sync-seat on the replaced rung -> u1028 (the ladder no longer seats it)", call(KEEPER, "sync-seat", [contractPrincipalCV(DEP, BUY2)]), "(err u1028)");
  ev("S8 the seated list on x is the two current rungs", "(len (get-seated-x))", "u2");
  ev("S8 the old rung is no longer registered", `(is-registered '${rid(BUY2)})`, "false", LADDER);
  // retire: the owner frees a spread; its rung is an ordinary maker from then on
  tx("S9 stranger cannot retire", call(KEEPER, "retire-band", [stringAsciiCV("buy-band"), uintCV(30)], LADDER), "(err u6001)");
  tx("S9 retire an empty spread -> u6010", call(DEP, "retire-band", [stringAsciiCV("buy-band"), uintCV(70)], LADDER), "(err u6010)");
  tx("S9 owner retires spread 30", call(DEP, "retire-band", [stringAsciiCV("buy-band"), uintCV(30)], LADDER), "(ok true)");
  ev("S9 band count buy-band 1", '(get-band-count "buy-band")', "u1", LADDER);
  ev("S9 the retired rung still shows a seat in the copy until any sync", `(is-protected-x '${BUY30B})`, "true");
  tx("S9 anyone syncs any seated rung (the spread-20 one): the prune drops the retired one", call(KEEPER, "sync-seat", [contractPrincipalCV(DEP, BUY)]), (v) => String(v).startsWith("(ok"));
  ev("S9 the retired rung no longer holds a seat", `(is-protected-x '${BUY30B})`, "false");
  ev("S9 the seated list on x is back to one", "(len (get-seated-x))", "u1");
  ev("S9 the retired rung is no longer registered", `(is-registered '${BUY30B})`, "false", LADDER);
  ev("S9 spread 30 is free", '(get-rung "buy-band" u30)', "none", LADDER);
  ev("S9 the spread-20 rung still holds its seat", `(is-protected-x '${rid(BUY)})`, "true");

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; check(st.label, st.raw, st.want); }
  const m = uintOf(mm.raw);
  check("M1 miner-mid within 1/2 .. 2x of the Pyth mid (same unit, the RFQ band itself)", m, (v) => v > MID / 2n && v < MID * 2n);
  check("M1 both rungs read the same miner-mid", uintOf(mmS.raw), (v) => v === m);
  check("M1 current-floor == miner-mid / 2", uintOf(fl.raw), (v) => v === m / 2n);
  check("M1 current-cap == miner-mid * 2", uintOf(cp.raw), (v) => v === m * 2n);
  check("M2 the market holds the band floor as the rung's limit", uintOf(lim.raw), (v) => v === m / 2n);
  check("M3 refresh kept it (same block)", uintOf(lim2.raw), (v) => v === m / 2n);
  check("M4 the market holds the band cap as the sell rung's limit", uintOf(limS.raw), (v) => v === m * 2n);
  console.log(`\nminer-mid ${m} vs pyth mid ${MID} (ratio ${Number(m * 1000n / MID) / 1000})`);
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
