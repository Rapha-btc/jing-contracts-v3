# Trace coverage: jing-ladder-dispatch

From `simulations/trace-coverage.mjs` on 2026-10-02, source at d1a5bea: 52 simulations, 5163 transactions (588 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 166 / 267 (62.2%) |
| code lines touched / total | 76 / 101 (75.2%) |
| function body lines touched / total (top-level definitions excluded) | 76 / 92 (82.6%) |
| branch nodes (if / match / asserts!) | 15: 15 full, 0 partial, 0 never reached |

## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (0)

| line | function | kind |
|---|---|---|

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 13, 15, 16, 17, 18, 19, 20, 21, 22 |
| ERR_EMPTY | 16 |
| ERR_TOTAL | 17 |
| ERR_ZERO_AMOUNT | 18 |
| ERR_NOT_SEATED | 19 |
| ERR_DUPLICATE | 20 |
| ERR_DIRECT_CALL | 21 |
| ERR_NOT_REGISTERED_SIDE | 22 |

## Per simulation (cumulative executed expressions of jing-ladder-dispatch)

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
| `c30cf48c` | 291 | 0 | 0 |
| `c881a35d` | 72 | 0 | 285 |
| `d257db96` | 97 | 285 | 285 |
| `d3d3140f` | 75 | 285 | 285 |
| `d9bb7bc9` | 135 | 285 | 285 |
| `e2a4d3b7` | 105 | 285 | 285 |
| `e2ff3f33` | 41 | 285 | 285 |
| `9dfe9717` | 135 | 285 | 297 |
| `eaec8fc5` | 33 | 297 | 297 |
| `1dfbde21` | 27 | 297 | 297 |
| `1efca09a` | 20 | 297 | 297 |
| `30d1544e` | 41 | 297 | 297 |
| `343f608e` | 41 | 297 | 297 |
| `39549a17` | 93 | 297 | 297 |
| `40e456f2` | 21 | 297 | 297 |
| `41931700` | 20 | 297 | 297 |
| `4584e116` | 33 | 297 | 297 |
| `5a4c7687` | 93 | 297 | 297 |
| `6ec50f05` | 26 | 297 | 297 |
| `84c514ee` | 74 | 297 | 297 |
| `9b04485c` | 28 | 297 | 297 |
| `b180bda2` | 33 | 297 | 297 |
| `bb481e6e` | 28 | 297 | 297 |
| `cd3a8ef6` | 116 | 297 | 297 |
| `d2e2f058` | 84 | 297 | 297 |
| `d72a3abb` | 20 | 297 | 297 |
| `def91606` | 72 | 297 | 297 |
| `c958da67` | 38 | 297 | 297 |
| `313ba242` | 19 | 297 | 297 |

## Provenance and trace diagnostics

source d1a5bea, sha256 `cd31a7b28e4f7cd7b3d1d0c69398784d1c937095ce8b9cdf665c61f14cf0aa50`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 5163 |
| no trace returned by stxer | 588 |
| trace decode errors | 0 |
| calls to a counted market instance | 47 |
| ... of which without a trace | 1 |
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
| `c30cf48c` | none |
| `c881a35d` | jing-ladder-dispatch |
| `d257db96` | none |
| `d3d3140f` | none |
| `d9bb7bc9` | none |
| `e2a4d3b7` | none |
| `e2ff3f33` | none |
| `9dfe9717` | jing-ladder-dispatch |
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
HIT  private   validate-one                       L36 try!     u7104,u7102  | (state (try! acc))
HIT  private   validate-one                       L41 asserts! u7103  | ERR_ZERO_AMOUNT
HIT  private   validate-one                       L42 asserts! u7102  | ERR_TOTAL
HIT  private   validate-one                       L43 asserts! u7105  | ERR_DUPLICATE
HIT  private   validate-one                       L44 asserts! u7104  | ERR_NOT_SEATED
---- private   validate-one                       L54 unwrap!    | ERR_TOTAL
HIT  private   deposit-one                        L68 try!     u7005  | (state (try! acc))
HIT  private   deposit-one                        L70 try!     u7005  | (result (try! (contract-call? target deposit (get amount entry))))
---- private   deposit-one                        L76 unwrap!    | ERR_TOTAL
HIT  private   dispatch                           L90 asserts! u7106  | ERR_DIRECT_CALL
HIT  private   dispatch                           L91 asserts! u7101  | ERR_EMPTY
HIT  private   dispatch                           L92 asserts! u7102  | ERR_TOTAL
HIT  private   dispatch                           L93 try!     u7104,u7105,u7103,u7102  | (let ((validated (try! (fold validate-one allocations
HIT  private   dispatch                           L95 asserts! u7102  | ERR_TOTAL
HIT  private   dispatch                           L97 try!     u7005  | (let ((done (try! (fold deposit-one allocations (ok {
HIT  private   validate-exit                      L138 try!     u7103  | (state (try! acc))
HIT  private   validate-exit                      L141 unwrap!  u7108  | ERR_NOT_REGISTERED_SIDE
HIT  private   validate-exit                      L143 asserts! u7103  | ERR_ZERO_AMOUNT
HIT  private   validate-exit                      L144 asserts! u7105  | ERR_DUPLICATE
HIT  private   validate-exit                      L145 asserts! u7108  | ERR_NOT_REGISTERED_SIDE
---- private   validate-exit                      L150 unwrap!    | ERR_TOTAL
HIT  private   exit-one                           L162 try!     u7006  | (let ((state (try! acc)) (target (get rung entry)))
HIT  private   exit-one                           L167 try!     u7006  | (let ((result (try! (contract-call? target withdraw (get amount entry)
---- private   exit-one                           L175 unwrap!    | ERR_TOTAL
HIT  private   withdraw-many                      L188 asserts! u7106  | ERR_DIRECT_CALL
HIT  private   withdraw-many                      L189 asserts! u7101  | ERR_EMPTY
HIT  private   withdraw-many                      L190 try!     u7108,u7105,u7103  | (try! (fold validate-exit requests (ok { buy: buy, seen: (list) })))
HIT  private   withdraw-many                      L191 try!     u7006  | (let ((done (try! (fold exit-one requests
24/28 failure arms hit
source sha256 cd31a7b28e4f7cd7b3d1d0c69398784d1c937095ce8b9cdf665c61f14cf0aa50; txs 5163, no trace 588, decode errors 0; calls to counted market instances 47, of which no trace 1, decode errors 0
```

Reproduce: `node simulations/trace-coverage.mjs --contract jing-ladder-dispatch --by-source --md --sims <ids>` and `node simulations/failure-arms.mjs <ids> --by-source --contract jing-ladder-dispatch` with the sim ids of the 2026-10-01 rerun (README-v6-3-coverage.md section 0, README-router-ladder-coverage.md section 0, README-v1-core-spread-rungs.md).
