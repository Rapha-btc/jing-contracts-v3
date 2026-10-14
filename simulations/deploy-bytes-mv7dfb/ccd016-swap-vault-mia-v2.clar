

(impl-trait 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.extension-trait.extension-trait)


(define-constant ERR_UNAUTHORIZED (err u16000))
(define-constant ERR_NO_FUNDS (err u16006))
(define-constant ERR_NO_BUDGET (err u16010))
(define-constant ERR_INVALID_PRICE (err u16013))
(define-constant ERR_WINDOW_CLOSED (err u16030))
(define-constant ERR_WINDOW_OPEN (err u16031))
(define-constant ERR_NO_CLOCK (err u16032))
(define-constant ERR_OUT_OF_RANGE (err u16033))
(define-constant ERR_NOTHING_RESTING (err u16034))
(define-constant ERR_ORACLE_DIA (err u16035))
(define-constant ERR_ORACLE_STALE (err u16036))
(define-constant ERR_ORACLE_DIVERGED (err u16037))
(define-constant ERR_NO_BLOCK_TIME (err u16038))
(define-constant ERR_CHUNK_TOO_BIG (err u16039))
(define-constant ERR_SPLIT_MISMATCH (err u16040))
(define-constant ERR_SOME_FUNDS (err u16043))
(define-constant ERR_COOLDOWN (err u16044))
(define-constant ERR_BELOW_FLOOR (err u16047))
(define-constant ROUTER_SLACK_SATS u8)
(define-constant ERR_UPDATE_REQUIRED (err u16045))

(define-constant PRICE_PRECISION u100000000)
(define-constant DECIMAL_FACTOR u100)
(define-constant BPS_PRECISION u10000)
(define-constant JING_REBATE_DUST_SATS u51)
(define-constant MAX_TAKER_REBATE_BPS u70)

(define-constant SBTC_TOKEN 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant ASSET_SBTC "sbtc-token")

(define-constant REWARDS_TREASURY 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd002-treasury-mia-rewards-v3)

(define-constant STX_FAIR_BOOK .ccd015-redemption-book-mia-stx) ;; in prod change this to the literal

(define-constant JING_MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3)
(define-constant JING_ROUTER 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-stx-jing-v5-3)
(define-constant WSTX_TOKEN 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2)
(define-constant ASSET_WSTX "wstx")

(define-constant MAX_WINDOW_BLOCKS u1008) ;; one week: rewards land weekly, a batch must clear before the next
(define-constant MAX_LEEWAY_BPS u1000) ;; 10% under the mid
(define-constant MAX_SLIPPAGE_BPS u1000) ;; -10%
(define-constant MAX_DIA_BAND_BPS u5000) ;; 50%
(define-constant MAX_CHUNK_SATS u100000000) ;; 1 BTC

(define-constant DUST_SATS u2)

(define-constant MAX_COOLDOWN_BLOCKS u144) ;; one day
(define-constant VELAR_SLIPPAGE_BPS u60)
(define-constant MAX_DIA_AGE u7200) ;; in seconds


(define-constant MAX_NO_PYTH_SLIPPAGE_BPS u5000)
(define-data-var no-pyth-slippage-bps uint u1000)

(define-constant MAX_PYTH_FEE_BUDGET u10000000)
(define-data-var pyth-fee-budget uint u0)

(define-data-var window-blocks uint u288)
(define-data-var leeway-bps uint u500)
(define-data-var slippage-bps uint u100)
(define-data-var max-chunk-sats uint u1000000)
(define-data-var dia-band-bps uint u1000)
(define-data-var router-cooldown-blocks uint u1)
(define-data-var last-router-swap uint u0)
(define-data-var batch-start (optional uint) none)


(define-public (is-dao-or-extension)
  (ok (asserts!
    (or
      (is-eq tx-sender 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.base-dao)
      (contract-call? 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.base-dao
        is-extension contract-caller
      )
    )
    ERR_UNAUTHORIZED
  ))
)

(define-public (callback
    (sender principal)
    (memo (buff 34))
  )
  (ok true)
)


