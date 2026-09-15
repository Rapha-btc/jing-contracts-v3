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
markets-sbtc-stx-jing-v6    -- 1000 runs, 25 invariants, 0 failures (2026-09-15, settle LIVE)
jing-ladder                 -- 500 runs,  6 invariants, 0 failures (2026-09-15)
jing-buy/sell-stx x3 pairs  -- 500 runs,  9 invariants each, 0 failures (2026-09-15)
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
flagged.

The 25 market invariants: the 12 v1/v2 list-vs-totals, ghost and bound
checks (current and next cycle), plus, new for v6: balance conservation
WITH settle live (contract balance = open-cycle totals + next-cycle totals
+ every parked amount + pending escrow, x on mock-ft and y on native STX),
scratch state clean at rest (pending rebates, `crossing`,
`taker-too-small`), never live and parked on one side, every position has
an order with a valid spread and no stale order row without a position,
nothing stranded in the settled cycle, the open cycle unsettled, cleared
at most deposited, no duplicate in the depositor lists, seats within the
reservation.

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
each ends with `sync` so the rung's view is current. Nine invariants:
held equals the local balance, the proceeds watermark equals the proceeds
balance, total shares equal the sum of current-epoch shares, the pool the
indices imply never exceeds resting plus held and the members' unsold
claims never exceed the pool, the members' proceeds claims fit the
balance, `unfilled-index` in `[SOLD_OUT_INDEX, SCALE]`, no paid mark ahead
of the proceeds index, and the resting order is the one the rung was
deployed for (price and `none`; floor / cap and `(some spread)`; `(some
spread)` for the band rungs, whose guard moves with the oracle).

Sweeps (2026-09-15, `--runs` as shown, zero falsified invariants):

| target | runs | invariants (checks) | real movement (successful calls) |
|---|---|---|---|
| markets-sbtc-stx-jing-v6 | 1000 | 25 (1000) | rv-deposit-x x93 / -y x86 (+ raw x40 / x33), rv-reprice-x x55 / -y x57 (+ raw x16 / x18, the crossing branch settles), rv-swap x9, rv-settle x4, rv-settle-at x1, rv-mid-at x45, rv-cancel-x x67, cancel-y x55, rv-withdraw-x x28, withdraw-y x46, readmit-x x2 / -y x1, rv-band-x x88 / -y x84, sync-seat x41, prune-cycles x14; 0 underflows with the pegged-bid guard in source (120 before it) |
| jing-ladder | 500 | 6 (500) | rv-register x5, rv-register-unseated x4, seat-band x6, rv-retire-band x4, rv-set-canonical x16, set-max-band-per-side x18, propose-owner x23, accept-owner x4, log-* x140-177 each; raw register / set-canonical x0 (random side strings, as expected) |
| jing-buy-stx | 500 | 9 (500) | deposit x184, withdraw x193, claim x175, push x227, sync x220, rv-settle x19, rv-take x36 |
| jing-sell-stx | 500 | 9 (500) | deposit x193, withdraw x84, claim x142, push x194, sync x206, rv-settle x28, rv-take x26 |
| jing-buy-stx-market-spread | 500 | 9 (500) | deposit x184, withdraw x181, claim x156, push x196, sync x209, rv-settle x15, rv-take x48 |
| jing-sell-stx-market-spread | 500 | 9 (500) | deposit x186, withdraw x174, claim x161, push x221, sync x212, rv-settle x18, rv-take x14 |
| jing-buy-stx-core-spread | 500 | 9 (500) | deposit x159, withdraw x143, claim x139, push x175, sync x182, rv-seat x183, rv-set-native x183, rv-settle x8, rv-take x30 |
| jing-sell-stx-core-spread | 500 | 9 (500) | deposit x149, withdraw x137, claim x127, push x200, sync x196, rv-seat x175, rv-set-native x195, rv-settle x16, rv-take x3 |

Logs of the day's sweeps were read for the counts above; RV prints the
same summary at the end of every run. `rv-take` on the sell rungs folds the
taker under 0.002 BTC (a raw natural runs to 21 BTC against a few thousand
STX resting and the market refuses a partial fill, u1017).

Run:

```bash
npm run rv:build                     # market v6, ladder, six rungs
npm run rv:v6                        # 1000 runs
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
