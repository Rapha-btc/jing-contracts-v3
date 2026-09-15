# Trace coverage: markets-sbtc-stx-jing-v6

From `simulations/trace-coverage.mjs` on 2026-09-15, source at 296c73f: 30 simulations, 1769 transactions (194 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 2517 / 4272 (58.9%) |
| code lines touched / total | 1341 / 2562 (52.3%) |
| function body lines touched / total (top-level definitions excluded) | 1338 / 2351 (56.9%) |
| branch nodes (if / match / asserts!) | 233: 223 full, 10 partial, 0 never reached |

## Branches with one arm never taken (10)

| line | function | kind | state |
|---|---|---|---|
| 344 | pegged-bid | if | one arm (then only) |
| 362 | pegged-ask | if | one arm (then only) |
| 2294 | execute-fill | if | one arm (then only) |
| 2412 | walk-x-book-step | match | one arm (then only) |
| 2454 | walk-y-book-step | match | one arm (then only) |
| 3012 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3016 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3108 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3112 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3378 | gross-up | if | one arm (else only) |

## Branch nodes never reached (0)

| line | function | kind |
|---|---|---|

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 3, 4, 5, 7, 10, 11, 13, 15, 17, 18, 20, 22, 23, 24, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 61, 62, 63, 64, 65, 72, 73, 83, 84, 85, 87, 88, 89, 90, 94, 105, 114, 120, 131, 147, 149, 150, 151, 152, 153, 154, 155, 156, 158, 159, 160, 161, 162, 163, 165, 166, 167, 168, 170, 172, 174, 175, 176, 177, 179, 187, 195, 200, 205, 213, 225, 232, 240, 244, 249, 252, 256, 260, 269, 273, 285, 297, 301, 305, 312, 321, 330, 334, 338, 355, 373, 384, 395, 403, 411, 418, 430, 441, 447, 459, 470, 482, 494, 514, 534, 538, 543, 569, 599, 639, 683, 712, 726, 741, 798, 838, 895, 923, 952, 995, 1027, 1060, 1077, 1099, 1121, 1137, 1153, 1256, 1302, 1403, 1447, 1498, 1549, 1600, 1651, 1687, 1723, 1758, 1793, 1851, 1911, 1960, 2009, 2054, 2099, 2150, 2221, 2399, 2441, 2483, 2496, 2503, 2529, 2555, 2599, 2643, 2659, 2675, 2695, 2715, 2782, 2849, 2998, 3094, 3190, 3239, 3267, 3274, 3281, 3288, 3296, 3304, 3313, 3317, 3345, 3373, 3385, 3443, 3456, 3460 |
| pick-feed | 952, 953, 958, 959, 960, 961, 962, 963, 964, 965, 966, 967, 969, 971, 976, 977, 978, 979, 980, 981, 982, 983, 984, 985 |
| shape-feed | 995, 996, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1012 |
| execute-fill | 2221, 2222, 2223, 2224, 2225, 2226, 2227, 2228, 2229, 2230, 2231 |
| deposit-token-x | 1403, 1404, 1405, 1406, 1407, 1408, 1409, 1439, 1440 |
| swap | 2150, 2151, 2152, 2153, 2154, 2155, 2156, 2157, 2158 |
| deposit-token-y-core | 1153, 1154, 1155, 1156, 1157, 1158, 1159, 1160 |
| deposit-token-x-core | 1302, 1303, 1304, 1305, 1306, 1307, 1308, 1309 |
| execute-settlement | 2849, 2850, 2851, 2860, 2869, 2870, 2871, 2872 |
| reprice-or-swap-token-y | 1793, 1794, 1795, 1796, 1797, 1798, 1799, 1800 |
| reprice-or-swap-token-x | 1851, 1852, 1853, 1854, 1855, 1856, 1857, 1858 |
| initialize | 3239, 3240, 3241, 3242, 3243, 3244, 3245, 3246 |
| deposit-token-y | 1256, 1257, 1258, 1259, 1260, 1261, 1262 |
| smallest-outside-y-fold | 683, 684, 685, 688, 689, 691 |
| park-tenth-token-y | 741, 742, 743, 744, 745, 746 |
| smallest-outside-x-fold | 798, 799, 800, 803, 804, 806 |
| park-tenth-token-x | 838, 839, 840, 841, 842, 843 |
| settle-with-refresh | 2099, 2100, 2101, 2102, 2103, 2104 |
| cross-remainder-as-y | 2715, 2716, 2717, 2718, 2719, 2722 |
| cross-remainder-as-x | 2782, 2783, 2784, 2785, 2786, 2789 |
| top-y-insert | 543, 544, 548, 549, 553 |
| top-x-insert | 569, 570, 574, 575, 579 |
| top-y-fold | 599, 600, 601, 604, 605 |
| top-x-fold | 639, 640, 641, 644, 645 |
| first-off-y-fold | 712, 713, 714, 716, 717 |
| first-off-x-fold | 726, 727, 728, 730, 731 |
| park-token-y | 895, 896, 897, 898, 899 |
| park-token-x | 923, 924, 925, 926, 927 |
| withdraw-token-y | 1549, 1550, 1551, 1552, 1556 |
| withdraw-token-x | 1600, 1601, 1602, 1603, 1607 |
| roll-and-sweep-dust | 3190, 3191, 3192, 3193, 3194 |
| walk-x-book-step | 2399, 2400, 2401, 2403, 2437 |
| insert-ask-step | 2503, 2504, 2508, 2509, 2513 |
| walk-y-book-step | 2441, 2442, 2443, 2445, 2479 |
| insert-bid-step | 2529, 2530, 2534, 2535, 2539 |
| pegged-bid | 338, 339, 340, 341 |
| pegged-ask | 355, 356, 357, 358 |
| order-y-price | 373, 374, 375, 376 |
| order-x-price | 384, 385, 386, 387 |
| count-seated-fold | 447, 448, 449, 450 |
| find-smallest-token-y-fold | 494, 495, 496, 498 |
| find-smallest-token-x-fold | 514, 515, 516, 518 |
| cancel-token-y-deposit | 1447, 1448, 1449, 1453 |
| cancel-token-x-deposit | 1498, 1499, 1500, 1504 |
| set-token-y-limit | 1723, 1724, 1725, 1726 |
| set-token-x-limit | 1758, 1759, 1760, 1761 |
| distribute-to-token-y-depositor | 2998, 2999, 3000, 3002 |
| distribute-to-token-x-depositor | 3094, 3095, 3096, 3098 |
| collect-ask-step | 2555, 2556, 2557, 2561 |
| sorted-asks | 2643, 2644, 2645, 2646 |
| collect-bid-step | 2599, 2600, 2601, 2605 |
| sorted-bids | 2659, 2660, 2661, 2662 |
| get-taker-capacity | 3385, 3386, 3387, 3388 |
| with-seat | 94, 95, 96 |
| get-token-y-deposit | 273, 274, 275 |
| get-token-x-deposit | 285, 286, 287 |
| token-y-limit-at | 395, 396, 397 |
| token-x-limit-at | 403, 404, 405 |
| log-peg-y-if | 418, 419, 420 |
| log-peg-x-if | 430, 431, 432 |
| seated-on | 459, 460, 461 |
| side-full-y | 470, 471, 472 |
| side-full-x | 482, 483, 484 |
| push-quote | 2483, 2484, 2488 |
| live-bid-fold | 1077, 1078, 1079 |
| live-offer-fold | 1099, 1100, 1101 |
| would-take-as-x | 1121, 1122, 1123 |
| would-take-as-y | 1137, 1138, 1139 |
| readmit-token-y | 1651, 1652, 1653 |
| readmit-token-x | 1687, 1688, 1689 |
| swap-result-y | 2695, 2696, 2702 |
| swap-result-x | 2675, 2676, 2682 |
| cap-bid-fold | 3317, 3318, 3319 |
| cap-ask-fold | 3345, 3346, 3347 |
| prune-one | 3443, 3444, 3445 |
| token-y-deposit-limits | 227, 229 |
| token-x-deposit-limits | 234, 236 |
| get-settlement | 269, 270 |
| get-token-y-limit | 330, 331 |
| get-token-x-limit | 334, 335 |
| gross-up | 3373, 3379 |
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
| valid-spread | 411 |
| advance-cycle | 441 |
| not-eq-bumped-token-y | 534 |
| not-eq-bumped-token-x | 538 |
| quote-who | 2496 |
| lazer-feeds | 1027 |
| fresh-classification-price | 1060 |
| filter-limit-violating-token-y-depositor | 2009 |
| filter-limit-violating-token-x-depositor | 2054 |
| filter-small-token-y-depositor | 1911 |
| filter-small-token-x-depositor | 1960 |
| set-treasury | 3267 |
| set-paused | 3274 |
| set-operator | 3281 |
| set-min-token-y-deposit | 3288 |
| set-min-token-x-deposit | 3296 |
| set-distance-slots | 3304 |
| cap-scale | 3313 |
| prune-cycles | 3456 |
| refresh-mid | 3460 |

## Per simulation (cumulative executed expressions of markets-sbtc-stx-jing-v6)

| sim | txs | before | after |
|---|---|---|---|
| `27ed7a6e` | 174 | 0 | 3612 |
| `b849e557` | 44 | 3612 | 3785 |
| `7c6ff3f1` | 17 | 3785 | 3797 |
| `20aa4a5c` | 31 | 3797 | 3805 |
| `1e101767` | 18 | 3805 | 3938 |
| `250da7f9` | 48 | 3938 | 4131 |
| `08062c79` | 77 | 4131 | 4194 |
| `d35a98ea` | 70 | 4194 | 4332 |
| `021504ee` | 59 | 4332 | 4371 |
| `d4405a31` | 35 | 4371 | 4375 |
| `981c4c03` | 42 | 4375 | 4378 |
| `c59430ec` | 38 | 4378 | 4423 |
| `99f15bff` | 29 | 4423 | 4424 |
| `dd814f5c` | 121 | 4424 | 4431 |
| `f42edd92` | 143 | 4431 | 4465 |
| `cc8fc837` | 17 | 4465 | 4465 |
| `f14101fc` | 59 | 4465 | 4467 |
| `5c063d70` | 18 | 4467 | 4527 |
| `f4f22abe` | 32 | 4527 | 4584 |
| `03519ee6` | 57 | 4584 | 4584 |
| `e17cd8b0` | 22 | 4584 | 4584 |
| `0b2a8e02` | 23 | 4584 | 4584 |
| `677a6c55` | 119 | 4584 | 4586 |
| `59b23d38` | 122 | 4586 | 4596 |
| `93dc4f8c` | 32 | 4596 | 4599 |
| `30745051` | 32 | 4599 | 4602 |
| `910168c4` | 34 | 4602 | 4602 |
| `2683081f` | 34 | 4602 | 4602 |
| `aae15fd0` | 128 | 4602 | 4603 |
| `6ed29637` | 94 | 4603 | 4814 |

## The remaining partial branches, and why they stay

| line | function | why no harness reaches the other arm |
|---|---|---|
| 344, 362 | pegged-bid / pegged-ask | the spread >= BPS_PRECISION guard (06f57a3, found by RV): every transaction path checks `valid-spread` first (u1026), so only a direct read-only call reaches it, and read-only evals leave no trace |
| 2294 | execute-fill | a y-side fee rounding to zero needs a fill under 10,000 uSTX, below the taker minimum |
| 2412, 2454 | walk-x/y-book-step | the fold accumulator's `none` arm: an error state the walk never produces |
| 3012, 3016, 3108, 3112 | distribute-to-token-y/x-depositor | a zero side total while distributing to a depositor of that side: contradictory |
| 3378 | gross-up | the rounding correction when the estimate overshoots by one: a specific-size case, left to the fuzzer |

Every other branch node of the market is exercised on both arms by the runs in the table.
