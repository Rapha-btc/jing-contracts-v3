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

## Bounty review (AIBTC mw2oljg3)

### 1. A no-fill execute marks the deposit executed (valid, Low, no contract change)

Reported first by Frosty Narwhal. Ionic Zephyr F1 is a duplicate.

On a router err, `execute` refunds the full net (`spent` 0) but still sets
the row to `STATUS_EXECUTED`, so the deposit cannot be armed again (u4217)
and `get-order` reads as a swap that never happened.

Decision: v4 stays as deployed. Re-arming is not needed: the user has the
sBTC back and can swap it directly on the router from the normal UI,
without an arm.

Re-arming is also unwanted. The suggested fix (`STATUS_REFUNDED` that
`arm` may overwrite) would bring a refunded deposit back to life for any
other arm the user signed for it. A sponsor holding such a signed arm could
land it after the refund, at terms and a time the user no longer intends.
One row per deposit, forever, means every signed arm for a deposit dies
once one of them lands.

The
`btc-in-executed` print already carries `ok: false`, `code`, `spent: 0`
and `refund: net`, and the backend already uses it: since dcfe9f1c
(2026-10-30) faktory-dao `escrowStateOf` (`backend/server/utils/btc-in-print.ts`)
labels an executed event with `ok: false` as **refunded**, and the frontend
shows that label. Nothing to change.

### 2. A cancelled deposit cannot be armed again (rejected, by design)

Reported by Stellar Wisp. Same cause as item 1: the order row is never
deleted, so arming a cancelled deposit again fails with u4217.

Not a problem: cancel refunds the full net to the user, who can swap it from
the normal UI without an arm. v3 "allowed" re-arming only because it had no
deposit identity at all (orders by counter id, user-signed amount), not as
a feature. Re-arming would also revive any other arm the user signed for
that deposit (see item 1).

### 3. `arm` checks the recipient against `tx-sender` (rejected, out of scope)

Reported by Patient Reed. Super Orb is the same author and the same gist.

The claim: a contract the user calls can arm the user's deposit with bad
terms (slippage 9999, min-out 1) and use up the deposit's one slot.

Rejected. It needs the user to sign a transaction on an attacker's site that
lets their sBTC leave their wallet, and such a site can already take the
sBTC directly. Our UI calls the escrow directly. Checking `tx-sender` on a
token operation is the standard pattern.

The attack is also not clever. The attacker cannot change the price: execute
reads the mid from the fresh Pyth Lazer update the keeper passes, verified
by the market's `refresh-mid`. They control only the slippage bound, so the
gain would come from sandwiching a high-slippage fill. The router splits
that fill across several venues (Bitflow pools and the Jing book), so a
sandwich has to move every venue at once. That takes far more work than just taking the sBTC, which the same signature already allows.
(Our keeper does execute every armed order it sees, not only the ones we
sponsored, so a foreign arm would be executed. The conclusion is the same.)

### 4. v3 still unpaused (valid, Info, fixed on-chain)

Reported by Frosty Narwhal (I-1). Dedupe is per contract, so the same
deposit could also be armed on v3, which takes a user-signed amount. The
user signs each arm and each pulls real sBTC, so nothing can be stolen.
Fixed: v3 `set-paused true` in tx 0xeeaaf794…d521d (block 9422341);
`get-config` now reads `paused: true`.

### 5. Whole deposits only, wallet recipients only (rejected, by design)

Reported by Frosty Narwhal (I-2). v4 arms the whole minted amount, never part
of it. That is intended: the point of v4 is to arm exactly what the bridge
minted. A deposit whose recipient is a contract (pox-5, a smart wallet)
cannot be armed (u4216). That is by design too: a contract cannot sign the
pre-signed arm, so the walk-away flow cannot apply to it.

### 6. `execute` does not re-check `out >= min-out` (rejected, enforced by the router)

Reported by Mystic Compass. The escrow stores the user-signed min-out at arm
and hands it to the router, so the keeper cannot choose it:

```clarity
(contract-call? ROUTER_STX smart-swap-sbtc-for-stx net limit-price (some update) mid (get min-out order))
```

Both routers (fixed constants) measure `out` as the escrow's real balance
change and revert with u3002 when it is below min-out
(`swap-router-sbtc-stx-jing-v5-5` `smart-swap-sbtc-for-stx`,
`swap-router-sbtc-usdcx-jing-v5-5` `smart-swap-sbtc-for-usdcx`). A second
check in the escrow would be redundant.

### 7. Claims that do not hold

- **Ionic Zephyr F2, keeper-fronted Lazer fee left in the escrow:**
  documented design (`lazer-fee-ustx` comment). The live fee is u0, and the
  owner recovers any fronted STX with `sweep-stx`.
- **Sly Compass, anyone can cancel to grief:** execute is already blocked
  from cancel-height on, so cancel only does what was inevitable, and the
  fee is spent either way. The only effect left is item 2.
- **Super Orb, "1 Medium + 2 Low":** the gist contains only Patient Reed's
  item 3.
