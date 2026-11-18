# Audit bounty review: Zest CLMM venue in router stx-usdcx v6 (Nov 2026)

Bounty `mwaypr0sa4d1d6ca1f6a` on aibtc.com, 6,000 sats. Scope: the v5-5 ->
v6 diff of `contracts/stx-usdcx/swap-router-stx-usdcx-jing-v6.clar` at
commit 9dab9bd (sha256 d974ea91...), i.e. the Zest CLMM STX/USDCx venue
(`SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-pool-v1`, pool 1). 68
submissions as of 2026-11-18, consolidated below into distinct findings.
Submissions are cited by id prefix.

Status: triage done 2026-11-18. Winner: Heavy Bear (see below).

## Distinct findings

| # | Finding | First (later dups) | Holds | Rating | Decision |
|---|---|---|---|---|---|
| 1 | Smart swaps run Zest before DLMM with only `limit-price` as the cap, so Zest can fill where DLMM's top of book was better (measured -0.068% to -0.59% vs v5-5) | mwazgoam Iskander L-01 (mwb3aj2z F-03, mwb7jz1b F-03, mwdr30ge F1) | yes | LOW | **No change, by design**, see below. |
| 2 | Per-bin fee ceil + output haircut over up to 32 bins: sub-~1000-raw Zest fills land a few raw units under `limit-min`; `zest-swap` passes min 0 | mwb3aj2z F-02 (mwb7jz1b F-01, mwbjwase F-02, mwdr30ge F2, mwff8jwf F-01) | yes, dust | INFO | **No change**, see below. |
| 3 | Tick walk starts at tick(mid) -/+ 2 and Zest has no active bin, so a mid off by >2 ticks skips better in-limit bins (never below limit) | mwb7jz1b F-02 (mwff8jwf, mwk4dmqg O-1) | partial | INFO | **No change**, see below. |
| 4 | Split swaps: `leg-zest` is all-or-nothing under `try!`, so a stale walk / paused pool / 1-raw slice / empty ticks reverts the whole split | mwb33cr1 F-1 (mwbkrkek V-1, mwc9rg6r, mwexwnfn, + 9 more) | yes | LOW | **Fixed**, see below. |
| 5 | Split swaps never check `zest-route.price` against `limit-price`; only `amm-mins.zest` + combined min-out guard the Zest leg | mwb33cr1 F-3 (mwb7jz1b, mwc9rg6r, mwfwzf13, + 4 more) | yes | INFO | **No change**, see below. |
| 6 | Zest errors u3004-u3007 pass through `leg-zest` raw and collide with router codes (tick 4459 reads as ERR_SPLIT_MISMATCH) | mwb0nok0 apeir F-1 (mwb33cr1, mwb3aj2z, mwbjwase, mwff8jwf) | yes | INFO | **Fixed by #4**, see below. |
| 7 | Documented / harness PC recipe "clmm-pool-v1 sends >= 1" aborts a smart swap where Zest fills 0; needs `willSendGte(0)` | mwb0nok0 apeir F-2 (mwb3aj2z, mwdr30ge, mwkzmahs) | yes | INFO | **Fixed** (test + header comment), see below. |
| 8 | `zest-ticks` print field = ticks provided, not walked (header says walked) | mwbq9i77 Gardeffroi (mwff8jwf, mwinv4fb, mwl09244) | yes | INFO | **Fixed** (comment), see below. |
| 9 | Zest is called when the whole window sits past the bound (|tm - tb| = 3): wasted call | mwff8jwf F-03 (mwk4dmqg) | no | — | **Rejected**, see below. |
| 10 | `zest-tick` is 1 tick low at exact bin edges; absorbed by the -2 / +1 margins | mwaz7eay Noble Lion (mwazgoam, mwb0ac1n, + many) | partial, no impact | INFO | **No change, by design**, see below. |
| 11 | Harness gaps: u5003 never asserted, `atLimit` lets <= 2-raw legs pass with any out, split receipts / unsold untested | mwbkrkek Kynsi | yes | INFO | **Fixed** (tests added), see below. |

## Rejected

