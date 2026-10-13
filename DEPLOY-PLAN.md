# Deploy plan: Jing v6-3 + Juice launch

Draft, 2026-10-13. Nothing here is deployed. Mainnet status checked on
2026-10-13 via `http://77.42.3.101/stacks-api/v2/contracts/interface/<deployer>/<name>`
(200 = deployed, 404 = not).

Deployer for every row: `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22` (account 0,
chavita), unless the row says otherwise. Deploy bytes come from the faktory-dao
BE templates (`backend/server/utils/<name>-template.ts`, sent by
`POST /api/bot/deploy-contract`): comments stripped and `clarinet format`
applied. The templates must be regenerated from the commits below before the
deploy (see "Open before deploy").

## Already on mainnet. Do not redeploy

| Name | Status | Note |
| --- | --- | --- |
| `juice-swap-vault-trait` (v1) | 200 | Cannot gain `set-pyth-fee-budget`. Replaced by v2 for new vaults |
| `juice-pool-stx-signer` | 200 | Live STX pool since cycle 141 |
| `jing-core-v5`, `jing-ladder`, `markets-sbtc-stx-jing-v6`, `markets-sbtc-stx-jing-v6-2`, `swap-router-sbtc-stx-jing-v5-2` | 200 | Current live Jing stack. Stays as is |
| `rfq-sbtc-stx-jing-v2-3` | 200 | Miner oracle that the rungs, the Juice vault and fastpool read |
| `fakfun-wallet-core-v2`, `clarity-5-webauthn-v4`, `juice-safe-auth-helpers-v1`, `juice-safe-v7` | 200 | Pillar dependencies of the autostake safe |

## 1. Jing v6-3 set

Repo `Rapha-btc/jing-contracts-v3`, branch `master`, HEAD `db8513a` (pushed).
Canonical list: `contracts/README-deploy-set-test-status.md` and the
`deploy-contract.post.ts` "Jing v6-3 set" comment. Clarity 5 for every row.

| # | Contract name | Source path | Last commit | Mainnet | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1 | `jing-core-v6` | `contracts/jing-core-v6.clar` | `ac23d0a` | 404 | (sBTC only) |
| 2 | `jing-ladder-v1` | `contracts/jing-ladder-v1.clar` | `741de17` | 404 | none |
| 3 | `markets-sbtc-stx-jing-v6-3` | `contracts/markets-sbtc-stx-jing-v6-3.clar` | `ee2edde` | 404 | 1, 2, Pyth Lazer oracle + decoder-v1 (live) |
| 4 | `swap-router-sbtc-stx-jing-v5-3` | `contracts/swap-router-sbtc-stx-jing-v5-3.clar` | `e5c58c4` + uncommitted fix | 404 | 3, Bitflow DLMM/XYK, Velar (live) |
| 5 | `jing-rung-deposit-trait` | `contracts/jing-rung-deposit-trait.clar` | `c018402` | 404 | none |
| 6 | `jing-buy-stx-spread-<bps>`, 10 contracts | `contracts/jing-buy-stx-core-spread-v1.clar` | `d8b01e4` | 404 (all 10) | 2, 3, `rfq-sbtc-stx-jing-v2-3` |
| 7 | `jing-sell-stx-spread-<bps>`, 10 contracts | `contracts/jing-sell-stx-core-spread-v1.clar` | `d8b01e4` | 404 (all 10) | 2, 3, `rfq-sbtc-stx-jing-v2-3` |
| 8 | `jing-ladder-dispatch` | `contracts/jing-ladder-dispatch.clar` | `c018402` | 404 | 2, 5 |

Notes:

- Market deploy bytes: `markets-sbtc-stx-jing-v6-3.clar` is the deploy source.
  It is de-indented to stay under 100,000 bytes (96,661 in the repo, 96,268 as
  the template). `markets-sbtc-stx-jing-v6-3-formatted.clar` is the readable
  mirror only (`npm run check:v6-3-mirrors`). Do not deploy the formatted copy.
- Rungs: bps = 0, 10, 20, 30, 40, 50, 60, 70, 80, 90. That gives 10 per side
  and 20 in total. Each side's 10 rungs use the same template bytes and only
  the deploy name changes. `initialize` checks
  `(is-eq (own-name) (concat NAME_PREFIX (int-to-ascii bps)))`, so
  the name must match the bps exactly (BE `deployNamePattern`
  `/^jing-buy-stx-spread-\d+$/`, `/^jing-sell-stx-spread-\d+$/`). The ladder
  sides are `"buy-band"` and `"sel-band"`. `max-band-per-side` defaults to u10,
  so the 10 seats per side fill it exactly.
