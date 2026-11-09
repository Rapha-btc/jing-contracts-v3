;; TEST ONLY. Deployed under the name `markets-stx-usdcx-jing-v6-4` in the unit
;; tests. Same signatures as the real market for every function the short
;; vault calls (deposit / cancel / settle-pending for both sides and the
;; read-onlys it sizes its resting order with). A batch settlement is driven
;; by the test: `mock-fill-x` / `mock-fill-y` pay the maker the way the real
;; distribute step does (proceeds pushed to the depositor, the unfilled part
;; rolls), `mock-refund-x` / `mock-refund-y` push the unfilled part back (a
;; limit-violating maker), `mock-next-cycle` advances the batch counter.
;; Deposits are kept per principal (the cycle argument is accepted and
;; ignored: the real market rolls the unfilled part into the next cycle).
(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-constant USDCX 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant USDCX_NAME "usdcx-token")
(define-constant PRICE_PRECISION u100000000)

(define-data-var current-cycle uint u0)
(define-data-var min-x uint u1000000)
(define-data-var min-y uint u1000000)
(define-data-var reject-deposits bool false)
(define-data-var reject-cancel bool false)

(define-map x-dep
  principal
  uint
)
(define-map y-dep
  principal
  uint
)
(define-map x-limit
  principal
  uint
)
(define-map y-limit
  principal
  uint
)

(define-read-only (get-current-cycle)
  (var-get current-cycle)
)
(define-read-only (get-min-deposits)
  {
    min-token-x: (var-get min-x),
    min-token-y: (var-get min-y),
  }
)
(define-read-only (get-token-x-deposit
    (cycle uint)
    (depositor principal)
  )
  (default-to u0 (map-get? x-dep depositor))
)
(define-read-only (get-token-y-deposit
    (cycle uint)
    (depositor principal)
  )
  (default-to u0 (map-get? y-dep depositor))
)
(define-read-only (get-token-x-parked (who principal))
  u0
)
(define-read-only (get-token-y-parked (who principal))
  u0
)
(define-read-only (get-token-x-pending-deposit (depositor principal))
  (if false
    (some {
      amount: u0,
      limit: u0,
      spread-bps: none,
      submitted-at: u0,
    })
    none
  )
)
(define-read-only (get-token-y-pending-deposit (depositor principal))
  (if false
    (some {
      amount: u0,
      limit: u0,
      spread-bps: none,
      submitted-at: u0,
    })
    none
  )
)
(define-read-only (get-token-x-limit (who principal))
  (default-to u0 (map-get? x-limit who))
)
(define-read-only (get-token-y-limit (who principal))
  (default-to u0 (map-get? y-limit who))
)

(define-public (deposit-token-x
    (amount uint)
    (limit-price uint)
    (spread-bps (optional uint))
    (t <ft-trait>)
    (asset-name (string-ascii 128))
  )
  (begin
    (asserts! (not (var-get reject-deposits)) (err u1007))
    (asserts! (> limit-price u0) (err u1011))
    (asserts! (>= (+ amount (get-token-x-deposit u0 tx-sender)) (var-get min-x))
      (err u1001)
    )
    (try! (stx-transfer? amount tx-sender current-contract))
    (map-set x-dep tx-sender (+ amount (get-token-x-deposit u0 tx-sender)))
    (map-set x-limit tx-sender limit-price)
    (ok amount)
  )
)

(define-public (deposit-token-y
    (amount uint)
    (limit-price uint)
    (spread-bps (optional uint))
    (t <ft-trait>)
    (asset-name (string-ascii 128))
  )
  (begin
    (asserts! (not (var-get reject-deposits)) (err u1007))
    (asserts! (> limit-price u0) (err u1011))
    (asserts! (>= (+ amount (get-token-y-deposit u0 tx-sender)) (var-get min-y))
      (err u1001)
    )
    (try! (contract-call? USDCX transfer amount tx-sender current-contract none))
    (map-set y-dep tx-sender (+ amount (get-token-y-deposit u0 tx-sender)))
    (map-set y-limit tx-sender limit-price)
    (ok amount)
  )
)

