# Trace coverage: jing-ladder-v1

From `simulations/trace-coverage.mjs` on 2026-10-14, source at simulations/deploy-bytes-mv7dfb/jing-ladder-v1.clar at 7e42b9c: 1 simulations, 217 transactions (14 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 78 / 473 (16.5%) |
| code lines touched / total | 48 / 316 (15.2%) |
| function body lines touched / total (top-level definitions excluded) | 48 / 288 (16.7%) |
| branch nodes (if / match / asserts!) | 24: 6 full, 3 partial, 15 never reached |

## Branches with one arm never taken (3)

| line | function | kind | state |
|---|---|---|---|
| 104 | is-band-current | match | one arm (then only) |
| 149 | claim-seat | match | one arm (else only) |
| 211 | register | if | one arm (then only) |

## Branch nodes never reached (15)

| line | function | kind |
|---|---|---|
| 135 | is-current-rung | match |
| 215 | register | asserts! |
| 253 | register-unseated | asserts! |
| 254 | register-unseated | asserts! |
| 260 | register-unseated | asserts! |
| 285 | seat-band | asserts! |
| 286 | seat-band | asserts! |
| 287 | seat-band | asserts! |
| 304 | set-max-band-per-side | asserts! |
| 306 | set-max-band-per-side | asserts! |
| 333 | retire-band | asserts! |
| 334 | retire-band | asserts! |
| 490 | propose-owner | asserts! |
| 505 | accept-owner | asserts! |
| 506 | accept-owner | asserts! |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 17, 19, 20, 22, 23, 25, 26, 27, 35, 36, 37, 39, 44, 52 |
| register-unseated | 248, 249, 250, 251, 253, 254, 255, 256, 260, 261, 265, 275 |
| seat-band | 280, 281, 282, 283, 285, 286, 287, 288, 289, 290, 297 |
| set-max-band-per-side | 303, 304, 306, 307, 308, 309, 310, 314, 318 |
| retire-band | 326, 327, 331, 333, 334, 335, 337, 338, 344 |
| accept-owner | 504, 505, 506, 507, 510, 511, 512, 516 |
| propose-owner | 489, 490, 491, 492, 493, 497, 499 |
| log-deposit | 360, 361, 364, 365, 366, 374 |
| log-push | 384, 385, 388, 389, 390, 396 |
| log-withdraw | 407, 408, 411, 412, 413, 420 |
| log-payout | 430, 431, 434, 435, 436, 442 |
| log-epoch-closed | 450, 451, 454, 455, 456, 460 |
| log-rescale | 471, 472, 475, 476, 477, 484 |
| get-pending-owner | 65, 66, 67 |
| rungs | 45, 46 |
| registered | 54, 55 |
| is-current-rung | 135, 136 |
| register | 196, 215 |
| ERR_NOT_AUTHORIZED | 1 |
| ERR_INVALID_CONTRACT_HASH | 2 |
| ERR_NOT_VERIFIED | 3 |
| ERR_HASH_MISMATCH | 4 |
| ERR_ALREADY_REGISTERED | 5 |
| ERR_PRICE_TAKEN | 6 |
| ERR_BAD_SIDE | 7 |
| ERR_NO_PENDING_OWNER | 8 |
| ERR_TIMELOCK_NOT_ELAPSED | 9 |
| ERR_NOT_REGISTERED | 10 |
| ERR_BAND_FULL | 11 |
| ERR_ALREADY_SEATED | 12 |
| band-count | 28 |
| pending-owner | 36 |
| canonical | 40 |
| get-canonical | 72 |
| get-rung | 79 |
| get-registered | 86 |
| is-registered | 90 |
| is-current | 132 |
| rung-of | 349 |

## Per simulation (cumulative executed expressions of jing-ladder-v1)

| sim | txs | before | after |
|---|---|---|---|
| `5cf1573f` | 217 | 0 | 152 |

## Provenance and trace diagnostics

source simulations/deploy-bytes-mv7dfb/jing-ladder-v1.clar at 7e42b9c, sha256 `6a5e204d47d865047fcb7d80d97e57d13b23fc1bf843958323c8c7d0d10d0dd7`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 217 |
| no trace returned by stxer | 14 |
| trace decode errors | 0 |
| calls to a counted market instance | 3 |
| ... of which without a trace | 0 |
| ... of which decode errors | 0 |

| sim | counted instances |
|---|---|
| `5cf1573f` | jing-ladder-v1 |

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
