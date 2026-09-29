;; Funded caller fixture: real transfers and real core registration/accounting.
;; It supplies no market or core implementation and never edits their storage.
(define-constant owner tx-sender)
(define-public (register)
  (begin
    (asserts! (is-eq tx-sender owner) (err u401))
    (contract-call? .jing-core-v6 register current-contract)))
(define-public (fund (x bool) (amount uint))
  (begin
    (asserts! (is-eq tx-sender owner) (err u401))
    (if x
      (try! (contract-call? .token transfer amount tx-sender current-contract none))
      (try! (stx-transfer? amount tx-sender current-contract)))
    (contract-call? .jing-core-v6 log-deposit (if x .token .wrong-token) amount)))
(define-public (deposit (peer bool) (x bool) (amount uint) (limit uint))
  (begin
    (asserts! (is-eq tx-sender owner) (err u401))
    (if x
      (as-contract? ((with-ft .token "token" amount))
        (try! (if peer
          (contract-call? .market-peer deposit-token-x amount limit none .token "token")
          (contract-call? .market deposit-token-x amount limit none .token "token"))))
      (as-contract? ((with-stx amount))
        (try! (if peer
          (contract-call? .market-peer deposit-token-y amount limit none .wrong-token "token")
          (contract-call? .market deposit-token-y amount limit none .wrong-token "token")))))))
(define-public (cancel (peer bool) (x bool))
  (begin
    (asserts! (is-eq tx-sender owner) (err u401))
    (as-contract? ()
      (try! (if x
        (if peer
          (contract-call? .market-peer cancel-token-x-deposit .token "token")
          (contract-call? .market cancel-token-x-deposit .token "token"))
        (if peer
          (contract-call? .market-peer cancel-token-y-deposit .wrong-token "token")
          (contract-call? .market cancel-token-y-deposit .wrong-token "token")))))))
(define-public (withdraw (x bool) (amount uint))
  (begin
    (asserts! (is-eq tx-sender owner) (err u401))
    (if x
      (try! (as-contract? ((with-ft .token "token" amount))
        (try! (contract-call? .token transfer amount current-contract owner none))))
      (try! (as-contract? ((with-stx amount))
        (try! (stx-transfer? amount current-contract owner)))))
    (contract-call? .jing-core-v6 log-withdraw (if x .token .wrong-token) amount)))
;; Match the registered taker convention: the market handles makers, while
;; the active custodian accounts its own swap through log-jing-swap.
(define-public (swap (x bool) (amount uint) (limit uint))
  (begin
    (asserts! (is-eq tx-sender owner) (err u401))
    (let ((result (if x
      (try! (as-contract? ((with-ft .token "token" amount))
        (try! (contract-call? .market swap amount limit 0x00 .token "token" .wrong-token "token" true))))
      (try! (as-contract? ((with-stx amount))
        (try! (contract-call? .market swap amount limit 0x00 .token "token" .wrong-token "token" false)))))))
      (try! (contract-call? .jing-core-v6 log-jing-swap 0x00 .market
        (if x .token .wrong-token) (if x .wrong-token .token)
        ;; Returned rebate and taker dust remain owned by this custodian.
        (- amount (+ (get rebate-refunded result)
          (if x (get token-x-rolled result) (get token-y-rolled result)))) limit
        (if x (get token-y-received result) (get token-x-received result))))
      (ok result))))
