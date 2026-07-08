;; rfq-mm-vault-jing  --  DRAFT (owner/operator STX-float vault for the RFQ desk)
;;
;; WHY: rfq-sbtc-stx-jing records `winner = tx-sender` at fix-price and demands
;; the SAME principal pay the STX at fulfill -- so running the desk from a raw
;; backend key means that hot key custodies the entire STX float. This vault
;; splits custody from operation:
;;   OWNER    (Yguazu cold-ish wallet) -- deposits the float, withdraws anything,
;;            rotates the operator. Withdrawals go ONLY to the owner.
;;   OPERATOR (backend hot key)        -- can ONLY proxy fix-price / fulfill on
;;            the RFQ contract. STX leaves the vault solely as a settlement at
;;            numbers already locked on-chain, or back to the owner. A leaked
;;            operator key cannot drain the float -- worst case it fulfills real
;;            fixed RFQs, which is its job.
;;
;; The vault IS the on-chain MM: clients sign THIS contract's principal as the
;; SIP-018 winner, fix-price records it as winner, fulfill pays STX from it and
;; the escrowed sBTC lands in it (owner withdraws it to bridge out to the CEX).
;; Backend change required: quote/fix flows must present the VAULT principal as
;; the mm identity, and fix.post/fulfill.post call fix-rfq/fulfill-rfq here.
;;
;; Deploy: Clarity 5, same deployer as rfq-sbtc-stx-jing (relative .refs), then
;; `initialize` once to hand ownership to Yguazu + set the backend operator.

(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)
(use-trait pyth-storage-trait 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-traits-v2.storage-trait)
(use-trait pyth-decoder-trait 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-traits-v2.decoder-trait)
(use-trait wormhole-core-trait 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.wormhole-traits-v2.core-trait)

;; ---------------------------------------------------------------- errors
(define-constant ERR_NOT_AUTHORIZED (err u3001))
(define-constant ERR_ALREADY_INITIALIZED (err u3002))
(define-constant ERR_RFQ_NOT_FOUND (err u3003))
(define-constant ERR_NOT_FIXED (err u3004))
(define-constant ERR_ZERO_AMOUNT (err u3005))

;; uSTX the vault may spend during fix-price (the in-tx Pyth refresh fee; the
;; backend's own post-condition uses the same 10_000 bound).
(define-constant PYTH_FEE_ALLOWANCE u10000)

;; ---------------------------------------------------------------- config
(define-data-var initialized bool false)
(define-data-var owner principal tx-sender)    ;; deployer until initialize
(define-data-var operator principal tx-sender) ;; backend hot key

;; Guards use contract-caller (direct calls only) so a contract the operator is
;; tricked into calling can never reach the vault as a confused deputy.
(define-private (is-owner)
  (is-eq contract-caller (var-get owner))
)

(define-private (is-authorized)
  (or (is-eq contract-caller (var-get operator)) (is-owner))
)

;; ---------------------------------------------------------------- admin
;; One-shot: hand ownership to Yguazu + set the backend operator.
(define-public (initialize (new-owner principal) (new-operator principal))
  (begin
    (asserts! (is-owner) ERR_NOT_AUTHORIZED)
    (asserts! (not (var-get initialized)) ERR_ALREADY_INITIALIZED)
    (var-set initialized true)
    (var-set owner new-owner)
    (var-set operator new-operator)
    (ok true)
  )
)

(define-public (set-operator (new-operator principal))
  (begin
    (asserts! (is-owner) ERR_NOT_AUTHORIZED)
    (var-set operator new-operator)
    (ok true)
  )
)

;; ---------------------------------------------------------------- funding
;; Anyone may add STX to the float (normally the owner).
(define-public (deposit-stx (amount uint))
  (begin
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (stx-transfer? amount tx-sender current-contract)
  )
)

;; Owner pulls STX float back. Destination is HARDCODED to the owner -- even the
;; owner key signing a withdrawal cannot route funds elsewhere in one step.
(define-public (withdraw-stx (amount uint))
  (begin
    (asserts! (is-owner) ERR_NOT_AUTHORIZED)
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (try! (as-contract? ((with-stx amount))
      (try! (stx-transfer? amount current-contract (var-get owner)))
    ))
    (ok amount)
  )
)

;; Owner pulls received sBTC (or any FT) out to bridge back to the CEX.
(define-public (withdraw-ft
    (token <ft-trait>)
    (token-name (string-ascii 128))
    (amount uint)
  )
  (begin
    (asserts! (is-owner) ERR_NOT_AUTHORIZED)
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (try! (as-contract? ((with-ft (contract-of token) token-name amount))
      (try! (contract-call? token transfer amount current-contract (var-get owner) none))
    ))
    (ok amount)
  )
)

;; ---------------------------------------------------------------- desk ops
;; Proxy fix-price. Inside as-contract? tx-sender = the vault, so the RFQ
;; contract records THIS contract as winner (the client must have signed the
;; vault principal as the SIP-018 winner). No STX moves except the Pyth fee.
(define-public (fix-rfq
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
  (begin
    (asserts! (is-authorized) ERR_NOT_AUTHORIZED)
    (try! (as-contract? ((with-stx PYTH_FEE_ALLOWANCE))
      (try! (contract-call? .rfq-sbtc-stx-jing fix-price
        id committed-out max-premium-bps auth-expiry sig vaa-x vaa-y
        pyth-storage pyth-decoder wormhole-core
      ))
    ))
    (ok id)
  )
)

;; Proxy fulfill. The STX allowance is EXACTLY the fixed-stx-out already locked
;; on-chain -- the operator has no say in the amount. The escrowed sBTC is
;; released to tx-sender inside the RFQ call = this vault.
(define-public (fulfill-rfq
    (id uint)
    (x <ft-trait>)
    (x-name (string-ascii 128))
  )
  (let (
      (rfq (unwrap! (contract-call? .rfq-sbtc-stx-jing get-rfq id) ERR_RFQ_NOT_FOUND))
      (stx-out (unwrap! (get fixed-stx-out rfq) ERR_NOT_FIXED))
    )
    (asserts! (is-authorized) ERR_NOT_AUTHORIZED)
    (try! (as-contract? ((with-stx stx-out))
      (try! (contract-call? .rfq-sbtc-stx-jing fulfill id x x-name))
    ))
    (ok stx-out)
  )
)

;; ---------------------------------------------------------------- read-onlys
(define-read-only (get-owner) (var-get owner))
(define-read-only (get-operator) (var-get operator))
(define-read-only (get-stx-balance) (stx-get-balance current-contract))
