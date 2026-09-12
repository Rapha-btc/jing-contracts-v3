// verify-v6-rungs-push-lazer.js
// Sponsor-friendly rung deposits on markets-sbtc-stx-jing-v6: a member
// deposits with an EMPTY update (0x00, no oracle read, signable offline and
// sponsored); when the market needs a price the rung holds the funds, and any
// keeper pushes them later with a fresh Lazer update (PYTH_API_KEY).
//   P1 fixed buy rung: the other side rests, so the member's 0x00 deposit is
//      held; push(0x00) by a keeper is refused (ok false); push(update) by a
//      stranger pushes (ok true), the ladder logs rung-push; push again with
//      nothing held is (ok false)
//   P2 a member top-up under the market minimum with 0x00 is held, the keeper
//      pushes it onto the live position
//   P3 sell peg rung mirror on the STX side
//   P4 the real flow: the member pre-signed with a STALE but genuinely signed
//      update (fixtures/lazer-update-stale-btc-stx.hex); broadcast later it
//      still lands the sats in the rung (held), and the keeper's push with a
//      fresh update puts them on the market
// Run: PYTH_API_KEY=<key> npx tsx simulations/verify-v6-rungs-push-lazer.js
import fs from "node:fs";
import { ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, noneCV, deserializeCV, cvToString, hexToCV } from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v5", MKT = "markets-sbtc-stx-jing-v6";
const CORE_ID = `${DEP}.${CORE}`, MARKET = `${DEP}.${MKT}`, LADDER = `${DEP}.jing-ladder`;
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"), wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const wstxA = stringAsciiCV("wstx");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2"; // sBTC holder: buy-rung member
const S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";  // STX holder: sell-rung member, the resting bid
const KEEPER = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3"; // anyone
const PP = 100_000_000n, BPS = 20n, NO_UPDATE = bufferCV(Buffer.from("00", "hex"));
const STALE = bufferCV(Buffer.from(fs.readFileSync(new URL("./fixtures/lazer-update-stale-btc-stx.hex", import.meta.url), "utf8").trim(), "hex"));
const src = (f) => fs.readFileSync(`./contracts/${f}.clar`, "utf8");
const centsName = (c) => { const w = c / 100n, f = c % 100n; return `${w}-${f < 10n ? "0" : ""}${f}`; };
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|true|false|\\(some u\\d+\\))\\)`)) || [])[1];
const prints = (step) => (step?.Result?.Transaction?.Ok?.events || []).map((e) => { try { const o = typeof e === "string" ? JSON.parse(e) : e; const raw = o.contract_event?.raw_value; return raw ? cvToString(hexToCV(raw)) : ""; } catch { return ""; } });

async function main() {
  console.log("=== v6 rungs: sponsor-friendly deposit (0x00) + keeper push(update) ===");
  const lz = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const MID = (lz.px * PP) / lz.py;
  const BUY_C = (10n ** 18n) / ((MID * 110n) / 100n); // fixed buy rung 10% over mid: rests, never crosses
  const SELL_C = (10n ** 18n) / ((MID * 110n) / 100n); // sell peg rung cap over the bid: in band
  const BUY = `jing-buy-stx-${centsName(BUY_C)}`, SELL = `jing-sell-stx-spread-${BPS}-cap-${centsName(SELL_C)}`;
  const rid = (n) => `${DEP}.${n}`;
  console.log(`mid ${MID}; ${BUY} / ${SELL}`);

  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const state = (label, cid, want) => ev(label, "(get-state)", want, cid);

  deploy(CORE, src(CORE)); deploy(MKT, src(MKT));
  tx("core-v5 verifies v6", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(ok true)");
  tx("v6 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)");
  deploy("jing-ladder", src("jing-ladder")); deploy(BUY, src("jing-buy-stx")); deploy(SELL, src("jing-sell-stx-market-spread"));
  tx("canonical buy-stx", call(DEP, "set-canonical", [stringAsciiCV("buy-stx"), contractPrincipalCV(DEP, BUY)], LADDER), "(ok true)");
  tx("canonical sell-peg", call(DEP, "set-canonical", [stringAsciiCV("sell-peg"), contractPrincipalCV(DEP, SELL)], LADDER), "(ok true)");
  tx(`init ${BUY}`, call(DEP, "initialize", [uintCV(BUY_C)], rid(BUY)), "(ok true)");
  tx(`init ${SELL}`, call(DEP, "initialize", [uintCV(BPS), uintCV(SELL_C)], rid(SELL)), "(ok true)");

  // =============== P1: held on 0x00, pushed by a keeper ===============
  tx("P1 S rests a bid at -5% (the y side is not empty: x deposits need a price)", call(S, "deposit-token-y", [uintCV(5_000_000), uintCV((MID * 95n) / 100n), noneCV(), UPD, wstxT, wstxA]), "(ok u5000000)");
  tx("P1 A deposits 20000 sats with an EMPTY update: the market refuses the read, the rung holds", call(A, "deposit", [uintCV(20000), NO_UPDATE], rid(BUY)), "(ok true)");
  state("P1 held 20000, resting 0", rid(BUY), (v) => field(v, "held-sats") === "u20000" && field(v, "resting") === "u0");
  ev("P1 A's position counts the held sats", `(get-position '${A})`, (v) => field(v, "sbtc") === "u20000", rid(BUY));
  tx("P1 keeper push(0x00): refused, nothing moves -> (ok false)", call(KEEPER, "push", [NO_UPDATE], rid(BUY)), "(ok false)");
  state("P1 still held 20000", rid(BUY), (v) => field(v, "held-sats") === "u20000");
  const p1 = tx("P1 stranger push(update): pushed -> (ok true)", call(KEEPER, "push", [UPD], rid(BUY)), "(ok true)");
  state("P1 held 0, resting 20000", rid(BUY), (v) => field(v, "held-sats") === "u0" && field(v, "resting") === "u20000");
  ev("P1 the rung's order on the market: fixed at its price", `(get-token-x-order '${rid(BUY)})`, (v) => field(v, "spread-bps") === "none");
  tx("P1 push again with nothing held -> (ok false)", call(KEEPER, "push", [UPD], rid(BUY)), "(ok false)");

  // =============== P2: a top-up under the minimum, held then pushed ===============
  tx("P2 A deposits 500 sats with 0x00: held", call(A, "deposit", [uintCV(500), NO_UPDATE], rid(BUY)), "(ok true)");
  state("P2 held 500, resting 20000", rid(BUY), (v) => field(v, "held-sats") === "u500" && field(v, "resting") === "u20000");
  tx("P2 keeper push(update): 500 + 20000 over the minimum -> pushed", call(KEEPER, "push", [UPD], rid(BUY)), "(ok true)");
  state("P2 held 0, resting 20500", rid(BUY), (v) => field(v, "held-sats") === "u0" && field(v, "resting") === "u20500");

  // =============== P3: the sell peg rung, STX side ===============
  tx("P3 S deposits 5 STX into the sell peg rung with 0x00 (asks rest: price needed): held", call(S, "deposit", [uintCV(5_000_000), NO_UPDATE], rid(SELL)), "(ok true)");
  state("P3 held 5 STX, resting 0", rid(SELL), (v) => field(v, "held-ustx") === "u5000000" && field(v, "resting") === "u0");
  const p3 = tx("P3 keeper push(update) -> pushed", call(KEEPER, "push", [UPD], rid(SELL)), "(ok true)");
  state("P3 held 0, resting 5 STX", rid(SELL), (v) => field(v, "held-ustx") === "u0" && field(v, "resting") === "u5000000");
  ev("P3 the rung rests a pegged bid (some u20) at mid - 20 bps", `(token-y-limit-at '${rid(SELL)} u${MID})`, `u${(MID * (10000n - BPS)) / 10000n}`);

  // =============== P4: a pre-signed deposit with a STALE signed update ===============
  tx("P4 A deposits 3000 sats with a STALE (signed, old) update: the market refuses the read, the rung holds", call(A, "deposit", [uintCV(3000), STALE], rid(BUY)), "(ok true)");
  state("P4 held 3000, resting 20500", rid(BUY), (v) => field(v, "held-sats") === "u3000" && field(v, "resting") === "u20500");
  ev("P4 A's position counts the held sats (23500)", `(get-position '${A})`, (v) => field(v, "sbtc") === "u23500", rid(BUY));
  tx("P4 keeper push(STALE) -> (ok false), still held", call(KEEPER, "push", [STALE], rid(BUY)), "(ok false)");
  tx("P4 keeper push(fresh update) -> pushed", call(KEEPER, "push", [UPD], rid(BUY)), "(ok true)");
  state("P4 held 0, resting 23500", rid(BUY), (v) => field(v, "held-sats") === "u0" && field(v, "resting") === "u23500");
  ev("P4 on the market: 23500", `(get-token-x-deposit (get-current-cycle) '${rid(BUY)})`, "u23500");

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; check(st.label, st.raw, st.want); }
  const pushLog = (st) => prints(s[st.idx]).filter((p) => p.includes('(event "rung-push")')).join("|");
  check("P1 ladder logged rung-push (pushed true, amount 20000, keeper)", pushLog(p1), (v) => v.includes("(pushed true)") && v.includes("(amount u20000)") && v.includes(KEEPER));
  check("P3 ladder logged rung-push for the sell rung", pushLog(p3), (v) => v.includes("(pushed true)") && v.includes("(amount u5000000)"));
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
