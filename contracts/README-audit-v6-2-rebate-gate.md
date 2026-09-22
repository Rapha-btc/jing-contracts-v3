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
| 2 | Patient Reed | Margin gate bypassable (B+D+E) | HIGH holds; MEDIUM partly; LOW holds | _open: needs a redeploy_ |
| 3 | Light Brio | | _pending_ | |
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

**Fix.** Split the price: widened price for the entrant's own test, raw mid
for the book scan, e.g. `(would-take-as-y-gated (widen-down price) price bid)`.
Needs a new market version.

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

_Open._ The HIGH needs a new market version (v6-3). To decide: ship the
split-price gate (and optionally the age-aware margin) now, or wait and
batch it with other findings from this bounty.
