# Executed coverage from the stxer results (Full rerun 2026-09-14)

From `simulations/sim-coverage.mjs` on 2026-09-15: 32 simulations, 1887 transactions, 272 error returns. "Produced" means a step returned that code or a print carried that event, in at least one of the listed sims.


## markets-sbtc-stx-jing-v6

| code | name | produced in |
|---|---|---|
| `u1001` | ERR_DEPOSIT_TOO_SMALL | 908a895c, 8084a860 |
| `u1002` | ERR_ALREADY_SETTLED | 908a895c, 879657b5 |
| `u1003` | ERR_STALE_PRICE | **none** |
| `u1004` | ERR_PRICE_UNCERTAIN | 98965765 |
| `u1005` | ERR_NOTHING_TO_WITHDRAW | 9ce42eb1, 5aa3e49f, 8084a860, 868ef1fe, 879657b5, d1213248 |
| `u1006` | ERR_ZERO_PRICE | **none** |
| `u1007` | ERR_PAUSED | 908a895c |
| `u1008` | ERR_NOT_AUTHORIZED | 4ccb83ee, 908a895c |
| `u1009` | ERR_NOTHING_TO_SETTLE | 4ccb83ee, 908a895c, 98965765, a7ccab31, 5aa3e49f, dda78b56 |
| `u1010` | ERR_QUEUE_FULL | 4ccb83ee, 6256d0b4, bc321d10, d1213248 |
| `u1011` | ERR_LIMIT_REQUIRED | 9ce42eb1, 091acd48 |
| `u1012` | ERR_ALREADY_INITIALIZED | 908a895c |
| `u1013` | ERR_WRONG_TRAIT | 908a895c, 8084a860 |
| `u1014` | ERR_EXPO_MISMATCH | **none** |
| `u1015` | ERR_NOTHING_FILLED | **none** |
| `u1016` | ERR_MUST_USE_SWAP | 9ce42eb1, 5aa3e49f, 091acd48, cc8d690b, 6256d0b4 |
| `u1017` | ERR_PARTIAL_FILL | 908a895c, 9ce42eb1, a7ccab31, 5aa3e49f, dda78b56, a19bb24c |
| `u1018` | ERR_HAS_RESTING_POSITION | 4ccb83ee, 908a895c |
| `u1019` | ERR_ZERO_MIN_DEPOSIT | a7ccab31 |
| `u1020` | ERR_TAKER_TOO_SMALL | 4ccb83ee, 179b8bc7, e5d2399d, 879657b5 |
| `u1022` | ERR_NOTHING_TO_READMIT | 4ccb83ee, 5aa3e49f, 6256d0b4 |
| `u1023` | ERR_FEED_MISSING | 98965765 |
| `u1024` | ERR_USE_CANCEL | 8084a860 |
| `u1025` | ERR_FEED_TIMESTAMP_MISSING | 98965765 |
| `u1026` | ERR_BAD_SPREAD | 091acd48, cc8d690b, 802a3103 |
| `u1027` | ERR_CYCLE_OPEN | dda78b56 |
| `u1028` | ERR_NOT_A_SEAT | bc321d10, 20727cf8 |

## jing-core-v5

| code | name | produced in |
|---|---|---|
| `u5001` | ERR_NOT_AUTHORIZED | 179b8bc7, 20727cf8 |
| `u5002` | ERR_INVALID_CONTRACT_HASH | 20727cf8 |
| `u5003` | ERR_ALREADY_REGISTERED | 20727cf8 |
| `u5005` | ERR_NOT_VERIFIED | 20727cf8 |
| `u5006` | ERR_HASH_MISMATCH | 20727cf8 |
| `u5008` | ERR_TIMELOCK_NOT_ELAPSED | 20727cf8 |
| `u5016` | ERR_PAUSED | 20727cf8 |
| `u5017` | ERR_NOT_PAUSED | 20727cf8 |
| `u5018` | ERR_NO_PENDING_OWNER | 20727cf8 |

