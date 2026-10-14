# Trace coverage: juice-autostake-safe

From `simulations/trace-coverage-multi.mjs` on 2026-10-14: final deploy bytes `simulations/deploy-bytes-mv7dfb/juice-autostake-safe.clar` (sha256 `599192e3cc933485ca03d9b703fd6aaf56c57929815e141f9fe4aabe872c2500`), counted only where a sim deployed these exact bytes (5 sims).

| metric | value |
|---|---|
| expressions executed / total | 1046 / 1594 (65.6%) |
| public functions reached | 27 / 27 |
| branch nodes (if / match / asserts!) | 114: 114 full, 0 partial, 0 never reached |

## Public functions never reached (0)


## Read-only functions with no traced expression (6; read-only calls from Eval steps leave no trace)

get-pending-config, get-pending-max-gas, get-token-lock-enabled, get-pending-operation, get-owner, get-keeper

## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (0)

| line | function | kind |
|---|---|---|

## Function bodies (expressions hit / total)

| function | hit / total |
|---|---|
| err-unauthorised | 0 / 1 |
| err-invalid-signature | 0 / 1 |
| err-forbidden | 0 / 1 |
| err-unregistered-pubkey | 0 / 1 |
| err-not-admin-pubkey | 0 / 1 |
| err-signature-replay | 0 / 1 |
| err-inactive-required | 0 / 1 |
| err-no-pending-recovery | 0 / 1 |
| err-in-cooldown | 0 / 1 |
| err-invalid-operation | 0 / 1 |
| err-already-executed | 0 / 1 |
| err-vetoed | 0 / 1 |
| err-not-signaled | 0 / 1 |
| err-cooldown-not-passed | 0 / 1 |
| err-threshold-exceeded | 0 / 1 |
| err-cooldown-too-long | 0 / 1 |
| err-cooldown-too-short | 0 / 1 |
| err-no-pending-transfer | 0 / 1 |
| err-token-locked | 0 / 1 |
| err-zero-amount | 0 / 1 |
| err-not-staking | 0 / 1 |
| used-pubkey-authorizations | 0 / 2 |
| used-assertions | 0 / 1 |
| wallet-config | 0 / 11 |
| spent-this-period | 0 / 10 |
| pending-operations | 0 / 16 |
| pending-max-gas | 0 / 6 |
| pending-config | 0 / 8 |
| get-pending-config | 0 / 1 |
| get-pending-max-gas | 0 / 1 |
| pubkey-to-admin | 0 / 1 |
| get-token-lock-enabled | 0 / 1 |
| get-pending-operation | 0 / 1 |
| get-owner | 0 / 2 |
| get-keeper | 0 / 1 |
| create-pending-operation | 14 / 27 |
| get-current-spent | 9 / 17 |
| set-wallet-config | 42 / 72 |
| execute-pending-sbtc-withdrawal | 33 / 53 |
| execute-pending-sbtc-withdrawal-now | 49 / 77 |
| signal-config-change | 20 / 31 |
| confirm-max-gas-amount | 39 / 56 |
| add-spent-stx | 7 / 10 |
| add-spent-sbtc | 7 / 10 |
| add-spent-gas | 7 / 10 |
| would-exceed-stx-threshold | 7 / 10 |
| would-exceed-sbtc-threshold | 7 / 10 |
| restake | 35 / 50 |
| stake-stx-juice | 35 / 49 |
| update-stake-stx-juice | 39 / 54 |
| set-keeper | 29 / 40 |
| propose-max-gas-amount | 11 / 15 |
| sip009-transfer | 33 / 45 |
| veto-operation | 32 / 43 |
| is-admin-pubkey | 6 / 8 |
| propose-recovery | 24 / 32 |
| sbtc-initiate-withdrawal | 46 / 60 |
| unstake | 33 / 43 |
| stx-transfer | 41 / 53 |
| pay-gas-accounted | 24 / 31 |
| execute-pending-sbtc-transfer-now | 47 / 60 |
| sip010-transfer | 48 / 61 |
| toggle-token-lock | 32 / 40 |
| execute-pending-stx-transfer-now | 52 / 65 |
| confirm-transfer-wallet | 41 / 51 |
| verify-signature | 12 / 14 |
| execute-pending-sbtc-transfer | 31 / 36 |
| confirm-recovery | 13 / 15 |
| consume-signature | 14 / 16 |
| execute-pending-stx-transfer | 36 / 41 |
| onboard | 41 / 46 |
| max-gas-per-period | 2 / 2 |
| is-admin-calling | 4 / 4 |
| update-activity | 1 / 1 |
| is-authorized | 9 / 9 |
| propose-transfer-wallet | 11 / 11 |
| is-inactive | 3 / 3 |
| recover-inactive-wallet | 18 / 18 |
| locked-ustx | 2 / 2 |

## Sims counted (5)

`b220ceef` `1d74d1bc` `2333f897` `23732d55` `50de1e4a`
