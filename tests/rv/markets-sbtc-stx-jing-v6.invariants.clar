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
    (var-set min-token-y-deposit u100)
    (ok true)))

;; seat / unseat an account on the mock ladder, then let the market copy it
(define-public (rv-band-x (who principal) (on bool))
  (begin
    (try! (contract-call? .mock-jing-ladder set-band-x who on))
    (if on
      (begin (try! (sync-seat who)) (ok true))
      (begin (unwrap-panic (prune-seats)) (ok true)))))

(define-public (rv-band-y (who principal) (on bool))
  (begin
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
      (cap-x (get-taker-capacity mid mid true))
      (cap-y (get-taker-capacity mid mid false))
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
