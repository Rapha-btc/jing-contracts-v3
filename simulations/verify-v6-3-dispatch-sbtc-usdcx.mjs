// verify-v6-3-dispatch-sbtc-usdcx.mjs - port of verify-v6-3-dispatch.js to the
// sBTC/USDCx v6-5 set. Fork at tip, no contract/storage patches.
// markets-sbtc-usdcx-jing-v6-5 + jing-{sell,buy}-sbtc-<20,30,40>-v2 (exact
// template bytes) on the LIVE jing-core-v6 / jing-ladder-sbtc-usdcx-v1 /
// jing-ladder-dispatch-sbtc-usdcx. x side = sell-sbtc rungs (deposit-sell),
// y side = buy-sbtc rungs (deposit-buy, USDCx). The rungs take the seats of
// the live band holders at 20/30/40.
// All band-rung deposits happen before synthetic time advances; exits read no DIA oracle.
// Not ported: "fixed/peg intentionally not eligible for dispatch" (u7104):
// no fixed / peg rungs exist for sBTC/USDCx. The "claim batch naming a
// non-band rung" check (u7108) names the OTHER side's band rung instead
// (registered, wrong side: the same validate-claim refusal).
// Run: node simulations/verify-v6-3-dispatch-sbtc-usdcx.mjs
import fs from 'node:fs';
import { listCV, tupleCV as rawTupleCV, uintCV, someCV, noneCV, boolCV, cvToString } from '@stacks/transactions';
import { getSimulationTip, submitSimulationSteps } from 'stxer';
import {
  S, DEP, CORE, LADDER, DISPATCH, principal, mk, keeper, ok, update, check, finishPhase, ev, read, tx,
  balance, pending, live, parked, depArgs, settleArgs, freshAfter, event, fund, deployCode,
  rungName, rungBytes, bandSide, startSim, deployMarket, printHashes, stringAsciiCV,
} from './_v6-3-port-plumbing-sbtc-usdcx.mjs';

