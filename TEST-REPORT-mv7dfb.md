# Pre-deploy test report: bounty mv7dfb deploy set

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
| 13 | `juice-autostake-safe` | pillar-wallets `611873c` | 6 | 51,552 | `dda5367c...4ae28a3d` | template |
| 14 | `fastpool-swap-vault` | fastpool-pox-5 `b719e87` | 6 | 28,375 | `aaebf34b...8101fdac` | partner, byte for byte |
| 15 | `signer-manager-vault-stx-rewards` | fastpool-pox-5 `3f82a93` | 6 | 41,593 | `4858dbc6...07d4a731` | partner, byte for byte |
| 16 | `ccd015-redemption-book-mia-stx` | citycoins-protocol `8bfbb5f` (book unchanged) | 5 | 12,641 | `6b5daed3...3721df57` | partner, comment lines dropped |
| 17 | `ccd016-swap-vault-mia-v2` | citycoins-protocol `8bfbb5f` | 5 | 22,427 | `a7062d39...28fa48c6` | partner, comment lines dropped |

The full SHA-256 values are in `SHA256SUMS.txt`. The Clarity versions are
the ones the deploy-set harness sends (`deploy-set-mv7dfb-result.json`).
Other recorded hashes: the safe canonical hash (sha512/256 of the template)
is `1ef1627f...e1fab9bb`; the deploy-set result also records the sha512/256
of every row.

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
| `verify-deploy-set-mv7dfb.js` | All 35 deployments in DEPLOY-PLAN order, then: Juice pool OG seats, hop, evict, 1 STX shrink, 3 reward batches (fee 0, fee u10, recovery); safe canonical hash, keeper restake, passkey transfer resets the keeper; Fast Pool 96-cycle lock and finish reserve; ccd016 8adfa68 dust window; router limit-aware pick (scan 100% to 120%) and core-migration skip. Fork 9208422, burn 971438 | 340/340 | `20c428624713b6c452cfce5c5ed890db` (pool 570226c bytes) | yes | 2026-10-14 |
| same, pool fa8c48a bytes | same | 340/340 | `de9bd7b811577d3e5c0f2100dfa023c1` (Clarity 6 rows sent as version 6) | yes, except the pool (fa8c48a bytes) | 2026-10-14 |
| same, first run | same; Clarity 6 rows went out unversioned (stacks.js 7.4.0) | 340/340 | `5cf1573f3f04fe514d9c671a6914aff7` | yes, except the pool (fa8c48a bytes) | 2026-10-14 |

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
| `verify-router-v5-3-limit-pick-mv7dfb.js` | Zealous Citadel repro: prod pick u2 -> u1, +9.05% at block 9203637, +8.43% at 9207942 | 38/38 | prod `c5d4ca0d...`, patched `9feff563...`; prod `9ed2b05e...`, patched `9a115d21...` | no (repo source 15aef66) | 10-14 |
| `verify-router-v5-3-core-migration-mv7dfb.js` | Giant Moth 01: Bitflow `migrate-pool` on the fork; old router reverts u2001, new router skips the migrated pool. Block 9207954 | 65/65 | old `d5f7ff94...`, new `e16126da...` | no (repo source) | 10-14 |
| `verify-v6-3-dispatch.js` | core, ladder, market, trait, rungs, dispatch; no router | 228/228 | `3b5a8e21c069ff914f72a14008b06659` (master, 3dd1d2e); preload rerun `33c70bfa...` 228/228 | preload run: yes | 10-14 |
| `verify-v6-3-deploy-bytes.js` | Deploy of the byte files | 17/17 | `34add6e3e280af40acbc7e910dc1423f` | yes | 10-14 |
| `verify-router-v5-3-smart.js` | Smart router paths | 588/588 | `3cae36d9...`, `6c1285d8...`, `7edc890f...` | yes | 10-14 |
| `verify-router-v5-3-manual.js` | Manual router legs | 410/410 | `0d66c62de411c83111af9dfd996afead` | yes | 10-14 |
| `verify-router-v5-3-pool-pick.js` | DLMM pool pick | 225/225 | `526537fa97d469535ef623754db9dd93` | yes | 10-14 |
| `verify-router-v5-3-pool-pick-steer.js` | Pick steering | **34/35** (check #35 stale at this block, same on f342615) | `2915ed46336489f775aa48ea4d5f0b77` | yes | 10-14 |
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
| `verify-v6-3-cancel-orphan-pending.js` | Orphan pending cancel | 225/225 | `28ba3ce94de5351dd0bfa8d3d9233c1d` | partial (harness text-patches) | 10-14 |
| `verify-v6-3-ghost-deposit.js` | Ghost deposit | 343/343 | `8854daced965a5246e763381fa2220d3` | partial (patched) | 10-14 |
| `verify-v6-3-switched-off-ask.js` | Switched-off ask | 221/221 | `94d5f0c91e17eaf0dc330f076b5477aa` | partial (patched) | 10-14 |
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
| `pool-autostake-e2e-stxer.mjs` | Pool pays the safe, keeper restake | 63/63 | `6ddeb669da83d107987f2c3405f172c0` | yes | 10-14 |
| `pool-pay-batches-stxer.mjs` | Rare Io I1, new vs old side by side | 166/166 | `9a28245b73f5484cad4df7a73fa32a29` | no (pre-fa8c48a pool hashes) | not recorded |
| `pool-pay-fees-stxer.mjs` | Rare Io I2, new vs old side by side | 299/299 | `3009eb741bbf5a2b7b15ca1667b6f55c` | no (pre-fa8c48a pool hashes) | not recorded |
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
| `vault-allowance-proof-stxer.mjs` | Allowance terms, 4 cases as expected | passed | `5bcca46c345cb9f7937c327907061794` | no (pattern needs the commented repo source) | 10-14 |

### 2.4 pillar-wallets (autostake safe)

| Harness | Covers | Pass | Stxer | Deploy bytes | Date |
|---|---|---|---|---|---|
| `simul-juice-autostake-safe.js REAL_POOL=1` | Main safe harness against the real `juice-pool-sbtc-signer` (no source swap) | 83/83 | `d3222b84dcc60eafda2a06a159bfd904` | yes | 10-14 |
| `simul-juice-autostake-safe.js` | Same scenarios against the live `juice-pool-stx-signer` stand-in, incl. keeper reset after 52,610 burn blocks | 82/82 | `837734f0b07aed2a07e62656af381ad0` | no (repo source, pool stand-in) | 10-14 |
| `simul-juice-autostake-safe-ops-coverage.js` | 17 public functions the main harness misses; section F zero-fee gas station | 208/208 (204/204 before F, `b6fd12bd...`) | `5d9897ba8ad7fa14f40c6839d436b946` | yes | 10-14 |
| `simul-juice-autostake-safe-stake-passkey.js` | Passkey stake / update / unstake, token lock, replay | 43/43 | `d508603db48d572c96c6465b9ffa1baa` | yes | 10-14 |

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
| `_vault-recovery-v6-3.mjs` matrix | Recovery matrix, 5 sessions | 574/574 | `65c78704...`, `c4403aee...`, `0c1d27b1...`, `d1088899...`, `be1311f4...` | no (repo source hashes) | 10-14 (b719e87) |

## 3. Stxer trace coverage on the exact deploy bytes

Tool: `node simulations/coverage-mv7dfb.mjs` (`trace-coverage-multi.mjs`).
A sim counts for a contract only where it deployed byte-identical code.
114 sims, 9,343 txs (`TRACE-COVERAGE-mv7dfb-summary.json`, 2026-10-14). The
pool row was re-measured on the `570226c` bytes over the 33 reruns that
deployed them (2,100 txs). The new zero-seat arm (line 316) is credited
only by the refused 0-uSTX probe in og-shrink `3abedcde`: the VM ran the arm,
then the node's lock check (`PoxInvalidLockAmount`) aborted the tx, so no
sim commits that state. Its committed effect is pinned by the unit tests and
RV.
Per-contract reports: `simulations/TRACE-COVERAGE-mv7dfb-<name>.md`.

| Contract | Public fns reached | Branch nodes full / partial / never | Expressions | Sims |
|---|---|---|---|---|
| jing-core-v6 | 65/65 | 82 / 0 / 0 | 567/1178 | 107 |
| jing-ladder-v1 | 14/14 | 24 / 0 / 0 | 247/473 | 108 |
| markets-sbtc-stx-jing-v6-3 | 32/32 | 303 / 4 / 0 | 3223/4456 | 107 |
| swap-router-sbtc-stx-jing-v5-3 | 4/4 | 118 / 4 / 1 | 887/1318 | 78 |
| jing-buy-stx-core-spread-v1 (10 rungs) | 8/8 | 58 / 4 / 0 | 651/928 | 6 |
| jing-sell-stx-core-spread-v1 (10 rungs) | 8/8 | 58 / 4 / 0 | 650/929 | 7 |
| jing-ladder-dispatch | 6/6 | 20 / 0 / 0 | 240/380 | 4 |
| juice-pool-sbtc-signer (570226c bytes) | 37/37 | 52 / 2 / 0 | 765/1250 | 33 |
| juice-sbtc-autoswap | 19/19 | 68 / 0 / 0 | 574/933 | 35 |
| juice-autostake-safe | 27/27 | 113 / 0 / 0 | 1042/1588 | 7 |
| juice-autostake-safe-auth-helpers-v1 | read-only only | none | 14/24 | 7 |
| fastpool-swap-vault | 19/19 | 68 / 0 / 0 | 574/933 | 14 |
| signer-manager-vault-stx-rewards | 30/30 | 36 / 4 / 0 | 653/1023 | 13 |
| ccd015-redemption-book-mia-stx | 9/9 | 29 / 1 / 0 | 355/564 | 23 |
| ccd016-swap-vault-mia-v2 | 22/22 | 48 / 0 / 0 | 552/895 | 20 |

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
templates were byte-checked against the same commits (`77d9ba48`).

| Repo | Suite | Tests | Functions | Lines | Branches | Notes |
|---|---|---|---|---|---|---|
| jing-contracts-v3 | `npm run test:v6-3` (market) | 338/338 | 141/141 | 2375/2381 (99.75%) | 845/847 (99.76%) | `tests/unit/v6-3/.build/coverage.json`, source sha `943927cc...` (repo ada49d8). Gate 100 / 99.7 / 99.64 |
| jing-contracts-v3 | `npm run test:router-v5-3` | 490/490 | 44/44 | 692/696 (99.43%) | 275/276 (99.64%) | `tests/unit/router-v5-3/COVERAGE.md`; 32 limit-pick + 12 core-migration tests added for mv7dfb |
| jing-contracts-v3 | `npm run test:core-ladder-v1` | 95/95 | core 83/83, ladder 31/31 | core 938/938, ladder 266/267 raw | core 163/164 raw, ladder 61/61 | 100% after 2 source-anchored exceptions |
| jing-contracts-v3 | `npm run test:v6-3:integration` (rungs + dispatch) | 118/118 | rung 35/35 each, dispatch 15/15 | buy 466/478, sell 464/476 raw; dispatch 132/132 | 155/157 each raw; dispatch 40/40 | 100% after exceptions (static call operands, two defensive payout arms) |
| juicestx | `npm test` / `npm run test:report` | 134/134 (5 files); 135/135 at `570226c` (commit message) | pool 81/81, autoswap 41/41 | pool 715/717, autoswap 481/502 | pool 115/115, autoswap 150/150 | Coverage numbers from `contracts/README-deploy-set-test-status.md` (see note) |
| juicestx | `npm run test:vault` | green (fa8c48a commit) | not recorded | 481/502 | 150/150 | `tests/vault/results/coverage.json`, fa8c48a source hashes |
| juicestx | `npm run test:rv-repro` | not recorded | - | - | - | Zero-seat repro from the RV suite (section 7) |
| pillar-wallets | `tests/juice-autostake-safe-keeper.test.ts` | 39/39 | not recorded | not recorded | set-keeper 4/4, restake 10/10 | Both manifests (cl-v7, cl-autostake-cov) |
| pillar-wallets | 9-file safe run (coverage manifest) | 152/152 | safe 50/50, helpers 2/2 | safe 810/861 (94.08%), helpers 13/13 | safe 230/233 (98.71%) | From `contracts/README-deploy-set-test-status.md`. Production safe body with 3 principal substitutions |
| citycoins-protocol | `npm run test:vault` | 313 checks, passed | not recorded | 450/473 (95.14%) | 118/119 (99.16%) | `tests/vault/results/runtime.json` (2026-10-14), ccd016 sha `e3437fcf...` = repo HEAD. Missed branch 622: vault floor guard that the mock router rejects first |
| citycoins-protocol | ccd015 book | no separate gate | - | - | - | Loaded as the real book in the vault harness |
| fastpool-pox-5 | `npm test` | 50/50 (docs section 11.3); the deploy-set status doc says 49/49 | not recorded | not recorded | not recorded | The vault is not in this repo's simnet; its `finish` case lives in juicestx `tests/juice-vault.test.ts` |
| fastpool-pox-5 | `tests/vault-stx` | not run | - | - | - | Stale: `build-fixtures.py` and `fixtures/` are untracked and copy from a sibling `stacking-juice` checkout. No source-anchored report |

Known setups:

- **ccd016 market mock (fixed).** The vault fixture is still the Jing v6
  market mock, but `tests/vault/build.py` now maps the v6-3 id to it and
  wraps its entry points with the v6-3 signatures (`3e64977`, "align ccd016
  vault suite to final APIs"; `8e05c13`, latest Clarinet SDK). It runs green
  on the current ccd016 source. `tests/vault/README.md` still shows the
  2026-09-18 numbers.
- **Fast Pool `tests/vault-stx` (not fixed).** See the table row above.
- Note: the juicestx and pillar coverage figures come from
  `contracts/README-deploy-set-test-status.md` (`39f3cd4`).

## 5. Rendezvous fuzzing

In progress. Another agent will fill this section.

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
| Giant Moth: passkey `set-keeper` ignores the token lock | Holds | pillar `7758200` | 4 tests "set-keeper: token lock" (3 fail without the fix) | stake-passkey 43/43, ops-coverage 208/208 (token-lock arms) |
| Giant Moth F2: keeper kept after an owner change | Holds | pillar `611873c` | 8 tests "owner change resets the keeper" (39 total) | autostake-safe 82/82 (L, M), REAL_POOL 83/83, deploy-set (passkey transfer resets the keeper) |
| Calm Forge: ccd016 elapsed window on dust funding | Holds | citycoins `8adfa68` | not recorded | clock-keyless 101/101 (S8, S8d), fixes 96/96, deploy-set (dust window) |
| Void Cannon: Fast Pool `CYCLE_OFFSETS` had 12 entries (pox-5 allows 96) | Holds | fastpool `3f82a93` | not recorded | deploy-set (96-cycle lock) |
| Void Cannon F2: signer fee on unswapped sBTC | By design, no change | none | - | - |
| Void Cannon F3: `assert-idle-vault` misses vault states | Does not hold (`pending-swap` check) | none | - | - |
| Iron Hub F1: floor passed as `mid` | Does not hold | none | - | - |
| Iron Hub F2: `finish` dust theft | Does not hold (`finish` is POOL-only) | none | - | - |
| Violet Reed: `router-swap-split` reverts on a bid in the net band | By design (fail-safe, operator path) | none | - | - |
| Coverage review: core-v6 `register` has no owner check | Accepted, by design; design doc fixed | jing `616169e` (docs only) | - | gaps 455/455 (check "FINDING") |

## 7. Known open items and accepted risks

- **Recovery continuity pinned at block 9207370.** At the tip the DLMM depth
  is too thin and the harness fails (u16047, 13/158 at `fa8c48a`, same on the
  old source). Pinned run: 190/190 (`cc9daef`, rerun `d0108679...`).
- **juicestx `--lifecycle` pinned at block 9208593** (juicestx `cbbb6f6`).
  At the tip the DLMM depth is too thin (30/38, `d4af4cc8`, u16047). Same
  sources at the pinned block: 41/41 (`29fd3d16`). Fork drift, not a regression.
- **Stale or failing checks in the rerun list:** router pool-pick-steer #35
  (34/35, stale at this block, same on `f342615`); two legacy rung harnesses
  that are not in the deploy set fail at deploy.
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
  template is 51,552 bytes, sha512/256 `1ef1627f...e1fab9bb`. The FE copy and
  hash must be regenerated from the template before `AUTOSTAKE_LIVE`.
- **`vault-allowance-proof-stxer.mjs`** finds the allowance terms by a text
  pattern over the commented source, so it cannot run on the deploy bytes.
  Its result stands on the repo source only.
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

