# sBTC/USDCx v6-5 set: the v6-3 regression suites, stxer fork coverage (2026-11-16)

This is the sBTC/USDCx counterpart of "Regression: the v6-3 suites on the v6-5 bytes" in `README-v6-5-coverage.md`, which ran the sBTC/STX v6-5 market at 7,127/7,127.

## How the ports run

- **Deploy bytes.** Every contract under test is the exact faktory-dao template bytes, loaded by `_sbtc-usdcx-v6-5-common.mjs`. That loader checks each template's SHA-256 and byte length against its own header before returning it. Hashes are listed below.
- **Live dependencies.** The forks run on the live `jing-core-v6` (owner: multisig `SM1N7…`), `jing-ladder-sbtc-usdcx-v1` and `jing-ladder-dispatch-sbtc-usdcx`. Owner calls are sent as the live owners, read on-chain. `initialize` needs the operator to be the core owner, so each market hands its operator to the core owner, initializes, then takes it back. Those steps are extra checks in every suite.
- **Alt-name markets.** Suites that need several markets deploy the same market bytes under their own names (`fullside-*`, `capacity-*`, `swapwalk-*`, `settle-edge-*`, `gate-*`, `ghost-*`, `orphan-*`, `gaps-*`, `swoff-*`, `mv8wal-newer-*`, ...). The market binds `.jing-core-v6` and `.jing-ladder-sbtc-usdcx-v1` by relative name, so every copy binds the same live pair.
- **Rebound copies.** Rungs, router and batch bound to an alt-name market use the same bytes, with only the hard-coded market principal rewritten (`rebind()`).
- **Fork pin.** `markets-sbtc-usdcx-jing-v6-5` went live on mainnet at block 9504103, with the template's SHA-256. Suites that deploy it under its real name (the rung suites, dispatch, escrow-timeout, router-impact, caller-impact) therefore pin the fork at 9504102. `USDCX_PIN=<height|tip>` overrides the pin. The alt-name suites fork at the tip.
- **Pair parameters.**
  - Tokens: x is sBTC; y is USDCx (`SP120…usdcx`, asset `usdcx-token`, 6 decimals, funded from `SP13JV…J8Q5YMJ` and other holders).
  - Prices: Lazer feeds [1,7] via the faktory-dao route (`pair=sbtc-usdcx`). The mid is the BTC/USD price × 1e8, about 6.53e12 on these runs.
  - Minimums: 1000 sats and 1 USDCx.
- **Rederived amounts.** Every expected amount comes from each suite's own BigInt model at the [1,7] mid, and sizes were re-cut where 1 USDCx is the binding minimum. For example, the 1500-sat counterparts are now the smallest size worth at least 1 USDCx.
- **Side mapping.** STX `buy-stx` (rests x) maps to `jing-sell-sbtc-<bps>-v2` (ladder `sel-band`, `is-band-x`). STX `sell-stx` (rests y) maps to `jing-buy-sbtc-<bps>-v2` (`buy-band`, `is-band-y`).
- **Live ladder starts full.** The live ladder seats 10 band rungs per side. Suites either take existing bps, which replaces the live holders as the set harness does, or have the owner retire the live seats first. Band counts are asserted relative to the live start.

## Results

