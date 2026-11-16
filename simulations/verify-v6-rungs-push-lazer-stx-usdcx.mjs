import { rungReceipt } from "./_rung-receipt.js";
// verify-v6-rungs-push-lazer-stx-usdcx.mjs
// STX/USDCx port of verify-v6-rungs-push-lazer.js: sponsor-friendly entry and
// keeper push, P1-P6 per rung, on markets-stx-usdcx-jing-v6-4.
// P1/P3/P5/P6: market refusal (paused) holds funds locally; keeper pushes after
// unpause, then settles with a newer signed [45,7] price; exact order and
// rung-push event. P2: a sub-minimum top-up is admitted against a live
// position; another top-up stays held while escrow is pending, then keeper
// push drains it after settle. P4: a stale signed update refuses settlement
// and preserves escrow.
// The original loops over four rungs: fixed buy (x), sell peg (y), fixed
// sell (y), buy peg (x). This set has only band rungs, so the loop runs once
// per ROLE on a band rung (spread 20 bps, the original peg spread):
//   x: jing-sell-stx-usdc-20 (rests STX, floor = DIA STX/USD * 0.8)
//   y: jing-buy-stx-usdc-20  (rests USDCx, cap = DIA STX/USD * 1.2)
// N/A: the fixed-price and market-spread (peg) iterations (no fixed / peg rung
// on the STX/USDCx set); their loop body is the same and is covered per role
// by the band iterations. The "exact stored quote" limit is the band guard read
// at the push (DIA, captured on the fork) instead of the name's price.
// Stale update: a signed [45,7] print saved once to
// fixtures/lazer-update-stale-stx-usdcx.hex (the [1,45] btc-stx fixture would
// be refused u1023 feed-missing here, not as stale).
// Fork at the tip on the LIVE jing-core-v6 (owner = multisig): verify +
// initialize sent by CORE_OWNER, operator handed over and back.
// Amounts: x 20000 sats -> 20 STX, top-up 500 sats -> 0.5 STX (half the 1 STX
// min); y 5 STX -> 5 USDCx, top-up 0.5 USDCx (half the 1 USDCx min).
// Run: node simulations/verify-v6-rungs-push-lazer-stx-usdcx.mjs
import fs from "node:fs";
import { runCurrentPlan, FRESH_UPDATE } from "./_v6-submit-settle-stx-usdcx.mjs";
import { ClarityVersion, uintCV, bufferCV, stringAsciiCV, noneCV, boolCV, trueCV, deserializeCV, cvToString, hexToCV } from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import { NODE, DEP, CORE, CORE_OWNER, N, C, STX_WHALES, USDCX_WHALES, traits, assets, src, lazer, midOf, MIN, P_ } from "./_stx-usdcx-v6-common.mjs";

