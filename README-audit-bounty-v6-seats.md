# Audit bounty review: markets v6 full-book priority, protected seats, band rungs (Sept 2026)

AIBTC bounty `mu0ox53v1fae7181582b`, 21,000 sats plus a 5,000-sat
optimization bonus, posted 2026-09-13, source only, pre-deploy. Scope: the
NEXT Jing deploy set at master `1b9a339`+: `contracts/markets-sbtc-stx-jing-v6.clar`
(the focus), `jing-ladder.clar`, `jing-buy-stx-core-spread.clar`,
`jing-sell-stx-core-spread.clar`, `jing-core-v5.clar`. New since the previous
bounty (`mtxs6nxg7a6d97081b11`, decision in
`contracts/README-markets-v6-pegged.md`): full-book priority with one park
path, ladder-owned protected seats with a local copy on the market, and the
two miner-band rungs. Design and every harness id:
`contracts/README-markets-v6-pegged.md`.

Nine submissions so far; the real findings are fixed on master. **No winner picked
yet**: the bounty is open until it closes and later entries are reviewed the
same way. Nothing in scope is deployed, so every fix rides the next deploy.

## Source moved since posting (2026-09-15): read this before submitting

Three changes landed on master while the bounty is open, all found by the
new Rendezvous fuzz harness (`tests/rv/README.md`), none from a submission:

- `06f57a3` **`pegged-bid` / `pegged-ask` guard.** A spread at or over
  BPS_PRECISION returned the switched-off sentinel instead of aborting
  (`deposit-token-y` underflowed before its u1026 assert). Cosmetic.
- `b7dc673` **`get-taker-capacity` takes the taker** as a fourth argument
  `(mid limit deposit-x taker)` and leaves that principal's out-of-range
  opposite-side order out of `walk-cap`: the walk never fills a self-cross
  (it would print a match at a self-chosen price), the batch still clears
  both of a principal's sides at the oracle mid, so in range it still
  counts. Before, a user resting a bid who took exactly the reported
  capacity with sBTC got u1017. Router v5 passes `tx-sender`. Reported by
  the fuzz sizing property, seed -2050959550; a submission on the same
  point after this date is a duplicate.
- **`get-taker-capacity` models the queue** (same day, after `b7dc673`): on
  a side full for the taker it reports `min-taker` (the smallest unseated
  resident plus one, net terms; zero on an open side) as a new tuple field
  and reads zero caps when its net-cap could not enter (the size rule,
  u1010). Router v5 drops the book leg under `min-taker`. Adding a field
  keeps every `get gross-cap` caller working.

The commented source is over the 100,000-byte deploy limit since `b7dc673`
(100,655; 95,894 with comment-only lines stripped). Every harness deploys
the stripped form; so will the deploy. The RV harness also runs 31
invariants and 8 properties on the market, 12 and 2 on each rung, 6 on the
ladder and 3 on the core through the market, all green; it found no theft
or stuck-funds path, which is the space this bounty pays for.

## Submissions and verdicts

