;; Properties execute production helper functions internally: tx-sender and
;; contract-caller remain the direct RV account. Only dependencies are mocked.
(define-map context (string-ascii 100) {called: uint})
(define-public (update-context (function-name (string-ascii 100)) (called uint))
 (ok (map-set context function-name {called: called})))
;; Public boundaries are essential when catching errors: a direct call to a
;; private implementation does not roll back earlier legs before inspection.
(define-public (rv-dispatch (total uint)
 (allocations (list 10 {rung: <rung>, amount: uint}))
 (update (buff 8192)) (buy bool))
 (let ((before (stx-get-balance tx-sender))
       (result (try! (if buy (deposit-buy total allocations update) (deposit-sell total allocations update)))))
  (asserts! (and
    (is-eq (get amount result) total)
    (is-eq (get rungs result) (len allocations))
    (is-eq (len (get positions result)) (len allocations))
    (is-eq (get stx-paid result) u0) (is-eq (get sbtc-paid result) u0)
    (is-eq (- before (stx-get-balance tx-sender)) total)
    (fold rv-check-deposit-row (get positions result) true)
  ) (err u9210))
  (ok result)))
(define-public (rv-withdraw (requests (list 10 {rung: <rung>, amount: uint})) (buy bool))
 (let ((before (stx-get-balance tx-sender))
       (result (try! (if buy (withdraw-buy requests) (withdraw-sell requests)))))
  (asserts! (and
    (is-eq (get rungs result) (len requests))
    (is-eq (get withdrawn result) (len requests))
    (is-eq (len (get positions result)) (len requests))
    (is-eq (get sbtc result) u0)
    (is-eq (get stx result) (- (stx-get-balance tx-sender) before))
    (is-eq (get stx result) (fold rv-sum-exits (get positions result) u0))
  ) (err u9211))
  (ok result)))
(define-private (rv-check-deposit-row
 (row {rung: principal, amount: uint, shares: uint, epoch: uint,
   stx-paid: uint, sbtc-paid: uint}) (valid bool))
 (and valid (is-eq (get amount row) (get shares row))
  (is-eq (get epoch row) u0) (is-eq (get stx-paid row) u0) (is-eq (get sbtc-paid row) u0)))
(define-private (rv-sum-exits (row {rung: principal, stx: uint, sbtc: uint}) (total uint))
 (+ total (get stx row)))
;; RV invariant mode excludes test-* functions. This driver ensures successful
;; state mutations occur alongside raw, usually invalid, random trait lists.
(define-public (rv-drive (raw uint) (count uint) (buy bool) (choice uint))
 (let ((mode (mod choice u4)))
  (if (is-eq mode u0) (test-roundtrip raw count buy)
   (if (is-eq mode u1) (test-retired-exit raw count buy)
    (if (is-eq mode u2) (test-deposit-rollback raw count buy (/ choice u4))
     (test-withdraw-rollback raw count buy (/ choice u4)))))))
