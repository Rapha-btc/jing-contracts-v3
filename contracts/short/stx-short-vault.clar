;; stx-short-vault
;;
;; Borrow-to-short STX. One contract, positions in a map (no per-user deploy).
;; A shorter posts USDCx collateral, borrows STX from stx-short-pool, the
;; vault sells the STX for USDCx on Jing (proceeds stay locked here), and later
;; buys the STX back on Jing and repays the pool exactly the STX borrowed. The
;; user decides WHEN to exit; the vault standardizes HOW (FAST / SMOOTH).
;; See contracts/short/README.md for the full design, state machine and flows.
;;
;; Units: STX and USDCx both 6 decimals. Prices in the Jing market unit:
;; micro-USDCx per micro-STX x 1e8 (= USD per STX x 1e8 when USDC = 1).
;; value(stx) = stx * price / 1e8.
;;
;; External bindings (same deployer, relative names, no setter can change them):
;;   .stx-short-pool                    STX lender pool
;;   .stx-short-rate-model              deterministic rate curve
;;   .stx-short-oracle                  Lazer adapter (stx-short-oracle-trait)
;;   .markets-stx-usdcx-jing-v6-4       Jing batch market (x = STX, y = USDCx)
;;   .swap-router-stx-usdcx-jing-v5-5   Jing book + Bitflow DLMM router
;; Every asset that leaves this contract goes through as-contract? with an
;; explicit with-stx / with-ft allowance for that exact amount.

(define-constant ERR_NOT_OWNER (err u5001))
(define-constant ERR_PAUSED (err u5002))
(define-constant ERR_BAD_PARAM (err u5003))
(define-constant ERR_NO_POSITION (err u5004))
(define-constant ERR_NOT_POSITION_OWNER (err u5005))
(define-constant ERR_BAD_STATE (err u5006))
(define-constant ERR_TOO_SMALL (err u5007))
(define-constant ERR_ZERO_COLLATERAL (err u5008))
(define-constant ERR_LEVERAGE (err u5009))
(define-constant ERR_TENOR (err u5010))
(define-constant ERR_MODE (err u5011))
(define-constant ERR_WINDOW (err u5012))
(define-constant ERR_LIMIT_BAND (err u5013))
(define-constant ERR_SLIPPAGE_RAIL (err u5014))
(define-constant ERR_INCREMENT_RAIL (err u5015))
(define-constant ERR_SLOT_BUSY (err u5016))
(define-constant ERR_STEP_TOO_SOON (err u5017))
(define-constant ERR_NOT_LIQUIDATABLE (err u5018))
(define-constant ERR_HEALTH (err u5019))
(define-constant ERR_CAPACITY (err u5020))
(define-constant ERR_EXPIRED (err u5021))
(define-constant ERR_SLIPPAGE (err u5022))
(define-constant ERR_OFFSET_WAIT (err u5024))

(define-constant USDCX 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant USDCX_NAME "usdcx-token")
(define-constant WSTX 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2)
(define-constant WSTX_NAME "wstx")

(define-constant BPS u10000)
(define-constant PRICE_PRECISION u100000000)

;; position states
(define-constant ST_OPENING u1)
(define-constant ST_OPEN u2)
(define-constant ST_CLOSING u3)
(define-constant ST_LIQUIDATING u4)
(define-constant ST_CLOSED u5)
(define-constant ST_CANCELLED u6)
(define-constant ST_LIQUIDATED u7)
;; execution modes / phases
(define-constant MODE_FAST u1)
(define-constant MODE_SMOOTH u2)

;; smallest FAST increment: a chunk never goes under this unless the rest is
;; smaller (keeps the tail of a geometric X%-of-remaining walk finite)
(define-constant MIN_CHUNK u1000000)
;; a position whose USDCx (in hand + resting) is at or under this, with STX
;; still owed, cannot buy any more: the rest is a shortfall for the pool
(define-constant DUST_USDCX u10000)

;; hard ceilings the owner can never cross
(define-constant HARD_MAX_LEV_BPS u30000)
(define-constant HARD_MAX_SLIP_BPS u1000)
(define-constant HARD_MAX_WINDOW u10)
(define-constant HARD_MAX_BAND_BPS u1000)
(define-constant HARD_MIN_TENOR u3600)
(define-constant HARD_MAX_TENOR u2592000)
(define-constant HARD_MIN_LIQ_BPS u10200)
(define-constant HARD_MAX_LIQ_BPS u15000)
(define-constant HARD_MAX_BUFFER_BPS u1000)
(define-constant HARD_MAX_BOUNTY_BPS u300)
(define-constant HARD_MAX_CANCEL_FEE_BPS u5000)
(define-constant HARD_MAX_OFFSET u20)
(define-constant MIN_INCR_BPS u1000)

(define-data-var owner principal tx-sender)
(define-data-var open-paused bool false)
(define-data-var next-id uint u1)

;; ---- rails (owner, bounded) ----
(define-data-var max-lev-bps uint u30000)
(define-data-var min-stx uint u10000000) ;; 10 STX
(define-data-var default-tenor uint u259200) ;; 3 days, seconds
(define-data-var min-tenor uint u3600)
(define-data-var max-tenor uint u2592000)
(define-data-var default-slip-bps uint u100)
(define-data-var max-slip-bps uint u300)
(define-data-var default-incr-bps uint u2500)
(define-data-var default-window uint u3)
(define-data-var max-window uint u6)
(define-data-var band-bps uint u200)
(define-data-var batch-secs uint u600)
(define-data-var exec-window-secs uint u1800)
(define-data-var close-grace-secs uint u3600)
;; ---- risk / liquidation (owner, bounded) ----
(define-data-var liq-threshold-bps uint u11000)
(define-data-var extend-min-health-bps uint u12000)
(define-data-var buffer-bps uint u200)
(define-data-var liq-slip-bps uint u300)
(define-data-var liq-incr-bps uint u3400)
(define-data-var liq-max-offset uint u3)
(define-data-var liq-bounty-bps uint u50)
(define-data-var cancel-fee-bps uint u1000)

