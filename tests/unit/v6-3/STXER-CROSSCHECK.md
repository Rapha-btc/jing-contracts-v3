# Stxer gaps cross-checked against Clarinet

Baseline: [Stxer report at f2386cf](https://github.com/Rapha-btc/jing-contracts-v3/blob/f2386cf/simulations/README-v6-3-coverage.md). Stxer market SHA-256: `7f7bc5cce3c6f01c92c2e69c8ffe5652d3dc038a7394a816e2740dd4490cdd74`.

Clarinet market SHA-256: `65a8dc9aed179a3cc440306e31aff7da5bcecb99872423ca50b8ba417abbb6c0`. The refund, registered-maker, refund logging, net-based rebate and age-aware capacity fixes change the source. The pinned Stxer runs do **not** validate this patched source; the table only maps their unchanged gap expressions to current Clarinet locations. RV results have separate source-hashed evidence in the [RV report](../../rv/v6-3/README.md).

This report is generated after the full Clarinet suite and coverage thresholds pass. It checks the source locations listed by Stxer; it does not add or average the two tools’ coverage percentages.

## Eleven oracle error paths

**All 11 have Clarinet rejection witnesses through public market calls.** The market and core are real code. Decoded oracle fields are controlled by the existing local oracle fixture, so these cases establish market validation, not signed-Pyth reachability or signature verification.

| Stxer baseline line | Current market line | Validation | Clarinet witness |
| ---: | ---: | --- | --- |
| 1065 | [1065](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1065) | Malformed y-feed shape | [T13](PATHS.md#t13) |
| 1083 | [1112](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1112) | Stale y feed during classification | [T125](PATHS.md#t125) |
| 1084 | [1113](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1113) | Non-positive x classification price | [T128](PATHS.md#t128) |
| 1085 | [1114](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1114) | Non-positive y classification price | [T131](PATHS.md#t131) |
| 3401 | [3468](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3468) | Zero x settlement price | [T118](PATHS.md#t118) |
| 3402 | [3469](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3469) | Zero y settlement price | [T120](PATHS.md#t120) |
| 3404 | [3471](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3471) | Stale y feed during settlement | [T103](PATHS.md#t103) |
| 3405 | [3472](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3472) | x confidence at threshold | [T137](PATHS.md#t137) |
| 3408 | [3475](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3475) | y confidence at threshold | [T119](PATHS.md#t119) |
| 3411 | [3478](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3478) | Mismatched exponents | [T121](PATHS.md#t121) |
| 3413 | [3480](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3480) | Cross-price rounds to zero | [T137](PATHS.md#t137) |

The added boundary suite checks confidence one unit below, exactly at, and one unit above 2% independently on each feed; it also checks feed ages 79, 80 and 81 seconds on each side during funded settlement. Rejected calls preserve market storage, core equity and asset balances. A corrected feed then settles the same book with exact payouts and zero remaining custody.

## Eight historical partial branches

Seven execute in isolated tests of the actual private helpers. Those tests deliberately supply a boundary context and do not show that the context can arise through public transactions. The eighth, the old gross-up decrement, was removed by 34bbe18. Both outcomes of its replacement zero-capacity guard execute; the removed branch is not claimed as covered.

| Stxer node line | Current node line | Missing outcome | Clarinet operand branch | Evidence |
| ---: | ---: | --- | --- | --- |
| 13 | [13](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L13) | Age >= 80 cap | `14,0,0`: hit | rebate age 80 / 1000 gives 70 bps |
| 2936 | [2997](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2997) | x-book failed accumulator | `3022,0,1`: hit | walk-x-book-step propagates a failed fold accumulator |
| 2977 | [3038](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3038) | y-book failed accumulator | `3063,0,1`: hit | walk-y-book-step propagates a failed fold accumulator |
| 3526 | [3593](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3593) | Empty y distribution: payout denominator | `3595,0,1`: hit | handles an empty y distribution |
| 3530 | [3597](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3597) | Empty y distribution: unfilled denominator | `3601,0,1`: hit | handles an empty y distribution |
| 3621 | [3688](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3688) | Empty x distribution: payout denominator | `3690,0,1`: hit | handles an empty x distribution |
| 3625 | [3692](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3692) | Empty x distribution: unfilled denominator | `3696,0,1`: hit | handles an empty x distribution |

The helper tests are in [market.test.ts](market.test.ts), under “pure private arithmetic boundaries”, “walk rounding and error propagation”, and “isolated defensive helper cases”. For positive net capacity, gross-up returns `floor(((net + 1) * (10000 + bps) - 1) / 10000)`; fixed-rate cases use 20 bps. Boundary tests check zero capacity and maximality; [rebate-capacity.test.ts](rebate-capacity.test.ts) also swaps gross-cap and gross-cap + 1 on both sides and verifies the latter exceeds net capacity by one and refunds that dust. The capacity-age suite checks age-dependent quotes and exact-cap fills through public calls.

The walk-error reachability argument in the Stxer report depends on its custody and dependency assumptions. Private-helper coverage is not a formal proof that production transfers can never fail.

## Getters listed as untested in Stxer

All eight already execute in Clarinet: `get-token-x-limit`, `get-token-y-limit`, `get-seated-x`, `get-seated-y`, `is-protected-x`, `is-protected-y`, `get-token-x-pending-readmit`, `get-token-y-pending-readmit`. Their expected values are checked by the maker lifecycle, protected seats, and readmission tests in [market.test.ts](market.test.ts).

## Scope left separate

The Stxer agent owns stale-seat readmission append scenarios (lines 1960 and 2029) and additional fork getter calls. This cross-check makes no new coverage claim for those append errors. The 145 unhit Stxer error paths are not 145 missing Clarinet tests, nor are they all proved unreachable: oracle-fixture limits, private-helper boundaries and conditional escrow arguments remain distinct.

Run `npm run test:v6-3` to regenerate this report. Machine-readable witnesses are in `.build/stxer-crosscheck.json`.
