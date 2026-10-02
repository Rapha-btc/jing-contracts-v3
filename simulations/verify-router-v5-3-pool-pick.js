// Fork only. Run: node simulations/verify-router-v5-3-pool-pick.js
// (no oracle print needed: every router call here has update none)
//
// swap-router-sbtc-stx-jing-v5-3 since df091b8: each DLMM leg uses the
// deepest of Bitflow's three STX/sBTC pools (dlmm-pool-stx-sbtc-v-1/v-2/v-3-
// bps-15) for the asset it buys: STX when selling sBTC, sBTC when selling
// STX; ties go to the lower number (`dlmm-pick`). Unmodified working-tree
// router / market v6-3 / core-v6 / ladder-v1 on a mainnet fork at the tip.
//
//  T  at the tip, both directions: the model reads the three pools, picks,
//     and the router's `dlmm-pick` agrees. On 2026-10-01 an sBTC sale picks
//     v-1 and skips v-2 (bin +500, 766 uSTX left: one-sided); an STX sale
//     picks v-2 (the most sBTC). One manual DLMM-only sale and one smart sale
//     (update none) per direction succeed on the picked pool.
//  D  drain: manual DLMM-only sBTC sales until the pool the router picks for
//     an sBTC sale sits at bin +500 (its STX nearly gone), so the next
//     deposits below stay small.
//  L  every other pick, reached with public liquidity: an LP adds STX (bins
//     at or above the active bin) or sBTC (at or below) through
//     dlmm-core-v-1-1 `add-liquidity` until the target pool is the deepest:
//     sBTC sale -> v-3, then v-2; STX sale -> v-1, then v-3. The same two
//     sales run on each new pick. Together with T this runs every pick arm
//     and every pool arm of the DLMM swap, `dlmm-pool-info` and
//     `dlmm-bin-balances` in both directions.
//  Every sale: only the picked pool's balances move; it pays out exactly
//  dlmm-out of the bought asset; the wallet loses dlmm-in of the sold asset
//  and gains out; the smart sale's dlmm-cap equals `dlmm-capacity` read just
//  before it, as the caller.
import {
  DEP, ROUTER, MARKET, SBTC, WSTX, DLMM_POOLS, dlmmPick,
  H, check, ev, evRaw, tx, fund, deployAll, wallet, manualArgs, manualFn, smartArgs, smartFn,
  fields, mk, principal, shas, uint, printsOf,
} from './_router-v5-3-harness.js';
import { uintCV, intCV } from '@stacks/transactions';

