# Trace coverage: markets-sbtc-stx-jing-v6-3

From `simulations/trace-coverage-multi.mjs` on 2026-10-14: final deploy bytes `simulations/deploy-bytes-mv7dfb/markets-sbtc-stx-jing-v6-3.clar` (sha256 `7b2f0f44fca1feaf1e8c30f195d0a639a3daf102db4f4c84060c8062132f5f4c`), counted only where a sim deployed these exact bytes (107 sims).

| metric | value |
|---|---|
| expressions executed / total | 3223 / 4456 (72.3%) |
| public functions reached | 32 / 32 |
| branch nodes (if / match / asserts!) | 307: 303 full, 4 partial, 0 never reached |

## Public functions never reached (0)


## Read-only functions with no traced expression (2; read-only calls from Eval steps leave no trace)

get-taker-rebate-max-bps, get-taker-rebate-bps

## Branches with one arm never taken (4)

| line | function | kind | state |
|---|---|---|---|
| 3605 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3609 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3700 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3704 | distribute-to-token-x-depositor | if | one arm (then only) |

## Branch nodes never reached (0)

| line | function | kind |
|---|---|---|

## Function bodies (expressions hit / total)

| function | hit / total |
|---|---|
| ERR_DEPOSIT_TOO_SMALL | 0 / 1 |
| ERR_ALREADY_SETTLED | 0 / 1 |
| ERR_STALE_PRICE | 0 / 1 |
| ERR_PRICE_UNCERTAIN | 0 / 1 |
| ERR_NOTHING_TO_WITHDRAW | 0 / 1 |
| ERR_ZERO_PRICE | 0 / 1 |
| ERR_PAUSED | 0 / 1 |
| ERR_NOT_AUTHORIZED | 0 / 1 |
| ERR_NOTHING_TO_SETTLE | 0 / 1 |
| ERR_QUEUE_FULL | 0 / 1 |
| ERR_LIMIT_REQUIRED | 0 / 1 |
| ERR_ALREADY_INITIALIZED | 0 / 1 |
| ERR_WRONG_TRAIT | 0 / 1 |
| ERR_EXPO_MISMATCH | 0 / 1 |
| ERR_NOTHING_FILLED | 0 / 1 |
| ERR_PARTIAL_FILL | 0 / 1 |
| ERR_HAS_RESTING_POSITION | 0 / 1 |
| ERR_ZERO_MIN_DEPOSIT | 0 / 1 |
| ERR_TAKER_TOO_SMALL | 0 / 1 |
| ERR_NOTHING_TO_READMIT | 0 / 1 |
| ERR_FEED_MISSING | 0 / 1 |
| ERR_USE_CANCEL | 0 / 1 |
| ERR_FEED_TIMESTAMP_MISSING | 0 / 1 |
| ERR_BAD_SPREAD | 0 / 1 |
| ERR_CYCLE_OPEN | 0 / 1 |
| ERR_NOT_A_SEAT | 0 / 1 |
| ERR_SEATS_FULL | 0 / 1 |
| ERR_NOTHING_PENDING | 0 / 1 |
| ERR_ALREADY_PENDING | 0 / 1 |
| ERR_PRICE_BEFORE_ORDER | 0 / 1 |
| ERR_BAD_TREASURY | 0 / 1 |
| seated-x | 0 / 2 |
| seated-y | 0 / 2 |
| token-y-deposits | 0 / 3 |
| token-x-deposits | 0 / 3 |
| token-y-depositor-list | 0 / 1 |
| token-x-depositor-list | 0 / 1 |
| cycle-totals | 0 / 3 |
| settlements | 0 / 7 |
| token-y-deposit-limits | 0 / 5 |
| token-x-deposit-limits | 0 / 5 |
| token-y-pending-deposits | 0 / 6 |
| token-x-pending-deposits | 0 / 6 |
| token-y-pending-limits | 0 / 5 |
| token-x-pending-limits | 0 / 5 |
| get-token-y-order | 3 / 6 |
| get-token-x-order | 3 / 6 |
| get-cycle-totals | 3 / 5 |
| get-token-y-deposit | 3 / 5 |
| get-token-x-deposit | 3 / 5 |
| get-min-deposits | 3 / 5 |
| seated-on | 3 / 5 |
| sorted-asks | 6 / 10 |
| sorted-bids | 6 / 10 |
| get-taker-capacity | 105 / 170 |
| lazer-feeds | 23 / 35 |
| shape-feed | 14 / 21 |
| collect-ask-step | 28 / 41 |
| collect-bid-step | 28 / 41 |
| capacity-rebate-hint | 26 / 38 |
| park-tenth-token-y | 51 / 73 |
| park-tenth-token-x | 51 / 73 |
| put-limit-y | 7 / 10 |
| put-limit-x | 7 / 10 |
| swap-result-y | 7 / 10 |
| swap-result-x | 7 / 10 |
| cross-remainder-as-y | 54 / 77 |
| cross-remainder-as-x | 56 / 79 |
| top-y-fold | 32 / 45 |
| top-x-fold | 32 / 45 |
| token-y-limit-at | 5 / 7 |
| token-x-limit-at | 5 / 7 |
| withdraw-token-y | 42 / 57 |
| filter-limit-violating-token-y-depositor | 40 / 54 |
| filter-limit-violating-token-x-depositor | 40 / 54 |
| withdraw-token-x | 43 / 58 |
| refresh-seat-count | 6 / 8 |
| find-smallest-token-y-fold | 12 / 16 |
| find-smallest-token-x-fold | 12 / 16 |
| feed-age | 6 / 8 |
| fresh-classification-price-aged | 6 / 8 |
| roll-and-sweep-dust | 52 / 69 |
| fresh-classification-from-feeds | 25 / 33 |
| park-token-y | 19 / 25 |
| park-token-x | 19 / 25 |
| settle-token-y-readmit | 49 / 64 |
| settle-token-x-readmit | 49 / 64 |
| settle-with-verified-feeds | 33 / 43 |
| sync-seat | 20 / 26 |
| reprice-or-swap-token-y | 91 / 118 |
| reprice-or-swap-token-x | 91 / 118 |
| deposit-token-x-core | 82 / 105 |
| filter-small-token-x-depositor | 48 / 61 |
| filter-small-token-y-depositor | 49 / 62 |
| deposit-token-y-core | 83 / 105 |
| settle-token-y-deposit | 81 / 102 |
| cancel-token-y-deposit | 70 / 88 |
| pegged-bid | 8 / 10 |
| pegged-ask | 8 / 10 |
| would-take-as-x | 8 / 10 |
| would-take-as-y | 8 / 10 |
| settle-token-x-deposit | 84 / 105 |
| execute-settlement | 140 / 175 |
| cancel-token-x-deposit | 73 / 91 |
| distribute-to-token-x-depositor | 82 / 102 |
| distribute-to-token-y-depositor | 83 / 103 |
| execute-fill | 158 / 196 |
| deposit-token-y | 46 / 57 |
| deposit-token-x | 46 / 57 |
| settle-token-y-limit | 46 / 57 |
| settle-token-x-limit | 46 / 57 |
| cap-kept-bid-fold | 17 / 21 |
| cap-kept-ask-fold | 17 / 21 |
| live-bid-fold | 14 / 17 |
| live-offer-fold | 14 / 17 |
| walk-x-book-step | 28 / 34 |
| walk-y-book-step | 28 / 34 |
| prune-one | 10 / 12 |
| smallest-outside-y-fold | 21 / 25 |
| smallest-outside-x-fold | 21 / 25 |
| set-token-y-limit | 34 / 40 |
| set-token-x-limit | 34 / 40 |
| top-y-insert | 18 / 21 |
| top-x-insert | 18 / 21 |
| insert-ask-step | 18 / 21 |
| insert-bid-step | 18 / 21 |
| cap-bid-fold | 30 / 35 |
| cap-ask-fold | 30 / 35 |
| side-full-y | 13 / 15 |
| side-full-x | 13 / 15 |
| pick-feed | 7 / 8 |
| swap | 96 / 109 |
| settle-with-refresh | 15 / 17 |
| count-seated-fold | 8 / 9 |
| readmit-token-y | 16 / 18 |
| readmit-token-x | 16 / 18 |
| first-off-y-fold | 13 / 14 |
| first-off-x-fold | 13 / 14 |
| rebate-bps-for-age | 6 / 6 |
| get-distance-slots | 1 / 1 |
| protected-seats | 1 / 1 |
| get-seated-x | 1 / 1 |
| get-seated-y | 1 / 1 |
| is-protected-x | 3 / 3 |
| is-protected-y | 3 / 3 |
| still-seated-x | 1 / 1 |
| still-seated-y | 1 / 1 |
| with-seat | 6 / 6 |
| sync-seat-count | 9 / 9 |
| prune-seats | 9 / 9 |
| get-token-y-pending-readmit | 1 / 1 |
| get-token-x-pending-readmit | 1 / 1 |
| get-token-y-pending-deposit | 1 / 1 |
| get-token-x-pending-deposit | 1 / 1 |
| get-token-y-pending-limit | 1 / 1 |
| get-token-x-pending-limit | 1 / 1 |
| get-token-y-parked | 2 / 2 |
| get-token-x-parked | 2 / 2 |
| get-current-cycle | 1 / 1 |
| get-settlement | 1 / 1 |
| get-token-y-depositors | 3 / 3 |
| get-token-x-depositors | 3 / 3 |
| get-token-y-limit | 2 / 2 |
| get-token-x-limit | 2 / 2 |
| order-y-price | 2 / 2 |
| order-x-price | 2 / 2 |
| valid-spread | 2 / 2 |
| advance-cycle | 4 / 4 |
| not-eq-bumped-token-y | 3 / 3 |
| not-eq-bumped-token-x | 3 / 3 |
| push-quote | 3 / 3 |
| quote-who | 1 / 1 |
| fresh-classification-price | 4 / 4 |
| initialize | 24 / 24 |
| set-treasury | 9 / 9 |
| set-paused | 6 / 6 |
| set-operator | 6 / 6 |
| set-min-token-y-deposit | 8 / 8 |
| set-min-token-x-deposit | 8 / 8 |
| set-distance-slots | 8 / 8 |
| cap-scale | 1 / 1 |
| gross-up | 7 / 7 |
| prune-cycles | 2 / 2 |
| refresh-mid | 1 / 1 |

