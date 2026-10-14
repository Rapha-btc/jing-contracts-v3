# Trace coverage: juice-pool-sbtc-signer

From `simulations/trace-coverage-multi.mjs` on 2026-10-14: final deploy bytes `simulations/deploy-bytes-mv7dfb/juice-pool-sbtc-signer.clar` (sha256 `57d8c3d384f11d955574a0bce365dad788c4cac919708a70d03c2e10af1f9bd6`), counted only where a sim deployed these exact bytes (33 sims).

| metric | value |
|---|---|
| expressions executed / total | 756 / 1243 (60.8%) |
| public functions reached | 37 / 37 |
| branch nodes (if / match / asserts!) | 53: 50 full, 3 partial, 0 never reached |

## Public functions never reached (0)


## Read-only functions with no traced expression (0; read-only calls from Eval steps leave no trace)



## Branches with one arm never taken (3)

| line | function | kind | state |
|---|---|---|---|
| 755 | pay-one | if | one arm (else only) |
| 898 | settle-one | match | one arm (then only) |
| 1121 | pay-recovered-sbtc-one | if | one arm (else only) |

## Branch nodes never reached (0)

| line | function | kind |
|---|---|---|

## Function bodies (expressions hit / total)

| function | hit / total |
|---|---|
| ERR_NOT_RECOVERED | 0 / 1 |
| ERR_SWAP_PENDING | 0 / 1 |
| ERR_NO_PENDING_ADMIN | 0 / 1 |
| pending-swap | 0 / 4 |
| finalized-tranches | 0 / 3 |
| ERR_NO_PENDING_SWAP_VAULT | 0 / 1 |
| ERR_INVALID_SWAP_VAULT | 0 / 1 |
| ERR_SWAP_VAULT_BUSY | 0 / 1 |
| ERR_VAULT_TRANSFER_MISMATCH | 0 / 1 |
| ERR_BOND_NOT_SUPPORTED | 0 / 1 |
| pending-swap-vault | 0 / 1 |
| ERR_UNAUTHORIZED | 0 / 1 |
| ERR_PAUSED | 0 / 1 |
| ERR_NOT_POX5 | 0 / 1 |
| ERR_SETTLE_FAILED | 0 / 1 |
| ERR_TRANCHE_UNPAID | 0 / 1 |
| ERR_NO_DUST | 0 / 1 |
| ERR_NO_NEW_REWARDS | 0 / 1 |
| ERR_INVALID_FEE | 0 / 1 |
| ERR_INSUFFICIENT_FEES | 0 / 1 |
| ERR_TRANCHE_TOO_SOON | 0 / 1 |
| ERR_NO_PENDING_FEE | 0 / 1 |
| ERR_COOLDOWN | 0 / 1 |
| pending-admin | 0 / 1 |
| ERR_OG_NOTHING_TO_ADD | 0 / 1 |
| ERR_OG_CAP_FULL | 0 / 1 |
| ERR_OG_NOT_RAISED | 0 / 1 |
| ERR_OG_NOT_SEATED | 0 / 1 |
| ERR_OG_STILL_STAKED | 0 / 1 |
| pending-fee | 0 / 1 |
| stx-pot | 0 / 3 |
| stx-paid | 0 / 4 |
| tranche-paid | 0 / 3 |
| tranche-paid-shares | 0 / 3 |
| recovered-sbtc-pot | 0 / 3 |
| recovered-sbtc-paid | 0 / 4 |
| recovered-sbtc-tranche-paid | 0 / 3 |
| recovered-sbtc-paid-shares | 0 / 3 |
| get-stx-paid | 2 / 5 |
| get-recovered-sbtc-paid | 2 / 5 |
| pox-settle-stakers | 11 / 23 |
| pay-recovered-sbtc-stakers | 19 / 35 |
| pay-stx-stakers | 31 / 55 |
| get-og-status | 4 / 7 |
| get-stx-pot | 3 / 5 |
| get-tranche-paid | 3 / 5 |
| get-tranche-paid-shares | 3 / 5 |
| is-recovered-tranche | 3 / 5 |
| get-recovered-sbtc-pot | 3 / 5 |
| get-recovered-sbtc-paid-shares | 3 / 5 |
| get-stx-owed | 16 / 26 |
| validate-stake! | 13 / 21 |
| get-pending-admin | 5 / 8 |
| get-pending-swap-vault | 5 / 8 |
| get-pending-fee | 5 / 8 |
| do-withdraw-fees | 13 / 20 |
| pox-claim-rewards | 33 / 50 |
| register-self | 12 / 18 |
| sweep-tranche-dust | 24 / 36 |
| pay-one | 39 / 58 |
| sweep-recovered-sbtc-dust | 23 / 34 |
| pay-recovered-sbtc-one | 44 / 64 |
| settle-one | 9 / 13 |
| take-og-seat | 40 / 57 |
| get-recovered-sbtc-residue | 5 / 7 |
| finalize-swap | 23 / 32 |
| propose-admin | 11 / 15 |
| confirm-fee-bips | 15 / 20 |
| evict-og | 18 / 24 |
| emergency-recover | 18 / 24 |
| accept-admin | 16 / 21 |
| withdraw-sbtc-fees | 16 / 21 |
| propose-fee-bips | 13 / 17 |
| set-paused | 7 / 9 |
| get-staker-fee | 11 / 14 |
| raise-og-cap | 11 / 14 |
| cancel-fee-bips | 8 / 10 |
| cancel-admin-proposal | 9 / 11 |
| cancel-swap-vault-proposal | 9 / 11 |
| propose-swap-vault | 21 / 25 |
| confirm-swap-vault | 29 / 34 |
| assert-idle-vault | 15 / 17 |
| get-admin | 1 / 1 |
| is-paused | 1 / 1 |
| assert-admin | 4 / 4 |
| get-swap-vault | 1 / 1 |
| assert-active-vault | 5 / 5 |
| get-fee-bips | 1 / 1 |
| get-earned-fees | 1 / 1 |
| is-og | 2 / 2 |
| get-og-ustx | 2 / 2 |
| get-effective-fee-bips | 1 / 1 |
| og-staying | 4 / 4 |
| withdraw-fees | 4 / 4 |
| withdraw-all-fees | 5 / 5 |
| get-tranche-count | 2 / 2 |
| get-last-claim-dist-cycle | 1 / 1 |
| get-cycle-total-shares | 1 / 1 |
| get-tranche-residue | 3 / 3 |
| is-tranche-fully-paid | 3 / 3 |
| get-unclaimed-signer-rewards | 1 / 1 |
| get-staker-entitlement | 1 / 1 |
| is-recovered-tranche-fully-paid | 3 / 3 |
| get-earned-sbtc-fees | 1 / 1 |
| refloor-vault | 7 / 7 |
| set-vault-window-blocks | 7 / 7 |
| set-vault-leeway-bps | 7 / 7 |
| set-vault-slippage-bps | 7 / 7 |
| set-vault-max-chunk-sats | 7 / 7 |
| set-vault-dia-band-bps | 7 / 7 |
| set-vault-router-cooldown | 7 / 7 |
| jing-take | 7 / 7 |
| router-swap-split | 7 / 7 |
| get-pending-swap | 1 / 1 |
| set-vault-no-pyth-slippage-bps | 7 / 7 |
| set-vault-pyth-fee-budget | 7 / 7 |
| router-swap-split-dia | 7 / 7 |

## Sims counted (33)

`de9bd7b8` `01b8c978` `0b130236` `12cf15ee` `18933f00` `21bd3ee2` `2fd82a2e` `3270029d` `41ad661d` `46edf261` `4783a1b8` `4edd8ba9` `58c0fb76` `5c4cea9a` `7158b1ba` `7388231f` `75074c83` `768b1ae9` `8063c1da` `839af883` `8a0e577b` `c449ad8c` `c5e9f981` `d0108679` `d4af4cc8` `dd93a13a` `e547999d` `e78fe3b2` `da59d087` `5cf1573f` `b6fd12bd` `6fd87036` `692f5727`
