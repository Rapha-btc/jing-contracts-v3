;; yguazu-treasury
;; Central capital desk for the four Yguazu MM loops. The deployer is the owner.
;; Reshuffles idle starting assets between loops without a withdraw to a wallet:
;;   pull      loop -> treasury   (loop's to-treasury; the loop must name this
;;                                 contract with set-treasury first)
;;   push      treasury -> loop   (plain transfer; a loop's sell spends its balance)
;;   swap      treasury STX/sBTC/USDCx through the Jing routers
;;   move      pull + push, same asset (sell-sbtc <-> sell-sbtc-usdcx)
;;   rebalance pull + one swap + push, assets one hop apart (one side is sBTC)
;; USDCx <-> STX is two hops: pull, swap, swap, push (four calls).
;; The four loop principals are constants: push can only fund these loops,
;; withdraws only go to the owner. Owner only; there is no keeper here.
;;
;; Loop ids:  u0 sell-stx (STX)        u1 sell-sbtc (sBTC)
;;            u2 sell-usdcx (USDCx)    u3 sell-sbtc-usdcx (sBTC)
;; Asset ids: u0 STX  u1 sBTC  u2 USDCx
;; Swap kinds: u0 sBTC->STX  u1 STX->sBTC  u2 sBTC->USDCx  u3 USDCx->sBTC

(define-constant ERR_NOT_OWNER (err u8301))
(define-constant ERR_NOT_PENDING_OWNER (err u8302))
(define-constant ERR_ZERO_AMOUNT (err u8303))
(define-constant ERR_BAD_LOOP (err u8304))
(define-constant ERR_BAD_KIND (err u8305))
(define-constant ERR_SAME_ASSET (err u8306))
(define-constant ERR_NOT_SAME_ASSET (err u8307))
(define-constant ERR_NO_ROUTE (err u8308))
(define-constant ERR_SAME_LOOP (err u8309))

(define-constant LOOP_STX .yguazu-mm-loop-sell-stx)
(define-constant LOOP_SBTC .yguazu-mm-loop-sell-sbtc)
(define-constant LOOP_USDCX .yguazu-mm-loop-sell-usdcx)
(define-constant LOOP_SBTC_USDCX .yguazu-mm-loop-sell-sbtc-usdcx)

(define-constant ROUTER_STX 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-stx-jing-v5-6)
(define-constant ROUTER_USDCX 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-usdcx-jing-v5-6)

(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant SBTC_NAME "sbtc-token")
(define-constant USDCX 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant USDCX_NAME "usdcx-token")

(define-constant A_STX u0)
(define-constant A_SBTC u1)
(define-constant A_USDCX u2)

(define-data-var owner principal tx-sender)
(define-data-var pending-owner (optional principal) none)
;; most uSTX a router swap may pay for the oracle update it carries (0 today)
(define-data-var max-oracle-fee uint u0)

;; ---------------------------------------------------------------- reads

(define-read-only (get-owner)
  (var-get owner)
)

(define-read-only (get-pending-owner)
  (var-get pending-owner)
)

(define-read-only (loop-principal (id uint))
  (if (is-eq id u0)
    (some LOOP_STX)
    (if (is-eq id u1)
      (some LOOP_SBTC)
      (if (is-eq id u2)
        (some LOOP_USDCX)
        (if (is-eq id u3)
          (some LOOP_SBTC_USDCX)
          none
        )
      )
    )
  )
)

;; the starting asset each loop sells into its rungs
(define-read-only (loop-asset (id uint))
  (if (is-eq id u0)
    (some A_STX)
    (if (or (is-eq id u1) (is-eq id u3))
      (some A_SBTC)
      (if (is-eq id u2)
        (some A_USDCX)
        none
      )
    )
  )
)

(define-read-only (balance-of (asset uint))
  (if (is-eq asset A_STX)
    (stx-get-balance current-contract)
    (if (is-eq asset A_SBTC)
      (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance current-contract))
      (unwrap-panic (contract-call? 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx get-balance current-contract))
    )
  )
)

