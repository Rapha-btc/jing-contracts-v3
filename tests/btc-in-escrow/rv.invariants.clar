;; ============================================================================
;; Rendezvous harness for jing-btc-in-escrow-v2 (appended by build.mjs).
;; sBTC is the REAL token (RV accounts hold genesis sBTC); the registry is
;; tests/btc-in-escrow/contracts/mock-registry.clar so any account can
;; "complete" a deposit. Txids fold onto 6 values x 2 vouts = 12 keys so arms,
;; executes and cancels collide; random txids from direct calls never hit a
;; completed deposit, so the 12 keys are every order that can exist.
;; ============================================================================

(define-constant RV_TXIDS (list
  0x0100000000000000000000000000000000000000000000000000000000000000
  0x0200000000000000000000000000000000000000000000000000000000000000
  0x0300000000000000000000000000000000000000000000000000000000000000
  0x0400000000000000000000000000000000000000000000000000000000000000
  0x0500000000000000000000000000000000000000000000000000000000000000
  0x0600000000000000000000000000000000000000000000000000000000000000
))
(define-constant RV_KEYS (list
  { t: u0, v: u0 } { t: u0, v: u1 } { t: u1, v: u0 } { t: u1, v: u1 }
  { t: u2, v: u0 } { t: u2, v: u1 } { t: u3, v: u0 } { t: u3, v: u1 }
  { t: u4, v: u0 } { t: u4, v: u1 } { t: u5, v: u0 } { t: u5, v: u1 }
))

;; Rendezvous context (this rv build expects the SUT to carry it)
(define-map context (string-ascii 100) { called: uint })
(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))

;; fixture, run once by the first rv-* call (RV redeploys an instrumented
;; copy, where top-level side effects abort): keepers, router liquidity,
;; short timeout so cancel is reachable
(define-data-var rv-ready bool false)
(define-private (rv-fixture)
  (if (var-get rv-ready)
    true
    (begin
      (var-set rv-ready true)
      (map-set keepers 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM true)
      (map-set keepers 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5 true)
      (map-set keepers 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG true)
      (var-set cancel-after-blocks u12)
      (unwrap-panic (stx-transfer? u1000000000000 tx-sender .mock-router-stx))
      (unwrap-panic (contract-call? .mock-usdcx mint u10000000000000 .mock-router-usdcx))
      (unwrap-panic (contract-call? .mock-router-usdcx set-stx-out false))
    )
  )
)

;; ghosts
(define-data-var rv-bad (optional (string-ascii 64)) none)
(define-data-var rv-arms uint u0)
(define-data-var rv-executes uint u0)
(define-data-var rv-cancels uint u0)
(define-data-var rv-rearm-rejects uint u0)

(define-private (rv-txid (seed uint))
  (unwrap-panic (element-at? RV_TXIDS (mod seed u6)))
)

(define-private (rv-status (txid (buff 32)) (vout uint))
  (match (map-get? orders { txid: txid, vout: vout })
    o (some (get status o))
    none
  )
)

(define-private (rv-flag (why (string-ascii 64)))
  (if (is-none (var-get rv-bad)) (var-set rv-bad (some why)) true)
)

;; legal: none -> none | open; open -> open | executed | cancelled;
;; executed / cancelled never change
(define-private (rv-check-transition (pre (optional uint)) (post (optional uint)))
  (match pre
    p (if (is-eq p STATUS_OPEN)
        (if (match post q (or (is-eq q STATUS_OPEN) (is-eq q STATUS_EXECUTED) (is-eq q STATUS_CANCELLED)) false)
          true
          (rv-flag "open left to an illegal status"))
        (if (is-eq post pre) true (rv-flag "terminal status changed")))
    (if (match post q (is-eq q STATUS_OPEN) true)
      true
      (rv-flag "new order not open")))
)

(define-public (rv-deposit (seed uint) (vout uint) (amount uint))
  (begin (rv-fixture) (contract-call? .mock-registry complete (rv-txid seed) (mod vout u2)
    (+ u546 (mod amount u300000)) tx-sender))
)

(define-public (rv-arm
    (to-stx bool)
    (seed uint)
    (vout-raw uint)
    (fee-raw uint)
    (slip-raw uint)
    (min-out uint)
    (arm-by-raw uint)
  )
  (let (
      (fx (rv-fixture))
      (txid (rv-txid seed))
      (vout (mod vout-raw u2))
      (pre (rv-status txid vout))
      (p0 (var-get parked))
      (r (if to-stx
        (arm-swap-sbtc-for-stx txid vout (mod fee-raw u6000) (mod slip-raw u10001)
          (mod min-out u3) (+ stacks-block-height (mod arm-by-raw u3)))
        (arm-swap-sbtc-for-usdcx txid vout (mod fee-raw u6000) (mod slip-raw u10001)
          (mod min-out u3) (+ stacks-block-height (mod arm-by-raw u3)))
      ))
      (post (rv-status txid vout))
    )
    (rv-check-transition pre post)
    (match r
      net (begin
        (if (is-some pre) (rv-flag "deposit armed twice") true)
        (if (is-eq (var-get parked) (+ p0 net)) true (rv-flag "arm parked delta"))
        (var-set rv-arms (+ (var-get rv-arms) u1)))
      e (begin
        (if (and (is-some pre) (is-eq e u4217)) (var-set rv-rearm-rejects (+ (var-get rv-rearm-rejects) u1)) true)
        (if (is-eq (var-get parked) p0) true (rv-flag "failed arm moved parked"))))
    (ok true)
  )
)

