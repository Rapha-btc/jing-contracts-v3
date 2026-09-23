# Router v5-3 DLMM bin boundary

`contracts/swap-router-sbtc-stx-jing-v5-3.clar` targets
`markets-sbtc-stx-jing-v6-3` (the `JING_MARKET` constant at line 117).
These simulations use that pair, not v7, and never broadcast to mainnet.

The DLMM depth walk could advance from bin 500 to 501, or from -500 to -501.
`get-bin-price` then returned an error and `unwrap-panic` aborted the swap.
The fix counts the qualifying edge bin, keeps its index, and sets `done: true`.
The shared `dlmm-bin-step` is the router's only bin walk and handles both
swap directions. Price qualification, capacity, fees, and routing stay unchanged.

## Verified fork runs (2026-09-23)

| Harness | Checks | Run |
| --- | --- | --- |
| `verify-v6-3-router-bin-boundary.js` | 22/22 | [boundary regression](https://stxer.xyz/simulations/mainnet/22825ead524c41102000f6d7e87661b1) |
| `V6=1 verify-swap-router-v3-lazer.js` | 285/285 | [full router suite](https://stxer.xyz/simulations/mainnet/1b87a78280e83a84dbaa6af79e31b203) |

The regression replays steps 0–241 of the [original failing fork](https://stxer.xyz/simulations/mainnet/1ac1ad538ad102792f868d918b1c4fd9)
at the original block. It checks the replay results and receipts, excluding
nondeterministic processing costs, then installs the working-tree router with
fork-only `SetContractCode`, preserving storage. The original public call at
index 242 now sells **1,000 sats for 2,398,110 micro-STX** with exact wallet
deltas. An impossible minimum output returns `u3002`, with no balance change
or committed events. Accumulator tests using real pool balances cover ±500
and adjacent ±499, count each edge once, and verify subsequent steps do nothing.
Saved evidence: [original failure](fixtures/router-v5-3-bin-boundary-result.json)
and [fixed result](fixtures/router-v5-3-bin-boundary-fixed.json).

The full suite deploys current core-v6, ladder-v1, market v6-3, and router v5-3
on a fork. Its maker setup follows submit + settle, fetching a signed Lazer
update newer than the submit clock. AMM fixtures measure current reserves
after earlier large trades; W15 replenishes DLMM through a public reverse
swap. Exact balances, venue allocations, limits, and rollback checks remain.
No pool storage is mocked. `_v6-submit-settle.js` supplies sequential fork
steps, fresh updates, and read-only fixture values.

## Reproduce

From the repository root with dependencies installed:

```sh
node simulations/verify-v6-3-router-bin-boundary.js
V6=1 node simulations/verify-swap-router-v3-lazer.js
clarinet check contracts/swap-router-sbtc-stx-jing-v5-3.clar
```

Both harnesses print N/M and exit nonzero on failure. They require network
access to stxer; the full suite also uses the Stacks API and keyless signed
Lazer updates. Its live fork liquidity can change between runs.

The router-specific Clarinet check passed, with warnings. The project-wide
check encounters an existing missing v7 source in `Clarinet.toml`; this does
not change the router's v6-3 target. `git diff --check` also passed.
