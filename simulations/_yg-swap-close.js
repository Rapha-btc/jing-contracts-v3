// _yg-swap-close.js - group SC (swap-close) for the four yguazu-mm-loop vaults,
// called from _yg-loop-engine.js and _yg-loop-usdcx-engine.js before group K
// (K moves the fork clock +25 h, after which no Lazer update is fresh).
//
// A fresh vault (owner mk(seed + 5), same keeper) builds real inventory: sell
// into one rung, a taker fills that rung fully, claim books it. swap-close then
// spends the open proceeds (got side) through the live router
// (swap-router-sbtc-{stx,usdcx}-jing-v5-6):
//   floor side (sell-stx, sell-usdcx): sells sBTC, realized price
//     p = out x 1e10 / sats-in, in the money when out x 1e10 >= floor x sats-in
//   cap side (sell-sbtc, sell-sbtc-usdcx): buys sBTC, realized price
//     p = in x 1e10 / sats-out, in the money when in x 1e10 <= cap x sats-out
// The AMM leg (STX pair: Bitflow xyk; USDCx pair: DLMM, the only venue that
// router has) is pushed with whale swaps to put the router on either side of
// the floor/cap. Pushing sBTC UP on the USDCx DLMM costs USDCx (whale ~25k), so
// the push that only dumps sBTC always runs second: floor side runs the
// favorable phase first, cap side the adverse phase first.
//   S6  stranger -> NOT_AUTHORIZED; keeper while paused -> PAUSED; zero amount;
//       amount > inventory; owner min-out above the router's output -> router
//       ERR_MIN_OUT u3002; nothing moves in any of them
//   S2  keeper at a worse price (AMM leg) -> ERR_BELOW_FLOOR / ERR_ABOVE_CAP,
//       nothing moves
//   S3  owner at a loss (stop-loss) -> ok, in-the-money false, closes pro rata
//   SJ  Jing leg (oracle update): keeper jing-only, then owner with the same
//       split: the keeper result must match the realized-price rule
//   S1  keeper at a better price -> ok, in-the-money true; balances and
//       inventory move as a buy-back fill would, VWAP of the rest within 1 unit
//   S5  buy-back resting on the market, vault balance < amount -> swap-close
//       cancels it and proceeds
//   S5b buy-back resting, vault balance >= amount -> still cancelled first,
//       so the Jing leg is not blocked; Jing + fallback take the full amount
//   S7  a close that trades nothing is refused (ZERO_AMOUNT), nothing moves
//   S4  partial close, then the rest: pro rata, then reset below dust; then
//       NO_INVENTORY
import { uintCV, someCV, noneCV, boolCV, tupleCV, deserializeCV } from '@stacks/transactions';
import {
  BPS, SCALE, P_, mk, S, show, setGroup, check, must, note, evalIn, call, tx, E, OK, prints, plain, deploy,
} from './_yg-loop-common.js';

const STRIP = (s) => s.split('.')[1];

