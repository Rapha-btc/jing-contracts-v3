# Trace coverage: jing-core-v6

From `simulations/trace-coverage.mjs` on 2026-10-14, source at simulations/deploy-bytes-mv7dfb/jing-core-v6.clar at 7e42b9c: 1 simulations, 217 transactions (14 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 143 / 1178 (12.1%) |
| code lines touched / total | 96 / 958 (10.0%) |
| function body lines touched / total (top-level definitions excluded) | 96 / 939 (10.2%) |
| branch nodes (if / match / asserts!) | 82: 15 full, 8 partial, 59 never reached |

## Branches with one arm never taken (8)

| line | function | kind | state |
|---|---|---|---|
| 150 | credit-if-not-registered | if | one arm (else only) |
| 161 | debit-if-not-registered | if | one arm (else only) |
| 172 | credit-if-registered | if | one arm (else only) |
| 179 | check-not-paused | if | one arm (else only) |
| 406 | log-deposit-x | match | one arm (else only) |
| 447 | log-deposit-y | match | one arm (else only) |
| 1146 | log-distribute-x-depositor | if | one arm (then only) |
| 1179 | log-distribute-y-depositor | if | one arm (then only) |

## Branch nodes never reached (59)

| line | function | kind |
|---|---|---|
| 204 | pause | asserts! |
| 219 | unpause | asserts! |
| 220 | unpause | asserts! |
| 221 | unpause | asserts! |
| 235 | propose-owner | asserts! |
| 248 | accept-owner | asserts! |
| 286 | log-deposit | asserts! |
| 304 | log-withdraw | asserts! |
| 319 | log-revoke | asserts! |
| 334 | log-cancel | asserts! |
| 355 | log-bitflow-swap | asserts! |
| 514 | log-withdraw-x | asserts! |
| 542 | log-withdraw-y | asserts! |
| 569 | log-limit-y | asserts! |
| 593 | log-limit-x | asserts! |
| 618 | log-settle-refused-y | asserts! |
| 644 | log-settle-refused-x | asserts! |
| 668 | log-pending-readmit-y | asserts! |
| 690 | log-pending-readmit-x | asserts! |
| 714 | log-pending-deposit-y | asserts! |
| 739 | log-pending-refund-y | asserts! |
| 764 | log-pending-deposit-x | asserts! |
| 789 | log-pending-refund-x | asserts! |
| 813 | log-pending-limit-y | asserts! |
| 837 | log-pending-limit-x | asserts! |
| 861 | log-park-x | asserts! |
| 885 | log-readmit-x | asserts! |
| 909 | log-park-y | asserts! |
| 933 | log-readmit-y | asserts! |
| 956 | log-small-share-roll-x | asserts! |
| 978 | log-small-share-roll-y | asserts! |
| 1002 | log-limit-roll-x | asserts! |
| 1028 | log-limit-roll-y | asserts! |
| 1059 | log-match | asserts! |
| 1061 | log-match | if |
| 1243 | log-rfq-open | asserts! |
| 1271 | log-rfq-fill | asserts! |
| 1297 | log-rfq-cancel | asserts! |
| 1314 | log-reserve-supply | asserts! |
| 1328 | log-reserve-withdraw-sbtc | asserts! |
| 1342 | log-reserve-withdraw-stx | asserts! |
| 1359 | log-reserve-open-credit-line | asserts! |
| 1377 | log-reserve-set-credit-line-cap | asserts! |
| 1393 | log-reserve-set-credit-line-interest | asserts! |
| 1406 | log-reserve-close-credit-line | asserts! |
| 1418 | log-reserve-set-paused | asserts! |
| 1430 | log-reserve-set-min-sbtc-draw | asserts! |
| 1447 | log-reserve-draw | asserts! |
| 1465 | log-reserve-notify-return | asserts! |
| 1479 | log-snpl-set-reserve | asserts! |
| 1499 | log-snpl-borrow | asserts! |
| 1522 | log-snpl-swap-deposit | asserts! |
| 1537 | log-snpl-cancel-swap | asserts! |
| 1552 | log-snpl-set-swap-limit | asserts! |
| 1575 | log-snpl-repay | asserts! |
| 1602 | log-snpl-seize | asserts! |
| 1628 | log-jing-swap | asserts! |
| 1653 | reconcile-vault-equity | if |
| 1673 | log-jing-swap-reconciled | asserts! |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 13, 15, 16, 18, 23, 24, 26, 31, 38 |
| log-match | 1057, 1058, 1059, 1061, 1062, 1063, 1064, 1065, 1067, 1068, 1069, 1070, 1073, 1087 |
| log-bitflow-swap | 353, 354, 355, 356, 357, 358, 367, 368, 370 |
| log-jing-swap | 1626, 1627, 1628, 1629, 1630, 1631, 1641, 1642, 1644 |
| log-jing-swap-reconciled | 1671, 1672, 1673, 1674, 1675, 1676, 1686, 1687, 1690 |
| pause | 203, 204, 205, 206, 207, 211, 213 |
| unpause | 218, 219, 220, 221, 224, 225, 229 |
| log-deposit | 284, 285, 286, 287, 288, 293, 295 |
| log-reserve-supply | 1312, 1313, 1314, 1315, 1316, 1320, 1322 |
| accept-owner | 247, 248, 249, 250, 251, 255 |
| log-withdraw | 303, 304, 305, 306, 311, 313 |
| log-withdraw-x | 513, 514, 515, 516, 526, 528 |
| log-withdraw-y | 541, 542, 543, 544, 554, 556 |
| log-reserve-withdraw-sbtc | 1327, 1328, 1329, 1330, 1334, 1336 |
| propose-owner | 234, 235, 236, 237, 242 |
| log-reserve-draw | 1445, 1446, 1447, 1448, 1455 |
| log-snpl-borrow | 1497, 1498, 1499, 1500, 1510 |
| log-snpl-swap-deposit | 1520, 1521, 1522, 1523, 1531 |
| log-snpl-repay | 1574, 1575, 1576, 1577, 1590 |
| log-snpl-seize | 1601, 1602, 1603, 1604, 1613 |
| log-revoke | 318, 319, 320, 325 |
| log-cancel | 333, 334, 335, 341 |
| log-limit-y | 568, 569, 570, 580 |
| log-limit-x | 592, 593, 594, 604 |
| log-settle-refused-y | 617, 618, 619, 630 |
| log-settle-refused-x | 643, 644, 645, 656 |
| log-pending-readmit-y | 667, 668, 669, 678 |
| log-pending-readmit-x | 689, 690, 691, 700 |
| log-pending-deposit-y | 713, 714, 715, 726 |
| log-pending-refund-y | 738, 739, 740, 750 |
| log-pending-deposit-x | 763, 764, 765, 776 |
| log-pending-refund-x | 788, 789, 790, 800 |
| log-pending-limit-y | 812, 813, 814, 824 |
| log-pending-limit-x | 836, 837, 838, 848 |
| log-park-x | 860, 861, 862, 872 |
| log-readmit-x | 884, 885, 886, 896 |
| log-park-y | 908, 909, 910, 920 |
| log-readmit-y | 932, 933, 934, 944 |
| log-small-share-roll-x | 955, 956, 957, 966 |
| log-small-share-roll-y | 977, 978, 979, 988 |
| log-limit-roll-x | 1001, 1002, 1003, 1014 |
| log-limit-roll-y | 1027, 1028, 1029, 1040 |
| log-rfq-open | 1242, 1243, 1244, 1255 |
| log-rfq-fill | 1270, 1271, 1272, 1285 |
| log-rfq-cancel | 1296, 1297, 1298, 1307 |
| log-reserve-withdraw-stx | 1341, 1342, 1343, 1348 |
| log-reserve-open-credit-line | 1358, 1359, 1360, 1368 |
| log-reserve-set-credit-line-cap | 1376, 1377, 1378, 1384 |
| log-reserve-set-credit-line-interest | 1392, 1393, 1394, 1400 |
| log-reserve-close-credit-line | 1405, 1406, 1407, 1412 |
| log-reserve-set-paused | 1417, 1418, 1419, 1424 |
| log-reserve-set-min-sbtc-draw | 1429, 1430, 1431, 1436 |
| log-reserve-notify-return | 1464, 1465, 1466, 1473 |
| log-snpl-set-reserve | 1478, 1479, 1480, 1485 |
| log-snpl-cancel-swap | 1536, 1537, 1538, 1543 |
| log-snpl-set-swap-limit | 1551, 1552, 1553, 1559 |
| reconcile-vault-equity | 1652, 1653, 1654, 1655 |
| ERR_NOT_AUTHORIZED | 1 |
| ERR_INVALID_CONTRACT_HASH | 2 |
| ERR_ALREADY_REGISTERED | 3 |
| ERR_NOT_VERIFIED | 4 |
| ERR_HASH_MISMATCH | 5 |
| ERR_TIMELOCK_NOT_ELAPSED | 6 |
| ERR_PAUSED | 7 |
| ERR_NOT_PAUSED | 8 |
| ERR_NO_PENDING_OWNER | 9 |
| pending-owner | 16 |
| verified-contracts | 20 |
| token-equity | 32 |
| is-verified-contract | 44 |
| get-verified-hash | 48 |
| get-pending-owner | 56 |
| is-paused | 60 |
| get-paused-at | 64 |
| get-unpause-eligible-at | 68 |
| get-balance | 92 |
| credit-if-registered | 173 |
| register | 261 |
| log-deposit-x | 407 |
| log-deposit-y | 448 |

## Per simulation (cumulative executed expressions of jing-core-v6)

| sim | txs | before | after |
|---|---|---|---|
| `5cf1573f` | 217 | 0 | 365 |

## Provenance and trace diagnostics

source simulations/deploy-bytes-mv7dfb/jing-core-v6.clar at 7e42b9c, sha256 `973482e429cf7d9110847227fdc701443d8d9884b448dce5273579e23ea7fdff`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 217 |
| no trace returned by stxer | 14 |
| trace decode errors | 0 |
| calls to a counted market instance | 2 |
| ... of which without a trace | 0 |
| ... of which decode errors | 0 |

| sim | counted instances |
|---|---|
| `5cf1573f` | jing-core-v6 |

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
