# Trace coverage: jing-sell-stx-core-spread-v1

From `simulations/trace-coverage.mjs` on 2026-10-02, source at d1a5bea: 52 simulations, 5163 transactions (588 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 649 / 929 (69.9%) |
| code lines touched / total | 373 / 545 (68.4%) |
| function body lines touched / total (top-level definitions excluded) | 373 / 492 (75.8%) |
| branch nodes (if / match / asserts!) | 62: 57 full, 5 partial, 0 never reached |

## Branches with one arm never taken (5)

| line | function | kind | state |
|---|---|---|---|
| 292 | epoch-payout | match | one arm (then only) |
| 831 | count-reserve-claim | match | one arm (then only) |
| 836 | count-reserve-claim | if | one arm (else only) |
| 840 | count-reserve-claim | if | one arm (else only) |
| 972 | settle-escrow | match | one arm (then only) |

## Branch nodes never reached (0)

| line | function | kind |
|---|---|---|

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 39, 40, 43, 44, 45, 46, 47, 57, 59, 60, 61, 62, 63, 64, 65, 68, 70, 73, 81, 82, 126, 128, 130, 132, 133, 136, 139, 141, 146, 152, 162, 163, 167, 168, 170, 172, 174, 179, 182, 186, 189, 192, 194 |
| ERR_NOT_AUTHORIZED | 18 |
| ERR_ALREADY_INITIALIZED | 19 |
| ERR_NOT_INITIALIZED | 20 |
| ERR_ZERO_AMOUNT | 21 |
| ERR_TOO_SMALL | 22 |
| ERR_NO_POSITION | 23 |
| ERR_INSUFFICIENT | 24 |
| ERR_ZERO_PRICE | 25 |
| ERR_BAD_SPREAD | 26 |
| ERR_BAD_NAME | 27 |
| ERR_UPDATE_REQUIRED | 44 |
| ERR_PUSH_PAUSED | 45 |
| ERR_ESCROW_COOLDOWN | 46 |
| ERR_TOO_MANY_SHARES | 47 |
| epoch-reserve | 154 |
| positions | 196 |
| epoch-payout | 303 |
| settle-escrow | 988 |

## Per simulation (cumulative executed expressions of jing-sell-stx-core-spread-v1)

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
| `57267ce2` | 26 | 0 | 728 |
| `5c614828` | 41 | 728 | 728 |
| `61f875f1` | 142 | 728 | 728 |
| `6978f913` | 33 | 728 | 728 |
| `6cad6dbd` | 408 | 728 | 728 |
| `75c2670a` | 28 | 728 | 728 |
| `7e018a44` | 177 | 728 | 728 |
| `83dc4c03` | 26 | 728 | 728 |
| `93fad242` | 258 | 728 | 728 |
| `943409e5` | 330 | 728 | 728 |
| `9a4f6fd6` | 20 | 728 | 728 |
| `9fc9abef` | 72 | 728 | 728 |
| `ab168657` | 454 | 728 | 728 |
| `b0991314` | 297 | 728 | 728 |
| `b9ed7d25` | 154 | 728 | 728 |
| `c30cf48c` | 291 | 728 | 1120 |
| `c881a35d` | 72 | 1120 | 1120 |
| `d257db96` | 97 | 1120 | 1120 |
| `d3d3140f` | 75 | 1120 | 1120 |
| `d9bb7bc9` | 135 | 1120 | 1120 |
| `e2a4d3b7` | 105 | 1120 | 1120 |
| `e2ff3f33` | 41 | 1120 | 1120 |
| `9dfe9717` | 135 | 1120 | 1123 |
| `eaec8fc5` | 33 | 1123 | 1123 |
| `1dfbde21` | 27 | 1123 | 1123 |
| `1efca09a` | 20 | 1123 | 1123 |
| `30d1544e` | 41 | 1123 | 1123 |
| `343f608e` | 41 | 1123 | 1123 |
| `39549a17` | 93 | 1123 | 1123 |
| `40e456f2` | 21 | 1123 | 1123 |
| `41931700` | 20 | 1123 | 1123 |
| `4584e116` | 33 | 1123 | 1123 |
| `5a4c7687` | 93 | 1123 | 1123 |
| `6ec50f05` | 26 | 1123 | 1123 |
| `84c514ee` | 74 | 1123 | 1123 |
| `9b04485c` | 28 | 1123 | 1123 |
| `b180bda2` | 33 | 1123 | 1123 |
| `bb481e6e` | 28 | 1123 | 1123 |
| `cd3a8ef6` | 116 | 1123 | 1123 |
| `d2e2f058` | 84 | 1123 | 1123 |
| `d72a3abb` | 20 | 1123 | 1123 |
| `def91606` | 72 | 1123 | 1123 |
| `c958da67` | 38 | 1123 | 1123 |
| `313ba242` | 19 | 1123 | 1123 |

## Provenance and trace diagnostics

source d1a5bea, sha256 `fdf5c2b11dadcf61d1e1d2d30df2f1127e1375fcf553f24105075035d70f10e5`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 5163 |
| no trace returned by stxer | 588 |
| trace decode errors | 0 |
| calls to a counted market instance | 146 |
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
| `57267ce2` | jing-sell-stx-spread-10 |
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
| `c30cf48c` | jing-sell-stx-spread-20, jing-sell-stx-spread-30 |
| `c881a35d` | jing-sell-stx-spread-20, jing-sell-stx-spread-30, jing-sell-stx-spread-40 |
| `d257db96` | none |
| `d3d3140f` | none |
| `d9bb7bc9` | none |
| `e2a4d3b7` | none |
| `e2ff3f33` | none |
| `9dfe9717` | jing-sell-stx-spread-0, jing-sell-stx-spread-10, jing-sell-stx-spread-20, jing-sell-stx-spread-30, jing-sell-stx-spread-40, jing-sell-stx-spread-50, jing-sell-stx-spread-60, jing-sell-stx-spread-70, jing-sell-stx-spread-80, jing-sell-stx-spread-90, jing-sell-stx-spread-100 |
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
| jing-sell-stx-spread-20-cap-876-25@f7c9f926fd3a | 1 |
| jing-sell-stx-spread-20-cap-876-29@f7c9f926fd3a | 1 |
| jing-sell-stx-spread-20@f2eaa44c6464 | 1 |
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
HIT  public    initialize                         L434 asserts! u7001  | ERR_NOT_AUTHORIZED
HIT  public    initialize                         L437 asserts! u7002  | ERR_ALREADY_INITIALIZED
HIT  public    initialize                         L438 asserts! u7010  | ERR_BAD_SPREAD
HIT  public    initialize                         L439 asserts! u7009  | ERR_BAD_NAME
HIT  public    initialize                         L452 try!     u6003,u6011  | (try! (contract-call? LADDER register SIDE bps u0))
---- public    initialize                         L453 try!       | (try! (contract-call? MARKET sync-seat current-contract))
HIT  public    initialize                         L457 try!     u6003  | (try! (contract-call? LADDER register-unseated SIDE bps u0))
HIT  public    set-push-paused                    L468 asserts! u7001  | ERR_NOT_AUTHORIZED
HIT  public    sync                               L492 asserts! u7003  | ERR_NOT_INITIALIZED
---- public    sync                               L518 try!       | (try! (roll-tail))
HIT  public    deposit                            L552 asserts! u7003  | ERR_NOT_INITIALIZED
HIT  public    deposit                            L553 asserts! u7005  | ERR_TOO_SMALL
---- public    deposit                            L556 try!       | (try! (sync))
---- public    deposit                            L557 try!       | (let ((paid (try! (settle-proceeds member))))
HIT  public    deposit                            L558 try!     u1  | (try! (stx-transfer? amount member current-contract))
---- public    deposit                            L576 asserts!   | ERR_TOO_MANY_SHARES
HIT  public    push                               L624 asserts! u7003  | ERR_NOT_INITIALIZED
---- public    push                               L625 try!       | (try! (sync))
HIT  public    withdraw                           L651 asserts! u7006  | ERR_NO_POSITION
HIT  public    withdraw                           L652 asserts! u7004  | ERR_ZERO_AMOUNT
---- public    withdraw                           L653 try!       | (try! (sync))
---- public    withdraw                           L654 try!       | (let ((paid (try! (settle-proceeds member))))
HIT  public    withdraw                           L698 try!     u7012,u1007  | (try! (escrow-for take update))
---- public    withdraw                           L699 try!       | (try! (pull-to-held-ustx take))
---- public    withdraw                           L700 try!       | (try! (as-contract? ((with-stx take))
---- public    withdraw                           L701 try!       | (try! (stx-transfer? take current-contract member))
HIT  public    claim                              L747 asserts! u7006  | ERR_NO_POSITION
---- public    claim                              L748 try!       | (try! (sync))
---- private   roll-tail                          L791 try!       | (try! (as-contract? ()
---- private   roll-tail                          L792 try!       | (try! (contract-call? MARKET cancel-token-y-deposit WSTX WSTX_NAME))
---- private   settle-proceeds                    L879 try!       | (try! (as-contract? ((with-ft SBTC SBTC_NAME owed))
---- private   settle-proceeds                    L880 try!       | (try! (contract-call? SBTC transfer owed current-contract who none))
---- private   settle-proceeds                    L894 try!       | (try! (as-contract? ((with-stx back))
---- private   settle-proceeds                    L895 try!       | (try! (stx-transfer? back current-contract who))
HIT  private   push-to-market                     L938 asserts! u7014  | ERR_PUSH_PAUSED
HIT  private   push-to-market                     L939 asserts! u7015  | ERR_ESCROW_COOLDOWN
HIT  private   push-to-market                     L942 asserts! u7008  | ERR_ZERO_PRICE
HIT  private   push-to-market                     L945 try!     u1031  | (try! (contract-call? MARKET deposit-token-y to-push g
HIT  public    refresh-guard                      L957 asserts! u7003  | ERR_NOT_INITIALIZED
HIT  public    refresh-guard                      L958 asserts! u7008  | ERR_ZERO_PRICE
HIT  public    refresh-guard                      L961 try!     u1005  | (try! (contract-call? MARKET set-token-y-limit g (some (var-get spread-bps))))
---- private   settle-escrow                      L974 try!       | (let ((refunded (try! (as-contract? ()
---- private   settle-escrow                      L975 try!       | (try! (contract-call? MARKET cancel-token-y-deposit WSTX WSTX_NAME))
HIT  private   settle-escrow                      L982 try!     u7012,u1007  | (try! (contract-call? MARKET settle-token-y-deposit current-contract
HIT  private   settle-escrow                      L983 unwrap!  u7012  | ERR_UPDATE_REQUIRED
HIT  private   escrow-for                         L1015 try!     u7012,u1007  | (try! (settle-escrow update))
---- private   pull-to-held-ustx                  L1031 asserts!   | ERR_INSUFFICIENT
---- private   pull-to-held-ustx                  L1034 try!       | (try! (as-contract? ()
---- private   pull-to-held-ustx                  L1035 try!       | (try! (contract-call? MARKET withdraw-token-y gap WSTX WSTX_NAME))
---- private   pull-to-held-ustx                  L1040 try!       | (let ((refunded (try! (as-contract? ()
---- private   pull-to-held-ustx                  L1041 try!       | (try! (contract-call? MARKET cancel-token-y-deposit WSTX WSTX_NAME))
26/51 failure arms hit
source sha256 fdf5c2b11dadcf61d1e1d2d30df2f1127e1375fcf553f24105075035d70f10e5; txs 5163, no trace 588, decode errors 0; calls to counted market instances 146, of which no trace 0, decode errors 0
```

Reproduce: `node simulations/trace-coverage.mjs --contract jing-sell-stx-core-spread-v1 --by-source --md --sims <ids>` and `node simulations/failure-arms.mjs <ids> --by-source --contract jing-sell-stx-core-spread-v1` with the sim ids of the 2026-10-01 rerun (README-v6-3-coverage.md section 0, README-router-ladder-coverage.md section 0, README-v1-core-spread-rungs.md).
