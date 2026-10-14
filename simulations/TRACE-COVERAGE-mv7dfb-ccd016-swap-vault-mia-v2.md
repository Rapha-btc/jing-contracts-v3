# Trace coverage: ccd016-swap-vault-mia-v2

From `simulations/trace-coverage.mjs` on 2026-10-14, source at simulations/deploy-bytes-mv7dfb/ccd016-swap-vault-mia-v2.clar at 7e42b9c: 1 simulations, 217 transactions (14 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 266 / 895 (29.7%) |
| code lines touched / total | 150 / 521 (28.8%) |
| function body lines touched / total (top-level definitions excluded) | 150 / 466 (32.2%) |
| branch nodes (if / match / asserts!) | 48: 20 full, 5 partial, 23 never reached |

## Branches with one arm never taken (5)

| line | function | kind | state |
|---|---|---|---|
| 256 | fuel-fair-book | if | one arm (then only) |
| 673 | window-open | match | one arm (then only) |
| 680 | window-elapsed | match | one arm (then only) |
| 728 | current-mid | if | one arm (then only) |
| 803 | reclaim-core | if | one arm (then only) |

## Branch nodes never reached (23)

| line | function | kind |
|---|---|---|
| 97 | set-no-pyth-slippage-bps | asserts! |
| 131 | set-leeway-bps | asserts! |
| 139 | set-slippage-bps | asserts! |
| 147 | set-max-chunk-sats | asserts! |
| 155 | set-dia-band-bps | asserts! |
| 163 | set-router-cooldown | asserts! |
| 171 | dao-recall-sbtc | asserts! |
| 241 | close-batch | asserts! |
| 242 | close-batch | asserts! |
| 308 | jing-refloor | asserts! |
| 331 | jing-take | asserts! |
| 426 | router-swap-split | asserts! |
| 427 | router-swap-split | asserts! |
| 428 | router-swap-split | asserts! |
| 473 | router-swap-split-dia | asserts! |
| 474 | router-swap-split-dia | asserts! |
| 475 | router-swap-split-dia | asserts! |
| 541 | get-clock | match |
| 613 | get-no-pyth-price | match |
| 615 | get-no-pyth-price | asserts! |
| 630 | get-no-pyth-price | asserts! |
| 689 | sweep-amount | if |
| 758 | phase-limit | if |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 33, 34, 36, 38, 40, 41, 42, 43, 45, 46, 47, 48, 49, 51, 53, 54, 55, 58, 59, 61, 62, 64, 65, 66, 67, 68, 69, 70, 71 |
| router-swap-split | 414, 415, 416, 417, 418, 419, 420, 421, 423, 425, 426, 427, 428, 429, 430, 431, 432, 433, 435, 436, 442, 445, 446, 448, 457, 458 |
| router-swap-split-dia | 471, 472, 473, 474, 475, 476, 477, 478, 479, 480, 481, 482, 483, 484, 487, 488, 489, 494, 497, 498, 500, 505, 507, 508, 509, 510 |
| jing-take | 326, 327, 328, 330, 331, 332, 333, 334, 336, 340, 341, 343, 346 |
| jing-refloor | 300, 301, 302, 303, 304, 307, 308, 309, 310, 312, 314 |
| get-status | 553, 557, 558, 559, 560, 564, 568, 569, 570, 575, 576 |
| close-batch | 235, 236, 237, 238, 239, 241, 242, 243, 244, 246 |
| get-no-pyth-price | 613, 614, 615, 616, 623, 624, 628, 630, 631, 635 |
| get-config | 521, 522, 523, 524, 525, 526, 527, 528, 529, 530 |
| dao-recall-sbtc | 169, 170, 171, 172, 173, 177, 178, 180 |
| set-no-pyth-slippage-bps | 95, 96, 97, 98, 99, 101, 103 |
| get-clock | 538, 539, 541, 542, 545, 546 |
| set-leeway-bps | 129, 130, 131, 132 |
| set-slippage-bps | 137, 138, 139, 140 |
| set-max-chunk-sats | 145, 146, 147, 148 |
| set-dia-band-bps | 153, 154, 155, 156 |
| set-router-cooldown | 161, 162, 163, 164 |
| reclaim-core | 806, 818, 820 |
| dao-reclaim | 186, 187, 188 |
| phase-limit | 758, 759, 760 |
| sweep-amount | 688, 689 |
| ERR_UNAUTHORIZED | 6 |
| ERR_NO_FUNDS | 7 |
| ERR_NO_BUDGET | 8 |
| ERR_INVALID_PRICE | 9 |
| ERR_WINDOW_CLOSED | 10 |
| ERR_WINDOW_OPEN | 11 |
| ERR_NO_CLOCK | 12 |
| ERR_OUT_OF_RANGE | 13 |
| ERR_NOTHING_RESTING | 14 |
| ERR_ORACLE_DIA | 15 |
| ERR_ORACLE_STALE | 16 |
| ERR_ORACLE_DIVERGED | 17 |
| ERR_NO_BLOCK_TIME | 18 |
| ERR_CHUNK_TOO_BIG | 19 |
| ERR_SPLIT_MISMATCH | 20 |
| ERR_SOME_FUNDS | 21 |
| ERR_COOLDOWN | 22 |
| ERR_BELOW_FLOOR | 23 |
| ERR_UPDATE_REQUIRED | 25 |
| batch-start | 71 |
| callback | 90 |
| current-mid | 738 |
| router-swap | 372 |

## Per simulation (cumulative executed expressions of ccd016-swap-vault-mia-v2)

| sim | txs | before | after |
|---|---|---|---|
| `5cf1573f` | 217 | 0 | 442 |

## Provenance and trace diagnostics

source simulations/deploy-bytes-mv7dfb/ccd016-swap-vault-mia-v2.clar at 7e42b9c, sha256 `a7062d390719177f08581a729aa26481d4e12cc811b58a27c5442d4528fa48c6`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 217 |
| no trace returned by stxer | 14 |
| trace decode errors | 0 |
| calls to a counted market instance | 14 |
| ... of which without a trace | 0 |
| ... of which decode errors | 0 |

| sim | counted instances |
|---|---|
| `5cf1573f` | ccd016-swap-vault-mia-v2 |

| excluded deployment (name@hash) | sims |
|---|---|
| bob-autostake-safe@dda5367c1800 | 1 |
| ccd015-redemption-book-mia-stx@6b5daed326f5 | 1 |
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
| juice-sbtc-autoswap@ff0a45868897 | 1 |
| juice-swap-vault-trait-v2@655b22cb792a | 1 |
| mallory-autostake-safe@373cb4482db2 | 1 |
| markets-sbtc-stx-jing-v6-3@7b2f0f44fca1 | 1 |
| signer-manager-vault-stx-rewards@4858dbc67c46 | 1 |
| sim-ccip-proxy@616692f404fc | 1 |
| swap-router-sbtc-stx-jing-v5-3@3e457866be8d | 1 |
