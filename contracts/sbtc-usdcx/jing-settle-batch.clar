;; jing-settle-batch
;;
;; Settle many pending requests on markets-sbtc-stx-jing-v6-4 in ONE
;; transaction, with ONE Pyth Lazer update.
;;
;; On the submit + settle market a deposit, set-limit or readmit that meets an
;; opposite side parks as a PENDING request, and a later settle-token-{x,y}-*
;; call classifies it against a fresh price. A ladder deposit pushes up to 10
;; rungs at once, so today the keeper sends up to 10 settle transactions, one
;; per rung, and pays every fee. With this wrapper the depositor's own wallet
;; can settle all of its rungs right after the deposit anchors, in one
;; transaction, and pays that one fee. The keeper stays as the backstop.
;;
;; Anyone may call it: settle is permissionless on the market and moves nothing
;; for the caller; the market pays the request's owner, never tx-sender.
;;
;; One request failing does not stop the others: each settle is matched, not
;; try!'d, so a request someone else already settled (u1030
;; ERR_NOTHING_PENDING) or one the price refuses is counted as skipped, and
;; the market rolls back that one call's writes. The per-request codes are
;; returned so a caller can tell which ones still need the keeper.

(define-constant MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-4)

;; token-x = sBTC; token-y = STX through the wstx facade the market was
;; initialized with (same as the keeper's SETTLE_TOKENS).
(define-constant TOKEN_X 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant TOKEN_X_NAME "sbtc-token")
(define-constant TOKEN_Y 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2)
(define-constant TOKEN_Y_NAME "wstx")

(define-constant KIND_DEPOSIT u0)
(define-constant KIND_LIMIT u1)
(define-constant KIND_READMIT u2)

(define-constant ERR_EMPTY (err u7201))
(define-constant ERR_BAD_KIND (err u7202))
(define-constant ERR_NONE_SETTLED (err u7203))

;; One request: whose order, which side (x = sBTC, else STX), which kind.
;; Result per request: u0 = settled, otherwise the market's error code.
(define-private (settle-one
    (req { who: principal, x: bool, kind: uint })
    (acc { update: (buff 8192), settled: uint, codes: (list 10 uint) })
  )
  (let (
      (who (get who req))
      (update (get update acc))
      (kind (get kind req))
      (code (if (get x req)
        (if (is-eq kind KIND_DEPOSIT)
          (match (contract-call? MARKET settle-token-x-deposit who update TOKEN_X TOKEN_X_NAME) ok-v u0 err-v err-v)
          (if (is-eq kind KIND_LIMIT)
            (match (contract-call? MARKET settle-token-x-limit who update) ok-v u0 err-v err-v)
            (if (is-eq kind KIND_READMIT)
              (match (contract-call? MARKET settle-token-x-readmit who update) ok-v u0 err-v err-v)
              u7202
            )
          )
        )
        (if (is-eq kind KIND_DEPOSIT)
          (match (contract-call? MARKET settle-token-y-deposit who update TOKEN_Y TOKEN_Y_NAME) ok-v u0 err-v err-v)
          (if (is-eq kind KIND_LIMIT)
            (match (contract-call? MARKET settle-token-y-limit who update) ok-v u0 err-v err-v)
            (if (is-eq kind KIND_READMIT)
              (match (contract-call? MARKET settle-token-y-readmit who update) ok-v u0 err-v err-v)
              u7202
            )
          )
        )
      ))
    )
    {
      update: update,
      settled: (if (is-eq code u0) (+ (get settled acc) u1) (get settled acc)),
      codes: (unwrap-panic (as-max-len? (append (get codes acc) code) u10)),
    }
  )
)

;; Settle every request in `requests` against one signed Lazer update (the
;; same evm-format bytes the keeper fetches: feeds 1 + 45). Errors only when
;; the list is empty or nothing at all settled, so a wallet does not pay for a
;; transaction that did nothing.
(define-public (settle-many
    (update (buff 8192))
    (requests (list 10 { who: principal, x: bool, kind: uint }))
  )
  (let ((done (fold settle-one requests { update: update, settled: u0, codes: (list) })))
    (asserts! (> (len requests) u0) ERR_EMPTY)
    (asserts! (> (get settled done) u0) ERR_NONE_SETTLED)
    (print {
      event: "settle-many",
      caller: tx-sender,
      requests: (len requests),
      settled: (get settled done),
      codes: (get codes done),
    })
    (ok { settled: (get settled done), codes: (get codes done) })
  )
)
