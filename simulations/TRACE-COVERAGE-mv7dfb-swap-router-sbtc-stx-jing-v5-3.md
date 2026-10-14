# Trace coverage: swap-router-sbtc-stx-jing-v5-3

From `simulations/trace-coverage-multi.mjs` on 2026-10-14: final deploy bytes `simulations/deploy-bytes-mv7dfb/swap-router-sbtc-stx-jing-v5-3.clar` (sha256 `3e457866be8d4f6216e5e17fd87c9aa6fb2285a23909e7957a354c4af8e3b9b4`), counted only where a sim deployed these exact bytes (121 sims).

| metric | value |
|---|---|
| expressions executed / total | 887 / 1318 (67.3%) |
| public functions reached | 4 / 4 |
| branch nodes (if / match / asserts!) | 123: 118 full, 4 partial, 1 never reached |

## Public functions never reached (0)


## Read-only functions with no traced expression (0; read-only calls from Eval steps leave no trace)



## Branches with one arm never taken (4)

| line | function | kind | state |
|---|---|---|---|
| 109 | xyk-swap | if | one arm (then only) |
| 687 | cp-split | if | one arm (then only) |
| 807 | dlmm-out | if | one arm (then only) |
| 954 | dlmm-enabled | match | one arm (then only) |

## Branch nodes never reached (1)

| line | function | kind |
|---|---|---|
| 118 | xyk-swap | if |

## Function bodies (expressions hit / total)

| function | hit / total |
|---|---|
| ERR_ZERO_AMOUNT | 0 / 1 |
| ERR_MIN_OUT | 0 / 1 |
| ERR_BAD_VENUE | 0 / 1 |
| ERR_SPLIT_MISMATCH | 0 / 1 |
| ERR_VAA_REQUIRED | 0 / 1 |
| ERR_ZERO_LIMIT | 0 / 1 |
| ERR_ZERO_MID | 0 / 1 |
| DLMM_WALK_BINS | 0 / 1 |
| smart-swap-sbtc-for-stx | 53 / 93 |
| smart-swap-stx-for-sbtc | 53 / 93 |
| cp-split | 12 / 20 |
| dlmm-capacity | 18 / 30 |
| xyk-swap | 5 / 8 |
| xyk-quote | 25 / 40 |
| cp-stage | 47 / 75 |
| dlmm-stage | 25 / 38 |
| swap-sbtc-for-stx | 77 / 116 |
| swap-stx-for-sbtc | 77 / 116 |
| velar-keep | 8 / 12 |
| dlmm-out | 39 / 58 |
| jing-size | 27 / 40 |
| velar-reserves | 13 / 19 |
| leg-sbtc | 6 / 8 |
| leg-stx | 6 / 8 |
| dlmm-pick | 44 / 57 |
| dlmm-depth | 8 / 10 |
| amm-sell-sbtc | 16 / 20 |
| amm-sell-stx | 16 / 20 |
| limit-min | 9 / 11 |
| dlmm-out-step | 85 / 103 |
| dlmm-bin-step | 57 / 68 |
| jing-swap | 12 / 14 |
| cp-capacity | 24 / 26 |
| sbtc-balance | 2 / 2 |
| gain | 3 / 3 |
| jing-spent | 2 / 2 |
| jing-out | 2 / 2 |
| xyk-x-is-sbtc | 4 / 4 |
| dlmm-sell | 15 / 15 |
| dlmm-pool-info | 8 / 8 |
| dlmm-enabled | 14 / 14 |
| dlmm-threshold | 11 / 11 |
| dlmm-bin-balances | 8 / 8 |
| amm-floor | 2 / 2 |
| with-fallback | 4 / 4 |
| dust-left | 4 / 4 |
| fallback-residual | 17 / 17 |
| scale-min | 6 / 6 |
| valid-fallback | 5 / 5 |
| book-limit | 12 / 12 |
| amm-leg | 5 / 5 |
| get-jing-min-deposits | 1 / 1 |

## Sims counted (121)

`b220ceef` `01b8c978` `09bad98f` `0b130236` `0d61fa25` `0d66c62d` `12cf15ee` `1599af88` `18933f00` `21bd3ee2` `2915ed46` `2f47455f` `2fd82a2e` `3270029d` `34add6e3` `35d275ea` `36b4f87e` `38122515` `3c99bc1e` `3cae36d9` `40bee8c0` `41a52fa1` `41ad661d` `41c6aa11` `46edf261` `4783a1b8` `486a08d0` `4d1bb9ef` `4edd8ba9` `523e3e7d` `526537fa` `54256428` `54f0da53` `58724eb0` `58c0fb76` `59cdc203` `5a727d6d` `5c4cea9a` `6c1285d8` `6f30d6e2` `7158b1ba` `71ec6fc5` `7388231f` `75074c83` `75f1cd13` `7668f859` `768b1ae9` `7edc890f` `8063c1da` `839af883` `8a0e577b` `8a2c60cc` `ad49570e` `b18edad1` `b95238c0` `c449ad8c` `c5e9f981` `c63880c2` `c691ce10` `d0108679` `d05eaf98` `d4af4cc8` `dd93a13a` `e3f21dae` `e547999d` `e58d43d1` `e78fe3b2` `e8c0247d` `ec16a3f8` `f793659c` `d55a9bb0` `da59d087` `5cf1573f` `b6fd12bd` `6fd87036` `692f5727` `b8f56b5d` `80c3db54` `4577cbf2` `f959481d` `fb581245` `234ae5bc` `9ed500da` `5cb2d952` `6ddeb669` `161efa05` `1152d49a` `a25807fb` `159f7330` `3abedcde` `b9e338f7` `caaa8212` `cfbf7abf` `f34c8380` `2c27e137` `86f2e948` `59609a5f` `7264b553` `8910961e` `e243ffee` `eb885c9b` `464ab921` `e245dac1` `f18fcd19` `43777d34` `6219fbc1` `ac801919` `db6eb6da` `d3222b84` `5d9897ba` `d508603d` `20c42862` `80b820f4` `101c85a5` `213aaf3a` `cb36bd72` `1d74d1bc` `2333f897` `23732d55` `783ca0c1` `50de1e4a`
