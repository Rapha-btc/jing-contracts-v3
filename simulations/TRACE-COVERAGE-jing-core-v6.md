# Trace coverage: jing-core-v6

From `simulations/trace-coverage.mjs` on 2026-10-02, source at d1a5bea: 52 simulations, 5163 transactions (588 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 362 / 1178 (30.7%) |
| code lines touched / total | 243 / 956 (25.4%) |
| function body lines touched / total (top-level definitions excluded) | 243 / 937 (25.9%) |
| branch nodes (if / match / asserts!) | 82: 51 full, 3 partial, 28 never reached |

## Branches with one arm never taken (3)

| line | function | kind | state |
|---|---|---|---|
| 148 | credit-if-not-registered | if | one arm (else only) |
| 159 | debit-if-not-registered | if | one arm (else only) |
| 170 | credit-if-registered | if | one arm (else only) |

## Branch nodes never reached (28)

| line | function | kind |
|---|---|---|
| 302 | log-withdraw | asserts! |
| 317 | log-revoke | asserts! |
| 332 | log-cancel | asserts! |
| 353 | log-bitflow-swap | asserts! |
| 1242 | log-rfq-open | asserts! |
| 1270 | log-rfq-fill | asserts! |
| 1296 | log-rfq-cancel | asserts! |
| 1313 | log-reserve-supply | asserts! |
| 1327 | log-reserve-withdraw-sbtc | asserts! |
| 1341 | log-reserve-withdraw-stx | asserts! |
| 1358 | log-reserve-open-credit-line | asserts! |
| 1376 | log-reserve-set-credit-line-cap | asserts! |
| 1392 | log-reserve-set-credit-line-interest | asserts! |
| 1405 | log-reserve-close-credit-line | asserts! |
| 1417 | log-reserve-set-paused | asserts! |
| 1429 | log-reserve-set-min-sbtc-draw | asserts! |
| 1446 | log-reserve-draw | asserts! |
| 1464 | log-reserve-notify-return | asserts! |
| 1478 | log-snpl-set-reserve | asserts! |
| 1498 | log-snpl-borrow | asserts! |
| 1521 | log-snpl-swap-deposit | asserts! |
| 1536 | log-snpl-cancel-swap | asserts! |
| 1551 | log-snpl-set-swap-limit | asserts! |
| 1574 | log-snpl-repay | asserts! |
| 1601 | log-snpl-seize | asserts! |
| 1627 | log-jing-swap | asserts! |
| 1654 | reconcile-vault-equity | if |
| 1671 | log-jing-swap-reconciled | asserts! |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 13, 15, 16, 18, 23, 24, 26, 31, 38 |
| log-bitflow-swap | 351, 352, 353, 354, 355, 356, 365, 366, 368 |
| log-jing-swap | 1625, 1626, 1627, 1628, 1629, 1630, 1640, 1641, 1643 |
| log-jing-swap-reconciled | 1669, 1670, 1671, 1672, 1673, 1674, 1684, 1685, 1688 |
| log-reserve-supply | 1311, 1312, 1313, 1314, 1315, 1319, 1321 |
| log-withdraw | 301, 302, 303, 304, 309, 311 |
| log-reserve-withdraw-sbtc | 1326, 1327, 1328, 1329, 1333, 1335 |
| log-reserve-draw | 1444, 1445, 1446, 1447, 1454 |
| log-snpl-borrow | 1496, 1497, 1498, 1499, 1509 |
| log-snpl-swap-deposit | 1519, 1520, 1521, 1522, 1530 |
| log-snpl-repay | 1573, 1574, 1575, 1576, 1589 |
| log-snpl-seize | 1600, 1601, 1602, 1603, 1612 |
| log-revoke | 316, 317, 318, 323 |
| log-cancel | 331, 332, 333, 339 |
| log-rfq-open | 1241, 1242, 1243, 1254 |
| log-rfq-fill | 1269, 1270, 1271, 1284 |
| log-rfq-cancel | 1295, 1296, 1297, 1306 |
| log-reserve-withdraw-stx | 1340, 1341, 1342, 1347 |
| log-reserve-open-credit-line | 1357, 1358, 1359, 1367 |
| log-reserve-set-credit-line-cap | 1375, 1376, 1377, 1383 |
| log-reserve-set-credit-line-interest | 1391, 1392, 1393, 1399 |
| log-reserve-close-credit-line | 1404, 1405, 1406, 1411 |
| log-reserve-set-paused | 1416, 1417, 1418, 1423 |
| log-reserve-set-min-sbtc-draw | 1428, 1429, 1430, 1435 |
| log-reserve-notify-return | 1463, 1464, 1465, 1472 |
| log-snpl-set-reserve | 1477, 1478, 1479, 1484 |
| log-snpl-cancel-swap | 1535, 1536, 1537, 1542 |
| log-snpl-set-swap-limit | 1550, 1551, 1552, 1558 |
| reconcile-vault-equity | 1653, 1654, 1655, 1656 |
| ERR_NOT_AUTHORIZED | 1 |
| ERR_INVALID_CONTRACT_HASH | 2 |
| ERR_ALREADY_REGISTERED | 3 |
| ERR_NOT_VERIFIED | 4 |
| ERR_HASH_MISMATCH | 5 |
| ERR_TIMELOCK_NOT_ELAPSED | 6 |
| ERR_PAUSED | 7 |
| ERR_NOT_PAUSED | 8 |
| ERR_NO_PENDING_OWNER | 9 |
| pending-owner | 16 |
| verified-contracts | 20 |
| token-equity | 32 |
| credit-if-registered | 171 |
| register | 259 |

## Per simulation (cumulative executed expressions of jing-core-v6)

| sim | txs | before | after |
|---|---|---|---|
| `1b7d24cc` | 93 | 0 | 366 |
| `21903045` | 156 | 366 | 366 |
| `3230d734` | 84 | 366 | 366 |
| `3582479f` | 27 | 366 | 366 |
| `39ca7d96` | 274 | 366 | 556 |
| `46e07863` | 110 | 556 | 608 |
| `47a85fe1` | 28 | 608 | 608 |
| `562290d6` | 14 | 608 | 608 |
| `57267ce2` | 26 | 608 | 632 |
| `5c614828` | 41 | 632 | 632 |
| `61f875f1` | 142 | 632 | 664 |
| `6978f913` | 33 | 664 | 664 |
| `6cad6dbd` | 408 | 664 | 784 |
| `75c2670a` | 28 | 784 | 784 |
| `7e018a44` | 177 | 784 | 784 |
| `83dc4c03` | 26 | 784 | 784 |
| `93fad242` | 258 | 784 | 784 |
| `943409e5` | 330 | 784 | 816 |
| `9a4f6fd6` | 20 | 816 | 816 |
| `9fc9abef` | 72 | 816 | 816 |
| `ab168657` | 454 | 816 | 816 |
| `b0991314` | 297 | 816 | 816 |
| `b9ed7d25` | 154 | 816 | 816 |
| `c30cf48c` | 291 | 816 | 816 |
| `c881a35d` | 72 | 816 | 816 |
| `d257db96` | 97 | 816 | 915 |
| `d3d3140f` | 75 | 915 | 915 |
| `d9bb7bc9` | 135 | 915 | 915 |
| `e2a4d3b7` | 105 | 915 | 915 |
| `e2ff3f33` | 41 | 915 | 915 |
| `9dfe9717` | 135 | 915 | 915 |
| `eaec8fc5` | 33 | 915 | 915 |
| `1dfbde21` | 27 | 915 | 915 |
| `1efca09a` | 20 | 915 | 915 |
| `30d1544e` | 41 | 915 | 915 |
| `343f608e` | 41 | 915 | 915 |
| `39549a17` | 93 | 915 | 915 |
| `40e456f2` | 21 | 915 | 915 |
| `41931700` | 20 | 915 | 915 |
| `4584e116` | 33 | 915 | 915 |
| `5a4c7687` | 93 | 915 | 915 |
| `6ec50f05` | 26 | 915 | 915 |
| `84c514ee` | 74 | 915 | 915 |
| `9b04485c` | 28 | 915 | 915 |
| `b180bda2` | 33 | 915 | 915 |
| `bb481e6e` | 28 | 915 | 915 |
| `cd3a8ef6` | 116 | 915 | 915 |
| `d2e2f058` | 84 | 915 | 915 |
| `d72a3abb` | 20 | 915 | 915 |
| `def91606` | 72 | 915 | 915 |
| `c958da67` | 38 | 915 | 915 |
| `313ba242` | 19 | 915 | 915 |

## Provenance and trace diagnostics

source d1a5bea, sha256 `88a689affb23f13030953e891336af42a3f5cb275f13b3c54c79d8cd4de50697`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 5163 |
| no trace returned by stxer | 588 |
| trace decode errors | 0 |
| calls to a counted market instance | 205 |
| ... of which without a trace | 0 |
| ... of which decode errors | 0 |

| sim | counted instances |
|---|---|
| `1b7d24cc` | jing-core-v6 |
| `21903045` | none |
| `3230d734` | none |
| `3582479f` | jing-core-v6 |
| `39ca7d96` | jing-core-v6 |
| `46e07863` | jing-core-v6 |
| `47a85fe1` | jing-core-v6 |
| `562290d6` | jing-core-v6 |
| `57267ce2` | jing-core-v6 |
| `5c614828` | jing-core-v6 |
| `61f875f1` | jing-core-v6 |
| `6978f913` | jing-core-v6 |
| `6cad6dbd` | jing-core-v6 |
| `75c2670a` | jing-core-v6 |
| `7e018a44` | jing-core-v6 |
| `83dc4c03` | jing-core-v6 |
| `93fad242` | jing-core-v6 |
| `943409e5` | jing-core-v6 |
| `9a4f6fd6` | jing-core-v6 |
| `9fc9abef` | jing-core-v6 |
| `ab168657` | jing-core-v6 |
| `b0991314` | jing-core-v6 |
| `b9ed7d25` | jing-core-v6 |
| `c30cf48c` | jing-core-v6 |
| `c881a35d` | jing-core-v6 |
| `d257db96` | jing-core-v6 |
| `d3d3140f` | jing-core-v6 |
| `d9bb7bc9` | jing-core-v6 |
| `e2a4d3b7` | jing-core-v6 |
| `e2ff3f33` | jing-core-v6 |
| `9dfe9717` | jing-core-v6 |
| `eaec8fc5` | jing-core-v6 |
| `1dfbde21` | jing-core-v6 |
| `1efca09a` | jing-core-v6 |
| `30d1544e` | jing-core-v6 |
| `343f608e` | jing-core-v6 |
| `39549a17` | jing-core-v6 |
| `40e456f2` | jing-core-v6 |
| `41931700` | jing-core-v6 |
| `4584e116` | jing-core-v6 |
| `5a4c7687` | jing-core-v6 |
| `6ec50f05` | jing-core-v6 |
| `84c514ee` | jing-core-v6 |
| `9b04485c` | jing-core-v6 |
| `b180bda2` | jing-core-v6 |
| `bb481e6e` | jing-core-v6 |
| `cd3a8ef6` | jing-core-v6 |
| `d2e2f058` | none |
| `d72a3abb` | jing-core-v6 |
| `def91606` | jing-core-v6 |
| `c958da67` | jing-core-v6 |
| `313ba242` | jing-core-v6 |

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
HIT  public    set-verified-contract              L184 unwrap!  u5002  | ERR_INVALID_CONTRACT_HASH
HIT  public    set-verified-contract              L185 asserts! u5001  | ERR_NOT_AUTHORIZED
HIT  public    set-verified-contract              L186 asserts! u5003  | ERR_ALREADY_REGISTERED
HIT  public    pause                              L202 asserts! u5001  | ERR_NOT_AUTHORIZED
HIT  public    unpause                            L217 asserts! u5001  | ERR_NOT_AUTHORIZED
HIT  public    unpause                            L218 asserts! u5017  | ERR_NOT_PAUSED
HIT  public    unpause                            L219 asserts! u5008  | ERR_TIMELOCK_NOT_ELAPSED
HIT  public    propose-owner                      L233 asserts! u5001  | ERR_NOT_AUTHORIZED
HIT  public    accept-owner                       L245 unwrap!  u5018  | ERR_NO_PENDING_OWNER
HIT  public    accept-owner                       L246 asserts! u5001  | ERR_NOT_AUTHORIZED
HIT  public    register                           L260 unwrap!  u5002  | ERR_INVALID_CONTRACT_HASH
HIT  public    register                           L261 unwrap!  u5005  | ERR_NOT_VERIFIED
HIT  public    register                           L263 asserts! u5006  | ERR_HASH_MISMATCH
HIT  public    register                           L264 asserts! u5003  | ERR_ALREADY_REGISTERED
HIT  public    log-deposit                        L283 try!     u5016  | (try! (check-not-paused))
---- public    log-deposit                        L284 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-withdraw                       L302 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-revoke                         L317 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-cancel                         L332 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-bitflow-swap                   L352 try!       | (try! (check-not-paused))
---- public    log-bitflow-swap                   L353 asserts!   | ERR_NOT_AUTHORIZED
HIT  public    log-deposit-x                      L386 try!     u5016  | (try! (check-not-paused))
---- public    log-deposit-x                      L387 asserts!   | ERR_NOT_AUTHORIZED
HIT  public    log-deposit-y                      L427 try!     u5016  | (try! (check-not-paused))
---- public    log-deposit-y                      L428 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-refund-x                       L462 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-refund-y                       L486 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-withdraw-x                     L512 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-withdraw-y                     L540 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-limit-y                        L567 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-limit-x                        L591 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-settle-refused-y               L616 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-settle-refused-x               L642 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-pending-readmit-y              L666 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-pending-readmit-x              L688 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-pending-deposit-y              L712 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-pending-refund-y               L737 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-pending-deposit-x              L762 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-pending-refund-x               L787 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-pending-limit-y                L811 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-pending-limit-x                L835 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-park-x                         L859 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-readmit-x                      L883 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-park-y                         L907 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-readmit-y                      L931 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-small-share-roll-x             L954 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-small-share-roll-y             L976 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-limit-roll-x                   L1000 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-limit-roll-y                   L1026 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-match                          L1056 try!       | (try! (check-not-paused))
---- public    log-match                          L1057 asserts!   | ERR_NOT_AUTHORIZED
HIT  public    log-settlement                     L1107 try!     u5016  | (try! (check-not-paused))
---- public    log-settlement                     L1108 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-distribute-x-depositor         L1144 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-distribute-y-depositor         L1177 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-sweep-dust                     L1213 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-rfq-open                       L1242 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-rfq-fill                       L1270 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-rfq-cancel                     L1296 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-reserve-supply                 L1312 try!       | (try! (check-not-paused))
---- public    log-reserve-supply                 L1313 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-reserve-withdraw-sbtc          L1327 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-reserve-withdraw-stx           L1341 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-reserve-open-credit-line       L1358 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-reserve-set-credit-line-cap    L1376 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-reserve-set-credit-line-interest L1392 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-reserve-close-credit-line      L1405 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-reserve-set-paused             L1417 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-reserve-set-min-sbtc-draw      L1429 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-reserve-draw                   L1445 try!       | (try! (check-not-paused))
---- public    log-reserve-draw                   L1446 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-reserve-notify-return          L1464 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-snpl-set-reserve               L1478 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-snpl-borrow                    L1497 try!       | (try! (check-not-paused))
---- public    log-snpl-borrow                    L1498 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-snpl-swap-deposit              L1520 try!       | (try! (check-not-paused))
---- public    log-snpl-swap-deposit              L1521 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-snpl-cancel-swap               L1536 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-snpl-set-swap-limit            L1551 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-snpl-repay                     L1574 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-snpl-seize                     L1601 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-jing-swap                      L1626 try!       | (try! (check-not-paused))
---- public    log-jing-swap                      L1627 asserts!   | ERR_NOT_AUTHORIZED
---- public    log-jing-swap-reconciled           L1670 try!       | (try! (check-not-paused))
---- public    log-jing-swap-reconciled           L1671 asserts!   | ERR_NOT_AUTHORIZED
18/85 failure arms hit
source sha256 88a689affb23f13030953e891336af42a3f5cb275f13b3c54c79d8cd4de50697; txs 5163, no trace 588, decode errors 0; calls to counted market instances 205, of which no trace 0, decode errors 0
```

Reproduce: `node simulations/trace-coverage.mjs --contract jing-core-v6 --by-source --md --sims <ids>` and `node simulations/failure-arms.mjs <ids> --by-source --contract jing-core-v6` with the sim ids of the 2026-10-01 rerun (README-v6-3-coverage.md section 0, README-router-ladder-coverage.md section 0, README-v1-core-spread-rungs.md).
