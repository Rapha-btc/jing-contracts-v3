# jing-contracts-v3

The Jing protocol on Stacks: a fair-batch swap venue for sBTC pairs, plus tools that let users automate trades and borrow against their position. This repo holds the smart contracts; the file layout below is the same one you'll see in the `contracts/` folder.

## Layout

```
contracts/
├── jing-core.clar              registry, equity ledger, single event stream
├── jing-vault-auth.clar        SIP-018 hash builder for signed vault intents
│
├── markets-sbtc-stx-jing.clar       sBTC/STX market
├── markets-sbtc-usdcx-jing.clar     sBTC/USDCx market
│
├── vault-sbtc-stx.clar         per-user sBTC/STX vault
├── vault-sbtc-usdcx.clar       per-user sBTC/USDCx vault
│
├── reserve-trait.clar          interface the reserve implements
├── snpl-trait.clar             interface the per-borrower loan implements
├── reserve-sbtc-stx-jing.clar  shared sBTC reserve (lender's pool)
└── snpl-sbtc-stx-jing.clar     per-borrower swap-now-pay-later loan against sBTC
```

## What each piece does, from a user's point of view

### `jing-core`
The "post office" of the protocol. Every other contract talks to it. It tracks how much sBTC each user has parked across the whole ecosystem (in any vault, market, or loan), and it broadcasts a single event feed that wallets, dashboards, and bots all subscribe to. If you've ever wondered "where's all my sBTC right now?" — that's the question jing-core answers.

### `jing-vault-auth`
A small utility that produces the signature format used by vaults (see below). Owners sign trade intents off-chain; this contract is what turns a structured intent into the exact bytes they sign. You don't interact with it directly.

### Markets — `markets-sbtc-stx-jing` / `markets-sbtc-usdcx-jing`
A **blind-batch auction**. Instead of front-running each other on order books, depositors put their sBTC (or STX / USDCx) into a shared pool with a price they're willing to accept. After a short window, the market settles every order at the same fair price using a Pyth oracle, and everyone gets filled (or rolled to the next round) without any MEV games. One contract per pair.

### Vaults — `vault-sbtc-stx` / `vault-sbtc-usdcx`
Your **personal trading account**. You deploy one (or use a deployer service), park your sBTC and STX/USDCx in it, and sign trade conditions off-chain — *"sell 0.1 sBTC for at least 5,000 USDCx, expires in 24 hours"*. A keeper bot watches the market and executes when conditions are met. Your funds never leave your control: they only move into the official Jing market, into Bitflow's pools, or back to you. The keeper can't substitute tokens or reroute funds.

You can have any number of conditional orders open in parallel. Cancel any of them at any time; the keeper can also cancel an in-flight Jing deposit if you change your mind.

### Reserve — `reserve-sbtc-stx-jing`
A **shared sBTC lending pool**. A lender (or DAO) supplies sBTC into the reserve and sets credit limits per borrower. Borrowers don't share collateral or default risk — each borrower has their own line and their own loan contract (snpl, below). The lender earns interest; rates are set per credit-line.

### Snpl — `snpl-sbtc-stx-jing`
Stands for **"swap now, pay later"**. It's a per-borrower loan contract: the borrower draws sBTC from the reserve, deposits it into the Jing market for STX, and then has a deadline to pay back the loan (with interest) — typically using the STX they swapped into. If they don't repay by the deadline, the lender can seize whatever's left. One snpl per borrower; many borrowers can run in parallel without affecting each other.

This is useful if you have STX coming in (yield, salary, an inbound bridge) and want sBTC exposure now without buying it outright.

### `reserve-trait` / `snpl-trait`
Just type definitions — they describe the shape that any reserve / snpl must conform to. Lets the reserve and snpl talk to each other safely without knowing each other's exact code.

## How the parts fit together

```
        ┌──────────────────────────────┐
        │           jing-core          │ ← single source of truth for
        │  (registry, equity, events)  │   "who has what sBTC where"
        └──┬────────┬──────────┬───────┘
           │        │          │
   ┌───────▼──┐  ┌──▼────┐ ┌───▼────────┐
   │ markets  │  │ vault │ │ reserve +  │
   │  (per    │◄─┤ (per  │ │ snpl       │
   │   pair)  │  │ user) │ │ (lending)  │
   └────┬─────┘  └───┬───┘ └─────┬──────┘
        │            │           │
        └─ also routes ─┘        │
        ─ to Bitflow xyk ─       │
        ─ + DLMM pools ─         ▼
                          (uses the market
                           for the swap)
```

