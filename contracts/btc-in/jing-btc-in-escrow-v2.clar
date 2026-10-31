;; jing-btc-in-escrow-v2
;;
;; v2: the mid is no longer a keeper argument. execute reads it from the
;; market's refresh-mid on the same update, which checks the Pyth signature
;; and the 80 s window, so slippage-bps is trustless.
;;
;; Walk-away BTC-in flow with the price supplied at execution. The user
;; pre-signs one sponsored `arm-*` tx; when the sBTC mints, the keeper
;; broadcasts it. The arm pays the sponsor's fee in sats and parks the net
;; sBTC here as an order with the user's limit and min-out. The keeper then
;; calls `execute` with a fresh Lazer update, so the signed tx never carries
;; a print that can go stale (the market's 80 s window).
;;
;; Funds only ever go to the order's user (swap output, unsold sats, refunds)
;; or, for the fee at arm time, to fee-recipient. The keeper picks only which
;; signed Lazer update to pass; the mid comes from it on-chain, and the user's
;; slippage-bps and min-out bound the fill.

(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant ASSET_SBTC "sbtc-token")
(define-constant USDCX 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant ASSET_USDCX "usdcx-token")
(define-constant ROUTER_STX 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-stx-jing-v5-5)
(define-constant ROUTER_USDCX 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-usdcx-jing-v5-5)
;; The markets the routers settle on: their refresh-mid verifies the update and
;; returns the mid in the routers' price units.
(define-constant MARKET_STX 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-4)
(define-constant MARKET_USDCX 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-4)

;; Upper bound on cancel-after-blocks, so the owner cannot lock new orders
;; for long (about 1 h at the current ~10 s Stacks block cadence).
(define-constant MAX_CANCEL_AFTER_BLOCKS u360)
(define-constant BPS u10000)

;; Hard ceiling on max-fee-sats, so even the owner cannot set a large fee cap.
(define-constant MAX_FEE_SATS u10000)

(define-constant ERR_NOT_OWNER (err u4200))
(define-constant ERR_FEE_TOO_HIGH (err u4201))
(define-constant ERR_FEE_GE_AMOUNT (err u4202))
(define-constant ERR_PAUSED (err u4203))
(define-constant ERR_NOT_KEEPER (err u4204))
(define-constant ERR_NO_ORDER (err u4205))
(define-constant ERR_TOO_EARLY (err u4206))
(define-constant ERR_BAD_SLIPPAGE (err u4207))
(define-constant ERR_BAD_TIMEOUT (err u4208))
(define-constant ERR_ALLOWANCE (err u4209))
(define-constant ERR_OVERSPENT (err u4210))

(define-data-var owner principal tx-sender)
(define-data-var pending-owner (optional principal) none)
(define-data-var fee-recipient principal tx-sender)
;; Ceiling on the sats a signed arm may route to fee-recipient.
(define-data-var max-fee-sats uint u5000)
(define-data-var paused bool false)
;; Blocks after arming before anyone may cancel (refund to the user).
;; u30 = about 5 min: mainnet averaged 8.8-11.2 s per Stacks block over the
;; last 330 blocks before 2026-10-30 (shorter in fast-block stretches).
;; Snapshotted per order at arm time, so a later change never moves an
;; existing order's deadline.
(define-data-var cancel-after-blocks uint u30)
(define-data-var last-id uint u0)

(define-map keepers
  principal
  bool
)

(define-map orders
  uint
  {
    user: principal,
    router: principal,
    net: uint,
    slippage-bps: uint,
    min-out: uint,
    cancel-height: uint,
  }
)

;; --- internal ---

(define-private (arm
    (router principal)
    (amount uint)
    (fee-sats uint)
    (slippage-bps uint)
    (min-out uint)
  )
  (begin
    (asserts! (not (var-get paused)) ERR_PAUSED)
    (asserts! (<= fee-sats (var-get max-fee-sats)) ERR_FEE_TOO_HIGH)
    (asserts! (< fee-sats amount) ERR_FEE_GE_AMOUNT)
    (asserts! (< slippage-bps BPS) ERR_BAD_SLIPPAGE)
    (let (
        (net (- amount fee-sats))
        (id (+ (var-get last-id) u1))
        (order {
          user: tx-sender,
          router: router,
          net: net,
          slippage-bps: slippage-bps,
          min-out: min-out,
          cancel-height: (+ stacks-block-height (var-get cancel-after-blocks)),
        })
      )
      (if (> fee-sats u0)
        (try! (contract-call? SBTC transfer fee-sats tx-sender (var-get fee-recipient)
          none
        ))
        true
      )
      (try! (contract-call? SBTC transfer net tx-sender current-contract none))
      (map-set orders id order)
      (var-set last-id id)
      (print (merge order {
        event: "btc-in-armed",
        id: id,
        amount: amount,
        fee-sats: fee-sats,
      }))
      (ok id)
    )
  )
)

;; Sends `amount` of sBTC held here to `to`. Skipped at 0.
(define-private (pay-sbtc
    (amount uint)
    (to principal)
  )
  (if (> amount u0)
    (ok (unwrap!
      (as-contract? ((with-ft SBTC ASSET_SBTC amount))
        (try! (contract-call? SBTC transfer amount current-contract to none))
      )
      ERR_ALLOWANCE
    ))
    (ok true)
  )
)

(define-private (sbtc-held)
  (unwrap-panic (contract-call? SBTC get-balance current-contract))
)

;; --- user entry points (presigned, keeper-sponsored) ---

;; Parks net sBTC for an sBTC -> STX swap on the Jing sBTC/STX router.
;; slippage-bps (0-9999) becomes the real-time limit at execute, from the
;; verified mid: limit = mid * (10000 - slippage-bps) / 10000. min-out is an
;; optional absolute floor on what the user receives (0 = none).
(define-public (arm-swap-sbtc-for-stx
    (amount uint)
    (fee-sats uint)
    (slippage-bps uint)
    (min-stx-out uint)
  )
  (arm ROUTER_STX amount fee-sats slippage-bps min-stx-out)
)

;; Parks net sBTC for an sBTC -> USDCx swap on the Jing sBTC/USDCx router.
(define-public (arm-swap-sbtc-for-usdcx
    (amount uint)
    (fee-sats uint)
    (slippage-bps uint)
    (min-usdcx-out uint)
  )
  (arm ROUTER_USDCX amount fee-sats slippage-bps min-usdcx-out)
)

;; --- keeper ---

;; Runs the order's swap with a fresh Lazer update. On ok the full output and
;; any unsold sats go to the user; on a router err the swap is rolled back and
;; the net goes back to the user. Either way the order is gone. A runtime
;; abort reverts the whole tx and leaves the order armed. A fake or stale
;; update fails refresh-mid: the tx errs and the order stays armed.
(define-public (execute
    (id uint)
    (update (buff 8192))
  )
  (let ((order (unwrap! (map-get? orders id) ERR_NO_ORDER)))
    (asserts! (default-to false (map-get? keepers contract-caller))
      ERR_NOT_KEEPER
    )
    (asserts! (not (var-get paused)) ERR_PAUSED)
    (let (
        (user (get user order))
        (net (get net order))
        (to-stx (is-eq (get router order) ROUTER_STX))
        ;; verified mid from the same update the swap will use
        (mid (try! (if to-stx
          (contract-call? MARKET_STX refresh-mid update)
          (contract-call? MARKET_USDCX refresh-mid update)
        )))
        ;; real-time floor price for selling sats
        (limit-price (/ (* mid (- BPS (get slippage-bps order))) BPS))
        (held-before (sbtc-held))
        ;; Allowance: the router's sBTC outflows from here are counted GROSS.
        ;; On a book fill the market refunds rolled / rebate sats to us and
        ;; the router re-sells them on the pools, so the gross can exceed net
        ;; (at most 2 * net: the refund is a part of the book leg). The hard
        ;; bound on what leaves for good is the held-before / held-after check.
        (result (unwrap!
          (as-contract? ((with-ft SBTC ASSET_SBTC (* u2 net)))
            (if to-stx
              (match (contract-call? ROUTER_STX smart-swap-sbtc-for-stx net limit-price
                (some update) mid (get min-out order)
              )
                r {
                  out: (get out r),
                  code: u0,
                }
                e {
                  out: u0,
                  code: e,
                }
              )
              (match (contract-call? ROUTER_USDCX smart-swap-sbtc-for-usdcx net
                limit-price (some update) mid (get min-out order)
              )
                r {
                  out: (get out r),
                  code: u0,
                }
                e {
                  out: u0,
                  code: e,
                }
              )
            ))
          ERR_ALLOWANCE
        ))
        (held-after (sbtc-held))
        (spent (if (> held-before held-after)
          (- held-before held-after)
          u0
        ))
        (filled (is-eq (get code result) u0))
        (out (get out result))
      )
      ;; never let the swap eat other orders' sats
      (asserts! (<= spent net) ERR_OVERSPENT)
      (if (and filled (> out u0))
        (if to-stx
          (unwrap!
            (as-contract? ((with-stx out))
              (try! (stx-transfer? out current-contract user))
            )
            ERR_ALLOWANCE
          )
          (unwrap!
            (as-contract? ((with-ft USDCX ASSET_USDCX out))
              (try! (contract-call? USDCX transfer out current-contract user none))
            )
            ERR_ALLOWANCE
          )
        )
        true
      )
      ;; unsold sats on a fill, the whole net on a router err (spent is 0)
      (try! (pay-sbtc (- net spent) user))
      (map-delete orders id)
      (print {
        event: "btc-in-executed",
        id: id,
        user: user,
        router: (get router order),
        net: net,
        mid: mid,
        limit-price: limit-price,
        ok: filled,
        code: (get code result),
        spent: spent,
        out: out,
        refund: (- net spent),
      })
      (ok {
        ok: filled,
        code: (get code result),
        spent: spent,
        out: out,
        refund: (- net spent),
      })
    )
  )
)

;; --- anyone, after the timeout ---

;; Refunds the net to the order's user once cancel-height is reached. Open to
;; anyone so a user who walked away is refunded without signing again; the
;; caller can only ever send the sats to the user. Works while paused.
(define-public (cancel (id uint))
  (let ((order (unwrap! (map-get? orders id) ERR_NO_ORDER)))
    (asserts! (>= stacks-block-height (get cancel-height order)) ERR_TOO_EARLY)
    (try! (pay-sbtc (get net order) (get user order)))
    (map-delete orders id)
    (print {
      event: "btc-in-cancelled",
      id: id,
      user: (get user order),
      router: (get router order),
      net: (get net order),
      caller: tx-sender,
    })
    (ok (get net order))
  )
)

;; --- owner ---

(define-read-only (is-owner)
  (is-eq contract-caller (var-get owner))
)

(define-public (propose-owner (new-owner principal))
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (ok (var-set pending-owner (some new-owner)))
  )
)

