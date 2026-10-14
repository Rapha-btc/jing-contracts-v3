// Seeded RV campaigns on the ladder-v1 stack, through RV's own checkInvariants
// / checkProperties (shrinking included). RV can print a failure and still
// exit 0, so each log is inspected; the harness's rv-success prints are the
// proof that state-changing calls really happened.
//   node tests/rv/ladder-v1/run.mjs [invariant|test] <runs> <seed>
//   node tests/rv/ladder-v1/run.mjs --all   (default campaign, writes results.json)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { Cl, cvToString } from '@stacks/transactions';
import { createRuntime } from './runtime.mjs';

const require = createRequire(import.meta.url);
const { checkProperties } = require('../../../node_modules/@stacks/rendezvous/dist/property.js');
const { checkInvariants } = require('../../../node_modules/@stacks/rendezvous/dist/invariant.js');
const { getSimnetDeployerContractsInterfaces, getFunctionsFromContractInterfaces } = require('../../../node_modules/@stacks/rendezvous/dist/shared.js');
const LOGS = process.env.RV_LOG_DIR ?? 'tests/rv/.build/results/ladder-v1';
const JOBS = [
  ['invariant', 1500, 241014], ['invariant', 1500, 241015],
  ['test', 3000, 241016], ['test', 3000, 241017],
];

async function one(type, runs, seed) {
  const label = `${type}-${seed}`;
  let runtime = await createRuntime({ label });
  const totals = { publicCalls: 0, success: {} };
  const fold = () => { totals.publicCalls += runtime.stats.publicCalls; for (const [k, v] of Object.entries(runtime.stats.success)) totals.success[k] = (totals.success[k] ?? 0) + v; };
  const proxy = new Proxy({}, { get(_, key) { const v = Reflect.get(runtime.sim, key); return typeof v === 'function' ? v.bind(runtime.sim) : v; } });
  const monitorTotals = { checks: 0, crossChecks: 0, positionsCompared: 0 };
  const foldMon = () => { for (const k of Object.keys(monitorTotals)) monitorTotals[k] += runtime.monitor.stats[k]; };
  const reset = async () => { fold(); foldMon(); runtime = await createRuntime({ label }); };
  const radio = new EventEmitter(); let failed = false;
  for (const n of ['logMessage', 'logInfo', 'logFailure']) radio.on(n, s => { console.log(s); if (/\[FAIL\]|Runtime error|ArithmeticUnderflow|ArithmeticOverflow|DivisionByZero/.test(s)) failed = true; });
  const eligible = new Map([...runtime.sim.getAccounts()].filter(([n]) => n !== 'faucet').sort(([a], [b]) => a.localeCompare(b)));
  const target = `${runtime.owner}.rv-ladder-harness`;
  const all = getSimnetDeployerContractsInterfaces(runtime.sim);
  const functions = getFunctionsFromContractInterfaces(new Map([...all].filter(([id]) => id === target)));
  console.log(`RV LADDER-V1 type=${type} runs=${runs} seed=${seed}`);
  if (type === 'test') await checkProperties(proxy, reset, [target], functions, seed, runs, true, false, radio, eligible, [...eligible.values()]);
  else await checkInvariants(proxy, reset, [target], functions, seed, runs, undefined, true, false, radio, eligible, [...eligible.values()]);
  const status = cvToString(runtime.sim.callReadOnlyFn('rv-ladder-harness', 'rv-status', [], runtime.owner).result);
  console.log(`RV-FAILING ${cvToString(runtime.sim.callReadOnlyFn('rv-ladder-harness', 'rv-failing', [], runtime.owner).result).replace(/ ""/g, '')}`);
  for (const id of ['b20', 'b50', 's20', 's50']) console.log(`RV-FLAGS ${id} ${cvToString(runtime.sim.callReadOnlyFn('rv-ladder-harness', `rv-flags-${id}`, [], runtime.owner).result)}`);
  const finalStats = runtime.final();
  fold(); foldMon();
  console.log(`RV-MONITOR ${JSON.stringify({ ...monitorTotals, maxStranded: finalStats.maxStranded, maxShareGap: finalStats.maxShareGap, deepest: finalStats.deepest })}`);
  console.log(`RV-STATUS ${status}`);
  console.log(`RV-SUCCESS ${JSON.stringify(totals)}`);
  if (failed || !status.includes('(valid true)') || !status.includes('(sync-failed false)')) process.exitCode = 1;
}

function summarize(type, runs, seed) {
  const path = `${LOGS}/${type}-${seed}.log`, s = fs.readFileSync(path, 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
  const passed = (s.match(/\[PASS\]/g) || []).length, discarded = (s.match(/\[WARN\]/g) || []).length, failed = (s.match(/\[FAIL\]/g) || []).length;
  const success = JSON.parse(s.match(/^RV-SUCCESS (.+)$/m)?.[1] ?? 'null');
  if (failed || !s.includes('EXECUTION STATISTICS') || /ArithmeticUnderflow|ArithmeticOverflow|DivisionByZero/.test(s) || !success)
    throw Error(`Failed or incomplete RV report: ${path}`);
  if (type === 'test' && passed + discarded !== runs) throw Error(`trial count ${passed}+${discarded} != ${runs}: ${path}`);
  return { type, runs, seed, passed, discarded, failed, status: s.match(/^RV-STATUS (.+)$/m)?.[1], successfulCalls: success.success, publicCalls: success.publicCalls, log: path };
}

if (process.argv[2] === '--all' || process.argv[2] === '--summarize') {
  fs.mkdirSync(LOGS, { recursive: true });
  if (process.argv[2] === '--all') {
    const b = spawnSync(process.execPath, ['tests/rv/ladder-v1/build.mjs'], { stdio: 'inherit' });
    if (b.status !== 0) throw Error('build failed');
    for (const [type, runs, seed] of JOBS) {
      console.log(`RV ${type} runs=${runs} seed=${seed}`);
      const fd = fs.openSync(`${LOGS}/${type}-${seed}.log`, 'w');
      const r = spawnSync(process.execPath, ['tests/rv/ladder-v1/run.mjs', type, String(runs), String(seed)], { stdio: ['ignore', fd, fd] });
      fs.closeSync(fd);
      if (r.status !== 0) throw Error(`RV ${type} ${seed} exit ${r.status}; see ${LOGS}/${type}-${seed}.log`);
    }
  }
  const sources = JSON.parse(fs.readFileSync('tests/rv/.build/ladder-v1/sources.json', 'utf8')).sources;
  for (const [name, meta] of Object.entries(sources)) {
    const now = crypto.createHash('sha256').update(fs.readFileSync(meta.path, 'utf8')).digest('hex');
    if (now !== meta.sha256) throw Error(`${meta.path} changed after the build; rebuild and rerun`);
  }
  const results = JOBS.map(j => summarize(...j));
  fs.writeFileSync('tests/rv/ladder-v1/results.json', JSON.stringify({ generatedAt: new Date().toISOString(), sources, results }, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} else {
  await one(process.argv[2] ?? 'invariant', Number(process.argv[3] ?? 100), Number(process.argv[4] ?? 1));
}
