# Trace coverage: jing-ladder-v1

From `simulations/trace-coverage.mjs` on 2026-10-02, source at d1a5bea: 52 simulations, 5163 transactions (588 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 247 / 473 (52.2%) |
| code lines touched / total | 141 / 300 (47.0%) |
| function body lines touched / total (top-level definitions excluded) | 141 / 272 (51.8%) |
| branch nodes (if / match / asserts!) | 24: 24 full, 0 partial, 0 never reached |

## Branches with one arm never taken (0)

| line | function | kind | state |
|---|---|---|---|

## Branch nodes never reached (0)

| line | function | kind |
|---|---|---|

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 32, 34, 35, 38, 39, 43, 44, 52, 53, 54, 57, 58, 59, 61, 66, 74 |
| rungs | 67, 68 |
| registered | 76, 77 |
| ERR_NOT_AUTHORIZED | 18 |
| ERR_INVALID_CONTRACT_HASH | 19 |
| ERR_NOT_VERIFIED | 20 |
| ERR_HASH_MISMATCH | 21 |
| ERR_ALREADY_REGISTERED | 22 |
| ERR_PRICE_TAKEN | 23 |
| ERR_BAD_SIDE | 24 |
| ERR_NO_PENDING_OWNER | 25 |
| ERR_TIMELOCK_NOT_ELAPSED | 26 |
| ERR_NOT_REGISTERED | 27 |
| ERR_BAND_FULL | 28 |
| ERR_ALREADY_SEATED | 29 |
| band-count | 54 |
| pending-owner | 58 |
| canonical | 62 |
| register | 218 |
| register-unseated | 272 |

## Per simulation (cumulative executed expressions of jing-ladder-v1)

| sim | txs | before | after |
|---|---|---|---|
| `1b7d24cc` | 93 | 0 | 1 |
| `21903045` | 156 | 1 | 516 |
| `3230d734` | 84 | 516 | 516 |
| `3582479f` | 27 | 516 | 516 |
| `39ca7d96` | 274 | 516 | 516 |
| `46e07863` | 110 | 516 | 516 |
| `47a85fe1` | 28 | 516 | 516 |
| `562290d6` | 14 | 516 | 516 |
| `57267ce2` | 26 | 516 | 516 |
| `5c614828` | 41 | 516 | 516 |
| `61f875f1` | 142 | 516 | 516 |
| `6978f913` | 33 | 516 | 516 |
| `6cad6dbd` | 408 | 516 | 516 |
| `75c2670a` | 28 | 516 | 516 |
| `7e018a44` | 177 | 516 | 516 |
| `83dc4c03` | 26 | 516 | 516 |
| `93fad242` | 258 | 516 | 516 |
| `943409e5` | 330 | 516 | 516 |
| `9a4f6fd6` | 20 | 516 | 516 |
| `9fc9abef` | 72 | 516 | 516 |
| `ab168657` | 454 | 516 | 516 |
| `b0991314` | 297 | 516 | 516 |
| `b9ed7d25` | 154 | 516 | 516 |
| `c30cf48c` | 291 | 516 | 516 |
| `c881a35d` | 72 | 516 | 516 |
| `d257db96` | 97 | 516 | 516 |
| `d3d3140f` | 75 | 516 | 516 |
| `d9bb7bc9` | 135 | 516 | 516 |
| `e2a4d3b7` | 105 | 516 | 516 |
| `e2ff3f33` | 41 | 516 | 516 |
| `9dfe9717` | 135 | 516 | 516 |
| `eaec8fc5` | 33 | 516 | 516 |
| `1dfbde21` | 27 | 516 | 516 |
| `1efca09a` | 20 | 516 | 516 |
| `30d1544e` | 41 | 516 | 516 |
| `343f608e` | 41 | 516 | 516 |
| `39549a17` | 93 | 516 | 516 |
| `40e456f2` | 21 | 516 | 516 |
| `41931700` | 20 | 516 | 516 |
| `4584e116` | 33 | 516 | 516 |
| `5a4c7687` | 93 | 516 | 516 |
| `6ec50f05` | 26 | 516 | 516 |
| `84c514ee` | 74 | 516 | 516 |
| `9b04485c` | 28 | 516 | 516 |
| `b180bda2` | 33 | 516 | 516 |
| `bb481e6e` | 28 | 516 | 516 |
| `cd3a8ef6` | 116 | 516 | 516 |
| `d2e2f058` | 84 | 516 | 516 |
| `d72a3abb` | 20 | 516 | 516 |
| `def91606` | 72 | 516 | 516 |
| `c958da67` | 38 | 516 | 516 |
| `313ba242` | 19 | 516 | 516 |

## Provenance and trace diagnostics

source d1a5bea, sha256 `0f1e08b023272ed96a2653f727292626d4b0325dcf4e42963104d977860ec786`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 5163 |
| no trace returned by stxer | 588 |
| trace decode errors | 0 |
| calls to a counted market instance | 170 |
| ... of which without a trace | 0 |
| ... of which decode errors | 0 |

| sim | counted instances |
|---|---|
| `1b7d24cc` | jing-ladder-v1 |
| `21903045` | jing-ladder-v1 |
| `3230d734` | none |
| `3582479f` | jing-ladder-v1 |
| `39ca7d96` | jing-ladder-v1 |
| `46e07863` | jing-ladder-v1 |
| `47a85fe1` | jing-ladder-v1 |
| `562290d6` | jing-ladder-v1 |
| `57267ce2` | jing-ladder-v1 |
| `5c614828` | jing-ladder-v1 |
| `61f875f1` | jing-ladder-v1 |
| `6978f913` | jing-ladder-v1 |
| `6cad6dbd` | jing-ladder-v1 |
| `75c2670a` | jing-ladder-v1 |
| `7e018a44` | jing-ladder-v1 |
| `83dc4c03` | jing-ladder-v1 |
| `93fad242` | jing-ladder-v1 |
| `943409e5` | jing-ladder-v1 |
| `9a4f6fd6` | jing-ladder-v1 |
| `9fc9abef` | jing-ladder-v1 |
| `ab168657` | jing-ladder-v1 |
| `b0991314` | jing-ladder-v1 |
| `b9ed7d25` | jing-ladder-v1 |
| `c30cf48c` | jing-ladder-v1 |
| `c881a35d` | jing-ladder-v1 |
| `d257db96` | jing-ladder-v1 |
| `d3d3140f` | jing-ladder-v1 |
| `d9bb7bc9` | jing-ladder-v1 |
| `e2a4d3b7` | jing-ladder-v1 |
| `e2ff3f33` | jing-ladder-v1 |
| `9dfe9717` | jing-ladder-v1 |
| `eaec8fc5` | jing-ladder-v1 |
| `1dfbde21` | jing-ladder-v1 |
| `1efca09a` | jing-ladder-v1 |
| `30d1544e` | jing-ladder-v1 |
| `343f608e` | jing-ladder-v1 |
| `39549a17` | jing-ladder-v1 |
| `40e456f2` | jing-ladder-v1 |
| `41931700` | jing-ladder-v1 |
| `4584e116` | jing-ladder-v1 |
| `5a4c7687` | jing-ladder-v1 |
| `6ec50f05` | jing-ladder-v1 |
| `84c514ee` | jing-ladder-v1 |
| `9b04485c` | jing-ladder-v1 |
| `b180bda2` | jing-ladder-v1 |
| `bb481e6e` | jing-ladder-v1 |
| `cd3a8ef6` | jing-ladder-v1 |
| `d2e2f058` | none |
| `d72a3abb` | jing-ladder-v1 |
| `def91606` | jing-ladder-v1 |
| `c958da67` | jing-ladder-v1 |
| `313ba242` | jing-ladder-v1 |

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
HIT  private   claim-seat                         L173 asserts! u6011  | ERR_BAND_FULL
HIT  public    set-canonical                      L196 asserts! u6001  | ERR_NOT_AUTHORIZED
HIT  public    set-canonical                      L197 asserts! u6007  | ERR_BAD_SIDE
HIT  public    register                           L219 unwrap!  u6002  | ERR_INVALID_CONTRACT_HASH
HIT  public    register                           L220 unwrap!  u6003  | ERR_NOT_VERIFIED
HIT  public    register                           L226 asserts! u6002,u6004  | ERR_HASH_MISMATCH
HIT  public    register                           L227 unwrap!  u6002  | ERR_INVALID_CONTRACT_HASH
HIT  public    register                           L230 asserts! u6005  | ERR_ALREADY_REGISTERED
HIT  public    register                           L233 try!     u6011  | (is-some (try! (claim-seat side price)))
HIT  public    register                           L235 asserts! u6006  | ERR_PRICE_TAKEN
HIT  public    register-unseated                  L273 unwrap!  u6002  | ERR_INVALID_CONTRACT_HASH
HIT  public    register-unseated                  L274 unwrap!  u6003  | ERR_NOT_VERIFIED
HIT  public    register-unseated                  L276 asserts! u6007  | ERR_BAD_SIDE
HIT  public    register-unseated                  L277 asserts! u6002,u6004  | ERR_HASH_MISMATCH
HIT  public    register-unseated                  L278 unwrap!  u6002  | ERR_INVALID_CONTRACT_HASH
HIT  public    register-unseated                  L281 asserts! u6005  | ERR_ALREADY_REGISTERED
HIT  public    seat-band                          L306 unwrap!  u6010  | ERR_NOT_REGISTERED
HIT  public    seat-band                          L310 asserts! u6001  | ERR_NOT_AUTHORIZED
HIT  public    seat-band                          L311 asserts! u6007  | ERR_BAD_SIDE
HIT  public    seat-band                          L312 asserts! u6012  | ERR_ALREADY_SEATED
HIT  public    seat-band                          L313 try!     u6011  | (let ((replaced (try! (claim-seat side spread))))
HIT  public    set-max-band-per-side              L333 asserts! u6001  | ERR_NOT_AUTHORIZED
HIT  public    set-max-band-per-side              L340 asserts! u6011  | ERR_BAND_FULL
HIT  public    retire-band                        L369 unwrap!  u6010  | ERR_NOT_REGISTERED
HIT  public    retire-band                        L371 asserts! u6001  | ERR_NOT_AUTHORIZED
HIT  public    retire-band                        L372 asserts! u6007  | ERR_BAD_SIDE
HIT  private   rung-of                            L391 unwrap!  u6010  | ERR_NOT_REGISTERED
HIT  public    log-deposit                        L402 try!     u6010  | (let ((rung (try! (rung-of contract-caller))))
HIT  public    log-push                           L426 try!     u6010  | (let ((rung (try! (rung-of contract-caller))))
HIT  public    log-withdraw                       L449 try!     u6010  | (let ((rung (try! (rung-of contract-caller))))
HIT  public    log-payout                         L476 try!     u6010  | (let ((rung (try! (rung-of contract-caller))))
HIT  public    log-epoch-closed                   L496 try!     u6010  | (let ((rung (try! (rung-of contract-caller))))
HIT  public    log-rescale                        L521 try!     u6010  | (let ((rung (try! (rung-of contract-caller))))
HIT  public    propose-owner                      L542 asserts! u6001  | ERR_NOT_AUTHORIZED
HIT  public    accept-owner                       L556 unwrap!  u6008  | ERR_NO_PENDING_OWNER
HIT  public    accept-owner                       L557 asserts! u6001  | ERR_NOT_AUTHORIZED
HIT  public    accept-owner                       L558 asserts! u6009  | ERR_TIMELOCK_NOT_ELAPSED
37/37 failure arms hit
source sha256 0f1e08b023272ed96a2653f727292626d4b0325dcf4e42963104d977860ec786; txs 5163, no trace 588, decode errors 0; calls to counted market instances 170, of which no trace 0, decode errors 0
```

Reproduce: `node simulations/trace-coverage.mjs --contract jing-ladder-v1 --by-source --md --sims <ids>` and `node simulations/failure-arms.mjs <ids> --by-source --contract jing-ladder-v1` with the sim ids of the 2026-10-01 rerun (README-v6-3-coverage.md section 0, README-router-ladder-coverage.md section 0, README-v1-core-spread-rungs.md).
