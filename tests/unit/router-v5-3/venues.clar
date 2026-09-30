;; External venue fixture, deployed separately as dlmm, xyk and velar.
;; Pricing is independent of the router's minimum. Transfers use finite,
;; pre-funded balances; no minting occurs in any swap. Test controls only.
(use-trait ft .sip-010-trait.sip-010-trait)
(define-constant owner tx-sender)
(define-data-var sats uint u0)
(define-data-var microstx uint u0)
(define-data-var reverse bool false)
(define-data-var fee-x uint u0)
(define-data-var fee-y uint u0)
(define-data-var active int 0)
(define-data-var step uint u15)
(define-data-var price uint u1000000)
(define-data-var max-input uint u340282366920938463463374607431768211455)
(define-data-var inflate uint u0)
(define-data-var calls uint u0)
(define-data-var last-in uint u0)
(define-data-var last-min uint u0)

(define-public (configure (s uint) (y uint) (rev bool) (fx uint) (fy uint))
  (begin
    (asserts! (is-eq tx-sender owner) (err u401))
    (var-set sats s) (var-set microstx y) (var-set reverse rev)
    (var-set fee-x fx) (var-set fee-y fy) (ok true)))
(define-public (configure-dlmm (bin int) (p uint) (bin-step uint) (cap uint))
  (begin
    (asserts! (is-eq tx-sender owner) (err u401))
    (var-set active bin) (var-set price p) (var-set step bin-step)
    (var-set max-input cap) (ok true)))
(define-public (set-inflate (n uint))
  (begin (asserts! (is-eq tx-sender owner) (err u401)) (ok (var-set inflate n))))
(define-read-only (get-pool)
  (ok {x-token: (if (var-get reverse) .asset-stx .token),
    x-balance: (if (var-get reverse) (var-get microstx) (var-get sats)),
    y-balance: (if (var-get reverse) (var-get sats) (var-get microstx)),
    token0: (if (var-get reverse) .asset-stx .token),
    reserve0: (if (var-get reverse) (var-get microstx) (var-get sats)),
    reserve1: (if (var-get reverse) (var-get sats) (var-get microstx)),
    active-bin-id: (var-get active), initial-price: (var-get price), bin-step: (var-get step),
    x-protocol-fee: (var-get fee-x), x-provider-fee: u0, x-variable-fee: u0,
    y-protocol-fee: (var-get fee-y), y-provider-fee: u0, y-variable-fee: u0}))
(define-read-only (get-fees)
  (ok {swap-fee:{num:(- u10000 (var-get fee-x)), den:u10000}}))
(define-read-only (get-bin-price (initial uint) (bin-step uint) (bin int))
  (let ((p (+ (* (to-int initial) 10000) (* (to-int initial) (to-int bin-step) bin))))
    (if (> p 0) (ok (to-uint (/ p 10000))) (err u4001))))
(define-read-only (get-bin-balances (id uint))
  (begin
    (asserts! (<= id u1000) (err u4002))
    (ok (if (is-eq id (to-uint (+ (var-get active) 500)))
      {x-balance:(var-get microstx),y-balance:(var-get sats)}
      {x-balance:u0,y-balance:u0}))))

(define-private (exchange (sell-sbtc bool) (amount uint) (out uint) (minimum uint))
  (let ((user tx-sender))
    (asserts! (>= out minimum) (err u4003))
    (if sell-sbtc
      (begin
        (try! (contract-call? .token transfer amount user current-contract none))
        (try! (as-contract? ((with-stx out)) (try! (stx-transfer? out current-contract user)))))
      (begin
        (try! (stx-transfer? amount user current-contract))
        (try! (as-contract? ((with-ft .token "token" out))
          (try! (contract-call? .token transfer out current-contract user none))))))
    (var-set calls (+ (var-get calls) u1))
    (var-set last-in amount) (var-set last-min minimum)
    (ok (+ out (var-get inflate)))))
(define-private (cp (sell-sbtc bool) (amount uint) (minimum uint) (fee uint))
  (let ((rin (if sell-sbtc (var-get sats) (var-get microstx)))
        (rout (if sell-sbtc (var-get microstx) (var-get sats)))
        (adjusted (/ (* amount (- u10000 fee)) u10000))
        (out (/ (* rout adjusted) (+ rin adjusted)))
        (reported (try! (exchange sell-sbtc amount out minimum))))
    (var-set sats (if sell-sbtc (+ (var-get sats) amount) (- (var-get sats) out)))
    (var-set microstx (if sell-sbtc (- (var-get microstx) out) (+ (var-get microstx) amount)))
    (ok reported)))
(define-private (dlmm-fill (sell-sbtc bool) (amount uint) (minimum uint))
  (let ((spent (if (< amount (var-get max-input)) amount (var-get max-input)))
        (fee (if sell-sbtc (var-get fee-y) (var-get fee-x)))
        (net (/ (* spent (- u10000 fee)) u10000))
        (p (unwrap-panic (get-bin-price (var-get price) (var-get step) (var-get active))))
        (out (if sell-sbtc (/ (* net u100000000) p) (/ (* net p) u100000000)))
        (reported (try! (exchange sell-sbtc spent out minimum))))
    (ok {in:spent,out:reported})))
(define-public (swap-x-for-y-simple-range-multi (pool principal) (x <ft>) (y <ft>) (amount uint) (minimum uint) (steps uint) (deadline (optional uint)))
  (dlmm-fill false amount minimum))
(define-public (swap-y-for-x-simple-range-multi (pool principal) (x <ft>) (y <ft>) (amount uint) (minimum uint) (steps uint) (deadline (optional uint)))
  (dlmm-fill true amount minimum))
(define-public (swap-x-for-y (pool principal) (x <ft>) (y <ft>) (amount uint) (minimum uint))
  (cp (is-eq (contract-of x) .token) amount minimum (var-get fee-x)))
(define-public (swap-y-for-x (pool principal) (x <ft>) (y <ft>) (amount uint) (minimum uint))
  (cp (is-eq (contract-of y) .token) amount minimum (var-get fee-y)))
(define-public (swap (input <ft>) (output <ft>) (fees principal) (amount uint) (minimum uint))
  (ok {amt-out:(try! (cp (is-eq (contract-of input) .token) amount minimum (var-get fee-x)))}))
