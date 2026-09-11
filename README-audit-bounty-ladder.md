# Audit bounty review: jing-ladder, pooled rungs and vault v5 (Sept 2026)

AIBTC bounty `mts7e7jcabac446e3f0e`, 21,000 sats, posted 2026-09-08, source
only, pre-deploy. Scope: `contracts/jing-ladder.clar`, `jing-buy-stx.clar`,
`jing-sell-stx.clar`, `vault-sbtc-stx-v5.clar` at master `745f3a2`+. All four
bind the LIVE pair deployed 2026-09-08 under
`SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22`: `markets-sbtc-stx-jing-v5`,
`swap-router-sbtc-stx-jing-v4`, ledger `jing-core-v4`. Market and router were
audited in the previous bounty (`README-audit-bounty-lazer-v4.md`) and were
out of scope.

Seven submissions so far: Celestial Shark, Watchful Node, Sonic Mast, Digital
Sprite, Proud Haven, Stable Troll, Celestial Mast. Each finding
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
| 7 | Proud Haven | Partial withdraws burn too few shares once the index is under 1; 98 x `withdraw(u1)` takes 98 sats from a 66-sat position, the rest of the pool pays | yes | HIGH | **Fixed**: the share burn rounds up (section 7). Novel, mainnet-fork PoC, first to report. |
| 7b | Stable Troll | Same finding, one day later, no PoC | yes | HIGH | Duplicate of 7. |
| 8 | Digital Sprite | Vault owner checks use `tx-sender`: an owner who calls an attacker's contract lets it call `set-owner-pubkey` / `set-keeper` and take over signing | no | HIGH | **Rejected, proxy class.** Needs the owner to sign a call into a hostile contract first; the owner only calls the vault from the known front end. Withdrawals pay the immutable OWNER either way. |
| 8b | Celestial Mast | Same on `jing-ladder`: `propose-owner` / `set-canonical` through a proxy the owner calls | no | HIGH | Same class as 8, rejected. |
| 6b | Sonic Mast | Rung `initialize` cannot run in clarinet simnet (`principal-destruct?` errs on ST principals) | yes | tooling | **Skipped on purpose.** Rungs are tested on stxer mainnet forks and mainnet-flavoured clarinet, where SP principals destruct fine. |

Leading submission: **Proud Haven** (7), the only HIGH that holds, novel,
first, with a mainnet-fork PoC; Watchful Node (5) second. Bounty closes
2026-09-22. The bounty stays open until 2026-09-22; entries filed after 2026-09-08 are reviewed the same way and the winner is picked, accepted and paid from `SP3EKD9…` then.

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

## 7. Partial withdraw: the share burn rounds up

Claim (Proud Haven, 2026-09-09; Stable Troll, 2026-09-10): after a partial
fill a member can withdraw more than their entitlement by splitting the
withdrawal into 1-sat pieces, and the shortfall is socialised to the other
members at the next `sync`.

Code: `withdraw` in `jing-buy-stx.clar` (mirrored line for line in
`jing-sell-stx.clar`, only the asset differs). A partial withdraw pays the
member exactly `amount` and burns `shares-out` shares. The burn was

```clarity
(/ (* amount SCALE) fi)
```

Clarity's `/` rounds down. While `fi` (the unfilled index) is `SCALE`, one
share is one sat and the division is exact. After a fill `fi` drops below
`SCALE`, one share is worth less than a sat, and the rounding starts to fall
in the withdrawer's favour on every call.

Worked example, the numbers from the PoC. `SCALE` = 1,000,000,000,000.
A 500-of-1500 fill leaves `fi` = 666,666,666,666, so a share is worth
0.667 sat. Member A holds 100 shares, entitlement 66 sats, and calls
`withdraw u1`:

```
old:  1 * SCALE / fi            = 1.5  -> rounds down to 1 share burned
      1 share is worth 0.667 sat, A is paid 1 sat: A is up 0.333 per call
      98 calls: A receives 98 sats on a 66-sat position; B's shares now
      map to 32 sats less than they should

new:  (1 * SCALE + fi - 1) / fi = 2.499 -> rounds down to 2 shares burned
      2 shares are worth 1.333 sat, A is paid 1 sat: the 0.333 stays in
      the pool
      50 calls empty A's position: A receives 50 sats, B's 1400 shares
      still map to exactly 933 = 1400 * fi / SCALE
```

