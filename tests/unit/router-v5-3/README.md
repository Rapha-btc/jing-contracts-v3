# Router v5-3 against market v6-3 — Clarinet tests

Run from the repository root:

```sh
npm run test:router-v5-3
```

This offline suite executes the current **real router, real v6-3 market and real
jing-core-v6**. The harness only substitutes dependency identities. It is
independent of the core-spread rung integration suite.

The [generated coverage report](COVERAGE.md) records the passing count, router
coverage and exact production source hashes. Coverage belongs to the router;
it is separate from the [320 market tests](../v6-3/README.md),
[RV campaigns](../../rv/v6-3/README.md), and Stxer integration checks.

The isolated `clarinet check --manifest-path tests/unit/router-v5-3/Clarinet.toml`
also passes: **14 contracts checked**, with unused-binding/analysis warnings
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
- The oracle supplies independently configured prices, confidence and ages,
  and exposes the same decoded fields to the router's timestamp hint parser.
  Router test updates include a placeholder 71-byte EVM header and payload;
  this fixture does not validate real envelope encoding or signatures.
  The actual market performs price validation, rebate calculation and execution.
- The ladder supplies membership/seat information; no rung executes here.
- DLMM, XYK and Velar are **external venue fixtures**, not their production
  contracts. Each has its own balances and state. The router's three DLMM
  pools map to three separate `venues.clar` deployments (`dlmm-pool-stx-sbtc-v-1-bps-15`
  = `dlmm`, `-v-2-` = `dlmm-2`, `-v-3-` = `dlmm-3`), each with its own bins,
  quote and funded ledger. `dlmm-router.clar` stands in for the DLMM swap
  router and core: it forwards a swap to the pool the router names (no
  as-contract, so the caller stays tx-sender) and prices bins with the
  `venues.clar` formula. Its `get-bin-factors-by-step u15` serves that
  formula as the factor list (mainnet factors are geometric; the stub's are
  linear), and each pool stub has `get-pool-for-swap` with the mainnet
  tuple. CP swaps use constant-product
  reserve arithmetic, including fees and integer rounding; DLMM uses the
  configured bin price, fee and partial-input cap. Neither prices a swap from
  the router's requested minimum. The minimum only accepts or rejects the
  independently calculated output.

Venue reserves are configurable quotes; explicit ledger funding is separate.
By default the DLMM fixture puts quoted liquidity in the active bin and
returns empty surrounding bins with a linear price ladder. After `set-bin`, a
pool holds per-bin balances and its swap walks up to 30 bins with the core's
per-bin formula (the pool-pick cases). It exercises the router's bin walk
and stopping rules, but is not a reproduction of the production DLMM engine.
Stxer remains responsible for integration with the real external venues,
production sBTC, signed oracle updates and mainnet execution costs.
The [aged-rebate Stxer report](../../../simulations/README-router-v5-3-rebate-age.md)
records current-source checks against those dependencies and their fixture limits.

## Cases checked in both directions

`dlmm-pick.test.ts` adds 136 cases for the pool pick of `280c81c`: among the
pools holding at least 1% of the deepest pool's balance of the asset the leg
buys, the one paying the most for the leg's amount over at most 30 bins from
its active bin (bin step u15 only), ties to the lower number; a single
eligible pool is used without reading the core's factor list. The pools run
`venues.clar` in bin-walk mode (`set-bin`): each bin holds its own balances
and a swap walks at most 30 bins with the core's per-bin formula, so each
pool's output, capacity and swap counter show which pool ran. Every case
first checks its expected pick against a TypeScript model of the rule, then
runs per direction both a manual leg and the smart stage. The smart stage
must report the picked pool's capacity, and the sale must run on that same
pool. Cases: payout beats depth (each pool winning once); an empty active bin
with its liquidity 25 bins away, and 1% dust in the best bin with the rest far
away (the steering cases); liquidity past the 30th bin not counted; an amount
larger than a pool's bins (part fill); a partial last bin, where the same
pools rank differently at 100% and 30% of the amount; fees breaking a tie,
beating a better price, and too small to; ties 1 = 2, 2 = 3, 1 = 3 and a
three-way tie with the higher number deeper; the 1% floor (0.99% and 1% minus
one base unit excluded, exactly 1% eligible, zero excluded); pool 1 or 2
excluded with the other two compared; the walk stopping at the edge bin; bin
step 10 on one pool or on all (pool 1). The poisoned factor list
(`set-factors-off`) shows that one eligible pool, a one-sided pool and all
pools empty (pool 1; the leg fills nothing) need no factor read. It also
aborts a pick with two eligible pools. A wallet-minimum rollback after the
picked pool swapped is checked too. Negative control on a copy (never
committed): with the `1063add` pick (best active-bin price) restored, 32/136
fail, and all other suites pass. The 32 are the steering, 30-bin,
part-fill, partial-bin, fee and edge-bin cases in both routes and directions.

