# Trace coverage: juice-pool-sbtc-signer

From `simulations/trace-coverage.mjs` on 2026-10-14, source at simulations/deploy-bytes-mv7dfb/juice-pool-sbtc-signer.clar at 7e42b9c: 1 simulations, 217 transactions (14 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 461 / 1243 (37.1%) |
| code lines touched / total | 270 / 822 (32.8%) |
| function body lines touched / total (top-level definitions excluded) | 270 / 759 (35.6%) |
| branch nodes (if / match / asserts!) | 53: 36 full, 4 partial, 13 never reached |

## Branches with one arm never taken (4)

| line | function | kind | state |
|---|---|---|---|
| 755 | pay-one | if | one arm (else only) |
| 772 | pay-one | if | one arm (then only) |
| 1121 | pay-recovered-sbtc-one | if | one arm (else only) |
| 1139 | pay-recovered-sbtc-one | if | one arm (then only) |

## Branch nodes never reached (13)

| line | function | kind |
|---|---|---|
| 94 | accept-admin | asserts! |
| 95 | accept-admin | asserts! |
| 144 | assert-idle-vault | asserts! |
| 145 | assert-idle-vault | asserts! |
| 160 | propose-swap-vault | asserts! |
| 197 | confirm-swap-vault | asserts! |
| 198 | confirm-swap-vault | asserts! |
| 204 | confirm-swap-vault | asserts! |
| 364 | propose-fee-bips | asserts! |
| 380 | confirm-fee-bips | asserts! |
| 716 | get-stx-owed | if |
| 898 | settle-one | match |
| 920 | pox-settle-stakers | asserts! |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 2, 4, 5, 6, 8, 12, 20, 22, 23, 24, 25, 26, 28, 30, 31, 32, 33, 34, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 49, 50, 51, 53, 54, 55, 56, 232, 233, 235, 236, 237, 238, 239, 241, 243, 247, 248, 348, 350, 351, 582, 590, 595, 604, 613, 620, 977, 984, 992, 999, 1006 |
| confirm-swap-vault | 193, 194, 195, 196, 197, 198, 199, 200, 204, 205, 206, 207, 208, 209, 210, 212, 215 |
| propose-swap-vault | 158, 159, 160, 163, 164, 165, 166, 168, 169, 170, 172 |
| get-stx-owed | 707, 708, 709, 712, 716, 717, 718, 725, 726, 727, 729 |
| accept-admin | 93, 94, 95, 96, 99, 101, 104, 105, 106, 107 |
| propose-fee-bips | 362, 363, 364, 365, 366, 367, 369, 371, 373 |
| propose-admin | 78, 79, 80, 81, 82, 84, 86, 88 |
| assert-idle-vault | 143, 144, 145, 146, 147, 148, 149, 153 |
| confirm-fee-bips | 378, 379, 380, 381, 384, 386, 389, 390 |
| cancel-admin-proposal | 112, 113, 114, 116, 118, 119, 120 |
| cancel-swap-vault-proposal | 177, 178, 179, 181, 183, 184, 185 |
| pox-settle-stakers | 911, 912, 918, 920, 921, 925, 928 |
| sweep-recovered-sbtc-dust | 1217, 1218, 1220, 1221, 1223, 1229 |
| set-paused | 221, 222, 223, 224, 228 |
| cancel-fee-bips | 395, 396, 397, 399, 401 |
| refloor-vault | 1257, 1258, 1259, 1260, 1261 |
| set-vault-leeway-bps | 1283, 1284, 1285, 1286, 1287 |
| set-vault-slippage-bps | 1296, 1297, 1298, 1299, 1300 |
| set-vault-dia-band-bps | 1322, 1323, 1324, 1325, 1326 |
| set-vault-router-cooldown | 1335, 1336, 1337, 1338, 1339 |
| set-vault-no-pyth-slippage-bps | 1384, 1385, 1386, 1387, 1388 |
| router-swap-split-dia | 1413, 1414, 1415, 1416, 1417 |
| get-pending-admin | 70, 71, 72, 73 |
| get-pending-swap-vault | 129, 130, 131, 132 |
| get-og-status | 266, 267, 268, 269 |
| get-pending-fee | 354, 355, 356, 357 |
| settle-one | 898, 899, 901, 902 |
| raise-og-cap | 433, 435, 438 |
| withdraw-fees | 465, 466, 467 |
| ERR_NOT_RECOVERED | 4 |
| ERR_SWAP_PENDING | 5 |
| ERR_NO_PENDING_ADMIN | 6 |
| pending-swap | 8 |
| finalized-tranches | 13 |
| ERR_NO_PENDING_SWAP_VAULT | 23 |
| ERR_INVALID_SWAP_VAULT | 24 |
| ERR_SWAP_VAULT_BUSY | 25 |
| ERR_VAULT_TRANSFER_MISMATCH | 26 |
| ERR_BOND_NOT_SUPPORTED | 28 |
| pending-swap-vault | 31 |
| ERR_UNAUTHORIZED | 36 |
| ERR_PAUSED | 37 |
| ERR_NOT_POX5 | 38 |
| ERR_SETTLE_FAILED | 39 |
| ERR_TRANCHE_UNPAID | 40 |
| ERR_NO_DUST | 41 |
| ERR_NO_NEW_REWARDS | 42 |
| ERR_INVALID_FEE | 43 |
| ERR_INSUFFICIENT_FEES | 44 |
| ERR_TRANCHE_TOO_SOON | 45 |
| ERR_NO_PENDING_FEE | 46 |
| ERR_COOLDOWN | 47 |
| pending-admin | 54 |
| get-admin | 59 |
| is-paused | 62 |
| get-swap-vault | 125 |
| ERR_OG_NOTHING_TO_ADD | 235 |
| ERR_OG_CAP_FULL | 236 |
| ERR_OG_NOT_RAISED | 237 |
| ERR_OG_NOT_SEATED | 238 |
| ERR_OG_STILL_STAKED | 239 |
| get-fee-bips | 251 |
| get-earned-fees | 254 |
| is-og | 258 |
| get-effective-fee-bips | 274 |
| pending-fee | 350 |
| stx-pot | 583 |
| get-last-claim-dist-cycle | 601 |
| stx-paid | 605 |
| tranche-paid | 614 |
| tranche-paid-shares | 621 |
| get-stx-paid | 649 |
| get-unclaimed-signer-rewards | 936 |
| get-staker-entitlement | 947 |
| recovered-sbtc-pot | 978 |
| recovered-sbtc-paid | 985 |
| recovered-sbtc-tranche-paid | 993 |
| recovered-sbtc-paid-shares | 1000 |
| get-recovered-sbtc-paid | 1035 |
| get-earned-sbtc-fees | 1077 |
| get-pending-swap | 1377 |

## Per simulation (cumulative executed expressions of juice-pool-sbtc-signer)

| sim | txs | before | after |
|---|---|---|---|
| `5cf1573f` | 217 | 0 | 882 |

## Provenance and trace diagnostics

source simulations/deploy-bytes-mv7dfb/juice-pool-sbtc-signer.clar at 7e42b9c, sha256 `57d8c3d384f11d955574a0bce365dad788c4cac919708a70d03c2e10af1f9bd6`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 217 |
| no trace returned by stxer | 14 |
| trace decode errors | 0 |
| calls to a counted market instance | 50 |
| ... of which without a trace | 0 |
| ... of which decode errors | 0 |

| sim | counted instances |
|---|---|
| `5cf1573f` | juice-pool-sbtc-signer |

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
| juice-sbtc-autoswap@ff0a45868897 | 1 |
| juice-swap-vault-trait-v2@655b22cb792a | 1 |
| mallory-autostake-safe@373cb4482db2 | 1 |
| markets-sbtc-stx-jing-v6-3@7b2f0f44fca1 | 1 |
| signer-manager-vault-stx-rewards@4858dbc67c46 | 1 |
| sim-ccip-proxy@616692f404fc | 1 |
| swap-router-sbtc-stx-jing-v5-3@3e457866be8d | 1 |
