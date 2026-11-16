// stxer mainnet-fork proof: the v6-5 "read cut" in markets-sbtc-stx-jing-v6-5
// (drop-x / drop-y = index-of? + slice? + concat instead of filter).
// Fresh v6-5 market + rung-v3 band rungs (contract principals) + standard
// principal makers on the LIVE jing-core-v6 / jing-ladder-v1 / dispatch.
//   U  drop-x / drop-y called directly (Eval in the market's context) on
//      literal lists: first, middle, last, only, absent, empty, a 50-entry
//      list (first, last, middle, absent), mixed standard + contract principals
//   X  ask side [SX1, BUY10, SX2, BUY20, SX3]: absent cancel (u1005, list
//      unchanged), cancel first, cancel middle, rung full withdraw (dispatch ->
//      rung -> market cancel), full fill by a router taker (execute-fill),
//      cancel the only entry; survivors still fill / claim
//   Y  bid side [SELL10, SY1, SELL20, SY2, SY3]: market swap appends the
//      swapper and drops it (cross-remainder, last entry), absent cancel,
//      full fill of the first entry (rung), cancel last, rung full withdraw
//   R  settle-with-refresh on a non-crossing book: every maker limit-violates,
//      the filter drops each head in turn; cycle N list empties and cycle N+1
//      holds the same principals in the same order
//   F  (FULL=1, default on) the bid side filled to queue-full: park on a full
//      list (park-tenth -> park-token-y), cancel first + last of the full list
// After every removal the list is read back and compared to the expected
// list (exact order).
// Run: node simulations/verify-sbtc-stx-v6-5-drop.mjs   (FULL=0 skips F)
import { readFileSync } from 'node:fs';
import { uintCV, noneCV, someCV, boolCV, bufferCV, stringAsciiCV, tupleCV, listCV } from '@stacks/transactions';
import { SimulationBuilder } from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';
import { NODE, DEP, SBTC, WSTX, WHALE, P_, mk, S, retry, sleep, check, must, show, tx, evalIn, call, deploy, summary, Stop, note, stxTransfer } from './_yg-loop-common.js';
import { strip } from './_sim-deployer.mjs';

const FULL = process.env.FULL !== '0';
const N = { market: 'markets-sbtc-stx-jing-v6-5', batch: 'jing-settle-batch-v2', router: 'swap-router-sbtc-stx-jing-v5-6' };
const C = Object.fromEntries(Object.entries(N).map(([k, v]) => [k, `${DEP}.${v}`]));
const CORE = `${DEP}.jing-core-v6`, LADDER = `${DEP}.jing-ladder-v1`, DISPATCH = `${DEP}.jing-ladder-dispatch`;
const LIVE_MKT = `${DEP}.markets-sbtc-stx-jing-v6-4`;
const BANDS = [10, 20];
const BUY = (b) => `${DEP}.jing-buy-stx-${b}-v2`, SELL = (b) => `${DEP}.jing-sell-stx-${b}-v2`;
const src = (f) => strip(readFileSync(new URL(`../contracts/${f}.clar`, import.meta.url), 'utf8'));
const TX = P_(SBTC), TY = P_(WSTX), AX = stringAsciiCV('sbtc-token'), AY = stringAsciiCV('wstx');
const SCALE = 10_000_000_000n, BPS = 10_000n;
const BUYER = WHALE.x, SELLER = WHALE.y, TAKER = mk(5), OUTSIDER = mk(6);
const SX = [mk(11), mk(12), mk(13)], SY = [mk(21), mk(22), mk(23)];
const X_PER = 200_000n, Y_PER = 500_000_000n;
const X_STD = 100_000n, Y_STD = 300_000_000n;

