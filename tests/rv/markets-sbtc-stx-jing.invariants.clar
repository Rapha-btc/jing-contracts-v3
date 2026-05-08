;; ============================================================================
;; RENDEZVOUS INVARIANTS for markets-sbtc-usdcx-jing
;; ============================================================================
;; Append-only block. The build script concatenates this onto the production
;; contract source to produce tests/rv/.build/markets-sbtc-usdcx-jing.clar
;; which is what `rv` actually loads. Production .clar stays clean.
;;
;; All invariants are read-only and named `invariant-*` so RV picks them up
;; automatically. They run after every random tx in the fuzz sequence and
;; must return `true`; any `false` is a falsified invariant -> bug found.
;; ============================================================================

;; RV-required context map + updater (RV calls update-context after every
;; SUT call to bump the counter, so invariants can read call counts).
(define-map context (string-ascii 100) { called: uint })

(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))

;; -------- Helper readers (private; can't shadow named imports) --------

(define-private (rv-y-amt-curr (d principal))
  (get-token-y-deposit (var-get current-cycle) d))

(define-private (rv-y-amt-next (d principal))
  (get-token-y-deposit (+ (var-get current-cycle) u1) d))

(define-private (rv-x-amt-curr (d principal))
  (get-token-x-deposit (var-get current-cycle) d))

(define-private (rv-x-amt-next (d principal))
  (get-token-x-deposit (+ (var-get current-cycle) u1) d))

(define-private (rv-and-bool (curr bool) (acc bool))
  (and curr acc))

(define-private (rv-y-positive-curr (d principal))
  (> (get-token-y-deposit (var-get current-cycle) d) u0))

(define-private (rv-y-positive-next (d principal))
  (> (get-token-y-deposit (+ (var-get current-cycle) u1) d) u0))

(define-private (rv-x-positive-curr (d principal))
  (> (get-token-x-deposit (var-get current-cycle) d) u0))

(define-private (rv-x-positive-next (d principal))
  (> (get-token-x-deposit (+ (var-get current-cycle) u1) d) u0))

;; ============================================================================
;; INVARIANT 1: per-cycle conservation (current cycle, y-side)
;;
;; sum of token-y-deposit over (token-y-depositors C) == cycle-totals[C].total-y
;;
;; Catches bugs where a code path updates the depositor list or totals without
;; updating the other (or updates the deposits map but not totals).
;; ============================================================================

(define-read-only (invariant-y-curr-list-sum-matches-totals)
  (let (
    (cycle (var-get current-cycle))
    (list-sum (fold + (map rv-y-amt-curr (get-token-y-depositors cycle)) u0))
    (total (get total-token-y (get-cycle-totals cycle)))
  )
    (is-eq list-sum total)))

;; ============================================================================
;; INVARIANT 2: per-cycle conservation (next cycle, y-side)
;;
;; Same property for cycle+1 -- catches drift across the cycle boundary
;; (small-share-roll, limit-roll, cancel-cycle all touch C+1).
;; ============================================================================

(define-read-only (invariant-y-next-list-sum-matches-totals)
  (let (
    (cycle (+ (var-get current-cycle) u1))
    (list-sum (fold + (map rv-y-amt-next (get-token-y-depositors cycle)) u0))
    (total (get total-token-y (get-cycle-totals cycle)))
  )
    (is-eq list-sum total)))

;; ============================================================================
;; INVARIANTS 3 & 4: x-side conservation (current and next cycle)
;; ============================================================================

(define-read-only (invariant-x-curr-list-sum-matches-totals)
  (let (
    (cycle (var-get current-cycle))
    (list-sum (fold + (map rv-x-amt-curr (get-token-x-depositors cycle)) u0))
    (total (get total-token-x (get-cycle-totals cycle)))
  )
    (is-eq list-sum total)))

(define-read-only (invariant-x-next-list-sum-matches-totals)
  (let (
    (cycle (+ (var-get current-cycle) u1))
    (list-sum (fold + (map rv-x-amt-next (get-token-x-depositors cycle)) u0))
    (total (get total-token-x (get-cycle-totals cycle)))
  )
    (is-eq list-sum total)))

;; ============================================================================
;; INVARIANTS 5-8: no ghosts -- every depositor in the list has balance > 0
;; (catches partial-cancel paths that delete the map entry but leave the list)
;; ============================================================================

(define-read-only (invariant-y-curr-no-ghosts)
  (fold rv-and-bool
        (map rv-y-positive-curr (get-token-y-depositors (var-get current-cycle)))
        true))

(define-read-only (invariant-y-next-no-ghosts)
  (fold rv-and-bool
        (map rv-y-positive-next (get-token-y-depositors (+ (var-get current-cycle) u1)))
        true))

(define-read-only (invariant-x-curr-no-ghosts)
  (fold rv-and-bool
        (map rv-x-positive-curr (get-token-x-depositors (var-get current-cycle)))
        true))

(define-read-only (invariant-x-next-no-ghosts)
  (fold rv-and-bool
        (map rv-x-positive-next (get-token-x-depositors (+ (var-get current-cycle) u1)))
        true))

;; ============================================================================
;; INVARIANT 9: settled cycle's cleared <= deposited at settle
;;
;; For any settled cycle, both x-cleared and y-cleared must be <= the cycle's
;; recorded totals at settle time. A clearing-formula bug could over-fill one
;; side and start to drain the contract; this catches it.
;;
;; Note: cycle-totals reflects state AT settle time only if no later mutation
;; occurred. Distribute does not change totals; only cancel/deposit do, and
;; those are blocked once settled. So this comparison is meaningful.
;; ============================================================================

(define-read-only (invariant-cleared-le-deposited-y)
  (let ((cycle (var-get current-cycle)))
    (if (> cycle u0)
      (match (get-settlement (- cycle u1))
        settlement
        (<= (get token-y-cleared settlement)
            (get total-token-y (get-cycle-totals (- cycle u1))))
        true)
      true)))

(define-read-only (invariant-cleared-le-deposited-x)
  (let ((cycle (var-get current-cycle)))
    (if (> cycle u0)
      (match (get-settlement (- cycle u1))
        settlement
        (<= (get token-x-cleared settlement)
            (get total-token-x (get-cycle-totals (- cycle u1))))
        true)
      true)))

;; ============================================================================
;; INVARIANT 10: bounded depositor lists
;;
;; len(depositors) <= MAX_DEPOSITORS at all times. Should be enforced by
;; as-max-len? but worth a belt-and-suspenders check.
;; ============================================================================

(define-read-only (invariant-y-depositor-list-bounded)
  (let ((cycle (var-get current-cycle)))
    (<= (len (get-token-y-depositors cycle)) MAX_DEPOSITORS)))

(define-read-only (invariant-x-depositor-list-bounded)
  (let ((cycle (var-get current-cycle)))
    (<= (len (get-token-x-depositors cycle)) MAX_DEPOSITORS)))
