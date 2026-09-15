;; Mock Bitflow XYK sbtc-stx pool for RV fuzzing of swap-router v5: the
;; reserves and fees the router's constant-product sizing reads. x is
;; sBTC, y is STX; both are the mock token principal under fuzz, so the
;; router's x-is-sbtc test reads true and x-for-y is the sBTC sale.
(define-read-only (get-pool)
  (ok {
    pool-id: u1,
    x-token: .mock-ft,
    y-token: .mock-ft,
    x-balance: u3000000000,
    y-balance: u9000000000000,
    x-protocol-fee: u10,
    x-provider-fee: u40,
    y-protocol-fee: u10,
    y-provider-fee: u40,
  })
)
