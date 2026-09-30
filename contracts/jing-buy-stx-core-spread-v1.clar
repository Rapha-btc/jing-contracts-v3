;; jing-buy-stx-market-spread
;;
;; A pooled STX buy (sBTC resting, the market's x side) PEGGED to the market
;; mid on markets-sbtc-stx-jing-v6. Same pool as jing-buy-stx (one maker
;; slot, reward-per-share on two indices, read that file for the design);
;; the one difference is the order it rests. A fixed rung is a price; this
;; rung is a spread: it asks mid + spread-bps, and v6 re-evaluates that
;; against the fresh Lazer mid at every settlement (`spread-bps: (some s)`
;; on the order). No keeper, no reprice transaction, the sBTC never leaves
;; the market to follow the price. Deployed by anyone at a new spread from
;; this template. The name carries both numbers the order rests with:
;; jing-buy-stx-spread-20-floor-331-50 asks mid + 20 bps, and sits out
;; whenever that would be under 331.50 sats per STX (the floor v6 wants next
;; to a pegged ask: the price under which the peg does not fill on a mid it
;; should not trust). `initialize` takes the same two integers (u20,
;; u33150) and derives the floor in the market unit on chain, 1e18 / 33150,
;; exactly as the fixed rung derives its price; name and order agree by
;; construction. Registered in jing-ladder under side "buy-peg" against that
;; side's canonical hash (the code differs from the fixed rung, so it cannot
;; share "buy-stx"), keyed by the (spread, floor) pair packed into one uint.
;;
;; Accounting, the reward-per-share pattern on two indices:
;;   unfilled-index      what fraction of the pooled sBTC is still unsold, times
;;                   SCALE. Starts at SCALE, only ever goes down at fills.
;;   proceeds-index  micro-STX earned per share, times PROCEEDS_SCALE.
;; A member holds `shares` (sats at unfilled-index SCALE). Their remaining sBTC is
;; shares * unfilled-index / SCALE; their STX is shares * (proceeds-index -
;; paid-index) / PROCEEDS_SCALE. `sync` (run first by every action)
;; reads the contract's size on the market (live + parked) plus the sBTC it
;; holds locally, compares with what the indices predict, and folds the
;; difference in as a fill together with the STX that arrived.
;;
;; Where the sBTC sits: on the market whenever the pool is at or above the
;; market's own minimum (the market minimum), otherwise held here (`held-sats`) until a
;; deposit lifts it back. A withdrawal that would leave the market position
;; under the market minimum cancels the whole position and holds the rest (partial
;; withdrawals on the market otherwise, withdraw-token-x). Nothing held here
;; fills; that is the cost of being under the minimum.
;;
;; What passes straight through from the market: u1022 (the price crosses
;; live bids: it cannot rest, wait or use swap), u1027 (parked: deposits wait
;; for a readmit, which anyone does on the market), u1002 (settle phase:
;; withdrawals wait for the next deposit phase).
;;
;; No fee, no owner action after initialize, no reprice: a rung is a spread.

(define-constant ERR_NOT_AUTHORIZED (err u7001))
(define-constant ERR_ALREADY_INITIALIZED (err u7002))
(define-constant ERR_NOT_INITIALIZED (err u7003))
(define-constant ERR_ZERO_AMOUNT (err u7004))
(define-constant ERR_TOO_SMALL (err u7005))
(define-constant ERR_NO_POSITION (err u7006))
(define-constant ERR_INSUFFICIENT (err u7007))
(define-constant ERR_ZERO_PRICE (err u7008))
(define-constant ERR_BAD_SPREAD (err u7010))
(define-constant ERR_BAD_NAME (err u7009))
;; The floor under the index. `unfilled-index` only goes down: every fill
;; multiplies it by actual/recorded and a deposit mints more shares instead of
;; raising it, so a healthy pool that is filled and topped up again and again
;; drifts toward 0 while still full (Nested Quinn M-2), and at 0 a deposit
;; divides by zero. When a fill takes the index under this floor, sync
;; RESCALES instead of closing: the index goes up RESCALE times, total shares
;; go down RESCALE times, and `scale` counts one more step. Every share is
;; then worth the same sats as before, the pool stays on the book, and an open
;; epoch never has an index under this floor, so shares are minted at most
;; 1000 per sat. A fill that takes the index under MINT_FLOOR / RESCALE in one
;; go sold over 99.9% of the pool at once: that closes the epoch (a tail roll).
(define-constant MINT_FLOOR u1000000000)
(define-constant RESCALE u1000)
;; a position is carried across at most this many rescales; past that its
;; shares are worth under 1e-9 of what it last held and count as 0
(define-constant MAX_SCALE_STEPS u3)
(define-constant ERR_UPDATE_REQUIRED (err u7012))
(define-constant ERR_PUSH_PAUSED (err u7014))
(define-constant ERR_ESCROW_COOLDOWN (err u7015))
(define-constant ERR_TOO_MANY_SHARES (err u7016))

