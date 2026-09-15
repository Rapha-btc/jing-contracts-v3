# Executed coverage from the stxer results (Full rerun 2026-09-15)

From `simulations/sim-coverage.mjs` on 2026-09-15: 30 simulations, 1761 transactions, 253 error returns. "Produced" means a step returned that code or a print carried that event, in at least one of the listed sims.


## markets-sbtc-stx-jing-v6

| code | name | produced in |
|---|---|---|
| `u1001` | ERR_DEPOSIT_TOO_SMALL | b849e557, d35a98ea |
| `u1002` | ERR_ALREADY_SETTLED | b849e557, 6ed29637 |
| `u1003` | ERR_STALE_PRICE | **none** |
| `u1004` | ERR_PRICE_UNCERTAIN | 7c6ff3f1 |
| `u1005` | ERR_NOTHING_TO_WITHDRAW | 1e101767, 08062c79, d35a98ea, aae15fd0, 6ed29637 |
| `u1006` | ERR_ZERO_PRICE | **none** |
| `u1007` | ERR_PAUSED | b849e557 |
| `u1008` | ERR_NOT_AUTHORIZED | 65eca86d, b849e557 |
| `u1009` | ERR_NOTHING_TO_SETTLE | 65eca86d, b849e557, 7c6ff3f1, 250da7f9, 08062c79, 021504ee |
| `u1010` | ERR_QUEUE_FULL | 65eca86d, f42edd92, 677a6c55 |
| `u1011` | ERR_LIMIT_REQUIRED | 1e101767, 981c4c03 |
| `u1012` | ERR_ALREADY_INITIALIZED | b849e557 |
| `u1013` | ERR_WRONG_TRAIT | b849e557, d35a98ea |
| `u1014` | ERR_EXPO_MISMATCH | **none** |
| `u1015` | ERR_NOTHING_FILLED | **none** |
| `u1016` | ERR_MUST_USE_SWAP | 1e101767, 08062c79, 981c4c03, c59430ec, f42edd92 |
| `u1017` | ERR_PARTIAL_FILL | b849e557, 1e101767, 250da7f9, 08062c79, 021504ee, f14101fc |
| `u1018` | ERR_HAS_RESTING_POSITION | 65eca86d, b849e557 |
| `u1019` | ERR_ZERO_MIN_DEPOSIT | 250da7f9 |
| `u1020` | ERR_TAKER_TOO_SMALL | 65eca86d, d4405a31, 5c063d70, 6ed29637 |
| `u1022` | ERR_NOTHING_TO_READMIT | 65eca86d, 08062c79, f42edd92 |
| `u1023` | ERR_FEED_MISSING | 7c6ff3f1 |
| `u1024` | ERR_USE_CANCEL | d35a98ea |
| `u1025` | ERR_FEED_TIMESTAMP_MISSING | 7c6ff3f1 |
| `u1026` | ERR_BAD_SPREAD | 981c4c03, c59430ec, 99f15bff |
| `u1027` | ERR_CYCLE_OPEN | 021504ee |
| `u1028` | ERR_NOT_A_SEAT | 677a6c55, 59b23d38 |

## jing-core-v5

| code | name | produced in |
|---|---|---|
| `u5001` | ERR_NOT_AUTHORIZED | d4405a31, 59b23d38 |
| `u5002` | ERR_INVALID_CONTRACT_HASH | 59b23d38 |
| `u5003` | ERR_ALREADY_REGISTERED | 59b23d38 |
| `u5005` | ERR_NOT_VERIFIED | 59b23d38 |
| `u5006` | ERR_HASH_MISMATCH | 59b23d38 |
| `u5008` | ERR_TIMELOCK_NOT_ELAPSED | 59b23d38 |
| `u5016` | ERR_PAUSED | 59b23d38 |
| `u5017` | ERR_NOT_PAUSED | 59b23d38 |
| `u5018` | ERR_NO_PENDING_OWNER | 59b23d38 |

