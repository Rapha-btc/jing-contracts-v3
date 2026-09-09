;; jing-buy-stx
;;
;; A pooled STX buy (sBTC resting, the market's x side) at ONE price on
;; markets-sbtc-stx-jing-v5. Many users, one maker slot: the contract rests
;; the pooled sBTC at its price, receives the STX fills at settlement, and
;; hands each member their share of both what is still resting and what was
;; bought. Deployed by anyone at a new price from this template
;; (jing-buy-stx-331-50 = buy STX once it is at or under 331.50 sats). The
;; name is the human price in hundredths of a sat per STX; `initialize`
;; takes that same integer (u33150) and derives the market unit on chain,
;; micro-STX per sat times 1e10 = 1e18 / 33150, so name and price agree by
;; construction. Registered in jing-ladder against the canonical hash.
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
;; No fee, no owner action after initialize, no reprice: a rung is a price.

(define-constant ERR_NOT_AUTHORIZED (err u7001))
(define-constant ERR_ALREADY_INITIALIZED (err u7002))
(define-constant ERR_NOT_INITIALIZED (err u7003))
(define-constant ERR_ZERO_AMOUNT (err u7004))
(define-constant ERR_TOO_SMALL (err u7005))
(define-constant ERR_NO_POSITION (err u7006))
(define-constant ERR_INSUFFICIENT (err u7007))
(define-constant ERR_ZERO_PRICE (err u7008))
(define-constant ERR_BAD_NAME (err u7009))

;; an epoch closes when the unsold fraction falls under this, i.e. unsold *
;; 1,000,000 < total shares: what is left is rounding dust nobody could
;; withdraw. The pool is sold out, the next deposit starts a fresh epoch.
(define-constant SOLD_OUT_INDEX u1000000)

(define-constant MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v5)
(define-constant LADDER 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-ladder)
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant SBTC_NAME "sbtc-token")
(define-constant SIDE "buy-stx")
;; the deploy name must be NAME_PREFIX + the price as named: jing-buy-stx-331-50
(define-constant NAME_PREFIX "jing-buy-stx-")

;; fixed-point precision of the two indices (12 decimals): fine enough that
;; no member's share rounds to nothing, small enough that shares * index *
;; SCALE stays far below uint128
(define-constant SCALE u1000000000000)
;; market price unit is micro-STX per sat times 1e10; from hundredths of a
;; sat per STX: price = 1e6 * 1e10 * 100 / cents = 1e18 / cents
(define-constant PRICE_NUMERATOR u1000000000000000000)
;; the market's own minimum per maker, read live: the operator can raise it
;; (set-min-token-x-deposit) and a stale constant would make the partial
;; withdraw branch call the market with a remainder it rejects (u1004)
;; literal principal on purpose: the node's read-only analysis rejects a
;; contract-call? through a constant here (clarinet accepts it, mainnet does not)
(define-read-only (min-market)
  (get min-token-x
    (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v5
      get-min-deposits
    )
  )
)
;; smallest member deposit: a dust guard, not a maths need (shares are never
;; fewer than sats deposited; payouts round down by at most 1 unit)
(define-constant MIN_DEPOSIT u100)

(define-data-var initialized bool false)
(define-constant DEPLOYER tx-sender)
(define-data-var price uint u0)
;; the price as named, in hundredths of a sat per STX (331.50 -> u33150)
(define-data-var sats-per-stx-cents uint u0)
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

(define-read-only (get-price)
  (var-get price)
)

(define-read-only (get-sats-per-stx-cents)
  (var-get sats-per-stx-cents)
)

