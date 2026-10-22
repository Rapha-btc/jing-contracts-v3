// verify-yguazu-mm-loop-sell-stx.js
// yguazu-mm-loop-sell-stx on a mainnet fork of the LIVE set
// (markets-sbtc-stx-jing-v6-4 + jing-sell-stx-{1,10,...,90}).
// Vault sells STX into sell-stx rungs, claims sBTC, sells it back for STX
// with a pegged ask floored at ceil(VWAP * (10000 + edge) / 10000).
// Scenario groups A..I: see _yg-loop-engine.js (shared with the sell-sbtc mirror).
// Run: node simulations/verify-yguazu-mm-loop-sell-stx.js   (no PYTH key needed)
import { main } from './_yg-loop-engine.js';

main({
  side: 'stx',
  name: 'yguazu-mm-loop-sell-stx',
  seed: 941,
  errBase: 8200,
  rungPrefix: 'jing-sell-stx-',
  badRungs: ['jing-sell-stx-0', 'jing-buy-stx-1'],
  sold: 'y', got: 'x',
  posKey: 'stx',
  capFn: 'buy-back-floor', capIsFloor: true,
  onMarketFn: 'sats-on-market', onMarketKey: 'sats-on-market', heldGotKey: 'sbtc-held',
  oldCap: 10_000_000_000n, // the removed max-sell-ustx default: a sell above it must now pass
  fund: 800_000_000n,    // uSTX
  perRung: 5_000_000n,   // uSTX per rung in group B (market min-token-y = 1 STX)
  sell: 80_000_000n,     // uSTX for the leg-1 loop
  soldOut: 6_000_000n,   // uSTX for the sold-out rung test
  resetDust: 1_000n,     // RESET_DUST_SATS
  donation: 2_000n,      // sats donated straight to a rung (F2)
  evilPay: 8_000n,       // sats the hostile rung pays on claim
});
