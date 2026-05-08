;; ============================================================================
;; RENDEZVOUS INVARIANTS for jing-core
;; ============================================================================
;; jing-core is the protocol registry + equity ledger. Public surface:
;;   - Admin (owner-only): set-verified-contract, pause, unpause,
;;     set-contract-owner
;;   - Registered-callers only: register, all log-* (vault + market events
;;     that drive credit/debit on the equity ledger)
;;
;; What RV exercises in practice:
;;   - Admin paths fire when RV picks deployer (~1/N)
;;   - register fails for any random caller (contract-hash? on a wallet
;;     returns none -> u5002 ERR_INVALID_CONTRACT_HASH)
;;   - log-* fire from RV's wallet senders -> u5001 ERR_NOT_AUTHORIZED
;;     because is-registered(contract-caller) is false
;;
;; This means the equity ledger conservation invariant (total-equity ==
;; sum of per-owner buckets) can't be exercised under RV without a
;; registered-helper contract that proxies log-* calls. Documented as a
;; follow-up. Structural invariants below catch admin-path regressions.
;; ============================================================================

(define-map context (string-ascii 100) { called: uint })

(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))

;; ============================================================================
;; INVARIANT 1: paused state implies paused-at is set
;; ============================================================================
;; pause() sets paused=true AND paused-at=stacks-block-height. unpause()
;; sets paused=false but leaves paused-at as-is (so the timelock check
;; on the next pause cycle starts fresh). A bug where pause forgets to
;; set paused-at would let unpause fire immediately (timelock check
;; computes `(>= burn-block-height (+ paused-at TIMELOCK_BURN_BLOCKS))`,
;; which trivially holds when paused-at = u0).

(define-read-only (invariant-paused-implies-at-set)
  (if (var-get paused)
    (> (var-get paused-at) u0)
    true))

;; ============================================================================
;; INVARIANT 2: contract-owner is never the zero principal
;; ============================================================================
;; set-contract-owner takes any principal arg from the current owner.
;; Setting it to the burn principal SP000... would brick the protocol
;; (no admin actions could ever fire again). The contract doesn't check
;; this -- worth catching if a future change makes the burn principal
;; possible to reach.

(define-read-only (invariant-owner-not-burn)
  (not (is-eq (var-get contract-owner) 'SP000000000000000000002Q6VF78)))

;; ============================================================================
;; INVARIANT 3: SBTC equity floor
;; ============================================================================
;; For the known sBTC token, the deployer's bucket and total-equity must
;; always satisfy `bucket <= total`. A bug in credit/debit that updates
;; one map without the other would break this. Trivial in the no-call
;; case (both 0); meaningful once any log-* path fires.
;;
;; SBTC_TOKEN constant in jing-core points to the mainnet sBTC principal.
;; In simnet that contract isn't deployed; equity reads default to u0
;; for both the bucket and the total, so this invariant holds trivially
;; until a log-* call lands. Recommend extending with a registered-
;; helper contract that proxies log-deposit calls so RV can drive real
;; equity moves.

(define-read-only (invariant-sbtc-equity-floor)
  (<= (get-token-equity SBTC_TOKEN 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM)
      (get-total-token-equity SBTC_TOKEN)))

;; ============================================================================
;; INVARIANT 4: pause is not stuck in unrecoverable state
;; ============================================================================
;; If paused = true, the contract-owner (which is not the burn principal,
;; per invariant 2) is theoretically able to call unpause once the
;; timelock elapses. The structural property is: paused implies
;; (eventually unpausable) -- which simplifies to checking that the
;; timelock parameters are sane.
;;
;; TIMELOCK_BURN_BLOCKS is constant u144. paused-at is a uint with no
;; upper bound. Once paused-at + 144 has elapsed, unpause fires. So as
;; long as block-height keeps advancing, pause is recoverable.
;;
;; This is more documentation than active check. The actual liveness
;; property is sound by construction.

(define-read-only (invariant-pause-recoverable)
  ;; True if either not paused, or pause-at + timelock <= some future
  ;; block. We can't predict the future, so just verify paused-at +
  ;; timelock doesn't overflow uint128.
  (let ((paused-at-val (var-get paused-at)))
    (>= (+ paused-at-val u144) paused-at-val)))
