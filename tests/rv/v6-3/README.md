# Current v6-3 Rendezvous fuzzing and recovery scenarios

Verified on 2026-09-28 against `contracts/markets-sbtc-stx-jing-v6-3.clar`.
Production source SHA-256: `43ed3bf012ee04b332244c79aca6af8371f9812b4d266589c4ec360d0d294971`.
These runs include the treasury guard (`e338e27`) and exact rolled-result
fix (`1a930e3`), plus the taker dust-refund accounting fix (`da19a4f`).
The harness preserves production market logic. Earlier reports for
`04b0a7df...`, `65e1ffc1...`, `ac838c29...`, and `7f7bc5cc...` do not establish
that this source revision passes and are superseded by these completed runs.

## Run

From the repository root:

```sh
npm run rv:v6-3            # all random and full-book scenario campaigns
npm run rv:v6-3:random     # 9,000 invariant/property trials
npm run rv:v6-3:scenarios  # three full-book seeds plus 3,000 native trials
```

Use Node with the installed dependencies and Python 3. Both profiles write
the same generated RV target, so run them sequentially, as the combined
command does. No network or deployment keys are required.

## Verified results

**12,000 native RV trials completed: 4,644 passed, 7,356 discarded,
and zero property/invariant failures.** In addition, the three full-book seeds
completed **600 state-aware episodes** and **8,473 explicit structural
invariant checks**. No market counterexample was found.

| Campaign | Seed | Trials | Passed | Discarded | Failed |
| --- | ---: | ---: | ---: | ---: | ---: |
| invariant | 230927 | 1000 | 1000 | 0 | 0 |
| test | 230926 | 5000 | 1619 | 3381 | 0 |
| seeded | 230929 | 3000 | 1038 | 1962 | 0 |
| Native RV after full-book seed 230930 | 231030 | 1000 | 330 | 670 | 0 |
| Native RV after full-book seed 230931 | 231031 | 1000 | 304 | 696 | 0 |
| Native RV after full-book seed 230932 | 231032 | 1000 | 353 | 647 | 0 |

Successful state-aware calls across the three seeds (including setup and final
recovery, excluding additional native RV calls):

| Path | x | y |
| --- | ---: | ---: |
| Deposit | 522 | 522 |
| Settle deposit | 132 | 522 |
| Readmit submission | 120 | 120 |
| Positive readmit placement | 120 | 120 |
| Swap with nonzero output | 120 | 120 |
| Funded cancel, including recovery | 316 | 372 |
| Partial withdrawal | 16 | 17 |

**123 successful batch clears**, each checking payout/roll/refund conservation.

Every final recovery sweep returned each owner's exact remaining claim and
ended with **zero x and zero STX in market custody**:

| Guided seed | x owners recovered | y owners recovered | Final market balances |
| --- | ---: | ---: | --- |
| 230930 | 20 | 12 | x = 0; STX = 0 |
| 230931 | 6 | 8 | x = 0; STX = 0 |
| 230932 | 27 | 7 | x = 0; STX = 0 |

The raw invariant campaign rejected **37 invalid asset-name calls** with
`BadTokenName`; these are recorded separately from property failures.

## Source and fixtures

`build.py` reads the current production contract on every run. Its complete
production prefix is preserved except for dependency principal substitutions.
The real `initialize`, `set-treasury`, `sync-seat-count`, and
`set-distance-slots` functions configure the test instance; production state
declarations, guards, and queue constants are not rewritten. The generated
market appends inspection/property helpers and an explicit setup prelude.
`tests/rv/.build/v6-3/source.json` records the source hash, substitutions, and
profile. Both reporters verify the production prefix and capture source, harness,
manifest, and fixture hashes before testing. They reject changed inputs
between campaigns/seeds and before writing results. The random reporter
also checks log hashes when summarizing an existing run. A source edit
during testing therefore requires a fresh run, rather than relabeling old
results with the new source hash.

`strict-ft.clar` has a real ledger and checked transfer authorization. The
prelude explicitly funds the known account universe. Transfers never mint;
the market cannot conceal an insolvency with automatic funding. The y side
uses native simnet STX. Core logging, ladder membership, and the decoded Lazer
feed remain explicit fixtures. Oracle signature verification and production
core registration/authorization are not fuzzed here. In particular, this
rerun checks the patched market's custody and recovery behavior; it does not
validate the refund log's effect on real core equity. The [217-test Clarinet
suite](../../unit/v6-3/README.md) runs the actual core and verifies that effect,
including swap/reprice refunds, threshold boundaries, rollback and wallet reuse.

