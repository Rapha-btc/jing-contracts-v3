# v6-3 Rendezvous recovery properties

Production source: `contracts/markets-sbtc-stx-jing-v6-3.clar` at
`f231e51` (market bytes unchanged from `19c73b5`). Only test files are changed. This target follows the pipeline in
[the RV README](../README.md), independently of its historical v6 target.

## Full-book readmit and batch extension

```sh
node tests/rv/v6-3/run-full-book.mjs
```

This runner uses the same RV Clarity properties with a **50-live-depositor
book on each side**. It generates 64 deterministic, funded simnet users and
includes them plus the historical account universe in every custody/totals
fold. `MAX_DEPOSITORS` stays 50; the full-book build reserves zero protected
seats, so all 50 ordinary makers are actual deposits. A public-call prelude
creates three parked users and pending deposits, limits, and readmits on each
side. The two resting limits meet at a reachable mock-oracle mid, enabling a
real batch clear. No book rows or contract balances are patched.

Two complementary phases improve the sparse historical coverage:

1. Seeded, state-aware sequences use RV's `fast-check` dependency to randomize
   side/order, owners, amounts, and pause state. Replacement admissions park
   users; cancelling a live user frees a slot; readmit submit and settle place
   a parked owner into that slot. Both sides remain full throughout this phase.
   The initial full book then clears. Further randomized batch/swap/cancel
   episodes retain rolls and parked claims rather than resetting the market.
2. Rendezvous's native `checkProperties` runs random `test-*` calls on that
   resulting state. A proxy asserts **all structural invariants after every
   public call**, including discarded properties. Native RV trial and discard
   counts are reported separately from successful state-aware calls.

The new `test-batch` property checks each token separately: opening live total
= payouts + rolled live total + refunds. Payouts include fees and swept dust;
refunds are the distribution refund counters. Actual custody loss supplies
the outgoing amount, independently of book totals. Solvency, exact live totals,
list bounds/uniqueness, and positive pending entries remain checked after the
batch and every other call. Existing cancel and pending-settlement properties
also remain in use.

Readmit success counts require a **positive placement**, cleared pending,
unchanged total owner claim, and parked amount zero; `(ok u0)` refusals are not
counted as placements. Swap counts require nonzero received output. Cancel
counts require funds before the call. The reported state-aware counts are
lower bounds and do not inflate them with setup-free/discarded RV calls.

The Lazer substitution remains the real market verifier call against the mock
oracle's settable mid and current simnet timestamp. The driver mines another
block before pending settlement; it does not bypass `u1032`. Core logs and
ladder seats remain explicit mocks, so core authorization/pause is covered by
the separate fork suites, not this RV run.

`full-book-results.json` records seeds, source hashes, successful-call counts,
and native RV outcomes. `RV_EPISODES`, `RV_SEEDS`, and `RV_RANDOM_RUNS` allow
smaller development probes. A failure writes a public-call trace to
`full-book-counterexample.json` and stops; probes are not part of final totals.
State-aware sequences are a companion to native RV, not automatically shrunk
RV counterexamples. Native RV failure checks still inspect reported failures
rather than trusting the runner's process status alone.

## Full-book results (2026-09-23)

All three state-aware sweeps passed; native RV completed **3,000 trials**,
with **988 passed, 2012 discarded, and zero failures**. All **8313** structural
invariant checks passed. No contract counterexample was found.

| Guided seed | Native RV seed | Trials | Passed | Discarded | Failed |
| --- | --- | --- | --- | --- | --- |
| 230930 | 231030 | 1000 | 330 | 670 | 0 |
| 230931 | 231031 | 1000 | 304 | 696 | 0 |
| 230932 | 231032 | 1000 | 354 | 646 | 0 |

Meaningful successful state-aware calls, including the public-call preludes
but excluding additional native RV calls:

| Path | x | y |
| --- | ---: | ---: |
| Deposit submit | 522 | 522 |
| Settle deposit | 132 | 522 |
| Readmit submit | 120 | 120 |
| Readmit placement | 120 | 120 |
| Swap with nonzero output | 120 | 120 |
| Funded cancel | 262 | 346 |
| Partial withdraw | 16 | 17 |
| Set limit (recorded lower bound) | 3 | 3 |

