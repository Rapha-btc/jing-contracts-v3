// Fork only. Run: node simulations/verify-v6-3-settle-newer-limit.js [prefix] [patched]
// (no args = prefix patched). Each mode is its own stxer mainnet fork.
//
// Bounty mv8wal (Patient Reed, Low): settle-token-{x,y}-deposit priced the
// crossing check with the PENDING top-up's limit, while put-limit-* keeps a
// newer stored limit (set-at > submitted-at). So a top-up could rest at a
// limit that was never checked at the settle mid. Fix 9a69481: the settle
// uses the stored limit when its set-at is after the pending submitted-at.
// Review: README-audit-bounty-mv8wal.md (item 2).
//
// Modes: prefix  = git 9a69481^ markets-sbtc-stx-jing-v6-3.clar (live logic)
//        patched = working-tree markets-sbtc-stx-jing-v6-3.clar (the fix)
// Both deploy the repo source as-is (deploy form, < 100 KB) under fresh names
// against the LIVE jing-core-v6 / jing-ladder-v1 (nothing else redeployed).
//
// The mid is real Lazer: two signed updates a few seconds apart with
// different prices, Plo < Phi. A limit L2 between them crosses at one and not
// the other, so "the mid moves" between the limit settle and the top-up settle
// by choosing which signed update each keeper call carries. No fake oracle.
// Crossing = order price on the right side of the mid AND a live opposite
// order on the other side (would-take-as-*): MY holds one resting ask M at
// 0.9 mid, MX one resting bid N at 1.1 mid.
//
// Fork time: T1 = stamp (top-ups + early limits), T2 = stamp + 1 (later
// limits), both before the oldest feed time of either update.
//   (a) attack   base bid, top-up at non-crossing L1 (T1), set-limit L2 (T2)
//                settled at the price where L2 does not cross; top-up settled
//                at the price where L2 crosses. prefix: rests at a crossing
//                L2 (the bug). patched: refunded "crossing".
//   (b) reverse  top-up at crossing L1 (T1), set-limit far L2 (T2) settled.
//                prefix: refunded "crossing". patched: rests at L2.
//   (c) control  no newer limit: non-crossing top-up rests at L1; crossing
//                top-up refunded (c2); limit settled BEFORE the top-up (c3,
//                set-at T1 < submitted-at T2) and at the SAME time (c4, strict
//                >) keep the pending limit -> crossing top-up refunded.
//                Same result in both modes.
//   (d) x-side   every case above mirrored on MX (asks, crossing at Phi).
// Results 2026-10-15: prefix 183/183 (bug reproduced both sides,
// b3757e05dfcb635cb89e011a3f0cb1d7), patched 183/183 (fix proven both sides,
// b69cda28e3afa87ecf044281a45eb03c). Mids ~1.1 bps apart.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  noneCV, deserializeCV, cvToString, getAddressFromPrivateKey,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, getSimulationTip, submitSimulationSteps, callContract,
} from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';
import { installChunkedSubmit } from './_chunked-submit.js';
import { installRetrySubmit } from './_retry-submit.js';

installChunkedSubmit(60);
installRetrySubmit();
const NODE = 'http://77.42.3.101/stacks-api';
const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const CORE = `${DEP}.jing-core-v6`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALE = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51' };
const P = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const T = { x: P(SBTC), y: P(WSTX) };
const A = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const MKT = { y: `${DEP}.mv8wal-newer-my`, x: `${DEP}.mv8wal-newer-mx` };
const U = { y: 1_000_000, x: 1000 }; // 1 unit = min deposit
const BASE = { y: 2 * U.y, x: 2 * U.x };
const TOP = { y: U.y, x: U.x };
const LIQ = { y: 5 * U.y, x: 5 * U.x };
const other = (s) => (s === 'x' ? 'y' : 'x');

