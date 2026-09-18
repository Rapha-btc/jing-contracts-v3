# v6 oracle price confidence: real stxer evidence

Contract: `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6`.

Pyth confidence is an absolute estimate of price uncertainty: price ± confidence,
with the same exponent for both values. Larger confidence means more uncertainty,
not a higher probability that the price is correct. See
[Pyth's price-data explanation](https://docs.pyth.network/price-feeds/pro/understanding-price-data)
and [fixed-point representation](https://docs.pyth.network/price-feeds/core/best-practices).

## Settlement guard

`MAX_CONF_RATIO` is `u50` (line 18 in the deployed source). In
`execute-settlement`, each feed independently must satisfy:

```clarity
(asserts! (< (get conf feed-x) (/ price-x MAX_CONF_RATIO))
  ERR_PRICE_UNCERTAIN
)
(asserts! (< (get conf feed-y) (/ price-y MAX_CONF_RATIO))
  ERR_PRICE_UNCERTAIN
)
```

These are deployed-source lines 2911–2915; in the local source checked when
recording this evidence, they begin at lines 2918 and 2921. Search for the
expressions when consulting a different revision. Source:
[Hiro deployed source](https://api.hiro.so/v2/contracts/source/SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22/markets-sbtc-stx-jing-v6).

Dividing by 50 computes 2% of the price. The comparison is strictly `<`:
either confidence at or above the threshold aborts settlement with
`ERR_PRICE_UNCERTAIN`, `(err u1004)`. Integer division floors `price / 50`;
the exact implemented condition is `conf < floor(price / 50)`.
BTC/USD is feed X (Pyth feed 1); STX/USD is feed Y (Pyth feed 45).

## Real signed update on a mainnet fork

[stxer simulation 999097f41dbd33808beda6e6f42a35b1](https://stxer.xyz/simulations/mainnet/999097f41dbd33808beda6e6f42a35b1)
ran against deployed v6 at Stacks block 9020241. The probe fetched a real
signed BTC/STX update through the same backend used by the frontend and
called v6's `lazer-feeds` in the simulation. Both feeds reported publish
time `1789761377` (Unix seconds) and exponent `-8`.

| Feed | Raw price | Raw confidence | `floor(price / 50)` | Confidence / price | Comparison |
|---|---:|---:|---:|---:|---|
| BTC/USD | 8,120,411,244,354 | 1,977,710,569 | 162,408,224,887 | 0.024354808% | true |
| STX/USD | 27,867,110 | 6,139 | 557,342 | 0.022029554% | true |

Multiply raw prices and confidence values by `10^-8` for dollars:

| Feed | USD price | USD uncertainty ± |
|---|---:|---:|
| BTC/USD | $81,204.11244354 | $19.77710569 |
| STX/USD | $0.27867110 | $0.00006139 |

Exact decoded evaluation result:

```text
(ok (tuple (btc (tuple (conf u1977710569) (ema-conf u0) (ema-price 8120411244354) (expo -8) (prev-publish-time u0) (price 8120411244354) (publish-time u1789761377))) (btc-passes true) (btc-threshold u162408224887) (stx (tuple (conf u6139) (ema-conf u0) (ema-price 27867110) (expo -8) (prev-publish-time u0) (price 27867110) (publish-time u1789761377))) (stx-passes true) (stx-threshold u557342)))
```

This is real signed oracle data, with both uncertainty ratios well below 2%.
The probe evaluates the comparisons; it does not execute settlement or
broadcast real transactions. It does not demonstrate rejection of an
actual signed update with uncertainty at or above 2%. Existing coverage
notes in `BRANCH-MATRIX-markets-v6.md` distinguish those untested rejection
arms from the tested `u1004` errors caused by missing confidence fields.

## Reproduce

```sh
node simulations/probe-v6-confidence-stxer.js
```

Requires network access to the backend (or Pyth when `PYTH_API_KEY` is set),
Hiro, and stxer. `_lazer.js` uses the existing frontend backend route when
no Pyth key is available. The probe prints the simulation URL and decoded
result, and saves raw results to `/tmp/v6-confidence-stxer.json`.
Each new run fetches a fresh signed update, so its numbers will differ.
