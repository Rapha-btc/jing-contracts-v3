;; rfq-sbtc-usdcx-jing  --  DRAFT (Option B: signed off-chain quotes, on-chain settle)
;;
;; Competitive RFQ for sBTC -> USDCx. The client escrows sBTC and runs a short
;; off-chain auction; market makers reply with quotes priced as
;; `Pyth BTC/USD +/- premium`. The relayer ranks them; the client picks the
;; winner and signs a SIP-018 authorization naming that MM and the floor it
;; quoted. The WINNING MM submits `fill-rfq` carrying that signature.
;;
;; Why the client signs (and why it matters): the premium IS the prize -- whoever
;; fills captures the spread. If `fill-rfq` were permissionless, a mempool watcher
;; could copy the winner's tx and steal its premium, so MMs would stop quoting
;; tight. The client's SIP-018 authorization binds the fill to the chosen MM:
;; `fill-rfq` recovers the signer, requires it to equal the RFQ's client, and the
;; signed `winner` field to equal `tx-sender`. The relayer only *ranks* quotes
;; (it can't, on-chain); the signature is what makes that choice enforceable.
;;
;; Custody: Clarity has no token allowance, so the side that does NOT submit the
;; fill must pre-escrow. The client escrows sBTC in `open-rfq` (it is selling it
;; anyway); the MM never locks capital until it wins and fills atomically.
;;
;; Two protective floors, each where it belongs:
;;   - min-usdc-out    -- ABSOLUTE, client-entered at `open-rfq`, IMMUTABLE. A
;;                        LOOSE worst-case reservation ("never less than Y USDCx,
;;                        period"). Set below expected so normal drift never trips
;;                        it; it only fires if Pyth prints something crazy-low.
;;   - max-premium-bps -- RELATIVE, in the SIGNED authorization, per-auction. Pins
;;                        the winning MM to the exact spread it quoted: the fill's
;;                        premium must be <= this. Drift-immune (all relative to
;;                        live Pyth), so it never causes a spurious revert.
;; The client accepts oracle drift between sign and fill -- that is the premise of
;; `Pyth +/- premium` pricing; the loose absolute floor is the only hard backstop.
;;
;; Decimals (must match the deployed pair): sBTC = 8, USDCx = 6, Pyth = 8.
;;   usdc_mid = sbtc_in * pyth_price / (PRICE_PRECISION * DECIMAL_FACTOR)
;;            = sbtc_in * pyth_price / 1e10
;; Premium is a discount in bps the client accepts below mid (lower = better for
;; the client). Price-improvement (MM beating mid) is left out for minimalism.

(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)
(use-trait pyth-storage-trait 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-traits-v2.storage-trait)
(use-trait pyth-decoder-trait 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-traits-v2.decoder-trait)
(use-trait wormhole-core-trait 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.wormhole-traits-v2.core-trait)

;; ---------------------------------------------------------------- constants
(define-constant PRICE_PRECISION u100000000) ;; Pyth 8-dec scale
(define-constant DECIMAL_FACTOR u100)        ;; reconciles 8(sBTC)+8(Pyth)-6(USDCx)=1e10
(define-constant BPS_PRECISION u10000)
(define-constant FEE_BPS u10)                ;; 0.10% protocol fee. ONE-SIDED: taken
                                             ;; from USDCx out only. RFQ is a single
                                             ;; directional swap, so fee-ing both
                                             ;; sides would tax the same surface twice
                                             ;; and strand dust in two tokens.
(define-constant MAX_STALENESS u80)          ;; seconds; Pyth publish-time freshness gate
(define-constant MAX_CONF_RATIO u50)         ;; reject if conf >= price/50 (~2%)

(define-constant SIP018_MSG_PREFIX 0x534950303138) ;; "SIP018"

(define-constant SAINT 'SP000000000000000000002Q6VF78)
(define-constant SAINT_FEED 0x0000000000000000000000000000000000000000000000000000000000000000)

;; ---------------------------------------------------------------- errors
(define-constant ERR_AMOUNT_TOO_SMALL (err u1001))
(define-constant ERR_STALE_PRICE (err u1005))
(define-constant ERR_PRICE_UNCERTAIN (err u1006))
(define-constant ERR_ZERO_PRICE (err u1009))
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
(define-constant ERR_BAD_AUTH (err u2007))     ;; signature didn't recover to the client
(define-constant ERR_AUTH_EXPIRED (err u2008)) ;; client authorization past its deadline
(define-constant ERR_ABOVE_MAX_OUT (err u2009)) ;; usdc-out exceeds the MM's ceiling (crazy-high Pyth)

;; ---------------------------------------------------------------- config
(define-data-var initialized bool false)
(define-data-var operator principal tx-sender)
(define-data-var treasury principal tx-sender)
(define-data-var paused bool false)

(define-data-var token-x principal SAINT)      ;; sBTC (escrowed, sold by client)
(define-data-var token-y principal SAINT)      ;; USDCx (paid by MM)
(define-data-var oracle-feed (buff 32) SAINT_FEED) ;; Pyth BTC/USD feed id
(define-data-var min-sbtc-in uint u0)

;; ---------------------------------------------------------------- state
(define-data-var next-rfq-id uint u0)

(define-map rfqs
  uint
  {
    client: principal,
    sbtc-in: uint,
    min-usdc-out: uint,   ;; absolute worst-case floor, client-set at open (Pyth-crazy guard)
    expiry: uint,         ;; stacks-block-height after which it can be cancelled
    open: bool,
  }
)

;; SIP-018 authorization the client signs off-chain, naming the winning MM and
;; the absolute floor it quoted. Re-derived on-chain in `fill-rfq` and checked
;; against the supplied signature. `winner` is bound to `tx-sender` and `market`
;; to this contract, so an authorization can't be replayed cross-MM or cross-market.
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

;; ---------------------------------------------------------------- client: open
;; Escrow sBTC and publish the RFQ. `ttl` is in blocks from now.
(define-public (open-rfq
    (sbtc-in uint)
    (min-usdc-out uint)
    (ttl uint)
    (x <ft-trait>)
    (x-name (string-ascii 128))
  )
  (let (
      (id (var-get next-rfq-id))
    )
    (asserts! (not (var-get paused)) ERR_PAUSED)
    (asserts! (is-eq (contract-of x) (var-get token-x)) ERR_WRONG_TRAIT)
    (asserts! (>= sbtc-in (var-get min-sbtc-in)) ERR_AMOUNT_TOO_SMALL)
    (asserts! (> sbtc-in u0) ERR_AMOUNT_TOO_SMALL)
    (asserts! (> min-usdc-out u0) ERR_AMOUNT_TOO_SMALL)
    (try! (contract-call? x transfer sbtc-in tx-sender current-contract none))
    (map-set rfqs id {
      client: tx-sender,
      sbtc-in: sbtc-in,
      min-usdc-out: min-usdc-out,
      expiry: (+ stacks-block-height ttl),
      open: true,
    })
    (var-set next-rfq-id (+ id u1))
    (try! (contract-call? .jing-core log-rfq-open id tx-sender sbtc-in min-usdc-out
      (+ stacks-block-height ttl) (var-get token-x) (var-get token-y)
    ))
    (ok id)
  )
)

;; ---------------------------------------------------------------- MM: fill
;; The winning MM submits this. It carries a fresh Pyth VAA (fetched from Hermes
;; off-chain) and refreshes the oracle in the SAME tx before reading -- Pyth on
;; Stacks is a pull oracle, so the stored price is only as fresh as the last
;; push and would almost always fail the staleness gate otherwise.
;;
;; MM is tx-sender, so it pays USDCx directly; the contract releases escrowed
;; sBTC. The MM carries the client's SIP-018 authorization (`max-premium-bps`,
;; `auth-expiry`, `sig`) which pins it to the spread it quoted; only the MM the
;; client signed for can produce a sig that recovers to the client, which is what
;; stops a mempool watcher from sniping the winner's premium. `premium-bps` is the
;; MM's actual fill spread and must be <= the signed `max-premium-bps`.
;;
;; `max-usdc-out` is the MM's OWN ceiling (not signed -- the MM is tx-sender): it
;; caps what the MM pays if Pyth prints crazy-high, mirroring the client's
;; `min-usdc-out` floor against crazy-low. The client can't use a post-condition
;; here (it isn't tx-sender), so both bounds live in the contract for symmetry.
(define-public (fill-rfq
    (id uint)
    (premium-bps uint)
    (max-usdc-out uint)
    (max-premium-bps uint)
    (auth-expiry uint)
    (sig (buff 65))
    (vaa (buff 8192))
    (pyth-storage <pyth-storage-trait>)
    (pyth-decoder <pyth-decoder-trait>)
    (wormhole-core <wormhole-core-trait>)
    (x <ft-trait>)
    (x-name (string-ascii 128))
    (y <ft-trait>)
  )
  (let (
      (rfq (unwrap! (map-get? rfqs id) ERR_RFQ_NOT_FOUND))
      (mm tx-sender)
      (client (get client rfq))
      (sbtc-in (get sbtc-in rfq))
    )
    (asserts! (not (var-get paused)) ERR_PAUSED)
    (asserts! (get open rfq) ERR_RFQ_CLOSED)
    (asserts! (<= stacks-block-height (get expiry rfq)) ERR_EXPIRED)
    (asserts! (is-eq (contract-of x) (var-get token-x)) ERR_WRONG_TRAIT)
    (asserts! (is-eq (contract-of y) (var-get token-y)) ERR_WRONG_TRAIT)
    (asserts! (<= premium-bps max-premium-bps) ERR_PREMIUM_TOO_HIGH)
    ;; auth-expiry is a stacks-block-height deadline -- same clock as the RFQ's
    ;; own `expiry`, fine enough (~2s/block) for a short quote window. No u0
    ;; "never expires" sentinel: every authorization must carry a real deadline.
    (asserts! (< stacks-block-height auth-expiry) ERR_AUTH_EXPIRED)

    ;; Verify the client's SIP-018 authorization. `mm` (tx-sender) is folded into
    ;; the hash as the signed `winner`, so only the chosen MM yields a sig that
    ;; recovers to the client. Done before the costly Pyth/Wormhole verify so
    ;; unauthorized calls fail cheap.
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

    ;; Refresh Pyth in-tx, then read the freshly stored price.
    (try! (contract-call? 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4
      verify-and-update-price-feeds vaa {
      pyth-storage-contract: pyth-storage,
      pyth-decoder-contract: pyth-decoder,
      wormhole-core-contract: wormhole-core,
    }))
    (let (
        (feed-data (unwrap!
          (contract-call? 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-storage-v4
            get-price (var-get oracle-feed))
          ERR_ZERO_PRICE
        ))
        (price (to-uint (get price feed-data)))
        (min-freshness (- stacks-block-time MAX_STALENESS))
      )
    ;; Pyth sanity gates (mirror the batch-auction market)
    (asserts! (> price u0) ERR_ZERO_PRICE)
    (asserts! (> (get publish-time feed-data) min-freshness) ERR_STALE_PRICE)
    (asserts! (< (get conf feed-data) (/ price MAX_CONF_RATIO)) ERR_PRICE_UNCERTAIN)

    (let (
        (usdc-mid (/ (* sbtc-in price) (* PRICE_PRECISION DECIMAL_FACTOR)))
        (usdc-out (/ (* usdc-mid (- BPS_PRECISION premium-bps)) BPS_PRECISION))
        (fee (/ (* usdc-out FEE_BPS) BPS_PRECISION))
        (client-receives (- usdc-out fee))
      )
      (asserts! (>= usdc-out (get min-usdc-out rfq)) ERR_BELOW_MIN_OUT) ;; client floor
      (asserts! (<= usdc-out max-usdc-out) ERR_ABOVE_MAX_OUT)           ;; MM ceiling

      ;; MM (tx-sender) pays USDCx: fee -> treasury, rest -> client
      (and (> fee u0)
        (try! (contract-call? y transfer fee mm (var-get treasury) none))
      )
      (try! (contract-call? y transfer client-receives mm client none))

      ;; Contract releases escrowed sBTC to the MM
      (try! (as-contract? ((with-ft (contract-of x) x-name sbtc-in))
        (try! (contract-call? x transfer sbtc-in current-contract mm none))
      ))

      (map-set rfqs id (merge rfq { open: false }))
      (try! (contract-call? .jing-core log-rfq-fill id client mm sbtc-in usdc-out
        fee price (var-get token-x) (var-get token-y)
      ))
      (ok {
        usdc-out: usdc-out,
        fee: fee,
        client-receives: client-receives,
        price: price,
      })
    )
    )
  )
)

;; ---------------------------------------------------------------- cancel / reclaim
;; Only callable AFTER expiry, by anyone (the sBTC always returns to the original
;; client). The client is committed for the TTL window once it opens -- this
;; removes the cancel-race grief vector where a client could yank escrow to burn
;; a racing MM's fill gas. Keep TTL short (~30-60s) so escrow is never locked long.
(define-public (cancel-rfq
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
    (asserts! (> stacks-block-height (get expiry rfq)) ERR_NOT_EXPIRED)
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

;; ---------------------------------------------------------------- admin
;; `initialize` is a protocol-wide attestation about the token pair + oracle, so
;; it must be made by jing-core's contract-owner (the multisig) -- NOT merely the
;; operator. Without this gate, anyone deploying hash-matching bytecode at their
;; own principal could `register` and write rfq-* events impersonating a real Jing
;; market. The `register` call binds this deployment's bytecode to the verified
;; `canonical` template hash. Mirrors markets-sbtc-{usdcx,stx}-jing.
(define-public (initialize
    (canonical principal)
    (x principal)
    (y principal)
    (feed (buff 32))
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
    (var-set oracle-feed feed)
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
