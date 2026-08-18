;; SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.vault-sbtc-usdcx-jing-v2

(define-constant OWNER tx-sender)

(define-constant PRICE_PRECISION u100000000)
(define-constant DECIMAL_FACTOR u100)

(define-constant SBTC_TOKEN 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant USDCX_TOKEN 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)

(define-constant JING-MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v2)
(define-constant JING-CORE 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-core-v2)
(define-constant JING-VAULT-AUTH 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-vault-auth)

(define-constant DLMM_ROUTER 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-1)
(define-constant DLMM_POOL_SBTC_USDCX 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-sbtc-usdcx-v-1-bps-10)

(define-constant ASSET_SBTC "sbtc-token")
(define-constant ASSET_USDCX "usdcx-token")

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

;; Mirror of the market's taker economics, used only to size the allowance
;; for execute-jing-reprice: the reprice's crossing path pulls exactly this
;; rebate from the vault, nothing else.
(define-constant TAKER_REBATE_BPS u20)
(define-constant BPS_PRECISION u10000)

;; Budget for Pyth's oracle update fee. Every market entry point that
;; carries a VAA routes through pyth-oracle-v4 verify-and-update-price-feeds,
;; which pulls a per-updated-feed STX fee from tx-sender - the vault, inside
;; as-contract?. Without an explicit with-stx allowance the fee transfer
;; aborts the whole call whenever the vault is the first to submit its VAA
;; (the fee is zero only when the feed was already refreshed). Current
;; mainnet fee is 1 uSTX per feed (1 feed on this market); u10 leaves
;; governance headroom. NOTE: this vault has no deposit-stx - the owner
;; must top up a few uSTX by plain STX transfer to the contract principal
;; for the jing-deposit / jing-swap / crossing-reprice paths to work.
(define-constant PYTH_FEE_BUDGET u10)

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
    sbtc-balance: (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
      get-balance current-contract
    )),
    usdcx-balance: (unwrap-panic (contract-call? 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx get-balance
      current-contract
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

(define-public (deposit-sbtc (amount uint))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (try! (contract-call? SBTC_TOKEN transfer amount tx-sender current-contract none))
    (try! (contract-call? JING-CORE log-deposit SBTC_TOKEN amount))
    (ok true)
  )
)

(define-public (deposit-usdcx (amount uint))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (try! (contract-call? USDCX_TOKEN transfer amount tx-sender current-contract none))
    (try! (contract-call? JING-CORE log-deposit USDCX_TOKEN amount))
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

(define-public (withdraw-usdcx (amount uint))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (try! (as-contract? ((with-ft USDCX_TOKEN ASSET_USDCX amount))
      (try! (contract-call? USDCX_TOKEN transfer amount current-contract OWNER none))
    ))
    (try! (contract-call? JING-CORE log-withdraw USDCX_TOKEN amount))
    (ok true)
  )
)

(define-public (revoke-intent (target-hash (buff 32)))
  (begin
    (asserts!
      (or
        (is-eq tx-sender OWNER)
        (is-eq (some tx-sender) (var-get keeper))
      )
      ERR_NOT_OWNER
    )
    (asserts! (is-none (map-get? used-pubkey-authorizations target-hash))
      ERR_REPLAY
    )
    (map-set used-pubkey-authorizations target-hash (var-get owner-pubkey))
    (try! (contract-call? JING-CORE log-revoke target-hash))
    (ok true)
  )
)

(define-public (cancel-jing-sbtc)
  (begin
    (asserts!
      (or
        (is-eq tx-sender OWNER)
        (is-eq (some tx-sender) (var-get keeper))
      )
      ERR_NOT_OWNER
    )
    (try! (as-contract? ()
      (try! (contract-call? JING-MARKET cancel-token-x-deposit SBTC_TOKEN ASSET_SBTC))
    ))
    (try! (contract-call? JING-CORE log-cancel JING-MARKET SBTC_TOKEN))
    (ok true)
  )
)

(define-public (cancel-jing-usdcx)
  (begin
    (asserts!
      (or
        (is-eq tx-sender OWNER)
        (is-eq (some tx-sender) (var-get keeper))
      )
      ERR_NOT_OWNER
    )
    (try! (as-contract? ()
      (try! (contract-call? JING-MARKET cancel-token-y-deposit USDCX_TOKEN ASSET_USDCX))
    ))
    (try! (contract-call? JING-CORE log-cancel JING-MARKET USDCX_TOKEN))
    (ok true)
  )
)

;; `vaa` is keeper-supplied oracle data for the market's maker gate, NOT part
;; of the signed intent: VAAs go stale in minutes, so the keeper attaches the
;; freshest one at execution time. It cannot influence what was authorized -
;; only whether the market classifies the deposit against a fresh price.
(define-public (execute-jing-deposit
    (sig (buff 65))
    (side (string-ascii 128))
    (amount uint)
    (limit-price uint)
    (auth-id uint)
    (expiry uint)
    (vaa (buff 8192))
  )
  (let ((msg-hash (contract-call? JING-VAULT-AUTH build-intent-hash {
      action: "jing-deposit",
      side: side,
      amount: amount,
      limit-price: limit-price,
      auth-id: auth-id,
      expiry: expiry,
    })))
    (asserts! (or (is-eq side ASSET_SBTC) (is-eq side ASSET_USDCX))
      ERR_INVALID_SIDE
    )
    (try! (verify-and-consume msg-hash sig expiry))
    (if (is-eq side ASSET_SBTC)
      (try! (as-contract? (
          (with-ft SBTC_TOKEN ASSET_SBTC amount)
          (with-stx PYTH_FEE_BUDGET)
        )
        (try! (contract-call? JING-MARKET deposit-token-x amount limit-price vaa SBTC_TOKEN
          ASSET_SBTC
        ))
      ))
      (try! (as-contract? (
          (with-ft USDCX_TOKEN ASSET_USDCX amount)
          (with-stx PYTH_FEE_BUDGET)
        )
        (try! (contract-call? JING-MARKET deposit-token-y amount limit-price vaa
          USDCX_TOKEN ASSET_USDCX
        ))
      ))
    )
    (try! (contract-call? JING-CORE log-jing-deposit msg-hash JING-MARKET
      (if (is-eq side ASSET_SBTC)
        SBTC_TOKEN
        USDCX_TOKEN
      )
      (if (is-eq side ASSET_SBTC)
        USDCX_TOKEN
        SBTC_TOKEN
      )
      amount limit-price
    ))
    (ok msg-hash)
  )
)

;; Reprice the vault's RESTING Jing position; if the new limit crosses live
;; resting size, the market turns it taker on the spot (fill-or-kill, the
;; whole tx reverts on anything short of a 100% fill). The signed intent's
;; `amount` must equal the vault's current resting deposit on `side` - so a
;; keeper cannot execute a stale intent after the position grew or was partly
;; rolled; the owner re-signs against the new size instead. The allowance is
;; exactly the taker rebate: that is all the crossing path may pull from the
;; vault (the resting size itself already sits on the market). The plain
;; reprice path moves no assets at all. Equity is logged only when the swap
;; actually happened, debiting resting size plus rebate - the vault's true
;; total outlay for the conversion, since the resting deposit was never
;; debited on the way in.
(define-public (execute-jing-reprice
    (sig (buff 65))
    (side (string-ascii 128))
    (amount uint)
    (limit-price uint)
    (auth-id uint)
    (expiry uint)
    (vaa (buff 8192))
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
    (asserts! (or (is-eq side ASSET_SBTC) (is-eq side ASSET_USDCX))
      ERR_INVALID_SIDE
    )
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (asserts!
      (is-eq amount
        (if (is-eq side ASSET_SBTC)
          (contract-call? JING-MARKET get-token-x-deposit cycle current-contract)
          (contract-call? JING-MARKET get-token-y-deposit cycle current-contract)
        ))
      ERR_AMOUNT_MISMATCH
    )
    (try! (verify-and-consume msg-hash sig expiry))
    (let ((result (if (is-eq side ASSET_SBTC)
        (try! (as-contract? (
            (with-ft SBTC_TOKEN ASSET_SBTC rebate)
            (with-stx PYTH_FEE_BUDGET)
          )
          (try! (contract-call? JING-MARKET reprice-or-swap-token-x limit-price vaa
            SBTC_TOKEN ASSET_SBTC USDCX_TOKEN ASSET_USDCX
          ))
        ))
        (try! (as-contract? (
            (with-ft USDCX_TOKEN ASSET_USDCX rebate)
            (with-stx PYTH_FEE_BUDGET)
          )
          (try! (contract-call? JING-MARKET reprice-or-swap-token-y limit-price vaa
            SBTC_TOKEN ASSET_SBTC USDCX_TOKEN ASSET_USDCX
          ))
        ))
      )))
      (if (> (if (is-eq side ASSET_SBTC)
               (get token-y-received result)
               (get token-x-received result)
             ) u0)
        (try! (contract-call? JING-CORE log-jing-swap msg-hash JING-MARKET
          (if (is-eq side ASSET_SBTC)
            SBTC_TOKEN
            USDCX_TOKEN
          )
          (if (is-eq side ASSET_SBTC)
            USDCX_TOKEN
            SBTC_TOKEN
          )
          (+ amount rebate) limit-price
          (if (is-eq side ASSET_SBTC)
            (get token-y-received result)
            (get token-x-received result)
          )
        ))
        true
      )
      (ok msg-hash)
    )
  )
)

;; Taker path into the Jing market: the market's `swap` is fill-or-kill, so
;; this either clears the vault's full `amount` inside `limit-price` in one tx
;; or reverts whole. The market charges TAKER_REBATE_BPS out of `amount`
;; (rebate plus net deposit sum to exactly `amount`), so the asset allowance
;; below is the total outlay. As with execute-jing-deposit, `vaa` is
;; keeper-supplied oracle freshness, not part of the signed intent.
(define-public (execute-jing-swap
    (sig (buff 65))
    (side (string-ascii 128))
    (amount uint)
    (limit-price uint)
    (auth-id uint)
    (expiry uint)
    (vaa (buff 8192))
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
    (asserts! (or (is-eq side ASSET_SBTC) (is-eq side ASSET_USDCX))
      ERR_INVALID_SIDE
    )
    (try! (verify-and-consume msg-hash sig expiry))
    (let ((result (if (is-eq side ASSET_SBTC)
        (try! (as-contract? (
            (with-ft SBTC_TOKEN ASSET_SBTC amount)
            (with-stx PYTH_FEE_BUDGET)
          )
          (try! (contract-call? JING-MARKET swap amount limit-price vaa
            SBTC_TOKEN ASSET_SBTC USDCX_TOKEN ASSET_USDCX true
          ))
        ))
        (try! (as-contract? (
            (with-ft USDCX_TOKEN ASSET_USDCX amount)
            (with-stx PYTH_FEE_BUDGET)
          )
          (try! (contract-call? JING-MARKET swap amount limit-price vaa
            SBTC_TOKEN ASSET_SBTC USDCX_TOKEN ASSET_USDCX false
          ))
        ))
      )))
      (try! (contract-call? JING-CORE log-jing-swap msg-hash JING-MARKET
        (if (is-eq side ASSET_SBTC)
          SBTC_TOKEN
          USDCX_TOKEN
        )
        (if (is-eq side ASSET_SBTC)
          USDCX_TOKEN
          SBTC_TOKEN
        )
        amount limit-price
        (if (is-eq side ASSET_SBTC)
          (get token-y-received result)
          (get token-x-received result)
        )
      ))
      (ok msg-hash)
    )
  )
)

(define-public (execute-dlmm-swap
    (sig (buff 65))
    (side (string-ascii 128))
    (amount uint)
    (limit-price uint)
    (auth-id uint)
    (expiry uint)
  )
  (begin
    (asserts! (> limit-price u0) ERR_INVALID_PRICE)
    (asserts! (or (is-eq side ASSET_SBTC) (is-eq side ASSET_USDCX))
      ERR_INVALID_SIDE
    )
    (let (
        (msg-hash (contract-call? JING-VAULT-AUTH build-intent-hash {
          action: "dlmm-swap",
          side: side,
          amount: amount,
          limit-price: limit-price,
          auth-id: auth-id,
          expiry: expiry,
        }))
        (min-out (derive-min-out side amount limit-price))
      )
      (try! (verify-and-consume msg-hash sig expiry))
      (let ((result (if (is-eq side ASSET_SBTC)
          (try! (as-contract? ((with-ft SBTC_TOKEN ASSET_SBTC amount))
            (try! (contract-call? DLMM_ROUTER swap-x-for-y-simple-multi
              DLMM_POOL_SBTC_USDCX SBTC_TOKEN USDCX_TOKEN amount min-out
            ))
          ))
          (try! (as-contract? ((with-ft USDCX_TOKEN ASSET_USDCX amount))
            (try! (contract-call? DLMM_ROUTER swap-y-for-x-simple-multi
              DLMM_POOL_SBTC_USDCX SBTC_TOKEN USDCX_TOKEN amount min-out
            ))
          ))
        )))
        (try! (contract-call? JING-CORE log-bitflow-swap msg-hash
          (if (is-eq side ASSET_SBTC)
            SBTC_TOKEN
            USDCX_TOKEN
          )
          (if (is-eq side ASSET_SBTC)
            USDCX_TOKEN
            SBTC_TOKEN
          )
          amount limit-price (get out result)
        ))
        (ok msg-hash)
      )
    )
  )
)

(define-private (verify-and-consume
    (msg-hash (buff 32))
    (sig (buff 65))
    (expiry uint)
  )
  (begin
    (asserts!
      (or
        (is-eq tx-sender OWNER)
        (is-eq (some tx-sender) (var-get keeper))
      )
      ERR_NOT_OWNER
    )
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

(define-private (derive-min-out
    (side (string-ascii 128))
    (amount uint)
    (limit-price uint)
  )
  (if (is-eq side ASSET_SBTC)
    (/ (* amount limit-price) (* PRICE_PRECISION DECIMAL_FACTOR))
    (if (is-eq side ASSET_USDCX)
      (/ (* amount (* PRICE_PRECISION DECIMAL_FACTOR)) limit-price)
      u0
    )
  )
)
