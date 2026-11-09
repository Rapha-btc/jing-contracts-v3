;; stx-short-oracle-trait
;;
;; Price source for the STX short vault. `get-price` verifies a caller-supplied
;; signed update and returns the STX price in USDCx in the Jing market unit:
;; micro-USDCx per micro-STX x 1e8 (STX and USDCx both have 6 decimals), and
;; `at` = the older feed publish time in seconds. Public (not read-only)
;; because a real verifier may charge a fee and writes nothing else.
(define-trait stx-short-oracle-trait (
  (get-price
    ((buff 8192))
    (
      response       {
      price: uint,
      at: uint,
    }
      uint
    )
  )
))
