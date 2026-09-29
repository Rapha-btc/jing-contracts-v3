# Native sBTC/STX vault on market v6-3

`vault-sbtc-stx-v6.clar` targets `markets-sbtc-stx-jing-v6-3`,
`swap-router-sbtc-stx-jing-v5-3`, and `jing-core-v6`. Each user deploys and
funds a vault, registers it with Core, and signs SIP-018 intents for an
owner or keeper to execute. The signed amount, side, limit, authorization ID,
and expiry are unchanged; a fresh oracle update is supplied at execution only
where the called market/router method needs one.

## Maker submissions

`execute-jing-deposit` and `execute-jing-set-limit` no longer accept an oracle
update. Market v6-3 can either apply a submission immediately or leave it
pending. The vault prints `vault-jing-submitted` with the signed intent hash
and current position. Any caller can settle a pending deposit or limit
directly on market v6-3 using an update newer than the submission, with the
vault principal as depositor. There is no vault settlement wrapper.

`get-jing-position(side)` reports live, parked, and pending-deposit amounts.
Only live plus parked inventory counts as `resting` for a signed set-limit or
reprice amount. Pending deposits cannot be repriced. A pending limit is a
requested price change, not another token balance. Market v6-3 emits the
submission, settlement, and refund events; the vault does not call the old
event-only Core `log-jing-deposit`, which has been removed from Core v6.

## Swaps and Core equity

Before a direct Jing swap, a crossing reprice, or a router swap, the vault
records total custody and Core's recorded equity for both tokens. Custody is
wallet balance plus live market inventory, parked market inventory, and
pending-deposit escrow. After execution it reads custody again and sets each
Core equity target to its pre-swap equity plus or minus that token's net
custody change, floored at zero. The vault calls
`log-jing-swap-reconciled` once; Core adjusts only the registered caller's
equity to those targets and emits `vault-jing-swap` with `reconciled: true`.

This accounts for market settlement that may already have updated the vault's
Core ledger during the same atomic swap. It also preserves the gap from an
sBTC bridge mint sent straight to the vault: such a mint has no vault call
and is not retrospectively credited to Core. The event's `amount` and `out`
are net changes in total custody, including any other vault position settled
during the swap. If the Core call fails, `try!` reverts the whole transaction.

The crossing reprice allowance covers the market's age-dependent taker
rebate up to 70 bps. The router allowance covers the signed amount plus the
market minimum deposit and maximum rebate; this accommodates gross transfers
when refunded book dust is spent again on a fallback venue. The market/router
still enforce the signed price limit.

## Deployment and verification

Deploy and configure the amended Core v6 before using this vault; market
v6-3 and router v5-3 must point to the same Core. Register each deployed vault
with Core and verify the intended vault source hash as required by the Core
registry. Existing on-chain contracts are immutable, so older vault/core
deployments do not acquire these changes.

Run `npm run test:vault-v6-3`. The
[vault test README](../tests/unit/vault-v6-3/README.md) describes the local
fixtures, cases, and limits. The older
`simulations/verify-vault-sbtc-stx-v6-parked.js` targets market v6/router v5
and is not validation of this source pair.
