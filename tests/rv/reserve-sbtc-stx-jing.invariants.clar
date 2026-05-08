;; ============================================================================
;; RENDEZVOUS INVARIANTS for reserve-sbtc-stx-jing
;; ============================================================================
;; The reserve is the lender-side capital pool. Public functions:
;;   Lender-only: initialize, supply, withdraw-sbtc, withdraw-stx,
;;     open-credit-line, set-credit-line-{cap,interest}, close-credit-line,
;;     set-paused, set-min-sbtc-draw
;;   snpl-only (gated by contract-caller having an open line): draw,
;;     notify-return
;;
;; Lender-only paths fire when RV picks deployer (~1/N). snpl-only paths
;; require contract-caller to be a contract that has a credit line --
;; RV's random wallet principals don't, so they always hit
;; ERR-NO-CREDIT-LINE. Pre-creating a line for a known mock-snpl in the
;; build helps but RV still calls from wallet senders, not the snpl.
;;
;; Net: structural invariants on the lender state are checkable;
;; conservation invariants on outstanding-vs-balance need stronger
;; instrumentation than read-only Clarity allows.
;; ============================================================================

(define-map context (string-ascii 100) { called: uint })

(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))

;; ============================================================================
;; INVARIANT 1: initialized only goes false -> true
;; ============================================================================

(define-read-only (invariant-initialized-stays-set)
  (var-get initialized))

;; ============================================================================
;; INVARIANT 2: min-sbtc-draw stays positive
;; ============================================================================
;; set-min-sbtc-draw asserts > u0 on input, so this should always hold.
;; Catches a regression where a future change allows zero (which would
;; make `(asserts! (>= amount min) ERR-INVALID-AMOUNT)` in draw a no-op
;; and let zero-amount draws succeed).

(define-read-only (invariant-min-draw-positive)
  (> (var-get min-sbtc-draw) u0))

;; ============================================================================
;; INVARIANT 3: known credit line outstanding never exceeds cap
;; ============================================================================
;; The reserve enforces (asserts! (<= new-outstanding cap) ERR-OVER-LIMIT)
;; on every draw. We pre-seed a credit line for the mock-snpl in the
;; build, so we can read it back here and verify the property holds for
;; that one principal. If RV finds a sequence where outstanding > cap,
;; the over-limit gate has a bug.

(define-read-only (invariant-known-line-outstanding-le-cap)
  (match (map-get? credit-lines 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.mock-snpl)
    line (<= (get outstanding-sbtc line) (get cap-sbtc line))
    true))
