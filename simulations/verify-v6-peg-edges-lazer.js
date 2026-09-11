// verify-v6-peg-edges-lazer.js
// Edges of the pegged surface on markets-sbtc-stx-jing-v6 + jing-core-v5,
// one real Lazer update (PYTH_API_KEY), market UNPATCHED (80 s window).
//   O  a peg rung sold out THROUGH FILLS: a taker takes the whole rung, sync
//      closes the epoch (epoch +1, total-shares 0), the member claims the
//      proceeds, a new deposit opens the next epoch
//   G  guard edges: a pegged price exactly on the ceiling / floor is in band
//      (<= / >=), one unit past it is the sentinel; spread 9999 both sides
//      (the widest peg); a direct maker rests a 9999 bps peg
//   U  a small taker against a big zero-spread peg on its own side -> u1020
//      (the small-share rule sees the peg as any in-range maker)
//   H  the rung hold paths beyond a full queue: a zero-spread rung whose
//      deposit would cross an in-range bid (u1016) holds the funds; a STALE
//      update (fixtures/lazer-update-stale-btc-stx.hex) holds them too; a
//      fresh deposit afterwards pushes everything
//   C  core-v5 authority: a stranger calling log-peg-x, log-park-x,
//      log-readmit-x, log-set-limit-x -> u5001
// Run: PYTH_API_KEY=<key> npx tsx simulations/verify-v6-peg-edges-lazer.js
import fs from "node:fs";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV, trueCV, falseCV,
  noneCV, someCV, deserializeCV, cvToString, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v5", MKT = "markets-sbtc-stx-jing-v6";
