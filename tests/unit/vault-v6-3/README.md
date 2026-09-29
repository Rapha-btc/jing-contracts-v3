# Vault v6 on market v6-3

Run from the repository root:

```sh
npm run test:vault-v6-3
```

The suite compiles and executes the current vault, router v5-3, market v6-3,
core v6, ladder v1 and vault-auth source. Dependency principals and the sBTC
asset name are replaced for local deployment. Generated source hashes and
substitutions are recorded in `.build/sources.json`.

The token is a funded SIP-010 fixture; the oracle has configurable timestamps
and prices. External pool contracts use the existing RV mocks, funded with
real simnet balances. Venue mocks pay 1% plus two units above the per-leg
minimum to model successful execution despite router rounding slack. This is
not verification of live pool pricing, external oracle signatures, or mainnet
transaction costs. The Jing router itself is actual source, not a mock.

Both directions cover signed maker submission/settlement/cancellation, pending
limit acceptance/refusal, pending escrow exclusion from repricing, paused exits,
direct taker fills, passive maker fills, aged crossing reprices, router-only and
mixed Jing/pool swaps, signature rollback/replay, authorization, and unlogged
bridge balances. Holdings include wallet + live + parked + pending escrow.

Before the core amendment, direct STX taker settlement left 99 STX of holdings
but 98.002 STX recorded equity: market distribution and the vault swap log both
debited the cleared input. Output was also credited twice. Crossing reprices
showed the same issue. The tests compare ledger values against actual holdings.

## Review notes

- Vault dependencies now target market `v6-3`, router `v5-3`, core `v6`.
- `execute-jing-deposit` and `execute-jing-set-limit` drop the trailing oracle
  buffer. Their signed intent fields and `(ok msg-hash)` responses are unchanged.
- `get-jing-position(side)` separates live, parked and pending deposit. Side values remain `sbtc-token` and `wstx`.
- Anyone settles a pending vault deposit or limit directly on market v6-3,
  passing the vault principal and an update newer than the submission. The
  consumed intent is not renewed if later settlement refuses that submission.
- `vault-jing-submitted` reports the intent hash and resulting market position.
  The redundant core `log-jing-deposit` call was removed from deposit and
  set-limit, and its unused event-only entry point was removed from core v6. Equity is credited when the vault is funded; market logs capture
  pending/settlement/refund events without crediting a registered vault again.
- Crossing reprice allowance covers the 70 bps ceiling. Router allowance covers
  amount + market minimum + maximum rebate, including refunded funds spent again.
- New core `log-jing-swap-reconciled` retains the `vault-jing-swap` event fields,
  adds `reconciled: true`, and adjusts only the registered caller's own equity.
  Like existing core log methods, it trusts canonical registered caller code.
- The vault snapshots total custody and recorded equity before execution, then
  applies the net custody change to the old equity. This avoids reapplying market
  accounting and excludes unused rebate/dust from spend. Swap-event amount/out
  are net changes across wallet and market custody, including any simultaneous
  settlement of another vault position. Unlogged bridge funds are not credited
  retroactively; debits still saturate at zero as in core's existing ledger.
- Existing core `log-jing-swap` and all market logging interfaces are unchanged.
  Legacy vaults do not automatically gain the new reconciliation behavior.
- Deploy the amended core before this vault; verify the amended canonical vault
  hash and initialize each user vault. Existing deployed contracts are immutable.

The historical `simulations/verify-vault-sbtc-stx-v6-parked.js` and its old trace
report target market v6/router v5 and the old vault ABI; they are not current
validation. No mainnet-fork simulation or deployment is performed by this suite.
