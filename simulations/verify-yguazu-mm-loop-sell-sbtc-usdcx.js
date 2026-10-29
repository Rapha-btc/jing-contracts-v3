// verify-yguazu-mm-loop-sell-sbtc-usdcx.js
// yguazu-mm-loop-sell-sbtc-usdcx on a mainnet fork of the LIVE sBTC/USDCx set
// (markets-sbtc-usdcx-jing-v6-4 + jing-sell-sbtc-{1,10,...,90}).
// Vault sells sBTC into sell-sbtc rungs, claims USDCx, buys sBTC back with a
// pegged bid capped at floor(floor(VWAP) * (10000 - edge) / 10000).
// Scenario groups: see _yg-loop-usdcx-engine.js (shared with the sell-usdcx mirror).
// Run: node simulations/verify-yguazu-mm-loop-sell-sbtc-usdcx.js   (keyless)
//      DEPLOY_SRC=<deploy bytes .clar> node simulations/verify-yguazu-mm-loop-sell-sbtc-usdcx.js
import { main } from './_yg-loop-usdcx-engine.js';

main({
  side: 'sbtc-usdcx',
  name: 'yguazu-mm-loop-sell-sbtc-usdcx',
  seed: 981,
  errBase: 8100,
  rungPrefix: 'jing-sell-sbtc-',
  badRungs: ['jing-buy-sbtc-1', 'jing-buy-stx-1'],
  sold: 'x', got: 'y',
  posKey: 'sbtc',
  capFn: 'buy-back-cap', capIsFloor: false,
  onMarketFn: 'usdcx-on-market', onMarketKey: 'usdcx-on-market', heldGotKey: 'usdcx-held',
  rungHeldKey: 'held-sats',
  oldCap: 5_000_000n,     // 0.05 BTC: a large sell passes (no size cap)
  fund: 400_000n,         // sats
  perRung: 2_000n,        // sats per rung (market min-token-x = 1,000, rung min 100)
  sell: 40_000n,          // sats for the leg-1 loop
  soldOut: 3_000n,        // sats for the sold-out rung test
  resetDust: 1_000_000n,  // RESET_DUST_UUSDCX
  donation: 5_000_000n,   // uUSDCx donated straight to a rung (F2)
  evilPay: 10_000_000n,   // uUSDCx the hostile rung pays on claim
  zSell: 2_000_000n,      // Z: 2,000,000 sats sold ...
  zPay: 1n,               // ... for 1 uUSDCx: VWAP 5,000, cap 4987, 0 at edge 9999
});
