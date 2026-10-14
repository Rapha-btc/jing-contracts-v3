# Trace coverage: juice-sbtc-autoswap

From `simulations/trace-coverage.mjs` on 2026-10-14, source at simulations/deploy-bytes-mv7dfb/juice-sbtc-autoswap.clar at 7e42b9c: 1 simulations, 217 transactions (14 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 385 / 933 (41.3%) |
| code lines touched / total | 222 / 560 (39.6%) |
| function body lines touched / total (top-level definitions excluded) | 222 / 504 (44.0%) |
| branch nodes (if / match / asserts!) | 68: 40 full, 6 partial, 22 never reached |

## Branches with one arm never taken (6)

| line | function | kind | state |
|---|---|---|---|
| 282 | emergency-recover | if | one arm (then only) |
| 298 | emergency-recover | if | one arm (then only) |
| 307 | emergency-recover | if | one arm (then only) |
| 620 | window-open | match | one arm (then only) |
| 627 | window-elapsed | match | one arm (then only) |
| 666 | current-mid | if | one arm (then only) |

## Branch nodes never reached (22)

| line | function | kind |
|---|---|---|
| 77 | set-no-pyth-slippage-bps | asserts! |
| 78 | set-no-pyth-slippage-bps | asserts! |
| 118 | set-leeway-bps | asserts! |
| 119 | set-leeway-bps | asserts! |
| 131 | set-slippage-bps | asserts! |
| 132 | set-slippage-bps | asserts! |
| 157 | set-dia-band-bps | asserts! |
| 158 | set-dia-band-bps | asserts! |
| 170 | set-router-cooldown | asserts! |
| 171 | set-router-cooldown | asserts! |
| 220 | close-batch | asserts! |
| 221 | close-batch | asserts! |
| 512 | router-swap-split-dia | asserts! |
| 513 | router-swap-split-dia | asserts! |
| 514 | router-swap-split-dia | asserts! |
| 515 | router-swap-split-dia | asserts! |
| 560 | get-no-pyth-price | match |
| 562 | get-no-pyth-price | asserts! |
| 577 | get-no-pyth-price | asserts! |
| 738 | get-clock | match |
| 791 | jing-refloor | if |
| 796 | jing-refloor | asserts! |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 25, 26, 27, 29, 31, 33, 34, 35, 36, 37, 39, 40, 42, 43, 45, 46, 47, 48, 49, 51, 53, 55, 57, 59, 61, 63, 65, 66, 67, 68, 69, 70, 71, 72, 73 |
| router-swap-split-dia | 511, 512, 513, 514, 515, 516, 517, 518, 519, 520, 521, 522, 523, 524, 527, 528, 529, 534, 537, 538, 540, 545, 547, 548, 549, 550 |
| close-batch | 214, 215, 216, 217, 218, 220, 221, 222, 223, 224, 226 |
| jing-refloor | 789, 790, 791, 792, 793, 796, 797, 798, 800, 802, 804 |
| get-no-pyth-price | 560, 561, 562, 563, 570, 571, 575, 577, 578, 582 |
| get-config | 809, 812, 813, 814, 815, 816, 817, 818, 819, 820 |
| get-upgrade-status | 827, 831, 833, 834, 835, 836, 837, 841 |
| set-no-pyth-slippage-bps | 76, 77, 78, 79, 80, 82, 84 |
| set-leeway-bps | 117, 118, 119, 120, 121, 123, 125 |
| set-slippage-bps | 130, 131, 132, 133, 134, 136, 138 |
| set-dia-band-bps | 156, 157, 158, 159, 160, 162, 164 |
| set-router-cooldown | 169, 170, 171, 172, 173, 175, 177 |
| get-clock | 734, 735, 737, 738, 739, 742, 743 |
| market-total | 201, 202, 203, 204, 205, 206 |
| ERR_RECOVERY_TOO_SOON | 3 |
| ERR_BUSY | 4 |
| ERR_UNAUTHORIZED | 5 |
| ERR_NO_FUNDS | 6 |
| ERR_INVALID_PRICE | 7 |
| ERR_WINDOW_CLOSED | 8 |
| ERR_WINDOW_OPEN | 9 |
| ERR_NO_CLOCK | 10 |
| ERR_ORACLE_DIA | 11 |
| ERR_ORACLE_STALE | 12 |
| ERR_ORACLE_DIVERGED | 13 |
| ERR_NO_BLOCK_TIME | 14 |
| ERR_CHUNK_TOO_BIG | 15 |
| ERR_SOME_FUNDS | 16 |
| ERR_COOLDOWN | 17 |
| ERR_BELOW_FLOOR | 18 |
| ERR_OUT_OF_RANGE | 21 |
| ERR_SPLIT_MISMATCH | 22 |
| ERR_UPDATE_REQUIRED | 23 |
| batch-start | 72 |
| emergency-recover | 285 |
| current-mid | 676 |
| jing-take | 375 |
| router-swap | 408 |

## Per simulation (cumulative executed expressions of juice-sbtc-autoswap)

| sim | txs | before | after |
|---|---|---|---|
| `5cf1573f` | 217 | 0 | 691 |

## Provenance and trace diagnostics

source simulations/deploy-bytes-mv7dfb/juice-sbtc-autoswap.clar at 7e42b9c, sha256 `ff0a45868897397187106fe284ed72ab64f2d3718adb238addf8d7c1a5909033`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 217 |
| no trace returned by stxer | 14 |
| trace decode errors | 0 |
| calls to a counted market instance | 13 |
| ... of which without a trace | 0 |
| ... of which decode errors | 0 |

| sim | counted instances |
|---|---|
| `5cf1573f` | juice-sbtc-autoswap |

| excluded deployment (name@hash) | sims |
|---|---|
| bob-autostake-safe@dda5367c1800 | 1 |
| ccd015-redemption-book-mia-stx@6b5daed326f5 | 1 |
| ccd016-swap-vault-mia-v2@a7062d390719 | 1 |
| dlmm-core-v-1-2@009ea45feca3 | 1 |
| fastpool-swap-vault@aaebf34b4f14 | 1 |
| jing-buy-stx-spread-0@0a8639678768 | 1 |
| jing-buy-stx-spread-10@0a8639678768 | 1 |
| jing-buy-stx-spread-20@0a8639678768 | 1 |
| jing-buy-stx-spread-30@0a8639678768 | 1 |
| jing-buy-stx-spread-40@0a8639678768 | 1 |
| jing-buy-stx-spread-50@0a8639678768 | 1 |
| jing-buy-stx-spread-60@0a8639678768 | 1 |
| jing-buy-stx-spread-70@0a8639678768 | 1 |
| jing-buy-stx-spread-80@0a8639678768 | 1 |
| jing-buy-stx-spread-90@0a8639678768 | 1 |
| jing-core-v6@973482e429cf | 1 |
| jing-ladder-dispatch@25858ef64f1d | 1 |
| jing-ladder-v1@6a5e204d47d8 | 1 |
| jing-rung-deposit-trait@5979727e42d5 | 1 |
| jing-sell-stx-spread-0@7fb80650787a | 1 |
| jing-sell-stx-spread-10@7fb80650787a | 1 |
| jing-sell-stx-spread-20@7fb80650787a | 1 |
| jing-sell-stx-spread-30@7fb80650787a | 1 |
| jing-sell-stx-spread-40@7fb80650787a | 1 |
| jing-sell-stx-spread-50@7fb80650787a | 1 |
| jing-sell-stx-spread-60@7fb80650787a | 1 |
| jing-sell-stx-spread-70@7fb80650787a | 1 |
| jing-sell-stx-spread-80@7fb80650787a | 1 |
| jing-sell-stx-spread-90@7fb80650787a | 1 |
| juice-autostake-safe-auth-helpers-v1@aabf3ba32c56 | 1 |
| juice-autostake-safe@dda5367c1800 | 1 |
| juice-pool-sbtc-signer@57d8c3d384f1 | 1 |
| juice-swap-vault-trait-v2@655b22cb792a | 1 |
| mallory-autostake-safe@373cb4482db2 | 1 |
| markets-sbtc-stx-jing-v6-3@7b2f0f44fca1 | 1 |
| signer-manager-vault-stx-rewards@4858dbc67c46 | 1 |
| sim-ccip-proxy@616692f404fc | 1 |
| swap-router-sbtc-stx-jing-v5-3@3e457866be8d | 1 |