;; The proposed owner calls this itself, so a mistyped address never takes over.
(define-public (accept-owner)
  (begin
    (asserts! (is-eq (some contract-caller) (var-get pending-owner))
      ERR_NOT_OWNER
    )
    (var-set owner contract-caller)
    (ok (var-set pending-owner none))
  )
)

(define-public (set-fee-recipient (recipient principal))
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (ok (var-set fee-recipient recipient))
  )
)

(define-public (set-max-fee-sats (sats uint))
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (asserts! (<= sats MAX_FEE_SATS) ERR_FEE_TOO_HIGH)
    (ok (var-set max-fee-sats sats))
  )
)

(define-public (set-paused (on bool))
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (ok (var-set paused on))
  )
)

(define-public (set-keeper
    (keeper principal)
    (on bool)
  )
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (ok (map-set keepers keeper on))
  )
)

(define-public (set-cancel-after-blocks (blocks uint))
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (asserts! (and (> blocks u0) (<= blocks MAX_CANCEL_AFTER_BLOCKS))
      ERR_BAD_TIMEOUT
    )
    (ok (var-set cancel-after-blocks blocks))
  )
)

;; --- read-only ---

(define-read-only (get-order (id uint))
  (map-get? orders id)
)

(define-read-only (is-keeper (who principal))
  (default-to false (map-get? keepers who))
)

(define-read-only (get-config)
  {
    owner: (var-get owner),
    pending-owner: (var-get pending-owner),
    fee-recipient: (var-get fee-recipient),
    max-fee-sats: (var-get max-fee-sats),
    paused: (var-get paused),
    cancel-after-blocks: (var-get cancel-after-blocks),
    last-id: (var-get last-id),
  }
)
