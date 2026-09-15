;; jing-sell-stx-market-spread
;;
;; The mirror of jing-buy-stx-market-spread: a pooled STX sell (STX resting,
;; the market's y side) PEGGED to the market mid on markets-sbtc-stx-jing-v6.
;; It bids mid - spread-bps and v6 re-evaluates that against the fresh Lazer
;; mid at every settlement (`spread-bps: (some s)` on the order): no keeper,
;; no reprice. Deployed by anyone from this template; the name carries
;; both numbers the order rests with: jing-sell-stx-spread-20-cap-331-50
;; bids mid - 20 bps and sits out whenever that would be over 331.50 sats
;; per STX (the cap v6 wants next to a pegged bid). `initialize` takes the
;; same two integers (u20, u33150) and derives the cap in the market unit,
;; 1e18 / 33150. Registered in jing-ladder under side "sell-peg", keyed by
;; the (spread, cap) pair packed into one uint. Same accounting as
;; jing-buy-stx with the tokens swapped: shares are micro-STX at
;; unfilled-index SCALE, proceeds are sats per share. Only the token legs
;; differ here.

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

;; an epoch closes when what is left unsold, on the market plus held here, is
;; under this many micro-STX: a walk fill is sized in whole sats so a fully
;; taken pool keeps up to one sat's worth of STX (about 3,000 uSTX at 330
;; sats per STX; 10,000 covers STX up to 100 sats), and the market refunds a
;; remainder under its minimum back here. An absolute floor, not a fraction of
;; the pool: the remainder is a fixed size whatever the pool was (a fraction
;; closed a small pool late and a big one early). The pool is sold out, the
;; next deposit starts a fresh epoch; what is left rides into it.
(define-constant SOLD_OUT_DUST u10000)

(define-constant MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6)
(define-constant LADDER 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-ladder)
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant SBTC_NAME "sbtc-token")
(define-constant WSTX 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2)
(define-constant WSTX_NAME "wstx")
(define-constant SIDE "sel-band")
;; the deploy name must be NAME_PREFIX + spread + "-cap-" + the cap as named:
;; jing-sell-stx-spread-20-cap-331-50
(define-constant NAME_PREFIX "jing-sell-stx-spread-")
;; v6 rejects a spread of 10000 bps or more (u1026)
(define-constant BPS_PRECISION u10000)
;; market price unit is micro-STX per sat times 1e10; from hundredths of a
;; sat per STX: price = 1e6 * 1e10 * 100 / cents = 1e18 / cents
(define-constant PRICE_NUMERATOR u1000000000000000000)

;; fixed-point precision of the two indices (12 decimals): fine enough that
;; no member's share rounds to nothing, small enough that shares * index *
;; SCALE stays far below uint128
(define-constant SCALE u1000000000000)
;; the market's own minimum per maker, read live: the operator can raise it
;; (set-min-token-y-deposit) and a stale constant would make the partial
;; withdraw branch call the market with a remainder it rejects (u1004)
;; literal principal on purpose: the node's read-only analysis rejects a
;; contract-call? through a constant here (clarinet accepts it, mainnet does not)
;; ---------- miner band (guard from a second, on-chain source) ----------
;;
;; This rung has no fixed cap in its name. Its cap is
;; derived on every push from the STX price Stacks miners are paying, read
;; from the deployed RFQ's native oracle (rfq-sbtc-stx-jing-v2-3
;; `get-native-price`: miner-spend-total per tenure against the coinbase,
;; averaged over a day of tenures, in the market's own price unit). Nobody
;; can move that number without burning real bitcoin, and it does not come
;; from Pyth, so a fat-finger Pyth print cannot fill this rung:
;; selling STX under half the miners' price is refused (cap = native * 2).
;; One oracle, one place: the RFQ computes it, the rungs read it.
;; The miners' implied STX price in the market unit; u0 when the oracle
;; cannot read it (a fresh chain, a simulation without tenure data). The
;; principal is a literal, not a constant: a read-only may only call a
;; contract it names literally (a constant is a dynamic call, refused).
(define-read-only (miner-mid)
  (match (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.rfq-sbtc-stx-jing-v2-3 get-native-price)
    p p
    e u0
  )
)

;; The cap this rung rests with right now: double the miners' price.
(define-read-only (current-cap)
  (* (miner-mid) u2)
)

(define-read-only (min-market)
  (get min-token-y
    (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6
      get-min-deposits
    )
  )
)
;; smallest member deposit, 0.1 STX: a dust guard, not a maths need
(define-constant MIN_DEPOSIT u100000)