Batch `settle-with-refresh`: **123 successful clears**, including
the initial full book for each seed and subsequent randomized replenishments.
All batch calls assert payout/refund/roll conservation and market solvency.
The original seven structural/recovery invariants remain enabled; the separate
fork runs cover real Lazer verification and real core behavior.

The complete record is [full-book-results.json](full-book-results.json). Raw
logs are retained locally at `simulations/results/rv-v6-3/full-book.log`
(ignored by Git). The old 9,000-trial results below are historical and are not
added to these current counts.

## Historical recovery-suite reproduction

From the repository root:

```sh
node tests/rv/v6-3/run.mjs
```

The runner builds an isolated manifest, executes three seeded RV sweeps, and
checks **log contents as well as process exit status**. Results and source hashes
are written to [results.json](results.json); raw logs are under the ignored
`simulations/results/rv-v6-3/` directory. To summarize existing logs without
rerunning: `node tests/rv/v6-3/run.mjs --summarize`.

Individual runs:

```sh
python3 tests/rv/v6-3/build.py
node_modules/.bin/rv tests/rv/v6-3 market invariant --runs=1000 --seed=230927 --bail
node_modules/.bin/rv tests/rv/v6-3 market test --runs=5000 --seed=230926 --bail
node tests/rv/v6-3/run-seeded.mjs test 3000 230929
```

The last command uses Rendezvous's own property runner, with a deterministic
public-call prelude in its reset hook. It creates two live orders, one parked
owner, one pending deposit, and pending limit/readmit requests on **each side**.
No live/parked/pending storage rows or token balances are fabricated. This
avoids waiting for a random run to first discover a parked position. Account
names in this prelude and its RV sender map are sorted for repeatability.
The stock RV CLI takes the SDK account-map iteration order; that order can
vary across fresh processes, so a CLI seed alone may not reproduce the exact
sender assignment or PASS/WARN counts. The run logs are the recorded evidence. The runner uses installed
RV 1.0.0-rc.1 internals; an RV upgrade may require updating those imports.

## Properties and model

Seven read-only invariants check property-failure latching and, for both sides:

- Native STX / real-ledger mock FT custody >= all modeled owners' live + parked
  + pending funds. A separate mint counter ensures the mock never auto-minted
  to cover a market shortfall.
- Current-cycle totals equal summed live deposits, both over all modeled owners
  and over the book. Lists have at most 50 entries and no duplicates.
- Every pending deposit row has positive amount.

`test-*` wrappers check transitions; generated `rv-*` aliases expose the same
operations to RV invariant mode. They cover deposit, settle-deposit, cancel,
withdraw, readmit and its settle, set-limit and its settle, reprice, swap,
settle-with-refresh, pause, and minimum changes:

- Cancel, with pause randomly true/false, must return the exact pre-call sum
  and wallet delta; live/parked/pending deposit and pending limit/readmit clear.
  Empty cancel is checked as u1005 rather than counted as a real refund.
- With valid trait/asset and a stub price, settle-deposit clears pending and
  either preserves the user's total market claim by placing it, or moves the
  escrow amount back to that owner's wallet. Only freshness u1003/u1032 and
  market pause u1007 are allowed to leave an existing pending deposit behind.
  No pending requires u1030. This does not claim invalid traits/assets must
  succeed, nor test real core authorization failures.
- A queue-full refund must leave the side's full live/parked/order snapshot,
  depositor list, and cycle totals unchanged, while refunding exactly pending.
- Successful deposits must have passed **existing + parked + amount >= the
  submit-time minimum**, and a positive limit. Successful swaps must satisfy
  the entry net minimum and positive limit. Previously admitted pending orders
  may settle below a subsequently raised minimum, intentionally.
- `test-state` also samples all structural invariants in property mode. RV
  invariant mode samples invariants between random call sequences, not every
  invariant after every raw transaction. This is sampled testing, not proof.

A printed `rv-success` is emitted only when an underlying market operation
succeeds; cancellation/settlement guards that pass on an empty position are
not counted as actual refunds/placements. `results.json` records those counts
separately from RV PASS/WARN counts. Settlement prints record placed,
queue-full, or crossing outcomes.

## Explicit substitutions and limits

