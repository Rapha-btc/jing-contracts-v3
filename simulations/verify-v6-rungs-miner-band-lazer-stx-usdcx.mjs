import { rungReceipt } from "./_rung-receipt.js";
// verify-v6-rungs-miner-band-lazer-stx-usdcx.mjs
// STX/USDCx port of verify-v6-rungs-miner-band-lazer.js (set B of the v6-5
// regression). Same scenarios M1-M5 + S1-S9, mapped BY ROLE:
//   sBTC/STX x rung jing-buy-stx-spread-<bps>  (rests sBTC, "buy-band", floor)
//     -> jing-sell-stx-usdc-<bps>  (rests STX = x, "sel-band", floor)
//   sBTC/STX y rung jing-sell-stx-spread-<bps> (rests STX, "sel-band", cap)
//     -> jing-buy-stx-usdc-<bps>   (rests USDCx = y, "buy-band", cap)
// The guard: the sBTC/STX rungs read the RFQ native price (miner-mid) and use
// floor = miner-mid / 2, cap = miner-mid * 2. These rungs read DIA STX/USD
// (8 dp, u0 when > 2h stale) through the same (miner-mid) read-only and use
// floor = miner-mid * 0.8, cap = miner-mid * 1.2 (GUARD_BPS u2000). Behaviour is
// equivalent (stored u0 at initialize, set by the first push, used as the
// order's limit, re-set by a permissionless refresh-guard), so every M check
// is ported with the band rederived; the "within 1/2 .. 2x of the Pyth mid"
// unit sanity is kept (DIA STX/USD vs Lazer STX/USD / USDC/USD).
// Amounts: both tokens 6 dp, market mins 1 STX / 1 USDCx. The original x side
// was sats with min 1000 sats, so every x amount n sats -> n * 1000 uSTX (same
// multiple of the min); its y side was uSTX with min 1 STX -> uUSDCx 1:1.
// Fork at the tip on the LIVE jing-core-v6 (owner = multisig CORE_OWNER):
// ladder + market deployed as DEP; verify + initialize sent by CORE_OWNER with
// the operator handed over and back (4 checks where v6-3 had 2).
// Run: node simulations/verify-v6-rungs-miner-band-lazer-stx-usdcx.mjs
import { runCurrentPlan, FRESH_UPDATE } from "./_v6-submit-settle-stx-usdcx.mjs";
import { ClarityVersion, uintCV, trueCV, contractPrincipalCV, standardPrincipalCV, noneCV, deserializeCV, cvToString, getAddressFromPrivateKey } from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import { NODE, DEP, CORE, CORE_OWNER, N, C, WSTX, USDCX, STX_WHALES, USDCX_WHALES, traits, assets, src, lazer, midOf, MIN, P_ } from "./_stx-usdcx-v6-common.mjs";
import { stringAsciiCV } from "@stacks/transactions";

