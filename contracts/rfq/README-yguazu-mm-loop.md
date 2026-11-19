# yguazu MM loop vaults

Four one-owner, non-custodial vaults, covering both directions on the sBTC/STX and sBTC/USDCx markets:

| Vault suffix | Starting asset | Rung | Proceeds | Buy-back bound |
| --- | --- | --- | --- | --- |
| `sell-stx` | STX | `jing-sell-stx-<bps>-v2` | sBTC | Floor |
| `sell-sbtc` | sBTC | `jing-buy-stx-<bps>-v2` | STX | Cap |
| `sell-usdcx` | USDCx | `jing-buy-sbtc-<bps>-v2` | sBTC | Floor |
| `sell-sbtc-usdcx` | sBTC | `jing-sell-sbtc-<bps>-v2` | USDCx | Cap |

Contract names are `yguazu-mm-loop-<suffix>`. The current targets are `markets-sbtc-stx-jing-v6-5` and `markets-sbtc-usdcx-jing-v6-5` under `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22`.

The ten rungs per side (`-1, -10, -20 ... -90`) are hardcoded constants. Nothing can change that list.

## Loop

1. `sell`: the keeper puts vault funds into a rung. The rung sells them at mid + its spread.
2. `claim`: the vault collects the proceeds. `book-rung` measures what was sold and what came in, and adds both to the inventory.
3. `buy-back`: the proceeds rest on the market as a pegged order, never past the cap (sell-sbtc) or floor (sell-stx).
4. Fills on the market spend the proceeds. `reconcile-inner` closes the same share of the inventory. Below dust, the inventory resets and the next loop starts fresh.

## Active entry and exit

`swap-open` lets the owner exchange the starting asset immediately through the live Jing router. The keeper cannot initiate it. The router is `swap-router-sbtc-stx-jing-v5-6` or `swap-router-sbtc-usdcx-jing-v5-6`, under the market deployer above.

The arguments follow `swap-close`: `amount`, `jing-amount`, `limit-price`, optional Lazer `update`, optional `fallback`, `amm-amounts`, `amm-mins`, and minimum output. Both AMM tuples contain `dlmm`, `xyk`, and `velar`; the split must sum to `amount`. Use raw asset units: sats, uSTX, or uUSDCx. Jing execution needs an update; AMM-only execution can use `none`. Minimum output guards slippage.

The vault reconciles existing inventory before the swap, then books the starting asset spent and proceeds received from its balance deltas. It rejects zero input or zero proceeds and calls `drop-stale-buy-back` after booking. The return tuple reports the actual input/output, and `yg-swap-open` prints those values with the caller, inventory sats, and VWAP. A partial router fill books only the real deltas. STX-pair accounting includes any oracle fee in STX spent or nets it from STX received; USDCx-pair inventory tracks token deltas, with oracle fees paid separately in STX.

The resulting inventory can exit through the usual `buy-back` or `swap-close`. `swap-close` pulls a resting buy-back first, swaps the proceeds through the same router, and reconciles inventory pro rata. Keepers must respect the floor/cap; the owner can close at a loss. `max-oracle-fee` supplies the STX allowance for paid oracle updates.

## Treasury

Deploy all four loops, then `yguazu-treasury.clar`, under the same deployer: the treasury references the loops as relative contract principals. Each loop owner enables it with `set-treasury (some <treasury-principal>)`; `none` revokes access, and `get-treasury` reads the setting.

`to-treasury amount` transfers only the loop's idle starting asset to its configured treasury. Only the loop owner or that treasury contract may call it; keepers and strangers are rejected. It does not change inventory, orders, or configuration. With no treasury set, it returns `ERR_NO_TREASURY` (`u8213` on floor-side loops, `u8113` on cap-side loops).

| Loop ID | Loop | Starting asset / asset ID |
| --- | --- | --- |
| `u0` | `sell-stx` | STX / `u0` |
| `u1` | `sell-sbtc` | sBTC / `u1` |
| `u2` | `sell-usdcx` | USDCx / `u2` |
| `u3` | `sell-sbtc-usdcx` | sBTC / `u1` |

