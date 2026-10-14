# Trace coverage: jing-buy-stx-core-spread-v1

From `simulations/trace-coverage-multi.mjs` on 2026-10-14: final deploy bytes `simulations/deploy-bytes-mv7dfb/jing-buy-stx-core-spread-v1.clar` (sha256 `0a8639678768e49495a26263d462f0dab100815a83c424121c801124c4e89bd6`), counted only where a sim deployed these exact bytes (5 sims).

| metric | value |
|---|---|
| expressions executed / total | 650 / 928 (70.0%) |
| public functions reached | 8 / 8 |
| branch nodes (if / match / asserts!) | 62: 57 full, 5 partial, 0 never reached |

## Public functions never reached (0)


## Read-only functions with no traced expression (0; read-only calls from Eval steps leave no trace)



## Branches with one arm never taken (5)

| line | function | kind | state |
|---|---|---|---|
| 211 | epoch-payout | match | one arm (then only) |
| 670 | count-reserve-claim | match | one arm (then only) |
| 675 | count-reserve-claim | if | one arm (else only) |
| 679 | count-reserve-claim | if | one arm (else only) |
| 794 | settle-escrow | match | one arm (then only) |

## Branch nodes never reached (0)

| line | function | kind |
|---|---|---|

## Function bodies (expressions hit / total)

| function | hit / total |
|---|---|
| ERR_NOT_AUTHORIZED | 0 / 1 |
| ERR_ALREADY_INITIALIZED | 0 / 1 |
| ERR_NOT_INITIALIZED | 0 / 1 |
| ERR_ZERO_AMOUNT | 0 / 1 |
| ERR_TOO_SMALL | 0 / 1 |
| ERR_NO_POSITION | 0 / 1 |
| ERR_INSUFFICIENT | 0 / 1 |
| ERR_ZERO_PRICE | 0 / 1 |
| ERR_BAD_SPREAD | 0 / 1 |
| ERR_BAD_NAME | 0 / 1 |
| ERR_UPDATE_REQUIRED | 0 / 1 |
| ERR_PUSH_PAUSED | 0 / 1 |
| ERR_ESCROW_COOLDOWN | 0 / 1 |
| ERR_TOO_MANY_SHARES | 0 / 1 |
| epoch-reserve | 0 / 4 |
| positions | 0 / 5 |
| earned | 4 / 10 |
| get-state | 12 / 23 |
| position-of | 6 / 10 |
| epoch-payout | 17 / 26 |
| get-position | 34 / 49 |
| settle-proceeds | 68 / 90 |
| earned-step | 28 / 37 |
| deposit | 66 / 86 |
| pull-to-held-sats | 30 / 39 |
| set-push-paused | 8 / 10 |
| refresh-guard | 12 / 15 |
| withdraw | 93 / 116 |
| push-to-market | 17 / 21 |
| roll-tail | 39 / 48 |
| settle-escrow | 21 / 25 |
| sync | 69 / 82 |
| count-reserve-claim | 20 / 23 |
| push | 21 / 24 |
| miner-mid | 2 / 2 |
| current-floor | 2 / 2 |
| min-market | 2 / 2 |
| get-spread-bps | 1 / 1 |
| get-floor | 1 / 1 |
| market-size | 7 / 7 |
| pooled-sbtc | 4 / 4 |
| final-scale | 3 / 3 |
| carried | 6 / 6 |
| final-unfilled | 2 / 2 |
| final-index | 3 / 3 |
| own-name | 4 / 4 |
| expected-name | 2 / 2 |
| initialize | 25 / 25 |
| on-book | 4 / 4 |
| escrow-for | 10 / 10 |
| claim | 7 / 7 |

## Sims counted (5)

`de9bd7b8` `170b7df3` `33c70bfa` `387017ec` `5cf1573f`
