# Trace coverage: juice-autostake-safe

From `simulations/trace-coverage.mjs` on 2026-10-14, source at simulations/deploy-bytes-mv7dfb/juice-autostake-safe.clar at 7e42b9c: 1 simulations, 217 transactions (14 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 195 / 1588 (12.3%) |
| code lines touched / total | 114 / 1034 (11.0%) |
| function body lines touched / total (top-level definitions excluded) | 114 / 974 (11.7%) |
| branch nodes (if / match / asserts!) | 113: 21 full, 5 partial, 87 never reached |

## Branches with one arm never taken (5)

| line | function | kind | state |
|---|---|---|---|
| 1124 | is-admin-pubkey | match | one arm (then only) |
| 1173 | confirm-transfer-wallet | match | one arm (else only) |
| 1367 | stake-stx-juice | match | one arm (else only) |
| 1535 | set-keeper | match | one arm (else only) |
| 1577 | restake | if | one arm (else only) |

## Branch nodes never reached (87)

| line | function | kind |
|---|---|---|
| 108 | get-current-spent | if |
| 167 | pay-gas-accounted | if |
| 172 | pay-gas-accounted | asserts! |
| 232 | propose-max-gas-amount | asserts! |
| 261 | confirm-max-gas-amount | if |
| 280 | confirm-max-gas-amount | match |
| 284 | confirm-max-gas-amount | asserts! |
| 285 | confirm-max-gas-amount | asserts! |
| 319 | toggle-token-lock | asserts! |
| 322 | toggle-token-lock | if |
| 323 | toggle-token-lock | match |
| 338 | toggle-token-lock | match |
| 365 | signal-config-change | asserts! |
| 366 | signal-config-change | asserts! |
| 411 | set-wallet-config | if |
| 432 | set-wallet-config | match |
| 436 | set-wallet-config | asserts! |
| 437 | set-wallet-config | asserts! |
| 516 | veto-operation | match |
| 531 | veto-operation | match |
| 538 | veto-operation | asserts! |
| 611 | stx-transfer | match |
| 613 | stx-transfer | asserts! |
| 629 | stx-transfer | match |
| 636 | stx-transfer | if |
| 650 | stx-transfer | match |
| 664 | execute-pending-stx-transfer | asserts! |
| 665 | execute-pending-stx-transfer | asserts! |
| 666 | execute-pending-stx-transfer | asserts! |
| 667 | execute-pending-stx-transfer | asserts! |
| 678 | execute-pending-stx-transfer | match |
| 699 | execute-pending-stx-transfer-now | asserts! |
| 700 | execute-pending-stx-transfer-now | asserts! |
| 701 | execute-pending-stx-transfer-now | asserts! |
| 703 | execute-pending-stx-transfer-now | asserts! |
| 704 | execute-pending-stx-transfer-now | asserts! |
| 718 | execute-pending-stx-transfer-now | match |
| 729 | execute-pending-stx-transfer-now | match |
| 754 | sip010-transfer | match |
| 756 | sip010-transfer | asserts! |
| 773 | sip010-transfer | match |
| 780 | sip010-transfer | if |
| 788 | sip010-transfer | if |
| 809 | execute-pending-sbtc-transfer | asserts! |
| 810 | execute-pending-sbtc-transfer | asserts! |
| 811 | execute-pending-sbtc-transfer | asserts! |
| 812 | execute-pending-sbtc-transfer | asserts! |
| 845 | execute-pending-sbtc-transfer-now | asserts! |
| 846 | execute-pending-sbtc-transfer-now | asserts! |
| 847 | execute-pending-sbtc-transfer-now | asserts! |
| 849 | execute-pending-sbtc-transfer-now | asserts! |
| 850 | execute-pending-sbtc-transfer-now | asserts! |
| 864 | execute-pending-sbtc-transfer-now | match |
| 902 | sbtc-initiate-withdrawal | match |
| 904 | sbtc-initiate-withdrawal | asserts! |
| 920 | sbtc-initiate-withdrawal | match |
| 927 | sbtc-initiate-withdrawal | if |
| 955 | execute-pending-sbtc-withdrawal | asserts! |
| 956 | execute-pending-sbtc-withdrawal | asserts! |
| 957 | execute-pending-sbtc-withdrawal | asserts! |
| 958 | execute-pending-sbtc-withdrawal | asserts! |
| 1006 | execute-pending-sbtc-withdrawal-now | asserts! |
| 1007 | execute-pending-sbtc-withdrawal-now | asserts! |
| 1008 | execute-pending-sbtc-withdrawal-now | asserts! |
| 1010 | execute-pending-sbtc-withdrawal-now | asserts! |
| 1011 | execute-pending-sbtc-withdrawal-now | asserts! |
| 1025 | execute-pending-sbtc-withdrawal-now | match |
| 1077 | sip009-transfer | match |
| 1079 | sip009-transfer | asserts! |
| 1095 | sip009-transfer | match |
| 1296 | propose-recovery | match |
| 1301 | propose-recovery | asserts! |
| 1314 | confirm-recovery | asserts! |
| 1331 | recover-inactive-wallet | asserts! |
| 1332 | recover-inactive-wallet | asserts! |
| 1335 | recover-inactive-wallet | asserts! |
| 1369 | stake-stx-juice | asserts! |
| 1383 | stake-stx-juice | match |
| 1426 | update-stake-stx-juice | match |
| 1428 | update-stake-stx-juice | asserts! |
| 1443 | update-stake-stx-juice | match |
| 1451 | update-stake-stx-juice | asserts! |
| 1484 | unstake | match |
| 1486 | unstake | asserts! |
| 1498 | unstake | match |
| 1537 | set-keeper | asserts! |
| 1551 | set-keeper | match |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 3, 4, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 29, 30, 32, 33, 35, 37, 38, 39, 40, 42, 44, 46, 48, 50, 52, 53, 54, 56, 57, 58, 60, 62, 67, 72, 84, 86, 88, 144, 145, 147, 185, 201, 203, 211, 1112, 1117, 1607 |
| execute-pending-sbtc-withdrawal-now | 1005, 1006, 1007, 1008, 1010, 1011, 1012, 1013, 1015, 1016, 1019, 1020, 1021, 1022, 1023, 1025, 1026, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1043, 1044, 1045, 1046, 1048, 1049, 1050, 1051 |
| sip010-transfer | 752, 753, 754, 755, 756, 757, 758, 760, 761, 765, 767, 768, 769, 770, 771, 773, 774, 778, 780, 781, 782, 783, 785, 787, 788, 789, 792, 794, 796, 797 |
| stx-transfer | 609, 610, 611, 612, 613, 614, 615, 617, 618, 623, 624, 625, 626, 627, 629, 630, 634, 636, 637, 638, 639, 641, 643, 644, 645, 649, 650, 651, 652 |
| sbtc-initiate-withdrawal | 900, 901, 902, 903, 904, 905, 906, 908, 909, 914, 915, 916, 917, 918, 920, 921, 925, 927, 928, 929, 930, 931, 935, 937, 939, 940, 941, 942, 947 |
| set-wallet-config | 403, 404, 405, 406, 407, 408, 409, 410, 411, 416, 417, 419, 420, 425, 426, 427, 428, 429, 432, 433, 436, 437, 440, 447, 452, 453, 459, 464 |
| confirm-max-gas-amount | 257, 258, 259, 260, 261, 266, 267, 269, 270, 271, 273, 274, 275, 276, 277, 280, 281, 284, 285, 288, 289, 293, 294, 296, 298 |
| execute-pending-stx-transfer-now | 698, 699, 700, 701, 703, 704, 705, 706, 708, 709, 712, 713, 714, 715, 716, 718, 719, 722, 723, 724, 726, 728, 729, 730, 731 |
| execute-pending-sbtc-transfer-now | 844, 845, 846, 847, 849, 850, 851, 852, 854, 855, 858, 859, 860, 861, 862, 864, 865, 868, 869, 870, 872, 875, 876, 877 |
| update-stake-stx-juice | 1424, 1425, 1426, 1427, 1428, 1429, 1430, 1432, 1433, 1437, 1438, 1439, 1440, 1441, 1443, 1444, 1448, 1451, 1452, 1457, 1458, 1462, 1467 |
| toggle-token-lock | 318, 319, 322, 323, 324, 325, 326, 328, 329, 332, 333, 334, 335, 336, 338, 339, 343, 345, 347, 348, 349, 353 |
| sip009-transfer | 1075, 1076, 1077, 1078, 1079, 1080, 1081, 1083, 1084, 1087, 1089, 1090, 1091, 1092, 1093, 1095, 1096, 1100, 1102, 1104, 1106, 1107 |
| execute-pending-sbtc-withdrawal | 954, 955, 956, 957, 958, 961, 962, 963, 964, 965, 966, 967, 968, 969, 977, 978, 979, 980, 982, 983, 984 |
| veto-operation | 515, 516, 517, 518, 519, 521, 522, 525, 526, 527, 528, 529, 531, 532, 536, 538, 539, 541, 542, 546 |
| unstake | 1482, 1483, 1484, 1485, 1486, 1487, 1488, 1490, 1492, 1493, 1494, 1495, 1496, 1498, 1499, 1503, 1506, 1511, 1512, 1513 |
| propose-recovery | 1282, 1283, 1284, 1286, 1287, 1290, 1291, 1292, 1293, 1294, 1296, 1297, 1301, 1302, 1303, 1304, 1308 |
| execute-pending-stx-transfer | 663, 664, 665, 666, 667, 670, 671, 672, 673, 675, 677, 678, 679, 680 |
| execute-pending-sbtc-transfer | 808, 809, 810, 811, 812, 815, 816, 817, 818, 820, 823, 824, 825 |
| stake-stx-juice | 1368, 1369, 1370, 1371, 1373, 1374, 1377, 1378, 1379, 1380, 1381, 1383, 1384 |
| set-keeper | 1536, 1537, 1538, 1539, 1541, 1542, 1545, 1546, 1547, 1548, 1549, 1551, 1552 |
| pay-gas-accounted | 157, 160, 161, 163, 164, 167, 168, 172, 173, 175, 179, 180 |
| signal-config-change | 362, 363, 365, 366, 367, 372, 373, 375, 377, 384, 388 |
| recover-inactive-wallet | 1330, 1331, 1332, 1333, 1335, 1336, 1337, 1339, 1340, 1341, 1345 |
| create-pending-operation | 477, 478, 479, 481, 488, 493, 494, 497, 499 |
| confirm-recovery | 1313, 1314, 1317, 1318, 1319, 1320, 1321, 1325 |
| get-current-spent | 101, 102, 103, 104, 105, 108, 109 |
| propose-max-gas-amount | 230, 231, 232, 233, 237, 238, 242 |
| pending-operations | 187, 188, 191, 192, 193 |
| would-exceed-stx-threshold | 555, 556, 557, 559 |
| would-exceed-sbtc-threshold | 564, 565, 566, 568 |
| wallet-config | 72, 76, 77 |
| add-spent-stx | 121, 122, 123 |
| add-spent-sbtc | 129, 130, 131 |
| add-spent-gas | 137, 138, 139 |
| used-pubkey-authorizations | 63, 64 |
| spent-this-period | 88, 93 |
| pending-max-gas | 203, 206 |
| pending-config | 211, 215 |
| err-unauthorised | 8 |
| err-invalid-signature | 9 |
| err-forbidden | 10 |
| err-unregistered-pubkey | 11 |
| err-not-admin-pubkey | 12 |
| err-signature-replay | 13 |
| err-inactive-required | 14 |
| err-no-pending-recovery | 15 |
| err-in-cooldown | 16 |
| err-invalid-operation | 17 |
| err-already-executed | 18 |
| err-vetoed | 19 |
| err-not-signaled | 20 |
| err-cooldown-not-passed | 21 |
| err-threshold-exceeded | 22 |
| err-cooldown-too-long | 23 |
| err-cooldown-too-short | 24 |
| err-no-pending-transfer | 25 |
| err-token-locked | 27 |
| err-zero-amount | 29 |
| err-not-staking | 30 |
| used-assertions | 68 |
| max-gas-per-period | 150 |
| get-pending-config | 222 |
| get-pending-max-gas | 226 |
| pubkey-to-admin | 1118 |
| get-token-lock-enabled | 303 |
| get-pending-operation | 551 |
| confirm-transfer-wallet | 1174 |
| get-owner | 1259 |
| is-inactive | 1263 |
| get-keeper | 1518 |
| restake | 1578 |

## Per simulation (cumulative executed expressions of juice-autostake-safe)

| sim | txs | before | after |
|---|---|---|---|
| `5cf1573f` | 217 | 0 | 356 |

## Provenance and trace diagnostics

source simulations/deploy-bytes-mv7dfb/juice-autostake-safe.clar at 7e42b9c, sha256 `dda5367c1800f6f541840607ba9b5437f479580d51cd3654c12270024ae28a3d`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 217 |
| no trace returned by stxer | 14 |
| trace decode errors | 0 |
| calls to a counted market instance | 17 |
| ... of which without a trace | 0 |
| ... of which decode errors | 0 |

| sim | counted instances |
|---|---|
| `5cf1573f` | juice-autostake-safe, bob-autostake-safe |

| excluded deployment (name@hash) | sims |
|---|---|
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
| juice-pool-sbtc-signer@57d8c3d384f1 | 1 |
| juice-sbtc-autoswap@ff0a45868897 | 1 |
| juice-swap-vault-trait-v2@655b22cb792a | 1 |
| mallory-autostake-safe@373cb4482db2 | 1 |
| markets-sbtc-stx-jing-v6-3@7b2f0f44fca1 | 1 |
| signer-manager-vault-stx-rewards@4858dbc67c46 | 1 |
| sim-ccip-proxy@616692f404fc | 1 |
| swap-router-sbtc-stx-jing-v5-3@3e457866be8d | 1 |
