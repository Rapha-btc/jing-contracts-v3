# Rendezvous (RV) property fuzzing — bootstrap

`@stacks/rendezvous@1.0.0-rc.1` harness for the v3 markets and jing-core.
Discovers state-violating tx sequences that hand-written sims structurally miss
(e.g. the cancel-cycle × small-share-filter bug found 2026-05-07).

## Status

**Bootstrapped, but only partially exercising the contract.** RV's auto-generated
random sequences cannot call functions that take SIP-010 trait parameters
(`deposit-token-x`, `deposit-token-y`, `cancel-token-{x,y}-deposit`, `settle*`,
`swap*`, `close-and-settle*`) because the SIP-010 trait has no eligible
implementation in the local simnet — sBTC and USDCx live as Clarinet
*requirements* on mainnet, and `initSimnet` only loads the 12 project
contracts. RV reports those functions as skipped.

What RV currently exercises: `cancel-cycle`, `set-paused`, `set-treasury`,
`set-operator`, `set-min-token-{x,y}-deposit`, `set-token-{x,y}-limit` (the
last two only fire if the caller has a deposit, which they don't, so they
short-circuit). Result: state never moves, invariants pass trivially, no
bugs surfaced from this incomplete coverage.

## To unblock full RV coverage, pick one

1. **Mock SIP-010 token + dialer.** Deploy a minimal SIP-010 stub as a project
   contract in `Clarinet-<market>.toml`, then write a `--dial` JS file
   ([rendezvous docs](https://stacks-network.github.io/rendezvous/)) that
   pre-runs `initialize` with the mock as token-x and token-y and pre-mints
   balances to the eligible accounts. RV then drives random deposits/cancels
   against the mock.
2. **Vitest + fast-check.** Write a property test in `tests/` that uses the
   existing vitest+clarinet harness (which DOES load sBTC/USDCx) and drives
   random tx sequences via fast-check, calling the invariant read-only
   functions after each step.

(2) reuses your existing test setup and is the faster path to bug discovery.

## Files

- `<contract>.invariants.clar` — append-only invariant block per contract.
  The build script concatenates this onto the production source to produce
  the version RV loads.
- `build.sh` — concatenate production .clar + invariants → `.build/<contract>.clar`
- `.build/` — gitignored output directory.
- `Clarinet-<contract>.toml` (at project root) — custom manifest pointing
  RV at the augmented .clar.

## Running

```bash
bash tests/rv/build.sh
npx rv . markets-sbtc-usdcx-jing invariant --runs=100
```

## Invariants currently coded (markets-sbtc-usdcx-jing)

12 read-only invariants covering:

1. `invariant-y-curr-list-sum-matches-totals` — for current cycle, sum of
   token-y-deposit over the depositor list = cycle-totals[C].total-token-y.
   Catches drift when any code path updates list/totals/map non-atomically.
2. `invariant-y-next-list-sum-matches-totals` — same for cycle C+1 (catches
   roll-forward drift across the cycle boundary).
3-4. `invariant-x-{curr,next}-list-sum-matches-totals` — x-side mirror.
5-8. `invariant-{x,y}-{curr,next}-no-ghosts` — every depositor in the list
     has deposit > 0 (catches partial-cancel paths leaving stale list entries).
9. `invariant-cleared-le-deposited-y` — settled cycle's y-cleared <= total-y.
10. `invariant-cleared-le-deposited-x` — same for x.
11-12. `invariant-{x,y}-depositor-list-bounded` — len(list) <= MAX_DEPOSITORS.

The cancel-cycle × small-share-filter bug, the one this work surfaced,
would be caught by a *contract-balance vs sum-of-cycle-totals* invariant
(the bug had list/totals internally consistent but the underlying token
balance held more than the sum of declared cycle totals). That invariant
needs a dial file to query the FT contract balance — left for follow-up.
