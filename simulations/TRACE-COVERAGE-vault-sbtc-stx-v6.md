# Trace coverage: vault-sbtc-stx-v6

From `simulations/trace-coverage.mjs` on 2026-09-15, source at 8193030: 39 simulations, 2396 transactions (200 without a trace), every evaluated expression read from the stxer debug traces. Alias `^vault-sbtc-stx-v6`: every same-source instance deployed under another name counts.

| metric | value |
|---|---|
| expressions executed / total | 318 / 584 (54.5%) |
| code lines touched / total | 166 / 336 (49.4%) |
| function body lines touched / total (top-level definitions excluded) | 166 / 282 (58.9%) |
| branch nodes (if / match / asserts!) | 46: 46 full, 0 partial, 0 never reached |

## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (0)

| line | function | kind |
|---|---|---|

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 50, 52, 53, 55, 56, 58, 59, 60, 61, 63, 64, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 80, 81, 83, 85, 87, 89, 94, 96, 100, 112, 116, 120, 133, 140, 147, 157, 167, 179, 191, 203, 214, 227, 271, 314, 364, 436, 488, 498, 523, 537, 544, 553 |
| execute-router-swap | 436, 437, 438, 439, 440, 441, 442, 443, 444 |
| execute-jing-deposit | 227, 228, 229, 230, 231, 232, 233, 234 |
| execute-jing-set-limit | 271, 272, 273, 274, 275, 276, 277, 278 |
| execute-jing-swap | 314, 315, 316, 317, 318, 319, 320, 321 |
| execute-jing-reprice | 364, 365, 366, 367, 368, 369, 370, 371 |
| get-status | 100, 101, 103, 104, 105, 106 |
| verify-and-consume | 498, 499, 500, 501 |
| derive-min-out | 553, 554, 555, 556 |
| resting | 523, 524, 525 |
| used-pubkey-authorizations | 90, 91 |
| is-signature-used | 112, 113 |
| is-initialized | 116, 117 |
| ERR_NOT_OWNER | 66 |
| ERR_INVALID_SIGNATURE | 67 |
| ERR_REPLAY | 68 |
| ERR_EXPIRED | 69 |
| ERR_NO_FUNDS | 70 |
| ERR_INVALID_SIDE | 71 |
| ERR_INVALID_PRICE | 72 |
| ERR_ALREADY_INITIALIZED | 73 |
| ERR_PUBKEY_NOT_SET | 74 |
| ERR_AMOUNT_MISMATCH | 75 |
| ERR_REBATE_MISMATCH | 76 |
| owner-pubkey | 85 |
| keeper | 87 |
| get-owner | 96 |
| initialize | 120 |
| set-owner-pubkey | 133 |
| set-keeper | 140 |
| deposit-stx | 147 |
| deposit-sbtc | 157 |
| withdraw-stx | 167 |
| withdraw-sbtc | 179 |
| check-owner-or-keeper | 488 |
| revoke-intent | 191 |
| cancel-jing-stx | 203 |
| cancel-jing-sbtc | 214 |
| token-in | 537 |
| token-out | 544 |

## Per simulation (cumulative executed expressions of vault-sbtc-stx-v6)

| sim | txs | before | after |
|---|---|---|---|
| `021504ee` | 59 | 0 | 0 |
| `03519ee6` | 57 | 0 | 0 |
| `08062c79` | 77 | 0 | 0 |
| `0b2a8e02` | 23 | 0 | 0 |
| `1239af91` | 35 | 0 | 0 |
| `1e101767` | 18 | 0 | 0 |
| `20aa4a5c` | 31 | 0 | 0 |
| `250da7f9` | 48 | 0 | 0 |
| `2683081f` | 34 | 0 | 0 |
| `27ed7a6e` | 174 | 0 | 0 |
| `30745051` | 32 | 0 | 0 |
| `400290a6` | 168 | 0 | 677 |
| `4fe11e14` | 102 | 677 | 677 |
| `59b23d38` | 122 | 677 | 677 |
| `5c063d70` | 18 | 677 | 677 |
| `5eb6ce12` | 33 | 677 | 677 |
| `677a6c55` | 119 | 677 | 677 |
| `6ed29637` | 94 | 677 | 677 |
| `7245f850` | 38 | 677 | 677 |
| `7c6ff3f1` | 17 | 677 | 677 |
| `8a1752d6` | 33 | 677 | 677 |
| `910168c4` | 34 | 677 | 677 |
| `93dc4f8c` | 32 | 677 | 677 |
| `981c4c03` | 42 | 677 | 677 |
| `99f15bff` | 29 | 677 | 677 |
| `aae15fd0` | 128 | 677 | 677 |
| `b501d4b4` | 138 | 677 | 677 |
| `b849e557` | 44 | 677 | 677 |
| `c2fd7397` | 45 | 677 | 677 |
| `c59430ec` | 38 | 677 | 677 |
| `cc8fc837` | 17 | 677 | 677 |
| `d35a98ea` | 70 | 677 | 677 |
| `d4405a31` | 35 | 677 | 677 |
| `dd814f5c` | 121 | 677 | 677 |
| `de538c52` | 35 | 677 | 677 |
| `e17cd8b0` | 22 | 677 | 677 |
| `f14101fc` | 59 | 677 | 677 |
| `f42edd92` | 143 | 677 | 677 |
| `f4f22abe` | 32 | 677 | 677 |

## Known unreachable (and why)

- Read-only functions leave no trace: stxer traces transactions only, and every read-only here is exercised through `addEvalCode` reads in the harnesses (their lines show as uncovered above). Top-level definitions run at deploy, which has no trace either.