- Order in the README: `jing-rung-deposit-trait` comes after the router. It has
  no dependencies, so any slot before step 8 works.

### Jing post-deploy calls (in order)

| When | Call | Sender | BE route |
| --- | --- | --- | --- |
| after 3 | `markets-sbtc-stx-jing-v6-3.sync-seat-count()` reads ladder max u10 | anyone (deployer) | `init-jingswap-market {action:"sync-seats", set:"v6-3"}` |
| after 3 | `jing-core-v6.set-verified-contract(.markets-sbtc-stx-jing-v6-3)`. Wait for confirm | core owner | `{action:"verify-market", set:"v6-3"}` |
| after verify | `markets-sbtc-stx-jing-v6-3.initialize(.markets-sbtc-stx-jing-v6-3, sbtc-token, token-stx-v-1-2, u1000, u1000000, u1, u45)`, which also calls `jing-core-v6.register` | market operator | `{action:"init-market", set:"v6-3"}` |
| after the first rung of each side | `jing-ladder-v1.set-canonical("buy-band", .jing-buy-stx-spread-0)` and `set-canonical("sel-band", .jing-sell-stx-spread-0)`. Required **before** any `initialize`: `register` fails with `ERR_NOT_VERIFIED` when no canonical is set | ladder owner | none (manual) |
| after each rung | `<rung>.initialize(u<bps>, true)`. This registers and seats in the ladder, then calls `market.sync-seat` | ladder owner (`tx-sender`) | none (manual) |
| optional | `jing-ladder-v1.set-max-band-per-side` only to change u10 | ladder owner | none |

No router allowlist or registration call was found. The router binds the market
as a literal and needs no init. Sequence reference:
`simulations/verify-v6-3-dispatch.js` (deploy, then sync, verify, init, then
canonical and initialize per rung).

## 2. Juice launch pool

Repo `Rapha-btc/juicestx`, branch `main`, HEAD `e954136` (pushed, includes the
trait-v2 migration).
Clarity 6 (BE). Deploy after Jing step 4: the vault binds
`markets-sbtc-stx-jing-v6-3` and `swap-router-sbtc-stx-jing-v5-3` as literals.

| # | Contract name | Source path | Last commit | Mainnet | Depends on |
| --- | --- | --- | --- | --- | --- |
| J1 | `juice-swap-vault-trait-v2` | `contracts/pox-5/juice-swap-vault-trait-v2.clar` | untracked (new) | 404 | none. v1 + `set-pyth-fee-budget`. Fastpool's copy is byte-identical |
| J2 | `juice-pool-sbtc-signer` | `contracts/pox-5/juice-pool-sbtc-signer.clar` | `e954136` | 404 | J1, pox-5. Default `swap-vault` var = `.juice-sbtc-autoswap` (a literal, no call at deploy) |
| J3 | `juice-sbtc-autoswap` | `contracts/pox-5/juice-sbtc-autoswap.clar` | `e954136` | 404 | J1, Jing 3 + 4, `rfq-sbtc-stx-jing-v2-3`, DIA. `POOL` = `.juice-pool-sbtc-signer` |

The pool and the vault name each other, but neither calls the other at deploy.
The BE comment uses the order pool, then vault. The brief listed autoswap
first. Both orders analyze, but the BE comment matches the rest of the plan.
Keep J1 first.

### Juice post-deploy calls

- [ ] `juice-pool-sbtc-signer.register-self(signer-manager, signer-key, auth-id, signer-sig)`.
      This is admin-only. It does `grant-signer-key` + `register-signer` in one tx,
      with the same pattern as the live pool's tx `0xaf26b5f8...dd4c7b70`. Use a fresh `auth-id`.
- [ ] Fee: `fee-bips` starts at **u450 (4.5%)** (`MAX_FEE_BIPS` u500), so no
      `propose-fee-bips` call is needed.
- [ ] OG cap: `og-cap-ustx` starts at **u2100000000000 (2.1M STX)**. It can only
      be raised (`raise-og-cap`). No call is needed.
- [ ] `pyth-fee-budget` starts at u0. Raise it through
      `set-vault-pyth-fee-budget(ustx, .juice-sbtc-autoswap)` only if Pyth turns
      on a fee (max 10 STX, use at least 2x the fee).

## 3. Pillar autostake safe

Repo `Rapha-btc/pillar-wallets-xyz`, branch `main`, HEAD `c910c1b`. Local
checkout: `~/projects/pillar/contracts/pillar-wallets`. Review:
`README-juice-autostake-safe-review.md` (accepted 2026-10-13).

