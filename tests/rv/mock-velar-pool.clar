;; Mock Velar sBTC/wSTX pool for RV fuzzing of swap-router v5. token0 is
;; sBTC (the mock token), token1 the mock wstx facade; the direction of a
;; swap is read off token-in. Pays exactly the router's minimum.
(use-trait ft-trait .sip-010-trait.sip-010-trait)

(define-read-only (get-pool)
  (ok {
    symbol: "sBTC-wSTX",
    token0: .mock-ft,
    token1: .mock-wstx,
    lp-token: .mock-wstx,
    fees: .mock-velar-fees,
    reserve0: u2000000000,
    reserve1: u6000000000000,
    block-height: u0,
    burn-block-height: u0,
  })
)

(define-public (swap
    (token-in <ft-trait>)
    (token-out <ft-trait>)
    (fees principal)
    (amt-in uint)
    (amt-out-min uint)
  )
  (let ((out (if (> amt-out-min u0) amt-out-min u1)) (user tx-sender))
    (asserts! (> amt-in u0) (err u301))
    (if (is-eq (contract-of token-in) .mock-wstx)
      (begin
        ;; sell STX for sBTC
        (try! (stx-transfer? amt-in user current-contract))
        (try! (as-contract? ((with-ft .mock-ft "mock-ft" out))
          (try! (contract-call? .mock-ft transfer out current-contract user none)))))
      (begin
        ;; sell sBTC for STX
        (try! (contract-call? .mock-ft transfer amt-in user current-contract none))
        (try! (as-contract? ((with-stx out))
          (try! (stx-transfer? out current-contract user))))))
    (ok { amt-in: amt-in, amt-out: out })))