| # | Submitter | Finding | Holds | Rating filed | Decision |
|---|-----------|---------|-------|--------------|----------|
| 1 | Celestial Mast | `retire-band` leaves the market's `seated-x/y` copy stale; with no current rung left on that side nothing can prune it; the retired rung stays un-parkable and uncounted by `side-full`, the list reaches 50 and the 51st ordinary deposit panics in `as-max-len?` instead of parking | yes | MEDIUM | **Fixed** (`d9ee89e`): market `prune-seats`, permissionless, both sides, idempotent (section 2). Owner-recoverable before the fix (seat any rung on that side), so MEDIUM stands; "no legal call can ever prune it" was true only for that case. |
| 2 | Patient Reed / apeirs | A replaced or retired band rung can never withdraw, claim, deposit or push again: the ladder deleted its `registered` row and every rung action ended in a ladder `log-*` gated on that row; 100% of member funds stuck on the documented upgrade path | yes | HIGH | **Fixed** (`824f08b`): the ladder never deletes `registered`; all six rungs log best effort (section 1). Novel, exact lines, drop-in repro, correct two-line fix, and the right remark that the miner-band harness never funded a rung before replacing it. |
| 2b | Patient Reed / apeirs | LOW: the same trap fires later on a retired rung nobody touched, once its order sells out, through the `try!` on `log-epoch-closed` in `sync` | yes | LOW | Same root cause, same fix. |
| 3 | Glowing Key | `side-full` sizes the open region as `len - seated-on` against `50 - seats`, and a retired or replaced holder keeps its position while leaving the seated list, so the region sits one ABOVE the cap; one arrival then parks two makers | yes | LOW-MEDIUM (self-rated) | **Fixed** (section 5). Source-only, no fork run, and said so. First to name the over-cap state and the two-park consequence. |
| 4 | Sonic Mast | "CORRECTION: submission 2 does not hold" - `registered` is never deleted and all rung `log-*` are `is-ok`, not `try!` | **no** | n/a | **Rejected as a refutation.** Both observations are true of `6850bfc`, the source Sonic Mast read, because `824f08b` fixed exactly that 2.5 hours earlier. Submission 2 was filed against the POSTED source `1b9a339`, where it was real and reproduced 25/83 on a fork. Reviewing post-fix source and concluding the finding never held is the one failure mode this table exists to catch. Patient Reed keeps the credit. |
| 5 | Diamond Lance (Nilo) | CRITICAL: `bf779cc` swapped the epoch-close test from the index to an amount, so `unfilled-index` truncates to 0 while the epoch stays open; deposit divides by zero, every withdraw is u7007, no recovery. Plus HIGH: the two-park above, with the added point that `find-smallest` ranks on size alone and never reads the limit price, so the second victim can be IN RANGE | yes | CRITICAL + HIGH | **Both fixed** (sections 3 and 5). Strongest entry of the round: found a defect we introduced ourselves while fixing something else, reproduced it in four rounds on our own RV manifests, and named the exact fix. |
| 6 | Light Brio | LOW: `set-max-band-per-side` asserts a floor but no ceiling, so the dial can be set to 51; the market's seated list is `(list 50 principal)` and the 51st rung's `initialize` dies in `unwrap-panic` | yes | LOW | **Fixed** (section 6). Correct, exact, and honest about what it did not clear. |
| 7 | Devoted Basilisk | NOVEL HIGH: `sync-seat` appends via `with-seat` BEFORE it filters, so at 50 live seats a replacement builds a 51-element list and panics before the prune that would free its slot can run. Plus independent confirmation of the CRITICAL and of the two-park | yes | HIGH | **Fixed** (section 4). The append-before-filter ordering is novel and distinct from both the dial ceiling and the already-fixed stale-seat prune. |
| 8 | Swift Lumen | Source-bounded confirmation; independently reached the replacement-at-50 edge and explicitly declined to claim it as novel because submission 7 had already disclosed it | yes | n/a | No novel finding, and says so. Noted here because declining to relabel a known mechanism as your own is the behaviour this bounty wants. |
| 9 | Noble Ox | The Sep. 19 maker-margin change omitted the widened maker check from both non-crossing `reprice-or-swap` branches. An existing maker could write a limit inside the protected band, where `set-token-*-limit` rejected the same order, without taking or paying the age-adjusted rebate | yes | MEDIUM | **Fixed and fork-proven** (section 7): actual crosses still swap; non-crossing writes inside 40 bps now return u1016 on both sides; safe writes and an empty opposite book still work. Exact-source stxer matrix 22/22. |

Leading submission: **Diamond Lance / Nilo** (5). The only CRITICAL, and the
only finding in either round where member funds are lost rather than delayed:
a rung that reaches the zero index is frozen forever with everything inside
it. It is also the only one that caught a defect we shipped ourselves, in a
commit whose whole purpose was to make that same code better.

**Patient Reed** (2) stays second on merit and keeps the credit despite
submission 4's attempted correction (see the table). **Devoted Basilisk** (7)
third: a genuinely novel HIGH plus accurate independent confirmation of two
others. Glowing Key (3) named the over-cap state first; Diamond Lance built
the full consequence on top of it, so both are cited in section 5. Noble Ox
(9) is a valid later MEDIUM regression report, but it does not outrank the
CRITICAL or the earlier novel HIGH findings.