| Suite | Result | Sim |
|---|---:|---|
| `verify-v6-3-submit-settle-lazer-sbtc-usdcx.mjs` | 910/910 | [702e151f](https://stxer.xyz/simulations/mainnet/702e151f334344327e1290035cd63469) |
| `verify-v6-3-full-side-sbtc-usdcx.mjs` | 949/949 | [5cfb1df4](https://stxer.xyz/simulations/mainnet/5cfb1df4d7374817bd915addea57842c) |
| `verify-v6-3-capacity-sbtc-usdcx.mjs` | 503/503 | [469a449d](https://stxer.xyz/simulations/mainnet/469a449d857e1b7a44380f9d017ee7c3) |
| `verify-v6-3-router-impact-sbtc-usdcx.mjs` (router v5-6) | 402/402 | [561b8fd4](https://stxer.xyz/simulations/mainnet/561b8fd46ad5667312ecf3b44794e61f), [61a0a258](https://stxer.xyz/simulations/mainnet/61a0a258a0813e5e662f7bcd726f092d), [a4525db6](https://stxer.xyz/simulations/mainnet/a4525db6585e9ecf60d8140e5842a214), [3be08d44](https://stxer.xyz/simulations/mainnet/3be08d44900313e2923d4aaaf779c309) |
| `verify-v6-3-swap-walk-sbtc-usdcx.mjs` | 404/404 | [bf028374](https://stxer.xyz/simulations/mainnet/bf028374698593a60f487882c9ab23d2) |
| `verify-v6-3-reachable-gaps-sbtc-usdcx.mjs` | 408/408 | [1540a41b](https://stxer.xyz/simulations/mainnet/1540a41bb951192101dcc9c1c324082b) |
| `verify-v6-3-settlement-edges-sbtc-usdcx.mjs` | 383/383 | [1b436b43](https://stxer.xyz/simulations/mainnet/1b436b4387544def2267110a3c507cc7) |
| `verify-v6-3-ghost-deposit-sbtc-usdcx.mjs` (patched) | 367/367 | [c8a7df95](https://stxer.xyz/simulations/mainnet/c8a7df95f5c4672a1bf96f518a6f2c1e) |
| `verify-v6-3-gate-blind-band-sbtc-usdcx.mjs` | 342/342 | [1bcfec91](https://stxer.xyz/simulations/mainnet/1bcfec91815e80e281fb554238d1998a) |
| `verify-v6-3-dispatch-sbtc-usdcx.mjs` | 202/202 | [95c01157](https://stxer.xyz/simulations/mainnet/95c01157d37a8db266c6b9300ca19413) |
| `verify-v6-3-cancel-orphan-pending-sbtc-usdcx.mjs` (patched) | 231/231 | [f39107c5](https://stxer.xyz/simulations/mainnet/f39107c52450e1f58e27ec48021c72cc) |
| `verify-v6-3-switched-off-ask-sbtc-usdcx.mjs` (patched) | 223/223 | [804fa226](https://stxer.xyz/simulations/mainnet/804fa226a80603b81db284f67f0478aa) |
| `verify-v6-3-caller-impact-sbtc-usdcx.mjs` | 87/87 | [0815572b](https://stxer.xyz/simulations/mainnet/0815572b3b301b88c4e3b12ec5f3fe22) |
| `verify-v6-3-settle-newer-limit-sbtc-usdcx.mjs` (patched) | 187/187 | [6a763108](https://stxer.xyz/simulations/mainnet/6a7631084df65277f8cbb2b3dd8d943f) |
| `verify-v6-rungs-escrow-timeout-sbtc-usdcx.mjs` | 198/198 | [4a0dfd2a](https://stxer.xyz/simulations/mainnet/4a0dfd2ab184d9238c53da999091cdad) |
| `verify-v6-rungs-replace-keyless-sbtc-usdcx.mjs` | 268/268 | [c6161766](https://stxer.xyz/simulations/mainnet/c6161766a780177858c5c2ff40bf5f88) |
| `verify-v6-rungs-miner-band-lazer-sbtc-usdcx.mjs` (DIA guard) | 246/246 | [e51d6af6](https://stxer.xyz/simulations/mainnet/e51d6af6ce949b91ce3b42b566924d45) |
| `verify-v6-rungs-audit-tail-sbtc-usdcx.mjs` x / y | 90/90, 90/90 | [cdec5b87](https://stxer.xyz/simulations/mainnet/cdec5b876c5b5663ac63de1d0cbe5867), [42c18f23](https://stxer.xyz/simulations/mainnet/42c18f230ff7b344afbbaf4aa1f2afed) |
| `verify-v6-rungs-push-lazer-sbtc-usdcx.mjs` | 69/69 | [5e6b494a](https://stxer.xyz/simulations/mainnet/5e6b494a9baf780f34fd21efe42cbfe7) |
| `verify-v6-rungs-fill-lazer-sbtc-usdcx.mjs` | 59/59 | [77aa9285](https://stxer.xyz/simulations/mainnet/77aa928508831bec263d873e88e97564) |
| `verify-v6-rungs-keyless-sbtc-usdcx.mjs` `RUNG=sell` / `buy` | 65/65, 65/65 | [d4bc4eb7](https://stxer.xyz/simulations/mainnet/d4bc4eb73cf580cf48fc1d82242dcb22), [2d01eae1](https://stxer.xyz/simulations/mainnet/2d01eae154c8c143680b7af9afc9c7ff) |

Total: **6,748 / 6,748** checks on the sBTC/USDCx v6-5 bytes. No contract change was needed and no contract finding was made.

Check counts differ from the sBTC/STX run for three reasons:
- the per-market operator handoff adds checks;
- core and ladder are live, so their deploy checks are gone;
- the fixed and peg rung checks have no subject here (see below), which is most of the gap in caller-impact (87 vs 198) and the rung suites.

## Port notes (harness, not contract)

- **Router-impact baseline.** The STX baseline (`f6a6d3a`, before submit/settle) has no sBTC/USDCx counterpart. The baseline here is the live predecessor pair, `markets-sbtc-usdcx-jing-v6-4` + router v5-5, read from the node. Every tuple and wallet snapshot matched the current pair.
- **Escrow-timeout.** The v2 rungs skip the escrow when an exit is covered by what the rung holds plus its live order, so the young/paused refusal and the 24 h recovery run on member B's exit, which does need the escrow. Member A's claim is checked as intact afterwards.
- **Miner-band.** The sBTC/USDCx rungs guard with DIA `BTC/USD`, not the RFQ native price. The guards are floor = DIA × 0.8 (sell-sbtc) and cap = DIA × 1.2 (buy-sbtc), asserted exactly. The DIA bounds are also checked: 7199 s old is live and 7200 s reads 0; 300 s ahead is live and 301 s reads 0; 1e16 is live and 1e16+1 reads 0. With a zero guard, `refresh-guard` returns `u7008` and a deposit is held. Replace-keyless re-posts the DIA value after its 435-block advance instead of mocking the oracle in the rung source.
- **Push stale print.** It is a real [1,7] print with the fork clock 85 s past it. `settle-token-*-deposit` judges against `max-staleness` (80).
- **Price-dependent sizes.** A few swap-walk / settlement-edges sizes sit near the 1 USDCx minimum at BTC ≈ $65k. Below roughly $40–50k they would stop on their own model checks, never pass silently.

## N/A

- **Fixed and peg rungs** (fixed price in the name, `jing-*-market-spread`): sBTC/USDCx has only the bps band rungs. N/A pieces:
  - keyless `RUNG=buy-peg` / `sell-peg`;
  - push's four fixed/peg rungs (ported onto band rungs);
  - fill's fixed rungs (ported onto band rungs at mid ± 90 bps) and F5's fixed/peg rungs (F5 clears one zero-spread band rung);
  - dispatch's "fixed/peg not eligible" `u7104` checks;
  - the fixed-rung blocks of caller-impact and escrow-timeout (caller-impact's core-pause block runs on the band rungs);
  - keyless's zero-padded hundredths name check, replaced by bps-mismatch name cases.
- **`prefix` / `followAll` modes** of ghost-deposit, cancel-orphan-pending, switched-off-ask and settle-newer-limit. They deploy historical pre-fix sBTC/STX market bytes, and there is no pre-fix sBTC/USDCx market. The patched mode is the proof, as in the sBTC/STX regression.
- **`verify-v6-3-errors-admin.js`, `verify-v6-3-capacity-hint.js`, `verify-v6-3-router-bin-boundary.js`:** they replay stxer sims `c014c741` / `1ac1ad53`, which stxer no longer serves, and they are [1,45] signed shapes the keyless route cannot produce. Same status as on sBTC/STX.
- **`verify-v6-3-oracle-feeds.js`:** it needs other feed ids, which require a Pyth Pro key.
- **The pre-v6-3 suites** (`verify-markets-v6-*`, `verify-v6-peg-*`, ...) target the market before submit + settle. Out of scope, as on sBTC/STX.

## Deploy bytes (SHA-256 verified against the template headers)

Templates: `faktory-dao/backend/server/utils/<name>-template.ts` (faktory-dao `88b695ff`, source `f87266d`).

| Contract | Bytes | SHA-256 |
|---|---:|---|
| `markets-sbtc-usdcx-jing-v6-5` | 98566 | `3290d26a0f0fbac86628f579d558e62ad297cf22ecf5310ab49bbae35b040f37` |
| `swap-router-sbtc-usdcx-jing-v5-6` | 27669 | `840ee59165e0dda0f85ebd0e6abe4f44c2b19b56a2fe48aa62c06f378e317bfe` |
| `jing-settle-batch-sbtc-usdcx-v2` | 3022 | `8b9462c603e2570e98669c4165307e386bfead8ebbba68fafd7502af1036487c` |
| `jing-buy-sbtc-bps-v2` | 24444 | `7bdc1256196cfc1d532e4a4ebf346808fa65fc05555b1f807653d96fed2647ee` |
| `jing-sell-sbtc-bps-v2` | 24422 | `1f18a15cd79d620af4754673c3c89842e97b123c56ce5f38238f50358afb7d0c` |

The market template equals the repo source with whole-line `;;` comments stripped. The live mainnet `markets-sbtc-usdcx-jing-v6-5` (block 9504103) carries the same SHA-256.
