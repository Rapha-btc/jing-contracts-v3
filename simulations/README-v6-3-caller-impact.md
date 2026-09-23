# v6-3 caller impact — 2026-09-23

Audited commit `19c73b5` (including `08a9ef8`, `321699e`, `83e562a`), with rung
rewrites `abeb6b1` and `c018402`. No production contract edits. No mainnet
broadcast, commit, or push. Vaults are excluded.

## Harness migration against current v6-3

**All ten updated runs are green (1,148/1,148 combined).** Migration first
stopped on a confirmed router error; the subsequently authorized minimal
router fix passes a separate 22/22 boundary regression and is committed as
`f231e51`. The later dispatch/router checks are documented below.

The audit below describes `19c73b5`. Commit `5735a97` subsequently added the
24-hour rung recovery path; see [timeout coverage](README-v6-rungs-escrow-timeout.md).
The migration below uses that current working tree, with the explicitly
authorized router boundary fix described below. The market remains v6-3.

Coverage comparison with submit-settle (950), caller-impact (198),
router-impact (98), and escrow-timeout (549):

| Older harness | Coverage absent from the four newer suites | Decision |
| --- | --- | --- |
| keyless buy/sell/buy-peg/sell-peg | Canonical/name/initialization guards; minimum-driven held/live transitions; gifts and claims | Update all four modes |
| fill-lazer | Fixed-price walks, rollover event, sold-out fixed/peg/band epochs and old-epoch claims | Update |
| push-lazer | Keeper push events, held-fund retry, queued top-ups, exact effective fixed/peg quotes | Update; oracle input moved from member deposit/push to keeper settle |
| miner-band-lazer | Real RFQ guards, 40 public slots, protected seats, replacement/retirement | Update |
| replace-keyless | Replaced/unseated member service; seat limits/pruning; owner and core timelocks | Update |
| deploy-bytes | Raw deploy-source smoke test with an optional external-template source | Update against repository deploy bytes; preserve `--templates` mode |
| broad router | Four-venue routing, capacity, walk limits, pro-rata pool allocation, hint/min-out/rollback cases | Update; the focused 98 checks do not replace this suite |
| router-c018402 | Historical broad baseline run, using the same router harness | Historical comparison, not a current-v6-3 test; broad scenarios remain in the updated router |

No scenario-bearing harness is fully superseded, so each was updated. The
obsolete adapter alone is retired; its scenarios remain in those scripts.

