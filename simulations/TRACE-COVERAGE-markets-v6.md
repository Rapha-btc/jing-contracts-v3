# Trace coverage: markets-sbtc-stx-jing-v6

From `simulations/trace-coverage.mjs` on 2026-09-15, source at b8b6f3e: 30 simulations, 1872 transactions (194 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 2550 / 3630 (70.2%) |
| code lines touched / total | 1362 / 2091 (65.1%) |
| function body lines touched / total (top-level definitions excluded) | 1362 / 2000 (68.1%) |
| branch nodes (if / match / asserts!) | 246: 230 full, 13 partial, 3 never reached |

## Branches with one arm never taken (13)

| line | function | kind | state |
|---|---|---|---|
| 344 | pegged-bid | if | one arm (then only) |
| 362 | pegged-ask | if | one arm (then only) |
| 2319 | execute-fill | if | one arm (then only) |
| 2437 | walk-x-book-step | match | one arm (then only) |
| 2479 | walk-y-book-step | match | one arm (then only) |
| 3037 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3041 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3133 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3137 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3410 | gross-up | if | one arm (else only) |
| 3519 | get-taker-capacity | if | one arm (then only) |
| 3536 | get-taker-capacity | if | one arm (else only) |
| 3541 | get-taker-capacity | if | one arm (then only) |

## Branch nodes never reached (3)

| line | function | kind |
|---|---|---|
| 2206 | swap | if |
| 3490 | get-taker-capacity | if |
| 3521 | get-taker-capacity | if |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 3, 4, 5, 10, 11, 13, 15, 17, 18, 20, 22, 23, 24, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 61, 62, 63, 64, 65, 72, 83, 84, 85, 147, 149, 150, 151, 152, 153, 154, 155, 156, 158, 159, 160, 161, 162, 163, 165, 166, 167, 168, 170, 172, 174, 175, 176, 177, 179, 187, 195, 200, 205, 213, 225, 232, 240, 244 |
| get-taker-capacity | 3490, 3491, 3492, 3494, 3497, 3499, 3500, 3501, 3504, 3505, 3507, 3510, 3512, 3513, 3514, 3521, 3522, 3524, 3528, 3530, 3537 |
| swap | 2206, 2207, 2208 |
| token-y-deposit-limits | 227, 229 |
| token-x-deposit-limits | 234, 236 |
| deposit-token-x | 1439, 1440 |
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
| seated-x | 84 |
| seated-y | 85 |
| token-y-deposits | 180 |
| token-x-deposits | 188 |
| token-y-depositor-list | 197 |
| token-x-depositor-list | 202 |
| cycle-totals | 207 |
| settlements | 215 |
| get-settlement | 270 |
| get-token-y-limit | 331 |
| get-token-x-limit | 335 |
| cancel-token-y-deposit | 1453 |
| cancel-token-x-deposit | 1504 |
| withdraw-token-y | 1556 |
| withdraw-token-x | 1607 |
| walk-x-book-step | 2462 |
| cross-remainder-as-y | 2747 |
| walk-y-book-step | 2504 |
| cross-remainder-as-x | 2814 |
| gross-up | 3411 |

## Per simulation (cumulative executed expressions of markets-sbtc-stx-jing-v6)

| sim | txs | before | after |
|---|---|---|---|
| `2d134ecd` | 174 | 0 | 3634 |
| `0aea8687` | 44 | 3634 | 3807 |
| `cfa2c166` | 17 | 3807 | 3819 |
| `75b55349` | 31 | 3819 | 3827 |
| `9f66c482` | 18 | 3827 | 3960 |
| `69d71b4f` | 48 | 3960 | 4153 |
| `e604363a` | 77 | 4153 | 4216 |
| `764fdf7a` | 70 | 4216 | 4354 |
| `a199df4c` | 59 | 4354 | 4393 |
| `3e2c86f8` | 35 | 4393 | 4397 |
| `4efa9f39` | 42 | 4397 | 4400 |
| `bb8891d0` | 38 | 4400 | 4445 |
| `1f7701ce` | 29 | 4445 | 4446 |
| `dfade3ba` | 121 | 4446 | 4453 |
| `cf9830c6` | 143 | 4453 | 4487 |
| `afc6b102` | 17 | 4487 | 4487 |
| `1a404bbf` | 59 | 4487 | 4489 |
| `79b5a980` | 18 | 4489 | 4549 |
| `6cff0924` | 32 | 4549 | 4606 |
| `7833fe4e` | 57 | 4606 | 4606 |
| `96ec02af` | 45 | 4606 | 4606 |
| `da6fd0cf` | 38 | 4606 | 4606 |
| `8d41a193` | 119 | 4606 | 4608 |
| `a8b13fcd` | 138 | 4608 | 4624 |
| `0124c42a` | 33 | 4624 | 4624 |
| `6343bc2a` | 33 | 4624 | 4624 |
| `672d3cdc` | 35 | 4624 | 4624 |
| `8ff938cb` | 35 | 4624 | 4624 |
| `9b1125d0` | 165 | 4624 | 4835 |
| `08121fae` | 102 | 4835 | 4883 |
