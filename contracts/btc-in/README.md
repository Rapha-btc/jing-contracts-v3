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
| `../../simulations/verify-btc-in-adapter.js` | stxer mainnet-fork harness. |

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

Not covered yet: an update older than the 80 s market window.

Status: not deployed.
