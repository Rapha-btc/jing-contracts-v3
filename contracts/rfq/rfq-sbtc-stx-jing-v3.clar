;; SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.rfq-sbtc-stx-jing

(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-constant PRICE_PRECISION u100000000)
(define-constant DECIMAL_FACTOR u100)
(define-constant BPS_PRECISION u10000)
(define-constant MAX_PREMIUM_BPS u2000)
(define-constant MAX_QUOTE_DRIFT_BPS u20)
;; ref benchmark must be contemporaneous: closes the true-but-stale loophole,
;; and keeps the drift band inside the vol window it was sized for
(define-constant MAX_REF_STALENESS u120)
(define-constant FEE_BPS u10)

;; v3: no on-chain price oracle. The client signs the exact quoted-out plus the
;; CEX ref-price it was derived from; fat-finger screening lives in the signing
;; frontend, and the drift band + client-set min-stx-out are the on-chain
;; protections. ref-price/ref-venue/ref-timestamp are recorded for TCA only.

(define-constant OPEN_TTL u6)

(define-constant SIP018_MSG_PREFIX 0x534950303138)

(define-constant SAINT 'SP000000000000000000002Q6VF78)

(define-constant ERR_AMOUNT_TOO_SMALL (err u1001))
(define-constant ERR_STALE_PRICE (err u1005))
(define-constant ERR_PAUSED (err u1010))
(define-constant ERR_NOT_AUTHORIZED (err u1011))
(define-constant ERR_ALREADY_INITIALIZED (err u1018))
(define-constant ERR_WRONG_TRAIT (err u1019))
(define-constant ERR_RFQ_NOT_FOUND (err u2001))
(define-constant ERR_RFQ_CLOSED (err u2002))
(define-constant ERR_EXPIRED (err u2003))
(define-constant ERR_NOT_EXPIRED (err u2004))
(define-constant ERR_PREMIUM_TOO_HIGH (err u2005))
(define-constant ERR_BELOW_MIN_OUT (err u2006))
(define-constant ERR_BAD_AUTH (err u2007))
(define-constant ERR_AUTH_EXPIRED (err u2008))
(define-constant ERR_ALREADY_FIXED (err u2011))
(define-constant ERR_NOT_FIXED (err u2012))
(define-constant ERR_NOT_WINNER (err u2013))
(define-constant ERR_QUOTE_DRIFT (err u2014))
(define-constant ERR_NOT_WHITELISTED (err u2015))
(define-constant ERR_BAD_REFERENCE (err u2016))

(define-data-var initialized bool false)
(define-data-var operator principal tx-sender)
(define-data-var treasury principal tx-sender)
(define-data-var paused bool false)

(define-data-var token-x principal SAINT)
(define-data-var token-y principal SAINT)
(define-data-var min-sbtc-in uint u0)

(define-data-var next-rfq-id uint u0)

(define-map whitelisted-mms principal bool)

(define-map rfqs
  uint
  {
    client: principal,
    sbtc-in: uint,
    min-stx-out: uint,
    open-expiry: uint,
    winner: (optional principal),
    fixed-stx-out: (optional uint),
    fixed-ref-price: (optional uint),
    open: bool,
  }
)

(define-read-only (get-domain-hash)
  (sha256 (unwrap-panic (to-consensus-buff? {
    name: "jing-rfq",
    version: "1",
    chain-id: chain-id,
  })))
)

(define-read-only (build-auth-hash
    (rfq-id uint)
    (winner principal)
    (quoted-out uint)
    (ref-price uint)
    (ref-timestamp uint)
    (ref-venue (string-ascii 16))
    (max-premium-bps uint)
    (auth-expiry uint)
  )
  (sha256 (concat SIP018_MSG_PREFIX
    (concat (get-domain-hash)
      (sha256 (unwrap-panic (to-consensus-buff? {
        market: current-contract,
        rfq-id: rfq-id,
        winner: winner,
        quoted-out: quoted-out,
        ref-price: ref-price,
        ref-timestamp: ref-timestamp,
        ref-venue: ref-venue,
        max-premium-bps: max-premium-bps,
        expiry: auth-expiry,
      })))
    )))
)

(define-read-only (get-rfq (id uint))
  (map-get? rfqs id)
)

(define-read-only (is-whitelisted-mm (mm principal))
  (default-to false (map-get? whitelisted-mms mm))
)

(define-read-only (get-next-rfq-id)
  (var-get next-rfq-id)
)

(define-public (open-rfq
    (sbtc-in uint)
    (min-stx-out uint)
    (x <ft-trait>)
    (x-name (string-ascii 128))
  )
  (let (
      (id (var-get next-rfq-id))
      (open-expiry (+ burn-block-height OPEN_TTL))
    )
    (asserts! (not (var-get paused)) ERR_PAUSED)
    (asserts! (is-eq (contract-of x) (var-get token-x)) ERR_WRONG_TRAIT)
    (asserts! (> sbtc-in (var-get min-sbtc-in)) ERR_AMOUNT_TOO_SMALL)
    (asserts! (> min-stx-out u0) ERR_AMOUNT_TOO_SMALL)
    (try! (contract-call? x transfer sbtc-in tx-sender current-contract none))
    (map-set rfqs id {
      client: tx-sender,
      sbtc-in: sbtc-in,
      min-stx-out: min-stx-out,
      open-expiry: open-expiry,
      winner: none,
      fixed-stx-out: none,
      fixed-ref-price: none,
      open: true,
    })
    (var-set next-rfq-id (+ id u1))
    (try! (contract-call? .jing-core-v2 log-rfq-open id tx-sender sbtc-in min-stx-out
      open-expiry (var-get token-x) (var-get token-y)
    ))
    (ok id)
  )
)

(define-public (fix-price
    (id uint)
    (committed-out uint)
    (quoted-out uint)
    (ref-price uint)
    (ref-timestamp uint)
    (ref-venue (string-ascii 16))
    (max-premium-bps uint)
    (auth-expiry uint)
    (sig (buff 65))
  )
  (let (
      (rfq (unwrap! (map-get? rfqs id) ERR_RFQ_NOT_FOUND))
      (mm tx-sender)
      (client (get client rfq))
      (sbtc-in (get sbtc-in rfq))
    )
    (asserts! (not (var-get paused)) ERR_PAUSED)
    (asserts! (is-whitelisted-mm mm) ERR_NOT_WHITELISTED)
    (asserts! (get open rfq) ERR_RFQ_CLOSED)
    (asserts! (is-none (get winner rfq)) ERR_ALREADY_FIXED)
    (asserts! (<= burn-block-height (get open-expiry rfq)) ERR_EXPIRED)
    (asserts! (<= max-premium-bps MAX_PREMIUM_BPS) ERR_PREMIUM_TOO_HIGH)
    (asserts! (< stacks-block-height auth-expiry) ERR_AUTH_EXPIRED)
    (asserts! (> ref-price u0) ERR_BAD_REFERENCE)
    (asserts! (> (len ref-venue) u0) ERR_BAD_REFERENCE)
    (asserts! (<= ref-timestamp stacks-block-time) ERR_BAD_REFERENCE)
    (asserts! (> ref-timestamp (- stacks-block-time MAX_REF_STALENESS))
      ERR_STALE_PRICE
    )

    (asserts!
      (is-eq
        (unwrap!
          (principal-of?
            (unwrap! (secp256k1-recover?
              (build-auth-hash id mm quoted-out ref-price ref-timestamp ref-venue
                max-premium-bps auth-expiry
              ) sig)
              ERR_BAD_AUTH
            ))
          ERR_BAD_AUTH
        )
        client
      )
      ERR_BAD_AUTH
    )

    (asserts! (>= committed-out (get min-stx-out rfq)) ERR_BELOW_MIN_OUT)
    (asserts!
      (>= (* committed-out BPS_PRECISION)
        (* quoted-out (- BPS_PRECISION MAX_QUOTE_DRIFT_BPS))
      )
      ERR_QUOTE_DRIFT
    )
    (asserts!
      (<= (* committed-out BPS_PRECISION)
        (* quoted-out (+ BPS_PRECISION MAX_QUOTE_DRIFT_BPS))
      )
      ERR_QUOTE_DRIFT
    )

    (map-set rfqs id (merge rfq {
      winner: (some mm),
      fixed-stx-out: (some committed-out),
      fixed-ref-price: (some ref-price),
    }))
    (print {
      event: "rfq-fix",
      rfq-id: id,
      client: client,
      mm: mm,
      sbtc-in: sbtc-in,
      stx-out: committed-out,
      quoted-out: quoted-out,
      ref-price: ref-price,
      ref-timestamp: ref-timestamp,
      ref-venue: ref-venue,
      open-expiry: (get open-expiry rfq),
    })
    (ok {
      stx-out: committed-out,
      open-expiry: (get open-expiry rfq),
      ref-price: ref-price,
    })
  )
)

(define-public (fulfill
    (id uint)
    (x <ft-trait>)
    (x-name (string-ascii 128))
  )
  (let (
      (rfq (unwrap! (map-get? rfqs id) ERR_RFQ_NOT_FOUND))
      (mm tx-sender)
      (client (get client rfq))
      (sbtc-in (get sbtc-in rfq))
      (winner (unwrap! (get winner rfq) ERR_NOT_FIXED))
      (stx-out (unwrap! (get fixed-stx-out rfq) ERR_NOT_FIXED))
      (ref-price (unwrap! (get fixed-ref-price rfq) ERR_NOT_FIXED))
      (fee (/ (* stx-out FEE_BPS) BPS_PRECISION))
      (client-receives (- stx-out fee))
    )
    (asserts! (get open rfq) ERR_RFQ_CLOSED)
    (asserts! (is-eq mm winner) ERR_NOT_WINNER)
    (asserts! (<= burn-block-height (get open-expiry rfq)) ERR_EXPIRED)
    (asserts! (is-eq (contract-of x) (var-get token-x)) ERR_WRONG_TRAIT)

    (and (> fee u0)
      (try! (stx-transfer? fee mm (var-get treasury)))
    )
    (try! (stx-transfer? client-receives mm client))

    (try! (as-contract? ((with-ft (contract-of x) x-name sbtc-in))
      (try! (contract-call? x transfer sbtc-in current-contract mm none))
    ))

    (map-set rfqs id (merge rfq { open: false }))
    (try! (contract-call? .jing-core-v2 log-rfq-fill id client mm sbtc-in stx-out
      fee ref-price (var-get token-x) (var-get token-y)
    ))
    (ok {
      stx-out: stx-out,
      fee: fee,
      client-receives: client-receives,
      ref-price: ref-price,
    })
  )
)

(define-public (reclaim
    (id uint)
    (x <ft-trait>)
    (x-name (string-ascii 128))
  )
  (let (
      (rfq (unwrap! (map-get? rfqs id) ERR_RFQ_NOT_FOUND))
      (sbtc-in (get sbtc-in rfq))
    )
    (asserts! (get open rfq) ERR_RFQ_CLOSED)
    (asserts! (is-eq (contract-of x) (var-get token-x)) ERR_WRONG_TRAIT)
    (asserts! (> burn-block-height (get open-expiry rfq)) ERR_NOT_EXPIRED)
    (try! (as-contract? ((with-ft (contract-of x) x-name sbtc-in))
      (try! (contract-call? x transfer sbtc-in current-contract (get client rfq) none))
    ))
    (map-set rfqs id (merge rfq { open: false }))
    (try! (contract-call? .jing-core-v2 log-rfq-cancel id (get client rfq) sbtc-in
      (var-get token-x) (var-get token-y)
    ))
    (ok sbtc-in)
  )
)

(define-public (initialize
    (canonical principal)
    (x principal)
    (y principal)
    (min-x uint)
  )
  (begin
    (asserts! (is-eq tx-sender (var-get operator)) ERR_NOT_AUTHORIZED)
    (asserts! (is-eq tx-sender (contract-call? .jing-core-v2 get-contract-owner))
      ERR_NOT_AUTHORIZED
    )
    (asserts! (not (var-get initialized)) ERR_ALREADY_INITIALIZED)
    (var-set token-x x)
    (var-set token-y y)
    (var-set min-sbtc-in min-x)
    (var-set initialized true)
    (try! (contract-call? .jing-core-v2 register canonical))
    (ok true)
  )
)

(define-public (set-treasury (new-treasury principal))
  (begin
    (asserts! (is-eq tx-sender (var-get operator)) ERR_NOT_AUTHORIZED)
    (ok (var-set treasury new-treasury))
  )
)

(define-public (set-paused (is-paused bool))
  (begin
    (asserts! (is-eq tx-sender (var-get operator)) ERR_NOT_AUTHORIZED)
    (ok (var-set paused is-paused))
  )
)

(define-public (set-operator (new-operator principal))
  (begin
    (asserts! (is-eq tx-sender (var-get operator)) ERR_NOT_AUTHORIZED)
    (ok (var-set operator new-operator))
  )
)

(define-public (set-min-sbtc-in (amount uint))
  (begin
    (asserts! (is-eq tx-sender (var-get operator)) ERR_NOT_AUTHORIZED)
    (ok (var-set min-sbtc-in amount))
  )
)

(define-public (set-mm-whitelist
    (mm principal)
    (whitelisted bool)
  )
  (begin
    (asserts! (is-eq tx-sender (var-get operator)) ERR_NOT_AUTHORIZED)
    (print {
      event: "rfq-mm-whitelist",
      mm: mm,
      whitelisted: whitelisted,
    })
    (ok (map-set whitelisted-mms mm whitelisted))
  )
)

