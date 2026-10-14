# Trace coverage: fastpool-swap-vault

From `simulations/trace-coverage.mjs` on 2026-10-14, source at simulations/deploy-bytes-mv7dfb/fastpool-swap-vault.clar at 7e42b9c: 1 simulations, 217 transactions (14 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 307 / 933 (32.9%) |
| code lines touched / total | 174 / 559 (31.1%) |
| function body lines touched / total (top-level definitions excluded) | 174 / 503 (34.6%) |
| branch nodes (if / match / asserts!) | 68: 33 full, 4 partial, 31 never reached |

## Branches with one arm never taken (4)

| line | function | kind | state |
|---|---|---|---|
| 271 | finish | if | one arm (then only) |
| 665 | window-open | match | one arm (then only) |
| 672 | window-elapsed | match | one arm (then only) |
| 730 | current-mid | if | one arm (then only) |

## Branch nodes never reached (31)

| line | function | kind |
|---|---|---|
| 105 | set-no-pyth-slippage-bps | asserts! |
| 106 | set-no-pyth-slippage-bps | asserts! |
| 133 | set-leeway-bps | asserts! |
| 134 | set-leeway-bps | asserts! |
| 146 | set-slippage-bps | asserts! |
| 147 | set-slippage-bps | asserts! |
| 172 | set-dia-band-bps | asserts! |
| 173 | set-dia-band-bps | asserts! |
| 185 | set-router-cooldown | asserts! |
| 186 | set-router-cooldown | asserts! |
| 253 | close-batch | asserts! |
| 254 | close-batch | asserts! |
| 300 | emergency-recover | asserts! |
| 311 | emergency-recover | asserts! |
| 320 | emergency-recover | if |
| 336 | emergency-recover | if |
| 345 | emergency-recover | if |
| 354 | emergency-recover | asserts! |
| 407 | jing-take | asserts! |
| 408 | jing-take | asserts! |
| 557 | router-swap-split-dia | asserts! |
| 558 | router-swap-split-dia | asserts! |
| 559 | router-swap-split-dia | asserts! |
| 560 | router-swap-split-dia | asserts! |
| 605 | get-no-pyth-price | match |
| 607 | get-no-pyth-price | asserts! |
| 622 | get-no-pyth-price | asserts! |
| 694 | sweep-amount | if |
| 807 | get-clock | match |
| 861 | jing-refloor | if |
| 866 | jing-refloor | asserts! |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 27, 28, 29, 30, 32, 33, 34, 39, 44, 46, 47, 48, 49, 50, 52, 53, 55, 56, 59, 60, 61, 62, 63, 70, 72, 74, 76, 78, 90, 91, 93, 94, 95, 96, 97, 98, 99, 100, 101 |
| emergency-recover | 299, 300, 301, 302, 303, 304, 305, 306, 311, 316, 317, 318, 320, 321, 322, 323, 325, 326, 332, 333, 334, 336, 337, 338, 339, 345, 346, 347, 348, 354, 355, 356, 357, 359, 364 |
| router-swap-split-dia | 556, 557, 558, 559, 560, 561, 562, 563, 564, 565, 566, 567, 568, 569, 572, 573, 574, 579, 582, 583, 585, 590, 592, 593, 594, 595 |
| jing-take | 406, 407, 408, 409, 410, 411, 412, 414, 418, 419, 421, 424 |
| close-batch | 247, 248, 249, 250, 251, 253, 254, 255, 256, 257, 259 |
| jing-refloor | 859, 860, 861, 862, 863, 866, 867, 868, 870, 872, 874 |
| get-no-pyth-price | 605, 606, 607, 608, 615, 616, 620, 622, 623, 627 |
| get-config | 879, 882, 883, 884, 885, 886, 887, 888, 889, 890 |
| get-upgrade-status | 897, 901, 903, 904, 905, 906, 907, 911 |
| set-no-pyth-slippage-bps | 104, 105, 106, 107, 108, 110, 112 |
| set-leeway-bps | 132, 133, 134, 135, 136, 138, 140 |
| set-slippage-bps | 145, 146, 147, 148, 149, 151, 153 |
| set-dia-band-bps | 171, 172, 173, 174, 175, 177, 179 |
| set-router-cooldown | 184, 185, 186, 187, 188, 190, 192 |
| get-clock | 803, 804, 806, 807, 808, 811, 812 |
| market-total | 231, 232, 233, 234, 235, 236 |
| sweep-amount | 693, 694 |
| ERR_RECOVERY_TOO_SOON | 9 |
| ERR_BUSY | 10 |
| ERR_UNAUTHORIZED | 11 |
| ERR_NO_FUNDS | 12 |
| ERR_INVALID_PRICE | 13 |
| ERR_WINDOW_CLOSED | 14 |
| ERR_WINDOW_OPEN | 15 |
| ERR_NO_CLOCK | 16 |
| ERR_ORACLE_DIA | 17 |
| ERR_ORACLE_STALE | 18 |
| ERR_ORACLE_DIVERGED | 19 |
| ERR_NO_BLOCK_TIME | 20 |
| ERR_CHUNK_TOO_BIG | 21 |
| ERR_SOME_FUNDS | 22 |
| ERR_COOLDOWN | 23 |
| ERR_BELOW_FLOOR | 24 |
| ERR_OUT_OF_RANGE | 28 |
| ERR_SPLIT_MISMATCH | 29 |
| ERR_UPDATE_REQUIRED | 30 |
| batch-start | 100 |
| current-mid | 740 |
| router-swap | 452 |

## Per simulation (cumulative executed expressions of fastpool-swap-vault)

| sim | txs | before | after |
|---|---|---|---|
| `5cf1573f` | 217 | 0 | 538 |

## Provenance and trace diagnostics

source simulations/deploy-bytes-mv7dfb/fastpool-swap-vault.clar at 7e42b9c, sha256 `aaebf34b4f14044459db4857f9d7849355a4113f51f24afc3e00f3b98101fdac`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 217 |
| no trace returned by stxer | 14 |
| trace decode errors | 0 |
| calls to a counted market instance | 4 |
| ... of which without a trace | 0 |
| ... of which decode errors | 0 |

| sim | counted instances |
|---|---|
| `5cf1573f` | fastpool-swap-vault |

| excluded deployment (name@hash) | sims |
|---|---|
| bob-autostake-safe@dda5367c1800 | 1 |
| ccd015-redemption-book-mia-stx@6b5daed326f5 | 1 |
| ccd016-swap-vault-mia-v2@a7062d390719 | 1 |
| dlmm-core-v-1-2@009ea45feca3 | 1 |
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
