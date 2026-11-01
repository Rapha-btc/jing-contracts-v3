(define-constant MIN_WEEK u202601)

(define-constant ERR_NOT_ADMIN (err u100))
(define-constant ERR_NO_PENDING_ADMIN (err u101))
(define-constant ERR_NOT_MANAGER (err u102))
(define-constant ERR_MANAGER_INACTIVE (err u103))
(define-constant ERR_AMOUNT_ZERO (err u104))
(define-constant ERR_BAD_WEEK (err u105))
(define-constant ERR_WEEK_NOT_FOUND (err u106))
(define-constant ERR_ALREADY_PAID (err u107))
(define-constant ERR_NOT_SUBMITTED (err u108))
(define-constant ERR_HASH_MISMATCH (err u109))
(define-constant ERR_OVER_CAP (err u110))
(define-constant ERR_INSUFFICIENT_FUNDS (err u111))
(define-constant ERR_COUNT_ZERO (err u112))

(define-constant STATUS_SUBMITTED u0)
(define-constant STATUS_PAID u1)
(define-constant STATUS_REJECTED u2)

(define-data-var admin principal tx-sender)
(define-data-var pending-admin (optional principal) none)
(define-data-var total-funded uint u0)
(define-data-var total-paid uint u0)
(define-data-var total-withdrawn uint u0)

(define-map managers
  principal
  {
    active: bool,
    cap-ustx: uint,
  }
)

(define-map weeks
  {
    manager: principal,
    week: uint,
  }
  {
    activities-hash: (buff 32),
    count: uint,
    status: uint,
    paid-ustx: uint,
    points: uint,
    submitted-at: uint,
    paid-at: uint,
  }
)

(define-read-only (get-config)
  {
    admin: (var-get admin),
    pending-admin: (var-get pending-admin),
    asset: "STX",
    min-week: MIN_WEEK,
  }
)

(define-read-only (get-admin)
  (var-get admin)
)

(define-read-only (get-pending-admin)
  (var-get pending-admin)
)

(define-read-only (get-manager (who principal))
  (map-get? managers who)
)

(define-read-only (get-week
    (manager principal)
    (week uint)
  )
  (map-get? weeks {
    manager: manager,
    week: week,
  })
)

(define-read-only (get-balance)
  (stx-get-balance current-contract)
)

(define-read-only (get-totals)
  {
    funded: (var-get total-funded),
    paid: (var-get total-paid),
    withdrawn: (var-get total-withdrawn),
    balance: (stx-get-balance current-contract),
  }
)

(define-read-only (is-valid-week (week uint))
  (let ((wk (mod week u100)))
    (and
      (>= week MIN_WEEK)
      (>= wk u1)
      (<= wk u53)
    )
  )
)

(define-public (propose-admin (new-admin (optional principal)))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_ADMIN)
    (var-set pending-admin new-admin)
    (print {
      event: "admin-proposed",
      proposed-by: tx-sender,
      pending-admin: new-admin,
    })
    (ok true)
  )
)

(define-public (accept-admin)
  (let ((pending (unwrap! (var-get pending-admin) ERR_NO_PENDING_ADMIN)))
    (asserts! (is-eq tx-sender pending) ERR_NOT_ADMIN)
    (var-set admin pending)
    (var-set pending-admin none)
    (print {
      event: "admin-accepted",
      new-admin: pending,
    })
    (ok true)
  )
)

(define-public (set-manager
    (manager principal)
    (cap-ustx uint)
  )
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_ADMIN)
    (asserts! (> cap-ustx u0) ERR_AMOUNT_ZERO)
    (map-set managers manager {
      active: true,
      cap-ustx: cap-ustx,
    })
    (print {
      event: "manager-set",
      manager: manager,
      cap-ustx: cap-ustx,
    })
    (ok true)
  )
)

(define-public (deactivate-manager (manager principal))
  (let ((m (unwrap! (map-get? managers manager) ERR_NOT_MANAGER)))
    (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_ADMIN)
    (map-set managers manager (merge m { active: false }))
    (print {
      event: "manager-deactivated",
      manager: manager,
    })
    (ok true)
  )
)

(define-public (fund (amount uint))
  (begin
    (asserts! (> amount u0) ERR_AMOUNT_ZERO)
    (try! (stx-transfer? amount tx-sender current-contract))
    (var-set total-funded (+ (var-get total-funded) amount))
    (print {
      event: "funded",
      funder: tx-sender,
      amount: amount,
      balance: (stx-get-balance current-contract),
    })
    (ok true)
  )
)

