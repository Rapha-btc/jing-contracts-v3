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
;;   proceeds-index  micro-STX earned per share since the start, times SCALE.
;; A member holds `shares` (sats at unfilled-index SCALE). Their remaining sBTC is
;; shares * unfilled-index / SCALE; their STX is shares * (proceeds-index -
;; paid-index) / SCALE. `sync` (permissionless, run first by every action)
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
;; The floor under the index: sync closes the epoch (a tail roll) as soon as
;; unfilled-index drops under 1e-3 of SCALE. The dust test (SOLD_OUT_DUST) is
;; on an AMOUNT, which leaves the index unbounded from below: new-index reduces
;; to actual * SCALE / total-shares, and shares are minted as amount * SCALE /
;; unfilled-index, so every sell-down and top-up cycle mints more of them until
;; the index truncates to 0 with `actual` still above the dust floor. At index 0
;; a deposit divides by zero, every withdraw is u7007 and sync freezes the zero.
;; Every action syncs first, so an open epoch never has an index under this
;; floor: shares are minted at most 1000 per sat, and 0 is out of reach.
(define-constant MINT_FLOOR u1000000000)
(define-constant ERR_UPDATE_REQUIRED (err u7012))

;; an epoch closes when what is left unsold, on the market plus held here, is
;; under this many sats: a walk fill is sized in whole sats so a fully taken
;; pool can keep a rounding remainder, and the market refunds a remainder under
;; its minimum back here. An absolute floor, not a fraction of the pool: the
;; remainder is a fixed size whatever the pool was (a fraction closed a small
;; pool late and a big one early). The pool is sold out: the close is a
;; tail roll, so what is left is reserved for the closing epoch's members.
(define-constant SOLD_OUT_DUST u10)

(define-constant MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3)
(define-constant LADDER 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-ladder-v1)
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant SBTC_NAME "sbtc-token")
(define-constant SIDE "buy-peg")
;; the deploy name must be NAME_PREFIX + spread + "-floor-" + the floor as named:
;; jing-buy-stx-spread-20-floor-331-50
(define-constant NAME_PREFIX "jing-buy-stx-spread-")
(define-constant GUARD_INFIX "-floor-")
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
;; (set-min-token-x-deposit) and a stale constant would make the partial
;; withdraw branch call the market with a remainder it rejects (u1004)
;; literal principal on purpose: the node's read-only analysis rejects a
;; contract-call? through a constant here (clarinet accepts it, mainnet does not)
(define-read-only (min-market)
  (get min-token-x
    (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
      get-min-deposits
    )
  )
)
;; smallest member deposit: a dust guard, not a maths need (shares are never
;; fewer than sats deposited; payouts round down by at most 1 unit)
(define-constant MIN_DEPOSIT u100)

(define-data-var initialized bool false)
(define-constant DEPLOYER tx-sender)
;; distance from mid in basis points, as named (20 -> u20); zero sits at mid
(define-data-var spread-bps uint u0)
;; the floor as named, in hundredths of a sat per STX (331.50 -> u33150)
(define-data-var floor-cents uint u0)
;; the same floor in the market unit (1e18 / cents): what the order rests with
(define-data-var floor uint u0)
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
;; sats kept in this contract, off the market (under the market minimum, or refunds)
(define-data-var held-sats uint u0)
;; sats owed to members of epochs closed by a tail roll, kept off the pool
(define-data-var reserved-sats uint u0)
;; the unfilled-index an epoch closed with at a tail roll (absent: nothing owed)
(define-map epoch-final-unfilled
  uint
  uint
)
;; micro-STX balance already folded into proceeds-index
(define-data-var stx-accounted uint u0)

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

(define-read-only (get-floor)
  (var-get floor)
)

(define-read-only (get-floor-cents)
  (var-get floor-cents)
)

(define-read-only (get-state)
  {
    spread-bps: (var-get spread-bps),
    floor: (var-get floor),
    floor-cents: (var-get floor-cents),
    epoch: (var-get epoch),
    total-shares: (var-get total-shares),
    unfilled-index: (var-get unfilled-index),
    proceeds-index: (var-get proceeds-index),
    held-sats: (var-get held-sats),
    resting: (market-size),
    pooled: (pooled-sbtc),
  }
)

;; sBTC still unsold for `who`, and the STX they can claim, as of the last sync
(define-read-only (get-position (who principal))
  (match (map-get? positions who)
    p (if (is-eq (get epoch p) (var-get epoch))
      {
        shares: (get shares p),
        sbtc: (/ (* (get shares p) (var-get unfilled-index)) SCALE),
        stx: (/ (* (get shares p) (- (var-get proceeds-index) (get paid-index p))) SCALE),
      }
      ;; an earlier epoch: its proceeds against the final index, plus its unsold
      ;; share when it closed by a tail roll
      {
        shares: (get shares p),
        sbtc: (/ (* (get shares p) (final-unfilled (get epoch p))) SCALE),
        stx: (/ (* (get shares p) (- (final-index (get epoch p)) (get paid-index p))) SCALE),
      }
    )
    {
      shares: u0,
      sbtc: u0,
      stx: u0,
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
      get-token-x-deposit
      (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
        get-current-cycle
      )
      current-contract
    )
    (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
      get-token-x-parked current-contract
    )
    (default-to u0
      (get amount
        (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
          get-token-x-pending-deposit current-contract
        )
      )
    )
  )
)

