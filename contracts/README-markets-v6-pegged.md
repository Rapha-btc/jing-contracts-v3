# markets-sbtc-stx-jing-v6 + jing-core-v5: pegged orders

Source only, not deployed. `clarinet check` clean on both files. Every
harness below ran green on a stxer mainnet fork on 2026-09-11 (section
"Verification" at the end): the v4/v5 market set ported to the v6 arity, the
four rungs keyless, and three Lazer harnesses for the pegged path itself.

## Why a v6

A market maker on v5 who wants to sit a fixed distance from mid has to
watch Pyth and call `set-token-x/y-limit` on every move: one transaction
per reprice, one keeper per maker, and the quote is stale between calls.

v6 stores the order as a rule instead of a price. The rule is evaluated
against the Lazer mid at every settlement, by the same
`settle-with-refresh` call that already exists. No keeper, no reprice
transactions, capital never leaves the contract.

## The two order types

Both live in the same map. `get-token-y-order` / `get-token-x-order`
return the tuple:

```
{ limit: uint, spread-bps: (optional uint) }
```

One field says both whether the order is pegged and how far: `none` is
fixed, `(some u30)` is pegged 30 bps from mid. Cheaper than a bool plus a
uint (a fixed order serialises the spread as 1 byte), and one field fewer
to read.

**Fixed** (`spread-bps: none`) is the v5 order, unchanged. `limit` is the
price. In range it clears at mid in the batch; out of range it rests at
`limit` and fills when a taker walks the book.

**Pegged** (`spread-bps: (some s)`) is new. The effective price is
computed from mid at the moment it is needed:

```
bid (token-y side):  mid * (10000 - spread-bps) / 10000, active while <= limit (the ceiling)
ask (token-x side):  mid * (10000 + spread-bps) / 10000, active while >= limit (the floor)
```

`s` may be zero (sit at mid) up to 9999. `limit` is required and must be
above zero; it is the ceiling for bids and the floor for asks.

One door per action, the same door for both types. Every function that
took a `limit-price` in v5 takes `spread-bps (optional uint)` right after
it:

```
deposit-token-y        (amount limit-price spread-bps update t name)
deposit-token-x        (amount limit-price spread-bps update t name)
set-token-y-limit      (limit-price spread-bps update)
set-token-x-limit      (limit-price spread-bps update)
reprice-or-swap-token-y (limit-price spread-bps update tx-trait tx-name ty-trait ty-name)
reprice-or-swap-token-x (limit-price spread-bps update tx-trait tx-name ty-trait ty-name)
```

`swap` is unchanged: a taker is always a fixed limit. The router, ladder,
buy-stx, sell-stx and vault all bind v5 and need the extra argument when
they move to v6.

Fixed bid at P: `(deposit-token-y amt P none update t name)`.
Peg at mid minus 30 bps with ceiling C: `(deposit-token-y amt C (some u30) update t name)`.

The latest write wins: whatever `spread-bps` the last call carried is the
order's type from then on.

## The band is a guard, not a clamp

Inside the band the pegged price is the order's price. Outside the band
the order is inactive for that settlement and comes back by itself when
mid re-enters. It is never clamped to the ceiling or floor. The ceiling
exists so a wrong or lagging Pyth print cannot fill you at a price you did
not choose; sitting out is the safest answer to a mid you do not trust.

Inactive means, in this settlement:

- `execute-settlement` rolls the deposit to the next cycle through the
  same limit-violating filter a fixed order goes through, and logs
  `limit-roll-x/y` with the sentinel as `limit`.
- the taker walk (`sorted-asks` / `sorted-bids`) does not list it.
- `get-taker-capacity` does not count it, in-range or walk.
- `would-take-as-x/y` does not see it as a live counterparty.
- `park-one-token-x/y` treats it as the maker furthest from mid, so it is
  the first to be parked when a full queue admits an in-range maker. Two
  inactive pegs are equally far (both at the sentinel); the fold keeps the
  first at the largest gap, so the older one in the depositor list is parked.

Funds stay in the contract the whole time. Nothing is cancelled.

## How inactive is represented

`token-y-limit-at (who mid)` and `token-x-limit-at (who mid)` return the
effective price of any order at a given mid. Fixed orders return `limit`.
Pegged orders return the pegged price inside the band and a sentinel
outside it:

- bids: `u0`
- asks: `MAX_UINT` (`u340282366920938463463374607431768211455`)

Every reader in the contract already treated a bid at zero and an ask at
an impossible price as "never fills": the walk skips it, the sort skips
it, capacity skips it, the settle filter rolls it. Returning the sentinel
drops an out-of-band peg out of every path with no new branches.

Since 2026-09-13 both sentinels are also skipped by an explicit equality
test, not only by the price comparisons. The bid side always had
`(is-eq l u0)` in `collect-bid-step`, `walk-y-book-step` and
`cap-bid-fold`; the ask side relied on the taker's limit alone, and a taker
limit of exactly `MAX_UINT` let the ask sentinel through the sort and the
walk (harmless: the fill math rounds to zero and returns before any state
write) and made `cap-ask-fold` overflow on `amt * MAX_UINT`, so
`get-taker-capacity`, the router's sizing read, aborted for that caller.
`collect-ask-step`, `walk-x-book-step` and `cap-ask-fold` now carry
`(is-eq l MAX_UINT)`. Found by Light Brio on bounty mtxs6nxg7a6d97081b11;
peg-edges G5 covers it. A fixed ask whose maker sets `MAX_UINT` as its
limit is treated the same as the sentinel: it never fills, which is what
that limit means.

`pegged-bid (mid spread-bps cap)` and `pegged-ask (mid spread-bps floor)`
are the pure helpers, exposed read-only so a front end can show the live
price of a peg from the same mid it already fetches.

## A zero spread is not a fixed order

A zero-spread peg with ceiling C and a fixed bid at C fill at mid in the
same cycles. They differ when mid is above C: the fixed bid rests at C and
can be walked at C, the peg sits out. Both are legitimate; the peg is the
one to use when C is a sanity bound rather than a price you want.

Because a zero-spread peg is in range on arrival, it goes through the same
gate as every other deposit: `ERR_MUST_USE_SWAP` if in-range liquidity
exists on the other side, and the park step on a full queue. The gate
evaluates the order at the fresh mid (`order-y-price` / `order-x-price`),
so a fixed and a pegged order are judged by the same rule. A resting order
cannot sit at mid without paying the taker rebate, pegged or not. The
price is fetched only when v5 fetched it (other side non-empty, or a new
maker on a full queue).

## Fills

A pegged order fills exactly like a fixed order at its effective price:

- spread zero and in band: in the batch, at mid, pro-rata.
- spread above zero: never in the batch (it is always outside mid by the
  spread); it fills when a taker walks the book, at the pegged price, and
  `log-match` records that price with the mid.

A maker quoting both sides deposits once per side with the same spread:
one pegged bid and one pegged ask, each rung of a ladder its own
principal (the `jing-ladder` pooled makers pass `none` and are otherwise
unchanged).

## Errors

- `u1026 ERR_BAD_SPREAD`: spread-bps is 10000 or more.
- `u1011 ERR_LIMIT_REQUIRED`: ceiling or floor is zero.
- `u1016 ERR_MUST_USE_SWAP`, `u1005
  ERR_NOTHING_TO_WITHDRAW`: same meaning as on the fixed path.

