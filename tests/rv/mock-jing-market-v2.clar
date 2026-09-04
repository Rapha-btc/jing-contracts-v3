;; Mock v2 jing market for RV vault-v2 fuzzing. Stubs the endpoints
;; vault-sbtc-{stx,usdcx}-v2 calls into, with the v2 signatures (deposits
;; and set-limits carry a vaa buffer; reprice-or-swap and swap return the
;; settlement result tuple). All return (ok ...) without real ledger
;; moves -- mock-ft handles those via the vault's direct contract-call?
;; on its trait param, not through these stubs.
;;
;; get-taker-rebate-bps returns the production u20 so the v2 vault's
;; initialize rebate-mismatch assert (ERR_REBATE_MISMATCH u6023) passes.
(use-trait ft-trait .sip-010-trait.sip-010-trait)

(define-constant ZERO-RESULT {
  token-x-received: u0,
  token-y-rolled: u0,
  token-y-received: u0,
  token-x-rolled: u0,
  rebate-refunded: u0,
})

(define-read-only (get-taker-rebate-bps) u20)

(define-public (deposit-token-x
  (amount uint) (limit-price uint) (vaa (buff 8192))
  (t <ft-trait>) (asset-name (string-ascii 128)))
  (begin (asserts! true (err u0)) (ok amount)))

(define-public (deposit-token-y
  (amount uint) (limit-price uint) (vaa (buff 8192))
  (t <ft-trait>) (asset-name (string-ascii 128)))
  (begin (asserts! true (err u0)) (ok amount)))

(define-public (cancel-token-x-deposit
  (t <ft-trait>) (asset-name (string-ascii 128)))
  (begin (asserts! true (err u0)) (ok u0)))

(define-public (cancel-token-y-deposit
  (t <ft-trait>) (asset-name (string-ascii 128)))
  (begin (asserts! true (err u0)) (ok u0)))

(define-public (reprice-or-swap-token-x
  (limit-price uint) (vaa (buff 8192))
  (tx-trait <ft-trait>) (tx-name (string-ascii 128))
  (ty-trait <ft-trait>) (ty-name (string-ascii 128)))
  (begin (asserts! true (err u0)) (ok ZERO-RESULT)))

(define-public (reprice-or-swap-token-y
  (limit-price uint) (vaa (buff 8192))
  (tx-trait <ft-trait>) (tx-name (string-ascii 128))
  (ty-trait <ft-trait>) (ty-name (string-ascii 128)))
  (begin (asserts! true (err u0)) (ok ZERO-RESULT)))

(define-public (swap
  (amount uint) (limit-price uint) (vaa (buff 8192))
  (tx-trait <ft-trait>) (tx-name (string-ascii 128))
  (ty-trait <ft-trait>) (ty-name (string-ascii 128))
  (deposit-x bool))
  (begin (asserts! true (err u0)) (ok ZERO-RESULT)))

(define-public (set-token-x-limit (limit-price uint) (vaa (buff 8192)))
  (begin (asserts! true (err u0)) (ok true)))

(define-public (set-token-y-limit (limit-price uint) (vaa (buff 8192)))
  (begin (asserts! true (err u0)) (ok true)))

(define-read-only (get-current-cycle) u0)

(define-read-only (get-token-x-deposit (cycle uint) (depositor principal)) u0)

(define-read-only (get-token-y-deposit (cycle uint) (depositor principal)) u0)
