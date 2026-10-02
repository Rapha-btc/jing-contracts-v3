;; DLMM swap-router and core fixture. The router's three DLMM pool principals
;; map to separate venues.clar deployments: v-1 = dlmm, v-2 = dlmm-2,
;; v-3 = dlmm-3. Each pool has its own quote, bins and funded ledger
;; balances. A swap goes to the pool the caller names, with no as-contract,
;; so the caller stays tx-sender. get-bin-price is the venues.clar formula.
(use-trait ft .sip-010-trait.sip-010-trait)

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