;; what the indices say is still unsold
(define-read-only (pooled-sbtc)
  (/ (* (var-get total-shares) (var-get unfilled-index)) SCALE)
)

;; ---------- lifecycle ----------

;; Once, by the deployer: the spread as named, then register.
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
      (var-set floor-cents cents)
      (var-set floor p)
      (var-set initialized true)
      ;; the ladder keys one rung per (side, value): the (spread, floor) pair
      ;; packed into one uint so two rungs can share a spread at different
      ;; floors; the market-price slot logs the floor in the market unit, as the
      ;; fixed rung logs its price
      (contract-call? LADDER register SIDE (+ (* cents BPS_PRECISION) bps) p)
    )
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
      (local (- (unwrap-panic (contract-call? SBTC get-balance current-contract)) (var-get reserved-sats)))
      (actual (+ (market-size) local))
      (recorded (pooled-sbtc))
      (stx-now (stx-get-balance current-contract))
      (gained (- stx-now (var-get stx-accounted)))
    )
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (var-set held-sats local)
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
        (var-set stx-accounted stx-now)
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

;; Join the rung with `amount` sats. Goes to the market when the pool is at
;; or above the market minimum (pushing along anything held), else waits here.
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
      (try! (contract-call? SBTC transfer amount member current-contract none))
      (let (
          (to-push (+ amount (var-get held-sats)))
          ;; an empty pool may still hold units nobody owns (rounding dust left
          ;; by the last exits or a roll): the first depositor takes them in
          ;; with their own, so the books match what is really there
          (orphan (if (is-eq (var-get total-shares) u0)
            (+ (market-size) (var-get held-sats))
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
          (var-set held-sats u0)
          (var-set held-sats to-push)
        )
        (map-set positions member {
          epoch: epo,
          shares: (+ (get shares pos) shares),
          paid-index: (var-get proceeds-index),
        })
        (var-set total-shares (+ (var-get total-shares) shares))
        ;; the log is best effort: a member's funds never hang on a print
        (is-ok (contract-call? LADDER log-deposit member amount shares epo
          (is-eq (var-get held-sats) u0) (var-get held-sats)
        ))
        (ok { amount: amount, shares: shares, epoch: epo,
          stx-paid: (get stx paid), sbtc-paid: (get sbtc paid) })
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
      (is-ok (contract-call? LADDER log-push tx-sender to-push pushed (var-get held-sats)))
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
            (var-get held-sats)
          ))
          (ok { stx: (get stx paid), sbtc: take })
        )
      )
    )
  )
)

;; STX from fills only; the sBTC keeps resting.
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

;; "jing-buy-stx-spread-20-floor-331-50" for (u20, u33150): the spread in
;; basis points, then the floor as whole sats, dash, two-digit hundredths
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

;; Pay `who` the STX their shares earned since their paid-index, then move
;; the mark. Called after sync by every member action.
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
          (try! (contract-call? MARKET cancel-token-x-deposit SBTC SBTC_NAME))
        ))
        true
      )
      true
    )
    (let (
        (free (- (unwrap-panic (contract-call? SBTC get-balance current-contract)) (var-get reserved-sats)))
        (owed (pooled-sbtc))
        (reserve (if (< owed free)
          owed
          free
        ))
        (final-proceeds (var-get proceeds-index))
      )
      (map-set epoch-final-proceeds epo final-proceeds)
      (map-set epoch-final-unfilled epo (var-get unfilled-index))
      (var-set reserved-sats (+ (var-get reserved-sats) reserve))
      (var-set held-sats (- free reserve))
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
        (try! (as-contract? ((with-stx owed))
          (try! (stx-transfer? owed current-contract who))
        ))
      )
      (var-set stx-accounted (- (var-get stx-accounted) owed))
      ;; an old epoch closed by a tail roll: its unsold share comes out of the reserve
      (and
        (> back u0)
        (try! (as-contract? ((with-ft SBTC SBTC_NAME back))
          (try! (contract-call? SBTC transfer back current-contract who none))
        ))
      )
      (var-set reserved-sats (- (var-get reserved-sats) back))
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
      (ok { stx: owed, sbtc: back })
    )
    (ok { stx: u0, sbtc: u0 })
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
  (as-contract? ((with-ft SBTC SBTC_NAME to-push))
    (try! (contract-call? MARKET deposit-token-x to-push (var-get floor) (some (var-get spread-bps)) SBTC SBTC_NAME))
  )
)

;; An exit normally settles pending escrow before pulling funds from the market.
;; Once pending escrow is at least 24 hours old, cancel instead: cancellation
;; returns pending + live + parked funds without an oracle or pause check.
;; Add the refund to held funds; withdraw synchronizes before paying the member.
(define-private (settle-escrow (update (optional (buff 8192))))
  (match (contract-call? MARKET get-token-x-pending-deposit current-contract)
    pending (if (>= stacks-block-time (+ (get submitted-at pending) u86400))
      (let ((refunded (try! (as-contract? ()
          (try! (contract-call? MARKET cancel-token-x-deposit SBTC SBTC_NAME))
        ))))
        (var-set held-sats (+ (var-get held-sats) refunded))
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

(define-private (pull-to-held-sats (amount uint))
  (let ((have (var-get held-sats)))
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
