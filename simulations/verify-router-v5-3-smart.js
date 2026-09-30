// Fork only. Run: node simulations/verify-router-v5-3-smart.js
// (PYTH_API_KEY in the environment, or the faktory backend fallback in _lazer.js)
//
// swap-router-sbtc-stx-jing-v5-3, the two SMART entry points
// (smart-swap-sbtc-for-stx, smart-swap-stx-for-sbtc): the split computed on
// chain. Unmodified working-tree router / market v6-3 / core-v6 / ladder-v1,
// the real mainnet DLMM, XYK and Velar pools, real signed Lazer prints.
//
// Every call is predicted from the router's own sizing read on the fork just
// before it (jing-size, dlmm-capacity, cp-capacity of both pools, as the
// caller) and asserted exactly: the print's jing-cap / dlmm-cap / xyk-cap /
// velar-cap, dlmm-in == min(cap, left), the pro-rata cp-split, unsold, the
// dust early exits; XYK / Velar outputs to the unit from the pools' own
// formulas when no book leg runs; every leg's price against the limit
// (limit-min); in / out / unsold against the wallet deltas.
//
// Session 1 (routes, both directions)
//   S0  guards u3001 / u3006 / u3007 and their order; nothing moved
//   S1  update none, loose limit: 30-bin DLMM walk never stops, DLMM
//       absorbs everything, the CP stage exits on left = 0
//   S2  tightest limit where all three venues have room: the walk stops at
//       the first bin past the limit, residual <= xyk + velar room: pro rata
//   S3  residual > xyk + velar room: each pool to its cap, the rest unsold
//   S4  a limit nobody respects: every cap 0 (walk stops at once, CP top <=
//       in), unsold == amount, out u0; min-out u1 -> u3002, nothing moved
//   S5  dust: left worth <= 1 unit of the other token -> both stages skip
//   S6  book leg larger than the amount: jing-size = amount
//   S7  book capacity under the amount: jing-size = gross-cap, the rest on
//       the AMMs
//   S8  min-dep skip: net one under the market minimum -> no book leg;
//       one over -> book leg (exact boundary 1001 / 1002 sats)
//   S9  wrong mid hint: jing-size over the real capacity, the market
//       refuses fill-or-kill, rolled back, everything on the AMMs
//   S10 the caller signs more than it holds: the DLMM, XYK or Velar leg of
//       the smart stages fails its transfer (err u1) and the whole call
//       rolls back, nothing moved
// Session 2 (min-taker skip, sBTC seller): the taker's own side is FULL
//   (49 ladder seats reserved, one unseated in-range ask Q): min-taker =
//   Q + 1; a net between min-dep and min-taker -> no book leg; a net over
//   min-taker -> book leg filled
// Session 3 (DLMM edges and fees): Bitflow's DLMM admin (impersonated on
//   the fork) sets the pool's fees to 0 -> the walk's no-fee arm, both
//   directions; the pool is pushed to bin +500 by manual DLMM legs (a partial
//   fill: DLMM stops short, `unsold` carries the rest), a smart sBTC sale
//   walks the +500 edge. The -500 edge is not pushed: the pool's bins below
//   the active one hold ~4.3 BTC, which ~1M STX (the largest wallet found)
//   moves only ~60 bins (measured: 434 -> 372 for 800,000 STX).
import {
  DEP, MARKET, ROUTER, LADDER, SBTC, DLMM_POOL, XYK_POOL, VELAR_POOL, MIN_X, MIN_Y,
  H, check, ev, evRaw, tx, fund, deployAll, initMarket, printAfter, forkClock, refused, wallet, printsOf,
  manualArgs, manualFn, smartArgs, smartFn, xykQuote, velarQuote, uint, fields, mk, traits, assets, principal, shas, update,
} from './_router-v5-3-harness.js';
import { uintCV, noneCV } from '@stacks/transactions';

const SCALE = 10_000_000_000n;
process.env.ROUTER_RENEW_TENURE = '1'; // This broad suite spans several budgets.
const DLMM_CORE = 'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1';
const DLMM_ADMIN = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD';
const sims = [];
const minB = (a, b) => (a < b ? a : b);
const limitMin = (leg, limit, sellX) => { const base = leg > 2n ? leg - 2n : 0n; return sellX ? base * limit / SCALE : base * SCALE / limit; };
const dust = (left, limit, sellX) => left === 0n || limitMin(left, limit, sellX) <= 1n;
const cpSplit = (r, cx, cv) => { const t = cx + cv; if (r <= t) { const x = t > 0n ? r * cx / t : 0n; return { x, v: r - x }; } return { x: cx, v: cv }; };

