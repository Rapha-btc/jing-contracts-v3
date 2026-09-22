;; ============================================================================
;; RENDEZVOUS INVARIANTS for jing-buy-stx (pooled fixed buy rung on markets v6)
;; ============================================================================
;; Append-only block; tests/rv/build.sh section 2f binds the rung to the v6
;; fuzz market (`.v6-market`, settle live through the mock Lazer oracle),
;; the mock ladder, the mock RFQ oracle and one mock-ft for sBTC and wstx,
;; and pre-initializes it at 331.50 sats per STX. RV fuzzes the
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

;; a taker on the opposite side of the rung
(define-public (rv-take (amount uint) (limit uint))
  (begin
    (try! (contract-call? .v6-market swap amount (rv-price limit) 0x
      .mock-ft "mock-ft" .mock-ft "mock-ft" false))
    (sync)))

;; ---------------------------------------------------------------------------
;; readers
;; ---------------------------------------------------------------------------

(define-private (rv-current-shares (a principal) (acc uint))
  (match (map-get? positions a)
    p (if (is-eq (get epoch p) (var-get epoch)) (+ acc (get shares p)) acc)
    acc))

(define-private (rv-unsold-fold (a principal) (acc uint))
  (+ acc (get sbtc (get-position a))))

(define-private (rv-proceeds-fold (a principal) (acc uint))
  (+ acc (get stx (get-position a))))

(define-private (rv-paid-ahead (a principal))
  (match (map-get? positions a)
    p (and (is-eq (get epoch p) (var-get epoch))
           (> (get paid-index p) (var-get proceeds-index)))
    false))

(define-private (rv-local)
  (unwrap-panic (contract-call? .mock-ft get-balance current-contract)))

(define-private (rv-proceeds-balance)
  (stx-get-balance current-contract))

;; ============================================================================
;; 1: what the rung holds off the market equals what it says it holds.
;; sync sets held from the balance; deposit, withdraw and push keep them
;; together. Drift here means an amount moved without the counter.
;; ============================================================================

(define-read-only (invariant-held-eq-local)
  (is-eq (var-get held-sats) (rv-local)))

;; ============================================================================
;; 2: the proceeds watermark equals the proceeds balance. sync sets it,
;; settle-proceeds moves it down by exactly what it pays.
;; ============================================================================

(define-read-only (invariant-accounted-eq-balance)
  (is-eq (var-get stx-accounted) (rv-proceeds-balance)))

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
  (<= (pooled-sbtc) (+ (market-size) (var-get held-sats))))

(define-read-only (invariant-members-unsold-le-pooled)
  (<= (fold rv-unsold-fold RV-ACCOUNTS u0) (pooled-sbtc)))

;; ============================================================================
;; 6: SOLVENCY of the proceeds side. Every member's claimable proceeds
;; (current epoch against the live index, closed epochs against their
;; final index) fit in the balance.
;; ============================================================================

(define-read-only (invariant-members-proceeds-le-balance)
  (<= (fold rv-proceeds-fold RV-ACCOUNTS u0) (rv-proceeds-balance)))

;; ============================================================================
;; 7-8: the indices. unfilled-index only ever comes down from SCALE and an
;; open epoch with shares holds at least SOLD_OUT_DUST (under it, sync has
;; closed the epoch and restarted);
;; no member's paid mark is ahead of the proceeds index.
;; ============================================================================

(define-read-only (invariant-unfilled-index-bounds)
  (and (<= (var-get unfilled-index) SCALE)
       ;; An OPEN epoch that still has shares must sit above BOTH floors. The
       ;; dust bound alone is on an amount and leaves the index unbounded below:
       ;; new-index is actual * SCALE / total-shares, so a growing total-shares
       ;; truncates it to 0 while the amount is still above dust, and at 0 a
       ;; deposit divides by zero and every withdraw is u7007, permanently.
       ;; This conjunct is the one that fails on that path.
       (or (is-eq (var-get total-shares) u0)
           (and (>= (+ (market-size) (rv-local)) SOLD_OUT_DUST)
                (>= (var-get unfilled-index) SOLD_OUT_INDEX)))))

(define-read-only (invariant-paid-index-le-proceeds)
  (is-eq (len (filter rv-paid-ahead RV-ACCOUNTS)) u0))

;; ============================================================================
;; 9: the order the rung rests with is the one it was deployed for. The
;; market may roll, park or partially fill it; it never reprices it.
;; ============================================================================

(define-read-only (invariant-resting-order-is-the-rung)
  (or (is-eq (market-size) u0)
      (let ((o (contract-call? .v6-market get-token-x-order current-contract)))
        (and (is-eq (get limit o) (var-get price)) (is-none (get spread-bps o))))))