(define-public (set-no-pyth-slippage-bps (bps uint))
  (begin
    (try! (is-dao-or-extension))
    (asserts! (<= bps MAX_NO_PYTH_SLIPPAGE_BPS) ERR_OUT_OF_RANGE)
    (var-set no-pyth-slippage-bps bps)
    (print {
      notification: "set-no-pyth-slippage-bps",
      payload: { value: bps },
    })
    (ok true)
  )
)

(define-public (set-pyth-fee-budget (ustx uint))
  (begin
    (try! (is-dao-or-extension))
    (asserts! (<= ustx MAX_PYTH_FEE_BUDGET) ERR_OUT_OF_RANGE)
    (var-set pyth-fee-budget ustx)
    (print {
      notification: "set-pyth-fee-budget",
      payload: { value: ustx },
    })
    (ok true)
  )
)

(define-public (set-window-blocks (blocks uint))
  (begin
    (try! (is-dao-or-extension))
    (asserts! (<= blocks MAX_WINDOW_BLOCKS) ERR_OUT_OF_RANGE)
    (ok (var-set window-blocks blocks))
  )
)

(define-public (set-leeway-bps (bps uint))
  (begin
    (try! (is-dao-or-extension))
    (asserts! (<= bps MAX_LEEWAY_BPS) ERR_OUT_OF_RANGE)
    (ok (var-set leeway-bps bps))
  )
)

(define-public (set-slippage-bps (bps uint))
  (begin
    (try! (is-dao-or-extension))
    (asserts! (<= bps MAX_SLIPPAGE_BPS) ERR_OUT_OF_RANGE)
    (ok (var-set slippage-bps bps))
  )
)

(define-public (set-max-chunk-sats (sats uint))
  (begin
    (try! (is-dao-or-extension))
    (asserts! (and (> sats u0) (<= sats MAX_CHUNK_SATS)) ERR_OUT_OF_RANGE)
    (ok (var-set max-chunk-sats sats))
  )
)

(define-public (set-dia-band-bps (bps uint))
  (begin
    (try! (is-dao-or-extension))
    (asserts! (<= bps MAX_DIA_BAND_BPS) ERR_OUT_OF_RANGE)
    (ok (var-set dia-band-bps bps))
  )
)

(define-public (set-router-cooldown (blocks uint))
  (begin
    (try! (is-dao-or-extension))
    (asserts! (<= blocks MAX_COOLDOWN_BLOCKS) ERR_OUT_OF_RANGE)
    (ok (var-set router-cooldown-blocks blocks))
  )
)

(define-public (dao-recall-sbtc)
  (let ((balance (unwrap-panic (contract-call? SBTC_TOKEN get-balance current-contract))))
    (try! (is-dao-or-extension))
    (asserts! (> balance u0) ERR_NO_FUNDS)
    (try! (as-contract? ((with-ft SBTC_TOKEN ASSET_SBTC balance))
      (try! (contract-call? SBTC_TOKEN transfer balance current-contract
        REWARDS_TREASURY none
      ))
    ))
    (close-if-empty)
    (ok (print {
      notification: "dao-recall-sbtc",
      payload: { amount: balance },
    }))
  )
)

(define-public (dao-reclaim (update (optional (buff 8192))))
  (begin
    (try! (is-dao-or-extension))
    (reclaim-core)
  )
)


(define-public (fund-from-treasury)
  (let (
      (amount (unwrap! (contract-call? SBTC_TOKEN get-balance REWARDS_TREASURY)
        ERR_NO_BUDGET
      ))
      (empty (or
        (is-empty)
        (is-none (var-get batch-start))
        (and (window-elapsed) (<= (+ (sbtc-balance) (market-total)) ROUTER_SLACK_SATS))
      ))
    )
    (asserts! (> amount u0) ERR_NO_BUDGET)
    (try! (contract-call? REWARDS_TREASURY withdraw-ft
      'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token amount
      current-contract
    ))
    (and empty (open-window))
    (ok (print {
      notification: "fund-from-treasury",
      payload: {
        amount: amount,
        opened: empty,
        batch-start: (var-get batch-start),
      },
    }))
  )
)

(define-private (market-total)
  (let ((cycle (contract-call? JING_MARKET get-current-cycle)))
    (+ (contract-call? JING_MARKET get-token-x-deposit cycle current-contract)
      (contract-call? JING_MARKET get-token-x-parked current-contract)
      (default-to u0
        (get amount
          (contract-call? JING_MARKET get-token-x-pending-deposit
            current-contract
          ))
      ))
  )
)