// the router's sizing on the fork, as the caller
async function sizing(sellX, taker, { amount, limit, u, mid }) {
  const b = sellX ? 'true' : 'false';
  return fields(await evRaw(ROUTER, `{ j: (jing-size u${amount} u${limit} ${u ? `(some 0x${u.hex.replace(/^0x/, '')})` : 'none'} u${mid} ${b}),
    d: (dlmm-capacity u${limit} ${b}),
    x: (cp-capacity (xyk-reserves ${b}) (xyk-keep ${b}) u${limit} ${b}),
    v: (cp-capacity (velar-reserves ${b}) (velar-keep) u${limit} ${b}) }`, taker));
}

// one smart call, fully predicted; returns { f (ok tuple), p (print), pre }
async function smart(label, sellX, taker, o, want = null) {
  const pre = await sizing(sellX, taker, o);
  const outSide = sellX ? 'y' : 'x', inSide = sellX ? 'x' : 'y';
  // with no book leg, everything downstream is known before the call
  let quote = null;
  if (pre.j === 0n) {
    const l1 = o.amount;
    const dIn = dust(l1, o.limit, sellX) ? 0n : minB(pre.d, l1);
    const l2 = l1 - dIn;
    const sp = dust(l2, o.limit, sellX) ? { x: 0n, v: 0n } : cpSplit(l2, pre.x, pre.v);
    quote = { dIn, x: sp.x, v: sp.v, xo: sp.x > 0n ? await xykQuote(sellX, sp.x) : 0n, vo: sp.v > 0n ? await velarQuote(sellX, sp.v) : 0n, unsold: l2 - sp.x - sp.v };
  }
  const w0 = await wallet(taker);
  const r = await tx(label, taker, ROUTER, smartFn(sellX), smartArgs(o), want ?? ((v) => String(v).startsWith('(ok')));
  if (!r.result.startsWith('(ok')) return { r, pre };
  const w1 = await wallet(taker);
  const f = r.f;
  const prints = printsOf(r, ROUTER);
  check(`${label}: one router print`, String(prints.length), '1');
  const p = fields(prints[0]);
  check(`${label}: print topic / user / amount / limit`, prints[0], (s) => s.includes(`(topic "${smartFn(sellX)}")`) && s.includes(`(user ${taker})`) && s.includes(`(amount u${o.amount})`) && s.includes(`(limit-price u${o.limit})`));
  for (const k of Object.keys(f)) if (p[k] !== f[k]) check(`${label}: print ${k} == ok ${k}`, String(p[k]), String(f[k]));
  // stage 1
  check(`${label}: jing-cap == jing-size read before the call`, String(p['jing-cap']), String(pre.j));
  if (pre.j === 0n) check(`${label}: no book leg`, `${f['jing-ok']} ${f['jing-in']} ${f['jing-out']}`, 'false 0 0');
  if (f['jing-ok']) check(`${label}: book kept at most the book leg`, String(f['jing-in'] <= pre.j && f['jing-in'] > 0n), 'true');
  else check(`${label}: book leg refused or skipped: jing-in / jing-out u0`, `${f['jing-in']} ${f['jing-out']}`, '0 0');
  // stage 2
  const l1 = o.amount - f['jing-in'];
  if (dust(l1, o.limit, sellX)) check(`${label}: DLMM stage skipped (left ${l1} is dust)`, `${p['dlmm-cap']} ${f['dlmm-in']} ${f['dlmm-out']}`, '0 0 0');
  else {
    check(`${label}: dlmm-cap == dlmm-capacity read before the call`, String(p['dlmm-cap']), String(pre.d));
    check(`${label}: dlmm-in == min(cap ${pre.d}, left ${l1})`, String(f['dlmm-in']), String(minB(pre.d, l1)));
  }
  // stage 3
  const l2 = l1 - f['dlmm-in'];
  if (dust(l2, o.limit, sellX)) {
    check(`${label}: CP stage skipped (left ${l2} is dust): caps u0, unsold == left`, `${p['xyk-cap']} ${p['velar-cap']} ${f['xyk-in']} ${f['velar-in']} ${f.unsold}`, `0 0 0 0 ${l2}`);
  } else {
    check(`${label}: xyk-cap / velar-cap == cp-capacity read before the call`, `${p['xyk-cap']} ${p['velar-cap']}`, `${pre.x} ${pre.v}`);
    const sp = cpSplit(l2, pre.x, pre.v);
    check(`${label}: cp-split(${l2}, ${pre.x}, ${pre.v}) -> xyk-in / velar-in / unsold`, `${f['xyk-in']} ${f['velar-in']} ${f.unsold}`, `${sp.x} ${sp.v} ${l2 - sp.x - sp.v}`);
  }
  if (quote) {
    check(`${label}: exact prediction (dlmm-in, xyk-in/out, velar-in/out, unsold)`, `${f['dlmm-in']} ${f['xyk-in']} ${f['xyk-out']} ${f['velar-in']} ${f['velar-out']} ${f.unsold}`,
      `${quote.dIn} ${quote.x} ${quote.xo} ${quote.v} ${quote.vo} ${quote.unsold}`);
  }
  // the limit on every AMM leg that ran (the venue enforced limit-min)
  for (const v of ['dlmm', 'xyk', 'velar']) {
    if (f[`${v}-in`] > 0n) check(`${label}: ${v} out ${f[`${v}-out`]} >= limit-min(${f[`${v}-in`]})`, String(f[`${v}-out`] >= limitMin(f[`${v}-in`], o.limit, sellX)), 'true');
  }
  // wallet
  const spent = w0[inSide] - w1[inSide], gain = w1[outSide] - w0[outSide];
  check(`${label}: wallet: spent == legs in, gain == out == sum of outs`, `${spent} ${gain}`, `${f['jing-in'] + f['dlmm-in'] + f['xyk-in'] + f['velar-in']} ${f.out}`);
  check(`${label}: out == jing-out + dlmm-out + xyk-out + velar-out; amount == legs + unsold`, `${f.out} ${o.amount}`,
    `${f['jing-out'] + f['dlmm-out'] + f['xyk-out'] + f['velar-out']} ${f['jing-in'] + f['dlmm-in'] + f['xyk-in'] + f['velar-in'] + f.unsold}`);
  return { r, f, p, pre };
}