;; ---- the one SMOOTH slot (see README: one resting order per principal) ----
(define-data-var slot-pos (optional uint) none)
(define-data-var slot-sell bool true)
;; what this contract believes it holds: every move we make updates these, so
;; balance - booked = what the market pushed to us (the slot's fills/refunds)
(define-data-var stx-booked uint u0)
(define-data-var usdc-booked uint u0)

(define-map positions
  uint
  {
    owner: principal,
    state: uint,
    phase: uint,
    debt: uint,
    borrowed: uint,
    stx: uint,
    stx-mkt: uint,
    usdc: uint,
    usdc-mkt: uint,
    collateral: uint,
    interest: uint,
    interest-paid: uint,
    rate-bps: uint,
    lev-bps: uint,
    opened-at: uint,
    deadline: uint,
    window: uint,
    limit: uint,
    slip-bps: uint,
    incr-bps: uint,
    smooth-end-cycle: uint,
    smooth-end-time: uint,
    exec-end: uint,
    last-step: uint,
    liq-height: uint,
    liq-keeper: (optional principal),
    sold: uint,
    proceeds: uint,
    bought: uint,
    spent: uint,
  }
)

;; ---------- small helpers ----------

(define-private (min-u
    (a uint)
    (b uint)
  )
  (if (< a b)
    a
    b
  )
)

(define-private (max-u
    (a uint)
    (b uint)
  )
  (if (> a b)
    a
    b
  )
)

(define-private (sub0
    (a uint)
    (b uint)
  )
  (if (> a b)
    (- a b)
    u0
  )
)

(define-private (ceil-div
    (a uint)
    (b uint)
  )
  (if (is-eq a u0)
    u0
    (+ (/ (- a u1) b) u1)
  )
)

(define-private (value-of
    (stx uint)
    (price uint)
  )
  (/ (* stx price) PRICE_PRECISION)
)

(define-private (usdcx-balance)
  (unwrap-panic (contract-call? 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx get-balance
    current-contract
  ))
)

(define-private (oracle-price (update (buff 8192)))
  (ok (get price (try! (contract-call? .stx-short-oracle get-price update))))
)

;; ---------- read-only ----------

(define-read-only (get-position (id uint))
  (map-get? positions id)
)

(define-read-only (get-slot)
  {
    pos: (var-get slot-pos),
    sell: (var-get slot-sell),
    stx-booked: (var-get stx-booked),
    usdc-booked: (var-get usdc-booked),
  }
)

(define-read-only (get-next-id)
  (var-get next-id)
)

(define-read-only (get-params)
  {
    owner: (var-get owner),
    open-paused: (var-get open-paused),
    max-lev-bps: (var-get max-lev-bps),
    min-stx: (var-get min-stx),
    default-tenor: (var-get default-tenor),
    min-tenor: (var-get min-tenor),
    max-tenor: (var-get max-tenor),
    default-slip-bps: (var-get default-slip-bps),
    max-slip-bps: (var-get max-slip-bps),
    default-incr-bps: (var-get default-incr-bps),
    default-window: (var-get default-window),
    max-window: (var-get max-window),
    band-bps: (var-get band-bps),
    batch-secs: (var-get batch-secs),
    exec-window-secs: (var-get exec-window-secs),
    close-grace-secs: (var-get close-grace-secs),
    liq-threshold-bps: (var-get liq-threshold-bps),
    extend-min-health-bps: (var-get extend-min-health-bps),
    buffer-bps: (var-get buffer-bps),
    liq-slip-bps: (var-get liq-slip-bps),
    liq-incr-bps: (var-get liq-incr-bps),
    liq-max-offset: (var-get liq-max-offset),
    liq-bounty-bps: (var-get liq-bounty-bps),
    cancel-fee-bps: (var-get cancel-fee-bps),
  }
)

;; USDCx the position owns, in hand + resting on the market
(define-read-only (assets-of
    (p {
      owner: principal,
      state: uint,
      phase: uint,
      debt: uint,
      borrowed: uint,
      stx: uint,
      stx-mkt: uint,
      usdc: uint,
      usdc-mkt: uint,
      collateral: uint,
      interest: uint,
      interest-paid: uint,
      rate-bps: uint,
      lev-bps: uint,
      opened-at: uint,
      deadline: uint,
      window: uint,
      limit: uint,
      slip-bps: uint,
      incr-bps: uint,
      smooth-end-cycle: uint,
      smooth-end-time: uint,
      exec-end: uint,
      last-step: uint,
      liq-height: uint,
      liq-keeper: (optional principal),
      sold: uint,
      proceeds: uint,
      bought: uint,
      spent: uint,
    })
    (price uint)
  )
  (+ (get usdc p) (get usdc-mkt p)
    (value-of (+ (get stx p) (get stx-mkt p)) price)
  )
)

;; health in bps: (collateral + proceeds + STX held at oracle) /
;; (STX owed x price x (1 + buffer)). Held interest (OPENING) is not counted.
(define-read-only (health-at
    (id uint)
    (price uint)
  )
  (match (map-get? positions id)
    p (let (
        (liab (* (* (get debt p) price) (+ BPS (var-get buffer-bps))))
        (assets (assets-of p price))
      )
      (if (is-eq liab u0)
        u340282366920938463463374607431768211455
        (/ (* (* assets BPS) (* PRICE_PRECISION BPS)) liab)
      )
    )
    u0
  )
)

(define-read-only (is-liquidatable-at
    (id uint)
    (price uint)
  )
  (match (map-get? positions id)
    p (let ((st (get state p)))
      (and
        (or (is-eq st ST_OPEN) (is-eq st ST_CLOSING))
        (or
          (< (health-at id price) (var-get liq-threshold-bps))
          (and (is-eq st ST_OPEN) (> stacks-block-time (get deadline p)))
          (and
            (is-eq st ST_CLOSING)
            (> stacks-block-time (+ (get deadline p) (var-get close-grace-secs)))
          )
        )
      )
    )
    false
  )
)

;; the unpredictable start offset of a liquidation, in blocks. Derived from
;; the id-header-hash of the trigger block itself, which nobody but that
;; block's miner knows when the trigger transaction is sent.
(define-read-only (liq-offset (liq-height uint))
  (match (get-stacks-block-info? id-header-hash liq-height)
    h (mod
      (buff-to-uint-be (unwrap-panic (as-max-len? (unwrap-panic (slice? h u0 u16)) u16)))
      (+ (var-get liq-max-offset) u1)
    )
    u0
  )
)

;; ---------- market position of this contract ----------

(define-private (on-market-x)
  (+
    (contract-call? .markets-stx-usdcx-jing-v6-4 get-token-x-deposit
      (contract-call? .markets-stx-usdcx-jing-v6-4 get-current-cycle)
      current-contract
    )
    (contract-call? .markets-stx-usdcx-jing-v6-4 get-token-x-parked
      current-contract
    )
    (default-to u0
      (get amount
        (contract-call? .markets-stx-usdcx-jing-v6-4 get-token-x-pending-deposit
          current-contract
        ))
    ))
)

(define-private (on-market-y)
  (+
    (contract-call? .markets-stx-usdcx-jing-v6-4 get-token-y-deposit
      (contract-call? .markets-stx-usdcx-jing-v6-4 get-current-cycle)
      current-contract
    )
    (contract-call? .markets-stx-usdcx-jing-v6-4 get-token-y-parked
      current-contract
    )
    (default-to u0
      (get amount
        (contract-call? .markets-stx-usdcx-jing-v6-4 get-token-y-pending-deposit
          current-contract
        ))
    ))
)

;; Fold whatever the market pushed to this contract since the last sync into
;; the slot owner's position: fills (proceeds) and refunds (unfilled part
;; sent back). Releases the slot when nothing rests any more.
(define-private (sync-slot)
  (match (var-get slot-pos)
    id (let (
        (p (unwrap-panic (map-get? positions id)))
        (sell (var-get slot-sell))
        (onm (if sell
          (on-market-x)
          (on-market-y)
        ))
        (gs (sub0 (stx-get-balance current-contract) (var-get stx-booked)))
        (gu (sub0 (usdcx-balance) (var-get usdc-booked)))
      )
      (var-set stx-booked (+ (var-get stx-booked) gs))
      (var-set usdc-booked (+ (var-get usdc-booked) gu))
      (map-set positions id
        (if sell
          (merge p {
            stx-mkt: onm,
            stx: (+ (get stx p) gs),
            usdc: (+ (get usdc p) gu),
            sold: (+ (get sold p) (sub0 (sub0 (get stx-mkt p) onm) gs)),
            proceeds: (+ (get proceeds p) gu),
          })
          (merge p {
            usdc-mkt: onm,
            usdc: (+ (get usdc p) gu),
            stx: (+ (get stx p) gs),
            spent: (+ (get spent p) (sub0 (sub0 (get usdc-mkt p) onm) gu)),
            bought: (+ (get bought p) gs),
          })
        ))
      (if (is-eq onm u0)
        (var-set slot-pos none)
        true
      )
      (print {
        topic: "short-slot-sync",
        id: id,
        sell: sell,
        on-market: onm,
        stx-in: gs,
        usdc-in: gu,
      })
      true
    )
    true
  )
)