- The **market** is where actual trades clear, fairly and in batches.
- A **vault** is a user's smart-account on top: it lets the user pre-sign trade conditions and lets a keeper fire them at the market when those conditions are met. Vaults can also hit Bitflow's xyk and DLMM pools as fallback venues if the market doesn't fill.
- A **reserve + snpl** stack is for credit: the reserve is the lender's deposit, the snpl is the borrower's account. The snpl uses the same Jing market underneath to swap the borrowed sBTC into STX.
- Everything emits to **jing-core**, so a single feed of events covers all activity across all pairs and all users.

## Build

```sh
clarinet check
```

Mainnet contracts the project depends on (sBTC, USDCx, Pyth oracles, Bitflow xyk + DLMM + router) are pulled into `.cache/requirements/` automatically on first check.

## Testing

```sh
npm install
npm test                                                # all files
npx vitest run tests/jing-core.test.ts                  # registry/admin
npx vitest run tests/markets-sbtc-usdcx-jing.test.ts    # USDCx market
npx vitest run tests/markets-sbtc-stx-jing.test.ts      # sBTC/STX market
npx vitest run tests/vault-sbtc-usdcx.test.ts           # USDCx vault
npx vitest run tests/vault-sbtc-stx.test.ts             # sBTC/STX vault
npx vitest run tests/reserve-sbtc-stx-jing.test.ts      # lender reserve
npx vitest run tests/snpl-sbtc-stx-jing.test.ts         # snpl loan lifecycle
```

**Total: 149 clarinet tests across 7 files** covering `jing-core`, both markets, both personal vaults, the sBTC reserve, and the per-borrower snpl loan contract (`jing-vault-auth` is exercised indirectly by every signed-intent test).

Tests run against a clarinet simnet with `remote_data` enabled so mainnet sBTC, USDCx, Pyth, Bitflow, and wstx contracts are reachable. The Pyth `settle-with-refresh` paths fetch a fresh VAA from `hermes.pyth.network` over the public internet — no credentials needed.

### Coverage matrix (clarinet + stxer)

Every public contract in this repo is exercised by **both** local clarinet simnet tests **and** stxer mainnet-fork simulations. The two suites are intentionally redundant: clarinet catches logic bugs at the bytecode level (instant, deterministic, plus property-fuzz via Rendezvous); stxer catches integration bugs against real mainnet state (Pyth freshness, Bitflow xyk + DLMM pool depth, wstx behavior, sBTC token-supply tracker).

| Contract | Clarinet | Stxer (mainnet fork) |
|---|---|---|
| `jing-core.clar` | `tests/jing-core.test.ts` (10 tests) + exercised by every other test file | `simulations/simul-jing-core-{pause,multi-market,get-balance,hash-mismatch}.js` + exercised by every other sim |
| `markets-sbtc-stx-jing.clar` | `tests/markets-sbtc-stx-jing.test.ts` (35 tests) | `simulations/simul-markets-sbtc-stx-jing*.js` (16 sims) |
| `markets-sbtc-usdcx-jing.clar` | `tests/markets-sbtc-usdcx-jing.test.ts` (37 tests) | `simulations/simul-markets-sbtc-usdcx-jing*.js` (16 sims) |
| `vault-sbtc-usdcx.clar` | `tests/vault-sbtc-usdcx.test.ts` (20 tests) | `simulations/simul-vault-sbtc-usdcx.js` |
| `vault-sbtc-stx.clar` | `tests/vault-sbtc-stx.test.ts` (22 tests) | `simulations/simul-vault-sbtc-stx.js` |
| `reserve-sbtc-stx-jing.clar` | `tests/reserve-sbtc-stx-jing.test.ts` (14 tests) | `simulations/simul-reserve-sbtc-stx-jing.js` |
| `snpl-sbtc-stx-jing.clar` | `tests/snpl-sbtc-stx-jing.test.ts` (11 tests) | `simulations/simul-snpl-sbtc-stx-jing.js` |
| `jing-vault-auth.clar` | exercised by every vault signed-intent test | exercised by every vault sim |
| `reserve-trait.clar` / `snpl-trait.clar` | type-only — implemented by `reserve-sbtc-stx-jing` / `snpl-sbtc-stx-jing` | same |

