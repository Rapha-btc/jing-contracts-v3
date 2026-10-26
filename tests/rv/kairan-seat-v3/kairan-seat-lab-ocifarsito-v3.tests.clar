;; ============================================================================
;; RENDEZVOUS harness for kairan-seat-lab-ocifarsito-v3 (appended to the fuzz
;; copy by tests/rv/kairan-seat-v3/build.mjs; the production file is untouched)
;; ============================================================================
;; Fuzz build rewrites (and nothing else):
;;   - sBTC   -> .sbtc-token  (local mock, asset "sbtc-token", flow ledger)
;;   - LAB    -> wallet_1, FUNDRAISER -> wallet_2 (OWNER stays the deployer)
;; The sBTC mock keeps a flow ledger { from, to } -> amount. STX has no
;; ledger, so the harness tracks the contract's STX balance between calls
;; (rv-observe) and checks STX conservation over every devnet account.
;; DEADLINE / REVIEW_WINDOW keep their production values (deploy + 12960,
;; 1008): RV mines random empty burn blocks between calls (up to
;; 100000/runs per run), so a 600-run campaign crosses the deadline and
;; reaches release-before / recoup-after paths.
;;
;; Invariant mode: RV calls the contract's public functions directly plus the
;; rv-* actions below (gated release of the current request, fixed-string
;; requests, direct STX / sBTC sends) with random senders and inputs.
;; update-context (called by RV after every successful call) feeds the ghost
;; state. Property mode: each test-* performs one action, checks its exact
;; outcome (ok or the exact error code), then re-checks every invariant.
;; ============================================================================

(define-constant RV_ACCOUNTS (list
  'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5
  'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC
  'ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND 'ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB
  'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0 'ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ
  'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP 'STNHKEPYEPJ8ET55ZZ0M5A34J0R3N5FM2CMMMAZ6))
(define-private (rv-sum-stx (who principal) (acc uint)) (+ acc (stx-get-balance who)))
(define-constant RV_LAB_STX0 (stx-get-balance LAB)) ;; LAB's STX before any release
(define-constant RV_STX_TOTAL0 (fold rv-sum-stx RV_ACCOUNTS u0)) ;; all devnet STX (contract holds 0)
(define-private (rv-stx-of (who principal)) (stx-get-balance who))
(define-constant RV_STX0 (map rv-stx-of RV_ACCOUNTS)) ;; each account's STX at deploy

;; ---------------------------------------------------------------------------
;; Ghost state
;; ---------------------------------------------------------------------------
(define-map context (string-ascii 100) { called: uint })
(define-data-var rv-prev-stx uint u0) ;; contract STX at the last observation
(define-data-var rv-prev-sats uint u0) ;; contract sats at the last observation
(define-data-var rv-stx-out uint u0) ;; every STX decrease of the contract
(define-data-var rv-release-ok bool true) ;; release paid exactly the balance it saw
(define-data-var rv-claim-snap (optional {
  to: principal,
  burn-height: uint,
  description: (string-ascii 512),
  stx: uint,
  sats: uint,
}) none)
(define-data-var rv-request-snap (optional (string-ascii 512)) none) ;; request when the claim was seen
(define-data-var rv-direct-stx uint u0) ;; STX sent straight to the contract
(define-data-var rv-direct-sats uint u0) ;; sats sent straight to the contract
(define-map rv-direct-sats-by principal uint)
(define-data-var rv-lab-stx-sent uint u0) ;; STX LAB itself sent straight to the contract
(define-map rv-direct-stx-by principal uint) ;; STX each account sent straight to the contract
(define-data-var rv-direct-stx-at-claim uint u0)
(define-data-var rv-direct-sats-at-claim uint u0)
(define-data-var rv-fr-deposit-sats-at-claim uint u0)
(define-data-var rv-deposits-after-claim uint u0) ;; successful deposit-reserve after the claim
(define-data-var rv-deposits uint u0) ;; successful deposit-reserve calls

