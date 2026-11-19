// verify-yguazu-mm-loop-sell-usdcx.js
// yguazu-mm-loop-sell-usdcx on a mainnet fork of the LIVE sBTC/USDCx set
// (markets-sbtc-usdcx-jing-v6-5 + jing-buy-sbtc-{1,10,...,90}-v2, router
// swap-router-sbtc-usdcx-jing-v5-6 for swap-close).
// Vault sells USDCx into buy-sbtc rungs, claims sBTC, sells it back for USDCx
// with a pegged ask floored at ceil(VWAP * (10000 + edge) / 10000).
// Scenario groups: see _yg-loop-usdcx-engine.js and _yg-swap-close.js (SC)
// (shared with the sell-sbtc-usdcx mirror).
// SO swap-open: see _yg-swap-open.js (active entry, stale buy-back, exits, fees).
// Run: node simulations/verify-yguazu-mm-loop-sell-usdcx.js   (keyless)
//      DEPLOY_SRC=<deploy bytes .clar> node simulations/verify-yguazu-mm-loop-sell-usdcx.js
import { main } from './_yg-loop-usdcx-engine.js';

main({
  side: 'usdcx',
  name: 'yguazu-mm-loop-sell-usdcx',
  seed: 971,
  errBase: 8200,
  rungPrefix: 'jing-buy-sbtc-', rungSuffix: '-v2',
  // the old v1 rung (pre -v2, same trait) is now outside RUNGS too
  badRungs: ['jing-buy-sbtc-1', 'jing-sell-sbtc-1-v2', 'jing-sell-stx-1-v2'],
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
  // SC: inventory from a full fill of 200 USDCx on the 90 bps rung: pushing the
  // DLMM sBTC price UP costs USDCx (whale ~25k), so the inventory is bought
  // 90 bps under mid and the floor sits below the pool's sell price
  scBand: 90, scSell: 200_000_000n,
});
