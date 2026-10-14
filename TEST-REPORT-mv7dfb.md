# Pre-deploy test report: bounty mv7dfb deploy set

## Status at a glance

All runs are on the final deploy bytes unless a row says otherwise.
"Pass" counts are checks passed / checks run. Details are in sections 2-7.

| Component | Stxer sims (fork) | Clarinet tests, branches | Rendezvous | Open items |
|---|---|---|---|---|
| Jing market v6-3 | deploy set 341/341; 44 jing-contracts-v3 harnesses green, only the 2 legacy rung harnesses fail (e.g. full-side 921/921, submit-settle 898/898, errors-admin 514/514) | 338/338, 845/847 (99.76%) | 12,000 trials, 0 failed | None. 2.3 KB under the size cap |
| Router v5-3 | smart 588/588, manual 410/410, pool-pick 225/225, steer 60/60, limit-pick 38/38, core-migration 65/65 | 490/490, 275/276 (99.64%) | 2 x 1000 inv + 2 x 3000 props, 0 failed | LOW rounding: up to 1 base unit under `limit-price` (not fixed) |
| Core-v6 + ladder | core-admin 149/149, ladder-admin-seats 334/334, gaps 455/455 | 95/95; core 163/164 raw, ladder 61/61 (100% after 2 exceptions) | ladder-v1 stack: 2 x 1500 inv + 2 x 3000 props, 0 failed | None |
| Rungs buy + sell | rungs 998/998, rungs + ladder + dispatch 559/559, audit-tail 182/182 | 118/118; 155/157 raw each (100% after exceptions) | in the ladder-v1 stack, 0 failed | None |
| Dispatch | v6-3-dispatch 228/228, deploy set | in the 118/118 run; 40/40 | in the ladder-v1 stack, 0 failed | None |
| Juice pool sbtc signer | 25 juicestx harnesses green on `570226c` bytes (e.g. accounting 126/126, pay-fees 299/299, recovery 190/190) | 135/135 at `570226c`; pool 115/115 | pool `570226c`: 2 x 2000 with zero stakes on and off, 0 failures (`9b28e1e`) | RV zero-seat finding fixed in `570226c` |
| juice-sbtc-autoswap vault | vault-fixes 218/218, pyth-fee 58/58, recovery matrix 534/534 x 5 | autoswap 150/150 | vault 2 x 2000, 0 failures | None |
| Autostake safe (`7724b0d`) | deploy set 341/341, REAL_POOL 87/87, main 86/86 (RV-F1), ops 208/208, passkey 50/50 | 153/153; 231/235 (98.30%); vitest 52/52 | `7724b0d`: 12 inv + 14 props, seeds 1 and 2, 2000 / 10000 runs, PASS; RV-F1 refused 7/7 in the quick `RV_ALLOW_F1` run (`1fc75c8`) | FE copy + hash + 4th arg before `AUTOSTAKE_LIVE` |
| Fast Pool vault + signer | 255/255 vault-fixes, lifecycle 42/42, deploy set; recovery matrix 574/574 on repo source | 317 assertions; vault 138/150 (92.0%), signer 85/91 (93.4%) | 1500 x 2 inv, 2000 x 2 props, pass; 3 mutants caught | Recovery matrix on deploy bytes: in progress (other session) |
| ccd015 / ccd016 | 18 sims, all on the final bytes (checked by decoding the deploy txs) | ccd016 313 checks; 118/119 (99.16%) | ccd016 16 inv + 10 props, 2 x 1000, 0 failed; ccd015 500 runs (2026-09-15) | `STX_FAIR_BOOK` relative name (partner's call) |

### Open before deploy

- stx-juice-fe: regenerate the safe copy and `JUICE_AUTOSTAKE_SAFE_CANONICAL_HASH`
  (`cdb7c603...732a7a97`) from the template, and pass `signer-calldata` in
  the stake calls. Blocker before `AUTOSTAKE_LIVE`.
- Fast Pool: rerun the `_vault-recovery-v6-3.mjs` matrix on the deploy
  bytes. In progress in another session.
- pillar-wallets: commit `tests/juice-autostake-safe-cross-safe-replay.test.ts`
  (part of the 52/52 run, still untracked).
- Router LOW rounding finding (RV): accept or fix. `min-out` still binds.
- From DEPLOY-PLAN: ladder `set-canonical` before any rung `initialize`;
  owner keys to a multisig with distinct cosigners; launch before cycle 146
  (burn 972,650).
- Closed in this pass: pool-pick-steer #35 (harness fix, 60/60); limit-pick,
  core-migration and the three "patched" market sims rerun on the deploy
  bytes; juicestx autostake-e2e, pay-batches, pay-fees and allowance proof
  rerun on the deploy bytes; the deploy set rerun on the `7724b0d` safe;
  pillar coverage copy regenerated from `7724b0d` (153/153); RV rerun on the
  `7724b0d` safe (pillar `1fc75c8`) and on the `570226c` pool (juicestx `9b28e1e`).

Date: 2026-10-14. Nothing here is deployed. This report collects the test
results for the deploy set in [DEPLOY-PLAN.md](DEPLOY-PLAN.md). It only
repeats numbers that are written in result files, READMEs or commit
messages. A number that was not found is marked "not recorded".

Sources: `simulations/fixtures/*result*.json`,
`simulations/fixtures/coverage-mv7dfb-sims.txt`,
`simulations/COVERAGE-PLAN-mv7dfb.md`, `simulations/TRACE-COVERAGE-mv7dfb-*`,
the unit suite COVERAGE files, the partner repo result folders and READMEs,
and the commits of 2026-10-13/14 in all six repos.

## 1. Scope

17 distinct deploy byte files. The 20 rungs use two of them (10 names each),
so the set is 35 contract deployments. The exact bytes are in
[`simulations/deploy-bytes-mv7dfb/`](simulations/deploy-bytes-mv7dfb/) with
[`SHA256SUMS.txt`](simulations/deploy-bytes-mv7dfb/SHA256SUMS.txt). The
faktory-dao templates come from `backend` commit `77d9ba48` (2026-10-14,
"refresh Juice pool, autoswap, autostake safe, router v5-3 deploy bytes",
old templates reproduced byte for byte from their old sources first). The
pool template was refreshed again in `459fa786` (juicestx `570226c`,
zero-seat guard; the `fa8c48a` template reproduced byte for byte first).

Deploy forms:

- **template**: faktory-dao BE template. Comments stripped and
  `clarinet format`-ed.
- **template, de-indented**: the market only. Comments stripped and
  de-indented, NOT `clarinet format`-ed, to fit under 100,000 bytes.
- **partner, byte for byte**: the Fast Pool repo file at its final commit.
- **partner, comment lines dropped**: the CityCoins repo file with full-line
  comments dropped (the form every ccd016 harness deploys).

| # | Contract | Repo / final commit | Clarity | Bytes | SHA-256 | Form |
|---|---|---|---|---|---|---|
| 1 | `jing-core-v6` | jing-contracts-v3 `ac23d0a` | 5 | 37,147 | `973482e4...3ea7fdff` | template |
| 2 | `jing-ladder-v1` | jing-contracts-v3 `741de17` | 5 | 11,742 | `6a5e204d...d10d0dd7` | template |
| 3 | `markets-sbtc-stx-jing-v6-3` | jing-contracts-v3 `ada49d8` | 5 | 97,701 | `7b2f0f44...132f5f4c` | template, de-indented |
| 4 | `swap-router-sbtc-stx-jing-v5-3` | jing-contracts-v3 `15aef66` | 5 | 33,216 | `3e457866...f8e3b9b4` | template |
| 5 | `jing-rung-deposit-trait` | jing-contracts-v3 `c018402` | 5 | 409 | `5979727e...7bb1e385` | template |
| 6 | `jing-buy-stx-core-spread-v1` (as `jing-buy-stx-spread-0..90`, 10 names) | jing-contracts-v3 `d8b01e4` | 5 | 22,445 | `0a863967...c4e89bd6` | template |
| 7 | `jing-sell-stx-core-spread-v1` (as `jing-sell-stx-spread-0..90`, 10 names) | jing-contracts-v3 `d8b01e4` | 5 | 22,423 | `7fb80650...8c0bac9f` | template |
| 8 | `jing-ladder-dispatch` | jing-contracts-v3 `a4939ec` | 5 | 9,289 | `25858ef6...1fe3cabd` | template |
| 9 | `juice-swap-vault-trait-v2` | juicestx `e954136` | 6 | 2,116 | `655b22cb...c4a50657` | template |
| 10 | `juice-pool-sbtc-signer` | juicestx `570226c` | 6 | 34,134 | `a0a28431...ca56195a` | template |
| 11 | `juice-sbtc-autoswap` | juicestx `fa8c48a` | 6 | 22,854 | `ff0a4586...a5909033` | template |
| 12 | `juice-autostake-safe-auth-helpers-v1` | pillar-wallets `2d136c1` | 4 | 593 | `aabf3ba3...fa61bd70` | template |
| 13 | `juice-autostake-safe` | pillar-wallets `7724b0d` (signer-calldata `99d69e8`, RV-F1 fix `7724b0d`); faktory-dao template `d566bbc3`; deploy-bytes commit `8b4816a` | 6 | 51,812 | `599192e3...872c2500` | template |
| 14 | `fastpool-swap-vault` | fastpool-pox-5 `b719e87` | 6 | 28,375 | `aaebf34b...8101fdac` | partner, byte for byte |
| 15 | `signer-manager-vault-stx-rewards` | fastpool-pox-5 `3f82a93` | 6 | 41,593 | `4858dbc6...07d4a731` | partner, byte for byte |
| 16 | `ccd015-redemption-book-mia-stx` | citycoins-protocol `8bfbb5f` (book unchanged) | 5 | 12,641 | `6b5daed3...3721df57` | partner, comment lines dropped |
| 17 | `ccd016-swap-vault-mia-v2` | citycoins-protocol `8bfbb5f` | 5 | 22,427 | `a7062d39...28fa48c6` | partner, comment lines dropped |

The full SHA-256 values are in `SHA256SUMS.txt`. The Clarity versions are
the ones the deploy-set harness sends (`deploy-set-mv7dfb-result.json`).
Other recorded hashes: the safe canonical hash (sha512/256 of the template)
is `cdb7c603...732a7a97` (full: `cdb7c6036368ba0bebd0c91539df7aa3543daa25443754a961a575ff732a7a97`;
was `1ef1627f...e1fab9bb` on the `611873c` bytes). The deploy-set run reads it
from core-v2 on the fork and checks it. The deploy-set result also records
the sha512/256 of every row.

## 2. Stxer mainnet-fork simulations

Stxer link form: `https://stxer.xyz/simulations/mainnet/<id>`. "Deploy
bytes = yes" means the sim deployed the exact files of section 1. Most
reruns of 2026-10-14 used `_use-deploy-bytes.mjs`, a `node --import`
preload that makes an unedited harness read the deploy-bytes file. The full
run list is `simulations/fixtures/coverage-mv7dfb-sims.txt`. All runs below
are dated 2026-10-14 unless the row says otherwise.

### 2.1 Integrated deploy-set harness

| Harness | Covers | Pass | Stxer | Deploy bytes | Date |
|---|---|---|---|---|---|
| `verify-deploy-set-mv7dfb.js` | All 35 deployments in DEPLOY-PLAN order, then: Juice pool OG seats, hop, evict, 1 STX shrink, 3 reward batches (fee 0, fee u10, recovery); safe canonical hash `cdb7c603...732a7a97` read from core-v2 and checked; the canonical safe stakes with signer-calldata "telegram" and the pool's `validate-stake` print carries `(signer-calldata (some 0x74656c656772616d))`; keeper restake; tampered copy refused; passkey transfer resets the keeper; Fast Pool 96-cycle lock and finish reserve; ccd016 8adfa68 dust window; router limit-aware pick (scan 100% to 120%) and core-migration skip. Fork 9210211, burn 971469 | **341/341** | `b220ceefc481c57434c580280ee4d554` | yes (safe `7724b0d` bytes, pool `570226c` bytes) | 2026-10-14 |

The RV-F1 path needs an inactivity recovery (52,560 burn blocks), so the
deploy-set run does not repeat it. It is proven on the same safe bytes in
pillar `simul-juice-autostake-safe.js` 86/86 (section 2.4).

Earlier runs, kept for the record[^ds]:

[^ds]: 340/340 `20c428624713b6c452cfce5c5ed890db` (safe `611873c` bytes, pool
    `570226c`); 340/340 `de9bd7b811577d3e5c0f2100dfa023c1` (pool `fa8c48a`,
    Clarity 6 rows sent as version 6); 340/340 `5cf1573f3f04fe514d9c671a6914aff7`
    (first run, Clarity 6 rows unversioned).

Fixtures in that run (from the result file): pox-5 reward rows for cycles
142, 143, 144 (pool) and 144 (Fast Pool), set by Eval; the live Lazer oracle
fee set to u10 by Eval; base-dao `set-extensions` for ccd016 and a sim-only
proposal proxy.

### 2.2 jing-contracts-v3

| Harness | Covers | Pass | Stxer | Deploy bytes | Date |
|---|---|---|---|---|---|
| `verify-coverage-mv7dfb-gaps.js` | Every core-v6 `log-*` entry, Juice setters / refloor / recovery arms, Fast Pool recover edges, read-only sweeps by tx | 455/455 | `234ae5bcda75c9df2015f4239fb276db` | yes | 10-14 |
| `verify-coverage-mv7dfb-gaps2.js` | Second gap pass: rung no-reserve arm, market walk err arms, router active bin < 29, pool settle-one err, Fast Pool clock / zero shares | 115/115 | `fb581245dabe96e2914a00d5d2bbb0b2` | yes | 10-14 |
| `verify-coverage-mv7dfb-ccd015.js` | ccd015 book on the deploy bytes, read-only sweep | 183/183 (first run 168/168, `cfb2ec16...`) | `78d08113b634d1f65e607881212cd62a` | yes | 10-14 |
| `verify-coverage-mv7dfb-fastpool.js` | Fast Pool vault + signer on the deploy bytes | 154/154 | `4577cbf210b3f95bd430859c65c451f4` | yes | 10-14 |
| `verify-coverage-mv7dfb-fastpool.js` (native-price session) | rfq native price fallback at the fork tip | 20/20 | `f959481db16642bbd42711a12b153217` | yes | 10-14 |
| `verify-router-v5-3-limit-pick-mv7dfb.js` | Zealous Citadel repro: PROD = router `f342615`, NEW = router deploy bytes (preload). Pick u2 -> u1, +9.05% at block 9203637, +8.43% at 9207942 | 38/38 | NEW `80b820f4f6ff2257aabfa0be914fba18`, `101c85a53513fbb4e555ad85b75fbd5c`; PROD `b5bc781d...`, `a40e8216...`[^lp] | yes (NEW side) | 10-14 |
| `verify-router-v5-3-core-migration-mv7dfb.js` | Giant Moth 01: Bitflow `migrate-pool` on the fork; old router (`f342615`) reverts u2001, new router (deploy bytes) skips the migrated pool. Block 9207954 | 65/65 | new `213aaf3a2125258aba143af30e9f2541`, old `dc78c721...`[^cm] | yes (new side) | 10-14 |
| `verify-v6-3-dispatch.js` | core, ladder, market, trait, rungs, dispatch; no router | 228/228 | `3b5a8e21c069ff914f72a14008b06659` (master, 3dd1d2e); preload rerun `33c70bfa...` 228/228 | preload run: yes | 10-14 |
| `verify-v6-3-deploy-bytes.js` | Deploy of the byte files | 17/17 | `34add6e3e280af40acbc7e910dc1423f` | yes | 10-14 |
| `verify-router-v5-3-smart.js` | Smart router paths | 588/588 | `3cae36d9...`, `6c1285d8...`, `7edc890f...` | yes | 10-14 |
| `verify-router-v5-3-manual.js` | Manual router legs | 410/410 | `0d66c62de411c83111af9dfd996afead` | yes | 10-14 |
| `verify-router-v5-3-pool-pick.js` | DLMM pool pick | 225/225 | `526537fa97d469535ef623754db9dd93` | yes | 10-14 |
| `verify-router-v5-3-pool-pick-steer.js` | Pick steering: the deploy-bytes router keeps the leg on v-1 (36 checks), 1063add contrast (24 checks). Check #35 fixed: the smart limit is now computed from v-1 read AFTER the 1M-sat manual sale | **60/60** | `cb36bd72b62572e87476c0bdf6e8c204` (deploy-bytes router), `b1a4be8469feed3d40fb8b2a2aacdd88` (1063add)[^st] | yes | 10-14 |
| `verify-router-v5-3-xyk-snapshot.js` | XYK snapshot read | 75/75 | `f793659c2a5633c055202303a7db020a` | yes | 10-14 |
| `verify-router-v5-3-rebate-age.js` | Rebate by print age | 482/482 | `c63880c2...`, `c691ce10...` | yes | 10-14 |
| `verify-v6-3-router-bin-boundary.js` | DLMM bin boundary, no VM panic | 26/26 | `0650bd79c3b38e496217036d856b891a` | yes | 10-14 |
| `verify-v6-3-router-impact.js` | Router impact, x and y sides, baseline diff 0 | 398/398 | `d05eaf98...` (x), `09bad98f...` (y) | yes | 10-14 |
| `verify-v6-3-caller-impact.js` | Caller impact | 198/198 | `1576f5bcbcf845af2020e088cfb710d8` | yes | 10-14 |
| `verify-v6-3-settlement-edges.js` | Settlement edges | 365/365 | `27d02561b682a2070115046c8cfa965e` | yes | 10-14 |
| `verify-v6-3-errors-admin.js` | Error and admin arms | 514/514 | `2b0436de3bb97ba8e9d7b8a05b5e81e0` | yes | 10-14 |
| `verify-v6-3-swap-walk.js` | Book walk on swap | 383/383 | `6af504a8b58f2d531434b43c668bd6ea` | yes | 10-14 |
| `verify-v6-3-gate-blind-band.js` | Blind band gate | 332/332 | `6d426b0f0e75043464778a7e2f4c2b94` | yes | 10-14 |
| `verify-v6-3-capacity.js` | Taker capacity | 473/473 | `d72ffae1ea3a2864aa30b5cd988f726a` | yes | 10-14 |
| `verify-v6-3-capacity-hint.js` | Capacity hint | 33/33 | `71ec6fc583b9a2d96aa3a5392e3a3802` | yes | 10-14 |
| `verify-v6-3-refund-costs.js` | Refund costs | 289/289 | `54912c2f59271297b01a47d08b4ae8e6` | yes | 10-14 |
| `verify-v6-3-full-side.js` | Full side | 921/921 | `d15c235833ceaf76f9ab6135c42b6663` | yes | 10-14 |
| `verify-v6-3-submit-settle-lazer.js` | Submit + settle on Lazer | 898/898 | `c65fd85521eca1fc50da3460adb086d3` | yes | 10-14 |
| `verify-v6-3-oracle-feeds.js` | Oracle feeds | 97/97 | `e7f75295f4b50a4e959ceb452bce3845` | yes | 10-14 |
| `verify-v6-3-reachable-gaps.js` | Reachable gaps | 382/382 | `a674afe92adac3b9282b9b418ccda5c1` | yes | 10-14 |
| `verify-v6-3-cancel-orphan-pending.js` (patched mode) | Orphan pending cancel | 225/225 | `9857aa866216ef6eeb9ed72455d09fae`[^pt] | yes: market, core, ladder are deploy bytes | 10-14 |
| `verify-v6-3-ghost-deposit.js` (patched mode) | Ghost deposit | 343/343 | `b382fe53a64623f776244b7364a30f38`[^pt] | yes: market, core, ladder are deploy bytes; the minimal band rung is a sim fixture | 10-14 |
| `verify-v6-3-switched-off-ask.js` (patched mode) | Switched-off ask | 221/221 | `37871f1625eab67569623222a6574ef6`[^pt] | yes: market, core, ladder are deploy bytes | 10-14 |
| `verify-core-v6-admin.js` | Core admin | 149/149 | `584b4ed51c99da23b49c872935b624fe` | yes | 10-14 |
| `verify-ladder-v1-admin-seats.js` | Ladder admin and seats | 334/334 | `8e95fe5889dd8a5c7ff555cf88cd8723` | yes | 10-14 |
| `verify-v1-core-spread-rungs.js` | Rungs | 998/998 | `387017eca52ccc09f8c12e57ab7c98b7` | yes | 10-14 |
| `verify-v1-core-spread-ladder-dispatch.js` | Rungs + ladder + dispatch | 559/559 | `170b7df3a14544bfaff6c9ea590df68f` | yes | 10-14 |
| `verify-v1-small-proceeds.js` | Small proceeds | 77/77 | `fe01ec23d5e54fdc41c8c7ebf5e59b35` | yes | 10-14 |
| `verify-v6-rungs-keyless.js` | Rungs keyless, 4 variants (buy, sell, buy-peg, sell-peg) | 39/39, 39/39, 42/42, 42/42 | `7a5d15a9...`, `76ae817d...`, `2a6ab8f9...`, `120bc743...` | yes | 10-14 |
| `verify-v6-rungs-replace-keyless.js` | Rung replace | 250/250 | `1a4fe982485021b452f1734c39ec634c` | yes | 10-14 |
| `verify-v6-rungs-push-lazer.js` | Rung push on Lazer | 124/124 | `227a39690ee6eb2609bc52ab40045f30` | yes | 10-14 |
| `verify-v6-rungs-fill-lazer.js` | Rung fill on Lazer | 85/85 | `613d6d045474cecbd09d1f902c9fd658` | yes | 10-14 |
| `verify-v6-rungs-miner-band-lazer.js` | Miner band | 225/225 | `9f01abe49571a17c20999534c9683ca1` | yes | 10-14 |
| `verify-v6-rungs-escrow-timeout.js` | Escrow timeout | 549/549 | `18ac074b5eeb18d0d74825888ed40dbe` | yes | 10-14 |
| `verify-v6-rungs-audit-tail.js` | Audit tail on the two deploy-set rungs (core-spread-v1 buy + sell): drift under MINT_FLOOR rescales and a newcomer joins (no u7013); a >99.9% fill makes `sync` roll the tail (epoch +1, index = SCALE, shares/members 0, order off the market), the newcomer opens the fresh epoch 1:1, closed members take reserve + proceeds exactly (dispatch + claim), nothing left over | 91/91 buy, 91/91 sell (182/182) | `034ac44310314ff27a485205e39c07f0`, `ae252375e9dd0007ac9f15f79455a9b3` | yes | 10-14 |
| `verify-rung-withdraw-rounding.js`, `verify-rungs-keyless.js` | Legacy contracts, not in the deploy set | FAILED at deploy (unresolved / duplicate contract) | `35d6c1e9...`, `50bea07a...`, `864eab88...` | n/a | 10-14 |

[^lp]: Earlier run on the repo source: prod `c5d4ca0d...`, patched `9feff563...`;
    prod `9ed2b05e...`, patched `9a115d21...`, 38/38. Same picks and outputs.
[^cm]: Earlier run on the repo source: old `d5f7ff94...`, new `e16126da...`, 65/65.
[^st]: Earlier run: 34/35 `2915ed46336489f775aa48ea4d5f0b77`. Check #35 was a
    harness error: the smart limit came from v-1's price before the 1M-sat
    manual sale moved v-1, so v-1 had no capacity inside it. Fixed in the
    harness, not in a contract.
[^pt]: "Patched" is the harness name for the fixed market (the working tree),
    against the "prefix" (pre-fix) market. With `_use-deploy-bytes.mjs` the
    patched market is the 97,701-byte deploy file, deployed under sim names
    (`orphan-my`, `ghost-mx`, `swoff-my`, ...). The harness does not edit the
    market text (`fit()` changes only files >= 100,000 bytes). Earlier runs:
    `28ba3ce9...`, `8854dace...`, `94d5f0c9...`, same counts.

### 2.3 juicestx

Result files: `juicestx/simulations/results/pool-vault-stx/*.json`. Their
`sourceHashes` match the deploy bytes except where the row says no. The
pool-deploying rows below were rerun on the `570226c` pool bytes
(`a0a28431...`) and are committed in juicestx (OG + accounting result files);
the earlier `fa8c48a`-bytes reruns are in `cbbb6f6`.

| Harness | Covers | Pass | Stxer | Deploy bytes | Date |
|---|---|---|---|---|---|
| `pool-og-seats-stxer.mjs` | OG seats | 49/49 | `159f73303c06a395f2713bcf153a777d` | yes | 10-14 |
| `pool-og-cap-stxer.mjs` | OG cap and fee | 47/47 | `1152d49a6b444b27aca0bb780baf0bfd` | yes | 10-14 |
| `pool-og-evict-stxer.mjs` | `og-staying` / `evict-og` (Patient Reed) | 69/69 | `a25807fb09d6e81b5b1597e2c4f91b8c` | yes | 10-14 |
| `pool-og-shrink-stxer.mjs` | Fresh small stake shrinks the cover; 0-uSTX fresh stake after the lock ended (node refuses: `PoxInvalidLockAmount`, seat kept; the accepted branch asserts seat deleted + og-seats decremented) | 58/58 | `3abedcde880eb6ca558039f937950cd5` | yes | 10-14 |
| `pool-accounting-stxer.mjs` | Pool accounting | 126/126 | `9ed500dacb665d5ebd5464db45f76e20` | yes | 10-14 |
| `pool-claim-guards-stxer.mjs` | Claim guards | 24/24 | `161efa05e04d48e79b09e3382542b231` | yes | 10-14 |
| `pool-admin-handover-stxer.mjs` | Timed admin handover | 60/60 | `5cb2d9520f6446ba445e7264e2c0635a` | yes | 10-14 |
| `pool-autostake-e2e-stxer.mjs` | Pool pays the safe, keeper restake; safe `7724b0d` bytes (stake call takes the 4th arg `signer-calldata none`) | 63/63 | `23732d55dfc70ab9e82f4d0a0a6111cd`[^je] | yes (safe `599192e3...`, helpers `aabf3ba3...`) | 10-14 (juicestx `cd52afc`) |
| `pool-pay-batches-stxer.mjs` | Rare Io I1, new vs old side by side; NEW = pool `570226c` deploy bytes (`NEW_SOURCE_FILE`) | 166/166 | `a430d1411dc124f02fe66de34851d54f`[^jp] | yes (NEW side) | 10-14 (`cd52afc`) |
| `pool-pay-fees-stxer.mjs` | Rare Io I2, new vs old side by side; NEW = pool `570226c` deploy bytes | 299/299 | `3b6746ebb0c4d7de0c0bac38bd6d1c64`[^jp] | yes (NEW side) | 10-14 (`cd52afc`) |
| `pool-vault-stx-stxer.mjs` (deployment guards) | Deploy and guards | 22/22 | `43777d34e60227d3ecb34c69cc1beb26` | yes | 10-14 |
| `pool-vault-stx-stxer.mjs --maker` | Maker fill | 35/35 | `6219fbc1d33983a68687f5d31213566b` | yes | 10-14 |
| `pool-vault-stx-stxer.mjs --jing-router` | Router Jing fills | 46/46 | `464ab9219701018f2893d7195cf59eaa` | yes | 10-14 |
| `pool-vault-stx-stxer.mjs --jing-take` | Admin Jing take | 41/41 | `e245dac14e7097c5ee37e6bb46afad85` | yes | 10-14 |
| `pool-vault-stx-stxer.mjs --split-pyth` | Manual split with Pyth | 42/42 | `ac80191926fc12c91c440b9a75bc7099` | yes | 10-14 |
| `pool-vault-stx-stxer.mjs --lifecycle` | AMM liquidation (pinned block 9208593) | 41/41 (earlier `29fd3d16...` on fa8c48a bytes; tip 9208879 was 30/38: DLMM depth too thin, chunk 1 filled 330 sats, chunk 2 u16047) | `f18fcd192e0115ca1f2acfb2a97a0144` | yes | 10-14 |
| `pool-vault-fixes-stxer.mjs` | Vault fixes | 218/218 | `cfbf7abf2caeb6e1926d16938449add1` | yes | 10-14 |
| `pool-vault-pyth-fee-stxer.mjs` | Pyth fee u10, vault pays both verifies, finish reserve | 58/58 | `2c27e137d606fa8cae1ee3c2b0672b63` | yes | 10-14 |
| `pool-vault-mismatch-stxer.mjs` | Vault mismatch | 29/29 | `f34c83803609d3af817e013ff1235adb` | yes | 10-14 |
| `pool-vault-upgrade-stxer.mjs` | Vault rotation | 97/97 | `db6eb6da6fd311937ee312ed51a862eb` | yes | 10-14 |
| `pool-vault-emergency-stxer.cjs` | Emergency DIA swap | 27/27 | `b9e338f712e8c284e66a460f58c349b1` | yes | 10-14 |
| `pool-vault-emergency-stxer.cjs --native` | Emergency native fallback | 37/37 | `caaa821231aad766b0553a3d22a5226e` | yes | 10-14 |
| `pool-vault-recovery-stxer.mjs` | Four-batch recovery continuity, pinned at block 9207370 | 190/190 | `86f2e948eab30212602aa1e75c27d7d1` | yes | 10-14 |
| `pool-vault-recovery-stxer.mjs --matrix` | Recovery matrix, 5 sessions | 534/534 each | `59609a5f...`, `7264b553...`, `8910961e...`, `e243ffee...`, `eb885c9b...` | yes | 10-14 |
| `vault-allowance-proof-stxer.mjs` | Allowance terms, 4 cases as expected (24/24 setup steps). The term pattern now ignores whitespace, so it runs on the deploy bytes. Comment-stripped + `clarinet format` repo source reproduces the pool, vault and trait deploy sha256 exactly | passed (4/4 cases) | `783ca0c1f687ebc7c473d0ab560c17d2`[^ja] | yes | 10-14 (`cd52afc`) |

[^je]: Earlier 63/63 `6ddeb669...` read the pillar working copy with a
    3-arg stake call, so it ran older safe bytes.
[^jp]: Earlier runs on pre-`fa8c48a` pool hashes: 166/166 `9a28245b...`,
    299/299 `3009eb74...`.
[^ja]: Earlier run on the commented repo source: `5bcca46c...`, passed.

### 2.4 pillar-wallets (autostake safe)

All rows run the safe deploy bytes at `7724b0d` (51,812 B, `599192e3...`),
through `_use-deploy-bytes.mjs` (pillar `28bfb48` and the rerun below).

| Harness | Covers | Pass | Stxer | Deploy bytes | Date |
|---|---|---|---|---|---|
| `simul-juice-autostake-safe.js REAL_POOL=1` | Main safe harness against the real `juice-pool-sbtc-signer` `570226c` deploy bytes (register-self with a real pox-5 grant), incl. keeper reset and the RV-F1 step | 87/87 | `50de1e4ae75471c76f55673211c0be2c`[^pw] | yes (safe + pool) | 10-14 (pillar `8102212`) |
| `simul-juice-autostake-safe.js` | Same scenarios against the live `juice-pool-stx-signer` stand-in, incl. keeper reset after 52,610 burn blocks, and RV-F1: a transfer to OWNER proposed before the idle period names the owner after recovery; the passkey confirm is refused u4001 and OWNER stays admin | 86/86 | `36669f5e320a5811e0e9c0218cfe61b8` | safe yes (pool stand-in) | 10-14 (pillar `28bfb48`) |
| `simul-juice-autostake-safe-ops-coverage.js` | 17 public functions the main harness misses; section F zero-fee gas station | 208/208 | `2333f897b10606d208ee3c03a460f1b2` | yes | 10-14 (`28bfb48`) |
| `simul-juice-autostake-safe-stake-passkey.js` | Passkey stake / update / unstake, token lock, replay; signer-calldata: (some "telegram") on one stake (A8) and one update-stake (A10), and the pool's `validate-stake!` print carries exactly that value for pox-5 stake and stake-update (`37ce0c7`) | 50/50 | `1d74d1bc1b2227500a7a270b94f49a38` | yes | 10-14 (`28bfb48`) |

[^pw]: Earlier runs on the `611873c` safe bytes: REAL_POOL 83/83 `d3222b84...`,
    stand-in 82/82 `837734f0...`, ops-coverage 208/208 `5d9897ba...` (204/204
    before section F, `b6fd12bd...`), stake-passkey 43/43 `d508603d...`. On the
    `99d69e8` bytes (51,742 B, before RV-F1): stake-passkey 50/50 `8881fb12...`,
    ops-coverage 208/208 `c1e4997e...`.

### 2.5 citycoins-protocol (feat/ccd015-redemption-book)

Result files: `simulations/results/ccd016-v2/*.json`. All reruns are on
the deploy bytes (commit `986c682`).

| Harness | Covers | Pass | Stxer | Deploy bytes | Date |
|---|---|---|---|---|---|
| `stxer-ccd016-v2-happy-path.js` | Three batches, patience fill, router sale | 58/58 | `542564285a8d1e019cce3e56bca984f1` | yes | 10-14 |
| `stxer-ccd016-v2-coverage.js` | DAO dials, splits, cooldown, read-onlys | 104/104 | `8a2c60ccb0090372e5efe1936eecd288` | yes | 10-14 |
| `stxer-ccd016-v2-parked.js` | Vault parked on the book | 136/136 | `e3f21dae64459178ef9acfaaa9d3d3a7` | yes | 10-14 |
| `stxer-ccd016-v2-clock-keyless.js` | Clock alone, incl. 8adfa68 dust window (S8, S8d) | 101/101 | `36b4f87ed7d299e745091c2e0437e71d` | yes | 10-14 |
| `stxer-ccd016-v2-fixes.js` | Bounty fixes, fresh window on elapsed dust | 96/96 | `75f1cd1332180df923897516c09cfe72` | yes | 10-14 |
| `stxer-ccd016-v2-pyth-fee.js` | Pyth fee, vault pays every verify | 70/70 | `3c99bc1ed9d17a2873bd02f196fb967a` | yes | 10-14 |
| `stxer-ccd016-v2-emergency.cjs` | Emergency DIA | 45/45 | `e58d43d1da203387034bfa30d1c987a9` | yes | 10-14 |
| `stxer-ccd016-v2-emergency.cjs --native` | Emergency native | 48/48 | `b18edad11f9c78d141804d7f333334a6` | yes | 10-14 |
| `stxer-ccd016-v2-emergency.cjs --recovery`, 10 modes | none / pending / resting / parked / pending+resting, each by public and by DAO | 97, 97, 112, 112, 101, 101, 130, 130, 124, 124 (all green) | `4d1bb9ef`, `58724eb0`, `7668f859`, `523e3e7d`, `486a08d0`, `e8c0247d`, `5a727d6d`, `35d275ea`, `0d61fa25`, `2f47455f` (8-char prefixes; full ids in coverage-mv7dfb-sims.txt) | yes | 10-14 |

ccd015 also runs in `verify-coverage-mv7dfb-ccd015.js` (183/183, section
2.2) and in the deploy-set harness.

Checked again on 2026-10-14: the deploy transactions of all 18 sims above
were pulled from stxer, decoded and hashed. ccd015 (`6b5daed3...`), ccd016
(`a7062d39...`), jing-core-v6, jing-ladder-v1, market v6-3 and router v5-3
are the final deploy bytes in every one. The only other code is sim
fixtures (a DAO proposal proxy, a base-dao patch that accepts the vault).
ccd015 and ccd016 are unchanged from `8bfbb5f` to HEAD (`f4c5130`). The 10
recovery modes are saved together in `simulations/results/v6-3-recovery/citycoins.json`
(1128/1128).

### 2.6 fastpool-pox-5 (rapha/fastpool-swap-vault)

| Harness | Covers | Pass | Stxer | Deploy bytes | Date |
|---|---|---|---|---|---|
| `pool-vault-stx-stxer.mjs` | Deploy and guards | 34/34 | `59cdc203b48523c12bfd7895b087a592` | yes | 10-14 |
| `pool-vault-stx-stxer.mjs --maker` | Maker fill | 36/36 | `ad49570eedfcb1d8b60fff911323cf90` | yes | 10-14 |
| `pool-vault-stx-stxer.mjs --lifecycle` | Lifecycle / liquidation | 42/42 | `381225159535fe5344a443aad23202de` | yes | 10-14 |
| `vault-fixes-stxer.mjs` (l1, l2d6, d7, pf) | L-1 partial sale; L-2 window cap + dust batch; #7 market dust; Pyth fee + finish reserve | 51/51, 46/46, 80/80, 78/78 (255/255) | `ec16a3f8...`, `1599af88...`, `6f30d6e2...`, `40bee8c0...` | yes | 10-14 |
| `dust-vaults-stxer.mjs` | Dust in the vaults | 69/69 | `b95238c0662a8c7755f0c64bdd96f503` | yes | 10-14 |
| `dust-1sat-stxer.mjs` | 1-sat dust | 23/23 | `41c6aa11080dcebe6fe24cabc216416d` | yes | 10-14 |
| `dust-router-stxer.mjs` (2 passes) | Measurement only: 1-2 sats unsold, 3 sats and up sell | no checks | `54f0da53...`, `41a52fa1...` | yes | 10-14 |
| `_vault-recovery-v6-3.mjs` matrix | Recovery matrix, 5 sessions | 574/574 | `65c78704...`, `c4403aee...`, `0c1d27b1...`, `d1088899...`, `be1311f4...` | no (repo source hashes): **in progress (other session)** | 10-14 (b719e87) |

## 3. Stxer trace coverage on the exact deploy bytes

Tool: `node simulations/coverage-mv7dfb.mjs` (`trace-coverage-multi.mjs`).
A sim counts for a contract only where it deployed byte-identical code.
163 sims, 12,550 txs (`TRACE-COVERAGE-mv7dfb-summary.json`, rerun 2026-10-14 after the
`7724b0d` safe bytes and the reruns of section 2; was 114 sims, 9,343 txs). The
pool row was re-measured on the `570226c` bytes over the 33 reruns that
deployed them (2,100 txs). The new zero-seat arm (line 316) is credited
only by the refused 0-uSTX probe in og-shrink `3abedcde`: the VM ran the arm,
then the node's lock check (`PoxInvalidLockAmount`) aborted the tx, so no
sim commits that state. Its committed effect is pinned by the unit tests and
RV.
Per-contract reports: `simulations/TRACE-COVERAGE-mv7dfb-<name>.md`.

| Contract | Public fns reached | Branch nodes full / partial / never | Expressions | Sims |
|---|---|---|---|---|
| jing-core-v6 | 65/65 | 82 / 0 / 0 | 567/1178 | 153 |
| jing-ladder-v1 | 14/14 | 24 / 0 / 0 | 247/473 | 154 |
| markets-sbtc-stx-jing-v6-3 | 32/32 | 303 / 4 / 0 | 3223/4456 | 153 |
| swap-router-sbtc-stx-jing-v5-3 | 4/4 | 118 / 4 / 1 | 887/1318 | 121 |
| jing-buy-stx-core-spread-v1 (10 rungs) | 8/8 | 58 / 4 / 0 | 651/928 | 8 |
| jing-sell-stx-core-spread-v1 (10 rungs) | 8/8 | 58 / 4 / 0 | 650/929 | 9 |
| jing-ladder-dispatch | 6/6 | 20 / 0 / 0 | 240/380 | 5 |
| juice-pool-sbtc-signer (570226c bytes) | 37/37 | 52 / 2 / 0 | 765/1250 | 41 |
| juice-sbtc-autoswap | 19/19 | 68 / 0 / 0 | 574/933 | 73 |
| juice-autostake-safe (7724b0d bytes) | 27/27 | 114 / 0 / 0 (incl. the RV-F1 refusal) | 1046/1594 | 5 (deploy-set `b220ceef`, REAL_POOL `50de1e4a`, ops-coverage `2333f897`, stake-passkey `1d74d1bc`, juicestx e2e `23732d55`) |
| juice-autostake-safe-auth-helpers-v1 | read-only only | none | 14/24 | 16 |
| fastpool-swap-vault | 19/19 | 68 / 0 / 0 | 574/933 | 19 |
| signer-manager-vault-stx-rewards | 30/30 | 36 / 4 / 0 | 653/1023 | 18 |
| ccd015-redemption-book-mia-stx | 9/9 | 29 / 1 / 0 | 355/564 | 24 |
| ccd016-swap-vault-mia-v2 | 22/22 | 48 / 0 / 0 | 552/895 | 21 |

The traits have no executable code. Expression totals include read-only
functions and top-level definitions; a read-only call from an Eval step
leaves no trace.

Every remaining partial or never-reached arm is proven unreachable in
`COVERAGE-PLAN-mv7dfb.md`. Short list (line numbers are deploy-bytes lines):

| # | Contract : line (fn) | Arm | Why it cannot be taken |
|---|---|---|---|
| 1 | rungs 670/669 (count-reserve-claim) | reserve row missing | Per-epoch position count equals `epoch-reserve.left`; the row exists while that count > 0 |
| 2 | rungs 675/674, 679/678 (count-reserve-claim) | back > reserve, paid > proceeds | Sum of floored claims <= the reserve; the last claimer takes the remainder. Proposed as an RV property |
| 3 | rungs 794/793 (settle-escrow) | no pending escrow | After `sync`, take <= held + on-book + pending, so the `<=` arm always wins |
| 4 | market 3605/3609, 3700/3704 (distribute-to-*) | side total = 0 | `cycle-totals` = sum of listed deposits, each >= the side minimum > 0 |
| 5 | router 109, 118 (xyk-swap) | x-is-sbtc false | XYK pool `x-token` is set once at `create-pool`; x = sBTC forever |
| 6 | router 687 (cp-split) | total = 0 | Needs residual 0; `cp-stage` returns early on dust first |
| 7 | router 807 (dlmm-out) | bin-step != 15 | Bin step set once at pool creation; all three pools are bps-15 |
| 8 | router 954 (dlmm-enabled) | pool id unknown | dlmm-core-v-1-1 never deletes from `pools` |
| 9 | pool 761, 1127 (pay-one, pay-recovered-sbtc-one; 755, 1121 on fa8c48a bytes) | total-shares = 0 | Bonds refused; pox-5 changes shares only from current + 1, so a rewarded cycle has shares > 0 |
| 10 | signer 225 (mirror-stake-for-cycle) | stake into a pinned cycle | Pinned needs rewards, which exist only for cycles <= current; mirroring starts at current + 1 |
| 11 | signer 961 (pay-stacker) | gross > 0, net 0 | Both paths pass fee-bips u0 |
| 12 | signer 1166, 1206 (sweeps) | balance < reserved | Every reserved counter moves with the balance; the contract locks no STX |
| 13 | ccd015 242 (calculate-par) | supply or treasury = 0 | Treasury is locked in ccd014 until burn 1163750; not reachable on a fork |
| 14 | ccd015 settle-step (taken = 0) | not a branch node | Needs > 1 uSTX per micro-MIA while par is about 0.006 |

Not reachable on a fork: the rfq-v2-3 native price after `AdvanceBlocks`
(stxer `BlockingError`; covered at the tip, 20/20), and a Pyth governance fee
change (the oracle `fee` var is set by Eval and labelled as a fixture).

## 4. Clarinet SDK unit suites

Unit suites run the repo sources (or generated copies with declared
dependency substitutions), not the template strings. The faktory-dao
templates were byte-checked against the same commits (`77d9ba48`; the
safe template again at `d566bbc3` for `7724b0d`).

| Repo | Suite | Tests | Functions | Lines | Branches | Notes |
|---|---|---|---|---|---|---|
| jing-contracts-v3 | `npm run test:v6-3` (market) | 338/338 | 141/141 | 2375/2381 (99.75%) | 845/847 (99.76%) | `tests/unit/v6-3/.build/coverage.json`, source sha `943927cc...` (repo ada49d8). Gate 100 / 99.7 / 99.64 |
| jing-contracts-v3 | `npm run test:router-v5-3` | 490/490 | 44/44 | 692/696 (99.43%) | 275/276 (99.64%) | `tests/unit/router-v5-3/COVERAGE.md`; 32 limit-pick + 12 core-migration tests added for mv7dfb |
| jing-contracts-v3 | `npm run test:core-ladder-v1` | 95/95 | core 83/83, ladder 31/31 | core 938/938, ladder 266/267 raw | core 163/164 raw, ladder 61/61 | 100% after 2 source-anchored exceptions |
| jing-contracts-v3 | `npm run test:v6-3:integration` (rungs + dispatch) | 118/118 | rung 35/35 each, dispatch 15/15 | buy 466/478, sell 464/476 raw; dispatch 132/132 | 155/157 each raw; dispatch 40/40 | 100% after exceptions (static call operands, two defensive payout arms) |
| juicestx | `npm test` / `npm run test:report` | 134/134 (5 files); 135/135 at `570226c` (commit message) | pool 81/81, autoswap 41/41 | pool 715/717, autoswap 481/502 | pool 115/115, autoswap 150/150 | Coverage numbers from `contracts/README-deploy-set-test-status.md` (see note) |
| juicestx | `npm run test:vault` | green (fa8c48a commit) | not recorded | 481/502 | 150/150 | `tests/vault/results/coverage.json`, fa8c48a source hashes |
| juicestx | `npm run test:rv-repro` | 1/1 (1 file) | - | - | - | Zero-seat repro from the RV suite (section 5), run 2026-10-14 |
| pillar-wallets | `tests/juice-autostake-safe-keeper.test.ts` | 40/40 | not recorded | not recorded | set-keeper 4/4, restake 10/10 | Both manifests (cl-v7, cl-autostake-cov), safe `7724b0d` (pillar `8102212`; was 39/39 on `611873c`) |
| pillar-wallets | 9-file safe run (`tests/cl-autostake-cov`, regenerated from `7724b0d` by `gen.sh`) | 153/153 | safe 50/50, helpers 2/2 | safe 813/864 (94.10%), helpers 13/13 | safe 231/235 (98.30%) | pillar `8102212`. Production safe body with 3 principal substitutions. The one new arm, the RV-F1 refusal (:1166), is not hit here; it is hit by the rv-repro test on cl-v7 and by the stxer M2 step. Was 152/152, 810/861, 230/233 on a hand-patched `611873c` copy |
| pillar-wallets | `npx vitest run tests/juice-autostake-safe-*.test.ts -- --manifest tests/cl-v7/Clarinet.toml` | 52/52 | - | - | - | keeper 40 + cross-safe-replay 11 + rv-repro 1, on `7724b0d`. `tests/juice-autostake-safe-cross-safe-replay.test.ts` is untracked in pillar-wallets |
| citycoins-protocol | `npm run test:vault` | 313 checks, passed | not recorded | 450/473 (95.14%) | 118/119 (99.16%) | `tests/vault/results/runtime.json` (2026-10-14), ccd016 sha `e3437fcf...` = repo HEAD. Missed branch 622: vault floor guard that the mock router rejects first |
| citycoins-protocol | ccd015 book | no separate gate | - | - | - | Loaded as the real book in the vault harness |
| fastpool-pox-5 | `npm test` | 49 passed + 1 intentional isolated-harness skip (`ef08da9` README) | not recorded | not recorded | not recorded | Earlier: 50/50 (docs section 11.3), 49/49 (deploy-set status doc) |
| fastpool-pox-5 | `tests/vault-stx` (source-pinned, `1e2897b` + `ef08da9`) | 317 assertions, passed | vault 41/41, signer 56/56 | vault 466/502 (92.8%), signer 551/563 (97.9%) | vault 138/150 (92.0%), signer 85/91 (93.4%) | Builder refuses unless the sources match the pinned sha256 (`aaebf34b...` b719e87, `4858dbc6...` 3f82a93 = deploy bytes). Misses: defensive status, balance, payout and fixture-reachability arms (README). Other session still has uncommitted work in this folder |

Known setups:

- **ccd016 market mock (fixed).** The vault fixture is still the Jing v6
  market mock, but `tests/vault/build.py` now maps the v6-3 id to it and
  wraps its entry points with the v6-3 signatures (`3e64977`, "align ccd016
  vault suite to final APIs"; `8e05c13`, latest Clarinet SDK). It runs green
  on the current ccd016 source. `tests/vault/README.md` still shows the
  2026-09-18 numbers.
- **Fast Pool `tests/vault-stx` (fixed in fastpool `1e2897b`, `ef08da9`).** A
  source-pinned builder replaces the stale `stacking-juice` copy. See the
  table row above.
- Note: the juicestx and pillar coverage figures come from
  `contracts/README-deploy-set-test-status.md` (`39f3cd4`).

## 5. Rendezvous fuzzing

Rendezvous (RV) runs random call sequences against generated copies of the
final sources and checks invariants (after each call) or properties (per
call). The numbers below are copied from each suite's README or commit.
"Runs" is RV runs per seed.

| Repo / commit | Target (source) | Invariants / properties | Seeds x runs | Result | Findings |
|---|---|---|---|---|---|
| jing-contracts-v3 `876fb0b` | ladder-v1 stack: rungs buy + sell core-spread-v1 (each twice, spreads 20 and 50), jing-ladder-v1, dispatch, rung trait, market v6-3 (`ada49d8`), core-v6 | JS monitor after every call (shares, input solvency, exact proceeds ledger, conservation, no over-withdrawal, indices, core ledger, fill price) + `invariant-all`; rung and dispatcher properties | invariant 241014, 241015 x 1500; test 241016, 241017 x 3000 | invariant 1500/0/0 both seeds (18,753 and 18,737 calls); test 1424/1576/0 and 1369/1631/0 (passed / discarded / failed) | None. Two harness checks corrected (stranded proceeds, ownerless shares), not contract findings |
| jing-contracts-v3 `876fb0b` | router v5-3 (`15aef66`) with market v6-3 and core-v6 | Manual + smart swap properties; `rv-valid`, router holds nothing | invariant 241024, 241025 x 1000; test 241026, 241027 x 3000 | invariant 1000/0/0 both; test 1035/1965/0 and 1053/1947/0 | LOW, rounding: a smart swap can net up to one base unit of the sold asset under `limit-price` (12-28 bps at 200 sats, < 0.1 bps at 100k sats; `min-out` still binds). Repro `tests/rv-repro-router-smart-limit.test.ts`. Not fixed |
| jing-contracts-v3 `52339b5` | market v6-3 (sha `943927cc`, `ada49d8`) with the real core-v6 | v6-3 suite (cycle totals, solvency, core equity, recovery) | invariant 230927 x 1000; test 230926 x 5000; seeded 230929 x 3000; 3 full-book seeds + 1000 native each | 12,000 native trials, 4,659 passed, 7,341 discarded, 0 failed; 600 guided episodes; counts identical to 2026-09-30 | None |
| juicestx `799adff` | pool `juice-pool-sbtc-signer` + vault `juice-sbtc-autoswap` (`fa8c48a`) | pool 13 invariants (pox-5 model); vault 12 invariants (8 from tests/vault + extras: floor, flows, finish, recover) | pool 20261014, 20261015 x 1000 (zero stakes on) and x 2000 (`--no-zero-stake`); vault same seeds x 2000 | pool with zero stakes: FAIL `og-seats-is-count` at test 570 / 838; pool no-zero: 0 failures; vault: 0 failures | Zero-uSTX restake leaves a zero-cover OG seat that `evict-og` refuses; `og-seats` drifts. No funds move. Fixed in `570226c` (a 0 stake deletes the seat). Repro `npm run test:rv-repro`: 1 test, passed (juicestx `cd52afc` run) |
| juicestx `9b28e1e` (rerun) | pool `570226c` (repo sha256 `f8217080...85a3`) + vault `fa8c48a` | same 13 + 12 invariants | 20261014, 20261015 x 2000 (pool with zero stakes on and off; vault) | 0 failures in all six runs; `og-seats-is-count` now holds | None |
| pillar-wallets `8b9b340` (README in `tests/rv/`) | `juice-autostake-safe` source `611873c` | 12 invariants + oracle O1-O5 (dialer injects valid passkey signatures); 14 properties | seeds 1 and 2; invariant x 2000, property x 10000 | PASS all four | RV-F1 (below). Fixed in `7724b0d`. Rerun on `7724b0d` in the next row |
| pillar-wallets `1fc75c8` (rerun) | `juice-autostake-safe` source `7724b0d` | same 12 invariants + 14 properties; `test-stake` / `test-update-stake` moved to the 4-arg calls; dialer counts RV-F1 attempts | seeds 1 and 2: quick 300 / 1000 and full 2000 / 10000, each with and without `RV_ALLOW_F1=1` | PASS in all 16 runs; `single-admin-is-owner` holds | RV-F1 signed 7 times, 0 successes (quick, seed 2, `RV_ALLOW_F1=1`). The full `RV_ALLOW_F1` runs never reached pending == owner (0 / 0) |
| citycoins-protocol `f4c5130` | ccd016 vault (sha `e3437fcf`, the commented `8bfbb5f` file; deploy bytes = same file with comment lines dropped) | 16 invariants + 10 properties (RV 1.0.3) | 20261014, 20261015 x 1000 each mode | invariant 1000/1000 both; property 1000/1000 both (11 / 9 discarded: jing-take had no fill) | None. Sensitivity: removing the router-swap floor assert fails `invariant-never-below-floor` after 53 runs (seed 11); the old fee path fails `test-fee-payer` (u801) and `invariant-only-vault-pays-fee` after 42 runs (seed 12) |
| citycoins-protocol (2026-09-15) | ccd015 book (unchanged since `a9a6bd6`) | 7 invariants | 500 runs, seed not recorded | no falsified invariant | None |
| fastpool-pox-5 `e4e8e98` | `fastpool-swap-vault` (`b719e87`), `signer-manager-vault-stx-rewards` (`3f82a93`) | vault 17 invariants; signer 9 + 17; props 7 properties (RV 1.0.3) | 20261014, 20261015; invariant x 1500, props x 2000 | pass, 0 falsified, 0 runtime errors | None. Mutants floor, finish, fee all caught |

**RV-F1 (pillar, Low, fixed in `7724b0d`).** `confirm-transfer-wallet` set
then deleted the same admin key when `pending-transfer` named the current
owner, leaving the safe with no admin. Reachable without harness aids: A
transfers to B, B proposes A, the recovery address recovers to A after the
inactivity period (pending still A), A's passkey confirms. No funds move;
the safe stays frozen until a second inactivity recovery. Fix: the confirm
asserts `pending != owner` (u4001). Proven on the deploy bytes by pillar
`simul-juice-autostake-safe.js` (RV-F1 step, 86/86 and REAL_POOL 87/87).
juice-safe-v8 carries the same fix (section 6 note).

## 6. Bounty mv7dfb findings and their tests

Bounty `mv7dfb43df5505479788` (10,000 sats), open until 2026-10-20.
Reviews: [contracts/README-bounty-mv7dfb.md](contracts/README-bounty-mv7dfb.md)
(router, market) and juicestx `contracts/pox-5/README-bounty-mv7dfb.md`
(pool, vaults, safe, partners). The earlier round (muqchqnaa54e769598a4) is
in [contracts/README-audit-v6-3-deploy-set-bounty.md](contracts/README-audit-v6-3-deploy-set-bounty.md).

| Finding | Verdict | Fix commit | Unit tests | Stxer sims |
|---|---|---|---|---|
| Patient Reed: OG seat without stake (hop in and out) | Holds, Medium | juicestx `d90dc1c` | 6 cases "og-staying / evict-og" in `juice-pool-og.test.ts` | og-evict 69/69, og-seats 49/49, og-cap 47/47, deploy-set (hop, evict) |
| Patient Reed recheck: fresh small stake keeps the old cover | Holds, Medium | juicestx `fa8c48a` | 6 cases "og-shrink"; 134/134 | og-shrink 58/58, deploy-set (1 STX shrink) |
| Patient Reed F2: `finish` keeps no STX for the Pyth fee | Holds, Low | juicestx `fa8c48a`, fastpool `b719e87`; ccd016 already had it (`4940041`) | 2 cases (budget u100 / fee u10; balance <= budget) | juice pyth-fee 58/58, fastpool vault-fixes pf 78/78, deploy-set (finish reserve) |
| Super Orb: the caller paid the first Lazer verify | Holds, Low | juicestx `fa8c48a`, fastpool `b719e87`, ccd016 `8bfbb5f` | 5 Pyth fee cases in juicestx (fail on the old source) | juice pyth-fee 58/58, fastpool pf 78/78, ccd016 pyth-fee 70/70, deploy-set (fee u10 batch) |
| Rare Io I1: tranche totals written per staker | Holds, gas | juicestx `e425a4c` | not recorded | pay-batches 166/166, accounting 126/126 |
| Rare Io I2: earned fees written per staker | Holds, gas | juicestx `da7913d` | not recorded | pay-fees 299/299, pay-batches 166/166 |
| Rare Io I3: hoist `cycle-totals` out of `execute-fill` | Correct, rejected (not a gas win, +589 bytes) | none | - | side-by-side 383/383 |
| Zealous Citadel: limit-blind DLMM pick | Holds | jing `15aef66` | 32 tests in `limit-pick.test.ts` (10 fail on the old router) | limit-pick-mv7dfb 38/38, deploy-set pick scan 100% to 120%, router suite reruns |
| Zealous Citadel Info: fee proposal never expires | Holds, Info, no change (5% cap) | none | - | - |
| Giant Moth 01: migrated DLMM pool reverts the smart swap | Holds | jing `15aef66` | 12 tests "migrated DLMM pool" | core-migration 65/65, deploy-set (migration skip) |
| Giant Moth: passkey `set-keeper` ignores the token lock | Holds | pillar `7758200` | 4 tests "set-keeper: token lock" (3 fail without the fix) | stake-passkey 50/50, ops-coverage 208/208 (token-lock arms), `7724b0d` bytes |
| Giant Moth F2: keeper kept after an owner change | Holds | pillar `611873c` | 8 tests "owner change resets the keeper" (39 total) | autostake-safe 86/86 (L, M), REAL_POOL 87/87, deploy-set 341/341 (passkey transfer resets the keeper), all on `7724b0d` bytes |
| Calm Forge: ccd016 elapsed window on dust funding | Holds | citycoins `8adfa68` | not recorded | clock-keyless 101/101 (S8, S8d), fixes 96/96, deploy-set (dust window) |
| Void Cannon: Fast Pool `CYCLE_OFFSETS` had 12 entries (pox-5 allows 96) | Holds | fastpool `3f82a93` | not recorded | deploy-set (96-cycle lock) |
| Void Cannon F2: signer fee on unswapped sBTC | By design, no change | none | - | - |
| Void Cannon F3: `assert-idle-vault` misses vault states | Does not hold (`pending-swap` check) | none | - | - |
| Iron Hub F1: floor passed as `mid` | Does not hold | none | - | - |
| Iron Hub F2: `finish` dust theft | Does not hold (`finish` is POOL-only) | none | - | - |
| Violet Reed: `router-swap-split` reverts on a bid in the net band | By design (fail-safe, operator path) | none | - | - |
| Coverage review: core-v6 `register` has no owner check | Accepted, by design; design doc fixed | jing `616169e` (docs only) | - | gaps 455/455 (check "FINDING") |
| RV-F1 (found by Rendezvous, pillar RV suite): `confirm-transfer-wallet` to the current owner empties the admin set | Holds, Low | pillar `7724b0d` | `tests/juice-autostake-safe-rv-repro.test.ts` (plain sequence, real 52,560-block period); vitest 52/52 (keeper 40 + cross-safe-replay 11 + rv-repro 1) | autostake-safe 86/86 and REAL_POOL 87/87 (RV-F1 step: confirm u4001, owner stays admin) |
| Feature (not a finding): signer-calldata ref. `stake-stx-juice` / `update-stake-stx-juice` take `signer-calldata (optional (buff 500))` last and forward it to pox-5, so the pool's `validate-stake!` prints the ref | n/a | pillar `99d69e8` | stake-passkey tests in vitest 52/52 | stake-passkey 50/50 (stake A8 + update A10 print "telegram"); deploy-set 341/341 (canonical safe stake prints "telegram") |

Note: `juice-safe-v8` (pillar `4f4ce93`, tests `6f092ef`, 120/120) is v7
plus the same two changes (signer-calldata ref and the RV-F1 fix), bound to
`juice-pool-stx-signer`. It is NOT in the mv7dfb deploy set. faktory-dao
`4ef2f67c` wires it for new juice safes.

## 7. Known open items and accepted risks

- **Recovery continuity pinned at block 9207370.** At the tip the DLMM depth
  is too thin and the harness fails (u16047, 13/158 at `fa8c48a`, same on the
  old source). Pinned run: 190/190 (`cc9daef`, rerun `d0108679...`).
- **juicestx `--lifecycle` pinned at block 9208593** (juicestx `cbbb6f6`).
  At the tip the DLMM depth is too thin (30/38, `d4af4cc8`, u16047). Same
  sources at the pinned block: 41/41 (`29fd3d16`). Fork drift, not a regression.
- **Stale or failing checks in the rerun list:** router pool-pick-steer #35
  is fixed in the harness (60/60, `cb36bd72`). Two legacy rung harnesses
  that are not in the deploy set still fail at deploy; they test retired
  contracts.
- **Pyth fee by Eval fixture.** No governance VAA can be signed on a fork, so
  every fee-u10 run sets the oracle `fee` var by Eval. The live fee is u0.
  Vault budgets must be >= 2x fee and set before a fee goes live.
- **Clarity 6 version.** stacks.js 7.4.0 has no `ClarityVersion.Clarity6`. In
  juicestx, pillar and citycoins the harness deploys of the Clarity 6
  contracts went out unversioned (the node used its epoch default, Clarity 6).
  jing-contracts-v3 moved to 7.6.0 (the faktory-dao BE version) and the
  deploy set was rerun as version 6 (340/340, `de9bd7b8`). Upgrade the other
  repos before trusting new Clarity 6 sims.
- **Open core registration, by design.** Any byte-identical copy of a
  verified contract can register in jing-core-v6 and call `log-*`. No funds
  are at risk; indexers and frontends must filter on our market principals
  (`616169e`).
- **stx-juice-fe safe source / hash mismatch (blocker before the FE goes
  live).** `stx-juice-fe/src/contracts/juice-autostake-safe.clar` is the
  2026-10-06 copy (`7813132`, 51,975 bytes, sha512/256 `88886acc...4bdd`,
  also the `JUICE_AUTOSTAKE_SAFE_CANONICAL_HASH` constant). The deploy
  template is now 51,812 bytes (`7724b0d`), sha512/256 `cdb7c603...732a7a97`.
  The FE copy and hash must be regenerated from the template before
  `AUTOSTAKE_LIVE`, and the FE stake calls must pass the new 4th argument
  (`signer-calldata`).
- **`vault-allowance-proof-stxer.mjs`** now matches its pattern with any
  whitespace and runs on the deploy bytes (juicestx `cd52afc`, `783ca0c1`).
- **RV finding (juicestx `799adff`).** A 0-uSTX restake leaves a zero-cover
  OG seat that `evict-og` refuses, and the next stake counts the seat again.
  The node refuses a 0 lock on mainnet (`PoxInvalidLockAmount`, seen on the
  og-shrink fork), so this edge is pinned by a unit test. Fixed in juicestx
  `570226c`: a 0 stake now deletes the seat and decrements `og-seats`
  (template `459fa786`, 34,134 B; og-shrink 58/58 records the node refusal). Details go in
  section 5.
- **Market size.** 97,701 bytes, about 2.3 KB under the cap. Any further
  market change must stay small.
- **juicestx result files committed.** The 2026-10-14 reruns are in juicestx
  `cbbb6f6`.
- **From DEPLOY-PLAN, still open:** ladder `set-canonical` before any rung
  `initialize`; owner keys to a multisig with distinct cosigners; ccd016
  `STX_FAIR_BOOK` is still a relative name (partner's call); launch before
  cycle 146 (burn 972,650).

