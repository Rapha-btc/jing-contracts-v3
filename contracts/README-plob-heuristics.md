# PLOB heuristics: how the pegged limit order book actually behaves

Short rules to hold in your head when reading or changing the market
(`markets-sbtc-stx-jing-v6-*`). Each one is a thing we had to re-derive at
least once. Sats per STX is used for the examples; contract units are STX per
BTC, the inverse, so every direction flips in code.

---

## 1. A maker never fills at its own limit. Only at the mid.

A resting order clears in the **batch**, at the oracle mid. Its limit is a
**cap**, not a price it can demand:

- a bid at 410 with the mid at 400 buys at 400, not 410;
- the same bid facing a 396 ask does not pay 396: nothing happens until the
  mid itself reaches 396, and then both clear at that mid.

**Consequence.** Resting an order that "would cross" is not an exploit. You
never get the aggressive price by resting; you only get the mid, later, with
the risk that the mid runs away or the other side leaves.

## 2. Only a taker walks the book, and a taker pays the rebate.

- `swap` (and reprice's crossing branch): batch first, then walk the rest of
  the book at each maker's own price. The walk is the only place a maker's
  limit is paid, and the taker pays `TAKER_REBATE_BPS` for it.
- `settle-with-refresh` runs `execute-settlement` only: the batch, no walk.
  So calling it yourself gets you the mid, nothing more.
- The walk skips the caller's own order (`is-eq maker takr`), so you cannot
  self-fill with a small swap.

## 3. The mid is chosen by whoever submits the price update.

Freshness is a range (`MAX_STALENESS` 80 s), not a point. Whoever hands in
the update picks where inside that range to settle: a free option on the mid,
written by the maker resting opposite. Two ways to answer it:

- **price the option** (v6-x): the taker pays a rebate that rises with the
  update's age, 20 bps to 69 bps.
- **remove the option** (v7 / the v6-3 submit + settle work): the order is
  stamped when it is submitted, and only an update **published after** that
  stamp may settle it. Nobody can act on a print they have already seen.

## 4. A peg has no price of its own.

`token-*-limit-at (depositor, p)` prices a pegged order **at the price you
pass in**: a spread-0 peg is willing at any `p`, a peg with a spread always
sits `p * (1 -/+ spread)` away from it.

**Consequences:**

- a peg with a spread **never clears in the batch** (it is always off the
  mid by construction); only the walk fills it;
- asking "would this peg cross?" has no answer until a mid is chosen, and
  the attacker chooses the mid. That is why a margin gate cannot protect
  pegged orders, and why the anchor exists.

## 5. The margin gate could not be made to work, and why.

`MAKER_MARGIN_BPS` refused a maker entry within 0.4% of crossing. On pegs it
fails in both directions at once:

- **too strict:** a buy rung and a sell rung both pegged at the mid - the
  ladder's normal state - are each willing at any price, so the second one
  is refused;
- **too blind:** a peg with a spread is never found by the search, so the
  gate cannot protect it at all.

That is the impossibility: the gate blocks the state we want and misses the
state we fear. The anchor (submit + settle) replaces it.

## 6. Pause is about settling, not about quoting.

`ERR_PAUSED` guards money in and fills: both deposit cores, both readmits,
`execute-settlement`. It does **not** guard repricing, cancel or withdraw. A
paused market cannot fill anyone, so a maker must stay free to move or leave.

## 7. Dust below the minimum still fills in the batch.

The minimum deposit is checked on entry and on what is left after a fill
(the remainder is refunded), but `execute-settlement` distributes pro-rata
with no minimum. So an order left under the minimum by an operator raising
it still clears at the mid, and anything that reasons about "live" orders
(the gate's search) must count it.

## 8. Fills happen in whole sats, and the change goes home.

The walk fills in whole satoshis, so a rung that rested 20.000000 STX ends a
fill with a few thousand micro-STX left. Below the minimum it cannot rest,
so it is refunded to its owner (`refund-y`), not swept. The taker's own
leftover comes back the same way (`token-y-rolled`), and a leftover at or
above the minimum makes the whole swap revert (`ERR_PARTIAL_FILL`): a swap
is fill-or-kill.

## 9. A rung that cannot push holds the funds.

A pooled rung calls the market inside `push-to-market` and reads the result
as a value. If the market refuses (gate, queue full, under the minimum), the
member's deposit still succeeds and the sats stay on the rung (`held-sats`)
until a keeper pushes them later. Nobody's money is stuck, but that
liquidity is not quoting in the meantime.

## 10. Every fill pays 10 bps per side; the rebate is 20 bps taker to maker.

`FEE_BPS` 10 is taken from **what each side receives** and goes to the
treasury. `TAKER_REBATE_BPS` 20 goes from the taker to the maker, inside the
same transfer (no separate payment). So a taker pays about 0.3% and a maker
nets about +0.1%. The rebate is reserved up front on the taker's whole
input, and whatever is not paid out comes back.

Worked example of one swap, event by event:
`README-worked-example-ladder-fill.md`.

## 11. A pending change is public, and the race is the protection.

`settle-token-*-limit (who, update)` may be called by anyone: the maker, a
keeper, or a stranger. That is safe because the settle can only apply the
price **that maker submitted**; nobody can invent one.

It also cannot be used to pick a favourable print. As soon as a change is
submitted, the maker and the keepers are all trying to settle it, so the
first update that lands wins the race. If the settle refuses (the price
would cross at that mid) and drops the pending record, that is the market
saying the price really did cross at the first print available, not a
chosen one.

## 12. Contract prices are STX per BTC. Every direction flips.

`limit`, `mid`, `clearing` are micro-STX per sat x 1e10 (= STX per BTC x
1e8). In sats per STX:

| In the contract | In sats per STX |
|---|---|
| a bigger number | a cheaper STX |
| `widen-up` | the mid moved **down** |
| `min(a, b)` | `max` of the same two |
| x side (sBTC in) | buying STX |
| y side (STX in) | selling STX |

When a change looks backwards, check the unit before changing the logic.
