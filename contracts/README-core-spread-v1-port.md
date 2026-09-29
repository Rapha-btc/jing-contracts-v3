# Sell core-spread v1 port from the buy reference

The sell rung now mirrors the accounting and exit structure of
[`jing-buy-stx-core-spread-v1.clar`](jing-buy-stx-core-spread-v1.clar), with
native STX as the deposited asset and sBTC as proceeds. Only
[`jing-sell-stx-core-spread-v1.clar`](jing-sell-stx-core-spread-v1.clar) is
ported here; the other four rung templates are outside this change.

The port adds rescale-aware shares and proceeds, member counts, final epoch
scales and reserve-dust release. It preserves proceeds arriving with no
members for the next epoch. It also brings over owner-controlled push pause,
the 24-hour push cooldown following timeout cancellation, and `escrow-for`:
a withdrawal asks to settle young pending escrow only if held plus live/parked
funds cannot cover that withdrawal.

The practical exit regression is Alice withdrawing already-live STX while
Bob has an unrelated young pending top-up. Before the port, sell `withdraw`
unconditionally called `settle-escrow` and returned `u7012` without an oracle
update. It now permits that funded exit, including while market and core are
paused. A withdrawal needing the young pending funds still requires an update;
expired escrow retains the no-oracle cancellation path.

## Clarinet evidence

`npm run test:v6-3:integration`: **16/16 passing**, eight mirrored scenarios
per rung, against the actual market/core/ladder and both production rung
bodies. The pre-port sell source produced **15 passes and one failure**;
the success expectation was not relaxed. Tests check live and timeout refunds,
partial exits, preservation of another member's funds, maker proceeds,
refused admission, registration, and seat retirement.

See [the full report and reproducer](../tests/unit/integration-v6-3/README.md)
for source hashes, dependency substitutions and limits. The current 16 tests
do not fully audit rescaling or the new push controls.

## Stxer reference and status

The available historical timeout reference is
[the six-rung Stxer run, 549/549](https://stxer.xyz/simulations/mainnet/e63243934144cace6c9e4d753176cb30),
documented in [the timeout report](../simulations/README-v6-rungs-escrow-timeout.md).
That report dates to 2026-09-23 on top of `19c73b5`; it predates this rescale
and conditional-exit port. It is background evidence for timeout recovery,
**not validation of the current sell source**. Its blanket young-escrow
refusal behavior has been superseded for exits already covered by held/live funds.

No completed Stxer report matched to the current buy reference or sell port
was available in this checkout when this note was written. The separate Stxer
workstream is running the buy reference suite. Its resulting source hashes,
simulation URL and check count should be recorded when available; the sell
port also needs its own source-matched run. No current-source Stxer pass is
claimed here, and no older simulation is relabeled as v1 port coverage.

## Source hashes

- Buy reference: `9a7b2381728ea1f11b80b1e200f3575e7cc68c1cd4da3d0bd758de5801c666f0`.
- Sell port: `ef91b6590508db48a859eb0ea66369108ed3d3cb46e63e25cb92b4c2e96964b0`.
- Market: `d1e3bbad46de1ba752507502b1caaca87b03e0b0abb344028636a57fc350cca9`.
- Core: `67242f19794e864336bc5adf5a00391281160176339922c17e964b938c289b01`.
- Ladder: `0f1e08b023272ed96a2653f727292626d4b0325dcf4e42963104d977860ec786`.