// ============================================================ session 1 ==
async function routes() {
  console.log('\n######## SESSION 1: routes ########');
  await deployAll();
  sims.push(H.sid);
  await initMarket();
  const stamp = await forkClock();
  const u = await printAfter(stamp);
  const P = u.mid;
  console.log(`mid ${P}, print at ${u.at}, fork clock ${stamp}`);
  const T = { x: mk(821), y: mk(822) }, MB = mk(823), MA = mk(824);
  await fund('x', T.x, 20_000_000n);
  await fund('y', T.y, 50_000_000_000n);
  await fund('y', MB, 2_000_000_000n);
  await fund('x', MA, 2_000_000n);
  const who = [T.x, T.y, MB, MA];

  for (const s of ['x', 'y']) {
    const sellX = s === 'x', taker = T[s], fn = smartFn(sellX);
    const loose = sellX ? P / 2n : P * 2n;
    const small = sellX ? 5_000n : 20_000_000n;
    console.log(`\n=== ${sellX ? 'sBTC -> STX' : 'STX -> sBTC'} ===`);
    console.log('S0 guards');
    await refused('S0 amount 0 -> u3001', taker, ROUTER, fn, smartArgs({ amount: 0n, limit: 0n, mid: 0n }), '(err u3001)', who);
    await refused('S0 limit 0 -> u3006', taker, ROUTER, fn, smartArgs({ amount: small, limit: 0n, mid: P }), '(err u3006)', who);
    await refused('S0 limit 0 and mid 0 -> u3006 (limit first)', taker, ROUTER, fn, smartArgs({ amount: small, limit: 0n, mid: 0n, u }), '(err u3006)', who);
    await refused('S0 mid 0 -> u3007', taker, ROUTER, fn, smartArgs({ amount: small, limit: loose, mid: 0n }), '(err u3007)', who);
    await refused('S0 mid 0 with an update -> u3007', taker, ROUTER, fn, smartArgs({ amount: small, limit: loose, mid: 0n, u }), '(err u3007)', who);

    console.log('S1 update none, loose limit');
    let x = await smart('S1 no update, loose limit, small amount', sellX, taker, { amount: small, limit: loose, mid: P });
    check('S1 loose-limit capacity > amount, DLMM took it all', `${x.pre.d > small} ${x.f['dlmm-in']} ${x.f.unsold}`, `true ${small} 0`);
    await ev('S1 loose-limit fold advances 30 bins or stops at the pool boundary', ROUTER,
      `(let ((p (unwrap-panic (contract-call? DLMM_POOL get-pool))) (fee (+ (get ${sellX ? 'y' : 'x'}-protocol-fee p) (get ${sellX ? 'y' : 'x'}-provider-fee p) (get ${sellX ? 'y' : 'x'}-variable-fee p)))
        (r (fold dlmm-bin-step DLMM_WALK_BINS { bin: (get active-bin-id p), up: ${sellX}, threshold: ${sellX ? `(/ (* (/ (* PRICE_SCALE DLMM_PRICE_SCALE) u${loose}) (- BPS fee)) BPS)` : `(/ (* (/ (* PRICE_SCALE DLMM_PRICE_SCALE) u${loose}) BPS) (- BPS fee))`},
          initial-price: (get initial-price p), bin-step: (get bin-step p), fee: fee, cap: u0, done: false })))
        (let ((end (${sellX ? '+' : '-'} (get active-bin-id p) 30))
              (edge ${sellX ? '500' : '-500'}))
          (and (is-eq (get done r) (${sellX ? '>' : '<'} end edge))
            (is-eq (get bin r) (if (${sellX ? '>' : '<'} end edge) edge end))
            (is-eq (get cap r) (dlmm-capacity u${loose} ${sellX})))))`, 'true');

    console.log('S2 / S3 tight limit: every venue has some room');
    // Start far enough beyond the oracle mid to find a tight pool limit even
    // when a historical pool snapshot differs from the current signed price.
    let lim = null, pre = null;
    for (let k = 1500n; k >= 500n && !lim; k -= 5n) {
      const cand = sellX ? P * k / 1000n : P * (2000n - k) / 1000n;
      const z = await sizing(sellX, taker, { amount: 1n, limit: cand, mid: P });
      if (z.d > 0n && z.x > 0n && z.v > 0n) { lim = cand; pre = z; }
    }
    check('S2 found a limit with room on DLMM, XYK and Velar', String(lim != null), 'true');
    console.log(`  limit ${lim}: dlmm ${pre.d}, xyk ${pre.x}, velar ${pre.v}`);
    await ev('S2 at that limit the walk stops before 30 bins', ROUTER,
      `(let ((p (unwrap-panic (contract-call? DLMM_POOL get-pool))) (fee (+ (get ${sellX ? 'y' : 'x'}-protocol-fee p) (get ${sellX ? 'y' : 'x'}-provider-fee p) (get ${sellX ? 'y' : 'x'}-variable-fee p)))
        (r (fold dlmm-bin-step DLMM_WALK_BINS { bin: (get active-bin-id p), up: ${sellX}, threshold: ${sellX ? `(/ (* (/ (* PRICE_SCALE DLMM_PRICE_SCALE) u${lim}) (- BPS fee)) BPS)` : `(/ (* (/ (* PRICE_SCALE DLMM_PRICE_SCALE) u${lim}) BPS) (- BPS fee))`},
          initial-price: (get initial-price p), bin-step: (get bin-step p), fee: fee, cap: u0, done: false })))
        (and (get done r) (is-eq (get cap r) u${pre.d})))`, 'true');
    const a2 = pre.d + (pre.x + pre.v) / 2n;
    console.log('S10 the caller signs more than it holds: each stage venue leg fails inside the router (try! arms)');
    {
      const poor = mk(sellX ? 825 : 826), side = sellX ? 'x' : 'y';
      const sp = cpSplit(a2 - pre.d, pre.x, pre.v);
      check('S10 fixture: all three legs would run', String(pre.d > 0n && sp.x > 0n && sp.v > 0n), 'true');
      await refused('S10 empty wallet: the DLMM leg (first) fails; the DLMM router reports it as ERR_NO_RESULT_DATA (err u2001)', poor, ROUTER, fn, smartArgs({ amount: a2, limit: lim, mid: P }), '(err u2001)', [poor, ...who]);
      await fund(side, poor, pre.d + sp.x - 1n);
      await refused('S10 wallet = DLMM leg + XYK leg - 1: DLMM runs, the XYK leg fails -> (err u1), DLMM rolled back', poor, ROUTER, fn, smartArgs({ amount: a2, limit: lim, mid: P }), '(err u1)', [poor, ...who]);
      await fund(side, poor, sp.v);
      await refused('S10 wallet = all three legs - 1: DLMM and XYK run, the Velar leg fails -> (err u1), all rolled back', poor, ROUTER, fn, smartArgs({ amount: a2, limit: lim, mid: P }), '(err u1)', [poor, ...who]);
    }
    // The pool-derived trade can exceed the original fixed wallet funding.
    const available2 = (await wallet(taker))[s];
    if (available2 < a2) await fund(s, taker, a2 - available2);
    x = await smart('S2 amount = dlmm room + half the CP room', sellX, taker, { amount: a2, limit: lim, mid: P });
    check('S2 DLMM to its cap, both pools filled pro rata, nothing home', `${x.f['dlmm-in'] === x.pre.d} ${x.f['xyk-in'] > 0n} ${x.f['velar-in'] > 0n} ${x.f.unsold}`, 'true true true 0');
    const z3 = await sizing(sellX, taker, { amount: 1n, limit: lim, mid: P });
    const extra = sellX ? 5_000n : 20_000_000n;
    const a3 = z3.d + z3.x + z3.v + extra;
    const available3 = (await wallet(taker))[s];
    if (available3 < a3) await fund(s, taker, a3 - available3);
    x = await smart('S3 amount = every room + extra', sellX, taker, { amount: a3, limit: lim, mid: P });
    check('S3 each pool to its cap, the extra stays home', `${x.f['xyk-in'] === x.pre.x} ${x.f['velar-in'] === x.pre.v} ${x.f.unsold}`, `true true ${extra + (x.pre.d - x.f['dlmm-in'])}`);

    console.log('S4 a limit nobody respects');
    const hard = sellX ? P * 3n : P / 3n;
    x = await smart('S4 limit 3x through the mid: every venue out, unsold == amount, out u0', sellX, taker, { amount: small, limit: hard, mid: P });
    check('S4 every cap 0', `${x.p['dlmm-cap']} ${x.p['xyk-cap']} ${x.p['velar-cap']} ${x.f.unsold} ${x.f.out}`, `0 0 0 ${small} 0`);
    await refused('S4 same with min-out u1 -> u3002', taker, ROUTER, fn, smartArgs({ amount: small, limit: hard, mid: P, minOut: 1n }), '(err u3002)', who);

    console.log('S5 dust');
    const d5 = sellX ? 2n : loose / SCALE - 5n;
    check('S5 fixture: the amount is dust at the limit', String(dust(d5, loose, sellX)), 'true');
    x = await smart(`S5 dust amount ${d5}: both stages skip`, sellX, taker, { amount: d5, limit: loose, mid: P });
    check('S5 nothing traded, all unsold', `${x.f.unsold} ${x.f.out}`, `${d5} 0`);
    const d5b = sellX ? 3n : 3n * (loose / SCALE) + 10n;
    check('S5 fixture: a slightly larger amount (worth >= 2 units at the limit) is not dust', String(dust(d5b, loose, sellX)), 'false');
    x = await smart(`S5 amount ${d5b} (just over dust): the DLMM stage runs`, sellX, taker, { amount: d5b, limit: loose, mid: P });

    await fund(s, taker, sellX ? 1_000_000n : 1_000_000_000n);
    console.log('S6-S9 the book leg');
    const maker = sellX ? MB : MA, ms = sellX ? 'y' : 'x';
    const makerLimit = ms === 'y' ? P * 2n : P / 2n;
    const worth = (sats) => (ms === 'y' ? sats * P / SCALE : sats * SCALE / P);
    const place = (amount) => tx(`maker rests ${amount} on ${ms}`, maker, MARKET, `deposit-token-${ms}`, [uintCV(amount), uintCV(makerLimit), noneCV(), traits[ms], assets[ms]], `(ok u${amount})`);
    const clear = async () => {
      const live = await evRaw(MARKET, `(get-token-${ms}-deposit (var-get current-cycle) '${maker})`);
      if (live !== 'u0') await tx('maker cancels its rest', maker, MARKET, `cancel-token-${ms}-deposit`, [traits[ms], assets[ms]], (v) => v.startsWith('(ok'));
    };
    const grossCap = async (mid, limit) => fields(await evRaw(MARKET, `(get-taker-capacity u${mid} u${limit} ${sellX} '${taker} (some 0x${u.hex.replace(/^0x/, '')}))`))['gross-cap'];
    const bookAmt = sellX ? 20_000n : 50_000_000n;
    await place(worth(sellX ? 200_000n : 500_000_000n));
    const gc6 = await grossCap(P, loose);
    check('S6 fixture: book capacity over the amount', String(gc6 > bookAmt), 'true');
    x = await smart('S6 book capacity > amount: jing-size = amount', sellX, taker, { amount: bookAmt, limit: loose, u, mid: P });
    check('S6 jing-cap == amount, book filled', `${x.p['jing-cap']} ${x.f['jing-ok']}`, `${bookAmt} true`);
    await clear();
    await place(worth(sellX ? 8_000n : 20_000_000n));
    const gc7 = await grossCap(P, loose);
    const a7 = sellX ? 30_000n : 60_000_000n;
    check('S7 fixture: book capacity under the amount, over the minimum', String(gc7 < a7 && gc7 > (sellX ? MIN_X : MIN_Y)), 'true');
    x = await smart('S7 book capacity < amount: jing-size = gross-cap, the rest on the AMMs', sellX, taker, { amount: a7, limit: loose, u, mid: P });
    check('S7 jing-cap == gross-cap, book filled, AMMs took the rest', `${x.p['jing-cap']} ${x.f['jing-ok']} ${x.f['dlmm-in'] > 0n}`, `${gc7} true true`);
    await clear();
    await place(worth(sellX ? 200_000n : 500_000_000n));
    const minDep = sellX ? MIN_X : MIN_Y;
    // net = size * 10000 / 10020 >= min-dep  <=>  size >= ceil(min-dep * 10020 / 10000)
    const edge = (minDep * 10020n + 9999n) / 10000n;
    check('S8 fixture: net(edge) == min-dep, net(edge - 1) < min-dep', `${edge * 10000n / 10020n} ${(edge - 1n) * 10000n / 10020n < minDep}`, `${minDep} true`);
    x = await smart(`S8 size ${edge - 1n}: net one under min-dep -> no book leg although the book has room`, sellX, taker, { amount: edge - 1n, limit: loose, u, mid: P });
    check('S8 book had room: gross-cap > amount', String(await grossCap(P, loose) > edge), 'true');
    check('S8 jing-cap u0, AMMs took it', `${x.p['jing-cap']} ${x.f['dlmm-in']}`, `0 ${edge - 1n}`);
    x = await smart(`S8 size ${edge}: net == min-dep -> book leg`, sellX, taker, { amount: edge, limit: loose, u, mid: P });
    check('S8 jing-cap == amount, book filled', `${x.p['jing-cap']} ${x.f['jing-ok']}`, `${edge} true`);
    await clear();
    await place(worth(sellX ? 10_000n : 25_000_000n));
    const wrongMid = sellX ? P / 2n : P * 2n;
    const gcWrong = await grossCap(wrongMid, loose), gcRight = await grossCap(P, loose);
    const a9 = sellX ? 30_000n : 80_000_000n;
    check('S9 fixture: the wrong hint doubles the capacity, the real one cannot fill it', String(gcWrong > gcRight && minB(gcWrong, a9) > gcRight), 'true');
    x = await smart('S9 wrong mid hint: book leg over the real capacity, FOK refused, all on the AMMs', sellX, taker, { amount: a9, limit: loose, u, mid: wrongMid });
    check('S9 jing-cap = min(amount, hinted cap) > 0, jing-ok false, maker untouched', `${x.p['jing-cap']} ${x.f['jing-ok']}`, `${minB(gcWrong, a9)} false`);
    await ev('S9 the maker rests unchanged', MARKET, `(get-token-${ms}-deposit (var-get current-cycle) '${maker})`, `u${worth(sellX ? 10_000n : 25_000_000n)}`);
    await clear();
  }
}

