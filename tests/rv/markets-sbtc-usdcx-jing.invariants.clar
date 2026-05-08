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

;; ============================================================================
;; INVARIANT 13: contract token balance equals sum of cycle-totals
;;
;; THE strongest state-conservation check. The market's actual mock-ft balance
;; (= what's been deposited minus what's been refunded) must equal the sum of
;; total-token-{x,y} across all cycles. A bug where any code path moves a
;; depositor's funds without updating the corresponding cycle's totals (or
;; vice versa) breaks this. The cancel-cycle x small-share-roll bug fixed on
;; 2026-05-07 had list/totals/map all internally consistent at *wrong* values,
;; so the simpler list-sum-matches-totals invariants couldn't catch it -- but
;; the rolled depositors' tokens were still in the contract, making
;; balance > sum-of-cycle-totals. This invariant catches that class.
;;
;; mock-ft is used for both x and y sides, so balance covers both.
;;
;; Settle paths are not exercised by RV (Pyth traits have no impls), so the
;; balance-shrink that legitimate settle would cause never happens here. If a
;; future config gets settle running, this invariant needs to also subtract
;; settled-out amounts (or get scoped to pre-settle cycles only).
;; ============================================================================

(define-private (rv-sum-y-fold (cycle uint) (acc uint))
  (+ acc (get total-token-y (get-cycle-totals cycle))))

(define-private (rv-sum-x-fold (cycle uint) (acc uint))
  (+ acc (get total-token-x (get-cycle-totals cycle))))

;; Range covers cycles 0..199 -- 500-run RV sweeps can advance the cycle
;; counter > 30 times via cancel-cycle, so the range needs headroom or a
;; falsely-failing invariant fires (sum misses cycles past the range
;; while balance reflects all of them).
(define-constant RV-CYCLE-RANGE
  (list u0 u1 u2 u3 u4 u5 u6 u7 u8 u9
        u10 u11 u12 u13 u14 u15 u16 u17 u18 u19
        u20 u21 u22 u23 u24 u25 u26 u27 u28 u29
        u30 u31 u32 u33 u34 u35 u36 u37 u38 u39
        u40 u41 u42 u43 u44 u45 u46 u47 u48 u49
        u50 u51 u52 u53 u54 u55 u56 u57 u58 u59
        u60 u61 u62 u63 u64 u65 u66 u67 u68 u69
        u70 u71 u72 u73 u74 u75 u76 u77 u78 u79
        u80 u81 u82 u83 u84 u85 u86 u87 u88 u89
        u90 u91 u92 u93 u94 u95 u96 u97 u98 u99
        u100 u101 u102 u103 u104 u105 u106 u107 u108 u109
        u110 u111 u112 u113 u114 u115 u116 u117 u118 u119
        u120 u121 u122 u123 u124 u125 u126 u127 u128 u129
        u130 u131 u132 u133 u134 u135 u136 u137 u138 u139
        u140 u141 u142 u143 u144 u145 u146 u147 u148 u149
        u150 u151 u152 u153 u154 u155 u156 u157 u158 u159
        u160 u161 u162 u163 u164 u165 u166 u167 u168 u169
        u170 u171 u172 u173 u174 u175 u176 u177 u178 u179
        u180 u181 u182 u183 u184 u185 u186 u187 u188 u189
        u190 u191 u192 u193 u194 u195 u196 u197 u198 u199))

(define-read-only (invariant-balance-eq-cycle-totals)
  (let (
    (sum-y (fold rv-sum-y-fold RV-CYCLE-RANGE u0))
    (sum-x (fold rv-sum-x-fold RV-CYCLE-RANGE u0))
    (bal (unwrap-panic (contract-call? .mock-ft get-balance 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.markets-sbtc-usdcx-jing)))
  )
    (is-eq bal (+ sum-x sum-y))))
