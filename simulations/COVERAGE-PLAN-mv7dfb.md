# Coverage plan: bounty mv7dfb deploy set

Date: 2026-10-14. Nothing here is deployed. What was measured: the exact deploy
bytes in `simulations/deploy-bytes-mv7dfb/`. These are the faktory-dao
`77d9ba48` templates (the pool since `459fa786`: juicestx `570226c`, 34,134 B,
sha256 `a0a28431...ca56195a`) and the partner files at their final commits (ccd015 and
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

## Result (114 sims)

| contract | public fns reached | branch nodes full / partial / never | expressions |
|---|---|---|---|
| jing-core-v6 | 65/65 | 82 / 0 / 0 | 567/1178 |
| jing-ladder-v1 | 14/14 | 24 / 0 / 0 | 247/473 |
| markets-sbtc-stx-jing-v6-3 | 32/32 | 303 / 4 / 0 | 3223/4456 |
| swap-router-sbtc-stx-jing-v5-3 | 4/4 | 118 / 4 / 1 | 887/1318 |
| jing-buy-stx-core-spread-v1 (10 rungs) | 8/8 | 58 / 4 / 0 | 651/928 |
| jing-sell-stx-core-spread-v1 (10 rungs) | 8/8 | 58 / 4 / 0 | 650/929 |
| jing-ladder-dispatch | 6/6 | 20 / 0 / 0 | 240/380 |
| juice-pool-sbtc-signer (570226c bytes, 33 sims) | 37/37 | 52 / 2 / 0 | 765/1250 |
| juice-sbtc-autoswap | 19/19 | 68 / 0 / 0 | 574/933 |
| juice-autostake-safe | 27/27 | 113 / 0 / 0 | 1042/1588 |
| juice-autostake-safe-auth-helpers-v1 | (read-only only) | none | 14/24 |
| fastpool-swap-vault | 19/19 | 68 / 0 / 0 | 574/933 |
| signer-manager-vault-stx-rewards | 30/30 | 36 / 4 / 0 | 653/1023 |
| ccd015-redemption-book-mia-stx | 9/9 | 29 / 1 / 0 | 355/564 |
| ccd016-swap-vault-mia-v2 | 22/22 | 48 / 0 / 0 | 552/895 |

Pool re-measure (2026-10-14, juicestx `570226c` zero-seat guard): every
harness that deploys the pool was rerun on the new bytes with the preload
(deploy set `20c42862`, gaps `234ae5bc`, gaps2 `fb581245`, Fast Pool
`4577cbf2` + `f959481d`, 22 juicestx runs, 3 pillar runs; all green; ids in
`fixtures/coverage-mv7dfb-sims.txt`). Was 758/1243, 51 / 2 / 0 on `fa8c48a`
bytes (35 sims). The new `(is-eq amount u0)` branch in `take-og-seat` (line
316) shows both arms, but the zero arm is credited only by the refused
0-uSTX probe in og-shrink `3abedcde`: the VM ran it, then the node's lock
check (`PoxInvalidLockAmount`) aborted the tx. No fork sim commits a zero
seat drop; the unit tests and RV pin that effect. The two partial arms are
unchanged (pay-one 761, pay-recovered-sbtc-one 1127; item 9 below).

The expression totals include read-only functions and top-level definitions. A
read-only function called from an Eval step leaves no trace. One that is called
by a transaction does leave a trace, so `verify-coverage-mv7dfb-gaps.js` sweeps
the read-only functions by transaction.

## Closed in the second gap pass (`verify-coverage-mv7dfb-gaps2.js`, pillar F)

All with real fork state. The only Eval fixture is the PoX reward map for the
Fast Pool cycle, as in every pool suite.

| contract : line (fn) | arm | how it is reached |
|---|---|---|
| rungs 211/213 (epoch-payout) | no reserve row | `epoch-payout` called by tx on an epoch with no row (a future epoch, or one closed by the last withdraw) |
| market 3009 (walk-x-book-step), 3050 (walk-y-book-step) | `match acc` err | A swap that names a wrong asset (`tx-name` is not checked). Limit-violating makers roll before the settle, so the settle moves no sBTC. The walk then crosses two resting makers. The first fill's `as-contract?` allowance does not cover the real sBTC asset, so it errs with u128, and the second step takes the err arm. The swap reverts and nothing moves |
| router 812 (dlmm-out) | active bin < 29 | DLMM v-3 holds no sBTC. 253 swaps of 1 uSTX on its empty bins walk the active bin from -222 to -475 (no transfer on an empty bin). 3,000,000 sats are added at bin -477, then a smart STX -> sBTC swap quotes v-3 (ok, 506359 sats out) |
| pool 898 (settle-one) | pox-5 claim err | A signer manager whose `validate-stake!` calls `pox-settle-stakers`. pox-5 sets `signer-manager-call-active` around that callback, so `claim-staker-rewards-for-signer` errs (u103 settle-failed). The stake still goes through. This is harmless: the call only fails |
| safe 167 (pay-gas-accounted) | fee 0 | The gas trait is not allow-listed, so a gas station that charges nothing is a valid choice. The pillar ops harness, section F (208/208) |
| fastpool vault 807 (get-clock) | batch open | `get-clock` by tx after `jing-place` |
| signer 868/872 (compute-due) | total-shares 0 | `get-stacker-rewards` by tx on a cycle that was never claimed |

## What remains: proven unreachable

None of these arms can be taken from the deployed callers on any real state.
The reason is given for each, with code references (deploy-bytes line numbers).

| # | contract : line (fn) | arm | why it cannot be taken |
|---|---|---|---|
| 1 | rungs 670/669 (count-reserve-claim) | reserve row missing | Invariant: for each closed epoch e, the number of positions with epoch e equals `epoch-reserve[e].left`, and the row exists iff that number > 0. `roll-tail` (649) writes `left = members`. `members` counts positions (+1 on a first deposit, 473; -1 on a full withdraw, 573). Every past-epoch position is settled exactly once (`settle-proceeds` deletes it, 747, and decrements the row, 737). The last one deletes the row (671). The other close path, the withdraw at `members = 0` (575), leaves no positions. A roll inside `escrow-for` -> `sync` during a withdraw reverts that withdraw (`pull-to-held-sats` u7007, or the `members`/`total-shares` underflow) |
| 2 | rungs 675/674, 679/678 (count-reserve-claim) | back > reserve, paid > proceeds | Only when `left > 1`; the last claimer takes the whole remainder (epoch-payout `left = 1` arm). `reserve` = the free balance after the cancel (`roll-tail` 638, and `cancel-token-x-deposit` refunds deposit + parked + pending = `market-size`, market 1754-1822). Each claim pays floor(c_i * U / SCALE), where c_i are the carried shares and the sum of c_i is <= `total-shares` (floor of a sum >= sum of floors, also across rescales). `sync` sets U so that floor(T * U / SCALE) <= actual (U is lowered only when actual < recorded). The STX side has the same structure: each pays floor(shares * delta-index / PROCEEDS_SCALE), and the carry is dropped (never paid). A good property for the Rendezvous fuzzing |
| 3 | rungs 794/793 (settle-escrow) | no pending escrow | Called only from `escrow-for` (830) when take > held + on-book. After the `sync` at the start of `withdraw`, held = the local balance and take <= pooled <= actual = held + on-book + pending (`market-size` 305). So with no pending escrow the `<=` arm always wins |
| 4 | market 3605/3609, 3700/3704 (distribute-to-*) | side total = 0 | The fold runs over the listed depositors of a side. `cycle-totals` equals the sum of the listed deposits. Every entry is >= the side minimum > 0 (initialize 3844, setters 3878/3885). Every path that empties an entry deletes it and filters the list (execute-fill 2919-2950, filters 2544-2630, cancels). Even a crossing settle (`or crossing`, 3539) with an empty side folds over an empty list |
| 5 | router 109, 118 (xyk-swap) | x-is-sbtc false | `xyk-x-is-sbtc` (98) reads `x-token` of xyk-pool-sbtc-stx-v-1-1, set only in `create-pool`, which xyk-core-v-1-2 refuses once `pool-created` is true. x = sBTC forever |
| 6 | router 687 (cp-split) | total = 0 | The arm needs residual <= total = 0, so residual = 0. `cp-stage` (1157) returns early on `dust-left` (1097: `left = 0`) |
| 7 | router 807 (dlmm-out) | bin-step != 15 | `bin-step` of a Bitflow DLMM pool is set only in `create-pool` (pool 636), which dlmm-core-v-1-1 refuses once created. All three bound pools are bps-15 |
| 8 | router 954 (dlmm-enabled) | pool id unknown | dlmm-core-v-1-1 never deletes from `pools` (only `map-set`, 417/735/1215). Ids u6/u15/u16 exist |
| 9 | pool 761, 1127 (pay-one, pay-recovered-sbtc-one; 755, 1121 on fa8c48a bytes) | total-shares = 0 | A payable batch exists only after `pox-claim-rewards` claimed > 0 for that cycle. The pool refuses bonds (`validate-stake!`, ERR_BOND_NOT_SUPPORTED), so all rewards are STX-share rewards, and those are 0 with 0 shares. pox-5 changes shares only from current + 1 on (`stake`, `stake-update`, `unstake` -> `remove-staker-from-cycles (+ u1 current-cycle)`), and rewards go to cycles <= current (`calculate-rewards` stx-cycle). So the shares for a rewarded cycle stay > 0 |
| 10 | signer 225 (mirror-stake-for-cycle) | stake into a pinned cycle | Pinned needs a claim (deadline > 0), which needs rewards. Rewards exist only for cycles <= current (as in 9). `validate-stake!` mirrors from `first-index` = current + 1 (pox-5 `stake` 1005, `stake-update` 1117). Bond calls are refused before the fold (269) |
| 11 | signer 961 (pay-stacker) | gross > 0, net 0 | Both distribution paths pass fee-bips u0 (`get-stacker-rewards` 907, `distribute-rewards-many` fold). sbtc-fee = 0, so net = gross |
| 12 | signer 1166, 1206 (sweeps) | balance < reserved | Every change of `unswapped-sats`, `earned-fees` and `unpaid-stx` moves the same amount in or out of the balance: the claim (319, exact pox-5 transfer), the fund (607/608), the finalize (636, asserted equal), the recover (661/662, the vault reports what it sends), the pay (941/959), and `withdraw-fees` (1130). This contract never locks STX |
| 13 | ccd015 242 (calculate-par) | supply or treasury = 0 | Not on a fork: the treasury is 10.24M STX locked in ccd014-pox5-staking-mia until burn 1163750 (fork burn ~971450, and stxer cannot advance ~192k burn blocks). The mining treasury is already 0. Eval cannot unlock STX. MIA supply 0 needs every MIA burned. After the unlock a DAO spend could reach it on mainnet (update-par then answers ERR_PAR_CALCULATION, line 81) |
| 14 | ccd015 settle-step (taken = 0) | not a branch node | Needs more than 1 uSTX per micro-MIA, which `at-or-below-par` forbids while par < 1 (it is about 0.006) |

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
5. Observation, not a bug: the market does not check the `tx-name` / `ty-name`
   asset name that the caller passes against the token. A wrong name only makes
   that caller's own `as-contract?` transfers fail (u128), so the call reverts.
   gaps2 section B uses this to reach the walk err arms.
6. Observation, not a bug: a third-party signer manager can call
   `pox-settle-stakers` from inside pox-5's `validate-stake!` callback. pox-5's
   reentrancy flag makes the settle fail (u103) and nothing changes (gaps2
   section D).

## Sims added for coverage (all on the deploy bytes)

| harness | result | sim |
|---|---|---|
| jing-contracts-v3 `verify-deploy-set-mv7dfb.js` | 340/340 | `de9bd7b8`, earlier `5cf1573f` |
| jing-contracts-v3 `verify-coverage-mv7dfb-gaps.js` | 455/455 | `692f5727` |
| jing-contracts-v3 `verify-coverage-mv7dfb-gaps2.js` | 115/115 | `b8f56b5d` |
| jing-contracts-v3 `verify-coverage-mv7dfb-ccd015.js` | 183/183 | `78d08113` |
| jing-contracts-v3 `verify-coverage-mv7dfb-fastpool.js` | 154/154 + 20/20 | `d55a9bb0`, `da59d087` |
| pillar `simul-juice-autostake-safe.js` REAL_POOL=1 | 83/83 | `75074c83` |
| pillar `simul-juice-autostake-safe-ops-coverage.js` | 204/204, then 208/208 with section F | `b6fd12bd`, `80c3db54` |
| pillar `simul-juice-autostake-safe-stake-passkey.js` | 43/43 | `6fd87036` |
| every existing Jing, juicestx, Fast Pool and ccd016 suite, rerun with the preload | see `fixtures/coverage-mv7dfb-sims.txt` | 100 sims |
