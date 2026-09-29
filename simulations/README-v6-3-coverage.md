# v6-3 market: stxer fork tests and coverage

Scope: `contracts/markets-sbtc-stx-jing-v6-3.clar` (submit + settle market).
Older market versions are out of scope. All numbers below come from one rerun
of the 15 suites on the current source, plus one suite added for the last reachable gaps; earlier figures are kept only in the
History section at the end.

## 1. Source provenance

| item | value |
|---|---|
| market source commit (last change to the file) | `1a930e3` (2026-09-28) |
| market source sha256 | `7f7bc5cce3c6f01c92c2e69c8ffe5652d3dc038a7394a816e2740dd4490cdd74` |
| repo HEAD when measured | `f1638a4` (later commits touch tests only; the market file is unchanged) |

Only traces from deployments whose code is **byte-identical** to that source
are combined. `simulations/_sim-source.mjs` decodes every deploy transaction in
every stxer result and hashes its code; `--by-source` in
`trace-coverage.mjs` and `failure-arms.mjs` counts a deployment only on an
exact sha256 match. Excluded on purpose (other code): router-impact's two
baseline runs deploy the market from `f6a6d3a` (sha `2213b5b5…`) to compare
router results; `router-bin-boundary` deploys its own stand-in market (sha
`04b0a7df…`); `submit-settle-lazer`'s `zero-limit-before-*` markets are the
pre-fix source. Rungs, core, ladder, router, dispatch and probe contracts are
not the market and are not counted.

## 2. Test results

Every suite asserts exact outcomes, including negative tests: a call that must
be refused passes when it returns the expected error and moves nothing. All 16
suites pass; **5,896 / 5,896 checks, 0 unexpected failures.**