## jing-core-v5

`contracts/jing-core-v5.clar` is core-v4 plus:

- `log-peg-x (depositor spread-bps floor cycle token-x token-y)`, event
  `peg-x`
- `log-peg-y (depositor spread-bps cap cycle token-x token-y)`, event
  `peg-y`

- `log-park-x/y` and `log-readmit-x/y` `(who amount cycle price token-x
  token-y)`, events `park-x/y` and `readmit-x/y`: the v5 market printed
  these itself; on v6 every market event goes through the registry, and
  the market has no `print` left

and minus `log-close-deposits` and `log-cancel-cycle`, which no market
since v5 calls. Everything else is byte-for-byte v4. None of the new logs
carries the pause gate (only deposits, matches, settlements and the
reserve logs do), so pausing the registry never blocks a cancel, withdraw,
park or readmit; and a registered market cannot be unregistered. The v6 market binds
`.jing-core-v5` at every call site, including `initialize` and
`register`.

Every write logs what v5 logged (`deposit-x/y`, `set-limit-x/y`) with the
`limit` field carrying the ceiling or floor, then `peg-x/y` when
`spread-bps` is `some`. A write with `none` logs no peg event, so an
indexer that sees `set-limit-y` without a following `peg-y` in the same
transaction knows the order is fixed again. An indexer that shows a
maker's price must read `peg-x/y` and compute the effective price from
its own mid, or the row shows the ceiling.

Deposit events, changed 2026-09-13 with the size rule parking instead of
refunding: `log-deposit-x/y` take `(parked (optional principal))` and
`(parked-amount uint)` where v4 had `bumped` / `bumped-amount`, the print
carries `parked`, `parked-amount` and `parked-equity-x/y`, and the core no
longer debits that maker's equity: its money stays in the market, parked,
and the market logs `park-x/y` for it in the same transaction. An indexer
that turned the old `bumped` into a refund row must turn `parked` into a
parked row (fakdao `jing-core-events.ts` `bumpedRow` at the time of
writing). Positional call sites are unchanged.

## Indexer notes

- Every settlement emits a `limit-roll-x/y` for each peg that is outside
  its band or outside mid by its spread, which for a spread above zero is
  every settlement. Correct, and the way the indexer learns the deposit's
  new cycle, but noisy: filter on `pegged` before alerting a user.
- `limit` in that event is the sentinel (`u0` / `MAX_UINT`) when the peg
  is out of band, the pegged price when it is merely outside mid.

## Deploy order

1. `jing-core-v5`, then `set-verified-contract` for the v6 market hash.
2. `markets-sbtc-stx-jing-v6`, `initialize` with the same feed ids as v5
   (BTC/USD `u1`, STX/USD `u45`).
3. `jing-buy-stx` / `jing-sell-stx` bind v6 (`none` in the spread slot);
   `jing-ladder` accepts the peg sides `buy-peg` / `sell-peg`. Still on v5
   and the v5 arities: `swap-router-sbtc-stx-jing-v4`, `vault-sbtc-stx-v5`.

Deploy under the repo names.

## Pooled peg rungs

`jing-buy-stx-market-spread.clar` / `jing-sell-stx-market-spread.clar`: the
pooled rungs with a spread instead of a price. Same pool and accounting as
the fixed rungs; the order they rest is `(some spread-bps)` with the guard
from the name in the market unit. The name carries both numbers, exactly
as the fixed rung's name carries its price:

```
jing-buy-stx-spread-20-floor-331-50    initialize(u20, u33150)   asks mid + 20 bps, sits out under 331.50
jing-sell-stx-spread-20-cap-331-50     initialize(u20, u33150)   bids mid - 20 bps, sits out over 331.50
```

`initialize` derives the guard as `1e18 / cents` and registers in the ladder
under its own side (`buy-peg` / `sell-peg`: the code hash differs from the
fixed rung, so it cannot share the fixed canonical) with the key
`cents * 10000 + bps`. One uint, unique per (spread, guard) pair since bps
is under 10000: `331500020` reads as 33150 | 0020. The ladder's
market-price slot logs the guard in the market unit, like the fixed rung
logs its price.

## Deposit while parked

v5 refused a deposit from a parked maker (`u1021`) and offered one way back,
`readmit`, which needs a free slot. Bumping the smallest maker was only for
newcomers. So a parked maker on a book full of small makers was stuck, even
when its combined size would have bumped its way in as a newcomer, and the
pooled rungs held every new member deposit until someone left.

v6 drops the refusal: `deposit-token-x/y` from a parked maker folds the
parked amount into the position (`carry` in the core). A free slot takes it
back; otherwise the smallest live maker is bumped when parked + new is
bigger; otherwise `u1010`. The order rule is whatever the deposit carries,
as for any deposit. The gate runs on the combined order (crossing check,
park of a farther maker when the newcomer is in range). One exception since
2026-09-13: a position whose peg is switched off right now (sentinel) gets
no slot on a full book, parked or not, whatever its size, `u1010`; a rung
holds the new money and pushes once the peg is back in band or a slot
frees. A dead order must not bump a live one (see "Priority on a full
book"). peg-park K6/K7 and peg-park-y Y2/Y3 cover the parked case. Core-v5 logs
`deposit-x/y` with the full position as `amount` and the new money as
`delta`, and core-v5 logs `readmit-x/y` with the parked amount so an
indexer clears the parked state. `readmit-token-x/y` stays for keepers.
`ERR_PARKED u1021` is gone.

The minimum deposit is read on the whole position, `existing + parked +
new`, so a top-up under the minimum onto a live or parked position is
accepted (`u1001` stays for a fresh maker under it, and for a taker: swap
has no existing or parked amount). Withdraw already read the minimum on
what stays, so the three now agree. The rungs mirror it: they push when
`to-push + market-size` reaches the market minimum and hold otherwise.

The rungs call the market's deposit directly (`push-to-market`, a private
attempt read with `is-ok`) and hold the funds on any refusal instead of
aborting the member's transaction. Clarity note: a `try!` inside
`as-contract?` returns from the enclosing function, so the attempt has to be
its own function for the caller to observe a refusal.

## Priority on a full book

A new maker arriving when the side holds MAX_DEPOSITORS orders:

```
new maker, side full
  |- peg switched off right now (sentinel)      -> refused, u1010
  |- in range, OR out of range and better than the N-th best
  |  out-of-range price (N = distance-slots, default 10)
  |     |- a switched-off resident exists          -> park it
  |     |- else the N-th best is demoted:
  |     |     bigger than the smallest of the size region
  |     |     (every other out-of-range resident)    -> park that smallest
  |     |     else                                   -> park the N-th best
  |     |- nobody out of range at all                -> size rule
  |- else                                            -> size rule

size rule (the core): bigger than the smallest resident PARKS it and takes
its slot, else u1010.
```

Parked = funds and price kept, readmittable when a slot frees. Nothing on
a full book is refunded any more (v5 refunded the size-bumped maker; since
2026-09-13 it is parked like everyone else, so a bumped whale keeps its
price and comes back when a slot frees). In-range residents are in neither
region and are never displaced by a newcomer's priority, only by size.