const SOURCES = {
  prefix: () => execFileSync('git', ['show', '9a69481^:contracts/markets-sbtc-stx-jing-v6-3.clar'], { cwd: new URL('..', import.meta.url) }).toString(),
  patched: () => fs.readFileSync(new URL('../contracts/markets-sbtc-stx-jing-v6-3.clar', import.meta.url), 'utf8'),
};

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
// Reads only: an Eval has no effect, so a stxer 5xx (Cloudflare 520) is retried.
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
const bal = (side, p) => side === 'y' ? `(stx-get-balance '${p})` : `(unwrap-panic (contract-call? '${SBTC} get-balance '${p}))`;
const cyc = '(var-get current-cycle)';
const dep = (side, p) => `(get-token-${side}-deposit ${cyc} '${p})`;
const total = (side) => `(get total-token-${side} (get-cycle-totals ${cyc}))`;
const order = (side, p) => `(get-token-${side}-order '${p})`;
const depArgs = (side, amount, limit) => [uintCV(amount), uintCV(limit), noneCV(), T[side], A[side]];
const limArgs = (limit) => [uintCV(limit), noneCV()];
const settleArgs = (side, who, upd) => [P(who), upd, T[side], A[side]];
const refunded = (side) => (x) => x.includes(`pending-refund-${side}`) && x.includes('"crossing"');
const deposited = (side) => (x) => x.includes(`deposit-${side}`) && !x.includes(`pending-refund-${side}`);
// would-take-as-y: bid >= mid and a live ask <= mid. would-take-as-x: ask <= mid and a live bid >= mid.
const crossesAt = (side, price, limit) => `(would-take-as-${side === 'y' ? 'y' : 'x'} u${price} u${limit})`;

