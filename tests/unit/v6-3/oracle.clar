;; Configurable decoded feeds. Signature verification is outside this unit suite.
(define-data-var mid uint u1000000000000)
(define-data-var mode uint u0)
(define-data-var age-x uint u0)
(define-data-var age-y uint u0)
(define-data-var feed-x uint u1)
(define-data-var feed-y uint u45)
(define-public (configure-feed-ids (x uint) (y uint))
  (begin (var-set feed-x x) (var-set feed-y y) (ok true)))
(define-data-var frozen (optional uint) none)
(define-data-var confidence-x (optional uint) none)
(define-data-var confidence-y (optional uint) none)
(define-public (configure-confidence (x (optional uint)) (y (optional uint)))
  (begin (var-set confidence-x x) (var-set confidence-y y) (ok true)))
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
    confidence: (if (or (is-eq (var-get mode) u2) (and (is-eq id u45) (is-eq (var-get mode) u14))) none (some (default-to (if (and (is-eq id u1) (is-eq (var-get mode) u9)) (/ (var-get mid) u50) (if (is-eq (var-get mode) u3) u2000000 u0)) (if (is-eq id u1) (var-get confidence-x) (var-get confidence-y))))),
    best-bid: (none-int),
    best-ask: (none-int),
    funding-rate: (none-int),
    funding-timestamp: (none-uint),
    funding-rate-interval: (none-uint),
    market-session: (none-uint),
    ema-price: (none-int),
    ema-confidence: (none-uint),
    feed-update-timestamp: (if (or (is-eq (var-get mode) u4) (and (is-eq id u45) (is-eq (var-get mode) u15))) none (some (if (is-eq (var-get mode) u8) (+ ts u60000000) ts))),
  }
)

(define-read-only (decode-lazer-payload (payload (buff 8192)))
  (let ((ts (default-to stacks-block-time (var-get frozen))))
    (asserts! (not (is-eq (var-get mode) u7)) (err u9001))
    (ok {
      timestamp: (* ts u1000000),
      channel: u0,
      price-feeds: (if (is-eq (var-get mode) u16)
        ;; Last matching record wins; earlier duplicate and unrelated feeds
        ;; must not inflate the chosen age.
        (list
          (feed u99 100000000 (* (- ts u79) u1000000))
          (feed (var-get feed-x) (to-int (var-get mid)) (* (- ts u79) u1000000))
          (feed (var-get feed-y) 100000000 (* (- ts (var-get age-y)) u1000000))
          (feed (var-get feed-x) (to-int (var-get mid)) (* (- ts (var-get age-x)) u1000000)))
        (list
          (feed (if (is-eq (var-get mode) u6) u2 (var-get feed-x)) (to-int (var-get mid)) (* (- ts (var-get age-x)) u1000000))
          (feed (if (is-eq (var-get mode) u13) u46 (var-get feed-y)) 100000000 (* (- ts (var-get age-y)) u1000000)))),
    })
  )
)

(define-public (verify-price-feeds
    (update (buff 8192))
    (decoder principal)
    (max-age (optional uint))
  )
  (decode-lazer-payload update)
)
