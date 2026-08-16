# Maker economics on the Jing auction

Source material for how we talk about the auction. The fee numbers are a
proposal, not shipped — see `README-markets-sbtc-stx-jing-v2.md` for the
contract state. What is *not* a proposal is the structural argument, which holds
at any fee level.

---

## The one-line version

> **Be a liquidity provider with a limit price and no impermanent loss.**

Everything below is why that sentence is true and where it stops being true.

---

## The comparison that matters

|  | Bitflow LP | Jing auction maker |
|---|---|---|
| Yield | 25 bps of pool fees | 20 bps taker rebate |
| Fill price | whatever the curve reaches | **your limit, or no fill** |
| Impermanent loss | yes, on every move | **none** |
| Capital | committed, withdrawable | locked for one cycle |
| Fill certainty | continuous | **only if the other side shows up** |

The instinct is to read the top row and conclude Jing pays less. That is the
wrong row to read.

## Why an LP's yield is not what it looks like

An automated market maker has no opinion about price. The curve fills whoever
arrives, at whatever the pool has drifted to. That is the mechanism, not a bug —
it is what makes an AMM always quotable.

But it means an LP is a **forced counterparty to every move**. Price runs up,
the pool sells them out of the asset that is winning. Price falls, the pool
loads them up on the one that is losing. That is impermanent loss, and it is not
an edge case or a tail risk: it is the ordinary operation of the thing, every
single day.

So 25 bps is not a yield. It is a payment for absorbing that. Whether it clears
the cost depends entirely on how much the pair moved — and on a thin pair, it
frequently does not.

## What the auction changes

A Jing maker deposits with a **limit price**. If the batch clears inside it,
they fill. If it does not, they do not fill and roll to the next cycle. There is
no curve dragging them through a price they never agreed to.

That single difference removes impermanent loss as a category. Not reduces it —
removes it. You cannot be sold out of a position at a price you refused.

So the honest comparison is:

> **Bitflow LP** — 25 bps, filled at any price, IL on every move
> **Jing maker** — 20 bps, filled only at your price, no IL

That is not a slightly worse yield. It is a different product, and on a
risk-adjusted basis the smaller number is the better one. Which is why matching
25 bps would be overpaying: we would be pricing as though we were selling the
same thing.

## What the maker actually gives up

Be straight about this or the pitch does not survive contact with a real user.

**Capital is locked for a cycle with no guarantee of filling.** That is the
whole cost. A maker who needs certainty of execution should not use the auction
— that is what the AMM is for, and what it is genuinely good at.

**And there is no continuous yield.** An LP earns on every trade that crosses
the pool. A maker earns only when a taker arrives and clears against them. On a
quiet day an LP earns a little and a maker earns nothing.

The 20 bps buys exactly one thing: the willingness to sit escrowed, at a price
you chose, not knowing whether anyone will take it.

## Why the auction can afford this

The RFQ desk quotes a price and then hedges it on a CEX, and that hedge costs 80
bps today because Kraken lists no STX/BTC pair. Every bp of that comes out of
what the desk can hand back.

The auction has none of that. No market maker, no hedge, no inventory. Users
clear against each other at the oracle price. So the entire spread between our
10 bps and Bitflow's 50 bps is real headroom — and the right place to spend it
is on the side of the book that is hardest to attract.

Taker pays 30 bps: 10 to the protocol, 20 to the makers who filled them. Still
20 bps better than Bitflow before slippage, and far better at size.

## The slippage point, which is the real one at size

Total sBTC liquidity across all 47 Stacks DEX pools is about **$807k**. The
largest sBTC/STX venue is a fraction of that. A $10k order is a meaningful
percentage of the pool it hits, and the curve prices it accordingly.

The auction has no curve. It clears at the oracle price whether the clip is
$500 or $50,000.

**So Jing's advantage grows with size.** That is the defensible claim, it is
arithmetic rather than marketing, and it is the one worth leading with for
anyone trading real size. The fee difference is the small half of the story.

## Lines that are true and worth reusing

- *Be an LP with a limit price and no impermanent loss.*
- *An AMM sells you out at whatever the curve reached. Here, you name the price
  or you do not trade.*
- *Impermanent loss is not a risk of providing liquidity to a pool. It is the
  mechanism.*
- *No curve means no slippage. The tenth bitcoin clears at the same price as the
  first.*
- *You are paid to wait. The taker pays for not waiting.*

## Lines to avoid

- **Anything implying guaranteed execution.** The auction fills only when both
  sides show up. Overselling this is the fastest way to lose the first cohort.
- **"Zero risk."** Makers carry settlement-price risk inside their limit, and
  the opportunity cost of locked capital.
- **Direct APY comparisons against LP positions.** The two are not
  commensurable — one is continuous and IL-exposed, the other is episodic and
  IL-free. A single percentage flattens exactly the distinction we are selling.
- **Claiming we always beat Bitflow.** We beat them when there is liquidity on
  the opposite side. That is the honest caveat, and the router exists precisely
  to cover the case where there is not.

## Open questions

1. Is 20 bps enough to actually pull makers? Unanswerable without a live book —
   the first real cohort is the experiment.
2. Should the rebate scale with taker clip size rather than being flat? A large
   taker consumes more of the book. Stateless and not gameable, unlike a
   cumulative-volume tier.
3. What is the realistic fill rate for a maker at a given limit distance from
   mid? This is the number a serious maker will ask for first, and we do not
   have it yet.
