;; ============================================================================
;; RENDEZVOUS ADD-ON for jing-core-v5 (registry + equity ledger), appended to
;; the market-on-core target (tests/rv/build.sh section 2g)
;; ============================================================================
;; The v6 fuzz market in that manifest is bound to the REAL core-v5 and
;; registered in it by the rv-core-register wrapper, so every market action reaches the core's
;; log-* endpoints and moves the equity ledger: credit on deposit, debit on
;; refund / withdraw / cleared / matched, the pause gate on deposits,
;; matches and settlements, never on cancels. The core cannot be the RV
;; target itself (it would call the market, which calls it: a cycle), so
;; its admin paths get wrappers here and its ledger gets invariants that
;; read it. tx-sender is the RV account through the wrapper, which is what
;; the core's owner checks look at.
;; ============================================================================

;; the market registers itself (the real register wants a code hash no
;; account has); until RV picks this once, every market write is u5001
(define-public (rv-core-register)
  (contract-call? .jing-core-v5 rv-register current-contract))

(define-public (rv-core-pause)
  (contract-call? .jing-core-v5 pause))
(define-public (rv-core-unpause)
  (contract-call? .jing-core-v5 unpause))
(define-public (rv-core-propose-owner (who (optional principal)))
  (contract-call? .jing-core-v5 propose-owner who))
(define-public (rv-core-accept-owner)
  (contract-call? .jing-core-v5 accept-owner))
(define-public (rv-core-set-verified (who principal))
  (contract-call? .jing-core-v5 set-verified-contract who))

(define-private (rv-core-equity (a principal))
  (contract-call? .jing-core-v5 get-token-equity .mock-ft a))
(define-private (rv-core-equity-fold (a principal) (acc uint))
  (+ acc (rv-core-equity a)))

;; the account's position here: both sides are mock-ft, so its equity
;; bucket is live-x + live-y + parked-x + parked-y
(define-private (rv-core-position (a principal))
  (let ((cycle (var-get current-cycle)))
    (+ (get-token-x-deposit cycle a)
       (get-token-y-deposit cycle a)
       (get-token-x-parked a)
       (get-token-y-parked a))))

(define-private (rv-core-equity-off (a principal))
  (not (is-eq (rv-core-equity a) (rv-core-position a))))

;; ============================================================================
;; C1: LEDGER CONSERVATION. The token's total equity equals the sum of the
;; accounts' buckets. credit and debit write both maps; debit clamps at the
;; bucket; a path writing one map without the other trips this.
;; ============================================================================

(define-read-only (invariant-core-total-equity-eq-sum)
  (is-eq (contract-call? .jing-core-v5 get-total-token-equity .mock-ft)
         (fold rv-core-equity-fold RV-ACCOUNTS u0)))

;; ============================================================================
;; C2: EQUITY TRACKS THE MARKET. Every account's bucket equals its position
;; (live + parked, both sides). Deposits credit; refunds, withdrawals,
;; cleared and matched amounts debit; parks and rolls move nothing. A
;; market path that moves funds without the matching log, or a log that
;; moves the wrong amount, shows here.
;; ============================================================================

(define-read-only (invariant-core-equity-tracks-market)
  (is-eq (len (filter rv-core-equity-off RV-ACCOUNTS)) u0))

;; ============================================================================
;; C3: paused implies paused-at set and not in the future.
;;
;; NOT an invariant, tried and dropped 2026-09-15: "the pending owner is
;; never the current owner". propose-owner takes any principal and the
;; core does not refuse the owner proposing itself (nor does the ladder);
;; accepting is then a no-op. Harmless, and RV found it inside 1000 runs.
;; ============================================================================

(define-read-only (invariant-core-paused-at-consistent)
  (or (not (contract-call? .jing-core-v5 is-paused))
      (and (> (contract-call? .jing-core-v5 get-paused-at) u0)
           (<= (contract-call? .jing-core-v5 get-paused-at) burn-block-height))))

(define-public (test-drive-core-register)
  (match (rv-core-register) r (ok true) e (ok false)))
