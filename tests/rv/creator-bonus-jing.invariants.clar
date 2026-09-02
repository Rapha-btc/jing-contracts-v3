;; ============================================================================
;; RENDEZVOUS INVARIANTS for creator-bonus-jing
;; ============================================================================
;; Fuzz build (tests/rv/build.sh):
;;   - escrow literal -> .mock-creator-escrow (status and creator derived
;;     from the id, so every random id is a delivery; 1 in 5 is RELEASED)
;;   - USDCx -> .mock-ft with the with-ft asset name pinned to "mock-ft"
;;   - fund appends each NEW delivery id to `rv-ids` so the invariants can
;;     scan every row that exists (Clarity cannot iterate a map)
;;
;; What RV exercises: fund succeeds when the sender is the deployer (OWNER)
;; and id mod 5 = 1; top-ups on the same id; claim succeeds when the sender
;; is the id's creator (wallet_1 or wallet_2) and the row is pending; revoke
;; when the sender is the deployer and the row is pending. Everything else
;; must bounce with the documented error and leave state untouched.
;; ============================================================================

(define-map context (string-ascii 100) { called: uint })

(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))

(define-private (rv-pending-amount (id uint) (acc uint))
  (match (map-get? bonuses { delivery-id: id })
    b (if (is-eq (get status b) BONUS_PENDING) (+ acc (get amount b)) acc)
    acc))

(define-private (rv-claimed-to (id uint) (acc { a: uint, b: uint }))
  (match (map-get? bonuses { delivery-id: id })
    b (if (is-eq (get status b) BONUS_CLAIMED)
        (if (is-eq (get creator b) (contract-call? .mock-creator-escrow mock-creator u0))
          (merge acc { a: (+ (get a acc) (get amount b)) })
          (merge acc { b: (+ (get b acc) (get amount b)) }))
        acc)
    acc))

;; ============================================================================
;; INVARIANT 1: conservation
;; ============================================================================
;; The contract holds exactly the sum of PENDING pots. Claim and revoke each
;; move the full pot out and flip the status in the same call; fund moves the
;; pot in. Any path that flips without moving, or moves without flipping,
;; trips this.

(define-read-only (invariant-conservation)
  (is-eq
    (unwrap-panic (contract-call? .mock-ft get-balance current-contract))
    (fold rv-pending-amount (var-get rv-ids) u0)))

;; ============================================================================
;; INVARIANT 2: every row is on a RELEASED delivery, for its real creator
;; ============================================================================
;; fund is the only writer of new rows and it requires RELEASED. The creator
;; snapshot must equal what the escrow says for that id. Amount is never
;; zero and status is one of the three known values.

(define-private (rv-row-ok (id uint) (acc bool))
  (and acc
    (match (map-get? bonuses { delivery-id: id })
      b (and
          (> (get amount b) u0)
          (<= (get status b) BONUS_REVOKED)
          (is-eq (get creator b) (contract-call? .mock-creator-escrow mock-creator id))
          (is-eq (contract-call? .mock-creator-escrow mock-status id) ESCROW_STATUS_RELEASED))
      false)))

(define-read-only (invariant-rows-released-and-attributed)
  (fold rv-row-ok (var-get rv-ids) true))

;; ============================================================================
;; INVARIANT 3: claimed pots land in the payout wallets, nowhere else
;; ============================================================================
;; wallet_3 and wallet_4 never send anything in this fuzz (fund is
;; owner-only, claim/revoke pay from the contract), so their mock-ft balance
;; is exactly the sum of claimed pots routed to them by creator.

(define-read-only (invariant-payouts-in-smart-wallets)
  (let ((sums (fold rv-claimed-to (var-get rv-ids) { a: u0, b: u0 })))
    (and
      (is-eq
        (unwrap-panic (contract-call? .mock-ft get-balance
          (contract-call? .mock-creator-escrow mock-wallet-of
            (contract-call? .mock-creator-escrow mock-creator u0))))
        (get a sums))
      (is-eq
        (unwrap-panic (contract-call? .mock-ft get-balance
          (contract-call? .mock-creator-escrow mock-wallet-of
            (contract-call? .mock-creator-escrow mock-creator u5))))
        (get b sums)))))

;; ============================================================================
;; INVARIANT 4: is-claimable agrees with the row
;; ============================================================================

(define-private (rv-claimable-ok (id uint) (acc bool))
  (and acc
    (is-eq (is-claimable id)
      (match (map-get? bonuses { delivery-id: id })
        b (is-eq (get status b) BONUS_PENDING)
        false))))

(define-read-only (invariant-is-claimable-consistent)
  (fold rv-claimable-ok (var-get rv-ids) true))