;; one-hop swap kind from asset a to asset b (none: same asset or STX<->USDCx)
(define-read-only (swap-kind (a uint) (b uint))
  (if (and (is-eq a A_SBTC) (is-eq b A_STX))
    (some u0)
    (if (and (is-eq a A_STX) (is-eq b A_SBTC))
      (some u1)
      (if (and (is-eq a A_SBTC) (is-eq b A_USDCX))
        (some u2)
        (if (and (is-eq a A_USDCX) (is-eq b A_SBTC))
          (some u3)
          none
        )
      )
    )
  )
)

(define-read-only (get-state)
  {
    owner: (var-get owner),
    max-oracle-fee: (var-get max-oracle-fee),
    stx-held: (balance-of A_STX),
    sbtc-held: (balance-of A_SBTC),
    usdcx-held: (balance-of A_USDCX),
  }
)

;; ---------------------------------------------------------------- auth

(define-private (check-owner)
  (if (is-eq contract-caller (var-get owner))
    (ok true)
    ERR_NOT_OWNER
  )
)

;; ---------------------------------------------------------------- inner moves

;; the loop checks contract-caller = its treasury, so a direct call is enough
(define-private (pull-inner (id uint) (amount uint))
  (if (is-eq id u0)
    (contract-call? .yguazu-mm-loop-sell-stx to-treasury amount)
    (if (is-eq id u1)
      (contract-call? .yguazu-mm-loop-sell-sbtc to-treasury amount)
      (if (is-eq id u2)
        (contract-call? .yguazu-mm-loop-sell-usdcx to-treasury amount)
        (if (is-eq id u3)
          (contract-call? .yguazu-mm-loop-sell-sbtc-usdcx to-treasury amount)
          ERR_BAD_LOOP
        )
      )
    )
  )
)

(define-private (push-inner (id uint) (amount uint))
  (let (
      (to (unwrap! (loop-principal id) ERR_BAD_LOOP))
      (asset (unwrap! (loop-asset id) ERR_BAD_LOOP))
    )
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (if (is-eq asset A_STX)
      (try! (as-contract? ((with-stx amount))
        (try! (stx-transfer? amount current-contract to))
      ))
      (if (is-eq asset A_SBTC)
        (try! (as-contract? ((with-ft SBTC SBTC_NAME amount))
          (try! (contract-call? SBTC transfer amount current-contract to none))
        ))
        (try! (as-contract? ((with-ft USDCX USDCX_NAME amount))
          (try! (contract-call? USDCX transfer amount current-contract to none))
        ))
      )
    )
    (ok amount)
  )
)

;; Router swap on the treasury balance; returns the output received (balance
;; delta). The router call shape is the arbs' manual split; min-out guards it.
(define-private (swap-inner
    (kind uint)
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
    (min-out uint)
  )
  (let (
      (out-asset (if (is-eq kind u0) A_STX (if (is-eq kind u2) A_USDCX A_SBTC)))
      (out0 (balance-of out-asset))
      (fee (var-get max-oracle-fee))
    )
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (asserts! (< kind u4) ERR_BAD_KIND)
    (if (is-eq kind u0)
      (try! (as-contract? ((with-ft SBTC SBTC_NAME amount) (with-stx fee))
        (try! (contract-call? ROUTER_STX swap-sbtc-for-stx amount jing-amount limit-price update
          fallback amm-amounts amm-mins min-out
        ))
        true
      ))
      (if (is-eq kind u1)
        (try! (as-contract? ((with-stx (+ amount fee)))
          (try! (contract-call? ROUTER_STX swap-stx-for-sbtc amount jing-amount limit-price update
            fallback amm-amounts amm-mins min-out
          ))
          true
        ))
        (if (is-eq kind u2)
          (try! (as-contract? ((with-ft SBTC SBTC_NAME amount) (with-stx fee))
            (try! (contract-call? ROUTER_USDCX swap-sbtc-for-usdcx amount jing-amount limit-price
              update fallback amm-amounts amm-mins min-out
            ))
            true
          ))
          (try! (as-contract? ((with-ft USDCX USDCX_NAME amount) (with-stx fee))
            (try! (contract-call? ROUTER_USDCX swap-usdcx-for-sbtc amount jing-amount limit-price
              update fallback amm-amounts amm-mins min-out
            ))
            true
          ))
        )
      )
    )
    (let (
        (out1 (balance-of out-asset))
        (got (if (> out1 out0) (- out1 out0) u0))
      )
      (asserts! (> got u0) ERR_ZERO_AMOUNT)
      (ok got)
    )
  )
)

