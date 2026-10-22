# MM loop sell Rendezvous checks

Run both contracts with 500 invariant steps and 500 property calls per contract:

```sh
node tests/rv/mm-loop-sell/run.mjs both both 500 262201
```

The runner regenerates its local Clarinet projects from the current vault files before starting. It substitutes the deployed rung, sBTC, wSTX, and market references with strict local fixtures. It also changes only the generated fixture's initial owner and keeper so Rendezvous can exercise owner and keeper operations. The contract source hashes and generated paths are written under the ignored `.build/` directory.

The invariant harness checks that paired inventory is zero together, the buy-back cap/floor stays on the correct side of VWAP, the edge remains below 10,000 bps, market inventory does not exceed open inventory, only allowlisted rung keys gain principal, withdrawals preserve owner-only authority, keeper attempts cannot move funds out, and total sBTC across the vault, rungs, and market cannot grow beyond deposits.

The randomized action set consists of vault operations. Directly transferring proceeds to a rung is kept out of that set because it is an external token transfer, not a vault call; `node tests/rv/mm-loop-sell/repro.mjs` separately exercises it and asserts paired inventory stays intact. The extra returned by a rung donation remains untracked and can be recovered through the owner's token withdrawal.

## Results

The final randomized run completed against the updated vaults with seed base `262201` and 500 runs per mode:

| Contract | Invariant runs | Property runs | Result |
| --- | ---: | ---: | --- |
| sBTC vault | 500 | 500 | Pass; all tracked status flags true |
| STX vault | 500 | 500 | Pass; all tracked status flags true |

The invariant runs executed 6,419 public calls for sBTC and 6,265 for STX. Each property run executed 500 generated calls. All status flags remained true, and there were no randomized invariant or property counterexamples.

The donation reproduction now passes for both fixtures:

| Contract | Sequence result | State after claim | Booking invariant |
| --- | --- | --- | --- |
| sBTC vault | Sell 1 satoshi, donate 2 uSTX to rung 1, claim | `inv-sats = u0`, `inv-stx = u0` | True |
| STX vault | Sell 1 uSTX, donate 2 satoshis to rung 1, claim | `inv-sats = u0`, `inv-stx = u0` | True |

The donation extra remains outside inventory accounting; the unit tests verify the owner can withdraw it. The random tests use strict local rung, token, and market fixtures in place of remote deployments.

## Mainnet-fork simulation reruns

After the `book-rung` guard was tightened to require both proceeds and consumed principal to be positive, the stxer mainnet-fork simulations passed all 366 checks for each vault:

| Contract | Checks | Simulation |
| --- | ---: | --- |
| sBTC vault | 366/366 | [stxer run](https://stxer.xyz/simulations/mainnet/b15b96cf6b1bbfa8e60f685c7c4471ba) |
| STX vault | 366/366 | [stxer run](https://stxer.xyz/simulations/mainnet/443f3fc25f7b2b63b6bc4e5e2bc57da) |

Both runs include the unpaired donation scenario: the rung returns donated output while consuming zero principal, the vault's paired inventory remains unchanged through claim and reconciliation, and the owner recovers the untracked extra through the token withdrawal. The ordinary fill scenarios also pass, confirming that same-call proceeds and consumed principal continue to book together and are not dropped by the guard.
