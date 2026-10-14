// _deploy-bytes.mjs - writes the EXACT mv7dfb deploy bytes to
// simulations/deploy-bytes-mv7dfb/<name>.clar, so trace-coverage.mjs
// --source <file> --by-source counts only sims that deployed these bytes.
// Templates: faktory-dao backend/server/utils/<name>-template.ts (body sha256
// must match the header). Partners: the repo file at its final commit.
//   node simulations/_deploy-bytes.mjs
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
const H = homedir();
const TPL = resolve(process.env.FAKTORY_DIR || resolve(H, 'projects/faktory-dao'), 'backend/server/utils');
const out = new URL('./deploy-bytes-mv7dfb/', import.meta.url);
const sha = (s) => createHash('sha256').update(s).digest('hex');
export function template(name) {
  const t = fs.readFileSync(resolve(TPL, `${name}-template.ts`), 'utf8');
  const body = t.slice(t.indexOf('= `') + 3, t.lastIndexOf('`')).replace(/\\([`$\\])/g, '$1');
  const want = (t.match(/SHA-256: ([0-9a-f]{64})/) || [])[1];
  if (sha(body) !== want) throw new Error(`${name}: ${sha(body)} != ${want}`);
  return body;
}
const TEMPLATES = ['jing-core-v6', 'jing-ladder-v1', 'markets-sbtc-stx-jing-v6-3', 'swap-router-sbtc-stx-jing-v5-3', 'jing-rung-deposit-trait',
  'jing-buy-stx-core-spread-v1', 'jing-sell-stx-core-spread-v1', 'jing-ladder-dispatch', 'juice-swap-vault-trait-v2', 'juice-pool-sbtc-signer',
  'juice-sbtc-autoswap', 'juice-autostake-safe-auth-helpers-v1', 'juice-autostake-safe'];
const PARTNERS = {
  'fastpool-swap-vault': resolve(H, 'projects/fastpool-pox-5/contracts/fastpool-swap-vault.clar'),
  'signer-manager-vault-stx-rewards': resolve(H, 'projects/fastpool-pox-5/contracts/signer-manager-vault-stx-rewards.clar'),
  'ccd015-redemption-book-mia-stx': resolve(H, 'projects/citycoins-protocol/contracts/extensions/ccd015-redemption-book-mia-stx.clar'),
  'ccd016-swap-vault-mia-v2': resolve(H, 'projects/citycoins-protocol/contracts/extensions/ccd016-swap-vault-mia-v2.clar'),
};
// ccd015/ccd016 deploy with full-line comments dropped, the form every ccd016
// harness deploys (the DAO's deploy form is not fixed; comment lines carry no code).
export function partner(n, p) {
  const t = fs.readFileSync(p, 'utf8');
  return n.startsWith('ccd01') ? t.split('\n').filter((l) => !/^\s*;;/.test(l)).join('\n') : t;
}
export const PARTNER_PATHS = PARTNERS;
if (process.argv[1] && process.argv[1].endsWith('_deploy-bytes.mjs')) {
  fs.mkdirSync(out, { recursive: true });
  const rows = [];
  for (const n of TEMPLATES) { const b = template(n); fs.writeFileSync(new URL(`${n}.clar`, out), b); rows.push(`${n}.clar ${Buffer.byteLength(b)} ${sha(b)} template`); }
  for (const [n, p] of Object.entries(PARTNERS)) { const b = partner(n, p); fs.writeFileSync(new URL(`${n}.clar`, out), b); rows.push(`${n}.clar ${Buffer.byteLength(b)} ${sha(b)} ${n.startsWith('ccd01') ? 'repo-file-comment-lines-dropped' : 'repo-file'}`); }
  fs.writeFileSync(new URL('SHA256SUMS.txt', out), rows.join('\n') + '\n');
  console.log(rows.join('\n'));
}
