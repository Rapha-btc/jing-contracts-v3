# Stxer Mainnet-Fork Simulations — jing v3 markets

Full lifecycle coverage of `markets-sbtc-usdcx-jing.clar` and
`markets-sbtc-stx-jing.clar` against a pinned mainnet tip via
[stxer](https://stxer.xyz). Each sim exercises the new `jing-core`
verified-contract registry flow + a market-specific scenario, and runs
**unmodified production contract source** (with two narrow exceptions
documented below — `MAX_DEPOSITORS` patched in the queue-full sim and
nothing else).

## Recent design change: jing-core multi-sig-owner model (2026-05-07)

`jing-core` was simplified from a four-role two-step timelocked admin
surface to a single owner-controlled flow with a slim `guardian` role
for fast pause. The `register` function gained
`tx-sender == contract-owner` to close a bytecode-replay attack where
an attacker could deploy hash-matching bytecode at their own principal
and register it under the canonical's verified hash. See:

- `contracts/JING-CORE-DESIGN.md` — full threat model, what changed
- `contracts/MULTISIG-DEPLOYMENT.md` — how to deploy from a Stacks
  native multi-sig

For sims this means the registry prelude is now 4 steps instead of 9:

1. Deploy `jing-core` (Clarity 4)
2. Deploy market (Clarity 5)
3. Owner: `set-verified-contract(market)` — one step, no timelock
4. Owner: `market.initialize(...)` — internally calls `jing-core.register`
   which checks tx-sender == contract-owner AND hash match

The prelude is factored into `simulations/_setup.js#addRegistryInit`.
The old propose/confirm validator dance + `MAX_VALIDATORS` cap +
two-step timelocked promotion are gone — multi-sig signing rounds
provide the audit window an on-chain timelock used to enforce.

Production market contracts now use **`MAX_STALENESS = u80`** (real
freshness gate, ~80 sec window). This means stored Pyth prices on a
fork are stale, so every sim that settles uses **`settle-with-refresh`**
with a freshly-fetched VAA from Hermes — the production keeper path.
Plain `settle` is still tested in the dedicated `*-settle-refresh`
sims (proves it correctly fails with `u1005 STALE_PRICE` against
fork-stored prices).

## Mainnet addresses

| Role | Address | Notes |
|------|---------|-------|
| Deployer / market operator / jing-core owner | `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22` | In production this is intended to be a multi-sig |
| sBTC depositor | `SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2` | ~40.5 BTC, 0 free STX |
| USDCx / STX depositor | `SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51` | ~832 USDCx + ~2953 STX free; doubles as STX-side depositor for sbtc-stx |
| Guardian (in pause sim only) | `SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3` | Demonstrates the fast-pause role |

## Running a sim

```bash
cd ~/projects/jingswap/contracts/jing-contracts-v3
npm install
npx tsx simulations/simul-markets-sbtc-usdcx-jing.js
# Output ends with: View: https://stxer.xyz/simulations/mainnet/<sessionId>
```

Pyth VAA sims (`settle-refresh`, `swap`) fetch live VAAs from
`https://hermes.pyth.network/v2/updates/price/<timestamp>` so they need
internet access at run time.

## Coverage matrix

All 37 sims green as of 2026-05-07. ✓ = clean run, expected errors
only. Every public function on both market contracts has at least one
sim exercising it.

| Sim | sBTC/USDCx | sBTC/STX | What it proves |
|-----|------------|----------|----------------|
| `simul-markets-sbtc-{usdcx,stx}-jing.js` | [✓](https://stxer.xyz/simulations/mainnet/342839eee825febdd7ab46ebc7b96d77) | [✓](https://stxer.xyz/simulations/mainnet/c527f049540b393997765f0fd8160c5d) | Full lifecycle via `settle-with-refresh` (production keeper path under MAX_STALENESS u80): registry init → deposits → top-up → close → settle-with-refresh → cycle 1 rollover. STX variant uses TWO VAAs. |
| `*-cancel-flows.js` | [✓](https://stxer.xyz/simulations/mainnet/99a33d74b078dc963258f5af7db77695) | [✓](https://stxer.xyz/simulations/mainnet/a2ec8de76696873624a33cfb8cacfb29) | Cancel-deposit happy path, cancel-empty (`u1008`), cancel during settle (`u1002`), cancel-cycle before threshold (`u1014`), cancel-cycle after 42-block advance, then cancel rolled deposits in cycle 1. |
| `*-cancel-after-roll.js` | [✓](https://stxer.xyz/simulations/mainnet/fa17e519ccfe7950f9ddba603b622bcb) | [✓](https://stxer.xyz/simulations/mainnet/63fe1c3d0493fe580d63fff57b54729f) | **Regression test** for the cancel-cycle × small-share-filter state-overwrite bug (found 2026-05-07, fixed in same-day commit). Reproduces the trigger: whale + 3 fish below 0.20% threshold deposit y; close-deposits rolls fish to cycle 1; advance 42 blocks; cancel-cycle. Asserts cycle 1 holds all 4 depositors with merged totals (600M whale + 3M fish = 603M), every deposits-map entry intact, all 4 cancel cleanly without underflow. |
| `*-same-depositor.js` | [✓](https://stxer.xyz/simulations/mainnet/4060f0b88fcbdc9c414d01f794c368c7) | [✓](https://stxer.xyz/simulations/mainnet/6d23cce77fe11a8571a84784bcce260b) | One principal on both depositor lists, settles cleanly via settle-with-refresh, single payout flow. |
| `*-small-share-filter.js` | [✓](https://stxer.xyz/simulations/mainnet/e664110795b94109683a68868eec0ae5) | [✓](https://stxer.xyz/simulations/mainnet/89443a6861b8a07ff38e34fbd57310e2) | 3 fish at ~0.17% each get rolled forward at close (`MIN_SHARE_BPS = 20`). USDCx variant tests 2 rolls + cycle-2 settle; STX variant ends after 1 roll (cross-rate clears more per cycle). |
| `*-dust-sweep.js` | [✓](https://stxer.xyz/simulations/mainnet/8789fbdd402758e267ad85e66cdc6d61) | [✓](https://stxer.xyz/simulations/mainnet/305d512118071c07b2c4c85fde77c092) | 3 depositors per side with amounts that maximize integer-truncation dust during proportional distribution; verifies dust gets swept to treasury. |
| `*-dust-sweep-both.js` | [✓](https://stxer.xyz/simulations/mainnet/9e86f044df053e57d18ab3c3aba50c10) | [✓](https://stxer.xyz/simulations/mainnet/05c8346345bc1e21003571e8278a875d) | Heavy y-side vs light sBTC → sBTC binding → dust expected on the y-side roll. |
| `*-settle-refresh.js` | [✓](https://stxer.xyz/simulations/mainnet/f45a75e6e73791381c30b39703a25a27) | [✓](https://stxer.xyz/simulations/mainnet/7f10acd2160e2c1779eee1abbab79574) | Proves the production `MAX_STALENESS = u80` freshness gate fires: `settle` against fork-stored stale Pyth → `ERR_STALE_PRICE` (u1005); `settle-with-refresh` with fresh VAA → ok. STX variant uses TWO VAAs (BTC/USD + STX/USD). |
| `*-swap.js` | [✓](https://stxer.xyz/simulations/mainnet/e1a9c7a6b7acfdf928da1366a0b8cbc1) | [✓](https://stxer.xyz/simulations/mainnet/b56f8165d43b384de4d8690d69a995c2) | Atomic taker, `deposit-x = true`: `deposit-token-x + close-deposits + settle-with-refresh` in one tx. STX variant uses TWO VAAs. |
| `*-swap-deposit-y.js` | [✓](https://stxer.xyz/simulations/mainnet/85dacbfd38c8547c7991fc1c8f607312) | [✓](https://stxer.xyz/simulations/mainnet/4ebe6dced116b66ff3810cdf9444c77c) | Atomic taker, `deposit-x = false` (symmetric case): `deposit-token-y + close-deposits + settle-with-refresh`. Pre-stages sBTC, taker brings y. STX variant uses TWO VAAs. |
| `*-limit-rolls.js` | [✓](https://stxer.xyz/simulations/mainnet/9f261ae58b2e50b067a024aafe79e9f1) | [✓](https://stxer.xyz/simulations/mainnet/3eb17acd3825e1e5e15dfee637eaff4f) | Limit-violation rolls at settle: 4 depositors per pair, one of each side restrictive. `filter-limit-violating-token-{y,x}-depositor` rolls violators to cycle 1; `log-limit-roll-{y,x}` events fire. |
| `*-close-and-settle.js` | [✓](https://stxer.xyz/simulations/mainnet/48afbe6bb01367baf87773f33e339215) | [✓](https://stxer.xyz/simulations/mainnet/9e99417303f855bfd0b79c32a4ae9b7a) | Third party (not a depositor) atomically closes + settles-with-refresh in one tx. |
| `*-treasury-fees.js` | [✓](https://stxer.xyz/simulations/mainnet/07c4839fd6d10916d86baa6f76bdb132) | [✓](https://stxer.xyz/simulations/mainnet/8bef81196501bc57e667a93efeae7877) | Reads treasury balance before/after settle; asserts delta = settlement-tuple's `token-x-fee` + `token-y-fee` + dust-sweep. |
| `*-deposit-gates.js` (usdcx) | [✓](https://stxer.xyz/simulations/mainnet/d84cca9d14cce1fa0cc407a7886cf32c) | n/a — same gates | Provokes every deposit-time error: `u1019 WRONG_TRAIT`, `u1001 DEPOSIT_TOO_SMALL`, `u1017 LIMIT_REQUIRED`, `u1018 ALREADY_INITIALIZED`. All fire correctly; sanity deposit afterward succeeds. |
| `*-queue-full.js` (usdcx) | [✓](https://stxer.xyz/simulations/mainnet/e86fe402c33e7edaa2177ae7b668707f) | n/a — same logic | `MAX_DEPOSITORS` queue-full + smallest-bumping. **Patches `MAX_DEPOSITORS u50 → u5`** in deployed source so test only needs 6 principals (production stays u50). 5 fish fill, challenger w/ amount = smallest → `u1013 ERR_QUEUE_FULL`; challenger w/ amount > smallest → bumps fish[0], deposit drops to 0, fish[0]'s USDCx balance refunded by exactly the bumped amount, list still has 5 entries. |
| `simul-jing-core-pause.js` | [✓](https://stxer.xyz/simulations/mainnet/b8a35671f0b32160baf31b755394da18) — registry + market | Owner-only pause (no guardian role). Non-owner pause → `u5001`. Owner pauses → entry-side `deposit-token-x` blocked with `u5016 PAUSED`. **Exit-side `cancel-token-y-deposit` stays open** (user-fund safety). Owner unpause too early → `u5008 TIMELOCK_NOT_ELAPSED`. Non-owner unpause → `u5001`. After 144-block advance, owner unpauses; entry-side resumes. |
| `simul-jing-core-hash-mismatch.js` | [✓](https://stxer.xyz/simulations/mainnet/4f896270ef91fbff212f40c636f4f36b) — registry hash gate | Verifies market-A's hash via single-step `set-verified-contract`. `market-B.initialize(canonical = market-A)` → `u5006 HASH_MISMATCH`. `market-B.initialize(canonical = market-B)` (not verified) → `u5005 NOT_VERIFIED`. Non-deployer call to `market-A.initialize` → `u1011` (market's own operator gate). Sanity: owner's market-A.initialize succeeds. |
| `simul-jing-core-multi-market.js` | [✓](https://stxer.xyz/simulations/mainnet/6b04c21d968342bb699972e0ab8f7e3e) — multi-market jing-core | Both markets registered in one jing-core. Same sBTC depositor deposits into both (100k sats each). `get-token-equity(SBTC, depositor)` = u200,000 (correct sum). `get-balance(depositor)` = `(ok u200000)`. y-side equities tracked per-token correctly. |
| `simul-jing-core-get-balance.js` | [✓](https://stxer.xyz/simulations/mainnet/c0114b413791cfd835b0c1edb4b43543) — Zest read | `get-balance(user)` ≡ `get-token-equity(SBTC_TOKEN, user)`. After deposit cycle, sBTC depositor: both reads return u100000. USDCx-only depositor: get-balance returns `(ok u0)`, USDCx equity returns u100,000,000. |
| `*-limit-updates.js` | [✓](https://stxer.xyz/simulations/mainnet/c1e38d45997123caae7e691efd92bc0c) | [✓](https://stxer.xyz/simulations/mainnet/7ac10a699712ad18cd40b8cbb9b7cff3) | `set-token-y-limit` / `set-token-x-limit` mid-cycle update the limits map (read confirms new value). All three negative gates fire: non-depositor → `u1008 NOTHING_TO_WITHDRAW`, limit = 0 → `u1017 LIMIT_REQUIRED`, settle phase → `u1002 NOT_DEPOSIT_PHASE`. |
| `*-operator-setters.js` (usdcx) | [✓](https://stxer.xyz/simulations/mainnet/fa33cac3b25f465406a8d83b870cf2c6) | n/a — same contract surface | Every operator-only setter exercised: `set-treasury`, `set-paused`, `set-operator`, `set-min-token-y-deposit`, `set-min-token-x-deposit`. Non-operator caller → `u1011 ERR_NOT_AUTHORIZED` for each. Effect-tested: `set-paused(true)` → next deposit reverts `u1010 ERR_PAUSED` (market-level, distinct from jing-core pause); `set-min-*(N)` → deposit below N reverts `u1001 DEPOSIT_TOO_SMALL`; `set-operator(new)` → old operator's set-treasury reverts `u1011`, new operator's succeeds. |
| `*-queue-full.js` (stx) | [✓](https://stxer.xyz/simulations/mainnet/6ee8116f2ee10535c14e72573f2922b1) | n/a — usdcx covers the SIP-010 path | Mirror of usdcx queue-full but tests the **native `stx-transfer?` refund path** for the bumped-out depositor. Patches `MAX_DEPOSITORS u50 → u5`. 5 fish fill, challenger w/ amount = smallest → `u1013 ERR_QUEUE_FULL`; challenger w/ amount > smallest → bumps fish[0], fish[0]'s STX balance refunded by exactly the bumped amount via native stx-transfer?. |
| `*-one-sided-cycle.js` (usdcx) | [✓](https://stxer.xyz/simulations/mainnet/a6e049bf2739f370f29dc65a854dab24) | n/a — same logic in stx | Cycle with deposits only on token-y, none on token-x. `close-deposits` fails `u1012 ERR_NOTHING_TO_SETTLE` (total-x = 0 < min-token-x). After adding the missing x-side deposit, `close-deposits` succeeds and `settle-with-refresh` clears normally. |

## Defensive gates verified by code review only (not stxer-reachable)

| Gate | Reason not reachable in stxer |
|------|-------------------------------|
| `u1006 ERR_PRICE_UNCERTAIN` | Real Pyth confidence stays well within `price / MAX_CONF_RATIO` (u50). Triggering would require fabricating a VAA with wide `conf` — clarinet is the right tool for that. |
| `u1020 ERR_EXPO_MISMATCH` (sbtc-stx only) | All Pyth feeds reachable on `pyth-storage-v4` use `expo = -8`, so `feed-x.expo == feed-y.expo` always with real VAAs. Same as above — clarinet can mock the feed-data tuple. |

Both gates are visible in the contract source and trip on the assertions
in `execute-settlement`; they're meaningful defenses that just can't be
provoked with mainnet-fork state.

## Notable findings from the runs

### Full lifecycle settlement (sbtc-usdcx)
At BTC/USD ≈ $76,464 stored on the fork:
- Oracle price recorded: `u7,646,450,000,000` (= BTC/USD × 1e8)
- sBTC binding side, 100k sats fully consumed
- 76.46 USDCx (`u76,464,500`) settled to sBTC depositor (after 10 bps fee)
- 73.54 USDCx unfilled rolled to cycle 1 (USDCx depositor)
- Treasury received `u76,464` µUSDCx + `u100` sats fees
- jing-core `get-token-equity` reflects both depositors' balances

### Full lifecycle settlement (sbtc-stx)
Cross-rate `(BTC/USD × 1e8) ÷ STX/USD` ≈ `u32,099,069,165,742`
(≈ 320,990 µSTX/sat ≈ 0.32 STX/sat):
- STX side fully consumed (binding), all 150 STX matched
- ~46,525 sats sBTC partially settled to STX depositor
- ~53,429 sats sBTC unfilled rolled to cycle 1

### Cancel flows error matrix
Each variant verifies all four contract gates:
- `u1008 ERR_NOTHING_TO_WITHDRAW` — cancel-empty
- `u1002 ERR_NOT_DEPOSIT_PHASE` ×2 — cancel during settle (both sides)
- `u1014 ERR_CANCEL_TOO_EARLY` — cancel-cycle before threshold

After `addAdvanceBlocks` of 42 stacks blocks, cancel-cycle succeeds and
rolls deposits forward to cycle 1.

### Settle-refresh freshness gate
With `MAX_STALENESS = u60` patched in:
- Plain `settle` against stored fork-pinned Pyth → `(err u1005)` ✓
- `settle-with-refresh` with VAA fetched from Hermes 30s before
  simulation submit → ok, settlement recorded

## Coverage status

All previously-listed gaps are now covered (or documented as not
stxer-reachable). Across the suite **37 sims** prove the production
scenarios end-to-end, every reachable error gate the markets and
jing-core declare, and the registry's full lifecycle (set-verified →
register → pause → unpause).

**Bugs found and fixed during this work (2026-05-07):**

1. `cancel-cycle` × small-share-filter state-overwrite. When close-deposits
   rolled small depositors from cycle C to C+1, a subsequent `cancel-cycle`
   would overwrite C+1's depositor list and totals with C's, dropping the
   already-rolled depositors from accounting. Funds remained in the deposits
   map but became invisible to settlement, and whale's later cancel-y could
   underflow totals. **Fix:** `roll-depositor-lists` now `concat`s into the
   existing C+1 list (capped at `MAX_DEPOSITORS u50`), and `cancel-cycle`
   merges totals into C+1 instead of overwriting. Regression test:
   `*-cancel-after-roll.js` (both markets). The bug was discovered via an
   AI-assisted invariant survey of the contracts before deploy — the kind
   of multi-path interaction that hand-written sims structurally miss but
   property-based fuzzing (Rendezvous, etc.) catches naturally.

### Still better in clarinet

Tight error-code matrices and pure-logic checks where each stxer run
would be a wasteful network round-trip. The clarinet unit-test suite
in `tests/` should cover:

- `u1009 ZERO_PRICE`, `u5009 OWNER_CANNOT_BE_VALIDATOR`,
  `u5010 ALREADY_VALIDATOR`, `u5011 VALIDATOR_PENDING`,
  `u5012 VALIDATOR_LIMIT_REACHED`
- `set-token-{x,y}-limit` mid-cycle (no balance, then with balance)
- `set-treasury` / `set-operator` / `set-min-{x,y}-deposit` (operator
  only, error on stranger)
- Equity ledger debit branches (require a registered vault to test
  end-to-end, but the math is testable in isolation)

### Out of scope for this README

The `vault-*` and `reserve-*` / `snpl-*` contracts in `contracts/`
have their own log-* surface on jing-core that needs separate coverage
when those contracts are sim-ready.

## Gotchas burned in

### `stx-transfer?` returning `(err u1)` from inside the contract
That's "insufficient balance" (the `tx-sender` of the contract call has
less unlocked STX than the deposit amount), **not** the contract's own
`ERR_DEPOSIT_TOO_SMALL`. Don't trust an address's `total balance` —
check `total - locked` against deposit amount + gas. Many "rich"
mainnet addresses have most STX in PoX. Original surprise:
`SPZSQNQF9...` shows 26k STX but only ~20 unlocked.

### `bitcoin_interval_secs` interacts with Pyth freshness
`addAdvanceBlocks` defaults to `bitcoin_interval_secs: 600`, so each
tenure adds 10 min to `stacks-block-time`. Two timelock advances of
144 burn blocks each = ~2 days of synthetic time, which pushes
`stacks-block-time` past the publish-time of any "fresh" Pyth VAA. The
contract's `(- stacks-block-time MAX_STALENESS)` then exceeds the VAA's
publish-time, so `settle-with-refresh` fails with `ERR_STALE_PRICE`
even though the VAA is genuinely current.

**Fix:** the timelock advances in `_setup.js#addRegistryInit` use
`bitcoin_interval_secs: 1` so synthetic blocks barely advance time
while still satisfying the 144-burn-block timelock.

### stxer 0.8.0 defaults to Clarity5 for deploys
`jing-core.clar` is Clarity 4 (declared in `Clarinet.toml`); markets are
Clarity 5. Pass `clarity_version: ClarityVersion.Clarity4` explicitly
when deploying jing-core. The `_setup.js` helper already does this.

### The cross-rate clears more value per cycle than USDCx
sbtc-stx's settlement consumes a much larger share of one side per
cycle than sbtc-usdcx for equivalent deposit sizes. The
`small-share-filter` test for STX needs to end after cycle 1 (fish
settle there) instead of mirroring USDCx's 3-cycle path. The filter
*logic* is identical between markets — only the dynamics differ.

### `MAX_STALENESS = u999999999` in production v3 markets
The freshness gate is effectively disabled in production-source sims so
stored Pyth prices on the fork (which can be minutes old) don't trip
`settle`. The `settle-refresh` sims patch the constant down to `u60` to
prove the real gate fires. Apply via `marketSourceOverride` argument
to `addRegistryInit`:

```js
let marketSource = fs.readFileSync(`./contracts/${MARKET_NAME}.clar`, "utf8");
marketSource = marketSource.replace(
  "(define-constant MAX_STALENESS u999999999)",
  "(define-constant MAX_STALENESS u60)"
);
addRegistryInit(builder, { marketName, initializeArgs, marketSourceOverride: marketSource });
```

## Result decoding cheat sheet

When parsing the V2 API response (`/devtools/v2/simulations/{id}`):

- Transaction `result` is hex Clarity bytes:
  - `0703` = `(ok true)`
  - `07 01 <16 bytes BE>` = `(ok u<value>)`
  - `08 01 <16 bytes BE>` = `(err u<value>)` — decode the trailing uint
    to match contract error codes (jing-core: 5xxx, markets: 1xxx)
- Eval results are bare Clarity bytes (no response wrapper):
  - `01 <u128>` = uint
  - `03` / `04` = true / false
  - `09` = none
  - `0a <body>` = (some body)
  - `0b <len> <items>` = list
  - `0c <len> <kv>` = tuple
- `tx['Ok']` (with `vm_error: null`, `post_condition_aborted: false`)
  means the tx didn't abort — the response value can still be
  `(err ...)`. Always decode the Clarity hex.

A reusable parser is at the bottom of every sim's run output and in
the per-sim sections above.
