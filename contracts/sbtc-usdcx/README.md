# sBTC/USDCx market suite

Fork of the live sbtc-stx v6-4 set (mainnet sources at `863921d`) for sBTC (token x, 8 dp) against USDCx (token y, 6 dp).
Diff against the fork sources: `git diff 863921d -- contracts/sbtc-usdcx` (renames landed alone in `24467aa`).

## Contracts

| Deploy name | Forked from | Change |
|---|---|---|
| `jing-ladder-sbtc-usdcx-v1` | `jing-ladder-v1` | side labels follow sBTC: `sel-band` = x (rests sBTC), `buy-band` = y (rests USDCx) |
| `markets-sbtc-usdcx-jing-v6-4` | `markets-sbtc-stx-jing-v6-4` | every token-y move is a USDCx ft transfer (`USDCX` constant + `with-ft`); `initialize` pins y to USDCx; binds the new ladder |
| `jing-sell-sbtc-<bps>` (`jing-sell-sbtc-bps.clar`) | `jing-buy-stx-<bps>` | rests sBTC, proceeds in USDCx; floor = DIA BTC/USD x 0.80 |
| `jing-buy-sbtc-<bps>` (`jing-buy-sbtc-bps.clar`) | `jing-sell-stx-<bps>` | rests USDCx, proceeds in sBTC; cap = DIA BTC/USD x 1.20 |
| `jing-ladder-dispatch-sbtc-usdcx` | `jing-ladder-dispatch` | binds the new ladder; deposit-buy = USDCx into buy-sbtc rungs, deposit-sell = sBTC into sell-sbtc rungs |
| `jing-settle-batch-sbtc-usdcx` | `jing-settle-batch` | binds the new market, token y = USDCx |
| `swap-router-sbtc-usdcx-jing-v5-5` | `swap-router-sbtc-stx-jing-v5-5` | Jing book + Bitflow DLMM sbtc-usdcx pools (ids 1, 2, 17; x = sBTC); xyk/Velar removed (amounts must be 0, else u3003); `*-sbtc-for-usdcx` / `*-usdcx-for-sbtc` |

Reused as deployed: `jing-core-v6`, `jing-rung-deposit-trait`. The rung trait keeps its `stx` / `stx-paid` keys (they carry USDCx amounts here).

## Deploy order (deployer SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22)

1. `jing-ladder-sbtc-usdcx-v1`, then the ladder owner sets the canonical rung hashes per side
2. `markets-sbtc-usdcx-jing-v6-4`, then `jing-core-v6 set-verified-contract` and `initialize(market, sbtc-token, usdcx, min-x, min-y, u1, u7)`
3. rungs `jing-sell-sbtc-<bps>` / `jing-buy-sbtc-<bps>`, `initialize` each
4. `jing-ladder-dispatch-sbtc-usdcx`, `jing-settle-batch-sbtc-usdcx`, `swap-router-sbtc-usdcx-jing-v5-5`

## Pricing

- Market mid: Pyth Lazer BTC/USD (feed 1) / USDC/USD (feed 7), one signed update, both expo -8. Keyless fetch: `GET /api/auction/pyth-lazer-update?pair=sbtc-usdcx` on the faktory-dao backend.
- Rung fat-finger guard: DIA `get-value "BTC/USD"` (8 dp = the market price unit). DIA posts every ~15 min (max gap ~18 min); guard = +/-20% (`GUARD_BPS u2000`), u0 (no push) when DIA is >24h stale. The guard is refreshed on push or by anyone via `refresh-guard`.
- sBTC = BTC and USDCx = USDC are assumed; a bridge depeg is handled by pausing the market (keeper).

## stxer simulations (mainnet fork)

| Harness | What it covers | Result |
|---|---|---|
| `simulations/verify-sbtc-usdcx-v6-4.mjs` | market alone: deploy, core verify, initialize (feeds 1/7), USDCx moves, makers, takers both ways, cancel refund, [1,45] update rejected (u1023) | 23/23 [40b25b00](https://stxer.xyz/simulations/mainnet/40b25b00b8eea7827dd11dc484d4fad0) (before the ladder rebind) |
| `simulations/verify-router-sbtc-usdcx-v5-5.mjs` | router: DLMM-only both ways, book + DLMM split, limit abort u3002, no residual balance | 38/38 [a55950b5](https://stxer.xyz/simulations/mainnet/a55950b5d16c98872bc1c6594fc9d585) |
| `simulations/verify-sbtc-usdcx-suite.mjs` | full suite: deploy order, band seating per side, DIA guard, dispatch deposits, settle-batch, router fills into rungs, payouts/decimals, partial withdraws, no residual | 70/70 [b6360efa](https://stxer.xyz/simulations/mainnet/b6360efa004c279875b5b08a4910bc6f) (guard +/-20%) |

Run: `node simulations/<harness>` (keyless; Hiro 429s -> `simulations/_api-proxy.mjs`).
Not covered: the 24h DIA staleness path (a fork cannot make DIA stale). A 0 bps rung cannot run on both sides at once (the second crosses the first at mid and is refunded, by design).
