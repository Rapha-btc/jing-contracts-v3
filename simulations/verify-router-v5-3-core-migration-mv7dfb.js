// Fork only. Run: node simulations/verify-router-v5-3-core-migration-mv7dfb.js
// (no oracle print needed: the swaps here have update none)
//
// Bounty mv7dfb (Giant Moth 01): Bitflow's `migrate-pool` moves a DLMM pool
// to a new core but leaves the old core's `pools` entry enabled. Every swap
// through the old core then asserts the pool's core-address (u1060,
// ERR_NOT_MANAGED_POOL). The router at f342615 still picks such a pool and
// the whole swap reverts; the router at 15aef66 (`dlmm-enabled` also checks
// `core-address`) skips it.
//
// No patch: the migration is Bitflow's own path on the fork, run as the real
// admin (SM1FKX..., the only entry of `admins` in dlmm-core-v-1-1):
//   1. deploy the live dlmm-core-v-1-1 source (read from the chain) as the
//      target core `dlmm-core-v-1-2`, add bin step 15 with the live factors,
//      set its migration source to dlmm-core-v-1-1;
//   2. dlmm-core-v-1-1: claim-protocol-fees (public), set-core-migration-target;
//   3. AdvanceBlocks past the 2-week cooldown (stacks-block-time);
//   4. dlmm-core-v-1-1 migrate-pool -> the pool's core-address is the target.
// Then, for OLD (router at f342615) and NEW (working tree) in two sessions at
// the same height: the same 5,000 STX smart sale and a 1,000 STX manual DLMM
// leg. OLD reverts with u1060; NEW skips the migrated pool and fills on the
// remaining pools.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { uintCV, intCV, listCV, contractPrincipalCV } from '@stacks/transactions';
import { submitSimulationSteps } from 'stxer';
import {
  ROUTER, DLMM_POOLS, DLMM_POOL_IDS, DLMM_CORE_ID, SBTC, WSTX, NODE, H, check, evRaw, tx, fund, deployAll, mk, fields, uint,
  principal, retry, manualArgs, smartArgs,
} from './_router-v5-3-harness.js';

const ADMIN = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD';
const DEP = ROUTER.split('.')[0];
const TARGET = `${DEP}.dlmm-core-v-1-2`;
const SMART = 5_000_000_000n; // 5,000 STX
const MANUAL = 5_000_000_000n; // 5,000 STX (the limit-blind pick of the same amount)
const OLD_REF = process.env.MIGRATION_OLD_REF ?? 'f342615';
const oldSrc = execFileSync('git', ['show', `${OLD_REF}:contracts/swap-router-sbtc-stx-jing-v5-3.clar`], { encoding: 'utf8' });
const [coreAddr, coreName] = DLMM_CORE_ID.split('.');
const coreSrc = (await (await fetch(`${NODE}/v2/contracts/source/${coreAddr}/${coreName}?proof=0`)).json()).source;
if (!coreSrc?.includes('define-public (migrate-pool')) throw new Error('could not read dlmm-core-v-1-1 source');
const cp = (id) => contractPrincipalCV(...id.split('.'));
const sbtcOf = (p) => `(unwrap-panic (contract-call? '${SBTC} get-balance '${p}))`;

async function tipHeight() {
  const r = await fetch(`${NODE}/v2/info`);
  return (await r.json()).stacks_tip_height;
}

