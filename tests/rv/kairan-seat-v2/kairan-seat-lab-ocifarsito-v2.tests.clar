;; ============================================================================
;; RENDEZVOUS harness for kairan-seat-lab-ocifarsito-v2 (appended to the fuzz
;; copy by tests/rv/kairan-seat-v2/build.mjs; the production file is untouched)
;; ============================================================================
;; Fuzz build rewrites (and nothing else):
;;   - USDCx  -> .usdcx       (local mock, asset "usdcx-token", 6 decimals)
;;   - sBTC   -> .sbtc-token  (local mock, asset "sbtc-token", 8 decimals)
;;   - LAB    -> wallet_1, FUNDRAISER -> wallet_2 (OWNER stays the deployer)
;;   - DEADLINE / SEAT_WINDOW -> heights RV's burn-block mining reaches
;; The mocks keep a flow ledger { from, to } -> amount, so the invariants see
;; every unit the contract sends and to whom, independent of the contract's
;; own bookkeeping.
;;
;; Invariant mode: RV calls the contract's public functions directly plus the
;; rv-* actions below (exact-remaining donate, direct USDCx sends, refund of
;; every account, fixed-string seat receipt / reserve claim) so the success
;; and failure paths are reached with random inputs. update-context (called
;; by RV after every successful call) feeds the ghost state.
;; Property mode: each test-* performs one action, checks its own pre/post
;; conditions, then re-checks every invariant.
;; ============================================================================

(define-constant RV_ACCOUNTS (list
  'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5
  'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC
  'ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND 'ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB
  'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0 'ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ
  'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP 'STNHKEPYEPJ8ET55ZZ0M5A34J0R3N5FM2CMMMAZ6))
(define-constant RV_LAB_STX0 (stx-get-balance LAB)) ;; LAB's STX before any claim

;; ---------------------------------------------------------------------------
;; Ghost state
;; ---------------------------------------------------------------------------
(define-map context (string-ascii 100) { called: uint })
(define-map rv-direct principal uint) ;; USDCx sent straight to the contract (not gifts)
(define-data-var rv-reached-snap (optional uint) none) ;; reached-at when first seen
(define-data-var rv-reached-ok bool true) ;; first sighting: same block, total = TARGET
(define-data-var rv-claim-snap (optional {
  kind: (string-ascii 7),
  burn-height: uint,
  builder: (string-ascii 128),
  repo: (string-ascii 256),
  link: (string-ascii 256),
  usdcx: uint,
  stx: uint,
  sats: uint,
}) none)
(define-data-var rv-refunded-at-seat (optional uint) none) ;; donor refunds when the seat was released
(define-data-var rv-open-total uint u0) ;; total last seen while raising was open
(define-data-var rv-reserve-deposits uint u0) ;; successful deposit-reserve calls
(define-data-var rv-swept-usdcx uint u0) ;; sweep transfers to LAB, excluded from refund accounting
(define-data-var rv-sweep-safe bool true)
(define-data-var rv-sweep-snapshot {
  initialized: bool,
  usdcx-contract: uint,
  usdcx-lab: uint,
  stx-contract: uint,
  stx-lab: uint,
  sats-contract: uint,
  sats-lab: uint,
} {
  initialized: false,
  usdcx-contract: u0,
  usdcx-lab: u0,
  stx-contract: u0,
  stx-lab: u0,
  sats-contract: u0,
  sats-lab: u0,
})

(define-private (rv-sweep-transfer-ok
    (contract-before uint) (contract-after uint)
    (lab-before uint) (lab-after uint))
  (or
    (and (is-eq contract-before contract-after) (is-eq lab-before lab-after))
    (and (is-eq contract-after u0) (is-eq lab-after (+ lab-before contract-before)))
  )
)

(define-private (rv-observe)
  (begin
    (match (var-get reached-at)
      r (if (is-none (var-get rv-reached-snap))
        (begin
          (var-set rv-reached-snap (some r))
          (var-set rv-reached-ok (and (var-get rv-reached-ok) (is-eq r burn-block-height)
            (is-eq (var-get total) TARGET))))
        true)
      true)
    (if (and (is-none (var-get rv-claim-snap)) (is-some (var-get claim)))
      (begin
        (var-set rv-claim-snap (var-get claim))
        (if (seat-claimed) (var-set rv-refunded-at-seat (some (rv-refunded-sum))) true))
      true)
    (if (and (is-none (var-get claim)) (< burn-block-height DEADLINE))
      (var-set rv-open-total (var-get total))
      true)
    true))

