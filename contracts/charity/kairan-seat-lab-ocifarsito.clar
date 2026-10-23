;; kairan-seat-lab-ocifarsito: Kairan's Seat at Let Africa Build (LAB), raised by Ocifarsito.
;; Anyone may donate STX or sBTC (accepting DONOR_TERMS) until an emergency.
;; After each 10K, a Kairan team runner posts proof (post-run), which locks the current
;; unlocked balance as run N (0, 1, 2, ...). LAB claims a run with its public
;; update link and pays itself 100% of that run. Gifts after a run stay unlocked
;; until the next one. Emergency: OWNER sends the whole balance to OCIFARSITO
;; and freezes the contract for good.
(define-constant OWNER tx-sender) ;; deployer: emergency withdraw + sync only
(define-constant OCIFARSITO 'SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q) ;; ocifarsito.btc
(define-constant LAB 'SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF)
(define-constant SBTC_TOKEN 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant ASSET_SBTC "sbtc-token")
(define-constant TERMS (concat (concat (concat (concat (concat (concat (concat (concat (concat (concat u"Kairan's Seat at Let Africa Build (LAB), raised by UASU Inc. (a Delaware corporation, operating as Ocifarsito). "
  u"Ocifarsito asks for new gifts mainly in the 1 to 2 weeks before a 10K that RaphaStacks and friends of the Kairan team run with RunThrough USA or similar organizations. ")
  u"Run locations are kept private, or shared only at the last minute, for safety. ")
  u"After each run, a runner on the Kairan team (ocifarsito.btc, or a friend the owner approves on-chain) posts proof on-chain (a link to the run post on X and a hash of the proof photo), which locks the gifts raised so far as that run's round. ")
  u"Every proof, run round and LAB update is recorded on-chain, which is the official record; ocifarsito.com/kairans-seat also shows them, on a best-effort basis with no guarantee of service. ")
  u"LAB unlocks 100% of a run's round by claiming it with a public update link (LAB Journal, tagging @ocifarsito on X). Each update states the round amount, the new running total under Kairan's Seat, and every Builder Fund grant paid since the previous round (recipient or project, amount, and a link to the repo or transaction), with Kairan's Seat's share of the pool at that time. LAB keeps a permanent Kairan's Seat entry with its running total on the LAB partners page. Let Africa Build (letafricabuild.com) agrees to these terms and accepts them on-chain each time it claims. ")
  u"LAB routes 100% of what it receives to the LAB Open Source Builder Fund matching pool, recorded permanently as Kairan's Seat, to fund grants for African developers shipping open-source Bitcoin infrastructure. ")
  u"In an emergency (for example if LAB's keys are lost) the owner may freeze the contract and move all funds to UASU Inc. (Ocifarsito), which then picks a new recipient or uses them at its own discretion. ")
  u"The owner may also count gifts sent straight to the contract. ")
  u"UASU Inc. (Ocifarsito) only raises and forwards gifts; once LAB claims a round, LAB alone is responsible for how those funds are used, and UASU Inc. has no liability for it. ")
  u"These terms are governed by the laws of the State of Delaware, USA, and any dispute is resolved only in the courts of Delaware."))
(define-constant DONOR_TERMS (concat (concat (concat (concat (concat (concat (concat u"Kairan's Seat is raised by UASU Inc. (a Delaware corporation, operating as Ocifarsito); by giving through this contract you accept these donor terms. "
  u"Gifts are voluntary and final. ")
  u"Gifts are not tax-deductible: UASU Inc. is a for-profit company and Let Africa Build (LAB) is not a US 501(c)(3) charity. ")
  u"Donors receive no goods or services in return for a gift. ")
  u"This contract runs as-is, with no warranty of any kind. ")
  u"Ocifarsito does not hold or control funds once LAB claims them, and LAB alone is responsible for how claimed funds are used. ")
  u"In an emergency (for example if LAB's keys are lost) the owner may freeze the contract and move all funds to UASU Inc. (Ocifarsito), which then picks a new recipient or uses them at its own discretion. ")
  u"These terms are governed by the laws of the State of Delaware, USA, and any dispute is resolved only in the courts of Delaware."))

(define-constant ERR_NOT_OWNER (err u100))
(define-constant ERR_NOT_LAB (err u101))
(define-constant ERR_AMOUNT_ZERO (err u102)) ;; zero gift, or nothing to lock
(define-constant ERR_TERMS_NOT_ACCEPTED (err u103))
(define-constant ERR_NOT_RUNNER (err u104))
(define-constant ERR_NO_RUN (err u105))
(define-constant ERR_RUN_CLAIMED (err u106))
(define-constant ERR_RUN_CANCELLED (err u107))
(define-constant ERR_URL_EMPTY (err u108))
(define-constant ERR_FROZEN (err u109)) ;; after emergency-withdraw

(define-data-var donated-stx uint u0)
(define-data-var donated-sats uint u0)
(define-data-var paid-stx uint u0)
(define-data-var paid-sats uint u0)
(define-data-var locked-stx uint u0) ;; held for unclaimed runs
(define-data-var locked-sats uint u0)
(define-data-var run-count uint u0)
(define-data-var frozen-at (optional uint) none)
(define-data-var withdrawn-stx uint u0) ;; emergency-withdraw totals
(define-data-var withdrawn-sats uint u0)

(define-map runners principal bool) ;; Kairan team members who may post runs
(map-set runners OCIFARSITO true)

(define-map runs
  uint
  {
    burn-height: uint,
    runner: principal,
    url: (string-ascii 256),
    proof-hash: (buff 32),
    stx: uint,
    sats: uint,
    cancelled: bool,
    claimed: (optional {
      burn-height: uint,
      url: (string-ascii 256),
    }),
  }
)

(define-read-only (get-terms)
  TERMS
)

(define-read-only (get-donor-terms)
  DONOR_TERMS
)

(define-read-only (is-runner (who principal))
  (default-to false (map-get? runners who))
)

(define-read-only (get-run (id uint))
  (map-get? runs id)
)

(define-read-only (get-status)
  {
    lab: LAB,
    runner: OCIFARSITO,
    owner: OWNER,
    donated-stx: (var-get donated-stx),
    donated-sats: (var-get donated-sats),
    paid-stx: (var-get paid-stx),
    paid-sats: (var-get paid-sats),
    locked-stx: (var-get locked-stx),
    locked-sats: (var-get locked-sats),
    run-count: (var-get run-count),
    frozen-at: (var-get frozen-at),
    withdrawn-stx: (var-get withdrawn-stx),
    withdrawn-sats: (var-get withdrawn-sats),
    balance-stx: (stx-get-balance current-contract),
  }
)

(define-private (sbtc-balance)
  (unwrap-panic (contract-call? SBTC_TOKEN get-balance current-contract))
)

;; Anyone may give, accepting DONOR_TERMS, until an emergency.
(define-public (donate-stx
    (amount uint)
    (agree-to-terms bool)
  )
  (begin
    (asserts! agree-to-terms ERR_TERMS_NOT_ACCEPTED)
    (asserts! (> amount u0) ERR_AMOUNT_ZERO)
    (asserts! (is-none (var-get frozen-at)) ERR_FROZEN)
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

(define-public (donate-sbtc
    (amount uint)
    (agree-to-terms bool)
  )
  (begin
    (asserts! agree-to-terms ERR_TERMS_NOT_ACCEPTED)
    (asserts! (> amount u0) ERR_AMOUNT_ZERO)
    (asserts! (is-none (var-get frozen-at)) ERR_FROZEN)
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

;; A Kairan team runner posts run proof; locks the whole unlocked balance as run N.
(define-public (post-run
    (url (string-ascii 256))
    (proof-hash (buff 32))
  )
  (let (
      (id (var-get run-count))
      (stx (- (stx-get-balance current-contract) (var-get locked-stx)))
      (sats (- (sbtc-balance) (var-get locked-sats)))
    )
    (asserts! (is-runner contract-caller) ERR_NOT_RUNNER)
    (asserts! (is-none (var-get frozen-at)) ERR_FROZEN)
    (asserts! (> (len url) u0) ERR_URL_EMPTY)
    (asserts! (or (> stx u0) (> sats u0)) ERR_AMOUNT_ZERO)
    (map-set runs id {
      runner: contract-caller,
      burn-height: burn-block-height,
      url: url,
      proof-hash: proof-hash,
      stx: stx,
      sats: sats,
      cancelled: false,
      claimed: none,
    })
    (var-set run-count (+ id u1))
    (var-set locked-stx (+ (var-get locked-stx) stx))
    (var-set locked-sats (+ (var-get locked-sats) sats))
    (print {
      event: "run",
      runner: contract-caller,
      id: id,
      url: url,
      proof-hash: proof-hash,
      stx: stx,
      sats: sats,
    })
    (ok {
      id: id,
      stx: stx,
      sats: sats,
    })
  )
)

;; LAB accepts TERMS, posts its public update link, and takes 100% of run id.
(define-public (claim-run
    (id uint)
    (url (string-ascii 256))
    (agree-to-terms bool)
  )
  (let (
      (run (unwrap! (map-get? runs id) ERR_NO_RUN))
      (stx (get stx run))
      (sats (get sats run))
    )
    (asserts! (is-eq contract-caller LAB) ERR_NOT_LAB)
    (asserts! agree-to-terms ERR_TERMS_NOT_ACCEPTED)
    (asserts! (> (len url) u0) ERR_URL_EMPTY)
    (asserts! (is-none (get claimed run)) ERR_RUN_CLAIMED)
    (asserts! (not (get cancelled run)) ERR_RUN_CANCELLED)
    (asserts! (is-none (var-get frozen-at)) ERR_FROZEN)
    (try! (as-contract? (
        (with-stx stx)
        (with-ft SBTC_TOKEN ASSET_SBTC sats)
      )
      (and (> stx u0) (try! (stx-transfer? stx current-contract LAB)))
      (and (> sats u0)
        (try! (contract-call? SBTC_TOKEN transfer sats current-contract LAB none))
      )
    ))
    (map-set runs id
      (merge run { claimed: (some {
        burn-height: burn-block-height,
        url: url,
      }) }
      ))
    (var-set locked-stx (- (var-get locked-stx) stx))
    (var-set locked-sats (- (var-get locked-sats) sats))
    (var-set paid-stx (+ (var-get paid-stx) stx))
    (var-set paid-sats (+ (var-get paid-sats) sats))
    (print {
      event: "claim-run",
      id: id,
      lab: LAB,
      url: url,
      stx: stx,
      sats: sats,
      terms-hash: (sha256 (unwrap-panic (to-consensus-buff? TERMS))),
    })
    (ok {
      id: id,
      stx: stx,
      sats: sats,
    })
  )
)

;; Emergency (OWNER, once), e.g. if LAB's keys are lost: sends the whole
;; balance (locked included) to OCIFARSITO and freezes the contract, so
;; donate, post-run, claim-run and sync-donations fail afterwards.
(define-public (emergency-withdraw)
  (let (
      (stx (stx-get-balance current-contract))
      (sats (sbtc-balance))
    )
    (asserts! (is-eq contract-caller OWNER) ERR_NOT_OWNER)
    (asserts! (is-none (var-get frozen-at)) ERR_FROZEN)
    (try! (as-contract? (
        (with-stx stx)
        (with-ft SBTC_TOKEN ASSET_SBTC sats)
      )
      (and (> stx u0) (try! (stx-transfer? stx current-contract OCIFARSITO)))
      (and (> sats u0)
        (try! (contract-call? SBTC_TOKEN transfer sats current-contract OCIFARSITO none))
      )
    ))
    (var-set frozen-at (some burn-block-height))
    (var-set withdrawn-stx stx)
    (var-set withdrawn-sats sats)
    (var-set locked-stx u0)
    (var-set locked-sats u0)
    (print {
      event: "emergency-withdraw",
      to: OCIFARSITO,
      stx: stx,
      sats: sats,
    })
    (ok {
      stx: stx,
      sats: sats,
    })
  )
)

;; Owner counts gifts sent straight to the contract (not through donate):
;; donated = balance + paid + withdrawn, so the books match the chain.
(define-public (sync-donations)
  (let (
      (stx-seen (+ (stx-get-balance current-contract) (var-get paid-stx) (var-get withdrawn-stx)))
      (sats-seen (+ (sbtc-balance) (var-get paid-sats) (var-get withdrawn-sats)))
      (stx-extra (- stx-seen (var-get donated-stx)))
      (sats-extra (- sats-seen (var-get donated-sats)))
    )
    (asserts! (is-eq contract-caller OWNER) ERR_NOT_OWNER)
    (asserts! (is-none (var-get frozen-at)) ERR_FROZEN)
    (var-set donated-stx stx-seen)
    (var-set donated-sats sats-seen)
    (print {
      event: "sync-donations",
      stx: stx-extra,
      sats: sats-extra,
    })
    (ok {
      stx: stx-extra,
      sats: sats-extra,
    })
  )
)

;; Owner adds or removes a Kairan team runner (ocifarsito.btc is one from the start).
(define-public (set-runner
    (who principal)
    (allowed bool)
  )
  (begin
    (asserts! (is-eq contract-caller OWNER) ERR_NOT_OWNER)
    (map-set runners who allowed)
    (print {
      event: "set-runner",
      who: who,
      allowed: allowed,
    })
    (ok true)
  )
)

;; Owner cancels an unclaimed run (posted too early or by mistake): its funds
;; go back to the unlocked balance, ready for the next post-run. Moves nothing.
(define-public (cancel-run (id uint))
  (let ((run (unwrap! (map-get? runs id) ERR_NO_RUN)))
    (asserts! (is-eq contract-caller OWNER) ERR_NOT_OWNER)
    (asserts! (is-none (var-get frozen-at)) ERR_FROZEN)
    (asserts! (is-none (get claimed run)) ERR_RUN_CLAIMED)
    (asserts! (not (get cancelled run)) ERR_RUN_CANCELLED)
    (map-set runs id (merge run { cancelled: true }))
    (var-set locked-stx (- (var-get locked-stx) (get stx run)))
    (var-set locked-sats (- (var-get locked-sats) (get sats run)))
    (print {
      event: "cancel-run",
      id: id,
      stx: (get stx run),
      sats: (get sats run),
    })
    (ok true)
  )
)
