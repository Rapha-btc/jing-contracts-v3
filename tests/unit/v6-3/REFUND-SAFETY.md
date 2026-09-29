# Refund logging and bounded core debits

Implemented and verified on 2026-09-29. The full v6-3 suite passes **273/273 tests**,
including 40 refund/accounting cases and the 16 shared-core/registered-depositor
cases from the earlier maker fix. Saved full RV and Stxer reports predate these
changes and do not establish that this source pair passes those campaigns.

## Behavior

The main and formatted markets use `is-ok` for six cancellation logger calls
(live, parked and pending, on both sides) and six pending-deposit settlement
refund logger calls (crossing/full-side, admission rejection, and parking
rejection, on both sides). The followAll variant uses it for its four existing
cancellation calls and two existing pending-settlement refund calls. Its older
pending/capacity behavior has not been redesigned. Transfers retain `try!`:
a failed transfer rolls back the exit and preserves the unpaid claim.

`is-ok` ignores a returned error response, not a VM arithmetic abort. The core
therefore also bounds the aggregate subtraction inside its real `debit` helper:

```clarity
(map-set total-token-equity token
  (- total (if (> applied total) total applied))
)
```

`applied` is already `min(amount, current-owner-equity)`. The owner subtraction
cannot underflow because `applied <= current`; the aggregate subtraction cannot
underflow because its operand is at most `total`. Neither operation adds or
multiplies. Both subtractions are safe for every uint input, including zero
and the uint maximum. This helper is shared by refund, withdrawal and trade
accounting, so the bound applies to all its callers. With consistent accounting,
its behavior is unchanged. If the aggregate is too low, it reaches zero instead
of aborting. It does not repair the inconsistent aggregate or other owners'
records; the authorized priority is allowing the refund to complete.

The cancellation `log-refund-x/y` calls debit and print; they do not credit.
`log-pending-refund-x/y` only authorize and print, with no equity arithmetic.
Together, these changes prevent returned core logger errors and debit
arithmetic underflow from blocking cancellation or pending-deposit refunds.
They do not make `is-ok` catch VM aborts: execution-cost exhaustion can still
abort the whole transaction, including a transfer performed before logging.

Core caller-registration checks remain intact. Ignoring a returned rejection
in the market does not authorize an unregistered contract to write core logs.

This removes the specific core debit underflow that could block a refund.
It is not isolation from every possible VM abort, a change to `credit` overflow
handling, or a guarantee against errors in the market, token, or execution
limits. Swap/batch logging still uses its existing propagation policy. A
returned logger error can leave equity/events stale while funds are returned.

## Tests and fault-state provenance

All production function bodies execute unchanged. Separate copies used for
fault tests are excluded from the main market's coverage totals.

- `refund-total-underflow.test.ts`: 20 cases, both assets and live/parked claims,
  with aggregate zero, one below the debit, equal, one above, and uint maximum.
  Copies use the actual core and market source; only the market's core principal
  is redirected. Registration, funding and deposit use real public calls.
  Parking invokes the real private helper. A private test-only setter appended
  to the copied core then deliberately corrupts its aggregate. Both contracts
  are paused before cancellation. Assertions check exact wallet refunds, zero
  custody/claims, successful core prints, the bounded aggregate, and rejection
  of a second cancellation. **Before the clamp, all four zero-total cases
  reproduced `ArithmeticUnderflow`; after it, all 20 pass.** This demonstrates
  resilience to injected corruption, not public reachability of that corruption.
- `refund-accounting.test.ts`: four cases reduce recorded owner equity to zero
  or 100 through the actual private debit helper, then refund the full funded
  claim without touching another owner's equity; four pending crossing cases
  check returned logger rejection versus transfer failure, mirrored by asset.
- `cancel-logging.test.ts`: 12 cases, covering live, parked, pending, and mixed
  cancellation claims with real returned `u5001`, plus transfer-failure rollback.
  The `u5001` tests explicitly append funded/unregistered state to separate
  market copies. Initialized production markets cannot unregister themselves.
  These tests verify returned-error behavior only; they are not the evidence
  for arithmetic safety. No logger implementation is replaced with a mock.
- Existing lifecycle/shared-core cases check consistent equity against real
  funds, cross-market claims, registered makers/takers and complete recovery.

```sh
npx vitest run --config vitest.v6-3.config.ts tests/unit/v6-3/refund-total-underflow.test.ts tests/unit/v6-3/refund-accounting.test.ts tests/unit/v6-3/cancel-logging.test.ts
npm run test:v6-3
node --test tests/unit/v6-3/path-inventory.test.mjs
```

## Source-matched evidence

- Market SHA-256: `d1e3bbad46de1ba752507502b1caaca87b03e0b0abb344028636a57fc350cca9`.
- Core SHA-256: `67242f19794e864336bc5adf5a00391281160176339922c17e964b938c289b01`.
- Functions: 137/137 (100%).
- Lines: 2349/2356 (99.7%).
- Branches: 832/835 (99.64%).
- Explicit error exits: 286 (298 minus the 12 removed `try!` logging exits).
  No remaining exit is filtered out to improve the count.
- RV compatibility smoke: two real-core dust regressions and 100 native
  invariant trials, seed 230927, 925 accounting checks.
  This does not replace the saved 12,000-trial/600-guided-episode campaigns.
- Local full-run log: `/tmp/v6-3-refund-full.log`.
- Local pre-fix reproduction: `/tmp/v6-3-underflow-before.log`.
- Local RV smoke log: `/tmp/v6-3-refund-rv-smoke.log`.

## Execution-cost headroom

An execution budget limits runtime work, reads/writes and memory. Exceeding a
limit aborts the entire transaction; `is-ok` cannot catch that. To assess this
separate risk, the source-matched local cost probe creates 50 live makers through
public calls, admits an opposite-side maker, escrows the original maker's top-up,
pauses the market and core, then cancels the original maker's live + pending
claims. Both assets refund the exact wallet amount and leave custody covering
the other 49 makers.

| Side | Runtime / Clarinet budget | Reads / Clarinet budget |
| --- | ---: | ---: |
| x | 428,363 / 5,000,000,000 (0.00857%) | 95 / 15,000 (0.633%) |
| y | 403,055 / 5,000,000,000 (0.00806%) | 87 / 15,000 (0.580%) |

Every measured execution-cost dimension is below **0.64%** of its local limit;
memory is below 0.003%. This indicates substantial headroom for these tested
cancellations. It does not prove a universal worst case, measure every settlement
route, or establish production sBTC transfer costs: x uses the strict local FT
fixture, y uses native STX, and core is the real production source. The equivalent [Stxer integration check](../../../simulations/README-v6-3-refund-costs.md)
now passes against actual sBTC and the fork epoch limits: 291 checks, exact
refunds on both sides, and every measured cost dimension below 0.317%. No source or coverage threshold was changed to
obtain these results.

```sh
npm run test:v6-3
node tests/unit/v6-3/refund-costs.mjs
```

The probe requires the suite's generated source, verifies both current source
hashes and dependency-only substitutions, and writes `.build/refund-costs.json`.
It does not rebuild or overwrite the full-suite coverage report. The two cost
scenarios are additional measurements, not part of the 273 Vitest count.