;; take a resting order off the market; the refund is folded in by sync-slot
(define-private (pull-slot (id uint))
  (if (is-eq (var-get slot-pos) (some id))
    (begin
      (if (var-get slot-sell)
        (if (> (on-market-x) u0)
          (begin
            (try! (as-contract? ()
              (try! (contract-call? .markets-stx-usdcx-jing-v6-4 cancel-token-x-deposit
                WSTX WSTX_NAME
              ))
            ))
            true
          )
          true
        )
        (if (> (on-market-y) u0)
          (begin
            (try! (as-contract? ()
              (try! (contract-call? .markets-stx-usdcx-jing-v6-4 cancel-token-y-deposit
                USDCX USDCX_NAME
              ))
            ))
            true
          )
          true
        )
      )
      (sync-slot)
      (var-set slot-pos none)
      (ok true)
    )
    (ok true)
  )
)

;; A pending (escrowed) deposit on the market needs a Lazer update to settle;
;; anyone may do it, the step does it when it holds the slot. Failure is fine.
(define-private (settle-slot-pending (update (buff 8192)))
  (if (var-get slot-sell)
    (if (is-some (contract-call? .markets-stx-usdcx-jing-v6-4 get-token-x-pending-deposit
        current-contract
      ))
      (is-ok (contract-call? .markets-stx-usdcx-jing-v6-4 settle-token-x-deposit
        current-contract update WSTX WSTX_NAME
      ))
      true
    )
    (if (is-some (contract-call? .markets-stx-usdcx-jing-v6-4 get-token-y-pending-deposit
        current-contract
      ))
      (is-ok (contract-call? .markets-stx-usdcx-jing-v6-4 settle-token-y-deposit
        current-contract update USDCX USDCX_NAME
      ))
      true
    )
  )
)

;; ---------- router legs ----------

(define-private (zero-swap (amount uint))
  {
    jing-ok: false,
    jing-in: u0,
    jing-out: u0,
    dlmm-in: u0,
    dlmm-out: u0,
    xyk-in: u0,
    xyk-out: u0,
    velar-in: u0,
    velar-out: u0,
    unsold: amount,
    out: u0,
  }
)

(define-private (swap-in (r {
  jing-ok: bool,
  jing-in: uint,
  jing-out: uint,
  dlmm-in: uint,
  dlmm-out: uint,
  xyk-in: uint,
  xyk-out: uint,
  velar-in: uint,
  velar-out: uint,
  unsold: uint,
  out: uint,
}))
  (+ (get jing-in r) (get dlmm-in r) (get xyk-in r) (get velar-in r))
)

;; Sell up to `chunk` STX for USDCx, never under `limit`. A router refusal is
;; zero progress, not a failure (the keeper tries again next block).
(define-private (fast-sell
    (chunk uint)
    (limit uint)
    (mid uint)
    (update (buff 8192))
  )
  (let ((r (try! (as-contract? ((with-stx chunk))
      (match (contract-call? .swap-router-stx-usdcx-jing-v5-5 smart-swap-stx-for-usdcx
        chunk limit (some update) mid u0
      )
        ok-r ok-r
        e (zero-swap chunk)
      )))))
    (let (
        (in (swap-in r))
        (out (get out r))
      )
      (asserts! (<= in chunk) ERR_SLIPPAGE)
      (asserts! (>= (* out PRICE_PRECISION) (* in limit)) ERR_SLIPPAGE)
      (ok {
        in: in,
        out: out,
      })
    )
  )
)

