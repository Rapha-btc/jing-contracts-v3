// coverage-mv7dfb.mjs - trace coverage of the FINAL mv7dfb deploy bytes
// (simulations/deploy-bytes-mv7dfb/) over every sim in
// simulations/fixtures/coverage-mv7dfb-sims.txt (first token per line) and the
// deploy-set fixture. A sim counts for a contract only where it deployed those
// exact bytes. One pass (trace-coverage-multi.mjs); writes
// simulations/TRACE-COVERAGE-mv7dfb-<name>.md and TRACE-COVERAGE-mv7dfb-summary.json.
//   node simulations/coverage-mv7dfb.mjs [name ...]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const C = { 'jing-core-v6': 5, 'jing-ladder-v1': 5, 'markets-sbtc-stx-jing-v6-3': 5, 'swap-router-sbtc-stx-jing-v5-3': 5,
  'jing-buy-stx-core-spread-v1': 5, 'jing-sell-stx-core-spread-v1': 5, 'jing-ladder-dispatch': 5, 'juice-pool-sbtc-signer': 6,
  'juice-sbtc-autoswap': 6, 'juice-autostake-safe': 6, 'juice-autostake-safe-auth-helpers-v1': 4, 'fastpool-swap-vault': 6,
  'signer-manager-vault-stx-rewards': 6, 'ccd015-redemption-book-mia-stx': 5, 'ccd016-swap-vault-mia-v2': 5 };
const list = 'simulations/fixtures/coverage-mv7dfb-sims.txt';
const tmp = `${process.env.TMPDIR || '/tmp'}/coverage-mv7dfb-sims.txt`;
const deploySet = JSON.parse(fs.readFileSync('simulations/fixtures/deploy-set-mv7dfb-result.json', 'utf8')).simulation.split('/').pop();
fs.writeFileSync(tmp, `${deploySet}\n${fs.existsSync(list) ? fs.readFileSync(list, 'utf8') : ''}`);
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(C);
execFileSync('node', ['simulations/trace-coverage-multi.mjs', '--sims-file', tmp, '--out', 'simulations/TRACE-COVERAGE-mv7dfb-',
  ...names.map((n) => `${n}:${C[n]}:simulations/deploy-bytes-mv7dfb/${n}.clar`)], { stdio: 'inherit', maxBuffer: 1 << 26 });
