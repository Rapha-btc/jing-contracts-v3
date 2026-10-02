# jing-core-v6 and jing-ladder-v1 — Clarinet unit tests

```sh
npm run test:core-ladder-v1
```

Both contracts run on their **unmodified bytes**: the manifest loads
`contracts/jing-core-v6.clar` and `contracts/jing-ladder-v1.clar` directly.
The [coverage report](COVERAGE.md) records the pass count, per-contract
coverage, the source hashes and the exceptions below. The reporter refuses a
run with failures or skips, checks the hashes after the run and gates at
100% functions / lines / branches after the exceptions.

## Caller fixture

Both registries gate on the caller's code hash (`contract-hash?`). `build.mjs`
generates `.build/probe.clar`: one pass-through public per core and ladder log
entrypoint (parsed from the current sources, so a new entrypoint is picked up
automatically), plus `core-register`, `ladder-register` and
`ladder-register-unseated`. Every further deploy of the same bytes (by any
account; the probe uses absolute principals) has the same hash, as identical
rung deploys do on mainnet. `probe-alt` is the same code plus one comment:
a different hash.

## What is checked

`core.test.ts` (76): owner-only hash verification (standard principal, twice),
pause at once / unpause only after 144 burn blocks (143 refused), two-step
owner handover and cancel, `register` gates (standard principal, unverified
canonical, other bytes, twice). Every one of the 59 log entrypoints is called
by an unregistered caller (u5001), a registered one (prints), and while paused
(u5016 for the 12 pause-gated ones, accepted for the rest). Equity cases:
vault deposit/withdraw with saturation at zero; deposit-x/y credit only
unregistered depositors and report parked equity; refunds debit only
unregistered depositors; `log-match` in both taker directions with
registered/unregistered takers and makers; settlement binding side;
distribute-x/y with zero and positive cleared amounts and registered
depositors; swap logs; reconciled swaps up and down; reserve/snpl debits.

`ladder.test.ts` (19): owner, canonical per side for all six sides (bad side
u6007), owner handover with the 144-block timelock. `set-max-band-per-side`:
50 refused (the market's seat list holds 50; 50 seats would also reserve every
slot), 49 accepted, below the buy count and below the sell count refused.
`register`: standard principal, no canonical, non-contract canonical, other
bytes, already registered; fixed/pegged sides one rung per price; per band
side ten seats, the eleventh spread refused (u6011), a taken spread replaced
(count unchanged, old rung keeps its row, loses `is-band-x/y` and
`is-current-rung`). `register-unseated`, `seat-band` (free, taken, full,
already seated, fixed side), `retire-band` (and seating again), and all six
rung log entrypoints (unregistered u6010, `current` true while seated, false
after retirement).

## Coverage exceptions

Raw metrics stay in the report; these two points are removed from the gate
by source fragment, and the reporter fails if either is ever hit:

- jing-core-v6 `debit`, branch `(if (> applied total) total applied)` true
  arm: `total-token-equity` is the sum of owner equities (`credit` and `debit`
  move both by the same amount) and `applied` is capped at the owner's equity,
  so `applied > total` cannot occur. It is a defensive saturation.
- jing-ladder-v1 `retire-band`, line `(key {`: the opening line of a tuple
  literal let binding. `retire-band` runs in five cases and `key` is used by
  the next binding's map lookup; the SDK reports the opening line unhit (the
  same artifact the v6-3 and integration reports list for tuple labels).

## Scope

This suite isolates the two registries. Their use by the real market, rungs
and dispatch is exercised in [integration-v6-3](../integration-v6-3/README.md)
and the [market suite](../v6-3/README.md).
