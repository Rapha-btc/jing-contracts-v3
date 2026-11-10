// stxer mainnet-fork proof: swap-router-stx-usdcx-jing-v6 (v5-5 + Zest CLMM
// STX/USDCx pool 1 as a 4th AMM venue), keyless (no Jing leg, no Lazer update).
//   deploy ladder -> market (deployed only, never called: jing-amount = 0)
//   -> router v6, then on the live Zest pool:
//   - Zest-only legs both ways (native STX straight user <-> clmm-pool-v1)
//   - mixed DLMM + Zest legs both ways (one combined min-out)
//   - deny-mode post-conditions on the Zest leg (user STX eq, pool USDCx out)
//   - zest = 0 ignores the route, split mismatch u3004, fallback u4 -> u3003,
//     short walk u5001 (no partial fill), Zest min u5002, combined min u3002
// Ticks are read off the fork: x -> y walks the USDCx bins upward from the
// active tick, y -> x walks the STX bins downward (Zest's route order rule).
// Run: node simulations/verify-router-stx-usdcx-v6-zest.mjs
import { readFileSync } from 'node:fs';
import {
  uintCV, intCV, noneCV, someCV, tupleCV, listCV, Pc, PostConditionMode,
  makeUnsignedContractCall, deserializeCV, cvToString, trueCV, deserializeTransaction, addressToString,
} from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps, getNonce, setSender, getSimulationResult } from 'stxer';
import { NODE, DEP, WHALE, P_, mk, plain, note, S, retry, check, must, show, tx, evalIn, call, deploy, summary, Stop, stxTransfer } from './_yg-loop-common.js';

const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const USDC_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ';
const ZPOOL = 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-pool-v1';
const ZWSTX = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx';
const N = { ladder: 'jing-ladder-stx-usdcx-v1', market: 'markets-stx-usdcx-jing-v6-4', router: 'swap-router-stx-usdcx-jing-v6' };
const C = Object.fromEntries(Object.entries(N).map(([k, v]) => [k, `${DEP}.${v}`]));
const src = (f) => readFileSync(new URL(`../contracts/stx-usdcx/${f}.clar`, import.meta.url), 'utf8');
const UMAX = 340282366920938463463374607431768211455n;
const TAKER = mk(6);

const amm = (d = 0n, z = 0n, x = 0n, v = 0n) => tupleCV({ dlmm: uintCV(d), xyk: uintCV(x), velar: uintCV(v), zest: uintCV(z) });
const route = (ticks, price) => tupleCV({ ticks: listCV(ticks.map((t) => intCV(t))), price: uintCV(price) });
const usd = async (who) => (await evalIn(USDCX, `(get-balance '${who})`)).ok;
const stx = async (who) => evalIn(USDCX, `(stx-get-balance '${who})`);
const bals = async (who) => ({ st: await stx(who), us: await usd(who) });
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };
// FE-side quote: walk the same ticks with the pool's read-only per-bin quote
async function zquote(sellStx, ticks, amount) {
  let left = amount, out = 0n;
  for (const t of ticks) {
    if (left === 0n) break;
    const q = sellStx
      ? await evalIn(ZPOOL, `(quote-swap-x-for-y u1 ${t} u${left} u${UMAX})`)
      : await evalIn(ZPOOL, `(quote-swap-y-for-x u1 ${t} u${left} u0)`);
    left -= q.ok.in; out += q.ok.out;
  }
  return { out, left };
}
// deny-mode contract call with explicit post-conditions
async function denyCall(label, sender, fn, args, pcs, wantOk) {
  const [addr, name] = C.router.split('.');
  const raw = await makeUnsignedContractCall({ contractAddress: addr, contractName: name, functionName: fn, functionArgs: args, nonce: await retry(() => getNonce(S.sid, sender)), network: 'mainnet', publicKey: '', fee: 0, postConditionMode: PostConditionMode.Deny, postConditions: pcs });
  setSender(raw, sender);
  await retry(() => submitSimulationSteps(S.sid, { steps: [{ TenureExtend: { cause: 'Extended' } }] }));
  const out = await retry(() => submitSimulationSteps(S.sid, { steps: [{ Transaction: raw.serialize() }] }));
  const t = out.steps[0]?.Transaction?.Ok;
  const res = t?.result ? cvToString(deserializeCV(t.result)) : null;
  const ok = wantOk === false ? !!t && !!t.post_condition_aborted // expect a deny-mode abort
    : !!t && !t.vm_error && !t.post_condition_aborted && (wantOk ? res?.startsWith('(ok') : true);
  check(label, ok, JSON.stringify({ res, vm: t?.vm_error, pc: t?.post_condition_aborted }).slice(0, 400));
}

