# Trace coverage: markets-sbtc-stx-jing-v6

From `simulations/trace-coverage.mjs` on 2026-09-15, source at 296c73f: 30 simulations, 1769 transactions (194 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 2517 / 3517 (71.6%) |
| code lines touched / total | 1338 / 2012 (66.5%) |
| function body lines touched / total (top-level definitions excluded) | 1338 / 1921 (69.7%) |
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
| (top) | 1, 3, 4, 5, 10, 11, 13, 15, 17, 18, 20, 22, 23, 24, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 61, 62, 63, 64, 65, 72, 83, 84, 85, 147, 149, 150, 151, 152, 153, 154, 155, 156, 158, 159, 160, 161, 162, 163, 165, 166, 167, 168, 170, 172, 174, 175, 176, 177, 179, 187, 195, 200, 205, 213, 225, 232, 240, 244 |
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
| walk-x-book-step | 2437 |
| cross-remainder-as-y | 2722 |
| walk-y-book-step | 2479 |
| cross-remainder-as-x | 2789 |
| gross-up | 3379 |

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
