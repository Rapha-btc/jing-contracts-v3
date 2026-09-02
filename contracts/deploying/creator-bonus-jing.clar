(define-constant OWNER tx-sender)
(define-constant ESCROW 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.creator-escrow-v2-jing)
(define-constant USDCX_TOKEN 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant ASSET_USDCX "usdcx-token")

(define-constant ESCROW_STATUS_RELEASED u1)

(define-constant BONUS_PENDING u0)
(define-constant BONUS_CLAIMED u1)
(define-constant BONUS_REVOKED u2)

(define-constant ERR_NOT_OWNER (err u200))
(define-constant ERR_NOT_CREATOR (err u201))
(define-constant ERR_DELIVERY_NOT_FOUND (err u202))
(define-constant ERR_ROUND_NOT_FOUND (err u203))
(define-constant ERR_AMOUNT_ZERO (err u204))
(define-constant ERR_NO_BONUS (err u205))
(define-constant ERR_BONUS_NOT_PENDING (err u206))
(define-constant ERR_NOT_RELEASED (err u207))

(define-map bonuses
  { delivery-id: uint }
  {
    creator: principal,
    amount: uint,
    reason: (string-utf8 256),
    funded-at: uint,
    status: uint,
  }
)

(define-read-only (get-config)
  {
    owner: OWNER,
    escrow: ESCROW,
    usdcx: USDCX_TOKEN,
  }
)

(define-read-only (get-bonus (delivery-id uint))
  (map-get? bonuses { delivery-id: delivery-id })
)

(define-read-only (get-escrow-delivery (delivery-id uint))
  (contract-call?
    'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.creator-escrow-v2-jing
    get-delivery delivery-id
  )
)

(define-read-only (is-claimable (delivery-id uint))
  (is-eq
    (default-to BONUS_CLAIMED
      (get status (map-get? bonuses { delivery-id: delivery-id }))
    )
    BONUS_PENDING
  )
)

(define-read-only (get-balance)
  (unwrap-panic (contract-call? 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx get-balance
    current-contract
  ))
)

(define-public (fund
    (delivery-id uint)
    (amount uint)
    (reason (string-utf8 256))
  )
  (let (
      (delivery (unwrap! (contract-call? ESCROW get-delivery delivery-id)
        ERR_DELIVERY_NOT_FOUND
      ))
      (creator (get creator delivery))
      (existing (map-get? bonuses { delivery-id: delivery-id }))
      (prior-amount (default-to u0 (get amount existing)))
      (prior-status (default-to BONUS_PENDING (get status existing)))
      (total (+ amount prior-amount))
    )
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (> amount u0) ERR_AMOUNT_ZERO)
    (asserts! (is-eq (get status delivery) ESCROW_STATUS_RELEASED)
      ERR_NOT_RELEASED
    )
    (asserts! (is-eq prior-status BONUS_PENDING) ERR_BONUS_NOT_PENDING)
    (try! (contract-call? USDCX_TOKEN transfer amount tx-sender current-contract none))
    (map-set bonuses { delivery-id: delivery-id } {
      creator: creator,
      amount: total,
      reason: reason,
      funded-at: burn-block-height,
      status: BONUS_PENDING,
    })
    (print {
      event: "bonus-funded",
      delivery-id: delivery-id,
      creator: creator,
      added: amount,
      total: total,
      reason: reason,
      funded-at: burn-block-height,
    })
    (ok total)
  )
)

(define-public (revoke (delivery-id uint))
  (let (
      (bonus (unwrap! (map-get? bonuses { delivery-id: delivery-id }) ERR_NO_BONUS))
      (amount (get amount bonus))
    )
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (is-eq (get status bonus) BONUS_PENDING) ERR_BONUS_NOT_PENDING)
    (map-set bonuses { delivery-id: delivery-id }
      (merge bonus { status: BONUS_REVOKED })
    )
    (try! (as-contract? ((with-ft USDCX_TOKEN ASSET_USDCX amount))
      (try! (contract-call? USDCX_TOKEN transfer amount current-contract OWNER none))
    ))
    (print {
      event: "bonus-revoked",
      delivery-id: delivery-id,
      creator: (get creator bonus),
      amount: amount,
    })
    (ok amount)
  )
)

(define-public (claim (delivery-id uint))
  (let (
      (bonus (unwrap! (map-get? bonuses { delivery-id: delivery-id }) ERR_NO_BONUS))
      (delivery (unwrap! (contract-call? ESCROW get-delivery delivery-id)
        ERR_DELIVERY_NOT_FOUND
      ))
      (round-data (unwrap! (contract-call? ESCROW get-round (get round-id delivery))
        ERR_ROUND_NOT_FOUND
      ))
      (creator (get creator delivery))
      (recipient (if (is-eq creator (get creator-a round-data))
        (get creator-a-wallet round-data)
        (get creator-b-wallet round-data)
      ))
      (amount (get amount bonus))
    )
    (asserts! (is-eq tx-sender creator) ERR_NOT_CREATOR)
    (asserts! (is-eq (get status bonus) BONUS_PENDING) ERR_BONUS_NOT_PENDING)
    (map-set bonuses { delivery-id: delivery-id }
      (merge bonus { status: BONUS_CLAIMED })
    )
    (try! (as-contract? ((with-ft USDCX_TOKEN ASSET_USDCX amount))
      (try! (contract-call? USDCX_TOKEN transfer amount current-contract recipient none))
    ))
    (print {
      event: "bonus-claimed",
      delivery-id: delivery-id,
      round: (get round-id delivery),
      creator: creator,
      payout-wallet: recipient,
      amount: amount,
    })
    (ok amount)
  )
)
