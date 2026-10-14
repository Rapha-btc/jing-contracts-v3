# Trace coverage: juice-autostake-safe-auth-helpers-v1

From `simulations/trace-coverage-multi.mjs` on 2026-10-14: final deploy bytes `simulations/deploy-bytes-mv7dfb/juice-autostake-safe-auth-helpers-v1.clar` (sha256 `aabf3ba32c5602b83693f1581adb7a22a2e180df2306673b23f94c61fa61bd70`), counted only where a sim deployed these exact bytes (4 sims).

| metric | value |
|---|---|
| expressions executed / total | 14 / 24 (58.3%) |
| public functions reached | 0 / 0 |
| branch nodes (if / match / asserts!) | 0: 0 full, 0 partial, 0 never reached |

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
| get-domain-hash | 4 / 8 |
| build-set-keeper-hash | 10 / 13 |

## Sims counted (4)

`de9bd7b8` `3270029d` `75074c83` `5cf1573f`
