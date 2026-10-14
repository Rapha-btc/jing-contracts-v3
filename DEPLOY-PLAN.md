# Deploy plan: Jing v6-3 + Juice launch

Final state, 2026-10-14, after the bounty mv7dfb fixes. Nothing here is
deployed. Every commit below was checked with `git log -1 -- <file>`. Mainnet status was checked on 2026-10-13
via `http://77.42.3.101/stacks-api/v2/contracts/interface/<deployer>/<name>`
(200 = deployed, 404 = not).

Deployer for every row: `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22` (account 0,
chavita), unless the row says otherwise. Deploy bytes come from the faktory-dao
BE templates (`backend/server/utils/<name>-template.ts`, sent by
`POST /api/bot/deploy-contract`). Templates were refreshed in faktory-dao
`d0b27773` (13 templates, plus `juice-swap-vault-trait-v2` in
`DEPLOYABLE_CONTRACTS`) and `341da272` (market at `ada49d8`). The mv7dfb
refresh (router, J2, J3, P2) is in the faktory-dao working tree, not yet
committed. Every template is byte-verified against the commits below.

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

Repo `Rapha-btc/jing-contracts-v3`, branch `master`, HEAD `5a09d9e` (pushed;
router stxer proof on `15aef66`, no contract change). Clarity 5 for every row.

| # | Contract name | Source path | Last commit | Mainnet | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1 | `jing-core-v6` | `contracts/jing-core-v6.clar` | `ac23d0a` | 404 | (sBTC only) |
| 2 | `jing-ladder-v1` | `contracts/jing-ladder-v1.clar` | `741de17` | 404 | none |
| 3 | `markets-sbtc-stx-jing-v6-3` | `contracts/markets-sbtc-stx-jing-v6-3.clar` | `ada49d8` (duplicate trait asserts removed; logic as `c14f038`) | 404 | 1, 2, Pyth Lazer oracle + decoder-v1 (live) |
| 4 | `swap-router-sbtc-stx-jing-v5-3` | `contracts/swap-router-sbtc-stx-jing-v5-3.clar` | `15aef66` (limit-aware DLMM pick, core-address check; after `f342615` disabled-pool fix) | 404 | 3, Bitflow DLMM/XYK, Velar (live) |
| 5 | `jing-rung-deposit-trait` | `contracts/jing-rung-deposit-trait.clar` | `c018402` | 404 | none |
| 6 | `jing-buy-stx-spread-<bps>`, 10 contracts | `contracts/jing-buy-stx-core-spread-v1.clar` | `d8b01e4` | 404 (all 10) | 2, 3, `rfq-sbtc-stx-jing-v2-3` |
| 7 | `jing-sell-stx-spread-<bps>`, 10 contracts | `contracts/jing-sell-stx-core-spread-v1.clar` | `d8b01e4` | 404 (all 10) | 2, 3, `rfq-sbtc-stx-jing-v2-3` |
| 8 | `jing-ladder-dispatch` | `contracts/jing-ladder-dispatch.clar` | `a4939ec` (adds `claim-buy` / `claim-sell`) | 404 | 2, 5 |

Notes:

- **Market size: 97,701 deploy bytes, about 2.3 KB under the 100,000-byte cap.**
  The template is the comment-stripped, de-indented copy of `ada49d8`
  (token-identical, SHA-256 `7b2f0f44...2f5f4c`). It is NOT
  `clarinet format`-ed. Do not deploy `markets-sbtc-stx-jing-v6-3-formatted.clar`
  (readable mirror only). **Any further market change must stay small.**
- Pyth fee: the market verifies the Lazer update once per fill (`314aaba` swap,
  `c14f038` reprice-or-swap). So a vault budget of 1x the oracle fee is enough.
  The fee is u0 today. The vaults now pay every verify themselves (see the
  Pyth budget notes in sections 2 and 4), so vault budgets are >= 2x the fee.
- Router size: 33,216 deploy bytes (`15aef66`, comment-stripped +
  `clarinet format`, SHA-256 `3e457866...e3b9b4`). Was 32,304 at `f342615`.
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

