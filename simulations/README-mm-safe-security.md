# yguazu-mm-safe — security & exit audit

Audit of the live-deployed MM desk smart wallet
**`SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.yguazu-mm-safe`**, answering two
questions for a real large position (**100,001 STX + ~1 BTC of sBTC**):

1. **Can it be hacked?** — can anyone other than the owner remove STX/sBTC?
2. **Can it get stuck?** — can the owner always get the full position back out?

`yguazu-mm-safe` is **byte-identical** to `jing-mm-safe-v2`
(`contracts/rfq/jing-mm-safe-v2.clar`; on-chain source diff = 0). It is a
pillar-safe-v2 passkey smart wallet plus the RFQ delta (`fix-rfq` /
`fulfill-rfq` / `set-rfq-operator`). This audit is a **static read of every
public function** plus a **stxer mainnet-fork test against the exact deployed
contract principal**.

## TL;DR

- **Not hackable by any keyless third party.** Every path that removes value
  is gated on the owner/admin key or the registered passkey. A party holding
  neither (including the RFQ hot key `SPV9K21…`) cannot remove a single uSTX
  or sat. Verified: all attacker calls revert `u4001`.
- **Not stuck.** The full 100,001 STX and the full ~1 BTC were withdrawn back
  to an external wallet on the fork; the safe returned to its exact
  pre-funding balance for both assets.
- **Residual risks:** (1) cold owner-key custody; (2) a **high-severity
  STX-only** risk if the RFQ operator key `SPV9K21…` is compromised — it is
  also the market operator, so it can disable the fat-finger band and, via a
  self-controlled (permissionless) client, drain the safe's **full STX
  balance**. This does **not** reach the safe's sBTC. See the FINDING section.

## Live on-chain state audited (mainnet tip)

| Field | Value | Note |
|---|---|---|
| owner / admin | `SP2WRKMXSS8P7NPTH1NSX5HCGPK8R4WGBR5FQG8MF` | cold Leather key; the only `admins` entry |
| passkey (initial-pubkey) | `0x025b9c5c…7597` | WebAuthn second factor |
| rfq-operator | `SPV9K21…` | desk hot key; **NOT an admin** |
| recovery-address | `SPA9MDXENR3B31W3FQ9HCDVHD40R9F3HDASHESNB` | inactivity backstop only |
| stx-threshold | `100 STX` | above → timelock |
| sbtc-threshold | `0.001 BTC` (100 000 sats) | above → timelock |
| cooldown-period | `144` burn blocks (~1 day) | pending-op delay |
| token-lock-enabled | `false` | passkey transfer path open |
| onboard bootstrap admin | **removed** | `SP000…002Q6VF78` no longer admin |

## The authorization model

Every value-moving call accepts **two equal-power auth paths**:

- **Admin path** — `tx-sender` is in the `admins` map (the cold owner key
  signing a normal Stacks tx). No passkey.
- **Passkey path** — a WebAuthn signature verified against the registered
  pubkey (rp-id-bound to 5 allowed origins), single-use (replay-guarded).

A per-period **spend threshold** then splits instant vs timelocked, for
**both** auth paths and **both** assets:

| Amount | Behavior |
|---|---|
| ≤ threshold (100 STX / 0.001 BTC) | executes **immediately** — either key, alone |
| > threshold | **queues a pending-operation**; cooldown ~144 blocks (~1 day) |

Finalizing a queued (large) operation is deliberately asymmetric:

| Finalizer | Who | Constraint |
|---|---|---|
| `execute-pending-*` (slow) | **cold admin only** (`is-authorized none`) | after cooldown |
| `execute-pending-*-now` (fast) | **passkey only** | only for an **admin-initiated** op (`not passkey-created`), token-lock off |
| `veto-operation` | admin **or** passkey | any time before execute |

Consequence (defense-in-depth against a single-key compromise):

- **A large move needs the cold key in every case** — either the owner alone
  (initiate → wait cooldown → execute), or owner-initiates + passkey
  fast-executes. The **passkey alone cannot finalize a large withdrawal**
  (its own op is barred from the fast path, and the slow path is admin-only);
  it is throttled to ≤ threshold per period.
- **A stolen cold key alone cannot instantly drain a large balance** — large
  amounts are timelocked, and the **passkey can veto** during the ~1-day
  window. Only ≤ threshold per period is exposed to a lone compromised key.

## Full public-function audit

Every public function that moves value or changes control, and its gate:

**Fund exits (STX / sBTC / NFT):**
- `stx-transfer`, `sip010-transfer`, `sip009-transfer`, `sbtc-initiate-withdrawal`
  — admin **or** passkey; over-threshold routes to the timelock.