`rebate-age.test.ts` adds 24 cases for the September 30 age-sizing fix:
capacity-capped fills with independent BTC/STX feed ages of 0, 30, 31 and 79
seconds, and input budgets just below/at the true aged minimum on both sides.
The market now grosses up its `net-cap` using the older configured feed's age
and returns `rebate-bps` with `gross-cap`. The router passes the update and
uses both returned values. Eight quote/negative cases cover failed timestamp
hints, future timestamps and stale-feed fallback through the public market
getter; the router has no private timestamp parser. The full suite then passed **185/185**; with the
pool-pick cases it now passes **321/321**, with unchanged coverage thresholds. See [the bounty decision and parser-check limits](../../../contracts/README-audit-core-spread-v1-bounty.md#accepted-aged-price-router-sizing).

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

## Callers with existing orders

`existing-orders.test.ts` adds 46 cases across both directions and both router
entrypoint families. Both resting positions are created and admitted through
public market calls. The market correctly refuses a new swap on a side where
the caller already has a resting position (`u1018`). The router catches that
refusal: it either leaves the new input in the wallet or routes it to a funded
AMM while preserving both orders, market custody and core equity.

After the caller cancels the selling-side order, the remaining opposite-side
order can participate in midpoint settlement. Tests cover sub-minimum refunds,
valid remainders rolled forward and later cancelled, proceeds shared with a
second maker, and refusal to walk the caller's own off-mid quote. They also
verify that a later AMM rejection or a wallet minimum one unit too high restores
the original order, its escrow, all earlier transfers and core accounting.

The receipt has two distinctions when the caller is also a maker:

- `jing-in` is the input consumed by the swap leg. Maker proceeds paid back in
  that same asset reduce the net wallet debit; they are not `unsold` funds to
  send through fallback again.
- `out` and the overall minimum measure the bought-asset wallet gain, including
  any refund of the caller's old opposite-side order. `jing-out` records the
  swap payout alone in these cases.

For example, selling 10,000 sats after cancelling the selling-side position,
against the caller's own 1,000,000 microSTX midpoint order, produces
`jing-in = 10,000`, `jing-out = 997,002`, an old-order refund of 2,000 microSTX,
and `out = 999,002`. Maker proceeds return 9,991 sats, so the net input-wallet
debit is 9 sats. All positions and market custody end at zero. The test accepts
`min-out = 999,002` and verifies full rollback at 999,003.

## Coverage gaps and interpretation

All router-suite cases call public or read-only entrypoints. Timestamp-hint
boundaries are checked through the market's read-only capacity getter.

- Line 815 / branch `815,0,1`: `cp-split`'s zero-total division guard. Taking it
  requires `residual <= cap-xyk + cap-velar` and a zero total, hence residual
  zero. The sole caller, `cp-stage`, exits on zero/dust before calling
  `cp-split`. This arm is unreachable through the current public routes.
- Line 1254: the opening line of the `plan` tuple in `cp-stage` (dust legs
  dropped, c2b046a). Both `dust-left` arms of each leg are hit (a zero split
  leg is dust); the SDK reports the tuple's opening line unhit. A non-zero
  dust leg (a few units of room left in a pool) is exercised on the fork:
  stxer smart suite S3 and S11.
- Lines 1420–1421: the literal principal and function name inside the read-only
  `get-jing-min-deposits` call. The getter's returned tuple is asserted and its
  function is marked hit, but the SDK reports these operand lines unhit. They
  remain in the denominator.

No production bug was found by these cases. The metrics measure executed
instrumentation, not every possible state or a proof of fund safety. In
particular, the external venue models do not establish mainnet AMM compatibility,
and the suite does not yet exercise production post-conditions or the full
range of pending/parked-order combinations with router calls.