const MARKET = C.market, LADDER = C.ladder;
const A = STX_WHALES[0];    // STX holder: x-rung member (sell-stx-usdc), funds the x fillers
const S = USDCX_WHALES[1];  // USDCx holder: y-rung member (buy-stx-usdc), the resting bid
const KEEPER = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3"; // anyone
const FILLERS = Array.from({ length: 41 }, (_, i) => getAddressFromPrivateKey((i + 300).toString(16).padStart(64, "0") + "01", "mainnet"));
const UX = 1000; // sats -> uSTX (x min 1000 sats -> 1 STX)
const FILL = 2000 * UX; // 2x the x min
const PP = 100_000_000n, BPS = 20n;
const GUARD = 2000n, BP = 10_000n;
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 80) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch { return r.Ok.result; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|true|false|\\(some u\\d+\\))\\)`)) || [])[1];
const uintOf = (v) => BigInt(String(v).replace(/^u/, ""));

async function main() {
  console.log("=== v6 rungs STX/USDCx: DIA band guard (band rungs, guard u0 at init) ===");
  const lz = await lazer();
  const MID = midOf(lz);
  const XR = "jing-sell-stx-usdc-20", YR = "jing-buy-stx-usdc-20"; // x rung (rests STX), y rung (rests USDCx)
  const rid = (n) => `${DEP}.${n}`;
  console.log(`lazer mid ${MID} (USDCx per STX x 1e8); ${XR} / ${YR}`);

  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code, who = DEP) => tx(`deploy ${name}`, (bb) => bb.withSender(who).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const state = (label, cid, want) => ev(label, "(get-state)", want, cid);
  const stxSend = (label, from, to, amount) => tx(label, (bb) => bb.withSender(from).addSTXTransfer({ recipient: to, amount }), "(ok true)");
  const settle = (label, side, who, amount) => tx(label, call(KEEPER, `settle-token-${side}-deposit`,
    [P_(who), FRESH_UPDATE, traits[side], assets[side]]), `(ok u${amount})`);

  deploy(N.ladder, src(N.ladder)); deploy(N.market, src(N.market));
  ev("live core owner is the multisig", "(contract-call? '" + CORE + " get-contract-owner)", (v) => String(v).includes(CORE_OWNER));
  tx("market set-operator -> core owner", call(DEP, "set-operator", [P_(CORE_OWNER)]), "(ok true)");
  tx("core-v6 verifies the market (core owner)", call(CORE_OWNER, "set-verified-contract", [P_(MARKET)], CORE), (v) => String(v).startsWith("(ok"));
  tx("initialize (token-stx, usdcx, 1 STX, 1 USDCx, feeds 45 / 7)", call(CORE_OWNER, "initialize", [P_(MARKET), traits.x, traits.y, uintCV(MIN.x), uintCV(MIN.y), uintCV(45), uintCV(7)]), "(ok true)");
  tx("market set-operator -> DEP", call(CORE_OWNER, "set-operator", [P_(DEP)]), "(ok true)");
  deploy(XR, src(N.sellTpl)); deploy(YR, src(N.buyTpl));
  tx("canonical sel-band (x)", call(DEP, "set-canonical", [stringAsciiCV("sel-band"), P_(rid(XR))], LADDER), "(ok true)");
  tx("canonical buy-band (y)", call(DEP, "set-canonical", [stringAsciiCV("buy-band"), P_(rid(YR))], LADDER), "(ok true)");

  // =============== M1: the band ===============
  const mm = ev("M1 miner-mid (x rung, DIA STX/USD) > 0 on a mainnet fork", "(miner-mid)", (v) => uintOf(v) > 0n, rid(XR));
  const mmS = ev("M1 miner-mid (y rung) same reading", "(miner-mid)", (v) => uintOf(v) > 0n, rid(YR));
  const fl = ev("M1 current-floor (x) = miner-mid * 0.8", "(current-floor)", (v) => uintOf(v) > 0n, rid(XR));
  const cp = ev("M1 current-cap (y) = miner-mid * 1.2", "(current-cap)", (v) => uintOf(v) > 0n, rid(YR));
  tx(`init ${XR} (u20)`, call(DEP, "initialize", [uintCV(BPS), trueCV()], rid(XR)), "(ok true)");
  tx(`init ${YR} (u20)`, call(DEP, "initialize", [uintCV(BPS), trueCV()], rid(YR)), "(ok true)");
  ev("M1 stored floor after init is u0 (band mode: the first push sets it)", "(get-floor)", "u0", rid(XR));
  ev("M1 stored cap after init is u0", "(get-cap)", "u0", rid(YR));
  tx("M1 init again -> u7002", call(DEP, "initialize", [uintCV(BPS), trueCV()], rid(XR)), "(err u7002)");

  // =============== M2: a push rests with the band as its floor ===============
  const BID = 5_000_000; // 5 USDCx (5x the y min)
  tx("M2 S rests a bid at -5% (the y side is not empty: x deposits need a price)", call(S, "deposit-token-y", [uintCV(BID), uintCV((MID * 95n) / 100n), noneCV(), traits.y, assets.y]), `(ok u${BID})`);
  const XDEP = 20000 * UX; // 20 STX
  tx(`M2 A deposits ${XDEP} uSTX: pushed with floor = miner-mid * 0.8`, call(A, "deposit", [uintCV(XDEP)], rid(XR)), rungReceipt("deposit"));
  settle("M2 admit x escrow with newer price", "x", rid(XR), XDEP);
  state(`M2 held 0, resting ${XDEP}`, rid(XR), (v) => field(v, "held-ustx") === "u0" && field(v, "resting") === `u${XDEP}`);
  const lim = ev("M2 the market's stored limit for the rung", `(get-token-x-limit '${rid(XR)})`, (v) => uintOf(v) > 0n);
  ev("M2 the rung's stored floor after the first push", "(get-floor)", (v) => uintOf(v) > 0n, rid(XR));
  ev("M2 order (some u20)", `(get-token-x-order '${rid(XR)})`, (v) => field(v, "spread-bps") === `(some u${BPS})`);
  ev("M2 effective ask at mid = mid + 20 bps (in band: the floor is 20% under)", `(token-x-limit-at '${rid(XR)} u${MID})`, `u${(MID * (10000n + BPS)) / 10000n}`);

  // =============== M3: refresh-guard by a stranger ===============
  tx("M3 keeper refresh-guard (x) -> ok", call(KEEPER, "refresh-guard", [], rid(XR)), (v) => String(v).startsWith("(ok"));
  tx("M3 settle refreshed x limit", call(KEEPER, "settle-token-x-limit", [P_(rid(XR)), FRESH_UPDATE]), "(ok true)");
  const lim2 = ev("M3 limit after refresh (same DIA print: unchanged)", `(get-token-x-limit '${rid(XR)})`, (v) => uintOf(v) > 0n);

  // =============== M4/M5: the y rung ===============
  const YDEP = 5_000_000; // 5 USDCx (the original 5 STX = 5x the y min)
  tx(`M4 S deposits ${YDEP} uUSDCx into the y rung: pushed with cap = miner-mid * 1.2`, call(S, "deposit", [uintCV(YDEP)], rid(YR)), rungReceipt("deposit"));
  settle("M4 admit y escrow with newer price", "y", rid(YR), YDEP);
  state("M4 held 0, resting 5 USDCx", rid(YR), (v) => field(v, "held-uusdcx") === "u0" && field(v, "resting") === `u${YDEP}`);
  const limS = ev("M4 the market's stored cap for the y rung", `(get-token-y-limit '${rid(YR)})`, (v) => uintOf(v) > 0n);
  ev("M4 effective bid at mid = mid - 20 bps (in band: the cap is 20% over)", `(token-y-limit-at '${rid(YR)} u${MID})`, `u${(MID * (10000n - BPS)) / 10000n}`);
  tx("M5 keeper refresh-guard (y) -> ok", call(KEEPER, "refresh-guard", [], rid(YR)), (v) => String(v).startsWith("(ok"));
  tx("M5 settle refreshed y limit", call(KEEPER, "settle-token-y-limit", [P_(rid(YR)), FRESH_UPDATE]), "(ok true)");

  // =============== S: protected seats ===============
  const ASK_NEAR = (MID * 105n) / 100n;
  ev("S1 the x rung holds a seat", `(is-protected-x '${rid(XR)})`, "true");
  ev("S1 band count sel-band 1 (x side here; the ladder keeps the seats)", '(get-band-count "sel-band")', "u1", LADDER);
  ev("S1 the y rung holds a seat on y", `(is-protected-y '${rid(YR)})`, "true");
  ev("S1 band count buy-band 1", '(get-band-count "buy-band")', "u1", LADDER);
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
  FILLERS.forEach((f, i) => {
    stxSend(`S2 fund filler ${i + 1}`, A, f, FILL);
    if (i < 40) tx(`S2 filler ${i + 1} rests ${FILL} uSTX at +5%`, call(f, "deposit-token-x", [uintCV(FILL), uintCV(ASK_NEAR), noneCV(), traits.x, assets.x]), `(ok u${FILL})`);
    if (i < 40) settle(`S2 admit filler ${i + 1}`, "x", f, FILL);
  });
  ev("S2 x side: 40 fillers + the rung = 41", "(len (get-token-x-depositors u0))", "u41");
  tx("S3 filler 41 at +5%: full open region: submit escrows pending refusal", call(FILLERS[40], "deposit-token-x", [uintCV(FILL), uintCV(ASK_NEAR), noneCV(), traits.x, assets.x]), `(ok u${FILL})`);
  const refused = settle("S3 queue-full settle refunds entrant", "x", FILLERS[40], FILL);
  ev("S3 refund clears pending", `(get-token-x-pending-deposit '${FILLERS[40]})`, "none");
  ev("S3 refused entrant never live", `(get-token-x-deposit u0 '${FILLERS[40]})`, "u0");
  ev("S3 exact refund (native STX back)", `(stx-get-balance '${FILLERS[40]})`, `u${FILL}`);
  ev("S3 still 41", "(len (get-token-x-depositors u0))", "u41");
  const TOP = 1000 * UX;
  tx(`S4 A tops the rung up by ${TOP}: a protected maker only sees the hard cap -> pushed`, call(A, "deposit", [uintCV(TOP)], rid(XR)), rungReceipt("deposit"));
  settle("S4 admit protected top-up", "x", rid(XR), TOP);
  state(`S4 rung resting ${XDEP + TOP}`, rid(XR), (v) => field(v, "resting") === `u${XDEP + TOP}` && field(v, "held-ustx") === "u0");
  const PARK = 3000 * UX;
  stxSend("S5 fund the parker", A, KEEPER, PARK);
  tx(`S5 an in-range ask (${PARK} at 1) on the full open region: parks the 10th best filler, never the rung`, call(KEEPER, "deposit-token-x", [uintCV(PARK), uintCV(1), noneCV(), traits.x, assets.x]), `(ok u${PARK})`);
  settle("S5 admit parker with newer price", "x", KEEPER, PARK);
  ev(`S5 the rung is still live with ${XDEP + TOP}`, `(get-token-x-deposit u0 '${rid(XR)})`, `u${XDEP + TOP}`);
  ev("S5 the rung is not parked", `(get-token-x-parked '${rid(XR)})`, "u0");
  ev("S5 still 41 on the side (one filler parked, the parker in)", "(len (get-token-x-depositors u0))", "u41");
  ev(`S5 x total ${39 * FILL + XDEP + TOP + PARK}: 39 fillers + rung + parker`, "(get total-token-x (get-cycle-totals u0))", `u${39 * FILL + XDEP + TOP + PARK}`);
  // a second band rung claims the second seat: same code, another spread
  const XR2 = "jing-sell-stx-usdc-30";
  deploy(XR2, src(N.sellTpl));
  tx(`S6 init ${XR2} (u30): registers spread 30 = seat 2`, call(DEP, "initialize", [uintCV(30), trueCV()], rid(XR2)), "(ok true)");
  ev("S6 band count sel-band 2", '(get-band-count "sel-band")', "u2", LADDER);
  ev("S6 the second rung holds a seat", `(is-protected-x '${rid(XR2)})`, "true");
  // the upgrade path: the same canonical code deployed by someone else at an
  // existing spread REPLACES the holder; the seat moves, the count does not
  const XR30B = `${KEEPER}.${XR2}`;
  deploy(XR2, src(N.sellTpl), KEEPER);
  tx("S8 keeper initializes it -> u7001: only the ladder owner seats a band rung", call(KEEPER, "initialize", [uintCV(30), trueCV()], XR30B), "(err u7001)");
  ev("S8 the deployer's spread-30 rung still holds the seat", `(is-protected-x '${rid(XR2)})`, "true");
  tx("S8 the ladder owner initializes the keeper's deploy: replaces the deployer's spread-30 rung", call(DEP, "initialize", [uintCV(30), trueCV()], XR30B), "(ok true)");
  ev("S8 band count sel-band still 2", '(get-band-count "sel-band")', "u2", LADDER);
  ev("S8 the new rung holds the seat (it synced itself)", `(is-protected-x '${XR30B})`, "true");
  ev("S8 the old rung lost it in the same sync (prune)", `(is-protected-x '${rid(XR2)})`, "false");
  tx("S8 sync-seat on the replaced rung -> u1028 (the ladder no longer seats it)", call(KEEPER, "sync-seat", [P_(rid(XR2))]), "(err u1028)");
  ev("S8 the seated list on x is the two current rungs", "(len (get-seated-x))", "u2");
  ev("S8 the old rung stays registered (its members still withdraw through the ladder log)", `(is-registered '${rid(XR2)})`, "true", LADDER);
  ev("S8 ... but is not current", `(is-current-rung '${rid(XR2)})`, "false", LADDER);
  tx("S9 stranger cannot retire", call(KEEPER, "retire-band", [stringAsciiCV("sel-band"), uintCV(30)], LADDER), "(err u6001)");
  tx("S9 retire an empty spread -> u6010", call(DEP, "retire-band", [stringAsciiCV("sel-band"), uintCV(70)], LADDER), "(err u6010)");
  tx("S9 owner retires spread 30", call(DEP, "retire-band", [stringAsciiCV("sel-band"), uintCV(30)], LADDER), "(ok true)");
  ev("S9 band count sel-band 1", '(get-band-count "sel-band")', "u1", LADDER);
  ev("S9 the retired rung still shows a seat in the copy until any sync", `(is-protected-x '${XR30B})`, "true");
  tx("S9 anyone syncs any seated rung (the spread-20 one): the prune drops the retired one", call(KEEPER, "sync-seat", [P_(rid(XR))]), (v) => String(v).startsWith("(ok"));
  ev("S9 the retired rung no longer holds a seat", `(is-protected-x '${XR30B})`, "false");
  ev("S9 the seated list on x is back to one", "(len (get-seated-x))", "u1");
  ev("S9 the retired rung stays registered", `(is-registered '${XR30B})`, "true", LADDER);
  ev("S9 ... but is not current", `(is-current-rung '${XR30B})`, "false", LADDER);
  ev("S9 spread 30 is free", '(get-rung "sel-band" u30)', "none", LADDER);
  ev("S9 the spread-20 rung still holds its seat", `(is-protected-x '${rid(XR)})`, "true");

  const { sid, result: res } = await runCurrentPlan(b, { clockCid: MARKET });
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; check(st.label, st.raw, st.want); }
  const refundLogs = (s[refused.idx].Result.Transaction.Ok.events || []).map((e) => typeof e === "string" ? JSON.parse(e) : e).filter((e) => e.committed && e.contract_event).map((e) => cvToString(deserializeCV(e.contract_event.raw_value)));
  check("S3 committed queue-full event", refundLogs.join("|"), (v) => v.includes('(event "pending-refund-x")') && v.includes('(reason "queue-full")'));
  const m = uintOf(mm.raw);
  const floor = m * (BP - GUARD) / BP, cap = m * (BP + GUARD) / BP;
  check("M1 miner-mid (DIA STX/USD) within 1/2 .. 2x of the Lazer mid (same 8 dp unit)", m, (v) => v > MID / 2n && v < MID * 2n);
  check("M1 both rungs read the same miner-mid", uintOf(mmS.raw), (v) => v === m);
  check("M1 current-floor == miner-mid * 8000 / 10000", uintOf(fl.raw), (v) => v === floor);
  check("M1 current-cap == miner-mid * 12000 / 10000", uintOf(cp.raw), (v) => v === cap);
  check("M2 the market holds the band floor as the rung's limit", uintOf(lim.raw), (v) => v === floor);
  check("M3 refresh kept it (same DIA print)", uintOf(lim2.raw), (v) => v === floor);
  check("M4 the market holds the band cap as the y rung's limit", uintOf(limS.raw), (v) => v === cap);
  console.log(`\nminer-mid (DIA) ${m} vs lazer mid ${MID} (ratio ${Number(m * 1000n / MID) / 1000})`);
  console.log(`\n${checks - failures}/${checks} checks green`);
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