;; Spend up to `budget` USDCx on STX, never above `limit`.
(define-private (fast-buy
    (budget uint)
    (limit uint)
    (mid uint)
    (update (buff 8192))
  )
  (let ((r (try! (as-contract? ((with-ft USDCX USDCX_NAME budget))
      (match (contract-call? .swap-router-stx-usdcx-jing-v5-5 smart-swap-usdcx-for-stx
        budget limit (some update) mid u0
      )
        ok-r ok-r
        e (zero-swap budget)
      )))))
    (let (
        (in (swap-in r))
        (out (get out r))
      )
      (asserts! (<= in budget) ERR_SLIPPAGE)
      (asserts! (<= (* in PRICE_PRECISION) (* out limit)) ERR_SLIPPAGE)
      (ok {
        in: in,
        out: out,
      })
    )
  )
)

;; ---------- execution increments ----------

(define-private (sell-increment
    (id uint)
    (price uint)
    (update (buff 8192))
  )
  (let (
      (p (unwrap-panic (map-get? positions id)))
      (avail (get stx p))
      (chunk (min-u avail (max-u (/ (* avail (get incr-bps p)) BPS) MIN_CHUNK)))
      (limit (/ (* price (- BPS (get slip-bps p))) BPS))
    )
    (if (is-eq chunk u0)
      (ok u0)
      (let ((r (try! (fast-sell chunk limit price update))))
        (var-set stx-booked (- (var-get stx-booked) (get in r)))
        (var-set usdc-booked (+ (var-get usdc-booked) (get out r)))
        (map-set positions id
          (merge p {
            stx: (- avail (get in r)),
            usdc: (+ (get usdc p) (get out r)),
            sold: (+ (get sold p) (get in r)),
            proceeds: (+ (get proceeds p) (get out r)),
            last-step: stacks-block-height,
          })
        )
        (print {
          topic: "short-sell",
          id: id,
          in: (get in r),
          out: (get out r),
          limit: limit,
          mid: price,
        })
        (ok (get in r))
      )
    )
  )
)

(define-private (buy-increment
    (id uint)
    (price uint)
    (update (buff 8192))
    (slip uint)
    (incr uint)
  )
  (let (
      (p (unwrap-panic (map-get? positions id)))
      (need (sub0 (get debt p) (get stx p)))
      (target (min-u need (max-u (/ (* need incr) BPS) MIN_CHUNK)))
      (limit (/ (* price (+ BPS slip)) BPS))
      ;; budget at the worst allowed price: a full fill buys >= target, the
      ;; overshoot (<= slip of the last chunk) goes back to the user as STX
      (budget (min-u (get usdc p) (ceil-div (* target limit) PRICE_PRECISION)))
    )
    (if (or (is-eq target u0) (is-eq budget u0))
      (ok u0)
      (let ((r (try! (fast-buy budget limit price update))))
        (var-set usdc-booked (- (var-get usdc-booked) (get in r)))
        (var-set stx-booked (+ (var-get stx-booked) (get out r)))
        (map-set positions id
          (merge p {
            usdc: (- (get usdc p) (get in r)),
            stx: (+ (get stx p) (get out r)),
            spent: (+ (get spent p) (get in r)),
            bought: (+ (get bought p) (get out r)),
            last-step: stacks-block-height,
          })
        )
        (print {
          topic: "short-buy",
          id: id,
          in: (get in r),
          out: (get out r),
          limit: limit,
          mid: price,
        })
        (ok (get out r))
      )
    )
  )
)

;; ---------- pool / user transfers ----------

(define-private (forward-interest (amount uint))
  (if (> amount u0)
    (begin
      (var-set usdc-booked (- (var-get usdc-booked) amount))
      (try! (as-contract? ((with-ft USDCX USDCX_NAME amount))
        (try! (contract-call? .stx-short-pool add-interest amount))
      ))
      (ok true)
    )
    (ok true)
  )
)

(define-private (repay-pool
    (principal-amount uint)
    (amount uint)
  )
  (begin
    (var-set stx-booked (- (var-get stx-booked) amount))
    (try! (as-contract? ((with-stx amount))
      (try! (contract-call? .stx-short-pool repay principal-amount amount))
    ))
    (ok true)
  )
)

(define-private (pay-usdc
    (to principal)
    (amount uint)
  )
  (if (> amount u0)
    (begin
      (var-set usdc-booked (- (var-get usdc-booked) amount))
      (try! (as-contract? ((with-ft USDCX USDCX_NAME amount))
        (try! (contract-call? USDCX transfer amount current-contract to none))
      ))
      (ok true)
    )
    (ok true)
  )
)

(define-private (pay-stx
    (to principal)
    (amount uint)
  )
  (if (> amount u0)
    (begin
      (var-set stx-booked (- (var-get stx-booked) amount))
      (try! (as-contract? ((with-stx amount))
        (try! (stx-transfer? amount current-contract to))
      ))
      (ok true)
    )
    (ok true)
  )
)

;; ---------- rails ----------

(define-private (check-exec
    (mode uint)
    (window (optional uint))
    (limit (optional uint))
    (slip (optional uint))
    (incr (optional uint))
    (price uint)
  )
  (let (
      (w (default-to (var-get default-window) window))
      (l (default-to price limit))
      (s (default-to (var-get default-slip-bps) slip))
      (i (default-to (var-get default-incr-bps) incr))
      (dist (if (> l price)
        (- l price)
        (- price l)
      ))
    )
    (asserts! (or (is-eq mode MODE_FAST) (is-eq mode MODE_SMOOTH)) ERR_MODE)
    (asserts! (and (>= w u1) (<= w (var-get max-window))) ERR_WINDOW)
    (asserts! (<= (* dist BPS) (* price (var-get band-bps))) ERR_LIMIT_BAND)
    (asserts! (and (> s u0) (<= s (var-get max-slip-bps))) ERR_SLIPPAGE_RAIL)
    (asserts! (and (>= i MIN_INCR_BPS) (<= i BPS)) ERR_INCREMENT_RAIL)
    (ok {
      window: w,
      limit: l,
      slip: s,
      incr: i,
    })
  )
)

;; ---------- open ----------