(define-data-var initialized bool false)
;; distance from mid in basis points, as named (20 -> u20); zero sits at mid
(define-data-var spread-bps uint u0)
;; the same cap in the market unit (1e18 / cents): what the order rests with
(define-data-var cap uint u0)
(define-data-var total-shares uint u0)
;; a sold-out pool closes its epoch: index and shares restart, old members
;; keep their claim against the epoch's final proceeds-index
(define-data-var epoch uint u0)
(define-map epoch-final-proceeds
  uint
  uint
)
(define-data-var unfilled-index uint SCALE)
(define-data-var proceeds-index uint u0)
;; micro-STX kept in this contract, off the market (under the market minimum, or refunds)
(define-data-var held-ustx uint u0)
;; sats balance already folded into proceeds-index
(define-data-var sats-accounted uint u0)

(define-map positions
  principal
  {
    epoch: uint,
    shares: uint,
    paid-index: uint,
  }
)

;; ---------- reads ----------

(define-read-only (get-spread-bps)
  (var-get spread-bps)
)

(define-read-only (get-cap)
  (var-get cap)
)

(define-read-only (get-state)
  {
    spread-bps: (var-get spread-bps),
    cap: (var-get cap),
    epoch: (var-get epoch),
    total-shares: (var-get total-shares),
    unfilled-index: (var-get unfilled-index),
    proceeds-index: (var-get proceeds-index),
    held-ustx: (var-get held-ustx),
    resting: (market-size),
    pooled: (pooled-stx),
  }
)

;; STX still unsold for `who`, and the sBTC they can claim, as of the last sync
(define-read-only (get-position (who principal))
  (match (map-get? positions who)
    p (if (is-eq (get epoch p) (var-get epoch))
      {
        shares: (get shares p),
        stx: (/ (* (get shares p) (var-get unfilled-index)) SCALE),
        sbtc: (/ (* (get shares p) (- (var-get proceeds-index) (get paid-index p))) SCALE),
      }
      ;; an earlier epoch: sold out, only the proceeds against its final index remain
      {
        shares: (get shares p),
        stx: u0,
        sbtc: (/ (* (get shares p) (- (final-index (get epoch p)) (get paid-index p))) SCALE),
      }
    )
    {
      shares: u0,
      stx: u0,
      sbtc: u0,
    }
  )
)

(define-read-only (final-index (e uint))
  (default-to (var-get proceeds-index) (map-get? epoch-final-proceeds e))
)

;; live + parked size of this contract on the market
(define-read-only (market-size)
  (+
    (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6
      get-token-y-deposit
      (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6
        get-current-cycle
      )
      current-contract
    )
    (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6
      get-token-y-parked current-contract
    )
  )
)

(define-read-only (pooled-stx)
  (/ (* (var-get total-shares) (var-get unfilled-index)) SCALE)
)

;; ---------- lifecycle ----------