`build.py` reads the deploy copy; **no production file is edited**. The generated
copy in `tests/rv/.build/v6-3/` changes dependency references and initial config:

- Lazer signatures cannot be generated by RV. The existing mock answers fresh
  feeds with confidence zero, timestamp `stacks-block-time`, STX/USD = 1e8,
  and BTC/USD = a settable mid (initially 3.2e13). Random wrappers move that mid
  or move it to an existing order, so crossing/batch paths can execute. It does
  not bypass the market's post-submit timestamp check; another block must pass.
  Real oracle freshness/signatures are covered by the stxer harness, not RV.
- SIP-010 uses the existing real-ledger `mock-ft`. It auto-funds a sender that
  lacks tokens, including a mint counter checked for the market. Native STX
  uses the simnet's funded accounts. No mainnet tokens are involved.
- Core-v6 logs/register are generated stubs; pending-refund logs additionally
  record the reason for assertions. Core pause/auth/equity are out of RV scope;
  the fork suites cover the real core and pause behavior.
- The mock ladder reserves 48 of the original 50 seats; MAX_DEPOSITORS and map/
  list widths remain **50**, leaving two public seats to reach full queues.
  Distance slots start at zero and vary within 0..2. This does not exhaustively
  test a book with 50 actual live makers or protected contract seats.
- Initialization defaults select the mocks/feed IDs, treasury is a nontrading
  mock contract, and minima start at 100 / 10,000. `test-config` changes pause,
  minima, and distance slots directly as a fuzz aid; owner authorization is
  not under test. Raw public owner functions also remain in invariant mode.
- The account universe includes all nine eligible Devnet senders, plus an
  unused historical address. Invariant-mode raw calls may supply random asset
  names and trigger `BadTokenName`; the runner counts these invalid-input
  runtime errors separately. Other runtime errors/property failures fail the run.

## Historical recovery results (before full-book extension)

Historical suite: **9,000 trials, zero property failures**. RV's 5,328 discarded
cases are not counted as successful property checks.

| Mode | Seed | Trials | Passed | Discarded | Failed |
| --- | ---: | ---: | ---: | ---: | ---: |
| invariant | 230927 | 1000 | 1000 | 0 | 0 |
| test | 230926 | 5000 | 1634 | 3366 | 0 |
| seeded | 230929 | 3000 | 1038 | 1962 | 0 |

Meaningful successful wrapper calls across these sweeps: 244 deposits, 199
funded cancellations, 53 pending-deposit settlements (44 placed, eight
queue-full refunds, one crossing refund), 14 swaps, and one batch settlement.
Readmit submit succeeded four times on x and twice on y; readmit settlement
succeeded once on y through a wrapper. Successful **x readmit settlement is
not demonstrated by the final wrapper counts** (an earlier exploratory run
did reach it). These are lower-bound wrapper counts, separate from raw public
calls in invariant mode. Batch/readmit coverage is sparse, not exhaustive.

The 1,000-trial invariant sweep also logged 37 `BadTokenName` runtime errors
from raw random asset-name strings. The two property sweeps logged none.
These rejected invalid-input calls are reported separately, not concealed as
successful mutations or called market solvency counterexamples.


See [results.json](results.json) for the final run counts, successful-path
counts, seeds, source hashes, and log paths. `source-hashes.json` preserves
the earlier caller-audit snapshot; current extension hashes are in
`full-book-results.json`. Preliminary sweeps while building
the harness were also run: 100 and 500 invariant trials (seed 230923), 500
property trials (230924), 3,000 property trials (230925), and a 3,000-trial
prelude experiment (230928, before sorting prelude accounts). None found a
property failure, but those earlier versions are **not** counted in the final
suite. Several early build/import/fixture errors were harness errors and ran
no complete fuzz sweep.

No market invariant counterexample was found in those historical runs. This
does not establish universal recoverability for arbitrary tokens, authorization
states, oracle data, owners, or lists beyond the model above. Readmission and
batch fills were rare in those historical sweeps; the extension above addresses
that gap with separately reported runs.

The separate [caller-impact report](../../../simulations/README-v6-3-caller-impact.md)
contains the rung exit restrictions and real-source fork evidence; those are
caller behavior findings, not RV market invariant failures.
