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

Two submissions so far, both real, both fixed on master. **No winner picked
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

Leading submission so far: **Patient Reed** (2), the only HIGH, stuck funds
on a path that will be exercised in normal operation. Celestial Mast (1)
second: a real defect with a real panic path, no theft, owner-recoverable.
Nobody has attempted the 5,000-sat read-count bonus.

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
