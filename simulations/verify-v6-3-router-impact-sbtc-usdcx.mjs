// verify-v6-3-router-impact-sbtc-usdcx.mjs - port of verify-v6-3-router-impact.js
// to the sBTC/USDCx v6-5 set: exact baseline/current comparison of the market
// + router pair, same block, same signed [1,7] update.
//   current  = markets-sbtc-usdcx-jing-v6-5 + swap-router-sbtc-usdcx-jing-v5-6
//              (exact template bytes, hash-checked)
//   baseline = the LIVE predecessor pair as deployed on mainnet:
//              markets-sbtc-usdcx-jing-v6-4 + swap-router-sbtc-usdcx-jing-v5-5
//              (sources read from the node), deployed under the SAME names as
//              the current pair (router rebound to that name), so every wallet
//              snapshot and result tuple is comparable 1:1.
// The STX original's baseline (git f6a6d3a, pre-submit/settle v6-3 on
// jing-core-v5, deposits carrying an update) has no sBTC/USDCx counterpart:
// this pair was submit/settle from its first deploy. Both pairs here run on
// the LIVE jing-core-v6 / jing-ladder-sbtc-usdcx-v1, fork pinned before the
// v6-5 market went live (see the plumbing).
// Amounts (rederived at mid ~ BTC/USD; min 1000 sats / 1 USDCx):
//   x taker (sells sBTC): normal 3000 sats, partial 2000 sats against a bid of
//     1700 sats' worth of USDCx (asserted >= 1 USDCx), ample bid 30 USDCx;
//   y taker (sells USDCx): normal 6 USDCx, partial 4 USDCx against an ask of
//     3.5 USDCx' worth of sats, ample ask 12000 sats; below-min 500 sats / 0.5 USDCx.
// The router legs carry zero AMM amounts (Jing book only), as in the original.
// Run: node simulations/verify-v6-3-router-impact-sbtc-usdcx.mjs
import fs from 'node:fs';
import { tupleCV, uintCV, someCV, noneCV, boolCV } from '@stacks/transactions';
import {
  S, DEP, NODE, CORE, principal, mk, keeper, ok, update, check, finishPhase, ev, tx,
  balance, pending, live, settleArgs, freshAfter, fund, deployCode, traits, assets, pairArgs,
  startSim, printHashes, bytes, PIN, retry,
} from './_v6-3-port-plumbing-sbtc-usdcx.mjs';
import { sha256, NAMES, MARKET } from './_sbtc-usdcx-v6-5-common.mjs';

