# markets-sbtc-stx-jing-v4 + swap-router-sbtc-stx-jing-v2: the Pyth Lazer cut

Reference run, 182/182 checks green on a stxer mainnet fork, real Pyth Lazer
signatures, market unpatched:
**https://stxer.xyz/simulations/mainnet/9d8071e14ef206f23bb6bdd9073f7b01**
(harness `simulations/verify-swap-router-v2-lazer.js`, needs `PYTH_API_KEY`).

## Why a v4

Pyth Core cannot be verified on Stacks since the Core upgrade. Post-upgrade
Hermes updates are signed by Pyth's five "independent routers" (3 of 5
quorum): the VAA carries guardian set index 1 with 3 signatures. Stacks'
`wormhole-core-v4` only holds the 19-guardian Wormhole set, so
`verify-and-update-price-feeds` fails `u1103` for everyone. Nothing has
written `pyth-storage-v4` since 2026-08-21, and Pyth's Stacks deployer has
shipped nothing since the v4 contracts. `markets-sbtc-stx-jing-v3` and
`swap-router-sbtc-stx-jing`, deployed at 8919603 and 8919604, are built on
Core and cannot settle on mainnet.

Pyth Lazer (sold as Pyth Pro) is signed by Pyth's own keys and verified on
Stacks by `SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle`, the
oracle Zest settles on. It works today with our Pyth Pro key
(`simulations/probe-lazer-stacks.mjs`).

## What changed in the market

Same book, same settlement, same walk, same capacity quote. Only the price
source:

- `lazer-feeds (update)` calls `pyth-lazer-oracle verify-price-feeds` with
  `pyth-lazer-decoder-v1` and `max-age = MAX_STALENESS` (80 s), finds the
  two feeds by id and shapes them into the tuples settlement already
  consumed. Confidence is required: an update without it reverts
  `u1006 ERR_PRICE_UNCERTAIN` instead of silently skipping the conf check.
  A missing feed is `u1029 ERR_FEED_MISSING`.
- Every `vaa` argument is now a Lazer `update`: `deposit-token-x/y`,
  `readmit-token-x/y`, `reprice-or-swap-token-x/y`, `swap`,
  `settle-with-refresh`, `close-and-settle-with-refresh`.
- `settle` (the storage-only settlement) and `get-storage-mid` are gone:
  there is no storage. `refresh-mid (update)` verifies and returns the mid
  `swap` will settle at.
- `initialize` takes the Lazer feed ids as numbers: BTC/USD `u1`, STX/USD
  `u45` (USDC/USD is `u7`).
- The Lazer oracle charges no fee today, so STX balances move by exactly
  the fills.

## What the front end fetches

One signed update carrying both feeds, evm format, with confidence:

```
POST https://pyth-lazer.dourolabs.app/v1/latest_price
Authorization: Bearer <PYTH_API_KEY>
{"priceFeedIds":[1,45],
 "properties":["price","exponent","confidence","publisherCount"],
 "formats":["evm"],"channel":"fixed_rate@1000ms","jsonBinaryEncoding":"hex"}
```

`evm.data` is the `update` buffer (about 140 bytes). The plan allows the
1000 ms channel, not 200 ms. The key stays on the backend.

## Router v2

`swap-router-sbtc-stx-jing-v2.clar` is the router with `JING_MARKET` on v4
and `update` in place of `vaa`. Nothing else changed, except one fix found
on the real mid: the DLMM walk's price threshold now includes the pool fee,
so a bin priced just inside the limit is not counted when it would pay out
under the limit net of fee (`dlmm-capacity`).

## What the harness proves

All of `verify-swap-router-sbtc-stx.js` (guards, single venue, splits,
capacity to the sat, smart swaps, walk boundary, own-side resting size) on
real signatures, plus:

- **W8** `refresh-mid` verifies the update and returns the mid the sim
  computed from the same Lazer prices.
- **W9f** 0.5 BTC at a limit 2% under the mid: book mid + walk to the sat,
  DLMM to its room inside the limit (0.31 BTC), spill-over on XYK and Velar,
  the rest home; the maker 3% under is untouched.
- **W10** freshness: a fixture update fetched earlier
  (`fixtures/lazer-update-stale-btc-stx.hex`) is refused by the oracle
  (`u1002`) on `refresh-mid`, on `swap` (book leg rolled back, `u3002`
  with nothing else planned) and on a bid against a resting ask. Note the
  fork's block time trails the wall clock by about 80 s, so a fixture must
  be older than that at block time to be stale.

## To deploy

1. Deploy `markets-sbtc-stx-jing-v4` from chavita (deploy copy: comments
   stripped, formatted).
2. `jing-core-v3 set-verified-contract` for it, then `initialize` with
   `min-x u1000`, `min-y u1000000`, feed ids `u1`, `u45`.
3. Deploy `swap-router-sbtc-stx-jing-v2`.
4. Backend: `PYTH_API_KEY` on Vercel, the VAA route replaced by the Lazer
   fetch above.

v3 and router v1 stay on mainnet as dead code. Do not initialize v3.
