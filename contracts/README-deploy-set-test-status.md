# Clarinet report: Jing + Juice launch deploy set

## Deploy contract list

This is the primary launch set from [`DEPLOY-PLAN.md`](../DEPLOY-PLAN.md), not
the already-live contracts or unrelated entries in faktory-dao's general
deployable list.

**Jing v6-3 (26 contract deployments):**

- `jing-core-v6`
- `jing-ladder-v1`
- `markets-sbtc-stx-jing-v6-3`
- `swap-router-sbtc-stx-jing-v5-3`
- `jing-rung-deposit-trait`
- `jing-buy-stx-spread-0`, `jing-buy-stx-spread-10`,
  `jing-buy-stx-spread-20`, `jing-buy-stx-spread-30`,
  `jing-buy-stx-spread-40`, `jing-buy-stx-spread-50`,
  `jing-buy-stx-spread-60`, `jing-buy-stx-spread-70`,
  `jing-buy-stx-spread-80`, `jing-buy-stx-spread-90`
- `jing-sell-stx-spread-0`, `jing-sell-stx-spread-10`,
  `jing-sell-stx-spread-20`, `jing-sell-stx-spread-30`,
  `jing-sell-stx-spread-40`, `jing-sell-stx-spread-50`,
  `jing-sell-stx-spread-60`, `jing-sell-stx-spread-70`,
  `jing-sell-stx-spread-80`, `jing-sell-stx-spread-90`
- `jing-ladder-dispatch`

**Juice (3 deployments):** `juice-swap-vault-trait-v2`,
`juice-pool-sbtc-signer`, `juice-sbtc-autoswap`.

**Pillar autostake safe (2 deployments):**
`juice-autostake-safe-auth-helpers-v1`, `juice-autostake-safe`.

That is **31 primary launch deployments** represented in the Clarinet suites.
The two trait contracts compile in their dependency manifests and have no
executable function bodies. The 20 rung names use two source templates; the
integration manifest includes every planned name from 0 through 90 bps. It
also contains a 100 bps fixture that is not in the deploy plan.

## Does Clarinet cover every planned contract?

**For the 31 primary Jing, Juice, and Pillar deployments: yes, at the source
and contract-family level.** Every executable contract is compiled and every
public function is hit by at least one Clarinet test. The table below shows
raw coverage and its documented exceptions; “covered” does not mean 100% raw
line or branch coverage.

Clarinet runs the checked-out contract sources or generated source copies,
not the TypeScript template strings themselves. faktory-dao separately
verified the launch templates against these source commits using the deploy
byte rules in `DEPLOY-PLAN.md` (comments stripped and formatted, with the
market de-indented). Dependency substitutions in test manifests are listed
in the suite builders; they do not replace the contract under test.

