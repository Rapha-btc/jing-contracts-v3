# Trace coverage: swap-router-sbtc-stx-jing-v5

From `simulations/trace-coverage.mjs` on 2026-09-15, source at 8193030: 2 simulations, 270 transactions (4 without a trace), every evaluated expression read from the stxer debug traces. Alias `^swap-router`: every same-source instance deployed under another name counts.

| metric | value |
|---|---|
| expressions executed / total | 577 / 1090 (52.9%) |
| code lines touched / total | 336 / 687 (48.9%) |
| function body lines touched / total (top-level definitions excluded) | 336 / 624 (53.8%) |
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
| (top) | 109, 110, 111, 112, 113, 115, 116, 117, 119, 121, 122, 124, 125, 126, 128, 129, 130, 132, 133, 134, 135, 136, 137, 138, 143, 147, 163, 189, 199, 213, 246, 272, 299, 309, 323, 338, 351, 362, 373, 474, 600, 601, 602, 605, 621, 631, 646, 666, 695, 697, 714, 756, 791, 792, 793, 798, 852, 896, 909, 938, 975, 1043, 1113 |
| swap-sbtc-for-stx | 373, 374, 375, 376, 377, 378, 379, 384, 389, 403 |
| swap-stx-for-sbtc | 474, 475, 476, 477, 478, 479, 480, 485, 490, 504 |
| xyk-swap | 213, 214, 215, 216, 228, 229, 232 |
| smart-swap-sbtc-for-stx | 975, 976, 977, 978, 979, 980, 989 |
| smart-swap-stx-for-sbtc | 1043, 1044, 1045, 1046, 1047, 1048, 1057 |
| jing-size | 714, 715, 716, 717, 718, 719 |
| jing-swap | 163, 164, 165, 166, 167 |
| with-fallback | 338, 339, 340, 341, 342 |
| cp-capacity | 666, 667, 671, 675, 676 |
| amm-leg | 896, 897, 898, 899, 900 |
| amm-sell-sbtc | 246, 247, 248, 249 |
| amm-sell-stx | 272, 273, 274, 275 |
| leg-sbtc | 309, 310, 311, 312 |
| leg-stx | 323, 324, 325, 326 |
| scale-min | 351, 352, 353, 354 |
| limit-min | 697, 698, 699, 700 |
| cp-split | 756, 757, 758, 759 |
| dlmm-stage | 909, 910, 911, 912 |
| cp-stage | 938, 939, 940, 941 |
| gain | 147, 148, 149 |
| dlmm-bin-step | 798, 799, 800 |
| dlmm-capacity | 852, 853, 854 |
| get-jing-min-deposits | 1113, 1114 |
| ERR_ZERO_AMOUNT | 132 |
| ERR_MIN_OUT | 133 |
| ERR_BAD_VENUE | 134 |
| ERR_SPLIT_MISMATCH | 135 |
| ERR_VAA_REQUIRED | 136 |
| ERR_ZERO_LIMIT | 137 |
| ERR_ZERO_MID | 138 |
| sbtc-balance | 143 |
| jing-spent | 189 |
| jing-out | 199 |
| amm-floor | 299 |
| valid-fallback | 362 |
| xyk-keep | 605 |
| velar-keep | 621 |
| xyk-reserves | 631 |
| velar-reserves | 646 |
| DLMM_WALK_BINS | 793 |

## Per simulation (cumulative executed expressions of swap-router-sbtc-stx-jing-v5)

| sim | txs | before | after |
|---|---|---|---|
| `4fe11e14` | 102 | 0 | 1446 |
| `400290a6` | 168 | 1446 | 1446 |

## Known unreachable (and why)

- `xyk-swap` L219 (then only) and L228 (never reached): the branch on the XYK pool's token order; `xyk-pool-sbtc-stx-v-1-1` has sBTC as its x token, fixed at deploy, so the `x-is-sbtc` false arm cannot run on mainnet (defensive, the pool is a constant of the router).
- `cp-split` L763 (then only): the `total > 0` guard inside the residual-fits arm; `cp-stage` never calls `cp-split` with nothing left, so a residual that fits (`residual <= total`) implies `total > 0` and the zero-total arm cannot run (defensive).
- `dlmm-bin-step` L833 (then only): the `fee > 0` guard on the gross-up; the DLMM pool's fee is 15 bps, a constant of the pool, so the zero-fee arm cannot run.
- This report counts only the two simulations that deployed the router at b8b6f3e (the taker-aware `get-taker-capacity`, four arguments; the maker door for a taker on a full side): the router v5 (`4fe11e14`) and vault v6 (`b312d1d2`) runs of the other window. The router and vault rows of the README's 2026-09-15 table (`6ed29637`, `aae15fd0`) ran on the router at 296c73f, whose expression ids do not line up with this source, and are left out. The pro-rata XYK / Velar split (both directions) and the empty DLMM stage are reached by pricing the venues apart on the fork (router W18 / W19).
- Finding (not a coverage item): a smart STX sale the book absorbs almost whole leaves the taker's rounding dust (under one sat's worth of uSTX) as the residual; the router sends it to the DLMM, whose limit-derived minimum rounds to one sat while the fill rounds to zero, and the DLMM's u2003 sinks the whole swap (seen from the vault harness, V11, at a +10% limit against the fillers' +5% asks; the vault sells at +4% to keep the book out). The sBTC side is immune (dust in sats always buys some uSTX).
- Read-only functions leave no trace: stxer traces transactions only, and every read-only here is exercised through `addEvalCode` reads in the harnesses (their lines show as uncovered above). Top-level definitions run at deploy, which has no trace either.
