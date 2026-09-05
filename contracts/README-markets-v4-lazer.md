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

## Router scenarios added on v4 (W11 to W15) and cost

- **W11** STX-seller walk boundary on the smart swap: asks at the mid,
  0.5% over (inside the seller's 2% limit, walked and paid) and 3% over
  (outside, untouched, cancels in full); the rest goes to DLMM.
- **W12** book too thin for the min deposit: a 1 STX bid is worth ~330
  sats, under the 1000-sat x minimum; capacity says so, the book leg is
  skipped, the AMMs take everything and the bid stays.
- **W13** fallback with a dust residual on the split swap: the book keeps
  its capacity, refunds the sub-min dust, and the dust lands on the
  fallback venue on top of its planned leg.
- **W14** legs would fill but `min-out` is impossible: `u3002`, nothing
  moved.
- **W15** the 30-bin cap: 3 BTC at 10% under the mid, the walk stops at its
  cap, the leg stays under the amount, spill-over reaches XYK and Velar,
  the rest stays home, every leg at or above the limit.

Execution cost of the two heaviest smart swaps, read from stxer against the
Stacks block limits:

| swap | runtime | read count | read bytes |
|---|---|---|---|
| W9f 0.5 BTC, book + walk + 3 legs | 0.29% | 9.4% | 6.5% |
| W15 3 BTC, book skipped, 30-bin walk + 3 legs | 0.42% | 12.9% | 11.7% |

The read budget is dominated by the walk calling `dlmm-core get-bin-price`
once per bin, which loads that large contract each time. Computing the bin
price locally (one call for the active bin, then the 15 bps step applied
per bin) would cut it roughly tenfold; not done yet. The harness holds the
line at 15% of every limit.

## The five market harnesses on v4

Ported from the v2 harnesses (`verify-markets-v4-*.js`): the market file is
v4, the dummy VAA is a real signed Lazer update fetched at build time, the
feed ids are `u1`/`u45`, and the storage-only `settle` calls became
`settle-with-refresh`. Three run with no patch at all. Two advance the
chain by 43 bitcoin blocks to reach `CANCEL_THRESHOLD`, hours ahead of any
update that can be fetched, so in those two the sim copy widens
`MAX_STALENESS` and nothing else; signatures stay real, and the 80 s window
is proven by the router harness (W10).

| harness | patch | result |
|---|---|---|
| `verify-markets-v4-remainder-cross.js` | none | 115/115, [61beb09a](https://stxer.xyz/simulations/mainnet/61beb09a2b889aeb05ea18a7281fd993) (M3 sized 8000 sats for the live mid) |
| `verify-markets-v4-multifill.js` | none | 43/43, [631d64cb](https://stxer.xyz/simulations/mainnet/631d64cbbf8c622f682d2474cc40c939) |
| `verify-markets-v4-regression.js` | none | 22/22, [7f25ca7d](https://stxer.xyz/simulations/mainnet/7f25ca7d6286cea1a6c92d17fdefe60f) |
| `verify-markets-v4-bounty-fixes.js` | staleness window only | 127/127, [575cc8a4](https://stxer.xyz/simulations/mainnet/575cc8a46a00b86c4646517b6cec2bbb) |
| `verify-markets-v4-gaps.js` | staleness window only | 78/78, [3fb5028b](https://stxer.xyz/simulations/mainnet/3fb5028bd2c63f1ec5f6a84b78f79c5a) |
| `verify-swap-router-v2-lazer.js` | none | 224/224, [d925d075](https://stxer.xyz/simulations/mainnet/d925d075944c7640dc0be9fcff360016) |

609 checks on the deploy candidate, all with real Pyth signatures. Every
harness needs `PYTH_API_KEY`.

## The same harnesses against the DEPLOYED contracts

`DEPLOYED=1` runs every harness against the mainnet deployments at chavita,
`markets-sbtc-stx-jingswap` (= v4, height 8920088) and
`swap-router-sbtc-stx-jingswap` (= router v2, height 8920090), with the live
`jing-core-v3`. Nothing is deployed except test-only copies; the sim
verifies and initializes the market on the fork as chavita, which mainnet
still has to do for real. The two clock-advancing harnesses run a
`-clock` copy built from the live bytes with only `MAX_STALENESS` widened.

| harness | result on the deployed contracts |
|---|---|
| router v2 | 222/222, [6fc2f215](https://stxer.xyz/simulations/mainnet/6fc2f215e1e942cdc396d952454014fd) |
| remainder-cross | 113/113, [339658e2](https://stxer.xyz/simulations/mainnet/339658e2d38ecec29af1c9ab35436aac) |
| multifill | 41/41, [2b3dda89](https://stxer.xyz/simulations/mainnet/2b3dda8981edd05fbf97be462f9b6191) |
| regression | 20/20, [9e715527](https://stxer.xyz/simulations/mainnet/9e715527682ef33398ab07c6b08d2394) |
| bounty-fixes, `-clock` copy of the live bytes | 126/126, [8c1c7c4e](https://stxer.xyz/simulations/mainnet/8c1c7c4ee47ec80b44d3cf9050ca1238) |
| gaps, `-clock` copy of the live bytes | 77/77, [a95823b1](https://stxer.xyz/simulations/mainnet/a95823b1e838ada1a2c302c6eaceb52d) |

The counts are two lower than the local runs: the deploy steps are gone.

```
PYTH_API_KEY=<key> DEPLOYED=1 npx tsx simulations/verify-swap-router-v2-lazer.js
```

## Coverage audit of the market (v4)

Every public function is called by at least one harness. Error codes:

| code | reached by | note |
|---|---|---|
| u1001, u1002, u1003, u1005, u1008, u1010, u1011, u1012, u1013, u1014, u1016, u1017, u1018, u1019, u1022, u1023, u1024, u1025, u1026, u1027, u1028 | the five ported harnesses | |
| u1029 ERR_FEED_MISSING | `verify-markets-v4-lazer-paths.js` L2, L3 | an update without the STX feed (BTC only, or BTC + USDC) |
| u1006 ERR_PRICE_UNCERTAIN | lazer-paths L4, L5 | an update fetched without the confidence property, on refresh-mid, swap and a gated deposit |
| u1004 ERR_ALREADY_SETTLED | defensive | the deposit-phase gate (u1003) is checked first; lazer-paths L7 shows it |
| u1009 ERR_ZERO_PRICE, u1020 ERR_EXPO_MISMATCH | defensive | a signed Lazer update cannot carry a zero price, and both feeds carry expo -8 |
| u1021 ERR_NOTHING_FILLED | dead | never raised; can be removed in a later cut |

lazer-paths also covers the read-onlys nobody called (`get-min-deposits`,
`get-cycle-start-block`, `get-blocks-elapsed`, `would-take-as-x/-y` on an
empty book and with a live maker, `get-token-x-depositors`,
`get-settlement` before and after a settlement) and the gate rule: a
deposit only reads the price when the opposite side has makers.

| harness | local v4 | deployed `markets-sbtc-stx-jingswap` |
|---|---|---|
| `verify-markets-v4-lazer-paths.js` | 31/31, [2149a4b0](https://stxer.xyz/simulations/mainnet/2149a4b0dd23894e6c6f3dba833cfd48) | 29/29, [a5cfe1f4](https://stxer.xyz/simulations/mainnet/a5cfe1f48d44f175d8b120b6260428c2) |

One thing the deployed run surfaced: the cycle clock (`cycle-start-block`)
starts at deploy and on each roll, `initialize` does not reset it. On
mainnet the first cycle therefore counts the blocks since deploy, so its
cancel threshold is reachable right after initialize. Harmless: an empty
cycle rolls nothing.

## To deploy

1. Done: `markets-sbtc-stx-jingswap` (v4) and `swap-router-sbtc-stx-jingswap`
   (router v2) are deployed from chavita.
2. Still to send from chavita: `jing-core-v3 set-verified-contract` for the
   market, then `initialize` with `min-x u1000`, `min-y u1000000`, feed ids
   `u1`, `u45`.
3. Backend: `PYTH_API_KEY` on Vercel, the VAA route replaced by the Lazer
   fetch above. Front end passes `update`.

v3 and router v1 stay on mainnet as dead code. Do not initialize v3.
