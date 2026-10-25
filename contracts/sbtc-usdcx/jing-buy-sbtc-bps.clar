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
(define-constant MINT_FLOOR u1000000000)
(define-constant RESCALE u1000)
(define-constant MAX_SCALE_STEPS u3)
(define-constant ERR_UPDATE_REQUIRED (err u7012))
(define-constant ERR_PUSH_PAUSED (err u7014))
(define-constant ERR_ESCROW_COOLDOWN (err u7015))
(define-constant ERR_TOO_MANY_SHARES (err u7016))

(define-constant SOLD_OUT_DUST u10000)

(define-constant MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-4)
(define-constant LADDER 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-ladder-sbtc-usdcx-v1)
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant SBTC_NAME "sbtc-token")
(define-constant USDCX 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant USDCX_NAME "usdcx-token")
(define-constant SIDE "buy-band")
(define-constant NAME_PREFIX "jing-buy-sbtc-")
(define-constant BPS_PRECISION u10000)
(define-constant PRICE_NUMERATOR u1000000000000000000)

(define-constant SCALE u1000000000000)
(define-constant PROCEEDS_SCALE u1000000000000000000)
(define-read-only (miner-mid)
  (let ((p (unwrap-panic (contract-call?
      'SP1G48FZ4Y7JY8G2Z0N51QTCYGBQ6F4J43J77BQC0.dia-oracle
      get-value "BTC/USD"
    ))))
    (if (> (+ (/ (get timestamp p) u1000) u7200) stacks-block-time)
      (get value p)
      u0
    )
  )
)

(define-constant GUARD_BPS u2000)
(define-read-only (current-cap)
  (/ (* (miner-mid) (+ BPS_PRECISION GUARD_BPS)) BPS_PRECISION)
)

(define-read-only (min-market)
  (get min-token-y
    (contract-call?
      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-4
      get-min-deposits
    ))
)
(define-constant MIN_DEPOSIT u100000)

(define-data-var initialized bool false)
(define-data-var spread-bps uint u0)
(define-data-var cap uint u0)
(define-data-var total-shares uint u0)
(define-data-var members uint u0)
(define-data-var scale uint u0)
(define-map scale-start
  uint
  uint
)
(define-map epoch-final-scale
  uint
  uint
)
(define-map epoch-reserve
  uint
  {
    left: uint,
    reserve: uint,
    proceeds: uint,
  }
)
(define-data-var epoch uint u0)
(define-map epoch-final-proceeds
  uint
  uint
)
(define-data-var unfilled-index uint SCALE)
(define-data-var proceeds-index uint u0)
(define-data-var held-uusdcx uint u0)
(define-data-var reserved-uusdcx uint u0)
(define-map epoch-final-unfilled
  uint
  uint
)
(define-data-var sats-accounted uint u0)
(define-data-var current-proceeds uint u0)
(define-data-var proceeds-carry uint u0)
(define-data-var push-paused bool false)
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
    members: (var-get members),
    scale: (var-get scale),
    unfilled-index: (var-get unfilled-index),
    proceeds-index: (var-get proceeds-index),
    held-uusdcx: (var-get held-uusdcx),
    resting: (market-size),
    pooled: (pooled-usdcx),
  }
)

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
          (+ (market-size) (var-get held-uusdcx))
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
        stx: (get input payout),
        sbtc: (get proceeds payout),
      }
    )
    {
      shares: u0,
      stx: u0,
      sbtc: u0,
    }
  )
)

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
          (effective-shares (carried (get shares acc) u0 step))
          (delta (- seg-end seg-start))
          (units (* effective-shares delta))
        )
        (merge acc { owed: (+ (get owed acc) (/ units PROCEEDS_SCALE)) })
      )
    )
  )
)

(define-read-only (market-size)
  (+
    (contract-call?
      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-4
      get-token-y-deposit
      (contract-call?
        'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-4
        get-current-cycle
      )
      current-contract
    )
    (contract-call?
      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-4
      get-token-y-parked current-contract
    )
    (default-to u0
      (get amount
        (contract-call?
          'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-4
          get-token-y-pending-deposit current-contract
        ))
    ))
)

(define-read-only (pooled-usdcx)
  (/ (* (var-get total-shares) (var-get unfilled-index)) SCALE)
)

