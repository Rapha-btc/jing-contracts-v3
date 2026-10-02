# Trace coverage: jing-buy-stx-core-spread-v1

From `simulations/trace-coverage.mjs` on 2026-10-02, source at d1a5bea: 52 simulations, 5163 transactions (588 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 650 / 928 (70.0%) |
| code lines touched / total | 375 / 545 (68.8%) |
| function body lines touched / total (top-level definitions excluded) | 375 / 494 (75.9%) |
| branch nodes (if / match / asserts!) | 62: 57 full, 5 partial, 0 never reached |

## Branches with one arm never taken (5)

| line | function | kind | state |
|---|---|---|---|
| 319 | epoch-payout | match | one arm (then only) |
| 876 | count-reserve-claim | match | one arm (then only) |
| 881 | count-reserve-claim | if | one arm (else only) |
| 885 | count-reserve-claim | if | one arm (else only) |
| 1020 | settle-escrow | match | one arm (then only) |

## Branch nodes never reached (0)

| line | function | kind |
|---|---|---|

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 68, 69, 72, 73, 74, 75, 76, 85, 87, 88, 89, 90, 91, 94, 96, 99, 107, 108, 153, 155, 157, 159, 160, 163, 166, 168, 173, 179, 189, 190, 194, 195, 197, 199, 201, 206, 209, 213, 216, 219, 221 |
| ERR_NOT_AUTHORIZED | 47 |
| ERR_ALREADY_INITIALIZED | 48 |
| ERR_NOT_INITIALIZED | 49 |
| ERR_ZERO_AMOUNT | 50 |
| ERR_TOO_SMALL | 51 |
| ERR_NO_POSITION | 52 |
| ERR_INSUFFICIENT | 53 |
| ERR_ZERO_PRICE | 54 |
| ERR_BAD_SPREAD | 55 |
| ERR_BAD_NAME | 56 |
| ERR_UPDATE_REQUIRED | 73 |
| ERR_PUSH_PAUSED | 74 |
| ERR_ESCROW_COOLDOWN | 75 |
| ERR_TOO_MANY_SHARES | 76 |
| epoch-reserve | 181 |
| positions | 223 |
| epoch-payout | 330 |
| settle-escrow | 1036 |

## Per simulation (cumulative executed expressions of jing-buy-stx-core-spread-v1)

| sim | txs | before | after |
|---|---|---|---|
| `1b7d24cc` | 93 | 0 | 0 |
| `21903045` | 156 | 0 | 0 |
| `3230d734` | 84 | 0 | 0 |
| `3582479f` | 27 | 0 | 0 |
| `39ca7d96` | 274 | 0 | 0 |
| `46e07863` | 110 | 0 | 0 |
| `47a85fe1` | 28 | 0 | 0 |
| `562290d6` | 14 | 0 | 0 |
| `57267ce2` | 26 | 0 | 0 |
| `5c614828` | 41 | 0 | 0 |
| `61f875f1` | 142 | 0 | 0 |
| `6978f913` | 33 | 0 | 0 |
| `6cad6dbd` | 408 | 0 | 0 |
| `75c2670a` | 28 | 0 | 0 |
| `7e018a44` | 177 | 0 | 0 |
| `83dc4c03` | 26 | 0 | 0 |
| `93fad242` | 258 | 0 | 0 |
| `943409e5` | 330 | 0 | 0 |
| `9a4f6fd6` | 20 | 0 | 0 |
| `9fc9abef` | 72 | 0 | 0 |
| `ab168657` | 454 | 0 | 0 |
| `b0991314` | 297 | 0 | 0 |
| `b9ed7d25` | 154 | 0 | 0 |
| `c30cf48c` | 291 | 0 | 1127 |
| `c881a35d` | 72 | 1127 | 1127 |
| `d257db96` | 97 | 1127 | 1127 |
| `d3d3140f` | 75 | 1127 | 1127 |
| `d9bb7bc9` | 135 | 1127 | 1127 |
| `e2a4d3b7` | 105 | 1127 | 1127 |
| `e2ff3f33` | 41 | 1127 | 1127 |
| `9dfe9717` | 135 | 1127 | 1130 |
| `eaec8fc5` | 33 | 1130 | 1130 |
| `1dfbde21` | 27 | 1130 | 1130 |
| `1efca09a` | 20 | 1130 | 1130 |
| `30d1544e` | 41 | 1130 | 1130 |
| `343f608e` | 41 | 1130 | 1130 |
| `39549a17` | 93 | 1130 | 1130 |
| `40e456f2` | 21 | 1130 | 1130 |
| `41931700` | 20 | 1130 | 1130 |
| `4584e116` | 33 | 1130 | 1130 |
| `5a4c7687` | 93 | 1130 | 1130 |
| `6ec50f05` | 26 | 1130 | 1130 |
| `84c514ee` | 74 | 1130 | 1130 |
| `9b04485c` | 28 | 1130 | 1130 |
| `b180bda2` | 33 | 1130 | 1130 |
| `bb481e6e` | 28 | 1130 | 1130 |
| `cd3a8ef6` | 116 | 1130 | 1130 |
| `d2e2f058` | 84 | 1130 | 1130 |
| `d72a3abb` | 20 | 1130 | 1130 |
| `def91606` | 72 | 1130 | 1130 |
| `c958da67` | 38 | 1130 | 1130 |
| `313ba242` | 19 | 1130 | 1130 |

## Provenance and trace diagnostics

source d1a5bea, sha256 `584b66804090ae2363244e277a6e840f1d60ece92ad67ee5525a772e0f3e9467`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 5163 |
| no trace returned by stxer | 588 |
| trace decode errors | 0 |
| calls to a counted market instance | 134 |
| ... of which without a trace | 0 |
| ... of which decode errors | 0 |

| sim | counted instances |
|---|---|
| `1b7d24cc` | none |
| `21903045` | none |
| `3230d734` | none |
| `3582479f` | none |
| `39ca7d96` | none |
| `46e07863` | none |
| `47a85fe1` | none |
| `562290d6` | none |
| `57267ce2` | none |
| `5c614828` | none |
| `61f875f1` | none |
| `6978f913` | none |
| `6cad6dbd` | none |
| `75c2670a` | none |
| `7e018a44` | none |
| `83dc4c03` | none |
| `93fad242` | none |
| `943409e5` | none |
| `9a4f6fd6` | none |
| `9fc9abef` | none |
| `ab168657` | none |
| `b0991314` | none |
| `b9ed7d25` | none |
| `c30cf48c` | jing-buy-stx-spread-20, jing-buy-stx-spread-30 |
| `c881a35d` | jing-buy-stx-spread-20, jing-buy-stx-spread-30, jing-buy-stx-spread-40 |
| `d257db96` | none |
| `d3d3140f` | none |
| `d9bb7bc9` | none |
| `e2a4d3b7` | none |
| `e2ff3f33` | none |
| `9dfe9717` | jing-buy-stx-spread-0, jing-buy-stx-spread-10, jing-buy-stx-spread-20, jing-buy-stx-spread-30, jing-buy-stx-spread-40, jing-buy-stx-spread-50, jing-buy-stx-spread-60, jing-buy-stx-spread-70, jing-buy-stx-spread-80, jing-buy-stx-spread-90, jing-buy-stx-spread-100 |
| `eaec8fc5` | none |
| `1dfbde21` | none |
| `1efca09a` | none |
| `30d1544e` | none |
| `343f608e` | none |
| `39549a17` | none |
| `40e456f2` | none |
| `41931700` | none |
| `4584e116` | none |
| `5a4c7687` | none |
| `6ec50f05` | none |
| `84c514ee` | none |
| `9b04485c` | none |
| `b180bda2` | none |
| `bb481e6e` | none |
| `cd3a8ef6` | none |
| `d2e2f058` | none |
| `d72a3abb` | none |
| `def91606` | none |
| `c958da67` | none |
| `313ba242` | none |

| excluded deployment (name@hash) | sims |
|---|---|
| cancel-exit-x@ed046155b017 | 1 |
| cancel-exit-y@ed046155b017 | 1 |
| capacity-edge-x@ed046155b017 | 1 |
| capacity-edge-y@ed046155b017 | 1 |
| capacity-fin-x@ed046155b017 | 1 |
| capacity-fin-y@ed046155b017 | 1 |
| capacity-foff-x@ed046155b017 | 1 |
| capacity-foff-y@ed046155b017 | 1 |
| capacity-fout-x@ed046155b017 | 1 |
| capacity-fout-y@ed046155b017 | 1 |
| capacity-ftop-x@ed046155b017 | 1 |
| capacity-ftop-y@ed046155b017 | 1 |
| capacity-mix-x@ed046155b017 | 1 |
| capacity-mix-y@ed046155b017 | 1 |
| capacity-own-x@ed046155b017 | 1 |
| capacity-own-y@ed046155b017 | 1 |
| capacity-ownbig-x@ed046155b017 | 1 |
| capacity-ownbig-y@ed046155b017 | 1 |
| caphint-probe@2aec8b3d7390 | 1 |
| capprobe-v1@f3aa9aec771c | 1 |
| core-spread-probe@6692e50eeac9 | 1 |
| coreadm-market-mod@e5dbe6a37086 | 1 |
| coreadm-market2@ed046155b017 | 1 |
| coreadm-market@ed046155b017 | 1 |
| coreadmprobe-a@b93e272dffa0 | 1 |
| coreadmprobe-b@f893e668e304 | 1 |
| coreadmprobe-c@b93e272dffa0 | 1 |
| dispatch-intermediary@ea6ebbca5b83 | 1 |
| err-admin-a@ed046155b017 | 1 |
| err-admin-f@ed046155b017 | 1 |
| err-admin-fx@ed046155b017 | 1 |
| err-admin-p@ed046155b017 | 1 |
| err-admin-q@ed046155b017 | 1 |
| err-admin-r@ed046155b017 | 1 |
| err-admin-s@ed046155b017 | 1 |
| err-admin-t@ed046155b017 | 1 |
| err-admin-u@ed046155b017 | 1 |
| err-admin-v@ed046155b017 | 1 |
| fullside-probe@f952da439f48 | 1 |
| fullside-rung-a@90bd560ac370 | 1 |
| fullside-rung-b@90bd560ac370 | 1 |
| fullside-rung-c@90bd560ac370 | 1 |
| fullside-rung-e@90bd560ac370 | 1 |
| fullside-x@ed046155b017 | 1 |
| fullside-xb@ed046155b017 | 1 |
| fullside-y@ed046155b017 | 1 |
| fullside-yb@ed046155b017 | 1 |
| gaps-ms@ed046155b017 | 1 |
| gaps-mx@ed046155b017 | 1 |
| gaps-my@ed046155b017 | 1 |
| gaps-rung-a@978e892ee783 | 1 |
| gaps-rung-b@978e892ee783 | 1 |
| gaps-rung-c@978e892ee783 | 1 |
| gaps-rung-e@978e892ee783 | 1 |
| gapsprobe-v1@1dbba76a2f0e | 1 |
| gapsprobe-v2@110db6b2a6f1 | 1 |
| gate-blind-x@ed046155b017 | 1 |
| gate-blind-y@ed046155b017 | 1 |
| gate-minraise-x@ed046155b017 | 1 |
| gate-minraise-y@ed046155b017 | 1 |
| gate-overlap-x@ed046155b017 | 1 |
| gate-overlap-y@ed046155b017 | 1 |
| ghost-mx@ed046155b017 | 1 |
| ghost-my@ed046155b017 | 1 |
| ghost-rung-a@fd5a57f28893 | 1 |
| ghost-rung-b@fd5a57f28893 | 1 |
| ghost-rung-c@fd5a57f28893 | 1 |
| ghost-rung-e@fd5a57f28893 | 1 |
| jing-buy-stx-219-06@647254ee5228 | 1 |
| jing-buy-stx-219-07@647254ee5228 | 1 |
| jing-buy-stx-spread-20-floor-219-06@0a149a6ff4d8 | 1 |
| jing-buy-stx-spread-20-floor-219-07@be84fd571376 | 1 |
| jing-buy-stx-spread-20@0d0ed5b473e1 | 1 |
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
| markets-sbtc-stx-jing-v6-3@ed046155b017 | 27 |
| orphan-mr@ed046155b017 | 1 |
| orphan-mx@ed046155b017 | 1 |
| orphan-my@ed046155b017 | 1 |
| posprobe-x-90@4a9459822543 | 1 |
| posprobe-y-90@0d7802a77e7d | 1 |
| rtrprobe-v1@8aef90cd6a31 | 22 |
| settle-edge-a@ed046155b017 | 1 |
| settle-edge-b2@ed046155b017 | 1 |
| settle-edge-b@ed046155b017 | 1 |
| settle-edge-c@ed046155b017 | 1 |
| settle-edge-d@ed046155b017 | 1 |
| settle-edge-e@ed046155b017 | 1 |
| settle-edge-ex@ed046155b017 | 1 |
| settle-edge-f@ed046155b017 | 1 |
| settle-edge-g@ed046155b017 | 1 |
| settle-edge-i@ed046155b017 | 1 |
| submit-settle-x@ed046155b017 | 1 |
| submit-settle-y@ed046155b017 | 1 |
| swap-router-sbtc-stx-jing-v5-3-1step@166a6c1b380c | 2 |
| swap-router-sbtc-stx-jing-v5-3-1step@1af1c2411a9e | 1 |
| swap-router-sbtc-stx-jing-v5-3-1step@c78b38dae831 | 1 |
| swap-router-sbtc-stx-jing-v5-3@882374f40bfd | 8 |
| swap-router-sbtc-stx-jing-v5-3@c28a1d6398eb | 2 |
| swap-router-sbtc-stx-jing-v5-3@c8bb651f0df1 | 9 |
| swap-router-sbtc-stx-jing-v5-3@dc355d4402a4 | 15 |
| swapwalk-full@ed046155b017 | 1 |
| swapwalk-fullx@ed046155b017 | 1 |
| swapwalk-rp@ed046155b017 | 1 |
| swapwalk-rx@ed046155b017 | 1 |
| swapwalk-tr@ed046155b017 | 1 |
| swapwalk-tx@ed046155b017 | 1 |
| swapwalk-xa@ed046155b017 | 1 |
| swapwalk-xc@ed046155b017 | 1 |
| swapwalk-ya@ed046155b017 | 1 |
| swapwalk-yb@ed046155b017 | 1 |
| swapwalk-yc@ed046155b017 | 1 |
| swoff-mx@ed046155b017 | 1 |
| swoff-my@ed046155b017 | 1 |
| zero-limit-after-x@ed046155b017 | 1 |
| zero-limit-after-y@ed046155b017 | 1 |

## Failure arms (error paths), from `failure-arms.mjs --by-source`

HIT = a trace records that asserts! / unwrap! / try! returning early (a passing negative test); ---- = never taken. Reasons for each untaken arm: see the suite README.

```
HIT  public    initialize                         L463 asserts! u7001  | ERR_NOT_AUTHORIZED
HIT  public    initialize                         L466 asserts! u7002  | ERR_ALREADY_INITIALIZED
HIT  public    initialize                         L467 asserts! u7010  | ERR_BAD_SPREAD
HIT  public    initialize                         L468 asserts! u7009  | ERR_BAD_NAME
HIT  public    initialize                         L481 try!     u6003,u6011  | (try! (contract-call? LADDER register SIDE bps u0))
---- public    initialize                         L482 try!       | (try! (contract-call? MARKET sync-seat current-contract))
HIT  public    initialize                         L486 try!     u6003  | (try! (contract-call? LADDER register-unseated SIDE bps u0))
HIT  public    set-push-paused                    L497 asserts! u7001  | ERR_NOT_AUTHORIZED
HIT  public    sync                               L527 asserts! u7003  | ERR_NOT_INITIALIZED
---- public    sync                               L553 try!       | (try! (roll-tail))
HIT  public    deposit                            L589 asserts! u7003  | ERR_NOT_INITIALIZED
HIT  public    deposit                            L590 asserts! u7005  | ERR_TOO_SMALL
---- public    deposit                            L593 try!       | (try! (sync))
---- public    deposit                            L594 try!       | (let ((paid (try! (settle-proceeds member))))
HIT  public    deposit                            L595 try!     u1  | (try! (contract-call? SBTC transfer amount member current-contract none))
---- public    deposit                            L613 asserts!   | ERR_TOO_MANY_SHARES
HIT  public    push                               L665 asserts! u7003  | ERR_NOT_INITIALIZED
---- public    push                               L666 try!       | (try! (sync))
HIT  public    withdraw                           L692 asserts! u7006  | ERR_NO_POSITION
HIT  public    withdraw                           L693 asserts! u7004  | ERR_ZERO_AMOUNT
---- public    withdraw                           L694 try!       | (try! (sync))
---- public    withdraw                           L695 try!       | (let ((paid (try! (settle-proceeds member))))
HIT  public    withdraw                           L739 try!     u7012,u1007  | (try! (escrow-for take update))
---- public    withdraw                           L740 try!       | (try! (pull-to-held-sats take))
---- public    withdraw                           L741 try!       | (try! (as-contract? ((with-ft SBTC SBTC_NAME take))
---- public    withdraw                           L742 try!       | (try! (contract-call? SBTC transfer take current-contract member none))
HIT  public    claim                              L790 asserts! u7006  | ERR_NO_POSITION
---- public    claim                              L791 try!       | (try! (sync))
---- private   roll-tail                          L834 try!       | (try! (as-contract? ()
---- private   roll-tail                          L835 try!       | (try! (contract-call? MARKET cancel-token-x-deposit SBTC SBTC_NAME))
---- private   settle-proceeds                    L924 try!       | (try! (as-contract? ((with-stx owed))
---- private   settle-proceeds                    L925 try!       | (try! (stx-transfer? owed current-contract who))
---- private   settle-proceeds                    L939 try!       | (try! (as-contract? ((with-ft SBTC SBTC_NAME back))
---- private   settle-proceeds                    L940 try!       | (try! (contract-call? SBTC transfer back current-contract who none))
HIT  private   push-to-market                     L986 asserts! u7014  | ERR_PUSH_PAUSED
HIT  private   push-to-market                     L987 asserts! u7015  | ERR_ESCROW_COOLDOWN
HIT  private   push-to-market                     L990 asserts! u7008  | ERR_ZERO_PRICE
HIT  private   push-to-market                     L993 try!     u1031  | (try! (contract-call? MARKET deposit-token-x to-push g
HIT  public    refresh-guard                      L1005 asserts! u7003  | ERR_NOT_INITIALIZED
HIT  public    refresh-guard                      L1006 asserts! u7008  | ERR_ZERO_PRICE
HIT  public    refresh-guard                      L1009 try!     u1005  | (try! (contract-call? MARKET set-token-x-limit g (some (var-get spread-bps))))
---- private   settle-escrow                      L1022 try!       | (let ((refunded (try! (as-contract? ()
---- private   settle-escrow                      L1023 try!       | (try! (contract-call? MARKET cancel-token-x-deposit SBTC SBTC_NAME))
HIT  private   settle-escrow                      L1030 try!     u7012,u1007  | (try! (contract-call? MARKET settle-token-x-deposit current-contract
HIT  private   settle-escrow                      L1031 unwrap!  u7012  | ERR_UPDATE_REQUIRED
HIT  private   escrow-for                         L1063 try!     u7012,u1007  | (try! (settle-escrow update))
---- private   pull-to-held-sats                  L1079 asserts!   | ERR_INSUFFICIENT
---- private   pull-to-held-sats                  L1082 try!       | (try! (as-contract? ()
---- private   pull-to-held-sats                  L1083 try!       | (try! (contract-call? MARKET withdraw-token-x gap SBTC SBTC_NAME))
---- private   pull-to-held-sats                  L1088 try!       | (let ((refunded (try! (as-contract? ()
---- private   pull-to-held-sats                  L1089 try!       | (try! (contract-call? MARKET cancel-token-x-deposit SBTC SBTC_NAME))
26/51 failure arms hit
source sha256 584b66804090ae2363244e277a6e840f1d60ece92ad67ee5525a772e0f3e9467; txs 5163, no trace 588, decode errors 0; calls to counted market instances 134, of which no trace 0, decode errors 0
```

Reproduce: `node simulations/trace-coverage.mjs --contract jing-buy-stx-core-spread-v1 --by-source --md --sims <ids>` and `node simulations/failure-arms.mjs <ids> --by-source --contract jing-buy-stx-core-spread-v1` with the sim ids of the 2026-10-01 rerun (README-v6-3-coverage.md section 0, README-router-ladder-coverage.md section 0, README-v1-core-spread-rungs.md).
