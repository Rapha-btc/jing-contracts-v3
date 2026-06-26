(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)
(use-trait pyth-storage-trait 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-traits-v2.storage-trait)
(use-trait pyth-decoder-trait 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-traits-v2.decoder-trait)
(use-trait wormhole-core-trait 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.wormhole-traits-v2.core-trait)

(define-constant PRICE_PRECISION u100000000)
(define-constant DECIMAL_FACTOR u100)
(define-constant BPS_PRECISION u10000)
(define-constant MAX_PREMIUM_BPS u2000)
(define-constant FEE_BPS u10)
(define-constant MAX_STALENESS u80)
(define-constant MAX_CONF_RATIO u50)

(define-constant OPEN_TTL u6)

(define-constant SIP018_MSG_PREFIX 0x534950303138)

(define-constant SAINT 'SP000000000000000000002Q6VF78)
(define-constant SAINT_FEED 0x0000000000000000000000000000000000000000000000000000000000000000)

(define-constant ERR_AMOUNT_TOO_SMALL (err u1001))
(define-constant ERR_STALE_PRICE (err u1005))
(define-constant ERR_PRICE_UNCERTAIN (err u1006))
(define-constant ERR_ZERO_PRICE (err u1009))
(define-constant ERR_PAUSED (err u1010))
(define-constant ERR_NOT_AUTHORIZED (err u1011))
(define-constant ERR_ALREADY_INITIALIZED (err u1018))
(define-constant ERR_WRONG_TRAIT (err u1019))
(define-constant ERR_EXPO_MISMATCH (err u1020))
(define-constant ERR_RFQ_NOT_FOUND (err u2001))
(define-constant ERR_RFQ_CLOSED (err u2002))
(define-constant ERR_EXPIRED (err u2003))
(define-constant ERR_NOT_EXPIRED (err u2004))
(define-constant ERR_PREMIUM_TOO_HIGH (err u2005))
(define-constant ERR_BELOW_MIN_OUT (err u2006))
(define-constant ERR_BAD_AUTH (err u2007))
(define-constant ERR_AUTH_EXPIRED (err u2008))
(define-constant ERR_ABOVE_MAX_OUT (err u2009))
(define-constant ERR_ALREADY_FIXED (err u2011))
(define-constant ERR_NOT_FIXED (err u2012))
(define-constant ERR_NOT_WINNER (err u2013))

(define-data-var initialized bool false)
(define-data-var operator principal tx-sender)
(define-data-var treasury principal tx-sender)
(define-data-var paused bool false)

(define-data-var token-x principal SAINT)
(define-data-var token-y principal SAINT)
(define-data-var oracle-feed-x (buff 32) SAINT_FEED)
(define-data-var oracle-feed-y (buff 32) SAINT_FEED)
(define-data-var min-sbtc-in uint u0)

(define-data-var next-rfq-id uint u0)

(define-map rfqs
  uint
  {
    client: principal,
    sbtc-in: uint,
    min-stx-out: uint,
    open-expiry: uint,
    winner: (optional principal),
    fixed-stx-out: (optional uint),
    fixed-oracle-price: (optional uint),
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
    (max-premium-bps uint)
    (auth-expiry uint)
  )
  (sha256 (concat SIP018_MSG_PREFIX
    (concat (get-domain-hash)
      (sha256 (unwrap-panic (to-consensus-buff? {
        market: current-contract,
        rfq-id: rfq-id,
        winner: winner,
        max-premium-bps: max-premium-bps,
        expiry: auth-expiry,
      })))
    )))
)

(define-read-only (get-rfq (id uint))
  (map-get? rfqs id)
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
      fixed-oracle-price: none,
      open: true,
    })
    (var-set next-rfq-id (+ id u1))
    (try! (contract-call? .jing-core log-rfq-open id tx-sender sbtc-in min-stx-out
      open-expiry (var-get token-x) (var-get token-y)
    ))
    (ok id)
  )
)

