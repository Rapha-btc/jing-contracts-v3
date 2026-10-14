# Trace coverage: juice-autostake-safe

From `simulations/trace-coverage-multi.mjs` on 2026-10-14: final deploy bytes `simulations/deploy-bytes-mv7dfb/juice-autostake-safe.clar` (sha256 `dda5367c1800f6f541840607ba9b5437f479580d51cd3654c12270024ae28a3d`), counted only where a sim deployed these exact bytes (4 sims).

| metric | value |
|---|---|
| expressions executed / total | 338 / 1588 (21.3%) |
| public functions reached | 10 / 27 |
| branch nodes (if / match / asserts!) | 113: 31 full, 9 partial, 73 never reached |

## Public functions never reached (17)

- propose-max-gas-amount
- confirm-max-gas-amount
- toggle-token-lock
- signal-config-change
- set-wallet-config
- veto-operation
- execute-pending-stx-transfer
- execute-pending-stx-transfer-now
- sip010-transfer
- execute-pending-sbtc-transfer
- execute-pending-sbtc-transfer-now
- sbtc-initiate-withdrawal
- execute-pending-sbtc-withdrawal
- execute-pending-sbtc-withdrawal-now
- sip009-transfer
- propose-recovery
- confirm-recovery

## Read-only functions with no traced expression (6; read-only calls from Eval steps leave no trace)

get-pending-config, get-pending-max-gas, get-token-lock-enabled, get-pending-operation, get-owner, get-keeper

## Branches with one arm never taken (9)

| line | function | kind | state |
|---|---|---|---|
| 167 | pay-gas-accounted | if | one arm (then only) |
| 611 | stx-transfer | match | one arm (else only) |
| 636 | stx-transfer | if | one arm (else only) |
| 650 | stx-transfer | match | one arm (else only) |
| 1124 | is-admin-pubkey | match | one arm (then only) |
| 1173 | confirm-transfer-wallet | match | one arm (else only) |
| 1367 | stake-stx-juice | match | one arm (else only) |
| 1426 | update-stake-stx-juice | match | one arm (else only) |
| 1484 | unstake | match | one arm (else only) |

## Branch nodes never reached (73)