;; ============================================================================
;; 10: the rung is live or parked on the market, never both (the market's
;; own invariants check this for accounts; they are not evaluated here).
;; ============================================================================

(define-read-only (invariant-rung-never-live-and-parked)
  (not (and
    (> (contract-call? .v6-market get-token-x-deposit
         (contract-call? .v6-market get-current-cycle) current-contract) u0)
    (> (contract-call? .v6-market get-token-x-parked current-contract) u0))))

;; ============================================================================
;; 11-12: a closed epoch's final index never runs ahead of the live one
;; (old members are paid against it); the rung holds no order row on the
;; market without a position (mirror of the market's stale-order check).
;; ============================================================================

(define-read-only (invariant-closed-epoch-index-le-live)
  (or (is-eq (var-get epoch) u0)
      (<= (final-index (- (var-get epoch) u1)) (var-get proceeds-index))))

(define-read-only (invariant-rung-no-stale-order)
  (or (> (market-size) u0)
      (is-eq (contract-call? .v6-market get-token-x-limit current-contract) u0)))

;; ============================================================================
;; PROPERTY TESTS (`rv . <rung> test`): the two anti-drain promises of the
;; pool. (ok true) passes, (ok false) discards, (err) or a panic fails.
;; ============================================================================

;; P1: DEPOSIT THEN WITHDRAW IT ALL never takes more out of the pool than
;; went in: the pool's assets (held here + resting on the market) after
;; are at least what they were before (the share-burn rounding class the
;; ladder bounty found). Measured on the pool, not the member: the mock
;; token mints a fresh wallet on its first transfer. A failure encodes the
;; shortfall: 9100000000 + (before - after).
(define-public (test-deposit-withdraw-no-drain (amount uint))
  (let (
      (amt (+ MIN_DEPOSIT (mod amount u1000000)))
      (before (+ (unwrap-panic (contract-call? .mock-ft get-balance current-contract)) (market-size)))
    )
    (match (deposit amt 0x)
      d (match (withdraw amt)
          w (let ((after (+ (unwrap-panic (contract-call? .mock-ft get-balance current-contract)) (market-size))))
              (if (>= after before) (ok true) (err (+ u9100000000 (- before after)))))
          e (ok false))
      e (ok false))))

;; P2: A WITHDRAWAL NEVER PAYS MORE THAN THE POSITION SHOWED before the call
;; (sync only ever shrinks the unsold side).
(define-public (test-withdraw-le-position (amount uint))
  (let (
      (pos (get sbtc (get-position tx-sender)))
      (before (unwrap-panic (contract-call? .mock-ft get-balance tx-sender)))
    )
    (if (is-eq pos u0)
      (ok false)
      (match (withdraw (+ u1 (mod amount u1000000)))
        w (if (<= (- (unwrap-panic (contract-call? .mock-ft get-balance tx-sender)) before) pos) (ok true) (err u9102))
        e (ok false)))))

;; drivers for test mode: the market around the rung (RV only calls
;; test-* functions there)
(define-public (test-drive-deposit (amount uint))
  (match (deposit (+ MIN_DEPOSIT (mod amount u1000000)) 0x) r (ok true) e (ok false)))
(define-public (test-drive-bid (amount uint) (limit uint))
  (match (rv-bid amount limit) r (ok true) e (ok false)))
(define-public (test-drive-ask (amount uint) (limit uint))
  (match (rv-ask amount limit) r (ok true) e (ok false)))
(define-public (test-drive-settle)
  (match (rv-settle) r (ok true) e (ok false)))
(define-public (test-drive-take (amount uint) (limit uint))
  (match (rv-take amount limit) r (ok true) e (ok false)))
(define-public (test-drive-set-mid (raw uint))
  (match (rv-set-mid raw) r (ok true) e (ok false)))
(define-public (test-drive-push)
  (match (push 0x) r (ok true) e (ok false)))
(define-public (test-drive-claim)
  (match (claim) r (ok true) e (ok false)))

;; ============================================================================
;; 13: a seated rung (a band seat on the ladder) is never parked. The market
;; checks this for accounts; its invariants are not evaluated in a rung run.
;; ============================================================================

(define-read-only (invariant-seated-never-parked)
  (or (not (contract-call? .mock-jing-ladder is-band-x current-contract))
      (is-eq (contract-call? .v6-market get-token-x-parked current-contract) u0)))

;; ============================================================================
;; 14: NO STRANDED PROCEEDS. What the rung holds in proceeds beyond the sum
;; of every member's claim (the live index for the current epoch, the final
;; index for a closed one) is rounding dust only: at most one unit per
;; member action (deposit, withdraw and claim each settle proceeds once,
;; and each settlement floors; the mock ladder counts the actions from the
;; rung's own logs). Two earlier bounds were wrong, per member and per
;; account per epoch, each replayed step by step with tests/rv/_replay.mjs. A credit against the wrong share count, or a
;; closed epoch that dropped a claim, is thousands of units, far above it.
;; ============================================================================

(define-private (rv-member-count (a principal) (acc uint))
  (if (is-some (map-get? positions a)) (+ acc u1) acc))

(define-read-only (invariant-no-stranded-proceeds)
  (<= (- (stx-get-balance current-contract) (fold rv-proceeds-fold RV-ACCOUNTS u0))
      (+ u1 (contract-call? .mock-jing-ladder get-action-count current-contract))))

;; P4: SYNC IS IDEMPOTENT. The reward-per-share fold every action runs
;; first: run it, snapshot, run it again, nothing moved.
(define-public (test-sync-idempotent)
  (match (sync)
    a (let (
        (i1 (var-get unfilled-index))
        (p1 (var-get proceeds-index))
        (h1 (var-get held-sats))
        (w1 (var-get stx-accounted))
        (e1 (var-get epoch))
        (t1 (var-get total-shares))
      )
      (match (sync)
        b (if (and
            (is-eq i1 (var-get unfilled-index))
            (is-eq p1 (var-get proceeds-index))
            (is-eq h1 (var-get held-sats))
            (is-eq w1 (var-get stx-accounted))
            (is-eq e1 (var-get epoch))
            (is-eq t1 (var-get total-shares)))
          (ok true)
          (err u9104))
        e (ok false)))
    e (ok false)))

;; P5: CLAIM IS IDEMPOTENT. A second claim in the same state pays nothing
;; and leaves the paid mark where the first put it.
(define-public (test-claim-idempotent)
  (match (claim)
    a (let (
        (bal (rv-proceeds-balance))
        (mark (get paid-index (default-to { epoch: u0, shares: u0, paid-index: u0 } (map-get? positions tx-sender))))
      )
      (match (claim)
        b (if (and (is-eq bal (rv-proceeds-balance))
                   (is-eq mark (get paid-index (default-to { epoch: u0, shares: u0, paid-index: u0 } (map-get? positions tx-sender)))))
          (ok true)
          (err u9105))
        e (ok false)))
    e (ok false)))

;; ============================================================================
;; 15: THE RUNG WAS NEVER MINTED. The mock token mints a sender short of a
;; transfer; a contract that gets minted tried to pay more sBTC than it held.
;; For the rung that is an insolvency the mint would otherwise hide.
;; ============================================================================

(define-read-only (invariant-rung-never-minted)
  (is-eq (contract-call? .mock-ft get-minted current-contract) u0))

;; Rich receipts must match actual transfers and the final accounting state.
(define-public (test-deposit-receipt (raw uint))
  (let ((amount (+ MIN_DEPOSIT (mod raw u1000000)))
        (before (stx-get-balance tx-sender)))
    (match (deposit amount 0x)
      receipt (if (and
          (is-eq (get amount receipt) amount)
          (is-eq (get shares receipt) (/ (* amount SCALE) (var-get unfilled-index)))
          (is-eq (get epoch receipt) (var-get epoch))
          (is-eq (get sbtc-paid receipt) u0)
          (is-eq (get stx-paid receipt) (- (stx-get-balance tx-sender) before)))
        (ok true) (err u9110))
      error (ok false))))

(define-public (test-withdraw-receipt (raw uint))
  (let ((amount (+ u1 (mod raw u1000000)))
        (stx-before (stx-get-balance tx-sender))
        (sbtc-before (unwrap-panic (contract-call? .mock-ft get-balance tx-sender))))
    (match (withdraw amount)
      receipt (if (and
          (is-eq (get stx receipt) (- (stx-get-balance tx-sender) stx-before))
          (is-eq (get sbtc receipt) (- (unwrap-panic (contract-call? .mock-ft get-balance tx-sender)) sbtc-before))
          (<= (get sbtc receipt) amount))
        (ok true) (err u9111))
      error (ok false))))

(define-public (test-claim-receipt)
  (let ((stx-before (stx-get-balance tx-sender))
        (sbtc-before (unwrap-panic (contract-call? .mock-ft get-balance tx-sender))))
    (match (claim)
      receipt (if (and
          (is-eq (get stx receipt) (- (stx-get-balance tx-sender) stx-before))
          (is-eq (get sbtc receipt) (- (unwrap-panic (contract-call? .mock-ft get-balance tx-sender)) sbtc-before)))
        (ok true) (err u9112))
      error (ok false))))
