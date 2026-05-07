;; jing-treasury.clar
;;
;; Receives fees from markets-* contracts (STX + sBTC). Off-chain
;; attribution decides which creators earned what; operator credits
;; per-creator balances; creators claim into their own wallet.
;;
;; Markets contracts are unchanged -- this works by `set-treasury` on
;; each market pointing at this contract's principal. Funds pile up
;; here, distribution logic lives here.

(define-constant ERR_NOT_AUTH (err u100))
(define-constant ERR_NOT_CREATOR (err u101))
(define-constant ERR_INSUFFICIENT (err u102))

(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)

(define-data-var admin principal tx-sender)
(define-data-var operator principal tx-sender)

(define-map creators principal bool)
(define-map credit-stx  principal uint)
(define-map credit-sbtc principal uint)

(define-private (is-creator (p principal))
  (default-to false (map-get? creators p)))

(define-public (set-admin (who principal))
  (begin (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_AUTH)
         (ok (var-set admin who))))

(define-public (set-operator (who principal))
  (begin (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_AUTH)
         (ok (var-set operator who))))

(define-public (set-creator (who principal) (active bool))
  (begin (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_AUTH)
         (ok (map-set creators who active))))

(define-public (credit (who principal) (stx-amt uint) (sbtc-amt uint))
  (begin
    (asserts! (is-eq tx-sender (var-get operator)) ERR_NOT_AUTH)
    (asserts! (is-creator who) ERR_NOT_CREATOR)
    (map-set credit-stx  who (+ (default-to u0 (map-get? credit-stx  who)) stx-amt))
    (map-set credit-sbtc who (+ (default-to u0 (map-get? credit-sbtc who)) sbtc-amt))
    (print { event: "credit", creator: who, stx: stx-amt, sbtc: sbtc-amt })
    (ok true)))

(define-public (claim-stx)
  (let ((amt (default-to u0 (map-get? credit-stx tx-sender))) (who tx-sender))
    (asserts! (> amt u0) ERR_INSUFFICIENT)
    (map-set credit-stx who u0)
    (try! (as-contract (stx-transfer? amt tx-sender who)))
    (print { event: "claim-stx", creator: who, amount: amt })
    (ok amt)))

(define-public (claim-sbtc)
  (let ((amt (default-to u0 (map-get? credit-sbtc tx-sender))) (who tx-sender))
    (asserts! (> amt u0) ERR_INSUFFICIENT)
    (map-set credit-sbtc who u0)
    (try! (as-contract (contract-call? SBTC transfer amt tx-sender who none)))
    (print { event: "claim-sbtc", creator: who, amount: amt })
    (ok amt)))

(define-public (sweep-stx (amt uint) (to principal))
  (begin (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_AUTH)
         (as-contract (stx-transfer? amt tx-sender to))))

(define-public (sweep-sbtc (amt uint) (to principal))
  (begin (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_AUTH)
         (as-contract (contract-call? SBTC transfer amt tx-sender to none))))

(define-read-only (get-credit (who principal))
  { stx: (default-to u0 (map-get? credit-stx who)),
    sbtc: (default-to u0 (map-get? credit-sbtc who)) })

(define-read-only (get-admin) (var-get admin))
(define-read-only (get-operator) (var-get operator))
