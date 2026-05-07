# creator-escrow notes

## Soft spot in the deployed contract: amended-hash is not on-chain-bound

In the **deployed** version of `creator-escrow.clar`,
`lift-veto(delivery-id, amended-content-hash)` is a unilateral statement
by OWNER. The creator never signs the amended hash on-chain. Their only
cosign at `release` is the `agree-to-terms: true` boolean, which is
opaque -- not bound to any hash.

So "I lifted veto with the right hash" today means: the owner publicly
attested to a hash via the `veto-lifted` print event. If a creator
later submits content whose hash differs from the amended one, the
deployed contract has no path to detect or block payout -- `release`
only checks status, not content.

## Mitigation in the live FE (this round)

The current round (~$200 USDCx escrowed) continues on the deployed
contract. The frontend `CreatorsPage` was updated so the creator's
`release` flow now displays the amended hash:

- The DeliveryRow card for an `AMENDED_APPROVED` delivery shows the
  amended hash fetched from the `veto-lifted` event, with copy
  "Claiming below = you accept this amended hash as the canonical
  on-chain fingerprint of your delivery."
- The `ClaimTermsModal` repeats the amended hash above the
  agree-to-terms checkbox; the checkbox label becomes "I agree to
  these terms **and the amended hash above**..."

This makes `agree-to-terms: true` an *informed* cosign in the UI,
even though the contract still doesn't enforce it. Sufficient for a
partner-only round; not sufficient at scale.

## Contract amend (queued, not deployed)

Source-only changes have been applied to `creator-escrow.clar` for
the next deployment. They:

1. Add `amended-content-hash: (optional (buff 32))` to the deliveries
   map (defaulted to `none` on submit).
2. Set it inside `lift-veto` on the same `map-set` that flips status.
3. Extend `release` to take `expected-amended-hash (optional (buff 32))`
   and assert it equals the stored amended hash whenever status is
   `AMENDED_APPROVED`. New error: `ERR_AMENDED_HASH_MISMATCH (err u120)`.
4. The `PENDING`-window-elapsed claim path ignores the parameter.

Net: `release` becomes a hash-bound acceptance instead of a vague
boolean -- exactly what the FE already shows.

## When to deploy the amend

Before the next funded round, or before broadening the creator set
beyond known partners. The frontend hook (`useCreatorEscrow.release`)
will need a one-line update at that point to thread the hash through.
