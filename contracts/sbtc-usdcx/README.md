# sBTC/USDCx market suite

Fork of the live sbtc-stx v6-4 set (mainnet sources at `863921d`) for sBTC (token x, 8 dp) against USDCx (token y, 6 dp).
Diff against the fork sources: `git diff 863921d -- contracts/sbtc-usdcx` (renames landed alone in `24467aa`).

## Contracts

| Deploy name | Forked from | Change |
|---|---|---|
| `jing-ladder-sbtc-usdcx-v1` | `jing-ladder-v1` | side labels follow sBTC: `sel-band` = x (rests sBTC), `buy-band` = y (rests USDCx) |
| `markets-sbtc-usdcx-jing-v6-4` | `markets-sbtc-stx-jing-v6-4` | every token-y move is a USDCx ft transfer (`USDCX` constant + `with-ft`); `initialize` pins y to USDCx; binds the new ladder |
| `jing-sell-sbtc-<bps>` (`jing-sell-sbtc-bps.clar`) | `jing-buy-stx-<bps>` | rests sBTC, proceeds in USDCx; floor = DIA BTC/USD x 0.80 |
| `jing-buy-sbtc-<bps>` (`jing-buy-sbtc-bps.clar`) | `jing-sell-stx-<bps>` | rests USDCx, proceeds in sBTC; cap = DIA BTC/USD x 1.20 |
| `jing-ladder-dispatch-sbtc-usdcx` | `jing-ladder-dispatch` | binds the new ladder; deposit-buy = USDCx into buy-sbtc rungs, deposit-sell = sBTC into sell-sbtc rungs |
| `jing-settle-batch-sbtc-usdcx` | `jing-settle-batch` | binds the new market, token y = USDCx |
| `swap-router-sbtc-usdcx-jing-v5-5` | `swap-router-sbtc-stx-jing-v5-5` | Jing book + Bitflow DLMM sbtc-usdcx pools (ids 1, 2, 17; x = sBTC; each pool quoted at its own bin step: 10, 1, 10); xyk/Velar removed (amounts must be 0, else u3003); `*-sbtc-for-usdcx` / `*-usdcx-for-sbtc` |

Reused as deployed: `jing-core-v6`, `jing-rung-deposit-trait`. The rung trait keeps its `stx` / `stx-paid` keys (they carry USDCx amounts here).

## Deploy order (deployer SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22)

1. `jing-ladder-sbtc-usdcx-v1`, then the ladder owner sets the canonical rung hashes per side
2. `markets-sbtc-usdcx-jing-v6-4`, then (core owner = Juice multisig `SM1N7VX04M1TT23KD7YHVD6H6413QV2ZNJFTWVF9P` since 2026-10-24) multisig `jing-core-v6 set-verified-contract`; `initialize` needs tx-sender = operator = core owner, so deployer `set-operator` -> multisig, multisig `initialize(market, sbtc-token, usdcx, min-x, min-y, u1, u7)`, multisig `set-operator` -> deployer
3. rungs `jing-sell-sbtc-<bps>` / `jing-buy-sbtc-<bps>`, `initialize` each
4. `jing-ladder-dispatch-sbtc-usdcx`, `jing-settle-batch-sbtc-usdcx`, `swap-router-sbtc-usdcx-jing-v5-5`

## Mainnet deployment (2026-10-28)

All from `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22`, deploy bytes = `bdaa349` (faktory-dao templates `8311fba5`).
**Every deployed source below was verified manually against this repo by Rapha RS (2026-10-28).**

| Contract | Block | Verified |
|---|---|---|
| `jing-ladder-sbtc-usdcx-v1` | 9350457 | Rapha RS |
| `markets-sbtc-usdcx-jing-v6-4` | 9350458 | Rapha RS |
| `jing-sell-sbtc-1`, `-10` ... `-90` (`jing-sell-sbtc-bps.clar`) | 9350637-9350642 | Rapha RS |
| `jing-buy-sbtc-1`, `-10` ... `-90` (`jing-buy-sbtc-bps.clar`) | 9350710-9350713 | Rapha RS |
| `jing-ladder-dispatch-sbtc-usdcx` | 9350750 | Rapha RS |
| `jing-settle-batch-sbtc-usdcx` | 9350751 | Rapha RS |
| `swap-router-sbtc-usdcx-jing-v5-5` | 9350751 | Rapha RS |

