(use-trait rung .jing-rung-deposit-trait.rung-trait)

(define-constant LADDER 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-ladder-sbtc-usdcx-v1)
(define-constant ERR_EMPTY (err u7101))
(define-constant ERR_TOTAL (err u7102))
(define-constant ERR_ZERO_AMOUNT (err u7103))
(define-constant ERR_NOT_SEATED (err u7104))
(define-constant ERR_DUPLICATE (err u7105))
(define-constant ERR_DIRECT_CALL (err u7106))
(define-constant ERR_NOT_REGISTERED_SIDE (err u7108))

(define-private (validate-one
    (entry {
      rung: <rung>,
      amount: uint,
    })
    (acc (response {
      remaining: uint,
      buy: bool,
      seen: (list 10 principal),
    }
      uint
    ))
  )
  (let (
      (state (try! acc))
      (target (get rung entry))
      (who (contract-of target))
      (amount (get amount entry))
    )
    (asserts! (> amount u0) ERR_ZERO_AMOUNT)
    (asserts! (<= amount (get remaining state)) ERR_TOTAL)
    (asserts! (is-none (index-of? (get seen state) who)) ERR_DUPLICATE)
    (asserts!
      (if (get buy state)
        (contract-call? LADDER is-band-y who)
        (contract-call? LADDER is-band-x who)
      )
      ERR_NOT_SEATED
    )
    (ok {
      remaining: (- (get remaining state) amount),
      buy: (get buy state),
      seen: (unwrap! (as-max-len? (append (get seen state) who) u10) ERR_TOTAL),
    })
  )
)

(define-private (deposit-one
    (entry {
      rung: <rung>,
      amount: uint,
    })
    (acc (response {
      count: uint,
      stx-paid: uint,
      sbtc-paid: uint,
      positions: (list 10
        {
          rung: principal,
          amount: uint,
          shares: uint,
          epoch: uint,
          stx-paid: uint,
          sbtc-paid: uint,
        }
      ),
    }
      uint
    ))
  )
  (let (
      (state (try! acc))
      (target (get rung entry))
      (result (try! (contract-call? target deposit (get amount entry))))
    )
    (ok {
      count: (+ (get count state) u1),
      stx-paid: (+ (get stx-paid state) (get stx-paid result)),
      sbtc-paid: (+ (get sbtc-paid state) (get sbtc-paid result)),
      positions: (unwrap!
        (as-max-len?
          (append (get positions state)
            (merge result { rung: (contract-of target) })
          )
          u10
        )
        ERR_TOTAL
      ),
    })
  )
)

(define-private (dispatch
    (total uint)
    (allocations (list 10 {
      rung: <rung>,
      amount: uint,
    }))
    (buy bool)
  )
  (begin
    (asserts! (is-eq tx-sender contract-caller) ERR_DIRECT_CALL)
    (asserts! (> (len allocations) u0) ERR_EMPTY)
    (asserts! (> total u0) ERR_TOTAL)
    (let ((validated (try! (fold validate-one allocations
        (ok {
          remaining: total,
          buy: buy,
          seen: (list),
        })
      ))))
      (asserts! (is-eq (get remaining validated) u0) ERR_TOTAL)
    )
    (let ((done (try! (fold deposit-one allocations
        (ok {
          count: u0,
          stx-paid: u0,
          sbtc-paid: u0,
          positions: (list),
        })
      ))))
      (print {
        event: "ladder-dispatched",
        member: tx-sender,
        buy: buy,
        amount: total,
        rungs: (get count done),
      })
      (ok {
        amount: total,
        rungs: (get count done),
        stx-paid: (get stx-paid done),
        sbtc-paid: (get sbtc-paid done),
        positions: (get positions done),
      })
    )
  )
)

(define-public (deposit-buy
    (total uint)
    (allocations (list 10 {
      rung: <rung>,
      amount: uint,
    }))
  )
  (dispatch total allocations true)
)

(define-public (deposit-sell
    (total uint)
    (allocations (list 10 {
      rung: <rung>,
      amount: uint,
    }))
  )
  (dispatch total allocations false)
)

(define-private (validate-exit
    (entry {
      rung: <rung>,
      amount: uint,
    })
    (acc (response {
      buy: bool,
      seen: (list 10 principal),
    } uint
    ))
  )
  (let (
      (state (try! acc))
      (target (get rung entry))
      (who (contract-of target))
      (registration (unwrap! (contract-call? LADDER get-registered who) ERR_NOT_REGISTERED_SIDE))
    )
    (asserts! (> (get amount entry) u0) ERR_ZERO_AMOUNT)
    (asserts! (is-none (index-of? (get seen state) who)) ERR_DUPLICATE)
    (asserts!
      (is-eq (get side registration)
        (if (get buy state)
          "buy-band"
          "sel-band"
        ))
      ERR_NOT_REGISTERED_SIDE
    )
    (ok {
      buy: (get buy state),
      seen: (unwrap! (as-max-len? (append (get seen state) who) u10) ERR_TOTAL),
    })
  )
)

