;; yguazu-mm-loop-sell-sbtc-usdcx
;; One user = one vault. The deployer is the owner. Non-custodial MM loop,
;; sBTC side of the sBTC/USDCx market (mirror: yguazu-mm-loop-sell-usdcx).
;; Port of yguazu-mm-loop-sell-sbtc with USDCx (an FT) in place of STX:
;;   leg 1  sell:     vault sBTC -> allowlisted sell-sbtc rung (ask at mid + spread)
;;   claim:           vault claims rung USDCx proceeds; fill price + VWAP computed on-chain
;;   leg 2  buy-back: vault USDCx -> pegged bid on markets-sbtc-usdcx-jing-v6-4,
;;                    cap = VWAP sell * (10000 - edge-bps) / 10000
;; The keeper can only run the loop. Every outgoing asset move is bounded by an
;; as-contract? allowance to the rung (sBTC) or the market (USDCx). The only
;; STX that can leave is the oracle fee a rung-withdraw carries (max-oracle-fee).
;; Only the owner can withdraw, and only to the owner.
;;
;; Rungs: the ten deployed jing-sell-sbtc-<spread bps> rungs (rest sBTC, pay
;; USDCx), passed as a jing-rung-deposit-trait reference and checked against
;; the constant RUNGS list. No setter can change that list. get-position returns
;; a plain tuple, so it cannot be a trait member; rung-remaining reads it per
;; literal. The rung trait keeps its `stx` keys: on these rungs they carry USDCx.
;;
;; Prices use the market unit: micro-USDCx per sat x 1e10 (= USD per BTC x 1e8;
;; uUSDCx = sats * price / 1e10). Same scale as the sBTC/STX market: USDCx and
;; STX both have 6 decimals.

(define-constant ERR_NOT_OWNER (err u8101))
(define-constant ERR_NOT_AUTHORIZED (err u8102))
(define-constant ERR_NOT_PENDING_OWNER (err u8103))
(define-constant ERR_PAUSED (err u8104))
(define-constant ERR_BAD_RUNG (err u8105))
(define-constant ERR_ZERO_AMOUNT (err u8106))
(define-constant ERR_NO_INVENTORY (err u8108))
(define-constant ERR_OVER_INVENTORY (err u8109))
(define-constant ERR_BAD_SPREAD (err u8110))
(define-constant ERR_ZERO_CAP (err u8111))

(use-trait rung-trait 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-rung-deposit-trait.rung-trait)

(define-constant MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-4)
(define-constant RUNG_1 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-1)
(define-constant RUNG_10 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-10)
(define-constant RUNG_20 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-20)
(define-constant RUNG_30 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-30)
(define-constant RUNG_40 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-40)
(define-constant RUNG_50 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-50)
(define-constant RUNG_60 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-60)
(define-constant RUNG_70 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-70)
(define-constant RUNG_80 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-80)
(define-constant RUNG_90 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-90)
;; the list goes through `plain` so its type is plain principal: a list of
;; contract literals keeps the literal type, which index-of? refuses to match
(define-private (plain (p principal))
  p
)
(define-constant RUNGS (map plain
  (list RUNG_1 RUNG_10 RUNG_20 RUNG_30 RUNG_40 RUNG_50 RUNG_60 RUNG_70 RUNG_80
    RUNG_90
  )))
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant SBTC_NAME "sbtc-token")
(define-constant USDCX 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant USDCX_NAME "usdcx-token")

(define-constant BPS u10000)
;; default edge; the owner tunes it with set-edge-bps. Each resting leg pays the
;; market's 10 bps fee and receives the taker's 20 bps rebate, so fees do not
;; eat the edge.
(define-constant DEFAULT_EDGE_BPS u25)
(define-constant PRICE_SCALE u10000000000)
;; open USDCx inventory below this (1 USDCx) resets the VWAP (inventory is
;; back in sBTC)
(define-constant RESET_DUST_UUSDCX u1000000)

(define-data-var owner principal tx-sender)
(define-data-var pending-owner (optional principal) none)
(define-data-var keeper (optional principal) none)
(define-data-var paused bool false)
(define-data-var edge-bps uint DEFAULT_EDGE_BPS)
;; most uSTX a rung-withdraw may pay for the oracle update it carries (the
;; rung settles its pending order with it). The fee is 0 today; the owner
;; raises this only if the oracle starts charging.
(define-data-var max-oracle-fee uint u0)