S.stopOnFail = true;
const other = (side) => side === 'x' ? 'y' : 'x';
async function liveSource(name) {
  const r = await retry(() => fetch(`${NODE}/v2/contracts/source/${DEP}/${name}?proof=0`));
  if (!r.ok) throw new Error(`source ${name}: ${r.status}`);
  return (await r.json()).source;
}
async function main() {
  printHashes();
  const baseMarket = await liveSource('markets-sbtc-usdcx-jing-v6-4');
  const baseRouter0 = await liveSource('swap-router-sbtc-usdcx-jing-v5-5');
  const OLD = `${DEP}.markets-sbtc-usdcx-jing-v6-4`;
  if (baseRouter0.split(OLD).length !== 3) throw new Error('baseline router: market principal not found exactly twice');
  const baseRouter = baseRouter0.split(OLD).join(MARKET);
  const baseline = { market: baseMarket, router: baseRouter, sha256: { market: sha256(baseMarket), router: sha256(baseRouter0) } };
  console.log(`baseline live v6-4 ${baseMarket.length} B sha256 ${baseline.sha256.market}; live v5-5 ${baseRouter0.length} B sha256 ${baseline.sha256.router}`);
  const router = `${DEP}.${NAMES.router}`, zero = tupleCV({ dlmm: uintCV(0), xyk: uintCV(0), velar: uintCV(0) });
  let u, mid, stamp0; const snapshots = {}, links = {}, differences = [];
  for (const side of ['x', 'y']) for (const version of ['baseline', 'current']) {
    const owners = await startSim();
    links[`${side}/${version}`] = `https://stxer.xyz/simulations/mainnet/${S.sid}`; console.log(`${side}/${version}: ${links[`${side}/${version}`]}`);
    await deployCode(NAMES.market, version === 'baseline' ? baseline.market : bytes('market'));
    await deployCode(NAMES.router, version === 'baseline' ? baseline.router : bytes('router'));
    const stamp = Number((await ev('fork clock', MARKET, 'stacks-block-time', v => /^u[0-9]+$/.test(v))).slice(1));
    if (!u) { u = await freshAfter(stamp); mid = u.px * 100000000n / u.py; stamp0 = stamp; console.log(`  update mid ${mid}`); }
    check('same fork clock as the first sim', stamp, stamp0);
    await tx('verify (live core owner)', owners.core, CORE, 'set-verified-contract', [principal(MARKET)], '(ok true)');
    await tx('market operator -> core owner', DEP, MARKET, 'set-operator', [principal(owners.core)], '(ok true)');
    await tx('initialize', owners.core, MARKET, 'initialize', [principal(MARKET), traits.x, traits.y, uintCV(1000), uintCV(1000000), uintCV(1), uintCV(7)], '(ok true)');
    await tx('market operator -> DEP', owners.core, MARKET, 'set-operator', [principal(DEP)], '(ok true)');
    await tx('sync seats', DEP, MARKET, 'sync-seat-count', [], '(ok u10)');
    const maker = mk(993), taker = mk(994), anchor = mk(995), opp = other(side), normal = side === 'x' ? 3000n : 6000000n;
    const limit = side === 'x' ? mid / 2n : mid * 2n, makerLimit = opp === 'x' ? mid / 2n : mid * 2n;
    const ample = opp === 'x' ? 12000n : 30000000n, small = side === 'x' ? 1700n * mid / 10000000000n : 3500000n * 10000000000n / mid;
    const partialAmount = side === 'x' ? 2000n : 4000000n;
    if (side === 'x' && !(small >= 1000000n && small < partialAmount * mid / 10000000000n)) throw new Error(`partial bid ${small} not in [1 USDCx, value of the taker)`);
    if (side === 'y' && !(small >= 1000n)) throw new Error(`partial ask ${small} sats under the minimum`);
    await fund(opp, maker, 1000000000n); await fund(side, taker, 1000000000n);
    const wallet = `{tx:${balance('x', taker)},ty:${balance('y', taker)},mx:${balance('x', maker)},my:${balance('y', maker)},cx:${balance('x', MARKET)},cy:${balance('y', MARKET)}}`;
    const state = () => ev('wallet snapshot', MARKET, wallet, v => v.startsWith('(tuple'));
    async function deposit(s, who, amount, l) {
      return tx('maker admission', who, MARKET, `deposit-token-${s}`, [uintCV(amount), uintCV(l), noneCV(), traits[s], assets[s]], `(ok u${amount})`);
    }
    async function clear(s, who) { const n = await ev('remaining live', MARKET, live(s, who), v => /^u[0-9]+$/.test(v)); if (n !== 'u0') await tx('clear fixture', who, MARKET, `cancel-token-${s}-deposit`, [traits[s], assets[s]], ok); }
    async function invoke(kind, amount, l, want) {
      return kind === 'market' ?
        tx(`${side}/${version} direct swap`, taker, MARKET, 'swap', [uintCV(amount), uintCV(l), update(u), ...pairArgs(), boolCV(side === 'x')], want) :
        tx(`${side}/${version} router swap`, taker, router, side === 'x' ? 'swap-sbtc-for-usdcx' : 'swap-usdcx-for-sbtc', [uintCV(amount), uintCV(amount), uintCV(l), someCV(update(u)), noneCV(), zero, zero, uintCV(1)], want);
    }
    const results = [];
    for (const [label, liquidity, amount, l] of [
      ['full fill', ample, normal, limit], ['partial fill', small, partialAmount, limit],
      ['zero limit', ample, normal, 0n], ['below minimum', ample, side === 'x' ? 500n : 500000n, limit], ['empty book', 0n, normal, limit]]) {
      for (const kind of ['market', 'router']) {
        await clear(opp, maker); await clear(side, taker);
        if (liquidity > 0n) await deposit(opp, maker, liquidity, makerLimit);
        const before = await state();
        const want = label === 'zero limit' ? (kind === 'market' ? '(err u1011)' : '(err u3002)') : label === 'below minimum' ? (kind === 'market' ? '(err u1001)' : '(err u3002)') : label === 'empty book' ? v => v.startsWith('(err') : ok;
        const r = await invoke(kind, amount, l, want), after = await state();
        if (label === 'full fill') check('full fill has no remainder', r.result, v => kind === 'market' ? v.includes(`(token-${side}-rolled u0)`) : v.includes('(unsold u0)') && v.includes('(jing-ok true)'));
        if (label === 'partial fill') check('partial fill returns remainder', r.result, v => new RegExp(kind === 'market' ? `token-${side}-rolled u[1-9]` : 'unsold u[1-9]').test(v));
        if (['zero limit', 'below minimum', 'empty book'].includes(label)) check('rejected swap changes no wallet', after, before);
        results.push({ label, kind, result: r.result, before, after });
      }
    }
    snapshots[`${side}/${version}`] = results;
    if (version === 'current') {
      for (let i = 0; i < results.length; i++) {
        const old = snapshots[`${side}/baseline`][i], now = results[i];
        if (JSON.stringify(old) !== JSON.stringify(now)) differences.push({ side, baseline: old, current: now });
        check(`${side} ${now.label}/${now.kind}: tuple and all wallets match baseline`, JSON.stringify(now), JSON.stringify(old));
      }
      // Pending-only opposite liquidity cannot fund a swap: compare against
      // the pair's own empty-book result.
      await clear(opp, maker); await clear(side, taker); await fund(side, anchor, normal);
      await deposit(side, anchor, normal, side === 'x' ? mid * 2n : mid / 2n);
      await deposit(opp, maker, ample, makerLimit);
      await ev('opposite liquidity is pending only', MARKET, `(and (is-eq ${live(opp, maker)} u0) (is-eq (get amount (unwrap-panic ${pending(opp, maker)})) u${ample}))`, 'true');
      for (const kind of ['market', 'router']) {
        const before = await state(); await invoke(kind, normal, limit, results.find(x => x.label === 'empty book' && x.kind === kind).result);
        await ev('pending escrow remains intact', MARKET, `(get amount (unwrap-panic ${pending(opp, maker)}))`, `u${ample}`);
        check('pending cannot fund swap; balances unchanged', await state(), before);
      }
      await clear(side, anchor);
      await tx('settle formerly pending liquidity', keeper, MARKET, `settle-token-${opp}-deposit`, settleArgs(opp, maker, u), `(ok u${ample})`);
      await ev('pending cleared', MARKET, pending(opp, maker), 'none');
      await invoke('router', normal, limit, v => ok(v) && v.includes('(jing-ok true)'));
    }
  }
  console.log(`${S.passed}/${S.checks} checks green`);
  for (const [k, v] of Object.entries(links)) console.log(`  ${k}: ${v}`);
  fs.writeFileSync(new URL('./fixtures/router-v6-5-sbtc-usdcx-baseline-result.json', import.meta.url), JSON.stringify({ baseline: 'live markets-sbtc-usdcx-jing-v6-4 + swap-router-sbtc-usdcx-jing-v5-5', baselineSha256: baseline.sha256, pin: PIN, update: u.hex, links, passed: S.passed, checks: S.checks, differences, snapshots }, (_, v) => typeof v === 'bigint' ? String(v) : v, 2) + '\n');
}
main().catch(e => { console.error(e); console.log(`${S.passed}/${S.checks} checks green (stopped)`); process.exitCode = 1; });
