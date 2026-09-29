;; Per-user signed-intent vault for market v6-3, router v5-3 and core v6.
;; Maker deposits and limit changes submit first; permissionless settlement
;; uses an oracle update newer than submission. A successful intent can leave
;; pending state: inspect get-jing-position and the market's settlement events.
;; Maker execute methods no longer take an update. Intent hashes and successful
;; (ok msg-hash) responses are unchanged. Orders use fixed limits (spread none).
;; The owner funds the vault and signs SIP-018 intents; only owner/keeper may
;; execute them. Oracle updates and router mid are not signed; price limits are.
;; Direct bridge mints remain outside core's informational equity ledger.

(define-constant OWNER tx-sender)

(define-constant PRICE_PRECISION u100000000)
(define-constant DECIMAL_FACTOR u100)

(define-constant SBTC_TOKEN 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant WSTX_TOKEN 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2)

(define-constant JING-MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3)
(define-constant JING-ROUTER 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-stx-jing-v5-3)
(define-constant JING-CORE 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-core-v6)
(define-constant JING-VAULT-AUTH 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-vault-auth)

(define-constant ASSET_WSTX "wstx")
(define-constant ASSET_SBTC "sbtc-token")

(define-constant ERR_NOT_OWNER (err u6001))
(define-constant ERR_INVALID_SIGNATURE (err u6002))
(define-constant ERR_REPLAY (err u6003))
(define-constant ERR_EXPIRED (err u6004))
(define-constant ERR_NO_FUNDS (err u6006))
(define-constant ERR_INVALID_SIDE (err u6011))
(define-constant ERR_INVALID_PRICE (err u6013))
(define-constant ERR_ALREADY_INITIALIZED (err u6020))
(define-constant ERR_PUBKEY_NOT_SET (err u6021))
(define-constant ERR_AMOUNT_MISMATCH (err u6022))
(define-constant ERR_REBATE_MISMATCH (err u6023))

;; Allowance ceiling, checked against the market during initialization.
;; The market pulls only its actual age-dependent rebate, at most this rate.
(define-constant TAKER_REBATE_MAX_BPS u70)
(define-constant BPS_PRECISION u10000)

(define-constant DEFAULT_PUBKEY 0x000000000000000000000000000000000000000000000000000000000000000000)

(define-data-var owner-pubkey (buff 33) DEFAULT_PUBKEY)

(define-data-var keeper (optional principal) none)

(define-map used-pubkey-authorizations
  (buff 32)
  (buff 33)
)

(define-data-var initialized bool false)

(define-read-only (get-owner)
  OWNER
)

(define-read-only (get-status)
  {
    owner: OWNER,
    pubkey: (var-get owner-pubkey),
    keeper: (var-get keeper),
    stx-balance: (stx-get-balance current-contract),
    sbtc-balance: (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
      get-balance current-contract
    )),
  }
)

(define-read-only (is-signature-used (h (buff 32)))
  (is-some (map-get? used-pubkey-authorizations h))
)

(define-read-only (is-initialized)
  (var-get initialized)
)

(define-public (initialize (canonical principal))
  (begin
    (asserts! (not (var-get initialized)) ERR_ALREADY_INITIALIZED)
    (asserts!
      (is-eq (contract-call? JING-MARKET get-taker-rebate-max-bps) TAKER_REBATE_MAX_BPS)
      ERR_REBATE_MISMATCH
    )
    (var-set initialized true)
    (try! (contract-call? JING-CORE register canonical))
    (ok true)
  )
)

;; All reads use the vault principal; pending escrow is separate from the
;; inventory eligible for set-limit / reprice. Invalid sides never default.
(define-read-only (get-jing-position (side (string-ascii 128)))
  (let ((cycle (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3 get-current-cycle)))
    (asserts! (or (is-eq side ASSET_WSTX) (is-eq side ASSET_SBTC)) ERR_INVALID_SIDE)
    (if (is-eq side ASSET_WSTX)
      (ok {
        live: (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3 get-token-y-deposit cycle current-contract),
        parked: (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3 get-token-y-parked current-contract),
        pending-deposit: (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3 get-token-y-pending-deposit current-contract),
      })
      (ok {
        live: (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3 get-token-x-deposit cycle current-contract),
        parked: (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3 get-token-x-parked current-contract),
        pending-deposit: (contract-call? 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3 get-token-x-pending-deposit current-contract),
      })
    )
  )
)

