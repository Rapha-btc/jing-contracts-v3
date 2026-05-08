;; Mock Bitflow xyk-core for RV vault-sbtc-stx fuzzing. Returns the
;; received-amount as a uint (matching real xyk-core's signature, which
;; differs from DLMM router's tuple return).
(use-trait ft-trait .sip-010-trait.sip-010-trait)

(define-public (swap-x-for-y
    (pool principal)
    (token-x <ft-trait>)
    (token-y <ft-trait>)
    (amount uint)
    (min-out uint))
  (begin (asserts! true (err u0)) (ok min-out)))

(define-public (swap-y-for-x
    (pool principal)
    (token-x <ft-trait>)
    (token-y <ft-trait>)
    (amount uint)
    (min-out uint))
  (begin (asserts! true (err u0)) (ok min-out)))
