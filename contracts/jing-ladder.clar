;; jing-ladder
;;
;; Registry of the pooled limit makers on markets-sbtc-stx-jing-v5: one
;; jing-buy-stx (rests sBTC, buys STX) or jing-sell-stx (rests STX, sells
;; STX) contract per price, named the way the FE speaks. Anyone
;; deploys one from the template at a new price; it registers itself here at
;; `initialize`, and the registry accepts it only if its code hash equals the
;; canonical deploy's for that side (contract-hash?, the jing-core pattern:
;; the owner verifies ONE canonical per side, every identical deploy is then
;; permissionless). The price lives in a data-var set at initialize, not in
;; the code, so every rung shares the canonical hash. One contract per
;; (side, price): a second deploy at a taken price is refused.
;;
;; Prices here are the human number the rung is named after: hundredths of a
;; sat per STX (jing-buy-stx-331-50 -> u33150). The rung derives the market
;; unit itself.

(define-constant ERR_NOT_AUTHORIZED (err u6001))
(define-constant ERR_INVALID_CONTRACT_HASH (err u6002))
(define-constant ERR_NOT_VERIFIED (err u6003))
(define-constant ERR_HASH_MISMATCH (err u6004))
(define-constant ERR_ALREADY_REGISTERED (err u6005))
(define-constant ERR_PRICE_TAKEN (err u6006))
(define-constant ERR_BAD_SIDE (err u6007))
(define-constant ERR_NO_PENDING_OWNER (err u6008))
(define-constant ERR_TIMELOCK_NOT_ELAPSED (err u6009))
(define-constant ERR_NOT_REGISTERED (err u6010))

;; owner handover: propose, then accept once this many burn blocks passed
(define-constant TIMELOCK_BURN_BLOCKS u144)

(define-constant SIDE_BUY_STX "buy-stx")
(define-constant SIDE_SELL_STX "sell-stx")
;; pegged rungs (jing-buy/sell-stx-market-spread): own canonical per side,
;; keyed by cents * 10000 + spread-bps
(define-constant SIDE_BUY_PEG "buy-peg")
(define-constant SIDE_SELL_PEG "sell-peg")

(define-data-var contract-owner principal tx-sender)
(define-data-var pending-owner (optional principal) none)
(define-data-var proposed-at uint u0)
;; the blessed deploy per side; its code hash is what every rung must match
(define-map canonical
  (string-ascii 8)
  principal
)
;; (side, price) -> the contract holding that rung
(define-map rungs
  {
    side: (string-ascii 8),
    price: uint,
  }
  principal
)
;; contract -> its rung
(define-map registered
  principal
  {
    side: (string-ascii 8),
    price: uint,
  }
)

(define-read-only (get-owner)
  (var-get contract-owner)
)

(define-read-only (get-pending-owner)
  {
    pending: (var-get pending-owner),
    eligible-at: (+ (var-get proposed-at) TIMELOCK_BURN_BLOCKS),
  }
)

(define-read-only (get-canonical (side (string-ascii 8)))
  (map-get? canonical side)
)

(define-read-only (get-rung
    (side (string-ascii 8))
    (price uint)
  )
  (map-get? rungs {
    side: side,
    price: price,
  })
)

(define-read-only (get-registered (who principal))
  (map-get? registered who)
)

(define-read-only (is-registered (who principal))
  (is-some (map-get? registered who))
)

(define-private (valid-side (side (string-ascii 8)))
  (or
    (is-eq side SIDE_BUY_STX) (is-eq side SIDE_SELL_STX)
    (is-eq side SIDE_BUY_PEG) (is-eq side SIDE_SELL_PEG)
  )
)

;; Owner: bless one deployed instance per side. Its code hash, read at
;; register time, is the only hash the registry accepts for that side.
(define-public (set-canonical
    (side (string-ascii 8))
    (contract principal)
  )
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_NOT_AUTHORIZED)
    (asserts! (valid-side side) ERR_BAD_SIDE)
    (map-set canonical side contract)
    (print {
      event: "canonical-set",
      side: side,
      contract: contract,
    })
    (ok true)
  )
)

