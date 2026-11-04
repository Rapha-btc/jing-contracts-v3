;; Test-only router. Behaviour is set by `mode`:
;;   u0 fill      pulls (amount - unsold) sBTC, pays out = spent * rate / 1000
;;                of the output asset; err u3002 when out < min-out
;;   u1 err       pulls amount then returns err u3002 (rolled back)
;;   u2 overspend pulls amount + extra (takes other orders' sats)
;;   u3 refund    pulls amount, sends back `extra`, pulls `extra` again
;;                (gross = amount + extra, like a book refund re-sold on pools)
;;   u4 overreport pulls amount, pays out `rate` but REPORTS out + extra
;; charge-ustx: STX it pulls from the caller (the Lazer fee), every mode.
;; The output asset is STX when `stx-out` is true, mock-usdcx otherwise.
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)

(define-data-var mode uint u0)
(define-data-var unsold uint u0)
(define-data-var rate uint u1000)
(define-data-var extra uint u0)
(define-data-var charge-ustx uint u0)
(define-data-var stx-out bool true)
(define-data-var last-call (optional {
  amount: uint,
  limit-price: uint,
  mid: uint,
  min-out: uint,
  has-update: bool,
}) none)

(define-public (configure
    (m uint)
    (u uint)
    (r uint)
    (x uint)
    (c uint)
  )
  (begin
    (var-set mode m)
    (var-set unsold u)
    (var-set rate r)
    (var-set extra x)
    (var-set charge-ustx c)
    (ok true)
  )
)

(define-public (set-stx-out (on bool))
  (ok (var-set stx-out on))
)

(define-read-only (get-last-call)
  (var-get last-call)
)

(define-private (pull (n uint))
  (if (> n u0)
    (contract-call? SBTC transfer n tx-sender current-contract none)
    (ok true)
  )
)

(define-private (push-sbtc
    (n uint)
    (to principal)
  )
  (if (> n u0)
    (unwrap-panic (as-contract? ((with-ft SBTC "sbtc-token" n))
      (unwrap-panic (contract-call? SBTC transfer n current-contract to none))
    ))
    true
  )
)

(define-private (pay-out
    (n uint)
    (to principal)
  )
  (if (> n u0)
    (if (var-get stx-out)
      (unwrap-panic (as-contract? ((with-stx n))
        (unwrap-panic (stx-transfer? n current-contract to))
      ))
      (unwrap-panic (as-contract? ((with-ft .mock-usdcx "usdcx-token" n))
        (unwrap-panic (contract-call? .mock-usdcx transfer n current-contract to none))
      ))
    )
    true
  )
)

(define-private (swap
    (amount uint)
    (limit-price uint)
    (update (optional (buff 8192)))
    (mid uint)
    (min-out uint)
  )
  (let (
      (caller tx-sender)
      (m (var-get mode))
    )
    (var-set last-call (some {
      amount: amount,
      limit-price: limit-price,
      mid: mid,
      min-out: min-out,
      has-update: (is-some update),
    }))
    (if (> (var-get charge-ustx) u0)
      (try! (stx-transfer? (var-get charge-ustx) caller current-contract))
      true
    )
    (if (is-eq m u1)
      (begin
        (try! (pull amount))
        (err u3002)
      )
      (if (is-eq m u2)
        (begin
          (try! (pull (+ amount (var-get extra))))
          (ok {
            out: u0,
          })
        )
        (if (is-eq m u3)
          (begin
            (try! (pull amount))
            (push-sbtc (var-get extra) caller)
            (try! (pull (var-get extra)))
            (pay-out (/ (* amount (var-get rate)) u1000) caller)
            (ok {
              out: (/ (* amount (var-get rate)) u1000),
            })
          )
          (if (is-eq m u4)
            (begin
              (try! (pull amount))
              (pay-out (var-get rate) caller)
              (ok {
                out: (+ (var-get rate) (var-get extra)),
              })
            )
            (let (
                (spend (- amount (var-get unsold)))
                (out (/ (* spend (var-get rate)) u1000))
              )
              (asserts! (>= out min-out) (err u3002))
              (try! (pull spend))
              (pay-out out caller)
              (ok {
                out: out,
              })
            )
          )
        )
      )
    )
  )
)

(define-public (smart-swap-sbtc-for-stx
    (amount uint)
    (limit-price uint)
    (update (optional (buff 8192)))
    (mid uint)
    (min-stx-out uint)
  )
  (swap amount limit-price update mid min-stx-out)
)

(define-public (smart-swap-sbtc-for-usdcx
    (amount uint)
    (limit-price uint)
    (update (optional (buff 8192)))
    (mid uint)
    (min-usdcx-out uint)
  )
  (swap amount limit-price update mid min-usdcx-out)
)
