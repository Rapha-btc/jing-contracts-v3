# markets-sbtc-stx-jing-v2

Working notes for the v2 auction market: the maker/taker split, the taker
rebate, and every path a participant can take through a cycle. The oracle
question (section 2) is researched but **not** implemented, because the answer
turned out to be "do nothing yet". Oracle measurements are from **2026-08-16**;
sections 1 and 3 reflect the contract as of **2026-08-19**.

The sBTC/USDCx market is the same code with SIP-010 on both sides instead of
native STX - everything here applies to it unchanged.

---

## 1. Taker rebate — implemented

### The problem

A blind-batch auction has no order book to sit on. Nothing rewards the
depositors who escrow early and wait out the window — yet they are the only
reason a `swap` caller can clear immediately. Today `FEE_BPS u10` is charged
symmetrically off both clearing sides and both slices go to the treasury, so a
depositor who sat through the whole cycle pays exactly what someone who arrived
at the last second pays. Cold-start problem, self-inflicted.

### Who is the taker

The contract already draws the line for us. `swap` is the only path that
deposits, closes and settles in a single transaction — everyone else in the
cycle was already escrowed when it fired. So:

- **taker** = the `swap` caller
- **makers** = every other depositor who actually filled in that cycle

No new bookkeeping, no timestamps, no heuristics.

### The mechanism

```
TAKER_REBATE_BPS u10          on top of FEE_BPS u10
```

`swap` withholds the rebate from the caller's deposit before it enters the
pool, parks it in `pending-rebate-x` / `pending-rebate-y`, and settlement adds
it to the **opposite** side's distribution pool:

```clarity
(var-set settle-token-x-after-fee
  (+ (- token-x-clearing token-x-fee) (var-get pending-rebate-x)))
```

The taker deposits token-x; token-x is what token-y depositors receive; so
adding it there splits it across exactly the makers who filled, **in proportion
to their fill**, using the pro-rata machinery that already exists. Both vars are
zeroed on the way out so a later settlement cannot pay it twice.

Net effect per side:

| | pays |
|---|---|
| resting depositor (maker) | 10 bps, unchanged |
| `swap` caller (taker) | 20 bps — 10 to treasury, 10 to the other side |

### Why withhold at deposit rather than charge at settlement

Charging at settlement would mean adjusting one depositor's payout inside a
distribution that is pro-rata over the whole side — the machinery has no hook
for that, and adding one is a lot of surface for 10 bps. Withholding up front
keeps every downstream calculation untouched.

### Known wart — RESOLVED by fill-or-kill

*Original concern:* the rebate is charged on the caller's full deposit, not the
portion that fills, so a partially-clearing `swap` would roll the remainder to
the next cycle having already paid taker pricing for what became maker
behaviour.

*Resolution:* `swap` is now **fill-or-kill**. A swap that would fill nothing
reverts `ERR_NOTHING_FILLED (u1021)` and one that would only partially fill
reverts `ERR_PARTIAL_FILL (u1023)`; the parked rebate unwinds with the
transaction. There is no longer a path where a taker-priced deposit rests as a
maker, so charging on `amount` is now equivalent to charging on `filled`. A
taker who wants the remainder to rest swaps the absorbable size, then
maker-deposits the rest in a second tx.

The companion gap — merging into your own resting position to convert it while
paying rebate on the fresh slice only — is closed by
`ERR_HAS_RESTING_POSITION (u1024)`. See section 3.

### Status

`clarinet check` → 23 contracts, 0 errors. Not deployed (the v2 stack needs
`jing-core-v3`: the deployed `jing-core-v2` has the 12-param `log-settlement`
and rejects the 14-param v2 call with "expecting 12 arguments, got 14").

**Fully tested as of 2026-08-19** — 113/113 clarinet across the four suites, RV
500-run fuzz clean (14 market + 3 vault invariants), stxer mainnet-fork
harnesses 22/22 (market) and 29/29 (vault). The rebate specifically:
single-maker payout asserted to the sat (`net - fee + rebate`), multi-maker
pro-rata split, FOK reverts unwinding the rebate, the dust case where the
rebate rounds to zero, and the `u1024` merge refusal. See
`simulations/README-stxer.md` for the coverage matrix and session links.