(define-public (fix-price
    (id uint)
    (committed-out uint)
    (max-premium-bps uint)
    (auth-expiry uint)
    (sig (buff 65))
    (vaa-x (buff 8192))
    (vaa-y (buff 8192))
    (pyth-storage <pyth-storage-trait>)
    (pyth-decoder <pyth-decoder-trait>)
    (wormhole-core <wormhole-core-trait>)
  )
  (let (
      (rfq (unwrap! (map-get? rfqs id) ERR_RFQ_NOT_FOUND))
      (mm tx-sender)
      (client (get client rfq))
      (sbtc-in (get sbtc-in rfq))
    )
    (asserts! (not (var-get paused)) ERR_PAUSED)
    (asserts! (get open rfq) ERR_RFQ_CLOSED)
    (asserts! (is-none (get winner rfq)) ERR_ALREADY_FIXED)
    (asserts! (<= burn-block-height (get open-expiry rfq)) ERR_EXPIRED)
    (asserts! (<= max-premium-bps MAX_PREMIUM_BPS) ERR_PREMIUM_TOO_HIGH)
    (asserts! (< stacks-block-height auth-expiry) ERR_AUTH_EXPIRED)

    (asserts!
      (is-eq
        (unwrap!
          (principal-of?
            (unwrap! (secp256k1-recover?
              (build-auth-hash id mm max-premium-bps auth-expiry) sig)
              ERR_BAD_AUTH
            ))
          ERR_BAD_AUTH
        )
        client
      )
      ERR_BAD_AUTH
    )

    (try! (contract-call? 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4
      verify-and-update-price-feeds vaa-x {
      pyth-storage-contract: pyth-storage,
      pyth-decoder-contract: pyth-decoder,
      wormhole-core-contract: wormhole-core,
    }))
    (try! (contract-call? 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4
      verify-and-update-price-feeds vaa-y {
      pyth-storage-contract: pyth-storage,
      pyth-decoder-contract: pyth-decoder,
      wormhole-core-contract: wormhole-core,
    }))
    (let (
        (feed-x (unwrap!
          (contract-call? 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-storage-v4
            get-price (var-get oracle-feed-x))
          ERR_ZERO_PRICE
        ))
        (feed-y (unwrap!
          (contract-call? 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-storage-v4
            get-price (var-get oracle-feed-y))
          ERR_ZERO_PRICE
        ))
        (price-x (to-uint (get price feed-x)))
        (price-y (to-uint (get price feed-y)))
        (min-freshness (- stacks-block-time MAX_STALENESS))
      )
    (asserts! (> price-x u0) ERR_ZERO_PRICE)
    (asserts! (> price-y u0) ERR_ZERO_PRICE)
    (asserts! (> (get publish-time feed-x) min-freshness) ERR_STALE_PRICE)
    (asserts! (> (get publish-time feed-y) min-freshness) ERR_STALE_PRICE)
    (asserts! (< (get conf feed-x) (/ price-x MAX_CONF_RATIO)) ERR_PRICE_UNCERTAIN)
    (asserts! (< (get conf feed-y) (/ price-y MAX_CONF_RATIO)) ERR_PRICE_UNCERTAIN)
    (asserts! (is-eq (get expo feed-x) (get expo feed-y)) ERR_EXPO_MISMATCH)


    (let (
        (oracle-price (/ (* price-x PRICE_PRECISION) price-y))
        (stx-mid (/ (* sbtc-in oracle-price) (* PRICE_PRECISION DECIMAL_FACTOR)))
        (floor (/ (* stx-mid (- BPS_PRECISION max-premium-bps)) BPS_PRECISION))
        (ceiling (/ (* stx-mid (+ BPS_PRECISION MAX_PREMIUM_BPS)) BPS_PRECISION))
      )
      (asserts! (> oracle-price u0) ERR_ZERO_PRICE)
      (asserts! (>= committed-out floor) ERR_PREMIUM_TOO_HIGH)
      (asserts! (>= committed-out (get min-stx-out rfq)) ERR_BELOW_MIN_OUT)
      (asserts! (<= committed-out ceiling) ERR_ABOVE_MAX_OUT)

      (map-set rfqs id (merge rfq {
        winner: (some mm),
        fixed-stx-out: (some committed-out),
        fixed-oracle-price: (some oracle-price),
      }))
      (print {
        event: "rfq-fix",
        rfq-id: id,
        client: client,
        mm: mm,
        sbtc-in: sbtc-in,
        stx-out: committed-out,
        oracle-price: oracle-price,
        open-expiry: (get open-expiry rfq),
      })
      (ok {
        stx-out: committed-out,
        open-expiry: (get open-expiry rfq),
        oracle-price: oracle-price,
      })
    )
    )
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
      (oracle-price (unwrap! (get fixed-oracle-price rfq) ERR_NOT_FIXED))
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
    (try! (contract-call? .jing-core log-rfq-fill id client mm sbtc-in stx-out
      fee oracle-price (var-get token-x) (var-get token-y)
    ))
    (ok {
      stx-out: stx-out,
      fee: fee,
      client-receives: client-receives,
      oracle-price: oracle-price,
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
    (try! (contract-call? .jing-core log-rfq-cancel id (get client rfq) sbtc-in
      (var-get token-x) (var-get token-y)
    ))
    (ok sbtc-in)
  )
)

(define-public (initialize
    (canonical principal)
    (x principal)
    (y principal)
    (feed-x (buff 32))
    (feed-y (buff 32))
    (min-x uint)
  )
  (begin
    (asserts! (is-eq tx-sender (var-get operator)) ERR_NOT_AUTHORIZED)
    (asserts! (is-eq tx-sender (contract-call? .jing-core get-contract-owner))
      ERR_NOT_AUTHORIZED
    )
    (asserts! (not (var-get initialized)) ERR_ALREADY_INITIALIZED)
    (var-set token-x x)
    (var-set token-y y)
    (var-set oracle-feed-x feed-x)
    (var-set oracle-feed-y feed-y)
    (var-set min-sbtc-in min-x)
    (var-set initialized true)
    (try! (contract-call? .jing-core register canonical))
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