(define-read-only (get-state)
  {
    price: (var-get price),
    sats-per-stx-cents: (var-get sats-per-stx-cents),
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
      ;; an earlier epoch: sold out, only the proceeds against its final index remain
      {
        shares: (get shares p),
        sbtc: u0,
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

(define-read-only (final-index (e uint))
  (default-to (var-get proceeds-index) (map-get? epoch-final-proceeds e))
)

;; live + parked size of this contract on the market
(define-read-only (market-size)
  (+
    (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v5
      get-token-x-deposit
      (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v5
        get-current-cycle
      )
      current-contract
    )
    (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v5
      get-token-x-parked current-contract
    )
  )
)

;; what the indices say is still unsold
(define-read-only (pooled-sbtc)
  (/ (* (var-get total-shares) (var-get unfilled-index)) SCALE)
)

;; ---------- lifecycle ----------

;; Once, by the deployer: the price in the market unit, then register.
(define-public (initialize (cents uint))
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) ERR_NOT_AUTHORIZED)
    (asserts! (not (var-get initialized)) ERR_ALREADY_INITIALIZED)
    (asserts! (> cents u0) ERR_ZERO_PRICE)
    (asserts! (is-eq (own-name) (expected-name cents)) ERR_BAD_NAME)
    (let ((p (/ PRICE_NUMERATOR cents)))
      (var-set sats-per-stx-cents cents)
      (var-set price p)
      (var-set initialized true)
      (contract-call? LADDER register SIDE cents p)
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
      (local (unwrap-panic (contract-call? SBTC get-balance current-contract)))
      (actual (+ (market-size) local))
      (recorded (pooled-sbtc))
      (stx-now (stx-get-balance current-contract))
      (gained (- stx-now (var-get stx-accounted)))
    )
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (var-set held-sats local)
    (if (is-eq shares u0)
      (begin
        ;; nobody in: nothing to attribute, just keep the STX watermark
        (var-set stx-accounted stx-now)
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
        (var-set stx-accounted stx-now)
        ;; sold out (down to rounding dust): close the epoch, restart the pool.
        ;; Dust still resting rides into the next epoch as a gift.
        (and
          (< new-index SOLD_OUT_INDEX)
          (begin
            (map-set epoch-final-proceeds current-epoch new-proceeds)
            (try! (contract-call? LADDER log-epoch-closed current-epoch new-proceeds))
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

;; Join the rung with `amount` sats. Goes to the market when the pool is at
;; or above the market minimum (pushing along anything held), else waits here.
(define-public (deposit
    (amount uint)
    (update (buff 8192))
  )
  (let (
      (member tx-sender)
      (p (var-get price))
    )
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (asserts! (>= amount MIN_DEPOSIT) ERR_TOO_SMALL)
    (try! (sync))
    (try! (settle-proceeds member))
    (try! (contract-call? SBTC transfer amount member current-contract none))
    (let (
        (to-push (+ amount (var-get held-sats)))
        (shares (/ (* amount SCALE) (var-get unfilled-index)))
        (pos (position-of member))
        (epo (var-get epoch))
      )
      (if (>= to-push (min-market))
        (begin
          (try! (as-contract? ((with-ft SBTC SBTC_NAME to-push))
            (try! (contract-call? MARKET deposit-token-x to-push p update SBTC SBTC_NAME))
          ))
          (var-set held-sats u0)
        )
        (var-set held-sats to-push)
      )
      (map-set positions member {
        epoch: epo,
        shares: (+ (get shares pos) shares),
        paid-index: (var-get proceeds-index),
      })
      (var-set total-shares (+ (var-get total-shares) shares))
      (contract-call? LADDER log-deposit member amount shares epo
        (>= to-push (min-market)) (var-get held-sats)
      )
    )
  )
)

;; Take `amount` of your unsold sats back (and your STX). Comes from what is
;; held here first, then from the market by partial withdrawal; if that would
;; leave the market position under the market minimum the whole position is cancelled
;; and the rest held here for the others.
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
        (shares-out (if (>= amount mine)
          (get shares pos)
          (/ (* amount SCALE) fi)
        ))
        (take (if (>= amount mine)
          mine
          amount
        ))
        (epo (var-get epoch))
      )
      (asserts! (> take u0) ERR_INSUFFICIENT)
      (try! (pull-to-held-sats take))
      (try! (as-contract? ((with-ft SBTC SBTC_NAME take))
        (try! (contract-call? SBTC transfer take current-contract member none))
      ))
      (var-set held-sats (- (var-get held-sats) take))
      (if (is-eq shares-out (get shares pos))
        (map-delete positions member)
        (map-set positions member {
          epoch: epo,
          shares: (- (get shares pos) shares-out),
          paid-index: (var-get proceeds-index),
        })
      )
      (var-set total-shares (- (var-get total-shares) shares-out))
      (contract-call? LADDER log-withdraw member take shares-out epo
        (var-get held-sats)
      )
    )
  )
)

;; STX from fills only; the sBTC keeps resting.
(define-public (claim)
  (begin
    (asserts! (is-some (map-get? positions tx-sender)) ERR_NO_POSITION)
    (try! (sync))
    (contract-call? LADDER log-claim tx-sender (try! (settle-proceeds tx-sender))
      (var-get epoch)
    )
  )
)

;; ---------- private ----------

;; this contract's own name, from its principal
(define-private (own-name)
  (default-to "" (get name (unwrap-panic (principal-destruct? current-contract))))
)

;; "jing-buy-stx-331-50" for u33150: whole sats, dash, two-digit hundredths
(define-private (expected-name (cents uint))
  (let (
      (whole (int-to-ascii (/ cents u100)))
      (frac (mod cents u100))
      (frac-str (if (< frac u10)
        (concat "0" (int-to-ascii frac))
        (int-to-ascii frac)
      ))
    )
    (concat (concat (concat NAME_PREFIX whole) "-") frac-str)
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
        (try! (as-contract? ((with-stx owed))
          (try! (stx-transfer? owed current-contract who))
        ))
      )
      (var-set stx-accounted (- (var-get stx-accounted) owed))
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

;; Make sure `held-sats` covers `amount`: partial-withdraw the gap from the market,
;; or cancel the whole market position when the remainder would sit under
;; the market minimum.
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