**Stxer sim runs (mainnet fork):**

```sh
npx tsx simulations/simul-vault-sbtc-usdcx.js
npx tsx simulations/simul-vault-sbtc-stx.js
npx tsx simulations/simul-reserve-sbtc-stx-jing.js
npx tsx simulations/simul-snpl-sbtc-stx-jing.js
# ...plus the existing simul-jing-core-*.js and simul-markets-*.js suites
```

Verified runs of the four custody-contract sims:

- `simul-vault-sbtc-usdcx.js` → https://stxer.xyz/simulations/mainnet/51c6ebac890b7491880ebc9215a98f3c
- `simul-vault-sbtc-stx.js` → https://stxer.xyz/simulations/mainnet/d6ca84de76708ea7134d97ee7a6b1ddb
- `simul-vault-sbtc-stx-price-gates.js` → https://stxer.xyz/simulations/mainnet/6667c9fd3300747777a5a036f677caa9
- `simul-vault-sbtc-stx-full-cycle.js` → https://stxer.xyz/simulations/mainnet/7884ac56836d1a3d3dc993ea43732ea4
- `simul-reserve-sbtc-stx-jing.js` → https://stxer.xyz/simulations/mainnet/67d621b36f912de9da8c4f9dd0999a61
- `simul-snpl-sbtc-stx-jing.js` → https://stxer.xyz/simulations/mainnet/eac28e69336bb430d063a351e2b3a1f3

For SIP-018 vault sims, intent message hashes are computed off-chain in `simulations/_setup.js` (`buildIntentHashHex`) to byte-match Clarity's `to-consensus-buff?`, then signed locally with a deterministic test private key (`signMessageHashRsv` from `@stacks/transactions`). The corresponding compressed pubkey is installed via `set-owner-pubkey` so the simulated vault verifies the test signature. See `_setup.js` for two infra footnotes worth knowing if you write more sim code: `serializeCV()` returns a hex **string** in v7 (parse via `Buffer.from(hex, "hex")`, not `Buffer.from(string)`), and Clarity tuple keys serialize in canonical (alphabetic) order.

### Rendezvous (RV) property fuzzing

```sh
bash tests/rv/build.sh                                                    # rebuild .clar with mocks
npx rv . markets-sbtc-usdcx-jing invariant --runs=500 --bail              # fuzz USDCx market
npx rv . markets-sbtc-stx-jing   invariant --runs=500 --bail              # fuzz STX market
```

13 invariants per market — list/totals consistency, no-ghosts, bounded lists, cleared-≤-deposited at settle, and `invariant-balance-eq-cycle-totals` (compares actual contract token balance to the sum of `cycle-totals` across cycles 0..199, the one that catches state-corruption bugs like the cancel-cycle × small-share-roll bug above). Both markets pass 500-run sweeps clean. See `tests/rv/README.md` for harness details, the build pipeline, and how the bug was empirically caught by reverting the fix in `.build/`.

### File map

| File | Surface | Tests |
|---|---|---|
| `tests/jing-core.test.ts` | Registry + admin paths reachable directly on `jing-core` (not via a market). | 10 |
| `tests/markets-sbtc-usdcx-jing.test.ts` | sBTC/USDCx market (single-feed, BTC/USD). | 37 |
| `tests/markets-sbtc-stx-jing.test.ts` | sBTC/STX market (dual-feed, BTC/USD + STX/USD; STX side via the bitflow `token-stx-v-1-2` wstx facade with native `stx-transfer?` underneath). | 35 |
| `tests/vault-sbtc-usdcx.test.ts` | Personal vault for the sBTC/USDCx market: SIP-018 signed intents (jing-deposit, dlmm-swap), owner deposits/withdrawals, keeper cancels, equity ledger. | 20 |
| `tests/vault-sbtc-stx.test.ts` | Personal vault for the sBTC/STX market: same shape as USDCx vault plus `execute-bitflow-swap` (xyk-core path); native STX deposits/withdrawals via `stx-transfer?`. | 22 |
| `tests/reserve-sbtc-stx-jing.test.ts` | sBTC funding reserve: lender supply/withdraw, credit-line CRUD, paused, min-sbtc-draw, draw + notify-return (snpl-gated paths). | 14 |
| `tests/snpl-sbtc-stx-jing.test.ts` | Per-borrower swap-now-pay-later loan lifecycle: initialize, set-reserve, borrow, swap-deposit, cancel-swap, set-swap-limit, repay, seize. Past-deadline tests use `simnet.deployContract` with `CLAWBACK-DELAY u10` (vs production `u4200`). | 11 |

