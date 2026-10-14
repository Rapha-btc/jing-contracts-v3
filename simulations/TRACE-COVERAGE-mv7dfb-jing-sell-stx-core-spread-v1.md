# Trace coverage: jing-sell-stx-core-spread-v1

From `simulations/trace-coverage.mjs` on 2026-10-14, source at simulations/deploy-bytes-mv7dfb/jing-sell-stx-core-spread-v1.clar at 7e42b9c: 1 simulations, 217 transactions (14 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 28 / 929 (3.0%) |
| code lines touched / total | 14 / 545 (2.6%) |
| function body lines touched / total (top-level definitions excluded) | 14 / 492 (2.8%) |
| branch nodes (if / match / asserts!) | 62: 4 full, 1 partial, 57 never reached |

## Branches with one arm never taken (1)

| line | function | kind | state |
|---|---|---|---|
| 349 | initialize | if | one arm (then only) |

## Branch nodes never reached (57)

| line | function | kind |
|---|---|---|
| 41 | miner-mid | match |
| 156 | get-position | match |
| 162 | get-position | if |
| 167 | get-position | if |
| 171 | get-position | if |
| 180 | get-position | if |
| 205 | epoch-payout | if |
| 208 | epoch-payout | if |
| 213 | epoch-payout | match |
| 214 | epoch-payout | if |
| 249 | carried | if |
| 286 | earned-step | if |
| 289 | earned-step | if |
| 293 | earned-step | if |
| 366 | set-push-paused | asserts! |
| 387 | sync | asserts! |
| 389 | sync | if |
| 393 | sync | if |
| 404 | sync | if |
| 410 | sync | if |
| 437 | deposit | asserts! |
| 438 | deposit | asserts! |
| 445 | deposit | if |
| 454 | deposit | asserts! |
| 458 | deposit | if |
| 492 | push | asserts! |
| 502 | push | if |
| 519 | withdraw | asserts! |
| 520 | withdraw | asserts! |
| 523 | withdraw | if |
| 529 | withdraw | if |
| 537 | withdraw | if |
| 541 | withdraw | if |
| 543 | withdraw | if |
| 562 | withdraw | if |
| 601 | claim | asserts! |
| 629 | roll-tail | if |
| 669 | count-reserve-claim | match |
| 670 | count-reserve-claim | if |
| 674 | count-reserve-claim | if |
| 678 | count-reserve-claim | if |
| 689 | settle-proceeds | match |
| 695 | settle-proceeds | if |
| 699 | settle-proceeds | if |
| 705 | settle-proceeds | if |
| 738 | settle-proceeds | if |
| 767 | push-to-market | asserts! |
| 768 | push-to-market | asserts! |
| 771 | push-to-market | asserts! |
| 783 | refresh-guard | asserts! |
| 784 | refresh-guard | asserts! |
| 793 | settle-escrow | match |
| 794 | settle-escrow | if |
| 826 | escrow-for | if |
| 837 | pull-to-held-ustx | if |
| 843 | pull-to-held-ustx | asserts! |
| 844 | pull-to-held-ustx | if |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 16, 17, 18, 19, 21, 23, 24, 25, 26, 27, 28, 29, 31, 33, 35, 37, 38, 62, 64, 66, 68, 69, 71, 73, 75, 80, 85, 94, 95, 99, 100, 102, 104, 106, 111, 113, 115, 117, 119, 121 |
| withdraw | 518, 519, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 531, 533, 534, 535, 537, 541, 542, 543, 548, 550, 551, 552, 553, 554, 555, 556, 558, 562, 563, 564, 566, 567, 568, 571, 572, 573, 575, 576, 577, 578, 579, 580, 581, 582, 583, 586, 587, 589, 591 |
| settle-proceeds | 689, 690, 691, 692, 693, 694, 695, 696, 697, 699, 700, 701, 703, 704, 705, 707, 709, 711, 712, 714, 715, 716, 717, 720, 721, 723, 725, 726, 729, 730, 731, 732, 735, 736, 738, 739, 740, 746, 749, 750, 751, 753, 758 |
| sync | 379, 380, 381, 382, 383, 384, 385, 387, 388, 389, 391, 392, 393, 394, 395, 397, 398, 400, 401, 402, 403, 404, 406, 407, 408, 410, 412, 413, 415, 416, 417, 418, 419, 420, 423, 424, 429 |
| deposit | 436, 437, 438, 440, 441, 442, 443, 444, 445, 446, 449, 450, 451, 452, 454, 458, 459, 460, 462, 463, 465, 467, 468, 469, 471, 472, 473, 475, 476, 478, 482, 483 |
| get-position | 156, 157, 158, 159, 160, 161, 162, 163, 164, 166, 167, 168, 169, 170, 171, 172, 173, 178, 179, 180, 181, 182, 186, 188, 189, 192 |
| roll-tail | 628, 629, 630, 631, 632, 638, 639, 640, 642, 643, 644, 645, 646, 647, 648, 650, 652, 653, 654, 655, 656, 657, 658, 659 |
| pull-to-held-ustx | 836, 837, 838, 839, 840, 841, 843, 844, 845, 846, 847, 849, 850, 852, 853, 855, 856 |
| push | 491, 492, 493, 494, 495, 496, 497, 498, 499, 502, 503, 506, 507, 509 |
| earned-step | 285, 286, 288, 289, 290, 291, 293, 294, 295, 297, 298, 299, 301 |
| get-state | 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151 |
| settle-escrow | 793, 794, 795, 796, 798, 799, 800, 802, 803, 804, 806, 809 |
| epoch-payout | 205, 206, 208, 209, 213, 214, 215, 216, 217, 219, 224 |
| count-reserve-claim | 669, 670, 671, 672, 673, 674, 676, 678, 680 |
| push-to-market | 766, 767, 768, 771, 772, 773, 774, 775 |
| market-size | 308, 309, 312, 318, 322, 323, 324 |
| refresh-guard | 782, 783, 784, 785, 786, 787 |
| set-push-paused | 365, 366, 369, 370, 374 |
| position-of | 617, 618, 619, 621, 623 |
| escrow-for | 826, 827, 828, 829, 830 |
| on-book | 814, 815, 816, 818 |
| claim | 600, 601, 602, 604 |
| min-market | 55, 56 |
| carried | 249, 251 |
| earned | 262, 263 |
| initialize | 355, 356 |
| ERR_NOT_AUTHORIZED | 1 |
| ERR_ALREADY_INITIALIZED | 2 |
| ERR_NOT_INITIALIZED | 3 |
| ERR_ZERO_AMOUNT | 4 |
| ERR_TOO_SMALL | 5 |
| ERR_NO_POSITION | 6 |
| ERR_INSUFFICIENT | 7 |
| ERR_ZERO_PRICE | 8 |
| ERR_BAD_SPREAD | 9 |
| ERR_BAD_NAME | 10 |
| ERR_UPDATE_REQUIRED | 16 |
| ERR_PUSH_PAUSED | 17 |
| ERR_ESCROW_COOLDOWN | 18 |
| ERR_TOO_MANY_SHARES | 19 |
| miner-mid | 41 |
| current-cap | 51 |
| epoch-reserve | 87 |
| positions | 123 |
| get-spread-bps | 132 |
| get-cap | 136 |
| pooled-stx | 332 |
| final-scale | 241 |
| final-unfilled | 233 |
| final-index | 237 |

## Per simulation (cumulative executed expressions of jing-sell-stx-core-spread-v1)

| sim | txs | before | after |
|---|---|---|---|
| `5cf1573f` | 217 | 0 | 45 |

## Provenance and trace diagnostics

source simulations/deploy-bytes-mv7dfb/jing-sell-stx-core-spread-v1.clar at 7e42b9c, sha256 `7fb80650787a6710628084c8c715ebd9c0e810a4aa4d362192dd6efb8c0bac9f`. Only deployments with that exact code are counted.

| item | count |
|---|---|
| transactions | 217 |
| no trace returned by stxer | 14 |
| trace decode errors | 0 |
| calls to a counted market instance | 21 |
| ... of which without a trace | 0 |
| ... of which decode errors | 0 |

| sim | counted instances |
|---|---|
| `5cf1573f` | jing-sell-stx-spread-0, jing-sell-stx-spread-10, jing-sell-stx-spread-20, jing-sell-stx-spread-30, jing-sell-stx-spread-40, jing-sell-stx-spread-50, jing-sell-stx-spread-60, jing-sell-stx-spread-70, jing-sell-stx-spread-80, jing-sell-stx-spread-90 |

| excluded deployment (name@hash) | sims |
|---|---|
| bob-autostake-safe@dda5367c1800 | 1 |
| ccd015-redemption-book-mia-stx@6b5daed326f5 | 1 |
| ccd016-swap-vault-mia-v2@a7062d390719 | 1 |
| dlmm-core-v-1-2@009ea45feca3 | 1 |
| fastpool-swap-vault@aaebf34b4f14 | 1 |
| jing-buy-stx-spread-0@0a8639678768 | 1 |
| jing-buy-stx-spread-10@0a8639678768 | 1 |
| jing-buy-stx-spread-20@0a8639678768 | 1 |
| jing-buy-stx-spread-30@0a8639678768 | 1 |
| jing-buy-stx-spread-40@0a8639678768 | 1 |
| jing-buy-stx-spread-50@0a8639678768 | 1 |
| jing-buy-stx-spread-60@0a8639678768 | 1 |
| jing-buy-stx-spread-70@0a8639678768 | 1 |
| jing-buy-stx-spread-80@0a8639678768 | 1 |
| jing-buy-stx-spread-90@0a8639678768 | 1 |
| jing-core-v6@973482e429cf | 1 |
| jing-ladder-dispatch@25858ef64f1d | 1 |
| jing-ladder-v1@6a5e204d47d8 | 1 |
| jing-rung-deposit-trait@5979727e42d5 | 1 |
| juice-autostake-safe-auth-helpers-v1@aabf3ba32c56 | 1 |
| juice-autostake-safe@dda5367c1800 | 1 |
| juice-pool-sbtc-signer@57d8c3d384f1 | 1 |
| juice-sbtc-autoswap@ff0a45868897 | 1 |
| juice-swap-vault-trait-v2@655b22cb792a | 1 |
| mallory-autostake-safe@373cb4482db2 | 1 |
| markets-sbtc-stx-jing-v6-3@7b2f0f44fca1 | 1 |
| signer-manager-vault-stx-rewards@4858dbc67c46 | 1 |
| sim-ccip-proxy@616692f404fc | 1 |
| swap-router-sbtc-stx-jing-v5-3@3e457866be8d | 1 |
