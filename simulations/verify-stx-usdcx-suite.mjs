// stxer mainnet-fork proof: the whole contracts/stx-usdcx/ suite, deployed
// fresh in deploy order and driven end to end.
//   ladder -> market (core verify + initialize feeds 45/7, x = STX pinned,
//   y = USDCx pinned) -> rungs (jing-buy-stx-usdc-<bps> rests USDCx = token y,
//   jing-sell-stx-usdc-<bps> rests STX = token x) -> dispatch -> settle-batch
//   -> router.
// Two modes:
//   keyless (default): no signed [45, 7] Lazer update exists without a Pyth
//     Pro key (the faktory-dao backend only serves [1, 45] and [1, 7]), so the
//     run covers everything that needs no fresh STX/USDC price: deploy + pins,
//     ladder mapping, DIA STX/USD guard, router DLMM-only legs (6 dp / 6 dp
//     thresholds, per-pool bin step), dispatch deposits (STX escrowed as a
//     pending, USDCx resting), feed rejection of [1, 45] and [1, 7] updates
//     (u1023), USDCx partial withdraw, STX withdraw blocked without an update.
//   PYTH_API_KEY set: also settle-batch, router book takers both ways,
//     claims, withdraws (the sbtc-usdcx suite flow).
// Run: node simulations/verify-stx-usdcx-suite.mjs
import { readFileSync } from 'node:fs';
import { uintCV, noneCV, someCV, boolCV, bufferCV, stringAsciiCV, tupleCV, listCV } from '@stacks/transactions';
import { SimulationBuilder } from 'stxer';
import { fetchLazerUpdate, lazerFeedTimes } from './_lazer.js';
import { NODE, DEP, SBTC, WSTX, WHALE, P_, mk, S, retry, sleep, check, must, show, tx, evalIn, call, deploy, summary, Stop, stxTransfer, note } from './_yg-loop-common.js';

const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const USDC_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ';
const STX_WHALE = WHALE.y;
const N = {
  ladder: 'jing-ladder-stx-usdcx-v1', market: 'markets-stx-usdcx-jing-v6-4', dispatch: 'jing-ladder-dispatch-stx-usdcx',
  relay: 'jing-ladder-dispatch-stx-usdcx-relay', batch: 'jing-settle-batch-stx-usdcx', router: 'swap-router-stx-usdcx-jing-v5-5',
};
const C = Object.fromEntries(Object.entries(N).map(([k, v]) => [k, `${DEP}.${v}`]));
const CORE = `${DEP}.jing-core-v6`;
const BANDS = [10, 20, 50];
const BUY = (b) => `${DEP}.jing-buy-stx-usdc-${b}`, SELL = (b) => `${DEP}.jing-sell-stx-usdc-${b}`;
const src = (f) => readFileSync(new URL(`../contracts/stx-usdcx/${f}.clar`, import.meta.url), 'utf8');
const TX = P_(WSTX), TY = P_(USDCX);
const SCALE = 100_000_000n, BPS = 10_000n; // 6 dp / 6 dp: y = x * price / 1e8
const TAKER = mk(5);
const Y_PER = 200_000_000n; // 200 USDCx per buy-stx-usdc rung
const X_PER = 500_000_000n; // 500 STX per sell-stx-usdc rung
const KEYED = !!process.env.PYTH_API_KEY;

