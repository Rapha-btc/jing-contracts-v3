# Rendezvous (RV) property fuzzing

`@stacks/rendezvous@1.0.0-rc.1` harness for the v3 markets. Runs random
tx sequences against the production contract source (with a small set
of mocks) and asserts state invariants after every step.

## Status: working, all targets pass 500-run sweeps clean

```
markets-sbtc-usdcx-jing     -- 500 runs, 13 invariants, 0 failures
markets-sbtc-stx-jing       -- 500 runs, 13 invariants, 0 failures
markets-sbtc-stx-jing-v2    -- 500 runs, 14 invariants, 0 failures (2026-08-18)
vault-sbtc-stx-v2           -- 500 runs,  3 invariants, 0 failures (2026-08-18)
rfq-sbtc-stx-jing-v2        -- 500 runs,  4 invariants, 0 failures (banded + kill-switch)
rfq-sbtc-stx-jing-v3        -- 500 runs,  4 invariants, 0 failures
creator-bonus-jing          -- 500 runs,  4 invariants, 0 failures (2026-09-02)
markets-sbtc-stx-jing-v6    -- 1000 runs, 31 invariants, 0 failures (2026-09-15, settle LIVE)
jing-ladder                 -- 500 runs,  6 invariants, 0 failures (2026-09-15)
jing-core-v5 (via market v6) -- 1000 runs, 31 + 3 invariants, 0 failures (2026-09-15, equity ledger)
swap-router-sbtc-stx-jing-v5 -- 300 runs, 1 invariant + 5 properties (500 runs), 0 failures (2026-09-15)
jing-buy/sell-stx x3 pairs  -- 500 runs, 12 invariants each, 0 failures (2026-09-15)
```

### v6 stack, added 2026-09-15: market v6, jing-ladder, the six pooled rungs

Nine new targets, one build script section each (`build.sh` 2d / 2e / 2f),
one manifest each (`Clarinet-<name>.toml`). What is new against the v2
target: **settle runs live under fuzz.** The Lazer oracle and the decoder
principal the market passes it are one mock (`mock-lazer-oracle.clar`)
that answers two fresh feeds, BTC/USD at a settable mid and STX/USD at
exactly 1e8, so the market's cross is the mid itself. Every priced path
now runs on random sequences: settle-with-refresh, swap, the crossing
branch of reprice-or-swap, the book walk, limit rolls, small-share rolls,
dust refunds, parks and readmits. The v2 target could only fuzz the deposit
phase.

Three things RV cannot produce on its own, and how the build gets there:

- **Prices.** RV's uints are small naturals (fast-check `nat`, under
  2^31), five orders of magnitude under a real BTC/STX cross, and its
  strings are random, so every allowance name fails. The SUT gets `rv-*`
  wrappers (in the invariants file, fuzzed like any public function) that
  fold a price into `[2.4e13, 4.0e13)` in the market unit (250.00 to
  416.67 sats per STX), fold a spread under 11000 (one in eleven still
  refused, u1026), and pin the allowance name to `mock-ft`. The raw
  functions stay in the mix; their calls mostly fail, which is fine.
- **A full side.** MAX_DEPOSITORS is 6 with 2 seats (4 open slots) and
  `distance-slots` 2, so ten accounts fill a side and reach park-tenth, the
  size rule, seats and readmits. The ladder is a mock the SUT's
  `rv-band-x/y` seat accounts on (capped at 2 a side like the real one).
- **A crossing book.** The maker gate refuses an order that would cross
  at placement, so a batch settlement only happens after the mid MOVES
  into the book. `rv-mid-at who y` puts the mid on a resting order's
  price; `rv-settle-at` does that with a keeper right behind it.

Two fuzz aids that change nothing the invariants read: `rv-unpause` and
`rv-reset-mins` (anyone). RV keeps ONE simnet across runs and the operator
is one sender in ten, so one random `set-paused true` or one random
`set-min-token-x-deposit` (a natural up to 2^31) starved the rest of the
first sweeps (ERR_PAUSED x70, ERR_NOTHING_TO_SETTLE x159 on settle). Pause
still blocks deposits, readmits and settlement in between; cancel and
withdraw never had a pause gate.