// ============================================================ session 2 ==
async function minTaker() {
  console.log('\n######## SESSION 2: min-taker (sBTC seller, own side full) ########');
  await deployAll();
  sims.push(H.sid);
  await initMarket();
  const stamp = await forkClock();
  const u = await printAfter(stamp);
  const P = u.mid;
  const at = (k) => P * BigInt(k) / 1000n;
  const taker = mk(831), W1 = mk(832), W2 = mk(833), Q = mk(834), keeper = mk(835);
  await fund('x', taker, 1_000_000n);
  await fund('y', W1, 5_000_000n); await fund('y', W2, 4_000_000n); await fund('x', Q, 2_000n);
  // the capacity suite's `fin` fixture: bids W1 / W2 under the mid (walk makers), one in-range ask Q
  await tx('W1 bid 5 STX at 99% of the mid', W1, MARKET, 'deposit-token-y', [uintCV(5_000_000n), uintCV(at(990)), noneCV(), traits.y, assets.y], '(ok u5000000)');
  await tx('W2 bid 4 STX at 98% of the mid', W2, MARKET, 'deposit-token-y', [uintCV(4_000_000n), uintCV(at(980)), noneCV(), traits.y, assets.y], '(ok u4000000)');
  await tx('Q ask 2000 sats at 99% of the mid (pending)', Q, MARKET, 'deposit-token-x', [uintCV(2_000n), uintCV(at(990)), noneCV(), traits.x, assets.x], '(ok u2000)');
  await tx('keeper settles Q with a later print', keeper, MARKET, 'settle-token-x-deposit', [principal(Q), update(u), traits.x, assets.x], '(ok u2000)');
  await tx('ladder: 49 band seats', DEP, LADDER, 'set-max-band-per-side', [uintCV(49n)], '(ok true)');
  await tx('market: sync seats -> 49 reserved', DEP, MARKET, 'sync-seat-count', [], '(ok u49)');
  await ev('the x side is full for the taker', MARKET, `(side-full-x (get-token-x-depositors (var-get current-cycle)) '${taker})`, 'true');
  const limit = at(950);
  const cap = fields(await evRaw(MARKET, `(get-taker-capacity u${P} u${limit} true '${taker} (some 0x${u.hex.replace(/^0x/, '')}))`));
  check('get-taker-capacity: min-taker = Q + 1, admitted (walk > smallest)', `${cap['min-taker']} ${cap['gross-cap'] > 0n}`, '2001 true');
  // net = size * 10000 / 10020: 1500 -> 1497 (>= 1000, < 2001); 2600 -> 2594 (>= 2001)
  let x = await smart('M1 net 1497: over min-dep, under min-taker -> no book leg', true, taker, { amount: 1_500n, limit, u, mid: P });
  check('M1 jing-cap u0 although gross-cap > amount', `${x.p['jing-cap']} ${cap['gross-cap'] > 1_500n}`, '0 true');
  await ev('M1 Q still rests, the book untouched', MARKET, `(list (get-token-x-deposit (var-get current-cycle) '${Q}) (get-token-y-deposit (var-get current-cycle) '${W1}))`, '(list u2000 u5000000)');
  const size2 = minB(2_600n, cap['gross-cap']);
  x = await smart('M2 net 2594: over min-taker -> book leg', true, taker, { amount: 2_600n, limit, u, mid: P });
  check('M2 jing-cap == min(amount, gross-cap), book filled', `${x.p['jing-cap']} ${x.f['jing-ok']}`, `${size2} true`);
}

