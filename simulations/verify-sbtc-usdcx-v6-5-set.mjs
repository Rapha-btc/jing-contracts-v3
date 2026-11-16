// stxer mainnet-fork proof: the sbtc-usdcx v6-5 redeploy set from repo source,
// deployed by the Jing deployer (names free on mainnet) on the LIVE
// jing-core-v6 (owner = multisig), jing-ladder-sbtc-usdcx-v1 and
// jing-ladder-dispatch-sbtc-usdcx:
//   markets-sbtc-usdcx-jing-v6-5 (feeds 1/7) -> jing-buy-sbtc-bps-v2 /
//   jing-sell-sbtc-bps-v2 as jing-{buy,sell}-sbtc-<bps>-v2 (blessed canonical,
//   seated on the live band spreads, replacing the live holders)
//   -> jing-settle-batch-sbtc-usdcx-v2 -> swap-router-sbtc-usdcx-jing-v5-6.
// Groups:
//   setters  staleness defaults 40/80, u1008, u1034 bounds, in-bounds sets
//   U        drop-x / drop-y on literal lists (Eval in the market context)
//   DX / DY  read-cut removal paths on real lists of standard + rung makers
//            (bands 30, 40): absent no-op, first, middle, last, only, rung full
//            withdraw, full fill by a router taker, swapper append+drop
//   suite    the verify-sbtc-usdcx-suite flow on bands 10/20/50: ladder side
//            mapping, DIA guard, dispatch deposits, settle-many, pegs, router
//            takers both ways, claims, withdraws, router holds nothing
//   stale    fork pinned 45..70 s after a signed [1,7] print: settle-with-refresh
//            u1003, swap ok under 80, rebate getter = 20 + age - 30,
//            max-staleness 40 -> stale, fresh ok, back to 80 ok
//   F-01     band 60: sell rung (USDCx proceeds, burned through the USDCx
//            governance -> mint-role path) and buy rung (sBTC proceeds, burned
//            through the sBTC signer -> registry protocol-role path): deficit,
//            u7017 on deposit, first-come min(owed + debt, cash), per-member
//            debt, inputs returned, refill -> debts claimed, rung reopens
// Keyless: Lazer [1,7] from the faktory-dao route (pair=sbtc-usdcx).
// Run: node simulations/verify-sbtc-usdcx-v6-5-set.mjs
import { readFileSync } from 'node:fs';
import { uintCV, noneCV, someCV, boolCV, bufferCV, stringAsciiCV, tupleCV, listCV } from '@stacks/transactions';
import { SimulationBuilder } from 'stxer';
import { lazerFeedTimes } from './_lazer.js';
import { NODE, DEP, SBTC, WHALE, P_, mk, S, retry, sleep, check, must, show, tx, evalIn, call, deploy, summary, Stop, note } from './_yg-loop-common.js';
import { strip } from './_sim-deployer.mjs';

const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const USDC_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ';
const N = { market: 'markets-sbtc-usdcx-jing-v6-5', batch: 'jing-settle-batch-sbtc-usdcx-v2', router: 'swap-router-sbtc-usdcx-jing-v5-6' };
const C = Object.fromEntries(Object.entries(N).map(([k, v]) => [k, `${DEP}.${v}`]));
const CORE = `${DEP}.jing-core-v6`, LADDER = `${DEP}.jing-ladder-sbtc-usdcx-v1`, DISPATCH = `${DEP}.jing-ladder-dispatch-sbtc-usdcx`;
const LIVE_MKT = `${DEP}.markets-sbtc-usdcx-jing-v6-4`;
const SUITE = [10, 20, 50], DROP = [30, 40], F01 = 60;
const ALL = [...SUITE, ...DROP, F01];
const BUY = (b) => `${DEP}.jing-buy-sbtc-${b}-v2`, SELL = (b) => `${DEP}.jing-sell-sbtc-${b}-v2`;
const src = (f) => strip(readFileSync(new URL(`../contracts/sbtc-usdcx/${f}.clar`, import.meta.url), 'utf8'));
const TX = P_(SBTC), TY = P_(USDCX), AX = stringAsciiCV('sbtc-token'), AY = stringAsciiCV('usdcx-token');
const SCALE = 10_000_000_000n, BPS = 10_000n;
const XW = WHALE.x, YW = USDC_WHALE, TAKER = mk(5), OUTSIDER = mk(6), BURNER = mk(7), NEWCOMER = mk(8);
const SX = [mk(11), mk(12), mk(13)], SY = [mk(21), mk(22), mk(23)];
const FX = [mk(61), mk(62), mk(63)], FY = [mk(71), mk(72), mk(73)];
const X_PER = 200_000n, Y_PER = 200_000_000n;       // suite rungs: 0.002 sBTC / 200 USDCx
const X_STD = 100_000n, Y_STD = 100_000_000n;       // std makers: 0.001 sBTC / 100 USDCx
const AGE_MIN = 45, AGE_MAX = 70;