(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (let (
      (previous (var-get rv-sweep-snapshot))
      (usdcx-contract (usdcx-balance))
      (usdcx-lab (rv-bal LAB))
      (stx-contract (stx-get-balance current-contract))
      (stx-lab (stx-get-balance LAB))
      (sats-contract (reserve-sats))
      (sats-lab (rv-sats-of LAB))
    )
  (begin
    (map-set context function-name { called: called })
;; RV seeds the context with called = 0 for every function before the run
    (if (and (var-get rv-sweep-safe) (get initialized previous)
        (> called u0) (is-eq function-name "sweep"))
      (var-set rv-sweep-safe
        (and
          (rv-sweep-transfer-ok (get usdcx-contract previous) usdcx-contract
            (get usdcx-lab previous) usdcx-lab)
          (rv-sweep-transfer-ok (get stx-contract previous) stx-contract
            (get stx-lab previous) stx-lab)
          (rv-sweep-transfer-ok (get sats-contract previous) sats-contract
            (get sats-lab previous) sats-lab)))
      true)
    (if (and (get initialized previous) (> called u0) (is-eq function-name "sweep")
        (> (get usdcx-contract previous) u0) (is-eq usdcx-contract u0)
        (is-eq usdcx-lab (+ (get usdcx-lab previous) (get usdcx-contract previous))))
      (var-set rv-swept-usdcx (+ (var-get rv-swept-usdcx) (get usdcx-contract previous)))
      true)
    (var-set rv-sweep-snapshot {
      initialized: true,
      usdcx-contract: usdcx-contract,
      usdcx-lab: usdcx-lab,
      stx-contract: stx-contract,
      stx-lab: stx-lab,
      sats-contract: sats-contract,
      sats-lab: sats-lab,
    })
    (if (and (> called u0)
        (or (is-eq function-name "deposit-reserve") (is-eq function-name "rv-deposit-reserve")))
      (var-set rv-reserve-deposits (+ (var-get rv-reserve-deposits) u1))
      true)
    (rv-observe)
    (ok true))))

;; ---------------------------------------------------------------------------
;; Ledger helpers (all from the mock flow ledgers)
;; ---------------------------------------------------------------------------
(define-read-only (rv-bal (who principal))
  (unwrap-panic (contract-call? .usdcx get-balance who)))
(define-read-only (rv-sats-of (who principal))
  (unwrap-panic (contract-call? .sbtc-token get-balance who)))
(define-read-only (rv-gift (who principal))
  (default-to u0 (map-get? gifts who)))
(define-read-only (rv-claim-usdcx-to (who principal))
  (if (is-eq who LAB) (match (var-get claim) c (get usdcx c) u0) u0))
;; USDCx a principal gave through donate
(define-read-only (rv-given (who principal))
  (- (contract-call? .usdcx get-flow who current-contract) (default-to u0 (map-get? rv-direct who))))
;; USDCx paid back to a donor, excluding claims and owner sweeps to LAB
(define-read-only (rv-refunded (who principal))
  (-
    (- (contract-call? .usdcx get-flow current-contract who) (rv-claim-usdcx-to who))
    (if (is-eq who LAB) (var-get rv-swept-usdcx) u0)))

(define-private (rv-sum-gift (who principal) (acc uint)) (+ acc (rv-gift who)))
(define-private (rv-sum-given (who principal) (acc uint)) (+ acc (rv-given who)))
(define-private (rv-sum-refunded-f (who principal) (acc uint)) (+ acc (rv-refunded who)))
(define-private (rv-sum-out (who principal) (acc uint))
  (+ acc (contract-call? .usdcx get-flow current-contract who)))
(define-private (rv-sum-sbtc-in-others (who principal) (acc uint))
  (if (is-eq who FUNDRAISER) acc (+ acc (contract-call? .sbtc-token get-flow who current-contract))))
