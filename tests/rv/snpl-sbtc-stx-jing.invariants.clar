;; ============================================================================
;; RENDEZVOUS INVARIANTS for snpl-sbtc-stx-jing
;; ============================================================================
;; SNPL (swap-now-pay-later) is the loan state machine. Public functions:
;;   - initialize (one-shot, borrower-only)
;;   - set-reserve (borrower, no active loan)
;;   - borrow (borrower, no active loan, reserve match) -> creates a loan,
;;     sets active-loan, increments next-loan-id
;;   - swap-deposit (borrower, status OPEN, before deadline)
;;   - cancel-swap (borrower OR past-deadline)
;;   - set-swap-limit (borrower, OPEN, before deadline)
;;   - repay (borrower, OPEN, reserve match, no jing balance) -> REPAID,
;;     clears active-loan
;;   - seize (anyone, OPEN, deadline reached, reserve match, no jing
;;     balance) -> SEIZED, clears active-loan
;;
;; The state machine has rich transitions worth fuzzing:
;;   STATUS-OPEN -> STATUS-REPAID (via repay)
;;   STATUS-OPEN -> STATUS-SEIZED (via seize)
;;   no-loan     -> active (via borrow)
;;   active      -> no-loan (via repay/seize)
;;
;; RV picks random principals; only deployer-as-tx-sender progresses
;; borrower-only paths. seize is permissionless past-deadline so other
;; principals can drive that branch once the deadline elapses.
;; ============================================================================

(define-map context (string-ascii 100) { called: uint })

(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))

;; ============================================================================
;; INVARIANT 1: next-loan-id starts at 1 and only grows
;; ============================================================================
;; Strong stateful version requires a side-channel data-var; read-only
;; invariants can't update state. For now we check the floor: it never
;; goes below the genesis value u1.

(define-read-only (invariant-loan-id-floor)
  (>= (var-get next-loan-id) u1))

;; ============================================================================
;; INVARIANT 2: active-loan status consistency
;; ============================================================================
;; If active-loan = (some N), then loans[N] exists and has status =
;; STATUS-OPEN. If active-loan = none, the most-recent loan (next-loan-id - 1)
;; is either nonexistent or has status REPAID/SEIZED.

(define-read-only (invariant-active-loan-is-open)
  (match (var-get active-loan)
    loan-id (match (map-get? loans loan-id)
              loan (is-eq (get status loan) STATUS-OPEN)
              false)
    true))

;; ============================================================================
;; INVARIANT 3: status terminality
;; ============================================================================
;; Once a loan transitions to REPAID or SEIZED, it must never go back to
;; OPEN. RV may try to call repay/seize on already-resolved loans;
;; ERR-BAD-STATUS prevents the call from progressing. We can't easily
;; observe history in read-only context; this invariant checks the
;; structural property that for the most-recently-issued loan, if its
;; status is non-OPEN, the active-loan var doesn't point to it.

(define-read-only (invariant-resolved-not-active)
  (let ((last-id (- (var-get next-loan-id) u1)))
    (if (> last-id u0)
      (match (map-get? loans last-id)
        loan (if (or (is-eq (get status loan) STATUS-REPAID)
                     (is-eq (get status loan) STATUS-SEIZED))
               (is-none (var-get active-loan))
               true)
        true)
      true)))

;; ============================================================================
;; INVARIANT 4: payoff covers notional plus interest
;; ============================================================================
;; For every loan, payoff-sbtc >= notional-sbtc. Interest is non-negative.
;; A bug in the borrow's payoff calculation would break this.

(define-read-only (invariant-payoff-ge-notional)
  (let ((last-id (- (var-get next-loan-id) u1)))
    (if (> last-id u0)
      (match (map-get? loans last-id)
        loan (>= (get payoff-sbtc loan) (get notional-sbtc loan))
        true)
      true)))

;; ============================================================================
;; INVARIANT 5: current-reserve never reverts to SAINT after init
;; ============================================================================
;; Once initialize() succeeds, current-reserve is set to a real reserve
;; principal. set-reserve can change it but only to another real
;; principal (the trait reference is the new reserve). It must never
;; revert to SAINT (0x...SP000).

(define-read-only (invariant-reserve-not-saint-after-init)
  ;; If initialize hasn't fired, reserve = SAINT. If it has, reserve != SAINT.
  ;; We can't tell from state alone whether init has fired (no `initialized`
  ;; flag), but: in the build version this is set at deploy time to a real
  ;; principal, so we can hardcode the check that the reserve is non-SAINT.
  (let ((reserve (var-get current-reserve)))
    (not (is-eq reserve 'SP000000000000000000002Q6VF78))))