try {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(ZPOOL, '(get-pool-count)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);

  group('deploy');
  await deploy(DEP, N.ladder, src(N.ladder));
  await deploy(DEP, N.market, src(N.market));
  await deploy(DEP, N.router, src(N.router));

  group('Zest pool 1 on the fork');
  const pool = await evalIn(ZPOOL, '(get-pool u1)');
  check('pool 1 = Zest wstx (native-x) / usdcx, not paused', pool?.['token-x'] === ZWSTX && pool?.['token-y'] === USDCX && pool?.['native-x'] === true && pool?.['native-y'] === false && pool?.paused === false, show(pool));
  const scan = []; for (let t = -100; t <= 300; t++) scan.push(t);
  const bins = await evalIn(ZPOOL, `(map get-pool-balances (list ${scan.map(() => 'u1').join(' ')}) (list ${scan.join(' ')}))`);
  const live = scan.map((t, i) => ({ t, x: bins[i]?.['balance-x'] ?? 0n, y: bins[i]?.['balance-y'] ?? 0n }));
  const yTicks = live.filter((b) => b.y > 1000n).map((b) => b.t).slice(0, 32);           // ascending
  const xTicks = live.filter((b) => b.x > 1000n).map((b) => b.t).reverse().slice(0, 32); // descending
  must('found USDCx bins and STX bins', yTicks.length > 0 && xTicks.length > 0, show({ yTicks, xTicks }));
  console.log(`  x->y ticks ${yTicks.slice(0, 8).join(',')}..  y->x ticks ${xTicks.slice(0, 8).join(',')}..`);

  await stxTransfer(WHALE.y, TAKER, 2_000_000_000n);
  must('fund taker 200 USDCx', (await call(USDC_WHALE, USDCX, 'transfer', [uintCV(200_000_000n), P_(USDC_WHALE), P_(TAKER), noneCV()])).res?.ok === true);

  group('Zest-only legs');
  const sIn = 10_000_000n; // 10 STX
  const qs = await zquote(true, yTicks, sIn);
  must('quote fills 10 STX on Zest', qs.left === 0n && qs.out > 0n, show(qs));
  const a0 = await bals(TAKER), p0 = await bals(ZPOOL);
  const r0 = await tx('swap-stx-for-usdcx 10 STX all Zest, min = quote', TAKER, C.router, 'swap-stx-for-usdcx',
    [uintCV(sIn), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, sIn), amm(0n, qs.out), uintCV(qs.out), route(yTicks, UMAX)], (v) => v?.ok !== undefined);
  const a1 = await bals(TAKER), p1 = await bals(ZPOOL);
  console.log(`  ${show(r0.res?.ok)}; ${Number(a1.us - a0.us) / 1e6} USDCx for 10 STX`);
  check('user sent exactly 10 STX, got exactly the quote', a0.st - a1.st === sIn && a1.us - a0.us === qs.out, show({ st: a0.st - a1.st, us: a1.us - a0.us }));
  check('native STX landed on clmm-pool-v1, USDCx left it', p1.st - p0.st === sIn && p0.us - p1.us === qs.out, show({ st: p1.st - p0.st, us: p0.us - p1.us }));
  check('receipt zest-in/out, other legs 0', r0.res?.ok?.['zest-in'] === sIn && r0.res?.ok?.['zest-out'] === qs.out && r0.res?.ok?.['dlmm-in'] === 0n && r0.res?.ok?.out === qs.out, show(r0.res?.ok));

  const uIn = 3_000_000n; // 3 USDCx
  const qu = await zquote(false, xTicks, uIn);
  must('quote fills 3 USDCx on Zest', qu.left === 0n && qu.out > 0n, show(qu));
  const b0 = await bals(TAKER), q0 = await bals(ZPOOL);
  const r1 = await tx('swap-usdcx-for-stx 3 USDCx all Zest, min = quote', TAKER, C.router, 'swap-usdcx-for-stx',
    [uintCV(uIn), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, uIn), amm(0n, qu.out), uintCV(qu.out), route(xTicks, 0n)], (v) => v?.ok !== undefined);
  const b1 = await bals(TAKER), q1 = await bals(ZPOOL);
  console.log(`  ${show(r1.res?.ok)}; ${Number(b1.st - b0.st) / 1e6} STX for 3 USDCx`);
  check('user paid exactly 3 USDCx, got exactly the quote in native STX', b0.us - b1.us === uIn && b1.st - b0.st === qu.out, show({ us: b0.us - b1.us, st: b1.st - b0.st }));
  check('pool paid native STX, took USDCx', q0.st - q1.st === qu.out && q1.us - q0.us === uIn);

  group('mixed DLMM + Zest');
  const m0 = await bals(TAKER);
  const qm = await zquote(true, yTicks, sIn);
  const r2 = await tx('swap-stx-for-usdcx 20 STX = dlmm 10 + zest 10', TAKER, C.router, 'swap-stx-for-usdcx',
    [uintCV(2n * sIn), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(sIn, sIn), amm(1n, qm.out), uintCV(qm.out * 2n * 97n / 100n), route(yTicks, UMAX)], (v) => v?.ok !== undefined);
  const m1 = await bals(TAKER), k = r2.res?.ok;
  console.log(`  ${show(k)}`);
  check('20 STX in; out = dlmm-out + zest-out = user gain', m0.st - m1.st === 2n * sIn && k?.out === k?.['dlmm-out'] + k?.['zest-out'] && k?.out === m1.us - m0.us && k?.['dlmm-in'] === sIn && k?.['zest-in'] === sIn && k?.['zest-out'] === qm.out, show(k));
  const qm2 = await zquote(false, xTicks, uIn);
  const r3 = await tx('swap-usdcx-for-stx 6 USDCx = dlmm 3 + zest 3', TAKER, C.router, 'swap-usdcx-for-stx',
    [uintCV(2n * uIn), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(uIn, uIn), amm(1n, qm2.out), uintCV(qm2.out * 2n * 97n / 100n), route(xTicks, 0n)], (v) => v?.ok !== undefined);
  const m2 = await bals(TAKER), k2 = r3.res?.ok;
  console.log(`  ${show(k2)}`);
  check('6 USDCx in; out = dlmm-out + zest-out = user STX gain', m1.us - m2.us === 2n * uIn && k2?.out === k2?.['dlmm-out'] + k2?.['zest-out'] && k2?.out === m2.st - m1.st && k2?.['zest-out'] === qm2.out, show(k2));

  group('post-conditions (deny mode)');
  const qp = await zquote(true, yTicks, sIn);
  await denyCall('deny mode: user sends eq 10 STX, clmm-pool-v1 sends >= quote USDCx', TAKER, 'swap-stx-for-usdcx',
    [uintCV(sIn), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, sIn), amm(0n, qp.out), uintCV(qp.out), route(yTicks, UMAX)],
    [Pc.principal(TAKER).willSendEq(sIn).ustx(), Pc.principal(ZPOOL).willSendGte(qp.out).ft(USDCX, 'usdcx-token')], true);
  const qp2 = await zquote(false, xTicks, uIn);
  await denyCall('deny mode: user sends eq 3 USDCx, clmm-pool-v1 sends >= quote STX', TAKER, 'swap-usdcx-for-stx',
    [uintCV(uIn), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, uIn), amm(0n, qp2.out), uintCV(qp2.out), route(xTicks, 0n)],
    [Pc.principal(TAKER).willSendEq(uIn).ft(USDCX, 'usdcx-token'), Pc.principal(ZPOOL).willSendGte(qp2.out).ustx()], true);

  group('guards');
  await tx('zest = 0: bad route (non-monotonic ticks) ignored, DLMM-only ok', TAKER, C.router, 'swap-stx-for-usdcx',
    [uintCV(2_000_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(2_000_000n), amm(1n), uintCV(1), route([5, 3, 5], 0n)], (v) => v?.ok?.['zest-in'] === 0n && v?.ok?.['dlmm-in'] === 2_000_000n);
  await tx('split mismatch with zest (amount 3 = dlmm 1 + zest 1) -> u3004', TAKER, C.router, 'swap-stx-for-usdcx',
    [uintCV(3_000_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(1_000_000n, 1_000_000n), amm(1n, 1n), uintCV(0), route(yTicks, UMAX)], { err: 3004n });
  await tx('fallback = u4 (Zest) -> u3003', TAKER, C.router, 'swap-stx-for-usdcx',
    [uintCV(1_000_000n), uintCV(0), uintCV(1), noneCV(), someCV(uintCV(4)), amm(0n, 1_000_000n), amm(0n, 1n), uintCV(0), route(yTicks, UMAX)], { err: 3003n });
  const one = yTicks[0], depth = live.find((b) => b.t === one).y;
  const big = (depth * 10n ** 18n / 300_000_000_000_000_000n) * 3n; // ~3x the first bin's USDCx, in uSTX
  await tx(`walk too short (1 tick, ${big} uSTX) -> u5001, no partial fill`, TAKER, C.router, 'swap-stx-for-usdcx',
    [uintCV(big), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, big), amm(0n, 1n), uintCV(0), route([one], UMAX)], { err: 5001n });
  const qg = await zquote(true, yTicks, 1_000_000n);
  await tx('zest min above quote -> u5002 (Zest slippage)', TAKER, C.router, 'swap-stx-for-usdcx',
    [uintCV(1_000_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, 1_000_000n), amm(0n, qg.out + 1n), uintCV(0), route(yTicks, UMAX)], { err: 5002n });
  await tx('combined min above quote -> u3002', TAKER, C.router, 'swap-stx-for-usdcx',
    [uintCV(1_000_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, 1_000_000n), amm(0n, 1n), uintCV(qg.out + 1n), route(yTicks, UMAX)], { err: 3002n });
  await tx('Zest token-y side: y->x ticks given ascending -> Zest route error', TAKER, C.router, 'swap-usdcx-for-stx',
    [uintCV(1_000_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, 1_000_000n), amm(0n, 1n), uintCV(0), route([...xTicks].reverse(), 0n)], (v) => v?.err !== undefined);

  // ---- smart swaps: Jing (keyless: update = none -> jing-size 0) -> Zest -> DLMM -> cp
  group('smart swaps: Zest stage');
  must('fund taker 300 more USDCx', (await call(USDC_WHALE, USDCX, 'transfer', [uintCV(300_000_000n), P_(USDC_WHALE), P_(TAKER), noneCV()])).res?.ok === true);
  const WADP = 10n ** 26n, F1 = 100_000_000n;
  const zfee = (await evalIn(ZPOOL, `(get-fee-rates u1 '${TAKER})`)).ok['fee-rate-x'];
  const price = async (t) => (await evalIn(ZPOOL, `(get-bin-price u1 ${t})`)).ok;
  // live highest tick holding real STX (> 1 STX): the y->x marginal bin
  const topX = async () => { const sc = []; for (let t = 105; t <= 130; t++) sc.push(t);
    const bb = await evalIn(ZPOOL, `(map get-pool-balances (list ${sc.map(() => 'u1').join(' ')}) (list ${sc.join(' ')}))`);
    return sc.filter((t, i) => (bb[i]?.['balance-x'] ?? 0n) > 1_000_000n).pop(); };
  const pY = await price(yTicks[0]);            // marginal x->y price (raw STX per raw USDCx, WAD)
  const pX = await price(xTicks[0]);            // marginal y->x price
  const mid = WADP / pY;                        // router units: USDCx per STX * 1e8
  console.log(`  fee ${zfee}, pY ${pY} pX ${pX}, mid ${mid}`);
  const smartPrint = (rc, topic) => (rc?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.contract_event).map((e) => { try { return plain(deserializeCV(e.contract_event.raw_value)); } catch { return null; } })
    .find((p) => p?.topic === topic);
  // per-stage limit: out >= (in - 2) * limit (sell STX) / (in - 2) / limit (sell USDCx), the router's limit-min
  const atLimit = (sell, i, o, L) => i <= 2n || (sell ? o >= ((i - 2n) * L) / 100_000_000n : o >= ((i - 2n) * 100_000_000n) / L);
  async function smart(label, sell, amount, limit, minOut, want) {
    const fn = sell ? 'smart-swap-stx-for-usdcx' : 'smart-swap-usdcx-for-stx';
    const u0 = await bals(TAKER), z0 = await bals(ZPOOL);
    const r = await call(TAKER, C.router, fn, [uintCV(amount), uintCV(limit), noneCV(), uintCV(mid), uintCV(minOut)]);
    const u1 = await bals(TAKER), z1 = await bals(ZPOOL), k = r.res?.ok, pr = smartPrint(r.receipt, fn);
    console.log(`  ${label}: ${show(k)} zest-ticks ${pr?.['zest-ticks']} zest-ok ${pr?.['zest-ok']}`);
    if (!check(`${label}: ok`, !r.vm && !!k, show(r.vm ?? r.res))) return null;
    const spent = sell ? u0.st - u1.st : u0.us - u1.us, gained = sell ? u1.us - u0.us : u1.st - u0.st;
    const zIn = sell ? z1.st - z0.st : z1.us - z0.us, zOut = sell ? z0.us - z1.us : z0.st - z1.st;
    check(`${label}: out == balance gain, in == jing+zest+dlmm+cp, unsold == amount - in`,
      k.out === gained && k.out === k['jing-out'] + k['zest-out'] + k['dlmm-out'] + k['xyk-out'] + k['velar-out']
      && spent === k['jing-in'] + k['zest-in'] + k['dlmm-in'] + k['xyk-in'] + k['velar-in'] && k.unsold === amount - spent,
      show({ spent, gained, k }));
    check(`${label}: Zest pool moved exactly zest-in / zest-out; print matches receipt`,
      zIn === k['zest-in'] && zOut === k['zest-out'] && pr?.['zest-in'] === k['zest-in'] && pr?.['zest-out'] === k['zest-out'] && pr?.unsold === k.unsold,
      show({ zIn, zOut, pr }));
    check(`${label}: Zest and DLMM legs each at or better than limit`,
      atLimit(sell, k['zest-in'], k['zest-out'], limit) && atLimit(sell, k['dlmm-in'], k['dlmm-out'], limit),
      show({ zr: k['zest-in'] ? Number(k['zest-out']) / Number(k['zest-in']) : 0, dr: k['dlmm-in'] ? Number(k['dlmm-out']) / Number(k['dlmm-in']) : 0, limit }));
    if (want) check(`${label}: ${want.name}`, want(k, pr), show({ k, dlmmCap: pr?.['dlmm-cap'] }));
    return k;
  }
  const zestAll = function zestTakesAll(k, pr) { return k['zest-in'] === k['jing-in'] + k['zest-in'] && k['dlmm-in'] === 0n && k.unsold === 0n && pr['zest-ok'] === true && pr['zest-ticks'] > 0n && pr['zest-ticks'] <= 32n; };
  const noTicks = function noTicksZestSkipped(k, pr) { return pr['zest-ticks'] === 0n && k['zest-in'] === 0n && pr['zest-ok'] === false; };

  // 1/2: loose limits (5% through mid): Zest fills the whole remainder
  await smart('smart STX->USDCx 10 STX, limit mid*0.95: Zest fills all', true, 10_000_000n, mid * 95n / 100n, 1n, zestAll);
  await smart('smart USDCx->STX 3 USDCx, limit mid*1.05: Zest fills all', false, 3_000_000n, mid * 105n / 100n, 1n, zestAll);
  // tight limit count: walk only reaches a few ticks
  // limit 50% past mid: no ticks at all, Zest skipped, everything unsold (min-out 0)
  await smart('smart STX->USDCx 5 STX, limit mid*1.5: no ticks, Zest skipped', true, 5_000_000n, mid * 3n / 2n, 0n, noTicks);
  await smart('smart USDCx->STX 2 USDCx, limit mid/1.5: no ticks, Zest skipped', false, 2_000_000n, mid * 2n / 3n, 0n, noTicks);
  // combined min-out still binds
  await tx('smart STX->USDCx min-out above fill -> u3002', TAKER, C.router, 'smart-swap-stx-for-usdcx',
    [uintCV(1_000_000n), uintCV(mid * 95n / 100n), noneCV(), uintCV(mid), uintCV(10n ** 12n)], { err: 3002n });


  // ---- limits pinned to live DLMM prices (read on the fork at run time) ----
  group('smart swaps: limits pinned to live DLMM');
  const ZROUTER = 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-router-v1';
  const DLMM_CORE = 'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1';
  const DPOOLS = ['bps-10', 'bps-4', 'bps-1'].map((b) => `SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-usdcx-v-1-${b}`);
  // DLMM net price per eligible pool (depth >= 1% of the deepest, as dlmm-pick); worst one so any pick has capacity
  //   sell STX: active-bin price * (1 - fee) = USDCx per STX received; buy STX: price / (1 - fee) = USDCx per STX paid
  async function dlmmNet(sell) {
    const ps = [];
    for (const P of DPOOLS) {
      const i = (await evalIn(P, '(get-pool)')).ok;
      const p = (await evalIn(DLMM_CORE, `(get-bin-price u${i['initial-price']} u${i['bin-step']} ${i['active-bin-id']})`)).ok;
      const fee = sell ? i['x-protocol-fee'] + i['x-provider-fee'] + i['x-variable-fee'] : i['y-protocol-fee'] + i['y-provider-fee'] + i['y-variable-fee'];
      ps.push({ P, p, fee, depth: sell ? await usd(P) : await stx(P) });
    }
    const mx = ps.reduce((m, x) => (x.depth > m ? x.depth : m), 0n);
    const v = ps.filter((x) => x.depth > 0n && x.depth >= mx / 100n)
      .map((x) => (sell ? (x.p * (10000n - x.fee)) / 10000n : (x.p * 10000n + 9999n - x.fee) / (10000n - x.fee)));
    console.log(`  DLMM ${sell ? 'bid' : 'ask'} per pool: ${show(ps.map((x) => ({ p: x.p, fee: x.fee, depth: x.depth })))}`);
    return sell ? v.reduce((a, b) => (b < a ? b : a)) : v.reduce((a, b) => (b > a ? b : a));
  }
  // live Zest bins: x->y walks the USDCx bins up, y->x the STX bins down
  async function zLive() {
    const sc = []; for (let t = 60; t <= 180; t++) sc.push(t);
    const bb = await evalIn(ZPOOL, `(map get-pool-balances (list ${sc.map(() => 'u1').join(' ')}) (list ${sc.join(' ')}))`);
    const l = sc.map((t, i) => ({ t, x: bb[i]?.['balance-x'] ?? 0n, y: bb[i]?.['balance-y'] ?? 0n }));
    return { yT: l.filter((b) => b.y > 1000n).map((b) => b.t).slice(0, 32), xT: l.filter((b) => b.x > 1000n).map((b) => b.t).reverse().slice(0, 32) };
  }
  // the contract's own bound: max-price (x->y) / min-price (y->x) for router limit L
  const boundFor = (sell, L) => (sell ? (WADP * (F1 - zfee)) / L / F1 : ((WADP * F1 + L - 1n) / L + (F1 - zfee - 1n)) / (F1 - zfee));
  async function zq(sell, amount, bound) {
    const { yT, xT } = await zLive();
    let left = amount, out = 0n;
    for (const t of sell ? yT : xT) {
      if (left === 0n) break;
      const q = (await evalIn(ZPOOL, sell ? `(quote-swap-x-for-y u1 ${t} u${left} u${bound})` : `(quote-swap-y-for-x u1 ${t} u${left} u${bound})`)).ok;
      left -= q.in; out += q.out;
    }
    return { in: amount - left, out, ticks: sell ? yT : xT };
  }
  // Zest marginal net price in router units from a small quote
  async function zNet(sell) {
    const q = await zq(sell, sell ? 1_000_000n : 300_000n, sell ? UMAX : 0n);
    return sell ? (q.out * 100_000_000n) / q.in : (q.in * 100_000_000n + q.out - 1n) / q.out;
  }
  // push Zest's price just past a target net price (whale trades Zest directly, partial fill at the bound)
  async function drain(sell, target) {
    const { yT, xT } = await zLive();
    return sell
      ? call(WHALE.y, ZROUTER, 'swap-x-for-y', [P_(ZWSTX), P_(USDCX), uintCV(1), uintCV(300_000_000_000n), uintCV(boundFor(true, target)), listCV(yT.map((t) => intCV(t))), uintCV(0), trueCV(), uintCV(2n ** 63n)])
      : call(USDC_WHALE, ZROUTER, 'swap-y-for-x', [P_(ZWSTX), P_(USDCX), uintCV(1), uintCV(20_000_000_000n), uintCV(boundFor(false, target)), listCV(xT.map((t) => intCV(t))), uintCV(0), trueCV(), uintCV(2n ** 63n)]);
  }
  await stxTransfer(WHALE.y, TAKER, 600_000_000_000n); // 600k STX: pinned cases + worst-case cost runs
  // tight limit = few ticks: 0.3% inside Zest's live net price -> window tick(mid)-2 .. tick(max-price)+1 stays short
  const zt = await zNet(true);
  await smart(`smart STX->USDCx 1 STX, limit ${zt * 997n / 1000n} (0.3% inside live Zest): few ticks`, true, 1_000_000n, (zt * 997n) / 1000n, 0n,
    function fewTicksAndFills(k, pr) { return pr['zest-ticks'] > 0n && pr['zest-ticks'] <= 6n && k['zest-in'] > 0n; });
  for (const sell of [true, false]) {
    const tag = sell ? 'STX->USDCx' : 'USDCx->STX';
    const d = await dlmmNet(sell);
    const tgt = sell ? (d * 9960n) / 10000n : (d * 10040n) / 10000n;
    let z = await zNet(sell);
    console.log(`  ${tag}: DLMM net ${d}, Zest net ${z}, target Zest ${tgt}`);
    if (sell ? z > tgt : z < tgt) {
      const r = await drain(sell, tgt);
      check(`${tag}: whale pushes Zest past DLMM (direct Zest trade)`, r.res?.ok !== undefined, show(r.vm ?? r.res));
      z = await zNet(sell);
    } else note(`${tag}: Zest already behind DLMM, no drain`);
    must(`${tag}: Zest net ${z} now behind DLMM net ${d} by >= 0.35%`, sell ? z <= (d * 9965n) / 10000n : z >= (d * 10035n) / 10000n);
    // B: limit between Zest and DLMM -> Zest 0, DLMM takes all
    const LB = sell ? (d * 9970n) / 10000n : (d * 10030n) / 10000n;
    const amtB = sell ? 20_000_000n : 5_000_000n;
    await smart(`smart ${tag} limit ${LB} (inside DLMM, past Zest): Zest 0, DLMM takes all`, sell, amtB, LB, 1n,
      function zestZeroDlmmAll(k) { return k['zest-out'] <= 10n && k['dlmm-in'] > 0n && k.unsold === 0n && k['zest-in'] + k['dlmm-in'] === amtB; });
    // A: limit just inside Zest's own price (so also inside DLMM) -> Zest fills its slice, DLMM the rest
    const z2 = await zNet(sell);
    const LA = sell ? (z2 * 9995n) / 10000n : (z2 * 10005n) / 10000n;
    const cap = await zq(sell, sell ? 100_000_000_000n : 30_000_000_000n, boundFor(sell, LA));
    must(`${tag}: Zest has a slice inside limit ${LA} (quote ${cap.in} in)`, cap.in > 0n);
    const amtA = cap.in + (sell ? 20_000_000n : 5_000_000n);
    await smart(`smart ${tag} ${amtA} at limit ${LA}: Zest fills part, DLMM takes the rest`, sell, amtA, LA, 1n,
      function zestPartDlmmRest(k, pr) { return k['zest-in'] > 0n && k['zest-in'] < amtA && k['dlmm-in'] > 0n && pr['zest-ok'] === true; });
  }

  group('cost: worst cases (32 Zest ticks + DLMM walk)');
  const W = {};
  W.smartX = await smart('worst smart STX->USDCx 400k STX, limit mid/2', true, 400_000_000_000n, mid / 2n, 1n,
    function walks32ticksAndDlmm(k, pr) { return pr['zest-ticks'] === 32n && k['zest-in'] > 0n && k['dlmm-in'] > 0n; });
  // Zest now holds the STX just sold into it, so size past its STX bins: all USDCx but a reserve for the split runs
  const uWorst = (await usd(TAKER)) - 12_000_000_000n;
  must(`taker has USDCx for the worst y->x smart swap (${uWorst})`, uWorst > 50_000_000_000n);
  W.smartY = await smart(`worst smart USDCx->STX ${uWorst} uUSDCx, limit mid*2`, false, uWorst, mid * 2n, 1n,
    function walks32ticksAndDlmm(k, pr) { return pr['zest-ticks'] === 32n && k['zest-in'] > 0n && k['dlmm-in'] > 0n; });
  for (const sell of [true, false]) {
    const dl = sell ? 50_000_000_000n : 10_000_000_000n;
    const have = sell ? await stx(TAKER) : await usd(TAKER);
    must(`taker can fund worst split ${sell ? 'x->y' : 'y->x'} (has ${have})`, have > dl + 10_000_000n);
    const zl = await zq(sell, have - dl - 10_000_000n, sell ? UMAX : 0n);
    note(`worst split ${sell ? 'x->y' : 'y->x'}: zest leg ${zl.in} over ${zl.ticks.length} ticks, dlmm leg ${dl}`);
    await tx(`worst split ${sell ? 'STX->USDCx' : 'USDCx->STX'}: zest leg over ${zl.ticks.length} ticks + DLMM ${dl}`, TAKER, C.router,
      sell ? 'swap-stx-for-usdcx' : 'swap-usdcx-for-stx',
      [uintCV(zl.in + dl), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(dl, zl.in), amm(1n, 1n), uintCV(1), route(zl.ticks, sell ? UMAX : 0n)],
      (v) => v?.ok?.['zest-in'] === zl.in && v?.ok?.['dlmm-in'] === dl);
  }

  group('smart swaps: deny-mode post-conditions');
  await denyCall('deny: smart STX->USDCx 10 STX all Zest, user sends eq 10 STX, clmm-pool-v1 sends >= 1 USDCx', TAKER, 'smart-swap-stx-for-usdcx',
    [uintCV(sIn), uintCV(mid * 95n / 100n), noneCV(), uintCV(mid), uintCV(1)],
    [Pc.principal(TAKER).willSendEq(sIn).ustx(), Pc.principal(ZPOOL).willSendGte(1n).ft(USDCX, 'usdcx-token')], true);
  await denyCall('deny: smart USDCx->STX 3 USDCx all Zest, user sends eq 3 USDCx, clmm-pool-v1 sends >= 1 uSTX', TAKER, 'smart-swap-usdcx-for-stx',
    [uintCV(uIn), uintCV(mid * 105n / 100n), noneCV(), uintCV(mid), uintCV(1)],
    [Pc.principal(TAKER).willSendEq(uIn).ft(USDCX, 'usdcx-token'), Pc.principal(ZPOOL).willSendGte(1n).ustx()], true);
  await denyCall('deny: smart STX->USDCx without the Zest pool PC aborts', TAKER, 'smart-swap-stx-for-usdcx',
    [uintCV(sIn), uintCV(mid * 95n / 100n), noneCV(), uintCV(mid), uintCV(1)],
    [Pc.principal(TAKER).willSendEq(sIn).ustx()], false);
  check('router holds nothing', show(await bals(C.router)) === show({ st: 0n, us: 0n }), show(await bals(C.router)));

  group('cost table');
  const LIM = { runtime: 5_000_000_000, read_count: 15_000, read_length: 100_000_000, write_count: 15_000, write_length: 15_000_000 };
  const res = await retry(() => getSimulationResult(S.sid));
  const rows = [];
  for (const st of res.steps) {
    const ok = st.Result?.Transaction?.Ok; if (!ok?.execution_cost || !st.Transaction) continue;
    let t; try { t = deserializeTransaction(st.Transaction); } catch { continue; }
    const pl = t.payload; if (!pl.functionName || `${addressToString(pl.contractAddress)}.${pl.contractName.content}` !== C.router) continue;
    const r = (() => { try { return cvToString(deserializeCV(ok.result)).slice(0, 4); } catch { return '?'; } })();
    rows.push({ fn: pl.functionName.content, amount: BigInt(pl.functionArgs[0].value), r, c: ok.execution_cost });
  }
  const pct = (c, k) => ((100 * Number(c[k])) / LIM[k]).toFixed(2) + '%';
  console.log('  fn                          amount            res   runtime          read_count     read_length      write_count   write_length');
  for (const x of rows) console.log(`  ${x.fn.padEnd(27)} ${String(x.amount).padStart(15)}  ${x.r.padEnd(5)} ${Object.keys(LIM).map((k) => `${String(x.c[k]).padStart(9)} ${pct(x.c, k).padStart(6)}`).join('  ')}`);
  const worst = rows.filter((x) => x.r === '(ok ' && x.amount >= 10_000_000_000n);
  check('worst cases found in the cost table (2 smart + 2 split)', worst.length === 4, show(worst.map((x) => [x.fn, x.amount])));
  for (const x of worst) check(`${x.fn} ${x.amount}: every dimension < 50% of the block limit`, Object.keys(LIM).every((k) => Number(x.c[k]) < LIM[k] * 0.5), Object.keys(LIM).map((k) => `${k} ${pct(x.c, k)}`).join(', '));
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(`crash: ${e.message}`); }
}
summary();
