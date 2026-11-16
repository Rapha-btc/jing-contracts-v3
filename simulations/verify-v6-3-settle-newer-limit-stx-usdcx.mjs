// Fork only. Run: node simulations/verify-v6-3-settle-newer-limit-stx-usdcx.mjs
// STX/USDCx port of verify-v6-3-settle-newer-limit.js, `patched` mode only
// (prefix = historical sBTC/STX bytes 9a69481^, no STX/USDCx equivalent).
//
// Fork at the tip. Market = contracts/stx-usdcx/markets-stx-usdcx-jing-v6-4.clar
// (stripped deploy bytes) x2 (mv8wal-newer-my / -mx) on the LIVE jing-core-v6
// (owner CORE_OWNER: verifies + initializes; the original's V65_PIN=9296400
// had SPV9 as owner) + a fresh jing-ladder-stx-usdcx-v1 (the market binds it;
// it is not on chain). x = native STX, y = USDCx, 6 dp each, mins 1 / 1.
//
// settle-token-{x,y}-deposit must price the crossing check with the stored
// limit when its set-at is after the pending submitted-at (fix 9a69481).
// Real [45,7] Lazer: two signed updates with different prices, Plo < Phi; a
// limit L2 between them crosses at one and not the other.
//   (a) attack   top-up at non-crossing L1 (T1), set-limit L2 (T2) settled at
//                the quiet mid; top-up settled at the loud mid -> refunded "crossing".
//   (b) reverse  top-up at crossing L1 (T1), far L2 (T2) -> rests at L2.
//   (c) control  c / c2 / c3 / c4 as in the original.
//   (d) x-side   every case mirrored on MX.
import {
  ClarityVersion, uintCV, bufferCV, noneCV, deserializeCV, cvToString,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, getSimulationTip, submitSimulationSteps, callContract,
} from 'stxer';
import { installChunkedSubmit } from './_chunked-submit.js';
import { installRetrySubmit } from './_retry-submit.js';
import {
  NODE, DEP, CORE, CORE_OWNER, WSTX, USDCX, STX_WHALES, USDCX_WHALES, N, P_ as P, traits as T, assets as A,
  mk, balanceExpr, src, lazer, lazerTimes, midOf, MIN,
} from './_stx-usdcx-v6-common.mjs';

installChunkedSubmit(60);
installRetrySubmit();
const WHALE = { x: STX_WHALES[0], y: USDCX_WHALES[0] };
const MKT = { y: `${DEP}.mv8wal-newer-my`, x: `${DEP}.mv8wal-newer-mx` };
const U = { y: Number(MIN.y), x: Number(MIN.x) }; // 1 unit = min deposit
const BASE = { y: 2 * U.y, x: 2 * U.x };
const TOP = { y: U.y, x: U.x };
const LIQ = { y: 5 * U.y, x: 5 * U.x };
const other = (s) => (s === 'x' ? 'y' : 'x');

const SOURCES = { patched: () => src(N.market) };

