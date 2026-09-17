# deposit-token-y: every branch, v6 vs v7

One side shown (y = STX bid side); x mirrors it with `x`/`y` swapped and
`stx-transfer?` replaced by the sBTC `transfer`.

## v6: one transaction, price read inside

```
deposit-token-y (amount limit-price spread-bps update t asset-name)
|
|- price = if (other side non-empty) OR (new maker AND this side full)
|            then fresh-classification-price(update)      <- decodes the print, 80 s rule
|            else u0                                       <- no print read at all
|- bid = order-y-price(limit, spread, price)               <- fixed: limit; peg: mid - spread inside the cap, else u0
|
|- assert valid-spread                                     -> u1026
|- assert NOT would-take-as-y(price, bid)                  -> u1016  (price u0 => never takes)
|- assert NOT (new maker AND full AND bid = u0)            -> u1010  (switched-off peg cannot enter a full side)
|- if new maker AND full: park-tenth-token-y(price, bid)   -> may park a resident; u1010 if nobody can be parked
|
|- deposit-token-y-core
|    |- assert not paused                                  -> u1007
|    |- assert existing + parked + amount >= minimum       -> u1001
|    |- assert limit > 0                                   -> u1011
|    |- assert trait is token-y                            -> u1013
|    |- parked > 0: delete parked (it folds into the position)
|    |- if new maker AND still full (after park-tenth): size rule
|    |     assert parked + amount > smallest resident      -> u1010
|    |     park the smallest, transfer in, book, write limits row, log-park + log-deposit
|    |- else: transfer in, book (top-up merges), write limits row, log-deposit
|
|- log-peg-y if spread is some
|- log-readmit-y if parked > 0
'- ok amount
```

State written: cycle deposit, depositor list, limits row, totals, parked map,
and the transfer, all in this one transaction. Every refusal reverts it:
nothing moved.

## v7: submit, then settle

### submit: deposit-token-y (amount limit-price spread-bps ttl t)

```
|- needs-price = (other side non-empty) OR (new maker AND this side full)   <- v6's own test, no print
|- assert trait is token-y                                                  -> u1013
|- assert existing + parked + amount >= minimum                             -> u1001
|- assert amount > 0                                                        -> u1001
|- transfer in (escrow)
|
|- needs-price = false  (v6 would have passed u0 as price)
|    |- assert limit > 0, valid-spread                                      -> u1011 / u1026
|    |- deposit-token-y-core(who = sender, anchor = now, amount, limit, spread, carry = parked, price = u0)
|    |     same core as v6 minus the transfer and the trait check:
|    |     paused, parked folds in, size rule cannot trigger (side not full for a new maker), book, limits row with placed-at = now
|    |- log-peg-y if spread; log-readmit-y if parked
|    '- ok {placed-at: now, expiry: now}      <- RESTS AT ONCE, no order row, as v6
|
'- needs-price = true
     |- open-order
     |    |- assert not paused, limit > 0, valid-spread, 60 <= ttl <= 600   -> u1007 / u1011 / u1026 / u1034
     |    |- map-insert orders {who, side} {kind = deposit, amount, limit, spread, min-out u0, placed-at = now, expiry = now + ttl}
     |    |     already one open                                            -> u1029
     |    '- log-place-order
     '- ok {placed-at, expiry}                 <- nothing on the book changed
```

### settle: settle-order (who side update traits), anyone, later

```
|- order = orders[who, side]                          -> u1030 if none
|- feeds = lazer-feeds(update); at = older of the two feed-update-timestamps
|- assert at > placed-at                              -> u1032   (print newer than the submit's block)
|- assert at <= expiry                                -> u1031
|- assert both traits                                 -> u1013
|- delete the order row                               (second settle -> u1030)
|- price = classification-price-of(feeds)             <- the v6 pricing: each feed < 80 s old vs this block, > 0
|- eff   = order-y-price(limit, spread, price)        <- v6's `bid`
|- takes = would-take-as-y(price, eff)                <- v6's u1016 test
|
|- takes = true                                       (v6: u1016, transaction reverted)
|    |- pay-back(who, amount)                         <- money returned
|    '- outcome u2 REFUSED
|
'- takes = false
     |- book-order
     |    |- assert NOT (new maker AND full AND eff = u0)                   -> u1010   (v6 line)
     |    |- if new maker AND full: park-tenth-token-y(price, eff)          (v6 line)
     |    |- deposit-token-y-core(who, anchor = placed-at, amount, limit, spread, carry = parked, price)
     |    |     v6 core minus transfer/trait: paused, size rule -> u1010, book, limits row with placed-at = the submit's time
     |    |- log-peg-y if spread; log-readmit-y if parked
     |- log-settle-order (outcome u0 RESTED, publish-time = at, mid = price)
     '- outcome u0 RESTED

|- any assert above the delete: settle reverts, order stays open, keeper retries
'- after expiry + 80 s: refund-order -> money back (kind deposit)
```

### what differs, by branch

| v6 branch | v7 |
|---|---|
| no price needed: rests in the same transaction | same, same transaction, no print |
| price needed, does not cross: rests in the same transaction | rests at settle, in a later transaction, at the submit's own stamp |
| price needed, crosses: `u1016`, nothing moved | refused at settle, money escrowed then returned |
| switched-off peg on a full side: `u1010`, nothing moved | `u1010` at settle: settle reverts, order waits, refund after expiry |
| size rule on a full side fails: `u1010`, nothing moved | same, at settle |
| print rule: any print < 80 s old | print newer than the submit's block, and < 80 s old at settle |
| minimum, spread, limit, trait, paused | same checks, at submit (paused again at settle) |