(define-read-only (rv-gifts-sum) (fold rv-sum-gift RV_ACCOUNTS u0))
(define-read-only (rv-refunded-sum) (fold rv-sum-refunded-f RV_ACCOUNTS u0))

(define-private (rv-account-ok (who principal) (acc bool))
  (and acc
    ;; never refunded more than given
    (<= (rv-refunded who) (rv-given who))
    ;; until the seat is released, gift = given - refunded, per donor
    (or (seat-claimed) (is-eq (+ (rv-gift who) (rv-refunded who)) (rv-given who)))))

;; ---------------------------------------------------------------------------
;; Invariants
;; ---------------------------------------------------------------------------

;; total never exceeds TARGET; total = every USDCx given through donate
(define-read-only (invariant-total-capped)
  (and
    (<= (var-get total) TARGET)
    (is-eq (var-get total) (fold rv-sum-given RV_ACCOUNTS u0))))

;; reached-at is set iff total = TARGET, was set in the block that hit TARGET,
;; and never changes after
(define-read-only (invariant-reached-at)
  (and
    (is-eq (is-some (var-get reached-at)) (is-eq (var-get total) TARGET))
    (var-get rv-reached-ok)
    (match (var-get rv-reached-snap) s (is-eq (var-get reached-at) (some s)) true)))

;; unrefunded = sum of the gifts map, and the contract holds at least that,
;; unless the seat was released (then unrefunded = 0)
(define-read-only (invariant-unrefunded-backed)
  (if (seat-claimed)
    (is-eq (var-get unrefunded) u0)
    (and
      (is-eq (var-get unrefunded) (rv-gifts-sum))
      (>= (usdcx-balance) (var-get unrefunded)))))

;; per donor: refunded <= given; refunds in total <= total raised
(define-read-only (invariant-refunds-bounded)
  (and
    (fold rv-account-ok RV_ACCOUNTS true)
    (<= (rv-refunded-sum) (var-get total))))

;; Funds leave only to LAB (claims) or donors (refunds <= their gifts): every
;; USDCx the contract sent went to a known account; sBTC and STX only to LAB,
;; including later sweeps; after a claim the reserve is empty.
(define-read-only (invariant-funds-only-to-lab-or-donors)
  (let ((c (var-get claim)))
    (and
      (is-eq (contract-call? .usdcx get-out-total current-contract) (fold rv-sum-out RV_ACCOUNTS u0))
      (fold rv-account-ok RV_ACCOUNTS true)
      (is-eq (contract-call? .sbtc-token get-out-total current-contract)
        (contract-call? .sbtc-token get-flow current-contract LAB))
      (>= (contract-call? .sbtc-token get-out-total current-contract) (match c x (get sats x) u0))
      (>= (stx-get-balance LAB) (+ RV_LAB_STX0 (match c x (get stx x) u0)))
      (match c x (and (is-eq (reserve-stx) u0) (is-eq (reserve-sats) u0)) true))))

;; Any observed sweep either leaves balances unchanged (it failed) or drains
;; every asset balance from the contract into LAB. USDCx and sBTC flow ledgers
;; also make any unknown recipient visible in invariant-funds-only-to-lab-or-donors.
(define-read-only (invariant-sweep-never-pays-anyone-but-lab)
  (and
    (var-get rv-sweep-safe)
    (is-eq (contract-call? .sbtc-token get-out-total current-contract)
      (contract-call? .sbtc-token get-flow current-contract LAB))
    (match (var-get claim)
      c (and
        (>= (contract-call? .usdcx get-flow current-contract LAB) (get usdcx c))
        (>= (contract-call? .sbtc-token get-out-total current-contract) (get sats c))
        (>= (stx-get-balance LAB) (+ RV_LAB_STX0 (get stx c))))
      true)))

;; at most one claim, never overwritten; seat/reserve claims only on their path
(define-read-only (invariant-single-claim)
  (and
    (match (var-get rv-claim-snap) s (is-eq (var-get claim) (some s)) true)
    (match (var-get claim)
      c (if (is-eq (get kind c) "seat")
        (match (var-get reached-at)
          r (and (>= (get burn-height c) r) (< (get burn-height c) (+ r SEAT_WINDOW))
            (>= (get usdcx c) TARGET))
          false)
        (and (is-eq (get kind c) "reserve") (>= (get burn-height c) (failure-at))))
      true)))