const cv = (hex) => cvToString(deserializeCV(hex));
const decode = (step) => {
  const r = step?.Result ?? step;
  if (r?.Eval) return 'Ok' in r.Eval ? cv(r.Eval.Ok) : `EVAL-ERR ${JSON.stringify(r.Eval.Err).slice(0, 200)}`;
  if (r?.Transaction?.Ok) { const t = r.Transaction.Ok; if (t.vm_error || t.post_condition_aborted) return `ENGINE-ERR ${JSON.stringify(t).slice(0, 300)}`; return cv(t.result); }
  return `ENGINE-ERR ${JSON.stringify(r).slice(0, 300)}`;
};
const ok = (v) => v.startsWith('(ok');
let passed = 0, checks = 0, failures = 0, sid;
const failed = [];
function check(label, actual, want) {
  checks++;
  const good = typeof want === 'function' ? want(actual) : actual === want;
  if (good) passed++; else { failures++; failed.push(label); }
  console.log(`${good ? 'ok  ' : 'FAIL'} ${checks}. ${label}: ${String(actual).slice(0, 300)}${good ? '' : `; expected ${typeof want === 'function' ? want.toString() : want}`}`);
  return good;
}
async function evalStep(cid, code) {
  for (let i = 0; ; i++) {
    try { return await submitSimulationSteps(sid, { steps: [{ Eval: [DEP, '', cid, code] }] }); }
    catch (e) { if (i >= 4 || !/HTTP 5\d\d/.test(String(e))) throw e; console.log(`  stxer ${String(e).match(/HTTP 5\d\d/)[0]} on a read, retry in 30s`); await new Promise((r) => setTimeout(r, 30_000)); }
  }
}
async function ev(label, cid, code, want) {
  const out = await evalStep(cid, code);
  const v = decode(out.steps[0]);
  if (want !== undefined) check(label, v, want);
  return v;
}
async function tx(label, sender, cid, fn, args, want) {
  const r = await callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 });
  const v = r.vmError || r.pcAborted ? `ENGINE-ERR ${JSON.stringify(r).slice(0, 300)}` : r.result;
  check(label, v, want);
  return r;
}
function prints(r) {
  const evs = (r.receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e);
  return evs.filter((e) => e.contract_event?.contract_identifier === CORE).map((e) => cv(e.contract_event.raw_value)).join(' ');
}
const bal = (side, p) => balanceExpr(side, p);
const cyc = '(var-get current-cycle)';
const dep = (side, p) => `(get-token-${side}-deposit ${cyc} '${p})`;
const total = (side) => `(get total-token-${side} (get-cycle-totals ${cyc}))`;
const order = (side, p) => `(get-token-${side}-order '${p})`;
const depArgs = (side, amount, limit) => [uintCV(amount), uintCV(limit), noneCV(), T[side], A[side]];
const limArgs = (limit) => [uintCV(limit), noneCV()];
const settleArgs = (side, who, upd) => [P(who), upd, T[side], A[side]];
const refunded = (side) => (x) => x.includes(`pending-refund-${side}`) && x.includes('"crossing"');
const deposited = (side) => (x) => x.includes(`deposit-${side}`) && !x.includes(`pending-refund-${side}`);
const crossesAt = (side, price, limit) => `(would-take-as-${side === 'y' ? 'y' : 'x'} u${price} u${limit})`;

