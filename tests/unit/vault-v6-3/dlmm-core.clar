;; Mock Bitflow DLMM core for the vault v6-3 suite. get-bin-price is the
;; linear ladder of tests/rv/mock-dlmm-core.clar: initial * (1 + step * bin /
;; 10000). get-bin-factors-by-step serves the same formula as a factor list
;; for bin step u15 (factor[id] = 1e8 + 15e4 * (id - 500), so initial *
;; factor / 1e8 = get-bin-price initial u15 (id - 500)), as in
;; tests/unit/router-v5-3/dlmm-router.clar; other steps return (ok none).
;; get-pool-by-id serves the core's `pools` map for the router's three mainnet
;; ids (6 = v-1, 15 = v-2, 16 = v-3). build.mjs maps all three pool principals
;; to the one .mock-dlmm-pool, so every id names it and is enabled. The mock
;; pool holds no balance of its own (the funded ledger is .mock-dlmm-router),
;; so the router's pick has no eligible pool and falls back to u1: the leg
;; walks and sells on .mock-dlmm-pool, as the old single-pool router did.
(define-constant POOL {id: u6, name: "STX-sBTC-LP", symbol: "STX-sBTC", pool-contract: .mock-dlmm-pool, status: true})

(define-read-only (get-pool-by-id (id uint))
  (ok (if (or (is-eq id u6) (is-eq id u15) (is-eq id u16))
    (some (merge POOL {id: id}))
    none)))

(define-read-only (get-bin-price
    (initial-price uint)
    (bin-step uint)
    (bin-id int)
  )
  (let ((p (+ (* (to-int initial-price) 10000) (* (to-int initial-price) (to-int bin-step) bin-id))))
    (if (> p 0)
      (ok (to-uint (/ p 10000)))
      (err u1))))

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
