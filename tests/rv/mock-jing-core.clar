(define-read-only (get-contract-owner) tx-sender)

(define-public (register (canonical principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-deposit (token principal) (amount uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-withdraw (token principal) (amount uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-revoke (target-hash (buff 32)))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-cancel (market principal) (token-in principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-jing-deposit
    (msg-hash (buff 32))
    (market principal)
    (token-in principal)
    (token-out principal)
    (amount uint)
    (limit-price uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-bitflow-swap
    (msg-hash (buff 32))
    (token-in principal)
    (token-out principal)
    (amount uint)
    (limit-price uint)
    (out uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-deposit-x
    (depositor principal)
    (amount uint)
    (delta uint)
    (limit uint)
    (cycle uint)
    (bumped (optional principal))
    (bumped-amount uint)
    (token-x principal)
    (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-deposit-y
    (depositor principal)
    (amount uint)
    (delta uint)
    (limit uint)
    (cycle uint)
    (bumped (optional principal))
    (bumped-amount uint)
    (token-x principal)
    (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-refund-x
    (depositor principal)
    (amount uint)
    (cycle uint)
    (token-x principal)
    (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-refund-y
    (depositor principal)
    (amount uint)
    (cycle uint)
    (token-x principal)
    (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-set-limit-x
    (depositor principal)
    (limit uint)
    (token-x principal)
    (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-set-limit-y
    (depositor principal)
    (limit uint)
    (token-x principal)
    (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-close-deposits
    (cycle uint)
    (closed-at-block uint)
    (elapsed-blocks uint)
    (token-x principal)
    (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-small-share-roll-x
    (depositor principal)
    (cycle uint)
    (amount uint)
    (token-x principal)
    (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-small-share-roll-y
    (depositor principal)
    (cycle uint)
    (amount uint)
    (token-x principal)
    (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-limit-roll-x
    (depositor principal)
    (cycle uint)
    (amount uint)
    (limit uint)
    (clearing uint)
    (token-x principal)
    (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-limit-roll-y
    (depositor principal)
    (cycle uint)
    (amount uint)
    (limit uint)
    (clearing uint)
    (token-x principal)
    (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-settlement
    (cycle uint)
    (oracle-price uint)
    (clearing-price uint)
    (x-cleared uint)
    (y-cleared uint)
    (x-unfilled uint)
    (y-unfilled uint)
    (x-fee uint)
    (y-fee uint)
    (x-is-binding bool)
    (token-x principal)
    (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-distribute-x-depositor
    (depositor principal)
    (cycle uint)
    (y-received uint)
    (x-cleared uint)
    (x-rolled uint)
    (token-x principal)
    (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-distribute-y-depositor
    (depositor principal)
    (cycle uint)
    (x-received uint)
    (y-cleared uint)
    (y-rolled uint)
    (token-x principal)
    (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-sweep-dust
    (x-unfilled uint)
    (y-unfilled uint)
    (x-dust uint)
    (x-payout-dust uint)
    (x-roll-dust uint)
    (y-dust uint)
    (y-payout-dust uint)
    (y-roll-dust uint)
    (token-x principal)
    (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-cancel-cycle
    (cycle uint)
    (x-rolled uint)
    (y-rolled uint)
    (token-x principal)
    (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-reserve-supply (amount uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-reserve-withdraw-sbtc (amount uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-reserve-withdraw-stx (amount uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-reserve-open-credit-line
    (snpl principal) (borrower principal)
    (cap-sbtc uint) (interest-bps uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-reserve-set-credit-line-cap (snpl principal) (cap-sbtc uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-reserve-set-credit-line-interest (snpl principal) (interest-bps uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-reserve-close-credit-line (snpl principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-reserve-set-paused (paused-state bool))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-reserve-set-min-sbtc-draw (amount uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-reserve-draw
    (snpl principal) (amount uint) (new-outstanding-sbtc uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-reserve-notify-return
    (snpl principal) (amount uint) (new-outstanding-sbtc uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-snpl-set-reserve (reserve principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-snpl-borrow
    (loan-id uint) (borrower principal) (amount uint)
    (interest-bps uint) (deadline uint) (reserve principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-snpl-swap-deposit
    (loan-id uint) (amount uint) (limit uint) (cycle uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-snpl-cancel-swap (loan-id uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-snpl-set-swap-limit (loan-id uint) (limit-price uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-snpl-repay
    (loan-id uint)
    (payoff-sbtc uint) (lender-payoff-sbtc uint) (fee-sbtc uint)
    (delta-sbtc uint) (is-shortfall bool)
    (token-y-released uint) (reserve principal) (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (log-snpl-seize
    (loan-id uint) (token-y-seized uint) (sbtc-seized uint) (reserve principal) (token-y principal))
  (begin (asserts! true (err u0)) (ok true)))


