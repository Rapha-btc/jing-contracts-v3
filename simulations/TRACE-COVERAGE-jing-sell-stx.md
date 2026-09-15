# Trace coverage: jing-sell-stx

From `simulations/trace-coverage.mjs` on 2026-09-15, source at 8193030: 39 simulations, 2396 transactions (200 without a trace), every evaluated expression read from the stxer debug traces. Alias `^jing-sell-stx-[0-9]`: every same-source instance deployed under another name counts.

| metric | value |
|---|---|
| expressions executed / total | 297 / 524 (56.7%) |
| code lines touched / total | 169 / 280 (60.4%) |
| function body lines touched / total (top-level definitions excluded) | 169 / 227 (74.4%) |
| branch nodes (if / match / asserts!) | 29: 27 full, 0 partial, 2 never reached |

## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (2)

| line | function | kind |
|---|---|---|
| 115 | get-position | match |
| 116 | get-position | if |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 13, 14, 15, 16, 17, 18, 19, 20, 21, 26, 28, 29, 30, 31, 32, 33, 34, 36, 41, 44, 50, 58, 60, 61, 62, 64, 65, 68, 69, 73, 74, 76, 78, 80, 91, 95, 99, 114, 137, 142, 157, 163, 181, 231, 282, 304, 352, 366, 371, 384, 394, 427, 436 |
| get-state | 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109 |
| get-position | 114, 115, 116, 117, 118, 119, 120, 123, 124, 126, 129 |
| deposit | 231, 232, 233, 236 |
| push-to-market | 427, 428, 429 |
| get-price | 91, 92 |
| get-sats-per-stx-cents | 95, 96 |
| withdraw | 304, 306 |
| ERR_NOT_AUTHORIZED | 13 |
| ERR_ALREADY_INITIALIZED | 14 |
| ERR_NOT_INITIALIZED | 15 |
| ERR_ZERO_AMOUNT | 16 |
| ERR_TOO_SMALL | 17 |
| ERR_NO_POSITION | 18 |
| ERR_INSUFFICIENT | 19 |
| ERR_ZERO_PRICE | 20 |
| ERR_BAD_NAME | 21 |
| min-market | 50 |
| positions | 82 |
| market-size | 142 |
| pooled-stx | 157 |
| final-index | 137 |
| own-name | 366 |
| expected-name | 371 |
| initialize | 163 |
| sync | 181 |
| settle-proceeds | 394 |
| position-of | 384 |
| push | 282 |
| pull-to-held-ustx | 436 |
| claim | 352 |

## Per simulation (cumulative executed expressions of jing-sell-stx)

| sim | txs | before | after |
|---|---|---|---|
| `021504ee` | 59 | 0 | 0 |
| `03519ee6` | 57 | 0 | 292 |
| `08062c79` | 77 | 292 | 292 |
| `0b2a8e02` | 23 | 292 | 292 |
| `1239af91` | 35 | 292 | 292 |
| `1e101767` | 18 | 292 | 292 |
| `20aa4a5c` | 31 | 292 | 292 |
| `250da7f9` | 48 | 292 | 292 |
| `2683081f` | 34 | 292 | 292 |
| `27ed7a6e` | 174 | 292 | 292 |
| `30745051` | 32 | 292 | 778 |
| `400290a6` | 168 | 778 | 778 |
| `4fe11e14` | 102 | 778 | 778 |
| `59b23d38` | 122 | 778 | 778 |
| `5c063d70` | 18 | 778 | 778 |
| `5eb6ce12` | 33 | 778 | 778 |
| `677a6c55` | 119 | 778 | 778 |
| `6ed29637` | 94 | 778 | 778 |
| `7245f850` | 38 | 778 | 1024 |
| `7c6ff3f1` | 17 | 1024 | 1024 |
| `8a1752d6` | 33 | 1024 | 1024 |
| `910168c4` | 34 | 1024 | 1024 |
| `93dc4f8c` | 32 | 1024 | 1024 |
| `981c4c03` | 42 | 1024 | 1024 |
| `99f15bff` | 29 | 1024 | 1024 |
| `aae15fd0` | 128 | 1024 | 1024 |
| `b501d4b4` | 138 | 1024 | 1024 |
| `b849e557` | 44 | 1024 | 1024 |
| `c2fd7397` | 45 | 1024 | 1742 |
| `c59430ec` | 38 | 1742 | 1742 |
| `cc8fc837` | 17 | 1742 | 1742 |
| `d35a98ea` | 70 | 1742 | 1742 |
| `d4405a31` | 35 | 1742 | 1742 |
| `dd814f5c` | 121 | 1742 | 1742 |
| `de538c52` | 35 | 1742 | 1742 |
| `e17cd8b0` | 22 | 1742 | 2146 |
| `f14101fc` | 59 | 2146 | 2146 |
| `f42edd92` | 143 | 2146 | 2146 |
| `f4f22abe` | 32 | 2146 | 2146 |

## Known unreachable (and why)

- `get-position` (the `match` on the position and the `if` on its epoch, lines listed above) is a read-only with no on-chain caller: the harnesses read it through evals on both a current-epoch and a closed-epoch position (rungs-keyless, rung-types-mixed, rungs-fill F5), which leaves no trace. Read-only functions leave no trace: stxer traces transactions only, and every read-only here is exercised through `addEvalCode` reads in the harnesses (their lines show as uncovered above). Top-level definitions run at deploy, which has no trace either.
