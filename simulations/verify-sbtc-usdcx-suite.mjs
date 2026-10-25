// stxer mainnet-fork proof: the whole contracts/sbtc-usdcx/ suite, deployed
// fresh in deploy order and driven end to end.
//   ladder -> market (core verify + initialize feeds 1/7) -> rungs
//   (jing-buy-sbtc-<bps> rests USDCx = token y, jing-sell-sbtc-<bps> rests
//   sBTC = token x) -> dispatch -> settle-batch -> router.
// Covers: ladder side mapping, DIA guard (cap = 2x DIA, floor = DIA / 2),
// dispatch deposits, settle-batch on the pendings, router takers filling the
// rungs both ways, dispatch claim + withdraw with the right token/decimals,
// no residual balance in the router.
// Run: node simulations/verify-sbtc-usdcx-suite.mjs
import { readFileSync } from 'node:fs';
import { uintCV, noneCV, someCV, boolCV, bufferCV, stringAsciiCV, tupleCV, listCV } from '@stacks/transactions';
import { SimulationBuilder } from 'stxer';
import { lazerFeedTimes } from './_lazer.js';
import { NODE, DEP, SBTC, WHALE, P_, mk, S, retry, sleep, check, must, show, tx, evalIn, call, deploy, prints, summary, Stop } from './_yg-loop-common.js';

const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const USDC_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ';
const N = {
  ladder: 'jing-ladder-sbtc-usdcx-v1', market: 'markets-sbtc-usdcx-jing-v6-4', dispatch: 'jing-ladder-dispatch-sbtc-usdcx',
  batch: 'jing-settle-batch-sbtc-usdcx', router: 'swap-router-sbtc-usdcx-jing-v5-5',
};
const C = Object.fromEntries(Object.entries(N).map(([k, v]) => [k, `${DEP}.${v}`]));
const CORE = `${DEP}.jing-core-v6`;
const BANDS = [10, 20, 50]; // no 0 bps: a buy-0 bid and a sell-0 ask both sit at mid and cross (crossing refund)
const BUY = (b) => `${DEP}.jing-buy-sbtc-${b}`, SELL = (b) => `${DEP}.jing-sell-sbtc-${b}`;
const src = (f) => readFileSync(new URL(`../contracts/sbtc-usdcx/${f}.clar`, import.meta.url), 'utf8');
const TX = P_(SBTC), TY = P_(USDCX), AX = stringAsciiCV('sbtc-token'), AY = stringAsciiCV('usdcx-token');
const SCALE = 10_000_000_000n, BPS = 10_000n;
const TAKER = mk(5);
const Y_PER = 200_000_000n; // 200 USDCx per buy-sbtc rung
const X_PER = 200_000n;     // 0.002 sBTC per sell-sbtc rung

async function fetchUsdcx() {
  const r = await fetch('https://faktory-dao-backend.vercel.app/api/auction/pyth-lazer-update?pair=sbtc-usdcx', { headers: { 'x-api-key': 'jc_e4d2e10396eef95215a7afd492f42d743a3325739d29200c2a28b256f778be01' } });
  if (!r.ok) throw new Error(`backend lazer ${r.status}`);
  const d = (await r.json()).data;
  if (String(d.feedIds) !== '1,7') throw new Error(`feeds ${d.feedIds}`);
  return { hex: d.hex.replace(/^0x/, ''), px: BigInt(d.priceX), py: BigInt(d.priceY) };
}
let U = null;
async function fresh() {
  const bt = Number(await evalIn(C.market, 'stacks-block-time'));
  for (let i = 0; i < 40; i++) {
    const u = await retry(fetchUsdcx); const t = await retry(() => lazerFeedTimes(u.hex, [1, 7]));
    if (t.at > bt) { U = { ...u, mid: u.px * 100000000n / u.py }; return U; }
    await sleep(3000);
  }
  throw new Error('no fresh [1,7] update');
}
const upd = () => bufferCV(Buffer.from(U.hex, 'hex'));
const bal = async (tok, who) => (await evalIn(tok, `(get-balance '${who})`)).ok;
const bals = async (who) => ({ sb: await bal(SBTC, who), us: await bal(USDCX, who) });
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };
const cyc = async () => evalIn(C.market, '(get-current-cycle)');
const liveX = async (who) => evalIn(C.market, `(get-token-x-deposit u${await cyc()} '${who})`);
const liveY = async (who) => evalIn(C.market, `(get-token-y-deposit u${await cyc()} '${who})`);
const pendX = async (who) => evalIn(C.market, `(get-token-x-pending-deposit '${who})`);
const pendY = async (who) => evalIn(C.market, `(get-token-y-pending-deposit '${who})`);
const alloc = (rungs, amt) => listCV(rungs.map((r) => tupleCV({ rung: P_(r), amount: uintCV(amt) })));
const req = (who, x) => tupleCV({ who: P_(who), x: boolCV(x), kind: uintCV(0) });