(define-private (rv-setup (buy bool) (n uint) (mode uint) (retired bool))
 (begin
  (unwrap-panic (contract-call? .rv-dispatch-registry seat .rv-rung-0 buy))
  (unwrap-panic (contract-call? .rv-rung-0 set-mode (if (is-eq n u1) mode u0)))
  (if (and retired (is-eq n u1)) (unwrap-panic (contract-call? .rv-dispatch-registry retire .rv-rung-0)) false)
  (unwrap-panic (contract-call? .rv-dispatch-registry seat .rv-rung-1 buy))
  (unwrap-panic (contract-call? .rv-rung-1 set-mode (if (is-eq n u2) mode u0)))
  (if (and retired (is-eq n u2)) (unwrap-panic (contract-call? .rv-dispatch-registry retire .rv-rung-1)) false)
  (unwrap-panic (contract-call? .rv-dispatch-registry seat .rv-rung-2 buy))
  (unwrap-panic (contract-call? .rv-rung-2 set-mode (if (is-eq n u3) mode u0)))
  (if (and retired (is-eq n u3)) (unwrap-panic (contract-call? .rv-dispatch-registry retire .rv-rung-2)) false)
  (unwrap-panic (contract-call? .rv-dispatch-registry seat .rv-rung-3 buy))
  (unwrap-panic (contract-call? .rv-rung-3 set-mode (if (is-eq n u4) mode u0)))
  (if (and retired (is-eq n u4)) (unwrap-panic (contract-call? .rv-dispatch-registry retire .rv-rung-3)) false)
  (unwrap-panic (contract-call? .rv-dispatch-registry seat .rv-rung-4 buy))
  (unwrap-panic (contract-call? .rv-rung-4 set-mode (if (is-eq n u5) mode u0)))
  (if (and retired (is-eq n u5)) (unwrap-panic (contract-call? .rv-dispatch-registry retire .rv-rung-4)) false)
  (unwrap-panic (contract-call? .rv-dispatch-registry seat .rv-rung-5 buy))
  (unwrap-panic (contract-call? .rv-rung-5 set-mode (if (is-eq n u6) mode u0)))
  (if (and retired (is-eq n u6)) (unwrap-panic (contract-call? .rv-dispatch-registry retire .rv-rung-5)) false)
  (unwrap-panic (contract-call? .rv-dispatch-registry seat .rv-rung-6 buy))
  (unwrap-panic (contract-call? .rv-rung-6 set-mode (if (is-eq n u7) mode u0)))
  (if (and retired (is-eq n u7)) (unwrap-panic (contract-call? .rv-dispatch-registry retire .rv-rung-6)) false)
  (unwrap-panic (contract-call? .rv-dispatch-registry seat .rv-rung-7 buy))
  (unwrap-panic (contract-call? .rv-rung-7 set-mode (if (is-eq n u8) mode u0)))
  (if (and retired (is-eq n u8)) (unwrap-panic (contract-call? .rv-dispatch-registry retire .rv-rung-7)) false)
  (unwrap-panic (contract-call? .rv-dispatch-registry seat .rv-rung-8 buy))
  (unwrap-panic (contract-call? .rv-rung-8 set-mode (if (is-eq n u9) mode u0)))
  (if (and retired (is-eq n u9)) (unwrap-panic (contract-call? .rv-dispatch-registry retire .rv-rung-8)) false)
  (unwrap-panic (contract-call? .rv-dispatch-registry seat .rv-rung-9 buy))
  (unwrap-panic (contract-call? .rv-rung-9 set-mode (if (is-eq n u10) mode u0)))
  (if (and retired (is-eq n u10)) (unwrap-panic (contract-call? .rv-dispatch-registry retire .rv-rung-9)) false)
  true))
(define-read-only (rv-snapshot)
 {wallet: (stx-get-balance tx-sender), rows: (list
  {credit: (contract-call? .rv-rung-0 credit tx-sender), balance: (stx-get-balance .rv-rung-0)}
  {credit: (contract-call? .rv-rung-1 credit tx-sender), balance: (stx-get-balance .rv-rung-1)}
  {credit: (contract-call? .rv-rung-2 credit tx-sender), balance: (stx-get-balance .rv-rung-2)}
  {credit: (contract-call? .rv-rung-3 credit tx-sender), balance: (stx-get-balance .rv-rung-3)}
  {credit: (contract-call? .rv-rung-4 credit tx-sender), balance: (stx-get-balance .rv-rung-4)}
  {credit: (contract-call? .rv-rung-5 credit tx-sender), balance: (stx-get-balance .rv-rung-5)}
  {credit: (contract-call? .rv-rung-6 credit tx-sender), balance: (stx-get-balance .rv-rung-6)}
  {credit: (contract-call? .rv-rung-7 credit tx-sender), balance: (stx-get-balance .rv-rung-7)}
  {credit: (contract-call? .rv-rung-8 credit tx-sender), balance: (stx-get-balance .rv-rung-8)}
  {credit: (contract-call? .rv-rung-9 credit tx-sender), balance: (stx-get-balance .rv-rung-9)}
 )})
(define-read-only (invariant-no-custody) (is-eq (stx-get-balance current-contract) u0))
(define-read-only (invariant-fixtures-backed)
 (and (contract-call? .rv-rung-0 backed)
 (contract-call? .rv-rung-1 backed)
 (contract-call? .rv-rung-2 backed)
 (contract-call? .rv-rung-3 backed)
 (contract-call? .rv-rung-4 backed)
 (contract-call? .rv-rung-5 backed)
 (contract-call? .rv-rung-6 backed)
 (contract-call? .rv-rung-7 backed)
 (contract-call? .rv-rung-8 backed)
 (contract-call? .rv-rung-9 backed)))
