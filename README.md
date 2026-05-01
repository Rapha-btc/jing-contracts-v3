# jing-contracts-v3

Clean room of the Jing v3 protocol: a single registry + per-pair blind-batch markets + per-user vaults for conditional execution + a reserve/snpl credit-line stack. Ported from the in-flight `jingswap-contracts` workspace and renamed for clarity.

## Layout

```
contracts/
├── jing-core.clar              registry, equity ledger, single event stream
├── jing-vault-auth.clar        SIP-018 hash builder for signed vault intents
│
├── sbtc-stx-jing-v3.clar       sBTC/STX market (STX-special: native STX on token-y)
├── sbtc-usdcx-jing-v3.clar     sBTC/USDCx market (single Pyth feed; both legs FT)
│
├── vault-sbtc-stx.clar         per-user sBTC/STX vault → market + xyk + DLMM router
├── vault-sbtc-usdcx.clar       per-user sBTC/USDCx vault → market + DLMM router
│
├── reserve-trait.clar          trait the reserve implements
├── snpl-trait.clar             trait the snpl implements
├── sbtc-stx-jing-reserve.clar  shared sBTC reserve (lender's pool)
└── sbtc-stx-jing-snpl.clar     per-borrower credit-line (ports v2 sbtc-stx-0-jing-v2 mainnet refs)
```

## Architecture sketch

- **`jing-core`** is the only contract every other piece talks to. It holds the canonical per-token equity ledger keyed `(token, owner)` and emits the unified event stream consumed by indexers.
- **Markets** (`*-jing-v3`) are blind-batch auction templates priced by Pyth. Each market is initialized with a token pair and a feed at deploy time. They credit/debit equity in jing-core via `log-deposit-x/y`, `log-distribute-*`, `log-refund-*`, `log-sweep-dust`.
- **Vaults** (`vault-*`) are per-user single-instance contracts. Owner pre-signs SIP-018 intents off-chain; a whitelisted keeper fires them. Funds only move into the registered market, into pinned Bitflow venues (xyk + DLMM router), or back to OWNER. No trait or principal args from the keeper.
- **Reserve + snpl** form a credit-line stack on top of the sBTC/STX market. The reserve is a single shared lender pool; one snpl is deployed per borrower.

## Cross-venue integrations

The vaults route through:
- The Jing market for the same pair (primary).
- Bitflow xyk (sBTC/STX vault only — there's no xyk pool for sBTC/USDCx).
- Bitflow DLMM via `dlmm-swap-router-v-1-1.swap-{x-for-y,y-for-x}-simple-multi` (auto-traverses up to 319 bins, built-in min-received). Pool layout per pair:
  - sBTC/STX: `dlmm-pool-stx-sbtc-v-1-bps-15` — **x=wstx, y=sBTC** (Bitflow naming inverts vs. Jing/xyk).
  - sBTC/USDCx: `dlmm-pool-sbtc-usdcx-v-1-bps-10` — x=sBTC, y=USDCx.

## STX handling

`vault-sbtc-stx` holds **native STX**. Bitflow's `token-stx-v-1-2` is a SIP-010 façade whose `transfer` is `stx-transfer?` and whose `get-balance` is `stx-get-balance` — there's no minted FT supply. So every STX-side egress in the vault uses `with-stx amount` on the as-contract clause; no `with-ft` ever applies on the STX leg.

`sbtc-stx-jing-v3` mirrors this: token-y operations use `stx-transfer?` + `with-stx` directly, even though the public function signatures still take an `<ft-trait>` (the trait is asserted canonical for safety but never invoked for the actual transfer).

## Equity ledger semantics

- Vaults credit/debit **at ecosystem boundaries** (owner deposit/withdraw, AMM entry/exit). Intra-ecosystem moves (vault → registered market) emit zero equity delta.
- Markets handle the cross-leg accounting on settle via `log-distribute-*-depositor`: unconditional debit of cleared input + `credit-if-registered` of received counterparty token. Vaults are registered, so the credit fires and their bucket reflects post-trade balances.
- STX-side equity is denominated in `'SM179...token-stx-v-1-2` (the wstx façade principal) on both vault and market sides — single bucket, no parallel STX/wstx tracking.

## Build

```sh
clarinet check
```

Mainnet requirements (sBTC, USDCx, Pyth, Bitflow xyk + DLMM + router) are pulled into `.cache/requirements/` automatically on first check.

## Status

Pre-mainnet. Notable open items:

- `sbtc-stx-jing-snpl.clar` still hardcodes the v2 mainnet market `'SPV9K21...sbtc-stx-0-jing-v2` and uses v2-style single-side functions (`deposit-sbtc`, `cancel-sbtc-deposit`, `set-sbtc-limit`). Migrating it to call `sbtc-stx-jing-v3` (`deposit-token-x` + asset-name) is a follow-up amend, not done in this port.
- `clarinet check`'s auto-generated simnet plan can deploy vaults before the markets they reference (Clarinet doesn't infer the dependency from `.contract-call?`); if the check trips on `use of unresolved contract`, manually reorder `deployments/default.simnet-plan.yaml` to put the v3 markets ahead of the vaults.
