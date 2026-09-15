# Trace coverage: jing-sell-stx-core-spread

From `simulations/trace-coverage.mjs` on 2026-09-15, source at 8193030: 39 simulations, 2396 transactions (200 without a trace), every evaluated expression read from the stxer debug traces. Alias `^jing-sell-stx-spread-[0-9]+$`: every same-source instance deployed under another name counts.

| metric | value |
|---|---|
| expressions executed / total | 316 / 553 (57.1%) |
| code lines touched / total | 178 / 299 (59.5%) |
| function body lines touched / total (top-level definitions excluded) | 178 / 242 (73.6%) |
| branch nodes (if / match / asserts!) | 33: 31 full, 0 partial, 2 never reached |

## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (2)

| line | function | kind |
|---|---|---|
| 151 | get-position | match |
| 152 | get-position | if |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 32, 34, 35, 36, 37, 38, 39, 40, 43, 45, 48, 53, 74, 82, 86, 94, 96, 98, 100, 101, 104, 105, 109, 110, 112, 114, 116, 127, 131, 135, 150, 173, 178, 193, 199, 239, 289, 340, 362, 410, 424, 432, 436, 446, 479, 497, 508 |
| get-state | 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145 |
| get-position | 150, 151, 152, 153, 154, 155, 156, 159, 160, 162, 165 |
| deposit | 289, 290, 291, 294 |
| initialize | 199, 200, 201 |
| push-to-market | 479, 480, 481 |
| get-spread-bps | 127, 128 |
| get-cap | 131, 132 |
| withdraw | 362, 364 |
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
| miner-mid | 74 |
| current-cap | 82 |
| min-market | 86 |
| positions | 118 |
| market-size | 178 |
| pooled-stx | 193 |
| final-index | 173 |
| own-name | 424 |
| expected-name | 432 |
| sync | 239 |
| settle-proceeds | 446 |
| position-of | 436 |
| push | 340 |
| pull-to-held-ustx | 508 |
| claim | 410 |
| refresh-guard | 497 |

## Per simulation (cumulative executed expressions of jing-sell-stx-core-spread)

| sim | txs | before | after |
|---|---|---|---|
| `021504ee` | 59 | 0 | 0 |
| `03519ee6` | 57 | 0 | 294 |
| `08062c79` | 77 | 294 | 294 |
| `0b2a8e02` | 23 | 294 | 294 |
| `1239af91` | 35 | 294 | 294 |
| `1e101767` | 18 | 294 | 294 |
| `20aa4a5c` | 31 | 294 | 294 |
| `250da7f9` | 48 | 294 | 294 |
| `2683081f` | 34 | 294 | 294 |
| `27ed7a6e` | 174 | 294 | 294 |
| `30745051` | 32 | 294 | 294 |
| `400290a6` | 168 | 294 | 294 |
| `4fe11e14` | 102 | 294 | 294 |
| `59b23d38` | 122 | 294 | 729 |
| `5c063d70` | 18 | 729 | 729 |
| `5eb6ce12` | 33 | 729 | 729 |
| `677a6c55` | 119 | 729 | 746 |
| `6ed29637` | 94 | 746 | 746 |
| `7245f850` | 38 | 746 | 746 |
| `7c6ff3f1` | 17 | 746 | 746 |
| `8a1752d6` | 33 | 746 | 746 |
| `910168c4` | 34 | 746 | 746 |
| `93dc4f8c` | 32 | 746 | 746 |
| `981c4c03` | 42 | 746 | 746 |
| `99f15bff` | 29 | 746 | 746 |
| `aae15fd0` | 128 | 746 | 746 |
| `b501d4b4` | 138 | 746 | 1155 |
| `b849e557` | 44 | 1155 | 1155 |
| `c2fd7397` | 45 | 1155 | 1471 |
| `c59430ec` | 38 | 1471 | 1471 |
| `cc8fc837` | 17 | 1471 | 1471 |
| `d35a98ea` | 70 | 1471 | 1471 |
| `d4405a31` | 35 | 1471 | 1471 |
| `dd814f5c` | 121 | 1471 | 1471 |
| `de538c52` | 35 | 1471 | 1471 |
| `e17cd8b0` | 22 | 1471 | 1471 |
| `f14101fc` | 59 | 1471 | 1471 |
| `f42edd92` | 143 | 1471 | 1471 |
| `f4f22abe` | 32 | 1471 | 1471 |

## Known unreachable (and why)

- `get-position` (the `match` on the position and the `if` on its epoch, lines listed above) is a read-only with no on-chain caller: the harnesses read it through evals on both a current-epoch and a closed-epoch position (rungs-keyless, rung-types-mixed, rungs-fill F5), which leaves no trace. Read-only functions leave no trace: stxer traces transactions only, and every read-only here is exercised through `addEvalCode` reads in the harnesses (their lines show as uncovered above). Top-level definitions run at deploy, which has no trace either.
