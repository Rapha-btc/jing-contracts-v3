# Router v5-3 against market v6-3 — Clarinet tests

Run from the repository root:

```sh
npm run test:router-v5-3
```

This offline suite executes the current **real router, real v6-3 market and real
jing-core-v6**. Production contract files are not edited. It is independent of
the core-spread rung suite, whose buy/sell fixes are being handled separately.

The [generated coverage report](COVERAGE.md) records the passing count, router
coverage and exact production source hashes. Coverage belongs to the router;
it is separate from the [287 market tests](../v6-3/README.md),
[RV campaigns](../../rv/v6-3/README.md), and Stxer integration checks.

The isolated `clarinet check --manifest-path tests/unit/router-v5-3/Clarinet.toml`
also passes: **11 contracts checked**, with unused-binding/analysis warnings
and no errors.

## What runs

`build.mjs` copies production source into the ignored `.build` directory.
It changes only the explicitly listed dependency principals and the sBTC asset
name (`sbtc-token` to the fixture's `token`). Core bytes are unchanged. The
coverage script reconstructs each substitution and checks production, generated
and fixture hashes after the run; a changed source invalidates the report.
The command also requires all test files to pass without skips and enforces
100% function, 99% line and 99% branch coverage thresholds.
Clarity 5 and epoch 3.4 are pinned in the isolated manifest.

External dependencies are controlled fixtures:

- The strict SIP-010 asset has finite, explicitly minted balances; STX transfers
  use native STX via the SIP-010 facade. Every venue payout must be funded.
- The oracle supplies independently configured prices, confidence and ages.
  The actual market performs validation, rebate calculation and execution.
- The ladder supplies membership/seat information; no rung executes here.
- DLMM, XYK and Velar are **external venue fixtures**, not their production
  contracts. Each has its own balances and state. CP swaps use constant-product
  reserve arithmetic, including fees and integer rounding; DLMM uses the
  configured bin price, fee and partial-input cap. Neither prices a swap from
  the router's requested minimum. The minimum only accepts or rejects the
  independently calculated output.

Venue reserves are configurable quotes; explicit ledger funding is separate.
The DLMM fixture puts quoted liquidity in the active bin and returns empty
surrounding bins with a linear price ladder. It exercises the router's bin walk
and stopping rules, but is not a reproduction of the production DLMM engine.
Stxer remains responsible for integration with the real external venues,
production sBTC, signed oracle updates and mainnet execution costs.

## Cases checked in both directions

Manual routes cover the real book's net input, maker-price output, fees, rebates,
sub-minimum refunds, all three fallback destinations, pro-rata fallback minimums,
all four legs together, both CP token orientations, partial DLMM fills, missing
updates, bad splits and invalid venue IDs. Rejected book swaps leave the market
unchanged while the selected fallback can still complete.

Smart routes cover exact gross-cap sizing and cap-plus-one input, the minimum
net-deposit boundary, accepted older oracle updates, rejected stale updates,
paused markets, omitted updates, CP capacities with asymmetric fees, proportional
splits, exhausted and unavailable liquidity, DLMM fees, partial-fill continuation,
outermost bins, and dust/fully-filled early exits. Poisoned downstream quotes
confirm that these early exits actually skip external reads. Getter output is
checked against the real market's configured minimums.

Successful routes check the caller's actual bought/sold balances, total input
conservation (`spent + unsold = amount`), returned output, and zero router custody.
Known-price cases also assert independently calculated exact payouts.

Rollback cases reject a later CP minimum, an unfunded final payout, or the
router's overall wallet minimum after earlier legs have executed. Snapshots
compare every market/core/venue data variable, known-account book maps/history,
core equity and all asset ledgers. Rejected transactions emit no committed
events. An intentionally inflated venue return cannot fool the wallet minimum.
Fixture minimum errors are `u4003`; insufficient-balance errors are actual
native-STX/strict-FT `u1`, and router errors are the production `u3001`–`u3007`.
These expected refusals are passing tests.

## Coverage gaps and interpretation

All router tests call public or read-only entrypoints. No private helper is
called directly to inflate the coverage percentage.

- Line 773 / branch `773,0,1`: `cp-split`'s zero-total division guard. Taking it
  requires `residual <= cap-xyk + cap-velar` and a zero total, hence residual
  zero. The sole caller, `cp-stage`, exits on zero/dust before calling
  `cp-split`. This arm is unreachable through the current public routes.
- Lines 1140–1141: the literal principal and function name inside the read-only
  `get-jing-min-deposits` call. The getter's returned tuple is asserted and its
  function is marked hit, but the SDK reports these operand lines unhit. They
  remain in the denominator.

No production bug was found by these cases. The metrics measure executed
instrumentation, not every possible state or a proof of fund safety. In
particular, the external venue models do not establish mainnet AMM compatibility,
and the suite does not yet combine routing with a caller who already owns
orders on both book sides or exercise production post-conditions.