**Finding (cosmetic, fixed in source 2026-09-15, uncommitted at the time
of writing):** `deposit-token-y` computes `bid` through `pegged-bid` inside
its `let` before it asserts `valid-spread`, so a spread of 10000 or more
hit `(- u10000 spread)` and aborted with ArithmeticUnderflow instead of
returning u1026 (the x side adds, so it returned u1026). No funds, no
state: the tx fails either way. The guard now sits inside `pegged-bid`
(a spread at or over BPS_PRECISION is the switched-off sentinel u0), which
also protects a front end reading it. Runtime panics only log in RV; the
120 underflows in the 1000-run sweep were counted from the log, not
flagged. The 20 stxer harnesses of the v6 set were rerun on the guarded
source the same day (real Lazer update): all green, 1,700+ checks.

The 31 market invariants: the 12 v1/v2 list-vs-totals, ghost and bound
checks (current and next cycle), plus, new for v6: balance conservation
WITH settle live (contract balance = open-cycle totals + next-cycle totals
+ every parked amount + pending escrow, x on mock-ft and y on native STX),
scratch state clean at rest (pending rebates, `crossing`,
`taker-too-small`), never live and parked on one side, every position has
an order with a valid spread and no stale order row without a position,
nothing stranded in the settled cycle, the open cycle unsettled, cleared
at most deposited, no duplicate in the depositor lists, seats within the
reservation; and (added after review) the last settlement's fees are
exactly FEE_BPS of what cleared, x cleared at the settlement price never
exceeds y cleared, and the read-only surface is total at the live mid
(`get-taker-capacity`, `would-take-as-x/y`, every account's
`token-x/y-limit-at` evaluate without a runtime error: the class of the
MAX_UINT sentinel overflow found on the v6 bounty); and, third round: a
seat holder is never parked (the seat wrapper refuses a parked account so
the market alone decides), the next two cycles are empty at rest (rolls
write to cycle+1 and advance in the same call), and the configuration is
frozen and sane (initialized, tokens unchanged, minimums above zero, the
price region within the queue). One candidate was tried and dropped:
"unseated makers on a side never exceed MAX_DEPOSITORS minus the seats"
is false by design, a retired seat holder keeps its resting order and
counts in the open region until it leaves; RV found that inside 400 runs
right after a prune.

`jing-core-v5` (`build.sh` 2g, target `markets-sbtc-stx-jing-v6-on-core`):
the registry and equity ledger fuzzed THROUGH the market. The core cannot
be the RV target itself (its wrappers would call the market, which calls
the core: clarinet refuses the cycle, and even a qualified principal
literal counts as an edge), so the target is a second build of the v6
market bound to the real `.jing-core-v5`, carrying the 31 market
invariants plus a core add-on (`jing-core-v5.invariants.clar`): total
equity equals the sum of the accounts' buckets, every account's bucket
equals its position on the market (live + parked, both sides: deposits
credit, refunds / withdrawals / cleared / matched debit, parks and rolls
move nothing), paused implies a consistent paused-at. Tried and dropped:
"the pending owner is never the current owner", propose-owner accepts the
owner proposing itself (accepting is a no-op), RV found it inside 1000
runs. Core admin paths (pause, unpause, handover,
set-verified with a fixed hash) run through wrappers with the RV account
as tx-sender; the market registers itself through a fuzz-only
`rv-register` on the core (the real register wants a code hash no account
has). Pause timelock 10 burn blocks in the build. The core's pause gate
then blocks the market's deposits, matches and settlements for real, and
never its cancels.