async function run(mode) {
  passed = checks = failures = 0; failed.length = 0;
  console.log(`\n===== mode ${mode} =====`);
  const market = SOURCES[mode]();
  console.log(`market source ${market.length} bytes`);
  const u0 = await lazer();
  const mid = midOf(u0);
  const pct = (n) => (mid * BigInt(n)) / 100n;
  const LIM = {
    base: { y: pct(50), x: pct(200) },
    nonX: { y: pct(40), x: pct(250) },
    cross: { y: pct(120), x: pct(80) },
    far: { y: pct(33), x: pct(300) },
    liq: { y: pct(110), x: pct(90) },
  };
  const keeper = mk(8800);
  const who = {};
  for (const [i, side] of ['y', 'x'].entries()) {
    who[side] = { a: mk(8801 + i * 10), b: mk(8802 + i * 10), c: mk(8803 + i * 10), c2: mk(8804 + i * 10), c3: mk(8805 + i * 10), c4: mk(8806 + i * 10), liq: mk(8807 + i * 10) };
  }
  const makers = ['a', 'b', 'c', 'c2', 'c3', 'c4'];

  // ---------- phase 1: deploy, init, fund, base orders (no Lazer needed) ----------
  let b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  const plan = [];
  const add = (label, build, want) => { b = build(b); plan.push({ label, want }); };
  const call = (sender, cid, fn, args) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const read = (label, cid, code, want) => add(label, (bb) => bb.addEvalCode(cid, code), want);
  const fundB = (side, p, amt) => side === 'x'
    ? add(`fund ${p.slice(0, 8)} ${amt} uSTX`, (bb) => bb.withSender(WHALE.x).addSTXTransfer({ recipient: p, amount: amt }), ok)
    : add(`fund ${p.slice(0, 8)} ${amt} uUSDCx`, call(WHALE.y, USDCX, 'transfer', [uintCV(amt), P(WHALE.y), P(p), noneCV()]), '(ok true)');
  read('live core owner is CORE_OWNER', CORE, '(get-contract-owner)', CORE_OWNER);
  add(`deploy ${N.ladder}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: N.ladder, source_code: src(N.ladder), clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes('ERR'));
  for (const side of ['y', 'x']) {
    const m = MKT[side], nm = m.split('.')[1];
    add(`deploy ${nm} (${mode})`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: nm, source_code: market, clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes('ERR'));
    add(`${nm}: set-operator -> core owner`, call(DEP, m, 'set-operator', [P(CORE_OWNER)]), '(ok true)');
    add(`verify ${nm} on live core (core owner)`, call(CORE_OWNER, CORE, 'set-verified-contract', [P(m)]), '(ok true)');
    add(`initialize ${nm} (core owner)`, call(CORE_OWNER, m, 'initialize', [P(m), P(WSTX), P(USDCX), uintCV(MIN.x), uintCV(MIN.y), uintCV(45), uintCV(7)]), '(ok true)');
    add(`${nm}: set-operator -> DEP`, call(CORE_OWNER, m, 'set-operator', [P(DEP)]), '(ok true)');
    read(`${nm} registered in core`, CORE, `(is-registered '${m})`, 'true');
    for (const k of makers) {
      const p = who[side][k];
      fundB(side, p, BASE[side] + TOP[side]);
      add(`${side}/${k}: base order direct (opposite empty)`, call(p, m, `deposit-token-${side}`, depArgs(side, BASE[side], LIM.base[side])), `(ok u${BASE[side]})`);
      read(`${side}/${k}: base on the book`, m, dep(side, p), `u${BASE[side]}`);
    }
    const o = other(side), q = who[side].liq;
    fundB(o, q, LIQ[o]);
    add(`${side}-market: liquidity ${o} order submits (pending, ${side} book live)`, call(q, m, `deposit-token-${o}`, depArgs(o, LIQ[o], LIM.liq[o])), `(ok u${LIQ[o]})`);
    read(`${side}-market: liquidity pending`, m, `(is-some (get-token-${o}-pending-deposit '${q}))`, 'true');
  }
  sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const setup = (await getSimulationResult(sid)).steps.filter((s) => s.Result?.Transaction || s.Result?.Eval);
  if (setup.length !== plan.length) throw new Error(`setup result count ${setup.length} != ${plan.length}`);
  plan.forEach((s, i) => check(s.label, decode(setup[i]), s.want));
  if (failures) return;

  // ---------- phase 2: two real signed [45,7] updates with different prices ----------
  const tip0 = await getSimulationTip(sid);
  let ua, ub;
  for (let i = 0; i < 90 && !ub; i++) {
    const u = await lazer();
    const at = (await lazerTimes(u.hex)).at;
    if (at - 3 <= Number(tip0.block_time)) { await new Promise((r) => setTimeout(r, 2000)); continue; }
    const cur = { u, at, price: midOf(u), upd: bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex')) };
    if (!ua) ua = cur; else if (cur.price !== ua.price) ub = cur;
    if (!ub) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ub) throw new Error('no two Lazer updates with different prices');
  const [lo, hi] = ua.price < ub.price ? [ua, ub] : [ub, ua];
  console.log(`Plo ${lo.price} (at ${lo.at}), Phi ${hi.price} (at ${hi.at}), ${((Number(hi.price - lo.price) / Number(lo.price)) * 1e4).toFixed(2)} bps apart`);
  const stamp = Math.min(lo.at, hi.at) - 3;
  await submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: stamp - Number(tip0.burn_block_time) } }] });
  await ev('fork clock T1 = 3s before the older update', MKT.y, 'stacks-block-time', `u${stamp}`);
  const L2a = { y: lo.price, x: hi.price };
  const quiet = { y: hi, x: lo };
  const loud = { y: lo, x: hi };

  for (const side of ['y', 'x']) {
    const m = MKT[side], o = other(side), q = who[side].liq;
    const r = await tx(`${side}-market: settle liquidity ${o} order`, keeper, m, `settle-token-${o}-deposit`, settleArgs(o, q, lo.upd), `(ok u${LIQ[o]})`);
    check(`${side}-market: liquidity placed`, prints(r), deposited(o));
    await ev(`${side}-market: liquidity on the book`, m, dep(o, q), `u${LIQ[o]}`);
    await ev(`${side}-market: L2a crosses at the loud mid`, m, crossesAt(side, loud[side].price, L2a[side]), 'true');
    await ev(`${side}-market: L2a does not cross at the quiet mid`, m, crossesAt(side, quiet[side].price, L2a[side]), 'false');
    await ev(`${side}-market: crossing top-up limit crosses at both mids`, m, `(and ${crossesAt(side, lo.price, LIM.cross[side])} ${crossesAt(side, hi.price, LIM.cross[side])})`, 'true');
    await ev(`${side}-market: non-crossing / far / base limits cross at neither mid`, m, `(or ${[LIM.nonX, LIM.far, LIM.base].flatMap((l) => [crossesAt(side, lo.price, l[side]), crossesAt(side, hi.price, l[side])]).join(' ')})`, 'false');
  }

  // ---------- T1: top-ups and early limits ----------
  for (const side of ['y', 'x']) {
    const m = MKT[side], w = who[side], fn = `deposit-token-${side}`, lf = `set-token-${side}-limit`;
    await tx(`${side}/a: top-up at non-crossing L1 (pending, T1)`, w.a, m, fn, depArgs(side, TOP[side], LIM.base[side]), `(ok u${TOP[side]})`);
    await tx(`${side}/b: top-up at crossing L1 (pending, T1)`, w.b, m, fn, depArgs(side, TOP[side], LIM.cross[side]), `(ok u${TOP[side]})`);
    await tx(`${side}/c: top-up at non-crossing L1 (pending, T1)`, w.c, m, fn, depArgs(side, TOP[side], LIM.nonX[side]), `(ok u${TOP[side]})`);
    await tx(`${side}/c2: top-up at crossing L1 (pending, T1)`, w.c2, m, fn, depArgs(side, TOP[side], LIM.cross[side]), `(ok u${TOP[side]})`);
    await tx(`${side}/c3: set far limit first (pending limit, T1)`, w.c3, m, lf, limArgs(LIM.far[side]), '(ok false)');
    await tx(`${side}/c4: set far limit (pending limit, T1)`, w.c4, m, lf, limArgs(LIM.far[side]), '(ok false)');
    await tx(`${side}/c4: top-up at crossing L1 in the same block (pending, T1)`, w.c4, m, fn, depArgs(side, TOP[side], LIM.cross[side]), `(ok u${TOP[side]})`);
    for (const k of ['a', 'b', 'c', 'c2', 'c4']) await ev(`${side}/${k}: pending submitted-at T1`, m, `(get submitted-at (unwrap-panic (get-token-${side}-pending-deposit '${w[k]})))`, `u${stamp}`);
  }
  // ---------- T2 = T1 + 1: later limits ----------
  await submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 1 } }] });
  await ev('fork clock T2 = T1 + 1', MKT.y, 'stacks-block-time', `u${stamp + 1}`);
  for (const side of ['y', 'x']) {
    const m = MKT[side], w = who[side];
    await tx(`${side}/a: set-limit L2 = ${side === 'y' ? 'Plo' : 'Phi'} (pending limit, T2)`, w.a, m, `set-token-${side}-limit`, limArgs(L2a[side]), '(ok false)');
    await tx(`${side}/b: set-limit far L2 (pending limit, T2)`, w.b, m, `set-token-${side}-limit`, limArgs(LIM.far[side]), '(ok false)');
    await tx(`${side}/c3: top-up at crossing L1 after the limit (pending, T2)`, w.c3, m, `deposit-token-${side}`, depArgs(side, TOP[side], LIM.cross[side]), `(ok u${TOP[side]})`);
  }
  // ---------- limit settles ----------
  for (const side of ['y', 'x']) {
    const m = MKT[side], w = who[side], sf = `settle-token-${side}-limit`;
    await tx(`${side}/a: settle L2 at the quiet mid -> stored`, keeper, m, sf, [P(w.a), quiet[side].upd], '(ok true)');
    await ev(`${side}/a: stored limit L2, set-at T2`, m, `(let ((o ${order(side, w.a)})) (list (get limit o) (get set-at o)))`, `(list u${L2a[side]} u${stamp + 1})`);
    await tx(`${side}/b: settle far L2 -> stored`, keeper, m, sf, [P(w.b), loud[side].upd], '(ok true)');
    await ev(`${side}/b: stored limit far, set-at T2`, m, `(let ((o ${order(side, w.b)})) (list (get limit o) (get set-at o)))`, `(list u${LIM.far[side]} u${stamp + 1})`);
    for (const k of ['c3', 'c4']) {
      await tx(`${side}/${k}: settle far limit -> stored`, keeper, m, sf, [P(w[k]), loud[side].upd], '(ok true)');
      await ev(`${side}/${k}: stored limit far, set-at T1`, m, `(let ((o ${order(side, w[k])})) (list (get limit o) (get set-at o)))`, `(list u${LIM.far[side]} u${stamp})`);
    }
  }

  // ---------- top-up settles, all at the loud mid (patched) ----------
  for (const side of ['y', 'x']) {
    const m = MKT[side], w = who[side], sf = `settle-token-${side}-deposit`, upd = loud[side].upd, px = loud[side].price;
    const S0 = await ev(`${side}: market balance before top-up settles`, m, bal(side, m));
    const s0 = BigInt(S0.slice(1));
    const t0 = BigInt((await ev(`${side}: totals before`, m, total(side))).slice(1));
    let refundsHere = 0;
    // (a) attack
    let r = await tx(`${side}/a: settle top-up at the mid where L2 crosses`, keeper, m, sf, settleArgs(side, w.a, upd), `(ok u${TOP[side]})`);
    refundsHere++;
    check(`${side}/a: FIXED refunded "crossing" (priced on newer L2, mid u${px})`, prints(r), (x) => refunded(side)(x) && x.includes(`u${px}`));
    await ev(`${side}/a: FIXED book stays base`, m, dep(side, w.a), `u${BASE[side]}`);
    await ev(`${side}/a: FIXED top-up back in wallet`, m, bal(side, w.a), `u${TOP[side]}`);
    await ev(`${side}/a: pending cleared`, m, `(get-token-${side}-pending-deposit '${w.a})`, 'none');
    await ev(`${side}/a: stored limit still L2 (newer kept)`, m, `(get limit ${order(side, w.a)})`, `u${L2a[side]}`);
    // (b) reverse
    r = await tx(`${side}/b: settle crossing-L1 top-up after a far L2`, keeper, m, sf, settleArgs(side, w.b, upd), `(ok u${TOP[side]})`);
    check(`${side}/b: FIXED placed at the far newer L2`, prints(r), deposited(side));
    await ev(`${side}/b: FIXED book = base + top-up`, m, dep(side, w.b), `u${BASE[side] + TOP[side]}`);
    await ev(`${side}/b: FIXED wallet emptied`, m, bal(side, w.b), 'u0');
    await ev(`${side}/b: stored limit far L2`, m, `(get limit ${order(side, w.b)})`, `u${LIM.far[side]}`);
    await ev(`${side}/b: resting order does not cross`, m, crossesAt(side, px, LIM.far[side]), 'false');
    // (c) controls
    r = await tx(`${side}/c: settle non-crossing top-up (no newer limit)`, keeper, m, sf, settleArgs(side, w.c, upd), `(ok u${TOP[side]})`);
    check(`${side}/c: placed`, prints(r), deposited(side));
    await ev(`${side}/c: book = base + top-up`, m, dep(side, w.c), `u${BASE[side] + TOP[side]}`);
    await ev(`${side}/c: limit moved to top-up L1, set-at T1`, m, `(let ((o ${order(side, w.c)})) (list (get limit o) (get set-at o)))`, `(list u${LIM.nonX[side]} u${stamp})`);
    for (const [k, why, keep] of [['c2', 'no newer limit', LIM.base[side]], ['c3', 'stored limit OLDER than top-up', LIM.far[side]], ['c4', 'stored limit SAME time as top-up', LIM.far[side]]]) {
      refundsHere++;
      r = await tx(`${side}/${k}: settle crossing top-up (${why})`, keeper, m, sf, settleArgs(side, w[k], upd), `(ok u${TOP[side]})`);
      check(`${side}/${k}: refunded "crossing" on the pending L1`, prints(r), (x) => refunded(side)(x) && x.includes(`u${px}`));
      await ev(`${side}/${k}: book stays base`, m, dep(side, w[k]), `u${BASE[side]}`);
      await ev(`${side}/${k}: top-up back in wallet`, m, bal(side, w[k]), `u${TOP[side]}`);
      await ev(`${side}/${k}: stored limit unchanged`, m, `(get limit ${order(side, w[k])})`, `u${keep}`);
    }
    const placed = 6 - refundsHere;
    await ev(`${side}: totals = before + placed top-ups (${placed})`, m, total(side), `u${t0 + BigInt(placed * TOP[side])}`);
    await ev(`${side}: market balance = before - refunds (${refundsHere})`, m, bal(side, m), `u${s0 - BigInt(refundsHere * TOP[side])}`);
    await ev(`${side}: solvent: ${side} balance = ${side} book`, m, `(is-eq ${bal(side, m)} ${total(side)})`, 'true');
    await ev(`${side}: no pending left`, m, `(list ${makers.map((k) => `(get-token-${side}-pending-deposit '${w[k]})`).join(' ')})`, `(list ${makers.map(() => 'none').join(' ')})`);
  }
}

const summary = [];
for (const mode of ['patched']) {
  try { await run(mode); } catch (e) { console.error(`${mode}: ${e.stack || e}`); failures++; }
  summary.push(`${mode}: ${passed}/${checks}${failures ? ` FAIL (${failed.slice(0, 6).join('; ')})` : ''} https://stxer.xyz/simulations/mainnet/${sid}`);
}
console.log('\n' + summary.join('\n'));
if (summary.some((s) => s.includes('FAIL'))) process.exitCode = 1;
