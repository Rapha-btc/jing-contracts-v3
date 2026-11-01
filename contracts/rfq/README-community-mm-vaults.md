# Community MM vaults and protected rungs

## Proposed contract pairs

| Direction | Community vault | Protected rung | Loop |
| --- | --- | --- | --- |
| Sell sBTC | `community-mm-vault-sell-sbtc` | `community-mm-rung-buy-stx` | sBTC is offered for STX; STX is used to buy sBTC back below the sale cap. |
| Sell STX | `community-mm-vault-sell-stx` | `community-mm-rung-sell-stx` | STX is offered for sBTC; sBTC is used to buy STX back above the sale floor. |

The vault owns the investors' share ledger and treasury fee accounting. Its
paired rung is the market-facing maker and holds the protected seat. Only the
paired vault should be able to fund or control its rung; investors should not
be able to bypass the vault's share accounting by depositing directly into the
rung.

## Seat constraint found in the current contracts

`jing-ladder-v1` registers a band rung on exactly one side (`buy-band` or
`sel-band`), and `markets-sbtc-stx-jing-v6-4` copies that registration into the
seat list for that side. The seat keeps that rung's order from being parked.
The loop's opposite-side buy-back order is a different market depositor, so a
protected rung alone does **not** guarantee that both legs avoid parking.
This first design can guarantee the rung leg only; protecting both legs needs
an additional protected principal or a market/ladder change.

## Share and fee requirements

- Investor shares must be minted against current vault net asset value so a
  later deposit does not dilute existing investors.
- Redemption must account for both tokens, open market orders, and rung funds;
  it must not pay out funds already owed to other investors.
- Treasury performance fees should be charged only on profit, with a
  high-water mark. Fee rate and treasury address must be explicit at
  initialization and guarded against unsafe changes.
- Keeper actions can run the loop but cannot withdraw investor assets.

## Deployment dependency

The ladder accepts only rungs whose source hash matches its canonical hash for
that side. A new rung source therefore needs to be blessed as that side's
canonical implementation before the new instance can register and take a
protected seat. Registering a new spread also requires an available band seat;
using a new spread may require the ladder owner to increase the seat count.

No contract source or deployment config has been changed by this design note.
