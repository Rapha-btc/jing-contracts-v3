# Core-spread v1 rungs: stxer fork tests and coverage

Scope: the two rungs in deploy scope, `contracts/jing-buy-stx-core-spread-v1.clar`
(sBTC resting on the market's x side, earns STX) and
`contracts/jing-sell-stx-core-spread-v1.clar` (STX resting on the y side, earns
sBTC), running with `markets-sbtc-stx-jing-v6-3`, `jing-core-v6` and
`jing-ladder-v1`. The other four `-v1` rungs are out of deploy scope.

## 2026-09-29: proceeds precision and exact epoch payouts

Known lead: the [small-proceeds report from the earlier rung bounty](https://github.com/itzroberl/startup-credits/blob/aibtc-jing-v6-3-audit-2026-09-26/REPORT-small-proceeds.md).
The sell core-spread v1 regression reproduces the arithmetic after a real
rescale and top-up: `floor(1001 * 1e12 / total-shares) == 0`. This is credited
as an existing report, not a new bounty discovery. Only the two core-spread
v1 templates are changed; the other rung variants are outside this patch.

### Rescale solvency: reproduced and repaired

The original safety regression was rerun **before** changing either contract:
it failed with claims of 210,100,010 micro-STX against custody of 210,100,001.
Two members had deposited 1,000,001 sats each; a real fill left 1,001 sats and
rescaled total shares from 2,000,002 to 2,000. Each member's `carried` shares
were 1,000, but the former `earned-step` still paid on 1,000.001 shares. After
a 10,000,000 micro-STX receipt, that mismatch overstated combined claims by 9.
The second claim failed for insufficient funds. This was a real accounting
mismatch, not a carry-ledger test expectation.

The minimal repair is option **(b)**: `earned-step` calls `carried` for each
scale segment and multiplies those **whole effective shares** by the segment's
index delta. It removes the quotient/remainder path that preserved fractional
old shares. `sync`, share minting/burning and input valuation keep their existing
rounding. The original custody/solvency assertions are unchanged, and the test
now also requires both members to claim, then exit, with exactly zero of both
assets left. The sell mirror tests the same mismatch and reverses exit order.

#### Why the bound is preserved

Let `T` be total shares and `s_i` each current member's whole effective shares.
Initially `sum(s_i) = T = 0`. Every operation preserves `sum(s_i) <= T`:

- Rescale: `sum(floor(s_i / 1000)) <= floor(sum(s_i) / 1000) <= floor(T / 1000)`.
  Repeated integer division equals division by the corresponding power; lazy
  positions therefore match eagerly carried positions. Positions beyond the
  supported scale window count as zero, which can only reduce the sum.
- Deposit: the exact same minted integer is added to the member and total.
- Withdraw: the same whole carried/burned shares are subtracted from both.
- Claim: lazy carrying changes storage representation, not effective ownership.

Within a fixed denominator segment, the sum of effective shares times the
index increment cannot exceed the scaled receipts plus carried remainder.
Member payout flooring cannot increase this sum. Rescale/share changes reset
the carry into the same epoch's unpaid rounding balance, so it is never
reindexed under a new denominator. Prior segment snapshots preserve earnings
already earned with their prior whole shares. No payout is clamped to hide a
shortfall: the original indexed calculation must remain backed.

For input, member floors sum to at most the pooled input. Mints floor and
partial burns ceil, so deposits add at least the input promised and withdrawals
remove at least the shares paid for. Sync adjusts the pool to real remaining
custody; rescale floors total shares and cannot increase pooled input.
At final exit, the member receives all actual input backing, excluding old
reserves. At tail roll, exact input/proceeds balances are isolated for that
epoch and its last claimer receives their full remainders. Thus for every
epoch, paid proceeds never exceed received proceeds, and returned input plus
input consumed by fills never exceeds deposited input. Final payout exhausts
the remaining backing instead of leaving ownerless residue.

The regression is [`rescale-solvency.test.ts`](../tests/unit/integration-v6-3/rescale-solvency.test.ts).
The before-fix failure log is `/tmp/jing-rescale-before.log`.
The focused regression/conservation/precision run passed without weakening
its custody or solvency assertions. Final full-suite status is recorded below.

### Accounting and ownership

`PROCEEDS_SCALE = 1e18` is separate from the unchanged `SCALE = 1e12` used for
input shares. Deposits above `1e18` total shares fail atomically with `u7016`.
Every positive receipt therefore advances the proceeds index. `earned-step`
first floors to whole carried shares, then multiplies by the index delta.
Tests compare all supported scale segments with independent BigInt arithmetic
and check that their effective shares equal `carried`.

For positive total shares, sync uses:

```text
scaled = gained * PROCEEDS_SCALE + proceeds-carry
proceeds-index += floor(scaled / total-shares)
proceeds-carry = scaled mod total-shares
accounted = full current proceeds balance
current-proceeds += gained
```

The watermark must advance by the whole received amount. Advancing it only
by `floor(index-increment * shares / PROCEEDS_SCALE)` double-credits the
fraction already represented in the index; the rejected formula produced
an underflow on the next claim in a Clarinet reproduction.

`current-proceeds` is the exact unpaid base-unit balance of the open epoch.
It includes the backing of indexed claims, scaled carry, and per-member
rounding; these are not extra balances to add to it. Payouts reduce it by
exactly what is transferred. Carry stays below total shares, hence below one
base unit. Before deposit/withdraw changes shares, and at rescale, carry is
reset: its backing stays in the epoch's exact unpaid balance and is assigned
to its final member. It is not reindexed under a new denominator. This is an
explicit **last-member rounding policy**, not fractional entitlements stored
for each historical member. Repeated member claims can accumulate rounding
for that final recipient.

The sole current member can claim all remaining epoch proceeds; doing so
also clears carry. Their full withdrawal takes all remaining input backing,
including input/share rounding. A tail roll reserves all free input plus the
exact unpaid proceeds in `epoch-reserve {left, reserve, proceeds}`. Other old
members receive indexed payouts; the last old claimer receives both complete
remainders. New epochs cannot consume those balances. `get-position` reports
the final-member entitlement, so it can increase when another member leaves.
Unsolicited transfers into an empty rung retain the existing next-depositor
policy; completed funded epochs leave no residue for a later depositor.

After sync processes receipts for a funded epoch, the proceeds invariant is:

```text
proceeds balance = accounted = current-proceeds + sum(old epoch proceeds)
```

Between a receipt and sync, `balance - accounted` is the unprocessed receipt.
Within each epoch, unpaid proceeds consist of currently claimable amounts
plus rounding assigned to its final member. Reserved input is the sum of
old epoch input reserves. After all positions exit/claim, both token balances
and all market custody/reserves must be exactly zero.

These are undeployed templates, not an in-place state migration. Raw proceeds
indices and snapshots use 18 decimals; consumers should use `get-position`
for base-unit amounts. Pending escrow timeout, oracle/pause guards, market
pricing, and dispatch APIs are unchanged.

### Defensive reserve clamps

Both mirrors keep saturated `reserve - back` and `proceeds - paid` updates
in `count-reserve-claim`: when the payment exceeds that field, store zero.
This follow-up changes only those two expressions in each production template.
The normal path remains an exact subtraction, and the last claimer receives
the remaining epoch balances before the row is deleted.

These clamps prevent underflow in the two map updates; they are not a general
guarantee that an overpay can succeed. Transfers and the global reserved or
accounted balance debits happen earlier and can still fail. No such overpay
is permitted by the model: the per-epoch payout/receipt invariants remain
strict, and both Stxer models explicitly reject an excessive payment before
applying the clamps.

The positive clamp arms are intentionally not forced. The coverage gate keeps
its 99% thresholds and reports raw metrics as well as narrowly adjusted metrics:
only the two invariant-unreachable arms and static literal/callee instrumentation
are excepted. See [the exact exception policy](../tests/unit/integration-v6-3/README.md#coverage-exceptions).
Share-cap rejection is tested for both assets, including atomic rollback.
Isolated private-helper tests exercise both positive `close-epoch` transfers,
watermark/carry resets, snapshots and no duplicate payout; these are unit
component tests, not claims of public-path reachability.

### Verification

- `proceeds-precision.test.ts`: actual 1,002-sat swap paying 1,001 after
  rescale/top-up, both exit orders, late membership, share ceiling and
  atomic refusal, overflow-safe payout arithmetic.
- `proceeds-conservation.test.ts`: repeated receipts and real fills,
  idempotent sync, joins/partial exits while carry exists, repeated claims,
  exact final exits, and two old tail-rolled epochs alongside a funded new
  epoch. Exact reserve/backing identities are checked after each action.
- Existing epoch, control, rung and dispatch tests now assert final balances
  of zero and the changed last-member entitlement.
- `clarinet check`: root manifest (4 contracts) and integration manifest
  (34 contracts) pass. Both rung files are formatted with `clarinet format`.
- `rescale-solvency.test.ts`: original 9-micro-STX failure, the sell mirror,
  successful claims and exact final input/proceeds exhaustion.
- `rescale-fuzz.test.ts`: three deterministic seeds per side, randomized
  deposits, claims, partial/full withdrawals and real fills, four forced
  randomized rescales per campaign, required coverage of each random action
  type, overlapping tail-rolled epochs, and
  final drain in varied exit orders. A per-epoch ledger reconciles actual
  transfers and market custody after every action, checks outstanding claims
  against unpaid backing, and checks effective shares against total shares.
  The six campaigns completed 396 invariant checkpoints, 70 random deposits,
  52 random withdrawals, 56 random claims, 62 random fills, 24 rescales and
  12 tail rolls. Every seed exercised every required random action type.
- Full Clarinet integration suite: **93 / 93 tests passed**, 9 files, no skips.
  Log: `/tmp/jing-clamp-full.log`. This includes all six fuzz campaigns.
- **The unchanged 99% line/branch coverage gate passes.** Both rungs reach
  36/36 functions and 100% executable/reachable line/branch coverage, including
  declared helper units. Raw instrumentation remains visible, with two
  defensive clamp arms and static call-name instrumentation explicitly excepted;
  see the [generated coverage report](../tests/unit/integration-v6-3/COVERAGE.md).
  The earlier 88-test revision passed its tests but failed the coverage gate;
  the new units and documented exceptions supersede that failure, without
  lowering any numeric threshold or injecting impossible claims.
- Full market Clarinet suite (`npm test`): **287 / 287 tests passed**
  with its separate coverage gate. Log: `/tmp/jing-clamp-market-full.log`.

Forks deploy working-tree contract bytes and execute public transactions
with real signed Lazer prices; no injected storage or contract substitutions.
Models follow the formulas above and compare exact payouts, reserves,
positions, custody, wallet movements and ladder events.

| Harness | Checks | Simulation |
|---|---:|---|
| `verify-v1-core-spread-rungs.js` | 998 / 998 | [rungs](https://stxer.xyz/simulations/mainnet/feefde943db62d21f3c3dbf249708e0c) |
| `verify-v1-core-spread-ladder-dispatch.js` | 391 / 391 | [twenty rungs and dispatch](https://stxer.xyz/simulations/mainnet/4135a4ef4d94ca74c8a5cdbae5d93f76) |
| `verify-v1-small-proceeds.js` | 77 / 77 | [small fill after rescale/top-up](https://stxer.xyz/simulations/mainnet/6833db442f85d2f3403f3e31001dcb63) |

The dispatch run asserts **0 sats and 0 micro-STX ownerless** across all 20
rungs; the earlier precision-only version left 4 sats and 7 micro-STX.

Current source SHA-256:

- `jing-buy-stx-core-spread-v1`: `cd0040542bdbdb98c41e23df016f76441d38b3468abf5e69d569474c8c87c70c`
- `jing-sell-stx-core-spread-v1`: `6e939827da2a319cc70bd2e00560adb47260cc5a25060eec95c4cead10fdb69e`
- `markets-sbtc-stx-jing-v6-3`: `5c08412fc5990a8bf0db3a0cbbec3fa4c859d4185d0caf1cd16ae0c78f851bfb`
- `jing-core-v6`: `88a689affb23f13030953e891336af42a3f5cb275f13b3c54c79d8cd4de50697`

The earlier results below are historical and refer to their listed revisions.

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
