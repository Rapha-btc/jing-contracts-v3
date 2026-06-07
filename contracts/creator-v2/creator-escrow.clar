;; SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.creator-escrow-jing
(define-constant OWNER tx-sender)
(define-constant USDCX_TOKEN 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant ASSET_USDCX "usdcx-token")
(define-constant REVIEW_WINDOW_BURN_BLOCKS u288)
(define-constant CLAIM_GRACE_BURN_BLOCKS u288)
(define-constant ROUND_BURN_BLOCKS u4200)
(define-constant TERMS
  u"By claiming this payment, creator grants UASU Inc. (a Delaware corporation, operating as JingSwap) a perpetual, irrevocable, royalty-free, worldwide, sublicensable license to use, display, distribute, and adapt the delivered content for marketing and advertising on any surface (landing page, X, YouTube, paid ads, future platforms). JingSwap credits the creator via their public X handle wherever the content is posted. Creator warrants the work is original and that creator has full rights to grant this license, and indemnifies UASU Inc. against any third-party claim arising from breach of these warranties. Creator waives moral rights to the fullest extent permitted by law. Creator retains copyright and may use the work in their own portfolio and channels. This license is governed by the laws of the State of Delaware, USA."
)

(define-constant ERR_NOT_OWNER (err u100))
(define-constant ERR_NOT_CREATOR (err u101))
(define-constant ERR_NO_ROUND (err u102))
(define-constant ERR_ROUND_ACTIVE (err u103))
(define-constant ERR_ROUND_ENDED (err u104))
(define-constant ERR_ROUND_NOT_ENDED (err u105))
(define-constant ERR_DELIVERY_NOT_FOUND (err u106))
(define-constant ERR_REVIEW_CLOSED (err u108))
(define-constant ERR_ALREADY_RESOLVED (err u109))
(define-constant ERR_INSUFFICIENT_ESCROW (err u110))
(define-constant ERR_PENDING_DELIVERIES (err u111))
(define-constant ERR_AMOUNT_ZERO (err u112))
(define-constant ERR_ALREADY_SWEPT (err u113))
(define-constant ERR_NOT_VETOED (err u114))
(define-constant ERR_TERMS_NOT_ACCEPTED (err u115))
(define-constant ERR_NOT_CLAIMABLE (err u116))
(define-constant ERR_ROUND_LIVE (err u117))
(define-constant ERR_VIDEOS_NOT_EVEN (err u118))
(define-constant ERR_OVER_CAPACITY (err u119))

(define-constant STATUS_PENDING u0)
(define-constant STATUS_RELEASED u1)
(define-constant STATUS_VETOED u2)
(define-constant STATUS_AMENDED_APPROVED u3)
(define-constant STATUS_EXPIRED u4)

(define-data-var current-round uint u0)
(define-data-var next-delivery-id uint u1)

(define-map rounds
  { id: uint }
  {
    started-at: uint,
    ends-at: uint,
    per-video: uint,
    num-videos: uint,
    deposited: uint,
    paid-out: uint,
    pending: uint,
    creator-a: principal,
    creator-b: principal,
    swept: bool
  }
)

(define-map deliveries
  { id: uint }
  {
    round-id: uint,
    creator: principal,
    submitted-at: uint,
    review-ends-at: uint,
    content-uri: (string-utf8 256),
    content-hash: (buff 32),
    status: uint,
    veto-reason: (optional (string-utf8 256))
  }
)

(define-read-only (get-config)
  {
    owner: OWNER,
    usdcx: USDCX_TOKEN,
    review-window-burn-blocks: REVIEW_WINDOW_BURN_BLOCKS,
    round-burn-blocks: ROUND_BURN_BLOCKS
  }
)

(define-read-only (get-current-round-id) (var-get current-round))

(define-read-only (get-round (id uint))
  (map-get? rounds { id: id })
)

(define-read-only (get-delivery (id uint))
  (map-get? deliveries { id: id })
)

(define-read-only (get-burn-height) burn-block-height)

(define-read-only (get-terms) TERMS)

(define-read-only (get-escrow-balance)
  (unwrap-panic (contract-call?
    'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx
    get-balance current-contract))
)

(define-private (is-creator-of
    (round-data
      { started-at: uint, ends-at: uint, per-video: uint, num-videos: uint,
        deposited: uint, paid-out: uint, pending: uint,
        creator-a: principal, creator-b: principal, swept: bool })
    (who principal))
  (or (is-eq who (get creator-a round-data))
      (is-eq who (get creator-b round-data)))
)