const hexCV = (h) => bufferCV(Buffer.from(h.replace(/^0x/, ''), 'hex'));
async function fetchUsdcx() {
  const r = await fetch('https://faktory-dao-backend.vercel.app/api/auction/pyth-lazer-update?pair=sbtc-usdcx', { headers: { 'x-api-key': process.env.FAKTORY_API_KEY || 'jc_e4d2e10396eef95215a7afd492f42d743a3325739d29200c2a28b256f778be01' } });
  if (!r.ok) throw new Error(`backend lazer ${r.status}`);
  const d = (await r.json()).data;
  if (String(d.feedIds) !== '1,7') throw new Error(`feeds ${d.feedIds}`);
  return { hex: d.hex.replace(/^0x/, ''), px: BigInt(d.priceX), py: BigInt(d.priceY) };
}
const tip = async () => { const t = (await (await fetch(`${NODE}/extended/v2/blocks?limit=1`)).json()).results[0]; return { h: t.height, T: t.block_time }; };
const bt = async () => Number(await evalIn(C.market, 'stacks-block-time'));
let U = null;
async function fresh() {
  const b = await bt();
  for (let i = 0; i < 40; i++) {
    const u = await retry(fetchUsdcx); const t = await retry(() => lazerFeedTimes(u.hex, [1, 7]));
    if (t.at > b) { U = { ...u, at: t.at, mid: u.px * 100000000n / u.py }; return U; }
    await sleep(3000);
  }
  throw new Error('no fresh [1,7] update');
}
const upd = () => hexCV(U.hex);
const bal = async (tok, who) => (await evalIn(tok, `(get-balance '${who})`)).ok;
const bals = async (who) => ({ sb: await bal(SBTC, who), us: await bal(USDCX, who) });
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };
const cyc = async () => evalIn(C.market, '(get-current-cycle)');
const listX = async (c) => evalIn(C.market, `(get-token-x-depositors u${c ?? await cyc()})`);
const listY = async (c) => evalIn(C.market, `(get-token-y-depositors u${c ?? await cyc()})`);
const liveX = async (who) => evalIn(C.market, `(get-token-x-deposit u${await cyc()} '${who})`);
const liveY = async (who) => evalIn(C.market, `(get-token-y-deposit u${await cyc()} '${who})`);
const pendX = async (who) => evalIn(C.market, `(get-token-x-pending-deposit '${who})`);
const pendY = async (who) => evalIn(C.market, `(get-token-y-pending-deposit '${who})`);
const alloc = (rungs, amt) => listCV(rungs.map((r) => tupleCV({ rung: P_(r), amount: uintCV(amt) })));
const req = (who, x) => tupleCV({ who: P_(who), x: boolCV(x), kind: uintCV(0) });
const isOk = (v) => v?.ok !== undefined;
const errIs = (...codes) => (v) => codes.some((c) => v?.err === BigInt(c));
const short = (p) => p.includes('.') ? p.split('.')[1] : p.slice(0, 8);
const fmt = (l) => `[${l.map(short).join(', ')}]`;
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const clList = (l) => (l.length ? `(list ${l.map((p) => `'${p}`).join(' ')})` : '(list)');
async function expectList(label, side, want) {
  const got = side === 'x' ? await listX() : await listY();
  return check(`${label}: ${side} list = ${fmt(want)}`, same(got, want), `got ${fmt(got)}`);
}
async function settleIfPending(who, x) {
  if (await (x ? pendX(who) : pendY(who))) {
    await fresh();
    await tx(`settle pending ${short(who)}`, DEP, C.market, x ? 'settle-token-x-deposit' : 'settle-token-y-deposit', [P_(who), upd(), x ? TX : TY, x ? AX : AY], isOk);
  }
}
const sendSbtc = async (from, to, amt) => must(`fund ${short(to)} ${amt} sats`, (await call(from, SBTC, 'transfer', [uintCV(amt), P_(from), P_(to), noneCV()])).res?.ok === true);
const sendUsd = async (from, to, amt) => must(`fund ${short(to)} ${amt} uUSDCx`, (await call(from, USDCX, 'transfer', [uintCV(amt), P_(from), P_(to), noneCV()])).res?.ok === true);

try {
  // ---- pin the fork 45..70 s after a signed [1,7] print ----
  let AGED, pin;
  for (let attempt = 0; attempt < 5 && !pin; attempt++) {
    const u = await retry(fetchUsdcx); const t = await retry(() => lazerFeedTimes(u.hex, [1, 7]));
    AGED = { ...u, at: t.at };
    for (;;) {
      const p = await retry(tip);
      if (p.T - AGED.at >= AGE_MIN) { if (p.T - AGED.at <= AGE_MAX) pin = p; break; }
      await sleep(2000);
    }
  }
  if (!pin) throw new Error('could not pin a block 45..70 s after a print');
  console.log(`pin block ${pin.h} time ${pin.T}; P_aged at ${AGED.at} (age ${pin.T - AGED.at} s)`);
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
  await tx('market initialize(sbtc, usdcx, live mins, 1, 7)', CORE_OWNER, C.market, 'initialize', [P_(C.market), TX, TY, uintCV(mins['min-token-x']), uintCV(mins['min-token-y']), uintCV(1), uintCV(7)], { ok: true });
  await tx('market set-operator -> DEP', CORE_OWNER, C.market, 'set-operator', [P_(DEP)], { ok: true });
  const buySrc = src('jing-buy-sbtc-bps-v2'), sellSrc = src('jing-sell-sbtc-bps-v2');
  for (const bp of ALL) { await deploy(DEP, `jing-buy-sbtc-${bp}-v2`, buySrc); await deploy(DEP, `jing-sell-sbtc-${bp}-v2`, sellSrc); }
  await tx('ladder set-canonical buy-band = jing-buy-sbtc-10-v2', LADDER_OWNER, LADDER, 'set-canonical', [stringAsciiCV('buy-band'), P_(BUY(10))], { ok: true });
  await tx('ladder set-canonical sel-band = jing-sell-sbtc-10-v2', LADDER_OWNER, LADDER, 'set-canonical', [stringAsciiCV('sel-band'), P_(SELL(10))], { ok: true });
  await tx('initialize jing-buy-sbtc-20-v2 with bps 50 -> u7009 bad name', LADDER_OWNER, BUY(20), 'initialize', [uintCV(50), boolCV(true)], { err: 7009n });
  await tx('initialize jing-buy-sbtc-20-v2 by non-owner -> u7001', OUTSIDER, BUY(20), 'initialize', [uintCV(20), boolCV(true)], { err: 7001n });
  for (const bp of ALL) {
    await tx(`initialize jing-buy-sbtc-${bp}-v2 (seat, replaces live holder)`, LADDER_OWNER, BUY(bp), 'initialize', [uintCV(bp), boolCV(true)], { ok: true });
    await tx(`initialize jing-sell-sbtc-${bp}-v2 (seat, replaces live holder)`, LADDER_OWNER, SELL(bp), 'initialize', [uintCV(bp), boolCV(true)], { ok: true });
  }
  await deploy(DEP, N.batch, src(N.batch));
  await deploy(DEP, N.router, src(N.router));
  for (const a of [...SX, ...FX]) await sendSbtc(XW, a, 300_000n);
  for (const a of [...SY, ...FY]) await sendUsd(YW, a, 300_000_000n);
  await sendSbtc(XW, TAKER, 2_000_000n); await sendUsd(YW, TAKER, 3_000_000_000n);
  await sendSbtc(XW, NEWCOMER, 200_000n); await sendUsd(YW, NEWCOMER, 300_000_000n);

  group('staleness setters');
  const vars = async () => evalIn(C.market, '{ s: (var-get settle-max-staleness), m: (var-get max-staleness) }');
  { const v = await vars(); check('defaults: settle-max-staleness 40, max-staleness 80', v.s === 40n && v.m === 80n, show(v)); }
  await tx('set-settle-max-staleness 30 by non-operator -> u1008', OUTSIDER, C.market, 'set-settle-max-staleness', [uintCV(30)], { err: 1008n });
  await tx('set-max-staleness 60 by non-operator -> u1008', OUTSIDER, C.market, 'set-max-staleness', [uintCV(60)], { err: 1008n });
  for (const s of [19, 41]) await tx(`set-settle-max-staleness ${s} -> u1034`, DEP, C.market, 'set-settle-max-staleness', [uintCV(s)], { err: 1034n });
  for (const s of [39, 81]) await tx(`set-max-staleness ${s} -> u1034`, DEP, C.market, 'set-max-staleness', [uintCV(s)], { err: 1034n });
  for (const s of [20, 40]) { await tx(`set-settle-max-staleness ${s} -> ok`, DEP, C.market, 'set-settle-max-staleness', [uintCV(s)], { ok: true }); check(`settle-max-staleness reads ${s}`, (await vars()).s === BigInt(s)); }
  for (const s of [40, 80]) { await tx(`set-max-staleness ${s} -> ok`, DEP, C.market, 'set-max-staleness', [uintCV(s)], { ok: true }); check(`max-staleness reads ${s}`, (await vars()).m === BigInt(s)); }

  group('U drop-x / drop-y on literal lists');
  {
    const A = SX[0], Bp = SELL(30), Cc = SX[1], Dd = BUY(40), E = SX[2], Z = OUTSIDER;
    const L5 = [A, Bp, Cc, Dd, E];
    const cases = [
      ['first', L5, A, [Bp, Cc, Dd, E]], ['middle (contract)', L5, Bp, [A, Cc, Dd, E]], ['middle', L5, Cc, [A, Bp, Dd, E]],
      ['last', L5, E, [A, Bp, Cc, Dd]], ['only entry', [A], A, []], ['only entry (contract)', [Bp], Bp, []],
      ['absent -> unchanged', L5, Z, L5], ['empty list', [], A, []],
    ];
    const L50 = Array.from({ length: 50 }, (_, i) => (i % 5 === 4 ? `${mk(100 + i)}.m${i}` : mk(100 + i)));
    for (const fn of ['drop-x', 'drop-y']) {
      for (const [tag, l, who, want] of cases) { const got = await evalIn(C.market, `(${fn} ${clList(l)} '${who})`); check(`${fn} ${tag}`, same(got, want), `got ${fmt(got)}`); }
      for (const [tag, who, want] of [['50: first', L50[0], L50.slice(1)], ['50: last', L50[49], L50.slice(0, 49)], ['50: middle', L50[25], [...L50.slice(0, 25), ...L50.slice(26)]], ['50: absent', Z, L50]]) {
        const got = await evalIn(C.market, `(${fn} ${clList(L50)} '${who})`); check(`${fn} ${tag}`, same(got, want), `len ${got.length}`);
      }
    }
  }

  group('DX ask side removals [SX1, SELL30, SX2, SELL40, SX3]');
  await fresh();
  const MID = U.mid;
  console.log(`  mid ${MID} ($${Number(MID) / 1e8})`);
  {
    const xDep = async (i) => { await tx(`${short(SX[i])} deposit-token-x 0.001 sBTC, ask mid+${2 + i}%`, SX[i], C.market, 'deposit-token-x', [uintCV(X_STD), uintCV(MID * (102n + BigInt(i)) / 100n), noneCV(), TX, AX], isOk); await settleIfPending(SX[i], true); };
    const xPush = async (bp) => { await tx(`dispatch deposit-sell 0.002 sBTC into sell-sbtc-${bp}-v2`, XW, DISPATCH, 'deposit-sell', [uintCV(X_PER), alloc([SELL(bp)], X_PER)], isOk); await settleIfPending(SELL(bp), true); };
    await xDep(0); await xPush(30); await xDep(1); await xPush(40); await xDep(2);
    await expectList('built', 'x', [SX[0], SELL(30), SX[1], SELL(40), SX[2]]);
    await tx('cancel-token-x-deposit by a non-depositor -> u1005', OUTSIDER, C.market, 'cancel-token-x-deposit', [TX, AX], { err: 1005n });
    await expectList('absent cancel is a no-op', 'x', [SX[0], SELL(30), SX[1], SELL(40), SX[2]]);
    await tx('SX1 cancel (first)', SX[0], C.market, 'cancel-token-x-deposit', [TX, AX], isOk);
    await expectList('first removed', 'x', [SELL(30), SX[1], SELL(40), SX[2]]);
    await tx('SX2 cancel (middle)', SX[1], C.market, 'cancel-token-x-deposit', [TX, AX], isOk);
    await expectList('middle removed', 'x', [SELL(30), SELL(40), SX[2]]);
    await fresh();
    const s0 = await bal(SBTC, XW);
    await tx('dispatch withdraw-sell all 0.002 sBTC from sell-sbtc-40-v2 (rung -> market cancel)', XW, DISPATCH, 'withdraw-sell', [alloc([SELL(40)], X_PER), someCV(upd())], isOk);
    check('XW got 0.002 sBTC back', (await bal(SBTC, XW)) - s0 === X_PER, `${(await bal(SBTC, XW)) - s0}`);
    await expectList('rung removed by full withdraw (middle)', 'x', [SELL(30), SX[2]]);
    await fresh();
    const ask30 = await evalIn(C.market, `(token-x-limit-at '${SELL(30)} u${U.mid})`);
    const usIn = X_PER * ask30 / SCALE * 2n;
    const r = await tx(`router smart-swap-usdcx-for-sbtc ${usIn}, limit ask30 + 40 bps (fills SELL30 only, next ask mid+4%)`, TAKER, C.router, 'smart-swap-usdcx-for-sbtc', [uintCV(usIn), uintCV(ask30 * (BPS + 40n) / BPS), someCV(upd()), uintCV(U.mid), uintCV(1)], isOk);
    console.log(`  ${show(r.res?.ok)}`);
    check('SELL30 fully filled', (await liveX(SELL(30))) === 0n, show(await liveX(SELL(30))));
    await expectList('first (rung) removed by a full fill', 'x', [SX[2]]);
    await fresh();
    const ask3 = await evalIn(C.market, `(token-x-limit-at '${SX[2]} u${U.mid})`);
    const u3 = await bal(USDCX, SX[2]);
    await tx('market swap 20 USDCx -> partial fill of the survivor SX3', TAKER, C.market, 'swap', [uintCV(20_000_000n), uintCV(ask3 * 101n / 100n), upd(), TX, AX, TY, AY, boolCV(false)], isOk);
    check('SX3 got paid USDCx and kept its entry', (await bal(USDCX, SX[2])) > u3 && (await liveX(SX[2])) < X_STD, `${(await bal(USDCX, SX[2])) - u3}`);
    await expectList('partial fill keeps the entry', 'x', [SX[2]]);
    await tx('SX3 cancel (only entry)', SX[2], C.market, 'cancel-token-x-deposit', [TX, AX], isOk);
    await expectList('only entry removed', 'x', []);
    const c0 = await bal(USDCX, XW);
    await tx('claim-sell [sell-sbtc-30-v2] after its full fill', XW, DISPATCH, 'claim-sell', [listCV([P_(SELL(30))])], isOk);
    check('XW claimed USDCx for the filled rung', (await bal(USDCX, XW)) > c0, `${(await bal(USDCX, XW)) - c0}`);
  }

  group('DY bid side removals [BUY30, SY1, BUY40, SY2, SY3]');
  {
    const yDep = async (i) => { await tx(`${short(SY[i])} deposit-token-y 100 USDCx, bid mid-${2 + i}%`, SY[i], C.market, 'deposit-token-y', [uintCV(Y_STD), uintCV(MID * (98n - BigInt(i)) / 100n), noneCV(), TY, AY], isOk); await settleIfPending(SY[i], false); };
    const yPush = async (bp) => { await tx(`dispatch deposit-buy 200 USDCx into buy-sbtc-${bp}-v2`, YW, DISPATCH, 'deposit-buy', [uintCV(Y_PER), alloc([BUY(bp)], Y_PER)], isOk); await settleIfPending(BUY(bp), false); };
    await yPush(30); await yDep(0); await yPush(40); await yDep(1); await yDep(2);
    const L = [BUY(30), SY[0], BUY(40), SY[1], SY[2]];
    await expectList('built', 'y', L);
    await tx('cancel-token-y-deposit by a non-depositor -> u1005', OUTSIDER, C.market, 'cancel-token-y-deposit', [TY, AY], { err: 1005n });
    await expectList('absent cancel is a no-op', 'y', L);
    // a taker swap (USDCx in = y) is appended as a y depositor and dropped again
    await tx('SX1 re-deposits an ask at mid+2%', SX[0], C.market, 'deposit-token-x', [uintCV(X_STD), uintCV(MID * 102n / 100n), noneCV(), TX, AX], isOk);
    await settleIfPending(SX[0], true);
    await fresh();
    const askS = await evalIn(C.market, `(token-x-limit-at '${SX[0]} u${U.mid})`);
    const c0 = await cyc();
    await tx('market swap 20 USDCx (taker as y: appended, settled, remainder dropped)', TAKER, C.market, 'swap', [uintCV(20_000_000n), uintCV(askS * 101n / 100n), upd(), TX, AX, TY, AY, boolCV(false)], isOk);
    await expectList('swapper not left in the live list; rolled makers in the same order', 'y', L);
    const c1 = await cyc();
    if (c1 > c0) check(`settled cycle ${c0}: resting makers dropped head by head, only the filled taker stays`, same(await listY(c0), [TAKER]) && same(await listX(c0), []), `y ${fmt(await listY(c0))} x ${fmt(await listX(c0))}`);
    await tx('SX1 cancel (clears the ask side again)', SX[0], C.market, 'cancel-token-x-deposit', [TX, AX], isOk);
    await fresh();
    const bid30 = await evalIn(C.market, `(token-y-limit-at '${BUY(30)} u${U.mid})`);
    const sbIn = Y_PER * SCALE / bid30 * 2n;
    const r = await tx(`router smart-swap-sbtc-for-usdcx ${sbIn} sats, limit bid30 / 1.0031 (fills BUY30 only)`, TAKER, C.router, 'smart-swap-sbtc-for-usdcx', [uintCV(sbIn), uintCV(bid30 * BPS / (BPS + 31n)), someCV(upd()), uintCV(U.mid), uintCV(1)], isOk);
    console.log(`  ${show(r.res?.ok)}`);
    check('BUY30 fully filled', (await liveY(BUY(30))) === 0n, show(await liveY(BUY(30))));
    await expectList('first (rung) removed by a full fill', 'y', [SY[0], BUY(40), SY[1], SY[2]]);
    await tx('SY3 cancel (last)', SY[2], C.market, 'cancel-token-y-deposit', [TY, AY], isOk);
    await expectList('last removed', 'y', [SY[0], BUY(40), SY[1]]);
    await fresh();
    const u0 = await bal(USDCX, YW);
    await tx('dispatch withdraw-buy all 200 USDCx from buy-sbtc-40-v2', YW, DISPATCH, 'withdraw-buy', [alloc([BUY(40)], Y_PER), someCV(upd())], isOk);
    check('YW got 200 USDCx back', (await bal(USDCX, YW)) - u0 === Y_PER, `${(await bal(USDCX, YW)) - u0}`);
    await expectList('middle rung removed by full withdraw', 'y', [SY[0], SY[1]]);
    await fresh();
    const bid1 = await evalIn(C.market, `(token-y-limit-at '${SY[0]} u${U.mid})`);
    const sb1 = await bal(SBTC, SY[0]);
    await tx('market swap 10,000 sats -> partial fill of survivor SY1', TAKER, C.market, 'swap', [uintCV(10_000n), uintCV(bid1 * 99n / 100n), upd(), TX, AX, TY, AY, boolCV(true)], isOk);
    check('SY1 got paid sBTC', (await bal(SBTC, SY[0])) > sb1, `${(await bal(SBTC, SY[0])) - sb1}`);
    await expectList('partial fill keeps both', 'y', [SY[0], SY[1]]);
    const s0 = await bal(SBTC, YW);
    await tx('claim-buy [buy-sbtc-30-v2] after its full fill', YW, DISPATCH, 'claim-buy', [listCV([P_(BUY(30))])], isOk);
    check('YW claimed sBTC for the filled rung', (await bal(SBTC, YW)) > s0, `${(await bal(SBTC, YW)) - s0}`);
    await tx('SY1 cancel (first of two)', SY[0], C.market, 'cancel-token-y-deposit', [TY, AY], isOk);
    await expectList('first of two removed', 'y', [SY[1]]);
    await tx('SY2 cancel (only entry)', SY[1], C.market, 'cancel-token-y-deposit', [TY, AY], isOk);
    await expectList('only entry removed', 'y', []);
  }

  group('suite: ladder mapping + DIA guard');
  for (const bp of SUITE) {
    const sx = await evalIn(C.market, `(is-protected-x '${SELL(bp)})`), by = await evalIn(C.market, `(is-protected-y '${BUY(bp)})`);
    const cx = await evalIn(C.market, `(is-protected-y '${SELL(bp)})`), cy = await evalIn(C.market, `(is-protected-x '${BUY(bp)})`);
    check(`market seats sell-sbtc-${bp}-v2 on x, buy-sbtc-${bp}-v2 on y`, sx === true && by === true && cx === false && cy === false, show({ sx, by, cx, cy }));
  }
  check('sell-sbtc-10-v2 registered sel-band', (await evalIn(LADDER, `(get-registered '${SELL(10)})`))?.side === 'sel-band');
  const dia = await evalIn(BUY(10), '(miner-mid)');
  check('DIA BTC/USD live, $20k..$500k', dia > 2_000_000_000_000n && dia < 50_000_000_000_000n, dia);
  check('buy-sbtc current-cap = DIA * 12000 / 10000', (await evalIn(BUY(10), '(current-cap)')) === dia * 12000n / BPS);
  check('sell-sbtc current-floor = DIA * 8000 / 10000', (await evalIn(SELL(10), '(current-floor)')) === dia * 8000n / BPS);

  group('suite: dispatch deposits + settle-batch-v2');
  await tx('deposit-sell into a buy-sbtc rung -> u7104', XW, DISPATCH, 'deposit-sell', [uintCV(X_PER), alloc([BUY(10)], X_PER)], { err: 7104n });
  const yw0 = await bals(YW), xw0 = await bals(XW);
  await tx('deposit-buy 3 x 200 USDCx', YW, DISPATCH, 'deposit-buy', [uintCV(Y_PER * 3n), alloc(SUITE.map(BUY), Y_PER)], isOk);
  await tx('deposit-sell 3 x 0.002 sBTC', XW, DISPATCH, 'deposit-sell', [uintCV(X_PER * 3n), alloc(SUITE.map(SELL), X_PER)], isOk);
  check('600 USDCx left the buyer', yw0.us - (await bal(USDCX, YW)) === Y_PER * 3n);
  check('0.006 sBTC left the seller', xw0.sb - (await bal(SBTC, XW)) === X_PER * 3n);
  const pend = [];
  for (const bp of SUITE) { if (await pendY(BUY(bp))) pend.push(req(BUY(bp), false)); if (await pendX(SELL(bp))) pend.push(req(SELL(bp), true)); }
  note(`pendings after push: ${pend.length}`);
  await tx('settle-many [] -> u7201', OUTSIDER, C.batch, 'settle-many', [hexCV(AGED.hex), listCV([])], { err: 7201n });
  await fresh();
  if (pend.length) {
    await tx('settle-many never-pending only -> u7203', OUTSIDER, C.batch, 'settle-many', [upd(), listCV([req(OUTSIDER, true)])], { err: 7203n });
    const r = await tx(`settle-many ${pend.length} pendings`, OUTSIDER, C.batch, 'settle-many', [upd(), listCV(pend)], (v) => v?.ok?.settled === BigInt(pend.length));
    check('all codes u0', r.res?.ok?.codes?.every((c) => c === 0n), show(r.res));
  }
  for (const bp of SUITE) {
    check(`buy-sbtc-${bp}-v2 rests 200 USDCx on y`, (await liveY(BUY(bp))) === Y_PER, show(await liveY(BUY(bp))));
    check(`sell-sbtc-${bp}-v2 rests 0.002 sBTC on x`, (await liveX(SELL(bp))) === X_PER, show(await liveX(SELL(bp))));
  }
  {
    const a10 = await evalIn(C.market, `(token-x-limit-at '${SELL(10)} u${MID})`), b10 = await evalIn(C.market, `(token-y-limit-at '${BUY(10)} u${MID})`);
    const a50 = await evalIn(C.market, `(token-x-limit-at '${SELL(50)} u${MID})`), b50 = await evalIn(C.market, `(token-y-limit-at '${BUY(50)} u${MID})`);
    check('pegs at mid +/- 10 bps', a10 === MID * (BPS + 10n) / BPS && b10 === MID * (BPS - 10n) / BPS, `${a10} ${b10}`);
    check('pegs at mid +/- 50 bps', a50 === MID * (BPS + 50n) / BPS && b50 === MID * (BPS - 50n) / BPS, `${a50} ${b50}`);
  }

  group('stale: prints on the pinned fork');
  {
    const T0 = await bt(); const age = T0 - AGED.at;
    console.log(`  block time ${T0}, P_aged at ${AGED.at}: age ${age} s`);
    must(`P_aged age ${age} s in (40, 80)`, age > 40 && age < 80);
    await fresh();
    check('get-taker-rebate-bps-for(fresh) = 20', (await evalIn(C.market, `(get-taker-rebate-bps-for 0x${U.hex})`)) === 20n);
    const rbA = await evalIn(C.market, `(get-taker-rebate-bps-for 0x${AGED.hex})`);
    check(`get-taker-rebate-bps-for(P_aged) = ${20 + age - 30}`, rbA === BigInt(20 + age - 30), rbA);
    await tx('settle-with-refresh(P_aged) -> u1003', OUTSIDER, C.market, 'settle-with-refresh', [hexCV(AGED.hex), TX, AX, TY, AY], { err: 1003n });
    const sw = (h) => [uintCV(10_000_000n), uintCV(MID * 10100n / BPS), hexCV(h), TX, AX, TY, AY, boolCV(false)];
    const t0 = await bals(TAKER);
    await tx('swap(P_aged) 10 USDCx -> sBTC under 80 s -> ok', TAKER, C.market, 'swap', sw(AGED.hex), isOk);
    check('aged swap filled', (await bal(SBTC, TAKER)) > t0.sb);
    await tx('set-max-staleness 40', DEP, C.market, 'set-max-staleness', [uintCV(40)], { ok: true });
    const r = await tx('swap(P_aged) at max-staleness 40 -> stale', TAKER, C.market, 'swap', sw(AGED.hex), errIs(1002, 1003));
    note(`aged swap at cap 40: ${show(r.res)}`);
    await fresh();
    await tx('swap(fresh) at max-staleness 40 -> ok', TAKER, C.market, 'swap', sw(U.hex), isOk);
    await tx('set-max-staleness 80', DEP, C.market, 'set-max-staleness', [uintCV(80)], { ok: true });
    await tx('swap(P_aged) back at 80 -> ok', TAKER, C.market, 'swap', sw(AGED.hex), isOk);
  }

  group('suite: router v5-6 takers + claims + withdraws');
  {
    await fresh();
    const usIn = X_PER * U.mid / SCALE * 15n / 10n;
    const t0 = await bals(TAKER);
    const r1 = await tx(`smart-swap-usdcx-for-sbtc ${usIn}, limit mid+100bps`, TAKER, C.router, 'smart-swap-usdcx-for-sbtc', [uintCV(usIn), uintCV(U.mid * (BPS + 100n) / BPS), someCV(upd()), uintCV(U.mid), uintCV(1)], isOk);
    const t1 = await bals(TAKER);
    check('taker got sBTC via the book', t1.sb > t0.sb && (r1.res?.ok?.['jing-in'] ?? 0n) > 0n, show(r1.res?.ok));
    check('sell-sbtc-10-v2 ask filled', (await liveX(SELL(10))) < X_PER);
    await fresh();
    const sbIn = Y_PER * SCALE / U.mid * 15n / 10n;
    const r2 = await tx(`smart-swap-sbtc-for-usdcx ${sbIn}, limit mid-100bps`, TAKER, C.router, 'smart-swap-sbtc-for-usdcx', [uintCV(sbIn), uintCV(U.mid * (BPS - 100n) / BPS), someCV(upd()), uintCV(U.mid), uintCV(1)], isOk);
    check('taker got USDCx via the book', (r2.res?.ok?.['jing-in'] ?? 0n) > 0n, show(r2.res?.ok));
    check('buy-sbtc-10-v2 bid filled', (await liveY(BUY(10))) < Y_PER);
    check('router holds nothing', show(await bals(C.router)) === show({ sb: 0n, us: 0n }), show(await bals(C.router)));
    const xs0 = await bals(XW);
    await tx('claim-sell [sell-sbtc-*-v2]', XW, DISPATCH, 'claim-sell', [listCV(SUITE.map((bp) => P_(SELL(bp))))], isOk);
    check('sBTC maker claimed USDCx', (await bal(USDCX, XW)) > xs0.us);
    const ys0 = await bals(YW);
    await tx('claim-buy [buy-sbtc-*-v2]', YW, DISPATCH, 'claim-buy', [listCV(SUITE.map((bp) => P_(BUY(bp))))], isOk);
    check('USDCx maker claimed sBTC', (await bal(SBTC, YW)) > ys0.sb);
    await fresh();
    const yw1 = await bal(USDCX, YW);
    await tx('withdraw-buy 50 USDCx from buy-sbtc-50-v2', YW, DISPATCH, 'withdraw-buy', [alloc([BUY(50)], 50_000_000n), someCV(upd())], isOk);
    check('withdraw returned 50 USDCx', (await bal(USDCX, YW)) - yw1 === 50_000_000n);
    const xw1 = await bal(SBTC, XW);
    await tx('withdraw-sell 0.0005 sBTC from sell-sbtc-50-v2', XW, DISPATCH, 'withdraw-sell', [alloc([SELL(50)], 50_000n), someCV(upd())], isOk);
    check('withdraw returned 50,000 sats', (await bal(SBTC, XW)) - xw1 === 50_000n);
  }

  group('F-01 prep: clear the suite rungs, find the burn roles');
  await fresh();
  for (const bp of SUITE) {
    if ((await evalIn(SELL(bp), `(get-position '${XW})`)).shares > 0n) await tx(`XW full withdraw sell-sbtc-${bp}-v2`, XW, SELL(bp), 'withdraw', [uintCV(10n ** 12n), someCV(upd())], isOk);
    if ((await evalIn(BUY(bp), `(get-position '${YW})`)).shares > 0n) await tx(`YW full withdraw buy-sbtc-${bp}-v2`, YW, BUY(bp), 'withdraw', [uintCV(10n ** 15n), someCV(upd())], isOk);
  }
  check('book empty before F-01', (await listX()).length === 0 && (await listY()).length === 0, `x ${fmt(await listX())} y ${fmt(await listY())}`);
  // governance moved from the deployer to Circle's multisig SM1Z6... at block 5200132
  // (the deployer revoked its own 0x00 role at 5367982)
  let USDCX_GOV = null;
  for (const g of ['SM1Z6BP8PDKYKXTZXXSKXFEY6NQ7RAM7DAEAYR045', USDCX.split('.')[0]]) if (isOk(await evalIn(USDCX, `(is-protocol-caller 0x00 '${g})`))) { USDCX_GOV = g; break; }
  const govOk = !!USDCX_GOV;
  check(`USDCx governance role found (${USDCX_GOV})`, govOk);
  if (govOk) await tx('USDCx governance: BURNER gets the mint/burn role (0x01)', USDCX_GOV, USDCX, 'set-active-protocol-caller', [P_(BURNER), bufferCV(Buffer.from('01', 'hex')), boolCV(true)], { ok: true });
  const SIGNER = await evalIn('SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-registry', '(get-current-signer-principal)');
  const FLAG = bufferCV(Buffer.from('7f', 'hex'));
  await tx(`sBTC signers (${short(SIGNER)}): BURNER registered as protocol contract flag 0x7f`, SIGNER, 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-bootstrap-signers', 'update-protocol-contract-wrapper', [FLAG, P_(BURNER)], { ok: true });

  // one F-01 run: rung R, members M (input deposited D each), proceeds token
  async function f01(tag, R, M, D, sellRung) {
    group(`F-01 ${tag}`);
    const inKey = sellRung ? 'sbtc' : 'stx', outKey = sellRung ? 'stx' : 'sbtc';
    const outTok = sellRung ? USDCX : SBTC, inTok = sellRung ? SBTC : USDCX;
    for (const m of M) { await tx(`${short(m)} deposit ${D} into ${short(R)}`, m, R, 'deposit', [uintCV(D)], isOk); await settleIfPending(R, sellRung); }
    await fresh();
    const lim = sellRung ? await evalIn(C.market, `(token-x-limit-at '${R} u${U.mid})`) : await evalIn(C.market, `(token-y-limit-at '${R} u${U.mid})`);
    // fill about half the pooled input
    const amt = sellRung ? (D * 3n / 2n) * lim / SCALE : (D * 3n / 2n) * SCALE / lim;
    await tx(`taker market swap fills ~half of ${short(R)}`, TAKER, C.market, 'swap', [uintCV(amt), uintCV(sellRung ? lim * 101n / 100n : lim * 99n / 100n), upd(), TX, AX, TY, AY, boolCV(!sellRung)], isOk);
    await tx(`${short(R)} sync`, OUTSIDER, R, 'sync', [], isOk);
    const pos = async (m) => evalIn(R, `(get-position '${m})`);
    const cash = async () => evalIn(R, '(proceeds-cash)');
    const deficit = async () => evalIn(R, '(get-deficit)');
    const debt = async (m) => evalIn(R, `(get-debt '${m})`);
    const owedB = [], inB = [];
    for (const m of M) { const p = await pos(m); owedB.push(p[outKey]); inB.push(p[inKey]); }
    const total = await cash();
    console.log(`  owed ${show(owedB)} input ${show(inB)} cash ${total}`);
    must('partial fill: proceeds owed and input left for every member', owedB.every((o) => o > 0n) && inB.every((i) => i > 0n) && total > 0n, show({ owedB, inB, total }));
    check('deficit 0 before the seizure', (await deficit()) === 0n);
    const seized = total / 2n;
    const burn = sellRung ? await tx(`USDCx protocol-burn ${seized} from ${short(R)}`, BURNER, USDCX, 'protocol-burn', [uintCV(seized), P_(R)], { ok: true })
      : await tx(`sBTC protocol-burn ${seized} from ${short(R)}`, BURNER, SBTC, 'protocol-burn', [uintCV(seized), P_(R), FLAG], { ok: true });
    if (!isOk(burn.res)) throw new Stop('seizure failed');
    await tx(`${short(R)} sync after the seizure`, OUTSIDER, R, 'sync', [], isOk);
    check(`deficit = seized ${seized}`, (await deficit()) === seized, `${await deficit()}`);
    check('get-state reports the deficit', (await evalIn(R, '(get-state)')).deficit === seized);
    await tx('newcomer deposit while in deficit -> u7017', NEWCOMER, R, 'deposit', [uintCV(D)], { err: 7017n });
    let cashLeft = total - seized;
    const got = [], back = [];
    for (const [i, m] of M.entries()) {
      const p0 = await bal(outTok, m), i0 = await bal(inTok, m);
      await tx(`member ${i + 1} full withdraw`, m, R, 'withdraw', [uintCV(10n ** 15n), someCV(upd())], isOk);
      got.push((await bal(outTok, m)) - p0); back.push((await bal(inTok, m)) - i0);
      const want = owedB[i] < cashLeft ? owedB[i] : cashLeft;
      check(`member ${i + 1} paid min(owed ${owedB[i]}, cash ${cashLeft}) = ${want}`, got[i] === want, `${got[i]}`);
      const d = (await debt(m)) - (owedB[i] - want);
      // the last member out also collects the index-rounding dust (cash - sum of previews), so +0..2
      check(`member ${i + 1} debt = owed - paid (+0..2 rounding)`, d >= 0n && d <= 2n, `${await debt(m)}`);
      check(`member ${i + 1} input returned (${inB[i]} +0..2)`, back[i] - inB[i] >= 0n && back[i] - inB[i] <= 2n, `${back[i]}`);
      cashLeft -= want;
    }
    check('first member fully paid, last unpaid now', got[0] === owedB[0] && got[2] === 0n, show(got));
    check('sum of recorded debts = seized', (await Promise.all(M.map(debt))).reduce((a, x) => a + x, 0n) === seized, show(await Promise.all(M.map(debt))));
    check('cash 0, deficit still the seized amount', (await cash()) === 0n && (await deficit()) === seized, `${await cash()} ${await deficit()}`);
    const mint = sellRung ? await tx(`USDCx protocol-mint ${seized} back to ${short(R)}`, BURNER, USDCX, 'protocol-mint', [uintCV(seized), P_(R)], { ok: true })
      : await tx(`sBTC protocol-mint ${seized} back to ${short(R)}`, BURNER, SBTC, 'protocol-mint', [uintCV(seized), P_(R), FLAG], { ok: true });
    void mint;
    check('deficit 0 after refill', (await deficit()) === 0n, `${await deficit()}`);
    for (const [i, m] of M.entries()) {
      const dbt = await debt(m);
      if (dbt === 0n) continue;
      const p0 = await bal(outTok, m);
      await tx(`ex-member ${i + 1} claims debt ${dbt}`, m, R, 'claim', [], isOk);
      check(`ex-member ${i + 1} received its debt, debt 0`, (await bal(outTok, m)) - p0 === dbt && (await debt(m)) === 0n);
    }
    await tx('claim again with no position and no debt -> u7006', M[0], R, 'claim', [], { err: 7006n });
    check('deficit 0', (await deficit()) === 0n);
    await tx('newcomer deposit after the refill -> ok (rung reopens)', NEWCOMER, R, 'deposit', [uintCV(D)], isOk);
  }
  for (const args of [['sell rung (sBTC in, USDCx proceeds burned)', SELL(F01), FX, 100_000n, true], ['buy rung (USDCx in, sBTC proceeds burned)', BUY(F01), FY, 100_000_000n, false]]) {
    try { await f01(...args); } catch (e) { if (!(e instanceof Stop)) throw e; note(`${args[0]} stopped: ${e.message}`); }
  }
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(String(e?.message ?? e)); }
}
summary();
