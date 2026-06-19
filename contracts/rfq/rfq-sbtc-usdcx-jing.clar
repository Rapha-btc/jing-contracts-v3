;; rfq-sbtc-usdcx-jing  --  DRAFT (Option B: signed off-chain quotes, on-chain settle)
;;                          TWO-PHASE: fix-price (commit) then fulfill (deliver)
;;
;; Competitive RFQ for sBTC -> USDCx. The client escrows sBTC and runs a short
;; off-chain auction; market makers reply with quotes priced as
;; `Pyth BTC/USD +/- premium`. The relayer ranks them; the client picks the
;; winner and signs a SIP-018 authorization naming that MM and the floor it
;; quoted. The WINNING MM then runs the two on-chain steps below.
;;
;; WHY TWO PHASES (fix-price, then fulfill): an MM often does not hold the payout
;; asset on-chain -- it sources the liquidity just-in-time on a CEX and needs time
;; to withdraw it on-chain. So we split the trade into:
;;   1. fix-price -- the MM commits the price on-chain RIGHT AFTER it buys on the
;;      CEX (so the number is fresh and cannot drift). Funds do NOT move; the sBTC
;;      stays escrowed. Must happen before the client's signed `auth-expiry` (which
;;      the client sets ~120 stacks-blocks / ~4 min from the OFF-CHAIN signing, so
;;      the window starts when the auction concludes -- NOT at open-rfq).
;;   2. fulfill -- the MM delivers USDCx and the contract releases sBTC, atomically.
;;      Must happen before `open-expiry` (burn-block-height + OPEN_TTL ~1 hr) -- a
;;      generous window because CEX withdrawal is slow; an honest MM is done in
;;      minutes, the window only matters for the failure/reclaim case.
;; The price the client cares about is locked at step 1; the slow step 2 cannot
;; move it. The client is protected by the signed `max-premium-bps` + the absolute
;; `min-usdc-out` floor at fix-price, and by `reclaim` once `open-expiry` lapses.
;;
;; TWO deadlines, each in its natural clock:
;;   - auth-expiry  -- client, AT OFF-CHAIN SIGNING (~+120 STACKS-blocks / ~4 min).
;;                     THE PRICE-FIX DEADLINE: the granted MM must `fix-price` before
;;                     it. Because the client stamps it when it grants, the window
;;                     starts at signing, after the auction -- which is what we want.
;;                     Fine-grained, so stacks-blocks are the right clock.
;;   - open-expiry  -- contract, at `open-rfq` (= burn-block-height + OPEN_TTL ~1 hr).
;;                     THE OVERALL DEADLINE: `fulfill` must land before it, and it is
;;                     the `reclaim` trigger. Hour-scale, so bitcoin-blocks are the
;;                     right clock. OPEN_TTL covers auction + fix + CEX-sourced
;;                     fulfillment; a too-short window only risks spurious reverts.
;;
;; Why the client signs (and why it matters): the premium IS the prize -- whoever
;; fills captures the spread. If `fix-price` were permissionless, a mempool watcher
;; could copy the winner's tx and steal its premium, so MMs would stop quoting
;; tight. The client's SIP-018 authorization binds the commit to the chosen MM:
;; `fix-price` recovers the signer, requires it to equal the RFQ's client, and the
;; signed `winner` field to equal `tx-sender`. The relayer only *ranks* quotes; the
;; signature is what makes that choice enforceable. Only that MM may later `fulfill`.
;;
;; Custody: Clarity has no token allowance, so the side that does NOT submit the
;; fill must pre-escrow. The client escrows sBTC in `open-rfq` (it is selling it
;; anyway); the MM never locks capital until it fulfills atomically.
;;
;; KNOWN GAP (v1): the free-option is only PARTIAL. PRE-fix it is symmetric and
;; benign -- the MM may decline to fix, but the client can grant other MMs (add
;; competitors; a stale grant just lapses at its auth-expiry), and no funds are
;; committed yet. POST-fix it is one-sided: once an MM fixes, the trade is that
;; MM's exclusively (others get ERR_ALREADY_FIXED; only the winner may fulfill),
;; so the client's sBTC is committed and the MM can still walk, locking it until
;; `open-expiry`. That post-fix window is the entire exposure; a v2 should require
;; an MM BOND at fix-price, slashed to the client on no-fulfill. Acceptable for v1.
;;
;; Two protective floors, each where it belongs:
;;   - min-usdc-out    -- ABSOLUTE, client-entered at `open-rfq`, IMMUTABLE. A
;;                        LOOSE worst-case reservation ("never less than Y USDCx,
;;                        period"). Checked at fix-price. Set below expected so
;;                        normal drift never trips it; it only fires on crazy-low Pyth.
;;   - max-premium-bps -- RELATIVE, in the SIGNED authorization, per-auction. Pins
;;                        the winning MM to the exact spread it quoted: the commit's
;;                        premium must be <= this. Drift-immune (all relative to
;;                        live Pyth), so it never causes a spurious revert.
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
(define-constant MAX_PREMIUM_BPS u2000)      ;; 20% hard ceiling on the signed max-premium-bps:
                                             ;; a protocol sanity cap (real spreads are a few bps),
                                             ;; and it keeps the floor math far from underflow.
(define-constant FEE_BPS u10)                ;; 0.10% protocol fee. ONE-SIDED: taken
                                             ;; from USDCx out only. RFQ is a single
                                             ;; directional swap, so fee-ing both
                                             ;; sides would tax the same surface twice
                                             ;; and strand dust in two tokens.
(define-constant MAX_STALENESS u80)          ;; seconds; Pyth publish-time freshness gate
(define-constant MAX_CONF_RATIO u50)         ;; reject if conf >= price/50 (~2%)

;; The MM's price-fix deadline is NOT a contract constant -- it is the client's
;; signed `auth-expiry` (set ~120 stacks-blocks / ~4 min from the OFF-CHAIN signing,
;; so the window starts when the auction concludes). See fix-price.
(define-constant OPEN_TTL u6)                ;; bitcoin-blocks the RFQ stays live from `open-rfq`
                                             ;; (~1 hr). The OUTER deadline: fulfill must land
                                             ;; before it, reclaim opens after it. Covers the
                                             ;; off-chain auction + the (signed) fix window + the
                                             ;; CEX-sourced fulfillment. Generous on purpose --
                                             ;; the MM is already hedged, so a too-short window
                                             ;; only risks spurious reverts and wider quotes.

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
(define-constant ERR_EXPIRED (err u2003))       ;; open-expiry passed: too late to fix or fulfill
(define-constant ERR_NOT_EXPIRED (err u2004))   ;; reclaim before open-expiry lapsed
(define-constant ERR_PREMIUM_TOO_HIGH (err u2005))
(define-constant ERR_BELOW_MIN_OUT (err u2006))
(define-constant ERR_BAD_AUTH (err u2007))     ;; signature didn't recover to the client
(define-constant ERR_AUTH_EXPIRED (err u2008)) ;; price-fix deadline (signed auth-expiry) passed
(define-constant ERR_ABOVE_MAX_OUT (err u2009)) ;; committed-out exceeds the mid+20% sanity ceiling (MM fat-finger guard)
(define-constant ERR_ALREADY_FIXED (err u2011))     ;; a price was already committed for this rfq
(define-constant ERR_NOT_FIXED (err u2012))         ;; fulfill called before any price committed
(define-constant ERR_NOT_WINNER (err u2013))        ;; only the MM that fixed may fulfill

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
    min-usdc-out: uint,                ;; absolute worst-case floor, client-set at open (Pyth-crazy guard)
    open-expiry: uint,                 ;; burn-block-height: OVERALL deadline -- fulfill before it, reclaim after it
    winner: (optional principal),      ;; the MM that committed a price (none until fix-price)
    fixed-usdc-out: (optional uint),   ;; gross USDCx locked at fix-price (fee derived from it at fulfill)
    fixed-oracle-price: (optional uint), ;; Pyth oracle MID at fix-price -- a market REFERENCE only, NOT the execution rate (that = committed-out / sbtc-in)
    open: bool,                        ;; true from open until fulfilled OR reclaimed
  }
)

