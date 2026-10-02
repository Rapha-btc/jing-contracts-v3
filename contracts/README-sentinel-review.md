# Sentinel review of the v6-3 deploy set

Sentinel (by SecondLayer) scanned the deploy set at `df091b8` on 2026-10-02.
Every finding is LOW. None needs a code change. The table records each finding
and our assessment, grouped by contract.

## jing-buy-stx-core-spread-v1

| Finding | Function | Assessment |
| --- | --- | --- |
| Donated sBTC masks fills in sync: sending sBTC to the pool only gives it away | `sync` | **No issue.** `sync` measures unsold sBTC as `market-size + held`, so a direct transfer raises `held` and a fill of the same size leaves the index unchanged. Members still receive the STX from that fill (proceeds come from STX received) and keep their sBTC position, now backed by the donation. Only the donor loses. Any surplus stays in the pool for the epoch's final member, so no unit is stuck. |

## jing-sell-stx-core-spread-v1

| Finding | Function | Assessment |
| --- | --- | --- |
| One member's withdraw can cancel the pool's order and start a 24h push cooldown | `settle-escrow` | **By design.** It is only reachable when the pool's market deposit has been pending for more than 24h, that is, unsettled for a full day (market paused, Lazer down or no keeper). Cancelling is the intended escape (24h escrow fallback, `5735a97`). The cooldown stops the rung from pushing back into a market that is still stuck. While keepers settle on time, nobody can trigger it. The cost is missed fills and idle funds for up to a day, never principal. |
| The cap guard depends on the RFQ operator's coinbase setting | `current-cap` | **Accepted trust assumption.** The band reads `get-native-price` from `rfq-sbtc-stx-jing-v2-3`, which the RFQ operator influences. In the worst case the operator widens the band (sells further from the miner reference, still inside the market limit) or narrows it (pushes refused, funds idle). Funds are not taken. Mitigation: move the RFQ operator to a multisig with `set-operator`. That multisig must enforce distinct cosigners. |

## jing-core-v6

| Finding | Function | Assessment |
| --- | --- | --- |
| A permissionless rung copy can displace a seated band rung | `register` | **False positive.** Only the ladder owner can seat a rung: the rung's `initialize` asserts `tx-sender == ladder get-owner` (`jing-buy-stx-core-spread-v1.clar:463`, same in the sell rung). Sentinel noted the rung template was out of its scope, so it could not see that check. |
| No revocation of verified or registered contracts; the pause can be extended; `accept-owner` has no timelock | `pause` | **Known owner powers, accepted.** Re-pausing blocks trading and settlement, never withdraw or cancel. No revocation is deliberate: a flawed contract is retired by pausing it on the market side, as with `markets-sbtc-stx-jing-v4`. Mitigation: move the core owner to a multisig. |

## jing-ladder-v1

Who seats a band rung: the owner of `jing-ladder-v1` (the deployer at deploy,
transferable by propose/accept). A seat is taken only when the owner runs the
rung's `initialize` (it asserts `tx-sender == ladder get-owner`); `seat-band`,
`retire-band` and `set-max-band-per-side` are owner-only.

| Finding | Function | Assessment |
| --- | --- | --- |
| Anyone can deploy a copy of the approved band contract and take over another rung's protected seat | `register` | **False positive.** The canonical band code is the core-spread v1 rung, whose `initialize` only runs for the ladder owner (`jing-buy-stx-core-spread-v1.clar:463`, `jing-sell-stx-core-spread-v1.clar:434`). A copy deployed by anyone else cannot reach `register`. |
| An attacker can fill every free protected seat with empty canonical rungs | `claim-seat` | **False positive.** Same owner gate: only the ladder owner can seat. `retire-band` clears a seat if needed. |
| The first deployer at a fixed price keeps it forever; the owner cannot free it | `register` | **By design, not active this phase.** Fixed-price rungs are first come, no replacement; the holder works as a normal rung. Only the two band sides get a canonical on `jing-ladder-v1`, so any fixed-side `register` fails with `ERR_NOT_VERIFIED`. |

**Rule.** The ladder's seat protection relies on the canonical code. Only call
`set-canonical` with a band contract whose `initialize` asserts the ladder
owner.

## markets-sbtc-stx-jing-v6-3

| Finding | Function | Assessment |
| --- | --- | --- |
| The operator can set a huge minimum deposit that stops settlement | `set-min-token-y-deposit` | **Accepted operator power.** Settlement, new deposits and partial withdrawals halt, but a full cancel always refunds. Mitigation: operator on a multisig. |
| The operator can redirect protocol fees and dust to any address | `set-treasury` | **Accepted operator power.** Only the 10 bps fees and rounding dust; user principal is not reachable. Mitigation: operator on a multisig. |
| A malicious contract the user calls can act as that user, for example change a limit | `set-token-x-limit` | **Known class, out of scope.** The tx-sender vs contract-caller proxy class, rejected by design in earlier bounties. It cannot move funds anywhere but back to the user. |
| Anyone can settle another user's pending order with any valid recent price update | `settle-token-y-deposit` | **By design.** Permissionless settle lets keepers clear pending deposits. The caller can only choose among valid signed updates inside the 80 s window, and refunds go to the order's owner. |

## Out of scope: jing-sell-stx-market-spread-v1

Sentinel was first run on this contract by mistake. It is not in the deploy
set. It shares two mechanisms with the core-spread rungs, and the
assessment carries over:

| Finding | Function | Assessment |
| --- | --- | --- |
| The tail roll depends on the market's cancel succeeding | `roll-tail` | **No stuck funds.** The tail roll calls the market cancel only when the rung has funds on the market. That cancel has no pause or oracle check and returns the rung's own pending, live and parked funds. It fails only if the market cannot repay what it holds, which would be a separate market solvency bug. |
| A withdraw can be delayed up to 24h by a market pause or a missing Lazer update | `settle-escrow` | **By design.** Same 24h escrow fallback as above. Exits that the rung's other funds can cover are not blocked. The rung stxer sims cover the 24h cancel, a paused market (`u1007`) and exits with no oracle. |

## Open actions

- Move the RFQ operator, the jing-core-v6 owner, the jing-ladder-v1 owner and the market operator to a multisig with distinct cosigners.
- Only `set-canonical` band code whose `initialize` asserts the ladder owner.
