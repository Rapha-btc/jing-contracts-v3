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
