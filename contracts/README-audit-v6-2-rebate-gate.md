# Audit review: v6-2 staleness rebate + maker margin gate

Our review of the submissions to the AIBTC bounty "Audit 10.5k: Jing v6-2
priced-staleness taker rebate + maker margin gate (deployed)"
(`GET https://aibtc.com/api/bounties/muaqb2yb546e17c25866`).

Target: `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-2`,
source `contracts/deployed/marketsv6-2Deployed.clar`.

Each submission is checked against the deployed source. For each one we
record what holds, what does not, and what we decided.

| # | Submitter | Headline | Our verdict | Decision |
|---|---|---|---|---|
| 1 | Diamond Lance ("Nilo") | Grace window too short for the block clock (F) | Real, but smaller than claimed: ~3 bps average | Keep as is, documented |
| 2 | Patient Reed | Margin gate bypassable (B+D+E) | HIGH holds; MEDIUM partly; LOW holds | HIGH fixed in `markets-sbtc-stx-jing-v6-3` (source, not deployed); MEDIUM + LOW open |
| 3 | Light Brio | Same HIGH/MEDIUM/LOW as #2 | Holds, but all duplicates of #2 (posted 3 h later) | Covered by #2 |
| 4 | Rushing Orion | Gate admits an order that overlaps a resting order just outside the mid | Holds: not covered by the first v6-3 draft | Fixed in v6-3 (book search to `min/max(limit, mid -/+ 0.4%)`) |
| 5 | Void Kael | `unwrap-panic` on a full depositor list (low) + gap 6 (min raised under resting orders) | Low, holds; gap 6 holds | Fixed in v6-3 + `jing-ladder-v1` |
| 6 | Hasty Dex | | _pending_ | |
| 7 | Eternal Harp | | _pending_ | |

---

## 1. Diamond Lance ("Nilo") - the grace window and the block clock

### Claim

`age` is measured against `stacks-block-time`, the timestamp of the block
the transaction lands in. Stacks blocks arrive in jumps (median ~13 s,
p95 ~31 s in their sample). The 30 s grace (`REBATE_GRACE_SECS`) is said to
cover "fetch, wallet prompt, confirm, wait a block", but the block wait alone
can use it up. So honest takers pay a staleness surcharge for inclusion
latency they do not control. Severity claimed: medium.

### What we checked

| Claim | Verdict |
|---|---|
| `age = stacks-block-time - oldest publish time` (`fresh-classification-price-aged`) | True |
| Curve: 20 bps to 30 s, then +1 bp per second | True |
| Block cadence: median 13 s, p95 31 s | About right. Our sample (239 consecutive blocks, heights 9041190-9041429, 2026-09-21): median 17 s, p95 34 s, max 105 s |
| "The p95 block interval exceeds the whole grace" | Overstated (see below) |

### Where the argument overstates

A transaction does not wait a full block interval. It waits only for the
**rest of the current one**. For a transaction sent at a random moment, the
average wait in our sample is **13.7 s**, not the full interval.

Our apps fetch the Lazer update right before the wallet opens, so `age` at
inclusion is roughly *time in the wallet + wait for the next block*. With
our block sample:

| Time in wallet | Trades paying more than 20 bps | Average extra paid |
|---|---|---|
| 5 s | 11% | +2.5 bps |
| 10 s | 16% | +3.2 bps |
| 15 s | 28% | +4.3 bps |

Read the last row: with 15 s in the wallet, about 28% of trades pay more
than the 20 bps base, and on average a trade pays 4.3 bps (0.043%) extra.

The effect is real and falls on honest takers. On average it is about
**3 bps**, not the 70-bps headline case in the report, which is the rare
tail.

### A higher fee does not fix it

A higher fee only buys a place in the **next** block ahead of other
transactions. It cannot make that block arrive sooner. The unavoidable part
is the wait for the next block, which no fee removes. A fee does help when
the mempool is busy: a cheap transaction can miss one or two blocks and wait
30-60 s more, which is where the large surcharges come from.

### On the proposed fixes

- **"Measure age in blocks."** Not directly possible. The Lazer update
  carries a wall-clock publish time, not a block height. Counting blocks
  would need a time-to-block conversion, which is the same as dividing by an
  assumed block time.
- **"Raise the grace to 45-60 s."** Workable. The cost is that the first
  45-60 s of the option are then free to everyone, which is the thing the
  curve exists to price.

### What the report got wrong or missed

