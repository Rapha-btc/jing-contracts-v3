// verify-v6-3-caller-impact-sbtc-usdcx.mjs - port of verify-v6-3-caller-impact.js
// (queue-refund / exit audit, real bytes and real Lazer) to the sBTC/USDCx v6-5
// set. Fork pinned before the v6-5 market went live (see the plumbing),
// LIVE jing-core-v6 / jing-ladder-sbtc-usdcx-v1, exact template bytes.
// Only band rungs exist on this pair: per side one unseated
// jing-{sell,buy}-sbtc-20-v2 (x = sell-sbtc rests sats, y = buy-sbtc rests
// uUSDCx). The fixed and peg rungs of the original (2 of 3 rung kinds per
// side) have no sBTC/USDCx equivalent and are not ported. The final
// core-pause block (fixed rungs in the original) runs on the band rungs,
// the only rung kind here.
// Amounts: x 3000 sats, y 6 USDCx (both over the 1000 sats / 1 USDCx
// minimums and the rungs' 100 sats / 0.1 USDCx MIN_DEPOSIT).
// Run: node simulations/verify-v6-3-caller-impact-sbtc-usdcx.mjs
import { uintCV, someCV, noneCV, boolCV } from '@stacks/transactions';
import {
  S, DEP, CORE, LADDER, principal, mk, keeper, ok, update, check, finishPhase, ev, tx,
  balance, pending, live, depArgs, settleArgs, freshAfter, event, fund, deployCode, traits, assets,
  rungName, rungBytes, bandSide, heldField, startSim, deployMarket, printHashes, stringAsciiCV,
} from './_v6-3-port-plumbing-sbtc-usdcx.mjs';

