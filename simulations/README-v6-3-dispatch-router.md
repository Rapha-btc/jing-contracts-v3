# Current v6-3 dispatch and router fork checks

Validated market/router HEAD `f231e51` and the six rung templates at `5735a97`.
All transactions run on stxer forks. No mainnet broadcast or contract edit.
The router bin fix is already committed as `f231e51`; the work here is tests.

## Dispatch: 176/176

[Run](https://stxer.xyz/simulations/mainnet/75d643f4d54059113cfd1b9e431f8784),
[harness](verify-v6-3-dispatch.js), [result](fixtures/dispatch-v6-3-result.json).

Deployment order: core-v6, ladder-v1, market v6-3, rung trait, six rung templates
(with three core-spread instances per side), then ladder-dispatch. Canonical
hash registration and seating use the real ladder API. No storage patches.
The harness pins rung source to `5735a97` so concurrent uncommitted rung edits
do not silently change this comparison.

Dispatch accepts current **core-spread/band seats only**. Fixed and
market-spread templates register on other ladder sides; they cannot be seated
as bands. The test deploys and registers them and verifies dispatch rejects
them with `u7104`. Multi-rung cases use three actual band seats per side.

Both buy and sell verify:

- Exact aggregate/per-rung receipts, shares, and total wallet spend.
- A below-minimum allocation stays held; the other two rungs escrow normally.
- One already-pending rung holds its next deposit; the other two submit
  successfully. The dispatch transaction does not revert.
- Withdrawal across three rungs with a newer signed update pays exactly.
- Advance fork time to 86,401 seconds after submit, pause the market, and
  withdraw with `none`: one pending rung cancels while the other two withdraw
  live inventory. The expired pending claim clears, the live rungs retain the
  other member's exact inventory, and the caller receives the exact aggregate
  payment.
- Other members keep exact shares and claims, then exit for exact amounts.
  Pending cancellation logs its reason; dispatch retains no funds.

## Router: 398/398

[Harness](verify-v6-3-router-impact.js),
[complete step-by-step tuples/wallets and signed update](fixtures/router-v6-3-baseline-result.json).

| Direction | Exact `f6a6d3a` market | Current market |
| --- | --- | --- |
| sBTC → STX | [baseline](https://stxer.xyz/simulations/mainnet/8ccba97155e2b31ab0b5c05801e49c41) | [current](https://stxer.xyz/simulations/mainnet/9ea0d7b5a435a590b7ffd3080c62f2d7) |
| STX → sBTC | [baseline](https://stxer.xyz/simulations/mainnet/92096ae79d168448ce837a343352618f) | [current](https://stxer.xyz/simulations/mainnet/282a03bc3e22ed693b8ddf2ec63eea13) |

All four runs use block **9050464**, the same signed Lazer bytes, the same
maker/taker principals and funding, and the current router with its bin fix.
The exact baseline market uses core-v5 and its original one-call deposit ABI;
the current market uses core-v6 and its current ABI. Neither source is patched.
These are paired baseline/current runs created for this comparison, not a
replay of an unspecified older simulation.

**No difference** in results or wallet balances across common scenarios:
full fill, partial fill with refunded remainder, limit zero, below-minimum,
and empty book. Every scenario exercises direct market swap and router swap
in both directions; the saved fixture includes before/after maker, taker, and
market balances for every step.

Direct zero-limit calls return `u1011`; below-minimum calls return `u1001`;
empty-book calls return `u1009`. With no AMM fallback and positive min-out,
the router catches these market errors and returns `u3002`. Rejections move
nothing. The relocation of market guards does not alter these results.

The `f6a6d3a` baseline has no pending-deposit API. Current-only checks therefore
compare opposite pending escrow with the current empty-book control: both
direct and router swaps refuse, with exact balances and pending amount intact.
After settlement clears pending and places that same liquidity, the router
fills successfully. This is explicitly additional coverage, not a fabricated
baseline pending case.

## Reproduce

```sh
node simulations/verify-v6-3-dispatch.js
node simulations/verify-v6-3-router-impact.js
```

Fresh router comparisons pin both versions to the same newly selected block
and signed update. Saved historical evidence retains the exact block/update.
Both harnesses exit nonzero on failure and print N/M.
