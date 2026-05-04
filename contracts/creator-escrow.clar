;; creator-escrow
;; Public USDCx escrow for commissioned content (videos).
;;
;; OWNER (the buyer) deposits a per-month USDCx budget for a named pair of
;; CREATORS. Creators submit deliveries on-chain; each delivery unlocks a
;; fixed per-video payment after a 48-hour review window measured in BTC
;; burn blocks. OWNER may veto a delivery during the window with a stated
;; reason -- veto reasons are permanent and public.
;;
;; Payment is creator-pulled, not owner-pushed: the creator themselves
;; calls `release` after the review window passes, signing the call with
;; their own wallet and explicitly agreeing to the on-chain TERMS
;; (license to JingSwap to use the delivered content for marketing). The
;; agreement is part of every payment, so the IP grant is wallet-signed,
;; not a handshake.
;;
;; If a vetoed delivery is iterated on off-chain, OWNER can lift the
;; veto -- this does not pay directly. It transitions the delivery to
;; AMENDED_APPROVED, and the creator still has to call `release` with
;; agreement to actually be paid. The agreement model stays consistent
;; across all payment paths.
;;
;; Time is measured in BITCOIN BURN BLOCKS. There is no notice period, no
;; minimum delivery count, and no auto-rollover: each round is its own
;; escrow with its own creator roster, and the next round is opened by an
;; explicit start-round call. After the round ends, any still-open
;; deliveries (unclaimed or amended-but-unclaimed) can be expired by
;; anyone, freeing the round for OWNER to sweep unspent budget. The
;; contract's only check on bad-faith vetoes is OWNER's public
;; reputation -- the on-chain record speaks for itself across every
;; future creator who reads it.

;; ---------------------------------------------------------------
;; Constants
;; ---------------------------------------------------------------

(define-constant OWNER tx-sender)

(define-constant USDCX_TOKEN 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)

;; SIP-010 ft identifier for USDCx, used in `with-ft` capabilities.
(define-constant ASSET_USDCX "usdcx-token")

;; The per-video payment is set per round, not globally. Each `start-round`
;; call snapshots a per-video amount that is immutable for that round's
;; life -- creators always know exactly what each delivery is worth at
;; the time they commit to shipping. USDCx is 6-decimal; $25 = 25_000_000.

;; 48 hours of BTC burn blocks: 48h * 6 blocks/hour = 288.
(define-constant REVIEW_WINDOW_BURN_BLOCKS u288)

;; Symmetric 48-hour grace AFTER the round ends-at, during which the
;; creator can still call `release` on a delivery that completed review
;; before round-end (or on an AMENDED_APPROVED delivery). Only after this
;; grace expires can anyone `expire` the slot.
(define-constant CLAIM_GRACE_BURN_BLOCKS u288)

;; ~30-day round in BTC burn blocks. OWNER spec: 4200. The submit window
;; is ROUND_BURN_BLOCKS - REVIEW_WINDOW_BURN_BLOCKS so every accepted
;; delivery can complete its review before round-end.
(define-constant ROUND_BURN_BLOCKS u4200)

;; License terms a creator agrees to by calling `release` with
;; agree-to-terms = true. The agreement is wallet-signed (the creator's
;; signature on the release tx) and the terms are immutable on-chain.
(define-constant TERMS
  u"By claiming this payment, creator grants UASU Inc. (a Delaware corporation, operating as JingSwap) a perpetual, irrevocable, royalty-free, worldwide, sublicensable license to use, display, distribute, and adapt the delivered content for marketing and advertising on any surface (landing page, X, YouTube, paid ads, future platforms). JingSwap credits the creator via their public X handle wherever the content is posted. Creator warrants the work is original and that creator has full rights to grant this license, and indemnifies UASU Inc. against any third-party claim arising from breach of these warranties. Creator waives moral rights to the fullest extent permitted by law. Creator retains copyright and may use the work in their own portfolio and channels. This license is governed by the laws of the State of Delaware, USA."
)

;; ---------------------------------------------------------------
;; Errors
;; ---------------------------------------------------------------

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

;; Delivery status codes.
(define-constant STATUS_PENDING u0)
(define-constant STATUS_RELEASED u1)
(define-constant STATUS_VETOED u2)
(define-constant STATUS_AMENDED_APPROVED u3)
(define-constant STATUS_EXPIRED u4)

;; ---------------------------------------------------------------
;; State
;; ---------------------------------------------------------------

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

;; ---------------------------------------------------------------
;; Read-only
;; ---------------------------------------------------------------

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

;; ---------------------------------------------------------------
;; Helpers
;; ---------------------------------------------------------------

(define-private (is-creator-of
    (round-data
      { started-at: uint, ends-at: uint, per-video: uint, num-videos: uint,
        deposited: uint, paid-out: uint, pending: uint,
        creator-a: principal, creator-b: principal, swept: bool })
    (who principal))
  (or (is-eq who (get creator-a round-data))
      (is-eq who (get creator-b round-data)))
)

