// Fork only. Run: node simulations/verify-router-v5-3-limit-pick-mv7dfb.js
// (no oracle print needed: the smart swaps here have update none)
//
// Bounty mv7dfb (Zealous Citadel): the smart DLMM stage ranked pools with a
// limit-blind 30-bin walk (`dlmm-out`), then sized the winner with
// `dlmm-capacity` at the limit. A deep pool parked past the limit outranked
// an in-range pool: capacity 0, DLMM sold nothing.
//
// For each block (their block 9203637, then the tip - 3) two stxer sessions
// at the same height: PROD deploys the router at HEAD (git show), NEW the
// working-tree router. Same 5,000 STX smart sale (stx -> sBTC), same limit
// (2% past the deepest-sBTC pool's active-bin price, unless MV7DFB_LIMIT),
// update none, mid u1. Checks: NEW picks a pool with capacity > 0 inside the
// limit; NEW out >= PROD out; the manual pick (limit u0) is the same on both.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { uintCV, noneCV } from '@stacks/transactions';
import {
  ROUTER, DLMM_POOLS, H, check, evRaw, tx, fund, deployAll, mk, fields, uint,
} from './_router-v5-3-harness.js';

const AMOUNT = 5_000_000_000n; // 5,000 STX
// PROD = the router at HEAD (or the file in MV7DFB_PROD_FILE)
const prodSrc = process.env.MV7DFB_PROD_FILE ? fs.readFileSync(process.env.MV7DFB_PROD_FILE, 'utf8')
  : execFileSync('git', ['show', 'HEAD:contracts/swap-router-sbtc-stx-jing-v5-3.clar'], { encoding: 'utf8' });

async function tipHeight() {
  const r = await fetch('http://77.42.3.101/stacks-api/v2/info');
  return (await r.json()).stacks_tip_height;
}

// active-bin price (sats per uSTX x 1e8) and sBTC depth of each pool
async function pools() {
  const v = await evRaw(ROUTER, `(list ${DLMM_POOLS.map((d) => `(let ((p (unwrap-panic (contract-call? '${d} get-pool)))) { ab: (get active-bin-id p), price: (unwrap-panic (contract-call? DLMM_CORE get-bin-price (get initial-price p) (get bin-step p) (get active-bin-id p))), sbtc: (unwrap-panic (contract-call? SBTC get-balance '${d})) })`).join(' ')})`);
  return [...String(v).matchAll(/\(tuple \(ab (-?\d+)\) \(price u(\d+)\) \(sbtc u(\d+)\)\)/g)].map((m) => ({ ab: Number(m[1]), price: BigInt(m[2]), sbtc: BigInt(m[3]) }));
}

async function session(tag, height, src, limitIn) {
  process.env.ROUTER_FORK_HEIGHT = String(height);
  await deployAll([], src ? { 'swap-router-sbtc-stx-jing-v5-3': src } : {});
  const sid = H.sid;
  const ps = await pools();
  const deepest = ps.reduce((b, p, i) => (p.sbtc > ps[b].sbtc ? i : b), 0);
  const limit = limitIn ?? 10_000_000_000n * 100_000_000n / ps[deepest].price * 102n / 100n;
  const newArity = !src;
  const pickSmart = await evRaw(ROUTER, newArity ? `(dlmm-pick false u${AMOUNT} u${limit})` : `(dlmm-pick false u${AMOUNT})`);
  const pickManual = await evRaw(ROUTER, newArity ? `(dlmm-pick false u${AMOUNT} u0)` : `(dlmm-pick false u${AMOUNT})`);
  const caps = await evRaw(ROUTER, `(list ${[1, 2, 3].map((n) => `(dlmm-capacity u${limit} false u${n})`).join(' ')})`);
  const taker = mk(771);
  await fund('y', taker, AMOUNT + 10_000_000n);
  const r = await tx(`${tag}: smart 5,000 STX at limit ${limit}`, taker, ROUTER, 'smart-swap-stx-for-sbtc',
    [uintCV(AMOUNT), uintCV(limit), noneCV(), uintCV(1), uintCV(0)], (v) => String(v).startsWith('(ok'));
  console.log(`  ${tag} @${height}: pools ${JSON.stringify(ps.map((p) => ({ ab: p.ab, price: String(p.price), sbtc: String(p.sbtc) })))}`);
  console.log(`  ${tag} @${height}: smart pick ${pickSmart}, manual pick ${pickManual}, caps ${caps}`);
  console.log(`  ${tag} @${height}: ${r.result}`);
  return { sid, limit, pickSmart, pickManual, caps, f: r.f };
}

const summary = [];
async function block(height, limitIn) {
  console.log(`\n######## block ${height} ########`);
  const prod = await session('PROD', height, prodSrc, limitIn);
  const nu = await session('NEW', height, null, prod.limit);
  const caps = [...String(nu.caps).matchAll(/u(\d+)/g)].map((m) => BigInt(m[1]));
  const capOfNew = caps[Number(uint(nu.pickSmart)) - 1];
  check(`${height}: NEW smart pick has capacity inside the limit (or no pool has)`, String(capOfNew > 0n || caps.every((c) => c === 0n)), 'true');
  check(`${height}: NEW manual pick (u0) == PROD manual pick`, nu.pickManual, prod.pickManual);
  check(`${height}: NEW out >= PROD out`, String(nu.f.out >= prod.f.out), 'true');
  const gain = prod.f.out > 0n ? Number((nu.f.out - prod.f.out) * 100_000n / prod.f.out) / 1000 : null;
  const row = { height, limit: String(prod.limit), prodPick: prod.pickSmart, newPick: nu.pickSmart, prodDlmmIn: String(prod.f['dlmm-in']), newDlmmIn: String(nu.f['dlmm-in']),
    prodOut: String(prod.f.out), newOut: String(nu.f.out), gainPct: gain, prod: `https://stxer.xyz/simulations/mainnet/${prod.sid}`, new: `https://stxer.xyz/simulations/mainnet/${nu.sid}` };
  summary.push(row);
  console.log(JSON.stringify(row));
}

const blocks = process.env.MV7DFB_BLOCKS ? process.env.MV7DFB_BLOCKS.split(',').map(Number) : [9203637, (await tipHeight()) - 3];
const limitIn = process.env.MV7DFB_LIMIT ? BigInt(process.env.MV7DFB_LIMIT) : undefined;
for (const b of blocks) await block(b, b === 9203637 && !limitIn ? 19_578_110_904_240n : limitIn);
console.log(`\n${H.passed}/${H.checks} checks green`);
console.log(JSON.stringify(summary, null, 2));
