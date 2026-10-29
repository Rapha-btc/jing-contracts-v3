// _yg-loop-usdcx-engine.js - the _yg-loop-engine.js scenario ported to the
// sBTC/USDCx market, two mirrored sides:
//   verify-yguazu-mm-loop-sell-sbtc-usdcx.js (vault sells sBTC into jing-sell-sbtc-*)
//   verify-yguazu-mm-loop-sell-usdcx.js      (vault sells USDCx into jing-buy-sbtc-*)
// Token sides use the market's names: x = sBTC (sats), y = USDCx (uUSDCx).
// Groups A..J, G, H, I as in _yg-loop-engine.js, plus:
//   E/F  VWAP blend: rung-1 fills + a rung-30 fill at a different price; the
//        cap/floor checked as an exact rational bound after every booking
//   G    realized profit per buy-back fill (received > inventory closed)
//   I    hostile contracts also try to pull STX: with max-oracle-fee u0
//        every STX pull aborts
//   K    oracle-fee allowance (STX): max-oracle-fee auth; fee-0 update path;
//        none while pending (u7012); oracle charging F (governance
//        impersonated): cap 0 aborts, cap F pays exactly F and succeeds,
//        cap F - 1 aborts; the 24 h path cancels the pending order. A far
//        opposite-side order is seeded first: on this market a deposit only
//        goes pending while the other side has depositors
//   L    DIA > 2 h stale (after K's +25 h): rung guard reads 0, refresh-guard
//        aborts, a sell stays held in the rung, claim + withdraw return it all,
//        an order pushed before the stale window comes back too
//   Z    floor / cap rounding at an extreme inventory ratio (hostile-rung
//        variant): floor rounds up and is never 0; cap hits 0 -> ERR_ZERO_CAP
//   N    STX accounting: the only STX that left the vault is the K5 fee;
//        only the owner withdraws the rest, to the owner
// DEPLOY_SRC=<path> runs the scenario on those bytes (comment-stripped +
// clarinet format deploy bytes) instead of contracts/rfq/<name>.clar.
import { readFileSync } from 'node:fs';
import { uintCV, boolCV, someCV, noneCV } from '@stacks/transactions';
import {
  DEP, MARKET, SBTC, WHALE, BANDS, BPS, EDGE, SCALE, P_, T, A, mk, Stop, S, show,
  setGroup, check, must, note, startSim, evalIn, call, tx, E, OK, prints, matches,
  stxTransfer, sbtcTransfer, deploy, sbtcBal, stxBal, freshUpd, updCV, curCycle, summary, blockTime,
  usdcxBal, usdcxTransfer, USDCX,
} from './_yg-loop-usdcx-common.js';
import { submitSimulationSteps } from 'stxer';

const MAX_UINT = 2n ** 128n - 1n;
const other = (t) => (t === 'x' ? 'y' : 'x');
const fmtBps = (num, den) => den === 0n ? 'n/a' : ((Number(num) / Number(den) - 1) * 1e4).toFixed(2);

