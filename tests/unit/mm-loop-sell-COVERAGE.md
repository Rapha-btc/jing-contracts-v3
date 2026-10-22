# MM loop sell Clarinet coverage

Generated from the Clarinet SDK LCOV output after running the two mainnet remote-data simnet suites with `coverage: true`.

| Contract | Tests | Functions | Lines | Branches |
| --- | ---: | ---: | ---: | ---: |
| `yguazu-mm-loop-sell-sbtc.clar` | 16/16 | 35/35 (100%) | 320/328 (97.56%) | 75/75 (100%) |
| `yguazu-mm-loop-sell-stx.clar` | 18/18 | 35/35 (100%) | 323/331 (97.58%) | 75/77 (97.40%) |

The test suites exercise the ten configured rung contracts, a larger sell, claim with and without proceeds, the donated-proceeds case with owner recovery, dust booking, partial reconciliation and dust reset, buy-back/reprice/cancel-buy-back, rung withdrawal, edge changes, pause and keeper behavior, two-step ownership, and owner-only withdrawals. Every function is covered. `max-sell-sats`, `max-sell-ustx`, their setters, and `ERR_OVER_SIZE_CAP` are absent from the current contracts; a large sell is covered instead.

## Remaining unhit lines

- sBTC: 459–465 and 467.
- STX: 465–471 and 473.

These are the successful `reprice` print and return expressions. The tests reach the market call after computing the cap/floor, but the mainnet market dependency returns `ERR u1005` for the pending order, so execution exits before these lines.

The two unhit STX branch arms are the `ERR_ZERO_FLOOR` failures at buy-back line 433 and reprice line 461. Both functions check for nonzero inventory first, and the raw-inventory floor is positive whenever paired inventory is positive. The updated guard preserves paired inventory; therefore these error arms are unreachable through the public API. The tests cover a zero floor with empty inventory and verify that the API rejects it earlier as `ERR_NO_INVENTORY`.

## Source SHA-256

- sBTC: `6186950f9e2793a482a134b503b119fc413b9b3ba1e1894d4cbe22a5fbdea67b`.
- STX: `a75c1bc11a446dffa98d25df5ccae32b5e3e00b3fd26f31a396e0cf85d0ebd09`.

LCOV artifacts are generated at `.cache/mm-loop-sell-sbtc.lcov.info` and `.cache/mm-loop-sell-stx.lcov.info`; they are local run outputs and are not committed.