Each file is **parity with the matching stxer simulations** in `simulations/`, with the trade-off that clarinet runs locally and instantly while stxer hits a live mainnet fork. The two suites are intentionally redundant: simnet catches logic bugs at the bytecode level, stxer catches integration bugs against real mainnet state (Pyth freshness, Bitflow pool depth, wstx behavior).

### What's covered

- **Registry handshake** — owner-only `set-verified-contract` + market self-registration via `register`. Failure modes for `NOT_VERIFIED` (5005), `INVALID_CONTRACT_HASH` (5002), and `HASH_MISMATCH` (5006). The 5006 test deploys a runtime-patched market via `simnet.deployContract` so its bytecode hash differs from the verified one.
- **Pause / unpause** — owner-only, entry-side `log-*` reverts with 5016, exit-side stays open while paused, `unpause` requires `TIMELOCK_BURN_BLOCKS` to elapse since the most recent `pause`, re-pausing restarts the timer.
- **Equity ledger** — `get-balance` matches `(get-token-equity sbtc-token user)`; equity aggregates correctly when the same depositor uses both markets; `get-total-token-equity` is per-token.
- **Per-market lifecycle** — `initialize` with the correct args, double-init blocked, non-operator rejected; deposit / cancel / set-limit happy paths and error gates (below-min, zero-limit, wrong-trait); close-deposits phase guard, double-close, only-one-side rejected; `cancel-cycle` timing gate (CANCEL_THRESHOLD = 42 stacks blocks) + cycle rollforward.
- **Settlement math** — clearing == oracle (no premium in v3), fee math (FEE_BPS = 10), token-x-binding vs token-y-binding branches with rollforward assertions, dust sweep, multi-cycle.
- **Distribution + rolls** — pro-rata sBTC payouts, multiple depositors per side, limit-order rolls (clearing > limit on y-side, clearing < limit on x-side), small-share-roll filter (<0.2% of pool gets rolled forward).
- **Atomic taker swap** — the `swap` function bundles deposit + close + settle-with-refresh in a single tx; both `deposit-x = true` and `deposit-x = false` paths.
- **Admin operators** — `set-treasury`, `set-paused`, `set-operator`, `set-min-token-x/y-deposit` with auth and effect checks.
- **Same depositor on both sides** — one principal in both depositor lists with separate per-side entries; settles cleanly.
- **Treasury fees verification** — actual treasury balance delta after settle equals the fee fields in the settlement tuple. USDCx market does both legs as FT balances; STX market checks sBTC FT delta + native STX balance via `stx-get-balance`.
- **Live Pyth VAA** — `settle-with-refresh` and `close-and-settle-with-refresh` exercised end-to-end against a fresh Hermes VAA.
- **Queue-full + smallest-bumping** — runtime-patched market with `MAX_DEPOSITORS u5` (vs production `u50`). Fish queue saturated, challenger with equal amount rejected (1013), challenger with bigger amount bumps the smallest, refund balance delta verified.
- **Vault SIP-018 signed intents** — every public function on both vaults (`initialize`, `set-owner-pubkey`, `set-keeper`, `deposit-*`, `withdraw-*`, `revoke-intent`, `cancel-jing-*`, `execute-jing-deposit`, `execute-bitflow-swap`, `execute-dlmm-swap`) plus all 8 vault error codes. Signatures generated locally via `@stacks/transactions.signMessageHashRsv` against the deployer's simnet private key; pubkey installed via `set-owner-pubkey`; message hashes computed by calling `jing-vault-auth.build-intent-hash` read-only. Failure modes: `INVALID_SIGNATURE` (wrong key), `REPLAY` (re-submit same intent), `EXPIRED` (past block height), `INVALID_SIDE` (bad side string), `INVALID_PRICE` (zero limit-price on the side where it's in the divisor — verifies the assert-before-let fix).
- **Vault → jing-core integration** — every vault-side `log-*` (`log-deposit`, `log-withdraw`, `log-revoke`, `log-cancel`, `log-jing-deposit`, `log-bitflow-swap`) is exercised. Vault's equity bucket on jing-core matches its on-chain balance through the full deposit/withdraw/cancel/swap lifecycle.
- **Reserve admin + credit lines** — lender-only `supply`, `withdraw-sbtc`, `withdraw-stx`, `set-paused`, `set-min-sbtc-draw`. Credit-line CRUD: `open-credit-line` rejects mismatched borrower (210), duplicates (205); `set-credit-line-cap` / `set-credit-line-interest` / `close-credit-line` reject missing lines (206); `close-credit-line` rejects non-zero outstanding (207).
- **Reserve `draw` + `notify-return`** — snpl-gated paths reachable via `snpl.borrow` / `snpl.repay`: ERR-NO-CREDIT-LINE (201), ERR-INVALID-AMOUNT below min-sbtc-draw (204), ERR-OVER-LIMIT above cap (202), ERR-PAUSED (209), happy lifecycle bumps then drains `outstanding-sbtc` precisely. All 9 reserve-side `log-reserve-*` events on jing-core are exercised.
- **SNPL loan lifecycle** — full `initialize → borrow → swap-deposit → cancel-swap → repay` happy path; status transitions (OPEN → REPAID, OPEN → SEIZED) verified on the loan record. Error gates: `borrow` ERR-INTEREST-MISMATCH (109), ERR-ACTIVE-LOAN-EXISTS (104); `swap-deposit` / `set-swap-limit` ERR-LOAN-NOT-FOUND (105), ERR-BAD-STATUS (106), ERR-PAST-DEADLINE (110); `repay` ERR-NOT-FULLY-RESOLVED (107) when sBTC is still locked in the market; `seize` ERR-DEADLINE-NOT-REACHED (108) pre-clawback. Past-deadline branches use a runtime-patched snpl with `CLAWBACK-DELAY u10` (vs production u4200) to avoid pushing simnet past the mainnet head.
- **SNPL → jing-core integration** — every snpl-side `log-snpl-*` (`log-snpl-set-reserve`, `log-snpl-borrow`, `log-snpl-swap-deposit`, `log-snpl-cancel-swap`, `log-snpl-set-swap-limit`, `log-snpl-repay`, `log-snpl-seize`) is exercised end-to-end.

