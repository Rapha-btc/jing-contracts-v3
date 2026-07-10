;; ============================================================================
;; RENDEZVOUS INVARIANTS for rfq-sbtc-stx-jing-v2
;; ============================================================================
;; Fuzz-build relaxations (tests/rv/build.sh), so RV can reach the lifecycle:
;;   - SIP-018 sig check disabled (the stxer harness covers sig parity and
;;     the auth reverts deterministically)
;;   - ref-timestamp no-future/freshness asserts disabled (wall-clock windows
;;     are meaningless against RV's random uints)
;;   - get-native-price replaced by a fixed mid (simnet has no miner commits)
;;   - whitelist default flipped to true (any sender may attempt fix-price;
;;     set-mm-whitelist false still blocks, so the gate stays exercised)
;;   - with-ft asset name pinned to "mock-ft" so fulfill/reclaim can move
;;     escrow (RV's random x-name would never match the allowance)
;;
;; What RV actually exercises: open-rfq (escrow in), reclaim after OPEN_TTL
;; (escrow out; simnet burn height advances 1 per call so 6 calls = expiry),
;; operator setters, pause, whitelist flips. fix-price/fulfill fire when
;; random args satisfy band + drift + funds constraints (rare but reachable).
;; The crown invariant is escrow conservation: actual token balance vs the
;; sum of open rfq escrows -- any state/funds desync trips it.
;; ============================================================================

(define-map context (string-ascii 100) { called: uint })

(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))

(define-constant RV_SCAN_IDS (list
  u0 u1 u2 u3 u4 u5 u6 u7 u8 u9
  u10 u11 u12 u13 u14 u15 u16 u17 u18 u19
))

(define-private (rv-open-escrow (id uint) (acc uint))
  (match (map-get? rfqs id)
    rfq (if (get open rfq) (+ acc (get sbtc-in rfq)) acc)
    acc
  ))

;; ============================================================================
;; INVARIANT 1: escrow conservation
;; ============================================================================
;; The contract's actual token-x balance equals the sum of sbtc-in across
;; OPEN rfqs. Catches any path that closes an rfq without moving funds, moves
;; funds without closing, double-fulfills, or reclaims a fulfilled rfq.
;; Vacuous only if fuzz opens more rfqs than the scan bound (never in
;; practice: runs are short).

(define-read-only (invariant-escrow-conservation)
  (or (> (var-get next-rfq-id) u20)
    (is-eq
      (unwrap-panic (contract-call? .mock-ft get-balance current-contract))
      (fold rv-open-escrow RV_SCAN_IDS u0)
    )))

;; ============================================================================
;; INVARIANT 2: rfq ids are dense and monotonic
;; ============================================================================
;; Nothing may exist at next-rfq-id: ids are assigned sequentially and never
;; reused, which is what makes a signed auth (binding rfq-id) one-shot.

(define-read-only (invariant-next-id-unused)
  (is-none (map-get? rfqs (var-get next-rfq-id))))

;; ============================================================================
;; INVARIANT 3: per-rfq state consistency
;; ============================================================================
;; For every rfq: winner/fixed-stx-out/fixed-oracle-price are set atomically
;; (all some or all none); escrow and client floor are positive; and any
;; fixed amount honors the client's min-stx-out.

(define-private (rv-rfq-consistent (id uint) (acc bool))
  (and acc
    (match (map-get? rfqs id)
      rfq (and
        (is-eq (is-some (get winner rfq)) (is-some (get fixed-stx-out rfq)))
        (is-eq (is-some (get winner rfq)) (is-some (get fixed-oracle-price rfq)))
        (> (get sbtc-in rfq) u0)
        (> (get min-stx-out rfq) u0)
        (match (get fixed-stx-out rfq)
          out (>= out (get min-stx-out rfq))
          true
        ))
      true
    )))

(define-read-only (invariant-rfq-state-consistent)
  (fold rv-rfq-consistent RV_SCAN_IDS true))

;; ============================================================================
;; INVARIANT 4: calibration stays within its hard bounds
;; ============================================================================

(define-read-only (invariant-calibration-bounded)
  (and
    (>= (var-get commit-efficiency-bps) MIN_EFFICIENCY_BPS)
    (<= (var-get commit-efficiency-bps) MAX_EFFICIENCY_BPS)
  ))

;; ============================================================================
;; INVARIANT 5: operator is never the burn principal
;; ============================================================================
;; set-operator takes any principal from the current operator; burning it
;; would brick pause/whitelist/calibration forever.

(define-read-only (invariant-operator-not-burn)
  (not (is-eq (var-get operator) 'SP000000000000000000002Q6VF78)))
