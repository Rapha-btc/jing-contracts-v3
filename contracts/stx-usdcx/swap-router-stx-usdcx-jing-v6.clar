;; swap-router-stx-usdcx-jing-v6
;;
;; v6: v5-5 + Zest CLMM STX/USDCx venue (pool 1 on
;; SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-pool-v1, x = Zest `wstx`,
;; y = usdcx, bin step 100, 30 bps both sides), in the split entry points and
;; as a stage of smart-swap-* (signatures unchanged).
;; Smart swaps: Jing -> Zest -> DLMM -> cp, each stage on what the previous
;; ones left.
;;   - Zest keeps no active bin. Its price is WAD raw STX per raw USDCx, bin
;;     `t` covers [1.01^t, 1.01^(t+1)]. The stage turns `mid` (untrusted, it
;;     only picks which bins are read) and the price bound into ticks with
;;     an on-chain log2: STX->USDCx walks up from tick(mid) - 2 to
;;     tick(max-price) + 1, USDCx->STX walks down from tick(mid) + 2 to
;;     tick(min-price) - 1, at most 32 ticks; a tight limit walks few, a limit
;;     past the market walks none (stage skipped).
;;   - Bound = limit-price (USDCx per STX, 1e8) inverted into Zest's
;;     orientation with the user's own Zest fee folded in, rounded against
;;     the user: max-price = floor(1e26 * (1 - fee) / limit) for x -> y,
;;     min-price = ceil(1e26 / (limit * (1 - fee))) for y -> x. Zest bounds
;;     the marginal post-trade price, so every unit fills at or better than
;;     limit-price net of fee (up to Zest's 1-raw-unit output haircut).
;;   - allow-partial-fill true, min-dy / min-dx 0: Zest takes what fits and
;;     the rest goes on to DLMM. The combined min-out still guards the user.
;;   - No fill never reverts: dust remainder, no ticks in range, zero output
;;     and any Zest error (paused pool, ...) all give in = out = 0; an err
;;     from the Zest call rolls back Zest's own writes, like the Jing leg.
;;   - Receipt gains zest-in / zest-out after jing-out; print also gains
;;     zest-ok (Zest call returned ok) and zest-ticks (ticks walked).
;;   - unsold = amount - jing - zest - dlmm - cp.
;;   - VENUE_ZEST u4; `amm-amounts` / `amm-mins` gain a `zest` field, and the
;;     split check (u3004) is jing + dlmm + xyk + velar + zest = amount.
;;   - New trailing arg `zest-route { ticks, price }`: the FE hands the tick
;;     walk (same idea as the DLMM bins: the FE quotes, the contract trusts
;;     only the min-out). swap-stx-for-usdcx calls clmm-router-v1
;;     swap-x-for-y (ticks strictly ascending, price = max-price, WAD;
;;     UINT-MAX = unbounded); swap-usdcx-for-stx calls swap-y-for-x (ticks
;;     strictly descending, price = min-price, WAD; u0 = unbounded).
;;     allow-partial-fill is always false (Zest reverts u5001 if the walk
;;     does not take the whole leg), deadline = stacks-block-time (the tx is
;;     already bound by block inclusion; no new user arg).
;;   - zest = u0 skips the call entirely (ticks / price ignored). Zest is not
;;     a fallback venue: `fallback` stays DLMM-only, so a Jing residual never
;;     lands on the fixed Zest walk.
;;   - The Zest output is measured with the rest on the user balance, so it
;;     counts toward the one combined min-out; `amm-mins.zest` (floored to u1)
;;     is passed as Zest's own min-dy / min-dx.
;;   - Receipt + print gain zest-in / zest-out.
;;
;; Native STX on the Zest leg: Zest's wstx is a pass-through whose transfer
;; is `(stx-transfer? amount sender recipient)` with no caller check, and
;; clmm-pool-v1 pulls with `sender = tx-sender` under
;; `restrict-assets? tx-sender ((with-stx amount))`, pays out with
;; `as-contract? ((with-stx out))` to tx-sender. This router never uses
;; as-contract, so tx-sender is the user end to end: STX leaves the user's
;; own balance straight to clmm-pool-v1 and STX proceeds land on the user,
;; exactly like the Bitflow token-stx-v-1-2 facade. No wrapping, no router
;; custody, no allowance needed here.
;; Post-conditions (deny mode): user STX sent <= amount (STX side) or user
;; USDCx sent <= amount (USDCx side), plus clmm-pool-v1 sends USDCx / STX
;; to the user, alongside the existing DLMM pool PCs.
(define-constant JING_MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-stx-usdcx-jing-v6-4)
(define-constant WSTX 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2)
(define-constant USDCX 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant ASSET_WSTX "wstx")
(define-constant ASSET_USDCX "usdcx-token")

(define-constant DLMM_ROUTER 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-2)
(define-constant DLMM_POOL_1 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-usdcx-v-1-bps-10)
(define-constant DLMM_POOL_2 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-usdcx-v-1-bps-4)
(define-constant DLMM_POOL_3 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-usdcx-v-1-bps-1)
(define-constant DLMM_CORE 'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1)
(define-constant DLMM_POOL_ID_1 u3)
(define-constant DLMM_POOL_ID_2 u4)
(define-constant DLMM_POOL_ID_3 u5)
(define-constant DLMM_MAX_STEPS u230)

(define-constant VENUE_DLMM u1)
(define-constant VENUE_XYK u2)
(define-constant VENUE_VELAR u3)
(define-constant VENUE_ZEST u4)

(define-constant ZEST_ROUTER 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-router-v1)
(define-constant ZEST_WSTX 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx)
(define-constant ZEST_POOL_ID u1)

(define-constant ERR_ZERO_AMOUNT (err u3001))
(define-constant ERR_MIN_OUT (err u3002))
(define-constant ERR_BAD_VENUE (err u3003))
(define-constant ERR_SPLIT_MISMATCH (err u3004))
(define-constant ERR_VAA_REQUIRED (err u3005))
(define-constant ERR_ZERO_LIMIT (err u3006))
(define-constant ERR_ZERO_MID (err u3007))

(define-private (stx-balance (who principal))
  (stx-get-balance who)
)

(define-private (usdcx-balance (who principal))
  (unwrap-panic (contract-call? USDCX get-balance who))
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
  (match (contract-call? JING_MARKET swap amount limit-price update WSTX ASSET_WSTX
    USDCX ASSET_USDCX deposit-x
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

(define-private (dlmm-sell
    (pool uint)
    (sell-stx bool)
    (amount uint)
    (min-received uint)
  )
  (if sell-stx
    (if (is-eq pool u2)
      (contract-call? DLMM_ROUTER swap-x-for-y-simple-range-multi DLMM_POOL_2
        WSTX USDCX amount min-received DLMM_MAX_STEPS none
      )
      (if (is-eq pool u3)
        (contract-call? DLMM_ROUTER swap-x-for-y-simple-range-multi DLMM_POOL_3
          WSTX USDCX amount min-received DLMM_MAX_STEPS none
        )
        (contract-call? DLMM_ROUTER swap-x-for-y-simple-range-multi DLMM_POOL_1
          WSTX USDCX amount min-received DLMM_MAX_STEPS none
        )
      )
    )
    (if (is-eq pool u2)
      (contract-call? DLMM_ROUTER swap-y-for-x-simple-range-multi DLMM_POOL_2
        WSTX USDCX amount min-received DLMM_MAX_STEPS none
      )
      (if (is-eq pool u3)
        (contract-call? DLMM_ROUTER swap-y-for-x-simple-range-multi DLMM_POOL_3
          WSTX USDCX amount min-received DLMM_MAX_STEPS none
        )
        (contract-call? DLMM_ROUTER swap-y-for-x-simple-range-multi DLMM_POOL_1
          WSTX USDCX amount min-received DLMM_MAX_STEPS none
        )
      )
    )
  )
)

(define-private (amm-sell-stx
    (amount uint)
    (min-received uint)
    (venue uint)
  )
  (if (is-eq venue VENUE_DLMM)
    (dlmm-sell (dlmm-pick true amount u0) true amount min-received)
    ERR_BAD_VENUE
  )
)

(define-private (amm-sell-usdcx
    (amount uint)
    (min-received uint)
    (venue uint)
  )
  (if (is-eq venue VENUE_DLMM)
    (dlmm-sell (dlmm-pick false amount u0) false amount min-received)
    ERR_BAD_VENUE
  )
)

(define-private (amm-floor (min-received uint))
  (if (> min-received u0)
    min-received
    u1
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

(define-private (leg-usdcx
    (amount uint)
    (min-received uint)
    (venue uint)
  )
  (if (> amount u0)
    (amm-sell-usdcx amount (amm-floor min-received) venue)
    (ok {
      in: u0,
      out: u0,
    })
  )
)

(define-private (leg-zest
    (amount uint)
    (min-received uint)
    (route {
      ticks: (list 32 int),
      price: uint,
    })
    (sell-stx bool)
  )
  (if (> amount u0)
    (if sell-stx
      (match (contract-call? ZEST_ROUTER swap-x-for-y ZEST_WSTX USDCX ZEST_POOL_ID
        amount (get price route) (get ticks route) (amm-floor min-received)
        false stacks-block-time
      )
        r (ok {
          in: (get dx r),
          out: (get dy r),
        })
        e (err e)
      )
      (match (contract-call? ZEST_ROUTER swap-y-for-x ZEST_WSTX USDCX ZEST_POOL_ID
        amount (get price route) (get ticks route) (amm-floor min-received)
        false stacks-block-time
      )
        r (ok {
          in: (get dy r),
          out: (get dx r),
        })
        e (err e)
      )
    )
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

(define-private (fallback-residual
    (residual uint)
    (jing (optional {
      spent: uint,
      out: uint,
    }))
    (sell-stx bool)
  )
  (match jing
    j (if (and
        (> (get spent j) u0)
        (> (get out j) u0)
        (dust-left residual
          (if sell-stx
            (/ (* (get out j) PRICE_SCALE) (get spent j))
            (/ (* (get spent j) PRICE_SCALE) (get out j))
          )
          sell-stx
        )
      )
      u0
      residual
    )
    residual
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
    v (is-eq v VENUE_DLMM)
    true
  )
)

(define-public (swap-stx-for-usdcx
    (amount uint)
    (jing-amount uint)
    (limit-price uint)
    (update (optional (buff 8192)))
    (fallback (optional uint))
    (amm-amounts {
      zest: uint,
      dlmm: uint,
      xyk: uint,
      velar: uint,
    })
    (amm-mins {
      zest: uint,
      dlmm: uint,
      xyk: uint,
      velar: uint,
    })
    (min-usdcx-out uint)
    (zest-route {
      ticks: (list 32 int),
      price: uint,
    })
  )
  (begin
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (asserts!
      (is-eq amount
        (+ jing-amount (get dlmm amm-amounts) (get xyk amm-amounts)
          (get velar amm-amounts) (get zest amm-amounts)
        ))
      ERR_SPLIT_MISMATCH
    )
    (asserts! (valid-fallback fallback) ERR_BAD_VENUE)
    (let (
        (user tx-sender)
        (usdcx-before (usdcx-balance user))
        (jing (if (> jing-amount u0)
          (jing-swap jing-amount limit-price (unwrap! update ERR_VAA_REQUIRED)
            true
          )
          none
        ))
        (jing-in (jing-spent jing))
        (residual (- jing-amount jing-in))
        (routed (fallback-residual residual jing true))
        (dlmm-in (with-fallback (get dlmm amm-amounts) VENUE_DLMM fallback routed))
        (xyk-in (with-fallback (get xyk amm-amounts) VENUE_XYK fallback routed))
        (velar-in (with-fallback (get velar amm-amounts) VENUE_VELAR fallback routed))
        (zest (try! (leg-zest (get zest amm-amounts) (get zest amm-mins) zest-route true)))
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
        (out (gain usdcx-before (usdcx-balance user)))
      )
      (asserts! (>= out min-usdcx-out) ERR_MIN_OUT)
      (print {
        topic: "swap-stx-for-usdcx",
        user: user,
        amount: amount,
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: (jing-out jing),
        zest-in: (get in zest),
        zest-out: (get out zest),
        dlmm-in: (get in dlmm),
        dlmm-out: (get out dlmm),
        xyk-in: (get in xyk),
        xyk-out: (get out xyk),
        velar-in: (get in velar),
        velar-out: (get out velar),
        unsold: (+
          (if (is-none fallback)
            residual
            (- residual routed)
          )
          (- dlmm-in (get in dlmm))
        ),
        out: out,
      })
      (ok {
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: (jing-out jing),
        zest-in: (get in zest),
        zest-out: (get out zest),
        dlmm-in: (get in dlmm),
        dlmm-out: (get out dlmm),
        xyk-in: (get in xyk),
        xyk-out: (get out xyk),
        velar-in: (get in velar),
        velar-out: (get out velar),
        unsold: (+
          (if (is-none fallback)
            residual
            (- residual routed)
          )
          (- dlmm-in (get in dlmm))
        ),
        out: out,
      })
    )
  )
)

(define-public (swap-usdcx-for-stx
    (amount uint)
    (jing-amount uint)
    (limit-price uint)
    (update (optional (buff 8192)))
    (fallback (optional uint))
    (amm-amounts {
      zest: uint,
      dlmm: uint,
      xyk: uint,
      velar: uint,
    })
    (amm-mins {
      zest: uint,
      dlmm: uint,
      xyk: uint,
      velar: uint,
    })
    (min-stx-out uint)
    (zest-route {
      ticks: (list 32 int),
      price: uint,
    })
  )
  (begin
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (asserts!
      (is-eq amount
        (+ jing-amount (get dlmm amm-amounts) (get xyk amm-amounts)
          (get velar amm-amounts) (get zest amm-amounts)
        ))
      ERR_SPLIT_MISMATCH
    )
    (asserts! (valid-fallback fallback) ERR_BAD_VENUE)
    (let (
        (user tx-sender)
        (stx-before (stx-balance user))
        (jing (if (> jing-amount u0)
          (jing-swap jing-amount limit-price (unwrap! update ERR_VAA_REQUIRED)
            false
          )
          none
        ))
        (jing-in (jing-spent jing))
        (residual (- jing-amount jing-in))
        (routed (fallback-residual residual jing false))
        (dlmm-in (with-fallback (get dlmm amm-amounts) VENUE_DLMM fallback routed))
        (xyk-in (with-fallback (get xyk amm-amounts) VENUE_XYK fallback routed))
        (velar-in (with-fallback (get velar amm-amounts) VENUE_VELAR fallback routed))
        (zest (try! (leg-zest (get zest amm-amounts) (get zest amm-mins) zest-route false)))
        (dlmm (try! (leg-usdcx dlmm-in
          (scale-min (get dlmm amm-mins) (get dlmm amm-amounts) dlmm-in)
          VENUE_DLMM
        )))
        (xyk (try! (leg-usdcx xyk-in
          (scale-min (get xyk amm-mins) (get xyk amm-amounts) xyk-in)
          VENUE_XYK
        )))
        (velar (try! (leg-usdcx velar-in
          (scale-min (get velar amm-mins) (get velar amm-amounts) velar-in)
          VENUE_VELAR
        )))
        (out (gain stx-before (stx-balance user)))
      )
      (asserts! (>= out min-stx-out) ERR_MIN_OUT)
      (print {
        topic: "swap-usdcx-for-stx",
        user: user,
        amount: amount,
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: (jing-out jing),
        zest-in: (get in zest),
        zest-out: (get out zest),
        dlmm-in: (get in dlmm),
        dlmm-out: (get out dlmm),
        xyk-in: (get in xyk),
        xyk-out: (get out xyk),
        velar-in: (get in velar),
        velar-out: (get out velar),
        unsold: (+
          (if (is-none fallback)
            residual
            (- residual routed)
          )
          (- dlmm-in (get in dlmm))
        ),
        out: out,
      })
      (ok {
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: (jing-out jing),
        zest-in: (get in zest),
        zest-out: (get out zest),
        dlmm-in: (get in dlmm),
        dlmm-out: (get out dlmm),
        xyk-in: (get in xyk),
        xyk-out: (get out xyk),
        velar-in: (get in velar),
        velar-out: (get out velar),
        unsold: (+
          (if (is-none fallback)
            residual
            (- residual routed)
          )
          (- dlmm-in (get in dlmm))
        ),
        out: out,
      })
    )
  )
)

(define-constant PRICE_SCALE u100000000)
(define-constant BPS u10000)
(define-constant CP_SAFETY u9980)

(define-constant ROUND_SLACK u2)

(define-private (limit-min
    (leg uint)
    (limit uint)
    (sell-stx bool)
  )
  (let ((base (if (> leg ROUND_SLACK)
      (- leg ROUND_SLACK)
      u0
    )))
    (if sell-stx
      (/ (* base limit) PRICE_SCALE)
      (/ (* base PRICE_SCALE) limit)
    )
  )
)

(define-constant JING_FEE_BPS u10)

(define-private (book-limit
    (limit uint)
    (bps uint)
    (sell-stx bool)
  )
  (if sell-stx
    (/ (- (+ (* limit (+ BPS bps)) (- BPS JING_FEE_BPS)) u1) (- BPS JING_FEE_BPS))
    (/ (* limit (- BPS JING_FEE_BPS)) (+ BPS bps))
  )
)

(define-private (jing-size
    (amount uint)
    (limit uint)
    (update (optional (buff 8192)))
    (mid uint)
    (sell-stx bool)
  )
  (match update
    v (let (
        (bps (get rebate-bps
          (contract-call? JING_MARKET get-taker-capacity mid limit sell-stx
            tx-sender (some v)
          )))
        (blimit (book-limit limit bps sell-stx))
        (quote (contract-call? JING_MARKET get-taker-capacity mid blimit sell-stx
          tx-sender (some v)
        ))
        (cap (get gross-cap quote))
        (size (if (> cap amount)
          amount
          cap
        ))
        (net (/ (* size BPS) (+ BPS (get rebate-bps quote))))
        (mins (contract-call? JING_MARKET get-min-deposits))
        (min-dep (if sell-stx
          (get min-token-x mins)
          (get min-token-y mins)
        ))
      )
      {
        size: (if (and
            (> blimit u0)
            (>= net min-dep)
            (>= net (get min-taker quote))
          )
          size
          u0
        ),
        limit: blimit,
      }
    )
    {
      size: u0,
      limit: limit,
    }
  )
)

(define-constant DLMM_PRICE_SCALE u100000000)
(define-constant DLMM_CENTER_BIN 500)
(define-constant DLMM_WALK_BINS (list
  u0 u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15 u16 u17 u18 u19 u20
  u21 u22 u23 u24 u25 u26 u27 u28 u29
))

(define-private (dlmm-pick
    (sell-stx bool)
    (amount uint)
    (limit uint)
  )
  (let (
      (d1 (dlmm-depth DLMM_POOL_1 DLMM_POOL_ID_1 sell-stx))
      (d2 (dlmm-depth DLMM_POOL_2 DLMM_POOL_ID_2 sell-stx))
      (d3 (dlmm-depth DLMM_POOL_3 DLMM_POOL_ID_3 sell-stx))
      (floor (/
        (if (> d1 d2)
          (if (> d1 d3)
            d1
            d3
          )
          (if (> d2 d3)
            d2
            d3
          )
        )
        u100
      ))
      (e1 (and (> d1 u0) (>= d1 floor)))
      (e2 (and (> d2 u0) (>= d2 floor)))
      (e3 (and (> d3 u0) (>= d3 floor)))
    )
    (if (not (or
        (and e1 e2)
        (and e1 e3)
        (and e2 e3)
      ))
      (if e2
        u2
        (if e3
          u3
          u1
        )
      )
      (let (
          (o1 (if e1
            (dlmm-out u1 amount sell-stx limit)
            u0
          ))
          (o2 (if e2
            (dlmm-out u2 amount sell-stx limit)
            u0
          ))
          (o3 (if e3
            (dlmm-out u3 amount sell-stx limit)
            u0
          ))
        )
        (if (and
            e1
            (>= o1 o2)
            (>= o1 o3)
          )
          u1
          (if (and e2 (>= o2 o3))
            u2
            u3
          )
        )
      )
    )
  )
)

(define-private (dlmm-threshold
    (limit uint)
    (sell-stx bool)
    (fee uint)
  )
  (if sell-stx
    (/ (- (+ (* limit DLMM_PRICE_SCALE BPS) (* PRICE_SCALE (- BPS fee))) u1)
      (* PRICE_SCALE (- BPS fee))
    )
    (/ (* limit DLMM_PRICE_SCALE (- BPS fee)) (* PRICE_SCALE BPS))
  )
)

(define-private (dlmm-out
    (pool uint)
    (amount uint)
    (sell-stx bool)
    (limit uint)
  )
  (let (
      (info (dlmm-pool-info pool))
      (fee (if sell-stx
        (+ (get x-protocol-fee info) (get x-provider-fee info)
          (get x-variable-fee info)
        )
        (+ (get y-protocol-fee info) (get y-provider-fee info)
          (get y-variable-fee info)
        )
      ))
    )
    (if (> (get bin-step info) u0)
      (let (
          (aid (to-uint (+ (get active-bin-id info) DLMM_CENTER_BIN)))
          (lo (if (not sell-stx)
            aid
            (if (>= aid u29)
              (- aid u29)
              u0
            )
          ))
          (hi (if (not sell-stx)
            (if (<= (+ aid u30) u1001)
              (+ aid u30)
              u1001
            )
            (+ aid u1)
          ))
          (threshold (if (is-eq limit u0)
            (if sell-stx
              u0
              u340282366920938463463374607431768211455
            )
            (dlmm-threshold limit sell-stx fee)
          ))
        )
        (get out
          (fold dlmm-out-step DLMM_WALK_BINS {
            pool: pool,
            bin: (get active-bin-id info),
            up: (not sell-stx),
            threshold: threshold,
            initial-price: (get initial-price info),
            factors: (unwrap-panic (slice?
              (unwrap-panic (unwrap-panic (contract-call? DLMM_CORE get-bin-factors-by-step
                (get bin-step info)
              )))
              lo hi
            )),
            base: lo,
            fee: fee,
            left: amount,
            out: u0,
            done: false,
          })
        )
      )
      u0
    )
  )
)

(define-private (dlmm-out-step
    (i uint)
    (acc {
      pool: uint,
      bin: int,
      up: bool,
      threshold: uint,
      initial-price: uint,
      factors: (list 1001 uint),
      base: uint,
      fee: uint,
      left: uint,
      out: uint,
      done: bool,
    })
  )
  (if (or (get done acc) (is-eq (get left acc) u0))
    acc
    (let (
        (id (to-uint (+ (get bin acc) DLMM_CENTER_BIN)))
        (price (/
          (* (get initial-price acc)
            (unwrap-panic (element-at? (get factors acc) (- id (get base acc))))
          )
          DLMM_PRICE_SCALE
        ))
        (bal (dlmm-bin-balances (get pool acc) id))
        (avail (if (get up acc)
          (get x-balance bal)
          (get y-balance bal)
        ))
        (raw (if (get up acc)
          (/ (+ (* avail price) (- DLMM_PRICE_SCALE u1)) DLMM_PRICE_SCALE)
          (/ (+ (* avail DLMM_PRICE_SCALE) (- price u1)) price)
        ))
        (grossed (if (> (get fee acc) u0)
          (/ (* raw BPS) (- BPS (get fee acc)))
          raw
        ))
        (edge (is-eq (get bin acc)
          (if (get up acc)
            500
            -500
          )))
        (ok-price (if (get up acc)
          (<= price (get threshold acc))
          (>= price (get threshold acc))
        ))
      )
      (if (and ok-price (>= (get left acc) grossed))
        (merge acc {
          out: (+ (get out acc) avail),
          left: (- (get left acc) grossed),
          bin: (if edge
            (get bin acc)
            (if (get up acc)
              (+ (get bin acc) 1)
              (- (get bin acc) 1)
            )
          ),
          done: edge,
        })
        (let ((net (if ok-price
            (/ (* (get left acc) (- BPS (get fee acc))) BPS)
            u0
          )))
          (merge acc {
            out: (+ (get out acc)
              (if (get up acc)
                (/ (* net DLMM_PRICE_SCALE) price)
                (/ (* net price) DLMM_PRICE_SCALE)
              )),
            left: u0,
            done: true,
          })
        )
      )
    )
  )
)

(define-private (dlmm-depth
    (pool principal)
    (id uint)
    (sell-stx bool)
  )
  (let ((bal (if sell-stx
      (usdcx-balance pool)
      (stx-balance pool)
    )))
    (if (and (> bal u0) (dlmm-enabled pool id))
      bal
      u0
    )
  )
)

(define-private (dlmm-enabled
    (pool principal)
    (id uint)
  )
  (match (unwrap-panic (contract-call? DLMM_CORE get-pool-by-id id))
    entry (and
      (get status entry)
      (is-eq (get pool-contract entry) pool)
      (is-eq
        (get core-address
          (dlmm-pool-info (if (is-eq id DLMM_POOL_ID_2)
            u2
            (if (is-eq id DLMM_POOL_ID_3)
              u3
              u1
            )
          ))
        )
        DLMM_CORE
      )
    )
    false
  )
)

(define-private (dlmm-pool-info (pool uint))
  (unwrap-panic (if (is-eq pool u2)
    (contract-call? DLMM_POOL_2 get-pool)
    (if (is-eq pool u3)
      (contract-call? DLMM_POOL_3 get-pool)
      (contract-call? DLMM_POOL_1 get-pool)
    )
  ))
)

(define-private (dlmm-bin-balances
    (pool uint)
    (id uint)
  )
  (unwrap-panic (if (is-eq pool u2)
    (contract-call? DLMM_POOL_2 get-bin-balances id)
    (if (is-eq pool u3)
      (contract-call? DLMM_POOL_3 get-bin-balances id)
      (contract-call? DLMM_POOL_1 get-bin-balances id)
    )
  ))
)

(define-private (dlmm-bin-step
    (i uint)
    (acc {
      pool: uint,
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
        (bal (dlmm-bin-balances (get pool acc)
          (to-uint (+ (get bin acc) DLMM_CENTER_BIN))
        ))
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
        (edge (is-eq (get bin acc)
          (if (get up acc)
            500
            -500
          )))
      )
      (if ok-price
        (merge acc {
          cap: (+ (get cap acc) grossed),
          bin: (if edge
            (get bin acc)
            (if (get up acc)
              (+ (get bin acc) 1)
              (- (get bin acc) 1)
            )
          ),
          done: edge,
        })
        (merge acc { done: true })
      )
    )
  )
)

(define-private (dlmm-capacity
    (limit uint)
    (sell-stx bool)
    (pick uint)
  )
  (let (
      (pool (dlmm-pool-info pick))
      (fee (if sell-stx
        (+ (get x-protocol-fee pool) (get x-provider-fee pool)
          (get x-variable-fee pool)
        )
        (+ (get y-protocol-fee pool) (get y-provider-fee pool)
          (get y-variable-fee pool)
        )
      ))
    )
    (get cap
      (fold dlmm-bin-step DLMM_WALK_BINS {
        pool: pick,
        bin: (get active-bin-id pool),
        up: (not sell-stx),
        threshold: (dlmm-threshold limit sell-stx fee),
        initial-price: (get initial-price pool),
        bin-step: (get bin-step pool),
        fee: fee,
        cap: u0,
        done: false,
      })
    )
  )
)

(define-private (dust-left
    (left uint)
    (limit uint)
    (sell-stx bool)
  )
  (or (is-eq left u0) (<= (limit-min left limit sell-stx) u1))
)

(define-private (dlmm-stage
    (left uint)
    (limit uint)
    (sell-stx bool)
  )
  (if (dust-left left limit sell-stx)
    (ok {
      cap: u0,
      in: u0,
      out: u0,
    })
    (let (
        (pick (dlmm-pick sell-stx left limit))
        (cap (if (or (> pick u1) (dlmm-enabled DLMM_POOL_1 DLMM_POOL_ID_1))
          (dlmm-capacity limit sell-stx pick)
          u0
        ))
        (plan (if (> cap left)
          left
          cap
        ))
        (leg (if (not (dust-left plan limit sell-stx))
          (try! (dlmm-sell pick sell-stx plan
            (amm-floor (limit-min plan limit sell-stx))
          ))
          {
            in: u0,
            out: u0,
          }
        ))
      )
      (ok {
        cap: cap,
        in: (get in leg),
        out: (get out leg),
      })
    )
  )
)

(define-constant ZEST_POOL 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-pool-v1)
(define-constant ZEST_FEE_ONE u100000000)
(define-constant ZEST_WAD_PRICE u100000000000000000000000000)
(define-constant ZEST_ONE u1152921504606846976)
(define-constant ZEST_TWO u2305843009213693952)
(define-constant ZEST_LOG2_WAD 68938602072359301496)
(define-constant ZEST_LOG2_STEP 16550525978195695)
(define-constant ZEST_MAX_TICK 4458)
(define-constant ZEST_TICK_MARGIN 2)
(define-constant ZEST_FRAC_BITS (list
  u576460752303423488 u288230376151711744 u144115188075855872
  u72057594037927936 u36028797018963968 u18014398509481984 u9007199254740992
  u4503599627370496 u2251799813685248 u1125899906842624 u562949953421312
  u281474976710656 u140737488355328 u70368744177664 u35184372088832
  u17592186044416
))
(define-constant ZEST_WALK (list
  u0 u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15 u16 u17 u18 u19 u20
  u21 u22 u23 u24 u25 u26 u27 u28 u29 u30 u31
))
(define-constant ZEST_NONE {
  ok: false,
  ticks: u0,
  in: u0,
  out: u0,
})

(define-private (zest-log2-bit
    (bit uint)
    (acc {
      m: uint,
      f: uint,
    })
  )
  (let ((sq (/ (* (get m acc) (get m acc)) ZEST_ONE)))
    (if (>= sq ZEST_TWO)
      {
        m: (/ sq u2),
        f: (+ (get f acc) bit),
      }
      {
        m: sq,
        f: (get f acc),
      }
    )
  )
)

(define-private (zest-log2 (x uint))
  (let (
      (n (log2 x))
      (m (if (>= n u60)
        (bit-shift-right x (- n u60))
        (bit-shift-left x (- u60 n))
      ))
    )
    (+ (* (to-int n) (to-int ZEST_ONE))
      (to-int (get f
        (fold zest-log2-bit ZEST_FRAC_BITS {
          m: m,
          f: u0,
        })
      ))
    )
  )
)

(define-private (zest-tick (wad uint))
  (let (
      (num (- (zest-log2 wad) ZEST_LOG2_WAD))
      (q (/ num ZEST_LOG2_STEP))
      (t (if (and (< num 0) (not (is-eq (* q ZEST_LOG2_STEP) num)))
        (- q 1)
        q
      ))
    )
    (if (> t ZEST_MAX_TICK)
      ZEST_MAX_TICK
      (if (< t (- 0 ZEST_MAX_TICK))
        (- 0 ZEST_MAX_TICK)
        t
      )
    )
  )
)

(define-private (zest-tick-step
    (k uint)
    (acc {
      tick: int,
      end: int,
      up: bool,
      ticks: (list 32 int),
    })
  )
  (if (if (get up acc)
      (> (get tick acc) (get end acc))
      (< (get tick acc) (get end acc))
    )
    acc
    (merge acc {
      ticks: (unwrap-panic (as-max-len? (append (get ticks acc) (get tick acc)) u32)),
      tick: (if (get up acc)
        (+ (get tick acc) 1)
        (- (get tick acc) 1)
      ),
    })
  )
)

(define-private (zest-ticks
    (mid-wad uint)
    (bound uint)
    (up bool)
  )
  (let (
      (tm (zest-tick mid-wad))
      (tb (zest-tick bound))
    )
    (get ticks
      (fold zest-tick-step ZEST_WALK {
        tick: (if up
          (- tm ZEST_TICK_MARGIN)
          (+ tm ZEST_TICK_MARGIN)
        ),
        end: (if up
          (+ tb 1)
          (- tb 1)
        ),
        up: up,
        ticks: (list),
      })
    )
  )
)

(define-private (zest-bound
    (limit uint)
    (fee uint)
    (sell-stx bool)
  )
  (if sell-stx
    (/ (/ (* ZEST_WAD_PRICE (- ZEST_FEE_ONE fee)) limit) ZEST_FEE_ONE)
    (let ((c (/ (+ (* ZEST_WAD_PRICE ZEST_FEE_ONE) (- limit u1)) limit)))
      (/ (+ c (- ZEST_FEE_ONE fee u1)) (- ZEST_FEE_ONE fee))
    )
  )
)

(define-private (zest-swap
    (left uint)
    (bound uint)
    (ticks (list 32 int))
    (sell-stx bool)
  )
  (if sell-stx
    (match (contract-call? ZEST_ROUTER swap-x-for-y ZEST_WSTX USDCX ZEST_POOL_ID left
      bound ticks u0 true stacks-block-time
    )
      r {
        ok: true,
        ticks: (len ticks),
        in: (get dx r),
        out: (get dy r),
      }
      e (merge ZEST_NONE { ticks: (len ticks) })
    )
    (match (contract-call? ZEST_ROUTER swap-y-for-x ZEST_WSTX USDCX ZEST_POOL_ID left
      bound ticks u0 true stacks-block-time
    )
      r {
        ok: true,
        ticks: (len ticks),
        in: (get dy r),
        out: (get dx r),
      }
      e (merge ZEST_NONE { ticks: (len ticks) })
    )
  )
)

(define-private (zest-stage
    (left uint)
    (limit uint)
    (mid uint)
    (sell-stx bool)
  )
  (if (dust-left left limit sell-stx)
    ZEST_NONE
    (match (contract-call? ZEST_POOL get-fee-rates ZEST_POOL_ID tx-sender)
      rates (let (
          (fee (if sell-stx
            (get fee-rate-x rates)
            (get fee-rate-y rates)
          ))
          (mid-wad (/ ZEST_WAD_PRICE mid))
          (bound (if (< fee ZEST_FEE_ONE)
            (zest-bound limit fee sell-stx)
            u0
          ))
          (ticks (if (and (> bound u0) (> mid-wad u0))
            (zest-ticks mid-wad bound sell-stx)
            (list)
          ))
        )
        (if (> (len ticks) u0)
          (zest-swap left bound ticks sell-stx)
          ZEST_NONE
        )
      )
      e ZEST_NONE
    )
  )
)

(define-private (cp-stage
    (left uint)
    (limit uint)
    (sell-stx bool)
  )
  {
    xyk-cap: u0,
    velar-cap: u0,
    xyk-in: u0,
    xyk-out: u0,
    velar-in: u0,
    velar-out: u0,
    unsold: left,
  }
)

(define-public (smart-swap-stx-for-usdcx
    (amount uint)
    (limit-price uint)
    (update (optional (buff 8192)))
    (mid uint)
    (min-usdcx-out uint)
  )
  (begin
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (asserts! (> limit-price u0) ERR_ZERO_LIMIT)
    (asserts! (> mid u0) ERR_ZERO_MID)
    (let (
        (user tx-sender)
        (usdcx-before (usdcx-balance user))
        (book (jing-size amount limit-price update mid true))
        (jing-amount (get size book))
        (jing (if (> jing-amount u0)
          (jing-swap jing-amount (get limit book) (unwrap-panic update) true)
          none
        ))
        (jing-in (jing-spent jing))
        (zest (zest-stage (- amount jing-in) limit-price mid true))
        (dlmm (try! (dlmm-stage (- amount jing-in (get in zest)) limit-price true)))
        (cp (cp-stage (- amount jing-in (get in zest) (get in dlmm)) limit-price true))
        (out (gain usdcx-before (usdcx-balance user)))
      )
      (asserts! (>= out min-usdcx-out) ERR_MIN_OUT)
      (print {
        topic: "smart-swap-stx-for-usdcx",
        user: user,
        amount: amount,
        limit-price: limit-price,
        jing-cap: jing-amount,
        zest-ticks: (get ticks zest),
        dlmm-cap: (get cap dlmm),
        xyk-cap: (get xyk-cap cp),
        velar-cap: (get velar-cap cp),
        jing-ok: (is-some jing),
        zest-ok: (get ok zest),
        jing-in: jing-in,
        jing-out: (jing-out jing),
        zest-in: (get in zest),
        zest-out: (get out zest),
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
        zest-in: (get in zest),
        zest-out: (get out zest),
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

(define-public (smart-swap-usdcx-for-stx
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
        (stx-before (stx-balance user))
        (book (jing-size amount limit-price update mid false))
        (jing-amount (get size book))
        (jing (if (> jing-amount u0)
          (jing-swap jing-amount (get limit book) (unwrap-panic update) false)
          none
        ))
        (jing-in (jing-spent jing))
        (zest (zest-stage (- amount jing-in) limit-price mid false))
        (dlmm (try! (dlmm-stage (- amount jing-in (get in zest)) limit-price false)))
        (cp (cp-stage (- amount jing-in (get in zest) (get in dlmm)) limit-price false))
        (out (gain stx-before (stx-balance user)))
      )
      (asserts! (>= out min-stx-out) ERR_MIN_OUT)
      (print {
        topic: "smart-swap-usdcx-for-stx",
        user: user,
        amount: amount,
        limit-price: limit-price,
        jing-cap: jing-amount,
        zest-ticks: (get ticks zest),
        dlmm-cap: (get cap dlmm),
        xyk-cap: (get xyk-cap cp),
        velar-cap: (get velar-cap cp),
        jing-ok: (is-some jing),
        zest-ok: (get ok zest),
        jing-in: jing-in,
        jing-out: (jing-out jing),
        zest-in: (get in zest),
        zest-out: (get out zest),
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
        zest-in: (get in zest),
        zest-out: (get out zest),
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
    'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-stx-usdcx-jing-v6-4
    get-min-deposits
  )
)
