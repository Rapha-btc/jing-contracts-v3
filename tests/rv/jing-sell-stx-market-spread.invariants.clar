;; ============================================================================
;; RENDEZVOUS INVARIANTS for jing-sell-stx-market-spread (pooled pegged sell rung on markets v6)
;; ============================================================================
;; Append-only block; tests/rv/build.sh section 2f binds the rung to the v6
;; fuzz market (`.v6-market`, settle live through the mock Lazer oracle),
;; the mock ladder, the mock RFQ oracle and one mock-ft for sBTC and wstx,
;; and pre-initializes it at 331.50 sats per STX as the cap, 20 bps. RV fuzzes the
;; rung's member actions (deposit, withdraw, claim, push, sync); the rv-*
;; wrappers below play the rest of the market around it: the mid moves,
;; the opposite side rests and takes, competitors crowd the rung's side,
;; settlements run. Every wrapper that moves the market ends with `sync`
;; so the rung's view is current when the invariants read it.
;;
;; Mirrored file: the six rungs share this block up to the side (x / y),
;; the resting asset and the order they rest. Edit all six together.
;; ============================================================================

(define-map context (string-ascii 100) { called: uint })

(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))

(define-constant RV-ACCOUNTS (list
  'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM
  'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5
  'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG
  'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC
  'ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND
  'ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB
  'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0
  'ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ
  'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP
  'STNHKEPYEPJ8ET55ZZ0M5A34J0R3N5FM2CMMMAZ6))

;; same price band as the market target: [2.4e13, 4.0e13) in the market
;; unit, 250.00 to 416.67 sats per STX, around the rung's 331.50
(define-constant RV-MID-BASE u24000000000000)
(define-constant RV-MID-STEPS u16000)
(define-constant RV-MID-STEP u1000000000)

(define-private (rv-price (raw uint))
  (+ RV-MID-BASE (* (mod raw RV-MID-STEPS) RV-MID-STEP)))

;; ---------------------------------------------------------------------------
;; wrappers: the market around the rung
;; ---------------------------------------------------------------------------

(define-public (rv-set-mid (raw uint))
  (contract-call? .mock-lazer-oracle set-mid (rv-price raw)))

(define-public (rv-unpause-market)
  (contract-call? .v6-market rv-unpause))

;; a resting STX bid from the sender
(define-public (rv-bid (amount uint) (limit uint))
  (contract-call? .v6-market deposit-token-y amount (rv-price limit) none 0x
    .mock-ft "mock-ft"))

;; a resting sBTC ask from the sender
(define-public (rv-ask (amount uint) (limit uint))
  (contract-call? .v6-market deposit-token-x amount (rv-price limit) none 0x
    .mock-ft "mock-ft"))

(define-public (rv-cancel-bid)
  (contract-call? .v6-market cancel-token-y-deposit .mock-ft "mock-ft"))

(define-public (rv-cancel-ask)
  (contract-call? .v6-market cancel-token-x-deposit .mock-ft "mock-ft"))

(define-public (rv-settle)
  (begin
    (try! (contract-call? .v6-market settle-with-refresh 0x .mock-ft "mock-ft"
      .mock-ft "mock-ft"))
    (sync)))

;; a taker on the opposite side of the rung. The size is folded under 0.002
;; BTC (about 6 STX at the rung's price): RV's raw naturals run to 21 BTC
;; against a few thousand STX resting, and the market refuses a partial
;; fill (u1017), so an unfolded take never lands.
(define-public (rv-take (amount uint) (limit uint))
  (begin
    (try! (contract-call? .v6-market swap (+ u200 (mod amount u200000)) (rv-price limit) 0x
      .mock-ft "mock-ft" .mock-ft "mock-ft" true))
    (sync)))

;; ---------------------------------------------------------------------------
;; readers
;; ---------------------------------------------------------------------------

(define-private (rv-current-shares (a principal) (acc uint))
  (match (map-get? positions a)
    p (if (is-eq (get epoch p) (var-get epoch)) (+ acc (get shares p)) acc)
    acc))

(define-private (rv-unsold-fold (a principal) (acc uint))
  (+ acc (get stx (get-position a))))

(define-private (rv-proceeds-fold (a principal) (acc uint))
  (+ acc (get sbtc (get-position a))))

(define-private (rv-paid-ahead (a principal))
  (match (map-get? positions a)
    p (and (is-eq (get epoch p) (var-get epoch))
           (> (get paid-index p) (var-get proceeds-index)))
    false))

(define-private (rv-local)
  (stx-get-balance current-contract))

(define-private (rv-proceeds-balance)
  (unwrap-panic (contract-call? .mock-ft get-balance current-contract)))

;; ============================================================================
;; 1: what the rung holds off the market equals what it says it holds.
;; sync sets held from the balance; deposit, withdraw and push keep them
;; together. Drift here means an amount moved without the counter.
;; ============================================================================

(define-read-only (invariant-held-eq-local)
  (is-eq (var-get held-ustx) (rv-local)))

;; ============================================================================
;; 2: the proceeds watermark equals the proceeds balance. sync sets it,
;; settle-proceeds moves it down by exactly what it pays.
;; ============================================================================

(define-read-only (invariant-accounted-eq-balance)
  (is-eq (var-get sats-accounted) (rv-proceeds-balance)))

;; ============================================================================
;; 3: total shares equal the sum of the current epoch's member shares. A
;; closed epoch's members keep their rows (with their old epoch) and are
;; not counted.
;; ============================================================================

(define-read-only (invariant-total-shares-eq-sum)
  (is-eq (var-get total-shares) (fold rv-current-shares RV-ACCOUNTS u0)))

;; ============================================================================
;; 4-5: SOLVENCY of the unsold side. What the indices say is pooled never
;; exceeds what is actually resting plus held, and the members' claims on
;; it never exceed the pool.
;; ============================================================================

(define-read-only (invariant-pooled-le-actual)
  (<= (pooled-stx) (+ (market-size) (var-get held-ustx))))

(define-read-only (invariant-members-unsold-le-pooled)
  (<= (fold rv-unsold-fold RV-ACCOUNTS u0) (pooled-stx)))

;; ============================================================================
;; 6: SOLVENCY of the proceeds side. Every member's claimable proceeds
;; (current epoch against the live index, closed epochs against their
;; final index) fit in the balance.
;; ============================================================================

(define-read-only (invariant-members-proceeds-le-balance)
  (<= (fold rv-proceeds-fold RV-ACCOUNTS u0) (rv-proceeds-balance)))

;; ============================================================================
;; 7-8: the indices. unfilled-index only ever comes down from SCALE and a
;; pool under the sold-out threshold has closed its epoch and restarted;
;; no member's paid mark is ahead of the proceeds index.
;; ============================================================================

(define-read-only (invariant-unfilled-index-bounds)
  (and (<= (var-get unfilled-index) SCALE)
       (>= (var-get unfilled-index) SOLD_OUT_INDEX)))

(define-read-only (invariant-paid-index-le-proceeds)
  (is-eq (len (filter rv-paid-ahead RV-ACCOUNTS)) u0))

;; ============================================================================
;; 9: the order the rung rests with is the one it was deployed for. The
;; market may roll, park or partially fill it; it never reprices it.
;; ============================================================================

(define-read-only (invariant-resting-order-is-the-rung)
  (or (is-eq (market-size) u0)
      (let ((o (contract-call? .v6-market get-token-y-order current-contract)))
        (and (is-eq (get limit o) (var-get cap)) (is-eq (get spread-bps o) (some (var-get spread-bps)))))))

;; ============================================================================
;; 10: the rung is live or parked on the market, never both (the market's
;; own invariants check this for accounts; they are not evaluated here).
;; ============================================================================

(define-read-only (invariant-rung-never-live-and-parked)
  (not (and
    (> (contract-call? .v6-market get-token-y-deposit
         (contract-call? .v6-market get-current-cycle) current-contract) u0)
    (> (contract-call? .v6-market get-token-y-parked current-contract) u0))))
