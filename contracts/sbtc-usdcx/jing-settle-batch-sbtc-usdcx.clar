(define-constant MARKET 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-4)

(define-constant TOKEN_X 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant TOKEN_X_NAME "sbtc-token")
(define-constant TOKEN_Y 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant TOKEN_Y_NAME "usdcx-token")

(define-constant KIND_DEPOSIT u0)
(define-constant KIND_LIMIT u1)
(define-constant KIND_READMIT u2)

(define-constant ERR_EMPTY (err u7201))
(define-constant ERR_BAD_KIND (err u7202))
(define-constant ERR_NONE_SETTLED (err u7203))

(define-private (settle-one
    (req {
      who: principal,
      x: bool,
      kind: uint,
    })
    (acc {
      update: (buff 8192),
      settled: uint,
      codes: (list 10 uint),
    })
  )
  (let (
      (who (get who req))
      (update (get update acc))
      (kind (get kind req))
      (code (if (get x req)
        (if (is-eq kind KIND_DEPOSIT)
          (match (contract-call? MARKET settle-token-x-deposit who update TOKEN_X
            TOKEN_X_NAME
          )
            ok-v u0
            err-v err-v
          )
          (if (is-eq kind KIND_LIMIT)
            (match (contract-call? MARKET settle-token-x-limit who update)
              ok-v u0
              err-v err-v
            )
            (if (is-eq kind KIND_READMIT)
              (match (contract-call? MARKET settle-token-x-readmit who update)
                ok-v u0
                err-v err-v
              )
              u7202
            )
          )
        )
        (if (is-eq kind KIND_DEPOSIT)
          (match (contract-call? MARKET settle-token-y-deposit who update TOKEN_Y
            TOKEN_Y_NAME
          )
            ok-v u0
            err-v err-v
          )
          (if (is-eq kind KIND_LIMIT)
            (match (contract-call? MARKET settle-token-y-limit who update)
              ok-v u0
              err-v err-v
            )
            (if (is-eq kind KIND_READMIT)
              (match (contract-call? MARKET settle-token-y-readmit who update)
                ok-v u0
                err-v err-v
              )
              u7202
            )
          )
        )
      ))
    )
    {
      update: update,
      settled: (if (is-eq code u0)
        (+ (get settled acc) u1)
        (get settled acc)
      ),
      codes: (unwrap-panic (as-max-len? (append (get codes acc) code) u10)),
    }
  )
)

(define-public (settle-many
    (update (buff 8192))
    (requests (list 10 {
      who: principal,
      x: bool,
      kind: uint,
    }))
  )
  (let ((done (fold settle-one requests {
      update: update,
      settled: u0,
      codes: (list),
    })))
    (asserts! (> (len requests) u0) ERR_EMPTY)
    (asserts! (> (get settled done) u0) ERR_NONE_SETTLED)
    (print {
      event: "settle-many",
      caller: tx-sender,
      requests: (len requests),
      settled: (get settled done),
      codes: (get codes done),
    })
    (ok {
      settled: (get settled done),
      codes: (get codes done),
    })
  )
)
