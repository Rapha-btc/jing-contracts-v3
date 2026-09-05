;; title: swap-router-sbtc-stx-jing-v2
;; v2: the market is markets-sbtc-stx-jing-v4 on Pyth Lazer; `update` is a
;; signed Lazer update (both feeds, evm format, with confidence) instead of
;; a Hermes VAA. Nothing else changed.
;; Retail swap router for the sBTC/STX pair: Jing's maker/taker book plus
;; Bitflow DLMM, Bitflow XYK and Velar, one tx, one receipt.
;;
;; HOW A SWAP RUNS
;;
;; The front end computes the split off-chain from live quotes (book depth
;; on the opposite side at the mid plus walkable makers inside the limit,
;; then each AMM's marginal price) and hands the contract one amount per
;; venue: `jing-amount` and `amm-amounts {dlmm, xyk, velar}`. The user
;; signs `amount`; the four must add up to it (`u3004`) so a bad split
;; fails loudly instead of selling a different total. The contract
;; executes the legs in that order.
;;
;;   Jing   `swap` (taker, fill-or-kill) for `jing-amount` at `limit-price`,
;;          best effort. If the market cannot fill it, it returns an err;
;;          the router catches that and Clarity rolls the call back
;;          (nothing moved, Pyth fee included). The market's `swap` returns
;;          the post-walk fill: `token-*-rolled` is the refunded sub-min
;;          residual, `rebate-refunded` the unspent rebate crumbs,
;;          `token-*-received` mid + walk. With `jing-amount` u0 the market
;;          is never called and `vaa` is `none`: no Pyth fee, no Hermes
;;          round trip. A non-zero `jing-amount` with `none` is `u3005`.
;;   fallback  what the book did not keep (skipped, rolled back, dust
;;          refund) goes to the `fallback` venue on top of that venue's
;;          planned amount, its minimum scaled pro rata so the per-unit
;;          floor holds; `none` leaves it in the wallet. "Jing mainly, the
;;          rest on one venue" is jing-amount = total, amm-amounts all u0,
;;          fallback (some venue).
;;   AMMs   DLMM, XYK, Velar, each for its own amount, each skipped at u0,
;;          each with its own minimum from `amm-mins`: the venue refuses a
;;          short fill itself with its own error (DLMM u2003, XYK u1019/u1020,
;;          Velar u107). A zero minimum is floored to u1 since Velar refuses
;;          u0. DLMM's router may stop short: it returns `in` < amount when
;;          it runs out of bins inside `max-steps` and never pulls the rest
;;          (Rapha: a partial fill beats a revert). XYK and Velar are all or
;;          nothing.
;;   end    the user's balance of the bought asset must have grown by at
;;          least `min-out`, or the whole tx reverts (`u3002`): the total
;;          backstop across all legs, measured on the wallet, not on what
;;          the venues report.
;;
;; The receipt (print and ok) carries `jing-in`/`jing-out`, one `in`/`out`
;; pair per AMM, `unsold` (book amount neither kept nor rerouted + DLMM
;; shortfall, all still in the wallet) and the measured `out`.
;;
;; WHO HOLDS THE FUNDS
;;
;; Nobody but the user. The router is called WITHOUT as-contract, so
;; tx-sender stays the user through every leg: the market and the pools
;; pull from the user and pay the user. The Jing leg is read from the
;; market's return tuple; the final `min-out` guard is measured on the
;; user's balance so it covers every leg. This contract holds no funds and
;; no state.
;;
;; POST-CONDITIONS (front end)
;;
;; Deny mode on the user: one "sent <= total" per asset sold, covering
;; the market and every pool in one condition. Nothing on the bought side:
;; `min-out` is enforced here and a shortfall reverts the tx. A Jing leg
;; also pays Pyth's update fee in STX (currently 1 uSTX per feed, two
;; feeds) - budget a few uSTX above the STX total.
;;
;; VENUES (both verified on mainnet 2026-09-04)
;;
;;   u1 DLMM  router SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-2
;;            pool   .dlmm-pool-stx-sbtc-v-2-bps-15 (x = STX, y = sBTC)
;;            the v-1 pool the vault still names holds ~0.007 BTC; v-2 holds
;;            ~0.86 BTC and 1.25M STX.
;;   u2 XYK   core   SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-core-v-1-2
;;            pool   .xyk-pool-sbtc-stx-v-1-1 (~0.45 BTC, 136k STX); called
;;            direct, not via xyk-swap-helper (aggregator fee, see xyk-swap)
;;   u3 VELAR pool   SP20X3DC5R091J8B6YPQT638J8NR1W83KN6TN5BJY.univ2-pool-v1_0_0-0070
;;            fees   .univ2-fees-v1_0_0-0070, registry id 70 (wSTX/sBTC,
;;            ~0.70 BTC, 211k STX). Same call form as leo-arbitrage-faktory-v2,
;;            which trades this pool on mainnet. Velar's `wstx` is its own
;;            facade over native STX; balances are measured on the user, so
;;            which facade a venue uses does not matter here.
;;
;; The front end sizes the legs from live quotes and must toast when an
;; AMM leg crosses the sandwich breakeven (fn of active-bin liquidity,
;; attacker pays 100 bps round trip). The Jing leg has no sandwich exposure:
;; it clears at the oracle mid.
;;
;; `token-stx-v-1-2` is a SIP-010 facade over native STX: Bitflow's STX
;; proceeds land as real STX, which is why `stx-get-balance` is the right
;; measure on that side.