- **The 70 bps cap is unreachable.** Freshness is strict
  (`pub > stacks-block-time - MAX_STALENESS`), so `age <= 79` and the most a
  taker pays is 69 bps. The `>= MAX_STALENESS` branch of
  `rebate-bps-for-age` is dead code. The report said the clamp "agrees at
  80" and missed that 80 never happens. (Also found by Patient Reed, Light
  Brio and Eternal Harp.)
- **It marks the margin gate (scope B) clean.** Other submissions say the
  gate is bypassable. See the reviews below. If they hold, this report
  missed the main finding of the bounty.

### Decision

**Keep the curve as is.** Honest takers overpay about 3 bps on average,
mostly in the tail where the next block is slow. That is an acceptable price
for keeping the free window short. Widening the grace would give the first
45-60 s of the option away to every taker, including those exercising it.

We keep the finding documented here, and we will say it plainly in user
docs: the 20 bps base can rise by a few bps when a block is slow, and paying
a higher fee does not change that.

---

## 2. Patient Reed - margin gate bypass

Three findings: HIGH (B+D+E), MEDIUM (C+F), LOW (A).

### HIGH - the gate scans the book at the wrong price: **holds**

Every gate site passes the **widened** mid into `would-take-as-y/x`
(deployed lines 1259, 1415, 1659, 1694, 1732, 1769, 1843, 1919). Those
functions use that one price twice:

```clarity
(asserts! (not (would-take-as-y (widen-down price) bid)) ERR_MUST_USE_SWAP)

(define-read-only (would-take-as-y (price uint) (limit uint))
  (and (> price u0) (<= price limit)                        ;; 1. is the entrant in the money?
       (get found (fold live-offer-fold ... { price: price })))) ;; 2. is any ask live at this price?
```

Widening makes test 1 stricter, as intended. But it makes test 2 **looser**:
the book is scanned at 0.996 x mid, so an ask whose limit is in
`(0.996 x mid, mid]` is not seen. Settlement then clears at the **raw** mid,
where that ask is live. So an entrant can:

1. `deposit-token-y` with a bid at or above the mid. The gate scans at
   0.996 x mid, finds no ask, and admits it. No rebate is taken.
2. `settle-with-refresh` (public). Both orders clear at the mid. The entrant
   pays the 10 bps fee and nothing to the maker.

That is taker execution at maker cost, which is the dodge the gate exists
to close. The same holds for the x side, mirrored.

**Why it matters for us specifically.** A pegged spread-0 rung rests at
**exactly the mid**, so it sits inside this blind band at all times. Our own
at-mid ladder rungs are the natural counterparty for the dodge. They fill,
at the mid, but lose the 20 bps rebate they should earn (step 183 of the
worked example shows that rebate being paid through a normal swap).

**Severity, our view.** No principal is at risk: every order fills at or
better than its limit. What leaks is the rebate, from makers to the
entrant: 20 bps per fill, more if the entrant also picks a stale print for
the settlement. That breaks the fee model the bounty is about, so we accept
HIGH in scope.

**The rule the gate should enforce, in one line.** A new bid must stay at
least 0.4% away from every resting ask it could hit; if it is closer, or
crosses it, it is refused and must use Swap. (Mirror for a new ask.)

**Worked numbers.** Mid = 100. A resting ask sells at 99.8 or more. A new
bid pays up to 105.

- At the real mid (100) both are willing, so they trade at once. The bid is
  a taker and should be refused (or pay the rebate through Swap).
- The gate instead looks for asks willing at **99.6** (the widened mid). The
  ask at 99.8 is not, so the gate sees nobody to cross and admits the bid.
- Settlement then matches the two at 100. The bid pays 10 bps and no rebate.

So the gate only checks part of the book. Asks between 99.6 and the mid are
the ones it misses.

**Why.** `would-take-as-y` takes one price and uses it for two questions:

1. Is the entrant willing at this price? Widening the mid **toward** the
   entrant (down, for a bid) makes this stricter. Correct.
2. Is any resting ask willing at this price? Here the same move makes the
   search **smaller**: an ask at A is willing only when the price is at or
   above A, so a lower price finds fewer asks. Backwards.

**Fix.** Give the book scan its own price. For a new bid:

```clarity
;; entrant test at the mid moved toward the bid (unchanged);
;; book scan at the mid moved AWAY from it, capped at the bid's own limit
(define-read-only (would-take-as-y-gated (entrant-price uint) (book-price uint) (limit uint))
  (and
    (> entrant-price u0)
    (<= entrant-price limit)
    (get found (fold live-offer-fold (get-token-x-depositors (var-get current-cycle))
      { price: book-price, found: false }))))

(asserts! (not (would-take-as-y-gated
  (widen-down price)
  (if (< bid (widen-up price)) bid (widen-up price))   ;; min(bid, mid + 40 bps)
  bid)) ERR_MUST_USE_SWAP)
```

