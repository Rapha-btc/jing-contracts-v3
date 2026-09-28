# v6-3 market: stxer fork coverage

Goal: full stxer mainnet-fork coverage of `contracts/markets-sbtc-stx-jing-v6-3.clar`
(the submit + settle market). Only v6-3 matters; older versions are out of scope.
Every sim deploys the unmodified working-tree source.

Source: `master` at `62d032c` (all review fixes in). `5b21fb5` (unit tests) does
not change `contracts/`.

## Sims, all green

| Sim | Checks | stxer |
|---|---|---|
| `verify-v6-3-submit-settle-lazer.js` | 950/950 | [8ada08f0](https://stxer.xyz/simulations/mainnet/8ada08f08f76134558c03b84ef336adf) |
| `verify-v6-3-ghost-deposit.js patched` | 343/343 | [e48fb483](https://stxer.xyz/simulations/mainnet/e48fb48331945e2d5e9842f34a96aeba) |
| `verify-v6-3-switched-off-ask.js patched` | 221/221 | [4fdaa528](https://stxer.xyz/simulations/mainnet/4fdaa528e0389f45f70f247dab6b11d4) |
| `verify-v6-3-cancel-orphan-pending.js patched` | 225/225 | [519b42ff](https://stxer.xyz/simulations/mainnet/519b42ff28704f76876e2af7985ec60f) |
| `verify-v6-3-router-impact.js` | 398/398 | [18639bb8](https://stxer.xyz/simulations/mainnet/18639bb8b982bf36c03bf2b7bdda07d3), [27d5a177](https://stxer.xyz/simulations/mainnet/27d5a17710c3fa15bfd5b53228f22279), [6f1673cb](https://stxer.xyz/simulations/mainnet/6f1673cb4dc221e7664f339ee5b271a7), [df5c8920](https://stxer.xyz/simulations/mainnet/df5c8920c7b34a31dfdd05c0708827d0) |
| `verify-v6-3-caller-impact.js` | 198/198 | [d1aca826](https://stxer.xyz/simulations/mainnet/d1aca826cd3733d3ceb721fe794d449f) |
| `verify-v6-3-dispatch.js` | 194/194 | [d835af47](https://stxer.xyz/simulations/mainnet/d835af47f7a7df993f9f5ef8750633d9) |
| `verify-v6-3-gate-blind-band.js` | 332/332 | [7cb93e79](https://stxer.xyz/simulations/mainnet/7cb93e79a96401bc8956f920f3775093) |
| `verify-v6-3-deploy-bytes.js` | 17/17 | [f062ec74](https://stxer.xyz/simulations/mainnet/f062ec74963f90f748abd24ef46c74a7) |
| `verify-v6-3-router-bin-boundary.js` | 22/22 | [9566d378](https://stxer.xyz/simulations/mainnet/9566d3784b625f7317464a3fd14af960) |

Harness updates in this round:
- `submit-settle-lazer`: the stored order now carries `set-at` (Void Kael #3);
  the check compares `limit`, `spread-bps` and `set-at > 0`.
- `dispatch`: loads the `-v1` rungs (it pinned rungs at `5735a97`, which call
  the ladder's removed `log-claim`); reads each rung's epoch before a dispatch
  (the last-member reset closes epochs); rung 0's 24h escrow: with `escrow-for`
  (`jing-buy-stx-core-spread-v1`) the member whose exit the pool covers leaves
  it pending and the next member's exit takes the 24h cancel; the sell `-v1`
  rungs (no `escrow-for` yet) still cancel on the first exit.
- `gate-blind-band`: rewritten for v6-3 only (no v6-2, no core-v5), step by
  step: submit, then settle with a later print. Blind band and raised minimum:
  refunded "crossing" at settle; 30 / 100 bps controls: placed; overlap 20 bps
  outside the mid with an entrant at 30 bps: placed (`would-take-as-*` asks who
  is willing at the settle mid), nothing fills at settle.

## Coverage baseline

`simulations/trace-coverage.mjs` over the 13 sims above (1,486 txs, 223 without
a trace; deploy-time lines such as constants and error codes never trace):

```
node simulations/trace-coverage.mjs --contract markets-sbtc-stx-jing-v6-3 \
  --alias '^(markets-sbtc-stx-jing-v6-3|submit-settle-|zero-limit-after-|cancel-exit-|ghost-m|swoff-m|orphan-m|mkt-.*-v63-)' \
  --sims <ids>
```

| metric | value |
|---|---|
| expressions | 2620 / 4343 (60.3%) |
| lines | 1398 / 2583 (54.1%) |
| branches | 297: 195 full, 43 partial, 59 never reached |

## Gaps, in order

| # | Area | Status |
|---|---|---|
| 1 | Swap walking the book: `execute-fill`, `walk-*-book-step`, `collect-*-step`, `insert-*-step` | in progress (`verify-v6-3-swap-walk.js`) |
| 2 | Taker capacity: `get-taker-capacity`, `cap-*-fold`, `cap-kept-*-fold`, `gross-up` (traced only inside a tx) | to do |
| 3 | Full side and seats: `park-tenth-*`, `top-*-fold`, `top-*-insert`, `with-seat` | to do |
| 4 | Settlement edges: `filter-small-*`, `distribute-*`, `roll-and-sweep-dust`, stale `settle-*-limit` | to do |
| 5 | Error codes never returned, admin: `set-treasury`, `set-operator`, `prune-cycles` | to do |
| 6 | `gate-blind-band` on v6-3 submit + settle | **done** (332/332) |
