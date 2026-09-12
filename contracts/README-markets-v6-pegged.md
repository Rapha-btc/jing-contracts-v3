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
park of a farther maker when the newcomer is in range). Core-v5 logs
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

Outside the market: router v4 and vault v5 bind market v5 and call the v5
arities; retail trades through the router, so the deploy needs a router
rebind to v6 and the router harness ported (about 250 checks), same for the
vault.

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

## Verification (2026-09-11, stxer mainnet forks, all rerun after the parked-deposit change)

The v4 market harness set ported mechanically to the v6 arity
(`simulations/verify-markets-v6-*.js`: `none` inserted before the update
argument of every deposit / set-limit / reprice call, core-v5 + v6
deployed under a throwaway deployer, one real Lazer update). One porting
gotcha: `swap` is unchanged, so its call must NOT get the extra argument
(the first stress run failed with `IncorrectArgumentCount(8, 9)`).

| Harness | Result | Simulation |
|---------|--------|------------|
| markets v6 regression | 22/22 | `23a7d4ef30085e91da6dc7dec85b7b7d` |
| markets v6 multifill | 43/43 | `32e4a488b94b13fa9717597fc2899f41` |
| markets v6 withdraw | 98/98 | `2d23439b7eb6b5de5def1c93e6189bb5` |
| markets v6 lazer-paths | 34/34 | `1205f76581d3a00f19fccfc6d2adc954` |
| markets v6 gaps | 66/66 | `b27e408f1413fc9fdb1ff39e6392b6ef` |
| markets v6 bounty-fixes | 131/131 | `1f4aa374a342f7a0c9859a269e5ef281` |
| markets v6 remainder-cross | 115/115 | `19cd40a3539cfbdb7be77633b0f7f09d` |
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
| `verify-v6-peg-batch-lazer.js` | a zero-spread peg clears IN THE BATCH pro-rata next to a fixed bid (exact sats received, exact STX left); a tiny zero-spread peg is rolled by the small-share filter with its order intact; settlement price is the mid; `peg-y` logged only for `(some ..)` writes; an all-peg book: keeper `settle-with-refresh` u1009, a taker demanding 1 over the pegged bid u1017 (atomic), a taker at exactly the pegged bid fills, every other peg rolls intact; lifecycle: partial withdraw keeps the peg, cancel and full fill delete the order; exact arithmetic for one swap that clears the batch and walks a peg, both sides | 74/74 | `7e3d3de48e676b76d23e6912856d18c7` |
| `verify-v6-peg-walk-order-lazer.js` | a mixed book (pegs +10/+20/+50 bps, fixed +15/+100, a +30 peg rung): a taker at +35 fills +10, +15, +20, +30 in that order (match log price sequence), never +50/+100; boundaries: 1 under the best ask u1017 (whole swap reverted), exactly the best ask fills that maker only; mirrored on the bid side with a sell-stx peg rung | 60/60 | `e95b46d52245f5759f8db2a69c081136` |
| `verify-v6-peg-park-y-lazer.js` | y-side park: 49 fillers + an inactive sell-peg rung, an in-range newcomer parks the rung first; parked rung flows (sync, withdraw, a deposit on the full queue bumps a filler and the rung is live again); a direct out-of-band zero-spread peg bumps the smallest deposit on a full queue, is parked by the next in-range newcomer, re-pegs to zero spread while parked, readmit u1016 while an in-range ask rests, ok once it leaves, u1022 after; a second in-band rung too small for the full queue is held, then bumps; a parked direct maker deposits: combined size bumps, `readmit-y` printed | 70/70 | `abe05622800e6145fecbb3d02ac622e6` |
| `verify-markets-v6-stress.js` `PEGS=1` | seed 7, 60 actions, half the maker writes carry a random spread (0 / 5 / 20 / 50 / 150 bps) with the limit as ceiling / floor; I1-I5 as before plus I6: every resting order's `token-*-limit-at` equals a JS mirror of `pegged-bid` / `pegged-ask` (sentinels included) at every checkpoint | 131/131 | `d0089123a22431bff7420dd8aab8b905` |
| `verify-v6-peg-track-lazer.js` | a peg follows a REAL mid move: two Lazer prints 75 s apart in one fork (staleness widened, signatures real); a taker on print A fills the buy and sell peg rungs at mid_A +/- 20 bps, a taker on print B at mid_B +/- 20 bps, from the match logs; `token-*-limit-at` reads both prices at both mids; the prints moved (30264579644231 -> 30265820928180) and the fills moved with them | 30/30 | `7bb02271691160330ec8c8225a69952d` |
| `verify-v6-peg-edges-lazer.js` | a peg rung sold out THROUGH FILLS (epoch closes, member claims, next epoch opens on the next deposit); guard edges (a pegged price exactly on the ceiling / floor is in band, one unit past is the sentinel; spread 9999 both sides, a 9999 bps peg rests); a 2 STX taker against a 2000 STX zero-spread peg on its own side u1020; the rung hold paths: a zero-spread rung whose deposit would cross (u1016) holds, a STALE update holds, a fresh deposit then pushes everything; core-v5 authority: stranger and deployer calling log-peg / log-park / log-readmit / log-set-limit u5001 | 55/55 | `e9da6ff168b3a9730ef9bd44771bd4a3` |
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
