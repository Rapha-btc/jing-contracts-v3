// stxer mainnet-fork proof: swap-router-sbtc-usdcx-jing-v6 (v5-6 + Zest CLMM
// sBTC/USDCx pool u4 on clmm-pool-v1, x = sbtc-token, y = usdcx), keyless (no
// Jing leg, no Lazer update). Pool u4 does not exist on mainnet yet (Zest
// confirmed it will be u4, pool 1's token order with STX -> sBTC).
//   A  pool u4 absent: smart swaps skip Zest (zest-ok false), splits with zest
//      u0 work, a zest > 0 split leaves the Zest slice unsold (fallback none),
//      re-sells it on DLMM (fallback u1), u4 as fallback -> u3003, a combined
//      min-out that counts the Zest slice -> u3002
//   B  fork-only fixture: create pool u4 (x = sBTC, y = USDCx, bin step 100,
//      fee ZEST_FEE, default 0.3%) as Zest's executor-dao, seed a band around
//      the DLMM mid, then:
//      - zest-bound == JS (1e28 / limit, fee folded, rounded against the user)
//      - router zest-tick(mid) matches the pool's bin edges
//      - split legs both ways (swap-x-for-y selling sBTC, swap-y-for-x selling
//        USDCx): user deltas == pool quote, fill at or better than the limit
//      - partial Zest fill: shortfall unsold (fallback none) or re-sold on DLMM
//        (fallback u1); amm-mins.zest scaled to the filled part, too high -> u3002
//      - smart swaps both ways fill on Zest first, within the limit
// Price units: router limit = micro-USDCx per sat x 1e10; Zest WAD = raw x per
// raw y = sats per micro-USDCx x 1e18 = 1e28 / limit; DLMM bin price (x = sBTC,
// y = USDCx) = micro-USDCx per sat x 1e8, so limit = price x 100.
// Run: node simulations/verify-router-sbtc-usdcx-v6-zest.mjs   (STACKS_NODE optional)
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { uintCV, intCV, noneCV, someCV, tupleCV, listCV, deserializeCV, cvToString } from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps } from 'stxer';
import { NODE, DEP, WHALE, P_, mk, note, S, retry, check, must, show, tx, evalIn, call, deploy, summary, Stop, SBTC } from './_yg-loop-common.js';

const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const USDC_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ';
const ZPOOL = 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-pool-v1';
const ZROUTER = 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-router-v1';
const ZEXEC = 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.executor-dao';
const ZID = 4;
const ZFEE = BigInt(process.env.ZEST_FEE || '300000');   // 1e8 = 100%; pool 1 runs 0.3%
const DLMM_CORE = 'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1';
const DPOOLS = ['dlmm-pool-sbtc-usdcx-v-1-bps-10', 'dlmm-pool-sbtc-usdcx-v-1-bps-1', 'dlmm-pool-sbtc-usdcx-v-2-bps-10'].map((n) => `SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.${n}`);
const NAME = 'swap-router-sbtc-usdcx-jing-v6';
const RT = `${DEP}.${process.env.ROUTER_AS || NAME}`;
const UMAX = 340282366920938463463374607431768211455n;
const INV = 10n ** 28n, ZMAX = 10n ** 21n, F1 = 100_000_000n, PS = 10_000_000_000n;
const TAKER = mk(6), LP = mk(7);
const NB = 20, USDC_PER_BIN = 200_000_000n, SATS_PER_BIN = 500_000n;   // 200 USDCx / 0.005 BTC per tick

