# Trace coverage: ccd015-redemption-book-mia-stx

From `simulations/trace-coverage-multi.mjs` on 2026-10-14: final deploy bytes `simulations/deploy-bytes-mv7dfb/ccd015-redemption-book-mia-stx.clar` (sha256 `6b5daed326f50f6a84f02526687ec8d7950ea7422521e8cff42c381d3721df57`), counted only where a sim deployed these exact bytes (22 sims).

| metric | value |
|---|---|
| expressions executed / total | 314 / 564 (55.7%) |
| public functions reached | 9 / 9 |
| branch nodes (if / match / asserts!) | 30: 28 full, 1 partial, 1 never reached |

## Public functions never reached (0)


## Read-only functions with no traced expression (8; read-only calls from Eval steps leave no trace)

get-par-ustx, get-par-ustx-per-1m-mia, get-par-scaled, get-offer-book, get-offer-count, get-offer, get-book-totals, get-info

## Branches with one arm never taken (1)

| line | function | kind | state |
|---|---|---|---|
| 242 | calculate-par | if | one arm (else only) |

## Branch nodes never reached (1)

| line | function | kind |
|---|---|---|
| 302 | find-owner-step | if |

## Function bodies (expressions hit / total)

| function | hit / total |
|---|---|
| ERR_UNAUTHORIZED | 0 / 1 |
| ERR_INVALID_OFFER | 0 / 1 |
| ERR_OFFER_NOT_FOUND | 0 / 1 |
| ERR_BOOK_FULL | 0 / 1 |
| ERR_HAS_OFFER | 0 / 1 |
| ERR_BELOW_MIN_DEPOSIT | 0 / 1 |
| ERR_NO_FILL | 0 / 1 |
| ERR_PAUSED | 0 / 1 |
| ERR_ABOVE_PAR | 0 / 1 |
| ERR_NO_BUDGET | 0 / 1 |
| ERR_PAR_NOT_SET | 0 / 1 |
| ERR_PAR_CALCULATION | 0 / 1 |
| MICRO_CITYCOINS | 0 / 1 |
| ONE_MILLION_MIA | 0 / 1 |
| MAX_PER_TRANSACTION | 0 / 1 |
| PAR_SCALE | 0 / 1 |
| min-deposit | 0 / 1 |
| offer-book | 0 / 6 |
| get-par-ustx | 0 / 3 |
| get-par-ustx-per-1m-mia | 0 / 3 |
| get-par-scaled | 0 / 1 |
| get-offer-book | 0 / 1 |
| get-offer-count | 0 / 2 |
| find-owner-step | 0 / 8 |
| get-offer | 0 / 6 |
| sum-step | 0 / 9 |
| get-book-totals | 0 / 5 |
| get-info | 0 / 18 |
| cross-book | 41 / 63 |
| update-par | 14 / 21 |
| change-offer | 43 / 63 |
| insert-step | 22 / 31 |
| cancel-offer | 18 / 25 |
| set-paused | 8 / 11 |
| get-treasury-balance | 8 / 11 |
| settle-step | 49 / 66 |
| refund-rec | 6 / 8 |
| set-min-deposit | 10 / 13 |
| calculate-par | 10 / 13 |
| place-offer | 59 / 76 |
| is-dao-or-extension | 5 / 5 |
| callback | 1 / 1 |
| get-mia-total-supply | 6 / 6 |
| at-or-below-par? | 4 / 4 |
| is-target-owner | 3 / 3 |
| not-target-owner | 4 / 4 |
| push-rec | 3 / 3 |

## Sims counted (22)

`de9bd7b8` `0d61fa25` `2f47455f` `35d275ea` `36b4f87e` `3c99bc1e` `486a08d0` `4d1bb9ef` `523e3e7d` `54256428` `58724eb0` `5a727d6d` `75f1cd13` `7668f859` `8a2c60cc` `b18edad1` `b95238c0` `cfb2ec16` `e3f21dae` `e58d43d1` `e8c0247d` `5cf1573f`
