// Fork only. Run: node simulations/verify-router-v5-3-pool-pick-steer.js
// (no oracle print needed: every router call here has update none)
//
// Regression for the 1063add pick (best ACTIVE-BIN price among pools with
// >= 1% of the deepest balance of the asset bought). A pool's active bin
// moves through empty bins without moving tokens (dlmm-core swaps on a bin
// with nothing to sell only step the bin), so its active-bin price can sit
// far from the bins that hold its liquidity. Fixture, public calls only:
//
//  1. two 1-uSTX `swap-x-for-y-simple-range-multi` calls move
//     dlmm-pool-stx-sbtc-v-3-bps-15 (22.75 STX at bin -222, nothing else)
//     down to bin -500 (no token moves);
//  2. an LP adds 1% of v-1's STX to v-3 at bin -300, so v-3 is eligible for
//     sBTC sales while its active bin (-500, empty) quotes below v-1.
//
// Then, per router:
//  - 1063add (contrast): `dlmm-pick true` returns u3 and a manual DLMM-only
//    sBTC sale (min u0) fills on v-3's far bin for less than v-1 pays.
//  - 280c81c (the fix, working tree): the pick walks each eligible pool's
//    bins for the amount (`dlmm-out`); v-3 pays u0 within 30 bins, so the
//    pick stays u1 (modelled and checked), the manual sale receives exactly
//    what the same sale straight on v-1 receives (`stprobe-v1`, rolled back),
//    and a smart sale's DLMM leg runs on v-1 with dlmm-cap > 0.
import { execFileSync } from 'node:child_process';
import { uintCV, intCV, noneCV } from '@stacks/transactions';
import {
  ROUTER, SBTC, WSTX, DLMM_POOLS, DLMM_CORE_ID, dlmmPick, H, check, evRaw, tx, fund, deployAll, wallet,
  manualArgs, manualFn, smartArgs, smartFn, mk, principal, source, uint, printsOf, fields, shas,
} from './_router-v5-3-harness.js';

process.env.ROUTER_RENEW_TENURE = '1';
const DLMM_ROUTER = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-2';
const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const [V1, , V3] = DLMM_POOLS;
const LP_BIN = -300;
const AMOUNT = 1_000_000n;
const PROBE = `;; stprobe-v1: an sBTC sale straight on v-1, always rolled back (err carries out)
(define-public (sell-sbtc-v1 (amount uint))
  (match (contract-call? '${DLMM_ROUTER} swap-y-for-x-simple-range-multi '${V1} '${WSTX} '${SBTC} amount u1 u230 none)
    r (if true (err (get out r)) (ok u0))
    e (if true (err (+ u1000000000000000 e)) (ok u0))))
`;
const active = async (pool) => Number(await evRaw(ROUTER, `(get active-bin-id (unwrap-panic (contract-call? '${pool} get-pool)))`));
const summary = {};

