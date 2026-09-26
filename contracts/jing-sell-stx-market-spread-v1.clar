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
;; The floor under the index: sync closes the epoch (a tail roll) as soon as
;; unfilled-index drops under 1e-3 of SCALE. The dust test (SOLD_OUT_DUST) is
;; on an AMOUNT, which leaves the index unbounded from below: new-index reduces
;; to actual * SCALE / total-shares, and shares are minted as amount * SCALE /
;; unfilled-index, so every sell-down and top-up cycle mints more of them until
;; the index truncates to 0 with `actual` still above the dust floor. At index 0
;; a deposit divides by zero, every withdraw is u7007 and sync freezes the zero.
;; Every action syncs first, so an open epoch never has an index under this
;; floor: shares are minted at most 1000 per micro-STX, and 0 is out of reach.
(define-constant MINT_FLOOR u1000000000)
(define-constant ERR_UPDATE_REQUIRED (err u7012))

;; an epoch closes when what is left unsold, on the market plus held here, is
;; under this many micro-STX: a walk fill is sized in whole sats so a fully
;; taken pool keeps up to one sat's worth of STX (about 3,000 uSTX at 330
;; sats per STX; 10,000 covers STX up to 100 sats), and the market refunds a
;; remainder under its minimum back here. An absolute floor, not a fraction of
;; the pool: the remainder is a fixed size whatever the pool was (a fraction
;; closed a small pool late and a big one early). The pool is sold out: the close is a
;; tail roll, so what is left is reserved for the closing epoch's members.
(define-constant SOLD_OUT_DUST u10000)

(define-constant MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3)
(define-constant LADDER 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-ladder-v1)
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant SBTC_NAME "sbtc-token")
(define-constant WSTX 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2)
(define-constant WSTX_NAME "wstx")
(define-constant SIDE "sell-peg")
;; the deploy name must be NAME_PREFIX + spread + "-cap-" + the cap as named:
;; jing-sell-stx-spread-20-cap-331-50
(define-constant NAME_PREFIX "jing-sell-stx-spread-")
(define-constant GUARD_INFIX "-cap-")
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
(define-read-only (min-market)
  (get min-token-y
    (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
      get-min-deposits
    )
  )
)
;; smallest member deposit, 0.1 STX: a dust guard, not a maths need
(define-constant MIN_DEPOSIT u100000)

(define-data-var initialized bool false)
(define-constant DEPLOYER tx-sender)
;; distance from mid in basis points, as named (20 -> u20); zero sits at mid
(define-data-var spread-bps uint u0)
;; the cap as named, in hundredths of a sat per STX (331.50 -> u33150)
(define-data-var cap-cents uint u0)
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
;; micro-STX owed to members of epochs closed by a tail roll, kept off the pool
(define-data-var reserved-ustx uint u0)
;; the unfilled-index an epoch closed with at a tail roll (absent: nothing owed)
(define-map epoch-final-unfilled
  uint
  uint
)
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

(define-read-only (get-cap-cents)
  (var-get cap-cents)
)

