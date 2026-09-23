# Rung escrow recovery after 24 hours

The six `jing-{buy,sell}-stx{,-market-spread,-core-spread}` contracts now
cancel their market position during a member withdrawal when their pending
deposit is at least 86,400 seconds old. Cancellation returns pending, live,
and parked funds; the rung adds the returned amount to held funds and then
uses the existing synchronization and shareholder payout logic.

Younger pending deposits still use `settle-token-*-deposit`. Their update and
pause requirements are unchanged. `settle-escrow` is private and called only
by `withdraw`, after checking that the caller has a member position.

## Run

```sh
node simulations/verify-v6-rungs-escrow-timeout.js
node simulations/verify-v6-3-caller-impact.js
```

Both scripts exit nonzero on a failed check and print `N/M checks green`.
They deploy the actual working-tree core-v6, ladder-v1, market v6-3, and rung
sources into stxer forks. They do not broadcast transactions to mainnet.

## Coverage

The timeout harness runs all six rung variants in each of three independent
fixtures: missing update, market pause, and core-v6 pause. Each fixture has
two shareholders and combines live market funds, pending escrow, and funds
held locally by the rung. For the buy side these are 3,000 + 6,000 + 500 sats;
the sell side uses 6,000,000 + 12,000,000 + 1,000,000 micro-STX.

- A normal young-escrow withdrawal settles into the book and pays exactly.
- Young escrow with a fresh update and a paused market still returns u1007.
- At 86,399 seconds, omitting the update still returns u7012.
- At exactly 86,400 seconds, all six rungs recover without an update.
- At 86,401 seconds, all six recover while the market is paused, then six
  separate fixtures recover while core-v6 is paused. The core-pause cases
  supply an invalid update deliberately, proving this branch does not read it.
- Nonmembers receive u7006 and cannot trigger recovery.
- Cancellation emits the pending-refund `"cancel"` event and the live refund
  event, clears the market position, pays the withdrawing member exactly,
  and preserves the other shareholder's exact shares, claim, and backing.
  The remaining shareholder then makes partial and final withdrawals; all
  wallet balances and the emptied pool are checked.
- Recovery leaves the market/core pause flags unchanged.

The harness reads `stacks-block-time` from Clarity, rather than assuming the
SDK tip timestamp equals it. Real signed Lazer updates are used for the young
path. Stxer's `AdvanceBlocks` then sets the exact timeout ages. All miner-band
deposits run before synthetic blocks, since their RFQ oracle reads real burn
headers. No oracle source or production storage is patched.

The older 198-check caller-impact suite separately covers young queue-full
refund exits, keeper refunds, share synchronization, and pause propagation.

## Scope and validation

Runs on 2026-09-23, using the working-tree change on top of `19c73b5`:

| Harness | Result | Fork |
| --- | --- | --- |
| `verify-v6-rungs-escrow-timeout.js` | **549/549** | [timeout and normal exits](https://stxer.xyz/simulations/mainnet/e63243934144cace6c9e4d753176cb30) |
| `verify-v6-3-caller-impact.js` | **198/198** | [existing focused regression](https://stxer.xyz/simulations/mainnet/d53aacea92f3f0c92a3cdb72ba5232c1) |

The timeout fixtures have no parked balance; they test cancellation of live
and pending funds together. Recovery of parked funds uses the same market
cancel call, covered separately by the market submit/settle harness. These
tests do not claim exhaustive rounding or post-fill shareholder coverage.

All six changed contracts pass individual `clarinet check <contract>` calls.
Project-wide `clarinet check` reports the pre-existing missing
`contracts/markets-sbtc-stx-jing-v7.clar` and falls back to an eight-contract
plan; that fallback is not a check of these six contracts.
