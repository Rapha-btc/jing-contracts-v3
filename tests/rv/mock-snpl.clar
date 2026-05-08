;; Mock snpl for RV reserve fuzzing. Implements the read-only side of
;; snpl-trait that the reserve calls on `open-credit-line`. The lifecycle
;; functions (borrow/repay/seize) are stubbed to satisfy the trait shape
;; but RV won't call into them from this side.
(impl-trait .snpl-trait.snpl-trait)
(use-trait reserve-trait .reserve-trait.reserve-trait)

(define-read-only (get-borrower)
  ;; Match deployer so reserve.open-credit-line passes the borrower-match
  ;; assert when lender (= deployer) calls it for this snpl.
  (ok 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM))

(define-read-only (get-reserve)
  (ok 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.reserve-sbtc-stx-jing))

(define-read-only (get-active-loan)
  (ok none))

(define-read-only (get-loan (loan-id uint))
  (ok none))

(define-public (borrow (amount uint) (interest-bps uint) (reserve <reserve-trait>))
  (begin (asserts! true (err u0)) (ok u0)))

(define-public (repay (loan-id uint) (reserve <reserve-trait>))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (seize (loan-id uint) (reserve <reserve-trait>))
  (begin (asserts! true (err u0)) (ok true)))
