// verify-v6-peg-park-y-lazer.js
// The y-side mirror of verify-v6-peg-park-lazer.js plus the readmit gate:
//   Y1 a sell-stx peg rung whose cap is under the pegged bid rests inactive
//      (token-y-limit-at u0); 49 fixed bids at -5% fill the y queue; an
//      in-range newcomer parks the furthest maker = the inactive peg rung
//   Y2 rung flows while parked: sync counts the parked size, a member
//      withdraws from it, a deposit on the full queue is held (readmit u1010
//      inside the rung), a filler leaves, the next deposit readmits and pushes
//   Y3 a direct maker: an out-of-band zero-spread peg on the full queue bumps
//      the smallest deposit (not parked: it is not in range), the next
//      in-range newcomer parks it (the rung exits first: out of band its
//      gap equals P's); while parked it re-pegs to zero spread /
//      any cap (in range now); readmit -> u1016 while an in-range ask rests
//      (a readmitted zero-spread peg at mid would take it), ok once the ask
//      leaves; live again with its order and its price at mid
// Run: PYTH_API_KEY=<key> npx tsx simulations/verify-v6-peg-park-y-lazer.js
import fs from "node:fs";
import { ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV, noneCV, someCV, deserializeCV, cvToString, getAddressFromPrivateKey } from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v5", MKT = "markets-sbtc-stx-jing-v6";
const CORE_ID = `${DEP}.${CORE}`, MARKET = `${DEP}.${MKT}`, LADDER = `${DEP}.jing-ladder`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"), wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2"; // sBTC whale: the in-range ask in Y3
const S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";  // STX whale: rung member, funds every filler
const FILLERS = Array.from({ length: 49 }, (_, i) => getAddressFromPrivateKey((i + 200).toString(16).padStart(64, "0") + "01", "mainnet"));
const PARKER = getAddressFromPrivateKey("8".repeat(64) + "01", "mainnet");
const PARKER2 = getAddressFromPrivateKey("9".repeat(64) + "01", "mainnet");
const P = getAddressFromPrivateKey("a".repeat(64) + "01", "mainnet");
const F50 = getAddressFromPrivateKey((249).toString(16).padStart(64, "0") + "01", "mainnet");
const PP = 100_000_000n, SCALE = 1_000_000_000_000n, BPS = 20n, FILL = 1_500_000n, HUGE = 999_999_999_999_999n;
const src = (f) => fs.readFileSync(`./contracts/${f}.clar`, "utf8");
const centsName = (c) => { const w = c / 100n, f = c % 100n; return `${w}-${f < 10n ? "0" : ""}${f}`; };
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|\\(some u\\d+\\))\\)`)) || [])[1];

async function main() {
  console.log("=== v6 park of an inactive peg on the y side + readmit gate ===");
  const full = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(full.hex, "hex"));
  const MID = (full.px * PP) / full.py;
  const OUT_C = (10n ** 18n) / ((MID * 90n) / 100n); // cap under the bid: inactive
  const RUNG = `jing-sell-stx-spread-${BPS}-cap-${centsName(OUT_C)}`, RID = `${DEP}.${RUNG}`;
  const BID_NEAR = (MID * 95n) / 100n, LOW_CAP = MID / 2n;
  console.log(`mid ${MID}; ${RUNG} (out of band); 49 fillers at -5%, parker in range`);
  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const sp = (s) => (s === null ? noneCV() : someCV(uintCV(s)));
  const depY = (who, amt, limit, spread) => call(who, "deposit-token-y", [uintCV(amt), uintCV(limit), sp(spread), UPD, wstxT, wstxA]);
  const stxSend = (to, ustx) => (bb) => bb.withSender(S).addSTXTransfer({ recipient: to, amount: Number(ustx) });

  deploy(CORE, src(CORE)); deploy(MKT, src(MKT));
  tx("core-v5 verifies v6", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(ok true)");
  tx("v6 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)");
  deploy("jing-ladder", src("jing-ladder")); deploy(RUNG, src("jing-sell-stx-market-spread"));
  tx("canonical sell-peg", call(DEP, "set-canonical", [stringAsciiCV("sell-peg"), contractPrincipalCV(DEP, RUNG)], LADDER), "(ok true)");
  tx(`init ${RUNG}`, call(DEP, "initialize", [uintCV(BPS), uintCV(OUT_C)], RID), "(ok true)");

  // =============== Y1: the inactive rung is parked first ===============
  tx("Y1 S deposits 20 STX: the peg rests, inactive at this mid", call(S, "deposit", [uintCV(20_000_000), UPD], RID), "(ok true)");
  ev("Y1 limit-at = u0 (inactive)", `(token-y-limit-at '${RID} u${MID})`, "u0");
  FILLERS.forEach((f, i) => {
    tx(`Y1 fund filler ${i + 1}`, stxSend(f, FILL + 200_000n), (v) => String(v).startsWith("(ok"));
    tx(`Y1 filler ${i + 1} rests ${FILL} at -5%`, depY(f, FILL, BID_NEAR, null), `(ok u${FILL})`);
  });
  ev("Y1 y queue full (50)", "(len (get-token-y-depositors u0))", "u50");
  tx("Y1 fund the parker", stxSend(PARKER, 3_000_000n), (v) => String(v).startsWith("(ok"));
  tx("Y1 parker rests an IN-RANGE bid on the full queue: parks the furthest = the inactive peg", depY(PARKER, 2_000_000n, HUGE, null), "(ok u2000000)");
  ev("Y1 the rung is parked with its full 20 STX", `(get-token-y-parked '${RID})`, "u20000000");
  ev("Y1 the rung is off the live queue", `(get-token-y-deposit u0 '${RID})`, "u0");
  ev("Y1 queue still 50", "(len (get-token-y-depositors u0))", "u50");
  ev("Y1 the rung's order survives parking", `(get-token-y-order '${RID})`, (v) => field(v, "spread-bps") === `(some u${BPS})`);

  // =============== Y2: rung flows while parked ===============
  tx("Y2 sync while parked", call(S, "sync", [], RID), "(ok true)");
  ev("Y2 market-size counts the parked balance: unfilled-index unchanged", "(get-state)", (v) => field(v, "unfilled-index") === `u${SCALE}` && field(v, "resting") === "u20000000", RID);
  tx("Y2 S withdraws 0.5 STX from the parked balance", call(S, "withdraw", [uintCV(500_000)], RID), "(ok true)");
  ev("Y2 parked now 19.5 STX", `(get-token-y-parked '${RID})`, "u19500000");
  tx("Y2 S deposits 1 STX while the queue is full: readmit fails, held locally", call(S, "deposit", [uintCV(1_000_000), UPD], RID), "(ok true)");
  ev("Y2 held 1 STX, still parked 19.5", "(get-state)", (v) => field(v, "held-ustx") === "u1000000", RID);
  ev("Y2 parked unchanged", `(get-token-y-parked '${RID})`, "u19500000");
  tx("Y2 a filler cancels: room in the queue", call(FILLERS[0], "cancel-token-y-deposit", [wstxT, wstxA]), `(ok u${FILL})`);
  tx("Y2 S deposits 1 STX more: readmit succeeds, everything pushed", call(S, "deposit", [uintCV(1_000_000), UPD], RID), "(ok true)");
  ev("Y2 parked 0", `(get-token-y-parked '${RID})`, "u0");
  ev("Y2 live again with 21.5 STX", `(get-token-y-deposit u0 '${RID})`, "u21500000");
  ev("Y2 held 0", "(get-state)", (v) => field(v, "held-ustx") === "u0", RID);
  ev("Y2 queue full again (50)", "(len (get-token-y-depositors u0))", "u50");

  // =============== Y3: direct maker, zero-spread peg through park and readmit ===============
  // the rung leaves first: while it is out of band its gap equals P's (both
  // sentinel u0), and park-one keeps the FIRST maker at the largest gap
  tx("Y3 S exits the rung entirely (whole cancel, off the market)", call(S, "withdraw", [uintCV(999_999_999)], RID), "(ok true)");
  ev("Y3 rung off the queue", `(get-token-y-deposit u0 '${RID})`, "u0");
  ev("Y3 queue 49", "(len (get-token-y-depositors u0))", "u49");
  tx("Y3 fund filler 50", stxSend(F50, FILL + 200_000n), (v) => String(v).startsWith("(ok"));
  tx(`Y3 filler 50 rests ${FILL} at -5%: full again`, depY(F50, FILL, BID_NEAR, null), `(ok u${FILL})`);
  tx("Y3 fund P", stxSend(P, 4_000_000n), (v) => String(v).startsWith("(ok"));
  tx("Y3 P rests an out-of-band zero-spread peg (cap mid/2), 2 STX, on the full queue: not in range, so it bumps the smallest (a 1.5 STX filler)", depY(P, 2_000_000n, LOW_CAP, 0n), "(ok u2000000)");
  ev("Y3 P live", `(get-token-y-deposit u0 '${P})`, "u2000000");
  ev("Y3 queue 50 (one filler bumped out)", "(len (get-token-y-depositors u0))", "u50");
  ev("Y3 P limit-at = u0 (cap under mid)", `(token-y-limit-at '${P} u${MID})`, "u0");
  tx("Y3 fund parker 2", stxSend(PARKER2, 3_000_000n), (v) => String(v).startsWith("(ok"));
  tx("Y3 parker 2 rests in range: parks the furthest = P (gap = the whole mid)", depY(PARKER2, 2_000_000n, HUGE, null), "(ok u2000000)");
  ev("Y3 P parked 2 STX", `(get-token-y-parked '${P})`, "u2000000");
  ev("Y3 queue still 50", "(len (get-token-y-depositors u0))", "u50");
  tx("Y3 P re-pegs while parked: zero spread, any cap (no asks rest: no price needed)", call(P, "set-token-y-limit", [uintCV(HUGE), someCV(uintCV(0)), UPD]), "(ok true)");
  ev("Y3 P limit-at = mid now", `(token-y-limit-at '${P} u${MID})`, `u${MID}`);
  tx("Y3 parker cancels", call(PARKER, "cancel-token-y-deposit", [wstxT, wstxA]), "(ok u2000000)");
  tx("Y3 parker 2 cancels", call(PARKER2, "cancel-token-y-deposit", [wstxT, wstxA]), "(ok u2000000)");
  tx("Y3 A rests an in-range ask 2000 sats (no live bid at or over mid: rests)", call(A, "deposit-token-x", [uintCV(2000), uintCV(1), noneCV(), UPD, sbtcT, sbtcA]), "(ok u2000)");
  tx("Y3 readmit P -> u1016: a zero-spread peg at mid would take the ask", call(DEP, "readmit-token-y", [standardPrincipalCV(P), UPD]), "(err u1016)");
  ev("Y3 P still parked", `(get-token-y-parked '${P})`, "u2000000");
  tx("Y3 A cancels the ask", call(A, "cancel-token-x-deposit", [sbtcT, sbtcA]), "(ok u2000)");
  tx("Y3 readmit P -> ok", call(DEP, "readmit-token-y", [standardPrincipalCV(P), UPD]), "(ok u2000000)");
  ev("Y3 P live with 2 STX", `(get-token-y-deposit u0 '${P})`, "u2000000");
  ev("Y3 P unparked", `(get-token-y-parked '${P})`, "u0");
  ev("Y3 P order (some u0), cap any", `(get-token-y-order '${P})`, (v) => field(v, "spread-bps") === "(some u0)" && field(v, "limit") === `u${HUGE}`);
  tx("Y3 readmit P again -> u1022 (not parked)", call(DEP, "readmit-token-y", [standardPrincipalCV(P), UPD]), "(err u1022)");

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); i += 1; if (!/^(Y1 |Y3 )?fund |^Y1 filler/.test(st.label)) check(st.label, st.raw, st.want); else if (/ERR|\(err/.test(String(st.raw))) check(st.label, st.raw, st.want); }
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
