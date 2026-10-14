# Trace coverage: jing-ladder-dispatch

From `simulations/trace-coverage.mjs` on 2026-10-14, source at simulations/deploy-bytes-mv7dfb/jing-ladder-dispatch.clar at 7e42b9c: 1 simulations, 217 transactions (14 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 0 / 380 (0.0%) |
| code lines touched / total | 0 / 222 (0.0%) |
| function body lines touched / total (top-level definitions excluded) | 0 / 213 (0.0%) |
| branch nodes (if / match / asserts!) | 20: 0 full, 0 partial, 20 never reached |

## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (20)

| line | function | kind |
|---|---|---|
| 31 | validate-one | asserts! |
| 32 | validate-one | asserts! |
| 33 | validate-one | asserts! |
| 34 | validate-one | asserts! |
| 35 | validate-one | if |
| 103 | dispatch | asserts! |
| 104 | dispatch | asserts! |
| 105 | dispatch | asserts! |
| 113 | dispatch | asserts! |
| 178 | validate-exit | asserts! |
| 179 | validate-exit | asserts! |
| 180 | validate-exit | asserts! |
| 182 | validate-exit | if |
| 247 | withdraw-many | asserts! |
| 248 | withdraw-many | asserts! |
| 314 | validate-claim | asserts! |
| 315 | validate-claim | asserts! |
| 317 | validate-claim | if |
| 371 | claim-many | asserts! |
| 372 | claim-many | asserts! |

## Uncovered code lines by function

| function | lines |
|---|---|
| claim-many | 370, 371, 372, 373, 375, 378, 379, 383, 386, 390, 391, 392, 393, 395, 396, 397, 398, 399, 400 |
| dispatch | 102, 103, 104, 105, 106, 107, 110, 113, 115, 116, 120, 123, 128, 130, 132, 133, 134, 135 |
| withdraw-many | 246, 247, 248, 249, 251, 254, 255, 260, 263, 267, 268, 270, 271, 272, 273, 274, 275 |
| validate-one | 25, 26, 27, 28, 29, 31, 32, 33, 34, 35, 36, 37, 41, 42, 43, 44 |
| validate-exit | 172, 173, 174, 175, 176, 178, 179, 180, 181, 182, 188, 189, 190 |
| exit-one | 214, 215, 216, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227 |
| deposit-one | 72, 73, 74, 75, 77, 78, 79, 80, 81, 82, 83, 84 |
| validate-claim | 309, 310, 311, 312, 314, 315, 316, 317, 323, 324, 325 |
| claim-one | 345, 346, 347, 349, 350, 351, 352, 353, 354, 355, 356 |
| (top) | 1, 3, 4, 5, 6, 7, 8, 9, 10 |
| ERR_EMPTY | 4 |
| ERR_TOTAL | 5 |
| ERR_ZERO_AMOUNT | 6 |
| ERR_NOT_SEATED | 7 |
| ERR_DUPLICATE | 8 |
| ERR_DIRECT_CALL | 9 |
| ERR_NOT_REGISTERED_SIDE | 10 |
| deposit-buy | 148 |
| deposit-sell | 158 |
| withdraw-buy | 288 |
| withdraw-sell | 298 |
| claim-buy | 407 |
| claim-sell | 411 |

## Per simulation (cumulative executed expressions of jing-ladder-dispatch)

| sim | txs | before | after |
|---|---|---|---|
| `5cf1573f` | 217 | 0 | 0 |

## Provenance and trace diagnostics

source simulations/deploy-bytes-mv7dfb/jing-ladder-dispatch.clar at 7e42b9c, sha256 `25858ef64f1da1458272f53e1654e4e1704bfcb5bdea8fea859202771fe3cabd`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 217 |
| no trace returned by stxer | 14 |
| trace decode errors | 0 |
| calls to a counted market instance | 1 |
| ... of which without a trace | 0 |
| ... of which decode errors | 0 |

| sim | counted instances |
|---|---|
| `5cf1573f` | jing-ladder-dispatch |

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
