# Trace coverage: jing-buy-stx-core-spread-v1

From `simulations/trace-coverage.mjs` on 2026-10-14, source at simulations/deploy-bytes-mv7dfb/jing-buy-stx-core-spread-v1.clar at 7e42b9c: 1 simulations, 217 transactions (14 without a trace), every evaluated expression read from the stxer debug traces.

| metric | value |
|---|---|
| expressions executed / total | 28 / 928 (3.0%) |
| code lines touched / total | 14 / 545 (2.6%) |
| function body lines touched / total (top-level definitions excluded) | 14 / 494 (2.8%) |
| branch nodes (if / match / asserts!) | 62: 4 full, 1 partial, 57 never reached |

## Branches with one arm never taken (1)

| line | function | kind | state |
|---|---|---|---|
| 347 | initialize | if | one arm (then only) |

## Branch nodes never reached (57)

| line | function | kind |
|---|---|---|
| 39 | miner-mid | match |
| 154 | get-position | match |
| 160 | get-position | if |
| 165 | get-position | if |
| 169 | get-position | if |
| 178 | get-position | if |
| 203 | epoch-payout | if |
| 206 | epoch-payout | if |
| 211 | epoch-payout | match |
| 212 | epoch-payout | if |
| 247 | carried | if |
| 284 | earned-step | if |
| 287 | earned-step | if |
| 291 | earned-step | if |
| 364 | set-push-paused | asserts! |
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
| 628 | roll-tail | if |
| 670 | count-reserve-claim | match |
| 671 | count-reserve-claim | if |
| 675 | count-reserve-claim | if |
| 679 | count-reserve-claim | if |
| 690 | settle-proceeds | match |
| 696 | settle-proceeds | if |
| 700 | settle-proceeds | if |
| 706 | settle-proceeds | if |
| 739 | settle-proceeds | if |
| 768 | push-to-market | asserts! |
| 769 | push-to-market | asserts! |
| 772 | push-to-market | asserts! |
| 784 | refresh-guard | asserts! |
| 785 | refresh-guard | asserts! |
| 794 | settle-escrow | match |
| 795 | settle-escrow | if |
| 827 | escrow-for | if |
| 838 | pull-to-held-sats | if |
| 844 | pull-to-held-sats | asserts! |
| 845 | pull-to-held-sats | if |

## Uncovered code lines by function

