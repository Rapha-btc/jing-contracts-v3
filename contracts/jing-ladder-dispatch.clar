;; One user transaction -> deposits into 1..10 CURRENT seated rungs, or
;; withdraws a user's unsold positions from 1..10 registered historical rungs.
;; Deploy jing-rung-deposit-trait under the same principal first.
;; Amounts are sats for deposit-buy and micro-STX for deposit-sell.
;; Frontend supplies allocations (equal or weighted); their sum MUST equal total.
;; No as-contract: each rung pulls from tx-sender and credits that user's shares.
;; No custody, fees, owner, or persistent state. Any failed deposit rolls back ALL
;; deposits. A successful rung deposit may remain HELD rather than resting on the
;; market (e.g. stale update, admission margin, or below market minimum). This
;; helper guarantees allocation, not immediate execution or market admission.
;; Frontend: deny-mode postconditions bounding the user's input-asset spend by
;; total. Read rung get-position / get-state after confirmation for held/resting.
(use-trait rung .jing-rung-deposit-trait.rung-trait)

(define-constant LADDER 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-ladder-v1)
(define-constant ERR_EMPTY (err u7101))
(define-constant ERR_TOTAL (err u7102))
(define-constant ERR_ZERO_AMOUNT (err u7103))
(define-constant ERR_NOT_SEATED (err u7104))
(define-constant ERR_DUPLICATE (err u7105))
(define-constant ERR_DIRECT_CALL (err u7106))
(define-constant ERR_NOT_REGISTERED_SIDE (err u7108))
;; u7107/u7109 retired: successful rung responses are tuples, never booleans.

;; Check the entire allocation before the first asset transfer. Subtract from a
;; budget instead of summing caller-provided uints (avoids addition overflow).
(define-private (validate-one
    (entry { rung: <rung>, amount: uint })
    (acc (response {
      remaining: uint,
      buy: bool,
      seen: (list 10 principal),
    } uint))
  )
  (let (
      (state (try! acc))
      (target (get rung entry))
      (who (contract-of target))
      (amount (get amount entry))
    )
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (asserts! (<= amount (get remaining state)) ERR_TOTAL)
    (asserts! (is-none (index-of? (get seen state) who)) ERR_DUPLICATE)
    (asserts!
      (if (get buy state)
        (contract-call? LADDER is-band-x who)
        (contract-call? LADDER is-band-y who)
      )
      ERR_NOT_SEATED
    )
    (ok {
      remaining: (- (get remaining state) amount),
      buy: (get buy state),
      seen: (unwrap! (as-max-len? (append (get seen state) who) u10) ERR_TOTAL),
    })
  )
)

(define-private (deposit-one
    (entry { rung: <rung>, amount: uint })
    (acc (response {
      count: uint, stx-paid: uint, sbtc-paid: uint,
      positions: (list 10 { rung: principal, amount: uint, shares: uint,
        epoch: uint, stx-paid: uint, sbtc-paid: uint }),
    } uint))
  )
  (let (
      (state (try! acc))
      (target (get rung entry))
      (result (try! (contract-call? target deposit (get amount entry))))
    )
    (ok {
      count: (+ (get count state) u1),
      stx-paid: (+ (get stx-paid state) (get stx-paid result)),
      sbtc-paid: (+ (get sbtc-paid state) (get sbtc-paid result)),
      positions: (unwrap! (as-max-len? (append (get positions state)
        (merge result { rung: (contract-of target) })) u10) ERR_TOTAL),
    })
  )
)

(define-private (dispatch
    (total uint)
    (allocations (list 10 { rung: <rung>, amount: uint }))
    (buy bool)
  )
  (begin
    ;; An intermediary must use its own contract identity to spend its funds;
    ;; it cannot call this helper while retaining an unsuspecting user's sender.
    (asserts! (is-eq tx-sender contract-caller) ERR_DIRECT_CALL)
    (asserts! (> (len allocations) u0) ERR_EMPTY)
    (asserts! (> total u0) ERR_TOTAL)
    (let ((validated (try! (fold validate-one allocations
          (ok { remaining: total, buy: buy, seen: (list) })))))
      (asserts! (is-eq (get remaining validated) u0) ERR_TOTAL)
    )
    (let ((done (try! (fold deposit-one allocations (ok {
          count: u0, stx-paid: u0, sbtc-paid: u0, positions: (list),
        })))))
      (print {
        event: "ladder-dispatched",
        member: tx-sender,
        buy: buy,
        amount: total,
        rungs: (get count done),
      })
      (ok { amount: total, rungs: (get count done),
        stx-paid: (get stx-paid done), sbtc-paid: (get sbtc-paid done),
        positions: (get positions done),
      })
    )
  )
)