(define-public (set-owner-pubkey (pubkey (buff 33)))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (ok (var-set owner-pubkey pubkey))
  )
)

(define-public (set-keeper (new-keeper (optional principal)))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (ok (var-set keeper new-keeper))
  )
)

(define-public (deposit-stx (amount uint))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (try! (stx-transfer? amount tx-sender current-contract))
    (try! (contract-call? JING-CORE log-deposit WSTX_TOKEN amount))
    (ok true)
  )
)

(define-public (deposit-sbtc (amount uint))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (try! (contract-call? SBTC_TOKEN transfer amount tx-sender current-contract none))
    (try! (contract-call? JING-CORE log-deposit SBTC_TOKEN amount))
    (ok true)
  )
)

(define-public (withdraw-stx (amount uint))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (try! (as-contract? ((with-stx amount))
      (try! (stx-transfer? amount current-contract OWNER))
    ))
    (try! (contract-call? JING-CORE log-withdraw WSTX_TOKEN amount))
    (ok true)
  )
)

(define-public (withdraw-sbtc (amount uint))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (try! (as-contract? ((with-ft SBTC_TOKEN ASSET_SBTC amount))
      (try! (contract-call? SBTC_TOKEN transfer amount current-contract OWNER none))
    ))
    (try! (contract-call? JING-CORE log-withdraw SBTC_TOKEN amount))
    (ok true)
  )
)

(define-public (revoke-intent (target-hash (buff 32)))
  (begin
    (try! (check-owner-or-keeper))
    (asserts! (is-none (map-get? used-pubkey-authorizations target-hash))
      ERR_REPLAY
    )
    (map-set used-pubkey-authorizations target-hash (var-get owner-pubkey))
    (try! (contract-call? JING-CORE log-revoke target-hash))
    (ok true)
  )
)

(define-public (cancel-jing-stx)
  (begin
    (try! (check-owner-or-keeper))
    (try! (as-contract? ()
      (try! (contract-call? JING-MARKET cancel-token-y-deposit WSTX_TOKEN ASSET_WSTX))
    ))
    (try! (contract-call? JING-CORE log-cancel JING-MARKET WSTX_TOKEN))
    (ok true)
  )
)

(define-public (cancel-jing-sbtc)
  (begin
    (try! (check-owner-or-keeper))
    (try! (as-contract? ()
      (try! (contract-call? JING-MARKET cancel-token-x-deposit SBTC_TOKEN ASSET_SBTC))
    ))
    (try! (contract-call? JING-CORE log-cancel JING-MARKET SBTC_TOKEN))
    (ok true)
  )
)

;; Submit a maker deposit. It may be immediately live or escrowed pending
;; market settle-token-x/y-deposit with a later update; the signed limit is unchanged.
(define-public (execute-jing-deposit
    (sig (buff 65))
    (side (string-ascii 128))
    (amount uint)
    (limit-price uint)
    (auth-id uint)
    (expiry uint)
  )
  (let ((msg-hash (contract-call? JING-VAULT-AUTH build-intent-hash {
      action: "jing-deposit",
      side: side,
      amount: amount,
      limit-price: limit-price,
      auth-id: auth-id,
      expiry: expiry,
    })))
    (asserts! (> limit-price u0) ERR_INVALID_PRICE)
    (asserts! (or (is-eq side ASSET_WSTX) (is-eq side ASSET_SBTC))
      ERR_INVALID_SIDE
    )
    (try! (verify-and-consume msg-hash sig expiry))
    (if (is-eq side ASSET_WSTX)
      (try! (as-contract? ((with-stx amount))
        (try! (contract-call? JING-MARKET deposit-token-y amount limit-price none
          WSTX_TOKEN ASSET_WSTX
        ))
      ))
      (try! (as-contract? ((with-ft SBTC_TOKEN ASSET_SBTC amount))
        (try! (contract-call? JING-MARKET deposit-token-x amount limit-price none
          SBTC_TOKEN ASSET_SBTC
        ))
      ))
    )
    (print { event: "vault-jing-submitted", action: "jing-deposit",
      msg-hash: msg-hash, position: (try! (get-jing-position side)) })
    (ok msg-hash)
  )
)

