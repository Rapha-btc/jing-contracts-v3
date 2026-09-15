;; Mock Bitflow XYK core for RV fuzzing of swap-router v5: x-for-y sells
;; sBTC for STX, y-for-x sells STX for sBTC (the pool's x is sBTC). Takes
;; the input, pays exactly the router's minimum (one unit when zero).
(use-trait ft-trait .sip-010-trait.sip-010-trait)

(define-public (swap-x-for-y
    (pool principal)
    (x-token <ft-trait>)
    (y-token <ft-trait>)
    (x-amount uint)
    (min-dy uint)
  )
  (let ((out (if (> min-dy u0) min-dy u1)) (user tx-sender))
    (asserts! (> x-amount u0) (err u1001))
    (try! (contract-call? .mock-ft transfer x-amount user current-contract none))
    (try! (as-contract? ((with-stx out))
      (try! (stx-transfer? out current-contract user))))
    (ok out)))

(define-public (swap-y-for-x
    (pool principal)
    (x-token <ft-trait>)
    (y-token <ft-trait>)
    (y-amount uint)
    (min-dx uint)
  )
  (let ((out (if (> min-dx u0) min-dx u1)) (user tx-sender))
    (asserts! (> y-amount u0) (err u1001))
    (try! (stx-transfer? y-amount user current-contract))
    (try! (as-contract? ((with-ft .mock-ft "mock-ft" out))
      (try! (contract-call? .mock-ft transfer out current-contract user none))))
    (ok out)))