(define-public (settle-token-x-deposit
    (who principal)
    (update (buff 8192))
    (t <ft-trait>)
    (asset-name (string-ascii 128))
  )
  (err u1030)
)

(define-public (settle-token-y-deposit
    (who principal)
    (update (buff 8192))
    (t <ft-trait>)
    (asset-name (string-ascii 128))
  )
  (err u1030)
)

(define-public (cancel-token-x-deposit
    (t <ft-trait>)
    (asset-name (string-ascii 128))
  )
  (let (
      (caller tx-sender)
      (amount (get-token-x-deposit u0 caller))
    )
    (asserts! (not (var-get reject-cancel)) (err u1002))
    (asserts! (> amount u0) (err u1005))
    (map-delete x-dep caller)
    (try! (as-contract? ((with-stx amount))
      (try! (stx-transfer? amount current-contract caller))
    ))
    (ok amount)
  )
)

(define-public (cancel-token-y-deposit
    (t <ft-trait>)
    (asset-name (string-ascii 128))
  )
  (let (
      (caller tx-sender)
      (amount (get-token-y-deposit u0 caller))
    )
    (asserts! (not (var-get reject-cancel)) (err u1002))
    (asserts! (> amount u0) (err u1005))
    (map-delete y-dep caller)
    (try! (as-contract? ((with-ft USDCX USDCX_NAME amount))
      (try! (contract-call? USDCX transfer amount current-contract caller none))
    ))
    (ok amount)
  )
)

;; ---------- test drivers ----------

;; `who` sold `amount` STX at `price` (USDCx per STX x 1e8): USDCx pushed to
;; the maker, the rest of its order stays resting
(define-public (mock-fill-x
    (who principal)
    (amount uint)
    (price uint)
  )
  (let (
      (have (get-token-x-deposit u0 who))
      (fill (if (< amount have)
        amount
        have
      ))
      (pay (/ (* fill price) PRICE_PRECISION))
    )
    (asserts! (>= price (get-token-x-limit who)) (err u1015))
    (map-set x-dep who (- have fill))
    (if (> pay u0)
      (try! (as-contract? ((with-ft USDCX USDCX_NAME pay))
        (try! (contract-call? USDCX transfer pay current-contract who none))
      ))
      true
    )
    (ok fill)
  )
)

;; `who` bought STX with `amount` USDCx at `price`: STX pushed to the maker
(define-public (mock-fill-y
    (who principal)
    (amount uint)
    (price uint)
  )
  (let (
      (have (get-token-y-deposit u0 who))
      (fill (if (< amount have)
        amount
        have
      ))
      (pay (/ (* fill PRICE_PRECISION) price))
    )
    (asserts! (<= price (get-token-y-limit who)) (err u1015))
    (map-set y-dep who (- have fill))
    (if (> pay u0)
      (try! (as-contract? ((with-stx pay))
        (try! (stx-transfer? pay current-contract who))
      ))
      true
    )
    (ok fill)
  )
)

(define-public (mock-refund-x (who principal))
  (let ((amount (get-token-x-deposit u0 who)))
    (map-delete x-dep who)
    (if (> amount u0)
      (try! (as-contract? ((with-stx amount))
        (try! (stx-transfer? amount current-contract who))
      ))
      true
    )
    (ok amount)
  )
)

(define-public (mock-refund-y (who principal))
  (let ((amount (get-token-y-deposit u0 who)))
    (map-delete y-dep who)
    (if (> amount u0)
      (try! (as-contract? ((with-ft USDCX USDCX_NAME amount))
        (try! (contract-call? USDCX transfer amount current-contract who none))
      ))
      true
    )
    (ok amount)
  )
)

(define-public (mock-next-cycle)
  (ok (var-set current-cycle (+ (var-get current-cycle) u1)))
)

(define-public (mock-set-reject-deposits (v bool))
  (ok (var-set reject-deposits v))
)

(define-public (mock-set-reject-cancel (v bool))
  (ok (var-set reject-cancel v))
)
