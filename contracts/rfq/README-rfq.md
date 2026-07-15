# RFQ markets - current state (2026-07-14)

**Ship candidate: `rfq-sbtc-stx-jing-v2.clar`** (native miner-commit oracle,
1-day window, hardcoded wide fat-finger band, operator kill-switch) settled
through **`rfq-mm-vault-jing.clar`** (owner/operator STX-float vault).
`rfq-sbtc-stx-jing-v3.clar` (no oracle at all) stays in the repo as the
measured alternative. Everything below the "historical design notes" marker
is the original Pyth-era USDCx design doc, kept for context.

## The price-protection stack (v2, final)

A client is protected by four layers; each catches a different failure:

| Layer | Set by | Catches |
|---|---|---|
| SIP-018 signature over exact `quoted-out` (+ ref-price/venue/timestamp, <=120s fresh) | client | anything the client did not agree to |
| Drift band: committed-out in **[quoted*(1 - 20bps), quoted]** - rounding shave tolerated below, ZERO overpay above | contract | below: MM shaving after the client signed; above: a buggy/fat-fingered operator draining the vault into an overpaid fill (the client would happily keep it - nothing client-side caps the upside) |
| `min-stx-out` set at `open-rfq` | client | commitments below the client's own floor |
| **Fat-finger band: committed-out within [mid/2, mid*2] of the native mid** | contract, hardcoded | decimal-slip / unit-confusion errors that corrupted BOTH the signature and min-stx-out (a lying frontend produces a client who signs their own disaster) |

The band is deliberately a DECIMAL-SLIP catcher, not a price check. Real fat
fingers are 10x-class errors (shifted decimals, uSTX/STX confusion, swapped
legs); everything finer-grained is covered by the layers above plus B2B
recourse - every principal that can fix a price is a whitelisted, KYB'd
business, so a 5% error gets unwound by a phone call, not by code.

### Decision: drift band is asymmetric (2026-07-15)

The upper drift bound was `quoted*(1 + 20bps)`; it is now exactly `quoted`.
An MM never legitimately overpays - the +20bps slack only existed for
rounding symmetry, and the party it exposed was the VAULT (owner float,
operator hot key): the client signs "at least this," so overpayment has no
client-side brake. Constraint this creates: any backend path that recomputes
committed-out at fix time must round DOWN or echo the signed quoted-out
verbatim - one uSTX of round-up now reverts.

### Decision: `max-premium-bps` removed from v2 (2026-07-15)

The field stopped being enforced when the relative premium band was replaced
by the hardcoded [mid/2, mid*2] band (a premium band derived from the noisy
miner-commit oracle would revert honest fixes on sticky-commit days). It
briefly survived as signed TCA metadata; it is now DELETED from `fix-price`,
`build-auth-hash`, and the vault proxy, because a client-signed knob is set
by whatever frontend the client is looking at - the exact adversary the
hardcoded bounds exist for. Design rule: client-SIGNED parameters express
preferences (`min-stx-out`), hardcoded CONSTANTS express integrity bounds the
frontend must not be able to negotiate away (20bps drift, 2x band, 120s
freshness). Consequences:

- The v2 SIP-018 tuple is now `{market, rfq-id, winner, quoted-out,
  ref-price, ref-timestamp, ref-venue, expiry}` - it DIVERGES from the USDCx
  market and v3, which keep the field. FE/BE signing for v2 must drop it.
- `ERR_PREMIUM_TOO_HIGH (err u2005)` now fires ONLY for the fat-finger band
  floor (committed-out < mid/2), no longer for a premium-cap violation.

## The native oracle and why the band is shaped this way

`get-native-price` derives STX/BTC from what miners collectively spend to win
the 500 STX coinbase (`get-tenure-info? miner-spend-total`). It samples **48
tenures spread over ~1 day** (offsets every ~366 stacks blocks). Findings from
3.5 months of mainnet commits (the faktory-dao mining observatory table),
~11,800 evaluation points vs Kraken STX/BTC:

- 6 consecutive tenures (the original design): deviation ran **-40%/+54%**.
  On 2026-07-14 it read +52% vs market (miners paying 158% of coinbase value;
  commits are sticky when STX/BTC slides) - a premium-derived band would have
  reverted every honest fix that day.
