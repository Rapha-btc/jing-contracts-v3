;; stx-short-pool
;;
;; STX lender pool for the STX short protocol. Lenders deposit plain STX and
;; receive non-transferable pool shares (an internal map, not SIP-010: a
;; transferable share would have to settle the USDCx reward index on both
;; sides of every transfer; a jSTX-style wrapper can be layered on later).
;;
;; Assets are tracked in internal accounting, never read from the balance:
;;   total-assets = idle + lent
;;   idle  STX in this contract available to lend or withdraw
;;   lent  STX principal outstanding to stx-short-vault
;; A donation therefore cannot move the share price (no inflation attack).
;; A loss is booked when the vault repays less than the principal it owes:
;; lent drops by the principal, idle rises by what came back, so
;; total-assets (and every share) drops pro rata. No insurance fund.
;;
;; Interest arrives in USDCx (paid upfront by shorters). The protocol fee
;; goes straight to `treasury`; the rest is distributed pro rata per share
;; through a reward index (reward-per-share, MasterChef style). USDCx is never
;; auto-swapped to STX: a swap would add price risk and MEV on every open.
;;
;; Only stx-short-vault (contract-caller) can borrow / repay / add-interest.
;; Lenders withdraw only from idle STX. The owner sets caps / fee / treasury
;; within hard bounds and has no path to lender funds.

(define-constant ERR_NOT_OWNER (err u3001))
(define-constant ERR_NOT_VAULT (err u3002))
(define-constant ERR_ZERO_AMOUNT (err u3003))
(define-constant ERR_TOO_SMALL (err u3004))
(define-constant ERR_INSUFFICIENT_SHARES (err u3005))
(define-constant ERR_INSUFFICIENT_IDLE (err u3006))
(define-constant ERR_CAP_UTILIZATION (err u3007))
(define-constant ERR_CAP_ABSOLUTE (err u3008))
(define-constant ERR_BAD_PARAM (err u3009))
(define-constant ERR_POOL_INSOLVENT (err u3010))
(define-constant ERR_REPAY_EXCEEDS_LENT (err u3011))

(define-constant VAULT .stx-short-vault)
(define-constant USDCX 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant USDCX_NAME "usdcx-token")

(define-constant BPS u10000)
(define-constant REWARD_SCALE u1000000000000000000)
(define-constant MIN_DEPOSIT u1000000)
;; hard bounds for owner params
(define-constant MIN_UTIL_CAP_BPS u1000)
(define-constant MAX_UTIL_CAP_BPS u9500)
(define-constant MAX_FEE_BPS u3000)

(define-data-var owner principal tx-sender)
(define-data-var treasury principal tx-sender)
(define-data-var fee-bps uint u1000)
(define-data-var max-util-bps uint u8000)
(define-data-var max-lent uint u1000000000000) ;; 1,000,000 STX squeeze guard

(define-data-var idle uint u0)
(define-data-var lent uint u0)
(define-data-var total-shares uint u0)
(define-data-var losses uint u0)
(define-data-var reward-index uint u0)
(define-data-var reward-carry uint u0)
(define-data-var rewards-unclaimed uint u0)

(define-map shares
  principal
  uint
)
(define-map paid-index
  principal
  uint
)
(define-map owed
  principal
  uint
)

;; ---------- read-only ----------

(define-read-only (total-assets)
  (+ (var-get idle) (var-get lent))
)

(define-read-only (get-pool)
  {
    idle: (var-get idle),
    lent: (var-get lent),
    total-assets: (total-assets),
    total-shares: (var-get total-shares),
    losses: (var-get losses),
    reward-index: (var-get reward-index),
    rewards-unclaimed: (var-get rewards-unclaimed),
    max-util-bps: (var-get max-util-bps),
    max-lent: (var-get max-lent),
    fee-bps: (var-get fee-bps),
    treasury: (var-get treasury),
    owner: (var-get owner),
  }
)

(define-read-only (get-shares (who principal))
  (default-to u0 (map-get? shares who))
)

(define-read-only (shares-to-stx (amount uint))
  (let ((ts (var-get total-shares)))
    (if (is-eq ts u0)
      u0
      (/ (* amount (total-assets)) ts)
    )
  )
)

(define-read-only (stx-to-shares (amount uint))
  (let ((ts (var-get total-shares)))
    (if (is-eq ts u0)
      amount
      (if (is-eq (total-assets) u0)
        u0
        (/ (* amount ts) (total-assets))
      )
    )
  )
)