;; ---------------------------------------------------------------- owner calls

(define-public (pull (id uint) (amount uint))
  (begin
    (try! (check-owner))
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (try! (pull-inner id amount))
    (print {
      event: "yt-pull",
      loop: id,
      amount: amount,
    })
    (ok amount)
  )
)

(define-public (push (id uint) (amount uint))
  (begin
    (try! (check-owner))
    (try! (push-inner id amount))
    (print {
      event: "yt-push",
      loop: id,
      amount: amount,
    })
    (ok amount)
  )
)

;; same starting asset: sell-sbtc (u1) <-> sell-sbtc-usdcx (u3)
(define-public (move (from uint) (to uint) (amount uint))
  (let (
      (a (unwrap! (loop-asset from) ERR_BAD_LOOP))
      (b (unwrap! (loop-asset to) ERR_BAD_LOOP))
    )
    (try! (check-owner))
    (asserts! (not (is-eq from to)) ERR_SAME_LOOP)
    (asserts! (is-eq a b) ERR_NOT_SAME_ASSET)
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (try! (pull-inner from amount))
    (try! (push-inner to amount))
    (print {
      event: "yt-move",
      from: from,
      to: to,
      amount: amount,
    })
    (ok amount)
  )
)

(define-public (swap
    (kind uint)
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
    (min-out uint)
  )
  (begin
    (try! (check-owner))
    (let ((got (try! (swap-inner kind amount jing-amount limit-price update fallback amm-amounts
        amm-mins min-out
      ))))
      (print {
        event: "yt-swap",
        kind: kind,
        amount: amount,
        got: got,
      })
      (ok got)
    )
  )
)

;; pull `amount` from one loop, swap it one hop, push all of the output to the
;; other loop. Different starting assets, one of them sBTC.
(define-public (rebalance
    (from uint)
    (to uint)
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
    (min-out uint)
  )
  (let (
      (a (unwrap! (loop-asset from) ERR_BAD_LOOP))
      (b (unwrap! (loop-asset to) ERR_BAD_LOOP))
    )
    (try! (check-owner))
    (asserts! (not (is-eq a b)) ERR_SAME_ASSET)
    (let ((kind (unwrap! (swap-kind a b) ERR_NO_ROUTE)))
      (try! (pull-inner from amount))
      (let ((got (try! (swap-inner kind amount jing-amount limit-price update fallback
          amm-amounts amm-mins min-out
        ))))
        (try! (push-inner to got))
        (print {
          event: "yt-rebalance",
          from: from,
          to: to,
          amount: amount,
          kind: kind,
          got: got,
        })
        (ok got)
      )
    )
  )
)

;; ---------------------------------------------------------------- owner admin

(define-public (withdraw (asset uint) (amount uint))
  (let ((to (var-get owner)))
    (try! (check-owner))
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (asserts! (< asset u3) ERR_BAD_KIND)
    (if (is-eq asset A_STX)
      (try! (as-contract? ((with-stx amount))
        (try! (stx-transfer? amount current-contract to))
      ))
      (if (is-eq asset A_SBTC)
        (try! (as-contract? ((with-ft SBTC SBTC_NAME amount))
          (try! (contract-call? SBTC transfer amount current-contract to none))
        ))
        (try! (as-contract? ((with-ft USDCX USDCX_NAME amount))
          (try! (contract-call? USDCX transfer amount current-contract to none))
        ))
      )
    )
    (print {
      event: "yt-withdraw",
      asset: asset,
      to: to,
      amount: amount,
    })
    (ok amount)
  )
)

(define-public (set-max-oracle-fee (fee uint))
  (begin
    (try! (check-owner))
    (var-set max-oracle-fee fee)
    (print {
      event: "yt-set-max-oracle-fee",
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
      event: "yt-propose-owner",
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
      event: "yt-accept-owner",
      owner: who,
    })
    (ok true)
  )
)