- Sample COUNT is what tames the tails, not just window length: 6 samples
  spread over a day is WORSE than 6 consecutive; 48 over a day tightens the
  worst case to ~[-23%, +30%], close to the full-144 average at a third of
  the cost.
- Cost of the 48 reads, measured on a mainnet fork (position-corrected):
  ~710k runtime (0.014% of a block) + 145 read_count (~1% of a block).
  Cost was never the issue; false reverts were.
- Worst honest band usage in the backtest: quote at [0.77x, 1.30x] of the
  native mid, vs limits [0.5x, 2x]. Efficiency is fixed at 1.0 (the
  calibration knob is deleted - noise inside a 2x band), which shifts usage
  ~9% toward the ceiling; live 2026-07-14 an honest quote sits at ~1.39x.
  The monitor should watch the ceiling side.

## The kill-switch (`set-band-enabled`)

Operator-only, two-way, event-logged (`rfq-band-enabled`) - a desk trading
band-off is publicly auditable. When OFF the oracle is **never read** (not
just ignored): a degraded miner-commit feed erroring inside `get-native-price`
can therefore never brick `fix-price`. `fixed-oracle-price` records `u0` for
band-off fixes.

Residual band-trip scenario: a >~50% intraday STX/BTC move with sticky
commits. The backend should auto-disable BEFORE that bites:

> **Backend monitor (TODO)**: read `get-native-price` + CEX mid every few
> minutes; if native/market leaves ~[0.55, 1.7] (honest quote approaching a
> limit), fire `set-band-enabled false` from the operator key; re-enable with
> hysteresis (back inside ~[0.7, 1.4] for an hour).
> `simulations/verify-native-price-rfq-v2.js` is this exact check as a
> runnable probe (exit 2 = threshold crossed).

## The vault (`rfq-mm-vault-jing`)

The vault IS the on-chain MM: clients sign the VAULT PRINCIPAL as the SIP-018
winner. Owner (Yguazu cold-ish wallet) deposits the STX float and is the only
withdrawal destination; operator (backend hot key) can only proxy fix/fulfill.
Re-cut against v2: no Pyth traits, and since v2's fix-price moves no funds the
`as-contract?` allowance at fix is EMPTY - a leaked operator key cannot leak a
single uSTX at fix, and at fulfill the allowance is exactly the
`fixed-stx-out` already locked on-chain.

### Decision: vault registers into jing-core-v2 at initialize (2026-07-15)

`initialize` gained a `canonical` param, a core-owner gate, and
`(try! (contract-call? .jing-core-v2 register canonical))` - the same clone
protection as the market, and the vault needs it MORE: `register` only
hash-checks source, and a byte-identical vault clone is fully live for its
deployer WITHOUT initialize (owner defaults to tx-sender), configured with a
hostile owner/operator. The hash check forces the clone to ship the
core-owner gate its deployer cannot pass, so it can never land in
`registered-contracts`. `is-registered` is therefore the flag the FE/backend
must check before presenting any vault principal as the SIP-018 winner.
Deploy-order consequence: `set-verified-contract(vault)` must run BEFORE
vault `initialize`, or the inner register dies at ERR_NOT_VERIFIED (u5005).

## v3 - the bandless alternative (shelved, kept)

`rfq-sbtc-stx-jing-v3.clar` deletes the oracle entirely: signature + drift +
min-stx-out only, fat-finger screen in the frontend. Fully tested (see
matrix). Revisit if the MM set ever goes beyond KYB'd relationship parties -
in that world "recourse is baked into the relationship" stops holding, and
note that if both a banded and a bandless market are DEPLOYED TOGETHER the
band protects nobody: a malicious frontend simply routes victims to the
bandless one. One market or nothing.

## Test matrix (all mainnet-fork sims + property fuzzing)

Re-validated 2026-07-15 after the max-premium-bps removal + asymmetric drift
band (results below are from the post-change source):