Nobody has delivered a qualifying 5,000-sat read-count bonus result. Devoted
Basilisk proposed removing the redundant second full-book fold, but supplied
no measured 20%+ fork result with runtime and source-size evidence.

### Severity in plain terms

Only the CRITICAL loses money. Everything else in this round costs an
operator an aborted transaction or costs a maker a slot it can take back:

| # | worst case | member funds |
|---|-----------|--------------|
| 3 (CRITICAL) | a rung freezes at index 0; deposit divides by zero, every withdraw is u7007, no admin path out | **lost, permanently** |
| 4 (HIGH) | a replacement rung cannot take a seat on a full side; its `initialize` panics | safe |
| 5 (HIGH) | one arrival parks two makers instead of one, and the second can be in range | safe; parked keeps its equity and is readmittable |
| 6 (LOW) | the operator sets the dial to 51 and the 51st rung cannot deploy | safe |
| 7 (MEDIUM) | a repricing maker enters inside the protected band and may receive maker treatment after a refresh | safe; stale-price option / fee bypass |

## 0. Found by us while testing the CityCoins vault on this book (MEDIUM, fixed d1b32bd)

Invariant B in this bounty's own list: "in-range resident parked by an
out-of-range newcomer". It held. `park-tenth-token-x/y` returned
`(ok false)` for an out-of-range newcomer with no price edge, and the
core's size rule then ran `find-smallest-token-x-fold`, which skips seated
makers only: the smallest ordinary maker of ANY range was parked. A
5,000-sat ask 2% over the mid parked a 1,000-sat zero-spread peg sitting
at the mid (the CityCoins vault, `stxer-ccd016-v2-parked.js`, first run).
The README even described it: "never displaced by a newcomer's priority,
only by size". Two "smallest" folds with different regions was the root.

Fix: `park-tenth` takes the newcomer's size (amount + parked carry); the
out-of-range no-edge case now fights inside the out-of-range region only
(`smallest-outside-*-fold`: not seated, not top N, not in range), bigger
parks the region's smallest, else u1010, empty region u1010. A switched-off
resident is parked first on every path. The core's size rule among everyone
is reached only by an in-range newcomer on a side with nobody out of range.
Full v6 rerun in `contracts/README-markets-v6-pegged.md` ("Full rerun
2026-09-14"); bounty-fixes section P rewritten (P3's out-of-range deposit
onto a side full of in-range makers is u1010, P3 stays parked).

## 1. Replaced or retired rung locked its members out (HIGH, fixed 824f08b)

Claim: after a band replace or `retire-band`, the old rung's members can
never withdraw or claim.

Code, pre-fix: `jing-ladder.clar` `register` (band branch) did
`(map-delete registered old)` and `retire-band` did `(map-delete registered
holder)`. Every ladder `log-*` starts with `(try! (rung-of contract-caller))`,
u6010 when the row is gone. In both band rungs `log-withdraw` and
`log-claim` were the return value of `withdraw` / `claim`, `log-deposit` of
`deposit`, and `log-push` / `log-epoch-closed` were `try!`'d in `push` and in
`sync`, which every entry point calls first. So the documented upgrade
("members of the old rungs withdraw and join") locked the money it was
meant to move. Confirmed on a fork: 25 of 83 checks failed on `1b9a339`,
every member action on a replaced or retired rung `(err u6010)`.

Fix:
- Ladder: `registered` is never deleted. Seat status was already decided by
  the `rungs` key alone (`is-band-current` = registered under that side AND
  the key points at you), so replace and retire still drop the seat. New
  `is-current-rung who`; every rung event carries `current`.
- All six rungs (fixed, peg, band): every ladder log is `(is-ok ...)`,
  never `try!` or the return value. A refused print is a missing event,
  never a stuck member. Two independent guards; either alone prevents the
  lock.
