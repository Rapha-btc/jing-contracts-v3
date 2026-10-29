// verify-yguazu-mm-loop-sell-usdcx.js
// yguazu-mm-loop-sell-usdcx on a mainnet fork of the LIVE sBTC/USDCx set
// (markets-sbtc-usdcx-jing-v6-4 + jing-buy-sbtc-{1,10,...,90}).
// Vault sells USDCx into buy-sbtc rungs, claims sBTC, sells it back for USDCx
// with a pegged ask floored at ceil(VWAP * (10000 + edge) / 10000).
// Scenario groups: see _yg-loop-usdcx-engine.js (shared with the sell-sbtc-usdcx mirror).
// Run: node simulations/verify-yguazu-mm-loop-sell-usdcx.js   (keyless)
//      DEPLOY_SRC=<deploy bytes .clar> node simulations/verify-yguazu-mm-loop-sell-usdcx.js
import { main } from './_yg-loop-usdcx-engine.js';

main({
  side: 'usdcx',
  name: 'yguazu-mm-loop-sell-usdcx',
  seed: 971,
  errBase: 8200,
  rungPrefix: 'jing-buy-sbtc-',
  badRungs: ['jing-sell-sbtc-1', 'jing-sell-stx-1'],
  sold: 'y', got: 'x',
  posKey: 'stx',          // the rung trait's `stx` key carries USDCx here
  capFn: 'buy-back-floor', capIsFloor: true,
  onMarketFn: 'sats-on-market', onMarketKey: 'sats-on-market', heldGotKey: 'sbtc-held',
  rungHeldKey: 'held-uusdcx',
  oldCap: 1_000_000_000n, // 1,000 USDCx: a large sell passes (no size cap)
  fund: 800_000_000n,     // uUSDCx
  perRung: 5_000_000n,    // uUSDCx per rung (market min-token-y = 1 USDCx, rung min 0.1)
  sell: 80_000_000n,      // uUSDCx for the leg-1 loop
  soldOut: 6_000_000n,    // uUSDCx for the sold-out rung test
  resetDust: 1_000n,      // RESET_DUST_SATS
  donation: 2_000n,       // sats donated straight to a rung (F2)
  evilPay: 8_000n,        // sats the hostile rung pays on claim
  zSell: 1n,              // Z: 1 uUSDCx sold ...
  zPay: 2_000_000n,       // ... for 2,000,000 sats: VWAP 5,000, floor ceil(5012.5)
});