;; Why these two: they set the most the buy-back may pay, so it never buys back
;; at a loss. Only their ratio matters: VWAP sell = inv-usdcx * PRICE_SCALE /
;; inv-sats, and buy-back-cap = VWAP sell minus the edge.
;; - claim adds the real sats sold and the real USDCx received, so several
;;   sales at different prices blend into one average.
;; - reconcile removes the same share of both as USDCx is spent, so the average
;;   of what is left stays the price it was really sold at.
;; inv-sats is bookkeeping, not sBTC held: the sats actually bought back land
;; in the vault balance (more than inv-sats closed = profit).
(define-data-var inv-usdcx uint u0)
(define-data-var inv-sats uint u0)

;; sats the vault has in each rung, not yet accounted as filled or returned
(define-map rung-principal
  principal
  uint
)

;; ---------------------------------------------------------------- reads

(define-read-only (get-owner)
  (var-get owner)
)

(define-read-only (get-pending-owner)
  (var-get pending-owner)
)

(define-read-only (get-keeper)
  (var-get keeper)
)

(define-read-only (is-allowed-rung (rung principal))
  (is-some (index-of? RUNGS rung))
)

(define-read-only (get-rung-principal (rung principal))
  (default-to u0 (map-get? rung-principal rung))
)

(define-read-only (vwap-sell)
  (if (is-eq (var-get inv-sats) u0)
    u0
    (/ (* (var-get inv-usdcx) PRICE_SCALE) (var-get inv-sats))
  )
)

(define-read-only (buy-back-cap)
  (/ (* (vwap-sell) (- BPS (var-get edge-bps))) BPS)
)

(define-read-only (usdcx-on-market)
  (+
    (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-4 get-token-y-deposit
      (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-4 get-current-cycle) current-contract
    )
    (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-4 get-token-y-parked current-contract)
    (default-to u0
      (get amount (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-4 get-token-y-pending-deposit current-contract))
    )
  )
)

(define-read-only (usdcx-open)
  (+ (usdcx-held) (usdcx-on-market))
)

(define-read-only (usdcx-held)
  (unwrap-panic (contract-call? 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx get-balance current-contract))
)

(define-read-only (sbtc-held)
  (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance current-contract))
)

(define-read-only (get-state)
  {
    owner: (var-get owner),
    keeper: (var-get keeper),
    paused: (var-get paused),
    edge-bps: (var-get edge-bps),
    max-oracle-fee: (var-get max-oracle-fee),
    inv-usdcx: (var-get inv-usdcx),
    inv-sats: (var-get inv-sats),
    vwap-sell: (vwap-sell),
    buy-back-cap: (buy-back-cap),
    usdcx-held: (usdcx-held),
    usdcx-on-market: (usdcx-on-market),
    stx-held: (stx-get-balance current-contract),
    sbtc-held: (sbtc-held),
    rungs: (map get-rung-principal RUNGS),
  }
)

;; ---------------------------------------------------------------- auth

(define-private (is-owner)
  (is-eq contract-caller (var-get owner))
)

(define-private (check-owner)
  (if (is-owner)
    (ok true)
    ERR_NOT_OWNER
  )
)

;; owner always; keeper only while not paused
(define-private (check-operator)
  (begin
    (asserts!
      (or
        (is-owner)
        (is-eq (some contract-caller) (var-get keeper))
      )
      ERR_NOT_AUTHORIZED
    )
    (if (or (is-owner) (not (var-get paused)))
      (ok true)
      ERR_PAUSED
    )
  )
)

;; ---------------------------------------------------------------- inventory

;; Shrink open USDCx inventory to what is still in the vault or on the market.
;; Spent USDCx (bid fills, owner withdraws) removes sats pro rata, so the VWAP
;; holds. Untracked extra USDCx never raises the inventory.
;; Fresh USDCx = proceeds arriving from a rung (claim, or a deposit/withdraw
;; that settles earlier fills). Spent USDCx = what left via buy-back fills or
;; withdraws. Callers run this BEFORE any rung call: once fresh USDCx lands in
;; the balance, it would hide the spent USDCx and those sats would never be
;; closed.
(define-private (reconcile-inner)
  (let (
      (have (usdcx-open))
      (usdcx (var-get inv-usdcx))
      (sats (var-get inv-sats))
    )
    (if (< have usdcx)
      (let (
          (spent (- usdcx have))
          (sats-out (/ (* sats spent) usdcx))
        )
        (if (< have RESET_DUST_UUSDCX)
          (begin
            (var-set inv-usdcx u0)
            (var-set inv-sats u0)
            (print {
              event: "yg-inventory-reset",
              usdcx-spent: spent,
              usdcx-left: have,
              sats-closed: sats,
            })
            true
          )
          (begin
            (var-set inv-usdcx have)
            (var-set inv-sats (- sats sats-out))
            (print {
              event: "yg-inventory-reduced",
              usdcx-spent: spent,
              sats-closed: sats-out,
              inv-usdcx: have,
              inv-sats: (- sats sats-out),
              vwap-sell: (vwap-sell),
            })
            true
          )
        )
      )
      true
    )
  )
)

