;; RV only: stands in for SP120...usdcx (same asset name, 6 dp). Every devnet
;; account starts with 1,000,000 tokens so the fuzzer's "vault" (wallet_1)
;; can pay interest into the pool.
(define-fungible-token usdcx-token)
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin (asserts! (is-eq tx-sender sender) (err u401)) (ft-transfer? usdcx-token amount sender recipient)))
(define-read-only (get-balance (who principal)) (ok (ft-get-balance usdcx-token who)))
(define-read-only (get-decimals) (ok u6))
(map ft-mint-all (list
  'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5
  'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC
  'ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND 'ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB
  'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0 'ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ
  'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP))
(define-private (ft-mint-all (who principal)) (is-ok (ft-mint? usdcx-token u1000000000000 who)))