// ============================================================ session 3 ==
async function edges() {
  console.log('\n######## SESSION 3: DLMM fees 0 and the +/-500 edges ########');
  await deployAll();
  sims.push(H.sid);
  const P = uint(await evRaw(ROUTER, `(let ((p (unwrap-panic (contract-call? DLMM_POOL get-pool)))) (/ (* PRICE_SCALE DLMM_PRICE_SCALE) (unwrap-panic (contract-call? DLMM_CORE get-bin-price (get initial-price p) (get bin-step p) (get active-bin-id p)))))`));
  console.log(`DLMM active-bin price as a router limit: ${P}`);
  const TX = mk(841), TY = TX;
  await fund('x', TX, 3_000_000_000n);
  await fund('y', TX, 100_000_000n);
  await fund('y', DLMM_ADMIN, 10n);
  const active = async () => Number((await evRaw(ROUTER, '(get active-bin-id (unwrap-panic (contract-call? DLMM_POOL get-pool)))')));

  console.log('E1 fees 0 (Bitflow DLMM admin, impersonated)');
  await tx('DLMM admin sets x fees 0 / 0', DLMM_ADMIN, DLMM_CORE, 'set-x-fees', [principal(DLMM_POOL), uintCV(0n), uintCV(0n)], '(ok true)');
  await tx('DLMM admin sets y fees 0 / 0', DLMM_ADMIN, DLMM_CORE, 'set-y-fees', [principal(DLMM_POOL), uintCV(0n), uintCV(0n)], '(ok true)');
  await ev('pool fees now all 0', ROUTER, '(let ((p (unwrap-panic (contract-call? DLMM_POOL get-pool)))) (list (get x-protocol-fee p) (get x-provider-fee p) (get x-variable-fee p) (get y-protocol-fee p) (get y-provider-fee p) (get y-variable-fee p)))', '(list u0 u0 u0 u0 u0 u0)');
  let x = await smart('E1 fee 0, sBTC seller, update none', true, TX, { amount: 5_000n, limit: P / 2n, mid: P });
  check('E1 DLMM took it at fee 0', String(x.f['dlmm-in']), '5000');
  x = await smart('E1 fee 0, STX seller, update none', false, TY, { amount: 20_000_000n, limit: P * 2n, mid: P });
  check('E1 DLMM took it at fee 0', String(x.f['dlmm-in']), '20000000');

  console.log('E2 push the pool to bin +500 with manual DLMM legs (sBTC sales)');
  let partial = 0;
  for (let i = 0; i < 12 && (await active()) < 500; i++) {
    const amount = 500_000_000n;
    const w0 = await wallet(TX);
    const r = await tx(`E2 manual DLMM leg, ${amount} sats`, TX, ROUTER, manualFn(true), manualArgs({ amount, a: [amount, 0n, 0n] }), (v) => v.startsWith('(ok'));
    const w1 = await wallet(TX);
    check('E2 wallet: sBTC debit == dlmm-in, unsold == amount - dlmm-in, STX gain == out', `${w0.x - w1.x} ${r.f.unsold} ${w1.y - w0.y}`, `${r.f['dlmm-in']} ${amount - r.f['dlmm-in']} ${r.f.out}`);
    if (r.f['dlmm-in'] < amount) partial++;
    console.log(`  active bin now ${await active()}`);
  }
  check('E2 the pool reached bin 500', String(await active()), '500');
  check('E2 at least one partial DLMM fill (in < amount, the rest unsold in the wallet)', String(partial > 0), 'true');
  await ev('E2 the walk from 500 up keeps bin 500 and stops (edge)', ROUTER,
    `(let ((r (fold dlmm-bin-step DLMM_WALK_BINS { bin: 500, up: true, threshold: u999999999999999999999, initial-price: (get initial-price (unwrap-panic (contract-call? DLMM_POOL get-pool))), bin-step: u15, fee: u0, cap: u0, done: false })))
      (and (get done r) (is-eq (get bin r) 500)))`, 'true');
  x = await smart('E2 smart sBTC sale at bin 500, loosest limit: the walk hits the +500 edge', true, TX, { amount: 10_000n, limit: P / 100n, mid: P });
  check('E2 dlmm-cap == bin 500 only', String(x.p['dlmm-cap']), String(x.pre.d));

}

async function main() {
  const sha0 = shas();
  console.log('sha256 at start:', JSON.stringify(sha0));
  await routes();
  await minTaker();
  await edges();
  const sha1 = shas();
  console.log('sha256 at end:', JSON.stringify(sha1));
  check('sources unchanged during the run', JSON.stringify(sha1), JSON.stringify(sha0));
  console.log(`${H.passed}/${H.checks} checks green`);
  for (const s of sims) console.log(`Sim: https://stxer.xyz/simulations/mainnet/${s}`);
}
main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; });
