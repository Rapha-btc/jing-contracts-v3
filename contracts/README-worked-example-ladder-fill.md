# Worked example: one swap against the ladder

One real swap on `markets-sbtc-stx-jing-v6-2`, read line by line. It shows
the batch at the mid, the walk down the ladder, the 10 bps fee, the 20 bps
rebate, and the two small refunds at the end.

Source: stxer mainnet simulation
[e7f2a812...](https://stxer.xyz/simulations/mainnet/e7f2a81202bf7a2ae063abba9629195b?page=10),
**step 183** (`swap`, tx `851887183b67...`). An earlier step on the same
simulation (page 4) deposits the ladder that this swap fills: 200,000 sats
split into 10 rungs of 20,000.

All numbers below come from that step's events. STX is shown to 6 decimals
(1 STX = 1,000,000 micro-STX). sBTC is shown in sats.

---

## The short version

- A trader sells about **273.4 STX** and gets **108,434 sats**.
- The market price (the Pyth mid) is **398.64 sats per STX**.
- The trader gets **396.56 sats per STX** overall, about **0.52% under the
  mid**, fees and rebates included.
- Six maker orders fill: one at the mid, five below it.
- Each maker ends up paying **less than the mid**, and the fee and rebate
  are part of the reason.

---

## Who is who

| Role | Address | What it does |
|---|---|---|
| Taker | `SP137S0K...8Y75N` | Sells STX now, takes what the book offers |
| Makers | `jing-buy-stx-spread-0` ... `-90` | Ladder rungs. Each one rests 20,000 sats to buy STX |
| Treasury | `SPV9K21...DC22` | Receives the 10 bps fee |
| Market | `markets-sbtc-stx-jing-v6-2` | Holds the funds, matches, pays out |

Each rung is pegged to the mid. `spread-10` bids 0.10% under the mid,
`spread-20` bids 0.20% under, and so on. `spread-0` bids at the mid.

---

## The two numbers to know

| Name | Rate | Who pays | Who gets it | Constant |
|---|---|---|---|---|
| Fee | **10 bps** (0.1%) | Both sides, on what they receive | Treasury | `FEE_BPS u10` |
| Rebate | **20 bps** (0.2%) | The taker | The maker it fills against | `TAKER_REBATE_BPS u20` |

The rebate is 20 bps when the price update is 30 s old or less. After that it
goes up 1 bp per second, to 69 bps at 79 s. An update 80 s or older is
refused (`MAX_STALENESS u80`). The update in this step was fresh, so the rate
is 20 bps.

So on each fill:

- the **taker** pays about 0.3% (10 fee + 20 rebate);
- the **maker** gains about 0.1% (gets 20 rebate, pays 10 fee).

---

## Step by step

### 1. The taker pays in (events 0-1)

| Event | Amount | What it is |
|---|---|---|
| 0 | 0.546870 STX | **Rebate reserve**: 20 bps of the full 273.435006 STX input |
| 1 | 272.888136 STX | **The STX to sell** |

The contract takes the rebate first, before it knows how much will fill.
What is not used comes back at the end (step 5).

### 2. Orders that do not sit at the mid wait (events 3-17)

The `limit-roll-x` / `limit-roll-y` lines are not trades. Every swap first
settles a batch at the mid. Only orders willing to trade **at exactly the
mid** join that batch. The rungs with a spread sit away from the mid, so the
batch skips them. They stay in the book, and each log line records the
price they sit at. Nothing moves in these events.

### 3. The batch at the mid (events 18-24)

Only `spread-0` sits at the mid. It trades 20,000 sats against 50.170170 STX.

| Event | Amount | To | What it is |
|---|---|---|---|
| 18 | 0.050170 STX | Treasury | Fee, 10 bps of the 50.170170 STX (paid by the maker) |
| 19 | 20 sats | Treasury | Fee, 10 bps of the 20,000 sats (paid by the taker) |
| 21 | 19,980 sats | Taker | 20,000 sats minus the 20-sat fee |
| 23 | 50.220541 STX | `spread-0` | 50.170170 - 0.050170 fee + 0.100541 rebate |

Events 20, 22, 24 and 25 are logs: the settlement, the two payouts and the
dust sweep (all zero here).

### 4. The walk down the ladder (events 26-50)

The batch filled 50.17 STX. The other 222.72 STX walks the book, best price
first. Each rung fills at its own price, which is a little lower each time.
Every fill has the same four parts:

1. STX to the rung (what it bought, minus fee, plus rebate)
2. A small STX fee to the treasury
3. sBTC to the taker (what they bought, minus fee)
4. A small sBTC fee to the treasury

| Rung | Price (sats/STX) | STX traded | Maker fee | Rebate | **STX to rung** | Taker fee | **Sats to taker** |
|---|---|---|---|---|---|---|---|
| spread-0 (batch) | 398.64 | 50.170170 | 0.050170 | 0.100541 | **50.220541** | 20 | **19,980** |
| spread-10 | 398.25 | 50.220340 | 0.050220 | 0.100440 | **50.270560** | 20 | **19,980** |
| spread-20 | 397.85 | 50.270510 | 0.050270 | 0.100541 | **50.320781** | 20 | **19,980** |
| spread-30 | 397.45 | 50.320681 | 0.050320 | 0.100641 | **50.371002** | 20 | **19,980** |
| spread-40 | 397.06 | 50.370851 | 0.050370 | 0.100741 | **50.421222** | 20 | **19,980** |
| spread-50 (part) | 396.66 | 21.534818 | 0.021534 | 0.043069 | **21.556353** | 8 | **8,534** |
| **Total** | | **272.887370** | **0.272884** | **0.545973** | | **108** | **108,434** |

The rebate is **inside** the STX sent to each rung. It is not a separate
transfer. The contract pays it in one call:
`(stx-transfer? (+ (- y-traded y-fee) reb-y) current-contract maker)`.

The small transfers you see between the big ones (0.05022, 0.05027, ... STX
and 20 sats each) are the **10 bps fees** going to the treasury, one pair per
fill.

Rungs 60-90 do not fill. The walk stops once it runs out of STX to sell.

### 5. Two small refunds (events 51-52)

| Event | Amount | Output field | What it is |
|---|---|---|---|
| 51 | 0.000897 STX | `rebate-refunded` | The part of the rebate reserve not paid to makers |
| 52 | 0.000766 STX | `token-y-rolled` | STX that did not fill. It is below the 1 STX minimum, so it cannot rest and goes back |

These are two different refunds, not one refund sent twice. Both happen at
the end of `cross-remainder-as-y`.

**Why part of the reserve is unused.** The reserve is 20 bps of the full
input, 273.435006 STX. But the input includes the reserve itself (0.546870 STX
that never trades) and the 766 micro-STX that never fills. Makers are paid
on what fills: 0.545973 STX. 0.546870 - 0.545973 = 0.000897 STX, refunded.

If the leftover STX had been 1 STX or more, the whole swap would revert
(`ERR_PARTIAL_FILL`). A swap fills in full or not at all.

---

## Where every unit went

**Taker**

| | STX | sats |
|---|---|---|
| Sent | 273.435006 | |
| Refunded | 0.001663 | |
| Received | | 108,434 |
| **Net price** | **396.56 sats per STX** (0.52% under the mid) | |

**Treasury** (the 10 bps fee, both sides)

| | STX | sats |
|---|---|---|
| From makers (STX side) | 0.272884 | |
| From the taker (sBTC side) | | 108 |

**Makers** (what each rung really paid per STX, rebate and fee included)

| Rung | Sats paid | STX received | Paid per STX | vs mid |
|---|---|---|---|---|
| spread-0 | 20,000 | 50.220541 | 398.24 | 0.10% better |
| spread-10 | 20,000 | 50.270560 | 397.85 | 0.20% better |
| spread-20 | 20,000 | 50.320781 | 397.45 | 0.30% better |
| spread-30 | 20,000 | 50.371002 | 397.05 | 0.40% better |
| spread-40 | 20,000 | 50.421222 | 396.66 | 0.50% better |
| spread-50 | 8,542 | 21.556353 | 396.26 | 0.60% better |

Each maker gets its spread plus 0.1% (the 20 bps rebate minus the 10 bps
fee). That is why a ladder rung at the mid still earns: it buys 0.1% under
the mid on every fill.

---

## Code references

All in `markets-sbtc-stx-jing-v6.clar` (commented source; v6-2 has the same
logic, stripped of comments):

- Fee and rebate rates: `FEE_BPS`, `TAKER_REBATE_BPS`, `TAKER_REBATE_MAX_BPS`,
  `rebate-bps-for-age` (top of file)
- Batch at the mid, rebate share `ride-y`: `execute-settlement`
- One fill in the walk, fee and rebate per fill: the book-walk step
  (`stx-transfer? (+ (- y-traded y-fee) reb-y) ...`)
- Final refunds and fill-or-kill: `cross-remainder-as-y`

See also `README-markets-v6-pegged.md` (pegged orders and limit rolls),
`README-jing-ladder-dispatch.md` (how the ladder deposit is split into rungs)
and `README-maker-economics.md` (why makers rest orders).
