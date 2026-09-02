# creator-bonus-jing

Spot rewards on top of `creator-escrow-v2-jing` deliveries. The owner picks a
delivery already submitted to the escrow and attaches a USDCx bonus to it. The
creator unlocks that bonus only once the escrow shows the delivery as
RELEASED: accepted, terms signed, base payment consumed. The escrow stays the
single source of truth for who the creator is, which wallet gets paid, and
whether the work was accepted. This contract adds money, never judgement.

- Source: `contracts/deploying/creator-bonus-jing.clar`
- Escrow read: `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.creator-escrow-v2-jing`
- Token: `SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx` (6 decimals)
- Status: draft, unaudited, not deployed. Clarinet check clean, stxer
  mainnet-fork harness 47/47.

## Lifecycle per delivery id

| Call | Who | Precondition | Effect |
|---|---|---|---|
| `fund (delivery-id amount reason)` | owner | delivery exists in the escrow; bonus row missing or still pending | USDCx moves owner -> contract. A second fund on a pending row adds to the same pot and returns the new total. |
| `claim (delivery-id)` | the delivery's creator | bonus pending; escrow delivery status is RELEASED (u1) | Pays the pot to the creator's payout wallet from the escrow round, the same wallet the base payment went to. |
| `revoke (delivery-id)` | owner | bonus pending; escrow delivery is VETOED (u2) or EXPIRED (u4) | Refunds the pot to the owner. Terminal: a later amend of the delivery does not resurrect the bonus. |

While a delivery is PENDING or APPROVED in the escrow the creator can still
earn it, so `revoke` refuses and `claim` refuses. Only RELEASED unlocks.

The creator principal is snapshotted from the escrow at fund time, but the
release gate is read live from the escrow at claim time.

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
| u207 | ERR_NOT_RELEASED | claim |
| u208 | ERR_STILL_CLAIMABLE | revoke (delivery pending or approved) |

## Read-only

- `get-config`: owner, escrow, usdcx.
- `get-bonus (delivery-id)`: the row, or none.
- `get-escrow-delivery (delivery-id)`: passthrough to the escrow.
- `is-claimable (delivery-id)`: true when the bonus is pending and the escrow
  delivery is RELEASED. Frontends poll this instead of re-deriving the rule.
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
swept round, d8 is RELEASED, next id is 12. It covers the fund guards,
top-up, wrong-creator and double claim, fund after claim, revoke guards and
refund on d4, then advances past round 3, funds the escrow owner, starts
round 4 with the escrow owner impersonated, and walks d12 through pending,
approved, released and claimed, plus d13 funded, vetoed, revoked, amended and
refused. Balance deltas assert the USDCx lands in the creators' smart wallets
and not their operating wallets, and that the contract ends empty.

Last run: https://stxer.xyz/simulations/mainnet/bb686c169d1b1af636b13af61b118191