;; mode: 0 fill (unsold / rate random), 1 router err, 2 overspend by extra,
;; 3 gross refund cycle, plus a stale update
(define-public (rv-execute
    (seed uint)
    (vout-raw uint)
    (mode-raw uint)
    (unsold-raw uint)
    (extra-raw uint)
    (stale bool)
  )
  (let (
      (fx (rv-fixture))
      (txid (rv-txid seed))
      (vout (mod vout-raw u2))
      (pre (rv-status txid vout))
      (net (match (map-get? orders { txid: txid, vout: vout }) o (get net o) u0))
      (router-stx (match (map-get? orders { txid: txid, vout: vout }) o (is-eq (get router o) ROUTER_STX) true))
      (mode (mod mode-raw u4))
      (unsold (if (> net u0) (mod unsold-raw (+ net u1)) u0))
      (extra (mod extra-raw (+ net u2)))
      (p0 (var-get parked))
      (cfg (if router-stx
        (contract-call? .mock-router-stx configure mode unsold u1500 extra u0)
        (contract-call? .mock-router-usdcx configure mode unsold u1500 extra u0)))
      (r (execute txid vout (if stale 0xdead 0x01)))
      (post (rv-status txid vout))
    )
    (rv-check-transition pre post)
    (match r
      res (begin
        (if (is-eq pre (some STATUS_OPEN)) true (rv-flag "executed a non-open order"))
        (if (is-eq post (some STATUS_EXECUTED)) true (rv-flag "execute ok but not executed"))
        (if (is-eq (var-get parked) (- p0 net)) true (rv-flag "execute parked delta"))
        (if (<= (get spent res) net) true (rv-flag "execute spent > net"))
        (var-set rv-executes (+ (var-get rv-executes) u1)))
      e (begin
        (if (is-eq pre post) true (rv-flag "failed execute changed status"))
        (if (is-eq (var-get parked) p0) true (rv-flag "failed execute moved parked"))))
    (ok true)
  )
)

(define-public (rv-cancel (seed uint) (vout-raw uint))
  (let (
      (fx (rv-fixture))
      (txid (rv-txid seed))
      (vout (mod vout-raw u2))
      (pre (rv-status txid vout))
      (p0 (var-get parked))
      (r (cancel txid vout))
      (post (rv-status txid vout))
    )
    (rv-check-transition pre post)
    (match r
      net (begin
        (if (is-eq pre (some STATUS_OPEN)) true (rv-flag "cancelled a non-open order"))
        (if (is-eq post (some STATUS_CANCELLED)) true (rv-flag "cancel ok but not cancelled"))
        (if (is-eq (var-get parked) (- p0 net)) true (rv-flag "cancel parked delta"))
        (var-set rv-cancels (+ (var-get rv-cancels) u1)))
      e (if (is-eq pre post) true (rv-flag "failed cancel changed status")))
    (ok true)
  )
)

;; stray sBTC, then the owner tries to sweep one sat more than the stray
;; (must fail) and then exactly the stray (must pass)
(define-public (rv-donate-and-sweep (amount uint) (over bool))
  (let (
      (fx (rv-fixture))
      (d (mod amount u5000))
      (donated (if (> d u0) (is-ok (contract-call? SBTC transfer d tx-sender current-contract none)) false))
      (stray (- (sbtc-held) (var-get parked)))
    )
    (if (is-owner)
      (if over
        (if (is-err (sweep-sbtc (+ stray u1) tx-sender)) true (rv-flag "swept into parked"))
        (if (is-ok (sweep-sbtc stray tx-sender)) true (rv-flag "could not sweep stray")))
      true)
    (ok donated)
  )
)

;; --- invariants ---

(define-private (rv-open-net (k { t: uint, v: uint }) (acc uint))
  (match (map-get? orders { txid: (rv-txid (get t k)), vout: (get v k) })
    o (if (is-eq (get status o) STATUS_OPEN) (+ acc (get net o)) acc)
    acc
  )
)

(define-read-only (invariant-parked-is-sum-of-open-net)
  (is-eq (var-get parked) (fold rv-open-net RV_KEYS u0))
)

(define-read-only (rv-held)
  (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance current-contract))
)

(define-read-only (invariant-parked-is-held)
  (>= (rv-held) (var-get parked))
)

(define-read-only (invariant-no-bad-transition)
  (is-none (var-get rv-bad))
)

(define-private (rv-status-valid (k { t: uint, v: uint }) (acc bool))
  (and acc
    (match (map-get? orders { txid: (rv-txid (get t k)), vout: (get v k) })
      o (and (<= (get status o) STATUS_CANCELLED) (> (get net o) u0))
      true))
)

(define-read-only (invariant-status-domain)
  (fold rv-status-valid RV_KEYS true)
)

;; no STX / USDCx is ever left behind by an order (lazer fee is 0 here)
(define-read-only (invariant-no-stray-output)
  (and
    (is-eq (stx-get-balance current-contract) u0)
    (is-eq (unwrap-panic (contract-call? .mock-usdcx get-balance current-contract)) u0))
)

(define-read-only (rv-stats)
  {
    bad: (var-get rv-bad),
    arms: (var-get rv-arms),
    executes: (var-get rv-executes),
    cancels: (var-get rv-cancels),
    rearm-rejects: (var-get rv-rearm-rejects),
    parked: (var-get parked),
    held: (rv-held),
  }
)