The ask side mirrors it: entrant test at `(widen-up price)`, book scan at
`max(ask, widen-down price)` through `live-bid-fold`. Apply at all eight
gate sites.

Two strengths, both need a new market version:

| Book scan at | Closes | Leaves open |
|---|---|---|
| the raw mid (`price`) - first v6-3 draft | the dodge above: cross now, settle at the real mid | an order resting just across a nearby ask, filled when the mid moves < 0.4% |
| `min(bid, widen-up price)` - **shipped in v6-3** | both: anything that crosses, or would cross within the 0.4% margin | nothing the margin is meant to cover |

The cap at the bid's own limit matters: without it, a bid at 99.7 would be
refused because of an ask at 100.3, although the two are 0.6% apart and
cannot trade inside the margin.

### MEDIUM - a flat 40 bps margin against a rebate that rises to 69: **partly holds**

Claim: the rebate climbs with print age (20 to 69 bps), but the margin is a
flat 40 bps. An entrant using a ~79 s print faces a 40 bps gate but would
pay 69 bps as a taker on that print.

What holds: above age 50 s the rebate (41-69 bps) exceeds the margin, so
the gate no longer costs more than it saves.

What is overstated: the fair comparison is not a swap on the same 79 s
print, but a swap on a **fresh** print, which costs 10 + 20. The dodge only
pays when the mid moves more than 40 bps within the window, and then it
saves about 20 bps. Rare, but real in a fast market.

Their fix (margin = `rebate-bps-for-age(age)` + 20) is reasonable and cheap:
the deposit path already computes the age and drops it.

### LOW - the 70 bps cap is unreachable: **holds**

Same as noted under review 1: `age <= 79`, so the most charged is 69 bps and
the `>= MAX_STALENESS` branch is dead. Harmless; fix the comment or the
constant.

### Decision

**HIGH: fixed in `contracts/markets-sbtc-stx-jing-v6-3.clar`** (readable copy:
`markets-sbtc-stx-jing-v6-3-formatted.clar`). Not deployed yet.

**MEDIUM (age-aware margin) and LOW (unreachable 70 bps cap): open.** Not in
v6-3.

### The v6-3 change

The rule, in sats per STX with the mid at 400 (0.4% = 1.6 sats):
**refuse a new order if it could fill after the mid moves less than 1.6
sats.** For a new buy: refuse if the buy is at or above 398.4 **and** some
seller asks at or below **min(the buy price, 401.6)**.

