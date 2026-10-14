# Trace coverage: juice-sbtc-autoswap

From `simulations/trace-coverage-multi.mjs` on 2026-10-14: final deploy bytes `simulations/deploy-bytes-mv7dfb/juice-sbtc-autoswap.clar` (sha256 `ff0a45868897397187106fe284ed72ab64f2d3718adb238addf8d7c1a5909033`), counted only where a sim deployed these exact bytes (30 sims).

| metric | value |
|---|---|
| expressions executed / total | 523 / 933 (56.1%) |
| public functions reached | 17 / 19 |
| branch nodes (if / match / asserts!) | 68: 60 full, 3 partial, 5 never reached |

## Public functions never reached (2)

- set-leeway-bps
- set-dia-band-bps

## Read-only functions with no traced expression (2; read-only calls from Eval steps leave no trace)

get-clock, get-config

## Branches with one arm never taken (3)

| line | function | kind | state |
|---|---|---|---|
| 298 | emergency-recover | if | one arm (then only) |
| 666 | current-mid | if | one arm (then only) |
| 791 | jing-refloor | if | one arm (else only) |

## Branch nodes never reached (5)

| line | function | kind |
|---|---|---|
| 118 | set-leeway-bps | asserts! |
| 119 | set-leeway-bps | asserts! |
| 157 | set-dia-band-bps | asserts! |
| 158 | set-dia-band-bps | asserts! |
| 738 | get-clock | match |

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
| set-leeway-bps | 0 / 13 |
| set-dia-band-bps | 0 / 13 |
| get-clock | 0 / 18 |
| get-config | 0 / 23 |
| jing-refloor | 8 / 25 |
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
| get-dia-value | 15 / 20 |
| set-no-pyth-slippage-bps | 10 / 13 |
| set-pyth-fee-budget | 10 / 13 |
| set-slippage-bps | 10 / 13 |
| set-router-cooldown | 10 / 13 |
| current-mid | 22 / 28 |
| set-max-chunk-sats | 12 / 15 |
| market-total | 8 / 10 |
| close-batch | 20 / 25 |
| set-window-blocks | 13 / 16 |
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

## Sims counted (30)

`de9bd7b8` `01b8c978` `0b130236` `12cf15ee` `18933f00` `21bd3ee2` `2fd82a2e` `3270029d` `41ad661d` `46edf261` `4783a1b8` `4edd8ba9` `58c0fb76` `5c4cea9a` `7158b1ba` `7388231f` `75074c83` `768b1ae9` `8063c1da` `839af883` `8a0e577b` `c449ad8c` `c5e9f981` `d0108679` `d4af4cc8` `dd93a13a` `e547999d` `e78fe3b2` `da59d087` `5cf1573f`
