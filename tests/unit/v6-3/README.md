# v6-3 Clarinet unit tests

This suite tests `contracts/markets-sbtc-stx-jing-v6-3.clar` from the current
checkout. The baseline was verified against GitHub
[`chore/clarinet-v6-3-only` at `62d032c`](https://github.com/Rapha-btc/jing-contracts-v3/commit/62d032c9acab019d1db076febef018b6f6721022)
on 2026-09-28; that revision was also merged into `master`.

## Verified result

On 2026-09-28, all **160 v6-3 tests passed** against the source at `62d032c`.

| Market-only metric | Covered / total | Coverage |
| --- | ---: | ---: |
| Functions | 137 / 137 | **100%** |
| Lines | 2344 / 2351 | **99.70%** |
| Branches | 830 / 831 | **99.88%** |

Toolchain: Clarinet SDK/WASM 3.21.0, Vitest 2.1.9,
vitest-environment-clarinet 3.0.2, and @stacks/transactions 7.4.0.

Source SHA-256:
`65e1ffc15da69402f272437b1140d749061dfb74860eb9e56cec66c7514e8851`.
These figures include all instrumentation points, including the remaining
unhit paths described below; they exclude mocked dependencies and older versions.

## Run

From the repository root, with dependencies installed:

```sh
npm test
# Equivalent explicit command: npm run test:v6-3
```

The command builds the isolated fixtures, runs Vitest in Clarinet simnet,
produces market-only coverage, and checks coverage thresholds. It needs no
network, signed oracle payloads, or mainnet state. The default `vitest.config.ts` targets only v6-3. Older-version test files
are excluded from both this command and these coverage totals.

For a focused test without applying full-suite coverage thresholds:

```sh
npx vitest run --config vitest.v6-3.config.ts -t 'protected seats'
```

Run the full command again before reporting coverage: a filtered run measures
only the selected tests.

## What code runs

`build.mjs` reads the actual production market on every run. It substitutes
only the external SIP-010 trait, Lazer oracle, and Lazer decoder principals
with local fixture principals. The market's functions, constants, initial
state, queue sizes, authorization, and price checks are otherwise unchanged.
No private wrappers are appended and no market maps or variables are injected.
A test compares the entire generated market with the source after those
three declared substitutions. The reporter repeats that comparison and checks
the source SHA-256. Source line numbers are preserved.

The fixtures isolate dependency behavior:

- **Token:** SIP-010 token with explicit owner-authorized funding, checked
  transfer authorization, and real balances. Transfers cannot auto-mint to
  cover deficits. The y side uses simnet's native STX ledger.
- **Oracle:** configurable decoded feeds, including timestamps, confidence,
  exponent, missing fields, invalid prices, and errors. Signature verification
  belongs to integration tests against the real oracle.
- **Core:** generated from the current `jing-core-v6` public logging and
  registration signatures, with a stable owner and configurable error response.
  It verifies market rollback on dependency failure; it does not test the
  production core's registry or equity accounting.
- **Ladder:** controlled membership and seat reservation fixture. The market's
  seat synchronization and admission logic execute normally; production ladder
  code-hash authorization is outside this suite.

Scenarios create market positions through public calls. Small pure arithmetic
unit cases call the real private rebate/gross-up functions, and two private
walk-fold tests verify error-accumulator propagation. Five isolated defensive
helper cases invoke the actual private functions to check exhausted rebate
budgets against genuinely funded positions, distribution on an empty initialized
market, and refusal to re-settle an actually settled historical cycle. These
explicit boundary tests do not claim their helper invocation contexts are
reachable through the normal public call chain. No test patches or injects
market state.

## Scenarios

Both sides are covered for direct deposits and top-ups; escrow submission and
permissionless settlement; crossing and queue refunds; raised minimums;
partial withdrawals; cancellation while paused; direct, pending, replaced,
stale, crossing, and obsolete quotes; repricing as maker or taker; parked
carry and readmission; disabled pegs; price and size priority; ties; protected
seats; small-share filtering; midpoint settlement; book walks; and capacity.

Accounting assertions check wallet deltas, exact fees and age-dependent
rebates, input dust refunds, pro-rata rounding, treasury dust, and custody
against live + parked + pending balances. Refused transactions are checked
for errors and empty committed events, with state snapshots in rollback tests.

Queue tests include the default **40 public slots** and the **50-entry
protected-seat list** without changing market constants. Smaller queue
scenarios reserve seats through the ladder fixture and the market's public
`sync-seat-count` endpoint. Core logging failures test rollback after funding,
withdrawal, cancellation, and parking.

## Coverage and remaining work

Coverage is collected by Clarinet, not JavaScript coverage. The reporter merges
all LCOV records for this market by function, line, and branch identity, excludes
all dependency fixtures, verifies that all 137 market functions are represented,
and emits one record mapped to the production source. It never uses the
repository's old root `lcov.info`.

Generated, ignored artifacts live in `.build/`:

- `source.json`: source SHA-256 and the exact dependency substitutions.
- `coverage.json`: merged metrics and every uncovered function, line, and branch.
- `market.lcov.info`: market-only LCOV mapped to the production file.
- `lcov.info`: raw Clarinet reports, including fixtures.

Each rebuild removes previous reports, preventing reuse after a source change.
`coverage-thresholds.json` requires 100% functions, 99.70% lines, and 99.88% branches.
No lines or branches are excluded to reach these thresholds.

The remaining coverage must not be described as 100% raw line or branch coverage.
Every function and every branch except the mathematically unreachable
`gross-up` decrement branch at line 3927 executes. It computes
`g = floor(net * 10000 / 9980)`, so the resulting net
`ceil(g * 9980 / 10000)` cannot exceed the input net. Consequently the `n > net`
condition cannot be true for non-overflowing inputs; overflowing inputs abort
before that condition. Boundary tests verify the returned gross is maximal
without exceeding the requested net. The unreachable branch stays in the
coverage denominator, and production code is unchanged.

Defensive rebate caps, empty distributions, and the already-settled guard are
covered by the explicitly isolated private-helper cases described above.

Clarinet also reports some tuple-label and continuation lines as unhit although
the surrounding expression executes (currently 624, 666, 2427, 2475, 3096,
and 3139). These remain in the denominator rather than being filtered away.

Function execution coverage is not exhaustive behavioral coverage. Real Pyth
signature validation, production sBTC integration, core/ladder authorization,
and deployment transaction limits still need the separate integration and
simulation suites.
