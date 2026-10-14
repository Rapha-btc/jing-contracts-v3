# Trace coverage: markets-sbtc-stx-jing-v6-3

From `simulations/trace-coverage.mjs` on 2026-10-14, source at simulations/deploy-bytes-mv7dfb/markets-sbtc-stx-jing-v6-3.clar at 7e42b9c: 1 simulations, 217 transactions (14 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 1062 / 4456 (23.8%) |
| code lines touched / total | 614 / 2615 (23.5%) |
| function body lines touched / total (top-level definitions excluded) | 614 / 2506 (24.5%) |
| branch nodes (if / match / asserts!) | 307: 60 full, 65 partial, 182 never reached |

## Branches with one arm never taken (65)

| line | function | kind | state |
|---|---|---|---|
| 11 | rebate-bps-for-age | if | one arm (then only) |
| 106 | with-seat | if | one arm (else only) |
| 424 | order-y-price | match | one arm (else only) |
| 434 | order-x-price | match | one arm (else only) |
| 493 | side-full-y | if | one arm (else only) |
| 506 | side-full-x | if | one arm (else only) |
| 1071 | feed-age | if | one arm (then only) |
| 1200 | put-limit-y | if | one arm (then only) |
| 1200 | put-limit-y | match | one arm (else only) |
| 1232 | deposit-token-y-core | if | one arm (else only) |
| 1283 | deposit-token-y-core | if | one arm (then only) |
| 1334 | deposit-token-y | if | one arm (then only) |
| 1443 | put-limit-x | if | one arm (then only) |
| 1443 | put-limit-x | match | one arm (else only) |
| 1475 | deposit-token-x-core | if | one arm (else only) |
| 1526 | deposit-token-x-core | if | one arm (then only) |
| 1577 | deposit-token-x | if | one arm (then only) |
| 1699 | cancel-token-y-deposit | if | one arm (else only) |
| 1715 | cancel-token-y-deposit | if | one arm (else only) |
| 1728 | cancel-token-y-deposit | if | one arm (then only) |
| 1773 | cancel-token-x-deposit | if | one arm (else only) |
| 1789 | cancel-token-x-deposit | if | one arm (else only) |
| 1802 | cancel-token-x-deposit | if | one arm (then only) |
| 2457 | filter-small-token-y-depositor | if | one arm (else only) |
| 2505 | filter-small-token-x-depositor | if | one arm (else only) |
| 2554 | filter-limit-violating-token-y-depositor | if | one arm (else only) |
| 2598 | filter-limit-violating-token-x-depositor | if | one arm (else only) |
| 2725 | swap | if | one arm (then only) |
| 2729 | swap | if | one arm (then only) |
| 2733 | swap | if | one arm (else only) |
| 2742 | swap | if | one arm (then only) |
| 2752 | swap | if | one arm (then only) |
| 2760 | swap | if | one arm (then only) |
| 2773 | swap | if | one arm (then only) |
| 2804 | swap | if | one arm (then only) |
| 3518 | execute-settlement | if | one arm (then only) |
| 3528 | execute-settlement | if | one arm (then only) |
| 3532 | execute-settlement | if | one arm (then only) |
| 3555 | execute-settlement | if | one arm (then only) |
| 3561 | execute-settlement | if | one arm (then only) |
| 3605 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3609 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3634 | distribute-to-token-y-depositor | if | one arm (else only) |
| 3642 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3651 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3700 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3704 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3729 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3737 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3743 | distribute-to-token-x-depositor | if | one arm (else only) |
| 3758 | distribute-to-token-x-depositor | if | one arm (else only) |
| 3807 | roll-and-sweep-dust | if | one arm (else only) |
| 3813 | roll-and-sweep-dust | if | one arm (else only) |
| 3914 | cap-bid-fold | if | one arm (then only) |
| 3970 | cap-kept-bid-fold | if | one arm (then only) |
| 4029 | get-taker-capacity | match | one arm (then only) |
| 4052 | get-taker-capacity | if | one arm (then only) |
| 4066 | get-taker-capacity | if | one arm (then only) |
| 4070 | get-taker-capacity | if | one arm (then only) |
| 4078 | get-taker-capacity | if | one arm (then only) |
| 4082 | get-taker-capacity | if | one arm (then only) |
| 4086 | get-taker-capacity | if | one arm (then only) |
| 4135 | get-taker-capacity | if | one arm (then only) |
| 4156 | get-taker-capacity | if | one arm (else only) |
| 4165 | get-taker-capacity | if | one arm (then only) |

## Branch nodes never reached (182)

| line | function | kind |
|---|---|---|
| 13 | rebate-bps-for-age | if |
| 394 | pegged-bid | if |
| 398 | pegged-bid | if |
| 409 | pegged-ask | if |
| 413 | pegged-ask | if |
| 473 | count-seated-fold | if |
| 524 | find-smallest-token-y-fold | if |
| 543 | find-smallest-token-x-fold | if |
| 575 | top-y-insert | if |
| 600 | top-x-insert | if |
| 621 | top-y-fold | if |
| 632 | top-y-fold | if |
| 641 | top-y-fold | if |
| 663 | top-x-fold | if |
| 674 | top-x-fold | if |
| 683 | top-x-fold | if |
| 703 | smallest-outside-y-fold | if |
| 710 | smallest-outside-y-fold | if |
| 728 | first-off-y-fold | if |
| 745 | first-off-x-fold | if |
| 789 | park-tenth-token-y | match |
| 791 | park-tenth-token-y | if |
| 793 | park-tenth-token-y | if |
| 795 | park-tenth-token-y | match |
| 796 | park-tenth-token-y | if |
| 805 | park-tenth-token-y | match |
| 806 | park-tenth-token-y | if |
| 828 | smallest-outside-x-fold | if |
| 835 | smallest-outside-x-fold | if |
| 880 | park-tenth-token-x | match |
| 882 | park-tenth-token-x | if |
| 884 | park-tenth-token-x | if |
| 886 | park-tenth-token-x | match |
| 887 | park-tenth-token-x | if |
| 896 | park-tenth-token-x | match |
| 897 | park-tenth-token-x | if |
| 1131 | live-bid-fold | if |
| 1134 | live-bid-fold | if |
| 1151 | live-offer-fold | if |
| 1154 | live-offer-fold | if |
| 1247 | deposit-token-y-core | asserts! |
| 1379 | settle-token-y-deposit | asserts! |
| 1380 | settle-token-y-deposit | asserts! |
| 1381 | settle-token-y-deposit | asserts! |
| 1383 | settle-token-y-deposit | if |
| 1392 | settle-token-y-deposit | if |
| 1400 | settle-token-y-deposit | match |
| 1400 | settle-token-y-deposit | if |
| 1405 | settle-token-y-deposit | match |
| 1411 | settle-token-y-deposit | asserts! |
| 1424 | settle-token-y-deposit | asserts! |
| 1490 | deposit-token-x-core | asserts! |
| 1622 | settle-token-x-deposit | asserts! |
| 1623 | settle-token-x-deposit | asserts! |
| 1624 | settle-token-x-deposit | asserts! |
| 1626 | settle-token-x-deposit | if |
| 1635 | settle-token-x-deposit | if |
| 1643 | settle-token-x-deposit | match |
| 1643 | settle-token-x-deposit | if |
| 1648 | settle-token-x-deposit | match |
| 1654 | settle-token-x-deposit | asserts! |
| 1667 | settle-token-x-deposit | asserts! |
| 1839 | withdraw-token-y | if |
| 1845 | withdraw-token-y | if |
| 1850 | withdraw-token-y | asserts! |
| 1851 | withdraw-token-y | asserts! |
| 1852 | withdraw-token-y | asserts! |
| 1853 | withdraw-token-y | asserts! |
| 1854 | withdraw-token-y | asserts! |
| 1858 | withdraw-token-y | if |
| 1889 | withdraw-token-x | if |
| 1895 | withdraw-token-x | if |
| 1900 | withdraw-token-x | asserts! |
| 1901 | withdraw-token-x | asserts! |
| 1902 | withdraw-token-x | asserts! |
| 1903 | withdraw-token-x | asserts! |
| 1904 | withdraw-token-x | asserts! |
| 1908 | withdraw-token-x | if |
| 1932 | readmit-token-y | asserts! |
| 1933 | readmit-token-y | asserts! |
| 1934 | readmit-token-y | asserts! |
| 1959 | settle-token-y-readmit | asserts! |
| 1960 | settle-token-y-readmit | asserts! |
| 1962 | settle-token-y-readmit | if |
| 1965 | settle-token-y-readmit | if |
| 1967 | settle-token-y-readmit | if |
| 2001 | readmit-token-x | asserts! |
| 2002 | readmit-token-x | asserts! |
| 2003 | readmit-token-x | asserts! |
| 2028 | settle-token-x-readmit | asserts! |
| 2029 | settle-token-x-readmit | asserts! |
| 2031 | settle-token-x-readmit | if |
| 2034 | settle-token-x-readmit | if |
| 2036 | settle-token-x-readmit | if |
| 2071 | set-token-y-limit | asserts! |
| 2072 | set-token-y-limit | asserts! |
| 2073 | set-token-y-limit | asserts! |
| 2080 | set-token-y-limit | if |
| 2117 | settle-token-y-limit | match |
| 2122 | settle-token-y-limit | asserts! |
| 2126 | settle-token-y-limit | if |
| 2136 | settle-token-y-limit | if |
| 2138 | settle-token-y-limit | if |
| 2166 | set-token-x-limit | asserts! |
| 2167 | set-token-x-limit | asserts! |
| 2168 | set-token-x-limit | asserts! |
| 2175 | set-token-x-limit | if |
| 2212 | settle-token-x-limit | match |
| 2217 | settle-token-x-limit | asserts! |
| 2221 | settle-token-x-limit | if |
| 2231 | settle-token-x-limit | if |
| 2233 | settle-token-x-limit | if |
| 2269 | reprice-or-swap-token-y | asserts! |
| 2270 | reprice-or-swap-token-y | asserts! |
| 2271 | reprice-or-swap-token-y | asserts! |
| 2272 | reprice-or-swap-token-y | asserts! |
| 2273 | reprice-or-swap-token-y | asserts! |
| 2274 | reprice-or-swap-token-y | match |
| 2274 | reprice-or-swap-token-y | if |
| 2279 | reprice-or-swap-token-y | if |
| 2318 | reprice-or-swap-token-y | if |
| 2364 | reprice-or-swap-token-x | asserts! |
| 2365 | reprice-or-swap-token-x | asserts! |
| 2366 | reprice-or-swap-token-x | asserts! |
| 2367 | reprice-or-swap-token-x | asserts! |
| 2368 | reprice-or-swap-token-x | asserts! |
| 2369 | reprice-or-swap-token-x | match |
| 2369 | reprice-or-swap-token-x | if |
| 2374 | reprice-or-swap-token-x | if |
| 2415 | reprice-or-swap-token-x | if |
| 2458 | filter-small-token-y-depositor | if |
| 2506 | filter-small-token-x-depositor | if |
| 2640 | settle-with-refresh | asserts! |
| 2641 | settle-with-refresh | asserts! |
| 2768 | swap | if |
| 2834 | execute-fill | if |
| 2841 | execute-fill | if |
| 2846 | execute-fill | if |
| 2853 | execute-fill | if |
| 2859 | execute-fill | if |
| 2868 | execute-fill | if |
| 2876 | execute-fill | if |
| 2885 | execute-fill | if |
| 2892 | execute-fill | if |
| 2900 | execute-fill | if |
| 2908 | execute-fill | if |
| 2913 | execute-fill | if |
| 2932 | execute-fill | if |
| 2951 | execute-fill | if |
| 2962 | execute-fill | if |
| 2980 | execute-fill | if |
| 2984 | execute-fill | if |
| 2988 | execute-fill | if |
| 3009 | walk-x-book-step | match |
| 3017 | walk-x-book-step | if |
| 3050 | walk-y-book-step | match |
| 3058 | walk-y-book-step | if |
| 3113 | insert-ask-step | if |
| 3138 | insert-bid-step | if |
| 3162 | collect-ask-step | if |
| 3177 | collect-ask-step | if |
| 3205 | collect-bid-step | if |
| 3220 | collect-bid-step | if |
| 3337 | cross-remainder-as-y | asserts! |
| 3666 | distribute-to-token-y-depositor | if |
| 3858 | set-treasury | asserts! |
| 3859 | set-treasury | asserts! |
| 3865 | set-paused | asserts! |
| 3871 | set-operator | asserts! |
| 3877 | set-min-token-y-deposit | asserts! |
| 3878 | set-min-token-y-deposit | asserts! |
| 3884 | set-min-token-x-deposit | asserts! |
| 3885 | set-min-token-x-deposit | asserts! |
| 3891 | set-distance-slots | asserts! |
| 3892 | set-distance-slots | asserts! |
| 3916 | cap-bid-fold | if |
| 3943 | cap-ask-fold | if |
| 3945 | cap-ask-fold | if |
| 3992 | cap-kept-ask-fold | if |
| 4092 | get-taker-capacity | if |
| 4137 | get-taker-capacity | if |
| 4191 | prune-one | asserts! |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 2, 3, 4, 5, 6, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 78, 79, 80, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 194, 201, 205, 209, 216, 227, 235, 243, 252, 261, 265, 281, 289, 303, 307 |
| execute-fill | 2831, 2832, 2833, 2834, 2838, 2839, 2840, 2841, 2842, 2843, 2844, 2846, 2853, 2855, 2856, 2857, 2859, 2865, 2866, 2867, 2868, 2869, 2870, 2871, 2876, 2878, 2879, 2885, 2886, 2887, 2888, 2889, 2890, 2891, 2892, 2893, 2896, 2897, 2900, 2901, 2906, 2907, 2908, 2909, 2910, 2913, 2914, 2915, 2919, 2920, 2921, 2922, 2925, 2932, 2933, 2934, 2938, 2939, 2940, 2941, 2944, 2951, 2952, 2953, 2954, 2956, 2957, 2962, 2963, 2964, 2965, 2967, 2968, 2973, 2974, 2975, 2976, 2979, 2980, 2984, 2988, 2989, 2991 |
| settle-token-y-deposit | 1364, 1365, 1366, 1367, 1368, 1369, 1370, 1371, 1372, 1373, 1374, 1375, 1376, 1377, 1379, 1380, 1381, 1382, 1383, 1385, 1387, 1388, 1389, 1391, 1392, 1396, 1398, 1400, 1401, 1402, 1405, 1408, 1410, 1411, 1412, 1413, 1415, 1417, 1419, 1423, 1424, 1425, 1426, 1428, 1429, 1431 |
| settle-token-x-deposit | 1607, 1608, 1609, 1610, 1611, 1612, 1613, 1614, 1615, 1616, 1617, 1618, 1619, 1620, 1622, 1623, 1624, 1625, 1626, 1628, 1630, 1631, 1632, 1634, 1635, 1639, 1641, 1643, 1644, 1645, 1648, 1651, 1653, 1654, 1655, 1656, 1658, 1660, 1662, 1666, 1667, 1668, 1669, 1671, 1672, 1674 |
| reprice-or-swap-token-y | 2265, 2266, 2267, 2269, 2270, 2271, 2272, 2273, 2274, 2275, 2276, 2277, 2279, 2280, 2287, 2288, 2289, 2291, 2296, 2297, 2299, 2300, 2301, 2303, 2304, 2305, 2306, 2307, 2308, 2310, 2311, 2317, 2318, 2319, 2320, 2325, 2326, 2329, 2330, 2335, 2336, 2340 |
| reprice-or-swap-token-x | 2360, 2361, 2362, 2364, 2365, 2366, 2367, 2368, 2369, 2370, 2371, 2372, 2374, 2375, 2382, 2383, 2384, 2386, 2391, 2392, 2394, 2395, 2396, 2400, 2401, 2402, 2403, 2404, 2405, 2407, 2408, 2414, 2415, 2416, 2417, 2422, 2423, 2426, 2427, 2432, 2433, 2437 |
| get-taker-capacity | 4059, 4062, 4064, 4068, 4072, 4080, 4084, 4088, 4092, 4093, 4094, 4095, 4097, 4101, 4102, 4103, 4105, 4106, 4107, 4113, 4114, 4115, 4117, 4121, 4122, 4123, 4125, 4126, 4127, 4137, 4138, 4139, 4141, 4146, 4147, 4149, 4157, 4163 |
| cross-remainder-as-y | 3306, 3307, 3308, 3309, 3310, 3311, 3312, 3313, 3314, 3315, 3321, 3327, 3328, 3330, 3331, 3332, 3333, 3336, 3337, 3338, 3339, 3340, 3341, 3342, 3344, 3348, 3349, 3350, 3351, 3353, 3354, 3356, 3357, 3362, 3363, 3366 |
| settle-token-y-readmit | 1946, 1947, 1948, 1949, 1950, 1951, 1952, 1953, 1954, 1955, 1956, 1957, 1959, 1960, 1961, 1962, 1963, 1964, 1965, 1967, 1971, 1973, 1975, 1976, 1982, 1983, 1985, 1986, 1988, 1989, 1990, 1992 |
| settle-token-x-readmit | 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2036, 2040, 2042, 2044, 2045, 2051, 2052, 2054, 2055, 2057, 2058, 2059, 2061 |
| park-tenth-token-y | 761, 762, 763, 764, 766, 768, 771, 772, 773, 779, 782, 787, 789, 790, 791, 792, 793, 794, 795, 796, 797, 799, 800, 802, 805, 806, 807 |
| park-tenth-token-x | 852, 853, 854, 855, 857, 859, 862, 863, 864, 870, 873, 878, 880, 881, 882, 883, 884, 885, 886, 887, 888, 890, 891, 893, 896, 897, 898 |
| settle-token-y-limit | 2110, 2111, 2112, 2113, 2114, 2115, 2116, 2117, 2118, 2122, 2125, 2126, 2129, 2130, 2131, 2134, 2135, 2136, 2138, 2143, 2145, 2147, 2148, 2151, 2153, 2154, 2156 |
| settle-token-x-limit | 2205, 2206, 2207, 2208, 2209, 2210, 2211, 2212, 2213, 2217, 2220, 2221, 2224, 2225, 2226, 2229, 2230, 2231, 2233, 2238, 2240, 2242, 2243, 2246, 2248, 2249, 2251 |
| deposit-token-y-core | 1237, 1238, 1240, 1244, 1245, 1247, 1248, 1249, 1250, 1251, 1252, 1256, 1257, 1258, 1259, 1261, 1262, 1266, 1270, 1272, 1273, 1274, 1276, 1277, 1278, 1280 |
| deposit-token-x-core | 1480, 1481, 1483, 1487, 1488, 1490, 1491, 1492, 1493, 1494, 1495, 1499, 1500, 1501, 1502, 1504, 1505, 1509, 1513, 1515, 1516, 1517, 1519, 1520, 1521, 1523 |
| withdraw-token-y | 1833, 1834, 1835, 1836, 1837, 1838, 1839, 1843, 1844, 1845, 1850, 1851, 1852, 1853, 1854, 1855, 1856, 1858, 1859, 1860, 1866, 1867, 1870, 1872, 1873, 1875 |
| withdraw-token-x | 1883, 1884, 1885, 1886, 1887, 1888, 1889, 1893, 1894, 1895, 1900, 1901, 1902, 1903, 1904, 1905, 1906, 1908, 1909, 1910, 1916, 1917, 1920, 1922, 1923, 1925 |
| walk-x-book-step | 3009, 3010, 3011, 3012, 3013, 3014, 3015, 3017, 3018, 3019, 3020, 3021, 3022, 3023, 3025, 3026, 3027, 3028, 3030, 3034 |
| walk-y-book-step | 3050, 3051, 3052, 3053, 3054, 3055, 3056, 3058, 3059, 3060, 3061, 3062, 3063, 3064, 3066, 3067, 3068, 3069, 3071, 3075 |
| cross-remainder-as-x | 3377, 3382, 3383, 3384, 3385, 3391, 3402, 3403, 3410, 3411, 3412, 3414, 3418, 3419, 3420, 3421, 3423, 3424, 3426, 3427 |
| set-token-y-limit | 2070, 2071, 2072, 2073, 2074, 2075, 2076, 2080, 2081, 2082, 2087, 2088, 2090, 2092, 2093, 2098, 2099, 2101 |
| set-token-x-limit | 2165, 2166, 2167, 2168, 2169, 2170, 2171, 2175, 2176, 2177, 2182, 2183, 2185, 2187, 2188, 2193, 2194, 2196 |
| filter-small-token-y-depositor | 2458, 2459, 2460, 2461, 2467, 2468, 2472, 2473, 2475, 2479, 2480, 2481, 2483, 2484, 2486, 2487, 2489 |
| filter-small-token-x-depositor | 2506, 2507, 2508, 2509, 2515, 2516, 2520, 2521, 2523, 2527, 2528, 2529, 2531, 2532, 2534, 2535, 2537 |
| swap | 2727, 2731, 2734, 2744, 2754, 2762, 2768, 2769, 2770, 2787, 2788, 2789, 2790, 2791, 2810, 2811 |
| cancel-token-y-deposit | 1686, 1696, 1697, 1700, 1701, 1702, 1704, 1705, 1706, 1716, 1717, 1718, 1720, 1721, 1722 |
| cancel-token-x-deposit | 1760, 1770, 1771, 1774, 1775, 1776, 1778, 1779, 1780, 1790, 1791, 1792, 1794, 1795, 1796 |
| filter-limit-violating-token-y-depositor | 2555, 2556, 2562, 2563, 2565, 2566, 2568, 2572, 2573, 2574, 2576, 2577, 2579, 2580, 2582 |
| filter-limit-violating-token-x-depositor | 2599, 2600, 2606, 2607, 2609, 2610, 2612, 2616, 2617, 2618, 2620, 2621, 2623, 2624, 2626 |
| collect-ask-step | 3158, 3159, 3160, 3162, 3163, 3164, 3165, 3166, 3169, 3170, 3174, 3177, 3178, 3179 |
| collect-bid-step | 3201, 3202, 3203, 3205, 3206, 3207, 3208, 3209, 3212, 3213, 3217, 3220, 3221, 3222 |
| top-y-fold | 620, 621, 623, 624, 625, 629, 632, 633, 634, 640, 641, 642, 643 |
| top-x-fold | 662, 663, 665, 666, 667, 671, 674, 675, 676, 682, 683, 684, 685 |
| park-token-y | 914, 915, 916, 918, 919, 923, 924, 925, 927, 928, 930, 931, 933 |
| park-token-x | 942, 943, 944, 946, 947, 951, 952, 953, 955, 956, 958, 959, 961 |
| distribute-to-token-y-depositor | 3619, 3635, 3636, 3637, 3664, 3665, 3666, 3667, 3668, 3669, 3671, 3672 |
| distribute-to-token-x-depositor | 3713, 3714, 3744, 3745, 3751, 3752, 3759, 3760, 3761, 3762, 3766, 3767 |
| cap-ask-fold | 3939, 3940, 3941, 3943, 3944, 3945, 3946, 3947, 3948, 3949, 3951 |
| smallest-outside-y-fold | 703, 704, 705, 706, 709, 710, 711, 713 |
| smallest-outside-x-fold | 828, 829, 830, 831, 834, 835, 836, 838 |
| readmit-token-y | 1931, 1932, 1933, 1934, 1935, 1936, 1937, 1939 |
| readmit-token-x | 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2008 |
| cap-kept-ask-fold | 3988, 3989, 3990, 3992, 3993, 3994, 3996 |
| live-bid-fold | 1131, 1133, 1134, 1135, 1136, 1138 |
| live-offer-fold | 1151, 1153, 1154, 1155, 1156, 1158 |
| deposit-token-y | 1342, 1343, 1344, 1350, 1351, 1353 |
| deposit-token-x | 1585, 1586, 1587, 1593, 1594, 1596 |
| cap-bid-fold | 3916, 3917, 3918, 3919, 3920, 3922 |
| prune-one | 4190, 4191, 4192, 4193, 4194, 4195 |
| first-off-y-fold | 728, 729, 730, 731, 733 |
| first-off-x-fold | 745, 746, 747, 748, 750 |
| would-take-as-x | 1168, 1169, 1170, 1171, 1172 |
| would-take-as-y | 1183, 1184, 1185, 1186, 1187 |
| roll-and-sweep-dust | 3808, 3809, 3814, 3815, 3816 |
| settle-with-refresh | 2639, 2640, 2641, 2642, 2643 |
| prune-seats | 129, 130, 131, 132 |
| top-y-insert | 575, 576, 577, 580 |
| top-x-insert | 600, 601, 602, 605 |
| execute-settlement | 3520, 3540, 3541, 3542 |
| swap-result-y | 3294, 3295, 3296, 3297 |
| insert-ask-step | 3113, 3114, 3115, 3118 |
| sorted-asks | 3237, 3238, 3239, 3243 |
| insert-bid-step | 3138, 3139, 3140, 3143 |
| sorted-bids | 3252, 3253, 3254, 3258 |
| set-treasury | 3857, 3858, 3859, 3860 |
| set-min-token-y-deposit | 3876, 3877, 3878, 3879 |
| set-min-token-x-deposit | 3883, 3884, 3885, 3886 |
| set-distance-slots | 3890, 3891, 3892, 3893 |
| pegged-bid | 394, 395, 398 |
| pegged-ask | 409, 410, 413 |
| find-smallest-token-y-fold | 523, 524, 525 |
| find-smallest-token-x-fold | 542, 543, 544 |
| set-paused | 3864, 3865, 3866 |
| set-operator | 3870, 3871, 3872 |
| rebate-bps-for-age | 13, 15 |
| token-y-deposit-limits | 229, 231 |
| token-x-deposit-limits | 237, 239 |
| token-y-pending-deposits | 245, 248 |
| token-x-pending-deposits | 254, 257 |
| token-y-pending-limits | 283, 285 |
| token-x-pending-limits | 291, 293 |
| count-seated-fold | 473, 474 |
| ERR_DEPOSIT_TOO_SMALL | 38 |
| ERR_ALREADY_SETTLED | 39 |
| ERR_STALE_PRICE | 40 |
| ERR_PRICE_UNCERTAIN | 41 |
| ERR_NOTHING_TO_WITHDRAW | 42 |
| ERR_ZERO_PRICE | 43 |
| ERR_PAUSED | 44 |
| ERR_NOT_AUTHORIZED | 45 |
| ERR_NOTHING_TO_SETTLE | 46 |
| ERR_QUEUE_FULL | 47 |
| ERR_LIMIT_REQUIRED | 48 |
| ERR_ALREADY_INITIALIZED | 49 |
| ERR_WRONG_TRAIT | 50 |
| ERR_EXPO_MISMATCH | 51 |
| ERR_NOTHING_FILLED | 52 |
| ERR_PARTIAL_FILL | 53 |
| ERR_HAS_RESTING_POSITION | 54 |
| ERR_ZERO_MIN_DEPOSIT | 55 |
| ERR_TAKER_TOO_SMALL | 56 |
| ERR_NOTHING_TO_READMIT | 57 |
| ERR_FEED_MISSING | 58 |
| ERR_USE_CANCEL | 59 |
| ERR_FEED_TIMESTAMP_MISSING | 60 |
| ERR_BAD_SPREAD | 61 |
| ERR_CYCLE_OPEN | 62 |
| ERR_NOT_A_SEAT | 63 |
| ERR_SEATS_FULL | 64 |
| ERR_NOTHING_PENDING | 65 |
| ERR_ALREADY_PENDING | 66 |
| ERR_PRICE_BEFORE_ORDER | 67 |
| ERR_BAD_TREASURY | 68 |
| get-distance-slots | 76 |
| seated-x | 79 |
| seated-y | 80 |
| get-seated-x | 85 |
| get-seated-y | 88 |
| is-protected-x | 91 |
| is-protected-y | 94 |
| with-seat | 107 |
| token-y-deposits | 188 |
| token-x-deposits | 195 |
| token-y-depositor-list | 203 |
| token-x-depositor-list | 207 |
| cycle-totals | 211 |
| settlements | 218 |
| get-token-y-pending-readmit | 270 |
| get-token-x-pending-readmit | 273 |
| get-token-y-pending-deposit | 276 |
| get-token-y-pending-limit | 298 |
| get-token-x-pending-limit | 301 |
| get-settlement | 329 |
| get-token-y-limit | 384 |
| get-token-x-limit | 387 |
| order-y-price | 425 |
| order-x-price | 435 |
| side-full-y | 494 |
| side-full-x | 507 |
| push-quote | 3088 |
| quote-who | 3094 |
| put-limit-y | 1201 |
| put-limit-x | 1444 |
| prune-cycles | 4199 |

## Per simulation (cumulative executed expressions of markets-sbtc-stx-jing-v6-3)

| sim | txs | before | after |
|---|---|---|---|
| `5cf1573f` | 217 | 0 | 2003 |

## Provenance and trace diagnostics

source simulations/deploy-bytes-mv7dfb/markets-sbtc-stx-jing-v6-3.clar at 7e42b9c, sha256 `7b2f0f44fca1feaf1e8c30f195d0a639a3daf102db4f4c84060c8062132f5f4c`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 217 |
| no trace returned by stxer | 14 |
| trace decode errors | 0 |
| calls to a counted market instance | 11 |
| ... of which without a trace | 0 |
| ... of which decode errors | 0 |

| sim | counted instances |
|---|---|
| `5cf1573f` | markets-sbtc-stx-jing-v6-3 |

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
| signer-manager-vault-stx-rewards@4858dbc67c46 | 1 |
| sim-ccip-proxy@616692f404fc | 1 |
| swap-router-sbtc-stx-jing-v5-3@3e457866be8d | 1 |
