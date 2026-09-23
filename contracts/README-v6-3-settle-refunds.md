# v6-3: settle never traps a pending deposit

Target: `contracts/markets-sbtc-stx-jing-v6-3.clar` (not deployed).
Found by `simulations/verify-v6-3-submit-settle-lazer.js` (2026-09-23).

## Rule

A pending deposit ends in one of two states: placed, or refunded. Settlement
can place or refund it; the depositor can also cancel and recover its escrow
without waiting for settlement or an unpause.

## Bugs found

1. **Seat lost at settle.** `park-tenth-token-*` returns `u1010`, and the
   `try!` reverts the whole settle. Pending stays and the escrow is locked.
2. **Too small for a full side.** `park-tenth` returns `(ok false)`, then
   core's smallest-incumbent check returns `u1010`. Same result.
3. **Parked before refused.** `park-tenth` parks an incumbent, then core
   refuses the entrant as under the minimum. Catching that refusal leaves
   the incumbent parked for nothing.

## Why only `u1010` is caught

Clarity rolls back writes only when the public call returns `err`. If
settle catches a core error and returns `ok`, core's earlier writes stay.
Proof on stxer: <https://stxer.xyz/simulations/mainnet/21ee37148d90ebe0bd59859cba8d7487>

So settle catches exactly one refusal that makes no writes, and any other
error rolls back.

## Changes

- **Settle:** `match` on `park-tenth` and on core. On `u1010`: refund
  `amount`, clear pending, log `"queue-full"`. Any other error: `(err e)`.
  The parked carry is not refunded. It stays in `token-*-parked`, so cancel
  still returns it.
- **Core:** the parked delete moves after the queue-full check, so a
  `u1010` refusal writes nothing.
- **Minimum check at entry, not in core.** `deposit-token-*` (both the
  direct and the pending path) and swap (before it parks or transfers)
  check the minimum. Core no longer does. Settle places what submit
  admitted, even if the owner raised the minimum in between. This removes
  bug 3, because core can no longer refuse after a park.
- **`limit > 0` at entry, not in core.** `deposit-token-*` checks it at
  submit, and settle gets the limit from pending, so it inherits the check.
  Swap checks it at the top. Swap puts its whole input into core before
  matching, so a swap with limit 0 was already refused. No behavior change.

Core callers: direct deposit and swap use `try!`; only settle catches.

## Unreachable `u1010`s

Core also returns `u1010` from two `unwrap! (as-max-len? ... u50)` calls
when it adds the depositor to the list. Both run after writes, and settle
would catch them too, but neither can fire:

- **Bump branch:** the incumbent is filtered out before the entrant is
  added, so the list stays at or under 50.
- **Normal branch:** the side is not full, so the list is under 50 before
  the add.

## Way out

`cancel-token-{y,x}-deposit` refunds pending escrow first, logs
`log-pending-refund-*` with reason `"cancel"` and price `u0` (no oracle needed),
then refunds parked and live funds. One call returns their exact sum and
clears the pending deposit, pending limit, pending readmit, and resting quote.
Old settle calls then return `u1030`.

Cancel has no pause check. Its only core-v6 logs are `log-pending-refund-x`,
`log-pending-refund-y`, `log-refund-x`, and `log-refund-y`; none calls
`check-not-paused`, directly or through its helpers. They still require a
registered market. Thus market pause and core-v6 pause do not block recovery.
Pending limits contain only quote/time metadata; pending readmits contain
only a timestamp. Clearing them prevents an old request acting on later funds.

Why cancel is written this way:

- **`pending-amount > 0` means "has a pending deposit".** A pending entry
  never has amount 0, because submit escrows `amount` and a transfer of 0
  fails. So there is no separate `is-some` test.
- **The `map-delete`s run unconditionally.** `map-delete` on a missing key
  returns `false` and never fails.
- **Parked and live are two independent `if`s.** Today they are exclusive:
  every path that puts an order back on the book (settle with carry,
  readmit) deletes `parked` in the same step. Two `if`s cost nothing and
  still return everything if that ever breaks.

## Successful settle of a pending deposit

| Caller before settle | After settle |
|---|---|
| Parked funds | Live = parked + amount. Parked is deleted. The pending limit/spread becomes the order's. |
| Live order | Top-up. Live = existing + amount. The pending limit/spread replaces the old one. No seat check. |
| Neither (new maker) | If the side is full, may park the tenth seat. Then live = amount. |
