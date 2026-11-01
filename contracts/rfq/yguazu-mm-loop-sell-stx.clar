(define-constant ERR_NOT_OWNER (err u8201))
(define-constant ERR_NOT_AUTHORIZED (err u8202))
(define-constant ERR_NOT_PENDING_OWNER (err u8203))
(define-constant ERR_PAUSED (err u8204))
(define-constant ERR_BAD_RUNG (err u8205))
(define-constant ERR_ZERO_AMOUNT (err u8206))
(define-constant ERR_NO_INVENTORY (err u8208))
(define-constant ERR_OVER_INVENTORY (err u8209))
(define-constant ERR_BAD_SPREAD (err u8210))
(define-constant ERR_ZERO_FLOOR (err u8211))

(use-trait rung-trait 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-rung-deposit-trait.rung-trait)

(define-constant MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-4)
(define-constant RUNG_1 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-1)
(define-constant RUNG_10 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-10)
(define-constant RUNG_20 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-20)
(define-constant RUNG_30 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-30)
(define-constant RUNG_40 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-40)
(define-constant RUNG_50 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-50)
(define-constant RUNG_60 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-60)
(define-constant RUNG_70 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-70)
(define-constant RUNG_80 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-80)
(define-constant RUNG_90 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-90)
(define-private (plain (p principal))
  p
)
(define-constant RUNGS (map plain
  (list
    RUNG_1 RUNG_10 RUNG_20 RUNG_30 RUNG_40 RUNG_50 RUNG_60 RUNG_70
    RUNG_80 RUNG_90
  )))
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant SBTC_NAME "sbtc-token")

(define-constant BPS u10000)
(define-constant DEFAULT_EDGE_BPS u25)
(define-constant PRICE_SCALE u10000000000)
(define-constant RESET_DUST_SATS u1000)

(define-data-var owner principal tx-sender)
(define-data-var pending-owner (optional principal) none)
(define-data-var keeper (optional principal) none)
(define-data-var paused bool false)
(define-data-var edge-bps uint DEFAULT_EDGE_BPS)
(define-data-var max-oracle-fee uint u0)

(define-data-var inv-sats uint u0)
(define-data-var inv-stx uint u0)

(define-map rung-principal
  principal
  uint
)

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
    (/ (* (var-get inv-stx) PRICE_SCALE) (var-get inv-sats))
  )
)

(define-read-only (buy-back-floor)
  (let ((den (* (var-get inv-sats) BPS)))
    (if (is-eq den u0)
      u0
      (/
        (+ (* (* (var-get inv-stx) PRICE_SCALE) (+ BPS (var-get edge-bps)))
          (- den u1)
        )
        den
      )
    )
  )
)

(define-read-only (sats-on-market)
  (+
    (contract-call?
      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-4
      get-token-x-deposit
      (contract-call?
        'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-4
        get-current-cycle
      )
      current-contract
    )
    (contract-call?
      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-4
      get-token-x-parked current-contract
    )
    (default-to u0
      (get amount
        (contract-call?
          'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-4
          get-token-x-pending-deposit current-contract
        ))
    ))
)

(define-read-only (sats-open)
  (+ (sbtc-held) (sats-on-market))
)

(define-read-only (sbtc-held)
  (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
    get-balance current-contract
  ))
)

(define-read-only (get-state)
  {
    owner: (var-get owner),
    keeper: (var-get keeper),
    paused: (var-get paused),
    edge-bps: (var-get edge-bps),
    max-oracle-fee: (var-get max-oracle-fee),
    inv-sats: (var-get inv-sats),
    inv-stx: (var-get inv-stx),
    vwap-sell: (vwap-sell),
    buy-back-floor: (buy-back-floor),
    sbtc-held: (sbtc-held),
    sats-on-market: (sats-on-market),
    stx-held: (stx-get-balance current-contract),
    rungs: (map get-rung-principal RUNGS),
  }
)

(define-private (is-owner)
  (is-eq contract-caller (var-get owner))
)

(define-private (check-owner)
  (if (is-owner)
    (ok true)
    ERR_NOT_OWNER
  )
)

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

