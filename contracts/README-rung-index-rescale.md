# Rung index rescale (fix for Nested Quinn M-2)

Applies to `jing-buy-stx-core-spread-v1.clar` (and its mirrors).

## The problem

A rung is a pool. Each member owns **shares**. Two global numbers turn shares into money:

| number | contract variable | meaning |
|---|---|---|
| sats index | `unfilled-index` | sats each share holds **right now** |
| STX running total | `proceeds-index` | STX earned per share, **added up since the start** (only goes up) |

`SCALE` = 1e12 is a precision factor. The index starts at 1e12 (1 sat per share).

```
member sats = shares × unfilled-index / SCALE
```

- A **fill** multiplies `unfilled-index` by what is left (sell half: index × 0.5).
- A **deposit** does NOT raise the index. It mints shares: `amount × SCALE / unfilled-index`.

So a healthy pool that is sold down and topped up again and again keeps a full stock of sBTC, while the
index drifts toward 0. After 10 half-fills with refills: 0.5^10 ≈ 0.001, which puts the index
under 1e9.

The old code then closed the epoch (tail roll) or refused deposits (u7013), even though the pool
was full.

## The fix: rescale instead of close

When a fill takes the index under `MINT_FLOOR` (1e9), `sync` changes the unit:

| | before | after |
|---|---|---|
| `unfilled-index` | 0.9e9 | 0.9e9 × 1000 = **0.9e12** |
| `total-shares` | 1.1e9 | 1.1e9 ÷ 1000 = **1.1e6** |
| pool sats | 1.1e9 × 0.9e9 / 1e12 = **990,000** | 1.1e6 × 0.9e12 / 1e12 = **990,000** |
| `scale` | 0 | **1** |

The sats are the same and nothing comes off the book. Only the unit changed: **1 new share = 1000 old shares**.

`scale` counts rescales (0, 1, 2, …, no limit). It tells which share unit a number is written in.

## When does what happen (in `sync`, after a fill)

| new index after the fill | result |
|---|---|
| ≥ 1e9 | store it, nothing else |
| 1e6 … 1e9 | **rescale** |
| < 1e6, or unsold < `SOLD_OUT_DUST` | **tail roll** (close the epoch) |

Before a fill the index is ≥ 1e9. Ending under 1e6 needs a factor < 0.001, which means **over 99.9% of the
pool sold since the last sync**. A deposit always syncs first, so a top-up cannot hide a fill.
A full rung therefore never reaches the tail roll.

An epoch now closes only when:
- it is really sold out (dust),
- one fill sells over 99.9% of the pool, or
- the last member leaves.

## Why shares can't blow up

```
pool sats     = total shares × index / 1e12          (definition)
pool sats × 1e12 = total shares × index              (× 1e12)
total shares  = pool sats × 1e12 / index             (÷ index)
index ≥ 1e9   → 1e12 / index ≤ 1e12 / 1e9 = 1000
total shares  ≤ pool sats × 1000
```

| index | shares for a 1,000,000-sat pool |
|---|---|
| 1e12 (fresh) | 1,000,000 (1 per sat) |
| 1e10 | 100,000,000 (100 per sat) |
| 1e9 (floor) | 1,000,000,000 (1000 per sat, the maximum) |
| 0.9e9 | not reached: rescale first, giving index 0.9e12 and 1,111,111 shares |

## Positions are updated lazily

A rescale cannot loop over every member. So each position stores its shares **and the scale they are written in**:

```
positions[who] = { epoch, scale, shares, paid-index }
```

When the member next acts (deposit / withdraw / claim), `settle-proceeds` carries the row to the current scale:

```
shares now = stored shares / 1000^(scale now − stored scale)
```

Example: Alice `{ scale: 0, shares: 2,000 }`, pool at scale 1 → 2,000 / 1000 = **2 shares**.

## Why sats are easy but STX needs a marker

**Sats** use no history. The member's row stores no old value of the index:

```
sats = shares (converted to now) × unfilled-index (now)
```

