# Core-spread v1 Clarinet tests

This revision uses whole carried shares in every proceeds
segment, a scaled carry, and exact epoch balances with final-member payouts.
The original 9-micro-STX rescale shortfall was reproduced before the fix; its
custody/solvency expectations are unchanged. See the [accounting proof and
fork record](../../../simulations/README-v1-core-spread-rungs.md#rescale-solvency-reproduced-and-repaired).

The full integration suite passes **110/110 tests**, in eleven files with no
skips (102/102 before `dispatch-guards.test.ts`).
Its six seeded campaigns completed 396 invariant checkpoints, 52 randomized
withdrawals, 24 rescales and 12 tail rolls, and ended with zero residue.

The complete npm command and unchanged **99% line/branch gate pass**.
Both rungs reach 100% functions and 100% executable/reachable lines/branches
including declared private-helper units. Raw instrumentation and the narrow
source-anchored exceptions are retained in the [coverage report](COVERAGE.md)
and explained [below](#coverage-exceptions). The earlier 88-test run passed
its tests but failed coverage; these added units and explicit instrumentation
exceptions supersede that report without lowering the numeric thresholds.

Scope is only `jing-buy-stx-core-spread-v1.clar` and
`jing-sell-stx-core-spread-v1.clar`, using the buy rung as reference. These
results are separate from the market unit tests and market coverage.
The other four rung templates and old versions are excluded. The selected
router is `swap-router-sbtc-stx-jing-v5-3`, but router tests are not included here.

## Dispatch guards

`dispatch-guards.test.ts` (8 cases, both directions) hits every validation
guard of `jing-ladder-dispatch` before any transfer: empty list (u7101), zero
total and over/under budget (u7102), zero amount (u7103), unseated or
other-side rung on deposit (u7104), duplicate rung (u7105), a relay contract
spending its caller's sender on deposit and withdraw (u7106), and an
other-side or never-registered rung on withdraw (u7108). Each refusal has no
events and leaves the wallet unchanged. `coverage.mjs` now also gates
dispatch at the same thresholds on raw instrumentation, and lists core,
ladder and market raw coverage for reference (their gates are in
[core-ladder-v1](../core-ladder-v1/README.md) and [v6-3](../v6-3/README.md)).

## Negative controls (2026-10-01)

Run on a local copy of the rung sources, reverted afterwards, never committed:

- `b41dbd6` (full exit before share math): restoring the unconditional
  `(/ (+ (* amount SCALE) (- fi u1)) fi)` fails the four oversized-exit
  cases (direct buy/sell, tenth dispatch leg buy/sell).
- `d8b01e4` (epoch close inlined, no proceeds flush): reverse-applying the
  commit fails `production oracle fee sent to rung: retained for the next
  epoch` (buy). The sell mirror has no failing case, and none is reachable
  through public calls: the only unexpected proceeds a final withdraw can
  recognize are oracle fees, paid in STX, which is the sell rung's input
  asset, not its proceeds; the commit's other hunk (`reserve` = `free`) is
  behaviour-preserving.

## Oversized withdrawal requests

Both core-spread v1 rungs check whether `amount >= mine` before evaluating
the scaled partial-share calculation. Even a max-uint request exits only the
member's position; partial withdrawals retain the existing ceiling burn.
This fixes the withdrawal overflow reported in
[the September 30 bounty](https://aibtc.com/bounties/munkpv0qe7d1683c6411).

Four regressions first failed with `ArithmeticOverflow` on the original
sources: direct buy/sell exits and ten-rung buy/sell dispatch batches with
max-uint on the tenth leg. Direct cases cover the former ceiling-addition
and multiplication overflow boundaries, max-uint, and the final member's
paused exit. All cases require exact payouts, preservation of another
member's position, and final recovery with zero residue. Logs are
`/tmp/jing-withdraw-overflow-before.log` and
`/tmp/jing-withdraw-overflow-full.log`.

The earlier Stxer reports below predate this withdrawal guard and the close-epoch
flush removal below; their recorded
hashes are historical. The regenerated Clarinet coverage report identifies
the sources tested with both changes.

## Epoch close without a second payout

`withdraw` pays the sole member's proceeds through `settle-proceeds` before
returning the input. The epoch close is inline in `withdraw` again (the
`close-epoch` helper is gone): it records the final index/scale, logs closure
and advances the epoch. It neither transfers proceeds nor clears/debits their
exact balance. Withdrawal reports only the proceeds already paid by settlement.

Normal settlement/admission, crossing refunds and cancellation move only the
input asset. If unexpected proceeds are recognized after settlement, they
remain in `current-proceeds` and the accounted balance for the next epoch's
final member. They are not indexed a second time. The public fee-to-rung
regression retains 7 micro-STX through closure, opens a two-member epoch,
and pays those 7 only to its final member, with zero final residue.

`withdraw-dust.test.ts` contains five normal public-exit cases and two oracle
fee cases. Its oracle and trait snapshots are exact deployed source; the
decoder uses deterministic test feeds, so signatures are outside this test.
The positive-fee scenario is deliberately configured through oracle governance;
it is a recovery-policy test, not a claim about the current Pyth configuration.

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
rung. Raw instrumentation and every source-anchored exception are reported
separately; see [coverage exceptions](#coverage-exceptions). The numeric
thresholds are unchanged.

The rung sources are loaded by the manifest under their valid deployed names
at spreads 0 and 25, plus 10/20/…/100 for the twenty-rung dispatch scenarios.
Unlike dynamic test deployments, these are included in
Clarinet's LCOV output. The reporter merges records by source and instrumentation
location, counts all deployment names only once per source location, and checks that all
functions in each actual source are represented.

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
  call the production helpers directly, move no money and leave state unchanged.
  These are unit boundaries, not evidence those contexts arise through public
  `withdraw`, which guards them. Two additional `epoch-helper` units cover
  the missing-reserve read-only fallback on both assets. No storage is injected. The sell share
  cap fixture explicitly mints native test STX, just as the buy fixture mints
  test sBTC; both rejection tests verify wallet and state rollback.

## Tested scenarios

| File | Tests | Behavior |
| --- | ---: | --- |
| `rungs.test.ts` | 18 | Registration, oversized full exits, exact paused refunds, two-member partial exits, rejected admission with locally held funds, maker proceeds, seat retirement, expired escrow recovery, unrelated young pending top-up isolation |
| `controls.test.ts` | 28 | Initialization and authorization guards, invalid spread/name, unseated registration then seating, minimum changes, push pause/resume, miner-input outage and guard refresh, same-member top-up, unfunded deposit rollback, donated assets/proceeds, young escrow requiring an update, nonzero-spread trading, three private-helper boundaries per rung |
| `epochs.test.ts` | 8 | Still-live escrow cancellation during extreme-fill tail roll, dust tail roll and historical payouts, reserve rounding release, reopening epochs, four successive rescales, inactive member entitlement, zero-value member exit, final recovery, timeout push cooldown |
| `dispatch.test.ts` | 19 | Ten buy plus ten sell rungs: single-sided and two-sided weighted batches, two-member ownership, settlement refusal for non-crossing spreads, real taker fills, proceeds-paying batch top-ups, paused batch exits, oversized tenth-leg full exits, tenth-leg deposit/withdraw rollback, closed-epoch exits without top-ups, retired/replaced seats, unrelated and required pending escrow |
| `dispatch-guards.test.ts` | 8 | Every dispatch validation guard (u7101–u7108) on deposit and withdraw, both sides, including a relay contract; no events, wallets unchanged |
| `proceeds-precision.test.ts` | 6 | Real 1,001-sat receipt after rescale/top-up, late membership, share ceiling, all supported carried-share segments |
| `proceeds-conservation.test.ts` | 6 | Carry across receipts, ownership changes, repeated claims/fills, isolated old epochs and exact final balances |
| `epoch-helper.test.ts` | 2 | Absent-old-reserve read-only fallback, both mirrors |
| `withdraw-dust.test.ts` | 7 | Public final exits through held/live/admitted/crossing/expired paths; oracle fees sent elsewhere or retained for the next epoch's final member |
| `rescale-solvency.test.ts` | 2 | Original 9-micro-STX shortfall and sell mirror; both members claim successfully and fully drain input/proceeds |
| `rescale-fuzz.test.ts` | 6 | Seeds 12648430, 1592594996 and 305419896 on each side; randomized public operations, at least four rescales and two tail rolls per seed; per-epoch receipt/payout/custody invariants after each action |

The original rescale test fills/refills through four scales while Alice stays
inactive. Its bounded comparison with an independent per-fill allocation,
zero-valued position removal and final recovery assertions remain intact.
The randomized tests additionally maintain an independent per-epoch cash
ledger, reconcile receipt prints with actual wallet movements, and assert
that claims fit unpaid balances and effective shares never exceed total
shares. Every campaign ends with exact zero balances; payouts plus input
consumed by fills equal receipts for each epoch.

## Twenty-rung dispatch scenarios

The 19 dispatch scenarios check the two amended production templates.
Expected no-match and invalid-batch refusals below are passing checks, not
test failures. Final-member claims include all remaining epoch rounding.

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
dispatch and receive proceeds. After Alice exits, Bob's final-member claims include the exact remainders;
Bob then exits with no token residue. Receipts are compared to exact wallet changes and per-rung
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
claim function. The initial scenarios use proceeds-paying top-ups before
batch exits; the additional exit scenarios below require no such top-up.

### Exits without top-ups, historical seats and pending escrow

These ten scenarios are mirrored on **only the two core-spread v1 templates**:

| Scenario per side | Assertions |
| --- | --- |
| Sold-out and partially filled positions, no top-up | Alice batch-withdraws all ten positions, including five unclaimed closed epochs, while paused. Bob's final-member claims include the epoch remainders. Bob directly claims the closed positions; another claim returns `u7006`. A batch with five valid positions followed by an already-removed one rolls back completely. Exiting the five remaining positions succeeds. |
| Retired and replaced seats after fills | Retire the partially filled 60-bps rung, replace the 70-bps rung with identical code deployed by another account, and verify old claims and funds remain intact. New deposits to historical seats refuse with `u7104`. The old ten-position exit succeeds while paused, and replacement funds remain independently withdrawable. |
| Another member's young pending top-ups | Alice's half-sized ten-rung exit succeeds with `none` while paused, leaving Bob's pending entries and claims intact. Her full exit also preserves his claims; all members then recover their funds. |
| Exit actually needs young escrow | Nine funded withdrawals precede a tenth pending-only position. Without an update, `u7012` rolls back every earlier transfer. The same batch succeeds with `some update`, returning the exact input balance. |
| Timeout recovery | The same ninth/tenth-leg rollback setup, then 145 burn blocks elapse. All ten positions exit with `none` while market and core are paused. The opposite-side member's claims remain unchanged. |

The replacement uses the exact same generated rung bytes as the canonical
deployment. Fixture dependency principals are absolute so a different deployer
still references the same real market and ladder. The real canonical hash gate
and initialization authorization remain in force; no contract body or storage
is patched. All original manifest deployments remain instrumented; the extra
replacement is a dynamic deployment used for lifecycle assertions.

For v1, **sold out does not mean already claimed**: an unclaimed closed-epoch
position pays through either `withdraw` or `claim`; after payout removes it,
another attempt returns `u7006`. Older dispatcher comments describing every
sold-out withdrawal as an error do not describe these two v1 implementations.

## Coverage exceptions

The numeric gate remains **100% functions / 99% lines / 99% branches**.
`coverage-exclusions.mjs` introduces a narrow, explicit exception list; the
older reporter had no exclusion mechanism. `COVERAGE.md` and the JSON retain
**raw metrics alongside the executable/reachable metrics used by the gate**.
There is no general "ignore uncovered" rule:

- Ten static principal/function-name lines per rung are not evaluated Clarity
  expressions. The SDK nevertheless lists them as unhit after `clarinet format`
  splits the literal `contract-call?` syntax over lines. Their enclosing calls
  must be executed. Exact principal, method, syntax and count are checked.
- Two defensive overpay arms, and their two `u0` lines, in
  `count-reserve-claim` are excluded. The per-epoch invariant bounds each
  ordinary payout by remaining input/proceeds; the last claimer takes those
  remainders exactly. See the [share-bound proof](../../../simulations/README-v1-core-spread-rungs.md#why-the-bound-is-preserved).
  The fixed source fragments and function location must match; each normal
  subtraction arm must be hit, and each overpay arm must remain unhit. An
  unexpected hit makes the reporter fail. No contract state or excessive
  claim is manufactured to execute those arms.

The clamps protect these two map subtractions only. They do not make arbitrary
overpayments solvent: preceding transfers and global accounting debits can
still reject a claim. Public-call fuzz and conservation tests continue to
assert payouts <= receipts, effective shares <= total shares, and exact final
zero balances. Both Stxer models also assert payment <= the remaining epoch
balances **before** applying the matching clamps.

Private-helper execution is labeled separately from public reachability,
as in the existing market/router coverage documentation. Coverage percentages
are not a proof over all possible transaction histories; the invariant argument
and seeded public-call campaigns provide separate evidence.

## Regression history and Stxer boundary

The initial sell source `f2eaa44c…` returned `u7012` when Alice requested an
already-funded live withdrawal while Bob had young pending escrow. The test
verified unchanged funds/positions after that refusal and eventual complete
recovery after 24 hours. The buy reference passed immediately. The sell port
`ef91b659…` then passed the same successful-exit expectation; it was not relaxed
or converted into an expected-error test. Both still pass that regression.

The [sell port note](../../../contracts/README-core-spread-v1-port.md) records
that earlier fix. The pre-withdrawal-guard [Stxer record](../../../simulations/README-v1-core-spread-rungs.md)
has 998/998 rung checks, 391/391 dispatch checks and 77/77 small-proceeds checks
on the recorded contract hashes, including exact zero final balances.

## Validation provenance

The release command regenerates `.build/results.json`, `lcov.info`, source
substitutions and `COVERAGE.md`. Contract hashes and complete generated bodies
are checked against the working tree. Current run log: `/tmp/jing-withdraw-overflow-full.log`.
The former 69-test coverage report described a historical committed revision;
it must not be treated as coverage of these accounting changes.