### Bugs found and fixed via clarinet + fuzz testing

| # | Bug | Found by | Fix commit |
|---|---|---|---|
| 1 | `cancel-cycle` overwrote `cycle-totals[C+1]` and the C+1 depositor list — wiping any depositors that `close-deposits` had already moved forward via small-share-filter. Pre-fix: fish-funds locked or whale-funds locked depending on cancel order. | Property-based invariant survey of contracts before deploy | `roll-depositor-lists` and `cancel-cycle` totals merge instead of overwrite — `b693796`. Stxer regression sim added per market — `b00693c`. RV harness with `invariant-balance-eq-cycle-totals` set up to catch this class in future runs — `cd10324`, `4ff5170`. |
| 2 | `execute-{bitflow,dlmm}-swap` panicked with `Runtime(DivisionByZero)` instead of returning `ERR_INVALID_PRICE` when `limit-price=0` on the side where `limit-price` is in the divisor (`wstx` for `vault-sbtc-stx`, `usdcx-token` for `vault-sbtc-usdcx`). The `let` binding evaluated `min-out` before the assert. | Clarinet vault test (`tests/vault-sbtc-stx.test.ts`) | hoist asserts before the let — `ca9793d` |
| 3 | 6 `log-*` functions in `jing-core` had `(asserts! true ERR_NOT_AUTHORIZED)` — a literal no-op. Comment claimed "auth enforced transitively by parent log-close-deposits / log-settlement assert in same tx" — unsound in Clarity, where every public function is independently authenticated. `log-distribute-{x,y}-depositor` (lines 672, 696) were **state-changing**: any caller could (a) drain a victim's equity to 0 via `debit`, or (b) inflate a registered contract's equity arbitrarily via `credit-if-registered`. `log-small-share-roll-{x,y}` and `log-limit-roll-{x,y}` (lines 566, 582, 600, 619) were print-only — fake-event spoofing that misleads indexers. | Rendezvous fuzz of `jing-core` (300 runs, 169 unauthorized state mutations from random wallet senders before the fix) | replace all 6 with `(asserts! (is-registered contract-caller) ERR_NOT_AUTHORIZED)` — `4b50e5b`. Verified by re-running RV: same 4 functions = 0 successful, all calls return `(err u5001)` and count as IGNORED — `7badf5e`. |

