;; kairan-seat-lab-ocifarsito-v2: Kairan's Seat at Let Africa Build (LAB), raised by Ocifarsito.
;; One contract = one seat: TARGET (2,000 USDCx) newly raised through donate
;; (capped at TARGET; every gift booked per donor), plus a STX + sBTC reserve
;; that the FUNDRAISER wallet deposits once.
;; SUCCESS: once TARGET is raised (at reached-at), LAB has SEAT_WINDOW Bitcoin
;; blocks to post the seat receipt (builder, repo, grant post crediting
;; ocifarsito.com) and accept TERMS with request-seat; OWNER then reviews it
;; and calls release-seat, which pays LAB all the USDCx + the whole reserve
;; in the same tx; the contract closes.
;; FAILURE from failure-at (DEADLINE if TARGET is never raised, else
;; reached-at + SEAT_WINDOW), if the seat was not claimed: anyone may
;; call refund-many in batches of up to 100 donors (listed from the donate
;; print events) until every USDCx gift is back with the wallet that sent
;; it; USDCx sent straight to the contract goes to LAB with its claim.
;; LAB may claim-reserve any time from failure-at (no expiry).
;; Funds only ever go to LAB (claims) or back to donors (refunds). OWNER's
;; only power is release-seat, which can only pay LAB.
(define-constant OWNER tx-sender) ;; deployer: releases the seat to LAB, nothing else
(define-constant LAB 'SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF)
(define-constant FUNDRAISER 'SP12AVHNBR1K5BRAXP699V66CWK7PQTJJBT2H174F) ;; first-10K wallet: deposits the reserve
(define-constant USDCX_TOKEN 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant ASSET_USDCX "usdcx-token")
(define-constant SBTC_TOKEN 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant ASSET_SBTC "sbtc-token")
(define-constant TARGET u2000000000) ;; 2,000 USDCx (6 decimals)
(define-constant DEADLINE u1025386) ;; Bitcoin block: 972,826 (Oct 23, 2026) + 52,560
(define-constant SEAT_WINDOW u12960) ;; ~90 days from reached-at to claim the seat
(define-constant TERMS (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat u"Target: 2,000 USDCx for one Kairan's Seat, newly raised. "
  u"Reserve: the STX and sBTC raised for the first 10K in the fundraiser wallet SP12AVHNBR1K5BRAXP699V66CWK7PQTJJBT2H174F (about $200 at Oct 23, 2026 prices), which that wallet deposits once, in full minus STX network fees, into this contract with deposit-reserve; no one else can add to the reserve. ")
  u"Deadline: Bitcoin block 1,025,386 (about one year from Oct 23, 2026). ")
  u"Success: as soon as 2,000 USDCx is raised, LAB may claim it with a seat receipt naming the builder who takes Kairan's Seat, with links to their repo and to the grant post, crediting ocifarsito.com, plus the reserve as a bonus; gifts above the target are not accepted. ")
  u"Once 2,000 USDCx is raised, LAB has about 90 days (12,960 Bitcoin blocks) to post the seat receipt and have the owner release the seat to LAB; if that does not happen, every USDCx gift is refunded in full to the wallet that sent it. ")
  u"Failure: if 2,000 USDCx is not raised by the deadline, each donor gets every USDCx gift back in full, to the wallet that sent it; refunds can be triggered by anyone in batches after the deadline, or after LAB's 90-day seat window if the seat was not claimed. ")
  u"Reserve on failure: once refunds open, LAB may claim the reserve for the Builder Fund pool at any time, with no expiry; the reserve never goes to UASU Inc. ")
  u"No one, including UASU Inc. and the owner, can take or redirect donors' USDCx; the owner's only power is to release the seat to LAB after reviewing LAB's seat receipt. ")
  u"The contract enforces all of this. ")
  u"Kairan's Seat at Let Africa Build (LAB) is raised by UASU Inc. (a Delaware corporation, operating as Ocifarsito). ")
  u"Ocifarsito asks for new gifts mainly in the 1 to 2 weeks before a 10K that RaphaStacks and friends of the Kairan team run with RunThrough USA or similar organizations. ")
  u"Run locations are kept private, or shared only at the last minute, for safety. ")
  u"Run proofs are posted on ocifarsito.com and on X on a best-effort basis, with no guarantee of service. ")
  u"Every gift, reserve deposit, receipt, claim and refund is recorded on-chain, which is the official record; ocifarsito.com/kairans-seat also shows them, on a best-effort basis with no guarantee of service. ")
  u"After each run, LAB posts a public update (LAB Journal, tagging @ocifarsito on X) that states the amount raised in that round, the running total under Kairan's Seat, and its share of the 2,000 USDCx seat. ")
  u"LAB posts the seat receipt and accepts these terms; the owner then releases the seat to LAB after reviewing it. ")
  u"The seat receipt is the name or handle of the builder who takes Kairan's Seat, a link to their repo, and a link to LAB's public post announcing the grant (amount and what it funds, crediting ocifarsito.com). ")
  u"The builder who receives the seat is announced as holding \"Kairan's Seat\", with ocifarsito.com credited, in LAB's receipt and public posts. The owner reviews LAB's seat receipt in good faith and to the best of its ability before releasing the seat, but does not guarantee it; LAB alone is responsible for the accuracy of its receipts, and UASU Inc. is not liable if a receipt is wrong or misrepresented. ")
  u"The reserve claim on failure can only happen once refunds open, if LAB did not claim the seat; it needs a public pool receipt link and names no builder. ")
  u"If 2,000 USDCx is not raised by the deadline, or LAB does not claim the seat within its 90-day window, anyone may trigger the refunds in batches, and every USDCx gift made through this contract is returned in full to the wallet that sent it. ")
  u"USDCx sent to the contract without donate is not refundable and goes to LAB with its claim. ")
  u"This contract funds one Kairan's Seat; the next seat uses a new contract. ")
  u"Each quarter, LAB publishes a Builder Fund report listing every grant, its recipient, amount and repo links, crediting Kairan's Seat. ")
  u"LAB keeps a permanent Kairan's Seat entry with its running total on the LAB partners page. ")
  u"Let Africa Build (letafricabuild.com) agrees to these terms and accepts them on-chain when it posts the seat receipt or claims the reserve. ")
  u"Gifts are final except for the full USDCx refund if LAB does not claim the seat in time. ")
  u"USDCx is a third-party token; its value, peg and availability are outside UASU's control, and refunds are paid in the same USDCx amount given, not in US dollars. ")
  u"The STX and sBTC reserve is held as tokens and its value can go up or down; sBTC is a third-party token whose peg to bitcoin is outside UASU's control; LAB receives the reserve as tokens, whatever its value at claim, and UASU is not liable for any loss of value or depeg. ")
  u"Smart contracts and blockchains carry technical risk; UASU is not liable for losses from bugs, network failures, wallet errors or lost keys, except as required by law. ")
  u"LAB receives funds only at its wallet SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF; LAB is solely responsible for that wallet's keys, and UASU Inc. does not guarantee against funds lost if LAB loses access to it. ")
  u"This contract runs as-is, with no warranty of any kind. ")
  u"LAB routes 100% of what it receives to the LAB Open Source Builder Fund matching pool, recorded permanently as Kairan's Seat, to fund grants for African developers shipping open-source Bitcoin infrastructure. ")
  u"UASU Inc. (Ocifarsito) only raises and forwards gifts; once LAB claims, LAB alone is responsible for how those funds are used, and UASU Inc. has no liability for it. ")
  u"These terms are governed by the laws of the State of Delaware, USA, and any dispute is resolved only in the courts of Delaware."))