const MARKET = C.market, LADDER = C.ladder;
const A = STX_WHALES[0];   // STX holder: x-rung member
const S = USDCX_WHALES[1]; // USDCx holder: y-rung member, the resting bid
const KEEPER = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3"; // anyone
const BPS = 20n, BP = 10_000n, GUARD = 2000n;
const STALE = bufferCV(Buffer.from(fs.readFileSync(new URL("./fixtures/lazer-update-stale-stx-usdcx.hex", import.meta.url), "utf8").trim(), "hex"));
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|true|false|\\(some u\\d+\\))\\)`)) || [])[1];
const uintOf = (v) => BigInt(String(v).replace(/^u/, ""));
const prints = (step) => (step?.Result?.Transaction?.Ok?.events || []).map((e) => { try { const o = typeof e === "string" ? JSON.parse(e) : e; const raw = o.contract_event?.raw_value; return raw ? cvToString(hexToCV(raw)) : ""; } catch { return ""; } });

async function main() {
  console.log("=== v6 rungs STX/USDCx: oracle-free deposit/push + keeper settle ===");
  const lz = await lazer();
  const MID = midOf(lz);
  const XR = "jing-sell-stx-usdc-20", YR = "jing-buy-stx-usdc-20";
  const rid = (n) => `${DEP}.${n}`;
  console.log(`mid ${MID}; ${XR} / ${YR}`);

  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const state = (label, cid, want) => ev(label, "(get-state)", want, cid);

  deploy(N.ladder, src(N.ladder)); deploy(N.market, src(N.market));
  ev("live core owner is the multisig", `(contract-call? '${CORE} get-contract-owner)`, (v) => String(v).includes(CORE_OWNER));
  tx("market set-operator -> core owner", call(DEP, "set-operator", [P_(CORE_OWNER)]), "(ok true)");
  tx("core-v6 verifies the market (core owner)", call(CORE_OWNER, "set-verified-contract", [P_(MARKET)], CORE), (v) => String(v).startsWith("(ok"));
  tx("initialize (token-stx, usdcx, 1 STX, 1 USDCx, feeds 45 / 7)", call(CORE_OWNER, "initialize", [P_(MARKET), traits.x, traits.y, uintCV(MIN.x), uintCV(MIN.y), uintCV(45), uintCV(7)]), "(ok true)");
  tx("market set-operator -> DEP", call(CORE_OWNER, "set-operator", [P_(DEP)]), "(ok true)");
  deploy(XR, src(N.sellTpl)); deploy(YR, src(N.buyTpl));
  tx("canonical sel-band (x)", call(DEP, "set-canonical", [stringAsciiCV("sel-band"), P_(rid(XR))], LADDER), "(ok true)");
  tx("canonical buy-band (y)", call(DEP, "set-canonical", [stringAsciiCV("buy-band"), P_(rid(YR))], LADDER), "(ok true)");
  tx(`init ${XR}`, call(DEP, "initialize", [uintCV(BPS), trueCV()], rid(XR)), "(ok true)");
  tx(`init ${YR}`, call(DEP, "initialize", [uintCV(BPS), trueCV()], rid(YR)), "(ok true)");
  const dia = ev("DIA STX/USD read by the x rung (miner-mid) > 0", "(miner-mid)", (v) => uintOf(v) > 0n, rid(XR));
  const guardOf = (side) => { const m = uintOf(dia.raw); return side === "x" ? m * (BP - GUARD) / BP : m * (BP + GUARD) / BP; };

  // Seed the opposite side: the first x push must escrow.
  tx("seed opposite bid (5 USDCx at -5%)", call(S, "deposit-token-y", [uintCV(5_000_000), uintCV(MID * 95n / 100n), noneCV(), traits.y, assets.y]), "(ok u5000000)");
  const pushes = [];
  for (const [n, side, amount, top] of [[XR, "x", 20_000_000, 500_000], [YR, "y", 5_000_000, 500_000]]) {
    const owner = side === "x" ? A : S;
    const held = side === "x" ? "held-ustx" : "held-uusdcx";
    const settle = (label, qty, upd = FRESH_UPDATE, want = `(ok u${qty})`) => tx(`${n}: ${label}`, call(KEEPER, `settle-token-${side}-deposit`, [P_(rid(n)), upd, traits[side], assets[side]]), want);
    tx(`${n}: pause market`, call(DEP, "set-paused", [boolCV(true)]), "(ok true)");
    tx(`${n}: member deposit without oracle is held on refusal`, call(owner, "deposit", [uintCV(amount)], rid(n)), rungReceipt("deposit"));
    state(`${n}: held exact`, rid(n), (v) => field(v, held) === `u${amount}` && field(v, "resting") === "u0");
    tx(`${n}: keeper push while paused leaves held`, call(KEEPER, "push", [], rid(n)), "(ok false)");
    tx(`${n}: unpause`, call(DEP, "set-paused", [boolCV(false)]), "(ok true)");
    const pushed = tx(`${n}: keeper push escrows without oracle`, call(KEEPER, "push", [], rid(n)), "(ok true)");
    pushes.push({ slot: pushed, amount, n });
    ev(`${n}: escrow exact`, `(get amount (unwrap-panic (get-token-${side}-pending-deposit '${rid(n)})))`, `u${amount}`);
    ev(`${n}: not live until settle`, `(get-token-${side}-deposit (get-current-cycle) '${rid(n)})`, "u0");
    state(`${n}: escrow stays in member claim`, rid(n), (v) => field(v, held) === "u0" && field(v, "resting") === `u${amount}`);
    tx(`${n}: nothing held to push`, call(KEEPER, "push", [], rid(n)), "(ok false)");
    settle("stale signed update refuses settlement", amount, STALE, (v) => v === "(err u1002)" || v === "(err u1003)");
    ev(`${n}: stale refusal preserves escrow`, `(get amount (unwrap-panic (get-token-${side}-pending-deposit '${rid(n)})))`, `u${amount}`);
    settle("newer signed update places escrow", amount);
    ev(`${n}: pending cleared`, `(get-token-${side}-pending-deposit '${rid(n)})`, "none");
    ev(`${n}: exact stored quote (limit = band ${side === "x" ? "floor" : "cap"}, spread (some u20))`, `(get-token-${side}-order '${rid(n)})`, (v) => field(v, "limit") === `u${guardOf(side)}` && field(v, "spread-bps") === "(some u20)");
    ev(`${n}: effective peg at mid`, `(token-${side}-limit-at '${rid(n)} u${MID})`, `u${MID * (side === "x" ? 10020n : 9980n) / 10000n}`);
    tx(`${n}: small top-up escrows against existing position`, call(owner, "deposit", [uintCV(top)], rid(n)), rungReceipt("deposit"));
    tx(`${n}: duplicate pending makes next top-up held`, call(owner, "deposit", [uintCV(top)], rid(n)), rungReceipt("deposit"));
    state(`${n}: top-up held exact`, rid(n), (v) => field(v, held) === `u${top}` && field(v, "resting") === `u${amount + top}`);
    tx(`${n}: keeper cannot push over pending`, call(KEEPER, "push", [], rid(n)), "(ok false)");
    settle("admit first top-up", top);
    tx(`${n}: keeper pushes held top-up after settle`, call(KEEPER, "push", [], rid(n)), "(ok true)");
    settle("admit second top-up", top);
    ev(`${n}: exact aggregate live`, `(get-token-${side}-deposit (get-current-cycle) '${rid(n)})`, `u${amount + top * 2}`);
    state(`${n}: held drained`, rid(n), (v) => field(v, held) === "u0" && field(v, "resting") === `u${amount + top * 2}`);
    tx(`${n}: empty push false`, call(KEEPER, "push", [], rid(n)), "(ok false)");
  }

  const { sid, result: res } = await runCurrentPlan(b, { clockCid: MARKET });
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const s = res.steps; let i = 0;
  // the band guard is read before the walk: resolve it first so the quote checks can use it
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; check(st.label, st.raw, st.want); }
  const pushLog = (st) => prints(s[st.idx]).filter((p) => p.includes('(event "rung-push")')).join("|");
  for (const { slot, amount, n } of pushes) check(`${n}: rung-push event names keeper and exact amount`, pushLog(slot), (v) => v.includes("(pushed true)") && v.includes(`(amount u${amount})`) && v.includes(KEEPER));
  console.log(`\nDIA ${dia.raw} vs lazer mid ${MID}`);
  console.log(`\n${checks - failures}/${checks} checks green`);
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
