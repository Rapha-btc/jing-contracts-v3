;; SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-usdcx-jing-v6
;; v6: v5-6 + Zest CLMM sBTC/USDCx venue (bin-step-100 pool id u4 on
;; SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-pool-v1, x = sBTC,
;; y = USDCx, confirmed by Zest, not created yet), ported from
;; swap-router-sbtc-stx-jing-v6-1 (same x = sBTC layout, same limit units:
;; raw quote per sat x 1e10) with its fixes: partial fill, Zest err = 0,
;; scale-min rounded up, ZEST_MAX_LIMIT guard.
;;
;; Smart swaps: Jing -> Zest -> DLMM -> cp, each stage on what the previous
;; left. Zest has no active bin: the stage walks up to 32 ticks from
;; tick(mid) +/- 2 to one past tick(bound), bound = limit-price
;; (micro-USDCx per sat x 1e10) turned into Zest's WAD sats per micro-USDCx
;; (1e28 / limit) with the user's Zest fee folded in, rounded against the
;; user. Partial fill on, min 0; dust, no ticks, oversized limit/mid, a
;; missing pool or any Zest err give in = out = 0 and the rest goes to DLMM.
;; Print gains zest-ok / zest-ticks (ticks passed to Zest) / zest-in /
;; zest-out.
;;
;; Split swaps: `amm-amounts` / `amm-mins` gain `zest`, the split check
;; (u3004) adds it, and a trailing `zest-route { ticks, price }` carries the
;; FE's walk (selling sBTC = swap-x-for-y, ticks ascending, price =
;; max-price in sats per micro-USDCx, WAD; selling USDCx = swap-y-for-x,
;; ticks descending, price = min-price, WAD). Zest runs with partial fill on
;; and min 0; a Zest err counts as 0; `amm-mins.zest` is scaled (rounded up)
;; to the filled part and asserted (u3002). The Zest shortfall joins the
;; Jing residual: to the `fallback` venue when set, else unsold. Zest is not
;; a fallback venue (u4 refused, u3003).
;;
;; Deny-mode PCs: user sends <= amount of the sold token, clmm-pool-v1 sends
;; >= 0 of the bought token (Zest may fill 0), plus the existing DLMM PCs.
(define-constant JING_MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-5)
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant USDCX 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant ASSET_SBTC "sbtc-token")
(define-constant ASSET_USDCX "usdcx-token")

