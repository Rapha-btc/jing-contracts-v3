;; jing-ladder-v1
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
(define-constant ERR_BAND_FULL (err u6011))
(define-constant ERR_ALREADY_SEATED (err u6012))

;; owner handover: propose, then accept once this many burn blocks passed
(define-constant TIMELOCK_BURN_BLOCKS u144)

(define-constant SIDE_BUY_STX "buy-stx")
(define-constant SIDE_SELL_STX "sell-stx")
;; pegged rungs (jing-buy/sell-stx-market-spread): own canonical per side,
;; keyed by cents * 10000 + spread-bps
(define-constant SIDE_BUY_PEG "buy-peg")
(define-constant SIDE_SELL_PEG "sell-peg")
;; miner-band rungs (jing-buy/sell-stx-core-spread): no guard in the name,
;; the floor / cap is read from the RFQ native oracle on every push; own
;; canonical per side, keyed by spread-bps alone
(define-constant SIDE_BUY_BAND "buy-band")
(define-constant SIDE_SELL_BAND "sel-band")
;; band rungs are the market's protected seats: at most this many spreads per
;; side (the market reserves the same number of slots), one rung per spread,
;; and a new canonical rung at an existing spread REPLACES the old one (the
;; upgrade path: bless the new code, deploy it at the same spread; the old
;; rung keeps its funds, its resting order and its `registered` row so its
;; members can still withdraw and claim, only its band status goes)
;; the market's MAX_DEPOSITORS: its seated list is (list 50 principal)
(define-constant MAX_SEATS_PER_SIDE u50)
(define-data-var max-band-per-side uint u10)
(define-map band-count (string-ascii 8) uint)
(define-read-only (get-max-band-per-side) (var-get max-band-per-side))

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

(define-read-only (get-band-count (side (string-ascii 8)))
  (default-to u0 (map-get? band-count side))
)
(define-private (is-band-side (side (string-ascii 8)))
  (or (is-eq side SIDE_BUY_BAND) (is-eq side SIDE_SELL_BAND))
)
;; The CURRENT band rung for its spread on the given side: registered under
;; that side and still the holder of its (side, spread) key. A replaced rung
;; answers false.
(define-private (is-band-current
    (who principal)
    (side (string-ascii 8))
  )
  (match (map-get? registered who)
    reg (and
      (is-eq (get side reg) side)
      (is-eq (map-get? rungs {
        side: side,
        price: (get price reg),
      }) (some who))
    )
    false
  )
)
(define-read-only (is-band-x (who principal)) (is-band-current who SIDE_BUY_BAND))
(define-read-only (is-band-y (who principal)) (is-band-current who SIDE_SELL_BAND))
;; still the holder of its (side, price) key: false for a replaced, retired
;; or never-seated band rung, which keeps printing here for its members
(define-private (is-current
    (who principal)
    (rung {
      side: (string-ascii 8),
      price: uint,
    })
  )
  (is-eq (map-get? rungs rung) (some who))
)
(define-read-only (is-current-rung (who principal))
  (match (map-get? registered who)
    rung (is-current who rung)
    false
  )
)
;; The band seat at (side, spread) is about to change hands: taken -> the
;; holder is replaced (its `registered` row stays, its seat goes once the
;; caller writes the key); free -> one more seat, up to max-band-per-side.
;; Only the count; the caller writes the key. Returns the replaced holder.
(define-private (claim-seat
    (side (string-ascii 8))
    (price uint)
  )
  (let ((holder (map-get? rungs {
      side: side,
      price: price,
    })))
    (match holder
      old true
      (begin
        (asserts! (< (get-band-count side) (var-get max-band-per-side)) ERR_BAND_FULL)
        (map-set band-count side (+ (get-band-count side) u1))
      )
    )
    (ok holder)
  )
)

(define-private (valid-side (side (string-ascii 8)))
  (or
    (is-eq side SIDE_BUY_STX) (is-eq side SIDE_SELL_STX)
    (is-eq side SIDE_BUY_PEG) (is-eq side SIDE_SELL_PEG)
    (is-eq side SIDE_BUY_BAND) (is-eq side SIDE_SELL_BAND)
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
      (holder (map-get? rungs {
        side: side,
        price: price,
      }))
    )
    (asserts!
      (is-eq caller-hash (unwrap! (contract-hash? canon) ERR_INVALID_CONTRACT_HASH))
      ERR_HASH_MISMATCH
    )
    (asserts! (is-none (map-get? registered caller)) ERR_ALREADY_REGISTERED)
    (if (is-band-side side)
      ;; a band spread: the seat (taken -> replace, free -> count)
      (is-some (try! (claim-seat side price)))
      ;; a fixed or guarded rung: one per (side, price), no replacement
      (asserts! (is-none holder) ERR_PRICE_TAKEN)
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
      seated: (is-band-side side),
      replaced: (if (is-band-side side) holder none),
    })
    (ok true)
  )
)