(define-read-only (invariant-user-owns-credits)
 (and (is-eq (contract-call? .rv-rung-0 credit current-contract) u0)
 (is-eq (contract-call? .rv-rung-1 credit current-contract) u0)
 (is-eq (contract-call? .rv-rung-2 credit current-contract) u0)
 (is-eq (contract-call? .rv-rung-3 credit current-contract) u0)
 (is-eq (contract-call? .rv-rung-4 credit current-contract) u0)
 (is-eq (contract-call? .rv-rung-5 credit current-contract) u0)
 (is-eq (contract-call? .rv-rung-6 credit current-contract) u0)
 (is-eq (contract-call? .rv-rung-7 credit current-contract) u0)
 (is-eq (contract-call? .rv-rung-8 credit current-contract) u0)
 (is-eq (contract-call? .rv-rung-9 credit current-contract) u0)))

;; Weighted batches of 1..10: debit and credit the exact same amounts.
(define-public (test-roundtrip (raw uint) (count uint) (buy bool))
 (let ((amt (+ u1 (mod raw u10000))) (n (+ u1 (mod count u10)))
       (total (/ (* amt n (+ n u1)) u2)))
  (rv-setup buy n u0 false)
  (let ((before (rv-snapshot)))
   (try! (rv-dispatch total (unwrap-panic (slice? (list
    {rung: .rv-rung-0, amount: (* amt u1)}
    {rung: .rv-rung-1, amount: (* amt u2)}
    {rung: .rv-rung-2, amount: (* amt u3)}
    {rung: .rv-rung-3, amount: (* amt u4)}
    {rung: .rv-rung-4, amount: (* amt u5)}
    {rung: .rv-rung-5, amount: (* amt u6)}
    {rung: .rv-rung-6, amount: (* amt u7)}
    {rung: .rv-rung-7, amount: (* amt u8)}
    {rung: .rv-rung-8, amount: (* amt u9)}
    {rung: .rv-rung-9, amount: (* amt u10)}
  ) u0 n)) 0x buy))
   (try! (rv-withdraw (unwrap-panic (slice? (list
    {rung: .rv-rung-0, amount: (* amt u1)}
    {rung: .rv-rung-1, amount: (* amt u2)}
    {rung: .rv-rung-2, amount: (* amt u3)}
    {rung: .rv-rung-3, amount: (* amt u4)}
    {rung: .rv-rung-4, amount: (* amt u5)}
    {rung: .rv-rung-5, amount: (* amt u6)}
    {rung: .rv-rung-6, amount: (* amt u7)}
    {rung: .rv-rung-7, amount: (* amt u8)}
    {rung: .rv-rung-8, amount: (* amt u9)}
    {rung: .rv-rung-9, amount: (* amt u10)}
  ) u0 n)) buy))
   (asserts! (is-eq before (rv-snapshot)) (err u9200))
   (ok true))))

