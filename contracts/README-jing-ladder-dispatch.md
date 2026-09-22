# One-call ladder deposits and withdrawals

`jing-ladder-dispatch.clar` allocates a user's funds across 1–10 currently
seated band rungs, or withdraws the user's unsold positions from 1–10
registered rungs, in one transaction. Deploy `jing-rung-deposit-trait.clar`
under the same principal first. Both contracts are simulation-verified source; they have not been deployed on-chain.

Both deposit and withdrawal entry points use one `rung-trait`, defined in
`jing-rung-deposit-trait.clar`. It requires all three rung methods: `deposit`,
`withdraw`, and `claim`. The helper still exposes no batch-claim function.
The historical Stxer walkthrough below uses the original separate traits and
boolean responses. The current response interface is documented next.

## Current response interface

All six rung templates now return structured receipts. Trading, transfers,
share mint/burn calculations, held-fund behavior, and sold-out withdrawal
errors are unchanged. `settle-proceeds` already returned the amount paid;
deposit and withdrawal now retain that value for their receipts.

```clarity
;; Direct rung deposit. amount uses sats for buy, micro-STX for sell.
(ok { amount: uint, shares: uint, epoch: uint,
      stx-paid: uint, sbtc-paid: uint })
;; Direct rung withdrawal or claim. Actual transfers, not requested caps.
(ok { stx: uint, sbtc: uint })
```

`shares` means shares minted by this deposit, not the user's total shares.
The rung's held balance remains available in its deposit log and `get-state`;
it is not duplicated in the return value.
`stx-paid`/`sbtc-paid` are gross proceeds paid during a deposit, not net wallet
changes after deducting its input. STX fields always use micro-STX and sBTC
fields use satoshis. Buy-rung claims return `sbtc: u0`; sell-rung claims
return `stx: u0`, because claims pay proceeds without withdrawing unsold input.

The helper preserves allocation order in a `positions` list and totals payouts:

```clarity
;; deposit-buy / deposit-sell
(ok { amount: uint, rungs: uint, stx-paid: uint, sbtc-paid: uint,
      positions: (list { rung: principal, amount: uint, shares: uint,
        epoch: uint, stx-paid: uint, sbtc-paid: uint }) })
;; withdraw-buy / withdraw-sell
(ok { rungs: uint, withdrawn: uint, stx: uint, sbtc: uint,
      positions: (list { rung: principal, stx: uint, sbtc: uint }) })
```

These are schema sketches: each list has a maximum of ten entries. A row is
this call's receipt, not a full account-position snapshot. Shares and epochs
remain per-rung; only actual payouts are summed. `rungs` and
`withdrawn` remain counts. Errors still roll the whole batch back. Tuple
success responses replace `(ok true)`; `(ok false)` no longer satisfies the
trait, so helper error codes 7107/7109 are retired, not reassigned.

This is a breaking interface change for clients and traits that expected
boolean results. The deployed ladder, v6-2 market, and v5-2 router do not
consume these rung responses and need no changes. The final rung source has
a new code hash: approve that version as canonical before registering it.

### Receipt verification

The latest run uses the final reviewed contracts from commit `60843e3`, with
no held-balance field in deposit responses. Held balances remain in rung logs
and state. All changes described here are simulation-only; no deployments or
user transactions were broadcast.

