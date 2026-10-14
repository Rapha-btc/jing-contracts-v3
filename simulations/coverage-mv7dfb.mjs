// coverage-mv7dfb.mjs - trace coverage of the FINAL mv7dfb deploy bytes
// (simulations/deploy-bytes-mv7dfb/), --by-source: a sim counts for a
// contract only where it deployed byte-identical code.
// Sims: the deploy-set fixture plus every id in
// simulations/fixtures/coverage-mv7dfb-sims.txt (first token per line).
//   node simulations/coverage-mv7dfb.mjs [name ...]
// Writes simulations/TRACE-COVERAGE-mv7dfb-<name>.md and prints a summary.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const C = { 'jing-core-v6': 5, 'jing-ladder-v1': 5, 'markets-sbtc-stx-jing-v6-3': 5, 'swap-router-sbtc-stx-jing-v5-3': 5,
  'jing-buy-stx-core-spread-v1': 5, 'jing-sell-stx-core-spread-v1': 5, 'jing-ladder-dispatch': 5, 'juice-pool-sbtc-signer': 6,
  'juice-sbtc-autoswap': 6, 'juice-autostake-safe': 6, 'juice-autostake-safe-auth-helpers-v1': 4, 'fastpool-swap-vault': 6,
  'signer-manager-vault-stx-rewards': 6, 'ccd015-redemption-book-mia-stx': 5, 'ccd016-swap-vault-mia-v2': 5 };
const list = new URL('./fixtures/coverage-mv7dfb-sims.txt', import.meta.url);
const sims = new Set([JSON.parse(fs.readFileSync(new URL('./fixtures/deploy-set-mv7dfb-result.json', import.meta.url))).simulation.split('/').pop()]);
if (fs.existsSync(list)) for (const l of fs.readFileSync(list, 'utf8').split('\n')) { const m = l.match(/^([0-9a-f]{32})/); if (m) sims.add(m[1]); }
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(C);
const rows = [];
for (const n of names) {
  const args = ['simulations/trace-coverage.mjs', '--contract', n, '--source', `simulations/deploy-bytes-mv7dfb/${n}.clar`, '--by-source', '--clarity', String(C[n]), '--sims', [...sims].join(',')];
  const md = execFileSync('node', [...args, '--md'], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
  fs.writeFileSync(new URL(`./TRACE-COVERAGE-mv7dfb-${n}.md`, import.meta.url), md);
  const e = md.match(/expressions executed \/ total \| (\d+) \/ (\d+)/), b = md.match(/branch nodes \(if \/ match \/ asserts!\) \| (\d+): (\d+) full, (\d+) partial, (\d+) never/);
  rows.push(`${n} | expr ${e?.[1]}/${e?.[2]} | branches ${b?.[1]}: ${b?.[2]} full, ${b?.[3]} partial, ${b?.[4]} never`);
  console.log(rows.at(-1));
}