let U = null;
async function fresh() {
  const bt = Number(await evalIn(C.market, 'stacks-block-time'));
  for (let i = 0; i < 40; i++) {
    const u = await retry(() => fetchLazerUpdate([45, 7])); const t = await retry(() => lazerFeedTimes(u.hex, [45, 7]));
    if (t.at > bt) { U = { ...u, mid: u.px * SCALE / u.py }; return U; }
    await sleep(3000);
  }
  throw new Error('no fresh [45,7] update');
}
async function backendUpdate(pair, ids) {
  const r = await fetch(`https://faktory-dao-backend.vercel.app/api/auction/pyth-lazer-update?pair=${pair}`, { headers: { 'x-api-key': 'jc_e4d2e10396eef95215a7afd492f42d743a3325739d29200c2a28b256f778be01' } });
  if (!r.ok) throw new Error(`backend lazer ${r.status}`);
  const d = (await r.json()).data;
  if (String(d.feedIds) !== String(ids)) throw new Error(`feeds ${d.feedIds}`);
  return bufferCV(Buffer.from(d.hex.replace(/^0x/, ''), 'hex'));
}
const upd = () => bufferCV(Buffer.from(U.hex.replace(/^0x/, ''), 'hex'));
const usd = async (who) => (await evalIn(USDCX, `(get-balance '${who})`)).ok;
const stx = async (who) => evalIn(C.market, `(stx-get-balance '${who})`);
const bals = async (who) => ({ st: await stx(who), us: await usd(who) });
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };
const cyc = async () => evalIn(C.market, '(get-current-cycle)');
const liveX = async (who) => evalIn(C.market, `(get-token-x-deposit u${await cyc()} '${who})`);
const liveY = async (who) => evalIn(C.market, `(get-token-y-deposit u${await cyc()} '${who})`);
const pendX = async (who) => evalIn(C.market, `(get-token-x-pending-deposit '${who})`);
const pendY = async (who) => evalIn(C.market, `(get-token-y-pending-deposit '${who})`);
const alloc = (rungs, amt) => listCV(rungs.map((r) => tupleCV({ rung: P_(r), amount: uintCV(amt) })));
const req = (who, x) => tupleCV({ who: P_(who), x: boolCV(x), kind: uintCV(0) });
const amm = (d, x = 0n, v = 0n) => tupleCV({ dlmm: uintCV(d), xyk: uintCV(x), velar: uintCV(v) });