(define-public (deposit-buy
    (total uint)
    (allocations (list 10 { rung: <rung>, amount: uint }))
  )
  (dispatch total allocations true)
)

(define-public (deposit-sell
    (total uint)
    (allocations (list 10 { rung: <rung>, amount: uint }))
  )
  (dispatch total allocations false)
)

;; Exits intentionally accept historical registrations: replacement/retirement
;; removes protection, never a member's right to withdraw or claim. Validate all
;; targets before any sync or withdrawal. The registry's canonical gate is the
;; trust boundary, including for old code whose canonical has since changed.
(define-private (validate-exit
    (entry { rung: <rung>, amount: uint })
    (acc (response { buy: bool, seen: (list 10 principal) } uint))
  )
  (let (
      (state (try! acc))
      (target (get rung entry))
      (who (contract-of target))
      (registration (unwrap! (contract-call? LADDER get-registered who) ERR_NOT_REGISTERED_SIDE))
    )
    (asserts! (> (get amount entry) u0) ERR_ZERO_AMOUNT)
    (asserts! (is-none (index-of? (get seen state) who)) ERR_DUPLICATE)
    (asserts! (is-eq (get side registration) (if (get buy state) "buy-band" "sel-band"))
      ERR_NOT_REGISTERED_SIDE
    )
    (ok {
      buy: (get buy state),
      seen: (unwrap! (as-max-len? (append (get seen state) who) u10) ERR_TOTAL),
    })
  )
)

(define-private (exit-one
    (entry { rung: <rung>, amount: uint })
    (acc (response { withdrawn: uint, stx: uint, sbtc: uint,
      update: (optional (buff 8192)),
      positions: (list 10 { rung: principal, stx: uint, sbtc: uint }),
    } uint))
  )
  (let ((state (try! acc)) (target (get rung entry)))
    ;; Every rung's withdraw settles its own escrow with the update carried in
    ;; the accumulator, then syncs and pays accrued proceeds, then caps the
    ;; request at the user's unsold inventory. A sold-out position returns its
    ;; normal ERR_NO_POSITION and rolls this whole batch back.
    (let ((result (try! (contract-call? target withdraw (get amount entry)
        (get update state)
      ))))
      (ok {
        withdrawn: (+ (get withdrawn state) u1),
        stx: (+ (get stx state) (get stx result)),
        sbtc: (+ (get sbtc state) (get sbtc result)),
        update: (get update state),
        positions: (unwrap! (as-max-len? (append (get positions state)
          (merge result { rung: (contract-of target) })) u10) ERR_TOTAL),
      })
    )
  )
)

(define-private (withdraw-many
    (requests (list 10 { rung: <rung>, amount: uint }))
    (buy bool)
    (update (optional (buff 8192)))
  )
  (begin
    (asserts! (is-eq tx-sender contract-caller) ERR_DIRECT_CALL)
    (asserts! (> (len requests) u0) ERR_EMPTY)
    (try! (fold validate-exit requests (ok { buy: buy, seen: (list) })))
    (let ((done (try! (fold exit-one requests
          (ok { withdrawn: u0, stx: u0, sbtc: u0, update: update, positions: (list) })))))
      (print {
        event: "ladder-withdrawn", member: tx-sender, buy: buy,
        rungs: (len requests), withdrawn: (get withdrawn done),
      })
      (ok {
        rungs: (len requests), withdrawn: (get withdrawn done),
        stx: (get stx done), sbtc: (get sbtc done), positions: (get positions done),
      })
    )
  )
)

;; The update is only needed when a rung still has sats escrowed on the market:
;; that rung settles it first, and refuses with its own u7012 when none is
;; given. Pass none when nothing is pending. amount is a positive per-rung cap,
;; in sats (buy) / micro-STX (sell); requesting >= the position exits it in
;; full. Each rung syncs and pays accrued proceeds during withdraw. Sold-out or
;; absent positions return their rung error and roll the whole batch back; use
;; each rung's claim for sold-out positions. Funds go directly to tx-sender.
(define-public (withdraw-buy
    (requests (list 10 { rung: <rung>, amount: uint }))
    (update (optional (buff 8192)))
  )
  (withdraw-many requests true update)
)

(define-public (withdraw-sell
    (requests (list 10 { rung: <rung>, amount: uint }))
    (update (optional (buff 8192)))
  )
  (withdraw-many requests false update)
)
