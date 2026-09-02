;; Mock of creator-escrow-v2-jing for RV fuzzing of creator-bonus-jing.
;;
;; Deterministic from the delivery id, so RV's random uints all resolve to
;; a delivery with a known status and creator:
;;   status  = id mod 5   (0 PENDING, 1 RELEASED, 2 VETOED, 3 APPROVED, 4 EXPIRED)
;;   creator = wallet_1 when (id / 5) is even, wallet_2 when odd
;; Every delivery sits in round 1, whose payout wallets are wallet_3 (for
;; wallet_1) and wallet_4 (for wallet_2). Only the fields the bonus contract
;; reads matter; the rest are filler with the production tuple shape.

(define-constant CREATOR_A 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5) ;; wallet_1
(define-constant CREATOR_B 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG) ;; wallet_2
(define-constant WALLET_A 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC)  ;; wallet_3
(define-constant WALLET_B 'ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND)   ;; wallet_4

(define-read-only (mock-status (id uint)) (mod id u5))
(define-read-only (mock-creator (id uint))
  (if (is-eq (mod (/ id u5) u2) u0) CREATOR_A CREATOR_B))
(define-read-only (mock-wallet-of (creator principal))
  (if (is-eq creator CREATOR_A) WALLET_A WALLET_B))

(define-read-only (get-delivery (id uint))
  (some {
    round-id: u1,
    creator: (mock-creator id),
    submitted-at: u0,
    review-ends-at: u0,
    content-uri: u"",
    content-hash: 0x0000000000000000000000000000000000000000000000000000000000000000,
    status: (mock-status id),
    veto-reason: none
  }))

(define-read-only (get-round (id uint))
  (if (is-eq id u1)
    (some {
      started-at: u0,
      ends-at: u0,
      per-video: u0,
      num-videos: u0,
      deposited: u0,
      paid-out: u0,
      pending: u0,
      creator-a: CREATOR_A,
      creator-b: CREATOR_B,
      creator-a-wallet: WALLET_A,
      creator-b-wallet: WALLET_B,
      swept: false
    })
    none))
