;; jing-btc-in-adapter
;;
;; BTC-first flow: the user bridges BTC to sBTC and pre-signs one sponsored
;; tx against this contract. When the sBTC mints, the keeper sponsors and
;; broadcasts it. The adapter pays the sponsor's STX fee back in sats, then
;; spends the rest on a Jing router swap or a fak.fun smart buy.
;;
;; No as-contract: tx-sender stays the user through every leg, so the sBTC
;; leaves the user's wallet and the swap output lands there. The user's
;; deny-mode post-condition caps the total sBTC spent (fee + swap).

(use-trait smart-buy .smart-buy-sbtc-trait.smart-buy-sbtc-trait)

(define-constant ERR_NOT_OWNER (err u4100))
(define-constant ERR_FEE_TOO_HIGH (err u4101))
(define-constant ERR_FEE_GE_AMOUNT (err u4102))
(define-constant ERR_TARGET_NOT_APPROVED (err u4103))
(define-constant ERR_PAUSED (err u4104))

(define-data-var owner principal tx-sender)
(define-data-var fee-recipient principal tx-sender)
;; Ceiling on the sats a signed tx may route to fee-recipient. The FE sets
;; fee-sats per tx (STX fee priced in sats); this caps a bad quote.
(define-data-var max-fee-sats uint u5000)
(define-data-var paused bool false)

;; fak.fun smart-buy contracts the adapter may call.
(define-map approved-targets principal bool)

;; --- internal ---

(define-private (take-fee (amount uint) (fee-sats uint))
  (begin
    (asserts! (not (var-get paused)) ERR_PAUSED)
    (asserts! (<= fee-sats (var-get max-fee-sats)) ERR_FEE_TOO_HIGH)
    (asserts! (< fee-sats amount) ERR_FEE_GE_AMOUNT)
    (if (> fee-sats u0)
      (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer
        fee-sats tx-sender (var-get fee-recipient) none
      ))
      true
    )
    (ok (- amount fee-sats))
  )
)

(define-private (log-btc-in (target principal) (amount uint) (fee-sats uint))
  (print {
    event: "btc-in",
    user: tx-sender,
    target: target,
    amount: amount,
    fee-sats: fee-sats,
    net-sats: (- amount fee-sats),
  })
)

;; --- user entry points ---

;; sBTC -> STX through the Jing sBTC/STX router (book leg + pools).
(define-public (swap-sbtc-for-stx
    (amount uint)
    (fee-sats uint)
    (limit-price uint)
    (update (optional (buff 8192)))
    (mid uint)
    (min-stx-out uint)
  )
  (let ((net (try! (take-fee amount fee-sats))))
    (log-btc-in 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-stx-jing-v5-5
      amount fee-sats
    )
    (ok {
      fee-sats: fee-sats,
      swap: (try! (contract-call?
        'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-stx-jing-v5-5
        smart-swap-sbtc-for-stx net limit-price update mid min-stx-out
      )),
    })
  )
)

;; sBTC -> USDCx through the Jing sBTC/USDCx router.
(define-public (swap-sbtc-for-usdcx
    (amount uint)
    (fee-sats uint)
    (limit-price uint)
    (update (optional (buff 8192)))
    (mid uint)
    (min-usdcx-out uint)
  )
  (let ((net (try! (take-fee amount fee-sats))))
    (log-btc-in 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-usdcx-jing-v5-5
      amount fee-sats
    )
    (ok {
      fee-sats: fee-sats,
      swap: (try! (contract-call?
        'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-usdcx-jing-v5-5
        smart-swap-sbtc-for-usdcx net limit-price update mid min-usdcx-out
      )),
    })
  )
)

;; sBTC -> any fak.fun token through its approved *-smart-faktory contract.
;; The route is picked on-chain at execution time, so a quote signed before
;; the BTC confirmed is not stale; min-token-out still bounds it.
(define-public (smart-buy-with-sbtc
    (target <smart-buy>)
    (amount uint)
    (fee-sats uint)
    (min-token-out uint)
  )
  (let (
      (target-id (contract-of target))
      (net (try! (take-fee amount fee-sats)))
    )
    (asserts! (default-to false (map-get? approved-targets target-id))
      ERR_TARGET_NOT_APPROVED
    )
    (log-btc-in target-id amount fee-sats)
    (ok {
      fee-sats: fee-sats,
      swap: (try! (contract-call? target smart-buy-with-sbtc net min-token-out)),
    })
  )
)

;; --- owner ---

(define-read-only (is-owner)
  (is-eq contract-caller (var-get owner))
)

(define-public (set-owner (new-owner principal))
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (ok (var-set owner new-owner))
  )
)

(define-public (set-fee-recipient (recipient principal))
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (ok (var-set fee-recipient recipient))
  )
)

(define-public (set-max-fee-sats (sats uint))
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (ok (var-set max-fee-sats sats))
  )
)

(define-public (set-paused (on bool))
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (ok (var-set paused on))
  )
)

(define-public (set-target (target principal) (approved bool))
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (ok (map-set approved-targets target approved))
  )
)

;; --- read-only ---

(define-read-only (get-config)
  {
    owner: (var-get owner),
    fee-recipient: (var-get fee-recipient),
    max-fee-sats: (var-get max-fee-sats),
    paused: (var-get paused),
  }
)

(define-read-only (is-approved-target (target principal))
  (default-to false (map-get? approved-targets target))
)
