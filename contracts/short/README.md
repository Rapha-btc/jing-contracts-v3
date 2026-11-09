# STX short protocol (borrow-to-short on Jing)

Short STX: borrow STX from a lender pool, sell it for USDCx on Jing, buy it back later. The user decides **when** to exit; the protocol standardizes **how** (FAST / SMOOTH, deterministic rails). No performance fee.

Status: design + implementation + unit tests + stxer harness. **Not deployed, not committed.**

## Contracts

| Contract | File | Role |
|---|---|---|
| `stx-short-pool` | `stx-short-pool.clar` | STX lender pool: shares, utilization + absolute caps, USDCx interest index, loss absorption |
| `stx-short-vault` | `stx-short-vault.clar` | Positions map, state machine, open / step / close / extend / add-collateral / liquidate, Jing execution |
| `stx-short-rate-model` | `stx-short-rate-model.clar` | Read-only rate curve: hard-to-borrow tier on utilization + leverage premium, floor/cap |
| `stx-short-oracle-trait` | `stx-short-oracle-trait.clar` | `get-price (buff 8192) -> {price, at}` |
| `stx-short-oracle` | `stx-short-oracle.clar` | Pyth Lazer adapter (feeds 45 STX/USD + 7 USDC/USD), mirrors the v6-4 markets |
| test doubles | `mocks/*.clar` | oracle / market / router with the real signatures, deployed under the real names in tests |

Deployer: chavita.btc `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22`, the same deployer as `markets-stx-usdcx-jing-v6-4` and `swap-router-stx-usdcx-jing-v5-5`. The vault binds every dependency by relative name (`.stx-short-pool`, `.stx-short-rate-model`, `.stx-short-oracle`, `.markets-stx-usdcx-jing-v6-4`, `.swap-router-stx-usdcx-jing-v5-5`); the pool binds `.stx-short-vault`. No setter can change a binding: the owner cannot point the vault at a hostile router or oracle. Tests swap in doubles by deploying them under those names.

Deploy order: `stx-short-oracle-trait` -> `stx-short-oracle` (the Lazer adapter file) -> `stx-short-rate-model` -> `stx-short-pool` -> `stx-short-vault`. The market + router must exist first (deploy set in `contracts/stx-usdcx/`). No initialize step.

Clarity 5, epoch latest (same as `markets-sbtc-usdcx-jing-v6-4`). Every outbound asset move is `as-contract?` with an exact `with-stx` / `with-ft` allowance; no blanket asset access.

## Units