Setup: core-v6 `set-verified-contract` by the Juice multisig (tx `0xd81c4cf0...`, 9350545); market `set-operator` -> multisig (9350572); multisig `initialize(market, sbtc-token, usdcx, u1000, u1000000, u1, u7)` `(ok true)` (tx `0x165c4a55...`, 9350596). Market operator stays the multisig. Rungs: bands 1, 10 ... 90 per side; canonical = the 1 rung per side; seated via faktory-dao `init-jing-rungs {set: "usdcx"}`.

## Pricing

- Market mid: Pyth Lazer BTC/USD (feed 1) / USDC/USD (feed 7), one signed update, both expo -8. Keyless fetch: `GET /api/auction/pyth-lazer-update?pair=sbtc-usdcx` on the faktory-dao backend.
- Rung fat-finger guard: DIA `get-value "BTC/USD"` (8 dp = the market price unit). DIA posts every ~15 min (max gap ~18 min); guard = +/-20% (`GUARD_BPS u2000`), u0 (no push) when DIA is >2h stale. The guard is refreshed on push or by anyone via `refresh-guard`.
- sBTC = BTC and USDCx = USDC are assumed; a bridge depeg is handled by pausing the market (keeper).

## stxer simulations (mainnet fork)

| Harness | What it covers | Result |
|---|---|---|
| `simulations/verify-sbtc-usdcx-v6-4.mjs` | market alone: deploy, core verify, initialize (feeds 1/7), USDCx moves, makers, takers both ways, cancel refund, [1,45] update rejected (u1023) | 23/23 [40b25b00](https://stxer.xyz/simulations/mainnet/40b25b00b8eea7827dd11dc484d4fad0) (before the ladder rebind) |
| `simulations/verify-router-sbtc-usdcx-v5-5.mjs` | router: DLMM-only both ways, book + DLMM split, limit abort u3002, no residual balance | 41/41 [656b78df](https://stxer.xyz/simulations/mainnet/656b78df2451928d373bd314234109c3) (bin-step fix, ladder deployed first, multisig init) |
| `simulations/verify-sbtc-usdcx-suite.mjs` | full suite: deploy order, band seating per side, DIA guard, dispatch deposits, settle-batch, router fills into rungs, payouts/decimals, partial withdraws, no residual | 72/72 [467106c8](https://stxer.xyz/simulations/mainnet/467106c8b200edef379f293be15c73af) (deploy bytes: clarinet format 3.23.2 on all but the market; audit fixes #1, #3, #4; multisig init) |

Run: `node simulations/<harness>` (keyless; Hiro 429s -> `simulations/_api-proxy.mjs`).
The stxer harnesses do not age DIA; the Clarinet fork test below covers the 2h stale-feed path. A 0 bps rung cannot run on both sides at once (the second crosses the first at mid and is refunded, by design).

## Clarinet SDK (pinned mainnet fork)

Run the dedicated suite with `npx vitest run -c vitest.sbtc-usdcx.config.ts`. Its manifest pins remote state to block `9318170`; the saved Pyth Lazer fixture makes the update reproducible. The full suite passed 4/4 after bounty fixes `93c8ec6`, `40130de`, and `f31fae8`.

| Case | Coverage |
|---|---|
| Deploy and trade | Ladder-first deployment, core verification and multisig operator handoff, token-y pin, both swap directions, market/DLMM split, rung payouts and withdrawals, token decimals, and zero router balances |
| Pool 2 | Adds LP through Bitflow's public core call on the disposable fork, then verifies the step-1 pool's positive quote wins and `dlmm-pick` selects pool 2 |
| DIA staleness | Advances burn blocks past 7200 seconds and verifies rung `miner-mid` returns `u0` and the guard rejects refresh |
| USDCx protocol burn | Burns from the rung through a test-only `as-contract?` probe, then verifies `sync`, `claim`, and `withdraw` remain usable. The probe is appended only to this test deployment; the checked-in rung source is unchanged. |

`clarinet format --manifest-path Clarinet-sbtc-usdcx.toml --dry-run` passes. `clarinet check` currently reports the remote `pyth-lazer-decoder-v1` requirement as unresolved, although the Vitest fork loads and executes it successfully.

## Audit: bounty mvlqxozz934e1c757f88 (fork at `f01bffc`)

| # | Finding | Reporter | Verdict | Action |
|---|---|---|---|---|
| 1 | Router hard-coded `DLMM_BIN_STEP u10`; pool 2 (`v-1-bps-1`) has bin-step 1 on chain, so `dlmm-out` quoted it 0 and `dlmm-pick` never chose it while another pool was eligible. Same root: on an all-zero tie `dlmm-pick` could return pool 1 while ineligible (benign, `dlmm-stage` caps it to 0). | Swift Bot Labs (Ruby Gorilla), first | Holds, Low. No loss today: pools 2/3 hold dust (2026-10-25: pool 1 2.84 BTC + 91.8k USDCx, pool 2 61 USDCx, pool 3 20k sats) and fail the 1% depth filter | Fixed `93c8ec6`: `dlmm-out` fetches the factors for the pool's own bin step, `dlmm-pick` returns only an eligible pool |
| 2 | The +/-20% DIA guard is a snapshot: the rung stores cap (DIA x 1.2) / floor (DIA x 0.8) only on `push` or `refresh-guard`. After a move past 20% the resting order stops filling until a refresh; after a move the other way the guard gets looser. | Frosty Narwhal | Holds, Low (liveness only, no funds at risk) | No contract change: the keeper calls the permissionless `refresh-guard` on each rung when DIA drifts past ~5% from the stored guard. If DIA stops posting (>24h stale) the guard reads 0, `push` / `refresh-guard` abort `ERR_ZERO_PRICE`, no new funds reach the market; `deposit` / `withdraw` / `claim` / `sync` never read DIA, so users can always exit. No owner switch to turn DIA off (that would let the owner drop the guard). |
| 3 | DIA staleness bound of 24h is ~100x DIA's ~15 min cadence: a frozen feed keeps anchoring the guard for a day | Frosty Narwhal | Holds, Info | `miner-mid` in both rungs: `u86400` -> `u7200` (2h, ~8 missed DIA posts). Rung code hash changes: regen ladder canonical hashes / BE templates |
| 4 | The USDCx mint role can `protocol-transfer` / `protocol-burn` any balance (sBTC governance likewise). Taking funds out of a rung made balance minus accounting go negative in `sync` and the epoch close, so `deposit` / `withdraw` / `claim` aborted for everyone, freezing the untouched token too | Frosty Narwhal | Holds, Info / trust | `sub0` (subtraction floored at 0) at the 3 balance-minus-accounting sites per rung (`local`, `gained`, `free`); accounting re-bases to the real balance and members can still exit the other token. Rung code hash changes. Same fix ported to the live sBTC/STX rung sources `contracts/jing-buy-stx-rung-v2.clar` / `jing-sell-stx-rung-v2.clar` (deployed `jing-buy-stx-<bps>` / `jing-sell-stx-<bps>` carry the old code: an sBTC seizure would freeze them, STX side included; picked up at the next rung redeploy, regen the faktory-dao rung templates then) |
| - | `dlmm-threshold` 100x too small | Ionic Zephyr | Refuted: the x100 is the 8 dp / 6 dp conversion after the x/y flip (Ancient Osprey, Valiant Sable) | none |
| - | Router "eats" xyk/Velar legs, funds lost | Iron Hub | Refuted: non-zero amounts abort with u3003 and the whole tx reverts; only the fee is spent | none |

### Severity and award

Severity = impact x likelihood (Immunefi / Code4rena style). Impact: can funds be lost or frozen, or is it worse execution / downtime only? Likelihood: what has to happen first?

| Rank | # | Impact | Likelihood | Severity |
|---|---|---|---|---|
| 1 | 4 seizure freeze | High: every fund left in the rung frozen, both tokens, all members | Very low: the USDCx issuer or sBTC governance must act against the rung | Medium (high impact, privileged trigger) |
| 2 | 2 guard snapshot | Low: orders stop filling, no loss | Likely at some point: a 20% BTC move with no refresh | Low |
| 3 | 1 bin step | Low: worse execution, min-out still protects | ~0 today: pools 2 and 3 hold dust | Low |
| 4 | 3 24h staleness | Low: weaker fat-finger guard while DIA is down | Low: needs a DIA freeze plus a big move | Info |

Winner: **Frosty Narwhal** (Iskander, agent #124): the most severe finding (#4) plus #2 and #3. Runner-up: **Swift Bot Labs** (Ruby Gorilla) for #1, first report with a mainnet-fork repro and the patch we shipped.
