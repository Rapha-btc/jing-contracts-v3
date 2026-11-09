;; TEST ONLY. Deployed under the name `swap-router-stx-usdcx-jing-v5-5` in the
;; unit tests. Same signatures and return tuple as the real router's
;; smart-swap-stx-for-usdcx / smart-swap-usdcx-for-stx. Executes at a test-set
;; price `rate` (USDCx per STX x 1e8) with a per-call depth in STX; fills
;; nothing when `rate` is outside the caller's limit (the real router leaves
;; such input unsold with the caller). Must be funded with STX and USDCx.
(define-constant USDCX 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant USDCX_NAME "usdcx-token")
(define-constant PRICE_PRECISION u100000000)

(define-data-var rate uint u50000000)
(define-data-var depth-stx uint u1000000000000)

(define-public (mock-set-rate (r uint))
  (ok (var-set rate r))
)

(define-public (mock-set-depth (d uint))
  (ok (var-set depth-stx d))
)

(define-private (result
    (in uint)
    (out uint)
    (amount uint)
  )
  {
    jing-ok: false,
    jing-in: u0,
    jing-out: u0,
    dlmm-in: in,
    dlmm-out: out,
    xyk-in: u0,
    xyk-out: u0,
    velar-in: u0,
    velar-out: u0,
    unsold: (- amount in),
    out: out,
  }
)

(define-public (smart-swap-stx-for-usdcx
    (amount uint)
    (limit-price uint)
    (update (optional (buff 8192)))
    (mid uint)
    (min-usdcx-out uint)
  )
  (let (
      (user tx-sender)
      (r (var-get rate))
      (in (if (< r limit-price)
        u0
        (if (< amount (var-get depth-stx))
          amount
          (var-get depth-stx)
        )
      ))
      (out (/ (* in r) PRICE_PRECISION))
    )
    (asserts! (> amount u0) (err u3001))
    (asserts! (> limit-price u0) (err u3006))
    (asserts! (> mid u0) (err u3007))
    (asserts! (>= out min-usdcx-out) (err u3002))
    (if (> in u0)
      (begin
        (try! (stx-transfer? in user current-contract))
        (try! (as-contract? ((with-ft USDCX USDCX_NAME out))
          (try! (contract-call? USDCX transfer out current-contract user none))
        ))
        true
      )
      true
    )
    (ok (result in out amount))
  )
)

(define-public (smart-swap-usdcx-for-stx
    (amount uint)
    (limit-price uint)
    (update (optional (buff 8192)))
    (mid uint)
    (min-stx-out uint)
  )
  (let (
      (user tx-sender)
      (r (var-get rate))
      (depth-usdcx (/ (* (var-get depth-stx) r) PRICE_PRECISION))
      (in (if (> r limit-price)
        u0
        (if (< amount depth-usdcx)
          amount
          depth-usdcx
        )
      ))
      (out (/ (* in PRICE_PRECISION) r))
    )
    (asserts! (> amount u0) (err u3001))
    (asserts! (> limit-price u0) (err u3006))
    (asserts! (> mid u0) (err u3007))
    (asserts! (>= out min-stx-out) (err u3002))
    (if (> in u0)
      (begin
        (try! (contract-call? USDCX transfer in user current-contract none))
        (try! (as-contract? ((with-stx out))
          (try! (stx-transfer? out current-contract user))
        ))
        true
      )
      true
    )
    (ok (result in out amount))
  )
)
