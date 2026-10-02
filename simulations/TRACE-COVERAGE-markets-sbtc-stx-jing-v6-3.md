# Trace coverage: markets-sbtc-stx-jing-v6-3

From `simulations/trace-coverage.mjs` on 2026-10-02, source at d1a5bea: 52 simulations, 5163 transactions (588 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 3179 / 4407 (72.1%) |
| code lines touched / total | 1732 / 2597 (66.7%) |
| function body lines touched / total (top-level definitions excluded) | 1732 / 2488 (69.6%) |
| branch nodes (if / match / asserts!) | 301: 295 full, 6 partial, 0 never reached |

## Branches with one arm never taken (6)

| line | function | kind | state |
|---|---|---|---|
| 2942 | walk-x-book-step | match | one arm (then only) |
| 2983 | walk-y-book-step | match | one arm (then only) |
| 3538 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3542 | distribute-to-token-y-depositor | if | one arm (then only) |
| 3633 | distribute-to-token-x-depositor | if | one arm (then only) |
| 3637 | distribute-to-token-x-depositor | if | one arm (then only) |

## Branch nodes never reached (0)

| line | function | kind |
|---|---|---|

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 2, 3, 4, 5, 6, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 78, 79, 80, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 194, 201, 205, 209, 216, 227, 235, 243, 252, 261, 265, 281, 289, 303, 307 |
| token-y-deposit-limits | 229, 231 |
| token-x-deposit-limits | 237, 239 |
| token-y-pending-deposits | 245, 248 |
| token-x-pending-deposits | 254, 257 |
| token-y-pending-limits | 283, 285 |
| token-x-pending-limits | 291, 293 |
| ERR_DEPOSIT_TOO_SMALL | 38 |
| ERR_ALREADY_SETTLED | 39 |
| ERR_STALE_PRICE | 40 |
| ERR_PRICE_UNCERTAIN | 41 |
| ERR_NOTHING_TO_WITHDRAW | 42 |
| ERR_ZERO_PRICE | 43 |
| ERR_PAUSED | 44 |
| ERR_NOT_AUTHORIZED | 45 |
| ERR_NOTHING_TO_SETTLE | 46 |
| ERR_QUEUE_FULL | 47 |
| ERR_LIMIT_REQUIRED | 48 |
| ERR_ALREADY_INITIALIZED | 49 |
| ERR_WRONG_TRAIT | 50 |
| ERR_EXPO_MISMATCH | 51 |
| ERR_NOTHING_FILLED | 52 |
| ERR_PARTIAL_FILL | 53 |
| ERR_HAS_RESTING_POSITION | 54 |
| ERR_ZERO_MIN_DEPOSIT | 55 |
| ERR_TAKER_TOO_SMALL | 56 |
| ERR_NOTHING_TO_READMIT | 57 |
| ERR_FEED_MISSING | 58 |
| ERR_USE_CANCEL | 59 |
| ERR_FEED_TIMESTAMP_MISSING | 60 |
| ERR_BAD_SPREAD | 61 |
| ERR_CYCLE_OPEN | 62 |
| ERR_NOT_A_SEAT | 63 |
| ERR_SEATS_FULL | 64 |
| ERR_NOTHING_PENDING | 65 |
| ERR_ALREADY_PENDING | 66 |
| ERR_PRICE_BEFORE_ORDER | 67 |
| ERR_BAD_TREASURY | 68 |
| seated-x | 79 |
| seated-y | 80 |
| token-y-deposits | 188 |
| token-x-deposits | 195 |
| token-y-depositor-list | 203 |
| token-x-depositor-list | 207 |
| cycle-totals | 211 |
| settlements | 218 |
| cancel-token-y-deposit | 1666 |
| cancel-token-x-deposit | 1740 |
| withdraw-token-y | 1815 |
| withdraw-token-x | 1865 |
| walk-x-book-step | 2967 |
| cross-remainder-as-y | 3240 |
| walk-y-book-step | 3008 |
| cross-remainder-as-x | 3310 |

## Per simulation (cumulative executed expressions of markets-sbtc-stx-jing-v6-3)

| sim | txs | before | after |
|---|---|---|---|
| `1b7d24cc` | 93 | 0 | 2023 |
| `21903045` | 156 | 2023 | 2023 |
| `3230d734` | 84 | 2023 | 2023 |
| `3582479f` | 27 | 2023 | 2023 |
| `39ca7d96` | 274 | 2023 | 4291 |
| `46e07863` | 110 | 4291 | 4506 |
| `47a85fe1` | 28 | 4506 | 4571 |
| `562290d6` | 14 | 4571 | 4571 |
| `57267ce2` | 26 | 4571 | 4695 |
| `5c614828` | 41 | 4695 | 4696 |
| `61f875f1` | 142 | 4696 | 4955 |
| `6978f913` | 33 | 4955 | 4955 |
| `6cad6dbd` | 408 | 4955 | 5560 |
| `75c2670a` | 28 | 5560 | 5577 |
| `7e018a44` | 177 | 5577 | 5577 |
| `83dc4c03` | 26 | 5577 | 5577 |
| `93fad242` | 258 | 5577 | 5646 |
| `943409e5` | 330 | 5646 | 5880 |
| `9a4f6fd6` | 20 | 5880 | 5880 |
| `9fc9abef` | 72 | 5880 | 5880 |
| `ab168657` | 454 | 5880 | 6119 |
| `b0991314` | 297 | 6119 | 6146 |
| `b9ed7d25` | 154 | 6146 | 6166 |
| `c30cf48c` | 291 | 6166 | 6166 |
| `c881a35d` | 72 | 6166 | 6166 |
| `d257db96` | 97 | 6166 | 6166 |
| `d3d3140f` | 75 | 6166 | 6166 |
| `d9bb7bc9` | 135 | 6166 | 6168 |
| `e2a4d3b7` | 105 | 6168 | 6168 |
| `e2ff3f33` | 41 | 6168 | 6168 |
| `9dfe9717` | 135 | 6168 | 6168 |
| `eaec8fc5` | 33 | 6168 | 6168 |
| `1dfbde21` | 27 | 6168 | 6168 |
| `1efca09a` | 20 | 6168 | 6168 |
| `30d1544e` | 41 | 6168 | 6168 |
| `343f608e` | 41 | 6168 | 6168 |
| `39549a17` | 93 | 6168 | 6168 |
| `40e456f2` | 21 | 6168 | 6168 |
| `41931700` | 20 | 6168 | 6168 |
| `4584e116` | 33 | 6168 | 6168 |
| `5a4c7687` | 93 | 6168 | 6168 |
| `6ec50f05` | 26 | 6168 | 6168 |
| `84c514ee` | 74 | 6168 | 6168 |
| `9b04485c` | 28 | 6168 | 6168 |
| `b180bda2` | 33 | 6168 | 6168 |
| `bb481e6e` | 28 | 6168 | 6168 |
| `cd3a8ef6` | 116 | 6168 | 6168 |
| `d2e2f058` | 84 | 6168 | 6168 |
| `d72a3abb` | 20 | 6168 | 6168 |
| `def91606` | 72 | 6168 | 6168 |
| `c958da67` | 38 | 6168 | 6168 |
| `313ba242` | 19 | 6168 | 6168 |

## Provenance and trace diagnostics

source d1a5bea, sha256 `ed046155b017d6acad569c6769da050747f4c69db7f627e4767fe0cafea41848`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 5163 |
| no trace returned by stxer | 588 |
| trace decode errors | 0 |
| calls to a counted market instance | 2079 |
| ... of which without a trace | 0 |
| ... of which decode errors | 0 |

| sim | counted instances |
|---|---|
| `1b7d24cc` | markets-sbtc-stx-jing-v6-3 |
| `21903045` | none |
| `3230d734` | none |
| `3582479f` | none |
| `39ca7d96` | capacity-mix-y, capacity-mix-x, capacity-own-y, capacity-own-x, capacity-ownbig-y, capacity-ownbig-x, capacity-edge-y, capacity-edge-x, capacity-foff-y, capacity-foff-x, capacity-ftop-y, capacity-ftop-x, capacity-fin-y, capacity-fin-x, capacity-fout-y, capacity-fout-x |
| `46e07863` | markets-sbtc-stx-jing-v6-3 |
| `47a85fe1` | markets-sbtc-stx-jing-v6-3 |
| `562290d6` | markets-sbtc-stx-jing-v6-3 |
| `57267ce2` | markets-sbtc-stx-jing-v6-3 |
| `5c614828` | markets-sbtc-stx-jing-v6-3 |
| `61f875f1` | swapwalk-ya, swapwalk-yb, swapwalk-yc, swapwalk-xa, swapwalk-xc, swapwalk-rp, swapwalk-rx, swapwalk-tr, swapwalk-tx, swapwalk-full, swapwalk-fullx |
| `6978f913` | none |
| `6cad6dbd` | fullside-y, fullside-x, fullside-yb, fullside-xb |
| `75c2670a` | markets-sbtc-stx-jing-v6-3 |
| `7e018a44` | swoff-mx, swoff-my |
| `83dc4c03` | none |
| `93fad242` | ghost-my, ghost-mx |
| `943409e5` | err-admin-a, err-admin-fx, err-admin-u, err-admin-f, err-admin-p, err-admin-q, err-admin-r, err-admin-s, err-admin-t, err-admin-v |
| `9a4f6fd6` | markets-sbtc-stx-jing-v6-3 |
| `9fc9abef` | markets-sbtc-stx-jing-v6-3 |
| `ab168657` | submit-settle-x, submit-settle-y, zero-limit-after-x, zero-limit-after-y, cancel-exit-x, cancel-exit-y |
| `b0991314` | gaps-my, gaps-mx, gaps-ms |
| `b9ed7d25` | settle-edge-a, settle-edge-b, settle-edge-b2, settle-edge-c, settle-edge-d, settle-edge-e, settle-edge-ex, settle-edge-f, settle-edge-g, settle-edge-i |
| `c30cf48c` | markets-sbtc-stx-jing-v6-3 |
| `c881a35d` | markets-sbtc-stx-jing-v6-3 |
| `d257db96` | coreadm-market, coreadm-market2 |
| `d3d3140f` | gate-blind-y, gate-blind-x, gate-overlap-y, gate-overlap-x, gate-minraise-y, gate-minraise-x |
| `d9bb7bc9` | orphan-my, orphan-mx, orphan-mr |
| `e2a4d3b7` | none |
| `e2ff3f33` | markets-sbtc-stx-jing-v6-3 |
| `9dfe9717` | markets-sbtc-stx-jing-v6-3 |
| `eaec8fc5` | none |
| `1dfbde21` | none |
| `1efca09a` | markets-sbtc-stx-jing-v6-3 |
| `30d1544e` | markets-sbtc-stx-jing-v6-3 |
| `343f608e` | markets-sbtc-stx-jing-v6-3 |
| `39549a17` | markets-sbtc-stx-jing-v6-3 |
| `40e456f2` | markets-sbtc-stx-jing-v6-3 |
| `41931700` | markets-sbtc-stx-jing-v6-3 |
| `4584e116` | none |
| `5a4c7687` | markets-sbtc-stx-jing-v6-3 |
| `6ec50f05` | none |
| `84c514ee` | markets-sbtc-stx-jing-v6-3 |
| `9b04485c` | markets-sbtc-stx-jing-v6-3 |
| `b180bda2` | none |
| `bb481e6e` | markets-sbtc-stx-jing-v6-3 |
| `cd3a8ef6` | none |
| `d2e2f058` | none |
| `d72a3abb` | markets-sbtc-stx-jing-v6-3 |
| `def91606` | markets-sbtc-stx-jing-v6-3 |
| `c958da67` | markets-sbtc-stx-jing-v6-3 |
| `313ba242` | markets-sbtc-stx-jing-v6-3 |

| excluded deployment (name@hash) | sims |
|---|---|
| caphint-probe@2aec8b3d7390 | 1 |
| capprobe-v1@f3aa9aec771c | 1 |
| core-spread-probe@6692e50eeac9 | 1 |
| coreadm-market-mod@e5dbe6a37086 | 1 |
| coreadmprobe-a@b93e272dffa0 | 1 |
| coreadmprobe-b@f893e668e304 | 1 |
| coreadmprobe-c@b93e272dffa0 | 1 |
| dispatch-intermediary@ea6ebbca5b83 | 1 |
| fullside-probe@f952da439f48 | 1 |
| fullside-rung-a@90bd560ac370 | 1 |
| fullside-rung-b@90bd560ac370 | 1 |
| fullside-rung-c@90bd560ac370 | 1 |
| fullside-rung-e@90bd560ac370 | 1 |
| gaps-rung-a@978e892ee783 | 1 |
| gaps-rung-b@978e892ee783 | 1 |
| gaps-rung-c@978e892ee783 | 1 |
| gaps-rung-e@978e892ee783 | 1 |
| gapsprobe-v1@1dbba76a2f0e | 1 |
| gapsprobe-v2@110db6b2a6f1 | 1 |
| ghost-rung-a@fd5a57f28893 | 1 |
| ghost-rung-b@fd5a57f28893 | 1 |
| ghost-rung-c@fd5a57f28893 | 1 |
| ghost-rung-e@fd5a57f28893 | 1 |
| jing-buy-stx-219-06@647254ee5228 | 1 |
| jing-buy-stx-219-07@647254ee5228 | 1 |
| jing-buy-stx-spread-0@584b66804090 | 1 |
| jing-buy-stx-spread-100@584b66804090 | 1 |
| jing-buy-stx-spread-10@584b66804090 | 1 |
| jing-buy-stx-spread-20-floor-219-06@0a149a6ff4d8 | 1 |
| jing-buy-stx-spread-20-floor-219-07@be84fd571376 | 1 |
| jing-buy-stx-spread-20@0d0ed5b473e1 | 1 |
| jing-buy-stx-spread-20@584b66804090 | 3 |
| jing-buy-stx-spread-30@584b66804090 | 3 |
| jing-buy-stx-spread-40@584b66804090 | 2 |
| jing-buy-stx-spread-50@584b66804090 | 1 |
| jing-buy-stx-spread-60@584b66804090 | 1 |
| jing-buy-stx-spread-70@584b66804090 | 1 |
| jing-buy-stx-spread-80@584b66804090 | 1 |
| jing-buy-stx-spread-90@584b66804090 | 1 |
| jing-core-v6@53c9b38a4619 | 2 |
| jing-core-v6@88a689affb23 | 49 |
| jing-ladder-dispatch@cd31a7b28e4f | 2 |
| jing-ladder-v1@0f1e08b02327 | 50 |
| jing-ladder-v1@99a6e9f6db93 | 2 |
| jing-rung-deposit-trait@927fbba48267 | 2 |
| jing-sell-stx-876-25@fc1dd629ada2 | 1 |
| jing-sell-stx-876-29@fc1dd629ada2 | 1 |
| jing-sell-stx-spread-0@fdf5c2b11dad | 1 |
| jing-sell-stx-spread-100@fdf5c2b11dad | 1 |
| jing-sell-stx-spread-10@fdf5c2b11dad | 2 |
| jing-sell-stx-spread-20-cap-876-25@f7c9f926fd3a | 1 |
| jing-sell-stx-spread-20-cap-876-29@f7c9f926fd3a | 1 |
| jing-sell-stx-spread-20@f2eaa44c6464 | 1 |
| jing-sell-stx-spread-20@fdf5c2b11dad | 3 |
| jing-sell-stx-spread-30@fdf5c2b11dad | 3 |
| jing-sell-stx-spread-40@fdf5c2b11dad | 2 |
| jing-sell-stx-spread-50@fdf5c2b11dad | 1 |
| jing-sell-stx-spread-60@fdf5c2b11dad | 1 |
| jing-sell-stx-spread-70@fdf5c2b11dad | 1 |
| jing-sell-stx-spread-80@fdf5c2b11dad | 1 |
| jing-sell-stx-spread-90@fdf5c2b11dad | 1 |
| ladprobe-a1@f548133a8ed7 | 1 |
| ladprobe-a2@f548133a8ed7 | 1 |
| ladprobe-a3@f548133a8ed7 | 1 |
| ladprobe-a4@f548133a8ed7 | 1 |
| ladprobe-a5@f548133a8ed7 | 1 |
| ladprobe-a6@f548133a8ed7 | 1 |
| ladprobe-a7@f548133a8ed7 | 1 |
| ladprobe-a8@f548133a8ed7 | 1 |
| ladprobe-b1@e7873d249211 | 1 |
| ladprobe-b2@e7873d249211 | 1 |
| ladprobe-b3@e7873d249211 | 1 |
| ladprobe-c1@c161c2ac9653 | 1 |
| markets-sbtc-stx-jing-v6-3@04b0a7df781a | 2 |
| markets-sbtc-stx-jing-v6-3@426ca05171b2 | 4 |
| markets-sbtc-stx-jing-v6-3@5c08412fc599 | 4 |
| markets-sbtc-stx-jing-v6-3@90ab6b3d3841 | 2 |
| posprobe-x-90@4a9459822543 | 1 |
| posprobe-y-90@0d7802a77e7d | 1 |
| rtrprobe-v1@8aef90cd6a31 | 22 |
| swap-router-sbtc-stx-jing-v5-3-1step@166a6c1b380c | 2 |
| swap-router-sbtc-stx-jing-v5-3-1step@1af1c2411a9e | 1 |
| swap-router-sbtc-stx-jing-v5-3-1step@c78b38dae831 | 1 |
| swap-router-sbtc-stx-jing-v5-3@882374f40bfd | 8 |
| swap-router-sbtc-stx-jing-v5-3@c28a1d6398eb | 2 |
| swap-router-sbtc-stx-jing-v5-3@c8bb651f0df1 | 9 |
| swap-router-sbtc-stx-jing-v5-3@dc355d4402a4 | 15 |

## Failure arms (error paths), from `failure-arms.mjs --by-source`

HIT = a trace records that asserts! / unwrap! / try! returning early (a passing negative test); ---- = never taken. Reasons for each untaken arm: see the suite README.

```
HIT  public    sync-seat                          L140 asserts! u1028  | ERR_NOT_A_SEAT
---- public    sync-seat                          L142 unwrap!    | ERR_SEATS_FULL
---- public    sync-seat                          L146 unwrap!    | ERR_SEATS_FULL
---- private   park-token-y                       L930 try!       | (try! (contract-call? .jing-core-v6 log-park-y who amount cycle price
---- private   park-token-x                       L958 try!       | (try! (contract-call? .jing-core-v6 log-park-x who amount cycle price
HIT  private   shape-feed                         L1027 unwrap!  u1004  | ERR_PRICE_UNCERTAIN
HIT  private   shape-feed                         L1031 unwrap!  u1025  | ERR_FEED_TIMESTAMP_MISSING
HIT  private   lazer-feeds                        L1039 try!     u2105,u1002  | (decoded (try! (contract-call? LAZER_ORACLE verify-price-feeds update LAZER_DECODER
HIT  private   lazer-feeds                        L1044 unwrap!  u1023  | ERR_FEED_MISSING
HIT  private   lazer-feeds                        L1053 unwrap!  u1023  | ERR_FEED_MISSING
HIT  private   lazer-feeds                        L1064 try!     u1004,u1025  | feed-x: (try! (shape-feed fx publish-time)),
---- private   lazer-feeds                        L1065 try!       | feed-y: (try! (shape-feed fy publish-time)),
HIT  private   fresh-classification-price-aged    L1077 try!     u2105,u1023,u1004,u1025,u1002  | (feeds (try! (lazer-feeds update)))
HIT  private   fresh-classification-price-aged    L1088 asserts! u1003  | ERR_STALE_PRICE
---- private   fresh-classification-price-aged    L1089 asserts!   | ERR_STALE_PRICE
---- private   fresh-classification-price-aged    L1090 asserts!   | ERR_ZERO_PRICE
---- private   fresh-classification-price-aged    L1091 asserts!   | ERR_ZERO_PRICE
HIT  private   fresh-classification-price         L1102 try!     u1004,u1025,u1023,u2105,u1003,u1002  | (ok (get price (try! (fresh-classification-price-aged update))))
HIT  private   deposit-token-y-core               L1227 asserts! u1010  | ERR_QUEUE_FULL
---- private   deposit-token-y-core               L1230 unwrap!    | ERR_QUEUE_FULL
---- private   deposit-token-y-core               L1238 try!       | (try! (contract-call? .jing-core-v6 log-park-y smallest-who smallest-amount
HIT  private   deposit-token-y-core               L1241 try!     u1  | (and (not escrowed) (try! (stx-transfer? amount who current-contract)))
HIT  private   deposit-token-y-core               L1256 try!     u5016  | (try! (contract-call? .jing-core-v6 log-deposit-y who (+ carry amount)
HIT  private   deposit-token-y-core               L1265 unwrap!  u1010  | ERR_QUEUE_FULL
HIT  private   deposit-token-y-core               L1271 try!     u1  | (and (not escrowed) (try! (stx-transfer? amount who current-contract)))
HIT  private   deposit-token-y-core               L1282 try!     u5016  | (try! (contract-call? .jing-core-v6 log-deposit-y who
HIT  public    deposit-token-y                    L1306 asserts! u1007  | ERR_PAUSED
HIT  public    deposit-token-y                    L1307 asserts! u1031  | ERR_ALREADY_PENDING
HIT  public    deposit-token-y                    L1308 asserts! u1026  | ERR_BAD_SPREAD
HIT  public    deposit-token-y                    L1309 asserts! u1011  | ERR_LIMIT_REQUIRED
HIT  public    deposit-token-y                    L1310 asserts! u1013  | ERR_WRONG_TRAIT
HIT  public    deposit-token-y                    L1311 asserts! u1001  | ERR_DEPOSIT_TOO_SMALL
HIT  public    deposit-token-y                    L1319 try!     u1,u5016  | (try! (deposit-token-y-core tx-sender false amount limit-price spread-bps stacks-block-tim
HIT  public    deposit-token-y                    L1323 try!     u1  | (try! (stx-transfer? amount tx-sender current-contract))
---- public    deposit-token-y                    L1330 try!       | (try! (contract-call? .jing-core-v6 log-pending-deposit-y tx-sender amount
HIT  public    settle-token-y-deposit             L1345 unwrap!  u1030  | ERR_NOTHING_PENDING
HIT  public    settle-token-y-deposit             L1346 try!     u2105,u1023,u1003  | (fresh (try! (fresh-classification-price-aged update)))
HIT  public    settle-token-y-deposit             L1359 asserts! u1007  | ERR_PAUSED
HIT  public    settle-token-y-deposit             L1360 asserts! u1013  | ERR_WRONG_TRAIT
HIT  public    settle-token-y-deposit             L1361 asserts! u1032  | ERR_PRICE_BEFORE_ORDER
---- public    settle-token-y-deposit             L1368 try!       | (try! (as-contract? ((with-stx amount))
---- public    settle-token-y-deposit             L1369 try!       | (try! (stx-transfer? amount current-contract who))
HIT  public    settle-token-y-deposit             L1391 asserts! u5016  | (asserts! (is-eq (err deposit-error) ERR_QUEUE_FULL) (err deposit-error))
---- public    settle-token-y-deposit             L1392 try!       | (try! (as-contract? ((with-stx amount))
---- public    settle-token-y-deposit             L1393 try!       | (try! (stx-transfer? amount current-contract who))
---- public    settle-token-y-deposit             L1404 asserts!   | (asserts! (is-eq (err park-error) ERR_QUEUE_FULL) (err park-error))
---- public    settle-token-y-deposit             L1405 try!       | (try! (as-contract? ((with-stx amount))
---- public    settle-token-y-deposit             L1406 try!       | (try! (stx-transfer? amount current-contract who))
HIT  private   deposit-token-x-core               L1470 asserts! u1010  | ERR_QUEUE_FULL
---- private   deposit-token-x-core               L1473 unwrap!    | ERR_QUEUE_FULL
---- private   deposit-token-x-core               L1481 try!       | (try! (contract-call? .jing-core-v6 log-park-x smallest-who smallest-amount
HIT  private   deposit-token-x-core               L1484 try!     u1  | (and (not escrowed) (try! (contract-call? t transfer amount who current-contract none)))
HIT  private   deposit-token-x-core               L1499 try!     u5016  | (try! (contract-call? .jing-core-v6 log-deposit-x who (+ carry amount)
HIT  private   deposit-token-x-core               L1508 unwrap!  u1010  | ERR_QUEUE_FULL
HIT  private   deposit-token-x-core               L1514 try!     u1  | (and (not escrowed) (try! (contract-call? t transfer amount who current-contract none)))
HIT  private   deposit-token-x-core               L1525 try!     u5016  | (try! (contract-call? .jing-core-v6 log-deposit-x who
HIT  public    deposit-token-x                    L1549 asserts! u1007  | ERR_PAUSED
HIT  public    deposit-token-x                    L1550 asserts! u1031  | ERR_ALREADY_PENDING
HIT  public    deposit-token-x                    L1551 asserts! u1026  | ERR_BAD_SPREAD
HIT  public    deposit-token-x                    L1552 asserts! u1011  | ERR_LIMIT_REQUIRED
HIT  public    deposit-token-x                    L1553 asserts! u1013  | ERR_WRONG_TRAIT
HIT  public    deposit-token-x                    L1554 asserts! u1001  | ERR_DEPOSIT_TOO_SMALL
HIT  public    deposit-token-x                    L1562 try!     u1,u5016  | (try! (deposit-token-x-core tx-sender false amount limit-price spread-bps stacks-block-tim
HIT  public    deposit-token-x                    L1566 try!     u1  | (try! (contract-call? t transfer amount tx-sender current-contract none))
---- public    deposit-token-x                    L1573 try!       | (try! (contract-call? .jing-core-v6 log-pending-deposit-x tx-sender amount
HIT  public    settle-token-x-deposit             L1588 unwrap!  u1030  | ERR_NOTHING_PENDING
HIT  public    settle-token-x-deposit             L1589 try!     u2105  | (fresh (try! (fresh-classification-price-aged update)))
HIT  public    settle-token-x-deposit             L1602 asserts! u1007  | ERR_PAUSED
HIT  public    settle-token-x-deposit             L1603 asserts! u1013  | ERR_WRONG_TRAIT
HIT  public    settle-token-x-deposit             L1604 asserts! u1032  | ERR_PRICE_BEFORE_ORDER
---- public    settle-token-x-deposit             L1611 try!       | (try! (as-contract? ((with-ft (contract-of t) asset-name amount))
---- public    settle-token-x-deposit             L1612 try!       | (try! (contract-call? t transfer amount current-contract who none))
HIT  public    settle-token-x-deposit             L1634 asserts! u5016  | (asserts! (is-eq (err deposit-error) ERR_QUEUE_FULL) (err deposit-error))
---- public    settle-token-x-deposit             L1635 try!       | (try! (as-contract? ((with-ft (contract-of t) asset-name amount))
---- public    settle-token-x-deposit             L1636 try!       | (try! (contract-call? t transfer amount current-contract who none))
---- public    settle-token-x-deposit             L1647 asserts!   | (asserts! (is-eq (err park-error) ERR_QUEUE_FULL) (err park-error))
---- public    settle-token-x-deposit             L1648 try!       | (try! (as-contract? ((with-ft (contract-of t) asset-name amount))
---- public    settle-token-x-deposit             L1649 try!       | (try! (contract-call? t transfer amount current-contract who none))
HIT  public    cancel-token-y-deposit             L1674 asserts! u1013  | ERR_WRONG_TRAIT
HIT  public    cancel-token-y-deposit             L1675 asserts! u1005  | ERR_NOTHING_TO_WITHDRAW
---- public    cancel-token-y-deposit             L1681 try!       | (try! (as-contract? ((with-stx pending-amount))
---- public    cancel-token-y-deposit             L1682 try!       | (try! (stx-transfer? pending-amount current-contract caller))
---- public    cancel-token-y-deposit             L1697 try!       | (try! (as-contract? ((with-stx parked))
---- public    cancel-token-y-deposit             L1698 try!       | (try! (stx-transfer? parked current-contract caller))
---- public    cancel-token-y-deposit             L1710 try!       | (try! (as-contract? ((with-stx amount))
---- public    cancel-token-y-deposit             L1711 try!       | (try! (stx-transfer? amount current-contract caller))
HIT  public    cancel-token-x-deposit             L1748 asserts! u1013  | ERR_WRONG_TRAIT
HIT  public    cancel-token-x-deposit             L1749 asserts! u1005  | ERR_NOTHING_TO_WITHDRAW
---- public    cancel-token-x-deposit             L1755 try!       | (try! (as-contract? ((with-ft (contract-of t) asset-name pending-amount))
---- public    cancel-token-x-deposit             L1756 try!       | (try! (contract-call? t transfer pending-amount current-contract caller none))
---- public    cancel-token-x-deposit             L1771 try!       | (try! (as-contract? ((with-ft (contract-of t) asset-name parked))
---- public    cancel-token-x-deposit             L1772 try!       | (try! (contract-call? t transfer parked current-contract caller none))
---- public    cancel-token-x-deposit             L1784 try!       | (try! (as-contract? ((with-ft (contract-of t) asset-name amount))
---- public    cancel-token-x-deposit             L1785 try!       | (try! (contract-call? t transfer amount current-contract caller none))
HIT  public    withdraw-token-y                   L1830 asserts! u1013  | ERR_WRONG_TRAIT
HIT  public    withdraw-token-y                   L1831 asserts! u1005  | ERR_NOTHING_TO_WITHDRAW
HIT  public    withdraw-token-y                   L1832 asserts! u1005  | ERR_NOTHING_TO_WITHDRAW
HIT  public    withdraw-token-y                   L1833 asserts! u1024  | ERR_USE_CANCEL
HIT  public    withdraw-token-y                   L1834 asserts! u1001  | ERR_DEPOSIT_TOO_SMALL
---- public    withdraw-token-y                   L1835 try!       | (try! (as-contract? ((with-stx amount))
---- public    withdraw-token-y                   L1836 try!       | (try! (stx-transfer? amount current-contract caller))
---- public    withdraw-token-y                   L1852 try!       | (try! (contract-call? .jing-core-v6 log-withdraw-y caller amount remaining
HIT  public    withdraw-token-x                   L1880 asserts! u1013  | ERR_WRONG_TRAIT
HIT  public    withdraw-token-x                   L1881 asserts! u1005  | ERR_NOTHING_TO_WITHDRAW
HIT  public    withdraw-token-x                   L1882 asserts! u1005  | ERR_NOTHING_TO_WITHDRAW
HIT  public    withdraw-token-x                   L1883 asserts! u1024  | ERR_USE_CANCEL
HIT  public    withdraw-token-x                   L1884 asserts! u1001  | ERR_DEPOSIT_TOO_SMALL
---- public    withdraw-token-x                   L1885 try!       | (try! (as-contract? ((with-ft (contract-of t) asset-name amount))
---- public    withdraw-token-x                   L1886 try!       | (try! (contract-call? t transfer amount current-contract caller none))
---- public    withdraw-token-x                   L1902 try!       | (try! (contract-call? .jing-core-v6 log-withdraw-x caller amount remaining
HIT  public    readmit-token-y                    L1912 asserts! u1007  | ERR_PAUSED
HIT  public    readmit-token-y                    L1913 asserts! u1022  | ERR_NOTHING_TO_READMIT
HIT  public    readmit-token-y                    L1914 asserts! u1031  | ERR_ALREADY_PENDING
---- public    readmit-token-y                    L1916 try!       | (try! (contract-call? .jing-core-v6 log-pending-readmit-y who amount
HIT  public    settle-token-y-readmit             L1927 unwrap!  u1030  | ERR_NOTHING_PENDING
HIT  public    settle-token-y-readmit             L1928 try!     u2105  | (fresh (try! (fresh-classification-price-aged update)))
HIT  public    settle-token-y-readmit             L1939 asserts! u1007  | ERR_PAUSED
HIT  public    settle-token-y-readmit             L1940 asserts! u1032  | ERR_PRICE_BEFORE_ORDER
---- public    settle-token-y-readmit             L1944 try!       | (try! (contract-call? .jing-core-v6 log-settle-refused-y who "readmit"
HIT  public    settle-token-y-readmit             L1963 unwrap!  u1010  | ERR_QUEUE_FULL
---- public    settle-token-y-readmit             L1969 try!       | (try! (contract-call? .jing-core-v6 log-readmit-y who amount cycle price
HIT  public    readmit-token-x                    L1981 asserts! u1007  | ERR_PAUSED
HIT  public    readmit-token-x                    L1982 asserts! u1022  | ERR_NOTHING_TO_READMIT
HIT  public    readmit-token-x                    L1983 asserts! u1031  | ERR_ALREADY_PENDING
---- public    readmit-token-x                    L1985 try!       | (try! (contract-call? .jing-core-v6 log-pending-readmit-x who amount
HIT  public    settle-token-x-readmit             L1996 unwrap!  u1030  | ERR_NOTHING_PENDING
HIT  public    settle-token-x-readmit             L1997 try!     u2105  | (fresh (try! (fresh-classification-price-aged update)))
HIT  public    settle-token-x-readmit             L2008 asserts! u1007  | ERR_PAUSED
HIT  public    settle-token-x-readmit             L2009 asserts! u1032  | ERR_PRICE_BEFORE_ORDER
---- public    settle-token-x-readmit             L2013 try!       | (try! (contract-call? .jing-core-v6 log-settle-refused-x who "readmit"
HIT  public    settle-token-x-readmit             L2032 unwrap!  u1010  | ERR_QUEUE_FULL
---- public    settle-token-x-readmit             L2038 try!       | (try! (contract-call? .jing-core-v6 log-readmit-x who amount cycle price
HIT  public    set-token-y-limit                  L2051 asserts! u1011  | ERR_LIMIT_REQUIRED
HIT  public    set-token-y-limit                  L2052 asserts! u1026  | ERR_BAD_SPREAD
HIT  public    set-token-y-limit                  L2053 asserts! u1005  | ERR_NOTHING_TO_WITHDRAW
---- public    set-token-y-limit                  L2067 try!       | (try! (contract-call? .jing-core-v6 log-limit-y tx-sender limit-price spread-bps
---- public    set-token-y-limit                  L2078 try!       | (try! (contract-call? .jing-core-v6 log-pending-limit-y tx-sender limit-price
HIT  public    settle-token-y-limit               L2091 unwrap!  u1030  | ERR_NOTHING_PENDING
HIT  public    settle-token-y-limit               L2092 try!     u2105  | (fresh (try! (fresh-classification-price-aged update)))
HIT  public    settle-token-y-limit               L2102 asserts! u1032  | ERR_PRICE_BEFORE_ORDER
---- public    settle-token-y-limit               L2115 try!       | (try! (contract-call? .jing-core-v6 log-settle-refused-y who "limit"
---- public    settle-token-y-limit               L2133 try!       | (try! (contract-call? .jing-core-v6 log-limit-y who limit-price spread-bps
HIT  public    set-token-x-limit                  L2146 asserts! u1011  | ERR_LIMIT_REQUIRED
HIT  public    set-token-x-limit                  L2147 asserts! u1026  | ERR_BAD_SPREAD
HIT  public    set-token-x-limit                  L2148 asserts! u1005  | ERR_NOTHING_TO_WITHDRAW
---- public    set-token-x-limit                  L2162 try!       | (try! (contract-call? .jing-core-v6 log-limit-x tx-sender limit-price spread-bps
---- public    set-token-x-limit                  L2173 try!       | (try! (contract-call? .jing-core-v6 log-pending-limit-x tx-sender limit-price
HIT  public    settle-token-x-limit               L2186 unwrap!  u1030  | ERR_NOTHING_PENDING
HIT  public    settle-token-x-limit               L2187 try!     u2105  | (fresh (try! (fresh-classification-price-aged update)))
HIT  public    settle-token-x-limit               L2197 asserts! u1032  | ERR_PRICE_BEFORE_ORDER
---- public    settle-token-x-limit               L2210 try!       | (try! (contract-call? .jing-core-v6 log-settle-refused-x who "limit"
---- public    settle-token-x-limit               L2228 try!       | (try! (contract-call? .jing-core-v6 log-limit-x who limit-price spread-bps
HIT  public    reprice-or-swap-token-y            L2249 asserts! u1011  | ERR_LIMIT_REQUIRED
HIT  public    reprice-or-swap-token-y            L2250 asserts! u1026  | ERR_BAD_SPREAD
HIT  public    reprice-or-swap-token-y            L2251 asserts! u1005  | ERR_NOTHING_TO_WITHDRAW
HIT  public    reprice-or-swap-token-y            L2252 asserts! u1013  | ERR_WRONG_TRAIT
HIT  public    reprice-or-swap-token-y            L2253 asserts! u1013  | ERR_WRONG_TRAIT
HIT  public    reprice-or-swap-token-y            L2256 try!     u2105  | (let ((price (try! (fresh-classification-price update))))
---- public    reprice-or-swap-token-y            L2261 try!       | (bps (rebate-bps-for-age (get age (try! (fresh-classification-price-aged update)))))
---- public    reprice-or-swap-token-y            L2269 try!       | (try! (contract-call? .jing-core-v6 log-limit-y tx-sender limit-price spread-bps
HIT  public    reprice-or-swap-token-y            L2274 try!     u1  | (try! (stx-transfer? rebate tx-sender current-contract))
HIT  public    reprice-or-swap-token-y            L2280 try!     u1007,u5016  | (let ((result (try! (settle-with-refresh update tx-trait tx-name ty-trait ty-name))))
HIT  public    reprice-or-swap-token-y            L2282 try!     u1017  | (try! (cross-remainder-as-y limit-price (get token-y-rolled result)
---- public    reprice-or-swap-token-y            L2296 try!       | (try! (contract-call? .jing-core-v6 log-limit-y tx-sender limit-price spread-bps
---- public    reprice-or-swap-token-y            L2306 try!       | (try! (contract-call? .jing-core-v6 log-pending-limit-y tx-sender limit-price
HIT  public    reprice-or-swap-token-x            L2335 asserts! u1011  | ERR_LIMIT_REQUIRED
HIT  public    reprice-or-swap-token-x            L2336 asserts! u1026  | ERR_BAD_SPREAD
HIT  public    reprice-or-swap-token-x            L2337 asserts! u1005  | ERR_NOTHING_TO_WITHDRAW
HIT  public    reprice-or-swap-token-x            L2338 asserts! u1013  | ERR_WRONG_TRAIT
HIT  public    reprice-or-swap-token-x            L2339 asserts! u1013  | ERR_WRONG_TRAIT
HIT  public    reprice-or-swap-token-x            L2342 try!     u2105  | (let ((price (try! (fresh-classification-price update))))
---- public    reprice-or-swap-token-x            L2347 try!       | (bps (rebate-bps-for-age (get age (try! (fresh-classification-price-aged update)))))
---- public    reprice-or-swap-token-x            L2355 try!       | (try! (contract-call? .jing-core-v6 log-limit-x tx-sender limit-price spread-bps
HIT  public    reprice-or-swap-token-x            L2360 try!     u1  | (try! (contract-call? tx-trait transfer rebate tx-sender current-contract
HIT  public    reprice-or-swap-token-x            L2368 try!     u1007,u5016  | (let ((result (try! (settle-with-refresh update tx-trait tx-name ty-trait ty-name))))
HIT  public    reprice-or-swap-token-x            L2370 try!     u1017  | (try! (cross-remainder-as-x limit-price (get token-x-rolled result)
---- public    reprice-or-swap-token-x            L2384 try!       | (try! (contract-call? .jing-core-v6 log-limit-x tx-sender limit-price spread-bps
---- public    reprice-or-swap-token-x            L2394 try!       | (try! (contract-call? .jing-core-v6 log-pending-limit-x tx-sender limit-price
---- private   filter-small-token-y-depositor     L2448 try!       | (try! (contract-call? .jing-core-v6 log-small-share-roll-y depositor cycle
---- private   filter-small-token-x-depositor     L2496 try!       | (try! (contract-call? .jing-core-v6 log-small-share-roll-x depositor cycle
---- private   filter-limit-violating-token-y-depositor L2541 try!       | (try! (contract-call? .jing-core-v6 log-limit-roll-y depositor cycle amount
---- private   filter-limit-violating-token-x-depositor L2585 try!       | (try! (contract-call? .jing-core-v6 log-limit-roll-x depositor cycle amount
HIT  public    settle-with-refresh                L2602 asserts! u1013  | ERR_WRONG_TRAIT
HIT  public    settle-with-refresh                L2603 asserts! u1013  | ERR_WRONG_TRAIT
HIT  public    settle-with-refresh                L2605 try!     u1023  | (feeds (try! (lazer-feeds update)))
HIT  public    settle-with-refresh                L2610 try!     u1009,u1007,u1020,u1003,u5016  | (try! (execute-settlement cycle feed-x feed-y tx-trait tx-name ty-trait ty-name))
---- public    settle-with-refresh                L2621 try!       | (try! (fold distribute-to-token-y-depositor (get-token-y-depositors cycle)
---- public    settle-with-refresh                L2627 try!       | (try! (fold distribute-to-token-x-depositor (get-token-x-depositors cycle)
---- public    settle-with-refresh                L2633 try!       | (try! (roll-and-sweep-dust tx-trait tx-name ty-trait ty-name))
HIT  public    swap                               L2655 try!     u1003,u2105  | (aged (try! (fresh-classification-price-aged update)))
HIT  public    swap                               L2675 asserts! u1001  | ERR_DEPOSIT_TOO_SMALL
HIT  public    swap                               L2676 asserts! u1011  | ERR_LIMIT_REQUIRED
HIT  public    swap                               L2677 asserts! u1018  | ERR_HAS_RESTING_POSITION
HIT  public    swap                               L2687 asserts! u1018  | ERR_HAS_RESTING_POSITION
HIT  public    swap                               L2697 asserts! u1001  | ERR_DEPOSIT_TOO_SMALL
HIT  public    swap                               L2705 try!     u1010  | (try! (if deposit-x
HIT  public    swap                               L2714 try!     u1  | (try! (contract-call? tx-trait transfer rebate tx-sender current-contract
HIT  public    swap                               L2720 try!     u1010,u1,u5016  | (try! (deposit-token-x-core tx-sender false net limit-price none stacks-block-time u0 pric
HIT  public    swap                               L2725 try!     u1  | (and (> rebate u0) (try! (stx-transfer? rebate tx-sender current-contract)))
HIT  public    swap                               L2728 try!     u1010,u1,u5016  | (try! (deposit-token-y-core tx-sender false net limit-price none stacks-block-time u0 pric
HIT  public    swap                               L2736 try!     u1009,u1007,u1013,u1020  | (let ((result (try! (settle-with-refresh update tx-trait tx-name ty-trait ty-name))))
HIT  public    swap                               L2739 try!     u1017  | (try! (cross-remainder-as-x limit-price (get token-x-rolled result) tx-trait
HIT  public    swap                               L2744 try!     u1017  | (try! (cross-remainder-as-y limit-price (get token-y-rolled result) tx-trait
---- private   execute-fill                       L2823 try!       | (try! (as-contract? ((with-stx (+ y-traded reb-y)))
---- private   execute-fill                       L2824 try!       | (try! (stx-transfer? (+ (- y-traded y-fee) reb-y) current-contract x-who))
---- private   execute-fill                       L2826 try!       | (try! (stx-transfer? y-fee current-contract (var-get treasury)))
---- private   execute-fill                       L2829 try!       | (try! (as-contract? ((with-ft (contract-of t) tx-name (+ x-traded reb-x)))
---- private   execute-fill                       L2830 try!       | (try! (contract-call? t transfer (+ (- x-traded x-fee) reb-x)
---- private   execute-fill                       L2834 try!       | (try! (contract-call? t transfer x-fee current-contract (var-get treasury)
---- private   execute-fill                       L2886 try!       | (try! (as-contract? ((with-stx y-refund))
---- private   execute-fill                       L2887 try!       | (try! (stx-transfer? y-refund current-contract y-who))
---- private   execute-fill                       L2889 try!       | (try! (contract-call? .jing-core-v6 log-refund-y y-who y-refund cycle
---- private   execute-fill                       L2897 try!       | (try! (as-contract? ((with-ft (contract-of t) tx-name x-refund))
---- private   execute-fill                       L2898 try!       | (try! (contract-call? t transfer x-refund current-contract x-who none))
---- private   execute-fill                       L2900 try!       | (try! (contract-call? .jing-core-v6 log-refund-x x-who x-refund cycle
---- private   execute-fill                       L2912 try!       | (try! (contract-call? .jing-core-v6 log-match
---- private   walk-x-book-step                   L2960 try!       | (try! (execute-fill cycle takr rem maker m-amt l (get mid st) true (get t st)
---- private   walk-y-book-step                   L3001 try!       | (try! (execute-fill cycle maker m-amt takr rem l (get mid st) false
---- private   cross-remainder-as-y               L3246 try!       | (try! (fold walk-x-book-step
---- private   cross-remainder-as-y               L3265 try!       | (try! (as-contract? ((with-stx left))
---- private   cross-remainder-as-y               L3266 try!       | (try! (stx-transfer? left current-contract swapper))
HIT  private   cross-remainder-as-y               L3270 asserts! u1017  | ERR_PARTIAL_FILL
---- private   cross-remainder-as-y               L3274 try!       | (try! (as-contract? ((with-stx rem))
---- private   cross-remainder-as-y               L3275 try!       | (try! (stx-transfer? rem current-contract swapper))
---- private   cross-remainder-as-y               L3289 try!       | (try! (contract-call? .jing-core-v6 log-refund-y swapper rem cycle
---- private   cross-remainder-as-x               L3316 try!       | (try! (fold walk-y-book-step
---- private   cross-remainder-as-x               L3335 try!       | (try! (as-contract? ((with-ft (contract-of t) tx-name left))
---- private   cross-remainder-as-x               L3336 try!       | (try! (contract-call? t transfer left current-contract swapper none))
HIT  private   cross-remainder-as-x               L3340 asserts! u1017  | ERR_PARTIAL_FILL
---- private   cross-remainder-as-x               L3344 try!       | (try! (as-contract? ((with-ft (contract-of t) tx-name rem))
---- private   cross-remainder-as-x               L3345 try!       | (try! (contract-call? t transfer rem current-contract swapper none))
---- private   cross-remainder-as-x               L3359 try!       | (try! (contract-call? .jing-core-v6 log-refund-x swapper rem cycle
HIT  private   execute-settlement                 L3404 asserts! u1007  | ERR_PAUSED
HIT  private   execute-settlement                 L3405 asserts! u1009  | ERR_NOTHING_TO_SETTLE
---- private   execute-settlement                 L3412 asserts!   | ERR_ALREADY_SETTLED
---- private   execute-settlement                 L3413 asserts!   | ERR_ZERO_PRICE
---- private   execute-settlement                 L3414 asserts!   | ERR_ZERO_PRICE
HIT  private   execute-settlement                 L3415 asserts! u1003  | ERR_STALE_PRICE
---- private   execute-settlement                 L3416 asserts!   | ERR_STALE_PRICE
---- private   execute-settlement                 L3417 asserts!   | ERR_PRICE_UNCERTAIN
---- private   execute-settlement                 L3420 asserts!   | ERR_PRICE_UNCERTAIN
---- private   execute-settlement                 L3423 asserts!   | ERR_EXPO_MISMATCH
---- private   execute-settlement                 L3425 asserts!   | ERR_ZERO_PRICE
HIT  private   execute-settlement                 L3440 asserts! u1020  | ERR_TAKER_TOO_SMALL
HIT  private   execute-settlement                 L3470 asserts! u1009  | ERR_NOTHING_TO_SETTLE
---- private   execute-settlement                 L3489 try!       | (try! (as-contract? ((with-stx token-y-fee))
---- private   execute-settlement                 L3490 try!       | (try! (stx-transfer? token-y-fee current-contract (var-get treasury)))
---- private   execute-settlement                 L3495 try!       | (try! (as-contract? ((with-ft (contract-of tx-trait) tx-name token-x-fee))
---- private   execute-settlement                 L3496 try!       | (try! (contract-call? tx-trait transfer token-x-fee current-contract
HIT  private   execute-settlement                 L3514 try!     u5016  | (try! (contract-call? .jing-core-v6 log-settlement cycle oracle-price
---- private   distribute-to-token-y-depositor    L3533 try!       | (unwrapped (try! acc))
---- private   distribute-to-token-y-depositor    L3576 try!       | (try! (as-contract?
---- private   distribute-to-token-y-depositor    L3578 try!       | (try! (contract-call? tt transfer my-token-x-received current-contract
---- private   distribute-to-token-y-depositor    L3601 try!       | (try! (as-contract? ((with-stx my-refund))
---- private   distribute-to-token-y-depositor    L3602 try!       | (try! (stx-transfer? my-refund current-contract depositor))
---- private   distribute-to-token-y-depositor    L3604 try!       | (try! (contract-call? .jing-core-v6 log-refund-y depositor my-refund cycle
---- private   distribute-to-token-y-depositor    L3612 try!       | (try! (contract-call? .jing-core-v6 log-distribute-y-depositor depositor cycle
---- private   distribute-to-token-x-depositor    L3628 try!       | (unwrapped (try! acc))
---- private   distribute-to-token-x-depositor    L3671 try!       | (try! (as-contract? ((with-stx my-token-y-received))
---- private   distribute-to-token-x-depositor    L3672 try!       | (try! (stx-transfer? my-token-y-received current-contract depositor))
---- private   distribute-to-token-x-depositor    L3693 try!       | (try! (as-contract?
---- private   distribute-to-token-x-depositor    L3695 try!       | (try! (contract-call? tt transfer my-refund current-contract depositor
---- private   distribute-to-token-x-depositor    L3699 try!       | (try! (contract-call? .jing-core-v6 log-refund-x depositor my-refund cycle
---- private   distribute-to-token-x-depositor    L3707 try!       | (try! (contract-call? .jing-core-v6 log-distribute-x-depositor depositor cycle
---- private   roll-and-sweep-dust                L3741 try!       | (try! (as-contract? ((with-stx token-y-dust))
---- private   roll-and-sweep-dust                L3742 try!       | (try! (stx-transfer? token-y-dust current-contract (var-get treasury)))
---- private   roll-and-sweep-dust                L3747 try!       | (try! (as-contract? ((with-ft (contract-of tx-trait) tx-name token-x-dust))
---- private   roll-and-sweep-dust                L3748 try!       | (try! (contract-call? tx-trait transfer token-x-dust current-contract
---- private   roll-and-sweep-dust                L3754 try!       | (try! (contract-call? .jing-core-v6 log-sweep-dust acc-token-x-rol acc-token-y-rol
HIT  public    initialize                         L3772 asserts! u1008  | ERR_NOT_AUTHORIZED
HIT  public    initialize                         L3773 asserts! u1008  | ERR_NOT_AUTHORIZED
HIT  public    initialize                         L3776 asserts! u1012  | ERR_ALREADY_INITIALIZED
HIT  public    initialize                         L3777 asserts! u1019  | ERR_ZERO_MIN_DEPOSIT
HIT  public    initialize                         L3785 try!     u5005  | (try! (contract-call? .jing-core-v6 register canonical))
HIT  public    set-treasury                       L3791 asserts! u1008  | ERR_NOT_AUTHORIZED
HIT  public    set-treasury                       L3792 asserts! u1033  | ERR_BAD_TREASURY
HIT  public    set-paused                         L3798 asserts! u1008  | ERR_NOT_AUTHORIZED
HIT  public    set-operator                       L3804 asserts! u1008  | ERR_NOT_AUTHORIZED
HIT  public    set-min-token-y-deposit            L3810 asserts! u1008  | ERR_NOT_AUTHORIZED
HIT  public    set-min-token-y-deposit            L3811 asserts! u1019  | ERR_ZERO_MIN_DEPOSIT
HIT  public    set-min-token-x-deposit            L3817 asserts! u1008  | ERR_NOT_AUTHORIZED
HIT  public    set-min-token-x-deposit            L3818 asserts! u1019  | ERR_ZERO_MIN_DEPOSIT
HIT  public    set-distance-slots                 L3824 asserts! u1008  | ERR_NOT_AUTHORIZED
HIT  public    set-distance-slots                 L3825 asserts! u1010  | ERR_QUEUE_FULL
HIT  private   capacity-rebate-hint               L3940 unwrap!  EarlyReturn(UnwrapFailed(Optional(Option  | none
HIT  private   capacity-rebate-hint               L3941 unwrap!  EarlyReturn(UnwrapFailed(Optional(Option  | none
HIT  private   capacity-rebate-hint               L3943 unwrap!  EarlyReturn(UnwrapFailed(Optional(Option  | none
HIT  private   capacity-rebate-hint               L3944 unwrap!  EarlyReturn(UnwrapFailed(Optional(Option  | none
HIT  private   capacity-rebate-hint               L3945 unwrap!  EarlyReturn(UnwrapFailed(Optional(Option  | none
HIT  private   capacity-rebate-hint               L3946 unwrap!  EarlyReturn(UnwrapFailed(Optional(Option  | none
HIT  private   prune-one                          L4128 try!     u1027  | (let ((pruned (try! acc)))
HIT  private   prune-one                          L4129 asserts! u1027  | ERR_CYCLE_OPEN
159/292 failure arms hit
source sha256 ed046155b017d6acad569c6769da050747f4c69db7f627e4767fe0cafea41848; txs 5163, no trace 588, decode errors 0; calls to counted market instances 2079, of which no trace 0, decode errors 0
```

Reproduce: `node simulations/trace-coverage.mjs --contract markets-sbtc-stx-jing-v6-3 --by-source --md --sims <ids>` and `node simulations/failure-arms.mjs <ids> --by-source --contract markets-sbtc-stx-jing-v6-3` with the sim ids of the 2026-10-01 rerun (README-v6-3-coverage.md section 0, README-router-ladder-coverage.md section 0, README-v1-core-spread-rungs.md).
