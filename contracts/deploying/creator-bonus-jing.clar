;; Title: creator-bonus-jing
;; Summary: Spot rewards on top of creator-escrow-v2-jing deliveries.
;; Description:
;;   The owner picks a delivery already submitted to creator-escrow-v2-jing
;;   and attaches a USDCx bonus to it. The creator unlocks that bonus only
;;   once the escrow shows the delivery as RELEASED - accepted, terms signed,
;;   base payment consumed. The escrow stays the single source of truth for
;;   who the creator is, which wallet gets paid, and whether the work was
;;   accepted; this contract adds money, never judgement.
;;
;;   Lifecycle per delivery id:
;;     fund   owner   -> bonus pending (top-ups add to the same pot)
;;     claim  creator -> escrow status must be RELEASED; pays the round's
;;                       payout wallet for that creator, same as the escrow
;;     revoke owner   -> only once the escrow delivery is VETOED or EXPIRED,
;;                       i.e. it can no longer be released; refunds the owner

(define-constant OWNER tx-sender)
(define-constant ESCROW 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.creator-escrow-v2-jing)
(define-constant USDCX_TOKEN 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant ASSET_USDCX "usdcx-token")

;; Mirrors creator-escrow-v2-jing. Only these three are read here.
(define-constant ESCROW_STATUS_RELEASED u1)
(define-constant ESCROW_STATUS_VETOED u2)
(define-constant ESCROW_STATUS_EXPIRED u4)

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
(define-constant ERR_STILL_CLAIMABLE (err u208))

(define-map bonuses
  { delivery-id: uint }
  {
    creator: principal,
    amount: uint,
    reason: (string-utf8 256),
    funded-at: uint,
    status: uint
  }
)

;; --- reads ------------------------------------------------------------------

(define-read-only (get-config)
  { owner: OWNER, escrow: ESCROW, usdcx: USDCX_TOKEN }
)

(define-read-only (get-bonus (delivery-id uint))
  (map-get? bonuses { delivery-id: delivery-id })
)

;; Read-only bodies name the escrow literally: Clarinet's read-only analysis
;; cannot see through a constant-bound contract-call? and flags it as a write.
(define-read-only (get-escrow-delivery (delivery-id uint))
  (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.creator-escrow-v2-jing get-delivery delivery-id)
)

;; True once the creator can call claim: bonus pending and the escrow
;; delivery released. Frontends poll this instead of re-deriving the rule.
(define-read-only (is-claimable (delivery-id uint))
  (match (map-get? bonuses { delivery-id: delivery-id })
    bonus
      (and
        (is-eq (get status bonus) BONUS_PENDING)
        (match (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.creator-escrow-v2-jing get-delivery delivery-id)
          delivery (is-eq (get status delivery) ESCROW_STATUS_RELEASED)
          false))
    false)
)

(define-read-only (get-balance)
  (unwrap-panic (contract-call?
    'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx
    get-balance current-contract))
)

;; --- owner ------------------------------------------------------------------

;; Attach (or top up) a bonus on a delivery that exists in the escrow. The
;; creator is snapshotted from the escrow so a later read cannot disagree
;; with who was rewarded. Funds move owner -> this contract now.
(define-public (fund (delivery-id uint) (amount uint) (reason (string-utf8 256)))
  (let (
      (delivery (unwrap! (contract-call? ESCROW get-delivery delivery-id)
                          ERR_DELIVERY_NOT_FOUND))
      (creator (get creator delivery))
      ;; `get` on an optional tuple yields an optional field: no bonus yet
      ;; reads as a pending pot of zero.
      (existing (map-get? bonuses { delivery-id: delivery-id }))
      (prior-amount (default-to u0 (get amount existing)))
      (prior-status (default-to BONUS_PENDING (get status existing)))
      (total (+ amount prior-amount))
    )
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (> amount u0) ERR_AMOUNT_ZERO)
    (asserts! (is-eq prior-status BONUS_PENDING) ERR_BONUS_NOT_PENDING)
    (try! (contract-call? USDCX_TOKEN transfer
      amount tx-sender current-contract none))
    (map-set bonuses { delivery-id: delivery-id }
      {
        creator: creator,
        amount: total,
        reason: reason,
        funded-at: burn-block-height,
        status: BONUS_PENDING
      }
    )
    (print {
      event: "bonus-funded",
      delivery-id: delivery-id,
      creator: creator,
      added: amount,
      total: total,
      reason: reason,
      funded-at: burn-block-height
    })
    (ok total)
  )
)