| Suite | Passed / total | Unexpected failures | stxer |
|---|---|---|---|
| `verify-v6-3-submit-settle-lazer.js` | 950 / 950 | 0 | [6c4f5124](https://stxer.xyz/simulations/mainnet/6c4f5124a4cd6343efcd9ce1bd922c8f) |
| `verify-v6-3-ghost-deposit.js patched` | 343 / 343 | 0 | [04bf014e](https://stxer.xyz/simulations/mainnet/04bf014ef68d7494ba580da81aba8d3e) |
| `verify-v6-3-switched-off-ask.js patched` | 221 / 221 | 0 | [6edc653c](https://stxer.xyz/simulations/mainnet/6edc653ce6cb39b0a1e984a154baeaa4) |
| `verify-v6-3-cancel-orphan-pending.js patched` | 225 / 225 | 0 | [4f6d741c](https://stxer.xyz/simulations/mainnet/4f6d741c82603b60e8062be232757fd6) |
| `verify-v6-3-router-impact.js` | 398 / 398 | 0 | [5d875f4f](https://stxer.xyz/simulations/mainnet/5d875f4f6595b123c4b81973da3a5fe6), [7e4f80db](https://stxer.xyz/simulations/mainnet/7e4f80db4c89b5291e87d2ef7d67cc8f), [e1af00bd](https://stxer.xyz/simulations/mainnet/e1af00bdacf448e55ca7e36fdd6ae09a), [f9b6d8fd](https://stxer.xyz/simulations/mainnet/f9b6d8fdb1ebad6a3233b5f4bfa972ae) |
| `verify-v6-3-caller-impact.js` | 198 / 198 | 0 | [5421ff9e](https://stxer.xyz/simulations/mainnet/5421ff9edac745da49008263b3975214) |
| `verify-v6-3-dispatch.js` | 194 / 194 | 0 | [c85620c4](https://stxer.xyz/simulations/mainnet/c85620c4772eb253abcd4d1e7ece9755) |
| `verify-v6-3-gate-blind-band.js` | 332 / 332 | 0 | [b01dd89d](https://stxer.xyz/simulations/mainnet/b01dd89de2b25dd7f92b9d6a9dc7282f) |
| `verify-v6-3-deploy-bytes.js` | 17 / 17 | 0 | [218fa300](https://stxer.xyz/simulations/mainnet/218fa3002a3d443f90308b713184ebf0) |
| `verify-v6-3-router-bin-boundary.js` | 22 / 22 | 0 | [4ea07b1d](https://stxer.xyz/simulations/mainnet/4ea07b1d71ce00250f32d45769f2fa15) |
| `verify-v6-3-swap-walk.js` | 382 / 382 | 0 | [08b628cb](https://stxer.xyz/simulations/mainnet/08b628cbdafa114dac16b71bafd45138) |
| `verify-v6-3-capacity.js` | 472 / 472 | 0 | [37f35699](https://stxer.xyz/simulations/mainnet/37f35699311ec30e6028e58feb26d38d) |
| `verify-v6-3-settlement-edges.js` | 365 / 365 | 0 | [aeb76701](https://stxer.xyz/simulations/mainnet/aeb76701adb25b7a1dfb673ead63ac52) |
| `verify-v6-3-errors-admin.js` | 514 / 514 | 0 | [880c87e0](https://stxer.xyz/simulations/mainnet/880c87e00142dd3910a7d1bbe3099e2b) |
| `verify-v6-3-full-side.js` | 921 / 921 | 0 | [4da85888](https://stxer.xyz/simulations/mainnet/4da85888899cf282a57ab1657b3b0c18) |
| `verify-v6-3-reachable-gaps.js` (added for the gaps in section 4) | 342 / 342 | 0 | [7515f273](https://stxer.xyz/simulations/mainnet/7515f2730d0548151b7d155cd3f71064) |

`errors-admin` pins its fork to block 8984873 so that the signed but malformed
Lazer updates saved by the earlier lazer-paths run `c014c741` are still fresh;
it deploys the current source like the others.

## 3. Coverage (combined, current source only)

19 simulation runs, 3,136 transactions. 1,774 are calls to a counted market
instance: **all 1,774 have a trace, 0 decode errors.** The 452 transactions
without a trace are all outside the market (deploys, STX / sBTC fundings,
ladder calls).

| metric | covered / total | % |
|---|---|---|
| expressions executed | 3,130 / 4,348 | 72.0% |
| code lines touched (incl. deploy-time definitions) | 1,714 / 2,585 | 66.3% |
| function-body lines touched | 1,714 / 2,476 | 69.2% |
| branch nodes (`if` / `match` / `asserts!`) fully taken | 290 / 298 | 97.3% |
| branch nodes never reached | 0 / 298 | 0% |
| error paths (failure arms) hit | 153 / 296 | 51.7% |

What "error path (failure arm)" means: every `asserts!`, `unwrap!`,
`unwrap-err!` and `try!` can return early with an error. The arm is **hit**
when a trace records that node returning `EarlyReturn` in a simulated call,
i.e. the contract really took that error path. The suites trigger these on
purpose; each is a passing negative test. `trace-coverage.mjs` cannot see these
arms (the returned value is a constant, not a traced expression), so
`failure-arms.mjs` counts them separately.

Reproduce (sim ids as in section 2):

```
node simulations/trace-coverage.mjs --contract markets-sbtc-stx-jing-v6-3 --by-source --sims <ids>
node simulations/failure-arms.mjs <ids> --by-source
```

## 4. Remaining gaps

### Expressions and lines not covered (1,218 expressions, 871 lines)

- **Instrumentation (deploy time):** 109 top-level lines, the 31 `ERR_*`
  constants and the map / data-var declarations run only at deploy, which
  stxer does not trace.
- **Instrumentation (tool quirk):** `(caller tx-sender)` / `(swapper tx-sender)`
  `let` bindings in `withdraw-token-*`, `cancel-token-*-deposit`,
  `cross-remainder-as-*` are binding pairs, not calls; the functions run.
- **Instrumentation (evals are not traced):** `get-settlement`,
  `get-distance-slots`, `get-token-*-pending-limit` are exercised by the suites
  through read-only evals, which stxer does not trace.
- **Reachable, untested: none.** The eight read-only getters no suite called
  (`get-token-*-limit`, `get-seated-*`, `is-protected-*`,
  `get-token-*-pending-readmit`) are now called inside transactions through the
  `gapsprobe-v1` contract in `verify-v6-3-reachable-gaps.js`, each value
  asserted.
- The eight partial branches below.

### Partial branches (8 of 298): one arm provably unreachable

| line | function | untaken arm | why |
|---|---|---|---|
| 13 | `rebate-bps-for-age` | age >= 80 s | callers refuse a print 80 s or older first (`ERR_STALE_PRICE`) |
| 2936, 2977 | `walk-*-book-step` | `match` error arm | `execute-fill` fails only on a transfer or `log-match`; transfers are covered by the custody argument below (A3), `log-match` by A2, and a treasury equal to the market is refused since `e338e27` |
| 3526, 3530, 3621, 3625 | `distribute-to-token-*-depositor` | total = 0 | these run only over listed depositors, each holding a positive amount |
| 3928 | `gross-up` | `(- g u1)` | `g = floor(net x 10000 / 9980)` gives `g - floor(20 g / 10000) <= net`, so `n > net` never holds |

### Error paths not hit (143 of 296)

| group | arms | lines | classification |
|---|---|---|---|
| A1 core-v6 log calls that are not pause-gated | 51 | 930, 958, 1235, 1327, 1368, 1392, 1405, 1478, 1570, 1611, 1635, 1648, 1682, 1698, 1721, 1756, 1772, 1795, 1849, 1899, 1913, 1941, 1966, 1982, 2010, 2035, 2064, 2075, 2112, 2130, 2159, 2170, 2207, 2225, 2266, 2293, 2303, 2352, 2381, 2391, 2445, 2493, 2538, 2582, 2883, 2894, 3592, 3600, 3687, 3695, 3742 | **provably unreachable.** In `jing-core-v6` only `log-deposit-x/-y`, `log-match` and `log-settlement` check the pause; every other log fails only when the caller is not a registered market, and core-v6 has no unregister. Before `initialize`, `token-x` / `token-y` hold a standard principal no trait can match, so the paths that reach these logs are refused earlier. |
| A2 `log-match` | 1 | 2906 | **provably unreachable.** It is pause-gated, but it only runs inside a swap / reprice walk, after `log-settlement` in the same transaction, which fails first on a paused core. |
| A3 token transfers out of escrow | 62 | 1365–1366, 1389–1390, 1402–1403, 1608–1609, 1632–1633, 1645–1646, 1678–1679, 1694–1695, 1707–1708, 1752–1753, 1768–1769, 1781–1782, 1832–1833, 1882–1883, 2817–2828, 2880–2881, 2891–2892, 3259–3269, 3326–3336, 3477–3484, 3564–3566, 3589–3590, 3659–3660, 3681–3683, 3729–3736 | **unreachable under the custody invariant, not a formal proof.** A transfer out of escrow fails only on a zero amount (guarded), a recipient equal to the sender (the market cannot call itself; the treasury cannot be the market since `e338e27`), a wrong token (traits are checked against `token-x` / `token-y`), or insufficient escrow. The last is excluded by the invariant "market balance = live + parked + pending per token", which the suites assert after every fund-moving step. |
| A4 structural | 15 | 1227, 1470 (filtered append in the full branch), 1401, 1644 (park error other than u1010), 2258, 2344 (second read of the same update in one tx), 2618, 2624, 2630, 2954, 2995, 3240, 3307, 3521, 3616 (propagation of errors that A1–A3 exclude) | **provably unreachable.** The full branch filters one entry before appending; `park-tenth-*` only fails with u1010; the rest only re-raise errors from A1–A3. |
| A5 seat list full (`ERR_SEATS_FULL`) | 2 | 142, 146 | **provably unreachable.** `jing-ladder-v1` caps band seats at 49 (`set-max-band-per-side` refuses 50, `ERR_BAND_FULL`), below the 50-entry seat list. |
| A6 `ERR_ALREADY_SETTLED` | 1 | 3400 | **provably unreachable.** The cycle advances in the same transaction that writes its settlement. |
| B signed-oracle fixtures | 11 | 1065 (y-feed shape), 1083 (y-feed stale), 1084, 1085, 3401, 3402, 3413 (zero price), 3404 (y-feed stale in settlement), 3405, 3408 (confidence ratio), 3411 (exponent mismatch) | **unavailable with the signed fixtures used.** Needs a signed Lazer print with price <= 0, a confidence above 2% of price, feeds with different exponents, or feeds stamped at different times (Lazer stamps both feeds the same second, so the x-feed check fails first). Not reachable by crafting input: the updates are signed. |

The two arms that were "reachable, untested" (`settle-token-*-readmit` list
append, lines 1960 / 2029) are now hit with u1010 by
`verify-v6-3-reachable-gaps.js`: in the stale-seat state (list at 50,
`side-full-*` false) the readmit settle returns `(err u1010)` and rolls back
whole (pending readmit, parked, list, totals, balances unchanged), both sides;
after `prune-seats` the same readmit is refused "queue-full" `(ok u0)`.
**No reachable but untested path remains.**

## 5. Tooling fixes in this round

- `failure-arms.mjs` used to skip traces missing from the local cache and
  swallow decode errors, and matched market instances by a name pattern. It now
  fetches missing traces from stxer, reports every trace it cannot fetch or
  decode (overall and for market calls), and with `--by-source` counts only
  byte-identical deployments.
- `trace-coverage.mjs` gains `--by-source` and a provenance / diagnostics
  section: source sha256, per-sim counted instances, excluded deployments with
  their hashes, and separate counts for "no trace returned" and "decode error",
  overall and for market calls. It used to lump both into one "no trace" count.

## 6. Findings from this coverage work

- `set-treasury` accepted the market's own principal; every fee transfer then
  failed `(err u2)` and swaps / fee-charging settles aborted until reset.
  Fixed in `e338e27` (`ERR_BAD_TREASURY` u1033).
- The `token-*-rolled` field of a swap / `settle-with-refresh` result reported
  the caller's unfilled amount even when that rest was refunded (for example
  the taker's own order on the opposite side). Fixed in `1a930e3`: the field
  now reports the amount actually rolled (unfilled minus refund). The taker's
  own side is unchanged (never refunded during a crossing; overwritten with the
  walk remainder), and the router reads only that side. Core-v6 event prints
  were always correct.
- Dead code, harmless: the `r > pending` rebate caps in `execute-fill`, the
  `(- g u1)` arm of `gross-up`, the unused `ERR_NOTHING_FILLED` (u1015).
- By design, noted: an overlap just outside the mid is placed at settle
  (`would-take-as-*` asks who is willing at the settle mid); `cancel-token-*`
  clears a pending readmit; `set-distance-slots` above 50 returns u1010.

## History (superseded figures)

These were measured on earlier sources and mixed runs; they are kept only for
the record and are replaced by sections 2–4.

- 2026-09-28, first baseline on `62d032c`, 13 runs, alias matched by name:
  60.3% of expressions (2,620 / 4,343), 54.1% of lines.
- After gate-blind-band v6-3 and swap-walk, still name-matched: 67.2% of
  expressions, 60.0% of lines.
- Error-admin sim alone on `e338e27`: 149 / 296 failure arms (cache-only,
  missing traces skipped).
- Before `verify-v6-3-reachable-gaps.js` (18 runs): 71.7% of expressions
  (3,116 / 4,348), 66.0% of lines, 151 / 296 error paths.
- Per-suite first runs, before the final rerun: swap-walk `a796043f` (388/388)
  then `60b21233` (382/382, after the treasury guard); capacity `0124df9e`;
  settlement-edges `0f8df262`; errors-admin `3cf12a3f`; full-side `dabb4070`;
  gate-blind-band `7cb93e79`.
