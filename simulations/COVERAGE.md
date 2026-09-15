# Executed coverage from the stxer results (Full rerun on b8b6f3e)

From `simulations/sim-coverage.mjs` on 2026-09-15: 30 simulations, 1926 transactions, 277 error returns. "Produced" means a step returned that code or a print carried that event, in at least one of the listed sims.


## markets-sbtc-stx-jing-v6

| code | name | produced in |
|---|---|---|
| `u1001` | ERR_DEPOSIT_TOO_SMALL | 0aea8687, 764fdf7a |
| `u1002` | ERR_ALREADY_SETTLED | 0aea8687, 4e1afb02 |
| `u1003` | ERR_STALE_PRICE | **none** |
| `u1004` | ERR_PRICE_UNCERTAIN | cfa2c166 |
| `u1005` | ERR_NOTHING_TO_WITHDRAW | 39900fca, 9f66c482, e604363a, 764fdf7a, a9e9e858, 4e1afb02 |
| `u1006` | ERR_ZERO_PRICE | **none** |
| `u1007` | ERR_PAUSED | 0aea8687 |
| `u1008` | ERR_NOT_AUTHORIZED | 39900fca, 0aea8687 |
| `u1009` | ERR_NOTHING_TO_SETTLE | 39900fca, 0aea8687, cfa2c166, 69d71b4f, e604363a, a199df4c |
| `u1010` | ERR_QUEUE_FULL | 39900fca, cf9830c6, 8d41a193 |
| `u1011` | ERR_LIMIT_REQUIRED | 9f66c482, 4efa9f39 |
| `u1012` | ERR_ALREADY_INITIALIZED | 0aea8687 |
| `u1013` | ERR_WRONG_TRAIT | 0aea8687, 764fdf7a |
| `u1014` | ERR_EXPO_MISMATCH | **none** |
| `u1015` | ERR_NOTHING_FILLED | **none** |
| `u1016` | ERR_MUST_USE_SWAP | 9f66c482, e604363a, 4efa9f39, bb8891d0, cf9830c6 |
| `u1017` | ERR_PARTIAL_FILL | 0aea8687, 9f66c482, 69d71b4f, e604363a, a199df4c, 1a404bbf |
| `u1018` | ERR_HAS_RESTING_POSITION | 39900fca, 0aea8687 |
| `u1019` | ERR_ZERO_MIN_DEPOSIT | 69d71b4f |
| `u1020` | ERR_TAKER_TOO_SMALL | 39900fca, 3e2c86f8, 79b5a980, 4e1afb02 |
| `u1022` | ERR_NOTHING_TO_READMIT | 39900fca, e604363a, cf9830c6 |
| `u1023` | ERR_FEED_MISSING | cfa2c166 |
| `u1024` | ERR_USE_CANCEL | 764fdf7a |
| `u1025` | ERR_FEED_TIMESTAMP_MISSING | cfa2c166 |
| `u1026` | ERR_BAD_SPREAD | 4efa9f39, bb8891d0, 1f7701ce |
| `u1027` | ERR_CYCLE_OPEN | a199df4c |
| `u1028` | ERR_NOT_A_SEAT | 8d41a193, a8b13fcd |

## jing-core-v5

| code | name | produced in |
|---|---|---|
| `u5001` | ERR_NOT_AUTHORIZED | 3e2c86f8, a8b13fcd |
| `u5002` | ERR_INVALID_CONTRACT_HASH | a8b13fcd |
| `u5003` | ERR_ALREADY_REGISTERED | a8b13fcd |
| `u5005` | ERR_NOT_VERIFIED | a8b13fcd |
| `u5006` | ERR_HASH_MISMATCH | a8b13fcd |
| `u5008` | ERR_TIMELOCK_NOT_ELAPSED | a8b13fcd |
| `u5016` | ERR_PAUSED | a8b13fcd |
| `u5017` | ERR_NOT_PAUSED | a8b13fcd |
| `u5018` | ERR_NO_PENDING_OWNER | a8b13fcd |