;; Take the money back only when the escrow says the delivery can never be
;; released: vetoed (and not amended back) or expired. While a delivery is
;; pending or approved the creator can still earn it, so the bonus stays.
(define-public (revoke (delivery-id uint))
  (let (
      (bonus (unwrap! (map-get? bonuses { delivery-id: delivery-id }) ERR_NO_BONUS))
      (delivery (unwrap! (contract-call? ESCROW get-delivery delivery-id)
                          ERR_DELIVERY_NOT_FOUND))
      (escrow-status (get status delivery))
      (amount (get amount bonus))
    )
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (is-eq (get status bonus) BONUS_PENDING) ERR_BONUS_NOT_PENDING)
    (asserts!
      (or (is-eq escrow-status ESCROW_STATUS_VETOED)
          (is-eq escrow-status ESCROW_STATUS_EXPIRED))
      ERR_STILL_CLAIMABLE
    )
    (map-set bonuses { delivery-id: delivery-id }
      (merge bonus { status: BONUS_REVOKED })
    )
    (try! (as-contract? ((with-ft USDCX_TOKEN ASSET_USDCX amount))
      (try! (contract-call? USDCX_TOKEN transfer
        amount current-contract OWNER none))))
    (print {
      event: "bonus-revoked",
      delivery-id: delivery-id,
      creator: (get creator bonus),
      amount: amount,
      escrow-status: escrow-status
    })
    (ok amount)
  )
)

;; --- creator ----------------------------------------------------------------

;; Unlock the bonus. Same gate as the escrow's own payout, read live from the
;; escrow: the delivery must be RELEASED, and the caller must be its creator.
;; Pays the creator's payout wallet from the escrow round, so a creator who
;; submits from one key and collects on another gets the bonus where the base
;; payment went.
(define-public (claim (delivery-id uint))
  (let (
      (bonus (unwrap! (map-get? bonuses { delivery-id: delivery-id }) ERR_NO_BONUS))
      (delivery (unwrap! (contract-call? ESCROW get-delivery delivery-id)
                          ERR_DELIVERY_NOT_FOUND))
      (round-data (unwrap! (contract-call? ESCROW get-round (get round-id delivery))
                            ERR_ROUND_NOT_FOUND))
      (creator (get creator delivery))
      (recipient (if (is-eq creator (get creator-a round-data))
                   (get creator-a-wallet round-data)
                   (get creator-b-wallet round-data)))
      (amount (get amount bonus))
    )
    (asserts! (is-eq tx-sender creator) ERR_NOT_CREATOR)
    (asserts! (is-eq (get status bonus) BONUS_PENDING) ERR_BONUS_NOT_PENDING)
    (asserts! (is-eq (get status delivery) ESCROW_STATUS_RELEASED) ERR_NOT_RELEASED)
    (map-set bonuses { delivery-id: delivery-id }
      (merge bonus { status: BONUS_CLAIMED })
    )
    (try! (as-contract? ((with-ft USDCX_TOKEN ASSET_USDCX amount))
      (try! (contract-call? USDCX_TOKEN transfer
        amount current-contract recipient none))))
    (print {
      event: "bonus-claimed",
      delivery-id: delivery-id,
      round: (get round-id delivery),
      creator: creator,
      payout-wallet: recipient,
      amount: amount
    })
    (ok amount)
  )
)
