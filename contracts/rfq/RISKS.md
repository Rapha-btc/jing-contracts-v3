# RFQ sBTC→STX — Mini-Audit & Risk Register

**Contract:** `rfq-sbtc-stx-jing.clar` (v1, two-phase: `fix-price` → `fulfill`)
**Scope:** Internal review of the OTC sBTC→native-STX RFQ. Not a substitute for an external audit;
pairs with the stxer simulation suite.

## Verdict
**No fund-theft / critical vulnerabilities.** Strengths verified:
- SIP-018 signature binds `market (current-contract)` + `chain-id` + `rfq-id` + `winner (=tx-sender)`
  + `max-premium-bps` + `auth-expiry` → no copy/replay across MM/market/chain/rfq.
- Client floors enforced: `floor ≤ committed-out ≤ ceiling` and `committed-out ≥ min-stx-out`.
- Atomic settle; reentrancy-safe (token asserted `== token-x`, native STX has no callback).
- Dual-clock deadlines: `auth-expiry` (Stacks blocks, price-fix) + `open-expiry` (burn blocks, overall).
- Math: no overflow (128-bit), no underflow (`max-premium-bps ≤ 2000 < 10000` asserted first).

## Findings & dispositions

### M1 — `reclaim` coupled to `jing-core.log-rfq-cancel` → **MITIGATED**
`reclaim` `try!`s `log-rfq-cancel`. That fn's only assertion is `(is-registered contract-caller)` —
**not pausable, no other revert path.** This market registers permanently at `initialize`, so for a
registered caller the log cannot revert and `reclaim` cannot be bricked.
- **Residual:** if jing-core ever gains a market **de-register / unregister** path, `reclaim` would
  break for an unregistered market. **Action:** do not add de-registration without making reclaim's
  log best-effort (non-`try!`). **Status: accepted.**

### M2 — post-fix free option / no MM bond → **ACCEPTED (v1)**
Precise mechanics: `fix-price` sets `winner` and asserts `is-none winner`, so **once MM1 fixes, the
rfq is locked to MM1** — a second client signature to MM2 returns `ERR_ALREADY_FIXED`. The
"re-sign to another MM" recourse therefore exists only **pre-fix** (benign: client freely re-grants if
an MM declines to fix). **Post-fix, if MM1 walks, the client's sBTC is locked until `open-expiry`
(~60 min) and the only recourse is `reclaim`.**
- Accepted for v1 because: the sole MM is **Yguazu Capital LLC** (own desk, won't self-grief);
  funds are never lost (reclaim returns sBTC); the frontend enforces one active grant at a time.
- **v2:** require an MM **bond at fix-price**, slashed to the client on no-fulfill → enables
  trustless multi-MM.

### L1 — MM selects the Pyth VAA within the 80s freshness window → **ACCEPTED**
MM can nudge the derived floor down slightly within freshness. Bounded by `min-stx-out` (absolute
client backstop). Makes a correctly-set `min-stx-out` the key protection (see L4 + UI).

### L2 — check-effects-interactions in `fulfill` → **OPTIONAL HARDENING**
`fulfill` sets `open=false` *after* the transfers. No exploit today (fixed sBTC token; STX/sBTC
don't reenter). Defense-in-depth: set `open=false` *before* the transfers so any future reentrancy
hits `ERR_RFQ_CLOSED`. Optional.

### L3 — `stacks-block-time` → **INFORMATIONAL**
Standard Clarity builtin; best available time source. If the chain can't provide it there's nothing
the contract can do. No action.

### L4 — `min-stx-out` is client-trusted (no on-chain sanity relation) → **ACCEPTED via frontend**
No on-chain relation to size/oracle. `min-stx-out` is a **worst-case circuit-breaker, NOT the quote**
— a deliberately-loose floor that only fires on a Pyth blowup. v1 model: the **Jing frontend
auto-computes it** as `live_mid × (1 − tolerance)` and the **MM (Yguazu) verifies** before
signing/fixing. It is *not* the price the client accepts — that is the MM quote in the off-chain auction.

**Tolerance is a UI setting (slippage-style), default 4%, adjustable ~2%–8%** (the user sets a %, never
a raw STX number). Rationale: BTC/STX cross shouldn't move ≥4% within the open window (≤1h), so 4%
won't spuriously cancel under normal conditions; bump to ~6% in volatile regimes to avoid spurious
cancels (looser catastrophe protection). Must exceed premium + intra-window Pyth drift +
VAA-selection wiggle (L1, ~0.30% premium / 2% conf gate are well inside 4%); never so wide the
backstop is meaningless — the signed `max-premium-bps` is the tight bound, this is only the disaster floor.

## Trust model (v1)
- Single vetted MM (**Yguazu Capital LLC**).
- Off-chain auction + client SIP-018 signature; relayer only *ranks*, the client *signs*.
- Client protection = signed `max-premium-bps` (relative) + `min-stx-out` (absolute, frontend-set)
  + `reclaim`.
- **Fund safety holds even if every off-chain actor misbehaves** — worst case the sBTC is locked
  ≤ the open window, then `reclaim`.

## Pre-mainnet checklist
- [ ] stxer sims: MM-walks-post-fix → `reclaim`; jing-core-reverts → `reclaim` still works (confirm M1);
      double-fix race; sig replay on wrong `rfq-id`; `min-stx-out` too high → no fix → `reclaim`.
- [ ] (optional) L2 CEI reorder in `fulfill`.
- [ ] Confirm jing-core has **no** market de-register path (M1 residual).
- [ ] Move `fix-price`'s `print` to `jing-core.log-rfq-fix` for canonical attribution (TODO in code).
