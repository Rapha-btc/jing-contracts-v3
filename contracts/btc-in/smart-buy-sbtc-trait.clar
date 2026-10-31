;; smart-buy-sbtc-trait
;;
;; The shape every fak.fun *-smart-faktory contract already has for
;; smart-buy-with-sbtc: spend sbtc-amount of the caller's sBTC on the best of
;; Bitflow / Velar, revert below min-token-out. Deployed smart contracts match
;; it as is, so jing-btc-in-adapter can call any of them without a redeploy.

(define-trait smart-buy-sbtc-trait (
  (smart-buy-with-sbtc
    (uint uint)
    (
      response
      {
      sbtc-amount: uint,
      token-out: uint,
      route-used: (string-ascii 7),
      fak-ratio-used: uint,
    }
      uint
    )
  )
))
