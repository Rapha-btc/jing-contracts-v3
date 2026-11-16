// STX/USDCx port of verify-v6-3-router-impact.js.
// Run: node simulations/verify-v6-3-router-impact-stx-usdcx.mjs
//
// The original runs the same five swap scenarios (full fill, partial fill,
// zero limit, below minimum, empty book) on each taker side, once directly on
// the market and once through the router, on a pre-submit/settle BASELINE
// market + router (git f6a6d3a / ee2edde^) and on the CURRENT pair, and asserts
// the outcome codes, remainders, "rejected swap moves no wallet", and that
// every tuple and wallet matches the baseline; then (current only) opposite
// liquidity that is only PENDING cannot fund a swap (market or router), stays
// escrowed, and once settled the router fills.
//
// Port (contracts/stx-usdcx/, whole-line comments stripped = the deploy bytes):
//  - market markets-stx-usdcx-jing-v6-4, ladder jing-ladder-stx-usdcx-v1, both
//    deployed by DEP at the tip; LIVE jing-core-v6 (verify + initialize by its
//    owner CORE_OWNER, operator handed back to DEP), Lazer feeds [45, 7].
//  - The pair is run twice per side: on swap-router-stx-usdcx-jing-v5-5 and
//    on swap-router-stx-usdcx-jing-v6 (Zest leg amount 0, empty tick walk:
//    the original has no such venue). Every check of the original runs on
//    both routers, and the "matches baseline" comparison becomes "router v6
//    run matches router v5-5 run" (same block, same update, same wallets):
//    tuples and all wallets equal once the v6 receipt's zest-in/zest-out
//    (checked u0) are dropped.
//  - N/A: the pre-submit/settle baseline itself (no STX/USDCx market source
//    predates submit/settle, so there is no f6a6d3a / ee2edde^ equivalent;
//    the baseline-only deposit-with-update arity is gone with it). xyk / Velar
//    router legs: amounts were already 0 in the original (no xyk/velar check);
//    on this router non-zero is u3003 and the receipt keeps the u0 fields.
//  - Units: x = native STX (6 dp), y = USDCx (6 dp), y = x * price / 1e8.
//    Mins 10 STX / 1 USDCx (= the original 1000 sats / 1 STX relation: one
//    x-min is worth a few y-mins; with 1 STX the x-side amounts would sit
//    under the y-min). Every x amount of the original in sats is x 1e4 uSTX
//    (1000 sats -> 10 STX); y amounts keep their raw value (uSTX -> uUSDCx).
//  - The original's fixture json is dropped (results printed instead).
import {
  ClarityVersion, tupleCV, uintCV, listCV, noneCV, someCV, boolCV, makeUnsignedSTXTokenTransfer,
  deserializeCV, cvToString,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, submitSimulationSteps, callContract, getNonce, setSender,
} from 'stxer';
import { installChunkedSubmit } from './_chunked-submit.js';
import { installRetrySubmit } from './_retry-submit.js';
import {
  NODE, DEP, CORE, CORE_OWNER, USDCX, STX_WHALES, USDCX_WHALES, N, P_ as principal, traits, assets, mk,
  balanceExpr as balance, src, freshAfter, updCV as update, PRICE_PRECISION,
} from './_stx-usdcx-v6-common.mjs';
installChunkedSubmit(60);
installRetrySubmit();

const keeper = mk(871);
const cv = (hex) => cvToString(deserializeCV(hex));
const decode = (step) => {
  const r = step?.Result;
  if (r?.Eval?.Ok) return cv(r.Eval.Ok);
  if (r?.Transaction?.Ok) {
    const tx = r.Transaction.Ok;
    if (tx.vm_error || tx.post_condition_aborted) return `ENGINE-ERR ${JSON.stringify(tx)}`;
    return cv(tx.result);
  }
  return `ENGINE-ERR ${JSON.stringify(r)}`;
};
const ok = (v) => v.startsWith('(ok');
let passed = 0, checks = 0, failures = 0, sid;
function check(label, actual, want) {
  checks++;
  const good = typeof want === 'function' ? want(actual) : actual === want;
  if (good) passed++; else failures++;
  console.log(`${good ? 'ok  ' : 'FAIL'} ${checks}. ${label}: ${String(actual).slice(0, 700)}${good ? '' : `; expected ${want}`}`);
  if (!good) finishPhase();
  return good;
}
function finishPhase() {
  if (failures) {
    console.log(`${passed}/${checks} checks green`);
    throw new Error(`Stopped on failed checks. Fork: https://stxer.xyz/simulations/mainnet/${sid}`);
  }
}
async function ev(label, cid, code, want) {
  const out = await submitSimulationSteps(sid, { steps: [{ Eval: [DEP, '', cid, code] }] });
  const actual = decode({ Result: out.steps[0] });
  check(label, actual, want);
  return actual;
}
async function tx(label, sender, cid, fn, args, want) {
  const r = await callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 });
  const actual = r.vmError || r.pcAborted ? `ENGINE-ERR ${JSON.stringify(r)}` : r.result;
  check(label, actual, want);
  return r;
}
const pending = (side, p) => `(get-token-${side}-pending-deposit '${p})`;
const live = (side, p) => `(get-token-${side}-deposit (var-get current-cycle) '${p})`;
const settleArgs = (side, who, u) => [principal(who), update(u), traits[side], assets[side]];
const other = (side) => side === 'x' ? 'y' : 'x';
const pairArgs = () => [traits.x, assets.x, traits.y, assets.y];
async function fund(side, who, amount) {
  if (side === 'y') {
    await tx('fund fresh USDCx', USDCX_WHALES[1], USDCX, 'transfer', [uintCV(amount), principal(USDCX_WHALES[1]), principal(who), noneCV()], '(ok true)');
  } else {
    const raw = await makeUnsignedSTXTokenTransfer({ recipient: who, amount, nonce: await getNonce(sid, STX_WHALES[0]), network: 'mainnet', publicKey: '', fee: 0 });
    setSender(raw, STX_WHALES[0]);
    const out = await submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] });
    check('fund fresh STX', decode({ Result: out.steps[0] }), '(ok true)');
  }
  finishPhase();
}
const MARKET = `${DEP}.${N.market}`;
const MIN_X = 10_000_000n, MIN_Y = 1_000_000n; // 10 STX / 1 USDCx
const ROUTERS = { 'v5-5': N.router, v6: N.routerV6 };
const dropZest = (s) => String(s).replace(/ \(zest-in u0\) \(zest-out u0\)/, '');

