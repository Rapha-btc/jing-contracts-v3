;; ============================================================================
;; RENDEZVOUS INVARIANTS for jing-ladder (rung registry, band seats, owner)
;; ============================================================================
;; Append-only block; tests/rv/build.sh section 2e replaces the two
;; contract-hash? reads with a fixed buffer so RV's accounts can register as
;; rungs (the real gate compares code hashes no account has; the hash gate
;; itself is covered by the keyless stxer harnesses). Everything else is the
;; production code: side validation, one rung per (side, price) on the fixed
;; and guarded sides, seat claim / replace / retire and the count on the
;; band sides, the two-step owner handover.
;;
;; The rv-* wrappers fold RV's random side strings onto the six real sides
;; and the price onto four values so keys collide and every branch of
;; register (free key, taken key, replace on a band side) runs.
;; ============================================================================

(define-map context (string-ascii 100) { called: uint })

(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))

(define-constant RV-ACCOUNTS (list
  'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM
  'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5
  'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG
  'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC
  'ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND
  'ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB
  'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0
  'ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ
  'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP
  'STNHKEPYEPJ8ET55ZZ0M5A34J0R3N5FM2CMMMAZ6))

(define-constant RV-SIDES (list
  SIDE_BUY_STX SIDE_SELL_STX SIDE_BUY_PEG SIDE_SELL_PEG SIDE_BUY_BAND SIDE_SELL_BAND))

;; one in eight stays a junk side so ERR_BAD_SIDE keeps firing
(define-private (rv-side (raw uint))
  (if (is-eq (mod raw u8) u7)
    "junk"
    (unwrap-panic (element-at? RV-SIDES (mod raw u6)))))

(define-private (rv-key (raw uint))
  (mod raw u4))

;; ---------------------------------------------------------------------------
;; wrappers
;; ---------------------------------------------------------------------------

(define-public (rv-set-canonical (side uint) (contract principal))
  (set-canonical (rv-side side) contract))

(define-public (rv-register (side uint) (price uint))
  (register (rv-side side) (rv-key price) price))

(define-public (rv-register-unseated (side uint) (price uint))
  (register-unseated (rv-side side) (rv-key price) price))

(define-public (rv-retire-band (side uint) (spread uint))
  (retire-band (rv-side side) (rv-key spread)))

;; ---------------------------------------------------------------------------
;; readers
;; ---------------------------------------------------------------------------

(define-private (rv-band-x-holder (a principal)) (is-band-x a))
(define-private (rv-band-y-holder (a principal)) (is-band-y a))

;; registered on a fixed or guarded side but not the holder of its key:
;; impossible, those sides never replace
(define-private (rv-fixed-rung-displaced (a principal))
  (match (map-get? registered a)
    r (and (not (is-band-side (get side r)))
           (not (is-current a r)))
    false))

;; registered under a side that is not one of the six
(define-private (rv-bad-side-row (a principal))
  (match (map-get? registered a)
    r (not (valid-side (get side r)))
    false))

;; ============================================================================
;; 1-2: the band count on each side equals the number of accounts that
;; currently hold a seat there, and never exceeds the cap. Claim, replace,
;; retire and seat-band all touch the count and the keys separately; this
;; is the check that they stay in step.
;; ============================================================================

(define-read-only (invariant-band-x-count-matches-seats)
  (is-eq (get-band-count SIDE_BUY_BAND)
         (len (filter rv-band-x-holder RV-ACCOUNTS))))

(define-read-only (invariant-band-y-count-matches-seats)
  (is-eq (get-band-count SIDE_SELL_BAND)
         (len (filter rv-band-y-holder RV-ACCOUNTS))))

(define-read-only (invariant-band-counts-capped)
  (and (<= (get-band-count SIDE_BUY_BAND) (var-get max-band-per-side))
       (<= (get-band-count SIDE_SELL_BAND) (var-get max-band-per-side))))

;; ============================================================================
;; 3: a rung on a fixed or guarded side always holds its own key. Only band
;; sides replace a holder.
;; ============================================================================

(define-read-only (invariant-fixed-rungs-hold-their-key)
  (is-eq (len (filter rv-fixed-rung-displaced RV-ACCOUNTS)) u0))

;; ============================================================================
;; 4: every registered row carries a real side.
;; ============================================================================

(define-read-only (invariant-registered-sides-valid)
  (is-eq (len (filter rv-bad-side-row RV-ACCOUNTS)) u0))

;; ============================================================================
;; 5: a seat holder is registered on that side (a key never points at a
;; principal with no row, or with a row on another side).
;; ============================================================================

(define-private (rv-seat-without-row (a principal))
  (or
    (and (is-band-x a)
         (not (is-eq (some SIDE_BUY_BAND) (get side (map-get? registered a)))))
    (and (is-band-y a)
         (not (is-eq (some SIDE_SELL_BAND) (get side (map-get? registered a)))))))

(define-read-only (invariant-seat-holders-registered)
  (is-eq (len (filter rv-seat-without-row RV-ACCOUNTS)) u0))

;; ============================================================================
;; 6: the pending handover, when set, was proposed no later than now.
;; ============================================================================

(define-read-only (invariant-handover-proposed-in-the-past)
  (or (is-none (var-get pending-owner))
      (<= (var-get proposed-at) burn-block-height)))
