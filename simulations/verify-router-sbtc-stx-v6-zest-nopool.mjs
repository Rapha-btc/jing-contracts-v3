// stxer mainnet-fork proof: swap-router-sbtc-stx-jing-v6 deployed BEFORE Zest
// pool u3 exists (mainnet clmm-pool-v1 has 2 pools today), keyless (no Jing leg,
// no Lazer update). Companion of verify-router-sbtc-stx-v6-zest.mjs, which
// creates pool 3 first; this one never does.
//   - first step is a harmless read; get-pool-count = 2, get-pool u3 = none
//   - router deployed from the repo bytes as-is (no patch)
//   - Zest calls on pool 3 err (caught), they do not abort the tx
//   - smart swaps both ways: ok, zest 0, print zest-ok false / zest-ticks 0,
//     DLMM (+ cp) fills the amount, router holds 0; deny mode without any
//     clmm-pool-v1 PC passes
//   - split swaps both ways: zest > 0 + non-empty ticks -> ok, zest leg 0,
//     slice unsold (fallback none) or to DLMM (fallback u1); zest u0 + empty
//     list = DLMM-only; amm-mins.zest > 0 scales to 0 (no u3002)
// Price units: router limit = uSTX per sat x 1e10; Zest WAD = limit x 1e8;
// DLMM bin price = sats per uSTX x 1e8 (limit = 1e18 / p).
// Run: ROUTER_AS=swap-router-sbtc-stx-jing-v6-sim node simulations/verify-router-sbtc-stx-v6-zest-nopool.mjs
import { readFileSync } from 'node:fs';
import {
  uintCV, intCV, noneCV, someCV, tupleCV, listCV, Pc, PostConditionMode,
  makeUnsignedContractCall, deserializeCV, cvToString, trueCV,
} from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps, getNonce, setSender, getSimulationResult } from 'stxer';
import { NODE, DEP, WHALE, P_, mk, plain, note, S, retry, check, must, show, evalIn, call, deploy, summary, Stop, stxTransfer, sbtcTransfer, SBTC } from './_yg-loop-common.js';

const ZPOOL = 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-pool-v1';
const ZROUTER = 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-router-v1';
const ZWSTX = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx';
const ZID = 3;
const DLMM_CORE = 'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1';
const DPOOLS = [1, 2, 3].map((n) => `SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-${n}-bps-15`);
const N = { router: 'swap-router-sbtc-stx-jing-v6' };
// v6 is live on mainnet under N.router: ROUTER_AS deploys the repo bytes under another name
const AS = process.env.ROUTER_AS || N.router;
const C = { router: `${DEP}.${AS}` };
const src = (f) => readFileSync(new URL(`../contracts/sbtc-stx/${f}.clar`, import.meta.url), 'utf8');
const UMAX = 340282366920938463463374607431768211455n;
const L2W = 100_000_000n, PS = 10_000_000_000n;
const TAKER = mk(6);
const SBTC_ASSET = 'sbtc-token';

