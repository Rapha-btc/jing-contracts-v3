;; stx-sbtc-arbitrage-faktory (DRAFT, not deployed)
;;
;; STX -> sBTC -> STX (or sBTC -> STX -> sBTC) round trips through the live Jing
;; router, swap-router-sbtc-stx-jing-v5-6, which reaches every venue (Jing
;; book, Bitflow DLMM v-1/2/3, Bitflow XYK, Velar).
;;
;; The contract holds the inventory: fund it with plain STX / sBTC transfers.
;; Two roles, both the deployer at deploy time:
;;   keeper: the hot wallet on the arb box; can only run arbs, and an arb can
;;           only grow the inventory, so a stolen keeper key cannot drain it.
;;   admin:  meant to be a multisig; withdraws, and sets the keeper and admin.
;; Anyone else who wants to arb deploys their own copy.
;;
;; Simple routes (arb-stx / arb-sbtc): the keeper computes the best split off
;; chain, like the jingswap front end does for a swap:
;;   leg 1: amounts per venue (they must add up to `amount`)
;;   leg 2: shares in basis points per venue (adding up to 10000), scaled to
;;          the router's `out` from leg 1; rounding goes to the last venue with
;;          a share.
;; Leg 2's `out` must be at least `amount` + `min-profit`, or the
;; whole call reverts.

(define-constant ERR-NO-PROFIT (err u1001))
(define-constant ERR-NOT-AUTHORIZED (err u1002))
(define-constant ERR-BAD-SHARES (err u1011))

(define-data-var admin principal tx-sender)
(define-data-var keeper principal tx-sender)
(define-constant ROUTER 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-stx-jing-v5-6)
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant BPS u10000)
(define-constant NO-MINS {
  dlmm: u0,
  xyk: u0,
  velar: u0,
})

;; leg 2 shares (bps) -> amounts of `total`; the rounding remainder goes to
;; velar, else xyk, else dlmm, else jing (the last one with a share)
(define-private (split-by-shares
    (total uint)
    (shares {
      jing: uint,
      dlmm: uint,
      xyk: uint,
      velar: uint,
    })
  )
  (let (
      (j (/ (* total (get jing shares)) BPS))
      (d (/ (* total (get dlmm shares)) BPS))
      (x (/ (* total (get xyk shares)) BPS))
      (v (/ (* total (get velar shares)) BPS))
      (rest (- total (+ j d x v)))
    )
    (asserts!
      (is-eq BPS
        (+ (get jing shares) (get dlmm shares) (get xyk shares)
          (get velar shares)
        ))
      ERR-BAD-SHARES
    )
    (ok (if (> (get velar shares) u0)
      {
        jing: j,
        dlmm: d,
        xyk: x,
        velar: (+ v rest),
      }
      (if (> (get xyk shares) u0)
        {
          jing: j,
          dlmm: d,
          xyk: (+ x rest),
          velar: v,
        }
        (if (> (get dlmm shares) u0)
          {
            jing: j,
            dlmm: (+ d rest),
            xyk: x,
            velar: v,
          }
          {
            jing: (+ j rest),
            dlmm: d,
            xyk: x,
            velar: v,
          }
        )
      )
    ))
  )
)

;; ---------- simple routes: keeper-computed split ----------

;; STX -> sBTC (leg1 amounts) -> STX (leg2 shares)
(define-public (arb-stx
    (amount uint)
    (leg1 {
      jing: uint,
      dlmm: uint,
      xyk: uint,
      velar: uint,
    })
    (leg2-shares {
      jing: uint,
      dlmm: uint,
      xyk: uint,
      velar: uint,
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
          (try! (as-contract? ((with-stx amount))
            (try! (contract-call? ROUTER swap-stx-for-sbtc amount (get jing leg1)
              limit1 update none {
              dlmm: (get dlmm leg1),
              xyk: (get xyk leg1),
              velar: (get velar leg1),
            }
              NO-MINS u1
            ))
          ))
        ))
        (leg2 (try! (split-by-shares sbtc-mid leg2-shares)))
        (stx-out (get out
          (try! (as-contract? ((with-ft SBTC "sbtc-token" sbtc-mid))
            (try! (contract-call? ROUTER swap-sbtc-for-stx sbtc-mid (get jing leg2)
              limit2 update none {
              dlmm: (get dlmm leg2),
              xyk: (get xyk leg2),
              velar: (get velar leg2),
            }
              NO-MINS u1
            ))
          ))
        ))
      )
      (asserts! (>= stx-out (+ amount min-profit)) ERR-NO-PROFIT)
      (ok true)
    )
  )
)

;; sBTC -> STX (leg1 amounts) -> sBTC (leg2 shares)
(define-public (arb-sbtc
    (amount uint)
    (leg1 {
      jing: uint,
      dlmm: uint,
      xyk: uint,
      velar: uint,
    })
    (leg2-shares {
      jing: uint,
      dlmm: uint,
      xyk: uint,
      velar: uint,
    })
    (limit1 uint)
    (limit2 uint)
    (update (optional (buff 8192)))
    (min-profit uint)
  )
  (begin
    (asserts! (is-eq contract-caller (var-get keeper)) ERR-NOT-AUTHORIZED)
    (let (
        (stx-mid (get out
          (try! (as-contract? ((with-ft SBTC "sbtc-token" amount))
            (try! (contract-call? ROUTER swap-sbtc-for-stx amount (get jing leg1)
              limit1 update none {
              dlmm: (get dlmm leg1),
              xyk: (get xyk leg1),
              velar: (get velar leg1),
            }
              NO-MINS u1
            ))
          ))
        ))
        (leg2 (try! (split-by-shares stx-mid leg2-shares)))
        (sbtc-out (get out
          (try! (as-contract? ((with-stx stx-mid))
            (try! (contract-call? ROUTER swap-stx-for-sbtc stx-mid (get jing leg2)
              limit2 update none {
              dlmm: (get dlmm leg2),
              xyk: (get xyk leg2),
              velar: (get velar leg2),
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

(define-public (withdraw-stx (amount uint))
  (let ((to (var-get admin)))
    (asserts! (is-eq contract-caller to) ERR-NOT-AUTHORIZED)
    (as-contract? ((with-stx amount))
      (try! (stx-transfer? amount current-contract to))
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
