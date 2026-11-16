// stxer mainnet-fork proof: the sbtc-stx v6-5 redeploy set, from repo source,
// on the LIVE jing-core-v6 + jing-ladder-v1 + jing-ladder-dispatch.
//   markets-sbtc-stx-jing-v6-5 (core verify + initialize feeds 1/45)
//   -> jing-buy-stx-rung-v3 / jing-sell-stx-rung-v3 deployed as
//      jing-{buy,sell}-stx-<bps>-v2 (blessed as the ladder canonicals, seated
//      on the live band spreads, replacing the live holders)
//   -> jing-settle-batch-v2 -> swap-router-sbtc-stx-jing-v5-6.
// Flow: dispatch deposits -> settle-many on the pendings -> router v5-6 takers
// fill the rungs both ways -> dispatch claims + withdraws; router holds nothing.
// Staleness (SetDev PR-1 / package 2, ff93627):
//   defaults settle-max-staleness 40 / max-staleness 80; setters: non-operator
//   u1008, out of bounds (19, 41 / 39, 81) u1034, in bounds ok;
//   the fork is pinned at a block whose time T is 45..70 s after a signed
//   Lazer print P_aged, so: settle-with-refresh(P_aged) -> u1003 while
//   swap(P_aged) fills under the 80 s cap; get-taker-rebate-bps-for(P_aged)
//   = 20 + (age - 30); after set-max-staleness 40, swap(P_aged) fails, a fresh
//   print still swaps; back to 80, P_aged swaps again.
// Keyless: Lazer [1,45] from the faktory-dao route (fetchLazerUpdateAny).
// Run: node simulations/verify-sbtc-stx-v6-5-set.mjs
import { readFileSync } from 'node:fs';
import { uintCV, noneCV, someCV, boolCV, bufferCV, stringAsciiCV, tupleCV, listCV } from '@stacks/transactions';
import { SimulationBuilder } from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';
import { NODE, DEP, SBTC, WSTX, WHALE, P_, mk, S, retry, sleep, check, must, show, tx, evalIn, call, deploy, summary, Stop, note, stxTransfer } from './_yg-loop-common.js';
import { strip } from './_sim-deployer.mjs';

const N = { market: 'markets-sbtc-stx-jing-v6-5', batch: 'jing-settle-batch-v2', router: 'swap-router-sbtc-stx-jing-v5-6' };
const C = Object.fromEntries(Object.entries(N).map(([k, v]) => [k, `${DEP}.${v}`]));
const CORE = `${DEP}.jing-core-v6`, LADDER = `${DEP}.jing-ladder-v1`, DISPATCH = `${DEP}.jing-ladder-dispatch`;
const LIVE_MKT = `${DEP}.markets-sbtc-stx-jing-v6-4`;
const BANDS = [10, 20, 50];
const BUY = (b) => `${DEP}.jing-buy-stx-${b}-v2`, SELL = (b) => `${DEP}.jing-sell-stx-${b}-v2`;
const src = (f) => strip(readFileSync(new URL(`../contracts/${f}.clar`, import.meta.url), 'utf8'));
const TX = P_(SBTC), TY = P_(WSTX), AX = stringAsciiCV('sbtc-token'), AY = stringAsciiCV('wstx');
const SCALE = 10_000_000_000n, BPS = 10_000n;
const BUYER = WHALE.x, SELLER = WHALE.y, TAKER = mk(5), OUTSIDER = mk(6);
const X_PER = 200_000n;      // 0.002 sBTC per buy-stx rung (rests sBTC = token x, asks)
const Y_PER = 500_000_000n;  // 500 STX per sell-stx rung (rests STX = token y, bids)
const AGE_MIN = 45, AGE_MAX = 70;

const hexCV = (h) => bufferCV(Buffer.from(h.replace(/^0x/, ''), 'hex'));
const tip = async () => { const t = (await (await fetch(`${NODE}/extended/v2/blocks?limit=1`)).json()).results[0]; return { h: t.height, T: t.block_time }; };
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
const liveX = async (who) => evalIn(C.market, `(get-token-x-deposit u${await cyc()} '${who})`);
const liveY = async (who) => evalIn(C.market, `(get-token-y-deposit u${await cyc()} '${who})`);
const pendX = async (who) => evalIn(C.market, `(get-token-x-pending-deposit '${who})`);
const pendY = async (who) => evalIn(C.market, `(get-token-y-pending-deposit '${who})`);
const alloc = (rungs, amt) => listCV(rungs.map((r) => tupleCV({ rung: P_(r), amount: uintCV(amt) })));
const req = (who, x) => tupleCV({ who: P_(who), x: boolCV(x), kind: uintCV(0) });
const errIs = (...codes) => (v) => codes.some((c) => v?.err === BigInt(c));
const isOk = (v) => v?.ok !== undefined;

