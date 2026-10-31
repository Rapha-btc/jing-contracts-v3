# jing-btc-in-adapter

One signed tx for the BTC-first flow. The user bridges BTC to sBTC and
pre-signs a sponsored call to this adapter. When the sBTC mints, the keeper
sponsors and broadcasts it. The adapter pays the sponsor back in sats, then
spends the rest on a Jing router swap, a Jing limit order, seated ladder
rungs, or a fak.fun smart buy.

## Files

| File | Purpose |
|---|---|
| `jing-btc-in-adapter.clar` | Fee in sats, then the swap. No `as-contract`: tx-sender stays the user. |
| `smart-buy-sbtc-trait.clar` | The `smart-buy-with-sbtc (uint uint)` shape of every deployed `*-smart-faktory`. |
| `../jing-ladder-dispatch-relay.clar` | Relay copy of the LIVE `jing-ladder-dispatch` (sBTC/STX ladder). |
| `../sbtc-usdcx/jing-ladder-dispatch-sbtc-usdcx-relay.clar` | Relay copy of the LIVE `jing-ladder-dispatch-sbtc-usdcx`. |
| `../../Clarinet-btc-in-adapter.toml` | Manifest. `remote_data` is off; every principal the routers, markets and ladders name is a requirement. |
| `../../simulations/verify-btc-in-adapter.js` | stxer mainnet-fork harness (groups A-J). |
| `../../simulations/verify-btc-in-adapter-edges.js` | stxer edge harness (groups K-R). |
| `../../simulations/verify-btc-in-adapter-v2.js` | stxer harness for owner hand-over, limit orders, rungs, relays (groups A-I). |

## Entry points

| Function | Target |
|---|---|
| `swap-sbtc-for-stx (amount fee-sats limit-price update mid min-stx-out)` | `swap-router-sbtc-stx-jing-v5-5` |
| `swap-sbtc-for-usdcx (amount fee-sats limit-price update mid min-usdcx-out)` | `swap-router-sbtc-usdcx-jing-v5-5` |
| `smart-buy-with-sbtc (target amount fee-sats min-token-out)` | an approved `*-smart-faktory` |
| `deposit-sbtc-limit-stx (amount fee-sats limit-price spread-bps)` | `markets-sbtc-stx-jing-v6-4 deposit-token-x` |
| `deposit-sbtc-limit-usdcx (amount fee-sats limit-price spread-bps)` | `markets-sbtc-usdcx-jing-v6-4 deposit-token-x` |
| `dispatch-sbtc-rungs-stx (amount fee-sats allocations)` | `.jing-ladder-dispatch-relay deposit-buy` |
| `dispatch-sbtc-rungs-usdcx (amount fee-sats allocations)` | `.jing-ladder-dispatch-sbtc-usdcx-relay deposit-sell` |

Each call checks `paused`, `fee-sats <= max-fee-sats` and `fee-sats < amount`,
sends `fee-sats` of sBTC to `fee-recipient` (skipped at 0), prints
`{event: "btc-in", user, target, amount, fee-sats, net-sats}` and spends the
net. Any failure reverts the whole tx, fee included. `target` in the print is
the router, the market, the relay or the smart buy.

Limit orders: no `update` is taken. When the book has bids (both live books
do today), the market parks the deposit pending and a keeper settles it with
`settle-token-x-deposit` and a fresh Lazer update; on an empty bid side it
rests at once. Market errors pass through (u1001 below min, u1011 limit 0,
u1026 bad spread, u1031 already pending).

Rungs: `allocations` is 1-10 `{rung, amount}` that must sum to
`amount - fee-sats`. Side mapping, checked on mainnet: on both ladders the
sBTC rungs are `is-band-x`. sBTC/STX: buy band = `jing-buy-stx-*` (`deposit-buy`).
sBTC/USDCx: sell band = `jing-sell-sbtc-*` (`deposit-sell`). 10 seated per side
on each ladder. Relay errors: u7101 empty, u7102 sum != net, u7103 zero,
u7104 not a seated rung on that side, u7105 duplicate; a rung's own error
(e.g. u7005 below its min) rolls back every rung.

Relays: the live dispatchers refuse `tx-sender != contract-caller` (u7106), so
the adapter cannot call them. Each relay is the live source minus the three
gates and the constant (verified token for token against the deployed source,
comments and format aside). Without the gate any contract the user calls can
dispatch the user's own sBTC through the relay, but the position is always
credited to tx-sender (the user), and the rungs already take such calls
directly. Deploy both relays under SPV9K21... before the adapter: it names them
as `.jing-ladder-dispatch-relay` / `.jing-ladder-dispatch-sbtc-usdcx-relay`, and
`.jing-rung-deposit-trait` must be the deployed trait.

Owner calls (`propose-owner`, `set-fee-recipient`, `set-max-fee-sats`,
`set-paused`, `set-target`) check `contract-caller`. Hand-over is two-step:
`propose-owner new` sets `pending-owner`, and `new` calls `accept-owner`
itself. The old owner keeps every right until then; a new proposal overwrites
the pending one. Defaults: owner and fee-recipient = deployer, no pending
owner, `max-fee-sats` = 5000, not paused, no targets.

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
also covers what the pools move, and a swap cannot list those. The same cap
works for limit orders and rung dispatches (cap == amount ok, amount - 1
aborts; v2 group H). A limit order also passed in strict Deny on the fork,
because only the user's sBTC moves while it parks pending.

`update` can be `none` (presigned before the BTC confirms, pools only) or a
fresh Lazer update (deferred, signed after the sBTC lands, book leg can fill).

## Trait conformance

The deployed smart-buy dependency graph is too deep for `clarinet check`.
Conformance was checked against the on-chain ABIs of 10 deployed
`*-smart-faktory` contracts; all match the trait. PEPE and WELSH also fill
through the adapter on the fork.