- STX 6 dp, USDCx 6 dp, Lazer expo -8.
- Price = Jing market unit = micro-USDCx per micro-STX x 1e8 (= USD per STX x 1e8 when USDC = $1). `value(stx) = stx * price / 1e8`.
- Oracle price = STX/USD x 1e8 / USDC/USD (STX priced in USDC, the collateral's own unit, not raw USD).
- bps = 1/10000.

## Lender pool (`stx-short-pool`)

- Lenders deposit plain STX (min 1 STX) and receive **internal, non-transferable shares** (map). Not SIP-010 on purpose: a transferable share would need to settle the USDCx reward index on both sides of every transfer; a jSTX-style wrapper can be layered on later.
- Internal accounting only: `total-assets = idle + lent`. The STX balance is never read, so a donation cannot move the share price (no inflation attack). First deposit mints 1:1.
- Borrow (vault only, `contract-caller`): `lent + amount <= total-assets * max-util-bps` (default 80%, bounds 10..95%) **and** `lent + amount <= max-lent` (default 1,000,000 STX, the squeeze guard) **and** `<= idle`.
- Withdraw: only from `idle`. `amount = shares * total-assets / total-shares`.
- Interest: arrives in USDCx (`add-interest`, vault only). Protocol fee (`fee-bps`, default 10%, max 30%) goes straight to `treasury`; the rest is distributed through a reward-per-share index (scale 1e18, remainder carried). Lenders `claim-rewards` any time. **No auto-swap to STX**: it would add price risk and MEV to every open for no benefit; lenders who want STX can sell on Jing themselves.
- Loss: `repay(principal, amount)` with `amount < principal` drops `lent` by the principal, raises `idle` by the amount, so `total-assets` (and every share) drops pro rata. Recorded in `losses`. No insurance fund.
- Insolvency guard: if losses wipe `total-assets` to 0 while shares exist, deposits revert (`u3010`) instead of minting at an undefined price.
- Owner: `set-max-util-bps`, `set-max-lent`, `set-fee-bps`, `set-treasury`, `set-owner`, all bounded; nothing touches funds.

## Rate model (`stx-short-rate-model`)

`rate (APR bps) = clamp(htb(util) + lev-premium(lev), floor, cap)`, read once at open (and at each extend), stored in the position; parameter changes never affect a live loan.

| Utilization (post-borrow) | Tier | htb |
|---|---|---|
| < 50% | GC | `gc-bps` (500) |
| 50..80% | warm | linear 500 -> `warm-bps` (2000) |
| > 80% | special | linear 2000 -> `special-bps` (10000) at 100% |

Leverage premium: 0 at <= 1x, linear to `lev-premium-bps` (1000) at 3x. Floor 200, cap 20000. Hard ceilings: rates <= 50000, premium <= 5000, monotone curve enforced.

Interest (USDCx, paid upfront) = `ceil(notional * rate * tenor / (10000 * 31536000))`, notional = STX borrowed x oracle price.

## Position state machine

```
               open (FAST|SMOOTH)
                     |
                     v
   +-----------> OPENING ----- exec window over, 0 sold ----> CANCELLED
   |                 |   \---- exec window over, part sold --> OPEN (debt trimmed)
   |   all sold      |
   |                 v
   |               OPEN  <---- extend (pay interest, deadline += tenor)
   |               |    \
   |   close       |     \  health < threshold | past deadline
   |               v      \
   |           CLOSING ----+--> LIQUIDATING   (also: CLOSING past deadline + grace)
   |               |                 |
   |  debt bought  |                 | debt bought            USDCx exhausted
   |               v                 v                              |
   |            CLOSED          LIQUIDATED  <-----------------------+ (shortfall to pool)
```

States: 1 OPENING, 2 OPEN, 3 CLOSING, 4 LIQUIDATING, 5 CLOSED, 6 CANCELLED, 7 LIQUIDATED. Phase (within OPENING / CLOSING / LIQUIDATING): 1 FAST, 2 SMOOTH.

Position fields (map `positions uint -> {...}`): `owner, state, phase, debt` (STX owed), `borrowed, stx` (STX in hand: unsold on open, bought on close), `stx-mkt` (STX resting on Jing), `usdc` (collateral + proceeds in hand), `usdc-mkt` (USDCx resting), `collateral, interest` (held until the opening sale completes), `interest-paid, rate-bps, lev-bps, opened-at, deadline, window, limit, slip-bps, incr-bps, smooth-end-cycle, smooth-end-time, exec-end, last-step, liq-height, liq-keeper, sold, proceeds, bought, spent`.

## Execution modes (same for the opening sale and the close)

**FAST**: the Jing router (`smart-swap-stx-for-usdcx` / `smart-swap-usdcx-for-stx`, book leg + Bitflow DLMM) in increments: each call sells (or buys) `max(remaining * incr-bps, 1 STX)` capped at the remainder, with limit = oracle mid -/+ `slip-bps`. One increment per block per position (`last-step < stacks-block-height`, `u5017`). The first increment runs inside `open` / `close`; keepers `step` the rest. A router refusal is zero progress, not a revert. After the router returns, the vault re-checks the realized price against the limit (`u5022`).
- Sell: chunk STX in, `out >= in x limit`.
- Buy: budget = `ceil(target x limit)` USDCx (capped at what the position holds) so a full fill buys at least the target; the overshoot (<= slip of the last chunk) is returned to the user as STX at the end.

**SMOOTH**: rests one passive order on the Jing batch market (`deposit-token-x` STX ask on open, `deposit-token-y` USDCx bid on close) at a user limit within `+/- band-bps` (default 2%) of the oracle mid (default = mid), for a window of 1..`max-window` batches (default 3). Fills are pushed by the market at each settlement; `step` folds them in. The window ends at `get-current-cycle >= start + window` or after `window x batch-secs` seconds (default 600 s per batch, so a stalled market cannot hold the order forever); the step then cancels the rest off the market and switches to FAST. A market refusal at rest time (under minimum, paused) falls straight to FAST. **FAST is always the fallback.**

User rails (owner-set, hard-bounded): leverage <= 3x (`u5009`), min 10 STX (`u5007`), tenor 1 h .. 30 d (default 3 d, `u5010`), mode 1|2 (`u5011`), window (`u5012`), limit band (`u5013`), slip (default 1%, max 3%, `u5014`), increment 10..100% (default 25%, `u5015`).

### The single SMOOTH slot (v1 limitation)

The Jing market keys resting orders by principal: one vault contract can rest only one order per side, and fills arrive as pushes the vault cannot attribute per position. v1 therefore allows **one SMOOTH slot at a time** (`slot-pos`); a SMOOTH open/close while it is busy fails with `u5016` (the user can pick FAST or retry). Attribution: the vault books every asset move it makes (`stx-booked`, `usdc-booked`); `balance - booked` is exactly what the market pushed since the last sync, and goes to the slot owner (`sync-slot`, run before and after every action). FAST legs account by the router's reported `*-in` / `out`, so even a FAST taker that crosses the vault's own resting order (self-match) is split correctly: the taker side by the router numbers, the maker side by the balance surplus. v2: a fixed set of N "rester" sub-contracts (deployed once, not per user) to run N slots in parallel.

## Flows

### open
`(open stx-amount collateral tenor? mode window? limit? slip? incr? update)`
1. Oracle price from `update` (Lazer, fresh <= 80 s, conf < 2%).
2. Rails; leverage = `stx x price / collateral` <= 3x.
3. Rate at post-borrow utilization + leverage; interest quoted.
4. User transfers `collateral + interest` USDCx in; vault `borrow`s the STX from the pool (caps checked there).
5. FAST: first increment now. SMOOTH: rest the ask (slot must be free).
6. Interest stays in the vault until the sale completes (`finish-open` forwards it to the pool), so a non-fill can refund it.

Proceeds stay in the vault, locked; there is no withdraw function for them (only close / liquidation pay out).

### non-fill / cancel
If the opening sale has not completed when the FAST exec window ends (`exec-end`, default 30 min after FAST starts):
- nothing sold -> **CANCELLED**: STX back to the pool (no loss), collateral back, interest refunded minus `cancel-fee-bps` (default 10%, max 50%); the fee goes to the lenders (their STX was reserved).
- part sold -> **trim**: unsold STX back to the pool, debt = sold amount, the interest on the unsold share refunded minus the same fee; position goes OPEN.

### close
`(close id mode window? limit? slip? incr? update)`, owner only, from OPEN. Buys back the debt via FAST or SMOOTH; when `stx >= debt` (and nothing rests): repay the pool **exactly** `debt` STX, pay the user all remaining USDCx and any STX overshoot -> CLOSED. If USDCx runs out first, the position settles as a shortfall (see liquidation).

### extend
`(extend id tenor? update)`, owner only, OPEN, before the deadline. Pays `tenor` of interest at the **current** rate (current utilization, current leverage = debt value / equity) directly to the pool. Deterministic acceptance: pool utilization <= cap, lent <= absolute cap, leverage <= max, health >= `extend-min-health-bps` (default 120%), and the new deadline <= now + max tenor.

### step (keeper, permissionless)
`(step id update)`: advances OPENING / CLOSING / LIQUIDATING by one move (fold fills; end the SMOOTH window; one FAST increment), then checks completion. Keepers have no fee; the user can step their own position. Liquidations pay the bounty.

### liquidate
`(liquidate id update)`, anyone (keepers; lenders through any account). Allowed when
- `health < liq-threshold-bps` (default 110%), or
- OPEN and `stacks-block-time > deadline`, or
- CLOSING and past `deadline + close-grace-secs` (default 1 h).

`health = (usdc + usdc-mkt + (stx + stx-mkt) x price) / (debt x price x (1 + buffer-bps))`, buffer default 2%. At 3x the open health is about 130%; it hits 110% after a ~19% STX rally; at 2x about 147% -> ~33%.

Effect: a resting SMOOTH order of the position is cancelled, the state becomes LIQUIDATING with protocol presets (FAST, `liq-slip-bps` 3%, `liq-incr-bps` 34% per block; user settings ignored). The first buy waits `1 + liq-offset` blocks where `liq-offset = id-header-hash(trigger block)[0..16] mod (liq-max-offset + 1)` (default 0..3): the hash of the trigger block itself is unknown when the trigger tx is sent, so searchers cannot pre-position against the exact start block. Then one increment per block.

Completion: debt bought -> repay pool in full, keeper bounty (`liq-bounty-bps` of the debt value, default 0.5%, max 3%) from the **user's** remaining USDCx (junior to the lenders: paid only after the pool is whole), rest to the user -> LIQUIDATED. USDCx exhausted (<= 0.01) with STX still owed -> **shortfall**: everything bought goes to the pool, `repay(debt, bought)` books the difference as the lenders' loss, no bounty, nothing to the user. Buyback slippage therefore always comes out of the shorter's USDCx first and reaches the lenders only after it is exhausted.

## Oracle

Pyth **Lazer** (Pyth Core's wormhole path is dead on Stacks). `stx-short-oracle` calls `pyth-lazer-oracle verify-price-feeds update pyth-lazer-decoder-v1 (some 80)` (`SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8`), picks feed 45 (STX/USD) and 7 (USDC/USD), requires `confidence` present and `< price / 50`, `feed-update-timestamp` newer than `stacks-block-time - 80`, equal exponents, then `price = stx x 1e8 / usdc`. Same constants and checks as `markets-stx-usdcx-jing-v6-4`. Callers pass a fresh signed update on open, step, close, extend and liquidate. Execution prices come from Jing; the oracle is only used for valuation (leverage, health, interest notional) and the slippage bounds. Behind `stx-short-oracle-trait`; tests deploy a settable double under the same name.

## Time

Tenor deadlines, exec windows and the SMOOTH time cap use `stacks-block-time` (seconds), not block counts: Nakamoto block times vary from seconds to minutes, so "3 days" in blocks is not stable. The SMOOTH window counts Jing batches (`get-current-cycle`) with the time cap as a backstop. Rate-limits (one FAST increment per block) and the liquidation offset use `stacks-block-height`.

## Function signatures

Vault (`stx-short-vault`):
```
(open (stx-amount uint) (collateral uint) (tenor (optional uint)) (mode uint) (window (optional uint)) (limit (optional uint)) (slip (optional uint)) (incr (optional uint)) (update (buff 8192))) -> (response uint uint)   ;; position id
(step (id uint) (update (buff 8192))) -> (response position uint)
(close (id uint) (mode uint) (window (optional uint)) (limit (optional uint)) (slip (optional uint)) (incr (optional uint)) (update (buff 8192))) -> (response bool uint)
(extend (id uint) (tenor (optional uint)) (update (buff 8192))) -> (response uint uint)   ;; new deadline
(add-collateral (id uint) (amount uint)) -> (response bool uint)
(liquidate (id uint) (update (buff 8192))) -> (response bool uint)
(set-rails ...14 uints) (set-risk ...8 uints) (set-open-paused bool) (set-owner principal)   ;; owner, bounded
read-only: get-position, get-slot, get-next-id, get-params, health-at (id price), is-liquidatable-at (id price), liq-offset (height), assets-of
```
Pool (`stx-short-pool`):
```
(deposit (amount uint)) -> shares      (withdraw (shares uint)) -> stx      (claim-rewards) -> usdcx
(borrow (amount uint)) (repay (principal uint) (amount uint)) -> loss (add-interest (amount uint)) -> net   ;; vault only
(set-max-util-bps) (set-max-lent) (set-fee-bps) (set-treasury) (set-owner)
read-only: get-pool, get-lender, get-shares, shares-to-stx, stx-to-shares, pending-rewards, utilization-bps, utilization-after, capacity, total-assets
```
Rate model: `get-rate-bps (util lev)`, `htb-bps`, `lev-premium`, `tier`, `quote-interest (notional rate tenor)`, `set-curve`, `set-owner`.
Oracle: `get-price (update (buff 8192)) -> (response {price: uint, at: uint} uint)`.

Jing calls made by the vault (copied from `contracts/stx-usdcx/`): market `deposit-token-x/y (amount limit spread t asset-name)`, `cancel-token-x/y-deposit (t asset-name)`, `settle-token-x/y-deposit (who update t asset-name)`, `get-current-cycle`, `get-token-x/y-deposit (cycle who)`, `get-token-x/y-parked`, `get-token-x/y-pending-deposit`; router `smart-swap-stx-for-usdcx` / `smart-swap-usdcx-for-stx (amount limit (optional update) mid min-out)`. Traits passed: x = `SM1793...token-stx-v-1-2` "wstx", y = `SP120...usdcx` "usdcx-token".

## Error codes

| Code | Contract | Meaning |
|---|---|---|
| u2001 / u2002 | rate model | not owner / bad curve |
| u3001 | pool | not owner |
| u3002 | pool | caller is not the vault |
| u3003 | pool | zero amount |
| u3004 | pool | deposit under 1 STX / mints 0 shares |
| u3005 | pool | not enough shares |
| u3006 | pool | not enough idle STX (withdraw / borrow) |
| u3007 | pool | utilization cap |
| u3008 | pool | absolute cap (squeeze guard) |
| u3009 | pool | owner param out of bounds |
| u3010 | pool | insolvent (assets 0, shares > 0): deposits closed |
| u3011 | pool | repay principal > lent |
| u4001..u4006 | oracle | feed missing / uncertain (conf) / no timestamp / stale / zero price / expo mismatch |
| u5001 | vault | not owner |
| u5002 | vault | opens / extends paused |
| u5003 | vault | owner param out of bounds |
| u5004 | vault | no position |
| u5005 | vault | not the position owner |
| u5006 | vault | wrong state for this action |
| u5007 | vault | under min STX |
| u5008 | vault | zero collateral |
| u5009 | vault | leverage over max |
| u5010 | vault | tenor out of rails / extend past max horizon |
| u5011 | vault | bad mode |
| u5012 | vault | SMOOTH window out of rails |
| u5013 | vault | limit outside the band around mid |
| u5014 | vault | slippage out of rails |
| u5015 | vault | increment out of rails |
| u5016 | vault | SMOOTH slot busy |
| u5017 | vault | one FAST increment per block |
| u5018 | vault | not liquidatable |
| u5019 | vault | health under extend minimum |
| u5020 | vault | pool over its caps (extend) |
| u5021 | vault | past deadline (extend) |
| u5022 | vault | realized price outside the limit (router check) |
| u5024 | vault | liquidation start offset not reached |
| u1xxx / u3xxx | Jing | passed through from market / router where not caught |

## Admin powers (and what they cannot do)

Owner can: pause new opens/extends (never close/step/liquidate), tune rails and risk params within hard bounds, tune the rate curve within bounds, set pool caps / fee / treasury within bounds, transfer ownership. Owner cannot: move any position's or the pool's assets, change the market / router / oracle / pool bindings, change a live position's rate, block exits. Lowering `liq-threshold-bps` / raising `buffer-bps` does affect live positions' liquidation boundary (bounded 102..150% / 0..10%); flagged below.

## Open questions and risks

1. **Interest refund on non-fill**: default = refund minus 10% of the interest on the unsold part (to lenders). Alternatives: full refund (lenders get nothing for the reserved window) or flat fee. Rapha to pick.
2. **Oracle failure**: no fresh Lazer update -> open / step / close / extend / liquidate all revert (no stale price ever used). Positions are frozen, not lost; during an outage health checks are impossible and a big move can deepen a shortfall. Option: a DIA STX/USD fallback for `liquidate` only (DIA posts ~15 min, 2 h staleness); not in v1.
3. **Jing non-fill on both legs**: open side is bounded (cancel / trim after the exec window). Close / liquidation side has no time bound: if Jing book + DLMM cannot fill within `slip` of the oracle (venue diverges from Lazer, thin book), the position stays CLOSING / LIQUIDATING and keepers retry every block; meanwhile the shortfall risk grows. Mitigations to discuss: widen `liq-slip-bps` progressively with time since trigger; owner-set emergency slip (bounded).
4. **Pool insolvency**: losses hit all lenders pro rata immediately; there is no queue. A lender who sees a liquidation coming can withdraw idle STX first (front-run the loss) if idle exists. Option: withdrawal delay / epoch exits.
5. **Rounding**: shares round down on mint, STX rounds down on withdraw (favors the pool); interest rounds up (favors lenders); bounty / refunds round down. Reward index carries the remainder. Position math works in whole micro-units; FAST overshoot is returned as STX.
6. **Squeeze**: `max-lent` + utilization cap bound the protocol's STX short interest. A whale could still push STX up on DLMM to trigger liquidations (health uses Lazer, not DLMM, so a DLMM-only pump does not trigger them; it only makes buybacks expensive). The randomized offset + increments limit how much one liquidation moves the venue in one block.
7. **Keeper liveness**: steps are unpaid; FAST positions advance only when someone steps. Liquidations pay a bounty, but only from the user's leftover USDCx; near-insolvent positions pay ~0, so the protocol must run its own keeper (Juice box) for those.
8. **MEV**: the vault's trades are visible in the mempool; per-increment limits cap the damage at `slip` per chunk. The offset hides only the first liquidation block (miners of the trigger block know it). SMOOTH orders rest at a known limit (that is the point of a passive order).
9. **Single SMOOTH slot**: throughput limit (see above). Also: a SMOOTH open with the market in settle phase can make the window-end cancel revert (Jing u1002); the keeper retries next block.
10. **Live params**: `liq-threshold-bps`, `buffer-bps`, `liq-*` apply to live positions. Option: snapshot them into the position at open like the rate.
11. **USDCx / USDC depeg, USDCx issuer powers**: the oracle prices STX in USDC via feed 7, but USDCx itself can be frozen/burned by its issuer (see `contracts/sbtc-usdcx/README.md` audit #4). Booked accounting uses `sub0`, so a seizure under-pays the slot owner rather than freezing the vault.
12. **Leverage at extend** uses current equity; a position that drifted to >3x must add collateral before extending.
13. **Extend health floor** is dominated by the leverage cap at defaults (see Design notes below).
14. **Default slip** 1% vs a ~1% DLMM spread (see fork finding 3): consider 1.5-2%.
15. **One FAST increment per block** also throttles honest closes; with 25% increments a full exit takes ~10+ blocks plus the min-chunk tail.

## Tests and results (2026-11-07, nothing committed)

| Gate | Command | Result |
|---|---|---|
| Type check | `clarinet check --manifest-path Clarinet-short.toml` | 8 contracts checked, 0 errors. Warnings: 18 `unwrap-panic` on `(map-get? positions id)` for ids validated earlier in the same call; the rest are unused params / constants in the mocks. No Lazer decoder warning on this manifest (requirements resolve from `.cache`). |
| Format | `clarinet format --manifest-path Clarinet-short.toml --check` | all files formatted |
| Unit (Clarinet SDK, pinned fork 9318170) | `npx vitest run -c vitest.short.config.ts` | **24/24 pass** |
| Fork vs real Jing STX/USDCx market + router | `node simulations/verify-stx-short.mjs` (keyless) | **88/88** [stxer 8a8d494a](https://stxer.xyz/simulations/mainnet/8a8d494a4f54b62fe99f2fa08b4ff01c) |
| Rendezvous invariants (pool) | `bash tests/rv/short-pool/build.sh && npx rv tests/rv/short-pool stx-short-pool invariant --runs=3000 --seed=7` | 1000 runs (seed 20261107) + 3000 runs (seed 7): all 10 invariants hold, 0 failures |

`Clarinet-short.toml` reads remote data through a copy of `simulations/_api-proxy.mjs` listening on **8797** (Hiro rate-limits; 8787 is used by other suites). Start it before `clarinet check` / vitest.

Unit cases: rate tiers / quote / curve bounds; pool share math, idle-only withdraw, utilization cap, absolute cap, vault-only gates; open FAST one-shot (interest net of fee to lenders, fee to treasury); FAST increments + one-per-block (`u5017` via two steps in one block); every open rail (`u5007..u5015`, pause `u5002`); oracle failure; SMOOTH rest -> batch fill -> window end -> FAST; SMOOTH busy slot `u5016`; SMOOTH refused -> FAST; cancel on non-fill (interest - 10% fee back); partial fill -> trim; close FAST (exact repay, profit to user); close owner/state gates; close SMOOTH; extend (pays, deadline moves); extend rejections (health `u5019`, horizon `u5010`, late `u5021`); liquidation by health (bounty, user remainder, no loss); by deadline; start offset (`u5024` until `liq-height + 1 + offset`); loss absorption (shortfall booked, share value down, rewards kept); liquidation taking over a resting SMOOTH close; owner bounds. Every flow ends with a no-residual check (`balance == booked`, slot free).

Fork (keyless): the real market + router are deployed as chavita with the multisig `set-verified-contract` / `initialize` dance, then the short contracts. The vault's oracle is the settable double anchored to the real venue mid (1 STX sell + 1 USDCx buy probes on the router; DIA STX/USD as a +/-5% sanity bound). Covered: lender deposit, open FAST one-shot and across blocks, open SMOOTH resting a real `deposit-token-x`, busy slot, window expiry -> real `cancel-token-x-deposit` -> FAST, close FAST, close SMOOTH resting a real `deposit-token-y` -> expiry -> FAST, extend, liquidation by health (+75% on 1.5x) and by deadline (after `AdvanceBlocks`), cancel on non-fill, a losing close after a whale pump, lender claim + full exit, no residual in vault or router.

Keyed (`PYTH_API_KEY=... node simulations/verify-stx-short.mjs`): binds the real Lazer adapter as `.stx-short-oracle` and adds a real batch fill of the SMOOTH ask against a whale bid (`settle-with-refresh`). **Not run** (the faktory-dao keyless Lazer route has no [45, 7] pair). Expected friction: `AdvanceBlocks` moves block time ahead of wall clock, so updates fetched after an advance can read as stale.

### What the fork runs taught us

1. **stxer keeps calls in one Stacks block**: the one-FAST-increment-per-block guard refused every keeper step until the harness advanced a block between steps. The guard works as designed; real keepers land in different blocks.
2. **Oracle vs venue divergence stalls closes**: with the test oracle on DIA (lagging up to ~15 min), the venue sat >1% above it and a FAST close with the default 1% slip bought nothing (position stuck in CLOSING). Lazer tracks the venue closely, but this is open question 3 seen live.
3. **Venue spread vs default slip**: DLMM pool 3 showed bid 0.3394 / ask 0.3428 (~1% wide). A 1000 STX round trip cost ~1.5% (proceeds 339.4 vs buyback 344.5 USDCx), and the budget-at-limit buy overshot by ~5 STX (returned to the user). A default slip of 1% around mid leaves ~0.5% for impact on the buy side. Consider defaulting to 1.5-2%.
4. **The loss path cannot be forced on the fork**: ~40k USDCx of whale buying moved the DLMM price only ~5% (0.341 -> 0.358), far from the >33% a 3x position needs to go underwater. Shortfall / loss absorption is covered by the unit tests and the RV pool invariants only.

### Design notes from testing

- At default rails `extend-min-health-bps` (120%) never binds: leverage <= 3x already implies health >= 133% / 1.02 = 130.7%. The health floor only matters if the owner raises it above ~130%, or lowers `max-lev-bps`. Keep or drop it (open question 13).

