// stxer mainnet-fork proof: swap-router-sbtc-stx-jing-v6 (v5-6 + Zest CLMM
// sBTC/STX pool 3 as a 4th AMM venue), keyless (no Jing leg, no Lazer update).
// Port of verify-router-stx-usdcx-v6-zest.mjs.
//   Pool 3 does not exist on mainnet (pool count 2). First state change of the
//   sim: executor-dao creates it (x = Zest wstx / y = sbtc-token, the STX/USDCx
//   pool 1 layout, bin step 100, 1% fees, rebate 100%), so the id is 3 = the
//   router's hardcoded ZEST_POOL_ID.
//   An LP then seeds a band around the live DLMM mid: sBTC-only (y) bins on the
//   ticks above tick(mid) (selling STX = x -> y walks them upward), STX-only (x)
//   bins on the ticks below (selling sBTC = y -> x walks them downward),
//   tick(mid) left empty.
//   Router v6 is the only deploy: it binds the live markets-sbtc-stx-jing-v6-5
//   (never called here: jing-amount 0 / update none).
//   - Zest-only legs both ways, exact quote = transfers (native STX user <-> pool)
//   - mixed DLMM + Zest legs both ways (one combined min-out)
//   - deny-mode post-conditions on the Zest leg
//   - zest = 0 ignores the route, split mismatch u3004, fallback u4 -> u3003,
//     Zest min (scaled) u3002, combined min u3002, wrong tick order caught as 0
//   - split partial fill: one-tick walk, shortfall to DLMM (fallback u1) or
//     unsold; Zest errs (wrong order, tick 4459) count as in = out = 0
//   - smart swaps: Zest fills all / part (+ DLMM) / 0 (DLMM all) / no ticks,
//     32-tick worst cases + cost table, deny-mode PCs, ZEST_MAX_LIMIT mid skip
// Price units: router limit = uSTX per sat x 1e10; Zest WAD = raw x per raw y =
// uSTX per sat x 1e18 (= limit x 1e8); DLMM bin price = sats per uSTX x 1e8
// (limit = 1e18 / p).
// Tick lists: sT = selling sBTC (y -> x, STX bins, descending, price = min-price),
// uT = selling STX (x -> y, sBTC bins, ascending, price = max-price).
// Run: node simulations/verify-router-sbtc-stx-v6-zest.mjs
import { readFileSync } from 'node:fs';
import {
  uintCV, intCV, noneCV, someCV, tupleCV, listCV, Pc, PostConditionMode,
  makeUnsignedContractCall, deserializeCV, cvToString, trueCV, deserializeTransaction, addressToString,
} from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps, getNonce, setSender, getSimulationResult } from 'stxer';
import { NODE, DEP, WHALE, P_, mk, plain, note, S, retry, check, must, show, tx, evalIn, call, deploy, summary, Stop, stxTransfer, sbtcTransfer, SBTC } from './_yg-loop-common.js';

const ZPOOL = 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-pool-v1';
const ZROUTER = 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-router-v1';
const ZEXEC = 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.executor-dao';
const ZWSTX = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx';
const ZID = 3;
const DLMM_CORE = 'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1';
const DPOOLS = [1, 2, 3].map((n) => `SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-${n}-bps-15`);
const N = { router: 'swap-router-sbtc-stx-jing-v6' };
// v6 is live on mainnet under N.router: ROUTER_AS deploys the repo bytes under another name
const AS = process.env.ROUTER_AS || N.router;
// ZEST_FEE: pool 3 fee (1e8 = 100%); default 1% as the harness was written, u300000 = pool 1's 0.3%
const ZFEE = process.env.ZEST_FEE || '1000000';
const C = { router: `${DEP}.${AS}` };
const src = (f) => readFileSync(new URL(`../contracts/sbtc-stx/${f}.clar`, import.meta.url), 'utf8');
const UMAX = 340282366920938463463374607431768211455n;
const L2W = 100_000_000n, ZMAX = 10n ** 21n, F1 = 100_000_000n, PS = 10_000_000_000n;
const TAKER = mk(6), LP = mk(7);
const SBTC_ASSET = 'sbtc-token';
// band seeded on pool 3
const NB = 40, STX_PER_BIN = 3_000_000_000n, SATS_PER_BIN = 1_500_000n;

const amm = (d = 0n, z = 0n, x = 0n, v = 0n) => tupleCV({ dlmm: uintCV(d), xyk: uintCV(x), velar: uintCV(v), zest: uintCV(z) });
const route = (ticks, price) => tupleCV({ ticks: listCV(ticks.map((t) => intCV(t))), price: uintCV(price) });
const sb = async (who) => (await evalIn(SBTC, `(get-balance '${who})`)).ok;
const stx = async (who) => evalIn(SBTC, `(stx-get-balance '${who})`);
const bals = async (who) => ({ st: await stx(who), sb: await sb(who) });
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };
const routerEmpty = async (label) => { const rb = await bals(C.router); return check(`${label}: router holds 0 STX / 0 sBTC`, rb.st === 0n && rb.sb === 0n, show(rb)); };
// FE-side quote: walk the ticks with the pool's read-only per-bin quote
// sell = selling sBTC (y -> x, descending ticks); else selling STX (x -> y, ascending)
async function zquote(sell, ticks, amount, bound) {
  let left = amount, out = 0n;
  for (const t of ticks) {
    if (left === 0n) break;
    const q = sell
      ? await evalIn(ZPOOL, `(quote-swap-y-for-x u${ZID} ${t} u${left} u${bound ?? 0n})`)
      : await evalIn(ZPOOL, `(quote-swap-x-for-y u${ZID} ${t} u${left} u${bound ?? UMAX})`);
    left -= q.ok.in; out += q.ok.out;
  }
  return { out, left, in: amount - left };
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
  const ok = wantOk === false ? !!t && !!t.post_condition_aborted
    : !!t && !t.vm_error && !t.post_condition_aborted && (wantOk ? res?.startsWith('(ok') : true);
  check(label, ok, JSON.stringify({ res, vm: t?.vm_error, pc: t?.post_condition_aborted }).slice(0, 400));
  return t?.result ? plain(deserializeCV(t.result))?.ok : undefined;
}
const sbtcPc = (who) => Pc.principal(who);

