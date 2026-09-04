# markets-sbtc-stx-jing-v2: what changed since the deployed v1, and what is proven

Deployed reference: `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing` (v1,
batch auction). This file tracks `contracts/markets-sbtc-stx-jing-v2.clar` against it.
Last full re-run: 2026-09-04 on master 6e90025 (small-share at settle, price-ordered walk, parked makers).

## What is new versus v1

| Commit | Change |
|---|---|
| 521d775 / 273061a | Taker rebate: `swap` pays 20 bps on top of the 10 bps fee; the rebate is credited to the makers it filled, pro rata. Logged through the core. |
| 35bd979 | Maker/taker split. Public deposits are the maker path and refuse to cross live resting size (`u1022 ERR_MUST_USE_SWAP`). `swap` is the taker path: deposit, close, settle in one tx, fill-or-kill (`u1021`, `u1023`). |
| c958e6f / 928f44e | `reprice-or-swap-token-x/y`: retarget a resting limit; if the new limit crosses, the whole position converts to a taker fill under swap economics. |
| 6b90875 | `swap` refuses a caller who already rests size on that side (`u1024 ERR_HAS_RESTING_POSITION`); reprice or cancel first. |
| b7cad2a | `paused` now also gates `close-deposits` (`u1010`), so a paused cycle cannot be pushed from deposit into settle. (aibtc bounty finding.) |
| 0dc0b37 | Remainder cross. After the batch clears at the oracle mid, the ACTIVE swapper's leftover walks the opposite side's rolled book, each out-of-range maker paid at their own limit, bounded by the swapper's limit. Passive makers never cross. Crossed makers get 20 bps from the unspent rebate pot; fees 10 bps per leg. Every fill logged via `jing-core-v3.log-match`. Dust makers (below min deposit) are skipped. |
| 2bda263 | Dust refund: integer division can leave the walker a residual below the side's min deposit that no maker could ever fill. It is refunded to the swapper and the row cleared instead of reverting. At or above min it is a real partial fill and still reverts `u1023`. |
| ac2a789 | Review pass (line by line with Rapha): `cross-remainder-as-x/y` take the settle result's rolled amount and skip the walk fold when it is zero; one `let` per function; `initialize` and both `set-min-token-*-deposit` reject a zero min (`u1025 ERR_ZERO_MIN_DEPOSIT`) so the full-fill assert `rem < min` is sound; `cycle` rides in the fold tuple; `log-cycle` dropped (fills stamp `cycle - 1`); `execute-fill` math bound once. |
| 2989f6c | Small-share filter moved from `close-deposits` to settlement, after the limit filter, so a depositor is measured against the in-range size of their side. A swapper under 0.2% is no longer rolled (which emptied the walk and died `u1023`); the filter raises `taker-too-small` and settlement reverts `u1026 ERR_TAKER_TOO_SMALL`. Bigger same-side size settles first, the small taker swaps next cycle. (aibtc bounty F1.) |
| 9f852d4 | Price-ordered walk. Eligible makers (inside the walker's range, at or above min) are gathered with their limit and insertion-sorted once per walk, asks ascending, bids descending, ties in arrival order; the sorted principals feed the unchanged walk steps. (aibtc bounty F3.) |
| parked-makers | Parked makers. A full side used to bump its smallest entry; with limits, 50 out-of-range orders could hold every slot while nothing cleared. Now, when a side is full and a NEW in-range maker deposits, the farthest out-of-range entry is parked: escrow and limit kept in `token-x/y-parked` (map only, no list, no cap), off the cycle and the walk, refundable by its own `cancel-*` in any phase, repriceable by `set-token-*-limit`. `readmit-token-x/y (who, vaa)` moves it back when a slot is free; permissionless, gated only by the deposit's crossing rule (`u1022`), range not required since out-of-range makers are walkable. `u1027 ERR_PARKED` refuses a deposit from a parked maker; `u1028 ERR_NOTHING_TO_READMIT`. Park and readmit are `print` events, not core logs: the indexer must learn them. The smallest-size bump remains only when nothing is out of range or the newcomer is itself out of range. |
| 630a972 | `crossing` flag. Settlement's min-both-sides assert (`u1012`) killed any swap whose counterparties were all out of range at the mid. The flag is set only inside `swap` / `reprice-or-swap` before `close-deposits`, cleared after the walk, and lets settlement proceed with the maker side empty: zero clearing, everything rolls, the walk does the whole fill. Public settle calls never see it; a revert unwinds it. |

## What is proven, and where

| Layer | Result | Covers |
|---|---|---|
| `simulations/verify-markets-v2-regression-patched.js` | 22/22, [a1bb2e92](https://stxer.xyz/simulations/mainnet/a1bb2e922face08f6b3972b6f3f6ca8e) | v1 surface intact on v2: maker gate `u1022`, set-limit gate, reprice plain / guards / crossing FOK / oversize `u1023`, rebate bps read, pause on deposit |
| `simulations/verify-markets-v2-remainder-cross.js` | 110/110, [3c0e462f](https://stxer.xyz/simulations/mainnet/3c0e462fc96e20ec11d051b0a3177689) | S1 happy walk with exact payouts and rebate split; S2 only-out-of-range makers, walk runs and reverts `u1023` atomic (was `u1012` before the flag); S2b beyond-limit makers `u1023`; S3/S3b dust maker skipped, sub-min remainder refunded; S4 mirror direction; S5b/S5 cross-only oversize `u1023` / cross-only sized whole-walk fill (x-taker); S6 cross-only sized (y-taker); S7a/S7b `reprice-or-swap-token-y/-x` through the walk, mid leg + walk leg exact incl. ride/pending split, same-price tie keeps arrival order; S9 `u1025` on both setters and `initialize`; S8 flag never leaks (swap reverting in the walk leaves `crossing` false) and public `close-deposits` + `settle-with-refresh` on an all-out-of-range book `u1012` |
| `simulations/verify-markets-v2-multifill.js` | 43/43, [0508e9c9](https://stxer.xyz/simulations/mainnet/0508e9c95434bf7f7f0bf40dd7850ad2) | eight-maker walk in one tx, ordering, per-maker limit fills |
| `simulations/verify-markets-v2-bounty-fixes.js` | 127/127, [82d6d6d1](https://stxer.xyz/simulations/mainnet/82d6d6d1a3639c18b923649e334c3c14) | B1 1000 STX dead bid at u1 + 1.5 STX taker (0.15% of the raw side) fills by walking the +2% ask, whale limit-rolled intact; B2 in-range 1000 STX bid + 1.5 STX taker `u1026`, escrow and cycle unchanged, flag unwound; B3 1 STX fish survives public `close-deposits` (no roll at close), `cancel-cycle` after the threshold rolls all; B4 asks resting +2%, +5%, +1% in arrival order, +5.5% y-taker fills the +1% ask only, exact sBTC gain; B4b bids -5% then -1%, -5.5% x-taker fills the -1% bid only, zero residual; P1-P9 parked makers on a second instance with `MAX_DEPOSITORS` patched to u3: farthest out-of-range bid parked (map, totals, limit kept), out-of-range newcomer `u1013`, parked deposit `u1027`, parked reprice ok, readmit full `u1013`, readmit after a cancel ok, parked cancel refunds, readmit of non-parked `u1028`; x mirror parks the +10% ask, cancel refunds 3000 sats, top-up needs no park |
| `simulations/verify-markets-v2-gaps.js` | 56/56, [5e6eb07b](https://stxer.xyz/simulations/mainnet/5e6eb07bf205ee1f8abc1f658945db20) | the surface no other harness called: G1 operator role (`set-paused` / `set-treasury` / `set-operator` refuse a non-operator `u1011`, treasury and operator retarget, the old operator loses `set-paused` after handover, round trip); G2 pause on `close-deposits` (`u1010`), plus deposit, `swap` and plain `settle` while paused, `set-token-x-limit` NOT gated (note 9), unpause; G3 `settle` (no VAA) in deposit phase `u1003`, wrong trait `u1019`, `close-and-settle-with-refresh` dies `u1012` and its close is unwound (phase back to deposit), public `close-deposits` by an outsider, second close `u1016`, plain `settle` `u1012`, cycle and both makers unchanged; G4 `u1024` on a fork after `cancel-cycle` rolls the book: swap on the resting side reverts, deposit / limit / balance / cycle / flag untouched, a fresh taker on the other side passes the gate; G5 off-chain exhaustive: the crossed-maker rebate cap branch is unreachable (see 4 below) |
| the three harnesses above with `LIVE=1` | remainder-cross 110/110 [f288233f](https://stxer.xyz/simulations/mainnet/f288233f85034d859cd859bef59fc8aa), multifill 43/43 [05def9c8](https://stxer.xyz/simulations/mainnet/05def9c868442df5a35317b7dff1bcf3), regression 22/22 [78a5c2d8](https://stxer.xyz/simulations/mainnet/78a5c2d86939f7fafe534d94a3f026ce) | the EXACT deployed bytes (source fetched from chain, no patches) at the mainnet contract ids `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-core-v3` / `.markets-sbtc-stx-jing-v2`, real Wormhole verification through `pyth-oracle-v4` with a real dual-feed PNAU VAA (Granite, 2026-08-17, `simulations/fixtures/vaa-granite-8785969-btc-stx.hex`), forked at 8785968 where that VAA is 39 s old. Only the deploy block differs from mainnet (deployed 2026-09-02 at 8906186). Why not a tip fork: Hermes is key-gated and nobody has posted a Core update on Stacks since 2026-08-21, see `README-pyth-core-vs-lazer.md` |
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

1. `u1024` on a mainnet fork: DONE, `verify-markets-v2-gaps.js` G4 (swap on the resting
   side reverts `u1024`; position, limit, balance, cycle and `crossing` untouched).
2. `paused` on `close-deposits` on a mainnet fork: DONE, gaps harness G2 (`u1010` on
   close-deposits, deposit, swap and plain settle; `set-token-x-limit` still works; unpause
   then close ok). G1 covers the three operator setters, which no harness had called.
3. Walk cost at scale. Eight makers proven (43/43); the depositor list bound is 50. Accepted
   as-is by Rapha (linear in list length, `execute-fill` cost fixed per maker); no harness.
4. Rebate pot fully consumed: UNREACHABLE, so no fork case exists. The pot is charged
   20 bps on the taker's gross amount and the walk draws 20 bps on at most the net
   remainder, so `pending >= r` always and the `(if (> r pending) pending r)` cap in
   `execute-fill` is defensive. Checked exhaustively for every gross <= 20,000 units and
   every mid/walk split (gaps harness G5, max `r - pending` = 0). Crumb refunds stay
   proven by S1, S5, S7b.
5. Design decision, not a test: `reprice-or-swap-token-x/y` cannot take on a cross-only
   book. `would-take-as-x/-y` only looks for a live maker at or inside the mid, so with
   every counterparty out of range the call reprices and returns the zero tuple (S7a in an
   earlier harness revision). `swap` has no such gate and cross-only fills work there
   (S5, S6). Options: broaden `would-take-*` to "live maker within the taker's limit" (also
   makes `u1022` refuse deposits that would rest crossed against an out-of-range maker,
   i.e. the book never crosses passively), or keep and route cross-only intent through
   cancel + `swap`. Open with Rapha.
6. Real-Pyth run: DONE via `LIVE=1` (above) on a reused mainnet VAA. A tip-block run
   with a fresh VAA still needs a Hermes API key; so does operating the market at all.
7. Readmit order is the keeper's job. The contract readmits whichever parked maker is
   named first and has no ranking among them; a keeper should readmit the most in-range
   first (then longest parked). Kept permissionless so a parked maker can always readmit
   themselves if the keeper is down. Gating on the operator is an option if the ordering
   ever matters enough.
8. Dust refund is documented behavior (aibtc bounty F2): a swap fills what the book can
   take and any leftover under min deposit is refunded rather than reverted. On a swap
   close to min size the refunded part can be most of the order; that is a fill, not a
   failure.
9. Pause does not gate `set-token-*-limit`, the non-crossing branch of `reprice-or-swap`,
   `cancel-*` or `cancel-cycle` (aibtc bounty, Sonic Mast). Limit edits move no funds and
   nothing reads them while paused; cancels must always work. Informational, by design.
10. Audit. An aibtc bounty scoped to this contract versus the deployed v1 is open until
   2026-09-17, 21,000 sats: https://aibtc.com/bounties/mtkrbts96d961f6fae5e (design notes in
   README-markets-sbtc-stx-jing-v2.md). The bounty text cites 2bda263; the scope now also
   includes ac2a789 (review pass) and 630a972 (`crossing` flag).

Deployed 2026-09-02, block 8906186: `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-core-v3`
(tx 0a60b5a3…) and `…markets-sbtc-stx-jing-v2` (tx e87b8d64…). On-chain source is
byte-identical to the deploy copies below. Not yet verified in core nor initialized
(owner calls pending).

Deploy artefacts: `contracts/deploying/jing-core-v3.clar` and
`contracts/deploying/markets-sbtc-stx-jing-v2TODEPLY.clar` are comment-stripped,
clarinet-formatted copies (token-equivalent to master). faktory-dao `/api/bot/deploy-contract`
templates `jing-core-v3` then `markets-sbtc-stx-jing-v2` (Clarity 5, 0.1 STX). Post-deploy:
`jing-core-v3.set-verified-contract`, then `initialize` with non-zero mins.
11. `settle` and `close-and-settle-with-refresh` on a book that CLEARS. At a fixed oracle
   price this cannot happen: a maker at or inside the mid is refused at deposit (`u1022`,
   `would-take-as-*`) by the same comparison the settle limit filter uses, so a passive
   book never has both sides in range and every public settle ends `u1012` (gaps harness
   G3, S8). The clearing path needs the price to move between deposit and settle, i.e. two
   fresh VAAs, which means a Hermes key (or two historical Granite VAAs with the fork's
   synthetic clock walked to the second one). Everything else on those two functions is
   covered: phase gate `u1003`, trait gate `u1019`, pause `u1010`, atomic unwind of the
   close, `u1016` on a second close.
