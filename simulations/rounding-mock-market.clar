(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

;; Minimal market double for the pooled-rung withdrawal accounting PoC.
;; It models custody and an external fill, but deliberately omits price logic.
(define-map token-x-deposits principal uint)

(define-read-only (get-min-deposits)
  { min-token-x: u1, min-token-y: u1 }
)

(define-read-only (get-current-cycle) u0)

(define-read-only (get-token-x-deposit (cycle uint) (who principal))
  (default-to u0 (map-get? token-x-deposits who))
)

(define-read-only (get-token-x-parked (who principal)) u0)
(define-read-only (get-token-y-deposit (cycle uint) (who principal)) u0)
(define-read-only (get-token-y-parked (who principal)) u0)

(define-public (deposit-token-x
    (amount uint)
    (limit-price uint)
    (update (buff 8192))
    (t <ft-trait>)
    (asset-name (string-ascii 128))
  )
  (begin
    (try! (contract-call? t transfer amount tx-sender current-contract none))
    (map-set token-x-deposits tx-sender
      (+ (default-to u0 (map-get? token-x-deposits tx-sender)) amount))
    (ok amount)
  )
)

(define-public (withdraw-token-x
    (amount uint)
    (t <ft-trait>)
    (asset-name (string-ascii 128))
  )
  (let (
      (caller tx-sender)
      (have (default-to u0 (map-get? token-x-deposits tx-sender)))
    )
    (asserts! (and (> amount u0) (< amount have)) (err u1005))
    (try! (as-contract? ((with-ft (contract-of t) asset-name amount))
      (try! (contract-call? t transfer amount current-contract caller none))
    ))
    (map-set token-x-deposits tx-sender (- have amount))
    (ok (- have amount))
  )
)

(define-public (cancel-token-x-deposit
    (t <ft-trait>)
    (asset-name (string-ascii 128))
  )
  (let (
      (caller tx-sender)
      (have (default-to u0 (map-get? token-x-deposits tx-sender)))
    )
    (asserts! (> have u0) (err u1005))
    (try! (as-contract? ((with-ft (contract-of t) asset-name have))
      (try! (contract-call? t transfer have current-contract caller none))
    ))
    (map-delete token-x-deposits tx-sender)
    (ok have)
  )
)

(define-public (readmit-token-x (who principal) (update (buff 8192)))
  (err u1022)
)

;; Represents input consumed by a fill. The unmodeled output side is irrelevant
;; to the share-burn calculation under test.
(define-public (simulate-fill-x (who principal) (amount uint))
  (let ((have (default-to u0 (map-get? token-x-deposits who))))
    (asserts! (<= amount have) (err u9001))
    (map-set token-x-deposits who (- have amount))
    (ok (- have amount))
  )
)