;; an epoch closes when what is left unsold, on the market plus held here, is
;; under this many sats: a walk fill is sized in whole sats so a fully taken
;; pool can keep a rounding remainder, and the market refunds a remainder under
;; its minimum back here. An absolute floor, not a fraction of the pool: the
;; remainder is a fixed size whatever the pool was (a fraction closed a small
;; pool late and a big one early). The pool is sold out: the close is a tail
;; roll, so what is left is reserved for the closing epoch's members.
(define-constant SOLD_OUT_DUST u10)

(define-constant MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3)
(define-constant LADDER 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-ladder-v1)
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant SBTC_NAME "sbtc-token")
(define-constant SIDE "buy-band")
;; the deploy name must be NAME_PREFIX + spread + "-floor-" + the floor as named:
;; jing-buy-stx-spread-20-floor-331-50
(define-constant NAME_PREFIX "jing-buy-stx-spread-")
;; v6 rejects a spread of 10000 bps or more (u1026)
(define-constant BPS_PRECISION u10000)
;; market price unit is micro-STX per sat times 1e10; from hundredths of a
;; sat per STX: price = 1e6 * 1e10 * 100 / cents = 1e18 / cents
(define-constant PRICE_NUMERATOR u1000000000000000000)

;; Shares and the unfilled index use 12 decimals. Proceeds use 18: tying
;; both indices to SCALE let a large top-up make an entire small fill round
;; to zero. Deposits cap total shares at PROCEEDS_SCALE, so every positive
;; receipt advances proceeds-index (gained * PROCEEDS_SCALE / shares >= 1).
;; Both input and proceeds use whole carried shares. Epoch remainders belong
;; to its final member (including fractions dropped at a share/scale change).
(define-constant SCALE u1000000000000)
(define-constant PROCEEDS_SCALE u1000000000000000000)
;; the market's own minimum per maker, read live: the operator can raise it
;; (set-min-token-x-deposit) and a stale constant would make the partial
;; withdraw branch call the market with a remainder it rejects (u1004)
;; literal principal on purpose: the node's read-only analysis rejects a
;; contract-call? through a constant here (clarinet accepts it, mainnet does not)
;; ---------- miner band (guard from a second, on-chain source) ----------
;;
;; This rung has no fixed floor in its name. Its floor is
;; derived on every push from the STX price Stacks miners are paying, read
;; from the deployed RFQ's native oracle (rfq-sbtc-stx-jing-v2-3
;; `get-native-price`: miner-spend-total per tenure against the coinbase,
;; averaged over a day of tenures, in the market's own price unit). Nobody
;; can move that number without burning real bitcoin, and it does not come
;; from Pyth, so a fat-finger Pyth print cannot fill this rung:
;; buying STX above twice the miners' price is refused (floor = native / 2).
;; One oracle, one place: the RFQ computes it, the rungs read it.
;; The miners' implied STX price in the market unit; u0 when the oracle
;; cannot read it (a fresh chain, a simulation without tenure data). The
;; principal is a literal, not a constant: a read-only may only call a
;; contract it names literally (a constant is a dynamic call, refused).
(define-read-only (miner-mid)
  (match (contract-call?
    'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.rfq-sbtc-stx-jing-v2-3
    get-native-price
  )
    p p
    e u0
  )
)

;; The floor this rung rests with right now: half the miners' price.
(define-read-only (current-floor)
  (/ (miner-mid) u2)
)

(define-read-only (min-market)
  (get min-token-x
    (contract-call?
      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
      get-min-deposits
    ))
)
;; smallest member deposit: a dust guard, not a maths need (shares are never
;; fewer than sats deposited; payouts round down by at most 1 unit)
(define-constant MIN_DEPOSIT u100)

(define-data-var initialized bool false)
;; distance from mid in basis points, as named (20 -> u20); zero sits at mid
(define-data-var spread-bps uint u0)
;; the same floor in the market unit (1e18 / cents): what the order rests with
(define-data-var floor uint u0)
(define-data-var total-shares uint u0)
;; positions in the current epoch; the last one out closes the epoch (rescale
;; rounding can leave a few shares nobody owns, so total-shares can stay > 0)
(define-data-var members uint u0)
;; rescale steps since the contract started (never reset); a share of scale k
;; is RESCALE^(j - k) shares of scale j
(define-data-var scale uint u0)
;; proceeds-index at the moment scale k began (k >= 1)
(define-map scale-start
  uint
  uint
)
;; the scale an epoch closed at (absent: the epoch is still open)
(define-map epoch-final-scale
  uint
  uint
)
;; Exact unpaid input and proceeds of a tail-rolled epoch. Its final member
;; receives both remainders; neither can be taken by a later epoch.
(define-map epoch-reserve
  uint
  {
    left: uint,
    reserve: uint,
    proceeds: uint,
  }
)
;; a sold-out pool closes its epoch: index and shares restart, old members
;; keep their claim against the epoch's final proceeds-index
(define-data-var epoch uint u0)
(define-map epoch-final-proceeds
  uint
  uint
)
(define-data-var unfilled-index uint SCALE)
(define-data-var proceeds-index uint u0)
;; sats kept in this contract, off the market (under the market minimum, or refunds)
(define-data-var held-sats uint u0)
;; sats owed to members of epochs closed by a tail roll, kept off the pool
(define-data-var reserved-sats uint u0)
;; the unfilled-index an epoch closed with at a tail roll (absent: nothing owed)
(define-map epoch-final-unfilled
  uint
  uint
)
;; STX balance already assigned to an epoch (indexed credit plus rounding).
(define-data-var stx-accounted uint u0)
;; Exact proceeds received by the open epoch, minus its actual payouts.
;; Includes all index/claim rounding; its final member receives the remainder.
(define-data-var current-proceeds uint u0)
;; Division remainder in scaled proceeds units, less than total-shares.
;; Share changes flush this fraction to current-proceeds' final-member payout,
;; where its backing is already included, rather than reindexing it for new shares.
(define-data-var proceeds-carry uint u0)
;; the ladder owner can stop every push to the market (deposits then stay
;; held here), e.g. while an oracle outage lets anyone re-lock exits
(define-data-var push-paused bool false)
;; when settle-escrow last took the 24h cancel: no push for 24h after it, so
;; the returned funds stay here and every member can exit without an oracle
(define-data-var escrow-cancelled-at uint u0)

