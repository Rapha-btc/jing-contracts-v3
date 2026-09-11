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
  the first to be parked when a full queue admits an in-range maker.

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
- `u1016 ERR_MUST_USE_SWAP`, `u1021 ERR_PARKED`, `u1005
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

## Verification (2026-09-11, stxer mainnet forks)

The v4 market harness set ported mechanically to the v6 arity
(`simulations/verify-markets-v6-*.js`: `none` inserted before the update
argument of every deposit / set-limit / reprice call, core-v5 + v6
deployed under a throwaway deployer, one real Lazer update). One porting
gotcha: `swap` is unchanged, so its call must NOT get the extra argument
(the first stress run failed with `IncorrectArgumentCount(8, 9)`).

| Harness | Result | Simulation |
|---------|--------|------------|
| markets v6 regression | 22/22 | `d73cb424c786f7ed1e4754a9d1941c83` |
| markets v6 multifill | 43/43 | `420df0cac20ce8f4a334c2f7f7f5b638` |
| markets v6 withdraw | 98/98 | `cd06928b5f7f49e042fecafb6fb4464f` |
| markets v6 lazer-paths | 34/34 | `c1edcd27c5a360439be29bf3c51fed75` |
| markets v6 gaps | 64/64 | `63dae44d4bdffacd27638a28e96872d9` |
| markets v6 bounty-fixes | 129/129 | `55f055e415440b2bc5c9847dea6e6465` |
| markets v6 remainder-cross | 115/115 | `141e444a3e96a686d298e3bcb51f0efb` |
| markets v6 stress (seed 7, 60 actions) | 125/125 | `dbaae30020e0e610e41e3db304f35eb2` |

Rungs on v6, keyless (`verify-v6-rungs-keyless.js`, `RUNG=...`): deploys
core-v5 + v6 + ladder + one rung, walks ladder gating, held vs pushed,
the operator raising the minimum, partial / whole-cancel / full exit,
second member, gift + claim; the peg rungs also read their order back off
the market (limit = guard in market unit, `spread-bps (some u20)`) and the
ladder key.

| Rung | Result | Simulation |
|------|--------|------------|
| buy fixed | 37/37 | `0651915ab53b3e79c445ffc2d5da507e` |
| sell fixed | 37/37 | `706f13c188c1b8f54b96aac1a288d8f4` |
| buy peg | 40/40 | `f6cc6438f6f6590353955f9489a34d4a` |
| sell peg | 40/40 | `051a42629d4e21936db3ed6ec7971211` |

The pegged path with a real mid (`PYTH_API_KEY`):

| Harness | Covers | Result | Simulation |
|---------|--------|--------|------------|
| `verify-v6-peg-lazer.js` | pegged-ask / pegged-bid maths and sentinels; four peg rungs in and out of band; the gate (a peg 20 bps above mid is not in-range liquidity, a zero-spread peg at mid is: u1016); a taker walks the in-band peg at mid + spread and skips the out-of-band one, the match log carries the pegged price, the rung folds the fill and the member claims; the mirror on the sell side; the settlement roll (sentinel for out of band, pegged price for the remainder); set-limit fixed -> peg -> fixed, u1026, u1011 | 76/76 | `671eea8cc199f44e6315bdadd89ec999` |
| `verify-v6-rungs-fill-lazer.js` | fixed rungs on v6: ask 1% over / bid 1% under mid, taker walks each at the rung's price, sync, claim, balances move by the proceeds, the other rung rolls with its own limit, full exits | 40/40 | `cb96ea4d04a1328067e8792033ff8009` |
| `verify-v6-peg-more-lazer.js` | `get-taker-capacity` against a pegged book (an in-band peg counts once the taker's limit reaches it, an out-of-band peg never); two members in one peg rung through a real fill: pro-rata unsold and proceeds, five 1-sat withdraws burn at least their value (fix 7 on the real market) and leave their rounding dust held for the next epoch, full exits leave total-shares 0 and the rung's sats equal to that dust; `reprice-or-swap-token-x` fixed -> 30 bps peg (plain reprice, no y side), u1026, then to a zero-spread peg against a resting bid: crosses and swaps | 51/51 | `a6d2976a187407d6e6a540b8befc5e70` |
| `verify-v6-peg-park-lazer.js` | 49 fillers + an out-of-band peg rung fill the x queue; an in-range newcomer parks the inactive peg first; parked: sync counts it, a member withdraws from it, a deposit on the full queue is held, after a filler leaves the next deposit readmits and pushes everything | 27/27 | `4c46e5bd4b5f90d1c5e32f28b395af47` |

```bash
npm run verify:markets-v6          # PYTH_API_KEY=...
npm run verify:v6-rungs-buy        # keyless; -sell, -buy-peg, -sell-peg
npm run verify:v6-peg              # PYTH_API_KEY=...
npm run verify:v6-rungs-fill       # PYTH_API_KEY=...
npm run verify:v6-peg-park         # PYTH_API_KEY=... (uses the juice node: 50 fresh accounts trip Hiro's rate limit)
npm run verify:v6-peg-more         # PYTH_API_KEY=...
```

Not covered yet: `reprice-or-swap-token-y` with a spread (the x side is), a
pegged order parked on the y side, the vault on v6 (it binds v5).
