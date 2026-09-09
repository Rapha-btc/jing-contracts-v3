# markets-sbtc-stx-jing-v6 + jing-core-v5: pegged orders

Source only, not deployed. `clarinet check` clean on both files. No harness
run yet: the stxer harnesses in `simulations/` still target v5 and need a
v6 pass before deploy.

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
3. Rebind and re-arity anything that must point at v6: `swap-router-sbtc-stx-jing-v4`,
   `jing-ladder`, `jing-buy-stx`, `jing-sell-stx`, `vault-sbtc-stx-v5` all
   bind v5 today and call the v5 arities.

Deploy under the repo names. Before deploy: run the v4/v5 stxer harness
set against v6, then add peg scenarios (in band, out of band both sides,
zero spread against in-range liquidity, park of an inactive peg, peg to
fixed and back).
