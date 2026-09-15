# Trace coverage: swap-router-sbtc-stx-jing-v5

From `simulations/trace-coverage.mjs` on 2026-09-15, source at 6d8b5f2: 2 simulations, 270 transactions (4 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 581 / 918 (63.3%) |
| code lines touched / total | 337 / 545 (61.8%) |
| function body lines touched / total (top-level definitions excluded) | 337 / 514 (65.6%) |
| branch nodes (if / match / asserts!) | 68: 64 full, 3 partial, 1 never reached |

## Branches with one arm never taken (3)

| line | function | kind | state |
|---|---|---|---|
| 219 | xyk-swap | if | one arm (then only) |
| 763 | cp-split | if | one arm (then only) |
| 833 | dlmm-bin-step | if | one arm (then only) |

## Branch nodes never reached (1)

| line | function | kind |
|---|---|---|
| 228 | xyk-swap | if |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 109, 110, 111, 112, 113, 115, 116, 117, 119, 121, 122, 124, 125, 126, 128, 129, 130, 132, 133, 134, 135, 136, 137, 138, 600, 601, 602, 695, 791, 792, 793 |
| xyk-swap | 228, 229, 232 |
| ERR_ZERO_AMOUNT | 132 |
| ERR_MIN_OUT | 133 |
| ERR_BAD_VENUE | 134 |
| ERR_SPLIT_MISMATCH | 135 |
| ERR_VAA_REQUIRED | 136 |
| ERR_ZERO_LIMIT | 137 |
| ERR_ZERO_MID | 138 |
| swap-sbtc-for-stx | 403 |
| swap-stx-for-sbtc | 504 |
| DLMM_WALK_BINS | 793 |
| smart-swap-sbtc-for-stx | 1002 |
| smart-swap-stx-for-sbtc | 1070 |
| get-jing-min-deposits | 1127 |

## Per simulation (cumulative executed expressions of swap-router-sbtc-stx-jing-v5)

| sim | txs | before | after |
|---|---|---|---|
| `4e1afb02` | 102 | 0 | 1247 |
| `a9e9e858` | 168 | 1247 | 1247 |

## Known unreachable (and why)

- `xyk-swap` L219 (then only) and L228 (never reached): the branch on the XYK pool's token order; `xyk-pool-sbtc-stx-v-1-1` has sBTC as its x token, fixed at deploy, so the `x-is-sbtc` false arm cannot run on mainnet (defensive, the pool is a constant of the router).
- `cp-split` L763 (then only): the `total > 0` guard inside the residual-fits arm; `cp-stage` never calls `cp-split` with nothing left, so a residual that fits (`residual <= total`) implies `total > 0` and the zero-total arm cannot run (defensive).
- `dlmm-bin-step` L833 (then only): the `fee > 0` guard on the gross-up; the DLMM pool's fee is 15 bps, a constant of the pool, so the zero-fee arm cannot run.
- This report counts only the two simulations that deployed the router at 6d8b5f2 (the dust fix on top of the taker-aware `get-taker-capacity` and the maker door): the router v5 (`4e1afb02`) and vault v6 (`a9e9e858`) rows of the README's "Full rerun on b8b6f3e" table. Earlier router and vault runs deployed older router bytes, whose expression ids do not line up with this source, and are left out. The pro-rata XYK / Velar split (both directions) and the empty DLMM stage are reached by pricing the venues apart on the fork (router W18 / W19).
- Fixed at 6d8b5f2 (was a finding here): a smart STX sale the book absorbs almost whole left the taker's rounding dust (under one sat's worth of uSTX) as the residual; the router sent it to the DLMM, whose limit-derived minimum rounds to one sat while the fill rounds to zero, and the DLMM's u2003 sank the whole swap. Now a residual worth at most one unit of the other token stays home (`dust-left` on the DLMM and XYK / Velar stages, counted as unsold); both `dust-left` arms are taken above (vault V11 sells 100 STX at +10% into the fillers' +5% asks again, router W18 / W19 keep the pools busy). The sBTC side was immune (dust in sats always buys some uSTX).
- Read-only functions leave no trace: stxer traces transactions only, and every read-only here is exercised through `addEvalCode` reads in the harnesses (their lines show as uncovered above). Top-level definitions run at deploy, which has no trace either.