;; Borrow `stx-amount` STX against `collateral` USDCx for `tenor` seconds
;; (default 3 days) and sell it under `mode`. Interest is paid upfront in
;; USDCx on top of the collateral and locked at this rate for the tenor.
(define-public (open
    (stx-amount uint)
    (collateral uint)
    (tenor (optional uint))
    (mode uint)
    (window (optional uint))
    (limit (optional uint))
    (slip (optional uint))
    (incr (optional uint))
    (update (buff 8192))
  )
  (let (
      (user tx-sender)
      (id (var-get next-id))
      (price (try! (oracle-price update)))
      (t (default-to (var-get default-tenor) tenor))
      (ex (try! (check-exec mode window limit slip incr price)))
      (notional (value-of stx-amount price))
      (lev (if (is-eq collateral u0)
        u0
        (/ (* notional BPS) collateral)
      ))
      (util (contract-call? .stx-short-pool utilization-after stx-amount))
      (rate (contract-call? .stx-short-rate-model get-rate-bps util lev))
      (interest (contract-call? .stx-short-rate-model quote-interest notional rate t))
    )
    (asserts! (not (var-get open-paused)) ERR_PAUSED)
    (asserts! (>= stx-amount (var-get min-stx)) ERR_TOO_SMALL)
    (asserts! (> collateral u0) ERR_ZERO_COLLATERAL)
    (asserts! (and (> notional u0) (<= lev (var-get max-lev-bps))) ERR_LEVERAGE)
    (asserts! (and (>= t (var-get min-tenor)) (<= t (var-get max-tenor)))
      ERR_TENOR
    )
    (asserts! (or (is-eq mode MODE_FAST) (is-none (var-get slot-pos)))
      ERR_SLOT_BUSY
    )
    ;; collateral + upfront interest in; interest is held until the opening
    ;; sale completes (refundable on a non-fill)
    (try! (contract-call? USDCX transfer (+ collateral interest) user current-contract
      none
    ))
    (var-set usdc-booked (+ (var-get usdc-booked) collateral interest))
    (try! (contract-call? .stx-short-pool borrow stx-amount))
    (var-set stx-booked (+ (var-get stx-booked) stx-amount))
    (var-set next-id (+ id u1))
    (map-set positions id {
      owner: user,
      state: ST_OPENING,
      phase: mode,
      debt: stx-amount,
      borrowed: stx-amount,
      stx: stx-amount,
      stx-mkt: u0,
      usdc: collateral,
      usdc-mkt: u0,
      collateral: collateral,
      interest: interest,
      interest-paid: u0,
      rate-bps: rate,
      lev-bps: lev,
      opened-at: stacks-block-time,
      deadline: (+ stacks-block-time t),
      window: (get window ex),
      limit: (get limit ex),
      slip-bps: (get slip ex),
      incr-bps: (get incr ex),
      smooth-end-cycle: u0,
      smooth-end-time: u0,
      exec-end: (+ stacks-block-time (var-get exec-window-secs)),
      last-step: u0,
      liq-height: u0,
      liq-keeper: none,
      sold: u0,
      proceeds: u0,
      bought: u0,
      spent: u0,
    })
    (print {
      topic: "short-open",
      id: id,
      owner: user,
      stx: stx-amount,
      collateral: collateral,
      interest: interest,
      rate-bps: rate,
      lev-bps: lev,
      util-bps: util,
      tenor: t,
      mode: mode,
      mid: price,
    })
    (if (is-eq mode MODE_SMOOTH)
      (try! (start-smooth id true price update))
      (begin
        (try! (sell-increment id price update))
        true
      )
    )
    (try! (settle-progress id price))
    (ok id)
  )
)

;; Rest the position's order on the Jing batch market (sell STX on open,
;; buy STX on close). A market refusal (under its minimum, paused, ...)
;; falls back to FAST in the same transaction.
(define-private (start-smooth
    (id uint)
    (sell bool)
    (price uint)
    (update (buff 8192))
  )
  (let (
      (p (unwrap-panic (map-get? positions id)))
      (cycle (contract-call? .markets-stx-usdcx-jing-v6-4 get-current-cycle))
      (amount (if sell
        (get stx p)
        (min-u (get usdc p)
          (ceil-div (* (sub0 (get debt p) (get stx p)) (get limit p))
            PRICE_PRECISION
          ))
      ))
      (rested (if sell
        (match (as-contract? ((with-stx amount))
          (is-ok (contract-call? .markets-stx-usdcx-jing-v6-4 deposit-token-x amount
            (get limit p) none WSTX WSTX_NAME
          ))
        )
          v v
          e false
        )
        (match (as-contract? ((with-ft USDCX USDCX_NAME amount))
          (is-ok (contract-call? .markets-stx-usdcx-jing-v6-4 deposit-token-y amount
            (get limit p) none USDCX USDCX_NAME
          ))
        )
          v v
          e false
        )
      ))
    )
    (if (and (> amount u0) rested)
      (begin
        (if sell
          (begin
            (var-set stx-booked (- (var-get stx-booked) amount))
            (map-set positions id
              (merge p {
                stx: (- (get stx p) amount),
                stx-mkt: amount,
                phase: MODE_SMOOTH,
                smooth-end-cycle: (+ cycle (get window p)),
                smooth-end-time: (+ stacks-block-time (* (get window p) (var-get batch-secs))),
                last-step: stacks-block-height,
              })
            )
          )
          (begin
            (var-set usdc-booked (- (var-get usdc-booked) amount))
            (map-set positions id
              (merge p {
                usdc: (- (get usdc p) amount),
                usdc-mkt: amount,
                phase: MODE_SMOOTH,
                smooth-end-cycle: (+ cycle (get window p)),
                smooth-end-time: (+ stacks-block-time (* (get window p) (var-get batch-secs))),
                last-step: stacks-block-height,
              })
            )
          )
        )
        (var-set slot-pos (some id))
        (var-set slot-sell sell)
        (print {
          topic: "short-smooth-rest",
          id: id,
          sell: sell,
          amount: amount,
          limit: (get limit p),
          end-cycle: (+ cycle (get window p)),
        })
        (ok true)
      )
      ;; FAST fallback
      (begin
        (map-set positions id
          (merge p {
            phase: MODE_FAST,
            exec-end: (+ stacks-block-time (var-get exec-window-secs)),
          })
        )
        (if sell
          (try! (sell-increment id price update))
          (try! (buy-increment id price update (get slip-bps p) (get incr-bps p)))
        )
        (ok false)
      )
    )
  )
)

;; ---------- terminal transitions ----------