try {
  // ---- first state change: create Zest pool 3 (x = wstx / y = sbtc-token, bin step 100, 1% / 1%, rebate 100%)
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  // FORK_BLOCK pins the parent block (default tip): live DLMM depth moves block to block
  if (process.env.FORK_BLOCK) b.useBlockHeight(Number(process.env.FORK_BLOCK));
  b.withSender(DEP).addEvalCode(ZEXEC, `(as-contract? () (try! (contract-call? '${ZPOOL} create-pool '${ZWSTX} '${SBTC} u100 u${ZFEE} u${ZFEE} u100000000)))`);
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);

  group('Zest pool 3 setup');
  const r0 = await retry(() => getSimulationResult(S.sid));
  const ev0 = r0.steps?.[0]?.Result?.Eval;
  const created = ev0 && 'Ok' in ev0 ? cvToString(deserializeCV(ev0.Ok)) : JSON.stringify(ev0);
  must('executor-dao create-pool -> (ok u3)', created === '(ok u3)', created);
  must('get-pool-count = 3', (await evalIn(ZPOOL, '(get-pool-count)')) === 3n);
  const pool = await evalIn(ZPOOL, `(get-pool u${ZID})`);
  must('pool 3 = Zest wstx (x, native-x) / sbtc-token (y), bin step 100, 1%/1%, rebate 1e8, live, public',
    pool?.['token-x'] === ZWSTX && pool?.['token-y'] === SBTC && pool?.['bin-step'] === 100n && pool?.['native-x'] === true && pool?.['native-y'] === false
    && pool?.['fee-rate-x'] === BigInt(ZFEE) && pool?.['fee-rate-y'] === BigInt(ZFEE) && pool?.['fee-rebate'] === 100_000_000n
    && pool?.paused === false && pool?.sunset === false && pool?.depositor === null, show(pool));
  check('pool-id-by-token {wstx, sbtc, 100} = u3', (await evalIn(ZPOOL, `(get-pool-id { token-x: '${ZWSTX}, token-y: '${SBTC}, bin-step: u100 })`)) === 3n);
  console.log(`  pool 1 ${show(await evalIn(ZPOOL, '(get-pool u1)'))}`);
  console.log(`  pool 2 ${show(await evalIn(ZPOOL, '(get-pool u2)'))}`);

  group('deploy');
  // The repo source (b08634f) does not parse: leg-zest closes its `let` bindings with `))` where the
  // stx-usdcx router has `)))`, so `(let ((r ...` swallows the rest of the file ("expected closing ')'").
  // Contract files are not edited here: the fork deploys a copy with that one paren added (PATCH_LEG_ZEST=0
  // deploys the repo bytes as-is, which fails).
  const parenDepth = (code) => { let d = 0; for (const l of code.split('\n')) { let q = false; for (const ch of l) { if (q) { if (ch === '"') q = false; continue; } if (ch === '"') { q = true; continue; } if (ch === ';') break; if (ch === '(') d++; else if (ch === ')') d--; } } return d; };
  let rsrc = src(N.router);
  const BAD = '        )\n      ))\n      (asserts! (>= (get out r) (scale-min min-received amount (get in r)))';
  if (parenDepth(rsrc) !== 0 && process.env.PATCH_LEG_ZEST !== '0') {
    must('leg-zest unclosed-let site found exactly once', rsrc.split(BAD).length === 2);
    rsrc = rsrc.replace(BAD, BAD.replace('      ))', '      )))'));
    note(`CONTRACT BUG: repo ${N.router}.clar is unbalanced (depth ${parenDepth(src(N.router))}); deployed with leg-zest ')' added (now depth ${parenDepth(rsrc)})`);
  }
  // ROUTER_FIX=reed: Patient Reed's suggested guard (bounty mwofjt42), cost-measure only. The Zest bound
  // is clamped to the mid (selling sBTC: min-price >= mid; selling STX: max-price <= mid), so a Zest
  // fill never prices worse than mid before its fee. Checks that expect fills at the limit then fail by
  // design; compare the cost table rows against a plain run.
  if (process.env.ROUTER_FIX === 'reed') {
    const FROM = '          (bound (if (and sane (< fee ZEST_FEE_ONE))\n            (zest-bound limit fee sell-sbtc)\n            u0\n          ))';
    const TO = '          (bound (if (and sane (< fee ZEST_FEE_ONE))\n            (let ((b (zest-bound limit fee sell-sbtc)))\n              (if sell-sbtc\n                (if (> mid-wad b) mid-wad b)\n                (if (and (> mid-wad u0) (< mid-wad b)) mid-wad b)\n              )\n            )\n            u0\n          ))';
    must('zest-stage-pool bound site found exactly once', rsrc.split(FROM).length === 2);
    rsrc = rsrc.replace(FROM, TO);
    note('ROUTER_FIX=reed: Zest bound clamped to mid (cost measure)');
  }
  await deploy(DEP, AS, rsrc);

  // ---- live DLMM mid (deepest pool's active bin) -> Zest tick of the mid
  group('mid + tick math');
  async function dlmmInfo() {
    const ps = [];
    for (const P of DPOOLS) {
      const i = (await evalIn(P, '(get-pool)')).ok;
      const p = (await evalIn(DLMM_CORE, `(get-bin-price u${i['initial-price']} u${i['bin-step']} ${i['active-bin-id']})`)).ok;
      ps.push({ P, i, p, depthStx: await stx(P), depthSb: await sb(P) });
    }
    return ps;
  }
  const di = await dlmmInfo();
  const deep = di.reduce((m, x) => (x.depthStx > m.depthStx ? x : m));
  for (const x of di) console.log(`  ${x.P.split('.')[1]} price ${x.p} bin-step ${x.i['bin-step']} STX ${x.depthStx} sats ${x.depthSb}`);
  const mid = PS * 100_000_000n / deep.p;          // router units: uSTX per sat x 1e10
  const midwad = mid * L2W;                         // Zest WAD: uSTX per sat x 1e18
  console.log(`  mid ${mid} (${Number(mid) / 1e10} uSTX/sat, ${1e6 / (Number(mid) / 1e10)} sats/STX), mid-wad ${midwad}`);
  must('DLMM mid sane (500..5000 uSTX/sat)', midwad > 5n * 10n ** 20n && midwad < 5n * 10n ** 21n, `${midwad}`);
  const binPrice = async (t) => (await evalIn(ZPOOL, `(get-bin-price u${ZID} ${t})`)).ok;
  let tm = Math.floor(Math.log(Number(midwad) / 1e18) / Math.log(1.01));
  for (let i = 0; i < 4 && (await binPrice(tm)) > midwad; i++) tm--;
  for (let i = 0; i < 4 && (await binPrice(tm + 1)) <= midwad; i++) tm++;
  const pLo = await binPrice(tm), pHi = await binPrice(tm + 1);
  must(`empty bin prices bracket the mid: price(${tm}) ${pLo} <= mid-wad < price(${tm + 1}) ${pHi}`, pLo <= midwad && midwad < pHi);
  const rt = await evalIn(C.router, `(list (zest-tick u${midwad}) (zest-tick u${pLo}) (zest-tick u${pHi}) (zest-tick u${pHi - 1n}))`);
  // Zest's tick(t) low edge comes out of a fixed-point sqrt table, so a price sitting exactly on an
  // edge can land one tick either side in the router's log2 (the router walks +/- 2 ticks of margin)
  const d1 = (a, b) => (a > b ? a - b : b - a) <= 1n;
  check(`router zest-tick: tick(mid) = ${tm} exactly; bin edges price(${tm}) / price(${tm + 1}) within 1 tick`,
    rt[0] === BigInt(tm) && d1(rt[1], BigInt(tm)) && d1(rt[2], BigInt(tm + 1)) && rt[3] === BigInt(tm), show(rt));
  const inner = []; for (let t = tm - 40; t <= tm + 40; t += 8) inner.push(t);
  const mids = []; for (const t of inner) { const lo = await binPrice(t), hi = await binPrice(t + 1); mids.push((lo + hi) / 2n); }
  const rti = await evalIn(C.router, `(list ${mids.map((w) => `(zest-tick u${w})`).join(' ')})`);
  check(`router zest-tick = pool tick at bin midpoints ${inner[0]}..${inner[inner.length - 1]}`, show(rti) === show(inner.map(BigInt)), show(rti));
  const d3 = (a, b) => (a > b ? a - b : b - a) <= 3n;
  const rb0 = await evalIn(C.router, `(list (zest-bound u${mid} u1000000 true) (zest-bound u${mid} u1000000 false))`);
  check('router zest-bound(mid, 1%): sell sBTC min-price ~ mid-wad / 0.99, sell STX max-price ~ mid-wad x 0.99',
    d3(rb0[0], midwad * 100n / 99n) && d3(rb0[1], midwad * 99n / 100n), show(rb0));

  // ---- seed the band: sBTC-only (y) bins above tick(mid), STX-only (x) bins below
  group('seed pool 3');
  await stxTransfer(WHALE.y, LP, STX_PER_BIN * BigInt(NB) + 10_000_000n);
  await sbtcTransfer(WHALE.x, LP, SATS_PER_BIN * BigInt(NB));
  const upT = Array.from({ length: NB }, (_, i) => tm + 1 + i);   // sBTC (y) bins, ascending
  const dnT = Array.from({ length: NB }, (_, i) => tm - 1 - i);   // STX (x) bins, descending
  const zp0 = await bals(ZPOOL);
  // y-only (sBTC) bin sits at its low edge a, x-only (STX) bin at its high edge b
  const qa = await evalIn(ZPOOL, `(quote-add-to-position u${ZID} ${upT[0]} u0 u${SATS_PER_BIN})`);
  await tx(`add-to-position tick ${upT[0]}: 1.5M sats only, shares = quote`, LP, ZPOOL, 'add-to-position',
    [P_(ZWSTX), P_(SBTC), uintCV(ZID), intCV(upT[0]), uintCV(0), uintCV(SATS_PER_BIN), uintCV(0), uintCV(UMAX), uintCV(1)],
    (v) => v?.ok?.shares === qa?.ok?.shares && v?.ok?.dy === SATS_PER_BIN);
  const qb = await evalIn(ZPOOL, `(quote-add-to-position u${ZID} ${dnT[0]} u${STX_PER_BIN} u0)`);
  await tx(`add-to-position tick ${dnT[0]}: 3000 STX only, shares = quote`, LP, ZPOOL, 'add-to-position',
    [P_(ZWSTX), P_(SBTC), uintCV(ZID), intCV(dnT[0]), uintCV(STX_PER_BIN), uintCV(0), uintCV(0), uintCV(UMAX), uintCV(1)],
    (v) => v?.ok?.shares === qb?.ok?.shares && v?.ok?.dx === STX_PER_BIN);
  const pos = (t, x, y) => tupleCV({ tick: intCV(t), 'max-x': uintCV(x), 'max-y': uintCV(y), 'min-price': uintCV(0), 'max-price': uintCV(UMAX), 'min-shares': uintCV(1) });
  await tx(`add-to-positions-many: ${NB - 1} more sBTC bins ${upT[1]}..${upT[NB - 1]}`, LP, ZROUTER, 'add-to-positions-many',
    [P_(ZWSTX), P_(SBTC), uintCV(ZID), listCV(upT.slice(1).map((t) => pos(t, 0n, SATS_PER_BIN)))], (v) => v?.ok?.length === NB - 1);
  await tx(`add-to-positions-many: ${NB - 1} more STX bins ${dnT[1]}..${dnT[NB - 1]}`, LP, ZROUTER, 'add-to-positions-many',
    [P_(ZWSTX), P_(SBTC), uintCV(ZID), listCV(dnT.slice(1).map((t) => pos(t, STX_PER_BIN, 0n)))], (v) => v?.ok?.length === NB - 1);
  const zp1 = await bals(ZPOOL);
  must('clmm-pool-v1 took exactly 120k STX (native) + 60M sats', zp1.st - zp0.st === STX_PER_BIN * BigInt(NB) && zp1.sb - zp0.sb === SATS_PER_BIN * BigInt(NB), show({ st: zp1.st - zp0.st, sb: zp1.sb - zp0.sb }));
  async function zLive(lo = tm - 45, hi = tm + 45) {
    const sc = []; for (let t = lo; t <= hi; t++) sc.push(t);
    const bb = await evalIn(ZPOOL, `(map get-pool-balances (list ${sc.map(() => `u${ZID}`).join(' ')}) (list ${sc.join(' ')}))`);
    const l = sc.map((t, i) => ({ t, x: bb[i]?.['balance-x'] ?? 0n, y: bb[i]?.['balance-y'] ?? 0n }));
    // sell sBTC (y -> x) walks the STX (x) bins down, sell STX (x -> y) walks the sBTC (y) bins up
    return { sT: l.filter((q) => q.x > 1000n).map((q) => q.t).reverse().slice(0, 32), uT: l.filter((q) => q.y > 1000n).map((q) => q.t).slice(0, 32), l };
  }
  const z0 = await zLive();
  check('band on chain: sBTC (y) bins = ticks above tick(mid), STX (x) bins = ticks below, tick(mid) empty',
    z0.l.filter((q) => q.y > 0n).every((q) => q.t > tm && q.x === 0n && q.y === SATS_PER_BIN) && z0.l.filter((q) => q.x > 0n).every((q) => q.t < tm && q.y === 0n && q.x === STX_PER_BIN)
    && z0.l.filter((q) => q.y > 0n).length === NB && z0.l.filter((q) => q.x > 0n).length === NB && z0.l.find((q) => q.t === tm).x === 0n && z0.l.find((q) => q.t === tm).y === 0n);
  const pUp = await binPrice(upT[0]), pDn = await binPrice(dnT[0]);
  check(`first sBTC bin price ${pUp} > mid-wad ${midwad} >= first STX bin price ${pDn} (pool spread around the mid)`, pUp > midwad && midwad >= pDn);
  let { sT: sTicks, uT: uTicks } = z0;
  console.log(`  sell-sBTC (y->x) ticks ${sTicks.slice(0, 6).join(',')}..  sell-STX (x->y) ticks ${uTicks.slice(0, 6).join(',')}..`);

  await stxTransfer(WHALE.y, TAKER, 350_000_000_000n);
  await sbtcTransfer(WHALE.x, TAKER, 250_000_000n);

  group('Zest-only legs');
  const bIn = 100_000n; // 100k sats
  const qs = await zquote(true, sTicks, bIn);
  must('quote fills 100k sats on Zest', qs.left === 0n && qs.out > 0n, show(qs));
  let a0 = await bals(TAKER), p0 = await bals(ZPOOL);
  const s0 = await tx('swap-sbtc-for-stx 100k sats all Zest, min = quote', TAKER, C.router, 'swap-sbtc-for-stx',
    [uintCV(bIn), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, bIn), amm(0n, qs.out), uintCV(qs.out), route(sTicks, 0n)], (v) => v?.ok !== undefined);
  let a1 = await bals(TAKER), p1 = await bals(ZPOOL);
  console.log(`  ${show(s0.res?.ok)}; ${Number(a1.st - a0.st) / 1e6} STX for 100k sats`);
  check('user sent exactly 100k sats, got exactly the quote in native STX', a0.sb - a1.sb === bIn && a1.st - a0.st === qs.out, show({ sb: a0.sb - a1.sb, st: a1.st - a0.st }));
  check('sBTC landed on clmm-pool-v1, native STX left it', p1.sb - p0.sb === bIn && p0.st - p1.st === qs.out, show({ sb: p1.sb - p0.sb, st: p0.st - p1.st }));
  check('receipt zest-in/out, other legs 0, unsold 0', s0.res?.ok?.['zest-in'] === bIn && s0.res?.ok?.['zest-out'] === qs.out && s0.res?.ok?.['dlmm-in'] === 0n && s0.res?.ok?.['jing-in'] === 0n && s0.res?.ok?.out === qs.out && s0.res?.ok?.unsold === 0n, show(s0.res?.ok));
  check('Zest-only sBTC->STX net below mid (spread + 1% fee)', qs.out * PS / bIn < mid, `${qs.out * PS / bIn} vs ${mid}`);
  await routerEmpty('Zest-only sBTC->STX');

  const uIn = 300_000_000n; // 300 STX
  const qu = await zquote(false, uTicks, uIn);
  must('quote fills 300 STX on Zest', qu.left === 0n && qu.out > 0n, show(qu));
  a0 = await bals(TAKER); p0 = await bals(ZPOOL);
  const s1 = await tx('swap-stx-for-sbtc 300 STX all Zest, min = quote', TAKER, C.router, 'swap-stx-for-sbtc',
    [uintCV(uIn), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, uIn), amm(0n, qu.out), uintCV(qu.out), route(uTicks, UMAX)], (v) => v?.ok !== undefined);
  a1 = await bals(TAKER); p1 = await bals(ZPOOL);
  console.log(`  ${show(s1.res?.ok)}; ${a1.sb - a0.sb} sats for 300 STX`);
  check('user paid exactly 300 STX, got exactly the quote in sBTC', a0.st - a1.st === uIn && a1.sb - a0.sb === qu.out, show({ st: a0.st - a1.st, sb: a1.sb - a0.sb }));
  check('pool took native STX, paid sBTC', p1.st - p0.st === uIn && p0.sb - p1.sb === qu.out);
  check('receipt zest-in/out = transfers, other legs 0, unsold 0', s1.res?.ok?.['zest-in'] === uIn && s1.res?.ok?.['zest-out'] === qu.out && s1.res?.ok?.['dlmm-in'] === 0n && s1.res?.ok?.out === qu.out && s1.res?.ok?.unsold === 0n, show(s1.res?.ok));
  check('Zest-only STX->sBTC paid above mid (spread + 1% fee)', uIn * PS / qu.out > mid, `${uIn * PS / qu.out} vs ${mid}`);
  await routerEmpty('Zest-only STX->sBTC');

  group('mixed DLMM + Zest');
  ({ sT: sTicks, uT: uTicks } = await zLive());
  const m0 = await bals(TAKER);
  const qm = await zquote(true, sTicks, bIn);
  const r2 = await tx('swap-sbtc-for-stx 200k sats = dlmm 100k + zest 100k', TAKER, C.router, 'swap-sbtc-for-stx',
    [uintCV(2n * bIn), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(bIn, bIn), amm(1n, qm.out), uintCV(qm.out * 2n * 97n / 100n), route(sTicks, 0n)], (v) => v?.ok !== undefined);
  const m1 = await bals(TAKER), k = r2.res?.ok;
  console.log(`  ${show(k)}`);
  check('200k sats in; out = dlmm-out + zest-out = user STX gain', m0.sb - m1.sb === 2n * bIn && k?.out === k?.['dlmm-out'] + k?.['zest-out'] && k?.out === m1.st - m0.st && k?.['dlmm-in'] === bIn && k?.['zest-in'] === bIn && k?.['zest-out'] === qm.out && k?.unsold === 0n, show(k));
  note(`mixed sBTC->STX: dlmm-out ${k?.['dlmm-out']} vs zest-out ${k?.['zest-out']} for 100k sats each`);
  await routerEmpty('mixed sBTC->STX');
  const qm2 = await zquote(false, uTicks, uIn);
  const r3 = await tx('swap-stx-for-sbtc 600 STX = dlmm 300 + zest 300', TAKER, C.router, 'swap-stx-for-sbtc',
    [uintCV(2n * uIn), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(uIn, uIn), amm(1n, qm2.out), uintCV(qm2.out * 2n * 97n / 100n), route(uTicks, UMAX)], (v) => v?.ok !== undefined);
  const m2 = await bals(TAKER), k2 = r3.res?.ok;
  console.log(`  ${show(k2)}`);
  check('600 STX in; out = dlmm-out + zest-out = user sBTC gain', m1.st - m2.st === 2n * uIn && k2?.out === k2?.['dlmm-out'] + k2?.['zest-out'] && k2?.out === m2.sb - m1.sb && k2?.['dlmm-in'] === uIn && k2?.['zest-in'] === uIn && k2?.['zest-out'] === qm2.out && k2?.unsold === 0n, show(k2));
  await routerEmpty('mixed STX->sBTC');

  group('post-conditions (deny mode)');
  ({ sT: sTicks, uT: uTicks } = await zLive());
  const qp = await zquote(true, sTicks, bIn);
  await denyCall('deny mode: user sends eq 100k sats, clmm-pool-v1 sends >= 0 STX', TAKER, 'swap-sbtc-for-stx',
    [uintCV(bIn), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, bIn), amm(0n, qp.out), uintCV(qp.out), route(sTicks, 0n)],
    [Pc.principal(TAKER).willSendEq(bIn).ft(SBTC, SBTC_ASSET), Pc.principal(ZPOOL).willSendGte(0n).ustx()], true);
  const qp2 = await zquote(false, uTicks, uIn);
  await denyCall('deny mode: user sends eq 300 STX, clmm-pool-v1 sends >= 0 sBTC', TAKER, 'swap-stx-for-sbtc',
    [uintCV(uIn), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, uIn), amm(0n, qp2.out), uintCV(qp2.out), route(uTicks, UMAX)],
    [Pc.principal(TAKER).willSendEq(uIn).ustx(), Pc.principal(ZPOOL).willSendGte(0n).ft(SBTC, SBTC_ASSET)], true);
  await denyCall('deny mode: Zest-only sBTC->STX without the clmm-pool-v1 PC aborts', TAKER, 'swap-sbtc-for-stx',
    [uintCV(bIn), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, bIn), amm(0n, 1n), uintCV(1), route(sTicks, 0n)],
    [Pc.principal(TAKER).willSendEq(bIn).ft(SBTC, SBTC_ASSET)], false);

  group('guards');
  ({ sT: sTicks, uT: uTicks } = await zLive());
  await tx('zest = 0: bad route (non-monotonic ticks) ignored, DLMM-only ok', TAKER, C.router, 'swap-sbtc-for-stx',
    [uintCV(20_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(20_000n), amm(1n), uintCV(1), route([5, 3, 5], 0n)], (v) => v?.ok?.['zest-in'] === 0n && v?.ok?.['dlmm-in'] === 20_000n);
  await tx('split mismatch with zest (amount 30k = dlmm 10k + zest 10k) -> u3004', TAKER, C.router, 'swap-sbtc-for-stx',
    [uintCV(30_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(10_000n, 10_000n), amm(1n, 1n), uintCV(0), route(sTicks, 0n)], { err: 3004n });
  await tx('split mismatch on the STX side (zest only, amount 1 STX vs zest 2 STX) -> u3004', TAKER, C.router, 'swap-stx-for-sbtc',
    [uintCV(1_000_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, 2_000_000n), amm(0n, 1n), uintCV(0), route(uTicks, UMAX)], { err: 3004n });
  await tx('fallback = u4 (Zest) -> u3003', TAKER, C.router, 'swap-sbtc-for-stx',
    [uintCV(10_000n), uintCV(0), uintCV(1), noneCV(), someCV(uintCV(4)), amm(0n, 10_000n), amm(0n, 1n), uintCV(0), route(sTicks, 0n)], { err: 3003n });
  await tx('fallback = u4 (Zest) on swap-stx-for-sbtc -> u3003', TAKER, C.router, 'swap-stx-for-sbtc',
    [uintCV(1_000_000n), uintCV(0), uintCV(1), noneCV(), someCV(uintCV(4)), amm(0n, 1_000_000n), amm(0n, 1n), uintCV(0), route(uTicks, UMAX)], { err: 3003n });
  const qg = await zquote(true, sTicks, 10_000n);
  await tx('zest min above quote, full fill (scale-min keeps it whole) -> u3002', TAKER, C.router, 'swap-sbtc-for-stx',
    [uintCV(10_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, 10_000n), amm(0n, qg.out + 1n), uintCV(0), route(sTicks, 0n)], { err: 3002n });
  await tx('zest min = quote exactly passes', TAKER, C.router, 'swap-sbtc-for-stx',
    [uintCV(10_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, 10_000n), amm(0n, qg.out), uintCV(0), route(sTicks, 0n)], (v) => v?.ok?.['zest-out'] === qg.out);
  ({ sT: sTicks, uT: uTicks } = await zLive());
  const qg2 = await zquote(true, sTicks, 10_000n);
  await tx('combined min above quote -> u3002', TAKER, C.router, 'swap-sbtc-for-stx',
    [uintCV(10_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, 10_000n), amm(0n, 1n), uintCV(qg2.out + 1n), route(sTicks, 0n)], { err: 3002n });
  const qg3 = await zquote(false, uTicks, 1_000_000n);
  await tx('swap-stx-for-sbtc zest min above quote -> u3002', TAKER, C.router, 'swap-stx-for-sbtc',
    [uintCV(1_000_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, 1_000_000n), amm(0n, qg3.out + 1n), uintCV(0), route(uTicks, UMAX)], { err: 3002n });
  await tx('swap-stx-for-sbtc combined min above quote -> u3002', TAKER, C.router, 'swap-stx-for-sbtc',
    [uintCV(1_000_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, 1_000_000n), amm(0n, 1n), uintCV(qg3.out + 1n), route(uTicks, UMAX)], { err: 3002n });
  await tx('Zest x->y ticks given descending -> Zest route err caught: ok, zest 0, all unsold (no fallback)', TAKER, C.router, 'swap-stx-for-sbtc',
    [uintCV(1_000_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, 1_000_000n), amm(0n, 1n), uintCV(0), route([...uTicks].reverse(), UMAX)],
    (v) => v?.ok?.['zest-in'] === 0n && v?.ok?.['zest-out'] === 0n && v?.ok?.unsold === 1_000_000n && v?.ok?.out === 0n);
  await tx('Zest y->x ticks given ascending -> Zest route err caught: ok, zest 0, all unsold (no fallback)', TAKER, C.router, 'swap-sbtc-for-stx',
    [uintCV(10_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, 10_000n), amm(0n, 1n), uintCV(0), route([...sTicks].reverse(), 0n)],
    (v) => v?.ok?.['zest-in'] === 0n && v?.ok?.['zest-out'] === 0n && v?.ok?.unsold === 10_000n && v?.ok?.out === 0n);
  const yOnly = (await zLive()).l.filter((q) => q.y > 0n && q.x === 0n).map((q) => q.t).slice(0, 32).reverse(); // descending, no STX
  must('found sBTC-only bins', yOnly.length > 0, show(yOnly));
  await tx(`sell sBTC walking sBTC-only bins ${yOnly[0]}..${yOnly[yOnly.length - 1]} (no STX there): zest 0, unsold all`, TAKER, C.router, 'swap-sbtc-for-stx',
    [uintCV(10_000n), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(0n, 10_000n), amm(0n, 0n), uintCV(0), route(yOnly, 0n)],
    (v) => v?.ok?.['zest-in'] === 0n && v?.ok?.unsold === 10_000n);
  await routerEmpty('guards');

  // ---- split partial fill
  group('split: partial Zest fill (short walk, Zest err)');
  async function split(label, sell, amount, fb, amts, mins, minOut, ticks, want) {
    const u0 = await bals(TAKER), q0 = await bals(ZPOOL);
    const r = await call(TAKER, C.router, sell ? 'swap-sbtc-for-stx' : 'swap-stx-for-sbtc',
      [uintCV(amount), uintCV(0), uintCV(1), noneCV(), fb ? someCV(uintCV(fb)) : noneCV(), amm(amts[0], amts[1]), amm(mins[0], mins[1]), uintCV(minOut), route(ticks, sell ? 0n : UMAX)]);
    const kk = r.res?.ok;
    console.log(`  ${label}: ${show(kk ?? r.vm ?? r.res)}`);
    if (!check(`${label}: ok`, !r.vm && !!kk, show(r.vm ?? r.res))) return null;
    const u1 = await bals(TAKER), q1 = await bals(ZPOOL), rb = await bals(C.router);
    const spent = sell ? u0.sb - u1.sb : u0.st - u1.st, gained = sell ? u1.st - u0.st : u1.sb - u0.sb;
    const zIn = sell ? q1.sb - q0.sb : q1.st - q0.st, zOut = sell ? q0.st - q1.st : q0.sb - q1.sb;
    check(`${label}: paid = amount - unsold = zest-in + dlmm-in; out = user gain = zest-out + dlmm-out`,
      kk['jing-in'] === 0n && spent === amount - kk.unsold && spent === kk['zest-in'] + kk['dlmm-in'] && kk.out === gained && kk.out === kk['zest-out'] + kk['dlmm-out'],
      show({ spent, gained, kk }));
    check(`${label}: clmm-pool-v1 moved exactly zest-in / zest-out`, zIn === kk['zest-in'] && zOut === kk['zest-out'], show({ zIn, zOut }));
    check(`${label}: router holds 0 STX / 0 sBTC`, rb.st === 0n && rb.sb === 0n, show(rb));
    if (want) check(`${label}: ${want.name}`, want(kk), show(kk));
    return kk;
  }
  for (const sell of [true, false]) {
    const tag = sell ? 'sBTC->STX' : 'STX->sBTC', fn = sell ? 'swap-sbtc-for-stx' : 'swap-stx-for-sbtc', P = sell ? 0n : UMAX;
    const extra = sell ? 200_000n : 500_000_000n; // shortfall past the one-tick walk: 200k sats / 500 STX
    // one live tick of the leg's side, quoted for far more than it holds
    const oneTick = async () => {
      const { sT, uT } = await zLive(), ask = sell ? 10n ** 10n : 10n ** 13n;
      for (const t of sell ? sT : uT) {
        const z = await zquote(sell, [t], ask);
        if (z.in > 0n && z.out > 0n) return { t, q: z, amount: z.in + extra };
      }
      return null;
    };
    const fund = async (amount) => {
      const have = sell ? await sb(TAKER) : await stx(TAKER), need = amount * 2n;
      if (have >= need) return;
      if (sell) await sbtcTransfer(WHALE.x, TAKER, need);
      else await stxTransfer(WHALE.y, TAKER, need);
    };
    let w = await oneTick();
    must(`${tag}: one-tick walk [${w?.t}] covers ${w?.q.in} of a ${w?.amount} leg`, !!w && w.q.in > 0n && w.q.out > 0n && w.q.left > 0n, show(w));
    await fund(w.amount);
    const zmFail = ((w.q.out + 1n) * w.amount + w.q.in - 1n) / w.q.in;
    const zmPass = (w.q.out * w.amount) / w.q.in;
    await tx(`${tag}: amm-mins.zest ${zmFail} scales past zest-out ${w.q.out} on a ${w.q.in}/${w.amount} fill -> u3002`, TAKER, C.router, fn,
      [uintCV(w.amount), uintCV(0), uintCV(1), noneCV(), someCV(uintCV(1)), amm(0n, w.amount), amm(1n, zmFail), uintCV(1), route([w.t], P)], { err: 3002n });
    await split(`${tag} one-tick walk + fallback DLMM, amm-mins.zest ${zmPass} (scales to zest-out)`, sell, w.amount, 1, [0n, w.amount], [1n, zmPass], 1n, [w.t],
      function zestPartialDlmmTakesShortfall(kk) { return kk['zest-in'] === w.q.in && kk['zest-out'] === w.q.out && kk['zest-in'] < w.amount && kk['dlmm-in'] === w.amount - w.q.in && kk['dlmm-out'] > 0n && kk.unsold === 0n; });
    w = await oneTick();
    must(`${tag}: next one-tick walk [${w?.t}] covers ${w?.q.in} of a ${w?.amount} leg`, !!w && w.q.in > 0n && w.q.out > 0n && w.q.left > 0n, show(w));
    await fund(w.amount);
    await split(`${tag} one-tick walk, fallback none: shortfall ${extra} unsold, user keeps it`, sell, w.amount, 0, [0n, w.amount], [0n, 0n], 0n, [w.t],
      function shortfallUnsold(kk) { return kk['zest-in'] === w.q.in && kk['zest-out'] === w.q.out && kk['dlmm-in'] === 0n && kk.unsold === w.amount - w.q.in; });
    w = await oneTick();
    const dl = sell ? 100_000n : 300_000_000n;
    await fund(w.amount + dl);
    await split(`${tag} dlmm ${dl} + one-tick zest ${w.amount}, fallback DLMM: dlmm-in = ${dl} + shortfall`, sell, w.amount + dl, 1, [dl, w.amount], [1n, 1n], 1n, [w.t],
      function dlmmTakesSliceAndShortfall(kk) { return kk['zest-in'] === w.q.in && kk['dlmm-in'] === dl + w.amount - w.q.in && kk.unsold === 0n; });
    const { sT, uT } = await zLive();
    const wrong = (sell ? sT : uT).slice(0, 4).reverse();
    const amt3 = sell ? 50_000n : 100_000_000n;
    const q3 = await zquote(sell, [...wrong].reverse(), amt3);
    must(`${tag}: ticks ${wrong} in Zest order would fill ${amt3}`, wrong.length >= 2 && q3.left === 0n && q3.out > 0n, show(q3));
    await split(`${tag} Zest errs (ticks ${wrong} out of order) + fallback DLMM: slice to DLMM`, sell, amt3, 1, [0n, amt3], [1n, 1n], 1n, wrong,
      function zestErrDlmmTakesAll(kk) { return kk['zest-in'] === 0n && kk['zest-out'] === 0n && kk['dlmm-in'] === amt3 && kk.unsold === 0n; });
    await split(`${tag} Zest errs (ticks ${wrong} out of order), fallback none: all unsold`, sell, amt3, 0, [0n, amt3], [1n, 1n], 0n, wrong,
      function zestErrAllUnsold(kk) { return kk['zest-in'] === 0n && kk['zest-out'] === 0n && kk['dlmm-in'] === 0n && kk.unsold === amt3 && kk.out === 0n; });
    const zr = await call(TAKER, ZROUTER, sell ? 'swap-y-for-x' : 'swap-x-for-y',
      [P_(ZWSTX), P_(SBTC), uintCV(ZID), uintCV(amt3), uintCV(P), listCV([intCV(4459)]), uintCV(0), trueCV(), uintCV(2n ** 63n)]);
    check(`${tag}: direct Zest call on tick 4459 errs (so the router legs below take the err path)`, !zr.vm && zr.res?.err !== undefined, show(zr.res ?? zr.vm));
    await split(`${tag} tick 4459 + fallback DLMM: zest 0, slice to DLMM`, sell, amt3, 1, [0n, amt3], [1n, 1n], 1n, [4459],
      function tick4459DlmmTakesAll(kk) { return kk['zest-in'] === 0n && kk['zest-out'] === 0n && kk['dlmm-in'] === amt3 && kk.unsold === 0n; });
    await split(`${tag} tick 4459, fallback none: all unsold`, sell, amt3, 0, [0n, amt3], [1n, 1n], 0n, [4459],
      function tick4459AllUnsold(kk) { return kk['zest-in'] === 0n && kk['zest-out'] === 0n && kk.unsold === amt3 && kk.out === 0n; });
  }

  // ---- smart swaps: Jing (keyless: update none -> jing-size 0) -> Zest -> DLMM -> cp
  group('smart swaps: Zest stage');
  const zrates = (await evalIn(ZPOOL, `(get-fee-rates u${ZID} '${TAKER})`)).ok;
  // selling sBTC pays y fees, selling STX pays x fees (router: fee-rate-y / fee-rate-x)
  const zfeeOf = (sell) => (sell ? zrates['fee-rate-y'] : zrates['fee-rate-x']);
  const smartPrint = (rc, topic) => (rc?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.contract_event).map((e) => { try { return plain(deserializeCV(e.contract_event.raw_value)); } catch { return null; } })
    .find((p) => p?.topic === topic);
  // per-stage limit (router units): sell sBTC: out >= floor((in - 2) * L / 1e10); sell STX: out >= floor((in - 2) * 1e10 / L)
  const atLimit = (sell, i, o, L) => {
    if (i === 0n) return o === 0n;
    if (i > 2n) return sell ? o >= ((i - 2n) * L) / PS : o >= ((i - 2n) * PS) / L;
    return o + i >= (sell ? ((i - 1n) * L) / PS : ((i - 1n) * PS) / L);
  };
  async function smart(label, sell, amount, limit, minOut, want, midArg = mid) {
    const fn = sell ? 'smart-swap-sbtc-for-stx' : 'smart-swap-stx-for-sbtc';
    const u0 = await bals(TAKER), q0 = await bals(ZPOOL);
    const r = await call(TAKER, C.router, fn, [uintCV(amount), uintCV(limit), noneCV(), uintCV(midArg), uintCV(minOut)]);
    const u1 = await bals(TAKER), q1 = await bals(ZPOOL), kk = r.res?.ok, pr = smartPrint(r.receipt, fn);
    console.log(`  ${label}: ${show(kk)} zest-ticks ${pr?.['zest-ticks']} zest-ok ${pr?.['zest-ok']} dlmm-cap ${pr?.['dlmm-cap']}`);
    if (!check(`${label}: ok`, !r.vm && !!kk, show(r.vm ?? r.res))) return null;
    const spent = sell ? u0.sb - u1.sb : u0.st - u1.st, gained = sell ? u1.st - u0.st : u1.sb - u0.sb;
    const zIn = sell ? q1.sb - q0.sb : q1.st - q0.st, zOut = sell ? q0.st - q1.st : q0.sb - q1.sb;
    check(`${label}: out == balance gain, in == jing+zest+dlmm+cp, unsold == amount - in`,
      kk.out === gained && kk.out === kk['jing-out'] + kk['zest-out'] + kk['dlmm-out'] + kk['xyk-out'] + kk['velar-out']
      && spent === kk['jing-in'] + kk['zest-in'] + kk['dlmm-in'] + kk['xyk-in'] + kk['velar-in'] && kk.unsold === amount - spent,
      show({ spent, gained, kk }));
    check(`${label}: Zest pool moved exactly zest-in / zest-out; print matches receipt`,
      zIn === kk['zest-in'] && zOut === kk['zest-out'] && pr?.['zest-in'] === kk['zest-in'] && pr?.['zest-out'] === kk['zest-out'] && pr?.unsold === kk.unsold,
      show({ zIn, zOut, pr }));
    check(`${label}: Zest and DLMM legs each at or better than limit`,
      atLimit(sell, kk['zest-in'], kk['zest-out'], limit) && atLimit(sell, kk['dlmm-in'], kk['dlmm-out'], limit),
      show({ zr: kk['zest-in'] ? Number(kk['zest-out']) / Number(kk['zest-in']) : 0, dr: kk['dlmm-in'] ? Number(kk['dlmm-out']) / Number(kk['dlmm-in']) : 0, limit }));
    await routerEmpty(label);
    if (want) check(`${label}: ${want.name}`, want(kk, pr), show({ kk, pr }));
    return kk;
  }
  const zestAll = function zestTakesAll(kk, pr) { return kk['dlmm-in'] === 0n && kk.unsold === 0n && kk['zest-in'] > 0n && pr['zest-ok'] === true && pr['zest-ticks'] > 0n && pr['zest-ticks'] <= 32n; };
  const noTicks = function noTicksZestSkipped(kk, pr) { return pr['zest-ticks'] === 0n && kk['zest-in'] === 0n && pr['zest-ok'] === false; };

  await smart('smart sBTC->STX 100k sats, limit mid*0.95: Zest fills all', true, 100_000n, mid * 95n / 100n, 1n, zestAll);
  await smart('smart STX->sBTC 300 STX, limit mid*1.05: Zest fills all', false, 300_000_000n, mid * 105n / 100n, 1n, zestAll);
  await smart('smart sBTC->STX 50k sats, limit mid*1.5: no ticks, Zest skipped', true, 50_000n, mid * 3n / 2n, 0n, noTicks);
  await smart('smart STX->sBTC 200 STX, limit mid/1.5: no ticks, Zest skipped', false, 200_000_000n, mid * 2n / 3n, 0n, noTicks);
  await tx('smart sBTC->STX min-out above fill -> u3002', TAKER, C.router, 'smart-swap-sbtc-for-stx',
    [uintCV(10_000n), uintCV(mid * 95n / 100n), noneCV(), uintCV(mid), uintCV(10n ** 12n)], { err: 3002n });
  await tx('smart STX->sBTC min-out above fill -> u3002', TAKER, C.router, 'smart-swap-stx-for-sbtc',
    [uintCV(10_000_000n), uintCV(mid * 105n / 100n), noneCV(), uintCV(mid), uintCV(10n ** 12n)], { err: 3002n });
  await tx('smart limit 0 -> u3006', TAKER, C.router, 'smart-swap-sbtc-for-stx', [uintCV(10_000n), uintCV(0), noneCV(), uintCV(mid), uintCV(0)], { err: 3006n });
  await tx('smart mid 0 -> u3007', TAKER, C.router, 'smart-swap-stx-for-sbtc', [uintCV(10_000_000n), uintCV(mid), noneCV(), uintCV(0), uintCV(0)], { err: 3007n });

  // ---- limits pinned to live DLMM / Zest prices (read on the fork at run time)
  group('smart swaps: limits pinned to live DLMM');
  // DLMM net price per eligible pool (router units), worst one so any pick has capacity
  //   sell sBTC (DLMM y -> x, y fees): uSTX received per sat = 1e18 / p * (1 - fee)
  //   sell STX  (DLMM x -> y, x fees): uSTX paid per sat     = 1e18 / (p * (1 - fee))
  async function dlmmNet(sell) {
    const ps = [];
    for (const P of DPOOLS) {
      const i = (await evalIn(P, '(get-pool)')).ok;
      const p = (await evalIn(DLMM_CORE, `(get-bin-price u${i['initial-price']} u${i['bin-step']} ${i['active-bin-id']})`)).ok;
      const fee = sell ? i['y-protocol-fee'] + i['y-provider-fee'] + i['y-variable-fee'] : i['x-protocol-fee'] + i['x-provider-fee'] + i['x-variable-fee'];
      ps.push({ P, p, fee, depth: sell ? await stx(P) : await sb(P) });
    }
    const mx = ps.reduce((m, x) => (x.depth > m ? x.depth : m), 0n);
    const v = ps.filter((x) => x.depth > 0n && x.depth >= mx / 100n)
      .map((x) => (sell ? (PS * 100_000_000n * (10000n - x.fee)) / x.p / 10000n : (PS * 100_000_000n * 10000n + x.p * (10000n - x.fee) - 1n) / (x.p * (10000n - x.fee))));
    console.log(`  DLMM ${sell ? 'bid' : 'ask'} per pool: ${show(ps.map((x) => ({ p: x.p, fee: x.fee, depth: x.depth })))}`);
    return sell ? v.reduce((a, c) => (c < a ? c : a)) : v.reduce((a, c) => (c > a ? c : a));
  }
  // the contract's own bound for router limit L: selling sBTC (y -> x) min-price = ceil(L * 1e8 / (1 - fee)),
  // selling STX (x -> y) max-price = floor(L * 1e8 * (1 - fee))
  const boundFor = (sell, L) => {
    const fee = zfeeOf(sell);
    return sell ? (L * L2W * F1 + (F1 - fee - 1n)) / (F1 - fee) : (L * L2W * (F1 - fee)) / F1;
  };
  const rbf = await evalIn(C.router, `(list (zest-bound u${mid} u${zfeeOf(true)} true) (zest-bound u${mid} u${zfeeOf(false)} false))`);
  check('harness boundFor == router zest-bound (both sides)', rbf[0] === boundFor(true, mid) && rbf[1] === boundFor(false, mid), show({ rbf, js: [boundFor(true, mid), boundFor(false, mid)] }));
  async function zq(sell, amount, bound) {
    const { sT, uT } = await zLive();
    const q = await zquote(sell, sell ? sT : uT, amount, bound);
    return { ...q, ticks: sell ? sT : uT };
  }
  // Zest marginal net price in router units from a small quote
  async function zNet(sell) {
    const q = await zq(sell, sell ? 10_000n : 30_000_000n);
    return sell ? (q.out * PS) / q.in : (q.in * PS + q.out - 1n) / q.out;
  }
  // push Zest's price just past a target net price (whale trades Zest directly, partial fill at the bound)
  async function drain(sell, target) {
    const { sT, uT } = await zLive();
    return sell
      ? call(WHALE.x, ZROUTER, 'swap-y-for-x', [P_(ZWSTX), P_(SBTC), uintCV(ZID), uintCV(100_000_000n), uintCV(boundFor(true, target)), listCV(sT.map((t) => intCV(t))), uintCV(0), trueCV(), uintCV(2n ** 63n)])
      : call(WHALE.y, ZROUTER, 'swap-x-for-y', [P_(ZWSTX), P_(SBTC), uintCV(ZID), uintCV(100_000_000_000n), uintCV(boundFor(false, target)), listCV(uT.map((t) => intCV(t))), uintCV(0), trueCV(), uintCV(2n ** 63n)]);
  }
  // tight limit = few ticks: 0.3% inside Zest's live net price
  const zt = await zNet(true);
  await smart(`smart sBTC->STX 10k sats, limit ${zt * 997n / 1000n} (0.3% inside live Zest): few ticks`, true, 10_000n, (zt * 997n) / 1000n, 0n,
    function fewTicksAndFills(kk, pr) { return pr['zest-ticks'] > 0n && pr['zest-ticks'] <= 6n && kk['zest-in'] > 0n; });
  for (const sell of [true, false]) {
    const tag = sell ? 'sBTC->STX' : 'STX->sBTC';
    const d = await dlmmNet(sell);
    const tgt = sell ? (d * 9960n) / 10000n : (d * 10040n) / 10000n;
    let z = await zNet(sell);
    console.log(`  ${tag}: DLMM net ${d}, Zest net ${z}, target Zest ${tgt}`);
    if (sell ? z > tgt : z < tgt) {
      const r = await drain(sell, tgt);
      check(`${tag}: whale pushes Zest past DLMM (direct Zest trade)`, r.res?.ok !== undefined, show(r.vm ?? r.res));
      z = await zNet(sell);
    } else note(`${tag}: Zest already behind DLMM (${z} vs ${d}), no drain`);
    must(`${tag}: Zest net ${z} now behind DLMM net ${d} by >= 0.35%`, sell ? z <= (d * 9965n) / 10000n : z >= (d * 10035n) / 10000n);
    // B: limit between Zest and DLMM -> Zest 0, DLMM takes all
    const LB = sell ? (d * 9970n) / 10000n : (d * 10030n) / 10000n;
    const amtB = sell ? 100_000n : 200_000_000n;
    await smart(`smart ${tag} limit ${LB} (inside DLMM, past Zest): Zest 0, DLMM (+ cp past DLMM's capacity) takes all`, sell, amtB, LB, 1n,
      function zestZeroDlmmCpAll(kk) { return kk['zest-in'] === 0n && kk['zest-out'] === 0n && kk['dlmm-in'] > 0n && kk.unsold === 0n && kk['dlmm-in'] + kk['xyk-in'] + kk['velar-in'] === amtB; });
    // A: limit just inside Zest's own price (so also inside DLMM) -> Zest fills its slice, DLMM the rest
    const z2 = await zNet(sell);
    const LA = sell ? (z2 * 9995n) / 10000n : (z2 * 10005n) / 10000n;
    const cap = await zq(sell, sell ? 1_000_000_000n : 1_000_000_000_000n, boundFor(sell, LA));
    must(`${tag}: Zest has a slice inside limit ${LA} (quote ${cap.in} in)`, cap.in > 0n);
    const amtA = cap.in + (sell ? 100_000n : 300_000_000n);
    await smart(`smart ${tag} ${amtA} at limit ${LA}: Zest fills part (${cap.in}), DLMM takes the rest`, sell, amtA, LA, 1n,
      function zestPartDlmmRest(kk, pr) { return kk['zest-in'] > 0n && kk['zest-in'] < amtA && kk['dlmm-in'] > 0n && pr['zest-ok'] === true; });
  }

  group('cost: worst cases (32 Zest ticks + DLMM walk)');
  const W = {}, worstAmts = new Set();
  const zb = await zLive();
  console.log(`  live STX bins ${zb.sT.length}, sBTC bins ${zb.uT.length}`);
  const smX = 150_000_000n;
  worstAmts.add(smX);
  W.smartX = await smart(`worst smart sBTC->STX ${smX} sats, limit mid/2`, true, smX, mid / 2n, 1n,
    function walks32ticksAndDlmm(kk, pr) { return pr['zest-ticks'] === 32n && kk['zest-in'] > 0n && kk['dlmm-in'] > 0n; });
  const stHave = await stx(TAKER);
  const smY = stHave - 60_000_000_000n;
  must(`taker has STX for the worst y->x smart swap (${smY})`, smY > 100_000_000_000n);
  worstAmts.add(smY);
  W.smartY = await smart(`worst smart STX->sBTC ${smY} uSTX, limit mid*2`, false, smY, mid * 2n, 1n,
    function walks32ticksAndDlmm(kk, pr) { return pr['zest-ticks'] === 32n && kk['zest-in'] > 0n && kk['dlmm-in'] > 0n; });
  for (const sell of [true, false]) {
    const dl = sell ? 20_000_000n : 20_000_000_000n;
    const have = sell ? await sb(TAKER) : await stx(TAKER);
    must(`taker can fund worst split ${sell ? 'y->x' : 'x->y'} (has ${have})`, have > dl + 10_000_000n);
    const zl = await zq(sell, have - dl - 10_000_000n, sell ? 0n : UMAX);
    note(`worst split ${sell ? 'y->x' : 'x->y'}: zest leg ${zl.in} over ${zl.ticks.length} ticks, dlmm leg ${dl}`);
    worstAmts.add(zl.in + dl);
    await tx(`worst split ${sell ? 'sBTC->STX' : 'STX->sBTC'}: zest leg over ${zl.ticks.length} ticks + DLMM ${dl}`, TAKER, C.router,
      sell ? 'swap-sbtc-for-stx' : 'swap-stx-for-sbtc',
      [uintCV(zl.in + dl), uintCV(0), uintCV(1), noneCV(), noneCV(), amm(dl, zl.in), amm(1n, 1n), uintCV(1), route(zl.ticks, sell ? 0n : UMAX)],
      (v) => v?.ok?.['zest-in'] === zl.in && v?.ok?.['dlmm-in'] === dl);
  }
  await routerEmpty('worst cases');

  group('smart swaps: deny-mode post-conditions');
  const zr2 = await zLive();
  console.log(`  after worst cases: STX bins ${zr2.sT.slice(0, 6)}.., sBTC bins ${zr2.uT.slice(0, 6)}..`);
  const dpc = (P) => Pc.principal(P).willSendGte(0n);
  await denyCall('deny: smart sBTC->STX 100k sats (Zest + any DLMM top-up), user sends eq, clmm-pool-v1 + DLMM send >= 0 STX', TAKER, 'smart-swap-sbtc-for-stx',
    [uintCV(bIn), uintCV(mid * 95n / 100n), noneCV(), uintCV(mid), uintCV(1)],
    [Pc.principal(TAKER).willSendEq(bIn).ft(SBTC, SBTC_ASSET), Pc.principal(ZPOOL).willSendGte(0n).ustx(), ...DPOOLS.map((P) => dpc(P).ustx())], true);
  await denyCall('deny: smart STX->sBTC 300 STX (Zest + any DLMM top-up), user sends eq, clmm-pool-v1 + DLMM send >= 0 sBTC', TAKER, 'smart-swap-stx-for-sbtc',
    [uintCV(uIn), uintCV(mid * 105n / 100n), noneCV(), uintCV(mid), uintCV(1)],
    [Pc.principal(TAKER).willSendEq(uIn).ustx(), Pc.principal(ZPOOL).willSendGte(0n).ft(SBTC, SBTC_ASSET), ...DPOOLS.map((P) => dpc(P).ft(SBTC, SBTC_ASSET))], true);
  // Zest fills 0: mid shifted so the 32-tick window sits on bins holding none of the asked asset.
  // sell sBTC (walks down from tick(mid) + 2): mid x2 -> window far above the STX bins;
  // sell STX (walks up from tick(mid) - 2): mid /2 -> window far below the sBTC bins.
  for (const sell of [true, false]) {
    const tag = sell ? 'sBTC->STX' : 'STX->sBTC', amt = sell ? bIn : uIn;
    const d = await dlmmNet(sell);
    const L = sell ? (d * 97n) / 100n : (d * 103n) / 100n;
    const mArg = sell ? mid * 2n : mid / 2n;
    const kk = await denyCall(`deny: smart ${tag} ${amt}, mid ${sell ? 'x2' : '/2'} (${mArg}), limit ${L}: user eq, clmm-pool-v1 >= 0, DLMM >= 0`, TAKER,
      sell ? 'smart-swap-sbtc-for-stx' : 'smart-swap-stx-for-sbtc',
      [uintCV(amt), uintCV(L), noneCV(), uintCV(mArg), uintCV(1)],
      sell ? [Pc.principal(TAKER).willSendEq(amt).ft(SBTC, SBTC_ASSET), Pc.principal(ZPOOL).willSendGte(0n).ustx(), ...DPOOLS.map((P) => dpc(P).ustx())]
        : [Pc.principal(TAKER).willSendEq(amt).ustx(), Pc.principal(ZPOOL).willSendGte(0n).ft(SBTC, SBTC_ASSET), ...DPOOLS.map((P) => dpc(P).ft(SBTC, SBTC_ASSET))], true);
    check(`deny: smart ${tag} shifted mid: Zest fills 0, DLMM fills all, out = dlmm-out`,
      kk?.['zest-in'] === 0n && kk?.['zest-out'] === 0n && kk?.['dlmm-in'] === amt && kk?.unsold === 0n && kk?.out === kk?.['dlmm-out'] && kk?.out > 0n, show(kk));
  }
  await denyCall('deny: smart sBTC->STX without the Zest pool PC aborts', TAKER, 'smart-swap-sbtc-for-stx',
    [uintCV(bIn), uintCV(mid * 95n / 100n), noneCV(), uintCV(mid), uintCV(1)],
    [Pc.principal(TAKER).willSendEq(bIn).ft(SBTC, SBTC_ASSET)], false);
  check('router holds nothing', show(await bals(C.router)) === show({ st: 0n, sb: 0n }), show(await bals(C.router)));

  // ZEST_MAX_LIMIT: a mid above 1e21 skips the stage (no ticks, no Zest call) instead of overflowing
  // mid x 1e8 / limit x 1e16; at exactly 1e21 the walk still runs (32 empty ticks near tick 2545, fills 0)
  group('ZEST_MAX_LIMIT guard');
  const rz = await evalIn(C.router, '(list ZEST_MAX_LIMIT ZEST_LIMIT_TO_WAD)');
  check('router ZEST_MAX_LIMIT = 1e21, ZEST_LIMIT_TO_WAD = 1e8', rz[0] === ZMAX && rz[1] === L2W, show(rz));
  const rmx = await evalIn(C.router, `(list (zest-bound u${ZMAX} u${zfeeOf(true)} true) (zest-bound u${ZMAX} u${zfeeOf(false)} false))`);
  check('zest-bound at ZEST_MAX_LIMIT does not overflow and matches boundFor', rmx[0] === boundFor(true, ZMAX) && rmx[1] === boundFor(false, ZMAX), show(rmx));
  for (const sell of [true, false]) {
    const tag = sell ? 'sBTC->STX' : 'STX->sBTC', amt = sell ? 20_000n : 50_000_000n;
    const d = await dlmmNet(sell);
    const L = sell ? (d * 97n) / 100n : (d * 103n) / 100n;
    const dlmmAll = function zestSkippedDlmmAll(kk, pr) { return pr['zest-ticks'] === 0n && pr['zest-ok'] === false && kk['zest-in'] === 0n && kk['dlmm-in'] === amt && kk.unsold === 0n; };
    // mid x 1e8 would overflow u128 here without the guard (the tx would abort)
    await smart(`smart ${tag} mid = 1e31 (mid-wad would overflow): Zest stage skipped, DLMM fills all`, sell, amt, L, 1n, dlmmAll, 10n ** 31n);
    if (!sell) continue;
    // selling sBTC walks down from tick(mid) + 2, so a huge mid gives ticks unless the guard skips it
    await smart(`smart ${tag} mid = ZEST_MAX_LIMIT + 1: Zest stage skipped (0 ticks), DLMM fills all`, sell, amt, L, 1n, dlmmAll, ZMAX + 1n);
    await smart(`smart ${tag} mid = ZEST_MAX_LIMIT: stage runs (32 empty ticks), Zest fills 0, DLMM fills all`, sell, amt, L, 1n,
      function atMaxLimitWalks(kk, pr) { return pr['zest-ticks'] === 32n && kk['zest-in'] === 0n && kk['dlmm-in'] === amt && kk.unsold === 0n; }, ZMAX);
    // limit x 1e16 would overflow in zest-bound without the guard; nothing can meet it, all unsold
    await smart(`smart ${tag} limit = 1e31 (bound would overflow): ok, Zest skipped, all unsold`, sell, amt, 10n ** 31n, 0n,
      function hugeLimitUnsold(kk, pr) { return pr['zest-ticks'] === 0n && kk['zest-in'] === 0n && kk.unsold === amt && kk.out === 0n; });
  }

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
  const pct = (c, kx) => ((100 * Number(c[kx])) / LIM[kx]).toFixed(2) + '%';
  console.log('  fn                          amount            res   runtime          read_count     read_length      write_count   write_length');
  for (const x of rows) console.log(`  ${x.fn.padEnd(27)} ${String(x.amount).padStart(15)}  ${x.r.padEnd(5)} ${Object.keys(LIM).map((kx) => `${String(x.c[kx]).padStart(9)} ${pct(x.c, kx).padStart(6)}`).join('  ')}`);
  const worst = rows.filter((x) => x.r === '(ok ' && worstAmts.has(x.amount));
  check('worst cases found in the cost table (2 smart + 2 split)', worst.length === 4, show(worst.map((x) => [x.fn, x.amount])));
  for (const x of worst) check(`${x.fn} ${x.amount}: every dimension < 50% of the block limit`, Object.keys(LIM).every((kx) => Number(x.c[kx]) < LIM[kx] * 0.5), Object.keys(LIM).map((kx) => `${kx} ${pct(x.c, kx)}`).join(', '));
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(`crash: ${e.message}`); }
}
summary();