---

## 2. The oracle — researched, deliberately not changed

### What Pyth actually did

The **Pyth Core upgrade landed 31 July 2026**. Historically Core was
permissionless: fetch a signed VAA from the public Hermes API for free, bundle
it in your own transaction, and `pyth-oracle-v4.verify-and-update-price-feeds`
checks it against the Wormhole guardian multisig. Anyone could push a price
on-chain, on demand, and update+read were atomic in one tx — which is exactly
what a settle path needs.

Post-upgrade, Pyth's position is that pulling live prices requires an **active
subscription and an API key**, folding Core into the same paid system Pyth Pro
clients already use.

### What the tiers actually buy

| Tier | Price | What you get |
|---|---|---|
| Free | $0 | View-only in Pyth Terminal. 10s updates. **No API key. No display, non-display or redistribution rights.** Useless on-chain. |
| **Starter** | **$500 / mo** | **All crypto symbols.** Up to 1s updates, full history, API key, display rights, no redistribution. General support. |
| Pro | from $2,500 / mo | Adds **equities, futures, commodities, rates**. Up to 1ms updates, >95% accuracy vs NBBO, enterprise SLAs, limited redistribution. Priced by asset-class bundle — US Equities $5k, All Asset Classes $10k. |

**Jing needs BTC/USD and STX/USD. Both are crypto. Starter is the tier.** The
$2,500 number that has been floating around is the entry price for *non-crypto*
asset classes and buys us nothing — the only thing it would add is 1ms instead
of 1s updates, which is far below the resolution a batch auction settling once
per cycle can use.

So the real question was never "$500 or $2,500". It is "$500 or $0".

### Is the old path actually dead? Measured: no.

Two things checked on 2026-08-16:

**On-chain.** `SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4` has 65
lifetime calls; the last successful `verify-and-update-price-feeds` was
**2026-07-09**. Five weeks of silence.

**Off-chain.** Hermes still answers:

```
GET https://hermes.pyth.network/v2/updates/price/latest?ids[]=e62df6c8...415b43
→ HTTP 200, valid PNAU payload
```

No key, no account, no subscription.

The silence on-chain is **not** the feed breaking — it is nobody having used the
auction since July. The v4 contracts are permissionless and still deployed;
Hermes still hands out signed payloads. As far as the chain is concerned,
`settle-with-refresh` works today exactly as it did in June.

The distinction that matters: **technically live, contractually ambiguous.**
Pyth has said Core needs a subscription; the free endpoint has not been switched
off. Building a business on an endpoint someone has announced they intend to
close is a risk, not a plan — but it is also not an emergency, and it does not
justify rewriting a working settle path this week.

### There is no "new Pyth" to upgrade to on Stacks

Checked the deployer: mainnet has only the v4 generation
(`pyth-oracle-v4`, `pyth-storage-v4`, `pyth-pnau-decoder-v3`, `pyth-governance-v3`,
`wormhole-core-v4`, traits), all from 2025-08-14. **No Lazer contracts are
deployed to Stacks mainnet.** The vendored `pyth/pyth-lazer-oracle-v1.clar` is a
copy of a *testnet* contract.

And per `pyth/README.md`, the Hiro/Stacks-Labs relayer plan that would have made
Lazer usable is dead: Pyth's licensing requires every consumer to hold a direct
relationship with Pyth, no intermediaries and no rebroadcast.

So "upgrade to the new Pyth" is not currently an available action. There is
nothing on mainnet to point at.

### The distinction that decides this: fence vs mid

`rfq-sbtc-stx-jing-v2` solved its oracle problem with the **native miner-commit
price** — deriving BTC/STX from what miners burn per tenure. It is free forever,
has no liveness dependency, and is manipulation-resistant because skewing it
costs real sats every tenure.

**It does not transfer to the auction, and it is important to be clear about
why.**

