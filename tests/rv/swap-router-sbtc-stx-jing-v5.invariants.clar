;; ============================================================================
;; RENDEZVOUS INVARIANTS + PROPERTIES for swap-router-sbtc-stx-jing-v5
;; ============================================================================
;; Append-only block; tests/rv/build.sh section 2h binds the router to the
;; v6 fuzz market (settle live through the mock Lazer oracle), one mock per
;; AMM and a wstx facade. The router is a pass-through by design: it holds
;; nothing, and what the user gives and gets must be exactly what it
;; reports. That is what is checked here, on random books, random splits,
;; random sizes, both directions, smart and manual entries.
;;
;; The AMM mocks pay exactly the minimum the router derived from the mock
;; pool state, so the numbers under test are the router's own sizing; a
;; leg the router sized wrong reverts in the mock like it would on chain.
;; ============================================================================

(define-map context (string-ascii 100) { called: uint })

(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))

(define-constant RV-MID-BASE u24000000000000)
(define-constant RV-MID-STEPS u16000)
(define-constant RV-MID-STEP u1000000000)

(define-private (rv-price (raw uint))
  (+ RV-MID-BASE (* (mod raw RV-MID-STEPS) RV-MID-STEP)))

(define-private (rv-mid)
  (contract-call? .mock-lazer-oracle get-mid))

;; sizes: sBTC under 0.5 BTC, STX under 5,000 STX (the AMM mocks pay from
;; what rv-fund-amms gave them)
(define-private (rv-sats (raw uint)) (+ u1 (mod raw u50000000)))
(define-private (rv-ustx (raw uint)) (+ u1 (mod raw u5000000000)))

;; ---------------------------------------------------------------------------
;; wrappers: the world around the router
;; ---------------------------------------------------------------------------

(define-public (rv-set-mid (raw uint))
  (contract-call? .mock-lazer-oracle set-mid (rv-price raw)))
(define-public (rv-bid (amount uint) (limit uint))
  (contract-call? .v6-market deposit-token-y amount (rv-price (+ limit u1)) none 0x .mock-ft "mock-ft"))
(define-public (rv-ask (amount uint) (limit uint))
  (contract-call? .v6-market deposit-token-x amount (rv-price (+ limit u1)) none 0x .mock-ft "mock-ft"))
(define-public (rv-peg-bid (amount uint) (cap uint) (spread uint))
  (contract-call? .v6-market deposit-token-y amount (rv-price (+ cap u1)) (some (mod spread u200)) 0x .mock-ft "mock-ft"))
(define-public (rv-peg-ask (amount uint) (floor uint) (spread uint))
  (contract-call? .v6-market deposit-token-x amount (rv-price (+ floor u1)) (some (mod spread u200)) 0x .mock-ft "mock-ft"))
(define-public (rv-cancel-bid)
  (contract-call? .v6-market cancel-token-y-deposit .mock-ft "mock-ft"))
(define-public (rv-cancel-ask)
  (contract-call? .v6-market cancel-token-x-deposit .mock-ft "mock-ft"))
(define-public (rv-settle)
  (contract-call? .v6-market settle-with-refresh 0x .mock-ft "mock-ft" .mock-ft "mock-ft"))
(define-public (rv-market-unpause)
  (contract-call? .v6-market rv-unpause))
(define-public (rv-market-reset-mins)
  (contract-call? .v6-market rv-reset-mins))
;; STX for the three AMM mocks to pay sBTC sellers with (10,000 STX each)
(define-public (rv-fund-amms)
  (begin
    (try! (stx-transfer? u10000000000 tx-sender .mock-dlmm-router-v5))
    (try! (stx-transfer? u10000000000 tx-sender .mock-xyk-core-v5))
    (try! (stx-transfer? u10000000000 tx-sender .mock-velar-pool))
    (ok true)))

;; the entries, with realistic sizes and the mock oracle's mid as the hint
(define-public (rv-smart-sell-sbtc (amount uint) (limit uint) (floor bool))
  (smart-swap-sbtc-for-stx (rv-sats amount) (rv-price (+ limit u1)) (some 0x) (rv-mid)
    (if floor u1 u0)))
(define-public (rv-smart-sell-stx (amount uint) (limit uint) (floor bool))
  (smart-swap-stx-for-sbtc (rv-ustx amount) (rv-price (+ limit u1)) (some 0x) (rv-mid)
    (if floor u1 u0)))

;; a random four-way split that sums to the amount, a random fallback
(define-private (rv-split (total uint) (a uint) (b uint) (c uint))
  (let (
      (j (mod a (+ total u1)))
      (d (mod b (+ (- total j) u1)))
      (x (mod c (+ (- total j d) u1)))
    )
    { jing: j, dlmm: d, xyk: x, velar: (- total j d x) }))
