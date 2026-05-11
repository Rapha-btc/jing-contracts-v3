(define-constant OWNER tx-sender)

(define-constant PRICE_PRECISION u100000000)
(define-constant DECIMAL_FACTOR u100)

(define-constant SBTC_TOKEN 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant WSTX_TOKEN 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2)

(define-constant JING-MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing)
(define-constant JING-CORE 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-core)
(define-constant JING-VAULT-AUTH 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-vault-auth)

(define-constant XYK_CORE 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-core-v-1-2)
(define-constant XYK_POOL_SBTC_STX 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-pool-sbtc-stx-v-1-1)

(define-constant DLMM_ROUTER 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-1)
(define-constant DLMM_POOL_STX_SBTC 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-1-bps-15)

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

(define-constant DEFAULT_PUBKEY 0x000000000000000000000000000000000000000000000000000000000000000000)

(define-data-var owner-pubkey (buff 33) DEFAULT_PUBKEY)

(define-data-var keeper (optional principal) none)

(define-map used-pubkey-authorizations (buff 32) (buff 33))

(define-data-var initialized bool false)

(define-read-only (get-owner) OWNER)

(define-read-only (get-status)
  {
    owner: OWNER,
    pubkey: (var-get owner-pubkey),
    keeper: (var-get keeper),
    stx-balance: (stx-get-balance current-contract),
    sbtc-balance: (unwrap-panic (contract-call? SBTC_TOKEN get-balance current-contract)),
  })

(define-read-only (is-signature-used (h (buff 32)))
  (is-some (map-get? used-pubkey-authorizations h)))

(define-read-only (is-initialized) (var-get initialized))

(define-public (initialize (canonical principal))
  (begin
    (asserts! (not (var-get initialized)) ERR_ALREADY_INITIALIZED)
    (var-set initialized true)
    (try! (contract-call? JING-CORE register canonical))
    (ok true)))

(define-public (set-owner-pubkey (pubkey (buff 33)))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (ok (var-set owner-pubkey pubkey))))

(define-public (set-keeper (new-keeper (optional principal)))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (ok (var-set keeper new-keeper))))

(define-public (deposit-stx (amount uint))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (try! (stx-transfer? amount tx-sender current-contract))
    (try! (contract-call? JING-CORE log-deposit WSTX_TOKEN amount))
    (ok true)))

(define-public (deposit-sbtc (amount uint))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (try! (contract-call? SBTC_TOKEN transfer amount tx-sender current-contract none))
    (try! (contract-call? JING-CORE log-deposit SBTC_TOKEN amount))
    (ok true)))

(define-public (withdraw-stx (amount uint))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (try! (as-contract? ((with-stx amount))
      (try! (stx-transfer? amount current-contract OWNER))))
    (try! (contract-call? JING-CORE log-withdraw WSTX_TOKEN amount))
    (ok true)))

(define-public (withdraw-sbtc (amount uint))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR_NOT_OWNER)
    (asserts! (> amount u0) ERR_NO_FUNDS)
    (try! (as-contract? ((with-ft SBTC_TOKEN ASSET_SBTC amount))
      (try! (contract-call? SBTC_TOKEN transfer amount current-contract OWNER none))))
    (try! (contract-call? JING-CORE log-withdraw SBTC_TOKEN amount))
    (ok true)))

(define-public (revoke-intent (target-hash (buff 32)))
  (begin
    (asserts! (or (is-eq tx-sender OWNER)
                  (is-eq (some tx-sender) (var-get keeper)))
              ERR_NOT_OWNER)
    (asserts! (is-none (map-get? used-pubkey-authorizations target-hash)) ERR_REPLAY)
    (map-set used-pubkey-authorizations target-hash (var-get owner-pubkey))
    (try! (contract-call? JING-CORE log-revoke target-hash))
    (ok true)))

(define-public (cancel-jing-stx)
  (begin
    (asserts! (or (is-eq tx-sender OWNER)
                  (is-eq (some tx-sender) (var-get keeper)))
              ERR_NOT_OWNER)
    (try! (as-contract? ((with-all-assets-unsafe))
      (try! (contract-call? JING-MARKET cancel-token-y-deposit WSTX_TOKEN ASSET_WSTX))))
    (try! (contract-call? JING-CORE log-cancel JING-MARKET WSTX_TOKEN))
    (ok true)))

(define-public (cancel-jing-sbtc)
  (begin
    (asserts! (or (is-eq tx-sender OWNER)
                  (is-eq (some tx-sender) (var-get keeper)))
              ERR_NOT_OWNER)
    (try! (as-contract? ((with-all-assets-unsafe))
      (try! (contract-call? JING-MARKET cancel-token-x-deposit SBTC_TOKEN ASSET_SBTC))))
    (try! (contract-call? JING-CORE log-cancel JING-MARKET SBTC_TOKEN))
    (ok true)))

