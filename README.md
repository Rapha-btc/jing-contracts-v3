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
```

**Total: 124 clarinet tests across 5 files** covering `jing-core`, both markets, and both personal vaults (`jing-vault-auth` is exercised indirectly by every signed-intent test).

Tests run against a clarinet simnet with `remote_data` enabled so mainnet sBTC, USDCx, Pyth, Bitflow, and wstx contracts are reachable. The Pyth `settle-with-refresh` paths fetch a fresh VAA from `hermes.pyth.network` over the public internet — no credentials needed.

### File map

| File | Surface | Tests |
|---|---|---|
| `tests/jing-core.test.ts` | Registry + admin paths reachable directly on `jing-core` (not via a market). | 10 |
| `tests/markets-sbtc-usdcx-jing.test.ts` | sBTC/USDCx market (single-feed, BTC/USD). | 37 |
| `tests/markets-sbtc-stx-jing.test.ts` | sBTC/STX market (dual-feed, BTC/USD + STX/USD; STX side via the bitflow `token-stx-v-1-2` wstx facade with native `stx-transfer?` underneath). | 35 |
| `tests/vault-sbtc-usdcx.test.ts` | Personal vault for the sBTC/USDCx market: SIP-018 signed intents (jing-deposit, dlmm-swap), owner deposits/withdrawals, keeper cancels, equity ledger. | 20 |
| `tests/vault-sbtc-stx.test.ts` | Personal vault for the sBTC/STX market: same shape as USDCx vault plus `execute-bitflow-swap` (xyk-core path); native STX deposits/withdrawals via `stx-transfer?`. | 22 |

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

### Bugs found and fixed via clarinet + fuzz testing

| # | Bug | Found by | Fix commit |
|---|---|---|---|
| 1 | `cancel-cycle` overwrote `cycle-totals[C+1]` and the C+1 depositor list — wiping any depositors that `close-deposits` had already moved forward via small-share-filter. Pre-fix: fish-funds locked or whale-funds locked depending on cancel order. | Rendezvous fuzz | merge instead of overwrite |
| 2 | `execute-{bitflow,dlmm}-swap` panicked with `Runtime(DivisionByZero)` instead of returning `ERR_INVALID_PRICE` when `limit-price=0` on the side where `limit-price` is in the divisor (`wstx` for `vault-sbtc-stx`, `usdcx-token` for `vault-sbtc-usdcx`). The `let` binding evaluated `min-out` before the assert. | Clarinet vault test (`tests/vault-sbtc-stx.test.ts`) | hoist asserts before the let — `ca9793d` |

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

The only stxer-only path is the STX-market token-y queue-full bumping (native `stx-transfer?` refund vs USDCx's FT path). The bumping branch is structurally identical between sides, so the USDCx queue-full test exercises the logic; only the refund leg differs. Add a clarinet mirror if you want native-STX coverage too.

## Status

Pre-mainnet. One known wrinkle:

- `clarinet check` auto-generates a simnet deploy plan that can put the vaults *before* the markets they reference, which trips a "use of unresolved contract" error. If you hit that, open `deployments/default.simnet-plan.yaml` and move the `markets-*-jing` entries above the `vault-*` entries. Pure tooling quirk — the contracts themselves compile fine.