- `execute-pending-stx-transfer`, `execute-pending-sbtc-transfer`,
  `execute-pending-sbtc-withdrawal` — **admin only**, after cooldown.
- `execute-pending-stx-transfer-now`, `execute-pending-sbtc-transfer-now`,
  `execute-pending-sbtc-withdrawal-now` — **passkey**, only for
  admin-initiated ops, token-lock off.

**RFQ (the desk's trading surface):**
- `fix-rfq` — rfq-operator or admin; **moves no funds** (empty `as-contract?`
  allowance). A leaked rfq-operator key cannot leak a uSTX at fix.
- `fulfill-rfq` — rfq-operator or admin; STX out is bounded to the on-chain
  `fixed-stx-out` locked by a **client-signed** quote. A leaked rfq-operator
  key cannot *arbitrarily transfer* funds (no `stx-transfer` / `sip010`
  path — those revert `u4001`), and it can never touch the safe's **sBTC**
  (empty `as-contract?` allowance at fix; only `with-stx` at fulfill; escrowed
  sBTC flows *into* the safe). **But the STX-loss bound is NOT the fat-finger
  band — see the operator-compromise finding below.** The client signature is
  the true price bound, and that bound is only as strong as the client side is
  unforgeable. See `verify-jing-mm-safe-v2.js` for the leaked-operator
  containment proof (what the key still cannot do).
- `set-rfq-operator` — **admin only**.

**Stacking (locks STX in PoX; ownership stays with the safe):**
- `stack-stx-fast-pool`, `stack-stx-juice`, `revoke-stacking` — admin or
  passkey. `enroll-dual-stacking` — admin, passkey, or FAKFUN-DEPLOYER
  (enroll only, no fund movement out).

**Config / control:**
- `set-max-gas-amount`, `toggle-token-lock`, `signal-config-change`,
  `set-wallet-config` (cooldown capped at `MAX-CONFIG-COOLDOWN` = 4032),
  `set-rfq-operator` — **admin only**.
- `veto-operation` — admin or passkey.
- `propose-transfer-wallet` (admin) + `confirm-transfer-wallet` (passkey) —
  **two keys** required to hand off ownership.
- `propose-recovery` (passkey) + `confirm-recovery` (admin) — two keys to
  change the recovery address.
- `recover-inactive-wallet` — **recovery-address only, and only after
  `is-inactive`** (`INACTIVITY-PERIOD` = 52 560 blocks ≈ 1 year of no
  activity). Every admin/passkey call runs `update-activity`, so an active
  desk keeps this permanently unreachable. This is the lost-both-keys
  backstop, **not** an attack vector for an active wallet.
- `onboard` — FAKFUN-DEPLOYER, **one-shot**; already consumed, so any call
  now reverts.

**Conclusion:** there is no public path by which a party holding neither the
owner key nor the passkey nor the RFQ operator key can remove value. Custody
of the cold owner key is the primary risk. The RFQ operator hot key is the
only always-online key; it cannot arbitrarily transfer funds or touch the
safe's sBTC, but it carries a **material STX-loss risk documented below** that
is larger than a naive reading of the fat-finger band suggests.

## FINDING — RFQ operator / market operator key compromise (STX)

**Severity: high (STX only). Status: unmitigated as deployed; mitigations
proposed below.**

The `yguazu-mm-safe` RFQ operator key and the `rfq-sbtc-stx-jing-v2` **market
operator** are the **same key** (`SPV9K21…`, verified on-chain: the safe's
`rfq-operator` var and the market's `operator` var decode to the same
principal). That key therefore holds two powers at once:

1. **Market operator** — can `set-band-enabled false`, `set-mm-whitelist`,
   `set-min-sbtc-in`, `set-paused`, `set-treasury` on the market.
2. **Safe RFQ operator** — can drive the safe's `fix-rfq` / `fulfill-rfq`.

Combined with the fact that **clients are permissionless** (anyone may call
`open-rfq`; there is no client whitelist — only MMs are whitelisted), a single
compromise of `SPV9K21…` enables a **full drain of the safe's STX balance**:

1. As market operator, `set-band-enabled false`. With the band off, `fix-price`
   skips the oracle entirely — the `[mid/2, mid*2]` fat-finger checks are all
   short-circuited. The only remaining caps on `committed-out` are
   `>= min-stx-out` and the ±20 bps drift-vs-signed-quote band.
2. As an attacker-controlled **client** (a throwaway EOA), `open-rfq` with
   **1 sat** (`min-sbtc-in` is currently `u0`) and sign a `quoted-out` equal to
   the safe's entire STX balance.
3. As RFQ operator, `fix-rfq` then `fulfill-rfq` through the safe → the safe
   pays out its **full STX balance** for 1 sat of sBTC.

Why the fat-finger band is not the real bound: the check
`committed-out <= quoted-out` (client-signed) always holds, band or no band —
so the safe never pays more than *some client signed for*. The security of the
STX therefore rests entirely on the client side being **unforgeable and
honest**, which today it is not (self-client is trivial). The `[mid/2, mid*2]`
band only bounds loss when it is **on**, and the same key that trades can turn
it off.

**Scope limits (what still holds):**
- **STX only.** `fix-rfq` moves nothing (empty allowance) and `fulfill-rfq`
  carries only `with-stx`; the safe's sBTC inventory is never payable through
  the RFQ path and can only leave via `sip010-transfer` /
  `sbtc-initiate-withdrawal`, which `SPV9K21…` cannot call. Keeping value in
  the safe as **sBTC rather than STX** is materially safer against this vector.
- **No arbitrary transfer.** The drain is purely through trade mechanics; the
  operator key still cannot `stx-transfer` out (`u4001`).
- **Cold-key sever (a race).** `set-rfq-operator` is admin-only, so the cold
  owner key can rotate the safe's RFQ operator away from a compromised key —
  but only if it acts before the attacker fires.

**Mitigations (proposed, not yet applied):**
- **Whitelist clients, managed by a key that is NOT the market operator.**
  If only approved clients can `open-rfq`, the self-client forge is closed and
  the drain requires colluding with, or compromising the key of, a real
  whitelisted client. Critical: the client-whitelist authority must sit on a
  separate key (cold admin / governance) — if it is operator-gated like
  `set-mm-whitelist`, the compromised operator simply self-whitelists and the
  control is void. This is the highest-leverage fix because the client
  signature is the true price bound.
- **Separate the band / market-operator authority from the RFQ operator that
  signs fixes.** If the band kill-switch lives on a different (or colder) key,
  a compromised trading key cannot disable the band, so even a compromised or
  colluding client is capped at the `2x` fat-finger edge instead of unbounded.
- **Keep only working STX inventory in the safe** (bulk STX cold; hold reserve
  as sBTC, which this vector cannot reach), and **monitor** the public
  `rfq-band-enabled` and `rfq-fix` events for anomalies, auto-rotating the RFQ
  operator on a band-off or oversized-fix signal.

With client whitelisting (separate manager) plus band-authority separation, a
drain would require compromising the RFQ operator **and** corrupting a real
whitelisted client, and would still be capped at the `2x` band of that
client's own deposit.

## Fork test — `verify-yguazu-mm-safe-security.js`

Runs against the real deployed `yguazu-mm-safe` (stxer forks the deployed
bytecode + state at the tip), impersonating the on-chain owner via the
plain-principal admin path — the exact cold-key path a large exit needs.

```
npx tsx simulations/verify-yguazu-mm-safe-security.js
```

**Result: 36 passed, 0 failed.**
Latest green run: https://stxer.xyz/simulations/mainnet/7b765f87097245f57b49be39f5f9f6ce

What it proves on-chain:

- **Trust identity** — owner is the sole admin; rfq-operator is **not** an
  admin; onboard bootstrap admin removed.
- **Hack surface closed** — rfq-operator and a random attacker each fail to
  `stx-transfer`, `sip010-transfer` the sBTC, rotate the rfq-operator, or veto
  a pending op (all `u4001`).
- **STX exit** — fund 100,001 STX; a 1-STX send executes immediately; a
  100,000-STX send queues a pending op (moves nothing), rejects early execute
  (`u4017`) and outsider veto (`u4001`), and after the cooldown the owner
  executes it. Safe returns to its exact pre-funding balance; recipient
  received the full 100,001 STX.
- **sBTC exit** — fund ~1.0005 BTC; a 0.0005-BTC send executes immediately; a
  1-BTC send queues a pending `sbtc-transfer` op, same timelock/veto guards,
  executed by the owner after cooldown. Safe returns to its exact
  pre-funding balance; recipient received the full ~1.0005 BTC.

## Related

- `verify-jing-mm-safe-v2.js` — RFQ-surface harness for the byte-identical
  canonical (onboard gate, fix/fulfill auth + allowances, leaked-operator
  containment). 41/41.
- The wallet core (`fakfun-wallet-core.register-wallet`) verifies the per-user
  copy's `contract-hash?` against the canonical's registered hash before
  whitelisting — so only byte-exact copies of the audited source onboard.