;; Invalid sums, duplicates, zero legs, retired seats, two late error paths.
;; Catch the error so this property can inspect rollback rather than relying
;; on the outer property itself reverting.
(define-public (test-deposit-rollback (raw uint) (count uint) (buy bool) (choice uint))
 (let ((amt (+ u1 (mod raw u10000))) (n (+ u2 (mod count u9)))
       (total (/ (* amt n (+ n u1)) u2)) (mode (mod choice u6)))
  (rv-setup buy n (if (>= mode u4) (- mode u3) u0) (is-eq mode u3))
  (let ((before (rv-snapshot))
        (result (rv-dispatch (if (is-eq mode u0) (+ total u1) total)
          (if (is-eq mode u1) (unwrap-panic (slice? (list
    {rung: .rv-rung-0, amount: (* amt u1)}
    {rung: .rv-rung-0, amount: (* amt u2)}
    {rung: .rv-rung-2, amount: (* amt u3)}
    {rung: .rv-rung-3, amount: (* amt u4)}
    {rung: .rv-rung-4, amount: (* amt u5)}
    {rung: .rv-rung-5, amount: (* amt u6)}
    {rung: .rv-rung-6, amount: (* amt u7)}
    {rung: .rv-rung-7, amount: (* amt u8)}
    {rung: .rv-rung-8, amount: (* amt u9)}
    {rung: .rv-rung-9, amount: (* amt u10)}
  ) u0 n))
            (if (is-eq mode u2) (unwrap-panic (slice? (list
    {rung: .rv-rung-0, amount: (if (is-eq n u1) u0 (* amt u1))}
    {rung: .rv-rung-1, amount: (if (is-eq n u2) u0 (* amt u2))}
    {rung: .rv-rung-2, amount: (if (is-eq n u3) u0 (* amt u3))}
    {rung: .rv-rung-3, amount: (if (is-eq n u4) u0 (* amt u4))}
    {rung: .rv-rung-4, amount: (if (is-eq n u5) u0 (* amt u5))}
    {rung: .rv-rung-5, amount: (if (is-eq n u6) u0 (* amt u6))}
    {rung: .rv-rung-6, amount: (if (is-eq n u7) u0 (* amt u7))}
    {rung: .rv-rung-7, amount: (if (is-eq n u8) u0 (* amt u8))}
    {rung: .rv-rung-8, amount: (if (is-eq n u9) u0 (* amt u9))}
    {rung: .rv-rung-9, amount: (if (is-eq n u10) u0 (* amt u10))}
  ) u0 n)) (unwrap-panic (slice? (list
    {rung: .rv-rung-0, amount: (* amt u1)}
    {rung: .rv-rung-1, amount: (* amt u2)}
    {rung: .rv-rung-2, amount: (* amt u3)}
    {rung: .rv-rung-3, amount: (* amt u4)}
    {rung: .rv-rung-4, amount: (* amt u5)}
    {rung: .rv-rung-5, amount: (* amt u6)}
    {rung: .rv-rung-6, amount: (* amt u7)}
    {rung: .rv-rung-7, amount: (* amt u8)}
    {rung: .rv-rung-8, amount: (* amt u9)}
    {rung: .rv-rung-9, amount: (* amt u10)}
  ) u0 n)))) 0x buy)))
   (asserts! (is-eq result (err (if (is-eq mode u0) u7102
     (if (is-eq mode u1) u7105 (if (is-eq mode u2) u7103
     (if (is-eq mode u3) u7104 (if (is-eq mode u4) u999 u997))))))) (err u9201))
   (asserts! (is-eq before (rv-snapshot)) (err u9202))
   (ok true))))