export async function runSide(cfg) {
  const { sold, got } = cfg;
  const STX_GIFT = 3_000_000n;
  const OWNER = mk(cfg.seed), KEEPER = mk(cfg.seed + 1), STRANGER = mk(cfg.seed + 2), NEW_OWNER = mk(cfg.seed + 3);
  let takerN = cfg.seed + 10;
  const VAULT = `${OWNER}.${cfg.name}`;
  const RUNG = (b) => `${DEP}.${cfg.rungPrefix}${b}`;
  const R1 = RUNG(1);
  const e = (k) => E(cfg.errBase + k);
  const ERR = { NOT_OWNER: 1, NOT_AUTH: 2, NOT_PENDING: 3, PAUSED: 4, BAD_RUNG: 5, ZERO: 6, NO_INV: 8, OVER_INV: 9, BAD_SPREAD: 10 };
  const invSold = sold === 'x' ? 'inv-sats' : 'inv-usdcx';
  const invGot = got === 'x' ? 'inv-sats' : 'inv-usdcx';
  const bal = (t, who) => (t === 'x' ? sbtcBal(who) : usdcxBal(who));
  const fund = (t, who, amt) => (t === 'x' ? sbtcTransfer(WHALE.x, who, amt) : usdcxTransfer(WHALE.y, who, amt));
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
    return den === 0n ? 0n : (st['inv-usdcx'] * SCALE * (BPS + edge) + den - 1n) / den;
  };
  // exact rational bound (no rounding): floor x inv-sats x 1e4 >= inv-usdcx x 1e10 x (1e4 + edge)
  // and the floor is the least such integer; cap x inv-sats x 1e4 <= inv-usdcx x 1e10 x (1e4 - edge)
  const boundOk = (st) => {
    const ed = st['edge-bps'], c = st[cfg.capFn], ns = st['inv-sats'], nu = st['inv-usdcx'];
    if (ns === 0n) return c === 0n;
    if (cfg.capIsFloor) return c * ns * BPS >= nu * SCALE * (BPS + ed) && (c - 1n) * ns * BPS < nu * SCALE * (BPS + ed);
    return c * ns * BPS <= nu * SCALE * (BPS - ed);
  };
  const checkBound = (label, st) => check(`${label}: ${cfg.capFn} ${st[cfg.capFn]} is ${cfg.capIsFloor ? 'the least price >= true break-even VWAP x (1 + edge)' : '<= true VWAP x (1 - edge)'} (exact rational)`, boundOk(st), show({ cap: st[cfg.capFn], inv: [st['inv-usdcx'], st['inv-sats']], edge: st['edge-bps'] }));
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
    let gross = net * (BPS + 20n) / BPS + 1n;
    // the market refuses a taker deposit under its minimum (u1001): 1,000 sats / 1 STX
    // net of the taker rebate (up to 70 bps) must still clear the minimum
    const minIn = (o === 'x' ? 1_000n : 1_000_000n) * (BPS + 70n) / BPS + 1n;
    if (gross < minIn) gross = minIn;
    const taker = mk(takerN++);
    console.log(`  ${label}: our ${s} price ${our} (mid ${MID}), better orders ${need}, ours ${oursAmt}, taker sends ${gross} ${o}`);
    await stxTransfer(WHALE.stx, taker, 2_000_000n);
    await fund(o, taker, gross);
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

  const src = process.env.DEPLOY_SRC ? readFileSync(process.env.DEPLOY_SRC, 'utf8') : readFileSync(new URL(`../contracts/rfq/${cfg.name}.clar`, import.meta.url), 'utf8');
  console.log(`source: ${process.env.DEPLOY_SRC || cfg.name + '.clar'} (${src.length} bytes)`);
  await startSim(R1);
  await freshUpd();

  // ---------------------------------------------------------------- A ----
  setGroup('A deploy + fund');
  await stxTransfer(WHALE.stx, OWNER, 5_000_000n);
  await stxTransfer(WHALE.stx, KEEPER, 1_000_000n);
  await stxTransfer(WHALE.stx, STRANGER, 1_000_000n);
  await stxTransfer(WHALE.stx, NEW_OWNER, 1_000_000n);
  await deploy(OWNER, cfg.name, src);
  // 3 STX for oracle fees: only the K5 fee may leave (checked in N)
  await stxTransfer(WHALE.stx, VAULT, STX_GIFT);
  const s0 = await state();
  check('get-state: max-oracle-fee u0, stx-held = the STX sent, usdcx-held present', s0['max-oracle-fee'] === 0n && s0['stx-held'] === STX_GIFT && 'usdcx-held' in s0, show(s0));
  must('owner = deployer, no keeper, not paused, empty inventory, edge 25, no size-cap field', s0.owner === OWNER && s0.keeper === null && s0.paused === false && s0['inv-usdcx'] === 0n && s0['inv-sats'] === 0n && s0['edge-bps'] === EDGE && !Object.keys(s0).some((k) => k.startsWith('max-sell')), show(s0));
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
    const dInv = (st) => `inv-usdcx +${st['inv-usdcx'] - i0['inv-usdcx']}, inv-sats +${st['inv-sats'] - i0['inv-sats']}`;
    const same0 = (st) => st['inv-usdcx'] === i0['inv-usdcx'] && st['inv-sats'] === i0['inv-sats'];
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
    check(`${tag}: claim + withdraw book nothing more`, show(sB) === show({ ...sB, 'inv-usdcx': sA['inv-usdcx'], 'inv-sats': sA['inv-sats'] }), `${dInv(sB)}`);
  }
  {
    // a fresh vault state for the loop: wipe any rounding dust the round trips booked
    const sB = await state();
    if (sB['inv-usdcx'] !== 0n || sB['inv-sats'] !== 0n) note(`inventory after group B = (${sB['inv-usdcx']} uUSDCx, ${sB['inv-sats']} sats): dust carried into the loop`);
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
    await tx(`${nm} withdraw-usdcx -> NOT_OWNER`, who, VAULT, 'withdraw-usdcx', [uintCV(1n)], e(ERR.NOT_OWNER));
    await tx(`${nm} withdraw-stx -> NOT_OWNER`, who, VAULT, 'withdraw-stx', [uintCV(1n)], e(ERR.NOT_OWNER));
    await tx(`${nm} set-max-oracle-fee -> NOT_OWNER`, who, VAULT, 'set-max-oracle-fee', [uintCV(1n)], e(ERR.NOT_OWNER));
    await tx(`${nm} propose-owner -> NOT_OWNER`, who, VAULT, 'propose-owner', [someCV(P_(who))], e(ERR.NOT_OWNER));
    await tx(`${nm} set-keeper -> NOT_OWNER`, who, VAULT, 'set-keeper', [someCV(P_(who))], e(ERR.NOT_OWNER));
    await tx(`${nm} set-paused -> NOT_OWNER`, who, VAULT, 'set-paused', [boolCV(true)], e(ERR.NOT_OWNER));
    await tx(`${nm} set-edge-bps -> NOT_OWNER`, who, VAULT, 'set-edge-bps', [uintCV(0n)], e(ERR.NOT_OWNER));
  }
  await tx('stranger rung-withdraw -> NOT_AUTHORIZED', STRANGER, VAULT, 'rung-withdraw', [P_(R1), uintCV(1n), noneCV()], e(ERR.NOT_AUTH));
  await tx('stranger cancel-buy-back -> NOT_AUTHORIZED', STRANGER, VAULT, 'cancel-buy-back', [], e(ERR.NOT_AUTH));
  await tx('keeper rung-withdraw passes auth (no position -> rung ERR_NO_POSITION u7006)', KEEPER, VAULT, 'rung-withdraw', [P_(R1), uintCV(1n), noneCV()], E(7006));
  await tx('keeper cancel-buy-back passes auth (nothing on the book -> market error, not 82xx/81xx)', KEEPER, VAULT, 'cancel-buy-back', [], (v) => v?.err !== undefined && (v.err < BigInt(cfg.errBase) || v.err > BigInt(cfg.errBase + 99)));
  await tx('stranger sell -> NOT_AUTHORIZED', STRANGER, VAULT, 'sell', [P_(R1), uintCV(cfg.perRung)], e(ERR.NOT_AUTH));
  await tx('stranger claim -> NOT_AUTHORIZED', STRANGER, VAULT, 'claim', [P_(R1)], e(ERR.NOT_AUTH));
  await tx('stranger buy-back -> NOT_AUTHORIZED', STRANGER, VAULT, 'buy-back', [uintCV(1000n), uintCV(30n)], e(ERR.NOT_AUTH));
  await tx('stranger reprice -> NOT_AUTHORIZED', STRANGER, VAULT, 'reprice', [uintCV(30n)], e(ERR.NOT_AUTH));
  await tx('stranger reconcile -> NOT_AUTHORIZED', STRANGER, VAULT, 'reconcile', [], e(ERR.NOT_AUTH));
  await tx('keeper sell 0 -> ZERO_AMOUNT', KEEPER, VAULT, 'sell', [P_(R1), uintCV(0n)], e(ERR.ZERO));
  await tx('keeper buy-back 0 -> ZERO_AMOUNT', KEEPER, VAULT, 'buy-back', [uintCV(0n), uintCV(30n)], e(ERR.ZERO));
  await tx('owner withdraw-usdcx 0 -> ZERO_AMOUNT', OWNER, VAULT, 'withdraw-usdcx', [uintCV(0n)], e(ERR.ZERO));
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
    check('large unfilled sell books no inventory', i1['inv-usdcx'] === i0['inv-usdcx'] && i1['inv-sats'] === i0['inv-sats'], show({ i0: [i0['inv-usdcx'], i0['inv-sats']], i1: [i1['inv-usdcx'], i1['inv-sats']] }));
    await settlePending(sold, R, 'large sell');
    await freshUpd();
    await tx('keeper rung-withdraw the large sell (operator path)', KEEPER, VAULT, 'rung-withdraw', [P_(R), uintCV(10n ** 15n), someCV(updCV())], OK);
    const v1 = await bal(sold, VAULT);
    check(`large sell came back (loss <= 1 unit); principal 0`, v1 >= v0 - 1n && v1 <= v0 && (await rp(R)) === 0n, `${v0} -> ${v1}`);
    await call(OWNER, VAULT, sold === 'x' ? 'withdraw-sbtc' : 'withdraw-usdcx', [uintCV(big - 1n)]);
  }
  await tx('keeper buy-back with no inventory -> NO_INVENTORY', KEEPER, VAULT, 'buy-back', [uintCV(1000n), uintCV(30n)], e(ERR.NO_INV));
  await tx('keeper reprice with no inventory -> NO_INVENTORY', KEEPER, VAULT, 'reprice', [uintCV(30n)], e(ERR.NO_INV));
  await tx('owner pause', OWNER, VAULT, 'set-paused', [boolCV(true)], { ok: true });
  await tx('keeper sell while paused -> PAUSED', KEEPER, VAULT, 'sell', [P_(R1), uintCV(cfg.perRung)], e(ERR.PAUSED));
  await tx('keeper claim while paused -> PAUSED', KEEPER, VAULT, 'claim', [P_(R1)], e(ERR.PAUSED));
  await tx('keeper buy-back while paused -> PAUSED', KEEPER, VAULT, 'buy-back', [uintCV(1000n), uintCV(30n)], e(ERR.PAUSED));
  await tx('keeper reprice while paused -> PAUSED', KEEPER, VAULT, 'reprice', [uintCV(30n)], e(ERR.PAUSED));
  await tx('keeper rung-withdraw while paused -> PAUSED', KEEPER, VAULT, 'rung-withdraw', [P_(R1), uintCV(1n), noneCV()], e(ERR.PAUSED));
  await tx('keeper cancel-buy-back while paused -> PAUSED', KEEPER, VAULT, 'cancel-buy-back', [], e(ERR.PAUSED));
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
  const fillPx = [];
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
    const vw = sold === 'x' ? (invE0['inv-usdcx'] + gotTot) * SCALE / (invE0['inv-sats'] + soldTot) : (invE0['inv-usdcx'] + soldTot) * SCALE / (invE0['inv-sats'] + gotTot);
    check('inventory += (got, consumed); VWAP = harness', sE[invGot] === invE0[invGot] + gotTot && sE[invSold] === invE0[invSold] + soldTot && sE['vwap-sell'] === vw, show({ inv: [sE['inv-usdcx'], sE['inv-sats']], vwap: sE['vwap-sell'], want: vw }));
    checkBound('after fill 1', sE);
    fillPx.push(fill);
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
    const vw = sold === 'x' ? (invE0['inv-usdcx'] + gotTot) * SCALE / (invE0['inv-sats'] + soldTot) : (invE0['inv-usdcx'] + soldTot) * SCALE / (invE0['inv-sats'] + gotTot);
    check('inventory = both fills; VWAP = weighted harness VWAP', sE[invGot] === invE0[invGot] + gotTot && sE[invSold] === invE0[invSold] + soldTot && sE['vwap-sell'] === vw, show({ inv: [sE['inv-usdcx'], sE['inv-sats']], vwap: sE['vwap-sell'], want: vw }));
    checkBound('after fill 2', sE);
    if (consumed > 0n && gIn > 0n) fillPx.push(px(consumed, gIn));
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
      check('inventory += old-epoch payout', inv1[invGot] === inv0[invGot] + gIn && inv1[invSold] === inv0[invSold] + consumed, show({ before: [inv0['inv-usdcx'], inv0['inv-sats']], after: [inv1['inv-usdcx'], inv1['inv-sats']], gIn, consumed }));
      // VWAP blend: rung-1 fills + this rung-30 fill, booked at different prices
      gotTot += gIn; soldTot += consumed;
      const p30 = px(consumed, gIn);
      const vwB = sold === 'x' ? (invE0['inv-usdcx'] + gotTot) * SCALE / (invE0['inv-sats'] + soldTot) : (invE0['inv-usdcx'] + soldTot) * SCALE / (invE0['inv-sats'] + gotTot);
      check(`VWAP blend: rung-30 fill price ${p30} differs from the rung-1 fills ${fillPx.join('/')}`, fillPx.length > 0 && fillPx.every((q) => q !== p30), show(fillPx));
      check('VWAP blend: vwap-sell = sum(USDCx) x 1e10 / sum(sats) over all three fills', inv1['vwap-sell'] === vwB && inv1['vwap-sell'] !== p30, `${inv1['vwap-sell']} vs ${vwB}`);
      const lo = fillPx.concat([p30]).reduce((a, b) => (a < b ? a : b)), hi = fillPx.concat([p30]).reduce((a, b) => (a > b ? a : b));
      check(`VWAP blend lies between the cheapest and dearest fill (${lo}..${hi})`, inv1['vwap-sell'] >= lo && inv1['vwap-sell'] <= hi, `${inv1['vwap-sell']}`);
      checkBound('after the blend', inv1);
      note(`${cfg.side} sold-out vault fill price ${px(consumed, gIn)} vs rung price ${ff.our}: ${fmtBps(px(consumed, gIn), ff.our)} bps`);
      await tx('keeper claim(rung-30) again with no position -> rung ERR_NO_POSITION u7006', KEEPER, VAULT, 'claim', [P_(R30)], E(7006));
    } else {
      // could not fill: take the deposit back
      await freshUpd();
      await tx('owner rung-withdraw rung-30 (fill skipped)', OWNER, VAULT, 'rung-withdraw', [P_(R30), uintCV(10n ** 15n), someCV(updCV())], OK);
    }
  }

  // ---------------------------------------------------------------- F2 ---
  setGroup('F2 donation to a rung is not booked');
  {
    const R = RUNG(40), tag = `${cfg.rungPrefix}40`;
    await tx(`keeper sell ${cfg.perRung} into ${tag}`, KEEPER, VAULT, 'sell', [P_(R), uintCV(cfg.perRung)], { ok: cfg.perRung });
    await settlePending(sold, R, tag);
    const members = (await evalIn(R, '(get-state)')).members;
    const i0 = await state(), g0 = await bal(got, VAULT), p0 = await rp(R);
    // donate the proceeds token straight to the deployed rung
    await fund(got, R, cfg.donation);
    const cl = await tx(`keeper claim(${tag}) after a ${cfg.donation} ${got} donation (no fill)`, KEEPER, VAULT, 'claim', [P_(R)], OK);
    const gIn = (await bal(got, VAULT)) - g0;
    const i1 = await state();
    console.log(`  donation: rung members ${members}, vault received ${gIn} ${got}, claim -> ${show(cl.res)}`);
    check('rung paid (part of) the donation to the vault as proceeds', gIn > 0n && gIn <= cfg.donation, `${gIn} of ${cfg.donation} (members ${members})`);
    check('claim books 0 consumed; principal unchanged', cl.res?.ok === 0n && (await rp(R)) === p0, `${show(cl.res)}, principal ${p0} -> ${await rp(R)}`);
    check('inventory stays paired: inv-usdcx and inv-sats both unchanged', i1['inv-usdcx'] === i0['inv-usdcx'] && i1['inv-sats'] === i0['inv-sats'], show({ i0: [i0['inv-usdcx'], i0['inv-sats']], i1: [i1['inv-usdcx'], i1['inv-sats']] }));
    const bk = prints(cl.receipt).find((p) => p.event === 'yg-rung-booked');
    check('yg-rung-booked shows the proceeds but 0 consumed, fill-price 0', bk && bk[cfg.posKey === 'sbtc' ? 'sats-consumed' : 'usdcx-consumed'] === 0n && bk['fill-price'] === 0n, show(bk));
    // untracked extra: reconcile leaves it alone, owner can take it out
    await tx('keeper reconcile with the untracked extra in the vault', KEEPER, VAULT, 'reconcile', [], OK);
    const i2 = await state();
    check('reconcile does not raise inventory with the extra', i2['inv-usdcx'] === i0['inv-usdcx'] && i2['inv-sats'] === i0['inv-sats'], show({ i2: [i2['inv-usdcx'], i2['inv-sats']] }));
    const o0 = await bal(got, OWNER);
    await tx(`owner withdraws the donated ${gIn} ${got}`, OWNER, VAULT, got === 'x' ? 'withdraw-sbtc' : 'withdraw-usdcx', [uintCV(gIn)], { ok: gIn });
    const i3 = await state();
    check('owner received the donation; inventory still unchanged', (await bal(got, OWNER)) === o0 + gIn && i3['inv-usdcx'] === i0['inv-usdcx'] && i3['inv-sats'] === i0['inv-sats'], show({ i3: [i3['inv-usdcx'], i3['inv-sats']] }));
    await freshUpd();
    await tx(`keeper rung-withdraw ${tag}`, KEEPER, VAULT, 'rung-withdraw', [P_(R), uintCV(10n ** 15n), someCV(updCV())], { ok: 0n });
    check(`${tag} principal 0; inventory unchanged`, (await rp(R)) === 0n && show(await state()) === show({ ...(await state()), 'inv-usdcx': i0['inv-usdcx'], 'inv-sats': i0['inv-sats'] }));
  }

  // ---------------------------------------------------------------- J ----
  // Guard proof: book-rung books only when proceeds AND consumed are > 0 in
  // the same call. Hunt for a call that observes consumed > 0 with no
  // proceeds (a real sale that would now be dropped), across every vault
  // entry point as the FIRST call after a fill.
  setGroup('J guard proof: every fill books in the call that sees it');
  {
    const inKey = got === 'y' ? 'usdcx-in' : 'sbtc-in';
    const conKey = sold === 'x' ? 'sats-consumed' : 'usdcx-consumed';
    const dropped = [];
    async function booked(label, sender, R, fn, args, sentNow = 0n) {
      const exp = (await rp(R)) + sentNow, g0 = await bal(got, VAULT), b0 = await bal(sold, VAULT), i0 = await state();
      const r = await tx(label, sender, VAULT, fn, args, OK);
      const gIn = (await bal(got, VAULT)) - g0;
      const back = (await bal(sold, VAULT)) + sentNow - b0;
      const left = await rr(R);
      const conH = exp - left - back;
      const bk = prints(r.receipt).find((p) => p.event === 'yg-rung-booked') ?? {};
      const i1 = await state();
      const dGot = i1[invGot] - i0[invGot], dSold = i1[invSold] - i0[invSold];
      console.log(`  ${label}: print ${conKey} ${bk[conKey]} ${inKey} ${bk[inKey]}; harness consumed ${conH}, got ${gIn}, back ${back}, left ${left}; inv +(${dGot} ${got}, ${dSold} ${sold})`);
      check(`${label}: print consumed = harness consumed, print proceeds = balance delta`, bk[conKey] === conH && bk[inKey] === gIn, show({ print: [bk[conKey], bk[inKey]], harness: [conH, gIn] }));
      if (conH > 0n && gIn === 0n) dropped.push(`${label}: consumed ${conH} ${sold} with 0 ${got}`);
      check(`${label}: consumed > 0 implies proceeds > 0 in the same call`, !(conH > 0n && gIn === 0n), `consumed ${conH}, proceeds ${gIn}`);
      const want = conH > 0n && gIn > 0n ? [gIn, conH] : [0n, 0n];
      check(`${label}: inventory delta = (proceeds, consumed) when both > 0, else 0`, dGot === want[0] && dSold === want[1], show({ dGot, dSold, want }));
      return { conH, gIn };
    }
    const tot = { recv: 0n, sold: 0n, invGot: 0n, invSold: 0n };
    const soldOf = (f) => (sold === 'x' ? f.sx : f.sy);
    const addFill = (f) => { if (f) { tot.recv += f.received; tot.sold += soldOf(f); } };
    const addBook = (b) => { if (b.conH > 0n && b.gIn > 0n) { tot.invGot += b.gIn; tot.invSold += b.conH; } };
    const P = cfg.sell / 2n;

    // rung A: vault alone; each fill is followed by a different first call
    const RA = RUNG(50), ta = `${cfg.rungPrefix}50`;
    must(`${ta} has no members (vault alone)`, (await evalIn(RA, '(get-state)')).members === 0n);
    await tx(`keeper sell ${P} into ${ta}`, KEEPER, VAULT, 'sell', [P_(RA), uintCV(P)], { ok: P });
    await settlePending(sold, RA, ta);
    let f = await forceFill(sold, RA, 0.3, 'J1 fill ~30%'); addFill(f);
    // J1: first call = sell more (deposit); the top-up stays pending on the market
    addBook(await booked('J1 first call after fill = sell more', KEEPER, RA, 'sell', [P_(RA), uintCV(cfg.perRung)], cfg.perRung));
    const pend = await pendOf(sold, RA);
    check('J2 setup: the top-up is still pending on the market', !!pend, show(pend));
    f = await forceFill(sold, RA, 0.3, 'J2 fill ~30% while a top-up is pending'); addFill(f);
    addBook(await booked('J2 first call after fill (top-up pending) = claim', KEEPER, RA, 'claim', [P_(RA)]));
    await settlePending(sold, RA, ta);
    f = await forceFill(sold, RA, 0.3, 'J3 fill ~30%'); addFill(f);
    await freshUpd();
    const part = (await rr(RA)) / 3n;
    addBook(await booked(`J3 first call after fill = partial rung-withdraw ${part}`, KEEPER, RA, 'rung-withdraw', [P_(RA), uintCV(part), someCV(updCV())]));
    f = await forceFill(sold, RA, 0.3, 'J4 fill ~30% (cycle roll 1)'); addFill(f);
    const f4b = await forceFill(sold, RA, 0.3, 'J4 fill ~30% (cycle roll 2)'); addFill(f4b);
    if (f && f4b) check('J4: two market cycle rolls before the first vault call', f4b.c1 >= f.c0 + 2n, `${f.c0} -> ${f4b.c1}`);
    await freshUpd();
    addBook(await booked('J4 first call after two fills = full rung-withdraw', OWNER, RA, 'rung-withdraw', [P_(RA), uintCV(10n ** 15n), someCV(updCV())]));
    check(`${ta}: principal 0 after full withdraw`, (await rp(RA)) === 0n);

    // rung B: sold out (rung epoch roll) before the first vault call, which is a sell
    const RB = RUNG(60), tb = `${cfg.rungPrefix}60`;
    must(`${tb} has no members`, (await evalIn(RB, '(get-state)')).members === 0n);
    await tx(`keeper sell ${cfg.soldOut} into ${tb}`, KEEPER, VAULT, 'sell', [P_(RB), uintCV(cfg.soldOut)], { ok: cfg.soldOut });
    await settlePending(sold, RB, tb);
    const e0 = (await evalIn(RB, '(get-state)')).epoch;
    f = await forceFill(sold, RB, 1, 'J5 fill rung-60 fully (sold out)', { full: true }); addFill(f);
    addBook(await booked('J5 first call after sold out = sell more (rolls the rung epoch)', KEEPER, RB, 'sell', [P_(RB), uintCV(cfg.perRung)], cfg.perRung));
    check(`J5: rung-60 epoch rolled (${e0} -> ${(await evalIn(RB, '(get-state)')).epoch})`, (await evalIn(RB, '(get-state)')).epoch > e0);
    await settlePending(sold, RB, tb);
    await freshUpd();
    addBook(await booked('J5 cleanup: full rung-withdraw of the new deposit', KEEPER, RB, 'rung-withdraw', [P_(RB), uintCV(10n ** 15n), someCV(updCV())]));

    // totals: every fill on the vault-only rungs reached inventory
    console.log(`  J totals: fills sold ${tot.sold} ${sold} for ${tot.recv} ${got}; inventory booked ${tot.invSold} ${sold} / ${tot.invGot} ${got}`);
    check('J: inventory booked = sum of independently matched fills (sold side, rounding <= 1 unit per call)', tot.invSold <= tot.sold && tot.sold - tot.invSold <= 8n, `${tot.invSold} vs ${tot.sold}`);
    check('J: inventory proceeds = sum of rung receipts (rounding <= 1 unit per call)', tot.invGot <= tot.recv && tot.recv - tot.invGot <= 8n, `${tot.invGot} vs ${tot.recv}`);

    note(dropped.length ? `${cfg.side} DROPPED SALES: ${dropped.join(' | ')}` : `${cfg.side} J: no sale dropped in any case`);
  }

  // ---------------------------------------------------------------- G ----
  setGroup('G leg 2 buy-back');
  let sG = await state();
  const INV = sG[invGot];
  const CAP = sG[cfg.capFn];
  console.log(`  inventory ${sG['inv-usdcx']} uUSDCx / ${sG['inv-sats']} sats, vwap ${sG['vwap-sell']}, ${cfg.capFn} ${CAP}`);
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
    const closed = pre[invSold] - post[invSold];
    check(`realized profit on fill 1: received ${b1.received} ${sold} > inventory closed ${closed} ${sold}`, b1.received > closed, `${b1.received} vs ${closed}`);
    note(`${cfg.side} leg 2 fill 1 realized: +${b1.received - closed} ${sold} on ${closed} closed (${fmtBps(b1.received, closed)} bps)`);
    checkBound('after the pro-rata reconcile', post);
    check(`VWAP rounding only makes the ${cfg.capIsFloor ? 'floor stricter (vwap up)' : 'cap stricter (vwap down)'}`, stricter(post['vwap-sell'], pre['vwap-sell']), `${pre['vwap-sell']} -> ${post['vwap-sell']}`);
    // the other side rounds by < 1 unit: one unit less would put VWAP back on the other side of the old one
    const bracket = cfg.capIsFloor ? (post['inv-usdcx'] - 1n) * SCALE / post['inv-sats'] <= pre['vwap-sell'] : post['inv-usdcx'] * SCALE / (post['inv-sats'] - 1n) >= pre['vwap-sell'];
    check('VWAP drift is within 1 unit of the rounded side', bracket, `${pre['vwap-sell']} -> ${post['vwap-sell']}`);
  }
  // cancel + re-post
  {
    const on = await evalIn(VAULT, `(${cfg.onMarketFn})`);
    const s1 = await state();
    const g0 = await bal(got, VAULT);
    await tx('keeper cancel-buy-back (operator path)', KEEPER, VAULT, 'cancel-buy-back', [], { ok: on });
    check(`vault ${got} += cancelled order`, (await bal(got, VAULT)) === g0 + on);
    await tx('keeper reconcile after cancel', KEEPER, VAULT, 'reconcile', [], OK);
    const s2 = await state();
    check('cancel does not shrink inventory (USDCx/sats still in the vault)', s2[invGot] === s1[invGot] && s2[invSold] === s1[invSold], show({ s1: [s1['inv-usdcx'], s1['inv-sats']], s2: [s2['inv-usdcx'], s2['inv-sats']] }));
    const rpx = await call(KEEPER, VAULT, 'reprice', [uintCV(30n)]);
    check('keeper reprice with nothing on the book fails (market ERR_NOTHING_TO_WITHDRAW)', !rpx.vm && rpx.res?.err !== undefined, show(rpx.res ?? rpx.vm));
    note(`reprice with no resting order -> ${show(rpx.res)}`);
    const inv = s2[invGot];
    await tx(`keeper re-post buy-back ${inv}, spread 30`, KEEPER, VAULT, 'buy-back', [uintCV(inv), uintCV(30n)], OK);
    await settlePending(got, VAULT, 're-post');
  }
  // full fill -> reset at dust
  {
    const preFull = await state();
    const b2 = await forceFill(got, VAULT, 1, 'buy-back full fill', { full: true });
    if (b2) note(`${cfg.side} leg 2 full fill: ${b2.bps} bps, order ${b2.d0} -> ${b2.d1}`);
    await tx('keeper reconcile after full fill', KEEPER, VAULT, 'reconcile', [], OK);
    const s3 = await state();
    if (b2) {
      const closed = preFull[invSold] - s3[invSold];
      check(`realized profit on the full fill: received ${b2.received} ${sold} > inventory closed ${closed} ${sold}`, b2.received > closed && closed > 0n, `${b2.received} vs ${closed}`);
      note(`${cfg.side} leg 2 full fill realized: +${b2.received - closed} ${sold} on ${closed} closed (${fmtBps(b2.received, closed)} bps)`);
    }
    const have = s3[cfg.heldGotKey] + s3[cfg.onMarketKey];
    if (have < cfg.resetDust) check('inventory reset to 0 at dust', s3['inv-usdcx'] === 0n && s3['inv-sats'] === 0n && s3['vwap-sell'] === 0n, show(s3));
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
    const ous = await usdcxBal(OWNER), osb = await sbtcBal(OWNER), kus = await usdcxBal(KEEPER), ksb = await sbtcBal(KEEPER);
    const vus = await usdcxBal(VAULT), vsb = await sbtcBal(VAULT);
    if (vus > 0n) await tx(`owner withdraw-usdcx ${vus}`, OWNER, VAULT, 'withdraw-usdcx', [uintCV(vus)], { ok: vus });
    if (vsb > 0n) await tx(`owner withdraw-sbtc ${vsb}`, OWNER, VAULT, 'withdraw-sbtc', [uintCV(vsb)], { ok: vsb });
    await tx('owner withdraw-usdcx 1 from an empty vault -> aborts', OWNER, VAULT, 'withdraw-usdcx', [uintCV(1n)], (v) => v?.err !== undefined);
    await tx('owner withdraw-sbtc 1 from an empty vault -> aborts', OWNER, VAULT, 'withdraw-sbtc', [uintCV(1n)], (v) => v?.err !== undefined);
    check('owner received everything; keeper got nothing; vault empty of sBTC/USDCx', (await usdcxBal(OWNER)) === ous + vus && (await sbtcBal(OWNER)) === osb + vsb && (await usdcxBal(KEEPER)) === kus && (await sbtcBal(KEEPER)) === ksb && (await usdcxBal(VAULT)) === 0n && (await sbtcBal(VAULT)) === 0n);
    check('vault STX untouched by the loop and the owner exits', (await stxBal(VAULT)) === STX_GIFT, `${await stxBal(VAULT)}`);
    const sH = await state();
    check('inventory reset once the open side left the vault', sH['inv-usdcx'] === 0n && sH['inv-sats'] === 0n, show(sH));
  }
  await tx('owner propose-owner(new)', OWNER, VAULT, 'propose-owner', [someCV(P_(NEW_OWNER))], { ok: true });
  check('pending owner = new', (await evalIn(VAULT, '(get-pending-owner)')) === NEW_OWNER);
  await tx('stranger accept-owner -> NOT_PENDING_OWNER', STRANGER, VAULT, 'accept-owner', [], e(ERR.NOT_PENDING));
  await tx('owner propose-owner(none) cancels', OWNER, VAULT, 'propose-owner', [noneCV()], { ok: true });
  await tx('new owner accept after cancel -> NOT_PENDING_OWNER', NEW_OWNER, VAULT, 'accept-owner', [], e(ERR.NOT_PENDING));
  await tx('owner propose-owner(new) again', OWNER, VAULT, 'propose-owner', [someCV(P_(NEW_OWNER))], { ok: true });
  await tx('old owner still owner before accept (set-paused ok)', OWNER, VAULT, 'set-paused', [boolCV(false)], { ok: true });
  await tx('new owner accept-owner', NEW_OWNER, VAULT, 'accept-owner', [], { ok: true });
  await tx('old owner withdraw-usdcx -> NOT_OWNER', OWNER, VAULT, 'withdraw-usdcx', [uintCV(1n)], e(ERR.NOT_OWNER));
  await tx('old owner reconcile -> NOT_AUTHORIZED', OWNER, VAULT, 'reconcile', [], e(ERR.NOT_AUTH));
  await tx('new owner set-paused ok', NEW_OWNER, VAULT, 'set-paused', [boolCV(false)], { ok: true });
  const oo = await evalIn(VAULT, '{ o: (get-owner), p: (get-pending-owner) }');
  check('owner = new, pending cleared', oo.o === NEW_OWNER && oo.p === null, show(oo));
  check('keeper survives the handover (new owner must reset it if unwanted)', (await evalIn(VAULT, '(get-keeper)')) === KEEPER);

  // ---------------------------------------------------------------- I ----
  setGroup('I allowances (hostile rung + hostile market variant)');
  const EVR = `${OWNER}.yg-evil-rung-${cfg.side}`, EVM = `${OWNER}.yg-evil-market-${cfg.side}`, VV = `${OWNER}.yg-variant-${cfg.side}`;
  const r90 = `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.${cfg.rungPrefix}90`;
  const vsrc = src.split(r90).join(EVR).replace(/\(define-constant MARKET '[^)]+\)/, `(define-constant MARKET '${EVM})`);
  const mode = (c, m) => tx(`set ${c.split('.')[1]} mode ${m}`, OWNER, c, 'set-mode', [uintCV(m)], { ok: true });
  {
    await deploy(OWNER, `yg-evil-rung-${cfg.side}`, evilRung());
    await deploy(OWNER, `yg-evil-market-${cfg.side}`, evilMarket());
    must('variant source swaps rung 90 (2 sites) + MARKET', vsrc !== src && vsrc.split(EVR).length === 3 && vsrc.includes(`(define-constant MARKET '${EVM})`));
    await deploy(OWNER, `yg-variant-${cfg.side}`, vsrc);
    await tx('variant set-keeper(keeper)', OWNER, VV, 'set-keeper', [someCV(P_(KEEPER))], { ok: true });
    await fund(sold, VV, cfg.perRung * 5n);
    await fund(got, VV, cfg.evilPay * 2n);
    await fund(got, EVR, cfg.evilPay * 2n);
    await stxTransfer(WHALE.stx, VV, STX_GIFT);
    const snap = async () => ({ vs: await bal(sold, VV), vg: await bal(got, VV), stx: await stxBal(VV), st: await evalIn(VV, '(get-state)') });
    const same = (a, b) => a.vs === b.vs && a.vg === b.vg && a.stx === b.stx && show(a.st) === show(b.st);
    const aborts = async (label, sender, fn, args) => {
      const a = await snap();
      const r = await call(sender, VV, fn, args);
      check(label, (r.res?.err !== undefined || r.vm) && same(a, await snap()), show(r.res ?? r.vm));
    };
    // rung paths
    await mode(EVR, 0n);
    await tx(`honest hostile rung: sell ${cfg.perRung} ok (control)`, KEEPER, VV, 'sell', [P_(EVR), uintCV(cfg.perRung)], { ok: cfg.perRung });
    await mode(EVR, 1n);
    await aborts('rung pulls amount + 1 on deposit -> sell aborts, nothing moves', KEEPER, 'sell', [P_(EVR), uintCV(cfg.perRung)]);
    await aborts(`rung pulls 1 ${sold} on claim (no allowance) -> claim aborts`, KEEPER, 'claim', [P_(EVR)]);
    await aborts('rung pulls 1 uSTX on withdraw (no allowance at all) -> rung-withdraw aborts', OWNER, 'rung-withdraw', [P_(EVR), uintCV(1n), noneCV()]);
    await mode(EVR, 3n);
    await aborts('rung pulls 1 uSTX on deposit -> sell aborts', KEEPER, 'sell', [P_(EVR), uintCV(cfg.perRung)]);
    await aborts('rung pulls 1 uSTX on claim -> claim aborts', KEEPER, 'claim', [P_(EVR)]);
    await aborts('rung pulls 1 uSTX on withdraw -> rung-withdraw aborts', KEEPER, 'rung-withdraw', [P_(EVR), uintCV(1n), noneCV()]);
    await mode(EVR, 2n);
    await tx(`honest-paying hostile rung: claim pays ${cfg.evilPay} ${got} (control, books inventory)`, KEEPER, VV, 'claim', [P_(EVR)], OK);
    const sv = await evalIn(VV, '(get-state)');
    check('variant inventory booked from the payout', sv[invGot] === cfg.evilPay && sv[invSold] === cfg.perRung, show(sv));
    // market paths
    await mode(EVM, 0n);
    const amt = cfg.evilPay / 4n;
    await tx(`honest hostile market: buy-back ${amt} ok (control)`, KEEPER, VV, 'buy-back', [uintCV(amt), uintCV(30n)], OK);
    await mode(EVM, 1n);
    await aborts('market pulls amount + 1 on deposit -> buy-back aborts', KEEPER, 'buy-back', [uintCV(amt), uintCV(30n)]);
    await aborts('market pulls 1 on set-limit (no allowance) -> reprice aborts', KEEPER, 'reprice', [uintCV(30n)]);
    await aborts('market pulls 1 on cancel (no allowance) -> cancel-buy-back aborts', OWNER, 'cancel-buy-back', []);
    await mode(EVM, 3n);
    await aborts('market pulls 1 uSTX on deposit -> buy-back aborts', KEEPER, 'buy-back', [uintCV(amt), uintCV(30n)]);
    await aborts('market pulls 1 uSTX on set-limit -> reprice aborts', KEEPER, 'reprice', [uintCV(30n)]);
    await aborts('market pulls 1 uSTX on cancel -> cancel-buy-back aborts', KEEPER, 'cancel-buy-back', []);
    await mode(EVM, 0n);
    const a = await snap();
    await aborts('owner withdraw more than the vault holds aborts', OWNER, sold === 'x' ? 'withdraw-sbtc' : 'withdraw-usdcx', [uintCV(a.vs + 1n)]);
    check('variant STX gift untouched', (await stxBal(VV)) === STX_GIFT);
  }

  // ---------------------------------------------------------------- K ----
  // rung-withdraw carries a Lazer update the rung uses to settle its own
  // pending market order; the oracle charges its fee to tx-sender (the
  // vault). max-oracle-fee is the STX allowance for that fee. The owner is
  // NEW_OWNER after group H. K5 (fee > 0) runs before K4 (synthetic +25 h
  // makes every real Lazer update stale).
  setGroup('K oracle-fee allowance');
  const ALL = uintCV(10n ** 15n);
  const RL = RUNG(90), tl = `${cfg.rungPrefix}90`;
  let lLeft = 0n, feePaid = 0n;
  {
    const ORACLE = 'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle';
    const ORACLE_GOV = 'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8';
    const RK = RUNG(70), RF = RUNG(80), tk = `${cfg.rungPrefix}70`, tf = `${cfg.rungPrefix}80`;
    must(`${tk} and ${tf}: vault has no principal left`, (await rr(RK)) === 0n && (await rp(RK)) === 0n && (await rr(RF)) === 0n && (await rp(RF)) === 0n);
    // seed: a far opposite-side order, so rung deposits go pending (never fills)
    {
      const o = other(sold), cyc = await curCycle();
      const n = (await evalIn(MARKET, `(get-token-${o}-depositors u${cyc})`)).length;
      if (n === 0) {
        const SEED = mk(cfg.seed + 7);
        const amt = o === 'x' ? 1_100n : 1_100_000n;
        await freshUpd(true);
        const lim = o === 'x' ? S.MID * 3n : 1n; // ask at 3x mid / bid at 1
        await stxTransfer(WHALE.stx, SEED, 1_000_000n);
        await fund(o, SEED, amt);
        await tx(`K0 seed a far ${o} order (limit ${lim}) so the ${sold} side goes pending`, SEED, MARKET, `deposit-token-${o}`, [uintCV(amt), uintCV(lim), noneCV(), T[o], A[o]], { ok: amt });
        await settlePending(o, SEED, 'K0 seed');
        check(`K0 the seed order is live on side ${o}`, (await depOf(o, SEED)) === amt, `${await depOf(o, SEED)}`);
      } else note(`K0: side ${other(sold)} already has ${n} depositors`);
    }
    // K1
    check('K1 get-state max-oracle-fee = u0', (await state())['max-oracle-fee'] === 0n);
    await tx('K1 keeper set-max-oracle-fee -> NOT_OWNER', KEEPER, VAULT, 'set-max-oracle-fee', [uintCV(1n)], e(ERR.NOT_OWNER));
    await tx('K1 stranger set-max-oracle-fee -> NOT_OWNER', STRANGER, VAULT, 'set-max-oracle-fee', [uintCV(1n)], e(ERR.NOT_OWNER));
    const s0k = await tx('K1 owner set-max-oracle-fee 0', NEW_OWNER, VAULT, 'set-max-oracle-fee', [uintCV(0n)], { ok: true });
    check('K1 print yg-set-max-oracle-fee', prints(s0k.receipt).some((p) => p.event === 'yg-set-max-oracle-fee' && p.fee === 0n));
    check('K1 oracle fee is 0 on the fork', (await evalIn(ORACLE, '(get-fee)')) === 0n);
    await fund(sold, VAULT, cfg.perRung * 5n);
    const sellPending = async (R, label) => {
      await tx(`${label}: keeper sell ${cfg.perRung} into ${R.split('.')[1]}`, KEEPER, VAULT, 'sell', [P_(R), uintCV(cfg.perRung)], { ok: cfg.perRung });
      const p = await pendOf(sold, R);
      must(`${label}: the rung's market order is pending`, !!p, show(p));
      return p;
    };
    // K2: fee 0, the update settles the pending order, withdraw goes through at once
    await sellPending(RK, 'K2');
    await freshUpd();
    let v0 = await bal(sold, VAULT), x0 = await stxBal(VAULT);
    await tx('K2 fee 0: keeper rung-withdraw all with (some update) -> ok', KEEPER, VAULT, 'rung-withdraw', [P_(RK), ALL, someCV(updCV())], OK);
    let v1 = await bal(sold, VAULT);
    check('K2 rung order no longer pending; vault principal 0', !(await pendOf(sold, RK)) && (await rp(RK)) === 0n && (await rr(RK)) === 0n);
    check(`K2 vault got its ${sold} back (loss <= 1 unit); vault STX unchanged`, v1 >= v0 + cfg.perRung - 1n && v1 <= v0 + cfg.perRung && (await stxBal(VAULT)) === x0, `${v0} -> ${v1}`);
    // K3: fee 0, no update while the pending order is under 24 h old
    const pK = await sellPending(RK, 'K3');
    await tx('K3 rung-withdraw with none while pending < 24 h -> rung ERR_UPDATE_REQUIRED u7012', KEEPER, VAULT, 'rung-withdraw', [P_(RK), ALL, noneCV()], E(7012));
    // K5: fee > 0 (oracle governance impersonated on the fork)
    const gov = await evalIn(ORACLE, `(has-role '${ORACLE_GOV} 0x00)`);
    if (!gov) note(`K5 skipped: ${ORACLE_GOV} no longer holds oracle governance`);
    else {
      const F = 1_000n;
      const RCP = await evalIn(ORACLE, '(get-fee-recipient)');
      await tx(`K5 oracle governance set-fee ${F}`, ORACLE_GOV, ORACLE, 'set-fee', [uintCV(F)], { ok: true });
      check(`K5 oracle fee = ${F}`, (await evalIn(ORACLE, '(get-fee)')) === F);
      check(`K5 the vault holds STX to pay from (${await stxBal(VAULT)} >= ${F})`, (await stxBal(VAULT)) >= F);
      await sellPending(RF, 'K5');
      await freshUpd();
      const snapK = async () => ({ vs: await bal(sold, VAULT), vg: await bal(got, VAULT), vstx: await stxBal(VAULT), rcp: await stxBal(RCP), left: await rr(RF), pend: show(await pendOf(sold, RF)) });
      const a = await snapK();
      const r0 = await call(KEEPER, VAULT, 'rung-withdraw', [P_(RF), ALL, someCV(updCV())]);
      const b = await snapK();
      check('K5 fee > 0, max-oracle-fee u0: rung-withdraw with update aborts, no STX leaves, nothing moves', (r0.res?.err !== undefined || r0.vm) && show(a) === show(b), show(r0.res ?? r0.vm));
      await tx(`K5 owner set-max-oracle-fee ${F}`, NEW_OWNER, VAULT, 'set-max-oracle-fee', [uintCV(F)], { ok: true });
      check(`K5 get-state max-oracle-fee = ${F}`, (await state())['max-oracle-fee'] === F);
      const r1 = await tx('K5 rung-withdraw with a fresh update while the oracle charges, cap = fee -> ok', KEEPER, VAULT, 'rung-withdraw', [P_(RF), ALL, someCV(updCV())], OK);
      const c = await snapK();
      check(`K5 fee recipient got exactly ${F} uSTX`, c.rcp === b.rcp + F, `${b.rcp} -> ${c.rcp}`);
      check(`K5 vault STX dropped by exactly the fee ${F}`, c.vstx === b.vstx - F, `${b.vstx} -> ${c.vstx}`);
      check(`K5 vault got its ${sold} back in full (loss <= 1 unit), rung order no longer pending, principal 0`, c.vs >= b.vs + b.left - 1n && c.vs <= b.vs + b.left && c.left === 0n && (await rp(RF)) === 0n && !(await pendOf(sold, RF)), show({ b, c }));
      feePaid += F;
      const ev = prints(r1.receipt).find((p) => p.event === 'yg-rung-booked');
      note(`K5 yg-rung-booked after a paid fee: ${show(ev)}`);
      await tx(`K5b owner set-max-oracle-fee ${F - 1n} (< fee)`, NEW_OWNER, VAULT, 'set-max-oracle-fee', [uintCV(F - 1n)], { ok: true });
      await sellPending(RF, 'K5b');
      await freshUpd();
      const a2 = await snapK();
      const r2 = await call(KEEPER, VAULT, 'rung-withdraw', [P_(RF), ALL, someCV(updCV())]);
      check('K5b fee above max-oracle-fee: rung-withdraw with update aborts, nothing moves', (r2.res?.err !== undefined || r2.vm) && show(a2) === show(await snapK()), show(r2.res ?? r2.vm));
      await tx('K5 oracle governance set-fee 0 (restore)', ORACLE_GOV, ORACLE, 'set-fee', [uintCV(0n)], { ok: true });
      await tx('K5 owner set-max-oracle-fee 0 (restore)', NEW_OWNER, VAULT, 'set-max-oracle-fee', [uintCV(0n)], { ok: true });
      await freshUpd();
      const x1 = await stxBal(VAULT);
      await tx(`K5b cleanup: rung-withdraw ${tf} with update at fee 0`, KEEPER, VAULT, 'rung-withdraw', [P_(RF), ALL, someCV(updCV())], OK);
      check(`K5b cleanup: ${tf} principal 0; vault STX unchanged at fee 0`, (await rp(RF)) === 0n && (await stxBal(VAULT)) === x1);
    }
    // L setup: an order pushed and LIVE on the book before DIA goes stale
    await tx(`L setup: keeper sell ${cfg.perRung} into ${tl}`, KEEPER, VAULT, 'sell', [P_(RL), uintCV(cfg.perRung)], { ok: cfg.perRung });
    await settlePending(sold, RL, tl);
    lLeft = await rr(RL);
    check(`L setup: ${tl} order live on the market (not pending)`, !(await pendOf(sold, RL)) && (await depOf(sold, RL)) > 0n, `deposit ${await depOf(sold, RL)}`);
    // K4: the 24 h path, no oracle: the rung cancels its own pending order
    const t0 = await blockTime();
    const adv = await submitSimulationSteps(S.sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 90000 } }] });
    const t1 = await blockTime();
    must('K4 fork clock moved >= 86400 s past the pending order', t1 >= Number(pK['submitted-at']) + 86400, `${t0} -> ${t1}, submitted ${pK['submitted-at']} :: ${JSON.stringify(adv.steps?.[0]).slice(0, 300)}`);
    v0 = await bal(sold, VAULT);
    const left = await rr(RK);
    await tx('K4 after 24 h: rung-withdraw all with none -> ok', KEEPER, VAULT, 'rung-withdraw', [P_(RK), ALL, noneCV()], OK);
    v1 = await bal(sold, VAULT);
    check('K4 the rung cancelled its pending order itself; vault principal 0', !(await pendOf(sold, RK)) && (await rp(RK)) === 0n && (await rr(RK)) === 0n);
    check(`K4 vault got its ${sold} back (loss <= 1 unit)`, v1 >= v0 + left - 1n && v1 <= v0 + left, `${v0} -> ${v1} (left ${left})`);
  }

  // ---------------------------------------------------------------- L ----
  // DIA is > 2 h stale after K's +25 h: the rung guard reads 0. deposit /
  // claim / withdraw never read DIA, so vault funds never strand.
  setGroup('L DIA stale rung (> 2 h): funds never strand');
  {
    const R40 = RUNG(40), t40 = `${cfg.rungPrefix}40`;
    const mm = await evalIn(RUNG(1), '(miner-mid)');
    check('L rung miner-mid = 0 (DIA older than 2 h on the fork clock)', mm === 0n, `${mm}`);
    await tx(`L stranger refresh-guard on ${t40} -> rung ERR_ZERO_PRICE u7008`, STRANGER, R40, 'refresh-guard', [], E(7008));
    must(`L ${t40}: vault has no principal`, (await rp(R40)) === 0n);
    const v0 = await bal(sold, VAULT);
    await tx(`L keeper sell ${cfg.perRung} into ${t40} while DIA is stale -> ok`, KEEPER, VAULT, 'sell', [P_(R40), uintCV(cfg.perRung)], { ok: cfg.perRung });
    const rst = await evalIn(R40, '(get-state)');
    const held = rst[cfg.rungHeldKey];
    check(`L the deposit stays held in the rung (not pushed: guard 0), nothing pending on the market`, held >= cfg.perRung && !(await pendOf(sold, R40)), show(rst));
    const rem = await rr(R40);
    check('L rung-remaining = booked principal = deposit (+-1)', rem === (await rp(R40)) && (rem === cfg.perRung || rem === cfg.perRung - 1n), `${rem}`);
    await tx(`L stranger push ${t40} -> (ok false), nothing pushed`, STRANGER, R40, 'push', [], { ok: false });
    await tx(`L keeper claim ${t40} while stale -> ok u0`, KEEPER, VAULT, 'claim', [P_(R40)], { ok: 0n });
    await tx(`L keeper rung-withdraw ${t40} all with none while stale -> ok`, KEEPER, VAULT, 'rung-withdraw', [P_(R40), ALL, noneCV()], OK);
    const v1 = await bal(sold, VAULT);
    check(`L vault got the held deposit back (loss <= 1 unit); principal 0`, v1 >= v0 - 1n && v1 <= v0 && (await rp(R40)) === 0n, `${v0} -> ${v1}`);
    // the order that was live on the book before the stale window
    const w0 = await bal(sold, VAULT);
    await tx(`L owner rung-withdraw ${tl} (order live from before the stale window) with none -> ok`, NEW_OWNER, VAULT, 'rung-withdraw', [P_(RL), ALL, noneCV()], OK);
    const w1 = await bal(sold, VAULT);
    check(`L ${tl}: vault got the live order back (loss <= 1 unit), principal 0, no order left`, w1 >= w0 + lLeft - 1n && w1 <= w0 + lLeft && (await rp(RL)) === 0n && (await rr(RL)) === 0n, `${w0} -> ${w1} (left ${lLeft})`);
  }

  // ---------------------------------------------------------------- Z ----
  // Extreme inventory ratio through a hostile-rung variant: sell zSell, the
  // rung pays zPay. VWAP = 5,000 exactly on both sides; floor (sell-usdcx)
  // rounds up and stays > 0 at every edge; cap (sell-sbtc-usdcx) reaches 0 at
  // edge 9999 -> ERR_ZERO_CAP on buy-back and reprice.
  setGroup('Z floor / cap rounding at an extreme ratio');
  {
    const VZ = `${OWNER}.yg-variant-z-${cfg.side}`;
    await deploy(OWNER, `yg-variant-z-${cfg.side}`, vsrc);
    await tx('Z set-keeper(keeper)', OWNER, VZ, 'set-keeper', [someCV(P_(KEEPER))], { ok: true });
    await fund(sold, VZ, cfg.zSell);
    await fund(got, EVR, cfg.zPay);
    must('Z hostile rung holds no prior deposit', (await evalIn(EVR, '(var-get held)')) === 0n);
    await mode(EVR, 0n);
    await tx(`Z keeper sell ${cfg.zSell} ${sold} into the hostile rung`, KEEPER, VZ, 'sell', [P_(EVR), uintCV(cfg.zSell)], { ok: cfg.zSell });
    await mode(EVR, 4n);
    await tx(`Z keeper claim: rung pays ${cfg.zPay} ${got}`, KEEPER, VZ, 'claim', [P_(EVR)], { ok: cfg.zSell });
    const zs = () => evalIn(VZ, '(get-state)');
    let st = await zs();
    const nu = st['inv-usdcx'], ns = st['inv-sats'];
    check(`Z inventory = (${nu} uUSDCx, ${ns} sats); vwap-sell = 5000`, st['vwap-sell'] === 5000n && nu * SCALE / ns === 5000n, show(st));
    const setEdge = (b) => tx(`Z owner set-edge-bps ${b}`, OWNER, VZ, 'set-edge-bps', [uintCV(b)], { ok: true });
    await mode(EVM, 0n);
    if (cfg.capIsFloor) {
      check(`Z edge 25: floor = ceil(5012.5) = 5013 (rounded up, not 5012)`, st[cfg.capFn] === 5013n, `${st[cfg.capFn]}`);
      checkBound('Z edge 25', st);
      await setEdge(0n); st = await zs();
      check('Z edge 0: floor = vwap 5000 exactly (no spurious +1)', st[cfg.capFn] === 5000n, `${st[cfg.capFn]}`);
      checkBound('Z edge 0', st);
      await setEdge(9999n); st = await zs();
      check('Z edge 9999: floor = ceil(9999.5) = 10000, never 0', st[cfg.capFn] === 10000n, `${st[cfg.capFn]}`);
      checkBound('Z edge 9999', st);
      await tx('Z buy-back 1 at edge 9999 -> ok, floor 10000 (ERR_ZERO_FLOOR unreachable: inv-sats > 0 implies inv-usdcx > 0)', KEEPER, VZ, 'buy-back', [uintCV(1n), uintCV(30n)], { ok: 10000n });
    } else {
      check('Z edge 25: cap = floor(5000 x 9975 / 10000) = 4987 (rounded down, not 4988)', st[cfg.capFn] === 4987n, `${st[cfg.capFn]}`);
      checkBound('Z edge 25', st);
      await setEdge(9999n); st = await zs();
      check('Z edge 9999: cap = floor(0.5) = 0', st[cfg.capFn] === 0n, `${st[cfg.capFn]}`);
      await tx('Z buy-back 1 with cap 0 -> ERR_ZERO_CAP', KEEPER, VZ, 'buy-back', [uintCV(1n), uintCV(30n)], e(11));
      await tx('Z reprice with cap 0 -> ERR_ZERO_CAP', KEEPER, VZ, 'reprice', [uintCV(30n)], e(11));
      await setEdge(0n); st = await zs();
      check('Z edge 0: cap = vwap 5000', st[cfg.capFn] === 5000n, `${st[cfg.capFn]}`);
      await tx('Z buy-back 1 at edge 0 -> ok, cap 5000', KEEPER, VZ, 'buy-back', [uintCV(1n), uintCV(30n)], { ok: 5000n });
    }
  }

  // ---------------------------------------------------------------- N ----
  setGroup('N STX accounting + owner-only withdraw-stx');
  {
    const left = STX_GIFT - feePaid;
    check(`vault STX = ${STX_GIFT} sent - ${feePaid} K5 fee = ${left}: nothing else left in any path`, (await stxBal(VAULT)) === left, `${await stxBal(VAULT)}`);
    check(`hostile variant STX = its ${STX_GIFT} uSTX (max-oracle-fee u0: every STX pull aborted)`, (await stxBal(VV)) === STX_GIFT, `${await stxBal(VV)}`);
    await tx('keeper withdraw-stx -> NOT_OWNER', KEEPER, VAULT, 'withdraw-stx', [uintCV(1n)], e(ERR.NOT_OWNER));
    await tx('old owner withdraw-stx -> NOT_OWNER', OWNER, VAULT, 'withdraw-stx', [uintCV(1n)], e(ERR.NOT_OWNER));
    const o0 = await stxBal(NEW_OWNER), k0 = await stxBal(KEEPER);
    await tx(`owner withdraw-stx ${left}`, NEW_OWNER, VAULT, 'withdraw-stx', [uintCV(left)], { ok: left });
    check('owner got the STX; keeper nothing; vault STX 0', (await stxBal(NEW_OWNER)) === o0 + left && (await stxBal(KEEPER)) === k0 && (await stxBal(VAULT)) === 0n);
  }

  function evilRung() {
    const tok = (t) => (t === 'x' ? `'${SBTC}` : `'${USDCX}`), nm = (t) => (t === 'x' ? '"sbtc-token"' : '"usdcx-token"');
    const pull = (n) => `(contract-call? ${tok(sold)} transfer ${n} tx-sender current-contract none)`;
    const pay = (n) => `(as-contract? ((with-ft ${tok(got)} ${nm(got)} u${n})) (try! (contract-call? ${tok(got)} transfer u${n} current-contract who none)))`;
    const stxPull = '(stx-transfer? u1 tx-sender current-contract)';
    return `(define-data-var mode uint u0)
(define-data-var held uint u0)
(define-public (set-mode (m uint)) (ok (var-set mode m)))
(define-read-only (get-position (who principal)) { shares: u0, sbtc: (var-get held), stx: (var-get held) })
(define-public (deposit (amount uint))
  (begin
    (try! ${pull('(+ amount (if (is-eq (var-get mode) u1) u1 u0))')})
    (and (is-eq (var-get mode) u3) (try! ${stxPull}))
    (var-set held (+ (var-get held) amount))
    (ok { amount: amount, shares: u0, epoch: u0, stx-paid: u0, sbtc-paid: u0 })))
(define-public (withdraw (amount uint) (update (optional (buff 8192))))
  (begin
    (and (or (is-eq (var-get mode) u1) (is-eq (var-get mode) u3)) (try! ${stxPull}))
    (ok { stx: u0, sbtc: u0 })))
(define-public (claim)
  (let ((who tx-sender))
    (and (is-eq (var-get mode) u1) (try! ${pull('u1')}))
    (and (is-eq (var-get mode) u3) (try! ${stxPull}))
    (and (is-eq (var-get mode) u2) (begin (var-set held u0) (try! ${pay(cfg.evilPay)})))
    (and (is-eq (var-get mode) u4) (begin (var-set held u0) (try! ${pay(cfg.zPay)})))
    (ok { stx: u0, sbtc: u0 })))
`;
  }
  function evilMarket() {
    const extra = '(if (is-eq (var-get mode) u1) u1 u0)';
    const stxPull = '(and (is-eq (var-get mode) u3) (try! (stx-transfer? u1 tx-sender current-contract)))';
    const px1 = (t) => `(and (is-eq (var-get mode) u1) (try! (contract-call? '${t === 'x' ? SBTC : USDCX} transfer u1 tx-sender current-contract none)))`;
    return `(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)
(define-data-var mode uint u0)
(define-public (set-mode (m uint)) (ok (var-set mode m)))
(define-public (deposit-token-y (amount uint) (limit uint) (spread (optional uint)) (t <ft-trait>) (n (string-ascii 128)))
  (begin (try! (contract-call? '${USDCX} transfer (+ amount ${extra}) tx-sender current-contract none)) ${stxPull} (ok amount)))
(define-public (deposit-token-x (amount uint) (limit uint) (spread (optional uint)) (t <ft-trait>) (n (string-ascii 128)))
  (begin (try! (contract-call? '${SBTC} transfer (+ amount ${extra}) tx-sender current-contract none)) ${stxPull} (ok amount)))
(define-public (set-token-y-limit (limit uint) (spread (optional uint)))
  (begin ${px1('y')} ${stxPull} (ok true)))
(define-public (set-token-x-limit (limit uint) (spread (optional uint)))
  (begin ${px1('x')} ${stxPull} (ok true)))
(define-public (cancel-token-y-deposit (t <ft-trait>) (n (string-ascii 128)))
  (begin ${px1('y')} ${stxPull} (ok u0)))
(define-public (cancel-token-x-deposit (t <ft-trait>) (n (string-ascii 128)))
  (begin ${px1('x')} ${stxPull} (ok u0)))
(define-map pd principal { amount: uint, limit: uint, spread-bps: (optional uint), submitted-at: uint })
(define-map pl principal { limit: uint, spread-bps: (optional uint), submitted-at: uint })
(define-read-only (get-token-y-limit (who principal)) u0)
(define-read-only (get-token-x-limit (who principal)) u0)
(define-read-only (get-token-y-pending-deposit (who principal)) (map-get? pd who))
(define-read-only (get-token-x-pending-deposit (who principal)) (map-get? pd who))
(define-read-only (get-token-y-pending-limit (who principal)) (map-get? pl who))
(define-read-only (get-token-x-pending-limit (who principal)) (map-get? pl who))
`;
  }
}

export function main(cfg) {
  runSide(cfg).then(() => { summary(); process.exit(S.fails.length ? 1 : 0); })
    .catch((err) => { console.error(err instanceof Stop ? err.message : (err.stack ?? err)); summary(); process.exit(1); });
}
