;; yguazu-mm-loop-jing
;; One user = one vault. The deployer is the owner. Non-custodial MM loop:
;;   leg 1  sell:     vault sBTC -> allowlisted tight buy-stx rung (ask at mid + spread)
;;   claim:           vault claims rung STX proceeds; fill price + VWAP computed on-chain
;;   leg 2  buy-back: vault STX -> pegged bid on markets-sbtc-stx-jing-v6-4,
;;                    cap = VWAP sell * (10000 - MIN_EDGE_BPS) / 10000
;; The keeper can only run the loop. Every outgoing asset move is bounded by an
;; as-contract? allowance to the rung (sBTC) or the market (STX). Only the owner
;; can withdraw, and only to the owner.
;;
;; Prices use the market unit: uSTX per sat x 1e10 (uSTX = sats * price / 1e10).

(define-constant ERR_NOT_OWNER (err u8101))
(define-constant ERR_NOT_AUTHORIZED (err u8102))
(define-constant ERR_NOT_PENDING_OWNER (err u8103))
(define-constant ERR_PAUSED (err u8104))
(define-constant ERR_BAD_RUNG (err u8105))
(define-constant ERR_ZERO_AMOUNT (err u8106))
(define-constant ERR_OVER_SIZE_CAP (err u8107))
(define-constant ERR_NO_INVENTORY (err u8108))
(define-constant ERR_OVER_INVENTORY (err u8109))
(define-constant ERR_BAD_SPREAD (err u8110))
(define-constant ERR_ZERO_CAP (err u8111))

(define-constant MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-4)
(define-constant RUNG_1 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-buy-stx-1)
(define-constant RUNG_10 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-buy-stx-10)
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant SBTC_NAME "sbtc-token")
(define-constant WSTX 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2)
(define-constant WSTX_NAME "wstx")

(define-constant BPS u10000)
(define-constant MIN_EDGE_BPS u10)
(define-constant PRICE_SCALE u10000000000)
;; open STX inventory below this resets the VWAP (inventory is back in sBTC)
(define-constant RESET_DUST_USTX u1000000)

(define-data-var owner principal tx-sender)
(define-data-var pending-owner (optional principal) none)
(define-data-var keeper (optional principal) none)
(define-data-var paused bool false)
(define-data-var max-sell-sats uint u5000000)

;; open STX inventory: STX received from rung fills not yet bought back,
;; and the sats sold to get it. VWAP sell = inv-stx * PRICE_SCALE / inv-sats.
(define-data-var inv-stx uint u0)
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
  (or (is-eq rung RUNG_1) (is-eq rung RUNG_10))
)

(define-read-only (get-rung-principal (rung principal))
  (default-to u0 (map-get? rung-principal rung))
)

(define-read-only (vwap-sell)
  (if (is-eq (var-get inv-sats) u0)
    u0
    (/ (* (var-get inv-stx) PRICE_SCALE) (var-get inv-sats))
  )
)

(define-read-only (buy-back-cap)
  (/ (* (vwap-sell) (- BPS MIN_EDGE_BPS)) BPS)
)

(define-read-only (stx-on-market)
  (+
    (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-4 get-token-y-deposit
      (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-4 get-current-cycle) current-contract
    )
    (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-4 get-token-y-parked current-contract)
    (default-to u0
      (get amount (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-4 get-token-y-pending-deposit current-contract))
    )
  )
)

(define-read-only (stx-open)
  (+ (stx-get-balance current-contract) (stx-on-market))
)

(define-read-only (sbtc-held)
  (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance current-contract))
)

