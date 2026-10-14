# Trace coverage: jing-core-v6

From `simulations/trace-coverage-multi.mjs` on 2026-10-14: final deploy bytes `simulations/deploy-bytes-mv7dfb/jing-core-v6.clar` (sha256 `973482e429cf7d9110847227fdc701443d8d9884b448dce5273579e23ea7fdff`), counted only where a sim deployed these exact bytes (105 sims).

| metric | value |
|---|---|
| expressions executed / total | 567 / 1178 (48.1%) |
| public functions reached | 65 / 65 |
| branch nodes (if / match / asserts!) | 82: 82 full, 0 partial, 0 never reached |

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
| ERR_NOT_AUTHORIZED | 0 / 1 |
| ERR_INVALID_CONTRACT_HASH | 0 / 1 |
| ERR_ALREADY_REGISTERED | 0 / 1 |
| ERR_NOT_VERIFIED | 0 / 1 |
| ERR_HASH_MISMATCH | 0 / 1 |
| ERR_TIMELOCK_NOT_ELAPSED | 0 / 1 |
| ERR_PAUSED | 0 / 1 |
| ERR_NOT_PAUSED | 0 / 1 |
| ERR_NO_PENDING_OWNER | 0 / 1 |
| pending-owner | 0 / 1 |
| verified-contracts | 0 / 1 |
| token-equity | 0 / 3 |
| log-sweep-dust | 6 / 18 |
| log-rfq-fill | 6 / 17 |
| log-settlement | 9 / 25 |
| log-snpl-repay | 7 / 18 |
| log-settle-refused-y | 6 / 15 |
| log-settle-refused-x | 6 / 15 |
| log-pending-deposit-y | 6 / 15 |
| log-pending-deposit-x | 6 / 15 |
| log-limit-roll-x | 6 / 15 |
| log-limit-roll-y | 6 / 15 |
| log-rfq-open | 6 / 15 |
| log-limit-y | 6 / 14 |
| log-limit-x | 6 / 14 |
| log-pending-refund-y | 6 / 14 |
| log-pending-refund-x | 6 / 14 |
| log-pending-limit-y | 6 / 14 |
| log-pending-limit-x | 6 / 14 |
| log-park-x | 6 / 14 |
| log-readmit-x | 6 / 14 |
| log-park-y | 6 / 14 |
| log-readmit-y | 6 / 14 |
| log-withdraw-x | 8 / 18 |
| log-withdraw-y | 8 / 18 |
| log-pending-readmit-y | 6 / 13 |
| log-pending-readmit-x | 6 / 13 |
| log-small-share-roll-x | 6 / 13 |
| log-small-share-roll-y | 6 / 13 |
| log-rfq-cancel | 6 / 13 |
| log-deposit-x | 13 / 28 |
| log-deposit-y | 13 / 28 |
| log-refund-x | 8 / 16 |
| log-refund-y | 8 / 16 |
| log-reserve-open-credit-line | 6 / 12 |
| log-snpl-borrow | 8 / 16 |
| log-snpl-seize | 7 / 14 |
| log-jing-swap-reconciled | 12 / 24 |
| log-distribute-x-depositor | 12 / 23 |
| log-distribute-y-depositor | 12 / 23 |
| log-jing-swap | 12 / 23 |
| log-bitflow-swap | 12 / 22 |
| log-reserve-notify-return | 6 / 11 |
| log-snpl-swap-deposit | 8 / 14 |
| log-match | 17 / 29 |
| get-token-equity | 3 / 5 |
| log-cancel | 6 / 10 |
| log-reserve-set-credit-line-cap | 6 / 10 |
| log-reserve-set-credit-line-interest | 6 / 10 |
| log-snpl-set-swap-limit | 6 / 10 |
| credit | 8 / 13 |
| log-withdraw | 8 / 13 |
| log-reserve-draw | 8 / 13 |
| register | 14 / 22 |
| debit | 12 / 18 |
| log-deposit | 10 / 15 |
| log-revoke | 6 / 9 |
| log-reserve-withdraw-sbtc | 8 / 12 |
| log-reserve-withdraw-stx | 6 / 9 |
| log-reserve-close-credit-line | 6 / 9 |
| log-reserve-set-paused | 6 / 9 |
| log-reserve-set-min-sbtc-draw | 6 / 9 |
| log-snpl-set-reserve | 6 / 9 |
| log-snpl-cancel-swap | 6 / 9 |
| set-verified-contract | 13 / 19 |
| pause | 10 / 14 |
| accept-owner | 10 / 14 |
| log-reserve-supply | 10 / 14 |
| propose-owner | 8 / 11 |
| reconcile-vault-equity | 8 / 10 |
| unpause | 14 / 16 |
| is-verified-contract | 2 / 2 |
| get-verified-hash | 1 / 1 |
| get-contract-owner | 1 / 1 |
| get-pending-owner | 1 / 1 |
| is-paused | 1 / 1 |
| get-paused-at | 1 / 1 |
| get-unpause-eligible-at | 2 / 2 |
| is-registered | 2 / 2 |
| get-total-token-equity | 2 / 2 |
| get-balance | 2 / 2 |
| credit-if-not-registered | 3 / 3 |
| debit-if-not-registered | 3 / 3 |
| credit-if-registered | 3 / 3 |
| check-not-paused | 3 / 3 |

## Sims counted (105)

`de9bd7b8` `01b8c978` `09bad98f` `0b130236` `0d61fa25` `0d66c62d` `120bc743` `12cf15ee` `1576f5bc` `1599af88` `170b7df3` `18933f00` `18ac074b` `1a4fe982` `21bd3ee2` `227a3969` `27d02561` `28ba3ce9` `2915ed46` `2a6ab8f9` `2b0436de` `2f47455f` `2fd82a2e` `3270029d` `33c70bfa` `34add6e3` `35d275ea` `36b4f87e` `38122515` `387017ec` `3c99bc1e` `3cae36d9` `40bee8c0` `41a52fa1` `41ad661d` `41c6aa11` `46edf261` `4783a1b8` `486a08d0` `4d1bb9ef` `4edd8ba9` `523e3e7d` `526537fa` `54256428` `54912c2f` `54f0da53` `584b4ed5` `58724eb0` `58c0fb76` `59cdc203` `5a727d6d` `5c4cea9a` `613d6d04` `6af504a8` `6c1285d8` `6d426b0f` `6f30d6e2` `7158b1ba` `71ec6fc5` `7388231f` `75074c83` `75f1cd13` `7668f859` `768b1ae9` `76ae817d` `7a5d15a9` `7edc890f` `8063c1da` `839af883` `8854dace` `8a0e577b` `8a2c60cc` `94d5f0c9` `9f01abe4` `a674afe9` `ad49570e` `b18edad1` `b95238c0` `c449ad8c` `c5e9f981` `c63880c2` `c65fd855` `c691ce10` `d0108679` `d05eaf98` `d15c2358` `d4af4cc8` `d72ffae1` `dce4e39c` `dd93a13a` `e3f21dae` `e547999d` `e58d43d1` `e78fe3b2` `e7f75295` `e8c0247d` `ec16a3f8` `f793659c` `fe01ec23` `d55a9bb0` `da59d087` `5cf1573f` `b6fd12bd` `6fd87036` `692f5727`