A rescale converts the one global index (× 1000). Shares are converted on read (÷ 1000). Both are in
the new unit, so the result is right.

**STX** is a difference between two readings of the running total:

```
STX owed = shares × (proceeds-index now − paid-index)
```

`paid-index` is an **old reading stored in every member's row**. Converting `proceeds-index` would mean
converting every member's `paid-index`, which cannot be done in one tx. So the running total is **left alone**
and the contract saves a marker instead:

```
scale-start[k] = proceeds-index at the moment scale k began
```

The owed STX is then split at the marker.

## Worked example (SCALE left out: the running total is plain "STX per share")

**How the running total moves** (`sync`: `proceeds-index += STX received / total shares`):

| | total shares | STX received | added to proceeds-index | proceeds-index |
|---|---|---|---|---|
| start | 10,000 | — | — | **1** |
| fill | 10,000 | 30,000 | 30,000 / 10,000 = **+3** | **4** |
| rescale | 10,000 ÷ 1000 = **10** | — | marker `scale-start[1]` = 4 | 4 |
| fill | 10 | 40,000 | 40,000 / 10 = **+4,000** | **4,004** |

After the rescale the same STX is divided by 1000× fewer shares, so the running total jumps 1000× faster.

**Alice's values:**

| label | contract variable | value |
|---|---|---|
| Alice's old shares | `(get shares pos)` | 2,000 |
| Alice's stored scale | `(get scale pos)` | 0 |
| Alice's last reading | `(get paid-index pos)` | 1 |
| marker X | `scale-start[1]` | 4 |
| running total now | `proceeds-index` | 4,004 |
| pool scale now | `scale` | 1 |
| Alice's new shares | old shares ÷ `RESCALE` | 2 |

Her row says scale 0 and the pool is at scale 1. So her `paid-index` (1) was recorded before marker 1, and
there is exactly one marker to split at. (This always holds: whenever a row is written, the contract stores the
current scale and the current `proceeds-index` together.)

**Part 1: before the rescale**

```
old shares × (marker X − paid-index)
2,000      × (4        − 1         )  = 2,000 × 3     =  6,000
```

**Part 2: after the rescale**

```
new shares × (proceeds-index now − marker X)
2          × (4,004              − 4       )  = 2 × 4,000     =  8,000
```

**Total**

```
6,000 + 8,000 = 14,000 STX
```

**Check:** Alice owns 2,000 / 10,000 = 20% before and 2 / 10 = 20% after.
20% × 30,000 = 6,000 ✅  20% × 40,000 = 8,000 ✅

**Without the split:**

| wrong way | calculation | result |
|---|---|---|
| old shares for the whole range | 2,000 × (4,004 − 1) | 8,006,000 (far too much) |
| new shares for the whole range | 2 × (4,004 − 1) | 8,006 (loses the 6,000) |

## More than one rescale

`earned` walks segments from the position's scale to the current one:

| step | scale | segment start | segment end | shares used |
|---|---|---|---|---|
| 0 | stored scale | `paid-index` | `scale-start[s+1]` | shares |
| 1 | s+1 | `scale-start[s+1]` | `scale-start[s+2]` | shares ÷ 1000 |
| 2 | s+2 | `scale-start[s+2]` | `scale-start[s+3]` or now | shares ÷ 1,000,000 |
| 3 | s+3 | `scale-start[s+3]` | now | shares ÷ 1e9 |

`MAX_SCALE_STEPS` = 3: a position more than 3 rescales behind has shrunk by over 1e9×
(1 BTC becomes < 0.1 sat), so its shares count as 0. The STX from its early segments is still paid.

## Rounding: nobody loses more than 1 sat

`shares ÷ 1000` rounds down and can drop up to 999 old shares. At a rescale the index is under 1e9,
so those shares are worth < 999 × 1e9 / 1e12, which is under 1 sat. That is why the floor is 1e9.

Rounding can also leave a few shares in `total-shares` that nobody owns. That is why the epoch now closes on
`members = 0` (a new counter) and not on `total-shares = 0`.
