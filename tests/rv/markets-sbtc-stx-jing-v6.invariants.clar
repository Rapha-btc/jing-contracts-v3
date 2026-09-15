;; ============================================================================
;; RENDEZVOUS INVARIANTS for markets-sbtc-stx-jing-v6 (pegged orders, seats,
;; parking, settle LIVE under fuzz)
;; ============================================================================
;; Append-only block. tests/rv/build.sh concatenates this onto the production
;; source (with the fuzz rewrites listed in its "v6" section) to produce
;; tests/rv/.build/markets-sbtc-stx-jing-v6.clar, the contract `rv` loads.
;;
;; What is different from the v2 target: the Lazer oracle is a mock, so every
;; priced path runs under fuzz: settle-with-refresh, swap, the crossing
;; branch of reprice-or-swap, the book walk, limit rolls, small-share rolls,
;; parks and readmits. The v2 target could only fuzz the deposit phase.
;;
;; RV draws uints from small naturals (fast-check `nat`, under 2^31) and
;; strings at random, which no real price or allowance name survives. The
;; rv-* wrappers below fold a price into a band around a real BTC/STX cross,
;; fold a spread under the 10000 bps ceiling, and pin the allowance name to
;; the mock token; the raw functions stay fuzzable (their calls mostly fail,
;; which is fine). Runtime panics only log in RV: a panic is not a finding
;; here, a false invariant is.
;; ============================================================================

(define-map context (string-ascii 100) { called: uint })

(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))

