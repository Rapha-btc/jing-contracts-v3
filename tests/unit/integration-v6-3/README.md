# Core-spread v1 Clarinet tests

**59/59 tests pass: 52 mirrored rung tests plus 7 dispatch scenarios.** Each rung has **100% function coverage,
99.05% line coverage and 99.28% branch coverage**. See the generated
[source-matched coverage report](COVERAGE.md) for counts, hashes and unhit points.
The original 16 scenarios measured 70.92% lines and 60.14% branches once the
rungs were included in Clarinet's instrumentation.

Scope is only `jing-buy-stx-core-spread-v1.clar` and
`jing-sell-stx-core-spread-v1.clar`, using the buy rung as reference. These
results are separate from the 273 market unit tests and market coverage.
The other four rung templates and old versions are excluded. The selected
router is `swap-router-sbtc-stx-jing-v5-3`, but router tests are not included here.

## Run

```sh
npm run test:v6-3:integration
# Focused development run; does not produce a full coverage report:
npx vitest run --config vitest.integration-v6-3.config.ts -t 'four scales'
```

The full command runs Vitest and then generates `COVERAGE.md` and
`.build/coverage.json`. It refuses a release coverage report if any test fails
or is skipped, checks that production sources are unchanged since the build,
and enforces 100% functions / 99% lines / 99% branches independently for each
rung. No unhit instrumentation points are removed from the denominator.

The rung sources are loaded by the manifest under their valid deployed names
at spreads 0 and 25, plus 10/20/…/100 for the twenty-rung dispatch scenarios.
Unlike dynamic test deployments, these are included in
Clarinet's LCOV output. The reporter merges records by source and instrumentation
location, counts all deployment names only once per source location, and checks that all
34 functions in each actual source are represented.

## What executes

- Actual v6-3 market, both actual core-spread v1 rung bodies, actual core-v6,
  ladder-v1, dispatch and its rung trait. Core, ladder and trait files are
  byte-identical to the inputs; dispatch only redirects its ladder principal.
- Market/rung changes are limited to external dependency principals and the
  local sBTC asset identifier. `build.mjs` declares every substitution; the
  test hook and coverage reporter compare the full generated bodies against it.
- sBTC uses an explicitly funded SIP-010 fixture with strict balances. STX uses
  Clarinet's native ledger. `asset-stx` supplies the wrapped-STX trait identity;
  these paths transfer native STX. Pyth prices and the RFQ miner-price input
  are configurable fixtures; signature verification, mainnet sBTC and RFQ
  tenure-price computation remain integration concerns for Stxer.
- Real ladder canonical-hash registration, seating and retirement. Rungs are
  ladder-registered makers, not core-registered vaults: core equity tracks their
  admitted market escrow; the rungs track members and local assets.
- No injected storage, generated accounting implementations, replacement
  loggers or reduced book capacities. Fills, refills and epoch changes use
  public production calls. Burn blocks advance the escrow timeout.
- Two explicitly labeled private-helper unit cases (one per rung) check absent
  escrow, absent reserve bookkeeping and rejection of an unfunded pull. They
  call unchanged helpers directly, move no money and leave state unchanged.
  These are unit boundaries, not evidence those contexts arise through public
  `withdraw`, which guards them. Every other scenario uses public calls.

## Tested scenarios

| File | Tests | Behavior |
| --- | ---: | --- |
| `rungs.test.ts` | 16 | Registration, exact paused refunds, two-member partial exits, rejected admission with locally held funds, maker proceeds, seat retirement, expired escrow recovery, unrelated young pending top-up isolation |
| `controls.test.ts` | 28 | Initialization and authorization guards, invalid spread/name, unseated registration then seating, minimum changes, push pause/resume, miner-input outage and guard refresh, same-member top-up, unfunded deposit rollback, donated assets/proceeds, young escrow requiring an update, nonzero-spread trading, three private-helper boundaries per rung |
| `epochs.test.ts` | 8 | Still-live escrow cancellation during extreme-fill tail roll, dust tail roll and historical payouts, reserve rounding release, reopening epochs, four successive rescales, inactive member entitlement, zero-value member exit, final recovery, timeout push cooldown |
| `dispatch.test.ts` | 7 | Ten buy plus ten sell rungs: single-sided and two-sided weighted batches, two-member ownership, settlement refusal for non-crossing spreads, real taker fills, proceeds-paying batch top-ups, paused batch exits, tenth-leg deposit/withdraw rollback |

The rescale test fills approximately half the book and refills it through real
transfers until four scale transitions occur. Alice stays inactive while Bob
refills. It checks the index floor, uninterrupted epoch, membership, rescale
prints, an independent per-fill allocation of Alice's proceeds (with a bounded
rounding difference), eventual payout, removal of her zero-valued shares and
final recovery. Total paid proceeds plus remaining custody equals actual maker
proceeds received. Tests exercise both STX and sBTC accounting directions.

## Twenty-rung dispatch scenarios

