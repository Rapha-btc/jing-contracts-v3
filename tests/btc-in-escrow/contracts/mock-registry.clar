;; RV-only stand-in for sbtc-registry: anyone can complete a deposit once
;; per (txid, vout-index), same row shape and same insert-once rule as the
;; real registry. RV accounts already hold genesis sBTC, so no mint here.
(define-map completed-deposits
  {
    txid: (buff 32),
    vout-index: uint,
  }
  {
    amount: uint,
    recipient: principal,
    sweep-txid: (buff 32),
    sweep-burn-hash: (buff 32),
    sweep-burn-height: uint,
  }
)

(define-public (complete
    (txid (buff 32))
    (vout-index uint)
    (amount uint)
    (recipient principal)
  )
  (ok (map-insert completed-deposits {
    txid: txid,
    vout-index: vout-index,
  } {
    amount: amount,
    recipient: recipient,
    sweep-txid: txid,
    sweep-burn-hash: txid,
    sweep-burn-height: u0,
  }))
)

(define-read-only (get-completed-deposit
    (txid (buff 32))
    (vout-index uint)
  )
  (map-get? completed-deposits {
    txid: txid,
    vout-index: vout-index,
  })
)