(define-constant DONOR_TERMS (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat u"Target: 2,000 USDCx for one Kairan's Seat, newly raised. "
  u"Reserve: the STX and sBTC raised for the first 10K in the fundraiser wallet SP12AVHNBR1K5BRAXP699V66CWK7PQTJJBT2H174F (about $200 at Oct 23, 2026 prices), which that wallet deposits once, in full minus STX network fees, into this contract with deposit-reserve; no one else can add to the reserve. ")
  u"Deadline: Bitcoin block 1,025,386 (about one year from Oct 23, 2026). ")
  u"Success: as soon as 2,000 USDCx is raised, LAB may claim it with a seat receipt naming the builder who takes Kairan's Seat, with links to their repo and to the grant post, crediting ocifarsito.com, plus the reserve as a bonus; gifts above the target are not accepted. ")
  u"Once 2,000 USDCx is raised, LAB has about 90 days (12,960 Bitcoin blocks) to post the seat receipt and have the owner release the seat to LAB; if that does not happen, every USDCx gift is refunded in full to the wallet that sent it. ")
  u"Failure: if 2,000 USDCx is not raised by the deadline, each donor gets every USDCx gift back in full, to the wallet that sent it; refunds can be triggered by anyone in batches after the deadline, or after LAB's 90-day seat window if the seat was not claimed. ")
  u"Reserve on failure: once refunds open, LAB may claim the reserve for the Builder Fund pool at any time, with no expiry; the reserve never goes to UASU Inc. ")
  u"No one, including UASU Inc. and the owner, can take or redirect donors' USDCx; the owner's only power is to release the seat to LAB after reviewing LAB's seat receipt. ")
  u"The contract enforces all of this. ")
  u"Kairan's Seat is raised by UASU Inc. (a Delaware corporation, operating as Ocifarsito); by giving through this contract you accept these donor terms. ")
  u"Gifts are voluntary. ")
  u"Gifts are final except for the full USDCx refund if LAB does not claim the seat in time. ")
  u"A gift may not exceed the amount still needed to reach the target. ")
  u"If 2,000 USDCx is not raised by the deadline, or LAB does not claim the seat within its 90-day window, anyone may trigger the refunds in batches, and every USDCx gift made through this contract is returned in full to the wallet that sent it. ")
  u"Reserve deposits and USDCx sent straight to the contract are not gifts and are not refunded. ")
  u"Gifts are not tax-deductible: UASU Inc. is a for-profit company and Let Africa Build (LAB) is not a US 501(c)(3) charity. ")
  u"Donors receive no goods or services in return for a gift. ")
  u"This contract runs as-is, with no warranty of any kind. ")
  u"USDCx is a third-party token; its value, peg and availability are outside UASU's control, and refunds are paid in the same USDCx amount given, not in US dollars. ")
  u"The STX and sBTC reserve is held as tokens and its value can go up or down; sBTC is a third-party token whose peg to bitcoin is outside UASU's control; LAB receives the reserve as tokens, whatever its value at claim, and UASU is not liable for any loss of value or depeg. ")
  u"Smart contracts and blockchains carry technical risk; UASU is not liable for losses from bugs, network failures, wallet errors or lost keys, except as required by law. ")
  u"LAB receives funds only at its wallet SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF; LAB is solely responsible for that wallet's keys, and UASU Inc. does not guarantee against funds lost if LAB loses access to it. ")
  u"Every gift, reserve deposit, claim and refund is recorded on-chain, which is the official record; ocifarsito.com/kairans-seat also shows them, on a best-effort basis with no guarantee of service. ")
  u"Ocifarsito does not hold or control funds once LAB claims them, and LAB alone is responsible for how claimed funds are used. The owner reviews LAB's seat receipt in good faith and to the best of its ability before releasing the seat, but does not guarantee it; LAB alone is responsible for the accuracy of its receipts, and UASU Inc. is not liable if a receipt is wrong or misrepresented. ")
  u"These terms are governed by the laws of the State of Delaware, USA, and any dispute is resolved only in the courts of Delaware."))