All treasury operations require its owner:

- `pull id amount`: call the loop's `to-treasury` as the treasury contract.
- `push id amount`: transfer the loop's starting asset from treasury to that loop.
- `move from to amount`: pull and push the same asset atomically; supports `u1` ↔ `u3`. Different assets return `ERR_NOT_SAME_ASSET` (`u8307`).
- `swap kind ...`: swap treasury balances using the manual router arguments above. Kinds are `u0` sBTC→STX, `u1` STX→sBTC, `u2` sBTC→USDCx, and `u3` USDCx→sBTC. Returns the output balance delta.
- `rebalance from to ...`: pull, swap one hop, then push all output to the destination loop. Supports sBTC↔STX and sBTC↔USDCx. STX↔USDCx returns `ERR_NO_ROUTE` (`u8308`); use separate pull, two swaps, and push calls for that route.
- `withdraw asset amount`: transfer only to the current treasury owner; there is no arbitrary recipient argument.
- `set-max-oracle-fee fee`: configure its STX oracle allowance.
- `propose-owner (some principal)` and `accept-owner`: two-step handover. A proposal grants no authority before acceptance, and `propose-owner none` cancels it. Acceptance clears the nomination and removes the old owner's authority.

## Inventory (`inv-sats`, `inv-stx` / `inv-usdcx`)

They exist to compute the most the buy-back may pay, so it never buys back at a loss.

- `vwap-sell = floor(inv-quote * 1e10 / inv-sats)`, where quote is STX or USDCx. The cap is `floor(vwap-sell * (10000 - edge) / 10000)`. The floor rounds up once from raw inventory: `ceil(inv-quote * 1e10 * (10000 + edge) / (inv-sats * 10000))`. `edge-bps` is owner-set, default 25.
- Rung payouts and `swap-open` add the real amounts of each sale, so several sales at different prices blend into one average.
- `reconcile-inner` removes the same share of both as the proceeds are spent, so the average of what is left stays its real sell price.
- An owner deposit never changes them. Example (sell-sbtc): the owner deposits sBTC, the keeper puts it in a rung, and only when a taker fills it and the vault claims do they go up, by the sats sold and the STX received. An active entry through `swap-open` books its own balance deltas immediately. Inventory goes down when proceeds are spent (buy-back fills, `swap-close`, or owner withdraws).
- `reconcile-inner` rounds the share it closes down, so a tiny fill can close 0 of the other side (bounty finding, Info). This does not need fixing: it can only make the cap slightly stricter (sell-sbtc) or the floor slightly higher (sell-stx), never looser, so the vault does not lose money.
- They are bookkeeping, not funds held. What the buy-back really gets lands in the vault balance. Getting more than was sold is the profit.

## Fresh vs spent

- **Fresh**: proceeds arriving from a rung (a `claim`, or a rung deposit or withdraw that pays out earlier fills) or from `swap-open`.
- **Spent**: proceeds that left through buy-back fills, `swap-close`, or owner withdraws.

`reconcile-inner` runs **before** every rung call and `swap-open`. Once fresh proceeds land in the balance, they would hide what was spent, and that part of the inventory would never be closed.

## Booking rule

`book-rung` adds to inventory only when both sides moved: proceeds arrived **and** sats (or STX) left the rung. One side alone is not a sale: rounding dust from a pooled rung's shares, or a donation sent straight to a rung (the rung counts any balance gain as proceeds). That amount stays in the vault as untracked extra, which `reconcile-inner` ignores and the owner can withdraw.

Accepted (bounty finding, Low): a gift that reaches the rung before a real fill is paid out in the same claim and booked with that sale. The average sell price then looks higher than it was (cap up on sell-sbtc, floor down on sell-stx). The vault is never poorer: the gift is in its balance, so the round trip still gets back at least what it sold. What matters is that the vault does not lose money, and it does not, so this does not need fixing. (Telling a gift from a fill would also need a market price inside `book-rung`, and a stale price would skip real sales.)

