# Trace coverage: fastpool-swap-vault

From `simulations/trace-coverage-multi.mjs` on 2026-10-14: final deploy bytes `simulations/deploy-bytes-mv7dfb/fastpool-swap-vault.clar` (sha256 `aaebf34b4f14044459db4857f9d7849355a4113f51f24afc3e00f3b98101fdac`), counted only where a sim deployed these exact bytes (13 sims).

| metric | value |
|---|---|
| expressions executed / total | 571 / 933 (61.2%) |
| public functions reached | 19 / 19 |
| branch nodes (if / match / asserts!) | 68: 67 full, 1 partial, 0 never reached |

## Public functions never reached (0)


## Read-only functions with no traced expression (0; read-only calls from Eval steps leave no trace)



## Branches with one arm never taken (1)

| line | function | kind | state |
|---|---|---|---|
| 807 | get-clock | match | one arm (else only) |

## Branch nodes never reached (0)

| line | function | kind |
|---|---|---|

## Function bodies (expressions hit / total)

| function | hit / total |
|---|---|
| ERR_RECOVERY_TOO_SOON | 0 / 1 |
| ERR_BUSY | 0 / 1 |
| ERR_UNAUTHORIZED | 0 / 1 |
| ERR_NO_FUNDS | 0 / 1 |
| ERR_INVALID_PRICE | 0 / 1 |
| ERR_WINDOW_CLOSED | 0 / 1 |
| ERR_WINDOW_OPEN | 0 / 1 |
| ERR_NO_CLOCK | 0 / 1 |
| ERR_ORACLE_DIA | 0 / 1 |
| ERR_ORACLE_STALE | 0 / 1 |
| ERR_ORACLE_DIVERGED | 0 / 1 |
| ERR_NO_BLOCK_TIME | 0 / 1 |
| ERR_CHUNK_TOO_BIG | 0 / 1 |
| ERR_SOME_FUNDS | 0 / 1 |
| ERR_COOLDOWN | 0 / 1 |
| ERR_BELOW_FLOOR | 0 / 1 |
| ERR_OUT_OF_RANGE | 0 / 1 |
| ERR_SPLIT_MISMATCH | 0 / 1 |
| ERR_UPDATE_REQUIRED | 0 / 1 |
| batch-start | 0 / 1 |
| get-clock | 7 / 18 |
| get-config | 10 / 23 |
| get-upgrade-status | 10 / 19 |
| reclaim-core | 9 / 15 |
| router-swap-split-dia | 41 / 68 |
| get-no-pyth-price | 20 / 33 |
| router-swap-split | 47 / 76 |
| chunk-amount | 5 / 8 |
| jing-take | 24 / 38 |
| vault-mid | 4 / 6 |
| jing-place | 18 / 27 |
| finish | 22 / 32 |
| router-swap | 43 / 62 |
| emergency-recover | 50 / 70 |
| get-dia-price | 10 / 14 |
| sweep-amount | 5 / 7 |
| jing-refloor | 18 / 25 |
| get-dia-value | 15 / 20 |
| set-no-pyth-slippage-bps | 10 / 13 |
| set-leeway-bps | 10 / 13 |
| set-slippage-bps | 10 / 13 |
| set-dia-band-bps | 10 / 13 |
| set-router-cooldown | 10 / 13 |
| set-pyth-fee-budget | 10 / 13 |
| set-max-chunk-sats | 12 / 15 |
| market-total | 8 / 10 |
| close-batch | 20 / 25 |
| set-window-blocks | 13 / 16 |
| current-mid | 23 / 28 |
| fund | 19 / 23 |
| is-empty | 11 / 13 |
| sbtc-balance | 2 / 2 |
| ask-of | 4 / 4 |
| window-open | 5 / 5 |
| check-amount | 7 / 7 |
| window-elapsed | 5 / 5 |
| jing-reclaim | 4 / 4 |
| floor-of | 4 / 4 |
| close-if-empty | 5 / 5 |
| cooldown-tick | 8 / 8 |
| floor-out | 3 / 3 |

## Sims counted (13)

`de9bd7b8` `1599af88` `38122515` `40bee8c0` `41c6aa11` `59cdc203` `6f30d6e2` `ad49570e` `ec16a3f8` `d55a9bb0` `da59d087` `5cf1573f` `692f5727`
