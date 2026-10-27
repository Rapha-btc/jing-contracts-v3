(define-constant OWNER tx-sender)
(define-constant LAB 'SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF)
(define-constant FUNDRAISER 'SP12AVHNBR1K5BRAXP699V66CWK7PQTJJBT2H174F)
(define-constant SBTC_TOKEN 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant ASSET_SBTC "sbtc-token")
(define-constant DEADLINE (+ burn-block-height u12960))
(define-constant REVIEW_WINDOW u1008)
(define-constant TERMS (concat
  (concat
    (concat
      (concat
        (concat
          (concat
            (concat
              u"Kairan's First Mile at Let Africa Build (LAB) is raised by UASU Inc. (a Delaware corporation, operating as Ocifarsito). "
              u"The reserve is the STX and sBTC that the fundraiser wallet SP12AVHNBR1K5BRAXP699V66CWK7PQTJJBT2H174F deposits into this contract before the reserve is released or recouped; only that wallet can deposit. "
            )
            u"LAB requests the reserve with a description of what the funds will be used for, recorded on-chain, at least 7 days (1,008 Bitcoin blocks) before the deadline, about 90 days (12,960 Bitcoin blocks) after this contract is deployed; the owner then releases the whole reserve to LAB, once, before the deadline. The owner reviews the description in good faith and to the best of its ability, but does not verify or guarantee it; LAB alone is responsible for the accuracy of its description and for how the funds are used, and neither the owner nor UASU Inc. is liable or responsible for either. "
          )
          u"Funds in this contract only ever go to LAB's wallet SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF, or, if the reserve was not released to LAB by the deadline, back to the fundraiser wallet, which may then recoup the whole reserve at any time and refunds each donor's wallet manually from it; LAB is solely responsible for that wallet's keys and for how claimed funds are used, and UASU Inc. has no liability for either. "
        )
        u"STX and sBTC are held as tokens and their value can go up or down; sBTC is a third-party token whose peg to bitcoin is outside UASU's control, and UASU is not liable for any loss of value or depeg. "
      )
      u"Smart contracts and blockchains carry technical risk; UASU is not liable for losses from bugs, network failures, wallet errors or lost keys, except as required by law. "
    )
    u"This contract runs as-is, with no warranty of any kind. LAB accepts these terms on-chain when it requests the reserve. "
  )
  u"These terms are governed by the laws of the State of Delaware, USA, and any dispute is resolved only in the courts of Delaware."
))

(define-constant ERR_NOT_OWNER (err u100))
(define-constant ERR_NOT_LAB (err u101))
(define-constant ERR_AMOUNT_ZERO (err u102))
(define-constant ERR_TERMS_NOT_ACCEPTED (err u103))
(define-constant ERR_DESCRIPTION_EMPTY (err u104))
(define-constant ERR_NOT_FUNDRAISER (err u105))
(define-constant ERR_CLAIMED (err u106))
(define-constant ERR_NO_REQUEST (err u107))
(define-constant ERR_TOO_EARLY (err u112))
(define-constant ERR_TOO_LATE (err u113))
(define-constant ERR_REQUEST_CHANGED (err u115))

(define-data-var request (optional (string-ascii 512)) none)
(define-data-var claim (optional {
  to: principal,
  burn-height: uint,
  description: (string-ascii 512),
  stx: uint,
  sats: uint,
}) none)

(define-read-only (get-terms)
  TERMS
)

(define-read-only (get-request)
  (var-get request)
)

(define-read-only (get-claim)
  (var-get claim)
)

(define-read-only (reserve-sats)
  (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
    get-balance current-contract
  ))
)

(define-read-only (get-status)
  {
    lab: LAB,
    owner: OWNER,
    fundraiser: FUNDRAISER,
    deadline: DEADLINE,
    stx: (stx-get-balance current-contract),
    sats: (reserve-sats),
    claimed: (is-some (var-get claim)),
  }
)

(define-public (deposit-reserve
    (stx uint)
    (sats uint)
  )
  (begin
    (asserts! (is-eq contract-caller FUNDRAISER) ERR_NOT_FUNDRAISER)
    (asserts! (is-none (var-get claim)) ERR_CLAIMED)
    (asserts! (or (> stx u0) (> sats u0)) ERR_AMOUNT_ZERO)
    (and (> stx u0) (try! (stx-transfer? stx tx-sender current-contract)))
    (and
      (> sats u0)
      (try! (contract-call? SBTC_TOKEN transfer sats tx-sender current-contract none))
    )
    (print {
      event: "deposit-reserve",
      stx: stx,
      sats: sats,
    })
    (ok true)
  )
)

(define-public (request-reserve
    (description (string-ascii 512))
    (agree-to-terms bool)
  )
  (begin
    (asserts! (is-eq contract-caller LAB) ERR_NOT_LAB)
    (asserts! (is-none (var-get claim)) ERR_CLAIMED)
    (asserts! agree-to-terms ERR_TERMS_NOT_ACCEPTED)
    (asserts! (> (len description) u0) ERR_DESCRIPTION_EMPTY)
    (asserts! (<= (+ burn-block-height REVIEW_WINDOW) DEADLINE) ERR_TOO_LATE)
    (var-set request (some description))
    (print {
      event: "request-reserve",
      description: description,
      terms-hash: (sha256 (unwrap-panic (to-consensus-buff? TERMS))),
    })
    (ok true)
  )
)

(define-public (release-reserve (description (string-ascii 512)))
  (let (
      (stx (stx-get-balance current-contract))
      (sats (reserve-sats))
    )
    (asserts! (is-eq contract-caller OWNER) ERR_NOT_OWNER)
    (asserts! (is-none (var-get claim)) ERR_CLAIMED)
    (asserts! (< burn-block-height DEADLINE) ERR_TOO_LATE)
    (asserts! (is-some (var-get request)) ERR_NO_REQUEST)
    (asserts! (is-eq (var-get request) (some description)) ERR_REQUEST_CHANGED)
    (asserts! (or (> stx u0) (> sats u0)) ERR_AMOUNT_ZERO)
    (try! (as-contract?
      (
        (with-stx stx)
        (with-ft SBTC_TOKEN ASSET_SBTC sats)
      )
      (and (> stx u0) (try! (stx-transfer? stx current-contract LAB)))
      (and
        (> sats u0)
        (try! (contract-call? SBTC_TOKEN transfer sats current-contract LAB none))
      )))
    (var-set claim
      (some {
        to: LAB,
        burn-height: burn-block-height,
        description: description,
        stx: stx,
        sats: sats,
      })
    )
    (print {
      event: "release-reserve",
      description: description,
      stx: stx,
      sats: sats,
    })
    (ok {
      stx: stx,
      sats: sats,
    })
  )
)

(define-public (recoup-reserve)
  (let (
      (stx (stx-get-balance current-contract))
      (sats (reserve-sats))
    )
    (asserts! (is-eq contract-caller FUNDRAISER) ERR_NOT_FUNDRAISER)
    (asserts! (is-none (var-get claim)) ERR_CLAIMED)
    (asserts! (>= burn-block-height DEADLINE) ERR_TOO_EARLY)
    (asserts! (or (> stx u0) (> sats u0)) ERR_AMOUNT_ZERO)
    (try! (as-contract?
      (
        (with-stx stx)
        (with-ft SBTC_TOKEN ASSET_SBTC sats)
      )
      (and (> stx u0) (try! (stx-transfer? stx current-contract FUNDRAISER)))
      (and
        (> sats u0)
        (try! (contract-call? SBTC_TOKEN transfer sats current-contract FUNDRAISER none))
      )))
    (var-set claim
      (some {
        to: FUNDRAISER,
        burn-height: burn-block-height,
        description: "",
        stx: stx,
        sats: sats,
      })
    )
    (print {
      event: "recoup-reserve",
      stx: stx,
      sats: sats,
    })
    (ok {
      stx: stx,
      sats: sats,
    })
  )
)