(define-constant ERR_NOT_OWNER (err u100))
(define-constant ERR_NOT_LAB (err u101))
(define-constant ERR_AMOUNT_ZERO (err u102))
(define-constant ERR_TERMS_NOT_ACCEPTED (err u103))
(define-constant ERR_URL_EMPTY (err u104)) ;; empty url or seat receipt field
(define-constant ERR_NOT_FUNDRAISER (err u105))
(define-constant ERR_CLAIMED (err u106)) ;; seat or reserve already claimed / swept
(define-constant ERR_NO_REQUEST (err u107))
;; u108 retired (was ERR_NOT_APPROVED; release-seat replaces approve + claim)
(define-constant ERR_TARGET_NOT_REACHED (err u109))
(define-constant ERR_OVER_TARGET (err u110)) ;; gift above the remaining amount
(define-constant ERR_RESERVE_DEPOSITED (err u111)) ;; deposit-reserve runs once
(define-constant ERR_TOO_EARLY (err u112)) ;; failure path before failure-at
(define-constant ERR_TOO_LATE (err u113)) ;; raising / seat path past its window
(define-constant ERR_SEAT_CLAIMED (err u114)) ;; no refunds after the seat claim

(define-data-var total uint u0) ;; USDCx given through donate
(define-data-var unrefunded uint u0) ;; gifts not refunded yet
(define-map gifts principal uint) ;; unrefunded gift per donor
(define-data-var reserve-deposited bool false)
(define-data-var reached-at (optional uint) none) ;; burn height when total hit TARGET
;; LAB's pending seat receipt (LAB accepted TERMS when filing it); a new
;; request replaces it. builder = name or
;; handle of the builder taking Kairan's Seat, repo = link to their repo,
;; grant = link to LAB's public post announcing the grant.
(define-data-var seat-request (optional {
  builder: (string-ascii 128),
  repo: (string-ascii 256),
  grant: (string-ascii 256),
})
  none
)
;; Where the reserve went: kind "seat" (LAB, success: builder, repo, grant
;; post in link), "reserve" (LAB, failure: pool receipt in link).
(define-data-var claim (optional {
  kind: (string-ascii 7),
  burn-height: uint,
  builder: (string-ascii 128),
  repo: (string-ascii 256),
  link: (string-ascii 256),
  usdcx: uint,
  stx: uint,
  sats: uint,
})
  none
)