;; Called after every trade: moves the position to its next state when its
;; current leg is done (or out of time / out of USDCx).
(define-private (settle-progress
    (id uint)
    (price uint)
  )
  (let (
      (p (unwrap-panic (map-get? positions id)))
      (st (get state p))
    )
    (if (is-eq st ST_OPENING)
      (if (and (is-eq (get stx p) u0) (is-eq (get stx-mkt p) u0))
        (finish-open id)
        (if (and
            (is-eq (get phase p) MODE_FAST)
            (is-eq (get stx-mkt p) u0)
            (>= stacks-block-time (get exec-end p))
          )
          (trim-open id)
          (ok true)
        )
      )
      (if (or (is-eq st ST_CLOSING) (is-eq st ST_LIQUIDATING))
        (if (and (>= (get stx p) (get debt p)) (is-eq (get usdc-mkt p) u0))
          (finish-close id price)
          (if (and
              (is-eq (get usdc-mkt p) u0)
              (<= (get usdc p) DUST_USDCX)
            )
            (finish-shortfall id)
            (ok true)
          )
        )
        (ok true)
      )
    )
  )
)

(define-private (finish-open (id uint))
  (let ((p (unwrap-panic (map-get? positions id))))
    (try! (forward-interest (get interest p)))
    (map-set positions id
      (merge p {
        state: ST_OPEN,
        interest: u0,
        interest-paid: (+ (get interest-paid p) (get interest p)),
      })
    )
    (print {
      topic: "short-opened",
      id: id,
      sold: (get sold p),
      proceeds: (get proceeds p),
    })
    (ok true)
  )
)

;; The opening sale ran out of time with STX unsold. Unsold STX goes back to
;; the pool; the interest on it is refunded minus cancel-fee-bps. Nothing
;; sold at all = cancel: collateral back too.
(define-private (trim-open (id uint))
  (let (
      (p (unwrap-panic (map-get? positions id)))
      (unsold (get stx p))
      (interest (get interest p))
      (on-unsold (/ (* interest unsold) (get borrowed p)))
      (refund (/ (* on-unsold (- BPS (var-get cancel-fee-bps))) BPS))
      (kept (- interest refund))
      (new-debt (- (get debt p) unsold))
    )
    (try! (repay-pool unsold unsold))
    (try! (pay-usdc (get owner p) refund))
    (try! (forward-interest kept))
    (if (is-eq new-debt u0)
      (begin
        (try! (pay-usdc (get owner p) (get usdc p)))
        (map-set positions id
          (merge p {
            state: ST_CANCELLED,
            stx: u0,
            debt: u0,
            usdc: u0,
            interest: u0,
            interest-paid: (+ (get interest-paid p) kept),
          })
        )
        (print {
          topic: "short-cancelled",
          id: id,
          returned: unsold,
          interest-refund: refund,
          fee: kept,
        })
        (ok true)
      )
      (begin
        (map-set positions id
          (merge p {
            state: ST_OPEN,
            stx: u0,
            debt: new-debt,
            interest: u0,
            interest-paid: (+ (get interest-paid p) kept),
          })
        )
        (print {
          topic: "short-trimmed",
          id: id,
          returned: unsold,
          debt: new-debt,
          interest-refund: refund,
        })
        (ok true)
      )
    )
  )
)

;; STX owed is in hand: repay the pool exactly the debt, then pay out. A
;; liquidation pays the keeper bounty first out of the user's USDCx (junior to
;; the lenders: the pool was repaid in full already).
(define-private (finish-close
    (id uint)
    (price uint)
  )
  (let (
      (p (unwrap-panic (map-get? positions id)))
      (liq (is-eq (get state p) ST_LIQUIDATING))
      (bounty (if liq
        (min-u (get usdc p)
          (/ (* (value-of (get debt p) price) (var-get liq-bounty-bps)) BPS)
        )
        u0
      ))
      (extra-stx (- (get stx p) (get debt p)))
      (rest (- (get usdc p) bounty))
    )
    (try! (repay-pool (get debt p) (get debt p)))
    (match (get liq-keeper p)
      k (try! (pay-usdc k bounty))
      true
    )
    (try! (pay-usdc (get owner p) rest))
    (try! (pay-stx (get owner p) extra-stx))
    (map-set positions id
      (merge p {
        state: (if liq
          ST_LIQUIDATED
          ST_CLOSED
        ),
        stx: u0,
        usdc: u0,
      })
    )
    (print {
      topic: (if liq
        "short-liquidated"
        "short-closed"
      ),
      id: id,
      repaid: (get debt p),
      bounty: bounty,
      usdc-out: rest,
      stx-out: extra-stx,
      shortfall: u0,
    })
    (ok true)
  )
)

;; USDCx exhausted with STX still owed: everything bought goes to the pool,
;; the rest of the debt is the lenders' loss. No bounty, nothing to the user.
(define-private (finish-shortfall (id uint))
  (let (
      (p (unwrap-panic (map-get? positions id)))
      (repaid (get stx p))
      (dust (get usdc p))
    )
    (try! (repay-pool (get debt p) repaid))
    ;; dust USDCx left (<= DUST_USDCX) goes to the lenders as interest
    (if (> dust u0)
      (try! (forward-interest dust))
      true
    )
    (map-set positions id
      (merge p {
        state: ST_LIQUIDATED,
        stx: u0,
        usdc: u0,
      })
    )
    (print {
      topic: "short-shortfall",
      id: id,
      debt: (get debt p),
      repaid: repaid,
      shortfall: (- (get debt p) repaid),
    })
    (ok true)
  )
)

;; ---------- step (permissionless keeper entry) ----------

;; Advance a position in OPENING / CLOSING / LIQUIDATING by one move:
;;   SMOOTH phase: fold in fills; when the window (cycles or time) is over,
;;                 pull the rest off the market and switch to FAST.
;;   FAST phase:   one increment per block (X% of what is left, at most
;;                 slip-bps off the oracle mid). Liquidations use the
;;                 protocol presets and wait out the unpredictable offset.
(define-public (step
    (id uint)
    (update (buff 8192))
  )
  (let (
      (p0 (unwrap! (map-get? positions id) ERR_NO_POSITION))
      (st (get state p0))
      (price (try! (oracle-price update)))
    )
    (asserts!
      (or
        (is-eq st ST_OPENING)
        (is-eq st ST_CLOSING)
        (is-eq st ST_LIQUIDATING)
      )
      ERR_BAD_STATE
    )
    (sync-slot)
    (let ((p (unwrap-panic (map-get? positions id))))
      (if (is-eq (get phase p) MODE_SMOOTH)
        (try! (step-smooth id price update))
        (try! (step-fast id price update))
      )
    )
    (sync-slot)
    (try! (settle-progress id price))
    (ok (unwrap-panic (map-get? positions id)))
  )
)

