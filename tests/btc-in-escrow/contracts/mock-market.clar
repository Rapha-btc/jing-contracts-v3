;; Test-only market: refresh-mid returns a settable mid, or err u1002 when
;; the update is the magic "stale" bytes 0xdead (stands in for a fake / stale
;; Lazer update that the real market rejects).
(define-data-var mid uint u100000)

(define-public (set-mid (m uint))
  (ok (var-set mid m))
)

(define-public (refresh-mid (update (buff 8192)))
  (if (is-eq update 0xdead)
    (err u1002)
    (ok (var-get mid))
  )
)