(define-map positions
  principal
  {
    epoch: uint,
    scale: uint,
    shares: uint,
    paid-index: uint,
  }
)

;; ---------- reads ----------

(define-read-only (get-spread-bps)
  (var-get spread-bps)
)

(define-read-only (get-floor)
  (var-get floor)
)

(define-read-only (get-state)
  {
    spread-bps: (var-get spread-bps),
    floor: (var-get floor),
    epoch: (var-get epoch),
    total-shares: (var-get total-shares),
    members: (var-get members),
    scale: (var-get scale),
    unfilled-index: (var-get unfilled-index),
    proceeds-index: (var-get proceeds-index),
    held-sats: (var-get held-sats),
    resting: (market-size),
    pooled: (pooled-sbtc),
  }
)

;; sBTC still unsold for `who`, and the STX they can claim, as of the last sync
;; (shares carried to the current scale, or to the scale their epoch closed at)
(define-read-only (get-position (who principal))
  (match (map-get? positions who)
    p (let (
        (e (get epoch p))
        (stored (get shares p))
        (from (get scale p))
        (current (is-eq e (var-get epoch)))
        (to (if current
          (var-get scale)
          (final-scale e)
        ))
        (sh (carried stored from to))
        (input (if (and current (is-eq (var-get members) u1))
          (+ (market-size) (var-get held-sats))
          (/
            (* sh
              (if current
                (var-get unfilled-index)
                (final-unfilled e)
              ))
            SCALE
          )
        ))
        (payout (epoch-payout e input
          (earned stored from to (get paid-index p)
            (if current
              (var-get proceeds-index)
              (final-index e)
            ))
        ))
      )
      {
        shares: sh,
        sbtc: (get input payout),
        stx: (get proceeds payout),
      }
    )
    {
      shares: u0,
      sbtc: u0,
      stx: u0,
    }
  )
)

;; Indexed entitlements until only one member remains; then the exact unpaid
;; balance of that epoch. Current-epoch input is paid only by withdraw.
(define-read-only (epoch-payout
    (e uint)
    (input uint)
    (proceeds uint)
  )
  (if (is-eq e (var-get epoch))
    {
      input: input,
      proceeds: (if (is-eq (var-get members) u1)
        (var-get current-proceeds)
        proceeds
      ),
    }
    (match (map-get? epoch-reserve e)
      r (if (is-eq (get left r) u1)
        {
          input: (get reserve r),
          proceeds: (get proceeds r),
        }
        {
          input: input,
          proceeds: proceeds,
        }
      )
      {
        input: input,
        proceeds: proceeds,
      }
    )
  )
)

(define-read-only (final-unfilled (e uint))
  (default-to u0 (map-get? epoch-final-unfilled e))
)

(define-read-only (final-index (e uint))
  (default-to (var-get proceeds-index) (map-get? epoch-final-proceeds e))
)

(define-read-only (final-scale (e uint))
  (default-to (var-get scale) (map-get? epoch-final-scale e))
)

;; `shares` of scale `from` expressed at scale `to` (0 past MAX_SCALE_STEPS)
(define-read-only (carried
    (shares uint)
    (from uint)
    (to uint)
  )
  (if (> (- to from) MAX_SCALE_STEPS)
    u0
    (/ shares (pow RESCALE (- to from)))
  )
)

;; Proceeds earned by `shares` of scale `from`, paid up to `paid`, when the
;; proceeds-index is at `upto` and the scale at `to`. Each scale step is its
;; own segment: whole carried shares count at each step (division rounds down),
;; while every step's proceeds-index is per share of that step.
(define-read-only (earned
    (shares uint)
    (from uint)
    (to uint)
    (paid uint)
    (upto uint)
  )
  (get owed
    (fold earned-step (list u0 u1 u2 u3) {
      shares: shares,
      from: from,
      to: to,
      paid: paid,
      upto: upto,
      owed: u0,
    })
  )
)

