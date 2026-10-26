;; kairan-seat-lab-ocifarsito-v3: Kairan's Seat reserve for Let Africa Build
;; (LAB), raised by Ocifarsito.
;; The FUNDRAISER wallet deposits STX + sBTC with deposit-reserve, any time
;; before the claim. LAB claims the contract's whole STX + sBTC balance once
;; with claim, posting a description of what the funds will be used for and
;; accepting TERMS. After the claim, deposits are closed. Funds only ever go
;; to LAB. No owner, no deadline, no refunds.
(define-constant LAB 'SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF)
(define-constant FUNDRAISER 'SP12AVHNBR1K5BRAXP699V66CWK7PQTJJBT2H174F) ;; first-10K wallet: deposits the reserve
(define-constant SBTC_TOKEN 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant ASSET_SBTC "sbtc-token")
(define-constant TERMS (concat (concat (concat (concat (concat (concat (concat u"Kairan's Seat at Let Africa Build (LAB) is raised by UASU Inc. (a Delaware corporation, operating as Ocifarsito). "
  u"The reserve is the STX and sBTC that the fundraiser wallet SP12AVHNBR1K5BRAXP699V66CWK7PQTJJBT2H174F deposits into this contract before LAB's claim; only that wallet can deposit. ")
  u"LAB claims the whole reserve once, with a description of what the funds will be used for, recorded on-chain; LAB alone is responsible for the accuracy of that description. ")
  u"Funds in this contract only ever go to LAB's wallet SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF; LAB is solely responsible for that wallet's keys and for how claimed funds are used, and UASU Inc. has no liability for either. ")
  u"STX and sBTC are held as tokens and their value can go up or down; sBTC is a third-party token whose peg to bitcoin is outside UASU's control, and UASU is not liable for any loss of value or depeg. ")
  u"Smart contracts and blockchains carry technical risk; UASU is not liable for losses from bugs, network failures, wallet errors or lost keys, except as required by law. ")
  u"This contract runs as-is, with no warranty of any kind. LAB accepts these terms on-chain when it claims. ")
  u"These terms are governed by the laws of the State of Delaware, USA, and any dispute is resolved only in the courts of Delaware."))

(define-constant ERR_NOT_LAB (err u101))
(define-constant ERR_AMOUNT_ZERO (err u102)) ;; nothing to deposit / claim
(define-constant ERR_TERMS_NOT_ACCEPTED (err u103))
(define-constant ERR_DESCRIPTION_EMPTY (err u104))
(define-constant ERR_NOT_FUNDRAISER (err u105))
(define-constant ERR_CLAIMED (err u106)) ;; the one claim already happened

;; Use-of-funds description + amounts paid, set by the one claim.
(define-data-var claim (optional {
  burn-height: uint,
  description: (string-ascii 512),
  stx: uint,
  sats: uint,
})
  none
)

(define-read-only (get-terms)
  TERMS
)

(define-read-only (get-claim)
  (var-get claim)
)

(define-read-only (reserve-sats)
  (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance current-contract))
)

(define-read-only (get-status)
  {
    lab: LAB,
    fundraiser: FUNDRAISER,
    stx: (stx-get-balance current-contract),
    sats: (reserve-sats),
    claimed: (is-some (var-get claim)),
  }
)

;; FUNDRAISER moves STX and/or sBTC from tx-sender into the contract. Any
;; time before the claim, any number of times.
(define-public (deposit-reserve
    (stx uint)
    (sats uint)
  )
  (begin
    (asserts! (is-eq contract-caller FUNDRAISER) ERR_NOT_FUNDRAISER)
    (asserts! (is-none (var-get claim)) ERR_CLAIMED)
    (asserts! (or (> stx u0) (> sats u0)) ERR_AMOUNT_ZERO)
    (and (> stx u0) (try! (stx-transfer? stx tx-sender current-contract)))
    (and (> sats u0)
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

;; LAB accepts TERMS, posts a description of what the funds will be used for
;; and receives the contract's whole STX + sBTC balance. Once only.
(define-public (claim-reserve
    (description (string-ascii 512))
    (agree-to-terms bool)
  )
  (let (
      (stx (stx-get-balance current-contract))
      (sats (reserve-sats))
    )
    (asserts! (is-eq contract-caller LAB) ERR_NOT_LAB)
    (asserts! (is-none (var-get claim)) ERR_CLAIMED)
    (asserts! agree-to-terms ERR_TERMS_NOT_ACCEPTED)
    (asserts! (> (len description) u0) ERR_DESCRIPTION_EMPTY)
    (asserts! (or (> stx u0) (> sats u0)) ERR_AMOUNT_ZERO)
    (try! (as-contract? (
        (with-stx stx)
        (with-ft SBTC_TOKEN ASSET_SBTC sats)
      )
      (and (> stx u0) (try! (stx-transfer? stx current-contract LAB)))
      (and (> sats u0)
        (try! (contract-call? SBTC_TOKEN transfer sats current-contract LAB none))
      )
    ))
    (var-set claim (some {
      burn-height: burn-block-height,
      description: description,
      stx: stx,
      sats: sats,
    }))
    (print {
      event: "claim",
      description: description,
      stx: stx,
      sats: sats,
      terms-hash: (sha256 (unwrap-panic (to-consensus-buff? TERMS))),
    })
    (ok {
      stx: stx,
      sats: sats,
    })
  )
)