;; Submit a pure limit change for live + parked inventory (not pending
;; deposits). The current limit remains active until settlement accepts it;
;; a crossing or superseded pending limit is refused by settlement.
(define-public (execute-jing-set-limit
    (sig (buff 65))
    (side (string-ascii 128))
    (amount uint)
    (limit-price uint)
    (auth-id uint)
    (expiry uint)
  )
  (let (
      (msg-hash (contract-call? JING-VAULT-AUTH build-intent-hash {
        action: "jing-set-limit",
        side: side,
        amount: amount,
        limit-price: limit-price,
        auth-id: auth-id,
        expiry: expiry,
      }))
      (cycle (contract-call? JING-MARKET get-current-cycle))
    )
    (asserts! (> limit-price u0) ERR_INVALID_PRICE)
    (asserts! (or (is-eq side ASSET_WSTX) (is-eq side ASSET_SBTC))
      ERR_INVALID_SIDE
    )
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (asserts! (is-eq amount (resting side cycle)) ERR_AMOUNT_MISMATCH)
    (try! (verify-and-consume msg-hash sig expiry))
    (if (is-eq side ASSET_WSTX)
      (try! (as-contract? ()
        (try! (contract-call? JING-MARKET set-token-y-limit limit-price none))
      ))
      (try! (as-contract? ()
        (try! (contract-call? JING-MARKET set-token-x-limit limit-price none))
      ))
    )
    (print { event: "vault-jing-submitted", action: "jing-set-limit",
      msg-hash: msg-hash, position: (try! (get-jing-position side)) })
    (ok msg-hash)
  )
)

;; Taker path straight into the market (fill-or-kill inside the limit).
(define-public (execute-jing-swap
    (sig (buff 65))
    (side (string-ascii 128))
    (amount uint)
    (limit-price uint)
    (auth-id uint)
    (expiry uint)
    (update (buff 8192))
  )
  (let ((msg-hash (contract-call? JING-VAULT-AUTH build-intent-hash {
      action: "jing-swap",
      side: side,
      amount: amount,
      limit-price: limit-price,
      auth-id: auth-id,
      expiry: expiry,
    })))
    (asserts! (> limit-price u0) ERR_INVALID_PRICE)
    (asserts! (or (is-eq side ASSET_WSTX) (is-eq side ASSET_SBTC))
      ERR_INVALID_SIDE
    )
    (try! (verify-and-consume msg-hash sig expiry))
    (let ((before (swap-snapshot side)) (result (if (is-eq side ASSET_WSTX)
        (try! (as-contract? ((with-stx amount))
          (try! (contract-call? JING-MARKET swap amount limit-price update SBTC_TOKEN
            ASSET_SBTC WSTX_TOKEN ASSET_WSTX false
          ))
        ))
        (try! (as-contract? ((with-ft SBTC_TOKEN ASSET_SBTC amount))
          (try! (contract-call? JING-MARKET swap amount limit-price update SBTC_TOKEN
            ASSET_SBTC WSTX_TOKEN ASSET_WSTX true
          ))
        ))
      )))
      (try! (log-swap msg-hash JING-MARKET side limit-price before))
      (ok msg-hash)
    )
  )
)

;; Reprice the resting order; when the new limit crosses a live maker the
;; market turns it taker on the spot (fill-or-kill). The intent's `amount`
;; must equal the resting size so a stale intent cannot run after the
;; position changed. Authorize the maximum age-dependent rebate; the market
;; pulls only the actual rebate. A noncrossing change can remain pending.
(define-public (execute-jing-reprice
    (sig (buff 65))
    (side (string-ascii 128))
    (amount uint)
    (limit-price uint)
    (auth-id uint)
    (expiry uint)
    (update (buff 8192))
  )
  (let (
      (msg-hash (contract-call? JING-VAULT-AUTH build-intent-hash {
        action: "jing-reprice",
        side: side,
        amount: amount,
        limit-price: limit-price,
        auth-id: auth-id,
        expiry: expiry,
      }))
      (cycle (contract-call? JING-MARKET get-current-cycle))
      (rebate (/ (* amount TAKER_REBATE_MAX_BPS) BPS_PRECISION))
    )
    (asserts! (> limit-price u0) ERR_INVALID_PRICE)
    (asserts! (or (is-eq side ASSET_WSTX) (is-eq side ASSET_SBTC))
      ERR_INVALID_SIDE
    )
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (asserts! (is-eq amount (resting side cycle)) ERR_AMOUNT_MISMATCH)
    (try! (verify-and-consume msg-hash sig expiry))
    (let ((before (swap-snapshot side)) (result (if (is-eq side ASSET_WSTX)
        (try! (as-contract? ((with-stx rebate))
          (try! (contract-call? JING-MARKET reprice-or-swap-token-y limit-price none update
            SBTC_TOKEN ASSET_SBTC WSTX_TOKEN ASSET_WSTX
          ))
        ))
        (try! (as-contract? ((with-ft SBTC_TOKEN ASSET_SBTC rebate))
          (try! (contract-call? JING-MARKET reprice-or-swap-token-x limit-price none update
            SBTC_TOKEN ASSET_SBTC WSTX_TOKEN ASSET_WSTX
          ))
        ))
      )))
      (if (> (if (is-eq side ASSET_WSTX)
            (get token-x-received result) (get token-y-received result)) u0)
        (try! (log-swap msg-hash JING-MARKET side limit-price before))
        (begin
          (print { event: "vault-jing-submitted", action: "jing-reprice",
            msg-hash: msg-hash, position: (try! (get-jing-position side)) })
          true))
      (ok msg-hash)
    )
  )
)