- Taken further at the operator's request: band rungs can initialize
  WITHOUT a seat (`initialize(bps, seat)`, `register-unseated`), and the
  owner can seat a registered rung later or re-seat a replaced / retired
  one (`seat-band who`). Replace and retire are reversible without a
  redeploy. `register` and `seat-band` share `claim-seat`.

## 2. Stale seat after retire (MEDIUM, fixed d9ee89e)

Claim: the market's local seated list keeps a retired rung protected when
no current rung is left on that side.

Code: `sync-seat who` (market) is add-only, u1028 unless the ladder seats
`who`, and prunes only as a side effect of that. The ladder cannot call the
market (the market depends on the ladder), so `retire-band` cannot prune.
With a current rung on the side anyone can sync it and the prune runs; with
none, nothing can. Meanwhile the park and size folds skip the stale seat and
`side-full-x` subtracts it, so the list can reach 50 and the next ordinary
deposit hits `(unwrap-panic (as-max-len? ... u50))`.

Fix: `prune-seats` on the market, right after `sync-seat-count`: filters
both lists through the same ladder check `sync-seat` uses and refreshes the
count. Removes nothing current, adds nothing, so it is safe permissionless.
Market source 99,608 bytes, no deposit path touched.

## 3. A rung could freeze at index 0 with member funds inside (CRITICAL, our own regression)

Found by Diamond Lance, confirmed independently by Devoted Basilisk. This is
the one that matters, and we caused it.

### In plain terms

A rung is a shared pot. Members put STX in and get shares; takers buy the
STX out. `unfilled-index` is simply the price of one share, in STX, starting
at 1. As the pot sells down that price falls, and when the pot is empty the
epoch closes: fresh pot, share price back to 1.

`bf779cc` changed which rule closes it.

- before: close when the SHARE PRICE falls under a millionth
- after: close when LESS THAN 0.01 STX is left in the pot

The change was right on its own terms. A sold-out rung keeps a leftover of
roughly fixed size, so a fraction closed a small pool late and a big one
early. What it missed is that the old rule was also the only floor under the
share price.

| step | in the pot | shares | price per share |
|------|-----------|--------|-----------------|
| start | 1,000,000 STX | 1,000,000 | 1 STX |
| takers buy it down | 0.01 STX | 1,000,000 | 0.00000001 STX |
| someone deposits 1,000,000 STX | 1,000,000 STX | 100 trillion | 0.00000001 STX |
| takers buy it down again | 0.01 STX | 100 trillion | rounds to **0** |

At the second row the epoch should close, but the new rule only asks whether
less than 0.01 STX is left and there is exactly 0.01 STX. So it stays open,
the next depositor is issued a hundred trillion shares for the same money,
and dividing the leftover by that rounds to zero.

Zero is terminal. Depositing divides by the share price, so it aborts on
DivisionByZero. Withdrawing pays shares times zero and returns u7007. `sync`
recomputes the zero. No operator function can reset it. Every member's STX
and accrued sBTC is locked permanently.

### In contract terms

`new-index` is `unfilled-index * actual / recorded`, and `recorded` is
`pooled-stx()`, which is `total-shares * unfilled-index / SCALE`. The
`unfilled-index` cancels:

```
new-index = actual * SCALE / total-shares
```

so once `total-shares` passes `actual * SCALE` the integer division truncates
to 0 while `actual` is still above `SOLD_OUT_DUST`. `total-shares` climbs
into that band on its own, because `deposit` mints `amount * SCALE /
unfilled-index`: every sell-down and top-up cycle multiplies it. Both sides
carry it and the buy rung opens the band far earlier, its dust floor being 10
sats against 10,000 microSTX. Reproduced in four plain deposit and fill
rounds: `1e12 -> 162403000 -> 26465 -> 4 -> 0`.

Fix, all six rungs: close on EITHER test. `SOLD_OUT_INDEX u1000000` returns
as a constant, carrying a comment that says why it exists so it is not
removed again as dead weight.

```clarity
(and
  (or (< actual SOLD_OUT_DUST) (< new-index SOLD_OUT_INDEX))
  (begin ... close the epoch ... ))
```

