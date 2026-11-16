# v6-5 redeploy sets: stxer fork coverage (2026-11-16)

Scope: the SetDev-fix redeploy sets at master `ff93627`:

- **sBTC/STX:** `markets-sbtc-stx-jing-v6-5`, `swap-router-sbtc-stx-jing-v5-6`, `jing-settle-batch-v2`, and `jing-{buy,sell}-stx-rung-v3` (deployed as `jing-{buy,sell}-stx-<bps>-v2`).
- **sBTC/USDCx:** `markets-sbtc-usdcx-jing-v6-5`, `swap-router-sbtc-usdcx-jing-v5-6`, `jing-settle-batch-sbtc-usdcx-v2`, and `jing-{buy,sell}-sbtc-bps-v2` (deployed as `jing-{buy,sell}-sbtc-<bps>-v2`).
- **STX/USDCx:** `markets-stx-usdcx-jing-v6-4` and routers v5-5 / v6. These names are not on mainnet yet.

The new code covered:
- **Read cut:** `drop-x` / `drop-y` now use `index-of?` + `slice?` + `concat`.
- **Staleness variables:** `settle-max-staleness` (range 20..40, default 40) and `max-staleness` (range 40..80, default 80). Both are set by the operator; a value out of range fails with `u1034`.
- **`get-taker-rebate-bps-for`**, and the routers that size with it.
- **Rungs:** the DIA guard and the F-01 proceeds debt.

Every market is deployed with whole-line `;;` comments stripped.

## Round 1: rerun on current sources