`jing-ladder` (`build.sh` 2e): the only gate an account cannot pass is
the code hash, so both `contract-hash?` reads become a fixed buffer and
any account registers as a rung; wrappers fold the side onto the six
real ones (one in eight junk, u6007) and the key onto four values so
register hits free, taken and replaced keys. Six invariants: the band
count on each side equals the number of accounts holding a seat there
and never exceeds the cap, a fixed or guarded rung always holds its own
key, every row has a real side, a seat holder is registered on that side,
the handover was proposed in the past.

The six rungs (`build.sh` 2f, one mirrored invariants file each, edit all
six together): the rung is the SUT, pre-initialized at 331.50 sats per
STX (20 bps for the spread rungs; `initialize` and the ladder
registration are out of scope, covered keyless on stxer), on the v6 fuzz
market (`.v6-market`), the mock ladder, the mock RFQ native oracle
(`mock-rfq-oracle.clar`, `rv-set-native`) and one mock-ft for sBTC and
wstx. Wrappers play the market around it (mid, bids, asks, cancels, a
taker on the other side, settlements; `rv-seat` for the band rungs) and
each ends with `sync` so the rung's view is current. Twelve invariants:
held equals the local balance, the proceeds watermark equals the proceeds
balance, total shares equal the sum of current-epoch shares, the pool the
indices imply never exceeds resting plus held and the members' unsold
claims never exceed the pool, the members' proceeds claims fit the
balance, `unfilled-index` in `[SOLD_OUT_INDEX, SCALE]`, no paid mark ahead
of the proceeds index, and the resting order is the one the rung was
deployed for (price and `none`; floor / cap and `(some spread)`; `(some
spread)` for the band rungs, whose guard moves with the oracle), and the
rung is never live and parked at once on the market, a closed epoch's
final index never runs ahead of the live one, and the rung holds no order
row on the market without a position.

Sweeps (2026-09-15, `--runs` as shown, zero falsified invariants):

| target | runs | invariants (checks) | real movement (successful calls) |
|---|---|---|---|
| markets-sbtc-stx-jing-v6 | 1000 | 31 (1000; two later rounds of 400 runs each for the six added after review) | rv-deposit-x x93 / -y x86 (+ raw x40 / x33), rv-reprice-x x55 / -y x57 (+ raw x16 / x18, the crossing branch settles), rv-swap x9, rv-settle x4, rv-settle-at x1, rv-mid-at x45, rv-cancel-x x67, cancel-y x55, rv-withdraw-x x28, withdraw-y x46, readmit-x x2 / -y x1, rv-band-x x88 / -y x84, sync-seat x41, prune-cycles x14; 0 underflows with the pegged-bid guard in source (120 before it) |
| markets-sbtc-stx-jing-v6-on-core (jing-core-v5) | 1000 | 31 + 3 (1000, then 300 on the final set) | rv-core-register x69, rv-core-pause x5 / unpause x3, propose x4 / accept x2, set-verified x6; rv-deposit-x x24 / -y x23, rv-cancel-x x18, withdraw-y x10, crossing reprices x7, rv-swap x1; equity tracked every position through all of it |
| jing-ladder | 500 | 6 (500) | rv-register x5, rv-register-unseated x4, seat-band x6, rv-retire-band x4, rv-set-canonical x16, set-max-band-per-side x18, propose-owner x23, accept-owner x4, log-* x140-177 each; raw register / set-canonical x0 (random side strings, as expected) |
| jing-buy-stx | 500 | 12 (500; 200 more runs per added round on a buy and a sell rung) | deposit x184, withdraw x193, claim x175, push x227, sync x220, rv-settle x19, rv-take x36 |
| jing-sell-stx | 500 | 12 (500; 200 more runs per added round on a buy and a sell rung) | deposit x193, withdraw x84, claim x142, push x194, sync x206, rv-settle x28, rv-take x26 |
| jing-buy-stx-market-spread | 500 | 12 (500; 200 more runs per added round on a buy and a sell rung) | deposit x184, withdraw x181, claim x156, push x196, sync x209, rv-settle x15, rv-take x48 |
| jing-sell-stx-market-spread | 500 | 12 (500; 200 more runs per added round on a buy and a sell rung) | deposit x186, withdraw x174, claim x161, push x221, sync x212, rv-settle x18, rv-take x14 |
| jing-buy-stx-core-spread | 500 | 12 (500; 200 more runs per added round on a buy and a sell rung) | deposit x159, withdraw x143, claim x139, push x175, sync x182, rv-seat x183, rv-set-native x183, rv-settle x8, rv-take x30 |
| jing-sell-stx-core-spread | 500 | 12 (500; 200 more runs per added round on a buy and a sell rung) | deposit x149, withdraw x137, claim x127, push x200, sync x196, rv-seat x175, rv-set-native x195, rv-settle x16, rv-take x3 |

