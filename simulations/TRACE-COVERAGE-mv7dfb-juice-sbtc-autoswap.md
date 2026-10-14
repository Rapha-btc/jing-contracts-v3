# Trace coverage: juice-sbtc-autoswap

From `simulations/trace-coverage-multi.mjs` on 2026-10-14: final deploy bytes `simulations/deploy-bytes-mv7dfb/juice-sbtc-autoswap.clar` (sha256 `ff0a45868897397187106fe284ed72ab64f2d3718adb238addf8d7c1a5909033`), counted only where a sim deployed these exact bytes (73 sims).

| metric | value |
|---|---|
| expressions executed / total | 574 / 933 (61.5%) |
| public functions reached | 19 / 19 |
| branch nodes (if / match / asserts!) | 68: 68 full, 0 partial, 0 never reached |

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
| get-config | 10 / 23 |
| get-upgrade-status | 10 / 19 |
| get-clock | 10 / 18 |
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
| set-pyth-fee-budget | 10 / 13 |
| set-leeway-bps | 10 / 13 |
| set-slippage-bps | 10 / 13 |
| set-dia-band-bps | 10 / 13 |
| set-router-cooldown | 10 / 13 |
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

## Sims counted (73)

`b220ceef` `01b8c978` `0b130236` `12cf15ee` `18933f00` `21bd3ee2` `2fd82a2e` `3270029d` `41ad661d` `46edf261` `4783a1b8` `4edd8ba9` `58c0fb76` `5c4cea9a` `7158b1ba` `7388231f` `75074c83` `768b1ae9` `8063c1da` `839af883` `8a0e577b` `c449ad8c` `c5e9f981` `d0108679` `d4af4cc8` `dd93a13a` `e547999d` `e78fe3b2` `da59d087` `5cf1573f` `b6fd12bd` `6fd87036` `692f5727` `b8f56b5d` `80c3db54` `4577cbf2` `fb581245` `234ae5bc` `9ed500da` `5cb2d952` `6ddeb669` `161efa05` `1152d49a` `a25807fb` `159f7330` `3abedcde` `b9e338f7` `caaa8212` `cfbf7abf` `f34c8380` `2c27e137` `86f2e948` `59609a5f` `7264b553` `8910961e` `e243ffee` `eb885c9b` `464ab921` `e245dac1` `f18fcd19` `43777d34` `6219fbc1` `ac801919` `db6eb6da` `d3222b84` `5d9897ba` `d508603d` `20c42862` `1d74d1bc` `2333f897` `23732d55` `783ca0c1` `50de1e4a`
