;; Shared interface: every rung supports deposits, withdrawals, and claims.
;; Payout units: stx/stx-paid are micro-STX; sbtc/sbtc-paid are satoshis.
;; amount uses the rung's input asset; held balances remain in logs/get-state.
(define-trait rung-trait
  (
    (deposit (uint) (response {
      amount: uint, shares: uint, epoch: uint,
      stx-paid: uint, sbtc-paid: uint,
    } uint))
    (withdraw (uint) (response { stx: uint, sbtc: uint } uint))
    (claim () (response { stx: uint, sbtc: uint } uint))
  )
)
