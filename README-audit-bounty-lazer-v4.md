# Audit bounty review: Lazer market v4 + swap router (Sept 2026)

Bounty `mtnowp9o556e4a61b81a` on aibtc.com, 21,000 sats, posted 2026-09-05,
closes 2026-09-20. Scope: the deployed `markets-sbtc-stx-jingswap` (Pyth
Lazer, source `contracts/markets-sbtc-stx-jing-v4.clar`) and
`swap-router-sbtc-stx-jingswap` (source `contracts/swap-router-sbtc-stx-jing-v2.clar`).
Four submissions were reviewed on 2026-09-07. This file records what each one
found, what we decided, and what changed in the repo as a result.

The deployed bytes are unchanged. Everything below lands in the next market
deploy (`markets-sbtc-stx-jing-v5`) and its router and vault rebinds.

## Submissions and verdicts

| Submitter | Finding | Holds | Rating | Decision |
|---|---|---|---|---|
| Celestial Shark | Division by zero when `limit-price` is `u0` in the smart swaps | yes | LOW | Fixed earlier in router v3 (`u3006`, `u3007` asserts). Replied on the bounty. |
| Sonic Mast | The maker gate skips the confidence-ratio and exponent checks that settlement enforces | yes | INFO | No change. The gate only decides rest, refuse or route to swap; every path that moves funds re-verifies the same update in settlement with both checks. Replied on the bounty. |
| Violet Swift | Per-feed staleness: the market wrote the envelope timestamp into both feeds' `publish-time`, so a carried-forward price passes the 80 s check | yes | MEDIUM | **Fixed**, see below. Strongest submission: breaks a stated invariant on the deployed bytes with no caller precondition. |
| Digital Portal | Router swallows every market error; anyone could call `close-deposits` and push router takers onto the AMMs inside their own min-out | yes | LOW | **Fixed structurally**: the close window no longer exists. Router left as is, see below. |

Celestial Shark's finding was fixed in the router only. The market's one
division by a caller-supplied mid sits in `get-taker-capacity`, a read-only
nothing else in the market calls. It moves no funds, so a zero mid there
just makes a read-only call fail. The router is the only thing that feeds
it a mid on the way to a swap, and router v3 refuses a zero limit price
(`u3006`) and a zero mid (`u3007`) before reaching it. No change in the
market.

Digital Portal's two informational items, both dropped with no change:

- **Confidence floor.** `execute-settlement` requires `conf < price / 50`.
  Below a raw price of 50 the division floors to zero and the check would
  refuse every update. BTC/USD and STX/USD carry eight decimals, so a raw
  price of 50 is $0.0000005. Unreachable.
- **Duplicate feed id.** A signed update is a list of feed records. The
  market picks the BTC and STX records by walking that list once per id
  (`pick-feed`, a `fold`), keeping whichever record matches. If the list
  held the same id twice, the later record would win silently. It cannot
  happen: the list comes out of Pyth's signed payload and Pyth emits each
  requested feed once. Putting a second STX record in means forging the
  payload, and `pyth-lazer-oracle` rejects the signature before the market
  reads the list. A uniqueness assert would be dead code.

## Violet Swift: freshness is judged per feed

