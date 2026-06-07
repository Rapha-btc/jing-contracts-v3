;; creator-escrow-v2-stxer
;; Stxer mainnet-fork test variant of creator-escrow-v2 (round 2).
;;
;; Timing constants are shrunk so the full lifecycle is reachable inside
;; a single stxer simulation that advances burn blocks via
;; `addAdvanceBlocks`:
;;
;;   REVIEW_WINDOW_BURN_BLOCKS  = u2     (mainnet: u288)
;;   CLAIM_GRACE_BURN_BLOCKS    = u0     (mainnet: u288)
;;   ROUND_BURN_BLOCKS          = u4200  (mainnet: u4200, kept large)
;;
;; Why REVIEW = u2 and NOT u0 (unlike the v1 stxer variant): v2 adds the
;; owner `veto` and `approve` actions, both gated on
;; `now < review-ends-at`. With REVIEW = 0 the review window is already
;; closed at submit height, making veto/approve permanently unreachable
;; -- so the amend/approve sim could not be written. A 2-block window is
;; small enough to step over with `addAdvanceBlocks` to reach the PENDING
;; and amended `release` paths (which need `now >= review-ends-at`),
;; while still leaving room to call veto/approve at submit height.
;;
;; CLAIM_GRACE is zeroed so `expire` becomes reachable the moment a round
;; ends. ROUND is kept at the mainnet value; sims advance past it with
;; `addAdvanceBlocks` before `sweep` / round-2 open.
(define-constant OWNER tx-sender)
(define-constant USDCX_TOKEN 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant ASSET_USDCX "usdcx-token")
;; STXER OVERRIDE: 2 (mainnet: u288). Kept > 0 so veto/approve reachable.
(define-constant REVIEW_WINDOW_BURN_BLOCKS u2)
;; STXER OVERRIDE: 0 (mainnet: u288).
(define-constant CLAIM_GRACE_BURN_BLOCKS u0)
;; STXER: kept at mainnet u4200; sims advance past it before sweep.
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

;; u3 is STATUS_APPROVED: OWNER has reviewed a PENDING delivery and
;; fast-tracked it, letting the creator `release` before the 48h review
;; window elapses. (It replaces the old AMENDED_APPROVED meaning; veto
;; fixes are now a creator-driven amend back to PENDING.) EXPIRED stays
;; u4 so existing status decoders don't shift.
(define-constant STATUS_PENDING u0)
(define-constant STATUS_RELEASED u1)
(define-constant STATUS_VETOED u2)
(define-constant STATUS_APPROVED u3)
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
    ;; Payout destinations: creator-a/-b operate from their normal wallet
    ;; (the admin) but their USDCx reward is sent to these wallets.
    creator-a-wallet: principal,
    creator-b-wallet: principal,
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
        creator-a: principal, creator-b: principal,
        creator-a-wallet: principal, creator-b-wallet: principal,
        swept: bool })
    (who principal))
  (or (is-eq who (get creator-a round-data))
      (is-eq who (get creator-b round-data)))
)

