# STX/USDCx market suite

Fork of the sBTC/USDCx suite (`contracts/sbtc-usdcx/`, itself a fork of the live sbtc-stx v6-4 set) for STX (token x, native, 6 dp) against USDCx (token y, 6 dp).
Diff against the fork sources: `diff contracts/sbtc-usdcx/<src> contracts/stx-usdcx/<dst>` (pairs in the table below). The token-x STX path is the one the sbtc-stx market already runs on its y side (`stx-transfer?`, `as-contract? ((with-stx ...))`).

**Not deployed.** Assumption: the market, router and every other contract here are deployed by chavita.btc `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22`, the same deployer as the rest of Jing; contract references between suite contracts use that principal, as in sbtc-usdcx.

## Contracts

| Deploy name | Forked from (sbtc-usdcx) | Change |
|---|---|---|
| `jing-ladder-stx-usdcx-v1` | `jing-ladder-sbtc-usdcx-v1` | fixed-price sides renamed `sel-stx` / `buy-stx`; band sides unchanged: `sel-band` = x (rests STX), `buy-band` = y (rests USDCx) |
| `markets-stx-usdcx-jing-v6-4` | `markets-sbtc-usdcx-jing-v6-4` | every token-x move is native STX: 21 `(contract-call? <trait> transfer ...)` -> `stx-transfer?`, 15 `with-ft (contract-of <trait>) ...` -> `with-stx`; `DECIMAL_FACTOR u100` -> `u1`; `initialize` pins x = `token-stx-v-1-2` (new `WSTX` constant) next to the existing y = USDCx pin (both u1013); binds the new ladder. Token y (USDCx ft) untouched |
| `jing-sell-stx-usdc-<bps>` (`jing-sell-stx-usdc-bps.clar`) | `jing-sell-sbtc-<bps>` | rests STX (native: `stx-get-balance`, `stx-transfer?`, `with-stx`), proceeds in USDCx; floor = DIA STX/USD x 0.80; `SOLD_OUT_DUST` u10 -> u10000, `MIN_DEPOSIT` u100 -> u100000 (0.1 STX, same as the live STX-resting `jing-sell-stx-rung-v2`); `held-sats`/`reserved-sats`/`pooled-sbtc` -> `held-ustx`/`reserved-ustx`/`pooled-stx` |
| `jing-buy-stx-usdc-<bps>` (`jing-buy-stx-usdc-bps.clar`) | `jing-buy-sbtc-<bps>` | rests USDCx, proceeds in native STX; cap = DIA STX/USD x 1.20; `sats-accounted` -> `ustx-accounted`; dust / min unchanged (USDCx, 6 dp) |
| `jing-ladder-dispatch-stx-usdcx` | `jing-ladder-dispatch-sbtc-usdcx` | binds the new ladder; deposit-buy = USDCx into buy-stx-usdc rungs, deposit-sell = STX into sell-stx-usdc rungs |
| `jing-ladder-dispatch-stx-usdcx-relay` | `jing-ladder-dispatch-sbtc-usdcx-relay` | same, without the u7106 direct-call gate |
| `jing-settle-batch-stx-usdcx` | `jing-settle-batch-sbtc-usdcx` | binds the new market; token x = `token-stx-v-1-2` / `"wstx"` |
| `swap-router-stx-usdcx-jing-v5-5` | `swap-router-sbtc-usdcx-jing-v5-5` | Jing book + Bitflow DLMM stx-usdcx pools (ids 3, 4, 5; x = STX; bin steps 10, 4, 1, each quoted at its own step); `PRICE_SCALE` 1e10 -> 1e8; xyk/Velar still removed (amounts must be 0, else u3003); `*-stx-for-usdcx` / `*-usdcx-for-stx`; STX measured with `stx-get-balance` |

Rung names: `jing-sell-stx-<bps>` / `jing-buy-stx-<bps>` are taken by the live sbtc-stx rungs, so this suite uses `jing-sell-stx-usdc-<bps>` (rests STX, sells it for USDCx) and `jing-buy-stx-usdc-<bps>` (rests USDCx, buys STX). The rung checks its own name against `NAME_PREFIX` + bps at `initialize` (u7009).

Reused as deployed: `jing-core-v6`, `jing-rung-deposit-trait`. The rung trait keeps its `stx` / `sbtc` keys and they stay positional, as in sbtc-usdcx: `sbtc` / `sbtc-paid` = token x (**micro-STX here**), `stx` / `stx-paid` = token y (micro-USDCx). Indexers and the FE must read them by role, not by name.

