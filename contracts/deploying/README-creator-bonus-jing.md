# creator-bonus-jing

Spot rewards on top of `creator-escrow-v2-jing` deliveries. A bonus is
attributed after the fact, to work already accepted and consumed: the owner
can only fund a delivery the escrow shows as RELEASED (approved or review
window elapsed, terms signed, base payment out). The creator then claims it.
The escrow stays the single source of truth for who the creator is and which
wallet gets paid. This contract adds money, never judgement.

- Source: `contracts/deploying/creator-bonus-jing.clar`
- Escrow read: `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.creator-escrow-v2-jing`
- Token: `SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx` (6 decimals)
- Status: draft, unaudited, not deployed. Clarinet check clean, stxer
  mainnet-fork harness 45/45, Rendezvous 500 runs x 4 invariants clean.

## Lifecycle per delivery id

| Call | Who | Precondition | Effect |
|---|---|---|---|
| `fund (delivery-id amount reason)` | owner | escrow delivery status is RELEASED (u1); bonus row missing or still pending | USDCx moves owner -> contract. A second fund on a pending row adds to the same pot and returns the new total. |
| `claim (delivery-id)` | the delivery's creator | bonus pending | Pays the pot to the creator's payout wallet from the escrow round, the same wallet the base payment went to. |
| `revoke (delivery-id)` | owner | bonus pending | Refunds the pot to the owner. Owner's discretion, no escrow state to wait for. Terminal: the row cannot be funded or claimed again. |

Pending, approved, vetoed and expired deliveries cannot be funded at all.
RELEASED is terminal in the escrow, so once a bonus exists the only question
is whether the creator claims it before the owner revokes it.

The creator principal is snapshotted from the escrow at fund time. `claim`
re-reads the escrow delivery only for the creator and payout wallet. It does
not re-check RELEASED: a bonus cannot exist on a delivery that is not
RELEASED, and that status is terminal in the escrow.

## Bonus status

| Value | Meaning |
|---|---|
| u0 | pending |
| u1 | claimed |
| u2 | revoked |

## Errors

| Code | Name | Raised by |
|---|---|---|
| u200 | ERR_NOT_OWNER | fund, revoke |
| u201 | ERR_NOT_CREATOR | claim |
| u202 | ERR_DELIVERY_NOT_FOUND | fund, revoke, claim |
| u203 | ERR_ROUND_NOT_FOUND | claim |
| u204 | ERR_AMOUNT_ZERO | fund |
| u205 | ERR_NO_BONUS | revoke, claim |
| u206 | ERR_BONUS_NOT_PENDING | fund (row claimed or revoked), revoke, claim |
| u207 | ERR_NOT_RELEASED | fund (delivery pending, approved, vetoed or expired) |

## Read-only

- `get-config`: owner, escrow, usdcx.
- `get-bonus (delivery-id)`: the row, or none.
- `get-escrow-delivery (delivery-id)`: passthrough to the escrow.
- `is-claimable (delivery-id)`: true while a funded bonus is unclaimed.
  Funding already required RELEASED, so this is the only gate left.
- `get-balance`: USDCx held by the contract.

## Implementation notes

- `fund` reads the existing row with `map-get?` and uses `default-to` on the
  optional fields: a missing row reads as a pending pot of zero, so first fund
  and top-up share one code path.
- Read-only functions name the escrow and USDCx literally rather than through
  the constant. Clarinet's read-only analysis cannot see through a
  constant-bound `contract-call?` and flags it as a write. The escrow does the
  same in `get-escrow-balance`.
- Clarinet reports an unused constant for the asset name passed to `with-ft`.
  Same false positive the escrow shows.
- `Clarinet.toml` lists the deployed escrow as a requirement so the check can
  resolve `get-delivery` and `get-round`.

## Simulation

`npx tsx simulations/verify-creator-bonus-jing.js`

Forks mainnet, deploys the contract from the USDCx whale
(`SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51`, so it is the bonus owner), and
runs against the real escrow state: deliveries 1-11 exist, d4 is VETOED in a
swept round, d7 and d8 are RELEASED, next id is 12. It covers the fund
guards including fund refused on the vetoed d4, top-up, wrong-creator and
double claim, fund and revoke after claim, owner-discretion revoke with
refund on d7, then advances past round 3, funds the escrow owner, starts
round 4 with the escrow owner impersonated, and shows fund refused on d12
while pending and while approved, accepted after release, then claimed, plus
d13 vetoed and refused. Balance deltas assert the USDCx lands in the
creators' smart wallets and not their operating wallets, and that the
contract ends empty.

Last run: https://stxer.xyz/simulations/mainnet/e87f6dffafe8bfd776d7b697b8a6d219

## Fuzzing (Rendezvous)

```
bash tests/rv/build.sh creator-bonus-jing
npx rv . creator-bonus-jing invariant --runs=500 --bail
```

The fuzz build (see `tests/rv/README.md`) points the contract at a
deterministic mock escrow and the repo's mock token, folds delivery ids into
0..99, and records funded ids so four invariants can scan every row after
each random call: the contract holds exactly the sum of pending pots, every
row sits on a RELEASED delivery for its real creator, claimed pots land in
the payout wallets and nowhere else, and `is-claimable` agrees with the row.
Last sweep: 500 runs, fund x22 / claim x5 / revoke x4 succeeded on random
input, 119-129 checks per invariant, zero failures.
