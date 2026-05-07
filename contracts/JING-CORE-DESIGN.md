# jing-core registry & permissions design

This document records the design decision behind the registry / admin
shape of `jing-core.clar` so future audits and contributors can re-derive
the rationale without re-running the analysis. Date of decision:
2026-05-07.

## Summary

`jing-core` collapses what was previously a four-role, two-step,
timelocked admin surface (owner + validators + pending-validators +
pending-verified-contracts) into a single owner-controlled flow with a
slim `guardian` role for fast pause. The reduction is justified by the
contract-owner being a multi-sig in production: multi-sig signing
provides the audit window that an on-chain timelock + separate
validator role used to enforce.

## Bug that prompted the redesign

The old `register` function:

```clarity
(define-public (register (canonical principal))
  (let (
    (caller contract-caller)
    (caller-hash (unwrap! (contract-hash? contract-caller) ...))
    (verified-hash (unwrap! (map-get? verified-contracts canonical) ...))
  )
    (asserts! (is-eq caller-hash verified-hash) ERR_HASH_MISMATCH)
    ...
    (map-set registered-contracts caller true)
```

bound only the **bytecode** of the registering contract to a verified
hash — not the **deployer**. Once the owner had verified
`SP_OFFICIAL.markets-sbtc-usdcx-jing` as a canonical hash H, ANY
principal could deploy the same bytecode under a DIFFERENT contract
name, e.g. `SP_ATTACKER.evil-market`, and call `register(canonical =
SP_OFFICIAL.markets-sbtc-usdcx-jing)`. The hash check passes (H = H),
the attacker's market becomes registered, and they can write arbitrary
`log-*` events on jing-core under attacker-chosen tokens and feed.

Concrete attack:
1. Owner verifies `SP_OFFICIAL.markets-sbtc-usdcx-jing` (real bytecode H).
2. Attacker deploys `SP_ATTACKER.evil-market` with the same bytecode.
3. Attacker calls `evil-market.initialize(canonical = SP_OFFICIAL.markets-sbtc-usdcx-jing, x = FAKE_TOKEN, y = USDCx, feed = BTC/USD)`.
4. `initialize` propagates to `jing-core.register`. Hash matches.
   Market becomes registered.
5. Users depositing real USDCx into evil-market get FAKE_TOKEN at
   BTC/USD oracle pricing -- that is, real value goes in, worthless
   tokens come out at attacker-controlled rates.

The hash check binds CODE correctness; it doesn't bind DEPLOYMENT
identity.

## Fix

```clarity
(asserts! (is-eq tx-sender (var-get contract-owner)) ERR_NOT_AUTHORIZED)
```

added inside `register`. `tx-sender` propagates through `contract-call?`
unchanged from the originating tx, so when an attacker calls
`evil-market.initialize`, `tx-sender = attacker` reaches `register` and
fails the assert. Only an owner-deployed market can register.

## Why no validator second-step + timelock?

The simpler one-line fix relies on `contract-owner` being trustworthy.
The original two-step + validator design was a workaround for that:
even if the owner's single key was compromised, the attacker would
still need to wait through `TIMELOCK_BURN_BLOCKS = u144` (~24h) AND
either compromise a validator or wait for one to confirm. The
distributed validator set + timelock + role separation was on-chain
defense-in-depth for a single-key owner.

In the multi-sig model:

1. **Distributed trust** is internalized in the multi-sig signers
   (e.g. 3-of-5). An attacker compromising one signer can't act.
2. **Audit window** is replaced by multi-sig signing latency. A 3-of-5
   typically takes hours-to-days to coordinate signatures, naturally
   creating a deliberation window without an on-chain timelock.
3. **Opacity**: with a multi-sig, the *identity* of each signer is
   private (only the multi-sig contract is on-chain). Validators in
   the old model had their addresses publicly mapped, making them
   targets for social engineering. Multi-sig signers are
   pseudonymous-by-default.

The result: same security properties, less on-chain complexity, less
public surface area for attackers to map.

## What was removed

| Symbol | Reason |
|---|---|
| `(define-map validators principal bool)` | Validators no longer exist |
| `(define-data-var validator-count uint u0)` | Same |
| `(define-map pending-validators principal uint)` | No two-step add |
| `(define-map pending-verified-contracts ...)` | No two-step add |
| `propose-validator`, `confirm-validator`, `cancel-pending-validator`, `remove-validator` | Validator role is gone |
| `propose-verified-contract`, `confirm-verified-contract`, `cancel-pending-contract` | Replaced by single-step `set-verified-contract` |
| `is-validator`, `get-validator-count`, `get-pending-validator`, `get-pending-verified-contract` reads | Targets gone |
| `MAX_VALIDATORS` constant | Replaced by `MAX_GUARDIANS` |
| `ERR_OWNER_CANNOT_BE_VALIDATOR`, `ERR_ALREADY_VALIDATOR`, `ERR_VALIDATOR_PENDING`, `ERR_VALIDATOR_LIMIT_REACHED`, `ERR_NO_PENDING_VALIDATOR`, `ERR_NOT_VALIDATOR`, `ERR_NEW_OWNER_IS_VALIDATOR`, `ERR_NO_PENDING_PROPOSAL` | Renamed to guardian-equivalents or dropped |
| `set-contract-owner`'s anti-validator assert | Validator concept is gone |