(define-public (test-withdraw-rollback (raw uint) (count uint) (buy bool) (choice uint))
 (let ((amt (+ u1 (mod raw u10000))) (n (+ u2 (mod count u9)))
       (total (/ (* amt n (+ n u1)) u2)) (mode (mod choice u5)))
  (rv-setup buy n u0 false)
  (try! (rv-dispatch total (unwrap-panic (slice? (list
    {rung: .rv-rung-0, amount: (* amt u1)}
    {rung: .rv-rung-1, amount: (* amt u2)}
    {rung: .rv-rung-2, amount: (* amt u3)}
    {rung: .rv-rung-3, amount: (* amt u4)}
    {rung: .rv-rung-4, amount: (* amt u5)}
    {rung: .rv-rung-5, amount: (* amt u6)}
    {rung: .rv-rung-6, amount: (* amt u7)}
    {rung: .rv-rung-7, amount: (* amt u8)}
    {rung: .rv-rung-8, amount: (* amt u9)}
    {rung: .rv-rung-9, amount: (* amt u10)}
  ) u0 n)) 0x buy))
  (rv-setup buy n (if (>= mode u3) (- mode u2) u0) false)
  (let ((before (rv-snapshot))
        (result (rv-withdraw
          (if (is-eq mode u0) (unwrap-panic (slice? (list
    {rung: .rv-rung-0, amount: (* amt u1)}
    {rung: .rv-rung-0, amount: (* amt u2)}
    {rung: .rv-rung-2, amount: (* amt u3)}
    {rung: .rv-rung-3, amount: (* amt u4)}
    {rung: .rv-rung-4, amount: (* amt u5)}
    {rung: .rv-rung-5, amount: (* amt u6)}
    {rung: .rv-rung-6, amount: (* amt u7)}
    {rung: .rv-rung-7, amount: (* amt u8)}
    {rung: .rv-rung-8, amount: (* amt u9)}
    {rung: .rv-rung-9, amount: (* amt u10)}
  ) u0 n))
            (if (is-eq mode u1) (unwrap-panic (slice? (list
    {rung: .rv-rung-0, amount: (if (is-eq n u1) u0 (* amt u1))}
    {rung: .rv-rung-1, amount: (if (is-eq n u2) u0 (* amt u2))}
    {rung: .rv-rung-2, amount: (if (is-eq n u3) u0 (* amt u3))}
    {rung: .rv-rung-3, amount: (if (is-eq n u4) u0 (* amt u4))}
    {rung: .rv-rung-4, amount: (if (is-eq n u5) u0 (* amt u5))}
    {rung: .rv-rung-5, amount: (if (is-eq n u6) u0 (* amt u6))}
    {rung: .rv-rung-6, amount: (if (is-eq n u7) u0 (* amt u7))}
    {rung: .rv-rung-7, amount: (if (is-eq n u8) u0 (* amt u8))}
    {rung: .rv-rung-8, amount: (if (is-eq n u9) u0 (* amt u9))}
    {rung: .rv-rung-9, amount: (if (is-eq n u10) u0 (* amt u10))}
  ) u0 n)) (unwrap-panic (slice? (list
    {rung: .rv-rung-0, amount: (* amt u1)}
    {rung: .rv-rung-1, amount: (* amt u2)}
    {rung: .rv-rung-2, amount: (* amt u3)}
    {rung: .rv-rung-3, amount: (* amt u4)}
    {rung: .rv-rung-4, amount: (* amt u5)}
    {rung: .rv-rung-5, amount: (* amt u6)}
    {rung: .rv-rung-6, amount: (* amt u7)}
    {rung: .rv-rung-7, amount: (* amt u8)}
    {rung: .rv-rung-8, amount: (* amt u9)}
    {rung: .rv-rung-9, amount: (* amt u10)}
  ) u0 n))))
          (if (is-eq mode u2) (not buy) buy))))
   (asserts! (is-eq result (err (if (is-eq mode u0) u7105
     (if (is-eq mode u1) u7103 (if (is-eq mode u2) u7108
     (if (is-eq mode u3) u999 u997)))))) (err u9203))
   (asserts! (is-eq before (rv-snapshot)) (err u9204))
   (ok true))))

;; Historical registration still permits withdrawal after retirement.
(define-public (test-retired-exit (raw uint) (count uint) (buy bool))
 (let ((amt (+ u1 (mod raw u10000))) (n (+ u1 (mod count u10)))
       (total (/ (* amt n (+ n u1)) u2)))
  (rv-setup buy n u0 false)
  (let ((before (rv-snapshot)))
   (try! (rv-dispatch total (unwrap-panic (slice? (list
    {rung: .rv-rung-0, amount: (* amt u1)}
    {rung: .rv-rung-1, amount: (* amt u2)}
    {rung: .rv-rung-2, amount: (* amt u3)}
    {rung: .rv-rung-3, amount: (* amt u4)}
    {rung: .rv-rung-4, amount: (* amt u5)}
    {rung: .rv-rung-5, amount: (* amt u6)}
    {rung: .rv-rung-6, amount: (* amt u7)}
    {rung: .rv-rung-7, amount: (* amt u8)}
    {rung: .rv-rung-8, amount: (* amt u9)}
    {rung: .rv-rung-9, amount: (* amt u10)}
  ) u0 n)) 0x buy))
   (rv-setup buy n u0 true)
   (try! (rv-withdraw (unwrap-panic (slice? (list
    {rung: .rv-rung-0, amount: (* amt u1)}
    {rung: .rv-rung-1, amount: (* amt u2)}
    {rung: .rv-rung-2, amount: (* amt u3)}
    {rung: .rv-rung-3, amount: (* amt u4)}
    {rung: .rv-rung-4, amount: (* amt u5)}
    {rung: .rv-rung-5, amount: (* amt u6)}
    {rung: .rv-rung-6, amount: (* amt u7)}
    {rung: .rv-rung-7, amount: (* amt u8)}
    {rung: .rv-rung-8, amount: (* amt u9)}
    {rung: .rv-rung-9, amount: (* amt u10)}
  ) u0 n)) buy))
   (asserts! (is-eq before (rv-snapshot)) (err u9205))
   (ok true))))
