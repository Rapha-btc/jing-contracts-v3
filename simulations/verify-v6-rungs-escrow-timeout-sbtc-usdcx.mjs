// verify-v6-rungs-escrow-timeout-sbtc-usdcx.mjs - port of
// verify-v6-rungs-escrow-timeout.js (24-hour rung recovery) to the sBTC/USDCx
// v6-5 set. Exact template bytes, fork pinned before the v6-5 market went
// live, LIVE jing-core-v6 / jing-ladder-sbtc-usdcx-v1.
// Rungs: band only (unseated jing-{sell,buy}-sbtc-<20|30|40>-v2, one bps per
// mode); the original's fixed and peg rungs (2 of 3 kinds per mode x side)
// have no sBTC/USDCx equivalent and are not ported.
// x = sell-sbtc (sats, scale 1), y = buy-sbtc (uUSDCx, scale 2000: 6 USDCx
// initial, 12 escrow, 1 held, 2 partial; all over the rungs' 0.1 USDCx minimum).
// All band-rung deposits happen before synthetic time advances; exits read no DIA oracle.
// Exits: these rungs have escrow-for (an exit covered by held + the live order
// skips the pending escrow; the original's old rungs settled it on every exit),
// so the timed-out / refused exit is member B's (escrow > held + live) and A
// exits after it (partial, then the rest). B's timed-out exit cancels the
// rung's whole market position (pending escrow + live order), as A's did in
// the original; A is then paid from what the rung holds.
// Run: node simulations/verify-v6-rungs-escrow-timeout-sbtc-usdcx.mjs
import { uintCV, someCV, noneCV, boolCV, bufferCV } from '@stacks/transactions';
import { getSimulationTip, submitSimulationSteps } from 'stxer';
import {
  S, DEP, CORE, LADDER, principal, mk, keeper, ok, update, finishPhase, ev, tx,
  balance, pending, live, parked, depArgs, settleArgs, freshAfter, event, fund, deployCode,
  rungName, rungBytes, bandSide, heldField, startSim, deployMarket, printHashes, stringAsciiCV,
} from './_v6-3-port-plumbing-sbtc-usdcx.mjs';

