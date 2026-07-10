# RFQ v2 without Pyth: the fix-price honesty design

Decisions taken **2026-07-09** for `rfq/rfq-sbtc-stx-jing-v2.clar`.

Pyth is gone (licensing - see `../pyth/README.md`). Its replacement, the
native miner-commit band, is a wide anti-manipulation fence, so price
precision moved into the quote itself. Four decisions make fix-price honest
by construction:

1. the client **signs the exact amount** (`quoted-out`); fix-price may
   drift at most **20 bps** from it;
2. the drift band is **symmetric** (the upper bound is a fat-finger guard);
3. the quote carries a **signed reference benchmark** (venue price +
   timestamp, <120s fresh at execution) - an on-chain TCA audit trail,
   accountability rather than a price fence;
4. only **whitelisted MMs** can fix - the enforcement lever behind all of it.

In one line: **the native band (via `max-premium-bps`) is anti-manipulation
only; the real price guarantee is the signed `quoted-out` +/- 20 bps; the
TCA declaration + whitelist keep the desk honest about how the quote was
priced.**

## Quick reference (what changed on-chain)

| item | value |
|------|-------|
| `MAX_QUOTE_DRIFT_BPS` | `u20` (0.20%) |
| `MAX_REF_STALENESS` | `u120` seconds (ref-timestamp vs stacks-block-time) |
| signed SIP-018 tuple | `market, rfq-id, winner, quoted-out, ref-price, ref-timestamp, ref-venue, max-premium-bps, expiry` |
| `fix-price` arity | 5 -> 9 (`quoted-out`, `ref-price`, `ref-timestamp`, `ref-venue` added) |
| new errors | `ERR_QUOTE_DRIFT u2014`, `ERR_NOT_WHITELISTED u2015`, `ERR_BAD_REFERENCE u2016`, `ERR_STALE_PRICE u1005` (reintroduced) |
| new admin surface | `set-mm-whitelist` (operator), `is-whitelisted-mm` (read-only) |
| event | `rfq-fix` now prints `quoted-out`, `ref-price`, `ref-timestamp`, `ref-venue` |

FE/BE impact: signing payloads and auth-hash mirrors (e.g.
`buildRfqAuthHashHex` in `simulations/_setup.js`) gain the new tuple fields;
every fix-price caller gains four args; the operator must `set-mm-whitelist`
each desk after `initialize` (add to init runbook and sims).

## The three fences on committed-out

At `fix-price`, the MM's `committed-out` must clear, coarse to fine:

1. **Native miner-commit band** (floor via client's `max-premium-bps`,
   ceiling via `MAX_PREMIUM_BPS u2000`) - catches gross manipulation or a
   broken oracle. The only fence anchored to a price nobody in the trade
   controls (mechanism: `../pyth/README.md`).
2. **`min-stx-out`** (set at open-rfq) - the client's on-chain hard floor.
3. **`quoted-out` +/- 20 bps** (SIP-018 signed) - the precision fence.

The reference benchmark is deliberately NOT a fence - it gates declaration
quality, not price (see the TCA section).

## Why keep the native band

Every other protection derives from a signature someone in the trade
produced, so a compromised FE, a phished client, a desk software bug, or
desk+client collusion produces perfectly valid signatures that clear them
all. The native band anchors to a price nobody in the trade controls and
caps the damage in exactly those scenarios.

Miners, not an AMM, as the anchor:

- an AMM pool can be flash-bent and restored within one tx for ~swap fees
  on thin TVL; moving the miner price burns real sats across the whole
  6-tenure window, unrecoverable;
- miners bid every Bitcoin block or the chain itself has stopped -
  chain-level uptime, no subscription, free forever;
- the AMM's only edge is freshness - the one property a wide band does not
  need, and the one that makes AMM oracles exploitable.

### The lag is a circuit breaker

The native mid is a ~1h trailing average. When the market moves further
from that average than the band allows, no quote can clear it and the venue
pauses itself, auto-resuming as the window slides forward (~30-60 min).
Trip thresholds: ~10-12% on the pump side (floor, depends on client
premium), ~10% on the crash side (ceiling, `MAX_PREMIUM_BPS u2000`). A fast
oracle would track a crash tick by tick and approve every crash-priced fill
as "fair" - no breaker. The lag buys this.

Fail-closed, and costless to the desk: the MM checks the band BEFORE
hedging (see timeline), so a breaker trip means declined quotes, not
orphaned hedges. Funds stay safe; the client reclaims after open-expiry if
nobody fixes.

