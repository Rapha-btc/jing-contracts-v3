# v6-3 submit/settle fork coverage

Run `node simulations/verify-v6-3-submit-settle-lazer.js` from the repository root.
The harness deploys the unmodified deploy copy on stxer, after core-v6 and
ladder-v1, and initializes/registers fresh market instances. It never broadcasts
a mainnet transaction. Contract version under test: `19ef603` plus the uncommitted queue/minimum refund fixes.

Latest run: **598/600 checks green**, exit 1, on the requested core/catch revision.
[stxer run](https://stxer.xyz/simulations/mainnet/fed442065c5b484b541f624fe427c816).
All first 586 checks passed, including both sides' queue/minimum refunds.
The additional regression failed at checks 598–599; no further transactions
were submitted after the failure. The y mirror of this new case was not run.

The preceding settle-precheck revision passed **586/586**, exit 0:
[previous stxer run](https://stxer.xyz/simulations/mainnet/0ed2e67ec9a9727a147524e104ecc131).
That green result does not apply to the current core/catch revision.

This is an explicit scenario inventory, not an instrumented line-coverage claim.
Pre-fix reproduction: **454/459 checks green**, exit 1; stopped on a contract failure at
check 455. [Full stxer run](https://stxer.xyz/simulations/mainnet/20e747b3afe58cd6fc8a3c68142bebbb).
The preceding 411-check version passed both sides:
[stxer run](https://stxer.xyz/simulations/mainnet/fe777daf2fc9971c0fb0df0c9ca5edc1).
Batch fill/payout checks also passed on both sides in the latest run.

## Reproduced bug: the core size check after `(ok false)`

On the x side, reserve 49 ladder seats (one public seat), set distance slots to
zero, and place a willing 6,000-sat incumbent with the opposite book empty.
A smaller willing 3,000-sat entrant must escrow because the side is full.
At settle, `park-tenth-token-x` returns `(ok false)` (line 875): the incoming
quote is willing at the mid and there are no price-priority orders.
The successful response enters the unchanged core call at line 1577.
`deposit-token-x-core` rejects the smaller size at line 1418 with `u1010`.
That `try!` rolls back pending deletion; the park-error refund branch is never
entered. This is distinct from the park-tenth error fixed in `19ef603`.

| Check | Expected | Actual |
| --- | --- | --- |
| 455 settle | `(ok u3000)` and refund | `(err u1010)` |
| 456 pending | `none` | Still holds 3,000 sats |
| 457 entrant balance | `u3000` | `u0` |
| 458 event | `pending-refund-x`, reason `queue-full` | No events |
| 459 market balance | `u6000` | `u9000` |

Contract lines refer to `contracts/markets-sbtc-stx-jing-v6-3.clar` at
`19ef603`. That run stopped before the y mirror, after read-only diagnostics.
The current working-tree revision keeps minimum and fallback-size admission
inside `deposit-token-{x,y}-core`. Its minimum assertion runs before either
branch. In the full-side branch, the smallest-incumbent size assertion now
precedes deletion of parked carry; in the other branch that deletion is the
first write. Thus the minimum and smallest-size assertions themselves have
made no writes when they return `u1001` or `u1010`. The existing list-length
unwraps remain after writes and rely on the queue invariant: replacing a live
incumbent removes one entry before appending, and a new non-full entry has a
free slot. The harness does not exhaustively prove the 50-seat boundary.

Submit checks existing + parked + amount before escrow. Settle catches only
core `u1001`/`u1010`, refunds the newly escrowed amount, and logs `too-small` or
`queue-full`; other errors propagate. Parked carry is retained on refusal.
The extra settle minimum flag, smallest-size fold, and inner park match are
removed. Direct-deposit and swap core callers still use `try!`.

This only establishes the order of writes **inside core**. The caller still
runs `park-tenth` first. A separate regression raises the minimum after a
larger entrant submits against a non-willing incumbent, then checks whether
the incumbent remains live when the entrant receives a minimum refund.

## Current failure: parking commits before a caught minimum refusal

In the x fixture, a live 12,999-sat incumbent has a non-willing quote on a
full side. A larger 24,000-sat entrant submits, then the owner raises the
minimum to 24,001. At settle, `park-tenth-token-x` parks the incumbent before
core rejects the entrant with `u1001`. Catching that error and returning
`(ok u24000)` refunds the entrant but also commits the earlier parking.
Both `park-x` and `pending-refund-x` (`too-small`) appear in the receipt.

| Check | Expected | Actual |
| --- | --- | --- |
| 594 entrant settle | `(ok u24000)` | `(ok u24000)` |
| 596 pending | `none` | `none` |
| 597 entrant wallet | `u24000` | `u24000` |
| 598 incumbent live | `u12999` | `u0` |
| 599 incumbent parked | `u0` | `u12999` |
| 600 market custody | `u18999` | `u18999` |

Current deploy-copy locations: `settle-token-x-deposit` invokes park-tenth
at line 1603 and core at line 1607; `park-token-x` writes at lines 937–949;
core's minimum refusal is line 1424; settle catches and refunds at lines
1613–1629. The y source mirrors this call order. This is a book mutation on
refused admission, not a missing entrant refund or a custody leak.
The requested revision remains uncommitted for review; no corrective redesign
was applied after this failure.

## Local validation

`clarinet check contracts/markets-sbtc-stx-jing-v6-3.clar` and the same check
on `-formatted.clar` both succeed with warnings. The project-wide command
cannot compute its plan because `contracts/markets-sbtc-stx-jing-v7.clar` is
missing; it falls back to an unrelated eight-contract plan, which is not
accepted as validation of this change. Stxer deployed and executed both
market instances using the actual deploy copy. A later whitespace-only
cleanup preserved its normalized tokens exactly. The two local copies also
match after stripping comments and whitespace; `git diff --check` passes.

## Verified scenarios (x and y)

| Family | Scenarios |
| --- | --- |
| Deposit | Empty-opposite direct entry; exact order/limit; full-side escrow; exact pending amount, limit and timestamp; larger entrant admission parks incumbent; settlement by an unrelated principal; no second transfer; keeper receives neither funds nor position. |
| Deposit guards | Nothing pending `u1030`; duplicate submit `u1031`; old/equal feed `u1032`; paused submit/settle `u1007`; wrong trait on submit/settle `u1013`. |
| Deposit refusals | The original park-tenth queue error refunds in full, clears pending, logs `queue-full`; crossing refunds in full, clears pending, logs `crossing`. |
| Core fallback | Both sides refund smaller entrants when park-tenth returns `(ok false)`; larger entrants still succeed; rejected parked owners retain all parked carry and receive exactly the newly escrowed amount. |
| Minimum | Below-minimum submit rejects with `u1001` before escrow; raised minimum refunds new, parked, and live owners at settle with `too-small`; live/parked funds and quotes survive; top-ups below the minimum individually succeed when their aggregate reaches it exactly. |
| Live/pending escapes | Pending-only cancel and withdraw return `u1005`; with live + pending, partial withdrawal and cancel affect live funds only; pending persists and can then settle without a second transfer. |
| Readmit | Always submits, including with opposite empty; permissionless submit/settle; pending timestamp; nothing pending, duplicate, old price and pause guards; full, crossing, and gone refusals clear pending and log their reason; parked balance survives refusals; freeing a seat after submit permits readmission; canceling parked funds after submit produces `gone`. |
| Limits | Empty-opposite direct change; pending map exact; old quote remains until settle; third-party success; nothing pending/old-price guards; crossing keeps the previous quote; cancel-before-settle gives `gone`; refusal clears pending and logs action/reason. |
| Reprice maker | Empty-opposite direct quote; non-crossing pending limit; settles through settle-limit; old-price guard; wrong x/y traits; pending replacement; maker quoting while paused. |
| Reprice taker | Crossing quote immediately fills the remaining position, pays its owner, creates no pending limit, and leaves custody equal to the book. |
| Moving book | Deposit/limit submitted against a non-willing opposite are refused after it becomes willing; a deposit submitted against a willing opposite is admitted after that opposite leaves; readmit classification also uses the changed book. |
| Pending isolation | Both `swap` and `settle-with-refresh` return `u1009` when their only potential counterpart is pending; pending/funds stay intact; the same swap succeeds after admission. |
| Batch fill | Admission at a non-crossing real signed print, fill at a different real print; exact STX/sBTC receipts net of fees, exact remainder, full x fill, and custody equality on both sides. |
| Accounting | Exact funding/refunds, book + pending + parked custody, no keeper payment, custody equals current book after swaps/reprice, exact pending amounts before/after escape attempts. |

## Matrix semantics that differ from blanket expectations

- `set-token-*-limit` and the maker reprice leg **replace** a pending limit;
  they do not return `u1031`. This was confirmed in the source and exercised
  explicitly, not treated as a passing `u1031` assertion. The original matrix
  requested `u1031` for every category; this policy question was raised with
  the user and the current harness follows source behavior pending direction.
- Quoting and settling a limit are allowed while paused (PLOB heuristic 6).
  Deposit/readmit entry and settlement do enforce pause.
- Limit/readmit settlers have no trait parameter: a wrong-trait guard is not
  applicable. Reprice validates both token traits; deposit validates its side.
- Readmit has no direct shortcut and no new escrow. Refusal keeps funds parked;
  it does not send them to the wallet. A limit refusal preserves the old quote.
- Cancel/withdraw cannot release pending-only escrow; they operate on live or
  parked balances. This is the contract behavior asserted by the harness.

## Time and submission mechanics

The initial probe demonstrated that normal steps keep `stacks-block-time` fixed.
`AdvanceBlocks` derives the next block time from **burn time**, not the current
Stacks timestamp. The harness computes its interval and checks the resulting
submit stamp. U1's decoded older feed timestamp equals the submit stamp and is
rejected with `u1032`; real signed updates whose older feed timestamp is newer
are accepted. Follow-up updates are fetched after the relevant submissions.

For the batch price-movement fixture, two real signed prints both postdate the
fixed fork submit stamp. Their midpoint supplies the quote, one print permits
admission, and the other permits batch filling. Batch permits any fresh print;
the y mirror may use the earlier captured print for its fill. Both timestamps
and mids are printed. No price payload or oracle state is fabricated.

The deployment prelude is one small SDK step list. Later transactions/evals
are appended one at a time to the same stxer session, so no request approaches
the ~200-step limit and `_chunked-submit.js` is unnecessary.

## Still outside the demonstrated coverage

- Successful parked carry folded into a pending deposit.
- Enabled/disabled peg admission, changed peg caps/spreads, and the x disabled
  peg sentinel; price-priority parking, off-quote parking, ties, protected seats,
  and the default 40-public-seat queue (the queue fixture reserves 49 seats and
  sets distance slots to zero through public operator APIs).
- A pending owner using `swap` on its own account; simultaneous pending deposit,
  readmit and limit records for the same owner; mutation of pending limits via
  the empty-opposite direct shortcut.
- Minimum failure caused by intervening withdrawal/cancel rather than an
  operator minimum change; wrong asset names, malformed/missing/stale/
  confidence-invalid feeds, invalid spreads/zero limits, core-v6 pause/retry,
  and other logging failures after park writes.
- Other boundary combinations for the full-side fallback (equal-size entrants
  and protected seats). Changed-minimum admission that would park another
  maker now fails on x; its y mirror is present but unreached after the stop.
  The passing cases cover larger entrants, smaller entrants, and preservation
  of the rejected owner's parked carry.
- Broader swap walk, dust, fee/rebate aging, multi-maker pro-rata settlement,
  admin authorization, ladder seat management, core equity, and rung contracts.
  Rung/ladder reruns remain a separate follow-up requiring confirmation.