;; after release-seat, no refund ever leaves
(define-read-only (invariant-no-refund-after-seat)
  (match (var-get rv-refunded-at-seat) s (is-eq (rv-refunded-sum) s) true))

;; no gift is accepted after a claim or after DEADLINE
(define-read-only (invariant-no-gifts-after-close)
  (if (or (is-some (var-get claim)) (>= burn-block-height DEADLINE))
    (is-eq (var-get total) (var-get rv-open-total))
    true))

;; the reserve is deposited at most once, only by FUNDRAISER
(define-read-only (invariant-reserve-once)
  (and
    (<= (var-get rv-reserve-deposits) u1)
    (is-eq (var-get reserve-deposited) (is-eq (var-get rv-reserve-deposits) u1))
    (is-eq (fold rv-sum-sbtc-in-others RV_ACCOUNTS u0) u0)))

(define-read-only (rv-all-invariants)
  (and (invariant-total-capped) (invariant-reached-at) (invariant-unrefunded-backed)
    (invariant-refunds-bounded) (invariant-funds-only-to-lab-or-donors)
    (invariant-sweep-never-pays-anyone-but-lab)
    (invariant-single-claim) (invariant-no-refund-after-seat)
    (invariant-no-gifts-after-close) (invariant-reserve-once)))

;; ---------------------------------------------------------------------------
;; Actions for invariant mode (RV calls these like any public function)
;; ---------------------------------------------------------------------------
;; Finishing the raise is gated (1 in RV_REST_GATE calls; 0 = never) so the
;; raising phase sees many donors before TARGET; the "deadline" profile
;; disables it so TARGET is never hit and DEADLINE drives the failure path.
(define-constant RV_REST_GATE u8)
(define-private (rv-rest-open (go uint))
  (and (> RV_REST_GATE u0) (is-eq (mod go RV_REST_GATE) u0)))
;; A partial gift. With RV_REST_GATE = 0 ("deadline" profile) it always
;; leaves at least 1 unit unraised, so TARGET is never hit by these actions.
(define-private (rv-part (raw uint))
  (let ((rem (- TARGET (var-get total))))
    (if (> RV_REST_GATE u0)
      (if (> rem u0) (+ u1 (mod raw rem)) u1)
      (if (> rem u1) (+ u1 (mod raw (- rem u1))) u0))))

(define-public (rv-donate-rest (go uint) (agree bool))
  (begin
    (asserts! (rv-rest-open go) (err u9100))
    (donate (- TARGET (var-get total)) agree)))
(define-public (rv-donate-part (raw uint))
  (donate (rv-part raw) true))
(define-public (rv-send-direct (raw uint))
  (let ((amount (+ u1 (mod raw u1000000000))))
    (try! (contract-call? .usdcx transfer amount tx-sender current-contract none))
    (map-set rv-direct tx-sender (+ (default-to u0 (map-get? rv-direct tx-sender)) amount))
    (ok amount)))
(define-public (rv-deposit-reserve (stx-raw uint) (sats-raw uint))
  (deposit-reserve (mod stx-raw u1000000000) (mod sats-raw u1000000)))
(define-public (rv-request-seat)
  (request-seat "kairan-builder" "https://github.com/x/y" "https://letafricabuild.com/g" true))
(define-public (rv-claim-reserve)
  (claim-reserve "https://letafricabuild.com/pool" true))
(define-public (rv-refund-all)
  (refund-many RV_ACCOUNTS))

;; ---------------------------------------------------------------------------
;; Properties
;; ---------------------------------------------------------------------------
(define-constant RV_FAIL (err u9000))

(define-private (rv-finish (ok-prop bool) (code uint))
  (begin
    (rv-observe)
    (asserts! ok-prop (err code))
    (asserts! (rv-all-invariants) (err u9999))
    (ok true)))