(define-read-only (get-terms)
  TERMS
)

(define-read-only (get-donor-terms)
  DONOR_TERMS
)

(define-read-only (get-donor (who principal))
  (map-get? gifts who)
)

(define-read-only (get-seat-request)
  (var-get seat-request)
)

(define-read-only (get-claim)
  (var-get claim)
)

(define-read-only (usdcx-balance)
  (unwrap-panic (contract-call? 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx get-balance current-contract))
)

;; The reserve is every STX and sBTC the contract holds.
(define-read-only (reserve-stx)
  (stx-get-balance current-contract)
)

(define-read-only (reserve-sats)
  (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance current-contract))
)

;; Seat path ends / failure path starts: DEADLINE if TARGET was never
;; raised, else reached-at + SEAT_WINDOW (may run past DEADLINE).
(define-read-only (failure-at)
  (match (var-get reached-at)
    r (+ r SEAT_WINDOW)
    DEADLINE
  )
)

(define-private (seat-claimed)
  (match (var-get claim)
    c (is-eq (get kind c) "seat")
    false
  )
)

(define-read-only (get-status)
  {
    lab: LAB,
    owner: OWNER,
    fundraiser: FUNDRAISER,
    target: TARGET,
    total: (var-get total),
    remaining: (- TARGET (var-get total)),
    unrefunded: (var-get unrefunded),
    deadline: DEADLINE,
    reached-at: (var-get reached-at),
    failure-at: (failure-at),
    usdcx-balance: (usdcx-balance),
    reserve-stx: (reserve-stx),
    reserve-sats: (reserve-sats),
    reserve-deposited: (var-get reserve-deposited),
    seat-request: (var-get seat-request),
    claim: (var-get claim),
    refunds-open: (and (>= burn-block-height (failure-at)) (not (seat-claimed))),
    closed: (or (seat-claimed) (and (is-some (var-get claim)) (is-eq (var-get unrefunded) u0))),
  }
)

;; Raising: before DEADLINE and nothing claimed.
(define-private (check-raising)
  (begin
    (asserts! (is-none (var-get claim)) ERR_CLAIMED)
    (asserts! (< burn-block-height DEADLINE) ERR_TOO_LATE)
    (ok true)
  )
)

;; Seat path: nothing claimed and before failure-at.
(define-private (check-seat)
  (begin
    (asserts! (is-none (var-get claim)) ERR_CLAIMED)
    (asserts! (< burn-block-height (failure-at)) ERR_TOO_LATE)
    (ok true)
  )
)

;; Refunds open: from failure-at, unless LAB claimed the seat.
(define-private (check-refunds)
  (begin
    (asserts! (>= burn-block-height (failure-at)) ERR_TOO_EARLY)
    (asserts! (not (seat-claimed)) ERR_SEAT_CLAIMED)
    (ok true)
  )
)

