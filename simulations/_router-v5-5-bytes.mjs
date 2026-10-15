// _router-v5-5-bytes.mjs - deploy bytes for swap-router-sbtc-stx-jing-v5-5
// (bounty mv8wal, Cunning Nexus #1: XYK pool-status gate), built the way the
// live v5-4 was: the faktory-dao v5-4 template (sha256 checked against its
// header = the bytes live on mainnet) plus the two v5-5 hunks in the
// template's formatting. Proven to be the repo v5-5 code: after dropping
// comments, the token stream equals contracts/swap-router-sbtc-stx-jing-v5-5.clar's.
//   routerV55Bytes()        -> targets markets-sbtc-stx-jing-v6-4 (live market)
//   routerV55Bytes('v6-3')  -> same bytes with the market id set to v6-3, for
//                              the v5-3 harnesses (their fork deploys v6-3)
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { template } from './_deploy-bytes.mjs';

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const REPO_V55 = new URL('../contracts/swap-router-sbtc-stx-jing-v5-5.clar', import.meta.url);
const REPO_V54 = new URL('../contracts/swap-router-sbtc-stx-jing-v5-4.clar', import.meta.url);
const HUNKS = [
  ['      x-is-sbtc: x-is-sbtc,\n    }\n',
    '      x-is-sbtc: x-is-sbtc,\n      status: (get pool-status pool),\n    }\n'],
  ['        (cap-xyk (cp-capacity (get reserves q) (get keep q) limit sell-sbtc))\n',
    '        (cap-xyk (if (get status q)\n          (cp-capacity (get reserves q) (get keep q) limit sell-sbtc)\n          u0\n        ))\n'],
];
// code tokens: comments dropped (no string literal in the router holds ";;")
export const tokens = (s) => s.split('\n').map((l) => l.replace(/;;.*$/, '')).join(' ')
  .replace(/([()])/g, ' $1 ').split(/\s+/).filter(Boolean);

let cache = null;
function build() {
  if (cache) return cache;
  // the read is never redirected: _use-deploy-bytes only knows mv7dfb names
  const t54 = template('swap-router-sbtc-stx-jing-v5-4');
  if (tokens(t54).join(' ') !== tokens(fs.readFileSync(REPO_V54, 'utf8')).join(' ')) throw new Error('v5-4 template != repo v5-4 code');
  let b = t54;
  for (const [from, to] of HUNKS) {
    if (b.split(from).length !== 2) throw new Error(`v5-5 hunk not found once: ${from}`);
    b = b.replace(from, to);
  }
  if (tokens(b).join(' ') !== tokens(fs.readFileSync(REPO_V55, 'utf8')).join(' ')) throw new Error('built v5-5 bytes != repo v5-5 code');
  cache = { v54: t54, v55: b };
  return cache;
}
export const routerV54Bytes = () => build().v54;
export function routerV55Bytes(market = 'v6-4') {
  const b = build().v55;
  if (market === 'v6-4') return b;
  const from = 'markets-sbtc-stx-jing-v6-4', to = `markets-sbtc-stx-jing-${market}`;
  if (b.split(from).length !== 3) throw new Error('expected 2 market ids in the router');
  return b.split(from).join(to);
}
if (process.argv[1] && process.argv[1].endsWith('_router-v5-5-bytes.mjs')) {
  for (const [n, s] of [['v5-4 (template)', routerV54Bytes()], ['v5-5', routerV55Bytes()], ['v5-5 on v6-3', routerV55Bytes('v6-3')]]) {
    console.log(`${n}: ${Buffer.byteLength(s)} B sha256 ${sha256(s)}`);
  }
}
