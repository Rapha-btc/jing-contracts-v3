// verify-yguazu-mm-loop-sell-sbtc.js
// yguazu-mm-loop-sell-sbtc on a mainnet fork of the LIVE set
// (markets-sbtc-stx-jing-v6-5 + jing-buy-stx-{1,10,...,90}-v2, router
// swap-router-sbtc-stx-jing-v5-6 for swap-close).
// Vault sells sBTC into buy-stx rungs, claims STX, buys sBTC back with a
// pegged bid capped at VWAP * (10000 - edge) / 10000.
// Scenario groups A..K + SC (swap-close): see _yg-loop-engine.js and
// _yg-swap-close.js (shared with the sell-stx mirror).
// SO swap-open: see _yg-swap-open.js (active entry, stale buy-back, exits, fees).
// Run: node simulations/verify-yguazu-mm-loop-sell-sbtc.js   (no PYTH key needed)
import { main } from './_yg-loop-engine.js';

main({
  side: 'sbtc',
  name: 'yguazu-mm-loop-sell-sbtc',
  seed: 961,
  errBase: 8100,
  rungPrefix: 'jing-buy-stx-', rungSuffix: '-v2',
  // the old v1 rung (pre -v2, same trait) is now outside RUNGS too
  badRungs: ['jing-buy-stx-0', 'jing-buy-stx-1', 'jing-sell-stx-1-v2'],
  sold: 'x', got: 'y',
  posKey: 'sbtc',
  capFn: 'buy-back-cap', capIsFloor: false,
  onMarketFn: 'stx-on-market', onMarketKey: 'stx-on-market', heldGotKey: 'stx-held',
  oldCap: 5_000_000n,   // the removed max-sell-sats default: a sell above it must now pass
  fund: 400_000n,       // sats
  perRung: 2_000n,      // sats per rung in group B (market min-token-x = 1,000)
  sell: 40_000n,        // sats for the leg-1 loop
  soldOut: 3_000n,      // sats for the sold-out rung test
  resetDust: 1_000_000n, // RESET_DUST_USTX
  donation: 5_000_000n,  // uSTX donated straight to a rung (F2)
  evilPay: 10_000_000n, // uSTX the hostile rung pays on claim
  scBand: 1, scSell: 60_000n, // SC: inventory from a full fill of 60,000 sats on the 1 bps rung
});