try {
  // ---- pin the fork 45..70 s after a signed print (P_aged) ----
  let AGED, pin;
  for (let attempt = 0; attempt < 5 && !pin; attempt++) {
    const u = await retry(() => fetchLazerUpdateAny([1, 45])); const t = await retry(() => lazerFeedTimes(u.hex, [1, 45]));
    AGED = { ...u, at: t.at };
    for (;;) {
      const p = await retry(tip);
      if (p.T - AGED.at >= AGE_MIN) { if (p.T - AGED.at <= AGE_MAX) pin = p; break; }
      await sleep(2000);
    }
  }
  if (!pin) throw new Error('could not pin a block 45..70 s after a print');
  console.log(`pin block ${pin.h} time ${pin.T}; P_aged at ${AGED.at} (age ${pin.T - AGED.at} s at the pin)`);
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE }).useBlockHeight(pin.h);
  b.withSender(DEP).addEvalCode(SBTC, '(get-total-supply)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);

  group('deploy + init');
  const CORE_OWNER = await evalIn(CORE, '(get-contract-owner)');
  const LADDER_OWNER = await evalIn(LADDER, '(get-owner)');
  const mins = await evalIn(LIVE_MKT, '(get-min-deposits)');
  console.log(`  core owner ${CORE_OWNER}, ladder owner ${LADDER_OWNER}, live v6-4 mins ${show(mins)}`);
  await deploy(DEP, N.market, src(N.market));
  await tx('core set-verified-contract(market v6-5)', CORE_OWNER, CORE, 'set-verified-contract', [P_(C.market)], isOk);
  await tx('market set-operator -> core owner', DEP, C.market, 'set-operator', [P_(CORE_OWNER)], { ok: true });
  await tx('market initialize(sbtc, wstx, live mins, 1, 45)', CORE_OWNER, C.market, 'initialize', [P_(C.market), TX, TY, uintCV(mins['min-token-x']), uintCV(mins['min-token-y']), uintCV(1), uintCV(45)], { ok: true });
  await tx('market set-operator -> DEP', CORE_OWNER, C.market, 'set-operator', [P_(DEP)], { ok: true });
  const buySrc = src('jing-buy-stx-rung-v3'), sellSrc = src('jing-sell-stx-rung-v3');
  for (const bp of BANDS) { await deploy(DEP, `jing-buy-stx-${bp}-v2`, buySrc); await deploy(DEP, `jing-sell-stx-${bp}-v2`, sellSrc); }
  await tx('ladder set-canonical buy-band = jing-buy-stx-10-v2', LADDER_OWNER, LADDER, 'set-canonical', [stringAsciiCV('buy-band'), P_(BUY(10))], { ok: true });
  await tx('ladder set-canonical sel-band = jing-sell-stx-10-v2', LADDER_OWNER, LADDER, 'set-canonical', [stringAsciiCV('sel-band'), P_(SELL(10))], { ok: true });
  await tx('initialize jing-buy-stx-20-v2 with bps 50 -> u7009 bad name', LADDER_OWNER, BUY(20), 'initialize', [uintCV(50), boolCV(true)], { err: 7009n });
  await tx('initialize jing-buy-stx-20-v2 by non-owner -> u7001', OUTSIDER, BUY(20), 'initialize', [uintCV(20), boolCV(true)], { err: 7001n });
  for (const bp of BANDS) {
    await tx(`initialize jing-buy-stx-${bp}-v2 (seat, replaces the live holder)`, LADDER_OWNER, BUY(bp), 'initialize', [uintCV(bp), boolCV(true)], { ok: true });
    await tx(`initialize jing-sell-stx-${bp}-v2 (seat, replaces the live holder)`, LADDER_OWNER, SELL(bp), 'initialize', [uintCV(bp), boolCV(true)], { ok: true });
  }
  await deploy(DEP, N.batch, src(N.batch));
  await deploy(DEP, N.router, src(N.router));

  group('staleness setters');
  const vars = async () => evalIn(C.market, '{ s: (var-get settle-max-staleness), m: (var-get max-staleness) }');
  { const v = await vars(); check('defaults: settle-max-staleness 40, max-staleness 80', v.s === 40n && v.m === 80n, show(v)); }
  await tx('set-settle-max-staleness 30 by non-operator -> u1008', OUTSIDER, C.market, 'set-settle-max-staleness', [uintCV(30)], { err: 1008n });
  await tx('set-max-staleness 60 by non-operator -> u1008', OUTSIDER, C.market, 'set-max-staleness', [uintCV(60)], { err: 1008n });
  await tx('set-max-staleness 60 by the core owner (not the operator) -> u1008', CORE_OWNER, C.market, 'set-max-staleness', [uintCV(60)], { err: 1008n });
  for (const s of [0, 19, 41, 80]) await tx(`set-settle-max-staleness ${s} -> u1034`, DEP, C.market, 'set-settle-max-staleness', [uintCV(s)], { err: 1034n });
  for (const s of [0, 39, 81, 1000]) await tx(`set-max-staleness ${s} -> u1034`, DEP, C.market, 'set-max-staleness', [uintCV(s)], { err: 1034n });
  { const v = await vars(); check('rejected sets left 40 / 80', v.s === 40n && v.m === 80n, show(v)); }
  for (const s of [20, 33, 40]) { await tx(`set-settle-max-staleness ${s} -> ok`, DEP, C.market, 'set-settle-max-staleness', [uintCV(s)], { ok: true }); check(`settle-max-staleness reads ${s}`, (await vars()).s === BigInt(s)); }
  for (const s of [40, 57, 80]) { await tx(`set-max-staleness ${s} -> ok`, DEP, C.market, 'set-max-staleness', [uintCV(s)], { ok: true }); check(`max-staleness reads ${s}`, (await vars()).m === BigInt(s)); }

  group('ladder + market seats');
  for (const bp of BANDS) {
    const rb = await evalIn(LADDER, `(get-registered '${BUY(bp)})`), rs = await evalIn(LADDER, `(get-registered '${SELL(bp)})`);
    check(`buy-stx-${bp}-v2 = buy-band ${bp}, sell-stx-${bp}-v2 = sel-band ${bp}`, rb?.side === 'buy-band' && rb?.price === BigInt(bp) && rs?.side === 'sel-band' && rs?.price === BigInt(bp), show({ rb, rs }));
    const sx = await evalIn(C.market, `(is-protected-x '${BUY(bp)})`), sy = await evalIn(C.market, `(is-protected-y '${SELL(bp)})`);
    check(`market v6-5 seats buy-stx-${bp}-v2 on x, sell-stx-${bp}-v2 on y`, sx === true && sy === true, show({ sx, sy }));
  }

  group('dispatch deposits');
  await fresh();
  const MID = U.mid;
  console.log(`  Lazer mid ${MID} (STX per BTC x 1e8)`);
  await tx('deposit-sell into a buy-stx rung -> u7104 (wrong side)', SELLER, DISPATCH, 'deposit-sell', [uintCV(Y_PER), alloc([BUY(10)], Y_PER)], { err: 7104n });
  const xw0 = await bals(BUYER), yw0 = await bals(SELLER);
  await tx('deposit-buy 3 x 0.002 sBTC into jing-buy-stx-*-v2', BUYER, DISPATCH, 'deposit-buy', [uintCV(X_PER * 3n), alloc(BANDS.map(BUY), X_PER)], isOk);
  await tx('deposit-sell 3 x 500 STX into jing-sell-stx-*-v2', SELLER, DISPATCH, 'deposit-sell', [uintCV(Y_PER * 3n), alloc(BANDS.map(SELL), Y_PER)], isOk);
  check('sBTC left the buyer: 0.006', xw0.sb - (await sbtc(BUYER)) === X_PER * 3n);
  check('STX left the seller: 1500', yw0.st - (await stx(SELLER)) === Y_PER * 3n);
  const pend = [];
  for (const bp of BANDS) { if (await pendX(BUY(bp))) pend.push(req(BUY(bp), true)); if (await pendY(SELL(bp))) pend.push(req(SELL(bp), false)); }
  console.log(`  pendings after push: ${pend.length}`);

  group('settle-batch-v2');
  await tx('settle-many [] -> u7201', OUTSIDER, C.batch, 'settle-many', [hexCV(AGED.hex), listCV([])], { err: 7201n });
  await fresh();
  if (pend.length) {
    await tx('settle-many with a never-pending principal only -> u7203', OUTSIDER, C.batch, 'settle-many', [upd(), listCV([req(OUTSIDER, true)])], { err: 7203n });
    const r = await tx(`settle-many ${pend.length} pendings (third party)`, OUTSIDER, C.batch, 'settle-many', [upd(), listCV(pend)], (v) => v?.ok?.settled === BigInt(pend.length));
    check('all codes u0', r.res?.ok?.codes?.every((c) => c === 0n), show(r.res));
  } else check('no pendings (pushed straight live)', true);
  for (const bp of BANDS) {
    check(`buy-stx-${bp}-v2 rests 0.002 sBTC on x`, (await liveX(BUY(bp))) === X_PER, show(await liveX(BUY(bp))));
    check(`sell-stx-${bp}-v2 rests 500 STX on y`, (await liveY(SELL(bp))) === Y_PER, show(await liveY(SELL(bp))));
  }
  const ask10 = await evalIn(C.market, `(token-x-limit-at '${BUY(10)} u${MID})`), bid10 = await evalIn(C.market, `(token-y-limit-at '${SELL(10)} u${MID})`);
  const ask50 = await evalIn(C.market, `(token-x-limit-at '${BUY(50)} u${MID})`), bid50 = await evalIn(C.market, `(token-y-limit-at '${SELL(50)} u${MID})`);
  console.log(`  asks: buy-10 ${ask10} buy-50 ${ask50}; bids: sell-10 ${bid10} sell-50 ${bid50}; mid ${MID}`);
  check('band pegs: ask(buy-10) = mid + 10 bps, bid(sell-10) = mid - 10 bps', ask10 === MID * (BPS + 10n) / BPS && bid10 === MID * (BPS - 10n) / BPS, `${ask10} ${bid10}`);
  check('band pegs: ask(buy-50) = mid + 50 bps, bid(sell-50) = mid - 50 bps', ask50 === MID * (BPS + 50n) / BPS && bid50 === MID * (BPS - 50n) / BPS, `${ask50} ${bid50}`);

  group('staleness on prints (pinned fork)');
  const T0 = await bt(); const age = T0 - AGED.at;
  console.log(`  block time ${T0}, P_aged at ${AGED.at}: age ${age} s`);
  must(`P_aged age ${age} s within ${AGE_MIN}..${AGE_MAX} (40 < age < 80)`, age > 40 && age < 80);
  await fresh();
  const rbFresh = await evalIn(C.market, `(get-taker-rebate-bps-for 0x${U.hex.replace(/^0x/, '')})`);
  const rbAged = await evalIn(C.market, `(get-taker-rebate-bps-for 0x${AGED.hex.replace(/^0x/, '')})`);
  check('get-taker-rebate-bps-for(fresh) = 20', rbFresh === 20n, rbFresh);
  check(`get-taker-rebate-bps-for(P_aged) = 20 + (age - 30) = ${20 + age - 30}`, rbAged === BigInt(20 + age - 30), rbAged);
  check('get-taker-rebate-bps-for(garbage) = 20 (default)', (await evalIn(C.market, '(get-taker-rebate-bps-for 0x00)')) === 20n);
  await tx('settle-with-refresh(P_aged) -> u1003 (older than the 40 s settle cap)', OUTSIDER, C.market, 'settle-with-refresh', [hexCV(AGED.hex), TX, AX, TY, AY], { err: 1003n });
  must('fund taker sBTC', (await call(BUYER, SBTC, 'transfer', [uintCV(2_000_000n), P_(BUYER), P_(TAKER), noneCV()])).res?.ok === true);
  await stxTransfer(SELLER, TAKER, 5_000_000_000n);
  // small market swaps: STX in, buys sBTC off the asks (deposit-x false)
  const SW = 20_000_000n; // 20 STX
  const swapArgs = (h) => [uintCV(SW), uintCV(MID * 10100n / BPS), hexCV(h), TX, AX, TY, AY, boolCV(false)];
  const s0 = await bals(TAKER);
  const sa = await tx('swap(P_aged) 20 STX -> sBTC under the 80 s cap -> ok', TAKER, C.market, 'swap', swapArgs(AGED.hex), isOk);
  const s1 = await bals(TAKER);
  check('aged swap moved: taker sBTC up, STX down', s1.sb > s0.sb && s1.st < s0.st, show({ sb: s1.sb - s0.sb, st: s0.st - s1.st, res: sa.res }));
  await tx('set-max-staleness 40 (operator)', DEP, C.market, 'set-max-staleness', [uintCV(40)], { ok: true });
  const sx = await tx('swap(P_aged) with max-staleness 40 -> stale (u1002 oracle or u1003 market)', TAKER, C.market, 'swap', swapArgs(AGED.hex), errIs(1002, 1003));
  note(`swap(P_aged) at max-staleness 40 returned ${show(sx.res)} (u1002 = the Lazer oracle's own window, now passed the var)`);
  await fresh();
  await tx('swap(fresh) with max-staleness 40 -> ok', TAKER, C.market, 'swap', swapArgs(U.hex), isOk);
  // reprice path (reprice-or-swap-token-y verifies the print when asks rest): same var
  await stxTransfer(SELLER, OUTSIDER, 100_000_000n);
  await tx('OUTSIDER rests a 20 STX bid at mid-3%', OUTSIDER, C.market, 'deposit-token-y', [uintCV(20_000_000n), uintCV(MID * 97n / 100n), noneCV(), TY, AY], isOk);
  if (await evalIn(C.market, `(get-token-y-pending-deposit '${OUTSIDER})`)) await tx('settle OUTSIDER bid (fresh)', DEP, C.market, 'settle-token-y-deposit', [P_(OUTSIDER), upd(), TY, AY], isOk);
  const rp = await tx('reprice-or-swap-token-y(P_aged) to mid-2% at max-staleness 40 -> stale', OUTSIDER, C.market, 'reprice-or-swap-token-y', [uintCV(MID * 98n / 100n), noneCV(), hexCV(AGED.hex), TX, AX, TY, AY], errIs(1002, 1003));
  note(`reprice(P_aged) at cap 40: ${show(rp.res)}`);
  await tx('set-max-staleness back to 80 (operator)', DEP, C.market, 'set-max-staleness', [uintCV(80)], { ok: true });
  check('rebate curve unchanged by the var (P_aged)', (await evalIn(C.market, `(get-taker-rebate-bps-for 0x${AGED.hex.replace(/^0x/, '')})`)) === rbAged);
  await tx('swap(P_aged) after max-staleness back to 80 -> ok', TAKER, C.market, 'swap', swapArgs(AGED.hex), isOk);
  await tx('reprice-or-swap-token-y(P_aged) to mid-2% at 80 -> ok (no cross, reprice)', OUTSIDER, C.market, 'reprice-or-swap-token-y', [uintCV(MID * 98n / 100n), noneCV(), hexCV(AGED.hex), TX, AX, TY, AY], isOk);
  // asks rest, so a non-crossing reprice parks as a pending limit until a newer print settles it
  const pl = await evalIn(C.market, `(get-token-y-pending-limit '${OUTSIDER})`);
  check('reprice stored as a pending limit at mid-2%', pl?.limit === MID * 98n / 100n, show(pl));
  await fresh();
  await tx('settle-token-y-limit(OUTSIDER) with a fresh print', DEP, C.market, 'settle-token-y-limit', [P_(OUTSIDER), upd()], isOk);
  check('OUTSIDER bid repriced to mid-2%', (await evalIn(C.market, `(token-y-limit-at '${OUTSIDER} u${MID})`)) === MID * 98n / 100n, show(await evalIn(C.market, `(token-y-limit-at '${OUTSIDER} u${MID})`)));
  await tx('OUTSIDER cancels the bid', OUTSIDER, C.market, 'cancel-token-y-deposit', [TY, AY], isOk);

  group('router v5-6 takers fill the rungs');
  await fresh();
  const stIn = X_PER * U.mid / SCALE * 15n / 10n;
  const t0 = await bals(TAKER);
  const r1 = await tx(`smart-swap-stx-for-sbtc ${stIn} uSTX, limit mid+100bps`, TAKER, C.router, 'smart-swap-stx-for-sbtc', [uintCV(stIn), uintCV(U.mid * (BPS + 100n) / BPS), someCV(upd()), uintCV(U.mid), uintCV(1)], isOk);
  const t1 = await bals(TAKER);
  console.log(`  taker paid ${t0.st - t1.st} uSTX got ${t1.sb - t0.sb} sats; ${show(r1.res?.ok)}`);
  check('taker got sBTC, paid STX; jing leg used', t1.sb > t0.sb && t1.st < t0.st && (r1.res?.ok?.['jing-in'] ?? 0n) > 0n, show(r1.res?.ok));
  check('buy-stx-10-v2 ask filled by the router taker', (await liveX(BUY(10))) < X_PER, show(await liveX(BUY(10))));
  await fresh();
  const sbIn = Y_PER * SCALE / U.mid * 15n / 10n;
  const t2 = await bals(TAKER);
  const r2 = await tx(`smart-swap-sbtc-for-stx ${sbIn} sats, limit mid-100bps`, TAKER, C.router, 'smart-swap-sbtc-for-stx', [uintCV(sbIn), uintCV(U.mid * (BPS - 100n) / BPS), someCV(upd()), uintCV(U.mid), uintCV(1)], isOk);
  const t3 = await bals(TAKER);
  console.log(`  taker sold ${t2.sb - t3.sb} sats got ${t3.st - t2.st} uSTX; ${show(r2.res?.ok)}`);
  check('taker got STX, paid sBTC; jing leg used', t3.st > t2.st && t3.sb < t2.sb && (r2.res?.ok?.['jing-in'] ?? 0n) > 0n, show(r2.res?.ok));
  check('sell-stx-10-v2 bid filled by the router taker', (await liveY(SELL(10))) < Y_PER, show(await liveY(SELL(10))));
  check('router holds nothing', show(await bals(C.router)) === show({ sb: 0n, st: 0n }), show(await bals(C.router)));

  group('dispatch claim + withdraw');
  const xs0 = await bals(BUYER);
  await tx('claim-buy [buy-stx-*-v2] (sBTC maker gets STX)', BUYER, DISPATCH, 'claim-buy', [listCV(BANDS.map((bp) => P_(BUY(bp))))], isOk);
  const xs1 = await bals(BUYER);
  check('claim-buy paid STX', xs1.st > xs0.st, `${xs1.st - xs0.st}`);
  const ys0 = await bals(SELLER);
  await tx('claim-sell [sell-stx-*-v2] (STX maker gets sBTC)', SELLER, DISPATCH, 'claim-sell', [listCV(BANDS.map((bp) => P_(SELL(bp))))], isOk);
  const ys1 = await bals(SELLER);
  check('claim-sell paid sBTC', ys1.sb > ys0.sb, `${ys1.sb - ys0.sb}`);
  await fresh();
  const xw1 = await sbtc(BUYER);
  await tx('withdraw-buy 0.0005 sBTC from buy-stx-50-v2', BUYER, DISPATCH, 'withdraw-buy', [alloc([BUY(50)], 50_000n), someCV(upd())], isOk);
  check('withdraw returned 50,000 sats', (await sbtc(BUYER)) - xw1 === 50_000n, `${(await sbtc(BUYER)) - xw1}`);
  const yw1 = await stx(SELLER);
  await tx('withdraw-sell 100 STX from sell-stx-50-v2', SELLER, DISPATCH, 'withdraw-sell', [alloc([SELL(50)], 100_000_000n), someCV(upd())], isOk);
  check('withdraw returned 100 STX', (await stx(SELLER)) - yw1 === 100_000_000n, `${(await stx(SELLER)) - yw1}`);

  group('settle-with-refresh (fresh) passes the settle cap');
  await tx('set-settle-max-staleness 20 (operator)', DEP, C.market, 'set-settle-max-staleness', [uintCV(20)], { ok: true });
  await tx('settle-with-refresh(P_aged) at cap 20 -> u1003', OUTSIDER, C.market, 'settle-with-refresh', [hexCV(AGED.hex), TX, AX, TY, AY], { err: 1003n });
  await fresh();
  const sr = await call(OUTSIDER, C.market, 'settle-with-refresh', [upd(), TX, AX, TY, AY]);
  check('settle-with-refresh(fresh) is not u1003 (passes the cap)', !sr.vm && sr.res?.err !== 1003n, show(sr.res ?? sr.vm));
  check('router still holds nothing', show(await bals(C.router)) === show({ sb: 0n, st: 0n }));
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(String(e?.message ?? e)); }
}
summary();
