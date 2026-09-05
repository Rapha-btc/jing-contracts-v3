(define-constant JING_MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jingswap)
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant WSTX 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2)
(define-constant ASSET_SBTC "sbtc-token")
(define-constant ASSET_WSTX "wstx")

(define-constant DLMM_ROUTER 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-2)
(define-constant DLMM_POOL 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-2-bps-15)
(define-constant DLMM_CORE 'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1)

(define-constant DLMM_MAX_STEPS u230)

(define-constant XYK_CORE 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-core-v-1-2)
(define-constant XYK_POOL 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-pool-sbtc-stx-v-1-1)

(define-constant VELAR_POOL 'SP20X3DC5R091J8B6YPQT638J8NR1W83KN6TN5BJY.univ2-pool-v1_0_0-0070)
(define-constant VELAR_FEES 'SP20X3DC5R091J8B6YPQT638J8NR1W83KN6TN5BJY.univ2-fees-v1_0_0-0070)
(define-constant VELAR_WSTX 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.wstx)

(define-constant VENUE_DLMM u1)
(define-constant VENUE_XYK u2)
(define-constant VENUE_VELAR u3)

(define-constant ERR_ZERO_AMOUNT (err u3001))
(define-constant ERR_MIN_OUT (err u3002))
(define-constant ERR_BAD_VENUE (err u3003))
(define-constant ERR_SPLIT_MISMATCH (err u3004))
(define-constant ERR_VAA_REQUIRED (err u3005))
(define-constant ERR_ZERO_LIMIT (err u3006))
(define-constant ERR_ZERO_MID (err u3007))

(define-private (sbtc-balance (who principal))
  (unwrap-panic (contract-call? SBTC get-balance who))
)

(define-private (gain
    (before uint)
    (after uint)
  )
  (if (> after before)
    (- after before)
    u0
  )
)

(define-private (jing-swap
    (amount uint)
    (limit-price uint)
    (update (buff 8192))
    (deposit-x bool)
  )
  (match (contract-call? JING_MARKET swap amount limit-price update SBTC ASSET_SBTC WSTX
    ASSET_WSTX deposit-x
  )
    res (some {
      spent: (- amount
        (if deposit-x
          (get token-x-rolled res)
          (get token-y-rolled res)
        )
        (get rebate-refunded res)
      ),
      out: (if deposit-x
        (get token-y-received res)
        (get token-x-received res)
      ),
    })
    e none
  )
)

(define-private (jing-spent (r (optional {
  spent: uint,
  out: uint,
})))
  (match r
    v (get spent v)
    u0
  )
)

(define-private (jing-out (r (optional {
  spent: uint,
  out: uint,
})))
  (match r
    v (get out v)
    u0
  )
)

(define-private (xyk-swap
    (sell-sbtc bool)
    (amount uint)
    (min-received uint)
  )
  (let ((x-is-sbtc (is-eq (get x-token (unwrap-panic (contract-call? XYK_POOL get-pool))) SBTC)))
    (if x-is-sbtc
      (if sell-sbtc
        (contract-call? XYK_CORE swap-x-for-y XYK_POOL SBTC WSTX amount
          min-received
        )
        (contract-call? XYK_CORE swap-y-for-x XYK_POOL SBTC WSTX amount
          min-received
        )
      )
      (if sell-sbtc
        (contract-call? XYK_CORE swap-y-for-x XYK_POOL WSTX SBTC amount
          min-received
        )
        (contract-call? XYK_CORE swap-x-for-y XYK_POOL WSTX SBTC amount
          min-received
        )
      )
    )
  )
)

(define-private (amm-sell-sbtc
    (amount uint)
    (min-received uint)
    (venue uint)
  )
  (if (is-eq venue VENUE_DLMM)
    (contract-call? DLMM_ROUTER swap-y-for-x-simple-range-multi DLMM_POOL WSTX
      SBTC amount min-received DLMM_MAX_STEPS none
    )
    (if (is-eq venue VENUE_XYK)
      (ok {
        in: amount,
        out: (try! (xyk-swap true amount min-received)),
      })
      (ok {
        in: amount,
        out: (get amt-out
          (try! (contract-call? VELAR_POOL swap SBTC VELAR_WSTX VELAR_FEES amount
            min-received
          ))
        ),
      })
    )
  )
)

(define-private (amm-sell-stx
    (amount uint)
    (min-received uint)
    (venue uint)
  )
  (if (is-eq venue VENUE_DLMM)
    (contract-call? DLMM_ROUTER swap-x-for-y-simple-range-multi DLMM_POOL WSTX
      SBTC amount min-received DLMM_MAX_STEPS none
    )
    (if (is-eq venue VENUE_XYK)
      (ok {
        in: amount,
        out: (try! (xyk-swap false amount min-received)),
      })
      (ok {
        in: amount,
        out: (get amt-out
          (try! (contract-call? VELAR_POOL swap VELAR_WSTX SBTC VELAR_FEES amount
            min-received
          ))
        ),
      })
    )
  )
)

(define-private (amm-floor (min-received uint))
  (if (> min-received u0)
    min-received
    u1
  )
)

(define-private (leg-sbtc
    (amount uint)
    (min-received uint)
    (venue uint)
  )
  (if (> amount u0)
    (amm-sell-sbtc amount (amm-floor min-received) venue)
    (ok {
      in: u0,
      out: u0,
    })
  )
)

(define-private (leg-stx
    (amount uint)
    (min-received uint)
    (venue uint)
  )
  (if (> amount u0)
    (amm-sell-stx amount (amm-floor min-received) venue)
    (ok {
      in: u0,
      out: u0,
    })
  )
)

(define-private (with-fallback
    (planned uint)
    (venue uint)
    (fallback (optional uint))
    (residual uint)
  )
  (if (is-eq (some venue) fallback)
    (+ planned residual)
    planned
  )
)

(define-private (scale-min
    (min-received uint)
    (planned uint)
    (actual uint)
  )
  (if (or (is-eq planned u0) (is-eq actual planned))
    min-received
    (/ (* min-received actual) planned)
  )
)

(define-private (valid-fallback (fallback (optional uint)))
  (match fallback
    v (or
      (is-eq v VENUE_DLMM)
      (is-eq v VENUE_XYK)
      (is-eq v VENUE_VELAR)
    )
    true
  )
)

(define-public (swap-sbtc-for-stx
    (amount uint)
    (jing-amount uint)
    (limit-price uint)
    (update (optional (buff 8192)))
    (fallback (optional uint))
    (amm-amounts {
      dlmm: uint,
      xyk: uint,
      velar: uint,
    })
    (amm-mins {
      dlmm: uint,
      xyk: uint,
      velar: uint,
    })
    (min-stx-out uint)
  )
  (begin
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)

    (asserts!
      (is-eq amount
        (+ jing-amount (get dlmm amm-amounts) (get xyk amm-amounts)
          (get velar amm-amounts)
        ))
      ERR_SPLIT_MISMATCH
    )
    (asserts! (valid-fallback fallback) ERR_BAD_VENUE)
    (let (
        (user tx-sender)
        (stx-before (stx-get-balance user))
        (jing (if (> jing-amount u0)
          (jing-swap jing-amount limit-price (unwrap! update ERR_VAA_REQUIRED)
            true
          )
          none
        ))
        (jing-in (jing-spent jing))
        (residual (- jing-amount jing-in))
        (dlmm-in (with-fallback (get dlmm amm-amounts) VENUE_DLMM fallback residual))
        (xyk-in (with-fallback (get xyk amm-amounts) VENUE_XYK fallback residual))
        (velar-in (with-fallback (get velar amm-amounts) VENUE_VELAR fallback residual))
        (dlmm (try! (leg-sbtc dlmm-in
          (scale-min (get dlmm amm-mins) (get dlmm amm-amounts) dlmm-in)
          VENUE_DLMM
        )))
        (xyk (try! (leg-sbtc xyk-in
          (scale-min (get xyk amm-mins) (get xyk amm-amounts) xyk-in)
          VENUE_XYK
        )))
        (velar (try! (leg-sbtc velar-in
          (scale-min (get velar amm-mins) (get velar amm-amounts) velar-in)
          VENUE_VELAR
        )))
        (out (gain stx-before (stx-get-balance user)))
      )
      (asserts! (>= out min-stx-out) ERR_MIN_OUT)
      (print {
        topic: "swap-sbtc-for-stx",
        user: user,
        amount: amount,
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: (jing-out jing),
        dlmm-in: (get in dlmm),
        dlmm-out: (get out dlmm),
        xyk-in: (get in xyk),
        xyk-out: (get out xyk),
        velar-in: (get in velar),
        velar-out: (get out velar),
        unsold: (+ (if (is-none fallback)
          residual
          u0
        )
          (- dlmm-in (get in dlmm))
        ),
        out: out,
      })
      (ok {
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: (jing-out jing),
        dlmm-in: (get in dlmm),
        dlmm-out: (get out dlmm),
        xyk-in: (get in xyk),
        xyk-out: (get out xyk),
        velar-in: (get in velar),
        velar-out: (get out velar),
        unsold: (+ (if (is-none fallback)
          residual
          u0
        )
          (- dlmm-in (get in dlmm))
        ),
        out: out,
      })
    )
  )
)

(define-public (swap-stx-for-sbtc
    (amount uint)
    (jing-amount uint)
    (limit-price uint)
    (update (optional (buff 8192)))
    (fallback (optional uint))
    (amm-amounts {
      dlmm: uint,
      xyk: uint,
      velar: uint,
    })
    (amm-mins {
      dlmm: uint,
      xyk: uint,
      velar: uint,
    })
    (min-sbtc-out uint)
  )
  (begin
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)

    (asserts!
      (is-eq amount
        (+ jing-amount (get dlmm amm-amounts) (get xyk amm-amounts)
          (get velar amm-amounts)
        ))
      ERR_SPLIT_MISMATCH
    )
    (asserts! (valid-fallback fallback) ERR_BAD_VENUE)
    (let (
        (user tx-sender)
        (sbtc-before (sbtc-balance user))
        (jing (if (> jing-amount u0)
          (jing-swap jing-amount limit-price (unwrap! update ERR_VAA_REQUIRED)
            false
          )
          none
        ))
        (jing-in (jing-spent jing))
        (residual (- jing-amount jing-in))
        (dlmm-in (with-fallback (get dlmm amm-amounts) VENUE_DLMM fallback residual))
        (xyk-in (with-fallback (get xyk amm-amounts) VENUE_XYK fallback residual))
        (velar-in (with-fallback (get velar amm-amounts) VENUE_VELAR fallback residual))
        (dlmm (try! (leg-stx dlmm-in
          (scale-min (get dlmm amm-mins) (get dlmm amm-amounts) dlmm-in)
          VENUE_DLMM
        )))
        (xyk (try! (leg-stx xyk-in
          (scale-min (get xyk amm-mins) (get xyk amm-amounts) xyk-in)
          VENUE_XYK
        )))
        (velar (try! (leg-stx velar-in
          (scale-min (get velar amm-mins) (get velar amm-amounts) velar-in)
          VENUE_VELAR
        )))
        (out (gain sbtc-before (sbtc-balance user)))
      )
      (asserts! (>= out min-sbtc-out) ERR_MIN_OUT)
      (print {
        topic: "swap-stx-for-sbtc",
        user: user,
        amount: amount,
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: (jing-out jing),
        dlmm-in: (get in dlmm),
        dlmm-out: (get out dlmm),
        xyk-in: (get in xyk),
        xyk-out: (get out xyk),
        velar-in: (get in velar),
        velar-out: (get out velar),
        unsold: (+ (if (is-none fallback)
          residual
          u0
        )
          (- dlmm-in (get in dlmm))
        ),
        out: out,
      })
      (ok {
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: (jing-out jing),
        dlmm-in: (get in dlmm),
        dlmm-out: (get out dlmm),
        xyk-in: (get in xyk),
        xyk-out: (get out xyk),
        velar-in: (get in velar),
        velar-out: (get out velar),
        unsold: (+ (if (is-none fallback)
          residual
          u0
        )
          (- dlmm-in (get in dlmm))
        ),
        out: out,
      })
    )
  )
)

(define-constant PRICE_SCALE u10000000000)
(define-constant BPS u10000)
(define-constant CP_SAFETY u9980)

(define-private (xyk-keep (sell-sbtc bool))
  (let ((pool (unwrap-panic (contract-call? XYK_POOL get-pool))))
    (if (is-eq (is-eq (get x-token pool) SBTC) sell-sbtc)
      {
        num: (- BPS (+ (get x-protocol-fee pool) (get x-provider-fee pool))),
        den: BPS,
      }
      {
        num: (- BPS (+ (get y-protocol-fee pool) (get y-provider-fee pool))),
        den: BPS,
      }
    )
  )
)

(define-private (velar-keep)
  (let ((fees (unwrap-panic (contract-call? VELAR_FEES get-fees))))
    {
      num: (get num (get swap-fee fees)),
      den: (get den (get swap-fee fees)),
    }
  )
)

(define-private (xyk-reserves (sell-sbtc bool))
  (let ((pool (unwrap-panic (contract-call? XYK_POOL get-pool))))
    (if (is-eq (is-eq (get x-token pool) SBTC) sell-sbtc)
      {
        in: (get x-balance pool),
        out: (get y-balance pool),
      }
      {
        in: (get y-balance pool),
        out: (get x-balance pool),
      }
    )
  )
)

(define-private (velar-reserves (sell-sbtc bool))
  (let ((pool (unwrap-panic (contract-call? VELAR_POOL get-pool))))
    (if (is-eq (is-eq (get token0 pool) SBTC) sell-sbtc)
      {
        in: (get reserve0 pool),
        out: (get reserve1 pool),
      }
      {
        in: (get reserve1 pool),
        out: (get reserve0 pool),
      }
    )
  )
)

(define-private (cp-capacity
    (r {
      in: uint,
      out: uint,
    })
    (k {
      num: uint,
      den: uint,
    })
    (limit uint)
    (sell-sbtc bool)
  )
  (let ((top (if sell-sbtc
      (/ (* (get out r) PRICE_SCALE (get num k)) (* limit (get den k)))
      (/ (* (get out r) limit (get num k)) (* PRICE_SCALE (get den k)))
    )))
    (if (> top (get in r))
      (/ (* (- top (get in r)) (get den k) CP_SAFETY) (* (get num k) BPS))
      u0
    )
  )
)

(define-constant ROUND_SLACK u2)

(define-private (limit-min
    (leg uint)
    (limit uint)
    (sell-sbtc bool)
  )
  (let ((base (if (> leg ROUND_SLACK)
      (- leg ROUND_SLACK)
      u0
    )))
    (if sell-sbtc
      (/ (* base limit) PRICE_SCALE)
      (/ (* base PRICE_SCALE) limit)
    )
  )
)

(define-private (jing-size
    (amount uint)
    (limit uint)
    (update (optional (buff 8192)))
    (mid uint)
    (sell-sbtc bool)
  )
  (match update
    v (let (
        (cap (get gross-cap
          (contract-call? JING_MARKET get-taker-capacity mid limit sell-sbtc)
        ))
        (size (if (> cap amount)
          amount
          cap
        ))
        (net (- size (/ (* size u20) BPS)))
        (mins (contract-call? JING_MARKET get-min-deposits))
        (min-dep (if sell-sbtc
          (get min-token-x mins)
          (get min-token-y mins)
        ))
      )
      (if (>= net min-dep)
        size
        u0
      )
    )
    u0
  )
)

(define-private (cp-split
    (residual uint)
    (cap-xyk uint)
    (cap-velar uint)
  )
  (let ((total (+ cap-xyk cap-velar)))
    (if (<= residual total)
      (let ((xyk (if (> total u0)
          (/ (* residual cap-xyk) total)
          u0
        )))
        {
          xyk: xyk,
          velar: (- residual xyk),
        }
      )
      {
        xyk: cap-xyk,
        velar: cap-velar,
      }
    )
  )
)

(define-constant DLMM_PRICE_SCALE u100000000)
(define-constant DLMM_CENTER_BIN 500)
(define-constant DLMM_WALK_BINS (list
  u0 u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15 u16 u17 u18 u19 u20
  u21 u22 u23 u24 u25 u26 u27 u28 u29
))

(define-private (dlmm-bin-step
    (i uint)
    (acc {
      bin: int,
      up: bool,
      threshold: uint,
      initial-price: uint,
      bin-step: uint,
      fee: uint,
      cap: uint,
      done: bool,
    })
  )
  (if (get done acc)
    acc
    (let (
        (price (unwrap-panic (contract-call? DLMM_CORE get-bin-price (get initial-price acc)
          (get bin-step acc) (get bin acc)
        )))
        (bal (unwrap-panic (contract-call? DLMM_POOL get-bin-balances
          (to-uint (+ (get bin acc) DLMM_CENTER_BIN))
        )))
        (ok-price (if (get up acc)
          (<= price (get threshold acc))
          (>= price (get threshold acc))
        ))
        (raw (if (get up acc)
          (/ (+ (* (get x-balance bal) price) (- DLMM_PRICE_SCALE u1))
            DLMM_PRICE_SCALE
          )
          (/ (+ (* (get y-balance bal) DLMM_PRICE_SCALE) (- price u1)) price)
        ))
        (grossed (if (> (get fee acc) u0)
          (/ (* raw BPS) (- BPS (get fee acc)))
          raw
        ))
      )
      (if ok-price
        (merge acc {
          cap: (+ (get cap acc) grossed),
          bin: (if (get up acc)
            (+ (get bin acc) 1)
            (- (get bin acc) 1)
          ),
        })
        (merge acc { done: true })
      )
    )
  )
)

(define-private (dlmm-capacity
    (limit uint)
    (sell-sbtc bool)
  )
  (let (
      (pool (unwrap-panic (contract-call? DLMM_POOL get-pool)))
      (fee (if sell-sbtc
        (+ (get y-protocol-fee pool) (get y-provider-fee pool)
          (get y-variable-fee pool)
        )
        (+ (get x-protocol-fee pool) (get x-provider-fee pool)
          (get x-variable-fee pool)
        )
      ))
    )
    (get cap
      (fold dlmm-bin-step DLMM_WALK_BINS {
        bin: (get active-bin-id pool),
        up: sell-sbtc,
        threshold: (if sell-sbtc
          (/ (* (/ (* PRICE_SCALE DLMM_PRICE_SCALE) limit) (- BPS fee)) BPS)
          (/ (* (/ (* PRICE_SCALE DLMM_PRICE_SCALE) limit) BPS) (- BPS fee))
        ),
        initial-price: (get initial-price pool),
        bin-step: (get bin-step pool),
        fee: fee,
        cap: u0,
        done: false,
      })
    )
  )
)

(define-private (amm-leg
    (amount uint)
    (limit uint)
    (sell-sbtc bool)
    (venue uint)
  )
  (if sell-sbtc
    (leg-sbtc amount (limit-min amount limit true) venue)
    (leg-stx amount (limit-min amount limit false) venue)
  )
)

(define-private (dlmm-stage
    (left uint)
    (limit uint)
    (sell-sbtc bool)
  )
  (if (is-eq left u0)
    (ok {
      cap: u0,
      in: u0,
      out: u0,
    })
    (let (
        (cap (dlmm-capacity limit sell-sbtc))
        (plan (if (> cap left)
          left
          cap
        ))
        (leg (try! (amm-leg plan limit sell-sbtc VENUE_DLMM)))
      )
      (ok {
        cap: cap,
        in: (get in leg),
        out: (get out leg),
      })
    )
  )
)

(define-private (cp-stage
    (left uint)
    (limit uint)
    (sell-sbtc bool)
  )
  (if (is-eq left u0)
    (ok {
      xyk-cap: u0,
      velar-cap: u0,
      xyk-in: u0,
      xyk-out: u0,
      velar-in: u0,
      velar-out: u0,
      unsold: u0,
    })
    (let (
        (cap-xyk (cp-capacity (xyk-reserves sell-sbtc) (xyk-keep sell-sbtc) limit
          sell-sbtc
        ))
        (cap-velar (cp-capacity (velar-reserves sell-sbtc) (velar-keep) limit sell-sbtc))
        (plan (cp-split left cap-xyk cap-velar))
        (xyk (try! (amm-leg (get xyk plan) limit sell-sbtc VENUE_XYK)))
        (velar (try! (amm-leg (get velar plan) limit sell-sbtc VENUE_VELAR)))
      )
      (ok {
        xyk-cap: cap-xyk,
        velar-cap: cap-velar,
        xyk-in: (get in xyk),
        xyk-out: (get out xyk),
        velar-in: (get in velar),
        velar-out: (get out velar),
        unsold: (- left (get xyk plan) (get velar plan)),
      })
    )
  )
)

(define-public (smart-swap-sbtc-for-stx
    (amount uint)
    (limit-price uint)
    (update (optional (buff 8192)))
    (mid uint)
    (min-stx-out uint)
  )
  (begin
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)

    (asserts! (> limit-price u0) ERR_ZERO_LIMIT)
    (asserts! (> mid u0) ERR_ZERO_MID)
    (let (
        (user tx-sender)
        (stx-before (stx-get-balance user))
        (jing-amount (jing-size amount limit-price update mid true))
        (jing (if (> jing-amount u0)
          (jing-swap jing-amount limit-price (unwrap-panic update) true)
          none
        ))
        (jing-in (jing-spent jing))
        (dlmm (try! (dlmm-stage (- amount jing-in) limit-price true)))
        (cp (try! (cp-stage (- amount jing-in (get in dlmm)) limit-price true)))
        (out (gain stx-before (stx-get-balance user)))
      )
      (asserts! (>= out min-stx-out) ERR_MIN_OUT)
      (print {
        topic: "smart-swap-sbtc-for-stx",
        user: user,
        amount: amount,
        limit-price: limit-price,
        jing-cap: jing-amount,
        dlmm-cap: (get cap dlmm),
        xyk-cap: (get xyk-cap cp),
        velar-cap: (get velar-cap cp),
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: (jing-out jing),
        dlmm-in: (get in dlmm),
        dlmm-out: (get out dlmm),
        xyk-in: (get xyk-in cp),
        xyk-out: (get xyk-out cp),
        velar-in: (get velar-in cp),
        velar-out: (get velar-out cp),
        unsold: (get unsold cp),
        out: out,
      })
      (ok {
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: (jing-out jing),
        dlmm-in: (get in dlmm),
        dlmm-out: (get out dlmm),
        xyk-in: (get xyk-in cp),
        xyk-out: (get xyk-out cp),
        velar-in: (get velar-in cp),
        velar-out: (get velar-out cp),
        unsold: (get unsold cp),
        out: out,
      })
    )
  )
)