(define-read-only (get-state)
  {
    spread-bps: (var-get spread-bps),
    cap: (var-get cap),
    cap-cents: (var-get cap-cents),
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
      ;; an earlier epoch: its proceeds against the final index, plus its unsold
      ;; share when it closed by a tail roll
      {
        shares: (get shares p),
        stx: (/ (* (get shares p) (final-unfilled (get epoch p))) SCALE),
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

(define-read-only (final-unfilled (e uint))
  (default-to u0 (map-get? epoch-final-unfilled e))
)

(define-read-only (final-index (e uint))
  (default-to (var-get proceeds-index) (map-get? epoch-final-proceeds e))
)

;; live + parked size of this contract on the market
(define-read-only (market-size)
  (+
    (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
      get-token-y-deposit
      (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
        get-current-cycle
      )
      current-contract
    )
    (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
      get-token-y-parked current-contract
    )
    (default-to u0
      (get amount
        (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
          get-token-y-pending-deposit current-contract
        )
      )
    )
  )
)

(define-read-only (pooled-stx)
  (/ (* (var-get total-shares) (var-get unfilled-index)) SCALE)
)

;; ---------- lifecycle ----------

(define-public (initialize
    (bps uint)
    (cents uint)
  )
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) ERR_NOT_AUTHORIZED)
    (asserts! (not (var-get initialized)) ERR_ALREADY_INITIALIZED)
    (asserts! (< bps BPS_PRECISION) ERR_BAD_SPREAD)
    (asserts! (> cents u0) ERR_ZERO_PRICE)
    (asserts! (is-eq (own-name) (expected-name bps cents)) ERR_BAD_NAME)
    (let ((p (/ PRICE_NUMERATOR cents)))
      (var-set spread-bps bps)
      (var-set cap-cents cents)
      (var-set cap p)
      (var-set initialized true)
      ;; the ladder keys one rung per (side, value): the (spread, cap) pair
      ;; packed into one uint so two rungs can share a spread at different
      ;; caps; the market-price slot logs the cap in the market unit, as the
      ;; fixed rung logs its price
      (contract-call? LADDER register SIDE (+ (* cents BPS_PRECISION) bps) p)
    )
  )
)

;; ---------- sync ----------

;; `actual` = market size + micro-STX held here; fills shrink it and put sBTC here.
(define-public (sync)
  (let (
      (shares (var-get total-shares))
      (local (- (stx-get-balance current-contract) (var-get reserved-ustx)))
      (actual (+ (market-size) local))
      (recorded (pooled-stx))
      (sbtc-now (unwrap-panic (contract-call? SBTC get-balance current-contract)))
      (gained (- sbtc-now (var-get sats-accounted)))
    )
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (var-set held-ustx local)
    (if (is-eq shares u0)
      ;; nobody in: nothing to attribute. The watermark stays put, so proceeds
      ;; that arrive with no members (a fill of ownerless dust) are credited
      ;; to the next epoch's members at their first sync, never stranded.
      (ok true)
      (let (
          (new-index (if (and (< actual recorded) (> recorded u0))
            (/ (* (var-get unfilled-index) actual) recorded)
            (var-get unfilled-index)
          ))
          (new-proceeds (if (> gained u0)
            (+ (var-get proceeds-index) (/ (* gained SCALE) shares))
            (var-get proceeds-index)
          ))
        )
        (var-set unfilled-index new-index)
        (var-set proceeds-index new-proceeds)
        (var-set sats-accounted sbtc-now)
        ;; sold out (under the dust floor or the index floor): close the epoch
        ;; the lossless way, a tail roll. What still rests comes off the market
        ;; and the closing epoch's unsold share is reserved for its members, so
        ;; nothing of theirs rides into the next epoch or fills with no members.
        (and
          (or (< actual SOLD_OUT_DUST) (< new-index MINT_FLOOR))
          (try! (roll-tail))
        )
        (ok true)
      )
    )
  )
)

;; ---------- member actions ----------

