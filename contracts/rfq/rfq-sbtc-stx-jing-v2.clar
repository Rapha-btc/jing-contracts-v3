;; SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.rfq-sbtc-stx-jing

(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-constant PRICE_PRECISION u100000000)
(define-constant DECIMAL_FACTOR u100)
(define-constant BPS_PRECISION u10000)
(define-constant MAX_QUOTE_DRIFT_BPS u20)
;; ref benchmark must be contemporaneous: closes the true-but-stale loophole,
;; and keeps the drift band inside the vol window it was sized for
(define-constant MAX_REF_STALENESS u120)
(define-constant FEE_BPS u10)

;; native BTC/STX price: miners collectively spend miner-spend-total sats per
;; tenure to win the coinbase, so spend/coinbase is an on-chain price feed.
;; The coinbase is a DATA-VAR, not a constant: it halved to 500 STX in April
;; 2026, but if consensus ever restores 1000 STX the oracle would misprice 2x
;; and the band would revert honest fixes -- the operator flips the value
;; (set-coinbase-ustx) instead of redeploying. Restricted to the two
;; legitimate consensus values; NOT a calibration knob.
(define-data-var coinbase-ustx uint u500000000)
;; offsets in stacks blocks, spaced to likely land in distinct recent tenures.
;; 48 samples every ~3 tenures span ~141 tenures (~1 day): per-tenure commit
;; noise is autocorrelated over hours, so a day-wide spread is what tames the
;; tails (3.5mo of mainnet commits: worst dev vs CEX mid tightens from
;; -40%/+54% with 6 consecutive tenures to -23%/+30% with this design)
(define-constant TENURE_SAMPLE_OFFSETS (list
  u1 u367 u733 u1099 u1465 u1831 u2197 u2563
  u2929 u3295 u3661 u4027 u4393 u4759 u5125 u5491
  u5857 u6223 u6589 u6955 u7321 u7687 u8053 u8419
  u8785 u9151 u9517 u9883 u10249 u10615 u10981 u11347
  u11713 u12079 u12445 u12811 u13177 u13543 u13909 u14275
  u14641 u15007 u15373 u15739 u16105 u16471 u16837 u17203
))
;; Fat-finger band: committed-out must land within [stx-mid/2, stx-mid*2] of
;; the native mid. Sized as a DECIMAL-SLIP catcher, not a price check (that is
;; the client's signature + the FE screen): 3.5mo backtest worst-case usage
;; was [0.77x, 1.30x], so ~2x margin each side -- never expected to trip.
;; B2B recourse (whitelisted, KYB'd MMs) covers everything finer-grained.
;; The operator can disable it (set-band-enabled) if miner-commit behavior
;; ever degrades; disabling also skips the oracle read entirely, so a broken
;; get-native-price can never brick fix-price.
(define-constant BAND_DIVISOR u2)

(define-constant OPEN_TTL u6)

(define-constant SIP018_MSG_PREFIX 0x534950303138)

(define-constant SAINT 'SP000000000000000000002Q6VF78)

(define-constant ERR_AMOUNT_TOO_SMALL (err u1001))
(define-constant ERR_STALE_PRICE (err u1005))
(define-constant ERR_ZERO_PRICE (err u1009))
(define-constant ERR_PAUSED (err u1010))
(define-constant ERR_NOT_AUTHORIZED (err u1011))
(define-constant ERR_ALREADY_INITIALIZED (err u1018))
(define-constant ERR_WRONG_TRAIT (err u1019))
(define-constant ERR_BAD_COINBASE (err u1021))
(define-constant ERR_NOT_CLIENT_ADMIN (err u1022))
(define-constant ERR_SAME_ADMIN (err u1023))
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
(define-constant ERR_QUOTE_DRIFT (err u2014))
(define-constant ERR_NOT_WHITELISTED (err u2015))
(define-constant ERR_BAD_REFERENCE (err u2016))
(define-constant ERR_CLIENT_NOT_WHITELISTED (err u2017))
(define-constant ERR_NO_PENDING_CLIENT (err u2018))
(define-constant ERR_CLIENT_IN_COOLDOWN (err u2019))

;; Burn blocks (~1 day) between proposing and confirming a client whitelist
;; ADD. See propose-client-whitelist for the threat this closes.
(define-constant CLIENT_WHITELIST_COOLDOWN u144)

(define-data-var initialized bool false)
(define-data-var operator principal tx-sender)
(define-data-var treasury principal tx-sender)

;; SEPARATE authority for the CLIENT whitelist, deliberately NOT the operator.
;; The operator whitelists MMs and can flip the band; if it could also
;; whitelist clients, a single operator compromise could self-mint a fake
;; client and, with the band off, drain a winning MM safe. Splitting this role
;; onto a colder key means a compromised operator cannot forge the client side.
;; Enforced != operator at initialize and on every rotation (ERR_SAME_ADMIN).
(define-data-var client-admin principal tx-sender)
(define-data-var paused bool false)

(define-data-var token-x principal SAINT)
(define-data-var token-y principal SAINT)
(define-data-var min-sbtc-in uint u0)

;; fat-finger band on by default; operator kill-switch (see BAND_DIVISOR note)
(define-data-var band-enabled bool true)

(define-data-var next-rfq-id uint u0)

(define-map whitelisted-mms principal bool)
(define-map whitelisted-clients principal bool)
;; client -> burn height it was proposed at (two-step whitelist ADD)
(define-map pending-clients principal uint)

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
    (quoted-out uint)
    (ref-price uint)
    (ref-timestamp uint)
    (ref-venue (string-ascii 16))
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

(define-read-only (is-whitelisted-client (client principal))
  (default-to false (map-get? whitelisted-clients client))
)

(define-read-only (get-pending-client (client principal))
  (map-get? pending-clients client)
)

(define-read-only (get-client-admin)
  (var-get client-admin)
)

(define-private (sample-spend
    (offset uint)
    (acc {
      sum: uint,
      n: uint,
    })
  )
  (if (>= offset stacks-block-height)
    acc
    (match (get-tenure-info? miner-spend-total (- stacks-block-height offset))
      spend {
        sum: (+ (get sum acc) spend),
        n: (+ (get n acc) u1),
      }
      acc
    )
  )
)

;; STX-per-BTC scaled by PRICE_PRECISION, same shape as the old pyth mid
(define-read-only (get-native-price)
  (let (
      (samples (fold sample-spend TENURE_SAMPLE_OFFSETS {
        sum: u0,
        n: u0,
      }))
      (n (get n samples))
    )
    (asserts! (> n u0) ERR_ZERO_PRICE)
    (let ((avg-spend (/ (get sum samples) n)))
      (asserts! (> avg-spend u0) ERR_ZERO_PRICE)
      ;; efficiency fixed at 1.0: miners run ~109% of coinbase-only value, but
      ;; inside a 2x band that calibration question is noise, and a knob is
      ;; one more admin surface (superseded by set-band-enabled)
      (ok (/ (* u100 (var-get coinbase-ustx) PRICE_PRECISION) avg-spend))
    )
  )
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
    (asserts! (is-whitelisted-client tx-sender) ERR_CLIENT_NOT_WHITELISTED)
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
                auth-expiry
              ) sig)
              ERR_BAD_AUTH
            ))
          ERR_BAD_AUTH
        )
        client
      )
      ERR_BAD_AUTH
    )

    ;; fat-finger band: hardcoded [mid/2, mid*2] around the 1-day native mid.
    ;; When the band is off the oracle is never read (u0 recorded), so a
    ;; degraded miner-commit feed cannot brick fix-price.
    (let (
        (band-on (var-get band-enabled))
        (oracle-price (if band-on (try! (get-native-price)) u0))
        (stx-mid (/ (* sbtc-in oracle-price) (* PRICE_PRECISION DECIMAL_FACTOR)))
      )
      (asserts! (or (not band-on) (> oracle-price u0)) ERR_ZERO_PRICE)
      (asserts! (or (not band-on) (>= committed-out (/ stx-mid BAND_DIVISOR)))
        ERR_PREMIUM_TOO_HIGH
      )
      (asserts! (>= committed-out (get min-stx-out rfq)) ERR_BELOW_MIN_OUT)
      (asserts! (or (not band-on) (<= committed-out (* stx-mid BAND_DIVISOR)))
        ERR_ABOVE_MAX_OUT
      )
      (asserts!
        (>= (* committed-out BPS_PRECISION)
          (* quoted-out (- BPS_PRECISION MAX_QUOTE_DRIFT_BPS))
        )
        ERR_QUOTE_DRIFT
      )
      (asserts!
        (<= (* committed-out BPS_PRECISION)
          (* quoted-out BPS_PRECISION)
        )
        ERR_QUOTE_DRIFT
      )

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
        quoted-out: quoted-out,
        ref-price: ref-price,
        ref-timestamp: ref-timestamp,
        ref-venue: ref-venue,
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
    (try! (contract-call? .jing-core-v2 log-rfq-fill id client mm sbtc-in stx-out
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
    (new-client-admin principal)
  )
  (begin
    (asserts! (is-eq tx-sender (var-get operator)) ERR_NOT_AUTHORIZED)
    (asserts! (is-eq tx-sender (contract-call? .jing-core-v2 get-contract-owner))
      ERR_NOT_AUTHORIZED
    )
    (asserts! (not (var-get initialized)) ERR_ALREADY_INITIALIZED)
    ;; the client-admin MUST be a different key than the operator, so a
    ;; compromised operator can never also forge/whitelist a client
    (asserts! (not (is-eq new-client-admin (var-get operator))) ERR_SAME_ADMIN)
    (var-set token-x x)
    (var-set token-y y)
    (var-set min-sbtc-in min-x)
    (var-set client-admin new-client-admin)
    (var-set initialized true)
    ;; genesis clients (friedger + the fast-pool rewards address), seeded in
    ;; the gated one-shot initialize. Auditable up front, so they bypass the
    ;; two-step cooldown that protects RUNTIME additions.
    (map-set whitelisted-clients 'SP3KJBWTS3K562BF5NXWG5JC8W90HEG7WPYH5B97X true)
    (map-set whitelisted-clients 'SP21YTSM60CAY6D011EZVEVNKXVW8FVZE198XEFFP true)
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
    ;; keep the operator and client-admin as two distinct keys at all times
    (asserts! (not (is-eq new-operator (var-get client-admin))) ERR_SAME_ADMIN)
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

;; CLIENT whitelist, gated to the client-admin (NOT the operator). open-rfq is
;; permissioned: only whitelisted clients can open an RFQ, so a compromised
;; operator cannot self-mint a fake client to weaponize a winning MM safe.
;;
;; ADDING a client is a two-step with a cooldown: a compromised client-admin
;; colluding with a compromised rfq-operator could otherwise whitelist an
;; attacker taker and bleed a winning MM safe within the band in one block.
;; The cooldown gives the honest parties a window to see the proposal event
;; and react (either key can cancel; revoke, pause, safe kill-switch).
;; REMOVING a client is instant -- that is the protective direction.
(define-public (propose-client-whitelist (client principal))
  (begin
    (asserts! (is-eq tx-sender (var-get client-admin)) ERR_NOT_CLIENT_ADMIN)
    (map-set pending-clients client burn-block-height)
    (print {
      event: "rfq-client-proposed",
      client: client,
      proposed-at: burn-block-height,
    })
    (ok true)
  )
)

;; Canceling a pending add is a VETO, so BOTH keys hold it: the client-admin
;; (changed its mind) and the operator (spotted a proposal it doesn't trust).
;; Confirming stays client-admin-only.
(define-public (cancel-client-whitelist (client principal))
  (begin
    (asserts!
      (or
        (is-eq tx-sender (var-get client-admin))
        (is-eq tx-sender (var-get operator))
      )
      ERR_NOT_CLIENT_ADMIN
    )
    (asserts! (is-some (map-get? pending-clients client)) ERR_NO_PENDING_CLIENT)
    (map-delete pending-clients client)
    (print {
      event: "rfq-client-canceled",
      client: client,
    })
    (ok true)
  )
)

(define-public (confirm-client-whitelist (client principal))
  (let ((proposed-at (unwrap! (map-get? pending-clients client) ERR_NO_PENDING_CLIENT)))
    (asserts! (is-eq tx-sender (var-get client-admin)) ERR_NOT_CLIENT_ADMIN)
    (asserts! (>= burn-block-height (+ proposed-at CLIENT_WHITELIST_COOLDOWN))
      ERR_CLIENT_IN_COOLDOWN
    )
    (map-delete pending-clients client)
    (print {
      event: "rfq-client-whitelist",
      client: client,
      whitelisted: true,
    })
    (ok (map-set whitelisted-clients client true))
  )
)

(define-public (revoke-client-whitelist (client principal))
  (begin
    (asserts! (is-eq tx-sender (var-get client-admin)) ERR_NOT_CLIENT_ADMIN)
    (print {
      event: "rfq-client-whitelist",
      client: client,
      whitelisted: false,
    })
    (ok (map-set whitelisted-clients client false))
  )
)

;; Rotate the client-admin. Only the current client-admin can hand off the
;; role, and it can never be set to the operator (keeps the two keys distinct).
(define-public (set-client-admin (new-client-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get client-admin)) ERR_NOT_CLIENT_ADMIN)
    (asserts! (not (is-eq new-client-admin (var-get operator))) ERR_SAME_ADMIN)
    (print {
      event: "rfq-client-admin-set",
      client-admin: new-client-admin,
    })
    (ok (var-set client-admin new-client-admin))
  )
)

;; Kill-switch for the fat-finger band (e.g. miner-commit behavior degrades
;; or get-native-price starts erroring). Two-way and event-logged: the flip
;; is public, so a desk quietly trading band-off is publicly auditable.
(define-public (set-band-enabled (enabled bool))
  (begin
    (asserts! (is-eq tx-sender (var-get operator)) ERR_NOT_AUTHORIZED)
    (print {
      event: "rfq-band-enabled",
      enabled: enabled,
    })
    (ok (var-set band-enabled enabled))
  )
)

;; Track the consensus coinbase without redeploying: the oracle divides miner
;; spend by this. Only the two legitimate consensus values are accepted, so
;; this cannot drift into a calibration knob; the flip is event-logged and
;; publicly auditable like the band switch.
(define-public (set-coinbase-ustx (ustx uint))
  (begin
    (asserts! (is-eq tx-sender (var-get operator)) ERR_NOT_AUTHORIZED)
    (asserts! (or (is-eq ustx u500000000) (is-eq ustx u1000000000))
      ERR_BAD_COINBASE
    )
    (print {
      event: "rfq-coinbase-set",
      coinbase-ustx: ustx,
    })
    (ok (var-set coinbase-ustx ustx))
  )
)

(define-read-only (get-coinbase-ustx)
  (var-get coinbase-ustx)
)

(define-read-only (get-band-enabled)
  (var-get band-enabled)
)