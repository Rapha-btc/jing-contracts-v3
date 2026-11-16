import { rungReceipt } from "./_rung-receipt.js";
// verify-v6-rungs-fill-lazer-stx-usdcx.mjs
// STX/USDCx port of verify-v6-rungs-fill-lazer.js: rungs on
// markets-stx-usdcx-jing-v6-4 with a real fill (keyless signed [45,7] Lazer via
// the faktory-dao route). One rung per ROLE priced just outside the mid, a
// taker walks each, the rung's sync folds the fill in, the member claims and
// the balance moves by the claimed amount; the other rung's order rolls with
// its own limit in the event. F5: a y rung SOLD OUT in the batch.
// Mapping (this set has only band rungs):
//   F1-F4: the original's FIXED rungs 1% off the mid (buy rung asks mid+1%,
//     sell rung bids mid-1%) become band rungs with spread 100 bps, which quote
//     exactly mid +/- 1% while the DIA guard (floor 0.8x / cap 1.2x) does not
//     bind: x = jing-sell-stx-usdc-100 (rests STX), y = jing-buy-stx-usdc-100
//     (rests USDCx). "Fixed at its price" order checks become (limit = band
//     guard, spread-bps (some u100)); the match / roll prices are rederived
//     from the mid of the exact signed update each swap used (the swaps take
//     a FRESH_UPDATE so it is newer than the fork clock).
//   F5: of the original three in-range y rungs (fixed 1% over, zero-spread peg,
//     zero-spread band) only the zero-spread band rung exists here
//     (jing-buy-stx-usdc-0); the fixed and peg rungs are N/A (no fixed / peg
//     rung on the STX/USDCx set): their 3 x 6 per-rung checks + 2 deploy/init
//     + 1 canonical drop, and the "three y makers cleared" count becomes one.
//     The canonical buy-band hash is already the template's (same code as
//     jing-buy-stx-usdc-100), so no second set-canonical.
// Amounts (6 dp both sides, mins 1 STX / 1 USDCx): x rung 100 STX, taker buys
// ~50 STX of it with USDCx (half, as the original 30 STX vs ~57 STX of sats);
// y rung 60 USDCx (the original 60 STX), taker sells STX worth 43 USDCx (~72%,
// as the original 15000 sats vs 60 STX); F5 rung 5 USDCx, deep bid 100 USDCx at
// -2%, seller sells STX worth 15 USDCx (rung 5 cleared whole + 10 walked, as the
// original 15 STX of rungs + 10). A's proceeds tolerance 1 USDCx (was 1 STX).
// Run: node simulations/verify-v6-rungs-fill-lazer-stx-usdcx.mjs
import { runCurrentPlan, FRESH_UPDATE } from "./_v6-submit-settle-stx-usdcx.mjs";
import { ClarityVersion, uintCV, stringAsciiCV, trueCV, falseCV, noneCV, standardPrincipalCV, getAddressFromPrivateKey, deserializeCV, cvToString, hexToCV } from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import { NODE, DEP, CORE, CORE_OWNER, N, C, USDCX, STX_WHALES, USDCX_WHALES, traits, assets, src, lazer, midOf, MIN, P_, balanceExpr, xOf, yOf } from "./_stx-usdcx-v6-common.mjs";