export async function swapCloseGroup(c) {
  const { cfg, src, MARKET, KEEPER, STRANGER, bal, fund, fundStx, forceFill, settlePending, freshUpd, updCV, pair } = c;
  const { sold, got } = cfg;
  const floorSide = cfg.capIsFloor;          // got = sBTC, close sells sBTC
  const OWN = mk(cfg.seed + 5);
  const SV = `${OWN}.${cfg.name}`;
  const ROUTER = pair.ROUTER;
  const e = (k) => E(cfg.errBase + k);
  const ERR = { NOT_AUTH: 2, PAUSED: 4, ZERO: 6, NO_INV: 8, OVER_INV: 9, PRICE: 12 };
  const invGot = c.invGot, invSold = c.invSold;
  const yk = pair.yKey;                        // 'stx' | 'usdcx'
  const inKey = floorSide ? 'sats-in' : `${yk}-in`;
  const outKey = floorSide ? `${yk}-out` : 'sats-out';
  const capKey = floorSide ? 'floor' : 'cap';
  const errName = floorSide ? 'ERR_BELOW_FLOOR' : 'ERR_ABOVE_CAP';
  const fn = floorSide ? pair.sellX : pair.sellY;
  const state = () => evalIn(SV, '(get-state)');
  const onMarket = async () => (await state())[cfg.onMarketKey];
  // realized price (y per sat x 1e10) and the exact in-the-money rule
  const priceOf = (inAmt, outAmt) => floorSide ? (inAmt === 0n ? 0n : outAmt * SCALE / inAmt) : (outAmt === 0n ? 0n : inAmt * SCALE / outAmt);
  const itmOf = (inAmt, outAmt, cap) => floorSide ? outAmt * SCALE >= cap * inAmt : inAmt * SCALE <= cap * outAmt;
  const marginOk = (p, cap, wantItm, m = 40n) => floorSide
    ? (wantItm ? p * BPS >= cap * (BPS + m) : p * BPS <= cap * (BPS - m))
    : (wantItm ? p * BPS <= cap * (BPS - m) : p * BPS >= cap * (BPS + m));
  const zero3 = { dlmm: 0n, xyk: 0n, velar: 0n };
  const t3 = (o) => tupleCV({ dlmm: uintCV(o.dlmm), xyk: uintCV(o.xyk), velar: uintCV(o.velar) });
  const ammSplit = (amt) => ({ ...zero3, [pair.venue]: amt });
  // jing limit: willing to trade up to 3% through mid (the realized price is the rule)
  const jingLimit = () => floorSide ? S.MID * (BPS - 300n) / BPS : S.MID * (BPS + 300n) / BPS;
  function args({ amount, jing = 0n, amm = zero3, fallback = null, minOut = 0n }) {
    return [uintCV(amount), uintCV(jing), uintCV(jing > 0n ? jingLimit() : (S.MID || 1n)),
      jing > 0n ? someCV(updCV()) : noneCV(), fallback === null ? noneCV() : someCV(uintCV(fallback)),
      t3(amm), t3(zero3), uintCV(minOut)];
  }
  const routerPrint = (receipt) => (receipt?.events ?? []).map((x) => typeof x === 'string' ? JSON.parse(x) : x)
    .filter((x) => x.committed !== false && x.contract_event)
    .map((x) => { try { return plain(deserializeCV(x.contract_event.raw_value)); } catch { return null; } })
    .find((p) => p && typeof p.topic === 'string' && p.topic.startsWith('swap-'));
  const rpAmt = (rp, k) => (rp && typeof rp[k] === 'bigint' ? rp[k] : 0n);
  const snap = async () => ({ x: await bal('x', SV), y: await bal('y', SV), st: show(await state()) });
  // floor side: quote = what selling `amt` sats gives; cap side: what spending `amt` y gives
  async function quote(amt) {
    const out = await pair.quote(floorSide, amt);
    return { out, p: priceOf(amt, out) };
  }

  // one swap-close call + every accounting check; returns the result tuple
  async function close(label, sender, a, want = 'ok') {
    const pre = await state();
    const g0 = await bal(got, SV), s0 = await bal(sold, SV);
    const r = await call(sender, SV, 'swap-close', args(a));
    const res = r.res;
    const isOk = !r.vm && res?.ok !== undefined;
    if (want !== 'ok' && !(want.orOk && isOk)) {
      check(`${label} -> ${want.name}`, !r.vm && want.fn(res), r.vm ? `VM ${show(r.vm)}` : show(res));
      return { res, receipt: r.receipt };
    }
    if (!check(`${label} -> ok`, isOk, r.vm ? `VM ${show(r.vm)}` : show(res))) return { res, receipt: r.receipt };
    const v = res.ok, inAmt = v[inKey], outAmt = v[outKey];
    const post = await state();
    const g1 = await bal(got, SV), s1 = await bal(sold, SV);
    const rp = routerPrint(r.receipt);
    console.log(`  ${label}: ${inKey} ${inAmt}, ${outKey} ${outAmt}, price ${priceOf(inAmt, outAmt)} vs ${capKey} ${pre[cfg.capFn]} (${fmtBps(priceOf(inAmt, outAmt), pre[cfg.capFn])} bps); router ${show(rp && { 'jing-ok': rp['jing-ok'], 'jing-in': rp['jing-in'], 'jing-out': rp['jing-out'], 'dlmm-in': rp['dlmm-in'], 'xyk-in': rp['xyk-in'], unsold: rp.unsold, out: rp.out })}`);
    check(`${label}: result = vault balance deltas (${got} -${inAmt}, ${sold} +${outAmt})`, g0 + (pre[cfg.onMarketKey] - post[cfg.onMarketKey]) - g1 === inAmt && s1 - s0 === outAmt, show({ g0, g1, s0, s1, onMkt: [pre[cfg.onMarketKey], post[cfg.onMarketKey]] }));
    check(`${label}: in-the-money = exact rule vs ${capKey} ${pre[cfg.capFn]}`, v['in-the-money'] === itmOf(inAmt, outAmt, pre[cfg.capFn]), show(v));
    const ev = prints(r.receipt).find((p) => p.event === 'yg-swap-close');
    check(`${label}: print yg-swap-close matches the result`, ev && ev[inKey] === inAmt && ev[outKey] === outAmt && ev[capKey] === pre[cfg.capFn] && ev['in-the-money'] === v['in-the-money'] && ev.caller === sender && ev['vwap-sell'] === post['vwap-sell'], show(ev));
    if (rp) check(`${label}: router out = ${outKey}`, rp.out === outAmt, `${rp.out} vs ${outAmt}`);
    // inventory: what a buy-back fill of the same size does (reconcile-inner)
    const open0 = pre[invGot], oth0 = pre[invSold];
    const have = post[cfg.heldGotKey] + post[cfg.onMarketKey];
    let want2;
    if (have >= open0) want2 = [open0, oth0];
    else if (have < cfg.resetDust) want2 = [0n, 0n];
    else want2 = [have, oth0 - oth0 * (open0 - have) / open0];
    check(`${label}: inventory = pro-rata reconcile (open ${open0} -> ${want2[0]}, other ${oth0} -> ${want2[1]})`, post[invGot] === want2[0] && post[invSold] === want2[1], show({ got: post[invGot], oth: post[invSold], want: want2 }));
    check(`${label}: inventory closed = ${got} spent (no untracked extra in this vault)`, want2[0] === 0n || open0 - post[invGot] === inAmt, `${open0 - post[invGot]} vs ${inAmt}`);
    if (want2[0] > 0n && post[invGot] < open0) {
      const stricter = floorSide ? post['vwap-sell'] >= pre['vwap-sell'] : post['vwap-sell'] <= pre['vwap-sell'];
      const bracket = floorSide ? (post[invSold] - 1n) * SCALE / post[invGot] <= pre['vwap-sell'] : post[invGot] * SCALE / (post[invSold] - 1n) >= pre['vwap-sell'];
      check(`${label}: VWAP of the rest unchanged within 1 unit, rounded the strict way (${pre['vwap-sell']} -> ${post['vwap-sell']})`, stricter && bracket, `${pre['vwap-sell']} -> ${post['vwap-sell']}`);
    }
    return { v, inAmt, outAmt, pre, post, rp, receipt: r.receipt };
  }
  async function nothingMoved(label, fnc) {
    const a = await snap();
    const r = await fnc();
    const b = await snap();
    check(`${label}: nothing moved (vault balances + state)`, show(a) === show(b), show({ a, b }));
    return r;
  }
  // push the AMM leg until a quote for `amt` sits on the wanted side of the
  // floor/cap by >= 40 bps; the whale chunk grows by pair.grow each round
  async function pushTo(wantItm, amt, label) {
    const cap = (await state())[cfg.capFn];
    let q = await quote(amt), chunk = null, i = 0;
    console.log(`  ${label}: quote ${q.p} vs ${capKey} ${cap} (${fmtBps(q.p, cap)} bps), want ${wantItm ? 'better' : 'worse'}`);
    // sBTC up = better for the floor side, worse for the cap side
    const up = floorSide === wantItm;
    while (!marginOk(q.p, cap, wantItm) && i++ < 24) {
      chunk = chunk === null ? pair.chunk[up ? 'up' : 'down'] : chunk * pair.grow[up ? 'up' : 'down'];
      const r = await pair.push(up, chunk);
      check(`${label}: whale pushes sBTC ${up ? 'up' : 'down'} (${chunk})`, !r.vm && r.res?.ok !== undefined, r.vm ? show(r.vm) : show(r.res));
      q = await quote(amt);
      console.log(`    quote now ${q.p} (${fmtBps(q.p, cap)} bps vs ${capKey})`);
    }
    must(`${label}: router AMM quote for ${amt} is ${wantItm ? 'better' : 'worse'} than the ${capKey} by >= 40 bps`, marginOk(q.p, cap, wantItm), `${q.p} vs ${cap}`);
    note(`${cfg.side} SC ${label}: AMM ${pair.venue} quote ${q.p} vs ${capKey} ${cap} (${fmtBps(q.p, cap)} bps)${chunk === null ? ', no push needed' : ''}`);
    return q;
  }

  setGroup('SC swap-close');
  // ---- inventory
  await fundStx(OWN, 5_000_000n);
  await deploy(OWN, cfg.name, src);
  await tx('SC owner set-keeper(keeper)', OWN, SV, 'set-keeper', [someCV(P_(KEEPER))], { ok: true });
  const R = c.RUNG(cfg.scBand);
  const members = (await evalIn(R, '(get-state)')).members;
  if (members !== 0n) note(`${cfg.side} SC: ${STRIP(R)} has ${members} members`);
  await fund(sold, SV, cfg.scSell);
  await tx(`SC keeper sell ${cfg.scSell} into ${STRIP(R)}`, KEEPER, SV, 'sell', [P_(R), uintCV(cfg.scSell)], { ok: cfg.scSell });
  await settlePending(sold, R, 'SC rung');
  const ff = await forceFill(sold, R, 1, `SC fill ${STRIP(R)} fully`, { full: true });
  must('SC rung filled', !!ff);
  await tx(`SC keeper claim(${STRIP(R)})`, KEEPER, SV, 'claim', [P_(R)], OK);
  if ((await evalIn(SV, `(get-rung-principal '${R})`)) > 0n) {
    await freshUpd();
    await tx(`SC keeper rung-withdraw the unfilled rest of ${STRIP(R)}`, KEEPER, SV, 'rung-withdraw', [P_(R), uintCV(10n ** 15n), someCV(updCV())], OK);
  }
  let st = await state();
  const I = st[invGot];
  must(`SC inventory booked (${invGot} ${I}, ${invSold} ${st[invSold]}, vwap ${st['vwap-sell']}, ${cfg.capFn} ${st[cfg.capFn]})`, I > 0n && st[invSold] > 0n && st[cfg.heldGotKey] >= I, show(st));
  await freshUpd(true);
  note(`${cfg.side} SC inventory: ${I} ${got} for ${st[invSold]} ${sold}, vwap ${st['vwap-sell']} vs mid ${S.MID} (${fmtBps(st['vwap-sell'], S.MID)} bps), ${capKey} ${st[cfg.capFn]}`);
  const A = I / 8n;

  // ---- S6 guards (no price dependence)
  await nothingMoved('S6 stranger', () => close('S6 stranger swap-close', STRANGER, { amount: A, amm: ammSplit(A) }, { name: 'NOT_AUTHORIZED', fn: e(ERR.NOT_AUTH) }));
  await tx('S6 owner pause', OWN, SV, 'set-paused', [boolCV(true)], { ok: true });
  await nothingMoved('S6 paused', () => close('S6 keeper swap-close while paused', KEEPER, { amount: A, amm: ammSplit(A) }, { name: 'PAUSED', fn: e(ERR.PAUSED) }));
  await tx('S6 owner unpause', OWN, SV, 'set-paused', [boolCV(false)], { ok: true });
  await nothingMoved('S6 zero', () => close('S6 keeper swap-close 0', KEEPER, { amount: 0n }, { name: 'ZERO_AMOUNT', fn: e(ERR.ZERO) }));
  await nothingMoved('S6 over', () => close(`S6 keeper swap-close inventory + 1 (${I + 1n})`, KEEPER, { amount: I + 1n, amm: ammSplit(I + 1n) }, { name: 'OVER_INVENTORY', fn: e(ERR.OVER_INV) }));
  {
    const q = await quote(A);
    await nothingMoved('S6 min-out', () => close(`S6 owner swap-close ${A} with min-out 2 x quote (${q.out * 2n})`, OWN, { amount: A, amm: ammSplit(A), minOut: q.out * 2n }, { name: 'router ERR_MIN_OUT u3002', fn: E(3002) }));
  }

  async function adverse() {
    await pushTo(false, A, 'adverse');
    // S2: keeper at a worse price
    await nothingMoved('S2', () => close(`S2 keeper swap-close ${A} via ${pair.venue} at a worse price`, KEEPER, { amount: A, amm: ammSplit(A) }, { name: `${errName} u${cfg.errBase + ERR.PRICE}`, fn: e(ERR.PRICE) }));
    // S3: owner stop-loss
    const s3 = await close(`S3 owner swap-close ${A} via ${pair.venue} at a loss (stop-loss)`, OWN, { amount: A, amm: ammSplit(A) });
    if (s3.v) check('S3 in-the-money false (owner closed at a loss)', s3.v['in-the-money'] === false && s3.inAmt > 0n, show(s3.v));
  }
  async function jingLeg() {
    // SJ: the Jing leg alone (fallback none), keeper first, then the owner with
    // the same split. A maker seeds the opposite side first, sized past every
    // order already on it, so the vault's taker order clears in full.
    await freshUpd(true);
    const o = floorSide ? 'y' : 'x';
    const cyc = await evalIn(MARKET, '(get-current-cycle)');
    const tot = await evalIn(MARKET, `(get-cycle-totals u${cyc})`);
    const MAKER = mk(cfg.seed + 6);
    const seed = floorSide
      ? (tot['total-token-x'] + 6n * A) * S.MID / SCALE + 2_000_000n
      : (tot['total-token-y'] + 6n * A) * SCALE / S.MID + 2_000n;
    const lim = floorSide ? S.MID * (BPS + 500n) / BPS : S.MID * (BPS - 500n) / BPS;
    await fundStx(MAKER, 2_000_000n);
    await fund(o, MAKER, seed);
    await tx(`SJ maker deposit-token-${o} ${seed} (limit ${lim}, crosses mid) as Jing liquidity`, MAKER, MARKET, `deposit-token-${o}`, [uintCV(seed), uintCV(lim), noneCV(), c.T[o], c.A[o]], { ok: seed });
    await settlePending(o, MAKER, 'SJ maker');
    await freshUpd(true);
    const a = { amount: A, jing: A };
    const pre = await snap();
    const k = await close(`SJ keeper swap-close ${A} jing-only (update, fallback none)`, KEEPER, a, { name: errName, fn: e(ERR.PRICE), orOk: true });
    if (k.v) {
      check('SJ keeper ok: the Jing leg traded and the realized price is in the money', k.rp?.['jing-ok'] === true && k.rp['jing-in'] > 0n && k.v['in-the-money'] === true, show({ v: k.v, rp: k.rp }));
      note(`${cfg.side} SC SJ: keeper Jing leg in the money: ${k.inAmt} -> ${k.outAmt}, price ${priceOf(k.inAmt, k.outAmt)} vs ${capKey} ${k.pre[cfg.capFn]} (${fmtBps(priceOf(k.inAmt, k.outAmt), k.pre[cfg.capFn])} bps)`);
    } else {
      check('SJ keeper refused: nothing moved', show(pre) === show(await snap()));
      const ow = await close(`SJ owner swap-close ${A} jing-only (same split, same update)`, OWN, a);
      if (ow.v) {
        check('SJ owner: the Jing leg traded (jing-ok, jing-in > 0)', ow.rp?.['jing-ok'] === true && ow.rp['jing-in'] > 0n, show(ow.rp));
        check(`SJ the keeper's ${errName} was right: the realized Jing price is out of the money`, ow.v['in-the-money'] === false, show(ow.v));
        note(`${cfg.side} SC SJ: Jing leg realized ${priceOf(ow.inAmt, ow.outAmt)} vs ${capKey} ${ow.pre[cfg.capFn]} (${fmtBps(priceOf(ow.inAmt, ow.outAmt), ow.pre[cfg.capFn])} bps) -> keeper ${errName}, owner ok`);
      }
    }
  }
  async function favorable() {
    await pushTo(true, A, 'favorable');
    // S1: keeper take-profit
    const s1 = await close(`S1 keeper swap-close ${A} via ${pair.venue} at a better price`, KEEPER, { amount: A, amm: ammSplit(A) });
    if (s1.v) check('S1 in-the-money true', s1.v['in-the-money'] === true && s1.inAmt === A, show(s1.v));
    // S5: the whole open side resting on the market, vault holds < amount
    st = await state();
    const restAmt = st[invGot] - st[cfg.onMarketKey];
    await tx(`S5 keeper buy-back all ${restAmt} (spread 30)`, KEEPER, SV, 'buy-back', [uintCV(restAmt), uintCV(30n)], OK);
    await settlePending(got, SV, 'S5 buy-back');
    st = await state();
    must(`S5 buy-back resting (${cfg.onMarketKey} ${st[cfg.onMarketKey]}), vault holds ${st[cfg.heldGotKey]} < ${A}`, st[cfg.onMarketKey] === restAmt && st[cfg.heldGotKey] < A, show(st));
    const s5 = await close(`S5 keeper swap-close ${A} with the buy-back resting`, KEEPER, { amount: A, amm: ammSplit(A) });
    if (s5.v) {
      check('S5 the buy-back was cancelled back into the vault (nothing left on the market)', s5.post[cfg.onMarketKey] === 0n && !(await evalIn(MARKET, `(get-token-${got}-pending-deposit '${SV})`)), show(s5.post));
      check('S5 vault holds what was on the market + held - spent', s5.post[cfg.heldGotKey] === s5.pre[cfg.heldGotKey] + s5.pre[cfg.onMarketKey] - s5.inAmt, show({ pre: s5.pre[cfg.heldGotKey], on: s5.pre[cfg.onMarketKey], post: s5.post[cfg.heldGotKey] }));
      check('S5 in-the-money true', s5.v['in-the-money'] === true);
    }
    // S5b: buy-back resting, vault holds >= amount: swap-close still pulls it
    // back first, so the Jing leg is free to run (fallback covers the rest)
    st = await state();
    const half = st[invGot] / 2n;
    await tx(`S5b keeper buy-back ${half} (vault keeps ${st[invGot] - half} >= ${A})`, KEEPER, SV, 'buy-back', [uintCV(half), uintCV(30n)], OK);
    await settlePending(got, SV, 'S5b buy-back');
    await freshUpd(true);
    const s5bArgs = { amount: A, jing: A, fallback: pair.venueId };
    const s5bPre = await snap();
    let s5b = await close(`S5b keeper swap-close ${A}, jing-amount ${A}, fallback ${pair.venue}, buy-back resting`, KEEPER, s5bArgs, { name: errName, fn: e(ERR.PRICE), orOk: true });
    if (!s5b.v) {
      check('S5b keeper refused on price: nothing moved, buy-back still resting', show(s5bPre) === show(await snap()));
      s5b = await close(`S5b owner swap-close ${A} (same split), buy-back resting`, OWN, s5bArgs);
    }
    if (s5b.v) {
      check('S5b the resting buy-back was pulled back first (nothing left on the market)', s5b.post[cfg.onMarketKey] === 0n, show(s5b.post));
      check(`S5b the Jing leg was not blocked by a resting position; Jing + ${pair.venue} took all ${A}`, (rpAmt(s5b.rp, 'jing-in') + rpAmt(s5b.rp, `${pair.venue}-in`)) === A, show(s5b.rp));
      note(`${cfg.side} SC S5b: buy-back resting + balance >= amount -> pulled back first; jing-ok ${s5b.rp?.['jing-ok']}, jing-in ${rpAmt(s5b.rp, 'jing-in')}, ${pair.venue}-in ${rpAmt(s5b.rp, `${pair.venue}-in`)}`);
    }
    if ((await onMarket()) > 0n) await tx('S5b keeper cancel-buy-back', KEEPER, SV, 'cancel-buy-back', [], OK);
    // S7: a close that trades nothing (no Jing, no AMM, no fallback) is refused
    st = await state();
    if (st[invGot] > 0n) {
      const amt = st[invGot] < A ? st[invGot] : A;
      await nothingMoved('S7a empty split', () => close(`S7a owner swap-close ${amt} with an empty split`, OWN, { amount: amt }, { name: 'router refuses (u3004)', fn: E(3004) }));
      const s7Pre = await snap();
      const s7 = await close(`S7b owner swap-close ${amt} jing-only, no fallback`, OWN, { amount: amt, jing: amt }, { name: 'ZERO_AMOUNT', fn: e(ERR.ZERO), orOk: true });
      if (s7.v) note(`${cfg.side} SC S7b: the Jing leg traded (${s7.inAmt} -> ${s7.outAmt}), so the zero-trade guard was not reached`);
      else check('S7b nothing came back -> ZERO_AMOUNT, nothing moved', show(s7Pre) === show(await snap()));
    }
  }
  async function drain(caller, nm) {
    // S4: partial, then the rest -> reset. The owner (adverse phase, AMM pushed
    // thin) routes through the Jing leg with the AMM as fallback; the keeper
    // (favorable phase) takes the pushed AMM.
    const split = (amt) => caller === OWN ? { amount: amt, jing: amt, fallback: pair.venueId } : { amount: amt, amm: ammSplit(amt) };
    await freshUpd(true);
    st = await state();
    if (st[cfg.onMarketKey] > 0n) await tx('S4 cancel the resting buy-back first', KEEPER, SV, 'cancel-buy-back', [], OK);
    st = await state();
    const P = st[invGot] / 2n;
    must(`S4 half of the rest (${P}) is above dust ${cfg.resetDust}`, P >= cfg.resetDust, `${P}`);
    const p1 = await close(`S4 ${nm} swap-close ${P} (partial)`, caller, split(P));
    if (p1.v) check('S4 partial: inventory reduced, not reset', p1.post[invGot] > 0n && p1.post[invGot] < p1.pre[invGot] && !prints(p1.receipt).some((p) => p.event === 'yg-inventory-reset'), show(p1.post));
    st = await state();
    const rest = st[invGot];
    const p2 = await close(`S4 ${nm} swap-close the rest ${rest}`, caller, split(rest));
    if (p2.v) {
      const s = await state();
      check('S4 rest: inventory reset (both 0, vwap 0, floor/cap 0), print yg-inventory-reset', s[invGot] === 0n && s[invSold] === 0n && s['vwap-sell'] === 0n && s[cfg.capFn] === 0n && prints(p2.receipt).some((p) => p.event === 'yg-inventory-reset'), show(s));
      note(`${cfg.side} SC S4: after the reset the vault holds ${s[cfg.heldGotKey]} ${got} untracked (< dust ${cfg.resetDust})`);
    }
    await nothingMoved('S4 after reset', () => close('S4 keeper swap-close 1 after the reset', KEEPER, { amount: 1n, amm: ammSplit(1n) }, { name: 'NO_INVENTORY', fn: e(ERR.NO_INV) }));
  }

  if (floorSide) {
    await favorable();
    await adverse();
    await jingLeg();
    await drain(OWN, 'owner');
  } else {
    await adverse();
    await jingLeg();
    await favorable();
    await drain(KEEPER, 'keeper');
  }
}