| line | function | kind |
|---|---|---|
| 232 | propose-max-gas-amount | asserts! |
| 261 | confirm-max-gas-amount | if |
| 280 | confirm-max-gas-amount | match |
| 284 | confirm-max-gas-amount | asserts! |
| 285 | confirm-max-gas-amount | asserts! |
| 319 | toggle-token-lock | asserts! |
| 322 | toggle-token-lock | if |
| 323 | toggle-token-lock | match |
| 338 | toggle-token-lock | match |
| 365 | signal-config-change | asserts! |
| 366 | signal-config-change | asserts! |
| 411 | set-wallet-config | if |
| 432 | set-wallet-config | match |
| 436 | set-wallet-config | asserts! |
| 437 | set-wallet-config | asserts! |
| 516 | veto-operation | match |
| 531 | veto-operation | match |
| 538 | veto-operation | asserts! |
| 613 | stx-transfer | asserts! |
| 629 | stx-transfer | match |
| 664 | execute-pending-stx-transfer | asserts! |
| 665 | execute-pending-stx-transfer | asserts! |
| 666 | execute-pending-stx-transfer | asserts! |
| 667 | execute-pending-stx-transfer | asserts! |
| 678 | execute-pending-stx-transfer | match |
| 699 | execute-pending-stx-transfer-now | asserts! |
| 700 | execute-pending-stx-transfer-now | asserts! |
| 701 | execute-pending-stx-transfer-now | asserts! |
| 703 | execute-pending-stx-transfer-now | asserts! |
| 704 | execute-pending-stx-transfer-now | asserts! |
| 718 | execute-pending-stx-transfer-now | match |
| 729 | execute-pending-stx-transfer-now | match |
| 754 | sip010-transfer | match |
| 756 | sip010-transfer | asserts! |
| 773 | sip010-transfer | match |
| 780 | sip010-transfer | if |
| 788 | sip010-transfer | if |
| 809 | execute-pending-sbtc-transfer | asserts! |
| 810 | execute-pending-sbtc-transfer | asserts! |
| 811 | execute-pending-sbtc-transfer | asserts! |
| 812 | execute-pending-sbtc-transfer | asserts! |
| 845 | execute-pending-sbtc-transfer-now | asserts! |
| 846 | execute-pending-sbtc-transfer-now | asserts! |
| 847 | execute-pending-sbtc-transfer-now | asserts! |
| 849 | execute-pending-sbtc-transfer-now | asserts! |
| 850 | execute-pending-sbtc-transfer-now | asserts! |
| 864 | execute-pending-sbtc-transfer-now | match |
| 902 | sbtc-initiate-withdrawal | match |
| 904 | sbtc-initiate-withdrawal | asserts! |
| 920 | sbtc-initiate-withdrawal | match |
| 927 | sbtc-initiate-withdrawal | if |
| 955 | execute-pending-sbtc-withdrawal | asserts! |
| 956 | execute-pending-sbtc-withdrawal | asserts! |
| 957 | execute-pending-sbtc-withdrawal | asserts! |
| 958 | execute-pending-sbtc-withdrawal | asserts! |
| 1006 | execute-pending-sbtc-withdrawal-now | asserts! |
| 1007 | execute-pending-sbtc-withdrawal-now | asserts! |
| 1008 | execute-pending-sbtc-withdrawal-now | asserts! |
| 1010 | execute-pending-sbtc-withdrawal-now | asserts! |
| 1011 | execute-pending-sbtc-withdrawal-now | asserts! |
| 1025 | execute-pending-sbtc-withdrawal-now | match |
| 1077 | sip009-transfer | match |
| 1079 | sip009-transfer | asserts! |
| 1095 | sip009-transfer | match |
| 1296 | propose-recovery | match |
| 1301 | propose-recovery | asserts! |
| 1314 | confirm-recovery | asserts! |
| 1369 | stake-stx-juice | asserts! |
| 1383 | stake-stx-juice | match |
| 1428 | update-stake-stx-juice | asserts! |
| 1443 | update-stake-stx-juice | match |
| 1486 | unstake | asserts! |
| 1498 | unstake | match |

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
| add-spent-sbtc | 0 / 10 |
| pending-operations | 0 / 16 |
| pending-max-gas | 0 / 6 |
| pending-config | 0 / 8 |
| get-pending-config | 0 / 1 |
| get-pending-max-gas | 0 / 1 |
| propose-max-gas-amount | 0 / 15 |
| pubkey-to-admin | 0 / 1 |
| confirm-max-gas-amount | 0 / 56 |
| get-token-lock-enabled | 0 / 1 |
| toggle-token-lock | 0 / 40 |
| signal-config-change | 0 / 31 |
| set-wallet-config | 0 / 72 |
| create-pending-operation | 0 / 27 |
| veto-operation | 0 / 43 |
| get-pending-operation | 0 / 1 |
| would-exceed-sbtc-threshold | 0 / 10 |
| execute-pending-stx-transfer | 0 / 41 |
| execute-pending-stx-transfer-now | 0 / 65 |
| sip010-transfer | 0 / 61 |
| execute-pending-sbtc-transfer | 0 / 36 |
| execute-pending-sbtc-transfer-now | 0 / 60 |
| sbtc-initiate-withdrawal | 0 / 60 |
| execute-pending-sbtc-withdrawal | 0 / 53 |
| execute-pending-sbtc-withdrawal-now | 0 / 77 |
| sip009-transfer | 0 / 45 |
| get-owner | 0 / 2 |
| propose-recovery | 0 / 32 |
| confirm-recovery | 0 / 15 |
| get-keeper | 0 / 1 |
| stx-transfer | 15 / 53 |
| update-stake-stx-juice | 17 / 53 |
| unstake | 14 / 43 |
| stake-stx-juice | 16 / 48 |
| get-current-spent | 9 / 17 |
| add-spent-stx | 7 / 10 |
| add-spent-gas | 7 / 10 |
| would-exceed-stx-threshold | 7 / 10 |
| restake | 35 / 50 |
| set-keeper | 29 / 40 |
| confirm-transfer-wallet | 35 / 47 |
| is-admin-pubkey | 6 / 8 |
| pay-gas-accounted | 24 / 31 |
| verify-signature | 12 / 14 |
| consume-signature | 14 / 16 |
| onboard | 41 / 46 |
| max-gas-per-period | 2 / 2 |
| is-admin-calling | 4 / 4 |
| update-activity | 1 / 1 |
| is-authorized | 9 / 9 |
| propose-transfer-wallet | 11 / 11 |
| is-inactive | 3 / 3 |
| recover-inactive-wallet | 18 / 18 |
| locked-ustx | 2 / 2 |

## Sims counted (4)

`de9bd7b8` `3270029d` `75074c83` `5cf1573f`
