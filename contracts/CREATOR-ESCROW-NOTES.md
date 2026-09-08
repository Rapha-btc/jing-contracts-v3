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

## v3 (2026-09-08): budget-exhausted round close

v2 closed rounds by height only (`ROUND_BURN_BLOCKS = 4200`). Round 3 was
fully paid ($50/$50, 4/4 slots) with 409 blocks left and `start-round` for
round 4 aborted `ERR_ROUND_ACTIVE (u103)`; the post-condition rolled the
deposit back. Nothing can happen in a round once `paid-out == deposited`
(submit / amend fail `ERR_OVER_CAPACITY`, release has no funds), so
`creator-v3/creator-escrow-v3.clar` adds `is-round-closed` = window
elapsed OR budget exhausted, used by `start-round` (still requires
`pending == u0`) and `sweep`. A live round with money left still cannot
be swept early -- that budget is the creators' guarantee for the window.
Harness `simulations/verify-creator-escrow-v3.js`: 47/47 on a mainnet
fork. Off-chain side tables are versioned (`version` column, `?v=2`)
instead of renamed. `creator-bonus-jing` is bound to v2 -> no bonuses on
v3 deliveries until a v3-bound bonus contract ships.