(define-read-only (earned-step
    (step uint)
    (acc {
      shares: uint,
      from: uint,
      to: uint,
      paid: uint,
      upto: uint,
      owed: uint,
    })
  )
  (let ((j (+ (get from acc) step)))
    (if (> j (get to acc))
      acc
      (let (
          (seg-start (if (is-eq step u0)
            (get paid acc)
            (default-to u0 (map-get? scale-start j))
          ))
          (seg-end (if (is-eq j (get to acc))
            (get upto acc)
            (default-to u0 (map-get? scale-start (+ j u1)))
          ))
          ;; Use the same whole shares as carried/get-position/withdraw.
          ;; At rescale, sum(floor(member / RESCALE)) <= floor(total / RESCALE).
          ;; Paying fractional old shares against that floored denominator
          ;; over-allocated proceeds. Rounding stays in the epoch for its last member.
          (effective-shares (carried (get shares acc) u0 step))
          (delta (- seg-end seg-start))
          (units (* effective-shares delta))
        )
        (merge acc { owed: (+ (get owed acc) (/ units PROCEEDS_SCALE)) })
      )
    )
  )
)

;; live + parked size of this contract on the market
(define-read-only (market-size)
  (+
    (contract-call?
      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
      get-token-x-deposit
      (contract-call?
        'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
        get-current-cycle
      )
      current-contract
    )
    (contract-call?
      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
      get-token-x-parked current-contract
    )
    (default-to u0
      (get amount
        (contract-call?
          'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
          get-token-x-pending-deposit current-contract
        ))
    ))
)

;; what the indices say is still unsold
(define-read-only (pooled-sbtc)
  (/ (* (var-get total-shares) (var-get unfilled-index)) SCALE)
)

;; ---------- lifecycle ----------

;; Once, by the ladder owner: the spread as named, then register, seated or not.
(define-public (initialize
    (bps uint)
    (seat bool)
  )
  (begin
    ;; only the ladder owner may seat a band rung: registering at a taken
    ;; spread replaces the holder, so this must not be open to anyone who
    ;; can redeploy the blessed code
    (asserts! (is-eq tx-sender (contract-call? LADDER get-owner))
      ERR_NOT_AUTHORIZED
    )
    (asserts! (not (var-get initialized)) ERR_ALREADY_INITIALIZED)
    (asserts! (< bps BPS_PRECISION) ERR_BAD_SPREAD)
    (asserts! (is-eq (own-name) (expected-name bps)) ERR_BAD_NAME)
    (var-set spread-bps bps)
    (var-set initialized true)
    ;; no floor stored yet: the first push derives it from the miner band.
    ;; The ladder keys one rung per (side, spread); the market-price slot
    ;; logs u0 for the same reason.
    ;; `seat` true: registering IS the seat (taken spread -> replace), and
    ;; the market keeps a local copy of who holds one, so tell it about
    ;; ourselves. `seat` false: registered only, an ordinary maker on the
    ;; book that prints through the ladder; the owner can seat it later
    ;; with the ladder's seat-band.
    (if seat
      (begin
        (try! (contract-call? LADDER register SIDE bps u0))
        (try! (contract-call? MARKET sync-seat current-contract))
        true
      )
      (begin
        (try! (contract-call? LADDER register-unseated SIDE bps u0))
        true
      )
    )
    (ok true)
  )
)

;; ladder owner only: stop or resume pushes to the market
(define-public (set-push-paused (paused bool))
  (begin
    (asserts! (is-eq tx-sender (contract-call? LADDER get-owner))
      ERR_NOT_AUTHORIZED
    )
    (var-set push-paused paused)
    (print {
      event: "rung-push-paused",
      paused: paused,
    })
    (ok true)
  )
)

;; ---------- sync ----------

