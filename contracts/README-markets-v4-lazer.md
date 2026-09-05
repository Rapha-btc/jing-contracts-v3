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

## Breadth: seeded random sequences with invariants (`verify-markets-v4-stress.js`)

A seeded random sequence of maker and taker actions over many cycles: bids
and asks at limits around the mid (in and out of range), cancels, reprices,
swaps of random size both ways at a 3% limit, close-and-settle attempts,
readmits. Six funded makers plus the two takers. Every action must return
`(ok ...)` or one of the market's documented refusals (`u1022` gate,
`u1023` fill-or-kill, `u1008`, `u1012`, `u1028`, and the token contracts'
`u1`/`u3` when a maker runs dry). Every ten actions the book's invariants
are checked:

- **I1 escrow**: the contract's sBTC equals every x deposit this cycle and
  next plus parked x plus the pending x rebate; same for STX and y.
- **I2** cycle totals equal the sums over the depositor lists, both cycles,
  both sides.
- **I3** the rebate pots are zero at rest.
- **I4 conservation**: per token, the balance deltas of every participant,
  the contract and the treasury sum to zero.
- **I5** the treasury only ever gains, and gains when fills happened.

| run | actions | fills | result |
|---|---|---|---|
| seed 7, local v4 | 60 | 12 | 125/125, [711e08bd](https://stxer.xyz/simulations/mainnet/711e08bdefff7975991ab6521ed8f734) |
| seed 7, deployed | 60 | 12 | 123/123, [037b8311](https://stxer.xyz/simulations/mainnet/037b831130657eb2497f9e5ded3a5bc4) |
| seed 11, local v4 | 80 | 11 | 161/161, [14d5629b](https://stxer.xyz/simulations/mainnet/14d5629bc89805eff1fe043996402473) |
| seed 23, deployed | 80 | 10 | 159/159, [1b7398d6](https://stxer.xyz/simulations/mainnet/1b7398d6be6e561c37a96413124802e0) |

No invariant broke in any run. One harness bug was found and fixed on the
way (a maker key colliding with the local deployer's, which is also the
treasury), nothing in the market. `SEED` and `STEPS` change the sequence.

## Router breadth: seeded random takers (`verify-swap-router-v2-stress.js`)

Makers rest random bids and asks on the market; takers go through the
router with random split swaps (random book share, random split over DLMM,
XYK and Velar, fallback some or none) and random smart swaps (random size,
limit 0.5% to 4%), both directions. After every router swap: the receipt's
legs plus `unsold` equal the amount (R1), the sold asset left the wallet by
exactly amount minus unsold (R2), the bought asset grew by exactly `out`
(R3), `out` equals the sum of the legs (R4), every filled leg of a smart
swap respects the limit (R5), and the router holds nothing (R6). Every ten
actions the market's book invariants are checked as well.

| run | swaps through | with a book fill | result |
|---|---|---|---|
| seed 7, local v4 + router v2 | 21/27 | 6 | 213/213, [110e924f](https://stxer.xyz/simulations/mainnet/110e924fd750b7e1435ae19e0c9d3581) |
| seed 7, deployed | 21/27 | 6 | 211/211, [c864173f](https://stxer.xyz/simulations/mainnet/c864173fd6830f08c46d611f3dcb24bb) |
| seed 31, 60 actions, deployed | 29/30 | 10 | 265/265, [dfdfae98](https://stxer.xyz/simulations/mainnet/dfdfae98d7af36772a67fcbf6632810c) |

Two observations for the front end, neither a router defect:

- **Dust legs.** A random split that hands a venue a leg worth less than one
  unit of output (a few hundred uSTX of STX, or a handful of sats) is
  refused by that venue's own minimum (`u2003`, `u1019`) and the whole
  split swap reverts. Do not plan legs below roughly one output unit.
- **One output unit of rounding.** The limit is honoured on every leg
  within the router's two input units of slack and one unit of integer
  output: a dust leg whose fair output is 1.02 sats pays 1 sat. Immaterial
  at any real size.

## To deploy

1. Done: `markets-sbtc-stx-jingswap` (v4) and `swap-router-sbtc-stx-jingswap`
   (router v2) are deployed from chavita.
2. Still to send from chavita: `jing-core-v3 set-verified-contract` for the
   market, then `initialize` with `min-x u1000`, `min-y u1000000`, feed ids
   `u1`, `u45`.
3. Backend: `PYTH_API_KEY` on Vercel, the VAA route replaced by the Lazer
   fetch above. Front end passes `update`.

v3 and router v1 stay on mainnet as dead code. Do not initialize v3.

## Router v3 (`swap-router-sbtc-stx-jingswap-v1`)

`swap-router-sbtc-stx-jing-v3.clar`, deploy copy
`contracts/deploying/swap-router-sbtc-stx-jingswap-v1.clar`, same market.
Two changes, both from the audit bounty:

- The smart swaps take `mid` from the caller:
  `smart-swap-* (amount limit-price update mid min-out)`. v2 called
  `refresh-mid` first, which verified the Lazer update once just to size the
  book leg, then `swap` verified it again. `mid` is a sizing hint only: the
  market verifies the update inside `swap` and settles at its own mid, so a
  wrong hint only undersizes the book leg (fills, rest on the AMMs) or
  oversizes it (fill-or-kill refuses, everything on the AMMs). The front end
  has it from the same Lazer response: `mid = px * 1e8 / py`.
- `limit-price u0` is refused with u3006 and `mid u0` with u3007, instead of
  a runtime division by zero with no code. `get-taker-capacity` in the
  market divides by `mid` and is only reached through `jing-size`, after
  these asserts, so the market stays as deployed.

`jing-size` returns a plain uint now (nothing in it can fail).

Harness `simulations/verify-swap-router-v3-lazer.js`: the v2 harness with
the `mid` argument, plus W16 (the five zero guards) and W17 (a hint 5% high
and 5% low, both swaps succeed under the limit, book leg sized as predicted).
`DEPLOY_COPY=1` deploys the stripped copy on the fork under chavita as
`swap-router-sbtc-stx-jingswap-v1` against the DEPLOYED market.

| run | checks | stxer |
|---|---|---|
| local source, market v4 from file | 246/246 | https://stxer.xyz/simulations/mainnet/37b7ec813b92d5c83f6b4cf22d78e110 |
| deploy copy vs deployed market | 245/245 | https://stxer.xyz/simulations/mainnet/3c901538683d4912739223a68c10a37e |
| DEPLOYED router v1 bytes vs deployed market (`DEPLOYED=1`) | 244/244 | https://stxer.xyz/simulations/mainnet/71597fc98451c9764d5aec45ee23da4f |

Deployed 2026-09-05 from chavita as
`SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-stx-jingswap-v1`
(tx 096413a7b9f41bc63963206378e0a907f76b470fc07184bf9edf5e7b858c6eae, via
faktory-dao `deploy-contract`, template 26ec907c). The front end should use
this router; `swap-router-sbtc-stx-jingswap` (v2) stays live as dead code.

## Audit bounty notes (no change needed)

- Freshness boundary: the Lazer oracle accepts age `<= 80 s`, the market
  needs publish-time strictly newer than now minus 80 s. At exactly 80 s the
  oracle passes and the market refuses with u1005 instead of the oracle's
  u1002. Same outcome, refused.
- Replay: any Lazer-signed update up to 80 s old is accepted, by design.
  Re-using one inside the window re-uses a price the market would take
  anyway.
- Confidence and expo checks in the maker gate
  (`fresh-classification-price`): the gate only decides (rest, refuse,
  route to `swap`); every crossing path re-verifies the same update with
  the full checks in `execute-settlement` in the same tx. A wide-confidence
  update can only make a gate decision that settlement then reverts. No
  path executes on an unchecked price.

