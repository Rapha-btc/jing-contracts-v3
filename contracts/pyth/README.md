# Pyth on Stacks: old way vs new way (Lazer) vs no Pyth at all

Status as of **July 9, 2026**. The old Pyth contracts **stop working end of July 2026**.
The Lazer relayer plan described below is **dead**: Pyth's new licensing forbids any
public relayer / rebroadcast model (see "July 9 update"). Jing's answer is to drop
Pyth from the RFQ iteration entirely and price from miner commits - see
"The native miner-commit price" at the bottom. The Lazer sections are kept as
reference for the tech; `pyth-lazer-oracle-v1.clar` remains a vendored study copy.

Previous status (July 8): new Lazer-based contracts go live July 31 (per Jeff
Bencin, Hiro), mainnet switch date unknown, on-demand semantics unconfirmed.

`pyth-lazer-oracle-v1.clar` in this directory is a **vendored copy for study** of the
new testnet contract:
`ST3J7AB3XMNZJAYGWEKD9H0XZX1A5567177HY3AC6.pyth-lazer-oracle-v1`
([testnet explorer](https://explorer.hiro.so/address/ST3J7AB3XMNZJAYGWEKD9H0XZX1A5567177HY3AC6?chain=testnet&tab=transactions)).
It is NOT deployed by us and NOT referenced by any Jing contract.

## The old way (what all of Jing uses today)

Pull oracle over **Wormhole**, permissionless, self-serve freshness. Deployer:
`SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y` (pyth-oracle-v4 / pyth-storage-v4 /
pyth-pnau-decoder + wormhole-core, traits at pyth-traits-v2 / wormhole-traits-v2).

Flow (see `rfq/rfq-sbtc-stx-jing.clar` `fix-price`):

1. Caller fetches signed price messages (VAAs) from Pyth's public **Hermes** API —
   free, no account.
2. Caller's own tx carries the VAA(s) and calls
   `pyth-oracle-v4.verify-and-update-price-feeds` (verified on-chain against the
   Wormhole guardian multisig), writing to `pyth-storage-v4`.
3. Same tx reads the freshly stored price and applies freshness/sanity gates
   (RFQ: `MAX_STALENESS u80` seconds on `publish-time`, both feeds).

Key property: **anyone can push a price on-chain, on demand, exactly when needed.**
Update + read are atomic in one tx, so the staleness gate is always satisfiable by
bundling a fresh VAA.

## The new way (Pyth Lazer, Hiro relayer)

Architecture: four contracts — **oracle** (stable write entry, the vendored file),
**storage** (consumers read this directly; oracle exposes no reads), **governance**
(pause switch, blessed decoder, fee, fee recipient), **decoder** (trait; parses and
signature-checks the Lazer payload).

What changes:

- **No Wormhole.** The update is a `(buff 8192)` **Lazer-signed payload** verified by
  the governance-blessed decoder against Pyth's trusted Lazer signer. One signer
  scheme instead of the guardian multisig — cheaper to verify, trust concentrates in
  Pyth's signer + governance.
- **Write/read split.** `verify-and-update-price-feeds(update, <decoder>)` is called
  by relayers; consumers read `pyth-lazer-storage` directly.
- **Relayer model.** The write entry is technically public, but valid payloads only
  come from **paid Pyth Lazer/Pro subscriptions**. Hiro runs a relayer (live on
  testnet, pushing regularly) — "instead of submitting the update message yourself,
  you'll make a request to our relayer."
- **Governance pause.** `assert-active` is an emergency stop in the write path (the
  old flow had no equivalent in ours).
- **Fee.** Per-update STX fee charged to the relayer (`tx-sender`), default u0,
  governance-set.
- **Richer records.** Per feed: price, exponent, publisher-count (required in v1),
  plus optional confidence, **best-bid / best-ask**, ema-price / ema-confidence,
  feed-update-timestamp; update-level publish-time and channel. Storage enforces a
  **monotonic guard** (no rewinding to an older publish-time). Feed ids are `uint`
  (old: `buff 32`).
- v1 decoder hands every field as `(optional ...)`; the oracle enforces
  price/exponent/publisher-count and **skips** (not reverts) feeds missing them.
  Jeff says some optional storage fields become non-optional before final.

## Impact on Jing (RFQ + markets)

Everything that calls `verify-and-update-price-feeds` with VAAs + reads
`pyth-storage-v4` must eventually be rewired: new addresses, no wormhole traits, new
read tuple, uint feed ids. The Pyth touchpoint in RFQ is isolated to the
update+read block inside `fix-price` — keep it that way.

The load-bearing open question (asked in Slack, unanswered): **can we still get a
price on-chain on command?**

- If the relayer offers on-demand push (or returns the signed payload for us to
  bundle in our own tx): `fix-price` survives nearly intact — atomic
  update-then-read, new addresses.
- If the relayer only pushes on its own schedule: `fix-price` becomes read-only
  against storage and freshness depends on relayer cadence. `MAX_STALENESS u80` is
  fine at a ~10s cadence, but we inherit a **liveness dependency**: relayer down →
  every `fix-price` reverts `ERR_STALE_PRICE`. The two-phase RFQ (fix within ~4 min
  of accept) must price that in.

Upside worth noting: `best-bid`/`best-ask` in the feed would let MM quotes anchor to
the correct side of the book instead of mid ± premium.

## Open questions before any migration

1. On-demand update semantics of the relayer (endpoint? latency? who pays?).
2. Mainnet deployment address + date, and old-contract cutoff on mainnet.
3. Final required-vs-optional storage fields.
4. Fee: stays u0? charged to whom in practice?
5. Relayer SLA / what happens to consumers when it stalls.

---

## July 9 update: the relayer model is dead

Per Alex Huth (Stacks Labs): after talks with legal and Pyth, Stacks Labs
**cannot broadcast Pyth prices on a public relayer**. Pyth's new licensing
requires every user/app to have a **direct relationship with Pyth, no
intermediaries, no rebroadcast** - the intended relayer use case is
"unacceptable under any set of terms". This kills the "Hiro/Stacks Labs runs a
relayer" model in the previous section, and answers open question 1 the hard way.

Options Stacks Labs listed:

1. **Subscribe to Pyth directly** - $500 or $2,500/month depending on use case,
   own API key. Stacks Labs will publish a reference stateless contract +
   relayer (verify signatures, decode the byte buffer into Clarity types).
   Deadline to integrate: **July 31**.
2. **DIA oracle** - already on chain, free, but ~15 minute cadence.

## Alternatives assessed (July 9)

**Pyth direct ($500-$2,500/mo)**: absurd for a small project that needs two
prices (BTC, STX). Rejected.

**DIA (~15 min cadence)**: too stale to seed an RFQ quote where the MM hedges
on a CEX within seconds. Maybe acceptable as a slow sanity check, nothing more.

**Arkadiko multisig oracle** - checked on-chain, it is **dead**:

- Contract: `SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-oracle-v2-3`
  ("Arkadiko multisig oracle v2.3"). Push model: trusted signers co-sign price
  messages off-chain, a keeper submits `update-price-multi` with N-of-M
  signatures; consumers read `get-price` / `fetch-price`.
- 90k+ lifetime update txs, but the **last update was 2026-07-01**. As of
  2026-07-09 the stored STX price is $0.161 (burn height 956,153) vs $0.169
  market - ~1,215 burn blocks (~8.4 days) stale. Not viable unless Arkadiko
  revives it or we fork the pattern with our own signers.

**Native miner-commit price**: chosen. Documented below.

## The native miner-commit price (what rfq-sbtc-stx-jing-v2 now uses)

### The idea

Every tenure, miners burn real BTC (their block commits) to win the STX
coinbase. That ratio IS an on-chain BTC/STX price - manipulation-resistant
(skewing it costs real sats every tenure, with no refund for losers) and
available natively in Clarity 3+, no oracle, no subscription, no liveness
dependency:

```clarity
(get-tenure-info? miner-spend-total h)   ;; sats ALL miners committed that tenure
(get-tenure-info? miner-spend-winner h)  ;; sats the winning miner committed
(get-tenure-info? block-reward h)        ;; uSTX reward - only readable ~101 tenures later
```

where `h` is any Stacks block height inside the tenure.

Two non-obvious choices, both verified on a mainnet fork (2026-07-09,
`simulations/verify-native-price-rfq-v2.js`,
https://stxer.xyz/simulations/mainnet/ea6d44b9f9ba029861c59ff00791c01f):

- **Use `miner-spend-total`, NOT `miner-spend-winner`.** Sortition is a
  weighted lottery: every miner's commit is spent win or lose, so the market
  collectively pays `total` sats for one reward. Observed: the winner commits a
  constant 40,000 sats across all sampled tenures (one dominant miner winning
  with ~27% of total commit) while total runs 90k-200k. Winner-vs-reward would
  imply ~1.25M STX/BTC - 3.4x off market.
- **Use the fixed 500 STX coinbase, not `block-reward`.** `block-reward` only
  matures ~101 tenures (~17h) after the fact - useless for a fresh price. The
  constant ignores tx fees in the reward, which is folded into calibration.

### The mechanism in rfq-sbtc-stx-jing-v2

`get-native-price` samples `miner-spend-total` at 6 offsets
`(list u1 u122 u244 u366 u488 u610)` stacks blocks back (~one offset per tenure,
~the last hour), averages the spend, and returns

```
oracle-price = 100 * 500_STX_uSTX * 1e8 * commit-efficiency-bps
               / (10000 * avg-spend-sats)
```

which is STX-per-BTC scaled by 1e8 - the exact shape of the old Pyth cross
`(price-btc-usd * 1e8) / price-stx-usd`, so the entire downstream band math
(`stx-mid`, floor, ceiling, `MAX_PREMIUM_BPS`) is unchanged. `fix-price` lost
all five Pyth params (`vaa-x`, `vaa-y`, three trait refs) - FE/BE no longer
fetch VAAs from Hermes at all. `MAX_STALENESS` / `MAX_CONF_RATIO` gates are
gone; freshness is inherent (the sample window IS the last ~6 tenures).

### Calibration: miners commit ~109% of coinbase-only value

Mainnet-fork numbers (2026-07-09, burn height 957,368):

| offset | miner-spend-total | miner-spend-winner |
|--------|-------------------|--------------------|
| -1     | 200,000 sats      | 40,000 sats        |
| -122   | 200,000 sats      | 40,000 sats        |
| -244   | 160,000 sats      | 40,000 sats        |
| -366   | 120,000 sats      | 40,000 sats        |
| -488   | 90,000 sats       | 40,000 sats        |
| -610   | 110,000 sats      | 40,000 sats        |

6/6 distinct tenures (dedup by `burnchain-header-hash` TAIL - the leading
bytes are Bitcoin PoW zeros). Average 146,666 sats per 500 STX coinbase.

- Raw implied (efficiency 100%): **340,911 STX/BTC** vs market 371,645
  (BTC $62,957 / STX $0.1694) - only **-8.3% below market**.
- Implied miner efficiency: **~109%** - miners commit MORE than coinbase-only
  value because they price in tx fees and compete. The intuitive "miners keep a
  15% margin" prior (default 8500 bps) put the mid -22% off market, i.e. the
  entire +/-20% premium band below reality. Hence:
- `commit-efficiency-bps` defaults to `u10000`, operator-settable within
  `u5000`-`u15000` via `set-commit-efficiency-bps` (ERR_BAD_CALIBRATION
  u1021). ~u10900 would have centered the band on market that day. Calibrate
  against the CEX before go-live and re-check occasionally.

### What kind of price this is (vs Pyth)

Same ballpark, different animal. Raw, the native price landed within ~8% of
Pyth (340,911 vs 369,766 STX/BTC on 2026-07-09), and that gap is a fairly
stable calibration constant (the miners' commit-to-value ratio), not random
error. Calibrated, they agree to within a couple percent. But structurally:

- **It is a trailing ~1-hour moving average.** Six point-samples over the last
  ~610 stacks blocks (~6 tenures), meaned. It slides forward every block, but a
  fast market move takes ~an hour to fully show up in it.
- **It is chunky.** The underlying signal updates once per tenure (one Bitcoin
  block, ~10 min) - miners commit per sortition. So it is an average of 6
  discrete auction results, not a continuous curve.
- **The input is already a forward-looking bet, not a spot quote.** Each commit
  is a miner's estimate of what the STX reward will be worth to them (fees and
  margin included) - which is exactly why the `commit-efficiency-bps`
  calibration knob exists.
- **Pyth, for contrast**, does not scrape venues itself: ~100+ first-party
  publishers (exchanges, MMs, trading firms) each push their own price +
  uncertainty several times per second, and Pyth aggregates them into one price
  with a confidence interval (the `conf` field the old contract gated on). So:
  live cross-venue consensus, sub-second freshness.

|                    | native miner-commit            | Pyth                            |
|--------------------|--------------------------------|---------------------------------|
| freshness          | ~10 min granularity, ~1h window| sub-second                      |
| source             | one on-chain auction (miners)  | ~100 publishers across venues   |
| trust              | none (economics only)          | Pyth publisher set + signer     |
| cost               | free forever                   | $500-2,500/mo now               |
| manipulation cost  | real sats burned per tenure    | compromise publishers/signing   |
| fit                | guardrail band                 | tradeable mid                   |

Design conclusion: this replaces Pyth as a **sanity fence, not a price feed**.
The fence must be wide enough to absorb the lag during fast moves - one more
reason to keep the calibration conservative (mid slightly BELOW market) rather
than tightly centered. The asymmetry: a mid that is too low only loosens the
floor (client still protected by `min-stx-out`); a mid that is too high pushes
the floor above market and blocks honest fills. Err low. Practical setting:
measure implied efficiency over ~a week and set the knob near the 10th
percentile (~u10400-u10600 expected), not at the single-day center (~u10850).

### Known limitations / risks

- **It is a guardrail, not a tight mid.** Single-tenure commits are noisy
  (90k-200k sats in one hour). The client's `min-stx-out` and the SIP-018
  signed `max-premium-bps` remain the real price protection; the native band
  exists to stop gross deviation.
- **Dominant-miner skew**: one miner wins most tenures with a constant commit.
  Raising its own commit raises `total` and lowers the implied STX/BTC. Cost is
  real sats per tenure across the 6-sample window, but a miner-MM hybrid is the
  adversary to think about.
- **`COINBASE_USTX u500000000` is hardcoded** (post-April-2026 halving; next
  halving ~2030 needs a redeploy or the calibration knob).
- **Offsets are approximate**: ~122 stacks blocks per tenure assumed; two
  offsets occasionally landing in the same tenure just double-weights it.
  Upgrade path: dedup by `burnchain-header-hash` on-chain.
- Tx fees in the true reward and miner strategy shifts both land in the single
  `commit-efficiency-bps` knob.

### Deferred design idea (do not implement yet)

Make the client quote carry BOTH a fixed amount AND a max premium; at
`fix-price` the MM's committed-out must (a) sit inside the native-price
guardrail band, and (b) drift no more than ~0.5% from the quoted fixed amount.
The native price then only needs to catch gross manipulation, while quote-time
pricing does the precision work.

### Files

- `rfq/rfq-sbtc-stx-jing-v2.clar` - the contract (Pyth removed).
- `simulations/verify-native-price-rfq-v2.js` - mainnet-fork probe: deploys
  core + market under a throwaway deployer, evals per-tenure spends +
  `get-native-price`, compares against live market, prints the implied
  efficiency to set the calibration knob.
- Still TODO: mirror the Pyth removal in `simulations/verify-rfq-sbtc-stx-jing.js`
  (still builds VAA args) and faktory-dao `rfq-sbtc-stx-jing-template.ts`.
