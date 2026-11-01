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
| 2 | Patient Reed (I-1) | No running total of parked sats and no sweep: sBTC outside open orders (a direct transfer, a surplus after a fill) is stuck | yes | INFO | **Fixed**, see below: `parked` + owner sweeps. The execute surplus cannot happen. |
| 3 | Patient Reed (I-2) | The arm fee is kept on a refund; pause blocks execute but not cancel, so a pause refunds every open order minus its fee | yes | INFO | No change. Works as intended: the fee pays the bridge, the sponsored arm, and the cancel tx we sponsor. |
| 4 | Solid Gear (High), Super Orb (High) | `execute` catches a router err with `match`, so legs that already moved funds (e.g. a min-out miss, u3002) keep their effects: the user's sats are gone and the bought STX/USDCx is stranded | no | — | **Rejected**, see below. Refuted by Frosty Narwhal (mainnet fork) and Frosty Sparrow (VM harness). |
| 5 | Solid Gear (Low) | The ladder relay has no `contract-caller` gate, so the adapter fee is optional on that path | yes | — | **Rejected**, by design. A user who already holds sBTC can deposit to the ladder directly instead of going through BTC-in; they skip our fee because they don't use our bridge or sponsored tx. |
| 6 | Rugged Tiger (Low), Violet Reed (Info) | Adapter `smart-buy-with-sbtc` takes the fee before the approved-targets check, so an unapproved target burns the fee | no | — | **Rejected**. The failed assert reverts the whole tx, fee transfer included; only gas is spent. |
| 7 | Super Orb (Low) | The `btc-in-executed` print says `ok: false, out: 0` while funds moved | no | — | **Rejected**: rests on #4. A router err moves nothing, so the print is accurate. |
| 8 | Super Orb (Info) | `fee-recipient` / `max-fee-sats` are read when the arm lands, not pinned at signing | yes | INFO | No change. The user signs `fee-sats` itself; `max-fee-sats` is only a ceiling on it and `fee-recipient` is ours. |
| 9 | Super Orb (Info), Synced Puma (L-3) | `cancel` is permissionless, so anyone can force a refund at `cancel-height`, racing the keeper | no | — | **Rejected**, by design (walk-away refund without a new signature). Since #1, `execute` stops at `cancel-height`, so there is no race. |
| 10 | Ionic Zephyr (Info) | `execute` returns `(ok ...)` with inner `ok: false` on a router err | yes | INFO | No change, by design: the err is caught so the order can be refunded in the same call. Integrators read the inner `ok` / `code`. |
| 11 | Valiant Sable (Low) | The executed print publishes a keeper-supplied `mid` and `limit-price` as market data | no | — | **Fixed in v2 already**: `mid` comes from `refresh-mid` on the verified Lazer update, not a keeper argument. |
| 12 | Recursive Relay (N-1, Low) | A contract registered as keeper becomes a confused-deputy proxy | yes | INFO | No change. Keepers are set by the owner; listing a contract that others can drive is an operator error, and payouts still go only to `order.user`. |
| 13 | Recursive Relay (N-3, Info) | Adapter `smart-buy-with-sbtc` returns the target's self-reported tuple | yes | INFO | No change. Targets must be owner-approved, and the tuple is informational; the user's protection is the target's own min-out. |
| 14 | Synced Puma (M/L-1) | `execute` pays the router-reported `out` without measuring the escrow's STX/USDCx delta, so stray balances could be paid out | no | — | **Rejected**. The bound routers compute `out` as the caller's (the escrow's) measured balance gain, so it is a delta, not a claim. |
| 15 | Synced Puma (Info) | `mid` overflow in `limit-price` | no | — | **Rejected**. `mid * 10000` is far below u128 for any real price. |
| 16 | Rugged Tiger (Info) | No cap on total parked sBTC | yes | INFO | No change. |
| 17 | Frosty Sparrow, Violet Reed, Iron Hub, Light Leopard | No new findings (Light Leopard: no content) | — | — | Nothing to decide. |
| 18 | Recursive Relay (N-2, Low), Ionic Zephyr (Low) | The presigned arm has no expiry: the sponsor holding it chooses when it lands. Also `cancel-after-blocks` is read when the arm lands, so the owner can change it after the user signed | yes | LOW | **Fixed** (arm expiry), see below. The `cancel-after-blocks` part: no change. |

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

## 2. Stuck balances: `parked` and sweeps

Reed names two ways sBTC could end up here outside any order.

- **Surplus after a fill** (held-after > held-before). This cannot happen
  with the routers v2 binds as constants. The Jing book leg only returns part
  of what it was sent (rolled sats plus the rebate), and the router computes
  `spent = amount - rolled - rebate-refunded`
  (`swap-router-sbtc-stx-jing-v5-5.clar:192`, the same in the USDCx router):
  if the market returned more than it took, that subtraction would underflow
  and abort the whole tx. The pool legs only take sBTC in. So the escrow
  always ends with less sBTC than it started with, and no change is needed.
  Reed's own fork run (P4) agrees: the balance returns to exactly its pre-test
  value after fills.
- **Direct transfers** (reproduced by Reed: 1,000 donated sats are stuck).
  Someone sends sBTC, STX or USDCx straight to the contract.

Fix for direct transfers: a new `parked` var holds the sum of `net` over open
orders. It goes up on arm and down on execute and cancel (`get-parked`). The
owner-only `sweep-sbtc` can only send the balance above `parked`
(`ERR_SWEEP_PARKED`, u4212), so users' sats are never touched. No order holds
STX or USDCx between txs, so `sweep-stx` and `sweep-usdcx` are owner-only
with no cap.

## 4. Router err "does not unwind" (rejected)

The claim: Clarity error values do not roll back state, so when the router
returns an err after its legs ran, the escrow's `match` turns it into
`ok: false` while the sats stay sold and the output stays in the escrow.

This is wrong. A `contract-call?` to a public function that returns `(err ...)`
discards every state change that call made, including its transfers; the
caller only sees the err value. So a router err means nothing moved:
held-after equals held-before, `spent` is 0, and the user is refunded the whole
`net`. Frosty Narwhal reproduced this on a mainnet fork with the live router
(book fills, min-out 10^15: `(ok {code: u3002, spent: u0, refund: u20000})`,
escrow at 0 STX and 0 sBTC), and Frosty Sparrow got the same with mock
routers that move funds then return u3002.

`parked` is unaffected: `execute` always subtracts the full `net`, since the
order's sats either left in the swap or were refunded.

## 18. Arm expiry

The user signs the arm before sending BTC, and the keeper sponsors and
broadcasts it once the bridge lands. Nothing in the signed tx bounded when
that could happen. Both arm entry points now take `arm-by`, a Stacks block
height the user signs; `arm` fails with `ERR_ARM_LATE` (u4213) at or after
it. The bridge takes 10-30+ min and cannot be timed exactly, so the FE sets
`arm-by` generously (a few hours past signing).

Not changed: `cancel-after-blocks` is global and read when the arm lands, so
the owner could change it between signing and landing. It is capped at u360
(about 1 h), the same for every order, and slippage is measured from the
live verified mid at execute, so a longer window does not widen the price the
user accepts.
