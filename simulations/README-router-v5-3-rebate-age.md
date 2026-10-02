# Market v6-3 age-aware capacity and router v5-3 verification

Verified September 30, 2026: **625/625 Clarinet tests and 1,275/1,275 Stxer
checks passed** for the market-owned capacity quote and corresponding router.
The market selects the configured feeds and returns age-adjusted `gross-cap`
and `rebate-bps`; the router passes the update and consumes that quote.

## Rerun on the final deploy bytes (2026-10-01)

Rerun on the final router `df091b8` (DLMM legs use the deepest of the
three Bitflow STX/sBTC pools; sha256 `dc355d44…f839`), the unchanged market
(`ed046155…`), core-v6 (`88a689af…`) and ladder-v1 (`0f1e08b0…`).
**1,311/1,311 checks passed.**

| Stxer suite | Checks | Simulations |
| --- | ---: | --- |
| Signed-update age regression (tip, fork 9104986) | 482/482 | sBTC → STX: [baseline](https://stxer.xyz/simulations/mainnet/6ec50f055fae58d6d19b395f9cb37576), [fixed](https://stxer.xyz/simulations/mainnet/9b04485c43c2c419524bb2507a156cde); STX → sBTC: [baseline](https://stxer.xyz/simulations/mainnet/1dfbde21cf06d852620b494e7dab0fce), [fixed](https://stxer.xyz/simulations/mainnet/bb481e6ecbb327b4fed9b7354e4acb87) |
| Broad smart-router regression (fork 9094335) | 525/525 | [routes](https://stxer.xyz/simulations/mainnet/def91606d7037bb43bd5e516302bd35b), [minimum taker](https://stxer.xyz/simulations/mainnet/d72a3abb67f4a681eb5b273a3db2c23f), [fees and DLMM edge](https://stxer.xyz/simulations/mainnet/40e456f21466ec1710fcb2edbb1bc73c) |
| V6 router suite (fork 9094335) | 304/304 | [manual and smart routes](https://stxer.xyz/simulations/mainnet/cd3a8ef6fea885e46abc0cabc02be0bc) |

The "fixed" pair is now the final router; the baseline pair is still the
`b41dbd6` market/router. Harness changes for `df091b8`, test side only:

- The shared harness models the pool pick (the three pools' balance of the
  asset bought, ties to the lower number) and checks the router's
  `dlmm-pick` agrees before every fold it evaluates; snapshots and the AMM
  depth log cover all three pools.
- Smart suite: the S1/S2 folds and session 3 read the picked pool; E1 sets
  fees 0 on all three pools; E2 sells sBTC until the pool the router picks
  sits at bin +500. At 9094335 the pick moves as the pools drain: v-1
  (bin -65 to 165), then v-2 (431 to +500, its STX gone), then v-1 again
  (to +500 after four 2 BTC legs in all), where the edge arm runs.
  525 checks, was 503 (one pick check per fold and per E2 leg, two extra
  fee pools).
- V6 suite (W18p): draining the picked pool can hand the pick to another
  pool, so the DLMM-only push repeats (up to 12 rounds, u3001 once nothing
  is left) and goes to 5.5% under the mid or the CP fixture's limit,
  whichever is lower; W18d reads the STX-sale pool through the router's
  `dlmm-pick`. 304 checks, was 290.

At the tip the broad suites now pass without `ROUTER_FORK_HEIGHT` too
(manual 366/366, smart 524/524; see the
[router README](README-router-ladder-coverage.md)). Before `df091b8` they
failed there on the drained v-2 pool (u2003). The summary JSON has the new
links. The September 30 results below are kept for reference.

Production SHA-256:

- Market: `ed046155b017d6acad569c6769da050747f4c69db7f627e4767fe0cafea41848`.
- Router: `c8bb651f0df1417adddf7a50e0d29424218ce65db8f54c0a40238d578107113c`.

The [validation summary](fixtures/router-v5-3-market-age-validation.json)
records all counts, source hashes and links. The [targeted artifact](fixtures/router-v5-3-rebate-age-result.json)
also records signed updates, fork metadata, wallet snapshots and per-call costs.

| Stxer suite | Checks | Simulations |
| --- | ---: | --- |
| Signed-update age regression | 482/482 | sBTC → STX: [baseline](https://stxer.xyz/simulations/mainnet/2f0b6ca395c61a1b5814a6036abd38a2), [fixed](https://stxer.xyz/simulations/mainnet/11bd63a9e19cdab3b45f8a0c380d0abb); STX → sBTC: [baseline](https://stxer.xyz/simulations/mainnet/242342a85cc645511f5e5ca7e4815d0b), [fixed](https://stxer.xyz/simulations/mainnet/8821dd9354239805794a63b256cb3b16) |
| Broad smart-router regression | 503/503 | [routes](https://stxer.xyz/simulations/mainnet/f2b05d80793f75b1e37c59afc383f9b1), [minimum taker](https://stxer.xyz/simulations/mainnet/994d2cbe14b3428765bf811381a16482), [fees and DLMM edge](https://stxer.xyz/simulations/mainnet/5164797eb1ba2c814451dc19df2bfb2a) |
| V6 router suite | 290/290 | [manual and smart routes](https://stxer.xyz/simulations/mainnet/9d3c3db8d2f859fe2a9dc1ae9686b6ce) |

Clarinet results: **320 market**, **185 router**, **97 rung/dispatch** and
**23 native-vault** tests. Market coverage remains 100% functions, 99.75%
lines and 99.76% branches; router coverage is 100%, 99.40% and 99.30%.
All existing coverage gates pass unchanged. The mirror variants and RV
harness compile; the full historical RV campaigns were not rerun.

## Targeted reproduction

`verify-router-v5-3-rebate-age.js` deploys the original market/router pair
from `b41dbd6` and the current pair in separate, fully initialized forks at
block **9098204**. All four forks use the same signed BTC/STX update, real
Pyth decoder/oracle, production sBTC and real DLMM, XYK and Velar pools.
Public deposits fund the fixture book. No market/pool storage or signed
bytes are patched. The existing backend supplied the update without a
personal Pyth API key.

`AdvanceBlocks` sets exact ages 0, 30, 31, 55, 79 and 80 seconds relative to
the older feed. Automatic tenure renewal is disabled in this suite so it
cannot alter an age mid-case. Both directions verify:

- The market quote's rate and maximum fitting gross input at every age.
- At ages 55 and 79, the old pair misses fillable Jing liquidity; the updated
  pair fills it. At 31 seconds the old STX-selling route already misses.
  The small sBTC fixture still fits at 31 because of integer rounding.
- A budget one unit below the aged minimum skips Jing; the exact minimum fills.
- At 80 seconds the market rejects the stale update and AMM fallback works.
- An impossible overall minimum output rolls back wallets, market and pools.
- Every successful call conserves input and output against actual wallet deltas.

Cases run sequentially within each fork. Baseline and fixed routes can move
AMM reserves differently; their payouts are not required to match. Every
case independently checks book admission and wallet/venue conservation.
The fixed pair includes additional minimum-budget and rollback cases.

The artifact contains 30 smart-swap transactions: six per baseline direction
and nine per fixed direction, including expected min-out errors. Maximum
observed cost in each dimension across the **fixed-pair** transactions:

| Direction | Runtime | Reads | Read bytes | Writes | Write bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| sBTC → STX | 7,811,210 | 535 | 1,276,015 | 85 | 2,505 |
| STX → sBTC | 11,701,207 | 603 | 4,738,872 | 67 | 2,009 |

These are receipt-level costs, not cumulative session costs or worst-case
bounds for arbitrary order books. All final calls fit their execution budget.

## Broader regressions and fixture corrections

The broad smart and V6 suites use historical pool block **9094335**.
They cover manual/smart routing, real AMM quotes, book capacity, protected-book
minimums, pool fees, DLMM boundaries, wallet conservation and rollback.
Their real signed updates are newer than the historical fork and therefore
use the market's existing future-timestamp/age-zero rule. Exact aged cases
are established by the targeted suite above.

The broad suite deploys exact working-tree source. The V6 suite removes
comment-only lines from the market and includes a separately named one-step
DLMM wrapper for its partial-fill fixture. The saved V6 deployment hashes
were verified against those transformations and the exact current router.

The older harnesses assumed particular live DLMM liquidity and proximity
between the oracle and pool prices. Initial attempts exposed those fixture
assumptions, not a passing result: latest-tip bins were near/exhausted at
+500, some capacity-derived trades exceeded fixed wallet funding, and a
historical pool differed from today's oracle price. The updated harnesses
use an explicit fork height, fund measured trade sizes, search a sufficient
price range, assert zero capacity for rejection fixtures, and measure DLMM
capacity where the previous assertion assumed it must be positive.

Long suites also exceeded a cumulative tenure budget when all scenarios
were placed in one tenure. They now renew tenure budgets periodically;
individual call limits still apply. Tenure extension may advance time.
Exact-age cases instead advance blocks explicitly. A trial using market
`SetContractCode` reset data variables, so the final comparison uses separate
baseline/current deployments and no code replacement.

These Stxer runs exercise direct router calls. They do not execute all four
vault entrypoints or prove a universal vault allowance bound. The separate
23-test native-vault Clarinet suite passes; external-vault suites were not
rerun. No vault or core-spread rung production source changed.

## Reproduce

```sh
npm test
npm run test:router-v5-3
npm run test:v6-3:integration
npm run test:vault-v6-3
node simulations/verify-router-v5-3-rebate-age.js
ROUTER_FORK_HEIGHT=9094335 node simulations/verify-router-v5-3-smart.js
V6=1 ROUTER_FORK_HEIGHT=9094335 node simulations/verify-swap-router-v3-lazer.js
```

The shared fetcher accepts `PYTH_API_KEY` when available and otherwise uses
the existing backend. Latest prices can change fixture amounts and assertion
counts. Logs for this run are `/tmp/jing-market-age-unit.log`,
`/tmp/jing-market-age-router.log`, `/tmp/jing-market-age-integration.log`,
`/tmp/jing-market-age-vault.log`, `/tmp/jing-market-age-stxer.log`,
`/tmp/jing-market-age-smart-stxer.log` and `/tmp/jing-market-age-v6-stxer.log`.
The linked JSON artifacts preserve the results beyond those temporary logs.
The prior router-only draft's 787 checks are historical and superseded here.