;; Called by a jing-buy-stx / jing-sell-stx from its own `initialize`:
;; contract-caller is the rung. Its code hash must equal the canonical
;; deploy's for that side; the price must be free. `market-price` is the
;; rung's derived price in the market unit, logged for the indexer.
(define-public (register
    (side (string-ascii 8))
    (price uint)
    (market-price uint)
  )
  (let (
      (caller contract-caller)
      (caller-hash (unwrap! (contract-hash? caller) ERR_INVALID_CONTRACT_HASH))
      (canon (unwrap! (map-get? canonical side) ERR_NOT_VERIFIED))
    )
    (asserts!
      (is-eq caller-hash (unwrap! (contract-hash? canon) ERR_INVALID_CONTRACT_HASH))
      ERR_HASH_MISMATCH
    )
    (asserts! (is-none (map-get? registered caller)) ERR_ALREADY_REGISTERED)
    (asserts!
      (is-none (map-get? rungs {
        side: side,
        price: price,
      }))
      ERR_PRICE_TAKEN
    )
    (map-set rungs {
      side: side,
      price: price,
    }
      caller
    )
    (map-set registered caller {
      side: side,
      price: price,
    })
    (print {
      event: "rung-registered",
      side: side,
      price: price,
      market-price: market-price,
      contract: caller,
      hash: caller-hash,
    })
    (ok true)
  )
)

;; ---------- rung event log ----------
;; Rungs print through the ladder, the jing-core pattern: one contract to
;; subscribe to for every rung, and only a registered rung can emit.

(define-private (rung-of (who principal))
  (ok (unwrap! (map-get? registered who) ERR_NOT_REGISTERED))
)

(define-public (log-deposit
    (member principal)
    (amount uint)
    (shares uint)
    (epoch uint)
    (pushed bool)
    (held uint)
  )
  (let ((rung (try! (rung-of contract-caller))))
    (print {
      event: "rung-deposit",
      rung: contract-caller,
      side: (get side rung),
      price: (get price rung),
      member: member,
      amount: amount,
      shares: shares,
      epoch: epoch,
      pushed: pushed,
      held: held,
    })
    (ok true)
  )
)

(define-public (log-withdraw
    (member principal)
    (amount uint)
    (shares uint)
    (epoch uint)
    (held uint)
  )
  (let ((rung (try! (rung-of contract-caller))))
    (print {
      event: "rung-withdraw",
      rung: contract-caller,
      side: (get side rung),
      price: (get price rung),
      member: member,
      amount: amount,
      shares: shares,
      epoch: epoch,
      held: held,
    })
    (ok true)
  )
)

(define-public (log-claim
    (member principal)
    (amount uint)
    (epoch uint)
  )
  (let ((rung (try! (rung-of contract-caller))))
    (print {
      event: "rung-claim",
      rung: contract-caller,
      side: (get side rung),
      price: (get price rung),
      member: member,
      amount: amount,
      epoch: epoch,
    })
    (ok true)
  )
)

(define-public (log-epoch-closed
    (epoch uint)
    (final-proceeds-index uint)
  )
  (let ((rung (try! (rung-of contract-caller))))
    (print {
      event: "rung-epoch-closed",
      rung: contract-caller,
      side: (get side rung),
      price: (get price rung),
      epoch: epoch,
      final-proceeds-index: final-proceeds-index,
    })
    (ok true)
  )
)

;; Two-step handover with a cooldown: the owner proposes (none cancels), the
;; proposed owner accepts, and only after TIMELOCK_BURN_BLOCKS.
(define-public (propose-owner (new-owner (optional principal)))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_NOT_AUTHORIZED)
    (var-set pending-owner new-owner)
    (var-set proposed-at burn-block-height)
    (print {
      event: "owner-proposed",
      proposed-by: tx-sender,
      pending-owner: new-owner,
      eligible-at: (+ burn-block-height TIMELOCK_BURN_BLOCKS),
    })
    (ok true)
  )
)

(define-public (accept-owner)
  (let ((pending (unwrap! (var-get pending-owner) ERR_NO_PENDING_OWNER)))
    (asserts! (is-eq tx-sender pending) ERR_NOT_AUTHORIZED)
    (asserts! (>= burn-block-height (+ (var-get proposed-at) TIMELOCK_BURN_BLOCKS))
      ERR_TIMELOCK_NOT_ELAPSED
    )
    (var-set contract-owner pending)
    (var-set pending-owner none)
    (print {
      event: "owner-accepted",
      new-owner: pending,
    })
    (ok true)
  )
)
