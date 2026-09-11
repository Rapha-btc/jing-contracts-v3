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

and minus `log-close-deposits` and `log-cancel-cycle`, which no market
since v5 calls. Everything else is byte-for-byte v4. The v6 market binds
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
`delta`, and the market prints `readmit-x/y` with the parked amount so an
indexer clears the parked state. `readmit-token-x/y` stays for keepers.
`ERR_PARKED u1021` is gone.

The rungs call the market's deposit directly (`push-to-market`, a private
attempt read with `is-ok`) and hold the funds on any refusal instead of
aborting the member's transaction. Clarity note: a `try!` inside
`as-contract?` returns from the enclosing function, so the attempt has to be
its own function for the caller to observe a refusal.

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
- **A bid fully consumed by the walk keeps under one sat of dust** (v5
  behaviour, unchanged). `execute-fill` sells the maker's whole capacity in
  sats, floors the STX it charges, and the difference stays as a resting
  deposit under the minimum: 2969, 2455 and 1945 uSTX in the walk-order
  run. It never fills (the walk skips deposits under the minimum, the
  settle filter rolls it) and cancel refunds it. The ask side has no dust:
  sats are traded whole. An indexer should not render a deposit under the
  market minimum as a live order.

## Verification (2026-09-11, stxer mainnet forks, all rerun after the parked-deposit change)

The v4 market harness set ported mechanically to the v6 arity
(`simulations/verify-markets-v6-*.js`: `none` inserted before the update
argument of every deposit / set-limit / reprice call, core-v5 + v6
deployed under a throwaway deployer, one real Lazer update). One porting
gotcha: `swap` is unchanged, so its call must NOT get the extra argument
(the first stress run failed with `IncorrectArgumentCount(8, 9)`).

| Harness | Result | Simulation |
|---------|--------|------------|
| markets v6 regression | 22/22 | `f13d0c95c3e5e32abc3eee1fb83af4a9` |
| markets v6 multifill | 43/43 | `1ba77f4c18136d96aa37a4040eb8ce84` |
| markets v6 withdraw | 98/98 | `d15281b878d2678d9eef9c6958fd70be` |
| markets v6 lazer-paths | 34/34 | `a3b9d395521bb2c1d27cb08109316dd4` |
| markets v6 gaps | 64/64 | `e115e002a248a6845338b0b3638b60fc` |
| markets v6 bounty-fixes | 131/131 | `f5a9a9a210d4448ed77b19d8e09eac3a` |
| markets v6 remainder-cross | 115/115 | `219a0a1f67b5dbac3976330027ea719e` |
| markets v6 stress (seed 7, 60 actions) | 125/125 | `67ef7a6f2a48ade8cf955389ee355086` |

Rungs on v6, keyless (`verify-v6-rungs-keyless.js`, `RUNG=...`): deploys
core-v5 + v6 + ladder + one rung, walks ladder gating, held vs pushed,
the operator raising the minimum, partial / whole-cancel / full exit,
second member, gift + claim; the peg rungs also read their order back off
the market (limit = guard in market unit, `spread-bps (some u20)`) and the
ladder key.

| Rung | Result | Simulation |
|------|--------|------------|
| buy fixed | 37/37 | `614779688e2dec64909bc4506d570c8b` |
| sell fixed | 37/37 | `e5eeb5f195cb6acbe72fe39e492ef2e2` |
| buy peg | 40/40 | `3c6a7255a4a50660797cfd789855ef6e` |
| sell peg | 40/40 | `7040233e38b3c9d9ea97bc924e4e1fe3` |

The pegged path with a real mid (`PYTH_API_KEY`):