| # | Contract name | Source path | Last commit | Clarity | Mainnet | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | `juice-autostake-safe-auth-helpers-v1` | `contracts/juice-autostake-safe-auth-helpers-v1.clar` | `2d136c1` | 4 | 404 | none |
| P2 | `juice-autostake-safe` | `contracts/juice-autostake-safe.clar` | `2d136c1` | 6 | 404 | J2 (`JUICE-SIGNER` trait literal), P1, `clarity-5-webauthn-v4`, `fakfun-wallet-core-v2`, `juice-safe-auth-helpers-v1` (all live) |

Post-deploy:

- [ ] `fakfun-wallet-core-v2.set-verified-contract(SPV9K21....juice-autostake-safe)`
      before any user copy onboards. `register-wallet` checks the canonical hash.
      User copies are then deployed per user and registered against that hash.

## 4. Partner deploys (not ours to broadcast)

| Who | Repo / branch | Contracts (order) | Clarity | Last commit | Mainnet | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| Friedger (Fast Pool) | `Rapha-btc/fastpool-pox-5` `rapha/fastpool-swap-vault`, PR fastpool/fastpool-pox-5#1 | `fastpool-swap-vault` (`contracts/fastpool-swap-vault.clar`), then `signer-manager-vault-stx-rewards` (`contracts/signer-manager-vault-stx-rewards.clar`) | 6 | HEAD `4e692ce`. Vault `0e8b5a7`, signer `bf585ae`. trait-v2 migration uncommitted | 404 | **J1** `SPV9K21....juice-swap-vault-trait-v2` (deployed by us, once for both pools), Jing 3 + 4, `rfq-sbtc-stx-jing-v2-3`. Doc: `docs/deploy-stx-rewards.md` section 11 |
| CityCoins DAO (MIA) | `Rapha-btc/citycoins-protocol` `feat/ccd015-redemption-book` | `ccd015-redemption-book-mia-stx`, then `ccd016-swap-vault-mia-v2` (`contracts/extensions/ccd016-swap-vault-mia-v2.clar`), enabled by a CCIP proposal | 5 | `b9ef5db` (Pyth fee budget) | 404 (deployer `SP8A9HZ3...`) | Jing 3 + 4 (literals), base-dao, `ccd002-treasury-mia-rewards-v3`. `STX_FAIR_BOOK` is still relative `.ccd015-redemption-book-mia-stx` ("in prod change this to the literal") |

## Global order

1. Jing 1 to 8 with the Jing post-deploy calls. All 20 rungs must be seated before
   the ladder goes live.
2. J1 `juice-swap-vault-trait-v2`.
3. J2 `juice-pool-sbtc-signer`, J3 `juice-sbtc-autoswap`, then `register-self`.
4. P1, P2, then core-v2 `set-verified-contract`.
5. Partners: fastpool (after J1 + Jing 4), MIA ccd015 + ccd016 (after Jing 4).

## Open before deploy

- [ ] Router disabled-DLMM-pool fix: uncommitted in this repo
      (`swap-router-sbtc-stx-jing-v5-3.clar`, `tests/unit/router-v5-3/*`).
      Pool ids u6/u15/u16 were read on 2026-10-13. Commit it, rerun router unit
      and stxer suites, and update the status README (it is pinned at `2373cec`).
- [ ] Regenerate faktory-dao templates. The router template (`b4ebdb9e`,
      2026-10-02) has no `book-limit` (missing `e5c58c4` and the pool fix).
      The juice pool and vault templates (`d706ee37`, 2026-10-06) have no
      `set-pyth-fee-budget` and still bind v1. No `juice-swap-vault-trait-v2`
      template or `DEPLOYABLE_CONTRACTS` entry exists yet. Check whether the
      autostake templates (`d706ee37`) match the `2d136c1` source. Rerun the
      template-bytes checks.
- [x] trait-v2 migration in juicestx: pushed `e954136`
      and the pool/vault/test edits, then rerun `test:vault` + stxer suites.
- [ ] trait-v2 migration in fastpool-pox-5: commit the vault/signer/sims edits
      and the trait mirror, then push to the PR for Friedger.
- [ ] Vault Pyth fee budgets: in juicestx `3624997`, citycoins `b9ef5db`, and in the
      fastpool working tree (uncommitted). Each starts at u0. Confirm with each owner.
- [ ] ccd016: replace relative `STX_FAIR_BOOK` with the deployed ccd015 literal.
- [ ] Bounty `muqchqnaa54e769598a4`: accept and pay Nilo, tip Devoted Basilisk,
      Lucid Hydra and Mega Grey. Decide Cunning Nexus's remaining Lows. Repost a
      follow-up bounty on the final bytes (router fix + trait-v2).
- [ ] Owner keys: move the core-v6 owner, ladder owner, market operator and RFQ
      operator to a multisig with distinct cosigners (status README).
