# Trace coverage: ccd016-swap-vault-mia-v2

From `simulations/trace-coverage-multi.mjs` on 2026-10-14: final deploy bytes `simulations/deploy-bytes-mv7dfb/ccd016-swap-vault-mia-v2.clar` (sha256 `a7062d390719177f08581a729aa26481d4e12cc811b58a27c5442d4528fa48c6`), counted only where a sim deployed these exact bytes (20 sims).

| metric | value |
|---|---|
| expressions executed / total | 552 / 895 (61.7%) |
| public functions reached | 22 / 22 |
| branch nodes (if / match / asserts!) | 48: 48 full, 0 partial, 0 never reached |

## Public functions never reached (0)


## Read-only functions with no traced expression (0; read-only calls from Eval steps leave no trace)



## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (0)

| line | function | kind |
|---|---|---|

## Function bodies (expressions hit / total)

| function | hit / total |
|---|---|
| ERR_UNAUTHORIZED | 0 / 1 |
| ERR_NO_FUNDS | 0 / 1 |
| ERR_NO_BUDGET | 0 / 1 |
| ERR_INVALID_PRICE | 0 / 1 |
| ERR_WINDOW_CLOSED | 0 / 1 |
| ERR_WINDOW_OPEN | 0 / 1 |
| ERR_NO_CLOCK | 0 / 1 |
| ERR_OUT_OF_RANGE | 0 / 1 |
| ERR_NOTHING_RESTING | 0 / 1 |
| ERR_ORACLE_DIA | 0 / 1 |
| ERR_ORACLE_STALE | 0 / 1 |
| ERR_ORACLE_DIVERGED | 0 / 1 |
| ERR_NO_BLOCK_TIME | 0 / 1 |
| ERR_CHUNK_TOO_BIG | 0 / 1 |
| ERR_SPLIT_MISMATCH | 0 / 1 |
| ERR_SOME_FUNDS | 0 / 1 |
| ERR_COOLDOWN | 0 / 1 |
| ERR_BELOW_FLOOR | 0 / 1 |
| ERR_UPDATE_REQUIRED | 0 / 1 |
| batch-start | 0 / 1 |
| get-config | 10 / 22 |
| get-clock | 9 / 16 |
| get-status | 13 / 22 |
| router-swap-split-dia | 41 / 68 |
| get-no-pyth-price | 20 / 33 |
| router-swap-split | 47 / 76 |
| chunk-amount | 5 / 8 |
| fuel-fair-book | 17 / 27 |
| jing-take | 23 / 36 |
| reclaim-core | 25 / 39 |
| vault-mid | 4 / 6 |
| jing-place | 18 / 27 |
| router-swap | 43 / 62 |
| dao-recall-sbtc | 16 / 23 |
| jing-refloor | 21 / 30 |
| get-dia-price | 10 / 14 |
| sweep-amount | 5 / 7 |
| fund-from-treasury | 24 / 32 |
| get-dia-value | 15 / 20 |
| set-no-pyth-slippage-bps | 10 / 13 |
| set-pyth-fee-budget | 10 / 13 |
| close-batch | 19 / 24 |
| market-total | 8 / 10 |
| current-mid | 23 / 28 |
| is-empty | 11 / 13 |
| is-dao-or-extension | 5 / 5 |
| callback | 1 / 1 |
| set-window-blocks | 7 / 7 |
| set-leeway-bps | 7 / 7 |
| set-slippage-bps | 7 / 7 |
| set-max-chunk-sats | 9 / 9 |
| set-dia-band-bps | 7 / 7 |
| set-router-cooldown | 7 / 7 |
| sbtc-balance | 2 / 2 |
| close-if-empty | 3 / 3 |
| dao-reclaim | 4 / 4 |
| window-elapsed | 5 / 5 |
| open-window | 2 / 2 |
| ask-of | 4 / 4 |
| window-open | 5 / 5 |
| check-amount | 7 / 7 |
| floor-of | 4 / 4 |
| phase-limit | 4 / 4 |
| jing-reclaim | 4 / 4 |
| cooldown-tick | 8 / 8 |
| floor-out | 3 / 3 |

## Sims counted (20)

`de9bd7b8` `0d61fa25` `2f47455f` `35d275ea` `36b4f87e` `3c99bc1e` `486a08d0` `4d1bb9ef` `523e3e7d` `54256428` `58724eb0` `5a727d6d` `75f1cd13` `7668f859` `8a2c60cc` `b18edad1` `e3f21dae` `e58d43d1` `e8c0247d` `5cf1573f`
