;; jing-sell-stx
;;
;; The mirror of jing-buy-stx: a pooled STX sell (STX resting, the market's y
;; side) at ONE price on markets-sbtc-stx-jing-v6. The contract rests the
;; pooled STX at its price, receives the sBTC fills at settlement, and hands
;; each member their share of both what is still resting and what was sold
;; (jing-sell-stx-320-00 = sell STX once it is at or above 320.00 sats;
;; `initialize` takes u32000 and derives the market unit, 1e18 / 32000). Same
;; accounting as jing-buy-stx with the tokens swapped: shares are micro-STX
;; at unfilled-index SCALE, proceeds are sats per share. Read jing-buy-stx for
;; the design; only the token legs differ here.

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

(define-constant MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6)
(define-constant LADDER 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-ladder)
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant SBTC_NAME "sbtc-token")
(define-constant WSTX 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2)
(define-constant WSTX_NAME "wstx")
(define-constant SIDE "sell-stx")
;; the deploy name must be NAME_PREFIX + the price as named: jing-sell-stx-331-50
(define-constant NAME_PREFIX "jing-sell-stx-")

;; fixed-point precision of the two indices (12 decimals): fine enough that
;; no member's share rounds to nothing, small enough that shares * index *
;; SCALE stays far below uint128
(define-constant SCALE u1000000000000)
;; market price unit is micro-STX per sat times 1e10; from hundredths of a
;; sat per STX: price = 1e6 * 1e10 * 100 / cents = 1e18 / cents
(define-constant PRICE_NUMERATOR u1000000000000000000)
;; the market's own minimum per maker, read live: the operator can raise it
;; (set-min-token-y-deposit) and a stale constant would make the partial
;; withdraw branch call the market with a remainder it rejects (u1004)
;; literal principal on purpose: the node's read-only analysis rejects a
;; contract-call? through a constant here (clarinet accepts it, mainnet does not)
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
      ;; the market's deposit takes a parked position back by itself (a free
      ;; slot, else the smallest maker is bumped when the combined size is
      ;; bigger); if it refuses (queue full, crossing, stale update) the
      ;; funds are held here instead of aborting for every member
      (if (and (>= to-push (min-market)) (is-ok (push-to-market to-push update)))
        (var-set held-ustx u0)
        (var-set held-ustx to-push)
      )
      (map-set positions member {
        epoch: epo,
        shares: (+ (get shares pos) shares),
        paid-index: (var-get proceeds-index),
      })
      (var-set total-shares (+ (var-get total-shares) shares))
      (contract-call? LADDER log-deposit member amount shares epo
        (is-eq (var-get held-ustx) u0) (var-get held-ustx)
      )
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
      (contract-call? LADDER log-withdraw member take shares-out epo
        (var-get held-ustx)
      )
    )
  )
)

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
  (as-contract? ((with-stx to-push))
    (try! (contract-call? MARKET deposit-token-y to-push (var-get price) none update WSTX WSTX_NAME))
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
