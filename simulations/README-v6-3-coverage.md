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
| `verify-v6-3-swap-walk.js` (new, gap #1) | 382/382 | [60b21233](https://stxer.xyz/simulations/mainnet/60b2123325bfce65a3de83e96a361e4c) (first run, before the treasury guard: [a796043f](https://stxer.xyz/simulations/mainnet/a796043f446b45f5277407f2266714fd), 388/388) |
| `verify-v6-3-capacity.js` (new, gap #2) | 472/472 | [0124df9e](https://stxer.xyz/simulations/mainnet/0124df9e8bd5d4816700e9ca215082c3) |
| `verify-v6-3-settlement-edges.js` (new, gap #4) | 365/365 | [0f8df262](https://stxer.xyz/simulations/mainnet/0f8df262dd413cab105eb40f6e97a916) |
| `verify-v6-3-errors-admin.js` (new, gap #5) | 514/514 | [3cf12a3f](https://stxer.xyz/simulations/mainnet/3cf12a3fbbdcc7a078ef394bb01b728d) |
| `verify-v6-3-full-side.js` (new, gap #3) | 921/921 | [dabb4070](https://stxer.xyz/simulations/mainnet/dabb407079ba8c679a84c6400360d2c4) |

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
| 3 | Full side and seats: `park-tenth-*`, `top-*-fold`, `top-*-insert`, `with-seat` | **done**: fully covered (921/921) |
| 4 | Settlement edges: `filter-small-*`, `distribute-*`, `roll-and-sweep-dust`, stale `settle-*-limit` | **done**: covered but 2 unreachable arms (365/365) |
| 5 | Error codes never returned, admin: `set-treasury`, `set-operator`, `prune-cycles` | **done**: 149/296 failure arms hit, every other one unreachable (514/514) |
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

Found and fixed: `set-treasury` accepted the market's own principal. With the
treasury set to the market, the first fee transfer failed `(err u2)` (a
transfer to itself) and every swap / fee-charging settle aborted until the
operator reset it. `e338e27` refuses it (`ERR_BAD_TREASURY` u1033); the
`tr` / `tx` scenarios now assert that refusal, an unchanged treasury and an
unchanged book. That misconfiguration was the only trigger found for the
walk steps' `match` error arm (lines 2960 / 3001), which is now unreachable.

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

## Settlement edges (gap #4)

`verify-v6-3-settlement-edges.js` deploys ten `settle-edge-*` copies and real
Lazer prints; every scenario asserts exact balances, list order, cycle totals,
stored orders (with `set-at`), swap results and core prints:
- small-share rolls: a y taker's own small order on the OPPOSITE side is
  rolled, not flagged u1020 (Void Kael #5); a taker under 0.2% of its own side
  gets u1020 with nothing moving, both sides;
- sub-minimum rests refunded (the taker's exemption only on its own side),
  payout and roll dust swept on both sides;
- stored limits: an older pending limit refused "stale" after a newer top-up;
  an older top-up behind a newer limit keeps the newer limit and `set-at` but
  adds its amount (Void Kael #3); "crossing" and "gone" limit refusals;
- parked partial withdraw, readmit "gone", `prune-cycles` (closed cycle ok,
  open cycle u1027);
- rebate by print age with a pinned clock: 30 s, 31 s, 79 s give 20, 21, 69
  bps; 80 s is refused u1003.

Unreachable: the >= 80 s band of `rebate-bps-for-age` (callers refuse a print
that old first); the `total-token-* > 0` guards in `distribute-*` (every listed
depositor holds a positive amount).

Reporting only: a swap's result field `token-*-rolled` carries the unfilled
amount of the caller's order even when that rest was refunded (seen on the
taker's own opposite-side order); funds are right. Noted before under Void
Kael #5.

## Rerun on `1a930e3` (settle result reports what was rolled)

After `1a930e3` (`caller-token-*-rolled` = rolled amount, not unfilled) the
sims that assert exact swap / settle result tuples were rerun. Only
settlement-edges scenario d changed its expectation (the taker's refunded
opposite-side rest now reads its rolled amount, 0).

| Sim | Checks | stxer |
|---|---|---|
| settlement-edges | 365/365 | [cb7a40c6](https://stxer.xyz/simulations/mainnet/cb7a40c6feea626a806ca523743f6c32) |
| swap-walk | 382/382 | [4a6b8a3c](https://stxer.xyz/simulations/mainnet/4a6b8a3c90327f536b08237e6dbe4360) |
| capacity | 472/472 | [e2783fa2](https://stxer.xyz/simulations/mainnet/e2783fa23aedd2bc5a44f0ebd3e7a5d7) |
| submit-settle-lazer | 950/950 | [9a92051a](https://stxer.xyz/simulations/mainnet/9a92051af6311a08677bbe3791972d18) |

## Errors and admin (gap #5)

`verify-v6-3-errors-admin.js` deploys ten `err-admin-*` copies; every refused
call snapshots the market and every actor before and after and fails if
anything moved. It pins the fork to block 8984873 and reuses the signed but
malformed Lazer updates saved by the earlier lazer-paths run `c014c741` (no
Pyth key needed), then moves the clock to exact seconds: update + 12 s
(`ERR_PRICE_BEFORE_ORDER`), exactly 80 s (market `ERR_STALE_PRICE`), 81 s (the
oracle's own u1002).

Failure arms are measured with `simulations/failure-arms.mjs` (trace-coverage
cannot see them: they return plain constants): **149 / 296 hit**.

Covered: WRONG_TRAIT, PAUSED, NOT_AUTHORIZED (both `initialize` checks),
DEPOSIT_TOO_SMALL, LIMIT_REQUIRED, ALREADY_INITIALIZED, ZERO_MIN_DEPOSIT,
BAD_SPREAD, BAD_TREASURY, HAS_RESTING_POSITION (live and parked), USE_CANCEL,
NOTHING_TO_WITHDRAW, NOTHING_TO_READMIT, NOTHING_PENDING (all six settles),
ALREADY_PENDING, PRICE_BEFORE_ORDER (all six), STALE_PRICE, PRICE_UNCERTAIN
(no confidence), FEED_TIMESTAMP_MISSING, FEED_MISSING (x and y),
NOTHING_TO_SETTLE, CYCLE_OPEN, NOT_A_SEAT, PARTIAL_FILL, TAKER_TOO_SMALL,
QUEUE_FULL (distance slots, swap park, core bump); `try!` arms for empty
wallets, tampered updates (oracle u2104 / u2105), refusals passed up from
`settle-with-refresh`, and a paused `jing-core-v6` (u5016). Admin:
`set-treasury`, `set-operator` (handover, old operator refused), `set-paused`,
both minimums, `set-distance-slots` (51 refused, 50 ok), `prune-cycles`,
`sync-seat-count`, `prune-seats`.

Unreachable, by reading:
- `ERR_SEATS_FULL`: the ladder caps band seats at 49, so 50 seats never fill.
- `ERR_ALREADY_SETTLED`: the cycle advances in the tx that settles it.
- `ERR_ZERO_PRICE` (five checks): needs a signed price <= 0.
- confidence-ratio `PRICE_UNCERTAIN`: real confidence ~0.04% vs a 2% limit.
- `ERR_EXPO_MISMATCH`: every Lazer feed used is exponent -8.
- y-feed staleness / shape arms: Lazer stamps both feeds the same second, the
  x feed fails first.
- the second price read in reprice (same update, same tx, just succeeded).
- structural arms: park-error re-raise (park only fails QUEUE_FULL), list
  length unwraps, readmit's append, transfers out of escrow.
- core log calls that are not pause-gated (the market cannot be unregistered).
- the walk's `log-match` / `execute-fill` error arms: `log-settlement` fails
  first in the same tx, and the treasury can no longer be the market.

`ERR_NOTHING_FILLED` (u1015) is defined and never used.

Notes, not bugs: `swap` / `reprice-or-swap` have no pause or trait check of
their own; paused or wrong trait, the whole tx reverts at `settle-with-refresh`
after the taker's tokens were pulled, so nothing is lost. `set-distance-slots`
above 50 returns `ERR_QUEUE_FULL`, an odd code for a bad argument.

## Full side and seats (gap #3)

`verify-v6-3-full-side.js` fills `fullside-y` / `fullside-x` to 50 (two seated
band rungs, 47 fixed makers with a tied pair, one pegged maker) and two
45-seat markets, plus a `fullside-probe` that wraps the read-only
`pegged-bid` / `pegged-ask`. A JS model of `park-tenth`, `side-full` and the
core bump predicts every outcome; each scenario asserts the branch it targets,
who is parked, lists, live / parked amounts, totals, balances and prints.
Both sides: a switched-off newcomer refunded "queue-full"; a switched-off
resident parked first, then switched back on while parked; parks at the
`distance-slots` edge (smallest outside vs last inside, equal sizes, slots at
50, a tied pair on the boundary); "queue-full" refusals; the core bump when
nobody is parkable (equal-size and near-side newcomers refused); seat sync
(already seated, plain maker u1028, retired band pruned then parked, seated
top-up, max-band raise flips `side-full`); parked partial withdraw (ok, u1024,
u1001); readmit refused queue-full / u1031 / u1022 / gone / crossing, and
readmitted once slots free.

Unreachable through the market: the spread guard inside `pegged-bid` /
`pegged-ask` (spread >= 100%); `valid-spread` refuses such a spread at entry,
so only the probe reaches it. By design: `cancel-token-*-deposit` clears a
pending readmit, so readmit "gone" needs the parked maker to re-deposit.