const amm = (d = 0n, z = 0n, x = 0n, v = 0n) => tupleCV({ dlmm: uintCV(d), xyk: uintCV(x), velar: uintCV(v), zest: uintCV(z) });
const route = (ticks, price) => tupleCV({ ticks: listCV(ticks.map((t) => intCV(t))), price: uintCV(price) });
const sb = async (who) => (await evalIn(SBTC, `(get-balance '${who})`)).ok;
const stx = async (who) => evalIn(SBTC, `(stx-get-balance '${who})`);
const bals = async (who) => ({ st: await stx(who), sb: await sb(who) });
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };
const routerEmpty = async (label) => { const rb = await bals(C.router); return check(`${label}: router holds 0 STX / 0 sBTC`, rb.st === 0n && rb.sb === 0n, show(rb)); };
const parenDepth = (code) => { let d = 0; for (const l of code.split('\n')) { let q = false; for (const ch of l) { if (q) { if (ch === '"') q = false; continue; } if (ch === '"') { q = true; continue; } if (ch === ';') break; if (ch === '(') d++; else if (ch === ')') d--; } } return d; };
// deny-mode contract call with explicit post-conditions
async function denyCall(label, sender, fn, args, pcs) {
  const [addr, name] = C.router.split('.');
  const raw = await makeUnsignedContractCall({ contractAddress: addr, contractName: name, functionName: fn, functionArgs: args, nonce: await retry(() => getNonce(S.sid, sender)), network: 'mainnet', publicKey: '', fee: 0, postConditionMode: PostConditionMode.Deny, postConditions: pcs });
  setSender(raw, sender);
  await retry(() => submitSimulationSteps(S.sid, { steps: [{ TenureExtend: { cause: 'Extended' } }] }));
  const out = await retry(() => submitSimulationSteps(S.sid, { steps: [{ Transaction: raw.serialize() }] }));
  const t = out.steps[0]?.Transaction?.Ok;
  const res = t?.result ? cvToString(deserializeCV(t.result)) : null;
  check(label, !!t && !t.vm_error && !t.post_condition_aborted && res?.startsWith('(ok'), JSON.stringify({ res, vm: t?.vm_error, pc: t?.post_condition_aborted }).slice(0, 400));
  return t?.result ? plain(deserializeCV(t.result))?.ok : undefined;
}
const smartPrint = (rc, topic) => (rc?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e)
  .filter((e) => e.contract_event).map((e) => { try { return plain(deserializeCV(e.contract_event.raw_value)); } catch { return null; } })
  .find((p) => p?.topic === topic);

