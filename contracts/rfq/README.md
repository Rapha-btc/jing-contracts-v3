# `rfq-sbtc-usdcx-jing` — competitive RFQ market for sBTC ⇄ USDCx

> **Status: DRAFT.** Not deployed, not wired into `Clarinet.toml`. `clarinet check`
> passes. This document describes the implemented contract; for *why* the design
> is shaped this way (RFQ method A vs B, the comparison), see
> [`README-rfq.md`](./README-rfq.md).

A **Request-for-Quote** market where market makers (MMs) compete to give a client
the best price on a one-shot `sBTC → USDCx` swap. Unlike the batch-auction market
(`markets-sbtc-usdcx-jing`, where everyone clears at the Pyth oracle), here MMs
**compete on a spread** and the winner takes the whole fill. Price is
**`Pyth BTC/USD × (1 − premium)`** — the MM commits to a *spread*, not an absolute
price, so a BTC tick between quote and fill can't blow anyone up.

---

## Lifecycle

```
            on-chain                        off-chain (relayer)                 on-chain
  ┌────────────────────────┐   ┌─────────────────────────────────────┐   ┌──────────────────┐
  │ 1. open-rfq (client)   │   │ 2. MMs quote Pyth±premium           │   │ 4. fill-rfq      │
  │    escrow sBTC,        │──▶│ 3. relayer ranks → client picks     │──▶│   (winning MM)   │
  │    set min-usdc-out,ttl│   │    winner & SIGNS a SIP-018 auth    │   │   atomic swap    │
  └────────────────────────┘   └─────────────────────────────────────┘   └──────────────────┘
                                                                            │ (or, if unfilled)
                                                                            ▼
                                                                     cancel-rfq → sBTC back
```

1. **`open-rfq`** — the client escrows its sBTC and publishes the RFQ with an
   absolute floor (`min-usdc-out`) and a TTL. The client is committed for the TTL.
2. **Quote & rank** *(off-chain)* — MMs send `Pyth ± premium` quotes to the relayer,
   which ranks them and returns the best to the client.