Repo `Rapha-btc/juicestx`, branch `main`, HEAD `fa8c48a` (pushed). Clarity 6.
Deploy after Jing step 4: the vault binds `markets-sbtc-stx-jing-v6-3` and
`swap-router-sbtc-stx-jing-v5-3` as literals.

| # | Contract name | Source path | Last commit | Mainnet | Depends on |
| --- | --- | --- | --- | --- | --- |
| J1 | `juice-swap-vault-trait-v2` | `contracts/pox-5/juice-swap-vault-trait-v2.clar` | `e954136` | 404 | none. **Deploy first** (fastpool uses it too) |
| J2 | `juice-pool-sbtc-signer` | `contracts/pox-5/juice-pool-sbtc-signer.clar` | `fa8c48a` (OG seats rotate + shrink) | 404 | J1, pox-5. `swap-vault` var = `.juice-sbtc-autoswap` (literal, no call at deploy) |
| J3 | `juice-sbtc-autoswap` | `contracts/pox-5/juice-sbtc-autoswap.clar` | `fa8c48a` (vault pays every Pyth verify, finish reserve) | 404 | J1, Jing 3 + 4, `rfq-sbtc-stx-jing-v2-3`, DIA. `POOL` = `.juice-pool-sbtc-signer` |

The pool and the vault name each other, but neither calls the other at deploy.

### Juice post-deploy calls

- [ ] `juice-pool-sbtc-signer.register-self(signer-manager, signer-key, auth-id, signer-sig)`.
      Admin-only: `grant-signer-key` + `register-signer` in one tx (same pattern
      as live pool tx `0xaf26b5f8...dd4c7b70`). Use a fresh `auth-id`.
- [ ] Fee: `fee-bips` starts at u450 (4.5%). No call needed.
- [ ] OG cap: `og-cap-ustx` starts at u2100000000000 (2.1M STX). No call needed.
      Seats rotate (`d90dc1c`, `fa8c48a`): a seat lasts while the staker stays.
      When `og-staying` is false, anyone can call `evict-og(staker)` and the
      cover goes back to the cap. Our keeper runs it, after that cycle's payout.
      A fresh stake below the cover shrinks the cover to the stake.
