# markets-sbtc-stx-jing-v2: what changed since the deployed v1, and what is proven

Deployed reference: `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing` (v1,
batch auction). This file tracks `contracts/markets-sbtc-stx-jing-v2.clar` against it.
Last full re-run: 2026-09-02 on the working tree that includes the dust refund.

## What is new versus v1

| Commit | Change |
|---|---|
| 521d775 / 273061a | Taker rebate: `swap` pays 20 bps on top of the 10 bps fee; the rebate is credited to the makers it filled, pro rata. Logged through the core. |
| 35bd979 | Maker/taker split. Public deposits are the maker path and refuse to cross live resting size (`u1022 ERR_MUST_USE_SWAP`). `swap` is the taker path: deposit, close, settle in one tx, fill-or-kill (`u1021`, `u1023`). |
| c958e6f / 928f44e | `reprice-or-swap-token-x/y`: retarget a resting limit; if the new limit crosses, the whole position converts to a taker fill under swap economics. |
| 6b90875 | `swap` refuses a caller who already rests size on that side (`u1024 ERR_HAS_RESTING_POSITION`); reprice or cancel first. |
| b7cad2a | `paused` now also gates `close-deposits` (`u1010`), so a paused cycle cannot be pushed from deposit into settle. (aibtc bounty finding.) |
| 0dc0b37 | Remainder cross. After the batch clears at the oracle mid, the ACTIVE swapper's leftover walks the opposite side's rolled book, each out-of-range maker paid at their own limit, bounded by the swapper's limit. Passive makers never cross. Crossed makers get 20 bps from the unspent rebate pot; fees 10 bps per leg. Every fill logged via `jing-core-v3.log-match`. Dust makers (below min deposit) are skipped. |
| working tree | Dust refund: integer division can leave the walker a residual below the side's min deposit that no maker could ever fill. It is refunded to the swapper and the row cleared instead of reverting. At or above min it is a real partial fill and still reverts `u1023`. |

## What is proven, and where

| Layer | Result | Covers |
|---|---|---|
| `simulations/verify-markets-v2-regression-patched.js` | 22/22, [e52ca601](https://stxer.xyz/simulations/mainnet/e52ca60140c5c549e526ce045a7fb116) | v1 surface intact on v2: maker gate `u1022`, set-limit gate, reprice plain / guards / crossing FOK / oversize `u1023`, rebate bps read, pause on deposit |
| `simulations/verify-markets-v2-remainder-cross.js` | 50/50, [5f580781](https://stxer.xyz/simulations/mainnet/5f5807815158a5943f0ca5ba9f6aeef2) | happy walk with exact payouts and rebate split, only-out-of-range makers `u1012`, beyond-limit makers `u1023` atomic, dust maker skipped, sub-min remainder refunded, mirror direction |
| `simulations/verify-markets-v2-multifill.js` | 43/43, [e2346c47](https://stxer.xyz/simulations/mainnet/e2346c47d02b36dc85aefdeefbcf7390) | eight-maker walk in one tx, ordering, per-maker limit fills |
| `simulations/fuzz-remainder-cross-math.mjs` | 200,000 cases, 0 failures | rebate split exact, walker never overdraws escrow, traded <= maker size, fees <= traded, bounded rounding dust, conservation, no u128 overflow |
| `tests/markets-sbtc-stx-jing-v2.test.ts` (clarinet) | 53/53 across the v2 files | maker-gate truth table, top-ups, reprice matrix, `u1024` resting-position refusal, Hermes swap trio on the production contract |
| Rendezvous `tests/rv/markets-sbtc-stx-jing-v2.invariants.clar` | 500 runs, 14 invariants, 0 failures | escrow conservation vs cycle totals, list/totals consistency both sides both cycles, no ghosts, bounded lists, cleared <= deposited, pending rebates zero at rest |

How the stxer harnesses run: Hermes is key-gated, so the harnesses read real
`pyth-storage-v4` prices with two sim-only source patches (MAX_STALENESS loosened,
`verify-and-update-price-feeds` no-op'd). The freshness gate itself is proven by the
production-contract swap trio in the clarinet suite.

RV note: the walk logs through `log-match`, so `tests/rv/mock-jing-core-v2.clar` carries a
stub for it. The stub body must be `(begin (asserts! true (err u0)) (ok true))`, a bare
`(ok true)` has no error type and `try!` cannot type it.

## What is left to test

1. `u1024` on a mainnet fork. The resting-position refusal is proven in the clarinet suite
   only. Add to the regression harness: rest on side x, call `swap` on side x, expect
   `u1024`, assert nothing moved (position, limit, balance).
2. `paused` on `close-deposits` on a mainnet fork. The operator-setters sim checks pause on
   deposit only. Add: `set-paused true`, `close-deposits` -> `u1010`, unpause, closes.
3. Walk cost at scale. Eight makers proven, the depositor list bound is higher. Measure
   runtime cost of a full-list walk and pin a max in the harness so a future change cannot
   push `swap` over the block limit.
4. Rebate crumbs. The unspent pot is refunded to the swapper; the harness checks the amount
   on one path. Add the mirror direction and a case where the pot is fully consumed.
5. Reprice-into-walk. `reprice-or-swap` converting a resting position that then walks. The
   walk harness enters through `swap` only.
6. A real-Pyth run once a Hermes key is in hand: the same three harnesses with the source
   patches removed.
7. Audit. An aibtc bounty scoped to this contract versus the deployed v1 is open until
   2026-09-17, 21,000 sats: https://aibtc.com/bounties/mtkrbts96d961f6fae5e (design notes in
   README-markets-sbtc-stx-jing-v2.md).
