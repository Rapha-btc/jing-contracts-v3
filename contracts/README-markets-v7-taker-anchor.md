# markets-sbtc-stx-jing-v7: submit, then settle

Source only, not deployed, not committed. Comment-free source; the design
lives here.

## The rule

A Pyth print is trusted only in a two-transaction shape. Any action that
needs a price is a **submit** (escrow the money, record the order and the
time of its block, no print) and a **settle** (anyone, later: a print whose
two feed times are both newer than that block, and under 80 seconds old at
the settling block). No action carries a print in the same transaction it
acts in. That is the whole change from v6; the business logic per action
is v6's.

Why: on v6 the caller of every price-dependent call chose the print,
anywhere in an 80-second window, and so held a free option on the mid
(README-stale-print-taker-option). Under submit-then-settle the caller
commits before any price it could act on exists, and settlers race to
bring the first print newer than the commitment: nobody picks the price.

The time compared is each price's own `feed-update-timestamp` (when that
price last changed at Lazer), not the envelope's: a fresh envelope can
carry a price Lazer carried forward. The older of the two feeds is `at`.

## Actions

A submit changes nothing on the book. It escrows money where money is
involved (deposit, swap) and writes one row in `orders`, keyed by
`{who, deposit-x}` (one open order per principal per side): kind, amount,
limit, spread, min-out, `placed-at = stacks-block-time` and
`expiry = placed-at + ttl` (`60 <= ttl <= 600` s). `get-order (who deposit-x)` reads it. Every submit returns `{amount, placed-at,
expiry}`; `expiry = placed-at` means it was booked at once and there is
nothing to settle. Every state change on the book happens at settle.

| kind | submit | at settle, the print's mid decides |
|------|--------|-------------------------------------|
| u0 deposit | `deposit-token-x/y (amount limit spread-bps ttl t)`: money escrowed. When no price is needed (other side empty and the side not full, v6's own test) it **rests at once**, no order row | crossing (would take the other side): **refused**, money back (v6's `u1016`, now a refund); else **rests** (parked money folds in, park rule on a full side) |
| u1 swap | `place-swap (amount limit ttl min-out t deposit-x)`: money escrowed | **fills** as taker: rebate carved out of the amount, batch at mid then walk inside the limit, remainder back (IOC); under `min-out` the settlement reverts (`u1035`) and the order waits |
| u2 set-limit | `set-token-x/y-limit (limit spread-bps ttl)`: records the new limit; the position stays live at its old limit. With the other side empty the row changes at once (no price needed, as v6); a parked-only position with a non-empty other side goes through the gate like a live one, as v6 | crossing: **old limit kept** (v6's `u1016`); else the new limit is written on the row |
| u3 reprice-or-swap | `reprice-or-swap-token-x/y (limit spread-bps ttl min-out)`: same as set-limit (direct with an empty other side, as v6) | crossing: the position leaves the book and **fills** as taker at the new price (rebate carved out of it); else the new limit is written on the row |
| u4 readmit | `readmit-token-x/y (who ttl)`: parked money, anyone may submit | crossing: **stays parked**; full side: `u1010` (never parks anyone, as v6), settle reverts and the order waits; else rests |

```
settle-order  (who deposit-x update tx-trait tx-name ty-trait ty-name)  -> (ok outcome)
refund-order  (who deposit-x tx-trait tx-name ty-trait ty-name)         -> (ok amount)
```

`settle-order` outcomes: `u0` rested, `u1` filled, `u2` refused, `u3`
stays parked. The row is deleted before anything runs, so the first valid
settlement wins and a second attempt is `u1030`. A taker fill runs the v6
swap body as the taker (`who` threaded through; the two `map`-driven
small-share filters read `taker-override`, set for the duration of the
call).

`refund-order` is permissionless once `stacks-block-time > expiry + 80 s`
(so no print `settle-order` would still accept can race it): deposit and
swap kinds get the money back; set-limit, reprice and readmit kinds are
simply dropped, nothing on the book changed at submit. No cancel before
expiry: a submitter that could pull the order while a settler fetches
the print would hold the free option the other way round.

`cancel` and `withdraw` need no price and are v6. `settle-with-refresh`
is the book's own settle (mid moved through resting orders, limit rolls,
dust); it takes any print under 80 seconds old.

## Resting orders carry their own stamp

Every order row (`get-token-x/y-order`) has `placed-at`, the block time of
the submit that put it there (a deposit, set-limit, readmit, reprice). A
settlement publishes its print time in `settle-at`; an order with
`placed-at >= settle-at` is left out of that settlement: the batch rolls
it to the next cycle, the walk skips it. So no resting order is ever
filled at a price from before the block it was written in, whoever brings
the print, and one maker's fresh write never delays anyone else. The
taker's own booking inside a fill carries the taker's anchor (`placed-at`
of the order; `u0` for a crossing reprice), so it is never rolled as too
new.

## What remains

- A settler (the refresh, or anyone settling an order) still chooses
  among prints under 80 seconds old that are newer than the orders it
  touches. For a taker that is at most the time between its block and the
  first settlement (seconds with a live keeper). For zero-spread pegs
  under the refresh it is the 80-second window; `MAX_STALENESS` is the
  knob.
- A settlement that cannot run (other side empty `u1009`, share under
  0.2% `u1020`, full side `u1010`, under `min-out` `u1035`) leaves the
  order open; the keeper retries, then the refund path. The keeper should
  read `get-taker-capacity` before spending a transaction.

## Errors

