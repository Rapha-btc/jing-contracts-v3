;; sbtc-usdcx-arbitrage-faktory (DRAFT, not deployed)
;;
;; USDCx -> sBTC -> USDCx (or sBTC -> USDCx -> sBTC) round trips through the
;; live Jing router, swap-router-sbtc-usdcx-jing-v5-6, which reaches the Jing
;; book (markets-sbtc-usdcx-jing-v6-4) and the Bitflow DLMM sbtc-usdcx pools
;; (ids 1, 2, 17; the router picks the pool). The router has no xyk / Velar
;; venue (a nonzero amount there aborts u3003), so this contract only takes
;; jing + dlmm and always passes 0 for the other two.
;;
;; The contract holds the inventory: fund it with plain USDCx / sBTC transfers.
;; Two roles, both the deployer at deploy time:
;;   keeper: the hot wallet on the arb box; can only run arbs, and an arb can
;;           only grow the inventory, so a stolen keeper key cannot drain it.
;;   admin:  meant to be a multisig; withdraws, and sets the keeper and admin.
;; Anyone else who wants to arb deploys their own copy.
;;
;; Routes (arb-usdcx / arb-sbtc): the keeper computes the best split off
;; chain, like the jingswap front end does for a swap:
;;   leg 1: amounts per venue (they must add up to `amount`, else u3004)
;;   leg 2: shares in basis points per venue (adding up to 10000), scaled to
;;          the router's `out` from leg 1; rounding goes to dlmm when it has a
;;          share, else jing.
;; Leg 2's `out` must be at least `amount` + `min-profit`, or the
;; whole call reverts.

(define-constant ERR-NO-PROFIT (err u1001))
(define-constant ERR-NOT-AUTHORIZED (err u1002))
(define-constant ERR-BAD-SHARES (err u1011))

(define-data-var admin principal tx-sender)
(define-data-var keeper principal tx-sender)
(define-constant ROUTER 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-usdcx-jing-v5-6)
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant USDCX 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant BPS u10000)
(define-constant NO-MINS {
  dlmm: u0,
  xyk: u0,
  velar: u0,
})

;; leg 2 shares (bps) -> amounts of `total`; the rounding remainder goes to
;; dlmm, else jing (the last one with a share)
(define-private (split-by-shares
    (total uint)
    (shares {
      jing: uint,
      dlmm: uint,
    })
  )
  (let (
      (j (/ (* total (get jing shares)) BPS))
      (d (/ (* total (get dlmm shares)) BPS))
      (rest (- total (+ j d)))
    )
    (asserts! (is-eq BPS (+ (get jing shares) (get dlmm shares))) ERR-BAD-SHARES)
    (ok (if (> (get dlmm shares) u0)
      {
        jing: j,
        dlmm: (+ d rest),
      }
      {
        jing: (+ j rest),
        dlmm: d,
      }
    ))
  )
)

;; ---------- routes: keeper-computed split ----------

;; USDCx -> sBTC (leg1 amounts) -> USDCx (leg2 shares)
(define-public (arb-usdcx
    (amount uint)
    (leg1 {
      jing: uint,
      dlmm: uint,
    })
    (leg2-shares {
      jing: uint,
      dlmm: uint,
    })
    (limit1 uint)
    (limit2 uint)
    (update (optional (buff 8192)))
    (min-profit uint)
  )
  (begin
    (asserts! (is-eq contract-caller (var-get keeper)) ERR-NOT-AUTHORIZED)
    (let (
        (sbtc-mid (get out
          (try! (as-contract? ((with-ft USDCX "usdcx-token" amount))
            (try! (contract-call? ROUTER swap-usdcx-for-sbtc amount (get jing leg1)
              limit1 update none {
              dlmm: (get dlmm leg1),
              xyk: u0,
              velar: u0,
            }
              NO-MINS u1
            ))
          ))
        ))
        (leg2 (try! (split-by-shares sbtc-mid leg2-shares)))
        (usdcx-out (get out
          (try! (as-contract? ((with-ft SBTC "sbtc-token" sbtc-mid))
            (try! (contract-call? ROUTER swap-sbtc-for-usdcx sbtc-mid (get jing leg2)
              limit2 update none {
              dlmm: (get dlmm leg2),
              xyk: u0,
              velar: u0,
            }
              NO-MINS u1
            ))
          ))
        ))
      )
      (asserts! (>= usdcx-out (+ amount min-profit)) ERR-NO-PROFIT)
      (ok true)
    )
  )
)

;; sBTC -> USDCx (leg1 amounts) -> sBTC (leg2 shares)
(define-public (arb-sbtc
    (amount uint)
    (leg1 {
      jing: uint,
      dlmm: uint,
    })
    (leg2-shares {
      jing: uint,
      dlmm: uint,
    })
    (limit1 uint)
    (limit2 uint)
    (update (optional (buff 8192)))
    (min-profit uint)
  )
  (begin
    (asserts! (is-eq contract-caller (var-get keeper)) ERR-NOT-AUTHORIZED)
    (let (
        (usdcx-mid (get out
          (try! (as-contract? ((with-ft SBTC "sbtc-token" amount))
            (try! (contract-call? ROUTER swap-sbtc-for-usdcx amount (get jing leg1)
              limit1 update none {
              dlmm: (get dlmm leg1),
              xyk: u0,
              velar: u0,
            }
              NO-MINS u1
            ))
          ))
        ))
        (leg2 (try! (split-by-shares usdcx-mid leg2-shares)))
        (sbtc-out (get out
          (try! (as-contract? ((with-ft USDCX "usdcx-token" usdcx-mid))
            (try! (contract-call? ROUTER swap-usdcx-for-sbtc usdcx-mid (get jing leg2)
              limit2 update none {
              dlmm: (get dlmm leg2),
              xyk: u0,
              velar: u0,
            }
              NO-MINS u1
            ))
          ))
        ))
      )
      (asserts! (>= sbtc-out (+ amount min-profit)) ERR-NO-PROFIT)
      (ok true)
    )
  )
)

;; ---------- admin ----------

(define-public (withdraw-usdcx (amount uint))
  (let ((to (var-get admin)))
    (asserts! (is-eq contract-caller to) ERR-NOT-AUTHORIZED)
    (as-contract? ((with-ft USDCX "usdcx-token" amount))
      (try! (contract-call? USDCX transfer amount current-contract to none))
    )
  )
)

(define-public (withdraw-sbtc (amount uint))
  (let ((to (var-get admin)))
    (asserts! (is-eq contract-caller to) ERR-NOT-AUTHORIZED)
    (as-contract? ((with-ft SBTC "sbtc-token" amount))
      (try! (contract-call? SBTC transfer amount current-contract to none))
    )
  )
)

(define-public (set-keeper (who principal))
  (begin
    (asserts! (is-eq contract-caller (var-get admin)) ERR-NOT-AUTHORIZED)
    (ok (var-set keeper who))
  )
)

(define-public (set-admin (who principal))
  (begin
    (asserts! (is-eq contract-caller (var-get admin)) ERR-NOT-AUTHORIZED)
    (ok (var-set admin who))
  )
)

;; ---------- read-only ----------

(define-read-only (get-roles)
  {
    admin: (var-get admin),
    keeper: (var-get keeper),
  }
)
