;; title: swap-router-sbtc-stx-jing
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
;;          short fill itself with its own error (DLMM u2003, XYK u6009,
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
;;   u2 XYK   helper SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-swap-helper-v-1-3
;;            pool   .xyk-pool-sbtc-stx-v-1-1 (~0.45 BTC, 136k STX)
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

;; The market: markets-sbtc-stx-jing-v3 at chavita.btc's address, the same
;; deployer as jing-core-v3. v2 there (8906186) predates the bounty fixes
;; and the post-walk swap tuple this wrapper relies on, so it is never the
;; target. The stxer harness deploys v3 at exactly this id against the live
;; core, so the bytes below are the bytes that ship.
;; Two Clarity rules shape this: `contract-call?` takes a constant only when
;; it is bound to a fully qualified principal, and a call through a constant
;; cannot sit inside `define-read-only` (the analyzer cannot see the callee
;; is read-only), so the getter at the bottom spells the id out.
(define-constant JING_MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v3)
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant WSTX 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2)
(define-constant ASSET_SBTC "sbtc-token")
(define-constant ASSET_WSTX "wstx")

(define-constant DLMM_ROUTER 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-2)
(define-constant DLMM_POOL 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-2-bps-15)
;; Bins the router may walk. Bitflow's own front end uses 230.
(define-constant DLMM_MAX_STEPS u230)

(define-constant XYK_HELPER 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-swap-helper-v-1-3)
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
    (vaa (buff 8192))
    (deposit-x bool)
  )
  (match (contract-call? JING_MARKET swap amount limit-price vaa SBTC ASSET_SBTC WSTX
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
        out: (try! (contract-call? XYK_HELPER swap-helper-a amount min-received none {
          a: SBTC,
          b: WSTX,
        } { a: XYK_POOL }
        )),
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
        out: (try! (contract-call? XYK_HELPER swap-helper-a amount min-received none {
          a: WSTX,
          b: SBTC,
        } { a: XYK_POOL }
        )),
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
    (vaa (optional (buff 8192)))
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
          (jing-swap jing-amount limit-price (unwrap! vaa ERR_VAA_REQUIRED) true)
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
    (vaa (optional (buff 8192)))
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
          (jing-swap jing-amount limit-price (unwrap! vaa ERR_VAA_REQUIRED) false)
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

;; For the front end's sizing: below these the book leg is pointless. Literal
;; id on purpose: a constant is not allowed in a read-only call (see above).
(define-read-only (get-jing-min-deposits)
  (contract-call?
    'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v3
    get-min-deposits
  )
)