async function main() {
  printHashes();
  const owners = await startSim();
  const MARKET = `${DEP}.markets-sbtc-usdcx-jing-v6-5`;
  await deployCode('markets-sbtc-usdcx-jing-v6-5', (await import('./_sbtc-usdcx-v6-5-common.mjs')).bytes('market'));
  await tx('reserve 49 seats', owners.ladder, LADDER, 'set-max-band-per-side', [uintCV(49)], '(ok true)');
  await tx('sync seats', DEP, MARKET, 'sync-seat-count', [], '(ok u49)');
  await tx('verify market (live core owner)', owners.core, CORE, 'set-verified-contract', [principal(MARKET)], '(ok true)');
  await tx('market operator -> core owner', DEP, MARKET, 'set-operator', [principal(owners.core)], '(ok true)');
  await tx('initialize market', owners.core, MARKET, 'initialize', [principal(MARKET), traits.x, traits.y, uintCV(1000), uintCV(1000000), uintCV(1), uintCV(7)], '(ok true)');
  await tx('market operator -> DEP', owners.core, MARKET, 'set-operator', [principal(DEP)], '(ok true)');
  await tx('size queue', DEP, MARKET, 'set-distance-slots', [uintCV(0)], '(ok true)');
  const stamp = Number((await ev('fork clock', MARKET, 'stacks-block-time', v => /^u[0-9]+$/.test(v))).slice(1));
  const initial = await freshAfter(stamp);
  const mid = initial.px * 100000000n / initial.py;
  console.log(`  mid ${mid}`);
  let i = 0; const bands = [];
  for (const side of ['x', 'y']) {
    const amount = side === 'x' ? 3000 : 6000000, big = amount * 2;
    const incumbent = mk(981 + i++), limit = side === 'x' ? mid * 2n : mid / 2n;
    await fund(side, incumbent, big);
    await tx(`${side}: incumbent rests`, incumbent, MARKET, `deposit-token-${side}`, depArgs(side, big, limit), `(ok u${big})`);
    {
      i++; // the original's fixed + peg members took two key slots here
      const who = mk(981 + i++);
      const name = rungName(side, 20), file = name, rung = `${DEP}.${name}`;
      await deployCode(name, rungBytes(side));
      bands.push({ side, rung, who, amount, limit });
      await tx(`${file}: canonical`, owners.ladder, LADDER, 'set-canonical', [stringAsciiCV(bandSide(side)), principal(rung)], '(ok true)');
      await tx(`${file}: initialize unseated`, owners.ladder, rung, 'initialize', [uintCV(20), boolCV(false)], '(ok true)');
      await fund(side, who, amount);
      await tx(`${file}: member submit`, who, rung, 'deposit', [uintCV(amount)], ok);
      await ev(`${file}: pending escrow exact`, MARKET, `(get amount (unwrap-panic ${pending(side, rung)}))`, `u${amount}`);
      await ev(`${file}: pooled counts escrow`, rung, `(get pooled (get-state))`, `u${amount}`);
      await ev(`${file}: resting label includes UNSETTLED escrow`, rung, `(get resting (get-state))`, `u${amount}`);
      await tx(`${file}: exit still requires update despite cancel capability`, who, rung, 'withdraw', [uintCV(amount), noneCV()], '(err u7012)');
      const fresh = await freshAfter(stamp);
      await tx('pause market', DEP, MARKET, 'set-paused', [boolCV(true)], '(ok true)');
      await tx(`${file}: pending exit blocked by market pause`, who, rung, 'withdraw', [uintCV(amount), someCV(update(fresh))], '(err u1007)');
      await tx('unpause market', DEP, MARKET, 'set-paused', [boolCV(false)], '(ok true)');
      const settled = await tx(`${file}: keeper settle refunds queue-full`, keeper, MARKET, `settle-token-${side}-deposit`, settleArgs(side, rung, fresh), `(ok u${amount})`);
      event(`${file}: refund reason`, settled.receipt, side, 'pending-refund', { reason: '"queue-full"', amount: `u${amount}` });
      await ev(`${file}: no live order after refund`, MARKET, live(side, rung), 'u0');
      await ev(`${file}: refunded tokens held in rung wallet`, MARKET, balance(side, rung), `u${amount}`);
      await ev(`${file}: held field stale until sync`, rung, `(get ${heldField(side)} (get-state))`, 'u0');
      await tx(`${file}: reconcile refund`, keeper, rung, 'sync', [], '(ok true)');
      await ev(`${file}: shares preserved, no false fill`, rung, `(and (is-eq (get pooled (get-state)) u${amount}) (is-eq (get ${heldField(side)} (get-state)) u${amount}) (is-eq (get unfilled-index (get-state)) u1000000000000) (is-eq (get resting (get-state)) u0))`, 'true');
      await ev(`${file}: incumbent untouched`, MARKET, live(side, incumbent), `u${big}`);
      // rung trait keys: sbtc = sats, stx = uUSDCx
      const receipt = side === 'x' ? `(ok (tuple (sbtc u${amount}) (stx u0)))` : `(ok (tuple (sbtc u0) (stx u${amount})))`;
      await tx(`${file}: exit refunded wallet without oracle`, who, rung, 'withdraw', [uintCV(amount), noneCV()], receipt);
      await ev(`${file}: member exact returned amount`, MARKET, balance(side, who), `u${amount}`);
      await ev(`${file}: empty pool`, rung, '(get total-shares (get-state))', 'u0');
      await tx(`${file}: resubmit refunded principal`, who, rung, 'deposit', [uintCV(amount)], ok);
      const ownExit = await tx(`${file}: own exit settles refund then pays member`, who, rung, 'withdraw', [uintCV(amount), someCV(update(fresh))], receipt);
      event(`${file}: own exit refund reason`, ownExit.receipt, side, 'pending-refund', { reason: '"queue-full"', amount: `u${amount}` });
      await ev(`${file}: own exit leaves no pending or shares`, MARKET, `(and (is-none ${pending(side, rung)}) (is-eq (get total-shares (contract-call? '${rung} get-state)) u0))`, 'true');
      await ev(`${file}: own exit exact member refund`, MARKET, balance(side, who), `u${amount}`); finishPhase();
    }
    await tx(`${side}: remove incumbent`, incumbent, MARKET, `cancel-token-${side}-deposit`, [traits[side], assets[side]], `(ok u${big})`);
  }
  // A core pause prevents placement, even though the market's cancel is open.
  await tx('reserve 48 for placement-pending exits', owners.ladder, LADDER, 'set-max-band-per-side', [uintCV(48)], '(ok true)');
  await tx('sync 48 seats', DEP, MARKET, 'sync-seat-count', [], '(ok u48)');
  for (const side of ['x', 'y']) {
    const owner = mk(side === 'x' ? 997 : 998), a = side === 'x' ? 6000 : 12000000, l = side === 'x' ? mid * 2n : mid / 2n;
    await fund(side, owner, a); await tx('prepare noncrossing book', owner, MARKET, `deposit-token-${side}`, depArgs(side, a, l), `(ok u${a})`);
    if (side === 'y') await tx('admit opposite', keeper, MARKET, 'settle-token-y-deposit', settleArgs(side, owner, await freshAfter(stamp)), `(ok u${a})`);
  }
  for (const { side, rung, who, amount } of bands) {
    await tx('prepare pending rung placement', who, rung, 'deposit', [uintCV(amount)], ok);
    await ev('placement waits in pending', MARKET, `(get amount (unwrap-panic ${pending(side, rung)}))`, `u${amount}`);
  }
  await tx('pause core (live core owner)', owners.core, CORE, 'pause', [], '(ok true)');
  for (const { side, rung, who, amount } of bands) {
    await tx(`${side}: core pause blocks rung pending exit`, who, rung, 'withdraw', [uintCV(amount), someCV(update(await freshAfter(stamp)))], '(err u5016)');
    await ev(`${side}: exit refusal retains exact escrow`, MARKET, `(get amount (unwrap-panic ${pending(side, rung)}))`, `u${amount}`);
  }
  finishPhase();
  console.log(`${S.passed}/${S.checks} checks green`);
  console.log(`https://stxer.xyz/simulations/mainnet/${S.sid}`);
}
main().catch(e => { console.error(e); console.log(`${S.passed}/${S.checks} checks green (stopped)`); process.exitCode = 1; });
