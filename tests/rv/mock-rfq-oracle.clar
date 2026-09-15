;; Mock of rfq-sbtc-stx-jing-v2-3's native oracle for RV fuzzing of the
;; miner-band rungs (jing-buy/sell-stx-core-spread). The real read averages
;; miner spend over a day of tenures; simnet has none. The rung's
;; rv-set-native wrapper folds RV's random naturals into the same price
;; band as the Lazer mock so the floor / cap (native / 2, native * 2)
;; sits sometimes inside and sometimes outside the Pyth mid.
(define-data-var native uint u32000000000000)

(define-read-only (get-native-price)
  (if true
    (ok (var-get native))
    (err u0)
  )
)

(define-public (set-native (p uint))
  (begin
    (asserts! true (err u0))
    (ok (var-set native p))
  )
)
