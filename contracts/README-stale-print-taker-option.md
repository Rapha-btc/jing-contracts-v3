# Jing v6: the 80-second print window

We want opinions. Short version of the mechanism, who it costs, and the
choice.

## How a Jing swap prices today (v6)

A taker sends one transaction: the amount, a limit, and a signed Pyth Lazer
update (the "print"). The market settles at that print's mid and walks the
resting book. The only rule on the print: published within the last 80
seconds.

Makers rest two kinds of orders:

- Fixed: "sell at 100". Filled at 100 or better, whatever the print says.
  The maker sets the price.
- Pegged: "sell at mid + 20 bps, but never under my floor". The price is
  computed from the print at settlement. The floor is a sanity bound, set
  wide (5 to 10 percent from mid), so it rarely switches the peg off.

## What the window means

The taker chooses the print. A taker that watches the market can wait for
a move and then swap with the print from before the move, as long as it is
under 80 seconds old.

Example. Mid is 100. A peg rests at mid + 20 bps. The market jumps to 101
within a minute. A bot sends a swap carrying the print from 70 seconds
ago: the market settles at 100, the peg sells at 100.20, the bot sells at
101 elsewhere. The floor at 95 never fired.

A fixed order is exposed less, not zero. Out of range it is walked at its
own price, whatever the print says. In range (in the money) it clears in
the batch at the print's mid: a fixed ask at 100 with the market at 103
clears at 101 if the bot brings the print from when mid was 101, where a
fresh print would have paid 103. The limit itself is never breached; the
price improvement above it is what the stale print shaves. Pegs are
exposed on the whole fill, because their price is the print's number.

## Ways to misuse the window

Every print the market accepts is chosen by the caller, so:

1. Taker lookback. Swap with the best print of the last 80 seconds. Pegs
   pay on the whole fill; in-the-money fixed orders lose the improvement
   above their limit.
2. Rebate dodge. Deposit under a print where your order sits just out of
   range: the gate lets you rest and you never pay the 20 bps taker rebate.
   Then call `settle-with-refresh` with another print inside the window
   where mid has moved through you: you clear at mid, rebate-free, with the
   same lookback.
3. Reprice into a swap. A resting maker calls `reprice-or-swap` across the
   mid with a stale print: a taker fill through a maker door.
4. Settler picks the batch mid. Whoever calls `settle-with-refresh` picks
   the mid every in-range order clears at (zero-spread pegs, in-the-money
   fixed), within the window.

v7 closes all four: no action carries a print in the transaction it acts
in. Every price-dependent action is submitted first and settled later by
anyone with a print newer than the submit's block, and every resting order
carries that stamp, so no order, resting or taking, is ever filled at a
price from before the block it was written in.

## Who it costs, and how much

For the bot to bother it needs a move inside 80 seconds bigger than the
peg spread plus the taker's 30 bps of fee and rebate plus its own hedge
cost.

- Hedging on Bitflow (about 50 bps fee): needs a move of about 1 percent
  inside 80 seconds. Rare.
- Hedging on a CEX (10 to 40 bps): needs about 50 bps. A few times a day
  on STX. The bot takes the full depth of the tight rungs each time.

So a peg is a passive "fill me at mid" tool, and the window is its price:
on some fast moves you are filled at the mid from a minute ago. For a
treasury converting one side to the other that is the cost of not running
a keeper, and it beats paying 50 bps on every clip on an AMM. It is a
problem only for a maker who wants the spread itself: a CEX-hedged market
maker, or anyone who wants rungs tighter than the window is worth (10 to
15 bps on STX).

That maker has an answer today: rest fixed rungs. Fixed rungs never fill
under the maker's own price; what they can lose to a stale print is the
improvement above it when mid runs through them. Repricing them is the
maker's job (a keeper per maker, one transaction per move), which is
exactly what pegs were built to avoid.

## The two-step fix (v7, source only)

A print is trusted only in a two-transaction shape. Every action that
needs a price (a taker swap, a resting deposit, set-limit, readmit,
reprice) is a submit (escrow, record the order and the time of its block,
no print) and a settle (anyone, later: a print whose two feed times are
newer than that block and under 80 seconds old). At settle the mid decides
what v6 decided at submit: a taker fills (limit per unit, min-out in
total, remainder back), a crossing resting order is refused and the money
returned, a resting order rests. No print from before the order is ever
executable, and every resting order carries its own stamp, so a
settlement fills only orders older than its print. No cancel before
expiry (60 to 600 s); refund after.

What it buys: pegs with no window, so pegs can go tight and a CEX-hedged
maker can rest pegs instead of fixed rungs.

What it costs: one extra settle transaction per price-dependent action,
by the keeper (or anyone), landing once a print newer than the submit
exists, in practice the next block. The router stays one transaction: the
AMM legs and the placing of the book leg run together, and only the book
fill lands later, paid to the user by the market. The AMM legs are bounded
by the router's min-out now, the book leg by the order's own min-out at
settlement.

A narrower version keeps atomic swaps against fixed orders as on v6 and
requires the fresh print only for fills that touch a peg. More branches,
no product change for retail.

## Questions

1. Is "peg = at mid as of the last 80 seconds, fixed rungs if you want a
   floor on your price" a good enough offer for makers, stated plainly?
2. Is a CEX-hedged maker resting pegs a case we need now, or later?
3. If later: is one extra block for the book fill (AMM legs still paid in
   the same transaction) an acceptable price when it comes?
