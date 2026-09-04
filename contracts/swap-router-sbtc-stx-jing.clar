;; title: swap-router-sbtc-stx-jing
;; DRAFT - uncommitted. Retail swap wrapper for the sBTC/STX pair:
;; Jing's maker/taker book first, Bitflow for whatever is left. One tx,
;; the user ends 100% filled at or above their minimum, or nothing moves.
;;
;; HOW A SWAP RUNS
;;
;;   leg 1  Jing `swap` (taker, fill-or-kill) for `jing-amount`, best effort.
;;          The front end sizes `jing-amount` to what the book can absorb
;;          (in-range size at the mid plus the walkable out-of-range makers
;;          inside `limit-price`). If the market cannot fill it, it returns
;;          an err; the wrapper catches that and moves on. Clarity rolls the
;;          failed call back, so nothing has moved, including the Pyth fee.
;;   leg 2  whatever the market did not keep goes to the chosen Bitflow
;;          venue: the whole amount when leg 1 was skipped or failed,
;;          `amount - jing-amount` when the split was planned, plus the dust
;;          the market refunds when the walk cannot place the last few units
;;          (below the side's min deposit, see markets README note 8) and
;;          the unspent rebate crumbs. The market's `swap` returns all of
;;          that post-walk: `token-*-rolled` is the refunded residual,
;;          `rebate-refunded` the crumbs, `token-*-received` mid + walk.
;;          DLMM's router may stop short: it returns `in` < amount when it
;;          runs out of bins inside `max-steps`, and never pulls the rest.
;;          That is allowed (Rapha: a partial fill beats a revert); the
;;          tuple reports `amm-in` as what was really sold and `unsold` as
;;          what stayed in the wallet. XYK and Velar are all or nothing.
;;          The AMM leg carries its own `min-amm-out`, from
;;          the front end's venue quote: the book leg is guarded by
;;          `limit-price`, the AMM leg by this, each on its own. The venue
;;          refuses a short fill itself with its own error (DLMM u2003, XYK
;;          u6009, Velar u107). A zero `min-amm-out` is floored to u1 since
;;          Velar refuses a zero minimum.
;;   end    the user's balance of the bought asset must have grown by at
;;          least `min-out`, or the whole tx reverts (`u3004`): the total
;;          backstop across both legs.
;;
;; WHO HOLDS THE FUNDS
;;
;; Nobody but the user. The wrapper is called WITHOUT as-contract, so
;; tx-sender stays the user through both legs: the market and the pool pull
;; from the user and pay the user. The Jing leg is sized from the market's
;; return tuple; the final `min-out` guard is measured on the user's
;; balance so it covers both legs. This contract holds no funds and no
;; state.
;;
;; POST-CONDITIONS (front end)
;;
;; Deny mode on the user: one "sent <= amount" per asset sold, covering
;; both the market and the pool in one condition. Nothing on the bought
;; side: `min-out` is enforced here and a shortfall reverts the tx.
;; Selling STX also pays Pyth's update fee (currently 1 uSTX per feed, two
;; feeds) when leg 1 refreshes the oracle - budget a few uSTX above `amount`.
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
;; The front end picks the venue from live quotes and must toast when the
;; Bitflow leg crosses the sandwich breakeven (fn of active-bin liquidity,
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
(define-constant ERR_JING_AMOUNT (err u3002))
(define-constant ERR_BAD_VENUE (err u3003))
(define-constant ERR_MIN_OUT (err u3004))

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
(define-private (amm-floor (min-amm-out uint))
  (if (> min-amm-out u0)
    min-amm-out
    u1
  )
)

;; ---------------------------------------------------------------------------
;; public

;; Sell `amount` sats for STX. `jing-amount` (<= amount, u0 to skip the
;; book) tries Jing first at `limit-price` (market scale: uSTX per sat
;; x 1e10, the same number a maker would rest at). `venue` takes the rest
;; and must pay at least `min-amm-stx-out` for it; `min-stx-out` is the
;; floor on the whole trade.
(define-public (swap-sbtc-for-stx
    (amount uint)
    (jing-amount uint)
    (limit-price uint)
    (vaa (buff 8192))
    (venue uint)
    (min-amm-stx-out uint)
    (min-stx-out uint)
  )
  (begin
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (asserts! (<= jing-amount amount) ERR_JING_AMOUNT)
    (asserts!
      (or
        (is-eq venue VENUE_DLMM)
        (is-eq venue VENUE_XYK)
        (is-eq venue VENUE_VELAR)
      )
      ERR_BAD_VENUE
    )
    (let (
        (user tx-sender)
        (stx-before (stx-get-balance user))
        (jing (if (> jing-amount u0)
          (jing-swap jing-amount limit-price vaa true)
          none
        ))
        ;; what the market actually kept: jing-amount less the refunded
        ;; residual and rebate crumbs, u0 when skipped or rolled back
        (jing-in (jing-spent jing))
        (jing-got (jing-out jing))
        (amm-in (- amount jing-in))
        (amm (if (> amm-in u0)
          (try! (amm-sell-sbtc amm-in (amm-floor min-amm-stx-out) venue))
          {
            in: u0,
            out: u0,
          }
        ))
        (out (gain stx-before (stx-get-balance user)))
      )
      (asserts! (>= out min-stx-out) ERR_MIN_OUT)
      (print {
        topic: "swap-sbtc-for-stx",
        user: user,
        amount: amount,
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: jing-got,
        amm-in: (get in amm),
        amm-out: (get out amm),
        unsold: (- amm-in (get in amm)),
        venue: venue,
        out: out,
      })
      (ok {
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: jing-got,
        amm-in: (get in amm),
        amm-out: (get out amm),
        unsold: (- amm-in (get in amm)),
        out: out,
      })
    )
  )
)

;; Sell `amount` uSTX for sBTC. Same shape. Pyth's update fee (a few uSTX)
;; leaves the user's wallet on leg 1 but is not part of `amount`: the
;; market's tuple counts only the deposit, so `amm-in` is exact and the
;; user must hold `amount` plus the fee.
(define-public (swap-stx-for-sbtc
    (amount uint)
    (jing-amount uint)
    (limit-price uint)
    (vaa (buff 8192))
    (venue uint)
    (min-amm-sbtc-out uint)
    (min-sbtc-out uint)
  )
  (begin
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (asserts! (<= jing-amount amount) ERR_JING_AMOUNT)
    (asserts!
      (or
        (is-eq venue VENUE_DLMM)
        (is-eq venue VENUE_XYK)
        (is-eq venue VENUE_VELAR)
      )
      ERR_BAD_VENUE
    )
    (let (
        (user tx-sender)
        (sbtc-before (sbtc-balance user))
        (jing (if (> jing-amount u0)
          (jing-swap jing-amount limit-price vaa false)
          none
        ))
        (jing-in (jing-spent jing))
        (jing-got (jing-out jing))
        (amm-in (- amount jing-in))
        (amm (if (> amm-in u0)
          (try! (amm-sell-stx amm-in (amm-floor min-amm-sbtc-out) venue))
          {
            in: u0,
            out: u0,
          }
        ))
        (out (gain sbtc-before (sbtc-balance user)))
      )
      (asserts! (>= out min-sbtc-out) ERR_MIN_OUT)
      (print {
        topic: "swap-stx-for-sbtc",
        user: user,
        amount: amount,
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: jing-got,
        amm-in: (get in amm),
        amm-out: (get out amm),
        unsold: (- amm-in (get in amm)),
        venue: venue,
        out: out,
      })
      (ok {
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: jing-got,
        amm-in: (get in amm),
        amm-out: (get out amm),
        unsold: (- amm-in (get in amm)),
        out: out,
      })
    )
  )
)

;; ---------------------------------------------------------------------------
;; Split. The front end computes the split off-chain from live quotes (book
;; depth on the opposite side at the mid plus walkable makers, then each
;; AMM's marginal price) and hands the contract one amount per venue; the
;; contract executes the four legs and reports each one, it never reroutes.
;; Jing runs first, best effort, as in the single-venue swaps: what the
;; book did not keep (skipped, rolled back, dust refund) stays in the
;; wallet. Then DLMM, XYK, Velar, each with its own minimum, each skipped
;; when its amount is u0; a DLMM shortfall stays in the wallet too. Both
;; are reported as `unsold` next to the per-leg `in`s. `min-out` guards
;; the total. With `jing-amount` u0 the market is never called, so `vaa`
;; can be the empty buffer 0x: no Pyth fee, no Hermes round trip.

(define-constant ERR_ZERO_SPLIT (err u3005))

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

(define-public (swap-sbtc-for-stx-split
    (jing-amount uint)
    (limit-price uint)
    (vaa (buff 8192))
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
    (asserts!
      (>
        (+ jing-amount (get dlmm amm-amounts) (get xyk amm-amounts)
          (get velar amm-amounts)
        )
        u0
      )
      ERR_ZERO_SPLIT
    )
    (let (
        (user tx-sender)
        (stx-before (stx-get-balance user))
        (jing (if (> jing-amount u0)
          (jing-swap jing-amount limit-price vaa true)
          none
        ))
        (jing-in (jing-spent jing))
        (dlmm (try! (leg-sbtc (get dlmm amm-amounts) (get dlmm amm-mins) VENUE_DLMM)))
        (xyk (try! (leg-sbtc (get xyk amm-amounts) (get xyk amm-mins) VENUE_XYK)))
        (velar (try! (leg-sbtc (get velar amm-amounts) (get velar amm-mins) VENUE_VELAR)))
        (out (gain stx-before (stx-get-balance user)))
      )
      (asserts! (>= out min-stx-out) ERR_MIN_OUT)
      (print {
        topic: "swap-sbtc-for-stx-split",
        user: user,
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: (jing-out jing),
        dlmm-in: (get in dlmm),
        dlmm-out: (get out dlmm),
        xyk-in: (get in xyk),
        xyk-out: (get out xyk),
        velar-in: (get in velar),
        velar-out: (get out velar),
        unsold: (+ (- jing-amount jing-in) (- (get dlmm amm-amounts) (get in dlmm))),
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
        unsold: (+ (- jing-amount jing-in) (- (get dlmm amm-amounts) (get in dlmm))),
        out: out,
      })
    )
  )
)

(define-public (swap-stx-for-sbtc-split
    (jing-amount uint)
    (limit-price uint)
    (vaa (buff 8192))
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
    (asserts!
      (>
        (+ jing-amount (get dlmm amm-amounts) (get xyk amm-amounts)
          (get velar amm-amounts)
        )
        u0
      )
      ERR_ZERO_SPLIT
    )
    (let (
        (user tx-sender)
        (sbtc-before (sbtc-balance user))
        (jing (if (> jing-amount u0)
          (jing-swap jing-amount limit-price vaa false)
          none
        ))
        (jing-in (jing-spent jing))
        (dlmm (try! (leg-stx (get dlmm amm-amounts) (get dlmm amm-mins) VENUE_DLMM)))
        (xyk (try! (leg-stx (get xyk amm-amounts) (get xyk amm-mins) VENUE_XYK)))
        (velar (try! (leg-stx (get velar amm-amounts) (get velar amm-mins) VENUE_VELAR)))
        (out (gain sbtc-before (sbtc-balance user)))
      )
      (asserts! (>= out min-sbtc-out) ERR_MIN_OUT)
      (print {
        topic: "swap-stx-for-sbtc-split",
        user: user,
        jing-ok: (is-some jing),
        jing-in: jing-in,
        jing-out: (jing-out jing),
        dlmm-in: (get in dlmm),
        dlmm-out: (get out dlmm),
        xyk-in: (get in xyk),
        xyk-out: (get out xyk),
        velar-in: (get in velar),
        velar-out: (get out velar),
        unsold: (+ (- jing-amount jing-in) (- (get dlmm amm-amounts) (get in dlmm))),
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
        unsold: (+ (- jing-amount jing-in) (- (get dlmm amm-amounts) (get in dlmm))),
        out: out,
      })
    )
  )
)

;; ---------------------------------------------------------------------------
;; AMM only. Same venue helpers and guards, no book leg, so no VAA, no
;; limit price and no Pyth fee: the front end uses these when the book has
;; nothing for the trade (below min deposit, no makers in range) or the
;; user picked a venue outright. `jing-amount u0` on the swaps above does
;; the same thing but still carries the VAA.

(define-public (amm-swap-sbtc-for-stx
    (amount uint)
    (venue uint)
    (min-stx-out uint)
  )
  (begin
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (asserts!
      (or
        (is-eq venue VENUE_DLMM)
        (is-eq venue VENUE_XYK)
        (is-eq venue VENUE_VELAR)
      )
      ERR_BAD_VENUE
    )
    (let (
        (user tx-sender)
        (stx-before (stx-get-balance user))
        (amm (try! (amm-sell-sbtc amount (amm-floor min-stx-out) venue)))
        (out (gain stx-before (stx-get-balance user)))
      )
      (asserts! (>= out min-stx-out) ERR_MIN_OUT)
      (print {
        topic: "amm-swap-sbtc-for-stx",
        user: user,
        amount: amount,
        venue: venue,
        amm-in: (get in amm),
        amm-out: (get out amm),
        unsold: (- amount (get in amm)),
        out: out,
      })
      (ok {
        amm-in: (get in amm),
        amm-out: (get out amm),
        unsold: (- amount (get in amm)),
        out: out,
      })
    )
  )
)

(define-public (amm-swap-stx-for-sbtc
    (amount uint)
    (venue uint)
    (min-sbtc-out uint)
  )
  (begin
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (asserts!
      (or
        (is-eq venue VENUE_DLMM)
        (is-eq venue VENUE_XYK)
        (is-eq venue VENUE_VELAR)
      )
      ERR_BAD_VENUE
    )
    (let (
        (user tx-sender)
        (sbtc-before (sbtc-balance user))
        (amm (try! (amm-sell-stx amount (amm-floor min-sbtc-out) venue)))
        (out (gain sbtc-before (sbtc-balance user)))
      )
      (asserts! (>= out min-sbtc-out) ERR_MIN_OUT)
      (print {
        topic: "amm-swap-stx-for-sbtc",
        user: user,
        amount: amount,
        venue: venue,
        amm-in: (get in amm),
        amm-out: (get out amm),
        unsold: (- amount (get in amm)),
        out: out,
      })
      (ok {
        amm-in: (get in amm),
        amm-out: (get out amm),
        unsold: (- amount (get in amm)),
        out: out,
      })
    )
  )
)

;; For the front end's split: below these the book leg is pointless. Literal
;; id on purpose: a constant is not allowed in a read-only call (see above).
(define-read-only (get-jing-min-deposits)
  (contract-call?
    'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v3
    get-min-deposits
  )
)
