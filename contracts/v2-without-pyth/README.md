# RFQ v2 without Pyth: the fix-price honesty design

Decisions taken **2026-07-09** for `rfq/rfq-sbtc-stx-jing-v2.clar`.

Context: Pyth is gone from the RFQ (licensing - see `../pyth/README.md`),
replaced by the native miner-commit guardrail. That guardrail is a wide fence
(a premium band around a trailing ~1h average of miner commits), so the
precision work moved into the quote itself. This file documents the four
decisions that make fix-price honest by construction:

1. the client **signs the exact amount** (`quoted-out`) and fix-price may
   drift at most **20 bps** from it;
2. the drift band is **symmetric** (the upper bound is a fat-finger guard);
3. the quote also carries a **signed reference benchmark** (venue price +
   timestamp, must be <120s fresh at execution) - an on-chain TCA audit
   trail. Deliberately an ACCOUNTABILITY device, not a price fence;
4. only **whitelisted MMs** can fix - the enforcement lever behind all of it.

Division of labor, in one line: **`max-premium-bps` is the client's tolerance
against the native oracle guardrail (anti-manipulation only); the real price
guarantee is the signed `quoted-out` +/- 20 bps; and the TCA declaration +
whitelist keep the desk honest about how that quote was priced.**

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

FE/BE impact: signing payloads and any auth-hash mirror (e.g.
`buildRfqAuthHashHex` in `simulations/_setup.js` when porting to v2) must add
the new tuple fields; every fix-price caller gains four args; the operator
must `set-mm-whitelist` each desk after `initialize` (add to init runbook and
sims).

## The three fences on committed-out

At `fix-price`, the MM's `committed-out` must clear all of these, layered
from coarse to fine:

1. **Native miner-commit band** (floor via client's `max-premium-bps`,
   ceiling via `MAX_PREMIUM_BPS u2000`): catches gross manipulation or a
   broken oracle. This is the only fence anchored to a price NOBODY in the
   trade controls. See `../pyth/README.md` for the mechanism.
2. **`min-stx-out`** (set at open-rfq): the client's on-chain hard floor.
3. **`quoted-out` +/- 20 bps** (SIP-018 signed): the precision fence.