Logs of the day's sweeps were read for the counts above; RV prints the
same summary at the end of every run. `rv-take` on the sell rungs folds the
taker under 0.002 BTC (a raw natural runs to 21 BTC against a few thousand
STX resting and the market refuses a partial fill, u1017).

### swap-router-sbtc-stx-jing-v5, added 2026-09-15

The taker path users call, fuzzed on the v6 fuzz market with one mock per
AMM (`build.sh` 2h): DLMM pool, core and router, XYK pool and core, Velar
pool and fees, plus `mock-wstx`, a SIP-010 facade that moves real STX so
the Velar mock reads the direction off `token-in`. Each AMM mock takes
the input from the user and pays exactly the minimum the router derived
from the mock pool state (reserves, bins, fees), so the pricing under
test is the router's own sizing arithmetic; STX payouts come from what
`rv-fund-amms` gave the mocks, sBTC payouts mint. The router is a
pass-through by design and that is what is checked:

- one invariant, **the router holds nothing**, in either token, ever;
- five properties: after a smart or manual swap in either direction that
  returned ok, the user's sold token went down by exactly `amount` minus
  `unsold`, the bought token went up by exactly `out`, the four legs plus
  `unsold` sum to `amount`, and `out` is the sum of the leg outs (the
  "sells a different total" class from the router's own header); a swap
  with a floor of one that returned ok paid something.

Wrappers build the book (bids, asks, pegs, cancels, settlements, the mid)
and call the entries with realistic sizes (under 0.5 BTC, under 5,000
STX), the mock oracle's mid as the hint, random four-way splits and
fallbacks for the manual entries. The manual entries' raw calls mostly
land on u3004 (a random split never sums to the amount), the wrappers
pass.

| mode | runs | result |
|---|---|---|
| invariant | 300 | router-holds-nothing checked 300 times, 0 failed; smart and manual entries succeeded 59 times in the first 40 runs alone |
| test (properties) | 500 | smart sell sBTC x7, smart sell STX x16, manual sell sBTC x8, manual sell STX x11, floor honoured x22; 0 failed |

Two false alarms on the way, both from the fuzz build, not the router: the
market's treasury defaulted to the deployer, one sender in ten, so a fee
paid mid-swap moved the taker's own balance (u9201, 18 times in the first
sweep; the fuzz market's treasury is now a contract that never trades),
and a taker who also rested on the market got its own maker fill in the
same balances (a runtime underflow once; such a user is now discarded).

Rungs, third round: the seat invariant (a rung the ladder seats is never
parked) on all six, and on the two band rungs a property that a deposit
which reached the market rests at the guard read at that moment
(`current-floor` / `current-cap`).

### Property tests (`rv ... test`), added 2026-09-15

Invariants read the state at rest. RV's second mode calls `test-*`
functions: a random action, then the promise that call made. `(ok true)`
passes, `(ok false)` discards (the action did not apply), `(err ...)` or a
runtime error fails, and here a panic does count. RV only calls `test-*`
functions in this mode, so each file also carries `test-drive-*`
functions that build the state the properties act on (deposits, mid
moves, seats, bids and asks around a rung); the simnet persists across
runs.

Market (also on the core target): **the sizing promise**, a swap of
exactly `get-taker-capacity`'s gross-cap at the same mid and limit fills
(never u1017; discarded under the taker minimum, with a resting position,
or paused); **fill or kill**, after a swap the taker holds nothing on its
side; **the binding side clears fully** at settlement (cleared equals the
settle total on x or on y); **readmit restores** the parked amount
exactly; **a partial withdrawal leaves the minimum**; **cancel returns the
whole position**, both the amount reported and the tokens received.

Rungs (all six): **deposit then withdraw it all never takes more out of
the pool than went in**, measured on the pool (held plus resting) because
the mock token mints a fresh wallet on its first transfer (the first cut
measured the member and flagged that mint); **a withdrawal never pays
more than the position showed** before the call.

What the first property sweeps taught, none of it a contract defect:

- The market properties all discarded until the drivers existed: in test
  mode nothing else builds a book.
- The rung no-drain test first flagged a "drain" that was the mock token
  minting a fresh wallet on its first transfer; it now measures the pool.
- The sizing promise tripped u1017 once (seed -294427561). Not the
  small-share filter (a diagnostic count in the error came back zero):
  a y-side taker's remainder after the walk is quantised to one sat's
  worth of STX (3,000 to 4,000 uSTX in the band) and the fuzz build's y
  minimum was u100, so a sub-sat remainder read as a partial fill instead
  of dust. The fuzz minimum is now u10000, above one sat in the whole
  band; the production minimums are 1,000 sats and 1 STX (1e6 uSTX), 250 times a sat. Same seed passes.
- Then two limits of `get-taker-capacity` that ARE real, both refusals
  (no funds at risk), both now discarded by the property and worth a line
  in the router's sizing:
  - **the read had no taker argument**, so it counted the taker's own
    resting order on the opposite side, which the walk skips (a self-cross
    is never filled: in the batch both of a principal's sides clear at the
    oracle mid, a print nobody chose; on the walk a self-fill would print a
    match at a self-chosen price). A user who rested a bid and took exactly
    the reported capacity with sBTC got u1017 (seed -2050959550, flag 128
    in the diagnostic error); `swap` only forbids a resting position on the
    DEPOSIT side, so it was reachable. FIXED the same day: `get-taker-capacity`
    takes `(taker principal)` as its fourth argument and leaves that
    principal's out-of-range opposite order out of `walk-cap` (in range it
    still counts, the batch clears it); router v5 passes `tx-sender`, the
    harnesses a neutral principal. The property no longer discards a taker
    resting on the other side, and the seed passes. The commented source
    crossed 100,000 bytes with the change (100,655; 95,894 stripped), so
    every v6 harness now strips comment lines before deploying, as the
    deploy form is.
  - **the read did not model the queue**: on a full side a taker smaller
    than the smallest resident is refused by the size rule (u1010) before
    any fill. Six slots in the fuzz build make it frequent; forty open
    slots in production make it rare. FIXED the same day: the read runs
    `side-full` and `find-smallest` for the taker exactly as the deposit
    core does, reports `min-taker` (the smallest unseated resident plus
    one, net terms, zero on an open side) as a new tuple field, and reads
    zero caps when its net-cap could not enter; router v5 drops the book
    leg when the net is under `min-taker`, so the AMMs take that order.
    The property no longer discards u1010.
