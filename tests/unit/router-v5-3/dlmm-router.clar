;; DLMM swap-router and core fixture. The router's three DLMM pool principals
;; map to separate venues.clar deployments: v-1 = dlmm, v-2 = dlmm-2,
;; v-3 = dlmm-3. Each pool has its own quote, bins and funded ledger
;; balances. A swap goes to the pool the caller names, with no as-contract,
;; so the caller stays tx-sender. get-bin-price is the venues.clar formula.
;; get-bin-factors-by-step serves the same linear formula as a factor list
;; for bin step u15 (factor[id] = 1e8 + 15e4 * (id - 500), so
;; initial * factor / 1e8 = get-bin-price initial u15 (id - 500)); mainnet
;; factors are geometric. Other steps have no list ((ok none)), as on the
;; core for a step it does not know. `set-factors-off` makes the u15 read
;; return (ok none) too, so a router that reads it panics: tests use it to
;; show a pick made no price read.
(use-trait ft .sip-010-trait.sip-010-trait)
(define-constant owner tx-sender)
(define-data-var factors-off bool false)

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

(define-public (set-factors-off (off bool))
  (begin (asserts! (is-eq tx-sender owner) (err u401)) (ok (var-set factors-off off))))

(define-read-only (get-bin-factors-by-step (step uint))
  (ok (if (and (is-eq step u15) (not (var-get factors-off))) (some FACTORS-15) none)))

(define-read-only (get-bin-price (initial uint) (bin-step uint) (bin int))
  (let ((p (+ (* (to-int initial) 10000) (* (to-int initial) (to-int bin-step) bin))))
    (if (> p 0) (ok (to-uint (/ p 10000))) (err u4001))))

(define-public (swap-x-for-y-simple-range-multi (pool principal) (x <ft>) (y <ft>) (amount uint) (minimum uint) (steps uint) (deadline (optional uint)))
  (if (is-eq pool .dlmm-2)
    (contract-call? .dlmm-2 swap-x-for-y-simple-range-multi pool x y amount minimum steps deadline)
    (if (is-eq pool .dlmm-3)
      (contract-call? .dlmm-3 swap-x-for-y-simple-range-multi pool x y amount minimum steps deadline)
      (begin
        (asserts! (is-eq pool .dlmm) (err u4004))
        (contract-call? .dlmm swap-x-for-y-simple-range-multi pool x y amount minimum steps deadline)))))

(define-public (swap-y-for-x-simple-range-multi (pool principal) (x <ft>) (y <ft>) (amount uint) (minimum uint) (steps uint) (deadline (optional uint)))
  (if (is-eq pool .dlmm-2)
    (contract-call? .dlmm-2 swap-y-for-x-simple-range-multi pool x y amount minimum steps deadline)
    (if (is-eq pool .dlmm-3)
      (contract-call? .dlmm-3 swap-y-for-x-simple-range-multi pool x y amount minimum steps deadline)
      (begin
        (asserts! (is-eq pool .dlmm) (err u4004))
        (contract-call? .dlmm swap-y-for-x-simple-range-multi pool x y amount minimum steps deadline)))))
