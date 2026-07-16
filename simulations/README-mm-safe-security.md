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
- **Residual risk is key custody**, plus a bounded RFQ-hot-key risk (below).

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
- `fulfill-rfq` — rfq-operator or admin; STX out is **bounded to the on-chain
  `fixed-stx-out`** locked by a client-signed quote, itself capped by the
  market's fat-finger band (`[mid/2, mid*2]`) and the client's signature. A
  leaked rfq-operator key cannot arbitrarily transfer funds; worst case, with
  a colluding client, is trading at up to the band edge. See
  `verify-jing-mm-safe-v2.js` for the leaked-operator containment proof.
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
owner key nor the passkey can remove value. The rfq-operator hot key is the
only always-online key and it is confined to `fix-rfq` / `fulfill-rfq` /
economically-bounded RFQ settlement.

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
