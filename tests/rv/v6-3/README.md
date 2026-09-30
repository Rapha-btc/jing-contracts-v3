# v6-3 Rendezvous fuzzing with the real core

**Current-source full campaigns pass.** These reports include the `34bbe18`
net-based swap rebate and exact gross-up, the registered-maker accounting fix,
`is-ok` cancellation/pending-refund logging, and bounded aggregate debits.
The market/core hashes below match the production files tested. The
[287-test Clarinet suite](../../unit/v6-3/README.md) and
[actual-sBTC refund integration](../../../simulations/README-v6-3-refund-costs.md)
provide separate complementary evidence.

- Market SHA-256: `5c08412fc5990a8bf0db3a0cbbec3fa4c859d4185d0caf1cd16ae0c78f851bfb`.
- Core SHA-256: `88a689affb23f13030953e891336af42a3f5cb275f13b3c54c79d8cd4de50697`.
- Random report generated: `2026-09-30T01:31:08.155Z`.
- Full-book report generated: `2026-09-30T01:51:10.053Z`.

The RV swap model now computes `floor(amount * 10000 / 10020)` for its
always-fresh oracle fixture. The STX dust regression expects 53 micro-STX:
net input is 998,003 and the walk trades 997,950. This is the same arithmetic
already verified by Clarinet. Production market/core code and invariant
requirements were unchanged for this rerun. The two core-spread rungs are
outside these campaigns; their small-proceeds fix is being tested separately.

## Verified results

**12,000 native RV trials completed: 4,659 passed,
7,341 discarded, zero property/invariant failures.** The three
full-book seeds also completed **600 guided episodes**. Every final recovery
sweep ended with zero x/STX custody and zero core equity on both assets.

The shared monitor completed **25,998 accounting checks** across the six
campaigns (8,479 in the full-book campaigns). After initialization,
every public call is checked, including rejected calls and native VM exceptions.
These counts include initial/final checks; they are not a source-coverage percentage
or individual assertion count. Public-call totals include RV wrappers and
bookkeeping calls, not just economic trades. Two additional public-call dust
refund regressions pass.

| Campaign | Seed | Trials | Passed | Discarded | Failed |
| --- | ---: | ---: | ---: | ---: | ---: |
| invariant | 230927 | 1000 | 1000 | 0 | 0 |
| test | 230926 | 5000 | 1634 | 3366 | 0 |
| seeded | 230929 | 3000 | 1038 | 1962 | 0 |
| Native RV after full-book seed 230930 | 231030 | 1000 | 330 | 670 | 0 |
| Native RV after full-book seed 230931 | 231031 | 1000 | 304 | 696 | 0 |
| Native RV after full-book seed 230932 | 231032 | 1000 | 353 | 647 | 0 |

Successful guided calls, including setup/recovery and excluding additional
native RV calls:

| Path | x | y |
| --- | ---: | ---: |
| Deposit | 522 | 522 |
| Settle deposit | 132 | 522 |
| Readmit submission | 120 | 120 |
| Positive readmit placement | 120 | 120 |
| Swap with nonzero output | 120 | 120 |
| Funded cancel, including recovery | 316 | 372 |
| Partial withdrawal | 16 | 17 |

**123 successful batch clears** check payout/roll/refund conservation.
Final cancellation runs with the real core paused and pauses the market for
each cancellation. Each remaining owner recovers its exact claim:

| Guided seed | x owners recovered | y owners recovered | Final state |
| --- | ---: | ---: | --- |
| 230930 | 20 | 12 | x = 0; STX = 0; both equity totals = 0 |
| 230931 | 6 | 8 | x = 0; STX = 0; both equity totals = 0 |
| 230932 | 27 | 7 | x = 0; STX = 0; both equity totals = 0 |

The random campaigns also reject **14 invalid asset-name calls** with
`BadTokenName`; those expected native errors are counted separately from property
failures. Discards are rejected/inapplicable generated inputs, not successful
economic operations. Only the swap-net model and formula-derived STX dust
expectation were updated; no production contract or accounting check was weakened.

## Run

```sh
npm run rv:v6-3            # complete random + full-book campaigns
npm run rv:v6-3:random     # 9,000 native trials + two refund regressions
npm run rv:v6-3:scenarios  # three full-book seeds + 3,000 native trials
```

Run the profiles sequentially because they share the generated target. The
combined command does this. Dependencies, Node and Python 3 are required;
network access and deployment keys are not.

For the focused refund regressions:

```sh
python3 tests/rv/v6-3/build.py
node tests/rv/v6-3/runtime.test.mjs
```

Run the complete campaign again before publishing current results.
`RV_EPISODES`, `RV_SEEDS` and `RV_RANDOM_RUNS` shorten full-book probes;
reduced runs are not interchangeable with the default campaign.

## Real code and fixtures

`build.py` preserves the entire production market prefix except for trait,
oracle/decoder and ladder principal substitutions. It appends inspection and
property helpers without changing production functions, state declarations,
queue sizes or guards. The manifest loads the actual `jing-core-v6.clar` file;
there is no generated core or replacement logger implementation.

