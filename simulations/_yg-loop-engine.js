// _yg-loop-engine.js - one scenario, two mirrored sides:
//   verify-yguazu-mm-loop-sell-sbtc.js  (vault sells sBTC into jing-buy-stx-*)
//   verify-yguazu-mm-loop-sell-stx.js   (vault sells STX into jing-sell-stx-*)
// Token sides use the market's names: x = sBTC (sats), y = STX (uSTX).
// `sold` = what the vault sells into the rung, `got` = what the rung pays.
//   A  deploy (owner = deployer), keeper, funding
//   B  every one of the 10 RUNGS: sell / rung-remaining / zero claim / withdraw
//   C  rungs outside RUNGS (same trait) -> ERR_BAD_RUNG
//   D  auth + guards: owner-only paths, keeper vs stranger, pause, a sell above
//      the removed size cap now passes,
//      zero amount, no inventory, bad spread
//   E  leg 1: two forced partial fills on the 1 bps rung; keeper claim after
//      fill 1, owner rung-withdraw after fill 2; harness recomputes fill
//      price, VWAP and the cap/floor; maker fee + rebate measured
//   F  rung sold out -> rung epoch rolls -> claim books the old-epoch payout
//   G  leg 2: buy-back sits out beyond the cap/floor, reprice brings it in,
//      top-up, forced partial fill (fee + rebate measured), pro-rata
//      reconcile across a market cycle roll, cancel, re-post, full fill,
//      reset at dust
//   H  owner exits (withdraws only to owner) + two-step ownership handover
//   I  allowances: a variant of the vault with jing-*-stx-90 and the market
//      swapped for hostile contracts; every over-pull must abort
import { readFileSync } from 'node:fs';
import { uintCV, boolCV, someCV, noneCV } from '@stacks/transactions';
import {
  DEP, MARKET, SBTC, WHALE, BANDS, BPS, EDGE, SCALE, P_, T, A, mk, Stop, S, show,
  setGroup, check, must, note, startSim, evalIn, call, tx, E, OK, prints, matches,
  stxTransfer, sbtcTransfer, deploy, sbtcBal, stxBal, freshUpd, updCV, curCycle, summary,
} from './_yg-loop-common.js';

const MAX_UINT = 2n ** 128n - 1n;
const other = (t) => (t === 'x' ? 'y' : 'x');
const fmtBps = (num, den) => den === 0n ? 'n/a' : ((Number(num) / Number(den) - 1) * 1e4).toFixed(2);

