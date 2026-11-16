// _sbtc-usdcx-v6-5-common.mjs - shared constants + deploy bytes for the
// sBTC/USDCx v6-5 regression ports (verify-*-sbtc-usdcx.mjs).
//
// Deploy bytes come from the faktory-dao templates (what the backend deploys),
// never from the repo source: each template's SHA-256 is checked against the
// hash in its own header before anything is returned.
//   market  markets-sbtc-usdcx-jing-v6-5     (feeds [1,7], token y USDCx)
//   router  swap-router-sbtc-usdcx-jing-v5-6
//   batch   jing-settle-batch-sbtc-usdcx-v2
//   buy     jing-buy-sbtc-bps-v2   (rests USDCx = y side, paid in sBTC; ladder "buy-band", is-band-y)
//   sell    jing-sell-sbtc-bps-v2  (rests sBTC  = x side, paid in USDCx; ladder "sel-band", is-band-x)
// They run on the LIVE jing-core-v6 (owner = multisig), jing-ladder-sbtc-usdcx-v1
// and jing-ladder-dispatch-sbtc-usdcx; owner calls use the live owners (stxer
// accepts any sender). The market binds `.jing-core-v6` and
// `.jing-ladder-sbtc-usdcx-v1` by relative name, so a copy of the SAME bytes
// deployed by DEP under another name binds the same live pair.
//
// Side mapping from the sBTC/STX suites:  STX "buy-stx" (rests x)  -> "sell-sbtc"
//                                         STX "sell-stx" (rests y) -> "buy-sbtc"
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

export const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
export const NODE = process.env.STACKS_NODE || 'http://77.42.3.101/stacks-api';
export const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
export const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
export const ASSET_X = 'sbtc-token', ASSET_Y = 'usdcx-token';
export const SBTC_WHALE = 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
export const USDC_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ';
export const FEEDS = [1, 7];
export const CORE = `${DEP}.jing-core-v6`;
export const LADDER = `${DEP}.jing-ladder-sbtc-usdcx-v1`;
export const DISPATCH = `${DEP}.jing-ladder-dispatch-sbtc-usdcx`;
export const NAMES = {
  market: 'markets-sbtc-usdcx-jing-v6-5',
  router: 'swap-router-sbtc-usdcx-jing-v5-6',
  batch: 'jing-settle-batch-sbtc-usdcx-v2',
  buy: 'jing-buy-sbtc-bps-v2',
  sell: 'jing-sell-sbtc-bps-v2',
};
export const MARKET = `${DEP}.${NAMES.market}`;
// ladder side keys: x-resting band = "sel-band", y-resting band = "buy-band"
export const SIDE_KEY = { x: 'sel-band', y: 'buy-band' };
export const rungName = (side, bps) => `jing-${side === 'x' ? 'sell' : 'buy'}-sbtc-${bps}-v2`;

const TPL = process.env.FAKTORY_TEMPLATES || '/home/raphastacks/projects/faktory-dao/backend/server/utils/';
const cache = {};
export const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
function load(key) {
  if (cache[key]) return cache[key];
  const name = NAMES[key];
  const t = readFileSync(`${TPL}${name}-template.ts`, 'utf8');
  const want = /SHA-256: ([0-9a-f]{64})/.exec(t)?.[1];
  const len = Number(/Deploy bytes: (\d+)/.exec(t)?.[1]);
  const body = t.slice(t.indexOf('`') + 1, t.lastIndexOf('`'));
  if (/\\|\$\{/.test(body)) throw new Error(`${name}: template has escapes, cannot take the literal as-is`);
  const got = sha256(body);
  if (got !== want || Buffer.byteLength(body) !== len) throw new Error(`${name}: SHA-256 ${got} / ${Buffer.byteLength(body)} B != header ${want} / ${len} B`);
  cache[key] = { name, code: body, sha256: got, bytes: len };
  return cache[key];
}
// exact template bytes (hash-checked)
export const bytes = (key) => load(key).code;
export const hashes = () => Object.fromEntries(Object.keys(NAMES).map((k) => [NAMES[k], { sha256: load(k).sha256, bytes: load(k).bytes }]));
// the same bytes with the hard-coded market principal rebound to another
// DEP-deployed market name (rungs / router / batch next to a renamed market)
export const rebind = (key, marketName) => bytes(key).split(MARKET).join(`${DEP}.${marketName}`);
export function printHashes() {
  for (const [n, h] of Object.entries(hashes())) console.log(`[sbtc-usdcx v6-5 bytes] ${n} ${h.bytes} B sha256 ${h.sha256} (template header OK)`);
}

// Lazer [1,7] (BTC/USD, USDC/USD) via the faktory-dao route (pair=sbtc-usdcx)
export const fetchUsdcxUpdate = () => fetchLazerUpdateAny(FEEDS);
export const usdcxFeedTimes = (hex) => lazerFeedTimes(hex, FEEDS);
// market mid for an update: y per x * 1e8 (uUSDCx per sat * 1e8 * 100)
export const midOf = (u) => u.px * 100000000n / u.py;
// Clarity snippets
export const usdcxBalExpr = (p) => `(unwrap-panic (contract-call? '${USDCX} get-balance '${p}))`;
export const sbtcBalExpr = (p) => `(unwrap-panic (contract-call? '${SBTC} get-balance '${p}))`;
