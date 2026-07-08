# Pyth on Stacks: old way vs new way (Lazer)

Status as of **July 8, 2026**. The old Pyth contracts **stop working end of July 2026**;
the new Lazer-based contracts go live **July 31** (per Jeff Bencin, Hiro). Mainnet
switch date: **unknown** (asked, unanswered). No Jing code changes yet — the new way
is testnet-only and its on-demand semantics are unconfirmed.

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