(define-read-only (rv-contract-stx) (stx-get-balance current-contract))
(define-read-only (rv-sats-of (who principal))
  (unwrap-panic (contract-call? .sbtc-token get-balance who)))
(define-read-only (rv-direct-sats-of (who principal))
  (default-to u0 (map-get? rv-direct-sats-by who)))
;; sats FUNDRAISER moved in through deposit-reserve (flow minus direct sends)
(define-read-only (rv-fr-deposit-sats)
  (- (contract-call? .sbtc-token get-flow FUNDRAISER current-contract) (rv-direct-sats-of FUNDRAISER)))
(define-private (rv-sum-sats-in (who principal) (acc uint))
  (+ acc (contract-call? .sbtc-token get-flow who current-contract)))

(define-private (rv-observe)
  (let (
      (cur-stx (rv-contract-stx))
      (cur-sats (reserve-sats))
      (prev-stx (var-get rv-prev-stx))
      (prev-sats (var-get rv-prev-sats))
    )
    ;; first sighting of the claim = the release that just ran: it must have
    ;; paid exactly the balance seen before it and left nothing behind
    (match (var-get claim)
      c (if (is-none (var-get rv-claim-snap))
        (begin
          (var-set rv-release-ok (and (var-get rv-release-ok)
            (is-eq (get stx c) prev-stx) (is-eq (get sats c) prev-sats)
            (is-eq cur-stx u0) (is-eq cur-sats u0)))
          (var-set rv-claim-snap (some c))
          (var-set rv-request-snap (var-get request))
          (var-set rv-direct-stx-at-claim (var-get rv-direct-stx))
          (var-set rv-direct-sats-at-claim (var-get rv-direct-sats))
          (var-set rv-fr-deposit-sats-at-claim (rv-fr-deposit-sats)))
        true)
      true)
    (if (< cur-stx prev-stx) (var-set rv-stx-out (+ (var-get rv-stx-out) (- prev-stx cur-stx))) true)
    (var-set rv-prev-stx cur-stx)
    (var-set rv-prev-sats cur-sats)
    true))

(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (begin
    (map-set context function-name { called: called })
    ;; RV seeds the context with called = 0 for every function before the run
    (if (and (> called u0)
        (or (is-eq function-name "deposit-reserve") (is-eq function-name "rv-deposit")))
      (begin
        (var-set rv-deposits (+ (var-get rv-deposits) u1))
        (if (is-some (var-get rv-claim-snap))
          (var-set rv-deposits-after-claim (+ (var-get rv-deposits-after-claim) u1))
          true))
      true)
    (rv-observe)
    (ok true)))

;; ---------------------------------------------------------------------------
;; Invariants
;; ---------------------------------------------------------------------------

;; Funds only ever leave to LAB or FUNDRAISER, exactly the recorded claim and
;; only to its `to`: every sat the contract sent went to LAB or FUNDRAISER and
;; matches the claim; the contract's STX outflow equals the claim; LAB's STX
;; moved by exactly the claim when it was the recipient (less what LAB itself
;; sent in); every other account except FUNDRAISER only lost what it sent in
;; itself; total STX is conserved, so the rest of the outflow went to
;; FUNDRAISER and nobody else gained.
(define-private (rv-bystander-ok (who principal) (stx0 uint))
  (or (is-eq who LAB) (is-eq who FUNDRAISER)
    (is-eq (+ (stx-get-balance who) (default-to u0 (map-get? rv-direct-stx-by who))) stx0)))