- `readmit-restores` and `settle-binding-side-clears` rarely fire under
  random test order (a park with a free slot after it; a crossing book
  right before a settle); both are exercised by the invariant sweeps'
  wrappers instead.

| target | runs | properties (passes) |
|---|---|---|
| markets-sbtc-stx-jing-v6 | 500 | sizing promise x3, fill-or-kill x5, binding side clears x1, readmit restores x1, withdraw leaves min x5 / x6, cancel returns position x10 / x9; 0 failed |
| markets-sbtc-stx-jing-v6-on-core | 200 | same set on the real registry, 0 failed |
| six rungs | 200 each | deposit+withdraw no-drain x16-22, withdraw within position x4-14 each; 0 failed |

Discards are the norm in this mode (an action that did not apply is not a
counterexample): the sizing promise runs only when a book exists and the
sender rests nothing on either side.

```bash
npm run rv:v6:props      # 500 runs
npm run rv:core:props    # 300 runs
npm run rv:rungs:props   # six targets, 300 runs each
```

Run:

```bash
npm run rv:build                     # market v6, ladder, six rungs
npm run rv:v6                        # 1000 runs
npm run rv:core                      # core-v5 through the market, 1000 runs
npm run rv:ladder                    # 500 runs
npm run rv:rungs                     # six targets, 500 runs each
npx rv . jing-buy-stx invariant --seed=<n>   # replay
```

