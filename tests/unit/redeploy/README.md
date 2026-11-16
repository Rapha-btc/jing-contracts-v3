# Current redeploy regression suites

The scratch harness uses the user's local-deployment option (b): remote data is off, SPV9 references become local contract references, and the real core, ladders, markets, routers, batch helpers and rungs deploy under the simnet issuer. Token and oracle identities are redirected to explicit fixtures. Production `.clar` files are never edited. `build.mjs` creates disposable copies under `.build/`; `verify-sources.mjs` verifies all production copies against source hashes and the declared substitutions.

The historical `v6-3` suite directories now target the sBTC/STX v6-5 market and rung-v3 templates. Their npm command names remain compatible. Old RV reports and the historical Stxer cross-check are not evidence for the current source revision. See `results.json` for this run's results and source hashes.

## Recorded results (2026-11-16)

699/699 Vitest tests and 3,500/3,500 RV invariant trials passed. No contract bug was found in these runs.

| Suite/check | Pass/total |
| --- | --- |
| npm test / unit/v6-3 | 351/351 |
| integration-v6-3 (current rung-v3) | 118/118 |
| core-ladder-v1 | 95/95 |
| redeploy | 131/131 |
| F-01 new USDCx rungs | 4/4 |
| local sBTC/STX | 24/24 |
| local sBTC/USDCx | 24/24 |
| local STX/USDCx | 22/22 |
| existing sBTC/USDCx | 5/5 |
| existing STX/USDCx | 3/3 |
| RV build | 1/1 |
| formatted mirrors | 3/3 |
| RV sBTC/STX market | 1000/1000 |
| RV sBTC/USDCx market | 1000/1000 |
| RV STX rung-v3 campaign | 500/500 |
| RV USDCx rungs (500 per side) | 1000/1000 |

Market coverage: 144/144 functions, 2,396/2,396 lines, 873/875 branches (99.77%); all existing thresholds passed. Counts for Clarinet are contracts checked; the 131 redeploy cases include lists 16, setters/direct cuts 66, names/DIA 32, and pricing/routers/batches 17. Complete changed-file inventory, source hashes and retained log locations are in [results.json](results.json).

## Run

From the repository root:

```sh
npm run rv:build
clarinet check -m Clarinet-redeploy-v6-5.toml
clarinet check -m Clarinet-redeploy-sbtc-usdcx.toml
clarinet check -m Clarinet-redeploy-stx-usdcx.toml
clarinet check -m Clarinet-sbtc-usdcx.toml
clarinet check -m Clarinet-stx-usdcx.toml
npm run check:v6-3-mirrors
npm test
npm run test:v6-3:integration
npm run test:core-ladder-v1
npm run test:redeploy
npm run test:f01-fix
npm run rv:v6
npm run rv:rungs
```

`npm test` and `npm run test:v6-3` select the same suite. The new Vitest config builds its own scratch dependencies. No new tests use setup hooks; each test explicitly starts a fresh simnet session. The SDK instance is reused to avoid accumulating WASM instances.

The RV commands retain 1,000 trials per market and 500 trials per rung campaign, with seed `20261116`. The STX campaign exercises four deployed rung-v3 instances (buy/sell, 20/50 bps); USDCx runs 500 trials separately for each buy/sell template. Both market campaigns and all rung campaigns check staleness bounds, list uniqueness, and equality between list membership and nonzero current-cycle deposits after every public call. Existing accounting/solvency checks remain active. Market campaigns reserve 48 seats to force public-slot churn; the Vitest list suite separately exercises all 50 public slots.

## Coverage and corrected expectations

- `lists.test.ts`: 16 public scenarios across both new markets and both sides. Mixed wallet/contract makers, exact order after first/middle/last/only removals, missing-principal private no-op and public rejection, full fills with exact proceeds, and first/last removal from a 50-maker list. Makers settle into the next cycle and receive proceeds directly; there is no market claim method.
- Full `withdraw-token-x/y` intentionally returns `ERR_USE_CANCEL` (`u1024`). Tests assert unchanged lists on rejection, partial-withdraw preservation, and full removal through cancel. They do not assume full withdrawal removes a maker.
- `markets.test.ts`: default/auth/boundary/rollback checks for both staleness setters on all three markets, and direct read-cut cases with both principal types.
- `rungs.test.ts`: correct `-v2` names and rejected old names (`u7009`) for both redeploy sets; funded DIA push guards on sBTC/USDCx and STX/USDCx, including stale, future, and excessive values plus boundary/recovery cases.
- `pricing.test.ts`: independent freshness caps, the fixed 80-second rebate curve, all four routers' rebate-derived `jing-size`, both batch helpers, and funded swap/reprice cutoff cases. A noncrossing reprice queues its limit without advancing the cycle.
- `tests/f01-fix`: both new USDCx rung templates, first-come shortfall payout, per-member debt, later repayment, and `u7017` deposit rejection during deficit. The fixture uses the real local Pyth verifier/decoder with a locally authorized signing key.

Previous failures were test/harness drift: old deployment names, the old 80-second public settlement expectation, obsolete SDK coverage exclusions, attempted full-withdraw removal, and assuming a noncrossing reprice settles. The SPV9 Metadata collision and excessive fresh WASM instances were harness failures before contract execution. No contract fix was applied.

## Stxer scope still needed

The decoded-price unit fixture proves market validation, not acceptance of real mainnet Lazer updates. Local F-01 tests exercise cryptographic verification with a test signer, not the production signer registry. Stxer still needs to verify deployed principals/ownership and mainnet token/oracle integration, current-source transaction execution/costs (including full books), and live AMM/DLMM/Zest router paths. The Zest dependency here supplies an ABI and rejects swaps; router unit assertions cover Jing sizing, not successful Zest execution. No Stxer simulations were run or edited by this work.
