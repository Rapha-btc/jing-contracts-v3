# v6-3 market: stxer fork tests and coverage

Scope: `contracts/markets-sbtc-stx-jing-v6-3.clar` (submit + settle market).
Older market versions are out of scope. All numbers below come from one full
rerun of every suite (17 suites, 20 runs) on the current market source, after
the registered-maker / refund-safety change `72b60b0`. Earlier figures are kept
only in the History section at the end. Separate current-source evidence: the
[full-book refund integration](README-v6-3-refund-costs.md) (291 checks against
real sBTC).

## 1. Source provenance

| item | value |
|---|---|
| market source commit (last change to the file) | `72b60b0` (2026-09-29, "protect v6-3 refunds and account for registered makers") |
| market source sha256 | `d1e3bbad46de1ba752507502b1caaca87b03e0b0abb344028636a57fc350cca9` |
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
suites pass; **5,981 / 5,981 checks, 0 unexpected failures.**

| Suite | Passed / total | Unexpected failures | stxer |
|---|---|---|---|
| `verify-v6-3-submit-settle-lazer.js` | 898 / 898 | 0 | [c4f1deda](https://stxer.xyz/simulations/mainnet/c4f1deda358280361077fd20baa4bfcb) |
| `verify-v6-3-ghost-deposit.js patched` | 343 / 343 | 0 | [30560c13](https://stxer.xyz/simulations/mainnet/30560c1311e578f02e319b6187e8c2d6) |
| `verify-v6-3-switched-off-ask.js patched` | 221 / 221 | 0 | [3dec35b5](https://stxer.xyz/simulations/mainnet/3dec35b5b4ccdc98629db6db5f5089b8) |
| `verify-v6-3-cancel-orphan-pending.js patched` | 225 / 225 | 0 | [bf136b9e](https://stxer.xyz/simulations/mainnet/bf136b9e5eafb5a1e9b2b82dd10d9c37) |
| `verify-v6-3-router-impact.js` | 398 / 398 | 0 | [4b5be2b1](https://stxer.xyz/simulations/mainnet/4b5be2b18f8e933c5ac1fc403a265db0), [69da8bfc](https://stxer.xyz/simulations/mainnet/69da8bfcec9a1758addf610787200881), [ce6e3bde](https://stxer.xyz/simulations/mainnet/ce6e3bde47df85e175c96e294b2f2023), [f054aed6](https://stxer.xyz/simulations/mainnet/f054aed6d2a1a3e35ea3784df1b041f9) |
| `verify-v6-3-caller-impact.js` | 198 / 198 | 0 | [cb87444f](https://stxer.xyz/simulations/mainnet/cb87444faed6039f463b9690072679f6) |
| `verify-v6-3-dispatch.js` | 194 / 194 | 0 | [7f789e0f](https://stxer.xyz/simulations/mainnet/7f789e0f1971495441310d7d56fd5a91) |
| `verify-v6-3-gate-blind-band.js` | 332 / 332 | 0 | [16f17362](https://stxer.xyz/simulations/mainnet/16f1736246b77db09830ed7cbec90704) |
| `verify-v6-3-deploy-bytes.js` | 17 / 17 | 0 | [215ab246](https://stxer.xyz/simulations/mainnet/215ab246ebee74ce539848ce62a87289) |
| `verify-v6-3-router-bin-boundary.js` | 22 / 22 | 0 | [f483e2b2](https://stxer.xyz/simulations/mainnet/f483e2b27c16dae26d21d2857eddff57) |
| `verify-v6-3-swap-walk.js` | 382 / 382 | 0 | [468e3dc1](https://stxer.xyz/simulations/mainnet/468e3dc1e6386dc5f86c504951ceb88c) |
| `verify-v6-3-capacity.js` | 472 / 472 | 0 | [fa552c22](https://stxer.xyz/simulations/mainnet/fa552c2233aafab6b5b79298a3efd4d0) |
| `verify-v6-3-settlement-edges.js` | 365 / 365 | 0 | [9e932291](https://stxer.xyz/simulations/mainnet/9e9322916364fefadcdd89f5e5508aa9) |
| `verify-v6-3-errors-admin.js` | 514 / 514 | 0 | [58a8a4e4](https://stxer.xyz/simulations/mainnet/58a8a4e45793d6b788c2056376a2d422) |
| `verify-v6-3-full-side.js` | 921 / 921 | 0 | [5c940b63](https://stxer.xyz/simulations/mainnet/5c940b63743befe3bde3031bc757c19a) |
| `verify-v6-3-reachable-gaps.js` | 382 / 382 | 0 | [3ef0b0a1](https://stxer.xyz/simulations/mainnet/3ef0b0a1e9f4c70b98ee241979d636ef) |
| `verify-v6-3-oracle-feeds.js` | 97 / 97 | 0 | [c1ab64e0](https://stxer.xyz/simulations/mainnet/c1ab64e0b36f8f42ed51db7c660e2699) |

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
| expressions executed | 3,147 / 4,361 | 72.2% |
| code lines touched (incl. deploy-time definitions) | 1,722 / 2,589 | 66.5% |
| function-body lines touched | 1,722 / 2,480 | 69.4% |
| branch nodes (`if` / `match` / `asserts!`) fully taken | 291 / 299 | 97.3% |
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

### Expressions and lines not covered (1,214 expressions, 867 lines)

- **Instrumentation (deploy time):** top-level lines, the `ERR_*` constants and
  the map / data-var declarations run only at deploy, which stxer does not
  trace.
- **Instrumentation (tool quirk):** `(caller tx-sender)` / `(swapper tx-sender)`
  `let` bindings in `withdraw-token-*`, `cancel-token-*-deposit`,
  `cross-remainder-as-*` are binding pairs, not calls; the functions run.
- The partial-branch arms below (walk steps, `gross-up`).
- Every read-only getter is covered: the ones the suites only read through
  evals (which stxer does not trace) are called inside transactions through
  the `gapsprobe-v1` / `gapsprobe-v2` probes in `verify-v6-3-reachable-gaps.js`,
  each value asserted.

### Partial branches (8 of 299): one arm provably unreachable

| line | function | untaken arm | why |
|---|---|---|---|
| 13 | `rebate-bps-for-age` | age >= 80 s | callers refuse a print 80 s or older first (`ERR_STALE_PRICE`) |
| 2936, 2977 | `walk-*-book-step` | `match` error arm | `execute-fill` fails only on a transfer or `log-match`; transfers are covered by A3, `log-match` by A2, and a treasury equal to the market is refused since `e338e27` |
| 3532, 3536, 3627, 3631 | `distribute-to-token-*-depositor` | total = 0 | these run only over listed depositors, each holding a positive amount |
| 3934 | `gross-up` | `(- g u1)` | `g = floor(net x 10000 / 9980)` gives `g - floor(20 g / 10000) <= net`, so `n > net` never holds |

### Error paths not hit (130 of 286)

| group | arms | lines | classification |
|---|---|---|---|
| A1 core-v6 log calls that are not pause-gated | 41 | 930, 958, 1235, 1327, 1478, 1570, 1849, 1899, 1913, 1941, 1966, 1982, 2010, 2035, 2064, 2075, 2112, 2130, 2159, 2170, 2207, 2225, 2266, 2293, 2303, 2352, 2381, 2391, 2445, 2493, 2538, 2582, 2883, 2894, 3283, 3353, 3598, 3606, 3693, 3701, 3748 | **provably unreachable.** In `jing-core-v6` only `log-deposit-x/-y`, `log-match` and `log-settlement` check the pause; every other log fails only when the caller is not a registered market, and core-v6 has no unregister. Before `initialize`, `token-x` / `token-y` hold a standard principal no trait can match, so the paths that reach these logs are refused earlier. (3283 / 3353 are the `log-refund-*` calls `da19a4f` added to `cross-remainder-as-*`.) |
| A2 `log-match` | 1 | 2906 | **provably unreachable.** It is pause-gated, but it only runs inside a swap / reprice walk, after `log-settlement` in the same transaction, which fails first on a paused core. |
| A3 token transfers out of escrow | 62 | 1365–1366, 1389–1390, 1402–1403, 1608–1609, 1632–1633, 1645–1646, 1678–1679, 1694–1695, 1707–1708, 1752–1753, 1768–1769, 1781–1782, 1832–1833, 1882–1883, 2817–2828, 2880–2881, 2891–2892, 3259–3269, 3329–3339, 3483–3490, 3570–3572, 3595–3596, 3665–3666, 3687–3689, 3735–3742 | **unreachable under the custody invariant, not a formal proof.** A transfer out of escrow fails only on a zero amount (guarded), a recipient equal to the sender (the market cannot call itself; the treasury cannot be the market since `e338e27`), a wrong token (traits are checked against `token-x` / `token-y`), or insufficient escrow. The last is excluded by the invariant "market balance = live + parked + pending per token", which the suites assert after every fund-moving step. |
| A4 structural | 15 | 1227, 1470 (filtered append in the full branch), 1401, 1644 (park error other than u1010), 2258, 2344 (second read of the same update in one tx), 2618, 2624, 2630, 2954, 2995, 3240, 3310, 3527, 3622 (propagation of errors that A1–A3 exclude) | **provably unreachable.** The full branch filters one entry before appending; `park-tenth-*` only fails with u1010; the rest only re-raise errors from A1–A3. |
| A5 seat list full (`ERR_SEATS_FULL`) | 2 | 142, 146 | **provably unreachable.** `jing-ladder-v1` caps band seats at 49 (`set-max-band-per-side` refuses 50, `ERR_BAND_FULL`), below the 50-entry seat list. |
| A6 `ERR_ALREADY_SETTLED` | 1 | 3406 | **provably unreachable.** The cycle advances in the same transaction that writes its settlement. |
| B signed-oracle data | 8 | 1083 (y-feed stale), 1084, 1085 (x / y zero price), 3407, 3408 (x / y zero price in settlement), 3410 (y-feed stale in settlement), 3411, 3414 (confidence ratio) | **unavailable with real signed data.** `verify-v6-3-oracle-feeds.js` scanned all 526 Lazer feeds the key is entitled to: no feed reached a confidence of 2% of price (widest: Crypto.NAV.XBTC/USDC at 1.97%); every feed is stamped with the update's own timestamp, so the x-feed staleness check always fails first; no feed publishes a price <= 0 (the funding-rate feeds that could carry no confidence and fail `shape-feed` first). Equity / FX / metal feeds that could carry an old timestamp when their market is closed are not entitled for the key. |

Oracle paths now covered by `verify-v6-3-oracle-feeds.js` (previously group B):
the y-feed `shape-feed` (1065, u1004: feed u112, a funding rate with no
confidence), `ERR_EXPO_MISMATCH` (3417, u1014: BTC/USD exponent -8 against
PEPE/USD exponent -10) and the settlement ratio `ERR_ZERO_PRICE` (3419, u1006:
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

## 7. Next target: `jing-core-v6` (baseline from the same runs)

The same 20 runs exercise `jing-core-v6` (sha256 `67242f19…`) on every market
call. Measured by source hash: **310 / 1,159 expressions (26.7%), 211 / 946
lines, 81 branch nodes: 45 full, 3 partial, 33 never reached.** The low figure
is scope, not a gap in the v6-3 work: core-v6 is a shared ledger and most of
it serves other products that v6-3 never calls:
- RFQ (`log-rfq-*`), reserve (`log-reserve-*`), SNPL (`log-snpl-*`), Bitflow
  (`log-bitflow-swap`) and the legacy Jing logs (`log-jing-deposit`,
  `log-jing-swap`, `log-deposit`, `log-withdraw`, `log-revoke`, `log-cancel`);
- core-owned admin: `unpause` (with its timelock), `propose-owner`,
  `accept-owner`.

Every log the v6-3 market calls is exercised. Next step for core coverage: a
core-focused suite for the owner / unpause timelock and, if in scope, one per
product that logs through core.

## History (superseded figures)

Measured on earlier sources; kept only for the record, replaced by sections 2–4.

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