(define-private (exit-one
    (entry {
      rung: <rung>,
      amount: uint,
    })
    (acc (response {
      withdrawn: uint,
      stx: uint,
      sbtc: uint,
      update: (optional (buff 8192)),
      positions: (list 10 {
        rung: principal,
        stx: uint,
        sbtc: uint,
      }),
    }
      uint
    ))
  )
  (let (
      (state (try! acc))
      (target (get rung entry))
    )
    (let ((result (try! (contract-call? target withdraw (get amount entry) (get update state)))))
      (ok {
        withdrawn: (+ (get withdrawn state) u1),
        stx: (+ (get stx state) (get stx result)),
        sbtc: (+ (get sbtc state) (get sbtc result)),
        update: (get update state),
        positions: (unwrap!
          (as-max-len?
            (append (get positions state)
              (merge result { rung: (contract-of target) })
            )
            u10
          )
          ERR_TOTAL
        ),
      })
    )
  )
)

(define-private (withdraw-many
    (requests (list 10 {
      rung: <rung>,
      amount: uint,
    }))
    (buy bool)
    (update (optional (buff 8192)))
  )
  (begin
    (asserts! (is-eq tx-sender contract-caller) ERR_DIRECT_CALL)
    (asserts! (> (len requests) u0) ERR_EMPTY)
    (try! (fold validate-exit requests (ok {
      buy: buy,
      seen: (list),
    })
    ))
    (let ((done (try! (fold exit-one requests
        (ok {
          withdrawn: u0,
          stx: u0,
          sbtc: u0,
          update: update,
          positions: (list),
        })
      ))))
      (print {
        event: "ladder-withdrawn",
        member: tx-sender,
        buy: buy,
        rungs: (len requests),
        withdrawn: (get withdrawn done),
      })
      (ok {
        rungs: (len requests),
        withdrawn: (get withdrawn done),
        stx: (get stx done),
        sbtc: (get sbtc done),
        positions: (get positions done),
      })
    )
  )
)

(define-public (withdraw-buy
    (requests (list 10 {
      rung: <rung>,
      amount: uint,
    }))
    (update (optional (buff 8192)))
  )
  (withdraw-many requests true update)
)

(define-public (withdraw-sell
    (requests (list 10 {
      rung: <rung>,
      amount: uint,
    }))
    (update (optional (buff 8192)))
  )
  (withdraw-many requests false update)
)

(define-private (validate-claim
    (target <rung>)
    (acc (response {
      buy: bool,
      seen: (list 10 principal),
    } uint
    ))
  )
  (let (
      (state (try! acc))
      (who (contract-of target))
      (registration (unwrap! (contract-call? LADDER get-registered who) ERR_NOT_REGISTERED_SIDE))
    )
    (asserts! (is-none (index-of? (get seen state) who)) ERR_DUPLICATE)
    (asserts!
      (is-eq (get side registration)
        (if (get buy state)
          "buy-band"
          "sel-band"
        ))
      ERR_NOT_REGISTERED_SIDE
    )
    (ok {
      buy: (get buy state),
      seen: (unwrap! (as-max-len? (append (get seen state) who) u10) ERR_TOTAL),
    })
  )
)

(define-private (claim-one
    (target <rung>)
    (acc (response {
      claimed: uint,
      stx: uint,
      sbtc: uint,
      positions: (list 10 {
        rung: principal,
        stx: uint,
        sbtc: uint,
      }),
    }
      uint
    ))
  )
  (let (
      (state (try! acc))
      (result (try! (contract-call? target claim)))
    )
    (ok {
      claimed: (+ (get claimed state) u1),
      stx: (+ (get stx state) (get stx result)),
      sbtc: (+ (get sbtc state) (get sbtc result)),
      positions: (unwrap!
        (as-max-len?
          (append (get positions state)
            (merge result { rung: (contract-of target) })
          )
          u10
        )
        ERR_TOTAL
      ),
    })
  )
)

(define-private (claim-many
    (targets (list 10 <rung>))
    (buy bool)
  )
  (begin
    (asserts! (is-eq tx-sender contract-caller) ERR_DIRECT_CALL)
    (asserts! (> (len targets) u0) ERR_EMPTY)
    (try! (fold validate-claim targets (ok {
      buy: buy,
      seen: (list),
    })
    ))
    (let ((done (try! (fold claim-one targets
        (ok {
          claimed: u0,
          stx: u0,
          sbtc: u0,
          positions: (list),
        })
      ))))
      (print {
        event: "ladder-claimed",
        member: tx-sender,
        buy: buy,
        rungs: (len targets),
        claimed: (get claimed done),
        stx: (get stx done),
        sbtc: (get sbtc done),
      })
      (ok {
        rungs: (len targets),
        claimed: (get claimed done),
        stx: (get stx done),
        sbtc: (get sbtc done),
        positions: (get positions done),
      })
    )
  )
)

(define-public (claim-buy (targets (list 10 <rung>)))
  (claim-many targets true)
)

(define-public (claim-sell (targets (list 10 <rung>)))
  (claim-many targets false)
)
