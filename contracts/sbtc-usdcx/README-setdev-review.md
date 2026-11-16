# SetDev review (2026-11-06): our decisions

Report: SetDev "Jing Swap sBTC/USDCx Design and Optimization Review", 2026-11-06.
Reproduction repo: github.com/Patotking12/jingswap-sbtc-usdcx-review (private; packages, tests, fork harness).

Headline: no unprivileged path takes a maker's deposit. Two Medium (F-01, DP-2), one Low (PR-1), the rest Info.
The main deliverable is two candidate market packages that cut reads by ~37-43% on full walks.

| ID | Severity | Finding | Decision | Status |
|---|---|---|---|---|
| F-01 | Medium | A seizure of credited proceeds (privileged burn / move) blocks rung members from withdrawing anything | Pay `min(owed + debt, cash)`, first come first served; the shortfall is kept as per-member `proceeds-debt`; deposits are refused while a deficit exists (u7017). No pro rata (too complex). No sBTC lock handling: locks only occur in the holder's own peg-out, then burn. | Fixed in rung templates, b614a8f. Not deployed: ships as `jing-buy-sbtc-<bps>-v2` / `jing-sell-sbtc-<bps>-v2`. On sBTC/USDCx the fix is mainly for USDCx (sell rungs' proceeds, mint-role burn); the sBTC side (buy rungs) gets it for symmetry. Not applied to the sBTC/STX rungs: neither STX nor sBTC will be burned out of our rung contracts. They are redeployed with the new sBTC/STX market only because they hardcode its principal (`MARKET`, `jing-sell-stx-rung-v2.clar` L62); no logic change |
| DP-2 | Medium | A bridge depeg is invisible to the contracts | Off-chain monitor every 2h (amber 3%, red 10%), Telegram + email to Rapha; red → multisig pauses the market from the Juice ceremony page. A pause blocks deposits, readmits and settlement; cancel, withdraw and limit changes still work. | Live: faktory-dao 27957ecb, stx-juice-fe bbfb112, jingswap-fe f4629f5. Runbook: README.md "Depeg response". Questions posted: stacks-sbtc/sbtc#2175, circlefin/evm-xreserve-contracts#16 |
| PR-1 | Low | A batch settlement can fill a resting order with a print older than the order | Agreed. Affects fixed-limit orders and 0 bps pegs in the batch (pegs of 1 bps or more are priced off the clearing price and are rolled). Taker swaps are already covered by the age rebate (20 bps to 30 s, then 1 bps/s). The fix keeps swaps atomic (taker's own order is exempt). Leftover: an order older than the print can still clear at any print under 80 s. Not an issue: it only fills orders that were resting at that price, and anyone can settle first with a fresher print. | Open: Package 2 at the next market redeploy |
| AUTH-1 | Info | One-step operator handover; README L23 hands `set-operator` back to the deployer key | Delete that step; the operator stays the multisig. No `contract-caller` check or two-step handover: the operator only signs calls to our own verified contracts from our own UI. | README fixed (sbtc-usdcx L23, stx-usdcx L30). Code part declined |
| RT-1 | Info, accepted | The manual router fallback (`swap-sbtc-for-usdcx` / `swap-usdcx-for-sbtc`) can run with no price limit | Keep as is: the whole call is bound by the caller's min-out (`(asserts! (>= out min-usdcx-out) ERR_MIN_OUT)`), which is all we rely on. | Accepted |
| W-4 | Question | `reprice-or-swap` walks a crossing 0 bps peg up to its cap, not its peg price | Walking to the cap is intended: reprice when you don't cross; when you do, swap and pay the rebate. | Stays Info |
| SC-1 | Info | Reads grow with the square of the book: removing a maker re-checks every list entry | Remove a maker by cutting its slot (`index-of?` + `slice?` + `concat`) in `drop-y` / `drop-x`. Up to ~52% fewer reads when a settlement rolls every maker, 20%+ on swaps with 17 or more makers per side. | sBTC/USDCx market committed 9c57da4; same change uncommitted in `markets-sbtc-stx-jing-v6-4` (+ formatted mirror) and `markets-stx-usdcx-jing-v6-4` |
| — | Info (ours) | A privileged burn or move of the market's own sBTC or USDCx leaves it short of that token. The batch pays everyone in one loop (`distribute-to-token-y/x-depositor`, market L2704/L2710), so one unpayable transfer makes the whole settlement fail. Cancels still return each user's own token: the other token never freezes, and only the last holders of the burned token come up short. | Accepted, no fix. It needs a new sBTC protocol contract or a new USDCx mint-role holder, and both tokens are governed by entities whose role is not to rug legitimate protocols. | Accepted |
| — | Info (ours) | Same as F-01 but on the input side: a rung pays a closed epoch's reserved input back with `try!` (buy rungs `reserved-uusdcx`, `jing-buy-sbtc-bps.clar` ~L739; sell rungs reserved sBTC; sBTC/STX buy rung `reserved-sats`). A privileged burn of the input token below the reserve blocks that member's exit, proceeds included. | Accepted, no fix: the reserve only holds the dust left when an epoch sells out (under `SOLD_OUT_DUST`, 0.01 USDCx; 0 on every live buy rung on 2026-11-15), and it needs a new sBTC protocol contract or a new USDCx mint-role holder. | Accepted |
| SP-8 | Info | `settle-token-{y,x}-readmit` relies on the parked balance, not the deposit core's no-live-deposit check | Skip: a parked maker cannot also hold a live deposit, so the extra check would never block anything (Pato's own proof, Appendix A.2). | Skipped |
| — | Package 1 | Whitespace strip before closing parens (~1 KB per market, more headroom under the 100,000-byte limit) | Applied to all three v6-4 markets, tokens unchanged | Done f37b874, 1e28035 |
| G1 | Guard | Keep any list from holding a principal twice (Appendix A.5) | Skip: a principal can hold only one position per side, so it is never listed twice (Pato proves the same in Appendix A.2). | Skipped |

## Packages

Measured on the token stream, with comments and whitespace ignored:

| | Change vs live `markets-sbtc-usdcx-jing-v6-4` |
|---|---|
| Package 1 (read cuts only, no behavior change) | ~1.4% of tokens, 53 hunks |
| Package 2 (Package 1 + PR-1 placed-at stamp) | ~3.5% of tokens, 93 hunks (PR-1 part: 40 hunks) |

Decision: TBD. "Before deploying Package 2" (report p. 13) lists five open items.

## Redeploy plan (after the whole review, not before)

1. New rungs `-v2` (F-01) for sBTC/USDCx and sBTC/STX: BE templates, deploy, `set-canonical`, retire the old seats, update FE `jingPairs.ts`.
2. Market redeploy with the chosen package, if any.
3. New sBTC/STX market with the SC-1 read cut (and PR-1 if Package 2 is chosen), so Fastpool and the MIA autoswap vaults bind to it from day one. Juice keeps the old market meanwhile (it still works, arbed), then moves: deploy a new `juice-sbtc-autoswap` bound to the new market, `propose-swap-vault` on `juice-pool-sbtc-signer`, `confirm-swap-vault` after the 4,032 burn-block cooldown (~28 days) once the old vault holds no resting or parked Jing orders.
4. Move the `jing-ladder-sbtc-usdcx-v1` owner from the SPV9 single key to the multisig.