;; the ten simnet accounts RV draws senders and principals from
(define-constant RV-ACCOUNTS (list
  'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM
  'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5
  'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG
  'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC
  'ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND
  'ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB
  'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0
  'ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ
  'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP
  'STNHKEPYEPJ8ET55ZZ0M5A34J0R3N5FM2CMMMAZ6))

;; price band: [2.4e13, 4.0e13) in the market unit (micro-STX per sat x 1e10),
;; i.e. 250.00 to 416.67 sats per STX, in 1e9 steps. u0 stays u0 so the
;; ERR_LIMIT_REQUIRED path is still reachable through the wrappers.
(define-constant RV-MID-BASE u24000000000000)
(define-constant RV-MID-STEPS u16000)
(define-constant RV-MID-STEP u1000000000)

(define-private (rv-price (raw uint))
  (if (is-eq raw u0)
    u0
    (+ RV-MID-BASE (* (mod raw RV-MID-STEPS) RV-MID-STEP))))

;; none stays none (a fixed order); some folds under 11000 so about one in
;; eleven pegs is refused with ERR_BAD_SPREAD and the rest rest
(define-private (rv-spread (raw (optional uint)))
  (match raw s (some (mod s u11000)) none))

;; ---------------------------------------------------------------------------
;; wrappers (fuzzed like any public function of the SUT)
;; ---------------------------------------------------------------------------

(define-public (rv-set-mid (raw uint))
  (contract-call? .mock-lazer-oracle set-mid (rv-price (+ raw u1))))

;; the price moves onto a resting order: the one way a batch settlement
;; arises (the maker gate refuses a crossing book at placement, so both
;; sides are in range only after the mid moved into the book). Bids
;; (y true) and asks (y false); u0 when `who` rests nothing.
(define-public (rv-mid-at (who principal) (y bool))
  (let ((l (if y (get-token-y-limit who) (get-token-x-limit who))))
    (asserts! (> l u0) ERR_NOTHING_TO_SETTLE)
    (contract-call? .mock-lazer-oracle set-mid l)))

;; the same move with a keeper right behind it: a batch settlement at the
;; price of `who`'s order (u1009 when the other side has nothing in range)
(define-public (rv-settle-at (who principal) (y bool))
  (begin
    (try! (rv-mid-at who y))
    (settle-with-refresh 0x .mock-ft "mock-ft" .mock-ft "mock-ft")))

(define-public (rv-deposit-x (amount uint) (limit uint) (spread (optional uint)))
  (deposit-token-x amount (rv-price limit) (rv-spread spread) 0x .mock-ft "mock-ft"))

(define-public (rv-deposit-y (amount uint) (limit uint) (spread (optional uint)))
  (deposit-token-y amount (rv-price limit) (rv-spread spread) 0x .mock-ft "mock-ft"))

(define-public (rv-set-limit-x (limit uint) (spread (optional uint)))
  (set-token-x-limit (rv-price limit) (rv-spread spread) 0x))

(define-public (rv-set-limit-y (limit uint) (spread (optional uint)))
  (set-token-y-limit (rv-price limit) (rv-spread spread) 0x))

(define-public (rv-reprice-x (limit uint) (spread (optional uint)))
  (reprice-or-swap-token-x (rv-price limit) (rv-spread spread) 0x
    .mock-ft "mock-ft" .mock-ft "mock-ft"))

(define-public (rv-reprice-y (limit uint) (spread (optional uint)))
  (reprice-or-swap-token-y (rv-price limit) (rv-spread spread) 0x
    .mock-ft "mock-ft" .mock-ft "mock-ft"))

(define-public (rv-swap (amount uint) (limit uint) (deposit-x bool))
  (swap amount (rv-price limit) 0x .mock-ft "mock-ft" .mock-ft "mock-ft" deposit-x))

(define-public (rv-settle)
  (settle-with-refresh 0x .mock-ft "mock-ft" .mock-ft "mock-ft"))

(define-public (rv-cancel-x)
  (cancel-token-x-deposit .mock-ft "mock-ft"))

(define-public (rv-withdraw-x (amount uint))
  (withdraw-token-x amount .mock-ft "mock-ft"))

;; fuzz aid: the operator (the deployer, one sender in ten) pauses the market
;; in half of its set-paused calls and RV keeps one simnet across runs, so
;; without this the book sits paused for most of a sweep (ERR_PAUSED x70 on
;; settle in the first 300-run sweep). Anyone may unpause here; no
;; invariant reads `paused`.
(define-public (rv-unpause)
  (ok (var-set paused false)))

;; same reason: one random set-min-token-x/y-deposit by the operator (a
;; natural up to 2^31) leaves nothing settleable for the rest of the sweep
(define-public (rv-reset-mins)
  (begin
    (var-set min-token-x-deposit u100)
    (var-set min-token-y-deposit u10000)
    (ok true)))

;; seat / unseat an account on the mock ladder, then let the market copy it
(define-public (rv-band-x (who principal) (on bool))
  (begin
    ;; a parked account is not seated: the protection rule (a seat holder
    ;; is never parked) is checked below and must not be broken by the seat
    (asserts! (or (not on) (is-eq (get-token-x-parked who) u0)) ERR_QUEUE_FULL)
    (try! (contract-call? .mock-jing-ladder set-band-x who on))
    (if on
      (begin (try! (sync-seat who)) (ok true))
      (begin (unwrap-panic (prune-seats)) (ok true)))))

(define-public (rv-band-y (who principal) (on bool))
  (begin
    (asserts! (or (not on) (is-eq (get-token-y-parked who) u0)) ERR_QUEUE_FULL)
    (try! (contract-call? .mock-jing-ladder set-band-y who on))
    (if on
      (begin (try! (sync-seat who)) (ok true))
      (begin (unwrap-panic (prune-seats)) (ok true)))))

;; ---------------------------------------------------------------------------
;; readers
;; ---------------------------------------------------------------------------

(define-private (rv-y-amt-curr (d principal))
  (get-token-y-deposit (var-get current-cycle) d))
(define-private (rv-y-amt-next (d principal))
  (get-token-y-deposit (+ (var-get current-cycle) u1) d))
(define-private (rv-x-amt-curr (d principal))
  (get-token-x-deposit (var-get current-cycle) d))
(define-private (rv-x-amt-next (d principal))
  (get-token-x-deposit (+ (var-get current-cycle) u1) d))
(define-private (rv-and-bool (curr bool) (acc bool))
  (and curr acc))
(define-private (rv-y-positive-curr (d principal))
  (> (get-token-y-deposit (var-get current-cycle) d) u0))
(define-private (rv-y-positive-next (d principal))
  (> (get-token-y-deposit (+ (var-get current-cycle) u1) d) u0))
(define-private (rv-x-positive-curr (d principal))
  (> (get-token-x-deposit (var-get current-cycle) d) u0))
(define-private (rv-x-positive-next (d principal))
  (> (get-token-x-deposit (+ (var-get current-cycle) u1) d) u0))
(define-private (rv-parked-x-fold (a principal) (acc uint))
  (+ acc (get-token-x-parked a)))
(define-private (rv-parked-y-fold (a principal) (acc uint))
  (+ acc (get-token-y-parked a)))
(define-private (rv-x-prev-fold (a principal) (acc uint))
  (+ acc (get-token-x-deposit (- (var-get current-cycle) u1) a)))
(define-private (rv-y-prev-fold (a principal) (acc uint))
  (+ acc (get-token-y-deposit (- (var-get current-cycle) u1) a)))
(define-private (rv-in-x-list (a principal))
  (is-some (index-of? (get-token-x-depositors (var-get current-cycle)) a)))
(define-private (rv-in-y-list (a principal))
  (is-some (index-of? (get-token-y-depositors (var-get current-cycle)) a)))

;; ============================================================================
;; 1-4: per-cycle conservation, list sum == totals (current and next, x and y)
;; ============================================================================

(define-read-only (invariant-y-curr-list-sum-matches-totals)
  (let ((cycle (var-get current-cycle)))
    (is-eq (fold + (map rv-y-amt-curr (get-token-y-depositors cycle)) u0)
           (get total-token-y (get-cycle-totals cycle)))))

(define-read-only (invariant-y-next-list-sum-matches-totals)
  (let ((cycle (+ (var-get current-cycle) u1)))
    (is-eq (fold + (map rv-y-amt-next (get-token-y-depositors cycle)) u0)
           (get total-token-y (get-cycle-totals cycle)))))

(define-read-only (invariant-x-curr-list-sum-matches-totals)
  (let ((cycle (var-get current-cycle)))
    (is-eq (fold + (map rv-x-amt-curr (get-token-x-depositors cycle)) u0)
           (get total-token-x (get-cycle-totals cycle)))))

(define-read-only (invariant-x-next-list-sum-matches-totals)
  (let ((cycle (+ (var-get current-cycle) u1)))
    (is-eq (fold + (map rv-x-amt-next (get-token-x-depositors cycle)) u0)
           (get total-token-x (get-cycle-totals cycle)))))

;; ============================================================================
;; 5-8: no ghosts, every listed depositor holds a positive deposit
;; ============================================================================

(define-read-only (invariant-y-curr-no-ghosts)
  (fold rv-and-bool
    (map rv-y-positive-curr (get-token-y-depositors (var-get current-cycle))) true))
(define-read-only (invariant-y-next-no-ghosts)
  (fold rv-and-bool
    (map rv-y-positive-next (get-token-y-depositors (+ (var-get current-cycle) u1))) true))
(define-read-only (invariant-x-curr-no-ghosts)
  (fold rv-and-bool
    (map rv-x-positive-curr (get-token-x-depositors (var-get current-cycle))) true))
(define-read-only (invariant-x-next-no-ghosts)
  (fold rv-and-bool
    (map rv-x-positive-next (get-token-x-depositors (+ (var-get current-cycle) u1))) true))

;; ============================================================================
;; 9-10: no duplicate in the current depositor lists (and nothing but the
;; RV accounts in them): the list length equals the number of accounts
;; that appear in it. A depositor appended twice (a readmit of a live maker,
;; a park that left the row) shows up here.
;; ============================================================================

(define-read-only (invariant-x-list-no-duplicates)
  (is-eq (len (get-token-x-depositors (var-get current-cycle)))
         (len (filter rv-in-x-list RV-ACCOUNTS))))

(define-read-only (invariant-y-list-no-duplicates)
  (is-eq (len (get-token-y-depositors (var-get current-cycle)))
         (len (filter rv-in-y-list RV-ACCOUNTS))))

;; ============================================================================
;; 11-12: CONSERVATION with settle live. The contract's token balance equals
;; the live totals of the open cycle (and the next, empty at rest) plus every
;; parked amount plus a pending taker escrow (zero at rest). Fees and dust
;; leave to the treasury, fills and refunds leave to makers and takers, and
;; every one of those movements has a matching totals / parked write, or
;; this trips. mock-ft is the x side; native STX is the y side.
;; ============================================================================

(define-read-only (invariant-x-balance-conserved)
  (let ((cycle (var-get current-cycle)))
    (is-eq
      (unwrap-panic (contract-call? .mock-ft get-balance current-contract))
      (+ (get total-token-x (get-cycle-totals cycle))
         (get total-token-x (get-cycle-totals (+ cycle u1)))
         (fold rv-parked-x-fold RV-ACCOUNTS u0)
         (var-get pending-rebate-x)))))

(define-read-only (invariant-y-balance-conserved)
  (let ((cycle (var-get current-cycle)))
    (is-eq
      (stx-get-balance current-contract)
      (+ (get total-token-y (get-cycle-totals cycle))
         (get total-token-y (get-cycle-totals (+ cycle u1)))
         (fold rv-parked-y-fold RV-ACCOUNTS u0)
         (var-get pending-rebate-y)))))

;; ============================================================================
;; 13: scratch state is clean at rest. The taker escrow, the crossing flag
;; and the taker-too-small flag are set inside one atomic swap / reprice and
;; cleared (or rolled back) before it returns.
;; ============================================================================

(define-read-only (invariant-scratch-zero-at-rest)
  (and (is-eq (var-get pending-rebate-x) u0)
       (is-eq (var-get pending-rebate-y) u0)
       (not (var-get crossing))
       (not (var-get taker-too-small))))

;; ============================================================================
;; 14-15: a maker is live or parked on a side, never both. A deposit while
;; parked folds the parked amount back in; a park removes the live row.
;; ============================================================================

(define-private (rv-live-and-parked-x (a principal))
  (and (> (get-token-x-deposit (var-get current-cycle) a) u0)
       (> (get-token-x-parked a) u0)))
(define-private (rv-live-and-parked-y (a principal))
  (and (> (get-token-y-deposit (var-get current-cycle) a) u0)
       (> (get-token-y-parked a) u0)))

(define-read-only (invariant-x-never-live-and-parked)
  (is-eq (len (filter rv-live-and-parked-x RV-ACCOUNTS)) u0))
(define-read-only (invariant-y-never-live-and-parked)
  (is-eq (len (filter rv-live-and-parked-y RV-ACCOUNTS)) u0))

;; ============================================================================
;; 16-17: every position (live or parked) has an order: a positive limit and
;; a spread under the ceiling. The order is what settle, walk and park read;
;; a position without one would be priced at zero.
;; ============================================================================

(define-private (rv-x-position-without-order (a principal))
  (and (or (> (get-token-x-deposit (var-get current-cycle) a) u0)
           (> (get-token-x-parked a) u0))
       (or (is-eq (get-token-x-limit a) u0)
           (not (valid-spread (get spread-bps (get-token-x-order a)))))))
(define-private (rv-y-position-without-order (a principal))
  (and (or (> (get-token-y-deposit (var-get current-cycle) a) u0)
           (> (get-token-y-parked a) u0))
       (or (is-eq (get-token-y-limit a) u0)
           (not (valid-spread (get spread-bps (get-token-y-order a)))))))

(define-read-only (invariant-x-position-has-order)
  (is-eq (len (filter rv-x-position-without-order RV-ACCOUNTS)) u0))
(define-read-only (invariant-y-position-has-order)
  (is-eq (len (filter rv-y-position-without-order RV-ACCOUNTS)) u0))

;; ============================================================================
;; 18-19: the converse, no stale order row: an order exists only for a
;; live or parked position. Cancel, a full fill, a full clear at settle and
;; a refunded remainder all delete the row. A stale row is harmless to
;; funds but would let a returning maker rest at a price it did not set.
;; ============================================================================

(define-private (rv-x-order-without-position (a principal))
  (and (is-some (map-get? token-x-deposit-limits a))
       (is-eq (get-token-x-deposit (var-get current-cycle) a) u0)
       (is-eq (get-token-x-parked a) u0)))
(define-private (rv-y-order-without-position (a principal))
  (and (is-some (map-get? token-y-deposit-limits a))
       (is-eq (get-token-y-deposit (var-get current-cycle) a) u0)
       (is-eq (get-token-y-parked a) u0)))

(define-read-only (invariant-x-no-stale-order)
  (is-eq (len (filter rv-x-order-without-position RV-ACCOUNTS)) u0))
(define-read-only (invariant-y-no-stale-order)
  (is-eq (len (filter rv-y-order-without-position RV-ACCOUNTS)) u0))

;; ============================================================================
;; 20-21: nothing stranded in the settled cycle. Distribute deletes every
;; row of the cycle it pays out; the filters delete what they roll. A row
;; left behind would be a deposit nobody can reach.
;; ============================================================================

(define-read-only (invariant-x-prev-cycle-empty)
  (or (is-eq (var-get current-cycle) u0)
      (is-eq (fold rv-x-prev-fold RV-ACCOUNTS u0) u0)))
(define-read-only (invariant-y-prev-cycle-empty)
  (or (is-eq (var-get current-cycle) u0)
      (is-eq (fold rv-y-prev-fold RV-ACCOUNTS u0) u0)))

;; ============================================================================
;; 22-23: the open cycle is not settled; the last settled cycle cleared no
;; more than it held.
;; ============================================================================

(define-read-only (invariant-open-cycle-unsettled)
  (is-none (get-settlement (var-get current-cycle))))

(define-read-only (invariant-cleared-le-deposited)
  (let ((cycle (var-get current-cycle)))
    (if (> cycle u0)
      (match (get-settlement (- cycle u1))
        s (let ((totals (get-cycle-totals (- cycle u1))))
            (and (<= (get token-y-cleared s) (get total-token-y totals))
                 (<= (get token-x-cleared s) (get total-token-x totals))))
        true)
      true)))

;; ============================================================================
;; 24-25: bounded lists and seats. Seats never exceed the reservation, the
;; reservation never exceeds the queue.
;; ============================================================================

(define-read-only (invariant-lists-bounded)
  (let ((cycle (var-get current-cycle)))
    (and (<= (len (get-token-x-depositors cycle)) MAX_DEPOSITORS)
         (<= (len (get-token-y-depositors cycle)) MAX_DEPOSITORS))))

(define-read-only (invariant-seats-bounded)
  (and (<= (len (var-get seated-x)) (protected-seats))
       (<= (len (var-get seated-y)) (protected-seats))
       (<= (protected-seats) MAX_DEPOSITORS)))

;; ============================================================================
;; 26-27: the last settlement's arithmetic. Fees are exactly FEE_BPS of what
;; cleared; x cleared at the settlement price never exceeds y cleared (the
;; binding side sets both, the other is derived with a floor).
;; ============================================================================

(define-private (rv-last-settlement)
  (let ((cycle (var-get current-cycle)))
    (if (> cycle u0) (get-settlement (- cycle u1)) none)))

(define-read-only (invariant-settlement-fees-exact)
  (match (rv-last-settlement)
    s (and
        (is-eq (get token-y-fee s) (/ (* (get token-y-cleared s) FEE_BPS) BPS_PRECISION))
        (is-eq (get token-x-fee s) (/ (* (get token-x-cleared s) FEE_BPS) BPS_PRECISION)))
    true))

(define-read-only (invariant-settlement-volumes-agree)
  (match (rv-last-settlement)
    s (and
        (> (get price s) u0)
        (<= (/ (* (get token-x-cleared s) (get price s)) (* PRICE_PRECISION DECIMAL_FACTOR))
            (get token-y-cleared s)))
    true))

;; ============================================================================
;; 28: the read-only surface is total at the live mid. get-taker-capacity,
;; would-take-as-x/y and every account's effective limit evaluate without a
;; runtime error (a panic inside an invariant fails the run). This is the
;; class of the MAX_UINT sentinel overflow found on bounty mtxs6nxg7a6d97081b11.
;; ============================================================================

(define-private (rv-limits-at (a principal) (acc uint))
  (let ((mid (contract-call? .mock-lazer-oracle get-mid)))
    (+ acc
       (if (is-eq (token-y-limit-at a mid) u0) u0 u1)
       (if (is-eq (token-x-limit-at a mid) MAX_UINT) u0 u1))))

(define-read-only (invariant-readers-total-at-mid)
  (let (
      (mid (contract-call? .mock-lazer-oracle get-mid))
      (cap-x (get-taker-capacity mid mid true tx-sender))
      (cap-y (get-taker-capacity mid mid false tx-sender))
      (n (fold rv-limits-at RV-ACCOUNTS u0))
    )
    (and
      (>= (get gross-cap cap-x) (get net-cap cap-x))
      (>= (get gross-cap cap-y) (get net-cap cap-y))
      (is-eq (get net-cap cap-x) (+ (get mid-cap cap-x) (get walk-cap cap-x)))
      (is-eq (get net-cap cap-y) (+ (get mid-cap cap-y) (get walk-cap cap-y)))
      (or (would-take-as-x mid mid) (not (would-take-as-x mid mid)))
      (or (would-take-as-y mid mid) (not (would-take-as-y mid mid)))
      (<= n u20))))

;; ============================================================================
;; 29: a seat holder is never parked (the protection rule; the seat wrapper
;; refuses a parked account so the market alone decides).
;;
;; NOT an invariant, tried and dropped 2026-09-15: "unseated makers on a
;; side never exceed MAX_DEPOSITORS minus the seats". By design a retired
;; seat holder keeps its resting order and counts in the open region until
;; it leaves (jing-ladder retire-band / replace), so right after a prune
;; the region can sit one over its cap. RV found that within 400 runs.
;; ============================================================================

(define-private (rv-seated-parked-x (a principal))
  (and (is-protected-x a) (> (get-token-x-parked a) u0)))
(define-private (rv-seated-parked-y (a principal))
  (and (is-protected-y a) (> (get-token-y-parked a) u0)))

(define-read-only (invariant-seat-holders-never-parked)
  (and (is-eq (len (filter rv-seated-parked-x RV-ACCOUNTS)) u0)
       (is-eq (len (filter rv-seated-parked-y RV-ACCOUNTS)) u0)))

;; ============================================================================
;; 31: the future is empty at rest. Rolls write to cycle+1 and advance in
;; the same call; nothing ever writes further ahead.
;; ============================================================================

(define-read-only (invariant-future-cycles-empty)
  (let ((next (+ (var-get current-cycle) u1)))
    (and
      (is-eq (get total-token-x (get-cycle-totals next)) u0)
      (is-eq (get total-token-y (get-cycle-totals next)) u0)
      (is-eq (len (get-token-x-depositors next)) u0)
      (is-eq (len (get-token-y-depositors next)) u0)
      (is-eq (get total-token-x (get-cycle-totals (+ next u1))) u0)
      (is-eq (get total-token-y (get-cycle-totals (+ next u1))) u0)
      (is-eq (len (get-token-x-depositors (+ next u1))) u0)
      (is-eq (len (get-token-y-depositors (+ next u1))) u0))))

;; ============================================================================
;; 32: configuration frozen and sane. initialize runs once (the fuzz build
;; starts initialized), the tokens never move, both minimums stay above
;; zero, the price region fits the queue.
;; ============================================================================

(define-read-only (invariant-config-frozen)
  (and (var-get initialized)
       (is-eq (var-get token-x) .mock-ft)
       (is-eq (var-get token-y) .mock-ft)
       (> (var-get min-token-x-deposit) u0)
       (> (var-get min-token-y-deposit) u0)
       (<= (var-get distance-slots) MAX_DEPOSITORS)))

;; ============================================================================
;; PROPERTY TESTS (`rv . <target> test`): a random action, then the promise
;; that call made. (ok true) passes, (ok false) discards (the action did
;; not apply: paused, nothing resting, refused for a documented reason),
;; (err ...) or a runtime error fails. The simnet persists across runs, so
;; the state these act on is what earlier tests and wrappers built.
;; ============================================================================

;; P1: THE SIZING PROMISE. get-taker-capacity is what the router and the
;; vault size a taker on; a swap of exactly its gross-cap at the same mid
;; and limit must fill (never u1017 ERR_PARTIAL_FILL). Discarded when the
;; net is under the taker minimum (the read does not model it), when the
;; sender already rests or is parked on that side (u1018), or when the
;; market or the registry is paused.
(define-public (test-sizing-promise (limit uint) (deposit-x bool))
  (let (
      (mid (contract-call? .mock-lazer-oracle get-mid))
      (lim (rv-price (+ limit u1)))
      (cap (get-taker-capacity mid lim deposit-x tx-sender))
      (cycle (var-get current-cycle))
      (min (if deposit-x (var-get min-token-x-deposit) (var-get min-token-y-deposit)))
      (resting (if deposit-x
        (+ (get-token-x-deposit cycle tx-sender) (get-token-x-parked tx-sender))
        (+ (get-token-y-deposit cycle tx-sender) (get-token-y-parked tx-sender))))
          )
    ;; a resting order on the OTHER side is no longer discarded: the read
    ;; takes the taker since 2026-09-15 and leaves that order out of the
    ;; walk (found by this property, seed -2050959550)
    (if (or (< (get net-cap cap) min) (> resting u0) (var-get paused))
      (ok false)
      (match (swap (get gross-cap cap) lim 0x .mock-ft "mock-ft" .mock-ft "mock-ft" deposit-x)
        r (ok true)
        ;; u1010: on a full side a taker smaller than the smallest resident is
        ;; refused by the size rule; the capacity read does not model the
        ;; queue (found by this property; 6 slots here, 40 open in production)
        e (if (or (is-eq e u1007) (is-eq e u5016) (is-eq e u1010))
            (ok false)
            ;; diagnostic: a partial fill encodes how many opposite in-range
            ;; makers the settlement would roll as small-share (under 0.2%
            ;; of their side), which the capacity read counts
            (if (is-eq e u1017)
              (err (+ u1017000 (rv-small-share-in-range deposit-x)
                (* u10 (rv-sizing-flags mid lim deposit-x))))
              (err e)))))))

;; diagnostic flags for a falsified sizing promise (bit set = true):
;; 1 own >= opposite, 2 mid-cap zero, 4 walk-cap zero, 8 an in-range ask
;; under the x minimum, 16 an in-range bid under the y minimum, 32 a
;; small-share bid (y side) in range, 64 more than one walkable ask
(define-private (rv-tiny-x-in-range (a principal))
  (let ((amt (get-token-x-deposit (var-get current-cycle) a))
        (mid (contract-call? .mock-lazer-oracle get-mid)))
    (and (> amt u0) (< amt (var-get min-token-x-deposit)) (<= (token-x-limit-at a mid) mid))))
(define-private (rv-tiny-y-in-range (a principal))
  (let ((amt (get-token-y-deposit (var-get current-cycle) a))
        (mid (contract-call? .mock-lazer-oracle get-mid)))
    (and (> amt u0) (< amt (var-get min-token-y-deposit)) (>= (token-y-limit-at a mid) mid))))
(define-private (rv-walkable-ask (a principal))
  (let ((amt (get-token-x-deposit (var-get current-cycle) a))
        (mid (contract-call? .mock-lazer-oracle get-mid))
        (l (token-x-limit-at a mid)))
    (and (>= amt (var-get min-token-x-deposit)) (> l mid) (not (is-eq l MAX_UINT)))))
(define-private (rv-sizing-flags (mid uint) (lim uint) (deposit-x bool))
  (let (
      (cycle (var-get current-cycle))
      (bids (fold cap-bid-fold (get-token-y-depositors cycle)
        { cycle: cycle, mid: mid, limit: (if deposit-x lim mid), taker: tx-sender, in-range: u0, walk: u0 }))
      (asks (fold cap-ask-fold (get-token-x-depositors cycle)
        { cycle: cycle, mid: mid, limit: (if deposit-x mid lim), taker: tx-sender, in-range: u0, walk: u0 }))
      (opposite (if deposit-x
        (/ (* (get in-range bids) (cap-scale)) mid)
        (/ (* (get in-range asks) mid) (cap-scale))))
      (own (if deposit-x (get in-range asks) (get in-range bids)))
      (cap (get-taker-capacity mid lim deposit-x tx-sender))
    )
    (+ (if (>= own opposite) u1 u0)
       (if (is-eq (get mid-cap cap) u0) u2 u0)
       (if (is-eq (get walk-cap cap) u0) u4 u0)
       (if (> (len (filter rv-tiny-x-in-range RV-ACCOUNTS)) u0) u8 u0)
       (if (> (len (filter rv-tiny-y-in-range RV-ACCOUNTS)) u0) u16 u0)
       (if (> (len (filter rv-small-y-in-range RV-ACCOUNTS)) u0) u32 u0)
       (if (> (len (filter rv-walkable-ask RV-ACCOUNTS)) u1) u64 u0)
       ;; 128: the taker rests on the OTHER side (the walk skips self)
       (if (> (if deposit-x
             (get-token-y-deposit cycle tx-sender)
             (get-token-x-deposit cycle tx-sender)) u0) u128 u0))))

(define-private (rv-small-x-in-range (a principal))
  (let (
      (cycle (var-get current-cycle))
      (mid (contract-call? .mock-lazer-oracle get-mid))
      (amt (get-token-x-deposit cycle a))
    )
    (and (> amt u0)
         (<= (token-x-limit-at a mid) mid)
         (< (* amt BPS_PRECISION) (* (get total-token-x (get-cycle-totals cycle)) MIN_SHARE_BPS)))))
(define-private (rv-small-y-in-range (a principal))
  (let (
      (cycle (var-get current-cycle))
      (mid (contract-call? .mock-lazer-oracle get-mid))
      (amt (get-token-y-deposit cycle a))
    )
    (and (> amt u0)
         (>= (token-y-limit-at a mid) mid)
         (< (* amt BPS_PRECISION) (* (get total-token-y (get-cycle-totals cycle)) MIN_SHARE_BPS)))))
(define-read-only (rv-small-share-in-range (deposit-x bool))
  (if deposit-x
    (len (filter rv-small-y-in-range RV-ACCOUNTS))
    (len (filter rv-small-x-in-range RV-ACCOUNTS))))

;; P2: FILL OR KILL. After a swap that returned ok the taker holds nothing
;; on the side it deposited: no live remainder, nothing parked.
(define-public (test-swap-fok (amount uint) (limit uint) (deposit-x bool))
  (match (swap (+ u100 (mod amount u2000000)) (rv-price (+ limit u1)) 0x
      .mock-ft "mock-ft" .mock-ft "mock-ft" deposit-x)
    r (let ((cycle (var-get current-cycle)))
        (if (is-eq u0 (if deposit-x
            (+ (get-token-x-deposit cycle tx-sender) (get-token-x-parked tx-sender))
            (+ (get-token-y-deposit cycle tx-sender) (get-token-y-parked tx-sender))))
          (ok true)
          (err u9002)))
    e (ok false)))

;; P3: THE BINDING SIDE CLEARS FULLY. After a settlement, one side's cleared
;; amount equals that side's total at settle (the settle-total vars keep it).
;; The mid is first moved onto a resting order (the way a batch arises).
(define-public (test-settle-binding-side-clears (who principal) (y bool))
  (match (begin
      (unwrap! (rv-mid-at who y) (ok false))
      (settle-with-refresh 0x .mock-ft "mock-ft" .mock-ft "mock-ft"))
    r (let ((s (unwrap! (get-settlement (- (var-get current-cycle) u1)) (err u9003))))
        (if (or (is-eq (get token-x-cleared s) (var-get settle-total-token-x))
                (is-eq (get token-y-cleared s) (var-get settle-total-token-y)))
          (ok true)
          (err u9004)))
    e (ok false)))

;; P4: READMIT RESTORES THE PARKED AMOUNT, exactly, and clears the parked row.
(define-public (test-readmit-restores (who principal) (x bool))
  (let ((a (if x (get-token-x-parked who) (get-token-y-parked who))))
    (if (is-eq a u0)
      (ok false)
      (match (if x (readmit-token-x who 0x) (readmit-token-y who 0x))
        r (if (and
              (is-eq a (if x
                (get-token-x-deposit (var-get current-cycle) who)
                (get-token-y-deposit (var-get current-cycle) who)))
              (is-eq u0 (if x (get-token-x-parked who) (get-token-y-parked who))))
            (ok true)
            (err u9005))
        e (ok false)))))

;; P5-P6: A PARTIAL WITHDRAWAL LEAVES AT LEAST THE MINIMUM behind (live or
;; parked), on both sides.
(define-public (test-withdraw-x-leaves-min (amount uint))
  (match (withdraw-token-x (+ u1 (mod amount u100000)) .mock-ft "mock-ft")
    remaining (if (>= remaining (var-get min-token-x-deposit)) (ok true) (err u9006))
    e (ok false)))

(define-public (test-withdraw-y-leaves-min (amount uint))
  (match (withdraw-token-y (+ u1 (mod amount u100000)) .mock-ft "mock-ft")
    remaining (if (>= remaining (var-get min-token-y-deposit)) (ok true) (err u9006))
    e (ok false)))

;; P7-P8: CANCEL RETURNS THE WHOLE POSITION, the amount reported and the
;; tokens received both equal live + parked.
(define-public (test-cancel-x-returns-position)
  (let (
      (pos (+ (get-token-x-deposit (var-get current-cycle) tx-sender) (get-token-x-parked tx-sender)))
      (before (unwrap-panic (contract-call? .mock-ft get-balance tx-sender)))
    )
    (match (cancel-token-x-deposit .mock-ft "mock-ft")
      refunded (if (and
          (is-eq refunded pos)
          (is-eq (unwrap-panic (contract-call? .mock-ft get-balance tx-sender)) (+ before pos)))
        (ok true)
        (err u9007))
      e (ok false))))

(define-public (test-cancel-y-returns-position)
  (let (
      (pos (+ (get-token-y-deposit (var-get current-cycle) tx-sender) (get-token-y-parked tx-sender)))
      (before (stx-get-balance tx-sender))
    )
    (match (cancel-token-y-deposit .mock-ft "mock-ft")
      refunded (if (and
          (is-eq refunded pos)
          (is-eq (stx-get-balance tx-sender) (+ before pos)))
        (ok true)
        (err u9007))
      e (ok false))))

;; drivers for test mode: RV only calls test-* functions there, so these
;; build the book the properties above act on. (ok true) once the
;; underlying wrapper ran, (ok false) when it was refused.
(define-public (test-drive-deposit-x (amount uint) (limit uint) (spread (optional uint)))
  (match (rv-deposit-x amount limit spread) r (ok true) e (ok false)))
(define-public (test-drive-deposit-y (amount uint) (limit uint) (spread (optional uint)))
  (match (rv-deposit-y amount limit spread) r (ok true) e (ok false)))
(define-public (test-drive-reprice-x (limit uint) (spread (optional uint)))
  (match (rv-reprice-x limit spread) r (ok true) e (ok false)))
(define-public (test-drive-reprice-y (limit uint) (spread (optional uint)))
  (match (rv-reprice-y limit spread) r (ok true) e (ok false)))
(define-public (test-drive-set-mid (raw uint))
  (match (rv-set-mid raw) r (ok true) e (ok false)))
(define-public (test-drive-mid-at (who principal) (y bool))
  (match (rv-mid-at who y) r (ok true) e (ok false)))
(define-public (test-drive-band-x (who principal) (on bool))
  (match (rv-band-x who on) r (ok true) e (ok false)))
(define-public (test-drive-band-y (who principal) (on bool))
  (match (rv-band-y who on) r (ok true) e (ok false)))
(define-public (test-drive-unpause-and-mins)
  (begin (unwrap-panic (rv-unpause)) (unwrap-panic (rv-reset-mins)) (ok true)))