(define-read-only (invariant-funds-only-to-lab-or-fundraiser)
  (let (
      (c (var-get claim))
      (cs (match c x (get stx x) u0))
      (ck (match c x (get sats x) u0))
      (to-lab (match c x (is-eq (get to x) LAB) false))
      (to-fr (match c x (is-eq (get to x) FUNDRAISER) false))
      (out-sats (contract-call? .sbtc-token get-out-total current-contract))
      (lab-k-out (contract-call? .sbtc-token get-flow current-contract LAB))
      (fr-k-out (contract-call? .sbtc-token get-flow current-contract FUNDRAISER))
    )
    (and
      (is-eq (is-some c) (or to-lab to-fr))
      (is-eq out-sats (+ lab-k-out fr-k-out))
      (is-eq lab-k-out (if to-lab ck u0))
      (is-eq fr-k-out (if to-fr ck u0))
      (is-eq (reserve-sats) (- (fold rv-sum-sats-in RV_ACCOUNTS u0) out-sats))
      (is-eq (var-get rv-stx-out) cs)
      (is-eq (stx-get-balance LAB) (- (+ RV_LAB_STX0 (if to-lab cs u0)) (var-get rv-lab-stx-sent)))
      (is-none (index-of? (map rv-bystander-ok RV_ACCOUNTS RV_STX0) false))
      (is-eq (+ (fold rv-sum-stx RV_ACCOUNTS u0) (rv-contract-stx)) RV_STX_TOTAL0))))

;; The claim's recipient matches the clock: a release to LAB only before
;; DEADLINE (with the description LAB filed), a recoup to FUNDRAISER only
;; at/after DEADLINE (empty description).
(define-read-only (invariant-claim-deadline)
  (match (var-get claim)
    c (if (is-eq (get to c) LAB)
      (and (< (get burn-height c) DEADLINE) (> (len (get description c)) u0))
      (and (is-eq (get to c) FUNDRAISER) (>= (get burn-height c) DEADLINE)
        (is-eq (get description c) "")))
    true))

;; Once claimed: the claim never changes, deposit-reserve never succeeds again
;; and FUNDRAISER's deposited sats stay where they were at the claim.
(define-read-only (invariant-claim-frozen)
  (match (var-get rv-claim-snap)
    s (and
      (is-eq (var-get claim) (some s))
      (is-eq (var-get rv-deposits-after-claim) u0)
      (is-eq (rv-fr-deposit-sats) (var-get rv-fr-deposit-sats-at-claim)))
    (is-none (var-get claim))))

;; The release / recoup paid the whole STX + sBTC balance at that time; afterwards
;; the contract holds only what was sent straight to it since.
(define-read-only (invariant-release-full)
  (and
    (var-get rv-release-ok)
    (match (var-get rv-claim-snap)
      s (and
        (is-eq (rv-contract-stx) (- (var-get rv-direct-stx) (var-get rv-direct-stx-at-claim)))
        (is-eq (reserve-sats) (- (var-get rv-direct-sats) (var-get rv-direct-sats-at-claim))))
      true)))

;; The request can't change after the claim; a release to LAB records it.
(define-read-only (invariant-request-frozen)
  (match (var-get claim)
    c (and
      (or (not (is-eq (get to c) LAB)) (is-eq (var-get request) (some (get description c))))
      (match (var-get rv-claim-snap) s (is-eq (var-get request) (var-get rv-request-snap)) true))
    true))

;; A request, when present, is never empty.
(define-read-only (invariant-request-valid)
  (match (var-get request) d (> (len d) u0) true))

(define-read-only (rv-all-invariants)
  (and (invariant-funds-only-to-lab-or-fundraiser) (invariant-claim-deadline) (invariant-claim-frozen)
    (invariant-release-full) (invariant-request-frozen) (invariant-request-valid)))

;; ---------------------------------------------------------------------------
;; Actions for invariant mode (RV calls these like any public function)
;; ---------------------------------------------------------------------------
;; Releasing the current request is gated (1 in RV_RELEASE_GATE calls; 0 =
;; never) so the open phase sees many deposits, requests and direct sends.
;; Gate 0 (the "recoup" profile) also turns off every helper that releases a
;; known description (rv-release-pick, test-release-pick, test-release-current),
;; so nothing is released before DEADLINE and recoup-reserve gets reached.
(define-constant RV_RELEASE_GATE u16)
(define-private (rv-release-open (go uint))
  (and (> RV_RELEASE_GATE u0) (is-eq (mod go RV_RELEASE_GATE) u0)))
(define-private (rv-desc (pick uint))
  (unwrap-panic (element-at? (list "build 3 classrooms" "laptops for 20 builders" "Kairan's Seat stipend") (mod pick u3))))

