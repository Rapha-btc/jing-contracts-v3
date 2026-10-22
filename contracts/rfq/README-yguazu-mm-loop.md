# yguazu MM loop vaults

Two one-owner, non-custodial vaults, one per direction:

- `yguazu-mm-loop-sell-sbtc.clar`: sell sBTC into a `jing-buy-stx-<bps>` rung, claim the STX, buy sBTC back with a pegged bid on `markets-sbtc-stx-jing-v6-4`.
- `yguazu-mm-loop-sell-stx.clar`: the mirror. Sell STX into a `jing-sell-stx-<bps>` rung, claim the sBTC, buy STX back with a pegged ask.

The ten rungs per side (`-1, -10, -20 ... -90`) are hardcoded constants. Nothing can change that list.

## Loop

1. `sell`: the keeper puts vault funds into a rung. The rung sells them at mid + its spread.
2. `claim`: the vault collects the proceeds. `book-rung` measures what was sold and what came in, and adds both to the inventory.
3. `buy-back`: the proceeds rest on the market as a pegged order, never past the cap (sell-sbtc) or floor (sell-stx).
4. Fills on the market spend the proceeds. `reconcile-inner` closes the same share of the inventory. Below dust, the inventory resets and the next loop starts fresh.

## Inventory (`inv-sats`, `inv-stx`)

They exist to compute the most the buy-back may pay, so it never buys back at a loss.

- Only their ratio matters: `vwap-sell = inv-stx * 1e10 / inv-sats`. The cap or floor is that price with the edge (`edge-bps`, owner-set, default 25) applied.
- `claim` adds the real amounts of each sale, so several sales at different prices blend into one average.
- `reconcile-inner` removes the same share of both as the proceeds are spent, so the average of what is left stays its real sell price.
- They are bookkeeping, not funds held. What the buy-back really gets lands in the vault balance. Getting more than was sold is the profit.

## Fresh vs spent

- **Fresh**: proceeds arriving from a rung (a `claim`, or a rung deposit or withdraw that pays out earlier fills).
- **Spent**: proceeds that left through buy-back fills or owner withdraws.

`reconcile-inner` runs **before** every rung call. Once fresh proceeds land in the balance, they would hide what was spent, and that part of the inventory would never be closed.

## Fees

On v6-4 each side pays a 10 bps fee on what it receives, and the taker funds a rebate (20 bps, up to 70 when the oracle is stale) paid to the resting maker. Both vault legs rest, so each nets about +10 bps. A loop at 25 bps edge measured about 53 bps on the stxer fork.

## Tests

- stxer mainnet fork: `simulations/verify-yguazu-mm-loop-sell-sbtc.js` and `-sell-stx.js` (shared engine `_yg-loop-engine.js`).
- Clarinet SDK: `tests/unit/mm-loop-sell-sbtc.test.ts` and `-sell-stx.test.ts`.
