# Coverage plan: bounty mv7dfb deploy set

Date: 2026-10-14. Nothing here is deployed. What was measured: the exact deploy
bytes in `simulations/deploy-bytes-mv7dfb/`. These are the faktory-dao
`77d9ba48` templates and the partner files at their final commits (ccd015 and
ccd016 have full-line comments dropped, which is the form every ccd016 harness
deploys). A sim counts for a contract only where it deployed byte-identical
code.

Tool: `node simulations/coverage-mv7dfb.mjs` runs `trace-coverage-multi.mjs`. It
uses the sims in `fixtures/coverage-mv7dfb-sims.txt` plus the deploy-set fixture,
and writes one `TRACE-COVERAGE-mv7dfb-<name>.md` per contract and a
`TRACE-COVERAGE-mv7dfb-summary.json`.

## How the existing suites were made to count

- `_use-deploy-bytes.mjs` is a `node --import` preload. Any read of a
  `contracts/.../<name>.clar` that has a deploy-bytes file returns that file, so
  the existing harnesses deploy the final bytes without being edited.
- `STXER_TRACE=1`: the juicestx and Fast Pool batch harnesses set `skipTracing:
  true`. They had no traces and counted for nothing.
- `REAL_POOL=1` (pillar `simul-juice-autostake-safe.js`): the harness used to
  swap the pool name inside the safe source. It now deploys the real
  `juice-pool-sbtc-signer`.
- `@stacks/transactions` 7.4.0 to 7.6.0 in jing-contracts-v3. 7.4.0 has no
  `ClarityVersion.Clarity6`, so every "Clarity 6" deploy in the harnesses went
  out unversioned (see Findings), and the coverage tool could not decode
  version-6 deploys.

## Result (111 sims)

| contract | public fns reached | branch nodes full / partial / never | expressions |
|---|---|---|---|
| jing-core-v6 | 65/65 | 82 / 0 / 0 | 567/1178 |
| jing-ladder-v1 | 14/14 | 24 / 0 / 0 | 247/473 |
| markets-sbtc-stx-jing-v6-3 | 32/32 | 301 / 6 / 0 | 3221/4456 |
| swap-router-sbtc-stx-jing-v5-3 | 4/4 | 117 / 5 / 1 | 887/1318 |
| jing-buy-stx-core-spread-v1 (10 rungs) | 8/8 | 57 / 5 / 0 | 650/928 |
| jing-sell-stx-core-spread-v1 (10 rungs) | 8/8 | 57 / 5 / 0 | 649/929 |
| jing-ladder-dispatch | 6/6 | 20 / 0 / 0 | 240/380 |
| juice-pool-sbtc-signer | 37/37 | 50 / 3 / 0 | 756/1243 |
| juice-sbtc-autoswap | 19/19 | 68 / 0 / 0 | 574/933 |
| juice-autostake-safe | 27/27 | 112 / 1 / 0 | 1042/1588 |
| juice-autostake-safe-auth-helpers-v1 | (read-only only) | none | 14/24 |
| fastpool-swap-vault | 19/19 | 67 / 1 / 0 | 571/933 |
| signer-manager-vault-stx-rewards | 30/30 | 34 / 6 / 0 | 653/1023 |
| ccd015-redemption-book-mia-stx | 9/9 | 29 / 1 / 0 | 355/564 |
| ccd016-swap-vault-mia-v2 | 22/22 | 48 / 0 / 0 | 552/895 |

The expression totals include read-only functions and top-level definitions. A
read-only function called from an Eval step leaves no trace. One that is called
by a transaction does leave a trace, so `verify-coverage-mv7dfb-gaps.js` sweeps
the read-only functions by transaction.

## What remains, ranked by risk

Each arm below either moves no funds, or cannot be reached from the deployed
callers. The reason is given for each.

