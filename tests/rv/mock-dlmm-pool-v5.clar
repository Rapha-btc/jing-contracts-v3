;; Mock Bitflow DLMM stx-sbtc pool for RV fuzzing of swap-router v5. The
;; router reads the active bin, the initial price, the bin step, the fees
;; and each bin's balances to size its walk. x is STX (micro), y is sBTC
;; (sats). Eleven bins around the active one hold liquidity; the rest are
;; empty. The initial price is sats per STX in the core's 1e8 scale, near
;; the fuzz band's middle (330 sats per STX).
(define-constant BIN_X u5000000000)
(define-constant BIN_Y u15000000)

(define-read-only (get-pool)
  (ok {
    pool-id: u1,
    active-bin-id: 0,
    initial-price: u33000000000,
    bin-step: u15,
    x-protocol-fee: u5,
    x-provider-fee: u10,
    x-variable-fee: u0,
    y-protocol-fee: u5,
    y-provider-fee: u10,
    y-variable-fee: u0,
  })
)

(define-read-only (get-bin-balances (id uint))
  (ok (if (and (>= id u495) (<= id u505))
    { x-balance: BIN_X, y-balance: BIN_Y, bin-shares: u1 }
    { x-balance: u0, y-balance: u0, bin-shares: u0 }))
)