const amm = (d = 0n, z = 0n) => tupleCV({ dlmm: uintCV(d), xyk: uintCV(0), velar: uintCV(0), zest: uintCV(z) });
const route = (ticks, price) => tupleCV({ ticks: listCV(ticks.map((t) => intCV(t))), price: uintCV(price) });
const NOROUTE = route([], 0n);
const bal = async (tok, who) => (await evalIn(tok, `(get-balance '${who})`)).ok;
const bals = async (who) => ({ sb: await bal(SBTC, who), us: await bal(USDCX, who) });
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };
const fnOf = (sell) => (sell ? 'swap-sbtc-for-usdcx' : 'swap-usdcx-for-sbtc');
const smartOf = (sell) => (sell ? 'smart-swap-sbtc-for-usdcx' : 'smart-swap-usdcx-for-sbtc');
const split = (amt, limit, fb, d, z, md, mz, min, rt) => [uintCV(amt), uintCV(0), uintCV(limit), noneCV(), fb, amm(d, z), amm(md, mz), uintCV(min), rt];
// effective price vs the limit (router units): sell sBTC out micro-USDCx >= in sats x L / 1e10;
// sell USDCx out sats >= in micro-USDCx x 1e10 / L. 2-unit slack (Zest haircut + per-bin floor), strict noted.
const atLimit = (sell, i, o, L) => {
  if (i === 0n) return o === 0n;
  if (i > 2n) return sell ? o >= ((i - 2n) * L) / PS : o >= ((i - 2n) * PS) / L;
  return o + i >= (sell ? ((i - 1n) * L) / PS : ((i - 1n) * PS) / L);
};
const strict = (sell, i, o, L) => (i === 0n ? o === 0n : sell ? o * PS >= i * L : o * L >= i * PS);
function limitChecks(label, sell, i, o, L) {
  check(`${label}: Zest fill at or better than limit (2-unit slack)`, atLimit(sell, i, o, L), show({ i, o, L }));
  if (!strict(sell, i, o, L)) note(`${label}: strict miss vs limit (in ${i}, out ${o}, L ${L}) within the 2-unit slack`);
}
async function zquote(sell, ticks, amount, bound) {
  let left = amount, out = 0n;
  for (const t of ticks) {
    if (left === 0n) break;
    const q = sell
      ? await evalIn(ZPOOL, `(quote-swap-x-for-y u${ZID} ${t} u${left} u${bound ?? UMAX})`)
      : await evalIn(ZPOOL, `(quote-swap-y-for-x u${ZID} ${t} u${left} u${bound ?? 0n})`);
    left -= q.ok.in; out += q.ok.out;
  }
  return { out, left, in: amount - left };
}
const routerEmpty = async (label) => { const r = await bals(RT); return check(`${label}: router holds 0 sBTC / 0 USDCx`, r.sb === 0n && r.us === 0n, show(r)); };

