# Bounty mvllpu: Kairan's Seat v2 audit

AIBTC bounty `mvllpuv02f876aa9c4be` (6,000 sats), on
`contracts/charity/kairan-seat-lab-ocifarsito-v2.clar` (@6488f1f). This file
lists the findings that held, what changed, and what was rejected or
refuted. 32 submissions; credit goes to the first reporter of each finding.

Stxer mainnet fork: `simulations/verify-kairan-seat-lab-v2.js` passes
898/898 on the fixed contract
([845c5845](https://stxer.xyz/simulations/mainnet/845c584556ae502573ab079ed3e07acf)),
with steps for fixes 1, 3, 4, 5, 6 and 7. Fix 2 (underflow floor) has no
fork step, since the harness cannot burn USDCx from the contract; it is
covered in the clarinet suite. Clarinet suites and RV: pending.

## Accepted and fixed

| # | Finding | First reporter | Severity | Commit |
|---|---|---|---|---|
| 1 | Reserve lockout: `deposit-reserve` closed at DEADLINE and failure-at while the seat window can run past DEADLINE | Serene Loom (H-01) | Low | `86378a9` |
| 2 | `claim-reserve` underflow when USDCx balance < unrefunded freezes the STX + sBTC reserve | Serene Loom (M-02); trigger by Platinum Vera (F-1) | Low/Med | `1b8c83c` |
| 3 | Receipt swap: `release-seat` took no arguments, so LAB could replace the request before the owner's tx | Patient Reed (L-1) | Low | `ed111dd` |
| 4 | Donate front-run: a 1-micro gift made the completing gift fail with u110 | Platinum Vera (F-2) | Low | `c7e8e3f` |
| 5 | Funds sent straight to the contract after the claim had no exit | Patient Reed (I-2) | Low/Info | `8ab3c21` |
| 6 | TERMS said no one else can add to the reserve, but the reserve is the whole balance | Patient Reed (I-1) | Info | `bb2b534` |
| 7 | A request filed at failure-at - 1 left the owner no time to release | Valiant Sable (F1) / Frosty Narwhal (F4) | Info | `55a199d` |

### The changes

1. `deposit-reserve` drops `check-raising` and the failure-at check. It now
   only needs no claim yet (u106 after a claim). The reserve can still miss
   LAB if a claim lands before the deposit; FUNDRAISER deposits first.
2. `claim-reserve` computes `extra` as balance minus unrefunded, floored at
   0.
3. `release-seat (builder repo grant)`: OWNER passes the receipt it reviewed;
   a different pending request fails with u115 (`ERR_REQUEST_CHANGED`).
4. `donate (want ...)` takes `min(want, remaining)`; u110 only when nothing
   remains. Donor TERMS: a gift above what is still needed is reduced to it.
   Front ends must use an "at most" USDCx post-condition.
5. `sweep`: OWNER only, pays only LAB, sends the whole USDCx + STX + sBTC
   balance. Needs a claim and `unrefunded = 0` (u116 `ERR_NOT_CLOSED`): on
   success that holds right after `release-seat`; on failure, once every
   gift is refunded.
6. TERMS and DONOR_TERMS: direct STX/sBTC is added to the reserve; the
   owner's only powers are to release the seat and to sweep post-claim
   direct transfers to LAB.
7. `REVIEW_WINDOW u1008` (~7 days): `request-seat` fails with u113 unless it
   lands at least 1,008 blocks before failure-at. Every request, including
   a replacement, is blocked in the last 7 days. TERMS updated.

## Rejected

- **#8 Early completion** (Frosty Narwhal F3, Ruby Gorilla KS-06): if TARGET
  is hit early and LAB misses its 90-day window, refunds open before
  DEADLINE and the contract cannot raise again. By design: TERMS already
  say so, and LAB knows its window starts when the target is hit.

## Refuted

- A blacklisted or paused donor bricks a refund batch: live USDCx has no
  blacklist and no transfer pause (checked by Frosty Narwhal, Ruby Gorilla).
- Reentrancy in `donate` (Iron Hub): Clarity has no transfer hooks.
- `request-seat` after a claim (Inner Ozma): `check-seat` blocks it.
- `release-seat` missing `total == TARGET` (Stark Deer F-2): `request-seat`
  requires it and `total` never goes down.
- Underfunded release after an issuer burn (Tall Golem): LAB gets 1 micro
  less; donors are owed nothing on success.
- Token pause blocks release / fee-on-transfer USDCx: not how live usdcx and
  sbtc-token behave.
- `refund-many` cost: 100 donors measured at ~4.7% of the read budget.

## v3: reserve-only contract (Kairan's First Mile)

`contracts/charity/kairan-seat-lab-ocifarsito-v3.clar`, deployed as
`SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.kairans-first-mile-lab-ocifarsito`
(chavita.btc is OWNER). FUNDRAISER deposits STX + sBTC any time before the
release; LAB files a use-of-funds description with `request-reserve`
(replaceable); OWNER passes the reviewed description to `release-reserve`,
which pays LAB the whole balance once (u115 if the request changed).
Round-2 audit: AIBTC bounty `mvpsdbgk51aa6064f7a2`.

Tests (commit `76a38ee`), no contract bug found:

- Stxer mainnet fork, `simulations/verify-kairan-seat-lab-v3.js`: 113/113
  ([4609d5d8](https://stxer.xyz/simulations/mainnet/4609d5d87a0cdbbdd7feed7101ea71d6)).
  Every error code (u100-u107, u115), request swap, exact whole-balance
  payout to LAB including direct sends, wrong signers and proxy contracts,
  everything closed after release, deny-mode post-conditions.
- Rendezvous, `tests/rv/kairan-seat-v3/` (`node tests/rv/kairan-seat-v3/run.mjs`):
  18 jobs (3 release-timing profiles x invariant/property x 3 seeds x 600
  runs), 0 failing. Invariants: funds leave only to LAB, claim and request
  frozen after release, release pays the full balance. All 4 deliberately
  broken copies of the contract were caught.

Known by design: STX/sBTC sent straight to the contract after the release
has no exit (v3 has no sweep).