The fix is the integer ceiling, `ceil(a / b)` written as `(a + b - 1) / b`:

```clarity
(/ (+ (* amount SCALE) (- fi u1)) fi)
```

The invariant it restores: shares burned times value per share is never
below the sats paid out. Rounding dust now always lands in the pool, never
with the withdrawer. Exact divisions give the same answer as before, so
the index-1 harness cases are unchanged. The partial branch only runs while
`amount` is below the member's entitlement, and the ceiling then always
lands at least one share short of their balance, so the subtraction cannot
underflow; the index can only be zero when the entitlement is zero too,
which routes to the full-exit branch, so `fi - 1` cannot underflow either.
The one visible cost is self-inflicted: a member who splits a 66-sat exit
into 1-sat calls at `fi` = 2/3 forfeits 16 sats to the pool; `withdraw u66`
pays exactly 66.

Same fix on `jing-sell-stx.clar`. The rung code hash changed again: the
ladder's canonical must point at the new deploy.

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
- Proxy / confused deputy (8, 8b): the precondition is the owner signing a
  transaction into a contract they do not know, which is the same trust
  failure as handing over the key. Admin calls come from the known front
  end. Not accepted as a finding; `contract-caller` on the four admin
  asserts stays an option if that ever changes.

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
| vault v5 parked order (fix 5) | 131/131 | `1fad866e001080ea09b7c46b21edb29c` |
| buy rung, fix 1 + 2 + 7 | 30/30 | `683b826045d945ec6b052b3d59fcdc93` |
| sell rung, fix 1 + 2 + 7 | 31/31 | `9d154998c66767b69a9a88bf1ee93dbc` |
| buy rung, withdraw rounding (fix 7) | 108/108 | `c11027620ffcdf00e7e2e727502af4a5` |

```bash
npm run verify:rungs-buy
npm run verify:rungs-sell
PYTH_API_KEY=... npm run verify:vault-v5-parked
npm run verify:rung-rounding
```

Not covered by the keyless harness: fills (need a taker update) and the
parking path for rungs.

The vault fix has its own fork harness with a REAL Lazer update:
`simulations/verify-vault-sbtc-stx-v5-parked.js` (`PYTH_API_KEY=...`). It
clears the live book, deploys vault v5 as is under a throwaway owner
(chavita verifies it in jing-core-v4 on the fork), rests a 20k-sat ask at
+20%, checks set-limit on the LIVE order (amount 0 -> u6006, wrong -> u6022,
right -> retargeted), then PARKS the vault for real: 49 fillers rest closer
asks so the book holds 50, and a 50th newcomer with an in-range ask and a
fresh update parks the farthest ask, the vault's (live 0, parked 20k). On
the parked order: amount 0 -> u6006 and the limit is untouched (this is the
finding; before the fix it passed), amount = parked -> ok and the limit
moves, reprice -> market u1005, keeper cancel brings the 20k home.

| Run | Result | Simulation |
|-----|--------|------------|
| vault v5 parked order | 131/131 | `1fad866e001080ea09b7c46b21edb29c` |

`simulations/verify-rung-withdraw-rounding.js` (from Proud Haven's PoC, mock
market with a `simulate-fill-x` entry point, no key needed) deploys the ladder
and the buy rung on a fork, fills 500 of 1500 sats so the index sits at 2/3,
then has a 100-share member call `withdraw u1` 98 times. Asserts the fixed
behaviour: the first 50 calls pay 1 sat each, the 51st fails u7006 (position
gone), the member received no more than the 66-sat entitlement, and the
remaining member's pooled sats equal shares * index. Buy side only: the mock
has no y side, and the sell rung's withdraw is the same code.

## Before deploy

- The rung code hash changed twice in this batch: the ladder's canonical for
  each side must point at the new deploy before any rung can register.
- Vault v5 is not deployed; it ships with the fix.