const fmtBps = (num, den) => den === 0n ? 'n/a' : ((Number(num) / Number(den) - 1) * 1e4).toFixed(2);

// ------------------------------------------------------------- pairs ----
const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';

// sBTC/STX: Bitflow xyk leg; quote = the xyk-core math on live reserves
export function stxPair(WHALE) {
  const ROUTER = `${DEP}.swap-router-sbtc-stx-jing-v5-6`;
  const XYK_CORE = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-core-v-1-2';
  const XYK_POOL = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-pool-sbtc-stx-v-1-1';
  const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
  return {
    ROUTER, yKey: 'stx', sellX: 'swap-sbtc-for-stx', sellY: 'swap-stx-for-sbtc', venue: 'xyk', venueId: 2n,
    chunk: { up: 1_500_000_000n, down: 600_000n }, // 1,500 STX buys sBTC / 600,000 sats sold
    grow: { up: 2n, down: 2n },
    async quote(sellSbtc, amt) {
      const q = await evalIn(ROUTER, `(xyk-quote ${sellSbtc})`);
      const dx = amt * q.keep.num / q.keep.den;
      return q.reserves.out * dx / (q.reserves.in + dx);
    },
    push: (up, chunk) => up
      ? call(WHALE.y, XYK_CORE, 'swap-y-for-x', [P_(XYK_POOL), P_(SBTC), P_(WSTX), uintCV(chunk), uintCV(1n)])
      : call(WHALE.x, XYK_CORE, 'swap-x-for-y', [P_(XYK_POOL), P_(SBTC), P_(WSTX), uintCV(chunk), uintCV(1n)]),
  };
}