| code | name | when |
|------|------|------|
| u1029 | ERR_ORDER_OPEN | a submit while the principal already has an open order on that side |
| u1030 | ERR_NO_ORDER | settle or refund with no open order |
| u1031 | ERR_ORDER_EXPIRED | the print is after the order's expiry |
| u1032 | ERR_PRICE_BEFORE_ORDER | the print is not newer than the order's `placed-at` |
| u1033 | ERR_ORDER_LIVE | refund before `expiry + 80 s` |
| u1034 | ERR_BAD_TTL | ttl outside `[60, 600]` |
| u1035 | ERR_MIN_OUT | a fill would pay less than the order's `min-out` (settlement reverts, order stays) |

`u1016 ERR_MUST_USE_SWAP` is no longer raised: a crossing resting submit
is refused at settlement (outcome `u2`).

## Events: jing-core-v6

v7 binds `.jing-core-v6`, core-v5 plus `log-place-order`, `log-settle-order`
(both pause-gated) and `log-refund-order` (not gated, like cancels). Events
only, no equity movement: the escrow is credited at settlement through the
usual deposit log. The market has no `print`. Fills flow through the v6
match, distribute and settlement logs.

## Router: swap-router-sbtc-stx-jing-v6

Bound to v7. The Jing leg is always placed: `place-swap` in the router's
transaction (called without `as-contract`, so the order is the user's and
the fill pays the user), AMM legs in the same transaction. No print enters
the router. New parameters after `limit-price`: `ttl` and, on the split
entries, `jing-min-out` (smart entries derive it from the limit: the whole
book leg at the limit). The router's `min-out` bounds the AMM legs on the
wallet, `jing-min-out` bounds the book leg at its settlement. `u3005` is
`ERR_BAD_TTL`. A refused place (open order already, under the minimum)
behaves like any refused book leg: fallback venue or `unsold`.

## Not done here

- `jing-buy-stx` / `jing-sell-stx` rungs and the ladder templates call
  `deposit-token-x/y` with a print and expect the booking at once; they
  need the submit-then-settle shape (the rung submits, a keeper settles,
  the rung syncs). `vault-sbtc-stx-v6` calls the one-transaction `swap`,
  gone; it places and lets its keeper settle.
- The peg replay harness went with the rungs.

## Size

Comment-free source 108,134 bytes; deploy form (indentation stripped,
`simulations/_deploy-form.mjs <file> [--hash]`) 85,879 bytes. Whitespace
between tokens carries no meaning; the harnesses deploy exactly this form
and its sha512/256 is what `set-verified-contract` holds.

## Deploy order

1. `jing-core-v6`, then `set-verified-contract` for the v7 deploy-form hash.
2. `markets-sbtc-stx-jing-v7`, `initialize` with the v6 feed ids (BTC/USD
   `u1`, STX/USD `u45`); it registers in core-v6.
3. `swap-router-sbtc-stx-jing-v6`.
4. Keeper: subscribe to core-v6 `place-order`, settle each order with the
   first print whose feed times pass its `placed-at`, refetch on `u1032`,
   stop on `u1030`, refund after `expiry + 80`; run `settle-with-refresh`
   when mid moves through the book.

## Verification

stxer mainnet fork, deploying core-v6, v7 and router v6 under the deployer
on top of the deployed ladder and AMMs. Prints come through the faktory-dao
backend when `PYTH_API_KEY` is unset; each print's per-feed times are read
through the decoder's read-only `decode-lazer-payload` (`lazerFeedTimes` in
`_lazer.js`). Makers submit and are settled in a synthetic block 20 s
before the first print (block 0 carries the tip's time, which the harness
cannot control); stxer runs a simulated block with its parent's timestamp.

- `simulations/verify-v7-taker-anchor-lazer.js`: maker submits settled to
  rest; a crossing resting submit refused with the money back; a top-up
  re-stamped; print older than the order refused (`u1032`, including a
  35 s old print inside the 80 s window); print after the order accepted
  at that print's mid; print after expiry refused (`u1031`); no print in
  the window, refund after `expiry + 80` and not before; settlement by the
  keeper, by the taker itself, by a third party; second settlement `u1030`;
  old print reused against a newer order refused; IOC remainder refunded;
  `min-out` refused (`u1035`) then refunded at expiry; ttl bounds; one
  order per side.
- `simulations/verify-v7-router-v6-lazer.js`: router placed legs, refused
  while open, ttl gate, smart placed, both sides, keeper settles all, a
  mixed 30 STX placed + 10 STX XYK split paying only the XYK leg now,
  `jing-min-out` refused at settlement, core-v6 place / settle logs.

Results, 2026-09-16:

| harness | result | stxer |
|---------|--------|-------|
| `verify-v7-taker-anchor-lazer.js` | 86/86 | https://stxer.xyz/simulations/mainnet/a9e8415f07b131b1ab4cb0df6c28fd00 |
| `verify-v7-router-v6-lazer.js` | 39/39 | https://stxer.xyz/simulations/mainnet/182cf8dc727fd6ba58624bfa79e61f5e |

`clarinet check` on a manifest with core-v6, the ladder and v7: clean
(pre-existing `unwrap-panic` warnings only). The router cannot be checked
by clarinet locally (the cached DLMM v-2 pool is Clarity 6, which clarinet
3.23 maps to epoch 4.0, so the requirement never resolves); the fork run is
its check. The taker B (`SP1BP036...`) holds no sBTC on mainnet any more,
so the harnesses fund sats from A.