(define-private (step-smooth
    (id uint)
    (price uint)
    (update (buff 8192))
  )
  (let (
      (p (unwrap-panic (map-get? positions id)))
      (sell (is-eq (get state p) ST_OPENING))
      (resting (if sell
        (get stx-mkt p)
        (get usdc-mkt p)
      ))
      (over (or
        (>= (contract-call? .markets-stx-usdcx-jing-v6-4 get-current-cycle)
          (get smooth-end-cycle p)
        )
        (>= stacks-block-time (get smooth-end-time p))
      ))
    )
    (if (and (> resting u0) (not over))
      (begin
        (settle-slot-pending update)
        (ok true)
      )
      (begin
        (try! (pull-slot id))
        (map-set positions id
          (merge (unwrap-panic (map-get? positions id)) {
            phase: MODE_FAST,
            exec-end: (+ stacks-block-time (var-get exec-window-secs)),
          })
        )
        (print {
          topic: "short-smooth-done",
          id: id,
          sell: sell,
        })
        (step-fast id price update)
      )
    )
  )
)

(define-private (step-fast
    (id uint)
    (price uint)
    (update (buff 8192))
  )
  (let (
      (p (unwrap-panic (map-get? positions id)))
      (st (get state p))
    )
    (asserts! (< (get last-step p) stacks-block-height) ERR_STEP_TOO_SOON)
    (if (is-eq st ST_OPENING)
      (begin
        (try! (sell-increment id price update))
        (ok true)
      )
      (if (is-eq st ST_LIQUIDATING)
        (begin
          (asserts!
            (>= stacks-block-height
              (+ (get liq-height p) u1 (liq-offset (get liq-height p)))
            )
            ERR_OFFSET_WAIT
          )
          (try! (buy-increment id price update (var-get liq-slip-bps)
            (var-get liq-incr-bps)
          ))
          (ok true)
        )
        (begin
          (try! (buy-increment id price update (get slip-bps p) (get incr-bps p)))
          (ok true)
        )
      )
    )
  )
)

;; ---------- close / extend / add-collateral ----------

(define-public (close
    (id uint)
    (mode uint)
    (window (optional uint))
    (limit (optional uint))
    (slip (optional uint))
    (incr (optional uint))
    (update (buff 8192))
  )
  (let (
      (p (unwrap! (map-get? positions id) ERR_NO_POSITION))
      (price (try! (oracle-price update)))
      (ex (try! (check-exec mode window limit slip incr price)))
    )
    (asserts! (is-eq tx-sender (get owner p)) ERR_NOT_POSITION_OWNER)
    (asserts! (is-eq (get state p) ST_OPEN) ERR_BAD_STATE)
    (asserts! (or (is-eq mode MODE_FAST) (is-none (var-get slot-pos)))
      ERR_SLOT_BUSY
    )
    (sync-slot)
    (map-set positions id
      (merge p {
        state: ST_CLOSING,
        phase: mode,
        window: (get window ex),
        limit: (get limit ex),
        slip-bps: (get slip ex),
        incr-bps: (get incr ex),
        last-step: u0,
      })
    )
    (print {
      topic: "short-close",
      id: id,
      mode: mode,
      mid: price,
    })
    (if (is-eq mode MODE_SMOOTH)
      (try! (start-smooth id false price update))
      (begin
        (try! (buy-increment id price update (get slip ex) (get incr ex)))
        true
      )
    )
    (sync-slot)
    (try! (settle-progress id price))
    (ok true)
  )
)

;; Pay another tenor of interest upfront at the CURRENT rate. Accepted when
;; the pool is within its utilization cap and the position's health and
;; leverage pass the open rails.
(define-public (extend
    (id uint)
    (tenor (optional uint))
    (update (buff 8192))
  )
  (let (
      (p (unwrap! (map-get? positions id) ERR_NO_POSITION))
      (price (try! (oracle-price update)))
      (t (default-to (var-get default-tenor) tenor))
      (debt-val (value-of (get debt p) price))
      (equity (sub0 (assets-of p price) debt-val))
      (lev (if (is-eq equity u0)
        u340282366920938463463374607431768211455
        (/ (* debt-val BPS) equity)
      ))
      (pool (contract-call? .stx-short-pool get-pool))
      (util (contract-call? .stx-short-pool utilization-bps))
      (rate (contract-call? .stx-short-rate-model get-rate-bps util lev))
      (interest (contract-call? .stx-short-rate-model quote-interest debt-val rate t))
      (new-deadline (+ (get deadline p) t))
    )
    (asserts! (not (var-get open-paused)) ERR_PAUSED)
    (asserts! (is-eq tx-sender (get owner p)) ERR_NOT_POSITION_OWNER)
    (asserts! (is-eq (get state p) ST_OPEN) ERR_BAD_STATE)
    (asserts! (<= stacks-block-time (get deadline p)) ERR_EXPIRED)
    (asserts! (and (>= t (var-get min-tenor)) (<= t (var-get max-tenor)))
      ERR_TENOR
    )
    ;; the whole remaining life of the loan stays within one max tenor
    (asserts! (<= new-deadline (+ stacks-block-time (var-get max-tenor)))
      ERR_TENOR
    )
    (asserts! (<= util (get max-util-bps pool)) ERR_CAPACITY)
    (asserts! (<= (get lent pool) (get max-lent pool)) ERR_CAPACITY)
    (asserts! (<= lev (var-get max-lev-bps)) ERR_LEVERAGE)
    (asserts! (>= (health-at id price) (var-get extend-min-health-bps))
      ERR_HEALTH
    )
    ;; the user pays the pool directly (tx-sender = user, caller = vault)
    (try! (contract-call? .stx-short-pool add-interest interest))
    (map-set positions id
      (merge p {
        deadline: new-deadline,
        rate-bps: rate,
        interest-paid: (+ (get interest-paid p) interest),
      })
    )
    (print {
      topic: "short-extend",
      id: id,
      interest: interest,
      rate-bps: rate,
      deadline: new-deadline,
    })
    (ok new-deadline)
  )
)