In the RFQ, the market maker quotes the price and the native price is only a
**guardrail** — a band that catches gross deviation while `min-stx-out` and the
signed `max-premium-bps` do the real protection. Its own README is explicit:
*"this replaces Pyth as a sanity fence, not a price feed."*

In the auction, the oracle price **is the clearing price**. Every filled
depositor trades at it. And the native price is a trailing ~1-hour moving
average of six discrete per-tenure samples. Settle a batch at an hour-old price
during a fast move and whoever is on the right side of the lag is filled at a
stale rate by whoever is on the wrong side. The limit price protects each user
from a price they explicitly rejected — it does *not* protect them from a
settlement that was inside their limit but off-market.

One mitigating structural fact: Jing's batch is **peer-to-peer**. A stale price
transfers value between the two sides of the batch, it does not drain a pool or
a treasury the way it does on an oracle-priced AMM. That makes it survivable
where it would be fatal elsewhere. But "our users lose to each other" is not a
feature.

Same reasoning kills the Arkadiko-style custom oracle, plus one more: Yguazu
would own the venue, run the market maker **and** sign the settlement price.
That is the first thing anyone will point at, and they would be right to.

DIA at ~15-minute cadence has the identical lag problem, worse.

### Options, honestly ranked

| Option | Cost | Verdict |
|---|---|---|
| **Keep v4 + Hermes as-is** | $0 | Works today, measured. Correct default. Carries a "the endpoint may close" risk with no notice period. |
| **Subscribe to Starter** | $6k / yr | The only path to a genuine tradeable mid. Needs ~$6M/yr of settled volume to break even on the 10 bps platform fee alone. |
| Native miner-commit price | $0 | **Wrong tool for an auction.** Right for RFQ, where it already ships. |
| Arkadiko-style signed oracle | ~$0 | Self-dealing. Don't. |
| DIA | $0 | 15-minute lag, same failure as above but worse. |

**Recommendation: change nothing in the oracle path for now.** Ship the rebate,
keep v4 + Hermes, and treat the $500/mo as a decision gated on volume rather
than on the calendar — if the auction cannot justify $6k/yr, that is itself the
answer, and it is a much cheaper answer than a rewrite.

Two things to do that are not code:

1. **Monitor Hermes.** A cron that pings the endpoint and alerts on non-200 turns
   an unannounced shutoff from an outage into a scheduled migration.
2. **Check RedStone on Stacks.** Pull-based like Pyth. If it is live and cheaper,
   this whole section is moot. *Not yet verified — do this first, it is a
   20-minute answer.*

---

---

## 3. Participant paths — what to call, when, and what it costs

Added 2026-08-19 alongside the `ERR_HAS_RESTING_POSITION (u1024)` guard. Every
route in and out of a cycle, and the maker/taker line each one sits on.

### The rule

The **maker gate** (`would-take-as-x` / `would-take-as-y`) is what separates the
two roles. Any path that would leave you crossing live resting size on the
other side is refused with `ERR_MUST_USE_SWAP (u1022)`, except the two paths
that deliberately charge for crossing: `swap` and `reprice-or-swap`.

- **maker** — escrows early, waits out the window, pays `FEE_BPS u10`, and
  *receives* a pro-rata share of any taker rebate that cycle.
- **taker** — `swap` or a crossing `reprice-or-swap`; forces immediate
  settlement and pays `TAKER_REBATE_BPS u20` on top of the fee.

### Entering with no position

| Call | Crossing? | Result |
|---|---|---|
| `deposit-token-x` / `-y` | no (`u1022` if it would) | Rests as a maker |
| `swap` | yes, that is the point | Deposits, closes and settles in one tx. **Fill-or-kill**: 100% or the whole tx reverts (`u1021` nothing filled, `u1023` partial). Pays 20 bps. |

### You already rest size on that side