(define-public (close-batch)
  (let ((on-market (market-total)))
    (and
      (> on-market u0)
      (<= (+ on-market (sbtc-balance)) DUST_SATS)
      (is-ok (reclaim-core))
    )
    (asserts! (is-empty) ERR_SOME_FUNDS)
    (asserts! (is-some (var-get batch-start)) ERR_NO_CLOCK)
    (var-set batch-start none)
    (ok (print {
      notification: "close-batch",
      payload: { burn-height: burn-block-height },
    }))
  )
)


(define-public (fuel-fair-book)
  (let (
      (balance (stx-get-balance current-contract))
      (reserve (var-get pyth-fee-budget))
      (amount (if (> balance reserve)
        (- balance reserve)
        u0
      ))
    )
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (try! (as-contract? ((with-stx amount))
      (try! (stx-transfer? amount current-contract STX_FAIR_BOOK))
    ))
    (close-if-empty)
    (ok (print {
      notification: "fuel-fair-book",
      payload: {
        amount: amount,
        book: STX_FAIR_BOOK,
      },
    }))
  )
)


(define-public (jing-place (update (buff 8192)))
  (let (
      (floor (ask-of (try! (vault-mid update))))
      (amount (sbtc-balance))
    )
    (asserts! (window-open) ERR_WINDOW_CLOSED)
    (try! (check-amount amount))
    (try! (as-contract? ((with-ft SBTC_TOKEN ASSET_SBTC amount))
      (try! (contract-call? JING_MARKET deposit-token-x amount floor (some u0)
        SBTC_TOKEN ASSET_SBTC
      ))
    ))
    (ok (print {
      notification: "jing-place",
      payload: {
        amount: amount,
        floor: floor,
      },
    }))
  )
)

(define-public (jing-refloor (update (buff 8192)))
  (let (
      (floor (phase-limit (try! (vault-mid update))))
      (cycle (contract-call? JING_MARKET get-current-cycle))
      (resting (+ (contract-call? JING_MARKET get-token-x-deposit cycle current-contract)
        (contract-call? JING_MARKET get-token-x-parked current-contract)
      ))
    )
    (try! (is-dao-or-extension))
    (asserts! (> resting u0) ERR_NOTHING_RESTING)
    (try! (as-contract? ()
      (try! (contract-call? JING_MARKET set-token-x-limit floor (some u0)))
    ))
    (ok (print {
      notification: "jing-refloor",
      payload: {
        resting: resting,
        floor: floor,
      },
    }))
  )
)

(define-public (jing-take
    (requested uint)
    (update (buff 8192))
  )
  (let (
      (amount (sweep-amount requested))
      (limit (floor-of (try! (vault-mid update))))
    )
    (try! (is-dao-or-extension))
    (asserts! (window-elapsed) ERR_WINDOW_OPEN)
    (try! (check-amount amount))
    (let ((result (try! (as-contract? ((with-ft SBTC_TOKEN ASSET_SBTC amount)
          (with-stx (var-get pyth-fee-budget))
        )
        (try! (contract-call? JING_MARKET swap amount limit update SBTC_TOKEN
          ASSET_SBTC WSTX_TOKEN ASSET_WSTX true
        ))
      ))))
      (close-if-empty)
      (ok (print {
        notification: "jing-take",
        payload: {
          amount: amount,
          limit-price: limit,
          out: (get token-y-received result),
        },
      }))
    )
  )
)


(define-public (jing-reclaim (update (optional (buff 8192))))
  (begin
    (asserts! (window-elapsed) ERR_WINDOW_OPEN)
    (reclaim-core)
  )
)

