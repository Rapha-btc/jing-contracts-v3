# MM loop sell Rendezvous checks

Run both contracts with 500 invariant steps and 500 property calls per contract:

```sh
node tests/rv/mm-loop-sell/run.mjs both both 500 261501
```

The runner regenerates its local Clarinet projects from the current vault files before starting. It substitutes the deployed rung, sBTC, wSTX, and market references with strict local fixtures. It also changes only the generated fixture's initial owner and keeper so Rendezvous can exercise owner and keeper operations. The contract source hashes and generated paths are written under the ignored `.build/` directory.

The invariant harness checks that paired inventory is zero together, the buy-back cap/floor stays on the correct side of VWAP, the edge remains below 10,000 bps, market inventory does not exceed open inventory, only allowlisted rung keys gain principal, withdrawals preserve owner-only authority, keeper attempts cannot move funds out, and total sBTC across the vault, rungs, and market cannot grow beyond deposits.

The randomized action set consists of vault operations. Directly transferring proceeds to a rung is kept out of that set because it is an external token transfer, not a vault call; `node tests/rv/mm-loop-sell/repro.mjs` separately exercises that case and reports the resulting state. This separates normal call-sequence fuzzing from a direct rung-donation edge case.

## Results

The final randomized run completed with seed base `261501` and 500 runs per mode:

| Contract | Invariant runs | Property runs | Result |
| --- | ---: | ---: | --- |
| sBTC vault | 500 | 500 | Pass; all tracked status flags true |
| STX vault | 500 | 500 | Pass; all tracked status flags true |

The invariant runs executed 6,217 public calls for sBTC and 5,944 for STX. Each property run executed 500 generated calls. There were no randomized invariant or property counterexamples.

The separate donation reproduction completes but breaks paired-inventory accounting in both fixtures:

| Contract | Sequence result | State after claim | Booking invariant |
| --- | --- | --- | --- |
| sBTC vault | Sell 1 satoshi, donate 2 uSTX to rung 1, claim | `inv-sats = u0`, `inv-stx = u2` | False |
| STX vault | Sell 1 uSTX, donate 2 satoshis to rung 1, claim | `inv-sats = u2`, `inv-stx = u0` | False |

This is a direct rung-token donation edge case and is intentionally outside the randomized vault-call action set. The tests use strict local rung, token, and market fixtures in place of remote deployments, so the donation result is a suspected accounting issue to verify against the deployed rung behavior.
