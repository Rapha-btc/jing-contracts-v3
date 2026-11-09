;; stx-short-rate-model
;;
;; Deterministic borrow rate for the STX short protocol. Read-only math only;
;; the vault reads it once at open (and once per extend) and stores the
;; result in the position, so a parameter change never touches a live loan.
;;
;; rate (APR, bps) = clamp(htb(util) + lev-premium(lev), floor, cap)
;;   htb, tiered on post-borrow utilization:
;;     util <  50%   general collateral (GC): gc-bps
;;     50% .. 80%    warm: linear gc-bps -> warm-bps
;;     80% .. 100%   special: linear warm-bps -> special-bps
;;   lev-premium: 0 at <= 1x, linear to lev-premium-bps at 3x
;; interest (USDCx) = ceil(notional * rate * tenor / (10000 * YEAR))
;;
;; Owner can tune the curve within hard bounds; it cannot touch funds (this
;; contract holds none).

(define-constant ERR_NOT_OWNER (err u2001))
(define-constant ERR_BAD_PARAM (err u2002))

(define-constant BPS u10000)
(define-constant YEAR_SECS u31536000)
(define-constant GC_KINK u5000)
(define-constant SPECIAL_KINK u8000)
(define-constant LEV_1X u10000)
(define-constant LEV_3X u30000)
;; hard bounds on every tunable (APR bps)
(define-constant MAX_RATE_BPS u50000)
(define-constant MAX_LEV_PREMIUM_BPS u5000)

(define-data-var owner principal tx-sender)
(define-data-var gc-bps uint u500)
(define-data-var warm-bps uint u2000)
(define-data-var special-bps uint u10000)
(define-data-var floor-bps uint u200)
(define-data-var cap-bps uint u20000)
(define-data-var lev-premium-bps uint u1000)

(define-read-only (get-params)
  {
    owner: (var-get owner),
    gc-bps: (var-get gc-bps),
    warm-bps: (var-get warm-bps),
    special-bps: (var-get special-bps),
    floor-bps: (var-get floor-bps),
    cap-bps: (var-get cap-bps),
    lev-premium-bps: (var-get lev-premium-bps),
  }
)

(define-private (min-u
    (a uint)
    (b uint)
  )
  (if (< a b)
    a
    b
  )
)

(define-private (max-u
    (a uint)
    (b uint)
  )
  (if (> a b)
    a
    b
  )
)

;; hard-to-borrow fee for a utilization in bps (values above 100% clamp)
(define-read-only (htb-bps (util-bps uint))
  (let (
      (u (min-u util-bps BPS))
      (gc (var-get gc-bps))
      (warm (var-get warm-bps))
      (special (var-get special-bps))
    )
    (if (< u GC_KINK)
      gc
      (if (<= u SPECIAL_KINK)
        (+ gc (/ (* (- warm gc) (- u GC_KINK)) (- SPECIAL_KINK GC_KINK)))
        (+ warm (/ (* (- special warm) (- u SPECIAL_KINK)) (- BPS SPECIAL_KINK)))
      )
    )
  )
)

(define-read-only (tier (util-bps uint))
  (if (< util-bps GC_KINK)
    "gc"
    (if (<= util-bps SPECIAL_KINK)
      "warm"
      "special"
    )
  )
)

(define-read-only (lev-premium (lev-bps uint))
  (if (<= lev-bps LEV_1X)
    u0
    (/ (* (var-get lev-premium-bps) (- (min-u lev-bps LEV_3X) LEV_1X))
      (- LEV_3X LEV_1X)
    )
  )
)

(define-read-only (get-rate-bps
    (util-bps uint)
    (lev-bps uint)
  )
  (min-u (var-get cap-bps)
    (max-u (var-get floor-bps) (+ (htb-bps util-bps) (lev-premium lev-bps)))
  )
)

;; upfront interest in USDCx for a notional (micro-USDCx), rounded up so a
;; position never borrows for free
(define-read-only (quote-interest
    (notional uint)
    (rate-bps uint)
    (tenor-secs uint)
  )
  (let ((num (* (* notional rate-bps) tenor-secs)))
    (if (is-eq num u0)
      u0
      (+ (/ (- num u1) (* BPS YEAR_SECS)) u1)
    )
  )
)

;; ---------- owner (bounded, no funds) ----------

(define-public (set-curve
    (gc uint)
    (warm uint)
    (special uint)
    (floor-rate uint)
    (cap-rate uint)
    (lev-prem uint)
  )
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR_NOT_OWNER)
    ;; monotone curve, floor <= cap, everything under the hard ceiling
    (asserts!
      (and
        (<= gc warm)
        (<= warm special)
        (<= special MAX_RATE_BPS)
      )
      ERR_BAD_PARAM
    )
    (asserts! (and (<= floor-rate cap-rate) (<= cap-rate MAX_RATE_BPS))
      ERR_BAD_PARAM
    )
    (asserts! (<= lev-prem MAX_LEV_PREMIUM_BPS) ERR_BAD_PARAM)
    (var-set gc-bps gc)
    (var-set warm-bps warm)
    (var-set special-bps special)
    (var-set floor-bps floor-rate)
    (var-set cap-bps cap-rate)
    (var-set lev-premium-bps lev-prem)
    (print {
      topic: "rate-curve",
      gc: gc,
      warm: warm,
      special: special,
      floor: floor-rate,
      cap: cap-rate,
      lev-premium: lev-prem,
    })
    (ok true)
  )
)

(define-public (set-owner (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR_NOT_OWNER)
    (ok (var-set owner new-owner))
  )
)
