# Bounty mv7dfb: router v5-3 audit on the final bytes

AIBTC bounty `mv7dfb43df5505479788` (10k), on the final v6-3 deploy set
(`DEPLOY-PLAN.md`). This file collects the accepted findings.

## Zealous Citadel: limit-blind DLMM pick in the smart stage

Status: accepted. Fix committed in `15aef66`
(`contracts/swap-router-sbtc-stx-jing-v5-3.clar`).

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
- Re-run on the committed bytes (router at `15aef66`, market at HEAD,
  2026-10-14):
  - `verify-router-v5-3-limit-pick-mv7dfb.js` (PROD = router at `f342615`):
    38/38. Block 9203637: pick u2 -> u1, out 1,359,288 -> 1,482,269
    (+9.05%) [prod](https://stxer.xyz/simulations/mainnet/c5d4ca0d88bd7b4299141c20fa28fc40),
    [patched](https://stxer.xyz/simulations/mainnet/9feff56361300c96f4dae4a42f661231). Block 9207942: pick
    u2 -> u1, DLMM 0 -> 360,292,180 uSTX, out 2,153,589 -> 2,335,153
    (+8.43%) [prod](https://stxer.xyz/simulations/mainnet/9ed2b05e73537f28b79286d7067ee3c6),
    [patched](https://stxer.xyz/simulations/mainnet/9a115d2188f9ef3c6c1361bc9dd08dad).
  - `verify-router-v5-3-smart.js`: 588/588
    ([1](https://stxer.xyz/simulations/mainnet/d3948d5ce4a4ad79ca4744487a70d44b), [2](https://stxer.xyz/simulations/mainnet/ddfef18644687e4389d2e7b0c1cc17ab),
    [3](https://stxer.xyz/simulations/mainnet/f781c8338413eb9a65210994c6dbded7)).
  - `verify-router-v5-3-manual.js`: 410/410 ([sim](https://stxer.xyz/simulations/mainnet/7c6fa36fb626bbcc787da159f486e700)).
  - `verify-router-v5-3-pool-pick.js`: 225/225 ([sim](https://stxer.xyz/simulations/mainnet/8deb5c9efbf5c4c73cc8ba1ee1a099a9)).
  - `verify-v6-3-router-bin-boundary.js`: 26/26 ([sim](https://stxer.xyz/simulations/mainnet/18909e71b47813ab1f9de98827ac2db8)).
  - `verify-router-v5-3-xyk-snapshot.js`: 75/75
    ([1](https://stxer.xyz/simulations/mainnet/8ac44da13bea7f54315f734dccd49383), [2](https://stxer.xyz/simulations/mainnet/ebdea471677e2de60fc2fdf3978e6e0a)).
  - `verify-router-v5-3-rebate-age.js`: 482/482
    ([1](https://stxer.xyz/simulations/mainnet/a9f07d18afcb1cdcc1b5549a0506f93d), [2](https://stxer.xyz/simulations/mainnet/231ef277ca20362eae4ec91f1b850189),
    [3](https://stxer.xyz/simulations/mainnet/0771d562a8b829d91da8d5e480165fba), [4](https://stxer.xyz/simulations/mainnet/f0d7201755766c8e4410c7a7f01d0355)).
    Three earlier tries stopped at check 15 (the fork tip's Bitcoin time was
    about 60 s ahead of the newest Lazer print); the next run, a minute
    later, is green.
  - `verify-v6-3-router-impact.js`: 398/398
    ([x base](https://stxer.xyz/simulations/mainnet/8b516dfd3252d8db0bf67f55258b6f42), [x](https://stxer.xyz/simulations/mainnet/247a106ef934e1c31d5158c39359bed1),
    [y base](https://stxer.xyz/simulations/mainnet/14ea179c418812efe4e7867d299869f3), [y](https://stxer.xyz/simulations/mainnet/e71d98a1134b1f019ce4ce856b62121a)).
  - `verify-router-v5-3-pool-pick-steer.js`: 34/35
    ([sim](https://stxer.xyz/simulations/mainnet/bf61bb251f08c2f165c30b4dd5f2c2b9)), and 34/35 on the `f342615`
    tree ([sim](https://stxer.xyz/simulations/mainnet/f37f8c8a529eee39a66a04962edea0f1)): the same stale check #35.
  - Not run: `verify-v6-3-dispatch.js` deploys router v5 (not v5-3), and
    `verify-vault-sbtc-stx-v6-parked.js` needs `PYTH_API_KEY`.
- Harness update: `_router-v5-3-harness.js` `dlmmOutModel` and `dlmmPick`
  take an optional `limit` (default 0n, the manual legs).
  `verify-router-v5-3-smart.js` sizing reads `dlmm-pick` with the limit.
- Deploy bytes (comment-stripped, `clarinet format`, as the faktory-dao
  template): 32,304 before (matches the `f342615` template, SHA-256
  `55927837...`), 33,216 after (+645).

### Follow-ups

- Refresh the faktory-dao router template after the commit
  (`swap-router-sbtc-stx-jing-v5-3-template.ts`).
- An earlier submission (PlatinumVera, `murq0k2xe78066bc7441`, previous
  bounty) asked for a limit-aware pick. It was filed under Nilo's root cause.
  This change is the limit-aware part.

## Giant Moth note 01: a migrated DLMM pool reverts the smart swap

Status: accepted. Fix committed in `15aef66`
(`contracts/swap-router-sbtc-stx-jing-v5-3.clar`, `dlmm-enabled`).

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
- Migration on the fork (new, `verify-router-v5-3-core-migration-mv7dfb.js`,
  block 9207954, result `simulations/fixtures/router-v5-3-core-migration-mv7dfb.json`):
  65/65. No patch: Bitflow's own path as its admin `SM1FKX...`. The live
  `dlmm-core-v-1-1` source is deployed as `dlmm-core-v-1-2` (bin step 15
  with the live factors, migration source = v-1-1); v-1-1
  `claim-protocol-fees`, `set-core-migration-target`, `migrate-pool`
  (u1059 before the cooldown, `(ok true)` after AdvanceBlocks 3 x 500,000 s).
  Pool v-2 (the pick of both routers for 5,000 STX) then reports the new
  core; the old core entry stays enabled; a direct v-1-1 `swap-x-for-y` on it
  is `(err u1060)`.
  - Router at `f342615` ([sim](https://stxer.xyz/simulations/mainnet/d5f7ff94b76c8a04512fd90303650a38)): `dlmm-enabled`
    still true for v-2, smart and manual picks stay u2; the 5,000 STX smart
    sale and the 5,000 STX manual DLMM leg both revert `(err u2001)`
    (Bitflow's `dlmm-swap-router-v-1-2` folds the core's u1060 into its
    ERR_NO_RESULT_DATA).
  - Router at `15aef66` ([sim](https://stxer.xyz/simulations/mainnet/e16126da832e64a295264a65cd35a02f)): `dlmm-enabled`
    `(list true false true)`, picks u2 -> u1. Smart sale `(ok)`: DLMM
    1,554,727,268 uSTX on v-1, XYK 1,302,131,468, Velar 2,143,141,264, out
    2,498,156 sats, nothing from v-2. Manual DLMM leg `(ok)`: all 5,000 STX on
    v-1, out 2,347,881 sats, nothing from v-2.
- The other harnesses on the committed bytes (one router carries both
  fixes): see the `15aef66` re-run under Zealous Citadel, all green but the
  stale steer check #35.
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