// sBTC/USDCx: DLMM leg (the router's only AMM venue); quote = the router's own
// dlmm-pick + dlmm-out; pushes go through DLMM pool 1 (the only one deep enough
// for dlmm-pick to weigh)
export function usdcxPair(WHALE) {
  const ROUTER = `${DEP}.swap-router-sbtc-usdcx-jing-v5-6`;
  const DLMM_ROUTER = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-2';
  const POOL = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-sbtc-usdcx-v-1-bps-10';
  const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
  return {
    ROUTER, yKey: 'usdcx', sellX: 'swap-sbtc-for-usdcx', sellY: 'swap-usdcx-for-sbtc', venue: 'dlmm', venueId: 1n,
    // pool 1's USDCx side is thin (~4k USDCx on 2026-11-17: 0.2 BTC drains it)
    chunk: { up: 2_000_000_000n, down: 1_000_000n }, // 2,000 USDCx buys sBTC / 0.01 BTC sold
    grow: { up: 2n, down: 1n }, // constant 0.01 BTC steps down: a larger one overshoots past the thin side
    quote: (sellSbtc, amt) => evalIn(ROUTER, `(dlmm-out (dlmm-pick ${sellSbtc} u${amt} u0) u${amt} ${sellSbtc} u0)`),
    push: (up, chunk) => up
      ? call(WHALE.y, DLMM_ROUTER, 'swap-y-for-x-simple-range-multi', [P_(POOL), P_(SBTC), P_(USDCX), uintCV(chunk), uintCV(1n), uintCV(230n), noneCV()])
      : call(WHALE.x, DLMM_ROUTER, 'swap-x-for-y-simple-range-multi', [P_(POOL), P_(SBTC), P_(USDCX), uintCV(chunk), uintCV(1n), uintCV(230n), noneCV()]),
  };
}
