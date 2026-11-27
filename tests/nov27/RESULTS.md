# November 26–27 validation and coverage

All listed tests passed with Clarinet CLI/SDK 3.23.2 and Vitest 3.2.4. Sources and SHA-256 hashes are recorded in [latest.json](reports/latest.json).

| Test file | Result | Passed |
|---|---|---:|
| [rendezvous.test.ts](rendezvous.test.ts) | PASS | 4 |
| [router-paths.test.ts](router-paths.test.ts) | PASS | 22 |
| [swap-router-sbtc-stx-jing-v6-1.test.ts](swap-router-sbtc-stx-jing-v6-1.test.ts) | PASS | 8 |
| [swap-router-sbtc-usdcx-jing-v6.test.ts](swap-router-sbtc-usdcx-jing-v6.test.ts) | PASS | 7 |

## Whole-contract Clarity coverage

SDK LCOV is merged across fresh simnets. Mock/dependency contracts are excluded from these totals. Function denominators include uncalled functions. Branch coverage is not emitted by this SDK; no branch-coverage percentage is claimed.

| Production source | Baseline lines | Current lines | Functions reached |
|---|---:|---:|---:|
| `contracts/sbtc-stx/swap-router-sbtc-stx-jing-v6-1.clar` | 14.03% | 90.65% (814/898) | 53/54 |
| `contracts/sbtc-usdcx/swap-router-sbtc-usdcx-jing-v6.clar` | 52.78% | 91.65% (724/790) | 46/47 |

## Reproducible fuzzing

Rendezvous 1.0.3 generates ABI-typed inputs; fast-check shrinks failures. Seeds: `20261126`, `20261127`; **500 cases per property**, **2,000 generated cases** in this repository. Assertions run against production contract bodies with local external mocks. There are no discards or skipped properties. These are Rendezvous SDK tests inside Vitest, not runs of the legacy RV CLI suites.

```sh
npm ci --prefix tests/nov27
npm --prefix tests/nov27 test
# Larger campaign; seed values stay fixed for reproducibility:
RV_RUNS=2000 npm --prefix tests/nov27 test
```

The original 88-test baseline is preserved in [baseline.json](reports/baseline.json). Current results, complete uncovered line/function lists and source hashes are in [latest.json](reports/latest.json). Raw LCOV and Vitest JSON remain under `.build/`.

## Scope and next coverage work

Passing mocks do not validate mainnet liquidity, external oracle availability, or node-level PoX locking. Increasing whole-contract coverage requires exercising the remaining production paths, not counting mocks or removing defensive guards.
- `swap-router-sbtc-stx-jing-v6-1`: uncalled functions: `get-jing-min-deposits`.
- `swap-router-sbtc-usdcx-jing-v6`: uncalled functions: `get-jing-min-deposits`.
