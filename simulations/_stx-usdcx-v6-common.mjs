// _stx-usdcx-v6-common.mjs - shared constants + pure helpers for the
// STX/USDCx ports of the v6-3 / v6-rungs stxer suites (set B of the v6-5
// regression; see README-coverage-stx-usdcx.md).
//
// The STX/USDCx set is NOT on mainnet: every suite deploys it from
// contracts/stx-usdcx/ (whole-line ;; comments stripped = the deploy bytes)
// as the Jing deployer, on a fork at the tip (the names are free there).
// jing-core-v6 is the LIVE one (owner = the multisig since 2026-10-24), so
// verify + initialize are sent by CORE_OWNER (stxer does not check
// signatures), exactly as on the real deploy.
//
// Token x = native STX (6 dp): stx-transfer?, stx-get-balance, no SIP-010
//   asset. The market keeps the x trait/asset-name args (same ABI); pass
//   token-stx-v-1-2 / "wstx" (compared to token-x only, never called).
// Token y = USDCx (SIP-010, 6 dp, asset "usdcx-token").
// Price unit: USDCx per STX x 1e8, both 6 dp -> y = x * price / 1e8
//   (DECIMAL_FACTOR u1; the sBTC/STX market is y = x * price / 1e10).
// Lazer feeds [45, 7]: STX/USD, USDC/USD (faktory-dao route pair=stx-usdcx).
// Ladder sides are swapped vs sBTC/STX by name, equal by role:
//   x side (rests STX)    = "sel-band" rungs jing-sell-stx-usdc-<bps>, dispatch deposit-sell
//   y side (rests USDCx)  = "buy-band" rungs jing-buy-stx-usdc-<bps>,  dispatch deposit-buy
//   (sBTC/STX: x = buy-band jing-buy-stx-*, y = sel-band jing-sell-stx-*)
// Rung trait keys are positional: `sbtc`/`sbtc-paid` = token x (uSTX here),
//   `stx`/`stx-paid` = token y (uUSDCx here).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { contractPrincipalCV, standardPrincipalCV, stringAsciiCV, bufferCV, getAddressFromPrivateKey } from '@stacks/transactions';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

export const NODE = process.env.STACKS_NODE || 'http://77.42.3.101/stacks-api';
export const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
export const CORE = `${DEP}.jing-core-v6`;
// live owner of jing-core-v6 (and the market operator at initialize); harnesses
// should still read (get-contract-owner) and must() it equals this
export const CORE_OWNER = 'SM1N7VX04M1TT23KD7YHVD6H6413QV2ZNJFTWVF9P';
export const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
export const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
export const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
export const USDCX_ASSET = 'usdcx-token';
export const DIA = 'SP1G48FZ4Y7JY8G2Z0N51QTCYGBQ6F4J43J77BQC0.dia-oracle';
// funding whales at the tip (2026-11-16): STX 3.4M / 0.9M; USDCx 25k + 56k + 47k
export const STX_WHALES = ['SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ', 'SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR'];
export const USDCX_WHALES = ['SP3A7MGAH0SKC1ACS854PHXHVWE031FYQCBA8M51D', 'SP1H07DSRT0T5X8YWHPVYPNWVPA2DZ1NNNNF879JN', 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ'];
export const WHALES = { x: STX_WHALES[0], y: USDCX_WHALES[0] };

export const N = {
  ladder: 'jing-ladder-stx-usdcx-v1',
  market: 'markets-stx-usdcx-jing-v6-4',
  dispatch: 'jing-ladder-dispatch-stx-usdcx',
  relay: 'jing-ladder-dispatch-stx-usdcx-relay',
  batch: 'jing-settle-batch-stx-usdcx',
  router: 'swap-router-stx-usdcx-jing-v5-5',
  routerV6: 'swap-router-stx-usdcx-jing-v6',
  buyTpl: 'jing-buy-stx-usdc-bps', // y-resting (USDCx) band rung template; deploy as jing-buy-stx-usdc-<bps>
  sellTpl: 'jing-sell-stx-usdc-bps', // x-resting (STX) band rung template; deploy as jing-sell-stx-usdc-<bps>
};
export const C = Object.fromEntries(Object.entries(N).map(([k, v]) => [k, `${DEP}.${v}`]));
// role -> rung name for a band rung at <bps>
export const RUNG = { x: (bps) => `jing-sell-stx-usdc-${bps}`, y: (bps) => `jing-buy-stx-usdc-${bps}` };
export const LADDER_SIDE = { x: 'sel-band', y: 'buy-band' };
export const DISPATCH_DIR = { x: 'sell', y: 'buy' }; // deposit-<dir> / withdraw-<dir> / claim-<dir>

export const P_ = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
export const traits = { x: P_(WSTX), y: P_(USDCX) };
export const assets = { x: stringAsciiCV('wstx'), y: stringAsciiCV(USDCX_ASSET) };
export const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');

// units
export const PRICE_PRECISION = 100_000_000n;
export const SCALE = PRICE_PRECISION; // y = x * price / SCALE  (sBTC/STX: 1e10)
export const BPS = 10_000n;
export const yOf = (x, price) => x * price / SCALE;
export const xOf = (y, price) => y * SCALE / price;
// suggested market mins (README): 1 STX / 1 USDCx
export const MIN = { x: 1_000_000n, y: 1_000_000n };

// Clarity expressions for balances (Eval inside any contract)
export const balanceExpr = (side, p) => side === 'x' ? `(stx-get-balance '${p})` : `(unwrap-panic (contract-call? '${USDCX} get-balance '${p}))`;

// sources: whole-line comments stripped (the deploy bytes)
export const strip = (s) => s.split('\n').filter((l) => !/^\s*;;/.test(l)).join('\n');
export const rawSrc = (name) => readFileSync(new URL(`../contracts/stx-usdcx/${name}.clar`, import.meta.url), 'utf8');
export const src = (name) => strip(rawSrc(name));
// a market copy deployed under another name: rungs / router / batch bind the
// market by full principal; rebind a dependant's source onto that name
export const rebindMarket = (code, name) => code.split(`${DEP}.${N.market}`).join(`${DEP}.${name}`);
export const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// Lazer [45, 7]
export const FEEDS = [45, 7];
export const lazer = () => fetchLazerUpdateAny(FEEDS);
export const lazerTimes = (hex) => lazerFeedTimes(hex, FEEDS);
export const midOf = (u) => u.px * PRICE_PRECISION / u.py;
export const updCV = (u) => bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex'));
// a signed [45,7] update whose OLDER feed time is > stamp (settle needs at > submitted-at)
export async function freshAfter(stamp, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const u = await lazer();
      const t = await lazerTimes(u.hex);
      if (t.at > stamp) return { ...u, at: t.at, mid: midOf(u) };
    } catch (e) { if (i > 5) throw e; }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error(`no [45,7] Lazer update newer than ${stamp}`);
}