(The signed reference benchmark is deliberately NOT a fence - see "no
reference band" below. It gates declaration QUALITY, not the price.)

## Why we keep the native oracle band

It has no pricing role - the deal is `quoted-out +/- 20 bps`. It is kept
because it is the **only fence not derived from a signature someone in the
trade produced**. Every other protection (quoted-out, min-stx-out,
max-premium-bps, the TCA declaration) is valid the moment the client signs -
so a compromised FE, a phished client, a desk software bug, or desk+client
collusion produces perfectly valid signatures and sails through all of them.
The native band anchors to a price nobody in the trade controls and caps the
damage of exactly those scenarios.

Why miners and not an AMM (e.g. Bitflow) as the anchor:

- **Manipulation cost**: an AMM pool price can be flash-bent and restored
  within one transaction for ~swap fees on thin TVL. Moving the miner price
  means burning real sats across the whole 6-tenure window, unrecoverable.
- **Liveness**: pools can drain or go quiet; miners bid every Bitcoin block
  or the chain itself has stopped. Chain-level uptime, no subscription, no
  signers, free forever.
- The AMM's only win is freshness - the one property a wide protection band
  does not need, and the one that makes AMM oracles exploitable.

### The lag IS a circuit breaker

The native mid is a ~1h trailing average, so it lags. The band only accepts
fixes within a few percent of that lagging number. When the market sprints
further from its own one-hour memory than the band allows, NO quote can
clear: fresh quotes priced at the new market fall outside the band (revert),
stale pre-move quotes fall outside economics (the MM declines). The venue
pauses itself, then auto-resumes as the window slides forward (~30-60 min)
and the mid converges. A fast oracle would track the crash tick-by-tick and
approve every crash-priced fill as "fair" - no breaker. The lag buys this.

Trigger thresholds - note the two sides have different widths, and the
err-low calibration (mid ~8% BELOW market at `u10000`) dominates both:

| direction | binding check | trips at (1h move) |
|-----------|--------------|---------------------|
| STX pumps vs BTC (fresh quotes come in LOW) | floor = mid x (1 - client premium) | ~10% at 2% premium, ~12% at 4% |
| STX crashes vs BTC (fresh quotes come in HIGH) | ceiling = mid x (1 + MAX_PREMIUM u2000) | ~10%, independent of client premium |

Failure mode is **fail-closed**: reverted fixes, funds safe, client reclaims
after open-expiry if nobody re-fixes. If honest fixes start reverting outside
a genuine crash, recalibrate `commit-efficiency-bps`; do not remove the
fence.

Band sizing: purely a protection width - the real price is the signed quote.
2% is the tightest sensible, 3-5% the comfort zone (desk default 4%),
`MAX_PREMIUM_BPS u2000` stays as the hard cap a client may sign. **The
load-bearing coupling**: those ~10-12% breaker thresholds exist because the
calibration errs low. Centering `commit-efficiency-bps` on market collapses
the floor-side threshold to ~2-4% and the venue starts pausing on ordinary
volatile days. Tight band <-> low-biased calibration; change one, revisit the
other.

### Why the calibration is a variable, not a constant

`commit-efficiency-bps` (default u10000, operator-settable u5000-u15000) must
stay a knob:

- The quantity it corrects - the ratio of miner commits to reward value - is
  empirical and drifts (fee regimes, miner entry/exit, ~2030 halving; ~109%
  measured 2026-07). A constant would mean redeploying on every regime shift.
- The "err low" rule cannot be encoded in the bounds: "low" is relative to
  the live market price, which the chain cannot observe. If the true ratio
  drops, keeping the mid low requires adjusting DOWN. The invariant is an
  ops discipline (measure with the probe sim, set near the 10th percentile),
  not an assert.
- The knob's abuse surface is small: it cannot touch the client's price
  (pinned by the signed quote +/- 20 bps). Worst case is availability - mid
  too high stalls the venue, mid too low numbs the breaker - and the operator
  already holds `set-paused`, a strictly bigger availability lever.

## Timeline analysis: where the price risk actually lives

The RFQ two-phase flow, MM side:

```
desk prices off CEX book          <- quote created (ref-price stamped here)
  |         (leg 1: client reviews + signs .. seconds to minutes)
client signature arrives
  |         (leg 2: MM buys STX + shorts BTC via CEX API .. ~1s)
hedge filled
  |         (leg 3: fix-price broadcast -> confirmed .. ~13s avg)
fix-price lands on-chain
```

- **Leg 1 is the only leg with price risk.** It is client-controlled time,
  and it is a free option for the client: they can sit on the quote, watch
  the market, and only return the signature when the move favors them. The
  defenses are `auth-expiry` (bounds the window) and the drift band (bounds
  the damage).
- **Leg 2 is negligible** (~1s CEX API round trip).
- **Leg 3 carries ZERO price risk.** `committed-out` is frozen in the tx args
  at broadcast, and the hedge is already on - the MM is market-neutral while
  the tx confirms. The ~13s average block time is NOT a pricing input. What
  leg 3 does carry is **liveness risk**: `auth-expiry` is checked at
  execution (`stacks-block-height < auth-expiry`), so a slow tenure or
  mempool burst can revert an honest fix with ERR_AUTH_EXPIRED. Hence:
  auth-expiry needs ~5-10 stacks blocks of headroom over the expected
  sign-to-broadcast time. If a fix does fail, the MM's residual cost is
  unwinding an orphaned hedge - occasional and small, not systematic.

Key reframe: **drift is not a weather allowance, it is a shave license.**
Once the band exists, a profit-maximizing MM can fix at
`quoted-out * (1 - drift)` every time - the client already signed the band.
So the number answers "how much may the MM legally underpay vs the agreed
amount", not "how much can the market move".

## Sizing the drift: why 20 bps

Vol math: STX/BTC daily vol runs ~4-6%, so one-minute sigma is ~0.10-0.15%.
With auth-expiry kept tight (~1-2 minutes), leg 1 is a roughly one-minute
window.

| candidate | reads as | verdict |
|-----------|----------|---------|
| 50 bps | ~4 sigma/min buffer | Too generous. Bigger than the 0.30% desk fee: a full shave would make the client's true cost 0.80% while the UI says 0.30%. Rejected. |
| 15 bps | ~1 sigma/min | Honest-by-construction, but forces re-quotes on ordinary choppy minutes - fills die to ERR_QUOTE_DRIFT for moves that are just noise. |
| **20 bps (chosen)** | ~1.5 sigma/min | Absorbs normal jitter, still caps the worst-case shave BELOW the posted 0.30% fee. |

Decision rule that generalizes: **drift must stay below the posted fee** (so
shaving can never silently exceed what the client believes they pay), and
should cover ~1.5 sigma of the auth-expiry window (so honest fills survive
normal vol). Drift and auth-expiry are one knob seen from two sides: longer
expiry needs wider drift. Tight-tight is the right corner.

When the move exceeds 20 bps inside the window, the correct behavior is: MM
abandons the fix, client re-quotes. A >0.2%-in-a-minute move means the quote
is genuinely dead; refreshing beats honoring stale prices (the Werner lesson,
in miniature).

## Why the drift band is symmetric

A rational MM never overpays, so the upper bound
(`committed-out <= quoted-out * 1.002`) protects no counterparty. It is kept
as a **fat-finger guard for the MM's own software**: in the honest path
committed-out EQUALS quoted-out, so any deviation beyond drift - in either
direction - signals a bug (decimals slip, stale variable, sats/uSTX mixup).
Reverting beats silently overpaying, and it keeps the reconciler invariant
clean (fixed ~= quoted, always). Cost on the honest path: zero. What it
forecloses: voluntary price improvement >0.2% - near-theoretical, a desk just
fixes at quote and keeps the gain.

## The signed reference benchmark (TCA on-chain)

TCA = Transaction Cost Analysis, the tradfi practice where every fill is
measured against a public benchmark so a broker can PROVE best execution
rather than claim it ("best execution" is a legal obligation there). The RFQ
now does this on-chain, upfront-signed:

The quote carries `ref-price` (STX-per-BTC x 1e8, same scale as everything),
`ref-timestamp` (the venue's own unix-seconds timestamp), and `ref-venue`
(string-ascii 16, e.g. "kraken-mid") - all inside the client-signed SIP-018
tuple, so the client signs KNOWING the benchmark the desk priced against.
Precision matters more than volume here: the venue field should name WHICH
price (best bid / best ask / mid) - vague declarations are unfalsifiable and
therefore worthless.

What the contract enforces is declaration QUALITY (it cannot verify a CEX
price, and deliberately does not price-check against it - see below):

1. `ref-price > 0` and `ref-timestamp <= stacks-block-time` (no future
   timestamps) - ERR_BAD_REFERENCE u2016.
2. **Freshness**: `ref-timestamp > stacks-block-time - MAX_REF_STALENESS`
   (120s) - ERR_STALE_PRICE u1005, the old Pyth staleness error reborn.
   This closes the **true-but-stale loophole**: without it, a desk could
   declare a 10-minute-old venue price that is genuinely TRUE at its
   timestamp - cherry-picked because the market has since moved against the
   client - and every fence would anchor to it while the TCA audit finds no
   lie. Freshness forces the benchmark to be contemporaneous, and it makes
   the drift<->window pairing structural (20 bps was sized for ~1-2 min of
   vol; the cap guarantees the window). Why 120s and not 80s: the clock runs
   stamp -> client wallet interaction -> broadcast -> confirmation, judged at
   the EXECUTING block's time - 80s leaves no headroom for confirmation
   variance and would revert honest fills (orphaning the MM's hedge). 120s
   tolerates real signing + confirmation delays while staying inside the
   drift's vol regime. Requires the FE to stamp ref-price/ref-timestamp at
   SIGNATURE time (countdown-and-refresh UX), not at quote display.

**Why there is deliberately NO reference band** (a price check against
ref-price was implemented and then removed): it is self-referential.
`ref-price` and `quoted-out` sit in the SAME client-signed tuple, and
committed-out is already chained to quoted-out by the 20 bps drift check - so
a ref band would just compare two fields of one signed message against each
other. If the desk quoted far from its own declared benchmark, the client
signed that inconsistency, and the FE should reject it BEFORE signature; the
independent sanity check against reality is the native band (anchored to a
price nobody in the trade controls). For desk accountability, the audit trail
is the mechanism: declaration + freshness + falsifiability. Enforce
consistency socially (badge + de-whitelist), not circularly on-chain.

Why this works even though the chain can't check the truth of the price: a
desk that wants to shave has two options, both bad. Declare the TRUE market
price - then "this desk systematically fills below its own declared
benchmark" is a chart anyone can draw from the event log. Or LIE about the
declared price to make the fill look fair - but the declaration names venue +
timestamp to the second, venue historical data is public, and now there is
non-repudiable on-chain proof of the lie (grounds for de-whitelisting).
Dishonesty is forced out of the unobservable gap and into a publicly
falsifiable statement, in the same tx that moves the money.

The `rfq-fix` event is a complete TCA row: native oracle mid (on-chain
guardrail), declared venue price + timestamp (the MM's claim), quoted-out
(what was agreed), stx-out (what was paid). The backend reconciler can
auto-fetch the venue candle for each declared timestamp and badge every fill
verified/deviating - the desk gets continuously audited by its own product,
which is a strong thing to be able to say publicly.

Known residual: timestamp shopping within the quote window (the MM picks the
most favorable second). Bounded by auth-expiry x drift - inside a tight
window, best and worst second differ by roughly the sigma the 20 bps was
sized for. Drift caps the damage, the declaration makes it visible.

## The MM whitelist (the enforcement lever)

`fix-price` is gated by a `whitelisted-mms` map (operator-managed
`set-mm-whitelist`, read-only `is-whitelisted-mm`, ERR_NOT_WHITELISTED
u2015). Two jobs:

- **Closes the self-deal.** The SIP-018 auth binds `winner` to a principal,
  so a third party can never steal a fix - but nothing stopped a client from
  signing an auth naming THEMSELVES (or an accomplice) as winner and fixing
  their own RFQ on favorable in-band terms. Whitelisting mirrors the KYB
  gating already enforced off-chain (rfq_kyb).
- **Backs the audit trail with teeth.** The drift band caps how much a desk
  can shave; the TCA declaration makes any shave (or lie) publicly provable;
  the whitelist is what makes proof matter - caught desks lose their slot,
  with the evidence permanently on-chain.

## Future (multi-MM competition)

With multiple whitelisted desks bidding per RFQ, competition disciplines
shaving on its own, and the drift could become client-signed (like
max-premium-bps) rather than a constant. Not needed for the single-desk
phase.

## Cross-references

- Native price mechanism + calibration: `../pyth/README.md`
- Dead Arkadiko multisig-oracle alternative: `../Arkadiko-oracle/README.md`
- Contract: `../rfq/rfq-sbtc-stx-jing-v2.clar`
- RFQ product context: `../rfq/README-rfq.md`, risks: `../rfq/RISKS.md`