| Harness | Covers | Result | Simulation |
|---------|--------|--------|------------|
| `verify-v6-peg-lazer.js` | pegged-ask / pegged-bid maths and sentinels; four peg rungs in and out of band; the gate (a peg 20 bps above mid is not in-range liquidity, a zero-spread peg at mid is: u1016); a taker walks the in-band peg at mid + spread and skips the out-of-band one, the match log carries the pegged price, the rung folds the fill and the member claims; the mirror on the sell side; the settlement roll (sentinel for out of band, pegged price for the remainder); set-limit fixed -> peg -> fixed, u1026, u1011 | 76/76 | `4c16b112fb893c42e91e3f74c0304ad0` |
| `verify-v6-rungs-fill-lazer.js` | fixed rungs on v6: ask 1% over / bid 1% under mid, taker walks each at the rung's price, sync, claim, balances move by the proceeds, the other rung rolls with its own limit, full exits | 40/40 | `a67e9a7abf675287309df517041f31b0` |
| `verify-v6-peg-more-lazer.js` | `get-taker-capacity` against a pegged book (an in-band peg counts once the taker's limit reaches it, an out-of-band peg never); two members in one peg rung through a real fill: pro-rata unsold and proceeds, five 1-sat withdraws burn at least their value (fix 7 on the real market) and leave their rounding dust held for the next epoch, full exits leave total-shares 0 and the rung's sats equal to that dust; `reprice-or-swap-token-x` fixed -> 30 bps peg (plain reprice, no y side), u1026, then to a zero-spread peg against a resting bid: crosses and swaps | 51/51 | `460b53eb6f1f4e2926df2ff855270b47` |
| `verify-v6-peg-park-lazer.js` | 49 fillers + an out-of-band peg rung fill the x queue; an in-range newcomer parks the inactive peg first; parked: sync counts it, a member withdraws from it, a deposit on the full queue is held, after a filler leaves the next deposit readmits and pushes everything | 36/36 | `39dff6713debac12d18d5bc5456cc5d5` |
| `verify-v6-peg-batch-lazer.js` | a zero-spread peg clears IN THE BATCH pro-rata next to a fixed bid (exact sats received, exact STX left); a tiny zero-spread peg is rolled by the small-share filter with its order intact; settlement price is the mid; `peg-y` logged only for `(some ..)` writes; an all-peg book: keeper `settle-with-refresh` u1009, a taker demanding 1 over the pegged bid u1017 (atomic), a taker at exactly the pegged bid fills, every other peg rolls intact; lifecycle: partial withdraw keeps the peg, cancel and full fill delete the order; exact arithmetic for one swap that clears the batch and walks a peg, both sides | 74/74 | `feb6b5c603297457ee025dfa18f1cfa7` |
| `verify-v6-peg-walk-order-lazer.js` | a mixed book (pegs +10/+20/+50 bps, fixed +15/+100, a +30 peg rung): a taker at +35 fills +10, +15, +20, +30 in that order (match log price sequence), never +50/+100; boundaries: 1 under the best ask u1017 (whole swap reverted), exactly the best ask fills that maker only; mirrored on the bid side with a sell-stx peg rung | 60/60 | `eb7b3af20efe5687758c0d92103eef4b` |
| `verify-v6-peg-park-y-lazer.js` | y-side park: 49 fillers + an inactive sell-peg rung, an in-range newcomer parks the rung first; parked rung flows (sync, withdraw, a deposit on the full queue bumps a filler and the rung is live again); a direct out-of-band zero-spread peg bumps the smallest deposit on a full queue, is parked by the next in-range newcomer, re-pegs to zero spread while parked, readmit u1016 while an in-range ask rests, ok once it leaves, u1022 after; a second in-band rung too small for the full queue is held, then bumps; a parked direct maker deposits: combined size bumps, `readmit-y` printed | 70/70 | `e7e31b6b8b5493504d0303f1d7efe3f9` |
| `verify-markets-v6-stress.js` `PEGS=1` | seed 7, 60 actions, half the maker writes carry a random spread (0 / 5 / 20 / 50 / 150 bps) with the limit as ceiling / floor; I1-I5 as before plus I6: every resting order's `token-*-limit-at` equals a JS mirror of `pegged-bid` / `pegged-ask` (sentinels included) at every checkpoint | 131/131 | `40c3d7a438190f25e2446444b483c961` |

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
```

Not covered yet: `reprice-or-swap-token-y` with a spread (the x side is), a
pegged order parked on the y side, the vault on v6 (it binds v5).
