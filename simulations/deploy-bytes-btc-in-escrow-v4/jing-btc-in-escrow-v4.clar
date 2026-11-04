(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant SBTC_REGISTRY 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-registry)
(define-constant ASSET_SBTC "sbtc-token")
(define-constant USDCX 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant ASSET_USDCX "usdcx-token")
(define-constant ROUTER_STX 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-stx-jing-v5-5)
(define-constant ROUTER_USDCX 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-usdcx-jing-v5-5)
(define-constant MARKET_STX 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-4)
(define-constant MARKET_USDCX 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-4)

(define-constant MAX_CANCEL_AFTER_BLOCKS u360)
(define-constant MAX_LAZER_FEE_USTX u1000000)
(define-constant BPS u10000)

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
(define-constant ERR_EXPIRED (err u4211))
(define-constant ERR_SWEEP_PARKED (err u4212))
(define-constant ERR_ARM_LATE (err u4213))
(define-constant ERR_LAZER_FEE_TOO_HIGH (err u4214))
(define-constant ERR_NO_DEPOSIT (err u4215))
(define-constant ERR_NOT_RECIPIENT (err u4216))
(define-constant ERR_DEPOSIT_USED (err u4217))

(define-constant STATUS_OPEN u0)
(define-constant STATUS_EXECUTED u1)
(define-constant STATUS_CANCELLED u2)

(define-data-var owner principal tx-sender)
(define-data-var pending-owner (optional principal) none)
(define-data-var fee-recipient principal tx-sender)
(define-data-var max-fee-sats uint u5000)
(define-data-var paused bool false)
(define-data-var cancel-after-blocks uint u30)
(define-data-var parked uint u0)
(define-data-var lazer-fee-ustx uint u0)

(define-map keepers
  principal
  bool
)

(define-map orders
  {
    txid: (buff 32),
    vout: uint,
  }
  {
    status: uint,
    user: principal,
    router: principal,
    net: uint,
    slippage-bps: uint,
    min-out: uint,
    cancel-height: uint,
  }
)

