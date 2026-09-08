;; vault-sbtc-stx-v5
;;
;; v4: same vault as v3, bound to the next deploy set under the repo names:
;; market markets-sbtc-stx-jing-v5 (partial withdrawals), router
;; swap-router-sbtc-stx-jing-v4, ledger jing-core-v4. No logic change; the
;; vault does not use withdraw-token-x/y yet.
;;
;; ---- v3 header follows ----
;; vault-sbtc-stx-v3
;;
;; Per-user vault for the sBTC/STX pair on the Pyth Lazer market
;; (markets-sbtc-stx-jingswap) and the retail router
;; (swap-router-sbtc-stx-jingswap-v1). Same shape as vault-sbtc-stx-v2:
;; the owner deploys it, funds it, and signs SIP-018 intents (size, side,
;; limit, salt, expiry); the owner or the keeper executes them later,
;; attaching the freshest signed Lazer `update` and its `mid` at broadcast
;; time. That is what a pre-signed wallet transaction cannot do: a price
;; older than 80 s is refused by the oracle, so a BTC-bridged swap signed
;; minutes before broadcast has to skip the book. Through the vault the
;; keeper fires the intent when the sBTC lands, with a live price, and the
;; router takes the Jing book first.
;;
;; The bridge can mint straight into this contract: an sBTC deposit whose
;; recipient is the vault principal lands here, no second hop. Such a mint
;; makes no vault call, so jing-core's equity ledger does not see it; the
;; indexer records the mint event off chain instead (the on-chain ledger is
;; informational and already double-credits registered vaults on market
;; payouts, so no on-chain catch-up entry is offered: it could not be made
;; both exact and replay-safe).
;;
;; What the keeper may do is exactly what the owner signed. `update` and
;; `mid` are never part of the intent: the market verifies the update
;; itself and settles at its own mid, so a wrong or stale one only fails or
;; mis-sizes the book leg. The limit and the min-out (derived from the limit)
;; bound every execution.
;;
;; v3 changes from v2:
;;   - market + router on Lazer: `update (buff 8192)` replaces the Pyth VAA,
;;     no oracle fee budget (Lazer charges none)
;;   - execute-router-swap: smart swap through the router, book + pools,
;;     min-out = amount at the signed limit
;;   - execute-jing-set-limit: pure reprice (set-token-*-limit), no crossing
;;   - the direct XYK / DLMM entries are gone (the router covers them)

(define-constant OWNER tx-sender)

(define-constant PRICE_PRECISION u100000000)
(define-constant DECIMAL_FACTOR u100)

(define-constant SBTC_TOKEN 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant WSTX_TOKEN 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2)

(define-constant JING-MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v5)
(define-constant JING-ROUTER 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-stx-jing-v4)
(define-constant JING-CORE 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-core-v4)
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

;; Mirror of the market's taker economics, used to size the allowance for
;; the crossing reprice: that path pulls exactly this rebate from the vault.
(define-constant TAKER_REBATE_BPS u20)
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
      (is-eq (contract-call? JING-MARKET get-taker-rebate-bps) TAKER_REBATE_BPS)
      ERR_REBATE_MISMATCH
    )
    (var-set initialized true)
    (try! (contract-call? JING-CORE register canonical))
    (ok true)
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

;; Rest a maker order on the market. `update` is the keeper's fresh Lazer
;; update for the market's maker gate, not part of the intent.
(define-public (execute-jing-deposit
    (sig (buff 65))
    (side (string-ascii 128))
    (amount uint)
    (limit-price uint)
    (auth-id uint)
    (expiry uint)
    (update (buff 8192))
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
        (try! (contract-call? JING-MARKET deposit-token-y amount limit-price update
          WSTX_TOKEN ASSET_WSTX
        ))
      ))
      (try! (as-contract? ((with-ft SBTC_TOKEN ASSET_SBTC amount))
        (try! (contract-call? JING-MARKET deposit-token-x amount limit-price update
          SBTC_TOKEN ASSET_SBTC
        ))
      ))
    )
    (try! (contract-call? JING-CORE log-jing-deposit msg-hash JING-MARKET
      (token-in side) (token-out side) amount limit-price
    ))
    (ok msg-hash)
  )
)

