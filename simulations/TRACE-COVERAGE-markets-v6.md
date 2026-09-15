# Trace coverage: markets-sbtc-stx-jing-v6

From `simulations/trace-coverage.mjs` on 2026-09-15: 31 simulations, 1855 transactions (183 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 2398 / 4270 (56.2%) |
| code lines touched / total | 1210 / 2560 (47.3%) |
| function body lines touched / total (top-level definitions excluded) | 1187 / 2349 (50.5%) |
| branch nodes (if / match / asserts!) | 232: 134 full, 48 partial, 50 never reached |

## Branches with one arm never taken (48)

| line | function | kind | state |
|---|---|---|---|
| 470 | side-full-y | if | one arm (else only) |
| 482 | side-full-x | if | one arm (else only) |
| 626 | top-y-fold | if | arms not seen |
| 666 | top-x-fold | if | arms not seen |
| 767 | park-tenth-token-y | match | one arm (else only) |
| 769 | park-tenth-token-y | if | arms not seen |
| 774 | park-tenth-token-y | if | one arm (else only) |
| 781 | park-tenth-token-y | match | one arm (else only) |
| 864 | park-tenth-token-x | match | one arm (else only) |
| 866 | park-tenth-token-x | if | arms not seen |
| 871 | park-tenth-token-x | if | one arm (else only) |
| 878 | park-tenth-token-x | match | one arm (else only) |
| 1079 | live-bid-fold | if | one arm (else only) |
| 1101 | live-offer-fold | if | one arm (else only) |
| 1172 | deposit-token-y-core | if | one arm (else only) |
| 1235 | deposit-token-y-core | if | one arm (then only) |
| 1265 | deposit-token-y | if | one arm (then only) |
| 1320 | deposit-token-x-core | if | one arm (else only) |
| 1382 | deposit-token-x-core | if | one arm (then only) |
| 1916 | filter-small-token-y-depositor | if | arms not seen |
| 1965 | filter-small-token-x-depositor | if | arms not seen |
| 2238 | execute-fill | if | one arm (then only) |
| 2250 | execute-fill | if | one arm (else only) |
| 2282 | execute-fill | if | one arm (else only) |
| 2289 | execute-fill | if | one arm (then only) |
| 2297 | execute-fill | if | one arm (then only) |
| 2359 | execute-fill | if | one arm (else only) |
| 2407 | walk-x-book-step | match | one arm (then only) |
| 2449 | walk-y-book-step | match | one arm (then only) |
| 2919 | execute-settlement | if | one arm (else only) |
| 2929 | execute-settlement | if | one arm (then only) |
| 2933 | execute-settlement | if | one arm (then only) |
| 2956 | execute-settlement | if | one arm (then only) |
| 2962 | execute-settlement | if | one arm (then only) |
| 3007 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3011 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3036 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3044 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3053 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3103 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3107 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3132 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3140 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3146 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3411 | get-taker-capacity | if | one arm (then only) |
| 3415 | get-taker-capacity | if | one arm (then only) |
| 3419 | get-taker-capacity | if | one arm (then only) |
| 3423 | get-taker-capacity | if | one arm (then only) |

## Branch nodes never reached (50)

| line | function | kind |
|---|---|---|
| 499 | find-smallest-token-y-fold | if |
| 519 | find-smallest-token-x-fold | if |
| 556 | top-y-insert | if |
| 582 | top-x-insert | if |
| 607 | top-y-fold | if |
| 618 | top-y-fold | if |
| 647 | top-x-fold | if |
| 658 | top-x-fold | if |
| 690 | smallest-outside-y-fold | if |
| 697 | smallest-outside-y-fold | if |
| 716 | first-off-y-fold | if |
| 730 | first-off-x-fold | if |
| 771 | park-tenth-token-y | if |
| 782 | park-tenth-token-y | if |
| 805 | smallest-outside-x-fold | if |
| 812 | smallest-outside-x-fold | if |
| 868 | park-tenth-token-x | if |
| 879 | park-tenth-token-x | if |
| 1456 | cancel-token-y-deposit | if |
| 1507 | cancel-token-x-deposit | if |
| 1570 | withdraw-token-y | asserts! |
| 1574 | withdraw-token-y | if |
| 1621 | withdraw-token-x | asserts! |
| 1625 | withdraw-token-x | if |
| 1658 | readmit-token-y | asserts! |
| 1694 | readmit-token-x | asserts! |
| 1725 | set-token-y-limit | asserts! |
| 1726 | set-token-y-limit | asserts! |
| 1733 | set-token-y-limit | if |
| 1760 | set-token-x-limit | asserts! |
| 1761 | set-token-x-limit | asserts! |
| 1768 | set-token-x-limit | if |
| 1802 | reprice-or-swap-token-y | asserts! |
| 1814 | reprice-or-swap-token-y | if |
| 1860 | reprice-or-swap-token-x | asserts! |
| 1872 | reprice-or-swap-token-x | if |
| 3068 | distribute-to-token-y-depositor | if |
| 3161 | distribute-to-token-x-depositor | if |
| 3264 | set-treasury | asserts! |
| 3271 | set-paused | asserts! |
| 3278 | set-operator | asserts! |
| 3285 | set-min-token-y-deposit | asserts! |
| 3293 | set-min-token-x-deposit | asserts! |
| 3301 | set-distance-slots | asserts! |
| 3326 | cap-bid-fold | if |
| 3328 | cap-bid-fold | if |
| 3354 | cap-ask-fold | if |
| 3356 | cap-ask-fold | if |
| 3373 | gross-up | if |
| 3443 | prune-one | asserts! |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 3, 4, 5, 7, 10, 11, 13, 15, 17, 18, 20, 22, 23, 24, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 61, 62, 63, 64, 65, 72, 73, 83, 84, 85, 87, 88, 89, 90, 94, 105, 114, 120, 131, 147, 149, 150, 151, 152, 153, 154, 155, 156, 158, 159, 160, 161, 162, 163, 165, 166, 167, 168, 170, 172, 174, 175, 176, 177, 179, 187, 195, 200, 205, 213, 225, 232, 240, 244, 249, 252, 256, 260, 269, 273, 285, 297, 301, 305, 312, 321, 330, 334, 338, 355, 368, 379, 390, 398, 413, 425, 442, 454, 465, 477, 489, 509, 538, 564, 594, 634, 678, 707, 721, 736, 793, 833, 890, 918, 947, 990, 1072, 1094, 1116, 1132, 1148, 1251, 1297, 1398, 1442, 1493, 1544, 1595, 1646, 1682, 1718, 1753, 1788, 1846, 2094, 2145, 2216, 2394, 2436, 2478, 2491, 2498, 2524, 2550, 2594, 2638, 2654, 2670, 2690, 2710, 2777, 2844, 2993, 3089, 3185, 3234, 3312, 3340, 3380, 3438 |
| pick-feed | 947, 948, 953, 954, 955, 956, 957, 958, 959, 960, 961, 962, 964, 966, 971, 972, 973, 974, 975, 976, 977, 978, 979 |
| deposit-token-x-core | 1297, 1298, 1299, 1300, 1301, 1302, 1303, 1304, 1324, 1328, 1329, 1335, 1339, 1341, 1362, 1363 |
| reprice-or-swap-token-y | 1788, 1789, 1790, 1791, 1792, 1793, 1794, 1795, 1797, 1799, 1802, 1813, 1814, 1821, 1822, 1826 |
| reprice-or-swap-token-x | 1846, 1847, 1848, 1849, 1850, 1851, 1852, 1853, 1855, 1857, 1860, 1871, 1872, 1879, 1880, 1886 |
| park-tenth-token-y | 736, 737, 738, 739, 740, 741, 743, 747, 749, 760, 768, 770, 771, 775 |
| park-tenth-token-x | 833, 834, 835, 836, 837, 838, 840, 844, 846, 857, 865, 867, 868, 872 |
| deposit-token-y-core | 1148, 1149, 1150, 1151, 1152, 1153, 1154, 1155, 1176, 1180, 1181, 1188, 1192, 1194 |
| shape-feed | 990, 991, 996, 997, 998, 999, 1000, 1001, 1002, 1003, 1004, 1005, 1007 |
| execute-fill | 2216, 2217, 2218, 2219, 2220, 2221, 2222, 2223, 2224, 2225, 2226, 2283, 2360 |
| cancel-token-x-deposit | 1493, 1494, 1495, 1497, 1500, 1507, 1508, 1513, 1515, 1519, 1536, 1538 |
| cancel-token-y-deposit | 1442, 1443, 1444, 1446, 1449, 1456, 1457, 1462, 1468, 1485, 1487 |
| withdraw-token-x | 1595, 1596, 1597, 1598, 1600, 1603, 1605, 1625, 1626, 1640, 1642 |
| execute-settlement | 2844, 2845, 2846, 2855, 2864, 2865, 2866, 2867, 2941, 2942, 2965 |
| withdraw-token-y | 1544, 1545, 1546, 1547, 1549, 1552, 1554, 1574, 1575, 1591 |
| readmit-token-y | 1646, 1647, 1648, 1650, 1656, 1658, 1668, 1674, 1676, 1678 |
| readmit-token-x | 1682, 1683, 1684, 1686, 1692, 1694, 1704, 1710, 1712, 1714 |
| get-taker-capacity | 3380, 3381, 3382, 3383, 3385, 3413, 3417, 3425, 3427, 3433 |
| top-y-fold | 594, 595, 596, 599, 600, 609, 619, 627, 628 |
| top-x-fold | 634, 635, 636, 639, 640, 649, 659, 667, 668 |
| park-token-y | 890, 891, 892, 893, 894, 897, 900, 913, 915 |
| park-token-x | 918, 919, 920, 921, 922, 925, 928, 941, 943 |
| deposit-token-y | 1251, 1252, 1253, 1254, 1255, 1256, 1257, 1267, 1290 |
| deposit-token-x | 1398, 1399, 1400, 1401, 1402, 1403, 1404, 1434, 1435 |
| swap | 2145, 2146, 2147, 2148, 2149, 2150, 2151, 2152, 2153 |
| set-token-y-limit | 1718, 1719, 1720, 1725, 1726, 1727, 1749, 1750 |
| set-token-x-limit | 1753, 1754, 1755, 1760, 1761, 1762, 1784, 1785 |
| distribute-to-token-y-depositor | 2993, 2994, 2995, 2997, 3066, 3067, 3068, 3069 |
| distribute-to-token-x-depositor | 3089, 3090, 3091, 3093, 3159, 3160, 3161, 3162 |
| cross-remainder-as-x | 2777, 2778, 2779, 2780, 2781, 2784, 2817, 2830 |
| smallest-outside-y-fold | 678, 679, 680, 683, 684, 690, 700 |
| smallest-outside-x-fold | 793, 794, 795, 798, 799, 805, 815 |
| initialize | 3234, 3235, 3236, 3237, 3238, 3239, 3240 |
| cross-remainder-as-y | 2710, 2711, 2712, 2713, 2714, 2717 |
| top-y-insert | 538, 539, 543, 544, 548 |
| top-x-insert | 564, 565, 569, 570, 574 |
| filter-small-token-y-depositor | 1917, 1918, 1925, 1945, 1947 |
| filter-small-token-x-depositor | 1966, 1967, 1974, 1994, 1996 |
| roll-and-sweep-dust | 3185, 3186, 3187, 3188, 3189 |
| settle-with-refresh | 2094, 2095, 2096, 2097, 2098 |
| walk-x-book-step | 2394, 2395, 2396, 2398, 2432 |
| insert-ask-step | 2498, 2499, 2503, 2504, 2508 |
| walk-y-book-step | 2436, 2437, 2438, 2440, 2474 |
| insert-bid-step | 2524, 2525, 2529, 2530, 2534 |
| prune-one | 3438, 3439, 3440, 3446, 3447 |
| pegged-bid | 338, 339, 340, 341 |
| pegged-ask | 355, 356, 357, 358 |
| find-smallest-token-y-fold | 489, 490, 491, 493 |
| find-smallest-token-x-fold | 509, 510, 511, 513 |
| first-off-y-fold | 707, 708, 709, 711 |
| first-off-x-fold | 721, 722, 723, 725 |
| live-bid-fold | 1072, 1073, 1074, 1084 |
| live-offer-fold | 1094, 1095, 1096, 1106 |
| collect-ask-step | 2550, 2551, 2552, 2556 |
| sorted-asks | 2638, 2639, 2640, 2641 |
| collect-bid-step | 2594, 2595, 2596, 2600 |
| sorted-bids | 2654, 2655, 2656, 2657 |
| cap-bid-fold | 3312, 3313, 3314, 3331 |
| cap-ask-fold | 3340, 3341, 3342, 3359 |
| with-seat | 94, 95, 96 |
| get-token-y-deposit | 273, 274, 275 |
| get-token-x-deposit | 285, 286, 287 |
| order-y-price | 368, 369, 370 |
| order-x-price | 379, 380, 381 |
| token-y-limit-at | 390, 391, 392 |
| token-x-limit-at | 398, 399, 400 |
| count-seated-fold | 442, 443, 444 |
| side-full-y | 465, 467, 471 |
| side-full-x | 477, 479, 483 |
| push-quote | 2478, 2479, 2483 |
| would-take-as-x | 1116, 1117, 1123 |
| would-take-as-y | 1132, 1133, 1139 |
| swap-result-y | 2690, 2691, 2697 |
| swap-result-x | 2670, 2671, 2677 |
| token-y-deposit-limits | 227, 229 |
| token-x-deposit-limits | 234, 236 |
| get-settlement | 269, 270 |
| get-token-y-limit | 330, 331 |
| get-token-x-limit | 334, 335 |
| log-peg-y-if | 413, 414 |
| log-peg-x-if | 425, 426 |
| seated-on | 454, 455 |
| gross-up | 3373, 3374 |
| get-taker-rebate-bps | 7 |
| ERR_DEPOSIT_TOO_SMALL | 33 |
| ERR_ALREADY_SETTLED | 34 |
| ERR_STALE_PRICE | 35 |
| ERR_PRICE_UNCERTAIN | 36 |
| ERR_NOTHING_TO_WITHDRAW | 37 |
| ERR_ZERO_PRICE | 38 |
| ERR_PAUSED | 39 |
| ERR_NOT_AUTHORIZED | 40 |
| ERR_NOTHING_TO_SETTLE | 41 |
| ERR_QUEUE_FULL | 42 |
| ERR_LIMIT_REQUIRED | 43 |
| ERR_ALREADY_INITIALIZED | 44 |
| ERR_WRONG_TRAIT | 45 |
| ERR_EXPO_MISMATCH | 46 |
| ERR_NOTHING_FILLED | 47 |
| ERR_MUST_USE_SWAP | 48 |
| ERR_PARTIAL_FILL | 49 |
| ERR_HAS_RESTING_POSITION | 50 |
| ERR_ZERO_MIN_DEPOSIT | 51 |
| ERR_TAKER_TOO_SMALL | 52 |
| ERR_NOTHING_TO_READMIT | 53 |
| ERR_FEED_MISSING | 54 |
| ERR_USE_CANCEL | 55 |
| ERR_FEED_TIMESTAMP_MISSING | 56 |
| ERR_BAD_SPREAD | 57 |
| ERR_CYCLE_OPEN | 58 |
| ERR_NOT_A_SEAT | 59 |
| get-distance-slots | 73 |
| seated-x | 84 |
| seated-y | 85 |
| get-seated-x | 87 |
| get-seated-y | 88 |
| is-protected-x | 89 |
| is-protected-y | 90 |
| refresh-seat-count | 105 |
| sync-seat-count | 114 |
| prune-seats | 120 |
| sync-seat | 131 |
| token-y-deposits | 180 |
| token-x-deposits | 188 |
| token-y-depositor-list | 197 |
| token-x-depositor-list | 202 |
| cycle-totals | 207 |
| settlements | 215 |
| get-token-y-parked | 249 |
| get-token-x-parked | 252 |
| get-current-cycle | 256 |
| get-cycle-totals | 260 |
| get-token-y-depositors | 297 |
| get-token-x-depositors | 301 |
| get-min-deposits | 305 |
| get-token-y-order | 312 |
| get-token-x-order | 321 |
| quote-who | 2491 |
| set-treasury | 3265 |
| set-paused | 3272 |
| set-operator | 3279 |
| set-min-token-y-deposit | 3287 |
| set-min-token-x-deposit | 3295 |
| set-distance-slots | 3303 |
| cap-scale | 3309 |
| prune-cycles | 3452 |
| refresh-mid | 3456 |

## Per simulation (cumulative executed expressions of markets-sbtc-stx-jing-v6)

| sim | txs | before | after |
|---|---|---|---|
| `4ccb83ee` | 166 | 0 | 3490 |
| `908a895c` | 44 | 3490 | 3663 |
| `98965765` | 17 | 3663 | 3675 |
| `ef2ed5c1` | 31 | 3675 | 3683 |
| `9ce42eb1` | 18 | 3683 | 3816 |
| `a7ccab31` | 48 | 3816 | 4009 |
| `5aa3e49f` | 77 | 4009 | 4072 |
| `8084a860` | 70 | 4072 | 4210 |
| `dda78b56` | 59 | 4210 | 4249 |
| `179b8bc7` | 35 | 4249 | 4253 |
| `091acd48` | 42 | 4253 | 4256 |
| `cc8d690b` | 38 | 4256 | 4301 |
| `802a3103` | 29 | 4301 | 4302 |
| `918d5678` | 121 | 4302 | 4309 |
| `6256d0b4` | 143 | 4309 | 4343 |
| `62783a57` | 17 | 4343 | 4343 |
| `a19bb24c` | 59 | 4343 | 5599 |
| `c663e202` | 22 | 5599 | 5599 |
| `52b52f6f` | 23 | 5599 | 5599 |
| `bc321d10` | 119 | 5599 | 5654 |
| `20727cf8` | 122 | 5654 | 5664 |
| `e5d2399d` | 18 | 5664 | 5723 |
| `5ba21f23` | 32 | 5723 | 5726 |
| `40829b83` | 32 | 5726 | 5729 |
| `dc165127` | 34 | 5729 | 5729 |
| `7184028e` | 34 | 5729 | 5729 |
| `868ef1fe` | 128 | 5729 | 5730 |
| `879657b5` | 94 | 5730 | 5941 |
| `dc770f07` | 45 | 5941 | 5941 |
| `f3db741b` | 29 | 5941 | 5941 |
| `d1213248` | 109 | 5941 | 6054 |
