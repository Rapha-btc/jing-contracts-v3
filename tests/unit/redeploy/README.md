# Current redeploy regression suites

The local harness deploys fresh contracts with remote data off. SPV9 references become local references; token and oracle identities point to explicit fixtures. Production `.clar` files are never edited. `build.mjs` and the parity builders create disposable `.build/` copies; `verify-sources.mjs` and `parity/verify.mjs` check source hashes and exact dependency substitutions.

## Recorded USDCx parity results (2026-11-16)

**1,314/1,314 Vitest tests and 4,000/4,000 Rendezvous invariant trials passed. No contract finding.** [results.json](results.json) contains commands/report locations, source hashes, campaign counters, corrected harness failures and the complete changed-file inventory.

| Suite | sBTC/USDCx v6-5 | STX/USDCx v6-4 |
| --- | ---: | ---: |
| Market units | 352/352 | 353/353 |
| Rung/dispatch/relay integration | 128/128 | 128/128 |
| Core/ladder units | 95/95 | 95/95 |
| Clarinet complete local set | 26/26 | 25/25 |
| RV market, seed 20261116 | 1,000/1,000 | 1,000/1,000 |
| RV buy rung, seed 20261116 | 500/500 | 500/500 |
| RV sell rung, seed 20261116 | 500/500 | 500/500 |

Shared redeploy tests passed **159/159**; the signed-Lazer sBTC/USDCx F-01 suite passed **4/4**. The shared count includes the two STX sell-rung F-01 cases. Formatted-mirror checks passed **3/3**. Clarinet counts are contracts checked, including dependencies/fixtures, and are not included in the Vitest total. sBTC/USDCx integration ran as the complete 118-case baseline plus the separate 10-case relay suite; STX/USDCx ran all 128 together.

The previous 699/699 Vitest and 3,500/3,500 RV run remains a historical baseline in `results.json`. The original sBTC/STX market, integration and RV campaigns were not rerun by this parity extension; its shared redeploy/mirror cases were rerun.

| Market coverage | Functions | Lines | Branches |
| --- | ---: | ---: | ---: |
| sBTC/USDCx v6-5 | 144/144 (100%) | 2,425/2,425 (100%) | 875/877 (99.77%) |
| STX/USDCx v6-4 | 144/144 (100%) | 2,423/2,423 (100%) | 877/879 (99.77%) |

These are raw production-market counts, without coverage exclusions. Gates require 100% functions/lines and at least 99.75% branches. The two unhit branches per market propagate an unexpected error from the park helper; both normal queue-full recovery paths are exercised.

## sBTC/USDCx v6-5

The local set includes `markets-sbtc-usdcx-jing-v6-5`, `swap-router-sbtc-usdcx-jing-v5-6`, `jing-settle-batch-sbtc-usdcx-v2`, the buy/sell `bps-v2` templates deployed with `-v2` names, the pair ladder, dispatch and relay, and their core/trait dependencies. Feeds are **[1,7]**; x is 8-decimal sBTC and y is 6-decimal USDCx.

`tests/unit/parity-sbtc-usdcx/` ports all 351 market baseline cases and adds wrong-USDCx initialization rollback/recovery. `parity-sbtc-usdcx-integration/` ports all 118 rung/dispatch cases and adds ten relay cases. `parity-sbtc-usdcx-ladder/` exercises the real pair ladder and core in 95 cases. Physical x orders are sell-sBTC rungs (`sel-band`); physical y orders are buy-sBTC rungs (`buy-band`). Both templates implement F-01 debt. Rung ABI tuple fields retain the legacy names `sbtc` for x and `stx` for y, including in STX/USDCx; assertions interpret them by asset side.

The broad market/integration fixtures use a synthetic $10,000 BTC mid (`1e12` at 8 price decimals): raw y/x = 100. Focused redeploy/router and rung-RV cases also use $100,000 BTC: raw y/x = 1,000. Expected transfers account for the 100-fold token decimal factor. USDCx transfers are checked as FT events, including their asset identity.

## STX/USDCx v6-4

The local set includes `markets-stx-usdcx-jing-v6-4`, both routers (`v5-5` and `v6`), `jing-settle-batch-stx-usdcx`, both `stx-usdc-bps` rungs, the pair ladder, dispatch and relay, and core/trait dependencies. Feeds are **[45,7]**; both assets have 6 decimals. The wrapped-STX trait fixture transfers actual native STX.

