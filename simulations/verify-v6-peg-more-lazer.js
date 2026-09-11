// verify-v6-peg-more-lazer.js
// The rest of the pegged surface on markets-sbtc-stx-jing-v6 (PYTH_API_KEY):
//   C  get-taker-capacity against a pegged book: an in-band peg counts for a
//      taker whose limit reaches it, not below it; an out-of-band peg never
//   M  two members in one peg rung through a real fill: pro-rata proceeds,
//      1-sat withdraws burn at least their value (fix 7 on the real market),
//      full exits leave the rung empty and solvent
//   R  reprice-or-swap-token-x with a spread: fixed -> peg (no y side, plain
//      reprice), then to a zero-spread peg against a resting bid: crosses
//      and swaps
// Run: PYTH_API_KEY=<key> npx tsx simulations/verify-v6-peg-more-lazer.js
import fs from "node:fs";
import { ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, trueCV, falseCV, noneCV, someCV, deserializeCV, cvToString } from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v5", MKT = "markets-sbtc-stx-jing-v6";
const CORE_ID = `${DEP}.${CORE}`, MARKET = `${DEP}.${MKT}`, LADDER = `${DEP}.jing-ladder`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"), wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2", B = "SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q", S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";
const PP = 100_000_000n, SCALE = 1_000_000_000_000n, BPS = 20n;
const src = (f) => fs.readFileSync(`./contracts/${f}.clar`, "utf8");
const centsName = (c) => { const w = c / 100n, f = c % 100n; return `${w}-${f < 10n ? "0" : ""}${f}`; };
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|\\(some u\\d+\\))\\)`)) || [])[1];

async function main() {
  console.log("=== v6 pegged: capacity, two-member rung, reprice-or-swap ===");
  const full = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(full.hex, "hex"));
  const MID = (full.px * PP) / full.py, ASK = (MID * (10000n + BPS)) / 10000n;
  const IN_C = (10n ** 18n) / ((MID * 90n) / 100n), OUT_C = (10n ** 18n) / ((MID * 110n) / 100n);
  const RIN = `jing-buy-stx-spread-${BPS}-floor-${centsName(IN_C)}`, ROUT = `jing-buy-stx-spread-${BPS}-floor-${centsName(OUT_C)}`;
  const rid = (n) => `${DEP}.${n}`;
  console.log(`mid ${MID}; in-band ${RIN}; out-of-band ${ROUT}`);
  const steps = []; let b = SimulationBuilder.new();
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const swap = (sender, amount, limit, depX) => call(sender, "swap", [uintCV(amount), uintCV(limit), UPD, sbtcT, sbtcA, wstxT, wstxA, depX ? trueCV() : falseCV()]);
  const cap = (limit) => `(get-taker-capacity u${MID} u${limit} false)`;

  deploy(CORE, src(CORE)); deploy(MKT, src(MKT));
  tx("core-v5 verifies v6", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(ok true)");
  tx("v6 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)");
  deploy("jing-ladder", src("jing-ladder")); deploy(RIN, src("jing-buy-stx-market-spread")); deploy(ROUT, src("jing-buy-stx-market-spread"));
  tx("canonical buy-peg", call(DEP, "set-canonical", [stringAsciiCV("buy-peg"), contractPrincipalCV(DEP, RIN)], LADDER), "(ok true)");
  tx(`init ${RIN}`, call(DEP, "initialize", [uintCV(BPS), uintCV(IN_C)], rid(RIN)), "(ok true)");
  tx(`init ${ROUT}`, call(DEP, "initialize", [uintCV(BPS), uintCV(OUT_C)], rid(ROUT)), "(ok true)");

  // ---- C: capacity against a pegged book ----
  tx("C A deposits 20000 into the in-band rung", call(A, "deposit", [uintCV(20000), UPD], rid(RIN)), "(ok true)");
  tx("C B deposits 10000 into the in-band rung", call(B, "deposit", [uintCV(10000), UPD], rid(RIN)), "(ok true)");
  const c1 = ev("C capacity for an STX seller with a 3% limit: the pegged ask counts (walk-cap > 0)", cap((MID * 103n) / 100n), (v) => uintOf(field(v, "walk-cap")) > 0n && field(v, "mid-cap") === "u0");
  ev("C capacity with a limit under the pegged ask (mid + 10 bps): nothing", cap((MID * 10010n) / 10000n), (v) => field(v, "net-cap") === "u0");
  tx("C A deposits 20000 into the out-of-band rung", call(A, "deposit", [uintCV(20000), UPD], rid(ROUT)), "(ok true)");
  const c2 = ev("C capacity with a 50% limit: still only the in-band peg", cap((MID * 150n) / 100n), () => true);

  // ---- M: two members through a real fill ----
  tx("M S sells 30 STX (swap, 3% limit): fills part of the in-band rung", swap(S, 30_000_000, (MID * 103n) / 100n, false), (v) => String(v).startsWith("(ok"));
  tx("M sync", call(S, "sync", [], rid(RIN)), "(ok true)");
  const st = ev("M rung state after the fill", "(get-state)", (v) => uintOf(field(v, "unfilled-index")) < SCALE, rid(RIN));
  const pa = ev("M A position", `(get-position '${A})`, (v) => uintOf(field(v, "stx")) > 0n, rid(RIN));
  const pb = ev("M B position", `(get-position '${B})`, (v) => uintOf(field(v, "stx")) > 0n, rid(RIN));
  const b0 = ev("M B sats before the 1-sat withdraws", `(contract-call? '${SBTC} get-balance '${B})`, () => true);
  for (let i = 1; i <= 5; i++) tx(`M B withdraws 1 sat (${i}/5)`, call(B, "withdraw", [uintCV(1)], rid(RIN)), "(ok true)");
  const b1 = ev("M B sats after", `(contract-call? '${SBTC} get-balance '${B})`, () => true);
  const pb2 = ev("M B position after the 1-sat withdraws", `(get-position '${B})`, () => true, rid(RIN));
  tx("M B exits", call(B, "withdraw", [uintCV(999_999_999)], rid(RIN)), "(ok true)");
  tx("M A exits", call(A, "withdraw", [uintCV(999_999_999)], rid(RIN)), "(ok true)");
  // the 1-sat withdraws left their rounding dust in the pool (fix 7: the burn
  // rounds up, the difference stays); with no shares left it is held until
  // the next deposit sweeps it into the new epoch as a gift
  const stEnd = ev("M rung empty (total-shares u0), only rounding dust held", "(get-state)", (v) => field(v, "total-shares") === "u0" && uintOf(field(v, "held-sats")) < 10n, rid(RIN));
  const balEnd = ev("M rung sats == held dust", `(contract-call? '${SBTC} get-balance '${rid(RIN)})`, () => true);
  ev("M rung STX left is dust only", `(stx-get-balance '${rid(RIN)})`, (v) => uintOf(v) < 1000n);
  ev("M rung off the market", `(get-token-x-deposit (get-current-cycle) '${rid(RIN)})`, "u0");
  tx("M A exits the out-of-band rung too", call(A, "withdraw", [uintCV(999_999_999)], rid(ROUT)), "(ok true)");

  // ---- R: reprice-or-swap with a spread ----
  tx("R A rests a fixed ask 5000 at +5%", call(A, "deposit-token-x", [uintCV(5000), uintCV((MID * 105n) / 100n), noneCV(), UPD, sbtcT, sbtcA]), "(ok u5000)");
  tx("R reprice to a 30 bps peg, floor under mid: plain reprice (no y side)", call(A, "reprice-or-swap-token-x", [uintCV((MID * 95n) / 100n), someCV(uintCV(30)), UPD, sbtcT, sbtcA, wstxT, wstxA]), (v) => v.includes("(token-x-received u0)") && v.includes("(token-y-received u0)"));
  ev("R order is now the peg", `(get-token-x-order '${A})`, (v) => field(v, "spread-bps") === "(some u30)");
  ev("R limit-at = mid + 30 bps", `(token-x-limit-at '${A} u${MID})`, `u${(MID * 10030n) / 10000n}`);
  tx("R spread 10000 -> u1026", call(A, "reprice-or-swap-token-x", [uintCV((MID * 95n) / 100n), someCV(uintCV(10000)), UPD, sbtcT, sbtcA, wstxT, wstxA]), "(err u1026)");
  tx("R S rests a bid at any cap (peg above mid: not in range, rests)", call(S, "deposit-token-y", [uintCV(20_000_000), uintCV(999_999_999_999_999n), noneCV(), UPD, wstxT, wstxA]), "(ok u20000000)");
  const rs = tx("R reprice to a ZERO-spread peg: would take the bid -> crosses and swaps", call(A, "reprice-or-swap-token-x", [uintCV((MID * 95n) / 100n), someCV(uintCV(0)), UPD, sbtcT, sbtcA, wstxT, wstxA]), (v) => String(v).startsWith("(ok") && uintOf((String(v).match(/\(token-y-received (u\d+)\)/) || [])[1]) > 0n);
  ev("R A's ask consumed", `(get-token-x-deposit (get-current-cycle) '${A})`, "u0");
  tx("R S cancels what is left of the bid", call(S, "cancel-token-y-deposit", [wstxT, wstxA]), (v) => String(v).startsWith("(ok"));

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const x of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; x.raw = x.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); i += 1; check(x.label, x.raw, x.want); }
  check("C the out-of-band rung added no capacity", uintOf(field(c2.raw, "walk-cap")), (v) => v === uintOf(field(c1.raw, "walk-cap")));
  const fi = uintOf(field(st.raw, "unfilled-index"));
  const sa = uintOf(field(pa.raw, "sbtc")), sb = uintOf(field(pb.raw, "sbtc")), xa = uintOf(field(pa.raw, "stx")), xb = uintOf(field(pb.raw, "stx"));
  check(`M pro-rata: A's unsold ${sa} ~ 2x B's ${sb}`, sa, (v) => v >= 2n * sb - 2n && v <= 2n * sb + 2n);
  check(`M pro-rata: A's STX ${xa} ~ 2x B's ${xb}`, xa, (v) => v >= 2n * xb - 2n && v <= 2n * xb + 2n);
  const got = uintOf(b1.raw) - uintOf(b0.raw), left = uintOf(field(pb2.raw, "sbtc"));
  check(`M B received 5 sats for the 5 withdraws`, got, (v) => v === 5n);
  check(`M B's entitlement dropped by at least 5 (${sb} -> ${left}): the burn covers the payout (fix 7)`, sb - left, (d) => d >= 5n);
  check("M the rung's sBTC balance is exactly the held dust", uintOf(balEnd.raw), (v) => v === uintOf(field(stEnd.raw, "held-sats")));
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
