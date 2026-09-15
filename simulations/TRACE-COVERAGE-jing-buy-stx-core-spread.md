# Trace coverage: jing-buy-stx-core-spread

From `simulations/trace-coverage.mjs` on 2026-09-15, source at 8193030: 39 simulations, 2396 transactions (200 without a trace), every evaluated expression read from the stxer debug traces. Alias `^jing-buy-stx-spread-[0-9]+$`: every same-source instance deployed under another name counts.

| metric | value |
|---|---|
| expressions executed / total | 316 / 551 (57.4%) |
| code lines touched / total | 178 / 297 (59.9%) |
| function body lines touched / total (top-level definitions excluded) | 178 / 242 (73.6%) |
| branch nodes (if / match / asserts!) | 33: 31 full, 0 partial, 2 never reached |

## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (2)

| line | function | kind |
|---|---|---|
| 179 | get-position | match |
| 180 | get-position | if |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 61, 63, 64, 65, 66, 67, 70, 72, 75, 80, 101, 109, 113, 122, 124, 126, 128, 129, 132, 133, 137, 138, 140, 142, 144, 155, 159, 163, 178, 201, 206, 222, 229, 273, 326, 381, 403, 452, 466, 474, 478, 490, 526, 544, 555 |
| get-state | 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173 |
| get-position | 178, 179, 180, 181, 182, 183, 184, 187, 188, 190, 193 |
| deposit | 326, 327, 328, 331 |
| initialize | 229, 230, 231 |
| push-to-market | 526, 527, 528 |
| get-spread-bps | 155, 156 |
| get-floor | 159, 160 |
| withdraw | 403, 405 |
| ERR_NOT_AUTHORIZED | 47 |
| ERR_ALREADY_INITIALIZED | 48 |
| ERR_NOT_INITIALIZED | 49 |
| ERR_ZERO_AMOUNT | 50 |
| ERR_TOO_SMALL | 51 |
| ERR_NO_POSITION | 52 |
| ERR_INSUFFICIENT | 53 |
| ERR_ZERO_PRICE | 54 |
| ERR_BAD_SPREAD | 55 |
| ERR_BAD_NAME | 56 |
| miner-mid | 101 |
| current-floor | 109 |
| min-market | 113 |
| positions | 146 |
| market-size | 206 |
| pooled-sbtc | 222 |
| final-index | 201 |
| own-name | 466 |
| expected-name | 474 |
| sync | 273 |
| settle-proceeds | 490 |
| position-of | 478 |
| push | 381 |
| pull-to-held-sats | 555 |
| claim | 452 |
| refresh-guard | 544 |

## Per simulation (cumulative executed expressions of jing-buy-stx-core-spread)

| sim | txs | before | after |
|---|---|---|---|
| `021504ee` | 59 | 0 | 0 |
| `03519ee6` | 57 | 0 | 310 |
| `08062c79` | 77 | 310 | 310 |
| `0b2a8e02` | 23 | 310 | 310 |
| `1239af91` | 35 | 310 | 310 |
| `1e101767` | 18 | 310 | 310 |
| `20aa4a5c` | 31 | 310 | 310 |
| `250da7f9` | 48 | 310 | 310 |
| `2683081f` | 34 | 310 | 310 |
| `27ed7a6e` | 174 | 310 | 310 |
| `30745051` | 32 | 310 | 310 |
| `400290a6` | 168 | 310 | 310 |
| `4fe11e14` | 102 | 310 | 310 |
| `59b23d38` | 122 | 310 | 1405 |
| `5c063d70` | 18 | 1405 | 1405 |
| `5eb6ce12` | 33 | 1405 | 1405 |
| `677a6c55` | 119 | 1405 | 1424 |
| `6ed29637` | 94 | 1424 | 1424 |
| `7245f850` | 38 | 1424 | 1424 |
| `7c6ff3f1` | 17 | 1424 | 1424 |
| `8a1752d6` | 33 | 1424 | 1424 |
| `910168c4` | 34 | 1424 | 1424 |
| `93dc4f8c` | 32 | 1424 | 1424 |
| `981c4c03` | 42 | 1424 | 1424 |
| `99f15bff` | 29 | 1424 | 1424 |
| `aae15fd0` | 128 | 1424 | 1424 |
| `b501d4b4` | 138 | 1424 | 1797 |
| `b849e557` | 44 | 1797 | 1797 |
| `c2fd7397` | 45 | 1797 | 1797 |
| `c59430ec` | 38 | 1797 | 1797 |
| `cc8fc837` | 17 | 1797 | 1797 |
| `d35a98ea` | 70 | 1797 | 1797 |
| `d4405a31` | 35 | 1797 | 1797 |
| `dd814f5c` | 121 | 1797 | 1797 |
| `de538c52` | 35 | 1797 | 1797 |
| `e17cd8b0` | 22 | 1797 | 1797 |
| `f14101fc` | 59 | 1797 | 1797 |
| `f42edd92` | 143 | 1797 | 1797 |
| `f4f22abe` | 32 | 1797 | 1797 |

## Known unreachable (and why)

- `get-position` (the `match` on the position and the `if` on its epoch, lines listed above) is a read-only with no on-chain caller: the harnesses read it through evals on both a current-epoch and a closed-epoch position (rungs-keyless, rung-types-mixed, rungs-fill F5), which leaves no trace. Read-only functions leave no trace: stxer traces transactions only, and every read-only here is exercised through `addEvalCode` reads in the harnesses (their lines show as uncovered above). Top-level definitions run at deploy, which has no trace either.