### creator-bonus-jing, added 2026-09-02

Spot rewards on top of `creator-escrow-v2-jing`. The fuzz build swaps the
deployed escrow literal for `mock-creator-escrow` (status = id mod 5,
creator = wallet_1 or wallet_2 from id / 5, one round paying wallet_3 /
wallet_4), USDCx for `mock-ft` with the with-ft asset name pinned, folds
delivery ids into 0..99 so fund / claim / revoke collide on the same rows,
and makes `fund` record each new id in `rv-ids` so the invariants can scan
every row. Four invariants: conservation (contract balance = sum of pending
pots), every row sits on a RELEASED delivery for its real creator, claimed
pots land in wallet_3 / wallet_4 and nowhere else, and `is-claimable`
agrees with the row. Real movement in the 500-run sweep: fund x22, claim
x5, revoke x4; 119-129 checks per invariant, zero failures. Ids are folded
because RV keeps one simnet across runs: with ten ids the two RELEASED ones
went terminal in the first few calls and every later fund bounced u206.

```bash
bash tests/rv/build.sh creator-bonus-jing
npx rv . creator-bonus-jing invariant --runs=500 --bail
```

### v2 targets (maker/taker split), added 2026-08-18

`markets-sbtc-stx-jing-v2` reuses the 13 v1 invariants plus a 14th,
`invariant-pending-rebates-zero-at-rest`: the `pending-rebate-{x,y}`
scratch vars are set only inside the atomic taker paths (swap /
reprice-or-swap crossing branch) and reset by execute-settlement, so no
committed state may ever leave a nonzero pending rebate behind.

**Fuzz relaxation (build.sh section 2c):** the maker gate and
reprice-or-swap call `fresh-classification-price` on a hard-coded Pyth
plan; RV's random vaa buffers can never pass wormhole verification, which
would freeze the book one-sided (every deposit into a non-empty opposite
book reverts) and starve the lifecycle. The build replaces
`(try! (fresh-classification-price vaa))` with a fixed sane BTC/STX cross
(u32000000000000, ~0.32 STX/sat x 1e8) so classification stays REAL
against random limits: both gate outcomes and both reprice branches are
reachable. The crossing branches still revert at settle-with-refresh
(its own Pyth path is untouched), so settle stays out of RV scope exactly
as documented for v1. Same relaxation family as the rfq-v2 fuzz build.

Real movement in the 500-run sweep (successful state mutations):
`reprice-or-swap-token-x` x60 / `-y` x20 (the new v2 surface),
`deposit-token-x` x44 / `-y` x31, `close-deposits` x51, `cancel-cycle`
x50, `set-token-x-limit` x59 / `-y` x13, `cancel-token-y-deposit` x23,
operator setters ~20. The 14 invariants checked 25-45 times each on that
moving state, zero failures. (`settle*`/`swap`/`close-and-settle*` x0:
Pyth-gated, out of scope. `cancel-token-x-deposit` had 0 successes in
this seed run — covered deterministically by the clarinet suite.)

