# Router v5-3 and ladder v1: stxer fork tests and coverage

Scope: `contracts/swap-router-sbtc-stx-jing-v5-3.clar` (retail router over
the v6-3 book, Bitflow DLMM, Bitflow XYK and Velar) and
`contracts/jing-ladder-v1.clar` (rung registry, band seats, rung event log).
Same method as [README-v6-3-coverage.md](README-v6-3-coverage.md): every
number comes from stxer mainnet-fork runs whose deployments are
byte-identical to the current source, matched by sha256 (`--by-source`).

## 1. Source provenance

| contract | last change | sha256 (start and end of this work) |
|---|---|---|
| `swap-router-sbtc-stx-jing-v5-3` | `6a84e02` | `882374f40bfdf8270b3ea18ba2d7e68fce4431ee17c60f70b00bb2670240fe58` |
| `jing-ladder-v1` | `741de17` | `0f1e08b023272ed96a2653f727292626d4b0325dcf4e42963104d977860ec786` |
| `markets-sbtc-stx-jing-v6-3` (deployed next to them) | `34bbe18` | `5c08412fc5990a8bf0db3a0cbbec3fa4c859d4185d0caf1cd16ae0c78f851bfb` |
| `jing-core-v6` (deployed next to them) | `ac23d0a` | `88a689affb23f13030953e891336af42a3f5cb275f13b3c54c79d8cd4de50697` |

Every new suite prints the sha256 of the files it deploys at start and end
and fails if they differ. No `.clar` file was edited.

## 2. Test results

Every suite asserts exact outcomes. A refusal passes only when it returns the
expected error, moves nothing (the caller, the market and every pool, or the
ladder's whole state) and prints nothing.

| Suite | Passed / total | Unexpected failures | stxer |
|---|---|---|---|
| `verify-ladder-v1-admin-seats.js` | 334 / 334 | 0 | [05e53a0b18d65e210badc524ca7c48dd](https://stxer.xyz/simulations/mainnet/05e53a0b18d65e210badc524ca7c48dd) |

### `verify-ladder-v1-admin-seats.js`

The ladder has no external calls, so the fork needs no oracle. Rungs are
probe contracts (`ladprobe-*`, three distinct code hashes) whose only job is
to be the `contract-caller` the ladder hashes. Covered: `set-canonical`
(owner, bad side, all six sides, overwrite); `register` on a fixed side (one
per price, u6006) and on a band side (free seat counts, taken seat replaces,
full u6011, replacement allowed while full); `register-unseated`;
`seat-band` for never-seated, replaced and retired rungs at free and taken
spreads; `set-max-band-per-side` (floor per side, ceiling 49, 50 refused);
`retire-band`; `propose-owner` / `accept-owner` with the 144-burn-block
timelock (one block early refused, exactly at eligibility accepted, a
re-proposal restarts the clock); the six `log-*` entry points gated to
registered rungs, with `current` true for the seat holder and false for a
replaced, retired or unseated rung; every read-only getter read inside a
transaction through the probe. Every error code the ladder defines is
returned at least once.

Behaviour recorded by the suite:
- `set-canonical` overwrites; the owner can re-point a side at any time
  (including to a standard principal, which then refuses every register with
  u6002).
- `retire-band` reads the key before the owner check: a stranger on a free
  spread gets u6010, not u6001.
- `set-max-band-per-side` accepts exactly the current count, so the owner can
  freeze a side at its seats.

## 3. Coverage

### `jing-ladder-v1` (from `05e53a0b`)

| metric | covered / total | % |
|---|---|---|
| expressions executed | 247 / 473 | 52.2% |
| code lines touched | 141 / 300 | 47.0% |
| function-body lines touched | 141 / 272 | 51.8% |
| branch nodes (`if` / `match` / `asserts!`) fully taken | 24 / 24 | 100% |
| branch nodes never reached | 0 / 24 | 0% |
| error paths (failure arms) hit | 37 / 37 | 100% |

## 4. Remaining gaps

### `jing-ladder-v1`

No reachable but untested path remains. Every uncovered line is
instrumentation: the `ERR_*` constants, data-var / map declarations and other
top-level definitions run only at deploy, which stxer does not trace; lines
218 and 272 are the `(caller contract-caller)` binding pairs of `register` /
`register-unseated` (a binding, not a call; the functions run). The
expression total also counts tuple keys and `let` binding lists the tracer
never records as evaluated.

## 5. How to reproduce

```
node simulations/verify-ladder-v1-admin-seats.js
node simulations/trace-coverage.mjs --contract jing-ladder-v1 --by-source --md --sims 05e53a0b18d65e210badc524ca7c48dd
node simulations/failure-arms.mjs 05e53a0b18d65e210badc524ca7c48dd --by-source --contract jing-ladder-v1
```

Sim ids must be ONE comma-separated argument; a space-separated list counts
only the first.
