# Executed coverage from the stxer results (Full rerun 2026-09-14)

From `simulations/sim-coverage.mjs` on 2026-09-15: 26 simulations, 1448 transactions, 196 error returns. "Produced" means a step returned that code or a print carried that event, in at least one of the listed sims.


## markets-sbtc-stx-jing-v6

| code | name | produced in |
|---|---|---|
| `u1001` | ERR_DEPOSIT_TOO_SMALL | 09bcb25a, 8084a860 |
| `u1002` | ERR_ALREADY_SETTLED | **none** |
| `u1003` | ERR_STALE_PRICE | **none** |
| `u1004` | ERR_PRICE_UNCERTAIN | 98965765 |
| `u1005` | ERR_NOTHING_TO_WITHDRAW | 9ce42eb1, 5aa3e49f, 8084a860, dbbfd7d9 |
| `u1006` | ERR_ZERO_PRICE | **none** |
| `u1007` | ERR_PAUSED | 09bcb25a |
| `u1008` | ERR_NOT_AUTHORIZED | 8a8c2463, 09bcb25a |
| `u1009` | ERR_NOTHING_TO_SETTLE | 8a8c2463, 09bcb25a, 98965765, a7ccab31, 5aa3e49f, dda78b56 |
| `u1010` | ERR_QUEUE_FULL | 8a8c2463, 6256d0b4, bc321d10 |
| `u1011` | ERR_LIMIT_REQUIRED | 9ce42eb1, 091acd48 |
| `u1012` | ERR_ALREADY_INITIALIZED | 09bcb25a |
| `u1013` | ERR_WRONG_TRAIT | 09bcb25a, 8084a860 |
| `u1014` | ERR_EXPO_MISMATCH | **none** |
| `u1015` | ERR_NOTHING_FILLED | **none** |
| `u1016` | ERR_MUST_USE_SWAP | 9ce42eb1, 5aa3e49f, 091acd48, cc8d690b, 6256d0b4 |
| `u1017` | ERR_PARTIAL_FILL | 09bcb25a, 9ce42eb1, a7ccab31, 5aa3e49f, dda78b56, 6326641b |
| `u1018` | ERR_HAS_RESTING_POSITION | 8a8c2463, 09bcb25a |
| `u1019` | ERR_ZERO_MIN_DEPOSIT | a7ccab31 |
| `u1020` | ERR_TAKER_TOO_SMALL | 8a8c2463, 179b8bc7 |
| `u1022` | ERR_NOTHING_TO_READMIT | 8a8c2463, 5aa3e49f, 6256d0b4 |
| `u1023` | ERR_FEED_MISSING | 98965765 |
| `u1024` | ERR_USE_CANCEL | 8084a860 |
| `u1025` | ERR_FEED_TIMESTAMP_MISSING | 98965765 |
| `u1026` | ERR_BAD_SPREAD | 091acd48, cc8d690b, 802a3103 |
| `u1027` | ERR_CYCLE_OPEN | dda78b56 |
| `u1028` | ERR_NOT_A_SEAT | bc321d10, 6b9eaf85 |

## jing-core-v5

| code | name | produced in |
|---|---|---|
| `u5001` | ERR_NOT_AUTHORIZED | 179b8bc7 |
| `u5002` | ERR_INVALID_CONTRACT_HASH | **none** |
| `u5003` | ERR_ALREADY_REGISTERED | **none** |
| `u5005` | ERR_NOT_VERIFIED | **none** |
| `u5006` | ERR_HASH_MISMATCH | **none** |
| `u5008` | ERR_TIMELOCK_NOT_ELAPSED | **none** |
| `u5016` | ERR_PAUSED | **none** |
| `u5017` | ERR_NOT_PAUSED | **none** |
| `u5018` | ERR_NO_PENDING_OWNER | **none** |