const hexCV = (h) => bufferCV(Buffer.from(h.replace(/^0x/, ''), 'hex'));
const bt = async () => Number(await evalIn(C.market, 'stacks-block-time'));
let U = null;
async function fresh() {
  const b = await bt();
  for (let i = 0; i < 40; i++) {
    const u = await retry(() => fetchLazerUpdateAny([1, 45])); const t = await retry(() => lazerFeedTimes(u.hex, [1, 45]));
    if (t.at > b) { U = { ...u, at: t.at, mid: u.px * 100000000n / u.py }; return U; }
    await sleep(3000);
  }
  throw new Error('no fresh [1,45] update');
}
const upd = () => hexCV(U.hex);
const sbtc = async (who) => (await evalIn(SBTC, `(get-balance '${who})`)).ok;
const stx = async (who) => evalIn(SBTC, `(stx-get-balance '${who})`);
const bals = async (who) => ({ sb: await sbtc(who), st: await stx(who) });
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };
const cyc = async () => evalIn(C.market, '(get-current-cycle)');
const listX = async (c) => evalIn(C.market, `(get-token-x-depositors u${c ?? await cyc()})`);
const listY = async (c) => evalIn(C.market, `(get-token-y-depositors u${c ?? await cyc()})`);
const liveX = async (who) => evalIn(C.market, `(get-token-x-deposit u${await cyc()} '${who})`);
const liveY = async (who) => evalIn(C.market, `(get-token-y-deposit u${await cyc()} '${who})`);
const alloc = (rungs, amt) => listCV(rungs.map((r) => tupleCV({ rung: P_(r), amount: uintCV(amt) })));
const isOk = (v) => v?.ok !== undefined;
const short = (p) => p.includes('.') ? p.split('.')[1] : p.slice(0, 8);
const fmt = (l) => `[${l.map(short).join(', ')}]`;
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
async function expectList(label, side, want) {
  const got = side === 'x' ? await listX() : await listY();
  return check(`${label}: ${side} list = ${fmt(want)}`, same(got, want), `got ${fmt(got)}`);
}
const clList = (l) => `(list ${l.map((p) => `'${p}`).join(' ')})`;