(define-public (initialize
    (bps uint)
    (seat bool)
  )
  (begin
    (asserts! (is-eq tx-sender (contract-call? LADDER get-owner))
      ERR_NOT_AUTHORIZED
    )
    (asserts! (not (var-get initialized)) ERR_ALREADY_INITIALIZED)
    (asserts! (< bps BPS_PRECISION) ERR_BAD_SPREAD)
    (asserts! (is-eq (own-name) (expected-name bps)) ERR_BAD_NAME)
    (var-set spread-bps bps)
    (var-set initialized true)
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

(define-public (sync)
  (let (
      (shares (var-get total-shares))
      (local (- (unwrap-panic (contract-call? USDCX get-balance current-contract)) (var-get reserved-uusdcx)))
      (actual (+ (market-size) local))
      (recorded (pooled-usdcx))
      (sbtc-now (unwrap-panic (contract-call? SBTC get-balance current-contract)))
      (gained (- sbtc-now (var-get sats-accounted)))
    )
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (var-set held-uusdcx local)
    (if (is-eq shares u0)
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
        (var-set sats-accounted sbtc-now)
        (var-set current-proceeds (+ (var-get current-proceeds) gained))
        (var-set proceeds-carry (mod scaled shares))
        (if (or (< actual SOLD_OUT_DUST) (< new-index (/ MINT_FLOOR RESCALE)))
          (begin
            (var-set unfilled-index new-index)
            (try! (roll-tail))
          )
          (if (< new-index MINT_FLOOR)
            (let ((next (+ (var-get scale) u1)))
              (var-set unfilled-index (* new-index RESCALE))
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

(define-public (deposit (amount uint))
  (let ((member tx-sender))
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (asserts! (>= amount MIN_DEPOSIT) ERR_TOO_SMALL)
    (try! (sync))
    (let ((paid (try! (settle-proceeds member))))
      (try! (contract-call? USDCX transfer amount member current-contract none))
      (let (
          (to-push (+ amount (var-get held-uusdcx)))
          (orphan (if (is-eq (var-get total-shares) u0)
            (+ (market-size) (var-get held-uusdcx))
            u0
          ))
          (shares (/ (* (+ amount orphan) SCALE) (var-get unfilled-index)))
          (pos (position-of member))
          (joining (is-none (map-get? positions member)))
          (epo (var-get epoch))
        )
        (asserts! (<= (+ (var-get total-shares) shares) PROCEEDS_SCALE)
          ERR_TOO_MANY_SHARES
        )
        (if (and
            (>= (+ to-push (market-size)) (min-market))
            (is-ok (push-to-market to-push))
          )
          (var-set held-uusdcx u0)
          (var-set held-uusdcx to-push)
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
        (is-ok (contract-call? LADDER log-deposit member amount shares epo
          (is-eq (var-get held-uusdcx) u0) (var-get held-uusdcx)
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

(define-public (push)
  (begin
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (try! (sync))
    (let (
        (to-push (var-get held-uusdcx))
        (pushed (and
          (> to-push u0)
          (>= (+ to-push (market-size)) (min-market))
          (is-ok (push-to-market to-push))
        ))
      )
      (if pushed
        (var-set held-uusdcx u0)
        true
      )
      (is-ok (contract-call? LADDER log-push tx-sender to-push pushed
        (var-get held-uusdcx)
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
      (if (is-none (map-get? positions member))
        (ok paid)
        (let (
            (fi (var-get unfilled-index))
            (member-shares (get shares (unwrap-panic (map-get? positions member))))
            (mine (/ (* member-shares fi) SCALE))
            (partial (if (>= amount mine)
              member-shares
              (/ (+ (* amount SCALE) (- fi u1)) fi)
            ))
            (full (or
              (>= amount mine)
              (is-eq (/ (* (- member-shares partial) fi) SCALE) u0)
            ))
            (shares-out (if full
              member-shares
              partial
            ))
            (take (if (and full (is-eq (var-get members) u1))
              (+ (market-size) (var-get held-uusdcx))
              (if full
                mine
                amount
              )
            ))
            (epo (var-get epoch))
          )
          (and
            (> take u0)
            (begin
              (try! (escrow-for take update))
              (try! (pull-to-held-uusdcx take))
              (try! (as-contract? ((with-ft USDCX USDCX_NAME take))
                (try! (contract-call? USDCX transfer take current-contract member none))
              ))
              (var-set held-uusdcx (- (var-get held-uusdcx) take))
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
          (and
            (is-eq (var-get members) u0)
            (let ((final-proceeds (var-get proceeds-index)))
              (map-set epoch-final-proceeds epo final-proceeds)
              (map-set epoch-final-scale epo (var-get scale))
              (is-ok (contract-call? LADDER log-epoch-closed epo final-proceeds))
              (var-set epoch (+ epo u1))
              (var-set total-shares u0)
              (var-set unfilled-index SCALE)
            )
          )
          (is-ok (contract-call? LADDER log-withdraw member take shares-out epo
            (var-get held-uusdcx)
          ))
          (ok {
            stx: take,
            sbtc: (get sbtc paid),
          })
        )
      )
    )
  )
)

(define-public (claim)
  (begin
    (asserts! (is-some (map-get? positions tx-sender)) ERR_NO_POSITION)
    (try! (sync))
    (settle-proceeds tx-sender)
  )
)

(define-private (own-name)
  (default-to "" (get name (unwrap-panic (principal-destruct? current-contract))))
)

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

(define-private (roll-tail)
  (let ((epo (var-get epoch)))
    (if (> (market-size) u0)
      (begin
        (try! (as-contract? ()
          (try! (contract-call? MARKET cancel-token-y-deposit USDCX USDCX_NAME))
        ))
        true
      )
      true
    )
    (let (
        (free (- (unwrap-panic (contract-call? USDCX get-balance current-contract)) (var-get reserved-uusdcx)))
        (final-proceeds (var-get proceeds-index))
      )
      (map-set epoch-final-proceeds epo final-proceeds)
      (map-set epoch-final-unfilled epo (var-get unfilled-index))
      (map-set epoch-final-scale epo (var-get scale))
      (var-set reserved-uusdcx (+ (var-get reserved-uusdcx) free))
      (var-set held-uusdcx u0)
      (map-set epoch-reserve epo {
        left: (var-get members),
        reserve: free,
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
        (try! (as-contract? ((with-ft SBTC SBTC_NAME owed))
          (try! (contract-call? SBTC transfer owed current-contract who none))
        ))
      )
      (var-set sats-accounted (- (var-get sats-accounted) owed))
      (and current (var-set current-proceeds (- (var-get current-proceeds) owed)))
      (and
        current
        (is-eq (var-get members) u1)
        (var-set proceeds-carry u0)
      )
      (and
        (> back u0)
        (try! (as-contract? ((with-ft USDCX USDCX_NAME back))
          (try! (contract-call? USDCX transfer back current-contract who none))
        ))
      )
      (var-set reserved-uusdcx (- (var-get reserved-uusdcx) back))
      (and (not current) (count-reserve-claim pos-epoch back owed))
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
      (and
        (or (> owed u0) (> back u0))
        (is-ok (contract-call? LADDER log-payout who owed back pos-epoch))
      )
      (ok {
        sbtc: owed,
        stx: back,
      })
    )
    (ok {
      stx: u0,
      sbtc: u0,
    })
  )
)

(define-private (push-to-market (to-push uint))
  (let ((g (current-cap)))
    (asserts! (not (var-get push-paused)) ERR_PUSH_PAUSED)
    (asserts! (>= stacks-block-time (+ (var-get escrow-cancelled-at) u86400))
      ERR_ESCROW_COOLDOWN
    )
    (asserts! (> g u0) ERR_ZERO_PRICE)
    (var-set cap g)
    (as-contract? ((with-ft USDCX USDCX_NAME to-push))
      (try! (contract-call? MARKET deposit-token-y to-push g
        (some (var-get spread-bps)) USDCX USDCX_NAME
      ))
    )
  )
)

(define-public (refresh-guard)
  (let ((g (current-cap)))
    (asserts! (var-get initialized) ERR_NOT_INITIALIZED)
    (asserts! (> g u0) ERR_ZERO_PRICE)
    (var-set cap g)
    (as-contract? ()
      (try! (contract-call? MARKET set-token-y-limit g (some (var-get spread-bps))))
    )
  )
)

(define-private (settle-escrow (update (optional (buff 8192))))
  (match (contract-call? MARKET get-token-y-pending-deposit current-contract)
    pending (if (>= stacks-block-time (+ (get submitted-at pending) u86400))
      (let ((refunded (try! (as-contract? ()
          (try! (contract-call? MARKET cancel-token-y-deposit USDCX USDCX_NAME))
        ))))
        (var-set held-uusdcx (+ (var-get held-uusdcx) refunded))
        (var-set escrow-cancelled-at stacks-block-time)
        (ok true)
      )
      (begin
        (try! (contract-call? MARKET settle-token-y-deposit current-contract
          (unwrap! update ERR_UPDATE_REQUIRED) USDCX USDCX_NAME
        ))
        (ok true)
      )
    )
    (ok true)
  )
)

(define-private (on-book)
  (+
    (contract-call? MARKET get-token-y-deposit
      (contract-call? MARKET get-current-cycle) current-contract
    )
    (contract-call? MARKET get-token-y-parked current-contract)
  )
)

(define-private (escrow-for
    (take uint)
    (update (optional (buff 8192)))
  )
  (if (<= take (+ (var-get held-uusdcx) (on-book)))
    (ok true)
    (begin
      (try! (settle-escrow update))
      (sync)
    )
  )
)

(define-private (pull-to-held-uusdcx (amount uint))
  (let ((have (var-get held-uusdcx)))
    (if (>= have amount)
      (ok true)
      (let (
          (gap (- amount have))
          (on-market (on-book))
        )
        (asserts! (>= on-market gap) ERR_INSUFFICIENT)
        (if (>= (- on-market gap) (min-market))
          (begin
            (try! (as-contract? ()
              (try! (contract-call? MARKET withdraw-token-y gap USDCX USDCX_NAME))
            ))
            (var-set held-uusdcx (+ have gap))
            (ok true)
          )
          (let ((refunded (try! (as-contract? ()
              (try! (contract-call? MARKET cancel-token-y-deposit USDCX USDCX_NAME))
            ))))
            (var-set held-uusdcx (+ have refunded))
            (ok true)
          )
        )
      )
    )
  )
)
