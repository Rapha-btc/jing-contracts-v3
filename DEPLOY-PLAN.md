# Deploy plan: Jing v6-3 + Juice launch

Final state, 2026-10-13. Nothing here is deployed. Every commit below was
checked with `git log -1 -- <file>`. Mainnet status was checked on 2026-10-13
via `http://77.42.3.101/stacks-api/v2/contracts/interface/<deployer>/<name>`
(200 = deployed, 404 = not).

Deployer for every row: `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22` (account 0,
chavita), unless the row says otherwise. Deploy bytes come from the faktory-dao
BE templates (`backend/server/utils/<name>-template.ts`, sent by
`POST /api/bot/deploy-contract`). Templates were refreshed and pushed in
faktory-dao `d0b27773` (origin/master): 13 templates, byte-verified against
the commits below, plus `juice-swap-vault-trait-v2` in `DEPLOYABLE_CONTRACTS`.

Launch target: before cycle 146 (burn block 972,650).

## Already on mainnet. Do not redeploy

| Name | Status | Note |
| --- | --- | --- |
| `juice-swap-vault-trait` (v1) | 200 | Cannot gain `set-pyth-fee-budget`. Replaced by v2 for new vaults |
| `juice-pool-stx-signer` | 200 | Live STX pool since cycle 141 |
| `jing-core-v5`, `jing-ladder`, `markets-sbtc-stx-jing-v6`, `markets-sbtc-stx-jing-v6-2`, `swap-router-sbtc-stx-jing-v5-2` | 200 | Current live Jing stack. Stays as is |
| `rfq-sbtc-stx-jing-v2-3` | 200 | Miner oracle that the rungs, the Juice vault and fastpool read |
| `fakfun-wallet-core-v2`, `clarity-5-webauthn-v4`, `juice-safe-auth-helpers-v1`, `juice-safe-v7` | 200 | Pillar dependencies of the autostake safe |

## 1. Jing v6-3 set

Repo `Rapha-btc/jing-contracts-v3`, branch `master` (pushed, in sync with
origin). Clarity 5 for every row.

| # | Contract name | Source path | Last commit | Mainnet | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1 | `jing-core-v6` | `contracts/jing-core-v6.clar` | `ac23d0a` | 404 | (sBTC only) |
| 2 | `jing-ladder-v1` | `contracts/jing-ladder-v1.clar` | `741de17` | 404 | none |
| 3 | `markets-sbtc-stx-jing-v6-3` | `contracts/markets-sbtc-stx-jing-v6-3.clar` | `c14f038` | 404 | 1, 2, Pyth Lazer oracle + decoder-v1 (live) |
| 4 | `swap-router-sbtc-stx-jing-v5-3` | `contracts/swap-router-sbtc-stx-jing-v5-3.clar` | `f342615` (disabled-DLMM-pool fix) | 404 | 3, Bitflow DLMM/XYK, Velar (live) |
| 5 | `jing-rung-deposit-trait` | `contracts/jing-rung-deposit-trait.clar` | `c018402` | 404 | none |
| 6 | `jing-buy-stx-spread-<bps>`, 10 contracts | `contracts/jing-buy-stx-core-spread-v1.clar` | `d8b01e4` | 404 (all 10) | 2, 3, `rfq-sbtc-stx-jing-v2-3` |
| 7 | `jing-sell-stx-spread-<bps>`, 10 contracts | `contracts/jing-sell-stx-core-spread-v1.clar` | `d8b01e4` | 404 (all 10) | 2, 3, `rfq-sbtc-stx-jing-v2-3` |
| 8 | `jing-ladder-dispatch` | `contracts/jing-ladder-dispatch.clar` | `a4939ec` (adds `claim-buy` / `claim-sell`) | 404 | 2, 5 |

Notes:

- **Market size: 98,005 deploy bytes, about 2 KB under the 100,000-byte cap.**
  The template is the comment-stripped, de-indented copy of `c14f038`
  (token-identical, SHA-256 `6eb222e4...184e972f`). It is NOT
  `clarinet format`-ed. Do not deploy `markets-sbtc-stx-jing-v6-3-formatted.clar`
  (readable mirror only). **Any further market change must stay small.**