| event | produced in |
|---|---|
| `deposit-x` | 39900fca, 0aea8687, cfa2c166, 75b55349, 9f66c482, 69d71b4f, e604363a, 764fdf7a, a199df4c, 3e2c86f8, 4efa9f39, bb8891d0, 1f7701ce, dfade3ba, cf9830c6, afc6b102, 1a404bbf, 79b5a980, 6cff0924, 7833fe4e, 96ec02af, da6fd0cf, 8d41a193, a8b13fcd, 0124c42a, 672d3cdc, a9e9e858, 4e1afb02 |
| `deposit-y` | 39900fca, 0aea8687, cfa2c166, 75b55349, 9f66c482, 69d71b4f, e604363a, 764fdf7a, a199df4c, 3e2c86f8, 4efa9f39, bb8891d0, 1f7701ce, cf9830c6, afc6b102, 1a404bbf, 79b5a980, 6cff0924, 7833fe4e, 96ec02af, da6fd0cf, 8d41a193, a8b13fcd, 6343bc2a, 8ff938cb, a9e9e858, 4e1afb02 |
| `refund-x` | 39900fca, 0aea8687, 69d71b4f, 764fdf7a, a199df4c, 4efa9f39, bb8891d0, 1f7701ce, cf9830c6, 96ec02af, a8b13fcd, 0124c42a, 672d3cdc, a9e9e858, 4e1afb02 |
| `refund-y` | 39900fca, 0aea8687, cfa2c166, 69d71b4f, 764fdf7a, a199df4c, 3e2c86f8, 4efa9f39, bb8891d0, 1f7701ce, cf9830c6, 1a404bbf, 6cff0924, 7833fe4e, 96ec02af, a8b13fcd, 6343bc2a, 8ff938cb, a9e9e858, 4e1afb02 |
| `withdraw-x` | 0aea8687, 764fdf7a, a199df4c, 1f7701ce, dfade3ba, a8b13fcd, 0124c42a, 672d3cdc |
| `withdraw-y` | 764fdf7a, cf9830c6, a8b13fcd, 6343bc2a, 8ff938cb |
| `set-limit-x` | 0aea8687, 9f66c482, 69d71b4f, e604363a, 4efa9f39, bb8891d0, 1f7701ce, 79b5a980, 8d41a193, a9e9e858 |
| `set-limit-y` | 39900fca, 69d71b4f, a199df4c, bb8891d0, cf9830c6, 8d41a193, a9e9e858 |
| `peg-x` | 39900fca, a199df4c, 3e2c86f8, 4efa9f39, bb8891d0, 1f7701ce, dfade3ba, afc6b102, 1a404bbf, 79b5a980, 6cff0924, 7833fe4e, da6fd0cf, 8d41a193, a8b13fcd, 672d3cdc |
| `peg-y` | 39900fca, a199df4c, 3e2c86f8, 4efa9f39, bb8891d0, cf9830c6, afc6b102, 1a404bbf, 6cff0924, 7833fe4e, 96ec02af, da6fd0cf, 8d41a193, a8b13fcd, 8ff938cb |
| `park-x` | 39900fca, 764fdf7a, bb8891d0, dfade3ba, 8d41a193, a9e9e858 |
| `readmit-x` | 764fdf7a, bb8891d0 |
| `park-y` | 39900fca, 764fdf7a, cf9830c6 |
| `readmit-y` | 39900fca, 764fdf7a, cf9830c6 |
| `small-share-roll-x` | 79b5a980 |
| `small-share-roll-y` | a199df4c |
| `limit-roll-x` | 39900fca, 75b55349, 9f66c482, 69d71b4f, e604363a, a199df4c, 3e2c86f8, 4efa9f39, 1f7701ce, afc6b102, 1a404bbf, 6cff0924, 7833fe4e, 96ec02af, a9e9e858, 4e1afb02 |
| `limit-roll-y` | 39900fca, 69d71b4f, a199df4c, 4efa9f39, afc6b102, 1a404bbf, 6cff0924, 7833fe4e, 96ec02af, a9e9e858, 4e1afb02 |
| `match` | 39900fca, 75b55349, 69d71b4f, e604363a, a199df4c, 3e2c86f8, 4efa9f39, 1f7701ce, afc6b102, 1a404bbf, 6cff0924, 7833fe4e, 96ec02af, a9e9e858, 4e1afb02 |
| `settlement` | 39900fca, cfa2c166, 75b55349, 9f66c482, 69d71b4f, e604363a, a199df4c, 3e2c86f8, 4efa9f39, bb8891d0, 1f7701ce, afc6b102, 1a404bbf, 79b5a980, 6cff0924, 7833fe4e, 96ec02af, a9e9e858, 4e1afb02 |
| `distribute-x-depositor` | 39900fca, cfa2c166, 75b55349, 9f66c482, 69d71b4f, e604363a, a199df4c, 4efa9f39, bb8891d0, 1f7701ce, afc6b102, 1a404bbf, 79b5a980, 6cff0924, 7833fe4e, 96ec02af, a9e9e858, 4e1afb02 |
| `distribute-y-depositor` | 39900fca, cfa2c166, 75b55349, 9f66c482, 69d71b4f, e604363a, a199df4c, 3e2c86f8, 4efa9f39, bb8891d0, 1f7701ce, afc6b102, 1a404bbf, 79b5a980, 6cff0924, 7833fe4e, 96ec02af, a9e9e858, 4e1afb02 |
| `sweep-dust` | 39900fca, cfa2c166, 75b55349, 9f66c482, 69d71b4f, e604363a, a199df4c, 3e2c86f8, 4efa9f39, bb8891d0, 1f7701ce, afc6b102, 1a404bbf, 79b5a980, 6cff0924, 7833fe4e, 96ec02af, a9e9e858, 4e1afb02 |