process.env.ROUTER_RENEW_TENURE = '1';
const DLMM_CORE = 'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1';
const name = (p) => p.split('.')[1];
const poolBal = async () => {
  const v = await evRaw(MARKET, `(list ${DLMM_POOLS.map((d) => `(stx-get-balance '${d}) (unwrap-panic (contract-call? '${SBTC} get-balance '${d}))`).join(' ')})`);
  return [...String(v).matchAll(/u(\d+)/g)].map((m) => BigInt(m[1]));
};
const active = async (pool) => Number(await evRaw(ROUTER, `(get active-bin-id (unwrap-panic (contract-call? '${pool} get-pool)))`));
// the active bin's price as a router limit (uSTX per sat x 1e10)
const binLimit = async (pool) => uint(await evRaw(ROUTER, `(let ((p (unwrap-panic (contract-call? '${pool} get-pool)))) (/ (* PRICE_SCALE DLMM_PRICE_SCALE) (unwrap-panic (contract-call? DLMM_CORE get-bin-price (get initial-price p) (get bin-step p) (get active-bin-id p)))))`));

// one manual DLMM-only sale and one smart sale on the modelled pick
async function sales(tag, sellX, taker, amount, expectPick) {
  const pk = await dlmmPick(sellX, `${tag} ${sellX ? 'sBTC' : 'STX'} sale`);
  if (expectPick) check(`${tag}: the deepest pool is ${name(DLMM_POOLS[expectPick - 1])}`, `u${pk.n}`, `u${expectPick}`);
  console.log(`  ${tag}: pick ${name(pk.pool)}; depth of the bought asset ${pk.depths.join(' / ')}`);
  const i = pk.n - 1, bought = sellX ? 0 : 1, sold = 1 - bought, inS = sellX ? 'x' : 'y', outS = sellX ? 'y' : 'x';
  const moved = (b0, b1) => DLMM_POOLS.map((_, j) => j === i || (b0[2 * j] === b1[2 * j] && b0[2 * j + 1] === b1[2 * j + 1])).every(Boolean);

  // manual: the whole amount on the DLMM, min u0 (floored to u1)
  let b0 = await poolBal(), w0 = await wallet(taker);
  const r = await tx(`${tag} manual DLMM sale of ${amount}`, taker, ROUTER, manualFn(sellX), manualArgs({ amount, a: [amount, 0n, 0n] }), (v) => String(v).startsWith('(ok'));
  let b1 = await poolBal(), w1 = await wallet(taker);
  // the DLMM router may stop short (its bin-step cap or the pool's edge):
  // a partial fill leaves the rest unsold in the wallet
  check(`${tag} manual: 0 < dlmm-in <= amount, dlmm-in + unsold == amount, out == dlmm-out > 0, other legs u0`, `${r.f['dlmm-in'] > 0n && r.f['dlmm-in'] <= amount} ${r.f['dlmm-in'] + r.f.unsold} ${r.f.out === r.f['dlmm-out'] && r.f.out > 0n} ${r.f['xyk-in']} ${r.f['velar-in']} ${r.f['jing-in']}`, `true ${amount} true 0 0 0`);
  check(`${tag} manual: only ${name(pk.pool)} moved`, moved(b0, b1), true);
  check(`${tag} manual: ${name(pk.pool)} paid out exactly dlmm-out`, String(b0[2 * i + bought] - b1[2 * i + bought]), String(r.f['dlmm-out']));
  check(`${tag} manual: ${name(pk.pool)} took the sold asset (<= dlmm-in)`, String(b1[2 * i + sold] > b0[2 * i + sold] && b1[2 * i + sold] - b0[2 * i + sold] <= r.f['dlmm-in']), 'true');
  check(`${tag} manual: wallet -dlmm-in / +out`, `${w0[inS] - w1[inS]} ${w1[outS] - w0[outS]}`, `${r.f['dlmm-in']} ${r.f.out}`);

  // smart, update none, limit 20% beyond the picked pool's active bin
  const pk2 = await dlmmPick(sellX, `${tag} smart`);
  check(`${tag} smart: same pick after the manual sale`, `u${pk2.n}`, `u${pk.n}`);
  const P = await binLimit(pk2.pool);
  const limit = sellX ? P * 8n / 10n : P * 12n / 10n;
  const cap = uint(await evRaw(ROUTER, `(dlmm-capacity u${limit} ${sellX})`, taker));
  check(`${tag} smart: ${name(pk2.pool)} has room at the limit`, String(cap > 0n), 'true');
  const sAmt = cap < amount ? cap : amount;
  b0 = await poolBal(); w0 = await wallet(taker);
  const s = await tx(`${tag} smart sale of ${sAmt} at limit ${limit}`, taker, ROUTER, smartFn(sellX), smartArgs({ amount: sAmt, limit, mid: P }), (v) => String(v).startsWith('(ok'));
  b1 = await poolBal(); w1 = await wallet(taker);
  const pr = printsOf(s, ROUTER);
  check(`${tag} smart: one router print`, String(pr.length), '1');
  const p = fields(pr[0]);
  check(`${tag} smart: dlmm-cap == dlmm-capacity read before, dlmm-in == min(cap, amount)`, `${p['dlmm-cap']} ${s.f['dlmm-in']}`, `${cap} ${sAmt}`);
  check(`${tag} smart: only ${name(pk2.pool)} moved`, moved(b0, b1), true);
  check(`${tag} smart: ${name(pk2.pool)} paid out exactly dlmm-out`, String(b0[2 * i + bought] - b1[2 * i + bought]), String(s.f['dlmm-out']));
  check(`${tag} smart: wallet -legs in / +out`, `${w0[inS] - w1[inS]} ${w1[outS] - w0[outS]}`, `${s.f['jing-in'] + s.f['dlmm-in'] + s.f['xyk-in'] + s.f['velar-in']} ${s.f.out}`);
}

// public liquidity until `target` (1..3) holds the most of the asset an
// (sellX ? sBTC : STX) sale buys; STX goes in at or above the active bin,
// sBTC at or below it
async function deepen(tag, target, sellX, lp) {
  const b = await poolBal(), k = sellX ? 0 : 1;
  const depths = [0, 1, 2].map((j) => b[2 * j + k]);
  const others = Math.max(...depths.filter((_, j) => j !== target - 1).map(Number));
  const add = BigInt(Math.max(others, 0)) - depths[target - 1] + (sellX ? 1_000_000_000n : 1_000_000n);
  const pool = DLMM_POOLS[target - 1], a = await active(pool);
  await fund(sellX ? 'y' : 'x', lp, add);
  const bin = sellX ? Math.min(a + 1, 500) : Math.max(a - 1, -500);
  await tx(`${tag} LP adds ${add} ${sellX ? 'uSTX' : 'sats'} to ${name(pool)} at bin ${bin} (active ${a})`, lp, DLMM_CORE, 'add-liquidity',
    [principal(pool), principal(WSTX), principal(SBTC), intCV(bin), uintCV(sellX ? add : 0n), uintCV(sellX ? 0n : add), uintCV(1n), uintCV(add), uintCV(add)], (v) => String(v).startsWith('(ok'));
}

async function main() {
  const sha0 = shas();
  console.log('sha256 at start:', JSON.stringify(sha0));
  await deployAll();
  const TX = mk(851), TY = mk(852), LP = mk(853);
  await fund('x', TX, 50_000_000n);
  await fund('y', TY, 20_000_000_000n);
  await fund('x', TX, 500_000_000n); // the drain

  console.log('\nT the pick at the fork, both directions');
  const b = await poolBal();
  console.log(`  pools (STX, sats): ${DLMM_POOLS.map((d, j) => `${name(d)} ${b[2 * j]} / ${b[2 * j + 1]}`).join('; ')}`);
  await sales('T', true, TX, 100_000n);
  await sales('T', false, TY, 200_000_000n);

  console.log('\nD drain the sBTC-sale pick to bin +500');
  let pk = await dlmmPick(true, 'D start');
  for (let i = 0; i < 20 && (await active(pk.pool)) < 500; i++) {
    const w0 = await wallet(TX);
    const r = await tx(`D manual DLMM leg ${i + 1} on ${name(pk.pool)}, 20000000 sats`, TX, ROUTER, manualFn(true), manualArgs({ amount: 20_000_000n, a: [20_000_000n, 0n, 0n] }), (v) => String(v).startsWith('(ok'));
    const w1 = await wallet(TX);
    check(`D leg ${i + 1}: wallet -dlmm-in / +out, unsold == amount - dlmm-in`, `${w0.x - w1.x} ${w1.y - w0.y} ${r.f.unsold}`, `${r.f['dlmm-in']} ${r.f.out} ${20_000_000n - r.f['dlmm-in']}`);
    console.log(`  ${name(pk.pool)} active bin now ${await active(pk.pool)}`);
    pk = await dlmmPick(true, `D after leg ${i + 1}`);
  }
  check('D the sBTC-sale pick sits at bin +500', String(await active(pk.pool)), '500');

  console.log('\nL every other pick, through public liquidity');
  for (const [target, sellX] of [[3, true], [2, true], [1, false], [3, false]]) {
    const tag = `L ${sellX ? 'sBTC' : 'STX'} sale on v-${target}`;
    const now = (await dlmmPick(sellX, `${tag}: before`)).n;
    if (now !== target) await deepen(tag, target, sellX, LP);
    await sales(tag, sellX, sellX ? TX : TY, sellX ? 100_000n : 200_000_000n, target);
  }

  const sha1 = shas();
  console.log('sha256 at end:', JSON.stringify(sha1));
  check('sources unchanged during the run', JSON.stringify(sha1), JSON.stringify(sha0));
  console.log(`${H.passed}/${H.checks} checks green`);
  console.log(`Sim: https://stxer.xyz/simulations/mainnet/${H.sid}`);
}
main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; });