(define-public (start-round
    (creator-a principal)
    (creator-a-wallet principal)
    (creator-b principal)
    (creator-b-wallet principal)
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
        creator-a-wallet: creator-a-wallet,
        creator-b-wallet: creator-b-wallet,
        swept: false
      }
    )
    (print {
      event: "round-started",
      id: next-id,
      creator-a: creator-a,
      creator-b: creator-b,
      creator-a-wallet: creator-a-wallet,
      creator-b-wallet: creator-b-wallet,
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
    (asserts! (<= review-end (get ends-at round-data)) ERR_ROUND_ENDED)
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

;; Creator: amend a vetoed delivery with the corrected work.
;; The burden of a bad hash is on the creator. After OWNER vetoes (e.g.
;; "wrong hash"), the creator fixes the work and calls `amend-delivery`
;; with the corrected URI + hash. This is signed by the creator's own
;; wallet (the corrected hash is creator-attested, not owner-attested)
;; and returns the delivery to PENDING with a FRESH 48-hour review window
;; so OWNER can re-review and, if still wrong, veto again. It is
;; effectively a re-submission of the same slot, subject to the same
;; round-end cutoff and budget-capacity checks as `submit-delivery`.
(define-public (amend-delivery
    (delivery-id uint)
    (content-uri (string-utf8 256))
    (content-hash (buff 32)))
  (let (
      (delivery (unwrap! (map-get? deliveries { id: delivery-id })
                          ERR_DELIVERY_NOT_FOUND))
      (round-id (get round-id delivery))
      (round-data (unwrap! (map-get? rounds { id: round-id }) ERR_NO_ROUND))
      (now burn-block-height)
      (review-end (+ now REVIEW_WINDOW_BURN_BLOCKS))
      (per-video (get per-video round-data))
      (remaining (- (get deposited round-data) (get paid-out round-data)))
      (creator (get creator delivery))
    )
    ;; Only the creator who owns this delivery can amend it.
    (asserts! (is-eq tx-sender creator) ERR_NOT_CREATOR)
    ;; Only a vetoed delivery can be re-done.
    (asserts! (is-eq (get status delivery) STATUS_VETOED) ERR_NOT_VETOED)
    ;; Cannot resurrect a delivery after OWNER has swept the round's budget.
    (asserts! (not (get swept round-data)) ERR_ALREADY_SWEPT)
    ;; Same cutoff as submit: the fresh review window must complete before
    ;; round-end so the post-round claim grace still applies.
    (asserts! (<= review-end (get ends-at round-data)) ERR_ROUND_ENDED)
    ;; Re-check budget capacity: other deliveries may have been released
    ;; since the veto, eating into remaining budget. The veto decremented
    ;; pending, so this slot is counted back in here.
    (asserts!
      (<= (* (+ (get pending round-data) u1) per-video) remaining)
      ERR_OVER_CAPACITY
    )
    (map-set deliveries { id: delivery-id }
      (merge delivery {
        submitted-at: now,
        review-ends-at: review-end,
        content-uri: content-uri,
        content-hash: content-hash,
        status: STATUS_PENDING,
        veto-reason: none
      })
    )
    (map-set rounds { id: round-id }
      (merge round-data { pending: (+ (get pending round-data) u1) })
    )
    (print {
      event: "delivery-amended",
      id: delivery-id,
      round: round-id,
      creator: creator,
      previous-veto-reason: (get veto-reason delivery),
      content-hash: content-hash,
      content-uri: content-uri,
      submitted-at: now,
      review-ends-at: review-end
    })
    (ok true)
  )
)

;; Owner: fast-track a delivery so the creator can release early.
;; OWNER has reviewed the delivery and is satisfied, so the creator may
;; `release` immediately instead of waiting out the 48h review window.
;; Only a PENDING delivery can be approved; once approved it can no
;; longer be vetoed (veto requires PENDING). The slot stays counted in
;; `pending` until the creator releases (or it is expired).
(define-public (approve (delivery-id uint))
  (let (
      (delivery (unwrap! (map-get? deliveries { id: delivery-id })
                          ERR_DELIVERY_NOT_FOUND))
      (round-id (get round-id delivery))
      (now burn-block-height)
    )
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (is-eq (get status delivery) STATUS_PENDING) ERR_ALREADY_RESOLVED)
    ;; Fast-track only while the review window is still open; once it has
    ;; closed the delivery is already claimable via the PENDING path, so
    ;; a late approve would be a no-op. Mirrors the `veto` time bound.
    (asserts! (< now (get review-ends-at delivery)) ERR_REVIEW_CLOSED)
    (map-set deliveries { id: delivery-id }
      (merge delivery { status: STATUS_APPROVED })
    )
    (print {
      event: "delivery-approved",
      id: delivery-id,
      round: round-id,
      creator: (get creator delivery),
      content-hash: (get content-hash delivery)
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
      (creator (get creator delivery))
      ;; Pay the per-creator smart wallet, not the operating wallet.
      (recipient (if (is-eq creator (get creator-a round-data))
                   (get creator-a-wallet round-data)
                   (get creator-b-wallet round-data)))
      (per-video (get per-video round-data))
      (remaining (- (get deposited round-data) (get paid-out round-data)))
    )
    ;; The creator signs the claim from their normal wallet...
    (asserts! (is-eq tx-sender creator) ERR_NOT_CREATOR)
    (asserts! agree-to-terms ERR_TERMS_NOT_ACCEPTED)
    ;; Claimable when OWNER has APPROVED it (fast-track, any time), or
    ;; when it is still PENDING and its review window has expired.
    (asserts!
      (or (is-eq status STATUS_APPROVED)
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
      creator: creator,
      payout-wallet: recipient,
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
    ;; An unclaimed PENDING or owner-APPROVED slot still counts in
    ;; `pending` and blocks a sweep. (Standing VETOED deliveries already
    ;; left `pending`, so they need no expiry.)
    (asserts!
      (or (is-eq status STATUS_PENDING)
          (is-eq status STATUS_APPROVED))
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