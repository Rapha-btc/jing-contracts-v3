# Core-spread v1 rung integration in Clarinet

2026-09-29 updated-port result: **16/16 passing**. Buy reference: **8/8**.
Sell: **8/8**, including the formerly failing pending-escrow exit below. This is a
separate integration suite; it does not replace or change the existing
273 passing market unit tests or their coverage percentages.

Only `jing-buy-stx-core-spread-v1.clar` and
`jing-sell-stx-core-spread-v1.clar` are in scope. The buy rung is the
reference for the sell port now present in the local working tree. The other four v1 rungs and all older
rungs are excluded. The selected router is
`swap-router-sbtc-stx-jing-v5-3.clar`, whose market dependency is v6-3;
router tests have not been added to this suite yet. The contract workstream
ported the sell rung after the initial failure; this suite reran without
changing its successful-exit expectation. This test work did not edit contracts.

The [sell port note](../../../contracts/README-core-spread-v1-port.md) records
the contract changes and Stxer reference status. The available Stxer timeout
run predates this port; it is not counted as current-source validation.

## Run

```sh
npm run test:v6-3:integration
# Isolate the formerly failing exit regression (both now pass):
npm run test:v6-3:integration -- -t 'young pending top-up'
```

The command passes against the source hashes below. The regression expects
a successful withdrawal; it was not skipped or converted into an expected-error
test to accommodate the pre-port behavior.

## Real code and dependency boundaries

The suite rebuilds from the current production files on every invocation:

- Real v6-3 market, both real core-spread v1 rungs, real core-v6, real ladder-v1.
- Core and ladder source is byte-identical. Market/rung substitutions are
  limited to dependency principals and the local sBTC asset identifier.
  `build.mjs` lists every substitution; the suite compares entire generated
  files against those declared substitutions and fails if a production source
  changes during the run.
- sBTC is represented by the existing strict, explicitly funded SIP-010
  fixture. STX uses Clarinet's actual native ledger. The wrapped-STX principal
  supplies the market trait identity; these scenarios transfer native STX.
- Pyth and the RFQ native price are configurable oracle inputs. This does not
  test signed messages, mainnet sBTC, or the RFQ's tenure-price computation.
- No injected storage, appended accounting helpers, replacement market/core/
  ladder loggers, or reduced book capacities. Only public production functions
  construct the positions; simulated burn blocks advance the escrow timeout.
- Rungs register through the ladder's canonical code-hash checks. They do not
  register as core custodians: core tracks their admitted market escrow, while
  the rung tracks its members and locally held funds/proceeds.

These initial scenarios use zero spread and the normal miner guard. They
are not a claim of complete rung coverage, rescale coverage, or equivalence
between every behavior of the sell port and the buy reference. Raw LCOV and Vitest
JSON are separate under `.build/`; the market-only coverage report is untouched.

## Scenarios

| Public-call scenario | Buy | Sell |
| --- | --- | --- |
| Real registration, funding and full withdrawal with market/core paused | Pass | Pass |
| Two members: partial exit preserves the other member, then full recovery | Pass | Pass |
| Core pause refuses admission; rung holds the deposit and returns it | Pass | Pass |
| Unauthorized initialization cannot acquire another ladder seat | Pass | Pass |
| Partial maker fill, member proceeds, rounding remainder and paused exits | Pass | Pass |
| Ladder seat retirement preserves claims and exit access | Pass | Pass |
| Expired pending deposit refunds without an oracle while both contracts pause | Pass | Pass |
| Young pending top-up does not block an already funded live withdrawal | Pass | Pass |

## Fixed sell-port regression: unrelated young escrow blocked a funded exit

The initial run had 15 passes and one failure on sell source
`f2eaa44c6464d901d36f701f8f3e36b4788f3afdd7ed8531b709525cf0981983`.
The subsequent local port (`ef91b659…`) passes all 16 tests. The following
records the original failure and its recovery evidence.

Reproducer in `rungs.test.ts`, using real public calls:

1. Alice deposits 1,000,000 micro-STX through the sell rung; it rests live
   in the market and core records that escrow.
2. A non-crossing sBTC maker is admitted on the opposite side.
3. Bob deposits 1,000,000 micro-STX through the same rung. With the opposite
   side present, the market correctly holds this top-up as pending escrow.
4. Pause market and core. Alice requests 500,000 micro-STX with `update: none`.
   Her existing live funds suffice, and the market's partial withdrawal permits
   paused exits.
5. The pre-port sell rung returned **`(err u7012)`** instead of paying Alice.

Original cause: sell `withdraw` called `settle-escrow` unconditionally before `sync`
(`contracts/jing-sell-stx-core-spread-v1.clar:409`). Young escrow then requires
an update, even when the withdrawal does not need that escrow. This is the
already noted escrow-exit port gap, not a new market/core refund rejection.
The buy reference instead uses `escrow-for`: only a withdrawal exceeding
held plus live/parked funds must settle pending escrow. Its mirrored test passes.

The failing test also verifies no change to Alice/Bob's positions, pending
escrow, rung state, tracked core equity, or relevant custody after the refusal.
It then advances past 24 hours and verifies both members recover their full
input with market/core still paused and no oracle update; rung input custody,
market input custody and rung core equity all reach zero. This establishes
a blocked immediate exit and working timeout recovery in this scenario,
not permanent loss. The test still fails at the original successful-exit
expectation after those recovery checks.

The port now calls `escrow-for` only when the exit needs escrow, matching
the buy reference. The mirrored successful-exit regression passes on both
rungs. Rescale, cooldown, nonzero spreads and additional router scenarios
still need dedicated Clarinet coverage; the 16 passes are not a full port audit.

## Source provenance

The recorded run used:

| Source | SHA-256 |
| --- | --- |
| Market v6-3 | `d1e3bbad46de1ba752507502b1caaca87b03e0b0abb344028636a57fc350cca9` |
| Core v6 | `67242f19794e864336bc5adf5a00391281160176339922c17e964b938c289b01` |
| Ladder v1 | `0f1e08b023272ed96a2653f727292626d4b0325dcf4e42963104d977860ec786` |
| Buy core-spread v1 | `9a7b2381728ea1f11b80b1e200f3575e7cc68c1cd4da3d0bd758de5801c666f0` |
| Sell core-spread v1 | `ef91b6590508db48a859eb0ea66369108ed3d3cb46e63e25cb92b4c2e96964b0` |

Generated principal substitutions and their hashes are in `.build/sources.json`;
the result file is `.build/results.json`. Local full log:
`/tmp/v6-3-rung-integration-updated.log` (the original failing run is
`/tmp/v6-3-rung-integration.log`). This evidence is tied to these files, not
to another agent's subsequent port or an older deployed rung.
