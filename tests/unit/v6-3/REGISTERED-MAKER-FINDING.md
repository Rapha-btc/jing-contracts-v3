# Registered maker book-walk accounting: fix and regression tests

This report records the maker fix and its earlier 233-test run. The later
[refund-safety changes](REFUND-SAFETY.md) update both source hashes; their
273-test run also passes all 16 shared-core cases. Both changes are included in the current source.

Status: **fixed and verified**, verified on 2026-09-29. Before the fix,
the ten-case focused suite had eight passes and two genuine accounting failures.
After the fix, all **16 shared-core cases** and the full **233-test v6-3 suite**
pass. Both original failure expectations are retained.

The fix adds `maker-received` to the real core's `log-match` arguments. The
market supplies its exact payout expression, including fees and rebates. The
core debits the maker's traded input for both EOAs and registered contracts,
and credits the received asset only for registered makers. Registered takers
retain caller-side `log-jing-swap` accounting. Transfers, match event fields,
settlement calculations and market return values are unchanged.

The payout expression repeats the exact calculation already used by the
successful token transfer earlier in `execute-fill`. The fee is
`floor(traded * 10 / 10000)`, so it cannot exceed the traded amount; subtraction
cannot underflow. Any overflow in the payout addition would already have
aborted the earlier transfer calculation. The existing core debit helper also
caps its subtraction at recorded equity.

The registered-taker caller fixture logs requested input minus returned rebate
and refunded remainder. Its first version incorrectly logged gross requested
input, causing two fixture-only mismatches (1 x unit / 4 micro-STX). Correcting
that fixture retained the independent balance-versus-equity checks. This fixture
models a correct registered caller; it does not validate a production vault's
signature handling or its choice of logging amounts.

All three active v6-3 market copies use the new argument. Their `execute-fill`
functions match after whitespace normalization. **The updated market and core
must be used together** because the public `log-match` signature changed.

New coverage includes maker dust refunds on both sides, registered takers that
log their own swap exactly once, and paused rejection/rollback followed by exit.
All successful scenarios clean up to zero custody and zero total core equity,
including the second market's independent claims.

Maker-fix market SHA-256: `3c44b9bfbc90c6b74f49a58b37e88749c5fe2020a8d2a7b96c27f2e3c3697c6e`.
Maker-fix core SHA-256: `84f373641805461fd310f8196a2f956a9b6022435d1fbb427dc434c97185fdf1`.

The RV compatibility check also passes: two real-core dust regressions and
100 native invariant trials, with 924 accounting checks. The saved
12,000-trial/600-episode campaign predates this fix and has not been rerun.
Stxer evidence likewise does not establish this new source pair.

## Reproduce

```sh
npx vitest run --config vitest.v6-3.config.ts tests/unit/v6-3/shared-core.test.ts
```

The suite deploys a second copy of the generated production market and loads
the actual `jing-core-v6` directly from `contracts/`. Both markets register through normal owner
verification. `registered-depositor.clar` is a minimal caller fixture: it
registers, receives real FT/STX funding, records that funding through the core's
public `log-deposit`, and places orders as its own contract principal. It does
not replace market/core code, fabricate errors, or inject storage.

Asset identities are distinct: x is the strict `.token` FT, y is native STX
with `.wrong-token` as its trait identity. Oracle and token dependencies remain
fixtures. The two market deployments have identical source bytes.

## Passing cases

Both x and y pass all four of these cases:

- An EOA cancels one market while both markets and the core are paused; its
  equity for the second market is preserved, then all claims are recovered.
- An EOA's order settles in one market without consuming its second-market
  equity.
- A registered contract funds once, deposits in two markets, cancels during
  pauses, then withdraws its idle funds with zero final equity/custody.
- A registered contract's batch settlement debits the input and credits the
  actual output, preserving its other-market claim. All funds then exit.

Checks after each operation compare actual balances and market claims with
individual/global core equity, book totals and asset conservation. For an EOA,
equity equals live + parked claims across both markets. For the registered
custodian, equity includes its idle balance and all escrow, including pending
funds, because it was credited when funded.

## Original failing cases (before this fix)

A registered maker rests an off-midpoint order. An EOA submits a successful
swap that walks that order. The maker is passive and does not invoke any
additional caller-side swap logger.

| Maker side | Observed after the successful swap | Correct value from balances and claims |
| --- | --- | --- |
| x | Core x equity stays at 40,000 | 33,347: 10,000 idle + 20,000 in the second market + 3,347 remaining in the first |
| y | Core x equity stays at 0 | 9,990 x units actually received by the registered maker |

For x, the match trades 6,653 x against 997,950 micro-STX at a quote of
1,500,000,000,000. For y, the match trades 9,980 x against 499,000 micro-STX at
500,000,000,000. Before the fix, both swaps returned `ok`; the tests failed on the subsequent
balance-versus-equity assertion. These were unexpected accounting failures,
not expected rejection tests.

Before the fix, the first failed assertion stopped each case. With the fix,
both cases complete their accounting assertions and recover all claims. The
original reproducer established stale equity, not lost or permanently stuck funds.

## Source trace

The market's `execute-fill` transfers assets, updates positions, and calls
`log-match` at `contracts/markets-sbtc-stx-jing-v6-3.clar:2906`.
In the pre-fix `contracts/jing-core-v6.clar:1081` and `:1085`, `log-match` called
`debit-if-not-registered` for the maker, so it skipped debiting a registered maker.
It also contained no credit of the maker's received asset. By contrast, batch
settlement's `log-distribute-*-depositor` debits cleared input and credits output
for registered depositors, and both batch tests pass.

The fix now accounts for these actual net received amounts without changing
caller-side taker accounting. Expectations were not weakened or marked as
expected failures.

- Pre-fix market SHA-256: `43ed3bf012ee04b332244c79aca6af8371f9812b4d266589c4ec360d0d294971`.
- Pre-fix core SHA-256: `53c9b38a46196f777b3c76f76152c172aa50c220e4e8e449d47cb6cd3fe9ab32`.
- Pre-fix local raw output: `/tmp/v6-3-shared-core.log`.
- Current full-suite output: `/tmp/v6-3-maker-fix-full.log`.
- Current RV smoke output: `/tmp/v6-3-maker-fix-rv-smoke.log`.