Calibration coupling: those ~10-12% thresholds exist because
`commit-efficiency-bps` errs LOW (mid ~8% below market at the default
u10000). Centering it on market collapses the pump-side threshold to ~2-4%
and the venue pauses on ordinary volatile days. Tight band <-> low-biased
calibration; change one, revisit the other.

The knob stays operator-settable (u5000-u15000) rather than a constant:
the miner-commit-to-reward ratio is empirical and drifts (fee regimes,
miner entry/exit, ~2030 halving; ~109% measured 2026-07), and "err low" is
relative to a market price the chain cannot observe - it is an ops
discipline (measure with the probe sim, set near the 10th percentile), not
an assert. Abuse surface is small: the knob cannot touch the client's price
(pinned by the signed quote); worst case is availability, and the operator
already holds `set-paused`, a strictly bigger availability lever.

## Timeline: where the price risk lives

```
desk prices off CEX book          <- quote created, ref-price stamped
  |   leg 1: client reviews + signs (seconds)
client signature arrives          <- MM decision point: hedge or decline
  |   leg 2: MM buys STX + shorts BTC via CEX API (~1s)
hedge filled
  |   leg 3: fix-price broadcast -> confirmed (~13s avg)
fix-price lands on-chain
```

**Leg 1 is the only leg with client-side price risk.** A signed quote is a
free option: sit on it, watch the market, return it only when the move
favors you. The design squeezes it from both ends:

- **The FE must keep the quote live.** Freshness is judged at the EXECUTING
  block with a 120s cap, and 20 bps is ~1.5 sigma of one minute - so the FE
  requotes continuously (countdown-and-refresh) and the client signs a
  price stamped seconds before signature. The client is never shown a quote
  that has already drifted; what they sign IS the live price.
- **`auth-expiry` bounds the adversarial case.** A client bypassing the FE
  and sitting on a signed quote still cannot stretch the option past a few
  blocks.

**The MM's decision point is BEFORE the hedge.** Signature in hand, the
desk re-checks the market: if the move means the fix would revert (native
band, drift) or fill at a loss, it declines and the client requotes - no
hedge placed, nothing to unwind. The MM only hedges once it knows the fix
clears, so market moves during leg 1 cost the desk nothing systematic.

**Leg 2 (~1s)** is what the drift band absorbs in practice: with leg 1
squeezed to seconds by the requote UX, the residual move between signature
and hedge fill sits well inside 20 bps.

**Leg 3 carries zero price risk.** `committed-out` is frozen in the tx args
at broadcast and the hedge is already on - the MM is market-neutral while
the tx confirms; the ~13s block time is not a pricing input. It does carry
liveness risk: `auth-expiry` is checked at execution, so give it ~5-10
stacks blocks of headroom over expected sign-to-broadcast time. An
unexpected revert here (slow tenure, mempool burst) is the ONLY source of
orphaned hedges. MM infra requirement: watch the fix tx and, on revert or
expiry, unwind the hedge immediately and programmatically via the CEX API -
never leave it to manual handling. Detected and unwound within seconds, the
residual cost is round-trip fees plus seconds of exposure, not a lingering
naked position.

Reframe: **drift is a shave license, not a weather allowance.** The client
signed the band, so a profit-maximizing MM may legally fix at
`quoted-out * (1 - drift)` every time. The number answers "how much may the
MM underpay vs the agreed amount", not "how much can the market move".

## Sizing the drift: why 20 bps

STX/BTC daily vol runs ~4-6%, so one-minute sigma is ~0.10-0.15%. The
sizing window is the worst legal age of a signature - auth-expiry (~1-2
minutes, capped again by the 120s ref freshness) - not the typical leg 1.
In practice the flow is automated end to end and the one human step,
approving in the wallet popup, takes seconds, so honest fills sit far
inside the band; drift just has to let a signature that lawfully arrives
late still fill.

| candidate | reads as | verdict |
|-----------|----------|---------|
| 50 bps | ~4 sigma/min | Too generous: bigger than the 0.30% desk fee, so a full shave makes the true cost 0.80% while the UI says 0.30%. Rejected. |
| 15 bps | ~1 sigma/min | Forces re-quotes on ordinary choppy minutes - fills die to ERR_QUOTE_DRIFT on noise. |
| **20 bps (chosen)** | ~1.5 sigma/min | Absorbs normal jitter, caps the worst-case shave BELOW the posted 0.30% fee. |

Rule that generalizes: **drift must stay below the posted fee** (shaving
can never silently exceed what the client believes they pay) and should
cover ~1.5 sigma of the auth-expiry window. Drift and auth-expiry are one
knob seen from two sides; tight-tight is the right corner.

A >20 bps move inside the window means the quote is genuinely dead: the MM
abandons, the client re-quotes (the Werner lesson, in miniature).