(define-private (rv-fallback (raw uint))
  (if (is-eq (mod raw u4) u0) none (some (+ u1 (mod raw u3)))))

(define-public (rv-manual-sell-sbtc (amount uint) (limit uint) (a uint) (b uint) (c uint) (f uint))
  (let ((total (rv-sats amount)) (s (rv-split (rv-sats amount) a b c)))
    (swap-sbtc-for-stx total (get jing s) (rv-price (+ limit u1)) (some 0x) (rv-fallback f)
      { dlmm: (get dlmm s), xyk: (get xyk s), velar: (get velar s) }
      { dlmm: u0, xyk: u0, velar: u0 } u0)))
(define-public (rv-manual-sell-stx (amount uint) (limit uint) (a uint) (b uint) (c uint) (f uint))
  (let ((total (rv-ustx amount)) (s (rv-split (rv-ustx amount) a b c)))
    (swap-stx-for-sbtc total (get jing s) (rv-price (+ limit u1)) (some 0x) (rv-fallback f)
      { dlmm: (get dlmm s), xyk: (get xyk s), velar: (get velar s) }
      { dlmm: u0, xyk: u0, velar: u0 } u0)))

;; ============================================================================
;; INVARIANT 1: THE ROUTER HOLDS NOTHING. Every leg moves funds between the
;; user and a venue; nothing rests here, in either token, ever.
;; ============================================================================

(define-read-only (invariant-router-holds-nothing)
  (and (is-eq (unwrap-panic (contract-call? .mock-ft get-balance current-contract)) u0)
       (is-eq (stx-get-balance current-contract) u0)))

;; ============================================================================
;; PROPERTIES: what the user gave and got is exactly what the router
;; reports. The mock token mints a fresh wallet on its first transfer, so a
;; user short of sBTC is topped up before the balances are read. A user who
;; also rests on the market is discarded: the batch clears both of a
;; principal's sides at the mid, so its own maker fills land in the same
;; balances and the deltas no longer isolate the router (a runtime underflow
;; in the first sweep, a taker whose own ask was filled by its own bid).
;; ============================================================================

(define-private (rv-user-rests)
  (let ((cycle (contract-call? .v6-market get-current-cycle)))
    (> (+ (contract-call? .v6-market get-token-x-deposit cycle tx-sender)
          (contract-call? .v6-market get-token-y-deposit cycle tx-sender)
          (contract-call? .v6-market get-token-x-parked tx-sender)
          (contract-call? .v6-market get-token-y-parked tx-sender)) u0)))

(define-private (rv-sbtc-of (who principal))
  (unwrap-panic (contract-call? .mock-ft get-balance who)))

(define-private (rv-top-up (amount uint))
  (if (< (rv-sbtc-of tx-sender) amount)
    (contract-call? .mock-ft transfer amount tx-sender .mock-jing-ladder none)
    (ok true)))

(define-private (rv-check-sell-sbtc
    (amount uint)
    (sbtc-before uint)
    (stx-before uint)
    (r {
      jing-ok: bool, jing-in: uint, jing-out: uint, dlmm-in: uint, dlmm-out: uint,
      xyk-in: uint, xyk-out: uint, velar-in: uint, velar-out: uint, unsold: uint, out: uint,
    }))
  (let (
      (sold (- amount (get unsold r)))
      (legs (+ (get jing-in r) (get dlmm-in r) (get xyk-in r) (get velar-in r)))
    )
    (if (not (is-eq (- sbtc-before (rv-sbtc-of tx-sender)) sold)) (err u9201)
    (if (not (is-eq (- (stx-get-balance tx-sender) stx-before) (get out r))) (err u9202)
    (if (not (is-eq (+ legs (get unsold r)) amount)) (err u9203)
    (if (not (is-eq (get out r) (+ (get jing-out r) (get dlmm-out r) (get xyk-out r) (get velar-out r)))) (err u9204)
    (ok true)))))))

(define-private (rv-check-sell-stx
    (amount uint)
    (sbtc-before uint)
    (stx-before uint)
    (r {
      jing-ok: bool, jing-in: uint, jing-out: uint, dlmm-in: uint, dlmm-out: uint,
      xyk-in: uint, xyk-out: uint, velar-in: uint, velar-out: uint, unsold: uint, out: uint,
    }))
  (let (
      (sold (- amount (get unsold r)))
      (legs (+ (get jing-in r) (get dlmm-in r) (get xyk-in r) (get velar-in r)))
    )
    (if (not (is-eq (- stx-before (stx-get-balance tx-sender)) sold)) (err u9211)
    (if (not (is-eq (- (rv-sbtc-of tx-sender) sbtc-before) (get out r))) (err u9212)
    (if (not (is-eq (+ legs (get unsold r)) amount)) (err u9213)
    (if (not (is-eq (get out r) (+ (get jing-out r) (get dlmm-out r) (get xyk-out r) (get velar-out r)))) (err u9214)
    (ok true)))))))

