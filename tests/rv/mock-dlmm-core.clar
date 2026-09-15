;; Mock Bitflow DLMM core for RV fuzzing of swap-router v5: the bin price
;; ladder the router walks. Linear in the bin: initial * (1 + step * bin /
;; 10000), positive for the bins the router can reach.
(define-read-only (get-bin-price
    (initial-price uint)
    (bin-step uint)
    (bin-id int)
  )
  (let ((p (+ (* (to-int initial-price) 10000) (* (to-int initial-price) (to-int bin-step) bin-id))))
    (if (> p 0)
      (ok (to-uint (/ p 10000)))
      (err u1))))
