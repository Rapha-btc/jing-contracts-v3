# Audit bounty review: v6-3 submit + settle (Sept 2026)

AIBTC bounty `muerdzoc805a745ecc99`, 21,000 sats, source only, pre-deploy.
Scope: `markets-sbtc-stx-jing-v6-3`, `jing-core-v6`, `jing-ladder-v1`,
`swap-router-sbtc-stx-jing-v5-3`, the ladder dispatch, the six rungs, and the
three swap vaults (juicestx, fastpool-pox-5, citycoins ccd016). The first
six submissions reviewed master `24f3e23`; later ones name their own commit. This file records what each one found,
what we decided, and what changed in the repo.

Review is complete: every submission below has a decision.

## Likely winner

ARION (Eternal Harp) is the winner. He found the only HIGH (the ghost
double-pay), proved it on a fork, and we fixed it. His cancel guard was also
adopted (F-4).

Main runners-up:
- Void Kael: 2 MEDIUM and 5 LOW / INFO fixed (#1 capacity small-share, #2
  push re-lock, #3 older limit overwrites newer, #5 taker side, #6 dust-only
  finish, #7 market dust close, #8 allowance), all executed on the real bytes.
  #4 is the same root cause as Nested Quinn M-2.
- Nested Quinn: 2 MEDIUM (M-1 capacity gross-up, M-2 index drift, which led
  to the rescale) and 2 LOW (L-1 all-or-nothing router-swap, L-2 window vs
  recovery), all fixed, with runnable tests.

Smaller tips:
- Regal Anvil: #1 reserve dust and #3 order-dependent small-share floor
  fixed, plus the tail-roll solvency review.
- Nilo (Diamond Lance): the rung tail freeze, fork-proven on all 6 rungs,
  which led to the tail roll.
- Fluid Briar: the switched-off ask MEDIUM (fixed) and the `router-swap`
  sliver LOW (fixed in 3 vaults).

## Rung items from the earlier rounds (resolved)

- Nilo's tail freeze: the lossless tail roll (also carries the F-6
  hardening). **Reviewed** by Rapha on `jing-buy-stx-core-spread-v1` with the
  rescale, reserve release and `members` changes; independently checked by
  Regal Anvil (reserve solvent by construction) and Void Kael (lossless under
  fuzz). The review note is removed from the rung. Not fork-tested yet.
- ARION F-7: proceeds absorbed while a rung has no members. **Fixed** (`f015382`):
  with no shares, `sync` leaves the watermark in place, so that STX goes to
  the next epoch's members at their first sync. Holds on
  `jing-buy-stx-core-spread-v1`.
- ARION F-8: a member whose position rounds to 0 can never withdraw, which
  could block the last-member reset. **Fixed** (`f015382`): a partial that
  would leave a rest worth 0 becomes a full exit, and a 0-worth position
  exits by burning its shares. Holds on `jing-buy-stx-core-spread-v1` (the
  last-member reset now counts `members`, so leftover rescale shares cannot
  block it either).
- ARION F-9: `settle-escrow` asks for a Lazer update even for exits that do
  not need one. Fixed with Void Kael #2 (`escrow-for`), see below.

## Before deploy

The fixes from this review were checked with `clarinet check` only. Still to
run or do:
- Market (`markets-sbtc-stx-jing-v6-3`): **done.** 17 stxer fork suites
  (5,981 / 5,981 checks) on the current source `72b60b0`, covering Nested Quinn
  M-1, Void Kael #1, #3, #5, Regal Anvil #3 and the treasury guard; 72.2% of
  expressions, 0 branch nodes never reached, no reachable path untested. See
  `simulations/README-v6-3-coverage.md`. Clarinet unit tests (273) and RV
  campaigns live under `tests/unit/v6-3` and `tests/rv/v6-3`.
- Rung `jing-buy-stx-core-spread-v1`: tests for the index rescale, the Void
  Kael #2 changes and the Regal Anvil #1 reserve release; a fork run of the
  tail roll. `jing-buy-stx-market-spread-v1` has only the Void Kael #2
  changes.
- Port the rung fixes to the other `-v1` rungs (this review targets
  `jing-buy-stx-core-spread-v1` only).
- Vaults: rerun the stxer vault sims (juice, fastpool, ccd016 v2 happy-path,
  liquidation, recovery) for Nested Quinn L-1 / L-2 and Void Kael #6, #7, #8.
  The juicestx `test:vault` harness fails at build (its fixture market is v6,
  see the Fluid Briar section).
- `ccd016-swap-vault-mia-v3` (work in progress) has none of the vault fixes.

## Found after the review: treasury guard