Neither test can do the other's job. The dust test still catches the case
`bf779cc` was written for, a walked rung on a whole-sat remainder at an index
around 1e-4, nowhere near the index threshold. The index test is the only
thing that keeps the price away from zero.

### What the fix costs, stated honestly

Restoring the index close brings back the half of `bf779cc`'s complaint that
was about big pools: a large pool can close while up to 1e-6 of it is still
resting, and that remainder rides into the next epoch as a gift to its
depositors rather than going back to the members who funded it. On a
1,000,000 STX rung that is about 1 STX.

We take that trade knowingly. The exposure is bounded at a millionth of the
pool and it is a transfer between epochs; the alternative is an unbounded,
permanent loss of everything in the rung. The small-pool half of the
complaint is fully kept, because the dust test still fires there.

Reclaiming the remainder instead of gifting it is a v7 item: pay it out to
the closing epoch on close rather than rolling it forward. It is a
distribution change, not a safety one, and it does not belong in a fix whose
job is to stop a freeze.

### A second guard at the mint

`deposit` divides by `unfilled-index` to mint shares. It calls `(try! (sync))`
first, and after this fix `sync` guarantees the index is either healthy or
freshly reset, so an assert between them holds by construction:

```clarity
(asserts! (>= (var-get unfilled-index) SOLD_OUT_INDEX) ERR_INDEX_COLLAPSED)
```

`ERR_INDEX_COLLAPSED` is new at `u7011`, in all six rungs. It does not rescue
a pot that already reached zero - withdraw would still fail - and that is not
what it is for. It turns a silent `DivisionByZero` into a named refusal, and
more importantly it fails loudly the moment any future change breaks the
guarantee in `sync`. This entire class started with one guarantee quietly
losing its enforcement and nothing noticing, so the guarantee is now written
down at the line that depends on it.

### What our fuzzing did and did not do, honestly

`invariant-unfilled-index-bounds` is strengthened in all six RV files. It
previously asserted only that an open epoch with shares holds at least
`SOLD_OUT_DUST`, which was true throughout the life of this bug; it now also
requires `unfilled-index >= SOLD_OUT_INDEX`, the conjunct that fails on this
path.

**That is the right assertion, but it is not what would have caught this, and
we checked rather than assumed.** Negative control: the bug was put back into
`jing-sell-stx-core-spread` with the strengthened invariant left in place, and
Rendezvous run at 500 runs. `invariant-unfilled-index-bounds` was evaluated 32
times and passed every one. The random driver never reaches the collapse
state, because getting there needs a large deposit, a walk down to just above
the dust floor, and another large deposit, while the RV drivers bound deposits
to about 1 STX. So the invariant is correct and cheap and will fire if a
driver ever reaches that state, but the honest claim is that RV did not and
would not have found this.

What found it is Diamond Lance's deterministic reproduction on our own
manifests, four deposit and fill rounds walking the index `1e12 -> 162403000
-> 26465 -> 4 -> 0`. A deterministic regression test that drives that exact
sequence is an open item; the invariant alone is not coverage.

## 4. A replacement could not take a seat on a full side (HIGH, fixed)

Found by Devoted Basilisk; independently reached and correctly not claimed by
Swift Lumen.

`sync-seat` composed its two list operations in the wrong order:

```clarity
(filter still-seated-x (with-seat (var-get seated-x) who))
```

`with-seat` appends first, through `unwrap-panic (as-max-len? ... u50)`, and
the prune runs second. At 50 entries the append fails and the transaction
aborts before the filter that would have dropped the rung being replaced ever
runs. So the documented replace path fails exactly when every seat is taken,
which is the only situation in which anyone replaces rather than taking a
free seat, and it fails as an opaque VM panic rather than a named error.

Fix: prune first, then add, and report a real error if it still does not fit.
`with-seat` now returns an optional instead of panicking.

```clarity
(and x (var-set seated-x
  (unwrap! (with-seat (filter still-seated-x (var-get seated-x)) who) ERR_SEATS_FULL)))
```