;; SIP-018 authorization the client signs off-chain, naming the winning MM and
;; the spread it quoted. Re-derived on-chain in `fix-price` and checked against
;; the supplied signature. `winner` is bound to `tx-sender` and `market` to this
;; contract, so an authorization can't be replayed cross-MM or cross-market.
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
;; Escrow sBTC and publish the RFQ. `open-expiry` (= burn-block-height + OPEN_TTL,
;; ~1 hr) is the OVERALL deadline: the granted MM must `fulfill` before it, and the
;; client may `reclaim` after it. The MM's price-fix deadline is separate -- it is
;; the client's signed `auth-expiry`, stamped at the OFF-CHAIN signing (see fix-price).
(define-public (open-rfq
    (sbtc-in uint)
    (min-usdc-out uint)
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
    (asserts! (> min-usdc-out u0) ERR_AMOUNT_TOO_SMALL)
    (try! (contract-call? x transfer sbtc-in tx-sender current-contract none))
    (map-set rfqs id {
      client: tx-sender,
      sbtc-in: sbtc-in,
      min-usdc-out: min-usdc-out,
      open-expiry: open-expiry,
      winner: none,
      fixed-usdc-out: none,
      fixed-oracle-price: none,
      open: true,
    })
    (var-set next-rfq-id (+ id u1))
    (try! (contract-call? .jing-core log-rfq-open id tx-sender sbtc-in min-usdc-out
      open-expiry (var-get token-x) (var-get token-y)
    ))
    (ok id)
  )
)

