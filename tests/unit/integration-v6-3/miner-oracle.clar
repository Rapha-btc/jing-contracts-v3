;; The band rung uses a deterministic native-price input. Its actual guard,
;; market, ladder registration and accounting are production code.
(define-data-var mid uint u1000000000000)
(define-data-var available bool true)
(define-public (set-mid (n uint)) (ok (var-set mid n)))
(define-public (set-available (b bool)) (ok (var-set available b)))
(define-read-only (get-native-price)
 (if (var-get available) (ok (var-get mid)) (err u9001)))
