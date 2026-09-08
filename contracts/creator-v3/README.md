# creator-escrow-v3

Same contract as [`../creator-v2`](../creator-v2/README.md) with one rule
added: **a round counts as closed once its whole budget is paid out.**

## Why

2026-09-08: round 3 on `creator-escrow-v2-jing` had all 4 slots released
($50 of $50) but 409 burn blocks (~2.8 days) of its fixed 4200-block window
left. `start-round` for round 4 aborted with `ERR_ROUND_ACTIVE (u103)`
because v2 only treats a round as over by height. Nothing can happen in a
round once `paid-out == deposited` (submit / amend fail `ERR_OVER_CAPACITY`,
release has no funds), so the wait was pure dead time.

## What changed

```clarity
(define-private (is-round-closed (round-data {...}) (now uint))
  (or (>= now (get ends-at round-data))
      (is-eq (get paid-out round-data) (get deposited round-data))))
```

- `start-round`: previous round must satisfy `is-round-closed` AND have
  `pending == u0` (was: `now >= ends-at` AND `pending == u0`).
- `sweep`: `is-round-closed` (was: `now >= ends-at`). Sweeping an exhausted
  round refunds `u0` and just flags it `swept`.

Everything else (review window 288, claim grace 288, round 4200, smart-wallet
payouts, amend / approve flow, error codes, events) is byte-for-byte v2.

## Verification

`npx tsx simulations/verify-creator-escrow-v3.js` -- the full v2 scenario
(31 checks) plus 16 checks for the new path: 47/47 on a stxer mainnet fork.
Commented draft: `f4f3acc52c3785110b132c5a54be73a5`; final comment-free
formatted bytes (what deploys): `12588b66ec96af51ab520fe18a08a287`.

## Deploy

`SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.creator-escrow-v3-jing` via
faktory-dao `POST /api/bot/deploy-contract {"contractName":"creator-escrow-v3-jing"}`
(Clarity 4, account 0 so OWNER = deployer, same as v1/v2). The `.clar` is
comment-free and `clarinet format`ed; deployed bytes == repo bytes verbatim.

## Off-chain side tables

v3 restarts round / delivery ids at 1 again. Instead of renaming tables like
v1 -> v2 did, `creator_briefs` / `creator_deliveries` carry a `version`
column (migration `0087_creator_escrow_version.sql`); the API takes `?v=2`
for the archived v2 rounds and defaults to the current contract.

`creator-bonus-jing` is bound to the v2 escrow; bonuses are disabled on the
frontend for v3 deliveries until a bonus contract bound to v3 is deployed.
