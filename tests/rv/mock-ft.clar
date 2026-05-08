;; Mock SIP-010 fungible token for RV fuzzing only.
;;
;; Lies about ledger state: every transfer returns (ok true) and every
;; get-balance returns a huge number. This is intentional -- we're fuzzing
;; the market contract's STATE LOGIC (cycle totals, depositor lists, totals
;; conservation across rolls/cancels), not the FT layer. As long as transfer
;; succeeds, the market's deposit/cancel paths execute their full state
;; mutations and the invariants get exercised.
;;
;; Two distinct mock contracts (mock-ft-x, mock-ft-y) exist so initialize can
;; bind different principals to token-x and token-y, mirroring the production
;; sBTC/USDCx setup. The market's WRONG_TRAIT gate then has something
;; meaningful to enforce against random RV-passed traits.
(impl-trait .sip-010-trait.sip-010-trait)

(define-fungible-token mock-ft)

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (ok true))

(define-read-only (get-name)
  (ok "Mock-FT"))

(define-read-only (get-symbol)
  (ok "MOCK"))

(define-read-only (get-decimals)
  (ok u6))

(define-read-only (get-balance (who principal))
  (ok u1000000000000000000))

(define-read-only (get-total-supply)
  (ok u1000000000000000000))

(define-read-only (get-token-uri)
  (ok none))