Pyth Lazer carries two timestamps in every update. The envelope
`timestampUs` is when the bundle was signed, a fresh one every tick. Each
feed's `feedUpdateTimestamp` is when that feed's price was last generated.
Since 2026-03-23 Lazer carries a feed's last price forward inside a fresh
envelope whenever no new aggregate exists, and only the per-feed timestamp
reveals it (see the Pyth Pro payload reference, "Price Availability
Semantics").

The market's `shape-feed` discarded the per-feed value and wrote the
envelope time into `publish-time` for both feeds. Every `MAX_STALENESS`
assert, in classification and in settlement, therefore ran on the envelope.
A carried-forward STX/USD price older than 80 s passed.

Fix (commit `76aca97`): `shape-feed` takes each feed's own
`feed-update-timestamp` (micros, divided to seconds) as `publish-time`.
Every downstream freshness assert runs on it unchanged. An update fetched
without the `feedUpdateTimestamp` property is refused with
`ERR_FEED_TIMESTAMP_MISSING`. Both fetchers request the property:
`simulations/_lazer.js` here and `server/utils/lazer.ts` in faktory-dao
(commit `6cf91d17`, shipped, safe on the deployed market which ignores the
optional field).

Proof on a mainnet fork, `simulations/verify-markets-v4-lazer-paths.js`
tier L8 (sim `229fe3e28bc1af39778c9f1720c0d588`): the on-chain
`publish-time` of each feed equals its `feedUpdateTimestamp / 1e6`; the
chain clock, `min-freshness` and both comparisons are logged; an update
without the property is refused. Sample from that run:

```
publish-time-x     1788832179   BTC feedUpdateTimestamp / 1e6
publish-time-y     1788832179   STX feedUpdateTimestamp / 1e6
stacks-block-time  1788832164
min-freshness      1788832084   stacks-block-time - 80
publish-time-x > min-freshness: true
publish-time-y > min-freshness: true
```

A genuinely carried-forward feed cannot be manufactured (only Pyth signs),
so the stale branch is proven by the arithmetic, not by a live stale feed.

## Digital Portal: the close window is gone, not patched

The finding was real: `close-deposits` was public with no caller check and
no minimum elapsed blocks, so anyone could put the book in the settle phase.
The market's `swap` then failed with not-deposit-phase, the router mapped
that to "no book" and refilled the sized book leg on the pools, bounded only
by the taker's min-out.

We looked at why `close-deposits` still existed. In the blind batch auction,
close and settle were two transactions, minutes apart, and the phase flag
was the memory between them. Since limit prices and the live-oracle cross,
every path that closes also settles in the same transaction: `swap`, the
two `reprice-or-swap` crossing branches, and the keeper entry. If settle
fails, close is undone with it. Nothing ever needed the phase between
transactions any more. So instead of a router-side tolerance check we
removed the machinery, in three steps.

1. `close-deposits` and `settle-with-refresh` made private, `cancel-cycle`
   removed (commit `27e6f43`, `be54295`). A closed-but-unsettled cycle could
   no longer exist between transactions, so the escape hatch was dead.
2. The phase flag itself removed (commit `aa5d4bf`): `deposits-closed-block`,
   the two phase constants, `get-cycle-phase`, the deposit-phase asserts on
   deposit, reprice, set-limit, readmit, withdraw and cancel, the
   settle-phase assert in settlement, `close-deposits` and its calls, the
   `log-close-deposits` event, `cycle-start-block` and the two read-onlys on
   it. `settle-with-refresh` is public again and is the keeper's entry; the
   `close-and-settle-with-refresh` wrapper is gone.
3. The two asserts `close-deposits` carried survive on every path inside
   `execute-settlement`: the paused check, and the raw-totals minimum check
   which now sits at the top of that function before the range and size
   filters. The post-filter minimum check keeps its original form, skipped
   for a crossing taker on purpose: a taker can arrive when every resting
   maker is out of range at the mid but inside the taker's limit, settlement
   clears nothing, and the price-ordered walk that follows fills them. (We
   briefly dropped that skip, which would have broken the walk; restored.)

User-facing result: the book is always open. Place, cancel, reprice or
withdraw at any block; a taker's swap closes and settles inside its own
transaction and hands the book back open before anyone else can act.

Router: left unchanged. We considered passing through only the three "book
had nothing" codes and reverting on any other market error. Rejected: the
taker set a min-out, a fill inside it on the pools is the outcome they asked
for, and a revert would only force a re-quote. The book leg is best effort
and min-out is the guard.

## Error codes

Renumbered twice into one contiguous block, now `u1001`..`u1025`. The
deployed markets keep the old numbers for ever; the frontend picks the table
by market name (`jingswap-frontend/src/config/market-errors.ts`, commit
`4087055`), so flipping `JINGSWAP_MARKET_CONTRACT_NAME` in
`config/router.ts` at deploy switches every decoder.

| Name | old (deployed v4) | new (v5) |
|---|---|---|
| DEPOSIT_TOO_SMALL | 1001 | 1001 |
| NOT_DEPOSIT_PHASE | 1002 | removed |
| NOT_SETTLE_PHASE | 1003 | removed |
| ALREADY_SETTLED | 1004 | 1002 |
| STALE_PRICE | 1005 | 1003 |
| PRICE_UNCERTAIN | 1006 | 1004 |
| NOTHING_TO_WITHDRAW | 1008 | 1005 |
| ZERO_PRICE | 1009 | 1006 |
| PAUSED | 1010 | 1007 |
| NOT_AUTHORIZED | 1011 | 1008 |
| NOTHING_TO_SETTLE | 1012 | 1009 |
| QUEUE_FULL | 1013 | 1010 |
| CANCEL_TOO_EARLY | 1014 | removed |
| ALREADY_CLOSED | 1016 | removed |
| LIMIT_REQUIRED | 1017 | 1011 |
| ALREADY_INITIALIZED | 1018 | 1012 |
| WRONG_TRAIT | 1019 | 1013 |
| EXPO_MISMATCH | 1020 | 1014 |
| NOTHING_FILLED | 1021 | 1015 |
| MUST_USE_SWAP | 1022 | 1016 |
| PARTIAL_FILL | 1023 | 1017 |
| HAS_RESTING_POSITION | 1024 | 1018 |
| ZERO_MIN_DEPOSIT | 1025 | 1019 |
| TAKER_TOO_SMALL | 1026 | 1020 |
| PARKED | 1027 | 1021 |
| NOTHING_TO_READMIT | 1028 | 1022 |
| FEED_MISSING | 1029 | 1023 |
| USE_CANCEL | 1030 | 1024 |
| FEED_TIMESTAMP_MISSING | new | 1025 |

## Fork runs

All on real Lazer updates (`PYTH_API_KEY`), market source deployed from the
repo with comment lines stripped, on `jing-core-v4`.

| Source state | Harness | Result | Sim |
|---|---|---|---|
| `76aca97` per-feed freshness | withdraw | 98/98 | earlier run |
| `76aca97` | lazer-paths (L8 added) | 38/38 | `229fe3e28bc1af39778c9f1720c0d588` |
| `27e6f43` private close, no cancel, contiguous codes | withdraw | 99/99 | `8811777a82528d063604060e23603528` |
| `27e6f43` | lazer-paths | 38/38 | `11d484e883fb5f1b8786780cc41edfb5` |
| `5e97061` harness rewrite | gaps | 73/73 | `a264a7d3eec012fb02bb6b120d60f7c2` |
| `5e97061` | bounty-fixes | 132/132 | `a19f3fb3bed60e66ab547d7a1189c557` |
| `be54295` settle private, all harnesses on core-v4 | lazer-paths | 38/38 | `51ed3020c2ed5c0c69288ac3a26cb9fc` |
| `be54295` | gaps | 73/73 | `ba1b70f07b17e5dae62538c9aa5e76e3` |
| `be54295` | remainder-cross | 116/116 | `f1a3d5a66ca59bcd850d9217b08f6d01` |
| `be54295` | stress | 125/125 | `ce7fb99c22435eba817247acb7a69c4e` |
| `be54295` | regression | 22/22 | `470cf13170a27df0e5ccdd896540df8c` |
| `be54295` | multifill | 43/43 | `c92ec85063180a724f2c6559e1814e41` |
| `aa5d4bf` phase machinery removed | withdraw | 98/98 | `277dd5587b09c38ec7f2834750c8e227` |
| `aa5d4bf` | lazer-paths | 34/34 | `599f15adaa453a0e2eed9bc734247921` |
| `aa5d4bf` | gaps | 64/64 | `5b120dfa1f63ef899970973114d50293` |
| `aa5d4bf` | bounty-fixes | 129/129 | `48d3e9deb8294f7dc74ca4aabe6106c4` |
| `aa5d4bf` | remainder-cross | 115/115 | `2d8fb89823dcfd1deede03629436d892` |
| `aa5d4bf` | stress | 125/125 | `e3bb13ebea9c3223efd5853a9f2cf5ec` |
| `aa5d4bf` | regression | 22/22 | `df8ec54caba87cd658fba23d33906ae3` |
| `aa5d4bf` | multifill | 43/43 | `e6eded13d0ec8f1f866c14d28ac4806f` |

## Still to do before the v5 deploy

- Harnesses: done, see the `aa5d4bf` rows above.
- Frontend: done, keyed by market name (jingswap-frontend `f0c0b40`): the
  25-code table, `settleFunctionName`, phase read only on legacy markets.
- Backend (faktory-dao `5f0a3a86`): keeper entry per market config
  (`settleFn`, v5 entry added), cycle-state tolerates the missing
  read-onlys. The `close-deposits` event handlers stay for v4. Still to
  do: generate the v5 market template for the deploy route.
- Bounty payout: done 2026-09-08, Violet Swift, tx
  `2a33402a4b00f89fb836676258b907d91940d07bffd9c1e30e40f71ee8b9ba01`,
  status paid.
- Deploy set under repo names, on the existing `jing-core-v4`:
  `markets-sbtc-stx-jing-v5`, `swap-router-sbtc-stx-jing-v4` (rebound to the
  market), `vault-sbtc-stx-v5` (rebound, no logic). Core admin verifies the
  new market. `jing-core-v4` is deployed and stays as is: it keeps
  `log-close-deposits` and `log-cancel-cycle` as unused public functions,
  and the repo copy stays matching the deployed bytes. Drop both from the
  core source at the next core deploy (`jing-core-v5`), not before.