## What replaced it

```clarity
(define-public (set-verified-contract (contract principal))
  (let ((computed-hash (unwrap! (contract-hash? contract) ...)))
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_NOT_AUTHORIZED)
    (asserts! (is-none (map-get? verified-contracts contract)) ERR_ALREADY_REGISTERED)
    (map-set verified-contracts contract computed-hash)
    ...))
```

One-step, owner-only. Hash still computed on-chain via `contract-hash?`
(no off-chain hash submission, no fat-finger or forge risk). One-way:
no removal primitive, same as before -- severing a confirmed template
could cascade into in-flight fund paths.

## Guardian role (kept)

```clarity
(define-map guardians principal bool)
(define-data-var guardian-count uint u0)
(define-constant MAX_GUARDIANS u5)

(define-public (add-guardian (guardian principal)) ...)    ;; owner-only, one-step
(define-public (remove-guardian (guardian principal)) ...)  ;; owner-only, one-step
```

Guardians can ONLY call `pause`. They cannot:
- Add/remove verified-contracts
- Change ownership
- Unpause (owner-only with timelock cooldown)
- Add/remove other guardians

The role exists because **fast pause** is a different latency profile
from owner-level governance. When something is on fire, the first
trustworthy party to notice should be able to halt entries
immediately, without coordinating an N-of-M multi-sig signature round.
Multi-sig is inherently slower because it requires multiple parties to
sign — appropriate for governance changes, too slow for emergency
trip-wire.

The owner adds and removes guardians one-step (no timelock); the
multi-sig is the audit. Guardians' privileges are minimal so the
blast radius of a compromised guardian key is bounded to "they can
pause the protocol" — annoying but not destructive (deposits halt;
existing user funds still exit via the always-open exit-side
log functions; owner unpauses after the 144-block cooldown).

## Pause / unpause

- **Pause**: `tx-sender == contract-owner OR is-guardian tx-sender` →
  sets `paused = true`, freshens `paused-at = burn-block-height`.
  Re-pausing while already paused restarts the unpause timer
  (intentional: if a new threat surfaces during a pause, hitting pause
  again extends the cooldown).
- **Unpause**: owner-only, requires `burn-block-height >= paused-at +
  TIMELOCK_BURN_BLOCKS (u144 ≈ 24h)`. The cooldown prevents a
  panic-resume — even if the owner-multi-sig wants to unpause
  immediately after pausing, they can't until the deliberation window
  has elapsed.
- The `TIMELOCK_BURN_BLOCKS` constant is now used ONLY for the
  unpause cooldown (it used to also gate verified-contract promotion
  and validator addition).

## What this means for deployment

The `contract-owner` of jing-core MUST be a multi-sig in production.
Deploying with a single-key owner forfeits the distributed-trust
property that this design relies on, leaving register's `tx-sender ==
contract-owner` check guarded by a single key. That's strictly weaker
than the old two-step + validator design.

See `MULTISIG-DEPLOYMENT.md` (sibling file) for the actual deployment
recipe — how to deploy jing-core with multi-sig ownership from day 1
on Stacks.

## Threat model after this change

| Threat | Mitigation |
|---|---|
| Attacker deploys hash-matching bytecode and tries to register | Blocked by `tx-sender == contract-owner` in `register` |
| Attacker compromises one multi-sig signer | Cannot reach quorum; no governance action possible |
| Attacker compromises N-of-M signers (full multi-sig compromise) | Equivalent to full owner compromise — register, set-verified-contract, set-contract-owner all available. Defense-in-depth against this is operational (key rotation, multi-sig threshold tuning, hardware modules) |
| Attacker compromises a guardian key | Can call `pause`, nothing else. Owner unpauses after 144-block cooldown. Annoyance, not asset loss |
| Owner key (multi-sig signers collectively) is honest but slow | Pause via guardian is fast (single-key); unpause cooldown bounds resume-too-early risk |
| Wrong canonical principal in `set-verified-contract` (typo) | One-way confirmation, no removal — typo persists. Mitigation: dry-run via stxer fork, multi-sig review of args, or accept that an unused canonical entry is harmless (it just exists) |

## Breaking changes for existing tooling

Anyone integrating with jing-core's old surface will need to adjust:

- `propose-verified-contract` + `confirm-verified-contract` →
  `set-verified-contract` (single owner call)
- `propose-validator`/`confirm-validator`/`remove-validator` → 
  `add-guardian`/`remove-guardian` (different name + privilege set)
- `is-validator` → `is-guardian`
- Pause callers: validators are no longer authorized (only guardians +
  owner). Existing validators must be re-added as guardians if pause
  authority is desired.
- Event names changed: `verified-contract-proposed` /
  `verified-contract-confirmed` / `validator-proposed` /
  `validator-confirmed` / etc. → `verified-contract-set` /
  `guardian-added` / `guardian-removed`
- `cancel-pending-contract`, `cancel-pending-validator` → gone (no
  pending state to cancel)

This is a pre-mainnet change, so no on-chain state migration is needed.
