# Coverage runs, non-market contracts (the other window)

Green runs of the harnesses that close the branch gaps of the non-market
contracts of the v6 deploy set (see `TRACE-COVERAGE-<contract>.md`). One row
per run: harness, result, sim id, what the run added. Rows are merged into
the README table by the market window.

| harness | result | sim | added |
|---|---|---|---|
| v6 rungs-keyless RUNG=buy | 38/38 | `8a1752d6e5104273805246ee93da20d8` | initialize with hundredths under 10 ("300-05"): the zero-padding arm of expected-name, still u7009 |
| v6 rungs-keyless RUNG=sell | 38/38 | `5eb6ce12bef958a59f40ab784f0cb528` | same, "400-05" |
| v6 rungs-keyless RUNG=buy-peg | 41/41 | `de538c524304528cc91e32994901a57b` | same on jing-buy-stx-market-spread (its expected-name padding arm was never taken) |
| v6 rungs-keyless RUNG=sell-peg | 41/41 | `1239af9112e548141e89e2dc50d6cbcb` | same on jing-sell-stx-market-spread |
| v6 rungs-push | 62/62 | `7245f85008e9b91e54ad8b186f400fbb` | P5 the fixed sell rung's `push` (never called before): held on 0x00 while asks rest, push(0x00) refused, push(update) pushes, nothing left -> false; P6 the buy peg rung's `push` (never called before), rests a pegged ask at +20 bps; P3 push with nothing held on the sell peg -> (ok false) |