async function fixture(label) {
  const LP = mk(881);
  const depths = [...String(await evRaw(ROUTER, `(list ${DLMM_POOLS.map((d) => `(stx-get-balance '${d})`).join(' ')})`)).matchAll(/u(\d+)/g)].map((m) => BigInt(m[1]));
  const floor = depths.reduce((a, b) => (b > a ? b : a), 0n) / 100n;
  const add = floor - depths[2] + 1_000_000n;
  await fund('y', LP, add + 10_000_000n);
  for (let i = 0; i < 3 && (await active(V3)) > -500; i++) {
    const w0 = await wallet(LP);
    const r = await tx(`${label} fixture: step v-3 down through empty bins (1 uSTX, 230 steps)`, LP, DLMM_ROUTER, 'swap-x-for-y-simple-range-multi',
      [principal(V3), principal(WSTX), principal(SBTC), uintCV(1n), uintCV(0n), uintCV(230n), noneCV()], (v) => String(v).startsWith('(ok'));
    const w1 = await wallet(LP);
    check(`${label} fixture: the step moved no tokens`, `${r.result} ${w0.x - w1.x} ${w0.y - w1.y}`, '(ok (tuple (in u0) (out u0))) 0 0');
  }
  check(`${label} fixture: v-3 active bin -500`, String(await active(V3)), '-500');
  await tx(`${label} fixture: LP adds ${add} uSTX to v-3 at bin ${LP_BIN} (floor ${floor})`, LP, DLMM_CORE_ID, 'add-liquidity',
    [principal(V3), principal(WSTX), principal(SBTC), intCV(LP_BIN), uintCV(add), uintCV(0n), uintCV(1n), uintCV(0n), uintCV(0n)], (v) => String(v).startsWith('(ok'));
  const v3 = uint(await evRaw(ROUTER, `(stx-get-balance '${V3})`));
  check(`${label} fixture: v-3 holds >= 1% of the deepest pool's STX`, String(v3 >= floor), 'true');
}

async function sale(label, taker) {
  const d = await tx(`${label}: the same sale straight on v-1 (rolled back)`, taker, `${DEP}.stprobe-v1`, 'sell-sbtc-v1', [uintCV(AMOUNT)], (v) => /^\(err u\d+\)$/.test(String(v)));
  const direct = uint(String(d.result).slice(5, -1));
  check(`${label}: v-1 direct fills`, String(direct > 0n && direct < 1_000_000_000_000_000n), 'true');
  const w0 = await wallet(taker);
  const r = await tx(`${label}: manual DLMM-only sale of ${AMOUNT} sats, min u0`, taker, ROUTER, manualFn(true), manualArgs({ amount: AMOUNT, a: [AMOUNT, 0n, 0n] }), (v) => String(v).startsWith('(ok'));
  const got = (await wallet(taker)).y - w0.y;
  check(`${label}: wallet gain == out`, String(got), String(r.f.out));
  return { direct, got, r };
}

async function run1063() {
  const label = '1063add';
  console.log(`\n######## ${label} (contrast) ########`);
  const src = execFileSync('git', ['show', '1063add:contracts/swap-router-sbtc-stx-jing-v5-3.clar'], { encoding: 'utf8' });
  await deployAll([['stprobe-v1', PROBE]], { 'swap-router-sbtc-stx-jing-v5-3': src });
  const taker = mk(882);
  await fund('x', taker, 2_000_000n);
  check(`${label}: before the fixture an sBTC sale picks v-1`, await evRaw(ROUTER, '(dlmm-pick true)'), 'u1');
  await fixture(label);
  check(`${label}: after the fixture the pick moves to v-3 (empty active bin quotes lowest)`, await evRaw(ROUTER, '(dlmm-pick true)'), 'u3');
  const { direct, got } = await sale(label, taker);
  check(`${label}: the taker receives less than v-1 pays`, String(got < direct), 'true');
  const lossBps = (direct - got) * 10_000n / direct;
  console.log(`  ${label}: router ${got} uSTX vs v-1 direct ${direct} uSTX (${Number(lossBps) / 100}% less)`);
  summary[label] = { sim: `https://stxer.xyz/simulations/mainnet/${H.sid}`, pick: 'u3', routerOut: String(got), v1Direct: String(direct), lossBps: String(lossBps) };
}

async function run280() {
  const label = '280c81c';
  console.log(`\n######## ${label} (working tree) ########`);
  await deployAll([['stprobe-v1', PROBE]]);
  const taker = mk(883);
  await fund('x', taker, 2_000_000n);
  const pk0 = await dlmmPick(true, AMOUNT, `${label} before the fixture`);
  check(`${label}: before the fixture an sBTC sale picks v-1`, `u${pk0.n}`, 'u1');
  await fixture(label);
  const pk = await dlmmPick(true, AMOUNT, `${label} after the fixture`);
  check(`${label}: v-3 is eligible, both pools walked`, `${pk.e[0]} ${pk.e[2]} ${pk.walked}`, 'true true true');
  check(`${label}: v-3 pays u0 for ${AMOUNT} within 30 bins (its active bin and the 29 above are empty)`, String(pk.outs[2]), '0');
  check(`${label}: the pick stays v-1`, `u${pk.n}`, 'u1');
  const { direct, got, r } = await sale(label, taker);
  check(`${label}: the taker receives exactly what v-1 pays`, String(got), String(direct));
  check(`${label}: dlmm-in == amount`, String(r.f['dlmm-in']), String(AMOUNT));
  // smart, update none, limit 5% beyond v-1's active bin
  const p1 = pk.pools[0];
  const v1Limit = 10_000_000_000n * 100_000_000n / p1.price;
  const limit = v1Limit * 95n / 100n;
  const pk2 = await dlmmPick(true, 500_000n, `${label} smart`);
  check(`${label} smart: pick v-1`, `u${pk2.n}`, 'u1');
  const cap = uint(await evRaw(ROUTER, `(dlmm-capacity u${limit} true u1)`, taker));
  const s = await tx(`${label}: smart sale 500000 sats at limit ${limit}`, taker, ROUTER, smartFn(true), smartArgs({ amount: 500_000n, limit, mid: v1Limit }), (v) => String(v).startsWith('(ok'));
  const pr = fields(printsOf(s, ROUTER)[0]);
  check(`${label} smart: dlmm-cap == v-1 capacity read before, > 0`, `${pr['dlmm-cap']} ${cap > 0n}`, `${cap} true`);
  check(`${label} smart: DLMM leg runs on v-1`, String(s.f['dlmm-in'] > 0n), 'true');
  summary[label] = { sim: `https://stxer.xyz/simulations/mainnet/${H.sid}`, pick: 'u1', routerOut: String(got), v1Direct: String(direct), v3Est: String(pk.outs[2]), v1Est: String(pk.outs[0]), smartDlmmCap: String(pr['dlmm-cap']) };
}

async function main() {
  const sha0 = shas();
  await run280();
  const h280 = `${H.passed}/${H.checks}`;
  await run1063();
  check('sources unchanged during the run', JSON.stringify(shas()), JSON.stringify(sha0));
  console.log(JSON.stringify(summary, null, 1));
  console.log(`${H.passed}/${H.checks} checks green (280c81c part ${h280})`);
}
main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; });
