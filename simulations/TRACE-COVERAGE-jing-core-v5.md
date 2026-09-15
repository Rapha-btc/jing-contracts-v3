# Trace coverage: jing-core-v5

From `simulations/trace-coverage.mjs` on 2026-09-15, source at 8193030: 39 simulations, 2396 transactions (200 without a trace), every evaluated expression read from the stxer debug traces. Alias `^jing-core`: every same-source instance deployed under another name counts.

| metric | value |
|---|---|
| expressions executed / total | 341 / 1384 (24.6%) |
| code lines touched / total | 230 / 1164 (19.8%) |
| function body lines touched / total (top-level definitions excluded) | 230 / 1071 (21.5%) |
| branch nodes (if / match / asserts!) | 72: 50 full, 0 partial, 22 never reached |

## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (22)

| line | function | kind |
|---|---|---|
| 374 | log-bitflow-swap | asserts! |
| 1052 | log-rfq-open | asserts! |
| 1080 | log-rfq-fill | asserts! |
| 1106 | log-rfq-cancel | asserts! |
| 1123 | log-reserve-supply | asserts! |
| 1137 | log-reserve-withdraw-sbtc | asserts! |
| 1151 | log-reserve-withdraw-stx | asserts! |
| 1168 | log-reserve-open-credit-line | asserts! |
| 1186 | log-reserve-set-credit-line-cap | asserts! |
| 1202 | log-reserve-set-credit-line-interest | asserts! |
| 1215 | log-reserve-close-credit-line | asserts! |
| 1227 | log-reserve-set-paused | asserts! |
| 1239 | log-reserve-set-min-sbtc-draw | asserts! |
| 1256 | log-reserve-draw | asserts! |
| 1274 | log-reserve-notify-return | asserts! |
| 1288 | log-snpl-set-reserve | asserts! |
| 1308 | log-snpl-borrow | asserts! |
| 1331 | log-snpl-swap-deposit | asserts! |
| 1346 | log-snpl-cancel-swap | asserts! |
| 1361 | log-snpl-set-swap-limit | asserts! |
| 1384 | log-snpl-repay | asserts! |
| 1411 | log-snpl-seize | asserts! |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 13, 15, 16, 18, 23, 24, 26, 31, 38, 43, 47, 51, 55, 59, 63, 67, 71, 75, 87, 91, 95, 115, 139, 150, 161, 172, 179, 196, 211, 227, 240, 253, 274, 293, 311, 323, 339, 364, 393, 433, 473, 497, 521, 549, 577, 597, 617, 641, 665, 689, 713, 737, 761, 783, 805, 831, 857, 900, 944, 977, 1010, 1042, 1068, 1098, 1120, 1135, 1149, 1161, 1181, 1197, 1213, 1225, 1237, 1249, 1268, 1286, 1298, 1323, 1344, 1356, 1372, 1403, 1426 |
| log-bitflow-swap | 364, 365, 366, 367, 368, 369, 370, 372, 373, 374, 375, 376, 377, 386, 387, 389 |
| log-settlement | 900, 901, 902, 903, 904, 905, 906, 907, 908, 909, 910, 911, 912, 913, 914 |
| log-snpl-repay | 1372, 1373, 1374, 1375, 1376, 1377, 1378, 1379, 1380, 1381, 1383, 1384, 1385, 1386, 1399 |
| log-rfq-fill | 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075, 1076, 1077, 1079, 1080, 1081, 1094 |
| log-rfq-open | 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1051, 1052, 1053, 1064 |
| log-snpl-borrow | 1298, 1299, 1300, 1301, 1302, 1303, 1304, 1306, 1307, 1308, 1309, 1319 |
| log-match | 857, 858, 859, 860, 861, 862, 863, 864, 865, 866, 867 |
| log-sweep-dust | 1010, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020 |
| log-snpl-seize | 1403, 1404, 1405, 1406, 1407, 1408, 1410, 1411, 1412, 1413, 1422 |
| log-deposit-x | 393, 394, 395, 396, 397, 398, 402, 403, 404, 405 |
| log-deposit-y | 433, 434, 435, 436, 437, 438, 442, 443, 444, 445 |
| log-rfq-cancel | 1098, 1099, 1100, 1101, 1102, 1103, 1105, 1106, 1107, 1116 |
| log-snpl-swap-deposit | 1323, 1324, 1325, 1326, 1327, 1329, 1330, 1331, 1332, 1340 |
| log-reserve-open-credit-line | 1161, 1162, 1163, 1164, 1165, 1167, 1168, 1169, 1177 |
| log-reserve-draw | 1249, 1250, 1251, 1252, 1254, 1255, 1256, 1257, 1264 |
| log-withdraw-x | 521, 522, 523, 524, 525, 526, 527, 528 |
| log-withdraw-y | 549, 550, 551, 552, 553, 554, 555, 556 |
| log-limit-roll-x | 805, 806, 807, 808, 809, 810, 811, 812 |
| log-limit-roll-y | 831, 832, 833, 834, 835, 836, 837, 838 |
| log-distribute-x-depositor | 944, 945, 946, 947, 948, 949, 950, 951 |
| log-distribute-y-depositor | 977, 978, 979, 980, 981, 982, 983, 984 |
| log-reserve-supply | 1120, 1121, 1122, 1123, 1124, 1125, 1129, 1131 |
| log-reserve-notify-return | 1268, 1269, 1270, 1271, 1273, 1274, 1275, 1282 |
| log-jing-swap | 1426, 1427, 1428, 1429, 1430, 1431, 1432, 1433 |
| log-jing-deposit | 339, 340, 341, 342, 343, 344, 345 |
| log-peg-x | 617, 618, 619, 620, 621, 622, 623 |
| log-peg-y | 641, 642, 643, 644, 645, 646, 647 |
| log-park-x | 665, 666, 667, 668, 669, 670, 671 |
| log-readmit-x | 689, 690, 691, 692, 693, 694, 695 |
| log-park-y | 713, 714, 715, 716, 717, 718, 719 |
| log-readmit-y | 737, 738, 739, 740, 741, 742, 743 |
| log-reserve-withdraw-sbtc | 1135, 1136, 1137, 1138, 1139, 1143, 1145 |
| log-reserve-set-credit-line-cap | 1181, 1182, 1183, 1185, 1186, 1187, 1193 |
| log-reserve-set-credit-line-interest | 1197, 1198, 1199, 1201, 1202, 1203, 1209 |
| log-snpl-set-swap-limit | 1356, 1357, 1358, 1360, 1361, 1362, 1368 |
| log-refund-x | 473, 474, 475, 476, 477, 478 |
| log-refund-y | 497, 498, 499, 500, 501, 502 |
| log-small-share-roll-x | 761, 762, 763, 764, 765, 766 |
| log-small-share-roll-y | 783, 784, 785, 786, 787, 788 |
| log-set-limit-x | 577, 578, 579, 580, 581 |
| log-set-limit-y | 597, 598, 599, 600, 601 |
| log-reserve-withdraw-stx | 1149, 1150, 1151, 1152, 1157 |
| log-reserve-close-credit-line | 1213, 1214, 1215, 1216, 1221 |
| log-reserve-set-paused | 1225, 1226, 1227, 1228, 1233 |
| log-reserve-set-min-sbtc-draw | 1237, 1238, 1239, 1240, 1245 |
| log-snpl-set-reserve | 1286, 1287, 1288, 1289, 1294 |
| log-snpl-cancel-swap | 1344, 1345, 1346, 1347, 1352 |
| credit | 95, 96, 97, 98 |
| debit | 115, 116, 117, 118 |
| credit-if-not-registered | 139, 140, 141, 142 |
| debit-if-not-registered | 150, 151, 152, 153 |
| credit-if-registered | 161, 162, 163, 164 |
| get-token-equity | 75, 76, 77 |
| log-deposit | 274, 275, 276 |
| log-withdraw | 293, 294, 295 |
| log-cancel | 323, 324, 325 |
| is-verified-contract | 43, 44 |
| get-verified-hash | 47, 48 |
| get-pending-owner | 55, 56 |
| is-paused | 59, 60 |
| get-paused-at | 63, 64 |
| get-unpause-eligible-at | 67, 68 |
| get-balance | 91, 92 |
| register | 253, 255 |
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
| get-contract-owner | 51 |
| is-registered | 71 |
| get-total-token-equity | 87 |
| check-not-paused | 172 |
| set-verified-contract | 179 |
| pause | 196 |
| unpause | 211 |
| propose-owner | 227 |
| accept-owner | 240 |
| log-revoke | 311 |

