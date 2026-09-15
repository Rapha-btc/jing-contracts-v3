# Trace coverage: jing-buy-stx-market-spread

From `simulations/trace-coverage.mjs` on 2026-09-15, source at 8193030: 39 simulations, 2396 transactions (200 without a trace), every evaluated expression read from the stxer debug traces. Alias `^jing-buy-stx-spread-[0-9]+-floor`: every same-source instance deployed under another name counts.

| metric | value |
|---|---|
| expressions executed / total | 307 / 544 (56.4%) |
| code lines touched / total | 173 / 293 (59.0%) |
| function body lines touched / total (top-level definitions excluded) | 173 / 237 (73.0%) |
| branch nodes (if / match / asserts!) | 30: 28 full, 0 partial, 2 never reached |

## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (2)

| line | function | kind |
|---|---|---|
| 161 | get-position | match |
| 162 | get-position | if |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 61, 63, 64, 65, 66, 67, 70, 71, 73, 76, 81, 87, 96, 98, 99, 101, 103, 105, 106, 109, 110, 114, 115, 117, 119, 121, 132, 136, 140, 144, 160, 183, 188, 204, 211, 242, 295, 350, 372, 421, 435, 441, 460, 472, 508, 517 |
| get-state | 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155 |
| get-position | 160, 161, 162, 163, 164, 165, 166, 169, 170, 172, 175 |
| deposit | 295, 296, 297, 300 |
| expected-name | 441, 442, 443 |
| initialize | 211, 212, 213 |
| push-to-market | 508, 509, 510 |
| get-spread-bps | 132, 133 |
| get-floor | 136, 137 |
| get-floor-cents | 140, 141 |
| withdraw | 372, 374 |
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
| min-market | 87 |
| positions | 123 |
| market-size | 188 |
| pooled-sbtc | 204 |
| final-index | 183 |
| own-name | 435 |
| sync | 242 |
| settle-proceeds | 472 |
| position-of | 460 |
| push | 350 |
| pull-to-held-sats | 517 |
| claim | 421 |

## Per simulation (cumulative executed expressions of jing-buy-stx-market-spread)

| sim | txs | before | after |
|---|---|---|---|
| `021504ee` | 59 | 0 | 0 |
| `03519ee6` | 57 | 0 | 309 |
| `08062c79` | 77 | 309 | 309 |
| `0b2a8e02` | 23 | 309 | 309 |
| `1239af91` | 35 | 309 | 309 |
| `1e101767` | 18 | 309 | 309 |
| `20aa4a5c` | 31 | 309 | 309 |
| `250da7f9` | 48 | 309 | 309 |
| `2683081f` | 34 | 309 | 309 |
| `27ed7a6e` | 174 | 309 | 309 |
| `30745051` | 32 | 309 | 309 |
| `400290a6` | 168 | 309 | 309 |
| `4fe11e14` | 102 | 309 | 309 |
| `59b23d38` | 122 | 309 | 309 |
| `5c063d70` | 18 | 309 | 309 |
| `5eb6ce12` | 33 | 309 | 309 |
| `677a6c55` | 119 | 309 | 309 |
| `6ed29637` | 94 | 309 | 309 |
| `7245f850` | 38 | 309 | 575 |
| `7c6ff3f1` | 17 | 575 | 575 |
| `8a1752d6` | 33 | 575 | 575 |
| `910168c4` | 34 | 575 | 1089 |
| `93dc4f8c` | 32 | 1089 | 1089 |
| `981c4c03` | 42 | 1089 | 1631 |
| `99f15bff` | 29 | 1631 | 2453 |
| `aae15fd0` | 128 | 2453 | 2453 |
| `b501d4b4` | 138 | 2453 | 2453 |
| `b849e557` | 44 | 2453 | 2453 |
| `c2fd7397` | 45 | 2453 | 2453 |
| `c59430ec` | 38 | 2453 | 2453 |
| `cc8fc837` | 17 | 2453 | 2661 |
| `d35a98ea` | 70 | 2661 | 2661 |
| `d4405a31` | 35 | 2661 | 3256 |
| `dd814f5c` | 121 | 3256 | 3691 |
| `de538c52` | 35 | 3691 | 3695 |
| `e17cd8b0` | 22 | 3695 | 3695 |
| `f14101fc` | 59 | 3695 | 3941 |
| `f42edd92` | 143 | 3941 | 3941 |
| `f4f22abe` | 32 | 3941 | 3941 |

## Known unreachable (and why)

- `get-position` (the `match` on the position and the `if` on its epoch, lines listed above) is a read-only with no on-chain caller: the harnesses read it through evals on both a current-epoch and a closed-epoch position (rungs-keyless, rung-types-mixed, rungs-fill F5), which leaves no trace. Read-only functions leave no trace: stxer traces transactions only, and every read-only here is exercised through `addEvalCode` reads in the harnesses (their lines show as uncovered above). Top-level definitions run at deploy, which has no trace either.