## Why the band is symmetric

A rational MM never overpays, so the upper bound
(`committed-out <= quoted-out * 1.002`) protects no counterparty. It is a
fat-finger guard: on the honest path `committed-out` EQUALS `quoted-out` -
the `rfq-fix` event proves, fill by fill, that the client was paid exactly
the signed amount - so any deviation in either direction signals a desk
software bug (decimal slip, stale variable, sats/uSTX mixup). Reverting
beats silently overpaying. Cost on the honest path: zero; what it
forecloses (voluntary price improvement >0.2%) is near-theoretical.

## The signed reference benchmark (on-chain TCA)

TCA = Transaction Cost Analysis: measure every fill against a public
benchmark so a broker can PROVE best execution rather than claim it. The
quote carries `ref-price` (STX-per-BTC x 1e8), `ref-timestamp` (venue unix
seconds), `ref-venue` (string-ascii 16, e.g. "kraken-mid" - name WHICH
price; vague declarations are unfalsifiable, therefore worthless) inside
the client-signed tuple, so the client signs KNOWING the benchmark the desk
priced against.

The contract enforces declaration QUALITY only (it cannot verify a CEX
price, and deliberately does not price-check against it):

1. `ref-price > 0`, non-empty `ref-venue`, no future timestamps -
   ERR_BAD_REFERENCE u2016;
2. **freshness**: <120s vs the executing block's time - ERR_STALE_PRICE
   u1005. This closes the **true-but-stale loophole**: a 10-minute-old
   venue price can be genuinely true at its timestamp yet cherry-picked
   after the market moved against the client, and the TCA audit would find
   no lie. Freshness forces a contemporaneous benchmark. Why 120s and not
   80s: the clock runs stamp -> wallet interaction -> broadcast ->
   confirmation; 80s leaves no confirmation headroom and reverts honest
   fills (orphaning hedges). FE consequence: stamp ref-price/ref-timestamp
   at SIGNATURE time, not at quote display - the same countdown-and-refresh
   UX the drift already forces.

**Deliberately NO reference price band** (implemented, then removed): it is
self-referential. `ref-price` and `quoted-out` sit in the SAME signed
tuple, so a ref band just compares two fields of one message against each
other. If the desk quoted far from its own benchmark, the client signed
that inconsistency - the FE should reject it BEFORE signature, and the
independent reality check is the native band. Enforce consistency socially
(badge + de-whitelist), not circularly on-chain.

Why it works without on-chain truth-checking: a shaving desk has two
options, both bad. Declare the TRUE price - then "this desk systematically
fills below its own declared benchmark" is a chart anyone can draw from the
event log. Or LIE - but the declaration names venue + timestamp to the
second, venue history is public, and the lie is non-repudiable on-chain
(grounds for de-whitelisting). Dishonesty is forced out of the unobservable
gap into a publicly falsifiable statement, in the same tx that moves the
money.

The `rfq-fix` event is a complete TCA row: native mid, declared venue price
+ timestamp, quoted-out, stx-out. The reconciler can auto-fetch the venue
candle per declared timestamp and badge every fill verified/deviating - the
desk is continuously audited by its own product.

Known residual: timestamp shopping inside the quote window (the MM picks
the most favorable second). Bounded by auth-expiry x drift, and visible in
the declaration.

## The MM whitelist (the enforcement lever)

`fix-price` is gated by `whitelisted-mms` (operator `set-mm-whitelist`,
read-only `is-whitelisted-mm`, ERR_NOT_WHITELISTED u2015). Two jobs:

- **Closes the self-deal.** SIP-018 binds `winner` to a principal, so a
  third party can never steal a fix - but nothing stopped a client from
  naming THEMSELVES (or an accomplice) as winner and fixing their own RFQ
  on favorable in-band terms. Mirrors the off-chain KYB gating (rfq_kyb).
- **Gives the audit trail teeth.** Drift caps the shave, TCA makes it
  provable, the whitelist makes proof matter - caught desks lose their
  slot, with the evidence permanently on-chain.

## Future (multi-MM competition)

With multiple whitelisted desks bidding per RFQ, competition disciplines
shaving on its own, and drift could become client-signed (like
max-premium-bps) rather than a constant. Not needed for the single-desk
phase.

## Cross-references

- Native price mechanism + calibration: `../pyth/README.md`
- Dead Arkadiko multisig-oracle alternative: `../Arkadiko-oracle/README.md`
- Contract: `../rfq/rfq-sbtc-stx-jing-v2.clar`
- RFQ product context: `../rfq/README-rfq.md`, risks: `../rfq/RISKS.md`