(define-public (router-swap (update (buff 8192)))
  (let (
      (amount (chunk-amount))
      (mid (try! (vault-mid update)))
      (limit (floor-of mid))
      (mins (contract-call? JING_MARKET get-min-deposits))
    )
    (asserts! (window-elapsed) ERR_WINDOW_OPEN)
    (try! (check-amount amount))
    (try! (cooldown-tick))
    (let ((result (try! (as-contract?
        ((with-ft SBTC_TOKEN ASSET_SBTC
          (+ amount (get min-token-x mins) JING_REBATE_DUST_SATS
            (/ (+ (* (get min-token-x mins) MAX_TAKER_REBATE_BPS) (- BPS_PRECISION u1))
              BPS_PRECISION
            )
          ))
          (with-stx (var-get pyth-fee-budget))
        )
        (try! (contract-call? JING_ROUTER smart-swap-sbtc-for-stx amount limit
          (some update) mid u0
        ))
      ))))
      (let ((sold (- amount (get unsold result))))
        (asserts! (> sold ROUTER_SLACK_SATS) ERR_BELOW_FLOOR)
        (asserts!
          (>= (get out result) (floor-out (- sold ROUTER_SLACK_SATS) limit))
          ERR_BELOW_FLOOR
        )
      )
      (close-if-empty)
      (ok (print {
        notification: "router-swap",
        payload: {
          amount: amount,
          limit-price: limit,
          mid: mid,
          out: (get out result),
          unsold: (get unsold result),
        },
      }))
    )
  )
)

(define-public (router-swap-split
    (amount uint)
    (jing uint)
    (dlmm uint)
    (xyk uint)
    (velar uint)
    (update (buff 8192))
  )
  (let (
      (mid (try! (vault-mid update)))
      (limit (floor-of mid))
      (velar-limit (/ (* mid (- BPS_PRECISION VELAR_SLIPPAGE_BPS)) BPS_PRECISION))
      (mins {
        dlmm: (floor-out dlmm limit),
        xyk: (floor-out xyk limit),
        velar: (floor-out velar velar-limit),
      })
      (market-mins (contract-call? JING_MARKET get-min-deposits))
    )
    (try! (is-dao-or-extension))
    (asserts! (is-eq amount (+ jing dlmm xyk velar)) ERR_SPLIT_MISMATCH)
    (asserts! (window-elapsed) ERR_WINDOW_OPEN)
    (asserts! (<= amount (var-get max-chunk-sats)) ERR_CHUNK_TOO_BIG)
    (try! (check-amount amount))
    (try! (cooldown-tick))
    (let ((result (try! (as-contract?
        ((with-ft SBTC_TOKEN ASSET_SBTC (+ amount (get min-token-x market-mins)))
          (with-stx (var-get pyth-fee-budget))
        )
        (try! (contract-call? JING_ROUTER swap-sbtc-for-stx amount jing limit
          (some update) none {
          dlmm: dlmm,
          xyk: xyk,
          velar: velar,
        }
          mins
          (+ (floor-out (+ jing dlmm xyk) limit) (floor-out velar velar-limit))
        ))
      ))))
      (close-if-empty)
      (ok (print {
        notification: "router-swap-split",
        payload: {
          amount: amount,
          jing: jing,
          dlmm: dlmm,
          xyk: xyk,
          velar: velar,
          limit-price: limit,
          velar-limit: velar-limit,
          mid: mid,
          out: (get out result),
          unsold: (get unsold result),
        },
      }))
    )
  )
)

(define-public (router-swap-split-dia
    (amount uint)
    (dlmm uint)
    (xyk uint)
    (velar uint)
  )
  (begin
    (try! (is-dao-or-extension))
    (asserts! (is-eq amount (+ dlmm xyk velar)) ERR_SPLIT_MISMATCH)
    (asserts! (window-elapsed) ERR_WINDOW_OPEN)
    (asserts! (<= amount (var-get max-chunk-sats)) ERR_CHUNK_TOO_BIG)
    (try! (check-amount amount))
    (try! (cooldown-tick))
    (let ((price (try! (get-no-pyth-price))))
      (let (
          (limit (get limit price))
          (mins {
            dlmm: (floor-out dlmm limit),
            xyk: (floor-out xyk limit),
            velar: (floor-out velar limit),
          })
        )
        (let ((result (try! (as-contract? ((with-ft SBTC_TOKEN ASSET_SBTC amount))
            (try! (contract-call? JING_ROUTER swap-sbtc-for-stx amount u0 limit none
              none {
              dlmm: dlmm,
              xyk: xyk,
              velar: velar,
            }
              mins (floor-out amount limit)
            ))
          ))))
          (close-if-empty)
          (ok (print {
            notification: "router-swap-split-dia",
            payload: {
              amount: amount,
              dlmm: dlmm,
              xyk: xyk,
              velar: velar,
              mid: (get mid price),
              limit-price: limit,
              price-source: (get source price),
              dia-error: (get dia-error price),
              out: (get out result),
              unsold: (get unsold result),
            },
          }))
        )
      )
    )
  )
)


