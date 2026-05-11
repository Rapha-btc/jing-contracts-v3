
(define-constant SIP018_MSG_PREFIX 0x534950303138)

(define-read-only (get-domain-hash)
  (sha256 (unwrap-panic (to-consensus-buff? {
    name: "jing-vault",
    version: "1",
    chain-id: chain-id,
  }))))

(define-read-only (build-intent-hash (details {
  action: (string-ascii 16),
  side: (string-ascii 128),
  amount: uint,
  limit-price: uint,
  auth-id: uint,
  expiry: uint,
}))
  (sha256 (concat SIP018_MSG_PREFIX
    (concat (get-domain-hash)
      (sha256 (unwrap-panic (to-consensus-buff? {
        action: (get action details),
        side: (get side details),
        amount: (get amount details),
        limit-price: (get limit-price details),
        auth-id: (get auth-id details),
        expiry: (get expiry details),
      })))))))