## jing-ladder

| code | name | produced in |
|---|---|---|
| `u6001` | ERR_NOT_AUTHORIZED | 8d41a193, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb, a9e9e858 |
| `u6002` | ERR_INVALID_CONTRACT_HASH | a8b13fcd, a9e9e858 |
| `u6003` | ERR_NOT_VERIFIED | 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb, a9e9e858 |
| `u6004` | ERR_HASH_MISMATCH | a8b13fcd, a9e9e858 |
| `u6005` | ERR_ALREADY_REGISTERED | **none** |
| `u6006` | ERR_PRICE_TAKEN | a9e9e858 |
| `u6007` | ERR_BAD_SIDE | 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u6008` | ERR_NO_PENDING_OWNER | a8b13fcd |
| `u6009` | ERR_TIMELOCK_NOT_ELAPSED | a8b13fcd |
| `u6010` | ERR_NOT_REGISTERED | 8d41a193, a8b13fcd |
| `u6011` | ERR_BAND_FULL | 8d41a193, a8b13fcd |
| `u6012` | ERR_ALREADY_SEATED | a8b13fcd |

| event | produced in |
|---|---|
| `canonical-set` | 3e2c86f8, 4efa9f39, 1f7701ce, dfade3ba, cf9830c6, afc6b102, 1a404bbf, 6cff0924, 7833fe4e, 96ec02af, da6fd0cf, 8d41a193, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `rung-registered` | 3e2c86f8, 4efa9f39, 1f7701ce, dfade3ba, cf9830c6, afc6b102, 1a404bbf, 6cff0924, 7833fe4e, 96ec02af, da6fd0cf, 8d41a193, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `band-seated` | a8b13fcd |
| `max-band-per-side-set` | 39900fca, 764fdf7a, bb8891d0, dfade3ba, cf9830c6, 8d41a193, a8b13fcd, a9e9e858 |
| `band-retired` | 8d41a193, a8b13fcd |
| `rung-deposit` | 3e2c86f8, 4efa9f39, 1f7701ce, dfade3ba, cf9830c6, afc6b102, 1a404bbf, 6cff0924, 7833fe4e, 96ec02af, da6fd0cf, 8d41a193, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `rung-push` | da6fd0cf, a8b13fcd |
| `rung-withdraw` | 1f7701ce, dfade3ba, cf9830c6, 96ec02af, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `rung-claim` | 3e2c86f8, 4efa9f39, 6cff0924, 7833fe4e, 96ec02af, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `rung-epoch-closed` | 3e2c86f8, 7833fe4e, 96ec02af |
| `owner-proposed` | a8b13fcd |
| `owner-accepted` | a8b13fcd |

## jing-buy-stx-core-spread

| code | name | produced in |
|---|---|---|
| `u7001` | ERR_NOT_AUTHORIZED | 8d41a193, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7002` | ERR_ALREADY_INITIALIZED | 8d41a193, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7003` | ERR_NOT_INITIALIZED | a8b13fcd |
| `u7004` | ERR_ZERO_AMOUNT | 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7005` | ERR_TOO_SMALL | 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7006` | ERR_NO_POSITION | 7833fe4e, 96ec02af, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7007` | ERR_INSUFFICIENT | **none** |
| `u7008` | ERR_ZERO_PRICE | 672d3cdc, 8ff938cb |
| `u7010` | ERR_BAD_SPREAD | 672d3cdc, 8ff938cb |
| `u7009` | ERR_BAD_NAME | a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |

## jing-sell-stx-core-spread