;; Smart swap through the router: Jing book first (sized on chain from the
;; keeper's `mid`), then Bitflow DLMM, then XYK + Velar. The signed limit
;; bounds every leg; min-out is the amount at that limit. `update` may be
;; none (pools only) but the point of the vault is to pass a fresh one.
;; The router acts on tx-sender: inside as-contract that is this vault, so
;; the proceeds land here.
;;
;; Allowance: as-contract? counts GROSS transfers out of the vault. The book
;; leg can refund sub-minimum dust to the taker and the router re-sells that
;; dust on the fallback venue, so the gross outflow can exceed `amount` by
;; up to the market minimum plus the refunded rebate. Authorize amount +
;; minimum deposit + maximum rebate (the fastpool/juice allowance pattern).
;; The router still bounds net input by amount and enforces the signed limit.
(define-public (execute-router-swap
    (sig (buff 65))
    (side (string-ascii 128))
    (amount uint)
    (limit-price uint)
    (auth-id uint)
    (expiry uint)
    (update (optional (buff 8192)))
    (mid uint)
  )
  (let (
      (msg-hash (contract-call? JING-VAULT-AUTH build-intent-hash {
        action: "router-swap",
        side: side,
        amount: amount,
        limit-price: limit-price,
        auth-id: auth-id,
        expiry: expiry,
      }))
      (min-out (derive-min-out side amount limit-price))
    )
    (asserts! (> limit-price u0) ERR_INVALID_PRICE)
    (asserts! (> mid u0) ERR_INVALID_PRICE)
    (asserts! (or (is-eq side ASSET_WSTX) (is-eq side ASSET_SBTC))
      ERR_INVALID_SIDE
    )
    (try! (verify-and-consume msg-hash sig expiry))
    (let (
        (before (swap-snapshot side))
        (mins (contract-call? JING-MARKET get-min-deposits))
        (max-rebate (/ (* amount TAKER_REBATE_MAX_BPS) BPS_PRECISION))
        (result (if (is-eq side ASSET_WSTX)
          (try! (as-contract? ((with-stx (+ amount (get min-token-y mins) max-rebate)))
            (try! (contract-call? JING-ROUTER smart-swap-stx-for-sbtc amount
              limit-price update mid min-out
            ))
          ))
          (try! (as-contract?
            ((with-ft SBTC_TOKEN ASSET_SBTC (+ amount (get min-token-x mins) max-rebate)))
            (try! (contract-call? JING-ROUTER smart-swap-sbtc-for-stx amount
              limit-price update mid min-out
            ))
          ))
        ))
      )
      (try! (log-swap msg-hash JING-ROUTER side limit-price before))
      (ok msg-hash)
    )
  )
)

(define-private (check-owner-or-keeper)
  (ok (asserts!
    (or
      (is-eq tx-sender OWNER)
      (is-eq (some tx-sender) (var-get keeper))
    )
    ERR_NOT_OWNER
  ))
)

(define-private (verify-and-consume
    (msg-hash (buff 32))
    (sig (buff 65))
    (expiry uint)
  )
  (begin
    (try! (check-owner-or-keeper))
    (asserts! (not (is-eq (var-get owner-pubkey) DEFAULT_PUBKEY))
      ERR_PUBKEY_NOT_SET
    )
    (asserts! (is-none (map-get? used-pubkey-authorizations msg-hash)) ERR_REPLAY)
    (asserts! (or (is-eq expiry u0) (< burn-block-height expiry)) ERR_EXPIRED)
    (let ((signer (unwrap! (secp256k1-recover? msg-hash sig) ERR_INVALID_SIGNATURE)))
      (asserts! (is-eq signer (var-get owner-pubkey)) ERR_INVALID_SIGNATURE)
      (map-set used-pubkey-authorizations msg-hash signer)
      (ok true)
    )
  )
)

;; The vault's whole maker position on `side`: live deposit PLUS parked.
;; The market moves an order from live to parked when the book is full and
;; set-limit acts on either, so binding the signed amount to live alone let
;; a zero-amount intent reprice a fully parked order (audit finding, Watchful
;; Node, 2026-09-08).
(define-private (resting
    (side (string-ascii 128))
    (cycle uint)
  )
  (if (is-eq side ASSET_WSTX)
    (+ (contract-call? JING-MARKET get-token-y-deposit cycle current-contract)
      (contract-call? JING-MARKET get-token-y-parked current-contract)
    )
    (+ (contract-call? JING-MARKET get-token-x-deposit cycle current-contract)
      (contract-call? JING-MARKET get-token-x-parked current-contract)
    )
  )
)

(define-private (token-in (side (string-ascii 128)))
  (if (is-eq side ASSET_WSTX)
    WSTX_TOKEN
    SBTC_TOKEN
  )
)

(define-private (token-out (side (string-ascii 128)))
  (if (is-eq side ASSET_WSTX)
    SBTC_TOKEN
    WSTX_TOKEN
  )
)

;; The signed limit is the worst price: min-out is the amount converted at
;; it. Limit unit: uSTX per sat x 1e10 (= STX per BTC x 1e8).
(define-private (derive-min-out
    (side (string-ascii 128))
    (amount uint)
    (limit-price uint)
  )
  (if (is-eq side ASSET_WSTX)
    (/ (* amount (* PRICE_PRECISION DECIMAL_FACTOR)) limit-price)
    (/ (* amount limit-price) (* PRICE_PRECISION DECIMAL_FACTOR))
  )
)

;; Include pending escrow in custody, but not in `resting`: a pending deposit
;; cannot be repriced by set-limit. Snapshots preserve unlogged bridge mints:
;; apply only this operation's balance delta to its pre-call recorded equity.
(define-private (custody (side (string-ascii 128)))
  (let (
      (cycle (contract-call? JING-MARKET get-current-cycle))
      (pending (if (is-eq side ASSET_WSTX)
        (contract-call? JING-MARKET get-token-y-pending-deposit current-contract)
        (contract-call? JING-MARKET get-token-x-pending-deposit current-contract)))
    )
    (+
      (if (is-eq side ASSET_WSTX)
        (stx-get-balance current-contract)
        (unwrap-panic (contract-call? SBTC_TOKEN get-balance current-contract)))
      (resting side cycle)
      (default-to u0 (get amount pending)))))

(define-private (other-side (side (string-ascii 128)))
  (if (is-eq side ASSET_WSTX) ASSET_SBTC ASSET_WSTX))

(define-private (swap-snapshot (side (string-ascii 128)))
  {
    balance-in: (custody side),
    balance-out: (custody (other-side side)),
    equity-in: (contract-call? JING-CORE get-token-equity (token-in side) current-contract),
    equity-out: (contract-call? JING-CORE get-token-equity (token-out side) current-contract),
  })

(define-private (gain (before uint) (after uint))
  (if (> after before) (- after before) u0))

(define-private (equity-after (equity uint) (before uint) (after uint))
  (if (>= after before)
    (+ equity (- after before))
    (let ((spent (- before after)))
      (- equity (if (> spent equity) equity spent)))))

(define-private (log-swap
    (msg-hash (buff 32)) (market principal) (side (string-ascii 128))
    (limit-price uint)
    (before { balance-in: uint, balance-out: uint, equity-in: uint, equity-out: uint })
  )
  (let ((input (custody side)) (output (custody (other-side side))))
    (contract-call? JING-CORE log-jing-swap-reconciled
      msg-hash market (token-in side) (token-out side)
      (gain input (get balance-in before)) limit-price
      (gain (get balance-out before) output)
      (equity-after (get equity-in before) (get balance-in before) input)
      (equity-after (get equity-out before) (get balance-out before) output))))