(define-public (rv-deposit (stx-raw uint) (sats-raw uint))
  (deposit-reserve (mod stx-raw u1000000000) (mod sats-raw u1000000)))
(define-public (rv-send-stx (raw uint))
  (let ((amount (+ u1 (mod raw u1000000000))))
    (try! (stx-transfer? amount tx-sender current-contract))
    (var-set rv-direct-stx (+ (var-get rv-direct-stx) amount))
    (if (is-eq tx-sender LAB) (var-set rv-lab-stx-sent (+ (var-get rv-lab-stx-sent) amount)) true)
    (map-set rv-direct-stx-by tx-sender (+ (default-to u0 (map-get? rv-direct-stx-by tx-sender)) amount))
    (ok amount)))
(define-public (rv-send-sats (raw uint))
  (let ((amount (+ u1 (mod raw u1000000))))
    (try! (contract-call? .sbtc-token transfer amount tx-sender current-contract none))
    (var-set rv-direct-sats (+ (var-get rv-direct-sats) amount))
    (map-set rv-direct-sats-by tx-sender (+ (rv-direct-sats-of tx-sender) amount))
    (ok amount)))
(define-public (rv-request (pick uint))
  (request-reserve (rv-desc pick) true))
(define-public (rv-release-current (go uint))
  (begin
    (asserts! (rv-release-open go) (err u9100))
    (release-reserve (default-to "" (var-get request)))))
(define-public (rv-release-pick (pick uint))
  (begin
    (asserts! (> RV_RELEASE_GATE u0) (err u9100))
    (release-reserve (rv-desc pick))))

;; ---------------------------------------------------------------------------
;; Properties
;; ---------------------------------------------------------------------------
(define-private (rv-finish (ok-prop bool) (code uint))
  (begin
    (rv-observe)
    (asserts! ok-prop (err code))
    (asserts! (rv-all-invariants) (err u9999))
    (ok true)))

;; the expected result: u0 = ok, else the exact error code
(define-private (rv-code (res (response bool uint)))
  (match res x u0 e e))

;; deposit-reserve: FUNDRAISER only, before the release, something to move;
;; moves exactly stx + sats from FUNDRAISER into the contract
(define-private (rv-check-deposit (stx uint) (sats uint))
  (let (
      (s0 (rv-contract-stx)) (k0 (reserve-sats))
      (fs0 (stx-get-balance FUNDRAISER)) (fk0 (rv-sats-of FUNDRAISER))
      (want (if (not (is-eq tx-sender FUNDRAISER)) u105
        (if (is-some (var-get claim)) u106
          (if (and (is-eq stx u0) (is-eq sats u0)) u102 u0))))
      (res (deposit-reserve stx sats))
    )
    (if (is-ok res)
      (begin
        (var-set rv-deposits (+ (var-get rv-deposits) u1))
        (if (is-some (var-get rv-claim-snap))
          (var-set rv-deposits-after-claim (+ (var-get rv-deposits-after-claim) u1)) true))
      true)
    (rv-finish
      (and (is-eq (rv-code res) want)
        (if (is-ok res)
          (and (is-eq (rv-contract-stx) (+ s0 stx)) (is-eq (reserve-sats) (+ k0 sats))
            (is-eq (stx-get-balance FUNDRAISER) (- fs0 stx)) (is-eq (rv-sats-of FUNDRAISER) (- fk0 sats)))
          (and (is-eq (rv-contract-stx) s0) (is-eq (reserve-sats) k0))))
      u9001)))

(define-public (test-deposit (stx-raw uint) (sats-raw uint))
  (rv-check-deposit (mod stx-raw u1000000000) (mod sats-raw u1000000)))
(define-private (rv-check-deposit-over (stx uint) (sats uint))
  ;; more than the sender holds: fails cleanly, nothing moves
  (let ((s0 (rv-contract-stx)) (k0 (reserve-sats)) (res (deposit-reserve stx sats)))
    (rv-finish (and (is-eq (rv-code res) (if (is-eq tx-sender FUNDRAISER) (if (is-some (var-get claim)) u106 u1) u105))
      (is-eq (rv-contract-stx) s0) (is-eq (reserve-sats) k0)) u9002)))