(define-public (add-collateral
    (id uint)
    (amount uint)
  )
  (let ((p (unwrap! (map-get? positions id) ERR_NO_POSITION)))
    (asserts! (is-eq tx-sender (get owner p)) ERR_NOT_POSITION_OWNER)
    (asserts!
      (or
        (is-eq (get state p) ST_OPENING)
        (is-eq (get state p) ST_OPEN)
        (is-eq (get state p) ST_CLOSING)
      )
      ERR_BAD_STATE
    )
    (asserts! (> amount u0) ERR_TOO_SMALL)
    (try! (contract-call? USDCX transfer amount tx-sender current-contract none))
    (var-set usdc-booked (+ (var-get usdc-booked) amount))
    (map-set positions id
      (merge p {
        usdc: (+ (get usdc p) amount),
        collateral: (+ (get collateral p) amount),
      })
    )
    (ok true)
  )
)

;; ---------- liquidation ----------

;; Anyone: when health < threshold, or the tenor is over without close /
;; extend (OPEN), or a user close is still running past deadline + grace.
;; Switches the position to LIQUIDATING (protocol FAST presets, user settings
;; ignored). The first buy waits 1 + liq-offset blocks (unpredictable).
(define-public (liquidate
    (id uint)
    (update (buff 8192))
  )
  (let (
      (p (unwrap! (map-get? positions id) ERR_NO_POSITION))
      (price (try! (oracle-price update)))
    )
    (sync-slot)
    (asserts! (is-liquidatable-at id price) ERR_NOT_LIQUIDATABLE)
    (try! (pull-slot id))
    (map-set positions id
      (merge (unwrap-panic (map-get? positions id)) {
        state: ST_LIQUIDATING,
        phase: MODE_FAST,
        liq-height: stacks-block-height,
        liq-keeper: (some tx-sender),
        last-step: stacks-block-height,
      })
    )
    (print {
      topic: "short-liquidate",
      id: id,
      keeper: tx-sender,
      health-bps: (health-at id price),
      deadline: (get deadline p),
      mid: price,
    })
    (ok true)
  )
)

;; ---------- owner (bounded; no path to user or lender funds) ----------

(define-public (set-open-paused (v bool))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR_NOT_OWNER)
    (ok (var-set open-paused v))
  )
)

(define-public (set-owner (v principal))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR_NOT_OWNER)
    (ok (var-set owner v))
  )
)

(define-public (set-rails
    (max-lev uint)
    (min-amount uint)
    (tenor-default uint)
    (tenor-min uint)
    (tenor-max uint)
    (slip-default uint)
    (slip-max uint)
    (incr-default uint)
    (window-default uint)
    (window-max uint)
    (band uint)
    (batch uint)
    (exec-window uint)
    (grace uint)
  )
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR_NOT_OWNER)
    (asserts! (and (>= max-lev BPS) (<= max-lev HARD_MAX_LEV_BPS)) ERR_BAD_PARAM)
    (asserts! (> min-amount u0) ERR_BAD_PARAM)
    (asserts!
      (and
        (>= tenor-min HARD_MIN_TENOR)
        (<= tenor-min tenor-default)
        (<= tenor-default tenor-max)
        (<= tenor-max HARD_MAX_TENOR)
      )
      ERR_BAD_PARAM
    )
    (asserts!
      (and
        (> slip-default u0)
        (<= slip-default slip-max)
        (<= slip-max HARD_MAX_SLIP_BPS)
      )
      ERR_BAD_PARAM
    )
    (asserts! (and (>= incr-default MIN_INCR_BPS) (<= incr-default BPS))
      ERR_BAD_PARAM
    )
    (asserts!
      (and
        (>= window-default u1)
        (<= window-default window-max)
        (<= window-max HARD_MAX_WINDOW)
      )
      ERR_BAD_PARAM
    )
    (asserts! (<= band HARD_MAX_BAND_BPS) ERR_BAD_PARAM)
    (asserts! (and (>= batch u60) (<= batch u3600)) ERR_BAD_PARAM)
    (asserts! (and (>= exec-window u300) (<= exec-window u86400)) ERR_BAD_PARAM)
    (asserts! (<= grace u86400) ERR_BAD_PARAM)
    (var-set max-lev-bps max-lev)
    (var-set min-stx min-amount)
    (var-set default-tenor tenor-default)
    (var-set min-tenor tenor-min)
    (var-set max-tenor tenor-max)
    (var-set default-slip-bps slip-default)
    (var-set max-slip-bps slip-max)
    (var-set default-incr-bps incr-default)
    (var-set default-window window-default)
    (var-set max-window window-max)
    (var-set band-bps band)
    (var-set batch-secs batch)
    (var-set exec-window-secs exec-window)
    (var-set close-grace-secs grace)
    (print {
      topic: "short-rails",
      params: (get-params),
    })
    (ok true)
  )
)

(define-public (set-risk
    (liq-threshold uint)
    (extend-min-health uint)
    (buffer uint)
    (liq-slip uint)
    (liq-incr uint)
    (max-offset uint)
    (bounty uint)
    (cancel-fee uint)
  )
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR_NOT_OWNER)
    (asserts!
      (and (>= liq-threshold HARD_MIN_LIQ_BPS) (<= liq-threshold HARD_MAX_LIQ_BPS))
      ERR_BAD_PARAM
    )
    (asserts!
      (and (>= extend-min-health liq-threshold) (<= extend-min-health u20000))
      ERR_BAD_PARAM
    )
    (asserts! (<= buffer HARD_MAX_BUFFER_BPS) ERR_BAD_PARAM)
    (asserts! (and (> liq-slip u0) (<= liq-slip HARD_MAX_SLIP_BPS)) ERR_BAD_PARAM)
    (asserts! (and (>= liq-incr MIN_INCR_BPS) (<= liq-incr BPS)) ERR_BAD_PARAM)
    (asserts! (<= max-offset HARD_MAX_OFFSET) ERR_BAD_PARAM)
    (asserts! (<= bounty HARD_MAX_BOUNTY_BPS) ERR_BAD_PARAM)
    (asserts! (<= cancel-fee HARD_MAX_CANCEL_FEE_BPS) ERR_BAD_PARAM)
    (var-set liq-threshold-bps liq-threshold)
    (var-set extend-min-health-bps extend-min-health)
    (var-set buffer-bps buffer)
    (var-set liq-slip-bps liq-slip)
    (var-set liq-incr-bps liq-incr)
    (var-set liq-max-offset max-offset)
    (var-set liq-bounty-bps bounty)
    (var-set cancel-fee-bps cancel-fee)
    (print {
      topic: "short-risk",
      params: (get-params),
    })
    (ok true)
  )
)
