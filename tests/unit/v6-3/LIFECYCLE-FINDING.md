# Taker dust refunds: equity-accounting fix

The market fix adds the
existing core `log-refund-y` / `log-refund-x` calls to the respective
`cross-remainder-as-*` dust-refund branches. The core itself is unchanged.
The same change is applied to the `-formatted` and `-followAll` market copies;
both refund helpers match across all three copies after ignoring whitespace.

- Before-fix market SHA-256: `7f7bc5cce3c6f01c92c2e69c8ffe5652d3dc038a7394a816e2740dd4490cdd74`.
- Patched market SHA-256: `43ed3bf012ee04b332244c79aca6af8371f9812b4d266589c4ec360d0d294971`.
- Unchanged core SHA-256: `53c9b38a46196f777b3c76f76152c172aa50c220e4e8e449d47cb6cd3fe9ab32`.

## Reproduction and fix verification

```sh
npx vitest run --config vitest.v6-3.config.ts tests/unit/v6-3/lifecycle.test.ts
```

The tests run the actual market and core with public calls, normal hash
verification/registration, distinct asset identities, a strict FT ledger for
x, native STX for y, and ordinary wallet depositors. No artificial logger
errors, private market calls, or market storage injection are used. The oracle
fixture supplies fresh, positive decoded prices; signature verification is
outside these unit cases.

Before the fix, **all four refund regressions failed on stale core equity**.
After the fix, all four pass, as do both long lifecycle scenarios. The full
Clarinet suite passes **211/211 tests**: 137/137 functions, 2349/2356 lines,
and 830/833 branches.

| Regression | Refunded dust | Core equity before fix | Core equity after fix |
| --- | ---: | ---: | ---: |
| x taker swap | 20 x units | 20 | 0 |
| x taker reprice | 20 x units | 20 | 0 |
| y taker swap | 50 micro-STX | 50 | 0 |
| y taker reprice | 50 micro-STX | 50 | 0 |

Each regression checks the real refund transfer and wallet delta, zero remaining
taker claims, exactly one core refund event for that depositor/asset with the
correct amount and current cycle, and zero core equity. It then cancels any
remaining maker position and verifies that all custody and equity are zero.
The taker's existing returned `token-*-rolled` walk-remainder value is explicitly
preserved; no swap/reprice result-field semantics changed.

## Original y-swap observation

1. An x maker deposits 10,000 units with limit `1500000000000`; oracle mid is
   `1000000000000`.
2. A y taker swaps 1,000,000 micro-STX at the same limit.
3. The walk trades 6,653 x units for 997,950 micro-STX.
4. The market returns 50 micro-STX of taker dust plus 5 micro-STX of unused
   prepaid rebate. Its STX balance and the taker's live/parked/pending claims
   are zero, but before the fix the real core still recorded equity of 50.

The core had credited the 998,000-unit net deposit and debited 997,950 via
`log-match`. The market returned the last 50 without calling `log-refund-y`.
The new call debits that last 50 and emits the normal refund event. The x branch
had the same omission, now covered by both swap and reprice regressions.

The defect was **stale equity accounting, not lost or trapped funds**. The
refund transfer already succeeded. Downstream equity consumers have not been
separately assessed.

## Longer lifecycle scenarios

Both x/y scenarios execute deposit, escrow, parking, refused readmission,
successful readmission, book walk, next-cycle settlement, pausing both contracts,
a rejected deposit, and cancellation of outstanding escrow. After every operation
they check wallet/treasury/market conservation, custody against live + parked +
pending claims, book totals, and real core equity against live + parked claims.
Both finish with zero custody and zero core equity.

The saved Stxer/RV reports concern the earlier market hash. They do not establish
that this patched source passes those campaigns. See the main unit README for
the complete Clarinet run on the patched source.