try {
  // ---- first step: harmless read (no state change)
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(ZPOOL, '(get-pool-count)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);

  group('Zest pool 3 absent');
  const r0 = await retry(() => getSimulationResult(S.sid));
  const ev0 = r0.steps?.[0]?.Result?.Eval;
  const first = ev0 && 'Ok' in ev0 ? cvToString(deserializeCV(ev0.Ok)) : JSON.stringify(ev0);
  must('first step (read-only get-pool-count) = u2', first === 'u2', first);
  must('get-pool-count = 2', (await evalIn(ZPOOL, '(get-pool-count)')) === 2n);
  const p3 = await evalIn(ZPOOL, `(get-pool u${ZID})`);
  must('get-pool u3 = none', p3 === null, show(p3));
  check('pool-id-by-token {wstx, sbtc, 100} = none', (await evalIn(ZPOOL, `(get-pool-id { token-x: '${ZWSTX}, token-y: '${SBTC}, bin-step: u100 })`)) === null);
  const fr = await evalIn(ZPOOL, `(get-fee-rates u${ZID} '${TAKER})`);
  check('get-fee-rates u3 returns (err ...), not a panic (router zest-stage-pool matches it)', fr?.err !== undefined, show(fr));
  console.log(`  get-fee-rates u3 -> ${show(fr)}`);

  group('deploy');
  const rsrc = src(N.router);
  must('repo router source is paren-balanced', parenDepth(rsrc) === 0, `depth ${parenDepth(rsrc)}`);
  await deploy(DEP, AS, rsrc);
  check('ZEST_POOL_ID = u3', (await evalIn(C.router, 'ZEST_POOL_ID')) === 3n);

  group('mid + ticks');
  const ps = [];
  for (const P of DPOOLS) {
    const i = (await evalIn(P, '(get-pool)')).ok;
    const p = (await evalIn(DLMM_CORE, `(get-bin-price u${i['initial-price']} u${i['bin-step']} ${i['active-bin-id']})`)).ok;
    ps.push({ P, p, depthStx: await stx(P) });
  }
  const deep = ps.reduce((m, x) => (x.depthStx > m.depthStx ? x : m));
  const mid = PS * 100_000_000n / deep.p;
  const midwad = mid * L2W;
  must('DLMM mid sane (500..5000 uSTX/sat)', midwad > 5n * 10n ** 20n && midwad < 5n * 10n ** 21n, `${midwad}`);
  const tm = Number(await evalIn(C.router, `(zest-tick u${midwad})`));
  console.log(`  mid ${mid} (${Number(mid) / 1e10} uSTX/sat), tick(mid) ${tm}`);
  // the lists a FE would send if it assumed pool 3 had a band around the mid
  const sT = Array.from({ length: 8 }, (_, i) => tm - 1 - i);   // selling sBTC: descending
  const uT = Array.from({ length: 8 }, (_, i) => tm + 1 + i);   // selling STX: ascending
  const zr = await evalIn(C.router, `(list (len (zest-ticks u${midwad} (zest-bound u${mid} u1000000 true) false)) (len (zest-ticks u${midwad} (zest-bound u${mid} u1000000 false) true)))`);
  check('router zest-ticks still builds a non-empty walk at mid (pool absence is only seen by the pool call)', zr[0] > 0n && zr[1] > 0n, show(zr));

  await stxTransfer(WHALE.y, TAKER, 350_000_000_000n);
  await sbtcTransfer(WHALE.x, TAKER, 250_000_000n);

  group('direct Zest calls on pool 3');
  for (const sell of [true, false]) {
    const d = await call(TAKER, ZROUTER, sell ? 'swap-y-for-x' : 'swap-x-for-y',
      [P_(ZWSTX), P_(SBTC), uintCV(ZID), uintCV(sell ? 10_000n : 10_000_000n), uintCV(sell ? 0n : UMAX), listCV((sell ? sT : uT).map((t) => intCV(t))), uintCV(0), trueCV(), uintCV(2n ** 63n)]);
    console.log(`  ${sell ? 'swap-y-for-x' : 'swap-x-for-y'} u3 -> ${show(d.res ?? d.vm)}`);
    check(`clmm-router ${sell ? 'swap-y-for-x' : 'swap-x-for-y'} on pool 3 returns (err ...) (no VM abort), so the router's match catches it`, !d.vm && d.res?.err !== undefined, show(d.res ?? d.vm));
  }

  // ---- smart swaps: Jing (keyless -> 0) -> Zest (pool absent -> 0) -> DLMM -> cp
  group('smart swaps: Zest stage skipped');
  async function smart(label, sell, amount, limit, minOut) {
    const fn = sell ? 'smart-swap-sbtc-for-stx' : 'smart-swap-stx-for-sbtc';
    const u0 = await bals(TAKER), q0 = await bals(ZPOOL);
    const r = await call(TAKER, C.router, fn, [uintCV(amount), uintCV(limit), noneCV(), uintCV(mid), uintCV(minOut)]);
    const u1 = await bals(TAKER), q1 = await bals(ZPOOL), kk = r.res?.ok, pr = smartPrint(r.receipt, fn);
    console.log(`  ${label}: ${show(kk ?? r.vm ?? r.res)} zest-ok ${pr?.['zest-ok']} zest-ticks ${pr?.['zest-ticks']}`);
    if (!check(`${label}: (ok ...)`, !r.vm && !!kk, show(r.vm ?? r.res))) return null;
    const spent = sell ? u0.sb - u1.sb : u0.st - u1.st, gained = sell ? u1.st - u0.st : u1.sb - u0.sb;
    check(`${label}: zest-in = zest-out = 0; print zest-ok false, zest-ticks 0, zest-in/out 0`,
      kk['zest-in'] === 0n && kk['zest-out'] === 0n && pr?.['zest-ok'] === false && pr?.['zest-ticks'] === 0n && pr?.['zest-in'] === 0n && pr?.['zest-out'] === 0n, show({ kk, pr }));
    check(`${label}: DLMM (+ cp) fills the whole amount, unsold 0, out > 0`,
      kk['jing-in'] === 0n && kk['dlmm-in'] > 0n && kk['dlmm-in'] + kk['xyk-in'] + kk['velar-in'] === amount && kk.unsold === 0n && kk.out > 0n, show(kk));
    check(`${label}: user paid amount, got out = dlmm-out + cp-out`,
      spent === amount && gained === kk.out && kk.out === kk['dlmm-out'] + kk['xyk-out'] + kk['velar-out'], show({ spent, gained }));
    check(`${label}: clmm-pool-v1 balances unchanged`, q1.st === q0.st && q1.sb === q0.sb, show({ q0, q1 }));
    await routerEmpty(label);
    return kk;
  }
  await smart('smart sBTC->STX 100k sats, limit mid*0.95', true, 100_000n, mid * 95n / 100n, 1n);
  await smart('smart STX->sBTC 300 STX, limit mid*1.05', false, 300_000_000n, mid * 105n / 100n, 1n);
  await smart('smart sBTC->STX 1M sats, limit mid*0.9', true, 1_000_000n, mid * 90n / 100n, 1n);
  await smart('smart STX->sBTC 2000 STX, limit mid*1.1', false, 2_000_000_000n, mid * 110n / 100n, 1n);

  group('smart swaps: deny mode, no clmm-pool-v1 PC');
  const dpc = (P) => Pc.principal(P).willSendGte(0n);
  const k1 = await denyCall('deny: smart sBTC->STX 100k sats, PCs = user eq + DLMM >= 0 STX only (Zest sends nothing)', TAKER, 'smart-swap-sbtc-for-stx',
    [uintCV(100_000n), uintCV(mid * 95n / 100n), noneCV(), uintCV(mid), uintCV(1)],
    [Pc.principal(TAKER).willSendEq(100_000n).ft(SBTC, SBTC_ASSET), ...DPOOLS.map((P) => dpc(P).ustx())]);
  check('deny sBTC->STX: zest 0, DLMM all', k1?.['zest-in'] === 0n && k1?.['dlmm-in'] === 100_000n && k1?.unsold === 0n, show(k1));
  const k2 = await denyCall('deny: smart STX->sBTC 300 STX, PCs = user eq + DLMM >= 0 sBTC only (Zest sends nothing)', TAKER, 'smart-swap-stx-for-sbtc',
    [uintCV(300_000_000n), uintCV(mid * 105n / 100n), noneCV(), uintCV(mid), uintCV(1)],
    [Pc.principal(TAKER).willSendEq(300_000_000n).ustx(), ...DPOOLS.map((P) => dpc(P).ft(SBTC, SBTC_ASSET))]);
  check('deny STX->sBTC: zest 0, DLMM all', k2?.['zest-in'] === 0n && k2?.['dlmm-in'] === 300_000_000n && k2?.unsold === 0n, show(k2));
  await routerEmpty('deny mode');

  // ---- split swaps
  group('split swaps: Zest leg on a missing pool');
  async function split(label, sell, amount, fb, amts, mins, minOut, ticks, want) {
    const u0 = await bals(TAKER), q0 = await bals(ZPOOL);
    const r = await call(TAKER, C.router, sell ? 'swap-sbtc-for-stx' : 'swap-stx-for-sbtc',
      [uintCV(amount), uintCV(0), uintCV(1), noneCV(), fb ? someCV(uintCV(fb)) : noneCV(), amm(amts[0], amts[1]), amm(mins[0], mins[1]), uintCV(minOut), route(ticks, sell ? 0n : UMAX)]);
    const kk = r.res?.ok;
    console.log(`  ${label}: ${show(kk ?? r.vm ?? r.res)}`);
    if (!check(`${label}: (ok ...)`, !r.vm && !!kk, show(r.vm ?? r.res))) return null;
    const u1 = await bals(TAKER), q1 = await bals(ZPOOL);
    const spent = sell ? u0.sb - u1.sb : u0.st - u1.st, gained = sell ? u1.st - u0.st : u1.sb - u0.sb;
    check(`${label}: zest-in = zest-out = 0, clmm-pool-v1 unchanged`, kk['zest-in'] === 0n && kk['zest-out'] === 0n && q1.st === q0.st && q1.sb === q0.sb, show({ kk, q0, q1 }));
    check(`${label}: paid = amount - unsold = dlmm-in; out = user gain = dlmm-out`,
      kk['jing-in'] === 0n && spent === amount - kk.unsold && spent === kk['dlmm-in'] && kk.out === gained && kk.out === kk['dlmm-out'], show({ spent, gained, kk }));
    await routerEmpty(label);
    if (want) check(`${label}: ${want.name}`, want(kk), show(kk));
    return kk;
  }
  for (const sell of [true, false]) {
    const tag = sell ? 'sBTC->STX' : 'STX->sBTC', ticks = sell ? sT : uT;
    const z = sell ? 50_000n : 100_000_000n, dl = sell ? 100_000n : 300_000_000n;
    const bigMin = sell ? 10n ** 12n : 10n ** 9n; // far above any fill of the slice
    await split(`${tag} zest ${z} + ticks [${ticks[0]}..${ticks[7]}], fallback none: slice unsold`, sell, z, 0, [0n, z], [0n, 0n], 0n, ticks,
      function sliceUnsold(kk) { return kk.unsold === z && kk.out === 0n && kk['dlmm-in'] === 0n; });
    await split(`${tag} zest ${z} + ticks, fallback u1: slice to DLMM`, sell, z, 1, [0n, z], [1n, 0n], 1n, ticks,
      function sliceToDlmm(kk) { return kk['dlmm-in'] === z && kk.unsold === 0n && kk.out > 0n; });
    await split(`${tag} dlmm ${dl} + zest ${z} + ticks, fallback u1: DLMM takes both`, sell, dl + z, 1, [dl, z], [1n, 0n], 1n, ticks,
      function dlmmTakesBoth(kk) { return kk['dlmm-in'] === dl + z && kk.unsold === 0n; });
    await split(`${tag} dlmm ${dl} + zest ${z} + ticks, fallback none: dlmm leg fills, zest slice unsold`, sell, dl + z, 0, [dl, z], [1n, 0n], 1n, ticks,
      function dlmmLegOnly(kk) { return kk['dlmm-in'] === dl && kk.unsold === z; });
    await split(`${tag} zest u0 + empty list: DLMM-only ${dl}`, sell, dl, 0, [dl, 0n], [1n, 0n], 1n, [],
      function dlmmOnly(kk) { return kk['dlmm-in'] === dl && kk.unsold === 0n && kk.out > 0n; });
    // amm-mins.zest > 0: scale-min(min, planned, 0) = 0, so the zest assert passes on a 0 fill
    await split(`${tag} amm-mins.zest ${bigMin} on zest ${z}, fallback none: no u3002 (scaled to 0), slice unsold`, sell, z, 0, [0n, z], [0n, bigMin], 0n, ticks,
      function zestMinScaledUnsold(kk) { return kk.unsold === z && kk.out === 0n; });
    await split(`${tag} amm-mins.zest ${bigMin} on zest ${z}, fallback u1: no u3002, slice to DLMM`, sell, z, 1, [0n, z], [1n, bigMin], 1n, ticks,
      function zestMinScaledDlmm(kk) { return kk['dlmm-in'] === z && kk.unsold === 0n; });
    await split(`${tag} dlmm ${dl} + zest ${z}, amm-mins.zest ${bigMin}, fallback u1: no u3002`, sell, dl + z, 1, [dl, z], [1n, bigMin], 1n, ticks,
      function mixedZestMinScaled(kk) { return kk['dlmm-in'] === dl + z && kk.unsold === 0n; });
  }
  group('split swaps: min-out still enforced');
  // the combined min-out is not scaled: a Zest slice that went unsold still counts against it
  const r9 = await call(TAKER, C.router, 'swap-sbtc-for-stx',
    [uintCV(50_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, 50_000n), amm(0n, 0n), uintCV(1), route(sT, 0n)]);
  check('sBTC->STX zest-only slice unsold, min-out 1 -> (err u3002)', !r9.vm && r9.res?.err === 3002n, show(r9.res ?? r9.vm));
  const r10 = await call(TAKER, C.router, 'swap-stx-for-sbtc',
    [uintCV(100_000_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, 100_000_000n), amm(0n, 0n), uintCV(1), route(uT, UMAX)]);
  check('STX->sBTC zest-only slice unsold, min-out 1 -> (err u3002)', !r10.vm && r10.res?.err === 3002n, show(r10.res ?? r10.vm));
  check('router holds nothing at the end', show(await bals(C.router)) === show({ st: 0n, sb: 0n }), show(await bals(C.router)));
  check('get-pool-count still 2 (nothing created pool 3)', (await evalIn(ZPOOL, '(get-pool-count)')) === 2n);
  note('stxer: pool 3 never created; router repo bytes deployed unpatched');
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(`crash: ${e.message}`); }
}
summary();