(define-read-only (get-lender (who principal))
  (let ((s (get-shares who)))
    {
      shares: s,
      stx-value: (shares-to-stx s),
      withdrawable: (let ((v (shares-to-stx s)))
        (if (< v (var-get idle))
          v
          (var-get idle)
        )
      ),
      rewards: (pending-rewards who),
    }
  )
)

(define-read-only (pending-rewards (who principal))
  (+ (default-to u0 (map-get? owed who))
    (/
      (* (get-shares who)
        (- (var-get reward-index) (default-to u0 (map-get? paid-index who)))
      )
      REWARD_SCALE
    ))
)

(define-read-only (utilization-bps)
  (if (is-eq (total-assets) u0)
    u0
    (/ (* (var-get lent) BPS) (total-assets))
  )
)

;; utilization if `amount` more were lent now
(define-read-only (utilization-after (amount uint))
  (if (is-eq (total-assets) u0)
    BPS
    (/ (* (+ (var-get lent) amount) BPS) (total-assets))
  )
)

;; the most the vault can borrow right now (utilization cap, absolute cap, idle)
(define-read-only (capacity)
  (let (
      (l (var-get lent))
      (util-room (let ((c (/ (* (total-assets) (var-get max-util-bps)) BPS)))
        (if (> c l)
          (- c l)
          u0
        )
      ))
      (abs-room (if (> (var-get max-lent) l)
        (- (var-get max-lent) l)
        u0
      ))
      (m (if (< util-room abs-room)
        util-room
        abs-room
      ))
    )
    (if (< m (var-get idle))
      m
      (var-get idle)
    )
  )
)

;; ---------- reward index ----------

(define-private (settle-rewards (who principal))
  (begin
    (map-set owed who (pending-rewards who))
    (map-set paid-index who (var-get reward-index))
  )
)

;; ---------- lenders ----------

(define-public (deposit (amount uint))
  (let (
      (who tx-sender)
      (ts (var-get total-shares))
      (ta (total-assets))
      (minted (if (is-eq ts u0)
        amount
        (if (is-eq ta u0)
          u0
          (/ (* amount ts) ta)
        )
      ))
    )
    (asserts! (>= amount MIN_DEPOSIT) ERR_TOO_SMALL)
    ;; every share wiped out by losses: refuse new money rather than mint at
    ;; an undefined price (old shares keep their claim on the USDCx rewards)
    (asserts! (or (is-eq ts u0) (> ta u0)) ERR_POOL_INSOLVENT)
    (asserts! (> minted u0) ERR_TOO_SMALL)
    (settle-rewards who)
    (try! (stx-transfer? amount who current-contract))
    (map-set shares who (+ (get-shares who) minted))
    (var-set total-shares (+ ts minted))
    (var-set idle (+ (var-get idle) amount))
    (print {
      topic: "pool-deposit",
      lender: who,
      amount: amount,
      shares: minted,
      total-shares: (var-get total-shares),
      total-assets: (total-assets),
    })
    (ok minted)
  )
)

(define-public (withdraw (share-amount uint))
  (let (
      (who tx-sender)
      (have (get-shares who))
      (amount (shares-to-stx share-amount))
    )
    (asserts! (> share-amount u0) ERR_ZERO_AMOUNT)
    (asserts! (<= share-amount have) ERR_INSUFFICIENT_SHARES)
    (asserts! (<= amount (var-get idle)) ERR_INSUFFICIENT_IDLE)
    (settle-rewards who)
    (map-set shares who (- have share-amount))
    (var-set total-shares (- (var-get total-shares) share-amount))
    (var-set idle (- (var-get idle) amount))
    (if (> amount u0)
      (try! (as-contract? ((with-stx amount))
        (try! (stx-transfer? amount current-contract who))
      ))
      true
    )
    (print {
      topic: "pool-withdraw",
      lender: who,
      shares: share-amount,
      amount: amount,
      total-shares: (var-get total-shares),
      total-assets: (total-assets),
    })
    (ok amount)
  )
)

(define-public (claim-rewards)
  (let (
      (who tx-sender)
      (amount (pending-rewards who))
    )
    (map-set owed who u0)
    (map-set paid-index who (var-get reward-index))
    (if (> amount u0)
      (begin
        (var-set rewards-unclaimed (- (var-get rewards-unclaimed) amount))
        (try! (as-contract? ((with-ft USDCX USDCX_NAME amount))
          (try! (contract-call? USDCX transfer amount current-contract who none))
        ))
        true
      )
      true
    )
    (print {
      topic: "pool-claim",
      lender: who,
      amount: amount,
    })
    (ok amount)
  )
)

