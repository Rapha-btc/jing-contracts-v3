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
| `verify-router-v5-3-manual.js` | 358 / 358 | 0 | [377132c3bc59c7f670ea5ff847b79ff8](https://stxer.xyz/simulations/mainnet/377132c3bc59c7f670ea5ff847b79ff8) |
| `verify-router-v5-3-smart.js` | 501 / 501 | 0 | [424cd36a45d91d992f0dcb62d0e3ea08](https://stxer.xyz/simulations/mainnet/424cd36a45d91d992f0dcb62d0e3ea08) (routes), [7dbd701cc51416a20e60d7c8ee70f268](https://stxer.xyz/simulations/mainnet/7dbd701cc51416a20e60d7c8ee70f268) (min-taker), [c78c356f71757f0350d4fc17f5f6d985](https://stxer.xyz/simulations/mainnet/c78c356f71757f0350d4fc17f5f6d985) (DLMM fees 0 and the +500 edge) |

Both router suites share `_router-v5-3-harness.js` and need a signed Lazer
print: `PYTH_API_KEY=<key> node simulations/verify-router-v5-3-<suite>.js`
(without a key `_lazer.js` falls back to the faktory backend). The key is never
stored in the repo. They deploy the working-tree core-v6, ladder-v1,
market v6-3 and router at the router's `JING_MARKET` id, trade against the
real mainnet DLMM / XYK / Velar pools and log the pools' depth at the fork
(e.g. `377132c3`: DLMM active bin 431, 50 bps fee per side, 312,029 STX and
4.31 BTC; XYK 126,556 STX / 0.474 BTC; Velar 199,609 STX / 0.745 BTC).

The older router suite `verify-swap-router-v3-lazer.js`, run with `V6=1`,
passes 287 / 287 on two mids
([f93fd2b6](https://stxer.xyz/simulations/mainnet/f93fd2b69a051c3129e0600f42075483),
[1b0d36cf](https://stxer.xyz/simulations/mainnet/1b0d36cf5959ff8bb66ca76e87a0fd12)).
Its expectations were updated to the current market and to live pool state,
test side only: W8 / W9g / W9a / W9d / W13 / W17 gross up at 20 bps with the
exact inverse (`0d6ae85`, `34bbe18`); W9a / W9g / W17 sell 1.5x the bid's
live capacity instead of a fixed 40000 sats (100 STX now holds more); W18p
sells the DLMM's live capacity to 5.5% under the mid (u3001 when it already
sits there) instead of a fixed 1.2 BTC; W18a sets its limit 1% under the
lower pool's live spot and first proves the DLMM has no room there.

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

### `verify-router-v5-3-manual.js` (both directions)

- **G guards**: u3001 zero amount (before a bad fallback), u3004 split under
  and over the amount (before a bad fallback), u3003 fallback u0 / u4, u3005 a
  book leg with `update` none.
- **A one venue at a time** (no book leg, update none): XYK and Velar outputs
  predicted to the unit from the pools' own formulas (read from their mainnet
  source: xyk-core fees off the input then `y * dx / (x + dx)`; Velar
  `calc-fees` then `univ2-math find-dx`), DLMM measured on the wallet; a u0
  minimum floored to u1 (Velar would refuse u0).
- **B venue minimums**: XYK / Velar refuse at quote + 1 (u1020 selling sBTC,
  u1019 selling STX, Velar u107) and fill at exactly the quote; DLMM refuses
  an impossible minimum (u2003).
- **C book leg**: full fill; partial fill with a sub-minimum rest refunded and
  the residual on the fallback venue on top of its plan; fill-or-kill
  refusals (empty book; zero limit, market u1011, with an ample book left
  untouched) with the whole book leg on each fallback venue; the pro-rata
  minimum: plan X on XYK, residual X on top, the smallest minimum whose
  scaled value reaches the venue's output + 1 is refused although the
  unscaled minimum would pass on X, and one scaled to the output fills;
  fallback none (unsold == book leg, out u0; min-out u1 -> u3002); all four
  legs at once; min-out one over the exact output -> u3002 after every leg
  ran, all rolled back.
- Every success: `out` == wallet gain == sum of the leg outs, the sold-asset
  debit == sum of the leg ins, `amount` == ins + `unsold`, one router print
  carrying the ok tuple plus topic / user / amount.

### `verify-router-v5-3-smart.js`

Each call is predicted from the router's own sizing read on the fork just
before it, as the caller (`jing-size`, `dlmm-capacity`, both
`cp-capacity`s): the print's `jing-cap` / `dlmm-cap` / `xyk-cap` /
`velar-cap`, `dlmm-in == min(cap, left)`, the `cp-split` pro rata, `unsold`,
the dust early exits, and (with no book leg) XYK / Velar outputs to the unit.
Every AMM leg's output is checked against the limit (`limit-min`).

- **Session 1, both directions**: S0 guards u3001 / u3006 / u3007 and their
  order; S1 update none, loose limit: the 30-bin walk never stops, DLMM
  absorbs everything, the CP stage exits on zero; S2 the tightest limit with
  room on all three venues (found by scanning, logged, e.g. selling sBTC at
  26,530,312,866,551: DLMM 1,241,133, XYK 21,665, Velar 498,498 sats of
  room): the walk stops at the first bin past the limit, the residual split
  pro rata; S3 residual over both pools' room: each pool to its cap, the extra
  unsold; S4 a limit nobody respects: every cap 0, unsold == amount, out u0,
  min-out u1 -> u3002; S5 dust (worth <= 1 unit at the limit, including the
  `limit-min` slack arm) skips both stages; S6 book capacity over the amount
  (`jing-size` = amount); S7 under it (`jing-size` = gross-cap, the rest on
  the AMMs); S8 the min-dep skip at the exact boundary (net 999 / 1000 sats,
  999,999 / 1,000,000 uSTX); S9 a wrong mid hint doubles the sized book leg,
  the market refuses fill-or-kill, the maker is untouched, the AMMs take it
  all; S10 a caller who signed more than it holds: the DLMM leg (DLMM router
  u2001), then the XYK leg (u1), then the Velar leg (u1) fails inside the
  smart stages, everything rolled back.
- **Session 2, min-taker skip** (the capacity suite's `fin` fixture: 49
  ladder seats reserved, one unseated in-range ask Q of 2,000 sats, so the
  sBTC side is full): `get-taker-capacity` min-taker = 2,001; a net of 1,497
  (over min-dep, under min-taker) sizes no book leg although gross-cap is
  larger, the book is untouched; a net of 2,594 sizes and fills the book leg.
- **Session 3, DLMM fees and edges**: Bitflow's DLMM admin (impersonated on
  the fork) sets the pool's fees to 0 through `dlmm-core-v-1-1`
  `set-x-fees` / `set-y-fees`, which reaches the walk's no-fee arm in both
  directions; a 5 BTC manual DLMM leg walks the pool from bin 431 to bin 500
  and stops short (a partial fill: 124,750,825 sats taken, 375,249,175
  unsold in the wallet); a smart sBTC sale then walks from bin 500, keeps it
  and stops (the edge arm).

## 3. Coverage

### `swap-router-sbtc-stx-jing-v5-3`

Baseline before this work, from the runs listed in the v6-3 README section 2
and the core-spread rung README (24 sims; the router is counted in
router-impact's four runs and deploy-bytes): 184 / 926 expressions, 116 / 548
lines, 70 branch nodes: 17 full, 8 partial, 45 never reached, 2 / 35 error
paths (u3002 in both manual entry points). The smart entry points were never
called on the current bytes. (`verify-v6-3-router-bin-boundary.js`
installs the router with `SetContractCode`, which is not a deploy
transaction, so source-hash matching does not count it.)

From the new suites (`377132c3`, `424cd36a`, `7dbd701c`, `c78c356f`):

| metric | covered / total | % |
|---|---|---|
| expressions executed | 588 / 926 | 63.5% |
| code lines touched | 340 / 548 | 62.0% |
| function-body lines touched | 340 / 517 | 65.8% |
| branch nodes fully taken | 67 / 70 | 95.7% |
| branch nodes partial | 2 / 70 | |
| branch nodes never reached | 1 / 70 | |
| error paths (failure arms) hit | 35 / 35 | 100% |

### `jing-ladder-v1`

Baseline before this work, from the same 24 sims (the ladder is deployed in
23 of them next to the market and the rungs): 191 / 473 expressions, 108 /
300 lines, 24 branch nodes: 16 full, 1 partial (`claim-seat`'s replace arm),
7 never reached, 5 / 37 error paths.

From the new ladder suite (`05e53a0b`):

| metric | covered / total | % |
|---|---|---|
| expressions executed | 247 / 473 | 52.2% |
| code lines touched | 141 / 300 | 47.0% |
| function-body lines touched | 141 / 272 | 51.8% |
| branch nodes (`if` / `match` / `asserts!`) fully taken | 24 / 24 | 100% |
| branch nodes never reached | 0 / 24 | 0% |
| error paths (failure arms) hit | 37 / 37 | 100% |

### Combined (baseline runs + new runs, current source only)

Router: the 24 baseline sims plus the four new router runs (28 sims, 3,927
transactions, 144 calls to a counted router instance, all traced, 0 decode
errors). Ladder: the same plus the ladder run (29 sims, 4,083 transactions,
146 calls to a counted ladder instance, all traced, 0 decode errors). The
baseline adds nothing the new suites do not already reach:

| contract | expressions | lines | branch nodes full / partial / never | error paths |
|---|---|---|---|---|
| `swap-router-sbtc-stx-jing-v5-3` | 588 / 926 (63.5%) | 340 / 548 (62.0%) | 67 / 2 / 1 of 70 | 35 / 35 |
| `jing-ladder-v1` | 247 / 473 (52.2%) | 141 / 300 (47.0%) | 24 / 0 / 0 of 24 | 37 / 37 |

## 4. Remaining gaps

### `swap-router-sbtc-stx-jing-v5-3`

No reachable but untested path remains.

| line | what | class | why |
|---|---|---|---|
| 227 (else arm), 236-240 | `xyk-swap` when the pool's x-token is not sBTC | provably unreachable | `XYK_POOL` is a constant; its `x-token` is sBTC and is written once, by `create-pool`, which `xyk-core-v-1-2` refuses on a created pool (`ERR_POOL_ALREADY_CREATED`) |
| 771 (else arm) | `cp-split`'s zero-total guard | provably unreachable | taking it needs `residual <= total` with `total = 0`, i.e. residual 0; the only caller, `cp-stage`, exits on `left = 0` first (the Clarinet router suite reaches the same conclusion) |
| 117-146, 608-610, 703, 799-801 | constants, `ERR_*`, `DLMM_WALK_BINS` | instrumentation | deploy-time definitions, not traced by stxer |
| 411, 512, 1014, 1082 | `(user tx-sender)` | instrumentation | a `let` binding pair, not a call; the functions run |

The expression total also counts tuple keys and `let` binding lists the
tracer never records as evaluated.

Not exercised on the fork, with no branch of its own: the walk at the **-500**
edge. It takes the same arms as +500 (`edge` is one expression,
`(if (get up acc) 500 -500)`, whose down arm runs on every STX sale). Pushing
the pool there needs its ~4.3 BTC of bins below the active one bought with
STX: 800,000 STX (the largest wallet found holds ~1.05M) moved it only from
bin 434 to 372.

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
PYTH_API_KEY=<key> node simulations/verify-router-v5-3-manual.js
PYTH_API_KEY=<key> node simulations/verify-router-v5-3-smart.js
node simulations/trace-coverage.mjs --contract swap-router-sbtc-stx-jing-v5-3 --by-source --md --sims 377132c3bc59c7f670ea5ff847b79ff8,424cd36a45d91d992f0dcb62d0e3ea08,7dbd701cc51416a20e60d7c8ee70f268,c78c356f71757f0350d4fc17f5f6d985
node simulations/failure-arms.mjs 377132c3bc59c7f670ea5ff847b79ff8,424cd36a45d91d992f0dcb62d0e3ea08,7dbd701cc51416a20e60d7c8ee70f268,c78c356f71757f0350d4fc17f5f6d985 --by-source --contract swap-router-sbtc-stx-jing-v5-3
node simulations/verify-ladder-v1-admin-seats.js
node simulations/trace-coverage.mjs --contract jing-ladder-v1 --by-source --md --sims 05e53a0b18d65e210badc524ca7c48dd
node simulations/failure-arms.mjs 05e53a0b18d65e210badc524ca7c48dd --by-source --contract jing-ladder-v1
```

For the combined figures, prepend the sim ids of section 2 of
[README-v6-3-coverage.md](README-v6-3-coverage.md) and the core-spread rung
runs `feefde943db62d21f3c3dbf249708e0c`, `4135a4ef4d94ca74c8a5cdbae5d93f76`,
`6833db442f85d2f3403f3e31001dcb63` and the core admin run
`9581ea76408083fef64e1232d96fc477`. Sim ids must be ONE comma-separated
argument; a space-separated list counts only the first.
