
;; ---------- Rendezvous invariants (appended by tests/rv/short-pool/build.sh) ----------
;; RV-required context map + updater (RV calls update-context after every call)
(define-map context (string-ascii 100) { called: uint })
(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))
(define-read-only (rv-called (function-name (string-ascii 100)))
  (default-to u0 (get called (map-get? context function-name))))
;; the fuzzer must actually exercise the vault paths, not only deposits
(define-read-only (invariant-lent-only-via-borrow)
  (or (> (rv-called "borrow") u0) (is-eq (var-get lent) u0)))
(define-constant RV_ACCOUNTS (list
  'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5
  'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC
  'ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND 'ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB
  'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0 'ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ
  'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP 'STNHKEPYEPJ8ET55ZZ0M5A34J0R3N5FM2CMMMAZ6))
(define-private (rv-add-shares (who principal) (acc uint)) (+ acc (get-shares who)))
(define-private (rv-add-value (who principal) (acc uint)) (+ acc (shares-to-stx (get-shares who))))
(define-private (rv-add-rewards (who principal) (acc uint)) (+ acc (pending-rewards who)))
;; every share is held by someone: the map sums to total-shares
(define-read-only (invariant-shares-sum)
  (is-eq (fold rv-add-shares RV_ACCOUNTS u0) (var-get total-shares)))
;; the STX the books call idle is really here (donations may only add)
(define-read-only (invariant-idle-backed)
  (>= (stx-get-balance current-contract) (var-get idle)))
;; lenders' claims never exceed the assets (rounding favors the pool)
(define-read-only (invariant-claims-within-assets)
  (<= (fold rv-add-value RV_ACCOUNTS u0) (total-assets)))
(define-read-only (invariant-share-value-bounded)
  (<= (shares-to-stx (var-get total-shares)) (total-assets)))
;; what can be borrowed or withdrawn right now is covered by idle STX
(define-read-only (invariant-capacity-within-idle)
  (<= (capacity) (var-get idle)))
(define-read-only (invariant-withdrawable-within-idle)
  (<= (get withdrawable (get-lender tx-sender)) (var-get idle)))
;; nothing can be lent out of an empty pool
(define-read-only (invariant-no-lent-without-shares)
  (or (> (var-get total-shares) u0) (is-eq (var-get lent) u0)))
;; USDCx rewards owed are in the contract, and the index never over-promises
(define-read-only (invariant-rewards-backed)
  (>= (unwrap-panic (contract-call? .mock-usdcx get-balance current-contract)) (var-get rewards-unclaimed)))
(define-read-only (invariant-rewards-within-unclaimed)
  (<= (fold rv-add-rewards RV_ACCOUNTS u0) (var-get rewards-unclaimed)))