- [ ] Pyth budget starts at u0 (fee is u0 today). If Pyth turns on a fee, call
      `set-vault-pyth-fee-budget(ustx, .juice-sbtc-autoswap)` with at least 2x
      the fee (max 10 STX): the vault pays both verifies (its own mid and the
      market's). Set the budget BEFORE the fee goes live. Keep a small STX
      float in the vault.
- [ ] Finish reserve: `finish` keeps `pyth-fee-budget` in the vault for the
      next batch. Before the last `finish` on a vault you switch away from,
      set the budget to u0, so the reserve goes out with the batch.

## 3. Pillar autostake safe

Repo `Rapha-btc/pillar-wallets-xyz`, branch `main`, HEAD `611873c` (pushed). Nested checkout:
`~/projects/pillar/contracts/pillar-wallets`. Review:
`README-juice-autostake-safe-review.md` (accepted 2026-10-13).

| # | Contract name | Source path | Last commit | Clarity | Mainnet | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | `juice-autostake-safe-auth-helpers-v1` | `contracts/juice-autostake-safe-auth-helpers-v1.clar` | `2d136c1` (unchanged) | 4 | 404 | none |
| P2 | `juice-autostake-safe` | `contracts/juice-autostake-safe.clar` | `611873c` (set-keeper token lock, keeper reset on owner change) | 6 | 404 | J2 (`JUICE-SIGNER` literal), P1, `clarity-5-webauthn-v4`, `fakfun-wallet-core-v2`, `juice-safe-auth-helpers-v1` (all live) |

Post-deploy:

- [ ] `fakfun-wallet-core-v2.set-verified-contract(SPV9K21....juice-autostake-safe)`
      before any user copy onboards (`register-wallet` checks the canonical hash).
      The canonical hash changed with `611873c`: deploy bytes 51,552 (was
      51,419), sha512/256 of the template `1ef1627f...e1fab9bb` (was
      `094a2c58...7ed28548`). The BE pins no hash; core-v2 reads it on chain.

## 4. Partner deploys (not ours to broadcast)

| Who | Repo / branch | Contracts (order) | Clarity | Last commit | Mainnet | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| Friedger (Fast Pool) | `Rapha-btc/fastpool-pox-5` `rapha/fastpool-swap-vault`, PR fastpool/fastpool-pox-5#1 | `fastpool-swap-vault`, then `signer-manager-vault-stx-rewards` | 6 | HEAD `b719e87` (pushed): trait-v2 `d52910a`, F1 allowance `1e6fab3`, signer 96-cycle locks `3f82a93`, vault pays every Pyth verify + finish reserve `b719e87`. Vault `b719e87`, signer `3f82a93`. Pyth budget >= 2x fee, same finish-reserve rule as J3 | 404 | **J1** (ours, once for both pools), Jing 3 + 4, `rfq-sbtc-stx-jing-v2-3`. Doc: `docs/deploy-stx-rewards.md` section 11 |
| CityCoins DAO (MIA) | `Rapha-btc/citycoins-protocol` `feat/ccd015-redemption-book` | `ccd015-redemption-book-mia-stx`, then `ccd016-swap-vault-mia-v2`, enabled by a CCIP proposal | 5 | HEAD `8bfbb5f` (pushed): Pyth fee budget `b9ef5db`, fuel-fair-book reserve + F1 allowance `4940041`, fresh window on elapsed dust `8adfa68`, vault pays every Pyth verify `8bfbb5f`. ccd016 `8bfbb5f`, ccd015 unchanged. Pyth budget >= 2x fee | 404 (deployer `SP8A9HZ3...`) | Jing 3 + 4 (literals), base-dao, `ccd002-treasury-mia-rewards-v3` |

## Global order

1. Jing 1 to 8 with the Jing post-deploy calls. All 20 rungs seated before the
   ladder goes live.
2. J1 `juice-swap-vault-trait-v2`.
3. J2, J3, then `register-self`.
4. P1, P2, then core-v2 `set-verified-contract`.
5. Partners: fastpool (after J1 + Jing 4), MIA ccd015 + ccd016 (after Jing 4).

## Open before deploy

Done:

- [x] Router disabled-DLMM-pool fix: `f342615`. mv7dfb router fixes: `15aef66`.
- [x] trait-v2 migrations: juicestx `e954136`, fastpool `d52910a` (PR #1).
- [x] Vault Pyth fee budgets: juicestx `fa8c48a`, fastpool `b719e87`, citycoins
      `8bfbb5f`. The vault pays every verify: budget >= 2x oracle fee, set
      before the fee goes live, u0 before a vault switch's last finish.
- [x] mv7dfb fixes: OG rotate + shrink `fa8c48a`, safe keeper `611873c`,
      fastpool signer 96 cycles `3f82a93`, ccd016 dust window `8adfa68`.
- [x] faktory-dao templates refreshed and byte-verified: `d0b27773`, `341da272`.
- [x] faktory-dao mv7dfb template refresh (router, J2, J3, P2): byte-verified,
      pushed `77d9ba48`. All 13 deploy strings audited: comment-free,
      `clarinet format`-ed (market de-indented, 97,701 B), equal to the final
      sources. Rungs: send `contractName` with `-v1`.

Still open:

- [ ] Ladder `set-canonical("buy-band" / "sel-band")` before any rung `initialize`.
- [ ] Owner keys: move the core-v6 owner, ladder owner, market operator and RFQ
      operator to a multisig with distinct cosigners.
- [ ] ccd016 `STX_FAIR_BOOK` is still relative `.ccd015-redemption-book-mia-stx`.
      Partner's call; we skip it.
- [ ] Audit bounty `mv7dfb43df5505479788` (10k) on the final bytes, open
      until 2026-10-20.
- [ ] Launch before cycle 146 (burn 972,650).