| Harness / mode | Status | N/M | Run |
| --- | --- | --- | --- |
| `verify-v6-rungs-keyless.js` / buy | Updated | 39/39 | [run](https://stxer.xyz/simulations/mainnet/cedba5219d81cee3ea0af157b490c295) |
| same / sell | Updated | 39/39 | [run](https://stxer.xyz/simulations/mainnet/789c380805b1de1e3c4f2dce3b2bfc66) |
| same / buy-peg | Updated | 42/42 | [run](https://stxer.xyz/simulations/mainnet/1e73fd85e27292201afb2a3bca2db66c) |
| same / sell-peg | Updated | 42/42 | [run](https://stxer.xyz/simulations/mainnet/367ee49acec5a9a74c4786457801cc2a) |
| `verify-v6-rungs-fill-lazer.js` | Updated | 85/85 | [run](https://stxer.xyz/simulations/mainnet/ca16a46ecd593cfdc25a5abc3d079d02) |
| `verify-v6-rungs-push-lazer.js` | Updated | 124/124 | [run](https://stxer.xyz/simulations/mainnet/763818aadbd1467e3537697efe83fd76) |
| `verify-v6-rungs-miner-band-lazer.js` | Updated | 225/225 | [run](https://stxer.xyz/simulations/mainnet/759ed5c78152fefcf6a068834c5aae69) |
| `verify-v6-rungs-replace-keyless.js` | Updated | 250/250 | [run](https://stxer.xyz/simulations/mainnet/a9a3e8f7d411df8900b238e01e9ff23f) |
| `verify-v6-3-deploy-bytes.js` | Updated | 17/17 | [run](https://stxer.xyz/simulations/mainnet/071e552bc759e3b108713fe9a2ca8341) |
| `verify-swap-router-v3-lazer.js` / V6=1 | Updated; v5-3 router edge fix | 285/285 | [run](https://stxer.xyz/simulations/mainnet/1b87a78280e83a84dbaa6af79e31b203) |
| `verify-v6-3-router-bin-boundary.js` | New; exact failure replay and both edges | 22/22 | [run](https://stxer.xyz/simulations/mainnet/22825ead524c41102000f6d7e87661b1) |
| Historical `router-c018402` invocation | Historical only; same broad scenarios remain in the current router suite | — | Historical result retained below |

Migration details:

- The full router suite loads working-tree `swap-router-sbtc-stx-jing-v5-3`
  and `markets-sbtc-stx-jing-v6-3` with `V6=1`. Its AMM fixtures derive limits
  and capacities from actual fork reserves after prior large trades. W12
  retains the below-minimum Jing-capacity skip and exact 5,000-sat AMM fill;
  W15 replenishes DLMM using a public reverse swap, then sells measured
  30-bin capacity plus 3 BTC; W17 retains both incorrect-mid-hint cases and
  exact input/output/limit assertions. No pool storage is mocked.
- Fresh principals are explicitly funded instead of assuming an old shared
  account still owns sBTC. The keyless flows retain the empty-opposite direct
  path and need no settlement/oracle.
- `_v6-submit-settle.js` executes explicit planned steps sequentially. After
  submit, it waits for a real signed Lazer update whose older feed timestamp
  is newer than Clarity's fork clock. Settlement is an explicit checked step;
  the helper never invents successful results or patches contract state.
- Normal fork steps keep block time fixed while the signed oracle clock moves.
  Miner RFQ reads must run before synthetic burn blocks. The replacement suite
  retains its 145-block timelock advances and its labelled R12 RFQ mock; the
  separate timeout suite covers exact 86,399/86,400/86,401-second boundaries.
- Full-queue refusal is now checked at settlement: `(ok amount)`, pending
  cleared, exact refund, `queue-full` event, unchanged protected maker/totals.
- Replacement R6 reflects the current `sync-seat-count` pruning; R9 rejects
  60 seats and accepts 49, following ladder-v1's explicit ceiling. These are
  current policy checks, not unexplained relaxed assertions.
- Deploy-byte defaults use repository sources. The external Faktory market
  template differs semantically from current v6-3; this run does **not** certify
  those templates. `--templates` is retained for a separate template refresh.

### Router v5-3 DLMM bin-boundary regression

The broad router's former failures were reduced from 16 to nine by admitting
pending maker deposits and correcting its capacity gross-up from 20 to the
current maximum 70 rebate bps. The remaining nine were liquidity-fixture
assumptions: prior large swaps spent the assumed AMM room, and a fixed 7%
ceiling no longer isolated the two constant-product pools.

While replacing those assumptions with measured liquidity, the W15 capacity
probe encountered an actual contract error. The router suite's preceding
**public swaps** had left DLMM at active bin **500**. There were no synthetic
pool writes. A capacity fold with a permissive limit advances to 501; the
DLMM core returns `(err u1039)` for its price, and the router panics.

- First detection: planned step **234**, W15 dynamic capacity read; the suite
  stops before a final N/M rather than treating the read error as liquidity 0.
- Public confirmation: stxer step **242** (zero-based),
  `smart-swap-sbtc-for-stx(u1000, u20000000000000, none,
  u27000000000000, u1)`, called by a funded sBTC holder.
- Expected: stop the DLMM walk at the supported bin boundary and continue
  through the normal routing/min-out response; no VM abort.
- Actual: VM **`UnwrapFailure`**, raw `(err none)`, no committed events.
  This is distinct from a typed router `(err u3002)` liquidity/min-out refusal.
- Direct reads confirm price at bin 500 is `(ok u41491)` and at 501 is
  `(err u1039)`.
- [Fork](https://stxer.xyz/simulations/mainnet/1ac1ad538ad102792f868d918b1c4fd9)
  and [saved public receipt](fixtures/router-v5-3-bin-boundary-result.json).

Clarity locations in the original `contracts/swap-router-sbtc-stx-jing-v5-3.clar`:
`dlmm-bin-step` unwraps the price at **822–824**, advances the bin without a
boundary guard at **849–852**, and is folded over the 30-bin list at
**875–877**. The public route reaches it through `dlmm-stage` at **942** and
`smart-swap-sbtc-for-stx` at **1020**.

The oracle-free confirmation needs no pending market order, so this is a
router/DLMM boundary issue, not evidence of a submit/settle regression.
Migration stopped on that finding. After explicit authorization, the working-tree
router now counts the edge bin and sets `done: true`, retaining the edge index.
The same `dlmm-bin-step` handles both directions; no other bin walk exists.
Its market remains `markets-sbtc-stx-jing-v6-3` (constant at line 117).

`verify-v6-3-router-bin-boundary.js`: **22/22**, [run](https://stxer.xyz/simulations/mainnet/22825ead524c41102000f6d7e87661b1).
It replays original steps 0–241 at the original block and compares all results
and receipts, excluding nondeterministic processing costs. It then uses
fork-only `SetContractCode` to install the working-tree router under the same
contract ID, preserving storage, and repeats the public call. The formerly
panicking call sells **1,000 sats for 2,398,110 micro-STX**, with exact wallet
deltas. A second call with impossible min-out returns `u3002`, with no balance
movement or committed events. Real-pool accumulator checks cover both ±500,
adjacent ±499, counting the edge once, and no further reads after `done`.
[Saved result](fixtures/router-v5-3-bin-boundary-fixed.json).

`clarinet check contracts/swap-router-sbtc-stx-jing-v5-3.clar` passes. The full
project check is blocked by an existing missing v7 source in `Clarinet.toml`;
neither the router nor these simulations target v7. The router fix was
committed separately as `f231e51`.

The historical adapter
`retired/verify-v6-3-callers-legacy.mjs` is archived and should not be used to run
the updated scripts; invoke the scripts directly:

```sh
RUNG=buy node simulations/verify-v6-rungs-keyless.js  # also sell, buy-peg, sell-peg
node simulations/verify-v6-rungs-fill-lazer.js
node simulations/verify-v6-rungs-push-lazer.js
node simulations/verify-v6-rungs-miner-band-lazer.js
node simulations/verify-v6-rungs-replace-keyless.js
node simulations/verify-v6-3-deploy-bytes.js
V6=1 node simulations/verify-swap-router-v3-lazer.js
node simulations/verify-v6-3-router-bin-boundary.js
```

## Follow-up dispatch and baseline router checks

Dispatch is **176/176** against the six rung templates at `5735a97`, with
multi-rung calls through real band seats. Exact `f6a6d3a` versus current market
router comparison is **398/398**: no tuple or wallet differences for common
scenarios. Additional current-only cases prove pending liquidity is invisible
to swaps until settled. See [run links, restrictions, and exact scope](README-v6-3-dispatch-router.md).

## Full-book RV follow-up

The test-only extension uses 50 actual live makers per side, three parked users,
and pending deposits/limits/readmits. Three guided seeds (230930–230932) reached
120 positive readmit placements per side, 123 batch clears, and 120 successful
swaps per direction. Native RV seeds 231030–231032 completed 3,000 trials:
988 passed, 2012 discarded, zero failures. All 8313 structural checks
passed; no counterexample was found. [Properties, mocks, per-path counts, and results](../tests/rv/v6-3/README.md).

## Historical findings (before timeout change and harness migration)

**No persistent rung share/accounting loss was found on queue refunds. Pending
rung exits still depend on the oracle and pause state; market cancellation's
new unconditional recovery is not exposed by the rung.** The six rungs share
this behavior. `abeb6b1` added pending escrow to `market-size`, preventing a
submit from looking like a fill. `c018402` settles escrow before `sync`/exit.

| Rung | `market-size` | `sync` | `withdraw` / `settle-escrow` | `pull-to-held-*` / cancel accounting |
| --- | --- | --- | --- | --- |
| `jing-buy-stx` | 185 | 237 | 376 / 522 | 538 / 558 |
| `jing-sell-stx` | 161 | 207 | 339 / 479 | 495 / 515 |
| `jing-buy-stx-market-spread` | 206 | 267 | 406 / 559 | 575 / 595 |
| `jing-sell-stx-market-spread` | 179 | 234 | 366 / 513 | 529 / 549 |
| `jing-buy-stx-core-spread` | 224 | 298 | 437 / 597 | 613 / 633 |
| `jing-sell-stx-core-spread` | 197 | 265 | 397 / 551 | 567 / 587 |

Numbers refer to the named files in `contracts/` at this commit.

### Placed vs refunded, reporting, and seats

`settle-escrow` does not classify `(ok amount)`; it only propagates errors.
That is safe for asset accounting: the immediately following `sync` reads
live + parked + pending **and the actual local token balance**. A refund moves
value from market custody to the rung wallet without reducing the unfilled
index or member shares. Tests exercise both a permissionless keeper refund and
refund inside the rung's own exit for all six contracts.

There is **transient read/event ambiguity**, not a demonstrated permanent loss:

- `get-state.resting` is `market-size`, which includes pending and parked funds;
  it does not mean a fillable live order (e.g. buy line 151, sell line 127).
- After an external keeper refunds, `resting` becomes zero while cached
  `held-sats`/`held-ustx` remains zero until `sync`. `pooled` and member shares
  retain their correct claim. Next deposit/push/claim/withdraw synchronizes.
- `log-deposit`/`log-push` use success of **submit**, so `pushed: true` means
  accepted/escrowed, not necessarily placed. Rung events are not retracted on
  a later refund. Use the market's pending-refund/deposit events and current
  pending/live maps to classify it. Examples: buy lines 324–334 and 354–370;
  ladder lines 394–436.
- Ladder registration and seats identify authorized rungs, not order balances.
  Refund does not change them; no seat drift is implied. `jing-ladder-v1`
  `registered`/`band-count` at 54/74, seat reads at 139–140 and registration at
  212/266 do not call market settlement or interpret its return value. A seated
  band rung is normally protected from public-queue eviction; the focused
  queue-refund cases initialize band rungs **unseated** through the public API.

### Exit correctness and remaining restriction

The cancel branch adds the **returned amount** to held funds, rather than an
assumed live size. A larger return is therefore accounted for exactly. Also,
current `withdraw` settles pending before it reaches either partial withdrawal
or cancellation, so pending is normally already zero at that cancel call.
The own-settle refund tests return all 3,000 sats / 6,000,000 micro-STX exactly.

The preflight also runs when the rung already holds enough local funds for
the requested withdrawal. The old preflight is no longer necessary to
**recover** pending escrow, but
cannot simply be deleted: `market-size` still counts pending, and the partial
withdraw branch cannot withdraw it. A future change would need to cancel/
recover pending first, synchronize, then choose the partial/cancel exit path.
No such change was made here.

Minimal observable restrictions (all six for the first two; both fixed sides
plus mirrored source audit for core pause):

1. Make the public queue full, deposit through a rung so it has pending escrow,
   then `withdraw(amount, none)` → `u7012` (e.g. buy 524–530).
2. Same pending state, market `set-paused(true)`, then `withdraw(amount,
   some(fresh-update))` → `u1007`; funds and shares remain intact.
3. With room for placement and a noncrossing opposite book, create pending
   escrow, pause core-v6, then the same exit → `u5016`; escrow remains intact.
   This third case is specifically placement: queue/crossing refunds use
   unpaused core log endpoints and need not fail under core pause.

Thus the market's pause-independent cancellation fix does **not** make rung
exits pause-independent. The market records the rung as owner; a member cannot
call market cancel as themselves to recover the rung's position.

### Router v5-3

No success/failure change was found for identical initial books and inputs.
The router's `jing-swap` (171–194) catches **all** market errors as `none`, so
reordering u1011/u1001 versus other market errors is not exposed as those codes
by the router. Smart entry points also reject zero limits themselves (1007,
1075), and sizing checks the market minimum (753). Direct split routes can
send zero limits/undersized amounts, but the baseline market already refused
them inside core. Current market checks are 2603–2604 and 2625.

The focused comparison deploys the exact `c018402` and current market source
in separate sessions pinned to the **same fork block**, using one signed
Lazer update and the same current router. Both directions match exactly for:
zero limit, under-minimum net, and successful full fill; all relevant wallet
balances and router result tuples are equal. With no AMM fallback and positive
min-out, the first two return router `u3002` unchanged. This is not an exhaustive
comparison of every AMM liquidity state.

## Historical initial fork results

Focused current-behavior suite: **198/198**.
[Six-rung refund and exit run](https://stxer.xyz/simulations/mainnet/65b9318b4791b6b58f2fb1bbe9b3067e).
Queue tests reserve 49 seats through the public ladder API, leaving one public
slot; the core-pause placement case reserves 48. No source rewrites or synthetic
balance/position writes. The real fork burn
height is retained so miner-band RFQ reads have real headers.

Focused router comparison: **98/98** across four sessions:
[x baseline](https://stxer.xyz/simulations/mainnet/6b3690a75da9a27aa9bb9f8fcdef1f05),
[x current](https://stxer.xyz/simulations/mainnet/33733ddd2dbeef208e459cb583d90b70),
[y baseline](https://stxer.xyz/simulations/mainnet/930b93bf78339a7b786625a74ce6fe7d),
[y current](https://stxer.xyz/simulations/mainnet/a5577994d8fbabef93769d76745f7d6d).

The existing scenarios were also rerun. The adapter changes test references,
call arities and keyless price fetching, **not the historical assertions**.
These mixed results are not presented as green regression suites:

| Existing harness / mode | Passing checks | Fork |
| --- | --- | --- |
| `buy` | 36/38 | [run](https://stxer.xyz/simulations/mainnet/f8fdb66c44b655071bf24f708aabc2c0) |
| `sell` | 38/38 | [run](https://stxer.xyz/simulations/mainnet/dc01673f14e80007a098e0bee9ff8969) |
| `buy-peg` | 39/41 | [run](https://stxer.xyz/simulations/mainnet/e76316aec3a567f61bef1fd1a7bcdc12) |
| `sell-peg` | 41/41 | [run](https://stxer.xyz/simulations/mainnet/2b238f18a1bf00e30c4075067bb073d1) |
| `fill-lazer` | 73/81 | [run](https://stxer.xyz/simulations/mainnet/964ce57c92b9492b2851319c96fd32a6) |
| `push-lazer` | 42/62 | [run](https://stxer.xyz/simulations/mainnet/187bf4c301a5532f578c7b20674b8835) |
| `miner-band-lazer` | 160/174 | [run](https://stxer.xyz/simulations/mainnet/9820c19048e47973fb4e73fbd758d9f1) |
| `replace-keyless` | 220/249 | [run](https://stxer.xyz/simulations/mainnet/d5c133bc147f0973cb9576d930e5c2e3) |
| `deploy-bytes` | 12/13 | [run](https://stxer.xyz/simulations/mainnet/f4435af32930e5d2a3dd2f27bf8cd734) |
| `router` | 254/270 | [run](https://stxer.xyz/simulations/mainnet/5075bb5efa26d1b1519ab255ba5119de) |
| `router-c018402` | 238/269 | [run](https://stxer.xyz/simulations/mainnet/5f34bc307930b64314b64ae342237bff) |

Failure classification:

- Keyless buy/buy-peg: two failures each start with the pre-existing shared
  wallet `B` lacking sBTC (`u1`), then its withdrawal has no position. Sell
  modes pass. Focused tests use funded fresh principals.
- Fill/push/miner/replace: historical tests expect one-call placement, immediate
  live quotes, and keeper `push(update)`. Current deposits escrow; quotes remain
  absent until settle; a second pending deposit is held locally; old exits
  supplied `none` and now hit u7012. These are obsolete fixture/workflow
  assumptions, not evidence of the queue refund losing shares. Core/market
  source is current; the replace suite retains its explicitly mocked miner
  oracle only for its existing synthetic-burn-block R12 scenario.
- Deploy-bytes: **12/13**; the sole failure expects crossing submit to return
  u1016, but current submit correctly returns `(ok u6000000)` and escrows it.
  Its router trade succeeds. The adapter reads repository deploy bytes, not
  the external Faktory templates, so this does not certify template parity.
- Broad router: **254/270** current vs **238/269** pre-change. Old maker setup
  sometimes leaves pending orders unadmitted; old capacity arithmetic assumes
  a fixed rebate, and deep AMM/liquidity/hint expectations depend on fork state.
  The current failures have corresponding baseline failure families; the
  baseline also accumulates uncleared pending deposits because old cancel
  cannot refund them. These separate broad sessions are not a precise
  differential test. The 98-check pinned comparison above is.

Reproduce:

```sh
node simulations/verify-v6-3-caller-impact.js
node simulations/verify-v6-3-router-impact.js
```

The historical adapter is archived in `simulations/retired/`; its mixed-run
logs were stored in `/tmp/v6-3-callers/`. It must not be run against the migrated
scripts. Current commands and green results appear in the migration table.
[RV fuzz results and limitations](../tests/rv/v6-3/README.md): 9,000 final
trials, zero property failures (3,672 passed; 5,328 discarded), seeds 230927,
230926, and 230929. These cover the market properties separately. This audit does not certify all rung rounding, full
50-live-seat states, every AMM split, template parity, or vault behavior.