;; Pure reprice of the vault's resting order: the new limit replaces the old
;; one and the order stays a maker order. The market refuses a limit that
;; would cross a live maker (u1022); use execute-jing-reprice for that.
(define-public (execute-jing-set-limit
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
    (asserts! (is-eq amount (resting side cycle)) ERR_AMOUNT_MISMATCH)
    (try! (verify-and-consume msg-hash sig expiry))
    (if (is-eq side ASSET_WSTX)
      (try! (as-contract? ()
        (try! (contract-call? JING-MARKET set-token-y-limit limit-price update))
      ))
      (try! (as-contract? ()
        (try! (contract-call? JING-MARKET set-token-x-limit limit-price update))
      ))
    )
    (try! (contract-call? JING-CORE log-jing-deposit msg-hash JING-MARKET
      (token-in side) (token-out side) amount limit-price
    ))
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
    (let ((result (if (is-eq side ASSET_WSTX)
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
      (try! (contract-call? JING-CORE log-jing-swap msg-hash JING-MARKET
        (token-in side) (token-out side) amount limit-price
        (if (is-eq side ASSET_WSTX)
          (get token-x-received result)
          (get token-y-received result)
        )))
      (ok msg-hash)
    )
  )
)

;; Reprice the resting order; when the new limit crosses a live maker the
;; market turns it taker on the spot (fill-or-kill). The intent's `amount`
;; must equal the resting size so a stale intent cannot run after the
;; position changed. The allowance is exactly the taker rebate, the only
;; thing the crossing path pulls from the vault.
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
      (rebate (/ (* amount TAKER_REBATE_BPS) BPS_PRECISION))
    )
    (asserts! (> limit-price u0) ERR_INVALID_PRICE)
    (asserts! (or (is-eq side ASSET_WSTX) (is-eq side ASSET_SBTC))
      ERR_INVALID_SIDE
    )
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (asserts! (is-eq amount (resting side cycle)) ERR_AMOUNT_MISMATCH)
    (try! (verify-and-consume msg-hash sig expiry))
    (let ((result (if (is-eq side ASSET_WSTX)
        (try! (as-contract? ((with-stx rebate))
          (try! (contract-call? JING-MARKET reprice-or-swap-token-y limit-price update
            SBTC_TOKEN ASSET_SBTC WSTX_TOKEN ASSET_WSTX
          ))
        ))
        (try! (as-contract? ((with-ft SBTC_TOKEN ASSET_SBTC rebate))
          (try! (contract-call? JING-MARKET reprice-or-swap-token-x limit-price update
            SBTC_TOKEN ASSET_SBTC WSTX_TOKEN ASSET_WSTX
          ))
        ))
      )))
      (if (>
          (if (is-eq side ASSET_WSTX)
            (get token-x-received result)
            (get token-y-received result)
          )
          u0
        )
        (try! (contract-call? JING-CORE log-jing-swap msg-hash JING-MARKET
          (token-in side) (token-out side) (+ amount rebate) limit-price
          (if (is-eq side ASSET_WSTX)
            (get token-x-received result)
            (get token-y-received result)
          )))
        true
      )
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
;; up to the market's minimum deposit while the net outflow never does (the
;; router asserts legs + unsold = amount). Hence amount + min deposit.
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
        (mins (contract-call? JING-MARKET get-min-deposits))
        (result (if (is-eq side ASSET_WSTX)
          (try! (as-contract? ((with-stx (+ amount (get min-token-y mins))))
            (try! (contract-call? JING-ROUTER smart-swap-stx-for-sbtc amount
              limit-price update mid min-out
            ))
          ))
          (try! (as-contract?
            ((with-ft SBTC_TOKEN ASSET_SBTC (+ amount (get min-token-x mins))))
            (try! (contract-call? JING-ROUTER smart-swap-sbtc-for-stx amount
              limit-price update mid min-out
            ))
          ))
        ))
      )
      (try! (contract-call? JING-CORE log-jing-swap msg-hash JING-ROUTER
        (token-in side) (token-out side) (- amount (get unsold result))
        limit-price (get out result)
      ))
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

(define-private (resting
    (side (string-ascii 128))
    (cycle uint)
  )
  (if (is-eq side ASSET_WSTX)
    (contract-call? JING-MARKET get-token-y-deposit cycle current-contract)
    (contract-call? JING-MARKET get-token-x-deposit cycle current-contract)
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