async function main() {
  printHashes();
  const owners = await startSim();
  const MARKET = await deployMarket(owners, undefined, undefined, { sync: true });
  const stamp = Number((await ev('fork clock', MARKET, 'stacks-block-time', v => /^u[0-9]+$/.test(v))).slice(1));
  const first = await freshAfter(stamp), mid = first.px * 100000000n / first.py;
  console.log(`  mid ${mid}`);
  for (const side of ['x', 'y']) {
    const who = mk(side === 'x' ? 601 : 602), amount = side === 'x' ? 6000 : 12000000;
    await fund(side, who, amount);
    await tx('seed opposite book', who, MARKET, `deposit-token-${side}`, depArgs(side, amount, side === 'x' ? mid * 2n : mid / 2n), `(ok u${amount})`);
    if (side === 'y') await tx('admit seed', keeper, MARKET, `settle-token-${side}-deposit`, settleArgs(side, who, first), `(ok u${amount})`);
  }
  const fixtures = []; let serial = 610;
  for (const mode of ['no-update', 'market-paused', 'core-paused']) for (const side of ['x', 'y']) {
    const scale = side === 'x' ? 1 : 2000;
    const a = mk(serial++), memberB = mk(serial++), initial = 3000 * scale, escrow = 6000 * scale, held = 500 * scale;
    const n = ['no-update', 'market-paused', 'core-paused'].indexOf(mode), bps = 20 + 10 * n;
    const name = rungName(side, bps), rung = `${DEP}.${name}`;
    const label = `${name}/${mode}`, positionField = side === 'x' ? 'sbtc' : 'stx', hf = heldField(side);
    await deployCode(name, rungBytes(side));
    await tx(`${label}: canonical`, owners.ladder, LADDER, 'set-canonical', [stringAsciiCV(bandSide(side)), principal(rung)], '(ok true)');
    await tx(`${label}: init`, owners.ladder, rung, 'initialize', [uintCV(bps), boolCV(false)], '(ok true)');
    await fund(side, a, initial + held); await fund(side, memberB, escrow);
    await tx(`${label}: A deposits`, a, rung, 'deposit', [uintCV(initial)], ok);
    let toSettle = initial;
    if (mode === 'no-update') {
      const part = 1000 * scale;
      await tx(`${label}: normal young exit settles then pays exactly`, a, rung, 'withdraw',
        [uintCV(part), someCV(update(await freshAfter(stamp)))],
        side === 'x' ? `(ok (tuple (sbtc u${part}) (stx u0)))` : `(ok (tuple (sbtc u0) (stx u${part})))`);
      await ev(`${label}: normal exit clears pending and keeps live remainder`, MARKET,
        `(and (is-none ${pending(side, rung)}) (is-eq ${live(side, rung)} u${initial - part}))`, 'true');
      await ev(`${label}: normal exit wallet exact`, MARKET, balance(side, a), `u${held + part}`);
      await tx(`${label}: restore initial position`, a, rung, 'deposit', [uintCV(part)], ok);
      toSettle = part;
    }
    await tx(`${label}: normal young placement`, keeper, MARKET, `settle-token-${side}-deposit`, settleArgs(side, rung, await freshAfter(stamp)), `(ok u${toSettle})`);
    await ev(`${label}: live before top-up`, MARKET, live(side, rung), `u${initial}`);
    await tx(`${label}: B submits pending top-up`, memberB, rung, 'deposit', [uintCV(escrow)], ok);
    await tx(`${label}: A's second deposit remains locally held`, a, rung, 'deposit', [uintCV(held)], ok);
    await ev(`${label}: live + pending + held exact`, MARKET, `(and
   (is-eq ${live(side, rung)} u${initial})
   (is-eq (get amount (unwrap-panic ${pending(side, rung)})) u${escrow})
   (is-eq (get submitted-at (unwrap-panic ${pending(side, rung)})) u${stamp})
   (is-eq ${balance(side, rung)} u${held})
   (is-eq (get ${hf} (contract-call? '${rung} get-state)) u${held}))`, 'true');
    await ev(`${label}: B starts with exact shares`, rung, `(get shares (get-position '${memberB}))`, `u${escrow}`);
    fixtures.push({ label, side, rung, a, memberB, initial, escrow, held, positionField, heldField: hf, mode, scale });
    finishPhase();
  }
  // These rungs (core-spread-v1 lineage) carry escrow-for: an exit that
  // what the pool holds (held + live order) covers never touches the pending
  // escrow. The original drives the old rungs, whose every exit settled the
  // escrow first, through A. Here the exit that NEEDS the escrow is B's
  // (escrow > held + live), so B is the member whose exit is refused while
  // young and recovered after 24 h; A's claim must stay intact through it.
  const youngUpdate = await freshAfter(stamp);
  await tx('pause market while escrow young', DEP, MARKET, 'set-paused', [boolCV(true)], '(ok true)');
  for (const f of fixtures.filter(f => f.mode === 'market-paused')) {
    await tx(`${f.label}: young paused exit refused`, f.memberB, f.rung, 'withdraw', [uintCV(f.escrow), someCV(update(youngUpdate))], '(err u1007)');
    await ev(`${f.label}: refusal preserves pending`, MARKET, `(get amount (unwrap-panic ${pending(f.side, f.rung)}))`, `u${f.escrow}`);
  }
  await tx('unpause market', DEP, MARKET, 'set-paused', [boolCV(false)], '(ok true)');
  async function age(seconds) {
    const tip = await getSimulationTip(S.sid), target = stamp + seconds;
    await submitSimulationSteps(S.sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: target - Number(tip.burn_block_time) } }] });
    await ev(`exact escrow age ${seconds}`, MARKET, `(- stacks-block-time u${stamp})`, `u${seconds}`);
  }
  await age(86399);
  for (const f of fixtures.filter(f => f.mode === 'no-update')) {
    await tx(`${f.label}: one second before timeout still needs update`, f.memberB, f.rung, 'withdraw', [uintCV(f.escrow), noneCV()], '(err u7012)');
  }
  await age(86400);
  async function exit(f, providedUpdate) {
    const { label, side, rung, a, memberB, initial, escrow, held, positionField, heldField: hf, scale } = f, aClaim = initial + held;
    const receipt = value => side === 'x' ? `(ok (tuple (sbtc u${value}) (stx u0)))` : `(ok (tuple (sbtc u0) (stx u${value})))`;
    await tx(`${label}: stranger cannot trigger recovery`, keeper, rung, 'withdraw', [uintCV(1), noneCV()], '(err u7006)');
    const out = await tx(`${label}: timed-out exit returns exact B claim`, memberB, rung, 'withdraw', [uintCV(escrow), providedUpdate], receipt(escrow));
    event(`${label}: pending escrow logged as cancel`, out.receipt, side, 'pending-refund', { reason: '"cancel"', amount: `u${escrow}`, price: 'u0' });
    event(`${label}: live amount also refunded`, out.receipt, side, 'refund', { amount: `u${initial}` });
    await ev(`${label}: market position and pending cleared`, MARKET, `(and
   (is-eq ${live(side, rung)} u0) (is-eq ${parked(side, rung)} u0) (is-none ${pending(side, rung)}))`, 'true');
    await ev(`${label}: B wallet exact`, MARKET, balance(side, memberB), `u${escrow}`);
    await ev(`${label}: A wallet untouched`, MARKET, balance(side, a), 'u0');
    await ev(`${label}: A shares and claim unchanged`, rung, `(and
   (is-eq (get shares (get-position '${a})) u${aClaim})
   (is-eq (get ${positionField} (get-position '${a})) u${aClaim})
   (is-eq (get total-shares (get-state)) u${aClaim})
   (is-eq (get ${hf} (get-state)) u${aClaim})
   (is-eq (get unfilled-index (get-state)) u1000000000000)
   (is-eq (get resting (get-state)) u0))`, 'true');
    await ev(`${label}: remaining funds held exactly`, MARKET, balance(side, rung), `u${aClaim}`);
    const part = 1000 * scale, rest = aClaim - part;
    await tx(`${label}: A partial withdrawal remains exact`, a, rung, 'withdraw', [uintCV(part), noneCV()], receipt(part));
    await ev(`${label}: A remaining shares exact`, rung, `(get shares (get-position '${a}))`, `u${rest}`);
    await tx(`${label}: A withdraws remaining claim`, a, rung, 'withdraw', [uintCV(rest), noneCV()], receipt(rest));
    await ev(`${label}: A final wallet exact`, MARKET, balance(side, a), `u${aClaim}`);
    await ev(`${label}: pool fully empty`, rung, `(and (is-eq (get total-shares (get-state)) u0) (is-eq (get ${hf} (get-state)) u0))`, 'true');
    await ev(`${label}: no funds left at rung`, MARKET, balance(side, rung), 'u0');
    finishPhase();
  }
  for (const f of fixtures.filter(f => f.mode === 'no-update')) await exit(f, noneCV());
  await age(86401);
  await tx('pause market after timeout', DEP, MARKET, 'set-paused', [boolCV(true)], '(ok true)');
  for (const f of fixtures.filter(f => f.mode === 'market-paused')) await exit(f, noneCV());
  await ev('recovery leaves market paused', MARKET, '(var-get paused)', 'true');
  await tx('unpause market for core-only pause', DEP, MARKET, 'set-paused', [boolCV(false)], '(ok true)');
  await tx('pause core (live core owner)', owners.core, CORE, 'pause', [], '(ok true)');
  // Deliberately invalid update: old escrow must not try to read it.
  for (const f of fixtures.filter(f => f.mode === 'core-paused')) await exit(f, someCV(bufferCV(Buffer.from('00', 'hex'))));
  await ev('recovery leaves core paused', CORE, '(var-get paused)', 'true');
  finishPhase();
  console.log(`${S.passed}/${S.checks} checks green`);
  console.log(`https://stxer.xyz/simulations/mainnet/${S.sid}`);
}
main().catch(e => { console.error(e); console.log(`${S.passed}/${S.checks} checks green (stopped)`); process.exitCode = 1; });