(define-private (rv-check-donate (amount uint) (agree bool))
  (let (
      (t0 (var-get total))
      (remaining (- TARGET (var-get total)))
      (accepted (if (< amount remaining) amount remaining))
      (g0 (rv-gift tx-sender))
      (un0 (var-get unrefunded))
      (r0 (var-get reached-at))
      (closed (or (is-some (var-get claim)) (>= burn-block-height DEADLINE)))
      (res (donate amount agree))
    )
    (rv-finish
      (match res
        new-total (and (not closed) agree (> amount u0) (> remaining u0)
          (is-eq new-total (+ t0 accepted))
          (is-eq (rv-gift tx-sender) (+ g0 accepted))
          (is-eq (var-get unrefunded) (+ un0 accepted))
          (if (is-eq new-total TARGET)
            (and (is-none r0) (is-eq (var-get reached-at) (some burn-block-height)))
            (is-eq (var-get reached-at) r0)))
        e (and (is-eq (var-get total) t0) (is-eq (var-get reached-at) r0)
          ;; a gift that should land must not bounce
          (or closed (not agree) (is-eq amount u0) (is-eq remaining u0))))
      u9001)))

(define-public (test-donate (amount uint) (agree bool)) (rv-check-donate amount agree))
(define-public (test-donate-part (raw uint)) (rv-check-donate (rv-part raw) true))
(define-public (test-donate-rest (go uint))
  (if (rv-rest-open go) (rv-check-donate (- TARGET (var-get total)) true) (ok false)))

(define-public (test-send-direct (raw uint))
  (let ((b0 (usdcx-balance)) (t0 (var-get total)) (un0 (var-get unrefunded)) (amount (try! (rv-send-direct raw))))
    (rv-finish (and (is-eq (usdcx-balance) (+ b0 amount)) (is-eq (var-get total) t0)
      (is-eq (var-get unrefunded) un0)) u9002)))

;; deposit-reserve: once, FUNDRAISER only, any time before a claim
(define-public (test-deposit-reserve (stx-raw uint) (sats-raw uint))
  (let (
      (stx (mod stx-raw u1000000000))
      (sats (mod sats-raw u1000000))
      (s0 (reserve-stx))
      (k0 (reserve-sats))
      (expect (and (is-eq tx-sender FUNDRAISER) (not (var-get reserve-deposited))
        (or (> stx u0) (> sats u0)) (is-none (var-get claim))))
      (res (deposit-reserve stx sats))
    )
    (if (is-ok res) (var-set rv-reserve-deposits (+ (var-get rv-reserve-deposits) u1)) true)
    (rv-finish
      (and (is-eq (is-ok res) expect)
        (if (is-ok res)
          (and (var-get reserve-deposited) (is-eq (reserve-stx) (+ s0 stx)) (is-eq (reserve-sats) (+ k0 sats)))
          (and (is-eq (reserve-stx) s0) (is-eq (reserve-sats) k0))))
      u9003)))

(define-public (test-request-seat (builder (string-ascii 128)) (repo (string-ascii 256)) (grant (string-ascii 256)) (agree bool))
  (let (
      (q0 (var-get seat-request))
      (expect (and (is-eq tx-sender LAB) agree (is-eq (var-get total) TARGET) (is-none (var-get claim))
        (< burn-block-height (failure-at)) (< (+ burn-block-height REVIEW_WINDOW) (failure-at))
        (> (len builder) u0) (> (len repo) u0) (> (len grant) u0)))
      (res (request-seat builder repo grant agree))
    )
    (rv-finish
      (and (is-eq (is-ok res) expect)
        (if (is-ok res)
          (is-eq (var-get seat-request) (some { builder: builder, repo: repo, grant: grant }))
          (is-eq (var-get seat-request) q0)))
      u9004)))

(define-public (test-request-seat-fixed)
  (test-request-seat "kairan-builder" "https://github.com/x/y" "https://letafricabuild.com/g" true))