(define-public (deposit (amount uint))
  (let (
      (member tx-sender)
    )
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (asserts! (>= amount MIN_DEPOSIT) ERR_TOO_SMALL)
    ;; sync rolls an epoch in its tail (index under MINT_FLOOR), so the mint
    ;; below never divides by a collapsed index
    (try! (sync))
    (let ((paid (try! (settle-proceeds member))))
      (try! (stx-transfer? amount member current-contract))
      (let (
          (to-push (+ amount (var-get held-ustx)))
          ;; an empty pool may still hold units nobody owns (rounding dust left
          ;; by the last exits or a roll): the first depositor takes them in
          ;; with their own, so the books match what is really there
          (orphan (if (is-eq (var-get total-shares) u0)
            (+ (market-size) (var-get held-ustx))
            u0
          ))
          (shares (/ (* (+ amount orphan) SCALE) (var-get unfilled-index)))
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
            (is-ok (push-to-market to-push))
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
        (ok { amount: amount, shares: shares, epoch: epo,
          stx-paid: (get stx paid), sbtc-paid: (get sbtc paid) })
      )
    )
  )
)

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
        (to-push (var-get held-ustx))
        (pushed (and
          (> to-push u0)
          (>= (+ to-push (market-size)) (min-market))
          (is-ok (push-to-market to-push))
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

(define-public (withdraw
    (amount uint)
    (update (optional (buff 8192)))
  )
  (let (
      (member tx-sender)
      (pos (unwrap! (map-get? positions member) ERR_NO_POSITION))
    )
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (try! (settle-escrow update))
    (try! (sync))
    (let ((paid (try! (settle-proceeds member))))
      ;; an old-epoch member was paid out and deleted by settle-proceeds:
      ;; return that payout instead of failing, so a dispatch batch with one
      ;; closed rung still goes through
      (if (is-none (map-get? positions member))
        (ok paid)
        (let (
            (fi (var-get unfilled-index))
            (member-shares (get shares pos))
            (mine (/ (* member-shares fi) SCALE))
            ;; round the burn UP: a floor here paid `amount` for fewer shares than
            ;; it is worth once fi < SCALE, so 1-sat withdraws drained the others
            (partial (/ (+ (* amount SCALE) (- fi u1)) fi))
            ;; a full exit when asked for all, or when the partial would leave
            ;; shares worth under 1 unit (ARION F-8: such a rest could never be
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
            (take (if full
              mine
              amount
            ))
            (epo (var-get epoch))
          )
          ;; a position already worth 0 units still exits: it burns its shares
          ;; and moves nothing (a zero transfer fails)
          (and
            (> take u0)
            (begin
              (try! (pull-to-held-ustx take))
              (try! (as-contract? ((with-stx take))
                (try! (stx-transfer? take current-contract member))
              ))
              (var-set held-ustx (- (var-get held-ustx) take))
              true
            )
          )
          (if full
            (map-delete positions member)
            (map-set positions member {
              epoch: epo,
              shares: (- member-shares shares-out),
              paid-index: (var-get proceeds-index),
            })
          )
          (var-set total-shares (- (var-get total-shares) shares-out))
          ;; the last member left: close the epoch and restart the index, so a pool
          ;; that ended in the tail takes deposits again at a fresh index
          (and
            (is-eq (var-get total-shares) u0)
            (begin
              (map-set epoch-final-proceeds epo (var-get proceeds-index))
              (is-ok (contract-call? LADDER log-epoch-closed epo (var-get proceeds-index)))
              (var-set epoch (+ epo u1))
              (var-set unfilled-index SCALE)
            )
          )
          (is-ok (contract-call? LADDER log-withdraw member take shares-out epo
            (var-get held-ustx)
          ))
          (ok { stx: take, sbtc: (get sbtc paid) })
        )
      )
    )
  )
)

(define-public (claim)
  (begin
    (asserts! (is-some (map-get? positions tx-sender)) ERR_NO_POSITION)
    (try! (sync))
    ;; settle-proceeds logs the payout (and an old-epoch position also gets
    ;; its reserved unsold share)
    (settle-proceeds tx-sender)
  )
)

;; ---------- private ----------

;; this contract's own name, from its principal
(define-private (own-name)
  (default-to "" (get name (unwrap-panic (principal-destruct? current-contract))))
)

;; "jing-sell-stx-spread-20-cap-331-50" for (u20, u33150): the spread in
;; basis points, then the cap as whole sats, dash, two-digit hundredths
(define-private (expected-name
    (bps uint)
    (cents uint)
  )
  (let (
      (whole (int-to-ascii (/ cents u100)))
      (frac (mod cents u100))
      (frac-str (if (< frac u10)
        (concat "0" (int-to-ascii frac))
        (int-to-ascii frac)
      ))
    )
    (concat
      (concat (concat (concat NAME_PREFIX (int-to-ascii bps)) GUARD_INFIX) whole)
      (concat "-" frac-str)
    )
  )
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

;; RAPHA NEEDS TO DOUBLE REVIEW this tail roll before any deploy (bounty
;; muerdzoc805a745ecc99, Nilo's tail freeze). Not fork-tested yet. Also still
;; open for this rung: ARION F-7 (proceeds absorbed while no members), F-9 (settle-escrow wants
;; a Lazer update even for exits that do not need one).
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
          (try! (contract-call? MARKET cancel-token-y-deposit WSTX WSTX_NAME))
        ))
        true
      )
      true
    )
    (let (
        (free (- (stx-get-balance current-contract) (var-get reserved-ustx)))
        (owed (pooled-stx))
        (reserve (if (< owed free)
          owed
          free
        ))
        (final-proceeds (var-get proceeds-index))
      )
      (map-set epoch-final-proceeds epo final-proceeds)
      (map-set epoch-final-unfilled epo (var-get unfilled-index))
      (var-set reserved-ustx (+ (var-get reserved-ustx) reserve))
      (var-set held-ustx (- free reserve))
      (is-ok (contract-call? LADDER log-epoch-closed epo final-proceeds))
      (var-set epoch (+ epo u1))
      (var-set total-shares u0)
      (var-set unfilled-index SCALE)
      (ok true)
    )
  )
)

