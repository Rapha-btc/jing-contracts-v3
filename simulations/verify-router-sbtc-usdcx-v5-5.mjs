// stxer mainnet-fork proof: contracts/sbtc-usdcx/swap-router-sbtc-usdcx-jing-v5-5
// on markets-sbtc-usdcx-jing-v6-4 (both from the sbtc-usdcx folder, deployed
// fresh). DLMM venue = Bitflow sbtc-usdcx pools (x = sBTC, y = USDCx, the
// reverse of the stx-sbtc pools v5-5 was written for).
//   A  DLMM only: smart-swap each direction with an empty book
//   B  jing + DLMM split: a resting maker on each side, a taker larger than it
//   C  disabled venues: xyk / velar amounts and fallbacks -> u3003
// Run: node simulations/verify-router-sbtc-usdcx-v5-5.mjs
import { readFileSync } from 'node:fs';
import { uintCV, noneCV, someCV, bufferCV, stringAsciiCV, tupleCV } from '@stacks/transactions';
import { SimulationBuilder } from 'stxer';
import { lazerFeedTimes } from './_lazer.js';
import { NODE, DEP, SBTC, WHALE, P_, mk, S, retry, sleep, check, must, show, tx, evalIn, call, deploy, prints, summary, Stop } from './_yg-loop-common.js';

const MKT_NAME = 'markets-sbtc-usdcx-jing-v6-4', RT_NAME = 'swap-router-sbtc-usdcx-jing-v5-5';
const MKT = `${DEP}.${MKT_NAME}`, RT = `${DEP}.${RT_NAME}`, CORE = `${DEP}.jing-core-v6`;
const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const USDC_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ';
const POOL_1 = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-sbtc-usdcx-v-1-bps-10';
const src = (f) => readFileSync(new URL(`../contracts/sbtc-usdcx/${f}.clar`, import.meta.url), 'utf8');
const TX = P_(SBTC), TY = P_(USDCX), AX = stringAsciiCV('sbtc-token'), AY = stringAsciiCV('usdcx-token');
const SCALE = 10_000_000_000n, BPS = 10_000n;
const TAKER = mk(9);