| event | produced in |
|---|---|
| `deposit-x` | 8a8c2463, 09bcb25a, 98965765, ef2ed5c1, 9ce42eb1, a7ccab31, 5aa3e49f, 8084a860, dda78b56, 179b8bc7, 091acd48, cc8d690b, 802a3103, e2a0b12c, 6256d0b4, 62783a57, 6326641b, c663e202, 52b52f6f, bc321d10, 6b9eaf85, 5ba21f23, dc165127, dbbfd7d9 |
| `deposit-y` | 8a8c2463, 09bcb25a, 98965765, ef2ed5c1, 9ce42eb1, a7ccab31, 5aa3e49f, 8084a860, dda78b56, 179b8bc7, 091acd48, cc8d690b, 802a3103, 6256d0b4, 62783a57, 6326641b, c663e202, 52b52f6f, bc321d10, 6b9eaf85, 40829b83, 7184028e |
| `refund-x` | 8a8c2463, 09bcb25a, a7ccab31, 8084a860, dda78b56, 091acd48, cc8d690b, 802a3103, 6256d0b4, c663e202, 6b9eaf85, 5ba21f23, dc165127, dbbfd7d9 |
| `refund-y` | 8a8c2463, 09bcb25a, 98965765, a7ccab31, 8084a860, dda78b56, 179b8bc7, 091acd48, cc8d690b, 802a3103, 6256d0b4, 6326641b, c663e202, 6b9eaf85, 40829b83, 7184028e |
| `withdraw-x` | 09bcb25a, 8084a860, dda78b56, 802a3103, e2a0b12c, 6b9eaf85, 5ba21f23, dc165127 |
| `withdraw-y` | 8084a860, 6256d0b4, 6b9eaf85, 40829b83, 7184028e |
| `set-limit-x` | 09bcb25a, 9ce42eb1, a7ccab31, 5aa3e49f, 091acd48, cc8d690b, 802a3103, bc321d10, dbbfd7d9 |
| `set-limit-y` | 8a8c2463, a7ccab31, dda78b56, cc8d690b, 6256d0b4, bc321d10 |
| `peg-x` | dda78b56, 179b8bc7, 091acd48, cc8d690b, 802a3103, e2a0b12c, 62783a57, 6326641b, bc321d10, 6b9eaf85, dc165127 |
| `peg-y` | dda78b56, 179b8bc7, 091acd48, cc8d690b, 6256d0b4, 62783a57, 6326641b, 52b52f6f, bc321d10, 6b9eaf85, 7184028e |
| `park-x` | 8a8c2463, 8084a860, cc8d690b, e2a0b12c, bc321d10, dbbfd7d9 |
| `readmit-x` | 8084a860, cc8d690b |
| `park-y` | 8a8c2463, 8084a860, 6256d0b4 |
| `readmit-y` | 8a8c2463, 8084a860, 6256d0b4 |
| `small-share-roll-x` | **none** |
| `small-share-roll-y` | dda78b56 |
| `limit-roll-x` | 8a8c2463, ef2ed5c1, 9ce42eb1, a7ccab31, 5aa3e49f, dda78b56, 179b8bc7, 091acd48, 802a3103, 62783a57, 6326641b, c663e202 |
| `limit-roll-y` | 8a8c2463, a7ccab31, dda78b56, 091acd48, 62783a57, 6326641b, c663e202 |
| `match` | 8a8c2463, ef2ed5c1, a7ccab31, 5aa3e49f, dda78b56, 179b8bc7, 091acd48, 802a3103, 62783a57, 6326641b, c663e202 |
| `settlement` | 8a8c2463, 98965765, ef2ed5c1, 9ce42eb1, a7ccab31, 5aa3e49f, dda78b56, 179b8bc7, 091acd48, cc8d690b, 802a3103, 62783a57, 6326641b, c663e202 |
| `distribute-x-depositor` | 8a8c2463, 98965765, ef2ed5c1, 9ce42eb1, a7ccab31, 5aa3e49f, dda78b56, 091acd48, cc8d690b, 802a3103, 62783a57, 6326641b, c663e202 |
| `distribute-y-depositor` | 8a8c2463, 98965765, ef2ed5c1, 9ce42eb1, a7ccab31, 5aa3e49f, dda78b56, 179b8bc7, 091acd48, cc8d690b, 802a3103, 62783a57, 6326641b, c663e202 |
| `sweep-dust` | 8a8c2463, 98965765, ef2ed5c1, 9ce42eb1, a7ccab31, 5aa3e49f, dda78b56, 179b8bc7, 091acd48, cc8d690b, 802a3103, 62783a57, 6326641b, c663e202 |

