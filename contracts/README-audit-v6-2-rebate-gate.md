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
| 4 | Rushing Orion | | _pending_ | |
| 5 | Void Kael | | _pending_ | |
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
| the raw mid (`price`) - **shipped in v6-3** | the dodge above: cross now, settle at the real mid | an order resting just across a nearby ask, filled when the mid moves < 0.4% |
| `min(bid, widen-up price)` (stricter, not shipped) | both: anything that crosses, or would cross within the 0.4% margin | nothing the margin is meant to cover |

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
`markets-sbtc-stx-jing-v6-3-formatted.clar`). The book search now uses the
real mid. We chose the minimum fix (search at the mid) over the strict one
(search at mid + 0.4%): it closes the exploit, because settlement clears at
the mid. See "The v6-3 change" below. Not deployed yet.

**MEDIUM (age-aware margin) and LOW (unreachable 70 bps cap): open.** Not in
v6-3.

### The v6-3 change

v6-3 is v6-2 with one change. `clarinet check` passes (run on a minimal
manifest, since the repo manifest still lists `markets-sbtc-stx-jing-v7`,
which moved to `contracts/aborted/`).

**1. Two new private functions, one per side:**

```clarity
(define-private (gate-takes-as-y (entrant-price uint) (book-price uint) (limit uint))
  (and
    (> entrant-price u0)          ;; 0 = other side empty, no oracle read: gate off
    (<= entrant-price limit)      ;; half 1: is the new order within 0.4% of the mid?
    (get found                    ;; half 2: is any resting x order willing at the REAL mid?
      (fold live-offer-fold (get-token-x-depositors (var-get current-cycle))
        { price: book-price, found: false }))))
```

`gate-takes-as-x` is the mirror: `>=` instead of `<=` (an x order wants at
least its limit), and it searches the y side with `live-bid-fold`.

**2. All eight gate calls pass the real mid for the search:**

```clarity
;; v6-2: (would-take-as-y (widen-down price) bid)        search at mid moved 0.4%
;; v6-3: (gate-takes-as-y (widen-down price) price bid)  search at the real mid
```

Deposit, readmit, set-limit and both reprice-or-swap paths, on both sides.

**3. `would-take-as-x/y` are unchanged, and still needed.** They answer a
different question with one price:

| Function | Question | Prices |
|---|---|---|
| `would-take-as-*` | Do you cross **right now**? | real mid for both halves |
| `gate-takes-as-*` | Are you **too close** to crossing to rest as a maker? | shifted mid for your order, real mid for the book |

`would-take-as-*` is used inside `reprice-or-swap-token-y/x` ("this reprice
crosses now: charge the rebate and settle") and by the apps as a read-only
("this limit crosses, use Market").

### Example in sats per STX (the x side)

Contract prices are STX per BTC, the inverse of sats per STX, so every
direction flips in code. In sats per STX, with the mid at **396.47**:

- Depositing sBTC (x side) = **buying STX**. Limit: pay **at most** N sats per
  STX.
- Depositing STX (y side) = **selling STX**. Limit: receive **at least** N
  sats per STX.
- The gate moves the mid 0.4% toward the new buyer, i.e. cheaper STX:
  396.47 / 1.004 = **394.89**. In contract units that is `widen-up`.

A resting STX seller asks **396.00**. A new buyer bids up to **397.00**. At
the real mid (396.47) both accept, so they trade at once: the buyer is a
taker.

| | Half 1: buyer accepts 394.89? | Half 2: seller accepts ... | Result |
|---|---|---|---|
| v6-2 | yes (394.89 <= 397) | at 394.89? no (wants >= 396) | **admitted** - the bug |
| v6-3 | yes | at 396.47 (real mid)? yes | **refused**, `ERR_MUST_USE_SWAP` |

The v6-2 blind spot on this side: STX sellers asking between 394.89 and
396.47, for example a sell rung pegged at the mid. On the y side it is the
mirror.

### Consequence for at-mid rungs

With v6-3, a buy rung and a sell rung both pegged at the mid cannot rest at
the same time: each is inside the other's 0.4% and willing at the mid. The
second to arrive is refused and must use Swap. In v6-2 they could coexist
only because of the blind spot.

### Fork proof

`simulations/verify-v6-3-gate-blind-band.js`, **41/41 green**:
[stxer d3eca001...](https://stxer.xyz/simulations/mainnet/d3eca001827169de81c37facd4a5dcec).
Fresh copies of the v6-2 and v6-3 sources are deployed on the fork, so the
live book cannot interfere. Both sides:

| Step | v6-2 source | v6-3 |
|---|---|---|
| Maker rests 20 bps through the mid (inside the blind band) | admitted | admitted |
| Entrant 5% through the mid, y side | **admitted**; settle clears at the mid; maker gets 5,994,000 uSTX = fee only, no rebate | **refused `u1016`** |
| Entrant 5% through the mid, x side | **admitted**; settle clears at the mid; maker gets 2,388 sats = fee only, no rebate | **refused `u1016`** |
| Control: 30 bps from crossing | - | refused |
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

