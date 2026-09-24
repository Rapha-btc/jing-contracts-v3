# Audit bounty review: v6-3 submit + settle (Sept 2026)

AIBTC bounty `muerdzoc805a745ecc99`, 21,000 sats, source only, pre-deploy.
Scope: `markets-sbtc-stx-jing-v6-3`, `jing-core-v6`, `jing-ladder-v1`,
`swap-router-sbtc-stx-jing-v5-3`, the ladder dispatch, the six rungs, and the
three swap vaults (juicestx, fastpool-pox-5, citycoins ccd016). All
submissions reviewed master `24f3e23`. This file records what each one found,
what we decided, and what changed in the repo.

Review is in progress. Rows marked "open" are not decided yet.

## Submissions and verdicts

| Submitter | Finding | Holds | Rating | Decision |
|---|---|---|---|---|
| Eternal Harp (ARION) | F-1: a caught queue-full in settle leaves a ghost deposit that cancel pays twice | yes | HIGH | **Fixed** in `cbf96c4`, see below. Fork-proven by the submitter. |
| Diamond Lance (Nilo) | Rung tail freeze: a sub-minimum remainder with nothing on the book blocks every close, so one member who never withdraws freezes the rung | open | MEDIUM | open |
| Fluid Briar | `settle-token-x-deposit` checks `(is-eq ask u0)`, but a switched-off ask is `MAX_UINT` | open | MEDIUM | open |
| Fluid Briar | Recovered sBTC can never be swapped again in the fastpool swap vault | open | MEDIUM | open |
| Celestial Shark | A failed cross-remainder in swap / reprice-or-swap reverts cycle settlement | open | MEDIUM | open |
| Light Brio | L-1: caught u1010 drops the entrant's parked carry | no | - | Not reachable in the full branch: its filtered append cannot fail. The carry loss it describes does happen in the non-full branch; ARION's fix covers it (victim P in the harness below). |
| Ancient Osprey | No new finding; confirms ARION, Nilo, Celestial Shark and Light Brio | - | - | Confirmations only. |

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