History. v5 had: in range parks the farthest resident, everything else
size. 2026-09-13 (bounty mtxs6nxg7a6d97081b11) added: switched off is
refused (a dead peg used to bump a live maker); then the price region for
out-of-range newcomers; then the same region for in-range newcomers,
because "park the farthest" let a stream of minimum-size in-range orders
drain the whales one by one, exactly the ladder the price region forbids
on the other side.

Why the N best out-of-range prices compete on price and every other slot on
size: "closer wins" on its own can be laddered, a minimum-size order a hair
closer parks a whale and a spammer repeats that up the book. Size on its
own lets a whale far from mid keep a small order near mid out forever.
Ranking only the N best out-of-range prices as one region, and demoting
the N-th into the size fight, bounds both: the order that leaves the book
is always the smallest of the N-th best and the size region, parked, never
refunded, and a whale outside the N best can only be bumped on size. A
whale that chooses to sit inside the N best accepts price competition
there. Ties: a newcomer at the same price as the N-th best does not beat
it (strict), and among equal prices the latest arrival ranks last, so time
priority holds within a price. Switched-off residents leave before anyone
alive. The operator dials N with `set-distance-slots`; 0 = size only
(then only a switched-off resident can be parked). Rungs remain the answer
for pooled depth: one slot, any number of makers. Enter-as-parked for a
switched-off newcomer is a v7 item. Covered by bounty-fixes section D
(D5b: N-th best, not the farthest; D5c/D5d: the demotion; D5e: in-range
residents count for neither region), peg-park K3/K8, peg-park-y Y1/Y3/Y4.

## Protected seats: the band rungs

A number of slots per side, the ladder's `max-band-per-side` (u10 at
deploy, owner-settable, never under the seats a side holds, mirrored into the
market by `sync-seat` as `protected-seats`, clamped to MAX_DEPOSITORS), is
reserved for miner-band rungs,
`jing-buy-stx-core-spread` on x and `jing-sell-stx-core-spread` on y: pooled
pegs at mid +/- spread with no guard in their name. Their floor (buy) or cap
(sell) is read on every push from the deployed RFQ native oracle
(`rfq-sbtc-stx-jing-v2-3 get-native-price`, what Stacks miners are paying
for STX, in the market's own unit; within 4% of the Pyth mid on
2026-09-13), halved or doubled: a fat-finger Pyth print cannot fill them,
an honest one always passes. Anyone can refresh the stored guard
(`refresh-guard`). Ten spreads per side, 0 to 90 bps, is the intended set.

A protected maker is never displaced: skipped by the price region, by the
size region, by dead-first and by the core's size rule. The other
MAX_DEPOSITORS minus that number slots run the rules above unchanged, and
they are full for everyone else even while seats stand empty
(`side-full-x/y`), so a rung always finds room when it pushes.

