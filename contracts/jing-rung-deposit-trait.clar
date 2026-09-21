;; Minimal interface shared by existing buy/sell band rungs.
;; Their deposit functions satisfy this trait without changing the rung code.
(define-trait rung-deposit-trait
  ((deposit (uint (buff 8192)) (response bool uint)))
)

;; Existing rungs expose withdraw and claim with these exact signatures.
(define-trait rung-exit-trait
  (
    (withdraw (uint) (response bool uint))
    (claim () (response bool uint))
  )
)
