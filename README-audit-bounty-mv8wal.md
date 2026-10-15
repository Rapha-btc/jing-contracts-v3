# Review: bounty mv8wal65aa4a0c11edcd (10,000 sats, Jing v6-3 LIVE part)

Review of the Jing findings against the deployed v6-3 set (market `ada49d8`,
jing-ladder-v1, 20 rungs). The Juice findings are in juicestx
`contracts/pox-5/README-bounty-mv8wal.md`.

| # | Submission | Claim | Verdict | Status |
|---|---|---|---|---|
| 1 | Rare Io | `settle-token-{x,y}-readmit` reverts u1010 instead of a clean refusal when the list is 50/50 with stale seats | Does not hold: the state cannot be reached | Rejected, no change |
| 2 | Patient Reed | `settle-token-{x,y}-deposit` checks crossing on the pending top-up's limit, but the newer stored limit is the one kept | Holds, Low | Fixed in source, live market changes on next deploy |
| 3 | Violet Reed | Exit-path cancel in the rungs never sets `escrow-cancelled-at`, so the 24h push cooldown is open | Holds, Low-Medium (griefing) | Fixed in source, live rungs change on redeploy |
| 4 | Inner Ozma | F-3 `log-jing-swap-reconciled` sets own equity; F-1 `log-withdraw` skips pause and clamps; F-8 `accept-owner` has no timelock | Does not hold: unreachable or stats only; F-8 by design | Rejected, no change |

## 1. Rare Io: readmit reverts u1010 at 50/50 with stale seats

Claim: `side-full-y` (market L488) returns false at 50/50 depositors when
`seated-y` holds more rungs than `seats-per-side`. The append at L1986 (x
mirror L2055) then fails with `ERR_QUEUE_FULL` and the readmit reverts.

The check, with `len depositors` = 50 and `s` = seated rungs in the list:

```clarity
(>= (- (len depositors) (seated-on depositors seated))
    (- MAX_DEPOSITORS (protected-seats)))
```

50 - s >= 50 - seats-per-side is true whenever s <= seats-per-side. So the
claim needs s > seats-per-side. That state cannot be reached:

- `seated-y` only grows in `sync-seat` (L145). It first drops every rung the
  ladder no longer bands (`filter still-seated-y`), then adds the caller,
  who must be banded. So `seated-y` <= the ladder's band count.
- `seats-per-side` is set only by `refresh-seat-count` (L113), from the
  ladder's `max-band-per-side`. Every call that refreshes it (`sync-seat`,
  `sync-seat-count`, `prune-seats`) prunes `seated-y` in the same call.
- The ladder refuses a `max-band-per-side` below the rungs a side already
  holds (`set-max-band-per-side`, jing-ladder-v1 L340-345).

So `seated-y` <= band count <= `seats-per-side`. The live set runs 10 rungs
and 10 seats per side, and we do not plan to change it.

The stxer PoC (ca812f0addd2bc037e2a1a354570633e) reaches the state by
writing it directly on a copy of the market (`poc-readmit-mkt`, step 8):
`(var-set seats-per-side u5)` with 10 entries in `seated-y`. No call
sequence on the live contracts produces that.

## 2. Patient Reed: deposit settle checks crossing on the older limit

Claim: `settle-token-y-deposit` (L1361, x mirror L1604) prices the crossing
check with the PENDING deposit's limit. Since the set-at fix, `put-limit-y`
keeps the stored limit when it is newer than the pending `submitted-at`. So
the added size rests at a limit that was not checked at this mid.

Sequence: Alice rests a bid. At T1 she submits a top-up with limit L1
(pending). At T2 > T1 she sets her limit to L2 (`set-token-y-limit`). The
mid moves, so L2 now crosses. The keeper settles the top-up: crossing is
checked on L1 (does not cross), and `put-limit-y` keeps L2 (T1 < T2). The
top-up rests at a crossing L2. A fresh deposit or `set-token-y-limit` at L2
would be refused "crossing".

Impact: Alice bypasses the crossing refusal. Her extra size fills against
Carol at mid in the batch, with no taker rebate, so Carol (the real maker)
loses 20-70 bps on that size. No funds stuck. Low.

Fix (2 bindings per side, in both `settle-token-{x,y}-deposit`): price the
check with the stored limit when it is newer than the pending order, else
the pending limit. The same newest-wins rule as `put-limit-*` and
`settle-token-*-limit` (`stale`, L2120).