`runtime.mjs` first deploys the generated market, verifies its actual contract
hash through the core owner's `set-verified-contract`, then calls the real
`initialize`, `set-treasury`, `sync-seat-count` and `set-distance-slots` functions.
This uses normal core registration. Funding is explicit through the strict
FT's owner-authorized `mint`; transfers cannot create balances.

The x asset is `.mock-ft`. The y trait identity is `.mock-stx`, distinct from x,
while y transfers use native simnet STX. Keeping the identities distinct makes
an x/y core-accounting mix-up observable. The oracle supplies configurable,
decoded fresh feeds and ladder membership remains a fixture. Production Pyth
signatures, sBTC behavior and ladder authorization are integration concerns.

## Accounting checks

Nine component invariants check the property latch, both asset solvency
conditions, both live totals/list consistency and uniqueness conditions,
positive pending deposits on both sides, and core equity on both sides.

After each public call the monitor reads market claims and the real core's
`token-equity`/`total-token-equity` maps. For each tested owner and each asset:

- Recorded equity equals live + parked claims.
- Total asset equity equals the sum of those credited claims.
- Pending escrow is excluded from equity until admitted, while remaining
  included in the existing market-solvency check.

These are read-only inspections, not storage injection. The same equity
invariants also run through the actual core getters in native RV sampling and
at campaign completion. The two refund regressions cross-check both methods
on positive positions and after refund/paused exit. A failed monitor records
the call sequence, block heights, failing invariants and mismatched balances,
then prevents further public calls in that campaign.

The account universe is finite: ten simnet EOAs, plus 64 generated EOAs for the
full-book profile. Only this market contributes core equity. Registered
contract depositors and interacting markets are not covered by that model.

Settlement properties determine admission/refund from exact wallet and claim
changes. Refund reasons are counted from actual core events, replacing the old
mock's `get-last-refund` interface. The refund regression cases exercise dust
of 20 x units and 53 micro-STX, exactly one real refund event, wallet reuse,
rejected paused deposits, and complete exit while both contracts are paused.

The `test-config` and cancellation wrappers retain their explicit test-only
control of market pause, minimums and distance slots. They do not alter the
production entry points or inject positions. Core ownership and registration
execute normally; core pause is invoked through its owner during final recovery.

## Scenarios and limits

The random profile reserves 48 of 50 seats through the ladder fixture to reach
queue pressure often. The full-book profile reserves zero and creates **50 live
makers per side**, parked claims, and pending deposit/limit/readmit requests
through public transactions. `MAX_DEPOSITORS` stays 50.

Each full-book seed runs 40 x and 40 y replacement/readmission episodes, an
initial batch plus 40 more batch episodes, 40 x swaps and 40 y swaps in shuffled
order, partial withdrawals and cancellations, then 1,000 native RV trials.
Readmissions must place positive amounts; swaps must have nonzero output.
Finally, the real core is paused and every remaining owner cancels its claim.

Random amount/price helpers retain bounded inputs: x amounts below 20,000,
y amounts scaled by 1,000, quotes in the 24–40 trillion range plus zero-limit
cases. Guided replenishments use larger amounts and moving oracle prices.
This is finite evidence, not a proof over all states, tokens or external callers.
Refund exits still require successful token transfers and VM execution.
Returned cancellation logger errors are ignored, and core debit arithmetic is
bounded; these campaigns also require correct accounting on normal paths. Oracle age
boundaries are tested separately by the [Clarinet suite](../../unit/v6-3/README.md).

## Evidence and provenance

[results.json](results.json) and [full-book-results.json](full-book-results.json)
record seeds, counts, monitor statistics and source/harness/fixture hashes.
The reporters reject changed inputs during campaigns, check the full generated
production prefix, verify that the manifest loads the real core, and inspect
RV output as well as exit status. Raw logs are in the ignored
`simulations/results/rv-v6-3/` directory. Full-book scenario failures also save
`full-book-counterexample.json`; post-call failures save a campaign-specific
`*-counterexample.json`. Guided traces are not automatically shrunk by native RV.

Older reports using the mock core, including the earlier run
with 4,644 passes / 7,356 discards, do not establish real-core equity correctness.
Their historical records remain in git. The old `source-hashes.json` is a caller
audit snapshot, not current campaign evidence. RV counts are separate from
Clarinet coverage percentages. No on-chain deployment is performed.


## History

The preceding full reports (market `d1e3bbad…`, core `67242f19…`, generated
2026-09-29 at 05:45/06:04 UTC) completed 12,000 trials with 4,659 passes,
7,341 discards, 600 guided episodes and 25,993 accounting checks. They did not
validate `34bbe18` or the later core revision; the current source-hashed reports
above replace them. The unchanged pass/discard counts are from fresh reruns,
not copied historical evidence.

The earlier source pair (market `43ed3bf0…`, core `53c9b38a…`) completed 12,000
trials with 4,659 passes, 7,341 discards, 600 guided episodes and 25,999 accounting
checks. Those results predated the maker/refund-safety fixes; the current results
above supersede them for this source pair. Earlier mock-core reports remain
historical evidence only.