;; Fold the market's state into the indices. Fills shrink the market size and
;; put STX here; refunds (dust, cancel) move sBTC from the market to here.
;; `actual` = market size + sats held here; `recorded` = what the indices last knew.
;; A shortfall is a fill: unfilled-index scales down by actual/recorded and every
;; new micro-STX is spread per share.
(define-public (sync)
  (let (
      (shares (var-get total-shares))
      (local (- (unwrap-panic (contract-call? SBTC get-balance current-contract))
        (var-get reserved-sats)
      ))
      (actual (+ (market-size) local))
      (recorded (pooled-sbtc))
      (stx-now (stx-get-balance current-contract))
      (gained (- stx-now (var-get stx-accounted)))
    )
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (var-set held-sats local)
    (if (is-eq shares u0)
      ;; nobody in: nothing to attribute. The watermark stays put, so STX
      ;; that arrives with no members (a fill of ownerless dust) is credited
      ;; to the next epoch's members at their first sync, never stranded.
      (ok true)
      (let (
          (new-index (if (and (< actual recorded) (> recorded u0))
            (/ (* (var-get unfilled-index) actual) recorded)
            (var-get unfilled-index)
          ))
          (scaled (+ (* gained PROCEEDS_SCALE) (var-get proceeds-carry)))
          (new-proceeds (+ (var-get proceeds-index) (/ scaled shares)))
        )
        (var-set proceeds-index new-proceeds)
        (var-set stx-accounted stx-now)
        (var-set current-proceeds (+ (var-get current-proceeds) gained))
        (var-set proceeds-carry (mod scaled shares))
        (if (or (< actual SOLD_OUT_DUST) (< new-index (/ MINT_FLOOR RESCALE)))
          ;; sold out (under the dust floor, or over 99.9% of the pool gone in
          ;; one fill): close the epoch the lossless way, a tail roll. What
          ;; still rests comes off the market and the closing epoch's unsold
          ;; share is reserved for its members.
          (begin
            (var-set unfilled-index new-index)
            (try! (roll-tail))
          )
          (if (< new-index MINT_FLOOR)
            ;; a healthy pool whose index drifted under the floor: rescale.
            ;; index x RESCALE, total shares / RESCALE, one more scale step;
            ;; positions are carried across lazily by settle-proceeds
            (let ((next (+ (var-get scale) u1)))
              (var-set unfilled-index (* new-index RESCALE))
              ;; The sub-unit carry remains backed by this epoch's unpaid
              ;; proceeds, for its final member. Do not change its denominator.
              (var-set proceeds-carry u0)
              (var-set total-shares (/ shares RESCALE))
              (var-set scale next)
              (map-set scale-start next new-proceeds)
              (is-ok (contract-call? LADDER log-rescale (var-get epoch) next
                new-proceeds (var-get unfilled-index) (var-get total-shares)
              ))
            )
            (begin
              (var-set unfilled-index new-index)
              true
            )
          )
        )
        (ok true)
      )
    )
  )
)

;; ---------- member actions ----------

;; Join the rung with `amount` sats. Goes to the market when the pool is at
;; or above the market minimum (pushing along anything held), else waits here.
(define-public (deposit (amount uint))
  (let ((member tx-sender))
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (asserts! (>= amount MIN_DEPOSIT) ERR_TOO_SMALL)
    ;; sync keeps the index at or above MINT_FLOOR (rescale), so the mint
    ;; below never divides by a collapsed index
    (try! (sync))
    (let ((paid (try! (settle-proceeds member))))
      (try! (contract-call? SBTC transfer amount member current-contract none))
      (let (
          (to-push (+ amount (var-get held-sats)))
          ;; An empty pool may receive unsolicited input. The first depositor
          ;; takes it in; funded epochs themselves leave no exit/roll residue.
          (orphan (if (is-eq (var-get total-shares) u0)
            (+ (market-size) (var-get held-sats))
            u0
          ))
          (shares (/ (* (+ amount orphan) SCALE) (var-get unfilled-index)))
          ;; settle-proceeds carried an existing position to the current
          ;; scale (and deleted an old-epoch one), so the shares add up
          (pos (position-of member))
          (joining (is-none (map-get? positions member)))
          (epo (var-get epoch))
        )
        ;; Keep at least one proceeds-index tick per received base unit.
        ;; A refusal rolls back the transfer and settlement above as well.
        (asserts! (<= (+ (var-get total-shares) shares) PROCEEDS_SCALE)
          ERR_TOO_MANY_SHARES
        )
        ;; the market's minimum is on the whole position (live + parked + new);
        ;; the market's deposit takes a parked position back by itself (a free
        ;; slot, else the smallest maker is bumped when the combined size is
        ;; bigger); if it refuses (queue full, crossing, stale update) the
        ;; funds are held here instead of aborting for every member
        (if (and
            (>= (+ to-push (market-size)) (min-market))
            (is-ok (push-to-market to-push))
          )
          (var-set held-sats u0)
          (var-set held-sats to-push)
        )
        (map-set positions member {
          epoch: epo,
          scale: (var-get scale),
          shares: (+ (get shares pos) shares),
          paid-index: (var-get proceeds-index),
        })
        (var-set proceeds-carry u0)
        (var-set total-shares (+ (var-get total-shares) shares))
        (and joining (var-set members (+ (var-get members) u1)))
        ;; the log is best effort: a member's funds never hang on a print
        (is-ok (contract-call? LADDER log-deposit member amount shares epo
          (is-eq (var-get held-sats) u0) (var-get held-sats)
        ))
        (ok {
          amount: amount,
          shares: shares,
          epoch: epo,
          stx-paid: (get stx paid),
          sbtc-paid: (get sbtc paid),
        })
      )
    )
  )
)