(define-public (execute-jing-deposit
    (sig (buff 65))
    (side (string-ascii 128))
    (amount uint)
    (limit-price uint)
    (auth-id uint)
    (expiry uint))
  (let (
    (msg-hash (contract-call? JING-VAULT-AUTH build-intent-hash {
      action: "jing-deposit",
      side: side,
      amount: amount,
      limit-price: limit-price,
      auth-id: auth-id,
      expiry: expiry,
    }))
  )
    (asserts! (or (is-eq side ASSET_WSTX) (is-eq side ASSET_SBTC)) ERR_INVALID_SIDE)
    (try! (verify-and-consume msg-hash sig expiry))
    (if (is-eq side ASSET_WSTX)
      (try! (as-contract? ((with-stx amount))
        (try! (contract-call? JING-MARKET deposit-token-y amount limit-price WSTX_TOKEN ASSET_WSTX))))
      (try! (as-contract? ((with-ft SBTC_TOKEN ASSET_SBTC amount))
        (try! (contract-call? JING-MARKET deposit-token-x amount limit-price SBTC_TOKEN ASSET_SBTC)))))
    (try! (contract-call? JING-CORE log-jing-deposit
      msg-hash
      JING-MARKET
      (if (is-eq side ASSET_WSTX) WSTX_TOKEN SBTC_TOKEN)
      (if (is-eq side ASSET_WSTX) SBTC_TOKEN WSTX_TOKEN)
      amount limit-price))
    (ok msg-hash)))

(define-public (execute-bitflow-swap
    (sig (buff 65))
    (side (string-ascii 128))
    (amount uint)
    (limit-price uint)
    (auth-id uint)
    (expiry uint))
  (begin
    (asserts! (> limit-price u0) ERR_INVALID_PRICE)
    (asserts! (or (is-eq side ASSET_WSTX) (is-eq side ASSET_SBTC)) ERR_INVALID_SIDE)
    (let (
      (msg-hash (contract-call? JING-VAULT-AUTH build-intent-hash {
        action: "bitflow-swap",
        side: side,
        amount: amount,
        limit-price: limit-price,
        auth-id: auth-id,
        expiry: expiry,
      }))
      (min-out (derive-min-out side amount limit-price))
    )
    (try! (verify-and-consume msg-hash sig expiry))
    (let ((out (if (is-eq side ASSET_WSTX)
                   (try! (as-contract? ((with-stx amount))
                     (try! (contract-call? XYK_CORE
                       swap-y-for-x XYK_POOL_SBTC_STX SBTC_TOKEN WSTX_TOKEN
                       amount min-out))))
                   (try! (as-contract? ((with-ft SBTC_TOKEN ASSET_SBTC amount))
                     (try! (contract-call? XYK_CORE
                       swap-x-for-y XYK_POOL_SBTC_STX SBTC_TOKEN WSTX_TOKEN
                       amount min-out)))))))
      (try! (contract-call? JING-CORE log-bitflow-swap
        msg-hash
        (if (is-eq side ASSET_WSTX) WSTX_TOKEN SBTC_TOKEN)
        (if (is-eq side ASSET_WSTX) SBTC_TOKEN WSTX_TOKEN)
        amount limit-price out))
      (ok msg-hash)))))

(define-public (execute-dlmm-swap
    (sig (buff 65))
    (side (string-ascii 128))
    (amount uint)
    (limit-price uint)
    (auth-id uint)
    (expiry uint))
  (begin
    (asserts! (> limit-price u0) ERR_INVALID_PRICE)
    (asserts! (or (is-eq side ASSET_WSTX) (is-eq side ASSET_SBTC)) ERR_INVALID_SIDE)
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
    (let ((result (if (is-eq side ASSET_WSTX)
                      (try! (as-contract? ((with-stx amount))
                        (try! (contract-call?
                          DLMM_ROUTER
                          swap-x-for-y-simple-multi
                          DLMM_POOL_STX_SBTC
                          WSTX_TOKEN SBTC_TOKEN amount min-out))))
                      (try! (as-contract? ((with-ft SBTC_TOKEN ASSET_SBTC amount))
                        (try! (contract-call?
                          DLMM_ROUTER
                          swap-y-for-x-simple-multi
                          DLMM_POOL_STX_SBTC
                          WSTX_TOKEN SBTC_TOKEN amount min-out)))))))
      (try! (contract-call? JING-CORE log-bitflow-swap
        msg-hash
        (if (is-eq side ASSET_WSTX) WSTX_TOKEN SBTC_TOKEN)
        (if (is-eq side ASSET_WSTX) SBTC_TOKEN WSTX_TOKEN)
        amount limit-price (get out result)))
      (ok msg-hash)))))


(define-private (verify-and-consume
    (msg-hash (buff 32))
    (sig (buff 65))
    (expiry uint))
  (begin
    (asserts! (or (is-eq tx-sender OWNER)
                  (is-eq (some tx-sender) (var-get keeper)))
              ERR_NOT_OWNER)
    (asserts! (not (is-eq (var-get owner-pubkey) DEFAULT_PUBKEY)) ERR_PUBKEY_NOT_SET)
    (asserts! (is-none (map-get? used-pubkey-authorizations msg-hash)) ERR_REPLAY)
    (asserts! (or (is-eq expiry u0) (< burn-block-height expiry)) ERR_EXPIRED)
    (let ((signer (unwrap! (secp256k1-recover? msg-hash sig) ERR_INVALID_SIGNATURE)))
      (asserts! (is-eq signer (var-get owner-pubkey)) ERR_INVALID_SIGNATURE)
      (map-set used-pubkey-authorizations msg-hash signer)
      (ok true))))

(define-private (derive-min-out
    (side (string-ascii 128))
    (amount uint)
    (limit-price uint))
  (if (is-eq side ASSET_WSTX)
    (/ (* amount (* PRICE_PRECISION DECIMAL_FACTOR)) limit-price)
    (if (is-eq side ASSET_SBTC)
      (/ (* amount limit-price) (* PRICE_PRECISION DECIMAL_FACTOR))
      u0)))