(define-public (smart-swap-stx-for-sbtc
    (amount uint)
    (limit-price uint)
    (update (optional (buff 8192)))
    (mid uint)
    (min-sbtc-out uint)
  )
  (begin
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)

    (asserts! (> limit-price u0) ERR_ZERO_LIMIT)
    (asserts! (> mid u0) ERR_ZERO_MID)
    (let (
        (user tx-sender)
        (sbtc-before (sbtc-balance user))
        (jing-amount (jing-size amount limit-price update mid false))
        (jing (if (> jing-amount u0)
          (jing-swap jing-amount limit-price (unwrap-panic update) false)
          none
        ))
        (jing-in (jing-spent jing))
        (dlmm (try! (dlmm-stage (- amount jing-in) limit-price false)))
        (cp (try! (cp-stage (- amount jing-in (get in dlmm)) limit-price false)))
        (out (gain sbtc-before (sbtc-balance user)))
      )
      (asserts! (>= out min-sbtc-out) ERR_MIN_OUT)
      (print {
        topic: "smart-swap-stx-for-sbtc",
        user: user,
        amount: amount,
        limit-price: limit-price,
        jing-cap: jing-amount,
        dlmm-cap: (get cap dlmm),
        xyk-cap: (get xyk-cap cp),
        velar-cap: (get velar-cap cp),
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: (jing-out jing),
        dlmm-in: (get in dlmm),
        dlmm-out: (get out dlmm),
        xyk-in: (get xyk-in cp),
        xyk-out: (get xyk-out cp),
        velar-in: (get velar-in cp),
        velar-out: (get velar-out cp),
        unsold: (get unsold cp),
        out: out,
      })
      (ok {
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: (jing-out jing),
        dlmm-in: (get in dlmm),
        dlmm-out: (get out dlmm),
        xyk-in: (get xyk-in cp),
        xyk-out: (get xyk-out cp),
        velar-in: (get velar-in cp),
        velar-out: (get velar-out cp),
        unsold: (get unsold cp),
        out: out,
      })
    )
  )
)

(define-read-only (get-jing-min-deposits)
  (contract-call?
    'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jingswap
    get-min-deposits
  )
)