`ERR_SEATS_FULL` is new at `u1029`. The one case where a seat genuinely
cannot fit, 50 live current seats plus a real 51st, is only reachable through
the missing dial ceiling in section 6, so the two fixes close it together.
`prune-seats` needed nothing: it only filters.

## 5. One arrival could park two makers (HIGH, fixed)

Over-cap state named first by Glowing Key; full consequence and the in-range
second victim by Diamond Lance; confirmed by Devoted Basilisk.

A full-book deposit runs two rules in sequence: `park-tenth`, which chooses
its victim by price and range, then the core's size rule, which parks the
smallest. They are not meant to both fire, and normally they do not, because
`park-tenth` removes its victim and the core's re-test then sees the open
region one below the cap.

The over-cap state breaks that. A retired or replaced seat holder keeps its
funds and its resting order while dropping out of the seated list, so it
counts toward `len` but not toward `seated-on` and the open region sits one
ABOVE the cap. `park-tenth` parks one, the re-test still reads the region at
the cap, and the size rule parks a second. Two residents lose their slot for
one newcomer, which is the "two parked" outcome invariant B forbids.

The second victim is also chosen blind: `find-smallest-token-x/y-fold` ranks
on size alone, skips seat holders and nothing else, and never reads the limit
price, so it can park a maker that is IN RANGE.

Fix: `park-tenth` already answers `(ok true)` or `(ok false)` and that answer
was being discarded. Both cores now take a `parked-already` flag and gate
their size branch on it.

```clarity
(if (and (is-eq existing u0) (not parked-already) (side-full-x depositors tx-sender))
```

Three call sites bind it, not two: `deposit-token-x`, `deposit-token-y`, and
the swap-with-remainder path, which has the same park-then-core shape and was
exposed identically. When the priority rule chose a victim the size rule has
nothing left to decide; when it declined, which happens only for an in-range
newcomer with no out-of-range residents, the size rule still runs and is
correct, because every resident is then in range and size is the right
tiebreak. One fix closes both halves: with no second park, the range-blind
fold never picks a victim it should not.

## 6. The seat dial had a floor but no ceiling (LOW, fixed)

Found by Light Brio, confirmed by Devoted Basilisk.

`set-max-band-per-side` asserted only that `n` is at least the band count on
each side. Nothing capped it at the market's slot count, so the operator
could set 51; the market's seated list is `(list 50 principal)` and the 51st
rung's own `initialize` then died in `unwrap-panic`, so that spread could
never deploy and the reason was invisible.

Fix: a `MAX_SEATS_PER_SIDE u50` constant on the ladder and a third conjunct
in the same assert, so the dial is bounded on both ends and the refusal is
`ERR_BAND_FULL` rather than a panic downstream.

## 7. `reprice-or-swap` bypassed the maker margin (MEDIUM, fixed)

Found by Noble Ox after the Sep. 19 maker-margin change. Both
`reprice-or-swap-token-y` and `reprice-or-swap-token-x` wrote the caller's
new order first, then classified it only against the un-widened oracle mid.
An order 30 bps from the mid therefore took the non-crossing branch, paid no
age-adjusted rebate and stayed on the book, while `set-token-*-limit` rejected
the identical maker write through `widen-down` / `widen-up`.

Fix: keep the real-mid test first, so an actual cross still swaps and pays.
In the non-crossing branch, when the opposite list is non-empty, apply the
same widened check used by deposit, readmit and set-limit; a near maker exits
u1016 and the earlier limit/log writes unwind atomically. An empty opposite
book still needs no oracle classification. The operator selected a 40-bps
maker band: STX bids are tested against a mid widened down 40 bps, sBTC asks
against a mid widened up 40 bps.

The stale-price charge was also made deliberately simple: 20 bps through 30
seconds, then one additional bp per second. Accepted updates stop at age 79,
so the largest successful charge is 69 bps; the u70 ceiling is used by
`gross-up` and by the defensive age clamp. Lazer feed timestamps are converted
from microseconds to seconds before age is calculated, so `age`,
`REBATE_GRACE_SECS` and `MAX_STALENESS` use the same unit.

