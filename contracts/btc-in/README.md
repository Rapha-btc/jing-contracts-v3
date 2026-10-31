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
| `jing-btc-in-escrow.clar` | Walk-away flow: arm (fee + park net), keeper `execute` with a fresh Lazer update, timeout `cancel`. See the section at the end. |
| `smart-buy-sbtc-trait.clar` | The `smart-buy-with-sbtc (uint uint)` shape of every deployed `*-smart-faktory`. |
| `../jing-ladder-dispatch-relay.clar` | Relay copy of the LIVE `jing-ladder-dispatch` (sBTC/STX ladder). |
| `../sbtc-usdcx/jing-ladder-dispatch-sbtc-usdcx-relay.clar` | Relay copy of the LIVE `jing-ladder-dispatch-sbtc-usdcx`. |
| `../../Clarinet-btc-in-adapter.toml` | Manifest. `remote_data` is off; every principal the routers, markets and ladders name is a requirement. |
| `../../simulations/verify-btc-in-adapter.js` | stxer mainnet-fork harness (groups A-J). |
| `../../simulations/verify-btc-in-adapter-edges.js` | stxer edge harness (groups K-R). |
| `../../simulations/verify-btc-in-adapter-v2.js` | stxer harness for owner hand-over, limit orders, rungs, relays (groups A-I). |
| `../../simulations/verify-btc-in-escrow.js` | stxer harness for `jing-btc-in-escrow` (groups A-I, X). |

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