The market keeps the `(t <ft-trait>)` / asset-name arguments on the x side (same ABI as the other v6-4 markets); for x they are only compared to `token-x` (`contract-of t` = `token-stx-v-1-2`, u1013 otherwise), never called. Pass `SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2` / `"wstx"`, as the sbtc-stx market does for its STX side.

## Deploy order (deployer SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22)

1. `jing-ladder-stx-usdcx-v1`, then the ladder owner sets the canonical rung hashes per side
2. `markets-stx-usdcx-jing-v6-4`, then multisig (`SM1N7VX04M1TT23KD7YHVD6H6413QV2ZNJFTWVF9P`, core owner) `jing-core-v6 set-verified-contract`; deployer `set-operator` -> multisig, multisig `initialize(market, token-stx-v-1-2, usdcx, min-x, min-y, u45, u7)`, multisig `set-operator` -> deployer (or keep the multisig as operator, as sbtc-usdcx did). Suggested mins: `u1000000` (1 STX) / `u1000000` (1 USDCx)
3. rungs `jing-sell-stx-usdc-<bps>` / `jing-buy-stx-usdc-<bps>`, `initialize` each
4. `jing-ladder-dispatch-stx-usdcx` (+ `-relay` if the BTC-in adapter path is wanted), `jing-settle-batch-stx-usdcx`, `swap-router-stx-usdcx-jing-v5-5`

## Decimals and price unit

- Both tokens 6 dp. Price unit unchanged: USDCx per STX x 1e8 (`PRICE_PRECISION u100000000`), so y = x * price / 1e8.
- Market: `DECIMAL_FACTOR u1` (was u100 for 8 dp sBTC vs 6 dp USDCx). It is used only as `(* PRICE_PRECISION DECIMAL_FACTOR)` (walk `scale`, settle `token-y-value-of-token-x` and its inverse, `cap-scale`), so every conversion becomes x * price / 1e8. No other unit literal in the market.
- Router: `PRICE_SCALE` (= `PRICE_PRECISION * DECIMAL_FACTOR`) u10000000000 -> u100000000. This is the sbtc-usdcx audit's "x100 is the 8 dp / 6 dp conversion" item: `limit-min`, `fallback-residual` and `dlmm-threshold` all go through it. For 6/6 the DLMM price (y raw per x raw x 1e8) equals the market price, so `dlmm-threshold` reduces to the limit adjusted for fee. `DLMM_PRICE_SCALE` (1e8, Bitflow's unit) is unchanged.
- Rungs: share math (`SCALE`, `PROCEEDS_SCALE`, `MINT_FLOOR`, `RESCALE`) is unit-free; the DIA guard is 8 dp = the market unit. Only the STX-resting rung's dust and minimum change (see table). Overflow: `gained * PROCEEDS_SCALE` stays < 1e33 even for 1e15 micro-units.

## Pricing

- Market mid: Pyth Lazer STX/USD (feed 45) / USDC/USD (feed 7), one signed update, both expo -8 (the market already rejects mismatched expos, u1014). Feed ids are `initialize` arguments (not pinned in code, same as sbtc-usdcx); an update without both stored feeds aborts u1023 (`ERR_FEED_MISSING`), verified on the fork with [1, 45] and [1, 7] updates.
- **Backend gap**: faktory-dao `GET /api/auction/pyth-lazer-update` has no 45/7 pair today (an unknown `pair=` falls back to sbtc-stx [1, 45], checked 2026-11-07). Needs a `pair=stx-usdcx` -> `[45, 7]` entry before the FE, keepers or the keyless harness can settle.
- Rung fat-finger guard: DIA `get-value "STX/USD"` on `SP1G48FZ4Y7JY8G2Z0N51QTCYGBQ6F4J43J77BQC0.dia-oracle`. **Verified on mainnet 2026-11-07**: `{value: u34054277, timestamp: 1794098532622}` ($0.3405, 8 dp, ms timestamp, same post as BTC/USD, ~6 min old), so no TODO. DIA has no `USDC/USD` key (returns 0): the guard assumes USDCx = $1, as sbtc-usdcx does. Guard = +/-20% (`GUARD_BPS u2000`), u0 when DIA is >2h stale (u7200), refreshed on push or by anyone via `refresh-guard`.
- USDCx = USDC is assumed; a bridge depeg is handled by pausing the market (keeper).