;; P1 smart sell sBTC: sBTC down by amount minus unsold, STX up by out,
;; the legs plus unsold sum to the amount, out is the sum of the leg outs.
(define-public (test-smart-sell-sbtc (amount uint) (limit uint) (floor bool))
  (let ((amt (rv-sats amount)))
    (asserts! (not (rv-user-rests)) (ok false))
    (unwrap! (rv-top-up amt) (ok false))
    (let ((sb (rv-sbtc-of tx-sender)) (xb (stx-get-balance tx-sender)))
      (match (smart-swap-sbtc-for-stx amt (rv-price (+ limit u1)) (some 0x) (rv-mid) (if floor u1 u0))
        r (rv-check-sell-sbtc amt sb xb r)
        e (ok false)))))

;; P2 smart sell STX, the mirror
(define-public (test-smart-sell-stx (amount uint) (limit uint) (floor bool))
  (let ((amt (rv-ustx amount)) (sb (rv-sbtc-of tx-sender)) (xb (stx-get-balance tx-sender)))
    (asserts! (not (rv-user-rests)) (ok false))
    (match (smart-swap-stx-for-sbtc amt (rv-price (+ limit u1)) (some 0x) (rv-mid) (if floor u1 u0))
      r (rv-check-sell-stx amt sb xb r)
      e (ok false))))

;; P3-P4 the manual entries with a random split and fallback
(define-public (test-manual-sell-sbtc (amount uint) (limit uint) (a uint) (b uint) (c uint) (f uint))
  (let ((amt (rv-sats amount)) (s (rv-split (rv-sats amount) a b c)))
    (asserts! (not (rv-user-rests)) (ok false))
    (unwrap! (rv-top-up amt) (ok false))
    (let ((sb (rv-sbtc-of tx-sender)) (xb (stx-get-balance tx-sender)))
      (match (swap-sbtc-for-stx amt (get jing s) (rv-price (+ limit u1)) (some 0x) (rv-fallback f)
          { dlmm: (get dlmm s), xyk: (get xyk s), velar: (get velar s) }
          { dlmm: u0, xyk: u0, velar: u0 } u0)
        r (rv-check-sell-sbtc amt sb xb r)
        e (ok false)))))

(define-public (test-manual-sell-stx (amount uint) (limit uint) (a uint) (b uint) (c uint) (f uint))
  (let ((amt (rv-ustx amount)) (s (rv-split (rv-ustx amount) a b c)) (sb (rv-sbtc-of tx-sender)) (xb (stx-get-balance tx-sender)))
    (asserts! (not (rv-user-rests)) (ok false))
    (match (swap-stx-for-sbtc amt (get jing s) (rv-price (+ limit u1)) (some 0x) (rv-fallback f)
        { dlmm: (get dlmm s), xyk: (get xyk s), velar: (get velar s) }
        { dlmm: u0, xyk: u0, velar: u0 } u0)
      r (rv-check-sell-stx amt sb xb r)
      e (ok false))))

;; P5 a floor is honoured: with min-out u1 a swap that returns ok paid > 0
(define-public (test-floor-honoured (amount uint) (limit uint) (sbtc bool))
  (match (if sbtc
      (smart-swap-sbtc-for-stx (rv-sats amount) (rv-price (+ limit u1)) (some 0x) (rv-mid) u1)
      (smart-swap-stx-for-sbtc (rv-ustx amount) (rv-price (+ limit u1)) (some 0x) (rv-mid) u1))
    r (if (> (get out r) u0) (ok true) (err u9221))
    e (ok false)))

;; drivers for test mode
(define-public (test-drive-bid (amount uint) (limit uint))
  (match (rv-bid amount limit) r (ok true) e (ok false)))
(define-public (test-drive-ask (amount uint) (limit uint))
  (match (rv-ask amount limit) r (ok true) e (ok false)))
(define-public (test-drive-peg-bid (amount uint) (cap uint) (spread uint))
  (match (rv-peg-bid amount cap spread) r (ok true) e (ok false)))
(define-public (test-drive-peg-ask (amount uint) (floor uint) (spread uint))
  (match (rv-peg-ask amount floor spread) r (ok true) e (ok false)))
(define-public (test-drive-cancel-bid)
  (match (rv-cancel-bid) r (ok true) e (ok false)))
(define-public (test-drive-cancel-ask)
  (match (rv-cancel-ask) r (ok true) e (ok false)))
(define-public (test-drive-set-mid (raw uint))
  (match (rv-set-mid raw) r (ok true) e (ok false)))
(define-public (test-drive-fund-amms)
  (match (rv-fund-amms) r (ok true) e (ok false)))
(define-public (test-drive-unpause-and-mins)
  (begin (unwrap-panic (rv-market-unpause)) (unwrap-panic (rv-market-reset-mins)) (ok true)))