`node simulations/verify-btc-in-adapter.js`: **128/128**,
[run](https://stxer.xyz/simulations/mainnet/29448e0068efbb66bc05d68e764dde98).
`node simulations/verify-btc-in-adapter-edges.js`: **324/324**,
[run](https://stxer.xyz/simulations/mainnet/773907183a1278f81f80bd9150ae47cf).
`node simulations/verify-btc-in-adapter-v2.js`: **366/366**,
[run](https://stxer.xyz/simulations/mainnet/c8185bb5eb15d7b10c6a379020f56c45).
Total **818/818**. The relays are live on mainnet since 2026-10-30
(faktory-dao templates 1fcd8dfd, on-chain bytes match), so the harnesses use
them instead of deploying copies. `max-fee-sats` is capped by
`MAX_FEE_SATS` = u10000 in both the adapter (u4101) and the escrow (u4201).

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

Status: not deployed. Deploy templates: faktory-dao 7ae4aa44 (smart-buy-sbtc-trait, then jing-btc-in-adapter, then jing-btc-in-escrow, from 6adced2).

# jing-btc-in-escrow

Walk-away BTC-in with the price given at execution. The user's presigned,
keeper-sponsored tx only arms an order; the keeper runs the swap later with a
fresh Lazer update. The signed tx never carries a Lazer print, so it can never
hit the market's 80 s staleness window.

| Function | Who | What |
|---|---|---|
| `arm-swap-sbtc-for-stx (amount fee-sats slippage-bps min-stx-out)` | user (tx-sender) | fee to `fee-recipient`, net sBTC to the escrow, order stored and printed; returns the id |
| `arm-swap-sbtc-for-usdcx (amount fee-sats slippage-bps min-usdcx-out)` | user | same, for `swap-router-sbtc-usdcx-jing-v5-5` |
| `execute (id update mid)` | keeper (`contract-caller` in `keepers`) | under `as-contract?` derives `limit-price = mid * (10000 - slippage-bps) / 10000` from the keeper's mid and calls the order's router with `net limit-price (some update) mid min-out`; ok: the full `out` (STX or USDCx) and any unsold sats to the user; router err: rolled back, net refunded to the user. The order is deleted either way |
| `cancel (id)` | anyone, from `cancel-height` on | refunds net to the order's user. Works while paused |
| `get-order (id)`, `get-config`, `is-keeper` | read-only | |
| `propose-owner`, `accept-owner`, `set-fee-recipient`, `set-max-fee-sats`, `set-paused`, `set-keeper`, `set-cancel-after-blocks` | owner (`contract-caller`) | same two-step hand-over as the adapter |

Order: `{user, router, net, slippage-bps, min-out, cancel-height}` (no
`armed-at` / `armed-at-height`); `cancel-height = stacks-block-height at arm +
cancel-after-blocks`, fixed at arm time, so a later owner change never moves an
armed order's deadline. Prints: `btc-in-armed` (the order + `id amount
fee-sats`), `btc-in-executed` (`id user router net mid limit-price ok code spent out refund`),
`btc-in-cancelled` (`id user router net caller`).

Arm fee rules are the adapter's: paused, `fee-sats <= max-fee-sats`,
`fee-sats < amount`, plus `slippage-bps < 10000`. `paused` blocks arm and execute;
cancel never.

Design choices:

- **Timeout**: `cancel-after-blocks` defaults to u30 (about 5 min: mainnet ran
  8.8-11.2 s per Stacks block over the 330 blocks before 2026-10-30). The owner
  can set 1-360 (u4208 outside), so new orders can never be locked for more
  than about 1 h. Anyone may cancel after the timeout and the refund always
  goes to the user, so a user who walked away does not have to sign again.
- **No separate force-refund**: the keeper can already refund any armed order
  at any time: `execute` with `mid` 0 gives limit 0, so the router refuses (u3006) and the
  net goes back to the user (group E3). The owner can do the same by adding
  itself as keeper. A second refund entry point would add surface, not power.
  Funds still only reach the order's user.
- **Allowance**: the swap runs under `(with-ft sbtc (* u2 net))`. The
  allowance counts GROSS outflows; on a book fill the market returns rolled /
  rebate sats to the escrow and the router passes `amount - jing-in` to the
  pools, so a returned sat can be re-sold and the gross can exceed net (at most
  2 * net). The real bound is a balance check: the escrow's sBTC before and
  after the swap, `spent <= net` or u4210. Other orders' sats can never be
  spent. STX / USDCx forwards use exact `out` allowances.
- **Output**: `out` is the router's own balance delta on the escrow, so it is
  exactly what arrived. Unsold sats = `net - spent` from the escrow balance.
- A runtime abort (not a router `err`) reverts the whole tx and leaves the
  order armed for a retry or a cancel.

| Error | Meaning |
|---|---|
| u4200 | not owner |
| u4201 | fee-sats > max-fee-sats |
| u4202 | fee-sats >= amount |
| u4203 | paused (arm, execute) |
| u4204 | not a keeper |
| u4205 | no such order (unknown, executed or cancelled) |
| u4206 | cancel before cancel-height |
| u4207 | slippage-bps >= 10000 (ERR_BAD_SLIPPAGE) |
| u4208 | cancel-after-blocks outside 1-360 |
| u4209 | an `as-contract?` allowance was violated |
| u4210 | the swap spent more than the order's net |

Signing: the arm tx moves only the user's sBTC (fee + net), so one sBTC cap
equal to `amount` works in Originator mode and in strict Deny (group G).

Notes: at the market and router the escrow is the taker (`tx-sender`), so
router prints, rebates and any per-taker stats show the escrow, not the user;
the `btc-in-executed` print links the two. The keeper chooses the update and
the mid. The limit is derived from that mid, so `slippage-bps` bounds the fill
only relative to the keeper's mid; `min-out` is the only bound the user signs
in absolute terms (group J1: a mid 200,000x below market still fills).

Verification: `clarinet check` on `Clarinet-btc-in-adapter.toml` from a
scratch copy: "6 contracts checked" (warnings only: `unwrap-panic` on the sBTC
`get-balance`, and the asset-name constants used only in allowances).

`node simulations/verify-btc-in-escrow.js`: **531/531**,
[run](https://stxer.xyz/simulations/mainnet/5ebbc27f8fe355cb4099ee9a38676053).

| Group | Covers |
|---|---|
| A | defaults (cancel-after 30, last-id 0, no keepers), u4200 on all 6 owner setters from a stranger, cancel-after 0 / 361 u4208 and 360 ok, keeper set / revoke, propose / accept (old owner u4200 on every setter after) |
| B | arm on both pairs: user -amount, fee-recipient +fee, escrow +net exactly, `get-order` and `btc-in-armed` print exact, `cancel-height` = arm height (read from the sim) + timeout, fee 0 skips the transfer; u4203 paused (both), u4201, u4202 (fee == amount, amount 0), u4207 at slippage-bps 10000 (both pairs) and 2^128-1, 9999 and 0 accepted (then refunded by keeper mid 0, u3006), sBTC u1 above balance; nothing moves, last-id unchanged |
| C / D | a maker bid rests, keeper executes with a fresh update on sBTC/STX and sBTC/USDCx: book leg fills, user gets exactly the router's `out` plus the unsold sats, `spent + refund == net`, escrow -net exactly, keeper gains nothing, order deleted, `btc-in-executed` print exact, router print `user` = escrow, `amount` = net |
| E | `min-out` 1e15 on both pairs: router u3002 rolled back inside `as-contract?`, the only committed sBTC move is the net refund to the user, no STX / USDCx moves; keeper `mid` 0: limit 0, router u3006, refund (the keeper's refund path) |
| F | stranger, order user, owner (not keeper) and a revoked keeper u4204; unknown id u4205; execute while paused u4203; the order is unchanged after every refusal; double execute u4205 |
| G | real signed arm txs, sBTC cap on the user: Originator cap == amount ok with exact deltas, amount - 1 aborts with nothing moved; strict Deny cap == amount ok, amount - 1 aborts; both orders then execute |
| X | probe: a copy with an exact `net` allowance on a book fill. It held here (the market returned 1 rolled sat, the router left it unsold); the 2 * net headroom covers the case where returned sats are re-sold |
| J | slippage-bps: print `limit-price` exact (mid 123456789, 37 bps -> 122999998; every execute checks `mid * (10000 - bps) / 10000`); 0 and 5 bps with a maker bid rested at the mid: filled on the pools (DLMM / Velar), book leg 0 because the mid moved between the bid and the execute; keeper mid 2x market at 0 bps: limit above every venue, router u3002, exact refund; 300 bps with fresh updates: book leg fills on both pairs |
| H | the clock moved 85 s past the update: book leg skipped (`jing-ok` false), the pools fill, exact deltas |
| I | cancel before cancel-height by the user, a stranger and the keeper u4206 (also at cancel-height - 1); unknown id u4205; at cancel-height a stranger cancels: the user +net, the stranger gains nothing, `btc-in-cancelled` print exact; cancel / execute again u4205; the user cancels while paused; an order armed under cancel-after 360 is still u4206 60 blocks later and after the owner lowers it back to 30 (deadline fixed at arm), then the keeper executes it; `cancel-height` = arm height + 360 |

Every path ends with the escrow holding 0 sBTC, 0 STX and 0 USDCx (or exactly
the nets still armed). Not covered: the keeper's sponsored broadcast (the
harness overrides the sender, fee 0).

Status: not deployed. Deploy templates: faktory-dao 7ae4aa44 (smart-buy-sbtc-trait, then jing-btc-in-adapter, then jing-btc-in-escrow, from 6adced2).
