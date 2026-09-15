# Branch coverage matrix: markets-sbtc-stx-jing-v6 vs the stxer fork harnesses

Source: `contracts/markets-sbtc-stx-jing-v6.clar` (3453 lines, 2026-09-14 tree). Inventory: `simulations/branch-inventory.mjs` (384 rows, B ids and line numbers as regenerated on 2026-09-15; they match `simulations/BRANCHES-markets-v6.md`).

Harnesses read (every `verify-markets-v6-*.js`, `verify-v6-*.js`, `verify-vault-sbtc-stx-v6-parked.js`), short names used in the evidence column:

| short | file |
|---|---|
| gaps | verify-markets-v6-gaps.js |
| bounty | verify-markets-v6-bounty-fixes.js (main market + PARK instance MAX_DEPOSITORS u3) |
| lazer | verify-markets-v6-lazer-paths.js |
| multifill | verify-markets-v6-multifill.js |
| regr | verify-markets-v6-regression.js |
| rem | verify-markets-v6-remainder-cross.js |
| stress | verify-markets-v6-stress.js (random; never cited as proof) |
| wd | verify-markets-v6-withdraw.js |
| peg | verify-v6-peg-lazer.js |
| peg-batch | verify-v6-peg-batch-lazer.js |
| peg-edges | verify-v6-peg-edges-lazer.js |
| peg-mirror | verify-v6-peg-mirror-lazer.js (PARK instance u3) |
| peg-more | verify-v6-peg-more-lazer.js |
| peg-park | verify-v6-peg-park-lazer.js |
| peg-park-y | verify-v6-peg-park-y-lazer.js |
| peg-track | verify-v6-peg-track-lazer.js |
| peg-walk | verify-v6-peg-walk-order-lazer.js |
| rungs-fill | verify-v6-rungs-fill-lazer.js |
| rungs-keyless | verify-v6-rungs-keyless.js |
| rungs-band | verify-v6-rungs-miner-band-lazer.js |
| rungs-push | verify-v6-rungs-push-lazer.js |
| rungs-replace | verify-v6-rungs-replace-keyless.js |
| small-x | verify-v6-small-share-x-lazer.js |
| vault | verify-vault-sbtc-stx-v6-parked.js |

Rules applied:

- `yes` = both arms of an if/match reached by a step whose expected result proves it; for `asserts!` the failing side means a step expecting that error code, the passing side any step that goes through the function successfully. `partial` = one arm only. `no` = neither.
- `unwrap-panic` rows: `yes` when the expression is evaluated on a green path (the panic arm is unreachable by construction: every list is bounded by MAX_DEPOSITORS u50 before the append; `slice?` is called with a length <= `(len sorted)`).
- `try!` rows are `skip` (pure propagation) unless the propagated error is never produced, or the try! sits in a block no harness reaches (then noted).
- Known unreachable, listed as `n/a` and excluded from the totals: u1002 ERR_ALREADY_SETTLED (B298), u1003 ERR_STALE_PRICE (B58, B59, B301, B302), u1006 ERR_ZERO_PRICE (B60, B61, B299, B300, B306), u1014 ERR_EXPO_MISMATCH (B305), u1015 ERR_NOTHING_FILLED (dead constant, no row).
- A rung step counts as evidence for the market function the rung calls (deposit-token-x/y with `(some spread)`, withdraw-token-x/y, cancel-token-x/y-deposit, set-token-x/y-limit from the band rungs, sync-seat from a band rung's initialize); the vault likewise (set-token-x-limit, cancel-token-x-deposit, deposit-token-x).
- "step X" refers to the step label in the harness source. "(let)" marks an arm reached inside the eager `let` of `park-tenth-token-*`, where `top`, `off`, `outside` and `edge` are all computed before the match.

Key structural facts used below (see the source lines in the table):

- `park-tenth-token-y/x` returns `(ok false)` only for an in-range newcomer when the top set is empty (no alive out-of-range resident) and nobody is switched off. That is the only way into the `side-full` block of `deposit-token-y/x-core` (B70/B93 and everything under them: B15/B16 `find-smallest-*`, B71/B94). No harness ever builds a full side made only of in-range makers, and no harness swaps into a full side, so that whole block is unreached on both sides.
- The rebate cap `(if (> r pending) pending r)` in `execute-fill` (B243/B245) is proven unreachable off-chain by gaps G5 (exhaustive for gross <= 20000 and every mid split). Listed as `partial` and flagged, not counted as a gap to fund a step for.
- `would-take-as-x/y` short-circuit on price vs limit before the fold, so `live-bid-fold` / `live-offer-fold` only run for a limit at or inside the mid.

## 1. Matrix

| B | line | function | kind | condition | covered | evidence (harness: step) | note |
|---|---|---|---|---|---|---|---|
| B1 | 98 | with-seat | if | `(is-some (index-of? lst who))` | yes | true: rungs-band S9 "anyone syncs any seated rung (the spread-20 one)" (already seated); false: rungs-replace R5 "anyone syncs it on the market" (spread-40 not yet in the copy) | |
| B2 | 100 | with-seat | unwrap-panic | append seat u50 | yes | rungs-replace R5 (sync adds a seat) | panic arm unreachable: ladder seats <= 50 |
| B3 | 107 | refresh-seat-count | if | `(> n MAX_DEPOSITORS)` | partial | false: rungs-band S1 "sync-seat-count ... says 12"; rungs-replace R5 "sync-seat-count: market seats follow the max (4)" | true (clamp to 50) untested; jing-ladder `set-max-band-per-side` has no upper cap, so an owner can set 51 |
| B4 | 136 | sync-seat | asserts! | ERR_NOT_A_SEAT `(or x y)` | yes | fail: rungs-band S1 "sync-seat on a principal the ladder does not seat -> u1028", rungs-replace R2 (replaced rung); pass: rungs-band S9 sync, rungs-replace R5/R6 | y-side pass arm via rungs-replace R1 (sell rung initialize syncs itself: `is-protected-y` true) |
| B5 | 344 | pegged-bid | if | `(<= pegged cap)` | yes | true: peg-edges G1 "cap exactly mid - 30 bps -> in band"; false: peg-edges G1 "cap one unit under -> u0", peg P1 "pegged-bid out of band = u0" | |
| B6 | 357 | pegged-ask | if | `(>= pegged floor)` | yes | true: peg-edges G2 in band; false: peg-edges G2 "floor one unit over -> MAX_UINT", peg P1 | |
| B7 | 369 | order-y-price | match | spread-bps | yes | some: peg P7 "token-y-limit-at in band = mid - 20 bps"; none: rungs-fill F2 "the sell rung's bid rolled with its own limit" (fixed order through `token-y-limit-at` in the limit filter) | |
| B8 | 380 | order-x-price | match | spread-bps | yes | some: peg P2 "token-x-limit-at in band = mid + 20 bps"; none: rungs-fill F2 "match at the buy rung's fixed price" (walk reads `token-x-limit-at`) | |
| B9 | 403 | valid-spread | match | spread-bps | yes | some+true: peg P8 "A pegs it 30 bps"; some+false: peg P8 "spread 10000 bps -> u1026"; none: any fixed deposit (gaps G2) | |
| B10 | 413 | log-peg-y-if | match | spread-bps | yes | some: peg-batch Z1 "peg-y logged for the (some u0) deposit"; none: peg-batch Z2 "no peg-y for a fixed (none) deposit" (print counted) | |
| B11 | 425 | log-peg-x-if | match | spread-bps | yes | some: peg P8 "A pegs it 30 bps (same floor)" (set-token-x-limit with (some u30) returns ok, so log-peg-x ran); none: peg P8 "back to fixed" | peg-x print itself is only asserted for a stranger (peg-edges C1), not on the some arm |
| B12 | 445 | count-seated-fold | if | seated member in depositors | yes | true: rungs-band S2/S3 (fillers deposit while the seated buy rung rests: 41 rest, open region 40 -> "filler 41 ... -> u1010" proves the rung was subtracted); false: every non-seated depositor in the same fold | |
| B13 | 466 | side-full-y | if | `who` is seated | yes | true: rungs-band M4 "S deposits 5 STX into the sell rung" (sell rung seated on y, S1); false: any direct y maker | true arm only proves the branch ran (side not full), not the hard-cap comparison |
| B14 | 478 | side-full-x | if | `who` is seated | yes | true: rungs-band S4 "A tops the rung up by 1000: a protected maker only sees the hard cap -> pushed" (41 rest, open region full, rung still accepted); false: rungs-band S3 filler -> u1010 | |
| B15 | 495 | find-smallest-token-y-fold | if | not seated and smaller | no | none: the fold only runs in the `side-full` block of deposit-token-y-core (B70 true), which no harness reaches (needs park-tenth `(ok false)`: in-range newcomer on a side with no alive out-of-range maker, or a swap into a full y side) | both arms unreached |
| B16 | 515 | find-smallest-token-x-fold | if | not seated and smaller | no | none: mirror of B15 (B93 true never reached) | both arms unreached |
| B17 | 552 | top-y-insert | if | not placed and `e` better than `entry` | yes | bounty D5b "N2 1.6 STX at -3%: beats the 2nd best" (fold order P2 -5, P3 -1, N3 -6: P3 placed before P2 = true; N3 vs P3, P2 = false, appended) | |
| B18 | 578 | top-x-insert | if | not placed and `e` better | yes | true: vault V4 "parker rests 2000 in range" (fillers +5% after the vault +25%: filler placed before it); false: same step, equal-price fillers appended | also bounty PX "N4 in-range newcomer -> parks Q1" (Q3 +5% before Q1 +10%) |
| B19 | 603 | top-y-fold | if | seated or in range: skip | yes | true: bounty P "N1 in-range newcomer -> parks farthest (P1)" (P2 in range skipped); false: P1/P3 out of range ranked | seated sub-case only on x (B22) |
| B20 | 614 | top-y-fold | if | `(get placed r)` | yes | true: bounty D5b (P3 placed); false: first out-of-range entry (empty out) and N3 appended | |
| B21 | 622 | top-y-fold | unwrap-panic | slice to `slots` | yes | `(> len slots)` true: bounty D5b (3 out of range, slots 2, "N3 ... outside the 2 price slots is not touched"); false: bounty P N1 (2 <= 10) | |
| B22 | 643 | top-x-fold | if | seated or in range: skip | yes | true: rungs-band S5 "in-range ask ... parks the 10th best filler, never the rung" (seated rung skipped), bounty PX N4 (Q2 in range skipped); false: fillers ranked | |
| B23 | 654 | top-x-fold | if | `(get placed r)` | yes | true: vault V4 (filler placed before the vault); false: first entry | |
| B24 | 662 | top-x-fold | unwrap-panic | slice to `slots` | yes | true: peg-park K3 (49 out-of-range > 10 slots); false: bounty PX N4 (2 <= 10) | |
| B25 | 686 | smallest-outside-y-fold | if | seated / in top / in range: skip | yes | true: bounty D5b (P3, P2 in the top set); false: N3 outside | |
| B26 | 693 | smallest-outside-y-fold | if | `(< amt smallest)` | yes | true: bounty D5b (N3 is the first outside); false: peg-park-y Y1 "parker rests an IN-RANGE bid" (let: 39 equal 1.5 STX fillers outside the top 10, every one after the first fails `<`) | |
| B27 | 712 | first-off-y-fold | if | switched-off resident found | yes | true: peg-park-y Y1 (inactive sell rung, limit-at u0, parked first); false: the fillers | |
| B28 | 726 | first-off-x-fold | if | switched-off resident found | yes | true: peg-park K2b "the switched-off peg is parked first"; false: fillers | |
| B29 | 761 | park-tenth-token-y | unwrap-panic | `edge` = n>0 and last worse than bid | yes | bounty P N1 (n = 2, element-at evaluated) | the `(> n u0)` false short-circuit is the same unreached case as B31 |
| B30 | 763 | park-tenth-token-y | match | `off` | yes | some: peg-park-y Y1 "the rung is parked with its full 20 STX", Y3/Y4 (P, Q parked); none: bounty P N1 | |
| B31 | 765 | park-tenth-token-y | if | in range and `n = 0` -> `(ok false)` | partial | false: bounty P N1 (n = 2), bounty "P N2 out-of-range ... -> u1010" | true never: no harness has a full y side whose alive residents are all in range (see B15) |
| B32 | 767 | park-tenth-token-y | if | `edge` | yes | true: bounty P N1, D2, D5c/D5d; false: bounty "P N2 out-of-range newcomer smaller than smallest -> u1010", D3, D5, D7 | |
| B33 | 768 | park-tenth-token-y | unwrap-panic | `last` | yes | bounty P N1 | |
| B34 | 769 | park-tenth-token-y | match | outside (edge path) | yes | some: bounty D5c "N2 demoted, smaller than the smallest outside (N3, 2.5) -> N2 parked"; none: bounty P N1 (P1, P3 both in the top set -> last parked) | |
| B35 | 770 | park-tenth-token-y | if | last bigger than smallest outside | yes | true: bounty D5d "N1 demoted, bigger than the smallest outside (N3, 2.5) -> N3 parked, N1 stays"; false: bounty D5c (N2 1.6 parked) | |
| B36 | 777 | park-tenth-token-y | match | outside (no edge) | yes | some: bounty D5 "size rule -> the smallest (N1, 1.6) is parked", D7 R2; none: bounty "P P3 deposits 1 STX while parked: ... nobody out of range on the book -> u1010" | |
| B37 | 778 | park-tenth-token-y | if | `(> size smallest)` | yes | true: bounty D5, D7 "R1 deposits 1.5 ... 3.5 > 3 -> R2 parked"; false: bounty D3/D4 u1010, D7 "size 3 = ... not bigger -> u1010 (strict)" | |
| B38 | 801 | smallest-outside-x-fold | if | seated / in top / in range: skip | yes | true: bounty PX N4 (Q2 in range, Q1/Q3 in top); false: peg-park K3 (39 fillers outside the top 10) | |
| B39 | 808 | smallest-outside-x-fold | if | `(< amt smallest)` | yes | true: peg-park K3 first outside filler; false: the other 38 equal 2000 fillers (let) | |
| B40 | 858 | park-tenth-token-x | unwrap-panic | `edge` | yes | bounty PX N4, peg-park K3 | n = 0 short-circuit unreached (B42) |
| B41 | 860 | park-tenth-token-x | match | `off` | yes | some: peg-park K2b "the inactive peg is parked with its full 20000"; none: bounty PX N4, peg-park K3 | |
| B42 | 862 | park-tenth-token-x | if | in range and `n = 0` -> `(ok false)` | partial | false: bounty PX N4, peg-park K3, vault V4 | true never (mirror of B31) |
| B43 | 864 | park-tenth-token-x | if | `edge` | partial | true: bounty PX N4 (Q1 +10% worse than ask 1), peg-park K3/K8, vault V4, rungs-band S5 | false never on x: every out-of-range x newcomer on a full side in the harnesses is either switched off (u1010 at B107 before park-tenth: bounty PX Q1 peg, peg-park K6/K7) or finds a dead resident first (peg-park K2b) |
| B44 | 865 | park-tenth-token-x | unwrap-panic | `last` | yes | bounty PX N4 | |
| B45 | 866 | park-tenth-token-x | match | outside (edge path) | yes | some: peg-park K3 (39 fillers outside the top 10), K8; none: bounty PX N4 (Q1, Q3 in top) | |
| B46 | 867 | park-tenth-token-x | if | last bigger than smallest outside | partial | false: peg-park K3 (last 2000 not > smallest 2000: the last of the top set is parked, "x total ... 101000"), K8, rungs-band S5 | true never on x (needs the N-th best out-of-range ask to be bigger than the smallest ask outside the top set; every x filler book is equal-sized) |
| B47 | 874 | park-tenth-token-x | match | outside (no edge) | no | none: requires B43 false | both arms unreached on x (y mirror B36 covered) |
| B48 | 875 | park-tenth-token-x | if | `(> size smallest)` | no | none: requires B43 false | both arms unreached on x (y mirror B37 covered) |
| B49 | 908 | park-token-y | try! | log-park-y | skip | | |
| B50 | 936 | park-token-x | try! | log-park-x | skip | | |
| B51 | 980 | pick-feed | if | feed id match | yes | lazer L1 "refresh-mid with the full update -> mid" (BTC matches id 1 / STX 45, each feed misses the other id) | |
| B52 | 1007 | shape-feed | unwrap! | ERR_PRICE_UNCERTAIN confidence | yes | fail: lazer L4 "update lacking confidence -> u1004", "swap with the no-confidence update -> u1004"; pass: L1 | |
| B53 | 1011 | shape-feed | unwrap! | ERR_FEED_TIMESTAMP_MISSING | yes | fail: lazer L8 "update lacking feedUpdateTimestamp -> u1025"; pass: L1 | |
| B54 | 1020 | lazer-feeds | try! | oracle verify-price-feeds | skip | error produced: gaps G7 "older than 80 s ... refused by the oracle (u1002)", peg-edges H3 / rungs-push P4 (stale fixture, rung holds) | |
| B55 | 1045 | lazer-feeds | try! | shape-feed x | skip | errors covered at B52/B53 | |
| B56 | 1046 | lazer-feeds | try! | shape-feed y | skip | | |
| B57 | 1053 | fresh-classification-price | try! | lazer-feeds | skip | ERR_FEED_MISSING (unwrap! at 1025/1034, not an inventory row) covered by lazer L2/L3 u1023 | |
| B58 | 1058 | fresh-classification-price | asserts! | ERR_STALE_PRICE x | n/a | known unreachable (oracle refuses first: gaps G7) | excluded |
| B59 | 1059 | fresh-classification-price | asserts! | ERR_STALE_PRICE y | n/a | known unreachable | excluded |
| B60 | 1060 | fresh-classification-price | asserts! | ERR_ZERO_PRICE x | n/a | known unreachable | excluded |
| B61 | 1061 | fresh-classification-price | asserts! | ERR_ZERO_PRICE y | n/a | known unreachable | excluded |
| B62 | 1075 | live-bid-fold | if | `(get found acc)` already found | partial | false: peg-park-y Y3 "A rests an in-range ask 2000 sats (no live bid at or over mid: rests)" (fold over 50 bids, none live); regr "crossing x deposit -> MUST_USE_SWAP" (found on a one-element list) | true (a live bid found before the last element) never: every u1016 on x hits a one-element y list or the last element |
| B63 | 1078 | live-bid-fold | if | live at price | yes | true: regr "crossing x deposit -> MUST_USE_SWAP", peg-edges H1 (rung deposit at mid -> u1016 held); false: peg-park-y Y3 A ask (fillers at -5% not live) | amount < min sub-clause false: rem S4 (M2 dust) is on the x mirror B65 |
| B64 | 1097 | live-offer-fold | if | `(get found acc)` already found | partial | false: bounty B3 "F 1 STX in-range bid" (M at +2% not live), peg P3 "S fixed bid at any cap -> u1016 now" (found on the last element A) | true never (found before the last element) |
| B65 | 1100 | live-offer-fold | if | live at price | yes | true: peg P3 "S fixed bid at any cap -> u1016 now" (A's zero-spread peg at mid); false: bounty B3 (M +2%), rem S4 (M2 dust under min while in range) | |
| B66 | 1160 | deposit-token-y-core | asserts! | ERR_PAUSED | yes | fail: gaps G2 "deposit while paused -> u1007" (depositY); pass: any y deposit | |
| B67 | 1161 | deposit-token-y-core | asserts! | ERR_DEPOSIT_TOO_SMALL | yes | fail: gaps G6 "y deposit below min -> u1001"; pass: any | position-wide min (top-up under min) proven on x only (gaps G6, B90 note) |
| B68 | 1164 | deposit-token-y-core | asserts! | ERR_LIMIT_REQUIRED | partial | pass: any y deposit | fail never: no deposit-token-y / y-swap with limit u0 (u1011 only tested on reprice-x, set-limit-x) |
| B69 | 1165 | deposit-token-y-core | asserts! | ERR_WRONG_TRAIT | partial | pass: any | fail never: no deposit-token-y with the sBTC trait |
| B70 | 1168 | deposit-token-y-core | if | new maker on a full side | partial | false: every y deposit (side not full after park-tenth, or top-up) | true never (see B15) |
| B71 | 1179 | deposit-token-y-core | asserts! | ERR_QUEUE_FULL (core size rule) | no | none | in the unreached block |
| B72 | 1183 | deposit-token-y-core | try! | log-park-y (core) | skip | block unreached | |
| B73 | 1186 | deposit-token-y-core | try! | stx-transfer (core full) | skip | block unreached | |
| B74 | 1189 | deposit-token-y-core | unwrap-panic | list rebuild (core full) | no | none | in the unreached block |
| B75 | 1210 | deposit-token-y-core | try! | log-deposit-y (core full) | skip | block unreached | |
| B76 | 1217 | deposit-token-y-core | try! | stx-transfer | skip | | |
| B77 | 1231 | deposit-token-y-core | if | `(is-eq existing u0)` | yes | true: any fresh y deposit; false: regr "tiny y bid rests (cycle 1)" (top-up on the rolled bid), peg-park-y Y4 "S deposits 0.5 STX more: plain top-up" | |
| B78 | 1233 | deposit-token-y-core | unwrap-panic | append depositor | yes | any fresh y deposit | |
| B79 | 1237 | deposit-token-y-core | try! | log-deposit-y | skip | | |
| B80 | 1261 | deposit-token-y | if | read the price (x present or new maker on a full side) | yes | true (x present): lazer L5 "the same bid against a resting ask -> u1004 (the gate must read the price)"; true (full, x empty): peg-park-y Y1 parker (classified, parked the dead rung); false: lazer L5 "bid with the no-confidence update on an empty x side -> accepted (no price read)" | |
| B81 | 1265 | deposit-token-y | try! | fresh-classification-price | skip | error produced: lazer L5 u1004 | |
| B82 | 1270 | deposit-token-y | asserts! | ERR_BAD_SPREAD | partial | pass: every pegged y deposit (peg-batch Z1) | fail never: no deposit-token-y with spread >= 10000 (u1026 tested on set-limit-x, reprice-x, reprice-y only) |
| B83 | 1271 | deposit-token-y | asserts! | ERR_MUST_USE_SWAP | yes | fail: peg P3 "S fixed bid at any cap -> u1016 now", "S zero-spread pegged bid -> u1016 too"; pass: any | |
| B84 | 1275 | deposit-token-y | asserts! | ERR_QUEUE_FULL (switched-off new maker on a full side) | yes | fail: bounty "P N2 switched-off peg newcomer ... -> u1010, no bump", peg-park-y Y3 "P rests an out-of-band zero-spread peg ... -> u1010", Y4 Q; pass: any | |
| B85 | 1279 | deposit-token-y | try! | park-tenth-token-y | skip | error produced: bounty D3 u1010 | |
| B86 | 1281 | deposit-token-y | try! | deposit-token-y-core | skip | | |
| B87 | 1282 | deposit-token-y | try! | log-peg-y-if | skip | | |
| B88 | 1285 | deposit-token-y | try! | `(and (> parked u0) log-readmit-y)` | yes | parked > 0: peg-park-y Y4 "the parked deposit printed readmit-y with the parked amount", bounty D5c/D5d/D5e/D7; parked = 0: any plain deposit | counted as a branch (the `and` guard) |
| B89 | 1309 | deposit-token-x-core | asserts! | ERR_PAUSED | partial | pass: any x deposit | fail never: gaps G2 pauses a y deposit and a y-side swap only; no x deposit / x-swap while paused |
| B90 | 1310 | deposit-token-x-core | asserts! | ERR_DEPOSIT_TOO_SMALL | partial | pass: gaps G6 "x top-up below min onto the live 2000 ask -> ok (v6)" (position-wide min), any x deposit | fail never: no fresh deposit-token-x under 1000 sats (gaps "swap of u0 -> u1001" dies at swap's own B227) |
| B91 | 1313 | deposit-token-x-core | asserts! | ERR_LIMIT_REQUIRED | partial | pass: any | fail never: no deposit-token-x / x-swap with limit u0 |
| B92 | 1314 | deposit-token-x-core | asserts! | ERR_WRONG_TRAIT | partial | pass: any | fail never |
| B93 | 1316 | deposit-token-x-core | if | new maker on a full side | partial | false: every x deposit | true never (see B16) |
| B94 | 1327 | deposit-token-x-core | asserts! | ERR_QUEUE_FULL (core size rule) | no | none | unreached block |
| B95 | 1330 | deposit-token-x-core | try! | log-park-x (core) | skip | block unreached | |
| B96 | 1333 | deposit-token-x-core | try! | ft transfer (core full) | skip | block unreached | |
| B97 | 1336 | deposit-token-x-core | unwrap-panic | list rebuild (core full) | no | none | unreached block |
| B98 | 1357 | deposit-token-x-core | try! | log-deposit-x (core full) | skip | block unreached | |
| B99 | 1364 | deposit-token-x-core | try! | ft transfer | skip | | |
| B100 | 1378 | deposit-token-x-core | if | `(is-eq existing u0)` | yes | true: any fresh x deposit; false: gaps G6 x top-up, bounty "PX N4 top-up (existing) needs no park", peg-mirror X7 | |
| B101 | 1380 | deposit-token-x-core | unwrap-panic | append depositor | yes | any fresh x deposit | |
| B102 | 1384 | deposit-token-x-core | try! | log-deposit-x | skip | | |
| B103 | 1408 | deposit-token-x | if | read the price (y present or new maker on a full side) | yes | true (y present): rungs-push P1 "A deposits 20000 sats with an EMPTY update: the market refuses the read, the rung holds" (S bid rests); true (full, y empty): peg-park K2b/K3 (classified on a full x side with y empty); false: rungs-keyless "A deposit 600 -> 1100 pushed to market" (0x00 update accepted, y empty) | |
| B104 | 1412 | deposit-token-x | try! | fresh-classification-price | skip | error produced: rungs-push P1 (held) | |
| B105 | 1417 | deposit-token-x | asserts! | ERR_BAD_SPREAD | partial | pass: peg-walk O1 pegged asks | fail never: no deposit-token-x with spread >= 10000 |
| B106 | 1418 | deposit-token-x | asserts! | ERR_MUST_USE_SWAP | yes | fail: regr "crossing x deposit -> MUST_USE_SWAP", peg-edges H1 (rung held on u1016); pass: any | |
| B107 | 1420 | deposit-token-x | asserts! | ERR_QUEUE_FULL (switched-off new maker on a full side) | yes | fail: bounty "PX Q1 returns as a switched-off peg ask ... -> u1010, no bump", peg-park K6 (rung holds on the market's u1010); pass: any | |
| B108 | 1424 | deposit-token-x | try! | park-tenth-token-x | skip | | |
| B109 | 1426 | deposit-token-x | try! | deposit-token-x-core | skip | | |
| B110 | 1427 | deposit-token-x | try! | log-peg-x-if | skip | | |
| B111 | 1430 | deposit-token-x | try! | `(and (> parked u0) log-readmit-x)` | partial | parked = 0: any plain x deposit | parked > 0 never on x: no parked x maker deposits straight back successfully (peg-park K6/K7 are refused u1010; bounty PX Q1 cancels; wd/peg-mirror use readmit) |
| B112 | 1450 | cancel-token-y-deposit | asserts! | ERR_WRONG_TRAIT | partial | pass: gaps G6 y cancel | fail never (wrong trait tested on withdraw only: wd Y5) |
| B113 | 1451 | cancel-token-y-deposit | asserts! | ERR_NOTHING_TO_WITHDRAW | partial | pass: any y cancel | fail never: no cancel-token-y-deposit with neither live nor parked (u1005 is only tested on withdraw and reprice-x) |
| B114 | 1452 | cancel-token-y-deposit | if | `(is-eq amount u0)` (parked refund) | yes | true: peg-park-y Y3 "S exits the rung entirely (whole cancel, off the market)" (rung cancels while parked 19.5 STX: "rung off the queue", queue still 50); false: gaps G6 "y maker cancels (book always open)" (100 STX back) | |
| B115 | 1454 | cancel-token-y-deposit | try! | as-contract? parked | skip | | |
| B116 | 1455 | cancel-token-y-deposit | try! | stx-transfer parked | skip | | |
| B117 | 1459 | cancel-token-y-deposit | try! | log-refund-y parked | skip | | |
| B118 | 1465 | cancel-token-y-deposit | try! | as-contract? live | skip | | |
| B119 | 1466 | cancel-token-y-deposit | try! | stx-transfer live | skip | | |
| B120 | 1480 | cancel-token-y-deposit | try! | log-refund-y live | skip | | |
| B121 | 1501 | cancel-token-x-deposit | asserts! | ERR_WRONG_TRAIT | partial | pass: gaps G6 x cancel | fail never |
| B122 | 1502 | cancel-token-x-deposit | asserts! | ERR_NOTHING_TO_WITHDRAW | partial | pass: any x cancel | fail never |
| B123 | 1503 | cancel-token-x-deposit | if | `(is-eq amount u0)` (parked refund) | yes | true: bounty "PX Q1 cancels while parked -> refund" (+3000 sats checked), vault V6 "keeper cancels the parked ask" (vault sBTC 0 -> 20000); false: gaps G6 "x maker cancels" (2000 sats back) | |
| B124 | 1505 | cancel-token-x-deposit | try! | as-contract? parked | skip | | |
| B125 | 1506 | cancel-token-x-deposit | try! | ft transfer parked | skip | | |
| B126 | 1510 | cancel-token-x-deposit | try! | log-refund-x parked | skip | | |
| B127 | 1516 | cancel-token-x-deposit | try! | as-contract? live | skip | | |
| B128 | 1517 | cancel-token-x-deposit | try! | ft transfer live | skip | | |
| B129 | 1531 | cancel-token-x-deposit | try! | log-refund-x live | skip | | |
| B130 | 1551 | withdraw-token-y | if | `on-live` (have) | yes | true: wd Y6 "withdraw-y 30 STX -> (ok u70000000)"; false: wd P9 "parked withdraw-y 0.5 STX -> (ok u1500000)" | |
| B131 | 1557 | withdraw-token-y | if | `(> amount have)` clamp | partial | false: wd Y6, Y3 (amount = have) | true never on y (wd L5 "more than the size" is x); dead-ish: the clamp only feeds `remaining` before B135 refuses with u1024 |
| B132 | 1562 | withdraw-token-y | asserts! | ERR_WRONG_TRAIT | yes | fail: wd Y5 "withdraw-y wrong trait -> u1013"; pass: Y6 | |
| B133 | 1563 | withdraw-token-y | asserts! | ERR_NOTHING_TO_WITHDRAW `(> have u0)` | yes | fail: wd Y1 "withdraw-y with no deposit -> u1005"; pass: Y6 | |
| B134 | 1564 | withdraw-token-y | asserts! | ERR_NOTHING_TO_WITHDRAW `(> amount u0)` | partial | pass: Y6 | fail never on y (wd L3 "withdraw-x 0 -> u1005" is x) |
| B135 | 1565 | withdraw-token-y | asserts! | ERR_USE_CANCEL | yes | fail: wd Y3 "the whole size -> u1024", P7 (parked); pass: Y6 | |
| B136 | 1566 | withdraw-token-y | asserts! | ERR_DEPOSIT_TOO_SMALL remaining | yes | fail: wd Y4 "leaving 0.5 STX -> u1001", P8 (parked); pass: Y6 | |
| B137 | 1567 | withdraw-token-y | try! | as-contract? | skip | | |
| B138 | 1568 | withdraw-token-y | try! | stx-transfer | skip | | |
| B139 | 1570 | withdraw-token-y | if | `on-live` (write back) | yes | true: wd Y6 ("live size 70 STX", "totals 70 STX"); false: wd P9 ("parked now 1.5 STX", totals unchanged) | |
| B140 | 1584 | withdraw-token-y | try! | log-withdraw-y | skip | | |
| B141 | 1602 | withdraw-token-x | if | `on-live` (have) | yes | true: wd L9 "withdraw-x 3000 -> (ok u7000)"; false: wd PX7 "parked withdraw-x 500 -> (ok u2500)", peg-park K5 (rung withdraws from the parked balance) | |
| B142 | 1608 | withdraw-token-x | if | `(> amount have)` clamp | yes | true: wd L5 "withdraw-x more than the size -> u1024"; false: L9 | |
| B143 | 1613 | withdraw-token-x | asserts! | ERR_WRONG_TRAIT | yes | fail: wd L7 "-> u1013"; pass: L9 | |
| B144 | 1614 | withdraw-token-x | asserts! | ERR_NOTHING_TO_WITHDRAW `(> have u0)` | yes | fail: wd L1, L8 "-> u1005"; pass: L9 | |
| B145 | 1615 | withdraw-token-x | asserts! | ERR_NOTHING_TO_WITHDRAW `(> amount u0)` | yes | fail: wd L3 "withdraw-x 0 -> u1005"; pass: L9 | |
| B146 | 1616 | withdraw-token-x | asserts! | ERR_USE_CANCEL | yes | fail: wd L4, L5; pass: L9 | |
| B147 | 1617 | withdraw-token-x | asserts! | ERR_DEPOSIT_TOO_SMALL remaining | yes | fail: wd L6, L17 "1 below min -> u1001", PX10 (parked); pass: L16 "leaving exactly min -> ok" | |
| B148 | 1618 | withdraw-token-x | try! | as-contract? | skip | | |
| B149 | 1619 | withdraw-token-x | try! | ft transfer | skip | | |
| B150 | 1621 | withdraw-token-x | if | `on-live` (write back) | yes | true: wd L9 ("live size 7000", "totals 7000"); false: wd PX7 ("parked now 2500", "totals exclude parked (10000)") | |
| B151 | 1635 | withdraw-token-x | try! | log-withdraw-x | skip | | |
| B152 | 1651 | readmit-token-y | try! | fresh-classification-price | skip | | |
| B153 | 1654 | readmit-token-y | asserts! | ERR_PAUSED | partial | pass: bounty "P readmit P1 (keeper) -> ok" | fail never (no readmit while paused) |
| B154 | 1655 | readmit-token-y | asserts! | ERR_NOTHING_TO_READMIT | yes | fail: bounty "P readmit P3 (no longer parked) -> u1022", "P readmit P1 (live, not parked) -> u1022", peg-park-y Y3; pass: bounty readmit P1 ok | |
| B155 | 1656 | readmit-token-y | asserts! | ERR_QUEUE_FULL | yes | fail: bounty "P readmit P1 with side full -> u1010"; pass: "P readmit P1 (keeper) -> ok" | |
| B156 | 1657 | readmit-token-y | asserts! | ERR_MUST_USE_SWAP | yes | fail: peg-park-y Y3 "readmit P -> u1016: a zero-spread peg at mid would take the ask"; pass: Y3 "readmit P -> ok" | |
| B157 | 1665 | readmit-token-y | unwrap-panic | append | yes | bounty readmit P1 ok | |
| B158 | 1671 | readmit-token-y | try! | log-readmit-y | skip | | |
| B159 | 1687 | readmit-token-x | try! | fresh-classification-price | skip | | |
| B160 | 1690 | readmit-token-x | asserts! | ERR_PAUSED | partial | pass: wd PX12 "readmit Q1 -> ok u2500" | fail never |
| B161 | 1691 | readmit-token-x | asserts! | ERR_NOTHING_TO_READMIT | partial | pass: wd PX12, peg-mirror X6 | fail never on x (u1022 only tested on y) |
| B162 | 1692 | readmit-token-x | asserts! | ERR_QUEUE_FULL | yes | fail: bounty "PX readmit Q1 full -> u1010"; pass: wd PX12 | |
| B163 | 1693 | readmit-token-x | asserts! | ERR_MUST_USE_SWAP | yes | fail: peg-mirror X5 "readmit Q2 -> u1016: an ask at mid would take Y1"; pass: X6 "readmit Q2 -> ok" | |
| B164 | 1701 | readmit-token-x | unwrap-panic | append | yes | wd PX12 | |
| B165 | 1707 | readmit-token-x | try! | log-readmit-x | skip | | |
| B166 | 1720 | set-token-y-limit | asserts! | ERR_LIMIT_REQUIRED | partial | pass: bounty B2 "W reprices to in-range" | fail never on y (peg P8 "zero floor -> u1011" is set-token-x-limit) |
| B167 | 1721 | set-token-y-limit | asserts! | ERR_BAD_SPREAD | partial | pass: peg-batch N2 "Y1 -> 30 bps peg (set-limit)" | fail never on y (u1026 on set-limit tested on x only) |
| B168 | 1722 | set-token-y-limit | asserts! | ERR_NOTHING_TO_WITHDRAW (live or parked) | partial | pass live: bounty B2; pass parked: bounty "P P1 reprices while parked -> ok", peg-park-y Y3 "P re-pegs while parked" | fail never (set-token-y-limit by a principal with nothing) |
| B169 | 1729 | set-token-y-limit | if | x depositors present -> read price + gate | yes | true: bounty B2 "W reprices to in-range (M ask not live)" (x = M, price read, gate passes); false: peg-park-y Y3 "P re-pegs while parked: ... (no asks rest: no price needed)", bounty P P1 (PID x empty) | |
| B170 | 1730 | set-token-y-limit | try! | fresh-classification-price | skip | | |
| B171 | 1731 | set-token-y-limit | asserts! | ERR_MUST_USE_SWAP | partial | pass: bounty B2 | fail never on y (regr "set-limit live -> MUST_USE_SWAP" is set-token-x-limit) |
| B172 | 1742 | set-token-y-limit | try! | log-set-limit-y | skip | print asserted: peg-batch N2 | |
| B173 | 1745 | set-token-y-limit | try! | log-peg-y-if | skip | | |
| B174 | 1755 | set-token-x-limit | asserts! | ERR_LIMIT_REQUIRED | yes | fail: peg P8 "zero floor -> u1011"; pass: P8 | |
| B175 | 1756 | set-token-x-limit | asserts! | ERR_BAD_SPREAD | yes | fail: peg P8 "spread 10000 bps -> u1026"; pass: P8 | |
| B176 | 1757 | set-token-x-limit | asserts! | ERR_NOTHING_TO_WITHDRAW (live or parked) | partial | pass live: peg P8, gaps G2; pass parked: peg-mirror X3 "Q2 re-pegs while parked", vault V5 "set-limit amount = parked 20k -> ok" | fail never |
| B177 | 1764 | set-token-x-limit | if | y depositors present -> read price + gate | yes | true: regr "set-limit live -> MUST_USE_SWAP" (y bid rests), gaps G2 "set-token-x-limit not gated by pause"; false: peg-mirror X3 "(no bid rests: no price)", peg P8 | |
| B178 | 1765 | set-token-x-limit | try! | fresh-classification-price | skip | | |
| B179 | 1766 | set-token-x-limit | asserts! | ERR_MUST_USE_SWAP | yes | fail: regr "set-limit live -> MUST_USE_SWAP"; pass: gaps G2 | |
| B180 | 1777 | set-token-x-limit | try! | log-set-limit-x | skip | | |
| B181 | 1780 | set-token-x-limit | try! | log-peg-x-if | skip | | |
| B182 | 1797 | reprice-or-swap-token-y | asserts! | ERR_LIMIT_REQUIRED | partial | pass: rem S7a | fail never on y (regr "reprice limit 0 -> LIMIT_REQUIRED" is x) |
| B183 | 1798 | reprice-or-swap-token-y | asserts! | ERR_BAD_SPREAD | yes | fail: peg-mirror R3 "spread 10000 -> u1026"; pass: R2 | |
| B184 | 1799 | reprice-or-swap-token-y | asserts! | ERR_NOTHING_TO_WITHDRAW | partial | pass: rem S7a | fail never on y (regr "reprice no deposit -> NOTHING_TO_WITHDRAW" is x) |
| B185 | 1800 | reprice-or-swap-token-y | asserts! | ERR_WRONG_TRAIT tx | partial | pass: S7a | fail never |
| B186 | 1801 | reprice-or-swap-token-y | asserts! | ERR_WRONG_TRAIT ty | partial | pass: S7a | fail never |
| B187 | 1806 | reprice-or-swap-token-y | try! | log-set-limit-y | skip | | |
| B188 | 1809 | reprice-or-swap-token-y | try! | log-peg-y-if | skip | | |
| B189 | 1810 | reprice-or-swap-token-y | if | x present and would take -> cross | yes | true: rem S7a "reprice-or-swap-token-y ok" (mid + walk payouts checked), peg-mirror R5; false: peg-mirror R2 "plain reprice (no ask)" (x empty) | the sub-case "x present but not taking" is only proven on x (B201 regr) |
| B190 | 1812 | reprice-or-swap-token-y | try! | fresh-classification-price | skip | | |
| B191 | 1819 | reprice-or-swap-token-y | try! | `(and (> rebate u0) stx-transfer)` | skip | rebate > 0: rem S7a (REBATE7 > 0) | |
| B192 | 1823 | reprice-or-swap-token-y | try! | settle-with-refresh | skip | | |
| B193 | 1825 | reprice-or-swap-token-y | try! | cross-remainder-as-y | skip | | |
| B194 | 1855 | reprice-or-swap-token-x | asserts! | ERR_LIMIT_REQUIRED | yes | fail: regr "reprice limit 0 -> LIMIT_REQUIRED"; pass: regr "plain reprice zero tuple" | |
| B195 | 1856 | reprice-or-swap-token-x | asserts! | ERR_BAD_SPREAD | yes | fail: peg-more R "spread 10000 -> u1026"; pass: R | |
| B196 | 1857 | reprice-or-swap-token-x | asserts! | ERR_NOTHING_TO_WITHDRAW | yes | fail: regr "reprice no deposit -> NOTHING_TO_WITHDRAW", vault V5 "reprice on a parked order -> market u1005"; pass: regr | |
| B197 | 1858 | reprice-or-swap-token-x | asserts! | ERR_WRONG_TRAIT tx | partial | pass: regr | fail never |
| B198 | 1859 | reprice-or-swap-token-x | asserts! | ERR_WRONG_TRAIT ty | partial | pass: regr | fail never |
| B199 | 1864 | reprice-or-swap-token-x | try! | log-set-limit-x | skip | | |
| B200 | 1867 | reprice-or-swap-token-x | try! | log-peg-x-if | skip | | |
| B201 | 1868 | reprice-or-swap-token-x | if | y present and would take -> cross | yes | true: regr "crossing reprice converts FOK" (+2002 sats to the y maker), rem S7b, peg-more R zero-spread; false (y present, not taking): regr "plain reprice zero tuple"; false (y empty): peg-more R "plain reprice (no y side)" | |
| B202 | 1870 | reprice-or-swap-token-x | try! | fresh-classification-price | skip | | |
| B203 | 1877 | reprice-or-swap-token-x | try! | `(and (> rebate u0) ft transfer)` | skip | rebate > 0: regr cross (2000 sats -> 4) | |
| B204 | 1883 | reprice-or-swap-token-x | try! | settle-with-refresh | skip | error produced: regr "oversize crossing reprice -> PARTIAL_FILL" (from cross-remainder) | |
| B205 | 1885 | reprice-or-swap-token-x | try! | cross-remainder-as-x | skip | | |
| B206 | 1911 | filter-small-token-y-depositor | if | under MIN_SHARE_BPS of the side | yes | true: peg-batch Z12 "Y3 rolled by the small-share filter, size intact"; false: Z9/Z10 Y1, Y2 cleared | |
| B207 | 1912 | filter-small-token-y-depositor | if | crossing taker itself -> flag | yes | true: bounty B2 "1.5 STX swap vs 1000 STX in-range side -> u1020", peg-edges U2; false: peg-batch Z12 (Y3 is not the sender) | |
| B208 | 1922 | filter-small-token-y-depositor | unwrap-panic | append next cycle | yes | peg-batch Z12 | |
| B209 | 1940 | filter-small-token-y-depositor | try! | log-small-share-roll-y | skip | print asserted: peg-batch Z6 | |
| B210 | 1960 | filter-small-token-x-depositor | if | under MIN_SHARE_BPS of the side | yes | true: small-x X8 "XT rolled by the small-share filter, size intact"; false: X7 XB filled | |
| B211 | 1961 | filter-small-token-x-depositor | if | crossing taker itself -> flag | partial | false: small-x X8 (XT is a maker, rolled) | true never: no x-taker (swap deposit-x true / reprice-or-swap-x) under 0.2% of the in-range x side -> u1020 only ever raised on the y side |
| B212 | 1971 | filter-small-token-x-depositor | unwrap-panic | append next cycle | yes | small-x X8 | |
| B213 | 1989 | filter-small-token-x-depositor | try! | log-small-share-roll-x | skip | print asserted: small-x X4 | |
| B214 | 2010 | filter-limit-violating-token-y-depositor | if | `(> clearing limit)` roll | yes | true: bounty B1 "W limit-rolled intact in u1", rungs-fill F2 "sell rung's bid rolled with its own limit" (print); false: in-range bids cleared (bounty B4b F) | |
| B215 | 2019 | filter-limit-violating-token-y-depositor | unwrap-panic | append next cycle | yes | bounty B1 | |
| B216 | 2035 | filter-limit-violating-token-y-depositor | try! | log-limit-roll-y | skip | print asserted: rungs-fill F2 | |
| B217 | 2055 | filter-limit-violating-token-x-depositor | if | `(< clearing limit)` roll | yes | true: peg P6 "out-of-band peg rolled with the sentinel (MAX_UINT)", "in-band peg remainder rolled with the pegged price"; false: rem S1 X1 cleared | |
| B218 | 2064 | filter-limit-violating-token-x-depositor | unwrap-panic | append next cycle | yes | peg P6 | |
| B219 | 2080 | filter-limit-violating-token-x-depositor | try! | log-limit-roll-x | skip | print asserted: peg P6 | |
| B220 | 2098 | settle-with-refresh | asserts! | ERR_WRONG_TRAIT tx | yes | fail: gaps G3 "settle-with-refresh wrong trait -> u1013" (wstx passed as tx-trait); pass: any swap | |
| B221 | 2099 | settle-with-refresh | asserts! | ERR_WRONG_TRAIT ty | partial | pass: any swap | fail never (a wrong ty-trait with a right tx-trait) |
| B222 | 2101 | settle-with-refresh | try! | lazer-feeds | skip | | |
| B223 | 2106 | settle-with-refresh | try! | execute-settlement | skip | | |
| B224 | 2117 | settle-with-refresh | try! | fold distribute-y | skip | | |
| B225 | 2123 | settle-with-refresh | try! | fold distribute-x | skip | | |
| B226 | 2129 | settle-with-refresh | try! | roll-and-sweep-dust | skip | | |
| B227 | 2156 | swap | asserts! | ERR_DEPOSIT_TOO_SMALL `(> net u0)` | yes | fail: gaps G6 "swap of u0 -> u1001"; pass: any swap | |
| B228 | 2157 | swap | asserts! | ERR_HAS_RESTING_POSITION (live) | yes | fail: gaps G4 "swap on the resting side -> u1018" (x); pass: any swap | y-side live fail not separately tested (bounty P3 / PX Q1 are the parked assert B230) |
| B229 | 2159 | swap | if | `deposit-x` (live check) | yes | true: gaps G4; false: bounty "P P3 swaps STX while parked on y -> u1018" (passes the live check, fails B230) | |
| B230 | 2167 | swap | asserts! | ERR_HAS_RESTING_POSITION (parked) | yes | fail: bounty "P P3 swaps STX while parked on y -> u1018", "PX Q1 swaps sBTC while parked on x -> u1018"; pass: any swap | |
| B231 | 2169 | swap | if | `deposit-x` (parked check) | yes | true: bounty PX Q1; false: bounty P P3 | |
| B232 | 2177 | swap | if | `deposit-x` (rebate + core) | yes | true: rem S4 (x-taker); false: rem S1 (y-taker) | |
| B233 | 2181 | swap | try! | `(and (> rebate u0) ft transfer)` x rebate | skip | rebate > 0 in every x swap (>= 1000 sats) | rebate = 0 (amount < 500) then dies u1001 in the core: untested, trivial |
| B234 | 2186 | swap | try! | deposit-token-x-core | skip | | |
| B235 | 2189 | swap | try! | `(and (> rebate u0) stx-transfer)` y rebate | skip | | |
| B236 | 2191 | swap | try! | deposit-token-y-core | skip | error produced: gaps G2 "swap while paused -> u1007" | |
| B237 | 2195 | swap | try! | settle-with-refresh | skip | error produced: bounty B2 u1020, rem S2 u1017 | |
| B238 | 2196 | swap | if | `deposit-x` (cross remainder) | yes | true: rem S4 "x-walker zero residual"; false: rem S1 | |
| B239 | 2198 | swap | try! | cross-remainder-as-x | skip | | |
| B240 | 2203 | swap | try! | cross-remainder-as-y | skip | | |
| B241 | 2227 | execute-fill | if | `(> x-amt x-from-y)` maker bigger than the taker can buy | yes | true: rem S1 "M2 crossed payout at own limit" (M2 3000 sats, 1200 walked), rem S5 (x-taker: Y1 absorbs its ~177 sats, the taker had 1500); false: multifill "maker k fully consumed" (8 makers of 1100 each emptied), rem S5 second bid takes the rest | |
| B242 | 2234 | execute-fill | if | `y-is-taker` (reb-y) | yes | true: rem S1 (y-taker walk, M2 paid REB2); false: rem S4 (x-taker walk) | |
| B243 | 2239 | execute-fill | if | `(> r pending-rey)` rebate cap | partial | false: rem S1 (M2_STX_GAIN uses the raw 20 bps) | true proven unreachable off-chain: gaps G5 "rebate cap branch unreachable (gross<=20000, all mid splits)" (pending >= r always). Flagged, not a gap to fund |
| B244 | 2246 | execute-fill | if | `y-is-taker` (reb-x) | yes | true: rem S1; false: rem S4/S5 (Y1_GAIN includes REB6a) | |
| B245 | 2252 | execute-fill | if | `(> r pending-rex)` rebate cap | partial | false: rem S5 ("both below the pot"), S7b | true proven unreachable (gaps G5, symmetric arithmetic) |
| B246 | 2261 | execute-fill | if | y-refund: maker's y remainder under min | yes | true: rem S5 "Y1 crumbs (< 1 STX) refunded: u0 (v6)"; false: rem S4 (Y1 keeps 1.14 STX >= min, rolled) | |
| B247 | 2269 | execute-fill | if | x-refund: maker's x remainder under min | yes | true: rem S3 "M2 left under the minimum (~400 < 1000) is refunded: u0 (v6)"; false: rem S1 (M2_LEFT >= min) | |
| B248 | 2278 | execute-fill | if | nothing tradeable -> `(ok false)` | yes | true: bounty B4 "M (+2%, list-first) untouched", "A (+5%) untouched" (both inside the +5.5% limit and above min, walked after B with a residual worth < 1 sat: x-from-y = 0); false: every fill | |
| B249 | 2283 | execute-fill | try! | as-contract? y leg | skip | | |
| B250 | 2284 | execute-fill | try! | stx-transfer to x-who | skip | | |
| B251 | 2285 | execute-fill | if | `(> y-fee u0)` | partial | true: every fill (rem S1 Y2_FEE) | false unreachable at any plausible price: y-fee is 0 only for y-traded < 1000 uSTX, but one sat is worth MID/1e10 uSTX (~5000 today), so every fill of >= 1 sat pays a fee; would need 1 STX > 1000 sats... i.e. 1 sat < 1000 uSTX |
| B252 | 2286 | execute-fill | try! | y fee to treasury | skip | | |
| B253 | 2289 | execute-fill | try! | as-contract? x leg | skip | | |
| B254 | 2290 | execute-fill | try! | ft transfer to y-who | skip | | |
| B255 | 2293 | execute-fill | if | `(> x-fee u0)` | yes | true: rem S1 (X2_FEE on 1200 sats), multifill; false: rem S5 Y1 leg (X6a ~177..400 sats -> fee 0, Y1_GAIN = X6a - 0 + REB6a checked exactly), rem S4 (600 sats) | |
| B256 | 2294 | execute-fill | try! | x fee to treasury | skip | | |
| B257 | 2301 | execute-fill | if | `y-is-taker` (walk-taker-received) | yes | true: rem S1 tuple token-x-received = mid + walk; false: rem S7b / S5 (token-y-received) | |
| B258 | 2306 | execute-fill | if | y row emptied or refunded -> delete | yes | true: rem S5 Y1 (crumbs refunded, "Y1 crumbs refunded: u0"); false: rem S4 (Y1 keeps 1.14 STX), rem S1 (taker's y-left rolled) | y-left = 0 exactly not separately proven (a peg-walk O3 bid "empty to the dust" is the refund case) |
| B259 | 2325 | execute-fill | if | x row emptied or refunded -> delete | yes | true: multifill "maker k fully consumed" (x-left 0), peg-batch L8 "X1 order deleted by the fill", rem S3 (refund); false: rem S1 "M2 remaining" | |
| B260 | 2344 | execute-fill | if | `(> y-refund u0)` pay it | yes | true: rem S5 Y1; false: rem S1 | |
| B261 | 2346 | execute-fill | try! | as-contract? y refund | skip | | |
| B262 | 2347 | execute-fill | try! | stx-transfer y refund | skip | | |
| B263 | 2349 | execute-fill | try! | log-refund-y | skip | | |
| B264 | 2355 | execute-fill | if | `(> x-refund u0)` pay it | yes | true: rem S3 (M2 dust refunded: u0 left); false: rem S1 | |
| B265 | 2357 | execute-fill | try! | as-contract? x refund | skip | | |
| B266 | 2358 | execute-fill | try! | ft transfer x refund | skip | | |
| B267 | 2360 | execute-fill | try! | log-refund-x | skip | | |
| B268 | 2372 | execute-fill | try! | log-match | skip | print asserted: peg P5/P7, peg-walk O1/O3, peg-batch N11 | |
| B269 | 2373 | execute-fill | if | `y-is-taker` (taker in log-match) | yes | true: peg P5 match log (y-taker); false: peg P7 match log (x-taker) | |
| B270 | 2377 | execute-fill | if | `y-is-taker` (maker in log-match) | yes | same steps as B269 | |
| B271 | 2403 | walk-x-book-step | match | `acc` ok / err | partial | ok: every y-taker walk (rem S1) | err arm (an earlier step failed inside the fold, later steps pass the error through) never: no fill fails mid-walk in any harness; defensive |
| B272 | 2411 | walk-x-book-step | if | skip maker (rem 0 / self / dust / sentinel / in range / beyond limit) | yes | true: rem S3b "dust maker untouched" (m-amt < min), rem S2b "beyond-limit -> u1017" (l > limit), peg P5 "out-of-band rung untouched" (sentinel); false: every fill | `(is-eq maker takr)` sub-clause never true in any harness (no principal rests on x while taking as y) |
| B273 | 2421 | walk-x-book-step | try! | execute-fill | skip | | |
| B274 | 2445 | walk-y-book-step | match | `acc` ok / err | partial | ok: every x-taker walk (rem S4) | err arm never; defensive |
| B275 | 2453 | walk-y-book-step | if | skip maker | yes | true: peg-walk O3 "N4 (-50 peg) untouched", "N5 (-100 fixed) untouched" (l < limit), peg P7 out-of-band sell rung (sentinel u0); false: every x-taker fill | `(is-eq maker takr)` sub-clause never true |
| B276 | 2463 | walk-y-book-step | try! | execute-fill | skip | | |
| B277 | 2484 | push-quote | unwrap-panic | append quote u50 | yes | every sort (bounty B4) | |
| B278 | 2511 | insert-ask-step | if | not placed and better -> insert before | yes | true: bounty B4 "B (+1%, best) filled" (B arrives after M +2%, A +5%: placed before M); false: bounty B4 A (+5%) vs M (+2%): appended | |
| B279 | 2537 | insert-bid-step | if | not placed and better -> insert before | yes | true: bounty B4b "D (-1%, best) filled" (D after C -5%); false: peg-walk O3 (N2 -20 vs N1 -10 appended, N3 -15 placed before N2) | |
| B280 | 2562 | collect-ask-step | if | skip (dust / sentinel / in range / beyond limit) | yes | true: peg-walk O1 "M4 (+50 peg) untouched", "M5 (+100 fixed) untouched" (beyond +35), peg-edges G5 (sentinel); false: collected makers | |
| B281 | 2577 | collect-ask-step | if | `(get placed r)` | yes | true: bounty B4 (B placed); false: first / appended entries | |
| B282 | 2606 | collect-bid-step | if | skip | yes | true: peg-walk O3 (-50, -100 beyond -35); false: collected | |
| B283 | 2621 | collect-bid-step | if | `(get placed r)` | yes | true: peg-walk O3 N3; false: N1 first | |
| B284 | 2719 | cross-remainder-as-y | try! | fold walk-x-book-step | skip | | |
| B285 | 2738 | cross-remainder-as-y | try! | `(and (> left u0) as-contract?)` crumbs back | skip | left > 0: rem S1 "rebate-refunded = crumbs" | |
| B286 | 2739 | cross-remainder-as-y | try! | stx-transfer crumbs | skip | | |
| B287 | 2743 | cross-remainder-as-y | asserts! | ERR_PARTIAL_FILL | yes | fail: rem S2 "walk runs, partial -> u1017", S2b, S8, gaps G4, peg-walk O2 "1 under the best ask -> u1017"; pass: rem S1 | |
| B288 | 2747 | cross-remainder-as-y | try! | `(and (> rem u0) ...)` sub-min residual refund | skip | rem > 0: rem S3b "token-y-rolled = refunded residual (0 < r < MIN)"; rem = 0: not distinguished (peg-batch L9 says "nothing resting" only) | |
| B289 | 2748 | cross-remainder-as-y | try! | stx-transfer residual | skip | | |
| B290 | 2786 | cross-remainder-as-x | try! | fold walk-y-book-step | skip | | |
| B291 | 2805 | cross-remainder-as-x | try! | `(and (> left u0) ...)` crumbs back | skip | | |
| B292 | 2806 | cross-remainder-as-x | try! | ft transfer crumbs | skip | | |
| B293 | 2810 | cross-remainder-as-x | asserts! | ERR_PARTIAL_FILL | yes | fail: rem S5b "cross-only oversize -> u1017", peg-walk O3 "1 over the best bid -> u1017", peg-batch N9; pass: rem S4 | |
| B294 | 2814 | cross-remainder-as-x | try! | `(and (> rem u0) ...)` sub-min residual refund | skip | rem = 0: rem S4 "x-walker zero residual" (u0 asserted, so the and is false); rem > 0: not separately asserted on x (S7b residual 0 too) | |
| B295 | 2815 | cross-remainder-as-x | try! | ft transfer residual | skip | | |
| B296 | 2871 | execute-settlement | asserts! | ERR_PAUSED | yes | fail: gaps G2 "settle-with-refresh while paused -> u1007"; pass: any settle | |
| B297 | 2872 | execute-settlement | asserts! | ERR_NOTHING_TO_SETTLE (raw totals under min) | yes | fail: gaps G6 "settle-with-refresh on the empty book -> u1009 (raw totals under min)", lazer L7; pass: any settle | |
| B298 | 2879 | execute-settlement | asserts! | ERR_ALREADY_SETTLED | n/a | known unreachable (advance-cycle runs in the same tx) | excluded |
| B299 | 2880 | execute-settlement | asserts! | ERR_ZERO_PRICE x | n/a | known unreachable | excluded |
| B300 | 2881 | execute-settlement | asserts! | ERR_ZERO_PRICE y | n/a | known unreachable | excluded |
| B301 | 2882 | execute-settlement | asserts! | ERR_STALE_PRICE x | n/a | known unreachable | excluded |
| B302 | 2883 | execute-settlement | asserts! | ERR_STALE_PRICE y | n/a | known unreachable | excluded |
| B303 | 2884 | execute-settlement | asserts! | ERR_PRICE_UNCERTAIN conf x >= price/50 | partial | pass: any settle | fail never: needs a signed update whose BTC confidence is >= 2% of the price; not producible from Lazer (the u1004 that is tested, lazer L4, is the missing-confidence unwrap B52) |
| B304 | 2887 | execute-settlement | asserts! | ERR_PRICE_UNCERTAIN conf y | partial | pass: any settle | fail never (same) |
| B305 | 2890 | execute-settlement | asserts! | ERR_EXPO_MISMATCH | n/a | known unreachable | excluded |
| B306 | 2892 | execute-settlement | asserts! | ERR_ZERO_PRICE oracle-price | n/a | known unreachable (u1006) | excluded |
| B307 | 2904 | execute-settlement | asserts! | ERR_TAKER_TOO_SMALL | yes | fail: bounty B2 "-> u1020" (escrow unchanged, flag unwound), peg-edges U2; pass: any settle | |
| B308 | 2911 | execute-settlement | if | `token-x-is-binding` (y clearing) | yes | true: peg-batch Z "T1 sells 3000 sats net (x binding)" (Z9/Z10 pro-rata), rem S1; false: peg-batch E3 "(y binding)", small-x X7, bounty B4b | |
| B309 | 2915 | execute-settlement | if | `token-x-is-binding` (x clearing) | yes | same steps (E8 "settlement u3 x-cleared", E17 "settlement u4 y-cleared") | |
| B310 | 2925 | execute-settlement | if | `(> total-token-x u0)` ride-x | yes | true: rem S4 (x-taker, ride into the 20 STX bid); false: rem S6 "y-taker cross-only" (x side all limit-rolled or dust: total-x 0, "settlement cleared nothing" pattern), peg-batch N11 (N17 "cleared nothing at mid") | |
| B311 | 2929 | execute-settlement | if | `(> total-token-y u0)` ride-y | yes | true: rem S1 (RIDE_Y in X1_STX_GAIN); false: rem S5 "cross-only sized" (every bid limit-rolled: total-y 0) | |
| B312 | 2934 | execute-settlement | asserts! | ERR_NOTHING_TO_SETTLE post-filter (unless crossing) | yes | fail: gaps G2 "unpaused settle-with-refresh: past the pause gate, x empty at mid -> u1009", bounty B3, rem S8, peg-batch N7; pass (crossing arm): rem S5/S6 cross-only; pass (both sides in range): rem S1 | |
| B313 | 2952 | execute-settlement | if | `(> token-y-fee u0)` | yes | true: rem S1 (YFEE_MID in X1's payout); false: rem S5 / peg-batch N11 (y-clearing 0 -> fee 0) | |
| B314 | 2953 | execute-settlement | try! | as-contract? y fee | skip | | |
| B315 | 2954 | execute-settlement | try! | stx-transfer y fee | skip | | |
| B316 | 2958 | execute-settlement | if | `(> token-x-fee u0)` | yes | true: rem S1 (X1 2000 sats cleared, fee 2 in TAKER_SBTC_GAIN); false: rem S5 (x-clearing 0) | |
| B317 | 2959 | execute-settlement | try! | as-contract? x fee | skip | | |
| B318 | 2960 | execute-settlement | try! | ft transfer x fee | skip | | |
| B319 | 2978 | execute-settlement | try! | log-settlement | skip | | |
| B320 | 2998 | distribute-to-token-y-depositor | try! | `acc` | skip | err arm defensive (no earlier depositor fails) | |
| B321 | 3003 | distribute-to-token-y-depositor | if | `(> total-token-y u0)` (x received) | partial | true: rem S1, peg-batch Z11 | false unreachable in practice: total-y = 0 only when every y row was rolled out of the list, and the fold then has no element (defensive) |
| B322 | 3007 | distribute-to-token-y-depositor | if | `(> total-token-y u0)` (unfilled) | partial | true: peg-batch Z9 | false: same as B321 (defensive) |
| B323 | 3014 | distribute-to-token-y-depositor | if | pro-rata unfilled under min and not the crossing taker -> refund | partial | false: peg-batch Z9 (Y1 keeps 7.9 STX), rem S7a (the taker's own rolled bid is walked, not refunded: third clause) | true never on y: no non-taker y maker ends a batch with 0 < unfilled < 1 STX (the x mirror B338 is covered by peg-mirror R5) |
| B324 | 3032 | distribute-to-token-y-depositor | if | depositor is the caller | yes | true: rem S1 tuple "token-x-received = mid + walk" (caller fields set); false: peg-batch Z Y1/Y2 (T1 is the caller, on x) | |
| B325 | 3040 | distribute-to-token-y-depositor | if | `(> my-token-x-received u0)` pay | partial | true: rem S1, peg-batch Z11 | false unreachable by construction: a listed y maker holds >= 0.2% of the side (small-share filter) and x-after-fee >= ~1000 sats (min x deposit), so the pro-rata payout is >= 2 sats |
| B326 | 3041 | distribute-to-token-y-depositor | try! | as-contract? | skip | | |
| B327 | 3043 | distribute-to-token-y-depositor | try! | ft transfer | skip | | |
| B328 | 3049 | distribute-to-token-y-depositor | if | `(> my-roll u0)` roll to next cycle | yes | true: peg-batch Z9 "Y1 left (pro-rata unfilled)", regr cycle 0 (~89 STX rolled); false: bounty B4b "fish cleared at mid" (u0), rem S7b "mid bid cleared" | |
| B329 | 3058 | distribute-to-token-y-depositor | unwrap-panic | append next cycle | yes | peg-batch Z9 | |
| B330 | 3064 | distribute-to-token-y-depositor | if | `(> my-refund u0)` | partial | false: bounty B4b F (cleared, nothing to refund) | true never on y (see B323) |
| B331 | 3066 | distribute-to-token-y-depositor | try! | as-contract? refund | skip | block unreached on y | |
| B332 | 3067 | distribute-to-token-y-depositor | try! | stx-transfer refund | skip | block unreached on y | |
| B333 | 3069 | distribute-to-token-y-depositor | try! | log-refund-y | skip | block unreached on y | |
| B334 | 3077 | distribute-to-token-y-depositor | try! | log-distribute-y-depositor | skip | | |
| B335 | 3094 | distribute-to-token-x-depositor | try! | `acc` | skip | defensive | |
| B336 | 3099 | distribute-to-token-x-depositor | if | `(> total-token-x u0)` (y received) | partial | true: rem S4 | false defensive (as B321) |
| B337 | 3103 | distribute-to-token-x-depositor | if | `(> total-token-x u0)` (unfilled) | partial | true: rem S7b (rem7 rolled) | false defensive |
| B338 | 3110 | distribute-to-token-x-depositor | if | pro-rata unfilled under min and not the crossing taker -> refund | yes | true: peg-mirror R5 "A's ask left ... under the minimum: refunded in the batch (v6)" + "refund-x logged"; false: small-x X7 (XB keeps >= min), rem S7b (the taker's own rolled ask walks) | |
| B339 | 3128 | distribute-to-token-x-depositor | if | depositor is the caller | yes | true: rem S4 / peg-batch Z15 (T1 caller); false: small-x XB (TY is the caller) | |
| B340 | 3136 | distribute-to-token-x-depositor | if | `(> my-token-y-received u0)` pay | partial | true: rem S4, small-x XB | false unreachable by construction: >= 0.2% share of >= 1 STX cleared pays >= 2000 uSTX |
| B341 | 3137 | distribute-to-token-x-depositor | try! | as-contract? | skip | | |
| B342 | 3138 | distribute-to-token-x-depositor | try! | stx-transfer | skip | | |
| B343 | 3142 | distribute-to-token-x-depositor | if | `(> my-roll u0)` roll to next cycle | yes | true: rem S7b (rem7 - XC7 rolled then walked), small-x X7 (XB_LEFT); false: peg-batch Z15 "T1 nothing left", E13 "X4 fully cleared" | |
| B344 | 3151 | distribute-to-token-x-depositor | unwrap-panic | append next cycle | yes | small-x X7 | |
| B345 | 3157 | distribute-to-token-x-depositor | if | `(> my-refund u0)` | yes | true: peg-mirror R5; false: peg-batch Z15 (cleared, no refund) | |
| B346 | 3159 | distribute-to-token-x-depositor | try! | as-contract? refund | skip | | |
| B347 | 3161 | distribute-to-token-x-depositor | try! | ft transfer refund | skip | | |
| B348 | 3165 | distribute-to-token-x-depositor | try! | log-refund-x | skip | print asserted: peg-mirror R5 | |
| B349 | 3173 | distribute-to-token-x-depositor | try! | log-distribute-x-depositor | skip | | |
| B350 | 3207 | roll-and-sweep-dust | if | `(> token-y-dust u0)` sweep | partial | false: regr cycle 0 / lazer L6 (one maker per side: pro-rata is exact, dust 0) | true not asserted anywhere: multi-maker batches (peg-batch Z, multifill) almost surely leave rounding dust, but no harness reads the treasury delta from dust (stress I5 mixes fees in) |
| B351 | 3208 | roll-and-sweep-dust | try! | as-contract? y dust | skip | | |
| B352 | 3209 | roll-and-sweep-dust | try! | stx-transfer y dust | skip | | |
| B353 | 3213 | roll-and-sweep-dust | if | `(> token-x-dust u0)` sweep | partial | false: regr cycle 0 | true not asserted (as B350) |
| B354 | 3214 | roll-and-sweep-dust | try! | as-contract? x dust | skip | | |
| B355 | 3215 | roll-and-sweep-dust | try! | ft transfer x dust | skip | | |
| B356 | 3221 | roll-and-sweep-dust | try! | log-sweep-dust | skip | | |
| B357 | 3240 | initialize | asserts! | ERR_NOT_AUTHORIZED (operator) | partial | pass: every harness initialize | fail never: no market initialize by a non-operator (rungs-keyless "initialize by non-deployer -> u7001" is the rung) |
| B358 | 3241 | initialize | asserts! | ERR_NOT_AUTHORIZED (core owner) | partial | pass: every initialize | fail never: needs operator != core owner at initialize (e.g. after gaps G1's handover to OP2, an OP2 initialize of a fresh instance) |
| B359 | 3244 | initialize | asserts! | ERR_ALREADY_INITIALIZED | yes | fail: gaps G6 "initialize twice -> u1012"; pass: any | |
| B360 | 3245 | initialize | asserts! | ERR_ZERO_MIN_DEPOSIT | yes | fail: rem S9 "initialize min-x u0 -> u1019", "min-y u0 -> u1019"; pass: any | |
| B361 | 3253 | initialize | try! | core register | skip | | |
| B362 | 3260 | set-treasury | asserts! | ERR_NOT_AUTHORIZED | yes | fail: gaps G1 "outsider set-treasury -> u1008"; pass: G1 "operator set-treasury" | |
| B363 | 3267 | set-paused | asserts! | ERR_NOT_AUTHORIZED | yes | fail: gaps G1 outsider / "old operator set-paused -> u1008"; pass: G2 "OP2 pauses" | |
| B364 | 3274 | set-operator | asserts! | ERR_NOT_AUTHORIZED | yes | fail: gaps G1 outsider / old operator; pass: G1 handover + hand back | |
| B365 | 3281 | set-min-token-y-deposit | asserts! | ERR_NOT_AUTHORIZED | partial | pass: rem S9 (operator, dies on zero), rungs-keyless sell "operator set-min to 5000" | fail never (no stranger set-min) |
| B366 | 3282 | set-min-token-y-deposit | asserts! | ERR_ZERO_MIN_DEPOSIT | yes | fail: rem S9 "set-min-token-y-deposit u0 -> u1019"; pass: rungs-keyless RUNG=sell "operator set-min to 5000" | |
| B367 | 3289 | set-min-token-x-deposit | asserts! | ERR_NOT_AUTHORIZED | partial | pass: rem S9, rungs-keyless buy | fail never |
| B368 | 3290 | set-min-token-x-deposit | asserts! | ERR_ZERO_MIN_DEPOSIT | yes | fail: rem S9; pass: rungs-keyless RUNG=buy "operator set-min to 5000" | |
| B369 | 3297 | set-distance-slots | asserts! | ERR_NOT_AUTHORIZED | yes | fail: bounty D6 "stranger cannot set distance-slots" (err); pass: D4 | |
| B370 | 3298 | set-distance-slots | asserts! | ERR_QUEUE_FULL `(<= slots MAX)` | yes | fail: bounty D6 "over MAX_DEPOSITORS -> u1010"; pass: D4/D5b/D6, vault V4 (u50) | |
| B371 | 3322 | cap-bid-fold | if | in-range bid | no | none: every `get-taker-capacity` call (peg-more C, peg-edges G5) runs with an empty y side, the bid fold never iterates | |
| B372 | 3324 | cap-bid-fold | if | walkable bid | no | none (as B371) | |
| B373 | 3350 | cap-ask-fold | if | in-range ask | partial | false: peg-more C (rungs at +20 bps, "mid-cap u0") | true never: no in-range ask resting when capacity is read |
| B374 | 3352 | cap-ask-fold | if | walkable ask (not sentinel, within limit, >= min) | yes | true: peg-more C "walk-cap > 0"; false: peg-more C "limit under the pegged ask: nothing", peg-edges G5 (sentinel skipped: walk-cap at MAX_UINT == at HUGE) | |
| B375 | 3369 | gross-up | if | rounding correction | partial | executed on every capacity read (peg-more C) but `gross-cap` is never asserted, so which arm ran is unknown | |
| B376 | 3386 | get-taker-capacity | if | `deposit-x` (bid limit) | partial | false: peg-more C, peg-edges G5 (`false` passed) | true never: no capacity read for an x-taker |
| B377 | 3396 | get-taker-capacity | if | `deposit-x` (ask limit) | partial | false only | |
| B378 | 3403 | get-taker-capacity | if | `deposit-x` (opposite) | partial | false only | |
| B379 | 3407 | get-taker-capacity | if | `deposit-x` (own) | partial | false only | |
| B380 | 3411 | get-taker-capacity | if | `deposit-x` (taker-in-range) | partial | false only | |
| B381 | 3415 | get-taker-capacity | if | in range and opposite > own -> mid-cap | partial | false: peg-more C "mid-cap u0" | true never (no in-range liquidity when read) |
| B382 | 3419 | get-taker-capacity | if | `deposit-x` (walk-cap) | partial | false only | |
| B383 | 3438 | prune-one | try! | `acc` | skip | err arm: peg-batch Q2 lists [u1, u5] with u5 last, so no element follows the error; defensive | |
| B384 | 3439 | prune-one | asserts! | ERR_CYCLE_OPEN | yes | fail: peg-batch Q2 "prune the open cycle u5 -> u1027, atomic", Q4 (future / open alone); pass: Q1 "prune u0..u4 by anyone -> (ok u5)", Q5 | |

## 2. Uncovered and partial branches, ranked, with a proposed harness step each

Rank = how much money the branch moves: settlement and fill math first, then park / priority, then guards, setters and views. Rows that are proven or structurally unreachable are listed at the end of their tier and need no step (they stay `partial` in the totals so the number is honest).

### Tier 1: settlement and fill math

**deposit-token-y-core / deposit-token-x-core, the `side-full` block (B70, B71, B74, B15 / B93, B94, B97, B16; and the `(ok false)` arm of park-tenth B31 / B42).** The only code path that parks a resident from inside the core and re-links the depositor list around it. Never run.

- Step (y, PARK instance MAX u3, x empty so no cross): P1 bids 2 STX at HUGE, P2 3 STX at HUGE, P3 4 STX at HUGE (all in range; a price is read because the side is full, use the real update). N1 bids 1.5 STX at HUGE -> `(err u1010)` (B71 fail: not bigger than the smallest, B31 true, B15 both arms). N1 bids 2.5 STX at HUGE -> `(ok u2500000)`, `get-token-y-parked P1` = 2 STX, P1 off the cycle, list still 3, totals 9.5 STX, park-y print carries P1 (B70 true, B71 pass, B74).
- Step (x mirror, y empty): Q1/Q2/Q3 asks 2000/3000/4000 at limit 1; N4 1500 at 1 -> u1010; N4 2500 at 1 -> ok, Q1 parked (B93, B94, B97, B16, B42).
- Step (swap into a full side): same y book plus one in-range ask 5000 sats from A on x; fresh taker T swaps 1.5 STX (deposit-x false) -> u1010 (the core refuses the taker as the smallest); T swaps 5 STX -> ok, P1 parked before the batch, settlement clears at mid. Checks: P1 parked 2 STX, cycle advanced, T residual refunded. This is the only route where `deposit-token-y-core` runs the full path with `price` = u0 in the park print.

**distribute-to-token-y-depositor dust refund (B323 true, B330 true, B331..B333).** A y maker's pro-rata unfilled under 1 STX is refunded in the batch; covered on x (peg-mirror R5) only.

- Step: Y1 bids 1.2 STX at HUGE, Y2 bids 60 STX at HUGE; X sells sats so the batch is x binding and clears ~20% of the side (about 12 STX worth, ~2400 sats at today's mid). Expect Y1 unfilled = 1.2 * 0.8 = 0.96 STX < min -> Y1 STX balance +0.96 STX, `get-token-y-deposit next Y1` = u0, `refund-y` print with Y1, Y2 rolled 48 STX; token-y-rolled in the tuple excludes Y1's refund.

**filter-small-token-x-depositor taker-too-small (B211 true).** u1020 has only ever been raised for a y taker.

- Step: XB rests 600,000 sats in range (limit 1), S rests a 2000 STX bid at HUGE; T sells 1000 sats (deposit-x true, 0.17% of the x side) -> `(err u1020)`, escrow sBTC unchanged, `taker-too-small` false at rest.

**roll-and-sweep-dust true arms (B350, B353).** Rounding dust is swept to the treasury; never asserted.

- Step: reuse peg-batch Z (Y1 8 STX + Y2 600 STX vs a 3000-sat taker): capture the treasury STX and sBTC balances before Z6 and after; compute fees + dust in JS (dust_y = (608e6 - YC) - Y1_LEFT - Y2_LEFT, dust_x = after-fee - Y1_SATS - Y2_SATS) and assert the treasury deltas equal fee + dust with dust > 0 (choose YC so that 608e6 - YC is not divisible by 76).

Unreachable, no step: B243/B245 rebate cap (gaps G5, exhaustive), B251 y-fee = 0 (one sat > 1000 uSTX at any plausible price), B325/B340 zero pro-rata payout (0.2% share floor times the minimum deposit), B321/B322/B336/B337 (a zero total empties the list first), B303/B304 (needs a signed update with confidence >= 2% of price), B271/B274 err arms (no fill can fail after the first in a walk without failing the whole tx first).

### Tier 2: park / priority

**park-tenth-token-x, out-of-range newcomer with no price edge (B43 false, B47, B48) and demotion where the N-th best is bigger than the region's smallest (B46 true).** The y side has both (bounty D5, D5d, D7); x has neither.

- Step (PARK instance, y empty, distance-slots u1): Q1 asks 2000 at +10%, Q2 3000 at +5%, Q3 3000 in range (limit 1). Price region = {Q2}, size region = {Q1}. N4 asks 4000 at +10% (no edge against +5%, bigger than Q1) -> ok, Q1 parked 2000, N4 live (B43 false, B47 some, B48 true). N5 asks 3000 at +10% -> u1010 (B48 false: 3000 not > 3000, strict). N5 asks 2500 at +10% with the region empty of anyone smaller -> u1010 (B47 none).
- Step (B46 true): same instance, distance-slots u1, book Q2 3000 at +5% (top), Q1 2000 at +10% (outside), Q3 in range. N6 asks 1500 at +3% (beats +5%) -> Q2 demoted, 3000 > 2000 -> Q1 parked, Q2 stays, N6 live with 1500. Check `get-token-x-parked Q1` = 2000, Q2 still 3000, list 3.

**deposit-token-x readmit print on a parked maker's direct deposit (B111 true).** Covered on y (peg-park-y Y4).

- Step: after bounty PX "N4 in-range newcomer -> parks Q1", Q2 cancels (slot), Q1 deposits 500 sats at +10% -> `(ok u500)`, parked cleared, live 3500, `readmit-x` print with amount u3000.

**would-take-as-x / would-take-as-y, a live maker found before the last element (B62 true, B64 true).** Only the fold's early-exit; no funds move.

- Step: A asks 2000 at 1 and B asks 2000 at 1 (both in range, y empty). S bids 5 STX at HUGE -> u1016 (found at A, B visited on the found arm). Mirror: two bids at HUGE, then an ask at 1 -> u1016.

**refresh-seat-count clamp (B3 true).** The ladder has no upper cap on `set-max-band-per-side`.

- Step: owner `set-max-band-per-side u51` on the ladder (band counts allow it) -> `sync-seat-count` -> `(ok u50)`, `protected-seats` = u50; set it back.

**withdraw-token-y clamp (B131 true).** Dead-ish (u1024 follows), one line: `withdraw-token-y 200 STX` on a 100 STX position -> `(err u1024)`.

### Tier 3: guards and setters (error codes never raised on one side)

Each is one transaction with a known error, no money at risk; grouped so a single "codes" harness covers them:

- deposit-token-y limit u0 -> u1011 (B68); deposit-token-x limit u0 -> u1011 (B91); a swap with limit u0 on each side hits the same asserts through the core.
- deposit-token-y / deposit-token-x with `(some u10000)` -> u1026 (B82, B105).
- deposit-token-y with the sBTC trait / deposit-token-x with the wstx trait -> u1013 (B69, B92).
- while paused: deposit-token-x -> u1007 (B89), a deposit-x swap -> u1007, readmit-token-y / readmit-token-x -> u1007 (B153, B160).
- fresh deposit-token-x of 999 sats -> u1001 (B90).
- cancel-token-y-deposit / cancel-token-x-deposit with the wrong trait -> u1013 (B112, B121); by a principal with nothing live or parked -> u1005 (B113, B122).
- withdraw-token-y amount u0 -> u1005 (B134).
- readmit-token-x of a principal not parked -> u1022 (B161).
- set-token-y-limit: limit u0 -> u1011 (B166), spread u10000 -> u1026 (B167), by a principal with nothing -> u1005 (B168), to an in-range bid while a live ask rests -> u1016 (B171). set-token-x-limit by a principal with nothing -> u1005 (B176).
- reprice-or-swap-token-y: limit u0 -> u1011 (B182), no y deposit -> u1005 (B184), swapped traits -> u1013 (B185, B186). reprice-or-swap-token-x with swapped traits -> u1013 (B197, B198).
- settle-with-refresh with the right tx-trait and the wrong ty-trait -> u1013 (B221).
- initialize by an outsider on a fresh instance -> u1008 (B357); after `set-operator OP2`, OP2 initializes a fresh instance -> u1008 from the core-owner check (B358).
- set-min-token-y-deposit / set-min-token-x-deposit by a stranger -> u1008 (B365, B367).

### Tier 4: views

**get-taker-capacity for an x taker and with in-range liquidity (B371, B372, B373 true, B376..B382 true, B381 true, B375).**

- Step: book with an in-range bid (S 20 STX at HUGE), a walkable bid (N 5 STX at -20 bps), an in-range ask (A 2000 at 1) and a pegged ask (+20 bps). Read `(get-taker-capacity mid limit true)` with limit -30 bps: expect mid-cap = in-range bids in sats minus own in-range asks, walk-cap = N's sats at its price, net = sum, and assert `gross-cap` against a JS `gross-up` mirror for both rounding arms (pick two limits so one lands on each). Read `(... false)` with the same book for the y-taker mirror; `(... true)` with limit above the mid for mid-cap u0 (B381 false with in-range liquidity present).

## 3. Totals

Inventory rows: 384. Skipped as pure `try!` propagation: 131. Known unreachable (`n/a`, per the brief): 11 (B58, B59, B60, B61, B298, B299, B300, B301, B302, B305, B306). Assessed: 242.

| covered | count |
|---|---|
| yes (both arms / both sides of the assert proven) | 162 |
| partial (one arm only) | 70 |
| no (neither arm) | 10 |

Of the 70 partial, 13 have their missing arm proven or structurally unreachable and need no step: B243, B245 (gaps G5), B251, B325, B340 (price scale / share floor), B321, B322, B336, B337 (empty list), B303, B304 (unforgeable update), B271, B274 (defensive err arm). That leaves 57 partial + 10 uncovered = 67 rows a new step could close, split as tier 1: 13 (6 uncovered), tier 2: 11 (2 uncovered), tier 3: 32 one-line error-code checks, tier 4: 11 (2 uncovered) for the capacity view.

The 10 `no` rows: B15, B16, B71, B74, B94, B97 (the core `side-full` block, both sides), B47, B48 (x-side size fight), B371, B372 (bid capacity fold). Functions with the most open arms: get-taker-capacity 7 (plus cap-bid-fold 2, cap-ask-fold 1, gross-up 1), deposit-token-x-core 7, deposit-token-y-core 5, distribute-to-token-y-depositor 5 (2 fundable), park-tenth-token-x 5, set-token-y-limit 4, reprice-or-swap-token-y 4.