| Call | Crossing? | Result | Cost |
|---|---|---|---|
| `deposit-token-x` / `-y` (top-up) | no (`u1022`) | Adds size: `existing + amount`, overwrites the limit | fee only |
| `set-token-x-limit` / `-y` | no (`u1022`) | Retargets the limit, **aborts** rather than trade | free |
| `reprice-or-swap-token-x` / `-y` | yes | Retargets; if it crosses, converts FOK **on the whole resting size** | 20 bps on the resting size |
| `cancel-token-x-deposit` / `-y` | n/a | Full refund, out of the cycle | free |
| `close-and-settle-with-refresh` (permissionless) | n/a | Your resting size fills **as a maker** at the batch clearing price | fee only, **earns** rebate |
| `swap` | — | **Refused, `u1024`** | — |

### Why `swap` refuses a caller with a resting position

`deposit-*-core` merges into an existing same-side position (`existing +
amount`) and overwrites its limit. Left unguarded, `swap` would silently
re-flag non-crossing maker inventory as a taker fill while charging rebate on
the fresh slice alone — rest 100k sats, swap 2k, convert the lot for 4 sats of
rebate where a `reprice` of that same 100k charges 200. The merge is refused
rather than priced, so `swap` means one thing: **a new taker position, filled
100% or not at all**.

### The escape hatches, ranked by cost

A holder of resting size who wants it converted has three routes, cheapest
first:

1. **`close-and-settle-with-refresh` on the market** (permissionless — a
   keeper can call it directly from its own EOA, no vault wrapper needed). The
   position fills as a **maker**: pays the fee, *collects* a share of any taker
   rebate. Caveat: it only fills if the clearing price satisfies the limit and
   there is opposite-side size; otherwise it rolls to the next cycle. Cheap but
   batch-timed.
2. **`reprice-or-swap`** — immediate conversion, 20 bps on the resting size.
   Buy immediacy when you cannot wait for the batch.
3. **`cancel` then `swap`** — same 20 bps, two transactions, and you lose your
   queue slot. Only worth it if you also want to change size.

### Vault / keeper implications

The v2 vaults need **no contract change** for any of this. `execute-jing-swap`
now surfaces `u1024` when the vault already rests on that side; the keeper
should treat it as a routing signal, not an error:

- want the batch price → call `close-and-settle-with-refresh` on the **market**
  directly (permissionless, vault untouched)
- need it now → `execute-jing-reprice` with a crossing limit
- want out → `cancel-jing-sbtc` / `cancel-jing-stx` (free, empty `as-contract? ()`
  allowance)

### Regression coverage

`tests/markets-sbtc-stx-jing-v2.test.ts`:

- `swap refuses a caller who already rests size on that side` — asserts
  `u1024`, then that **nothing moved** (position, limit, wallet balance and
  cycle all unchanged), then that cancel-then-swap fills clean.
- `maker gate: crossing deposit reverts ERR_MUST_USE_SWAP, non-crossing
  variants pass`, `...applies to top-ups`, `...applies to set-token-*-limit` —
  the `u1022` matrix.
- `multi-maker fill: batch settlement splits the fill AND the rebate pro-rata`
  — one taker clears against ALL opposite makers pro-rata (100/50 STX makers
  split 6660/3330 = exactly 2:1, 1-sat treasury dust). A batch auction has no
  1:1 matching.

## Open questions

1. Charge the taker rebate on `filled` instead of `amount`? (see wart above)
2. Should the rebate be operator-settable rather than a constant, so it can be
   tuned once there is real flow to observe?
3. Does RedStone run on Stacks, at what cadence and price?
4. If Hermes closes, what is the actual notice period — has Pyth published one?
5. Tests for the rebate: the invariant to write first is *makers receive
   strictly more in a taker-initiated cycle than in an equivalent
   non-taker-initiated one.*

## Sources

- [Pyth pricing](https://www.pyth.network/pricing) — tier table, verbatim
- [The Pyth Core Upgrade](https://www.pyth.network/blog/the-pyth-core-upgrade)
- `contracts/pyth/README.md` — the July 9 relayer post-mortem and the native
  miner-commit design
- On-chain and Hermes measurements taken 2026-08-16