| code | name | produced in |
|---|---|---|
| `u7001` | ERR_NOT_AUTHORIZED | 8d41a193, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7002` | ERR_ALREADY_INITIALIZED | 8d41a193, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7003` | ERR_NOT_INITIALIZED | a8b13fcd |
| `u7004` | ERR_ZERO_AMOUNT | 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7005` | ERR_TOO_SMALL | 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7006` | ERR_NO_POSITION | 7833fe4e, 96ec02af, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7007` | ERR_INSUFFICIENT | **none** |
| `u7008` | ERR_ZERO_PRICE | 672d3cdc, 8ff938cb |
| `u7010` | ERR_BAD_SPREAD | 672d3cdc, 8ff938cb |
| `u7009` | ERR_BAD_NAME | a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |

## jing-buy-stx

| code | name | produced in |
|---|---|---|
| `u7001` | ERR_NOT_AUTHORIZED | 8d41a193, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7002` | ERR_ALREADY_INITIALIZED | 8d41a193, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7003` | ERR_NOT_INITIALIZED | a8b13fcd |
| `u7004` | ERR_ZERO_AMOUNT | 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7005` | ERR_TOO_SMALL | 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7006` | ERR_NO_POSITION | 7833fe4e, 96ec02af, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7007` | ERR_INSUFFICIENT | **none** |
| `u7008` | ERR_ZERO_PRICE | 672d3cdc, 8ff938cb |
| `u7009` | ERR_BAD_NAME | a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |

## jing-buy-stx-market-spread

| code | name | produced in |
|---|---|---|
| `u7001` | ERR_NOT_AUTHORIZED | 8d41a193, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7002` | ERR_ALREADY_INITIALIZED | 8d41a193, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7003` | ERR_NOT_INITIALIZED | a8b13fcd |
| `u7004` | ERR_ZERO_AMOUNT | 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7005` | ERR_TOO_SMALL | 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7006` | ERR_NO_POSITION | 7833fe4e, 96ec02af, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |
| `u7007` | ERR_INSUFFICIENT | **none** |
| `u7008` | ERR_ZERO_PRICE | 672d3cdc, 8ff938cb |
| `u7010` | ERR_BAD_SPREAD | 672d3cdc, 8ff938cb |
| `u7009` | ERR_BAD_NAME | a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb |

## swap-router-sbtc-stx-jing-v5

| code | name | produced in |
|---|---|---|
| `u3001` | ERR_ZERO_AMOUNT | 4e1afb02 |
| `u3002` | ERR_MIN_OUT | 4e1afb02 |
| `u3003` | ERR_BAD_VENUE | 4e1afb02 |
| `u3004` | ERR_SPLIT_MISMATCH | 4e1afb02 |
| `u3005` | ERR_VAA_REQUIRED | 4e1afb02 |
| `u3006` | ERR_ZERO_LIMIT | 4e1afb02 |
| `u3007` | ERR_ZERO_MID | 4e1afb02 |

## vault-sbtc-stx-v6

| code | name | produced in |
|---|---|---|
| `u6001` | ERR_NOT_OWNER | 8d41a193, a8b13fcd, 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb, a9e9e858 |
| `u6002` | ERR_INVALID_SIGNATURE | a8b13fcd, a9e9e858 |
| `u6003` | ERR_REPLAY | 0124c42a, 6343bc2a, 672d3cdc, 8ff938cb, a9e9e858 |
| `u6004` | ERR_EXPIRED | a8b13fcd, a9e9e858 |
| `u6006` | ERR_NO_FUNDS | a9e9e858 |
| `u6011` | ERR_INVALID_SIDE | 8d41a193, a8b13fcd |
| `u6013` | ERR_INVALID_PRICE | a9e9e858 |
| `u6020` | ERR_ALREADY_INITIALIZED | a9e9e858 |
| `u6021` | ERR_PUBKEY_NOT_SET | a9e9e858 |
| `u6022` | ERR_AMOUNT_MISMATCH | a9e9e858 |
| `u6023` | ERR_REBATE_MISMATCH | **none** |

## Never produced by any run, open (0)


## Never produced, known unreachable or defensive (10)