Focused exact-source stxer harness:

| harness | result | sim |
|---|---|---|
| `simulations/verify-v6-reprice-margin-lazer.js` | 22/22 | `429e20c92193e871f18da61f0a9e7c27` |

The matrix deploys two fresh v6 markets and proves both directions: a near
maker may rest while the opposite book is empty; a maker 60 bps away is
accepted; a maker 30 bps away is rejected u1016; and an order crossing the
real mid still executes through the swap branch. The harness removes comment
lines, blank lines and leading indentation from deployment text only (80,813
bytes before the 40-bps edit); the readable contract source is unchanged.

## Verification (stxer mainnet forks, no Pyth key)

`simulations/verify-v6-rungs-replace-keyless.js`: band rungs read the RFQ
native oracle and every deposit lands on an empty opposite side, so no
price is fetched. Sell replace, buy replace, retire, the old rung living on
as an ordinary maker, unseated init, seat-band (stranger u6001, unknown
u6010, seated u6012, re-seat over a successor, a full side u6011), the max
dial, retire then seat again, and the prune (a side with no current rung,
sync-seat u1028 all round, prune clears it, keeps every current seat, adds
nothing, idempotent).

| harness | result | sim |
|---|---|---|
| v6 rungs-replace-keyless, source `1b9a339` (reproduction) | 58/83 | every member action on a replaced / retired rung `(err u6010)` |
| v6 rungs-replace-keyless, fixed | 149/149 | `1e45965140897caa236c91dc41b8fc07` |
| v6 rungs-keyless RUNG=buy / sell | 37 / 37 | `2ee228909c498e6e5a218514af01453d` / `f6284fc04a3c80acfc9795771bc4ecd6` |
| v6 rungs-keyless RUNG=buy-peg / sell-peg | 40 / 40 | `80a2227b340dc0b8c82f4d365458a8f6` / `1f7360371a09dd370b8c736e72d49c30` |

### Rendezvous, on the four fixes above (2026-09-19)

| run | result |
|---|---|
| `rv:rungs` invariants, 500 runs each, all six rungs | green, zero invariant failures |
| `rv:v6` invariants on the market | aborted early on a fuzz-input `BadTokenName` in `cancel-token-x-deposit` (a random `(string-ascii 128)` fed to `with-ft`); unrelated to these changes, that function is untouched |
| negative control: bug reinstated in `jing-sell-stx-core-spread`, invariant kept | **did not fire** - 32 evaluations, 32 passes (see the honesty note in section 3) |

`clarinet check` is unchanged from baseline at 11 errors and 481 warnings,
measured twice each way with the tree stashed and restored. All 11 are
pre-existing and live in `jing-ladder`, `creator-escrow` and `jing-core-v3`.

Not rerun: every Lazer fork harness, which needs the Pyth key that is not on
disk. The seat and park fixes change behaviour those harnesses assert on -
epochs close earlier, and only one maker parks per arrival - so expectations
will move and they must be rerun with the key before the deploy set is cut.

| v6 rungs-miner-band, Lazer (`initialize(bps, seat)`, S8/S9 registered = true, not current) | 174/174 | `635157fe62c07d3b5fef21b84c8e4913` |

Market Lazer harnesses rerun on `d9ee89e` (market with `prune-seats`), with a key:

| harness | result | sim |
|---|---|---|
| markets v6 bounty-fixes | 201/201 | `0c2ad98df7f55b800e33223213cf9bda` |
| markets v6 withdraw | 102/102 | `ee78cdb45afb3af5a17d2aa6bf62aa84` |
| v6 peg-park | 41/41 | `db351920e687d0aec7122bbfb44adcd5` |
| vault v6 parked | 137/137 | `24f1efd2b6d9abed3abe6d6ed1a6e450` |

## Commits

- `824f08b` ladder keeps `registered`; `is-current-rung`; unseated band
  rungs; `seat-band`; best-effort logs in all six rungs.
- `9635ed9` README section, keyless replace harness, miner-band harness.
- `d9ee89e` market `prune-seats`; harness R6.