Audit fixes from sbtc-usdcx carried over unchanged: per-pool DLMM bin step (#1), 2h DIA staleness (#3), `sub0` at the three balance-minus-accounting sites per rung (#4, `local` / `gained` / `free`), permissionless `refresh-guard` (#2 operational answer).

## Router: Bitflow DLMM STX/USDCx pools (mainnet, read 2026-11-07)

`dlmm-core-v-1-1 get-pool-by-id` 1..19 lists five stx-usdcx pools, all `status true`, all x = `token-stx-v-1-2`, y = `usdcx`, core = `dlmm-core-v-1-1`, fees 25 + 25 bps both sides:

| id | pool | bin step | USDCx | STX | router slot |
|---|---|---|---|---|---|
| 3 | `dlmm-pool-stx-usdcx-v-1-bps-10` | 10 | 1,297,337 | 590,422 | 1 |
| 4 | `dlmm-pool-stx-usdcx-v-1-bps-4` | 4 | 149 | 0.0002 | 2 |
| 5 | `dlmm-pool-stx-usdcx-v-1-bps-1` | 1 | 49 | 0.000001 | 3 |
| 14 | `dlmm-pool-stx-usdcx-v-2-bps-10` | 10 | 9 | 0.00001 | - |
| 19 | `dlmm-pool-stx-usdcx-v-3-bps-10` | 10 | 0 | 2.0 | - |

The router keeps three slots; picked the three deepest (3, 4, 5), which also covers three different bin steps. `get-bin-factors-by-step` returns 1001 factors for steps 1, 4 and 10. Pools 4/5 hold dust and fail the 1% depth filter today, so in practice every DLMM leg goes to pool 3 (active bin 218 -> $0.3416 at read time, matches DIA).

## Verification (2026-11-07, uncommitted sources)

- `clarinet check --manifest-path Clarinet-stx-usdcx.toml`: 3 contracts checked (core, ladder, market), 0 errors, 89 warnings. Remote state pinned at block `9318170` (the height the sbtc-usdcx manifest caches; a fresh height hung on Hiro remote fetches). No unresolved `pyth-lazer-decoder-v1` warning on this run. New warnings vs sbtc-usdcx are the expected unused x-side trait / asset-name bindings (`t`, `tt`, `tx-trait`, `asset-name`, `tx-name`), the same shape as the sbtc-stx market's unused y-side trait.
- The rungs, dispatch, relay, settle-batch and router bind the market / ladder by the full `SPV9K21...` principal, which is not on chain, so they are not in the manifest. Checked instead with a throwaway copy (outside the repo) that rewrites those two principals to `.name`: 10 contracts checked, 0 errors.
- `clarinet format --check`: ladder, both rungs, dispatch, relay, settle-batch, router clean. The market is not (the sbtc-usdcx market source is not either, ~7.8k line drift in both; its deploy bytes were formatted separately).
- stxer, `node simulations/verify-stx-usdcx-suite.mjs`, keyless: **75/75** [85eaf95c](https://stxer.xyz/simulations/mainnet/85eaf95c49d938d850daf19846ca0d12) (block 9438906+). Covers deploy order, x/y pins (u1013 for sBTC as x, STX as y, sBTC trait on deposit), ladder side mapping + seats, DIA STX/USD guard (cap / floor), router DLMM-only legs both ways (100 STX -> 33.97 USDCx vs DIA 34.05; 30 USDCx -> 87.42 STX), xyk / Velar u3003, smart-swap thresholds at 6/6 dp (fills at DIA -/+3%, sells / buys nothing at 2x / 0.5x), dispatch deposits (USDCx live on y, STX escrowed as x pendings, 1500 STX in the market), positional trait keys, [1, 45] and [1, 7] updates rejected u1023, USDCx partial withdraw, STX withdraw while pending -> u7012 without an update, no router residue.
- **Not run**: settle-batch, Jing book takers, claims and STX withdraws after settle. They need a signed [45, 7] Lazer update; the harness runs them when `PYTH_API_KEY` is set (code written, never executed).

## Open questions

1. Lazer [45, 7] backend pair (see Pricing) — blocks settle, book takers and the keyed harness.
2. Router pool slots: 3 / 4 / 5 by depth today. If Bitflow migrates liquidity to v-2 (14) or v-3 (19) the router does not see it; a redeploy would be needed.
3. Pin feed ids 45 / 7 in `initialize` code? sbtc-usdcx keeps them as arguments; pinning would make a mistyped init impossible.
4. Trait keys are positional (`sbtc` = STX here). Fine for the contracts; the BE templates / indexer must map by role.
5. Market mins (1 STX / 1 USDCx suggested) and the rung band set (1, 10 ... 90 per side as in sbtc-usdcx?).
6. Market operator after init: deployer or keep the multisig (sbtc-usdcx kept the multisig).
