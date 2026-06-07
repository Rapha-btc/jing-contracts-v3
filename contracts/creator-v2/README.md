# creator-escrow-v2

Round-2 of the JingSwap creator-escrow: a public USDCx escrow for
commissioned content. OWNER (the buyer) deposits a per-video budget for a
named pair of creators; creators submit deliveries on-chain and pull their
own payment after a review window, signing an on-chain IP-license
agreement (`TERMS`) with the claim.

This folder is the round-2 evolution of the deployed v1 contract
(`SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.creator-escrow-jing`). The two
behavioral changes below are what's new in v2.

## What's new vs v1

### 1. Payout lands in the creator's SMART WALLET
Creators **operate** (submit / amend / release) from their normal wallet,
but each creator's USDCx payment is sent to a **smart wallet** that OWNER
records for them at `start-round`.

```clarity
(start-round creator-a creator-a-wallet creator-b creator-b-wallet per-video num-videos)
```

`release` requires `tx-sender == delivery.creator` (the operating wallet
that signs and agrees to TERMS) but transfers `per-video` USDCx to that
creator's stored `*-wallet`. The reward never touches the signing wallet.

### 2. The bad-hash burden is on the creator (`amend-delivery`)
v1's owner-driven `lift-veto` is **removed**. Instead, after OWNER vetoes
(e.g. "wrong hash"), the **creator** re-does it:

```clarity
(amend-delivery delivery-id content-uri content-hash)
```

Only the delivery's creator, only on a `VETOED` delivery, before sweep,
under the same round-end cutoff + budget-capacity checks as
`submit-delivery`. It re-signs the corrected hash with the creator's own
wallet and returns the delivery to `PENDING` with a **fresh 48h review
window**, so OWNER can re-review (and veto again).

### 3. Owner fast-track (`approve`)
OWNER can approve a `PENDING` delivery early so the creator may `release`
**before** the review window elapses:

```clarity
(approve delivery-id)
```

Owner-only, only while `now < review-ends-at` (else `ERR_REVIEW_CLOSED`),
only on `PENDING`. Once `APPROVED` it can no longer be vetoed. Approving
can only let the creator claim *sooner*, never later (the `release`
predicate treats `APPROVED` as an unconditional superset of the
window-elapsed condition, and the status transition is one-way).

## State machine

```
PENDING ──(owner approve, in-window)──► APPROVED ──(creator release)──► RELEASED
   │  ▲                                     │
   │  └──(creator amend-delivery)── VETOED ◄┘  ✗ veto requires PENDING
   │                                  ▲
   └──(owner veto, in-window)─────────┘
PENDING / APPROVED ──(anyone, after round-end + claim grace)──► EXPIRED
```

`pending` accounting (must reach 0 before `sweep`): `+1` on
submit/amend, `0` on approve, `-1` on veto/release/expire. The two states
that still hold a `+1` are `PENDING` and `APPROVED` — `expire` is the
permissionless escape hatch that frees an abandoned slot of either kind so
OWNER can sweep.

## Status & error codes

Status: `PENDING=0 RELEASED=1 VETOED=2 APPROVED=3 EXPIRED=4`
(`u3` was `AMENDED_APPROVED` in v1, repurposed as `APPROVED`).

Errors: `100 NOT_OWNER · 101 NOT_CREATOR · 102 NO_ROUND · 103 ROUND_ACTIVE
· 104 ROUND_ENDED · 105 ROUND_NOT_ENDED · 106 DELIVERY_NOT_FOUND ·
108 REVIEW_CLOSED · 109 ALREADY_RESOLVED · 110 INSUFFICIENT_ESCROW ·
111 PENDING_DELIVERIES · 112 AMOUNT_ZERO · 113 ALREADY_SWEPT ·
114 NOT_VETOED · 115 TERMS_NOT_ACCEPTED · 116 NOT_CLAIMABLE ·
117 ROUND_LIVE · 118 VIDEOS_NOT_EVEN · 119 OVER_CAPACITY`.

Timing (mainnet): `REVIEW_WINDOW = 288` burn blocks (~48h),
`CLAIM_GRACE = 288`, `ROUND = 4200` (~30d).

## Files

| File | Purpose |
|------|---------|
| `creator-escrow-v2.clar` | The round-2 contract (mainnet timing). **This is what the verifier deploys.** |
| `../../simulations/verify-creator-escrow-v2.js` | **Self-verifying** stxer harness — deploys the REAL `creator-escrow-v2.clar` with mainnet timing (288/288/4200) on a fork, uses `addAdvanceBlocks(289)` / `(4200)` to cross the review window and round-end+grace, runs happy path + edge cases, fetches results via `getSimulationResult`, and asserts every `(ok …)`/`(err uX)` plus the USDCx payout deltas. Exits non-zero on any failure. |
| `../creator-escrow-v2-stxer.clar` | **Legacy/redundant** shrunk-timing variant (`REVIEW=2`, `GRACE=0`). Pre-`addAdvanceBlocks` workaround — the verifier no longer uses it (it would simulate the wrong constants); only the two demo sims still reference it. Safe to delete once those are repointed. |
| `../../simulations/simul-creator-escrow-v2.js` | Demo happy-path sim (prints a stxer URL). |
| `../../simulations/simul-creator-escrow-v2-amend-approve.js` | Demo sim for the veto→amend and approve flows. |
| `../../tests/creator-escrow-v2.test.ts` | Clarinet-SDK (vitest) unit suite against mainnet timing, using `simnet.mineEmptyBurnBlocks` to cross windows. |

## Verifying

```bash
clarinet check                       # static type-check (registered in Clarinet.toml)
npm test                             # local vitest suite (needs remote USDCx data)
npm run verify:creator-escrow-v2     # self-verifying stxer mainnet-fork harness
```

The stxer harness is the authoritative end-to-end check: it deploys the
**unmodified** `creator-escrow-v2.clar` (mainnet 288/288/4200 timing) and
asserts the real USDCx SIP-010 transfer lands in each creator's **real
smart wallet** on a mainnet fork. The 288-block review window is genuinely
crossed via `addAdvanceBlocks`, so the exact constants destined for
mainnet are what execute (no shrunk-timing stand-in).

### Last verified run (real contract timing + real smart wallets)

`31 passed, 0 failed` against `creator-escrow-v2.clar` (288/288/4200) and
the creators' actual smart wallets:
- `creator-a-wallet = SP28MP1HQDJWQAFSQJN2HBAXBVP7H7THD1W2NYZVK.studiosam-wallet` → received **$50** (2 videos)
- `creator-b-wallet = SP28MP1HQDJWQAFSQJN2HBAXBVP7H7THD1W2NYZVK.emmex-wallet` → received **$25** (1 video)
- both operating wallets (`SP3C1YFP…` Sam, `SP2QVKZ2…` Emmexx) received **$0** — confirming payouts route to the smart wallet, not the signer.

Covered in that run: start/submit guards, `release`-before-window,
`approve` fast-track (+ re-approve / after-window / non-owner guards),
`veto` → `amend-delivery` (+ non-creator / not-vetoed guards), `expire` of
an abandoned slot, `sweep` refund `(ok u125000000)`, and double-sweep
guard.
