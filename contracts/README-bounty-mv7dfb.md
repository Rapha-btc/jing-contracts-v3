# Bounty mv7dfb: router v5-3 audit on the final bytes

AIBTC bounty `mv7dfb43df5505479788` (10k), on the final v6-3 deploy set
(`DEPLOY-PLAN.md`). This file collects the accepted findings.

## Zealous Citadel: limit-blind DLMM pick in the smart stage

Status: accepted. Fix in the working tree of
`contracts/swap-router-sbtc-stx-jing-v5-3.clar`, not committed yet.

### The finding

`dlmm-stage` picked its pool with `dlmm-pick`. The pick ranks pools by
`dlmm-out`, a 30-bin walk with no price bound. Then the stage sized the leg
on that pool with `dlmm-capacity limit`, which stops at the first bin past
the limit.

So a deep pool parked past the limit could win the pick. Its capacity at
the limit was 0, the plan was 0, and the DLMM leg sold nothing. Another pool
had liquidity inside the limit, and it was not used.

Their mainnet fork (block 9203637, 5,000 STX sold for sBTC, limit
19,578,110,904,240): prod picks pool 2 (parked at bin 500) and gets
1,359,288 sats. The patch picks pool 1 and gets 1,482,269 sats (+9.05%).
Their sims: [prod](https://stxer.xyz/simulations/mainnet/dfcb1656465e6a5ac749f285ef6725f5),
[patched](https://stxer.xyz/simulations/mainnet/9dc6b7b794f4eb5824ca4c5de435e838).

### The change

Their proposal, kept small:

- `dlmm-pick` takes a third argument, `limit`. `dlmm-stage` passes its limit.
  The manual legs (`amm-sell-sbtc`, `amm-sell-stx`) pass `u0`, which means no
  limit. Their pick does not change.
- `dlmm-pick` passes `limit` to `dlmm-out`. `dlmm-out` computes the threshold
  once per pool. With `u0` the threshold is a bound that every bin meets
  (max uint selling sBTC, `u0` selling STX).
- `dlmm-out-step` compares the bin price with the threshold. A bin past it
  pays nothing and ends the walk. This is one compare per bin and no extra
  read. The walk can only stop earlier than before.
- New `dlmm-threshold` holds the fee-adjusted threshold formula.
  `dlmm-capacity` now calls it too, so the pick and the capacity walk use the
  same comparison on the same number.

The rest of the `280c81c` / `1063add` rule is the same: the 1% floor, the
single-pool shortcut, the disabled-pool check, the ties to the lower number,
and one pick per stage for both the capacity walk and the sale.

One note on Clarity: the threshold is bound in a `let` outside the fold's
tuple. A call to a private function inside `{ }` is not seen by the
definition sorter, and `clarinet check` on Clarity 5 then fails with
"use of unresolved function".

### Results

- `clarinet check`: passes (root and `tests/unit/router-v5-3`).
- Clarinet `npm run test:router-v5-3`: 478/478 (446 before, 32 new in
  `tests/unit/router-v5-3/limit-pick.test.ts`). Functions 44/44, lines
  683/687 (99.42%), branches 270/271 (99.63%).
- New tests, both sides: deep pool past the limit vs in-range pool (pool 2
  vs 1, and pool 1 vs 3), partial room on the deep pool, the boundary bin
  (offset 10 in, offset 11 out), a 30 bps fee that moves the threshold, a
  deep pool that still wins inside the limit, a control with pool 2
  disabled (same fill as the fixed pick), no pool inside the limit (sells
  nothing, no revert), and manual legs (still the limit-blind pick). On the
  router at HEAD, 10 of the 32 fail: each smart case where the two picks
  differ.
- stxer harnesses (working-tree router, market at HEAD):
  - `verify-router-v5-3-limit-pick-mv7dfb.js` (new): 38/38. Block 9203637:
    prod pick u2, out 1,359,288; patched pick u1, out 1,482,269 (+9.05%),
    the same numbers as theirs.
    [prod](https://stxer.xyz/simulations/mainnet/3172078570ebd5a40829abe453a290a0),
    [patched](https://stxer.xyz/simulations/mainnet/ca6885b2e057464332be64003dc2bffa).
    Block 9207558 (tip - 3 on 2026-10-14), limit 2% past pool 1: prod pick
    u2, DLMM 0, out 1,723,071; patched pick u1, DLMM 276,846,829 uSTX, out
    1,863,835 (+8.17%).
    [prod](https://stxer.xyz/simulations/mainnet/5f7378bf58db770cc387cc60f94fd1f2),
    [patched](https://stxer.xyz/simulations/mainnet/47c9e9cebfdebd389e9ea48d748b6745).
    The manual pick (u0) is u2 on both routers.
  - `verify-router-v5-3-smart.js`: 589/589
    ([sim](https://stxer.xyz/simulations/mainnet/b915c209061efa410ca5d60727487900)).
  - `verify-router-v5-3-manual.js`: 410/410
    ([sim](https://stxer.xyz/simulations/mainnet/71c280d09ed83cefd8dd2a7bdc7f5b32)).
  - `verify-router-v5-3-pool-pick.js`: 225/225
    ([sim](https://stxer.xyz/simulations/mainnet/14af9263dd0d312e647f9bc2f87ee310)).
  - `verify-router-v5-3-xyk-snapshot.js`: 75/75
    ([sim](https://stxer.xyz/simulations/mainnet/14d1a8b5edaa5cd7e5b4d796ff866833)).
  - `verify-v6-3-router-bin-boundary.js`: 26/26
    ([sim](https://stxer.xyz/simulations/mainnet/5c7aace31518cc5f0a0a302bc5046be7)).
  - `verify-router-v5-3-rebate-age.js`: 482/482
    ([sim](https://stxer.xyz/simulations/mainnet/11e162f185ad00d0d9a50bc6195f3e8c)).
  - `verify-router-v5-3-pool-pick-steer.js`: 34/35 on this router and 34/35
    on the router at HEAD, the same check (#35). At the tip, the manual
    1M-sat sale before it moves v-1 past the smart limit that the harness
    computed before that sale, so v-1 capacity is 0 on both. The harness is
    stale at this block; the change does not cause it.
- Harness update: `_router-v5-3-harness.js` `dlmmOutModel` and `dlmmPick`
  take an optional `limit` (default 0n, the manual legs).
  `verify-router-v5-3-smart.js` sizing reads `dlmm-pick` with the limit.
- Deploy bytes (comment-stripped, `clarinet format`, as the faktory-dao
  template): 32,304 before (matches the `f342615` template, SHA-256
  `55927837...`), 32,949 after (+645).

### Follow-ups

- Refresh the faktory-dao router template after the commit
  (`swap-router-sbtc-stx-jing-v5-3-template.ts`).
- An earlier submission (PlatinumVera, `murq0k2xe78066bc7441`, previous
  bounty) asked for a limit-aware pick. It was filed under Nilo's root cause.
  This change is the limit-aware part.

## Giant Moth note 01: a migrated DLMM pool reverts the smart swap

Status: accepted. Fix in the working tree of
`contracts/swap-router-sbtc-stx-jing-v5-3.clar` (`dlmm-enabled`), not
committed yet.

### The finding

Bitflow's `migrate-pool` (`dlmm-core-v-1-1` L325-380) calls the new core's
`accept-migrated-pool` and then the pool's `set-core-address`. It does not
touch the old core's `pools` entry: `status` stays true and
`pool-contract` still names the pool. Every core swap asserts
`(is-eq (get core-address pool-data) current-contract)` (u1060,
`ERR_NOT_MANAGED_POOL`). So `dlmm-enabled` passed a migrated pool, the pick
could choose it, and the sale through `dlmm-core-v-1-1` reverted the whole
smart swap.

### The change

`dlmm-enabled` adds a third condition: the pool's `get-pool` `core-address`
is `DLMM_CORE`. The id maps to the pool index (`DLMM_POOL_ID_2` -> u2,
`DLMM_POOL_ID_3` -> u3, else u1) for `dlmm-pool-info`. A migrated pool then
has depth 0, as a disabled one: it is not picked, it does not set the 1%
floor, and a migrated pool 1 (the no-eligible-pool fallback) gets no
capacity in `dlmm-stage`.

- Shape: all three live pools (`dlmm-pool-stx-sbtc-v-1/2/3-bps-15`) return
  `core-address` in `get-pool` (from `pool-addresses`); on 2026-10-14 all
  three read `dlmm-core-v-1-1`. `set-core-address` is the only writer, and
  only the current core can call it.
- Cost: one more `get-pool` read per pool that holds the asset (the `and`
  in `dlmm-depth` stops early on a zero balance, and status / pool-contract
  are checked first), plus one for pool 1 on the fallback path. At most 4
  reads per DLMM stage. `get-pool` reads 3 data vars; no map or list work.

### Results

- `clarinet check`: passes (root and `tests/unit/router-v5-3`).
- `npm run test:router-v5-3`: 490/490 (478 before, 12 new in
  `limit-pick.test.ts`, "migrated DLMM pool"). Functions 44/44, lines
  692/696 (99.43%), branches 275/276 (99.64%).
- Fixture: `venues.clar` `get-pool` now returns `core-address` (default the
  deployer's `.dlmm-router`, the build's `DLMM_CORE` substitute, built with
  `principal-construct?` so there is no deploy cycle). `set-core` moves it.
- New tests, both sides: every pool reports `DLMM_CORE` by default; control
  (pool 2 wins on `DLMM_CORE`); migrated pool 2 is not picked, pool 1 sells
  (smart and manual); migrated pool 1 loses to pool 3; only pool 1 holds
  liquidity and is migrated: `dlmm-cap` 0, no venue call, all unsold, no
  revert.
- stxer harnesses (working-tree router, market at HEAD, no Pyth key):
  all green.
  - `verify-router-v5-3-smart.js`: 589/589 ([1](https://stxer.xyz/simulations/mainnet/9ef16549e3afadc6955b5a17bace0bd1),
    [2](https://stxer.xyz/simulations/mainnet/811e537c82b6c51630256a2b05fac65e), [3](https://stxer.xyz/simulations/mainnet/8b76eaa6cde86434708b6c47e7c0fe1f)).
  - `verify-router-v5-3-manual.js`: 410/410
    ([sim](https://stxer.xyz/simulations/mainnet/29ca0c9e0e33534c2e5aa2e71453d44e)).
  - `verify-router-v5-3-pool-pick.js`: 225/225
    ([sim](https://stxer.xyz/simulations/mainnet/c9630bba0bcf95f63b3c6f7bb5dab785)).
  - `verify-v6-3-router-bin-boundary.js`: 26/26
    ([sim](https://stxer.xyz/simulations/mainnet/e139d69af8fadf09f0a61c55cd4a2e28)).
  - `verify-router-v5-3-xyk-snapshot.js`: 75/75
    ([sim](https://stxer.xyz/simulations/mainnet/bad9fd5650b2eb06d6760918abd697c9)).
  - `verify-router-v5-3-rebate-age.js`: 482/482
    ([sim](https://stxer.xyz/simulations/mainnet/53c6139ee37820da7ee12c7d8d99dd8e)).
  - `verify-router-v5-3-limit-pick-mv7dfb.js`: 38/38, same picks and
    outputs as before at block 9203637 (+9.05%) and +9.46% at 9207819.
    [prod](https://stxer.xyz/simulations/mainnet/f7f0f23f1bfee20eb38800ec2e0f113a),
    [patched](https://stxer.xyz/simulations/mainnet/d6ba488d86dd251ea39fe7490d9f4135);
    [prod](https://stxer.xyz/simulations/mainnet/b745870857bc32a85ab77b26dd035526),
    [patched](https://stxer.xyz/simulations/mainnet/e437eeba745f838a89992773c0d0ef0e).
  The live pools all report `DLMM_CORE`, so no mainnet pick changes.
- Deploy bytes (same method): 32,949 before, 33,216 after (+267).

## Not taken

### Violet Reed: `router-swap-split` reverts on a bid in the net band

Status: by design, no change.

The claim: the three swap vaults call the manual `swap-sbtc-for-stx`
(router v5-3 L466 at `c14f038`) with a gross min-out. The manual book leg
fills at the maker's price but pays net of the prepaid rebate and the 10 bps
fee. A best bid in `[limit, book-limit(limit))` (L822) fills under the gross
floor, and L524 aborts the split with u3002.

The trace is right, but it is the intended manual-path rule. `e5c58c4` moved
only the smart paths to `book-limit` ("Manual paths unchanged"). A manual
caller signs its own min-out and gets it or a revert. The direction is safe:
nothing fills under the caller's floor. The vaults' split is operator-only.
The operator sizes the book slice with `get-taker-capacity` at `book-limit`,
as `jing-size` does (L838-890), and the walk then stops above `book-limit`.
The permissionless smart `router-swap` already skips a band bid. Full
reasoning: juicestx `contracts/pox-5/README-bounty-mv7dfb.md` section 9.

### Rare Io I3: hoist `cycle-totals` out of `execute-fill`

**Rejected, not worth it.** The change is correct: nothing reads
`cycle-totals` during the walk, and a side-by-side fork run (old vs new market,
same block and Lazer updates) gave 383/383 with identical tx results and
events. But it is not a gas win:

- Each walk saves only n - 1 map reads and n - 1 writes: 0 to 5 reads and 0 to
  2 writes on swaps with 1 to 3 fills.
- Runtime goes up 11k to 29k (about 1%) and read_length by 331 to 589, from
  the larger walk accumulator, a new `add-fill` call and a bigger contract.
- Deploy bytes go from 97,704 to 98,293, closer to the 100,000 cap, on the
  market's core fill path, after the market was already bountied and simmed.

The market source stays as it was.
