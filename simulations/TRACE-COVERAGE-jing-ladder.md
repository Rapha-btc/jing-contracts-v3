# Trace coverage: jing-ladder

From `simulations/trace-coverage.mjs` on 2026-09-15, source at 8193030: 39 simulations, 2396 transactions (200 without a trace), every evaluated expression read from the stxer debug traces. Alias `^jing-ladder`: every same-source instance deployed under another name counts.

| metric | value |
|---|---|
| expressions executed / total | 224 / 545 (41.1%) |
| code lines touched / total | 128 / 353 (36.3%) |
| function body lines touched / total (top-level definitions excluded) | 125 / 296 (42.2%) |
| branch nodes (if / match / asserts!) | 24: 23 full, 0 partial, 1 never reached |

## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (1)

| line | function | kind |
|---|---|---|
| 151 | is-current-rung | match |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 32, 34, 35, 38, 39, 43, 44, 51, 52, 55, 56, 57, 59, 64, 72, 80, 84, 91, 95, 105, 109, 113, 116, 122, 141, 150, 160, 179, 189, 210, 264, 302, 329, 351, 381, 385, 411, 433, 457, 477, 497, 512 |
| log-deposit | 385, 386, 387, 388, 389, 390, 391 |
| log-withdraw | 433, 434, 435, 436, 437, 438 |
| register | 210, 211, 212, 213, 216 |
| register-unseated | 264, 265, 266, 267, 270 |
| log-push | 411, 412, 413, 414, 415 |
| get-pending-owner | 84, 85, 86, 87 |
| get-rung | 95, 96, 97, 99 |
| is-current | 141, 142, 143, 144 |
| log-claim | 457, 458, 459, 460 |
| is-band-current | 122, 123, 124 |
| is-current-rung | 150, 151, 152 |
| claim-seat | 160, 161, 162 |
| set-canonical | 189, 190, 191 |
| retire-band | 351, 352, 353 |
| log-epoch-closed | 477, 478, 479 |
| rungs | 65, 66 |
| registered | 74, 75 |
| get-canonical | 91, 92 |
| get-registered | 105, 106 |
| is-registered | 109, 110 |
| ERR_NOT_AUTHORIZED | 18 |
| ERR_INVALID_CONTRACT_HASH | 19 |
| ERR_NOT_VERIFIED | 20 |
| ERR_HASH_MISMATCH | 21 |
| ERR_ALREADY_REGISTERED | 22 |
| ERR_PRICE_TAKEN | 23 |
| ERR_BAD_SIDE | 24 |
| ERR_NO_PENDING_OWNER | 25 |
| ERR_TIMELOCK_NOT_ELAPSED | 26 |
| ERR_NOT_REGISTERED | 27 |
| ERR_BAND_FULL | 28 |
| ERR_ALREADY_SEATED | 29 |
| band-count | 52 |
| pending-owner | 56 |
| canonical | 60 |
| get-owner | 80 |
| get-band-count | 113 |
| is-band-side | 116 |
| valid-side | 179 |
| seat-band | 302 |
| set-max-band-per-side | 329 |
| rung-of | 381 |
| propose-owner | 497 |
| accept-owner | 512 |

## Per simulation (cumulative executed expressions of jing-ladder)

| sim | txs | before | after |
|---|---|---|---|
| `021504ee` | 59 | 0 | 0 |
| `03519ee6` | 57 | 0 | 228 |
| `08062c79` | 77 | 228 | 228 |
| `0b2a8e02` | 23 | 228 | 249 |
| `1239af91` | 35 | 249 | 273 |
| `1e101767` | 18 | 273 | 273 |
| `20aa4a5c` | 31 | 273 | 273 |
| `250da7f9` | 48 | 273 | 273 |
| `2683081f` | 34 | 273 | 273 |
| `27ed7a6e` | 174 | 273 | 295 |
| `30745051` | 32 | 295 | 295 |
| `400290a6` | 168 | 295 | 295 |
| `4fe11e14` | 102 | 295 | 295 |
| `59b23d38` | 122 | 295 | 458 |
| `5c063d70` | 18 | 458 | 458 |
| `5eb6ce12` | 33 | 458 | 458 |
| `677a6c55` | 119 | 458 | 460 |
| `6ed29637` | 94 | 460 | 460 |
| `7245f850` | 38 | 460 | 460 |
| `7c6ff3f1` | 17 | 460 | 460 |
| `8a1752d6` | 33 | 460 | 460 |
| `910168c4` | 34 | 460 | 460 |
| `93dc4f8c` | 32 | 460 | 460 |
| `981c4c03` | 42 | 460 | 460 |
| `99f15bff` | 29 | 460 | 460 |
| `aae15fd0` | 128 | 460 | 460 |
| `b501d4b4` | 138 | 460 | 460 |
| `b849e557` | 44 | 460 | 460 |
| `c2fd7397` | 45 | 460 | 460 |
| `c59430ec` | 38 | 460 | 460 |
| `cc8fc837` | 17 | 460 | 460 |
| `d35a98ea` | 70 | 460 | 460 |
| `d4405a31` | 35 | 460 | 460 |
| `dd814f5c` | 121 | 460 | 460 |
| `de538c52` | 35 | 460 | 460 |
| `e17cd8b0` | 22 | 460 | 460 |
| `f14101fc` | 59 | 460 | 460 |
| `f42edd92` | 143 | 460 | 460 |
| `f4f22abe` | 32 | 460 | 460 |

## Known unreachable (and why)

- `is-current-rung` (L151 `match`): a read-only with no on-chain caller (the rungs use the private `is-current` through the log-* entries, which is traced and full); the replace harness reads it through evals for a seated, an unseated, a replaced and a retired rung. Read-only functions leave no trace: stxer traces transactions only, and every read-only here is exercised through `addEvalCode` reads in the harnesses (their lines show as uncovered above). Top-level definitions run at deploy, which has no trace either.
