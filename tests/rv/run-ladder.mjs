import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

// RV can print a failed property and still exit 0. Inspect its report too.
const jobs = [
  ['jing-buy-stx-core-spread', 'invariant', 1000, 210921, 'rv-buy-band-invariant-210921'],
  ['jing-buy-stx-core-spread', 'test', 500, 210923, 'rv-buy-band-test-210923'],
  ['jing-sell-stx-core-spread', 'invariant', 500, 210922, 'rv-sell-band-invariant-210922'],
  ['jing-sell-stx-core-spread', 'test', 500, 210922, 'rv-sell-band-test-210922'],
  ['jing-ladder', 'invariant', 500, 210924, 'rv-ladder-invariant-210924'],
  ['jing-ladder-dispatch', 'test', 1000, 210921, 'rv-dispatch-test-210921'],
  ['jing-ladder-dispatch', 'invariant', 300, 210922, 'rv-dispatch-invariant-driven-210922'],
];
const directory = 'simulations/results';
fs.mkdirSync(directory, { recursive: true });
function command(bin, args, options = {}) {
  const result = spawnSync(bin, args, { stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`${bin} exited ${result.status}`);
}
function summarize([contract, type, runs, seed, name]) {
  const log = fs.readFileSync(`${directory}/${name}.log`, 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
  const passed = (log.match(/\[PASS\]/g) ?? []).length;
  const discarded = (log.match(/\[WARN\]/g) ?? []).length;
  if (!log.includes('EXECUTION STATISTICS') || /\[FAIL\]|Error:|RuntimeError|Runtime error|ArithmeticUnderflow|ArithmeticOverflow|\(err u92[0-9]+\)/.test(log)) {
    throw new Error(`Incomplete or failed RV run: ${name}; inspect its log`);
  }
  if (passed + discarded !== runs) throw new Error(`Unexpected trial count: ${name}`);
  const successful = log.split('├─ + SUCCESSFUL')[1]?.split('├─ - IGNORED')[0] ?? '';
  const mutations = [...successful.matchAll(/: x(\d+)/g)].reduce((n, m) => n + Number(m[1]), 0);
  if (type === 'invariant' && mutations === 0) throw new Error(`Vacuous invariant run: ${name}`);
  return { contract, type, runs, seed, passed, discarded, failures: 0,
    ...(type === 'invariant' ? { successfulPublicCalls: mutations } : {}), log: `${directory}/${name}.log` };
}
if (!process.argv.includes('--summarize')) {
  command('bash', ['tests/rv/build.sh', 'markets-sbtc-stx-jing-v6'], { env: { ...process.env, RV_MARKET_VERSION: 'v6-2' } });
  for (const contract of ['jing-buy-stx-core-spread', 'jing-sell-stx-core-spread', 'jing-ladder']) {
    command('bash', ['tests/rv/build.sh', contract]);
  }
  command(process.execPath, ['tests/rv/build-dispatch.mjs']);
  for (const job of jobs) {
    const [contract, type, runs, seed, name] = job;
    console.log(`Running ${contract} ${type}: ${runs} trials, seed ${seed}`);
    const fd = fs.openSync(`${directory}/${name}.log`, 'w');
    try {
      command('node_modules/.bin/rv', ['.', contract, type, `--runs=${runs}`, `--seed=${seed}`], { stdio: ['ignore', fd, fd] });
    } finally { fs.closeSync(fd); }
    console.log(JSON.stringify(summarize(job)));
  }
}
const hashes = {};
for (const path of ['contracts/markets-sbtc-stx-jing-v6-2.clar',
  'contracts/jing-buy-stx-core-spread.clar', 'contracts/jing-sell-stx-core-spread.clar',
  'contracts/jing-ladder.clar', 'contracts/jing-ladder-dispatch.clar',
  'tests/rv/.build/markets-sbtc-stx-jing-v6.clar']) {
  hashes[path] = crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
}
const report = { generatedAt: new Date().toISOString(), hashes, results: jobs.map(summarize) };
fs.writeFileSync(`${directory}/rv-ladder-summary.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.results, null, 2));
