# v6-3 Clarinet unit tests

This suite tests `contracts/markets-sbtc-stx-jing-v6-3.clar` from the current
checkout. The baseline was verified against GitHub
[`chore/clarinet-v6-3-only` at `62d032c`](https://github.com/Rapha-btc/jing-contracts-v3/commit/62d032c9acab019d1db076febef018b6f6721022)
on 2026-09-28; that revision was also merged into `master`.

## Verified result

On 2026-09-28, all **205 v6-3 tests passed** against the source including
the `e338e27` treasury guard. The regression refuses the market itself as
treasury, preserves the funded book and configured recipient, and confirms
that subsequent batch fees reach the valid treasury. The suite also includes
the `1a930e3` settlement return-value fix: both sides report zero rolled
funds for a refunded sub-minimum remainder, and the exact live amount when
funds really roll into the next cycle. Four additional regression cases cover
`swap` and `reprice-or-swap-token-*` on both sides when the taker also owns
an opposite-side maker order: its sub-minimum remainder is refunded to the
wallet, the opposite `token-*-rolled` field is zero, and both final positions
and market custody are zero. Existing taker-side walk-remainder assertions
remain unchanged and pass. No unrelated failures occurred in the full run.

| Market-only metric | Covered / total | Coverage |
| --- | ---: | ---: |
| Functions | 137 / 137 | **100%** |
| Lines | 2345 / 2352 | **99.70%** |
| Branches | 830 / 833 | **99.64%** |

Toolchain: Clarinet SDK/WASM 3.21.0, Vitest 2.1.9,
vitest-environment-clarinet 3.0.2, and @stacks/transactions 7.4.0.

Source SHA-256:
`7f7bc5cce3c6f01c92c2e69c8ffe5652d3dc038a7394a816e2740dd4490cdd74`.
Core SHA-256:
`53c9b38a46196f777b3c76f76152c172aa50c220e4e8e449d47cb6cd3fe9ab32`.
The suite loads `contracts/jing-core-v6.clar` directly from the manifest, with
no core source substitutions or generated logger bodies. Market initialization
uses the real owner verification and contract-hash registration flow.

These figures include all instrumentation points, including the remaining
unhit paths described below; they exclude mocked dependencies and older versions.

## Run

From the repository root, with dependencies installed:

```sh
npm test
# Equivalent explicit command: npm run test:v6-3
```

The command builds the isolated fixtures, runs Vitest in Clarinet simnet,
produces market-only coverage and the [error-exit matrix](PATHS.md), and checks
coverage thresholds. It needs no network, signed oracle payloads, or mainnet
state. The default `vitest.config.ts` targets only v6-3. Older-version test files
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
both the market and real core source SHA-256. Source line numbers are preserved.

The real core and remaining local dependencies:

- **Token:** SIP-010 token with explicit owner-authorized funding, checked
  transfer authorization, and real balances. Transfers cannot auto-mint to
  cover deficits. The y side uses simnet's native STX ledger.
- **Oracle:** configurable decoded feeds, including timestamps, confidence,
  exponent, missing fields, invalid prices, and errors. Signature verification
  belongs to integration tests against the real oracle.
- **Core:** the actual `contracts/jing-core-v6.clar`, unchanged. Tests exercise
  owner verification, registration, pause/unpause, real print events, equity
  updates, and rollback after a real core pause rejection. There is no
  `set-fail` or selective logger-error fixture.
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
`sync-seat-count` endpoint. The real core pause guard tests rollback of funding
and admission after parking. Withdrawals and cancellation of live, pending, and parked funds remain
available while the core is paused.

The added real-core cases test both sides of limit and small-share filtering:
`log-settlement` rejects a paused core with `u5016`, and the entire transaction
reverts, including earlier filtering and fee transfers. After the 144-burn-block
unpause delay, settlement succeeds and emits the real roll and settlement
logs. A separate test uses distinct token identities for x and y, verifies
core equity, checks exact settlement payouts and zero final custody, and proves
that paid-out wallet funds leave the core's deposited-equity accounting.

New balance-error tests use genuine insufficient FT/STX balances; they do not
inject arbitrary transfer errors. Oracle fixtures additionally cover missing
y-feed fields and rejection while deposit/limit/readmission requests are pending.
Rejection snapshots include market variables and relevant maps, both asset
ledgers, core variables, and core equity for both asset identities.

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
- `lcov.info`: raw Clarinet reports, including dependencies.
- `path-evidence.jsonl`: checked responses and SDK error traces.
- `path-matrix.json`: per-site witness attribution and test catalog.

Each rebuild removes previous reports, preventing reuse after a source change.
`coverage-thresholds.json` requires 100% functions, 99.70% lines, and 99.64% branches.
No lines or branches are excluded to reach these thresholds.

The remaining coverage must not be described as 100% raw line or branch coverage.
Every function executes. The remaining branch sites are:

- Lines **1401 and 1644**: rejecting a non-queue error returned by the parking
  helper. The old core substitute could force an arbitrary park-logger error.
  The actual core park loggers only check registration, and the market has
  already registered through initialization. Core pause does not reject these
  park logs; the later admission logger enforces pause and rolls back the call.
  These two artificial hits are no longer counted. The branch threshold is
  explicitly rebased from 99.88% to **99.64%** for the real-core suite.
- Line **3929**: the mathematically unreachable `gross-up` decrement branch.

The `gross-up` calculation computes
`g = floor(net * 10000 / 9980)`, so the resulting net
`ceil(g * 9980 / 10000)` cannot exceed the input net. Consequently the `n > net`
condition cannot be true for non-overflowing inputs; overflowing inputs abort
before that condition. Boundary tests verify the returned gross is maximal
without exceeding the requested net. The unreachable branch stays in the
coverage denominator, and production code is unchanged.

Defensive rebate caps, empty distributions, and the already-settled guard are
covered by the explicitly isolated private-helper cases described above.

Clarinet also reports some tuple-label and continuation lines as unhit although
the surrounding expression executes (currently 625, 667, 2428, 2476, 3097,
and 3140). These remain in the denominator rather than being filtered away.

Function execution coverage is not exhaustive behavioral coverage. Real Pyth
signature validation, production sBTC integration, ladder authorization,
and deployment transaction limits still need the separate integration and
simulation suites.

## Error-exit matrix

[PATHS.md](PATHS.md) inventories all **296 explicit error-exit sites** against
the current market, with conservative negative-witness attribution. This is
separate from LCOV branch coverage. Unattributed exits remain visible; they
are not silently treated as covered or unreachable. Related Stxer scenario
links are navigation only, not combined per-arm coverage evidence.

The inventory/trace parser has a separate check:

```sh
node --test tests/unit/v6-3/path-inventory.test.mjs
```

## Cross-check with Stxer

[STXER-CROSSCHECK.md](STXER-CROSSCHECK.md) compares the gaps published in the
Stxer report at `f2386cf` against Clarinet evidence on the same market source:

- All **11 oracle error paths** already have checked rejections through public
  market calls using controlled decoded feeds. Signature verification remains
  an integration concern.
- **Seven of the eight partial branches** execute in isolated tests of the real
  private helpers. These do not claim the boundary states are publicly reachable.
  The remaining gross-up decrement is excluded by the arithmetic proof above
  and remains in the coverage denominator.
- All **eight getters** listed as untested in that Stxer report execute and have
  value assertions in the existing Clarinet lifecycle/seat/readmission tests.

The new `oracle-boundaries.test.ts` adds **12 cases**: independent x/y confidence
one unit below, at, and above 2% of price, and independent feed ages of 79, 80,
and 81 seconds during funded settlement. Rejected calls preserve market storage,
core equity and both asset ledgers; correcting the feed then settles the same
book with exact payouts and zero custody. These tests strengthen boundary and
recovery assertions; they do not increase the already-covered source branches.

The cross-check is regenerated and validated by the full test command. Its
machine-readable counterpart is `.build/stxer-crosscheck.json`. It fails if any
of the 11 rejection witnesses, seven private branch hits, or eight getter hits
is missing, or if the market source no longer matches the pinned Stxer baseline.
The separate Stxer agent owns its stale-seat/readmission and getter scenarios.

## Scenario fuzzing

Run `npm run rv:v6-3` for the separate Rendezvous campaigns against the same
current market. See the [RV scenario README](../../rv/v6-3/README.md) for seeds,
successful operations, discarded trials, recovery checks, and fixture limits.
Fuzz trial counts are separate from the unit coverage percentages above.