The v6-3 fork coverage work (`simulations/README-v6-3-coverage.md`) found that
`set-treasury` accepted the market's own principal. Every fee transfer then
went to the market itself and failed `(err u2)`, so every swap and
fee-charging settle aborted until the operator reset it. Operator-only, no
funds at risk. Fixed in `e338e27`: `set-treasury` refuses it with
`ERR_BAD_TREASURY` u1033 (all three v6-3 copies); the swap-walk sim asserts the
refusal ([60b21233](https://stxer.xyz/simulations/mainnet/60b2123325bfce65a3de83e96a361e4c)).

## Submissions and verdicts

| Submitter | Finding | Holds | Rating | Decision |
|---|---|---|---|---|
| Eternal Harp (ARION) | F-1: a caught queue-full in settle leaves a ghost deposit that cancel pays twice | yes | HIGH | **Fixed** in `cbf96c4`, see below. Fork-proven by the submitter. |
| Diamond Lance (Nilo) | Rung tail freeze: a sub-minimum remainder with nothing on the book blocks every close, so one member who never withdraws freezes the rung | yes | MEDIUM | **Fixed**: lossless tail roll (`afbf33d`, all six rungs), reviewed on `jing-buy-stx-core-spread-v1`; not fork-tested. |
| Fluid Briar | `settle-token-x-deposit` checks `(is-eq ask u0)`, but a switched-off ask is `MAX_UINT` | yes | MEDIUM | **Fixed**, see below. Source-only in the submission; fork-proven here. |
| Fluid Briar | Recovered sBTC can never be swapped again in the fastpool swap vault | yes | - | **Rejected, by design**, see below. |
| Fluid Briar | Permissionless `router-swap` sells a caller-chosen sliver and burns the shared cooldown | yes | LOW | **Fixed** in all three swap vaults, see below. |
| Celestial Shark | A failed cross-remainder in swap / reprice-or-swap reverts cycle settlement | no | - | **Rejected**, see below. |
| Light Brio | L-1: caught u1010 drops the entrant's parked carry | no | - | Not reachable in the full branch: its filtered append cannot fail. The carry loss it describes does happen in the non-full branch; ARION's fix covers it (victim P in the harness below). |
| Light Brio, Eternal Harp (ARION) | L-2 / F-4: settle leaves pending limits and readmits behind; a leftover limit can later be settled onto a new order | yes | LOW | Light Brio's fix rejected; **ARION's cancel guard adopted**, see below. |
| Eternal Harp (ARION) | F-2: a swap vault's `jing-refloor` / `refresh-guard` only submits a pending limit that nothing settles | yes | - | **Rejected**, see below. |
| Eternal Harp (ARION) | F-5: `readmit-token-*` is permissionless, so anyone can queue and settle a victim's readmit | yes | - | **Rejected**, by design, see below. |
| Eternal Harp (ARION) | F-6: rung `settle-escrow` underflows if `stacks-block-time` goes below `submitted-at` | no | - | Not reachable; **hardened anyway**, see below. |
| Ancient Osprey | No new finding; confirms ARION, Nilo, Celestial Shark and Light Brio | - | - | Confirmations only. |
| Nested Quinn | M-1: `get-taker-capacity` grosses up at the max rebate (70 bps), so a swap of exactly `gross-cap` on a fresh print (20 bps) nets 0.5% over capacity and fails u1017 | yes | MEDIUM | **Fixed**: gross up at the fresh-print rebate (20 bps), see below. |
| Void Kael | #1: `get-taker-capacity` counts in-range makers under 0.2% of their side, which settlement rolls (`filter-small`), so a swap sized to the quote fails u1017 | yes | MEDIUM | **Fixed**: the capacity skips them, see below. |
| Regal Anvil | #3: `filter-small-token-*` tests each maker against a side total that shrinks as makers roll, so the 0.2% floor depends on list order | yes | INFO | **Fixed**: one snapshot of the side total before the loop, see below. |
| Void Kael | #5: the crossing-taker checks match `tx-sender` on both sides, so a taker's own small order on the OPPOSITE side makes its swap fail u1020 | yes | LOW | **Fixed**: new `crossing-x` flag, the checks only apply on the taker's side, see below. |
| Void Kael | #3: the stored limit has no time, so settling an OLDER pending deposit (or pending limit) overwrites a NEWER limit, and the order fills at a price the maker's latest instruction excluded | yes | LOW | **Fixed**: the stored limit records `set-at`, and a settle only writes a newer instruction, see below. |
| Regal Anvil | #4: `settle-token-*-readmit` does not re-check the deposit minimum | yes | INFO | **By design**: readmit restores an order already admitted, see below. |
| Void Kael | #8: vault `router-swap` aborts `(err u0)` in a ~120-sat band when the book leg's refund (rest + rebate crumbs) exceeds the allowance `amount + min-x` (first noted, unproven, by Nested Quinn) | yes | INFO | **Fixed**: the allowance adds the max rebate on `amount`, which bounds the refund in every case, see below. |
| Void Kael | #7: after a sell-out, a 1-sat `jing-place` escrows dust on the market, and `is-empty` (market position exactly 0) keeps the batch open until the window ends | yes | LOW | **Fixed**: `close-batch` cancels a market position of at most `DUST_SATS` home first, see below. All three vaults. |
| Void Kael | #6: a batch funded with <= DUST_SATS closes with 0 STX, and `finish` then fails `(err u3)` on the 0 transfer forever, wedging the juice / fastpool pool | yes | LOW | **Fixed**: `finish` skips the transfer when the balance is 0, see below. ccd016 not affected. |
| Nested Quinn | L-1: the permissionless vault `router-swap` demands the floor on the whole chunk, so it sells nothing when the pools take only part of it inside the floor | yes | LOW-MEDIUM | **Fixed** in the three vaults: floor checked on what sold, the rest stays, see below. |
| Nested Quinn | L-2: juice / fastpool vaults accept `window-blocks` up to 1008, but recovery opens at batch start + 432, so anyone can recover mid-window | yes | LOW | **Fixed**: `MAX_WINDOW_BLOCKS` 288 in both vaults (juicestx `579cf03`, fastpool `1ded288`), see below. ccd016 not affected. |
| Nested Quinn | I-1: in the full branch of `deposit-token-*-core`, `var-set bumped-token-*-principal` runs before the fallible append, so `cbf96c4`'s "no write before a u1010" rule is not literally true | yes | INFO | **No change**: scratch var, see below. |
| Void Kael | #2: during an oracle outage or core pause, a permissionless `push` (1 sat is enough) creates a fresh rung pending, and re-pushes after every 24h cancel, so members stay locked | yes | MEDIUM | **Fixed** in `jing-buy-stx-core-spread-v1` and `jing-buy-stx-market-spread-v1`: 24h push cooldown after the 24h cancel, an owner push pause, and exits wait on the pending only when they need it (`escrow-for`), see below. |
| Regal Anvil | #1: each old member's share of a tail-roll reserve is rounded down, so up to N-1 units per rolled epoch stay in `reserved-sats` forever | yes | LOW | **Fixed** in `jing-buy-stx-core-spread-v1`: the last old member's payout releases the leftover to the pool, see below. |
| Regal Anvil | #2: STX from fills while a rung has no members is watermarked away (F-7), and donated sats can keep a memberless order live | yes | INFO | **Already fixed** in `f015382` (ARION F-7): the watermark stays put with no shares, so the STX goes to the next epoch. Donated sats are unowned and taken by the next depositor as orphan. Holds on `jing-buy-stx-core-spread-v1`. |
| Void Kael | #4: the MINT_FLOOR tail roll cancels a stocked rung off the book (Nested Quinn M-2's root cause, new symptom) | yes | LOW | **Fixed** by the index rescale in `jing-buy-stx-core-spread-v1` (`741de17`): the index drifting under the floor rescales instead of closing. Same root cause as Nested Quinn M-2. |
| Nested Quinn | M-2: the cumulative `unfilled-index` only goes down, so a healthy, full rung that is filled and topped up again and again hits the floor | yes | MEDIUM | **Fixed** by the index rescale in `jing-buy-stx-core-spread-v1` (`741de17`), see `contracts/README-rung-index-rescale.md`. |

Nilo's submission also states that settle's catch-and-refund "writes nothing
before a caught u1010". That was wrong on `24f3e23`; see ARION's finding.

## ARION F-1: ghost deposit on a caught queue-full

**What broke.** `settle-token-{x,y}-deposit` catches `ERR_QUEUE_FULL` (u1010)
from `deposit-token-{x,y}-core` and refunds the pending amount. The core's
non-full branch wrote `token-*-deposits`, `token-*-deposit-limits` and
`cycle-totals` (and deleted the entrant's parked carry) before the list
append that can return u1010. Clarity keeps a private function's writes when
the caller catches its error, so the refund left a deposit record for a
principal who is not on the list. `cancel-token-*-deposit` then paid that
record a second time, out of other makers' escrow.

**How it is reached.** `side-full-{x,y}` compares the unseated count with
`50 - protected-seats`. When the seated list holds more principals than
`protected-seats` (for example `sync-seat` for one side lowers
`seats-per-side` while the other side keeps stale seats), the list can sit
at 50 while `side-full` returns false. The newcomer then takes the non-full
branch and the append fails. `settle` is permissionless, so anyone can
settle a victim's pending order into this state.

**Fix (`cbf96c4`).** In both cores and in all three copies
(`markets-sbtc-stx-jing-v6-3.clar`, `-formatted`, `-followAll`):

- Non-full branch: the list append is the first step, before any write.
- Full branch: the `bumped` var and the filtered list append come right after
  the size assert, before the parked-map writes, `log-park`, the transfer and
  the deposit writes. That append cannot fail in practice (the bumped
  principal is on the list, or the assert rejects first); the move keeps the
  rule "nothing that can return u1010 runs after a write" true everywhere.
- The core log calls stay `try!`. `jing-core-v6` never returns u1010, settle
  re-throws every other error, and the whole transaction rolls back.

## Fork runs

Harness: `simulations/verify-v6-3-ghost-deposit.js`. Real `jing-core-v6`,
`jing-ladder-v1` and market source, keyless Lazer update, fork clock pinned
2 s before it. Both sides: a Y market (STX) and an X market (sBTC), each with
2 seated band rungs, 47 fillers and a small maker P, list at 50. One band per
side is retired, max-band set to 1, and `sync-seat` is called from the other
side, so the list stays at 50 while `side-full` is false. Two victims per
side: V is new with nothing parked; P has 1 unit parked and submits 3 more.

Run: `node simulations/verify-v6-3-ghost-deposit.js [prefix] [patched] [followAll]`
(no argument runs prefix and patched).

| Run | Source | Checks | Simulation |
|---|---|---|---|
| Pre-fix | `24f3e23:contracts/markets-sbtc-stx-jing-v6-3.clar` | 341/341, bug reproduced as asserted | [89b43413](https://stxer.xyz/simulations/mainnet/89b43413f844780e1f5f986018e11dc5) |
| Patched | `cbf96c4:contracts/markets-sbtc-stx-jing-v6-3.clar` | 343/343 | [df2479d9](https://stxer.xyz/simulations/mainnet/df2479d986f19896fe111bfcc1877f52) |
| followAll | `contracts/markets-sbtc-stx-jing-v6-3-followAll.clar` | 317/343, comparison only, see below | [bf2835b2](https://stxer.xyz/simulations/mainnet/bf2835b2909e39ec9d3bb1295f26b5f9) |

The submitter's own run: [eec7dac2](https://stxer.xyz/simulations/mainnet/eec7dac25d4c06c4eee55a79864435ab)
(anchor 9050879, 153/153). Settle at step 140 in the stxer UI, ghost record
at 142, cancel paying again at 147.

**Pre-fix, asserted as the bug, both sides.** Both refunds log
"queue-full". V keeps a ghost deposit of 5 and a ghost limit record. P's
parked 1 is wiped and a ghost of 4 (carry + amount) is written. Cycle totals
rise by 9. Cancel pays V 5 again and pays P 4. V ends with 10, P with 7; the
market is short 8, taken from the other makers.

**Patched, both sides.** Both refunds still log "queue-full". After them:
deposit 0, no limit record, cycle totals unchanged, neither victim on the
list, pending none, P's parked 1 kept. V's cancel returns `(err u1005)`; P's
cancel pays only the parked 1. Each victim ends with exactly what it funded.
The market balance equals the book plus parked amounts.

**Regressions, pass on both sources.** A new maker settling on a full side
parks the smallest maker, is placed itself, the list stays at 50 and totals
and the market balance match. A normal settle on a side with room places the
order: on the list, deposit and limit stored, totals right.

**followAll.** An older baseline, not logically the same as the other two
copies (9 functions differ). Its settle uses `try!`, so a u1010 rolls the
whole transaction back and no ghost can appear. In the same stale-seat
state, though, its settle keeps failing and its cancel does not refund
pending escrow, so V's 5 and P's 3 stay stuck in pending. Not deployed; it
needs its own fix before it ever is. It is also over the 100 KB deploy limit,
so the harness strips comment lines and indentation before deploying it.

## Fluid Briar: switched-off ask on a full X side

**What broke.** `settle-token-x-deposit` refunds a new maker on a full X side
as "queue-full" when its order is switched off. v6-3 tested
`(and new-maker full (is-eq ask u0))`, but `ask` comes from `order-x-price`:
a switched-off pegged ask is `MAX_UINT` (`pegged-ask`), and a fixed ask is its
limit, which the entry check keeps above 0. So the test never fired. The dead
order fell through to `park-tenth-token-x` with ask `MAX_UINT`, could park a
live resident, and then sat on the book at a price that never fills. v6-2
tested `MAX_UINT` here (`markets-sbtc-stx-jing-v6-2.clar:1349`); the regression
came in with `c28fc77`. The Y side was right: a switched-off pegged bid is `u0`.

**When it bites.** With ask `MAX_UINT`, `park-tenth-token-x` can only park the
smallest live maker outside the 10 closest asks, and only when the newcomer is
bigger. A resting order that is already switched off is parked first when
there is one. When every resident is inside the 10 closest asks it refunds.

**Fix.** `(is-eq ask MAX_UINT)` in all three copies
(`markets-sbtc-stx-jing-v6-3.clar`, `-formatted`, `-followAll`).

**Fork runs.** Harness `simulations/verify-v6-3-switched-off-ask.js`
(`node simulations/verify-v6-3-switched-off-ask.js [prefix] [patched]`). Real
`jing-core-v6`, `jing-ladder-v1` and market source, no rungs. A fresh market
keeps 10 protected seats, so a side is full for a new unseated maker at 40.
The X side holds 38 fillers at 2,000 sats (fixed asks mid x1.50 to x1.87) and
two small makers, O1 (1,000 sats at x1.96) and O2 (1,500 sats at x1.95). The
newcomer submits 3,000 sats as a pegged ask, 100 bps over mid with a floor at
mid x3, so its price at settle is `MAX_UINT`.

| Run | Source | Checks | Simulation | Look at |
|---|---|---|---|---|
| Pre-fix | `bb1535d:contracts/markets-sbtc-stx-jing-v6-3.clar` | 222/222, bug reproduced as asserted | [f08e4ebe](https://stxer.xyz/simulations/mainnet/f08e4ebefc97f37fb427bb0226e6e1e9) | step 197 submit, step 199 settle prints `park-x` + `deposit-x`, step 200 O2 parked 1,500, step 204 newcomer on the list |
| Patched | working tree at this commit | 221/221 | [d1ea2618](https://stxer.xyz/simulations/mainnet/d1ea2618022db5399f650d1aafb9d8ee) | step 197 submit, step 199 settle prints `pending-refund-x` "queue-full", step 200 newcomer has its 3,000 sats back, step 204 O2 not parked |

**Reading step 199.** The newcomer `SP1HP2MDJ4TXVA1N5WDARSGNG4K8T201048S1HFW0`
submitted at step 197: sell 3,000 sats pegged 100 bps over the mid, never
below `u80745223039773` (8,075 uSTX per sat, about 124 sats per STX). The mid
was `u26918235626539` (2,692 uSTX per sat, about 372 sats per STX), so mid + 1%
is far under the floor and the order is switched off. The 3,000 sats were
already escrowed by the submit, so the settle moves no tokens and only prints.

- Pre-fix, step 199: `park-x` takes O2 (`SP534X06YZ64WWJ87ENZX0RY2CSPF0MZ87257ZX9`,
  1,500 sats, live, smaller than the newcomer) off the book, then `deposit-x`
  puts the switched-off 3,000 sats on it. A live maker is bumped for an order
  that can never trade.
- Patched, step 199 ([page 10](https://stxer.xyz/simulations/mainnet/d1ea2618022db5399f650d1aafb9d8ee?page=10)):
  `pending-refund-x` with reason "queue-full". The side is full and the order
  is switched off, so the 3,000 sats go back to the newcomer and O2 stays.

Regressions pass on both sources: a switched-on pegged ask (floor mid x1.005)
still goes through the normal park path and parks O1, and a switched-off
pegged bid on a full Y side (cap mid/4, bid `u0`) refunds "queue-full" with
nothing parked.

## Fluid Briar: recovered sBTC is never swapped again (rejected)

Scope: `fastpool-pox-5` branch `rapha/fastpool-swap-vault` at `f3ae8ef`,
`contracts/signer-manager-vault-stx-rewards.clar` and
`contracts/fastpool-swap-vault.clar`.

**The claim.** After a permissionless `recover-swap-vault`, a second
`fund-swap-vault` for the same cycle returns u1051 (`ERR_ZERO_VAULT_FUNDING`),
so a cycle meant to pay STX rewards pays the recovered part in sBTC. Their fork:
25k of 75k sats came back as sBTC, 0 STX for that part.

**Why it holds, mechanically.** `fund-swap-vault` books the whole funded
amount as swapped at funding time
(`swapped-sats: (+ (get swapped-sats settlement) unfunded-sats)`).
`recover-swap-vault` never takes the recovered sats back out of
`swapped-sats`, so for that cycle `pot - swapped = 0` and the next fund is
u1051.

**Why we reject it.** That is the recovery path working as designed. The vault
only lets the pool recover 432 burn blocks after funding
(`RECOVERY_DELAY_BLOCKS`, `emergency-recover`), once the swap has had its
window and failed. Recovery cancels whatever rests on Jing (pending, live,
parked) and returns the unsold sBTC and any STX to the pool. The pool books the
sBTC in `recovered-sbtc-by-cycle`, and the distribute step
(`get-unswapped-for-cycle`) pays each stacker their share of it as sBTC next to
their STX. Sats are recovered because they could not be swapped; paying them
as sBTC is the intended fallback, not a loss. No change.

The related real risk is Fluid Briar's `router-swap` finding: a griefer could
force that recovery on purpose. It is fixed, see the next section.

## Fluid Briar: router-swap sliver burns the cooldown

**What broke.** In the swap vaults, `router-swap` is permissionless and sold
`(sweep-amount requested)`: the whole balance when it is at or under
`max-chunk-sats`, otherwise whatever the caller asked for. Router sales share a
one-burn-block cooldown. Once a vault held more than one chunk, anyone could
sell a tiny sliver first in each burn block, so the keeper's real chunk failed
with u16044. Kept up for the 432-block recovery delay, that forces the
recovery path and stakers get sBTC instead of STX.

**Rating.** LOW, not LOW-MED as submitted. The griefer gains nothing, pays a
fee every burn block for about 3 days, sells the vault's sBTC at the vault's
own protected floor, and loses the whole attack the first time the keeper wins
a race.

**Fix.** `router-swap` takes no amount any more: `(router-swap (update (buff 8192)))`
sells `(chunk-amount)` = min(sBTC balance, `max-chunk-sats`), so every
permissionless sale is the whole balance or one full chunk. The now
unreachable chunk-size assert is removed from `router-swap`. `jing-take` and
`router-swap-split*` are pool-only (DAO-only for ccd016) and keep caller
sizing. `max-chunk-sats` now defaults to 1,000,000 sats (0.01 BTC, was 5M).

| Repo | Vault | Commit |
|---|---|---|
| `fastpool-pox-5` (`rapha/fastpool-swap-vault`) | `contracts/fastpool-swap-vault.clar` | `97712fb` |
| `juicestx` (`main`) | `contracts/pox-5/juice-pool-swap-vault.clar` | `20fb4f1` |
| `citycoins-protocol` (`feat/ccd015-redemption-book`) | `contracts/extensions/ccd016-swap-vault-mia-v2.clar` | `b6206f1` |

**Fork runs** (14 runs, all green on the 5M default; see the 1M rerun note below). The fix check: with more than one chunk in
the vault, a stranger's `router-swap` returns `(amount u<cap>)` and the vault
drops by exactly the cap; a second call in the same burn block is `(err u16044)`
and moves nothing.

| Vault | Run | Checks | Simulation |
|---|---|---|---|
| fastpool | lifecycle (fix check) | 41/41 | [0adbc215](https://stxer.xyz/simulations/mainnet/0adbc215c819850feda159662756aaf4) |
| fastpool | guards | 22/22 | [295eb259](https://stxer.xyz/simulations/mainnet/295eb2590799217f140aacc922e6873c) |
| fastpool | maker | 35/35 | [fb330f38](https://stxer.xyz/simulations/mainnet/fb330f38497cc25bd554fcd7e6010757) |
| all three | dust vaults | 68/68 | [1720443f](https://stxer.xyz/simulations/mainnet/1720443fe44fecb01421e89412335374) |
| juice | lifecycle (fix check) | 40/40 | [875f822c](https://stxer.xyz/simulations/mainnet/875f822ca07867b215823863c6a19ae1) |
| juice | guards | 21/21 | [7aee2d88](https://stxer.xyz/simulations/mainnet/7aee2d8803af3f83e080a6c287bac57d) |
| juice | maker | 34/34 | [8563e966](https://stxer.xyz/simulations/mainnet/8563e9663ba71c8105f68c01212b56bd) |
| juice | jing-router | 45/45 | [c9a12c66](https://stxer.xyz/simulations/mainnet/c9a12c6668057a16eb521087262da447) |
| juice | jing-take | 40/40 | [44518355](https://stxer.xyz/simulations/mainnet/44518355cda55a4e47ae74b61b346bcc) |
| juice | split-pyth | 41/41 | [4a4b99c8](https://stxer.xyz/simulations/mainnet/4a4b99c880aff85302dff7477d442b6d) |
| juice | recovery | 189/189 | [3518587d](https://stxer.xyz/simulations/mainnet/3518587d0dc97bf3b24872634df86a85) |
| ccd016 v2 | coverage (fix check) | 101/101 | [3c08babe](https://stxer.xyz/simulations/mainnet/3c08babeb990d72481fa968405016641) |
| ccd016 v2 | happy-path | 53/53 | [b50cdf63](https://stxer.xyz/simulations/mainnet/b50cdf63e9753e773e41b2d3205330ef) |
| ccd016 v2 | parked | 136/136 | [6d1f1880](https://stxer.xyz/simulations/mainnet/6d1f188055c71bbd6a6f093902b1368a) |

**Rerun on the 1M default: three sims hit u3002, as intended.** The table
above ran before `max-chunk-sats` moved from 5M to 1M. On the rerun, fastpool
lifecycle ([da0534f5](https://stxer.xyz/simulations/mainnet/da0534f57690429cb4251f0ec1545c24)),
ccd016 v2 coverage (86/101, [739f2591](https://stxer.xyz/simulations/mainnet/739f25913d9b030f5e40c02e9fb33d3e))
and happy-path (44/53, [a5a898c8](https://stxer.xyz/simulations/mainnet/a5a898c86808eea0641f58ef636592b6))
fail at the router sale with u3002, `ERR_MIN_OUT` in
`swap-router-sbtc-stx-jing-v5-3.clar`. Every other sim stays green.

This is the vault's 1% floor refusing a bad price, not a regression. The
vault takes the mid from the v6-3 market's `refresh-mid` on the fresh Lazer
update and sets `min-out` at mid x (1 - `slippage-bps`), 100 bps by default.
At 02:02 UTC on 2026-09-25 the Lazer mid was 269,792 STX per BTC (BTC
$84,611.47, STX $0.31362), so the floor was 267,094. Bitflow paid 266,815
for 1k sats (-1.10%), 266,640 for 50k (-1.17%) and 263,159 for 1M (-2.46%).
The AMMs sat about 1.1% under Pyth, so a router sale of any size misses the
floor. A control run of the pre-change fastpool code (`f3ae8ef`, old
`router-swap` with an amount) fails the same way at the same tip. Earlier the
same day the pools were closer to Pyth and the same sims passed. When the
pools sit under the floor the vault waits (or the maker / Jing book path
fills); the admin lever is `set-slippage-bps`. The sims that sell through the
router should either expect u3002 in that market or raise `slippage-bps`
before the sale.

The commits above include result JSONs from those red reruns (fastpool
`fastpool-liquidation.json`, citycoins `coverage.json` and `happy-path.json`).

Trade-offs, accepted: the keeper can no longer pick a smaller router chunk;
`set-max-chunk-sats` is the lever (a DAO proposal for ccd016). Final
remainders between 3 and 499 sats were not exercised through the router.
The local clarinet-sdk vault suites do not run yet: their fixture market is
v6, not v6-3 (no `get-token-x-pending-deposit`), so they need a v6-3 mock.

## Celestial Shark: failed cross-remainder reverts the settlement (rejected)

**The claim.** `swap` (and the swap leg of `reprice-or-swap-token-*`)
deposits, settles the cycle through `settle-with-refresh`, then walks the book
with the rolled remainder (`cross-remainder-as-x/y`). If more than the market
minimum is still unfilled, it fails with `ERR_PARTIAL_FILL` (u1017,
`asserts! (< rem (var-get min-token-*-deposit))`), and that revert also undoes
the cycle settlement done in the same call. The submission calls this a DoS
that ties cycle N's settlement to one swapper's crossing in N+1. Source
analysis only, no fork run.

**Why we reject it.** The revert only undoes the swapper's own transaction.
Settlement is not owned by `swap`: `settle-with-refresh` is public and
permissionless, so anyone (a keeper, a maker, the next taker) settles the
cycle in a separate transaction with a fresh Lazer update, whatever any
swapper does. A failing swap blocks nobody else. `swap` being all-or-nothing
(fill within the limit, or revert and keep your funds) is the intended taker
contract. No change.

## Light Brio L-2 / ARION F-4: leftover pending limits and readmits

**The claim.** `settle-token-*-deposit` only deletes the pending deposit it
settles. A maker's separate pending limit (`set-token-*-limit`) or pending
readmit stays until someone settles it. Example: Alice submits a new limit
for her live order, the order fills completely before anyone settles the
limit, and the pending limit now points at nothing. ARION adds that cancel
cannot clear it (live + parked are zero, `ERR_NOTHING_TO_WITHDRAW`), and that
if Alice later places a new order, anyone can settle the old limit onto it.
Suggested fixes: delete both pending maps in settle as cancel does (Light
Brio), or let cancel run when only a pending limit exists (ARION).

**Why we reject it.** No funds are at stake: a pending limit or readmit holds
a price or a flag, never escrow. Nothing can be replayed: every settle deletes
its own pending entry before acting (`settle-token-*-limit`,
`settle-token-*-readmit`, `settle-token-*-deposit`). A leftover limit settled
while the maker holds nothing is deleted and refused as "gone"
(`settle-refused-*`, `(ok false)`). Every pending item is readable
(`get-token-*-pending-limit`, `-pending-readmit`, `-pending-deposit`) and
logged at submit, and our keeper settles pending items, so a leftover is
normally cleared long before a new order exists. If it is not, it is the
maker's own old instruction: Alice can settle it herself (which deletes it)
before depositing again. So we do not delete pending entries inside settle
(Light Brio's fix): that would also drop a newer pending limit on a live order.

**What we adopted: ARION's cancel guard.** Before, cancel refused with u1005
unless the caller had live, parked or pending-deposit funds, so a maker whose
order had filled could not clear their own orphan. Cancel now also runs when
only a pending limit or pending readmit is left:

```clarity
(asserts! (or (> amount u0) (> parked u0) (> pending-amount u0)
  (is-some (map-get? token-y-pending-limits caller))
  (is-some (map-get? token-y-pending-readmits caller)))
  ERR_NOTHING_TO_WITHDRAW)
```

In that case cancel deletes the pending limit, pending readmit and stored
limit, moves no funds and returns `(ok u0)`. Every maker now has one call that
wipes all of their state. `-followAll` keeps its older cancel.

**Why it helps the swap vaults (ARION F-3).** A vault's `jing-refloor` leaves a
pending limit on the market; if the vault's position fills before a keeper
settles it, that limit is an orphan the next batch could inherit (a stale high
floor switches the next peg off). The vault's `jing-reclaim` / recovery reach
the market's cancel through `reclaim-core`: before, that call failed u1005 in
this state; now it succeeds with 0 and clears the orphan, so a reclaim leaves
the vault's market state clean for the next batch.

**Fork runs.** Harness `simulations/verify-v6-3-cancel-orphan-pending.js`
(`node simulations/verify-v6-3-cancel-orphan-pending.js [prefix] [patched]`).
Y side, X mirror on its own market, and an orphan-readmit case on a full third
market. Every market's balances equal its book totals after each scenario.

| Run | Source | Checks | Simulation |
|---|---|---|---|
| Pre-fix | `7c6172b:contracts/markets-sbtc-stx-jing-v6-3.clar` | 227/227, bug reproduced as asserted | [3fbe8566](https://stxer.xyz/simulations/mainnet/3fbe85661a8834d568e023cd286694b0) |
| Patched | this commit | 225/225 | [5f4f26ee](https://stxer.xyz/simulations/mainnet/5f4f26ee01aa752b9ea79793359d62a7) |

| Step (Y / X) | Call | Pre-fix | Patched |
|---|---|---|---|
| 126 / 175 | A cancels with only an orphan pending limit | `(err u1005)`, limit kept | `(ok u0)`, limit, readmit and stored limit cleared |
| 139 / 188 | third party settles the old limit after A's new order | `(ok true)`: stale limit replaces A's new one | `(err u1030)`, A's limit unchanged |
| 142 / 191 | cancel with nothing at all | `(err u1005)` | `(err u1005)` |
| 145 / 194 | A cancels a live order | exact refund | exact refund |
| 225 | Q cancels with only an orphan pending readmit | `(err u1005)` | `(ok u0)`, readmit cleared |

The pre-fix run shows the stale limit is not cosmetic: A's new passive bid at
mid/3 became mid x1.5 on Y, and the ask at mid x3 became mid x2/3 on X.

## ARION F-2: vault refloor only submits a pending limit (rejected)

**The claim.** In the swap vaults, `jing-refloor` / `refresh-guard` call the
v6-3 market's `set-token-x-limit`. While the other side's list is non-empty,
that only records a pending limit (`token-x-pending-limits`, `(ok false)`); the
new floor takes effect when `settle-token-x-limit` runs with a Lazer update
newer than the submit. No vault, pool, signer-manager or rung contract calls
`settle-token-x-limit`, so a refloor looks done while the floor on the book is
unchanged, and any third party can pick the print it settles on. Suggested
fixes: have the refloor call `settle-token-x-limit current-contract update`
right after submitting, or leave the settle to keepers and document it.

**Why we reject it.** The first fix cannot work: settle requires a price newer
than the submit (`ERR_PRICE_BEFORE_ORDER`), and an update signed before the
transaction is always older than that block's `stacks-block-time`. Submit then
settle in a later block is the whole design of v6-3, for every maker action.
The pending limit is logged at submit (`log-pending-limit-x`) and readable
(`get-token-x-pending-limit`), and our keeper settles it with the next fresh
update. Letting anyone settle is also by design: the limit value is the
vault's own oracle-checked number, so a third party only chooses the moment
within the freshness window, and a crossing print refuses the change instead
of applying it. No change.

## ARION F-5: permissionless readmit (rejected, by design)

**The claim.** Anyone can call `readmit-token-*` for any parked maker. That
queues a pending readmit, so the maker's own readmit fails
`ERR_ALREADY_PENDING` until it settles, and the permissionless
`settle-token-*-readmit` lets a third party put the parked order back on the
book at the maker's stored limit on a print of their choosing. Suggested fix:
only `who` may submit their own readmit.

**Why we reject it.** Readmitting parked makers is meant to be done by anyone,
keepers first: a parked order sits off the book only until there is room, and
putting it back is service, not an attack. The order goes back at the price
and size the maker set; nothing else changes and no funds move to anyone but
the book. A maker who does not want to be readmitted cancels, which returns
parked funds (and now also clears a leftover pending readmit). No change.

## ARION F-6: settle-escrow underflow (not reachable, hardened)

**The claim.** Every rung's `settle-escrow` tests the 24-hour cancel rule as
`(>= (- stacks-block-time (get submitted-at pending)) u86400)`. If
`stacks-block-time` were ever below the pending order's `submitted-at`, the
subtraction would underflow and panic the whole withdraw instead of returning
a clean error. The submission calls `stacks-block-time` a median-time-past
value that can go backwards.

**Why it is not reachable.** Median-time-past is a Bitcoin rule. A Nakamoto
Stacks block's timestamp must be later than its parent's, and signers reject
blocks that break that, so `stacks-block-time` cannot drop below a
`submitted-at` recorded in an earlier block.

**Hardened anyway.** The same rule is now written without a subtraction, in
all six rungs:

```clarity
(>= stacks-block-time (+ (get submitted-at pending) u86400))
```

Same 24-hour rule, no underflow possible. Landed in `afbf33d`; present in
all six `-v1` rungs.

## Nested Quinn M-1: capacity gross-up at the max rebate (fixed)

Commit: `0d6ae85` (with Void Kael #1).

Submission reviewed `bb1535d`, clarinet-sdk tests on the real market, router and vaults.

**The claim.** `get-taker-capacity` returns `net-cap`, the most the book can
fill, and `gross-cap`, what a taker sends so that `net-cap` reaches the book
after the taker rebate. `gross-up` assumed the MAX rebate (70 bps). A swap
charges its rebate by print age: 20 bps up to 30 s, +1 bp per second after,
70 bps from 80 s. On a fresh print (the normal case for a keeper or a front
end) the swap keeps only 20 bps, so `gross-cap x 0.998` = `net-cap x 1.005`
reaches the book: 0.5% more than it can fill. Swap is fill-or-kill: a rest at
or above the minimum fails `ERR_PARTIAL_FILL` (u1017). At a 1,000-sat minimum
that is every binding book of ~199k sats or more. The router catches the error
and drops the whole book leg (`jing-ok false`), routing everything to the
AMMs; the vault `router-swap` reverts u3002.

**Why it holds.** The rebate is kept by the market, it never reaches the book.
The case that must not fail is the one where the MOST reaches the book, which
is the SMALLEST rebate (20 bps), not the largest. The earlier change "from 20
to 70" in `simulations/README-v6-3-caller-impact.md` picked the wrong worst
case.

| gross-up at | fresh print (20 bps kept) | stale print (70 bps kept) |
|---|---|---|
| 70 bps (before) | 0.5% over capacity: u1017 | exactly the capacity |
| 20 bps (now) | exactly the capacity | 0.5% under: fills, the rest goes to the AMMs |

**Fix.** `gross-up` in `markets-sbtc-stx-jing-v6-3.clar` uses
`TAKER_REBATE_BPS` (20) instead of `TAKER_REBATE_MAX_BPS` (70). A stale print
leaves at most ~0.5% of the capacity to the AMMs and never fails.

Residual edge: on a full side a taker must exceed the smallest maker
(`min-taker`). If the capacity is within 0.5% of that bar and the print is
stale, the smaller net can land under it. Callers already read `min-taker`.

## Void Kael #1: capacity counts small makers that settlement rolls (fixed)

Commit: `0d6ae85`.

Submission reviewed `0da8978`, clarinet-sdk tests on the real market and router.

**The claim.** At settlement, `filter-small-token-*-depositor` rolls every
maker holding under `MIN_SHARE_BPS` (0.2%) of its side to the next cycle
instead of clearing it. `get-taker-capacity` did not mirror that: it counted
every in-range maker. Example, all bids at the mid: 10,000 STX (99.81%) and
19 STX (0.19%). Settlement clears only the 10,000; the capacity quoted 10,019.
A swap sized to the quote keeps a ~6k-sat rest over the minimum and fails
u1017, and the router drops the whole book leg. One small order at the mid,
never filled and cancellable any time, keeps it going; a stale small bid above
the mid does it by accident. Independent of Nested Quinn M-1: the M-1 fix
alone still fails.

**Fix.** Two new folds, `cap-kept-bid-fold` / `cap-kept-ask-fold`, sum the
opposite side's in-range makers that hold at least 0.2% of the whole in-range
side; `opposite` is built from that instead of the raw in-range total (all
three v6-3 copies).

**Why the whole side and not the shrinking one.** Settlement tests each maker
against a total that shrinks as it rolls makers out (Regal Anvil #3), so it
rolls at most the makers under 0.2% of the whole side. The capacity tests
against the whole side, so it skips everything settlement rolls, plus at most
a few borderline makers. The quote can only be a little low, never high: it
still fills, and the router sends the rest to the AMMs. The capacity does not
need to copy the list order. (Since Regal Anvil #3 below, settlement also
tests against the whole side, so the two now match exactly.)

`own` (the taker's side) is left as is: over-counting it only lowers the quote.

## Regal Anvil #3: the small-share floor depends on list order (fixed)

Commit: `ed4ec28`.

Submission reviewed `afbf33d`, source only.

**The claim.** `filter-small-token-*-depositor` runs over the cycle list in
order and re-reads the side total on every step, after earlier steps have
already taken the rolled makers off it. A maker tested later is compared to a
smaller total, which is an easier bar. Side 10,000, bar 0.2% = 20: A (19)
first rolls, total 9,981, bar 19.96, so B (19.97) stays. Swap A and B in the
list and B rolls instead. Borderline makers only, no funds at risk.

**Fix.** `execute-settlement` stores the side totals in two new data-vars,
`small-share-base-y` / `small-share-base-x`, right before the two
`map filter-small-*` calls (after the limit-violating rolls). The filters
compare against that snapshot; the running total is still decremented for the
books. Every maker now meets the same bar whatever its place in the list, and
it is the same bar `get-taker-capacity` uses (Void Kael #1). All three v6-3
copies.

## Void Kael #5: taker matched by principal, not by side (fixed)

Commits: `2460613`, `816c507`.

**The claim.** During a swap (`crossing`), `filter-small-token-*` flags
`taker-too-small` (u1020) when a small depositor is `tx-sender`, and
`distribute-to-token-*` skips the sub-minimum refund for `tx-sender`. Both run
on BOTH sides. So a user with a small order resting on the opposite side (15
STX bid at the mid, 0.15%) cannot sell sBTC: the y filter sees the bid, sees
`tx-sender`, and fails u1020. The router drops the book leg silently. If that
bid survives the filter but is filled under the minimum, its rest is rolled
instead of refunded. Self-inflicted only: nobody else can trigger it, and
cancelling the bid unblocks the swap.

**The rule itself stays.** A taker's own leg must still be at least 0.2% of
its own side. A small maker can be rolled to the next cycle, but a swap is
fill-or-revert, so a taker that small would only get a pro-rata share that
rounds to dust. `swap` deposits the taker and then runs one settlement, so
in-range makers already resting on the taker's side share that batch and
count in the 0.2%.

**Fix.** New data-var `crossing-x` (the taker's side), set next to every
`(var-set crossing true)`: `deposit-x` in `swap`, `false` in
`reprice-or-swap-token-y`, `true` in `reprice-or-swap-token-x`. The y-side
checks require `(not crossing-x)`, the x-side checks require `crossing-x`. The
taker's opposite-side order is then treated like any maker's: rolled when
small, refunded when left under the minimum. All three v6-3 copies.

Not changed: the swap tuple can still report that opposite-side order's fill
in the taker fields (the router does not read them), and
`get-taker-capacity` still counts the taker's own opposite-side order when it
is at least 0.2%. The `caller-token-*` writes in `distribute-to-token-*`
(the swap tuple) are still keyed on `tx-sender` alone; nothing spends from the
opposite side's fields (`cross-remainder-as-*` reads only the taker's own
side), so it is reporting only.

Other readers checked: `crossing` is read only by these four checks and the
side-blind "nothing to settle" bypass in `execute-settlement`; `crossing-x` is
only read while `crossing` is true, and every site that sets `crossing` true
sets it; the book walk still excludes the taker by principal on both sides
(no self-fill), unchanged.

## Void Kael #3: an older pending instruction overwrites a newer limit (fixed)

Commit: `a84ce43`.

**The claim.** A maker's price can come from three places per side:

| map | holds | time |
|---|---|---|
| `token-*-pending-deposits` | a pending top-up with its own limit | `submitted-at` |
| `token-*-pending-limits` | a pending limit change | `submitted-at` |
| `token-*-deposit-limits` | the limit the order actually uses | none |

Both pending maps write the stored limit when they settle, and `set-limit` /
`reprice` write it directly. The stored limit had no time, so the last write
won, not the newest instruction. Example: Alice submits a top-up at L1 = mid
(pending), then sets L2 = mid - 5% (stored directly, or its pending limit
settled first). Anyone then settles the OLDER top-up and the stored limit is
L1 again; a taker fills her at a price she had withdrawn (+4.2% to +7.7% in
the tests). The reorder and the swap fit in one block. No escrow is lost; the
harm is bounded by the gap between her own two limits.

**Fix.** The stored limit remembers when its instruction was made, and a
settle only writes an instruction at least as new.
- `token-*-deposit-limits` gains `set-at: uint` (`get-token-*-order` defaults
  it to `u0`).
- `deposit-token-*-core` gains `instr-at`: `(get submitted-at pending)` from
  `settle-token-*-deposit`, `stacks-block-time` from a direct deposit or a
  swap. Its limit write goes through the new `put-limit-*`, which writes only
  when there is no record or `instr-at >= set-at`. The amount and carry are
  always added.
- `settle-token-*-limit` refuses `"stale"` (the existing refusal log,
  `(ok false)`, pending limit deleted) when the stored `set-at` is newer than
  the pending's `submitted-at`, and otherwise writes `set-at` = `submitted-at`.
- Direct writes (`set-token-*-limit`, the direct branches of
  `reprice-or-swap-token-*`) write `set-at: stacks-block-time`.

Neither path errors on a stale instruction. A settled top-up still adds its
amount at the newer price (failing would leave the escrow stuck pending, every
retry failing the same way, until the maker cancels). A stale pending limit is
deleted and the settle returns `(ok false)`.

A record exists only while the order is live or parked (every exit deletes
it), so a top-up that settles after its order was fully filled is a new order
and writes its own limit. All three v6-3 copies.

Not changed: `log-deposit-*` still prints the pending's limit even when the
stored one was kept.

## Regal Anvil #4: readmit skips the minimum (by design)

**The claim.** `settle-token-*-readmit` checks gone / full / crossing but not
the current deposit minimum, while every entry path checks it.

**Why no change.** Readmit is a restoration, not a new entry. The maker passed
the minimum when the order first entered; parking only moved it off a full
side for a while, and readmit puts back the same order (amount and price).
The minimum is checked at entry and governs the order for its lifetime, the
same rule as pending deposits since `08a9ef8`. A parked amount can only be
under the current minimum if the owner raised the minimum after the park.
Such an order comes back live; the walk already skips makers under the
minimum and `distribute` refunds a sub-minimum rest after a fill, so nothing
is lost.

## Nested Quinn I-1: scratch write before the append (no change)

`bumped-token-*-principal` is a helper for the list filters, not state: every
reader (`not-eq-bumped-*`) sets it right before use in the same function, so a
value left behind by a caught u1010 is never read. The append after it cannot
fail anyway: `smallest-who` comes from the same list, so the filter removes
one entry first (also re-checked at HEAD by Void Kael). Rewriting the filter
to avoid the var would change working code for no gain.

## Void Kael #2: a permissionless push re-locks rung exits (fixed)

Commits: `2ac4e58`, `991635f` (market-spread-v1), `c2fe0cd` (core-spread-v1).

Checked against the `-v1` rungs: `settle-escrow` and `push` are identical
across the three buy `-v1` rungs and across the three sell `-v1` rungs, and
the rescale in `jing-buy-stx-core-spread-v1` does not touch them.

**The claim.** A rung's `withdraw` runs `settle-escrow` first: a pending
younger than 24h must be settled (Lazer update, unpaused core-v6), an older
one is cancelled with no oracle. `push` is permissionless and needs no oracle.
During an outage or a core pause:
1. On a live rung with no pending, anyone sends 1 sat to the rung (a plain
   transfer, not `deposit`, so the 100-sat minimum does not apply) and calls
   `push`. The market takes it as a top-up (its minimum is on the whole
   position). Every withdraw now waits on that pending, so every exit needs
   the oracle.
2. After 24h the first withdraw cancels the pending and the funds come back
   to the rung. Anyone calls `push` again, the funds become a new pending, and
   the others are locked another 24h. It repeats for the whole outage.
An honest deposit or keeper push does the same. No funds are lost. A market
pause stops it (`push` returns `(ok false)`), but only once the operator
reacts.

**Fix.**
- 24h cooldown: the 24h cancel branch of `settle-escrow` records
  `escrow-cancelled-at`, and `push-to-market` refuses (`ERR_ESCROW_COOLDOWN`
  u7015) for 24h after it. `push` and `deposit` already treat a refused push
  as "hold here", so the returned funds stay in the rung and every member can
  exit without an oracle for that day. The lock is at most one 24h window.
- Owner push pause: `set-push-paused` (ladder owner, `tx-sender`, like `initialize` in core-spread) makes
  `push-to-market` refuse (`ERR_PUSH_PAUSED` u7014), so the operator can stop
  the attack for one rung without pausing the whole market. Deposits stay held.

The cooldown also blocks a direct placement (opposite side empty, no pending)
for that day; members can still exit, so it only delays re-listing.

- Exits wait on the pending only when they need it (also ARION F-9):
  `withdraw` no longer runs `settle-escrow` up front. The new `escrow-for`
  settles it only when held + live + parked cannot pay the exit, then syncs
  again (a settle can refund the escrow to the rung). `pull-to-held-sats`
  sizes its partial withdraw on live + parked (`on-book`), so a pending the
  exit did not need stays pending; its cancel branch still returns the
  pending too. A 1-sat grief pending no longer blocks any exit the rung's
  other funds cover.

Order check: `withdraw` now syncs before a possible settle. That is safe
because a settle never changes what the rung owns: `sync` counts live +
parked + pending + held, and a settle only places the pending (it becomes
live or parked) or refunds it to the rung; it never fills. The second sync in
`escrow-for` only books a refund as held. `pull-to-held-sats` is private and
only called by `withdraw`; `on-book` equals `market-size` whenever no pending
is left. `deposit`, `push`, `sync` and `roll-tail` are unchanged (their only
difference is the cooldown and pause inside `push-to-market`).

What remains: an exit that really needs the pending funds (most of the pool
was just pushed into it) waits for a settle or the 24h cancel, and after the
cooldown the grief can re-push; the owner push pause closes that.

Status: in `jing-buy-stx-market-spread-v1` and `jing-buy-stx-core-spread-v1` (the rung under review for now, which also carries the Nested Quinn M-2 rescale). The other `-v1` rungs later.

## Regal Anvil #1: tail-roll reserve dust (fixed)

Commit: `2814e8b`.

**The claim.** `roll-tail` reserves the closing epoch's unsold total as one
rounded-down amount; each old member later takes a share that is also rounded
down. The shares add up to a little less than the reserve, and nothing ever
released the rest: `sync` keeps `reserved-sats` out of the pool. Under 1 unit
per member per tail roll. The rescale's leftover shares add the same kind of
dust.

**Fix** (`jing-buy-stx-core-spread-v1`). The dust is only known once every old
member has taken its share (summing the rounded shares at the roll would need
a loop over all members). So:
- `roll-tail` stores `epoch-reserve[epoch] = {left: members, reserve}`.
  `reserved-sats` stays one total for the whole rung (the sum of what every
  rolled epoch still owes); `epoch-reserve` is each epoch's part of it.
- `settle-proceeds`, for an old-epoch row, calls `count-reserve-claim`: one
  less `left`, `reserve - back`. When the last one is paid, the rest leaves
  `reserved-sats` and goes to `held-sats`.
- In the pool it is unowned, like a donation, and goes to a later depositor
  as `orphan`; nothing stays locked. The tail roll is the only close that
  reserves anything (the last-member close reserves nothing).

An old member who never comes back keeps its epoch's dust waiting; that is
still their claim.

## Nested Quinn L-2: patience window longer than the recovery delay (fixed)

**The claim.** The juice and fastpool swap vaults accept `set-window-blocks`
up to `MAX_WINDOW_BLOCKS` (1008), but recovery is timed from the batch start:
the vault's `emergency-recover` at `start + RECOVERY_DELAY_BLOCKS` (432),
the juice pool's recovery (permissionless) and fastpool's `recover-swap-vault`
deadline (first claim + 432). With any window above 432, anyone can recover
while the window is still open: the vault's resting order is cancelled and the
batch ends as a recovery (paid in sBTC).

**Fix.** `MAX_WINDOW_BLOCKS` is 288 (the default) in `juice-pool-swap-vault`
(juicestx `579cf03`) and `fastpool-swap-vault` (fastpool-pox-5 `1ded288`).
The window always closes before recovery can open, leaving 144 blocks to
liquidate. No pool change. The juicestx fastpool fixture and both setter-range
tests follow. `ccd016-swap-vault-mia-v2/v3` keep 1008: they have no timed
recovery.

The juicestx `test:vault` harness fails at build on `is-empty` ("expecting
read-only statements") with or without this change, so it did not run.

## Nested Quinn L-1: vault `router-swap` is all or nothing (fixed)

**The claim.** `router-swap` (juice, fastpool, ccd016 v2) sells one chunk
(`chunk-amount`: the balance or `max-chunk-sats`) and passed the router
`min-out = floor x the whole chunk`. The router sells only what fits inside
the floor (each leg is bounded by the limit) and returns the rest as
`unsold`. Any unsold part then made `out < min-out` and the router reverted
u3002: while the pools inside the 1% floor are thinner than the chunk,
nothing sells at all, and the batch waits for the 432-block recovery or an
admin / DAO step. Still true after the `20fb4f1` chunk sizing.

**Fix.** The vault passes `min-out` u0 to the router and checks the floor on
what actually sold: `sold = amount - unsold`, `sold > ROUTER_SLACK_SATS`, and
`out >= floor-out(sold - ROUTER_SLACK_SATS)` (`ERR_BELOW_FLOOR` u16047).
`ROUTER_SLACK_SATS` is 8: the router lets each of its four legs land up to
`ROUND_SLACK` (2) sats under the limit. The unsold rest never leaves the
vault and sells on the next call. A call that sells 8 sats or less reverts,
so it cannot burn the shared cooldown for nothing. The router is unchanged.
(The allowance was widened later by Void Kael #8.)

`ccd016-swap-vault-mia-v3` is a work in progress and not changed here.

Commits: juicestx `94fd310`, fastpool-pox-5 `671a53f`, citycoins-protocol
`ccd9f01`. Not run yet: see "Before deploy".

## Void Kael #6: a dust-only batch wedges `finish` (fixed)

Commits: juicestx `cbbba88`, fastpool-pox-5 `3c763b5`.

**The claim.** `is-empty` treats up to `DUST_SATS` (2 sats) as empty, so a
batch funded with 2 sats or less can be closed at once (`close-batch` is
permissionless) with nothing sold and 0 STX in the vault. `finish` then sent
`stx-transfer? 0`, which fails `(err u3)`, on every call. The pool can never
finalize: juice `pending-swap` stays set (every claim u115, recovery u16032,
rotation u115); fastpool `vault-cycle` stays set (every other cycle's funding
u1050). Only an outside 1 uSTX transfer to the vault unstuck it. The funding
comes from a real claim only (juice `pox-claim-rewards` -> `fund claimed`;
fastpool `fund-swap-vault` from a cycle's claimed, unswapped rewards; `fund`
is pool-only), so the trigger is a 1-2 sat claim.

**Fix.** `finish` (juice and fastpool vaults) moves STX only when the balance
is above 0, as `emergency-recover` already does; the `try!` stays, so a real
transfer failure still errors. The pools already accept a 0 finish. The 2
sats ride into the next batch, as `DUST_SATS` intends. A 0-STX finish is only
possible after `close-batch`, which needs `is-empty`, so a batch that still
holds real sBTC cannot be finished early.

Rejected alternative: refuse fundings of `DUST_SATS` or less in `fund`. It
would make a small real claim revert until more rewards accrue (or someone
donates), which is an outside step again.

## Void Kael #7: market dust holds a sold-out batch open (fixed)

Commits: juicestx `394242e`, fastpool-pox-5 `8848c9f`, citycoins-protocol `9160743`.

**The claim.** `DUST_SATS` lets `is-empty` ignore up to 2 sats in the vault
wallet, but it requires the vault's market position (live, parked, pending) to
be exactly 0. After the vault's order sells out, anyone sends it 1 sat and
calls the permissionless `jing-place`: the market takes it as a top-up (the
minimum is on the whole position) and escrows it. `close-batch`, `finalize`,
reclaim and recovery then refuse until the window ends (288 blocks), so the
pool's next claim (juice u115) or funding (fastpool u1050) waits. A settle
only turns it into a 1-sat live ask, just as non-empty. No funds at risk.

**Fix** (juice, fastpool, ccd016 v2). New private `market-total` (live +
parked + pending). `close-batch` first cancels the vault's market position
(`reclaim-core`, no oracle, no pause check) when it is above 0 and wallet +
market is at most `DUST_SATS`; the sats come home as wallet dust and
`is-empty` holds, so the batch closes at once. The dust rides into the next
batch, as `DUST_SATS` intends. A real position (more than 2 sats) is never
cancelled by this. If the cancel fails, `close-batch` refuses as before.

Rejected alternative (Void's tested one): a minimum on `jing-place`. The
ccd016 README already rejected it (it would only price the call and strand
the last chunk).

## Void Kael #8: `router-swap` allowance band (fixed)

Commits: juicestx `45bf3be`, fastpool-pox-5 `7e9847f`, citycoins-protocol `616180e` (then `6c6075f`, `clarinet format` only).

**The claim.** When the book leg only partly fills, the market refunds the
vault its rest plus unused rebate crumbs, and the router re-sells both. The
unsold part never leaves the vault, but refunded sats leave twice (to the
market, then to the AMMs), so the gross outflow `amount + rest + crumbs` can
pass the allowance `amount + min-x`, and `as-contract?` aborts `(err u0)`.
Measured band: book capacities 198,320-198,440 sats on a fresh print.

The Nested Quinn M-1 fix removed the known cause (a quote-sized book leg now
fills in full), but not every possible one.

**Fix** (juice, fastpool, ccd016 v2 `router-swap`). The vault only ever gets
back two things from the book leg (`cross-remainder-as-x`): the rest, always
under `min-x` (else u1017), and the unused rebate `pending-rebate-x`, never
more than the rebate charged, which is at most `TAKER_REBATE_MAX_BPS` (70 bps)
of `amount`. So the allowance is now

    amount + min-x + amount x JING_REBATE_MAX_BPS / BPS_PRECISION

with `JING_REBATE_MAX_BPS` u70, the market's `TAKER_REBATE_MAX_BPS`, as a
vault constant (no contract call). That holds for any book, print age and number of fills.
A tighter `+9` or `+57` does not: per-fill rounding and the rebate crumbs grow
with the number of makers and the chunk size. Only the vault's own router
call can use the extra room.