### External agentic peer review (aibtc bounty)

Ahead of formal audit, this suite was posted as a public bounty on [aibtc.com/bounties](https://aibtc.com/bounties) — inviting AI agents to clone the repo and stress-test it (clarinet, stxer mainnet-fork sims, Rendezvous fuzz, manual review). Four agents submitted. Every reported finding was verified against source and dispositioned:

| Finding | Reporter(s) | Severity | Disposition | Ref |
|---|---|---|---|---|
| SNPL `repay`/`seize` checked **only the current cycle** via `our-sbtc-in-jing`, so a sub-`MIN_SHARE_BPS` deposit that `close-deposits` rolls to **C+1** read as zero — letting a loan close and clear the reserve's `outstanding-sbtc` via `notify-return` while the principal was still parked in the market (theft / under-collateralization). | **tinyopsstudio** (first, Vitest PoC + stxer sim); Mayjor01 (J-01, later) | **High** | **Fixed** — new `fully-resolved` helper checks cycle C **and** C+1 before closure. | `5215e19` |
| SNPL token-y (wstx) equity is credited at settlement (`credit-if-registered`, since the snpl is registered) but never debited at loan close → `total-token-equity(token-y)` drifts upward each loan. | BenItBuhner (JING-01) | Cosmetic | **Fixed** — `log-snpl-repay`/`log-snpl-seize` take `token-y` and `debit` it (debit floors → no underflow); jing-core stays token-agnostic, the snpl passes its `WSTX`. No on-chain consumer reads token-y equity (booster is sBTC-side); keeps the ledger honest for indexers. | `9e1e936` |
| Single-step `set-contract-owner` — a typo'd/unreachable address could permanently brick admin. | Turbo Ivo (L-01) | Low | **Fixed** — replaced with two-step `propose-owner` / `accept-owner` (nominee must accept; cancel by proposing `none`). | `629aecd` |
| `unpause` emitted an `"unpaused"` event even when the contract was never paused. | Turbo Ivo (I-01) | Informational | **Fixed** — asserts `(var-get paused)` (`ERR_NOT_PAUSED`) before resuming. | `629aecd` |
| `roll-and-sweep-dust` sweeps integer-division remainder to treasury. | Mayjor01 (J-02) | — | **By design** — bounded sub-unit rounding dust; sweeping it to treasury is intentional. | — |
| `build-intent-hash` binds `vault: contract-caller`, so an off-chain client that hashes with the wrong caller mismatches the on-chain hash (`u6002`). | Mayjor01 (J-03) | — | **Not a contract bug** — on-chain the vault is always the caller, so the hash is deterministic; a client just hashes with the real vault principal. (Our own `buildIntentHash` test helper had the same slip — fixed to compute the hash via `serializeCV` with the vault principal.) | (test) |
| Permissionless `close-deposits` can lock ordinary exits while a market is paused. | BenItBuhner (JING-02) | Low | **Non-issue** — the deposit rolls to C+1 (deposit phase) and is recoverable via `cancel-swap` / permissionless `cancel-cycle`; a one-cycle delay, no trapped funds. | — |
| Single-step owner could be set to the burn principal (no zero-address check). | (RV invariant note) | Low | **Mitigated by the two-step transfer above** — the burn principal can never `accept-owner`. | `629aecd` |

**Winner:** tinyopsstudio — first to report the High-severity cycle bug with reproducible evidence (passing Vitest PoC + stxer lifecycle sim). Independently corroborated by Mayjor01. Paid 1,000 sats sBTC.

Two robustness ideas were raised but **not** adopted, with reasons: (a) a market-side `cancel-token-x-deposit-for-cycle` — redundant, `cancel-cycle` already provides per-cycle recovery; (b) reserve `notify-return` crediting only the observed balance delta — the `notional`-vs-value gap is intended lender price risk on a single-borrower credit line, not an accounting bug. Findings were independently verified against `master` source before each disposition.

### Known wrinkles

- **`singleFork: true`** in `vitest.config.ts` means all test files share one simnet process. The clarinet-sdk has a known "Clarity VM failed to track token supply" bug that fires on subsequent reads of any SIP-010 supply call after an sBTC settlement. Each test that hits this path wraps `fundSbtc` / `settle` with try-then-skip — the test prints `[v3-...] X: skipped — VM bug` and returns OK. **Each file passes 100% in isolation;** running all files together via `npm test` may skip a handful of late-running tests when state pollution from earlier files trips the bug.
- **Hiro rate limits.** Back-to-back `npx vitest run` invocations can hit `Per-minute rate limit exceeded for stacks quota`. Wait ~60 s between runs or run a single file.
- **`creator-escrow.test.ts`** has pre-existing `IncorrectArgumentCount` failures unrelated to the v3 markets work.

### Coverage parity with stxer

| Stxer sim | Clarinet equivalent | Notes |
|---|---|---|
| `simul-jing-core-pause.js` | `jing-core.test.ts` → pause/unpause + exit-side gating | |
| `simul-jing-core-multi-market.js` | `jing-core.test.ts` → multi-market equity | |
| `simul-jing-core-get-balance.js` | `jing-core.test.ts` → get-balance ↔ get-token-equity | |
| `simul-jing-core-hash-mismatch.js` | `markets-sbtc-usdcx-jing.test.ts` → register hash-mismatch | runtime `simnet.deployContract` |
| `simul-markets-{usdcx,stx}-jing*.js` (full + dust + binding) | `markets-sbtc-{usdcx,stx}-jing.test.ts` | |
| `simul-markets-*-cancel-flows.js` | close-deposits + cancel-cycle tests | |
| `simul-markets-*-close-and-settle.js` | close-and-settle-with-refresh tests | |
| `simul-markets-*-deposit-gates.js` | rejects-below-min / zero-limit / wrong-trait tests | |
| `simul-markets-*-limit-rolls.js` | token-y / token-x limit-roll tests | |
| `simul-markets-*-limit-updates.js` | set-token-y/x-limit tests | |
| `simul-markets-*-one-sided-cycle.js` | "close-deposits fails with only one side" | |
| `simul-markets-*-operator-setters.js` | "admin: pause, operator, treasury, min deposits" | |
| `simul-markets-*-queue-full.js` | USDCx queue-full test | runtime `MAX_DEPOSITORS` patch |
| `simul-markets-*-same-depositor.js` | same-depositor-on-both-sides test | |
| `simul-markets-*-settle-refresh.js` | settle-with-refresh test | |
| `simul-markets-*-small-share-filter.js` | small-share filtering tests | |
| `simul-markets-*-swap*.js` | atomic swap (deposit-x=true/false) tests | |
| `simul-markets-*-treasury-fees.js` | treasury-fees verification test | balance delta vs settlement tuple |
| `simul-vault-sbtc-usdcx.js` | `tests/vault-sbtc-usdcx.test.ts` (full surface) | SIP-018 hash computed off-chain via `buildIntentHashHex` in `_setup.js` |
| `simul-vault-sbtc-stx.js` | `tests/vault-sbtc-stx.test.ts` (full surface, incl. `execute-bitflow-swap`) | same |
| `simul-reserve-sbtc-stx-jing.js` | `tests/reserve-sbtc-stx-jing.test.ts` (full lender surface) | |
| `simul-snpl-sbtc-stx-jing.js` | `tests/snpl-sbtc-stx-jing.test.ts` (full borrower surface) | |

The only stxer-only path is the STX-market token-y queue-full bumping (native `stx-transfer?` refund vs USDCx's FT path). The bumping branch is structurally identical between sides, so the USDCx queue-full test exercises the logic; only the refund leg differs. Add a clarinet mirror if you want native-STX coverage too.

The STX vault's `execute-bitflow-swap` step in `simul-vault-sbtc-stx.js` returns `(err u1002)` against the real xyk-core sBTC/STX pool — that's a runtime pool-state issue at the simulated block, not a contract bug. The `execute-dlmm-swap` step right after returns a clean `(ok msg-hash)`, proving the SIP-018 verify path itself works. Same `execute-bitflow-swap` path is also covered green in clarinet (`tests/vault-sbtc-stx.test.ts > execute-bitflow-swap (sBTC → STX via xyk-core)`).

## Status

Pre-mainnet. One known wrinkle:

- `clarinet check` auto-generates a simnet deploy plan that can put the vaults *before* the markets they reference, which trips a "use of unresolved contract" error. If you hit that, open `deployments/default.simnet-plan.yaml` and move the `markets-*-jing` entries above the `vault-*` entries. Pure tooling quirk — the contracts themselves compile fine.