(define-constant DLMM_ROUTER 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-2)
(define-constant DLMM_POOL_1 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-sbtc-usdcx-v-1-bps-10)
(define-constant DLMM_POOL_2 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-sbtc-usdcx-v-1-bps-1)
(define-constant DLMM_POOL_3 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-sbtc-usdcx-v-2-bps-10)
(define-constant DLMM_CORE 'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1)
(define-constant DLMM_POOL_ID_1 u1)
(define-constant DLMM_POOL_ID_2 u2)
(define-constant DLMM_POOL_ID_3 u17)
(define-constant DLMM_MAX_STEPS u230)

(define-constant VENUE_DLMM u1)
(define-constant VENUE_XYK u2)
(define-constant VENUE_VELAR u3)
(define-constant VENUE_ZEST u4)

(define-constant ZEST_ROUTER 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-router-v1)
(define-constant ZEST_POOL 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-pool-v1)

;; The Zest sBTC/USDCx pool id on clmm-pool-v1, bin-step 100. Not created
;; yet (2026-11-27); Zest confirmed it will be u4 with pool 1's token order,
;; STX replaced by sBTC: token-x = sbtc-token, token-y = usdcx. Every Zest
;; call below passes SBTC as x, USDCX as y. While u4 is missing the smart
;; swap skips Zest (get-fee-rates errs) and a split's Zest leg fills 0.
(define-constant ZEST_POOL_ID u4)

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
  (match (contract-call? JING_MARKET swap amount limit-price update SBTC ASSET_SBTC
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
    (sell-sbtc bool)
    (amount uint)
    (min-received uint)
  )
  (if sell-sbtc
    (if (is-eq pool u2)
      (contract-call? DLMM_ROUTER swap-x-for-y-simple-range-multi DLMM_POOL_2
        SBTC USDCX amount min-received DLMM_MAX_STEPS none
      )
      (if (is-eq pool u3)
        (contract-call? DLMM_ROUTER swap-x-for-y-simple-range-multi DLMM_POOL_3
          SBTC USDCX amount min-received DLMM_MAX_STEPS none
        )
        (contract-call? DLMM_ROUTER swap-x-for-y-simple-range-multi DLMM_POOL_1
          SBTC USDCX amount min-received DLMM_MAX_STEPS none
        )
      )
    )
    (if (is-eq pool u2)
      (contract-call? DLMM_ROUTER swap-y-for-x-simple-range-multi DLMM_POOL_2
        SBTC USDCX amount min-received DLMM_MAX_STEPS none
      )
      (if (is-eq pool u3)
        (contract-call? DLMM_ROUTER swap-y-for-x-simple-range-multi DLMM_POOL_3
          SBTC USDCX amount min-received DLMM_MAX_STEPS none
        )
        (contract-call? DLMM_ROUTER swap-y-for-x-simple-range-multi DLMM_POOL_1
          SBTC USDCX amount min-received DLMM_MAX_STEPS none
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
    (sell-sbtc bool)
  )
  (if (> amount u0)
    (let ((r (if sell-sbtc
        (match (contract-call? ZEST_ROUTER swap-x-for-y SBTC USDCX ZEST_POOL_ID
          amount (get price route) (get ticks route) u0 true stacks-block-time
        )
          ok-r {
            in: (get dx ok-r),
            out: (get dy ok-r),
          }
          e {
            in: u0,
            out: u0,
          }
        )
        (match (contract-call? ZEST_ROUTER swap-y-for-x SBTC USDCX ZEST_POOL_ID
          amount (get price route) (get ticks route) u0 true stacks-block-time
        )
          ok-r {
            in: (get dy ok-r),
            out: (get dx ok-r),
          }
          e {
            in: u0,
            out: u0,
          }
        )
      )))
      (asserts! (>= (get out r) (scale-min min-received amount (get in r)))
        ERR_MIN_OUT
      )
      (ok r)
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
    (sell-sbtc bool)
  )
  (match jing
    j (if (and
        (> (get spent j) u0)
        (> (get out j) u0)
        (dust-left residual
          (if sell-sbtc
            (/ (* (get out j) PRICE_SCALE) (get spent j))
            (/ (* (get spent j) PRICE_SCALE) (get out j))
          )
          sell-sbtc
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
    ;; rounded up, so a partial fill never clears below the caller's price
    ;; (bounty mwofjt42 #31, Little Orb)
    (/ (+ (* min-received actual) (- planned u1)) planned)
  )
)

(define-private (valid-fallback (fallback (optional uint)))
  (match fallback
    v (is-eq v VENUE_DLMM)
    true
  )
)

(define-public (swap-sbtc-for-usdcx
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
        (zest (try! (leg-zest (get zest amm-amounts) (get zest amm-mins) zest-route true)))
        (zest-short (- (get zest amm-amounts) (get in zest)))
        (routed (+ (fallback-residual residual jing true)
          (fallback-residual zest-short
            (some {
              spent: (get in zest),
              out: (get out zest),
            })
            true
          )))
        (dlmm-in (with-fallback (get dlmm amm-amounts) VENUE_DLMM fallback routed))
        (xyk-in (with-fallback (get xyk amm-amounts) VENUE_XYK fallback routed))
        (velar-in (with-fallback (get velar amm-amounts) VENUE_VELAR fallback routed))
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
        (out (gain usdcx-before (usdcx-balance user)))
      )
      (asserts! (>= out min-usdcx-out) ERR_MIN_OUT)
      (print {
        topic: "swap-sbtc-for-usdcx",
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
            (+ residual zest-short)
            (- (+ residual zest-short) routed)
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
            (+ residual zest-short)
            (- (+ residual zest-short) routed)
          )
          (- dlmm-in (get in dlmm))
        ),
        out: out,
      })
    )
  )
)

(define-public (swap-usdcx-for-sbtc
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
    (min-sbtc-out uint)
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
        (sbtc-before (sbtc-balance user))
        (jing (if (> jing-amount u0)
          (jing-swap jing-amount limit-price (unwrap! update ERR_VAA_REQUIRED)
            false
          )
          none
        ))
        (jing-in (jing-spent jing))
        (residual (- jing-amount jing-in))
        (zest (try! (leg-zest (get zest amm-amounts) (get zest amm-mins) zest-route false)))
        (zest-short (- (get zest amm-amounts) (get in zest)))
        (routed (+ (fallback-residual residual jing false)
          (fallback-residual zest-short
            (some {
              spent: (get in zest),
              out: (get out zest),
            })
            false
          )))
        (dlmm-in (with-fallback (get dlmm amm-amounts) VENUE_DLMM fallback routed))
        (xyk-in (with-fallback (get xyk amm-amounts) VENUE_XYK fallback routed))
        (velar-in (with-fallback (get velar amm-amounts) VENUE_VELAR fallback routed))
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
        (out (gain sbtc-before (sbtc-balance user)))
      )
      (asserts! (>= out min-sbtc-out) ERR_MIN_OUT)
      (print {
        topic: "swap-usdcx-for-sbtc",
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
            (+ residual zest-short)
            (- (+ residual zest-short) routed)
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
            (+ residual zest-short)
            (- (+ residual zest-short) routed)
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

(define-constant JING_FEE_BPS u10)

(define-private (book-limit
    (limit uint)
    (bps uint)
    (sell-sbtc bool)
  )
  (if sell-sbtc
    (/ (- (+ (* limit (+ BPS bps)) (- BPS JING_FEE_BPS)) u1) (- BPS JING_FEE_BPS))
    (/ (* limit (- BPS JING_FEE_BPS)) (+ BPS bps))
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
        (bps (contract-call? JING_MARKET get-taker-rebate-bps-for v))
        (blimit (book-limit limit bps sell-sbtc))
        (quote (contract-call? JING_MARKET get-taker-capacity mid blimit sell-sbtc
          tx-sender (some v)
        ))
        (cap (get gross-cap quote))
        (size (if (> cap amount)
          amount
          cap
        ))
        (net (/ (* size BPS) (+ BPS (get rebate-bps quote))))
        (mins (contract-call? JING_MARKET get-min-deposits))
        (min-dep (if sell-sbtc
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
    (sell-sbtc bool)
    (amount uint)
    (limit uint)
  )
  (let (
      (d1 (dlmm-depth DLMM_POOL_1 DLMM_POOL_ID_1 sell-sbtc))
      (d2 (dlmm-depth DLMM_POOL_2 DLMM_POOL_ID_2 sell-sbtc))
      (d3 (dlmm-depth DLMM_POOL_3 DLMM_POOL_ID_3 sell-sbtc))
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
            (dlmm-out u1 amount sell-sbtc limit)
            u0
          ))
          (o2 (if e2
            (dlmm-out u2 amount sell-sbtc limit)
            u0
          ))
          (o3 (if e3
            (dlmm-out u3 amount sell-sbtc limit)
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
    (sell-sbtc bool)
    (fee uint)
  )
  (if sell-sbtc
    (/ (- (+ (* limit DLMM_PRICE_SCALE BPS) (* PRICE_SCALE (- BPS fee))) u1)
      (* PRICE_SCALE (- BPS fee))
    )
    (/ (* limit DLMM_PRICE_SCALE (- BPS fee)) (* PRICE_SCALE BPS))
  )
)

(define-private (dlmm-out
    (pool uint)
    (amount uint)
    (sell-sbtc bool)
    (limit uint)
  )
  (let (
      (info (dlmm-pool-info pool))
      (fee (if sell-sbtc
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
          (lo (if (not sell-sbtc)
            aid
            (if (>= aid u29)
              (- aid u29)
              u0
            )
          ))
          (hi (if (not sell-sbtc)
            (if (<= (+ aid u30) u1001)
              (+ aid u30)
              u1001
            )
            (+ aid u1)
          ))
          (threshold (if (is-eq limit u0)
            (if sell-sbtc
              u0
              u340282366920938463463374607431768211455
            )
            (dlmm-threshold limit sell-sbtc fee)
          ))
        )
        (get out
          (fold dlmm-out-step DLMM_WALK_BINS {
            pool: pool,
            bin: (get active-bin-id info),
            up: (not sell-sbtc),
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
    (sell-sbtc bool)
  )
  (let ((bal (if sell-sbtc
      (usdcx-balance pool)
      (sbtc-balance pool)
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
    (sell-sbtc bool)
    (pick uint)
  )
  (let (
      (pool (dlmm-pool-info pick))
      (fee (if sell-sbtc
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
        up: (not sell-sbtc),
        threshold: (dlmm-threshold limit sell-sbtc fee),
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
    (sell-sbtc bool)
  )
  (or (is-eq left u0) (<= (limit-min left limit sell-sbtc) u1))
)

(define-private (dlmm-stage
    (left uint)
    (limit uint)
    (sell-sbtc bool)
  )
  (if (dust-left left limit sell-sbtc)
    (ok {
      cap: u0,
      in: u0,
      out: u0,
    })
    (let (
        (pick (dlmm-pick sell-sbtc left limit))
        (cap (if (or (> pick u1) (dlmm-enabled DLMM_POOL_1 DLMM_POOL_ID_1))
          (dlmm-capacity limit sell-sbtc pick)
          u0
        ))
        (plan (if (> cap left)
          left
          cap
        ))
        (leg (if (not (dust-left plan limit sell-sbtc))
          (try! (dlmm-sell pick sell-sbtc plan
            (amm-floor (limit-min plan limit sell-sbtc))
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

;; Zest CLMM sBTC/USDCx (pool ZEST_POOL_ID on clmm-pool-v1; x = sBTC,
;; y = USDCx). Zest price = WAD raw x per raw y = sats per micro-USDCx x 1e18,
;; the INVERSE of limit-price (micro-USDCx per sat x 1e10): WAD = 1e28 / limit.
;; A limit or mid of 0 or above ZEST_MAX_LIMIT skips the stage.
(define-constant ZEST_INV_WAD u10000000000000000000000000000)
(define-constant ZEST_MAX_LIMIT u1000000000000000000000)
(define-constant ZEST_FEE_ONE u100000000)
(define-constant ZEST_ONE u1152921504606846976)
(define-constant ZEST_TWO u2305843009213693952)
(define-constant ZEST_LOG2_WAD 68938602072359301496)
(define-constant ZEST_LOG2_STEP 16550525978195695)
(define-constant ZEST_MAX_TICK 4458)
(define-constant ZEST_TICK_MARGIN 2)
(define-constant ZEST_FRAC_BITS (list
  u576460752303423488 u288230376151711744 u144115188075855872
  u72057594037927936 u36028797018963968 u18014398509481984
  u9007199254740992 u4503599627370496 u2251799813685248
  u1125899906842624 u562949953421312 u281474976710656
  u140737488355328 u70368744177664 u35184372088832 u17592186044416
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

;; limit-price (x1e10) -> Zest WAD bound with the user's fee, rounded against
;; the user. Selling sBTC (x -> y, limit = min micro-USDCx per sat, so at
;; most 1/limit sats per micro-USDCx): max-price = floor(floor(1e28 / limit)
;; * (1 - fee)). Selling USDCx (y -> x, limit = max micro-USDCx per sat, so at
;; least 1/limit sats per micro-USDCx): min-price = ceil(ceil(1e28 / limit)
;; / (1 - fee)).
(define-private (zest-bound
    (limit uint)
    (fee uint)
    (sell-sbtc bool)
  )
  (if sell-sbtc
    (/ (* (/ ZEST_INV_WAD limit) (- ZEST_FEE_ONE fee)) ZEST_FEE_ONE)
    (let (
        (p (/ (+ ZEST_INV_WAD (- limit u1)) limit))
        (c (* p ZEST_FEE_ONE))
      )
      (/ (+ c (- ZEST_FEE_ONE fee u1)) (- ZEST_FEE_ONE fee))
    )
  )
)

(define-private (zest-swap
    (left uint)
    (bound uint)
    (ticks (list 32 int))
    (sell-sbtc bool)
  )
  (if sell-sbtc
    (match (contract-call? ZEST_ROUTER swap-x-for-y SBTC USDCX ZEST_POOL_ID left
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
    (match (contract-call? ZEST_ROUTER swap-y-for-x SBTC USDCX ZEST_POOL_ID left
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
    (sell-sbtc bool)
  )
  (if (dust-left left limit sell-sbtc)
    ZEST_NONE
    (zest-stage-pool left limit mid sell-sbtc)
  )
)

(define-private (zest-stage-pool
    (left uint)
    (limit uint)
    (mid uint)
    (sell-sbtc bool)
  )
  (begin
    (match (contract-call? ZEST_POOL get-fee-rates ZEST_POOL_ID tx-sender)
      rates (let (
          (fee (if sell-sbtc
            (get fee-rate-x rates)
            (get fee-rate-y rates)
          ))
          (sane (and
            (> limit u0)
            (> mid u0)
            (<= limit ZEST_MAX_LIMIT)
            (<= mid ZEST_MAX_LIMIT)
          ))
          (mid-wad (if sane
            (/ ZEST_INV_WAD mid)
            u0
          ))
          (bound (if (and sane (< fee ZEST_FEE_ONE))
            (zest-bound limit fee sell-sbtc)
            u0
          ))
          (ticks (if (and (> bound u0) (> mid-wad u0))
            (zest-ticks mid-wad bound sell-sbtc)
            (list)
          ))
        )
        (if (> (len ticks) u0)
          (zest-swap left bound ticks sell-sbtc)
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
    (sell-sbtc bool)
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

(define-public (smart-swap-sbtc-for-usdcx
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
        topic: "smart-swap-sbtc-for-usdcx",
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

(define-public (smart-swap-usdcx-for-sbtc
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
        (out (gain sbtc-before (sbtc-balance user)))
      )
      (asserts! (>= out min-sbtc-out) ERR_MIN_OUT)
      (print {
        topic: "smart-swap-usdcx-for-sbtc",
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
    'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-5
    get-min-deposits
  )
)