## Per simulation (cumulative executed expressions of jing-core-v5)

| sim | txs | before | after |
|---|---|---|---|
| `021504ee` | 59 | 0 | 521 |
| `03519ee6` | 57 | 521 | 521 |
| `08062c79` | 77 | 521 | 535 |
| `0b2a8e02` | 23 | 535 | 535 |
| `1239af91` | 35 | 535 | 559 |
| `1e101767` | 18 | 559 | 559 |
| `20aa4a5c` | 31 | 559 | 559 |
| `250da7f9` | 48 | 559 | 559 |
| `2683081f` | 34 | 559 | 559 |
| `27ed7a6e` | 174 | 559 | 615 |
| `30745051` | 32 | 615 | 615 |
| `400290a6` | 168 | 615 | 735 |
| `4fe11e14` | 102 | 735 | 735 |
| `59b23d38` | 122 | 735 | 817 |
| `5c063d70` | 18 | 817 | 832 |
| `5eb6ce12` | 33 | 832 | 832 |
| `677a6c55` | 119 | 832 | 832 |
| `6ed29637` | 94 | 832 | 832 |
| `7245f850` | 38 | 832 | 832 |
| `7c6ff3f1` | 17 | 832 | 832 |
| `8a1752d6` | 33 | 832 | 832 |
| `910168c4` | 34 | 832 | 832 |
| `93dc4f8c` | 32 | 832 | 832 |
| `981c4c03` | 42 | 832 | 832 |
| `99f15bff` | 29 | 832 | 832 |
| `aae15fd0` | 128 | 832 | 832 |
| `b501d4b4` | 138 | 832 | 832 |
| `b849e557` | 44 | 832 | 832 |
| `c2fd7397` | 45 | 832 | 832 |
| `c59430ec` | 38 | 832 | 848 |
| `cc8fc837` | 17 | 848 | 848 |
| `d35a98ea` | 70 | 848 | 848 |
| `d4405a31` | 35 | 848 | 853 |
| `dd814f5c` | 121 | 853 | 853 |
| `de538c52` | 35 | 853 | 853 |
| `e17cd8b0` | 22 | 853 | 853 |
| `f14101fc` | 59 | 853 | 853 |
| `f42edd92` | 143 | 853 | 853 |
| `f4f22abe` | 32 | 853 | 853 |

## Known unreachable (and why)

- The 22 `asserts!` never reached are the entry gates of `log-bitflow-swap`, `log-rfq-open` / `log-rfq-fill` / `log-rfq-cancel`, the eleven `log-reserve-*` and the seven `log-snpl-*` loggers. Their only callers are the Bitflow wrapper, the RFQ desk, the reserve and the SNPL contracts, none of which is in the v6 deploy set or registered in this fresh core (the live desk logs to jing-core-v4). `log-withdraw`, `log-revoke` and `log-jing-swap` are reached through the vault; `credit-if-registered`'s registered arm through the vault cleared as a maker in the batch (a walk fill only debits). Read-only functions leave no trace: stxer traces transactions only, and every read-only here is exercised through `addEvalCode` reads in the harnesses (their lines show as uncovered above). Top-level definitions run at deploy, which has no trace either.
