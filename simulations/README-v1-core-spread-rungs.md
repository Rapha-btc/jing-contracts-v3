# Core-spread v1 rungs: stxer fork tests and coverage

Scope: the two rungs in deploy scope, `contracts/jing-buy-stx-core-spread-v1.clar`
(sBTC resting on the market's x side, earns STX) and
`contracts/jing-sell-stx-core-spread-v1.clar` (STX resting on the y side, earns
sBTC), running with `markets-sbtc-stx-jing-v6-3`, `jing-core-v6` and
`jing-ladder-v1`. The other four `-v1` rungs are out of deploy scope.

## 1. Source provenance

| contract | sha256 | commit |
|---|---|---|
| `jing-buy-stx-core-spread-v1` | `9a7b2381…c666f0` | `661d822` |
| `jing-sell-stx-core-spread-v1` | `ef91b659…6964b0` | `702a545` (port of the buy fixes) |
| `markets-sbtc-stx-jing-v6-3` | `d1e3bbad…6cca9` | `72b60b0` |
| `jing-ladder-v1` | `0f1e08b0…c786` | |
| `jing-core-v6` | `d45f1bff…1bce` | working tree: `72b60b0` plus an uncommitted `log-jing-swap-reconciled` from other work; the rungs do not call it |

All hashes were identical at the start and end of the run. Coverage counts
only deployments byte-identical to the rung sources (`--by-source`).

## 2. Test result

`simulations/verify-v1-core-spread-rungs.js`: **991 / 991 checks, 0 unexpected
failures**, both rungs in one run:
[02e540f6](https://stxer.xyz/simulations/mainnet/02e540f6cdd8456f035ffdc1b7d520e5).
No bug and no buy / sell asymmetry.

Each rung is deployed seated (`-spread-20`) and unseated (`-spread-30`); fills
are real swaps priced by a Lazer update. A BigInt model predicts every rung
transaction; the sim asserts the result, the ladder prints, every rung
variable and map, `get-position`, the market position, balances and wallets
exactly. A probe contract calls every read-only getter inside a transaction.

Scenarios, both rungs:
- **Index rescale (Nested Quinn M-2):** 4 rescales, index / shares / scale /
  `scale-start` exact; every position loses under 1 unit per rescale. Members
  catching up after 1, 2 and 3 rescales get exact per-segment proceeds; a
  member 4 behind is carried to 0 shares, still paid its first four segments
  (118,626,255 uSTX on buy) and exits with nothing to move. ARION F-8 (a rest
  worth 0 becomes a full exit).
- **Last-member close:** `members` reaches 0 with 1 unowned share left; the
  epoch closes and the next depositor takes it as orphan.
- **Reserve dust (Regal Anvil #1):** a single fill takes the index to 650,000
  (tail roll, 3 members); each claims its rounded share, the last claim moves
  exactly 1 unit from `reserved-*` to `held-*`. Dust tail roll too.
- **Escrow and pushes (Void Kael #2, ARION F-9):** a 1-unit grief pending does
  not block exits the rung's other funds cover (no oracle); an exit needing
  the pending gets u7012 without an update, u1007 on a paused market, settles
  with an update; after 24 h it takes the 24 h cancel; during the cooldown
  pushes and deposits hold (u7015) and members exit with no oracle; the owner
  push pause (u7014 on push, u7001 for others), deposits held, withdraws work.
- The full-coverage pass: every `initialize` guard, deposit / withdraw /
  claim / push refusals, `refresh-guard`, the miner-band paths, both arms of
  `settle-escrow`, `pull-to-held-*`, `roll-tail` and `settle-proceeds`.

## 3. Coverage (per rung, by source hash)

| | buy | sell |
|---|---|---|
| expressions | 596 / 854 (69.8%) | 595 / 855 (69.6%) |
| lines | 338 / 475 (71.2%) | 338 / 477 (70.9%) |
| branch nodes | 55: 52 full, 3 partial, 0 never reached | 55: 52 full, 3 partial, 0 never reached |
| failure arms hit | 26 / 50 | 26 / 50 |

Every public and private function runs on both rungs.

## 4. Remaining gaps (identical on both rungs)

**Reachable but untested: none.**

- **Provably unreachable:**
  - `settle-escrow` with no pending (buy L916 / L932, sell L872 / L888):
    `escrow-for` calls it only when the exit exceeds held + live + parked;
    after `sync` an exit never exceeds everything the rung owns, so a pending
    exists.
  - `count-reserve-claim` with no reserve row (buy L787, sell L746): an epoch
    closed by its last member has no positions left, and a tail-rolled
    epoch's row is removed only after all its members have claimed.
  - `count-reserve-claim` with a payout above the reserve (buy L790, sell
    L749): the reserve equals what the index owes, which never exceeds what
    the rung holds, and the rounded payouts sum to at most that.
  - 24 failure arms: `sync` / `settle-proceeds` failing inside deposit, push,
    withdraw or claim (only on an uninitialized rung, already guarded, or a
    failed transfer of funds the rung holds); transfers of held funds
    (roll-tail's cancel, payouts, member transfers); `sync-seat` after a seated
    register; `pull-to-held-*` `ERR_INSUFFICIENT` or a market withdraw error (a
    rung never holds a live and a parked position at once).
- **Needs data the fork cannot produce:** a push that reaches the market
  after the 24 h cooldown. After any fork time advance, synthetic tenures carry
  a miner spend of 0 (a real tenure read fails with a BlockingError), so
  `miner-mid` reads 0 and the miner-band guard stops the push (u7008). The sim
  shows the push passing the cooldown and stopping at that guard. The same
  effect covers the "no miner data" paths.
- **Instrumentation:** top-level constants and maps and `let` binding lines
  have no trace; 25 deploy / transfer steps have no trace, and no call to a
  rung lacks one.

Fork context: the buy rung's miner floor was 12.07e12 against a mid of
25.9e12, the sell cap 48.3e12, both inside the band.

## 5. System scenario: 10 rungs per side through the dispatch

`simulations/verify-v1-core-spread-ladder-dispatch.js`: **390 / 390 checks, 0
unexpected failures**:
[2c329967](https://stxer.xyz/simulations/mainnet/2c329967c76360178a84fb704aeffb34).
All six contracts (both rungs, market, core, ladder, `jing-ladder-dispatch`)
deployed unmodified; hashes identical at start and end.

- **Rungs:** 10 buy (`jing-buy-stx-spread-0` … `-90`) and 10 sell rungs,
  spreads 0 to 90 bps, all seated at `initialize`. The ladder's default of 10
  band seats per side holds them exactly; an 11th rung per side is refused
  u6011. The market's seated lists match the rungs.
- **Deposits:** A deposits across all 10 buy rungs in one `deposit-buy` batch
  (3,000 to 30,000 sats, 1x to 10x); B across all 10 sell rungs (10 to 100 STX);
  C and D add second members on 4 rungs each. Buy legs rest directly; sell
  legs go pending and a keeper settles them. Receipts, shares, prints and
  every order price (mid +/- spread, inside the miner band) exact.
- **Settlement:** an STX taker clears buy-0 in the mid batch, then walks
  buy-10 / 20 / 30 in full at their own asks and 60% of buy-40; buy-50 to
  buy-90 untouched. The mirror sBTC taker does the same on the sell side (walk
  dust refunded to the rungs). Taker receipts, settlement and match prints,
  treasury fees (99 sats, 267,837 uSTX) and each member's split
  (floor(shares x index)) match the model exactly. Sold-out rungs roll to
  epoch 1 at their next sync; the 40 bps rungs stay open at index ~0.4.
- **Exits:** a full `withdraw-buy` across all 10 rungs (sold-out rungs pay
  proceeds through the old-epoch path; buy-40 pays proceeds plus a partial
  market withdraw; unfilled rungs return principal and, with A the only
  member, close the epoch); a partial `withdraw-sell` on 4 rungs; a mixed
  exit of filled and unfilled rungs; then everyone drains. At the end every
  rung has 0 members, 0 shares, nothing on the market and no reserve owed
  (4 sats and 7 uSTX of ownerless rounding remain across all rungs).
- **Invariants after every fund-moving step:** market custody = book, cycle
  totals = live orders; sum of members' positions <= pooled <= held; proceeds
  claims <= proceeds balance; old-epoch returns <= reserve; the dispatch holds
  0; per-asset conservation (deposited - withdrawn = still held + fees).
- **Dispatch refusals, each moving nothing:** wrong side u7104 (deposit) /
  u7108 (exit); duplicate legs u7105; zero leg u7103; total mismatch u7102; no
  legs u7101; 11 legs rejected by the argument type `(list 10)`; a call from
  an intermediary contract `ERR_DIRECT_CALL` u7106.
- **Cost:** no limit hit. A 10-leg deposit uses about 20% of a block's
  read_count and 15% of its read_length (about 4 to 5 such deposits per
  block); a 10-leg withdraw about 8% / 10%; a swap about 7% of read_count. 10
  legs is the hard cap (list type).

Coverage of this run alone: buy rung 443 / 854 expressions, sell rung 476 /
855, `jing-ladder-dispatch` 166 / 267 expressions and 15 / 15 branch nodes
(only the unreachable `ERR_TOTAL` overflow fallbacks uncovered).

Frontend note, by design: a 0 bps sell rung cannot rest while a 0 bps buy
rung is live (its bid at the mid crosses the ask at the mid); the market
refunds it to the rung as "crossing" and it waits there until the buy side's
mid ask is gone, then a push places it.