| # | contract : line (fn) | arm not taken | risk | reason / where it could be covered |
|---|---|---|---|---|
| 1 | pool 898 (settle-one) | pox-5 claim err | low (read path of `pox-settle-stakers`; moves no funds) | pox-5 `claim-staker-rewards-for-signer` answers `(ok u0)` for unknown stakers, future cycles and bond indexes (all three probed in gaps). Unreachable without a pox-5 error state |
| 2 | pool 755, 1121 (pay-one, pay-recovered-sbtc-one) | total-shares = 0 | low (guard) | A pot exists only after a claim, and a claim needs signer shares > 0. Defensive |
| 3 | signer 868, 872 (compute-due) | total-shares = 0 | low (guard) | Pinning requires local = pox-5 pending shares, and both are > 0 once rewards exist. Defensive |
| 4 | signer 961 (pay-stacker) | sBTC gross > 0, net 0 | low | Distribution passes fee u0, so net = gross. Unreachable |
| 5 | signer 1166, 1206 (sweeps) | balance < reserved | low (guard) | Only reachable if the books broke. Defensive |
| 6 | signer 225 (mirror-stake-for-cycle) | stake into a pinned cycle | low | Only past cycles get pinned, and a stake only mirrors future cycles. An Eval fixture reached it, but Eval leaves no trace |
| 7 | safe 167 (pay-gas-accounted) | zero gas fee | low | The live gas station always charges (pillar ops harness header) |
| 8 | market 3009, 3050 (walk-*-book-step) | `match acc` err arm | low | Short-circuit after an earlier step erred. No step returns err on reachable input |
| 9 | market 3605/3609, 3700/3704 (distribute-to-*) | total = 0 | low (guard) | Distribution runs only on a side with deposits |
| 10 | router 109/118 (xyk-swap) | `x-is-sbtc` false | low | The bound XYK pool has x = sBTC (constant). Unreachable with this pool |
| 11 | router 687 (cp-split) | total = 0 | low | Reached only when residual <= total, so total = 0 means residual = 0, and that is never split |
| 12 | router 807/812 (dlmm-out) | bin step != 15, active bin < 29 | low | All three bound pools are bps-15, and the active bins are far from 0 |
| 13 | router 954 (dlmm-enabled) | pool id unknown | low | The ids are constants of live pools |
| 14 | rungs 211/213, 670-679, 794/793 | epoch-reserve none, reserve clamps, no pending escrow in settle-escrow | medium-low (rung accounting) | Reachable in principle: a rung claim after the epoch reserve was deleted, and settle-escrow with nothing pending. **Open**: add to `verify-v6-rungs-*` (no funds move on these arms) |
| 15 | fastpool vault 807, autoswap (get-clock) | batch-start arm | none (read-only) | Covered for autoswap by tx. The fastpool sweep ran while idle. Open, cosmetic |
| 16 | ccd015 242 (calculate-par) | supply or treasury = 0 | low | Mainnet state has both > 0 |
| 17 | ccd015 settle-step (taken = 0) | not a branch node | low | Needs more than 1 uSTX per micro-MIA, which `at-or-below-par` forbids while par < 1 (it is about 0.006) |

Not reachable on a fork:

- The rfq-sbtc-stx-jing-v2-3 native price (the vault fallback when DIA is
  stale) after any `AdvanceBlocks`: stxer answers `BlockingError`, because it has
  no burn-chain data for synthetic blocks. Covered at the fork tip by
  `verify-coverage-mv7dfb-fastpool.js` (second session, 20/20).
- Pyth governance setting the oracle fee: no governance VAA can be signed. The
  oracle `fee` var is set by Eval, labelled as a fixture.

## Findings (report, no contract change)

1. **jing-core-v6 `register` has no `tx-sender == contract-owner` check.**
   `contracts/JING-CORE-DESIGN.md` (threat table) says it does. On the fork, a
   stranger registered a contract whose hash matched a verified entry
   (`verify-coverage-mv7dfb-gaps.js`, check "FINDING"). Today the gate sits in
   the callers: market `initialize` is operator-gated, and the rungs check the
   ladder owner. But anyone can deploy a byte-identical copy of a verified
   contract, register it, and then call every `log-*` (prints and equity
   ledgers under the copy's own principal). Funds are not at risk, but indexers
   that trust core events can be spoofed. Decide: restore the owner check, or
   fix the design doc.
2. **Clarity 6 rows.** stacks.js 7.4.0 (jing-contracts-v3, juicestx, pillar,
   citycoins) has no `ClarityVersion.Clarity6`, so harness deploys of the
   Clarity 6 contracts were unversioned. The node ran them at its epoch default:
   the safe's `(with-pox)` compiled, so the default was Clarity 6. The faktory-dao
   BE (7.6.0) sends version 6 explicitly. The deploy set was rerun with version 6
   (340/340, `de9bd7b8`). Upgrade the other repos before trusting new Clarity 6
   sims.
3. `vault-allowance-proof-stxer.mjs` (juicestx) finds the allowance terms by a
   text pattern over the commented source. It cannot run on the formatted
   deploy bytes. Its result stands on the repo source only.
4. juicestx `pool-vault-stx-stxer.mjs --lifecycle` failed once on the traced
   rerun (`d4af4cc8`). The other 21 juice runs passed. Likely fork drift; not
   investigated.

## Sims added for coverage (all on the deploy bytes)

| harness | result | sim |
|---|---|---|
| jing-contracts-v3 `verify-deploy-set-mv7dfb.js` | 340/340 | `de9bd7b8`, earlier `5cf1573f` |
| jing-contracts-v3 `verify-coverage-mv7dfb-gaps.js` | 455/455 | `692f5727` |
| jing-contracts-v3 `verify-coverage-mv7dfb-ccd015.js` | 183/183 | `78d08113` |
| jing-contracts-v3 `verify-coverage-mv7dfb-fastpool.js` | 154/154 + 20/20 | `d55a9bb0`, `da59d087` |
| pillar `simul-juice-autostake-safe.js` REAL_POOL=1 | 83/83 | `75074c83` |
| pillar `simul-juice-autostake-safe-ops-coverage.js` | 204/204 | `b6fd12bd` |
| pillar `simul-juice-autostake-safe-stake-passkey.js` | 43/43 | `6fd87036` |
| every existing Jing, juicestx, Fast Pool and ccd016 suite, rerun with the preload | see `fixtures/coverage-mv7dfb-sims.txt` | 100 sims |
