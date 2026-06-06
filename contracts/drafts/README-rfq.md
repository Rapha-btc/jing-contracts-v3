# RFQ market for sBTC ⇄ USDCx — design notes

A competitive **Request-for-Quote** layer where the client runs a short auction and
market makers (MMs) compete to give the best price. Price is quoted as
**Pyth reference ± premium**, so MMs commit to a *spread*, not an absolute price —
a momentary BTC tick between quote and fill doesn't blow anyone up.

This is a **new product alongside** `markets-sbtc-usdcx-jing.clar`, not a replacement:

| | Batch auction (existing) | RFQ (this) |
|---|---|---|
| Price source | Pyth **is** the price | Pyth ± **winning MM premium** |
| MM behaviour | passive, all clear at oracle | **compete**, winner takes the fill |
| Fill | pro-rata across depositors | winner-take-all |
| Best for | many small symmetric flows | one client with size, best-ex |

Both can share `jing-core` logging and the same escrow/custody model. RFQ changes
**price discovery and matching**, not custody.

---

## The Clarity constraint that shapes everything

Clarity has **no ERC-20-style allowance**. A contract can move token `T` from
principal `P` only if `P` is `tx-sender` or `P` is the contract itself
(`as-contract`). There is no "relayer submits, pulls from both wallets" atomic
swap unless someone pre-escrowed.

So the only clean topology is:

