;; Mock reserve for RV snpl-sbtc-stx-jing fuzzing. Implements
;; reserve-trait so the snpl can pass it into borrow/repay/seize.
;; - draw: returns a fixed interest-bps (200 = 2%) and pretends to
;;   release sBTC. Doesn't actually transfer; mock-ft handles that.
;; - notify-return: ack only.
(impl-trait .reserve-trait.reserve-trait)

(define-public (draw (amount uint))
  (begin (asserts! true (err u0)) (ok u200)))

(define-public (notify-return (amount uint))
  (begin (asserts! true (err u0)) (ok true)))