`vault-sbtc-stx-v2` reuses the 3 structural vault invariants
(initialized-monotonic, replay-map-monotonic, balance-ok); 154-174 checks
each, zero failures. Build rewrites the vault's ABSOLUTE
`'SPV9K21....{markets-sbtc-stx-jing-v2, jing-core-v2, jing-vault-auth}`
refs to local mocks (build.sh section 2a — MUST run before the generic
`.jing-core*` / `.markets-*` replaces, whose patterns are substrings and
would corrupt the names). The v2 manifests point the `mock-jing-core` /
`mock-jing-market` contract NAMES at v2 mock FILES:
`mock-jing-core-v2.clar` (regenerated from the local core source, now
`jing-core-v3.clar` — the v2 market calls log-* fns the v1 core lacks) and `mock-jing-market-v2.clar`
(vaa-carrying deposit/set-limit signatures, reprice/swap returning the
result tuple, `get-taker-rebate-bps` = u20 so the v2 vault's initialize
rebate assert passes).

Run:

```bash
bash tests/rv/build.sh markets-sbtc-stx-jing-v2
npx rv . markets-sbtc-stx-jing-v2 invariant --runs=500

bash tests/rv/build.sh vault-sbtc-stx-v2
npx rv . vault-sbtc-stx-v2 invariant --runs=500
```

rfq-v3 notes: same relaxations as v2 minus the fixed native mid (v3 has no
oracle to mock). The calibration invariant is gone with the efficiency knob;
the remaining 4 held with real movement (escrow conservation x119). Sig
parity + auth/band reverts live in the 70-assert stxer harness
(simulations/verify-rfq-sbtc-stx-jing-v3.js), which also pins the two
design-decision positives: a signed 25%-under and 25%-over quote both fix
fine (no floor/ceiling in v3).

rfq-v2 notes: the fuzz build relaxes the SIP-018 sig check, wall-clock ref
checks, native price (fixed mid) and whitelist default (see the invariants
file header) so RV can reach the lifecycle. Real movement: open-rfq x27 +
reclaim x14 per 500-run sweep, so escrow conservation (invariant 1, 97
checks) is exercised on live state. fix-price never succeeds under pure
random args (committed/quoted must sit within 20bps of each other) -- that
path is covered by the 72-assert stxer harness
(simulations/verify-rfq-sbtc-stx-jing-v2.js) instead.

The 13th invariant (`invariant-balance-eq-cycle-totals`) compares the
contract's actual token balance against the sum of `cycle-totals`
across all cycles. **This is the invariant that catches the cancel-cycle
× small-share-roll bug fixed earlier today** — verified by reverting
the fix in `.build/` and watching RV trip the invariant within ~30
random tx sequences. With the fix in place, the invariant holds across
500 runs (43+ checks per market on real state movement). The other 12
list/totals/ghost/bound invariants still pass trivially under that
specific bug because the bug had list/totals/map internally consistent
at *wrong* values; only the contract-balance-vs-cycle-totals check sees
the underlying corruption.

State actually moves under fuzzing — not just trivial passes:

| Path | usdcx | stx |
|------|-------|-----|
| `cancel-cycle` (the bug-fix path) | 67 successful | 57 successful |
| `close-deposits` (small-share-filter trigger) | 67 | 58 |
| `deposit-token-x` | 26 | 19 |
| `deposit-token-y` | 15 | 28 |
| `cancel-token-{x,y}-deposit` | 22 | 26 |
| Operator setters | dozens | dozens |

`settle*` and `swap*` are skipped by RV (they take Pyth traits with no
trait impls in this manifest); the cancel-cycle × small-share-roll
state path that hosted today's bug is exercised heavily without those.

## How it works

RV requires (a) the SIP-010 trait have at least one implementing
contract in the simnet so it can pass token args to deposit functions,
and (b) the contract being fuzzed not depend on unresolved external
contracts at compile time. Production market contracts reference
mainnet sBTC/USDCx and a real `jing-core`, neither of which load via
the local simnet path RV uses.

The build pipeline (`tests/rv/build.sh`) takes production market
source and rewrites these references to local mocks, then appends an
invariants block. Output goes to `tests/rv/.build/` (gitignored).

Rewrites (sed-style, applied to the production .clar):