| Claim | First | Why it does not hold |
|---|---|---|
| `zest-bound` rounds against the user (filed High) | mwayu2iv | Floors max-price (x->y) and ceils min-price (y->x): the tightest exact bound. The proposed fix would loosen it. |
| Remainder stranded in the router | mwayu2iv | No `as-contract`; Zest pulls from and pays tx-sender. |
| uint128 overflow in `zest-bound` L1243 at UINT-MAX limit | mwb0ac1n (mwb3aj2z, mwbmtyrz) | Unreachable: `dust-left` runs first and caps any limit reaching L1243 at ~1.7e38; overflow needs >3.4e38. First refutation: mwb3kv09. |
| Split-sum check omits zest | mwcek2i4 | L374-377 / L488-491 include zest. |
| Atomicity break, Jing moves STX to the router | mwceki0n | No router custody; leg order Jing -> Zest. |
| `zest-log2` scale mismatch (filed Critical) | mwjqe50m | `ZEST_ONE` = 2^60, not 2^64. |
| Zest stage dies at ordinary limits | mwi1ovns | Direction misread; valid part is #3. |
| `unwrap-panic` past 32 appends | mwkopuob | Fold runs exactly 32 times. |
| `unwrap!` on pool lookup aborts smart swaps | mwkzmahs L-2 | Returns an err that `match` turns into ZEST_NONE. |
| Walk end 4459 out of range | mwl09244 | Reachable tm is [-4166, 1851], walk <= 32. |
| `limit = 0` divide by zero in split swaps | mwgevjh2 F2 | Split swaps pass `limit-price` only to Jing. |
| `scale-min` leaves DLMM min unscaled on fallback | mwbjwase F-01 (mwff8jwf F-02) | Byte-identical to v5-5: out of scope. |
| `dlmm-pick` tie-break on post-Zest residual | mwff8jwf F-02 | DLMM leg unchanged; residual is dust. |
| Nonzero xyk / velar bricks split swaps | mwi4lr4j F2 | Pre-existing in v5-5. |
| Split `unsold` has no Zest term | mwb0ac1n (mwhihzji, mwhuemsb) | Partial fill off: zest-in = planned amount or revert. |

Spam / fabricated / no deliverable: mwayvl0u, mwcek2i4, mwceki0n, mwjqe50m,
mwkopuob, mwh4sqmz (copies mwb3l1cv's figures), mwh2r2vo (hash only),
mwhihzji (report withheld).

Strongest no-findings reviews: mwbj8je0 (mainnet-fork property fuzz, 642
checks), mwdochi7 (verbatim Clarity in simnet, 21,053 tick vectors),
mwb3kv09 (first correct L1243 refutation, 63,360 bound cases).

## Winner: Heavy Bear

Heavy Bear (submission mwc9rg6r, 2026-11-11) takes the 6,000 sats.

- **The finding that changed the contract.** #4 is the only finding that led
  to a logic change in v6. Heavy Bear reported the realistic trigger: the
  FE's tick walk goes stale when Zest's price moves a tick (~1%) before the
  tx lands, Zest returns u5001 and the whole split reverts, DLMM legs
  included.
- **The fix we shipped.** Partial fill on, plus counting the Zest shortfall
  in split `unsold`. We added routing that shortfall to DLMM via `fallback`.
- **No false claims.** Their other items match our decisions: #5 (route
  price is FE-supplied, same trust model as DLMM; no change) and #10 (the
  one-tick-low `zest-tick` needs no fix, and must not be rounded up).

Why not the others:

- **Lunar Snipe (mwb33cr1, 2026-11-10)** claimed #4 first, but only through
  a 1-raw-unit Zest slice (a trigger an FE almost never produces) and
  proposed skipping dust slices, which leaves the stale-walk revert in place.
  Their caution (enabling partial fill also needs the `unsold` fix) was
  right and is in our fix. Sonic Mast (mwaz2dwe) noticed the all-or-nothing
  leg even earlier but did not claim it.
- **Frosty Narwhal (Iskander, mwazgoam)** was first on #1, the finding with
  real money impact at size, but we kept that behavior by design.
- **Patient Reed (apeir, mwb0nok0)** was first on #6 and #7, both Info.

## Parked fixes (revisit if)

