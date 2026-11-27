# Audit bounty review: Zest venue in router sbtc-stx v6 + MIA, Fastpool, Juice swap vaults (Nov 2026)

Bounty `mwofjt4291b2d9213a9c` on aibtc.com, 6,000 sats. Scope: router
`contracts/sbtc-stx/swap-router-sbtc-stx-jing-v6.clar` @ 4593bbb (Zest CLMM
STX/sBTC pool u3 as a venue), the Zest legs of the MIA vault (citycoins PR #92
@ b699940), the Fastpool vault (fastpool-pox-5 PR #1 @ 1b47851) and the Juice
autoswap v2 (juicestx @ f403d80), plus a check that every fix from the
stx-usdcx Zest bounty (`README-audit-bounty-zest-v6.md`) was carried over.

16 submissions as of 2026-11-20. 8 are no-findings reviews (Snappy Tess,
Sonic Mast, Violet Jaguar, Gusty Gecko, Valiant Sable, Feral Cleo, Lively
Cougar, Nested Cube). The 8 with findings are triaged one at a time below.

Status: triage of the first 16 done 2026-11-20; round 2 (entries 17-44, 44 submissions total) in progress 2026-11-27, see "Round 2" below. Nobody paid yet. Leading: Ruby Harp (#2).

## Findings

| # | Finding | Submitter | Decision |
|---|---|---|---|
| 1 | With a Zest fee under the vault's 1% slippage, the Zest leg can fill a vault sale below the Pyth mid (down to the limit), so an LP parked at the floor buys under fair price | Patient Reed (2026-11-19 22:52) | **Big reject**: describes the limit working as designed, see below. |
| 2 | Vault splits pass fallback `none` and count the whole planned Zest (and Jing) slice in the min-out they send the router, so a partial fill, which router v6 allows, reverts the whole split (u3002) | Ruby Harp (2026-11-19 22:58); also Patient Reed Info 2 (22:52) | **Fixed in the vaults**, see below. |
| 3 | The router hardcodes Zest pool `u3` as the bin-step-100 STX/sBTC pool and never checks its tokens or bin step; any other pool there makes every smart swap / vault `router-swap` skip Zest for good (immutable router) | Frosty Narwhal (2026-11-19 23:08) | **No change, by design**, see below. |
| 4 | Zest's split floor (1%) breaks the vaults' own `floor <= 2 x venue fee` sandwich rule that gives Velar 60 bps; at a 0.3% u3 fee Zest should get 60 bps too | Vigilant Salmon (2026-11-19 23:57) | **Valid, no change**, see below. |
| 5 | Zest dust bins can make a small vault `router-swap` lose more than `ROUTER_SLACK_SATS u8` to per-bin rounding, so the sale reverts (u16047) | Valiant Brio F-01 (2026-11-20 00:05) | **Fixed in Fastpool + MIA** (u72); Juice no change, see below. |
| 6 | Router `dlmm-pick` final tie-break lacks the `e1` / `e2` depth guards the USDCx routers have | Valiant Brio P-01 (00:05); Lunar Ox (04:34) | **Rejected, no impact**, see below. |
| 7 | MIA Zest split leg is floored only on its total (fill-weighted), not per bin | Wide Sky F1 (01:40) | **Rejected, by design**, see below. |
| 8 | Caller Zest ticks are never validated on chain; a bad walk reverts the split (u3002) | Wide Sky F2 (01:40) | **Fixed by #2**, see below. |
| 9 | `zest-tick` one tick low above a bin edge; the stx-usdcx walk-end fix (tb +/- 2) was not applied | Galactic Vulture F1 (05:33) | **No change**: duplicate of stx-usdcx #10 / P4. |
| 10 | MIA `router-swap-split` lacks the stale-update check `router-swap` has (u16048) | Galactic Vulture F2 (05:33) | **No change**: DAO-only path, decided in the ccip028 bounty. |
| — | Stray v6-4 `comp.clar` omits sub0 | Valiant Brio P-02 | **Out of scope**: scratch file, not a deploy source. |

## Decisions

### #1 Zest fills a vault sale below the mid when its fee is under 1%: big reject

**Claim (Patient Reed).** The vaults' `router-swap` is permissionless and sets
`limit = mid - slippage-bps` (u100 = 1%; juice-sbtc-autoswap-v2 L420). Router
v6 runs Zest before DLMM (Jing -> Zest -> DLMM, router L435-456) with the Zest
bound `zest-bound(limit, fee) = limit / (1 - fee)` (L1418). With pool u3 at a 1%
fee the bound lands on the mid, so Zest never fills below fair price; with a
0.3% fee (pool 1's rate) it lands at ~0.993 x mid, and an LP parked there buys
each chunk ~0.7% under the mid. Suggested fix: assert vault `slippage-bps <=`
the u3 fee, or clamp the Zest bound to the mid.

**Why we reject it.**

1. **Filling below the mid, down to the limit, is the design.** The limit is
   the user's (here the vault's) max slippage on the Pyth mid. Every fill
   between the mid and the limit is a fill the caller accepted. Nothing in the
   finding crosses the limit.
2. **Zest is treated like every other venue.** Each AMM leg already fills only
   down to the limit net of that venue's own fee: Zest via `zest-bound` (L1418),
   DLMM via `dlmm-threshold` (L906-907), XYK and Velar the same way. The
   finding is not a Zest bug; it describes the limit itself.
3. **The fee-equals-slippage link is a coincidence.** The vault's 1% slippage
   is a caller tolerance; the Zest fee is a pool setting. That they are both 1%
   in the harness makes the net floor land on the mid by chance. No rule ties
   them, and none should: a caller can pick any slippage, a pool any fee.
4. **The smart swap is a waterfall, not a best-price router.** It fills Jing
   -> Zest -> DLMM -> XYK/Velar and guarantees only "at or better than the
   limit". Finding the best combination on chain needs extra walks the read
   budget cannot carry (stx-usdcx bounty, decision #1). The best route is off
   chain: split swaps take per-venue amounts from an FE / agent quote.
5. **The suggested clamp breaks the waterfall.** It would let Zest fill only
   at the mid or better while DLMM, XYK and Velar still fill down to the
   limit: one venue held to a stricter rule than the others for no reason.

**Lever if a vault wants a tighter fill:** lower its own `slippage-bps`
(`set-slippage-bps`, juice-sbtc-autoswap-v2 L143). That tightens every venue at
once, which is the right knob.

**Measured.** stxer fork of the router harness
(`simulations/verify-router-sbtc-stx-v6-zest.mjs`, pool u3 created at a 0.3%
fee via `ZEST_FEE=300000`), current router vs the clamp below
(`ROUTER_FIX=reed`), both deployed under new names (`ROUTER_AS`) since v6 is
live: see "Parked fix P1" for the numbers.

Verdict: big reject, no payout. Filling between the mid and the limit is
exactly what the caller asked for, and the argument rests on comparing a pool
fee with a caller tolerance, two unrelated numbers.

### #2 A partial Jing / Zest split fill reverts the whole vault split: fixed in the vaults

**Claim (Ruby Harp; Patient Reed's Info 2 says the same, 6 minutes earlier).**
Router v6 lets a split's Zest leg fill in part (`leg-zest`, partial fill on,
min scaled to what filled; stx-usdcx bounty fix #4) and puts the shortfall in
`unsold` when no fallback is set. The vaults pass fallback `none` and send the
router a min-out that counts the whole planned Zest slice
(`floor-out (+ jing zest dlmm xyk) limit`), so any partial fill fails that
min-out and reverts the split, Jing / DLMM / XYK / Velar legs included. No fund
loss: the keeper retries with a fresh walk. The Jing leg had the same issue.

**Fix (vaults only, the router is unchanged).**
- The min-out sent to the router keeps only the legs that fill fully or revert
  (DLMM, XYK, Velar). After the call, the vault checks the floor on what sold:
  `out >= floor-out(jing + zest + dlmm + xyk - unsold, limit) + floor-out(velar,
  velar-limit)` (DIA split: `floor-out(amount - unsold, limit)`; it has no Jing
  leg), `ERR_BELOW_FLOOR` u16047.
- Both splits take a `fallback (optional uint)` venue, passed to the router as
  is: `(some u1)` re-sells the shortfall on DLMM, `(some u2)` XYK, `(some u3)`
  Velar, `none` keeps it unsold in the vault; `u4` (Zest) is refused u3003.

**Where.**
- Fastpool: `fastpool-swap-vault` + `signer-manager-vault-stx-rewards` on the
  new `juice-swap-vault-trait-v4` (= trait-v3 + the fallback argument);
  fastpool-pox-5 279aace. stxer: fork 34/34, lifecycle 48/48 (fallback DLMM
  sells all; fallback none keeps the Zest half unsold; u4 -> u3003). Deploy
  template: faktory-dao 7fa89110.
- MIA: `ccd016-swap-vault-mia-v2` (no trait; the DAO calls it directly);
  citycoins-protocol c28cb14. Vault suite: runtime.mjs + vitest 27/27.
- Juice: no change. `juice-sbtc-autoswap-v2` is live and the keeper retry
  covers it.

Credit: valid, LOW (liveness). First report: Patient Reed (Info 2, 22:52);
Ruby Harp (22:58) gave the cited lines and the fix we took.

### #3 Pool `u3` is assumed, never checked: no change, by design

**Claim (Frosty Narwhal).** `ZEST_POOL_ID u3` (router L68) and the tick math
(`ZEST_LOG2_STEP`, `zest-tick`) are wired to a 1% bin step, but `zest-stage-pool`
only reads `get-fee-rates`; nothing checks that `u3` holds wSTX / sBTC at bin
step 100. If `u3` were created as another pool or bin step, every smart swap
and vault `router-swap` would skip Zest permanently. Fix proposed: resolve the
id with `get-pool-id {wstx, sBTC, u100}`, or check `get-pool u3`.

**Why no change.** We agreed with the Zest team that `u3` is the wSTX / sBTC
pool at bin step 100 (pool ids follow creation order; `u3` is the next one).
And the failure mode is safe: a wrong pool makes the Zest leg fill nothing or
error, which the router turns into ZEST_NONE, and the rest of the swap goes to
DLMM / XYK / Velar under the same limit. No fund loss, no fill below the limit.
An extra `get-pool` read on every swap would only buy a clearer skip.

Credit: valid observation, INFO. No payout.

### #4 Zest's split floor breaks the vaults' `floor <= 2 x fee` rule: valid, no change

**Claim (Vigilant Salmon, Z-1).** The vaults size each split leg's floor so a
sandwich only breaks even: floor <= 2 x the venue's fee. ccd016 states it in
its header (L49-63) and gives Velar `VELAR_SLIPPAGE_BPS u60`, twice its 0.3%
fee (L182). The new Zest leg takes the plain 1% floor (`mins.zest`), so if u3
charges 0.3% like Zest pool 1, a sandwich on the Zest leg clears its fees.
Fix proposed: `ZEST_SLIPPAGE_BPS u60`, or cap the Zest bound at
`mid x (1 - 2 x fee)`.

**It is legit**: by the vaults' own rule the Zest leg would want 2 x its fee.

**Why no change.**
1. **The u3 fee is unknown.** Pool u3 does not exist yet, so its fee is not
   set. Zest pool 1 (STX/USDCx) is 0.3% each way today (80% of it to LPs).
2. **Zest can change it at any time.** `update-pool-fee` (clmm-pool-v1 L249)
   lets Zest's executor-dao or an extension set any fee below 100%, and
   `set-fee-discount` gives per-address discounts. A constant like u60 baked
   into the vault would encode today's guess, and would be wrong the day the
   fee moves.
3. **The 1% is a setting, not a constant.** Each vault's DAO / admin can lower
   `slippage-bps` (ccd016, Fastpool, Juice: `set-slippage-bps`) once u3's fee
   is known, which tightens every leg at once.
4. **The exposure is already bounded.** The chunk cap (0.01 sBTC per call) and
   the one-block router cooldown cap a Zest sandwich the same way the ccd016
   header already accepts for Velar slices on the smart path.

Credit: valid, INFO. Valid finding with no code change.

### #5 Zest dust bins exceed the vault rounding slack: fixed in the vaults (u72)

**Claim (Valiant Brio F-01).** The vaults' `router-swap` asserts
`out >= floor-out(sold - ROUTER_SLACK_SATS, limit)` with u8 (4 legs x 2 sats).
Router v6 adds a Zest walk of up to 32 bins with min 0, each rounding up to 2
sats against the seller, so dust bins can push a small sale past 8 sats and
revert it.

**Measured** (`simulations/verify-zest-dust-slack.mjs`: u3 at 0.3%, 100 uSTX in
each of the 32 STX bins below tick(mid), smart swaps at the vault floor):
- slippage 1% (default): 0 sats needed at every size, 10 sats to 1M sats;
- slippage 5%: a 10-sat sale needs 8 (fits u8 exactly);
- slippage 10% (max): a 10-sat sale needs 10, so u8 reverts
  (https://stxer.xyz/simulations/mainnet/2193f41a5efc015db8bc41c65187ae9d).

**Fix.** `ROUTER_SLACK_SATS u72` (8 + 32 bins x 2). The same constant gates
`sold > ROUTER_SLACK_SATS` (smallest sellable chunk 73 sats) and, in ccd016, the
unsellable-dust bound for a window restart (72 / 73-sat boundary tests).
Fastpool 0fe7747, MIA 4a4123c (vault suite 27/27; stxer coverage 113/113,
emergency 41/41, negatives 123/123).

**Juice: no change, no redeploy.** `juice-sbtc-autoswap-v2` is live with u8 and
stays. At its 1% slippage the sim needs 0 sats of slack at every size, so the
bug only appears if the pool admin raises `slippage-bps` to ~5%+ and a chunk is
~10 sats, and then the sale only reverts (the keeper retries, nothing is lost).
Not worth a new autoswap. If Juice ever ships a new autoswap for another
reason, take u72 then: it was tested on stxer, 78/78 including the 72 / 73-sat
boundary (https://stxer.xyz/simulations/mainnet/42bef384d1af1bd7dd2dee72d3b1f305).

Credit: valid, LOW (liveness, only at loose slippage on tiny chunks).

### #6 `dlmm-pick` tie-break lacks the depth guards: rejected, no impact

**Claim (Valiant Brio P-01, Lunar Ox).** In the sbtc-stx router, the last step
of `dlmm-pick` picks pool 1 if `o1 >= o2` and `o1 >= o3`, else pool 2 if
`o2 >= o3`, else pool 3, on the quotes alone. The stx-usdcx and sbtc-usdcx
routers also require `e1` / `e2` (the pool has depth on the side sold into and
at least 1% of the deepest pool's). When pool 1 is unusable and pools 2 and 3
both quote 0, the sbtc-stx router lands on pool 1.

**Suggested fix.** Port the guards (as the USDCx routers have since 93c8ec6):
```clarity
(if (and e1 (>= o1 o2) (>= o1 o3))
  u1
  (if (and e2 (>= o2 o3)) u2 u3))
```

**Why we reject it.**
1. **An unusable pool already quotes 0.** `o1` / `o2` / `o3` are only computed
   for usable pools (`(if e1 (dlmm-out ...) u0)`), so an unusable pool can only
   win the comparison when every other pool also quotes 0.
2. **Then nothing fills either way.** With every quote at 0, no pool can fill
   the DLMM leg inside the limit: the old code sends it to an empty pool, the
   fixed code to a usable pool that also fills 0. Same outcome.
3. **Whenever any pool quotes more than 0, the router already picks the best
   one.** The guards change no fill, no price, no revert that matters.

Not a regression: sbtc-stx v5-6 (live) never had the guards; only the USDCx
routers got them (93c8ec6). Kept here so a future router can take them for
parity with the USDCx routers.

Credit: observation correct, no impact. No payout.

### #7 Zest split leg floored only on its total: rejected, by design

Wide Sky F1. The vault cares about the STX the slice brings, and `mins.zest`
(scaled to what filled) guards that total; DLMM, XYK and Velar are floored the
same way. Same decision as stx-usdcx #5. No payout.

### #8 Unvalidated Zest ticks revert the split: fixed by #2

Wide Sky F2. A bad tick list makes the Zest leg fill 0. Since #2 the split no
longer reverts: the unfilled part stays unsold or re-sells on `fallback`.

### #9 `zest-tick` one tick low: no change

Galactic Vulture F1 = stx-usdcx #10 (absorbed by the walk ending one tick past
tick(bound)) and parked fix P4 there (end the walk two ticks past). Same
decision: no change.

### #10 MIA split has no stale-update check: no change

Galactic Vulture F2. ccd016 `router-swap` is permissionless, so it refuses an
update older than ~30 s (taker rebate above 20 bps, u16048). `router-swap-split`
is DAO-only: the DAO passes a fresh update itself. Decided in the ccip028 bounty
(`citycoins-protocol/README-audit-bounty-ccip028.md`).

## Round 2 (submissions 17-44, triaged 2026-11-27)

Entry numbers below are submission order on the bounty (1-44).

| # | Finding | Submitter | Decision |
|---|---|---|---|
| 40 | Zest pool u3 now exists as x = sBTC, y = wstx, the inverse of router v6 (L62-68, L300/L312, L1438/L1449); every Zest call fails `check-tokens` (u2002), is swallowed as 0/0, and every zest > 0 split reverts u3002 | Hardy Finch (2026-11-24 10:47 UTC) | **Known, no payout.** We already knew the layout once u3 was created; the fix is router v6-1 (d2f6cad) and the vaults on it (fastpool 0b4438e). Valid, Medium, but not new to us. |
| 38 | `DUST_SATS u2` vs `ROUTER_SLACK_SATS u72`: a 3-72 sat leftover can't be sold (router sale needs > slack, u16047) and isn't empty (close-batch u16043), so the cycle's STX waits for the 432-block recovery | Sacred Swan (2026-11-24 08:28 UTC; stxer fork proofs) | **Fixed**: `DUST_SATS` removed, `ROUTER_SLACK_SATS` is the dust line too, in fastpool-swap-vault and ccd016-swap-vault-mia-v2. Juice v2 (live) has it on a 3-8 sat window; fixed in juice-sbtc-autoswap-v3 c9dd550 (with slack u72 and the 2 x min-x allowance), stxer 160/160 https://stxer.xyz/simulations/mainnet/076d67b6ef12ca40c5fd1efb5e261b7b. Valid, Low (liveness, nothing lost). |
| 27 | With a split `fallback`, the router re-sells the market refund (unfilled rest + rebate) and pulls it from the vault again; the split allowance is only `amount + min-x` (fastpool L569, MIA L730), so a refund just over min-x aborts the split | Giant Moth (2026-11-22 00:44 UTC; clarinet-sdk proof) | **Fixed**: router-swap and both splits now allow `amount + 2 x min-x` (covers the refund: rest < min-x, rebate <= 0.7% of min-x, 51 sats dust); the two rebate constants are removed. Juice v2 passes fallback none: unaffected. Valid, Low (liveness, nothing lost). |
| 18 / 20 | A retired vault keeps its dust and the Pyth fee reserve (<= 10 STX) with no way out after the pool switches vaults; Rough Manticore suggested also asserting `empty` in `assert-idle-vault` | Rough Manticore (2026-11-21 06:46 UTC); Round Mira (10:50) for the stranded reserve | **Fixed differently**: a `sweep` on each vault sends all sBTC and STX out once it is retired. Fastpool 105ac12 and Juice v3 fec40d7: pool admin, refused while the vault is active or pending (u16049). MIA 15db6de (PR #92): DAO only, to REWARDS_TREASURY. Valid, Low/Info. |
| 17a | `get-no-pyth-price`: when DIA errors, the fallback takes `rfq-sbtc-stx-jing-v2-3 get-native-price` and sets `limit = mid / 2`, ignoring `no-pyth-slippage-bps` (fastpool L673, MIA L950, Juice v3 L735); Kind Reactor F2 repeats it | Galactic Wyvern B-02 (2026-11-21 03:14 UTC) | **Rejected, by design.** The native price is the miner-commit price, which can be erratic, so a tight floor would make the emergency sale fail; 50% keeps it possible. Admin-only, and only with both Pyth and DIA down. |
| 17b | A Jing / Zest shortfall routed to an XYK or Velar `fallback` must sell in full above the limit (those legs don't partial-fill), so a thin pool reverts the whole split; fix proposed: allow only DLMM / none, or make XYK / Velar partial-fill | Galactic Wyvern TA-01 (2026-11-21 03:14 UTC) | **Rejected, no change.** The keeper picks the fallback; a revert costs one tx fee, nothing is lost, and DLMM or none avoids it. Router v6-1 stays as is. |
| 20 | `emergency-recover` sends the vault's whole STX balance, the Pyth fee reserve included (<= 10 STX), and the pool credits it to the recovering cycle; fix proposed: withhold the reserve like `finish` | Round Mira (2026-11-21 10:50 UTC) | **Rejected, no change.** At most 10 STX (0 at the default budget); if the vault later needs STX for Pyth fees, the admin sends some. |
| 32 | F-1: with fallback Velar the re-sold shortfall is floored at `limit` (1%) not `velar-limit` (0.6%). F-2: a split that fills 0 with fallback none returns ok and uses up the router cooldown | Rare Jett (2026-11-23 17:39 UTC) | F-1 **rejected** (keeper picks the fallback; same family as #4). F-2 **fixed**: both splits assert sold > 0, `ERR_NOTHING_SOLD` u16050 (Fastpool 148dde2, MIA 4447af8). Juice v3 unaffected (fallback none: a 0 fill already fails u3002). Valid, Info. |
| 31 | `scale-min` floors `min * actual / planned`, so a tiny partial fill (Zest buying sBTC, sats are coarse) can clear ~1 unit below the caller's price | Little Orb (2026-11-23 12:43 UTC) | **Fixed** in router v6-1 (not yet deployed): ceil division, ee8393d; deploy template regenerated (faktory-dao). Applies to every scaled leg min (Zest, DLMM, XYK, Velar). Valid, Info. |
| 19 | Juice zest-route price u0 (v3: no cap) leaves the Zest leg with only the scaled `amm-mins.zest`; if `floor-out(zest, limit)` rounds to 0 for a tiny slice, that slice is unbounded | Jovian Pike (2026-11-21 09:33 UTC; code read, no repro) | **Rejected, no impact.** `floor-out` = zest x limit / 1e10 with limit ~2.3e13 (Juice v3 stxer: 50,000 sats -> 115,859,617 uSTX), so even 1 sat gives a min of ~2,300 uSTX; it is 0 only when the Zest slice is 0 (no leg). |
| 42 F1 | Fastpool `jing-place` is permissionless and parks the whole sBTC balance at floor = mid x (1 - leeway 5%), mid only checked within the 10% DIA band, so ~14.5% moves to a taker | Kind Reactor (2026-11-24 12:02 UTC) | **Rejected, false.** The mid comes from the signed Pyth update, and the market fills the vault at `pegged-ask` = live mid x (1 + maker spread) (market v6-5 L332-341); the floor is only a minimum, below it there is no fill. |

Proof for #38 and #27 (stxer mainnet fork at block 9589221, router v6-1 fork-deployed, pre-fix source vs fixed source on the same book):
- Fastpool A/B 43/43 <https://stxer.xyz/simulations/mainnet/201e0139a61d54cd4128cfb6176546db>; MIA A/B 38/38 <https://stxer.xyz/simulations/mainnet/e3ac37e3c45a2f79f18e2bc594e001b0>
- #27: Jing-only split (863,603 sats, fallback DLMM, market refund 999 + 3 = 1,002 sats): pre `(err u0)`, fix ok and vault drained. Permissionless router-swap with the same refund under the new allowance: 10/10 <https://stxer.xyz/simulations/mainnet/c13cf0da8ff45ecc1cc9cf3cc0b6f063>. The Jing partial needed a fork-only whale bid (live book had no fill for a new seller).
- #38: 50-sat leftover after a 20,000 chunk: pre batch stuck (u16047 / u16043 / finish u16032), fix closes on the sale and finish pays out.
- Fastpool lifecycle harness on the fixed source: 48/48 <https://stxer.xyz/simulations/mainnet/a75724ca204eb6beaf059408712ad7bb>
- Harness: fastpool-pox-5 `simulations/fixes-38-27-stxer.mjs`.

## Test runs (2026-11-20, after the fixes)

Router v6 is live (block 9525511), so the router harnesses deploy the repo bytes
(= 4593bbb, the deployed commit) under `ROUTER_AS=swap-router-sbtc-stx-jing-v6-sim`.

| Repo | Suite | Result | stxer |
|---|---|---|---|
| jing-contracts-v3 | `verify-router-sbtc-stx-v6-zest.mjs` (`FORK_BLOCK=9530361`) | 267/267 | https://stxer.xyz/simulations/mainnet/e94864779dfabb08c61f7d526689b43c |
| jing-contracts-v3 | same at the tip (9530391) | 263/267: 4 checks (worst split unsold, read_count ~81%) depend on DLMM pool 1's active-bin depth (20.5B vs 146B uSTX); same on pre- and post-fix bytes | https://stxer.xyz/simulations/mainnet/17645affea118a46cdbb7c5a551500c0 |
| jing-contracts-v3 | `verify-router-sbtc-stx-v6-zest-nopool.mjs` | 127/127 | https://stxer.xyz/simulations/mainnet/8f811e55ac5875b49d0dffea963b5d1b |
| jing-contracts-v3 | `verify-zest-dust-slack.mjs` (#5) | 22/22, worst slack 5 sats at the default sizes; 10 sats for a 10-sat sale at u1000 | https://stxer.xyz/simulations/mainnet/b08e3554ba67d015522c1bc54d6a665d |
| fastpool-pox-5 | `pool-vault-stx-stxer.mjs` (fork / `--lifecycle`), live trait-v4 + router v6 | 33/33, 47/47 | https://stxer.xyz/simulations/mainnet/c940063b3c17b741697a85f53ff4774e, https://stxer.xyz/simulations/mainnet/ec28035a2157e61eb7f0b8b63d9e0a70 |
| fastpool-pox-5 | `npx vitest run` / vault-stx suite | 49 passed (1 skipped) / 1/1 | – |
| citycoins-protocol | `npm run test:vault` | 27/27 | – |
| citycoins-protocol | stxer coverage / emergency / negatives / ccip028 activation | 113/113, 41/41, 123/123, 48/48 | https://stxer.xyz/simulations/mainnet/84975784c457b482e5a568128fa07835, https://stxer.xyz/simulations/mainnet/9fad0f24af0e4e174401866d46269ace, https://stxer.xyz/simulations/mainnet/847d524bc3bb5444ad893a78fd7b5eb7, https://stxer.xyz/simulations/mainnet/547d85a0f46c6c9b946f2717c85a85f5 |
| juicestx | `autoswap-v2-stxer.mjs` with u72 | 78/78 (u72 then not shipped) | https://stxer.xyz/simulations/mainnet/42bef384d1af1bd7dd2dee72d3b1f305 |

Harness flags added in this repo: `ROUTER_AS` (deploy the router under another
name, v6 being live), `ZEST_FEE` (pool u3 fee, default 1%), `ROUTER_FIX=reed`
(cost-measure Reed's clamp, #1), `FORK_BLOCK` (pin the fork height).

## Parked fixes (revisit if)

Fixes the submitters proposed that we did not adopt, kept here so a later
version can pick one up if the trade-off changes.

**P1. Clamp the Zest bound to the mid (#1, Patient Reed).**
- *What:* in `zest-stage-pool` (router L1493), never let the Zest bound be
  worse than the mid. Selling sBTC: min-price = max(zest-bound, mid-wad);
  selling STX: max-price = min(zest-bound, mid-wad). `mid-wad` = mid x 1e8, the
  mid in Zest price units, computed a few lines above.

  Before:
  ```clarity
  (bound (if (and sane (< fee ZEST_FEE_ONE))
    (zest-bound limit fee sell-sbtc)
    u0
  ))
  ```
  After:
  ```clarity
  (bound (if (and sane (< fee ZEST_FEE_ONE))
    (let ((b (zest-bound limit fee sell-sbtc)))
      (if sell-sbtc
        (if (> mid-wad b) mid-wad b)
        (if (and (> mid-wad u0) (< mid-wad b)) mid-wad b)
      )
    )
    u0
  ))
  ```
  Vault-side variant: assert `slippage-bps <=` the u3 fee in each vault's
  `router-swap` (one extra `get-fee-rates` read per call).
- *Cost:* router variant, no extra read (the fee and the mid are already in
  hand), just two compares; measured cost: pending. Vault variant, one extra
  read per call.
- *Why not now:* see decision #1; it holds Zest to a stricter rule than every
  other venue and fights the limit the caller chose.
- *Revisit if:* the smart swap ever promises best price rather than "at or
  better than the limit", or callers start passing very loose limits on a
  permissionless path.
