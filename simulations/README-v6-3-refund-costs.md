# v6-3 full-book refunds against mainnet sBTC

**291 checks pass, zero failures.** [Stxer fork](https://stxer.xyz/simulations/mainnet/43609e30c152961588a08a0435f6d6ba) at Stacks block
9086351 (epoch 4.0). This is a simulation, not an on-chain
deployment or broadcast. The market and core deployments are byte-identical to
the current production source; no function, storage, token, or oracle is mocked.

The actual sBTC contract is `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`. The y asset uses native
STX transfers and the market's production wrapped-STX trait identity. Signed
Lazer updates go through the actual oracle to admit the opposite-side maker.

## Refund outcomes and costs

For each side, public transactions fund and admit 50 makers, admit an opposite
maker, and escrow the original maker's top-up. Both market and core are paused
before cancellation. The cancel transaction refunds the live position plus
pending top-up. Assertions verify exact wallet gains, the other 49 makers'
exact depositor list and aggregate custody, unchanged opposite-side custody,
cleared caller claims/core equity, and both actual core refund prints.

| Side | Exact refund (sats / micro-STX) | Runtime (% epoch budget) | Reads (% epoch budget) | Remaining same-side custody |
| --- | ---: | ---: | ---: | ---: |
| x | 20000 | 293,036 (0.00586%) | 95 (0.317%) | 490000 |
| y | 2000000 | 260,516 (0.00521%) | 87 (0.290%) | 49000000 |

Every measured execution-cost dimension is below **0.317%** of the epoch budget.
The highest is sBTC read count: 95 of 30,000. Runtime is below 0.006% on both
sides. Costs are the transaction receipt's `execution_cost`, not its wall-clock
`costs` field. The budget is fetched from the node's `/v2/pox` epoch table and
checked against the fork's epoch and burn height. Epoch 4.0 has larger read
budgets than the local Clarinet profile; this accounts for part of the lower
percentage versus the 0.64% local maximum. Raw values are saved in the fixture.

Before the measured transaction, a tenure-extension step resets the simulation
budget. The cancellation itself executes as one ordinary, metered transaction.
Resets between setup/read steps avoid mistaking cumulative setup work for the
cost of a single cancellation. Metering is never disabled.

This provides substantial execution-cost headroom for the tested full-book
refunds and confirms exact transfers through actual sBTC. It does not claim
coverage of every settlement route or every possible external failure. The
[core debit bounds and returned-error handling](../tests/unit/v6-3/REFUND-SAFETY.md)
are separately verified by the Clarinet regressions. No contract was changed
for this Stxer run.

## Reproduction and source identity

```sh
node simulations/verify-v6-3-refund-costs.js
```

The harness stops on any assertion, engine, VM, or postcondition failure.
Output: [source-matched result](fixtures/v6-3-refund-costs.json), with raw setup
and final receipts under ignored `simulations/results/v6-3-refund-costs/`.
`--resume-setup` can reuse a saved setup only if its source hashes match and the
remote session has no steps beyond that saved setup. The recorded run includes
two additional resume-validation checks. Two initial harness assertions needed
correction (deployment returns `(ok true)`, and the tip exposes epoch as `4.0`);
they stopped locally before cancellation and did not represent contract errors.

- Market SHA-256: `d1e3bbad46de1ba752507502b1caaca87b03e0b0abb344028636a57fc350cca9`.
- Core SHA-256: `67242f19794e864336bc5adf5a00391281160176339922c17e964b938c289b01`.
- Ladder SHA-256: `0f1e08b023272ed96a2653f727292626d4b0325dcf4e42963104d977860ec786`.
- Mainnet sBTC source SHA-256: `8f0a0edd55fa25613aac50769cf18a671227333850950d4f7f1f913ea0a9c8d1`.

This report stands separately from the older consolidated Stxer coverage report;
its check counts and receipt costs are not a source-coverage percentage.
