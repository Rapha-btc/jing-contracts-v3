// Fork only. Run: node simulations/verify-router-v5-3-manual.js
// (PYTH_API_KEY in the environment, or the faktory backend fallback in _lazer.js)
//
// swap-router-sbtc-stx-jing-v5-3, the two MANUAL entry points
// (swap-sbtc-for-stx, swap-stx-for-sbtc) and the read-only getter, against the
// unmodified working-tree market v6-3 / core-v6 / ladder-v1, the real mainnet
// DLMM, XYK and Velar pools and one real signed Lazer print. Both directions:
//
//  G  guards: u3001 zero amount, u3004 split under / over, u3003 fallback u0 /
//     u4, u3005 book leg without an update; order of the checks. Each refusal
//     moves nothing (taker, market, every pool) and prints nothing.
//  A  one AMM venue at a time, no book leg, update none: XYK and Velar outputs
//     predicted exactly from the pools' own formulas (read from their mainnet
//     source), DLMM measured on the wallet; in == amount, out == wallet gain,
//     the other legs report u0; a u0 minimum is floored to u1 (Velar accepts).
//  B  the venue refuses its own minimum: XYK / Velar at quote + 1 refused
//     (u1020 / u1019, u107), exactly at quote filled; DLMM over its output
//     refused (u2003). Nothing moved on a refusal.
//  C  the book leg: full fill (jing-ok, jing-in == debit, jing-out == gain);
//     partial fill (sub-minimum rest refunded) with the residual on the
//     fallback venue on top of its plan and its minimum scaled pro rata;
//     fill-or-kill refusals (empty book, zero limit) with the whole book leg
//     on each fallback venue: planned u0 (minimum unchanged, floored) and
//     planned > 0 (minimum scaled: refused when the scaled minimum is one
//     over the venue's output although the unscaled one is not, filled one
//     under); fallback none (unsold == book leg, out u0, min-out u0 ok,
//     min-out u1 -> u3002); all four legs at once; min-out one over the
//     measured out after every leg ran -> u3002, nothing moved.
//  Every successful call: the receipt's in / out / unsold against the wallet
//  deltas exactly, and the print equals the ok tuple plus topic / user / amount.
import {
  DEP, MARKET, ROUTER, PROBE, SBTC, XYK_POOL, VELAR_POOL, MIN_X, MIN_Y,
  H, check, ev, evRaw, tx, fund, deployAll, initMarket, printAfter, forkClock, refused, wallet, printsOf,
  manualArgs, manualFn, xykQuote, velarQuote, uint, fields, mk, traits, assets, shas, done,
} from './_router-v5-3-harness.js';
import { uintCV, noneCV } from '@stacks/transactions';

const VENUE = { dlmm: 1n, xyk: 2n, velar: 3n };
const V = ['dlmm', 'xyk', 'velar'];