> **Client escrows the sBTC** (they're committed to selling it anyway) →
> MMs compete → **the winning MM submits the fill**, becomes `tx-sender`, the
> contract pulls the MM's USDCx in that same tx, pays the client, releases the
> escrowed sBTC to the MM.

MMs lock **zero** capital until they win and execute atomically. The client's
`min-usdc-out` floor is what enforces best-execution on-chain.

---

## Two ways to run the competitive auction

### Option A — Commit-reveal (fully on-chain)

Round 1: each MM posts `hash(premium, nonce)` + a bond. Round 2: MMs reveal;
the contract ranks and the lowest premium-to-client wins. Non-revealers forfeit
their bond.

**Pros**
- **Trustless** — no backend in the critical path; censorship-resistant.
- **Auditable** — every commit + reveal is on-chain forever; disputes impossible.
- **Self-contained** — no off-chain infra to build, host, or secure.
- **Honestly sealed** — the hash hides premiums until reveal; sniping is impossible.

**Cons**
- **Slow** — ≥ 2 on-chain phases × several blocks each; a minute-plus end to end.
- **Expensive for everyone** — every MM pays gas to commit *and* reveal, even losers.
- **Capital lock-up** — MMs must bond up front to deter non-reveal grief.
- **Grief vector** — an MM can commit, win, then refuse to reveal to spoil the auction (you only recover the bond, not the trade).
- **BTC drift** — the longer the ceremony, the more Pyth moves between commit and fill (premium-as-spread mitigates, doesn't eliminate).
- **Worse UX** — the client waits through a multi-block state machine.

### Option B — Signed off-chain quotes, on-chain settle (this draft)

Client escrows sBTC and posts an intent to the backend relayer. MMs reply with
`Pyth ± premium` quotes (off-chain). The relayer returns the top quotes; the
client picks the winner and **SIP-018-signs an authorization** naming that MM and
the spread it quoted (`max-premium-bps`). The winning MM submits the fill on-chain
carrying that signature, which the contract verifies. (The on-chain-relevant
signature is the **client's selection** — see the role-reversal note below.) An
absolute `min-usdc-out` set by the client at `open-rfq` is the separate, loose
catastrophe floor against a crazy oracle — see the two-floors section below.

**Pros**
- **Fast** — quotes are instant (off-chain); only the winning fill is one on-chain tx.
- **Gasless for losers** — non-winning MMs pay nothing → tighter, more frequent quotes.
- **No capital lock-up to quote** — MM commits funds only in the winning fill tx.
- **Sealed naturally** — MMs quote the relayer privately; they never see each other.
- **Reuses what we have** — SIP-018 verification (jing-vault), Pyth, backend/poller already exist.
- **Best UX** — feels like a normal swap: ask, see two prices, click, done.
- **No last-look** — signed quotes are binding on the MM; only the client holds optionality.

**Cons**
- **Backend is a trusted coordinator** — it could censor or mis-route. (It never *custodies* funds — worst case is bad routing, not theft.)
- **Liveness dependency** — if the relayer is down, RFQ is down (the batch auction keeps working).
- **Off-chain quotes aren't auditable** — a skipped loser can't prove it.
- **More to secure** — API auth, quote storage, replay protection (nonce + `valid-until-block`).
- **Validity windows** — signed quotes need a tight expiry; if it lapses before the client submits, the fill reverts and the client re-solicits.

---

## Verdict

| | A | B |
|---|---|---|
| Trust model | trustless | trusts relayer for **routing only** |
| Speed | slow (multi-block) | instant quotes, 1-tx fill |
| MM cost to quote | gas + bond | free |
| Auditability | total | off-chain quotes opaque |
| Infra to build | none | backend RFQ service |
| Best for | adversarial / permissionless | real trading UX with known MMs |

Jing has a small, known MM set and an existing backend — exactly the world **B**
is built for, and how every production DeFi RFQ runs (0x, Hashflow, CoW, UniswapX).
Pick **A** only if "no trusted coordinator, ever" is a hard requirement. Reasonable
middle path: ship **B** now, keep **A** as a trustless fallback for large/disputed
tickets.

This folder drafts **Option B**: see [`rfq-sbtc-usdcx-jing.clar`](./rfq-sbtc-usdcx-jing.clar).

---

## How the draft maps your "phone ceremony"

| Phone step | On-chain in Option B |
|---|---|
| Client calls 3–4 dealers | `open-rfq` escrows sBTC (+ `max-premium-bps`, `ttl`); relayer broadcasts the intent off-chain |
| Round 1: dealers stream prices | MMs return `Pyth ± premium` quotes to the relayer (off-chain) |
| Keep best 2 of 3–4 | relayer returns the top 2 to the client (pure UX; off-chain) |
| Execute on the best | client **SIP-018-signs** an authorization naming the winning MM + the quoted spread (`max-premium-bps`); that MM submits `fill-rfq` with the signature |
| Dealer fades you (last look) | **eliminated** — an MM that no-shows just isn't the one who fills; the client re-signs for the runner-up or reclaims after expiry |

### Where MM selection and SIP-018 actually live

- **Selecting the most competitive MM** happens **off-chain in the relayer** — the
  contract can't rank quotes it never sees. What the contract enforces is that the
  fill comes from the MM the client *chose*.
- **SIP-018 is how that choice becomes enforceable.** The client signs
  `{ market, rfq-id, winner, max-premium-bps, expiry }`. `fill-rfq` rebuilds that hash
  (`build-auth-hash`), recovers the signer with `secp256k1-recover?` + `principal-of?`,
  and requires `signer == rfq.client`. Because `winner` is bound to `tx-sender`, only
  the chosen MM can produce a signature that recovers to the client; because
  `max-premium-bps` is signed, the MM is pinned to the spread it quoted (its actual
  fill `premium-bps` must be `<=` it). `market: current-contract` binds the signature
  to this deployment, so it can't be replayed on another RFQ market.

> **Why the signature is required (corrects an earlier draft note).** Without it,
> `fill-rfq` would be permissionless and the **premium is the prize** — a mempool
> watcher could copy the winner's tx and steal its spread, so MMs would stop quoting
> tight. The client's signature binds the fill to the winner and closes that snipe.
> Note the role reversal vs 0x/Hashflow: there the *maker* signs and the taker
> submits; here the **MM is the submitter** (being `tx-sender` *is* its authorization),
> so the thing that needs signing is the **client's selection of the winner**.

### Protective bounds — each where it belongs

| Bound | Set where | Nature | Role |
|---|---|---|---|
| `min-usdc-out` | `open-rfq`, client-entered, **immutable** | absolute USDCx | client floor: LOOSE worst-case ("never less than Y, period"). Set below expected, so normal drift never trips it — fires only if Pyth prints crazy-**low**. |
| `max-usdc-out` | `fill-rfq`, MM-entered (not signed) | absolute USDCx | MM ceiling: caps what the MM pays if Pyth prints crazy-**high**. The mirror image of the client floor. |
| `max-premium-bps` | the **signed** authorization, per-auction | oracle-relative | pins the winning MM to the exact spread it quoted (`premium-bps <= this`). Drift-immune, so it never causes a spurious revert. |

**The post-condition asymmetry.** The MM is `tx-sender`, so it *could* cap its
USDCx outflow with a `willSendLte` post-condition — but the **client cannot**, since
it isn't the tx-sender and can't constrain the MM's tx at all. That's why both
absolute bounds live in the contract: `min-usdc-out` *must* (the client has no other
lever), and `max-usdc-out` does too for symmetry + a clean `ERR_ABOVE_MAX_OUT` revert
(the frontend can still attach the PC as belt-and-suspenders).

**Why the spread is signed but the absolutes aren't.** An absolute
`min-usdc-out` in the signature is computed from `mid_at_sign`, but the fill reads
`mid_at_fill`. Between them Pyth drifts, so a benign BTC tick down would make the
fill revert even though the MM honored its spread — it conflates the *spread* with
the *price level*. The spread belongs in a **relative** term (the signed
`max-premium-bps`); the only thing worth pinning absolutely is a **loose
catastrophe floor** against a crazy oracle, which the client sets once at open.
The client otherwise accepts oracle drift between sign and fill — that is the whole
premise of `Pyth ± premium` pricing.

### Fee

`FEE_BPS` (0.10%) is taken **one-sided**, from the USDCx output only. RFQ is a single
directional swap, so charging both sides would tax the same surface twice and leave
the treasury holding dust in two tokens.

### Custody recap

The client escrows sBTC in `open-rfq` (it's selling it anyway). The winning MM is
`tx-sender` in `fill-rfq`, so it pays USDCx directly and the contract releases the
escrowed sBTC — the MM never locks capital until it wins and fills atomically.

### Open TODOs in the draft

- **jing-core logging** — add a `log-rfq-*` sink and call it from `fill-rfq` to mirror the batch market's event trail.
- **canonical registration** in `initialize` — mirror the batch market's jing-core attestation so events can't be impersonated.
- **Not yet wired into `Clarinet.toml`** — it's a draft; register it under `[contracts.rfq-sbtc-usdcx-jing]` when promoting.
