;; RV fixture: local stand-in for the mainnet USDCx token (asset usdcx-token,
;; 6 decimals). Strict SIP-010 transfer (sender must be tx-sender), every
;; devnet account pre-minted at deploy, and a flow ledger so the invariants
;; can see where every unit the seat contract sends goes.
(define-fungible-token usdcx-token)
(define-map flows { from: principal, to: principal } uint) ;; cumulative transfers
(define-map out-total principal uint) ;; cumulative sent, any recipient

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) (err u4))
    (try! (ft-transfer? usdcx-token amount sender recipient))
    (map-set flows { from: sender, to: recipient } (+ (get-flow sender recipient) amount))
    (map-set out-total sender (+ (get-out-total sender) amount))
    (ok true)))

(define-read-only (get-flow (from principal) (to principal))
  (default-to u0 (map-get? flows { from: from, to: to })))
(define-read-only (get-out-total (who principal)) (default-to u0 (map-get? out-total who)))
(define-read-only (get-name) (ok "USDCx (RV mock)"))
(define-read-only (get-symbol) (ok "USDCx"))
(define-read-only (get-decimals) (ok u6))
(define-read-only (get-balance (who principal)) (ok (ft-get-balance usdcx-token who)))
(define-read-only (get-total-supply) (ok (ft-get-supply usdcx-token)))
(define-read-only (get-token-uri) (ok none))

(define-private (seed (who principal) (acc bool))
  (and acc (is-ok (ft-mint? usdcx-token u10000000000000 who))))
(fold seed (list
  'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5
  'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC
  'ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND 'ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB
  'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0 'ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ
  'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP 'STNHKEPYEPJ8ET55ZZ0M5A34J0R3N5FM2CMMMAZ6) true)