| From | To | Why |
|------|-----|-----|
| `'SP3FBR2…sip-010-trait` | `.sip-010-trait.sip-010-trait` | Local SIP-010 trait |
| `.jing-core` | `.mock-jing-core` | Stub log-* (no auth, no equity ledger) |
| `(define-data-var token-x principal SAINT)` | `… principal .mock-ft` | Skip needing initialize() |
| `(define-data-var token-y principal SAINT)` | `… principal .mock-ft` | Same mock for both sides → trait check passes either way |
| `(define-data-var initialized bool false)` | `… true` | Initialize gate is bypassed |
| `(define-data-var min-token-{x,y}-deposit uint u0)` | `… u1` | Allow tiny RV-generated amounts |

Pyth contracts (`pyth-storage-v4`, `pyth-oracle-v4`, `pyth-traits-v2`,
`wormhole-traits-v2`) are loaded as Clarinet `[[project.requirements]]`
from the local cache — they're needed for type-checking even though RV
won't reach the settle path that calls them.

## What the 12 invariants check

For both x-side and y-side, on both current cycle and next cycle:

1. **List sum matches totals**: sum of individual deposits over the
   depositor list = `cycle-totals[C].total-token-{x,y}`. Catches any
   code path that updates list/totals/deposits-map non-atomically.
2. **No ghosts**: every depositor in the list has deposit > 0. Catches
   stale list entries left behind by partial cancel paths.
3. **Bounded list**: `len(depositors) <= MAX_DEPOSITORS` always.
4. **Cleared ≤ deposited**: for any settled cycle, `{x,y}-cleared` does
   not exceed the total at settle time. Catches over-fill bugs in the
   clearing formula.

## What this catches

**Drift bugs** (one path updates list but not totals; one-directional
inconsistencies; off-by-one in the small-share filter re-counts;
unbounded list growth from a queue-full bypass) — caught by the 12
list/totals/ghosts/bounds invariants.

**Conservation bugs** where the contract's actual token balance drifts
from the sum of declared cycle-totals — caught by the
`invariant-balance-eq-cycle-totals` invariant. This includes the
cancel-cycle × small-share-roll bug (fixed 2026-05-07); verified by
reverting the fix in `.build/` and watching RV trip the invariant on
the resulting buggy build.

**Out of scope** (not exercised by RV in this setup): settle and swap
paths take Pyth/wormhole traits with no impls in this manifest, so
they're skipped. If those paths need fuzzing too, deploy the real
Pyth contracts (or stubs that return realistic prices) and add Pyth
trait impls. The balance invariant would also need to subtract
settled-out amounts since settle legitimately drains the contract.

## Running

```bash
# Rebuild both market contracts (concatenate prod source + invariants
# with mock rewrites, output to tests/rv/.build/)
bash tests/rv/build.sh

# Fuzz one market (replace usdcx with stx for the other)
npx rv . markets-sbtc-usdcx-jing invariant --runs=500 --bail

# Replay a specific failing seed
npx rv . markets-sbtc-usdcx-jing invariant --seed=<n>

# Regression-only (replays every saved failure)
npx rv . markets-sbtc-usdcx-jing invariant --regr
```

Saved failure seeds are written to `.rendezvous-regressions/`
(gitignored). `--regr` replays them; once a fix lands, those seeds
should pass and stay green forever.

## Files

- `sip-010-trait.clar` — Local copy of the SIP-010 trait.
- `mock-ft.clar` — Fake token: transfer always returns ok, get-balance
  always returns a huge number. Lies about the ledger because we're
  fuzzing the market's state machine, not the FT layer.
- `mock-jing-core.clar` — Stub for every `log-*` and `register`/`get-contract-owner`
  call the markets make. All return `(ok true)`. Generated by
  `_make-mock-jing-core.py` from the real `jing-core.clar` so signatures
  stay in sync — re-run that script when `jing-core` adds new log-* fns.
- `<contract>.invariants.clar` — Append-only invariant block.
- `build.sh` — Build pipeline. See "How it works" above.
- `.build/` — Output directory (gitignored).
- `Clarinet-<contract>.toml` (at project root) — Custom manifest per
  contract pointing RV at the augmented .clar.
