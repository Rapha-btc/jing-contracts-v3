# Router v5-3: DLMM pool pick and dust legs

`swap-router-sbtc-stx-jing-v5-3` sends its DLMM leg to one of Bitflow's three
STX/sBTC pools: `dlmm-pool-stx-sbtc-v-1-bps-15`, `-v-2-bps-15` and
`-v-3-bps-15`. The three run byte-identical source. Each covers 1001 bins of
15 bps (about 0.47x to 2.1x its initial price); Bitflow opened a new pool when
the price left an older one's range, so together they tile one price range.
Usually one pool is in range with both assets; the others sit at a stale edge
with one asset, or are nearly empty. The router interface did not change, so
the vaults, rungs and market are unaffected.

## History

| Commit | Rule | Problem found |
| --- | --- | --- |
| before `df091b8` | hardcoded `v-2` | On 2026-10-01 v-2 held 0.0008 STX (out of range): every sBTC sale failed with `u2003`, including the vaults' emergency sales. |
| `df091b8` | the pool holding the most of the asset bought | On 2026-10-02 v-2 held more sBTC than v-1 but sat at bin 500 (414.91 sats/STX vs 442.46): STX sellers got 5.8% less, and the capacity walk returned 0 for tighter limits. Found by Diamond Lance (Nilo), bounty `muqchqnaa54e769598a4`. |
| `1063add` | Nilo's patch: best active-bin price among pools with at least 1% of the deepest balance | An active bin moves for free through empty bins, so a pool with 1% of the balance and an empty active bin quoted the best price while its liquidity sat far away. Fork repro: 21% less on a 1M-sat sale with no minimum. |
| `280c81c` | best payout for the leg's amount (below) | |
| `c2b046a` | dust legs dropped (below) | |
| `2373cec` | the walk carries only the reachable bin factors | Runtime of a two-pool pick fell from 11.36M to 4.79M. |

## The rule

`(dlmm-pick sell-sbtc amount)`:

1. A pool is eligible if its balance of the asset the leg buys (STX when
   selling sBTC, sBTC when selling STX) is above 0 and at least 1% of the
   deepest pool's. The 1% only saves walking dust pools.
2. With fewer than two eligible pools, the eligible one is used (`u1` if none)
   and nothing is walked.
3. Otherwise one read of `dlmm-core-v-1-1 get-bin-factors-by-step u15` prices
   every bin. `dlmm-out` walks each eligible pool from its active bin, up to 30
   bins: each bin pays what it holds of the bought asset for its input (fee
   added); the bin that runs the input out pays the rest at its own price. A
   pool with another bin step is not priced.
4. The highest payout wins; ties go to the lower pool number.

Manual legs pick with their own amount. The smart DLMM stage picks once with
what is left to sell and uses that pool for both `dlmm-capacity` and the sale
(`dlmm-sell`). Every leg keeps the caller's limit-derived minimum, so a
less-than-best pick costs fill quality, never a fill below the limit.

An empty active bin or a stale one-sided pool cannot win: what counts is what
the pool would actually pay for the amount. On the fork the steering case
leaves the pick on v-1 and the taker gets exactly the v-1 amount; Nilo's case
sends 1,000 STX to v-1 (436,307 sats) over v-2 (412,835).

Limits: one pool per leg (no split across two pools at a range seam; what the
pool does not fill goes to XYK and Velar); the estimate counts at most 30 bins
(about 4.6% of price), which matched the actual fills within 0 to 1 bps on the
fork. The Bitflow APIs (`/api/quotes/v1/pools`, `/api/app/v2/tickers`) are for
front ends and monitoring; the contract cannot read them, and a caller-chosen
pool would let any keeper of the permissionless vault `router-swap` steer it.

## Dust legs (`c2b046a`)

A smart swap reverted when a venue had a few units of room left at the limit:
`cp-split` gave XYK a 6-uSTX leg, `amm-floor` set its minimum to `u1`, the pool
paid 0 and refused (`u1019`), and the whole swap went down. Present since
`df091b8`. `dlmm-stage` now sells only a plan that fetches at least one unit at
the limit, and `cp-stage` drops any XYK or Velar leg for which `dust-left`
holds. Dropped units stay unsold.

## Cost per swap

Same fork block, same trades (manual DLMM-only legs):

| Router | Sell 100k sats (one eligible pool) | Sell 100 STX (two eligible pools) |
| --- | --- | --- |
| `df091b8` | 3.93M runtime, 55 reads | 3.95M runtime, 75 reads |
| `1063add` | 3.93M, 55 | 4.32M, 97 |
| `c2b046a` | 3.93M, 55 | 11.36M, 115 |
| `2373cec` | 3.93M, 55 | 4.79M, 115 |

A Stacks block allows 5,000M runtime and 15,000 reads.

## Tests

- Clarinet `tests/unit/router-v5-3`: 321/321; functions 40/40, lines 625/629
  (99.36%), branches 237/238 (99.58%). 136 pick cases (deeper but worse pool,
  steering, 30-bin limit, partial last bin, fees, ties, 1% floor, bin step,
  single pool, empty pools), each checking the traded pool and amounts. With the
  `1063add` pick restored, 32 of them fail.
- stxer on `2373cec` (router suites at the tip): manual 368/368, smart 588/588
  (dust legs: S3, S11), pool-pick 187/187, steering regression 60/60,
  rebate-age 482/482, V6 router suite 296/296, router-impact 398/398,
  bin-boundary 26/26. Template deploy bytes 17/17.
- Vaults on `2373cec`, pinned at block 9105882: juice 13/13 runs, fastpool
  8/8, ccd016 v2 7/7. The vault-fixes L-1 cases need a block where 1M sats do
  not all fit inside the 40 bps floor; at block 9105969 they did (on both
  `280c81c` and `c2b046a`), so those two cases are block-sensitive.

## Credit

Diamond Lance (Nilo) found the stale-pool pick in `df091b8` and proposed the
price pick (`1063add`), AIBTC bounty `muqchqnaa54e769598a4`, submission
`muqdalx67080a333d102`.