const CORE_ID = `${DEP}.${CORE}`, MARKET = `${DEP}.${MKT}`, LADDER = `${DEP}.jing-ladder`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"), wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2"; // sBTC whale: rung member, funds sats
const S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";  // STX whale: the 2000 STX zero-spread peg, funds STX
const STRANGER = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3";
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + "01", "mainnet");
const PP = 100_000_000n, PPDF = PP * 100n, BPS = 10_000n, REB = 20n, SCALE = 1_000_000_000_000n;
const HUGE = 999_999_999_999_999n, MAX_UINT = 340282366920938463463374607431768211455n;
const src = (f) => fs.readFileSync(`./contracts/${f}.clar`, "utf8");
const centsName = (c) => { const w = c / 100n, f = c % 100n; return `${w}-${f < 10n ? "0" : ""}${f}`; };
const grossFor = (net) => { let a = (net * BPS) / (BPS - REB); while (a - (a * REB) / BPS < net) a += 1n; return a; };
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|\\(some u\\d+\\))\\)`)) || [])[1];

async function main() {
  console.log("=== v6 pegged edges: sold-out rung, guard edges, u1020, rung holds, core-v5 auth ===");
  const lz = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const STALE = bufferCV(Buffer.from(fs.readFileSync(new URL("./fixtures/lazer-update-stale-btc-stx.hex", import.meta.url), "utf8").trim(), "hex"));
  const MID = (lz.px * PP) / lz.py;
  const PB = (s) => (MID * (BPS - s)) / BPS, PA = (s) => (MID * (BPS + s)) / BPS;
  const IN_C = (10n ** 18n) / ((MID * 90n) / 100n); // floor under the ask: in band
  const RUNG20 = `jing-buy-stx-spread-20-floor-${centsName(IN_C)}`, RUNG0 = `jing-buy-stx-spread-0-floor-${centsName(IN_C)}`;
  const rid = (n) => `${DEP}.${n}`;
  console.log(`mid ${MID}; ${RUNG20}; ${RUNG0}`);

  const T = mk(101), X9 = mk(102);
  const R_AMT = 3000n, Y_SOLD = (R_AMT * PA(20n)) / PPDF + 100_000n; // takes the whole rung, leftover under 1 STX
  const BIG = 2_000_000_000n, SMALL = 2_000_000n; // 2000 STX peg vs a 2 STX taker: 0.1% < MIN_SHARE_BPS 0.2%

  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const sp = (s) => (s === null ? noneCV() : someCV(uintCV(s)));
  const depY = (who, amt, limit, spread) => call(who, "deposit-token-y", [uintCV(amt), uintCV(limit), sp(spread), UPD, wstxT, wstxA]);
  const depX = (who, amt, limit, spread) => call(who, "deposit-token-x", [uintCV(amt), uintCV(limit), sp(spread), UPD, sbtcT, sbtcA]);
  const swap = (who, amount, limit, depXSide) => call(who, "swap", [uintCV(amount), uintCV(limit), UPD, sbtcT, sbtcA, wstxT, wstxA, depXSide ? trueCV() : falseCV()]);
  const stxSend = (to, ustx) => (bb) => bb.withSender(S).addSTXTransfer({ recipient: to, amount: Number(ustx) });
  const satsSend = (to, sats) => call(A, "transfer", [uintCV(sats), standardPrincipalCV(A), standardPrincipalCV(to), noneCV()], SBTC);

  deploy(CORE, src(CORE)); deploy(MKT, src(MKT));
  tx("core-v5 verifies v6", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(ok true)");
  tx("v6 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)");
  deploy("jing-ladder", src("jing-ladder")); deploy(RUNG20, src("jing-buy-stx-market-spread")); deploy(RUNG0, src("jing-buy-stx-market-spread"));
  tx("canonical buy-peg", call(DEP, "set-canonical", [stringAsciiCV("buy-peg"), contractPrincipalCV(DEP, RUNG20)], LADDER), "(ok true)");
  tx(`init ${RUNG20}`, call(DEP, "initialize", [uintCV(20), uintCV(IN_C)], rid(RUNG20)), "(ok true)");
  tx(`init ${RUNG0} (spread 0 is a valid rung)`, call(DEP, "initialize", [uintCV(0), uintCV(IN_C)], rid(RUNG0)), "(ok true)");
  tx("fund T stx", stxSend(T, SMALL + 2_000_000n), (v) => String(v).startsWith("(ok"));
  tx("fund X9 stx", stxSend(X9, 1_000_000n), (v) => String(v).startsWith("(ok"));
  tx("fund X9 sats", satsSend(X9, 1100n), "(ok true)");

  // =============== O: sold out through fills ===============
  tx("O1 A deposits 3000 sats into the 20 bps rung", call(A, "deposit", [uintCV(R_AMT), UPD], rid(RUNG20)), "(ok true)");
  ev("O1 rung epoch u0, shares > 0", "(get-state)", (v) => field(v, "epoch") === "u0" && uintOf(field(v, "total-shares")) > 0n, rid(RUNG20));
  tx(`O2 S sells ${Y_SOLD} uSTX at +35 bps: takes the whole rung`, swap(S, grossFor(Y_SOLD), PA(35n), false), (v) => String(v).startsWith("(ok"));
  ev("O2 rung off the market (0 sats)", `(get-token-x-deposit (get-current-cycle) '${rid(RUNG20)})`, "u0");
  tx("O3 sync closes the epoch", call(S, "sync", [], rid(RUNG20)), "(ok true)");
  ev("O3 epoch u1, total-shares u0, unfilled-index reset", "(get-state)", (v) => field(v, "epoch") === "u1" && field(v, "total-shares") === "u0" && field(v, "unfilled-index") === `u${SCALE}`, rid(RUNG20));
  ev("O3 A's position: nothing unsold, STX proceeds pending", `(get-position '${A})`, (v) => field(v, "sbtc") === "u0" && uintOf(field(v, "stx")) > 0n, rid(RUNG20));
  const a0 = ev("O4 A STX before claim", `(stx-get-balance '${A})`, () => true);
  tx("O4 A claims", call(A, "claim", [], rid(RUNG20)), (v) => String(v).startsWith("(ok"));
  const a1 = ev("O4 A STX after claim", `(stx-get-balance '${A})`, () => true);
  ev("O4 A's proceeds settled", `(get-position '${A})`, (v) => field(v, "stx") === "u0", rid(RUNG20));
  tx("O5 A deposits 2000 sats: opens epoch u1", call(A, "deposit", [uintCV(2000), UPD], rid(RUNG20)), "(ok true)");
  ev("O5 rung resting 2000 in epoch u1", "(get-state)", (v) => field(v, "epoch") === "u1" && field(v, "resting") === "u2000", rid(RUNG20));
  ev("O5 A's new position 2000 unsold, old-epoch proceeds settled", `(get-position '${A})`, (v) => field(v, "sbtc") === "u2000" && field(v, "stx") === "u0", rid(RUNG20));

  // =============== G: guard edges ===============
  ev(`G1 pegged-bid with cap exactly mid - 30 bps -> in band (${PB(30n)})`, `(pegged-bid u${MID} u30 u${PB(30n)})`, `u${PB(30n)}`);
  ev("G1 cap one unit under -> u0", `(pegged-bid u${MID} u30 u${PB(30n) - 1n})`, "u0");
  ev(`G2 pegged-ask with floor exactly mid + 30 bps -> in band (${PA(30n)})`, `(pegged-ask u${MID} u30 u${PA(30n)})`, `u${PA(30n)}`);
  ev("G2 floor one unit over -> MAX_UINT", `(pegged-ask u${MID} u30 u${PA(30n) + 1n})`, `u${MAX_UINT}`);
  ev(`G3 spread 9999 bid = mid / 10000 (${MID / 10000n})`, `(pegged-bid u${MID} u9999 u${HUGE})`, `u${(MID * 1n) / 10000n}`);
  ev(`G3 spread 9999 ask = mid * 1.9999 (${(MID * 19999n) / 10000n})`, `(pegged-ask u${MID} u9999 u1)`, `u${(MID * 19999n) / 10000n}`);
  tx("G4 X9 rests a 9999 bps peg ask (widest peg) 1000 sats", depX(X9, 1000n, 1n, 9999n), "(ok u1000)");
  ev("G4 order (some u9999)", `(get-token-x-order '${X9})`, (v) => field(v, "spread-bps") === "(some u9999)");
  ev(`G4 limit-at = ${(MID * 19999n) / 10000n}`, `(token-x-limit-at '${X9} u${MID})`, `u${(MID * 19999n) / 10000n}`);

  // =============== U: small taker vs a big zero-spread peg on its own side ===============
  tx("U1 S rests a 2000 STX zero-spread peg bid (asks rest above mid: no cross)", depY(S, BIG, HUGE, 0n), `(ok u${BIG})`);
  ev("U1 S limit-at = mid", `(token-y-limit-at '${S} u${MID})`, `u${MID}`);
  tx("U2 T sells 2 STX (0.1% of the y side, under 0.2%) -> u1020 TAKER_TOO_SMALL", swap(T, grossFor(SMALL), PA(35n), false), "(err u1020)");
  ev("U2 S's peg untouched", `(get-token-y-deposit (get-current-cycle) '${S})`, `u${BIG}`);

  // =============== H: rung hold paths ===============
  tx("H1 A deposits 3000 into the ZERO-spread rung: its ask at mid would take S's bid -> u1016 -> HELD", call(A, "deposit", [uintCV(3000), UPD], rid(RUNG0)), "(ok true)");
  ev("H1 held 3000, nothing on the market", "(get-state)", (v) => field(v, "held-sats") === "u3000" && field(v, "resting") === "u0", rid(RUNG0));
  ev("H1 A's position 3000 unsold (held counts)", `(get-position '${A})`, (v) => field(v, "sbtc") === "u3000", rid(RUNG0));
  tx("H2 S cancels the zero-spread bid", call(S, "cancel-token-y-deposit", [wstxT, wstxA]), `(ok u${BIG})`);
  tx("H2 A deposits 1000 more: 4000 pushed at mid", call(A, "deposit", [uintCV(1000), UPD], rid(RUNG0)), "(ok true)");
  ev("H2 resting 4000, held 0", "(get-state)", (v) => field(v, "held-sats") === "u0" && field(v, "resting") === "u4000", rid(RUNG0));
  ev("H2 rung order (some u0) at mid", `(token-x-limit-at '${rid(RUNG0)} u${MID})`, `u${MID}`);
  tx("H3 S rests a bid at -5% (a y maker: the next x deposit must read a price)", depY(S, 5_000_000n, PB(500n), null), "(ok u5000000)");
  tx("H3 A deposits 1000 with a STALE update: the market refuses, the rung HOLDS", call(A, "deposit", [uintCV(1000), STALE], rid(RUNG0)), "(ok true)");
  ev("H3 held 1000, resting still 4000", "(get-state)", (v) => field(v, "held-sats") === "u1000" && field(v, "resting") === "u4000", rid(RUNG0));
  tx("H4 A deposits 1000 with a fresh update: 2000 pushed, resting 6000", call(A, "deposit", [uintCV(1000), UPD], rid(RUNG0)), "(ok true)");
  ev("H4 held 0, resting 6000", "(get-state)", (v) => field(v, "held-sats") === "u0" && field(v, "resting") === "u6000", rid(RUNG0));

  // =============== C: core-v5 authority ===============
  const tokX = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"), tokY = wstxT;
  tx("C1 stranger log-peg-x -> u5001", call(STRANGER, "log-peg-x", [standardPrincipalCV(STRANGER), uintCV(30), uintCV(1), uintCV(0), tokX, tokY], CORE_ID), "(err u5001)");
  tx("C2 stranger log-park-x -> u5001", call(STRANGER, "log-park-x", [standardPrincipalCV(STRANGER), uintCV(1), uintCV(0), uintCV(1), tokX, tokY], CORE_ID), "(err u5001)");
  tx("C3 stranger log-readmit-x -> u5001", call(STRANGER, "log-readmit-x", [standardPrincipalCV(STRANGER), uintCV(1), uintCV(0), uintCV(1), tokX, tokY], CORE_ID), "(err u5001)");
  tx("C4 stranger log-set-limit-x -> u5001", call(STRANGER, "log-set-limit-x", [standardPrincipalCV(STRANGER), uintCV(1), tokX, tokY], CORE_ID), "(err u5001)");
  tx("C5 the deployer is not a market either -> u5001", call(DEP, "log-peg-y", [standardPrincipalCV(DEP), uintCV(30), uintCV(1), uintCV(0), tokX, tokY], CORE_ID), "(err u5001)");

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); i += 1; if (!/^fund /.test(st.label)) check(st.label, st.raw, st.want); else if (/ERR|\(err/.test(String(st.raw))) check(st.label, st.raw, st.want); }
  check("O4 A's STX grew by the claim", uintOf(a1.raw) - uintOf(a0.raw), (d) => d > 0n);
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