(define-public (test-deposit-over-stx (extra uint))
  (rv-check-deposit-over (+ (stx-get-balance tx-sender) u1 (mod extra u1000000)) u0))
(define-public (test-deposit-over-sats (extra uint))
  (rv-check-deposit-over u0 (+ (rv-sats-of tx-sender) u1 (mod extra u1000000))))

;; request-reserve: LAB only, before the claim, TERMS accepted, non-empty,
;; more than REVIEW_WINDOW blocks before DEADLINE; replaces the request,
;; moves no funds
(define-private (rv-check-request (description (string-ascii 512)) (agree bool))
  (let (
      (q0 (var-get request)) (s0 (rv-contract-stx)) (k0 (reserve-sats))
      (want (if (not (is-eq tx-sender LAB)) u101
        (if (is-some (var-get claim)) u106
          (if (not agree) u103
            (if (is-eq (len description) u0) u104
              (if (>= (+ burn-block-height REVIEW_WINDOW) DEADLINE) u113 u0))))))
      (res (request-reserve description agree))
    )
    (rv-finish
      (and (is-eq (rv-code res) want)
        (is-eq (var-get request) (if (is-ok res) (some description) q0))
        (is-eq (rv-contract-stx) s0) (is-eq (reserve-sats) k0))
      u9003)))

(define-public (test-request (description (string-ascii 512)) (agree bool))
  (rv-check-request description agree))
(define-public (test-request-fixed (pick uint))
  (rv-check-request (rv-desc pick) true))

;; release-reserve: OWNER only, once, before DEADLINE, the request OWNER
;; reviewed, something to pay; pays LAB the whole STX + sBTC balance, nobody
;; else gains
(define-private (rv-check-release (description (string-ascii 512)))
  (let (
      (s0 (rv-contract-stx)) (k0 (reserve-sats))
      (lab-s (stx-get-balance LAB)) (lab-k (rv-sats-of LAB))
      (own-s (stx-get-balance OWNER)) (own-k (rv-sats-of OWNER))
      (fr-s (stx-get-balance FUNDRAISER)) (fr-k (rv-sats-of FUNDRAISER))
      (q0 (var-get request)) (c0 (var-get claim))
      (want (if (not (is-eq tx-sender OWNER)) u100
        (if (is-some c0) u106
          (if (>= burn-block-height DEADLINE) u113
            (if (is-none q0) u107
              (if (not (is-eq q0 (some description))) u115
                (if (and (is-eq s0 u0) (is-eq k0 u0)) u102 u0)))))))
      (res (release-reserve description))
    )
    (rv-finish
      (and (is-eq (match res x u0 e e) want)
        (is-eq (var-get request) q0)
        (match res
          paid (and
            (is-eq paid { stx: s0, sats: k0 })
            (is-eq (var-get claim) (some { to: LAB, burn-height: burn-block-height, description: description, stx: s0, sats: k0 }))
            (is-eq (rv-contract-stx) u0) (is-eq (reserve-sats) u0)
            (is-eq (stx-get-balance LAB) (+ lab-s s0)) (is-eq (rv-sats-of LAB) (+ lab-k k0))
            (is-eq (stx-get-balance OWNER) own-s) (is-eq (rv-sats-of OWNER) own-k)
            (is-eq (stx-get-balance FUNDRAISER) fr-s) (is-eq (rv-sats-of FUNDRAISER) fr-k))
          e (and (is-eq (var-get claim) c0) (is-eq (rv-contract-stx) s0) (is-eq (reserve-sats) k0)
            (is-eq (stx-get-balance LAB) lab-s) (is-eq (rv-sats-of LAB) lab-k))))
      u9004)))