;; ---------------------------------------------------------------- MM: fix-price
;; PHASE 1. The granted MM commits its price on-chain right after buying on the
;; CEX. Carries a fresh Pyth VAA and refreshes the oracle in the SAME tx before
;; reading -- Pyth on Stacks is a pull oracle, so the stored price would otherwise
;; be stale. No funds move here: the sBTC stays escrowed and the MM locks nothing
;; until `fulfill`. We record only the gross USDCx + price; the fulfill deadline is
;; the rfq's `open-expiry`.
;;
;; The MM passes `committed-out` -- the EXACT USDCx amount it will deliver, the
;; number it just locked on the CEX. The contract does NOT compute the price; it
;; only checks that number clears the client's protections. Pyth is the FLOOR
;; reference: `committed-out` must be >= sbtc_in * Pyth-mid * (1 - max-premium-bps),
;; which is what makes the signed spread enforceable. No MM ceiling is needed --
;; the MM's own number is its ceiling, so it can never be made to overpay.
(define-public (fix-price
    (id uint)
    (committed-out uint)
    (max-premium-bps uint)
    (auth-expiry uint)
    (sig (buff 65))
    (vaa (buff 8192))
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
    ;; Escrow must still be open (overall window not yet lapsed).
    (asserts! (<= burn-block-height (get open-expiry rfq)) ERR_EXPIRED)
    ;; Protocol sanity ceiling on the signed spread (and keeps floor math from underflow).
    (asserts! (<= max-premium-bps MAX_PREMIUM_BPS) ERR_PREMIUM_TOO_HIGH)
    ;; THE PRICE-FIX DEADLINE. `auth-expiry` is stamped by the client when it signs
    ;; the winner OFF-CHAIN (~120 stacks-blocks later), so the MM's window starts at
    ;; signing -- after the auction -- not at open-rfq. No u0 "never expires"
    ;; sentinel: every authorization must carry a real deadline.
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
        (floor (/ (* usdc-mid (- BPS_PRECISION max-premium-bps)) BPS_PRECISION))
        (ceiling (/ (* usdc-mid (+ BPS_PRECISION MAX_PREMIUM_BPS)) BPS_PRECISION))
      )
      ;; committed-out must honor the client's floors (tight signed spread + loose
      ;; absolute backstop) AND stay under a mid+20% sanity ceiling. The ceiling is
      ;; the MM's protection: it rejects a fat-finger over-commit HERE (revert) rather
      ;; than after, where a bad commit would lock the client's sBTC until open-expiry.
      (asserts! (>= committed-out floor) ERR_PREMIUM_TOO_HIGH)               ;; agreed-spread floor
      (asserts! (>= committed-out (get min-usdc-out rfq)) ERR_BELOW_MIN_OUT) ;; absolute floor
      (asserts! (<= committed-out ceiling) ERR_ABOVE_MAX_OUT)                ;; MM fat-finger ceiling

      ;; Commit: lock the MM's exact number + identity. No transfers; fulfill deadline = open-expiry.
      (map-set rfqs id (merge rfq {
        winner: (some mm),
        fixed-usdc-out: (some committed-out),
        fixed-oracle-price: (some price),
      }))
      ;; TODO: move to .jing-core log-rfq-fix for canonical attribution (needs the
      ;; new core fn). `print` for now so the relayer can index the commit.
      (print {
        event: "rfq-fix",
        rfq-id: id,
        client: client,
        mm: mm,
        sbtc-in: sbtc-in,
        usdc-out: committed-out,
        oracle-price: price,
        open-expiry: (get open-expiry rfq),
      })
      (ok {
        usdc-out: committed-out,
        open-expiry: (get open-expiry rfq),
        oracle-price: price,
      })
    )
    )
  )
)

