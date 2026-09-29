# Stxer gaps cross-checked against Clarinet

Baseline: [Stxer report at f2386cf](https://github.com/Rapha-btc/jing-contracts-v3/blob/f2386cf/simulations/README-v6-3-coverage.md). Market SHA-256: `7f7bc5cce3c6f01c92c2e69c8ffe5652d3dc038a7394a816e2740dd4490cdd74`.

This report is generated after the full Clarinet suite and coverage thresholds pass. It checks the source locations listed by Stxer; it does not add or average the two tools’ coverage percentages.

## Eleven oracle error paths

**All 11 have Clarinet rejection witnesses through public market calls.** The market and core are real code. Decoded oracle fields are controlled by the existing local oracle fixture, so these cases establish market validation, not signed-Pyth reachability or signature verification.

| Market line | Validation | Clarinet witness |
| ---: | --- | --- |
| [1065](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1065) | Malformed y-feed shape | [T25](PATHS.md#t25) |
| [1083](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1083) | Stale y feed during classification | [T90](PATHS.md#t90) |
| [1084](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1084) | Non-positive x classification price | [T93](PATHS.md#t93) |
| [1085](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L1085) | Non-positive y classification price | [T96](PATHS.md#t96) |
| [3401](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3401) | Zero x settlement price | [T83](PATHS.md#t83) |
| [3402](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3402) | Zero y settlement price | [T85](PATHS.md#t85) |
| [3404](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3404) | Stale y feed during settlement | [T68](PATHS.md#t68) |
| [3405](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3405) | x confidence at threshold | [T102](PATHS.md#t102) |
| [3408](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3408) | y confidence at threshold | [T84](PATHS.md#t84) |
| [3411](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3411) | Mismatched exponents | [T86](PATHS.md#t86) |
| [3413](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3413) | Cross-price rounds to zero | [T102](PATHS.md#t102) |

The added boundary suite checks confidence one unit below, exactly at, and one unit above 2% independently on each feed; it also checks feed ages 79, 80 and 81 seconds on each side during funded settlement. Rejected calls preserve market storage, core equity and asset balances. A corrected feed then settles the same book with exact payouts and zero remaining custody.

## Eight partial branches

Seven execute in isolated tests of the actual private helpers. Those tests deliberately supply a boundary context and do not show that the context can arise through public transactions. The remaining gross-up arm stays unhit and stays in the denominator.

| Stxer node line | Missing outcome | Clarinet operand branch | Evidence |
| ---: | --- | --- | --- |
| [13](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L13) | Age >= 80 cap | `14,0,0`: hit | rebate age 80 / 1000 gives 70 bps |
| [2936](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2936) | x-book failed accumulator | `2961,0,1`: hit | walk-x-book-step propagates a failed fold accumulator |
| [2977](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L2977) | y-book failed accumulator | `3002,0,1`: hit | walk-y-book-step propagates a failed fold accumulator |
| [3526](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3526) | Empty y distribution: payout denominator | `3528,0,1`: hit | handles an empty y distribution |
| [3530](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3530) | Empty y distribution: unfilled denominator | `3534,0,1`: hit | handles an empty y distribution |
| [3621](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3621) | Empty x distribution: payout denominator | `3623,0,1`: hit | handles an empty x distribution |
| [3625](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3625) | Empty x distribution: unfilled denominator | `3629,0,1`: hit | handles an empty x distribution |
| [3928](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L3928) | Gross-up decrement | `3929,0,0`: unhit | Arithmetic proof; no test claims this arm executes |

The helper tests are in [market.test.ts](market.test.ts), under “pure private arithmetic boundaries”, “walk rounding and error propagation”, and “isolated defensive helper cases”. For gross-up, `g = floor(net * 10000 / 9980)` implies `g - floor(g * 20 / 10000) <= net`; therefore the decrement condition cannot hold for non-overflowing inputs. This proof is separate from sampled boundary tests.

The walk-error reachability argument in the Stxer report depends on its custody and dependency assumptions. Private-helper coverage is not a formal proof that production transfers can never fail.

## Getters listed as untested in Stxer

All eight already execute in Clarinet: `get-token-x-limit`, `get-token-y-limit`, `get-seated-x`, `get-seated-y`, `is-protected-x`, `is-protected-y`, `get-token-x-pending-readmit`, `get-token-y-pending-readmit`. Their expected values are checked by the maker lifecycle, protected seats, and readmission tests in [market.test.ts](market.test.ts).

## Scope left separate

The Stxer agent owns stale-seat readmission append scenarios (lines 1960 and 2029) and additional fork getter calls. This cross-check makes no new coverage claim for those append errors. The 145 unhit Stxer error paths are not 145 missing Clarinet tests, nor are they all proved unreachable: oracle-fixture limits, private-helper boundaries and conditional escrow arguments remain distinct.

Run `npm run test:v6-3` to regenerate this report. Machine-readable witnesses are in `.build/stxer-crosscheck.json`.
