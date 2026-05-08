;; Mock SIP-018-style intent hasher for RV vault fuzzing.
;; The real jing-vault-auth builds a structured-data hash; we just need
;; something deterministic that the build-intent-hash call site can
;; consume. Returns a fixed buff so signed paths reliably bounce on the
;; secp256k1 verify check (RV can't produce valid sigs anyway).
(define-read-only (build-intent-hash
  (intent {
    action: (string-ascii 32),
    side: (string-ascii 128),
    amount: uint,
    limit-price: uint,
    auth-id: uint,
    expiry: uint,
  }))
  0x0000000000000000000000000000000000000000000000000000000000000001)