(define-private (reconcile-inner)
  (let (
      (have (sats-open))
      (sats (var-get inv-sats))
      (stx (var-get inv-stx))
    )
    (if (< have sats)
      (let (
          (spent (- sats have))
          (stx-out (/ (* stx spent) sats))
        )
        (if (< have RESET_DUST_SATS)
          (begin
            (var-set inv-sats u0)
            (var-set inv-stx u0)
            (print {
              event: "yg-inventory-reset",
              sats-spent: spent,
              sats-left: have,
              stx-closed: stx,
            })
            true
          )
          (begin
            (var-set inv-sats have)
            (var-set inv-stx (- stx stx-out))
            (print {
              event: "yg-inventory-reduced",
              sats-spent: spent,
              stx-closed: stx-out,
              inv-sats: have,
              inv-stx: (- stx stx-out),
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

(define-private (below-floor
    (limit uint)
    (floor uint)
  )
  (and (> limit u0) (< limit floor))
)

(define-private (drop-stale-buy-back)
  (let (
      (floor (buy-back-floor))
      (live (contract-call? MARKET get-token-x-limit current-contract))
      (pending (default-to u0
        (get limit
          (contract-call? MARKET get-token-x-pending-deposit current-contract)
        )))
      (queued (default-to u0
        (get limit
          (contract-call? MARKET get-token-x-pending-limit current-contract)
        )))
    )
    (if (and
        (> (sats-on-market) u0)
        (or
          (below-floor live floor)
          (below-floor pending floor)
          (below-floor queued floor)
        )
      )
      (begin
        (print {
          event: "yg-stale-buy-back-cancel",
          floor: floor,
          live: live,
          pending: pending,
          queued: queued,
          cancelled: (match (as-contract? ()
            (is-ok (contract-call? MARKET cancel-token-x-deposit SBTC SBTC_NAME))
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

(define-private (book-rung
    (rung principal)
    (expected uint)
    (sbtc-in uint)
    (stx-back uint)
    (step (string-ascii 16))
  )
  (let (
      (left (rung-remaining rung))
      (out (+ left stx-back))
      (consumed (if (> expected out)
        (- expected out)
        u0
      ))
    )
    (map-set rung-principal rung left)
    (and
      (> sbtc-in u0)
      (> consumed u0)
      (begin
        (var-set inv-sats (+ (var-get inv-sats) sbtc-in))
        (var-set inv-stx (+ (var-get inv-stx) consumed))
        (drop-stale-buy-back)
      )
    )
    (print {
      event: "yg-rung-booked",
      step: step,
      rung: rung,
      sbtc-in: sbtc-in,
      stx-back: stx-back,
      stx-consumed: consumed,
      fill-price: (if (is-eq sbtc-in u0)
        u0
        (/ (* consumed PRICE_SCALE) sbtc-in)
      ),
      rung-left: left,
      inv-sats: (var-get inv-sats),
      inv-stx: (var-get inv-stx),
      vwap-sell: (vwap-sell),
      buy-back-floor: (buy-back-floor),
    })
    consumed
  )
)

(define-read-only (rung-remaining (rung principal))
  (if (is-eq rung RUNG_1)
    (get stx
      (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-1
        get-position current-contract
      ))
    (if (is-eq rung RUNG_10)
      (get stx
        (contract-call?
          'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-10
          get-position current-contract
        ))
      (if (is-eq rung RUNG_20)
        (get stx
          (contract-call?
            'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-20
            get-position current-contract
          ))
        (if (is-eq rung RUNG_30)
          (get stx
            (contract-call?
              'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-30
              get-position current-contract
            ))
          (if (is-eq rung RUNG_40)
            (get stx
              (contract-call?
                'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-40
                get-position current-contract
              ))
            (if (is-eq rung RUNG_50)
              (get stx
                (contract-call?
                  'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-50
                  get-position current-contract
                ))
              (if (is-eq rung RUNG_60)
                (get stx
                  (contract-call?
                    'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-60
                    get-position current-contract
                  ))
                (if (is-eq rung RUNG_70)
                  (get stx
                    (contract-call?
                      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-70
                      get-position current-contract
                    ))
                  (if (is-eq rung RUNG_80)
                    (get stx
                      (contract-call?
                        'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-80
                        get-position current-contract
                      ))
                    (if (is-eq rung RUNG_90)
                      (get stx
                        (contract-call?
                          'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-sell-stx-90
                          get-position current-contract
                        ))
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
  (as-contract? ((with-stx amount)) (try! (contract-call? rung deposit amount)))
)

(define-private (rung-claim (rung <rung-trait>))
  (as-contract? () (try! (contract-call? rung claim)))
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

(define-public (sell
    (rung <rung-trait>)
    (amount uint)
  )
  (let (
      (r (contract-of rung))
      (expected (+ (get-rung-principal r) amount))
      (sbtc0 (sbtc-held))
      (stx0 (stx-get-balance current-contract))
    )
    (try! (check-operator))
    (asserts! (is-allowed-rung r) ERR_BAD_RUNG)
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (reconcile-inner)
    (try! (rung-deposit rung amount))
    (let (
        (sbtc-in (- (sbtc-held) sbtc0))
        (stx-back (- (+ (stx-get-balance current-contract) amount) stx0))
      )
      (print {
        event: "yg-sell",
        caller: contract-caller,
        rung: r,
        amount: amount,
      })
      (book-rung r expected sbtc-in stx-back "sell")
      (ok amount)
    )
  )
)

(define-public (claim (rung <rung-trait>))
  (let (
      (r (contract-of rung))
      (expected (get-rung-principal r))
      (sbtc0 (sbtc-held))
      (stx0 (stx-get-balance current-contract))
    )
    (try! (check-operator))
    (asserts! (is-allowed-rung r) ERR_BAD_RUNG)
    (reconcile-inner)
    (try! (rung-claim rung))
    (let (
        (sbtc-in (- (sbtc-held) sbtc0))
        (stx-back (- (stx-get-balance current-contract) stx0))
      )
      (print {
        event: "yg-claim",
        caller: contract-caller,
        rung: r,
      })
      (ok (book-rung r expected sbtc-in stx-back "claim"))
    )
  )
)

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
    (asserts! (<= (+ (sats-on-market) amount) (var-get inv-sats))
      ERR_OVER_INVENTORY
    )
    (let ((floor (buy-back-floor)))
      (asserts! (> floor u0) ERR_ZERO_FLOOR)
      (try! (as-contract? ((with-ft SBTC SBTC_NAME amount))
        (try! (contract-call? MARKET deposit-token-x amount floor (some spread-bps)
          SBTC SBTC_NAME
        ))
      ))
      (print {
        event: "yg-buy-back",
        caller: contract-caller,
        amount: amount,
        spread-bps: spread-bps,
        floor: floor,
        vwap-sell: (vwap-sell),
        inv-sats: (var-get inv-sats),
        inv-stx: (var-get inv-stx),
      })
      (ok floor)
    )
  )
)

(define-public (reprice (spread-bps uint))
  (begin
    (try! (check-operator))
    (asserts! (< spread-bps BPS) ERR_BAD_SPREAD)
    (reconcile-inner)
    (asserts! (> (var-get inv-sats) u0) ERR_NO_INVENTORY)
    (let ((floor (buy-back-floor)))
      (asserts! (> floor u0) ERR_ZERO_FLOOR)
      (let ((live (try! (as-contract? ()
          (try! (contract-call? MARKET set-token-x-limit floor (some spread-bps)))
        ))))
        (print {
          event: "yg-reprice",
          caller: contract-caller,
          spread-bps: spread-bps,
          floor: floor,
          applied-now: live,
          vwap-sell: (vwap-sell),
        })
        (ok floor)
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

(define-public (rung-withdraw
    (rung <rung-trait>)
    (amount uint)
    (update (optional (buff 8192)))
  )
  (let (
      (r (contract-of rung))
      (expected (get-rung-principal r))
      (sbtc0 (sbtc-held))
      (stx0 (stx-get-balance current-contract))
    )
    (try! (check-operator))
    (asserts! (is-allowed-rung r) ERR_BAD_RUNG)
    (reconcile-inner)
    (try! (rung-withdraw-inner rung amount update))
    (let (
        (sbtc-in (- (sbtc-held) sbtc0))
        (stx-back (if (> (stx-get-balance current-contract) stx0)
          (- (stx-get-balance current-contract) stx0)
          u0
        ))
      )
      (print {
        event: "yg-rung-withdraw",
        rung: r,
        amount: amount,
      })
      (ok (book-rung r expected sbtc-in stx-back "rung-withdraw"))
    )
  )
)

(define-public (cancel-buy-back)
  (begin
    (try! (check-operator))
    (let ((back (try! (as-contract? ()
        (try! (contract-call? MARKET cancel-token-x-deposit SBTC SBTC_NAME))
      ))))
      (print {
        event: "yg-cancel-buy-back",
        sbtc-back: back,
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
    (reconcile-inner)
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

