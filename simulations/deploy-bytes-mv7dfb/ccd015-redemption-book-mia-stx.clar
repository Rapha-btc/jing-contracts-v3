


(impl-trait 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.extension-trait.extension-trait)


(define-constant ERR_UNAUTHORIZED (err u15000))
(define-constant ERR_INVALID_OFFER (err u15001))
(define-constant ERR_OFFER_NOT_FOUND (err u15002))
(define-constant ERR_BOOK_FULL (err u15003))
(define-constant ERR_HAS_OFFER (err u15004))
(define-constant ERR_BELOW_MIN_DEPOSIT (err u15005))
(define-constant ERR_NO_FILL (err u15006))
(define-constant ERR_PAUSED (err u15007))
(define-constant ERR_ABOVE_PAR (err u15008))
(define-constant ERR_NO_BUDGET (err u15010))
(define-constant ERR_PAR_NOT_SET (err u15011))
(define-constant ERR_PAR_CALCULATION (err u15012))

(define-constant MICRO_CITYCOINS (pow u10 u6)) ;; MIA v2 carries 6 decimals
(define-constant ONE_MILLION_MIA (* u1000000 MICRO_CITYCOINS))
(define-constant MAX_OFFERS u50)
(define-constant MAX_ASK u1000000000000000)
(define-constant MAX_PER_TRANSACTION (* u10000000 MICRO_CITYCOINS)) ;; 10M MIA