;; A sale booked while the bid rests can lower the cap below the bid's limit.
;; The market keeps the old limit: reprice cannot reach a pending bid and only
;; queues the change on a live one. Pull the bid back to the vault, so the
;; keeper re-posts it at the new cap. A failed cancel is printed and never
;; blocks booking a real sale.
(define-private (drop-stale-buy-back)
  (let (
      (cap (buy-back-cap))
      (live (contract-call? MARKET get-token-y-limit current-contract))
      (pending (default-to u0
        (get limit (contract-call? MARKET get-token-y-pending-deposit current-contract))
      ))
      (queued (default-to u0
        (get limit (contract-call? MARKET get-token-y-pending-limit current-contract))
      ))
    )
    (if (and
        (> (usdcx-on-market) u0)
        (or (> live cap) (> pending cap) (> queued cap))
      )
      (begin
        (print {
          event: "yg-stale-buy-back-cancel",
          cap: cap,
          live: live,
          pending: pending,
          queued: queued,
          cancelled: (match (as-contract? ()
              (is-ok (contract-call? MARKET cancel-token-y-deposit USDCX USDCX_NAME))
            )
            done done
            e false
          ),
        })
        true
      )
      true
    )
  )
)

;; Book a rung interaction from balance deltas.
;; expected = rung principal before the call + sats sent in this call.
;; consumed = expected - still in rung - sBTC returned to the vault.
(define-private (book-rung
    (rung principal)
    (expected uint)
    (usdcx-in uint)
    (sbtc-back uint)
    (step (string-ascii 16))
  )
  (let (
      (left (rung-remaining rung))
      (out (+ left sbtc-back))
      (consumed (if (> expected out)
        (- expected out)
        u0
      ))
    )
    (map-set rung-principal rung left)
    (and
      (> usdcx-in u0)
      (> consumed u0)
      (begin
        (var-set inv-usdcx (+ (var-get inv-usdcx) usdcx-in))
        (var-set inv-sats (+ (var-get inv-sats) consumed))
        (drop-stale-buy-back)
      )
    )
    (print {
      event: "yg-rung-booked",
      step: step,
      rung: rung,
      usdcx-in: usdcx-in,
      sbtc-back: sbtc-back,
      sats-consumed: consumed,
      fill-price: (if (is-eq consumed u0)
        u0
        (/ (* usdcx-in PRICE_SCALE) consumed)
      ),
      rung-left: left,
      inv-usdcx: (var-get inv-usdcx),
      inv-sats: (var-get inv-sats),
      vwap-sell: (vwap-sell),
      buy-back-cap: (buy-back-cap),
    })
    consumed
  )
)

;; ---------------------------------------------------------------- rung dispatch

;; sats the vault still has in an allowlisted rung (its unfilled input).
;; A read-only may only call a contract it names literally.
(define-read-only (rung-remaining (rung principal))
  (if (is-eq rung RUNG_1)
    (get sbtc (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-1 get-position current-contract))
    (if (is-eq rung RUNG_10)
      (get sbtc (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-10 get-position current-contract))
      (if (is-eq rung RUNG_20)
        (get sbtc (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-20 get-position current-contract))
        (if (is-eq rung RUNG_30)
          (get sbtc (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-30 get-position current-contract))
          (if (is-eq rung RUNG_40)
            (get sbtc (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-40 get-position current-contract))
            (if (is-eq rung RUNG_50)
              (get sbtc (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-50 get-position current-contract))
              (if (is-eq rung RUNG_60)
                (get sbtc (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-60 get-position current-contract))
                (if (is-eq rung RUNG_70)
                  (get sbtc (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-70 get-position current-contract))
                  (if (is-eq rung RUNG_80)
                    (get sbtc (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-80 get-position current-contract))
                    (if (is-eq rung RUNG_90)
                      (get sbtc (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-sbtc-90 get-position current-contract))
                      u0
                    )
                  )
                )
              )
            )
          )
        )
      )
    )
  )
)

