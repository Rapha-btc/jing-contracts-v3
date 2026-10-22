(define-trait rung-trait
  ((deposit (uint) (response (tuple (amount uint) (shares uint) (epoch uint) (stx-paid uint) (sbtc-paid uint)) uint))
   (withdraw (uint (optional (buff 8192))) (response (tuple (stx uint) (sbtc uint)) uint))
   (claim () (response (tuple (stx uint) (sbtc uint)) uint))))
