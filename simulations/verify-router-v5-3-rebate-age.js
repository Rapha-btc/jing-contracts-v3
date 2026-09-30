// Fork only: signed Pyth updates, real decoder/oracle and real AMM pools.
// AdvanceBlocks controls time; no oracle bytes or market/pool storage are patched.
// Separate forks deploy exact baseline/current pairs at the same block and signed update.
// Run: node simulations/verify-router-v5-3-rebate-age.js
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {uintCV, noneCV, deserializeTransaction} from '@stacks/transactions';
import {submitSimulationSteps, getSimulationTip, getSimulationResult} from 'stxer';
import {
  DEP, MARKET, ROUTER, H, check, ev, evRaw, tx, fund, deployAll, initMarket,
  printAfter, forkClock, wallet, printsOf, fields, mk, traits, assets,
  smartArgs, smartFn, shas, refused,
} from './_router-v5-3-harness.js';

const SCALE = 10_000_000_000n;
process.env.ROUTER_KEEP_TENURE = '1'; // AdvanceBlocks alone sets the exact ages.
const baseline = execFileSync('git', ['show', 'b41dbd6:contracts/swap-router-sbtc-stx-jing-v5-3.clar'], {encoding: 'utf8'});
const baselineMarket = execFileSync('git', ['show', 'b41dbd6:contracts/markets-sbtc-stx-jing-v6-3.clar'], {encoding: 'utf8'});
const report = {baselineCommit: 'b41dbd6', baselineRouterSha256: crypto.createHash('sha256').update(baseline).digest('hex'), baselineMarketSha256: crypto.createHash('sha256').update(baselineMarket).digest('hex'), sources: shas(), runs: []};
const cap = (net, bps) => ((net + 1n) * (10000n + bps) - 1n) / 10000n;
const minimumGross = (net, bps) => (net * (10000n + bps) + 9999n) / 10000n;

let sharedUpdate;

async function advance(stamp) {
  const tip = await getSimulationTip(H.sid);
  if (Number(tip.block_time) !== stamp) {
    check('requested clock moves forward', stamp > Number(tip.block_time), true);
    const interval = stamp - Number(tip.burn_block_time);
    check('positive Bitcoin interval', interval > 0, true);
    const r = await submitSimulationSteps(H.sid, {steps: [{AdvanceBlocks: {
      bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: interval,
    }}]});
    check('advance fork clock', Boolean(r.steps[0].AdvanceBlocks?.Ok), true);
  }
  await ev('exact fork time', MARKET, 'stacks-block-time', `u${stamp}`);
}

