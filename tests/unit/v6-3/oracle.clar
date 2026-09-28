;; Configurable decoded feeds. Signature verification is outside this unit suite.
(define-data-var mid uint u1000000000000)
(define-data-var mode uint u0)
(define-data-var age-x uint u0)
(define-data-var age-y uint u0)
(define-data-var frozen (optional uint) none)
(define-public (configure (m uint) (ax uint) (ay uint))
  (begin (var-set mode m) (var-set age-x ax) (var-set age-y ay) (ok true)))
(define-public (freeze) (ok (var-set frozen (some stacks-block-time))))
(define-public (thaw) (ok (var-set frozen none)))

(define-read-only (get-mid)
  (var-get mid)
)

(define-public (set-mid (m uint))
  (begin
    (asserts! true (err u0))
    (ok (var-set mid m))
  )
)

;; typed nones: a bare `none` in a literal tuple has no element type
(define-private (none-int)
  (if true none (some 0))
)
(define-private (none-uint)
  (if true none (some u0))
)

(define-private (feed
    (id uint)
    (p int)
    (ts uint)
  )
  {
    feed-id: id,
    price: (if (is-eq (var-get mode) id) 0 (if (is-eq (var-get mode) u12) -1 (if (and (is-eq id u45) (is-eq (var-get mode) u11)) 10000000000 p))),
    exponent: (if (and (is-eq id u45) (is-eq (var-get mode) u5)) -6 -8),
    publisher-count: u1,
    confidence: (if (is-eq (var-get mode) u2) none (some (if (and (is-eq id u1) (is-eq (var-get mode) u9)) (/ (var-get mid) u50) (if (is-eq (var-get mode) u3) u2000000 u0)))),
    best-bid: (none-int),
    best-ask: (none-int),
    funding-rate: (none-int),
    funding-timestamp: (none-uint),
    funding-rate-interval: (none-uint),
    market-session: (none-uint),
    ema-price: (none-int),
    ema-confidence: (none-uint),
    feed-update-timestamp: (if (is-eq (var-get mode) u4) none (some (if (is-eq (var-get mode) u8) (+ ts u60000000) ts))),
  }
)

(define-public (verify-price-feeds
    (update (buff 8192))
    (decoder principal)
    (max-age (optional uint))
  )
  (let ((ts (default-to stacks-block-time (var-get frozen))))
    (asserts! (not (is-eq (var-get mode) u7)) (err u9001))
    (ok {
      timestamp: (* ts u1000000),
      channel: u0,
      price-feeds: (list
        (feed (if (is-eq (var-get mode) u6) u2 u1) (to-int (var-get mid)) (* (- ts (var-get age-x)) u1000000))
        (feed u45 100000000 (* (- ts (var-get age-y)) u1000000))
      ),
    })
  )
)
