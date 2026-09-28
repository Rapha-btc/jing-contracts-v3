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
| `verify-v6-3-swap-walk.js` (new, gap #1) | 388/388 | [a796043f](https://stxer.xyz/simulations/mainnet/a796043f446b45f5277407f2266714fd) |
| `verify-v6-3-capacity.js` (new, gap #2) | 472/472 | [0124df9e](https://stxer.xyz/simulations/mainnet/0124df9e8bd5d4816700e9ca215082c3) |

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

## Coverage

`simulations/trace-coverage.mjs` over the 13 sims above (1,486 txs, 223 without
a trace; deploy-time lines such as constants and error codes never trace):

```
node simulations/trace-coverage.mjs --contract markets-sbtc-stx-jing-v6-3 \
  --alias '^(markets-sbtc-stx-jing-v6-3|submit-settle-|zero-limit-after-|cancel-exit-|ghost-m|swoff-m|orphan-m|mkt-.*-v63-)' \
  --sims <ids>
```

Alias for the new sims: add `|gate-|swapwalk-` to the pattern above.

| metric | baseline (13 runs) | + gate-blind-band v6-3 + swap-walk |
|---|---|---|
| expressions | 2620 / 4343 (60.3%) | 2919 / 4343 (67.2%) |
| lines | 1398 / 2583 (54.1%) | 1551 / 2583 (60.0%) |
| branches (297) | 195 full, 43 partial, 59 never | 237 full, 29 partial, 31 never |

## Gaps, in order

| # | Area | Status |
|---|---|---|
| 1 | Swap walking the book: `execute-fill`, `walk-*-book-step`, `collect-*-step`, `insert-*-step` | **done**: 0 uncovered lines, no partial branch (388/388) |
| 2 | Taker capacity: `get-taker-capacity`, `cap-*-fold`, `cap-kept-*-fold`, `gross-up` (traced only inside a tx) | **done**: fully covered but one unreachable `gross-up` arm (472/472) |
| 3 | Full side and seats: `park-tenth-*`, `top-*-fold`, `top-*-insert`, `with-seat` | to do |
| 4 | Settlement edges: `filter-small-*`, `distribute-*`, `roll-and-sweep-dust`, stale `settle-*-limit` | to do |
| 5 | Error codes never returned, admin: `set-treasury`, `set-operator`, `prune-cycles` | to do |
| 6 | `gate-blind-band` on v6-3 submit + settle | **done** (332/332) |

## Swap walk (gap #1)

`verify-v6-3-swap-walk.js` deploys 11 `swapwalk-*` copies and predicts every
transfer with a BigInt copy of the contract math (mid batch, rebate ride, walk
fills, fees, rebates, refunds, dust), then asserts exact balance deltas for
taker, every maker and the treasury, escrow == book, book order and totals,
and the core `match` / refund / park prints. Both taker sides: mid batch then
walk (skips the taker's own order, switched-off pegs, makers beyond the limit
or at/inside the mid; takes makers in price order; whole makers and
sub-minimum rests refunded; zero-size fill; zero fees; taker dust), a partial
fill that leaves the rest resting, `ERR_PARTIAL_FILL` u1017 with nothing moving,
`reprice-or-swap-token-*` walks, and a full taker side (49 seats) that parks a
switched-off peg before walking.

Not reachable, by reading: the `r > pending` rebate caps in `execute-fill`
(2772, 2785) are defensive (each fill's rebate is floored and the pending
ride covers the sum); `ERR_NOTHING_FILLED` (u1015) is defined and never used;
a zero-size fill exists only for a y taker.

Observed, not a bug: `set-treasury` accepts the market's own principal. With
the treasury set to the market, the first fee transfer fails `(err u2)` (a
transfer to itself) and every swap / fee-charging settle aborts until the
owner resets it.

## Taker capacity (gap #2)

`verify-v6-3-capacity.js` deploys 16 `capacity-*` copies and a helper,
`capprobe-v1`, whose public `probe-<market>` calls `get-taker-capacity` inside
a transaction so the read-only path is traced. Every field (`mid-cap`,
`walk-cap`, `net-cap`, `gross-cap`, `min-taker`) and every swap is predicted
with BigInt math and asserted exactly, both taker sides: empty book, limit out
of range or at the mid, the 0.2% bar (at the bar counts, under it is excluded
and rolls whole at settlement), the taker's own orders, a raised minimum,
own-side makers smaller / at least as large as the opposite, and a full side
(49 seats) with and without a door, `min-taker`, not admitted (u1010 / u1017).

The property the review fixes promised holds on the fork: a swap of exactly
`gross-cap` on a fresh print fills in every case (Nested Quinn M-1, Void Kael
#1); `gross-cap` plus several minimums fails u1017 with nothing moving; plus a
sub-minimum margin fills and refunds exactly the predicted rest.

Unreachable: the `(- g u1)` arm of `gross-up` (line 3927). With
`g = floor(net x 10000 / 9980)`, `n = g - floor(20 g / 10000) <= net` always, so
`(> n net)` is never true (also brute-forced in the sim). Harmless dead code.