| Suite | Result |
|---|---|
| `verify-rfq-sbtc-stx-jing-v2.js` | **77/77 (2026-07-15)** - all prior coverage plus the new drift boundaries: overpay by 1 uSTX reverts (u2014), fix at the exact -20bps lower boundary passes; band blocked -> switch off -> 3x-mid fix through -> re-enable -> blocked again; oracle-skip verified; JS/on-chain build-auth-hash parity on the new 8-field tuple |
| `verify-rfq-mm-vault-jing.js` | **35/35 (2026-07-15)** on the new tuple/arity + registry-at-initialize: init before set-verified dies at inner ERR_NOT_VERIFIED (u5005), 3-arg initialize registers, is-registered reads true; vault-signed fix stolen by an EOA dies at whitelist; operator-only fix/fulfill; owner-only withdrawals; full drain |
| RV fuzzing (v2) | **500 runs, 4 invariants, 0 failures (2026-07-15)** - escrow conservation x121, next-id-unused x127, operator-not-burn x126, rfq-state-consistent x126; re-run on the post-removal source |
| `verify-rfq-sbtc-stx-jing-v3.js` | 70/70 (pre-change) - v3 keeps max-premium-bps + the symmetric drift band; suite repointed at buildRfqAuthHashHexV3, not re-run (v3 is shelved) |
| `cost-rfq-v2-vs-v3.js` | oracle marginal cost measured; run with `ORDER=v3first` to cancel the shared-core positional artifact |

## Deploy checklist

1. Deploy `jing-core-v2`, `rfq-sbtc-stx-jing-v2`, `rfq-mm-vault-jing` (same
   deployer - relative `.refs`), Clarity 5.
2. `jing-core-v2.set-verified-contract(market)` + market `initialize`.
3. `set-mm-whitelist` the **vault principal** (not the backend key).
4. `jing-core-v2.set-verified-contract(vault)`, THEN vault
   `initialize(canonical = vault, owner = Yguazu wallet, operator = backend
   hot key)` - order matters, initialize registers into the core. Owner
   deposits the STX float.
5. Backend: repoint `rfq-sbtc-stx-jing-template.ts` (fix-price arity 8, no
   max-premium-bps, signed tuple is the new 8-field shape), band
   auto-disable monitor, FE pre-sign screen (check the quote against an
   INDEPENDENT price source - a different venue than the one that built the
   quote, and not Pyth, whose free access dies 2026-07-31), BE pre-fix
   sanity check on a separate code path from the FE. FE/backend must check
   `jing-core-v2.is-registered(vault)` before presenting a vault principal
   as the SIP-018 winner.

---

# Historical design notes: RFQ market for sBTC ⇄ USDCx (Pyth era)

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
  to this deployment, so it can't be replayed on another RFQ market. The signed
  `expiry` is a `stacks-block-height` deadline (same clock as the RFQ's own escrow
  `expiry`, ~2s granularity for a short quote window) — no `u0` "never expires" sentinel.

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

`FEE_BPS` (0.10%) is taken **one-sided**, from the USDCx output only — so the client
effectively bears it (receives `usdc_out − fee`) and the MM gets the full sBTC side.

This is a **fee-incidence** choice, not a dust concern (a two-sided fee wouldn't strand
anything — both halves would just go to the treasury as revenue in two tokens). The
alternative, splitting the fee ~50/50 across the USDCx and sBTC legs, would share the
burden between client and MM at the cost of one extra transfer. We deliberately keep it
one-sided: the MM receives the entire sBTC side, and the fee comes out of the USDCx leg.

### Custody recap

The client escrows sBTC in `open-rfq` (it's selling it anyway). The winning MM is
`tx-sender` in `fill-rfq`, so it pays USDCx directly and the contract releases the
escrowed sBTC — the MM never locks capital until it wins and fills atomically.

### Open TODOs in the draft

- **jing-core logging** — add a `log-rfq-*` sink and call it from `fill-rfq` to mirror the batch market's event trail.
- **canonical registration** in `initialize` — mirror the batch market's jing-core attestation so events can't be impersonated.
- **Not yet wired into `Clarinet.toml`** — it's a draft; register it under `[contracts.rfq-sbtc-usdcx-jing]` when promoting.