| event | produced in |
|---|---|
| `deposit-x` | 65eca86d, b849e557, 7c6ff3f1, 20aa4a5c, 1e101767, 250da7f9, 08062c79, d35a98ea, 021504ee, d4405a31, 981c4c03, c59430ec, 99f15bff, dd814f5c, f42edd92, cc8fc837, f14101fc, 5c063d70, f4f22abe, 03519ee6, e17cd8b0, 0b2a8e02, 677a6c55, 59b23d38, 93dc4f8c, 910168c4, aae15fd0, 6ed29637 |
| `deposit-y` | 65eca86d, b849e557, 7c6ff3f1, 20aa4a5c, 1e101767, 250da7f9, 08062c79, d35a98ea, 021504ee, d4405a31, 981c4c03, c59430ec, 99f15bff, f42edd92, cc8fc837, f14101fc, 5c063d70, f4f22abe, 03519ee6, e17cd8b0, 0b2a8e02, 677a6c55, 59b23d38, 30745051, 2683081f, 6ed29637 |
| `refund-x` | 65eca86d, b849e557, 250da7f9, d35a98ea, 021504ee, 981c4c03, c59430ec, 99f15bff, f42edd92, e17cd8b0, 59b23d38, 93dc4f8c, 910168c4, aae15fd0, 6ed29637 |
| `refund-y` | 65eca86d, b849e557, 7c6ff3f1, 250da7f9, d35a98ea, 021504ee, d4405a31, 981c4c03, c59430ec, 99f15bff, f42edd92, f14101fc, f4f22abe, 03519ee6, e17cd8b0, 59b23d38, 30745051, 2683081f, 6ed29637 |
| `withdraw-x` | b849e557, d35a98ea, 021504ee, 99f15bff, dd814f5c, 59b23d38, 93dc4f8c, 910168c4 |
| `withdraw-y` | d35a98ea, f42edd92, 59b23d38, 30745051, 2683081f |
| `set-limit-x` | b849e557, 1e101767, 250da7f9, 08062c79, 981c4c03, c59430ec, 99f15bff, 5c063d70, 677a6c55, aae15fd0 |
| `set-limit-y` | 65eca86d, 250da7f9, 021504ee, c59430ec, f42edd92, 677a6c55 |
| `peg-x` | 021504ee, d4405a31, 981c4c03, c59430ec, 99f15bff, dd814f5c, cc8fc837, f14101fc, 5c063d70, f4f22abe, 03519ee6, 677a6c55, 59b23d38, 910168c4 |
| `peg-y` | 021504ee, d4405a31, 981c4c03, c59430ec, f42edd92, cc8fc837, f14101fc, f4f22abe, 03519ee6, 0b2a8e02, 677a6c55, 59b23d38, 2683081f |
| `park-x` | 65eca86d, d35a98ea, c59430ec, dd814f5c, 677a6c55, aae15fd0 |
| `readmit-x` | d35a98ea, c59430ec |
| `park-y` | 65eca86d, d35a98ea, f42edd92 |
| `readmit-y` | 65eca86d, d35a98ea, f42edd92 |
| `small-share-roll-x` | 5c063d70 |
| `small-share-roll-y` | 021504ee |
| `limit-roll-x` | 65eca86d, 20aa4a5c, 1e101767, 250da7f9, 08062c79, 021504ee, d4405a31, 981c4c03, 99f15bff, cc8fc837, f14101fc, f4f22abe, 03519ee6, e17cd8b0, 6ed29637 |
| `limit-roll-y` | 65eca86d, 250da7f9, 021504ee, 981c4c03, cc8fc837, f14101fc, f4f22abe, 03519ee6, e17cd8b0, 6ed29637 |
| `match` | 65eca86d, 20aa4a5c, 250da7f9, 08062c79, 021504ee, d4405a31, 981c4c03, 99f15bff, cc8fc837, f14101fc, f4f22abe, 03519ee6, e17cd8b0, 6ed29637 |
| `settlement` | 65eca86d, 7c6ff3f1, 20aa4a5c, 1e101767, 250da7f9, 08062c79, 021504ee, d4405a31, 981c4c03, c59430ec, 99f15bff, cc8fc837, f14101fc, 5c063d70, f4f22abe, 03519ee6, e17cd8b0, 6ed29637 |
| `distribute-x-depositor` | 65eca86d, 7c6ff3f1, 20aa4a5c, 1e101767, 250da7f9, 08062c79, 021504ee, 981c4c03, c59430ec, 99f15bff, cc8fc837, f14101fc, 5c063d70, f4f22abe, 03519ee6, e17cd8b0, 6ed29637 |
| `distribute-y-depositor` | 65eca86d, 7c6ff3f1, 20aa4a5c, 1e101767, 250da7f9, 08062c79, 021504ee, d4405a31, 981c4c03, c59430ec, 99f15bff, cc8fc837, f14101fc, 5c063d70, f4f22abe, 03519ee6, e17cd8b0, 6ed29637 |
| `sweep-dust` | 65eca86d, 7c6ff3f1, 20aa4a5c, 1e101767, 250da7f9, 08062c79, 021504ee, d4405a31, 981c4c03, c59430ec, 99f15bff, cc8fc837, f14101fc, 5c063d70, f4f22abe, 03519ee6, e17cd8b0, 6ed29637 |

## jing-ladder