;; The market: markets-sbtc-stx-jing-v4 at chavita.btc's address, the same
;; deployer as jing-core-v3. v2 there (8906186) predates the bounty fixes
;; and the post-walk swap tuple this wrapper relies on, so it is never the
;; target. The stxer harness deploys v3 at exactly this id against the live
;; core, so the bytes below are the bytes that ship.
;; Two Clarity rules shape this: `contract-call?` takes a constant only when
;; it is bound to a fully qualified principal, and a call through a constant
;; cannot sit inside `define-read-only` (the analyzer cannot see the callee
;; is read-only), so the getter at the bottom spells the id out.
(define-constant JING_MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v4)
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant WSTX 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2)
(define-constant ASSET_SBTC "sbtc-token")
(define-constant ASSET_WSTX "wstx")

(define-constant DLMM_ROUTER 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-2)
(define-constant DLMM_POOL 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-2-bps-15)
(define-constant DLMM_CORE 'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1)
;; Bins the router may walk. Bitflow's own front end uses 230.
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

;; ---------------------------------------------------------------------------
;; balances

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

;; ---------------------------------------------------------------------------
;; leg 1: Jing, best effort. `some {spent, out}` = filled, where `spent` is
;; what the market kept of `amount` (less the refunded residual and rebate
;; crumbs) and `out` what it paid, mid + walk. `none` = the market said no
;; and was rolled back. `deposit-x` true sells sBTC (token-x), false STX.

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

;; XYK straight through xyk-core with the pool, no swap-helper: the helper
;; routes every call through aggregator-core, which skims a per-contract
;; fee off the input unless the caller is exempt. The pool's x may be
;; either token, so the side is read at call time.
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

;; ---------------------------------------------------------------------------
;; leg 2: one venue, normalised to {in, out}. `min-received` is the venue's
;; own minimum-received, derived by `amm-min` below. DLMM reports `in` itself (it may stop short of `amount`
;; when the bins run out inside DLMM_MAX_STEPS); XYK and Velar are all or
;; nothing, so `in` is `amount`.

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

;; Velar refuses a zero minimum; u0 from the caller means "no per-leg floor"
(define-private (amm-floor (min-received uint))
  (if (> min-received u0)
    min-received
    u1
  )
)

;; ---------------------------------------------------------------------------
;; public. One entry point per direction; see HOW A SWAP RUNS above.

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

;; planned leg + the Jing residual when this venue is the fallback
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

;; the FE's minimum for the planned size, stretched to the size that runs
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
    ;; the user signs `amount`; the split is the front end's arithmetic
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
    ;; the user signs `amount`; the split is the front end's arithmetic
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

;; ---------------------------------------------------------------------------
;; Smart. The split computed ON CHAIN at execution, so nothing can lag
;; between a quote and the tx. One number from the user: `limit-price`,
;; the worst price they accept, in the market's scale (uSTX per sat x
;; 1e10). Then:
;;
;;   Jing   `refresh-mid` pushes the VAA so Pyth holds the price `swap`
;;          will settle at; `get-taker-capacity` says how much the book
;;          fills in full at that mid inside the limit; the leg is
;;          min(amount, capacity), or nothing when that is under the
;;          market's min deposit or `vaa` is none.
;;   XYK    constant product with fee f and reserves (in, out): the
;;   Velar  largest input whose AVERAGE price still respects the limit is
;;          closed form, cap = (out * k / P - in) / k with k = 1 - f and
;;          P the floor, shaved 20 bps so rounding never trips the venue. What the book did not keep is split between the
;;          two pro rata to those capacities, each leg's minimum set to
;;          leg * P so the venue itself enforces the limit. Beyond every
;;          capacity the rest stays in the wallet (`unsold`).
;;   end    `min-out` on the wallet delta, as everywhere else.
;;
;;   DLMM   between the book and the constant-product pools: the active bin
;;          plus every bin inside the limit (see the walk below), then the
;;          leftover goes to XYK and Velar.

(define-constant PRICE_SCALE u10000000000) ;; PRICE_PRECISION * DECIMAL_FACTOR
(define-constant BPS u10000)
(define-constant CP_SAFETY u9980) ;; constant-product legs stop 20 bps short of the limit