(define-private (settle-proceeds (who principal))
  (match (map-get? positions who)
    pos (let (
        (pos-epoch (get epoch pos))
        (current (is-eq pos-epoch (var-get epoch)))
        (upto (if current
          (var-get proceeds-index)
          (final-index pos-epoch)
        ))
        (owed (/ (* (get shares pos) (- upto (get paid-index pos))) SCALE))
        (back (if current
          u0
          (/ (* (get shares pos) (final-unfilled pos-epoch)) SCALE)
        ))
      )
      (and
        (> owed u0)
        (try! (as-contract? ((with-ft SBTC SBTC_NAME owed))
          (try! (contract-call? SBTC transfer owed current-contract who none))
        ))
      )
      (var-set sats-accounted (- (var-get sats-accounted) owed))
      ;; an old epoch closed by a tail roll: its unsold share comes out of the reserve
      (and
        (> back u0)
        (try! (as-contract? ((with-stx back))
          (try! (stx-transfer? back current-contract who))
        ))
      )
      (var-set reserved-ustx (- (var-get reserved-ustx) back))
      ;; an old-epoch position has nothing left: paid in full, gone
      (if current
        (map-set positions who (merge pos { paid-index: upto }))
        (map-delete positions who)
      )
      ;; one log for every payout, whichever action ran it (claim, withdraw,
      ;; deposit); best effort like every other print
      (and
        (or (> owed u0) (> back u0))
        (is-ok (contract-call? LADDER log-payout who owed back pos-epoch))
      )
      (ok { sbtc: owed, stx: back })
    )
    (ok { stx: u0, sbtc: u0 })
  )
)

;; One attempt to push the pool onto the market. Its own function so the
;; try! returns from here, not from deposit: a refusal is a value the caller
;; can read (is-ok) and answer by holding, while the market's own state rolls
;; back with the failed call. A parked position is taken back by the market
;; inside this same deposit (free slot, else bump on the combined size).
(define-private (push-to-market (to-push uint))
  (as-contract? ((with-stx to-push))
    (try! (contract-call? MARKET deposit-token-y to-push (var-get cap) (some (var-get spread-bps)) WSTX WSTX_NAME))
  )
)

;; An exit normally settles pending escrow before pulling funds from the market.
;; Once pending escrow is at least 24 hours old, cancel instead: cancellation
;; returns pending + live + parked funds without an oracle or pause check.
;; Add the refund to held funds; withdraw synchronizes before paying the member.
(define-private (settle-escrow (update (optional (buff 8192))))
  (match (contract-call? MARKET get-token-y-pending-deposit current-contract)
    pending (if (>= stacks-block-time (+ (get submitted-at pending) u86400))
      (let ((refunded (try! (as-contract? ()
          (try! (contract-call? MARKET cancel-token-y-deposit WSTX WSTX_NAME))
        ))))
        (var-set held-ustx (+ (var-get held-ustx) refunded))
        (ok true)
      )
      (begin
        (try! (contract-call? MARKET settle-token-y-deposit current-contract
          (unwrap! update ERR_UPDATE_REQUIRED) WSTX WSTX_NAME
        ))
        (ok true)
      )
    )
    (ok true)
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
