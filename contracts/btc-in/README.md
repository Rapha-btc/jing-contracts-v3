# jing-btc-in-adapter

One signed tx for the BTC-first flow. The user bridges BTC to sBTC and
pre-signs a sponsored call to this adapter. When the sBTC mints, the keeper
sponsors and broadcasts it. The adapter pays the sponsor back in sats, then
spends the rest on a Jing router swap or a fak.fun smart buy.

## Files

| File | Purpose |
|---|---|
| `jing-btc-in-adapter.clar` | Fee in sats, then the swap. No `as-contract`: tx-sender stays the user. |
| `smart-buy-sbtc-trait.clar` | The `smart-buy-with-sbtc (uint uint)` shape of every deployed `*-smart-faktory`. |
| `../../Clarinet-btc-in-adapter.toml` | Manifest. `remote_data` is off; every principal the routers name is a requirement. |
| `../../simulations/verify-btc-in-adapter.js` | stxer mainnet-fork harness (groups A-J). |
| `../../simulations/verify-btc-in-adapter-edges.js` | stxer edge harness (groups K-R). |

## Entry points

| Function | Target |
|---|---|
| `swap-sbtc-for-stx (amount fee-sats limit-price update mid min-stx-out)` | `swap-router-sbtc-stx-jing-v5-5` |
| `swap-sbtc-for-usdcx (amount fee-sats limit-price update mid min-usdcx-out)` | `swap-router-sbtc-usdcx-jing-v5-5` |
| `smart-buy-with-sbtc (target amount fee-sats min-token-out)` | an approved `*-smart-faktory` |

Each call checks `paused`, `fee-sats <= max-fee-sats` and `fee-sats < amount`,
sends `fee-sats` of sBTC to `fee-recipient` (skipped at 0), prints
`{event: "btc-in", user, target, amount, fee-sats, net-sats}` and swaps the net.
Any failure reverts the whole tx, fee included.

Owner calls (`set-owner`, `set-fee-recipient`, `set-max-fee-sats`,
`set-paused`, `set-target`) check `contract-caller`. Defaults: owner and
fee-recipient = deployer, `max-fee-sats` = 5000, not paused, no targets.

| Error | Meaning |
|---|---|
| u4100 | not owner |
| u4101 | fee-sats > max-fee-sats |
| u4102 | fee-sats >= amount |
| u4103 | smart-buy target not approved |
| u4104 | paused |

## Signing

Sign adapter txs in **Originator** post-condition mode, with one sBTC cap on
the user equal to `amount`. This is what the FE's `swapPcMode()` does. Strict
Deny mode aborts even when the cap equals the amount: on Stacks 3.4, Deny
also covers what the pools move, and a swap cannot list those.

`update` can be `none` (presigned before the BTC confirms, pools only) or a
fresh Lazer update (deferred, signed after the sBTC lands, book leg can fill).

## Trait conformance

The deployed smart-buy dependency graph is too deep for `clarinet check`.
Conformance was checked against the on-chain ABIs of 10 deployed
`*-smart-faktory` contracts; all match the trait. PEPE and WELSH also fill
through the adapter on the fork.

## Verification

`clarinet check` on `Clarinet-btc-in-adapter.toml`: 41 contracts, pass.

`node simulations/verify-btc-in-adapter.js`: **121/121**,
[run](https://stxer.xyz/simulations/mainnet/5db14d60286c23183b8e0c1bccebde4e).
`node simulations/verify-btc-in-adapter-edges.js`: **306/306**,
[run](https://stxer.xyz/simulations/mainnet/3538e8cf36cee3354537272c9507d7e6).
Total **427/427**.

| Group | Covers |
|---|---|
| A | config defaults, owner setters, non-owner u4100 |
| B / C | sBTC -> STX / USDCx: exact fee + net deltas, print |
| D | smart buy approved fills, unapproved u4103 |
| E | fee 0 |
| F | u4101, u4102, u4104 |
| G / H | Jing book leg fills on both markets with a fresh Lazer update |
| I | presigned `update = none` and a reused update still settle |
| J | real signed txs: Originator cap == amount ok, cap - 1 aborts, strict Deny aborts |
| K | atomicity: router `min-stx-out` / `min-usdcx-out` too high (u3002) and smart-buy `min-token-out` too high (pepe u1000) revert the fee too; nothing moves |
| L | fee == max ok on both routers; fee == amount - 1: the router keeps the 1 net sat unsold (min-out 0 ok, min-out 1 u3002), the smart buy spends it; amount 0 u4102; amount above balance fails (sBTC u1 / router u2001, venue-dependent); balance below fee fails u1 in the fee leg |
| M | owner lifecycle: fee-recipient move, max-fee raise/lower, pause/unpause, target revoke u4103, set-owner hand-over (old owner u4100 on all 5 setters, new owner writes all 5) |
| N | the owner calling any setter through an intermediate contract gets u4100; a contract owner works (and an unguarded one forwards any caller) |
| O | error order: u4104 (paused) > u4101 (fee > max) > u4102 (fee >= amount) > u4103 (target); fee checks run before target approval |
| P | smart buy over all 10 deployed `*-smart-faktory`: 9 fill; `rock-smart-faktory` (old pool) refuses with a DivisionByZero runtime error, fee rolled back |
| Q | signed Originator txs with an sBTC cap: USDCx path and smart buy, cap == amount ok with exact deltas, cap - 1 aborts with nothing moved |
| R | Lazer age (AdvanceBlocks moves the fork clock): at block time = at + 80 the market swap refuses with u1003; the adapter call still succeeds with the book leg skipped (`jing-ok` false, `jing-in` 0, router sized 198000 then fell to DLMM) and exact deltas; an update 2 s newer (age 78) fills the book at the same block time |

Every successful adapter path in K-R checks the `btc-in` print exactly (all
six keys, no extra) and that it is printed before the router's print, with
the router's `user` and `amount` == user and net.

Not covered on stxer: the keeper's sponsored broadcast (not exercised: the
harness overrides the sender and pays fee 0); the stale-update case on the
sBTC/USDCx market (same `MAX_STALENESS` code path, only sBTC/STX run).

Status: not deployed.
