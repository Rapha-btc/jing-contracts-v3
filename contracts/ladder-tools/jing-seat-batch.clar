;; jing-seat-batch: seat a whole set of band rungs in ONE transaction.
;;
;; The ladder owner (the Juice multisig) calls `seat` once instead of signing
;; one set-canonical per side plus one rung initialize per rung. Every inner
;; call still sees the multisig as tx-sender, so the owner checks inside
;; ladder.set-canonical and rung.initialize pass exactly as if it had called
;; them directly. Nothing here holds state or assets; anyone else calling it
;; fails at those same owner checks.
;;
;; Generic: the ladder and the rungs come in as traits, so the same deploy
;; serves jing-ladder-v1 (sBTC/STX) and jing-ladder-sbtc-usdcx-v1, and any
;; later rung set with the same set-canonical / initialize(uint, bool) shape.
;;
;; Trust: the inner calls run with the multisig as tx-sender, so the signer
;; must check the arguments as carefully as the calls themselves - every
;; rung listed is a contract that runs with owner rights. All-or-nothing: any
;; failing call reverts the whole batch.

(define-trait ladder-trait (
  (set-canonical ((string-ascii 8) principal) (response bool uint))
))

(define-trait rung-trait (
  (initialize (uint bool) (response bool uint))
))

;; buy / sell: the rung whose code hash the ladder should admit on that
;; side (none = leave it). rungs + spreads: parallel lists, each rung seated
;; at its spread in bps, in order. The ladder side names are the same on every
;; Jing ladder: "buy-band" / "sel-band".
(define-constant ERR_LENGTH_MISMATCH (err u7301))
(define-constant ERR_EMPTY (err u7302))

(define-private (seat-one
    (rung <rung-trait>)
    (acc {
      spreads: (list 40 uint),
      i: uint,
      res: (response uint uint),
    })
  )
  (match (get res acc)
    n (merge acc {
      i: (+ (get i acc) u1),
      res: (match (contract-call? rung initialize
        (default-to u0 (element-at? (get spreads acc) (get i acc))) true
      )
        ok-val (ok (+ n u1))
        e (err e)
      ),
    })
    e acc
  )
)

(define-private (set-side
    (ladder <ladder-trait>)
    (side (string-ascii 8))
    (canonical (optional principal))
  )
  (match canonical
    c (contract-call? ladder set-canonical side c)
    (ok false)
  )
)

(define-public (seat
    (ladder <ladder-trait>)
    (buy (optional principal))
    (sell (optional principal))
    (rungs (list 40 <rung-trait>))
    (spreads (list 40 uint))
  )
  (let (
      (n (len rungs))
      (buy-set (try! (set-side ladder "buy-band" buy)))
      (sell-set (try! (set-side ladder "sel-band" sell)))
    )
    (asserts! (is-eq n (len spreads)) ERR_LENGTH_MISMATCH)
    (asserts! (or (> n u0) buy-set sell-set) ERR_EMPTY)
    (let ((seated (try! (get res (fold seat-one rungs {
        spreads: spreads,
        i: u0,
        res: (ok u0),
      })))))
      (print {
        event: "seat-batch",
        ladder: (contract-of ladder),
        buy-canonical: buy,
        sell-canonical: sell,
        rungs-seated: seated,
      })
      (ok seated)
    )
  )
)
