# Audit bounty review: jing-ladder + jing-buy-stx / jing-sell-stx + vault-sbtc-stx-v5

Bounty `mts7e7jcabac446e3f0e` (21k sats, source only, none deployed). Three
submissions: Celestial Shark, Watchful Node, Sonic Mast. Findings are
decompiled one at a time against the source at 745f3a2+ and verdicts are
recorded here with the fix (if any) and how it was verified.

## Harness

`simulations/verify-rungs-keyless.js` (`SIDE=buy|sell`) runs the ladder and
one rung of each side on a stxer mainnet fork against the LIVE
`markets-sbtc-stx-jing-v5`, with no Pyth key: it cancels the live makers on
the opposite side first, so rung deposits carry price u0 and skip the Lazer
classification. Covers ladder gating, held-vs-pushed deposits, the operator
raising the market minimum mid-flight, partial withdraw, whole-cancel, full
exit, second-member shares, proceeds via a gift + claim. Fills and parking
need a taker update (Pyth key) and are not covered.

```bash
npm run verify:rungs-buy    # 30/30  https://stxer.xyz/simulations/mainnet/5d5c8b4412974a5f0ee633e093040efa
npm run verify:rungs-sell   # 31/31  https://stxer.xyz/simulations/mainnet/722f9f6b16ee7ea2703781879394e9d0
```

## 1. D1/D2 MIN_MARKET bounce (Celestial Shark, filed Medium) -> not a vector, hardened

Claim: a withdrawal can pull the whole pool off the market and a griefer can
keep everyone's sats idle by repeating deposit/withdraw.

Code: `pull-to-held-sats` (`jing-buy-stx.clar`, `withdraw` path). The
whole-cancel branch only runs when what would REMAIN on the market is under
the market minimum (1000 sats / 1 STX), so the idle amount is dust by
construction. A small member can never reach the branch; the next deposit of
any size pushes the dust back. Severity: by design.

Hardening taken: the rung hardcoded `MIN_MARKET`, while the market's minimum
is a data var the operator can raise (`set-min-token-x/y-deposit`). A raise
above the constant would have made the partial-withdraw branch call the
market with a remainder it rejects (u1004) and every partial withdrawal
abort. `MIN_MARKET` is replaced by `(min-market)`, a read-only that reads
`get-min-deposits` live. Note the literal principal inside it: the node's
read-only analysis rejects a `contract-call?` through a constant there
(clarinet accepts it, mainnet does not -- first fork run failed to deploy).
Verified: fork raises the min to 5000, a 1000 deposit is held instead of
pushed, 4000 more pushes 5000, partial withdraw keeps 5600 live, the next
withdraw trips the whole-cancel and holds 4600 (both harness links above).

## 2. F1 parked position blocks member exit (Celestial Shark, filed Medium) -> wrong, and backwards

Claim: when the market parks the rung, `withdraw-token-x` fails and members
cannot exit until readmitted.

Code: `markets-sbtc-stx-jing-v5.clar` `withdraw-token-x` (1044-1094) reads
`have = live if live > 0 else parked` and writes the remainder back to
`token-x-parked` (1086); `cancel-token-x-deposit` (942-992) refunds the
parked balance when live is 0. The rung's `pull-to-held-sats` therefore
works on a parked position, and `market-size` already counts parked.
Members CAN exit a parked rung.

What is true instead: a parked rung blocks DEPOSITS. `deposit-token-x`
asserts `get-token-x-parked == 0` (line 879, `ERR_PARKED u1021`), and the
rung's `deposit` calls it whenever the push reaches the minimum, so every
member deposit aborts while parked until anyone calls the market's
permissionless `readmit-token-x`. Fix: see the next commit
(`readmit-if-parked` in `deposit`).
