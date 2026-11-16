# STX/USDCx set: the v6-3 / v6-rungs suites on the stx-usdcx bytes

Set B of the v6-5 regression. This mirrors `README-v6-5-coverage.md`, section "Regression: the v6-3 suites on the v6-5 bytes", but uses the STX/USDCx set in `contracts/stx-usdcx/` instead of the sBTC/STX v6-5 set. Each suite is ported to a `-stx-usdcx.mjs` copy. The original suites and the shared helpers are unchanged.

## Setup

- The set is not on mainnet. Every suite deploys it on a stxer fork at the tip (2026-11-16, around block 9,504,1xx), from repo source with whole-line `;;` comments stripped, as the Jing deployer `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22`.
- `jing-core-v6` and `jing-rung-deposit-trait` are the live contracts and are not redeployed. The core owner is the multisig `SM1N7VX04M1TT23KD7YHVD6H6413QV2ZNJFTWVF9P`, so each market copy is set up the same way:
  1. DEP calls `set-operator(multisig)`.
  2. The multisig calls `set-verified-contract`, then `initialize(market, token-stx-v-1-2, usdcx, min-x, min-y, u45, u7)`.
  3. The multisig hands the operator back with `set-operator(DEP)`.

  Any core admin call that a suite makes as DEP is made as the multisig instead. The ladder is fresh, so DEP owns it.
- Lazer prints are `[45, 7]` (STX/USD, USDC/USD) from the faktory-dao route `pair=stx-usdcx`. `mid = px * 1e8 / py` came out at about 26,400,000 ($0.264/STX) during the runs.
- Units: both tokens have 6 decimals, and `y = x * price / 1e8`; sBTC/STX uses `/ 1e10`. Every amount, mid, minimum and dust level was rederived:
  - Mins default to 1 STX / 1 USDCx.
  - `capacity`, `router-impact` and `swap-walk` use min-x 10 STX. That keeps one x-min worth a few y-mins, as 1000 sats was, which their cross-side remainder cases need.
- Shared constants are in `_stx-usdcx-v6-common.mjs`. `_v6-submit-settle-stx-usdcx.mjs` is a copy of `_v6-submit-settle.js` with feeds `[45,7]` and a parameterised clock contract.
- Ladder sides are mapped by role, not by name:
  - x (rests STX) is `sel-band` / `jing-sell-stx-usdc-<bps>` / dispatch `*-sell`.
  - y (rests USDCx) is `buy-band` / `jing-buy-stx-usdc-<bps>` / dispatch `*-buy`.
  - Rung trait keys are positional: `sbtc` means x (uSTX) and `stx` means y (uUSDCx).

## Results

