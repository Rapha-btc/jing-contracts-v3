;; Mock Bitflow DLMM core for RV fuzzing of swap-router v5: the bin price
;; ladder the router walks. Linear in the bin: initial * (1 + step * bin /
;; 10000), positive for the bins the router can reach.
(define-constant DIGITS (list u0 u1 u2 u3 u4 u5 u6 u7 u8 u9))
(define-private (factor-at (id uint)) (+ u25000000 (* u150000 id)))
(define-private (add-unit (d uint) (acc {base: uint, out: (list 1001 uint)}))
  (merge acc {out: (unwrap-panic (as-max-len?
    (append (get out acc) (factor-at (+ (get base acc) d))) u1001))}))
(define-private (add-ten (d uint) (acc {base: uint, out: (list 1001 uint)}))
  (merge acc {out: (get out (fold add-unit DIGITS
    {base: (+ (get base acc) (* u10 d)), out: (get out acc)}))}))
(define-private (add-hundred (d uint) (out (list 1001 uint)))
  (get out (fold add-ten DIGITS {base: (* u100 d), out: out})))
(define-constant FACTORS-15 (unwrap-panic (as-max-len?
  (append (fold add-hundred DIGITS (list)) (factor-at u1000)) u1001)))

(define-read-only (get-bin-factors-by-step (step uint))
  (ok (if (is-eq step u15) (some FACTORS-15) none)))

(define-read-only (get-bin-price
    (initial-price uint)
    (bin-step uint)
    (bin-id int)
  )
  (let ((p (+ (* (to-int initial-price) 10000) (* (to-int initial-price) (to-int bin-step) bin-id))))
    (if (> p 0)
      (ok (to-uint (/ p 10000)))
      (err u1))))
