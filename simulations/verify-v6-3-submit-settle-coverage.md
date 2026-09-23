# v6-3 submit/settle fork coverage

Run `node simulations/verify-v6-3-submit-settle-lazer.js` from the repository root.
The harness deploys the unmodified deploy copy on stxer, after core-v6 and
ladder-v1, and initializes/registers fresh market instances. It never broadcasts
a mainnet transaction. Contract version under test: `321699e` plus the uncommitted cancellation recovery changes.

Latest run: **950/950 checks green**, exit 0.
[stxer run](https://stxer.xyz/simulations/mainnet/ec3b1f35d30a51b6106573b591c86703).
Cancellation coverage checks exact pending refunds, cancellation events, cleared
pending metadata, and subsequent `u1030` on both sides, including market-only,
core-only, and combined pauses. The combined pending/live/parked case uses the
explicitly labelled, fully funded storage fixture described below.

The previous 821-check suite also remains green with its cancellation expectations
updated. Its 102 swap comparison checks compare the
reviewed `08a9ef8` source and amended deploy copy on both sides: zero-limit
calls return `u1011` with ample or insufficient liquidity, change no balances
or captured state, and commit no events. Positive-limit controls prove the
fixtures produce complete fills or refunded partial-fill dust. All four
before/after result tuples match exactly for each side. This preserves the
actual baseline; it does not demonstrate successful zero-limit fills.

The entry-only minimum-policy revision (`08a9ef8`) passed **719/719**:
[previous run](https://stxer.xyz/simulations/mainnet/37585a22f95c0cc4dbd7261cf9b43ca5).
Check 455 still refunds exactly 3,000 sats; checks 598–599 preserve the
incumbent on queue refusal. Raised-minimum pending admission, parked carry,
swap entry minimums, and post-match remainder refunds remain covered.

The superseded parking-inside-core approach passed **664/664** under the old
minimum-refund policy:
[historical run](https://stxer.xyz/simulations/mainnet/ada8ec8982221956431253b29a63f891).
It is not the policy implemented or tested by the current revision.

The reviewed core/catch revision (`72ffffd`) reproduced the caller-side bug:
**598/600 checks green**, exit 1, stopping at checks 598–599.
[pre-fix stxer run](https://stxer.xyz/simulations/mainnet/fed442065c5b484b541f624fe427c816).

The preceding settle-precheck revision passed **586/586**, exit 0:
[previous stxer run](https://stxer.xyz/simulations/mainnet/0ed2e67ec9a9727a147524e104ecc131).
That result is historical; the current revision is validated by the 821-check run above.

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

## Current minimum policy and every core caller

Minimum admission is checked at entry. `deposit-token-{x,y}` validates
existing + parked + amount before either direct admission or pending escrow.
A pending deposit retains that admission if the owner later raises the
minimum. It still faces settle-time crossing and queue checks.

The minimum check has been removed from both cores. Settle again calls
`park-tenth` before core, catches only `u1010`, refunds only the new escrow,
and logs `queue-full`. Other errors propagate. Core's parked-delete remains
after its fallback queue-size assertion; that fallback is skipped if
`park-tenth` already parked an incumbent. The existing list-length unwraps
retain their queue-invariant assumptions; the harness does not exhaustively
prove the 50-seat boundary.

All six call sites, with line numbers in the current deploy copy:

| Core caller | Core call | Minimum check | Positive-limit check |
| --- | --- | --- | --- |
| `deposit-token-y` | 1295 | 1287: existing + parked + amount before either transfer path. | 1285, before direct core call or pending write at 1300. |
| `deposit-token-x` | 1525 | 1517: same sum and ordering. | 1515, before direct core call or pending write at 1530. |
| `settle-token-y-deposit` | 1361 | Inherits submit admission at 1287. | Inherits pending limit validated at 1285. |
| `settle-token-x-deposit` | 1591 | Inherits submit admission at 1517. | Inherits pending limit validated at 1515. |
| `swap`, x input | 2648 | 2625: net >= x minimum before parking/transfers. | Shared assertion at 2604, immediately after net>0. |
| `swap`, y input | 2656 | 2625: net >= y minimum at the same point. | Same shared assertion at 2604. |

Swap's preceding guards require the caller's live and parked balances to be
zero, and its core calls pass carry=u0. Thus core's former admission sum
(existing + carry + net) equals net. Before `08a9ef8`, swap only checked
net>0 itself and relied on core for the configured minimum.

This initial net input differs from the unfilled remainder **after** matching.
`cross-remainder-as-y` at 3197 and `cross-remainder-as-x` at 3264 require that
remainder to be below the minimum (`ERR_PARTIAL_FILL` otherwise), refund it,
and remove its order. Those rules are unchanged.

Readmit is not a core caller. Contrary to the earlier line-reference premise,
`readmit-token-y` (1865) and `readmit-token-x` (1934) check only that the parked
amount is positive (1870/1939), not that it meets the configured minimum.
They and their settlers remain unchanged. The cited configured-minimum checks
are in **withdraw**, now at 1791/1841.

## Positive-limit admission and the zero-limit premise

Each core has exactly three callers: direct deposit, pending-deposit settle,
and swap. The only pending-deposit map writers are the respective public
`deposit-token-*` functions, after their positive-limit assertion. No other
function can store a zero pending limit through the contract's APIs.

The current amendment removes the two positive-limit assertions in core
and uses one shared assertion in swap, immediately after net>0. Neither swap
branch repeats the check. Invalid limits now return `u1011` before the
live/parked-position guards, configured-minimum guard, queue operations, or
rebate transfers; oracle validation and net>0 still precede it. This changes
error precedence for inputs violating several guards, as requested.

The requested premise that fully filled zero-limit swaps already succeed
does not match this implementation: swap first deposits its **entire net
input** through core, then calls `settle-with-refresh`, then handles its
remainder. Core was therefore reached before any matching at `08a9ef8` and
rejected limit 0 even with ample liquidity. The amendment preserves this
behavior; it does not add a zero-limit market-order path.

The harness deploys verbatim `08a9ef8` source and the current deploy copy into
separate fork markets for both sides. It compares zero-limit calls with ample
and insufficient liquidity, snapshots balances/orders/totals/rebate state,
and asserts no committed events on refusal. Positive-limit controls establish
that the first fixture fills completely and the second leaves refunded dust.
Before/after return values for all four cases are compared exactly.

## Reproduced failure at `72ffffd`: parking before a caught minimum refusal

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

Deploy-copy locations at `72ffffd`: `settle-token-x-deposit` invokes park-tenth
at line 1603 and core at line 1607; `park-token-x` writes at lines 937–949;
core's minimum refusal is line 1424; settle catches and refunds at lines
1613–1629. The y source mirrors this call order. This is a book mutation on
refused admission, not a missing entrant refund or a custody leak.
The reviewed revision was committed and pushed as `72ffffd`. The current
entry-only policy supersedes minimum refunds: a qualifying larger entrant is
placed even after a minimum increase, so parking its incumbent is legitimate.
Checks 598–599 now use a smaller entrant to assert the other outcome: a full
queue refunds the entrant and preserves the incumbent. The new larger-entry
case separately asserts placement, parking, and exact custody after a raise.

## Local validation

`clarinet check contracts/markets-sbtc-stx-jing-v6-3.clar` and the same check
on `-formatted.clar` both succeed with warnings. The project-wide command
cannot compute its plan because `contracts/markets-sbtc-stx-jing-v7.clar` is
missing; it falls back to an unrelated eight-contract plan, which is not
accepted as validation of this change. Stxer deployed and executed both
market instances using the actual deploy copy. The two local copies also
match after stripping comments and whitespace; `git diff --check` passes.

## Verified scenarios (x and y)

| Family | Scenarios |
| --- | --- |
| Deposit | Empty-opposite direct entry; exact order/limit; full-side escrow; exact pending amount, limit and timestamp; larger entrant admission parks incumbent; settlement by an unrelated principal; no second transfer; keeper receives neither funds nor position. |
| Deposit guards | Nothing pending `u1030`; duplicate submit `u1031`; old/equal feed `u1032`; paused submit/settle `u1007`; wrong trait on submit/settle `u1013`. |
| Deposit refusals | The original park-tenth queue error refunds in full, clears pending, logs `queue-full`; crossing refunds in full, clears pending, logs `crossing`. |
| Core fallback | Both sides refund smaller entrants when park-tenth returns `(ok false)`; larger entrants still succeed; rejected parked owners retain all parked carry and receive exactly the newly escrowed amount. |
| Minimum | Below-minimum submits reject with `u1001` before escrow on both direct and pending paths. A raised minimum does not prevent a pending live top-up or qualifying new entrant from being placed. Small entrants still receive queue-full refunds, preserving incumbent and parked balances. Exact-minimum aggregate top-ups succeed. |
| Parking and admission | A larger resubmission is placed despite a later minimum raise, with legitimate incumbent parking and exact book totals. A parked owner combines retained carry with a pending top-up, clears its own parked balance, parks the previous entrant, and preserves exact custody. |
| Swap minimum | Initial net below the minimum rejects before transfers or book changes. A qualifying swap with a positive sub-minimum remainder refunds that remainder plus unused rebate exactly, pays the reported output, and leaves no resting/pending taker order. |
| Swap zero limit | Verbatim reviewed/amended sources reject with `u1011` under both ample and insufficient liquidity; snapshots and committed-event counts prove no state or balance changes. Positive-limit controls prove full-fill/remainder fixtures and match before/after exactly. Zero-limit full fills are not supported at this HEAD. |
| Live/pending escapes | Withdraw still ignores pending-only escrow (`u1005`) and leaves pending intact when withdrawing live funds. Cancel returns pending + live + parked, clears all three pending maps and the quote, and subsequent settle calls return `u1030`. |
| Readmit | Always submits, including with opposite empty; permissionless submit/settle; pending timestamp; nothing pending, duplicate, old price and pause guards; full and crossing refusals clear pending and log their reason; parked balance survives refusals; freeing a seat after submit permits readmission; canceling parked funds also deletes the pending readmit; later settle returns `u1030`. |
| Limits | Empty-opposite direct change; pending map exact; old quote remains until settle; third-party success; nothing pending/old-price guards; crossing keeps the previous quote; cancel-before-settle clears the pending limit and later settle returns `u1030`; refusal clears pending and logs action/reason. |
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
- Withdraw does not release pending-only escrow. Cancel does, and clears
  pending limit/readmit metadata as part of the same atomic recovery.

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

- Enabled/disabled peg admission, changed peg caps/spreads, and the x disabled
  peg sentinel; price-priority parking, off-quote parking, ties, protected seats,
  and the default 40-public-seat queue (the queue fixture reserves 49 seats and
  sets distance slots to zero through public operator APIs).
- A pending owner using `swap` on its own account; simultaneous pending deposit,
  readmit and limit records for the same owner; mutation of pending limits via
  the empty-opposite direct shortcut.
- Pending admission after an intervening withdrawal reduces its aggregate
  below the submit-time minimum; wrong asset names, malformed/missing/stale/
  confidence-invalid feeds, invalid spreads/zero limits on deposit and reprice,
  core-v6 settlement pause/retry,
  and other logging failures after park writes.
- Other boundary combinations for the full-side fallback (equal-size entrants
  and protected seats). The passing cases cover larger entrants, smaller
  entrants, preservation of a refused owner's parked carry, and successful
  admission combining carry with new escrow.
- Readmit/limit `gone` refusals through paths other than cancel (cancel now
  clears those pending records); a public-call path creating simultaneous live
  and parked funds in one account. The combined-cancel test uses the funded
  synthetic split described below.
- Broader swap walk, dust, fee/rebate aging, multi-maker pro-rata settlement,
  admin authorization, ladder seat management, core equity, and rung contracts.
  Rung/ladder reruns remain a separate follow-up requiring confirmation.

## Cancellation recovery and fixture scope

Cancellation at deploy-copy lines 1623 (y) and 1694 (x) has no pause check.
It refunds pending escrow with reason `cancel` and price `u0`, without needing
an oracle, then returns parked and live funds. Its result is their sum.
The resting quote and pending deposits/limits/readmits are cleared. Pending
limits contain only quote/time metadata; pending readmits contain a timestamp,
so clearing them moves no additional funds and prevents stale requests acting
on a later deposit.

Core-v6 calls used by cancel are `log-pending-refund-y` (749),
`log-pending-refund-x` (799), `log-refund-y` (499), and `log-refund-x` (475).
None calls `check-not-paused`. The regular refund helper chain
`debit-if-not-registered` -> `is-registered` / `debit` has no pause gate either.
Registration is still required. The harness tests normal and market-paused
pending-only cancellation, core-paused pending-only cancellation, and combined
recovery while both market and core are paused. Core is paused only after all
fixtures have been prepared; recovery never uses its timelocked unpause.

All ordinary scenarios use public transactions on verbatim contract source.
One **explicit synthetic fixture per side** covers pending + live + parked
in one account. It deposits and admits fully funded tokens normally, then uses
an Eval to split that same live amount between live and parked maps and adjust
book totals. Contract custody and core equity are unchanged and checked. It
then creates pending deposit, limit, and readmit records through public calls.
The final cancel is a real transaction against the unmodified source, with
exact wallet/custody/equity and log assertions. This proves combined recovery
from that funded state, not that the state is reachable through ordinary
public calls. No source replacement, minted balances, or fake oracle is used.
