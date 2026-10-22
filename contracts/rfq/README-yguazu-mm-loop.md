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

## Booking rule

`book-rung` adds to inventory only when both sides moved: proceeds arrived **and** sats (or STX) left the rung. One side alone is not a sale: rounding dust from a pooled rung's shares, or a donation sent straight to a rung (the rung counts any balance gain as proceeds). That amount stays in the vault as untracked extra, which `reconcile-inner` ignores and the owner can withdraw.

## Stale buy-back

A new sale can move the cap down (sell-sbtc) or the floor up (sell-stx) while a buy-back already rests on the market. The market keeps the order's old limit. Example: sell 1 sat for 2 STX, bid at cap 2; sell 1 more sat for 1 STX, cap is now 1.5; the bid still fills at up to 2, and the books then close more sats than were really bought back.

The market can hold three limits for the vault's order. Any of them can become the one it enforces:

- **live**: the limit of the order on the book now.
- **pending**: the limit of a deposit not yet on the book. It applies when anyone settles that deposit.
- **queued**: a `reprice` the market has not applied yet. It applies when anyone settles it with a newer price.

So `reprice` cannot fix it: a pending order refuses it (u1005), and a live one only queues it.

The fix, in short: when a sale moves the cap down (or the floor up), cancel the order and re-deposit it at the new price.

- It runs in `book-rung`, in the same transaction that books the sale: if the vault has an order on the market and any of the three limits is past the new cap or floor, it cancels the order. So there is never a moment where the books are blended and the old limit is still live.
- The cancel removes the old limit everywhere, so nothing can fill at the old, dirty price. The keeper re-posts at the new, clean price with `buy-back`. Until that re-post settles there is no order, which is safe.
- Settling instead of cancelling would not work: a queued limit only applies with a price signed after it was queued, so in a later block, and the order could fill at the old limit before then.
- When a sale moves the cap up (or the floor down), nothing is cancelled. The old order is only stricter than it needs to be, which is safe; the keeper can `reprice` to loosen it and wait for the settle.
- A failed cancel is printed (`yg-stale-buy-back-cancel`, `cancelled: false`) and never blocks booking the sale.

It happens in normal looping: each time a sale is booked while an order rests and the new sale is cheaper than the average (sell-sbtc) or dearer (sell-stx), so roughly whenever the mid drifts against the order between two sales.

## Fees

On v6-4 each side pays a 10 bps fee on what it receives, and the taker funds a rebate (20 bps, up to 70 when the oracle is stale) paid to the resting maker. Both vault legs rest, so each nets about +10 bps. A loop at 25 bps edge measured about 53 bps on the stxer fork.

## Tests

- stxer mainnet fork: `simulations/verify-yguazu-mm-loop-sell-sbtc.js` and `-sell-stx.js` (shared engine `_yg-loop-engine.js`). Latest run on 91665cf: sell-sbtc 425/425, sell-stx 431/431.
  - sell-sbtc: https://stxer.xyz/simulations/mainnet/8214d90bac74b65f669e3c4def291be5
  - sell-stx: https://stxer.xyz/simulations/mainnet/c314e9810291df1301345574c4c60881
  - Donations (group F2): proceeds sent straight to a rung reach the vault at claim but stay out of inventory; the owner withdraws them exactly.
  - No real sale dropped (group J): after a taker fill, the first vault call (sell, claim, partial or full rung-withdraw, rung epoch roll) always receives the proceeds in the same call that sees the sats leave, because the rung's sync pays out as it lowers the position. Booked inventory equals the sum of real fills to the unit.
  - Covers all 10 rungs per side, bad rungs, auth (owner / keeper / stranger, pause), edge-bps, both legs with measured fee and rebate, partial fills, reconcile and dust reset, rung epoch rollover, owner exits, two-step ownership, and hostile-contract allowance checks.
- Audit bounty (7,000 sats, closes 2026-10-29): https://aibtc.com/bounties, id `mviz88od905e87317769`.
- Clarinet SDK: `tests/unit/mm-loop-sell-sbtc.test.ts` (16/16) and `-sell-stx.test.ts` (18/18), 100% branch coverage, see `tests/unit/mm-loop-sell-COVERAGE.md`.
- Rendezvous: `tests/rv/mm-loop-sell/`, 500 invariant + 500 property runs per contract.