(define-read-only (get-state)
  {
    owner: (var-get owner),
    keeper: (var-get keeper),
    paused: (var-get paused),
    max-sell-sats: (var-get max-sell-sats),
    inv-stx: (var-get inv-stx),
    inv-sats: (var-get inv-sats),
    vwap-sell: (vwap-sell),
    buy-back-cap: (buy-back-cap),
    stx-held: (stx-get-balance current-contract),
    stx-on-market: (stx-on-market),
    sbtc-held: (sbtc-held),
    rung-1: (get-rung-principal RUNG_1),
    rung-10: (get-rung-principal RUNG_10),
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

;; Shrink open STX inventory to what is still in the vault or on the market.
;; Spent STX (bid fills, owner withdraws) removes sats pro rata, so the VWAP
;; holds. Untracked extra STX never raises the inventory.
(define-private (reconcile-inner)
  (let (
      (have (stx-open))
      (stx (var-get inv-stx))
      (sats (var-get inv-sats))
    )
    (if (< have stx)
      (let (
          (spent (- stx have))
          (sats-out (/ (* sats spent) stx))
        )
        (if (< have RESET_DUST_USTX)
          (begin
            (var-set inv-stx u0)
            (var-set inv-sats u0)
            (print {
              event: "yg-inventory-reset",
              stx-spent: spent,
              stx-left: have,
              sats-closed: sats,
            })
            true
          )
          (begin
            (var-set inv-stx have)
            (var-set inv-sats (- sats sats-out))
            (print {
              event: "yg-inventory-reduced",
              stx-spent: spent,
              sats-closed: sats-out,
              inv-stx: have,
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

;; Book a rung interaction from balance deltas.
;; expected = rung principal before the call + sats sent in this call.
;; consumed = expected - still in rung - sBTC returned to the vault.
(define-private (book-rung
    (rung principal)
    (expected uint)
    (stx-in uint)
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
      (or (> stx-in u0) (> consumed u0))
      (begin
        (var-set inv-stx (+ (var-get inv-stx) stx-in))
        (var-set inv-sats (+ (var-get inv-sats) consumed))
        true
      )
    )
    (print {
      event: "yg-rung-booked",
      step: step,
      rung: rung,
      stx-in: stx-in,
      sbtc-back: sbtc-back,
      sats-consumed: consumed,
      fill-price: (if (is-eq consumed u0)
        u0
        (/ (* stx-in PRICE_SCALE) consumed)
      ),
      rung-left: left,
      inv-stx: (var-get inv-stx),
      inv-sats: (var-get inv-sats),
      vwap-sell: (vwap-sell),
      buy-back-cap: (buy-back-cap),
    })
    consumed
  )
)

;; ---------------------------------------------------------------- rung dispatch

(define-private (rung-remaining (rung principal))
  (if (is-eq rung RUNG_1)
    (get sbtc (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-buy-stx-1 get-position current-contract))
    (get sbtc (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-buy-stx-10 get-position current-contract))
  )
)

(define-private (rung-deposit
    (rung principal)
    (amount uint)
  )
  (if (is-eq rung RUNG_1)
    (as-contract? ((with-ft SBTC SBTC_NAME amount))
      (try! (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-buy-stx-1 deposit amount))
    )
    (as-contract? ((with-ft SBTC SBTC_NAME amount))
      (try! (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-buy-stx-10 deposit amount))
    )
  )
)

(define-private (rung-claim (rung principal))
  (if (is-eq rung RUNG_1)
    (as-contract? ()
      (try! (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-buy-stx-1 claim))
    )
    (as-contract? ()
      (try! (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-buy-stx-10 claim))
    )
  )
)

(define-private (rung-withdraw-inner
    (rung principal)
    (amount uint)
    (update (optional (buff 8192)))
  )
  (if (is-eq rung RUNG_1)
    (as-contract? ()
      (try! (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-buy-stx-1 withdraw amount update))
    )
    (as-contract? ()
      (try! (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-buy-stx-10 withdraw amount update))
    )
  )
)

;; ---------------------------------------------------------------- loop (keeper or owner)

(define-public (sell
    (rung principal)
    (amount uint)
  )
  (let (
      (expected (+ (get-rung-principal rung) amount))
      (stx0 (stx-get-balance current-contract))
      (sbtc0 (sbtc-held))
    )
    (try! (check-operator))
    (asserts! (is-allowed-rung rung) ERR_BAD_RUNG)
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (asserts! (<= amount (var-get max-sell-sats)) ERR_OVER_SIZE_CAP)
    (reconcile-inner)
    (try! (rung-deposit rung amount))
    (let (
        (stx-in (- (stx-get-balance current-contract) stx0))
        (sbtc-back (- (+ (sbtc-held) amount) sbtc0))
      )
      (print {
        event: "yg-sell",
        caller: contract-caller,
        rung: rung,
        amount: amount,
      })
      (book-rung rung expected stx-in sbtc-back "sell")
      (ok amount)
    )
  )
)

(define-public (claim (rung principal))
  (let (
      (expected (get-rung-principal rung))
      (stx0 (stx-get-balance current-contract))
      (sbtc0 (sbtc-held))
    )
    (try! (check-operator))
    (asserts! (is-allowed-rung rung) ERR_BAD_RUNG)
    (reconcile-inner)
    (try! (rung-claim rung))
    (let (
        (stx-in (- (stx-get-balance current-contract) stx0))
        (sbtc-back (- (sbtc-held) sbtc0))
      )
      (print {
        event: "yg-claim",
        caller: contract-caller,
        rung: rung,
      })
      (ok (book-rung rung expected stx-in sbtc-back "claim"))
    )
  )
)

;; Pegged STX bid: mid * (1 - spread), never above the cap. A top-up overwrites
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
    (asserts! (<= (+ (stx-on-market) amount) (var-get inv-stx)) ERR_OVER_INVENTORY)
    (let ((cap (buy-back-cap)))
      (asserts! (> cap u0) ERR_ZERO_CAP)
      (try! (as-contract? ((with-stx amount))
        (try! (contract-call? MARKET deposit-token-y amount cap (some spread-bps) WSTX
          WSTX_NAME
        ))
      ))
      (print {
        event: "yg-buy-back",
        caller: contract-caller,
        amount: amount,
        spread-bps: spread-bps,
        cap: cap,
        vwap-sell: (vwap-sell),
        inv-stx: (var-get inv-stx),
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
    (let (
        (cap (buy-back-cap))
        (live (try! (begin
          (asserts! (> cap u0) ERR_ZERO_CAP)
          (as-contract? ()
            (try! (contract-call? MARKET set-token-y-limit cap (some spread-bps)))
          )
        )))
      )
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

(define-public (reconcile)
  (begin
    (try! (check-operator))
    (reconcile-inner)
    (ok (get-state))
  )
)

;; ---------------------------------------------------------------- owner only

(define-public (rung-withdraw
    (rung principal)
    (amount uint)
    (update (optional (buff 8192)))
  )
  (let (
      (expected (get-rung-principal rung))
      (stx0 (stx-get-balance current-contract))
      (sbtc0 (sbtc-held))
    )
    (try! (check-owner))
    (asserts! (is-allowed-rung rung) ERR_BAD_RUNG)
    (reconcile-inner)
    (try! (rung-withdraw-inner rung amount update))
    (let (
        (stx-in (- (stx-get-balance current-contract) stx0))
        (sbtc-back (- (sbtc-held) sbtc0))
      )
      (print {
        event: "yg-rung-withdraw",
        rung: rung,
        amount: amount,
      })
      (ok (book-rung rung expected stx-in sbtc-back "rung-withdraw"))
    )
  )
)

(define-public (cancel-buy-back)
  (begin
    (try! (check-owner))
    (let ((back (try! (as-contract? ()
        (try! (contract-call? MARKET cancel-token-y-deposit WSTX WSTX_NAME))
      ))))
      (print {
        event: "yg-cancel-buy-back",
        stx-back: back,
      })
      (ok back)
    )
  )
)

(define-public (withdraw-stx (amount uint))
  (let ((to (var-get owner)))
    (try! (check-owner))
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (try! (as-contract? ((with-stx amount))
      (try! (stx-transfer? amount current-contract to))
    ))
    (reconcile-inner)
    (print {
      event: "yg-withdraw-stx",
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

(define-public (set-max-sell-sats (amount uint))
  (begin
    (try! (check-owner))
    (var-set max-sell-sats amount)
    (print {
      event: "yg-set-max-sell-sats",
      amount: amount,
    })
    (ok true)
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
