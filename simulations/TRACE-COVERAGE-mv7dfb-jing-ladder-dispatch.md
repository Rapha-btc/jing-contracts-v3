# Trace coverage: jing-ladder-dispatch

From `simulations/trace-coverage-multi.mjs` on 2026-10-14: final deploy bytes `simulations/deploy-bytes-mv7dfb/jing-ladder-dispatch.clar` (sha256 `25858ef64f1da1458272f53e1654e4e1704bfcb5bdea8fea859202771fe3cabd`), counted only where a sim deployed these exact bytes (4 sims).

| metric | value |
|---|---|
| expressions executed / total | 240 / 380 (63.2%) |
| public functions reached | 6 / 6 |
| branch nodes (if / match / asserts!) | 20: 20 full, 0 partial, 0 never reached |

## Public functions never reached (0)


## Read-only functions with no traced expression (0; read-only calls from Eval steps leave no trace)



## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (0)

| line | function | kind |
|---|---|---|

## Function bodies (expressions hit / total)

| function | hit / total |
|---|---|
| ERR_EMPTY | 0 / 1 |
| ERR_TOTAL | 0 / 1 |
| ERR_ZERO_AMOUNT | 0 / 1 |
| ERR_NOT_SEATED | 0 / 1 |
| ERR_DUPLICATE | 0 / 1 |
| ERR_DIRECT_CALL | 0 / 1 |
| ERR_NOT_REGISTERED_SIDE | 0 / 1 |
| withdraw-many | 28 / 47 |
| claim-many | 30 / 50 |
| dispatch | 32 / 53 |
| exit-one | 26 / 37 |
| deposit-one | 23 / 32 |
| claim-one | 21 / 29 |
| validate-one | 28 / 36 |
| validate-claim | 21 / 27 |
| validate-exit | 25 / 32 |
| deposit-buy | 1 / 1 |
| deposit-sell | 1 / 1 |
| withdraw-buy | 1 / 1 |
| withdraw-sell | 1 / 1 |
| claim-buy | 1 / 1 |
| claim-sell | 1 / 1 |

## Sims counted (4)

`de9bd7b8` `170b7df3` `33c70bfa` `5cf1573f`
