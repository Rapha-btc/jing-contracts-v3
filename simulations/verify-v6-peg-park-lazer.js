// verify-v6-peg-park-lazer.js
// A pegged rung that is OUT of band is the first to be parked when the x
// queue is full and an in-range maker arrives (README: park-one treats an
// inactive peg as the maker furthest from mid). Then the rung side of
// parking: sync still counts the parked size, a member can withdraw from
// the parked balance, a deposit while the queue is full is held (readmit
// fails), and once a filler leaves the next deposit readmits and pushes.
// Run: PYTH_API_KEY=<key> npx tsx simulations/verify-v6-peg-park-lazer.js
import fs from "node:fs";
import { ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV, noneCV, deserializeCV, cvToString, getAddressFromPrivateKey } from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v5", MKT = "markets-sbtc-stx-jing-v6";
const CORE_ID = `${DEP}.${CORE}`, MARKET = `${DEP}.${MKT}`, LADDER = `${DEP}.jing-ladder`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"), wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const sbtcA = stringAsciiCV("sbtc-token");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2"; // sBTC holder: rung member and filler funder
const FILLERS = Array.from({ length: 49 }, (_, i) => getAddressFromPrivateKey((i + 100).toString(16).padStart(64, "0") + "01", "mainnet"));
const PARKER = getAddressFromPrivateKey("7".repeat(64) + "01", "mainnet");
const PP = 100_000_000n, SCALE = 1_000_000_000_000n, BPS = 20n, FILL = 2000, MAX_UINT = 340282366920938463463374607431768211455n;
const src = (f) => fs.readFileSync(`./contracts/${f}.clar`, "utf8");
const centsName = (c) => { const w = c / 100n, f = c % 100n; return `${w}-${f < 10n ? "0" : ""}${f}`; };
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|\\(some u\\d+\\))\\)`)) || [])[1];

async function main() {
  console.log("=== v6 park of an inactive peg + rung parked flows ===");
  const full = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(full.hex, "hex"));
  const MID = (full.px * PP) / full.py;
  const OUT_C = (10n ** 18n) / ((MID * 110n) / 100n); // floor over the ask: inactive
  const RUNG = `jing-buy-stx-spread-${BPS}-floor-${centsName(OUT_C)}`, RID = `${DEP}.${RUNG}`;
  const ASK_NEAR = (MID * 105n) / 100n;
  console.log(`mid ${MID}; ${RUNG} (out of band); 49 fillers at +5%, parker in range`);
  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" }); // our node: 50 fresh accounts would trip Hiro's per-minute limit
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));

  deploy(CORE, src(CORE)); deploy(MKT, src(MKT));
  tx("core-v5 verifies v6", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(ok true)");
  tx("v6 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)");
  deploy("jing-ladder", src("jing-ladder")); deploy(RUNG, src("jing-buy-stx-market-spread"));
  tx("canonical buy-peg", call(DEP, "set-canonical", [stringAsciiCV("buy-peg"), contractPrincipalCV(DEP, RUNG)], LADDER), "(ok true)");
  tx(`init ${RUNG}`, call(DEP, "initialize", [uintCV(BPS), uintCV(OUT_C)], RID), "(ok true)");
  tx("K1 A deposits 20000 sats: the peg rests, inactive at this mid", call(A, "deposit", [uintCV(20000), UPD], RID), "(ok true)");
  ev("K1 limit-at = MAX_UINT (inactive)", `(token-x-limit-at '${RID} u${MID})`, `u${MAX_UINT}`);
  FILLERS.forEach((f, i) => {
    tx(`K2 fund filler ${i + 1}`, call(A, "transfer", [uintCV(FILL), standardPrincipalCV(A), standardPrincipalCV(f), noneCV()], SBTC), "(ok true)");
    tx(`K2 filler ${i + 1} rests ${FILL} at +5%`, call(f, "deposit-token-x", [uintCV(FILL), uintCV(ASK_NEAR), noneCV(), UPD, sbtcT, sbtcA]), `(ok u${FILL})`);
  });
  ev("K2 x queue full (50)", "(len (get-token-x-depositors u0))", "u50");
  tx("K3 fund the parker", call(A, "transfer", [uintCV(FILL), standardPrincipalCV(A), standardPrincipalCV(PARKER), noneCV()], SBTC), "(ok true)");
  tx("K3 parker rests an IN-RANGE ask on the full queue: parks the furthest = the inactive peg", call(PARKER, "deposit-token-x", [uintCV(FILL), uintCV(1), noneCV(), UPD, sbtcT, sbtcA]), `(ok u${FILL})`);
  ev("K3 the rung is parked with its full 20000", `(get-token-x-parked '${RID})`, "u20000");
  ev("K3 the rung is off the live queue", `(get-token-x-deposit u0 '${RID})`, "u0");
  ev("K3 queue still 50", "(len (get-token-x-depositors u0))", "u50");
  // rung side
  tx("K4 sync while parked", call(A, "sync", [], RID), "(ok true)");
  ev("K4 market-size counts the parked balance: unfilled-index unchanged", "(get-state)", (v) => field(v, "unfilled-index") === `u${SCALE}` && field(v, "resting") === "u20000", RID);
  tx("K5 A withdraws 500 from the parked balance", call(A, "withdraw", [uintCV(500)], RID), "(ok true)");
  ev("K5 parked now 19500", `(get-token-x-parked '${RID})`, "u19500");
  tx("K6 A deposits 1000 while the queue is full: readmit fails, held locally", call(A, "deposit", [uintCV(1000), UPD], RID), "(ok true)");
  ev("K6 held 1000, still parked 19500", "(get-state)", (v) => field(v, "held-sats") === "u1000", RID);
  tx("K7 a filler cancels: room in the queue", call(FILLERS[0], "cancel-token-x-deposit", [sbtcT, sbtcA]), `(ok u${FILL})`);
  tx("K7 A deposits 1000 more: readmit succeeds, everything pushed", call(A, "deposit", [uintCV(1000), UPD], RID), "(ok true)");
  ev("K7 parked 0", `(get-token-x-parked '${RID})`, "u0");
  ev("K7 live again with 21500", `(get-token-x-deposit u0 '${RID})`, "u21500");
  ev("K7 held 0", "(get-state)", (v) => field(v, "held-sats") === "u0", RID);

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); i += 1; if (!st.label.startsWith("K2 fund") && !st.label.startsWith("K2 filler")) check(st.label, st.raw, st.want); else if (String(st.raw) !== st.want) check(st.label, st.raw, st.want); }
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