## jing-ladder

| code | name | produced in |
|---|---|---|
| `u6001` | ERR_NOT_AUTHORIZED | bc321d10, 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u6002` | ERR_INVALID_CONTRACT_HASH | 6b9eaf85 |
| `u6003` | ERR_NOT_VERIFIED | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u6004` | ERR_HASH_MISMATCH | **none** |
| `u6005` | ERR_ALREADY_REGISTERED | **none** |
| `u6006` | ERR_PRICE_TAKEN | dbbfd7d9 |
| `u6007` | ERR_BAD_SIDE | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u6008` | ERR_NO_PENDING_OWNER | **none** |
| `u6009` | ERR_TIMELOCK_NOT_ELAPSED | **none** |
| `u6010` | ERR_NOT_REGISTERED | bc321d10, 6b9eaf85 |
| `u6011` | ERR_BAND_FULL | bc321d10, 6b9eaf85 |
| `u6012` | ERR_ALREADY_SEATED | 6b9eaf85 |

| event | produced in |
|---|---|
| `canonical-set` | 179b8bc7, 091acd48, 802a3103, e2a0b12c, 6256d0b4, 62783a57, 6326641b, c663e202, 52b52f6f, bc321d10, 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |
| `rung-registered` | 179b8bc7, 091acd48, 802a3103, e2a0b12c, 6256d0b4, 62783a57, 6326641b, c663e202, 52b52f6f, bc321d10, 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |
| `band-seated` | 6b9eaf85 |
| `max-band-per-side-set` | 8a8c2463, 8084a860, cc8d690b, e2a0b12c, 6256d0b4, bc321d10, 6b9eaf85, dbbfd7d9 |
| `band-retired` | bc321d10, 6b9eaf85 |
| `rung-deposit` | 179b8bc7, 091acd48, 802a3103, e2a0b12c, 6256d0b4, 62783a57, 6326641b, c663e202, 52b52f6f, bc321d10, 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |
| `rung-push` | 52b52f6f, 6b9eaf85 |
| `rung-withdraw` | 802a3103, e2a0b12c, 6256d0b4, c663e202, 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |
| `rung-claim` | 179b8bc7, 091acd48, c663e202, 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |
| `rung-epoch-closed` | 179b8bc7 |
| `owner-proposed` | **none** |
| `owner-accepted` | **none** |

## jing-buy-stx-core-spread

| code | name | produced in |
|---|---|---|
| `u7001` | ERR_NOT_AUTHORIZED | bc321d10, 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7002` | ERR_ALREADY_INITIALIZED | bc321d10, 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7003` | ERR_NOT_INITIALIZED | **none** |
| `u7004` | ERR_ZERO_AMOUNT | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7005` | ERR_TOO_SMALL | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7006` | ERR_NO_POSITION | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7007` | ERR_INSUFFICIENT | **none** |
| `u7008` | ERR_ZERO_PRICE | dc165127, 7184028e |
| `u7010` | ERR_BAD_SPREAD | dc165127, 7184028e |
| `u7009` | ERR_BAD_NAME | 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |

## jing-sell-stx-core-spread

| code | name | produced in |
|---|---|---|
| `u7001` | ERR_NOT_AUTHORIZED | bc321d10, 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7002` | ERR_ALREADY_INITIALIZED | bc321d10, 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7003` | ERR_NOT_INITIALIZED | **none** |
| `u7004` | ERR_ZERO_AMOUNT | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7005` | ERR_TOO_SMALL | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7006` | ERR_NO_POSITION | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7007` | ERR_INSUFFICIENT | **none** |
| `u7008` | ERR_ZERO_PRICE | dc165127, 7184028e |
| `u7010` | ERR_BAD_SPREAD | dc165127, 7184028e |
| `u7009` | ERR_BAD_NAME | 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |

## jing-buy-stx

| code | name | produced in |
|---|---|---|
| `u7001` | ERR_NOT_AUTHORIZED | bc321d10, 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7002` | ERR_ALREADY_INITIALIZED | bc321d10, 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7003` | ERR_NOT_INITIALIZED | **none** |
| `u7004` | ERR_ZERO_AMOUNT | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7005` | ERR_TOO_SMALL | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7006` | ERR_NO_POSITION | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7007` | ERR_INSUFFICIENT | **none** |
| `u7008` | ERR_ZERO_PRICE | dc165127, 7184028e |
| `u7009` | ERR_BAD_NAME | 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |

