;; Mock Velar fees for RV fuzzing of swap-router v5: the mainnet defaults.
(define-read-only (get-fees)
  (ok {
    swap-fee: { num: u9970, den: u10000 },
    protocol-fee: { num: u2500, den: u10000 },
  })
)
