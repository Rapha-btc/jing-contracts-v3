;; Mock Bitflow DLMM router for RV vault fuzzing. Stubs the two swap
;; endpoints the vault uses. RV won't reach these (signed-intent gated),
;; but the contract must type-check.
(use-trait ft-trait .sip-010-trait.sip-010-trait)

(define-public (swap-x-for-y-simple-multi
    (pool principal)
    (token-x <ft-trait>)
    (token-y <ft-trait>)
    (amount uint)
    (min-out uint))
  (begin (asserts! true (err u0)) (ok { in: amount, out: min-out })))

(define-public (swap-y-for-x-simple-multi
    (pool principal)
    (token-x <ft-trait>)
    (token-y <ft-trait>)
    (amount uint)
    (min-out uint))
  (begin (asserts! true (err u0)) (ok { in: amount, out: min-out })))