;; k = 1 - f as num/den for the token being sold
(define-private (xyk-keep (sell-sbtc bool))
  (let ((pool (unwrap-panic (contract-call? XYK_POOL get-pool))))
    ;; the pool's x may be either token; fees are per side of the pool
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

;; reserves as {in, out} for the direction being traded
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

;; largest input whose average price respects the limit.
;; selling sats:  floor P = limit / SCALE uSTX per sat
;;   cap = (out * SCALE * num / (limit * den) - in) * den / num
;; selling uSTX:  floor P = SCALE / limit sats per uSTX
;;   cap = (out * limit * num / (SCALE * den) - in) * den / num
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
    ;; 20 bps under the exact boundary: the pool floors its output and the
    ;; XYK helper may skim an aggregator fee, either of which lands one unit
    ;; under the venue's minimum when the leg sits exactly on the limit
    (if (> top (get in r))
      (/ (* (- top (get in r)) (get den k) CP_SAFETY) (* (get num k) BPS))
      u0
    )
  )
)

;; the venue's minimum for a leg: the limit applied to the leg's size, less
;; a few units of input so the pool's own floor rounding (adjusted input,
;; then output) cannot land one unit under the minimum on a small leg
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

;; book leg size: min(amount, capacity), u0 when under min deposit or no vaa
(define-private (jing-size
    (amount uint)
    (limit uint)
    (update (optional (buff 8192)))
    (sell-sbtc bool)
  )
  (match update
    v (let (
        (mid (try! (contract-call? JING_MARKET refresh-mid v)))
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
      (ok (if (>= net min-dep)
        size
        u0
      ))
    )
    (ok u0)
  )
)

;; split `residual` between XYK and Velar pro rata to their capacities;
;; whatever exceeds both stays home
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

;; ---------------------------------------------------------------------------
;; DLMM capacity at the limit: the active bin plus every next bin whose
;; price still respects the limit, at most DLMM_WALK_BINS of them (each bin
;; is two reads, one of which pulls the core's 1001-entry factor table, so
;; the walk is capped; 30 bins x 15 bps = 4.5% of price). Per bin the
;; input that empties it is the core's own formula, fee grossed up. Selling
;; STX (x for y) walks the id DOWN, selling sBTC (y for x) walks it UP,
;; exactly as the core moves the active bin. `bin-price` is sats per uSTX
;; x 1e8; the user's limit (uSTX per sat x 1e10) becomes the threshold
;; SCALE * 1e8 / limit in that unit.

(define-constant DLMM_PRICE_SCALE u100000000) ;; core PRICE_SCALE_BPS
(define-constant DLMM_CENTER_BIN 500) ;; core CENTER_BIN_ID
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
        ;; up = selling sBTC (y) for STX (x): STX must cost at most the
        ;; threshold in sats; down = selling STX: it must fetch at least it
        (ok-price (if (get up acc)
          (<= price (get threshold acc))
          (>= price (get threshold acc))
        ))
        ;; the input that empties the bin, before fees (core's ceil)
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
        ;; the venue takes `fee` off the input before pricing the bin, so a bin
        ;; must beat the limit by the fee to pay out at the limit net: selling
        ;; sBTC (walk up, price <= threshold) the threshold shrinks by the fee,
        ;; selling STX (walk down, price >= threshold) it grows by it
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

;; ---------------------------------------------------------------------------
;; smart-swap stages. Each stage takes what is still unsold and returns the
;; same tuple shape whether it traded or not; the first line of every stage
;; is the early exit, so once an order is filled nothing downstream is read
;; or computed. `let` evaluates every binding, which is why the guard has to
;; be an `if` around the whole stage rather than around the leg alone.

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

;; DLMM: the active bin plus every bin inside the limit
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

;; XYK + Velar, split pro rata to their capacities; the excess is `unsold`
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
    (min-stx-out uint)
  )
  (begin
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (let (
        (user tx-sender)
        (stx-before (stx-get-balance user))
        ;; stage 1: the book
        (jing-amount (try! (jing-size amount limit-price update true)))
        (jing (if (> jing-amount u0)
          (jing-swap jing-amount limit-price (unwrap-panic update) true)
          none
        ))
        (jing-in (jing-spent jing))
        ;; stage 2: DLMM on what the book left; exits at once when nothing is left
        (dlmm (try! (dlmm-stage (- amount jing-in) limit-price true)))
        ;; stage 3: XYK + Velar on what DLMM left; same early exit
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
    (min-sbtc-out uint)
  )
  (begin
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (let (
        (user tx-sender)
        (sbtc-before (sbtc-balance user))
        ;; stage 1: the book
        (jing-amount (try! (jing-size amount limit-price update false)))
        (jing (if (> jing-amount u0)
          (jing-swap jing-amount limit-price (unwrap-panic update) false)
          none
        ))
        (jing-in (jing-spent jing))
        ;; stage 2: DLMM on what the book left; exits at once when nothing is left
        (dlmm (try! (dlmm-stage (- amount jing-in) limit-price false)))
        ;; stage 3: XYK + Velar on what DLMM left; same early exit
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

;; For the front end's sizing: below these the book leg is pointless. Literal
;; id on purpose: a constant is not allowed in a read-only call (see above).
(define-read-only (get-jing-min-deposits)
  (contract-call?
    'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v4
    get-min-deposits
  )
)