(define-constant MIA_TOKEN_V2 'SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2)

(define-constant MINING_TREASURY 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd002-treasury-mia-mining-v3)
(define-constant POX5_STAKING 'SPN4Y5QPGQA8882ZXW90ADC2DHYXMSTN8VAR8C3X.ccd014-pox5-staking-mia)

(define-constant PAR_SCALE (pow u10 u8))


(define-data-var paused bool false)
(define-data-var min-deposit uint (* u100000 MICRO_CITYCOINS))

(define-data-var par-scaled uint u0)

(define-data-var offer-book
  (list 50 { owner: principal, amount: uint, ustx: uint })
  (list)
)
(define-data-var target-owner principal 'SP000000000000000000002Q6VF78)

(define-data-var total-burned-mia uint u0)
(define-data-var total-spent-ustx uint u0)


(define-public (is-dao-or-extension)
  (ok (asserts! (or
    (is-eq tx-sender 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.base-dao)
    (contract-call? 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.base-dao
      is-extension contract-caller
    )) ERR_UNAUTHORIZED
  ))
)

(define-public (callback (sender principal) (memo (buff 34)))
  (ok true)
)


(define-public (set-paused (pause bool))
  (begin
    (try! (is-dao-or-extension))
    (var-set paused pause)
    (ok (print { notification: "set-paused", payload: { paused: pause } }))
  )
)

(define-public (set-min-deposit (amount uint))
  (begin
    (try! (is-dao-or-extension))
    (asserts! (> amount u0) ERR_INVALID_OFFER)
    (var-set min-deposit amount)
    (ok (print { notification: "set-min-deposit", payload: { min-deposit: amount } }))
  )
)

(define-public (update-par)
  (let ((snapshot (unwrap! (calculate-par) ERR_PAR_CALCULATION)))
    (try! (is-dao-or-extension))
    (asserts! (> snapshot u0) ERR_PAR_CALCULATION)
    (var-set par-scaled snapshot)
    (ok (print { notification: "update-par", payload: {
      par-scaled: snapshot,
      treasury-ustx: (get-treasury-balance),
      supply: (get-mia-total-supply),
    } }))
  )
)


(define-public (place-offer (amount uint) (ask-ustx uint))
  (let (
      (owner tx-sender)
      (nrec { owner: owner, amount: amount, ustx: ask-ustx })
      (book (var-get offer-book))
    )
    (asserts! (not (var-get paused)) ERR_PAUSED)
    (asserts! (>= amount (var-get min-deposit)) ERR_BELOW_MIN_DEPOSIT)
    (asserts! (<= amount MAX_PER_TRANSACTION) ERR_INVALID_OFFER)
    (asserts! (and (> ask-ustx u0) (<= ask-ustx MAX_ASK)) ERR_INVALID_OFFER)
    (asserts! (> (var-get par-scaled) u0) ERR_PAR_NOT_SET)
    (asserts! (at-or-below-par? amount ask-ustx) ERR_ABOVE_PAR)
    (var-set target-owner owner)
    (asserts! (is-eq (len (filter is-target-owner book)) u0) ERR_HAS_OFFER)
    (try! (contract-call? MIA_TOKEN_V2 transfer amount owner current-contract none))
    (let (
        (base (if (is-eq (len book) MAX_OFFERS)
          (let ((worst (unwrap-panic (element-at? book (- (len book) u1)))))
            (asserts!
              (< (* ask-ustx (get amount worst)) (* (get ustx worst) amount))
              ERR_BOOK_FULL)
            (try! (refund-rec worst))
            (var-set target-owner (get owner worst))
            (filter not-target-owner book)
          )
          book
        ))
        (res (fold insert-step base { nrec: nrec, out: (list), placed: false }))
      )
      (var-set offer-book
        (if (get placed res) (get out res) (push-rec (get out res) nrec)))
    )
    (print { notification: "place-offer", payload: nrec })
    (ok true)
  )
)

(define-public (change-offer (add-amount (optional uint)) (new-ask-ustx uint))
  (let (
      (owner tx-sender)
      (adding (default-to u0 add-amount))
      (book (var-get offer-book))
    )
    (asserts! (not (var-get paused)) ERR_PAUSED)
    (asserts! (and (> new-ask-ustx u0) (<= new-ask-ustx MAX_ASK)) ERR_INVALID_OFFER)
    (var-set target-owner owner)
    (let (
        (mine (filter is-target-owner book))
        (cur (unwrap! (element-at? mine u0) ERR_OFFER_NOT_FOUND))
        (namount (+ (get amount cur) adding))
        (nrec { owner: owner, amount: namount, ustx: new-ask-ustx })
        (rest (filter not-target-owner book))
      )
      (asserts! (>= namount (var-get min-deposit)) ERR_BELOW_MIN_DEPOSIT)
      (asserts! (<= namount MAX_PER_TRANSACTION) ERR_INVALID_OFFER)
      (asserts! (at-or-below-par? namount new-ask-ustx) ERR_ABOVE_PAR)
      (and (> adding u0)
        (try! (contract-call? MIA_TOKEN_V2 transfer adding owner current-contract none)))
      (let ((res (fold insert-step rest { nrec: nrec, out: (list), placed: false })))
        (var-set offer-book
          (if (get placed res) (get out res) (push-rec (get out res) nrec)))
      )
      (print { notification: "change-offer", payload: nrec })
      (ok true)
    )
  )
)

(define-public (cancel-offer)
  (let ((book (var-get offer-book)))
    (var-set target-owner tx-sender)
    (let ((mine (filter is-target-owner book)))
      (asserts! (> (len mine) u0) ERR_OFFER_NOT_FOUND)
      (try! (refund-rec (unwrap-panic (element-at? mine u0))))
      (var-set offer-book (filter not-target-owner book))
    )
    (print { notification: "cancel-offer", payload: { owner: tx-sender } })
    (ok true)
  )
)


(define-public (cross-book)
  (let ((budget (stx-get-balance current-contract)))
    (asserts! (not (var-get paused)) ERR_PAUSED)
    (asserts! (> budget u0) ERR_NO_BUDGET)
    (asserts! (> (var-get par-scaled) u0) ERR_PAR_NOT_SET)
    (let (
        (res (try! (as-contract? ((with-stx budget))
              (fold settle-step (var-get offer-book) {
                remaining: budget,
                spent: u0,
                acquired: u0,
                kept: (list),
              }))))
        (acquired (get acquired res))
        (spent (get spent res))
      )
      (asserts! (> acquired u0) ERR_NO_FILL)
      (var-set offer-book (get kept res))
      (try! (as-contract? ((with-ft MIA_TOKEN_V2 "miamicoin" acquired))
        (try! (contract-call? MIA_TOKEN_V2 burn acquired current-contract))))
      (var-set total-burned-mia (+ (var-get total-burned-mia) acquired))
      (var-set total-spent-ustx (+ (var-get total-spent-ustx) spent))
      (print { notification: "cross-book", payload: {
        spent: spent,
        acquired: acquired,
        remaining-ustx: (get remaining res),
        offer-count: (len (var-get offer-book)),
      } })
      (ok { spent: spent, acquired: acquired })
    )
  )
)


(define-read-only (at-or-below-par? (amount uint) (ask uint))
  (<= (* ask PAR_SCALE) (* amount (var-get par-scaled)))
)

(define-read-only (get-par-ustx (amount uint))
  (/ (* amount (var-get par-scaled)) PAR_SCALE)
)

(define-read-only (get-par-ustx-per-1m-mia)
  (/ (* ONE_MILLION_MIA (var-get par-scaled)) PAR_SCALE)
)

(define-read-only (get-par-scaled)
  (var-get par-scaled)
)

(define-read-only (get-offer-book) (var-get offer-book))

(define-read-only (get-offer-count) (len (var-get offer-book)))

(define-read-only (get-offer (owner principal))
  (get found (fold find-owner-step (var-get offer-book) { target: owner, found: none })))

(define-read-only (get-book-totals)
  (fold sum-step (var-get offer-book) { ustx: u0, amount: u0 })
)

(define-read-only (calculate-par)
  (let (
      (treasury-ustx (get-treasury-balance))
      (supply (get-mia-total-supply))
    )
    (if (or (is-eq supply u0) (is-eq treasury-ustx u0))
      none
      (some (/ (* treasury-ustx PAR_SCALE) supply))
    )
  )
)

(define-read-only (get-treasury-balance)
  (let (
      (mining-v3 (stx-account MINING_TREASURY))
      (staked (stx-account POX5_STAKING))
    )
    (+
      (get locked mining-v3)
      (get unlocked mining-v3)
      (get locked staked)
      (get unlocked staked)
    )
  )
)

(define-read-only (get-mia-total-supply)
  (+
    (* MICRO_CITYCOINS (unwrap-panic (contract-call?
      'SP466FNC0P7JWTNM2R9T199QRZN1MYEDTAR0KP27.miamicoin-token get-total-supply)))
    (unwrap-panic (contract-call?
      'SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2 get-total-supply))
  )
)

(define-read-only (get-info)
  {
    paused: (var-get paused),
    min-deposit: (var-get min-deposit),
    offer-count: (len (var-get offer-book)),
    par-scaled: (var-get par-scaled),
    calculated-par: (calculate-par),
    budget-ustx: (stx-get-balance current-contract),
    total-burned-mia: (var-get total-burned-mia),
    total-spent-ustx: (var-get total-spent-ustx),
  }
)


(define-private (push-rec
    (lst (list 50 { owner: principal, amount: uint, ustx: uint }))
    (r { owner: principal, amount: uint, ustx: uint })
  )
  (unwrap-panic (as-max-len? (append lst r) u50))
)

(define-private (is-target-owner (r { owner: principal, amount: uint, ustx: uint }))
  (is-eq (get owner r) (var-get target-owner)))
(define-private (not-target-owner (r { owner: principal, amount: uint, ustx: uint }))
  (not (is-eq (get owner r) (var-get target-owner))))

(define-private (find-owner-step
    (r { owner: principal, amount: uint, ustx: uint })
    (acc { target: principal, found: (optional { owner: principal, amount: uint, ustx: uint }) })
  )
  (if (is-eq (get owner r) (get target acc))
    (merge acc { found: (some r) })
    acc
  )
)

(define-private (sum-step
    (r { owner: principal, amount: uint, ustx: uint })
    (acc { ustx: uint, amount: uint })
  )
  { ustx: (+ (get ustx acc) (get ustx r)), amount: (+ (get amount acc) (get amount r)) }
)

(define-private (refund-rec (r { owner: principal, amount: uint, ustx: uint }))
  (as-contract? ((with-ft MIA_TOKEN_V2 "miamicoin" (get amount r)))
    (try! (contract-call? MIA_TOKEN_V2 transfer (get amount r) current-contract (get owner r) none)))
)

(define-private (insert-step
    (entry { owner: principal, amount: uint, ustx: uint })
    (acc {
      nrec: { owner: principal, amount: uint, ustx: uint },
      out: (list 50 { owner: principal, amount: uint, ustx: uint }),
      placed: bool,
    })
  )
  (let (
      (nrec (get nrec acc))
      (nask (get ustx nrec))
      (numia (get amount nrec))
      (eask (get ustx entry))
      (eumia (get amount entry))
    )
    (if (and (not (get placed acc)) (< (* nask eumia) (* eask numia)))
      (merge acc { out: (push-rec (push-rec (get out acc) nrec) entry), placed: true })
      (merge acc { out: (push-rec (get out acc) entry) })
    )
  )
)

(define-private (settle-step
    (entry { owner: principal, amount: uint, ustx: uint })
    (acc {
      remaining: uint,
      spent: uint,
      acquired: uint,
      kept: (list 50 { owner: principal, amount: uint, ustx: uint }),
    })
  )
  (let (
      (remaining (get remaining acc))
      (ask (get ustx entry))
      (amount (get amount entry))
    )
    (if (not (at-or-below-par? amount ask))
      (merge acc { kept: (push-rec (get kept acc) entry) })
      (if (>= remaining ask)
        (begin
          (unwrap-panic (stx-transfer? ask current-contract (get owner entry)))
          (merge acc {
            remaining: (- remaining ask),
            spent: (+ (get spent acc) ask),
            acquired: (+ (get acquired acc) amount),
          })
        )
        (let ((taken (/ (* amount remaining) ask)))
          (if (> taken u0)
            (begin
              (unwrap-panic (stx-transfer? remaining current-contract (get owner entry)))
              (merge acc {
                remaining: u0,
                spent: (+ (get spent acc) remaining),
                acquired: (+ (get acquired acc) taken),
                kept: (push-rec (get kept acc)
                  (merge entry {
                    amount: (- amount taken),
                    ustx: (- ask remaining),
                  })),
              })
            )
            (merge acc { kept: (push-rec (get kept acc) entry) })
          )
        )
      )
    )
  )
)