- [Latest Stxer run: 1,152/1,152 checks, 789 steps](https://stxer.xyz/simulations/mainnet/721d70f932ec18f595ec2c12b7c50534).
  Returned payouts are compared to actual wallet deltas; per-rung payout sums,
  order, deposit amounts, minted shares and epochs are checked.
  Steps **109/164** show ten-rung deposits; **403/409** show top-ups paying
  nonzero accrued proceeds (23.112555 STX / 3,572 sats); **685/701** show
  three-rung withdrawals; **779** exits both replaced/retired positions.
- [Earlier pre-top-up run: 1,148/1,148 checks](https://stxer.xyz/simulations/mainnet/d49a00d3281d82cba59e235f3d1c6e00)
  also checks withdrawal receipts that pay both unsold input and accrued
  proceeds. It predates the top-up scenarios and held-field removal; use the
  latest run for the final ABI. The intermediate 1,182-check run
  `b411bac022f006c2f0e95b2c9e6c075e` is also superseded by the latest run.
- **122/122 local dispatcher checks** pass with exact receipt comparisons,
  including capped withdrawals and rollback after a later transfer errors.
- **2,800 RV property trials, rerun on the final response interface:**
  2,263 passed, 537 discarded, zero failures.
  Buy/sell core-spread: 500 trials each, seeds 210925/210926; each fixed and
  market-spread rung: 200 trials, seed 210927; dispatcher: 1,000 trials,
  seed 210925. New properties compare receipts with actual transfers and
  rung state. Mocks and the earlier fuzz scope limitations still apply.

Current-run transaction shortcuts (one-based steps, including read-only calls):

| Scenario | Step(s) |
| --- | --- |
| Deposit across ten buy rungs | [109](https://stxer.xyz/simulations/mainnet/721d70f932ec18f595ec2c12b7c50534/txid/0x74aedde877a92f021902d993b63457ba0286f0c0d8337032ff8cde56d3d1a061) |
| Deposit across ten sell rungs | [164](https://stxer.xyz/simulations/mainnet/721d70f932ec18f595ec2c12b7c50534/txid/0x4182c63ff57240420a874115a582cc9d75d5ddfeda41aa640d03bf1d47eaa619) |
| Takers fill five rungs and part of the sixth | [239](https://stxer.xyz/simulations/mainnet/721d70f932ec18f595ec2c12b7c50534/txid/0x3cfc67fcbe23790bdbee1f20e83429b0971531c89eec6443d2b0a4312d788cd5), [273](https://stxer.xyz/simulations/mainnet/721d70f932ec18f595ec2c12b7c50534/txid/0x15f9a8aae2a74690bcab63debdf31e081bfcc82bcb59d55f0ff9f9c3013ba10e) |
| Top-up deposits report accrued STX/sBTC payouts | [403](https://stxer.xyz/simulations/mainnet/721d70f932ec18f595ec2c12b7c50534/txid/0x4382fd5da783798b42dd53a8e2eda0e32663de8104861e8144ccf8600c60d08c), [409](https://stxer.xyz/simulations/mainnet/721d70f932ec18f595ec2c12b7c50534/txid/0x8efbbe658ef278a51ea845da5dbd839648165c451b5c1b2b06bcf707d3b77395) |
| Withdraw three buy/sell positions in one call | [685](https://stxer.xyz/simulations/mainnet/721d70f932ec18f595ec2c12b7c50534/txid/0x738bbc5dda0f064a8043f8a9e91bd9b58bcf50981a6e0e6ec01260d191de1e16), [701](https://stxer.xyz/simulations/mainnet/721d70f932ec18f595ec2c12b7c50534/txid/0x9c8fcadc630065892e455f1d9d7ee919b627e7054c35ff9a8ea8b9fa4e85e947) |
| Replace funded seat; verify funds retained | 744–751 |
| Change protected spread 90 → 100 | 771–775 |
| Withdraw replaced and retired positions together | [779](https://stxer.xyz/simulations/mainnet/721d70f932ec18f595ec2c12b7c50534/txid/0x46176e1039544f143a6445a6b5ba129fdca52c5c92fa5d796c3de76c7e236d69) |

Older rung lifecycle scripts have been adapted to the tuple response shapes
and syntax-checked; they were not all rerun on Stxer for this revision. The
latest fork result above is from `verify-v6-2-ten-rung-ladder.js`.

Run `node simulations/verify-v6-2-ten-rung-ladder.js` for the updated fork
suite and `npm run verify:ladder-dispatch-local` for local checks. RV receipt
properties are appended to each rung's existing invariant file; build with
`RV_MARKET_VERSION=v6-2 bash tests/rv/build.sh markets-sbtc-stx-jing-v6`, then
`bash tests/rv/build.sh <rung>` and `npx rv . <rung> test --runs=500 --seed=210925`.
For the helper, run `node tests/rv/build-dispatch.mjs`, then
`npx rv . jing-ladder-dispatch test --runs=1000 --seed=210925`.

| Function | User intent | Input units |
| --- | --- | --- |
| `deposit-buy` | Buy STX by supplying sBTC to buy rungs | satoshis |
| `deposit-sell` | Sell STX by supplying STX to sell rungs | micro-STX |
| `withdraw-buy` | Withdraw unsold sBTC from buy-rung positions | satoshis |
| `withdraw-sell` | Withdraw unsold STX from sell-rung positions | micro-STX |

The two deposit functions accept:

```clarity
(total uint)
(allocations (list 10 { rung: <rung>, amount: uint }))
(update (buff 8192))
```

The frontend chooses equal or weighted amounts and passes the explicit total.
Every allocation must be positive, targets must be distinct and currently
seated on the correct side, and amounts must add up exactly to the total.
The deployed ladder is the authority for current seats; retired, replaced,
unseated, and wrong-side targets are refused. The helper trusts the ladder's
owner-controlled canonical code gate, just as direct rung deposits do.

Example arguments with `@stacks/transactions`:

```js
import { Cl } from '@stacks/transactions';

// Read these principals from the deployed ladder before constructing the call.
// Do not assume a spread still belongs to the original deployment address.
const rungs = currentBuyRungPrincipals; // 10 entries, 0/10/.../90 bps
const amounts = Array(10).fill(20_000n); // 200,000 sats total
const functionArgs = [
  Cl.uint(200_000n),
  Cl.list(rungs.map((principal, i) => {
    const [address, name] = principal.split('.');
    return Cl.tuple({
      rung: Cl.contractPrincipal(address, name),
      amount: Cl.uint(amounts[i]),
    });
  })),
  Cl.bufferFromHex(signedLazerUpdateHex),
];
// Call jing-ladder-dispatch.deposit-buy with these arguments.
// Return includes amount: u200000, rungs: u10, payout totals, and 10 receipts.
```

Use integer arithmetic for splits. For an equal split, distribute any division
remainder explicitly so the allocations still sum to the user's total. Each
leg must also satisfy its rung's own deposit minimum (currently 100 sats for
buy rungs and 100,000 micro-STX for sell rungs).

The two withdrawal functions accept:

```clarity
(requests (list 10 { rung: <rung>, amount: uint }))
```

Each positive amount is a per-rung maximum. A request at or above the user's
remaining unsold position exits that rung fully; a smaller request withdraws
part of it. Each rung performs its normal `sync`, pays accrued proceeds, caps
the request to the user's balance, and sends assets directly to the user.
Withdrawals accept any correctly sided rung in the ladder's historical
registration map, including retired and replaced rungs. This preserves exit
rights after a seat changes. A sold-out position has no unsold inventory and
returns the rung's normal `ERR_NO_POSITION`; claim it through the rung instead.
If any withdrawal fails, every earlier withdrawal in the same call rolls back.

The helper does not use `as-contract`, take custody, mint shares, or charge fees.
Each rung pulls the input directly from the user and credits the user's own
position. Users can use this helper's batch withdrawal or call a rung's normal
`claim` and `withdraw`. There is no helper-owned position to unwind. Direct
calls are required:
`tx-sender` must equal `contract-caller`. A contract wallet can call under its
own contract identity; forwarding an external user's identity is refused.

Validation happens before any deposit. If any rung returns an error,
the entire dispatch reverts, including earlier deposits and their
transfers. Rung errors are propagated unchanged. Helper errors:

| Error | Meaning |
| --- | --- |
| `u7101` | Empty allocation |
| `u7102` | Zero total or allocation sum differs from total |
| `u7103` | Zero allocation amount |
| `u7104` | Target is not currently seated on the requested side |
| `u7105` | Duplicate target |
| `u7106` | Indirect call retaining another sender's identity |
| `u7108` | Withdrawal target is unregistered or registered on the wrong side |

## Allocation is not market admission

Successful rung deposits may stay **held** in the rung rather than resting on
the market. This is existing rung behavior for admission restrictions, invalid
or stale oracle updates, and amounts below the market's minimum. The helper
preserves it. Read `get-position(user)` and `get-state` after confirmation and
display held versus resting amounts. A keeper may subsequently `push` held
funds with a fresh update.

In the verified fork, depositing the buy ladder first left sell rungs
0/10/20/30 held under v6-2's 40 bps admission rule; sell-40 rested at that
particular integer price. The exact 40 bps boundary is rounding-sensitive.
Once a taker consumed the buy ladder's inner rungs, keeper pushes admitted the
held sell rungs. Seating 10 rungs per side does not guarantee 10 live offers
per side at every moment.

Use deny-mode wallet postconditions limiting input-asset spend to `total`.
Shares and proceeds belong to the user; no postcondition should assume the
helper receives the input. These simulations used zero transaction fees and
did not validate a frontend-generated postcondition set.

## Historical Stxer walkthrough: exact steps (original boolean interface)

Open the [verified 517-step simulation](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c). Step numbers below are
**one-based**, matching Stxer's UI, and include both transactions and read-only
evaluations. The suite performs **538 assertions** over those 517 steps.
Clickable transaction numbers open Stxer's debugger for that exact transaction.

| Scenario | Stxer step(s) | What to inspect |
| --- | --- | --- |
| One call into ten buy rungs | [79](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0xb28ed4406357f12eefd1c41607e0ea3e85f3546d5cde38db45edd5fae86381b6) | `deposit-buy`: 200,000 sats total, 20,000 per rung; returns `amount u200000, rungs u10`. |
| One call into ten sell rungs | [120](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0xd92d0dfd97e881ce48c7f9f18664f5383c1efd53787e926a935a2ba143c020e9) | `deposit-sell`: 200 STX total, 20 per rung; returns `amount u200000000, rungs u10`. |
| STX taker consumes buy ladder | [183](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0x97adc2fdd0d4d77192e51a4cebc35b633708496a6d4236ebe88e6e448540f568) | Consumes 0/10/20/30/40 fully and part of 50. The 0 rung clears in the mid batch; match events walk +10, +20, +30, +40, +50 in order. |
| Verify buy partial-fill remainder | 197–202 | 0 through 40 have zero remaining; 50 retains **11,458 sats**. |
| sBTC taker consumes sell ladder | [217](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0xe4ff773c17748be836de0332a3ebdf5096092e51d9540deb9613b4274899f238) | Consumes 0/10/20/30/40 fully and part of 50. The 0 rung clears in the mid batch; match events walk −10, −20, −30, −40, −50 in order. |
| Verify sell partial-fill remainder | 231–236 | 0 through 40 have zero remaining; 50 retains **11.456121 STX**. |
| Later takers reach the outer rungs | [315](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0x80d98ffe2e29800c1caa3a179c916f60aab028f9bd5687a5fa2013eefb3188ed), [331](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0xa07670a2ae557eca4f0532421bf93640b4fe2c7a1088a68d01f561065383fb44) | Both sides: consume the remainder at 50, all of 60/70/80, and part of 90. |
| Batch-withdraw three buy rungs | [447](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0x0cb1ecf71f37fed50a3ccd11b3eb1dabf6419d357f8208f87f13b8b69b753e4a), [448](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0x91dfe6db9d6ca2df0260db9a9fc25521c1ddac1fa92f579a06cd73dc4956cb84) | Seed 0/10/20, then one `withdraw-buy` call clears all three positions. Steps 449–451 verify zeroed user positions. |
| Batch-withdraw three sell rungs | [452](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0xed99da52b45d659db7c42c29ebc3e62d53d33c491816b42c2793f95c3c425e98), [453](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0x8eb9564a9bf81f0db4498e9576f20b4764f0740e12e16ed06c5d45d0feb949ae) | Seed 0/10/20, then one `withdraw-sell` call clears all three positions. Steps 454–456 verify zeroed user positions. |
| Fund the seat before replacement | [486](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0x24340546daa9fc100c1f1f96658a06ec5b5d2e1b3b21f1aa532f8bcdbfcc6983), 487 | Original buy-90 has **20,000 sats** resting. |
| Register replacement at the same spread | [489](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0x175bee82ae41740732ae93b5868ea19b96921f886fdc01afc997b99aedf1b61b) | Owner initializes the new canonical-code buy-90 contract under a different deployer, replacing the protected seat. |
| Verify old funds and new seat | 490–496 | Count stays 10; old rung remains registered with **20,000 sats** resting; protection transfers to the replacement. |
| Fund the new seat through helper | [498](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0x02c97c0bcc9ad37bb8272e10ba8dfafbd1a9590b4fd83e5b19fb43a110399707) | One helper call deposits 1,000 sats into the current replacement. |
| Change the protected spread 90 → 100 | [503](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0x5125ede28a9ebdbf518e3d243bd96226b03efefaa9df4c9affedced44eb55041), [504](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0x30bc87f170fd2d0aca4750ed689e9a0fff5d04154e6276d502c61530821f3dd0), [505](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0xc0960ea95091223caf542353cf7a48728b41adecc15832c47d87436f9848e117) | Retire 90, seat 100, then sync the market. Steps 506–508 verify ten seats and the new protection. |
| One-call exit from replaced and retired rungs | [509](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c/txid/0xcd1f2fec81254929fdb32e4e3d4f95910f3ec6e06c4348daf0eb26553ce87126) | A single `withdraw-buy` exits both historical buy-90 positions. Steps 510–512 verify both positions cleared and exact fund preservation. |
| Restore original 90 bps seat | 513–517 | Retire 100, re-seat original 90, sync; original is protected again and count remains 10. |

The original and replacement positions above belong to the **same test user**.
Replacing a seat does not transfer that user's assets or positions to the new
contract. In the debugger, inspect nested calls and events to see all ten rung
deposits inside steps 79/120 and the individual matches inside each taker swap.
For the partially consumed outermost rung, “partial” describes that maker's
remaining offer: the **taker's swap still fills its requested amount**, subject
only to the contract's permitted dust/rebate refunds.

## Validation and reproduction

### Historical Rendezvous fuzz results — before receipt responses

Ran the two miner-band rung templates used by this ladder against a local
**v6-2** market build, the ladder registry, and the dispatcher. Across seven
RV runs: **4,300 trials, 3,982 passes, 318 discarded property trials, zero
reported failures or logged runtime panics**. Discarded trials did not satisfy
the property preconditions; they are not counted as passes.

| Target | Mode | Seed | Trials | Passed | Discarded |
| --- | --- | --- | --- | --- | --- |
| `jing-buy-stx-core-spread` | Invariants | 210921 | 1,000 | 1,000 | 0 |
| `jing-buy-stx-core-spread` | Properties | 210923 | 500 | 349 | 151 |
| `jing-sell-stx-core-spread` | Invariants | 210922 | 500 | 500 | 0 |
| `jing-sell-stx-core-spread` | Properties | 210922 | 500 | 333 | 167 |
| `jing-ladder` | Invariants | 210924 | 500 | 500 | 0 |
| `jing-ladder-dispatch` | Properties | 210921 | 1,000 | 1,000 | 0 |
| `jing-ladder-dispatch` | Invariants | 210922 | 300 | 300 | 0 |

The rung checks cover share totals, asset backing, proceeds and closed-epoch
indexes, withdrawal bounds, deposit/withdraw drain resistance, claim/sync
idempotence, guard prices, and seat protection. The buy invariant run executed
128 successful taker calls and 31 settlements; the sell run executed 7 taker
calls and 14 settlements. Multiple RV accounts share persistent state.

The dispatcher properties randomize side, user, batch size, weighted amounts,
and invalid-input/failure cases. They verify 1–10-rung round trips, retired-rung
exits, duplicate/zero/wrong-side targets, incorrect totals, and exact wallet
and per-rung credit/balance rollback when a later rung errors or returns
`ok false`. The invariant run checks custody, fixture backing, and user
ownership; it executed 329 successful public calls, including 287 scenario
driver calls, so it exercises state changes rather than only rejected inputs.

Reproduce all seven runs from the repository root:

```sh
npm run rv:ladder-suite
# Recheck saved logs and regenerate the JSON summary without rerunning:
node tests/rv/run-ladder.mjs --summarize
```

Logs and `rv-ladder-summary.json` (including source hashes) are written under
`simulations/results/`. The runner rejects incomplete reports, failed checks,
logged runtime errors, and invariant runs without successful calls, even when
the RV process exits zero. RV samples invariants after random sequences;
these trial totals are not the number of individual contract calls.

**Scope:** these are local RV tests, not new Stxer simulations. Rung tests use
the existing mock token/oracles/registry, pre-initialized rungs, and a smaller
market queue; `RV_MARKET_VERSION=v6-2` selects v6-2 source for the local market
dependency named `v6-market`. The dispatcher uses ten STX-backed fixtures on
both sides to isolate routing and rollback. The registry suite substitutes
the code-hash gate. Production contracts were not changed. Real sBTC,
signatures, deployed dependencies, and actual code-hash gates remain covered
by the separate Stxer run above. The fuzz results do not establish a specific
number of complete epoch closures or replace a dedicated second-epoch trading
scenario; the epoch coverage boundary below still applies.

During harness development, private-function calls incorrectly bypassed the
public response rollback boundary. The properties now invoke the public
deposit/withdraw functions before inspecting rollback. An initial dispatcher
invariant run had no successful mutations; it was superseded by the driven
run in the table. Neither preliminary run is included in the totals above.

### Epoch closure and continuation: verified scope

The verified run checks that fully consumed rungs at 0–80 bps on both sides
advance to `epoch u1` with `total-shares u0`. Buy-side closure checks are steps
347/352/357/362/367/372/377/382/387; sell-side checks are
398/403/408/413/418/423/428/433/438. Subsequent calls claim the old positions,
check that the user positions are cleared, and reject double claims.

After those closures and claims, steps **447–451** deposit into buy rungs
0/10/20 again and withdraw all three in one call. Steps **452–456** repeat
this on the sell side. These checks demonstrate that deposits and withdrawals
continue after a rung epoch closes.

The run does **not** execute a second taker sweep after those new deposits,
close a second trading epoch, or test an old unclaimed position overlapping
a new user's position in the next epoch. Rung epochs and the market's
`current-cycle` are separate state; these assertions do not constitute a
dedicated market-cycle rollover test. No failures were found in the covered
scenarios; this is not a claim that all epoch transitions are bug-free.

### Full-fill requirement

Steps **263** and **279** attempt oversized taker swaps and return
`(err u1017)` (`ERR_PARTIAL_FILL`). Steps 261–265 and 277–281 show unchanged
input and output balances across each rejected swap. A successful taker must
fill its requested amount, subject to permitted dust refunds; leaving part
of the last maker rung unconsumed is compatible with that requirement.

### Running the checks

Run from the repository root:

```sh
node simulations/verify-ladder-dispatch-local.js
node simulations/verify-v6-2-ten-rung-ladder.js
```

- Local deterministic tests: **122/122**. Weighted ten-way splits, user
  attribution, invalid totals, duplicate/zero/wrong-side/retired targets,
  overflow avoidance, indirect calls, and rollback after a later leg fails
  or returns false after transferring assets. It also covers partial/full
  three-rung withdrawals, retired-rung exits, and atomic withdrawal rollback.
  Fixtures use STX on both sides to isolate the helper; real sBTC and STX are
  covered by the fork.
- [Stxer fork: **538/538 checks**](https://stxer.xyz/simulations/mainnet/20bba9456f560023c8ea7a1d923f676c).
  Uses the deployed `jing-ladder` and `markets-sbtc-stx-jing-v6-2`, actual
  token contracts and signed oracle update. Existing market orders are
  cancelled only in the fork to isolate the requested ladder.
- The fork deploys 20 rungs, the trait, and this helper. It retargets every
  market reference in the existing rung templates from v6 to v6-2 before
  deployment. **The original rung source files still target v6**; they must
  be retargeted consistently when preparing actual v6-2 rung deployments.
- One helper call deposits 200,000 sats across ten buy rungs; another deposits
  200 STX across ten sell rungs. Takers fully consume five rungs and part of
  a sixth, then later consume more of the ladder in price order. Oversized
  swaps return `u1017` with no balance changes. Claims, withdrawals,
  double-claim prevention, and exact asset conservation are checked.
- One `withdraw-buy` and one `withdraw-sell` each clear three current rungs;
  another one-call withdrawal clears both a replaced rung and its retired
  replacement after the protected spread changes.
- Seat tests replace a funded 90 bps rung under a different deployer, retain
  the original user's withdrawal rights, reject stale helper allocations,
  change the protected spread to 100 bps, then restore the original seat.
  Seat changes do not move funds or cancel the old orders.

The simulation scripts write raw fork output and a structured report into the
ignored local `simulations/results/` directory.
The first exploratory run, `5c5e9a109d800f8f0e2553cbc8899cbe`, is retained for
traceability; its oversized-swap expectations were incorrect. Use the green
run above as the verification result. These are fork simulations, not live
deployments or a full-book/worst-case execution-cost benchmark.