(define-public (withdraw
    (amount uint)
    (recipient principal)
  )
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_ADMIN)
    (asserts! (> amount u0) ERR_AMOUNT_ZERO)
    (asserts! (<= amount (stx-get-balance current-contract))
      ERR_INSUFFICIENT_FUNDS
    )
    (try! (as-contract? ((with-stx amount))
      (try! (stx-transfer? amount current-contract recipient))
    ))
    (var-set total-withdrawn (+ (var-get total-withdrawn) amount))
    (print {
      event: "withdrawn",
      recipient: recipient,
      amount: amount,
      balance: (stx-get-balance current-contract),
    })
    (ok true)
  )
)

(define-public (submit-week
    (week uint)
    (activities-hash (buff 32))
    (count uint)
  )
  (let (
      (m (unwrap! (map-get? managers tx-sender) ERR_NOT_MANAGER))
      (key {
        manager: tx-sender,
        week: week,
      })
      (prev (map-get? weeks key))
      (now stacks-block-height)
    )
    (asserts! (get active m) ERR_MANAGER_INACTIVE)
    (asserts! (is-valid-week week) ERR_BAD_WEEK)
    (asserts! (> count u0) ERR_COUNT_ZERO)
    (asserts!
      (match prev
        p (not (is-eq (get status p) STATUS_PAID))
        true
      )
      ERR_ALREADY_PAID
    )
    (map-set weeks key {
      activities-hash: activities-hash,
      count: count,
      status: STATUS_SUBMITTED,
      paid-ustx: u0,
      points: u0,
      submitted-at: now,
      paid-at: u0,
    })
    (print {
      event: "week-submitted",
      manager: tx-sender,
      week: week,
      activities-hash: activities-hash,
      count: count,
      resubmit: (is-some prev),
      submitted-at: now,
    })
    (ok true)
  )
)

(define-public (pay-week
    (manager principal)
    (week uint)
    (expected-hash (buff 32))
    (points uint)
    (amount-ustx uint)
  )
  (let (
      (m (unwrap! (map-get? managers manager) ERR_NOT_MANAGER))
      (key {
        manager: manager,
        week: week,
      })
      (rec (unwrap! (map-get? weeks key) ERR_WEEK_NOT_FOUND))
      (now stacks-block-height)
    )
    (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_ADMIN)
    (asserts! (get active m) ERR_MANAGER_INACTIVE)
    (asserts! (not (is-eq (get status rec) STATUS_PAID)) ERR_ALREADY_PAID)
    (asserts! (is-eq (get status rec) STATUS_SUBMITTED) ERR_NOT_SUBMITTED)
    (asserts! (is-eq (get activities-hash rec) expected-hash) ERR_HASH_MISMATCH)
    (asserts! (> amount-ustx u0) ERR_AMOUNT_ZERO)
    (asserts! (<= amount-ustx (get cap-ustx m)) ERR_OVER_CAP)
    (asserts! (<= amount-ustx (stx-get-balance current-contract))
      ERR_INSUFFICIENT_FUNDS
    )
    (map-set weeks key
      (merge rec {
        status: STATUS_PAID,
        paid-ustx: amount-ustx,
        points: points,
        paid-at: now,
      })
    )
    (var-set total-paid (+ (var-get total-paid) amount-ustx))
    (try! (as-contract? ((with-stx amount-ustx))
      (try! (stx-transfer? amount-ustx current-contract manager))
    ))
    (print {
      event: "week-paid",
      manager: manager,
      week: week,
      activities-hash: expected-hash,
      count: (get count rec),
      points: points,
      amount: amount-ustx,
      cap-ustx: (get cap-ustx m),
      paid-at: now,
    })
    (ok true)
  )
)

(define-public (reject-week
    (manager principal)
    (week uint)
    (reason (string-ascii 64))
  )
  (let (
      (key {
        manager: manager,
        week: week,
      })
      (rec (unwrap! (map-get? weeks key) ERR_WEEK_NOT_FOUND))
    )
    (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_ADMIN)
    (asserts! (not (is-eq (get status rec) STATUS_PAID)) ERR_ALREADY_PAID)
    (asserts! (is-eq (get status rec) STATUS_SUBMITTED) ERR_NOT_SUBMITTED)
    (map-set weeks key (merge rec { status: STATUS_REJECTED }))
    (print {
      event: "week-rejected",
      manager: manager,
      week: week,
      activities-hash: (get activities-hash rec),
      reason: reason,
    })
    (ok true)
  )
)
