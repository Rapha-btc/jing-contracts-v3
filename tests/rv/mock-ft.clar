;; Mock SIP-010 fungible token for RV fuzzing only, with a real ledger.
;;
;; Why a real ledger? The market's deposit/cancel/refund paths actually
;; transfer tokens. To catch state-corruption bugs where the market's
;; cycle-totals desync from the actual tokens it holds (e.g. the
;; cancel-cycle x small-share-roll bug: rolled depositors' funds remain
;; in the contract but cycle-totals stops accounting for them), we need
;; an invariant that compares the market's actual balance to the sum of
;; its declared cycle-totals. That requires a real ledger.
;;
;; transfer auto-mints to sender if insufficient balance, so RV-generated
;; calls from random principals never fail at FT level. Recipient credit
;; is real -- this is how the market's balance grows from deposits and
;; shrinks from refunds, faithfully.
(impl-trait .sip-010-trait.sip-010-trait)

(define-fungible-token mock-ft)

(define-public (transfer
  (amount uint)
  (sender principal)
  (recipient principal)
  (memo (optional (buff 34))))
  (begin
    ;; Auto-mint sender if insufficient. Fuzz convenience; the recipient
    ;; credit is real so the market's balance reflects actual deposits.
    (let ((bal (ft-get-balance mock-ft sender)))
      (if (< bal amount)
        (try! (ft-mint? mock-ft (+ amount u1000000000000) sender))
        true))
    (ft-transfer? mock-ft amount sender recipient)))

(define-read-only (get-name) (ok "Mock-FT"))
(define-read-only (get-symbol) (ok "MOCK"))
(define-read-only (get-decimals) (ok u6))
(define-read-only (get-balance (who principal))
  (ok (ft-get-balance mock-ft who)))
(define-read-only (get-total-supply)
  (ok (ft-get-supply mock-ft)))
(define-read-only (get-token-uri) (ok none))