| code | name | produced in |
|---|---|---|
| `u6001` | ERR_NOT_AUTHORIZED | 677a6c55, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u6002` | ERR_INVALID_CONTRACT_HASH | 59b23d38 |
| `u6003` | ERR_NOT_VERIFIED | 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u6004` | ERR_HASH_MISMATCH | 59b23d38 |
| `u6005` | ERR_ALREADY_REGISTERED | **none** |
| `u6006` | ERR_PRICE_TAKEN | aae15fd0 |
| `u6007` | ERR_BAD_SIDE | 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u6008` | ERR_NO_PENDING_OWNER | 59b23d38 |
| `u6009` | ERR_TIMELOCK_NOT_ELAPSED | 59b23d38 |
| `u6010` | ERR_NOT_REGISTERED | 677a6c55, 59b23d38 |
| `u6011` | ERR_BAND_FULL | 677a6c55, 59b23d38 |
| `u6012` | ERR_ALREADY_SEATED | 59b23d38 |

| event | produced in |
|---|---|
| `canonical-set` | d4405a31, 981c4c03, 99f15bff, dd814f5c, f42edd92, cc8fc837, f14101fc, f4f22abe, 03519ee6, e17cd8b0, 0b2a8e02, 677a6c55, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `rung-registered` | d4405a31, 981c4c03, 99f15bff, dd814f5c, f42edd92, cc8fc837, f14101fc, f4f22abe, 03519ee6, e17cd8b0, 0b2a8e02, 677a6c55, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `band-seated` | 59b23d38 |
| `max-band-per-side-set` | 65eca86d, d35a98ea, c59430ec, dd814f5c, f42edd92, 677a6c55, 59b23d38, aae15fd0 |
| `band-retired` | 677a6c55, 59b23d38 |
| `rung-deposit` | d4405a31, 981c4c03, 99f15bff, dd814f5c, f42edd92, cc8fc837, f14101fc, f4f22abe, 03519ee6, e17cd8b0, 0b2a8e02, 677a6c55, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `rung-push` | 0b2a8e02, 59b23d38 |
| `rung-withdraw` | 99f15bff, dd814f5c, f42edd92, e17cd8b0, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `rung-claim` | d4405a31, 981c4c03, f4f22abe, 03519ee6, e17cd8b0, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `rung-epoch-closed` | d4405a31, 03519ee6 |
| `owner-proposed` | 59b23d38 |
| `owner-accepted` | 59b23d38 |

## jing-buy-stx-core-spread

| code | name | produced in |
|---|---|---|
| `u7001` | ERR_NOT_AUTHORIZED | 677a6c55, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7002` | ERR_ALREADY_INITIALIZED | 677a6c55, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7003` | ERR_NOT_INITIALIZED | 59b23d38 |
| `u7004` | ERR_ZERO_AMOUNT | 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7005` | ERR_TOO_SMALL | 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7006` | ERR_NO_POSITION | 03519ee6, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7007` | ERR_INSUFFICIENT | **none** |
| `u7008` | ERR_ZERO_PRICE | 910168c4, 2683081f |
| `u7010` | ERR_BAD_SPREAD | 910168c4, 2683081f |
| `u7009` | ERR_BAD_NAME | 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |

## jing-sell-stx-core-spread

| code | name | produced in |
|---|---|---|
| `u7001` | ERR_NOT_AUTHORIZED | 677a6c55, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7002` | ERR_ALREADY_INITIALIZED | 677a6c55, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7003` | ERR_NOT_INITIALIZED | 59b23d38 |
| `u7004` | ERR_ZERO_AMOUNT | 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7005` | ERR_TOO_SMALL | 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7006` | ERR_NO_POSITION | 03519ee6, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7007` | ERR_INSUFFICIENT | **none** |
| `u7008` | ERR_ZERO_PRICE | 910168c4, 2683081f |
| `u7010` | ERR_BAD_SPREAD | 910168c4, 2683081f |
| `u7009` | ERR_BAD_NAME | 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |

## jing-buy-stx

| code | name | produced in |
|---|---|---|
| `u7001` | ERR_NOT_AUTHORIZED | 677a6c55, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7002` | ERR_ALREADY_INITIALIZED | 677a6c55, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7003` | ERR_NOT_INITIALIZED | 59b23d38 |
| `u7004` | ERR_ZERO_AMOUNT | 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7005` | ERR_TOO_SMALL | 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7006` | ERR_NO_POSITION | 03519ee6, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7007` | ERR_INSUFFICIENT | **none** |
| `u7008` | ERR_ZERO_PRICE | 910168c4, 2683081f |
| `u7009` | ERR_BAD_NAME | 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |

## jing-buy-stx-market-spread