S.stopOnFail = true;
const tupleCV = fields => rawTupleCV(Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))));
const entries = (rungs, amounts) => listCV(rungs.map((rung, i) => tupleCV({ rung: principal(rung), amount: uintCV(amounts[i]) })));
const sum = xs => xs.reduce((a, b) => a + b, 0);
async function main() {
  printHashes();
  const owners = await startSim();
  const MARKET = await deployMarket(owners, undefined, undefined, { sync: true });
  const stamp = Number((await ev('fork clock', MARKET, 'stacks-block-time', v => /^u[0-9]+$/.test(v))).slice(1));
  const first = await freshAfter(stamp), mid = first.px * 100000000n / first.py;
  console.log(`  mid ${mid}`);
  const fixtures = [];
  for (const side of ['x', 'y']) {
    // x: sell-sbtc (rests sats, scale 1); y: buy-sbtc (rests uUSDCx, scale 2000:
    // 250 units = 0.5 USDCx stays under the 1 USDCx market minimum and over the
    // rung's 0.1 USDCx MIN_DEPOSIT, like 250 sats vs 1000 / 100 on x)
    const dir = side === 'x' ? 'sell' : 'buy', rungs = [], scale = side === 'x' ? 1 : 2000;
    for (const bps of [20, 30, 40]) {
      const name = rungName(side, bps), rung = `${DEP}.${name}`;
      await deployCode(name, rungBytes(side));
      if (bps === 20) await tx('canonical ' + name, owners.ladder, LADDER, 'set-canonical', [stringAsciiCV(bandSide(side)), principal(rung)], '(ok true)');
      await tx('initialize ' + name, owners.ladder, rung, 'initialize', [uintCV(bps), boolCV(true)], '(ok true)');
      await ev('registration ' + name, LADDER, `(is-some (get-registered '${rung}))`, 'true');
      rungs.push(rung); await ev('seat ' + name, LADDER, `(is-band-${side} '${rung})`, 'true');
    }
    const a = mk(side === 'x' ? 721 : 722), memberB = mk(side === 'x' ? 723 : 724);
    await fund(side, a, 100000 * scale); await fund(side, memberB, 100000 * scale);
    fixtures.push({ side, dir, rungs, scale, a, memberB });
  }
  // Opposite liquidity is deliberately outside all rung limits, so both
  // sides escrow and subsequent settlement places rather than fills them.
  for (const side of ['x', 'y']) {
    const who = mk(side === 'x' ? 725 : 726), amount = side === 'x' ? 6000 : 12000000;
    await fund(side, who, amount);
    await tx('noncrossing seed ' + side, who, MARKET, `deposit-token-${side}`, depArgs(side, amount, side === 'x' ? mid * 2n : mid / 2n), `(ok u${amount})`);
    if (side === 'y') await tx('settle seed', keeper, MARKET, 'settle-token-y-deposit', settleArgs(side, who, await freshAfter(stamp)), `(ok u${amount})`);
  }
  async function dispatch(f, who, amounts) {
    const before = BigInt((await ev('wallet before dispatch', MARKET, balance(f.side, who), v => /^u[0-9]+$/.test(v))).slice(1));
    const epochs = [];
    for (let i = 0; i < 3; i++) epochs.push(BigInt((await ev('epoch before dispatch ' + i, f.rungs[i], '(get epoch (get-state))', v => /^u[0-9]+$/.test(v))).slice(1)));
    const result = await tx(`${f.dir} weighted dispatch`, who, DISPATCH, `deposit-${f.dir}`, [uintCV(sum(amounts)), entries(f.rungs, amounts)], ok);
    const expected = cvToString({ ...tupleCV({ amount: uintCV(sum(amounts)), rungs: uintCV(3), 'stx-paid': uintCV(0), 'sbtc-paid': uintCV(0), positions: listCV(f.rungs.map((rung, i) => tupleCV({ rung: principal(rung), amount: uintCV(amounts[i]), shares: uintCV(amounts[i]), epoch: uintCV(epochs[i]), 'stx-paid': uintCV(0), 'sbtc-paid': uintCV(0) }))) }) });
    check('exact aggregate and per-rung deposit receipts', result.result, `(ok ${expected})`);
    await ev('exact total spent', MARKET, balance(f.side, who), `u${before - BigInt(sum(amounts))}`);
    for (let i = 0; i < 3; i++) await ev('exact shares ' + i, f.rungs[i], `(get shares (get-position '${who}))`, `u${amounts[i]}`);
  }
  async function withdraw(f, who, amounts, u) {
    const before = BigInt((await ev('wallet before exit', MARKET, balance(f.side, who), v => /^u[0-9]+$/.test(v))).slice(1));
    const result = await tx(`${f.dir} weighted exit`, who, DISPATCH, `withdraw-${f.dir}`, [entries(f.rungs, amounts), u], ok);
    // rung trait keys: sbtc = sats, stx = uUSDCx on this pair
    const field = f.side === 'x' ? 'sbtc' : 'stx', other = f.side === 'x' ? 'stx' : 'sbtc';
    const expected = tupleCV({ rungs: uintCV(3), withdrawn: uintCV(3), [field]: uintCV(sum(amounts)), [other]: uintCV(0), positions: listCV(f.rungs.map((rung, i) => tupleCV({ rung: principal(rung), [field]: uintCV(amounts[i]), [other]: uintCV(0) }))) });
    check('exact aggregate and per-rung exit receipts', result.result, `(ok ${cvToString(expected)})`);
    await ev('exact exit wallet delta', MARKET, balance(f.side, who), `u${before + BigInt(sum(amounts))}`);
    return result;
  }
  for (const f of fixtures) {
    const amounts = [250, 3000, 4000].map(n => n * f.scale);
    await dispatch(f, f.a, amounts);
    for (let i = 0; i < 3; i++) await ev('under-min holds; other legs escrow ' + i, MARKET, `(and
   (is-eq ${balance(f.side, f.rungs[i])} u${i === 0 ? amounts[i] : 0})
   (is-eq (default-to u0 (get amount ${pending(f.side, f.rungs[i])})) u${i === 0 ? 0 : amounts[i]}))`, 'true');
    await withdraw(f, f.a, amounts, someCV(update(await freshAfter(stamp))));
    f.initial = [3000, 4000, 5000].map(n => n * f.scale); f.second = f.initial.map(n => 2 * n);
    await dispatch(f, f.a, f.initial);
    for (let i = 1; i < 3; i++) await tx('place other rung before top-up', keeper, MARKET, `settle-token-${f.side}-deposit`, settleArgs(f.side, f.rungs[i], await freshAfter(stamp)), `(ok u${f.initial[i]})`);
    await dispatch(f, f.memberB, f.second);
    for (let i = 0; i < 3; i++) await ev('already-pending isolated; other legs go through ' + i, MARKET, `(and
    (is-eq ${balance(f.side, f.rungs[i])} u${i === 0 ? f.second[i] : 0})
    (is-eq (get amount (unwrap-panic ${pending(f.side, f.rungs[i])})) u${i === 0 ? f.initial[i] : f.second[i]}))`, 'true');
    for (const who of [f.a, f.memberB]) {
      const wallet = await ev('wallet before claim', MARKET, balance(f.side, who), v => /^u[0-9]+$/.test(v));
      const claimed = await tx(`${f.dir} claim batch, nothing filled`, who, DISPATCH, `claim-${f.dir}`, [listCV(f.rungs.map(principal))], ok);
      check('exact claim receipt', claimed.result, `(ok ${cvToString(tupleCV({ rungs: uintCV(3), claimed: uintCV(3), stx: uintCV(0), sbtc: uintCV(0), positions: listCV(f.rungs.map(rung => tupleCV({ rung: principal(rung), stx: uintCV(0), sbtc: uintCV(0) }))) }))})`);
      await ev('claim moved nothing', MARKET, balance(f.side, who), wallet);
      const mine = who === f.a ? f.initial : f.second;
      for (let i = 0; i < 3; i++) await ev('position kept after claim ' + i, f.rungs[i], `(get shares (get-position '${who}))`, `u${mine[i]}`);
    }
    await ev('escrow kept after claims', MARKET, `(get amount (unwrap-panic ${pending(f.side, f.rungs[0])}))`, `u${f.initial[0]}`);
    await tx('claim batch by a member with no position', keeper, DISPATCH, `claim-${f.dir}`, [listCV(f.rungs.map(principal))], '(err u7006)');
    const wrong = fixtures.find(g => g !== f).rungs[0];
    await tx('claim batch naming the other side\'s band rung', f.a, DISPATCH, `claim-${f.dir}`, [listCV([principal(f.rungs[0]), principal(wrong)])], '(err u7108)');
  }
  for (const f of fixtures) for (let i = 1; i < 3; i++) {
    await tx('place other rungs before timeout', keeper, MARKET, `settle-token-${f.side}-deposit`, settleArgs(f.side, f.rungs[i], await freshAfter(stamp)), `(ok u${f.second[i]})`);
    await ev('other rung has no pending escrow', MARKET, pending(f.side, f.rungs[i]), 'none');
  }
  const tip = await getSimulationTip(S.sid);
  await submitSimulationSteps(S.sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: stamp + 86401 - Number(tip.burn_block_time) } }] });
  await ev('pending age greater than 24h', MARKET, `(- stacks-block-time u${stamp})`, 'u86401');
  await tx('pause market for oracle-free timeout exits', DEP, MARKET, 'set-paused', [boolCV(true)], '(ok true)');
  for (const f of fixtures) {
    await withdraw(f, f.a, f.initial, noneCV());
    for (let i = 0; i < 3; i++) {
      const rung = f.rungs[i];
      await ev('rung 0 escrow stays pending, others withdraw live exact', MARKET, i === 0
        ? `(and (is-eq (get amount (unwrap-panic ${pending(f.side, rung)})) u${f.initial[0]}) (is-eq ${live(f.side, rung)} u0) (is-eq ${parked(f.side, rung)} u0))`
        : `(and (is-none ${pending(f.side, rung)}) (is-eq ${live(f.side, rung)} u${f.second[i]}) (is-eq ${parked(f.side, rung)} u0))`, 'true');
      await ev('other member exact shares and claim', rung, `(and (is-eq (get shares (get-position '${f.memberB})) u${f.second[i]}) (is-eq (get ${f.side === 'x' ? 'sbtc' : 'stx'} (get-position '${f.memberB})) u${f.second[i]}))`, 'true');
    }
    const outB = await withdraw(f, f.memberB, f.second, noneCV());
    event('timeout cancel logged', outB.receipt, f.side, 'pending-refund', { reason: '"cancel"' });
    await ev('dispatcher has no custody', MARKET, balance(f.side, DISPATCH), 'u0');
  }
  console.log(`${S.passed}/${S.checks} checks green`);
  console.log(`https://stxer.xyz/simulations/mainnet/${S.sid}`);
  fs.writeFileSync(new URL('./fixtures/dispatch-v6-5-sbtc-usdcx-result.json', import.meta.url), JSON.stringify({ simulation: `https://stxer.xyz/simulations/mainnet/${S.sid}`, passed: S.passed, checks: S.checks }, null, 2) + '\n');
}
main().catch(e => { console.error(e); console.log(`${S.passed}/${S.checks} checks green (stopped)`); process.exitCode = 1; });
