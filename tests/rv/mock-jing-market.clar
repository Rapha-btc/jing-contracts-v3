;; Mock jing market for RV vault fuzzing. Stubs out the four endpoints
;; the vault calls into. All return (ok ...) without doing real ledger
;; moves -- mock-ft handles those via the vault's direct contract-call?
;; on its trait param, not through these stubs.
;;
;; Important: deposit-token-{x,y} in the real market would *receive*
;; tokens from the caller. Our mock doesn't take them, so for vault
;; balance accounting in invariants we treat market-deposits as no-op
;; from the vault's perspective (mock-ft balance unchanged).
(use-trait ft-trait .sip-010-trait.sip-010-trait)

(define-public (deposit-token-x
  (amount uint) (limit-price uint)
  (t <ft-trait>) (asset-name (string-ascii 128)))
  (begin (asserts! true (err u0)) (ok amount)))

(define-public (deposit-token-y
  (amount uint) (limit-price uint)
  (t <ft-trait>) (asset-name (string-ascii 128)))
  (begin (asserts! true (err u0)) (ok amount)))

(define-public (cancel-token-x-deposit
  (t <ft-trait>) (asset-name (string-ascii 128)))
  (begin (asserts! true (err u0)) (ok u0)))

(define-public (cancel-token-y-deposit
  (t <ft-trait>) (asset-name (string-ascii 128)))
  (begin (asserts! true (err u0)) (ok u0)))

;; snpl reads these:
(define-read-only (get-current-cycle) u0)

(define-read-only (get-token-x-deposit (cycle uint) (depositor principal)) u0)

(define-read-only (get-token-y-deposit (cycle uint) (depositor principal)) u0)

(define-public (set-token-x-limit (limit-price uint))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (set-token-y-limit (limit-price uint))
  (begin (asserts! true (err u0)) (ok true)))
