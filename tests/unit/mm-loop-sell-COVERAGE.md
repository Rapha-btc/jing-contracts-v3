# MM loop sell Clarinet coverage

Generated from the Clarinet SDK LCOV output after running the two mainnet remote-data simnet suites with `coverage: true`.

| Contract | Tests | Functions | Lines | Branches |
| --- | ---: | ---: | ---: | ---: |
| `yguazu-mm-loop-sell-sbtc.clar` | 16/16 | 35/35 (100%) | 319/327 (97.55%) | 74/74 (100%) |
| `yguazu-mm-loop-sell-stx.clar` | 18/18 | 35/35 (100%) | 322/330 (97.58%) | 76/76 (100%) |

The test suites exercise the ten configured rung contracts, a larger sell, claim with and without proceeds, dust booking, partial reconciliation and dust reset, buy-back/reprice/cancel-buy-back, rung withdrawal, edge changes, pause and keeper behavior, two-step ownership, and owner-only withdrawals. They cover every instrumented branch and every function in both vaults. `max-sell-sats`, `max-sell-ustx`, their setters, and `ERR_OVER_SIZE_CAP` are absent from the current contracts; a large sell is covered instead.

## Remaining unhit lines

- sBTC: 458–464 and 466.
- STX: 464–470 and 472.

These are the successful `reprice` print and return expressions. The tests reach the market call after computing the cap/floor, but the mainnet market dependency returns `ERR u1005` for the pending order, so execution exits before these lines. The error path is covered; the remote market state prevents exercising a successful reprice in this setup. There are no unhit branches or functions.

## Source SHA-256

- sBTC: `e422f868bab6d4357cf95c80f4294314ee0a34984518e2b54f40c8c786609fd0`.
- STX: `c193c9123b184464e10db0760fe8a67b2490e4d87eb8cc82b12b7ec34353df47`.

LCOV artifacts are generated at `.cache/mm-loop-sell-sbtc.lcov.info` and `.cache/mm-loop-sell-stx.lcov.info`; they are local run outputs and are not committed.
