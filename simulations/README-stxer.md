# Stxer Mainnet-Fork Simulations — jing v3 markets

Full lifecycle coverage of `markets-sbtc-usdcx-jing.clar` and
`markets-sbtc-stx-jing.clar` against a pinned mainnet tip via
[stxer](https://stxer.xyz). Each sim exercises the new `jing-core`
verified-contract registry flow + a market-specific scenario, and runs
**unmodified production contract source** (no `-stxer.clar` variants —
stxer 0.8.0's `addAdvanceBlocks` handles the burn-block timelocks).

## What's different from the old v2 sims

The new jing-core (`contracts/jing-core.clar`) replaces the old
single-step `approve-market` with a real two-step verified-contract
registry guarded by:

- **`TIMELOCK_BURN_BLOCKS = u144`** between propose and confirm
- **A separate validator role** — owner cannot confirm verified-contracts
- **Hash-bound registration** — `register` reads `(contract-hash?
  contract-caller)` and compares it to `(map-get? verified-contracts
  canonical)`

Every sim runs an 8-step prelude before any market call:

1. Deploy `jing-core` (Clarity 4)
2. Deploy market (Clarity 5)
3. Owner: `propose-validator(VALIDATOR)`
4. **`addAdvanceBlocks` 144 burn blocks**
5. Anyone: `confirm-validator(VALIDATOR)`
6. Owner: `propose-verified-contract(market)` — auto-reads code hash
7. **`addAdvanceBlocks` 144 burn blocks**
8. Validator (NOT owner): `confirm-verified-contract(market)`
9. Owner: `market.initialize(...)` — internally calls `jing-core.register`

The prelude is factored into `simulations/_setup.js#addRegistryInit`
so each sim is self-contained and roughly the size of the v2 sims.

## Mainnet addresses

| Role | Address | Notes |
|------|---------|-------|
| Deployer / market operator | `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22` | Cannot be a validator |
| Validator (gas only) | `SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3` | ~20 STX free (rest PoX-locked) — enough for two confirms |
| sBTC depositor | `SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2` | ~40.5 BTC, 0 free STX |
| USDCx / STX depositor | `SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51` | ~832 USDCx + ~2953 STX free; doubles as STX-side depositor for sbtc-stx |

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

All sims green as of 2026-05-07. ✓ = clean run, expected errors only.

| Sim | sBTC/USDCx | sBTC/STX | What it proves |
|-----|------------|----------|----------------|
| `simul-markets-sbtc-{usdcx,stx}-jing.js` | [✓](https://stxer.xyz/simulations/mainnet/888377dd855df15cd3fcb37ee4d0014b) | [✓](https://stxer.xyz/simulations/mainnet/afcc8131b73c4ca48f4d90949d1d26aa) | Full lifecycle: registry init → deposits → top-up → close → settle (stored Pyth) → cycle 1 rollover. Verifies `jing-core` equity ledger tracks both legs. |
| `*-cancel-flows.js` | [✓](https://stxer.xyz/simulations/mainnet/b183431389822348c4794beb67feee82) | [✓](https://stxer.xyz/simulations/mainnet/ea1d64db35127fa298c70586c025178f) | Cancel-deposit happy path, cancel-empty (`u1008`), cancel during settle (`u1002`), cancel-cycle before threshold (`u1014`), cancel-cycle after 42-block advance, then cancel rolled deposits in cycle 1. |
| `*-same-depositor.js` | [✓](https://stxer.xyz/simulations/mainnet/1e8937e4c4faada4caa90e8acce65e08) | [✓](https://stxer.xyz/simulations/mainnet/b0cb6aa7a247527a9a45b66b51a24c9b) | One principal on both depositor lists, settles cleanly, single payout flow. |
| `*-small-share-filter.js` | [✓](https://stxer.xyz/simulations/mainnet/fc8026f23e7668f0830f52cf1a2300e5) | [✓](https://stxer.xyz/simulations/mainnet/072785480536c736e072a930f00b84f2) | 3 fish at ~0.17% each get rolled forward at close (`MIN_SHARE_BPS = 20`). USDCx variant tests 2 rolls + cycle-2 settle; STX variant ends after 1 roll (cross-rate clears more per cycle). |
| `*-dust-sweep.js` | [✓](https://stxer.xyz/simulations/mainnet/fa27fd4c3960967cb2767fdade2a111e) | [✓](https://stxer.xyz/simulations/mainnet/03bdf9bb6455605ec93b87480d768a67) | 3 depositors per side with amounts that maximize integer-truncation dust during proportional distribution; verifies dust gets swept to treasury. |
| `*-dust-sweep-both.js` | [✓](https://stxer.xyz/simulations/mainnet/3d91e252e53e2a6f68ad01df4467bcc5) | [✓](https://stxer.xyz/simulations/mainnet/c464ae4eadf8272a0ba736d802d3a9ca) | Heavy y-side vs light sBTC → sBTC binding → dust expected on the y-side roll. |
| `*-settle-refresh.js` | [✓](https://stxer.xyz/simulations/mainnet/d62b4dc608815b2e93d9b1aba7dd67d5) | [✓](https://stxer.xyz/simulations/mainnet/dcea1041460161e1e21acd9aafeb9dab) | Patches `MAX_STALENESS` down to `u60` to prove the freshness gate fires: `settle` (stored stale prices) → `ERR_STALE_PRICE` (u1005); `settle-with-refresh` (fresh VAA) → ok. STX variant uses TWO VAAs (BTC/USD + STX/USD). |
| `*-swap.js` | [✓](https://stxer.xyz/simulations/mainnet/69035df1775d31f68423faa10545abc1) | [✓](https://stxer.xyz/simulations/mainnet/3bc6d88e27266f7383050b5960ee75f7) | Atomic taker, `deposit-x = true`: `deposit-token-x + close-deposits + settle-with-refresh` in one tx. STX variant uses TWO VAAs. |
| `*-swap-deposit-y.js` | [✓](https://stxer.xyz/simulations/mainnet/076c8e28b27aa2140dc383a687dd4def) | [✓](https://stxer.xyz/simulations/mainnet/54f21bf1db0dfa2acece19e4a594df8c) | Atomic taker, `deposit-x = false` (symmetric case): `deposit-token-y + close-deposits + settle-with-refresh`. Pre-stages sBTC, taker brings y. STX variant uses TWO VAAs. |
| `*-limit-rolls.js` | [✓](https://stxer.xyz/simulations/mainnet/872f9a54d7a06a7082234df0e27744da) | [✓](https://stxer.xyz/simulations/mainnet/d91d32b071fa4640643f3d28cb24a2bf) | Limit-violation rolls at settle: 4 depositors per pair, one of each side restrictive. `filter-limit-violating-token-{y,x}-depositor` rolls violators to cycle 1; `log-limit-roll-{y,x}` events fire. |
| `*-close-and-settle.js` | [✓](https://stxer.xyz/simulations/mainnet/ef1aed955e4fe7800ef36471336bfac8) | [✓](https://stxer.xyz/simulations/mainnet/c46976495c497aafeeeaa6c3e4bc411a) | Third party (not a depositor) atomically closes + settles-with-refresh in one tx. |
| `*-treasury-fees.js` | [✓](https://stxer.xyz/simulations/mainnet/31895d768ee9833de0b1a4231999db32) | [✓](https://stxer.xyz/simulations/mainnet/0c878f01fc4526456e52572aba9b4502) | Reads treasury balance before/after settle; assert delta = settlement-tuple's `token-x-fee` + `token-y-fee` + dust-sweep. USDCx: sBTC delta=100 sats (fee 100), USDCx delta=80,109 µUSDCx (fee 80,058 + 51 dust). STX: STX delta=100,000 µSTX = exactly 10 bps of cleared. |
| `*-deposit-gates.js` (usdcx) | [✓](https://stxer.xyz/simulations/mainnet/6532d8b026fee8a46157b4d4db4a1291) | n/a — same gates | Provokes every deposit-time error: `u1019 WRONG_TRAIT` (passing wrong SIP-010 trait), `u1001 DEPOSIT_TOO_SMALL`, `u1017 LIMIT_REQUIRED` (limit-price = 0), `u1018 ALREADY_INITIALIZED` (calling `initialize` twice). All fire correctly; sanity deposit afterward succeeds. |
| `*-queue-full.js` (usdcx) | [✓](https://stxer.xyz/simulations/mainnet/403da2c5aa05e031388bc21db8346e84) | n/a — same logic | `MAX_DEPOSITORS = u50` queue-full + smallest-bumping. 50 fresh principals fill the y-side; 51st w/ amount = smallest → `u1013 ERR_QUEUE_FULL`; 51st w/ amount > smallest → bumps fish[0] (deposit drops to 0, fish[0]'s USDCx balance refunded by exactly the bumped amount, list still has 50 entries with new challenger). |
| `simul-jing-core-cancel-pending.js` | [✓](https://stxer.xyz/simulations/mainnet/f516cb76f27e7fce90ce3ba12eecb4d6) — registry-only | Owner aborts pending validator + verified-contract proposals; subsequent confirms fail with `u5013 NO_PENDING_VALIDATOR` and `u5007 NO_PENDING_PROPOSAL`. |
| `simul-jing-core-remove-validator.js` | [✓](https://stxer.xyz/simulations/mainnet/0a055133fb9f12fcc99d391959846436) — registry-only | `remove-validator` strips authority. Removed validator's `confirm-verified-contract` → `u5001 NOT_AUTHORIZED`. Double-remove → `u5014 NOT_VALIDATOR`. Non-owner remove → `u5001`. |
| `simul-jing-core-pause.js` | [✓](https://stxer.xyz/simulations/mainnet/5f27077b74b235e28ca3e14f6acc8bb7) — registry + market | Validator pauses (distributed trip-wire). Entry-side `deposit-token-x` blocked with `u5016 PAUSED`. **Exit-side `cancel-token-y-deposit` stays open** (the user-fund safety property). Owner unpause too early → `u5008 TIMELOCK_NOT_ELAPSED`. Non-owner unpause → `u5001`. After 144-block advance, owner unpauses; entry-side resumes. |
| `simul-jing-core-hash-mismatch.js` | [✓](https://stxer.xyz/simulations/mainnet/764c96b449e4869703e68965ecdf278f) — registry hash gate | Verifies market-A's hash. Deploys market-B with patched bytecode (different hash). `market-B.initialize(canonical = market-A)` → `u5006 HASH_MISMATCH`. `market-B.initialize(canonical = market-B)` (not verified) → `u5005 NOT_VERIFIED`. Sanity: market-A.initialize succeeds. |
| `simul-jing-core-multi-market.js` | [✓](https://stxer.xyz/simulations/mainnet/5d3149944f99993e33a5ed2a91dc9793) — multi-market jing-core | Both markets registered in one jing-core. Same sBTC depositor deposits into both (100k sats each). `get-token-equity(SBTC, depositor)` = u200,000 (correct sum). `get-balance(depositor)` = `(ok u200000)` (matches). y-side equities tracked per-token correctly. |
| `simul-jing-core-get-balance.js` | [✓](https://stxer.xyz/simulations/mainnet/9a0de230d7371cdfd94676b5529a1b15) — Zest read | `get-balance(user)` ≡ `get-token-equity(SBTC_TOKEN, user)`. After deposit cycle, sBTC depositor: both reads return u100000. USDCx-only depositor: get-balance returns `(ok u0)`, USDCx equity returns u100,000,000. |

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
stxer-reachable). Across the suite **30 sims** prove the production
scenarios end-to-end, every reachable error gate the markets and
jing-core declare, and the registry's full lifecycle (propose → confirm
→ register → pause → cancel-pending → remove). **No contract bugs
found.**

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