- markets-sbtc-stx-jing-v6 ERR_STALE_PRICE u1003: shadowed: the market passes MAX_STALENESS to the Lazer oracle, which refuses a stale update first (its u1002; gaps G7)
- markets-sbtc-stx-jing-v6 ERR_ZERO_PRICE u1006: needs a signed Lazer update with a zero price: not forgeable on a fork
- markets-sbtc-stx-jing-v6 ERR_EXPO_MISMATCH u1014: needs a signed Lazer update whose two feeds carry different exponents: not forgeable on a fork
- markets-sbtc-stx-jing-v6 ERR_NOTHING_FILLED u1015: dead constant: defined, never raised
- jing-ladder ERR_ALREADY_REGISTERED u6005: needs a byte-identical rung to call register twice; initialize is once, so only a rung's own code could, and the canonical code does not
- jing-buy-stx-core-spread ERR_INSUFFICIENT u7007: a member whose shares round to zero sats after fills: dust-level rounding, not reached by the fill sizes in the harnesses
- jing-sell-stx-core-spread ERR_INSUFFICIENT u7007: same as the buy rung
- jing-buy-stx ERR_INSUFFICIENT u7007: same as the buy rung
- jing-buy-stx-market-spread ERR_INSUFFICIENT u7007: same as the buy rung
- vault-sbtc-stx-v6 ERR_REBATE_MISMATCH u6023: defensive: the v6 market's taker rebate is a constant (20 bps), so a vault bound to it can never see a mismatch; the guard is for a future market with a different rebate

## Sims read

| harness | result | sim | steps | distinct codes | distinct events |
|---|---|---|---|---|---|
| markets v6 bounty-fixes (+ T1-T25: a taker on a full side goes through the maker door, both sides; get-taker-capacity min-taker / net-cap 0 / door parks) | 387/387 | `39900fca` | 392 | 7 | 20 |
| markets v6 gaps | 72/72 | `0aea8687` | 74 | 9 | 8 |
| markets v6 lazer-paths | 35/35 | `cfa2c166` | 35 | 4 | 9 |
| markets v6 multifill | 44/44 | `75b55349` | 45 | 0 | 10 |
| markets v6 regression | 23/23 | `9f66c482` | 24 | 4 | 10 |
| markets v6 remainder-cross | 116/116 | `69d71b4f` | 127 | 3 | 15 |
| markets v6 stress | 126/126 | `e604363a` | 535 | 6 | 11 |
| markets v6 withdraw | 102/102 | `764fdf7a` | 108 | 4 | 13 |
| v6 peg-batch | 93/93 | `a199df4c` | 106 | 3 | 18 |
| v6 peg-edges | 60/60 | `3e2c86f8` | 63 | 2 | 17 |
| v6 peg | 76/76 | `4efa9f39` | 71 | 3 | 20 |
| v6 peg-mirror | 44/44 | `bb8891d0` | 53 | 2 | 17 |
| v6 peg-more | 51/51 | `1f7701ce` | 45 | 1 | 19 |
| v6 peg-park | 50/50 | `dfade3ba` | 148 | 0 | 11 |
| v6 peg-park-y | 77/77 | `cf9830c6` | 180 | 3 | 16 |
| v6 peg-track | 30/30 | `afc6b102` | 25 | 0 | 16 |
| v6 peg-walk-order | 70/70 | `1a404bbf` | 86 | 1 | 17 |
| v6 small-share-x | 31/31 | `79b5a980` | 29 | 1 | 11 |
| v6 band-mixed-fill | 60/60 | `6cff0924` | 60 | 0 | 18 |
| v6 rung-types-mixed | 85/85 | `7833fe4e` | 85 | 1 | 19 |
| v6 rungs-fill (+ F5 the sell side sold out) | 81/81 | `96ec02af` | 74 | 1 | 20 |
| v6 rungs-push (+ P3/P5/P6 push on every rung kind) | 62/62 | `da6fd0cf` | 58 | 0 | 10 |
| v6 rungs-miner-band | 174/174 | `8d41a193` | 167 | 7 | 14 |
| v6 rungs-replace-keyless (+ R10/R11 band rungs held under the minimum) | 232/232 | `a8b13fcd` | 233 | 23 | 25 |
| v6 rungs-keyless buy / sell (+ zero-padded hundredths) | 38 / 38 | `0124c42a` | 55 | 9 | 10 |
| v6 rungs-keyless buy / sell (+ zero-padded hundredths) | 38 / 38 | `6343bc2a` | 55 | 9 | 10 |
| v6 rungs-keyless buy-peg / sell-peg | 41 / 41 | `672d3cdc` | 57 | 11 | 11 |
| v6 rungs-keyless buy-peg / sell-peg | 41 / 41 | `8ff938cb` | 57 | 11 | 11 |
| vault v6 parked (+ V3/V7-V15 the rest of the vault on this stack, V11b the sBTC-side crossing reprice; V11 back at +10% on the router dust fix 6d8b5f2) | 202/202 | `a9e9e858` | 205 | 10 | 23 |
| router v5 on the v6 stack (`V6=1`, + W18/W19 pro-rata XYK / Velar splits both ways; router at 6d8b5f2: a residual worth at most one unit of the other token stays home) | 275/275 | `4e1afb02` | 271 | 12 | 13 |
