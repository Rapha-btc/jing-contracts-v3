# Audit bounty review: jing-ladder, pooled rungs and vault v5 (Sept 2026)

AIBTC bounty `mts7e7jcabac446e3f0e`, 21,000 sats, posted 2026-09-08, source
only, pre-deploy. Scope: `contracts/jing-ladder.clar`, `jing-buy-stx.clar`,
`jing-sell-stx.clar`, `vault-sbtc-stx-v5.clar` at master `745f3a2`+. All four
bind the LIVE pair deployed 2026-09-08 under
`SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22`: `markets-sbtc-stx-jing-v5`,
`swap-router-sbtc-stx-jing-v4`, ledger `jing-core-v4`. Market and router were
audited in the previous bounty (`README-audit-bounty-lazer-v4.md`) and were
out of scope.

Three submissions: Celestial Shark, Watchful Node, Sonic Mast. Each finding
was decompiled against the source one at a time; verdicts, decisions and
fixes below. Every fix is in the current source on master. None of the four
contracts is deployed yet, so there is nothing to migrate: the next deploy
carries all of it.

## Submissions and verdicts

| # | Submitter | Finding | Holds | Rating filed | Decision |
|---|-----------|---------|-------|--------------|----------|
| 1 | Celestial Shark | D1/D2: repeated small withdrawals pull the whole pool off-market (MIN_MARKET bounce), griefable | no | MEDIUM | Dust by design: the whole-cancel only fires when the remainder would be under the market minimum. **Hardened anyway**: rungs read the market minimum live (`1cc28ef`). |
| 2 | Celestial Shark | F1: a parked rung locks members in until readmitted | no, backwards | MEDIUM | The market's `withdraw-token-x` and `cancel-token-x-deposit` both serve a parked balance, exits work. What parking blocks is **deposits** (u1021). **Fixed**: the rung readmits itself on deposit, else holds (`cd4836d`). |
| 3 | Celestial Shark | G5: keeper can revoke the owner's intents | yes | LOW | **By design, no change.** The keeper already executes every signed intent and reclaims resting orders; revoking one in the owner's interest adds no trust. Worst case the owner re-signs with a new salt. |
| 4 | Celestial Shark | E5: `set-canonical` replaces without an event | no | INFO | `jing-ladder.clar:107` prints `canonical-set`. The trail is on-chain. |
| 5 | Watchful Node | Zero-amount `jing-set-limit` intent reprices a nonzero parked vault order | yes | MEDIUM | **Fixed** (`a811789`). Best submission: novel, reproduced with a clarinet harness, and it broke the one thing the amount binding exists for. |
| 6 | Sonic Mast | Direct sBTC/STX transfer to a rung sits outside the indices, "stuck" | no | INFO | It is a gift, not stuck: `sync` folds the balance into `held-*`, the next deposit pushes it to the market and the proceeds reach members. No change. |
| 6b | Sonic Mast | Rung `initialize` cannot run in clarinet simnet (`principal-destruct?` errs on ST principals) | yes | tooling | **Skipped on purpose.** Rungs are tested on stxer mainnet forks and mainnet-flavoured clarinet, where SP principals destruct fine. |

Leading submission so far: **Watchful Node**. The bounty stays open until 2026-09-22; entries filed after 2026-09-08 are reviewed the same way and the winner is picked, accepted and paid from `SP3EKD9…` then.

## 1. MIN_MARKET bounce: dust by design, minimum now read live

Claim: a member's withdrawal cancels the rung's whole market position and a
griefer can keep everyone's sats idle with deposit/withdraw loops.

Code: `pull-to-held-sats` in `jing-buy-stx.clar`, called by `withdraw`. The
partial branch (`withdraw-token-x gap`) runs whenever the remainder on the
market would stay at or above the minimum; the whole-cancel branch runs only
when it would not. So the amount that ends up held locally is under 1000
sats / 1 STX by construction, a small member can never reach that branch,
and the next deposit of any size pushes the dust back (`to-push = amount +
held`). Not a vector.

What the finding did surface: the rung hardcoded `MIN_MARKET`, while the
market's minimum is a data var the operator can raise
(`set-min-token-x/y-deposit`). A raise above the constant would have made
the partial branch call the market with a remainder it rejects (u1004) and
every partial withdrawal abort. Decision: replace the constant with a
read-only `min-market` that reads `get-min-deposits` from the market. Note
the literal principal inside it: the node's read-only analysis rejects a
`contract-call?` through a constant there (clarinet accepts it, the first
fork run failed to deploy). Same on the sell rung with `min-token-y`.

## 2. Parking blocks deposits, not exits