async function run(side, baselineRun) {
  const version = baselineRun ? 'baseline' : 'fixed';
  const sellX = side === 'x', opposite = sellX ? 'y' : 'x';
  const maker = mk(sellX ? 961 : 963), taker = mk(sellX ? 962 : 964);
  await deployAll([], baselineRun ? {
    'markets-sbtc-stx-jing-v6-3': baselineMarket,
    'swap-router-sbtc-stx-jing-v5-3': baseline,
  } : {});
  const fork = (await getSimulationResult(H.sid)).metadata;
  process.env.ROUTER_FORK_HEIGHT = String(fork.block_height);
  await initMarket();
  await fund(opposite, maker, sellX ? 1_000_000_000n : 1_000_000n);
  await fund(side, taker, sellX ? 10_000_000n : 100_000_000_000n);
  sharedUpdate ??= await printAfter(await forkClock());
  const u = sharedUpdate, mid = u.mid;
  const quoteUpdate = baselineRun ? '' : ` (some 0x${u.hex.replace(/^0x/, '')})`;
  const limit = sellX ? mid / 2n : mid * 2n;
  const makerLimit = sellX ? mid * 2n : mid / 2n;
  const liquidity = sellX ? (10000n * mid + SCALE - 1n) / SCALE : 1000n;
  const live = () => evRaw(MARKET, `(get-token-${opposite}-deposit (var-get current-cycle) '${maker})`);
  const place = () => tx('place funded opposite book', maker, MARKET, `deposit-token-${opposite}`,
    [uintCV(liquidity), uintCV(makerLimit), noneCV(), traits[opposite], assets[opposite]], `(ok u${liquidity})`);
  const clear = async () => {
    if (await live() !== 'u0') await tx('cancel remaining maker liquidity', maker, MARKET,
      `cancel-token-${opposite}-deposit`, [traits[opposite], assets[opposite]], s => s.startsWith('(ok'));
  };
  await place();
  const quote = fields(await evRaw(MARKET, `(get-taker-capacity u${mid} u${limit} ${sellX} '${taker}${quoteUpdate})`));
  const net = quote['net-cap'];
  check('fixture has positive net capacity', net > 0n, true);
  await tx('make minimum equal to book net capacity', DEP, MARKET, `set-min-token-${side}-deposit`, [uintCV(net)], '(ok true)');
  const runReport = {side, version, simulation: `https://stxer.xyz/simulations/mainnet/${H.sid}`, signedUpdateHex: u.hex, oldestFeedTime: u.at, mid, netCapacity: net, cases: []};
  report.runs.push(runReport);

  async function swap(label, amount, jingOK, expectedCap) {
    const before = await wallet(taker), makerBefore = await live();
    const r = await tx(label, taker, ROUTER, smartFn(sellX), smartArgs({amount, limit, u, mid}), s => s.startsWith('(ok'));
    const after = await wallet(taker), f = r.f;
    const prints = printsOf(r, ROUTER);
    check(`${label}: one router print`, prints.length, 1);
    const p = fields(prints[0]);
    check(`${label}: predicted gross book cap`, p['jing-cap'], expectedCap);
    check(`${label}: Jing success`, f['jing-ok'], jingOK);
    if (jingOK) {
      check(`${label}: consumes book capacity`, await live(), 'u0');
      check(`${label}: positive book output`, f['jing-out'] > 0n, true);
    } else {
      check(`${label}: maker unchanged`, await live(), makerBefore);
      check(`${label}: no book input/output`, `${f['jing-in']} ${f['jing-out']}`, '0 0');
    }
    const spent = before[side] - after[side], received = after[opposite] - before[opposite];
    check(`${label}: wallet and input conservation`, spent, amount - f.unsold);
    check(`${label}: input equals all venue debits`, spent, f['jing-in'] + f['dlmm-in'] + f['xyk-in'] + f['velar-in']);
    check(`${label}: wallet and output conservation`, received, f.out);
    check(`${label}: output equals all venue credits`, received, f['jing-out'] + f['dlmm-out'] + f['xyk-out'] + f['velar-out']);
    runReport.cases.push({label, amount, expectedCap, result: r.result, print: prints[0], before, after});
    return r;
  }

  for (const age of [0, 30, 31, 55, 79, 80]) {
    await advance(u.at + age);
    if (await live() === 'u0') await place();
    const bps = BigInt(20 + Math.max(0, age - 30)), amount = net * 2n;
    if (!baselineRun) await ev(`age ${age}: real decoder market quote`, MARKET,
      `(get rebate-bps (get-taker-capacity u${mid} u${limit} ${sellX} '${taker}${quoteUpdate}))`, `u${bps}`);
    if (!baselineRun && age === 79) {
      const edge = minimumGross(net, bps);
      await swap('age 79: below true minimum skips Jing', edge - 1n, false, 0n);
      await swap('age 79: exact true minimum fills Jing', edge, true, edge);
      await place();
      await refused('age 79: impossible min-out rolls every venue back', taker, ROUTER, smartFn(sellX),
        smartArgs({amount, limit, u, mid, minOut: 999_999_999_999_999n}), '(err u3002)', [maker, taker]);
    }
    const grossCap = cap(net, baselineRun ? 20n : bps);
    const fits = age < 80 && grossCap * 10000n / (10000n + bps) >= net;
    await swap(`age ${age}: ${version} router`, amount, fits, grossCap);
    await clear();
  }
  const trace = await getSimulationResult(H.sid);
  runReport.fork = trace.metadata;
  runReport.transactions = trace.steps.filter(s => s.Transaction).length;
  // Outer ExecutionCost is cumulative; the receipt holds this call's cost.
  runReport.smartSwapCosts = trace.steps.filter(s => s.Transaction &&
    deserializeTransaction(s.Transaction).payload.functionName?.content.startsWith('smart-swap-'))
    .map(s => ({txid: s.TxId, cost: s.Result.Transaction.Ok.execution_cost}));
}

async function main() {
  for (const side of ['x', 'y']) {
    await run(side, true);
    await run(side, false);
  }
  check('working-tree sources unchanged', JSON.stringify(shas()), JSON.stringify(report.sources));
  report.checks = H.checks;
  report.passed = H.passed;
  fs.writeFileSync(new URL('./fixtures/router-v5-3-rebate-age-result.json', import.meta.url), JSON.stringify(report, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n');
  console.log(`${H.passed}/${H.checks} checks green`);
  for (const r of report.runs) console.log(`Sim: ${r.simulation}`);
}
main().catch(e => {console.error(e.message ?? e); process.exitCode = 1;});
