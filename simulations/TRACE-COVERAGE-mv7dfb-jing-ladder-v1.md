# Trace coverage: jing-ladder-v1

From `simulations/trace-coverage-multi.mjs` on 2026-10-14: final deploy bytes `simulations/deploy-bytes-mv7dfb/jing-ladder-v1.clar` (sha256 `6a5e204d47d865047fcb7d80d97e57d13b23fc1bf843958323c8c7d0d10d0dd7`), counted only where a sim deployed these exact bytes (108 sims).

| metric | value |
|---|---|
| expressions executed / total | 247 / 473 (52.2%) |
| public functions reached | 14 / 14 |
| branch nodes (if / match / asserts!) | 24: 24 full, 0 partial, 0 never reached |

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
| ERR_NOT_VERIFIED | 0 / 1 |
| ERR_HASH_MISMATCH | 0 / 1 |
| ERR_ALREADY_REGISTERED | 0 / 1 |
| ERR_PRICE_TAKEN | 0 / 1 |
| ERR_BAD_SIDE | 0 / 1 |
| ERR_NO_PENDING_OWNER | 0 / 1 |
| ERR_TIMELOCK_NOT_ELAPSED | 0 / 1 |
| ERR_NOT_REGISTERED | 0 / 1 |
| ERR_BAND_FULL | 0 / 1 |
| ERR_ALREADY_SEATED | 0 / 1 |
| band-count | 0 / 1 |
| pending-owner | 0 / 1 |
| canonical | 0 / 1 |
| rungs | 0 / 4 |
| registered | 0 / 4 |
| log-deposit | 9 / 22 |
| log-withdraw | 9 / 21 |
| log-rescale | 9 / 21 |
| log-push | 9 / 20 |
| log-payout | 9 / 20 |
| get-rung | 2 / 4 |
| log-epoch-closed | 9 / 18 |
| register-unseated | 19 / 33 |
| register | 31 / 50 |
| retire-band | 16 / 25 |
| seat-band | 20 / 31 |
| get-pending-owner | 4 / 6 |
| propose-owner | 10 / 14 |
| claim-seat | 13 / 17 |
| set-canonical | 10 / 13 |
| accept-owner | 14 / 18 |
| is-band-current | 10 / 12 |
| set-max-band-per-side | 15 / 17 |
| get-max-band-per-side | 1 / 1 |
| get-owner | 1 / 1 |
| get-canonical | 1 / 1 |
| get-registered | 1 / 1 |
| is-registered | 2 / 2 |
| get-band-count | 2 / 2 |
| is-band-side | 3 / 3 |
| is-band-x | 1 / 1 |
| is-band-y | 1 / 1 |
| is-current | 3 / 3 |
| is-current-rung | 3 / 3 |
| valid-side | 7 / 7 |
| rung-of | 3 / 3 |

## Sims counted (108)

`de9bd7b8` `01b8c978` `09bad98f` `0b130236` `0d61fa25` `0d66c62d` `120bc743` `12cf15ee` `1576f5bc` `1599af88` `170b7df3` `18933f00` `18ac074b` `1a4fe982` `21bd3ee2` `227a3969` `27d02561` `28ba3ce9` `2915ed46` `2a6ab8f9` `2b0436de` `2f47455f` `2fd82a2e` `3270029d` `33c70bfa` `34add6e3` `35d275ea` `36b4f87e` `38122515` `387017ec` `3c99bc1e` `3cae36d9` `40bee8c0` `41a52fa1` `41ad661d` `41c6aa11` `46edf261` `4783a1b8` `486a08d0` `4d1bb9ef` `4edd8ba9` `523e3e7d` `526537fa` `54256428` `54912c2f` `54f0da53` `584b4ed5` `58724eb0` `58c0fb76` `59cdc203` `5a727d6d` `5c4cea9a` `613d6d04` `6af504a8` `6c1285d8` `6d426b0f` `6f30d6e2` `7158b1ba` `71ec6fc5` `7388231f` `75074c83` `75f1cd13` `7668f859` `768b1ae9` `76ae817d` `7a5d15a9` `7edc890f` `8063c1da` `839af883` `8854dace` `8a0e577b` `8a2c60cc` `8e95fe58` `94d5f0c9` `9f01abe4` `a674afe9` `ad49570e` `b18edad1` `b95238c0` `c449ad8c` `c5e9f981` `c63880c2` `c65fd855` `c691ce10` `d0108679` `d05eaf98` `d15c2358` `d4af4cc8` `d72ffae1` `dce4e39c` `dd93a13a` `e3f21dae` `e547999d` `e58d43d1` `e78fe3b2` `e7f75295` `e8c0247d` `ec16a3f8` `f793659c` `fe01ec23` `d55a9bb0` `da59d087` `5cf1573f` `b6fd12bd` `6fd87036` `692f5727` `b8f56b5d` `80c3db54`