(define-public (start-round
    (creator-a principal)
    (creator-b principal)
    (per-video uint)
    (num-videos uint))
  (let (
      (prev-id (var-get current-round))
      (next-id (+ prev-id u1))
      (now burn-block-height)
      (deposit (* num-videos per-video))
    )
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (> per-video u0) ERR_AMOUNT_ZERO)
    (asserts! (> num-videos u0) ERR_AMOUNT_ZERO)
    (asserts! (is-eq (mod num-videos u2) u0) ERR_VIDEOS_NOT_EVEN)
    (asserts!
      (or (is-eq prev-id u0)
          (let ((prev-round
                  (unwrap! (map-get? rounds { id: prev-id }) ERR_NO_ROUND)))
            (and (>= now (get ends-at prev-round))
                 (is-eq (get pending prev-round) u0))))
      ERR_ROUND_ACTIVE
    )
    (try! (contract-call? USDCX_TOKEN transfer
      deposit tx-sender current-contract none))
    (map-set rounds { id: next-id }
      {
        started-at: now,
        ends-at: (+ now ROUND_BURN_BLOCKS),
        per-video: per-video,
        num-videos: num-videos,
        deposited: deposit,
        paid-out: u0,
        pending: u0,
        creator-a: creator-a,
        creator-b: creator-b,
        swept: false
      }
    )
    (print {
      event: "round-started",
      id: next-id,
      creator-a: creator-a,
      creator-b: creator-b,
      per-video: per-video,
      num-videos: num-videos,
      deposit: deposit,
      started-at: now,
      ends-at: (+ now ROUND_BURN_BLOCKS)
    })
    (var-set current-round next-id)
    (ok next-id)
  )
)

(define-public (submit-delivery
    (content-uri (string-utf8 256))
    (content-hash (buff 32)))
  (let (
      (round-id (var-get current-round))
      (round-data (unwrap! (map-get? rounds { id: round-id }) ERR_NO_ROUND))
      (now burn-block-height)
      (delivery-id (var-get next-delivery-id))
      (review-end (+ now REVIEW_WINDOW_BURN_BLOCKS))
      (per-video (get per-video round-data))
      (remaining (- (get deposited round-data) (get paid-out round-data)))
    )
    (asserts! (is-creator-of round-data tx-sender) ERR_NOT_CREATOR)
    (asserts!
      (<= (+ now REVIEW_WINDOW_BURN_BLOCKS) (get ends-at round-data))
      ERR_ROUND_ENDED
    )
    (asserts!
      (<= (* (+ (get pending round-data) u1) per-video) remaining)
      ERR_OVER_CAPACITY
    )
    (map-set deliveries { id: delivery-id }
      {
        round-id: round-id,
        creator: tx-sender,
        submitted-at: now,
        review-ends-at: review-end,
        content-uri: content-uri,
        content-hash: content-hash,
        status: STATUS_PENDING,
        veto-reason: none
      }
    )
    (map-set rounds { id: round-id }
      (merge round-data { pending: (+ (get pending round-data) u1) })
    )
    (print {
      event: "delivery-submitted",
      id: delivery-id,
      round: round-id,
      creator: tx-sender,
      content-hash: content-hash,
      content-uri: content-uri,
      submitted-at: now,
      review-ends-at: review-end
    })
    (var-set next-delivery-id (+ delivery-id u1))
    (ok delivery-id)
  )
)

(define-public (veto (delivery-id uint) (reason (string-utf8 256)))
  (let (
      (delivery (unwrap! (map-get? deliveries { id: delivery-id })
                          ERR_DELIVERY_NOT_FOUND))
      (round-id (get round-id delivery))
      (round-data (unwrap! (map-get? rounds { id: round-id }) ERR_NO_ROUND))
      (now burn-block-height)
    )
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (is-eq (get status delivery) STATUS_PENDING) ERR_ALREADY_RESOLVED)
    (asserts! (< now (get review-ends-at delivery)) ERR_REVIEW_CLOSED)
    (map-set deliveries { id: delivery-id }
      (merge delivery { status: STATUS_VETOED, veto-reason: (some reason) })
    )
    (map-set rounds { id: round-id }
      (merge round-data { pending: (- (get pending round-data) u1) })
    )
    (print {
      event: "delivery-vetoed",
      id: delivery-id,
      round: round-id,
      creator: (get creator delivery),
      reason: reason
    })
    (ok true)
  )
)