try {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(USDCX, '(get-total-supply)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);
  console.log(KEYED ? 'mode: keyed (PYTH_API_KEY set, [45,7] updates)' : 'mode: keyless (no [45,7] update: book settle / takers / claims skipped)');

  group('deploy + init');
  await deploy(DEP, N.ladder, src(N.ladder));
  check('ladder owner = DEP', (await evalIn(C.ladder, '(get-owner)')) === DEP);
  await deploy(DEP, N.market, src(N.market));
  const CORE_OWNER = await evalIn(CORE, '(get-contract-owner)');
  await tx('core set-verified-contract(market)', CORE_OWNER, CORE, 'set-verified-contract', [P_(C.market)], (v) => v?.ok !== undefined);
  await tx('market set-operator -> core owner', DEP, C.market, 'set-operator', [P_(CORE_OWNER)], { ok: true });
  await tx('initialize(x = sbtc-token) -> u1013 (x pinned to STX)', CORE_OWNER, C.market, 'initialize', [P_(C.market), P_(SBTC), TY, uintCV(1_000_000n), uintCV(1_000_000n), uintCV(45), uintCV(7)], { err: 1013n });
  await tx('initialize(y = token-stx) -> u1013 (y pinned to USDCx)', CORE_OWNER, C.market, 'initialize', [P_(C.market), TX, TX, uintCV(1_000_000n), uintCV(1_000_000n), uintCV(45), uintCV(7)], { err: 1013n });
  await tx('market initialize(token-stx-v-1-2, usdcx, 1 STX, 1 USDCx, 45, 7)', CORE_OWNER, C.market, 'initialize', [P_(C.market), TX, TY, uintCV(1_000_000n), uintCV(1_000_000n), uintCV(45), uintCV(7)], { ok: true });
  await tx('market set-operator -> DEP', CORE_OWNER, C.market, 'set-operator', [P_(DEP)], { ok: true });
  const mins = await evalIn(C.market, '(get-min-deposits)');
  check('min deposits 1 STX / 1 USDCx', mins?.['min-token-x'] === 1_000_000n && mins?.['min-token-y'] === 1_000_000n, show(mins));
  const buySrc = src('jing-buy-stx-usdc-bps'), sellSrc = src('jing-sell-stx-usdc-bps');
  for (const bp of BANDS) { await deploy(DEP, `jing-buy-stx-usdc-${bp}`, buySrc); await deploy(DEP, `jing-sell-stx-usdc-${bp}`, sellSrc); }
  await tx('ladder set-canonical buy-band = jing-buy-stx-usdc-10', DEP, C.ladder, 'set-canonical', [stringAsciiCV('buy-band'), P_(BUY(10))], { ok: true });
  await tx('ladder set-canonical sel-band = jing-sell-stx-usdc-10', DEP, C.ladder, 'set-canonical', [stringAsciiCV('sel-band'), P_(SELL(10))], { ok: true });
  await tx('initialize jing-buy-stx-usdc-20 with bps 50 -> u7009 bad name', DEP, BUY(20), 'initialize', [uintCV(50), boolCV(true)], { err: 7009n });
  for (const bp of BANDS) {
    await tx(`initialize jing-buy-stx-usdc-${bp} (seat)`, DEP, BUY(bp), 'initialize', [uintCV(bp), boolCV(true)], { ok: true });
    await tx(`initialize jing-sell-stx-usdc-${bp} (seat)`, DEP, SELL(bp), 'initialize', [uintCV(bp), boolCV(true)], { ok: true });
  }
  await deploy(DEP, N.dispatch, src(N.dispatch));
  await deploy(DEP, N.relay, src(N.relay));
  await deploy(DEP, N.batch, src(N.batch));
  await deploy(DEP, N.router, src(N.router));

  group('ladder side mapping');
  check('sell-stx-usdc-10 registered sel-band', (await evalIn(C.ladder, `(get-registered '${SELL(10)})`))?.side === 'sel-band');
  check('buy-stx-usdc-10 registered buy-band', (await evalIn(C.ladder, `(get-registered '${BUY(10)})`))?.side === 'buy-band');
  check('is-band-x(sell-stx-usdc-10) and not is-band-y', (await evalIn(C.ladder, `(is-band-x '${SELL(10)})`)) === true && (await evalIn(C.ladder, `(is-band-y '${SELL(10)})`)) === false);
  check('is-band-y(buy-stx-usdc-10) and not is-band-x', (await evalIn(C.ladder, `(is-band-y '${BUY(10)})`)) === true && (await evalIn(C.ladder, `(is-band-x '${BUY(10)})`)) === false);
  for (const bp of BANDS) {
    const sx = await evalIn(C.market, `(is-protected-x '${SELL(bp)})`), by = await evalIn(C.market, `(is-protected-y '${BUY(bp)})`);
    const cx = await evalIn(C.market, `(is-protected-y '${SELL(bp)})`), cy = await evalIn(C.market, `(is-protected-x '${BUY(bp)})`);
    check(`market seats sell-stx-usdc-${bp} on x, buy-stx-usdc-${bp} on y (not crossed)`, sx === true && by === true && cx === false && cy === false, show({ sx, by, cx, cy }));
  }

  group('DIA STX/USD guard');
  const dia = await evalIn(BUY(10), '(miner-mid)');
  console.log(`  DIA STX/USD (8 dp) ${dia} = $${Number(dia) / 1e8}`);
  check('DIA STX/USD is live (< 2h) and in $0.05..$20', dia > 5_000_000n && dia < 2_000_000_000n, dia);
  check('buy-stx-usdc current-cap = DIA * 12000 / 10000', (await evalIn(BUY(10), '(current-cap)')) === dia * 12000n / BPS);
  check('sell-stx-usdc current-floor = DIA * 8000 / 10000', (await evalIn(SELL(10), '(current-floor)')) === dia * 8000n / BPS);

  group('router DLMM legs (no Jing leg, keyless)');
  await stxTransfer(STX_WHALE, TAKER, 3_000_000_000n);
  must('fund taker 500 USDCx', (await call(USDC_WHALE, USDCX, 'transfer', [uintCV(500_000_000n), P_(USDC_WHALE), P_(TAKER), noneCV()])).res?.ok === true);
  const d0 = await bals(TAKER);
  const sIn = 100_000_000n; // 100 STX
  const exp = sIn * dia / SCALE;
  const r0 = await tx('swap-stx-for-usdcx 100 STX all DLMM, min 95% of DIA', TAKER, C.router, 'swap-stx-for-usdcx', [uintCV(sIn), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(sIn), amm(exp * 95n / 100n), uintCV(exp * 95n / 100n)], (v) => v?.ok !== undefined);
  const d1 = await bals(TAKER);
  console.log(`  sold ${d0.st - d1.st} uSTX for ${d1.us - d0.us} uUSDCx (${Number(d1.us - d0.us) / 1e6} USDCx; DIA says ${Number(exp) / 1e6}); ${show(r0.res?.ok)}`);
  check('STX -> USDCx: exactly 100 STX in, USDCx out within 3% of DIA', d0.st - d1.st === sIn && d1.us - d0.us > exp * 97n / 100n && d1.us - d0.us < exp * 103n / 100n, `${d1.us - d0.us} vs ${exp}`);
  const uIn = 30_000_000n; // 30 USDCx
  const expS = uIn * SCALE / dia;
  const r1 = await tx('swap-usdcx-for-stx 30 USDCx all DLMM, min 95% of DIA', TAKER, C.router, 'swap-usdcx-for-stx', [uintCV(uIn), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(uIn), amm(expS * 95n / 100n), uintCV(expS * 95n / 100n)], (v) => v?.ok !== undefined);
  const d2 = await bals(TAKER);
  console.log(`  paid ${d1.us - d2.us} uUSDCx for ${d2.st - d1.st} uSTX (DIA says ${expS}); ${show(r1.res?.ok)}`);
  check('USDCx -> STX: exactly 30 USDCx in, STX out within 3% of DIA', d1.us - d2.us === uIn && d2.st - d1.st > expS * 97n / 100n && d2.st - d1.st < expS * 103n / 100n, `${d2.st - d1.st} vs ${expS}`);
  await tx('xyk leg non-zero -> u3003', TAKER, C.router, 'swap-stx-for-usdcx', [uintCV(2_000_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(1_000_000n, 1_000_000n), amm(1n), uintCV(0)], { err: 3003n });
  await tx('velar leg non-zero -> u3003', TAKER, C.router, 'swap-usdcx-for-stx', [uintCV(2_000_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(1_000_000n, 0n, 1_000_000n), amm(1n), uintCV(0)], { err: 3003n });
  // smart-swap with no update: the whole size goes through dlmm-stage at the limit
  const lim = dia * 97n / 100n;
  const e0 = await bals(TAKER);
  const r2 = await tx('smart-swap-stx-for-usdcx 200 STX, limit DIA - 3%, no update', TAKER, C.router, 'smart-swap-stx-for-usdcx', [uintCV(200_000_000n), uintCV(lim), noneCV(), uintCV(dia), uintCV(1)], (v) => v?.ok !== undefined);
  const e1 = await bals(TAKER);
  const sold = e0.st - e1.st, got = e1.us - e0.us;
  console.log(`  sold ${sold} uSTX for ${got} uUSDCx -> ${sold ? Number(got * SCALE / sold) / 1e8 : 0} USDCx/STX (limit ${Number(lim) / 1e8}); ${show(r2.res?.ok)}`);
  check('smart sell: DLMM filled, avg price >= limit (6/6 dp threshold)', sold > 0n && r2.res?.ok?.['dlmm-in'] === sold && got * SCALE >= lim * sold, `in ${sold} out ${got}`);
  const r3 = await tx('smart-swap-stx-for-usdcx 50 STX, limit 2x DIA -> nothing sold', TAKER, C.router, 'smart-swap-stx-for-usdcx', [uintCV(50_000_000n), uintCV(dia * 2n), noneCV(), uintCV(dia), uintCV(0)], (v) => v?.ok?.['dlmm-in'] === 0n && v?.ok?.out === 0n);
  const limB = dia * 103n / 100n;
  const f0 = await bals(TAKER);
  const r4 = await tx('smart-swap-usdcx-for-stx 60 USDCx, limit DIA + 3%, no update', TAKER, C.router, 'smart-swap-usdcx-for-stx', [uintCV(60_000_000n), uintCV(limB), noneCV(), uintCV(dia), uintCV(1)], (v) => v?.ok !== undefined);
  const f1 = await bals(TAKER);
  const paid = f0.us - f1.us, recv = f1.st - f0.st;
  console.log(`  paid ${paid} uUSDCx for ${recv} uSTX -> ${recv ? Number(paid * SCALE / recv) / 1e8 : 0} USDCx/STX (limit ${Number(limB) / 1e8}); ${show(r4.res?.ok)}`);
  check('smart buy: DLMM filled, avg price <= limit', recv > 0n && paid * SCALE <= limB * recv, `in ${paid} out ${recv}`);
  await tx('smart-swap-usdcx-for-stx 20 USDCx, limit DIA / 2 -> nothing bought', TAKER, C.router, 'smart-swap-usdcx-for-stx', [uintCV(20_000_000n), uintCV(dia / 2n), noneCV(), uintCV(dia), uintCV(0)], (v) => v?.ok?.['dlmm-in'] === 0n && v?.ok?.out === 0n);
  check('router holds nothing', show(await bals(C.router)) === show({ st: 0n, us: 0n }), show(await bals(C.router)));

  group('dispatch deposits');
  await tx('deposit-sell into buy-stx-usdc rung -> u7104 (wrong side)', STX_WHALE, C.dispatch, 'deposit-sell', [uintCV(X_PER), alloc([BUY(10)], X_PER)], { err: 7104n });
  const yw0 = await usd(USDC_WHALE), xw0 = await stx(STX_WHALE), m0 = await stx(C.market);
  await tx('deposit-buy 3 x 200 USDCx into jing-buy-stx-usdc-*', USDC_WHALE, C.dispatch, 'deposit-buy', [uintCV(Y_PER * 3n), alloc(BANDS.map(BUY), Y_PER)], (v) => v?.ok !== undefined);
  await tx('deposit-sell 3 x 500 STX into jing-sell-stx-usdc-*', STX_WHALE, C.dispatch, 'deposit-sell', [uintCV(X_PER * 3n), alloc(BANDS.map(SELL), X_PER)], (v) => v?.ok !== undefined);
  check('USDCx left the buyer: 600.000000', yw0 - (await usd(USDC_WHALE)) === Y_PER * 3n);
  check('STX left the seller: 1500.000000', xw0 - (await stx(STX_WHALE)) === X_PER * 3n);
  check('market holds the 1500 STX (as-contract? with-stx push)', (await stx(C.market)) - m0 === X_PER * 3n, `${(await stx(C.market)) - m0}`);
  check('buy-stx-usdc-10 get-cap = DIA * 12000 / 10000 after push', (await evalIn(BUY(10), '(get-cap)')) === dia * 12000n / BPS);
  check('sell-stx-usdc-10 get-floor = DIA * 8000 / 10000 after push', (await evalIn(SELL(10), '(get-floor)')) === dia * 8000n / BPS);
  const pend = [];
  for (const bp of BANDS) { if (await pendY(BUY(bp))) pend.push(req(BUY(bp), false)); if (await pendX(SELL(bp))) pend.push(req(SELL(bp), true)); }
  console.log(`  pendings after push: ${pend.length}`);
  for (const bp of BANDS) {
    check(`buy-stx-usdc-${bp} rests 200 USDCx live on y (x side empty -> direct)`, (await liveY(BUY(bp))) === Y_PER, show(await liveY(BUY(bp))));
    const p = await pendX(SELL(bp));
    check(`sell-stx-usdc-${bp} 500 STX pending on x (y side live)`, p?.amount === X_PER, show(p));
  }
  const pos = await evalIn(SELL(10), `(get-position '${STX_WHALE})`);
  check('sell rung position: trait key sbtc = token x (uSTX), stx = token y (uUSDCx)', pos?.sbtc === X_PER && pos?.stx === 0n, show(pos));

  group('feed pin: wrong Lazer feeds rejected');
  const u145 = await retry(() => backendUpdate('sbtc-stx', [1, 45]));
  await tx('settle-token-x-deposit with a [1, 45] update -> u1023', DEP, C.market, 'settle-token-x-deposit', [P_(SELL(10)), u145, TX, stringAsciiCV('wstx')], { err: 1023n });
  const u17 = await retry(() => backendUpdate('sbtc-usdcx', [1, 7]));
  await tx('settle-token-x-deposit with a [1, 7] update -> u1023', DEP, C.market, 'settle-token-x-deposit', [P_(SELL(10)), u17, TX, stringAsciiCV('wstx')], { err: 1023n });
  await tx('deposit-token-x with the sBTC trait -> u1013 (x = token-stx only)', STX_WHALE, C.market, 'deposit-token-x', [uintCV(2_000_000n), uintCV(dia), noneCV(), P_(SBTC), stringAsciiCV('sbtc-token')], { err: 1013n });

  if (!KEYED) {
    group('keyless withdraws');
    const yw1 = await usd(USDC_WHALE);
    await tx('withdraw-buy 50 USDCx from buy-stx-usdc-50 (live, no update needed)', USDC_WHALE, C.dispatch, 'withdraw-buy', [alloc([BUY(50)], 50_000_000n), noneCV()], (v) => v?.ok !== undefined);
    check('withdraw returned 50.000000 USDCx', (await usd(USDC_WHALE)) - yw1 === 50_000_000n, `${(await usd(USDC_WHALE)) - yw1}`);
    await tx('withdraw-sell from sell-stx-usdc-50 while its STX is pending, no update -> u7012', STX_WHALE, C.dispatch, 'withdraw-sell', [alloc([SELL(50)], 100_000_000n), noneCV()], { err: 7012n });
    note('keyless run: settle-batch, router book takers, claims and STX withdraw need a signed [45,7] Lazer update (set PYTH_API_KEY)');
  } else {
    const MID0 = (await fresh()).mid;
    console.log(`  Lazer STX/USDC mid ${MID0} ($${Number(MID0) / 1e8}); DIA vs Lazer ${Number((dia - MID0) * BPS / MID0)} bps`);

    group('settle-batch');
    await fresh();
    const MID = U.mid;
    const r = await tx(`settle-many ${pend.length} pendings`, DEP, C.batch, 'settle-many', [upd(), listCV(pend)], (v) => v?.ok?.settled === BigInt(pend.length));
    check('all codes u0', r.res?.ok?.codes?.every((c) => c === 0n), show(r.res));
    for (const bp of BANDS) {
      check(`buy-stx-usdc-${bp} rests 200 USDCx on y`, (await liveY(BUY(bp))) === Y_PER, show(await liveY(BUY(bp))));
      check(`sell-stx-usdc-${bp} rests 500 STX on x`, (await liveX(SELL(bp))) === X_PER, show(await liveX(SELL(bp))));
    }
    const ask50 = await evalIn(C.market, `(token-x-limit-at '${SELL(50)} u${MID})`), bid50 = await evalIn(C.market, `(token-y-limit-at '${BUY(50)} u${MID})`);
    check('ask(sell-stx-usdc-50) = mid + 50 bps, bid(buy-stx-usdc-50) = mid - 50 bps', ask50 === MID * (BPS + 50n) / BPS && bid50 === MID * (BPS - 50n) / BPS, `${ask50} ${bid50}`);

    group('router takers fill the rungs');
    await fresh();
    const usIn = X_PER * U.mid / SCALE * 15n / 10n;
    const t0 = await bals(TAKER);
    must('taker has the USDCx', t0.us >= usIn, `${t0.us} < ${usIn}`);
    const q1 = await tx(`smart-swap-usdcx-for-stx ${usIn} uUSDCx, limit mid+100bps`, TAKER, C.router, 'smart-swap-usdcx-for-stx', [uintCV(usIn), uintCV(U.mid * (BPS + 100n) / BPS), someCV(upd()), uintCV(U.mid), uintCV(1)], (v) => v?.ok !== undefined);
    const t1 = await bals(TAKER);
    console.log(`  taker paid ${t0.us - t1.us} uUSDCx got ${t1.st - t0.st} uSTX; ${show(q1.res?.ok)}`);
    check('taker got STX, paid USDCx; Jing leg filled', t1.st > t0.st && t1.us < t0.us && q1.res?.ok?.['jing-in'] > 0n);
    check('sell-stx-usdc-10 ask filled by a taker at mid', (await liveX(SELL(10))) < X_PER);
    await fresh();
    const stIn = Y_PER * SCALE / U.mid * 15n / 10n;
    const t2 = await bals(TAKER);
    const q2 = await tx(`smart-swap-stx-for-usdcx ${stIn} uSTX, limit mid-100bps`, TAKER, C.router, 'smart-swap-stx-for-usdcx', [uintCV(stIn), uintCV(U.mid * (BPS - 100n) / BPS), someCV(upd()), uintCV(U.mid), uintCV(1)], (v) => v?.ok !== undefined);
    const t3 = await bals(TAKER);
    console.log(`  taker sold ${t2.st - t3.st} uSTX got ${t3.us - t2.us} uUSDCx; ${show(q2.res?.ok)}`);
    check('taker got USDCx, paid STX; Jing leg filled', t3.us > t2.us && t3.st < t2.st && q2.res?.ok?.['jing-in'] > 0n);
    check('buy-stx-usdc-10 bid filled by a taker at mid', (await liveY(BUY(10))) < Y_PER);
    check('router holds nothing', show(await bals(C.router)) === show({ st: 0n, us: 0n }), show(await bals(C.router)));

    group('dispatch claim + withdraw');
    let soldX = 0n, spentY = 0n;
    for (const bp of BANDS) { soldX += X_PER - (await liveX(SELL(bp))); spentY += Y_PER - (await liveY(BUY(bp))); }
    const xs0 = await bals(STX_WHALE);
    await tx('claim-sell [sell-stx-usdc-*] (STX maker gets USDCx)', STX_WHALE, C.dispatch, 'claim-sell', [listCV(BANDS.map((bp) => P_(SELL(bp))))], (v) => v?.ok !== undefined);
    const xs1 = await bals(STX_WHALE);
    const gotUs = xs1.us - xs0.us;
    const pSell = gotUs * SCALE / soldX;
    console.log(`  sell rungs sold ${soldX} uSTX for ${gotUs} uUSDCx -> ${Number(pSell) / 1e8} USDCx/STX (${Number((pSell - MID) * BPS / MID)} bps vs mid)`);
    check('claim paid USDCx, no STX moved', gotUs > 0n && xs1.st === xs0.st, `${gotUs}`);
    check('sell makers paid above mid, within 1%', pSell >= MID && pSell < MID * 101n / 100n, `${pSell} vs ${MID}`);
    const ys0 = await bals(USDC_WHALE);
    await tx('claim-buy [buy-stx-usdc-*] (USDCx maker gets STX)', USDC_WHALE, C.dispatch, 'claim-buy', [listCV(BANDS.map((bp) => P_(BUY(bp))))], (v) => v?.ok !== undefined);
    const ys1 = await bals(USDC_WHALE);
    const gotSt = ys1.st - ys0.st;
    const pBuy = (spentY - (ys1.us - ys0.us)) * SCALE / gotSt;
    console.log(`  buy rungs spent ${spentY - (ys1.us - ys0.us)} uUSDCx for ${gotSt} uSTX -> ${Number(pBuy) / 1e8} USDCx/STX`);
    check('claim paid STX; USDCx moved only as the sold-out remainder', gotSt > 0n && ys1.us - ys0.us < 10_000n, `stx +${gotSt}, usdcx +${ys1.us - ys0.us}`);
    check('buy makers paid below mid, within 1%', pBuy <= MID && pBuy > MID * 99n / 100n, `${pBuy} vs ${MID}`);
    await fresh();
    const yw1 = await usd(USDC_WHALE);
    await tx('withdraw-buy 50 USDCx from buy-stx-usdc-50', USDC_WHALE, C.dispatch, 'withdraw-buy', [alloc([BUY(50)], 50_000_000n), someCV(upd())], (v) => v?.ok !== undefined);
    check('withdraw returned 50.000000 USDCx', (await usd(USDC_WHALE)) - yw1 === 50_000_000n);
    const xw1 = await stx(STX_WHALE);
    await tx('withdraw-sell 100 STX from sell-stx-usdc-50', STX_WHALE, C.dispatch, 'withdraw-sell', [alloc([SELL(50)], 100_000_000n), someCV(upd())], (v) => v?.ok !== undefined);
    check('withdraw returned 100.000000 STX', (await stx(STX_WHALE)) - xw1 === 100_000_000n, `${(await stx(STX_WHALE)) - xw1}`);
    check('router still holds nothing', show(await bals(C.router)) === show({ st: 0n, us: 0n }));
  }
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(String(e?.message ?? e)); }
}
summary();