The RV `test-config` and cancellation wrappers deliberately control pause,
minimums, and distance slots directly so random callers can explore those
states. This is test instrumentation, not an alternative production entry
point. Positions, parked balances, pending requests, and transfers are created
through the actual market functions; no book or balance rows are injected.
Authorization is covered separately in the v6-3 unit suite.

## Campaigns and scenarios

The random campaigns include seven invariants: the latched property results,
solvency on both assets, exact live totals/list consistency and uniqueness on
both sides, and positive pending deposits on both sides. Deposit, cancellation,
pending settlement, repricing, swap, quote, withdrawal, readmission, and batch
properties run against the same generated market. The seeded prelude creates
live, parked, and pending deposit/limit/readmit states on both sides.

The ordinary random profile reserves 48 of the 50 available seats through
fixture configuration and public synchronization, leaving two public slots
to exercise parking frequently. The full-book profile reserves zero seats,
allowing **50 real live depositors per side**, plus parked claims and pending
requests. `MAX_DEPOSITORS` remains 50 in both profiles. The default 40-public-
slot configuration is also covered by the separate unit suite.

Each of three full-book seeds performs:

- 40 successful x and 40 successful y replacement/readmission episodes,
  retaining 50 live makers per side. Readmission must return a positive
  placement, clear its pending request, and preserve the owner's total claim.
- An initial full-book batch clear, followed by 40 additional batch episodes,
  40 x swaps, and 40 y swaps in randomized order. Counted swaps must produce
  nonzero output. Batch assertions reconcile custody outflows with payouts,
  fees, dust, rolled funds, and refunds for each asset independently.
- Partial withdrawals and funded cancellations, with randomized paused exits.
- 1,000 native RV property trials from the resulting funded state. All seven
  invariants are checked after every public call, including discarded trials.
- A final recovery sweep: every remaining funded owner cancels through the
  public cancellation path while the market is paused. Each cancellation
  checks the exact wallet credit and clears live + parked + pending claims.
  Both market custody balances must finish at zero.

Native property discards are shown separately from passes: they are rejected
or inapplicable generated operations, not successful economic activity.
Successful scenario counters are separate from native trial counts. Base RV
invariant mode also generates invalid raw asset names; their `BadTokenName`
rejections are counted explicitly, not described as successful transfers.

## Reproduction and limits

The full-book seeds are 230930, 230931, and 230932; native RV uses seed + 100.
`RV_EPISODES`, `RV_SEEDS`, and `RV_RANDOM_RUNS` can shorten local probes.
Probe results are not interchangeable with a completed default campaign.
The runner checks report contents as well as exit status because the RV CLI
can exit successfully despite reported failures. Full-book failures save a
public-call trace in `full-book-counterexample.json`; state-aware scenario
traces are not automatically shrunk by native RV.

The random amount/price helpers deliberately bound inputs: x amounts below
20,000, y amounts scaled by 1,000, quotes in the configured 24–40 trillion
range plus zero-limit cases, and varying minimums, distance slots, and pause.
The full-book driver uses larger replenishment amounts and moving prices to
force fills. This is finite fuzz evidence, not a proof over all uint values
or all possible users, tokens, dependencies, and transaction limits.

Passing recovery sweeps establish no stranded funds in these tested states.
They do **not** prove funds can never be stuck: production cancellation still
depends on successful token transfers and core logging/registration. Stale
price handling is covered by the unit suite (79 seconds accepted, 80 seconds
rejected for either feed); the RV oracle intentionally supplies fresh times.

Raw random-campaign logs are in `simulations/results/rv-v6-3/` (ignored).
Tracked [results.json](results.json) and
[full-book-results.json](full-book-results.json) record the completed runs,
counts, seeds, and source/fixture hashes. The older `source-hashes.json` is a
historical caller-audit snapshot, not the evidence for these current runs.
Fuzz counts are separate from the [unit coverage report](../../unit/v6-3/README.md).
Everything runs locally; no on-chain deployment is performed.