async function deepestPrice() {
  const v = await evRaw(ROUTER, `(list ${DLMM_POOLS.map((d) => `(let ((p (unwrap-panic (contract-call? '${d} get-pool)))) { price: (unwrap-panic (contract-call? DLMM_CORE get-bin-price (get initial-price p) (get bin-step p) (get active-bin-id p))), sbtc: ${sbtcOf(d)} })`).join(' ')})`);
  const ps = [...String(v).matchAll(/\(tuple \(price u(\d+)\) \(sbtc u(\d+)\)\)/g)].map((m) => ({ price: BigInt(m[1]), sbtc: BigInt(m[2]) }));
  return ps.reduce((b, p) => (p.sbtc > b.sbtc ? p : b)).price;
}

const enabledAll = () => evRaw(ROUTER, `(list ${DLMM_POOLS.map((d, j) => `(dlmm-enabled '${d} u${DLMM_POOL_IDS[j]})`).join(' ')})`);
const sbtcAll = async () => [...String(await evRaw(ROUTER, `(list ${DLMM_POOLS.map(sbtcOf).join(' ')})`)).matchAll(/u(\d+)/g)].map((m) => BigInt(m[1]));

async function migrate(n) {
  const pool = DLMM_POOLS[n - 1], id = DLMM_POOL_IDS[n - 1];
  await fund('y', ADMIN, 10_000_000n);
  // protocol fees must be 0 before migrate-pool (claim is public)
  await tx(`claim-protocol-fees v-${n}`, ADMIN, DLMM_CORE_ID, 'claim-protocol-fees', [cp(pool), cp(WSTX), cp(SBTC)], '(ok true)');
  const f = String(await evRaw(ROUTER, '(unwrap-panic (unwrap-panic (contract-call? DLMM_CORE get-bin-factors-by-step u15)))'));
  const factors = [...f.matchAll(/u(\d+)/g)].map((m) => uintCV(BigInt(m[1])));
  check('live bin-step 15 factors read', String(factors.length), '1001');
  await tx('target core: add-bin-step u15 (live factors)', ADMIN, TARGET, 'add-bin-step', [uintCV(15), listCV(factors)], '(ok true)');
  await tx('target core: set-core-migration-source dlmm-core-v-1-1', ADMIN, TARGET, 'set-core-migration-source', [cp(DLMM_CORE_ID)], '(ok true)');
  await tx('dlmm-core-v-1-1: set-core-migration-target dlmm-core-v-1-2', ADMIN, DLMM_CORE_ID, 'set-core-migration-target', [cp(TARGET)], '(ok true)');
  const exec = uint(await evRaw(ROUTER, '(unwrap-panic (contract-call? DLMM_CORE get-core-migration-execution-time))'));
  const early = await tx('migrate-pool before the cooldown', ADMIN, DLMM_CORE_ID, 'migrate-pool', [cp(pool), cp(TARGET)], '(err u1059)');
  void early;
  const adv = await retry(() => submitSimulationSteps(H.sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 3, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 500_000 } }] }));
  check('AdvanceBlocks 3 x 500,000 s', JSON.stringify(adv.steps[0]).includes('Ok') ? 'ok' : JSON.stringify(adv.steps[0]).slice(0, 300), 'ok');
  const now = uint(await evRaw(ROUTER, 'stacks-block-time'));
  check(`stacks-block-time ${now} >= execution time ${exec}`, String(now >= exec), 'true');
  await tx(`dlmm-core-v-1-1: migrate-pool v-${n} -> dlmm-core-v-1-2`, ADMIN, DLMM_CORE_ID, 'migrate-pool', [cp(pool), cp(TARGET)], '(ok true)');
  check(`v-${n} get-pool core-address is the target`, String(await evRaw(ROUTER, `(get core-address (unwrap-panic (contract-call? '${pool} get-pool)))`)), TARGET);
  check(`old core entry for id ${id} still enabled and names v-${n}`, String(await evRaw(ROUTER, `(match (unwrap-panic (contract-call? DLMM_CORE get-pool-by-id u${id})) e (and (get status e) (is-eq (get pool-contract e) '${pool})) false)`)), 'true');
  // the core's own answer for the migrated pool (Bitflow's swap router folds
  // it into its u2001 ERR_NO_RESULT_DATA: the next fold step unwraps the err)
  const ab = String(await evRaw(ROUTER, `(get active-bin-id (unwrap-panic (contract-call? '${pool} get-pool)))`));
  const taker = mk(773);
  await fund('y', taker, 2_000_000n);
  await tx(`dlmm-core-v-1-1 swap-x-for-y on migrated v-${n} directly`, taker, DLMM_CORE_ID, 'swap-x-for-y', [cp(pool), cp(WSTX), cp(SBTC), intCV(Number(ab)), uintCV(1_000_000n)], '(err u1060)');
  check(`target core holds id ${id}`, String(await evRaw(ROUTER, `(is-some (unwrap-panic (contract-call? '${TARGET} get-pool-by-id u${id})))`)), 'true');
}

async function session(tag, height, src, limit, migrateN) {
  process.env.ROUTER_FORK_HEIGHT = String(height);
  await deployAll([['dlmm-core-v-1-2', coreSrc]], src ? { 'swap-router-sbtc-stx-jing-v5-3': src } : {});
  const sid = H.sid;
  const isNew = !src;
  limit ??= 10_000_000_000n * 100_000_000n * 150n / ((await deepestPrice()) * 100n); // 50% past: loose
  const smartPick = () => evRaw(ROUTER, isNew ? `(dlmm-pick false u${SMART} u${limit})` : `(dlmm-pick false u${SMART})`);
  const manualPick = () => evRaw(ROUTER, isNew ? `(dlmm-pick false u${MANUAL} u0)` : `(dlmm-pick false u${MANUAL})`);
  const pre = { smart: await smartPick(), manual: await manualPick(), enabled: await enabledAll() };
  check(`${tag}: all three pools enabled before the migration`, pre.enabled, '(list true true true)');
  const n = migrateN ?? Number(uint(pre.smart));
  check(`${tag}: pre-migration smart pick is the pool to migrate`, pre.smart, `u${n}`);
  await migrate(n);
  const post = { smart: await smartPick(), manual: await manualPick(), enabled: await enabledAll() };
  const want = ['true', 'true', 'true'];
  if (isNew) want[n - 1] = 'false';
  check(`${tag}: dlmm-enabled after migrating v-${n}`, post.enabled, `(list ${want.join(' ')})`);
  if (isNew) {
    check(`${tag}: smart pick skips v-${n}`, String(post.smart !== `u${n}`), 'true');
    check(`${tag}: manual pick skips v-${n}`, String(post.manual !== `u${n}`), 'true');
  } else {
    check(`${tag}: smart pick still v-${n}`, post.smart, `u${n}`);
    check(`${tag}: manual pick still v-${n}`, post.manual, `u${n}`);
  }
  console.log(`  ${tag} @${height}: limit ${limit}; pre ${JSON.stringify(pre)}; post ${JSON.stringify(post)}`);
  // u1060 in the core, surfaced as u2001 by dlmm-swap-router-v-1-2 (see above)
  const want1060 = (v) => String(v) === '(err u2001)';
  const okOut = (v) => String(v).startsWith('(ok');
  // smart sale
  const taker = mk(772);
  await fund('y', taker, SMART + MANUAL + 20_000_000n);
  const b0 = await sbtcAll();
  const s = await tx(`${tag}: smart 5,000 STX`, taker, ROUTER, 'smart-swap-stx-for-sbtc', smartArgs({ amount: SMART, limit, mid: 1n }), isNew ? okOut : want1060);
  const b1 = await sbtcAll();
  const smartMoved = b0.map((x, j) => String(x - b1[j]));
  if (isNew) {
    check(`${tag}: smart sale took no sBTC from migrated v-${n}`, smartMoved[n - 1], '0');
    check(`${tag}: smart sale filled on the DLMM (dlmm-in > 0)`, String((s.f['dlmm-in'] ?? 0n) > 0n), 'true');
    check(`${tag}: smart DLMM fill came from the new pick v-${uint(post.smart)}`, String(BigInt(smartMoved[Number(uint(post.smart)) - 1]) > 0n), 'true');
  }
  // manual leg naming the DLMM (all 1,000 STX on dlmm, no book)
  const m = await tx(`${tag}: manual 5,000 STX, DLMM leg`, taker, ROUTER, 'swap-stx-for-sbtc', manualArgs({ amount: MANUAL, a: [MANUAL, 0n, 0n] }), isNew ? okOut : want1060);
  const b2 = await sbtcAll();
  const manualMoved = b1.map((x, j) => String(x - b2[j]));
  if (isNew) {
    check(`${tag}: manual leg took no sBTC from migrated v-${n}`, manualMoved[n - 1], '0');
    check(`${tag}: manual DLMM leg filled on v-${uint(post.manual)}`, String(BigInt(manualMoved[Number(uint(post.manual)) - 1]) > 0n), 'true');
  }
  console.log(`  ${tag}: smart ${s.result}`);
  console.log(`  ${tag}: manual ${m.result}`);
  return { sid, limit, n, pre, post, smart: s.result, manual: m.result, smartMoved, manualMoved };
}

const height = Number(process.env.MIGRATION_HEIGHT ?? (await tipHeight()) - 3);
const old = await session('OLD', height, oldSrc, undefined, undefined);
const nu = await session('NEW', height, null, old.limit, old.n);
const report = {
  bounty: 'mv7dfb Giant Moth 01', height, oldRouter: OLD_REF, newRouter: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
  migratedPool: `v-${old.n}`, limit: String(old.limit),
  old: { simulation: `https://stxer.xyz/simulations/mainnet/${old.sid}`, ...old, sid: undefined, limit: undefined },
  new: { simulation: `https://stxer.xyz/simulations/mainnet/${nu.sid}`, ...nu, sid: undefined, limit: undefined },
  passed: H.passed, checks: H.checks,
};
fs.writeFileSync(new URL('./fixtures/router-v5-3-core-migration-mv7dfb.json', import.meta.url), JSON.stringify(report, (_, v) => typeof v === 'bigint' ? String(v) : v, 2) + '\n');
console.log(`\n${H.passed}/${H.checks} checks green`);
console.log(JSON.stringify({ old: report.old.simulation, new: report.new.simulation, migrated: report.migratedPool }));
