# Audit review: ladder dispatch and market-spread rungs on v6-3

**Rapha to re-verify all rung variants tomorrow before deploy.**

Review of AIBTC bounty [mucad9frb853563a443a](https://aibtc.com/bounties/mucad9frb853563a443a),
“Audit 7k: Jing ladder dispatch + market-spread rungs on markets v6-3”.
The [public submission record](https://aibtc.com/api/bounties/mucad9frb853563a443a)
contained six submissions when read on 2026-09-23.

Target of this verification: the six working-tree `jing-{buy,sell}-stx`,
`-market-spread`, and `-core-spread` templates, with the actual
`markets-sbtc-stx-jing-v6-3`, `jing-core-v6`, `jing-ladder-v1`, and
`jing-ladder-dispatch` source. Base commit: `21d1eb6`; the reviewed rung
changes were committed separately as `dc8e324` while verification ran.
Historical submissions refer to earlier revisions; their findings are not automatically findings
against the current tree. Contract edits are limited to the six rungs.

## Result and payment

**Winner: Diamond Lance (Nilo)** — first to report the HIGH, with an
executed reproduction and Fix A, which we applied to all six rungs.
**Payment: pending; Rapha pays the 7,000 sats.** No payment was made as
part of this review.

The first report was submitted **2026-09-22 02:35 EDT (06:35 UTC)**.
Void Kael reported the same HIGH at **07:12 EDT (11:12 UTC)**, about five
hours later (4 hours 37 minutes). Times below are America/New_York (EDT).

| # | Submitter | Submitted | What holds / what does not | Decision |
|---|---|---|---|---|
| 1 | Diamond Lance / Nilo | Sep 22, 02:35 | HIGH: tail share amplification defeats the old residual bound. LOW: legacy RV peg fixtures use the wrong price scale. | Winner. Adopt Fix A for all six rungs; keep the separate legacy RV issue visible. |
| 2 | Eternal Harp / ARION | Sep 22, 04:40 | Initial report concerns the former margin gate. Revised report identifies the later API/pending-escrow migration gaps; those are already addressed in current callers/cancel. Other observations need separate treatment below. | Historical and overlapping findings; no extra contract edits in this patch. |
| 3 | Void Kael | Sep 22, 07:12 | Same HIGH, independently reproduced. Seat synchronization and comment issues are separate; not all are fixed here. | HIGH duplicate of #1; record remaining observations without claiming this patch resolves them. |
| 4 | Light Brio / Buffy Worker | Sep 22, 10:32 | Useful static dispatch, mirror, naming and seat-cap review. The no-Medium+ conclusion missed #1. | No new fund-risk finding established by this submission. |
| 5 | Ancient Osprey | Sep 22, 15:23 | INFO: an old-epoch withdrawal returns u7006 and rolls back its claim and a whole dispatch batch. LOW: local dispatcher fixture uses the old ladder name. | Adopt the withdrawal fix; verify the actual v6-3 stack on forks. Legacy local fixture remains separate. |
| 6 | Celestial Shark | Sep 23, 03:42 | Reusing a Lazer update is safe today; overloaded errors are diagnostic friction; band-only routing is intentional. | No new exploitable defect established. |

## 1. Diamond Lance (Nilo): tail minting and epoch close

[Report and reproduction](https://github.com/NiloSats/jing-v6-3-audit).

**What holds.** Shares are minted as `amount * SCALE / unfilled-index`.
A newcomer joining a heavily sold-down epoch can therefore own a very
large share count. Closing at a small *index* does not bound their unsold
*amount*. Closing snapshots proceeds but leaves the unsold residue for the
next epoch. The published reproductions demonstrate substantial loss on
both sides, not merely rounding dust.

**Our decision.** Apply Nilo's Fix A, symmetrically:

- `deposit` runs `sync`, then requires `unfilled-index >= u1000000000`
  (`MINT_FLOOR`) before transferring the member's input. Refusal is u7013,
  `ERR_POOL_TAIL`. The report's proposed u7012 is already used for a missing
  escrow update, so we retain that meaning and use u7013.
- `withdraw` snapshots the final proceeds index, increments the epoch, and
  restores `unfilled-index = SCALE` when the last member burns their shares.
  The cumulative proceeds index is preserved, so previous claims remain valid.
- Keep the `SOLD_OUT_INDEX` close in `sync`. Remove the weaker u7011 deposit
  guard; the new mint floor also excludes a zero denominator.

**Bound and tradeoff.** For an index-triggered close, the admission index
is at least 1e9 and the closing index is below 1e6: the residual fraction is
below 0.001, subject to integer accounting. The fork checks conservatively
round the newcomer's share of the *actual* remaining inventory upward and
still demonstrate a strict loss below 0.1%. This is not a blanket bound on
the separate `SOLD_OUT_DUST` trigger or on every rounding scenario.
Tail deposits intentionally refuse until fills close the epoch or the last
member leaves; a dispatcher deposit including such a rung still rolls back
atomically. Fix A does not implement the later alternative residual-accounting
Fix B published in the same report repository.

**LOW, legacy RV.** `tests/rv/build.sh:293` and `:294` still hardcode the
peg floor/cap as `u30165912518853695`, whereas `1e18 / 33150` is
`u30165912518853`. This fixture issue holds by inspection. It is not repaired
by these rung changes, and legacy RV totals are not used as evidence here.
The new fork suite fills the real fixed and pegged orders through `swap`.

## 2. Eternal Harp (ARION): distinguish the report revisions

[Report](https://files.profullstack.com/~arion/public/aibtc/jing-v63-audit.md).
The submission message describes the old margin gate at `6bf0470`; the
linked report now includes a second pass at `c35c014` after submit/settle.
We do not treat that later text as if it were the original submission.

**What holds.** The intermediate API mismatch, missing pending accounting,
and missing escrow escape path were real migration concerns. Current rungs
use the five-argument deposits, count pending in `market-size`, and recover
old pending escrow through cancellation. Current market entry checks the
minimum; settle refunds queue refusals and honors previously admitted
minimums; cancel returns pending, live and parked. The focused and timeout
fork regressions below exercise those current paths.

**What does not follow.** Today's `would-take-as-*` tests crossing at the
mid, not every possible match at a maker's limit. That alone does not prove
a current exploit: makers batch at the mid and only takers walk off-mid,
as explained in [PLOB heuristics](README-plob-heuristics.md). The obsolete
margin-gate reproductions are not proof of a failure in this rung patch.

**Remaining observations.** Pending limits can be replaced without owning
escrow; that differs from funded pending deposits. Zero-valued fractional
member positions, proceeds donated while no shares exist, and the x-side
capped-peg sentinel observation are separate existing edge cases, not claims
resolved by these two fixes. Their full scenarios were not rerun in this
verification. No additional market changes are bundled here.

## 3. Void Kael: duplicate HIGH and separate seat observations

[Report and tests](https://github.com/mike-lblc/project-zero/blob/main/work/aibtc/mucad9frb853563a443a.md).

**What holds.** The independent HIGH demonstrates the same share-amplified
residue transfer as #1. The fixes and six-variant tests below cover that
mechanism. It was reported later, so it does not change the winner.

**Separate LOW.** `sync-seat` still prunes only the requested side while
refreshing the shared reservation count. The opposite-side stale-seat
scenario after retirement and an owner cap reduction remains a valid
static concern; `prune-seats` / `sync-seat-count` prune both sides. We did
not rerun that separate full-book reproduction or fix it in this patch.

**INFO disposition.** Ladder/market seat-copy lag is an operational window;
the 49-seat maximum and reservation by configured count are policy choices.
The old gate's refusal of near-mid pegs concerns superseded admission logic.
The market-spread header descriptions invert the sats/STX sit-out direction:
that comment issue remains, and the old seat-cap rationale/dead error
observations are documentation/cleanup items. None changes the winner or
justifies calling all historical findings resolved.

## 4. Light Brio (Buffy Worker): no-findings static review

[Report](https://github.com/kosinskiivan007-bit/docs/blob/master/audits/aibtc-jing-v6-3-2026-09-22.md).

**What holds.** Dispatcher budget subtraction, duplicate/side validation,
transaction atomicity, historical exits, name binding and the buy/sell
mirror are useful checks. The report explicitly did not rerun the fork
suites. Its dead-code, duplicated pruning and seat-copy observations are
mostly maintenance or availability concerns.

**What does not hold as assurance.** A parameter-only diff against another
rung cannot establish safety of the shared epoch accounting: #1 affected
that shared code. The report's conclusion missed the tail-mint HIGH.
Directly donated input assets and donated proceeds also follow different
accounting paths; “all donations are unclaimable dust” is too broad.
**Decision:** no new fix or winner credit from this submission.

## 5. Ancient Osprey: old-epoch withdrawal and dispatch

[Report](https://dpaste.com/F36NG6K5P).

**What holds.** `settle-proceeds` pays an old-epoch member and deletes their
row, but the old `withdraw` then asserted that the row still existed.
Returning u7006 rolled back the payout; dispatch's `try!` rolled back the
whole batch. The funds were still claimable separately, so this is an exit
composition problem rather than theft.

**Our decision.** After `settle-proceeds`, if the row is gone, return the
claim payout: `{stx: paid, sbtc: u0}` for buy and the mirror for sell.
Current members continue through the unsold withdrawal path. A second
withdrawal with no position still returns u7006. Standalone `claim` remains
available. Each variant is checked below; each band side additionally exits
one closed and one live rung in a single dispatcher call, with exact wallet
and response totals.

**LOW, local fixture.** `simulations/verify-ladder-dispatch-local.js` still
deploys its mock as `jing-ladder`, while the real helper binds ladder-v1.
That old local fixture is not evidence for the current source. This patch
uses actual ladder-v1 fork deployments instead and leaves the unrelated
fixture repair separate.

## 6. Celestial Shark: low/info claims about the dispatcher

[Report](https://gist.github.com/celestialsharkaibt/98bb72b96935b0a305c0830a2c3cc1c9).

**What holds.** One update is passed to every withdrawal, several validation
failures share u7102, and routing accepts band rungs only. Those facts do
not establish loss or a failure today: Lazer updates are reusable, error
reuse affects diagnostics, and band-only registration is deliberate.
The proposed future update-consumption hazard is hypothetical.

**What does not hold.** A single validation/execution pass would not remove
Clarity's transaction rollback guarantee; the two-pass design instead
validates all allocations before interacting with rungs. Trait return types
already constrain the merge shape. The report's stated test totals were
not independently rerun as its own artifacts; our evidence is below.
**Decision:** keep current dispatcher behavior; no new contract fix.

## Changed functions and verification

| Template | Deposit guard | Withdraw / old claim | Last-member reset |
|---|---:|---:|---:|
| `jing-buy-stx.clar` | 304 | 374 / 386 | 421 |
| `jing-sell-stx.clar` | 271 | 337 / 349 | 384 |
| `jing-buy-stx-market-spread.clar` | 334 | 404 / 416 | 451 |
| `jing-sell-stx-market-spread.clar` | 298 | 364 / 376 | 411 |
| `jing-buy-stx-core-spread.clar` | 365 | 435 / 447 | 482 |
| `jing-sell-stx-core-spread.clar` | 329 | 395 / 407 | 442 |

All six pass `clarinet check` (warnings remain). Fork deployments use the
actual sources, native miner-band data and signed Lazer updates. No market,
ladder, oracle or rung storage is patched. Transfers occur only inside stxer;
no contract is deployed to mainnet.

| Harness / variant | N/M | Stxer fork |
|---|---:|---|
| Buy fixed | 61/61 | [run](https://stxer.xyz/simulations/mainnet/4bcff3f4fef2765cabb5e2f1e7349b00) |
| Buy market-spread | 61/61 | [run](https://stxer.xyz/simulations/mainnet/ce35545c336827c653c1b7e7a064331c) |
| Buy core-spread + dispatch | 67/67 | [run](https://stxer.xyz/simulations/mainnet/658ab421250cf0cc4eefe51c11d6e19e) |
| Sell fixed | 61/61 | [run](https://stxer.xyz/simulations/mainnet/8f5183b22bc1b8e22ae784532f2d602d) |
| Sell market-spread | 61/61 | [run](https://stxer.xyz/simulations/mainnet/9a2833334f6cfeca8992f6cfb5c7afac) |
| Sell core-spread + dispatch | 67/67 | [run](https://stxer.xyz/simulations/mainnet/1e7c2965f50950a6e813492f462d8800) |
| Escrow timeout regression (six variants) | 549/549 | [run](https://stxer.xyz/simulations/mainnet/f1057c751224a2fb57462aa68265878e) |
| Focused caller-impact regression (six variants) | 198/198 | [run](https://stxer.xyz/simulations/mainnet/00097a252e657c77b26d19a9f2e3d780) |
| Existing real-fill and claim regression | 85/85 | [run](https://stxer.xyz/simulations/mainnet/cac8b1a2c4a5e91a7667c4294abb4ddf) |

**New audit suite: 378/378. Including regressions: 1,210/1,210.**

```sh
node simulations/verify-v6-rungs-audit-tail.js
node simulations/verify-v6-rungs-escrow-timeout.js
node simulations/verify-v6-3-caller-impact.js
node simulations/verify-v6-rungs-fill-lazer.js
```

Use `SIDE=x|y KIND=fixed|peg|band` to run one diagnostic tail scenario.
Each full run starts six independent forks and fetches a signed Lazer update
newer than that fork's Clarity clock. Ordinary steps keep that clock fixed.
Default market minimums remain 1,000 sats / 1,000,000 micro-STX. The large
fixtures use the public STX funding wallet
`SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR`; every transfer is fork-only.
The existing timeout suite separately advances the fork clock across 24 hours.

The tail harness uses public deposits and swaps to reach each state, checks
that rejected deposits move no funds, verifies epoch/share resets and exact
claims, and conservatively measures nonzero lost residual inventory. It
prints `N/M checks green` and exits 1 immediately on a failed assertion.
The tests are deterministic sequences at each fork's frozen clock, not an
exhaustive fuzz proof. The separate dust threshold, multiple small-member
rounding, and all historical seat/gate observations are not covered by the
new tail scenarios.
