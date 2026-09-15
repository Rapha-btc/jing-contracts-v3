// verify-v6-small-share-x-lazer.js
// The small-share filter on the X side (mirror of peg-batch Z6 / Z12, which
// only exercised the y side): in a y-binding batch an ask whose size is
// under MIN_SHARE_BPS (0.2%) of the x side is ROLLED into the next cycle
// with its order intact instead of being filled, and the core logs
// small-share-roll-x. Two asks: XB 600,000 sats fixed in range, XT 1,000
// sats zero-spread peg (0.17% of the side); a taker sells 3 STX (y binding,
// far under the side): XB fills pro-rata at the mid, XT is rolled.
// Run: PYTH_API_KEY=<key> npx tsx simulations/verify-v6-small-share-x-lazer.js
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
  console.log("=== v6 small-share roll on the x side (mirror of peg-batch Z6) ===");
  const lz = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const MID = (lz.px * PP) / lz.py;
  const PB = (s) => (MID * (BPS - s)) / BPS, PA = (s) => (MID * (BPS + s)) / BPS;
  const USTX_PER_SAT = MID / PPDF;
  console.log(`mid ${MID} (1 sat ~ ${USTX_PER_SAT} uSTX, 1 STX ~ ${(10n ** 16n) / MID} sats)`);

  const XB = mk(81), XT = mk(82), TY = mk(83), TS = mk(84);
  const XB_AMT = 600_000n, XT_AMT = 1_000n, TY_NET = 3_000_000n; // 3 STX net
  if (XT_AMT * BPS >= (XB_AMT + XT_AMT) * 20n) throw new Error("sizing: XT must be under MIN_SHARE_BPS of the side");
  const XC = (TY_NET * PPDF) / MID; // sats cleared at mid (y binding)
  if (XC >= XB_AMT) throw new Error("sizing: 3 STX must be under XB");
  const TY_REB = grossFor(TY_NET) - TY_NET;
  const XB_LEFT = XB_AMT - XC; // the whole cleared x comes off XB: XT is rolled before totals

  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const sp = (s) => (s === null ? noneCV() : someCV(uintCV(s)));
  const depX = (who, amt, limit, spread) => call(who, "deposit-token-x", [uintCV(amt), uintCV(limit), sp(spread), UPD, sbtcT, sbtcA]);
  const swap = (who, amount, limit, depXSide) => call(who, "swap", [uintCV(amount), uintCV(limit), UPD, sbtcT, sbtcA, wstxT, wstxA, depXSide ? trueCV() : falseCV()]);
  const stxSend = (to, ustx) => (bb) => bb.withSender(S).addSTXTransfer({ recipient: to, amount: Number(ustx) });
  const satsSend = (to, sats) => call(A, "transfer", [uintCV(sats), standardPrincipalCV(A), standardPrincipalCV(to), noneCV()], SBTC);
  const ordX = (who) => `(get-token-x-order '${who})`;
  const depOfX = (c, who) => `(get-token-x-deposit u${c} '${who})`;

  deploy(CORE, src(CORE)); deploy("jing-ladder", src("jing-ladder")); deploy(MKT, src(MKT));
  tx("core-v5 verifies v6", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(ok true)");
  tx("v6 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(MIN_SBTC), uintCV(MIN_STX), uintCV(1), uintCV(45)]), "(ok true)");
  for (const [who, ustx, sats] of [[XB, 1_000_000n, XB_AMT], [XT, 1_000_000n, XT_AMT], [TY, grossFor(TY_NET) + 1_000_000n, 0n], [TS, 1_000_000n, 1300n]]) {
    tx(`fund ${who.slice(0, 6)} stx`, stxSend(who, ustx), (v) => String(v).startsWith("(ok"));
    if (sats > 0n) tx(`fund ${who.slice(0, 6)} sats`, satsSend(who, sats), "(ok true)");
  }
  tx("X1 XB fixed in-range ask 600,000 sats", depX(XB, XB_AMT, 1n, null), `(ok u${XB_AMT})`);
  tx("X2 XT zero-spread peg ask 1,000 sats (0.17% of the side)", depX(XT, XT_AMT, 1n, 0n), `(ok u${XT_AMT})`);
  ev("X3 XT order (some u0)", ordX(XT), (v) => field(v, "spread-bps") === "(some u0)");
  const xs = tx(`X4 TY sells 3 STX net (y binding): batch at mid, XB fills, XT rolled`, swap(TY, grossFor(TY_NET), (MID * 103n) / 100n, false), (v) => String(v).startsWith("(ok"));
  ev("X5 cycle u1", "(get-current-cycle)", "u1");
  ev("X6 settlement u0 price == mid", "(get price (unwrap-panic (get-settlement u0)))", `u${MID}`);
  ev(`X7 XB left ${XB_LEFT} (the whole cleared x came off XB)`, depOfX(1, XB), `u${XB_LEFT}`);
  ev("X8 XT rolled by the small-share filter, size intact", depOfX(1, XT), `u${XT_AMT}`);
  ev("X9 XT order intact (some u0)", ordX(XT), (v) => field(v, "spread-bps") === "(some u0)");
  ev("X10 XT got no STX", `(stx-get-balance '${XT})`, "u1000000");
  ev("X11 x side of cycle 1 has both", "(len (get-token-x-depositors u1))", "u2");
  // the taker-too-small path on the X side (mirror of u1020 on y): the taker deposits x against a
  // resting bid, and its own x share is under MIN_SHARE_BPS of the side -> the filter flags it, u1020
  const depY = (who, amt, limit, spread) => call(who, "deposit-token-y", [uintCV(amt), uintCV(limit), sp(spread), UPD, wstxT, wstxA]);
  const setX = (who, limit, spread) => call(who, "set-token-x-limit", [uintCV(limit), sp(spread), UPD]);
  // mirror of bounty-fixes B2 (in-range whale + small taker -> u1020): the big ask stays IN RANGE
  // on the taker's side (fixed at the mid: a bid 2% under it does not cross it), the other side's
  // bid at -2% is limit-violating at the clearing mid and is rolled out first, so the taker's x share
  // is measured against XB and flagged before anything fills
  tx("X12a XB reprices to a fixed ask AT the mid (in range, not crossed by a bid under the mid)", setX(XB, MID, null), "(ok true)");
  tx("X12 the STX whale rests a 50 STX bid at -2%", depY(S, 50_000_000n, (MID * 98n) / 100n, null), "(ok u50000000)");
  ev("X12c cycle 1 x total before the taker (XB left + XT)", "(get total-token-x (get-cycle-totals u1))", (v) => uintOf(v) > 590_000n);
  ev("X12d cycle 1 x depositors", "(len (get-token-x-depositors u1))", "u2");
  tx("X13 TS sells 1100 sats gross (deposit-x taker, limit -3%): 0.18% of an in-range x side of ~600k -> u1020 taker too small", swap(TS, 1100n, (MID * 97n) / 100n, true), "(err u1020)");
  ev("X14 TS holds its sats (the refused swap moved nothing)", `(contract-call? '${SBTC} get-balance '${TS})`, "(ok u1300)");

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; check(st.label, st.raw, st.want); }
  check("X4 small-share-roll-x logged for XT", prints(s[xs.idx]).filter((p) => p.includes('(event "small-share-roll-x")') && p.includes(XT)).length, (v) => v === 1);
  check("X4 no walk (no match log): a batch fill", prints(s[xs.idx]).filter((p) => p.includes('(event "match")')).length, (v) => v === 0);
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