(define-read-only (get-config)
  {
    window-blocks: (var-get window-blocks),
    leeway-bps: (var-get leeway-bps),
    slippage-bps: (var-get slippage-bps),
    no-pyth-slippage-bps: (var-get no-pyth-slippage-bps),
    pyth-fee-budget: (var-get pyth-fee-budget),
    dia-band-bps: (var-get dia-band-bps),
    max-chunk-sats: (var-get max-chunk-sats),
    router-cooldown-blocks: (var-get router-cooldown-blocks),
    last-router-swap: (var-get last-router-swap),
    jing-market: JING_MARKET,
    jing-router: JING_ROUTER,
    stx-destination: STX_FAIR_BOOK,
  }
)

(define-read-only (get-clock)
  (let ((start (var-get batch-start)))
    {
      batch-start: start,
      window-ends: (match start
        s (some (+ s (var-get window-blocks)))
        none
      ),
      window-open: (window-open),
      window-elapsed: (window-elapsed),
      burn-height: burn-block-height,
    }
  )
)

(define-read-only (get-status)
  (let ((cycle (contract-call?
      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
      get-current-cycle
    )))
    {
      sbtc-balance: (sbtc-balance),
      stx-balance: (stx-get-balance current-contract),
      jing-resting: (contract-call?
        'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
        get-token-x-deposit cycle current-contract
      ),
      jing-parked: (contract-call?
        'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
        get-token-x-parked current-contract
      ),
      jing-escrowed: (default-to u0
        (get amount
          (contract-call?
            'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
            get-token-x-pending-deposit current-contract
          ))
      ),
      empty: (is-empty),
      pending-treasury-sats: (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
        get-balance REWARDS_TREASURY
      )),
    }
  )
)

(define-read-only (is-empty)
  (let ((cycle (contract-call?
      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
      get-current-cycle
    )))
    (and
      (<= (sbtc-balance) DUST_SATS)
      (is-eq
        (contract-call?
          'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
          get-token-x-deposit cycle current-contract
        )
        u0
      )
      (is-eq
        (contract-call?
          'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
          get-token-x-parked current-contract
        )
        u0
      )
      (is-none (contract-call?
        'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3
        get-token-x-pending-deposit current-contract
      ))
    )
  )
)

(define-read-only (get-no-pyth-price)
  (match (get-dia-price)
    mid (let ((limit (/ (* mid (- BPS_PRECISION (var-get no-pyth-slippage-bps))) BPS_PRECISION)))
      (asserts! (> limit u0) ERR_INVALID_PRICE)
      (ok {
        mid: mid,
        limit: limit,
        source: "dia",
        dia-error: none,
      })
    )
    dia-error (let (
        (mid (try! (contract-call?
          'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.rfq-sbtc-stx-jing-v2-3
          get-native-price
        )))
        (limit (/ mid u2))
      )
      (asserts! (> limit u0) ERR_INVALID_PRICE)
      (ok {
        mid: mid,
        limit: limit,
        source: "native",
        dia-error: (some dia-error),
      })
    )
  )
)

(define-read-only (get-dia-value (key (string-ascii 32)))
  (let (
      (res (unwrap!
        (contract-call? 'SP1G48FZ4Y7JY8G2Z0N51QTCYGBQ6F4J43J77BQC0.dia-oracle
          get-value key
        )
        ERR_ORACLE_DIA
      ))
      (last-time (unwrap! (get-stacks-block-info? time (- stacks-block-height u1))
        ERR_NO_BLOCK_TIME
      ))
      (ts (/ (get timestamp res) u1000))
      (v (get value res))
    )
    (asserts! (> v u0) ERR_INVALID_PRICE)
    (asserts! (>= (+ ts MAX_DIA_AGE) last-time) ERR_ORACLE_STALE)
    (ok v)
  )
)

