;; Shared interface: every rung supports deposits, withdrawals, and claims.
;; Existing rung implementations satisfy it without changing their code.
(define-trait rung-trait
  (
    (deposit (uint (buff 8192)) (response bool uint))
    (withdraw (uint) (response bool uint))
    (claim () (response bool uint))
  )
)