`tests/unit/parity-stx-usdcx/` ports all 351 baseline cases and adds wrong-x/wrong-y initialization rollback/recovery. Integration and core/ladder suites cover 128 and 95 cases. Sell-STX rungs rest x; buy-STX rungs rest y. **The sell rung has F-01 debt; the buy rung does not.** Tests assert debt fields and deficit behavior only where the source implements them.

Broad fixtures use a synthetic $100 STX mid (`1e10`): raw y/x = 100. Focused redeploy/router and rung-RV cases also use $1 STX: raw y/x = 1. Native-rung deposits and rescale remainders are adjusted for the 100,000-unit deposit minimum and 10,000-unit dust threshold. Native STX oracle fees remain distinct from USDCx proceeds; a fee sent to the native-input rung is followed through its next epoch.

## Shared scenarios and fuzz invariants

- Ordered public list removals cover both sides of all three markets, mixed wallet/contract makers, first/middle/last/only entries, missing-principal no-op/rejection, full fills and 50-maker books. Full withdrawal returns `u1024`; tests assert rollback, partial withdrawal, and complete removal through cancel.
- Staleness defaults/auth/bounds, independent 40/80 freshness caps, fixed-80 rebate curve, `-v2` name checks, funded DIA guards, and keeper batch results remain covered.
- New funded router cases cover manual/smart Jing routes in both directions through all three USDCx routers, exact output, min-out rollback and zero router custody. Net input is `floor(input * 10000 / 10020)` at the fresh rebate rate, followed by decimal conversion and a floored 10-bps output fee.
- Dispatch covers ten-rung walks, multi-member ownership, claims, retired/replaced rungs, escrow/timeouts and atomic batch rollback. Relay guards additionally prove intermediary deposit/claim/withdraw preserves the original sender's funds.
- F-01 tests burn credited proceeds using an explicit privileged token fixture, check first-come payouts, retained per-member debt, `u7017` during deficit, input exits and later repayment. Last-member previews include the exact division remainder.
- RV checks staleness ranges, list uniqueness and membership against nonzero deposits, aggregate asset conservation, operator authorization, invalid-bound `u1034`, and withdrawal limits. Market monitors include successful wrapper withdrawals and run after rejected calls. Rung monitors sync before taking the position preview and bound both input and proceeds/debt payouts. Unexpected assertion failures persist and fail the campaign.

The isolated market units/RV retain controlled oracle and capacity-ladder fixtures, as in the sBTC/STX baseline. Integration, ladder units and rung RV use the real local core/market/ladder programs. Market RV reserves 48 seats to force public-slot churn; deterministic list tests separately fill all 50 slots. Append-only fuzz helpers are confined to scratch/in-memory deployments. Random invalid FT asset names produce expected `BadTokenName` VM rejections; post-call accounting still passes, and the report classifies these separately from invariant failures.

All failures encountered while porting were test/harness drift: feed IDs, token funding/events, native trait deployment order, reversed rung side labels, debt tuple fields, native minima/dust, and fee/rounding expectations. Only harness/tests were corrected. No production contract fix was applied.

## Run

From the repository root:

```sh
npm run rv:build
clarinet check -m Clarinet-redeploy-sbtc-usdcx.toml
clarinet check -m Clarinet-redeploy-stx-usdcx.toml
npm run check:v6-3-mirrors
npm run test:sbtc-usdcx:parity
npm run test:stx-usdcx:parity
npm run test:redeploy
npm run test:f01-fix
npm run rv:usdcx:markets
npm run rv:usdcx:rungs
npm run test:parity:verify
```

Each pair has separate `:market`, `:integration`, and `:ladder` commands. SDK sessions reset per test; no new `beforeAll`/`beforeEach` hooks are used. Integration builds its oracle fixture independently, so it also runs on a fresh checkout. Generated sources/settings/coverage remain ignored. The original `npm test`, `test:v6-3:integration`, `test:core-ladder-v1`, `rv:v6`, and `rv:rungs` commands remain available; the RV aggregate commands now include both USDCx sets. The older signed-Lazer rung campaign remains available as `rv:usdcx:signed-rungs`.

## Stxer scope still needed

Local decoded-price fixtures prove market validation, not mainnet Lazer signer/fee-registry acceptance. Signed local F-01 tests use an authorized test signer. Stxer is still needed for deployed principals/ownership, live DIA/token/oracle integration, current-source execution costs/full books, and successful live AMM/DLMM/Zest routing. The Zest fixture supplies an ABI and rejects swaps; the new funded router assertions execute Jing legs. No Stxer simulations were run or edited by this work.