async function run(mode) {
  passed = checks = failures = 0; failed.length = 0;
  console.log(`\n===== mode ${mode} =====`);
  const market = SOURCES[mode]();
  console.log(`market source ${market.length} bytes`);
  const u0 = await fetchLazerUpdateAny();
  const mid = (u0.px * 100_000_000n) / u0.py;
  const pct = (n) => (mid * BigInt(n)) / 100n;
  // Limits away from the mid (real moves over a minute are bps, these are tens of %).
  const LIM = {
    base: { y: pct(50), x: pct(200) },   // resting base orders, never cross
    nonX: { y: pct(40), x: pct(250) },   // non-crossing top-up
    cross: { y: pct(120), x: pct(80) },  // crossing top-up
    far: { y: pct(33), x: pct(300) },    // far new limit
    liq: { y: pct(110), x: pct(90) },    // the one opposite order per market
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
  const fundB = (side, p, amt) => side === 'y'
    ? add(`fund ${p.slice(0, 8)} ${amt} uSTX`, (bb) => bb.withSender(WHALE.y).addSTXTransfer({ recipient: p, amount: amt }), ok)
    : add(`fund ${p.slice(0, 8)} ${amt} sats`, call(WHALE.x, SBTC, 'transfer', [uintCV(amt), P(WHALE.x), P(p), noneCV()]), '(ok true)');
  read('live core owner is the deployer', CORE, '(get-contract-owner)', DEP);
  for (const side of ['y', 'x']) {
    const m = MKT[side];
    add(`deploy ${m.split('.')[1]} (${mode})`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: m.split('.')[1], source_code: market, clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes('ERR'));
    add(`verify ${m.split('.')[1]} on live core`, call(DEP, CORE, 'set-verified-contract', [P(m)]), '(ok true)');
    add(`initialize ${m.split('.')[1]}`, call(DEP, m, 'initialize', [P(m), T.x, T.y, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), '(ok true)');
    read(`${m.split('.')[1]} registered in core`, CORE, `(is-registered '${m})`, 'true');
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

  // ---------- phase 2: two real signed updates with different prices ----------
  const tip0 = await getSimulationTip(sid);
  const priceOf = (u) => (u.px * 100_000_000n) / u.py;
  let ua, ub;
  for (let i = 0; i < 60 && !ub; i++) {
    const u = await fetchLazerUpdateAny();
    const at = (await lazerFeedTimes(u.hex)).at;
    if (at - 3 <= Number(tip0.block_time)) { await new Promise((r) => setTimeout(r, 2000)); continue; }
    const cur = { u, at, price: priceOf(u), upd: bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex')) };
    if (!ua) ua = cur; else if (cur.price !== ua.price) ub = cur;
    if (!ub) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ub) throw new Error('no two Lazer updates with different prices');
  const [lo, hi] = ua.price < ub.price ? [ua, ub] : [ub, ua];
  console.log(`Plo ${lo.price} (at ${lo.at}), Phi ${hi.price} (at ${hi.at}), ${((Number(hi.price - lo.price) / Number(lo.price)) * 1e4).toFixed(2)} bps apart`);
  const stamp = Math.min(lo.at, hi.at) - 3;
  await submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: stamp - Number(tip0.burn_block_time) } }] });
  await ev('fork clock T1 = 3s before the older update', MKT.y, 'stacks-block-time', `u${stamp}`);
  // L2 for (a): crosses at one update's mid, not at the other's.
  // y bid crosses when mid <= bid: L2 = Plo (crosses at Plo, not at Phi).
  // x ask crosses when mid >= ask: L2 = Phi (crosses at Phi, not at Plo).
  const L2a = { y: lo.price, x: hi.price };
  const quiet = { y: hi, x: lo }; // update at which L2a does NOT cross (limit settle)
  const loud = { y: lo, x: hi };  // update at which L2a crosses (top-up settle)

  // liquidity rests (no live bid/ask on its far side)
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

  // ---------- top-up settles, all at the loud mid ----------
  const fixed = mode === 'patched';
  for (const side of ['y', 'x']) {
    const m = MKT[side], w = who[side], sf = `settle-token-${side}-deposit`, upd = loud[side].upd, px = loud[side].price;
    const S0 = await ev(`${side}: market balance before top-up settles`, m, bal(side, m));
    const s0 = BigInt(S0.slice(1));
    const t0 = BigInt((await ev(`${side}: totals before`, m, total(side))).slice(1));
    let refundsHere = 0;
    // (a) attack
    let r = await tx(`${side}/a: settle top-up at the mid where L2 crosses`, keeper, m, sf, settleArgs(side, w.a, upd), `(ok u${TOP[side]})`);
    if (fixed) {
      refundsHere++;
      check(`${side}/a: FIXED refunded "crossing" (priced on newer L2, mid u${px})`, prints(r), (x) => refunded(side)(x) && x.includes(`u${px}`));
      await ev(`${side}/a: FIXED book stays base`, m, dep(side, w.a), `u${BASE[side]}`);
      await ev(`${side}/a: FIXED top-up back in wallet`, m, bal(side, w.a), `u${TOP[side]}`);
    } else {
      check(`${side}/a: BUG top-up placed (crossing checked on old L1)`, prints(r), deposited(side));
      await ev(`${side}/a: BUG book = base + top-up`, m, dep(side, w.a), `u${BASE[side] + TOP[side]}`);
      await ev(`${side}/a: BUG wallet emptied`, m, bal(side, w.a), 'u0');
    }
    await ev(`${side}/a: pending cleared`, m, `(get-token-${side}-pending-deposit '${w.a})`, 'none');
    await ev(`${side}/a: stored limit still L2 (newer kept)`, m, `(get limit ${order(side, w.a)})`, `u${L2a[side]}`);
    // (b) reverse
    r = await tx(`${side}/b: settle crossing-L1 top-up after a far L2`, keeper, m, sf, settleArgs(side, w.b, upd), `(ok u${TOP[side]})`);
    if (fixed) {
      check(`${side}/b: FIXED placed at the far newer L2`, prints(r), deposited(side));
      await ev(`${side}/b: FIXED book = base + top-up`, m, dep(side, w.b), `u${BASE[side] + TOP[side]}`);
      await ev(`${side}/b: FIXED wallet emptied`, m, bal(side, w.b), 'u0');
    } else {
      refundsHere++;
      check(`${side}/b: OLD refunded "crossing" on stale L1`, prints(r), refunded(side));
      await ev(`${side}/b: OLD book stays base`, m, dep(side, w.b), `u${BASE[side]}`);
      await ev(`${side}/b: OLD top-up back in wallet`, m, bal(side, w.b), `u${TOP[side]}`);
    }
    await ev(`${side}/b: stored limit far L2`, m, `(get limit ${order(side, w.b)})`, `u${LIM.far[side]}`);
    await ev(`${side}/b: resting order does not cross`, m, crossesAt(side, px, LIM.far[side]), 'false');
    // (c) controls, same in both modes
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

const modes = process.argv.slice(2).length ? process.argv.slice(2) : ['prefix', 'patched'];
const summary = [];
for (const mode of modes) {
  if (!SOURCES[mode]) throw new Error(`unknown mode ${mode}`);
  try { await run(mode); } catch (e) { console.error(`${mode}: ${e.stack || e}`); failures++; }
  summary.push(`${mode}: ${passed}/${checks}${failures ? ` FAIL (${failed.slice(0, 6).join('; ')})` : ''} https://stxer.xyz/simulations/mainnet/${sid}`);
}
console.log('\n' + summary.join('\n'));
if (summary.some((s) => s.includes('FAIL'))) process.exitCode = 1;