- Pyth fee: the market verifies the Lazer update once per fill (`314aaba` swap,
  `c14f038` reprice-or-swap). So a vault budget of 1x the oracle fee is enough.
  The fee is u0 today.
- Rungs: bps = 0, 10, 20, ..., 90. That gives 10 per side, 20 in total. Each
  side uses one template; only the deploy name changes. `initialize` checks
  `(is-eq (own-name) (concat NAME_PREFIX (int-to-ascii bps)))`, so the name
  must match the bps (BE `deployNamePattern` `/^jing-buy-stx-spread-\d+$/`,
  `/^jing-sell-stx-spread-\d+$/`). `max-band-per-side` defaults to u10.

### Jing post-deploy calls (in order)

| When | Call | Sender | BE route |
| --- | --- | --- | --- |
| after 3 | `markets-sbtc-stx-jing-v6-3.sync-seat-count()` reads ladder max u10 | anyone (deployer) | `init-jingswap-market {action:"sync-seats", set:"v6-3"}` |
| after 3 | `jing-core-v6.set-verified-contract(.markets-sbtc-stx-jing-v6-3)`. Wait for confirm | core owner | `{action:"verify-market", set:"v6-3"}` |
| after verify | `markets-sbtc-stx-jing-v6-3.initialize(.markets-sbtc-stx-jing-v6-3, sbtc-token, token-stx-v-1-2, u1000, u1000000, u1, u45)`, which also calls `jing-core-v6.register` | market operator | `{action:"init-market", set:"v6-3"}` |
| after the first rung of each side | `jing-ladder-v1.set-canonical("buy-band", .jing-buy-stx-spread-0)` and `set-canonical("sel-band", .jing-sell-stx-spread-0)`. **Required before any rung `initialize`** (else `ERR_NOT_VERIFIED`) | ladder owner | none (manual) |
| after each rung | `<rung>.initialize(u<bps>, true)`. Registers, seats in the ladder, calls `market.sync-seat` | ladder owner (`tx-sender`) | none (manual) |
| optional | `jing-ladder-v1.set-max-band-per-side` only to change u10 | ladder owner | none |

The router binds the market as a literal and needs no init. Sequence
reference: `simulations/verify-v6-3-dispatch.js`.

## 2. Juice launch pool

Repo `Rapha-btc/juicestx`, branch `main`, HEAD `1e9a2fb` (pushed). Clarity 6.
Deploy after Jing step 4: the vault binds `markets-sbtc-stx-jing-v6-3` and
`swap-router-sbtc-stx-jing-v5-3` as literals.

| # | Contract name | Source path | Last commit | Mainnet | Depends on |
| --- | --- | --- | --- | --- | --- |
| J1 | `juice-swap-vault-trait-v2` | `contracts/pox-5/juice-swap-vault-trait-v2.clar` | `e954136` | 404 | none. **Deploy first** (fastpool uses it too) |
| J2 | `juice-pool-sbtc-signer` | `contracts/pox-5/juice-pool-sbtc-signer.clar` | `e954136` | 404 | J1, pox-5. `swap-vault` var = `.juice-sbtc-autoswap` (literal, no call at deploy) |
| J3 | `juice-sbtc-autoswap` | `contracts/pox-5/juice-sbtc-autoswap.clar` | `1e9a2fb` | 404 | J1, Jing 3 + 4, `rfq-sbtc-stx-jing-v2-3`, DIA. `POOL` = `.juice-pool-sbtc-signer` |

The pool and the vault name each other, but neither calls the other at deploy.

### Juice post-deploy calls

- [ ] `juice-pool-sbtc-signer.register-self(signer-manager, signer-key, auth-id, signer-sig)`.
      Admin-only: `grant-signer-key` + `register-signer` in one tx (same pattern
      as live pool tx `0xaf26b5f8...dd4c7b70`). Use a fresh `auth-id`.
