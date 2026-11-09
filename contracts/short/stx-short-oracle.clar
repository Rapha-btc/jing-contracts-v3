;; stx-short-oracle
;;
;; Pyth Lazer adapter for the STX short vault. Mirrors exactly how
;; markets-stx-usdcx-jing-v6-4 / markets-sbtc-usdcx-jing-v6-4 consume Lazer:
;;   pyth-lazer-oracle verify-price-feeds update pyth-lazer-decoder-v1
;;     (some MAX_STALENESS)
;;   feed-x = STX/USD (45), feed-y = USDC/USD (7), both expo -8
;;   per-feed feed-update-timestamp (micros) must be newer than
;;     stacks-block-time - MAX_STALENESS
;;   confidence required and < price / MAX_CONF_RATIO (2%), equal exponents
;;   price = STX/USD * 1e8 / USDC/USD  (the Jing market unit)
;; Pyth Core is NOT used (wormhole-core is dead on Stacks).

(impl-trait .stx-short-oracle-trait.stx-short-oracle-trait)

(define-constant LAZER_ORACLE 'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle)
(define-constant LAZER_DECODER 'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-decoder-v1)
(define-constant FEED_STX_USD u45)
(define-constant FEED_USDC_USD u7)
(define-constant MAX_STALENESS u80)
(define-constant MAX_CONF_RATIO u50)
(define-constant PRICE_PRECISION u100000000)
(define-constant MICROS_PER_SECOND u1000000)

(define-constant ERR_FEED_MISSING (err u4001))
(define-constant ERR_PRICE_UNCERTAIN (err u4002))
(define-constant ERR_FEED_TIMESTAMP_MISSING (err u4003))
(define-constant ERR_STALE_PRICE (err u4004))
(define-constant ERR_ZERO_PRICE (err u4005))
(define-constant ERR_EXPO_MISMATCH (err u4006))

(define-private (pick-feed
    (f {
      feed-id: uint,
      price: int,
      exponent: int,
      publisher-count: uint,
      confidence: (optional uint),
      best-bid: (optional int),
      best-ask: (optional int),
      funding-rate: (optional int),
      funding-timestamp: (optional uint),
      funding-rate-interval: (optional uint),
      market-session: (optional uint),
      ema-price: (optional int),
      ema-confidence: (optional uint),
      feed-update-timestamp: (optional uint),
    })
    (acc {
      id: uint,
      found: (optional {
        feed-id: uint,
        price: int,
        exponent: int,
        publisher-count: uint,
        confidence: (optional uint),
        best-bid: (optional int),
        best-ask: (optional int),
        funding-rate: (optional int),
        funding-timestamp: (optional uint),
        funding-rate-interval: (optional uint),
        market-session: (optional uint),
        ema-price: (optional int),
        ema-confidence: (optional uint),
        feed-update-timestamp: (optional uint),
      }),
    })
  )
  (if (is-eq (get feed-id f) (get id acc))
    (merge acc { found: (some f) })
    acc
  )
)

(define-private (shape-feed (f {
  feed-id: uint,
  price: int,
  exponent: int,
  publisher-count: uint,
  confidence: (optional uint),
  best-bid: (optional int),
  best-ask: (optional int),
  funding-rate: (optional int),
  funding-timestamp: (optional uint),
  funding-rate-interval: (optional uint),
  market-session: (optional uint),
  ema-price: (optional int),
  ema-confidence: (optional uint),
  feed-update-timestamp: (optional uint),
}))
  (let (
      (price (get price f))
      (conf (unwrap! (get confidence f) ERR_PRICE_UNCERTAIN))
      (published (/ (unwrap! (get feed-update-timestamp f) ERR_FEED_TIMESTAMP_MISSING)
        MICROS_PER_SECOND
      ))
    )
    (asserts! (> price 0) ERR_ZERO_PRICE)
    (asserts! (< conf (/ (to-uint price) MAX_CONF_RATIO)) ERR_PRICE_UNCERTAIN)
    (asserts! (> published (- stacks-block-time MAX_STALENESS)) ERR_STALE_PRICE)
    (ok {
      price: (to-uint price),
      expo: (get exponent f),
      at: published,
    })
  )
)

(define-public (get-price (update (buff 8192)))
  (let (
      (decoded (try! (contract-call? LAZER_ORACLE verify-price-feeds update LAZER_DECODER
        (some MAX_STALENESS)
      )))
      (feeds (get price-feeds decoded))
      (fx (try! (shape-feed (unwrap!
        (get found
          (fold pick-feed feeds {
            id: FEED_STX_USD,
            found: none,
          })
        )
        ERR_FEED_MISSING
      ))))
      (fy (try! (shape-feed (unwrap!
        (get found
          (fold pick-feed feeds {
            id: FEED_USDC_USD,
            found: none,
          })
        )
        ERR_FEED_MISSING
      ))))
      (price (/ (* (get price fx) PRICE_PRECISION) (get price fy)))
    )
    (asserts! (is-eq (get expo fx) (get expo fy)) ERR_EXPO_MISMATCH)
    (asserts! (> price u0) ERR_ZERO_PRICE)
    (ok {
      price: price,
      at: (if (< (get at fx) (get at fy))
        (get at fx)
        (get at fy)
      ),
    })
  )
)