;; Take `amount` of your unsold sats back (and your STX). Comes from what is
;; held here first, then from the market by partial withdrawal; if that would
;; leave the market position under the market minimum the whole position is cancelled
;; and the rest held here for the others.
;; Push what this contract holds onto the market. Sponsor-friendly deposits:
;; a member's `deposit` with an empty update (0x00) needs no oracle read from
;; the member; when the market needs a price the funds are held here, and
;; any keeper pushes them later with a fresh update. (ok true) when pushed,
;; (ok false) when there is nothing to push, the pool is under the market
;; minimum, or the market refuses (the funds stay held).
(define-public (push)
  (begin
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (try! (sync))
    (let (
        (to-push (var-get held-sats))
        (pushed (and
          (> to-push u0)
          (>= (+ to-push (market-size)) (min-market))
          (is-ok (push-to-market to-push))
        ))
      )
      (if pushed
        (var-set held-sats u0)
        true
      )
      (is-ok (contract-call? LADDER log-push tx-sender to-push pushed
        (var-get held-sats)
      ))
      (ok pushed)
    )
  )
)

(define-public (withdraw
    (amount uint)
    (update (optional (buff 8192)))
  )
  (let ((member tx-sender))
    (asserts! (is-some (map-get? positions member)) ERR_NO_POSITION)
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (try! (sync))
    (let ((paid (try! (settle-proceeds member))))
      ;; an old-epoch member was paid out and deleted by settle-proceeds:
      ;; return that payout instead of failing, so a dispatch batch with one
      ;; closed rung still goes through
      (if (is-none (map-get? positions member))
        (ok paid)
        (let (
            (fi (var-get unfilled-index))
            ;; read after settle-proceeds: it carried the position to the
            ;; current scale, which changes its share count
            (member-shares (get shares (unwrap-panic (map-get? positions member))))
            (mine (/ (* member-shares fi) SCALE))
            ;; round the burn UP: a floor here paid `amount` for fewer shares than
            ;; it is worth once fi < SCALE, so 1-sat withdraws drained the others
            (partial (/ (+ (* amount SCALE) (- fi u1)) fi))
            ;; a full exit when asked for all, or when the partial would leave
            ;; shares worth under 1 sat (ARION F-8: such a rest could never be
            ;; withdrawn). `or` stops at the first test, so the subtraction only
            ;; runs for amount < mine, where partial <= shares - 1.
            (full (or
              (>= amount mine)
              (is-eq (/ (* (- member-shares partial) fi) SCALE) u0)
            ))
            (shares-out (if full
              member-shares
              partial
            ))
            (take (if (and full (is-eq (var-get members) u1))
              (+ (market-size) (var-get held-sats))
              (if full
                mine
                amount
              )
            ))
            (epo (var-get epoch))
          )
          ;; a position already worth 0 sats still exits: it burns its shares
          ;; and moves no sBTC (a zero transfer fails)
          (and
            (> take u0)
            (begin
              (try! (escrow-for take update))
              (try! (pull-to-held-sats take))
              (try! (as-contract? ((with-ft SBTC SBTC_NAME take))
                (try! (contract-call? SBTC transfer take current-contract member none))
              ))
              (var-set held-sats (- (var-get held-sats) take))
              true
            )
          )
          (if full
            (map-delete positions member)
            (map-set positions member {
              epoch: epo,
              scale: (var-get scale),
              shares: (- member-shares shares-out),
              paid-index: (var-get proceeds-index),
            })
          )
          (var-set proceeds-carry u0)
          (var-set total-shares (- (var-get total-shares) shares-out))
          (and full (var-set members (- (var-get members) u1)))
          (let ((dust (if (is-eq (var-get members) u0)
              (try! (close-epoch member))
              u0
            )))
            (is-ok (contract-call? LADDER log-withdraw member take shares-out epo
              (var-get held-sats)
            ))
            (ok {
              sbtc: take,
              stx: (+ (get stx paid) dust),
            })
          )
        )
      )
    )
  )
)

;; STX from fills only; the sBTC keeps resting (an old-epoch position also
;; gets its reserved sBTC). settle-proceeds logs the payout.
(define-public (claim)
  (begin
    (asserts! (is-some (map-get? positions tx-sender)) ERR_NO_POSITION)
    (try! (sync))
    (settle-proceeds tx-sender)
  )
)

;; ---------- private ----------

;; this contract's own name, from its principal
(define-private (own-name)
  (default-to "" (get name (unwrap-panic (principal-destruct? current-contract))))
)

;; "jing-buy-stx-spread-20-floor-331-50" for (u20, u33150): the spread in
;; basis points, then the floor as whole sats, dash, two-digit hundredths
;; "jing-buy-stx-spread-20" for u20: the spread in basis points, nothing
;; else; the guard is not a number in the name, it is the miner band
(define-private (expected-name (bps uint))
  (concat NAME_PREFIX (int-to-ascii bps))
)

(define-private (position-of (who principal))
  (default-to {
    epoch: (var-get epoch),
    scale: (var-get scale),
    shares: u0,
    paid-index: (var-get proceeds-index),
  }
    (map-get? positions who)
  )
)

