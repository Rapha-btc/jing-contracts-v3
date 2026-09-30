# v6-3 market: stxer fork tests and coverage

Scope: `contracts/markets-sbtc-stx-jing-v6-3.clar` (submit + settle market).
Older market versions are out of scope. All numbers below come from one full
rerun of every suite (17 suites, 20 runs) on the current market source, after
the exact swap rebate sizing `34bbe18` (the pot is sized on the net, and
`gross-up` is its exact inverse). Earlier figures are kept
only in the History section at the end. Separate current-source evidence: the
[full-book refund integration](README-v6-3-refund-costs.md) (291 checks against
real sBTC).

## 1. Source provenance

| item | value |
|---|---|
| market source commit (last change to the file) | `34bbe18` (2026-09-29, "size the swap rebate pot on net, exact gross-up") |
| market source sha256 | `5c08412fc5990a8bf0db3a0cbbec3fa4c859d4185d0caf1cd16ae0c78f851bfb` |
| `swap-router-sbtc-stx-jing-v5-3` | as of `6a84e02` (`jing-size` estimates net with the market's formula) |
| `jing-core-v6` | as of `72b60b0` (`log-match` takes the maker's net payout) |

Only traces from deployments whose code is **byte-identical** to that source
are combined. `simulations/_sim-source.mjs` decodes every deploy transaction in
every stxer result and hashes its code; `--by-source` in `trace-coverage.mjs`
and `failure-arms.mjs` counts a deployment only on an exact sha256 match (a
run on another source counts zero instances). Excluded on purpose (other
code): router-impact's two baseline runs deploy the market from `f6a6d3a` to
compare router results; `router-bin-boundary` deploys its own stand-in market.
Rungs, core, ladder, router, dispatch and probe contracts are not the market
and are not counted.

## 2. Test results

Every suite asserts exact outcomes, including negative tests: a call that must
be refused passes when it returns the expected error and moves nothing. All 17
suites pass; **5,982 / 5,982 checks, 0 unexpected failures.**

| Suite | Passed / total | Unexpected failures | stxer |
|---|---|---|---|
| `verify-v6-3-submit-settle-lazer.js` | 898 / 898 | 0 | [fc02e93f](https://stxer.xyz/simulations/mainnet/fc02e93fea67abb393a1499936910174) |
| `verify-v6-3-ghost-deposit.js patched` | 343 / 343 | 0 | [c72aa34f](https://stxer.xyz/simulations/mainnet/c72aa34f3a39f81500f437923293ed9e) |
| `verify-v6-3-switched-off-ask.js patched` | 221 / 221 | 0 | [0820149e](https://stxer.xyz/simulations/mainnet/0820149ea8bc9a410684944f8aaa32f4) |
| `verify-v6-3-cancel-orphan-pending.js patched` | 225 / 225 | 0 | [6b02da83](https://stxer.xyz/simulations/mainnet/6b02da835d276a2c89bbe001cf977eda) |
| `verify-v6-3-router-impact.js` | 398 / 398 | 0 | [2f558388](https://stxer.xyz/simulations/mainnet/2f5583880d809836994fd744e95837ad), [48d926ea](https://stxer.xyz/simulations/mainnet/48d926ea78e3881b06fa6fe2e29c48ff), [535c1e0f](https://stxer.xyz/simulations/mainnet/535c1e0f764c7f9cbff362bb4542cccd), [6e4544a1](https://stxer.xyz/simulations/mainnet/6e4544a11aa0e3e04b8a9b41e4b23545) |
| `verify-v6-3-caller-impact.js` | 198 / 198 | 0 | [ad80e16b](https://stxer.xyz/simulations/mainnet/ad80e16b60778281a712ada6ad12e31e) |
| `verify-v6-3-dispatch.js` | 194 / 194 | 0 | [8a139142](https://stxer.xyz/simulations/mainnet/8a1391427d5dcdd54c62df2d23df25fd) |
| `verify-v6-3-gate-blind-band.js` | 332 / 332 | 0 | [6f443ed7](https://stxer.xyz/simulations/mainnet/6f443ed74eaffa491360963c65c40cb1) |
| `verify-v6-3-deploy-bytes.js` | 17 / 17 | 0 | [97fcaf57](https://stxer.xyz/simulations/mainnet/97fcaf572887c0a637753fbbaff6a9ce) |
| `verify-v6-3-router-bin-boundary.js` | 22 / 22 | 0 | [b9a3a5a7](https://stxer.xyz/simulations/mainnet/b9a3a5a71f98e3f4040b918e94bdfd50) |
| `verify-v6-3-swap-walk.js` | 382 / 382 | 0 | [0b0b0e6b](https://stxer.xyz/simulations/mainnet/0b0b0e6b55d785288190dcf7e2fc72a0) |
| `verify-v6-3-capacity.js` | 473 / 473 | 0 | [307b989c](https://stxer.xyz/simulations/mainnet/307b989c53801564ea0a15d08ca36718) |
| `verify-v6-3-settlement-edges.js` | 365 / 365 | 0 | [a09d9bc4](https://stxer.xyz/simulations/mainnet/a09d9bc4a4a14aad0f7f17a2c829c7e5) |
| `verify-v6-3-errors-admin.js` | 514 / 514 | 0 | [074a8236](https://stxer.xyz/simulations/mainnet/074a8236bdc357ade0e6eff3b81de68a) |
| `verify-v6-3-full-side.js` | 921 / 921 | 0 | [48129c1e](https://stxer.xyz/simulations/mainnet/48129c1e103d0632a0227eef3e5627e5) |
| `verify-v6-3-reachable-gaps.js` | 382 / 382 | 0 | [515e0955](https://stxer.xyz/simulations/mainnet/515e09550f9c1b2874a53336d2851290) |
| `verify-v6-3-oracle-feeds.js` | 97 / 97 | 0 | [9f10c48c](https://stxer.xyz/simulations/mainnet/9f10c48c3cf6561b1ee0382d14d7cf8d) |

Run notes:
- `oracle-feeds` needs a Pyth Pro key in the environment:
  `PYTH_API_KEY=<key> node simulations/verify-v6-3-oracle-feeds.js`. The key is
  never stored in the repo.
- `errors-admin` pins its fork to block 8984873 so the signed but malformed
  Lazer updates saved by the earlier lazer-paths run `c014c741` are still
  fresh; it deploys the current source like the others.
- `submit-settle-lazer` (898 checks, was 950): its zero-limit phase used to
  also deploy the reviewed baseline `08a9ef8` and require identical results.
  Since `72b60b0` core-v6's `log-match` takes 11 arguments and `08a9ef8` passes
  10, so the baseline cannot deploy next to the current core. The phase now
  deploys only the current source; every assertion on it is unchanged; only the
  baseline copy and its cross-version equality check are gone (`f00db7a`).
- `34bbe18` changed the swap sizing, so the models that encode it moved to
  the new formula (`net = gross x 10000 / (10000 + bps)`, `rebate = gross -
  net`, exact `gross-up`): `capacity` (its model self-check now proves
  `gross-up` is the largest gross whose net fits, and `gross-up(0) = 0`; 473
  checks, was 472), `swap-walk`, `settlement-edges`, `reachable-gaps`.
  `router-impact` applies the same sizing to its `f6a6d3a` baseline so the
  comparison still isolates the submit / settle refactor. `dispatch` now
  expects the sell rung to keep its escrow like the buy rung (`escrow-for`,
  ported in `702a545`, after this suite's last run). Nothing else changed.
- No expectation on the current contract was changed for `da19a4f` or
  `72b60b0`. Transient Lazer / stxer timing errors ("print too old", "no newer
  signed feed", "failed to get block info") are retried before any check runs.

## 3. Coverage (combined, current source only)

20 simulation runs, 3,194 transactions. 1,819 are calls to a counted market
instance: **all 1,819 have a trace, 0 decode errors.** The 461 transactions
without a trace are all outside the market (deploys, STX / sBTC fundings,
ladder calls).

| metric | covered / total | % |
|---|---|---|
| expressions executed | 3,146 / 4,356 | 72.2% |
| code lines touched (incl. deploy-time definitions) | 1,721 / 2,587 | 66.5% |
| function-body lines touched | 1,721 / 2,478 | 69.5% |
| branch nodes (`if` / `match` / `asserts!`) fully taken | 292 / 299 | 97.7% |
| branch nodes never reached | 0 / 299 | 0% |
| error paths (failure arms) hit | 156 / 286 | 54.5% |

What "error path (failure arm)" means: every `asserts!`, `unwrap!`,
`unwrap-err!` and `try!` can return early with an error. The arm is **hit**
when a trace records that node returning `EarlyReturn` in a simulated call,
i.e. the contract really took that error path. The suites trigger these on
purpose; each is a passing negative test. `trace-coverage.mjs` cannot see these
arms (the returned value is a constant, not a traced expression), so
`failure-arms.mjs` counts them separately. The total fell from 296 to 286
because `72b60b0` turned twelve refund / cancel log `try!` calls into `is-ok`
(returned refund-logger errors no longer propagate) and `da19a4f` added two.

Reproduce (sim ids as in section 2):

```
node simulations/trace-coverage.mjs --contract markets-sbtc-stx-jing-v6-3 --by-source --sims <ids>
node simulations/failure-arms.mjs <ids> --by-source
```

## 4. Remaining gaps

**No reachable but untested path remains.** Every unhit path below is either
provably unreachable, unavailable with real signed oracle data, or an
instrumentation limit.

### Expressions and lines not covered (1,210 expressions, 866 lines)

- **Instrumentation (deploy time):** top-level lines, the `ERR_*` constants and
  the map / data-var declarations run only at deploy, which stxer does not
  trace.
- **Instrumentation (tool quirk):** `(caller tx-sender)` / `(swapper tx-sender)`
  `let` bindings in `withdraw-token-*`, `cancel-token-*-deposit`,
  `cross-remainder-as-*` are binding pairs, not calls; the functions run.
- The partial-branch arms below (walk steps, empty-total guards).
- Every read-only getter is covered: the ones the suites only read through
  evals (which stxer does not trace) are called inside transactions through
  the `gapsprobe-v1` / `gapsprobe-v2` probes in `verify-v6-3-reachable-gaps.js`,
  each value asserted.

### Partial branches (7 of 299): one arm provably unreachable

| line | function | untaken arm | why |
|---|---|---|---|
| 13 | `rebate-bps-for-age` | age >= 80 s | callers refuse a print 80 s or older first (`ERR_STALE_PRICE`) |
| 2939, 2980 | `walk-*-book-step` | `match` error arm | `execute-fill` fails only on a transfer or `log-match`; transfers are covered by A3, `log-match` by A2, and a treasury equal to the market is refused since `e338e27` |
| 3535, 3539, 3630, 3634 | `distribute-to-token-*-depositor` | total = 0 | these run only over listed depositors, each holding a positive amount |

### Error paths not hit (130 of 286)

| group | arms | lines | classification |
|---|---|---|---|
| A1 core-v6 log calls that are not pause-gated | 41 | 930, 958, 1235, 1327, 1478, 1570, 1849, 1899, 1913, 1941, 1966, 1982, 2010, 2035, 2064, 2075, 2112, 2130, 2159, 2170, 2207, 2225, 2266, 2293, 2303, 2352, 2381, 2391, 2445, 2493, 2538, 2582, 2886, 2897, 3286, 3356, 3601, 3609, 3696, 3704, 3751 | **provably unreachable.** In `jing-core-v6` only `log-deposit-x/-y`, `log-match` and `log-settlement` check the pause; every other log fails only when the caller is not a registered market, and core-v6 has no unregister. Before `initialize`, `token-x` / `token-y` hold a standard principal no trait can match, so the paths that reach these logs are refused earlier. (3286 / 3356 are the `log-refund-*` calls `da19a4f` added to `cross-remainder-as-*`.) |
| A2 `log-match` | 1 | 2909 | **provably unreachable.** It is pause-gated, but it only runs inside a swap / reprice walk, after `log-settlement` in the same transaction, which fails first on a paused core. |
| A3 token transfers out of escrow | 62 | 1365–1366, 1389–1390, 1402–1403, 1608–1609, 1632–1633, 1645–1646, 1678–1679, 1694–1695, 1707–1708, 1752–1753, 1768–1769, 1781–1782, 1832–1833, 1882–1883, 2820–2831, 2883–2884, 2894–2895, 3262–3272, 3332–3342, 3486–3493, 3573–3575, 3598–3599, 3668–3669, 3690–3692, 3738–3745 | **unreachable under the custody invariant, not a formal proof.** A transfer out of escrow fails only on a zero amount (guarded), a recipient equal to the sender (the market cannot call itself; the treasury cannot be the market since `e338e27`), a wrong token (traits are checked against `token-x` / `token-y`), or insufficient escrow. The last is excluded by the invariant "market balance = live + parked + pending per token", which the suites assert after every fund-moving step. |
| A4 structural | 15 | 1227, 1470 (filtered append in the full branch), 1401, 1644 (park error other than u1010), 2258, 2344 (second read of the same update in one tx), 2618, 2624, 2630, 2957, 2998, 3243, 3313, 3530, 3625 (propagation of errors that A1–A3 exclude) | **provably unreachable.** The full branch filters one entry before appending; `park-tenth-*` only fails with u1010; the rest only re-raise errors from A1–A3. |
| A5 seat list full (`ERR_SEATS_FULL`) | 2 | 142, 146 | **provably unreachable.** `jing-ladder-v1` caps band seats at 49 (`set-max-band-per-side` refuses 50, `ERR_BAND_FULL`), below the 50-entry seat list. |
| A6 `ERR_ALREADY_SETTLED` | 1 | 3409 | **provably unreachable.** The cycle advances in the same transaction that writes its settlement. |
| B signed-oracle data | 8 | 1083 (y-feed stale), 1084, 1085 (x / y zero price), 3410, 3411 (x / y zero price in settlement), 3413 (y-feed stale in settlement), 3414, 3417 (confidence ratio) | **unavailable with real signed data.** `verify-v6-3-oracle-feeds.js` scanned all 526 Lazer feeds the key is entitled to: no feed reached a confidence of 2% of price (widest: Crypto.NAV.XBTC/USDC at 1.97%); every feed is stamped with the update's own timestamp, so the x-feed staleness check always fails first; no feed publishes a price <= 0 (the funding-rate feeds that could carry no confidence and fail `shape-feed` first). Equity / FX / metal feeds that could carry an old timestamp when their market is closed are not entitled for the key. |

Oracle paths now covered by `verify-v6-3-oracle-feeds.js` (previously group B):
the y-feed `shape-feed` (1065, u1004: feed u112, a funding rate with no
confidence), `ERR_EXPO_MISMATCH` (3420, u1014: BTC/USD exponent -8 against
PEPE/USD exponent -10) and the settlement ratio `ERR_ZERO_PRICE` (3422, u1006:
PEPE / a NAV feed rounds to 0). Each refusal is asserted to move nothing. The
production pair (feed 1 BTC/USD over feed 45 STX/USD, i.e. STX per BTC) is
around 2.7e13 and cannot round to 0.

## 5. Tooling

- `trace-coverage.mjs --by-source` and `failure-arms.mjs --by-source` count
  only deployments byte-identical to the measured source (via
  `_sim-source.mjs`), print per-sim counted instances and excluded deployments
  with their hashes, and report "no trace returned" and "decode error"
  separately, overall and for market calls.
- `failure-arms.mjs` fetches traces missing from the local cache and reports
  any it cannot fetch or decode.
- Both read the source at `--rev` (default `HEAD`). If the market changes while
  a measurement runs, source-hash matching counts zero instances rather than
  mixing versions.

## 6. Findings from this coverage work

- `set-treasury` accepted the market's own principal; every fee transfer then
  failed `(err u2)` and swaps / fee-charging settles aborted until reset.
  Fixed in `e338e27` (`ERR_BAD_TREASURY` u1033).
- The `token-*-rolled` field of a swap / `settle-with-refresh` result reported
  the caller's unfilled amount even when that rest was refunded. Fixed in
  `1a930e3`: the field reports the amount actually rolled (unfilled minus
  refund); the taker's own side is unchanged and the router reads only that
  side; core-v6 event prints were always correct.
- Dead code, harmless: the `r > pending` rebate caps in `execute-fill`, the
  `(- g u1)` arm of `gross-up`, the unused `ERR_NOTHING_FILLED` (u1015).
- By design, noted: an overlap just outside the mid is placed at settle
  (`would-take-as-*` asks who is willing at the settle mid); `cancel-token-*`
  clears a pending readmit; `set-distance-slots` above 50 returns u1010.
- Later market changes by the Clarinet / RV work, all rerun here with no
  expectation change on the current contract: `da19a4f` (taker dust refund now
  logged to core equity) and `72b60b0` (refund / cancel logs best-effort with
  `is-ok`; `log-match` carries the taker's net received).

## 7. Next target: `jing-core-v6` (baseline from the `72b60b0` runs)

The 20 runs on `72b60b0` exercise `jing-core-v6` (sha256 `67242f19…`) on every market
call. Measured by source hash: **310 / 1,159 expressions (26.7%), 211 / 946
lines, 81 branch nodes: 45 full, 3 partial, 33 never reached.** The low figure
is scope, not a gap in the v6-3 work: core-v6 is a shared ledger and most of
it serves other products that v6-3 never calls:
- RFQ (`log-rfq-*`), reserve (`log-reserve-*`), SNPL (`log-snpl-*`), Bitflow
  (`log-bitflow-swap`) and the legacy Jing logs (`log-jing-deposit`,
  `log-jing-swap`, `log-deposit`, `log-withdraw`, `log-revoke`, `log-cancel`);
- core-owned admin: `unpause` (with its timelock), `propose-owner`,
  `accept-owner`.

Every log the v6-3 market calls is exercised.

**Core admin suite:** `verify-core-v6-admin.js`, **149 / 149** checks
([9581ea76](https://stxer.xyz/simulations/mainnet/9581ea76408083fef64e1232d96fc477),
core-v6 sha `67242f19…`, unchanged at start and end). It covers pause /
unpause and the 144-block timelock, `propose-owner` / `accept-owner`,
`set-verified-contract`, `register` and the admin getters (through probe
contracts inside transactions); every refusal is asserted to move nothing.
Admin functions: 90 / 119 expressions (the rest are tuple keys and `let`
binding lists the tracer does not record), 11 / 11 branch nodes reached,
**14 / 14 failure arms hit**. Whole core-v6 with the v6-3 runs: 362 / 1,159
expressions (31.2%); the remainder is RFQ / reserve / SNPL / Bitflow / legacy
logs, out of scope. `failure-arms.mjs` gains `--contract` (default: the
market).

Behaviour recorded by the suite:
- `accept-owner` has no cooldown; the nominee can accept in the same block.
- `pause` while paused restarts the timelock (`paused-at` resets), so the owner
  can extend a pause; `unpause` checks owner, then paused (u5017), then the
  timelock (u5008).
- `set-verified-contract` is one-shot per canonical (u5003) and reads the hash
  before the owner check (a non-owner on a missing contract gets u5002).
- **`register` has no owner check**: any contract byte-identical to a verified
  one can register under that canonical. v6-3 is not exposed, because its
  `initialize` (the only path to `register`) requires `tx-sender` to be the
  core owner. `README-stxer.md` still describes a `tx-sender == contract-owner`
  check in `register` (the bytecode-replay guard); core-v6 does not have it.
  Defense in depth would be one line in core-v6's `register`; open decision.

## History (superseded figures)

Measured on earlier sources; kept only for the record, replaced by sections 2–4.

- `72b60b0` (sha `d1e3bbad…`), 20 runs, 17 suites (5,981 checks): 72.2% of
  expressions (3,147 / 4,361), 66.5% of lines, 291 / 299 branch nodes fully
  taken (the eighth partial was `gross-up`'s `(- g u1)` arm), 156 / 286 error
  paths.
- `da19a4f` (sha `43ed3bf0…`), 20 runs, 17 suites all green: 72.1% of
  expressions (3,142 / 4,356), 66.5% of lines, 290 / 298 branch nodes fully
  taken. Error paths not measured on that source (the market changed to
  `72b60b0` during the measurement; source-hash matching refused to mix).
- `1a930e3` (sha `7f7bc5cc…`), 19 runs, 16 suites (5,896 checks): 72.0% of
  expressions (3,130 / 4,348), 66.3% of lines, 290 / 298 branch nodes, 153 / 296
  error paths.
- `1a930e3`, 18 runs before the reachable-gaps suite: 71.7% of expressions,
  66.0% of lines, 151 / 296 error paths.
- First baseline on `62d032c`, 13 runs, aliases matched by name: 60.3% of
  expressions (2,620 / 4,343), 54.1% of lines; then 67.2% after the first new
  suites. Name matching could mix sources; replaced by source-hash matching.
- Earlier per-suite runs: swap-walk `a796043f` / `60b21233`, capacity
  `0124df9e`, settlement-edges `0f8df262`, errors-admin `3cf12a3f`, full-side
  `dabb4070`, gate-blind-band `7cb93e79`, reachable-gaps `7515f273` / `ccf59fc6`,
  oracle-feeds `9117a793`.
