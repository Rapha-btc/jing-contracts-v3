// verify-v6-peg-mirror-lazer.js
// The x-side mirrors of checks that only ran on the y side, on a PARK
// instance of markets-sbtc-stx-jing-v6 (MAX_DEPOSITORS u50 -> u3, sim-only,
// the bounty-fixes recipe) plus the main market, one real Lazer update.
//   X  an out-of-band zero-spread peg ASK is the farthest maker and is parked
//      first; set-token-x-limit while parked re-pegs it to mid; readmit is
//      refused u1016 while an in-range bid rests (a readmitted ask at mid
//      would take it), accepted once the bid leaves; a top-up under the
//      minimum onto the live position is fine (position-wide minimum)
//   R  reprice-or-swap-token-y with a spread: fixed -> 30 bps peg is a plain
//      reprice (no ask in range), u1026 on 10000 bps, then to a zero-spread
//      peg against a resting in-range ask: crosses and swaps at mid
// Run: PYTH_API_KEY=<key> npx tsx simulations/verify-v6-peg-mirror-lazer.js
import fs from "node:fs";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  noneCV, someCV, deserializeCV, cvToString, hexToCV, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v5", MKT = "markets-sbtc-stx-jing-v6", PARK = "markets-sbtc-stx-jing-v6-park";
const CORE_ID = `${DEP}.${CORE}`, MARKET = `${DEP}.${MKT}`, PID = `${DEP}.${PARK}`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"), wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2"; // sBTC whale: funds sats, the in-range ask in R
const S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";  // STX whale: funds STX
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + "01", "mainnet");
const PP = 100_000_000n, PPDF = PP * 100n, BPS = 10_000n, HUGE = 999_999_999_999_999n, MAX_UINT = 340282366920938463463374607431768211455n;
const src = (f) => fs.readFileSync(`./contracts/${f}.clar`, "utf8");
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const prints = (step) => (step?.Result?.Transaction?.Ok?.events || []).map((e) => { try { const o = typeof e === "string" ? JSON.parse(e) : e; const raw = o.contract_event?.raw_value; return raw ? cvToString(hexToCV(raw)) : ""; } catch { return ""; } });
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|\\(some u\\d+\\))\\)`)) || [])[1];

async function main() {
  console.log("=== v6 pegged x-side mirrors: parked zero-spread ask, reprice-or-swap-y with a spread ===");
  const lz = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const MID = (lz.px * PP) / lz.py;
  const PB = (s) => (MID * (BPS - s)) / BPS, PA = (s) => (MID * (BPS + s)) / BPS;
  const HIGH_FLOOR = MID * 2n;
  console.log(`mid ${MID}`);
  if ((2000n * MID) / PPDF <= 4_000_000n) throw new Error("R sizing: 2000 sats must be worth more than 4 STX");
  let mktSrc = src(MKT);
  if (!mktSrc.includes("(define-constant MAX_DEPOSITORS u50)")) throw new Error("MAX_DEPOSITORS anchor missing");
  const parkSrc = mktSrc.replace("(define-constant MAX_DEPOSITORS u50)", "(define-constant MAX_DEPOSITORS u3)");

  const Q1 = mk(111), Q2 = mk(112), Q3 = mk(113), N4 = mk(114), Y1 = mk(115), Y2 = mk(116);
  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const sp = (s) => (s === null ? noneCV() : someCV(uintCV(s)));
  const depY = (who, amt, limit, spread, cid = MARKET) => call(who, "deposit-token-y", [uintCV(amt), uintCV(limit), sp(spread), UPD, wstxT, wstxA], cid);
  const depX = (who, amt, limit, spread, cid = MARKET) => call(who, "deposit-token-x", [uintCV(amt), uintCV(limit), sp(spread), UPD, sbtcT, sbtcA], cid);
  const stxSend = (to, ustx) => (bb) => bb.withSender(S).addSTXTransfer({ recipient: to, amount: Number(ustx) });
  const satsSend = (to, sats) => call(A, "transfer", [uintCV(sats), standardPrincipalCV(A), standardPrincipalCV(to), noneCV()], SBTC);

  deploy(CORE, src(CORE)); deploy(MKT, mktSrc); deploy(PARK, parkSrc);
  for (const [name, cid] of [[MKT, MARKET], [PARK, PID]]) {
    tx(`core-v5 verifies ${name}`, call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, name)], CORE_ID), "(ok true)");
    tx(`initialize ${name}`, call(DEP, "initialize", [contractPrincipalCV(DEP, name), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)], cid), "(ok true)");
  }
  for (const [who, ustx, sats] of [[Q1, 1_000_000n, 4000n], [Q2, 1_000_000n, 4000n], [Q3, 1_000_000n, 4000n], [N4, 1_000_000n, 4000n], [Y1, 3_500_000n, 0n], [Y2, 7_000_000n, 0n]]) {
    tx(`fund ${who.slice(0, 6)} stx`, stxSend(who, ustx), (v) => String(v).startsWith("(ok")); if (sats > 0n) tx(`fund ${who.slice(0, 6)} sats`, satsSend(who, sats), "(ok true)");
  }

  // =============== X: parked zero-spread ask on the park instance ===============
  tx("X1 Q1 fixed in-range ask 3000 (limit 1)", depX(Q1, 3000n, 1n, null, PID), "(ok u3000)");
  tx("X1 Q2 zero-spread peg ask, floor 2x mid (out of band) 3000", depX(Q2, 3000n, HIGH_FLOOR, 0n, PID), "(ok u3000)");
  tx("X1 Q3 fixed ask +5% 3000", depX(Q3, 3000n, PA(500n), null, PID), "(ok u3000)");
  ev("X1 Q2 inactive (MAX_UINT)", `(token-x-limit-at '${Q2} u${MID})`, `u${MAX_UINT}`, PID);
  ev("X1 side full (3)", "(len (get-token-x-depositors u0))", "u3", PID);
  tx("X2 N4 in-range newcomer: parks the farthest = Q2", depX(N4, 3000n, 1n, null, PID), "(ok u3000)");
  ev("X2 Q2 parked 3000", `(get-token-x-parked '${Q2})`, "u3000", PID);
  ev("X2 Q3 (+5%) still live", `(get-token-x-deposit u0 '${Q3})`, "u3000", PID);
  tx("X3 Q2 re-pegs while parked: zero spread, floor 1 (no bid rests: no price)", call(Q2, "set-token-x-limit", [uintCV(1), someCV(uintCV(0)), UPD], PID), "(ok true)");
  ev("X3 Q2 limit-at = mid now", `(token-x-limit-at '${Q2} u${MID})`, `u${MID}`, PID);
  tx("X4 Q1 cancels", call(Q1, "cancel-token-x-deposit", [sbtcT, sbtcA], PID), "(ok u3000)");
  tx("X4 N4 cancels (no in-range ask left)", call(N4, "cancel-token-x-deposit", [sbtcT, sbtcA], PID), "(ok u3000)");
  tx("X4 Y1 rests an in-range bid 2 STX (Q3 is above mid: rests)", depY(Y1, 2_000_000n, HUGE, null, PID), "(ok u2000000)");
  tx("X5 readmit Q2 -> u1016: an ask at mid would take Y1", call(DEP, "readmit-token-x", [standardPrincipalCV(Q2), UPD], PID), "(err u1016)");
  ev("X5 Q2 still parked", `(get-token-x-parked '${Q2})`, "u3000", PID);
  tx("X6 Y1 cancels", call(Y1, "cancel-token-y-deposit", [wstxT, wstxA], PID), "(ok u2000000)");
  tx("X6 readmit Q2 -> ok", call(DEP, "readmit-token-x", [standardPrincipalCV(Q2), UPD], PID), "(ok u3000)");
  ev("X6 Q2 live 3000, order (some u0)", `(get-token-x-order '${Q2})`, (v) => field(v, "spread-bps") === "(some u0)" && field(v, "limit") === "u1", PID);
  tx("X7 Q2 tops up 500 sats (under the minimum, onto a live 3000) -> ok", depX(Q2, 500n, 1n, 0n, PID), "(ok u500)");
  ev("X7 Q2 position 3500", `(get-token-x-deposit u0 '${Q2})`, "u3500", PID);

  // =============== R: reprice-or-swap-token-y with a spread (main market) ===============
  tx("R1 Y2 fixed bid at -5%, 4 STX", depY(Y2, 4_000_000n, PB(500n), null), "(ok u4000000)");
  tx("R2 reprice to a 30 bps peg, cap any: plain reprice (no ask)", call(Y2, "reprice-or-swap-token-y", [uintCV(HUGE), someCV(uintCV(30)), UPD, sbtcT, sbtcA, wstxT, wstxA]), (v) => v.includes("(token-x-received u0)") && v.includes("(token-y-received u0)"));
  ev("R2 order (some u30)", `(get-token-y-order '${Y2})`, (v) => field(v, "spread-bps") === "(some u30)");
  ev(`R2 limit-at = mid - 30 bps (${PB(30n)})`, `(token-y-limit-at '${Y2} u${MID})`, `u${PB(30n)}`);
  tx("R3 spread 10000 -> u1026", call(Y2, "reprice-or-swap-token-y", [uintCV(HUGE), someCV(uintCV(10000)), UPD, sbtcT, sbtcA, wstxT, wstxA]), "(err u1026)");
  tx("R4 A rests an in-range ask 2000 sats (the peg is under mid: no cross)", depX(A, 2000n, 1n, null), "(ok u2000)");
  const rs = tx("R5 Y2 reprices to a ZERO-spread peg: would take the ask -> crosses and swaps at mid", call(Y2, "reprice-or-swap-token-y", [uintCV(HUGE), someCV(uintCV(0)), UPD, sbtcT, sbtcA, wstxT, wstxA]), (v) => String(v).startsWith("(ok") && uintOf((String(v).match(/\(token-x-received (u\d+)\)/) || [])[1]) > 0n);
  ev("R5 cycle advanced", "(get-current-cycle)", "u1");
  ev("R5 settlement at mid", "(get price (unwrap-panic (get-settlement u0)))", `u${MID}`);
  ev("R5 Y2's bid consumed (y binding: 4 STX is under 2000 sats)", `(get-token-y-deposit u1 '${Y2})`, "u0");
  ev(`R5 A's ask left ${2000n - (4_000_000n * PPDF) / MID} sats, under the minimum: refunded in the batch (v6)`, `(get-token-x-deposit u1 '${A})`, "u0");
  ev("R5 A's order deleted with the refund", `(get-token-x-order '${A})`, (v) => field(v, "limit") === "u0");

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; if (!/^fund /.test(st.label)) check(st.label, st.raw, st.want); else if (/ERR|\(err/.test(String(st.raw))) check(st.label, st.raw, st.want); }
  const refunds = prints(s[rs.idx]).filter((p) => p.includes('(event "refund-x")'));
  check(`R5 refund-x logged for the ${2000n - (4_000_000n * PPDF) / MID} sats`, refunds.join("|"), (v) => v.includes(`(amount u${2000n - (4_000_000n * PPDF) / MID})`));
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