;; Pay `who` the STX their shares earned since their paid-index, then move
;; the mark. Called after sync by every member action.
;; Tail roll: every sold-out close in sync (dust or index floor) closes the
;; epoch without loss. The order comes back from the market
;; (cancel returns pending, live and parked with no oracle or pause check),
;; the closing epoch's unsold share is reserved at its final unfilled-index
;; for its members to take on their next withdraw, claim or deposit, and the
;; next deposit opens a fresh epoch.
(define-private (roll-tail)
  (let ((epo (var-get epoch)))
    (if (> (market-size) u0)
      (begin
        (try! (as-contract? ()
          (try! (contract-call? MARKET cancel-token-x-deposit SBTC SBTC_NAME))
        ))
        true
      )
      true
    )
    (let (
        (free (- (unwrap-panic (contract-call? SBTC get-balance current-contract))
          (var-get reserved-sats)
        ))
        (reserve free)
        (final-proceeds (var-get proceeds-index))
      )
      (map-set epoch-final-proceeds epo final-proceeds)
      (map-set epoch-final-unfilled epo (var-get unfilled-index))
      (map-set epoch-final-scale epo (var-get scale))
      (var-set reserved-sats (+ (var-get reserved-sats) reserve))
      (var-set held-sats (- free reserve))
      (map-set epoch-reserve epo {
        left: (var-get members),
        reserve: reserve,
        proceeds: (var-get current-proceeds),
      })
      (var-set current-proceeds u0)
      (var-set proceeds-carry u0)
      (is-ok (contract-call? LADDER log-epoch-closed epo final-proceeds))
      (var-set epoch (+ epo u1))
      (var-set total-shares u0)
      (var-set members u0)
      (var-set unfilled-index SCALE)
      (ok true)
    )
  )
)

;; Last current member has already received all unfilled input. Flush any
;; proceeds recognized while escrow-for synchronized, then close the epoch.
(define-private (close-epoch (who principal))
  (let (
      (e (var-get epoch))
      (owed (var-get current-proceeds))
      (final-proceeds (var-get proceeds-index))
    )
    (and (> owed u0) (try! (as-contract? ((with-stx owed))
      (try! (stx-transfer? owed current-contract who))
    )))
    (var-set stx-accounted (- (var-get stx-accounted) owed))
    (var-set current-proceeds u0)
    (var-set proceeds-carry u0)
    (map-set epoch-final-proceeds e final-proceeds)
    (map-set epoch-final-scale e (var-get scale))
    (and (> owed u0) (is-ok (contract-call? LADDER log-payout who owed u0 e)))
    (is-ok (contract-call? LADDER log-epoch-closed e final-proceeds))
    (var-set epoch (+ e u1))
    (var-set total-shares u0)
    (var-set unfilled-index SCALE)
    (ok owed)
  )
)

;; Every debit follows an actual payout. The last claimer took both balances
;; in full via epoch-payout, so deleting this row cannot abandon any funds.
(define-private (count-reserve-claim
    (e uint)
    (back uint)
    (paid uint)
  )
  (match (map-get? epoch-reserve e)
    r (if (is-eq (get left r) u1)
      (map-delete epoch-reserve e)
      (map-set epoch-reserve e {
        left: (- (get left r) u1),
        reserve: (if (> back (get reserve r))
          u0
          (- (get reserve r) back)
        ),
        proceeds: (if (> paid (get proceeds r))
          u0
          (- (get proceeds r) paid)
        ),
      })
    )
    true
  )
)

(define-private (settle-proceeds (who principal))
  (match (map-get? positions who)
    pos (let (
        (pos-epoch (get epoch pos))
        (stored (get shares pos))
        (from (get scale pos))
        (current (is-eq pos-epoch (var-get epoch)))
        ;; the scale this position is carried to: now, or where its epoch closed
        (to (if current
          (var-get scale)
          (final-scale pos-epoch)
        ))
        (upto (if current
          (var-get proceeds-index)
          (final-index pos-epoch)
        ))
        (carried-shares (carried stored from to))
        (payout (epoch-payout pos-epoch
          (if current
            u0
            (/ (* carried-shares (final-unfilled pos-epoch)) SCALE)
          )
          (earned stored from to (get paid-index pos) upto)
        ))
        (owed (get proceeds payout))
        (back (get input payout))
      )
      (and
        (> owed u0)
        (try! (as-contract? ((with-stx owed))
          (try! (stx-transfer? owed current-contract who))
        ))
      )
      (var-set stx-accounted (- (var-get stx-accounted) owed))
      (and current (var-set current-proceeds (- (var-get current-proceeds) owed)))
      ;; A sole member takes the carry's backing too; it must not be indexed again.
      (and
        current
        (is-eq (var-get members) u1)
        (var-set proceeds-carry u0)
      )
      ;; an old epoch closed by a tail roll: its unsold share comes out of the reserve
      (and
        (> back u0)
        (try! (as-contract? ((with-ft SBTC SBTC_NAME back))
          (try! (contract-call? SBTC transfer back current-contract who none))
        ))
      )
      (var-set reserved-sats (- (var-get reserved-sats) back))
      (and (not current) (count-reserve-claim pos-epoch back owed))
      ;; an old-epoch position has nothing left: paid in full, gone
      (if current
        (map-set positions who
          (merge pos {
            scale: to,
            shares: carried-shares,
            paid-index: upto,
          })
        )
        (map-delete positions who)
      )
      ;; one log for every payout, whichever action ran it (claim, withdraw,
      ;; deposit); best effort like every other print
      (and
        (or (> owed u0) (> back u0))
        (is-ok (contract-call? LADDER log-payout who owed back pos-epoch))
      )
      (ok {
        stx: owed,
        sbtc: back,
      })
    )
    (ok {
      stx: u0,
      sbtc: u0,
    })
  )
)