| Suite | Result | Sim |
|---|---:|---|
| `verify-v6-3-submit-settle-lazer-stx-usdcx.mjs` | 911/911 | [024f881a](https://stxer.xyz/simulations/mainnet/024f881a50dc44527a5dca4bb446d157) |
| `verify-v6-3-full-side-stx-usdcx.mjs` | 930/930 | [7527cd08](https://stxer.xyz/simulations/mainnet/7527cd08714a902f1b8fdf9fe04ac620) |
| `verify-v6-3-capacity-stx-usdcx.mjs` | 506/506 | [fb4e7e01](https://stxer.xyz/simulations/mainnet/fb4e7e0132686be207d1314e657f6e51) |
| `verify-v6-3-router-impact-stx-usdcx.mjs` (router v5-5 and v6, x and y) | 454/454 | [1098488d](https://stxer.xyz/simulations/mainnet/1098488d29f41d0e4295a0eab6fb3412), [41d72432](https://stxer.xyz/simulations/mainnet/41d72432604ab3c75623bab38fc8dacf), [f5601d51](https://stxer.xyz/simulations/mainnet/f5601d51901f54273ba39acdd9496a2c), [7a4cadad](https://stxer.xyz/simulations/mainnet/7a4cadad84ab42f9d75ba6c6fff0a1aa) |
| `verify-v6-3-swap-walk-stx-usdcx.mjs` | 406/406 | [469ee3d0](https://stxer.xyz/simulations/mainnet/469ee3d073de65ea33e19d849d64d851) |
| `verify-v6-3-reachable-gaps-stx-usdcx.mjs` | 389/389 | [26b327f4](https://stxer.xyz/simulations/mainnet/26b327f42e01cbff414a0e0b38636ce4) |
| `verify-v6-3-settlement-edges-stx-usdcx.mjs` | 387/387 | [c62dee52](https://stxer.xyz/simulations/mainnet/c62dee52bbe978e223f1ae351505a71f) |
| `verify-v6-3-ghost-deposit-stx-usdcx.mjs` (patched) | 347/347 | [0d31b1d3](https://stxer.xyz/simulations/mainnet/0d31b1d3ea9a502f8f137bc17b417ac2) |
| `verify-v6-3-gate-blind-band-stx-usdcx.mjs` | 345/345 | [f494cac6](https://stxer.xyz/simulations/mainnet/f494cac6ea1111127c9d45b632e64604) |
| `verify-v6-3-dispatch-stx-usdcx.mjs` (dispatch) | 228/228 | [87d3719a](https://stxer.xyz/simulations/mainnet/87d3719a9393f2a53ef1bd6cae68c6da) |
| `verify-v6-3-dispatch-stx-usdcx.mjs` `RELAY=1` (relay) | 228/228 | [2fc66038](https://stxer.xyz/simulations/mainnet/2fc6603818c61960a27454edab1cce1e) |
| `verify-v6-3-cancel-orphan-pending-stx-usdcx.mjs` (patched) | 231/231 | [d7f28d19](https://stxer.xyz/simulations/mainnet/d7f28d19c836db8faff7af19b47153a4) |
| `verify-v6-3-switched-off-ask-stx-usdcx.mjs` (patched) | 225/225 | [b031e14a](https://stxer.xyz/simulations/mainnet/b031e14aa41a6e43cdafef802271cac7) |
| `verify-v6-3-caller-impact-stx-usdcx.mjs` | 88/88 | [8529cbc3](https://stxer.xyz/simulations/mainnet/8529cbc3b24b254dc98b3a3090437a8f) |
| `verify-v6-3-settle-newer-limit-stx-usdcx.mjs` (patched) | 188/188 | [6e6e7f06](https://stxer.xyz/simulations/mainnet/6e6e7f06bac05fce297ad32cc74acb91) |
| `verify-v6-rungs-escrow-timeout-stx-usdcx.mjs` | 199/199 | [a28b8b12](https://stxer.xyz/simulations/mainnet/a28b8b12b2a1ccf94aebec6b6cc13ea2) |
| `verify-v6-rungs-replace-keyless-stx-usdcx.mjs` | 254/254 | [92bb2568](https://stxer.xyz/simulations/mainnet/92bb256882c89e4cea78202d93ad3364) |
| `verify-v6-rungs-miner-band-lazer-stx-usdcx.mjs` (DIA guard) | 227/227 | [6646a363](https://stxer.xyz/simulations/mainnet/6646a3635214ea2579fc701ffa57699b) |
| `verify-v6-rungs-audit-tail-stx-usdcx.mjs` (x, y) | 186/186 | [240ee298](https://stxer.xyz/simulations/mainnet/240ee298b70cb713d34919b40dfb9d02), [a44f955f](https://stxer.xyz/simulations/mainnet/a44f955f439390ea306696892c5b8bb7) |
| `verify-v6-rungs-push-lazer-stx-usdcx.mjs` | 69/69 | [d59345bd](https://stxer.xyz/simulations/mainnet/d59345bda2f3123b9af3bbd7fb09b47c) |
| `verify-v6-rungs-fill-lazer-stx-usdcx.mjs` | 67/67 | [d3200528](https://stxer.xyz/simulations/mainnet/d32005283e25ed35c0d9813530633d6a) |
| `verify-v6-rungs-keyless-stx-usdcx.mjs` `RUNG=x` / `RUNG=y` | 43/43, 43/43 | [be30f583](https://stxer.xyz/simulations/mainnet/be30f58360b314e911a4aa7e90fb31b7), [a1b064d5](https://stxer.xyz/simulations/mainnet/a1b064d5c6c4de6959f40017b104587d) |
| `verify-stx-usdcx-suite.mjs` (set harness, keyed: settle-batch, router takers, claims) | 100/100 | [2eda8c1f](https://stxer.xyz/simulations/mainnet/2eda8c1f2579bf949e125c1109b36306) |

Total: **6,951 / 6,951** checks from the ported v6-3 / v6-rungs suites. With the set harness, which is the only suite that drives `jing-settle-batch-stx-usdcx`, the total is **7,051 / 7,051**. No contract change was needed and there is no contract finding.

Counts differ from the v6-5 table for two reasons:
- The setup is different: an owner check, the operator handoff around each `initialize`, and no core deploy.
- Some checks are N/A (listed below).

Harness fixes made during porting. None of them was a contract issue.
- **`escrow-timeout`:** in the first run, 9 checks expected A's own exit to touch the pending escrow. Rungs in the core-spread-v1 lineage, which includes the STX/USDCx templates, pay an exit from live + held first and only reach the escrow past that. The original suite ran the older pre-v1 rungs, which always settle the escrow. The paused-u1007, 86,399s-u7012 and 24h-recovery exits now go to B, whose claim is the pending top-up. The number of checks and their intent are the same.
- **`fill`:** the original expected the rolled bid's event limit to be the rung's own price, which is right for a fixed rung. A band rung reports `clearing * (1 - spread)`, so the expectation was changed. That market code is identical to v6-5 apart from whitespace.
- **stxer "failed to get block info" at the newest tip:** harnesses retry the sim start, or fork at tip minus 3.

## N/A, with reasons

- **Fixed-price and market-spread (peg) rungs:** the STX/USDCx set has band rungs only (`jing-{sell,buy}-stx-usdc-<bps>`). This affects:
  - `verify-v6-rungs-keyless.js` `RUNG=buy-peg` / `sell-peg` (42 + 42 checks).
  - The fixed/peg iterations in `push-lazer` (about 55 checks).
  - The fixed/peg makers in `fill-lazer` F5 (about 18 checks).
  - The fixed/peg rung fixtures in `escrow-timeout` (12 of 18 fixtures).
  - The fixed/peg rungs in `caller-impact` (about 60 checks).

  In `dispatch`, the role the original gave fixed/peg rungs (registered, but not a seated band of that side, so u7104 / u7108) is played by an unseated band rung and by the opposite side's band rung.
- **`keyless`:**
  - The zero-padded name check ("300-05") is N/A because band rung names carry no price.
  - "guard 0 -> u7008" is N/A because the guard comes from DIA, not from an argument.
- **`router-impact` pre-submit/settle baseline:** no STX/USDCx market source predates submit + settle. The original's "matches baseline" comparison is replaced by router v6 vs router v5-5 at the same block and Lazer print: identical results and wallets, with `zest-in` / `zest-out` = u0.
- **xyk / Velar router legs:** removed from the STX/USDCx routers (u3003). The original router-impact already sent 0 to them, so no check was lost.
- **`prefix` modes** of `ghost-deposit`, `switched-off-ask` and `cancel-orphan-pending`: not run, as in v6-5.
- **Not runnable, as in v6-5:**
  - `verify-v6-3-errors-admin.js`, `verify-v6-3-capacity-hint.js` and `verify-v6-3-router-bin-boundary.js` replay stxer sims that are no longer served.
  - `verify-v6-3-oracle-feeds.js` needs a Pyth Pro key.
- **Known open item, not chased:** router v6 Zest dust fill.

Miner band: the sBTC/STX band rungs' fat-finger band comes from the RFQ native price (/2, x2). Here it comes from DIA STX/USD (+/-20%, u0 when older than 2h). The behaviour is equivalent: the guard is stored on the first push, used as the order limit, and refreshed by `refresh-guard`. So `miner-band-lazer` is ported in full, not marked N/A. `replace-keyless` R12 points the DIA literal at a one-line mock, the same design as the original's RFQ mock, because DIA is stale after the 435 synthetic burn blocks.

## Byte hashes (SHA-256 of the comment-stripped deployed source)

| Contract | Bytes | SHA-256 |
|---|---:|---|
| `markets-stx-usdcx-jing-v6-4` | 97,888 | `999ef9f83723c99b0d34260b07489d904c31a34b9e32be38d715bbef16b8a65e` |
| `swap-router-stx-usdcx-jing-v5-5` | 27,555 | `2c9362c058450a938b3d458c073295058d44c3f95185dee4d35168a2a0d395e7` |
| `swap-router-stx-usdcx-jing-v6` | 34,823 | `0c7718a1a8f32c7a9a95d97b165a0958f360658546120190e25ed8a1460955fb` |
| `jing-ladder-stx-usdcx-v1` | 11,739 | `54586cf7dc8d65b2a9a75dfe63c29da43a5b0393f845fdce38341bb984ed6094` |
| `jing-ladder-dispatch-stx-usdcx` | 9,298 | `0b43e1b315685f485e71ca402512f5475ca086e5c51e59b3782f78d0052205c6` |
| `jing-ladder-dispatch-stx-usdcx-relay` | 9,057 | `d51b1c9ede6ce63a6c5a3b3167ec6f9c4eacfe20970568ec962b51d2cf2fc418` |
| `jing-settle-batch-stx-usdcx` | 3,020 | `7ed163b22d1ff4a3822093ea2587b3e6321b2bd481082c66f18e5f6e144d9c83` |
| `jing-buy-stx-usdc-bps` (every `jing-buy-stx-usdc-<bps>`) | 22,955 | `b10ceb7efaf268a127dd277b255776b3b356741f0ad6570ef7714c2fa3ea4684` |
| `jing-sell-stx-usdc-bps` (every `jing-sell-stx-usdc-<bps>`) | 24,103 | `25806bbe94d8d04cf39496f1c43f9fd397cde11a76f03ca26f6bf8b66fd70793` |

## Logic diff: `markets-stx-usdcx-jing-v6-4` vs `markets-sbtc-stx-jing-v6-5`

This is a token-level diff of the comment-stripped sources, so formatting is ignored. The function list is identical.

1. **Token x is native STX.** Every x move is `stx-transfer?` / `as-contract? ((with-stx ..))`. In v6-5, x moves are `contract-call? <trait> transfer` / `with-ft (contract-of t) asset-name`. The x trait and asset-name arguments stay in the ABI but are only compared to `token-x` (u1013); the asset-name is unused.
2. **Token y is USDCx.** Every y move is `contract-call? USDCX transfer .. none` / `with-ft USDCX "usdcx-token"`. In v6-5, y moves are native `stx-transfer?` / `with-stx`.
3. **`DECIMAL_FACTOR` is `u1`, was `u100`.** Every conversion is `y = x * price / 1e8`. It is used only through `PRICE_PRECISION * DECIMAL_FACTOR`.
4. **`initialize` pins `x = token-stx-v-1-2` and `y = usdcx`.** Anything else is `ERR_WRONG_TRAIT` u1013. This adds the constants `WSTX`, `USDCX`, `USDCX_NAME`; v6-5 pins nothing.
5. **The market binds `.jing-ladder-stx-usdcx-v1`** instead of `.jing-ladder-v1`. That ladder is `jing-ladder-v1` with its sides swapped by name: `is-band-x` = "sel-band", `is-band-y` = "buy-band", and the fixed sides are renamed "sel-stx" / "sel-peg". By role the logic is the same.

There is no v6-4 vs v6-5 gap. The stx-usdcx "v6-4" already carries the v6-5 change: `set-max-staleness` (40..80 s), `set-settle-max-staleness` (20..40 s) and `ERR_BAD_STALENESS` u1034. So no v6-5 suite tests behaviour this market lacks.

Around the market, by role:
- **Rungs:** DIA STX/USD +/-20% guard instead of the RFQ native price. On the USDCx-proceeds side they add `proceeds-debt` / `get-deficit` / u7017 / `sub0`. The STX rung has `SOLD_OUT_DUST` u10000 and `MIN_DEPOSIT` u100000.
- **Routers:** DLMM stx-usdcx pools 3/4/5 only, xyk/Velar removed (u3003), `PRICE_SCALE` 1e8. v6 adds the Zest CLMM leg.
