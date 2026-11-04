# jing-btc-in-escrow-v4: simnet + Rendezvous

Tests for `contracts/btc-in/jing-btc-in-escrow-v2.clar`, which deploys as
`jing-btc-in-escrow-v4`. In v4, arm takes the deposit's `(txid, vout)` and
reads the minted amount from `sbtc-registry`. There is one order row per
deposit, with status open (u0), executed (u1) or cancelled (u2).

```sh
node tests/btc-in-escrow/build.mjs
npx vitest run -c vitest.btc-in-escrow.config.ts
npx rv tests/btc-in-escrow/rv jing-btc-in-escrow invariant --runs=100 --seed=1
```

Both projects keep their own `deployments/`, so the shared root simnet plan
is never touched.

## What is real and what is mocked

`build.mjs` copies the production source to `.build/` and rewrites exactly
five principals, each of which must match exactly once. The sha256 of the
source is printed on every build.

| Principal in source | Simnet suite | RV |
| --- | --- | --- |
| `SM3VDX…sbtc-token` | real (from `.cache`) | real (accounts hold genesis sBTC) |
| `SM3VDX…sbtc-registry` | **real**, deposits made via the real `sbtc-deposit complete-deposit-wrapper` called as the signer principal | `mock-registry` (anyone can complete a deposit once, same row shape) |
| routers v5-5 (STX, USDCx) | `mock-router-stx` / `-usdcx` | same |
| markets v6-4 (`refresh-mid`) | `mock-market-*` (settable mid; update `0xdead` → err u1002) | same |
| `SP120…usdcx` | `mock-usdcx` | same |

`mock-router` modes:

| Mode | Behaviour |
| --- | --- |
| 0 | fill (unsold sats, rate) |
| 1 | router err (rolled back) |
| 2 | overspend by `extra` |
| 3 | gross refund cycle (amount + extra) |
| 4 | over-report `out` |

It can also pull a Lazer fee in STX from the escrow.

Live router, market and Lazer behaviour is covered by the stxer harness
`simulations/verify-btc-in-escrow-v4.js` (267/267).

## Simnet suite (`escrow.test.ts`): 32/32

- **arm amount**: the order nets `minted - fee`. A user holding lots of
  other sBTC still parks only the deposit amount. Exact deltas, order row
  and print are checked. Same txid with another vout is a separate deposit.
- **One arm per deposit**: arming again on the same route, or on the other
  route, fails with u4217. So does re-arming after the order was executed or
  cancelled. A second arm with a fee moves nothing.
- **Recipient**: anyone other than the deposit recipient gets u4216, and
  nothing moves.
- **Unknown deposit**: an unknown txid, a wrong vout, a 31-byte txid, or a
  deposit the bridge has not completed yet all fail with u4215. Once the
  bridge mints, the deposit arms.
- **arm-by**: the arm must land strictly before `arm-by`. Landing at or past
  it fails with u4213, on both routes.
- **fee-sats cap**: `max` works and `max + 1` fails with u4201. The owner's
  cap ceiling is 10000 (10001 fails with u4201, a non-owner gets u4200). With
  cap 0, only fee 0 works. Fee ≥ amount fails with u4202. Fee = amount − 1
  leaves a 1-sat order.
- **Other arm guards**: paused fails with u4203, slippage 10000 with u4207
  (9999 is accepted). cancel-height is fixed at arm time, and the timeout
  bounds are enforced (u4208).
- **execute**:
  - The limit comes from the verified mid. On STX and USDCx fills the user
    gets `out` plus any unsold sats.
  - A router err refunds the full net.
  - A stale update fails with u1002 and the order stays open.
  - A non-keeper or revoked keeper gets u4204, and paused gives u4203.
  - Execute fails with u4211 at cancel-height and fills at cancel-height − 1.
  - Overspending fails with u4210 and other orders are untouched.
  - Gross outflow of exactly 2·net is allowed; 2·net + 1 aborts.
  - The Lazer fee is fronted by the keeper, its cap is enforced (u4214), and
    a router pull above the fee aborts. Leftover fee can be swept.
- **Twice**: a second execute fails with u4205. So do cancel after execute,
  execute after cancel, a second cancel, and any unknown key.
- **cancel**: before cancel-height it fails with u4206. At cancel-height a
  stranger can cancel and the refund goes to the user. Cancel works while
  paused.
- **Sweep**: only `held − parked` can be swept. One sat more fails with
  u4212, sweeping is owner-only, and parked orders still refund in full
  afterwards.
- **parked == Σ open net**: a mixed 6-round lifecycle (3 users, both routes,
  router modes, executes, cancels, repeats, donations, sweeps) re-derives the
  sum from the order rows after every step. It ends with parked = 0, held = 0,
  and every row executed or cancelled.

## Rendezvous (`rv.invariants.clar`)

Txids fold onto 6 values and vouts onto 2, giving 12 keys. That makes arms,
executes and cancels collide across the RV accounts. Direct calls with random
txids never hit a completed deposit, so these 12 keys are every order that
can exist. The wrappers are:

- `rv-deposit`
- `rv-arm` (both routes; fee, slippage and arm-by folded so the guards fire)
- `rv-execute` (random router mode, unsold, extra, stale update)
- `rv-cancel`
- `rv-donate-and-sweep` (sweeping stray + 1 must fail; sweeping exactly the
  stray must pass)

Each wrapper records the status before and after the call, plus the change in
parked. An illegal transition sets `rv-bad`.

Invariants:

- `invariant-parked-is-sum-of-open-net`: parked == Σ net of open orders
- `invariant-parked-is-held`: escrow sBTC ≥ parked
- `invariant-no-bad-transition`: the only status changes are none→open,
  open→executed and open→cancelled. A terminal status never changes. Execute
  or cancel only succeeds on open rows. Each call moves parked by exactly
  ±net, or by 0 on failure. Spent ≤ net.
- `invariant-status-domain`: status ∈ {0, 1, 2} and net > 0
- `invariant-no-stray-output`: no STX or USDCx is left in the escrow (the
  Lazer fee is 0 here)

## Findings

No contract bug found. Tested source sha256 `7a579411…` (HEAD abedfac; comment-only vs the deployed bytes). RV: 100 runs, seed 1, 0 invariant failures; `node tests/btc-in-escrow/rv-replay.mjs` shows the wrappers reach arm / execute / cancel success paths.

One note on error codes: when a user with no other sBTC re-arms a deposit
that is already armed with `fee-sats > 0`, the call fails with the token's
`u1` (fee transfer) instead of u4217. That's because `map-insert` runs after
the fee transfer. Nothing moves, so the result is safe, but a client keying
on u4217 should also accept u1. The test `a user with no other sBTC
re-arming…` pins this behaviour.