## Dust reset

When less than the dust limit is left (1 STX on sell-sbtc, 1,000 sats on sell-stx), the inventory resets to 0. The dust can still rest on the market at its old limit, and `reprice` now returns no inventory (u8108 / u8208). This does not need fixing: if the dust fills, that is fine, and if it fills after a new loop started, the books close the same share of both sides, so the average and the cap do not change. At most the dust ends up untracked in the vault balance, which the owner can withdraw. The vault does not lose money. The keeper may call `cancel-buy-back` when it sees `yg-inventory-reset` to take the dust back.

## Stale buy-back

A new sale can move the cap down (sell-sbtc) or the floor up (sell-stx) while a buy-back already rests on the market. The market keeps the order's old limit. Example: sell 1 sat for 2 STX, bid at cap 2; sell 1 more sat for 1 STX, cap is now 1.5; the bid still fills at up to 2, and the books then close more sats than were really bought back.

The market can hold three limits for the vault's order. Any of them can become the one it enforces:

- **live**: the limit of the order on the book now.
- **pending**: the limit of a deposit not yet on the book. It applies when anyone settles that deposit.
- **queued**: a `reprice` the market has not applied yet. It applies when anyone settles it with a newer price.

So `reprice` cannot fix it: a pending order refuses it (u1005), and a live one only queues it.

The fix, in short: when a sale moves the cap down (or the floor up), cancel the order and re-deposit it at the new price.

- It runs in `book-rung` and `swap-open`, in the same transaction that books the sale: if the vault has an order on the market and any of the three limits is past the new cap or floor, it cancels the order. So there is never a moment where the books are blended and the old limit is still live.
- The cancel removes the old limit everywhere, so nothing can fill at the old, dirty price. The keeper re-posts at the new, clean price with `buy-back`. Until that re-post settles there is no order, which is safe.
- Settling instead of cancelling would not work: a queued limit only applies with a price signed after it was queued, so in a later block, and the order could fill at the old limit before then.
- When a sale moves the cap up (or the floor down), nothing is cancelled. The old order is only stricter than it needs to be, which is safe; the keeper can `reprice` to loosen it and wait for the settle.
- A failed cancel is printed (`yg-stale-buy-back-cancel`, `cancelled: false`) and never blocks booking the sale.
- `reprice` returns `(ok cap)` even when the market only queued the change; the `yg-reprice` event's `applied-now` says which. This does not need fixing: a cap that drops is handled by the cancel above, so a queued `reprice` only waits to loosen the price, and until then the order keeps the stricter one.

It happens in normal looping: each time a sale is booked while an order rests and the new sale is cheaper than the average (sell-sbtc) or dearer (sell-stx), so roughly whenever the mid drifts against the order between two sales.

## Fees

On v6-4 each side pays a 10 bps fee on what it receives, and the taker funds a rebate (20 bps, up to 70 when the oracle is stale) paid to the resting maker. When both vault legs rest, each nets about +10 bps. Active router entries/exits have different execution costs and do not assume that maker rebate. A loop at 25 bps edge measured about 53 bps on the stxer fork. `edge-bps` 0 is allowed on purpose: the two resting legs still net about +20 bps, so no lower bound is needed.

## Tests

### Mainnet fork verification — 2026-11-18

All five harnesses passed against the local source contracts deployed on stxer mainnet forks. No contract bugs were found in these scenarios. Historical results below refer to earlier versions and fixtures.