try {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(SBTC, '(get-total-supply)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);

  group('deploy + init');
  const CORE_OWNER = await evalIn(CORE, '(get-contract-owner)');
  const LADDER_OWNER = await evalIn(LADDER, '(get-owner)');
  const mins = await evalIn(LIVE_MKT, '(get-min-deposits)');
  await deploy(DEP, N.market, src(N.market));
  await tx('core set-verified-contract(market v6-5)', CORE_OWNER, CORE, 'set-verified-contract', [P_(C.market)], isOk);
  await tx('market set-operator -> core owner', DEP, C.market, 'set-operator', [P_(CORE_OWNER)], { ok: true });
  await tx('market initialize(sbtc, wstx, live mins, 1, 45)', CORE_OWNER, C.market, 'initialize', [P_(C.market), TX, TY, uintCV(mins['min-token-x']), uintCV(mins['min-token-y']), uintCV(1), uintCV(45)], { ok: true });
  await tx('market set-operator -> DEP', CORE_OWNER, C.market, 'set-operator', [P_(DEP)], { ok: true });
  const buySrc = src('jing-buy-stx-rung-v3'), sellSrc = src('jing-sell-stx-rung-v3');
  for (const bp of BANDS) { await deploy(DEP, `jing-buy-stx-${bp}-v2`, buySrc); await deploy(DEP, `jing-sell-stx-${bp}-v2`, sellSrc); }
  await tx('ladder set-canonical buy-band', LADDER_OWNER, LADDER, 'set-canonical', [stringAsciiCV('buy-band'), P_(BUY(10))], { ok: true });
  await tx('ladder set-canonical sel-band', LADDER_OWNER, LADDER, 'set-canonical', [stringAsciiCV('sel-band'), P_(SELL(10))], { ok: true });
  for (const bp of BANDS) {
    await tx(`initialize buy-stx-${bp}-v2 (seat)`, LADDER_OWNER, BUY(bp), 'initialize', [uintCV(bp), boolCV(true)], { ok: true });
    await tx(`initialize sell-stx-${bp}-v2 (seat)`, LADDER_OWNER, SELL(bp), 'initialize', [uintCV(bp), boolCV(true)], { ok: true });
  }
  await deploy(DEP, N.batch, src(N.batch));
  await deploy(DEP, N.router, src(N.router));
  for (const a of SX) must(`fund ${short(a)} sBTC`, (await call(BUYER, SBTC, 'transfer', [uintCV(X_STD * 2n), P_(BUYER), P_(a), noneCV()])).res?.ok === true);
  for (const a of [...SY, TAKER]) await stxTransfer(SELLER, a, 2_000_000_000n);
  must('fund taker sBTC', (await call(BUYER, SBTC, 'transfer', [uintCV(2_000_000n), P_(BUYER), P_(TAKER), noneCV()])).res?.ok === true);

  group('U drop-x / drop-y on literal lists (Eval in the market context)');
  {
    const A = SX[0], Bp = BUY(10), Cc = SX[1], Dd = SELL(20), E = SX[2], Z = OUTSIDER;
    const L5 = [A, Bp, Cc, Dd, E];
    let ok = true;
    try { await evalIn(C.market, `(drop-x ${clList([A])} '${A})`); } catch (e) { ok = false; note(`private drop-x not callable from Eval: ${String(e.message).slice(0, 200)}`); }
    if (ok) {
      const cases = [
        ['first', L5, A, [Bp, Cc, Dd, E]],
        ['middle (contract principal)', L5, Bp, [A, Cc, Dd, E]],
        ['middle', L5, Cc, [A, Bp, Dd, E]],
        ['second-to-last (contract)', L5, Dd, [A, Bp, Cc, E]],
        ['last', L5, E, [A, Bp, Cc, Dd]],
        ['only entry', [A], A, []],
        ['only entry (contract)', [Bp], Bp, []],
        ['absent -> unchanged', L5, Z, L5],
        ['absent contract principal -> unchanged', L5, SELL(10), L5],
        ['empty list', [], A, []],
        ['two entries, remove last', [A, Bp], Bp, [A]],
      ];
      for (const fn of ['drop-x', 'drop-y']) {
        for (const [tag, l, who, want] of cases) {
          const got = await evalIn(C.market, `(${fn} ${l.length ? clList(l) : '(list)'} '${who})`);
          check(`${fn} ${tag}`, same(got, want), `got ${fmt(got)} want ${fmt(want)}`);
        }
      }
      // 50 entries (MAX_DEPOSITORS), every 5th a contract principal
      const L50 = Array.from({ length: 50 }, (_, i) => (i % 5 === 4 ? `${mk(100 + i)}.m${i}` : mk(100 + i)));
      for (const fn of ['drop-x', 'drop-y']) {
        for (const [tag, who, want] of [
          ['50: first', L50[0], L50.slice(1)],
          ['50: last (contract)', L50[49], L50.slice(0, 49)],
          ['50: middle #25', L50[25], [...L50.slice(0, 25), ...L50.slice(26)]],
          ['50: absent -> unchanged', Z, L50],
        ]) {
          const got = await evalIn(C.market, `(${fn} ${clList(L50)} '${who})`);
          check(`${fn} ${tag}`, same(got, want), `len ${got.length}, first ${short(got[0] ?? '')} last ${short(got.at(-1) ?? '')}`);
        }
        const chained = await evalIn(C.market, `(${fn} (${fn} ${clList(L50)} '${L50[0]}) '${L50[49]})`);
        check(`${fn} 50: first then last -> 48, order kept`, same(chained, L50.slice(1, 49)), `len ${chained.length}`);
      }
    }
  }

  group('X ask side: build [SX1, BUY10, SX2, BUY20, SX3]');
  await fresh();
  const MID = U.mid;
  console.log(`  mid ${MID}`);
  // the list order is the order makers go live: a deposit goes live at once when
  // it cannot cross (empty opposite side), else it waits as a pending for a settle
  const settleIfPending = async (who, x) => {
    if (await evalIn(C.market, `(get-token-${x ? 'x' : 'y'}-pending-deposit '${who})`)) {
      await fresh();
      await tx(`settle pending ${short(who)}`, DEP, C.market, x ? 'settle-token-x-deposit' : 'settle-token-y-deposit', [P_(who), upd(), x ? TX : TY, x ? AX : AY], isOk);
    }
  };
  const xDep = async (i) => { await tx(`${short(SX[i])} deposit-token-x 0.001 sBTC, ask mid+${2 + i}%`, SX[i], C.market, 'deposit-token-x', [uintCV(X_STD), uintCV(MID * (102n + BigInt(i)) / 100n), noneCV(), TX, AX], isOk); await settleIfPending(SX[i], true); };
  const xPush = async (bp) => { await tx(`dispatch deposit-buy 0.002 sBTC into buy-stx-${bp}-v2`, BUYER, DISPATCH, 'deposit-buy', [uintCV(X_PER), alloc([BUY(bp)], X_PER)], isOk); await settleIfPending(BUY(bp), true); };
  await xDep(0); await xPush(10); await xDep(1); await xPush(20); await xDep(2);
  await expectList('after settles', 'x', [SX[0], BUY(10), SX[1], BUY(20), SX[2]]);

  group('Y bid side: build [SELL10, SY1, SELL20, SY2, SY3]');
  const yDep = async (i) => { await tx(`${short(SY[i])} deposit-token-y 300 STX, bid mid-${2 + i}%`, SY[i], C.market, 'deposit-token-y', [uintCV(Y_STD), uintCV(MID * (98n - BigInt(i)) / 100n), noneCV(), TY, AY], isOk); await settleIfPending(SY[i], false); };
  const yPush = async (bp) => { await tx(`dispatch deposit-sell 500 STX into sell-stx-${bp}-v2`, SELLER, DISPATCH, 'deposit-sell', [uintCV(Y_PER), alloc([SELL(bp)], Y_PER)], isOk); await settleIfPending(SELL(bp), false); };
  await yPush(10); await yDep(0); await yPush(20); await yDep(1); await yDep(2);
  await expectList('after settles', 'y', [SELL(10), SY[0], SELL(20), SY[1], SY[2]]);

  group('R settlement roll: a swap settles the cycle, every resting maker rolls');
  {
    const c0 = await cyc(), x0 = await listX(c0), y0 = await listY(c0);
    await fresh();
    await tx('settle-with-refresh on a non-crossing book -> u1009 (nothing clears, reverted)', OUTSIDER, C.market, 'settle-with-refresh', [upd(), TX, AX, TY, AY], { err: 1009n });
    check('lists untouched by the failed settle', same(await listX(c0), x0) && same(await listY(c0), y0));
    const ask10 = await evalIn(C.market, `(token-x-limit-at '${BUY(10)} u${U.mid})`);
    const r = await tx('market swap 20 STX, partial fill of BUY10 (submit + settle)', TAKER, C.market, 'swap', [uintCV(20_000_000n), uintCV(ask10 * 101n / 100n), upd(), TX, AX, TY, AY, boolCV(false)], isOk);
    const c1 = await cyc();
    note(`swap moved the cycle ${c0} -> ${c1}; result ${show(r.res)}`);
    const xo = await listX(c0), yo = await listY(c0), x1 = await listX(c1), y1 = await listY(c1);
    // the settled cycle keeps its filled depositors as history: here only the taker (as y)
    if (c1 > c0) check(`cycle ${c0}: every resting maker dropped by successive head drops, only the filled taker stays`, xo.length === 0 && same(yo, [TAKER]), `x ${fmt(xo)} y ${fmt(yo)}`);
    check(`cycle ${c1} x list = before, same order (BUY10 partly filled, kept)`, same(x1, x0), `${fmt(x1)}`);
    check(`cycle ${c1} y list = before, same order (swapper not left behind)`, same(y1, y0), `${fmt(y1)}`);
    check('BUY10 partly filled, others intact', (await liveX(BUY(10))) < X_PER && (await liveX(SX[0])) === X_STD && (await liveY(SELL(20))) === Y_PER && (await liveY(SY[2])) === Y_STD);
  }

  group('X removals');
  {
    const L = [SX[0], BUY(10), SX[1], BUY(20), SX[2]];
    await tx('cancel-token-x-deposit by a non-depositor -> u1005', OUTSIDER, C.market, 'cancel-token-x-deposit', [TX, AX], { err: 1005n });
    await expectList('absent cancel is a no-op', 'x', L);
    let s0 = await sbtc(SX[0]);
    await tx('SX1 cancel (first entry)', SX[0], C.market, 'cancel-token-x-deposit', [TX, AX], isOk);
    check('SX1 refunded 0.001 sBTC', (await sbtc(SX[0])) - s0 === X_STD);
    await expectList('first removed', 'x', [BUY(10), SX[1], BUY(20), SX[2]]);
    await tx('SX2 cancel (middle entry)', SX[1], C.market, 'cancel-token-x-deposit', [TX, AX], isOk);
    await expectList('middle removed', 'x', [BUY(10), BUY(20), SX[2]]);
    await fresh();
    s0 = await sbtc(BUYER);
    await tx('dispatch withdraw-buy all 0.002 sBTC from buy-stx-20-v2 (rung -> market cancel)', BUYER, DISPATCH, 'withdraw-buy', [alloc([BUY(20)], X_PER), someCV(upd())], isOk);
    check('BUYER got 0.002 sBTC back', (await sbtc(BUYER)) - s0 === X_PER, `${(await sbtc(BUYER)) - s0}`);
    await expectList('rung (contract principal, middle) removed by full withdraw', 'x', [BUY(10), SX[2]]);
    await fresh();
    const ask10 = await evalIn(C.market, `(token-x-limit-at '${BUY(10)} u${U.mid})`);
    const stIn = X_PER * ask10 / SCALE * 2n;
    const r = await tx(`router smart-swap-stx-for-sbtc ${stIn} uSTX, limit ask10 + 40 bps (book limit after the 20 bps rebate + 10 bps fee just above ask10; next ask mid+4%)`, TAKER, C.router, 'smart-swap-stx-for-sbtc', [uintCV(stIn), uintCV(ask10 * (BPS + 40n) / BPS), someCV(upd()), uintCV(U.mid), uintCV(1)], isOk);
    console.log(`  ${show(r.res?.ok)}`);
    check('BUY10 fully filled (deposit 0)', (await liveX(BUY(10))) === 0n, show(await liveX(BUY(10))));
    await expectList('first entry removed by a full fill (execute-fill)', 'x', [SX[2]]);
    await fresh();
    const ask3 = await evalIn(C.market, `(token-x-limit-at '${SX[2]} u${U.mid})`);
    const st3 = await stx(SX[2]);
    await tx('market swap 20 STX at SX3 ask -> partial fill of the survivor', TAKER, C.market, 'swap', [uintCV(20_000_000n), uintCV(ask3 * 101n / 100n), upd(), TX, AX, TY, AY, boolCV(false)], isOk);
    check('survivor SX3 got paid STX and kept its seat', (await stx(SX[2])) > st3 && (await liveX(SX[2])) < X_STD, `${(await stx(SX[2])) - st3} uSTX, left ${await liveX(SX[2])}`);
    await expectList('partial fill keeps the entry', 'x', [SX[2]]);
    await tx('SX3 cancel (only entry)', SX[2], C.market, 'cancel-token-x-deposit', [TX, AX], isOk);
    await expectList('only entry removed', 'x', []);
    const st0 = await stx(BUYER);
    await tx('claim-buy [buy-stx-10-v2] after its full fill', BUYER, DISPATCH, 'claim-buy', [listCV([P_(BUY(10))])], isOk);
    check('BUYER claimed STX for the filled rung', (await stx(BUYER)) > st0, `${(await stx(BUYER)) - st0}`);
  }

  group('Y removals');
  {
    const L = [SELL(10), SY[0], SELL(20), SY[1], SY[2]];
    await tx('cancel-token-y-deposit by a non-depositor -> u1005', OUTSIDER, C.market, 'cancel-token-y-deposit', [TY, AY], { err: 1005n });
    await expectList('absent cancel is a no-op', 'y', L);
    // re-seed an ask so a y-side taker swap (append swapper + drop) has a fill
    await tx('SX1 re-deposits an ask at mid+2%', SX[0], C.market, 'deposit-token-x', [uintCV(X_STD), uintCV(MID * 102n / 100n), noneCV(), TX, AX], isOk);
    await fresh();
    await tx('settle SX1', DEP, C.market, 'settle-token-x-deposit', [P_(SX[0]), upd(), TX, AX], isOk);
    const askS = await evalIn(C.market, `(token-x-limit-at '${SX[0]} u${U.mid})`);
    const sw = await tx('market swap 20 STX (taker as y, remainder crossed + dropped)', TAKER, C.market, 'swap', [uintCV(20_000_000n), uintCV(askS), upd(), TX, AX, TY, AY, boolCV(false)], isOk);
    console.log(`  ${show(sw.res)}`);
    await expectList('swapper appended then dropped (last entry)', 'y', L);
    await fresh();
    const bid10 = await evalIn(C.market, `(token-y-limit-at '${SELL(10)} u${U.mid})`);
    const sbIn = Y_PER * SCALE / bid10 * 2n;
    const r = await tx(`router smart-swap-sbtc-for-stx ${sbIn} sats, limit bid10 / 1.0031 (book limit just under bid10, above SELL20 at mid-20bps)`, TAKER, C.router, 'smart-swap-sbtc-for-stx', [uintCV(sbIn), uintCV(bid10 * BPS / (BPS + 31n)), someCV(upd()), uintCV(U.mid), uintCV(1)], isOk);
    console.log(`  ${show(r.res?.ok)}`);
    check('SELL10 fully filled (deposit 0)', (await liveY(SELL(10))) === 0n, show(await liveY(SELL(10))));
    await expectList('first entry (contract principal) removed by a full fill', 'y', [SY[0], SELL(20), SY[1], SY[2]]);
    await tx('SY3 cancel (last entry)', SY[2], C.market, 'cancel-token-y-deposit', [TY, AY], isOk);
    await expectList('last removed', 'y', [SY[0], SELL(20), SY[1]]);
    await fresh();
    const s0 = await stx(SELLER);
    await tx('dispatch withdraw-sell all 500 STX from sell-stx-20-v2', SELLER, DISPATCH, 'withdraw-sell', [alloc([SELL(20)], Y_PER), someCV(upd())], isOk);
    check('SELLER got 500 STX back', (await stx(SELLER)) - s0 === Y_PER, `${(await stx(SELLER)) - s0}`);
    await expectList('middle rung removed by full withdraw', 'y', [SY[0], SY[1]]);
    await fresh();
    const bid1 = await evalIn(C.market, `(token-y-limit-at '${SY[0]} u${U.mid})`);
    const sb1 = await sbtc(SY[0]);
    await tx('market swap 10,000 sats at SY1 bid -> partial fill of a survivor', TAKER, C.market, 'swap', [uintCV(10_000n), uintCV(bid1 * 99n / 100n), upd(), TX, AX, TY, AY, boolCV(true)], isOk);
    check('survivor SY1 got paid sBTC', (await sbtc(SY[0])) > sb1, `${(await sbtc(SY[0])) - sb1}`);
    await expectList('partial fill keeps both', 'y', [SY[0], SY[1]]);
    const sb0 = await sbtc(SELLER);
    await tx('claim-sell [sell-stx-10-v2] after its full fill', SELLER, DISPATCH, 'claim-sell', [listCV([P_(SELL(10))])], isOk);
    check('SELLER claimed sBTC for the filled rung', (await sbtc(SELLER)) > sb0, `${(await sbtc(SELLER)) - sb0}`);
    await tx('SY1 cancel (first of two)', SY[0], C.market, 'cancel-token-y-deposit', [TY, AY], isOk);
    await expectList('first of two removed', 'y', [SY[1]]);
  }

  if (FULL) {
    group('F full bid list: park + first/last');
    const cap = await evalIn(C.market, '(var-get seats-per-side)');
    note(`seats-per-side ${cap}; filling the bid side with standard makers until the next one is parked/refused`);
    const fillers = [];
    let full = false;
    for (let k = 0; k < 50 && !full; k++) {
      const a = mk(300 + k); fillers.push(a);
      await stxTransfer(SELLER, a, 50_000_000n);
      // bids spread under mid-1%, larger k = further from mid
      const dep = await call(a, C.market, 'deposit-token-y', [uintCV(10_000_000n + BigInt(k) * 100_000n), uintCV(MID * (9900n - BigInt(k) * 5n) / 10000n), noneCV(), TY, AY]);
      if (!isOk(dep.res)) { full = true; note(`filler ${k} deposit refused: ${show(dep.res ?? dep.vm)}`); break; }
      if (k % 8 === 0) await fresh();
      const before = await listY();
      const st = await call(DEP, C.market, 'settle-token-y-deposit', [P_(a), upd(), TY, AY]);
      const after = await listY();
      if (!after.includes(a)) {
        full = true;
        note(`filler ${k} not admitted at list length ${before.length}: ${show(st.res ?? st.vm)}`);
      } else if (after.length === before.length) {
        // admitted by parking someone: removal must keep everyone else's order
        const parked = before.find((p) => !after.includes(p));
        full = true;
        check(`park on a full list (length ${before.length}): ${short(parked ?? '?')} parked, rest in order, newcomer appended`, parked && same(after, [...before.filter((p) => p !== parked), a]), `${fmt(after)}`);
        check('parked maker shows as parked', parked && (await evalIn(C.market, `(get-token-y-parked '${parked})`)) > 0n);
      }
    }
    const Lf = await listY();
    note(`full-ish bid list length ${Lf.length}`);
    check('bid list reached the queue cap', full, `len ${Lf.length}`);
    // a better bid on the full list parks someone (if not already shown above)
    const first = Lf[0], last = Lf.at(-1);
    if (!first.includes('.')) {
      await tx(`cancel first entry of the full list (${short(first)})`, first, C.market, 'cancel-token-y-deposit', [TY, AY], isOk);
      await expectList('full list: first removed', 'y', Lf.slice(1));
    }
    if (!last.includes('.')) {
      await tx(`cancel last entry of the full list (${short(last)})`, last, C.market, 'cancel-token-y-deposit', [TY, AY], isOk);
      await expectList('full list: first + last removed', 'y', Lf.slice(1, -1));
    }
    await fresh();
    const L2 = await listY();
    const mid2 = L2[Math.floor(L2.length / 2)];
    await tx(`cancel a middle entry (${short(mid2)})`, mid2, C.market, 'cancel-token-y-deposit', [TY, AY], isOk);
    await expectList('full list: middle removed', 'y', L2.filter((p) => p !== mid2));
  }
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(String(e?.message ?? e)); }
}
summary();