| Contract(s) | Final source commit | Clarinet suite and result | Raw coverage | Remaining gap |
|---|---|---|---|---|
| `jing-core-v6` | `ac23d0a` | `npm run test:core-ladder-v1`, 95/95 shared tests | 83/83 functions; 938/938 lines; 163/164 branches | Defensive saturating debit arm is unreachable under the equity invariant. |
| `jing-ladder-v1` | `741de17` | Same 95/95 | 31/31 functions; 266/267 lines; 61/61 branches | SDK does not count the executed `retire-band` tuple-binding line. |
| `markets-sbtc-stx-jing-v6-3` | `ada49d8` | `npm run test:v6-3`, 338/338 | 141/141 functions; 2375/2381 lines (99.75%); 845/847 branches (99.76%) | Two non-queue parking-error arms cannot be returned by the registered final core park logger. |
| `swap-router-sbtc-stx-jing-v5-3` | `15aef66` | `npm run test:router-v5-3`, 490/490 | 44/44 functions; 692/696 lines (99.43%); 275/276 branches (99.64%) | `cp-split` zero-total arm needs zero residual; its caller exits on zero/dust first. |
| `jing-rung-deposit-trait` | `c018402` | Compiled in `test:v6-3:integration` | No executable functions | Compile-only interface. |
| `jing-buy-stx-spread-{0..90}` (10 names) | `d8b01e4` | `npm run test:v6-3:integration`, 118/118 shared integration tests | Template: 35/35 functions; 466/478 lines (97.49%); 155/157 branches (98.73%) raw | Static call operands and defensive payout-invariant arms; source-anchored exceptions are documented in the suite report. |
| `jing-sell-stx-spread-{0..90}` (10 names) | `d8b01e4` | Same 118/118 | Template: 35/35 functions; 464/476 lines (97.48%); 155/157 branches (98.73%) raw | Same categories as buy rung; source-anchored exceptions are documented. |
| `jing-ladder-dispatch` | `a4939ec` | Same 118/118 | 15/15 functions; 132/132 lines; 40/40 branches | None reported. |
| `juice-swap-vault-trait-v2` | `e954136` | `npm run test:report`, 134/134 Juice tests | No executable functions | Compile-only interface. |
| `juice-pool-sbtc-signer` | `fa8c48a` | Same 134/134 | 81/81 functions; 715/717 lines; 115/115 branches | Two batch-form lines are SDK instrumentation artifacts. OG seat rotation/shrink and payout scenarios are exercised. |
| `juice-sbtc-autoswap` | `fa8c48a` | Same 134/134 | 41/41 functions; 481/502 lines; 150/150 branches | Missed lines are static literals/bindings; vault-mid fee budget and finish reserve scenarios are exercised. |
| `juice-autostake-safe-auth-helpers-v1` | `2d136c1` | 9-file safe run, 152/152 tests | 2/2 functions; 13/13 lines | None reported. |
| `juice-autostake-safe` | `611873c` | Same 152/152 | 50/50 functions; 810/861 lines (94.08%); 230/233 branches (98.71%) | Two cooldown-at-cap arms are blocked by input validation; duplicate replay guard is shadowed by the earlier identical-signature guard. |

The safe coverage manifest uses the exact production safe body with only three
principal substitutions for local dependencies; the test builder verifies
that constraint. Commands and per-suite artifacts are in the linked suite
READMEs: [market](../tests/unit/v6-3/README.md),
[router](../tests/unit/router-v5-3/README.md),
[core and ladder](../tests/unit/core-ladder-v1/README.md), and
[rungs and dispatch](../tests/unit/integration-v6-3/README.md).

The recorded safe run used the `tests/cl-autostake-cov/Clarinet.toml` manifest
and these nine test files:

```sh
AUTOSTAKE_DEPLOYER=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM \
AUTOSTAKE_WALLET_NAME=juice-autostake-safe \
AUTOSTAKE_POOL_NAME=juice-autostake-pool \
npx vitest run tests/juice-safe-v7*.test.ts \
  tests/juice-autostake-safe-keeper.test.ts -- \
  --manifest tests/cl-autostake-cov/Clarinet.toml --coverage
```

## Partner contracts

These partner deployments now also have source-pinned Clarinet SDK suites:

| Partner contract(s) | Source commit | Clarinet status |
|---|---|---|
| `ccd015-redemption-book-mia-stx` | `a9a6bd6` | `npm run test:book`: 1/1 suite; 21/21 public/read-only functions, 29/29 instrumented functions, 211/213 lines (99.06%), 72/72 branches. The two unhit line counters are static token principal literals at source lines 373 and 375; all function and branch counters are hit. |
| `ccd016-swap-vault-mia-v2` | `8bfbb5f` | `npm run test:vault`: 313 assertions; 46/46 functions, 450/473 lines (95.14%), 118/119 branches (99.16%). The remaining branch is a vault floor guard the mock router rejects before the vault receives a result. |
| `fastpool-swap-vault` | `b719e87` | Source-pinned Vitest/Clarinet suite: 317 assertions; 41/41 functions, 466/502 lines (92.8%), 138/150 branches (92.0%). |
| `signer-manager-vault-stx-rewards` | `3f82a93` | Same 317-assertion suite; 56/56 functions, 551/563 lines (97.9%), 85/91 branches (93.4%). |