```clarity
(newer (match (map-get? token-y-deposit-limits who)
current (if (> (get set-at current) (get submitted-at pending)) (some current) none)
none
))
(limit-price (default-to (get limit pending) (get limit newer)))
(spread-bps (default-to (get spread-bps pending) (get spread-bps newer)))
```

`newer` is `(optional {limit, spread-bps, set-at})`; `(get limit newer)` is
`(optional uint)`. Everything downstream in the settle reads these two
bindings, so `bid`, `crosses`, the park check and the deposit log all use
the effective limit. `deposit-token-y-core` passes the same value to
`put-limit-y` with `instr-at` = T1, which still does not overwrite the newer
stored limit. Nothing else changes.

Applied to `markets-sbtc-stx-jing-v6-3.clar` (y L1372, x L1619) and the
`-formatted` mirror; `clarinet check` passes on both,
`check:v6-3-mirrors` in sync. Not yet run: the v6-3 suite and the
reporter's `stale-topup-crossing.test.ts`. The live market keeps the old
behavior until the next deploy.

## 3. Violet Reed: exit-path cancel skips the 24h push cooldown

Claim: `push-to-market` refuses a push for 24h after an escrow cancel:

```clarity
(asserts! (>= stacks-block-time (+ (var-get escrow-cancelled-at) u86400))
  ERR_ESCROW_COOLDOWN
)
```

The rung cancels the market escrow in two places. `settle-escrow` sets
`escrow-cancelled-at` (the Void Kael #2 fix). The cancel inside
`pull-to-held-sats` (buy) / `pull-to-held-ustx` (sell), which runs when a
member exit would leave the market position under `min-market`, does not.
With `escrow-cancelled-at` at u0 the gate is always open.

Sequence: a pending top-up sits next to a live deposit. Bob exits; the rung
cancels its whole market position, and pending + live + parked come back to
`held`. Anyone calls the permissionless `push` at once, and the refunded
funds go back into a fresh pending escrow. The next member exit needs a
Lazer update again (err u7012).

Impact: griefing only. No funds lost. A member can still exit by passing a
Lazer `update`, anyone can settle the pending with Lazer bytes, and after
24h `settle-escrow` cancels with no oracle and arms the cooldown. The worst
case is a 24h oracle dependency each time it is set up again. It breaks the
README promise "The lock is at most one 24h window". Low-Medium.

Fix (1 line per side): set the cooldown in the exit-path cancel too, right
after `held` takes the refund.

```clarity
(var-set held-sats (+ have refunded))
(var-set escrow-cancelled-at stacks-block-time)
```

Applied to the live rung sources `contracts/jing-buy-stx-core-spread-v1.clar`
(L1092) and `contracts/jing-sell-stx-core-spread-v1.clar` (L1044), and to
`contracts/jing-buy-stx-market-spread-v1.clar` (L755, not live, same bug).
`clarinet check` passes on all three. Not yet run: rung suites and stxer
(held until the end of the bounty review). The 20 live rungs change only on
redeploy.

## 4. Inner Ozma: jing-core-v6 ledger findings

jing-core-v6 holds no funds and makes no transfers. Its equity ledger only
records stats and events.

- **F-3 `log-jing-swap-reconciled` lets a registered contract set its own
  equity: does not hold.** `register` (L259-276) accepts only a caller whose
  `contract-hash?` matches a hash the owner set with `set-verified-contract`
  (owner-only, L185-199). The only verified hash on mainnet is
  markets-sbtc-stx-jing-v6-3, and its code never calls
  `log-jing-swap-reconciled`. A clone of that code registers but runs the
  same code. The intended caller (vault-sbtc-stx-v6) is not deployed and
  derives its targets from real balances. Even if reached, it moves a stats
  number, not funds.
- **F-1 `log-withdraw` skips `check-not-paused` and the debit clamps: by
  design.** Pause blocks new entries (`log-deposit`, `log-jing-swap`), not
  exits, so users can leave while paused. markets-v6-3 never calls
  `log-withdraw`. The worst case is an event amount above the clamped
  equity, seen only by an indexer.
- **F-8 `accept-owner` has no 144-block timelock: by design.**
  `TIMELOCK_BURN_BLOCKS` (L11) is used only by `pause`/`unpause`; no constant
  promises an owner timelock. Ownership is a two-step propose/accept that
  only the current owner can start.