(define-public (test-release (description (string-ascii 512))) (rv-check-release description))
(define-public (test-release-pick (pick uint))
  (if (> RV_RELEASE_GATE u0) (rv-check-release (rv-desc pick)) (ok false)))
;; ungated: property mode has fewer calls per campaign, so the release
;; must be reachable without the invariant-mode gate
(define-public (test-release-current)
  (if (and (> RV_RELEASE_GATE u0) (is-some (var-get request)))
    (rv-check-release (default-to "" (var-get request))) (ok false)))

;; recoup-reserve: FUNDRAISER only (contract-caller), once, nothing claimed,
;; at/after DEADLINE, something to pay; pays FUNDRAISER the whole STX + sBTC
;; balance, records { to: FUNDRAISER, description: "" }, nobody else gains
(define-public (test-recoup)
  (let (
      (s0 (rv-contract-stx)) (k0 (reserve-sats))
      (lab-s (stx-get-balance LAB)) (lab-k (rv-sats-of LAB))
      (own-s (stx-get-balance OWNER)) (own-k (rv-sats-of OWNER))
      (fr-s (stx-get-balance FUNDRAISER)) (fr-k (rv-sats-of FUNDRAISER))
      (q0 (var-get request)) (c0 (var-get claim))
      (want (if (not (is-eq tx-sender FUNDRAISER)) u105
        (if (is-some c0) u106
          (if (< burn-block-height DEADLINE) u112
            (if (and (is-eq s0 u0) (is-eq k0 u0)) u102 u0)))))
      (res (recoup-reserve))
    )
    (rv-finish
      (and (is-eq (match res x u0 e e) want)
        (is-eq (var-get request) q0)
        (match res
          paid (and
            (is-eq paid { stx: s0, sats: k0 })
            (is-eq (var-get claim) (some { to: FUNDRAISER, burn-height: burn-block-height, description: "", stx: s0, sats: k0 }))
            (is-eq (rv-contract-stx) u0) (is-eq (reserve-sats) u0)
            (is-eq (stx-get-balance FUNDRAISER) (+ fr-s s0)) (is-eq (rv-sats-of FUNDRAISER) (+ fr-k k0))
            (is-eq (stx-get-balance LAB) lab-s) (is-eq (rv-sats-of LAB) lab-k)
            (or (is-eq OWNER FUNDRAISER) (and (is-eq (stx-get-balance OWNER) own-s) (is-eq (rv-sats-of OWNER) own-k))))
          e (and (is-eq (var-get claim) c0) (is-eq (rv-contract-stx) s0) (is-eq (reserve-sats) k0)
            (is-eq (stx-get-balance FUNDRAISER) fr-s) (is-eq (rv-sats-of FUNDRAISER) fr-k))))
      u9008)))

;; direct sends: land in the contract, change nothing else; after the
;; claim they stay in the contract (v3 has no sweep)
(define-public (test-send-stx (raw uint))
  (let ((s0 (rv-contract-stx)) (c0 (var-get claim)) (q0 (var-get request)) (amount (try! (rv-send-stx raw))))
    (rv-finish (and (is-eq (rv-contract-stx) (+ s0 amount)) (is-eq (var-get claim) c0)
      (is-eq (var-get request) q0)) u9005)))
(define-public (test-send-sats (raw uint))
  (let ((k0 (reserve-sats)) (c0 (var-get claim)) (q0 (var-get request)) (amount (try! (rv-send-sats raw))))
    (rv-finish (and (is-eq (reserve-sats) (+ k0 amount)) (is-eq (var-get claim) c0)
      (is-eq (var-get request) q0)) u9006)))

;; status mirrors the balances and the claim flag
(define-public (test-status)
  (let ((s (get-status)))
    (rv-finish (and (is-eq (get stx s) (rv-contract-stx)) (is-eq (get sats s) (reserve-sats))
      (is-eq (get claimed s) (is-some (var-get claim))) (is-eq (get lab s) LAB)
      (is-eq (get owner s) OWNER) (is-eq (get fundraiser s) FUNDRAISER)
      (is-eq (get deadline s) DEADLINE)) u9007)))
