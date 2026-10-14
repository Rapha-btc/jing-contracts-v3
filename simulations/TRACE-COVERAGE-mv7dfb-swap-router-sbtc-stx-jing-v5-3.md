# Trace coverage: swap-router-sbtc-stx-jing-v5-3

From `simulations/trace-coverage.mjs` on 2026-10-14, source at simulations/deploy-bytes-mv7dfb/swap-router-sbtc-stx-jing-v5-3.clar at 7e42b9c: 1 simulations, 217 transactions (14 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 769 / 1318 (58.3%) |
| code lines touched / total | 452 / 812 (55.7%) |
| function body lines touched / total (top-level definitions excluded) | 452 / 774 (58.4%) |
| branch nodes (if / match / asserts!) | 123: 57 full, 59 partial, 7 never reached |

## Branches with one arm never taken (59)

| line | function | kind | state |
|---|---|---|---|
| 46 | gain | if | one arm (then only) |
| 58 | jing-swap | match | one arm (then only) |
| 63 | jing-swap | if | one arm (then only) |
| 69 | jing-swap | if | one arm (then only) |
| 109 | xyk-swap | if | one arm (then only) |
| 110 | xyk-swap | if | one arm (else only) |
| 137 | dlmm-sell | if | one arm (else only) |
| 141 | dlmm-sell | if | one arm (else only) |
| 154 | dlmm-sell | if | one arm (else only) |
| 197 | amm-sell-stx | if | one arm (else only) |
| 226 | leg-sbtc | if | one arm (else only) |
| 255 | with-fallback | if | one arm (else only) |
| 274 | fallback-residual | if | one arm (then only) |
| 293 | scale-min | if | one arm (then only) |
| 300 | valid-fallback | match | one arm (else only) |
| 342 | swap-sbtc-for-stx | if | one arm (then only) |
| 383 | swap-sbtc-for-stx | if | one arm (then only) |
| 402 | swap-sbtc-for-stx | if | one arm (then only) |
| 446 | swap-stx-for-sbtc | if | one arm (else only) |
| 487 | swap-stx-for-sbtc | if | one arm (then only) |
| 506 | swap-stx-for-sbtc | if | one arm (then only) |
| 529 | xyk-quote | if | one arm (else only) |
| 539 | xyk-quote | if | one arm (else only) |
| 565 | velar-reserves | if | one arm (then only) |
| 590 | cp-capacity | if | one arm (else only) |
| 594 | cp-capacity | if | one arm (then only) |
| 608 | limit-min | if | one arm (then only) |
| 626 | book-limit | if | one arm (then only) |
| 656 | jing-size | if | one arm (then only) |
| 686 | cp-split | if | one arm (else only) |
| 751 | dlmm-pick | if | one arm (then only) |
| 755 | dlmm-pick | if | one arm (then only) |
| 759 | dlmm-pick | if | one arm (else only) |
| 764 | dlmm-pick | if | one arm (then only) |
| 798 | dlmm-out | if | one arm (else only) |
| 807 | dlmm-out | if | one arm (then only) |
| 810 | dlmm-out | if | one arm (else only) |
| 812 | dlmm-out | if | one arm (then only) |
| 817 | dlmm-out | if | one arm (else only) |
| 824 | dlmm-out | if | one arm (else only) |
| 880 | dlmm-out-step | if | one arm (else only) |
| 884 | dlmm-out-step | if | one arm (else only) |
| 888 | dlmm-out-step | if | one arm (then only) |
| 897 | dlmm-out-step | if | one arm (else only) |
| 906 | dlmm-out-step | if | one arm (else only) |
| 908 | dlmm-out-step | if | one arm (else only) |
| 915 | dlmm-out-step | if | one arm (else only) |
| 921 | dlmm-out-step | if | one arm (else only) |
| 954 | dlmm-enabled | match | one arm (then only) |
| 992 | dlmm-bin-balances | if | one arm (else only) |
| 1032 | dlmm-bin-step | if | one arm (then only) |
| 1045 | dlmm-bin-step | if | one arm (else only) |
| 1106 | amm-leg | if | one arm (else only) |
| 1125 | dlmm-stage | if | one arm (then only) |
| 1133 | dlmm-stage | if | one arm (then only) |
| 1173 | cp-stage | if | one arm (else only) |
| 1177 | cp-stage | if | one arm (else only) |
| 1182 | cp-stage | if | one arm (then only) |
| 1292 | smart-swap-stx-for-sbtc | if | one arm (else only) |

## Branch nodes never reached (7)

| line | function | kind |
|---|---|---|
| 118 | xyk-swap | if |
| 171 | amm-sell-sbtc | if |
| 173 | amm-sell-sbtc | if |
| 687 | cp-split | if |
| 766 | dlmm-pick | if |
| 818 | dlmm-out | if |
| 825 | dlmm-out | if |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14, 15, 17, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 33, 34, 35, 36, 518, 519, 520, 601, 619, 704, 705, 706, 776 |
| amm-sell-sbtc | 171, 172, 173, 174, 176, 178, 180, 181 |
| dlmm-out-step | 881, 885, 898, 907, 909, 916, 922 |
| dlmm-out | 799, 800, 818, 819, 825 |
| xyk-quote | 530, 531, 532, 540, 541 |
| xyk-swap | 111, 118, 119, 122 |
| valid-fallback | 301, 302, 303, 304 |
| swap-stx-for-sbtc | 444, 447, 489, 508 |
| cp-split | 687, 688, 691, 693 |
| dlmm-sell | 138, 142, 155 |
| swap-sbtc-for-stx | 340, 385, 404 |
| velar-reserves | 570, 571, 572 |
| jing-swap | 65, 71 |
| dlmm-pick | 760, 766 |
| amm-sell-stx | 198, 200 |
| smart-swap-stx-for-sbtc | 1288, 1293 |
| ERR_ZERO_AMOUNT | 30 |
| ERR_MIN_OUT | 31 |
| ERR_BAD_VENUE | 32 |
| ERR_SPLIT_MISMATCH | 33 |
| ERR_VAA_REQUIRED | 34 |
| ERR_ZERO_LIMIT | 35 |
| ERR_ZERO_MID | 36 |
| xyk-x-is-sbtc | 99 |
| dlmm-bin-balances | 993 |
| DLMM_WALK_BINS | 706 |
| leg-sbtc | 227 |
| with-fallback | 256 |
| fallback-residual | 276 |
| scale-min | 295 |
| cp-capacity | 591 |
| book-limit | 628 |
| jing-size | 658 |
| dlmm-bin-step | 1046 |
| amm-leg | 1107 |
| dlmm-stage | 1137 |
| cp-stage | 1190 |
| smart-swap-sbtc-for-stx | 1223 |
| get-jing-min-deposits | 1341 |

## Per simulation (cumulative executed expressions of swap-router-sbtc-stx-jing-v5-3)

| sim | txs | before | after |
|---|---|---|---|
| `5cf1573f` | 217 | 0 | 1631 |

## Provenance and trace diagnostics

source simulations/deploy-bytes-mv7dfb/swap-router-sbtc-stx-jing-v5-3.clar at 7e42b9c, sha256 `3e457866be8d4f6216e5e17fd87c9aa6fb2285a23909e7957a354c4af8e3b9b4`. Only deployments with that exact code are counted.

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
| `5cf1573f` | swap-router-sbtc-stx-jing-v5-3 |

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
| juice-sbtc-autoswap@ff0a45868897 | 1 |
| juice-swap-vault-trait-v2@655b22cb792a | 1 |
| mallory-autostake-safe@373cb4482db2 | 1 |
| markets-sbtc-stx-jing-v6-3@7b2f0f44fca1 | 1 |
| signer-manager-vault-stx-rewards@4858dbc67c46 | 1 |
| sim-ccip-proxy@616692f404fc | 1 |