(define-read-only (get-dia-price)
  (let (
      (stx-usd (try! (get-dia-value "STX/USD")))
      (btc-usd (try! (get-dia-value "BTC/USD")))
      (price (/ (* btc-usd PRICE_PRECISION) stx-usd))
    )
    (asserts! (> price u0) ERR_INVALID_PRICE)
    (ok price)
  )
)

(define-read-only (window-open)
  (match (var-get batch-start)
    s (< burn-block-height (+ s (var-get window-blocks)))
    false
  )
)

(define-read-only (window-elapsed)
  (match (var-get batch-start)
    s (>= burn-block-height (+ s (var-get window-blocks)))
    false
  )
)


(define-private (sweep-amount (amount uint))
  (let ((balance (sbtc-balance)))
    (if (<= balance (var-get max-chunk-sats))
      balance
      amount
    )
  )
)

(define-private (chunk-amount)
  (let (
      (balance (sbtc-balance))
      (chunk (var-get max-chunk-sats))
    )
    (if (<= balance chunk)
      balance
      chunk
    )
  )
)

(define-private (sbtc-balance)
  (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
    get-balance current-contract
  ))
)

(define-private (open-window)
  (var-set batch-start (some burn-block-height))
)

(define-private (close-if-empty)
  (and (is-empty) (var-set batch-start none))
)

(define-private (current-mid (update (buff 8192)))
  (let (
      (mid (try! (contract-call? JING_MARKET refresh-mid update)))
      (band (var-get dia-band-bps))
    )
    (asserts! (> mid u0) ERR_INVALID_PRICE)
    (if (> band u0)
      (let ((dia (try! (get-dia-price))))
        (asserts! (>= (* mid BPS_PRECISION) (* dia (- BPS_PRECISION band)))
          ERR_ORACLE_DIVERGED
        )
        (asserts! (<= (* mid BPS_PRECISION) (* dia (+ BPS_PRECISION band)))
          ERR_ORACLE_DIVERGED
        )
        (ok mid)
      )
      (ok mid)
    )
  )
)

(define-private (vault-mid (update (buff 8192)))
  (as-contract? ((with-stx (var-get pyth-fee-budget)))
    (try! (current-mid update))
  )
)

(define-private (ask-of (mid uint))
  (/ (* mid (- BPS_PRECISION (var-get leeway-bps))) BPS_PRECISION)
)

(define-private (floor-of (mid uint))
  (/ (* mid (- BPS_PRECISION (var-get slippage-bps))) BPS_PRECISION)
)

(define-private (phase-limit (mid uint))
  (if (window-open)
    (ask-of mid)
    (floor-of mid)
  )
)

(define-private (floor-out
    (amount uint)
    (limit uint)
  )
  (/ (* amount limit) (* PRICE_PRECISION DECIMAL_FACTOR))
)

(define-private (cooldown-tick)
  (begin
    (asserts!
      (>= burn-block-height
        (+ (var-get last-router-swap) (var-get router-cooldown-blocks))
      )
      ERR_COOLDOWN
    )
    (ok (var-set last-router-swap burn-block-height))
  )
)

(define-private (check-amount (amount uint))
  (begin
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (asserts! (<= amount (sbtc-balance)) ERR_NO_FUNDS)
    (ok true)
  )
)

(define-private (reclaim-core)
  (let (
      (cycle (contract-call? JING_MARKET get-current-cycle))
      (resting (contract-call? JING_MARKET get-token-x-deposit cycle current-contract))
      (parked (contract-call? JING_MARKET get-token-x-parked current-contract))
      (escrowed (default-to u0
        (get amount
          (contract-call? JING_MARKET get-token-x-pending-deposit
            current-contract
          ))
      ))
    )
    (if (or
        (> escrowed u0)
        (> resting u0)
        (> parked u0)
      )
      (let ((refunded (try! (as-contract? ()
          (try! (contract-call? JING_MARKET cancel-token-x-deposit SBTC_TOKEN
            ASSET_SBTC
          ))
        ))))
        (ok (print {
          notification: "jing-reclaim",
          payload: { amount: refunded },
        }))
      )
      (ok (print {
        notification: "jing-reclaim",
        payload: { amount: u0 },
      }))
    )
  )
)