(define-public (lift-veto
    (delivery-id uint)
    (amended-content-hash (optional (buff 32))))
  (let (
      (delivery (unwrap! (map-get? deliveries { id: delivery-id })
                          ERR_DELIVERY_NOT_FOUND))
      (round-id (get round-id delivery))
      (round-data (unwrap! (map-get? rounds { id: round-id }) ERR_NO_ROUND))
    )
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (is-eq (get status delivery) STATUS_VETOED) ERR_NOT_VETOED)
    (asserts! (not (get swept round-data)) ERR_ALREADY_SWEPT)
    (map-set deliveries { id: delivery-id }
      (merge delivery { status: STATUS_AMENDED_APPROVED })
    )
    (map-set rounds { id: round-id }
      (merge round-data { pending: (+ (get pending round-data) u1) })
    )
    (print {
      event: "veto-lifted",
      id: delivery-id,
      round: round-id,
      creator: (get creator delivery),
      original-content-hash: (get content-hash delivery),
      amended-content-hash: amended-content-hash,
      original-veto-reason: (get veto-reason delivery)
    })
    (ok true)
  )
)

(define-public (release (delivery-id uint) (agree-to-terms bool))
  (let (
      (delivery (unwrap! (map-get? deliveries { id: delivery-id })
                          ERR_DELIVERY_NOT_FOUND))
      (round-id (get round-id delivery))
      (round-data (unwrap! (map-get? rounds { id: round-id }) ERR_NO_ROUND))
      (now burn-block-height)
      (status (get status delivery))
      (recipient (get creator delivery))
      (per-video (get per-video round-data))
      (remaining (- (get deposited round-data) (get paid-out round-data)))
    )
    (asserts! (is-eq tx-sender recipient) ERR_NOT_CREATOR)
    (asserts! agree-to-terms ERR_TERMS_NOT_ACCEPTED)
    (asserts!
      (or (is-eq status STATUS_AMENDED_APPROVED)
          (and (is-eq status STATUS_PENDING)
               (>= now (get review-ends-at delivery))))
      ERR_NOT_CLAIMABLE
    )
    (asserts! (>= remaining per-video) ERR_INSUFFICIENT_ESCROW)
    (map-set deliveries { id: delivery-id }
      (merge delivery { status: STATUS_RELEASED })
    )
    (map-set rounds { id: round-id }
      (merge round-data {
        paid-out: (+ (get paid-out round-data) per-video),
        pending: (- (get pending round-data) u1)
      })
    )
    (try! (as-contract? ((with-ft USDCX_TOKEN ASSET_USDCX per-video))
      (try! (contract-call? USDCX_TOKEN transfer
        per-video current-contract recipient none))))
    (print {
      event: "delivery-released",
      id: delivery-id,
      round: round-id,
      creator: recipient,
      amount: per-video,
      from-status: status,
      terms-accepted: true
    })
    (ok true)
  )
)

(define-public (expire (delivery-id uint))
  (let (
      (delivery (unwrap! (map-get? deliveries { id: delivery-id })
                          ERR_DELIVERY_NOT_FOUND))
      (round-id (get round-id delivery))
      (round-data (unwrap! (map-get? rounds { id: round-id }) ERR_NO_ROUND))
      (now burn-block-height)
      (status (get status delivery))
    )
    (asserts!
      (or (is-eq status STATUS_PENDING)
          (is-eq status STATUS_AMENDED_APPROVED))
      ERR_NOT_CLAIMABLE
    )
    (asserts!
      (>= now (+ (get ends-at round-data) CLAIM_GRACE_BURN_BLOCKS))
      ERR_ROUND_LIVE
    )
    (map-set deliveries { id: delivery-id }
      (merge delivery { status: STATUS_EXPIRED })
    )
    (map-set rounds { id: round-id }
      (merge round-data { pending: (- (get pending round-data) u1) })
    )
    (print {
      event: "delivery-expired",
      id: delivery-id,
      round: round-id,
      creator: (get creator delivery),
      from-status: status
    })
    (ok true)
  )
)

(define-public (sweep (round-id uint))
  (let (
      (round-data (unwrap! (map-get? rounds { id: round-id }) ERR_NO_ROUND))
      (now burn-block-height)
      (remaining (- (get deposited round-data) (get paid-out round-data)))
    )
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (>= now (get ends-at round-data)) ERR_ROUND_NOT_ENDED)
    (asserts! (not (get swept round-data)) ERR_ALREADY_SWEPT)
    (asserts! (is-eq (get pending round-data) u0) ERR_PENDING_DELIVERIES)
    (map-set rounds { id: round-id }
      (merge round-data { swept: true })
    )
    (and (> remaining u0)
         (try! (as-contract? ((with-ft USDCX_TOKEN ASSET_USDCX remaining))
           (try! (contract-call? USDCX_TOKEN transfer
             remaining current-contract OWNER none)))))
    (print {
      event: "round-swept",
      id: round-id,
      refund: remaining
    })
    (ok remaining)
  )
)