## jing-buy-stx-market-spread

| code | name | produced in |
|---|---|---|
| `u7001` | ERR_NOT_AUTHORIZED | bc321d10, 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7002` | ERR_ALREADY_INITIALIZED | bc321d10, 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7003` | ERR_NOT_INITIALIZED | **none** |
| `u7004` | ERR_ZERO_AMOUNT | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7005` | ERR_TOO_SMALL | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7006` | ERR_NO_POSITION | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7007` | ERR_INSUFFICIENT | **none** |
| `u7008` | ERR_ZERO_PRICE | dc165127, 7184028e |
| `u7010` | ERR_BAD_SPREAD | dc165127, 7184028e |
| `u7009` | ERR_BAD_NAME | 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |

## swap-router-sbtc-stx-jing-v5

| code | name | produced in |
|---|---|---|
| `u3001` | ERR_ZERO_AMOUNT | **none** |
| `u3002` | ERR_MIN_OUT | **none** |
| `u3003` | ERR_BAD_VENUE | **none** |
| `u3004` | ERR_SPLIT_MISMATCH | **none** |
| `u3005` | ERR_VAA_REQUIRED | **none** |
| `u3006` | ERR_ZERO_LIMIT | **none** |
| `u3007` | ERR_ZERO_MID | **none** |

## vault-sbtc-stx-v6

| code | name | produced in |
|---|---|---|
| `u6001` | ERR_NOT_OWNER | bc321d10, 6b9eaf85, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u6002` | ERR_INVALID_SIGNATURE | 6b9eaf85 |
| `u6003` | ERR_REPLAY | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u6004` | ERR_EXPIRED | **none** |
| `u6006` | ERR_NO_FUNDS | dbbfd7d9 |
| `u6011` | ERR_INVALID_SIDE | bc321d10, 6b9eaf85 |
| `u6013` | ERR_INVALID_PRICE | **none** |
| `u6020` | ERR_ALREADY_INITIALIZED | **none** |
| `u6021` | ERR_PUBKEY_NOT_SET | **none** |
| `u6022` | ERR_AMOUNT_MISMATCH | dbbfd7d9 |
| `u6023` | ERR_REBATE_MISMATCH | **none** |

## Never produced by any run (40)

- markets-sbtc-stx-jing-v6 ERR_ALREADY_SETTLED u1002
- markets-sbtc-stx-jing-v6 ERR_STALE_PRICE u1003
- markets-sbtc-stx-jing-v6 ERR_ZERO_PRICE u1006
- markets-sbtc-stx-jing-v6 ERR_EXPO_MISMATCH u1014
- markets-sbtc-stx-jing-v6 ERR_NOTHING_FILLED u1015
- jing-core-v5 ERR_INVALID_CONTRACT_HASH u5002
- jing-core-v5 ERR_ALREADY_REGISTERED u5003
- jing-core-v5 ERR_NOT_VERIFIED u5005
- jing-core-v5 ERR_HASH_MISMATCH u5006
- jing-core-v5 ERR_TIMELOCK_NOT_ELAPSED u5008
- jing-core-v5 ERR_PAUSED u5016
- jing-core-v5 ERR_NOT_PAUSED u5017
- jing-core-v5 ERR_NO_PENDING_OWNER u5018
- jing-core-v5 event small-share-roll-x
- jing-ladder ERR_HASH_MISMATCH u6004
- jing-ladder ERR_ALREADY_REGISTERED u6005
- jing-ladder ERR_NO_PENDING_OWNER u6008
- jing-ladder ERR_TIMELOCK_NOT_ELAPSED u6009
- jing-ladder event owner-proposed
- jing-ladder event owner-accepted
- jing-buy-stx-core-spread ERR_NOT_INITIALIZED u7003
- jing-buy-stx-core-spread ERR_INSUFFICIENT u7007
- jing-sell-stx-core-spread ERR_NOT_INITIALIZED u7003
- jing-sell-stx-core-spread ERR_INSUFFICIENT u7007
- jing-buy-stx ERR_NOT_INITIALIZED u7003
- jing-buy-stx ERR_INSUFFICIENT u7007
- jing-buy-stx-market-spread ERR_NOT_INITIALIZED u7003
- jing-buy-stx-market-spread ERR_INSUFFICIENT u7007
- swap-router-sbtc-stx-jing-v5 ERR_ZERO_AMOUNT u3001
- swap-router-sbtc-stx-jing-v5 ERR_MIN_OUT u3002
- swap-router-sbtc-stx-jing-v5 ERR_BAD_VENUE u3003
- swap-router-sbtc-stx-jing-v5 ERR_SPLIT_MISMATCH u3004
- swap-router-sbtc-stx-jing-v5 ERR_VAA_REQUIRED u3005
- swap-router-sbtc-stx-jing-v5 ERR_ZERO_LIMIT u3006
- swap-router-sbtc-stx-jing-v5 ERR_ZERO_MID u3007
- vault-sbtc-stx-v6 ERR_EXPIRED u6004
- vault-sbtc-stx-v6 ERR_INVALID_PRICE u6013
- vault-sbtc-stx-v6 ERR_ALREADY_INITIALIZED u6020
- vault-sbtc-stx-v6 ERR_PUBKEY_NOT_SET u6021
- vault-sbtc-stx-v6 ERR_REBATE_MISMATCH u6023

## Sims read

| harness | result | sim | steps | distinct codes | distinct events |
|---|---|---|---|---|---|
| markets v6 bounty-fixes (+ D7: the in-region size fight, strict tie, carry counts) | 220/220 | `8a8c2463` | 224 | 6 | 18 |
| markets v6 gaps | 67/67 | `09bcb25a` | 69 | 8 | 8 |
| markets v6 lazer-paths | 35/35 | `98965765` | 35 | 4 | 9 |
| markets v6 multifill | 44/44 | `ef2ed5c1` | 45 | 0 | 10 |
| markets v6 regression | 23/23 | `9ce42eb1` | 24 | 4 | 10 |
| markets v6 remainder-cross | 116/116 | `a7ccab31` | 127 | 3 | 15 |
| markets v6 stress | 126/126 | `5aa3e49f` | 535 | 6 | 11 |
| markets v6 withdraw | 102/102 | `8084a860` | 108 | 4 | 13 |
| v6 peg-batch | 93/93 | `dda78b56` | 106 | 3 | 18 |
| v6 peg-edges | 60/60 | `179b8bc7` | 63 | 2 | 17 |
| v6 peg | 76/76 | `091acd48` | 71 | 3 | 20 |
| v6 peg-mirror | 44/44 | `cc8d690b` | 53 | 2 | 17 |
| v6 peg-more | 51/51 | `802a3103` | 45 | 1 | 19 |
| v6 peg-park | 41/41 | `e2a0b12c` | 139 | 0 | 11 |
| v6 peg-park-y | 77/77 | `6256d0b4` | 180 | 3 | 16 |
| v6 peg-track | 30/30 | `62783a57` | 25 | 0 | 16 |
| v6 peg-walk-order | 60/60 | `6326641b` | 77 | 1 | 17 |
| v6 rungs-fill | 40/40 | `c663e202` | 35 | 0 | 18 |
| v6 rungs-push | 39/39 | `52b52f6f` | 37 | 0 | 9 |
| v6 rungs-miner-band | 174/174 | `bc321d10` | 167 | 7 | 14 |
| v6 rungs-replace-keyless | 149/149 | `6b9eaf85` | 147 | 9 | 19 |
| v6 rungs-keyless buy / sell | 37 / 37 | `5ba21f23` | 54 | 9 | 10 |
| v6 rungs-keyless buy / sell | 37 / 37 | `40829b83` | 54 | 9 | 10 |
| v6 rungs-keyless buy-peg / sell-peg | 40 / 40 | `dc165127` | 56 | 11 | 11 |
| v6 rungs-keyless buy-peg / sell-peg | 40 / 40 | `7184028e` | 56 | 11 | 11 |
| vault v6 parked | 137/137 | `dbbfd7d9` | 137 | 3 | 10 |