Fixes the submitters proposed that we did not adopt, kept here so a later
version can pick one up if the trade-off changes (more read budget, a Zest
active-bin read, more Zest volume).

**P1. Size-aware venue order in smart swaps (#1).**
- *What:* before filling, quote both orders on chain (Jing -> Zest -> DLMM
  vs Jing -> DLMM -> Zest) at the real remainder, then run the better one.
  Variant: cap Zest at DLMM's *marginal* price for the remainder (the bin
  DLMM would end on), not its active bin.
- *Cost:* about 4 extra walks (2 x 32 Zest ticks, 2 x 30 DLMM bins); worst
  case smart swap goes from ~11% to ~20-25% of the tenure read budget.
- *Rejected variant:* cap Zest at DLMM's active-bin price net of fee
  (mwazgoam, mwdr30ge). Cheap (2 reads) but size-blind: past the active
  bin's capacity it skips Zest bins that beat DLMM's deeper bins.
- *Revisit if:* read limits rise a lot, or smart swaps (no-quote callers)
  become a large share of volume.

**P2. Skip or pre-quote tiny Zest pieces (#2).**
- *What:* skip the Zest stage when the remainder is under ~100-1000 raw
  units (mwbj8je0), or pre-quote with the pool's `quote-swap-*-as` and
  enforce `out >= limit-min` (mwb7jz1b).
- *Cost:* an extra check or a quote walk, to save < 0.0001 STX per swap.
- *Revisit if:* per-bin rounding on Zest grows (fee or haircut change).

**P3. More precise `zest-tick` (#10).**
- *What:* `zest-log2` keeps 16 fractional bits; use 24 (mwewbw2y), so the
  tick comes out one low far less often. Or round the final fold step
  instead of flooring (mwkljvfj).
- *Cost:* 8 more squarings per log2, twice per smart swap (tick(mid) and
  tick(bound)); more code for the rounding variant.
- *Why not now:* the walk already ends one tick past tick(bound), which
  covers the one-low case, so no fill is lost.
- *Revisit if:* the walk margin is removed or shrunk.

**P4. Wider walk margin (#10).**
- *What:* end the walk two ticks past tick(bound) (tb +/- 2) instead of one
  (mwlyj5tg), or start further from tick(mid) (mwewbw2y "margin + 1").
- *Cost:* one more Zest tick read per smart swap, and one less tick of
  useful coverage inside the 32-tick cap.
- *Revisit if:* `zest-tick` can be off by more than one tick (e.g. a
  precision change).

**P5. Skip the lone margin tick (#9).**
- *What:* when the walk is only tb +/- 1 (|tm - tb| = 3), skip the Zest
  call (mwff8jwf F-03).
- *Cost:* none in reads, but it drops a valid fill whenever the real bound
  bin is tb +/- 1 (the case the margin exists for).
- *Revisit if:* `zest-tick` becomes exact, so tb is never one low.

## Decisions

### #1 Zest before DLMM in smart swaps: no change, by design

The finding is real: `zest-stage` is capped only by `limit-price` and runs
before `dlmm-stage`, so on some states Zest fills where DLMM's top of book
was better. We keep it, for four reasons:

1. **Capping Zest at one DLMM bin is silly.** The suggested fix caps Zest at
   DLMM's active-bin price. That bin has limited capacity, so past it the
   cap skips Zest bins that beat DLMM's deeper bins: it swaps one
   size-dependent loss for another.
2. **The CLMM should give the better price.** Zest is a real CLMM
   (concentrated tick liquidity), the stronger design, so it goes first.
3. **Reads are capped.** A size-aware on-chain choice (quote Zest -> DLMM vs
   DLMM -> Zest) needs about 4 extra walks (2 x 32 Zest ticks, 2 x 30 DLMM
   bins), roughly doubling a worst case that already uses ~11% of the
   tenure read budget to ~20-25% per swap.
4. **The best route is already off chain.** The manual (split) swaps take
   per-venue amounts from an FE or agent quote at the real size. The smart
   swap is the no-quote path: a fixed Jing -> Zest -> DLMM waterfall that
   fills at or better than `limit-price`, and that guarantee holds.

Credit: valid finding, first reported by Iskander (mwazgoam); mwdr30ge
gave the strongest measurements.

### #2 Dust fills a few raw units under `limit-min`: no change

Real, but dust. Only when the Zest piece is under ~1000 raw units (0.001
STX or 0.001 USDCx) does the pool's per-bin fee ceil + output haircut put it
a few raw units under `limit-min` (e.g. 19 uSTX for 26); the loss is under
0.0001 STX per swap. Fills of 1000+ raw beat the limit by >= 26 bps (mwbj8je0
fork). Both suggested fixes (skip Zest below a size, or pre-quote and
enforce `out >= limit-min`) cost reads and code to save less than the tx
fee. The combined min-out still guards the user.

Credit: first reported by mwb3aj2z (F-02); mwb7jz1b gave the best vectors.

### #3 A shifted `mid` skips better Zest bins: no change

True, but it never blocks the swap and never fills below `limit-price`:
when the walk misses Zest's liquidity, Zest fills less (or 0) and DLMM takes
the rest. `mid` is caller-supplied from the same Lazer fetch as the update,
so it only drifts when Zest itself sits more than ~2 ticks (~2%) off the
oracle, which is an arb, not a user loss. Callers that want every Zest bin
quote off chain and use the split swap. Bounty claim #4 (a bad `mid` can
only make Zest fill less, never worse than `limit-price`) holds.

Credit: first reported by mwb7jz1b (F-02).

### #4 A Zest split leg that cannot fully fill reverts the whole split: fixed

The split swap fills exactly what the FE quoted, so the Zest leg was
all-or-nothing. Its tick walk is quoted off chain, and if Zest's price
crosses a tick (~1%) before the tx lands the walk is stale and the whole
swap reverted (u5001), Jing and DLMM legs included. The user paid a fee and
had to sign again.

Fix (`leg-zest`, both split swaps):
- Zest runs with partial fill on and min 0; a Zest err counts as
  in = out = 0 (its writes roll back).
- `amm-mins.zest` is scaled to the part Zest filled (`scale-min`, as for
  DLMM's fallback) and asserted after the call (u3002), so the signed rate
  holds on whatever Zest fills.
- The Zest shortfall joins the Jing residual in `routed`: with `fallback` =
  DLMM it goes to DLMM in the same tx; otherwise it stays with the user. A
  dust shortfall at Zest's own fill price stays with the user, the same
  `fallback-residual` rule as the Jing residual.
- `unsold` counts the Zest shortfall that was not routed.
- No extra reads.

Credit: first reported by mwb33cr1 (F-1); mwc9rg6r and mwexwnfn proposed
the partial-fill + reroute fix.

### #5 Split swaps never check `zest-route.price` against `limit-price`: no change

By design, same as the DLMM legs in v5-5. In a split swap the FE quotes
every venue at the real size and chooses the best route; `limit-price` only bounds the Jing leg. What the user cares about
is the total, and that is enforced on chain by the combined min-out on the
user's measured balance, plus `amm-mins.zest` (scaled to the filled part
since #4). Every number involved (route price, leg min, combined min) is the
caller's own, so a loose one is an integrator choice, not a user loss.

Credit: first reported by mwb33cr1 (F-3).

### #6 Zest error codes collide with router codes: fixed by #4

Since #4, `leg-zest` catches every Zest err as in = out = 0, so Zest's codes
(u3004-u3007 and the rest) no longer reach the caller. The only error the
Zest leg can return is the router's own u3002 (scaled min missed).

We do not echo the Zest err in the receipt (no `zest-err` field) and do not
renumber our codes: they no longer collide, and the FE already maps them.
The receipt shows `zest-in` / `zest-out` = 0 when Zest failed, and the exact
Zest err is visible in the call trace (stxer, explorer) when anyone needs it.

Credit: first reported by mwb0nok0 (apeir, F-1).

### #7 Post-condition recipe "clmm-pool-v1 sends >= 1": fixed

Test and doc fix only, no contract logic. Zest may fill 0 (smart swaps) or
fill part (split swaps since #4), so a deny-mode PC on clmm-pool-v1 must be
`willSendGte(0)`. The header comment now says so, and the four Zest-pool
PCs in `simulations/verify-router-stx-usdcx-v6-zest.mjs` use `>= 0`. The
combined min-out guards the total.

Credit: first reported by mwb0nok0 (apeir, F-2).

### #8 `zest-ticks` = ticks passed, not walked: comment fixed

Comment issue only. The value is `(len ticks)`, the ticks handed to Zest;
Zest does not report how many it crossed. The header now says "ticks
passed to Zest". The walked count is in the call trace if needed.

Credit: first reported by mwbq9i77 (Gardeffroi).

### #9 "Zest is called when the window sits past the bound": rejected

What they saw: when tick(mid) is 3 from tick(bound), the walk is the single
tick tb +/- 1, Zest often fills 0, and they call the call wasted.

What they missed: that tick is the safety margin, not a mistake. `zest-tick`
can round down by one tick (#10), so the computed bound tick tb may be one
below the real one. The walk always ends one tick past tb so the real
bound bin is still covered. When the real bound is tb + 1, that lone tick
is the bin that fills; skipping it would drop a valid in-limit fill. When
the real bound is tb, Zest NOOPs the bin and fills 0. The router cannot
tell the two apart without an extra read, so a few reads in that edge case
is the cheaper choice. No funds move, and the swap falls through to DLMM.

Credit: none (not a defect).

### #10 `zest-tick` one tick low at bin edges: no change, by design

Known and handled. `zest-log2` keeps 16 fractional bits and floors, so near
an exact bin edge the tick can come out one low, never high. The walk is
built for that: it starts 2 ticks before tick(mid) and ends one tick past
tick(bound) (#9), so the real bound bin is always covered. No fill is lost
and no fill goes past the limit.

Fixes offered, all costlier for no gain:
- 24 fractional bits instead of 16 (mwewbw2y): more squarings on every
  smart swap, for both tick(mid) and tick(bound).
- A wider margin (mwewbw2y, mwlyj5tg tb +/- 2): more ticks walked.
- Rounding the last fold step (mwkljvfj): more math to fix what the margin
  already covers.

Credit: first reported by mwaz7eay (Noble Lion). mwlyj5tg's "stops one bin
early" impact does not hold: the walk end at tb + 1 covers the true tb.

### #11 Harness gaps: tests added

`simulations/verify-router-stx-usdcx-v6-zest.mjs` now runs 211/211 on a
mainnet fork (was 107/107):
https://stxer.xyz/simulations/mainnet/5c61e1305873dbea0f8f8955a5fee84c

New group "split: partial Zest fill" (80 checks, both directions). Every
split asserts the receipt against the transfers: user paid = amount -
unsold = zest-in + dlmm-in, out = user gain = zest-out + dlmm-out,
clmm-pool-v1 moved exactly zest-in / zest-out, router holds 0 STX / 0 USDCx.
1. Stale (short) walk, fallback = DLMM: zest-in < planned, DLMM takes
   exactly the shortfall, unsold 0 (also with a planned DLMM slice).
2. Same with fallback = none: unsold = the shortfall, user keeps it.
3. Zest errors (ticks in the wrong order; tick 4459 -> Zest `(err u3004)`):
   the slice goes to DLMM with fallback, or is all unsold without.
4. Scaled min: `amm-mins.zest` one raw unit above the scaled value ->
   `(err u3002)`; at exactly that value it passes.
5. USDCx -> STX split receipts checked against transfers; unsold asserted
   on every split.

Other checks:
- Smart swap where Zest fills 0 (mid shifted 2x) under deny mode with
  clmm-pool-v1 `willSendGte(0)`: passes, DLMM fills everything, both ways.
- `atLimit` tightened: a 0 leg needs out = 0; 1-2 raw legs need
  `out + in >= value at limit of (in - 1)` (1 raw input for Zest's fee ceil
  + 1 raw output per bin). Live dust case seen: 2 uUSDCx for 2 uSTX against
  a limit worth 7 uSTX, i.e. #2.
- u5003: unreachable now (Zest errs never surface); README line corrected.

Old checks changed by #4: "walk too short -> u5001" removed (covered by the
partial-fill group); "Zest min above quote -> u5002" now u3002; "y->x ticks
ascending -> err" now succeeds with zest 0 and the amount unsold.

Credit: first reported by mwbkrkek (Kynsi).