| event | produced in |
|---|---|
| `deposit-x` | 4ccb83ee, 908a895c, 98965765, ef2ed5c1, 9ce42eb1, a7ccab31, 5aa3e49f, 8084a860, dda78b56, 179b8bc7, 091acd48, cc8d690b, 802a3103, 918d5678, 6256d0b4, 62783a57, a19bb24c, c663e202, 52b52f6f, bc321d10, 20727cf8, e5d2399d, 5ba21f23, dc165127, df9254fb, 868ef1fe, 879657b5, dc770f07, f3db741b, d1213248 |
| `deposit-y` | 4ccb83ee, 908a895c, 98965765, ef2ed5c1, 9ce42eb1, a7ccab31, 5aa3e49f, 8084a860, dda78b56, 179b8bc7, 091acd48, cc8d690b, 802a3103, 6256d0b4, 62783a57, a19bb24c, c663e202, 52b52f6f, bc321d10, 20727cf8, e5d2399d, 40829b83, 7184028e, df9254fb, 879657b5, dc770f07, f3db741b |
| `refund-x` | 4ccb83ee, 908a895c, a7ccab31, 8084a860, dda78b56, 091acd48, cc8d690b, 802a3103, 6256d0b4, c663e202, 20727cf8, 5ba21f23, dc165127, 868ef1fe, 879657b5, dc770f07, f3db741b, d1213248 |
| `refund-y` | 4ccb83ee, 908a895c, 98965765, a7ccab31, 8084a860, dda78b56, 179b8bc7, 091acd48, cc8d690b, 802a3103, 6256d0b4, a19bb24c, c663e202, 20727cf8, 40829b83, 7184028e, df9254fb, 879657b5, dc770f07 |
| `withdraw-x` | 908a895c, 8084a860, dda78b56, 802a3103, 918d5678, 20727cf8, 5ba21f23, dc165127 |
| `withdraw-y` | 8084a860, 6256d0b4, 20727cf8, 40829b83, 7184028e |
| `set-limit-x` | 908a895c, 9ce42eb1, a7ccab31, 5aa3e49f, 091acd48, cc8d690b, 802a3103, bc321d10, e5d2399d, 868ef1fe, dc770f07 |
| `set-limit-y` | 4ccb83ee, a7ccab31, dda78b56, cc8d690b, 6256d0b4, bc321d10 |
| `peg-x` | dda78b56, 179b8bc7, 091acd48, cc8d690b, 802a3103, 918d5678, 62783a57, a19bb24c, bc321d10, 20727cf8, e5d2399d, dc165127, df9254fb, dc770f07, f3db741b, d1213248 |
| `peg-y` | dda78b56, 179b8bc7, 091acd48, cc8d690b, 6256d0b4, 62783a57, a19bb24c, 52b52f6f, bc321d10, 20727cf8, 7184028e, df9254fb |
| `park-x` | 4ccb83ee, 8084a860, cc8d690b, 918d5678, bc321d10, 868ef1fe, d1213248 |
| `readmit-x` | 8084a860, cc8d690b, d1213248 |
| `park-y` | 4ccb83ee, 8084a860, 6256d0b4 |
| `readmit-y` | 4ccb83ee, 8084a860, 6256d0b4 |
| `small-share-roll-x` | e5d2399d |
| `small-share-roll-y` | dda78b56 |
| `limit-roll-x` | 4ccb83ee, ef2ed5c1, 9ce42eb1, a7ccab31, 5aa3e49f, dda78b56, 179b8bc7, 091acd48, 802a3103, 62783a57, a19bb24c, c663e202, df9254fb, 879657b5, f3db741b |
| `limit-roll-y` | 4ccb83ee, a7ccab31, dda78b56, 091acd48, 62783a57, a19bb24c, c663e202, df9254fb, 879657b5 |
| `match` | 4ccb83ee, ef2ed5c1, a7ccab31, 5aa3e49f, dda78b56, 179b8bc7, 091acd48, 802a3103, 62783a57, a19bb24c, c663e202, df9254fb, 879657b5, f3db741b |
| `settlement` | 4ccb83ee, 98965765, ef2ed5c1, 9ce42eb1, a7ccab31, 5aa3e49f, dda78b56, 179b8bc7, 091acd48, cc8d690b, 802a3103, 62783a57, a19bb24c, c663e202, e5d2399d, df9254fb, 879657b5, dc770f07, f3db741b |
| `distribute-x-depositor` | 4ccb83ee, 98965765, ef2ed5c1, 9ce42eb1, a7ccab31, 5aa3e49f, dda78b56, 091acd48, cc8d690b, 802a3103, 62783a57, a19bb24c, c663e202, e5d2399d, df9254fb, 879657b5, dc770f07, f3db741b |
| `distribute-y-depositor` | 4ccb83ee, 98965765, ef2ed5c1, 9ce42eb1, a7ccab31, 5aa3e49f, dda78b56, 179b8bc7, 091acd48, cc8d690b, 802a3103, 62783a57, a19bb24c, c663e202, e5d2399d, df9254fb, 879657b5, dc770f07, f3db741b |
| `sweep-dust` | 4ccb83ee, 98965765, ef2ed5c1, 9ce42eb1, a7ccab31, 5aa3e49f, dda78b56, 179b8bc7, 091acd48, cc8d690b, 802a3103, 62783a57, a19bb24c, c663e202, e5d2399d, df9254fb, 879657b5, dc770f07, f3db741b |