| function | lines |
|---|---|
| (top) | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 16, 17, 18, 19, 21, 23, 24, 25, 26, 27, 29, 31, 33, 35, 36, 60, 62, 64, 66, 67, 69, 71, 73, 78, 83, 92, 93, 97, 98, 100, 102, 104, 109, 111, 113, 115, 117, 119 |
| withdraw | 518, 519, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 531, 533, 534, 535, 537, 541, 542, 543, 548, 550, 551, 552, 553, 554, 555, 556, 558, 562, 563, 564, 566, 567, 568, 571, 572, 573, 575, 576, 577, 578, 579, 580, 581, 582, 583, 586, 587, 589, 591 |
| settle-proceeds | 690, 691, 692, 693, 694, 695, 696, 697, 698, 700, 701, 702, 704, 705, 706, 708, 710, 712, 713, 715, 716, 717, 718, 721, 722, 724, 726, 727, 730, 731, 732, 733, 736, 737, 739, 740, 741, 747, 750, 751, 752, 754, 759 |
| sync | 377, 378, 379, 380, 382, 383, 384, 385, 387, 388, 389, 391, 392, 393, 394, 395, 397, 398, 400, 401, 402, 403, 404, 406, 407, 408, 410, 412, 413, 415, 416, 417, 418, 419, 420, 423, 424, 429 |
| deposit | 436, 437, 438, 440, 441, 442, 443, 444, 445, 446, 449, 450, 451, 452, 454, 458, 459, 460, 462, 463, 465, 467, 468, 469, 471, 472, 473, 475, 476, 478, 482, 483 |
| get-position | 154, 155, 156, 157, 158, 159, 160, 161, 162, 164, 165, 166, 167, 168, 169, 170, 171, 176, 177, 178, 179, 180, 184, 186, 187, 190 |
| roll-tail | 627, 628, 629, 630, 631, 637, 638, 639, 641, 643, 644, 645, 646, 647, 648, 649, 651, 653, 654, 655, 656, 657, 658, 659, 660 |
| pull-to-held-sats | 837, 838, 839, 840, 841, 842, 844, 845, 846, 847, 848, 850, 851, 853, 854, 856, 857 |
| push | 491, 492, 493, 494, 495, 496, 497, 498, 499, 502, 503, 506, 507, 509 |
| earned-step | 283, 284, 286, 287, 288, 289, 291, 292, 293, 295, 296, 297, 299 |
| get-state | 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149 |
| settle-escrow | 794, 795, 796, 797, 799, 800, 801, 803, 804, 805, 807, 810 |
| epoch-payout | 203, 204, 206, 207, 211, 212, 213, 214, 215, 217, 222 |
| count-reserve-claim | 670, 671, 672, 673, 674, 675, 677, 679, 681 |
| push-to-market | 767, 768, 769, 772, 773, 774, 775, 776 |
| market-size | 306, 307, 310, 316, 320, 321, 322 |
| refresh-guard | 783, 784, 785, 786, 787, 788 |
| set-push-paused | 363, 364, 367, 368, 372 |
| position-of | 616, 617, 618, 620, 622 |
| escrow-for | 827, 828, 829, 830, 831 |
| on-book | 815, 816, 817, 819 |
| claim | 600, 601, 602, 603 |
| min-market | 53, 54 |
| carried | 247, 249 |
| earned | 260, 261 |
| initialize | 353, 354 |
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
| miner-mid | 39 |
| current-floor | 49 |
| epoch-reserve | 85 |
| positions | 121 |
| get-spread-bps | 130 |
| get-floor | 134 |
| pooled-sbtc | 330 |
| final-scale | 239 |
| final-unfilled | 231 |
| final-index | 235 |

## Per simulation (cumulative executed expressions of jing-buy-stx-core-spread-v1)

| sim | txs | before | after |
|---|---|---|---|
| `5cf1573f` | 217 | 0 | 45 |

## Provenance and trace diagnostics

source simulations/deploy-bytes-mv7dfb/jing-buy-stx-core-spread-v1.clar at 7e42b9c, sha256 `0a8639678768e49495a26263d462f0dab100815a83c424121c801124c4e89bd6`. Only deployments with that exact code are counted.

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
| `5cf1573f` | jing-buy-stx-spread-0, jing-buy-stx-spread-10, jing-buy-stx-spread-20, jing-buy-stx-spread-30, jing-buy-stx-spread-40, jing-buy-stx-spread-50, jing-buy-stx-spread-60, jing-buy-stx-spread-70, jing-buy-stx-spread-80, jing-buy-stx-spread-90 |

| excluded deployment (name@hash) | sims |
|---|---|
| bob-autostake-safe@dda5367c1800 | 1 |
| ccd015-redemption-book-mia-stx@6b5daed326f5 | 1 |
| ccd016-swap-vault-mia-v2@a7062d390719 | 1 |
| dlmm-core-v-1-2@009ea45feca3 | 1 |
| fastpool-swap-vault@aaebf34b4f14 | 1 |
| jing-core-v6@973482e429cf | 1 |
| jing-ladder-dispatch@25858ef64f1d | 1 |
| jing-ladder-v1@6a5e204d47d8 | 1 |
| jing-rung-deposit-trait@5979727e42d5 | 1 |
| jing-sell-stx-spread-0@7fb80650787a | 1 |
| jing-sell-stx-spread-10@7fb80650787a | 1 |
| jing-sell-stx-spread-20@7fb80650787a | 1 |
| jing-sell-stx-spread-30@7fb80650787a | 1 |
| jing-sell-stx-spread-40@7fb80650787a | 1 |
| jing-sell-stx-spread-50@7fb80650787a | 1 |
| jing-sell-stx-spread-60@7fb80650787a | 1 |
| jing-sell-stx-spread-70@7fb80650787a | 1 |
| jing-sell-stx-spread-80@7fb80650787a | 1 |
| jing-sell-stx-spread-90@7fb80650787a | 1 |
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
