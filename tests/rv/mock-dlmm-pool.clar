;; Mock DLMM pool stub. Vault references it as a principal arg passed
;; into the router; no functions are actually called on it during fuzz.
;; Empty contract is enough to satisfy the principal binding.
(define-read-only (mock-marker) true)