async function main() {
  const sha0 = shas();
  console.log('sha256 at start:', JSON.stringify(sha0));
  await deployAll();
  await initMarket();
  const stamp = await forkClock();
  const u = await printAfter(stamp);
  const P = u.mid;
  console.log(`mid ${P} (uSTX per sat x 1e10), print at ${u.at}, fork clock ${stamp}`);

  // live pool orientation the venue models rely on
  await ev('XYK pool x-token is sBTC', MARKET, `(get x-token (unwrap-panic (contract-call? '${XYK_POOL} get-pool)))`, SBTC);
  await ev('Velar token1 is sBTC', MARKET, `(get token1 (unwrap-panic (contract-call? '${VELAR_POOL} get-pool)))`, SBTC);

  // getter, read inside a transaction
  const g = await tx('get-jing-min-deposits through the probe', mk(861), PROBE, 'mins', [], (v) => ok2(v));
  check('router getter == market get-min-deposits == initialize values', g.result,
    `(ok (tuple (market (tuple (min-token-x u${MIN_X}) (min-token-y u${MIN_Y}))) (router (tuple (min-token-x u${MIN_X}) (min-token-y u${MIN_Y})))))`);

  const T = { x: mk(811), y: mk(812) }; // takers: x sells sBTC, y sells STX
  const MB = mk(813), MA = mk(814);     // makers: bids (STX) / asks (sBTC)
  await fund('x', T.x, 5_000_000n);
  await fund('y', T.x, 10_000_000n);
  await fund('y', T.y, 20_000_000_000n);
  await fund('x', T.y, 10_000n);
  await fund('y', MB, 2_000_000_000n);
  await fund('x', MA, 2_000_000n);
  const who = [T.x, T.y, MB, MA];
  const L = { x: 20_000n, y: 50_000_000n }; // a leg: 20,000 sats / 50 STX
  const takerLimit = { x: P / 2n, y: P * 2n };
  const outSide = (s) => (s === 'x' ? 'y' : 'x');

  // one router call; asserts the receipt against the wallet and the print
  async function call(label, s, o, want) {
    const taker = T[s];
    const w0 = await wallet(taker);
    const r = await tx(label, taker, ROUTER, manualFn(s === 'x'), manualArgs(o), want);
    const w1 = await wallet(taker);
    if (!ok2(r.result)) return { r, w0, w1 };
    const f = r.f;
    const spent = w0[s] - w1[s], gain = w1[outSide(s)] - w0[outSide(s)];
    check(`${label}: out == wallet gain of the bought asset`, String(f.out), String(gain < 0n ? 0n : gain));
    check(`${label}: out == jing-out + dlmm-out + xyk-out + velar-out`, String(f.out), String(f['jing-out'] + f['dlmm-out'] + f['xyk-out'] + f['velar-out']));
    // a sell-STX taker also pays nothing else in STX (fee 0 in the sim); a sell-sBTC taker nothing else in sBTC
    check(`${label}: sold-asset debit == jing-in + dlmm-in + xyk-in + velar-in`, String(spent), String(f['jing-in'] + f['dlmm-in'] + f['xyk-in'] + f['velar-in']));
    check(`${label}: amount == legs in + unsold`, String(o.amount), String(f['jing-in'] + f['dlmm-in'] + f['xyk-in'] + f['velar-in'] + f.unsold));
    const pr = printsOf(r, ROUTER);
    const body = r.result.replace(/^\(ok \(tuple /, '').replace(/\)\)$/, '');
    check(`${label}: one router print = the ok tuple + topic / user / amount`, pr.join(' | '), (p) => pr.length === 1
      && pr[0].includes(`(topic "${manualFn(s === 'x')}")`) && pr[0].includes(`(user ${taker})`) && pr[0].includes(`(amount u${o.amount})`)
      && [...body.matchAll(/\(([a-z-]+) (u\d+|true|false)\)/g)].every((m) => p.includes(m[0])));
    return { r, f, w0, w1, spent, gain };
  }
  const tupleOf = (o) => `(ok (tuple ${Object.keys(o).sort().map((k) => `(${k} ${typeof o[k] === 'boolean' ? o[k] : `u${o[k]}`})`).join(' ')}))`;
  const zero = { 'dlmm-in': 0n, 'dlmm-out': 0n, 'jing-in': 0n, 'jing-ok': false, 'jing-out': 0n, out: 0n, unsold: 0n, 'velar-in': 0n, 'velar-out': 0n, 'xyk-in': 0n, 'xyk-out': 0n };
  const legIdx = (v) => V.indexOf(v);
  const vec = (v, n) => { const a = [0n, 0n, 0n]; a[legIdx(v)] = n; return a; };

  for (const s of ['x', 'y']) {
    const sellX = s === 'x', leg = L[s], taker = T[s], lim = takerLimit[s];
    const xykErr = sellX ? '(err u1020)' : '(err u1019)';
    console.log(`\n=== direction ${sellX ? 'sBTC -> STX' : 'STX -> sBTC'} ===`);

    // ------------------------------------------------------------- G ----
    console.log('PHASE G: guards');
    const fn = manualFn(sellX);
    await refused('G zero amount -> u3001', taker, ROUTER, fn, manualArgs({ amount: 0n }), '(err u3001)', who);
    await refused('G zero amount with a bad fallback -> u3001 (first check)', taker, ROUTER, fn, manualArgs({ amount: 0n, fallback: 9n }), '(err u3001)', who);
    await refused('G split under the amount -> u3004', taker, ROUTER, fn, manualArgs({ amount: 3n * leg, a: [leg, leg, 0n] }), '(err u3004)', who);
    await refused('G split over the amount -> u3004', taker, ROUTER, fn, manualArgs({ amount: 3n * leg, jing: 2n * leg, a: [0n, 2n * leg, 0n], u }), '(err u3004)', who);
    await refused('G split mismatch and a bad fallback -> u3004 (split checked first)', taker, ROUTER, fn, manualArgs({ amount: 3n * leg, a: [leg, 0n, 0n], fallback: 0n }), '(err u3004)', who);
    await refused('G fallback u0 -> u3003', taker, ROUTER, fn, manualArgs({ amount: leg, a: [0n, leg, 0n], fallback: 0n }), '(err u3003)', who);
    await refused('G fallback u4 -> u3003', taker, ROUTER, fn, manualArgs({ amount: leg, a: [0n, leg, 0n], fallback: 4n }), '(err u3003)', who);
    await refused('G book leg with update none -> u3005', taker, ROUTER, fn, manualArgs({ amount: leg, jing: leg, limit: lim }), '(err u3005)', who);
    await refused('G book leg with update none and a valid fallback -> u3005', taker, ROUTER, fn, manualArgs({ amount: leg, jing: leg, limit: lim, fallback: 2n }), '(err u3005)', who);

    // ------------------------------------------------------------- A ----
    console.log('PHASE A: one AMM venue at a time');
    for (const v of V) {
      const q = v === 'xyk' ? await xykQuote(sellX, leg) : v === 'velar' ? await velarQuote(sellX, leg) : null;
      const want = q == null ? ok2 : tupleOf({ ...zero, [`${v}-in`]: leg, [`${v}-out`]: q, out: q });
      const res = await call(`A ${v} alone, min u0 (floored to u1)`, s, { amount: leg, a: vec(v, leg) }, want);
      if (v === 'dlmm') {
        check('A dlmm: in == amount, out > 0, others u0', `${res.f['dlmm-in']} ${res.f['dlmm-out'] > 0n} ${res.f['xyk-in']} ${res.f['velar-in']} ${res.f['jing-ok']}`, `${leg} true 0 0 false`);
      }
    }

    // ------------------------------------------------------------- B ----
    console.log('PHASE B: the venue enforces its own minimum');
    for (const v of ['xyk', 'velar']) {
      const q = v === 'xyk' ? await xykQuote(sellX, leg) : await velarQuote(sellX, leg);
      await refused(`B ${v} minimum = quote + 1 (${q + 1n}) -> venue refuses`, taker, ROUTER, fn, manualArgs({ amount: leg, a: vec(v, leg), m: vec(v, q + 1n) }), v === 'xyk' ? xykErr : '(err u107)', who);
      await call(`B ${v} minimum = quote exactly (${q}) -> fills`, s, { amount: leg, a: vec(v, leg), m: vec(v, q) }, tupleOf({ ...zero, [`${v}-in`]: leg, [`${v}-out`]: q, out: q }));
    }
    await refused('B dlmm minimum far over its output -> u2003', taker, ROUTER, fn, manualArgs({ amount: leg, a: vec('dlmm', leg), m: vec('dlmm', sellX ? 10n ** 13n : 10n ** 9n) }), '(err u2003)', who);

    // ------------------------------------------------------------- C ----
    console.log('PHASE C: the book leg');
    const maker = sellX ? MB : MA, ms = outSide(s);
    const makerLimit = ms === 'y' ? P * 2n : P / 2n;
    // opposite liquidity worth `sats` sats at the mid
    const worth = (sats) => (ms === 'y' ? sats * P / 10_000_000_000n : sats * 10_000_000_000n / P);
    const place = (amount) => tx(`C maker rests ${amount} on ${ms}`, maker, MARKET, `deposit-token-${ms}`, [uintCV(amount), uintCV(makerLimit), noneCV(), traits[ms], assets[ms]], `(ok u${amount})`);
    const clear = async () => {
      const live = await evRaw(MARKET, `(get-token-${ms}-deposit (var-get current-cycle) '${maker})`);
      if (live !== 'u0') await tx('C maker cancels its rest', maker, MARKET, `cancel-token-${ms}-deposit`, [traits[ms], assets[ms]], ok2);
      await ev('C maker has nothing on the book', MARKET, `(get-token-${ms}-deposit (var-get current-cycle) '${maker})`, 'u0');
    };
    // C1 full fill
    await place(worth(4n * leg));
    let r = await call('C1 book leg alone, ample opposite: full fill', s, { amount: leg, jing: leg, limit: lim, u }, ok2);
    check('C1 jing-ok, jing-in == amount (no rest), nothing else ran', `${r.f['jing-ok']} ${r.f['jing-in']} ${r.f.unsold} ${r.f['dlmm-in'] + r.f['xyk-in'] + r.f['velar-in']}`, `true ${leg} 0 0`);
    check('C1 jing-out > 0 and == out', `${r.f['jing-out'] > 0n} ${r.f['jing-out'] === r.f.out}`, 'true true');
    await clear();
    // C2 partial fill: the opposite side covers all but a sub-minimum rest
    const shortBy = sellX ? 600n : 600_000n;
    await place(worth(leg - shortBy));
    const q2plan = leg;
    r = await call('C2 book leg partially filled (rest refunded), fallback XYK with its own plan', s, { amount: 2n * leg, jing: leg, limit: lim, u, fallback: VENUE.xyk, a: [0n, q2plan, 0n], m: [0n, 1n, 0n] }, ok2);
    const res2 = leg - r.f['jing-in'];
    check('C2 jing-ok with a refunded rest: 0 < residual < min deposit + rebate', `${r.f['jing-ok']} ${res2 > 0n} ${res2 < (sellX ? MIN_X : MIN_Y) + leg / 100n}`, 'true true true');
    check('C2 xyk-in == its plan + the book residual; unsold u0', `${r.f['xyk-in']} ${r.f.unsold}`, `${q2plan + res2} 0`);
    await clear();
    // C3 fill-or-kill refusals, the book leg lands on each fallback venue
    await ev('C3 book is empty on the opposite side', MARKET, `(len (get-token-${ms}-depositors (var-get current-cycle)))`, 'u0');
    for (const v of V) {
      const q = v === 'xyk' ? await xykQuote(sellX, leg) : v === 'velar' ? await velarQuote(sellX, leg) : null;
      const want = q == null ? ok2 : tupleOf({ ...zero, [`${v}-in`]: leg, [`${v}-out`]: q, out: q });
      r = await call(`C3 empty book: FOK refused, whole book leg on fallback ${v} (planned u0, min u0)`, s, { amount: leg, jing: leg, limit: lim, u, fallback: VENUE[v] }, want);
      check(`C3 ${v}: jing-ok false, jing-in u0, ${v}-in == book leg, unsold u0`, `${r.f['jing-ok']} ${r.f['jing-in']} ${r.f[`${v}-in`]} ${r.f.unsold}`, `false 0 ${leg} 0`);
    }
    // scaled minimum: plan X on XYK with minimum M; the book residual R = X lands on top
    {
      const X = leg, R = leg;
      const q = await xykQuote(sellX, X + R);
      const M = ((q + 1n) * X + (X + R) - 1n) / (X + R); // smallest M whose scaled minimum is >= q + 1
      const qX = await xykQuote(sellX, X);
      check('C3 scaled-minimum fixture: the unscaled minimum alone would pass on X', String(M <= qX), 'true');
      check('C3 scaled-minimum fixture: M is the smallest minimum whose scaled value floor(M * (X + R) / X) reaches q + 1', String(M * (X + R) / X >= q + 1n && (M - 1n) * (X + R) / X < q + 1n), 'true');
      await refused('C3 FOK refused, XYK plan X + residual X, minimum M scaled to q + 1 -> venue refuses', taker, ROUTER, fn,
        manualArgs({ amount: X + R, jing: R, limit: lim, u, fallback: VENUE.xyk, a: [0n, X, 0n], m: [0n, M, 0n] }), xykErr, who);
      const M2 = q * X / (X + R);
      r = await call('C3 same with M scaled to <= q -> fills X + R on XYK at the exact quote', s,
        { amount: X + R, jing: R, limit: lim, u, fallback: VENUE.xyk, a: [0n, X, 0n], m: [0n, M2, 0n] }, tupleOf({ ...zero, 'xyk-in': X + R, 'xyk-out': q, out: q }));
    }
    // zero limit on the book leg: the market refuses (u1011), the router rolls it back
    await place(worth(4n * leg));
    {
      const q = await velarQuote(sellX, leg);
      r = await call('C4 zero limit on the book leg (market u1011) with an ample book -> fallback Velar', s, { amount: leg, jing: leg, limit: 0n, u, fallback: VENUE.velar }, tupleOf({ ...zero, 'velar-in': leg, 'velar-out': q, out: q }));
      await ev('C4 the maker was not touched', MARKET, `(get-token-${ms}-deposit (var-get current-cycle) '${maker})`, `u${worth(4n * leg)}`);
    }
    await clear();
    // fallback none: the refused book leg stays in the wallet
    r = await call('C5 empty book, fallback none, min-out u0: ok, out u0, unsold == book leg', s, { amount: leg, jing: leg, limit: lim, u }, tupleOf({ ...zero, unsold: leg }));
    await refused('C5 same with min-out u1 -> u3002', taker, ROUTER, fn, manualArgs({ amount: leg, jing: leg, limit: lim, u, minOut: 1n }), '(err u3002)', who);
    {
      const qx = await xykQuote(sellX, leg);
      r = await call('C5 empty book, fallback none, XYK planned: XYK runs, book leg stays home', s, { amount: 2n * leg, jing: leg, limit: lim, u, a: [0n, leg, 0n] }, tupleOf({ ...zero, 'xyk-in': leg, 'xyk-out': qx, out: qx, unsold: leg }));
    }
    // all four legs
    await place(worth(4n * leg));
    r = await call('C6 four legs: book + DLMM + XYK + Velar, each its planned size', s, { amount: 4n * leg, jing: leg, limit: lim, u, a: [leg, leg, leg], m: [1n, 1n, 1n] }, ok2);
    check('C6 every leg ran its plan, nothing home', `${r.f['jing-ok']} ${r.f['jing-in']} ${r.f['dlmm-in']} ${r.f['xyk-in']} ${r.f['velar-in']} ${r.f.unsold}`, `true ${leg} ${leg} ${leg} ${leg} 0`);
    check('C6 every leg paid out', `${r.f['jing-out'] > 0n} ${r.f['dlmm-out'] > 0n} ${r.f['xyk-out'] > 0n} ${r.f['velar-out'] > 0n}`, 'true true true true');
    // min-out after every leg ran: measure the exact out on an identical call, then ask one more
    const o6 = r.f.out;
    await refused('C7 four legs, min-out = a previous out x 2 -> u3002 after every leg ran, all rolled back', taker, ROUTER, fn,
      manualArgs({ amount: 4n * leg, jing: leg, limit: lim, u, a: [leg, leg, leg], m: [1n, 1n, 1n], minOut: o6 * 2n }), '(err u3002)', who);
    {
      const qx = await xykQuote(sellX, leg);
      await refused(`C7 XYK alone, min-out = its exact output + 1 (${qx + 1n}) -> u3002`, taker, ROUTER, fn, manualArgs({ amount: leg, a: [0n, leg, 0n], m: [0n, qx, 0n], minOut: qx + 1n }), '(err u3002)', who);
      await call(`C7 XYK alone, min-out = its exact output (${qx}) -> fills`, s, { amount: leg, a: [0n, leg, 0n], m: [0n, qx, 0n], minOut: qx }, tupleOf({ ...zero, 'xyk-in': leg, 'xyk-out': qx, out: qx }));
    }
    await clear();
  }
  const sha1 = shas();
  console.log('sha256 at end:', JSON.stringify(sha1));
  check('sources unchanged during the run', JSON.stringify(sha1), JSON.stringify(sha0));
  done();
}
function ok2(v) { return String(v).startsWith('(ok'); }
main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; });
