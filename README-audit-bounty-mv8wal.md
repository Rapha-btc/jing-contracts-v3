# Review: bounty mv8wal65aa4a0c11edcd (10,000 sats, Jing v6-3 LIVE part)

Review of the Jing findings against the deployed v6-3 set (market `ada49d8`,
jing-ladder-v1, 20 rungs). The Juice findings are in juicestx
`contracts/pox-5/README-bounty-mv8wal.md`.

| # | Submission | Claim | Verdict | Status |
|---|---|---|---|---|
| 1 | Rare Io | `settle-token-{x,y}-readmit` reverts u1010 instead of a clean refusal when the list is 50/50 with stale seats | Does not hold: the state cannot be reached | Rejected, no change |
| 2 | Patient Reed | `settle-token-{x,y}-deposit` checks crossing on the pending top-up's limit, but the newer stored limit is the one kept | Holds, Low | Fixed in source, live market changes on next deploy |

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
