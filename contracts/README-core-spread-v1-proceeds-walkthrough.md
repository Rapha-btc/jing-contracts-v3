# Core-spread v1: proceeds precision walkthrough

A plain-language review of `d4ac0c4` ("core-spread v1 proceeds precision,
exact epoch payouts, no stuck units") in `jing-buy-stx-core-spread-v1.clar`.
The sell rung mirrors it. Format-only hunks in that commit are skipped.

## How a rung keeps its books

Members pool their sBTC in one rung and each holds **shares**. When the
market fills part of the pool, STX arrives. Nobody is paid at that moment;
one global counter goes up:

```
proceeds-index += gained-STX × scale / total-shares
```

A member's STX is `their shares × (index now − index at their last payout)`,
the standard reward-per-share pattern.

`stx-accounted` stops the same STX being counted twice. STX is fungible, so
it tracks a number, not coins: each `sync` computes
`gained = stx-get-balance(contract) − stx-accounted`, folds that into the
index, then sets `stx-accounted` to the current balance. Payouts lower it by
what they send.

## The bug (small-proceeds report, itzroberl)

The index division rounds down. With a very large `total-shares`, the
increment rounds to **0**: the index does not move, so nobody is credited,
but `stx-accounted` still advances, so the STX counts as handled. It stays in
the contract, owned by no one.

Example: 10¹⁵ total shares and a fill bringing 999 µSTX:
`999 × 10¹² / 10¹⁵ = 0.999`, which rounds to 0, so all 999 µSTX are stuck.
Short of 0, every sync still dropped a remainder, and those added up.

## The fix in four ideas

1. **More precision.** Proceeds get `PROCEEDS_SCALE = 10¹⁸` and total shares
   are capped at 10¹⁸ (`ERR_TOO_MANY_SHARES`, u7016), so every received µSTX
   moves the index by at least 1.
2. **Keep the remainder.** The division remainder goes into
   `proceeds-carry` and is added into the next `sync`.
3. **Exact per-epoch balance.** `current-proceeds` tracks exactly what the
   epoch received minus what it paid out; the epoch's final member gets the
   rounding that is left.
4. **Two smaller fixes:**
   - **Rescale over-payment.** A rescale divides share counts by `RESCALE`
     (1000), rounding down: `total-shares = floor(total / 1000)`, and each
     member's sBTC side uses `floor(shares / 1000)`. The old STX formula paid
     on the exact fraction instead. With Alice and Bob at 1999 shares each,
     the total becomes 3; a 3 µSTX fill is 1 per share; the old code owed
     1.999 + 1.999 = 3.998 from a pool that received 3. The new code pays
     `floor(1.999) = 1` each; the unowned unit stays in `current-proceeds`
     for the final member. The test that found it showed 9 µSTX
     over-promised.
   - **`count-reserve-claim` can't abort.** The old code, on the last claim
     of a closed epoch, moved a leftover out of `reserved-sats` with an
     unchecked subtraction that could underflow and block the claim. Now the
     last member receives the exact remainder through `epoch-payout`, that
     step is gone, and every other subtraction is clamped at 0.

## Chunk 1: constants and state

- `ERR_TOO_MANY_SHARES (err u7016)`, used by the share cap in `deposit`.
- `PROCEEDS_SCALE` is 10¹⁸ for the proceeds index only. Shares and the
  unfilled index keep `SCALE` (10¹²), so the sBTC side is unchanged.
- `epoch-reserve` gains `proceeds`: a closed epoch now remembers its exact
  unpaid STX as well as its unpaid sBTC (`reserve`) and unclaimed members
  (`left`).
- `current-proceeds` is the exact STX the open epoch has received minus
  what it has paid out. It's the ground truth the index approximates.
- `proceeds-carry` is the index division's remainder (see below).

## `proceeds-carry` in detail

In `sync`:

```clarity
(scaled (+ (* gained PROCEEDS_SCALE) (var-get proceeds-carry)))  ;; new STX × 10¹⁸ + last remainder
(new-proceeds (+ (var-get proceeds-index) (/ scaled shares)))   ;; index grows by the quotient
(var-set proceeds-carry (mod scaled shares))                     ;; the new remainder waits for the next sync
```

- **Units:** the carry is in µSTX × 10¹⁸, the same units as
  `gained × PROCEEDS_SCALE` (the numerator before dividing by shares).
  `scaled / shares` is the index increment, in µSTX × 10¹⁸ per share.
  `carry / 10¹⁸` is the real µSTX it stands for, always under 1 µSTX in
  total because `carry < shares ≤ 10¹⁸`.
- **Loop:** `new-proceeds` takes only the whole quotient. The remainder
  becomes the carry, the next `sync` adds it back into `scaled`, and that
  sync's `mod` is the new carry.
- **Reset:** when the share count changes (a deposit or a rescale), the
  carry is set to 0 instead of being carried over. Its µSTX isn't lost; it is
  still counted in `current-proceeds` and goes to the epoch's final member.

## Chunk 2: `sync`

```clarity
-  (new-proceeds (if (> gained u0)
-    (+ (var-get proceeds-index) (/ (* gained SCALE) shares))
-    (var-get proceeds-index)))
+  (scaled (+ (* gained PROCEEDS_SCALE) (var-get proceeds-carry)))
+  (new-proceeds (+ (var-get proceeds-index) (/ scaled shares)))
   ...
+  (var-set current-proceeds (+ (var-get current-proceeds) gained))
+  (var-set proceeds-carry (mod scaled shares))
```

1. **Precision:** `SCALE` becomes `PROCEEDS_SCALE`, and the previous carry
   is added before dividing.
2. **No `if gained > 0`:** with `gained = 0` and no carry, the increment is
   simply 0.
3. **`current-proceeds += gained`:** every µSTX that arrives is recorded
   exactly, whatever the index rounding does.
4. **The new remainder is saved** as the carry.

**Rescale branch:** `proceeds-carry` is set to 0 just before
`total-shares` is divided by `RESCALE`. The carry is a remainder "out of
`shares`"; with 1000× fewer shares it would mean something else, so it is
dropped rather than reinterpreted. Its µSTX (under 1 in total) is already in
`current-proceeds` and still reaches the final member.

The tail-roll branch is unchanged here; its accounting is in `roll-tail`.

## Chunk 3: `get-position` and `epoch-payout`

Before, `get-position` showed the pure index math (`sbtc = shares ×
unfilled-index / SCALE`, `stx = earned(...)`). It now passes both through
`epoch-payout`, which swaps in the exact remainder for the last member:

| Situation | sBTC shown | STX shown |
|---|---|---|
| Open epoch, several members | index math (unchanged) | index math (unchanged) |
| Open epoch, **only member** | `market-size + held-sats` | `current-proceeds` |
| Closed epoch, **last to claim** (`left = 1`) | the epoch's whole `reserve` | the epoch's whole `proceeds` |
| Closed epoch, others still to claim | index math (unchanged) | index math (unchanged) |

**Why:** the final member of an epoch now receives every leftover rounding
unit, so `get-position` has to show what `withdraw` / `claim` will actually
pay.

## Chunk 4: `earned`

A member's shares are stored at their joining scale; the epoch may have
rescaled up to 3 times since, so `earned` sums one segment per scale step:
`owed = Σ (my shares at that step) × (index growth during that step)`.

```clarity
- owed += shares × delta / (SCALE × 1000^step)
+ effective-shares = carried(shares, 0, step)       ;; floor(shares / 1000^step)
+ owed += effective-shares × delta / PROCEEDS_SCALE
```

1. **Units:** `delta` is µSTX × 10¹⁸ per share (from `sync`), `shares ×
   delta` is µSTX × 10¹⁸, and dividing by `PROCEEDS_SCALE` gives µSTX. `owed`
   is STX on this rung (sats on the sell mirror).
2. **Whole shares per step (fix 4a):** `floor(shares / 1000^step)` instead
   of the exact fraction, the same count `carried`, `get-position` and
   `withdraw` use for sBTC. `carried` only uses `to − from`, so
   `carried(shares, u0, step)` equals `carried(shares, from, from + step)`.

## Chunk 5: `deposit`

1. **Share cap:** `total-shares + shares <= PROCEEDS_SCALE` or
   `ERR_TOO_MANY_SHARES` (u7016). This makes `gained × 10¹⁸ / shares >= 1`
   for any `gained >= 1`, so no STX can round to zero. `shares = sats × SCALE /
   unfilled-index` with the index between 10⁹ and 10¹², so the cap is 10¹⁵ to
   10¹⁸ sats, above all BTC in existence (~2.1 × 10¹⁵ sats): a mathematical
   guarantee, not a practical limit. A refusal reverts the whole transaction,
   including the transfer and settlement before it.
2. **Carry reset** just before `total-shares` grows: minting new shares
   changes the denominator, so the old remainder is not spread over it.
3. **`orphan` comment reworded, code unchanged:** an empty pool's leftover
   sBTC can only be unsolicited input now, since funded epochs leave no
   rounding dust.