async function fetchUsdcx() {
  const r = await fetch('https://faktory-dao-backend.vercel.app/api/auction/pyth-lazer-update?pair=sbtc-usdcx', { headers: { 'x-api-key': 'jc_e4d2e10396eef95215a7afd492f42d743a3325739d29200c2a28b256f778be01' } });
  if (!r.ok) throw new Error(`backend lazer ${r.status}`);
  const d = (await r.json()).data;
  if (String(d.feedIds) !== '1,7') throw new Error(`feeds ${d.feedIds}`);
  return { hex: d.hex.replace(/^0x/, ''), px: BigInt(d.priceX), py: BigInt(d.priceY) };
}
let U = null;
async function fresh() {
  const bt = Number(await evalIn(MKT, 'stacks-block-time'));
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
const px = (usdcx, sats) => usdcx * SCALE / sats; // market unit
const bpsOf = (p, mid) => Number((p - mid) * BPS / mid);

// smart swap: returns { res, d (user deltas), p (fill price) }
async function smart(label, sellSbtc, amount, limit, withUpdate) {
  await fresh();
  const b0 = await bals(TAKER), p0 = await bals(POOL_1);
  const fn = sellSbtc ? 'smart-swap-sbtc-for-usdcx' : 'smart-swap-usdcx-for-sbtc';
  const r = await tx(label, TAKER, RT, fn, [uintCV(amount), uintCV(limit), withUpdate ? someCV(upd()) : noneCV(), uintCV(U.mid), uintCV(1)], (v) => v?.ok !== undefined);
  const b1 = await bals(TAKER), p1 = await bals(POOL_1);
  const spent = sellSbtc ? b0.sb - b1.sb : b0.us - b1.us, got = sellSbtc ? b1.us - b0.us : b1.sb - b0.sb;
  const p = sellSbtc ? px(got, spent) : px(spent, got);
  const o = r.res?.ok ?? {};
  console.log(`  spent ${spent} got ${got} -> ${Number(p) / 1e10 * 100} $/BTC (${bpsOf(p, U.mid)} bps vs mid ${U.mid}); jing ${o['jing-in']}->${o['jing-out']} dlmm ${o['dlmm-in']}->${o['dlmm-out']} unsold ${o.unsold}`);
  console.log(`  pool-1 delta sBTC ${p1.sb - p0.sb} USDCx ${p1.us - p0.us}`);
  return { o, spent, got, p, pool: { sb: p1.sb - p0.sb, us: p1.us - p0.us }, receipt: r.receipt };
}

try {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(SBTC, '(get-total-supply)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);

  group('setup');
  // the market binds jing-ladder-sbtc-usdcx-v1, so the ladder deploys first
  await deploy(DEP, 'jing-ladder-sbtc-usdcx-v1', src('jing-ladder-sbtc-usdcx-v1'));
  await deploy(DEP, MKT_NAME, src(MKT_NAME));
  // jing-core-v6 is owned by the Juice multisig since 2026-10-24: verify as whoever owns it
  await tx('core set-verified-contract(market)', await evalIn(CORE, '(get-contract-owner)'), CORE, 'set-verified-contract', [P_(MKT)], (v) => v?.ok !== undefined);
  // initialize needs tx-sender = operator = core owner: hand the operator to the multisig, initialize, hand it back
  const CORE_OWNER = await evalIn(CORE, '(get-contract-owner)');
  await tx('market set-operator -> core owner', DEP, MKT, 'set-operator', [P_(CORE_OWNER)], { ok: true });
  await tx('initialize(sbtc, usdcx, feeds 1/7)', CORE_OWNER, MKT, 'initialize', [P_(MKT), TX, TY, uintCV(1_000n), uintCV(1_000_000n), uintCV(1), uintCV(7)], { ok: true });
  await tx('market set-operator -> DEP', CORE_OWNER, MKT, 'set-operator', [P_(DEP)], { ok: true });
  await deploy(DEP, RT_NAME, src(RT_NAME));
  must('fund taker sBTC', (await call(WHALE.x, SBTC, 'transfer', [uintCV(1_000_000n), P_(WHALE.x), P_(TAKER), noneCV()])).res?.ok === true);
  must('fund taker USDCx', (await call(USDC_WHALE, USDCX, 'transfer', [uintCV(1_000_000_000n), P_(USDC_WHALE), P_(TAKER), noneCV()])).res?.ok === true);
  check('get-jing-min-deposits reads the usdcx market', show(await evalIn(RT, '(get-jing-min-deposits)')) === show({ 'min-token-x': 1000n, 'min-token-y': 1000000n }), show(await evalIn(RT, '(get-jing-min-deposits)')));

  group('A DLMM only (empty book)');
  await fresh();
  const A1 = await smart('A1 smart-swap-sbtc-for-usdcx 0.001 sBTC, limit mid-3%', true, 100_000n, U.mid * 9700n / BPS, true);
  check('A1 all routed to DLMM, jing 0', A1.o['jing-in'] === 0n && A1.o['dlmm-in'] === 100_000n, show(A1.o));
  check('A1 user deltas == dlmm-in / out (sats 8dp, USDCx 6dp)', A1.spent === 100_000n && A1.got === A1.o.out && A1.got > 50_000_000n && A1.got < 120_000_000n, `${A1.spent} ${A1.got}`);
  check('A1 pool-1 took the sBTC, paid the USDCx', A1.pool.sb === 100_000n && -A1.pool.us === A1.got, show(A1.pool));
  check('A1 fill within 1% of mid', Math.abs(bpsOf(A1.p, U.mid)) < 100, bpsOf(A1.p, U.mid));
  const A2 = await smart('A2 smart-swap-usdcx-for-sbtc 80 USDCx, limit mid+3%', false, 80_000_000n, U.mid * 10300n / BPS, true);
  check('A2 all routed to DLMM, jing 0', A2.o['jing-in'] === 0n && A2.o['dlmm-in'] === 80_000_000n, show(A2.o));
  check('A2 user deltas == dlmm-in / out', A2.spent === 80_000_000n && A2.got === A2.o.out && A2.got > 80_000n && A2.got < 120_000n, `${A2.spent} ${A2.got}`);
  check('A2 pool-1 took the USDCx, paid the sBTC', A2.pool.us === 80_000_000n && -A2.pool.sb === A2.got, show(A2.pool));
  check('A2 fill within 1% of mid', Math.abs(bpsOf(A2.p, U.mid)) < 100, bpsOf(A2.p, U.mid));
  await fresh();
  await tx('A3 sell sBTC with limit mid+5% (above the pool): nothing fills -> min-out u3002', TAKER, RT, 'smart-swap-sbtc-for-usdcx', [uintCV(100_000n), uintCV(U.mid * 10500n / BPS), noneCV(), uintCV(U.mid), uintCV(1)], { err: 3002n });
  await tx('A4 buy sBTC with limit mid-5% (below the pool): nothing fills -> min-out u3002', TAKER, RT, 'smart-swap-usdcx-for-sbtc', [uintCV(80_000_000n), uintCV(U.mid * 9500n / BPS), noneCV(), uintCV(U.mid), uintCV(1)], { err: 3002n });

  group('B jing + DLMM split');
  await fresh();
  const ASK = U.mid * (BPS + 10n) / BPS, BID = U.mid * (BPS - 10n) / BPS;
  await tx('x maker rests 0.001 sBTC at mid+10bps', WHALE.x, MKT, 'deposit-token-x', [uintCV(100_000n), uintCV(ASK), noneCV(), TX, AX], (v) => v?.ok !== undefined);
  await tx('y maker rests 100 USDCx at mid-10bps', USDC_WHALE, MKT, 'deposit-token-y', [uintCV(100_000_000n), uintCV(BID), noneCV(), TY, AY], (v) => v?.ok !== undefined);
  await fresh();
  if (await evalIn(MKT, `(get-token-x-pending-deposit '${WHALE.x})`)) await tx('settle x pending', DEP, MKT, 'settle-token-x-deposit', [P_(WHALE.x), upd(), TX, AX], (v) => v?.ok !== undefined);
  if (await evalIn(MKT, `(get-token-y-pending-deposit '${USDC_WHALE})`)) await tx('settle y pending', DEP, MKT, 'settle-token-y-deposit', [P_(USDC_WHALE), upd(), TY, AY], (v) => v?.ok !== undefined);
  const cyc = await evalIn(MKT, '(get-current-cycle)');
  must('both makers rest', (await evalIn(MKT, `(get-token-x-deposit u${cyc} '${WHALE.x})`)) === 100_000n && (await evalIn(MKT, `(get-token-y-deposit u${cyc} '${USDC_WHALE})`)) === 100_000_000n);
  const mx0 = await bals(WHALE.x);
  const B1 = await smart('B1 buy sBTC with 300 USDCx, limit mid+3% (book then DLMM)', false, 300_000_000n, U.mid * 10300n / BPS, true);
  check('B1 jing filled first, DLMM took the rest', B1.o['jing-in'] > 0n && B1.o['dlmm-in'] > 0n && B1.o['jing-in'] + B1.o['dlmm-in'] + B1.o.unsold === 300_000_000n, show(B1.o));
  check('B1 user got jing-out + dlmm-out sBTC', B1.got === B1.o['jing-out'] + B1.o['dlmm-out'] && B1.got === B1.o.out, `${B1.got} vs ${B1.o['jing-out']}+${B1.o['dlmm-out']}`);
  check('B1 x maker paid in USDCx', (await bal(USDCX, WHALE.x)) > mx0.us, `${mx0.us} -> ${await bal(USDCX, WHALE.x)}`);
  check('B1 blended fill within 1% of mid', Math.abs(bpsOf(B1.p, U.mid)) < 100, bpsOf(B1.p, U.mid));
  const my0 = await bals(USDC_WHALE);
  const B2 = await smart('B2 sell 0.003 sBTC, limit mid-3% (book then DLMM)', true, 300_000n, U.mid * 9700n / BPS, true);
  check('B2 jing filled first, DLMM took the rest', B2.o['jing-in'] > 0n && B2.o['dlmm-in'] > 0n && B2.o['jing-in'] + B2.o['dlmm-in'] + B2.o.unsold === 300_000n, show(B2.o));
  check('B2 user got jing-out + dlmm-out USDCx', B2.got === B2.o['jing-out'] + B2.o['dlmm-out'] && B2.got === B2.o.out, `${B2.got} vs ${B2.o['jing-out']}+${B2.o['dlmm-out']}`);
  check('B2 y maker paid in sBTC', (await bal(SBTC, USDC_WHALE)) > my0.sb, `${my0.sb} -> ${await bal(SBTC, USDC_WHALE)}`);
  check('B2 blended fill within 1% of mid', Math.abs(bpsOf(B2.p, U.mid)) < 100, bpsOf(B2.p, U.mid));
  const router = await bals(RT);
  check('router keeps nothing', router.sb === 0n && router.us === 0n, show(router));

  group('C disabled venues');
  const amts = (d, x, v) => tupleCV({ dlmm: uintCV(d), xyk: uintCV(x), velar: uintCV(v) });
  await tx('C1 swap-sbtc-for-usdcx with an xyk amount -> u3003', TAKER, RT, 'swap-sbtc-for-usdcx', [uintCV(10_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amts(0, 10_000, 0), amts(0, 0, 0), uintCV(0)], { err: 3003n });
  await tx('C2 swap-usdcx-for-sbtc with a velar amount -> u3003', TAKER, RT, 'swap-usdcx-for-sbtc', [uintCV(10_000_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amts(0, 0, 10_000_000), amts(0, 0, 0), uintCV(0)], { err: 3003n });
  await tx('C3 fallback xyk -> u3003', TAKER, RT, 'swap-sbtc-for-usdcx', [uintCV(10_000n), uintCV(0), uintCV(1), noneCV(), someCV(uintCV(2)), amts(10_000, 0, 0), amts(0, 0, 0), uintCV(0)], { err: 3003n });
  await tx('C4 explicit dlmm-only swap-sbtc-for-usdcx works', TAKER, RT, 'swap-sbtc-for-usdcx', [uintCV(10_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amts(10_000, 0, 0), amts(1, 0, 0), uintCV(1)], (v) => v?.ok?.['dlmm-in'] === 10_000n && v?.ok?.out > 0n);
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(`EXC ${e.message}`); }
}
summary();