;; ---------- vault-only ----------

(define-public (borrow (amount uint))
  (let ((l (var-get lent)))
    (asserts! (is-eq contract-caller VAULT) ERR_NOT_VAULT)
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (asserts! (<= amount (var-get idle)) ERR_INSUFFICIENT_IDLE)
    (asserts! (<= (* (+ l amount) BPS) (* (total-assets) (var-get max-util-bps)))
      ERR_CAP_UTILIZATION
    )
    (asserts! (<= (+ l amount) (var-get max-lent)) ERR_CAP_ABSOLUTE)
    (var-set idle (- (var-get idle) amount))
    (var-set lent (+ l amount))
    (try! (as-contract? ((with-stx amount))
      (try! (stx-transfer? amount current-contract VAULT))
    ))
    (print {
      topic: "pool-borrow",
      amount: amount,
      lent: (var-get lent),
      utilization-bps: (utilization-bps),
    })
    (ok amount)
  )
)

;; The vault returns `amount` STX against `principal` of debt. amount <
;; principal books the difference as a loss to every share.
(define-public (repay
    (principal-amount uint)
    (amount uint)
  )
  (let (
      (l (var-get lent))
      (loss (if (< amount principal-amount)
        (- principal-amount amount)
        u0
      ))
    )
    (asserts! (is-eq contract-caller VAULT) ERR_NOT_VAULT)
    (asserts! (<= principal-amount l) ERR_REPAY_EXCEEDS_LENT)
    (if (> amount u0)
      (try! (stx-transfer? amount tx-sender current-contract))
      true
    )
    (var-set lent (- l principal-amount))
    (var-set idle (+ (var-get idle) amount))
    (var-set losses (+ (var-get losses) loss))
    (print {
      topic: "pool-repay",
      principal: principal-amount,
      amount: amount,
      loss: loss,
      lent: (var-get lent),
      total-assets: (total-assets),
    })
    (ok loss)
  )
)

;; USDCx interest from the vault: fee to treasury, the rest to the index.
(define-public (add-interest (amount uint))
  (let (
      (ts (var-get total-shares))
      (fee (if (is-eq ts u0)
        amount
        (/ (* amount (var-get fee-bps)) BPS)
      ))
      (net (- amount fee))
      (scaled (+ (* net REWARD_SCALE) (var-get reward-carry)))
      (tre (var-get treasury))
    )
    (asserts! (is-eq contract-caller VAULT) ERR_NOT_VAULT)
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (try! (contract-call? USDCX transfer amount tx-sender current-contract none))
    (if (> fee u0)
      (try! (as-contract? ((with-ft USDCX USDCX_NAME fee))
        (try! (contract-call? USDCX transfer fee current-contract tre none))
      ))
      true
    )
    (if (> net u0)
      (begin
        (var-set reward-index (+ (var-get reward-index) (/ scaled ts)))
        (var-set reward-carry (mod scaled ts))
        (var-set rewards-unclaimed (+ (var-get rewards-unclaimed) net))
      )
      true
    )
    (print {
      topic: "pool-interest",
      amount: amount,
      fee: fee,
      net: net,
      reward-index: (var-get reward-index),
    })
    (ok net)
  )
)

;; ---------- owner (bounded, never touches funds) ----------

(define-public (set-max-util-bps (v uint))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR_NOT_OWNER)
    (asserts! (and (>= v MIN_UTIL_CAP_BPS) (<= v MAX_UTIL_CAP_BPS)) ERR_BAD_PARAM)
    (ok (var-set max-util-bps v))
  )
)

(define-public (set-max-lent (v uint))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR_NOT_OWNER)
    (asserts! (> v u0) ERR_BAD_PARAM)
    (ok (var-set max-lent v))
  )
)

(define-public (set-fee-bps (v uint))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR_NOT_OWNER)
    (asserts! (<= v MAX_FEE_BPS) ERR_BAD_PARAM)
    (ok (var-set fee-bps v))
  )
)

(define-public (set-treasury (v principal))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR_NOT_OWNER)
    (asserts! (not (is-eq v current-contract)) ERR_BAD_PARAM)
    (ok (var-set treasury v))
  )
)

(define-public (set-owner (v principal))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR_NOT_OWNER)
    (ok (var-set owner v))
  )
)
