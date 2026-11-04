;; Test-only stand-in for SP120...usdcx: a plain SIP-010-shaped token
;; anyone can mint (the escrow only ever transfers it).
(define-fungible-token usdcx-token)

(define-public (transfer
    (amount uint)
    (sender principal)
    (recipient principal)
    (memo (optional (buff 34)))
  )
  (begin
    (asserts! (is-eq tx-sender sender) (err u4))
    (ft-transfer? usdcx-token amount sender recipient)
  )
)

(define-public (mint
    (amount uint)
    (to principal)
  )
  (ft-mint? usdcx-token amount to)
)

(define-read-only (get-balance (who principal))
  (ok (ft-get-balance usdcx-token who))
)
