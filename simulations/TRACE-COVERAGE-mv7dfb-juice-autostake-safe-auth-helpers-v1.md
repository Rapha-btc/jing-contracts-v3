# Trace coverage: juice-autostake-safe-auth-helpers-v1

From `simulations/trace-coverage.mjs` on 2026-10-14, source at simulations/deploy-bytes-mv7dfb/juice-autostake-safe-auth-helpers-v1.clar at 7e42b9c: 1 simulations, 217 transactions (14 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 0 / 24 (0.0%) |
| code lines touched / total | 0 / 15 (0.0%) |
| function body lines touched / total (top-level definitions excluded) | 0 / 14 (0.0%) |
| branch nodes (if / match / asserts!) | 0: 0 full, 0 partial, 0 never reached |

## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (0)

| line | function | kind |
|---|---|---|

## Uncovered code lines by function

| function | lines |
|---|---|
| build-set-keeper-hash | 16, 17, 18, 20, 21 |
| (top) | 1 |
| get-domain-hash | 4 |

## Per simulation (cumulative executed expressions of juice-autostake-safe-auth-helpers-v1)

| sim | txs | before | after |
|---|---|---|---|
| `5cf1573f` | 217 | 0 | 0 |

## Provenance and trace diagnostics

source simulations/deploy-bytes-mv7dfb/juice-autostake-safe-auth-helpers-v1.clar at 7e42b9c, sha256 `aabf3ba32c5602b83693f1581adb7a22a2e180df2306673b23f94c61fa61bd70`. Only deployments with that exact code are counted.

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
| `5cf1573f` | juice-autostake-safe-auth-helpers-v1 |

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
| juice-autostake-safe@dda5367c1800 | 1 |
| juice-pool-sbtc-signer@57d8c3d384f1 | 1 |
| juice-sbtc-autoswap@ff0a45868897 | 1 |
| juice-swap-vault-trait-v2@655b22cb792a | 1 |
| mallory-autostake-safe@373cb4482db2 | 1 |
| markets-sbtc-stx-jing-v6-3@7b2f0f44fca1 | 1 |
| signer-manager-vault-stx-rewards@4858dbc67c46 | 1 |
| sim-ccip-proxy@616692f404fc | 1 |
| swap-router-sbtc-stx-jing-v5-3@3e457866be8d | 1 |