3. **Authorize** *(off-chain)* — the client picks the winner and **SIP-018-signs** an
   authorization naming that MM and the spread it quoted. (See [Authorization](#sip-018-authorization).)
4. **`fill-rfq`** — the winning MM submits the signature + a fresh Pyth VAA. The
   contract verifies, prices the swap, the MM pays USDCx, and the escrowed sBTC is
   released to the MM. Atomic.
   - If no MM fills before expiry, **`cancel-rfq`** returns the sBTC to the client.

---

## Custody model (why the client escrows and the MM submits)

Clarity has **no token allowance** — a contract can move token `T` from principal
`P` only if `P` is `tx-sender` or the contract itself. So the side that does *not*
submit the fill must pre-escrow:

- The **client escrows sBTC** in `open-rfq` (it's selling it anyway).
- The **winning MM is `tx-sender`** in `fill-rfq`, so it pays USDCx directly and the
  contract releases the escrowed sBTC. The MM **locks no capital** until it wins and
  fills atomically.

---

## SIP-018 authorization

The client signs one structured message off-chain; the winning MM carries it into
`fill-rfq`. Rebuilt on-chain by `build-auth-hash` and checked with
`secp256k1-recover?` + `principal-of?`.

**Signed tuple** (domain `{ name: "jing-rfq", version: "1", chain-id }`):

```
{ market, rfq-id, winner, max-premium-bps, expiry }
```

| Field | Purpose |
|---|---|
| `market` (= `current-contract`) | binds the sig to **this** deployment — no cross-market replay |
| `rfq-id` | binds to this specific auction (consumed on fill) |
| `winner` | the chosen MM; bound to `tx-sender` at fill, so **only that MM** can fill |
| `max-premium-bps` | pins the MM to the spread it quoted (`premium-bps ≤ this`) |
| `expiry` | `stacks-block-height` deadline (no `u0` sentinel); after it, the sig can't fill |

**Why the client signs:** the premium is the prize. If `fill-rfq` were
permissionless, a mempool watcher could copy the winner's tx and steal its spread,
so MMs would stop quoting tight. The signature binds the fill to the chosen MM and
closes that snipe. (Role reversal vs 0x/Hashflow: there the *maker* signs and the
taker submits; here the **MM is the submitter** — being `tx-sender` *is* its
authorization — so the thing that needs signing is the **client's choice of winner**.)

**Frontend:** sign the `build-auth-hash` digest with `signMessageHashRsv`
(secp256k1, **RSV** order, 65 bytes); the signing key must include the `01`
compression suffix so the recovered principal matches.

---

## The three protective bounds

| Bound | Set where | Kind | Guards against |
|---|---|---|---|
| `min-usdc-out` | `open-rfq`, client, **immutable** | absolute USDCx | Pyth crazy-**low** (client underpaid). Set *loose* (below expected) so normal drift never trips it. |
| `max-usdc-out` | `fill-rfq`, MM (not signed) | absolute USDCx | Pyth crazy-**high** (MM overpays). The mirror of the client floor. |
| `max-premium-bps` | the **signed** auth | relative (oracle) | the MM filling wider than the spread it quoted. Drift-immune → no spurious reverts. |

The client **accepts ordinary oracle drift** between sign and fill — that's the
premise of `Pyth ± premium` pricing. The two absolute bounds are only catastrophe
backstops. Note the post-condition asymmetry: the MM *could* also cap its USDCx
outflow with a `willSendLte` post-condition (it's `tx-sender`), but the **client
cannot** (it isn't), which is why both absolute bounds live in the contract.

---

## Pricing math

Decimals (must match the deployed pair): **sBTC = 8, USDCx = 6, Pyth = 8.**

```
usdc_mid        = sbtc_in × pyth_price / (PRICE_PRECISION × DECIMAL_FACTOR)   ; = sbtc_in × price / 1e10
usdc_out        = usdc_mid × (BPS_PRECISION − premium_bps) / BPS_PRECISION
fee             = usdc_out × FEE_BPS / BPS_PRECISION                          ; 0.10%, one-sided
client_receives = usdc_out − fee
```

**Pyth is pull-based on Stacks** — the stored price is only as fresh as the last
push. So `fill-rfq` **refreshes in-tx**: it calls `pyth-oracle-v4`
`verify-and-update-price-feeds` with a VAA (fetched from Hermes by the MM at fill
time) before reading `pyth-storage-v4` `get-price`. Sanity gates: **staleness**
(`publish-time` within `MAX_STALENESS` = 80s) and **confidence** (`conf <
price/50`).

**Fee** is taken **one-sided**, from the USDCx output only — a fee-incidence choice
(the client bears it; the MM gets the full sBTC side). A two-sided split was
deliberately declined.

---

## Public interface

### Client
- `open-rfq (sbtc-in uint) (min-usdc-out uint) (ttl uint) (x <ft-trait>) (x-name (string-ascii 128))` → `(ok id)`
  Escrows `sbtc-in`, records the absolute floor and `expiry = stacks-block-height + ttl`.
- `cancel-rfq (id uint) (x <ft-trait>) (x-name (string-ascii 128))` → `(ok sbtc-in)`
  Callable by **anyone after expiry** (sBTC always returns to the original client).

### Market maker
- `fill-rfq (id uint) (premium-bps uint) (max-usdc-out uint) (max-premium-bps uint) (auth-expiry uint) (sig (buff 65)) (vaa (buff 8192)) (pyth-storage <…>) (pyth-decoder <…>) (wormhole-core <…>) (x <ft-trait>) (x-name (string-ascii 128)) (y <ft-trait>)` → `(ok { usdc-out, fee, client-receives, price })`
  The winning MM submits this. `tx-sender` must be the signed `winner`.

### Read-only
- `build-auth-hash (rfq-id) (winner) (max-premium-bps) (auth-expiry)` → `(buff 32)` — the SIP-018 digest to sign.
- `get-domain-hash` → `(buff 32)`
- `get-rfq (id)` → `(optional { client, sbtc-in, min-usdc-out, expiry, open })`
- `get-next-rfq-id` → `uint`

### Admin (`operator`)
- `initialize (x) (y) (feed (buff 32)) (min-x)` — set token-x (sBTC), token-y (USDCx), Pyth feed id, min sBTC. One-shot.
- `set-treasury`, `set-paused`, `set-operator`, `set-min-sbtc-in`

---

## Error codes

| Code | Name | Meaning |
|---|---|---|
| u1001 | `ERR_AMOUNT_TOO_SMALL` | `sbtc-in`/`min-usdc-out` below minimum |
| u1005 | `ERR_STALE_PRICE` | Pyth `publish-time` older than `MAX_STALENESS` |
| u1006 | `ERR_PRICE_UNCERTAIN` | Pyth `conf ≥ price/50` |
| u1009 | `ERR_ZERO_PRICE` | no/zero oracle price |
| u1010 | `ERR_PAUSED` | contract paused |
| u1011 | `ERR_NOT_AUTHORIZED` | caller isn't operator |
| u1018 | `ERR_ALREADY_INITIALIZED` | `initialize` called twice |
| u1019 | `ERR_WRONG_TRAIT` | passed FT trait ≠ configured token |
| u2001 | `ERR_RFQ_NOT_FOUND` | unknown `id` |
| u2002 | `ERR_RFQ_CLOSED` | already filled/cancelled |
| u2003 | `ERR_EXPIRED` | RFQ past its `expiry` (fill) |
| u2004 | `ERR_NOT_EXPIRED` | cancel attempted before expiry |
| u2005 | `ERR_PREMIUM_TOO_HIGH` | `premium-bps > max-premium-bps` |
| u2006 | `ERR_BELOW_MIN_OUT` | `usdc-out < min-usdc-out` (client floor) |
| u2007 | `ERR_BAD_AUTH` | signature didn't recover to the client |
| u2008 | `ERR_AUTH_EXPIRED` | `stacks-block-height ≥ auth-expiry` |
| u2009 | `ERR_ABOVE_MAX_OUT` | `usdc-out > max-usdc-out` (MM ceiling) |

---

## Security properties

- **Anti-snipe** — the client's SIP-018 sig binds the fill to the chosen MM; no one
  can copy the winner's tx to steal the premium.
- **No last-look** — the client holds the option; an MM that no-shows just isn't the
  one that fills, and the client reclaims (`cancel-rfq`) or re-signs for the runner-up.
- **No cancel-race grief** — cancel is expiry-only, so a client can't yank escrow to
  burn a racing MM's fill gas. Keep TTL short (~30–60s) so escrow is never locked long.
- **Oracle safety** — in-tx VAA refresh + staleness + confidence gates; the two
  absolute bounds backstop a deranged oracle.
- **No cross-market/chain replay** — `market: current-contract` + domain `chain-id`.

**Reputation is intentionally off-chain.** MM reliability scoring lives at the
relayer, which sees every quote, authorization delivery, fill, and the price path —
so it can judge fairly for free. An on-chain flag would be a *forgeable claim*
(the client controls its own signature and the auth delivery), redundant with what
the relayer already knows — so it is deliberately **not** in this contract.

---

## Open TODOs before promotion

- **Wire into `Clarinet.toml`** under `[contracts.rfq-sbtc-usdcx-jing]`.
- **`jing-core` logging** — add a `log-rfq-*` sink and call it from `fill-rfq` to
  mirror the batch-auction event trail.
- **Canonical registration** in `initialize` — mirror the batch market's `jing-core`
  attestation so events can't be impersonated.
- **Confirm USDCx = 6 decimals** (assumed by `DECIMAL_FACTOR = 100`) for the deployed pair.