| code | name | produced in |
|---|---|---|
| `u7001` | ERR_NOT_AUTHORIZED | 677a6c55, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7002` | ERR_ALREADY_INITIALIZED | 677a6c55, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7003` | ERR_NOT_INITIALIZED | 59b23d38 |
| `u7004` | ERR_ZERO_AMOUNT | 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7005` | ERR_TOO_SMALL | 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7006` | ERR_NO_POSITION | 03519ee6, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u7007` | ERR_INSUFFICIENT | **none** |
| `u7008` | ERR_ZERO_PRICE | 910168c4, 2683081f |
| `u7010` | ERR_BAD_SPREAD | 910168c4, 2683081f |
| `u7009` | ERR_BAD_NAME | 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |

## swap-router-sbtc-stx-jing-v5

| code | name | produced in |
|---|---|---|
| `u3001` | ERR_ZERO_AMOUNT | 6ed29637 |
| `u3002` | ERR_MIN_OUT | 6ed29637 |
| `u3003` | ERR_BAD_VENUE | 6ed29637 |
| `u3004` | ERR_SPLIT_MISMATCH | 6ed29637 |
| `u3005` | ERR_VAA_REQUIRED | 6ed29637 |
| `u3006` | ERR_ZERO_LIMIT | 6ed29637 |
| `u3007` | ERR_ZERO_MID | 6ed29637 |

## vault-sbtc-stx-v6

| code | name | produced in |
|---|---|---|
| `u6001` | ERR_NOT_OWNER | 677a6c55, 59b23d38, 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u6002` | ERR_INVALID_SIGNATURE | 59b23d38 |
| `u6003` | ERR_REPLAY | 93dc4f8c, 30745051, 910168c4, 2683081f |
| `u6004` | ERR_EXPIRED | 59b23d38 |
| `u6006` | ERR_NO_FUNDS | aae15fd0 |
| `u6011` | ERR_INVALID_SIDE | 677a6c55, 59b23d38 |
| `u6013` | ERR_INVALID_PRICE | aae15fd0 |
| `u6020` | ERR_ALREADY_INITIALIZED | aae15fd0 |
| `u6021` | ERR_PUBKEY_NOT_SET | aae15fd0 |
| `u6022` | ERR_AMOUNT_MISMATCH | aae15fd0 |
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
| markets v6 bounty-fixes | 292/292 | `65eca86d` | 296 | 6 | 18 |
| markets v6 gaps | 72/72 | `b849e557` | 74 | 9 | 8 |
| markets v6 lazer-paths | 35/35 | `7c6ff3f1` | 35 | 4 | 9 |
| markets v6 multifill | 44/44 | `20aa4a5c` | 45 | 0 | 10 |
| markets v6 regression | 23/23 | `1e101767` | 24 | 4 | 10 |
| markets v6 remainder-cross | 116/116 | `250da7f9` | 127 | 3 | 15 |
| markets v6 stress | 126/126 | `08062c79` | 535 | 6 | 11 |
| markets v6 withdraw | 102/102 | `d35a98ea` | 108 | 4 | 13 |
| v6 peg-batch | 93/93 | `021504ee` | 106 | 3 | 18 |
| v6 peg-edges | 60/60 | `d4405a31` | 63 | 2 | 17 |
| v6 peg | 76/76 | `981c4c03` | 71 | 3 | 20 |
| v6 peg-mirror | 44/44 | `c59430ec` | 53 | 2 | 17 |
| v6 peg-more | 51/51 | `99f15bff` | 45 | 1 | 19 |
| v6 peg-park | 50/50 | `dd814f5c` | 148 | 0 | 11 |
| v6 peg-park-y | 77/77 | `f42edd92` | 180 | 3 | 16 |
| v6 peg-track | 30/30 | `cc8fc837` | 25 | 0 | 16 |
| v6 peg-walk-order | 70/70 | `f14101fc` | 86 | 1 | 17 |
| v6 small-share-x | 31/31 | `5c063d70` | 29 | 1 | 11 |
| v6 band-mixed-fill | 60/60 | `f4f22abe` | 60 | 0 | 18 |
| v6 rung-types-mixed | 85/85 | `03519ee6` | 85 | 1 | 19 |
| v6 rungs-fill | 40/40 | `e17cd8b0` | 35 | 0 | 18 |
| v6 rungs-push | 39/39 | `0b2a8e02` | 37 | 0 | 9 |
| v6 rungs-miner-band | 174/174 | `677a6c55` | 167 | 7 | 14 |
| v6 rungs-replace-keyless | 204/204 | `59b23d38` | 205 | 23 | 25 |
| v6 rungs-keyless buy / sell | 37 / 37 | `93dc4f8c` | 54 | 9 | 10 |
| v6 rungs-keyless buy / sell | 37 / 37 | `30745051` | 54 | 9 | 10 |
| v6 rungs-keyless buy-peg / sell-peg | 40 / 40 | `910168c4` | 56 | 11 | 11 |
| v6 rungs-keyless buy-peg / sell-peg | 40 / 40 | `2683081f` | 56 | 11 | 11 |
| vault v6 parked | 140/140 | `aae15fd0` | 140 | 6 | 10 |
| router v5 on the v6 stack (`V6=1`) | 248/248 | `6ed29637` | 247 | 12 | 13 |
