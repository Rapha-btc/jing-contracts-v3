# Trace coverage: markets-sbtc-stx-jing-v6

From `simulations/trace-coverage.mjs` on 2026-09-15: 31 simulations, 1856 transactions (184 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 2453 / 4268 (57.5%) |
| code lines touched / total | 1306 / 2558 (51.1%) |
| branch nodes (if / match / asserts!) | 231: 211 full, 18 partial, 2 never reached |

## Branches with one arm never taken (18)

| line | function | kind | state |
|---|---|---|---|
| 765 | park-tenth-token-y | if | one arm (else only) |
| 769 | park-tenth-token-y | match | one arm (then only) |
| 770 | park-tenth-token-y | if | one arm (else only) |
| 777 | park-tenth-token-y | match | one arm (then only) |
| 778 | park-tenth-token-y | if | one arm (then only) |
| 867 | park-tenth-token-x | if | one arm (else only) |
| 874 | park-tenth-token-x | match | one arm (then only) |
| 875 | park-tenth-token-x | if | one arm (else only) |
| 1168 | deposit-token-y-core | if | one arm (else only) |
| 2285 | execute-fill | if | one arm (then only) |
| 2403 | walk-x-book-step | match | one arm (then only) |
| 2411 | walk-x-book-step | if | one arm (else only) |
| 2445 | walk-y-book-step | match | one arm (then only) |
| 3003 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3007 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3099 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3103 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3369 | gross-up | if | one arm (else only) |

## Branch nodes never reached (2)

| line | function | kind |
|---|---|---|
| 495 | find-smallest-token-y-fold | if |
| 1179 | deposit-token-y-core | asserts! |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 3, 4, 5, 7, 10, 11, 13, 15, 17, 18, 20, 22, 23, 24, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 61, 62, 63, 64, 65, 72, 73, 83, 84, 85, 87, 88, 89, 90, 94, 105, 114, 120, 131, 147, 149, 150, 151, 152, 153, 154, 155, 156, 158, 159, 160, 161, 162, 163, 165, 166, 167, 168, 170, 172, 174, 175, 176, 177, 179, 187, 195, 200, 205, 213, 225, 232, 240, 244, 249, 252, 256, 260, 269, 273, 285, 297, 301, 305, 312, 321, 330, 334, 338, 351, 364, 375, 386, 394, 402, 409, 421, 432, 438, 450, 461, 473, 485, 505, 525, 529, 534, 560, 590, 630, 674, 703, 717, 732, 789, 829, 886, 914, 943, 986, 1018, 1051, 1068, 1090, 1112, 1128, 1144, 1247, 1293, 1394, 1438, 1489, 1540, 1591, 1642, 1678, 1714, 1749, 1784, 1842, 1902, 1951, 2000, 2045, 2090, 2141, 2212, 2390, 2432, 2474, 2487, 2494, 2520, 2546, 2590, 2634, 2650, 2666, 2686, 2706, 2773, 2840, 2989, 3085, 3181, 3230, 3258, 3265, 3272, 3279, 3287, 3295, 3304, 3308, 3336, 3364, 3376, 3434, 3447, 3451 |
| deposit-token-y-core | 1144, 1145, 1146, 1147, 1148, 1149, 1150, 1151, 1169, 1170, 1172, 1176, 1177, 1179, 1182, 1183, 1184, 1186, 1187, 1188, 1189, 1190, 1193, 1197, 1201, 1203, 1207, 1208, 1210, 1211, 1212, 1214 |
| pick-feed | 943, 944, 949, 950, 951, 952, 953, 954, 955, 956, 957, 958, 960, 962, 967, 968, 969, 970, 971, 972, 973, 974, 975, 976 |
| shape-feed | 986, 987, 992, 993, 994, 995, 996, 997, 998, 999, 1000, 1001, 1003 |
| execute-fill | 2212, 2213, 2214, 2215, 2216, 2217, 2218, 2219, 2220, 2221, 2222 |
| park-tenth-token-y | 732, 733, 734, 735, 736, 737, 766, 771, 774 |
| deposit-token-x | 1394, 1395, 1396, 1397, 1398, 1399, 1400, 1430, 1431 |
| swap | 2141, 2142, 2143, 2144, 2145, 2146, 2147, 2148, 2149 |
| park-tenth-token-x | 829, 830, 831, 832, 833, 834, 868, 876 |
| deposit-token-x-core | 1293, 1294, 1295, 1296, 1297, 1298, 1299, 1300 |
| execute-settlement | 2840, 2841, 2842, 2851, 2860, 2861, 2862, 2863 |
| reprice-or-swap-token-y | 1784, 1785, 1786, 1787, 1788, 1789, 1790, 1791 |
| reprice-or-swap-token-x | 1842, 1843, 1844, 1845, 1846, 1847, 1848, 1849 |
| initialize | 3230, 3231, 3232, 3233, 3234, 3235, 3236, 3237 |
| find-smallest-token-y-fold | 485, 486, 487, 489, 494, 495, 496 |
| deposit-token-y | 1247, 1248, 1249, 1250, 1251, 1252, 1253 |
| smallest-outside-y-fold | 674, 675, 676, 679, 680, 682 |
| smallest-outside-x-fold | 789, 790, 791, 794, 795, 797 |
| settle-with-refresh | 2090, 2091, 2092, 2093, 2094, 2095 |
| walk-x-book-step | 2390, 2391, 2392, 2394, 2419, 2428 |
| cross-remainder-as-y | 2706, 2707, 2708, 2709, 2710, 2713 |
| cross-remainder-as-x | 2773, 2774, 2775, 2776, 2777, 2780 |
| top-y-insert | 534, 535, 539, 540, 544 |
| top-x-insert | 560, 561, 565, 566, 570 |
| top-y-fold | 590, 591, 592, 595, 596 |
| top-x-fold | 630, 631, 632, 635, 636 |
| first-off-y-fold | 703, 704, 705, 707, 708 |
| first-off-x-fold | 717, 718, 719, 721, 722 |
| park-token-y | 886, 887, 888, 889, 890 |
| park-token-x | 914, 915, 916, 917, 918 |
| withdraw-token-y | 1540, 1541, 1542, 1543, 1547 |
| withdraw-token-x | 1591, 1592, 1593, 1594, 1598 |
| roll-and-sweep-dust | 3181, 3182, 3183, 3184, 3185 |
| insert-ask-step | 2494, 2495, 2499, 2500, 2504 |
| walk-y-book-step | 2432, 2433, 2434, 2436, 2470 |
| insert-bid-step | 2520, 2521, 2525, 2526, 2530 |
| pegged-bid | 338, 339, 340, 341 |
| pegged-ask | 351, 352, 353, 354 |
| order-y-price | 364, 365, 366, 367 |
| order-x-price | 375, 376, 377, 378 |
| count-seated-fold | 438, 439, 440, 441 |
| find-smallest-token-x-fold | 505, 506, 507, 509 |
| cancel-token-y-deposit | 1438, 1439, 1440, 1444 |
| cancel-token-x-deposit | 1489, 1490, 1491, 1495 |
| set-token-y-limit | 1714, 1715, 1716, 1717 |
| set-token-x-limit | 1749, 1750, 1751, 1752 |
| distribute-to-token-y-depositor | 2989, 2990, 2991, 2993 |
| distribute-to-token-x-depositor | 3085, 3086, 3087, 3089 |
| collect-ask-step | 2546, 2547, 2548, 2552 |
| sorted-asks | 2634, 2635, 2636, 2637 |
| collect-bid-step | 2590, 2591, 2592, 2596 |
| sorted-bids | 2650, 2651, 2652, 2653 |
| get-taker-capacity | 3376, 3377, 3378, 3379 |
| with-seat | 94, 95, 96 |
| get-token-y-deposit | 273, 274, 275 |
| get-token-x-deposit | 285, 286, 287 |
| token-y-limit-at | 386, 387, 388 |
| token-x-limit-at | 394, 395, 396 |
| log-peg-y-if | 409, 410, 411 |
| log-peg-x-if | 421, 422, 423 |
| seated-on | 450, 451, 452 |
| side-full-y | 461, 462, 463 |
| side-full-x | 473, 474, 475 |
| push-quote | 2474, 2475, 2479 |
| live-bid-fold | 1068, 1069, 1070 |
| live-offer-fold | 1090, 1091, 1092 |
| would-take-as-x | 1112, 1113, 1114 |
| would-take-as-y | 1128, 1129, 1130 |
| readmit-token-y | 1642, 1643, 1644 |
| readmit-token-x | 1678, 1679, 1680 |
| swap-result-y | 2686, 2687, 2693 |
| swap-result-x | 2666, 2667, 2673 |
| cap-bid-fold | 3308, 3309, 3310 |
| cap-ask-fold | 3336, 3337, 3338 |
| prune-one | 3434, 3435, 3436 |
| token-y-deposit-limits | 227, 229 |
| token-x-deposit-limits | 234, 236 |
| get-settlement | 269, 270 |
| get-token-y-limit | 330, 331 |
| get-token-x-limit | 334, 335 |
| gross-up | 3364, 3370 |
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
| valid-spread | 402 |
| advance-cycle | 432 |
| not-eq-bumped-token-y | 525 |
| not-eq-bumped-token-x | 529 |
| quote-who | 2487 |
| lazer-feeds | 1018 |
| fresh-classification-price | 1051 |
| filter-limit-violating-token-y-depositor | 2000 |
| filter-limit-violating-token-x-depositor | 2045 |
| filter-small-token-y-depositor | 1902 |
| filter-small-token-x-depositor | 1951 |
| set-treasury | 3258 |
| set-paused | 3265 |
| set-operator | 3272 |
| set-min-token-y-deposit | 3279 |
| set-min-token-x-deposit | 3287 |
| set-distance-slots | 3295 |
| cap-scale | 3304 |
| prune-cycles | 3447 |
| refresh-mid | 3451 |

## Per simulation (cumulative executed expressions of markets-sbtc-stx-jing-v6)

| sim | txs | before | after |
|---|---|---|---|
| `4ccb83ee` | 166 | 0 | 2532 |
| `908a895c` | 44 | 2532 | 2777 |
| `98965765` | 17 | 2777 | 2789 |
| `ef2ed5c1` | 31 | 2789 | 2797 |
| `9ce42eb1` | 18 | 2797 | 2937 |
| `a7ccab31` | 48 | 2937 | 3129 |
| `5aa3e49f` | 77 | 3129 | 3238 |
| `8084a860` | 70 | 3238 | 3326 |
| `dda78b56` | 59 | 3326 | 3401 |
| `179b8bc7` | 35 | 3401 | 3406 |
| `091acd48` | 42 | 3406 | 3410 |
| `cc8d690b` | 38 | 3410 | 3439 |
| `802a3103` | 29 | 3439 | 3440 |
| `918d5678` | 121 | 3440 | 3720 |
| `6256d0b4` | 143 | 3720 | 4091 |
| `62783a57` | 17 | 4091 | 4091 |
| `dcb34a07` | 60 | 4091 | 4091 |
| `c663e202` | 22 | 4091 | 4091 |
| `52b52f6f` | 23 | 4091 | 4091 |
| `bc321d10` | 119 | 4091 | 4159 |
| `20727cf8` | 122 | 4159 | 4169 |
| `e5d2399d` | 18 | 4169 | 4230 |
| `5ba21f23` | 32 | 4230 | 4233 |
| `40829b83` | 32 | 4233 | 4236 |
| `dc165127` | 34 | 4236 | 4236 |
| `7184028e` | 34 | 4236 | 4236 |
| `868ef1fe` | 128 | 4236 | 4284 |
| `879657b5` | 94 | 4284 | 4495 |
| `dc770f07` | 45 | 4495 | 4495 |
| `f3db741b` | 29 | 4495 | 4495 |
| `d1213248` | 109 | 4495 | 4653 |