## jing-ladder

| code | name | produced in |
|---|---|---|
| `u6001` | ERR_NOT_AUTHORIZED | bc321d10, 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u6002` | ERR_INVALID_CONTRACT_HASH | 20727cf8 |
| `u6003` | ERR_NOT_VERIFIED | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u6004` | ERR_HASH_MISMATCH | 20727cf8 |
| `u6005` | ERR_ALREADY_REGISTERED | **none** |
| `u6006` | ERR_PRICE_TAKEN | 868ef1fe |
| `u6007` | ERR_BAD_SIDE | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u6008` | ERR_NO_PENDING_OWNER | 20727cf8 |
| `u6009` | ERR_TIMELOCK_NOT_ELAPSED | 20727cf8 |
| `u6010` | ERR_NOT_REGISTERED | bc321d10, 20727cf8 |
| `u6011` | ERR_BAND_FULL | bc321d10, 20727cf8 |
| `u6012` | ERR_ALREADY_SEATED | 20727cf8 |

| event | produced in |
|---|---|
| `canonical-set` | 179b8bc7, 091acd48, 802a3103, 918d5678, 6256d0b4, 62783a57, a19bb24c, c663e202, 52b52f6f, bc321d10, 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e, df9254fb |
| `rung-registered` | 179b8bc7, 091acd48, 802a3103, 918d5678, 6256d0b4, 62783a57, a19bb24c, c663e202, 52b52f6f, bc321d10, 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e, df9254fb |
| `band-seated` | 20727cf8 |
| `max-band-per-side-set` | 4ccb83ee, 8084a860, cc8d690b, 918d5678, 6256d0b4, bc321d10, 20727cf8, 868ef1fe |
| `band-retired` | bc321d10, 20727cf8 |
| `rung-deposit` | 179b8bc7, 091acd48, 802a3103, 918d5678, 6256d0b4, 62783a57, a19bb24c, c663e202, 52b52f6f, bc321d10, 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e, df9254fb |
| `rung-push` | 52b52f6f, 20727cf8 |
| `rung-withdraw` | 802a3103, 918d5678, 6256d0b4, c663e202, 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |
| `rung-claim` | 179b8bc7, 091acd48, c663e202, 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e, df9254fb |
| `rung-epoch-closed` | 179b8bc7 |
| `owner-proposed` | 20727cf8 |
| `owner-accepted` | 20727cf8 |

## jing-buy-stx-core-spread

| code | name | produced in |
|---|---|---|
| `u7001` | ERR_NOT_AUTHORIZED | bc321d10, 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7002` | ERR_ALREADY_INITIALIZED | bc321d10, 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7003` | ERR_NOT_INITIALIZED | 20727cf8 |
| `u7004` | ERR_ZERO_AMOUNT | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7005` | ERR_TOO_SMALL | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7006` | ERR_NO_POSITION | 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7007` | ERR_INSUFFICIENT | **none** |
| `u7008` | ERR_ZERO_PRICE | dc165127, 7184028e |
| `u7010` | ERR_BAD_SPREAD | dc165127, 7184028e |
| `u7009` | ERR_BAD_NAME | 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |

## jing-sell-stx-core-spread

| code | name | produced in |
|---|---|---|
| `u7001` | ERR_NOT_AUTHORIZED | bc321d10, 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7002` | ERR_ALREADY_INITIALIZED | bc321d10, 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7003` | ERR_NOT_INITIALIZED | 20727cf8 |
| `u7004` | ERR_ZERO_AMOUNT | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7005` | ERR_TOO_SMALL | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7006` | ERR_NO_POSITION | 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7007` | ERR_INSUFFICIENT | **none** |
| `u7008` | ERR_ZERO_PRICE | dc165127, 7184028e |
| `u7010` | ERR_BAD_SPREAD | dc165127, 7184028e |
| `u7009` | ERR_BAD_NAME | 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |

## jing-buy-stx

| code | name | produced in |
|---|---|---|
| `u7001` | ERR_NOT_AUTHORIZED | bc321d10, 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7002` | ERR_ALREADY_INITIALIZED | bc321d10, 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7003` | ERR_NOT_INITIALIZED | 20727cf8 |
| `u7004` | ERR_ZERO_AMOUNT | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7005` | ERR_TOO_SMALL | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7006` | ERR_NO_POSITION | 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7007` | ERR_INSUFFICIENT | **none** |
| `u7008` | ERR_ZERO_PRICE | dc165127, 7184028e |
| `u7009` | ERR_BAD_NAME | 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |

## jing-buy-stx-market-spread

