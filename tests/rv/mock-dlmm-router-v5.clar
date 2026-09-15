;; Mock Bitflow DLMM swap router for RV fuzzing of swap-router v5. x is
;; STX, y is sBTC. Takes the input from the caller and pays exactly the
;; minimum the jing router derived from the mock pool (one unit when the
;; minimum is zero): the pricing is the jing router's own arithmetic, the
;; mock only needs to be consistent with it and solvent. STX payouts come
;; from what rv-fund-amms put here; sBTC payouts mint.
(use-trait ft-trait .sip-010-trait.sip-010-trait)

(define-private (pay-stx (to principal) (amount uint))
  (as-contract? ((with-stx amount))
    (try! (stx-transfer? amount current-contract to))))

;; sell STX (x) for sBTC (y)
(define-public (swap-x-for-y-simple-range-multi
    (pool principal)
    (x-token <ft-trait>)
    (y-token <ft-trait>)
    (x-amount uint)
    (min-dy uint)
    (max-steps uint)
    (deadline (optional uint))
  )
  (let ((out (if (> min-dy u0) min-dy u1)) (user tx-sender))
    (asserts! (> x-amount u0) (err u2001))
    (try! (stx-transfer? x-amount user current-contract))
    (try! (as-contract? ((with-ft .mock-ft "mock-ft" out))
      (try! (contract-call? .mock-ft transfer out current-contract user none))))
    (ok { in: x-amount, out: out })))

;; sell sBTC (y) for STX (x)
(define-public (swap-y-for-x-simple-range-multi
    (pool principal)
    (x-token <ft-trait>)
    (y-token <ft-trait>)
    (y-amount uint)
    (min-dx uint)
    (max-steps uint)
    (deadline (optional uint))
  )
  (let ((out (if (> min-dx u0) min-dx u1)) (user tx-sender))
    (asserts! (> y-amount u0) (err u2001))
    (try! (contract-call? .mock-ft transfer y-amount user current-contract none))
    (try! (pay-stx user out))
    (ok { in: y-amount, out: out })))