FastPool's focused Clarinet harness instructions, source pins and limits are in
`fastpool-pox-5/tests/vault-stx/README.md`.
Its isolated builder uses the current Jing v6-3 test market/Core interface
instead of the stale CityCoins fixture, and keeps generated files under the
FastPool `.build/fastpool-only` directory. Every public function is hit in both
FastPool contracts; remaining misses are defensive status/balance/payout
branches and fixture-reachability cases. The FastPool repository suite also
passes: 49 tests passed with one intentional isolated-harness skip.

CityCoins pins both source hashes in its
[`runtime.json`](https://github.com/Rapha-btc/citycoins-protocol/blob/feat/ccd015-redemption-book/tests/vault/results/runtime.json)
and the book-specific counters in
[`ccd015-book-runtime.json`](https://github.com/Rapha-btc/citycoins-protocol/blob/feat/ccd015-redemption-book/tests/vault/results/ccd015-book-runtime.json).
Book coverage details are in the [CityCoins vault README](https://github.com/Rapha-btc/citycoins-protocol/blob/feat/ccd015-redemption-book/tests/vault/README.md).

## Source pins and interpretation

These are raw source SHA-256 pins used by the Clarinet runs (not hashes of the
comment-stripped BE template strings):

| Source family | SHA-256 |
|---|---|
| Jing core / ladder | `88a689affb23f13030953e891336af42a3f5cb275f13b3c54c79d8cd4de50697` / `0f1e08b023272ed96a2653f727292626d4b0325dcf4e42963104d977860ec786` |
| Jing market / router | `943927cc5067d21d50c87e3f7464d379c3d704cb2ed8dcbfb5c88205a68c5a67` / `fb64c9a0c642bdf821cfb754900e58edc7d5b7f27aeab7348cc34a4645e43698` |
| Jing trait / buy rung / sell rung / dispatch | `927fbba4826710ded7e81fb4847ed92f5c4310bc4e0cf42537600876b0a01163` / `584b66804090ae2363244e277a6e840f1d60ece92ad67ee5525a772e0f3e9467` / `fdf5c2b11dadcf61d1e1d2d30df2f1127e1375fcf553f24105075035d70f10e5` / `f6190711bcf7871a5f0e7931af0d130fc7b07da09527be39af33c30b1d620bbb` |
| Juice trait-v2 / pool / autoswap | `e6ee46a72857916f33b8d0c91a7344d62b51d303279ff9a7ea28954fe52b8093` / `603a7dca7cdcf0be9d11246aa5b81e12d3ab771f1f53d4bf6e1cf883e59a0c9c` / `1cd93089874a08f9e02b4c72c9b307bcfb4b3bcbb419394cf7cd9a5d14bca8c7` |
| Pillar safe helper / safe | `81ec24e171a4f4c3baac84b4b3e505b9bbe12e288911ffd242ecec1640665642` / `9e09d277172d2b5cd57dacf6158e22e102b10f040819eabe8aadce3335b03bff` |
| CityCoins book / vault | `b3526d4ce89e615108c1b6781bf67b6f8354e3880adb404883a30fbdd36ec65f` / `e3437fcfe248b46e11ffee8b37e88d227211387afca099db1502c8b231133720` |

The suite builders regenerate the Juice and CityCoins source copies and pin
their hashes in generated reports. The Jing coverage reports record their
source hashes directly.

Stxer simulations informed scenario selection but are not counted as Clarinet
tests or coverage. These runs establish local behavior against the pinned
sources and declared fixtures; they do not deploy contracts or prove all
possible behavior.
