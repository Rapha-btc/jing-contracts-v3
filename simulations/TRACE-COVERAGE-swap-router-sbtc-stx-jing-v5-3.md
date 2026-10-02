# Trace coverage: swap-router-sbtc-stx-jing-v5-3

From `simulations/trace-coverage.mjs` on 2026-10-02, source at a83e427: 52 simulations, 5150 transactions (586 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 635 / 990 (64.1%) |
| code lines touched / total | 372 / 590 (63.1%) |
| function body lines touched / total (top-level definitions excluded) | 372 / 557 (66.8%) |
| branch nodes (if / match / asserts!) | 81: 78 full, 2 partial, 1 never reached |

## Branches with one arm never taken (2)

| line | function | kind | state |
|---|---|---|---|
| 231 | xyk-swap | if | one arm (then only) |
| 802 | cp-split | if | one arm (then only) |

## Branch nodes never reached (1)

| line | function | kind |
|---|---|---|
| 240 | xyk-swap | if |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 119, 120, 121, 122, 123, 125, 126, 127, 128, 129, 131, 133, 134, 136, 137, 138, 140, 141, 142, 144, 145, 146, 147, 148, 149, 150, 636, 637, 638, 731, 830, 831, 832 |
| xyk-swap | 240, 241, 244 |
| ERR_ZERO_AMOUNT | 144 |
| ERR_MIN_OUT | 145 |
| ERR_BAD_VENUE | 146 |
| ERR_SPLIT_MISMATCH | 147 |
| ERR_VAA_REQUIRED | 148 |
| ERR_ZERO_LIMIT | 149 |
| ERR_ZERO_MID | 150 |
| swap-sbtc-for-stx | 439 |
| swap-stx-for-sbtc | 540 |
| DLMM_WALK_BINS | 832 |
| smart-swap-sbtc-for-stx | 1101 |
| smart-swap-stx-for-sbtc | 1169 |

## Per simulation (cumulative executed expressions of swap-router-sbtc-stx-jing-v5-3)

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
| `c881a35d` | 72 | 0 | 0 |
| `d257db96` | 97 | 0 | 0 |
| `d3d3140f` | 75 | 0 | 0 |
| `d9bb7bc9` | 135 | 0 | 0 |
| `e2a4d3b7` | 105 | 0 | 0 |
| `e2ff3f33` | 41 | 0 | 0 |
| `eae80668` | 122 | 0 | 0 |
| `eaec8fc5` | 33 | 0 | 0 |
| `1dfbde21` | 27 | 0 | 0 |
| `1efca09a` | 20 | 0 | 481 |
| `30d1544e` | 41 | 481 | 659 |
| `343f608e` | 41 | 659 | 831 |
| `39549a17` | 93 | 831 | 965 |
| `40e456f2` | 21 | 965 | 1304 |
| `41931700` | 20 | 1304 | 1304 |
| `4584e116` | 33 | 1304 | 1304 |
| `5a4c7687` | 93 | 1304 | 1304 |
| `6ec50f05` | 26 | 1304 | 1304 |
| `84c514ee` | 74 | 1304 | 1359 |
| `9b04485c` | 28 | 1359 | 1359 |
| `b180bda2` | 33 | 1359 | 1359 |
| `bb481e6e` | 28 | 1359 | 1359 |
| `cd3a8ef6` | 116 | 1359 | 1359 |
| `d2e2f058` | 84 | 1359 | 1359 |
| `d72a3abb` | 20 | 1359 | 1359 |
| `def91606` | 72 | 1359 | 1359 |
| `c958da67` | 38 | 1359 | 1391 |
| `313ba242` | 19 | 1391 | 1391 |

## Provenance and trace diagnostics

source a83e427, sha256 `dc355d4402a42c5583776a38f08ed4feae8365443113079fb42f964bf5faf839`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 5150 |
| no trace returned by stxer | 586 |
| trace decode errors | 0 |
| calls to a counted market instance | 359 |
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
| `c30cf48c` | none |
| `c881a35d` | none |
| `d257db96` | none |
| `d3d3140f` | none |
| `d9bb7bc9` | none |
| `e2a4d3b7` | none |
| `e2ff3f33` | none |
| `eae80668` | none |
| `eaec8fc5` | none |
| `1dfbde21` | none |
| `1efca09a` | swap-router-sbtc-stx-jing-v5-3 |
| `30d1544e` | swap-router-sbtc-stx-jing-v5-3 |
| `343f608e` | swap-router-sbtc-stx-jing-v5-3 |
| `39549a17` | swap-router-sbtc-stx-jing-v5-3 |
| `40e456f2` | swap-router-sbtc-stx-jing-v5-3 |
| `41931700` | swap-router-sbtc-stx-jing-v5-3 |
| `4584e116` | none |
| `5a4c7687` | swap-router-sbtc-stx-jing-v5-3 |
| `6ec50f05` | none |
| `84c514ee` | swap-router-sbtc-stx-jing-v5-3 |
| `9b04485c` | swap-router-sbtc-stx-jing-v5-3 |
| `b180bda2` | none |
| `bb481e6e` | swap-router-sbtc-stx-jing-v5-3 |
| `cd3a8ef6` | swap-router-sbtc-stx-jing-v5-3 |
| `d2e2f058` | none |
| `d72a3abb` | swap-router-sbtc-stx-jing-v5-3 |
| `def91606` | swap-router-sbtc-stx-jing-v5-3 |
| `c958da67` | swap-router-sbtc-stx-jing-v5-3 |
| `313ba242` | swap-router-sbtc-stx-jing-v5-3 |

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
HIT  private   amm-sell-sbtc                      L282 try!     u1020,u1  | out: (try! (xyk-swap true amount min-received)),
HIT  private   amm-sell-sbtc                      L287 try!     u107,u1  | (try! (contract-call? VELAR_POOL swap SBTC VELAR_WSTX VELAR_FEES amount
HIT  private   amm-sell-stx                       L320 try!     u1019,u1  | out: (try! (xyk-swap false amount min-received)),
HIT  private   amm-sell-stx                       L325 try!     u107,u1  | (try! (contract-call? VELAR_POOL swap VELAR_WSTX SBTC VELAR_FEES amount
HIT  public    swap-sbtc-for-stx                  L428 asserts! u3001  | ERR_ZERO_AMOUNT
HIT  public    swap-sbtc-for-stx                  L430 asserts! u3004  | ERR_SPLIT_MISMATCH
HIT  public    swap-sbtc-for-stx                  L437 asserts! u3003  | ERR_BAD_VENUE
HIT  public    swap-sbtc-for-stx                  L442 unwrap!  u3005  | ERR_VAA_REQUIRED
HIT  public    swap-sbtc-for-stx                  L452 try!     u2003  | (dlmm (try! (leg-sbtc dlmm-in
HIT  public    swap-sbtc-for-stx                  L456 try!     u1020  | (xyk (try! (leg-sbtc xyk-in
HIT  public    swap-sbtc-for-stx                  L460 try!     u107  | (velar (try! (leg-sbtc velar-in
HIT  public    swap-sbtc-for-stx                  L466 asserts! u3002  | ERR_MIN_OUT
HIT  public    swap-stx-for-sbtc                  L529 asserts! u3001  | ERR_ZERO_AMOUNT
HIT  public    swap-stx-for-sbtc                  L531 asserts! u3004  | ERR_SPLIT_MISMATCH
HIT  public    swap-stx-for-sbtc                  L538 asserts! u3003  | ERR_BAD_VENUE
HIT  public    swap-stx-for-sbtc                  L543 unwrap!  u3005  | ERR_VAA_REQUIRED
HIT  public    swap-stx-for-sbtc                  L553 try!     u2003  | (dlmm (try! (leg-stx dlmm-in
HIT  public    swap-stx-for-sbtc                  L557 try!     u1019  | (xyk (try! (leg-stx xyk-in
HIT  public    swap-stx-for-sbtc                  L561 try!     u107  | (velar (try! (leg-stx velar-in
HIT  public    swap-stx-for-sbtc                  L567 asserts! u3002  | ERR_MIN_OUT
HIT  private   dlmm-stage                         L1038 try!     u2001  | (leg (try! (amm-leg plan limit sell-sbtc VENUE_DLMM)))
HIT  private   cp-stage                           L1071 try!     u1  | (xyk (try! (amm-leg (get xyk plan) limit sell-sbtc VENUE_XYK)))
HIT  private   cp-stage                           L1072 try!     u1  | (velar (try! (amm-leg (get velar plan) limit sell-sbtc VENUE_VELAR)))
HIT  public    smart-swap-sbtc-for-stx            L1095 asserts! u3001  | ERR_ZERO_AMOUNT
HIT  public    smart-swap-sbtc-for-stx            L1098 asserts! u3006  | ERR_ZERO_LIMIT
HIT  public    smart-swap-sbtc-for-stx            L1099 asserts! u3007  | ERR_ZERO_MID
HIT  public    smart-swap-sbtc-for-stx            L1111 try!     u2001  | (dlmm (try! (dlmm-stage (- amount jing-in) limit-price true)))
HIT  public    smart-swap-sbtc-for-stx            L1113 try!     u1  | (cp (try! (cp-stage (- amount jing-in (get in dlmm)) limit-price true)))
HIT  public    smart-swap-sbtc-for-stx            L1116 asserts! u3002  | ERR_MIN_OUT
HIT  public    smart-swap-stx-for-sbtc            L1163 asserts! u3001  | ERR_ZERO_AMOUNT
HIT  public    smart-swap-stx-for-sbtc            L1166 asserts! u3006  | ERR_ZERO_LIMIT
HIT  public    smart-swap-stx-for-sbtc            L1167 asserts! u3007  | ERR_ZERO_MID
HIT  public    smart-swap-stx-for-sbtc            L1179 try!     u2001  | (dlmm (try! (dlmm-stage (- amount jing-in) limit-price false)))
HIT  public    smart-swap-stx-for-sbtc            L1181 try!     u1  | (cp (try! (cp-stage (- amount jing-in (get in dlmm)) limit-price false)))
HIT  public    smart-swap-stx-for-sbtc            L1184 asserts! u3002  | ERR_MIN_OUT
35/35 failure arms hit
source sha256 dc355d4402a42c5583776a38f08ed4feae8365443113079fb42f964bf5faf839; txs 5150, no trace 586, decode errors 0; calls to counted market instances 359, of which no trace 0, decode errors 0
```

Reproduce: `node simulations/trace-coverage.mjs --contract swap-router-sbtc-stx-jing-v5-3 --by-source --md --sims <ids>` and `node simulations/failure-arms.mjs <ids> --by-source --contract swap-router-sbtc-stx-jing-v5-3` with the sim ids of the 2026-10-01 rerun (README-v6-3-coverage.md section 0, README-router-ladder-coverage.md section 0, README-v1-core-spread-rungs.md).