| Harness | Total checks | SO swap-open checks | stxer run |
| --- | --- | --- | --- |
| `sell-stx` | 656/656 | 63/63 | [Run](https://stxer.xyz/simulations/mainnet/e8f5979c28ed443f6705aff76a3d2b78) |
| `sell-sbtc` | 663/663 | 64/64 | [Run](https://stxer.xyz/simulations/mainnet/41b4f0a8d372c04889c2229d0995306d) |
| `sell-usdcx` | 733/733 | 64/64 | [Run](https://stxer.xyz/simulations/mainnet/b92af8e095ba3f3d41b5106b7ffea0a2) |
| `sell-sbtc-usdcx` | 755/755 | 64/64 | [Run](https://stxer.xyz/simulations/mainnet/1caf2d48e27d492c4ed758a7dca0df8a) |
| Treasury | 290/290 | — | [Run](https://stxer.xyz/simulations/mainnet/ca43fc98e91cc507eaac1fb894924a91) |

Run from the repository root:

```sh
node simulations/verify-yguazu-mm-loop-sell-stx.js
node simulations/verify-yguazu-mm-loop-sell-sbtc.js
node simulations/verify-yguazu-mm-loop-sell-usdcx.js
node simulations/verify-yguazu-mm-loop-sell-sbtc-usdcx.js
node simulations/verify-yguazu-treasury.js
```

- `_yg-loop-engine.js` and `_yg-loop-usdcx-engine.js` share `_yg-swap-open.js` (SO) and `_yg-swap-close.js` (SC). SO runs before SC changes AMM prices and K advances the fork clock. It checks owner/keeper/stranger access, zero input, min-out rollback, exact inventory/VWAP/floor-or-cap math from balance deltas, stale buy-back cancellation, and exits through both buy-back fills and swap-close.
- SO exercises the live Jing leg and AMM legs (Bitflow XYK for STX, DLMM for USDCx). Paid-oracle tests assert atomic rejection at zero and insufficient allowance, successful execution at the exact allowance, and receipt of exactly 1,000 uSTX by the oracle fee recipient.
- `_yg-oracle-fee.js` supports the current `SPA105SQJJSN4YCZXR9F1C6GYQE8DRZ95WNY5HZF.pyth-lazer-gov` shim. It verifies known live multisig members, impersonates a quorum on the fork to approve an untimelocked fee proposal, and verifies the resulting fee. SO restores the prior fee; K restores zero. This replaces the old K fixture's skipped paid-fee checks after the original oracle deployer relinquished governance. No mainnet transactions are submitted.
- `verify-yguazu-treasury.js` deploys all five contracts under one deployer and creates nonzero inventory in every loop. It measures all three asset balances across all loops, treasury, and recipient wallets. Coverage includes missing/revoked treasury, owner and treasury callers, keeper/stranger rejection, inventory/state preservation, pull/push for every loop, both same-asset moves, all four rebalance and swap directions, route and min-out failures with rollback, owner-only withdrawals, and nomination/cancellation/acceptance of ownership.

Counts can vary with live order-book setup and execution branches. JavaScript syntax checks and `git diff --check` also passed for this revision.

### Earlier verification

- stxer mainnet fork: `simulations/verify-yguazu-mm-loop-sell-sbtc.js` and `-sell-stx.js` (shared engine `_yg-loop-engine.js`).
  - 2026-10-22, deploy bytes (d015036, comment-stripped + `clarinet format`, as in the fakdao BE templates):
    - sell-sbtc 464/464: https://stxer.xyz/simulations/mainnet/e5ad0d378659741e30aa3bb83a0be8d5
    - sell-stx 267/268: https://stxer.xyz/simulations/mainnet/6b1ffdbc13c39930e0e55a4a2d4b2155. The one failure is a fixture precondition, not the contract: group J needs a `jing-sell-stx` rung where the vault is the only member, and on mainnet every rung except `-1` now has one other member. So group J did not run for sell-stx.
  - 91665cf (before the stale buy-back cancel b03d312): sell-sbtc 425/425, sell-stx 431/431.
    - sell-sbtc: https://stxer.xyz/simulations/mainnet/8214d90bac74b65f669e3c4def291be5
    - sell-stx: https://stxer.xyz/simulations/mainnet/c314e9810291df1301345574c4c60881
  - Donations (group F2): proceeds sent straight to a rung reach the vault at claim but stay out of inventory; the owner withdraws them exactly.
  - No real sale dropped (group J): after a taker fill, the first vault call (sell, claim, partial or full rung-withdraw, rung epoch roll) always receives the proceeds in the same call that sees the sats leave, because the rung's sync pays out as it lowers the position. Booked inventory equals the sum of real fills to the unit.
  - Covers all 10 rungs per side, bad rungs, auth (owner / keeper / stranger, pause), edge-bps, both legs with measured fee and rebate, partial fills, reconcile and dust reset, rung epoch rollover, owner exits, two-step ownership, and hostile-contract allowance checks.
- Audit bounty (7,000 sats, closes 2026-10-29): https://aibtc.com/bounties, id `mviz88od905e87317769`.
- Clarinet SDK: `tests/unit/mm-loop-sell-sbtc.test.ts` (16/16) and `-sell-stx.test.ts` (18/18), 100% branch coverage, see `tests/unit/mm-loop-sell-COVERAGE.md`.
- Rendezvous: `tests/rv/mm-loop-sell/`, 500 invariant + 500 property runs per contract.

## Next iteration (ideas from the first live run)

First live run, sell-stx vault, 2026-10-22 23:20 UTC to 2026-10-24: 2,000 STX in, +49.15 STX realized over 10 closed loops (9 market buy-back fills during the STX dip from ~400 to ~385 sats/STX, 1 manual owner loop +2.04 STX), checked against on-chain balances. Live view: jingswap.com/loop.

### 1. Rest as a fixed limit when the peg is off

Today the buy-back is a pegged order (mid +/- spread, capped by the floor). `pegged-ask` / `pegged-bid` in markets-sbtc-stx-jing-v6-4 recompute its price from the current Pyth mid on every fill; when that price is past the floor the market returns MAX_UINT / u0, so the order is switched off: it does not quote and no taker can reach it, even one walking the book with slippage.

Improvement: while the peg would be off, the vault holds the same sats as a plain limit order at the floor (no spread). A taker who walks the book can then fill it, and every such fill is at or better than the floor, so it is still a profitable close. When the mid comes back inside the floor, the vault switches back to the pegged order (better price, earns the maker rebate).

Where: in the vault, not the market (v6-4 is deployed). The vault (or the keeper, through a new vault entry point) chooses between `set-token-x-limit` with `(some spread-bps)` (pegged) and with `none` at the floor (fixed), based on mid vs floor. Needs a new vault version and a funds migration; test on the stxer fork that a walking taker fills the fixed limit at the floor and never below it, and that the switch back to pegged keeps the booked inventory exact.

### 2. Run both directions together

The sell-stx loop earns when STX dips after it sells (buy-back fills under the floor); in a steady STX rise its buy-back stays off and the vault waits in sBTC. The sell-sbtc loop is the mirror: it earns when STX bounces after it buys. Running both is two-sided market making: each profits from the oscillation, and together they hedge a trend in either direction. Track realized PnL per vault and combined.

### 3. Keeper and ops lessons

- Self-settle (keeper 74df208): the keeper settles every pending order it creates right after the sell / buy-back confirms, plus a backstop each pass. Before this, a rung deposit sat pending 13.5 h because the backend cron only reads the latest 50 jing-core events and arb txs pushed the print out of that window (the SL fast trigger has been silent since 2026-10-19).
- Self-push (keeper 1b9b372): a rung's deposit falls back to `held-ustx` when the market already has a pending deposit for it; 1,515 STX sat idle that way. The keeper now calls the rung's permissionless `push` whenever a rung holds STX and has nothing pending, then settles it.
- Owner tools on jingswap.com/loop: claim now, post buy-back, sell idle STX, buy back now (claim, withdraw, router swap, send STX back), settle now, push to market, ask-the-keeper signals.
