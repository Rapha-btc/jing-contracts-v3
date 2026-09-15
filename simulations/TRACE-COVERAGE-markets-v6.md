# Trace coverage: markets-sbtc-stx-jing-v6

From `simulations/trace-coverage.mjs` on 2026-09-15, source at c2d475b: 32 simulations, 1887 transactions (189 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 2449 / 4272 (57.3%) |
| code lines touched / total | 1239 / 2562 (48.4%) |
| function body lines touched / total (top-level definitions excluded) | 1210 / 2351 (51.5%) |
| branch nodes (if / match / asserts!) | 233: 125 full, 41 partial, 67 never reached |

## Branches with one arm never taken (41)

| line | function | kind | state |
|---|---|---|---|
| 454 | count-seated-fold | if | one arm (then only) |
| 631 | top-y-fold | if | arms not seen |
| 671 | top-x-fold | if | arms not seen |
| 721 | first-off-y-fold | if | one arm (else only) |
| 735 | first-off-x-fold | if | one arm (else only) |
| 774 | park-tenth-token-y | if | arms not seen |
| 779 | park-tenth-token-y | if | one arm (then only) |
| 787 | park-tenth-token-y | if | one arm (else only) |
| 871 | park-tenth-token-x | if | arms not seen |
| 876 | park-tenth-token-x | if | one arm (then only) |
| 884 | park-tenth-token-x | if | one arm (else only) |
| 1084 | live-bid-fold | if | one arm (then only) |
| 1087 | live-bid-fold | if | one arm (else only) |
| 1109 | live-offer-fold | if | one arm (else only) |
| 1177 | deposit-token-y-core | if | one arm (else only) |
| 1240 | deposit-token-y-core | if | one arm (then only) |
| 1325 | deposit-token-x-core | if | one arm (else only) |
| 1387 | deposit-token-x-core | if | one arm (then only) |
| 1417 | deposit-token-x | if | one arm (else only) |
| 1920 | filter-small-token-y-depositor | if | one arm (else only) |
| 1969 | filter-small-token-x-depositor | if | one arm (else only) |
| 2243 | execute-fill | if | one arm (then only) |
| 2255 | execute-fill | if | one arm (else only) |
| 2294 | execute-fill | if | one arm (then only) |
| 2353 | execute-fill | if | one arm (then only) |
| 2412 | walk-x-book-step | match | one arm (then only) |
| 2454 | walk-y-book-step | match | one arm (then only) |
| 2924 | execute-settlement | if | one arm (else only) |
| 2934 | execute-settlement | if | one arm (then only) |
| 2961 | execute-settlement | if | one arm (then only) |
| 2967 | execute-settlement | if | one arm (then only) |
| 3012 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3041 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3049 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3073 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3108 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3137 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3145 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3166 | distribute-to-token-x-depositor | if | one arm (else only) |
| 3222 | roll-and-sweep-dust | if | one arm (then only) |
| 3412 | get-taker-capacity | if | arms not seen |

## Branch nodes never reached (67)

| line | function | kind |
|---|---|---|
| 504 | find-smallest-token-y-fold | if |
| 524 | find-smallest-token-x-fold | if |
| 561 | top-y-insert | if |
| 587 | top-x-insert | if |
| 612 | top-y-fold | if |
| 623 | top-y-fold | if |
| 652 | top-x-fold | if |
| 663 | top-x-fold | if |
| 695 | smallest-outside-y-fold | if |
| 702 | smallest-outside-y-fold | if |
| 776 | park-tenth-token-y | if |
| 786 | park-tenth-token-y | match |
| 810 | smallest-outside-x-fold | if |
| 817 | smallest-outside-x-fold | if |
| 873 | park-tenth-token-x | if |
| 883 | park-tenth-token-x | match |
| 1459 | cancel-token-y-deposit | asserts! |
| 1460 | cancel-token-y-deposit | asserts! |
| 1461 | cancel-token-y-deposit | if |
| 1510 | cancel-token-x-deposit | asserts! |
| 1511 | cancel-token-x-deposit | asserts! |
| 1512 | cancel-token-x-deposit | if |
| 1560 | withdraw-token-y | if |
| 1566 | withdraw-token-y | if |
| 1574 | withdraw-token-y | asserts! |
| 1575 | withdraw-token-y | asserts! |
| 1579 | withdraw-token-y | if |
| 1611 | withdraw-token-x | if |
| 1617 | withdraw-token-x | if |
| 1625 | withdraw-token-x | asserts! |
| 1626 | withdraw-token-x | asserts! |
| 1630 | withdraw-token-x | if |
| 1665 | readmit-token-y | asserts! |
| 1666 | readmit-token-y | asserts! |
| 1701 | readmit-token-x | asserts! |
| 1702 | readmit-token-x | asserts! |
| 1729 | set-token-y-limit | asserts! |
| 1731 | set-token-y-limit | asserts! |
| 1738 | set-token-y-limit | if |
| 1764 | set-token-x-limit | asserts! |
| 1766 | set-token-x-limit | asserts! |
| 1773 | set-token-x-limit | if |
| 1806 | reprice-or-swap-token-y | asserts! |
| 1807 | reprice-or-swap-token-y | asserts! |
| 1809 | reprice-or-swap-token-y | asserts! |
| 1819 | reprice-or-swap-token-y | if |
| 1864 | reprice-or-swap-token-x | asserts! |
| 1865 | reprice-or-swap-token-x | asserts! |
| 1867 | reprice-or-swap-token-x | asserts! |
| 1877 | reprice-or-swap-token-x | if |
| 1921 | filter-small-token-y-depositor | if |
| 1970 | filter-small-token-x-depositor | if |
| 3291 | set-min-token-y-deposit | asserts! |
| 3299 | set-min-token-x-deposit | asserts! |
| 3307 | set-distance-slots | asserts! |
| 3331 | cap-bid-fold | if |
| 3333 | cap-bid-fold | if |
| 3359 | cap-ask-fold | if |
| 3361 | cap-ask-fold | if |
| 3378 | gross-up | if |
| 3395 | get-taker-capacity | if |
| 3405 | get-taker-capacity | if |
| 3416 | get-taker-capacity | if |
| 3420 | get-taker-capacity | if |
| 3424 | get-taker-capacity | if |
| 3428 | get-taker-capacity | if |
| 3448 | prune-one | asserts! |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 3, 4, 5, 7, 10, 11, 13, 15, 17, 18, 20, 22, 23, 24, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 61, 62, 63, 64, 65, 72, 73, 83, 84, 85, 87, 88, 89, 90, 94, 105, 114, 120, 131, 147, 149, 150, 151, 152, 153, 154, 155, 156, 158, 159, 160, 161, 162, 163, 165, 166, 167, 168, 170, 172, 174, 175, 176, 177, 179, 187, 195, 200, 205, 213, 225, 232, 240, 244, 249, 252, 256, 260, 269, 273, 285, 297, 301, 305, 312, 321, 330, 334, 338, 355, 373, 384, 395, 403, 447, 470, 482, 494, 514, 543, 569, 599, 639, 683, 712, 726, 741, 798, 838, 895, 923, 952, 995, 1077, 1099, 1153, 1256, 1302, 1403, 1447, 1498, 1549, 1600, 1651, 1687, 1723, 1758, 1793, 1851, 2099, 2150, 2221, 2399, 2441, 2483, 2503, 2529, 2555, 2599, 2675, 2695, 2715, 2782, 2849, 2998, 3094, 3190, 3239, 3313, 3317, 3345, 3385, 3443, 3460 |
| pick-feed | 952, 953, 958, 959, 960, 961, 962, 963, 964, 965, 966, 967, 969, 971, 976, 977, 978, 979, 980, 981, 982, 983, 984 |
| reprice-or-swap-token-y | 1793, 1794, 1795, 1796, 1797, 1798, 1799, 1800, 1804, 1806, 1807, 1819, 1826, 1830, 1834, 1840 |
| cancel-token-x-deposit | 1498, 1499, 1500, 1504, 1505, 1506, 1512, 1520, 1522, 1526, 1532, 1537, 1540, 1541, 1543 |
| reprice-or-swap-token-x | 1851, 1852, 1853, 1854, 1855, 1856, 1857, 1858, 1862, 1864, 1865, 1877, 1890, 1894, 1900 |
| deposit-token-x-core | 1302, 1303, 1304, 1305, 1307, 1308, 1309, 1327, 1340, 1345, 1346, 1357, 1363, 1367 |
| cancel-token-y-deposit | 1447, 1448, 1449, 1453, 1454, 1455, 1467, 1469, 1471, 1481, 1486, 1489, 1490, 1492 |
| shape-feed | 995, 996, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1012 |
| deposit-token-y-core | 1153, 1154, 1155, 1156, 1158, 1159, 1160, 1179, 1198, 1199, 1210, 1216, 1220 |
| get-taker-capacity | 3385, 3387, 3388, 3391, 3395, 3405, 3416, 3417, 3418, 3420, 3428, 3434, 3438 |
| withdraw-token-y | 1549, 1550, 1551, 1552, 1556, 1559, 1577, 1579, 1581, 1587, 1594, 1596 |
| withdraw-token-x | 1600, 1601, 1602, 1603, 1607, 1610, 1628, 1630, 1632, 1638, 1645, 1647 |
| park-token-y | 895, 896, 897, 903, 905, 910, 912, 914, 918, 920 |
| park-token-x | 923, 924, 925, 931, 933, 938, 940, 942, 946, 948 |
| readmit-token-y | 1651, 1652, 1653, 1655, 1660, 1667, 1673, 1676, 1681, 1683 |
| readmit-token-x | 1687, 1688, 1689, 1691, 1696, 1703, 1709, 1712, 1717, 1719 |
| park-tenth-token-y | 741, 742, 743, 744, 754, 765, 775, 776, 788 |
| park-tenth-token-x | 838, 839, 840, 841, 851, 862, 872, 873, 885 |
| deposit-token-x | 1403, 1404, 1405, 1406, 1407, 1408, 1409, 1421, 1440 |
| set-token-y-limit | 1723, 1724, 1728, 1729, 1731, 1732, 1734, 1754, 1755 |
| execute-fill | 2221, 2222, 2223, 2224, 2225, 2226, 2227, 2229, 2230 |
| top-y-fold | 599, 600, 601, 604, 605, 620, 632, 633 |
| top-x-fold | 639, 640, 641, 644, 645, 660, 672, 673 |
| deposit-token-y | 1256, 1257, 1258, 1259, 1260, 1261, 1262, 1295 |
| execute-settlement | 2849, 2850, 2851, 2860, 2869, 2870, 2871, 2872 |
| cross-remainder-as-x | 2782, 2784, 2785, 2786, 2789, 2824, 2830, 2835 |
| smallest-outside-y-fold | 683, 684, 685, 688, 695, 703, 705 |
| smallest-outside-x-fold | 798, 799, 800, 803, 810, 818, 820 |
| set-token-x-limit | 1758, 1759, 1764, 1766, 1767, 1769, 1790 |
| filter-small-token-y-depositor | 1922, 1924, 1930, 1935, 1949, 1950, 1952 |
| filter-small-token-x-depositor | 1971, 1973, 1979, 1984, 1998, 1999, 2001 |
| swap | 2150, 2151, 2152, 2153, 2154, 2156, 2157 |
| first-off-y-fold | 712, 713, 714, 716, 717, 722 |
| first-off-x-fold | 726, 727, 728, 730, 731, 736 |
| roll-and-sweep-dust | 3190, 3191, 3192, 3193, 3194, 3224 |
| initialize | 3239, 3240, 3241, 3242, 3244, 3245 |
| find-smallest-token-y-fold | 494, 495, 496, 498, 505 |
| find-smallest-token-x-fold | 514, 515, 516, 518, 525 |
| top-y-insert | 543, 544, 548, 549, 566 |
| top-x-insert | 569, 570, 574, 575, 592 |
| walk-x-book-step | 2399, 2400, 2401, 2403, 2437 |
| cross-remainder-as-y | 2715, 2717, 2718, 2719, 2722 |
| walk-y-book-step | 2441, 2442, 2443, 2445, 2479 |
| cap-bid-fold | 3317, 3318, 3319, 3335, 3336 |
| cap-ask-fold | 3345, 3346, 3347, 3363, 3364 |
| pegged-bid | 338, 339, 340, 341 |
| pegged-ask | 355, 356, 357, 358 |
| live-bid-fold | 1077, 1078, 1088, 1092 |
| distribute-to-token-x-depositor | 3094, 3095, 3096, 3167 |
| settle-with-refresh | 2099, 2100, 2101, 2102 |
| insert-ask-step | 2503, 2504, 2508, 2509 |
| collect-ask-step | 2555, 2556, 2557, 2561 |
| insert-bid-step | 2529, 2530, 2534, 2535 |
| collect-bid-step | 2599, 2600, 2601, 2605 |
| with-seat | 94, 95, 96 |
| get-token-y-deposit | 273, 274, 275 |
| get-token-x-deposit | 285, 286, 287 |
| count-seated-fold | 447, 448, 449 |
| live-offer-fold | 1099, 1100, 1114 |
| would-take-as-x | 1127, 1128, 1129 |
| distribute-to-token-y-depositor | 2998, 2999, 3000 |
| set-min-token-y-deposit | 3289, 3291, 3292 |
| set-min-token-x-deposit | 3297, 3299, 3300 |
| set-distance-slots | 3305, 3307, 3308 |
| prune-one | 3443, 3450, 3451 |
| token-y-deposit-limits | 227, 229 |
| token-x-deposit-limits | 234, 236 |
| get-settlement | 269, 270 |
| get-token-y-limit | 330, 331 |
| get-token-x-limit | 334, 335 |
| order-y-price | 373, 374 |
| order-x-price | 384, 385 |
| token-y-limit-at | 395, 397 |
| token-x-limit-at | 403, 405 |
| side-full-y | 470, 472 |
| side-full-x | 482, 484 |
| push-quote | 2483, 2484 |
| swap-result-y | 2695, 2696 |
| sorted-asks | 2644, 2645 |
| swap-result-x | 2675, 2676 |
| sorted-bids | 2660, 2661 |
| set-treasury | 3268, 3270 |
| set-paused | 3275, 3277 |
| set-operator | 3282, 3284 |
| cap-scale | 3313, 3314 |
| gross-up | 3378, 3379 |
| refresh-mid | 3460, 3461 |
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
| seated-on | 460 |

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
| `df9254fb` | 32 | 5729 | 6478 |
| `868ef1fe` | 128 | 6478 | 6479 |
| `879657b5` | 94 | 6479 | 6685 |
| `dc770f07` | 45 | 6685 | 6685 |
| `f3db741b` | 29 | 6685 | 6685 |
| `d1213248` | 109 | 6685 | 6795 |
