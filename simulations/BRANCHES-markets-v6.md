# Branch inventory: contracts/markets-sbtc-stx-jing-v6.clar

384 decision points. Tag harness steps `[B<n>]`.

| B | line | function | kind | detail |
|---|---|---|---|---|
| B1 | 98 | with-seat | if | `(is-some (index-of? lst who))` |
| B2 | 100 | with-seat | unwrap-panic | `(unwrap-panic (as-max-len? (append lst who) u50))` |
| B3 | 107 | refresh-seat-count | if | `(> n MAX_DEPOSITORS)` |
| B4 | 136 | sync-seat | asserts! | `ERR_NOT_A_SEAT: (or x y)` |
| B5 | 344 | pegged-bid | if | `(<= pegged cap)` |
| B6 | 357 | pegged-ask | if | `(>= pegged floor)` |
| B7 | 369 | order-y-price | match | `spread-bps` |
| B8 | 380 | order-x-price | match | `spread-bps` |
| B9 | 403 | valid-spread | match | `spread-bps` |
| B10 | 413 | log-peg-y-if | match | `spread-bps` |
| B11 | 425 | log-peg-x-if | match | `spread-bps` |
| B12 | 445 | count-seated-fold | if | `(is-some (index-of? (get seated acc) who))` |
| B13 | 466 | side-full-y | if | `(is-some (index-of? seated who))` |
| B14 | 478 | side-full-x | if | `(is-some (index-of? seated who))` |
| B15 | 495 | find-smallest-token-y-fold | if | `(and (is-none (index-of? (get seated acc) depositor)) (< amount (get smallest ac` |
| B16 | 515 | find-smallest-token-x-fold | if | `(and (is-none (index-of? (get seated acc) depositor)) (< amount (get smallest ac` |
| B17 | 552 | top-y-insert | if | `(and (not (get placed acc)) (> (get l (get e acc)) (get l entry)))` |
| B18 | 578 | top-x-insert | if | `(and (not (get placed acc)) (< (get l (get e acc)) (get l entry)))` |
| B19 | 603 | top-y-fold | if | `(or (is-some (index-of? (get seated acc) maker)) (>= l (get price acc)))` |
| B20 | 614 | top-y-fold | if | `(get placed r)` |
| B21 | 622 | top-y-fold | unwrap-panic | `(merge acc { out: (unwrap-panic (slice? sorted u0 (if (> (len sorted) (get slots` |
| B22 | 643 | top-x-fold | if | `(or (is-some (index-of? (get seated acc) maker)) (<= l (get price acc)))` |
| B23 | 654 | top-x-fold | if | `(get placed r)` |
| B24 | 662 | top-x-fold | unwrap-panic | `(merge acc { out: (unwrap-panic (slice? sorted u0 (if (> (len sorted) (get slots` |
| B25 | 686 | smallest-outside-y-fold | if | `(or` |
| B26 | 693 | smallest-outside-y-fold | if | `(< amt (get smallest acc))` |
| B27 | 712 | first-off-y-fold | if | `(and (is-none (get found acc)) (is-none (index-of? (get seated acc) who)) (is-eq` |
| B28 | 726 | first-off-x-fold | if | `(and (is-none (get found acc)) (is-none (index-of? (get seated acc) who)) (is-eq` |
| B29 | 761 | park-tenth-token-y | unwrap-panic | `(edge (and (> n u0) (< (get l (unwrap-panic (element-at? top (- n u1)))) bid)))` |
| B30 | 763 | park-tenth-token-y | match | `off` |
| B31 | 765 | park-tenth-token-y | if | `(and (>= bid price) (is-eq n u0))` |
| B32 | 767 | park-tenth-token-y | if | `edge` |
| B33 | 768 | park-tenth-token-y | unwrap-panic | `(let ((last (unwrap-panic (element-at? top (- n u1)))))` |
| B34 | 769 | park-tenth-token-y | match | `(get found outside)` |
| B35 | 770 | park-tenth-token-y | if | `(> (get-token-y-deposit cycle (get who last)) (get smallest outside))` |
| B36 | 777 | park-tenth-token-y | match | `(get found outside)` |
| B37 | 778 | park-tenth-token-y | if | `(> size (get smallest outside))` |
| B38 | 801 | smallest-outside-x-fold | if | `(or` |
| B39 | 808 | smallest-outside-x-fold | if | `(< amt (get smallest acc))` |
| B40 | 858 | park-tenth-token-x | unwrap-panic | `(edge (and (> n u0) (> (get l (unwrap-panic (element-at? top (- n u1)))) ask)))` |
| B41 | 860 | park-tenth-token-x | match | `off` |
| B42 | 862 | park-tenth-token-x | if | `(and (<= ask price) (is-eq n u0))` |
| B43 | 864 | park-tenth-token-x | if | `edge` |
| B44 | 865 | park-tenth-token-x | unwrap-panic | `(let ((last (unwrap-panic (element-at? top (- n u1)))))` |
| B45 | 866 | park-tenth-token-x | match | `(get found outside)` |
| B46 | 867 | park-tenth-token-x | if | `(> (get-token-x-deposit cycle (get who last)) (get smallest outside))` |
| B47 | 874 | park-tenth-token-x | match | `(get found outside)` |
| B48 | 875 | park-tenth-token-x | if | `(> size (get smallest outside))` |
| B49 | 908 | park-token-y | try! | `(try! (contract-call? .jing-core-v5 log-park-y who amount cycle price` |
| B50 | 936 | park-token-x | try! | `(try! (contract-call? .jing-core-v5 log-park-x who amount cycle price` |
| B51 | 980 | pick-feed | if | `(is-eq (get feed-id f) (get id acc))` |
| B52 | 1007 | shape-feed | unwrap! | `ERR_PRICE_UNCERTAIN: (get confidence f)` |
| B53 | 1011 | shape-feed | unwrap! | `ERR_FEED_TIMESTAMP_MISSING: (get feed-update-timestamp f)` |
| B54 | 1020 | lazer-feeds | try! | `(decoded (try! (contract-call? LAZER_ORACLE verify-price-feeds update LAZER_DECO` |
| B55 | 1045 | lazer-feeds | try! | `feed-x: (try! (shape-feed fx publish-time)),` |
| B56 | 1046 | lazer-feeds | try! | `feed-y: (try! (shape-feed fy publish-time)),` |
| B57 | 1053 | fresh-classification-price | try! | `(feeds (try! (lazer-feeds update)))` |
| B58 | 1058 | fresh-classification-price | asserts! | `ERR_STALE_PRICE: (> (get publish-time feed-x) min-freshness)` |
| B59 | 1059 | fresh-classification-price | asserts! | `ERR_STALE_PRICE: (> (get publish-time feed-y) min-freshness)` |
| B60 | 1060 | fresh-classification-price | asserts! | `ERR_ZERO_PRICE: (> (get price feed-x) 0)` |
| B61 | 1061 | fresh-classification-price | asserts! | `ERR_ZERO_PRICE: (> (get price feed-y) 0)` |
| B62 | 1075 | live-bid-fold | if | `(get found acc)` |
| B63 | 1078 | live-bid-fold | if | `(and` |
| B64 | 1097 | live-offer-fold | if | `(get found acc)` |
| B65 | 1100 | live-offer-fold | if | `(and` |
| B66 | 1160 | deposit-token-y-core | asserts! | `ERR_PAUSED: (not (var-get paused))` |
| B67 | 1161 | deposit-token-y-core | asserts! | `(>= (+ existing carry amount) (var-get min-token-y-deposit))` |
| B68 | 1164 | deposit-token-y-core | asserts! | `ERR_LIMIT_REQUIRED: (> limit-price u0)` |
| B69 | 1165 | deposit-token-y-core | asserts! | `ERR_WRONG_TRAIT: (is-eq (contract-of t) tok-y)` |
| B70 | 1168 | deposit-token-y-core | if | `(and (is-eq existing u0) (side-full-y depositors tx-sender))` |
| B71 | 1179 | deposit-token-y-core | asserts! | `ERR_QUEUE_FULL: (> (+ carry amount) smallest-amount)` |
| B72 | 1183 | deposit-token-y-core | try! | `(try! (contract-call? .jing-core-v5 log-park-y smallest-who smallest-amount cycl` |
| B73 | 1186 | deposit-token-y-core | try! | `(try! (stx-transfer? amount tx-sender current-contract))` |
| B74 | 1189 | deposit-token-y-core | unwrap-panic | `(unwrap-panic (as-max-len?` |
| B75 | 1210 | deposit-token-y-core | try! | `(try! (contract-call? .jing-core-v5 log-deposit-y tx-sender (+ carry amount)` |
| B76 | 1217 | deposit-token-y-core | try! | `(try! (stx-transfer? amount tx-sender current-contract))` |
| B77 | 1231 | deposit-token-y-core | if | `(is-eq existing u0)` |
| B78 | 1233 | deposit-token-y-core | unwrap-panic | `(unwrap-panic (as-max-len? (append depositors tx-sender) u50))` |
| B79 | 1237 | deposit-token-y-core | try! | `(try! (contract-call? .jing-core-v5 log-deposit-y tx-sender` |
| B80 | 1261 | deposit-token-y | if | `(or` |
| B81 | 1265 | deposit-token-y | try! | `(try! (fresh-classification-price update))` |
| B82 | 1270 | deposit-token-y | asserts! | `ERR_BAD_SPREAD: (valid-spread spread-bps)` |
| B83 | 1271 | deposit-token-y | asserts! | `ERR_MUST_USE_SWAP: (not (would-take-as-y price bid))` |
| B84 | 1275 | deposit-token-y | asserts! | `ERR_QUEUE_FULL: (not (and new-maker full (is-eq bid u0)))` |
| B85 | 1279 | deposit-token-y | try! | `(try! (park-tenth-token-y cycle price bid (+ amount parked) depositors))` |
| B86 | 1281 | deposit-token-y | try! | `(let ((deposited (try! (deposit-token-y-core amount limit-price spread-bps parke` |
| B87 | 1282 | deposit-token-y | try! | `(try! (log-peg-y-if spread-bps limit-price))` |
| B88 | 1285 | deposit-token-y | try! | `(try! (contract-call? .jing-core-v5 log-readmit-y tx-sender parked cycle price` |
| B89 | 1309 | deposit-token-x-core | asserts! | `ERR_PAUSED: (not (var-get paused))` |
| B90 | 1310 | deposit-token-x-core | asserts! | `(>= (+ existing carry amount) (var-get min-token-x-deposit))` |
| B91 | 1313 | deposit-token-x-core | asserts! | `ERR_LIMIT_REQUIRED: (> limit-price u0)` |
| B92 | 1314 | deposit-token-x-core | asserts! | `ERR_WRONG_TRAIT: (is-eq (contract-of t) tok-x)` |
| B93 | 1316 | deposit-token-x-core | if | `(and (is-eq existing u0) (side-full-x depositors tx-sender))` |
| B94 | 1327 | deposit-token-x-core | asserts! | `ERR_QUEUE_FULL: (> (+ carry amount) smallest-amount)` |
| B95 | 1330 | deposit-token-x-core | try! | `(try! (contract-call? .jing-core-v5 log-park-x smallest-who smallest-amount cycl` |
| B96 | 1333 | deposit-token-x-core | try! | `(try! (contract-call? t transfer amount tx-sender current-contract none))` |
| B97 | 1336 | deposit-token-x-core | unwrap-panic | `(unwrap-panic (as-max-len?` |
| B98 | 1357 | deposit-token-x-core | try! | `(try! (contract-call? .jing-core-v5 log-deposit-x tx-sender (+ carry amount)` |
| B99 | 1364 | deposit-token-x-core | try! | `(try! (contract-call? t transfer amount tx-sender current-contract none))` |
| B100 | 1378 | deposit-token-x-core | if | `(is-eq existing u0)` |
| B101 | 1380 | deposit-token-x-core | unwrap-panic | `(unwrap-panic (as-max-len? (append depositors tx-sender) u50))` |
| B102 | 1384 | deposit-token-x-core | try! | `(try! (contract-call? .jing-core-v5 log-deposit-x tx-sender` |
| B103 | 1408 | deposit-token-x | if | `(or` |
| B104 | 1412 | deposit-token-x | try! | `(try! (fresh-classification-price update))` |
| B105 | 1417 | deposit-token-x | asserts! | `ERR_BAD_SPREAD: (valid-spread spread-bps)` |
| B106 | 1418 | deposit-token-x | asserts! | `ERR_MUST_USE_SWAP: (not (would-take-as-x price ask))` |
| B107 | 1420 | deposit-token-x | asserts! | `ERR_QUEUE_FULL: (not (and new-maker full (is-eq ask MAX_UINT)))` |
| B108 | 1424 | deposit-token-x | try! | `(try! (park-tenth-token-x cycle price ask (+ amount parked) depositors))` |
| B109 | 1426 | deposit-token-x | try! | `(let ((deposited (try! (deposit-token-x-core amount limit-price spread-bps parke` |
| B110 | 1427 | deposit-token-x | try! | `(try! (log-peg-x-if spread-bps limit-price))` |
| B111 | 1430 | deposit-token-x | try! | `(try! (contract-call? .jing-core-v5 log-readmit-x tx-sender parked cycle price` |
| B112 | 1450 | cancel-token-y-deposit | asserts! | `ERR_WRONG_TRAIT: (is-eq (contract-of t) tok-y)` |
| B113 | 1451 | cancel-token-y-deposit | asserts! | `ERR_NOTHING_TO_WITHDRAW: (or (> amount u0) (> parked u0))` |
| B114 | 1452 | cancel-token-y-deposit | if | `(is-eq amount u0)` |
| B115 | 1454 | cancel-token-y-deposit | try! | `(try! (as-contract? ((with-stx parked))` |
| B116 | 1455 | cancel-token-y-deposit | try! | `(try! (stx-transfer? parked current-contract caller))` |
| B117 | 1459 | cancel-token-y-deposit | try! | `(try! (contract-call? .jing-core-v5 log-refund-y caller parked cycle` |
| B118 | 1465 | cancel-token-y-deposit | try! | `(try! (as-contract? ((with-stx amount))` |
| B119 | 1466 | cancel-token-y-deposit | try! | `(try! (stx-transfer? amount current-contract caller))` |
| B120 | 1480 | cancel-token-y-deposit | try! | `(try! (contract-call? .jing-core-v5 log-refund-y caller amount cycle` |
| B121 | 1501 | cancel-token-x-deposit | asserts! | `ERR_WRONG_TRAIT: (is-eq (contract-of t) tok-x)` |
| B122 | 1502 | cancel-token-x-deposit | asserts! | `ERR_NOTHING_TO_WITHDRAW: (or (> amount u0) (> parked u0))` |
| B123 | 1503 | cancel-token-x-deposit | if | `(is-eq amount u0)` |
| B124 | 1505 | cancel-token-x-deposit | try! | `(try! (as-contract? ((with-ft (contract-of t) asset-name parked))` |
| B125 | 1506 | cancel-token-x-deposit | try! | `(try! (contract-call? t transfer parked current-contract caller none))` |
| B126 | 1510 | cancel-token-x-deposit | try! | `(try! (contract-call? .jing-core-v5 log-refund-x caller parked cycle tok-x` |
| B127 | 1516 | cancel-token-x-deposit | try! | `(try! (as-contract? ((with-ft (contract-of t) asset-name amount))` |
| B128 | 1517 | cancel-token-x-deposit | try! | `(try! (contract-call? t transfer amount current-contract caller none))` |
| B129 | 1531 | cancel-token-x-deposit | try! | `(try! (contract-call? .jing-core-v5 log-refund-x caller amount cycle tok-x` |
| B130 | 1551 | withdraw-token-y | if | `on-live` |
| B131 | 1557 | withdraw-token-y | if | `(> amount have)` |
| B132 | 1562 | withdraw-token-y | asserts! | `ERR_WRONG_TRAIT: (is-eq (contract-of t) tok-y)` |
| B133 | 1563 | withdraw-token-y | asserts! | `ERR_NOTHING_TO_WITHDRAW: (> have u0)` |
| B134 | 1564 | withdraw-token-y | asserts! | `ERR_NOTHING_TO_WITHDRAW: (> amount u0)` |
| B135 | 1565 | withdraw-token-y | asserts! | `ERR_USE_CANCEL: (< amount have)` |
| B136 | 1566 | withdraw-token-y | asserts! | `ERR_DEPOSIT_TOO_SMALL: (>= remaining (var-get min-token-y-deposit))` |
| B137 | 1567 | withdraw-token-y | try! | `(try! (as-contract? ((with-stx amount))` |
| B138 | 1568 | withdraw-token-y | try! | `(try! (stx-transfer? amount current-contract caller))` |
| B139 | 1570 | withdraw-token-y | if | `on-live` |
| B140 | 1584 | withdraw-token-y | try! | `(try! (contract-call? .jing-core-v5 log-withdraw-y caller amount remaining` |
| B141 | 1602 | withdraw-token-x | if | `on-live` |
| B142 | 1608 | withdraw-token-x | if | `(> amount have)` |
| B143 | 1613 | withdraw-token-x | asserts! | `ERR_WRONG_TRAIT: (is-eq (contract-of t) tok-x)` |
| B144 | 1614 | withdraw-token-x | asserts! | `ERR_NOTHING_TO_WITHDRAW: (> have u0)` |
| B145 | 1615 | withdraw-token-x | asserts! | `ERR_NOTHING_TO_WITHDRAW: (> amount u0)` |
| B146 | 1616 | withdraw-token-x | asserts! | `ERR_USE_CANCEL: (< amount have)` |
| B147 | 1617 | withdraw-token-x | asserts! | `ERR_DEPOSIT_TOO_SMALL: (>= remaining (var-get min-token-x-deposit))` |
| B148 | 1618 | withdraw-token-x | try! | `(try! (as-contract? ((with-ft (contract-of t) asset-name amount))` |
| B149 | 1619 | withdraw-token-x | try! | `(try! (contract-call? t transfer amount current-contract caller none))` |
| B150 | 1621 | withdraw-token-x | if | `on-live` |
| B151 | 1635 | withdraw-token-x | try! | `(try! (contract-call? .jing-core-v5 log-withdraw-x caller amount remaining` |
| B152 | 1651 | readmit-token-y | try! | `(price (try! (fresh-classification-price update)))` |
| B153 | 1654 | readmit-token-y | asserts! | `ERR_PAUSED: (not (var-get paused))` |
| B154 | 1655 | readmit-token-y | asserts! | `ERR_NOTHING_TO_READMIT: (> amount u0)` |
| B155 | 1656 | readmit-token-y | asserts! | `ERR_QUEUE_FULL: (not (side-full-y depositors who))` |
| B156 | 1657 | readmit-token-y | asserts! | `ERR_MUST_USE_SWAP: (not (would-take-as-y price limit))` |
| B157 | 1665 | readmit-token-y | unwrap-panic | `(unwrap-panic (as-max-len? (append depositors who) u50))` |
| B158 | 1671 | readmit-token-y | try! | `(try! (contract-call? .jing-core-v5 log-readmit-y who amount cycle price` |
| B159 | 1687 | readmit-token-x | try! | `(price (try! (fresh-classification-price update)))` |
| B160 | 1690 | readmit-token-x | asserts! | `ERR_PAUSED: (not (var-get paused))` |
| B161 | 1691 | readmit-token-x | asserts! | `ERR_NOTHING_TO_READMIT: (> amount u0)` |
| B162 | 1692 | readmit-token-x | asserts! | `ERR_QUEUE_FULL: (not (side-full-x depositors who))` |
| B163 | 1693 | readmit-token-x | asserts! | `ERR_MUST_USE_SWAP: (not (would-take-as-x price limit))` |
| B164 | 1701 | readmit-token-x | unwrap-panic | `(unwrap-panic (as-max-len? (append depositors who) u50))` |
| B165 | 1707 | readmit-token-x | try! | `(try! (contract-call? .jing-core-v5 log-readmit-x who amount cycle price` |
| B166 | 1720 | set-token-y-limit | asserts! | `ERR_LIMIT_REQUIRED: (> limit-price u0)` |
| B167 | 1721 | set-token-y-limit | asserts! | `ERR_BAD_SPREAD: (valid-spread spread-bps)` |
| B168 | 1722 | set-token-y-limit | asserts! | `(multi-line)` |
| B169 | 1729 | set-token-y-limit | if | `(> (len (get-token-x-depositors (var-get current-cycle))) u0)` |
| B170 | 1730 | set-token-y-limit | try! | `(let ((price (try! (fresh-classification-price update))))` |
| B171 | 1731 | set-token-y-limit | asserts! | `(multi-line)` |
| B172 | 1742 | set-token-y-limit | try! | `(try! (contract-call? .jing-core-v5 log-set-limit-y tx-sender limit-price` |
| B173 | 1745 | set-token-y-limit | try! | `(try! (log-peg-y-if spread-bps limit-price))` |
| B174 | 1755 | set-token-x-limit | asserts! | `ERR_LIMIT_REQUIRED: (> limit-price u0)` |
| B175 | 1756 | set-token-x-limit | asserts! | `ERR_BAD_SPREAD: (valid-spread spread-bps)` |
| B176 | 1757 | set-token-x-limit | asserts! | `(multi-line)` |
| B177 | 1764 | set-token-x-limit | if | `(> (len (get-token-y-depositors (var-get current-cycle))) u0)` |
| B178 | 1765 | set-token-x-limit | try! | `(let ((price (try! (fresh-classification-price update))))` |
| B179 | 1766 | set-token-x-limit | asserts! | `(multi-line)` |
| B180 | 1777 | set-token-x-limit | try! | `(try! (contract-call? .jing-core-v5 log-set-limit-x tx-sender limit-price` |
| B181 | 1780 | set-token-x-limit | try! | `(try! (log-peg-x-if spread-bps limit-price))` |
| B182 | 1797 | reprice-or-swap-token-y | asserts! | `ERR_LIMIT_REQUIRED: (> limit-price u0)` |
| B183 | 1798 | reprice-or-swap-token-y | asserts! | `ERR_BAD_SPREAD: (valid-spread spread-bps)` |
| B184 | 1799 | reprice-or-swap-token-y | asserts! | `ERR_NOTHING_TO_WITHDRAW: (> amount u0)` |
| B185 | 1800 | reprice-or-swap-token-y | asserts! | `ERR_WRONG_TRAIT: (is-eq (contract-of tx-trait) (var-get token-x))` |
| B186 | 1801 | reprice-or-swap-token-y | asserts! | `ERR_WRONG_TRAIT: (is-eq (contract-of ty-trait) (var-get token-y))` |
| B187 | 1806 | reprice-or-swap-token-y | try! | `(try! (contract-call? .jing-core-v5 log-set-limit-y tx-sender limit-price` |
| B188 | 1809 | reprice-or-swap-token-y | try! | `(try! (log-peg-y-if spread-bps limit-price))` |
| B189 | 1810 | reprice-or-swap-token-y | if | `(and` |
| B190 | 1812 | reprice-or-swap-token-y | try! | `(let ((price (try! (fresh-classification-price update))))` |
| B191 | 1819 | reprice-or-swap-token-y | try! | `(try! (stx-transfer? rebate tx-sender current-contract))` |
| B192 | 1823 | reprice-or-swap-token-y | try! | `(let ((result (try! (settle-with-refresh update tx-trait tx-name ty-trait ty-nam` |
| B193 | 1825 | reprice-or-swap-token-y | try! | `(try! (cross-remainder-as-y limit-price (get token-y-rolled result)` |
| B194 | 1855 | reprice-or-swap-token-x | asserts! | `ERR_LIMIT_REQUIRED: (> limit-price u0)` |
| B195 | 1856 | reprice-or-swap-token-x | asserts! | `ERR_BAD_SPREAD: (valid-spread spread-bps)` |
| B196 | 1857 | reprice-or-swap-token-x | asserts! | `ERR_NOTHING_TO_WITHDRAW: (> amount u0)` |
| B197 | 1858 | reprice-or-swap-token-x | asserts! | `ERR_WRONG_TRAIT: (is-eq (contract-of tx-trait) (var-get token-x))` |
| B198 | 1859 | reprice-or-swap-token-x | asserts! | `ERR_WRONG_TRAIT: (is-eq (contract-of ty-trait) (var-get token-y))` |
| B199 | 1864 | reprice-or-swap-token-x | try! | `(try! (contract-call? .jing-core-v5 log-set-limit-x tx-sender limit-price` |
| B200 | 1867 | reprice-or-swap-token-x | try! | `(try! (log-peg-x-if spread-bps limit-price))` |
| B201 | 1868 | reprice-or-swap-token-x | if | `(and` |
| B202 | 1870 | reprice-or-swap-token-x | try! | `(let ((price (try! (fresh-classification-price update))))` |
| B203 | 1877 | reprice-or-swap-token-x | try! | `(try! (contract-call? tx-trait transfer rebate tx-sender current-contract` |
| B204 | 1883 | reprice-or-swap-token-x | try! | `(let ((result (try! (settle-with-refresh update tx-trait tx-name ty-trait ty-nam` |
| B205 | 1885 | reprice-or-swap-token-x | try! | `(try! (cross-remainder-as-x limit-price (get token-x-rolled result)` |
| B206 | 1911 | filter-small-token-y-depositor | if | `(< (* amount BPS_PRECISION) (* total-token-y MIN_SHARE_BPS))` |
| B207 | 1912 | filter-small-token-y-depositor | if | `(and (var-get crossing) (is-eq depositor tx-sender))` |
| B208 | 1922 | filter-small-token-y-depositor | unwrap-panic | `(unwrap-panic (as-max-len? (append (get-token-y-depositors next-cycle) depositor` |
| B209 | 1940 | filter-small-token-y-depositor | try! | `(try! (contract-call? .jing-core-v5 log-small-share-roll-y depositor cycle` |
| B210 | 1960 | filter-small-token-x-depositor | if | `(< (* amount BPS_PRECISION) (* total-token-x MIN_SHARE_BPS))` |
| B211 | 1961 | filter-small-token-x-depositor | if | `(and (var-get crossing) (is-eq depositor tx-sender))` |
| B212 | 1971 | filter-small-token-x-depositor | unwrap-panic | `(unwrap-panic (as-max-len? (append (get-token-x-depositors next-cycle) depositor` |
| B213 | 1989 | filter-small-token-x-depositor | try! | `(try! (contract-call? .jing-core-v5 log-small-share-roll-x depositor cycle` |
| B214 | 2010 | filter-limit-violating-token-y-depositor | if | `(> clearing limit)` |
| B215 | 2019 | filter-limit-violating-token-y-depositor | unwrap-panic | `(unwrap-panic (as-max-len? (append (get-token-y-depositors next-cycle) depositor` |
| B216 | 2035 | filter-limit-violating-token-y-depositor | try! | `(try! (contract-call? .jing-core-v5 log-limit-roll-y depositor cycle amount` |
| B217 | 2055 | filter-limit-violating-token-x-depositor | if | `(< clearing limit)` |
| B218 | 2064 | filter-limit-violating-token-x-depositor | unwrap-panic | `(unwrap-panic (as-max-len? (append (get-token-x-depositors next-cycle) depositor` |
| B219 | 2080 | filter-limit-violating-token-x-depositor | try! | `(try! (contract-call? .jing-core-v5 log-limit-roll-x depositor cycle amount` |
| B220 | 2098 | settle-with-refresh | asserts! | `ERR_WRONG_TRAIT: (is-eq (contract-of tx-trait) (var-get token-x))` |
| B221 | 2099 | settle-with-refresh | asserts! | `ERR_WRONG_TRAIT: (is-eq (contract-of ty-trait) (var-get token-y))` |
| B222 | 2101 | settle-with-refresh | try! | `(feeds (try! (lazer-feeds update)))` |
| B223 | 2106 | settle-with-refresh | try! | `(try! (execute-settlement cycle feed-x feed-y tx-trait tx-name ty-trait ty-name)` |
| B224 | 2117 | settle-with-refresh | try! | `(try! (fold distribute-to-token-y-depositor (get-token-y-depositors cycle)` |
| B225 | 2123 | settle-with-refresh | try! | `(try! (fold distribute-to-token-x-depositor (get-token-x-depositors cycle)` |
| B226 | 2129 | settle-with-refresh | try! | `(try! (roll-and-sweep-dust tx-trait tx-name ty-trait ty-name))` |
| B227 | 2156 | swap | asserts! | `ERR_DEPOSIT_TOO_SMALL: (> net u0)` |
| B228 | 2157 | swap | asserts! | `(multi-line)` |
| B229 | 2159 | swap | if | `deposit-x` |
| B230 | 2167 | swap | asserts! | `(multi-line)` |
| B231 | 2169 | swap | if | `deposit-x` |
| B232 | 2177 | swap | if | `deposit-x` |
| B233 | 2181 | swap | try! | `(try! (contract-call? tx-trait transfer rebate tx-sender current-contract` |
| B234 | 2186 | swap | try! | `(try! (deposit-token-x-core net limit-price none u0 u0 tx-trait tx-name))` |
| B235 | 2189 | swap | try! | `(and (> rebate u0) (try! (stx-transfer? rebate tx-sender current-contract)))` |
| B236 | 2191 | swap | try! | `(try! (deposit-token-y-core net limit-price none u0 u0 ty-trait ty-name))` |
| B237 | 2195 | swap | try! | `(let ((result (try! (settle-with-refresh update tx-trait tx-name ty-trait ty-nam` |
| B238 | 2196 | swap | if | `deposit-x` |
| B239 | 2198 | swap | try! | `(try! (cross-remainder-as-x limit-price (get token-x-rolled result) tx-trait` |
| B240 | 2203 | swap | try! | `(try! (cross-remainder-as-y limit-price (get token-y-rolled result) tx-trait` |
| B241 | 2227 | execute-fill | if | `(> x-amt x-from-y)` |
| B242 | 2234 | execute-fill | if | `y-is-taker` |
| B243 | 2239 | execute-fill | if | `(> r pending-rey)` |
| B244 | 2246 | execute-fill | if | `y-is-taker` |
| B245 | 2252 | execute-fill | if | `(> r pending-rex)` |
| B246 | 2261 | execute-fill | if | `(and` |
| B247 | 2269 | execute-fill | if | `(and` |
| B248 | 2278 | execute-fill | if | `(or (is-eq x-traded u0) (is-eq y-traded u0))` |
| B249 | 2283 | execute-fill | try! | `(try! (as-contract? ((with-stx (+ y-traded reb-y)))` |
| B250 | 2284 | execute-fill | try! | `(try! (stx-transfer? (+ (- y-traded y-fee) reb-y) current-contract x-who))` |
| B251 | 2285 | execute-fill | if | `(> y-fee u0)` |
| B252 | 2286 | execute-fill | try! | `(try! (stx-transfer? y-fee current-contract (var-get treasury)))` |
| B253 | 2289 | execute-fill | try! | `(try! (as-contract? ((with-ft (contract-of t) tx-name (+ x-traded reb-x)))` |
| B254 | 2290 | execute-fill | try! | `(try! (contract-call? t transfer (+ (- x-traded x-fee) reb-x)` |
| B255 | 2293 | execute-fill | if | `(> x-fee u0)` |
| B256 | 2294 | execute-fill | try! | `(try! (contract-call? t transfer x-fee current-contract (var-get treasury)` |
| B257 | 2301 | execute-fill | if | `y-is-taker` |
| B258 | 2306 | execute-fill | if | `(or (is-eq y-left u0) (> y-refund u0))` |
| B259 | 2325 | execute-fill | if | `(or (is-eq x-left u0) (> x-refund u0))` |
| B260 | 2344 | execute-fill | if | `(> y-refund u0)` |
| B261 | 2346 | execute-fill | try! | `(try! (as-contract? ((with-stx y-refund))` |
| B262 | 2347 | execute-fill | try! | `(try! (stx-transfer? y-refund current-contract y-who))` |
| B263 | 2349 | execute-fill | try! | `(try! (contract-call? .jing-core-v5 log-refund-y y-who y-refund cycle` |
| B264 | 2355 | execute-fill | if | `(> x-refund u0)` |
| B265 | 2357 | execute-fill | try! | `(try! (as-contract? ((with-ft (contract-of t) tx-name x-refund))` |
| B266 | 2358 | execute-fill | try! | `(try! (contract-call? t transfer x-refund current-contract x-who none))` |
| B267 | 2360 | execute-fill | try! | `(try! (contract-call? .jing-core-v5 log-refund-x x-who x-refund cycle` |
| B268 | 2372 | execute-fill | try! | `(try! (contract-call? .jing-core-v5 log-match` |
| B269 | 2373 | execute-fill | if | `y-is-taker` |
| B270 | 2377 | execute-fill | if | `y-is-taker` |
| B271 | 2403 | walk-x-book-step | match | `acc` |
| B272 | 2411 | walk-x-book-step | if | `(or` |
| B273 | 2421 | walk-x-book-step | try! | `(try! (execute-fill cycle takr rem maker m-amt l (get mid st) true (get t st)` |
| B274 | 2445 | walk-y-book-step | match | `acc` |
| B275 | 2453 | walk-y-book-step | if | `(or` |
| B276 | 2463 | walk-y-book-step | try! | `(try! (execute-fill cycle maker m-amt takr rem l (get mid st) false` |
| B277 | 2484 | push-quote | unwrap-panic | `(unwrap-panic (as-max-len? (append lst e) u50))` |
| B278 | 2511 | insert-ask-step | if | `(and (not (get placed acc)) (< (get l (get e acc)) (get l entry)))` |
| B279 | 2537 | insert-bid-step | if | `(and (not (get placed acc)) (> (get l (get e acc)) (get l entry)))` |
| B280 | 2562 | collect-ask-step | if | `(or` |
| B281 | 2577 | collect-ask-step | if | `(get placed r)` |
| B282 | 2606 | collect-bid-step | if | `(or` |
| B283 | 2621 | collect-bid-step | if | `(get placed r)` |
| B284 | 2719 | cross-remainder-as-y | try! | `(try! (fold walk-x-book-step` |
| B285 | 2738 | cross-remainder-as-y | try! | `(try! (as-contract? ((with-stx left))` |
| B286 | 2739 | cross-remainder-as-y | try! | `(try! (stx-transfer? left current-contract swapper))` |
| B287 | 2743 | cross-remainder-as-y | asserts! | `ERR_PARTIAL_FILL: (< rem (var-get min-token-y-deposit))` |
| B288 | 2747 | cross-remainder-as-y | try! | `(try! (as-contract? ((with-stx rem))` |
| B289 | 2748 | cross-remainder-as-y | try! | `(try! (stx-transfer? rem current-contract swapper))` |
| B290 | 2786 | cross-remainder-as-x | try! | `(try! (fold walk-y-book-step` |
| B291 | 2805 | cross-remainder-as-x | try! | `(try! (as-contract? ((with-ft (contract-of t) tx-name left))` |
| B292 | 2806 | cross-remainder-as-x | try! | `(try! (contract-call? t transfer left current-contract swapper none))` |
| B293 | 2810 | cross-remainder-as-x | asserts! | `ERR_PARTIAL_FILL: (< rem (var-get min-token-x-deposit))` |
| B294 | 2814 | cross-remainder-as-x | try! | `(try! (as-contract? ((with-ft (contract-of t) tx-name rem))` |
| B295 | 2815 | cross-remainder-as-x | try! | `(try! (contract-call? t transfer rem current-contract swapper none))` |
| B296 | 2871 | execute-settlement | asserts! | `ERR_PAUSED: (not (var-get paused))` |
| B297 | 2872 | execute-settlement | asserts! | `(multi-line)` |
| B298 | 2879 | execute-settlement | asserts! | `ERR_ALREADY_SETTLED: (is-none (map-get? settlements cycle))` |
| B299 | 2880 | execute-settlement | asserts! | `ERR_ZERO_PRICE: (> price-x u0)` |
| B300 | 2881 | execute-settlement | asserts! | `ERR_ZERO_PRICE: (> price-y u0)` |
| B301 | 2882 | execute-settlement | asserts! | `ERR_STALE_PRICE: (> (get publish-time feed-x) min-freshness)` |
| B302 | 2883 | execute-settlement | asserts! | `ERR_STALE_PRICE: (> (get publish-time feed-y) min-freshness)` |
| B303 | 2884 | execute-settlement | asserts! | `(< (get conf feed-x) (/ price-x MAX_CONF_RATIO))` |
| B304 | 2887 | execute-settlement | asserts! | `(< (get conf feed-y) (/ price-y MAX_CONF_RATIO))` |
| B305 | 2890 | execute-settlement | asserts! | `ERR_EXPO_MISMATCH: (is-eq (get expo feed-x) (get expo feed-y))` |
| B306 | 2892 | execute-settlement | asserts! | `ERR_ZERO_PRICE: (> oracle-price u0)` |
| B307 | 2904 | execute-settlement | asserts! | `ERR_TAKER_TOO_SMALL: (not (var-get taker-too-small))` |
| B308 | 2911 | execute-settlement | if | `token-x-is-binding` |
| B309 | 2915 | execute-settlement | if | `token-x-is-binding` |
| B310 | 2925 | execute-settlement | if | `(> total-token-x u0)` |
| B311 | 2929 | execute-settlement | if | `(> total-token-y u0)` |
| B312 | 2934 | execute-settlement | asserts! | `(multi-line)` |
| B313 | 2952 | execute-settlement | if | `(> token-y-fee u0)` |
| B314 | 2953 | execute-settlement | try! | `(try! (as-contract? ((with-stx token-y-fee))` |
| B315 | 2954 | execute-settlement | try! | `(try! (stx-transfer? token-y-fee current-contract (var-get treasury)))` |
| B316 | 2958 | execute-settlement | if | `(> token-x-fee u0)` |
| B317 | 2959 | execute-settlement | try! | `(try! (as-contract? ((with-ft (contract-of tx-trait) tx-name token-x-fee))` |
| B318 | 2960 | execute-settlement | try! | `(try! (contract-call? tx-trait transfer token-x-fee current-contract` |
| B319 | 2978 | execute-settlement | try! | `(try! (contract-call? .jing-core-v5 log-settlement cycle oracle-price` |
| B320 | 2998 | distribute-to-token-y-depositor | try! | `(unwrapped (try! acc))` |
| B321 | 3003 | distribute-to-token-y-depositor | if | `(> total-token-y u0)` |
| B322 | 3007 | distribute-to-token-y-depositor | if | `(> total-token-y u0)` |
| B323 | 3014 | distribute-to-token-y-depositor | if | `(and` |
| B324 | 3032 | distribute-to-token-y-depositor | if | `(is-eq depositor tx-sender)` |
| B325 | 3040 | distribute-to-token-y-depositor | if | `(> my-token-x-received u0)` |
| B326 | 3041 | distribute-to-token-y-depositor | try! | `(try! (as-contract?` |
| B327 | 3043 | distribute-to-token-y-depositor | try! | `(try! (contract-call? tt transfer my-token-x-received current-contract` |
| B328 | 3049 | distribute-to-token-y-depositor | if | `(> my-roll u0)` |
| B329 | 3058 | distribute-to-token-y-depositor | unwrap-panic | `(unwrap-panic (as-max-len? (append (get-token-y-depositors next-cycle) depositor` |
| B330 | 3064 | distribute-to-token-y-depositor | if | `(> my-refund u0)` |
| B331 | 3066 | distribute-to-token-y-depositor | try! | `(try! (as-contract? ((with-stx my-refund))` |
| B332 | 3067 | distribute-to-token-y-depositor | try! | `(try! (stx-transfer? my-refund current-contract depositor))` |
| B333 | 3069 | distribute-to-token-y-depositor | try! | `(try! (contract-call? .jing-core-v5 log-refund-y depositor my-refund cycle` |
| B334 | 3077 | distribute-to-token-y-depositor | try! | `(try! (contract-call? .jing-core-v5 log-distribute-y-depositor depositor cycle` |
| B335 | 3094 | distribute-to-token-x-depositor | try! | `(unwrapped (try! acc))` |
| B336 | 3099 | distribute-to-token-x-depositor | if | `(> total-token-x u0)` |
| B337 | 3103 | distribute-to-token-x-depositor | if | `(> total-token-x u0)` |
| B338 | 3110 | distribute-to-token-x-depositor | if | `(and` |
| B339 | 3128 | distribute-to-token-x-depositor | if | `(is-eq depositor tx-sender)` |
| B340 | 3136 | distribute-to-token-x-depositor | if | `(> my-token-y-received u0)` |
| B341 | 3137 | distribute-to-token-x-depositor | try! | `(try! (as-contract? ((with-stx my-token-y-received))` |
| B342 | 3138 | distribute-to-token-x-depositor | try! | `(try! (stx-transfer? my-token-y-received current-contract depositor))` |
| B343 | 3142 | distribute-to-token-x-depositor | if | `(> my-roll u0)` |
| B344 | 3151 | distribute-to-token-x-depositor | unwrap-panic | `(unwrap-panic (as-max-len? (append (get-token-x-depositors next-cycle) depositor` |
| B345 | 3157 | distribute-to-token-x-depositor | if | `(> my-refund u0)` |
| B346 | 3159 | distribute-to-token-x-depositor | try! | `(try! (as-contract?` |
| B347 | 3161 | distribute-to-token-x-depositor | try! | `(try! (contract-call? tt transfer my-refund current-contract depositor` |
| B348 | 3165 | distribute-to-token-x-depositor | try! | `(try! (contract-call? .jing-core-v5 log-refund-x depositor my-refund cycle` |
| B349 | 3173 | distribute-to-token-x-depositor | try! | `(try! (contract-call? .jing-core-v5 log-distribute-x-depositor depositor cycle` |
| B350 | 3207 | roll-and-sweep-dust | if | `(> token-y-dust u0)` |
| B351 | 3208 | roll-and-sweep-dust | try! | `(try! (as-contract? ((with-stx token-y-dust))` |
| B352 | 3209 | roll-and-sweep-dust | try! | `(try! (stx-transfer? token-y-dust current-contract (var-get treasury)))` |
| B353 | 3213 | roll-and-sweep-dust | if | `(> token-x-dust u0)` |
| B354 | 3214 | roll-and-sweep-dust | try! | `(try! (as-contract? ((with-ft (contract-of tx-trait) tx-name token-x-dust))` |
| B355 | 3215 | roll-and-sweep-dust | try! | `(try! (contract-call? tx-trait transfer token-x-dust current-contract` |
| B356 | 3221 | roll-and-sweep-dust | try! | `(try! (contract-call? .jing-core-v5 log-sweep-dust acc-token-x-rol acc-token-y-r` |
| B357 | 3240 | initialize | asserts! | `ERR_NOT_AUTHORIZED: (is-eq tx-sender (var-get operator))` |
| B358 | 3241 | initialize | asserts! | `(is-eq tx-sender (contract-call? .jing-core-v5 get-contract-owner))` |
| B359 | 3244 | initialize | asserts! | `ERR_ALREADY_INITIALIZED: (not (var-get initialized))` |
| B360 | 3245 | initialize | asserts! | `ERR_ZERO_MIN_DEPOSIT: (and (> min-x u0) (> min-y u0))` |
| B361 | 3253 | initialize | try! | `(try! (contract-call? .jing-core-v5 register canonical))` |
| B362 | 3260 | set-treasury | asserts! | `ERR_NOT_AUTHORIZED: (is-eq tx-sender (var-get operator))` |
| B363 | 3267 | set-paused | asserts! | `ERR_NOT_AUTHORIZED: (is-eq tx-sender (var-get operator))` |
| B364 | 3274 | set-operator | asserts! | `ERR_NOT_AUTHORIZED: (is-eq tx-sender (var-get operator))` |
| B365 | 3281 | set-min-token-y-deposit | asserts! | `ERR_NOT_AUTHORIZED: (is-eq tx-sender (var-get operator))` |
| B366 | 3282 | set-min-token-y-deposit | asserts! | `ERR_ZERO_MIN_DEPOSIT: (> amount u0)` |
| B367 | 3289 | set-min-token-x-deposit | asserts! | `ERR_NOT_AUTHORIZED: (is-eq tx-sender (var-get operator))` |
| B368 | 3290 | set-min-token-x-deposit | asserts! | `ERR_ZERO_MIN_DEPOSIT: (> amount u0)` |
| B369 | 3297 | set-distance-slots | asserts! | `ERR_NOT_AUTHORIZED: (is-eq tx-sender (var-get operator))` |
| B370 | 3298 | set-distance-slots | asserts! | `ERR_QUEUE_FULL: (<= slots MAX_DEPOSITORS)` |
| B371 | 3322 | cap-bid-fold | if | `(>= l (get mid acc))` |
| B372 | 3324 | cap-bid-fold | if | `(and` |
| B373 | 3350 | cap-ask-fold | if | `(<= l (get mid acc))` |
| B374 | 3352 | cap-ask-fold | if | `(and` |
| B375 | 3369 | gross-up | if | `(> n net)` |
| B376 | 3386 | get-taker-capacity | if | `deposit-x` |
| B377 | 3396 | get-taker-capacity | if | `deposit-x` |
| B378 | 3403 | get-taker-capacity | if | `deposit-x` |
| B379 | 3407 | get-taker-capacity | if | `deposit-x` |
| B380 | 3411 | get-taker-capacity | if | `deposit-x` |
| B381 | 3415 | get-taker-capacity | if | `(and taker-in-range (> opposite own))` |
| B382 | 3419 | get-taker-capacity | if | `deposit-x` |
| B383 | 3438 | prune-one | try! | `(let ((pruned (try! acc)))` |
| B384 | 3439 | prune-one | asserts! | `ERR_CYCLE_OPEN: (< cycle (var-get current-cycle))` |