const MARKET = C.market, LADDER = C.ladder;
const A = STX_WHALES[0], S = USDCX_WHALES[1], B = getAddressFromPrivateKey("782".repeat(22).slice(0, 64) + "01", "mainnet");
const SCALE = 1_000_000_000_000n; // rung index scale
const SP = 100n; // the original fixed rungs sat 1% off the mid
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|\\(some u\\d+\\))\\)`)) || [])[1];
const logsOf = (step) => (step?.Result?.Transaction?.Ok?.events || []).map((e) => { try { const o = typeof e === "string" ? JSON.parse(e) : e; const raw = o.contract_event?.raw_value; return raw ? cvToString(hexToCV(raw)) : ""; } catch { return ""; } });

async function main() {
  console.log("=== v6 rungs STX/USDCx (band, 1% off mid), real fill ===");
  const MID = midOf(await lazer());
  const XR = `jing-sell-stx-usdc-${SP}`, YR = `jing-buy-stx-usdc-${SP}`;
  const rid = (n) => `${DEP}.${n}`;
  console.log(`mid ${MID} (USDCx per STX x 1e8); ${XR} asks mid+1%, ${YR} bids mid-1%`);
  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: fn === "withdraw" ? [...args, noneCV()] : args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const swap = (sender, amount, limit, depX) => call(sender, "swap", [uintCV(amount), uintCV(limit), FRESH_UPDATE, traits.x, assets.x, traits.y, assets.y, depX ? trueCV() : falseCV()]);

  deploy(N.ladder, src(N.ladder)); deploy(N.market, src(N.market));
  ev("live core owner is the multisig", `(contract-call? '${CORE} get-contract-owner)`, (v) => String(v).includes(CORE_OWNER));
  tx("market set-operator -> core owner", call(DEP, "set-operator", [P_(CORE_OWNER)]), "(ok true)");
  tx("core-v6 verifies the market (core owner)", call(CORE_OWNER, "set-verified-contract", [P_(MARKET)], CORE), (v) => String(v).startsWith("(ok"));
  tx("initialize (token-stx, usdcx, 1 STX, 1 USDCx, feeds 45 / 7)", call(CORE_OWNER, "initialize", [P_(MARKET), traits.x, traits.y, uintCV(MIN.x), uintCV(MIN.y), uintCV(45), uintCV(7)]), "(ok true)");
  tx("market set-operator -> DEP", call(CORE_OWNER, "set-operator", [P_(DEP)]), "(ok true)");
  deploy(XR, src(N.sellTpl)); deploy(YR, src(N.buyTpl));
  tx("canonical sel-band (x)", call(DEP, "set-canonical", [stringAsciiCV("sel-band"), P_(rid(XR))], LADDER), "(ok true)");
  tx("canonical buy-band (y)", call(DEP, "set-canonical", [stringAsciiCV("buy-band"), P_(rid(YR))], LADDER), "(ok true)");
  tx(`init ${XR}`, call(DEP, "initialize", [uintCV(SP), trueCV()], rid(XR)), "(ok true)");
  tx(`init ${YR}`, call(DEP, "initialize", [uintCV(SP), trueCV()], rid(YR)), "(ok true)");
  const fl = ev("band floor now (x rung, DIA x 0.8)", "(current-floor)", (v) => uintOf(v) > 0n, rid(XR));
  const cp = ev("band cap now (y rung, DIA x 1.2)", "(current-cap)", (v) => uintOf(v) > 0n, rid(YR));

  tx("fund fresh taker USDCx (60)", call(USDCX_WHALES[0], "transfer", [uintCV(60_000_000), standardPrincipalCV(USDCX_WHALES[0]), standardPrincipalCV(B), noneCV()], USDCX), "(ok true)");
  tx("fund fresh taker STX (400)", (bb) => bb.withSender(STX_WHALES[1]).addSTXTransfer({ recipient: B, amount: 400_000_000 }), "(ok true)");
  // F1 both rungs rest: band orders carry spread-bps (some u100) and the guard as limit
  const XDEP = 100_000_000, YDEP = 60_000_000;
  tx("F1 A deposits 100 STX into the x rung", call(A, "deposit", [uintCV(XDEP)], rid(XR)), rungReceipt("deposit"));
  tx("F1 S deposits 60 USDCx into the y rung (x side rests: escrowed)", call(S, "deposit", [uintCV(YDEP)], rid(YR)), rungReceipt("deposit"));
  tx("F1 settle y rung escrow with a newer signed print", call(B, "settle-token-y-deposit", [P_(rid(YR)), FRESH_UPDATE, traits.y, assets.y]), `(ok u${YDEP})`);
  ev("F1 y pending cleared", `(get-token-y-pending-deposit '${rid(YR)})`, "none");
  const ordX = ev("F1 x rung order: band (spread u100, limit = floor)", `(get-token-x-order '${rid(XR)})`, (v) => field(v, "spread-bps") === `(some u${SP})`);
  const ordY = ev("F1 y rung order: band (spread u100, limit = cap)", `(get-token-y-order '${rid(YR)})`, (v) => field(v, "spread-bps") === `(some u${SP})`);

  // F2 taker buys STX with USDCx: walks the x rung's ask at mid + 1%; the y rung's bid (under mid) rolls
  const a0 = ev("F2 A USDCx before", balanceExpr("y", A), () => true);
  const usIn = yOf(50_000_000n, MID); // ~50 STX worth of USDCx
  const fillX = tx(`F2 B pays ${usIn} uUSDCx (swap, 3% limit)`, swap(B, usIn, (MID * 103n) / 100n, false), (v) => String(v).startsWith("(ok"));
  tx("F2 x rung sync", call(B, "sync", [], rid(XR)), "(ok true)");
  ev("F2 x rung: unfilled-index dropped", "(get-state)", (v) => uintOf(field(v, "unfilled-index")) < SCALE, rid(XR));
  const posA = ev("F2 x rung: A has USDCx proceeds (key stx = token y)", `(get-position '${A})`, (v) => uintOf(field(v, "stx")) > 0n, rid(XR));
  tx("F2 A claims", call(A, "claim", [], rid(XR)), (v) => String(v).startsWith("(ok"));
  const a1 = ev("F2 A USDCx after", balanceExpr("y", A), () => true);
  tx("F2 y rung sync (rolled, not filled)", call(B, "sync", [], rid(YR)), "(ok true)");
  ev("F2 y rung: untouched", "(get-state)", (v) => field(v, "unfilled-index") === `u${SCALE}`, rid(YR));

  // F3 taker sells STX: walks the y rung's bid at mid - 1%
  const s0 = ev("F3 S STX before", balanceExpr("x", S), () => true);
  const stIn = xOf(43_000_000n, MID); // STX worth 43 USDCx (~72% of the 60 USDCx rung)
  const fillY = tx(`F3 B sells ${stIn} uSTX (swap, 3% limit)`, swap(B, stIn, (MID * 97n) / 100n, true), (v) => String(v).startsWith("(ok"));
  tx("F3 y rung sync", call(B, "sync", [], rid(YR)), "(ok true)");
  ev("F3 y rung: unfilled-index dropped", "(get-state)", (v) => uintOf(field(v, "unfilled-index")) < SCALE, rid(YR));
  const posS = ev("F3 y rung: S has STX proceeds (key sbtc = token x)", `(get-position '${S})`, (v) => uintOf(field(v, "sbtc")) > 0n, rid(YR));
  tx("F3 S claims", call(S, "claim", [], rid(YR)), (v) => String(v).startsWith("(ok"));
  const s1 = ev("F3 S STX after", balanceExpr("x", S), () => true);
  // F4 exits: what is left comes back
  tx("F4 A withdraws everything", call(A, "withdraw", [uintCV(999_999_999_999n)], rid(XR)), rungReceipt("withdraw"));
  tx("F4 S withdraws everything", call(S, "withdraw", [uintCV(999_999_999_999n)], rid(YR)), rungReceipt("withdraw"));
  ev("F4 x rung empty", "(get-state)", (v) => field(v, "total-shares") === "u0", rid(XR));
  ev("F4 y rung empty", "(get-state)", (v) => field(v, "total-shares") === "u0", rid(YR));

  // F5 the y side SOLD OUT: a walked y maker keeps rounding dust, so a rung is only sold out when
  // the BATCH clears it: an IN-RANGE zero-spread y band rung (5 USDCx) next to a deep direct bid; one
  // STX seller clears the rung whole at the mid and walks the deep bid for the rest. The rung's
  // market position is u0 with nothing refunded, its next sync closes the epoch, the member claims
  // from the closed epoch (paid in full, position gone), a withdraw is u7006.
  const YB0 = "jing-buy-stx-usdc-0";
  deploy(YB0, src(N.buyTpl));
  tx(`init ${YB0} (spread 0, seated; same canonical hash as ${YR})`, call(DEP, "initialize", [uintCV(0), trueCV()], rid(YB0)), "(ok true)");
  const U5 = 5_000_000;
  tx("F5 S deposits 5 USDCx into the zero-spread y band rung (x side empty: direct)", call(S, "deposit", [uintCV(U5)], rid(YB0)), rungReceipt("deposit"));
  ev(`F5 ${YB0} resting 5 USDCx`, "(get-state)", (v) => field(v, "resting") === `u${U5}` && field(v, "held-uusdcx") === "u0", rid(YB0));
  tx("F5 S rests a deep direct bid: 100 USDCx at -2%", call(S, "deposit-token-y", [uintCV(100_000_000), uintCV((MID * 98n) / 100n), noneCV(), traits.y, assets.y]), "(ok u100000000)");
  const STX_15U = xOf(15_000_000n, MID); // STX worth 15 USDCx: the rung (5) cleared whole at the mid, the rest walks the deep bid
  const fill5 = tx(`F5 B sells ${STX_15U} uSTX (~15 USDCx) at -3%: the batch clears the rung at the mid, the walk takes part of the deep bid`, swap(B, STX_15U, (MID * 97n) / 100n, true), (v) => String(v).startsWith("(ok"));
  ev(`F5 ${YB0} market position u0`, `(get-token-y-deposit (get-current-cycle) '${rid(YB0)})`, "u0");
  ev("F5 the deep bid was walked (under 100 USDCx, above 0)", `(get-token-y-deposit (get-current-cycle) '${S})`, (v) => uintOf(v) > 0n && uintOf(v) < 100_000_000n);
  tx(`F5 sync ${YB0}: sold out -> the epoch closes`, call(B, "sync", [], rid(YB0)), "(ok true)");
  ev(`F5 ${YB0} epoch 1, shares reset, nothing resting or held`, "(get-state)", (v) => field(v, "epoch") === "u1" && field(v, "total-shares") === "u0" && field(v, "resting") === "u0" && field(v, "held-uusdcx") === "u0", rid(YB0));
  ev(`F5 ${YB0} S's position: from the closed epoch, only STX owed`, `(get-position '${S})`, (v) => field(v, "stx") === "u0" && uintOf(field(v, "sbtc")) > 0n, rid(YB0));
  tx(`F5 S claims on ${YB0} (old epoch: paid in full, position gone)`, call(S, "claim", [], rid(YB0)), rungReceipt("claim"));
  ev(`F5 ${YB0} S's position gone`, `(get-position '${S})`, (v) => field(v, "shares") === "u0" && field(v, "sbtc") === "u0", rid(YB0));
  tx(`F5 S withdraws on ${YB0} -> u7006 (no position)`, call(S, "withdraw", [uintCV(1)], rid(YB0)), "(err u7006)");
  tx("F5 S cancels the rest of the deep bid", call(S, "cancel-token-y-deposit", [traits.y, assets.y]), (v) => String(v).startsWith("(ok u"));

  const { sid, result: res } = await runCurrentPlan(b, { clockCid: MARKET });
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; check(st.label, st.raw, st.want); }
  const floor = uintOf(fl.raw), cap = uintOf(cp.raw);
  check(`F1 x rung order limit = band floor (${floor})`, field(ordX.raw, "limit"), `u${floor}`);
  check(`F1 y rung order limit = band cap (${cap})`, field(ordY.raw, "limit"), `u${cap}`);
  const midX = res.updates[fillX.idx]?.mid, midY = res.updates[fillY.idx]?.mid;
  const askX = midX * (10000n + SP) / 10000n, bidY = midY * (10000n - SP) / 10000n;
  const mx = logsOf(s[fillX.idx]).filter((r) => r.includes('(event "match")')).map((r) => (r.match(/\(price u(\d+)\)/) || [])[1]);
  const my = logsOf(s[fillY.idx]).filter((r) => r.includes('(event "match")')).map((r) => (r.match(/\(price u(\d+)\)/) || [])[1]);
  check(`F2 one match, at the x rung's ask = swap mid ${midX} + 1% (${askX})`, mx.join(","), () => mx.length === 1 && mx[0] === String(askX));
  check(`F3 one match, at the y rung's bid = swap mid ${midY} - 1% (${bidY})`, my.join(","), () => my.length === 1 && my[0] === String(bidY));
  // the event's limit is token-y-limit-at(rung, clearing): for the original fixed rung that is its
  // own price; for a band rung it is its pegged bid at the clearing price (clearing - 1%, under the cap)
  const rollY = logsOf(s[fillX.idx]).filter((r) => r.includes('(event "limit-roll-y")') && r.includes(YR)).map((r) => [(r.match(/\(limit u(\d+)\)/) || [])[1], (r.match(/\(clearing u(\d+)\)/) || [])[1]]);
  check(`F2 the y rung's bid rolled once with its own limit (pegged bid at the clearing price = clearing - 1%, under the cap ${cap})`, JSON.stringify(rollY), () => rollY.length === 1 && BigInt(rollY[0][0]) === BigInt(rollY[0][1]) * (10000n - SP) / 10000n && BigInt(rollY[0][0]) < cap);
  const dA = uintOf(a1.raw) - uintOf(a0.raw), pA = uintOf(field(posA.raw, "stx"));
  check(`F2 A's USDCx grew by the position's proceeds (${pA}, within 1 USDCx)`, dA, (d) => d > 0n && d <= pA && d >= pA - 1_000_000n);
  const dS = uintOf(s1.raw) - uintOf(s0.raw), pS = uintOf(field(posS.raw, "sbtc"));
  check(`F3 S's STX grew by exactly the position's proceeds (${pS})`, dS, (d) => d === pS);
  const l5 = logsOf(s[fill5.idx]);
  check("F5 the walk matched one maker (the deep bid); the rung was cleared in the batch, not walked", l5.filter((r) => r.includes('(event "match")')).length, (n) => n === 1);
  check(`F5 one y maker cleared 5 USDCx whole in the batch (distribute-y-depositor, y-cleared u${U5})`, l5.filter((r) => r.includes('(event "distribute-y-depositor")') && r.includes(`(y-cleared u${U5})`)).length, (n) => n === 1);
  console.log(`\n${checks - failures}/${checks} checks green`);
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
