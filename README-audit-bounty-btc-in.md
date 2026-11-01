# Audit bounty review: BTC-in adapter + escrow (Oct 2026)

Bounty `mvvu4w6v225cdbaf99bb` on aibtc.com, 5,000 sats. Scope: the deployed
`jing-btc-in-adapter`, `jing-btc-in-escrow` and `smart-buy-sbtc-trait`
(source `contracts/btc-in/`, commit 6adced2). 13 submissions as of
2026-10-31.

Every finding is judged against `jing-btc-in-escrow-v2.clar`, the escrow we
ship next. v1 is not changed. A finding on v1 counts only if it still holds
on v2.

## Submissions and verdicts

| # | Submitter | Finding | Holds on v2 | Rating | Decision |
|---|---|---|---|---|---|
| 1 | Patient Reed (L-1) | `execute` never reads `cancel-height`, so an order nobody cancels stays fillable after its deadline | yes | LOW | **Fixed**, see below. |
| 2 | Patient Reed (I-1) | No running total of parked sats and no sweep: sBTC outside open orders (a direct transfer, a surplus after a fill) is stuck | yes | INFO | **Fixed**, see below. Surplus goes to the user instead of a sweep. |

## 1. Execution deadline

`cancel-height` is set when the order is armed: the arm block plus
`cancel-after-blocks` (default u30, about 5 min). Only `cancel` checked it.
Only a keeper can call `execute`, so this is no third-party attack. But after
a keeper or Lazer outage, our own keeper could fill a stale walk-away order
long after the user's window, at whatever the live price is by then. Once the
deadline passes, a fill and a refund could also race.

Fix: `execute` asserts `stacks-block-height < cancel-height` and fails with
`ERR_EXPIRED` (u4211) otherwise. From `cancel-height` on, the order can only
be refunded.

## 2. Stuck balances: surplus to the user, `parked`, sweeps

Two ways sBTC could end up here outside any order:

- **Surplus after a fill.** If the swap sends back more sBTC than it took
  (held-after > held-before, e.g. a rebate), `spent` was 0 and the user got
  only `net`; the extra stayed here. That surplus came from this order's
  trade, so `execute` now refunds `net - spent + gained` to the user. Reed
  proposed sweeping it; paying the user is better.
- **Direct transfers.** Someone sends sBTC, STX or USDCx straight to the
  contract.

For the second case, a new `parked` var holds the sum of `net` over open
orders: up on arm, down on execute and cancel (`get-parked`). The owner-only
`sweep-sbtc` can only send the balance above `parked` (`ERR_SWEEP_PARKED`,
u4212), so users' sats are never touched. No order holds STX or USDCx between
txs, so `sweep-stx` and `sweep-usdcx` are owner-only with no cap.
