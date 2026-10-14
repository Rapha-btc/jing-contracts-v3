# Trace coverage: signer-manager-vault-stx-rewards

From `simulations/trace-coverage.mjs` on 2026-10-14, source at simulations/deploy-bytes-mv7dfb/signer-manager-vault-stx-rewards.clar at 7e42b9c: 1 simulations, 217 transactions (14 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 294 / 1023 (28.7%) |
| code lines touched / total | 168 / 645 (26.0%) |
| function body lines touched / total (top-level definitions excluded) | 168 / 600 (28.0%) |
| branch nodes (if / match / asserts!) | 40: 11 full, 10 partial, 19 never reached |

## Branches with one arm never taken (10)

| line | function | kind | state |
|---|---|---|---|
| 225 | mirror-stake-for-cycle | if | one arm (else only) |
| 314 | claim-rewards | if | one arm (then only) |
| 320 | claim-rewards | if | one arm (then only) |
| 868 | compute-due | if | one arm (else only) |
| 872 | compute-due | if | one arm (else only) |
| 876 | compute-due | if | one arm (else only) |
| 886 | compute-due | if | one arm (then only) |
| 933 | pay-stacker | if | one arm (then only) |
| 949 | pay-stacker | if | one arm (else only) |
| 1034 | fold-distribute | if | one arm (else only) |

## Branch nodes never reached (19)

| line | function | kind |
|---|---|---|
| 363 | repair-mirror-many | asserts! |
| 412 | fold-repair-mirror | if |
| 423 | fold-repair-mirror | if |
| 503 | assert-idle-vault | asserts! |
| 504 | assert-idle-vault | asserts! |
| 519 | propose-swap-vault | asserts! |
| 556 | confirm-swap-vault | asserts! |
| 557 | confirm-swap-vault | asserts! |
| 563 | confirm-swap-vault | asserts! |
| 650 | recover-swap-vault | asserts! |
| 961 | pay-stacker | if |
| 997 | distribute-rewards | asserts! |
| 1102 | update-admin | asserts! |
| 1114 | update-fees | asserts! |
| 1129 | withdraw-fees | asserts! |
| 1166 | sweep-sbtc-dust | if |
| 1172 | sweep-sbtc-dust | asserts! |
| 1206 | sweep-stx-dust | if |
| 1212 | sweep-stx-dust | asserts! |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 24, 25, 26, 31, 34, 36, 38, 41, 46, 48, 50, 52, 54, 56, 58, 59, 60, 61, 62, 63, 64, 65, 66, 70, 71, 75, 79, 90, 94, 101, 102, 106, 118, 121, 137, 145, 152, 171, 188, 197, 479, 480, 481, 579, 581 |
| confirm-swap-vault | 552, 553, 554, 555, 556, 557, 558, 559, 563, 564, 565, 566, 567, 568, 569, 571, 574 |
| recover-swap-vault | 644, 645, 646, 647, 648, 650, 653, 654, 655, 657, 658, 659, 661, 662, 663, 664, 669 |
| repair-mirror-many | 362, 363, 364, 365, 370, 374, 375, 377, 380, 381, 383, 384, 385 |
| sweep-sbtc-dust | 1160, 1161, 1165, 1166, 1167, 1171, 1172, 1173, 1174, 1177, 1181, 1186 |
| sweep-stx-dust | 1203, 1204, 1205, 1206, 1207, 1211, 1212, 1213, 1214, 1215, 1217, 1222 |
| fold-repair-mirror | 399, 400, 401, 405, 406, 412, 414, 415, 423, 424, 425 |
| propose-swap-vault | 517, 518, 519, 522, 523, 524, 525, 527, 528, 529, 531 |
| pay-stacker | 943, 950, 951, 955, 959, 960, 961, 962, 963, 966 |
| distribute-rewards | 994, 995, 996, 997, 998, 1001, 1002, 1003, 1004 |
| withdraw-fees | 1127, 1128, 1129, 1130, 1131, 1132, 1135, 1139, 1144 |
| assert-idle-vault | 502, 503, 504, 505, 506, 507, 508, 512 |
| get-swap-status | 1275, 1276, 1277, 1278, 1279, 1280, 1282, 1283 |
| cancel-swap-vault-proposal | 536, 537, 538, 540, 542, 543, 544 |
| update-fees | 1112, 1113, 1114, 1115, 1117, 1120 |
| update-admin | 1100, 1101, 1102, 1103, 1108 |
| check-mirror | 1291, 1292, 1293, 1297, 1300 |
| get-pending-swap-vault | 488, 489, 490, 491 |
| refloor-vault | 679, 680, 681, 682 |
| set-vault-leeway-bps | 705, 706, 707, 708 |
| set-vault-slippage-bps | 716, 717, 718, 719 |
| set-vault-dia-band-bps | 738, 739, 740, 741 |
| set-vault-router-cooldown | 749, 750, 751, 752 |
| jing-take | 772, 773, 774, 775 |
| set-vault-no-pyth-slippage-bps | 801, 802, 803, 804 |
| router-swap-split-dia | 815, 816, 817, 818 |
| get-stacker-rewards | 906, 907, 908 |
| get-mirrored-shares | 1309, 1310 |
| ERR_UNAUTHORIZED_ADMIN | 31 |
| ERR_UNAUTHORIZED_CALLER | 34 |
| ERR_INVALID_FEES_BIPS | 36 |
| ERR_INSUFFICIENT_FEES | 38 |
| ERR_SHARE_MIRROR_MISMATCH | 41 |
| ERR_SHARES_ALREADY_PINNED | 46 |
| ERR_NOTHING_TO_DISTRIBUTE | 48 |
| ERR_NO_DUST | 50 |
| ERR_BONDS_NOT_SUPPORTED | 52 |
| ERR_CALLDATA_NOT_SUPPORTED | 54 |
| ERR_INVALID_LOCK_PERIOD | 56 |
| ERR_CYCLE_NOT_CLAIMED | 58 |
| ERR_VAULT_BUSY | 59 |
| ERR_ZERO_VAULT_FUNDING | 60 |
| ERR_RECOVERY_TOO_SOON | 61 |
| ERR_NO_ACTIVE_VAULT | 62 |
| ERR_NO_PENDING_SWAP_VAULT | 63 |
| ERR_INVALID_SWAP_VAULT | 64 |
| ERR_SWAP_VAULT_BUSY | 65 |
| ERR_SWAP_VAULT_COOLDOWN | 66 |
| CYCLE_OFFSETS | 79 |
| mirrored-shares | 138 |
| cycle-settlement | 154 |
| EMPTY_SETTLEMENT | 171 |
| stacker-stx-paid | 189 |
| stacker-sbtc-accounted | 198 |
| claim-rewards | 316 |
| pending-swap-vault | 480 |
| get-swap-vault | 484 |
| vault-cycle | 579 |
| fund-swap-vault | 602 |
| get-vault-cycle | 687 |
| compute-due | 877 |
| fold-distribute | 1035 |
| get-mirrored-total-shares | 1318 |
| get-fees-bips | 1328 |
| get-earned-fees | 1332 |
| get-unswapped-sats | 1336 |
| get-unpaid-stx | 1340 |

## Per simulation (cumulative executed expressions of signer-manager-vault-stx-rewards)

| sim | txs | before | after |
|---|---|---|---|
| `5cf1573f` | 217 | 0 | 541 |

## Provenance and trace diagnostics

source simulations/deploy-bytes-mv7dfb/signer-manager-vault-stx-rewards.clar at 7e42b9c, sha256 `4858dbc67c466cd8e7cd0a13bcff32cf0f8e2bc72830f5ee914f270a07d4a731`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 217 |
| no trace returned by stxer | 14 |
| trace decode errors | 0 |
| calls to a counted market instance | 12 |
| ... of which without a trace | 0 |
| ... of which decode errors | 0 |

| sim | counted instances |
|---|---|
| `5cf1573f` | signer-manager-vault-stx-rewards |

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
| sim-ccip-proxy@616692f404fc | 1 |
| swap-router-sbtc-stx-jing-v5-3@3e457866be8d | 1 |