**Result: all seven dispatch scenarios pass; no new contract bug was found
in these scenarios.** The complete 59-test suite passes on the source hashes
in `COVERAGE.md`. No production contract changes were needed. The expected
no-match and invalid-batch refusals below are passing checks, not test failures.

Every dispatch scenario initializes ten buy and ten sell core-spread v1 rungs
at spreads 10 through 100 bps, approved through the real ladder's code-hash
gate. Each side reaches the normal ten-seat limit. The dispatch contract
accepts ten allocations per call: funding both sides uses one `deposit-buy`
and one `deposit-sell`, not a single twenty-rung transaction.

The buy-only and sell-only scenarios allocate 1–10 weighted units: respectively
10,000–100,000 sats (550,000 total) and 1–10 STX (55 STX total). A taker consumes
the first five rungs and part of the sixth; the remaining four retain their
original inventory. The first five close their epochs. A ten-rung dispatch
top-up pays the user's accrued proceeds and reopens those rungs, then a
ten-rung dispatch withdrawal exits all positions while market and core are
paused. The inactive side remains unfunded.

The two-sided scenario repeats the allocations for Alice and Bob on all twenty
rungs. A keeper `settle-with-refresh` correctly returns `u1009` without changes:
positive-spread asks and bids do not cross at the oracle midpoint. Trades then
settle through real taker swaps walking each side. Both members top up through
dispatch and receive proceeds. Alice's batch exits leave Bob's claims unchanged;
Bob then exits. Receipts are compared to exact wallet changes and per-rung
payout sums. Core equity equals live plus parked inventory, market custody
equals live plus parked plus pending claims, book totals match the rung orders,
dispatch owns no shares or tokens, and aggregate asset balances are conserved.

Four rejection tests cover both asset directions: a below-minimum tenth
deposit rolls back the first nine deposits (`u7005`), and a missing position
on the tenth withdrawal rolls back the first nine withdrawals (`u7006`).
Wallets, positions, market balances and rung states remain unchanged, receipt
events are empty, and the valid nine-position exit subsequently succeeds.

The suite does not claim complete dispatch branch coverage or a mainnet
execution-cost benchmark. It exercises actual dispatch/rung logic with the
token and oracle fixture boundaries described above. Dispatch has no batch
claim function; these scenarios use its proceeds-paying top-ups before batch
exiting. They do not assume a sold-out rung can be blindly included in a
withdrawal batch.

## Remaining gaps

All 34 functions execute on both rungs. Four instrumented lines and one branch
per rung remain unhit; they remain included in the reported percentages:

| Buy lines | Sell lines | Classification |
| --- | --- | --- |
| 139, 366, 368 | 113, 339, 341 | Callee-name lines inside the multiline calls to `get-min-deposits`, `get-token-*-deposit` and `get-current-cycle`. The enclosing calls/read helpers are exercised, but the SDK reports these individual name lines as unhit. |
| 791 | 750 | The `back > reserve` zero clamp in `count-reserve-claim`. Public payouts use computed epoch entitlements; no funded scenario produced a claim exceeding the remaining reserve. This guard protects inconsistent accounting or an overreported helper argument. Reachability under every possible history has not been formally proven impossible. |

No artificial over-claim or corrupted storage was introduced solely to hit that
last branch. Coverage is not a claim that all arithmetic inputs, errors or
possible trading histories have been proven safe. The report is close to full
unit execution coverage, **not 100% coverage**.

## Regression history and Stxer boundary

The initial sell source `f2eaa44c…` returned `u7012` when Alice requested an
already-funded live withdrawal while Bob had young pending escrow. The test
verified unchanged funds/positions after that refusal and eventual complete
recovery after 24 hours. The buy reference passed immediately. The sell port
`ef91b659…` then passed the same successful-exit expectation; it was not relaxed
or converted into an expected-error test. Both still pass that regression.

The [sell port note](../../../contracts/README-core-spread-v1-port.md) documents
that change and the historical Stxer timeout reference. The new
[buy/sell Stxer report](../../../simulations/README-v1-core-spread-rungs.md)
records **991/991 passing checks** on these same rung hashes, with the other
workstream's additional core logger (`d45f1bff…1bce`). Clarinet's release run
uses the committed core below. Its successful post-cooldown push also covers
the scenario limited by miner-price data after time advances on the Stxer fork.
This expansion changed test infrastructure and documentation only, not the
production rungs.

## Validation provenance

`COVERAGE.md` records the 59-test release run against committed market, core,
ladder, dispatch, trait and rung sources. During development, the shared core
changed while a focused test was running; the source-stability hook rejected
that run even though its scenario passed. The release run therefore used an
isolated checkout of committed contracts with these test files. The temporary
checkout used a local SDK setup-file path; contract and test bodies were
unchanged. Native-vault work is not included in this change.

Release log: `/tmp/rungs-dispatch-release.log`. Raw LCOV, test JSON and build
substitutions are in the release checkout's `.build/`, separate from
market-only coverage. A normal rerun regenerates them in this suite's `.build/`.