(define-private (arm
    (router principal)
    (txid (buff 32))
    (vout uint)
    (fee-sats uint)
    (slippage-bps uint)
    (min-out uint)
    (arm-by uint)
  )
  (let (
      (deposit (unwrap! (contract-call? SBTC_REGISTRY get-completed-deposit txid vout)
        ERR_NO_DEPOSIT
      ))
      (amount (get amount deposit))
    )
    (asserts! (is-eq (get recipient deposit) tx-sender) ERR_NOT_RECIPIENT)
    (asserts! (< stacks-block-height arm-by) ERR_ARM_LATE)
    (asserts! (not (var-get paused)) ERR_PAUSED)
    (asserts! (<= fee-sats (var-get max-fee-sats)) ERR_FEE_TOO_HIGH)
    (asserts! (< fee-sats amount) ERR_FEE_GE_AMOUNT)
    (asserts! (< slippage-bps BPS) ERR_BAD_SLIPPAGE)
    (let (
        (net (- amount fee-sats))
        (key {
          txid: txid,
          vout: vout,
        })
        (order {
          status: STATUS_OPEN,
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
      (asserts! (map-insert orders key order) ERR_DEPOSIT_USED)
      (try! (contract-call? SBTC transfer net tx-sender current-contract none))
      (var-set parked (+ (var-get parked) net))
      (print (merge order {
        event: "btc-in-armed",
        amount: amount,
        fee-sats: fee-sats,
        txid: txid,
        vout: vout,
      }))
      (ok net)
    )
  )
)

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

(define-public (arm-swap-sbtc-for-stx
    (txid (buff 32))
    (vout uint)
    (fee-sats uint)
    (slippage-bps uint)
    (min-stx-out uint)
    (arm-by uint)
  )
  (arm ROUTER_STX txid vout fee-sats slippage-bps min-stx-out arm-by)
)

(define-public (arm-swap-sbtc-for-usdcx
    (txid (buff 32))
    (vout uint)
    (fee-sats uint)
    (slippage-bps uint)
    (min-usdcx-out uint)
    (arm-by uint)
  )
  (arm ROUTER_USDCX txid vout fee-sats slippage-bps min-usdcx-out arm-by)
)

(define-public (execute
    (txid (buff 32))
    (vout uint)
    (update (buff 8192))
  )
  (let (
      (key {
        txid: txid,
        vout: vout,
      })
      (order (unwrap! (map-get? orders key) ERR_NO_ORDER))
    )
    (asserts! (is-eq (get status order) STATUS_OPEN) ERR_NO_ORDER)
    (asserts! (default-to false (map-get? keepers contract-caller))
      ERR_NOT_KEEPER
    )
    (asserts! (not (var-get paused)) ERR_PAUSED)
    (asserts! (< stacks-block-height (get cancel-height order)) ERR_EXPIRED)
    (let (
        (user (get user order))
        (net (get net order))
        (to-stx (is-eq (get router order) ROUTER_STX))
        (mid (try! (if to-stx
          (contract-call? MARKET_STX refresh-mid update)
          (contract-call? MARKET_USDCX refresh-mid update)
        )))
        (limit-price (/ (* mid (- BPS (get slippage-bps order))) BPS))
        (lazer-fee (var-get lazer-fee-ustx))
        (fronted (if (> lazer-fee u0)
          (try! (stx-transfer? lazer-fee tx-sender current-contract))
          true
        ))
        (held-before (sbtc-held))
        (result (unwrap!
          (as-contract?
            (
              (with-ft SBTC ASSET_SBTC (* u2 net))
              (with-stx lazer-fee)
            )
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
      (try! (pay-sbtc (- net spent) user))
      (map-set orders key (merge order { status: STATUS_EXECUTED }))
      (var-set parked (- (var-get parked) net))
      (print {
        event: "btc-in-executed",
        txid: txid,
        vout: vout,
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

(define-public (cancel
    (txid (buff 32))
    (vout uint)
  )
  (let (
      (key {
        txid: txid,
        vout: vout,
      })
      (order (unwrap! (map-get? orders key) ERR_NO_ORDER))
    )
    (asserts! (is-eq (get status order) STATUS_OPEN) ERR_NO_ORDER)
    (asserts! (>= stacks-block-height (get cancel-height order)) ERR_TOO_EARLY)
    (try! (pay-sbtc (get net order) (get user order)))
    (map-set orders key (merge order { status: STATUS_CANCELLED }))
    (var-set parked (- (var-get parked) (get net order)))
    (print {
      event: "btc-in-cancelled",
      txid: txid,
      vout: vout,
      user: (get user order),
      router: (get router order),
      net: (get net order),
      caller: tx-sender,
    })
    (ok (get net order))
  )
)

(define-read-only (is-owner)
  (is-eq contract-caller (var-get owner))
)

(define-public (propose-owner (new-owner principal))
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (print {
      event: "btc-in-owner-proposed",
      new-owner: new-owner,
    })
    (ok (var-set pending-owner (some new-owner)))
  )
)

(define-public (accept-owner)
  (begin
    (asserts! (is-eq (some contract-caller) (var-get pending-owner))
      ERR_NOT_OWNER
    )
    (print {
      event: "btc-in-owner-accepted",
      old-owner: (var-get owner),
      new-owner: contract-caller,
    })
    (var-set owner contract-caller)
    (ok (var-set pending-owner none))
  )
)

(define-public (set-fee-recipient (recipient principal))
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (print {
      event: "btc-in-fee-recipient-set",
      recipient: recipient,
    })
    (ok (var-set fee-recipient recipient))
  )
)

(define-public (set-max-fee-sats (sats uint))
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (asserts! (<= sats MAX_FEE_SATS) ERR_FEE_TOO_HIGH)
    (print {
      event: "btc-in-max-fee-sats-set",
      sats: sats,
    })
    (ok (var-set max-fee-sats sats))
  )
)

(define-public (set-paused (on bool))
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (print {
      event: "btc-in-paused-set",
      on: on,
    })
    (ok (var-set paused on))
  )
)

(define-public (set-keeper
    (keeper principal)
    (on bool)
  )
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (print {
      event: "btc-in-keeper-set",
      keeper: keeper,
      on: on,
    })
    (ok (map-set keepers keeper on))
  )
)

(define-public (sweep-sbtc
    (amount uint)
    (to principal)
  )
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (asserts! (<= (+ amount (var-get parked)) (sbtc-held)) ERR_SWEEP_PARKED)
    (print {
      event: "btc-in-swept",
      asset: "sbtc",
      amount: amount,
      to: to,
    })
    (pay-sbtc amount to)
  )
)

(define-public (sweep-stx
    (amount uint)
    (to principal)
  )
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (unwrap!
      (as-contract? ((with-stx amount))
        (try! (stx-transfer? amount current-contract to))
      )
      ERR_ALLOWANCE
    )
    (print {
      event: "btc-in-swept",
      asset: "stx",
      amount: amount,
      to: to,
    })
    (ok true)
  )
)

(define-public (sweep-usdcx
    (amount uint)
    (to principal)
  )
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (unwrap!
      (as-contract? ((with-ft USDCX ASSET_USDCX amount))
        (try! (contract-call? USDCX transfer amount current-contract to none))
      )
      ERR_ALLOWANCE
    )
    (print {
      event: "btc-in-swept",
      asset: "usdcx",
      amount: amount,
      to: to,
    })
    (ok true)
  )
)

(define-public (set-lazer-fee-ustx (ustx uint))
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (asserts! (<= ustx MAX_LAZER_FEE_USTX) ERR_LAZER_FEE_TOO_HIGH)
    (print {
      event: "btc-in-lazer-fee-set",
      ustx: ustx,
    })
    (ok (var-set lazer-fee-ustx ustx))
  )
)

(define-public (set-cancel-after-blocks (blocks uint))
  (begin
    (asserts! (is-owner) ERR_NOT_OWNER)
    (asserts! (and (> blocks u0) (<= blocks MAX_CANCEL_AFTER_BLOCKS))
      ERR_BAD_TIMEOUT
    )
    (print {
      event: "btc-in-cancel-after-blocks-set",
      blocks: blocks,
    })
    (ok (var-set cancel-after-blocks blocks))
  )
)

(define-read-only (get-order
    (txid (buff 32))
    (vout uint)
  )
  (map-get? orders {
    txid: txid,
    vout: vout,
  })
)

(define-read-only (get-parked)
  (var-get parked)
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
    lazer-fee-ustx: (var-get lazer-fee-ustx),
  }
)