try {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  if (process.env.FORK_BLOCK) b.useBlockHeight(Number(process.env.FORK_BLOCK));
  b.withSender(DEP).addEvalCode(ZPOOL, '(get-pool-count)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);

  group('deploy + live state');
  const pc = await evalIn(ZPOOL, '(get-pool-count)');
  must(`live get-pool-count = 3 (u4 not created yet), got ${pc}`, pc === 3n);
  check('get-pool u4 = none', (await evalIn(ZPOOL, `(get-pool u${ZID})`)) === null);
  const rsrc = readFileSync(new URL(`../contracts/sbtc-usdcx/${NAME}.clar`, import.meta.url), 'utf8');
  note(`router source sha256 ${createHash('sha256').update(rsrc).digest('hex')}`);
  await deploy(DEP, process.env.ROUTER_AS || NAME, rsrc);
  const rk = await evalIn(RT, '(list ZEST_MAX_LIMIT ZEST_INV_WAD ZEST_FEE_ONE ZEST_POOL_ID)');
  check('router constants: ZEST_MAX_LIMIT 1e21, ZEST_INV_WAD 1e28, FEE_ONE 1e8, pool u4', rk[0] === ZMAX && rk[1] === INV && rk[2] === F1 && rk[3] === 4n, show(rk));
  // DLMM mid: deepest pool's active bin, micro-USDCx per sat x 1e8 -> router x 1e10
  const ps = [];
  for (const P of DPOOLS) {
    const i = (await evalIn(P, '(get-pool)')).ok;
    const p = (await evalIn(DLMM_CORE, `(get-bin-price u${i['initial-price']} u${i['bin-step']} ${i['active-bin-id']})`)).ok;
    ps.push({ P, p, us: await bal(USDCX, P) });
  }
  const deep = ps.reduce((m, x) => (x.us > m.us ? x : m));
  const mid = deep.p * 100n;
  const midwad = INV / mid;
  console.log(`  DLMM ${deep.P.split('.')[1]} price ${deep.p} -> mid ${mid} ($${Number(mid) / 1e10 * 100}/BTC), mid-wad ${midwad}`);
  must('DLMM mid sane ($20k..$200k per BTC)', mid > 2n * 10n ** 12n && mid < 2n * 10n ** 13n, `${mid}`);
  must('fund taker 0.2 BTC', (await call(WHALE.x, SBTC, 'transfer', [uintCV(20_000_000n), P_(WHALE.x), P_(TAKER), noneCV()])).res?.ok === true);
  must('fund taker 3k USDCx', (await call(USDC_WHALE, USDCX, 'transfer', [uintCV(3_000_000_000n), P_(USDC_WHALE), P_(TAKER), noneCV()])).res?.ok === true);
  const Ls = mid * 97n / 100n, Lu = mid * 103n / 100n;   // sell sBTC min price / sell USDCx max price, 3% off mid

  group('A pool u4 absent');
  for (const sell of [true, false]) {
    const tag = sell ? 'sBTC->USDCx' : 'USDCx->sBTC', amt = sell ? 100_000n : 60_000_000n, L = sell ? Ls : Lu;
    await tx(`A smart ${tag}: Zest skipped (zest-ok false, zest-in 0), DLMM sells it all`, TAKER, RT, smartOf(sell),
      [uintCV(amt), uintCV(L), noneCV(), uintCV(mid), uintCV(1)],
      (v) => v?.ok?.['zest-in'] === 0n && v?.ok?.['dlmm-in'] === amt && v?.ok?.unsold === 0n);
    await tx(`A split ${tag} zest u0 (empty route): DLMM only, ok`, TAKER, RT, fnOf(sell),
      split(amt, L, noneCV(), amt, 0n, 1n, 0n, 1n, NOROUTE), (v) => v?.ok?.['dlmm-in'] === amt && v?.ok?.['zest-in'] === 0n && v?.ok?.unsold === 0n);
    const h = amt / 2n;
    await tx(`A split ${tag} zest ${h} (pool missing), fallback none: Zest fills 0, slice unsold`, TAKER, RT, fnOf(sell),
      split(amt, L, noneCV(), h, h, 1n, 0n, 1n, route([-640, -641], sell ? UMAX : 0n)), (v) => v?.ok?.['zest-in'] === 0n && v?.ok?.unsold === h && v?.ok?.['dlmm-in'] === h);
    await tx(`A split ${tag} zest ${h} (pool missing), fallback DLMM: shortfall re-sold, unsold 0`, TAKER, RT, fnOf(sell),
      split(amt, L, someCV(uintCV(1)), h, h, 1n, 0n, 1n, route([-640, -641], sell ? UMAX : 0n)), (v) => v?.ok?.['zest-in'] === 0n && v?.ok?.unsold === 0n);
    await tx(`A split ${tag} fallback u4 (Zest) -> u3003`, TAKER, RT, fnOf(sell),
      split(amt, L, someCV(uintCV(4)), h, h, 1n, 0n, 1n, NOROUTE), { err: 3003n });
    const fullMin = sell ? (amt * L) / PS : (amt * PS) / L;
    await tx(`A split ${tag} zest slice counted in the combined min-out (pool missing) -> u3002`, TAKER, RT, fnOf(sell),
      split(amt, L, noneCV(), h, h, 1n, 0n, fullMin, route([-640], sell ? UMAX : 0n)), { err: 3002n });
  }
  await routerEmpty('A');

  group('B fork-only pool u4: create');
  // fork-only fixture: Zest's executor-dao creates the pool (Eval as that contract)
  const out = await retry(() => submitSimulationSteps(S.sid, { steps: [{ TenureExtend: { cause: 'Extended' } }, { Eval: [DEP, '', ZEXEC, `(as-contract? () (try! (contract-call? '${ZPOOL} create-pool '${SBTC} '${USDCX} u100 u${ZFEE} u${ZFEE} u100000000)))`] }] }));
  const ev = out.steps[1]?.Eval;
  const created = ev && 'Ok' in ev ? cvToString(deserializeCV(ev.Ok)) : JSON.stringify(ev);
  must('executor-dao create-pool sbtc/usdcx bin 100 -> (ok u4)', created === '(ok u4)', created);
  const pool = await evalIn(ZPOOL, `(get-pool u${ZID})`);
  must('pool u4: token-x sbtc-token, token-y usdcx, bin step 100, not native, live',
    pool?.['token-x'] === SBTC && pool?.['token-y'] === USDCX && pool?.['bin-step'] === 100n && pool?.['native-x'] === false && pool?.['native-y'] === false && pool?.paused === false, show(pool));
  check('get-pool-id {sbtc, usdcx, 100} = u4', (await evalIn(ZPOOL, `(get-pool-id { token-x: '${SBTC}, token-y: '${USDCX}, bin-step: u100 })`)) === 4n);

  group('B zest-bound + tick math');
  const zr = (await evalIn(ZPOOL, `(get-fee-rates u${ZID} '${TAKER})`)).ok;
  const feeOf = (sell) => (sell ? zr['fee-rate-x'] : zr['fee-rate-y']);
  const boundFor = (sell, L, fee = feeOf(sell)) => (sell ? ((INV / L) * (F1 - fee)) / F1 : (((INV + L - 1n) / L) * F1 + (F1 - fee - 1n)) / (F1 - fee));
  const Lt = [1n, 7n, mid / 3n, mid - 1n, mid, mid + 1n, mid * 3n, ZMAX - 1n, ZMAX];
  let bOk = true, rOk = true;
  for (const fee of [0n, feeOf(true), 1_000_000n, 99_999_999n]) {
    const rr = await evalIn(RT, `(list ${Lt.map((L) => `(zest-bound u${L} u${fee} true) (zest-bound u${L} u${fee} false)`).join(' ')})`);
    Lt.forEach((L, i) => {
      const [bs, bu] = [rr[2 * i], rr[2 * i + 1]];
      if (bs !== boundFor(true, L, fee) || bu !== boundFor(false, L, fee)) bOk = false;
      if (!(bs * F1 * L <= INV * (F1 - fee)) || !(bu * (F1 - fee) * L >= INV * F1)) rOk = false;
    });
  }
  check('router zest-bound == JS at 9 limits x 4 fees', bOk);
  check('zest-bound rounds against the user (max-price <= exact, min-price >= exact)', rOk);
  const rb = await evalIn(RT, `(list (zest-bound u${mid} u${feeOf(true)} true) (zest-bound u${mid} u${feeOf(false)} false))`);
  check('bound(mid): sell-sBTC max-price < mid-wad < sell-USDCx min-price', rb[0] < midwad && midwad < rb[1], show({ rb, midwad }));
  const tmR = Number(await evalIn(RT, `(zest-tick u${midwad})`));
  const pLo = (await evalIn(ZPOOL, `(get-bin-price u${ZID} ${tmR})`)).ok, pHi = (await evalIn(ZPOOL, `(get-bin-price u${ZID} ${tmR + 1})`)).ok;
  check(`pool bin edges around router tick(mid) ${tmR}: price(${tmR}) <= mid-wad < price(${tmR + 1}) (off by at most the documented 1-tick low bias)`,
    (pLo <= midwad && midwad < pHi) || (pHi <= midwad && midwad < (await evalIn(ZPOOL, `(get-bin-price u${ZID} ${tmR + 2})`)).ok), show({ pLo, midwad, pHi }));
  const tm = pLo <= midwad && midwad < pHi ? tmR : tmR + 1;
  note(`tick(mid) ${tm} (JS log ${Math.floor(Math.log(Number(midwad) / 1e18) / Math.log(1.01))}), router zest-tick ${tmR}`);

  group('B seed band');
  must('fund LP USDCx', (await call(USDC_WHALE, USDCX, 'transfer', [uintCV(USDC_PER_BIN * BigInt(NB)), P_(USDC_WHALE), P_(LP), noneCV()])).res?.ok === true);
  must('fund LP sBTC', (await call(WHALE.x, SBTC, 'transfer', [uintCV(SATS_PER_BIN * BigInt(NB)), P_(WHALE.x), P_(LP), noneCV()])).res?.ok === true);
  const upT = Array.from({ length: NB }, (_, i) => tm + 1 + i);   // USDCx (y) bins above: selling sBTC walks up
  const dnT = Array.from({ length: NB }, (_, i) => tm - 1 - i);   // sBTC (x) bins below: selling USDCx walks down
  const pos = (t, x, y) => tupleCV({ tick: intCV(t), 'max-x': uintCV(x), 'max-y': uintCV(y), 'min-price': uintCV(0), 'max-price': uintCV(UMAX), 'min-shares': uintCV(1) });
  await tx(`add-to-positions-many: ${NB} USDCx bins ${upT[0]}..${upT[NB - 1]}`, LP, ZROUTER, 'add-to-positions-many',
    [P_(SBTC), P_(USDCX), uintCV(ZID), listCV(upT.map((t) => pos(t, 0n, USDC_PER_BIN)))], (v) => v?.ok?.length === NB);
  await tx(`add-to-positions-many: ${NB} sBTC bins ${dnT[0]}..${dnT[NB - 1]}`, LP, ZROUTER, 'add-to-positions-many',
    [P_(SBTC), P_(USDCX), uintCV(ZID), listCV(dnT.map((t) => pos(t, SATS_PER_BIN, 0n)))], (v) => v?.ok?.length === NB);
  const zp = await bals(ZPOOL);
  console.log(`  clmm-pool-v1 now sBTC ${zp.sb} USDCx ${zp.us}`);
  const pUp = (await evalIn(ZPOOL, `(get-bin-price u${ZID} ${upT[0]})`)).ok, pDn = (await evalIn(ZPOOL, `(get-bin-price u${ZID} ${dnT[0]})`)).ok;
  check(`first USDCx bin price ${pUp} > mid-wad ${midwad} > first sBTC bin price ${pDn}`, pUp > midwad && midwad > pDn);
  const sT = upT.slice(0, 32), uT = dnT.slice(0, 32);

  group('B split legs on Zest');
  for (const sell of [true, false]) {
    const tag = sell ? 'sBTC->USDCx' : 'USDCx->sBTC', amt = sell ? 200_000n : 150_000_000n, ticks = sell ? sT : uT, L = sell ? Ls : Lu;
    const bound = boundFor(sell, L);
    const q = await zquote(sell, ticks, amt, bound);
    must(`${tag}: pool quote fills ${amt} inside the band`, q.left === 0n && q.out > 0n, show(q));
    const a0 = await bals(TAKER), p0 = await bals(ZPOOL);
    const r = await tx(`${tag} split all Zest (route price = bound(limit)), min = quote`, TAKER, RT, fnOf(sell),
      split(amt, L, noneCV(), 0n, amt, 0n, q.out, q.out, route(ticks, bound)), (v) => v?.ok?.['zest-in'] === amt && v?.ok?.['zest-out'] === q.out && v?.ok?.unsold === 0n);
    const a1 = await bals(TAKER), p1 = await bals(ZPOOL);
    const sent = sell ? a0.sb - a1.sb : a0.us - a1.us, got = sell ? a1.us - a0.us : a1.sb - a0.sb;
    check(`${tag}: user sent exactly ${amt}, got exactly the quote; pool deltas mirror it`, sent === amt && got === q.out
      && (sell ? p1.sb - p0.sb === amt && p0.us - p1.us === q.out : p1.us - p0.us === amt && p0.sb - p1.sb === q.out), show({ sent, got }));
    if (r.res?.ok) limitChecks(`${tag} split`, sell, amt, q.out, L);
    await routerEmpty(`${tag} split`);
  }

  group('B partial Zest fill');
  // bins with liquidity left on the side a sale walks (USDCx bins up for sBTC sells, sBTC bins down for USDCx sells)
  const liveTicks = async (sell) => {
    const ts = sell ? upT : dnT;
    const bb = await evalIn(ZPOOL, `(map get-pool-balances (list ${ts.map(() => `u${ZID}`).join(' ')}) (list ${ts.join(' ')}))`);
    return ts.filter((t, i) => (sell ? bb[i]?.['balance-y'] : bb[i]?.['balance-x']) > 1000n);
  };
  for (const sell of [true, false]) {
    const tag = sell ? 'sBTC->USDCx' : 'USDCx->sBTC', L = sell ? Ls : Lu;
    const big = sell ? 2_000_000n : 1_500_000_000n;   // more than 2 bins hold
    const walk = async () => (await liveTicks(sell)).slice(0, 2);
    let ticks = await walk();
    const q = await zquote(sell, ticks, big);
    must(`${tag}: 2-tick walk ${ticks} fills only part of ${big} (${q.in})`, ticks.length === 2 && q.in > 0n && q.in < big, show(q));
    await tx(`${tag} partial, fallback none: zest-in = quote ${q.in}, shortfall unsold`, TAKER, RT, fnOf(sell),
      split(big, L, noneCV(), 0n, big, 0n, 0n, 0n, route(ticks, sell ? UMAX : 0n)), (v) => v?.ok?.['zest-in'] === q.in && v?.ok?.['zest-out'] === q.out && v?.ok?.unsold === big - q.in);
    ticks = await walk();
    const q2 = await zquote(sell, ticks, big);
    must(`${tag}: next 2 live ticks ${ticks} still fill part (${q2.in})`, ticks.length === 2 && q2.in > 0n && q2.in < big, show(q2));
    await tx(`${tag} partial, fallback DLMM: zest-in = quote ${q2.in}, shortfall re-sold on DLMM, unsold 0`, TAKER, RT, fnOf(sell),
      split(big, L, someCV(uintCV(1)), 0n, big, 0n, 0n, 1n, route(ticks, sell ? UMAX : 0n)), (v) => v?.ok?.['zest-in'] === q2.in && v?.ok?.['dlmm-in'] === big - q2.in && v?.ok?.unsold === 0n);
    ticks = await walk();
    const q3 = await zquote(sell, ticks, big);
    must(`${tag}: next 2 live ticks ${ticks} fill part (${q3.in})`, ticks.length === 2 && q3.in > 0n && q3.in < big, show(q3));
    // amm-mins.zest for the whole slice set so its rounded-up share for the filled part is out + 1
    const okMin = (q3.out * big) / q3.in;            // scaled share <= out: passes
    const tooHigh = ((q3.out + 1n) * big) / q3.in + 1n;  // scaled share >= out + 1: fails
    await tx(`${tag} partial, amm-mins.zest whose scaled share exceeds the fill -> u3002`, TAKER, RT, fnOf(sell),
      split(big, L, noneCV(), 0n, big, 0n, tooHigh, 0n, route(ticks, sell ? UMAX : 0n)), { err: 3002n });
    await tx(`${tag} partial, amm-mins.zest whose scaled share is at most the fill: ok`, TAKER, RT, fnOf(sell),
      split(big, L, noneCV(), 0n, big, 0n, okMin, 0n, route(ticks, sell ? UMAX : 0n)), (v) => v?.ok?.['zest-in'] === q3.in && v?.ok?.['zest-out'] === q3.out);
  }
  await routerEmpty('partial');

  group('B smart swaps fill Zest first');
  for (const sell of [true, false]) {
    const tag = sell ? 'sBTC->USDCx' : 'USDCx->sBTC', amt = sell ? 150_000n : 100_000_000n, L = sell ? mid * 99n / 100n : mid * 101n / 100n;
    const a0 = await bals(TAKER);
    const r = await tx(`smart ${tag}, limit 1% off mid: Zest stage fills`, TAKER, RT, smartOf(sell), [uintCV(amt), uintCV(L), noneCV(), uintCV(mid), uintCV(1)],
      (v) => v?.ok?.['zest-in'] > 0n && v?.ok?.['zest-in'] + v?.ok?.['dlmm-in'] + v?.ok?.unsold <= amt);
    const a1 = await bals(TAKER);
    const k = r.res?.ok;
    console.log(`  ${show(k)}`);
    if (k) {
      limitChecks(`smart ${tag}`, sell, k['zest-in'], k['zest-out'], L);
      const got = sell ? a1.us - a0.us : a1.sb - a0.sb;
      check(`smart ${tag}: user got exactly out`, got === k.out, `${got} vs ${k.out}`);
    }
    await tx(`smart ${tag}, limit 0 -> u3006`, TAKER, RT, smartOf(sell), [uintCV(amt), uintCV(0), noneCV(), uintCV(mid), uintCV(1)], { err: 3006n });
    await tx(`smart ${tag}, limit above ZEST_MAX_LIMIT: Zest skipped`, TAKER, RT, smartOf(sell), [uintCV(10_000n), uintCV(ZMAX + 1n), noneCV(), uintCV(mid), uintCV(0)], (v) => v?.ok?.['zest-in'] === 0n);
  }
  await routerEmpty('smart');
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(`EXC ${e.message}`); }
}
summary();
