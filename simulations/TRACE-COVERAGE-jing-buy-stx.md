# Trace coverage: jing-buy-stx

From `simulations/trace-coverage.mjs` on 2026-09-15, source at 8193030: 39 simulations, 2396 transactions (200 without a trace), every evaluated expression read from the stxer debug traces. Alias `^jing-buy-stx-[0-9]`: every same-source instance deployed under another name counts.

| metric | value |
|---|---|
| expressions executed / total | 297 / 522 (56.9%) |
| code lines touched / total | 169 / 278 (60.8%) |
| function body lines touched / total (top-level definitions excluded) | 169 / 227 (74.4%) |
| branch nodes (if / match / asserts!) | 29: 27 full, 0 partial, 2 never reached |

## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (2)

| line | function | kind |
|---|---|---|
| 140 | get-position | match |
| 141 | get-position | if |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 39, 40, 41, 42, 43, 44, 45, 46, 47, 52, 54, 55, 56, 57, 58, 60, 65, 68, 74, 83, 85, 86, 87, 89, 90, 93, 94, 98, 99, 101, 103, 105, 116, 120, 124, 139, 162, 167, 183, 190, 212, 265, 320, 342, 391, 405, 410, 423, 435, 471, 480 |
| get-state | 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134 |
| get-position | 139, 140, 141, 142, 143, 144, 145, 148, 149, 151, 154 |
| deposit | 265, 266, 267, 270 |
| push-to-market | 471, 472, 473 |
| get-price | 116, 117 |
| get-sats-per-stx-cents | 120, 121 |
| withdraw | 342, 344 |
| ERR_NOT_AUTHORIZED | 39 |
| ERR_ALREADY_INITIALIZED | 40 |
| ERR_NOT_INITIALIZED | 41 |
| ERR_ZERO_AMOUNT | 42 |
| ERR_TOO_SMALL | 43 |
| ERR_NO_POSITION | 44 |
| ERR_INSUFFICIENT | 45 |
| ERR_ZERO_PRICE | 46 |
| ERR_BAD_NAME | 47 |
| min-market | 74 |
| positions | 107 |
| market-size | 167 |
| pooled-sbtc | 183 |
| final-index | 162 |
| own-name | 405 |
| expected-name | 410 |
| initialize | 190 |
| sync | 212 |
| settle-proceeds | 435 |
| position-of | 423 |
| push | 320 |
| pull-to-held-sats | 480 |
| claim | 391 |

## Per simulation (cumulative executed expressions of jing-buy-stx)

| sim | txs | before | after |
|---|---|---|---|
| `021504ee` | 59 | 0 | 0 |
| `03519ee6` | 57 | 0 | 309 |
| `08062c79` | 77 | 309 | 309 |
| `0b2a8e02` | 23 | 309 | 595 |
| `1239af91` | 35 | 595 | 595 |
| `1e101767` | 18 | 595 | 595 |
| `20aa4a5c` | 31 | 595 | 595 |
| `250da7f9` | 48 | 595 | 595 |
| `2683081f` | 34 | 595 | 595 |
| `27ed7a6e` | 174 | 595 | 595 |
| `30745051` | 32 | 595 | 595 |
| `400290a6` | 168 | 595 | 595 |
| `4fe11e14` | 102 | 595 | 595 |
| `59b23d38` | 122 | 595 | 595 |
| `5c063d70` | 18 | 595 | 595 |
| `5eb6ce12` | 33 | 595 | 595 |
| `677a6c55` | 119 | 595 | 595 |
| `6ed29637` | 94 | 595 | 595 |
| `7245f850` | 38 | 595 | 879 |
| `7c6ff3f1` | 17 | 879 | 879 |
| `8a1752d6` | 33 | 879 | 1368 |
| `910168c4` | 34 | 1368 | 1368 |
| `93dc4f8c` | 32 | 1368 | 1368 |
| `981c4c03` | 42 | 1368 | 1368 |
| `99f15bff` | 29 | 1368 | 1368 |
| `aae15fd0` | 128 | 1368 | 1368 |
| `b501d4b4` | 138 | 1368 | 1368 |
| `b849e557` | 44 | 1368 | 1368 |
| `c2fd7397` | 45 | 1368 | 1775 |
| `c59430ec` | 38 | 1775 | 1775 |
| `cc8fc837` | 17 | 1775 | 1775 |
| `d35a98ea` | 70 | 1775 | 1775 |
| `d4405a31` | 35 | 1775 | 1775 |
| `dd814f5c` | 121 | 1775 | 1775 |
| `de538c52` | 35 | 1775 | 1775 |
| `e17cd8b0` | 22 | 1775 | 2182 |
| `f14101fc` | 59 | 2182 | 2182 |
| `f42edd92` | 143 | 2182 | 2182 |
| `f4f22abe` | 32 | 2182 | 2182 |

## Known unreachable (and why)

- `get-position` (the `match` on the position and the `if` on its epoch, lines listed above) is a read-only with no on-chain caller: the harnesses read it through evals on both a current-epoch and a closed-epoch position (rungs-keyless, rung-types-mixed, rungs-fill F5), which leaves no trace. Read-only functions leave no trace: stxer traces transactions only, and every read-only here is exercised through `addEvalCode` reads in the harnesses (their lines show as uncovered above). Top-level definitions run at deploy, which has no trace either.