## Verification

`clarinet check` on `Clarinet-btc-in-adapter.toml` (from a scratch copy,
empty cache): pass, "5 contracts checked". The count lists only the project
contracts; the 39 requirements are downloaded and type-checked too. Proof:
breaking the adapter's call into `deposit-token-x` or the router (4 args for
5), or the relay's call into the ladder (`is-band-zz`), each fails the check.

`node simulations/verify-btc-in-adapter.js`: **130/130**,
[run](https://stxer.xyz/simulations/mainnet/394b0884f852adfb08c0f2a36044bf89).
`node simulations/verify-btc-in-adapter-edges.js`: **325/325**,
[run](https://stxer.xyz/simulations/mainnet/b27789db5b71ddaf21dd0f03f0ca0a3a).
`node simulations/verify-btc-in-adapter-v2.js`: **363/363**,
[run](https://stxer.xyz/simulations/mainnet/e060a8cd62c2931e16e53b9b09e572a7).
Total **818/818**.

| Group | Covers |
|---|---|
| A | config defaults, owner setters, non-owner u4100, propose + accept hand-over |
| B / C | sBTC -> STX / USDCx: exact fee + net deltas, print |
| D | smart buy approved fills, unapproved u4103 |
| E | fee 0 |
| F | u4101, u4102, u4104 |
| G / H | Jing book leg fills on both markets with a fresh Lazer update |
| I | presigned `update = none` and a reused update still settle |
| J | real signed txs: Originator cap == amount ok, cap - 1 aborts, strict Deny aborts |
| K | atomicity: router `min-stx-out` / `min-usdcx-out` too high (u3002) and smart-buy `min-token-out` too high (pepe u1000) revert the fee too; nothing moves |
| L | fee == max ok on both routers; fee == amount - 1: the router keeps the 1 net sat unsold (min-out 0 ok, min-out 1 u3002), the smart buy spends it; amount 0 u4102; amount above balance fails (sBTC u1 / router u2001, venue-dependent); balance below fee fails u1 in the fee leg |
| M | owner lifecycle: fee-recipient move, max-fee raise/lower, pause/unpause, target revoke u4103, propose/accept hand-over (old owner keeps rights until accept, then u4100 on all 6 owner calls; re-propose overwrites; pending cleared) |
| N | the owner calling any setter through an intermediate contract gets u4100; the proposed owner cannot accept through a contract; a contract owner (proposed, accepts itself) works, and an unguarded one forwards any caller |
| O | error order: u4104 (paused) > u4101 (fee > max) > u4102 (fee >= amount) > u4103 (target); fee checks run before target approval |
| P | smart buy over all 10 deployed `*-smart-faktory`: 9 fill; `rock-smart-faktory` (old pool) refuses with a DivisionByZero runtime error, fee rolled back |
| Q | signed Originator txs with an sBTC cap: USDCx path and smart buy, cap == amount ok with exact deltas, cap - 1 aborts with nothing moved |
| R | Lazer age (AdvanceBlocks moves the fork clock): at block time = at + 80 the market swap refuses with u1003; the adapter call still succeeds with the book leg skipped (`jing-ok` false, `jing-in` 0, router sized 198000 then fell to DLMM) and exact deltas; an update 2 s newer (age 78) fills the book at the same block time |

v2 harness (`verify-btc-in-adapter-v2.js`):

| Group | Covers |
|---|---|
| setup | deploys trait, both relays, adapter, a test proxy as SPV9K21...; reads the seated rungs from both ladders (`get-rung` + `is-band-x`): 10 + 10; the other side answers `is-band-y` |
| A | propose/accept: stranger and overwritten proposals cannot accept (u4100), the old owner keeps rights until accept, pending cleared, old owner u4100 on all 5 owner calls after |
| B / C | limit orders, both markets, pending path: exact fee/net, pending deposit == net with limit and spread, `btc-in` then `pending-deposit-x` print; keeper `settle-token-x-deposit` with a fresh Lazer update rests it (deposit == net, order limit/spread kept, `deposit-x` print); fixed and pegged variants; u1031 / u1001 / u1011 / u1026 / u4101 with the fee rolled back; net == min 1000 accepted |
| D / E | rungs on 1, 2 and all 10 seated rungs per ladder: exact user sBTC and fee, result positions, rung `get-position` (shares == result shares, sbtc == shares * unfilled-index / SCALE), rung inventory (market + balance) +alloc exactly, `rung-deposit` / `ladder-dispatched` / `btc-in` prints; an epoch roll inside `deposit` (sold-out sync) is handled |
| F | u7102 (short, over, fee forgotten), u7104 (wrong side, other ladder, non-rung), u7105, u7103, u7101, a rung's u7005 after an earlier rung deposited, paused u4104: nothing moves |
| G | LIVE dispatcher through a proxy -> u7106; the relay through the same proxy -> ok, user credited; LIVE direct -> ok |
| H | signed Originator txs, sBTC cap: limit (both markets) and rungs (both ladders), cap == amount ok with exact deltas, amount - 1 aborts with nothing moved |
| I | direct-rest branch: EOA bids cancel, the yguazu vault's operator cancels its buy-back, the lone member of `jing-buy-sbtc-20` withdraws; then the limit order rests at once on both markets (no pending, `deposit-x` print) |

Every successful adapter path in K-R checks the `btc-in` print exactly (all
six keys, no extra) and that it is printed before the router's print, with
the router's `user` and `amount` == user and net.

Not covered on stxer: the keeper's sponsored broadcast (not exercised: the
harness overrides the sender and pays fee 0); the stale-update case on the
sBTC/USDCx market (same `MAX_STALENESS` code path, only sBTC/STX run).

Status: not deployed.