export async function runSide(cfg) {
  const { sold, got } = cfg;
  const OWNER = mk(cfg.seed), KEEPER = mk(cfg.seed + 1), STRANGER = mk(cfg.seed + 2), NEW_OWNER = mk(cfg.seed + 3);
  let takerN = cfg.seed + 10;
  const VAULT = `${OWNER}.${cfg.name}`;
  const RUNG = (b) => `${DEP}.${cfg.rungPrefix}${b}`;
  const R1 = RUNG(1);
  const e = (k) => E(cfg.errBase + k);
  const ERR = { NOT_OWNER: 1, NOT_AUTH: 2, NOT_PENDING: 3, PAUSED: 4, BAD_RUNG: 5, ZERO: 6, NO_INV: 8, OVER_INV: 9, BAD_SPREAD: 10 };
  const invSold = sold === 'x' ? 'inv-sats' : 'inv-stx';
  const invGot = got === 'x' ? 'inv-sats' : 'inv-stx';
  const bal = (t, who) => (t === 'x' ? sbtcBal(who) : stxBal(who));
  const fund = (t, who, amt) => (t === 'x' ? sbtcTransfer(WHALE.x, who, amt) : stxTransfer(WHALE.y, who, amt));
  const state = () => evalIn(VAULT, '(get-state)');
  const rr = (r) => evalIn(VAULT, `(rung-remaining '${r})`);
  const rp = (r) => evalIn(VAULT, `(get-rung-principal '${r})`);
  const direct = async (r) => (await evalIn(r, `(get-position '${VAULT})`))[cfg.posKey];
  const limitAt = (t, who, mid) => evalIn(MARKET, `(token-${t}-limit-at '${who} u${mid})`);
  const depOf = (t, who) => evalIn(MARKET, `(get-token-${t}-deposit (get-current-cycle) '${who})`);
  const pendOf = (t, who) => evalIn(MARKET, `(get-token-${t}-pending-deposit '${who})`);
  const orderOf = (t, who) => evalIn(MARKET, `(get-token-${t}-order '${who})`);
  // stx-per-sat price (x 1e10) of a (sold, got) pair
  const px = (soldAmt, gotAmt) => sold === 'x' ? gotAmt * SCALE / soldAmt : soldAmt * SCALE / gotAmt;
  // cap (sbtc side): from the rounded-down VWAP. floor (stx side): rounded up
// in one step from the raw inventory (inv-stx * 1e10 * (1e4 + edge) / (inv-sats * 1e4)).
const capOf = (st, edge = EDGE) => {
    if (!cfg.capIsFloor) return st['vwap-sell'] * (BPS - edge) / BPS;
    const den = st['inv-sats'] * BPS;
    return den === 0n ? 0n : (st['inv-stx'] * SCALE * (BPS + edge) + den - 1n) / den;
  };
  const pegOf = (mid, sp) => cfg.capIsFloor ? mid * (BPS + sp) / BPS : mid * (BPS - sp) / BPS;
  const liveOf = (peg, cap) => cfg.capIsFloor ? (peg >= cap ? peg : MAX_UINT) : (peg <= cap ? peg : 0n);
  const inside = (p, cap) => cfg.capIsFloor ? p >= cap : p <= cap;   // price respects cap/floor
  const stricter = (post, pre) => cfg.capIsFloor ? post >= pre : post <= pre; // VWAP rounding direction
  const resting = (p) => p !== 0n && p !== MAX_UINT;

  async function settlePending(t, who, label) {
    if (await pendOf(t, who)) {
      await freshUpd();
      const r = await tx(`${label}: settle pending ${t} deposit`, KEEPER, MARKET, `settle-token-${t}-deposit`, [P_(who), updCV(), T[t], A[t]], OK);
      const ref = prints(r.receipt).find((p) => String(p.event).startsWith('pending-refund'));
      check(`${label}: pending not refunded at settle`, !ref, show(ref));
    }
  }

  // Force a fill of `maker`'s order on side s: a fresh taker deposits the
  // other token with limit = maker's live price, sized to sweep every better
  // order on side s plus `frac` of maker's. Returns measured numbers.
  async function forceFill(s, maker, frac, label, { full = false } = {}) {
    await freshUpd(true);
    const MID = S.MID;
    const our = await limitAt(s, maker, MID);
    if (!resting(our)) { note(`${label}: maker price not resting (${our}), fill skipped`); return null; }
    const cyc = await curCycle();
    const who = await evalIn(MARKET, `(get-token-${s}-depositors u${cyc})`);
    const better = (p) => resting(p) && (s === 'x' ? p < our : p > our);
    const conv = (d, p) => (s === 'x' ? d * p / SCALE : d * SCALE / p);
    let need = 0n, oursAmt = 0n;
    for (const w of who) {
      const p = await limitAt(s, w, MID);
      const d = await depOf(s, w);
      if (w === maker) oursAmt = conv(d, our);
      else if (better(p)) need += conv(d, p);
    }
    const o = other(s);
    const margin = full ? (o === 'x' ? 300n : 300_000n) : 0n;
    const net = need + (full ? oursAmt : oursAmt * BigInt(Math.round(frac * 1000)) / 1000n) + margin;
    const gross = net * (BPS + 20n) / BPS + 1n;
    const taker = mk(takerN++);
    console.log(`  ${label}: our ${s} price ${our} (mid ${MID}), better orders ${need}, ours ${oursAmt}, taker sends ${gross} ${o}`);
    await stxTransfer(WHALE.y, taker, o === 'y' ? gross + 2_000_000n : 2_000_000n);
    if (o === 'x') await sbtcTransfer(WHALE.x, taker, gross);
    const recvTok = o; // maker on side s receives the other token
    const b0 = await bal(recvTok, maker);
    const d0 = await depOf(s, maker);
    const c0 = cyc;
    const r = await call(taker, MARKET, 'swap', [uintCV(gross), uintCV(our), updCV(), T.x, A.x, T.y, A.y, boolCV(o === 'x')]);
    const okSwap = !r.vm && r.res?.ok !== undefined;
    check(`${label}: taker swap ${gross} ${o} -> ${s}, limit = maker price`, okSwap, r.vm ? show(r.vm) : show(r.res));
    if (!okSwap) return null;
    const b1 = await bal(recvTok, maker);
    const ms = matches(r.receipt).filter((m) => m.maker === maker);
    const sx = ms.reduce((a, m) => a + m['x-traded'], 0n), sy = ms.reduce((a, m) => a + m['y-traded'], 0n);
    const received = b1 - b0;
    const tradedRecv = recvTok === 'x' ? sx : sy;
    const c1 = await curCycle();
    const d1 = await depOf(s, maker);
    check(`${label}: maker filled at its own price (every match print price = ${our})`, ms.length > 0 && ms.every((m) => m.price === our), show(ms.map((m) => m.price)));
    const bps = fmtBps(received, tradedRecv);
    // per match: maker gets traded - floor(traded * 10 / 1e4) + floor(traded * 20 / 1e4)
    const expRecv = ms.reduce((a, m) => { const t = recvTok === 'x' ? m['x-traded'] : m['y-traded']; return a + t - t * 10n / BPS + t * 20n / BPS; }, 0n);
    console.log(`  ${label}: maker matched x ${sx} / y ${sy}; received ${received} ${recvTok} vs ${tradedRecv} at price -> ${bps} bps (fee -10, rebate +20 expected = +10); cycle ${c0} -> ${c1}; maker deposit ${d0} -> ${d1}`);
    return { our, sx, sy, received, tradedRecv, expRecv, bps, c0, c1, d0, d1, MID, receipt: r.receipt };
  }

  const src = readFileSync(new URL(`../contracts/rfq/${cfg.name}.clar`, import.meta.url), 'utf8');
  await startSim(R1);
  await freshUpd();

  // ---------------------------------------------------------------- A ----
  setGroup('A deploy + fund');
  await stxTransfer(WHALE.y, OWNER, 5_000_000n);
  await stxTransfer(WHALE.y, KEEPER, 1_000_000n);
  await stxTransfer(WHALE.y, STRANGER, 1_000_000n);
  await stxTransfer(WHALE.y, NEW_OWNER, 1_000_000n);
  await deploy(OWNER, cfg.name, src);
  const s0 = await state();
  must('owner = deployer, no keeper, not paused, empty inventory, edge 25, no size-cap field', s0.owner === OWNER && s0.keeper === null && s0.paused === false && s0['inv-stx'] === 0n && s0['inv-sats'] === 0n && s0['edge-bps'] === EDGE && !Object.keys(s0).some((k) => k.startsWith('max-sell')), show(s0));
  await tx('stranger set-keeper -> NOT_OWNER', STRANGER, VAULT, 'set-keeper', [someCV(P_(STRANGER))], e(ERR.NOT_OWNER));
  await tx('owner set-keeper(keeper)', OWNER, VAULT, 'set-keeper', [someCV(P_(KEEPER))], { ok: true });
  check('keeper set', (await evalIn(VAULT, '(get-keeper)')) === KEEPER);
  await fund(sold, VAULT, cfg.fund);
  must(`vault holds ${cfg.fund} ${sold}`, (await bal(sold, VAULT)) === cfg.fund);
  for (const b of BANDS) {
    const st = await evalIn(RUNG(b), '{ init: (var-get initialized), paused: (var-get push-paused), spread: (get-spread-bps) }');
    check(`${cfg.rungPrefix}${b} live: initialized, push not paused, spread ${b}`, st.init === true && st.paused === false && st.spread === BigInt(b), show(st));
  }
  check('is-allowed-rung true for all 10', (await Promise.all(BANDS.map((b) => evalIn(VAULT, `(is-allowed-rung '${RUNG(b)})`)))).every((v) => v === true));

  // ---------------------------------------------------------------- B ----
  setGroup('B every rung: sell / remaining / zero claim / withdraw');
  for (const b of BANDS) {
    const R = RUNG(b), tag = `${cfg.rungPrefix}${b}`;
    const v0 = await bal(sold, VAULT);
    const i0 = await state();
    const dInv = (st) => `inv-stx +${st['inv-stx'] - i0['inv-stx']}, inv-sats +${st['inv-sats'] - i0['inv-sats']}`;
    const same0 = (st) => st['inv-stx'] === i0['inv-stx'] && st['inv-sats'] === i0['inv-sats'];
    check(`${tag}: rung-remaining 0 before`, (await rr(R)) === 0n);
    await tx(`${tag}: keeper sell ${cfg.perRung}`, KEEPER, VAULT, 'sell', [P_(R), uintCV(cfg.perRung)], { ok: cfg.perRung });
    const rem = await rr(R), dir = await direct(R), pr = await rp(R);
    check(`${tag}: rung-remaining = rung get-position = booked principal`, rem === dir && pr === rem, `remaining ${rem}, direct ${dir}, principal ${pr}`);
    check(`${tag}: remaining within 1 unit of the deposit`, rem === cfg.perRung || rem === cfg.perRung - 1n, `${rem}`);
    const sA = await state();
    check(`${tag}: no inventory booked by an unfilled deposit`, same0(sA), `${dInv(sA)} (share rounding dust booked as a fill at price 0)`);
    await settlePending(sold, R, tag);
    const cl = await tx(`${tag}: keeper claim (nothing filled)`, KEEPER, VAULT, 'claim', [P_(R)], OK);
    check(`${tag}: claim books 0 consumed`, cl.res?.ok === 0n, show(cl.res));
    await freshUpd();
    await tx(`${tag}: owner rung-withdraw all`, OWNER, VAULT, 'rung-withdraw', [P_(R), uintCV(10n ** 15n), someCV(updCV())], OK);
    const rem2 = await rr(R), pr2 = await rp(R), v1 = await bal(sold, VAULT);
    check(`${tag}: after withdraw remaining 0, principal 0`, rem2 === 0n && pr2 === 0n, `${rem2}/${pr2}`);
    check(`${tag}: vault ${sold} back (loss <= 1 unit rounding)`, v1 >= v0 - 1n && v1 <= v0, `${v0} -> ${v1}`);
    const sB = await state();
    check(`${tag}: claim + withdraw book nothing more`, show(sB) === show({ ...sB, 'inv-stx': sA['inv-stx'], 'inv-sats': sA['inv-sats'] }), `${dInv(sB)}`);
  }
  {
    // a fresh vault state for the loop: wipe any rounding dust the round trips booked
    const sB = await state();
    if (sB['inv-stx'] !== 0n || sB['inv-sats'] !== 0n) note(`inventory after group B = (${sB['inv-stx']} uSTX, ${sB['inv-sats']} sats): dust carried into the loop`);
  }

  // ---------------------------------------------------------------- C ----
  setGroup('C rungs outside RUNGS');
  for (const bad of cfg.badRungs) {
    const R = `${DEP}.${bad}`;
    check(`${bad} implements the trait (live) but is-allowed-rung = false`, (await evalIn(VAULT, `(is-allowed-rung '${R})`)) === false);
    await tx(`keeper sell into ${bad} -> BAD_RUNG`, KEEPER, VAULT, 'sell', [P_(R), uintCV(cfg.perRung)], e(ERR.BAD_RUNG));
    await tx(`keeper claim ${bad} -> BAD_RUNG`, KEEPER, VAULT, 'claim', [P_(R)], e(ERR.BAD_RUNG));
    await tx(`owner rung-withdraw ${bad} -> BAD_RUNG`, OWNER, VAULT, 'rung-withdraw', [P_(R), uintCV(1n), noneCV()], e(ERR.BAD_RUNG));
    check(`rung-remaining(${bad}) = 0`, (await rr(R)) === 0n);
  }
  await tx('keeper sell into the market contract itself -> BAD_RUNG (trait check passes? else runtime err)', KEEPER, VAULT, 'sell', [P_(MARKET), uintCV(cfg.perRung)], (v) => v?.err !== undefined);

  // ---------------------------------------------------------------- D ----
  setGroup('D auth + guards');
  for (const [who, nm] of [[KEEPER, 'keeper'], [STRANGER, 'stranger']]) {
    await tx(`${nm} withdraw-sbtc -> NOT_OWNER`, who, VAULT, 'withdraw-sbtc', [uintCV(1n)], e(ERR.NOT_OWNER));
    await tx(`${nm} withdraw-stx -> NOT_OWNER`, who, VAULT, 'withdraw-stx', [uintCV(1n)], e(ERR.NOT_OWNER));
    await tx(`${nm} rung-withdraw -> NOT_OWNER`, who, VAULT, 'rung-withdraw', [P_(R1), uintCV(1n), noneCV()], e(ERR.NOT_OWNER));
    await tx(`${nm} cancel-buy-back -> NOT_OWNER`, who, VAULT, 'cancel-buy-back', [], e(ERR.NOT_OWNER));
    await tx(`${nm} propose-owner -> NOT_OWNER`, who, VAULT, 'propose-owner', [someCV(P_(who))], e(ERR.NOT_OWNER));
    await tx(`${nm} set-keeper -> NOT_OWNER`, who, VAULT, 'set-keeper', [someCV(P_(who))], e(ERR.NOT_OWNER));
    await tx(`${nm} set-paused -> NOT_OWNER`, who, VAULT, 'set-paused', [boolCV(true)], e(ERR.NOT_OWNER));
    await tx(`${nm} set-edge-bps -> NOT_OWNER`, who, VAULT, 'set-edge-bps', [uintCV(0n)], e(ERR.NOT_OWNER));
  }
  await tx('stranger sell -> NOT_AUTHORIZED', STRANGER, VAULT, 'sell', [P_(R1), uintCV(cfg.perRung)], e(ERR.NOT_AUTH));
  await tx('stranger claim -> NOT_AUTHORIZED', STRANGER, VAULT, 'claim', [P_(R1)], e(ERR.NOT_AUTH));
  await tx('stranger buy-back -> NOT_AUTHORIZED', STRANGER, VAULT, 'buy-back', [uintCV(1000n), uintCV(30n)], e(ERR.NOT_AUTH));
  await tx('stranger reprice -> NOT_AUTHORIZED', STRANGER, VAULT, 'reprice', [uintCV(30n)], e(ERR.NOT_AUTH));
  await tx('stranger reconcile -> NOT_AUTHORIZED', STRANGER, VAULT, 'reconcile', [], e(ERR.NOT_AUTH));
  await tx('keeper sell 0 -> ZERO_AMOUNT', KEEPER, VAULT, 'sell', [P_(R1), uintCV(0n)], e(ERR.ZERO));
  await tx('keeper buy-back 0 -> ZERO_AMOUNT', KEEPER, VAULT, 'buy-back', [uintCV(0n), uintCV(30n)], e(ERR.ZERO));
  await tx('owner withdraw-stx 0 -> ZERO_AMOUNT', OWNER, VAULT, 'withdraw-stx', [uintCV(0n)], e(ERR.ZERO));
  await tx('owner withdraw-sbtc 0 -> ZERO_AMOUNT', OWNER, VAULT, 'withdraw-sbtc', [uintCV(0n)], e(ERR.ZERO));
  // no per-call size cap any more: a sell above the old default cap goes through
  {
    const big = cfg.oldCap + 1n, R = RUNG(10);
    await fund(sold, VAULT, big);
    const v0 = await bal(sold, VAULT), i0 = await state();
    await tx(`keeper sell ${big} (old cap + 1) into ${cfg.rungPrefix}10 -> ok`, KEEPER, VAULT, 'sell', [P_(R), uintCV(big)], { ok: big });
    const rem = await rr(R);
    check('large sell sits in the rung (principal = rung position, within 1 unit)', rem === (await rp(R)) && (rem === big || rem === big - 1n), `${rem}`);
    const i1 = await state();
    check('large unfilled sell books no inventory', i1['inv-stx'] === i0['inv-stx'] && i1['inv-sats'] === i0['inv-sats'], show({ i0: [i0['inv-stx'], i0['inv-sats']], i1: [i1['inv-stx'], i1['inv-sats']] }));
    await settlePending(sold, R, 'large sell');
    await freshUpd();
    await tx('owner rung-withdraw the large sell', OWNER, VAULT, 'rung-withdraw', [P_(R), uintCV(10n ** 15n), someCV(updCV())], OK);
    const v1 = await bal(sold, VAULT);
    check(`large sell came back (loss <= 1 unit); principal 0`, v1 >= v0 - 1n && v1 <= v0 && (await rp(R)) === 0n, `${v0} -> ${v1}`);
    await call(OWNER, VAULT, sold === 'x' ? 'withdraw-sbtc' : 'withdraw-stx', [uintCV(big - 1n)]);
  }
  await tx('keeper buy-back with no inventory -> NO_INVENTORY', KEEPER, VAULT, 'buy-back', [uintCV(1000n), uintCV(30n)], e(ERR.NO_INV));
  await tx('keeper reprice with no inventory -> NO_INVENTORY', KEEPER, VAULT, 'reprice', [uintCV(30n)], e(ERR.NO_INV));
  await tx('owner pause', OWNER, VAULT, 'set-paused', [boolCV(true)], { ok: true });
  await tx('keeper sell while paused -> PAUSED', KEEPER, VAULT, 'sell', [P_(R1), uintCV(cfg.perRung)], e(ERR.PAUSED));
  await tx('keeper claim while paused -> PAUSED', KEEPER, VAULT, 'claim', [P_(R1)], e(ERR.PAUSED));
  await tx('keeper buy-back while paused -> PAUSED', KEEPER, VAULT, 'buy-back', [uintCV(1000n), uintCV(30n)], e(ERR.PAUSED));
  await tx('keeper reprice while paused -> PAUSED', KEEPER, VAULT, 'reprice', [uintCV(30n)], e(ERR.PAUSED));
  await tx('keeper reconcile while paused -> PAUSED', KEEPER, VAULT, 'reconcile', [], e(ERR.PAUSED));
  await tx('stranger while paused still NOT_AUTHORIZED (auth before pause)', STRANGER, VAULT, 'reconcile', [], e(ERR.NOT_AUTH));
  await tx('owner reconcile while paused -> ok (owner bypasses pause)', OWNER, VAULT, 'reconcile', [], OK);
  await tx('owner unpause', OWNER, VAULT, 'set-paused', [boolCV(false)], { ok: true });
  await tx('owner set-keeper none', OWNER, VAULT, 'set-keeper', [noneCV()], { ok: true });
  await tx('removed keeper reconcile -> NOT_AUTHORIZED', KEEPER, VAULT, 'reconcile', [], e(ERR.NOT_AUTH));
  await tx('owner set-keeper(keeper) again', OWNER, VAULT, 'set-keeper', [someCV(P_(KEEPER))], { ok: true });

  // ---------------------------------------------------------------- E ----
  setGroup('E leg 1: two partial fills, claim + rung-withdraw');
  const SELL = cfg.sell;
  const sl = await tx(`keeper sell ${SELL} into ${cfg.rungPrefix}1`, KEEPER, VAULT, 'sell', [P_(R1), uintCV(SELL)], { ok: SELL });
  const invE0 = await state(); // after the sell: any share-rounding dust it booked is the baseline
  check('prints yg-sell + yg-rung-booked', ['yg-sell', 'yg-rung-booked'].every((n) => prints(sl.receipt).some((p) => p.event === n)));
  const p0 = await rp(R1);
  check(`rung-1 principal = ${SELL} (+-1)`, p0 === SELL || p0 === SELL - 1n, `${p0}`);
  await settlePending(sold, R1, 'rung-1');
  const f1 = await forceFill(sold, R1, 0.5, 'fill 1 (rung-1, ~50%)');
  let gotTot = 0n, soldTot = 0n;
  if (f1) {
    check('fill 1: rung order shrank', f1.d1 < f1.d0, `${f1.d0} -> ${f1.d1}`);
    check('fill 1: rung received exactly traded - 10 bps fee + 20 bps rebate (floored per match)', f1.received === f1.expRecv, `${f1.received} vs ${f1.expRecv} (${f1.bps} bps)`);
    note(`${cfg.side} leg 1 fill 1: rung received ${f1.received} ${got} on ${f1.tradedRecv} at price = ${f1.bps} bps (cycle ${f1.c0} -> ${f1.c1})`);
    const g0 = await bal(got, VAULT), b0 = await bal(sold, VAULT), exp = await rp(R1);
    const cl = await tx('keeper claim(rung-1) after fill 1', KEEPER, VAULT, 'claim', [P_(R1)], OK);
    const gIn = (await bal(got, VAULT)) - g0, back = (await bal(sold, VAULT)) - b0, left = await rr(R1);
    const consumed = exp - left - back;
    const fill = px(consumed, gIn);
    console.log(`  claim: got ${gIn} ${got}, back ${back} ${sold}, left ${left}, consumed ${consumed}, fill ${fill} vs rung price ${f1.our} (${fmtBps(fill, f1.our)} bps)`);
    check('claim returns consumed = harness balance-delta math', cl.res?.ok === consumed, `${show(cl.res)} vs ${consumed}`);
    check('claim: some proceeds and some consumed', gIn > 0n && consumed > 0n);
    const bk = prints(cl.receipt).find((p) => p.event === 'yg-rung-booked');
    check('yg-rung-booked fill-price = harness fill', bk && bk['fill-price'] === fill, show(bk));
    check(`vault fill price beats the rung's own price (maker rebate > fee): ${fmtBps(fill, f1.our)} bps`, cfg.capIsFloor ? fill <= f1.our : fill >= f1.our, `${fill} vs ${f1.our}`);
    note(`${cfg.side} leg 1 vault fill price vs rung order price: ${fmtBps(fill, f1.our)} bps; vs mid: ${fmtBps(fill, f1.MID)} bps`);
    gotTot += gIn; soldTot += consumed;
    const sE = await state();
    const vw = sold === 'x' ? (invE0['inv-stx'] + gotTot) * SCALE / (invE0['inv-sats'] + soldTot) : (invE0['inv-stx'] + soldTot) * SCALE / (invE0['inv-sats'] + gotTot);
    check('inventory += (got, consumed); VWAP = harness', sE[invGot] === invE0[invGot] + gotTot && sE[invSold] === invE0[invSold] + soldTot && sE['vwap-sell'] === vw, show({ inv: [sE['inv-stx'], sE['inv-sats']], vwap: sE['vwap-sell'], want: vw }));
    check(`${cfg.capFn} = harness (vwap x (1 ${cfg.capIsFloor ? '+' : '-'} 25 bps)${cfg.capIsFloor ? ', rounded up' : ''})`, sE[cfg.capFn] === capOf(sE), `${sE[cfg.capFn]} vs ${capOf(sE)}`);
    check('principal re-synced to the rung position after claim', (await rp(R1)) === left);
  }
  const f2 = await forceFill(sold, R1, 0.5, 'fill 2 (rung-1, ~50% of rest)');
  if (f2) {
    note(`${cfg.side} leg 1 fill 2: ${f2.bps} bps (cycle ${f2.c0} -> ${f2.c1})`);
    const g0 = await bal(got, VAULT), b0 = await bal(sold, VAULT), exp = await rp(R1);
    await freshUpd();
    const wd = await tx('owner rung-withdraw all from rung-1 after a partial fill', OWNER, VAULT, 'rung-withdraw', [P_(R1), uintCV(10n ** 15n), someCV(updCV())], OK);
    const gIn = (await bal(got, VAULT)) - g0, back = (await bal(sold, VAULT)) - b0, left = await rr(R1);
    const consumed = exp - left - back;
    console.log(`  withdraw: got ${gIn}, back ${back}, left ${left}, consumed ${consumed}`);
    check('rung-withdraw books the fill it collected (consumed = expected - back)', wd.res?.ok === consumed && left === 0n && gIn > 0n && consumed > 0n, `${show(wd.res)} vs ${consumed}, left ${left}, got ${gIn}`);
    gotTot += gIn; soldTot += consumed;
    const sE = await state();
    const vw = sold === 'x' ? (invE0['inv-stx'] + gotTot) * SCALE / (invE0['inv-sats'] + soldTot) : (invE0['inv-stx'] + soldTot) * SCALE / (invE0['inv-sats'] + gotTot);
    check('inventory = both fills; VWAP = weighted harness VWAP', sE[invGot] === invE0[invGot] + gotTot && sE[invSold] === invE0[invSold] + soldTot && sE['vwap-sell'] === vw, show({ inv: [sE['inv-stx'], sE['inv-sats']], vwap: sE['vwap-sell'], want: vw }));
    check('rung-1 principal 0 after withdraw', (await rp(R1)) === 0n);
  }

  // ---------------------------------------------------------------- F ----
  setGroup('F rung sold out -> epoch roll -> claim');
  {
    const R30 = RUNG(30);
    const st30 = await evalIn(R30, '(get-state)');
    if (st30.members !== 0n) note(`${cfg.rungPrefix}30 has ${st30.members} members: sold-out test is pooled`);
    const amt = cfg.soldOut;
    await tx(`keeper sell ${amt} into ${cfg.rungPrefix}30`, KEEPER, VAULT, 'sell', [P_(R30), uintCV(amt)], { ok: amt });
    await settlePending(sold, R30, 'rung-30');
    const ep0 = (await evalIn(R30, '(get-state)')).epoch;
    const ff = await forceFill(sold, R30, 1, 'fill rung-30 fully', { full: true });
    if (ff) {
      note(`${cfg.side} sold-out fill: ${ff.bps} bps; rung deposit ${ff.d0} -> ${ff.d1}`);
      check('rung-30 market order fully consumed (or below dust)', ff.d1 < (sold === 'x' ? 10n : 10_000n), `${ff.d1}`);
      const inv0 = await state();
      const g0 = await bal(got, VAULT), b0 = await bal(sold, VAULT), exp = await rp(R30);
      const cl = await tx('keeper claim(rung-30) after sold out', KEEPER, VAULT, 'claim', [P_(R30)], OK);
      const ep1 = (await evalIn(R30, '(get-state)')).epoch;
      const gIn = (await bal(got, VAULT)) - g0, back = (await bal(sold, VAULT)) - b0, left = await rr(R30);
      const consumed = exp - left - back;
      check(`rung-30 epoch rolled (${ep0} -> ${ep1})`, ep1 > ep0);
      check('old-epoch claim: position closed, left 0, consumed = principal - back', left === 0n && cl.res?.ok === consumed && consumed > 0n, `left ${left}, res ${show(cl.res)}, consumed ${consumed}, back ${back}, got ${gIn}`);
      const inv1 = await state();
      check('inventory += old-epoch payout', inv1[invGot] === inv0[invGot] + gIn && inv1[invSold] === inv0[invSold] + consumed, show({ before: [inv0['inv-stx'], inv0['inv-sats']], after: [inv1['inv-stx'], inv1['inv-sats']], gIn, consumed }));
      note(`${cfg.side} sold-out vault fill price ${px(consumed, gIn)} vs rung price ${ff.our}: ${fmtBps(px(consumed, gIn), ff.our)} bps`);
      await tx('keeper claim(rung-30) again with no position -> rung ERR_NO_POSITION u7006', KEEPER, VAULT, 'claim', [P_(R30)], E(7006));
    } else {
      // could not fill: take the deposit back
      await freshUpd();
      await tx('owner rung-withdraw rung-30 (fill skipped)', OWNER, VAULT, 'rung-withdraw', [P_(R30), uintCV(10n ** 15n), someCV(updCV())], OK);
    }
  }

  // ---------------------------------------------------------------- G ----
  setGroup('G leg 2 buy-back');
  let sG = await state();
  const INV = sG[invGot];
  const CAP = sG[cfg.capFn];
  console.log(`  inventory ${sG['inv-stx']} uSTX / ${sG['inv-sats']} sats, vwap ${sG['vwap-sell']}, ${cfg.capFn} ${CAP}`);
  must('inventory to buy back', INV > 0n && sG[invSold] > 0n, show(sG));
  // owner-tunable edge: cap/floor follow it
  {
    const vw = sG['vwap-sell'];
    check(`${cfg.capFn} at default edge 25 = harness`, CAP === capOf(sG, 25n), `${CAP} vs ${capOf(sG, 25n)}`);
    await tx('keeper set-edge-bps -> NOT_OWNER', KEEPER, VAULT, 'set-edge-bps', [uintCV(10n)], e(ERR.NOT_OWNER));
    await tx('owner set-edge-bps 10000 -> BAD_SPREAD', OWNER, VAULT, 'set-edge-bps', [uintCV(10000n)], e(ERR.BAD_SPREAD));
    const se = await tx('owner set-edge-bps 0', OWNER, VAULT, 'set-edge-bps', [uintCV(0n)], { ok: true });
    check('print yg-set-edge-bps', prints(se.receipt).some((p) => p.event === 'yg-set-edge-bps' && p.bps === 0n));
    let st = await state();
    check(`edge 0: ${cfg.capFn} = vwap${cfg.capIsFloor ? ' rounded up (exact from raw inventory)' : ''}`, st['edge-bps'] === 0n && st[cfg.capFn] === capOf(sG, 0n) && (cfg.capIsFloor ? st[cfg.capFn] >= vw && st[cfg.capFn] <= vw + 1n : st[cfg.capFn] === vw), `${st[cfg.capFn]} vs vwap ${vw}`);
    await tx('owner set-edge-bps 9999 (max accepted)', OWNER, VAULT, 'set-edge-bps', [uintCV(9999n)], { ok: true });
    st = await state();
    check(`edge 9999: ${cfg.capFn} = harness`, st[cfg.capFn] === capOf(sG, 9999n), `${st[cfg.capFn]} vs ${capOf(sG, 9999n)}`);
    await tx('owner set-edge-bps 100', OWNER, VAULT, 'set-edge-bps', [uintCV(100n)], { ok: true });
    st = await state();
    check(`edge 100: ${cfg.capFn} = harness and stricter than at 25`, st[cfg.capFn] === capOf(sG, 100n) && (cfg.capIsFloor ? st[cfg.capFn] > CAP : st[cfg.capFn] < CAP), `${st[cfg.capFn]}`);
    await tx('owner set-edge-bps back to 25', OWNER, VAULT, 'set-edge-bps', [uintCV(25n)], { ok: true });
    check(`${cfg.capFn} back to the default value`, (await state())[cfg.capFn] === CAP);
  }
  await tx('keeper buy-back inventory + 1 -> OVER_INVENTORY', KEEPER, VAULT, 'buy-back', [uintCV(INV + 1n), uintCV(30n)], e(ERR.OVER_INV));
  await tx('keeper buy-back spread 10000 -> BAD_SPREAD', KEEPER, VAULT, 'buy-back', [uintCV(INV), uintCV(10000n)], e(ERR.BAD_SPREAD));
  await tx('keeper reprice spread 10000 -> BAD_SPREAD', KEEPER, VAULT, 'reprice', [uintCV(10000n)], e(ERR.BAD_SPREAD));
  const H = INV / 2n;
  const bb = await tx(`keeper buy-back ${H} (half), spread 1 bps (pegged beyond the ${cfg.capIsFloor ? 'floor' : 'cap'})`, KEEPER, VAULT, 'buy-back', [uintCV(H), uintCV(1n)], { ok: CAP });
  check(`print yg-buy-back with ${cfg.capIsFloor ? 'floor' : 'cap'}`, prints(bb.receipt).some((p) => p.event === 'yg-buy-back' && p[cfg.capIsFloor ? 'floor' : 'cap'] === CAP));
  await settlePending(got, VAULT, 'vault bid/ask');
  {
    await freshUpd(true);
    const ord = await orderOf(got, VAULT);
    check(`market order: limit = ${cfg.capIsFloor ? 'floor' : 'cap'}, spread 1`, ord.limit === CAP && ord['spread-bps'] === 1n, show(ord));
    const live = await limitAt(got, VAULT, S.MID), peg = pegOf(S.MID, 1n);
    check(`live price = market min-rule (peg ${peg} vs ${cfg.capIsFloor ? 'floor' : 'cap'} ${CAP})`, live === liveOf(peg, CAP), `${live}`);
    if (!inside(peg, CAP)) check('spread 1 is beyond the cap/floor -> order sits out', !resting(live), `${live}`);
    else note('spread 1 peg is inside the cap/floor at this mid: sit-out not exercised');
    check(`vault ${got} on the book = ${H}`, (await evalIn(VAULT, `(${cfg.onMarketFn})`)) === H);
  }
  await tx('keeper top-up past inventory -> OVER_INVENTORY', KEEPER, VAULT, 'buy-back', [uintCV(INV - H + 1n), uintCV(1n)], e(ERR.OVER_INV));
  {
    const rpr = await tx('keeper reprice spread 30', KEEPER, VAULT, 'reprice', [uintCV(30n)], { ok: CAP });
    const ev = prints(rpr.receipt).find((p) => p.event === 'yg-reprice');
    if (ev && ev['applied-now'] === false) { await freshUpd(); await tx('settle the pending limit', KEEPER, MARKET, `settle-token-${got}-limit`, [P_(VAULT), updCV()], OK); }
    const ord = await orderOf(got, VAULT);
    check('order after reprice: spread 30, same limit', ord.limit === CAP && ord['spread-bps'] === 30n, show(ord));
  }
  await tx(`keeper top-up ${INV - H}, spread 30`, KEEPER, VAULT, 'buy-back', [uintCV(INV - H), uintCV(30n)], { ok: CAP });
  await settlePending(got, VAULT, 'vault top-up');
  {
    const ord = await orderOf(got, VAULT);
    check('top-up kept limit and spread 30', ord.limit === CAP && ord['spread-bps'] === 30n, show(ord));
    check(`whole inventory on the book (${INV})`, (await evalIn(VAULT, `(${cfg.onMarketFn})`)) === INV);
    await freshUpd(true);
    const live = await limitAt(got, VAULT, S.MID), peg = pegOf(S.MID, 30n);
    check(`spread 30 live = min-rule (peg ${peg}, ${cfg.capIsFloor ? 'floor' : 'cap'} ${CAP})`, live === liveOf(peg, CAP), `${live}`);
  }
  // partial fill of the buy-back
  const pre = await state();
  const b1 = await forceFill(got, VAULT, 0.5, 'buy-back fill 1 (~50%)');
  if (b1) {
    note(`${cfg.side} leg 2 fill 1: vault received ${b1.received} ${sold} on ${b1.tradedRecv} at price = ${b1.bps} bps`);
    check('leg 2: vault received exactly traded - 10 bps fee + 20 bps rebate (floored per match)', b1.received === b1.expRecv, `${b1.received} vs ${b1.expRecv} (${b1.bps} bps)`);
    const spent = got === 'y' ? b1.sy : b1.sx;
    const eff = sold === 'x' ? spent * SCALE / b1.received : b1.received * SCALE / spent;
    check(`effective buy-back price ${eff} respects the ${cfg.capIsFloor ? 'floor' : 'cap'} ${CAP}`, inside(eff, CAP) && inside(b1.our, CAP), `eff ${eff}, order ${b1.our}`);
    note(`${cfg.side} leg 2 effective price ${eff} vs order ${b1.our} (${fmtBps(eff, b1.our)} bps) vs ${cfg.capIsFloor ? 'floor' : 'cap'} ${CAP}; round-trip edge vs VWAP ${pre['vwap-sell']}: ${fmtBps(cfg.capIsFloor ? eff : pre['vwap-sell'], cfg.capIsFloor ? pre['vwap-sell'] : eff)} bps`);
    check(`market cycle rolled during the swap (${b1.c0} -> ${b1.c1}) and the order rolled with it`, b1.c1 > b1.c0 && b1.d1 > 0n, `deposit ${b1.d1}`);
    const rc = await tx('keeper reconcile after partial fill', KEEPER, VAULT, 'reconcile', [], OK);
    const post = await state();
    const open0 = pre[invGot], oth0 = pre[invSold];
    const have = post[cfg.heldGotKey] + post[cfg.onMarketKey];
    const spentInv = open0 - have;
    const othW = oth0 - oth0 * spentInv / open0;
    check(`inventory reduced pro rata: open = held + on market (${have}), other = other - floor(other x spent / open)`, post[invGot] === have && post[invSold] === othW && prints(rc.receipt).some((p) => p.event === 'yg-inventory-reduced'), show({ open: post[invGot], have, oth: post[invSold], want: othW }));
    check('reconcile spent = what the fill took from the order', spentInv === spent, `${spentInv} vs ${spent}`);
    check(`VWAP rounding only makes the ${cfg.capIsFloor ? 'floor stricter (vwap up)' : 'cap stricter (vwap down)'}`, stricter(post['vwap-sell'], pre['vwap-sell']), `${pre['vwap-sell']} -> ${post['vwap-sell']}`);
    // the other side rounds by < 1 unit: one unit less would put VWAP back on the other side of the old one
    const bracket = cfg.capIsFloor ? (post['inv-stx'] - 1n) * SCALE / post['inv-sats'] <= pre['vwap-sell'] : post['inv-stx'] * SCALE / (post['inv-sats'] - 1n) >= pre['vwap-sell'];
    check('VWAP drift is within 1 unit of the rounded side', bracket, `${pre['vwap-sell']} -> ${post['vwap-sell']}`);
  }
  // cancel + re-post
  {
    const on = await evalIn(VAULT, `(${cfg.onMarketFn})`);
    const s1 = await state();
    const g0 = await bal(got, VAULT);
    await tx('owner cancel-buy-back', OWNER, VAULT, 'cancel-buy-back', [], { ok: on });
    check(`vault ${got} += cancelled order`, (await bal(got, VAULT)) === g0 + on);
    await tx('keeper reconcile after cancel', KEEPER, VAULT, 'reconcile', [], OK);
    const s2 = await state();
    check('cancel does not shrink inventory (STX/sats still in the vault)', s2[invGot] === s1[invGot] && s2[invSold] === s1[invSold], show({ s1: [s1['inv-stx'], s1['inv-sats']], s2: [s2['inv-stx'], s2['inv-sats']] }));
    const rpx = await call(KEEPER, VAULT, 'reprice', [uintCV(30n)]);
    check('keeper reprice with nothing on the book fails (market ERR_NOTHING_TO_WITHDRAW)', !rpx.vm && rpx.res?.err !== undefined, show(rpx.res ?? rpx.vm));
    note(`reprice with no resting order -> ${show(rpx.res)}`);
    const inv = s2[invGot];
    await tx(`keeper re-post buy-back ${inv}, spread 30`, KEEPER, VAULT, 'buy-back', [uintCV(inv), uintCV(30n)], OK);
    await settlePending(got, VAULT, 're-post');
  }
  // full fill -> reset at dust
  {
    const b2 = await forceFill(got, VAULT, 1, 'buy-back full fill', { full: true });
    if (b2) note(`${cfg.side} leg 2 full fill: ${b2.bps} bps, order ${b2.d0} -> ${b2.d1}`);
    await tx('keeper reconcile after full fill', KEEPER, VAULT, 'reconcile', [], OK);
    const s3 = await state();
    const have = s3[cfg.heldGotKey] + s3[cfg.onMarketKey];
    if (have < cfg.resetDust) check('inventory reset to 0 at dust', s3['inv-stx'] === 0n && s3['inv-sats'] === 0n && s3['vwap-sell'] === 0n, show(s3));
    else note(`after full fill the vault still holds ${have} ${got} >= dust ${cfg.resetDust}: reset not hit by the fill (order ${b2?.d1})`);
  }

  // ---------------------------------------------------------------- H ----
  setGroup('H owner exits + handover');
  {
    const on = await evalIn(VAULT, `(${cfg.onMarketFn})`);
    if (on > 0n) await tx('owner cancel-buy-back', OWNER, VAULT, 'cancel-buy-back', [], { ok: on });
    for (const b of BANDS) {
      const left = await rr(RUNG(b));
      if (left > 0n) { await freshUpd(); await tx(`owner rung-withdraw ${cfg.rungPrefix}${b}`, OWNER, VAULT, 'rung-withdraw', [P_(RUNG(b)), uintCV(10n ** 15n), someCV(updCV())], OK); }
    }
    const ost = await stxBal(OWNER), osb = await sbtcBal(OWNER), kst = await stxBal(KEEPER), ksb = await sbtcBal(KEEPER);
    const vst = await stxBal(VAULT), vsb = await sbtcBal(VAULT);
    if (vst > 0n) await tx(`owner withdraw-stx ${vst}`, OWNER, VAULT, 'withdraw-stx', [uintCV(vst)], { ok: vst });
    if (vsb > 0n) await tx(`owner withdraw-sbtc ${vsb}`, OWNER, VAULT, 'withdraw-sbtc', [uintCV(vsb)], { ok: vsb });
    await tx('owner withdraw-stx 1 from an empty vault -> aborts', OWNER, VAULT, 'withdraw-stx', [uintCV(1n)], (v) => v?.err !== undefined);
    check('owner received everything; keeper got nothing; vault empty', (await stxBal(OWNER)) === ost + vst && (await sbtcBal(OWNER)) === osb + vsb && (await stxBal(KEEPER)) === kst && (await sbtcBal(KEEPER)) === ksb && (await stxBal(VAULT)) === 0n && (await sbtcBal(VAULT)) === 0n);
    const sH = await state();
    check('inventory reset once the open side left the vault', sH['inv-stx'] === 0n && sH['inv-sats'] === 0n, show(sH));
  }
  await tx('owner propose-owner(new)', OWNER, VAULT, 'propose-owner', [someCV(P_(NEW_OWNER))], { ok: true });
  check('pending owner = new', (await evalIn(VAULT, '(get-pending-owner)')) === NEW_OWNER);
  await tx('stranger accept-owner -> NOT_PENDING_OWNER', STRANGER, VAULT, 'accept-owner', [], e(ERR.NOT_PENDING));
  await tx('owner propose-owner(none) cancels', OWNER, VAULT, 'propose-owner', [noneCV()], { ok: true });
  await tx('new owner accept after cancel -> NOT_PENDING_OWNER', NEW_OWNER, VAULT, 'accept-owner', [], e(ERR.NOT_PENDING));
  await tx('owner propose-owner(new) again', OWNER, VAULT, 'propose-owner', [someCV(P_(NEW_OWNER))], { ok: true });
  await tx('old owner still owner before accept (set-paused ok)', OWNER, VAULT, 'set-paused', [boolCV(false)], { ok: true });
  await tx('new owner accept-owner', NEW_OWNER, VAULT, 'accept-owner', [], { ok: true });
  await tx('old owner withdraw-stx -> NOT_OWNER', OWNER, VAULT, 'withdraw-stx', [uintCV(1n)], e(ERR.NOT_OWNER));
  await tx('old owner reconcile -> NOT_AUTHORIZED', OWNER, VAULT, 'reconcile', [], e(ERR.NOT_AUTH));
  await tx('new owner set-paused ok', NEW_OWNER, VAULT, 'set-paused', [boolCV(false)], { ok: true });
  const oo = await evalIn(VAULT, '{ o: (get-owner), p: (get-pending-owner) }');
  check('owner = new, pending cleared', oo.o === NEW_OWNER && oo.p === null, show(oo));
  check('keeper survives the handover (new owner must reset it if unwanted)', (await evalIn(VAULT, '(get-keeper)')) === KEEPER);

  // ---------------------------------------------------------------- I ----
  setGroup('I allowances (hostile rung + hostile market variant)');
  {
    const EVR = `${OWNER}.yg-evil-rung-${cfg.side}`, EVM = `${OWNER}.yg-evil-market-${cfg.side}`, VV = `${OWNER}.yg-variant-${cfg.side}`;
    await deploy(OWNER, `yg-evil-rung-${cfg.side}`, evilRung());
    await deploy(OWNER, `yg-evil-market-${cfg.side}`, evilMarket());
    const r90 = `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.${cfg.rungPrefix}90`;
    const vsrc = src.split(r90).join(EVR).replace(/\(define-constant MARKET '[^)]+\)/, `(define-constant MARKET '${EVM})`);
    must('variant source swaps rung 90 (2 sites) + MARKET', vsrc !== src && vsrc.split(EVR).length === 3 && vsrc.includes(`(define-constant MARKET '${EVM})`));
    await deploy(OWNER, `yg-variant-${cfg.side}`, vsrc);
    await tx('variant set-keeper(keeper)', OWNER, VV, 'set-keeper', [someCV(P_(KEEPER))], { ok: true });
    await fund(sold, VV, cfg.perRung * 5n);
    await fund(got, VV, cfg.evilPay * 2n);
    await fund(got, EVR, cfg.evilPay * 2n);
    const snap = async () => ({ vs: await bal(sold, VV), vg: await bal(got, VV), st: await evalIn(VV, '(get-state)') });
    const same = (a, b) => a.vs === b.vs && a.vg === b.vg && show(a.st) === show(b.st);
    const mode = (c, m) => tx(`set ${c.split('.')[1]} mode ${m}`, OWNER, c, 'set-mode', [uintCV(m)], { ok: true });
    // rung paths
    await mode(EVR, 0n);
    await tx(`honest hostile rung: sell ${cfg.perRung} ok (control)`, KEEPER, VV, 'sell', [P_(EVR), uintCV(cfg.perRung)], { ok: cfg.perRung });
    await mode(EVR, 1n);
    let a = await snap();
    let r = await call(KEEPER, VV, 'sell', [P_(EVR), uintCV(cfg.perRung)]);
    check('rung pulls amount + 1 on deposit -> sell aborts, nothing moves', (r.res?.err !== undefined || r.vm) && same(a, await snap()), show(r.res ?? r.vm));
    a = await snap();
    r = await call(KEEPER, VV, 'claim', [P_(EVR)]);
    check(`rung pulls 1 ${sold} on claim (no allowance) -> claim aborts`, (r.res?.err !== undefined || r.vm) && same(a, await snap()), show(r.res ?? r.vm));
    a = await snap();
    r = await call(OWNER, VV, 'rung-withdraw', [P_(EVR), uintCV(1n), noneCV()]);
    check('rung pulls 1 uSTX on withdraw (no allowance) -> rung-withdraw aborts', (r.res?.err !== undefined || r.vm) && same(a, await snap()), show(r.res ?? r.vm));
    await mode(EVR, 2n);
    await tx(`honest-paying hostile rung: claim pays ${cfg.evilPay} ${got} (control, books inventory)`, KEEPER, VV, 'claim', [P_(EVR)], OK);
    const sv = await evalIn(VV, '(get-state)');
    check('variant inventory booked from the payout', sv[invGot] === cfg.evilPay && sv[invSold] === cfg.perRung, show(sv));
    // market paths
    await mode(EVM, 0n);
    const amt = cfg.evilPay / 4n;
    await tx(`honest hostile market: buy-back ${amt} ok (control)`, KEEPER, VV, 'buy-back', [uintCV(amt), uintCV(30n)], OK);
    await mode(EVM, 1n);
    a = await snap();
    r = await call(KEEPER, VV, 'buy-back', [uintCV(amt), uintCV(30n)]);
    check('market pulls amount + 1 on deposit -> buy-back aborts', (r.res?.err !== undefined || r.vm) && same(a, await snap()), show(r.res ?? r.vm));
    a = await snap();
    r = await call(KEEPER, VV, 'reprice', [uintCV(30n)]);
    check('market pulls 1 on set-limit (no allowance) -> reprice aborts', (r.res?.err !== undefined || r.vm) && same(a, await snap()), show(r.res ?? r.vm));
    a = await snap();
    r = await call(OWNER, VV, 'cancel-buy-back', []);
    check('market pulls 1 on cancel (no allowance) -> cancel-buy-back aborts', (r.res?.err !== undefined || r.vm) && same(a, await snap()), show(r.res ?? r.vm));
    a = await snap();
    r = await call(OWNER, VV, sold === 'x' ? 'withdraw-sbtc' : 'withdraw-stx', [uintCV(a.vs + 1n)]);
    check('owner withdraw more than the vault holds aborts', (r.res?.err !== undefined || r.vm) && same(a, await snap()), show(r.res ?? r.vm));
  }

  function evilRung() {
    const pull = sold === 'x'
      ? (n) => `(contract-call? '${SBTC} transfer ${n} tx-sender current-contract none)`
      : (n) => `(stx-transfer? ${n} tx-sender current-contract)`;
    const pay = got === 'y'
      ? `(as-contract? ((with-stx u${cfg.evilPay})) (try! (stx-transfer? u${cfg.evilPay} current-contract who)))`
      : `(as-contract? ((with-ft '${SBTC} "sbtc-token" u${cfg.evilPay})) (try! (contract-call? '${SBTC} transfer u${cfg.evilPay} current-contract who none)))`;
    return `(define-data-var mode uint u0)
(define-data-var held uint u0)
(define-public (set-mode (m uint)) (ok (var-set mode m)))
(define-read-only (get-position (who principal)) { shares: u0, sbtc: (var-get held), stx: (var-get held) })
(define-public (deposit (amount uint))
  (begin
    (try! ${pull('(+ amount (if (is-eq (var-get mode) u1) u1 u0))')})
    (var-set held (+ (var-get held) amount))
    (ok { amount: amount, shares: u0, epoch: u0, stx-paid: u0, sbtc-paid: u0 })))
(define-public (withdraw (amount uint) (update (optional (buff 8192))))
  (begin
    (and (is-eq (var-get mode) u1) (try! (stx-transfer? u1 tx-sender current-contract)))
    (ok { stx: u0, sbtc: u0 })))
(define-public (claim)
  (let ((who tx-sender))
    (and (is-eq (var-get mode) u1) (try! ${pull('u1')}))
    (and (is-eq (var-get mode) u2) (begin (var-set held u0) (try! ${pay})))
    (ok { stx: u0, sbtc: u0 })))
`;
  }
  function evilMarket() {
    const extra = '(if (is-eq (var-get mode) u1) u1 u0)';
    return `(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)
(define-data-var mode uint u0)
(define-public (set-mode (m uint)) (ok (var-set mode m)))
(define-public (deposit-token-y (amount uint) (limit uint) (spread (optional uint)) (t <ft-trait>) (n (string-ascii 128)))
  (begin (try! (stx-transfer? (+ amount ${extra}) tx-sender current-contract)) (ok amount)))
(define-public (deposit-token-x (amount uint) (limit uint) (spread (optional uint)) (t <ft-trait>) (n (string-ascii 128)))
  (begin (try! (contract-call? '${SBTC} transfer (+ amount ${extra}) tx-sender current-contract none)) (ok amount)))
(define-public (set-token-y-limit (limit uint) (spread (optional uint)))
  (begin (and (is-eq (var-get mode) u1) (try! (stx-transfer? u1 tx-sender current-contract))) (ok true)))
(define-public (set-token-x-limit (limit uint) (spread (optional uint)))
  (begin (and (is-eq (var-get mode) u1) (try! (contract-call? '${SBTC} transfer u1 tx-sender current-contract none))) (ok true)))
(define-public (cancel-token-y-deposit (t <ft-trait>) (n (string-ascii 128)))
  (begin (and (is-eq (var-get mode) u1) (try! (stx-transfer? u1 tx-sender current-contract))) (ok u0)))
(define-public (cancel-token-x-deposit (t <ft-trait>) (n (string-ascii 128)))
  (begin (and (is-eq (var-get mode) u1) (try! (contract-call? '${SBTC} transfer u1 tx-sender current-contract none))) (ok u0)))
`;
  }
}

export function main(cfg) {
  runSide(cfg).then(() => { summary(); process.exit(S.fails.length ? 1 : 0); })
    .catch((err) => { console.error(err instanceof Stop ? err.message : (err.stack ?? err)); summary(); process.exit(1); });
}