| code | name | produced in |
|---|---|---|
| `u7001` | ERR_NOT_AUTHORIZED | bc321d10, 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7002` | ERR_ALREADY_INITIALIZED | bc321d10, 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7003` | ERR_NOT_INITIALIZED | 20727cf8 |
| `u7004` | ERR_ZERO_AMOUNT | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7005` | ERR_TOO_SMALL | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7006` | ERR_NO_POSITION | 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u7007` | ERR_INSUFFICIENT | **none** |
| `u7008` | ERR_ZERO_PRICE | dc165127, 7184028e |
| `u7010` | ERR_BAD_SPREAD | dc165127, 7184028e |
| `u7009` | ERR_BAD_NAME | 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |

## swap-router-sbtc-stx-jing-v5

| code | name | produced in |
|---|---|---|
| `u3001` | ERR_ZERO_AMOUNT | 879657b5 |
| `u3002` | ERR_MIN_OUT | 879657b5 |
| `u3003` | ERR_BAD_VENUE | 879657b5 |
| `u3004` | ERR_SPLIT_MISMATCH | 879657b5 |
| `u3005` | ERR_VAA_REQUIRED | 879657b5 |
| `u3006` | ERR_ZERO_LIMIT | 879657b5 |
| `u3007` | ERR_ZERO_MID | 879657b5 |

## vault-sbtc-stx-v6

| code | name | produced in |
|---|---|---|
| `u6001` | ERR_NOT_OWNER | bc321d10, 20727cf8, 5ba21f23, 40829b83, dc165127, 7184028e |
| `u6002` | ERR_INVALID_SIGNATURE | 20727cf8 |
| `u6003` | ERR_REPLAY | 5ba21f23, 40829b83, dc165127, 7184028e |
| `u6004` | ERR_EXPIRED | 20727cf8 |
| `u6006` | ERR_NO_FUNDS | 868ef1fe |
| `u6011` | ERR_INVALID_SIDE | bc321d10, 20727cf8 |
| `u6013` | ERR_INVALID_PRICE | 868ef1fe |
| `u6020` | ERR_ALREADY_INITIALIZED | 868ef1fe |
| `u6021` | ERR_PUBKEY_NOT_SET | 868ef1fe |
| `u6022` | ERR_AMOUNT_MISMATCH | 868ef1fe |
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
| markets v6 bounty-fixes (+ D7: the y in-region size fight, strict tie, carry counts; + D8: the core's size rule on y (in range, nobody out of range: smaller u1010, bigger parks the smallest), the demotion that parks the N-th best itself; + D9: the x mirrors: no-edge fight parks the region's smallest, empty region u1010, demotion parks the smallest) | 292/292 | `4ccb83ee` | 296 | 6 | 18 |
| markets v6 gaps (+ G7: a second instance on the real 80 s window refuses an old update, the oracle's u1002 in front of the market's u1003; the harness waits 150 s before running) | 72/72 | `908a895c` | 74 | 9 | 8 |
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
| v6 peg-park (+ K2b: an out-of-range newcomer with no price edge parks the switched-off peg first, every filler stays) | 50/50 | `918d5678` | 148 | 0 | 11 |
| v6 peg-park-y | 77/77 | `6256d0b4` | 180 | 3 | 16 |
| v6 peg-track | 30/30 | `62783a57` | 25 | 0 | 16 |
| v6 peg-walk-order (+ O4: the x walk skips a maker: the taker's own resting ask, since swap only refuses a resting position on the taker's deposit side) | 70/70 | `a19bb24c` | 86 | 1 | 17 |
| v6 rungs-fill | 40/40 | `c663e202` | 35 | 0 | 18 |
| v6 rungs-push | 39/39 | `52b52f6f` | 37 | 0 | 9 |
| v6 rungs-miner-band | 174/174 | `bc321d10` | 167 | 7 | 14 |
| v6 rungs-replace-keyless (+ R7: uninitialized rung u7003/u7006, non-canonical rung u6004, ladder owner handover; + R8: core-v5 admin: verify twice u5003, a standard principal u5002, register unverified u5005 / byte-different u5006, pause u5016, unpause timelock u5008 / u5017, owner handover u5018 / u5001, no timelock on the core's handover; + R9: the seat count clamps at 50 when the ladder max is 60) | 204/204 | `20727cf8` | 205 | 23 | 25 |
| v6 small-share-x (mirror of peg-batch Z6: an ask under 0.2% of the side is rolled, small-share-roll-x logged; + X12-X14: the x taker-too-small path, mirror of bounty-fixes B2: an in-range 600k ask on the taker's side, a bid 2% under, a 1100-sat x taker -> u1020) | 31/31 | `e5d2399d` | 29 | 1 | 11 |
| v6 rungs-keyless buy / sell | 37 / 37 | `5ba21f23` | 54 | 9 | 10 |
| v6 rungs-keyless buy / sell | 37 / 37 | `40829b83` | 54 | 9 | 10 |
| v6 rungs-keyless buy-peg / sell-peg | 40 / 40 | `dc165127` | 56 | 11 | 11 |
| v6 rungs-keyless buy-peg / sell-peg | 40 / 40 | `7184028e` | 56 | 11 | 11 |
| v6 band-mixed-fill (a seated band rung + a fixed ask + a zero-spread peg on the same side, one STX seller: the peg clears in the batch at the mid, the walk takes the fixed ask (+10) then part of the rung (+20), sync, the member claims; the sell-band mirror with two direct bids and one sBTC seller) | 60/60 | `df9254fb` | 60 | 0 | 18 |
| vault v6 parked (+ V1: initialize twice u6020, an intent before the pubkey u6021, a zero limit u6013) | 140/140 | `868ef1fe` | 140 | 6 | 10 |
| router v5 on the v6 stack (`V6=1 verify-swap-router-v3-lazer.js`; the harness now deploys the ladder before the market) | 248/248 | `879657b5` | 247 | 12 | 13 |
| external: citycoins ccd016 v2 coverage on this market (`citycoins-protocol/simulations/stxer-ccd016-v2-coverage.js`) | 73/73 | `dc770f07` | 78 | 7 | 14 |
| external: citycoins ccd016 v2 happy path | 49/49 | `f3db741b` | 47 | 0 | 14 |
| external: citycoins ccd016 v2 parked (39 in-range pegs + the vault, the core's size rule) | 129/129 | `d1213248` | 129 | 3 | 9 |