;; Make sure `held-sats` covers `amount`: partial-withdraw the gap from the market,
;; or cancel the whole market position when the remainder would sit under
;; the market minimum.
;; One attempt to push the pool onto the market. Its own function so the
;; try! returns from here, not from deposit: a refusal is a value the caller
;; can read (is-ok) and answer by holding, while the market's own state rolls
;; back with the failed call. A parked position is taken back by the market
;; inside this same deposit (free slot, else bump on the combined size).
(define-private (push-to-market (to-push uint))
  ;; a miner-band rung re-derives its floor on every push; with no miner data
  ;; (u0) it does not push at all, the funds stay held
  (let ((g (current-floor)))
    (asserts! (not (var-get push-paused)) ERR_PUSH_PAUSED)
    (asserts! (>= stacks-block-time (+ (var-get escrow-cancelled-at) u86400))
      ERR_ESCROW_COOLDOWN
    )
    (asserts! (> g u0) ERR_ZERO_PRICE)
    (var-set floor g)
    (as-contract? ((with-ft SBTC SBTC_NAME to-push))
      (try! (contract-call? MARKET deposit-token-x to-push g
        (some (var-get spread-bps)) SBTC SBTC_NAME
      ))
    )
  )
)

;; Any keeper: move the market's stored floor to the current miner band
;; without depositing (a miner-band rung with a resting or parked position
;; whose floor would otherwise stay where the last push left it).
(define-public (refresh-guard)
  (let ((g (current-floor)))
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (asserts! (> g u0) ERR_ZERO_PRICE)
    (var-set floor g)
    (as-contract? ()
      (try! (contract-call? MARKET set-token-x-limit g (some (var-get spread-bps))))
    )
  )
)

;; An exit that needs the pending escrow (escrow-for) settles it before pulling
;; funds from the market. Once pending escrow is at least 24 hours old, cancel
;; instead: cancellation returns pending + live + parked funds without an oracle
;; or pause check, and starts the 24h push cooldown.
;; Add the refund to held funds; escrow-for synchronizes before paying the member.
(define-private (settle-escrow (update (optional (buff 8192))))
  (match (contract-call? MARKET get-token-x-pending-deposit current-contract)
    pending (if (>= stacks-block-time (+ (get submitted-at pending) u86400))
      (let ((refunded (try! (as-contract? ()
          (try! (contract-call? MARKET cancel-token-x-deposit SBTC SBTC_NAME))
        ))))
        (var-set held-sats (+ (var-get held-sats) refunded))
        (var-set escrow-cancelled-at stacks-block-time)
        (ok true)
      )
      (begin
        (try! (contract-call? MARKET settle-token-x-deposit current-contract
          (unwrap! update ERR_UPDATE_REQUIRED) SBTC SBTC_NAME
        ))
        (ok true)
      )
    )
    (ok true)
  )
)

;; live + parked on the market: what a partial withdraw or a cancel can take
;; without settling the pending escrow
(define-private (on-book)
  (+
    (contract-call? MARKET get-token-x-deposit
      (contract-call? MARKET get-current-cycle) current-contract
    )
    (contract-call? MARKET get-token-x-parked current-contract)
  )
)

;; An exit waits on the pending escrow only when it needs those funds: when
;; what is held here plus live + parked cannot pay `take`. Otherwise a young
;; pending (a 1-sat push, an honest top-up) does not ask for an oracle
;; (Void Kael #2, ARION F-9). A settle can refund the escrow here (crossing,
;; queue-full), so sync again to count it as held.
(define-private (escrow-for
    (take uint)
    (update (optional (buff 8192)))
  )
  (if (<= take (+ (var-get held-sats) (on-book)))
    (ok true)
    (begin
      (try! (settle-escrow update))
      (sync)
    )
  )
)

(define-private (pull-to-held-sats (amount uint))
  (let ((have (var-get held-sats)))
    (if (>= have amount)
      (ok true)
      (let (
          (gap (- amount have))
          ;; a pending escrow the exit did not need stays pending: size the
          ;; partial on live + parked (a cancel returns the pending too)
          (on-market (on-book))
        )
        (asserts! (>= on-market gap) ERR_INSUFFICIENT)
        (if (>= (- on-market gap) (min-market))
          (begin
            (try! (as-contract? ()
              (try! (contract-call? MARKET withdraw-token-x gap SBTC SBTC_NAME))
            ))
            (var-set held-sats (+ have gap))
            (ok true)
          )
          (let ((refunded (try! (as-contract? ()
              (try! (contract-call? MARKET cancel-token-x-deposit SBTC SBTC_NAME))
            ))))
            (var-set held-sats (+ have refunded))
            (ok true)
          )
        )
      )
    )
  )
)