;; Sends `usdcx` USDCx, `stx` STX and `sats` sBTC from the contract to `to`.
(define-private (pay
    (usdcx uint)
    (stx uint)
    (sats uint)
    (to principal)
  )
  (as-contract? (
      (with-ft USDCX_TOKEN ASSET_USDCX usdcx)
      (with-stx stx)
      (with-ft SBTC_TOKEN ASSET_SBTC sats)
    )
    (and (> usdcx u0)
      (try! (contract-call? USDCX_TOKEN transfer usdcx current-contract to none))
    )
    (and (> stx u0) (try! (stx-transfer? stx current-contract to)))
    (and (> sats u0)
      (try! (contract-call? SBTC_TOKEN transfer sats current-contract to none))
    )
  )
)

;; Records where the whole STX + sBTC reserve (and `usdcx` USDCx) went.
(define-private (record-claim
    (kind (string-ascii 7))
    (builder (string-ascii 128))
    (repo (string-ascii 256))
    (link (string-ascii 256))
    (usdcx uint)
    (stx uint)
    (sats uint)
  )
  (begin
    (var-set claim
      (some {
        kind: kind,
        burn-height: burn-block-height,
        builder: builder,
        repo: repo,
        link: link,
        usdcx: usdcx,
        stx: stx,
        sats: sats,
      })
    )
    (var-set seat-request none)
    (print {
      event: kind,
      builder: builder,
      repo: repo,
      link: link,
      usdcx: usdcx,
      stx: stx,
      sats: sats,
      terms-hash: (sha256 (unwrap-panic (to-consensus-buff? TERMS))),
    })
  )
)

;; Anyone gives USDCx up to the remaining amount, accepting DONOR_TERMS,
;; before DEADLINE. The print event (donor, amount) is how the page and
;; keepers list donors for refund-many.
(define-public (donate
    (amount uint)
    (agree-to-terms bool)
  )
  (begin
    (asserts! agree-to-terms ERR_TERMS_NOT_ACCEPTED)
    (asserts! (> amount u0) ERR_AMOUNT_ZERO)
    (try! (check-raising))
    (asserts! (<= amount (- TARGET (var-get total))) ERR_OVER_TARGET)
    (map-set gifts tx-sender (+ (default-to u0 (map-get? gifts tx-sender)) amount))
    (try! (contract-call? USDCX_TOKEN transfer amount tx-sender current-contract none))
    (var-set total (+ (var-get total) amount))
    (var-set unrefunded (+ (var-get unrefunded) amount))
    (and (is-eq (var-get total) TARGET) (var-set reached-at (some burn-block-height)))
    (print {
      event: "donate",
      donor: tx-sender,
      amount: amount,
      total: (var-get total),
    })
    (ok (var-get total))
  )
)

;; FUNDRAISER deposits the STX + sBTC reserve, once, any time before a claim.
;; Not a gift: never refunded.
(define-public (deposit-reserve
    (stx uint)
    (sats uint)
  )
  (begin
    (asserts! (is-eq contract-caller FUNDRAISER) ERR_NOT_FUNDRAISER)
    (asserts! (not (var-get reserve-deposited)) ERR_RESERVE_DEPOSITED)
    (asserts! (or (> stx u0) (> sats u0)) ERR_AMOUNT_ZERO)
    (asserts! (is-none (var-get claim)) ERR_CLAIMED)
    (and (> stx u0) (try! (stx-transfer? stx tx-sender current-contract)))
    (and (> sats u0)
      (try! (contract-call? SBTC_TOKEN transfer sats tx-sender current-contract none))
    )
    (var-set reserve-deposited true)
    (print {
      event: "deposit-reserve",
      stx: stx,
      sats: sats,
    })
    (ok true)
  )
)

