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

## Pricing

- Market mid: Pyth Lazer BTC/USD (feed 1) / USDC/USD (feed 7), one signed update, both expo -8. Keyless fetch: `GET /api/auction/pyth-lazer-update?pair=sbtc-usdcx` on the faktory-dao backend.
- Rung fat-finger guard: DIA `get-value "BTC/USD"` (8 dp = the market price unit). DIA posts every ~15 min (max gap ~18 min); guard = +/-20% (`GUARD_BPS u2000`), u0 (no push) when DIA is >2h stale. The guard is refreshed on push or by anyone via `refresh-guard`.
- sBTC = BTC and USDCx = USDC are assumed; a bridge depeg is handled by pausing the market (keeper).

## stxer simulations (mainnet fork)

| Harness | What it covers | Result |
|---|---|---|
| `simulations/verify-sbtc-usdcx-v6-4.mjs` | market alone: deploy, core verify, initialize (feeds 1/7), USDCx moves, makers, takers both ways, cancel refund, [1,45] update rejected (u1023) | 23/23 [40b25b00](https://stxer.xyz/simulations/mainnet/40b25b00b8eea7827dd11dc484d4fad0) (before the ladder rebind) |
| `simulations/verify-router-sbtc-usdcx-v5-5.mjs` | router: DLMM-only both ways, book + DLMM split, limit abort u3002, no residual balance | 41/41 [656b78df](https://stxer.xyz/simulations/mainnet/656b78df2451928d373bd314234109c3) (bin-step fix, ladder deployed first, multisig init) |
| `simulations/verify-sbtc-usdcx-suite.mjs` | full suite: deploy order, band seating per side, DIA guard, dispatch deposits, settle-batch, router fills into rungs, payouts/decimals, partial withdraws, no residual | 72/72 [e3483205](https://stxer.xyz/simulations/mainnet/e3483205a22f03233c3bc06a1537abc9) (audit fixes #1, #3, #4; multisig init) |

Run: `node simulations/<harness>` (keyless; Hiro 429s -> `simulations/_api-proxy.mjs`).
Not covered: the 2h DIA staleness path (a fork cannot make DIA stale). A 0 bps rung cannot run on both sides at once (the second crosses the first at mid and is refunded, by design).

## Audit: bounty mvlqxozz934e1c757f88 (fork at `f01bffc`)

| # | Finding | Reporter | Verdict | Action |
|---|---|---|---|---|
| 1 | Router hard-coded `DLMM_BIN_STEP u10`; pool 2 (`v-1-bps-1`) has bin-step 1 on chain, so `dlmm-out` quoted it 0 and `dlmm-pick` never chose it while another pool was eligible. Same root: on an all-zero tie `dlmm-pick` could return pool 1 while ineligible (benign, `dlmm-stage` caps it to 0). | Swift Bot Labs (Ruby Gorilla), first | Holds, Low. No loss today: pools 2/3 hold dust (2026-10-25: pool 1 2.84 BTC + 91.8k USDCx, pool 2 61 USDCx, pool 3 20k sats) and fail the 1% depth filter | Fixed `93c8ec6`: `dlmm-out` fetches the factors for the pool's own bin step, `dlmm-pick` returns only an eligible pool |
| 2 | The +/-20% DIA guard is a snapshot: the rung stores cap (DIA x 1.2) / floor (DIA x 0.8) only on `push` or `refresh-guard`. After a move past 20% the resting order stops filling until a refresh; after a move the other way the guard gets looser. | Frosty Narwhal | Holds, Low (liveness only, no funds at risk) | No contract change: the keeper calls the permissionless `refresh-guard` on each rung when DIA drifts past ~5% from the stored guard. If DIA stops posting (>24h stale) the guard reads 0, `push` / `refresh-guard` abort `ERR_ZERO_PRICE`, no new funds reach the market; `deposit` / `withdraw` / `claim` / `sync` never read DIA, so users can always exit. No owner switch to turn DIA off (that would let the owner drop the guard). |
| 3 | DIA staleness bound of 24h is ~100x DIA's ~15 min cadence: a frozen feed keeps anchoring the guard for a day | Frosty Narwhal | Holds, Info | `miner-mid` in both rungs: `u86400` -> `u7200` (2h, ~8 missed DIA posts). Rung code hash changes: regen ladder canonical hashes / BE templates |
| 4 | The USDCx mint role can `protocol-transfer` / `protocol-burn` any balance (sBTC governance likewise). Taking funds out of a rung made balance minus accounting go negative in `sync` and the epoch close, so `deposit` / `withdraw` / `claim` aborted for everyone, freezing the untouched token too | Frosty Narwhal | Holds, Info / trust | `sub0` (subtraction floored at 0) at the 3 balance-minus-accounting sites per rung (`local`, `gained`, `free`); accounting re-bases to the real balance and members can still exit the other token. Rung code hash changes. Same fix ported to the live sBTC/STX rung sources `contracts/jing-buy-stx-rung-v2.clar` / `jing-sell-stx-rung-v2.clar` (deployed `jing-buy-stx-<bps>` / `jing-sell-stx-<bps>` carry the old code: an sBTC seizure would freeze them, STX side included; picked up at the next rung redeploy, regen the faktory-dao rung templates then) |
| - | `dlmm-threshold` 100x too small | Ionic Zephyr | Refuted: the x100 is the 8 dp / 6 dp conversion after the x/y flip (Ancient Osprey, Valiant Sable) | none |
| - | Router "eats" xyk/Velar legs, funds lost | Iron Hub | Refuted: non-zero amounts abort with u3003 and the whole tx reverts; only the fee is spent | none |