try {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(SBTC, '(get-total-supply)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);

  group('deploy + init');
  await deploy(DEP, N.ladder, src(N.ladder));
  check('ladder owner = DEP', (await evalIn(C.ladder, '(get-owner)')) === DEP);
  await deploy(DEP, N.market, src(N.market));
  // jing-core-v6 is owned by the Juice multisig since 2026-10-24: verify as whoever owns it
  await tx('core set-verified-contract(market)', await evalIn(CORE, '(get-contract-owner)'), CORE, 'set-verified-contract', [P_(C.market)], (v) => v?.ok !== undefined);
  // initialize needs tx-sender = operator = core owner: hand the operator to the multisig, initialize, hand it back
  const CORE_OWNER = await evalIn(CORE, '(get-contract-owner)');
  await tx('market set-operator -> core owner', DEP, C.market, 'set-operator', [P_(CORE_OWNER)], { ok: true });
  await tx('market initialize(sbtc, usdcx, 1, 7)', CORE_OWNER, C.market, 'initialize', [P_(C.market), TX, TY, uintCV(1_000n), uintCV(1_000_000n), uintCV(1), uintCV(7)], { ok: true });
  await tx('market set-operator -> DEP', CORE_OWNER, C.market, 'set-operator', [P_(DEP)], { ok: true });
  const buySrc = src('jing-buy-sbtc-bps'), sellSrc = src('jing-sell-sbtc-bps');
  for (const bp of BANDS) { await deploy(DEP, `jing-buy-sbtc-${bp}`, buySrc); await deploy(DEP, `jing-sell-sbtc-${bp}`, sellSrc); }
  await tx('ladder set-canonical buy-band = jing-buy-sbtc-10', DEP, C.ladder, 'set-canonical', [stringAsciiCV('buy-band'), P_(BUY(10))], { ok: true });
  await tx('ladder set-canonical sel-band = jing-sell-sbtc-10', DEP, C.ladder, 'set-canonical', [stringAsciiCV('sel-band'), P_(SELL(10))], { ok: true });
  await tx('initialize jing-buy-sbtc-20 with bps 50 -> u7009 bad name', DEP, BUY(20), 'initialize', [uintCV(50), boolCV(true)], { err: 7009n });
  for (const bp of BANDS) {
    await tx(`initialize jing-buy-sbtc-${bp} (seat)`, DEP, BUY(bp), 'initialize', [uintCV(bp), boolCV(true)], { ok: true });
    await tx(`initialize jing-sell-sbtc-${bp} (seat)`, DEP, SELL(bp), 'initialize', [uintCV(bp), boolCV(true)], { ok: true });
  }
  await deploy(DEP, N.dispatch, src(N.dispatch));
  await deploy(DEP, N.batch, src(N.batch));
  await deploy(DEP, N.router, src(N.router));

  group('ladder side mapping');
  check('sell-sbtc-10 registered sel-band', (await evalIn(C.ladder, `(get-registered '${SELL(10)})`))?.side === 'sel-band', show(await evalIn(C.ladder, `(get-registered '${SELL(10)})`)));
  check('buy-sbtc-10 registered buy-band', (await evalIn(C.ladder, `(get-registered '${BUY(10)})`))?.side === 'buy-band', show(await evalIn(C.ladder, `(get-registered '${BUY(10)})`)));
  check('is-band-x(sell-sbtc-10) and not is-band-y', (await evalIn(C.ladder, `(is-band-x '${SELL(10)})`)) === true && (await evalIn(C.ladder, `(is-band-y '${SELL(10)})`)) === false);
  check('is-band-y(buy-sbtc-10) and not is-band-x', (await evalIn(C.ladder, `(is-band-y '${BUY(10)})`)) === true && (await evalIn(C.ladder, `(is-band-x '${BUY(10)})`)) === false);
  for (const bp of BANDS) {
    const sx = await evalIn(C.market, `(is-protected-x '${SELL(bp)})`), by = await evalIn(C.market, `(is-protected-y '${BUY(bp)})`);
    const cx = await evalIn(C.market, `(is-protected-y '${SELL(bp)})`), cy = await evalIn(C.market, `(is-protected-x '${BUY(bp)})`);
    check(`market seats sell-sbtc-${bp} on x, buy-sbtc-${bp} on y (not crossed)`, sx === true && by === true && cx === false && cy === false, show({ sx, by, cx, cy }));
  }

  group('DIA guard');
  const dia = await evalIn(BUY(10), '(miner-mid)');
  console.log(`  DIA BTC/USD (8 dp) ${dia} = $${Number(dia) / 1e8}`);
  check('DIA BTC/USD is live and in $20k..$500k', dia > 2_000_000_000_000n && dia < 50_000_000_000_000n, dia);
  check('buy-sbtc current-cap = DIA * 12000 / 10000', (await evalIn(BUY(10), '(current-cap)')) === dia * 12000n / BPS);
  check('sell-sbtc current-floor = DIA * 8000 / 10000', (await evalIn(SELL(10), '(current-floor)')) === dia * 8000n / BPS);

  group('dispatch deposits');
  await fresh();
  const MID = U.mid;
  console.log(`  Lazer mid ${MID} ($${Number(MID) / 1e8}); DIA vs Lazer ${Number((dia - MID) * BPS / MID)} bps`);
  await tx('deposit-sell into buy-sbtc rung -> u7104 (wrong side)', WHALE.x, C.dispatch, 'deposit-sell', [uintCV(X_PER), alloc([BUY(10)], X_PER)], { err: 7104n });
  const yw0 = await bals(USDC_WHALE), xw0 = await bals(WHALE.x);
  await tx('deposit-buy 3 x 200 USDCx into jing-buy-sbtc-*', USDC_WHALE, C.dispatch, 'deposit-buy', [uintCV(Y_PER * 3n), alloc(BANDS.map(BUY), Y_PER)], (v) => v?.ok !== undefined);
  await tx('deposit-sell 3 x 0.002 sBTC into jing-sell-sbtc-*', WHALE.x, C.dispatch, 'deposit-sell', [uintCV(X_PER * 3n), alloc(BANDS.map(SELL), X_PER)], (v) => v?.ok !== undefined);
  check('USDCx left the buyer: 600.000000', yw0.us - (await bal(USDCX, USDC_WHALE)) === Y_PER * 3n);
  check('sBTC left the seller: 0.006', xw0.sb - (await bal(SBTC, WHALE.x)) === X_PER * 3n);
  check('buy-sbtc-10 get-cap = DIA * 12000 / 10000 after push', (await evalIn(BUY(10), '(get-cap)')) === dia * 12000n / BPS);
  check('sell-sbtc-10 get-floor = DIA * 8000 / 10000 after push', (await evalIn(SELL(10), '(get-floor)')) === dia * 8000n / BPS);
  const pend = [];
  for (const bp of BANDS) { if (await pendY(BUY(bp))) pend.push(req(BUY(bp), false)); if (await pendX(SELL(bp))) pend.push(req(SELL(bp), true)); }
  console.log(`  pendings after push: ${pend.length}`);

  group('settle-batch');
  await fresh();
  if (pend.length) {
    const r = await tx(`settle-many ${pend.length} pendings`, DEP, C.batch, 'settle-many', [upd(), listCV(pend)], (v) => v?.ok?.settled === BigInt(pend.length));
    check('all codes u0', r.res?.ok?.codes?.every((c) => c === 0n), show(r.res));
  } else check('no pendings (pushed straight live)', true);
  for (const bp of BANDS) {
    check(`buy-sbtc-${bp} rests 200 USDCx on y`, (await liveY(BUY(bp))) === Y_PER, show(await liveY(BUY(bp))));
    check(`sell-sbtc-${bp} rests 0.002 sBTC on x`, (await liveX(SELL(bp))) === X_PER, show(await liveX(SELL(bp))));
  }
  const ask10 = await evalIn(C.market, `(token-x-limit-at '${SELL(10)} u${MID})`), bid10 = await evalIn(C.market, `(token-y-limit-at '${BUY(10)} u${MID})`);
  const ask50 = await evalIn(C.market, `(token-x-limit-at '${SELL(50)} u${MID})`), bid50 = await evalIn(C.market, `(token-y-limit-at '${BUY(50)} u${MID})`);
  console.log(`  asks: sell-0 ${ask10} sell-50 ${ask50}; bids: buy-0 ${bid10} buy-50 ${bid50}; mid ${MID}`);
  check('guarded pegs still quote at mid +/- 10 bps (DIA within 5% of Lazer)', ask10 === MID * (BPS + 10n) / BPS && bid10 === MID * (BPS - 10n) / BPS, `${ask10} ${bid10}`);
  check('ask(sell-sbtc-50) = mid + 50 bps, bid(buy-sbtc-50) = mid - 50 bps', ask50 === MID * (BPS + 50n) / BPS && bid50 === MID * (BPS - 50n) / BPS, `${ask50} ${bid50}`);

  group('router takers fill the rungs');
  must('fund taker sBTC', (await call(WHALE.x, SBTC, 'transfer', [uintCV(1_000_000n), P_(WHALE.x), P_(TAKER), noneCV()])).res?.ok === true);
  must('fund taker USDCx', (await call(USDC_WHALE, USDCX, 'transfer', [uintCV(1_000_000_000n), P_(USDC_WHALE), P_(TAKER), noneCV()])).res?.ok === true);
  // buy sBTC with USDCx: sized to take sell-sbtc-10 fully and part of -10
  await fresh();
  const usIn = X_PER * U.mid / SCALE * 15n / 10n;
  const t0 = await bals(TAKER);
  const r1 = await tx(`smart-swap-usdcx-for-sbtc ${usIn} uUSDCx, limit mid+100bps`, TAKER, C.router, 'smart-swap-usdcx-for-sbtc', [uintCV(usIn), uintCV(U.mid * (BPS + 100n) / BPS), someCV(upd()), uintCV(U.mid), uintCV(1)], (v) => v?.ok !== undefined);
  const t1 = await bals(TAKER);
  console.log(`  taker paid ${t0.us - t1.us} got ${t1.sb - t0.sb} sats; ${show(r1.res?.ok)}`);
  check('taker got sBTC, paid USDCx', t1.sb > t0.sb && t1.us < t0.us);
  const sx10 = await liveX(SELL(10));
  check('guarded sell-sbtc-10 ask filled by a taker at mid', sx10 < X_PER, `${X_PER} -> ${sx10}`);
  // sell sBTC for USDCx: sized to take buy-sbtc-10 fully and part of -10
  await fresh();
  const sbIn = Y_PER * SCALE / U.mid * 15n / 10n;
  const t2 = await bals(TAKER);
  const r2 = await tx(`smart-swap-sbtc-for-usdcx ${sbIn} sats, limit mid-100bps`, TAKER, C.router, 'smart-swap-sbtc-for-usdcx', [uintCV(sbIn), uintCV(U.mid * (BPS - 100n) / BPS), someCV(upd()), uintCV(U.mid), uintCV(1)], (v) => v?.ok !== undefined);
  const t3 = await bals(TAKER);
  console.log(`  taker sold ${t2.sb - t3.sb} sats got ${t3.us - t2.us} uUSDCx; ${show(r2.res?.ok)}`);
  check('taker got USDCx, paid sBTC', t3.us > t2.us && t3.sb < t2.sb);
  const by10 = await liveY(BUY(10));
  check('guarded buy-sbtc-10 bid filled by a taker at mid', by10 < Y_PER, `${Y_PER} -> ${by10}`);
  check('router holds nothing', show(await bals(C.router)) === show({ sb: 0n, us: 0n }), show(await bals(C.router)));

  group('dispatch claim + withdraw');
  const pS = await evalIn(SELL(10), `(get-position '${WHALE.x})`), pB = await evalIn(BUY(10), `(get-position '${USDC_WHALE})`);
  console.log(`  sell-sbtc-10 position ${show(pS)}\n  buy-sbtc-10 position ${show(pB)}`);
  let soldX = 0n, spentY = 0n;
  for (const bp of BANDS) { soldX += X_PER - (await liveX(SELL(bp))); spentY += Y_PER - (await liveY(BUY(bp))); }
  const xs0 = await bals(WHALE.x);
  await tx('claim-sell [sell-sbtc-*] (sBTC maker gets USDCx)', WHALE.x, C.dispatch, 'claim-sell', [listCV(BANDS.map((bp) => P_(SELL(bp))))], (v) => v?.ok !== undefined);
  const xs1 = await bals(WHALE.x);
  const gotUs = xs1.us - xs0.us;
  console.log(`  sBTC maker claimed ${gotUs} uUSDCx (${Number(gotUs) / 1e6} USDCx), sBTC delta ${xs1.sb - xs0.sb}`);
  check('claim paid USDCx (6 dp) at ~mid for the sats sold from sell-sbtc-10 (+ others)', gotUs > 0n && xs1.sb === xs0.sb, `${gotUs}`);
  const pSell = gotUs * SCALE / soldX;
  console.log(`  sell rungs sold ${soldX} sats for ${gotUs} uUSDCx -> ${Number(pSell) / 1e8} $/BTC (${Number((pSell - MID) * BPS / MID)} bps vs mid)`);
  check('sell-sbtc makers paid above mid (asks at mid + spread), within 1%', pSell >= MID && pSell < MID * 101n / 100n, `${pSell} vs ${MID}`);
  const ys0 = await bals(USDC_WHALE);
  await tx('claim-buy [buy-sbtc-*] (USDCx maker gets sBTC)', USDC_WHALE, C.dispatch, 'claim-buy', [listCV(BANDS.map((bp) => P_(BUY(bp))))], (v) => v?.ok !== undefined);
  const ys1 = await bals(USDC_WHALE);
  console.log(`  USDCx maker claimed ${ys1.sb - ys0.sb} sats, USDCx delta ${ys1.us - ys0.us}`);
  check('claim paid sBTC (8 dp); USDCx moved only as the sold-out remainder', ys1.sb > ys0.sb && ys1.us - ys0.us < 10_000n, `sbtc +${ys1.sb - ys0.sb}, usdcx +${ys1.us - ys0.us}`);
  const gotSb = ys1.sb - ys0.sb;
  const pBuy = (spentY - (ys1.us - ys0.us)) * SCALE / gotSb;
  console.log(`  buy rungs spent ${spentY - (ys1.us - ys0.us)} uUSDCx for ${gotSb} sats -> ${Number(pBuy) / 1e8} $/BTC (${Number((pBuy - MID) * BPS / MID)} bps vs mid)`);
  check('buy-sbtc makers paid below mid (bids at mid - spread), within 1%', pBuy <= MID && pBuy > MID * 99n / 100n, `${pBuy} vs ${MID}`);
  await fresh();
  const left = await evalIn(BUY(50), `(get-position '${USDC_WHALE})`);
  console.log(`  buy-sbtc-50 position before withdraw ${show(left)}`);
  const yw1 = await bal(USDCX, USDC_WHALE);
  await tx('withdraw-buy 50 USDCx from buy-sbtc-50', USDC_WHALE, C.dispatch, 'withdraw-buy', [alloc([BUY(50)], 50_000_000n), someCV(upd())], (v) => v?.ok !== undefined);
  check('withdraw returned 50.000000 USDCx', (await bal(USDCX, USDC_WHALE)) - yw1 === 50_000_000n, `${(await bal(USDCX, USDC_WHALE)) - yw1}`);
  const xw1 = await bal(SBTC, WHALE.x);
  await tx('withdraw-sell 0.0005 sBTC from sell-sbtc-50', WHALE.x, C.dispatch, 'withdraw-sell', [alloc([SELL(50)], 50_000n), someCV(upd())], (v) => v?.ok !== undefined);
  check('withdraw returned 50,000 sats', (await bal(SBTC, WHALE.x)) - xw1 === 50_000n, `${(await bal(SBTC, WHALE.x)) - xw1}`);
  check('router still holds nothing', show(await bals(C.router)) === show({ sb: 0n, us: 0n }));
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(String(e?.message ?? e)); }
}
summary();
