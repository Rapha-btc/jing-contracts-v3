;; Shared interface: every rung supports deposits, withdrawals, and claims.
;; Payout units: stx/stx-paid are micro-STX; sbtc/sbtc-paid are satoshis.
;; amount and rung-held-after use the rung's input asset. held is pool-wide.
(define-trait rung-trait
  (
    (deposit (uint (buff 8192)) (response {
      amount: uint, shares: uint, epoch: uint, rung-held-after: uint,
      stx-paid: uint, sbtc-paid: uint,
    } uint))
    (withdraw (uint) (response { stx: uint, sbtc: uint } uint))
    (claim () (response { stx: uint, sbtc: uint } uint))
  )
)