No list in the market. The ladder owns the seats: its owner blesses one
code hash per band side (`buy-band` / `sel-band`); `register` from a
byte-identical rung takes the (side, spread) key, at most
`max-band-per-side` spreads per side (u6011 past that; the same number the
market reserves); and a register at a spread that already has a rung
REPLACES it, the old rung loses its band status, keeps its funds, its
resting order and its ladder `registered` row (every member action prints
through the ladder's `log-*`, gated on that row: dropping it locked the old
rung's members out, bounty finding, fixed; `is-current-rung` tells the two
apart and every rung event carries `current`). That is the upgrade: bless
the new code, deploy it at the same spreads, members of the old rungs
withdraw and join, withdraw needs no oracle. The owner can also retire a
spread (`retire-band`): its rung loses the seat, keeps its funds, its
resting order and its row as an ordinary maker, the spread is free and the
count goes down. The rungs themselves treat every ladder log as best
effort (`is-ok`, never `try!`): a member's withdraw or claim can never hang
on a print. A band rung can also start WITHOUT a seat: `initialize(bps,
false)` registers it through `register-unseated` (same hash gate, owner
only, band sides only, any number per spread), so it prints and takes
deposits as an ordinary parkable maker, no key, no count; the owner seats
it later with `seat-band who` (its spread taken -> replace, free -> one
more seat under the max), then anyone syncs it on the market. `seat-band`
also re-seats a replaced or retired rung, so retire and replace are
reversible without a redeploy. The FE badge is the ladder's
`is-current-rung` / the market's `is-protected-x/y`. The market keeps a LOCAL COPY: one short list of
seat holders per side (`seated-x/y`, at most the seat count) and the seat
count, so a deposit never calls the ladder and every fold tests membership
in a list it reads once, no storage per resident. `sync-seat who` (anyone;
a band rung calls it on itself from its initialize) only ever ADDS: the
ladder must seat `who` (u1028 otherwise), and a sync rebuilds and prunes
the list of the side the ladder seats `who` on (only that side), so a
replaced rung drops out the moment its successor syncs and a retired one
the next time anyone syncs a seated rung on that side, or on
`prune-seats` (anyone, both sides, drops nothing current, adds nothing):
the only way out when a retire leaves no current rung on that side, else
the retired rung stayed un-parkable and hidden from `side-full` until the
list hit 50 and the next deposit panicked in `as-max-len?` (bounty
finding, Celestial Mast). Every sync also refreshes the seat count from
the ladder (clamped to MAX_DEPOSITORS); `sync-seat-count` refreshes the
count alone; the ladder's register, seat and retire events say when to
call which.
Only the ladder owner may initialize a band rung (its `initialize` checks
tx-sender against the ladder's `get-owner`), since registering at a taken
spread replaces the holder and must not be open to anyone who can redeploy
the blessed code. Deploy order: the ladder before the market, since the
market references it.

Why not the market's farthest-parks rule for these: a rung at mid + 20 bps
is out of range by construction, and under the price region a closer small
order would demote it, then a bigger one bump it; pooled depth that any
retail deposit can knock off the book is not depth. Why not an operator
list: a permanent seat should not be a favour.

Sim note: harnesses that fill all fifty slots to test parking set the
ladder's `max-band-per-side` to u0 after deploying it and sync each market
instance (sim-only, like the MAX_DEPOSITORS u3 instances); the
reservation itself is proven in `verify-v6-rungs-miner-band-lazer.js`
section S: forty fillers take the open region, the forty-first is refused
with forty-one resting, the rung tops up past that, an in-range newcomer
parks a filler and never the rung, a second rung takes seat two, and a
fresh deploy of the same code at spread 30 by another deployer replaces
the first spread-30 rung: the seat moves, the count does not.

## A parked maker cannot swap on the same side

`swap` refuses with `ERR_HAS_RESTING_POSITION` (u1018) when the caller has a
live deposit OR a parked amount on the side it would deposit. Cancel or readmit
first, then swap. The opposite side is not checked: a resting ask while you
swap STX for sBTC is a different row and is left alone, even if the walk fills
you against yourself.

Why refuse instead of folding the parked amount into the swap, the way
`deposit-token-x/y` folds it into a maker position:

- A swap sizes from the router's `get-taker-capacity` quote for `amount`. If
  the market silently added the parked amount to the taker leg, the user would
  see a quote for X and trade X plus parked. The router would have to read
  live + parked on the swap side and fold it into its allowance and its quote.
  That is the real cost, and it lands in every integrator, not just ours.
- The leftover rule of a swap is "refund under the minimum, else revert". A
  folded lump is usually above the minimum after the walk, so most such swaps
  would revert. Allowing it needs a second rule: taker input fills first, the
  rest goes back to resting at the saved maker price. That is a rewrite of
  `swap` and `cross-remainder-as-x/y`, on the audited crossing path.

Before this rule (bounty mtxs6nxg7a6d97081b11, finding by Patient Reed / apeirs)
`swap` only checked the live deposit. A parked maker could swap, the taker leg
overwrote the maker's price row, the swap's end deleted it, and the parked
amount was left with no price. A later `readmit-token-x/y` then installed a live
order at limit u0, a value every deposit path forbids. No funds were lost (the
owner could cancel or reprice) but the park/readmit loop would pick that order
first every time. The fix is the parked check in `swap`: with it, no path
leaves a parked amount without a price, so `readmit-token-x/y` stay as they
are.

Folding a resting or parked amount into a swap stays on the v7 list with the
spec above.

## Coverage status (2026-09-11)

Covered on stxer mainnet forks, real Lazer updates, source deployed under a
throwaway deployer: the whole v5 surface ported to the v6 arity (eight
harnesses), the fixed rungs and the peg rungs on v6 + core-v5 (keyless
gating, real fills, two members, parked flows both sides, held-then-bump),
pegs in and out of band both sides, the deposit gate with zero spread,
walks at the pegged price, the price-ordered mixed walk, boundary takers,
the batch with zero-spread pegs, the all-peg book, the lifecycle of an
order tuple, exact batch+walk arithmetic, deposit while parked (slot,
bump, refusal), capacity against pegs, random spreads under the stress
invariants. Ids in the tables below.

Closed since (2026-09-11, later the same day): a peg following a real mid
move (`verify-v6-peg-track-lazer.js`), the rung hold paths beyond `u1010`
(crossing and stale update), a peg rung sold out through fills, the x-side
mirrors, and the edges (guard boundary, spread 9999, `u1020` against a
zero-spread peg, core-v5 authority). Twenty-three runs, all green.

Closed as well: the under-minimum refund (section above), all 23 rerun
green on it.

Outside the market: done as well, router v5 and vault v6 (section below),
247/247 and 133/133 on the next stack from source.

## A maker left under the minimum is refunded

A fill can leave a maker with less than the market minimum: a partial walk
fill (0.7 STX left of 1.2), a pro-rata batch remainder, or the rounding
crumb when a bid is fully consumed. v5 let it rest: never fillable (every
fill path skips deposits under the minimum), rolled cycle after cycle,
holding a queue slot, refunded only by a cancel.

v6 refunds it in the same transaction and closes the position:

- in the walk (`execute-fill`): the MAKER's remainder, when above zero and
  under the minimum, goes back to the maker; the order tuple is deleted and
  the maker leaves the list. The taker's remainder is untouched: a taker's
  crumb can still fill the next maker in the walk, and `cross-remainder`
  already refunds what is left under the minimum at the end.
- in the batch (`distribute-to-token-x/y-depositor`): a maker's unfilled
  remainder under the minimum is refunded instead of rolled, except the
  crossing taker's own, which the walk needs. `acc-token-x/y-refunded`
  keeps the dust sweep honest: refunds are neither rolled nor treasury dust.

Both paths log `refund-x/y` on core-v5 (the equity ledger is debited like a
cancel); the `distribute-*` log's `unfilled` is what actually rolled. The
rungs need nothing: a refund lands in their balance and their sync counts
it as pool money. Proven by remainder-cross S3 / S5 (a 400-sat and a 1656
uSTX crumb refunded) and mirror R5 (a 672-sat batch remainder refunded,
`refund-x` logged).

## Findings from the fork runs (2026-09-11)

No contract change came out of the fifteen harnesses. Four behaviours are
worth knowing when reading the book or the logs:

- **A zero-spread peg never appears in a match log.** It sits at mid, so it
  is in range and clears in the batch step of the settlement, before the
  walk. If a taker has a residual after the batch, every in-range order on
  the other side is already exhausted. Fills of a zero-spread peg show up
  as `distribute-*` events, not `match`.
- **A keeper cannot settle an all-peg book.** With only spread-above-zero
  pegs resting, nothing is in range, `settle-with-refresh` returns u1009
  and reverts. Pegs trade through `swap`, which settles in crossing mode
  and walks. A keeper cron should treat u1009 on a v6 market as "nothing
  to do", not as a fault.
- **Two inactive pegs are parked oldest first.** Out of band they both sit
  at the sentinel, the same distance from mid; `park-one` keeps the first
  maker at the largest gap, so the older one in the depositor list goes.
- **A bid fully consumed by the walk used to keep under one sat of dust**
  (v5 behaviour): `execute-fill` sells the maker's whole capacity in sats,
  floors the STX it charges, and the difference stayed as a resting deposit
  under the minimum (2969, 2455 and 1945 uSTX in the first walk-order run).
  Closed by the under-minimum refund above: the crumb, and any partial
  remainder under the minimum, now goes back to the maker in the fill.

## Pruning settled cycles

Per settled cycle the market leaves three entries behind that nothing reads
again: `token-x-depositor-list`, `token-y-depositor-list` and
`cycle-totals` for that cycle (every map read in the contract is keyed by
the current or the next cycle; the only mention of a past cycle is the
number written into the `match` log). `prune-cycles (cycles (list 50 uint))`
deletes them for any cycle strictly below the current one, callable by
anyone. An open or future cycle in the list is `u1027 ERR_CYCLE_OPEN` and
the call is atomic. `settlements` is never pruned: it is the on-chain
history. Deposit entries need no pruning, they are deleted as each maker is
processed. The three private roll helpers left from the v4 cancel-cycle
(`roll-token-x/y-depositor`, `roll-depositor-lists`) are deleted.

Proven in `verify-v6-peg-batch-lazer.js` section Q (`9f14470c9cbdbbcd5fd2793a335555d1`, 92/92):
prune of cycles 0..4 by a stranger, lists and totals gone, the settlement
price of a pruned cycle still reads, the open cycle and a future cycle
refused, a repeat prune harmless, and a swap settling the open cycle right
after the prune with the walk still finding its makers.

## Router v5 and vault v6: the rest of the deploy set

`swap-router-sbtc-stx-jing-v5.clar` is the router v4 bytes bound to
`markets-sbtc-stx-jing-v6` (the constant and the literal in
`get-jing-min-deposits`). The router only calls `swap`, `get-taker-capacity`
and `get-min-deposits`, whose arities did not change, so nothing else moves.
`vault-sbtc-stx-v6.clar` is the vault v5 source bound to market v6, router
v5 and `jing-core-v5`, with `none` in the spread slot of its six market
calls that carry a limit price (deposit, set-limit, reprice-or-swap, both
sides): a vault order stays a fixed order. Router v4 and vault v5 stay in
the repo as they are.

| Harness | Stack | Result | Simulation |
|---|---|---|---|
| `verify-swap-router-v3-lazer.js` `V6=1` | core-v5 + market v6 + router v5 deployed from source under chavita; every market limit call passes `none`; two expectations moved: W9d's rolled dust is refunded by the v6 fill (nothing to cancel, u1005), W9f's XYK / Velar spill-over depends on the DLMM's room on the day | 247/247 | `ecb91152db7534fda4dcda733f04bb3f` |
| `verify-vault-sbtc-stx-v6-parked.js` | the v5 parked-order harness on the next stack, deployed first on the fork (the live `jing-vault-auth` stays); P0 deploys instead of clearing a live book | 133/133 | `e4eb4ba0bd5fbf74035653f9d634a7ff` |

```bash
npm run verify:router-v5           # PYTH_API_KEY=... (V6=1 on the router harness)
npm run verify:vault-v6-parked     # PYTH_API_KEY=...
```

Deploy order, repo names: `jing-core-v5`, `set-verified-contract` for each
of market v6 and vault v6, `markets-sbtc-stx-jing-v6` + `initialize`
(feeds u1 / u45), `swap-router-sbtc-stx-jing-v5`, `vault-sbtc-stx-v6` +
`initialize`, then `jing-ladder` and the rungs.

## Sponsor-friendly deposits: `deposit(amount, 0x00)` + `push(update)`

A member's rung deposit is a plain token transfer signed offline and
sponsored by us; the member never fetches an oracle update. `deposit` takes
the update argument as before, but the member passes an empty buffer
(`0x00`). When the market needs no price (the other side is empty, the
queue not full) the funds go straight onto the market; when it does, the
market refuses the empty update and the rung holds the funds (shares
minted, the position counts them). Any keeper then calls the new public
`push (update)` on the rung: it syncs, and pushes everything held when the
pool reaches the market minimum. `(ok true)` when pushed, `(ok false)` when
nothing is held, the pool is under the minimum, or the market refuses (the
funds stay held). The ladder logs `rung-push` (`keeper`, `amount`,
`pushed`, `held`). All four rungs; `withdraw` and `claim` are unchanged.

Proven by `verify-v6-rungs-push-lazer.js` (`1ce4e4882360121c6d2fa78f4ec12161`, 39/39):
a 0x00 deposit held while the other side rests, `push(0x00)` refused,
`push(update)` by a stranger pushes and logs, push with nothing held is
`(ok false)`, a top-up under the minimum held then pushed onto the live
position, the sell peg rung mirror, and the real flow: a deposit carrying a
STALE but genuinely signed update (the member pre-signed, we broadcast
later) lands the sats in the rung held (step 31), the keeper's push with
the same stale update is refused (step 34), the push with a fresh update
puts them on the market (step 35).

## Cost profile (2026-09-13): the market, the router, the vaults, and Bitflow

Execution costs read from the stxer fork results (`execution_cost` per
transaction, `node simulations/_costs.mjs <sim id>` prints them) and, for Bitflow, from the last fifty mainnet transactions of
each contract via the Hiro API. Block limits: 15,000 reads, 15,000 writes,
100 MB read length, 15 MB write length, 5,000,000,000 runtime. Runtime is
not wall-clock: it is the Clarity VM's abstract unit, a fixed amount per
operation scaled by the bytes the operation copies, deterministic on every
node. Of the five budgets, the one a transaction uses the biggest share of
is its binding dimension: it decides how many such transactions fit in a
block and what the fee estimator prices it on. For everything below that
is the read count; runtime sits an order of magnitude lower, so a change
that trades runtime for reads moves the fee and one the other way does
not.

Market v6 (fork `b0bd067c5adff10ec5bb4025885bb393`: forty fillers, one
rung, then the park path; bounty-fixes and stress forks for swap and
settle):

| transaction | reads | runtime | block share (reads / runtime) |
|---|---|---|---|
| deposit, side has room (1st to 40th filler) | 62 | 1.1M to 1.35M | 0.4% / 0.03% |
| deposit refused on a full side (u1010, every region empty) | 166 | 9.9M | 1.1% / 0.2% |
| deposit that parks on a full side (in-range newcomer) | 270 | 11.1M | 1.8% / 0.22% |
| band rung deposit + push onto a full side (seated, no park) | 294 | 2.2M | 2.0% / 0.04% |
| sync-seat | 29 | 0.19M | |
| settle-with-refresh | 180 | 1.1M | 1.2% / 0.02% |
| swap walking many makers | up to 424 | 1.8M | 2.8% / 0.04% |

Through the wrappers (router fork `ecb91152db7534fda4dcda733f04bb3f`,
vault fork `7468b9d40a901057fb8ef9a51c8848f4`, ccd016 fork
`5df232a3282ec928cfb1b6536fe7b3d0`):

| transaction | reads | runtime | block share |
|---|---|---|---|
| router v5 swap, book leg + DLMM leg | 378 to 387 | 5.5M to 5.6M | 2.6% / 0.11% |
| router v5 swap, book leg only | 137 | 4.3M | 0.9% / 0.09% |
| vault v6 execute-jing-deposit | 52 | 0.34M | |
| vault v6 execute-jing-set-limit | 42 | 0.51M | |
| ccd016 (CityCoins) jing-place | 93 | 1.1M | 0.6% / 0.02% |
| ccd016 router-swap (pools leg, refused u3002 that day) | 208 | 1.8M | 1.4% / 0.04% |
| ccd016 jing-reclaim | 37 | 0.21M | |

Bitflow DLMM on mainnet, same day, for scale:

| transaction | reads (avg / max) | runtime (avg / max) |
|---|---|---|
| dlmm-swap-router-v-1-2 swap-x-for-y / y-for-x simple-range-multi (50 txs) | 208 to 221 / 558 | 5.0M to 5.2M / 7.9M |
| dlmm-swap-router-v-1-1 swap-simple-multi (47 txs) | 68 / 149 | 0.9M / 2.0M |

So a Jing settlement or a book-only swap costs what a plain Bitflow swap
costs, the router's two-leg swap costs a Bitflow multi-range swap, and every
wrapper call sits under 3% of a block on its binding dimension. The park
path is the outlier in runtime only: twice Bitflow's heaviest swap, still
0.22% of a block, and it runs only when the side is full for the newcomer.
On a side with room the seats cost one data-var read.

The one-pass park scan, tried and measured (`markets-sbtc-stx-jing-v7.clar`,
uncommitted): one fold builds the N-best set, the first switched-off
resident, the smallest of the size region and the smallest of all, so the
three park folds and the core's size fold collapse into one, with the
same tie-breaks (list order) and the same outcomes. All 22 harnesses
green on it (seats fork `224fa03922faec9abd87a457ea17e4f6`, 172/172).

| full-side deposit | v6 reads | v7 reads | v6 runtime | v7 runtime |
|---|---|---|---|---|
| refused (u1010) | 166 | 123 | 9.9M | 15.9M |
| parks a filler | 270 | 208 | 11.1M | 16.1M |

Reads fall by a quarter, runtime rises by half: each resident now merges a
wider accumulator (the top rows carry amount and index, the pass carries
the seat list), and Clarity charges runtime by the bytes it copies. Mixed,
not worse: reads bind, so the fee moves a hair down; runtime could double
and still not bind. On the binding dimension the gain is 1.8% to 1.4% of a
block, on a transaction that is rare, against a rewrite of the park path.
Not adopted: v6 stays as pushed, the v7 file records the experiment.

The router's number is the whole smart swap: router v5 quotes the book and
the Bitflow DLMM on chain in one call, splits the amount across the two
legs for the best total out, executes both and enforces min-out on the
sum. That lands at the cost of one Bitflow multi-range swap.

Also considered and not done: a separate list for the seated rungs (the
seat check is already an in-memory lookup; settlement needs the rungs, so
every reader of the depositor list would merge two lists for no gain),
and binding repeated `var-get`s of the token principals and minimums once
per function (under ten small reads on a settlement of two hundred).

Source size: 99,191 bytes of the node's 100,000-byte cap
(`MAX_CONTRACT_SRC_SIZE`). Indentation is about 19 KB and comments about
4 KB; a deploy-time strip of both is the lever if v6 ever needs room, the
deployed bytes still derivable from the repo. The v7 experiment had to be
deployed that way (100,082 bytes raw, 76 KB stripped).

## Bounty mtxs6nxg7a6d97081b11: decision (2026-09-13)

Five submissions, three real findings, all low severity, all fixed on
master before deploy. The 21,000 sats go to **Celestial Shark**.

Ranking by economic impact, which is the measure that matters for a live
order book:

1. **Celestial Shark**, switched-off peg newcomer bumps a live maker
   (8df8417). The only finding that hurt someone other than the caller: a
   dead order could take a slot from a maker who was there to fill, and the
   book thinned by exactly that maker until the next in-range arrival. A
   large enough out-of-band peg could do it to the smallest maker every
   time. One paragraph, but the right paragraph.
2. **Patient Reed / apeirs**, a parked maker swapping on the same side lost
   its price row (a85b4dd). Deepest writeup on the board and a correct
   trace, but the money at stake was the caller's own, never lost, one
   cancel away. The "filled above the ceiling" branch was not reachable.
3. **Light Brio**, the ask sentinel was skipped only by the taker's limit
   (1a7fd37). Exact diagnosis and the exact fix we applied, mirrored from
   the bid side. Impact was a self-inflicted revert for a caller passing
   MAX_UINT as a limit; no state, no sats.

Sonic Mast reported the same sentinel as informational; Celestial Mast
confirmed the invariants without a new finding. Thank you to all five, and
in particular to apeirs and Light Brio: both fixes are yours, the reward
follows the harm.

## Rerun after `distance-slots`, the size rule parking, and the protected seats (2026-09-13, later; ids from the final seated-list shape)

Every v6 harness rerun with the N-best-prices rule and the demotion cascade
(`distance-slots`, default 10; price region = the N best out-of-range
prices, size region = every other out-of-range resident, in-range residents
in neither; in-range newcomers use the same region). Five harnesses changed their expectations, each where a small
in-band rung or maker on a full queue used to be held and now displaces the
N-th best: peg-park K8/K9, peg-park-y Y4, vault-parked V4 (region widened to 50 so the vault is the N-th best), and every size-bump check (the bumped smallest is now parked, not refunded), bounty-fixes section D (new: D5b
tells "the N-th best" from "the farthest"; D5c/D5d the cascade; D5e that
in-range residents count for neither region).

| harness | result | sim |
|---|---|---|
| markets v6 bounty-fixes | 201/201 | `b5b47896d6f9b7b7950966272b5f4139` |
| markets v6 gaps | 67/67 | `f70b890925f89befbd9a1905abfd969c` |
| markets v6 lazer-paths | 35/35 | `c014c74195d0c8967ae6627082aa1d3a` |
| markets v6 multifill | 44/44 | `10c0491fca5c06fff97d511d6c2608da` |
| markets v6 regression | 23/23 | `0b0f9ec5f2d6c6875d27c1d34b4c06b2` |
| markets v6 remainder-cross | 116/116 | `4d6123bc03d053ad12d70148740dddac` |
| markets v6 stress | 126/126 | `4cff58c2aa1ae09bf2b0ff31a19266fb` |
| markets v6 withdraw | 102/102 | `918374a3b1ca97e73790ae03334a970a` |
| v6 peg-batch | 93/93 | `c5ffb1f43c9dcb6b9f050fe3863132ea` |
| v6 peg-edges | 60/60 | `55d6ade325cb4a7524c77db485db65f2` |
| v6 peg | 76/76 | `40a2b33e3ee3b274479f22ea7bb1f037` |
| v6 peg-mirror | 44/44 | `858d7bf8e0be112c1d0a2b3097ba526c` |
| v6 peg-more | 51/51 | `398efea3dd2bfe10a2b6897f4a54834e` |
| v6 peg-park | 41/41 | `8f9edc37f9b18dda559b8571490cc983` |
| v6 peg-park-y | 77/77 | `7357090247937f7251cd1102861ef8a2` |
| v6 peg-track | 30/30 | `f3402b3b0b2ca362a5e2f799e6a732aa` |
| v6 peg-walk-order | 60/60 | `961d511471355e650567772b0726d632` |
| v6 rungs-fill | 40/40 | `1844de3cb7b94f03e6d7f6cb89d4893d` |
| v6 rungs-keyless | 37 passed | `e1958ed0c1eb8735e57db9c546cace5e` |
| v6 rungs-push | 39/39 | `06b5e9e0bb4e1ee1da4578760d25650e` |
| v6 rungs-miner-band (band rungs, seats, upgrade, retire) | 172/172 | `b0bd067c5adff10ec5bb4025885bb393` |
| vault v6 parked | 137/137 | `7468b9d40a901057fb8ef9a51c8848f4` |

## Bounty round 2, 2026-09-14: a replaced or retired rung locked its members out

Finding (Patient Reed, HIGH, confirmed): the ladder deleted the old rung's
`registered` row on a band replace and on `retire-band`, and every rung
action ends in a ladder `log-*` gated on that row (`rung-of`, u6010). In
the rungs the log call was the return value of `withdraw` / `claim` /
`deposit` and `try!`'d in `push` and in `sync` (epoch close), so after the
documented upgrade (replace) or a retire, 100% of the old rung's member
funds were stuck. The miner-band harness never deposited into a rung
before replacing it, which is why 172/172 stayed green.

Fix, 824f08b:
- ladder: `registered` is never deleted. Seat status was already decided
  by the `rungs` key alone (`is-band-current`), so replace and retire
  still drop the seat. `is-current-rung who` tells a seated rung from a
  demoted one and every rung event carries `current`.
- all six rungs: every ladder log is best effort, `(is-ok ...)`, never
  `try!` or the return value. A member's funds never hang on a print.
- band rungs can start WITHOUT a seat: `initialize(bps, seat)`; `seat`
  false goes through `register-unseated` (registered only: prints, takes
  deposits, ordinary parkable maker, no key, no count, any number per
  spread). The owner seats one later with `seat-band who`, which also
  re-seats a replaced or retired rung (its spread taken -> replace, free
  -> one more seat under the max). Retire and replace are reversible
  without a redeploy. `register` and `seat-band` share `claim-seat`
  (replace-or-count bookkeeping); the caller writes the key.
- Celestial Mast (MEDIUM, confirmed): `retire-band` left the market's
  `seated-x/y` copy stale when no current rung was left on that side
  (`sync-seat` needs a seated `who`), so the retired rung stayed
  un-parkable and the 51st ordinary deposit panicked in `as-max-len?`
  instead of parking. Fix: market `prune-seats` (anyone, both sides,
  idempotent). The ladder cannot call the market (the market depends on
  the ladder), so the prune lives on the market.

Harness `verify-v6-rungs-replace-keyless.js` (no Pyth key: band rungs
read the RFQ native oracle and every deposit lands on an empty opposite
side). On the old source it reproduced the lock, 58/83 (every withdraw,
claim, push and deposit on a replaced or retired rung -> u6010). On the
fix: sell replace, buy replace, retire, the old rung living on as an
ordinary maker, unseated init, seat-band on a stranger / unknown / seated
rung, re-seating the replaced spread-30 rung over its successor, a full
side refusing a seated init (u6011) but not an unseated one, the max
dial, retire then seat again.

| harness | result | sim |
|---|---|---|
| v6 rungs-replace-keyless (replace, retire, unseated, seat-band, prune-seats) | 149/149 | `1e45965140897caa236c91dc41b8fc07` |
| v6 rungs-keyless RUNG=buy | 37 passed | `2ee228909c498e6e5a218514af01453d` |
| v6 rungs-keyless RUNG=sell | 37 passed | `f6284fc04a3c80acfc9795771bc4ecd6` |
| v6 rungs-keyless RUNG=buy-peg | 40 passed | `80a2227b340dc0b8c82f4d365458a8f6` |
| v6 rungs-keyless RUNG=sell-peg | 40 passed | `1f7360371a09dd370b8c736e72d49c30` |
| v6 rungs-miner-band | needs a PYTH_API_KEY rerun: `initialize` now takes `(bps, seat)`, S8/S9 expect registered = true | |

The market gained one additive public, `prune-seats` (99,608 bytes, no
deposit path touched); the Lazer market harnesses are due a rerun with a
key.

## Full rerun 2026-09-13, after the three bounty fixes

Every v6 harness rerun on the source at 8df8417 plus the park-harness
rewrites below (parked-swap refusal a85b4dd, MAX_UINT sentinel skips 1a7fd37,
switched-off newcomer refusal 8df8417). All green. The per-harness rows above
keep their original ids; these are the current ones.

| harness | result | sim |
|---|---|---|
| markets v6 bounty-fixes | 142/142 | `b2ef80f568f01c10c4a404a05c2beb91` |
| markets v6 gaps | 66/66 | `0a3df0fcdab33f19befd763e483845e2` |
| markets v6 lazer-paths | 34/34 | `34941e782d18f15197f075730d1eaec7` |
| markets v6 multifill | 43/43 | `ea5912f54cce3ecf965154ada0ae190c` |
| markets v6 regression | 22/22 | `b335900f90391c2beb275d33fda2493e` |
| markets v6 remainder-cross | 115/115 | `25d2e4ea2af8aae53e55d14ecdd80b24` |
| markets v6 stress | 125/125 | `2b7e04dcf46eb85d209a9d0991295a8c` |
| markets v6 withdraw | 98/98 | `7670b369964edbac65f6fd29e127d82b` |
| v6 peg-batch | 92/92 | `367be254806cd644de094df94cc7e6fa` |
| v6 peg-edges | 60/60 | `437f1914902a30d42991ca8f3178f12e` |
| v6 peg | 76/76 | `2c43e45e6475203a0ab93f921419d23d` |
| v6 peg-mirror | 40/40 | `6b367e8515ac3550675c37880e702a8c` |
| v6 peg-more | 51/51 | `cf0d54084a95d448a54b12d2d7dbb901` |
| v6 peg-park | 36/36 | `fb40855a807e8a8513b202d7512f7a8a` (K6/K7 rewritten: a switched-off parked rung holds instead of bumping) |
| v6 peg-park-y | 75/75 | `88eece118ecb89869a7084fa107ddb92` (Y2/Y3/Y4 rewritten: switched off -> u1010 on a full queue; an alive -5% peg still bumps on size) |
| v6 peg-track | 30/30 | `38c4f3e62c198484fdb86d8d13bf4336` |
| v6 peg-walk-order | 60/60 | `2c4f3a3357a933bd1c73f943b7f82276` |
| v6 rungs-fill | 40/40 | `755c23d6cc4183103e142d91b194ef77` |
| v6 rungs-keyless | 37 passed | `312b48ca1d18820f4ea052a5acdd633a` |
| v6 rungs-push | 39/39 | `3e9ca09782f627aab3a9d5feebdea4e7` |
| vault v6 parked | 133/133 | `966b1c49ebabdccc65df484ae9521723` |

`verify-swap-router-v3-lazer.js` is historical (it redeploys the v4 market,
now live on mainnet, so it cannot run on a fresh fork) and is not part of
the v6 set.

## Verification (2026-09-11, stxer mainnet forks, all rerun after the parked-deposit change)

The v4 market harness set ported mechanically to the v6 arity
(`simulations/verify-markets-v6-*.js`: `none` inserted before the update
argument of every deposit / set-limit / reprice call, core-v5 + v6
deployed under a throwaway deployer, one real Lazer update). One porting
gotcha: `swap` is unchanged, so its call must NOT get the extra argument
(the first stress run failed with `IncorrectArgumentCount(8, 9)`).

| Harness | Result | Simulation |
|---------|--------|------------|
| markets v6 regression | 22/22 | `6cd87b6bfcfceeb887095dda66858c1a` (2026-09-13, after the parked-swap check) |
| markets v6 multifill | 43/43 | `32e4a488b94b13fa9717597fc2899f41` |
| markets v6 withdraw | 98/98 | `2d23439b7eb6b5de5def1c93e6189bb5` |
| markets v6 lazer-paths | 34/34 | `1205f76581d3a00f19fccfc6d2adc954` |
| markets v6 gaps | 66/66 | `b27e408f1413fc9fdb1ff39e6392b6ef` |
| markets v6 bounty-fixes | 142/142 | `63206d614d611de40d5a64b2ce7bee82` (2026-09-13: + parked maker swaps on y and on x -> u1018, position untouched; + switched-off peg newcomer bigger than the smallest on a full book -> u1010, no bump, both sides) |
| markets v6 remainder-cross | 115/115 | `1530095ec9875dc772b936746fae66ff` (2026-09-13, after the parked-swap check) |
| markets v6 stress (seed 7, 60 actions) | 125/125 | `1ca4b515c6307e7266d3f9313d24a903` |

Rungs on v6, keyless (`verify-v6-rungs-keyless.js`, `RUNG=...`): deploys
core-v5 + v6 + ladder + one rung, walks ladder gating, held vs pushed,
the operator raising the minimum, partial / whole-cancel / full exit,
second member, gift + claim; the peg rungs also read their order back off
the market (limit = guard in market unit, `spread-bps (some u20)`) and the
ladder key.

| Rung | Result | Simulation |
|------|--------|------------|
| buy fixed | 37/37 | `c4ecedffc880d61b0750f1ca9dce1f7a` |
| sell fixed | 37/37 | `5aeef25f0b561c8f4455c7f9245dc173` |
| buy peg | 40/40 | `c223128736f4b27d74018e74f37bdfc3` |
| sell peg | 40/40 | `22c38ce345ee1e22f6678118a68cfcdf` |

The pegged path with a real mid (`PYTH_API_KEY`):

| Harness | Covers | Result | Simulation |
|---------|--------|--------|------------|
| `verify-v6-peg-lazer.js` | pegged-ask / pegged-bid maths and sentinels; four peg rungs in and out of band; the gate (a peg 20 bps above mid is not in-range liquidity, a zero-spread peg at mid is: u1016); a taker walks the in-band peg at mid + spread and skips the out-of-band one, the match log carries the pegged price, the rung folds the fill and the member claims; the mirror on the sell side; the settlement roll (sentinel for out of band, pegged price for the remainder); set-limit fixed -> peg -> fixed, u1026, u1011 | 76/76 | `62fa86615ac0a5e497ccf787c0a3dc07` |
| `verify-v6-rungs-fill-lazer.js` | fixed rungs on v6: ask 1% over / bid 1% under mid, taker walks each at the rung's price, sync, claim, balances move by the proceeds, the other rung rolls with its own limit, full exits | 40/40 | `ae7f70db63c2d1129beaeaf81a5d6608` |
| `verify-v6-peg-more-lazer.js` | `get-taker-capacity` against a pegged book (an in-band peg counts once the taker's limit reaches it, an out-of-band peg never); two members in one peg rung through a real fill: pro-rata unsold and proceeds, five 1-sat withdraws burn at least their value (fix 7 on the real market) and leave their rounding dust held for the next epoch, full exits leave total-shares 0 and the rung's sats equal to that dust; `reprice-or-swap-token-x` fixed -> 30 bps peg (plain reprice, no y side), u1026, then to a zero-spread peg against a resting bid: crosses and swaps | 51/51 | `21b62ec9cc83d335be54d3b4004f1553` |
| `verify-v6-peg-park-lazer.js` | 49 fillers + an out-of-band peg rung fill the x queue; an in-range newcomer parks the inactive peg first; parked: sync counts it, a member withdraws from it, a deposit on the full queue is held, after a filler leaves the next deposit readmits and pushes everything | 36/36 | `f8d0ef12f4a6d9f162f8f2f99eb32549` |
| `verify-v6-peg-batch-lazer.js` | a zero-spread peg clears IN THE BATCH pro-rata next to a fixed bid (exact sats received, exact STX left); a tiny zero-spread peg is rolled by the small-share filter with its order intact; settlement price is the mid; `peg-y` logged only for `(some ..)` writes; an all-peg book: keeper `settle-with-refresh` u1009, a taker demanding 1 over the pegged bid u1017 (atomic), a taker at exactly the pegged bid fills, every other peg rolls intact; lifecycle: partial withdraw keeps the peg, cancel and full fill delete the order; exact arithmetic for one swap that clears the batch and walks a peg, both sides | 92/92 | `9f14470c9cbdbbcd5fd2793a335555d1` |
| `verify-v6-peg-walk-order-lazer.js` | a mixed book (pegs +10/+20/+50 bps, fixed +15/+100, a +30 peg rung): a taker at +35 fills +10, +15, +20, +30 in that order (match log price sequence), never +50/+100; boundaries: 1 under the best ask u1017 (whole swap reverted), exactly the best ask fills that maker only; mirrored on the bid side with a sell-stx peg rung | 60/60 | `e95b46d52245f5759f8db2a69c081136` |
| `verify-v6-peg-park-y-lazer.js` | y-side park: 49 fillers + an inactive sell-peg rung, an in-range newcomer parks the rung first; parked rung flows (sync, withdraw, a deposit on the full queue bumps a filler and the rung is live again); a direct out-of-band zero-spread peg bumps the smallest deposit on a full queue, is parked by the next in-range newcomer, re-pegs to zero spread while parked, readmit u1016 while an in-range ask rests, ok once it leaves, u1022 after; a second in-band rung too small for the full queue is held, then bumps; a parked direct maker deposits: combined size bumps, `readmit-y` printed | 70/70 | `abe05622800e6145fecbb3d02ac622e6` |
| `verify-markets-v6-stress.js` `PEGS=1` | seed 7, 60 actions, half the maker writes carry a random spread (0 / 5 / 20 / 50 / 150 bps) with the limit as ceiling / floor; I1-I5 as before plus I6: every resting order's `token-*-limit-at` equals a JS mirror of `pegged-bid` / `pegged-ask` (sentinels included) at every checkpoint | 131/131 | `d0089123a22431bff7420dd8aab8b905` |
| `verify-v6-peg-track-lazer.js` | a peg follows a REAL mid move: two Lazer prints 75 s apart in one fork (staleness widened, signatures real); a taker on print A fills the buy and sell peg rungs at mid_A +/- 20 bps, a taker on print B at mid_B +/- 20 bps, from the match logs; `token-*-limit-at` reads both prices at both mids; the prints moved (30264579644231 -> 30265820928180) and the fills moved with them | 30/30 | `7bb02271691160330ec8c8225a69952d` |
| `verify-v6-peg-edges-lazer.js` | a peg rung sold out THROUGH FILLS (epoch closes, member claims, next epoch opens on the next deposit); guard edges (a pegged price exactly on the ceiling / floor is in band, one unit past is the sentinel; spread 9999 both sides, a 9999 bps peg rests); a 2 STX taker against a 2000 STX zero-spread peg on its own side u1020; the rung hold paths: a zero-spread rung whose deposit would cross (u1016) holds, a STALE update holds, a fresh deposit then pushes everything; core-v5 authority: stranger and deployer calling log-peg / log-park / log-readmit / log-set-limit u5001 | 60/60 | `5e041b75544d4f23ba7ad258e01e362e` (2026-09-13: + G5 out-of-band ask sentinel at taker limit MAX_UINT: capacity returns, walk-cap equal to the HUGE-limit baseline) |
| `verify-v6-peg-mirror-lazer.js` | x-side mirrors on a MAX 3 park instance: an out-of-band zero-spread ask is parked first, re-pegs to mid while parked, readmit u1016 while an in-range bid rests, ok once it leaves, a top-up under the minimum onto the live position; `reprice-or-swap-token-y` fixed -> 30 bps peg (plain), u1026, then to a zero-spread peg against an in-range ask: crosses and swaps at mid | 40/40 | `1d090f9604100a632aa932ef385b4ee1` |

```bash
npm run verify:markets-v6          # PYTH_API_KEY=...
npm run verify:v6-rungs-buy        # keyless; -sell, -buy-peg, -sell-peg
npm run verify:v6-peg              # PYTH_API_KEY=...
npm run verify:v6-rungs-fill       # PYTH_API_KEY=...
npm run verify:v6-peg-park         # PYTH_API_KEY=... (uses the juice node: 50 fresh accounts trip Hiro's rate limit)
npm run verify:v6-peg-more         # PYTH_API_KEY=...
npm run verify:v6-peg-batch        # PYTH_API_KEY=...
npm run verify:v6-peg-walk-order   # PYTH_API_KEY=...
npm run verify:v6-peg-park-y       # PYTH_API_KEY=... (juice node, 50 fresh accounts)
npm run verify:v6-stress-pegs      # PYTH_API_KEY=...
npm run verify:v6-peg-track        # PYTH_API_KEY=... (waits WAIT=75 s between two prints)
npm run verify:v6-peg-edges        # PYTH_API_KEY=...
npm run verify:v6-peg-mirror       # PYTH_API_KEY=...
npm run verify:v6-rungs-push       # PYTH_API_KEY=...
```

Not covered yet: `reprice-or-swap-token-y` with a spread (the x side is), a
pegged order parked on the y side, the vault on v6 (it binds v5).