async function main() {
  let height, u, mid; const snapshots = {}, links = {}, differences = [];
  for (const side of ['x', 'y']) for (const version of ['v5-5', 'v6']) {
    const routerName = ROUTERS[version], router = `${DEP}.${routerName}`;
    const b = SimulationBuilder.new({ stacksNodeAPI: NODE }); if (height) b.useBlockHeight(height);
    for (const name of [N.ladder, N.market, routerName])
      b.withSender(DEP).addContractDeploy({ contract_name: name, source_code: src(name), clarity_version: ClarityVersion.Clarity5 });
    sid = await b.run(); links[`${side}/${version}`] = `https://stxer.xyz/simulations/mainnet/${sid}`; console.log(`${side}/${version}: ${links[`${side}/${version}`]}`);
    const result = await getSimulationResult(sid); height = Number(result.metadata.block_height);
    for (const st of result.steps.filter((s) => s.Result?.Transaction)) check('deploy stripped source', decode(st), ok);
    const stamp = Number((await ev('fork clock', MARKET, 'stacks-block-time', (v) => /^u[0-9]+$/.test(v))).slice(1));
    if (!u) { u = await freshAfter(stamp); mid = u.px * PRICE_PRECISION / u.py; console.log(`block ${height}, mid ${mid} (USDCx per STX * 1e8), print at ${u.at} > fork clock ${stamp}`); }
    await ev('live core owner is the multisig', CORE, '(get-contract-owner)', CORE_OWNER);
    await tx('verify (core owner)', CORE_OWNER, CORE, 'set-verified-contract', [principal(MARKET)], '(ok true)');
    await tx('set-operator -> core owner', DEP, MARKET, 'set-operator', [principal(CORE_OWNER)], '(ok true)');
    await tx('initialize', CORE_OWNER, MARKET, 'initialize', [principal(MARKET), traits.x, traits.y, uintCV(MIN_X), uintCV(MIN_Y), uintCV(45), uintCV(7)], '(ok true)');
    await tx('set-operator -> DEP', CORE_OWNER, MARKET, 'set-operator', [principal(DEP)], '(ok true)');
    await tx('sync seats', DEP, MARKET, 'sync-seat-count', [], '(ok u10)');
    const zero = version === 'v6'
      ? tupleCV({ dlmm: uintCV(0), xyk: uintCV(0), velar: uintCV(0), zest: uintCV(0) })
      : tupleCV({ dlmm: uintCV(0), xyk: uintCV(0), velar: uintCV(0) });
    const zestRoute = tupleCV({ ticks: listCV([]), price: uintCV(0) });
    const maker = mk(993), taker = mk(994), anchor = mk(995), opp = other(side);
    // normal taker size: 3000 sats -> 30 STX; 6 STX -> 6 USDCx
    const normal = side === 'x' ? 30_000_000n : 6_000_000n;
    const limit = side === 'x' ? mid / 2n : mid * 2n, makerLimit = opp === 'x' ? mid / 2n : mid * 2n;
    // ample opposite book (12000 sats -> 120 STX; 30 STX -> 30 USDCx); small = the
    // value of 1500 sats -> 15 STX in USDCx (x taker) / of 3.5 USDCx in uSTX (y taker)
    const ample = opp === 'x' ? 120_000_000n : 30_000_000n;
    const small = side === 'x' ? 15_000_000n * mid / PRICE_PRECISION : 3_500_000n * PRICE_PRECISION / mid;
    await fund(opp, maker, 1_000_000_000n); await fund(side, taker, 1_000_000_000n);
    const wallet = `{tx:${balance('x', taker)},ty:${balance('y', taker)},mx:${balance('x', maker)},my:${balance('y', maker)},cx:${balance('x', MARKET)},cy:${balance('y', MARKET)}}`;
    const state = () => ev('wallet snapshot', MARKET, wallet, (v) => v.startsWith('(tuple'));
    async function deposit(s, who, amount, l) {
      return tx('maker admission', who, MARKET, `deposit-token-${s}`, [uintCV(amount), uintCV(l), noneCV(), traits[s], assets[s]], `(ok u${amount})`);
    }
    async function clear(s, who) { const n = await ev('remaining live', MARKET, live(s, who), (v) => /^u[0-9]+$/.test(v)); if (n !== 'u0') await tx('clear fixture', who, MARKET, `cancel-token-${s}-deposit`, [traits[s], assets[s]], ok); }
    async function invoke(kind, amount, l, want) {
      if (kind === 'market') return tx(`${side}/${version} direct swap`, taker, MARKET, 'swap', [uintCV(amount), uintCV(l), update(u), ...pairArgs(), boolCV(side === 'x')], want);
      const args = [uintCV(amount), uintCV(amount), uintCV(l), someCV(update(u)), noneCV(), zero, zero, uintCV(1)];
      if (version === 'v6') args.push(zestRoute);
      const r = await tx(`${side}/${version} router swap`, taker, router, side === 'x' ? 'swap-stx-for-usdcx' : 'swap-usdcx-for-stx', args, want);
      if (version === 'v6' && ok(r.result)) check('v6: Zest leg untouched (zest-in/out u0)', r.result, (v) => v.includes('(zest-in u0) (zest-out u0)'));
      return r;
    }
    const results = [];
    for (const [label, liquidity, amount, l] of [
      ['full fill', ample, normal, limit],
      ['partial fill', small, side === 'x' ? 20_000_000n : 4_000_000n, limit],
      ['zero limit', ample, normal, 0n],
      ['below minimum', ample, side === 'x' ? 5_000_000n : 500_000n, limit],
      ['empty book', 0n, normal, limit]]) {
      for (const kind of ['market', 'router']) {
        await clear(opp, maker); await clear(side, taker);
        if (liquidity > 0n) await deposit(opp, maker, liquidity, makerLimit);
        const before = await state();
        const want = label === 'zero limit' ? (kind === 'market' ? '(err u1011)' : '(err u3002)') : label === 'below minimum' ? (kind === 'market' ? '(err u1001)' : '(err u3002)') : label === 'empty book' ? (v) => v.startsWith('(err') : ok;
        const r = await invoke(kind, amount, l, want), after = await state();
        if (label === 'full fill') check('full fill has no remainder', r.result, (v) => kind === 'market' ? v.includes(`(token-${side}-rolled u0)`) : v.includes('(unsold u0)') && v.includes('(jing-ok true)'));
        if (label === 'partial fill') check('partial fill returns remainder', r.result, (v) => new RegExp(kind === 'market' ? `token-${side}-rolled u[1-9]` : 'unsold u[1-9]').test(v));
        if (['zero limit', 'below minimum', 'empty book'].includes(label)) check('rejected swap changes no wallet', after, before);
        results.push({ label, kind, result: dropZest(r.result), before, after });
      }
    }
    snapshots[`${side}/${version}`] = results;
    if (version === 'v6') {
      for (let i = 0; i < results.length; i++) {
        const old = snapshots[`${side}/v5-5`][i], now = results[i];
        if (JSON.stringify(old) !== JSON.stringify(now)) differences.push({ side, v55: old, v6: now });
        check(`${side} ${now.label}/${now.kind}: tuple and all wallets match the router v5-5 run`, JSON.stringify(now), JSON.stringify(old));
      }
    }
    // Pending-only opposite liquidity (original: current pair only; here both routers)
    await clear(opp, maker); await clear(side, taker); await fund(side, anchor, normal);
    await deposit(side, anchor, normal, side === 'x' ? mid * 2n : mid / 2n);
    await deposit(opp, maker, ample, makerLimit);
    await ev('opposite liquidity is pending only', MARKET, `(and (is-eq ${live(opp, maker)} u0) (is-eq (get amount (unwrap-panic ${pending(opp, maker)})) u${ample}))`, 'true');
    for (const kind of ['market', 'router']) {
      const before = await state(); await invoke(kind, normal, limit, results.find((x) => x.label === 'empty book' && x.kind === kind).result);
      await ev('pending escrow remains intact', MARKET, `(get amount (unwrap-panic ${pending(opp, maker)}))`, `u${ample}`);
      check('pending cannot fund swap; balances unchanged', await state(), before);
    }
    await clear(side, anchor);
    await tx('settle formerly pending liquidity', keeper, MARKET, `settle-token-${opp}-deposit`, settleArgs(opp, maker, u), `(ok u${ample})`);
    await ev('pending cleared', MARKET, pending(opp, maker), 'none');
    await invoke('router', normal, limit, (v) => ok(v) && v.includes('(jing-ok true)'));
  }
  console.log(JSON.stringify({ block: height, mid: String(mid), links, differences: differences.length }, null, 1));
  console.log(`${passed}/${checks} checks green`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
