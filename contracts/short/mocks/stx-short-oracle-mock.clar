;; TEST ONLY. Deployed under the name `stx-short-oracle` in the unit tests so
;; the vault's `.stx-short-oracle` binding resolves to it. Ignores the update
;; bytes; the price is set by the test. `fail` simulates a Lazer outage.
(impl-trait .stx-short-oracle-trait.stx-short-oracle-trait)

(define-data-var price uint u50000000) ;; 0.50 USDC per STX
(define-data-var fail bool false)

(define-public (set-price (p uint))
  (ok (var-set price p))
)

(define-public (set-fail (f bool))
  (ok (var-set fail f))
)

(define-public (get-price (update (buff 8192)))
  (begin
    (asserts! (not (var-get fail)) (err u4004))
    (asserts! (> (var-get price) u0) (err u4005))
    (ok {
      price: (var-get price),
      at: stacks-block-time,
    })
  )
)