(define-private (rung-deposit
    (rung <rung-trait>)
    (amount uint)
  )
  (as-contract? ((with-ft SBTC SBTC_NAME amount))
    (try! (contract-call? rung deposit amount))
  )
)

(define-private (rung-claim (rung <rung-trait>))
  (as-contract? ()
    (try! (contract-call? rung claim))
  )
)

(define-private (rung-withdraw-inner
    (rung <rung-trait>)
    (amount uint)
    (update (optional (buff 8192)))
  )
  (as-contract? ((with-stx (var-get max-oracle-fee)))
    (try! (contract-call? rung withdraw amount update))
  )
)

;; ---------------------------------------------------------------- loop (keeper or owner)

(define-public (sell
    (rung <rung-trait>)
    (amount uint)
  )
  (let (
      (r (contract-of rung))
      (expected (+ (get-rung-principal r) amount))
      (usdcx0 (usdcx-held))
      (sbtc0 (sbtc-held))
    )
    (try! (check-operator))
    (asserts! (is-allowed-rung r) ERR_BAD_RUNG)
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (reconcile-inner)
    (try! (rung-deposit rung amount))
    (let (
        (usdcx-in (- (usdcx-held) usdcx0))
        (sbtc-back (- (+ (sbtc-held) amount) sbtc0))
      )
      (print {
        event: "yg-sell",
        caller: contract-caller,
        rung: r,
        amount: amount,
      })
      (book-rung r expected usdcx-in sbtc-back "sell")
      (ok amount)
    )
  )
)

(define-public (claim (rung <rung-trait>))
  (let (
      (r (contract-of rung))
      (expected (get-rung-principal r))
      (usdcx0 (usdcx-held))
      (sbtc0 (sbtc-held))
    )
    (try! (check-operator))
    (asserts! (is-allowed-rung r) ERR_BAD_RUNG)
    (reconcile-inner)
    (try! (rung-claim rung))
    (let (
        (usdcx-in (- (usdcx-held) usdcx0))
        (sbtc-back (- (sbtc-held) sbtc0))
      )
      (print {
        event: "yg-claim",
        caller: contract-caller,
        rung: r,
      })
      (ok (book-rung r expected usdcx-in sbtc-back "claim"))
    )
  )
)

;; Pegged USDCx bid: mid * (1 - spread), never above the cap. A top-up overwrites
;; the market's one limit per principal, so the cap is the VWAP of ALL open
;; inventory, and the bid total stays within that inventory.
(define-public (buy-back
    (amount uint)
    (spread-bps uint)
  )
  (begin
    (try! (check-operator))
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (asserts! (< spread-bps BPS) ERR_BAD_SPREAD)
    (reconcile-inner)
    (asserts! (> (var-get inv-sats) u0) ERR_NO_INVENTORY)
    (asserts! (<= (+ (usdcx-on-market) amount) (var-get inv-usdcx)) ERR_OVER_INVENTORY)
    (let ((cap (buy-back-cap)))
      (asserts! (> cap u0) ERR_ZERO_CAP)
      (try! (as-contract? ((with-ft USDCX USDCX_NAME amount))
        (try! (contract-call? MARKET deposit-token-y amount cap (some spread-bps) USDCX
          USDCX_NAME
        ))
      ))
      (print {
        event: "yg-buy-back",
        caller: contract-caller,
        amount: amount,
        spread-bps: spread-bps,
        cap: cap,
        vwap-sell: (vwap-sell),
        inv-usdcx: (var-get inv-usdcx),
        inv-sats: (var-get inv-sats),
      })
      (ok cap)
    )
  )
)

(define-public (reprice (spread-bps uint))
  (begin
    (try! (check-operator))
    (asserts! (< spread-bps BPS) ERR_BAD_SPREAD)
    (reconcile-inner)
    (asserts! (> (var-get inv-sats) u0) ERR_NO_INVENTORY)
    (let ((cap (buy-back-cap)))
      (asserts! (> cap u0) ERR_ZERO_CAP)
      (let ((live (try! (as-contract? ()
          (try! (contract-call? MARKET set-token-y-limit cap (some spread-bps)))
        ))))
        (print {
          event: "yg-reprice",
          caller: contract-caller,
          spread-bps: spread-bps,
          cap: cap,
          applied-now: live,
          vwap-sell: (vwap-sell),
        })
        (ok cap)
      )
    )
  )
)