Claim: when the market parks the rung's deposit, `withdraw-token-x` fails and
members cannot exit until someone readmits.

Code: `markets-sbtc-stx-jing-v5.clar` `withdraw-token-x` (1044-1094) reads
`have = live if live > 0 else parked` and writes the remainder back to
`token-x-parked`; `cancel-token-x-deposit` (942-992) refunds the parked
balance when live is 0; the rung's `market-size` already counts parked.
Members CAN exit a parked rung.

What is true instead: `deposit-token-x` asserts `get-token-x-parked == 0`
(line 879, `ERR_PARKED u1021`), and the rung's `deposit` calls it whenever
the push reaches the minimum. So every member deposit aborted while the rung
was parked, until anyone called the market's permissionless
`readmit-token-x`. Decision: `deposit` pushes only if
`(readmit-if-parked update)` holds. A parked rung tries the readmit first
with the deposit's own `update`; if the book is still full or the update is
stale the readmit errs inside `is-ok`, its state rolls back, and the sats are
held locally instead of the tx aborting. The ladder log's `pushed` flag now
reads from `held-*`. Mirrored on the sell rung. Live and parked can never
coexist for one depositor (deposit asserts parked is zero, reprice needs a
live deposit), so the rung's withdraw path needs no change.

## 5. The signed amount must cover the parked balance

`vault-sbtc-stx-v5.clar` bound the signed amount of a `jing-set-limit`
intent to `resting`, which read only the LIVE deposit
(`get-token-x-deposit`). The market's `set-token-x/y-limit` accepts when
live OR parked is nonzero. Once the book parked the vault's order, `resting`
returned 0 and an owner-signed `amount: u0` intent passed
`ERR_AMOUNT_MISMATCH` and repriced the entire parked position. Side and
price stay signed and the market still rejects a crossing limit, so no funds
could move, but the amount binding was void in exactly the state it exists
for. The FE builds intents from the same live-only read, so it would have
produced zero-amount intents on its own.

Decision: `resting` = live + parked, both sides; `execute-jing-set-limit`
asserts `amount > 0` (`ERR_NO_FUNDS u6006`) before the signature is
consumed, a guard rail so a zero intent fails with the vault's own error
rather than at the market. `execute-jing-reprice` shares `resting` and now
refuses a parked order at the market (reprice needs a live deposit), which
is right.

## Decisions not to change anything

- Keeper revoke (3): the keeper is the executor of everything the owner
  signed and the one who reclaims resting orders; revoking a stale intent
  is part of that job. A hostile keeper can only force a re-sign. Owner
  replaces the keeper with `set-keeper`.
- `set-canonical` (4): prints `canonical-set`; overwriting without a guard is
  the owner blessing a new template. Already-registered rungs keep their
  registration, the hash check runs at `register` only.
- Stray transfers (6): a gift to the current members, both assets, converted
  at the rung price. A gift to an empty rung waits for the first member.
- Simnet `principal-destruct?` (6b): mainnet only testing here.

## Verification

`simulations/verify-rungs-keyless.js` (`SIDE=buy|sell`) deploys the ladder
and one rung per side on a stxer mainnet fork against the LIVE
`markets-sbtc-stx-jing-v5`, with no Pyth key: it cancels the live makers on
the opposite side first, so rung deposits carry price u0 and skip the Lazer
classification. Covers ladder gating (register before canonical u6003,
wrong name u7009, double initialize u7002, stranger), held-vs-pushed
deposits, the operator raising the market minimum mid-flight, partial
withdraw, whole-cancel, full exit with exact payout, second-member shares,
proceeds via a gift + claim, empty pool at the end.

| Run | Result | Simulation |
|-----|--------|------------|
| buy rung, fix 1 | 30/30 | `5d5c8b4412974a5f0ee633e093040efa` |
| sell rung, fix 1 | 31/31 | `722f9f6b16ee7ea2703781879394e9d0` |
| buy rung, fix 1 + 2 | 30/30 | `ef196963e3b605f29bae6625716cc7f7` |
| sell rung, fix 1 + 2 | 31/31 | `02b0d89df9feea63c076fe89ef4b4539` |

```bash
npm run verify:rungs-buy
npm run verify:rungs-sell
```

Not covered by the keyless harness: fills (need a taker update) and the
parking path itself (needs a full book plus classification). The vault v5
fix is clarinet-checked; a v5 vault fork harness with the parked case is
pending a Pyth key session.

## Before deploy

- The rung code hash changed twice in this batch: the ladder's canonical for
  each side must point at the new deploy before any rung can register.
- Vault v5 is not deployed; it ships with the fix.