;; ---------------------------------------------------------------- MM: fulfill
;; PHASE 2. Only the MM that fixed the price may call, before `open-expiry`.
;; Settles at the LOCKED numbers (no Pyth re-read -> no drift): MM (tx-sender) pays
;; USDCx (fee -> treasury, rest -> client) and the contract releases escrowed sBTC.
;; Atomic, so neither side can grief mid-settle.
(define-public (fulfill
    (id uint)
    (x <ft-trait>)
    (x-name (string-ascii 128))
    (y <ft-trait>)
  )
  (let (
      (rfq (unwrap! (map-get? rfqs id) ERR_RFQ_NOT_FOUND))
      ;; Capture the MM now: `as-contract?` below rebinds tx-sender to the contract,
      ;; so the sBTC release must use this saved principal -- do NOT inline tx-sender.
      (mm tx-sender)
      (client (get client rfq))
      (sbtc-in (get sbtc-in rfq))
      (winner (unwrap! (get winner rfq) ERR_NOT_FIXED))
      (usdc-out (unwrap! (get fixed-usdc-out rfq) ERR_NOT_FIXED))
      (oracle-price (unwrap! (get fixed-oracle-price rfq) ERR_NOT_FIXED))
      (fee (/ (* usdc-out FEE_BPS) BPS_PRECISION))
      (client-receives (- usdc-out fee))
    )
    ;; NOTE: no `paused` gate here. Once an MM has fixed, it is already sourced/hedged
    ;; on the CEX; blocking fulfill would strand a committed MM. Pause stops NEW
    ;; commitments (open-rfq, fix-price), never an in-flight settle. (reclaim is also
    ;; un-paused so the client can always exit.)
    (asserts! (get open rfq) ERR_RFQ_CLOSED)
    (asserts! (is-eq mm winner) ERR_NOT_WINNER)
    (asserts! (<= burn-block-height (get open-expiry rfq)) ERR_EXPIRED)
    (asserts! (is-eq (contract-of x) (var-get token-x)) ERR_WRONG_TRAIT)
    (asserts! (is-eq (contract-of y) (var-get token-y)) ERR_WRONG_TRAIT)

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
      fee oracle-price (var-get token-x) (var-get token-y)
    ))
    (ok {
      usdc-out: usdc-out,
      fee: fee,
      client-receives: client-receives,
      oracle-price: oracle-price,
    })
  )
)

;; ---------------------------------------------------------------- client: reclaim
;; Return escrowed sBTC to the client once `open-expiry` lapses without a completed
;; fulfill. Callable by anyone (the sBTC always returns to the original client). One
;; deadline covers both failure modes -- auction fizzled (never fixed) OR a winner
;; fixed but never delivered -- because both leave the rfq `open` past `open-expiry`.
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
