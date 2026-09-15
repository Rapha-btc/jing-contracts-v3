# Trace coverage: jing-sell-stx-market-spread

From `simulations/trace-coverage.mjs` on 2026-09-15, source at 8193030: 39 simulations, 2396 transactions (200 without a trace), every evaluated expression read from the stxer debug traces. Alias `^jing-sell-stx-spread-[0-9]+-cap`: every same-source instance deployed under another name counts.

| metric | value |
|---|---|
| expressions executed / total | 307 / 546 (56.2%) |
| code lines touched / total | 173 / 295 (58.6%) |
| function body lines touched / total (top-level definitions excluded) | 173 / 237 (73.0%) |
| branch nodes (if / match / asserts!) | 30: 28 full, 0 partial, 2 never reached |

## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (2)

| line | function | kind |
|---|---|---|
| 133 | get-position | match |
| 134 | get-position | if |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 32, 34, 35, 36, 37, 38, 39, 40, 43, 44, 46, 49, 54, 60, 68, 70, 71, 73, 75, 77, 78, 81, 82, 86, 87, 89, 91, 93, 104, 108, 112, 116, 132, 155, 160, 175, 181, 208, 258, 309, 331, 379, 393, 399, 418, 428, 461, 470 |
| get-state | 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127 |
| get-position | 132, 133, 134, 135, 136, 137, 138, 141, 142, 144, 147 |
| deposit | 258, 259, 260, 263 |
| expected-name | 399, 400, 401 |
| initialize | 181, 182, 183 |
| push-to-market | 461, 462, 463 |
| get-spread-bps | 104, 105 |
| get-cap | 108, 109 |
| get-cap-cents | 112, 113 |
| withdraw | 331, 333 |
| ERR_NOT_AUTHORIZED | 18 |
| ERR_ALREADY_INITIALIZED | 19 |
| ERR_NOT_INITIALIZED | 20 |
| ERR_ZERO_AMOUNT | 21 |
| ERR_TOO_SMALL | 22 |
| ERR_NO_POSITION | 23 |
| ERR_INSUFFICIENT | 24 |
| ERR_ZERO_PRICE | 25 |
| ERR_BAD_SPREAD | 26 |
| ERR_BAD_NAME | 27 |
| min-market | 60 |
| positions | 95 |
| market-size | 160 |
| pooled-stx | 175 |
| final-index | 155 |
| own-name | 393 |
| sync | 208 |
| settle-proceeds | 428 |
| position-of | 418 |
| push | 309 |
| pull-to-held-ustx | 470 |
| claim | 379 |

## Per simulation (cumulative executed expressions of jing-sell-stx-market-spread)

| sim | txs | before | after |
|---|---|---|---|
| `021504ee` | 59 | 0 | 0 |
| `03519ee6` | 57 | 0 | 309 |
| `08062c79` | 77 | 309 | 309 |
| `0b2a8e02` | 23 | 309 | 573 |
| `1239af91` | 35 | 573 | 1088 |
| `1e101767` | 18 | 1088 | 1088 |
| `20aa4a5c` | 31 | 1088 | 1088 |
| `250da7f9` | 48 | 1088 | 1088 |
| `2683081f` | 34 | 1088 | 1088 |
| `27ed7a6e` | 174 | 1088 | 1088 |
| `30745051` | 32 | 1088 | 1088 |
| `400290a6` | 168 | 1088 | 1088 |
| `4fe11e14` | 102 | 1088 | 1088 |
| `59b23d38` | 122 | 1088 | 1088 |
| `5c063d70` | 18 | 1088 | 1088 |
| `5eb6ce12` | 33 | 1088 | 1088 |
| `677a6c55` | 119 | 1088 | 1088 |
| `6ed29637` | 94 | 1088 | 1088 |
| `7245f850` | 38 | 1088 | 1351 |
| `7c6ff3f1` | 17 | 1351 | 1351 |
| `8a1752d6` | 33 | 1351 | 1351 |
| `910168c4` | 34 | 1351 | 1351 |
| `93dc4f8c` | 32 | 1351 | 1351 |
| `981c4c03` | 42 | 1351 | 1890 |
| `99f15bff` | 29 | 1890 | 1890 |
| `aae15fd0` | 128 | 1890 | 1890 |
| `b501d4b4` | 138 | 1890 | 1890 |
| `b849e557` | 44 | 1890 | 1890 |
| `c2fd7397` | 45 | 1890 | 2221 |
| `c59430ec` | 38 | 2221 | 2221 |
| `cc8fc837` | 17 | 2221 | 2426 |
| `d35a98ea` | 70 | 2426 | 2426 |
| `d4405a31` | 35 | 2426 | 2426 |
| `dd814f5c` | 121 | 2426 | 2426 |
| `de538c52` | 35 | 2426 | 2426 |
| `e17cd8b0` | 22 | 2426 | 2426 |
| `f14101fc` | 59 | 2426 | 2671 |
| `f42edd92` | 143 | 2671 | 3348 |
| `f4f22abe` | 32 | 3348 | 3348 |

## Known unreachable (and why)

- `get-position` (the `match` on the position and the `if` on its epoch, lines listed above) is a read-only with no on-chain caller: the harnesses read it through evals on both a current-epoch and a closed-epoch position (rungs-keyless, rung-types-mixed, rungs-fill F5), which leaves no trace. Read-only functions leave no trace: stxer traces transactions only, and every read-only here is exercised through `addEvalCode` reads in the harnesses (their lines show as uncovered above). Top-level definitions run at deploy, which has no trace either.