(define-public (reconcile)
  (begin
    (try! (check-operator))
    (reconcile-inner)
    (ok (get-state))
  )
)

;; ---------------------------------------------------------------- exits (rung-withdraw, cancel-buy-back: keeper or owner; the rest: owner only)

(define-public (rung-withdraw
    (rung <rung-trait>)
    (amount uint)
    (update (optional (buff 8192)))
  )
  (let (
      (r (contract-of rung))
      (expected (get-rung-principal r))
      (usdcx0 (usdcx-held))
      (sbtc0 (sbtc-held))
    )
    (try! (check-operator))
    (asserts! (is-allowed-rung r) ERR_BAD_RUNG)
    (reconcile-inner)
    (try! (rung-withdraw-inner rung amount update))
    (let (
        (usdcx-in (- (usdcx-held) usdcx0))
        (sbtc-back (- (sbtc-held) sbtc0))
      )
      (print {
        event: "yg-rung-withdraw",
        rung: r,
        amount: amount,
      })
      (ok (book-rung r expected usdcx-in sbtc-back "rung-withdraw"))
    )
  )
)

(define-public (cancel-buy-back)
  (begin
    (try! (check-operator))
    (let ((back (try! (as-contract? ()
        (try! (contract-call? MARKET cancel-token-y-deposit USDCX USDCX_NAME))
      ))))
      (print {
        event: "yg-cancel-buy-back",
        usdcx-back: back,
      })
      (ok back)
    )
  )
)

(define-public (withdraw-usdcx (amount uint))
  (let ((to (var-get owner)))
    (try! (check-owner))
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (try! (as-contract? ((with-ft USDCX USDCX_NAME amount))
      (try! (contract-call? USDCX transfer amount current-contract to none))
    ))
    (reconcile-inner)
    (print {
      event: "yg-withdraw-usdcx",
      to: to,
      amount: amount,
    })
    (ok amount)
  )
)


(define-public (withdraw-sbtc (amount uint))
  (let ((to (var-get owner)))
    (try! (check-owner))
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (try! (as-contract? ((with-ft SBTC SBTC_NAME amount))
      (try! (contract-call? SBTC transfer amount current-contract to none))
    ))
    (print {
      event: "yg-withdraw-sbtc",
      to: to,
      amount: amount,
    })
    (ok amount)
  )
)

(define-public (set-keeper (who (optional principal)))
  (begin
    (try! (check-owner))
    (var-set keeper who)
    (print {
      event: "yg-set-keeper",
      keeper: who,
    })
    (ok true)
  )
)

(define-public (set-paused (p bool))
  (begin
    (try! (check-owner))
    (var-set paused p)
    (print {
      event: "yg-set-paused",
      paused: p,
    })
    (ok true)
  )
)

(define-public (set-edge-bps (bps uint))
  (begin
    (try! (check-owner))
    (asserts! (< bps BPS) ERR_BAD_SPREAD)
    (var-set edge-bps bps)
    (print {
      event: "yg-set-edge-bps",
      bps: bps,
    })
    (ok true)
  )
)


(define-public (set-max-oracle-fee (fee uint))
  (begin
    (try! (check-owner))
    (var-set max-oracle-fee fee)
    (print {
      event: "yg-set-max-oracle-fee",
      fee: fee,
    })
    (ok true)
  )
)

;; STX the owner sent for oracle fees
(define-public (withdraw-stx (amount uint))
  (let ((to (var-get owner)))
    (try! (check-owner))
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (try! (as-contract? ((with-stx amount))
      (try! (stx-transfer? amount current-contract to))
    ))
    (print {
      event: "yg-withdraw-stx",
      to: to,
      amount: amount,
    })
    (ok amount)
  )
)

(define-public (propose-owner (who (optional principal)))
  (begin
    (try! (check-owner))
    (var-set pending-owner who)
    (print {
      event: "yg-propose-owner",
      pending-owner: who,
    })
    (ok true)
  )
)

(define-public (accept-owner)
  (let ((who contract-caller))
    (asserts! (is-eq (some who) (var-get pending-owner)) ERR_NOT_PENDING_OWNER)
    (var-set owner who)
    (var-set pending-owner none)
    (print {
      event: "yg-accept-owner",
      owner: who,
    })
    (ok true)
  )
)
