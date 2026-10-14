# Trace coverage: ccd015-redemption-book-mia-stx

From `simulations/trace-coverage.mjs` on 2026-10-14, source at simulations/deploy-bytes-mv7dfb/ccd015-redemption-book-mia-stx.clar at 7e42b9c: 1 simulations, 217 transactions (14 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 0 / 564 (0.0%) |
| code lines touched / total | 0 / 225 (0.0%) |
| function body lines touched / total (top-level definitions excluded) | 0 / 196 (0.0%) |
| branch nodes (if / match / asserts!) | 30: 0 full, 0 partial, 30 never reached |

## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (30)

| line | function | kind |
|---|---|---|
| 50 | is-dao-or-extension | asserts! |
| 74 | set-min-deposit | asserts! |
| 83 | update-par | asserts! |
| 100 | place-offer | asserts! |
| 101 | place-offer | asserts! |
| 102 | place-offer | asserts! |
| 103 | place-offer | asserts! |
| 104 | place-offer | asserts! |
| 105 | place-offer | asserts! |
| 107 | place-offer | asserts! |
| 110 | place-offer | if |
| 112 | place-offer | asserts! |
| 124 | place-offer | if |
| 137 | change-offer | asserts! |
| 138 | change-offer | asserts! |
| 147 | change-offer | asserts! |
| 148 | change-offer | asserts! |
| 149 | change-offer | asserts! |
| 154 | change-offer | if |
| 166 | cancel-offer | asserts! |
| 178 | cross-book | asserts! |
| 179 | cross-book | asserts! |
| 180 | cross-book | asserts! |
| 192 | cross-book | asserts! |
| 242 | calculate-par | if |
| 302 | find-owner-step | if |
| 335 | insert-step | if |
| 356 | settle-step | if |
| 358 | settle-step | if |
| 368 | settle-step | if |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 26, 28, 29, 31, 34, 35, 37, 39, 43, 45, 46 |
| place-offer | 95, 96, 97, 98, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 115, 116, 117, 121, 123, 124, 126, 127 |
| settle-step | 351, 352, 353, 354, 356, 357, 358, 359, 360, 361, 362, 363, 364, 367, 368, 369, 370, 371, 373, 374, 375, 376, 377, 378, 382 |
| change-offer | 132, 133, 134, 135, 137, 138, 139, 140, 141, 142, 143, 144, 145, 147, 148, 149, 150, 151, 152, 153, 154, 156, 157 |
| cross-book | 177, 178, 179, 180, 181, 182, 183, 187, 189, 190, 192, 193, 194, 195, 196, 197, 198, 201, 202, 204 |
| insert-step | 328, 329, 330, 331, 332, 333, 335, 336, 337 |
| get-info | 273, 274, 275, 276, 277, 278, 279, 280, 281 |
| get-treasury-balance | 250, 251, 252, 254, 255, 256, 257, 258 |
| cancel-offer | 163, 164, 165, 166, 167, 168, 170, 171 |
| update-par | 81, 82, 83, 84, 85, 87, 88 |
| set-min-deposit | 72, 73, 74, 75, 76 |
| calculate-par | 238, 239, 240, 242, 244 |
| set-paused | 64, 65, 66, 67 |
| is-dao-or-extension | 50, 51, 52 |
| get-mia-total-supply | 264, 265, 267 |
| offer-book | 40, 41 |
| refund-rec | 316, 317 |
| find-owner-step | 302, 303 |
| ERR_UNAUTHORIZED | 7 |
| ERR_INVALID_OFFER | 8 |
| ERR_OFFER_NOT_FOUND | 9 |
| ERR_BOOK_FULL | 10 |
| ERR_HAS_OFFER | 11 |
| ERR_BELOW_MIN_DEPOSIT | 12 |
| ERR_NO_FILL | 13 |
| ERR_PAUSED | 14 |
| ERR_ABOVE_PAR | 15 |
| ERR_NO_BUDGET | 16 |
| ERR_PAR_NOT_SET | 17 |
| ERR_PAR_CALCULATION | 18 |
| MICRO_CITYCOINS | 20 |
| ONE_MILLION_MIA | 21 |
| MAX_PER_TRANSACTION | 24 |
| PAR_SCALE | 31 |
| min-deposit | 35 |
| callback | 59 |
| at-or-below-par? | 211 |
| is-target-owner | 294 |
| not-target-owner | 296 |
| push-rec | 290 |
| get-par-ustx | 215 |
| get-par-ustx-per-1m-mia | 219 |
| get-par-scaled | 223 |
| get-offer | 231 |
| sum-step | 312 |
| get-book-totals | 234 |

## Per simulation (cumulative executed expressions of ccd015-redemption-book-mia-stx)

| sim | txs | before | after |
|---|---|---|---|
| `5cf1573f` | 217 | 0 | 0 |

## Provenance and trace diagnostics

source simulations/deploy-bytes-mv7dfb/ccd015-redemption-book-mia-stx.clar at 7e42b9c, sha256 `6b5daed326f50f6a84f02526687ec8d7950ea7422521e8cff42c381d3721df57`. Only deployments with that exact code are counted.

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
| `5cf1573f` | ccd015-redemption-book-mia-stx |

| excluded deployment (name@hash) | sims |
|---|---|
| bob-autostake-safe@dda5367c1800 | 1 |
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
| juice-sbtc-autoswap@ff0a45868897 | 1 |
| juice-swap-vault-trait-v2@655b22cb792a | 1 |
| mallory-autostake-safe@373cb4482db2 | 1 |
| markets-sbtc-stx-jing-v6-3@7b2f0f44fca1 | 1 |
| signer-manager-vault-stx-rewards@4858dbc67c46 | 1 |
| sim-ccip-proxy@616692f404fc | 1 |
| swap-router-sbtc-stx-jing-v5-3@3e457866be8d | 1 |