| New buy | Resting sell | Fills when the mid... | v6-2 | v6-3 |
|---|---|---|---|---|
| up to 402 | 399 | is 400 already | admitted (bug) | **refused** |
| up to 401.2 | 400.8 | moves +0.8 | admitted (bug) | **refused** (Rushing Orion, #4) |
| up to 398.8 | 399.2 | never | admitted | admitted |
| up to 410 | 408 | moves +8 (2%) | admitted | admitted |

A first version of v6-3 searched the book at the raw mid (400). That closed
row 1 but not row 2; the search now goes up to `min(limit, mid + 0.4%)`.

In contract units (STX per BTC, the inverse of sats per STX), the two gate
functions take the mid and the new order's price and do both steps:

```clarity
(define-private (gate-takes-as-y (mid uint) (limit uint))     ;; new STX deposit
  (and
    (> mid u0)                                  ;; 0 = other side empty: gate off
    (<= (widen-down mid) limit)                 ;; within 0.4% of the mid (or through it)
    (get found (fold live-offer-fold (get-token-x-depositors (var-get current-cycle))
      { price: (if (< limit (widen-up mid)) limit (widen-up mid)),  ;; min(limit, mid + 0.4%)
        found: false }))))
```

`gate-takes-as-x` (new sBTC deposit) is the mirror: `(>= (widen-up mid) limit)`
and a search of the STX side down to `max(limit, mid - 0.4%)`.

All eight gate calls become `(gate-takes-as-y price bid)` /
`(gate-takes-as-x price ask)` - deposit, readmit, set-limit and both
reprice-or-swap paths.

**Pegged resting orders.** The search prices each resting order at the
search price. That is exact for fixed orders and for spread-0 pegs (which
sit at whatever the mid is, down to their own floor/cap). Pegs with a
spread never fill in the batch - only takers walking the book fill them -
so they cannot be the other side of this dodge.

**`would-take-as-x/y` are unchanged, and still needed.** They answer a
different question with one price:

| Function | Question | Prices |
|---|---|---|
| `would-take-as-*` | Do you cross **right now**? | real mid for both halves |
| `gate-takes-as-*` | Could you fill as a maker after a move **under 0.4%**? | shifted mid for your order, `min/max(limit, mid -/+ 0.4%)` for the book |

`would-take-as-*` is used inside `reprice-or-swap-token-y/x` ("this reprice
crosses now: charge the rebate and settle") and by the apps as a read-only
("this limit crosses, use Market").

### Consequence for at-mid rungs

With v6-3, a buy rung and a sell rung both pegged at the mid cannot rest at
the same time: each is inside the other's 0.4% and willing at the mid. The
second to arrive is refused and must use Swap. In v6-2 they could coexist
only because of the blind spot.

### Fork proof

`simulations/verify-v6-3-gate-blind-band.js`, **90/90 green**:
[stxer ea2528d7...](https://stxer.xyz/simulations/mainnet/ea2528d7ac9336dc2e324a9270ec3ae9)
(also covers #5 below).
Fresh copies of the v6-2 and v6-3 sources are deployed on the fork, so the
live book cannot interfere. Both sides:

| Case | v6-2 source | v6-3 |
|---|---|---|
| Entrant 5% through a maker resting 20 bps through the mid | **admitted**; settle clears at the mid; maker gets fee only, no rebate (5,994,000 uSTX / 2,415 sats) | **refused `u1016`** |
| Entrant 30 bps through a maker resting 20 bps OUTSIDE the mid (overlap, #4) | **admitted** | **refused `u1016`** |
| Control: 30 bps away, cannot meet the resting order | - | admitted |
| Control: 100 bps away | - | admitted |

### Before deploy
- `jing-core-v5` `set-verified-contract` for the v6-3 hash, a router bound
  to v6-3, and the three apps repointed.

---

## 3. Light Brio - duplicates of #2

- **F-1 HIGH** (gate and fill disagree on the price): same bug as #2 HIGH,
  with a numeric repro, and it notes the bug breaks the invariant stated in
  `README-markets-v6-pegged.md`. Not new.
- **F-2 MEDIUM** (flat 40 bps margin vs a rebate rising with age): same as
  #2 MEDIUM. Clean numbers: the rebate reaches 40 bps at 50 s, 69 at 79 s.
  Fix proposed: widen by `rebate-bps-for-age(age)`; the deposit path already
  computes the age and drops it.
- **F-3 LOW** (70 bps unreachable): duplicate.
- **N-1** (`widen-up/down` truncate to 0 for a price under 250): true in
  arithmetic, unreachable in practice - real prices are ~2.5e13 in contract
  units.
- **Design note** (back-port the v7 structural fix): v7 was set aside for
  atomicity (the book leg could not be bundled with AMM legs in one
  transaction). Not a finding.

**Verdict:** well evidenced, nothing new over #2, which was first on every
point.

---

## 4. Rushing Orion - the gate admits an overlapping order

### Claim

The gate tests the widened mid, not the entrant's own price, so an order
that crosses the book is admitted and never gets `ERR_MUST_USE_SWAP`. Their
example: mid 100, resting ask 100.2, new bid 100.3 (crossing it by 10 bps)
is admitted.

### What we checked

In sats per STX, mid 400: a seller rests at 400.8 (above the mid, not
trading now) and a new buyer pays up to 401.2. The two overlap. They fill
at the next settlement as soon as the mid moves up 0.8 sats (0.2%), and the
buyer pays 10 bps instead of the 30 it would pay through Swap. The margin
promises a maker fill only after a move of more than 0.4%.

- v6-2 admits it (book searched at 398.4).
- **The first v6-3 draft also admitted it** (book searched at the raw mid,
  400: the 400.8 seller is not willing there).
- v6-3 as pushed refuses it: the book is searched up to
  `min(401.2, 401.6)` = 401.2, which finds the 400.8 seller.

So this report found a case the fix for #2 alone did not cover.

### What the report got wrong

It says the entrant's own test (`(<= price limit)`) also "gets easier" as
the test price drops. It gets stricter: moving the price toward the order
catches more orders near the mid.

### The three conditions of the v6-3 gate, in plain words

For a new sBTC deposit (buying STX at up to B sats per STX, mid 400). The
order is refused only if all three hold:

1. `(> mid u0)` - someone rests on the STX side, at any price. (The contract
   reads the price only when the other side has orders, so 0 means empty.)
2. `(>= (widen-up mid) limit)` - B is at or above 398.4: within 0.4% of the
   mid, or through it, so a move of 0.4% or less can bring the mid to it.
3. the fold - some STX seller asks at or below `min(B, 401.6)`, both the
   buy price and the mid + 0.4%. That seller and B meet after a move of
   0.4% or less.

Condition 2 is not redundant. A seller resting far below the mid (395) and
a buy at 397 overlap, but only a 0.75% drop fills them. Condition 3 alone
would refuse the buy; condition 2 lets it in, correctly.

Condition 3 in two branches: for B up to 401.6 (every buy below the mid
included), search sellers at or below B; above 401.6, search only up to
401.6, because a seller between 401.6 and B needs more than a 0.4% move.

### Decision

**Fixed in v6-3** and proven on the fork (see "Fork proof" under #2: the
`mkt-overlap-*` cases, both sides).

---

## 5. Void Kael - a full list can crash, and a raised minimum hides orders

### Finding 1 (low): `unwrap-panic` on the depositor list

**Claim.** New orders are added with `(unwrap-panic (as-max-len? ... u50))`.
If the list is already full, the transaction aborts with a VM panic instead
of `ERR_QUEUE_FULL`. Only `side-full-*` prevents that, and it relies on "no
more seated rungs than `seats-per-side`", which the market does not check.

**What we checked.**

1. The ladder does enforce the limit: `claim-seat` refuses a seat past
   `max-band-per-side`, and `set-max-band-per-side` cannot go under the seats
   held.
2. `sync-seat` drops stale seats and refreshes the count in one transaction.
3. **Gap:** `sync-seat-count` (public) refreshed the count **without**
   dropping stale seats. Retire rungs, lower the limit, call
   `sync-seat-count`: the market could hold more seated rungs than the limit,
   and on a full side the next unseated order crashed on the add.
4. **Configuration edge:** the deployed `jing-ladder` accepts
   `max-band-per-side = 50` (no ceiling). Then all 50 slots are reserved and
   every unseated maker is refused even on an empty book. The repo ladder had
   a `(<= n 50)` ceiling, which still allowed exactly 50.

Impact: a failed transaction, no funds lost, cleared by anyone calling
`prune-seats`. Rare.

**Fix (v6-3 + `jing-ladder-v1`):**

- The six add sites use `(unwrap! ... ERR_QUEUE_FULL)`: a clean refusal. (The
  remaining `unwrap-panic` calls are in fold/slice helpers that return no
  response, where `unwrap!` is not allowed; they move existing depositors and
  cannot exceed 50.)
- `sync-seat-count` drops stale seats first, like `prune-seats`. Now every
  path that refreshes the count prunes first, so seated <= limit always holds.
- New `jing-ladder-v1`: the seat cap is **strictly under 50**
  (`(< n MAX_SEATS_PER_SIDE)`). v6-3 reads `.jing-ladder-v1`.

### Gap 6 (reported as unproven): a raised minimum hides orders from the gate

**Claim.** The gate's search skips resting orders under the minimum deposit.
If such an order exists and settlement still fills it, the blind spot comes
back.

**What we checked.** It holds:

| Path | Checks each order against the minimum? | A below-minimum order... |
|---|---|---|
| Gate search (`live-*-fold`) | yes, skips it | was invisible to the gate |
| Taker walk | yes, skips it | cannot be walked |
| Batch at the mid (`filter-limit-violating-*`) | no, price only | **still fills at the mid** |

Such an order exists only if the **owner raises the minimum** after it rests:
every deposit path enforces the minimum, and fill leftovers under it are
refunded. Settlement also needs the side total to reach the minimum. The leak
is the 20 bps rebate on those small orders. Very low.

**Why `live-*-fold` skips small orders.** Most likely to match the taker walk,
so "would you take?" counts only orders a taker can walk. That is right for
`would-take-as-*`, wrong for the gate.

**Fix (v6-3).** Two new searches, `gate-bid-fold` / `gate-offer-fold`: copies
of `live-*-fold` without the minimum check. `gate-takes-as-*` use them;
`would-take-as-*` keep `live-*-fold`.

We considered the other way round - make the batch skip small orders too.
Rejected: those orders would never fill (batch and walk both skip them) and
would hold a slot until cancelled, and it changes settlement, the riskiest
code, including the totals and clearing math.

### Fork proof

In `verify-v6-3-gate-blind-band.js` (90/90):

- `jing-ladder-v1`: 50 seats refused `u6011`, 49 accepted.
- v6-3 `sync-seat-count` prunes and reads `u49`.
- `mkt-minraise-v63-y`: a 3000-sat ask rests, the owner raises the minimum to
  5000, an entrant crossing it is still refused `u1016`.

### What the report missed

It marked the gate direction clean at all eight sites and found no dodge
that pays - missing #2 HIGH and #4.