(define-public (initialize
    (bps uint)
    (seat bool)
  )
  (begin
    ;; only the ladder owner may seat a band rung: registering at a taken
    ;; spread replaces the holder, so this must not be open to anyone who
    ;; can redeploy the blessed code
    (asserts! (is-eq tx-sender (contract-call? LADDER get-owner)) ERR_NOT_AUTHORIZED)
    (asserts! (not (var-get initialized)) ERR_ALREADY_INITIALIZED)
    (asserts! (< bps BPS_PRECISION) ERR_BAD_SPREAD)
    (asserts! (is-eq (own-name) (expected-name bps)) ERR_BAD_NAME)
    (var-set spread-bps bps)
    (var-set initialized true)
    ;; no cap stored yet: the first push derives it from the miner band.
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

;; ---------- sync ----------

;; `actual` = market size + micro-STX held here; fills shrink it and put sBTC here.
(define-public (sync)
  (let (
      (shares (var-get total-shares))
      (local (stx-get-balance current-contract))
      (actual (+ (market-size) local))
      (recorded (pooled-stx))
      (sbtc-now (unwrap-panic (contract-call? SBTC get-balance current-contract)))
      (gained (- sbtc-now (var-get sats-accounted)))
    )
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (var-set held-ustx local)
    (if (is-eq shares u0)
      (begin
        (var-set sats-accounted sbtc-now)
        (ok true)
      )
      (let (
          (new-index (if (and (< actual recorded) (> recorded u0))
            (/ (* (var-get unfilled-index) actual) recorded)
            (var-get unfilled-index)
          ))
          (new-proceeds (if (> gained u0)
            (+ (var-get proceeds-index) (/ (* gained SCALE) shares))
            (var-get proceeds-index)
          ))
          (current-epoch (var-get epoch))
        )
        (var-set unfilled-index new-index)
        (var-set proceeds-index new-proceeds)
        (var-set sats-accounted sbtc-now)
        ;; sold out (down to sub-sat dust): close the epoch, restart the pool.
        ;; Dust still resting rides into the next epoch as a gift.
        (and
          (< actual SOLD_OUT_DUST)
          (begin
            (map-set epoch-final-proceeds current-epoch new-proceeds)
            (is-ok (contract-call? LADDER log-epoch-closed current-epoch new-proceeds))
            (var-set epoch (+ current-epoch u1))
            (var-set total-shares u0)
            (var-set unfilled-index SCALE)
          )
        )
        (ok true)
      )
    )
  )
)

;; ---------- member actions ----------

(define-public (deposit
    (amount uint)
    (update (buff 8192))
  )
  (let (
      (member tx-sender)
    )
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (asserts! (>= amount MIN_DEPOSIT) ERR_TOO_SMALL)
    (try! (sync))
    (try! (settle-proceeds member))
    (try! (stx-transfer? amount member current-contract))
    (let (
        (to-push (+ amount (var-get held-ustx)))
        (shares (/ (* amount SCALE) (var-get unfilled-index)))
        (pos (position-of member))
        (epo (var-get epoch))
      )
      ;; the market's minimum is on the whole position (live + parked + new);
      ;; the market's deposit takes a parked position back by itself (a free
      ;; slot, else the smallest maker is bumped when the combined size is
      ;; bigger); if it refuses (queue full, crossing, stale update) the
      ;; funds are held here instead of aborting for every member
      (if (and
          (>= (+ to-push (market-size)) (min-market))
          (is-ok (push-to-market to-push update))
        )
        (var-set held-ustx u0)
        (var-set held-ustx to-push)
      )
      (map-set positions member {
        epoch: epo,
        shares: (+ (get shares pos) shares),
        paid-index: (var-get proceeds-index),
      })
      (var-set total-shares (+ (var-get total-shares) shares))
      ;; the log is best effort: a member's funds never hang on a print
      (is-ok (contract-call? LADDER log-deposit member amount shares epo
        (is-eq (var-get held-ustx) u0) (var-get held-ustx)
      ))
      (ok true)
    )
  )
)

;; Push what this contract holds onto the market. Sponsor-friendly deposits:
;; a member's `deposit` with an empty update (0x00) needs no oracle read from
;; the member; when the market needs a price the funds are held here, and
;; any keeper pushes them later with a fresh update. (ok true) when pushed,
;; (ok false) when there is nothing to push, the pool is under the market
;; minimum, or the market refuses (the funds stay held).
(define-public (push (update (buff 8192)))
  (begin
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (try! (sync))
    (let (
        (to-push (var-get held-ustx))
        (pushed (and
          (> to-push u0)
          (>= (+ to-push (market-size)) (min-market))
          (is-ok (push-to-market to-push update))
        ))
      )
      (if pushed
        (var-set held-ustx u0)
        true
      )
      (is-ok (contract-call? LADDER log-push tx-sender to-push pushed (var-get held-ustx)))
      (ok pushed)
    )
  )
)

(define-public (withdraw (amount uint))
  (let (
      (member tx-sender)
      (pos (unwrap! (map-get? positions member) ERR_NO_POSITION))
    )
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (try! (sync))
    (try! (settle-proceeds member))
    ;; an old-epoch member was paid out and deleted by settle-proceeds
    (asserts! (is-some (map-get? positions member)) ERR_NO_POSITION)
    (let (
        (fi (var-get unfilled-index))
        (mine (/ (* (get shares pos) fi) SCALE))
        ;; round the burn UP: a floor here paid `amount` for fewer shares than
        ;; it is worth once fi < SCALE, so 1-sat withdraws drained the others
        (shares-out (if (>= amount mine)
          (get shares pos)
          (/ (+ (* amount SCALE) (- fi u1)) fi)
        ))
        (take (if (>= amount mine)
          mine
          amount
        ))
        (epo (var-get epoch))
      )
      (asserts! (> take u0) ERR_INSUFFICIENT)
      (try! (pull-to-held-ustx take))
      (try! (as-contract? ((with-stx take))
        (try! (stx-transfer? take current-contract member))
      ))
      (var-set held-ustx (- (var-get held-ustx) take))
      (if (is-eq shares-out (get shares pos))
        (map-delete positions member)
        (map-set positions member {
          epoch: epo,
          shares: (- (get shares pos) shares-out),
          paid-index: (var-get proceeds-index),
        })
      )
      (var-set total-shares (- (var-get total-shares) shares-out))
      (is-ok (contract-call? LADDER log-withdraw member take shares-out epo
        (var-get held-ustx)
      ))
      (ok true)
    )
  )
)

(define-public (claim)
  (begin
    (asserts! (is-some (map-get? positions tx-sender)) ERR_NO_POSITION)
    (try! (sync))
    (let ((paid (try! (settle-proceeds tx-sender))))
      (is-ok (contract-call? LADDER log-claim tx-sender paid (var-get epoch)))
      (ok true)
    )
  )
)

;; ---------- private ----------

;; this contract's own name, from its principal
(define-private (own-name)
  (default-to "" (get name (unwrap-panic (principal-destruct? current-contract))))
)

;; "jing-sell-stx-spread-20-cap-331-50" for (u20, u33150): the spread in
;; basis points, then the cap as whole sats, dash, two-digit hundredths
;; "jing-sell-stx-spread-20" for u20: the spread in basis points, nothing
;; else; the guard is not a number in the name, it is the miner band
(define-private (expected-name (bps uint))
  (concat NAME_PREFIX (int-to-ascii bps))
)

(define-private (position-of (who principal))
  (default-to {
    epoch: (var-get epoch),
    shares: u0,
    paid-index: (var-get proceeds-index),
  }
    (map-get? positions who)
  )
)

(define-private (settle-proceeds (who principal))
  (match (map-get? positions who)
    pos (let (
        (current (is-eq (get epoch pos) (var-get epoch)))
        (upto (if current
          (var-get proceeds-index)
          (final-index (get epoch pos))
        ))
        (owed (/ (* (get shares pos) (- upto (get paid-index pos))) SCALE))
      )
      (and
        (> owed u0)
        (try! (as-contract? ((with-ft SBTC SBTC_NAME owed))
          (try! (contract-call? SBTC transfer owed current-contract who none))
        ))
      )
      (var-set sats-accounted (- (var-get sats-accounted) owed))
      ;; an old-epoch position has no unsold size left: paid in full, gone
      (if current
        (map-set positions who (merge pos { paid-index: upto }))
        (map-delete positions who)
      )
      (ok owed)
    )
    (ok u0)
  )
)

;; One attempt to push the pool onto the market. Its own function so the
;; try! returns from here, not from deposit: a refusal is a value the caller
;; can read (is-ok) and answer by holding, while the market's own state rolls
;; back with the failed call. A parked position is taken back by the market
;; inside this same deposit (free slot, else bump on the combined size).
(define-private (push-to-market
    (to-push uint)
    (update (buff 8192))
  )
  ;; a miner-band rung re-derives its cap on every push; with no miner data
  ;; (u0) it does not push at all, the funds stay held
  (let ((g (current-cap)))
    (asserts! (> g u0) ERR_ZERO_PRICE)
    (var-set cap g)
    (as-contract? ((with-stx to-push))
      (try! (contract-call? MARKET deposit-token-y to-push g (some (var-get spread-bps)) update WSTX WSTX_NAME))
    )
  )
)

;; Any keeper: move the market's stored cap to the current miner band
;; without depositing (a miner-band rung with a resting or parked position
;; whose cap would otherwise stay where the last push left it).
(define-public (refresh-guard (update (buff 8192)))
  (let ((g (current-cap)))
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (asserts! (> g u0) ERR_ZERO_PRICE)
    (var-set cap g)
    (as-contract? ()
      (try! (contract-call? MARKET set-token-y-limit g (some (var-get spread-bps)) update))
    )
  )
)

(define-private (pull-to-held-ustx (amount uint))
  (let ((have (var-get held-ustx)))
    (if (>= have amount)
      (ok true)
      (let (
          (gap (- amount have))
          (on-market (market-size))
        )
        (asserts! (>= on-market gap) ERR_INSUFFICIENT)
        (if (>= (- on-market gap) (min-market))
          (begin
            (try! (as-contract? ()
              (try! (contract-call? MARKET withdraw-token-y gap WSTX WSTX_NAME))
            ))
            (var-set held-ustx (+ have gap))
            (ok true)
          )
          (let ((refunded (try! (as-contract? ()
              (try! (contract-call? MARKET cancel-token-y-deposit WSTX WSTX_NAME))
            ))))
            (var-set held-ustx (+ have refunded))
            (ok true)
          )
        )
      )
    )
  )
)