;; A band rung that takes NO seat: same hash gate, band sides only, the
;; rung is registered (it prints, it takes deposits) as an ordinary maker
;; on the book: parkable, counted against the open region, no key, no
;; count. The owner can seat it later with `seat-band`. Any number of
;; unseated rungs may share a spread.
(define-public (register-unseated
    (side (string-ascii 8))
    (price uint)
    (market-price uint)
  )
  (let (
      (caller contract-caller)
      (caller-hash (unwrap! (contract-hash? caller) ERR_INVALID_CONTRACT_HASH))
      (canon (unwrap! (map-get? canonical side) ERR_NOT_VERIFIED))
    )
    (asserts! (is-band-side side) ERR_BAD_SIDE)
    (asserts!
      (is-eq caller-hash (unwrap! (contract-hash? canon) ERR_INVALID_CONTRACT_HASH))
      ERR_HASH_MISMATCH
    )
    (asserts! (is-none (map-get? registered caller)) ERR_ALREADY_REGISTERED)
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
      seated: false,
      replaced: none,
    })
    (ok true)
  )
)

;; Owner: seat a registered band rung that holds no seat (never seated,
;; replaced or retired). Its spread taken -> the holder is replaced; free
;; -> one more seat, up to max-band-per-side. The market copy follows on
;; the next `sync-seat who` (anyone).
(define-public (seat-band (who principal))
  (let (
      (reg (unwrap! (map-get? registered who) ERR_NOT_REGISTERED))
      (side (get side reg))
      (spread (get price reg))
    )
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_NOT_AUTHORIZED)
    (asserts! (is-band-side side) ERR_BAD_SIDE)
    (asserts! (not (is-current who reg)) ERR_ALREADY_SEATED)
    (let ((replaced (try! (claim-seat side spread))))
      (map-set rungs reg who)
      (print {
        event: "band-seated",
        side: side,
        spread: spread,
        contract: who,
        replaced: replaced,
      })
      (ok true)
    )
  )
)

;; The number of band seats per side: the one number the market reads to
;; size its reservation. Owner only. It cannot go under the seats a side
;; already holds: that would leave rungs on the book with no reservation
;; behind them.
(define-public (set-max-band-per-side (n uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_NOT_AUTHORIZED)
    ;; floor: never under the seats already held. CEILING: strictly under
    ;; the market's slot count - the market's seat list is (list 50
    ;; principal) and its add does `as-max-len? ... u50`, so a 51st seat
    ;; aborts the rung's own initialize with a VM panic it cannot report;
    ;; and 50 seats would reserve every depositor slot, locking every
    ;; unseated maker out of the side even when the book is empty.
    (asserts!
      (and
        (>= n (get-band-count SIDE_BUY_BAND))
        (>= n (get-band-count SIDE_SELL_BAND))
        (< n MAX_SEATS_PER_SIDE)
      )
      ERR_BAND_FULL
    )
    (print {
      event: "max-band-per-side-set",
      max: n,
    })
    (ok (var-set max-band-per-side n))
  )
)

;; Owner: retire a band spread. The rung at it loses its seat and is an
;; ordinary maker from then on (funds, resting order and `registered` row
;; untouched, so its members can still withdraw and claim, and `seat-band`
;; can seat it again); the spread is free again and the count goes down.
(define-public (retire-band
    (side (string-ascii 8))
    (spread uint)
  )
  (let (
      (key {
        side: side,
        price: spread,
      })
      (holder (unwrap! (map-get? rungs key) ERR_NOT_REGISTERED))
    )
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_NOT_AUTHORIZED)
    (asserts! (is-band-side side) ERR_BAD_SIDE)
    (map-delete rungs key)
    ;; `registered` stays: the rung keeps printing (and paying) its members
    (map-set band-count side (- (get-band-count side) u1))
    (print {
      event: "band-retired",
      side: side,
      spread: spread,
      contract: holder,
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
      current: (is-current contract-caller rung),
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

(define-public (log-push
    (keeper principal)
    (amount uint)
    (pushed bool)
    (held uint)
  )
  (let ((rung (try! (rung-of contract-caller))))
    (print {
      event: "rung-push",
      rung: contract-caller,
      current: (is-current contract-caller rung),
      side: (get side rung),
      price: (get price rung),
      keeper: keeper,
      amount: amount,
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
      current: (is-current contract-caller rung),
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
      current: (is-current contract-caller rung),
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
      current: (is-current contract-caller rung),
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
