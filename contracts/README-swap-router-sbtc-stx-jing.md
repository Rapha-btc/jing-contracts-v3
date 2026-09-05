# swap-router-sbtc-stx-jing

> **Superseded by `swap-router-sbtc-stx-jing-v2` on `markets-sbtc-stx-jing-v4` (Pyth Lazer).** Pyth Core cannot be verified on Stacks since the Core upgrade, so this router's market cannot settle on mainnet. See `README-markets-v4-lazer.md`.

Retail swap router for the sBTC/STX pair. One transaction, one receipt, four
venues: Jing's maker/taker book (`markets-sbtc-stx-jing-v3`), Bitflow DLMM,
Bitflow XYK, Velar. The router holds no funds and no state: it is called
without `as-contract`, so every venue pulls from the user and pays the user.

Verified on a stxer mainnet fork at today's prices, 165/165 checks green:
**https://stxer.xyz/simulations/mainnet/732ff37cc7f8f595d29a38e3dec2fa09**
(harness `simulations/verify-swap-router-sbtc-stx.js`).

## Entry points

| function | who computes the split | arguments |
|---|---|---|
| `swap-sbtc-for-stx` / `swap-stx-for-sbtc` | the front end, from quotes | `amount jing-amount limit-price vaa fallback amm-amounts amm-mins min-out` |
| `smart-swap-sbtc-for-stx` / `smart-swap-stx-for-sbtc` | the contract, at execution | `amount limit-price vaa min-out` |

### Split swaps

The front end hands one amount per venue: `jing-amount` and
`amm-amounts {dlmm, xyk, velar}`, with a minimum per AMM leg in `amm-mins`.
`amount` must equal the four legs (`u3004`). The book runs first, best
effort: if the market cannot fill it the call is rolled back and the amount
stays in the wallet, or goes to the `fallback` venue when one is given.
Then DLMM, XYK, Velar, each skipped at u0. `vaa` is `none` when
`jing-amount` is u0: no Pyth fee, no Hermes round trip.

### Smart swaps

One number from the user: `limit-price`, the worst price they accept, in the
market's unit (uSTX per sat x 1e10). The split is computed on chain, so
nothing can lag between a quote and the transaction:

1. **Jing.** `refresh-mid` pushes the VAA so Pyth holds the price `swap`
   settles at; `get-taker-capacity` returns how much the book fills in full
   at that mid inside the limit (the opposite side at the mid, less the
   taker's own side which clears pro rata, plus every out-of-range maker
   inside the limit at its own price). The leg is min(amount, capacity).
2. **DLMM.** A walk from the active bin toward the limit, up when selling
   sBTC and down when selling STX, adding per bin the input that empties it
   (the core's own formula, fee grossed up), stopping at the first bin whose
   price breaks the limit or after 30 bins (4.5% of price). Each bin is two
   reads, one of which pulls the core's 16 KB factor table, hence the cap.
3. **XYK and Velar.** Constant product, closed form: the largest input whose
   average price still respects the limit, `cap = (out * k / P - in) / k`
   with `k = 1 - fee`, shaved 20 bps. What is left after DLMM is split pro
   rata to those two capacities.
4. Beyond every capacity the rest stays in the wallet, reported as `unsold`.

Every AMM leg's venue minimum is the limit applied to the leg, less 2 units
of input (`ROUND_SLACK`) so pool floor-rounding cannot trip it. `min-out`
guards the total on the wallet delta, not on what the venues report.

### Receipt

`jing-in/jing-out`, one `in`/`out` pair per AMM, `unsold`, `out` (the
measured wallet gain). On a DLMM partial fill `dlmm-in` is what was sold
and the rest is in `unsold`: a partial fill beats a revert.

## Venues, all called at their engine

| venue | contract | note |
|---|---|---|
| Jing | `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v3` | constant `JING_MARKET`; the read-only getter spells the id out because a call through a constant is not allowed in `define-read-only` |
| DLMM | `SM1FKX…dlmm-swap-router-v-1-2` on `.dlmm-pool-stx-sbtc-v-2-bps-15` | the router has no fee of its own and never calls the aggregator (verified) |
| XYK | `SM1793…xyk-core-v-1-2` on `.xyk-pool-sbtc-stx-v-1-1` | direct, not via `xyk-swap-helper-v-1-3`: the helper routes through `aggregator-core-v-1-1`, which takes 10 bps of the input |
| Velar | `SP20X3…univ2-pool-v1_0_0-0070` + `univ2-fees-v1_0_0-0070` | direct |

No router fee, no aggregator fee. The book leg pays Jing's own fees (10 bps
per leg to the treasury, 20 bps taker rebate to makers); the AMM legs pay
each pool's LP fee.

## Error codes

| code | meaning |
|---|---|
| u3001 | zero amount |
| u3002 | total `min-out` not reached (wallet delta) |
| u3003 | bad fallback venue |
| u3004 | the four legs do not add up to `amount` |
| u3005 | `jing-amount` given without a VAA |
| venue | DLMM u2003, XYK u1019/u1020, Velar u107: that leg's minimum not met |

## What the harness proves

Everything deploys as chavita against the live `jing-core-v3` on a tip fork.
The fork's Pyth storage is stale, so the harness pins the market's storage
reads to today's Pyth mid (BTC $110,000 / STX $0.3710 = 337.29 sats/STX);
the live AMMs trade about 1.6% off that.

- **W1** guards, and a DLMM partial fill on a copy with a one-bin walk.
- **W2/W3** one venue at a time, both directions, `vaa none`.
- **W4** Jing plus DLMM against a resting bid: maker paid net of fee and
  ride, `jing-out` equals the mid fill net of fee.
- **W5** empty book: the book leg rolls back and stays home, or lands on the
  fallback venue.
- **W7** four-leg split, both directions.
- **W8** `get-taker-capacity` matches the same formula in JavaScript to the
  sat; selling exactly `gross-cap` fills in full, two min deposits more is
  refused by the market.
- **W9** smart swaps. **W9f** is the reference scenario: three makers rest in
  Jing, at the mid, 0.5% under (inside the taker's 1% limit) and 2% under
  (outside it). Selling 0.5 BTC: the first two are cleared and paid, the
  third receives nothing and cancels for its full amount, the book leg
  equals the mid plus walk capacity to the sat, DLMM takes its room inside
  the limit, XYK and Velar the spill-over, nothing unsold, every leg's
  achieved price at or above the limit. **W9c** shows the other side: a limit
  no venue can meet moves nothing.

## Known edges

- A maker filled at the mid can be left a few uSTX of rounding dust rolled
  under their name; the market treats it as a resting position and refuses
  their `swap` on that side (`u1024`) until they cancel.
- `clarinet check` cannot load the router: the DLMM v-2 pool is Clarity 6
  and the project pins epoch 3.4. The stxer harness is the router's proof.
