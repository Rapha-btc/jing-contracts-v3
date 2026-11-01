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