;; LAB files the seat receipt and accepts TERMS once TARGET is raised, before
;; failure-at: builder (name or handle of the builder taking Kairan's Seat),
;; repo (link to their repo) and grant (link to LAB's public post announcing
;; the grant, amount and what it funds, crediting ocifarsito.com). A new
;; request replaces the old one. Moves no funds.
(define-public (request-seat
    (builder (string-ascii 128))
    (repo (string-ascii 256))
    (grant (string-ascii 256))
    (agree-to-terms bool)
  )
  (begin
    (asserts! (is-eq contract-caller LAB) ERR_NOT_LAB)
    (asserts! agree-to-terms ERR_TERMS_NOT_ACCEPTED)
    (asserts! (is-eq (var-get total) TARGET) ERR_TARGET_NOT_REACHED)
    (try! (check-seat))
    (asserts! (> (len builder) u0) ERR_URL_EMPTY)
    (asserts! (> (len repo) u0) ERR_URL_EMPTY)
    (asserts! (> (len grant) u0) ERR_URL_EMPTY)
    (var-set seat-request (some {
      builder: builder,
      repo: repo,
      grant: grant,
    }))
    (print {
      event: "request-seat",
      builder: builder,
      repo: repo,
      grant: grant,
      terms-hash: (sha256 (unwrap-panic (to-consensus-buff? TERMS))),
    })
    (ok true)
  )
)

;; SUCCESS, before failure-at: OWNER reviews LAB's pending seat receipt and
;; releases the seat in one tx: LAB receives all the USDCx (TARGET plus any
;; USDCx sent straight to the contract) and the whole reserve, and the claim
;; is recorded with the three receipt fields. Pays only LAB. Closes the
;; contract.
(define-public (release-seat)
  (let (
      (stx (reserve-stx))
      (sats (reserve-sats))
    )
    (asserts! (is-eq contract-caller OWNER) ERR_NOT_OWNER)
    (try! (check-seat))
    (let (
        (request (unwrap! (var-get seat-request) ERR_NO_REQUEST))
        (usdcx (usdcx-balance))
      )
      (try! (pay usdcx stx sats LAB))
      (var-set unrefunded u0)
      (record-claim "seat" (get builder request) (get repo request)
        (get grant request) usdcx stx sats
      )
      (ok {
        usdcx: usdcx,
        stx: stx,
        sats: sats,
      })
    )
  )
)

;; FAILURE: any time from failure-at, if the seat was not claimed,
;; LAB accepts TERMS and claims the whole STX + sBTC reserve, plus any USDCx
;; not owed to donors (balance above the unrefunded gifts, i.e. sent
;; straight to the contract), for the Builder Fund pool with a pool receipt
;; link. No builder, no owner approval. Refunds are never reduced.
(define-public (claim-reserve
    (url (string-ascii 256))
    (agree-to-terms bool)
  )
  (let (
      (stx (reserve-stx))
      (sats (reserve-sats))
      (bal (usdcx-balance))
      (owed (var-get unrefunded))
      (extra (if (> bal owed) (- bal owed) u0))
    )
    (asserts! (is-eq contract-caller LAB) ERR_NOT_LAB)
    (asserts! agree-to-terms ERR_TERMS_NOT_ACCEPTED)
    (asserts! (is-none (var-get claim)) ERR_CLAIMED)
    (asserts! (>= burn-block-height (failure-at)) ERR_TOO_EARLY)
    (asserts! (> (len url) u0) ERR_URL_EMPTY)
    (try! (pay extra stx sats LAB))
    (record-claim "reserve" "" "" url extra stx sats)
    (ok {
      usdcx: extra,
      stx: stx,
      sats: sats,
    })
  )
)

;; Pays one donor back their unrefunded gift in full and zeroes it; unknown
;; or already refunded donors are skipped. Runs inside refund-many's
;; as-contract?.
(define-private (refund-one
    (who principal)
    (acc (response uint uint))
  )
  (let (
      (paid (try! acc))
      (gift (default-to u0 (map-get? gifts who)))
    )
    (if (> gift u0)
      (begin
        (try! (contract-call? USDCX_TOKEN transfer gift current-contract who none))
        (map-set gifts who u0)
        (print {
          event: "refund",
          donor: who,
          amount: gift,
        })
        (ok (+ paid gift))
      )
      (ok paid)
    )
  )
)

;; FAILURE: anyone, any number of times, from failure-at unless the seat was
;; claimed, refunds up to 100 listed donors their gifts in full, to the
;; wallet that sent them. A donor listed twice, or in two calls, is refunded
;; once (the gift is zeroed).
(define-public (refund-many (who (list 100 principal)))
  (let ((due (var-get unrefunded)))
    (try! (check-refunds))
    (let ((paid (try! (as-contract? ((with-ft USDCX_TOKEN ASSET_USDCX due))
        (try! (fold refund-one who (ok u0)))
      ))))
      (var-set unrefunded (- due paid))
      (print {
        event: "refund-many",
        refunded: paid,
        unrefunded: (- due paid),
      })
      (ok paid)
    )
  )
)