| Harness | Covers | Result | Sim |
|---|---|---:|---|
| `verify-sbtc-usdcx-suite.mjs` | whole sbtc-usdcx folder (v6-4 names) deployed by a fresh sim address (`_sim-deployer.mjs`, own core-v6), ladder, DIA guard, dispatch, settle-batch, router takers, claims, withdraws | 74/74 | [7153c9cd](https://stxer.xyz/simulations/mainnet/7153c9cdc7370d242defdf3797b7667e) |
| `verify-sbtc-usdcx-v6-4.mjs` | the market alone: makers, [1,7] settle, [1,45] rejected (u1023), takers both ways | 26/26 | [dcd5f7ec](https://stxer.xyz/simulations/mainnet/dcd5f7ec4739f7f94725ed131345ea52) |
| `verify-router-sbtc-usdcx-v5-5.mjs` | router: DLMM only, Jing + DLMM split, disabled venues (A2 bound now relative to the mid) | 43/43 | [3263a598](https://stxer.xyz/simulations/mainnet/3263a59810a69433b49f7720988341c1) |
| `verify-stx-usdcx-suite.mjs` (keyless) | stx-usdcx folder without a [45,7] print | 75/75 | [3e1da3b2](https://stxer.xyz/simulations/mainnet/3e1da3b2de8a061825823729a842a46a) |
| `verify-router-stx-usdcx-v6-zest.mjs` | Zest CLMM venue; DLMM pools get a >= 0 PC on the deny-mode USDCx->STX smart swap | 106/106 | [bd2c1a32](https://stxer.xyz/simulations/mainnet/bd2c1a32c537bc8e1d58e2ece7bad4ca) |
| `verify-sbtc-stx-v6-5-set.mjs` (new) | sbtc-stx v6-5 set on live core/ladder/dispatch; staleness checks on a fork pinned 45..70 s after a print | 105/105 | [63dde96a](https://stxer.xyz/simulations/mainnet/63dde96a50fd36b5aee11f81345cbbe8) |

### Retired

These harnesses drive the live v6-4 set or rebuild old bytes, and the chain has moved on since they were written.

| Harness | Last run | Why retired |
|---|---|---|
| `verify-settle-batch.mjs` | 14/20 [d5cb8468](https://stxer.xyz/simulations/mainnet/d5cb8468f45df0f345d617882e7db28d) | **Live state moved on.** It runs the deployed `jing-settle-batch` v1 against live v6-4 rungs. Its seller's `deposit-sell` now fails with `(err u1)` (STX transfer), and the live pending orders have changed (`u1030`). `jing-settle-batch-v2` / `-sbtc-usdcx-v2` are covered by the set harnesses below. |
| `verify-ladder-1bps-swap.js` | 0/1 [979afd75](https://stxer.xyz/simulations/mainnet/979afd7553e5b30749a3ae548e55aa52) | **One-time migration proof.** Its starting condition (`jing-buy-stx-0` resting an ask) is gone, and `jing-buy-stx-1` is live. |
| `verify-router-v5-5-xyk-status.js` | did not run (0/0) | **Old bytes.** It rebuilds v5-5 from the v5-4 template plus two hunks and stops with "built v5-5 bytes != repo v5-5 code". Repo v5-5 changed in `1ba00aa` (it now calls `get-taker-rebate-bps-for`), and live `markets-sbtc-stx-jing-v6-4` does not export that function. The XYK status gate is carried into v5-6, covered below. |

## Round 2: read cut, sBTC/USDCx v6-5 set, F-01

| Harness | Covers | Result | Sim |
|---|---|---:|---|
| `verify-sbtc-stx-v6-5-drop.mjs` | Read cut on market v6-5 (details below) | 171/171 | [1b59a9fb](https://stxer.xyz/simulations/mainnet/1b59a9fbcd811266ce39bf92868dbb71) |
| `verify-sbtc-stx-v6-5-set.mjs` | Round 1 set checks, plus reprice-or-swap: a 52 s print fails `u1002` at max-staleness 40; at 80 it is stored as a pending limit and settled | 114/114 | [b9336180](https://stxer.xyz/simulations/mainnet/b9336180343c9ad377bf113613ddda1a) |
| `verify-sbtc-usdcx-v6-5-set.mjs` | New sBTC/USDCx set as SPV9 on live core / ladder / dispatch (details below) | 279/279 | [9edbedf8](https://stxer.xyz/simulations/mainnet/9edbedf884877c8fc347dd655c85062f) |

What `verify-sbtc-stx-v6-5-drop.mjs` covers:
- **Direct calls:** `drop-x` / `drop-y` run through the simulator's eval in the market contract. Lists mix standard and contract principals. Cases: first, middle, last, only, absent, empty, and a 50-entry list (first, last, middle, absent, first then last).
- **Ask side:** an absent cancel returns `u1005` and leaves the list unchanged. Then: cancel first and middle; a rung's full withdraw; a full fill by a router taker; cancel the only entry. Survivors still fill and claim.
- **Bid side:** a swapper is appended and dropped; the first entry (a rung) is fully filled; cancel last; a rung's full withdraw; cancel first of two.
- **Settlement roll:** a swap settles the cycle and the resting makers roll to the next cycle in the same order. Only the filled taker stays in the settled cycle's list.
- **Full bid list:** 40 standard makers with 10 seats reserved. A newcomer parks one maker, the rest keep their order. Then cancel first, last and middle.

What `verify-sbtc-usdcx-v6-5-set.mjs` covers:
- staleness setters;
- the same read-cut cases as the sBTC/STX harness, on bands 30/40;
- the suite flow on bands 10/20/50;
- staleness on the pinned fork (settle `u1003`; swap ok at 80, `u1002` at 40; rebate getter = 20 + age − 30);
- **F-01 on band 60.** The sell rung's USDCx proceeds are burned through Circle's governance multisig `SM1Z6…`, which grants a burner the mint role. The buy rung's sBTC proceeds are burned through the sBTC signer principal, which registers the burner as a protocol contract. Checked:
  - the deficit equals the amount seized, and deposits fail with `u7017`;
  - first come first served, each member is paid min(owed, cash);
  - the per-member debts sum to the amount seized, and inputs are returned;
  - after a refill the debts are claimed, a second claim fails with `u7006`, and the rung reopens.

## Round 3: keyed STX/USDCx, broad regression on v6-5 bytes

### STX/USDCx with a signed [45,7] print

faktory-dao `fd293b18` serves `pair=stx-usdcx` (feeds [45,7]). `_lazer.js` `fetchLazerUpdateAny(ids)` now picks the pair from the feed ids and checks the ids it gets back.

| Harness | Covers | Result | Sim |
|---|---|---:|---|
| `verify-stx-usdcx-suite.mjs` (keyed is the default now; `KEYLESS=1` for the old mode) | adds settle-batch, pegs at mid ±50 bps, router book takers both ways, claims, withdraws | 100/100 | [702686cc](https://stxer.xyz/simulations/mainnet/702686cc05a4441f4754ab9cb82b6a8a) |
| `verify-router-stx-usdcx-v6-zest.mjs` (new keyed group) | the Jing book leg fills before Zest / DLMM in both directions; taker and maker deltas; router holds nothing | 126/127 | [798f3dfa](https://stxer.xyz/simulations/mainnet/798f3dfa90181b604c5b80a5de866ded) |

One open failure in the Zest harness, check 76. The smart swap is USDCx to STX with the limit inside DLMM and past Zest, and no update. The router sent **4 uUSDCx to Zest for 4 uSTX**: the receipt shows `zest-in u4, zest-out u4`. That is far worse than the limit; at the limit, 4 uUSDCx should buy about 14.9 uSTX. The harness rule only exempts fills of 2 units or less. The keyed group shows the same kind of dust fill (`zest-in u2, zest-out u2`).
- **Cause:** Zest's partial fill rounds per bin, at most a few micro-units per swap.
- **Not drift:** it passed on the previous fork state and fails on this one.
- **Status:** left failing as a finding for review (Info, dust).

### Regression: the v6-3 suites on the v6-5 bytes

`_v6-5-redirect.mjs` is a preload: `node --import ./simulations/_v6-5-redirect.mjs simulations/<suite>`. It:
- serves `markets-sbtc-stx-jing-v6-5.clar` (stripped) wherever a suite reads `markets-sbtc-stx-jing-v6-3.clar`;
- serves `swap-router-sbtc-stx-jing-v5-6.clar` for `...v5-3.clar`, with its market principal written back to the v6-3 name, so the suite still binds it;
- pins the fork at 9210800, the block before `jing-core-v6` / `jing-ladder-v1` were deployed. The suites deploy both from source as SPV9, the owner.

`V65_PIN=9296400` (the last block where SPV9 still owned the live pair) is used for the two suites that call the live core. The suites themselves are not edited. Every log below shows the redirect line.

| Suite | Result | Sim |
|---|---:|---|
| `verify-v6-3-submit-settle-lazer.js` (`V65_PIN=9296400`) | 898/898 | [f0bc3f32](https://stxer.xyz/simulations/mainnet/f0bc3f324d85dc0b8f3bb3bb3fa03aec) |
| `verify-v6-3-full-side.js` | 921/921 | [41a65d40](https://stxer.xyz/simulations/mainnet/41a65d407f7d5b000babc6a4eb6a8276) |
| `verify-v6-3-capacity.js` | 473/473 | [ad5ae9d7](https://stxer.xyz/simulations/mainnet/ad5ae9d72dda63b41b05a547adb80136) |
| `verify-v6-3-router-impact.js` (router v5-6) | 398/398 | [04e5accb](https://stxer.xyz/simulations/mainnet/04e5accb7950c5b987d787124574eef3), [069a5d8a](https://stxer.xyz/simulations/mainnet/069a5d8afc2f2a8cd2cf6a4d2d50cd5c), [618fd155](https://stxer.xyz/simulations/mainnet/618fd155767df46ada1c425dd4cbb389), [98b17f71](https://stxer.xyz/simulations/mainnet/98b17f7194a04e59212065f0ca797684) |
| `verify-v6-3-swap-walk.js` | 383/383 | [6b8143ad](https://stxer.xyz/simulations/mainnet/6b8143ad2d8809d54257086734fdae90) |
| `verify-v6-3-reachable-gaps.js` | 382/382 | [6e4e1bb4](https://stxer.xyz/simulations/mainnet/6e4e1bb455801e1f2b75fbdafe3e90f4) |
| `verify-v6-3-settlement-edges.js` | 365/365 | [ac34f79a](https://stxer.xyz/simulations/mainnet/ac34f79adadbe9d4f8c5a016b8e6595f) |
| `verify-v6-3-ghost-deposit.js patched` | 343/343 | [f4d9de9d](https://stxer.xyz/simulations/mainnet/f4d9de9d9fd9af97af56a39762e15a0d) |
| `verify-v6-3-gate-blind-band.js` | 332/332 | [e783dfdf](https://stxer.xyz/simulations/mainnet/e783dfdf6db67ff9f298ba67050046a4) |
| `verify-v6-3-dispatch.js` | 228/228 | [709e94ba](https://stxer.xyz/simulations/mainnet/709e94bab17fea930155aa8f7d58a399) |
| `verify-v6-3-cancel-orphan-pending.js patched` | 225/225 | [f911b1a9](https://stxer.xyz/simulations/mainnet/f911b1a94ce8885736db8aec7cd62505) |
| `verify-v6-3-switched-off-ask.js patched` | 221/221 | [8e66ae7f](https://stxer.xyz/simulations/mainnet/8e66ae7f3dacc64c0d51a64221772447) |
| `verify-v6-3-caller-impact.js` | 198/198 | [49aec149](https://stxer.xyz/simulations/mainnet/49aec1490956b538b55ef3cf2c40e0ba) |
| `verify-v6-3-settle-newer-limit.js patched` (`V65_PIN=9296400`) | 183/183 | [e2459df6](https://stxer.xyz/simulations/mainnet/e2459df65d288ca4d4809474ed0f1954) |
| `verify-v6-rungs-escrow-timeout.js` | 549/549 | [f06e2deb](https://stxer.xyz/simulations/mainnet/f06e2deb04b826c9cc7468fbb9abfae7) |
| `verify-v6-rungs-replace-keyless.js` | 250/250 | [4543468e](https://stxer.xyz/simulations/mainnet/4543468e11e4bc53494df6ded16ed849) |
| `verify-v6-rungs-miner-band-lazer.js` | 225/225 | [598c3565](https://stxer.xyz/simulations/mainnet/598c3565a5dac8f821530dbd6c2732c0) |
| `verify-v6-rungs-audit-tail.js` | 182/182 | [d17b3744](https://stxer.xyz/simulations/mainnet/d17b3744f99b4264ca90b16ffe341fb6), [07df914a](https://stxer.xyz/simulations/mainnet/07df914a1b234e7bfb03f709fcbe2e4a) |
| `verify-v6-rungs-push-lazer.js` | 124/124 | [8d28b735](https://stxer.xyz/simulations/mainnet/8d28b735f96bc525dbf3a94c5231f6ca) |
| `verify-v6-rungs-fill-lazer.js` | 85/85 | [299bb86c](https://stxer.xyz/simulations/mainnet/299bb86c37439debd0414a722d106401) |
| `verify-v6-rungs-keyless.js` `RUNG=buy` / `sell` / `buy-peg` / `sell-peg` | 39/39, 39/39, 42/42, 42/42 | [c41ce6d3](https://stxer.xyz/simulations/mainnet/c41ce6d367ced1fc937e8c8a6880afc5), [2117021d](https://stxer.xyz/simulations/mainnet/2117021d4ca1d43c527f4b62e031c34e), [6c6e9837](https://stxer.xyz/simulations/mainnet/6c6e983797a6bedf6af78c3adb6d2ece), [7df5dfde](https://stxer.xyz/simulations/mainnet/7df5dfdefdc2a9bcec7e93898d497391) |

Total: **7,127 / 7,127** checks on the v6-5 market bytes (router v5-6 where a suite uses the router). No contract change was needed.

Notes:
- **`prefix` modes not run.** `ghost-deposit`, `switched-off-ask` and `cancel-orphan-pending` also have a `prefix` mode, which deploys the historical pre-fix market as a comparison. Those old bytes no longer link against the current `jing-core-v6` source ("expecting 11 arguments, got 10"), so only the `patched` mode is the proof here, as the suites' own headers say.
- **The rung suites deploy their own rungs.** The core-spread v1 rungs are bound to the market name they deploy. `rung-v3` (rung-v2 plus `NAME_SUFFIX "-v2"`, no logic change) is covered by the set harnesses above.

Not runnable now:
- **`verify-v6-3-errors-admin.js` and `verify-v6-3-capacity-hint.js`:** both replay signed, malformed and stale Lazer updates from stxer sim `c014c741`. stxer no longer serves that sim: `GET /devtools/v2/simulations/c014c741…` returns 400 "failed to read metadata". The keyless route cannot sign those shapes (single feed, no confidence, no feed timestamp).
- **`verify-v6-3-router-bin-boundary.js`:** it replays sim `1ac1ad53`, which stxer also no longer serves.
- **`verify-v6-3-oracle-feeds.js`:** it needs other feed ids, which require a Pyth Pro key.
- **The pre-v6-3 suites** (`verify-markets-v6-*`, `verify-v6-peg-*`, `verify-v6-ten-band-deployed-lazer.js` and others bound to `markets-sbtc-stx-jing-v6`) target the market from before submit + settle and are out of scope, as in `README-v6-3-coverage.md`.