;; ---------------------------------------------------------------
;; Owner: open a new round
;; ---------------------------------------------------------------

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
    ;; Slot count must be even so the budget divides cleanly between the
    ;; two creators if they choose to split equally. The contract still
    ;; doesn't enforce who delivers which slot -- per-creator income is
    ;; whatever each one ships.
    (asserts! (is-eq (mod num-videos u2) u0) ERR_VIDEOS_NOT_EVEN)
    ;; Previous round (if any) must be fully resolved before a new one
    ;; opens: ends-at has passed AND pending == 0. Pending stays >0 while
    ;; any delivery is still in PENDING or AMENDED_APPROVED -- creators
    ;; must have claimed (or anyone must have called `expire`) before
    ;; the cycle is considered closed. Sweeping the previous round is
    ;; independent of starting the next one and can happen any time.
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

;; ---------------------------------------------------------------
;; Creators: submit a delivery
;; ---------------------------------------------------------------

(define-public (submit-delivery
    (content-uri (string-utf8 256))
    (content-hash (buff 32)))
  (let (
      (round-id (var-get current-round))
      (round-data (unwrap! (map-get? rounds { id: round-id }) ERR_NO_ROUND))
      (now burn-block-height)
      (delivery-id (var-get next-delivery-id))
      (review-end (+ now REVIEW_WINDOW_BURN_BLOCKS))
    )
    (asserts! (is-creator-of round-data tx-sender) ERR_NOT_CREATOR)
    ;; Submit cutoff = ends-at - REVIEW_WINDOW. This guarantees every
    ;; submitted delivery's 48hr review window completes before the round
    ;; ends, leaving the post-round CLAIM_GRACE for the creator to claim.
    (asserts!
      (<= (+ now REVIEW_WINDOW_BURN_BLOCKS) (get ends-at round-data))
      ERR_ROUND_ENDED
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

;; ---------------------------------------------------------------
;; Owner: veto a delivery during its review window
;; ---------------------------------------------------------------

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

;; ---------------------------------------------------------------
;; Owner: lift a previous veto (after creator amends work off-chain)
;; ---------------------------------------------------------------
;; The creator iterates on the work in response to OWNER's feedback. If
;; OWNER is satisfied, they call lift-veto, which transitions the
;; delivery to AMENDED_APPROVED but does NOT pay -- the creator must
;; still call `release` themselves with agreement to TERMS. This keeps
;; the wallet-signed consent model uniform across every payment path.
;; The optional amended-content-hash records what was actually approved,
;; giving a full on-chain trail: original hash -> veto + reason ->
;; amended hash -> creator's signed claim.

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
    (map-set deliveries { id: delivery-id }
      (merge delivery { status: STATUS_AMENDED_APPROVED })
    )
    ;; The veto previously decremented pending; reverse that, since
    ;; the delivery is once again awaiting a (creator-driven) terminal
    ;; resolution.
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

;; ---------------------------------------------------------------
;; Creator: release payment with explicit on-chain agreement to TERMS
;; ---------------------------------------------------------------
;; Only the creator who delivered can claim. They must pass
;; agree-to-terms = true; their wallet's signature on this tx is the
;; on-chain consent record for the IP license described in TERMS.
;;
;; Eligible source states:
;;   - PENDING after the review window has expired (no veto fired)
;;   - AMENDED_APPROVED after OWNER lifted a veto on iterated work

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
    ;; Claimable when AMENDED_APPROVED (any time), or PENDING after the
    ;; review window has expired without veto.
    (asserts!
      (or (is-eq status STATUS_AMENDED_APPROVED)
          (and (is-eq status STATUS_PENDING)
               (>= now (get review-ends-at delivery))))
      ERR_NOT_CLAIMABLE
    )
    (asserts! (>= remaining per-video) ERR_INSUFFICIENT_ESCROW)
    (try! (as-contract? ((with-ft USDCX_TOKEN ASSET_USDCX per-video))
      (try! (contract-call? USDCX_TOKEN transfer
        per-video current-contract recipient none))))
    (map-set deliveries { id: delivery-id }
      (merge delivery { status: STATUS_RELEASED })
    )
    (map-set rounds { id: round-id }
      (merge round-data {
        paid-out: (+ (get paid-out round-data) per-video),
        pending: (- (get pending round-data) u1)
      })
    )
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

;; ---------------------------------------------------------------
;; Anyone: expire a stuck delivery after the round has ended
;; ---------------------------------------------------------------
;; If a creator never claims (PENDING after review window) or never
;; claims an approved amendment (AMENDED_APPROVED), the round can't be
;; swept until the slot is freed. Once the round itself has ended,
;; anyone can mark such deliveries EXPIRED so OWNER can sweep. This is
;; permissionless cleanup; it never moves funds, only state.

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
    ;; Round-end + claim grace must both have passed. Creators retain a
    ;; full CLAIM_GRACE post round-end to call `release`; only after that
    ;; window can anyone reclaim the slot.
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

;; ---------------------------------------------------------------
;; Owner: sweep unspent escrow after a round is fully resolved
;; ---------------------------------------------------------------

(define-public (sweep (round-id uint))
  (let (
      (round-data (unwrap! (map-get? rounds { id: round-id }) ERR_NO_ROUND))
      (now burn-block-height)
      (remaining (- (get deposited round-data) (get paid-out round-data)))
    )
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (>= now (get ends-at round-data)) ERR_ROUND_NOT_ENDED)
    (asserts! (not (get swept round-data)) ERR_ALREADY_SWEPT)
    ;; Every delivery for this round must be resolved (released or vetoed)
    ;; before sweep. Anyone can call `release` once a review window has
    ;; expired, so this is never permanently blockable.
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