## Sims counted (107)

`de9bd7b8` `01b8c978` `09bad98f` `0b130236` `0d61fa25` `0d66c62d` `120bc743` `12cf15ee` `1576f5bc` `1599af88` `170b7df3` `18933f00` `18ac074b` `1a4fe982` `21bd3ee2` `227a3969` `27d02561` `28ba3ce9` `2915ed46` `2a6ab8f9` `2b0436de` `2f47455f` `2fd82a2e` `3270029d` `33c70bfa` `34add6e3` `35d275ea` `36b4f87e` `38122515` `387017ec` `3c99bc1e` `3cae36d9` `40bee8c0` `41a52fa1` `41ad661d` `41c6aa11` `46edf261` `4783a1b8` `486a08d0` `4d1bb9ef` `4edd8ba9` `523e3e7d` `526537fa` `54256428` `54912c2f` `54f0da53` `584b4ed5` `58724eb0` `58c0fb76` `59cdc203` `5a727d6d` `5c4cea9a` `613d6d04` `6af504a8` `6c1285d8` `6d426b0f` `6f30d6e2` `7158b1ba` `71ec6fc5` `7388231f` `75074c83` `75f1cd13` `7668f859` `768b1ae9` `76ae817d` `7a5d15a9` `7edc890f` `8063c1da` `839af883` `8854dace` `8a0e577b` `8a2c60cc` `94d5f0c9` `9f01abe4` `a674afe9` `ad49570e` `b18edad1` `b95238c0` `c449ad8c` `c5e9f981` `c63880c2` `c65fd855` `c691ce10` `d0108679` `d05eaf98` `d15c2358` `d4af4cc8` `d72ffae1` `dce4e39c` `dd93a13a` `e3f21dae` `e547999d` `e58d43d1` `e78fe3b2` `e7f75295` `e8c0247d` `ec16a3f8` `f793659c` `fe01ec23` `d55a9bb0` `da59d087` `5cf1573f` `b6fd12bd` `6fd87036` `692f5727` `b8f56b5d` `80c3db54`
