;; kairan-seat-lab: Kairan's Seat at Let Africa Build (LAB).
;; Donations (STX, sBTC) sit here until LAB claims them. LAB can only claim by
;; accepting TERMS on-chain, and then posts receipt links (the public update)
;; here, so the audit trail lives on-chain: deposits, claim, terms, receipts,
;; and whether the first receipt came within RECEIPT_WINDOW_BURN_BLOCKS.
;; If LAB never claims, the owner can reclaim after CLAIM_WINDOW_BURN_BLOCKS.
(define-constant OWNER tx-sender)
(define-constant LAB 'SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF)
(define-constant SBTC_TOKEN 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant ASSET_SBTC "sbtc-token")
(define-constant DEPLOYED_AT burn-block-height)
(define-constant RECEIPT_WINDOW_BURN_BLOCKS u4320) ;; ~30 days
(define-constant CLAIM_WINDOW_BURN_BLOCKS u8640) ;; ~60 days
(define-constant TERMS u"By claiming, Let Africa Build (LAB) accepts these funds as Kairan's Seat, raised by Ocifarsito (RaphaStacks) at the Hoboken 10K on Oct 17, 2026. LAB routes 100% of the claimed STX and sBTC to the LAB Open Source Builder Fund matching pool, recorded permanently as Kairan's Seat, to fund grants for African developers shipping open-source Bitcoin infrastructure. Any amount above the $300 goal compounds into the same pool under Kairan's Seat. Within 30 days of the claim, LAB posts a public update on the LAB Journal, tags @RaphaStacks on X, links the on-chain claim transaction and the deposit that records Kairan's Seat, and posts that update's link to this contract with post-receipt.")

(define-constant ERR_NOT_OWNER (err u100))
(define-constant ERR_NOT_LAB (err u101))
(define-constant ERR_AMOUNT_ZERO (err u102))
(define-constant ERR_TERMS_NOT_ACCEPTED (err u103))
(define-constant ERR_ALREADY_CLAIMED (err u104))
(define-constant ERR_NOT_CLAIMED (err u105))
(define-constant ERR_NOTHING_TO_CLAIM (err u106))
(define-constant ERR_CLAIM_WINDOW_OPEN (err u107))
(define-constant ERR_URL_EMPTY (err u108))

(define-data-var claimed-at (optional uint) none)
(define-data-var claimed-stx uint u0)
(define-data-var claimed-sats uint u0)
(define-data-var donated-stx uint u0)
(define-data-var donated-sats uint u0)
(define-data-var receipt-count uint u0)
(define-data-var reclaimed bool false)

(define-map receipts
  uint
  {
    url: (string-ascii 256),
    burn-height: uint,
    on-time: bool,
  }
)

(define-read-only (get-terms)
  TERMS
)

(define-read-only (get-receipt (index uint))
  (map-get? receipts index)
)

(define-read-only (get-status)
  (let (
      (at (var-get claimed-at))
      (deadline (match at h (some (+ h RECEIPT_WINDOW_BURN_BLOCKS)) none))
    )
    {
      lab: LAB,
      owner: OWNER,
      balance-stx: (stx-get-balance current-contract),
      donated-stx: (var-get donated-stx),
      donated-sats: (var-get donated-sats),
      claimed-at: at,
      claimed-stx: (var-get claimed-stx),
      claimed-sats: (var-get claimed-sats),
      receipt-deadline: deadline,
      receipt-count: (var-get receipt-count),
      receipt-overdue: (match deadline
        d (and (is-eq (var-get receipt-count) u0) (> burn-block-height d))
        false
      ),
      reclaim-after: (+ DEPLOYED_AT CLAIM_WINDOW_BURN_BLOCKS),
      reclaimed: (var-get reclaimed),
    }
  )
)

;; Anyone may give, until LAB claims.
(define-public (donate-stx (amount uint))
  (begin
    (asserts! (> amount u0) ERR_AMOUNT_ZERO)
    (asserts! (is-none (var-get claimed-at)) ERR_ALREADY_CLAIMED)
    (try! (stx-transfer? amount tx-sender current-contract))
    (var-set donated-stx (+ (var-get donated-stx) amount))
    (print {
      event: "donate",
      asset: "stx",
      from: tx-sender,
      amount: amount,
    })
    (ok true)
  )
)

(define-public (donate-sbtc (amount uint))
  (begin
    (asserts! (> amount u0) ERR_AMOUNT_ZERO)
    (asserts! (is-none (var-get claimed-at)) ERR_ALREADY_CLAIMED)
    (try! (contract-call? SBTC_TOKEN transfer amount tx-sender current-contract none))
    (var-set donated-sats (+ (var-get donated-sats) amount))
    (print {
      event: "donate",
      asset: "sbtc",
      from: tx-sender,
      amount: amount,
    })
    (ok true)
  )
)

;; LAB takes the whole balance and accepts TERMS on-chain.
(define-public (claim (agree-to-terms bool))
  (let (
      (stx (stx-get-balance current-contract))
      (sats (unwrap-panic (contract-call? SBTC_TOKEN get-balance current-contract)))
    )
    (asserts! (is-eq tx-sender LAB) ERR_NOT_LAB)
    (asserts! agree-to-terms ERR_TERMS_NOT_ACCEPTED)
    (asserts! (is-none (var-get claimed-at)) ERR_ALREADY_CLAIMED)
    (asserts! (not (var-get reclaimed)) ERR_ALREADY_CLAIMED)
    (asserts! (or (> stx u0) (> sats u0)) ERR_NOTHING_TO_CLAIM)
    (try! (pay-out LAB stx sats))
    (var-set claimed-at (some burn-block-height))
    (var-set claimed-stx stx)
    (var-set claimed-sats sats)
    (print {
      event: "claim",
      lab: LAB,
      stx: stx,
      sats: sats,
      terms-hash: (sha256 (unwrap-panic (to-consensus-buff? TERMS))),
      receipt-deadline: (+ burn-block-height RECEIPT_WINDOW_BURN_BLOCKS),
    })
    (ok {
      stx: stx,
      sats: sats,
    })
  )
)

;; LAB posts the public update (LAB Journal / X link). More than one is fine.
(define-public (post-receipt (url (string-ascii 256)))
  (let (
      (at (unwrap! (var-get claimed-at) ERR_NOT_CLAIMED))
      (index (var-get receipt-count))
      (on-time (<= burn-block-height (+ at RECEIPT_WINDOW_BURN_BLOCKS)))
    )
    (asserts! (is-eq tx-sender LAB) ERR_NOT_LAB)
    (asserts! (> (len url) u0) ERR_URL_EMPTY)
    (map-set receipts index {
      url: url,
      burn-height: burn-block-height,
      on-time: on-time,
    })
    (var-set receipt-count (+ index u1))
    (print {
      event: "receipt",
      index: index,
      url: url,
      on-time: on-time,
    })
    (ok index)
  )
)

;; If LAB never claims, the owner takes the funds back to redirect them.
(define-public (reclaim)
  (let (
      (stx (stx-get-balance current-contract))
      (sats (unwrap-panic (contract-call? SBTC_TOKEN get-balance current-contract)))
    )
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (is-none (var-get claimed-at)) ERR_ALREADY_CLAIMED)
    (asserts! (>= burn-block-height (+ DEPLOYED_AT CLAIM_WINDOW_BURN_BLOCKS))
      ERR_CLAIM_WINDOW_OPEN
    )
    (asserts! (or (> stx u0) (> sats u0)) ERR_NOTHING_TO_CLAIM)
    (try! (pay-out OWNER stx sats))
    (var-set reclaimed true)
    (print {
      event: "reclaim",
      owner: OWNER,
      stx: stx,
      sats: sats,
    })
    (ok {
      stx: stx,
      sats: sats,
    })
  )
)

(define-private (pay-out
    (to principal)
    (stx uint)
    (sats uint)
  )
  (as-contract? (
      (with-stx stx)
      (with-ft SBTC_TOKEN ASSET_SBTC sats)
    )
    (and (> stx u0) (try! (stx-transfer? stx current-contract to)))
    (and (> sats u0)
      (try! (contract-call? SBTC_TOKEN transfer sats current-contract to none))
    )
  )
)
