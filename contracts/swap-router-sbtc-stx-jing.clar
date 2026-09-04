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
;;   end    the user's balance of the bought asset must have grown by at
;;          least `min-out`, or the whole tx reverts. Per-leg minimums are
;;          u1 on purpose: the single check at the end is the real guard.
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

;; The market. Local reference so clarinet resolves it; the deploy copy
;; names the mainnet id of the REDEPLOYED market (the copy at 8906186
;; predates the bounty fixes).
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

(define-private (gain (before uint) (after uint))
  (if (> after before) (- after before) u0)
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
  (match (contract-call? .markets-sbtc-stx-jing-v2 swap amount limit-price vaa
      SBTC ASSET_SBTC WSTX ASSET_WSTX deposit-x
    )
    res (some {
      spent: (- amount
        (if deposit-x (get token-x-rolled res) (get token-y-rolled res))
        (get rebate-refunded res)
      ),
      out: (if deposit-x (get token-y-received res) (get token-x-received res)),
    })
    e none
  )
)

(define-private (jing-spent (r (optional { spent: uint, out: uint })))
  (match r v (get spent v) u0)
)

(define-private (jing-out (r (optional { spent: uint, out: uint })))
  (match r v (get out v) u0)
)

;; ---------------------------------------------------------------------------
;; leg 2: Bitflow. Per-leg minimum is u1; the caller checks the total.

(define-private (amm-sell-sbtc (amount uint) (venue uint))
  (if (is-eq venue VENUE_DLMM)
    (begin
      (try! (contract-call? DLMM_ROUTER swap-y-for-x-simple-range-multi
        DLMM_POOL WSTX SBTC amount u1 DLMM_MAX_STEPS none
      ))
      (ok true)
    )
    (if (is-eq venue VENUE_XYK)
      (begin
        (try! (contract-call? XYK_HELPER swap-helper-a amount u1 none
          { a: SBTC, b: WSTX } { a: XYK_POOL }
        ))
        (ok true)
      )
      (begin
        (try! (contract-call? VELAR_POOL swap SBTC VELAR_WSTX VELAR_FEES amount u1))
        (ok true)
      )
    )
  )
)

(define-private (amm-sell-stx (amount uint) (venue uint))
  (if (is-eq venue VENUE_DLMM)
    (begin
      (try! (contract-call? DLMM_ROUTER swap-x-for-y-simple-range-multi
        DLMM_POOL WSTX SBTC amount u1 DLMM_MAX_STEPS none
      ))
      (ok true)
    )
    (if (is-eq venue VENUE_XYK)
      (begin
        (try! (contract-call? XYK_HELPER swap-helper-a amount u1 none
          { a: WSTX, b: SBTC } { a: XYK_POOL }
        ))
        (ok true)
      )
      (begin
        (try! (contract-call? VELAR_POOL swap VELAR_WSTX SBTC VELAR_FEES amount u1))
        (ok true)
      )
    )
  )
)

;; ---------------------------------------------------------------------------
;; public

;; Sell `amount` sats for STX. `jing-amount` (<= amount, u0 to skip the
;; book) tries Jing first at `limit-price` (market scale: uSTX per sat
;; x 1e10, the same number a maker would rest at). `venue` takes the rest.
(define-public (swap-sbtc-for-stx
    (amount uint)
    (jing-amount uint)
    (limit-price uint)
    (vaa (buff 8192))
    (venue uint)
    (min-stx-out uint)
  )
  (let (
      (user tx-sender)
      (stx-before (stx-get-balance user))
    )
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (asserts! (<= jing-amount amount) ERR_JING_AMOUNT)
    (asserts! (or (is-eq venue VENUE_DLMM) (is-eq venue VENUE_XYK) (is-eq venue VENUE_VELAR))
      ERR_BAD_VENUE
    )
    (let (
        (jing (if (> jing-amount u0) (jing-swap jing-amount limit-price vaa true) none))
        ;; what the market actually kept: jing-amount less the refunded
        ;; residual and rebate crumbs, u0 when skipped or rolled back
        (jing-in (jing-spent jing))
        (amm-in (- amount jing-in))
      )
      (and (> amm-in u0) (try! (amm-sell-sbtc amm-in venue)))
      (let ((out (gain stx-before (stx-get-balance user))))
        (asserts! (>= out min-stx-out) ERR_MIN_OUT)
        (print {
          topic: "swap-sbtc-for-stx", user: user, amount: amount,
          jing-ok: (is-some jing), jing-in: jing-in, jing-out: (jing-out jing),
          amm-in: amm-in, venue: venue, out: out,
        })
        (ok {
          jing-ok: (is-some jing), jing-in: jing-in, jing-out: (jing-out jing),
          amm-in: amm-in, out: out,
        })
      )
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
    (min-sbtc-out uint)
  )
  (let (
      (user tx-sender)
      (sbtc-before (sbtc-balance user))
    )
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (asserts! (<= jing-amount amount) ERR_JING_AMOUNT)
    (asserts! (or (is-eq venue VENUE_DLMM) (is-eq venue VENUE_XYK) (is-eq venue VENUE_VELAR))
      ERR_BAD_VENUE
    )
    (let (
        (jing (if (> jing-amount u0) (jing-swap jing-amount limit-price vaa false) none))
        (jing-in (jing-spent jing))
        (amm-in (- amount jing-in))
      )
      (and (> amm-in u0) (try! (amm-sell-stx amm-in venue)))
      (let ((out (gain sbtc-before (sbtc-balance user))))
        (asserts! (>= out min-sbtc-out) ERR_MIN_OUT)
        (print {
          topic: "swap-stx-for-sbtc", user: user, amount: amount,
          jing-ok: (is-some jing), jing-in: jing-in, jing-out: (jing-out jing),
          amm-in: amm-in, venue: venue, out: out,
        })
        (ok {
          jing-ok: (is-some jing), jing-in: jing-in, jing-out: (jing-out jing),
          amm-in: amm-in, out: out,
        })
      )
    )
  )
)

;; For the front end's split: below these the book leg is pointless.
(define-read-only (get-jing-min-deposits)
  (contract-call? .markets-sbtc-stx-jing-v2 get-min-deposits)
)
