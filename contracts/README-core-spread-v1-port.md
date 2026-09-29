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

`npm run test:v6-3:integration`: **59/59 passing**, 26 mirrored scenarios
per rung plus seven real-dispatch scenarios with ten rungs per side, against
actual market/core/ladder/dispatch and both production rung bodies.
Each rung has **100% function, 99.05% line and 99.28% branch coverage**.
The original 16-test port regression included the sell exit that failed before
the port; its success expectation was not relaxed. The expanded suite adds
four successive rescales, old-epoch payouts and reserve dust, push pause and
cooldown, nonzero spreads, error guards and public-call recovery scenarios.

See [the full report and remaining gaps](../tests/unit/integration-v6-3/README.md)
and [generated coverage](../tests/unit/integration-v6-3/COVERAGE.md). One defensive
reserve over-claim branch per rung remains unhit; this is not a full audit or
a proof across every input/history.

## Stxer reference and status

The available historical timeout reference is
[the six-rung Stxer run, 549/549](https://stxer.xyz/simulations/mainnet/e63243934144cace6c9e4d753176cb30),
documented in [the timeout report](../simulations/README-v6-rungs-escrow-timeout.md).
That report dates to 2026-09-23 on top of `19c73b5`; it predates this rescale
and conditional-exit port. It is background evidence for timeout recovery,
**not validation of the current sell source**. Its blanket young-escrow
refusal behavior has been superseded for exits already covered by held/live funds.

The separate workstream has now published the
[current buy/sell Stxer report](../simulations/README-v1-core-spread-rungs.md):
**991/991 checks pass**, with both rung source hashes matching those below.
The [simulation](https://stxer.xyz/simulations/mainnet/02e540f6cdd8456f035ffdc1b7d520e5)
used core hash `d45f1bff…1bce`, including the other workstream's uncommitted
reconciliation logger; the Clarinet release report uses committed core
`67242f19…9b01`. These are separate dependency snapshots. Stxer documents its
remaining trace and fork-data limits; Clarinet additionally exercises a
successful push after the timeout cooldown with restored miner data.

## Source hashes

- Buy reference: `9a7b2381728ea1f11b80b1e200f3575e7cc68c1cd4da3d0bd758de5801c666f0`.
- Sell port: `ef91b6590508db48a859eb0ea66369108ed3d3cb46e63e25cb92b4c2e96964b0`.
- Market: `d1e3bbad46de1ba752507502b1caaca87b03e0b0abb344028636a57fc350cca9`.
- Core: `67242f19794e864336bc5adf5a00391281160176339922c17e964b938c289b01`.
- Ladder: `0f1e08b023272ed96a2653f727292626d4b0325dcf4e42963104d977860ec786`.