- [ ] Fee: `fee-bips` starts at u450 (4.5%). No call needed.
- [ ] OG cap: `og-cap-ustx` starts at u2100000000000 (2.1M STX). No call needed.
- [ ] Pyth budget starts at u0 (fee is u0 today). If Pyth turns on a fee, call
      `set-vault-pyth-fee-budget(ustx, .juice-sbtc-autoswap)` with at least 1x
      the fee (max 10 STX). Keep a small STX float in the vault.

## 3. Pillar autostake safe

Repo `Rapha-btc/pillar-wallets-xyz`, branch `main` (pushed). Nested checkout:
`~/projects/pillar/contracts/pillar-wallets`. Review:
`README-juice-autostake-safe-review.md` (accepted 2026-10-13).

| # | Contract name | Source path | Last commit | Clarity | Mainnet | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | `juice-autostake-safe-auth-helpers-v1` | `contracts/juice-autostake-safe-auth-helpers-v1.clar` | `2d136c1` | 4 | 404 | none |
| P2 | `juice-autostake-safe` | `contracts/juice-autostake-safe.clar` | `2d136c1` | 6 | 404 | J2 (`JUICE-SIGNER` literal), P1, `clarity-5-webauthn-v4`, `fakfun-wallet-core-v2`, `juice-safe-auth-helpers-v1` (all live) |

Post-deploy:

- [ ] `fakfun-wallet-core-v2.set-verified-contract(SPV9K21....juice-autostake-safe)`
      before any user copy onboards (`register-wallet` checks the canonical hash).

## 4. Partner deploys (not ours to broadcast)

| Who | Repo / branch | Contracts (order) | Clarity | Last commit | Mainnet | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| Friedger (Fast Pool) | `Rapha-btc/fastpool-pox-5` `rapha/fastpool-swap-vault`, PR fastpool/fastpool-pox-5#1 | `fastpool-swap-vault`, then `signer-manager-vault-stx-rewards` | 6 | HEAD `bfe3591` (pushed): trait-v2 `d52910a`, Pyth fee budget, F1 allowance `1e6fab3`. Vault `bfe3591`, signer `d52910a` | 404 | **J1** (ours, once for both pools), Jing 3 + 4, `rfq-sbtc-stx-jing-v2-3`. Doc: `docs/deploy-stx-rewards.md` section 11 |
| CityCoins DAO (MIA) | `Rapha-btc/citycoins-protocol` `feat/ccd015-redemption-book` | `ccd015-redemption-book-mia-stx`, then `ccd016-swap-vault-mia-v2`, enabled by a CCIP proposal | 5 | HEAD `8bb69aa` (pushed): Pyth fee budget `b9ef5db`, fuel-fair-book reserve + F1 allowance `4940041` | 404 (deployer `SP8A9HZ3...`) | Jing 3 + 4 (literals), base-dao, `ccd002-treasury-mia-rewards-v3` |

## Global order

1. Jing 1 to 8 with the Jing post-deploy calls. All 20 rungs seated before the
   ladder goes live.
2. J1 `juice-swap-vault-trait-v2`.
3. J2, J3, then `register-self`.
4. P1, P2, then core-v2 `set-verified-contract`.
5. Partners: fastpool (after J1 + Jing 4), MIA ccd015 + ccd016 (after Jing 4).

## Open before deploy

Done:

- [x] Router disabled-DLMM-pool fix: `f342615`.
- [x] trait-v2 migrations: juicestx `e954136`, fastpool `d52910a` (PR #1).
- [x] Vault Pyth fee budgets: juicestx, fastpool `bfe3591`, citycoins `8bb69aa`.
      Budget >= 1x oracle fee (market verifies once per fill).
- [x] faktory-dao templates refreshed and byte-verified: `d0b27773`.

Still open:

- [ ] Ladder `set-canonical("buy-band" / "sel-band")` before any rung `initialize`.
- [ ] Owner keys: move the core-v6 owner, ladder owner, market operator and RFQ
      operator to a multisig with distinct cosigners.
- [ ] ccd016 `STX_FAIR_BOOK` is still relative `.ccd015-redemption-book-mia-stx`.
      Partner's call; we skip it.
- [ ] Audit bounty `mv7dfb43df5505479788` (10k) on the final bytes, open
      until 2026-10-20.
- [ ] Launch before cycle 146 (burn 972,650).
