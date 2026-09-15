;; Mock wstx facade for RV fuzzing of swap-router v5 (Velar's STX side):
;; a SIP-010 whose transfer moves real STX, like the mainnet facade. The
;; AMM mocks read `contract-of` on it to know the STX leg from the sBTC one.
(impl-trait .sip-010-trait.sip-010-trait)

(define-public (transfer
    (amount uint)
    (sender principal)
    (recipient principal)
    (memo (optional (buff 34)))
  )
  (begin
    (asserts! (is-eq tx-sender sender) (err u4))
    (stx-transfer? amount sender recipient)
  )
)

(define-read-only (get-name) (ok "wstx"))
(define-read-only (get-symbol) (ok "wSTX"))
(define-read-only (get-decimals) (ok u6))
(define-read-only (get-balance (who principal)) (ok (stx-get-balance who)))
(define-read-only (get-total-supply) (ok u0))
(define-read-only (get-token-uri) (ok none))