;; release-seat: OWNER only, pending request, inside the seat window; pays
;; LAB everything, nobody else gains
(define-public (test-release-seat)
  (let (
      (b0 (usdcx-balance)) (s0 (reserve-stx)) (k0 (reserve-sats))
      (lab-u (rv-bal LAB)) (lab-s (stx-get-balance LAB)) (lab-k (rv-sats-of LAB))
      (own-u (rv-bal OWNER)) (own-s (stx-get-balance OWNER)) (own-k (rv-sats-of OWNER))
      (fr-u (rv-bal FUNDRAISER)) (fr-s (stx-get-balance FUNDRAISER)) (fr-k (rv-sats-of FUNDRAISER))
      (r0 (var-get reached-at))
      (expect (and (is-eq tx-sender OWNER) (is-none (var-get claim)) (< burn-block-height (failure-at))
        (is-some (var-get seat-request))))
      (res (match (var-get seat-request)
        request (release-seat (get builder request) (get repo request) (get grant request))
        (err u107)))
    )
    (rv-finish
      (and (is-eq (is-ok res) expect)
        (if (is-ok res)
          (and
            (match r0 r (and (>= burn-block-height r) (< burn-block-height (+ r SEAT_WINDOW))) false)
            (is-eq (rv-bal LAB) (+ lab-u b0)) (is-eq (stx-get-balance LAB) (+ lab-s s0))
            (is-eq (rv-sats-of LAB) (+ lab-k k0))
            (is-eq (usdcx-balance) u0) (is-eq (reserve-stx) u0) (is-eq (reserve-sats) u0)
            (is-eq (var-get unrefunded) u0) (seat-claimed)
            (is-eq (rv-bal OWNER) own-u) (is-eq (stx-get-balance OWNER) own-s) (is-eq (rv-sats-of OWNER) own-k)
            (is-eq (rv-bal FUNDRAISER) fr-u) (is-eq (stx-get-balance FUNDRAISER) fr-s)
            (is-eq (rv-sats-of FUNDRAISER) fr-k))
          (and (is-eq (usdcx-balance) b0) (is-eq (reserve-stx) s0) (is-eq (reserve-sats) k0))))
      u9005)))

;; claim-reserve: LAB only, from failure-at, once; the USDCx extra never
;; touches what donors are owed
(define-private (rv-check-claim-reserve (url (string-ascii 256)) (agree bool))
  (let (
      (b0 (usdcx-balance)) (s0 (reserve-stx)) (k0 (reserve-sats))
      (un0 (var-get unrefunded)) (gs0 (rv-gifts-sum)) (lab-u (rv-bal LAB))
      (expect (and (is-eq tx-sender LAB) agree (is-none (var-get claim))
        (>= burn-block-height (failure-at)) (> (len url) u0)))
      (res (claim-reserve url agree))
    )
    (rv-finish
      (and (is-eq (is-ok res) expect)
        (if (is-ok res)
          (and (is-eq (rv-bal LAB) (+ lab-u (- b0 un0)))
            (is-eq (usdcx-balance) un0) (is-eq (var-get unrefunded) un0) (is-eq (rv-gifts-sum) gs0)
            (is-eq (reserve-stx) u0) (is-eq (reserve-sats) u0)
            (is-eq (get kind (unwrap-panic (var-get claim))) "reserve"))
          (and (is-eq (usdcx-balance) b0) (is-eq (reserve-stx) s0) (is-eq (reserve-sats) k0))))
      u9006)))

(define-public (test-claim-reserve (url (string-ascii 256)) (agree bool)) (rv-check-claim-reserve url agree))
(define-public (test-claim-reserve-fixed) (rv-check-claim-reserve "https://letafricabuild.com/pool" true))

