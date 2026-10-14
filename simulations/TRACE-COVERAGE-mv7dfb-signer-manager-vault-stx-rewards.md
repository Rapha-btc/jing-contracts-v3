# Trace coverage: signer-manager-vault-stx-rewards

From `simulations/trace-coverage-multi.mjs` on 2026-10-14: final deploy bytes `simulations/deploy-bytes-mv7dfb/signer-manager-vault-stx-rewards.clar` (sha256 `4858dbc67c466cd8e7cd0a13bcff32cf0f8e2bc72830f5ee914f270a07d4a731`), counted only where a sim deployed these exact bytes (13 sims).

| metric | value |
|---|---|
| expressions executed / total | 653 / 1023 (63.8%) |
| public functions reached | 30 / 30 |
| branch nodes (if / match / asserts!) | 40: 36 full, 4 partial, 0 never reached |

## Public functions never reached (0)


## Read-only functions with no traced expression (0; read-only calls from Eval steps leave no trace)



## Branches with one arm never taken (4)

| line | function | kind | state |
|---|---|---|---|
| 225 | mirror-stake-for-cycle | if | one arm (else only) |
| 961 | pay-stacker | if | one arm (then only) |
| 1166 | sweep-sbtc-dust | if | one arm (then only) |
| 1206 | sweep-stx-dust | if | one arm (then only) |

## Branch nodes never reached (0)

| line | function | kind |
|---|---|---|

## Function bodies (expressions hit / total)

| function | hit / total |
|---|---|
| ERR_UNAUTHORIZED_ADMIN | 0 / 1 |
| ERR_UNAUTHORIZED_CALLER | 0 / 1 |
| ERR_INVALID_FEES_BIPS | 0 / 1 |
| ERR_INSUFFICIENT_FEES | 0 / 1 |
| ERR_SHARE_MIRROR_MISMATCH | 0 / 1 |
| ERR_SHARES_ALREADY_PINNED | 0 / 1 |
| ERR_NOTHING_TO_DISTRIBUTE | 0 / 1 |
| ERR_NO_DUST | 0 / 1 |
| ERR_BONDS_NOT_SUPPORTED | 0 / 1 |
| ERR_CALLDATA_NOT_SUPPORTED | 0 / 1 |
| ERR_INVALID_LOCK_PERIOD | 0 / 1 |
| ERR_CYCLE_NOT_CLAIMED | 0 / 1 |
| ERR_VAULT_BUSY | 0 / 1 |
| ERR_ZERO_VAULT_FUNDING | 0 / 1 |
| ERR_RECOVERY_TOO_SOON | 0 / 1 |
| ERR_NO_ACTIVE_VAULT | 0 / 1 |
| ERR_NO_PENDING_SWAP_VAULT | 0 / 1 |
| ERR_INVALID_SWAP_VAULT | 0 / 1 |
| ERR_SWAP_VAULT_BUSY | 0 / 1 |
| ERR_SWAP_VAULT_COOLDOWN | 0 / 1 |
| CYCLE_OFFSETS | 0 / 1 |
| mirrored-shares | 0 / 3 |
| cycle-settlement | 0 / 8 |
| EMPTY_SETTLEMENT | 0 / 8 |
| stacker-stx-paid | 0 / 3 |
| stacker-sbtc-accounted | 0 / 3 |
| pending-swap-vault | 0 / 1 |
| vault-cycle | 0 / 1 |
| check-mirror | 6 / 12 |
| distribute-rewards-many | 22 / 41 |
| compute-due | 28 / 51 |
| get-mirrored-shares | 3 / 5 |
| validate-stake! | 14 / 23 |
| mirror-stake-for-cycle | 18 / 29 |
| get-pending-swap-vault | 5 / 8 |
| repair-mirror-many | 22 / 34 |
| sweep-stx-dust | 17 / 26 |
| claim-rewards | 27 / 40 |
| withdraw-fees | 15 / 22 |
| sweep-sbtc-dust | 20 / 29 |
| fold-repair-mirror | 23 / 33 |
| pin-shares | 21 / 30 |
| pay-stacker | 41 / 58 |
| get-swap-status | 16 / 22 |
| get-stacker-rewards | 6 / 8 |
| update-admin | 10 / 13 |
| update-fees | 10 / 13 |
| finalize-swap-vault | 24 / 30 |
| recover-swap-vault | 36 / 45 |
| fold-distribute | 29 / 36 |
| distribute-rewards | 17 / 21 |
| fund-swap-vault | 39 / 48 |
| cancel-swap-vault-proposal | 9 / 11 |
| propose-swap-vault | 21 / 25 |
| confirm-swap-vault | 29 / 34 |
| assert-idle-vault | 15 / 17 |
| get-settlement | 2 / 2 |
| is-pinned | 2 / 2 |
| authorize-pox-5 | 3 / 3 |
| get-swap-vault | 1 / 1 |
| assert-active-vault | 5 / 5 |
| is-admin | 2 / 2 |
| authorize-admin | 5 / 5 |
| get-fee-bips-for-cycle | 3 / 3 |
| refloor-vault | 6 / 6 |
| get-vault-cycle | 1 / 1 |
| set-vault-window-blocks | 6 / 6 |
| set-vault-leeway-bps | 6 / 6 |
| set-vault-slippage-bps | 6 / 6 |
| set-vault-max-chunk-sats | 6 / 6 |
| set-vault-dia-band-bps | 6 / 6 |
| set-vault-router-cooldown | 6 / 6 |
| set-vault-pyth-fee-budget | 6 / 6 |
| jing-take | 6 / 6 |
| router-swap-split | 6 / 6 |
| set-vault-no-pyth-slippage-bps | 6 / 6 |
| router-swap-split-dia | 6 / 6 |
| get-unswapped-for-cycle | 2 / 2 |
| register-self | 6 / 6 |
| get-mirrored-total-shares | 2 / 2 |
| get-fees-bips | 1 / 1 |
| get-earned-fees | 1 / 1 |
| get-unswapped-sats | 1 / 1 |
| get-unpaid-stx | 1 / 1 |

## Sims counted (13)

`de9bd7b8` `1599af88` `38122515` `40bee8c0` `59cdc203` `6f30d6e2` `ad49570e` `ec16a3f8` `d55a9bb0` `da59d087` `5cf1573f` `692f5727` `b8f56b5d`