;; sweep: OWNER only, after claim and all refunds; each balance goes to LAB.
(define-public (test-sweep)
  (let (
      (u-before (usdcx-balance))
      (s-before (reserve-stx))
      (k-before (reserve-sats))
      (lab-u-before (rv-bal LAB))
      (lab-s-before (stx-get-balance LAB))
      (lab-k-before (rv-sats-of LAB))
      (usdcx-out-before (contract-call? .usdcx get-out-total current-contract))
      (usdcx-to-lab-before (contract-call? .usdcx get-flow current-contract LAB))
      (sats-out-before (contract-call? .sbtc-token get-out-total current-contract))
      (sats-to-lab-before (contract-call? .sbtc-token get-flow current-contract LAB))
      (expect (and (is-eq tx-sender OWNER) (is-some (var-get claim))
        (is-eq (var-get unrefunded) u0)
        (or (> u-before u0) (> s-before u0) (> k-before u0))))
      (res (sweep))
    )
    (begin
      (if (and (is-ok res) (> u-before u0))
        (var-set rv-swept-usdcx (+ (var-get rv-swept-usdcx) u-before))
        true)
      (rv-finish
        (match res
          paid (and expect
            (is-eq paid { usdcx: u-before, stx: s-before, sats: k-before })
            (is-eq (usdcx-balance) u0)
            (is-eq (reserve-stx) u0) (is-eq (reserve-sats) u0)
            (is-eq (rv-bal LAB) (+ lab-u-before u-before))
            (is-eq (stx-get-balance LAB) (+ lab-s-before s-before))
            (is-eq (rv-sats-of LAB) (+ lab-k-before k-before))
            (is-eq (- (contract-call? .usdcx get-out-total current-contract) usdcx-out-before) u-before)
            (is-eq (- (contract-call? .usdcx get-flow current-contract LAB) usdcx-to-lab-before) u-before)
            (is-eq (- (contract-call? .sbtc-token get-out-total current-contract) sats-out-before) k-before)
            (is-eq (- (contract-call? .sbtc-token get-flow current-contract LAB) sats-to-lab-before) k-before))
          e (and (not expect)
            (is-eq (usdcx-balance) u-before)
            (is-eq (reserve-stx) s-before) (is-eq (reserve-sats) k-before)
            (is-eq (rv-bal LAB) lab-u-before)
            (is-eq (stx-get-balance LAB) lab-s-before)
            (is-eq (rv-sats-of LAB) lab-k-before)
            (is-eq (contract-call? .usdcx get-out-total current-contract) usdcx-out-before)
            (is-eq (contract-call? .usdcx get-flow current-contract LAB) usdcx-to-lab-before)
            (is-eq (contract-call? .sbtc-token get-out-total current-contract) sats-out-before)
            (is-eq (contract-call? .sbtc-token get-flow current-contract LAB) sats-to-lab-before)))
        u9009))))

;; refund-many: each listed donor gets exactly their gift once; others untouched
(define-private (rv-refund-ok (who principal) (g0 uint) (b0 uint) (listed (list 100 principal)))
  (if (is-some (index-of? listed who))
    (and (is-eq (rv-gift who) u0) (is-eq (rv-bal who) (+ b0 g0)))
    (and (is-eq (rv-gift who) g0) (is-eq (rv-bal who) b0))))
(define-private (rv-and (x bool) (acc bool)) (and acc x))

(define-private (rv-check-refund (who (list 100 principal)))
  (let (
      (gifts0 (map rv-gift RV_ACCOUNTS))
      (bals0 (map rv-bal RV_ACCOUNTS))
      (un0 (var-get unrefunded)) (gs0 (rv-gifts-sum))
      (expect (and (>= burn-block-height (failure-at)) (not (seat-claimed))))
      (res (refund-many who))
    )
    (rv-finish
      (and (is-eq (is-ok res) expect)
        (match res
          paid (and
            (is-eq paid (- gs0 (rv-gifts-sum)))
            (is-eq (var-get unrefunded) (- un0 paid))
            (<= paid un0)
            (fold rv-and (map rv-refund-ok RV_ACCOUNTS gifts0 bals0
              (list who who who who who who who who who who)) true))
          e (and (is-eq (var-get unrefunded) un0) (is-eq (rv-gifts-sum) gs0)
            ;; window still running: too early; window over but seat claimed: u114
            (if (< burn-block-height (failure-at)) (is-eq e u112) (is-eq e u114)))))
      u9007)))

(define-public (test-refund-many (who (list 100 principal))) (rv-check-refund who))
(define-public (test-refund-all) (rv-check-refund RV_ACCOUNTS))

;; a donor refunded twice gets 0 the second time (same call and next call)
(define-public (test-refund-twice (who principal))
  (if (not (and (>= burn-block-height (failure-at)) (not (seat-claimed))))
    (ok false)
    (let (
        (g0 (rv-gift who)) (b0 (rv-bal who))
        (first (unwrap! (refund-many (list who who)) RV_FAIL))
        (second (unwrap! (refund-many (list who)) RV_FAIL))
      )
      (rv-finish
        (and (is-eq first g0) (is-eq second u0) (is-eq (rv-bal who) (+ b0 g0)) (is-eq (rv-gift who) u0))
        u9008))))
