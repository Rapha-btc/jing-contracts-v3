// verify-v6-rungs-audit-tail-sbtc-usdcx.mjs
// Port of verify-v6-rungs-audit-tail.js to the sBTC/USDCx v6-5 set (template
// bytes, hash-checked; LIVE jing-core-v6 + jing-ladder-sbtc-usdcx-v1 +
// jing-ladder-dispatch-sbtc-usdcx; fork pinned at the block before the v6-5
// market went live). Real market fills (public swap at the rung's own pegged
// quote, signed [1,7] print) drive each deploy-set band rung into the rescale
// band and then the tail roll. No source substitutions, storage writes or
// mock prices. One fork per side (SIDE=x|y restricts a diagnostic run).
//   x: jing-sell-sbtc-90-v2 (rests sBTC, paid USDCx)   STX: jing-buy-stx-core-spread-v1
//   y: jing-buy-sbtc-90-v2  (rests USDCx, paid sBTC)   STX: jing-sell-stx-core-spread-v1
// Tail rule (same code): a fill leaving the index in [MINT_FLOOR/RESCALE,
// MINT_FLOOR) RESCALES (index x1000, shares /1000, scale +1, same epoch); a
// fill leaving it under MINT_FLOOR/RESCALE (or the actual under SOLD_OUT_DUST:
// 10 sats on the sell rung, 10000 uUSDCx on the buy rung) ROLLS THE TAIL.
// Sizes (rederived; USDCx liquidity on the fork is ~128k USDCx across three
// holders, so the STX sizes cannot be copied):
//   x: big = 0.5 BTC (5e7 sats); B's residual target 2*big/2e6 = 50 sats,
//      roll threshold 2*big*1e-6 = 100 sats, dust 10 sats
//   y: big = 12,000 USDCx (1.2e10); target 12,000 uUSDCx, threshold 24,000,
//      dust 10,000
// Bps: the live ladder is full (10 seats per side), so the rungs take the
// live bps 90 (and 80 for the second, dispatch-exit rung) and replace the
// live holders; the STX suite used fresh spreads 100 / 101.
// Run: node simulations/verify-v6-rungs-audit-tail-sbtc-usdcx.mjs
import {
  startFork, setupMarket, deployRung, fund, bal, rid, TR, AS, ok, err, freshUpd,
  DEP, LADDER, MARKET, DISPATCH, S, P_, check, must, show, tx, evalIn, uintCV, noneCV, boolCV, stringAsciiCV,
} from './_rungs-sbtc-usdcx.mjs';
import { summary, mk } from './_yg-loop-common.js';
import { someCV, listCV, tupleCV } from '@stacks/transactions';

const SCALE = 1_000_000_000_000n, FLOOR = 1_000_000_000n;
const opposite = (s) => (s === 'x' ? 'y' : 'x');
const coin = (s) => (s === 'x' ? 'sbtc' : 'stx'); // rung / dispatch receipt names: stx = USDCx
const keeper = mk(871);
const links = [];
const totals = { passed: 0, checks: 0 };
const isRcpt = (v) => v?.ok !== undefined;

async function scenario(side) {
  S.passed = 0; S.checks = 0; S.groups = {}; S.fails = [];
  const dir = side === 'x' ? 'sell' : 'buy';
  S.group = `${side} setup`;
  await startFork(`\n=== ${side}: jing-${dir}-sbtc-bps-v2 audit tail (sBTC/USDCx v6-5) ===`);
  links.push(`${side}: https://stxer.xyz/simulations/mainnet/${S.sid}`);
  const { ladderOwner: LO } = await setupMarket();
  const U = await freshUpd();
  const mid = U.mid, signed = U.cv;
  const rung = await deployRung(side, 90), ladderSide = side === 'x' ? 'sel-band' : 'buy-band';
  await tx('canonical rung (v2 bytes)', LO, LADDER, 'set-canonical', [stringAsciiCV(ladderSide), P_(rung)], { ok: true });
  await tx('initialize rung (bps 90, seat: replaces the live holder)', LO, rung, 'initialize', [uintCV(90), boolCV(true)], { ok: true });
  const alice = mk(881), bob = mk(882), carol = mk(883), taker = mk(884);
  const big = side === 'x' ? 50_000_000n : 12_000_000_000n, small = side === 'x' ? 1000n : 1_000_000n;
  for (const who of [alice, bob, carol]) await fund(side, who, big * 2n + small * 20n);
  // the taker pays ~3 x big of the other asset over both scenarios (plus fees)
  await fund(opposite(side), taker, side === 'x' ? 120_000_000_000n : 100_000_000n);
  const state = () => evalIn(rung, '(get-state)');
  const actual = async () => evalIn(rung, `(+ (market-size) (unwrap-panic (contract-call? '${side === 'x' ? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token' : 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx'} get-balance current-contract)))`);
  const sync = () => tx('sync rung', keeper, rung, 'sync', [], { ok: true });
  const deposit = (who, amount) => tx('member deposit', who, rung, 'deposit', [uintCV(amount)], ok);
  const exit = (who, amount = big * 100n) => tx('member exit', who, rung, 'withdraw', [uintCV(amount), someCV(signed)], ok);
  const pos = (who) => evalIn(rung, `(get-position '${who})`);
  const live = (s, p) => evalIn(MARKET, `(get-token-${s}-deposit (get-current-cycle) '${p})`);
  async function sellTo(target) {
    const start = await actual();
    for (let i = 0; i < 8; i++) {
      const rest = await actual(); if (rest <= target + target / 100n) break;
      const price = await evalIn(MARKET, `(token-${side}-limit-at '${rung} u${mid})`);
      if (price === 0n && (await live(side, rung)) === 0n) break;
      check('rung quote is executable outside mid', side === 'x' ? price > mid && price < mid * 4n : price > mid / 4n && price < mid, `${price} vs mid ${mid}`);
      const want = rest - target;
      const net = side === 'x' ? want * price / 10_000_000_000n : want * 10_000_000_000n / price;
      if (net < (side === 'x' ? 1_000_000n : 1000n)) break;
      const gross = net * 10000n / 9980n;
      const r = await tx(`real fill toward ${target}`, taker, MARKET, 'swap', [uintCV(gross), uintCV(side === 'x' ? price * 101n / 100n : price * 99n / 100n), signed, TR.x, AS.x, TR.y, AS.y, boolCV(side === 'y')], ok);
      check('fill returns output', (r.res?.ok?.[`token-${side}-received`] ?? 0n) > 0n, show(r.res));
      check('taker leaves no resting position', (await live(opposite(side), taker)) === 0n);
    }
    const rest = await actual(); check('real fills reduced rung inventory', rest < start, `${start} -> ${rest}`);
    console.log(`  inventory ${start} -> ${rest}, target ${target}`);
  }
  const within1 = (v, want) => v <= want && v + 1n >= want;

  S.group = `${side} A rescale`;
  await deposit(alice, big);
  const pre = await state(), preShares = pre['total-shares'], epochA = pre.epoch, scaleA = pre.scale;
  await sellTo(big / 2000n);
  const restA = await actual();
  check('fills leave index in rescale band [1e6, MINT_FLOOR)', restA * SCALE / big >= 1_000_000n && restA * SCALE / big < FLOOR, `${restA * SCALE / big}`);
  await sync();
  const resc = await state();
  check('rescale keeps the epoch open', resc.epoch === epochA);
  check('rescale steps scale +1', resc.scale === scaleA + 1n);
  check('rescaled index back at or above MINT_FLOOR', resc['unfilled-index'] >= FLOOR && resc['unfilled-index'] < SCALE, show(resc));
  check('rescale divides total shares by 1000', resc['total-shares'] === preShares / 1000n);
  check('rescale keeps the member', resc.members === 1n);
  check('sole member still owns all unsold', (await pos(alice))[coin(side)] === restA);
  const bobBefore = await bal(side, bob);
  const joinA = await deposit(bob, big);
  check('newcomer after rescale is admitted (no u7013)', (joinA.res?.ok?.shares ?? 0n) > 0n, show(joinA.res));
  check('newcomer deposit moves exactly the amount', bobBefore - (await bal(side, bob)) === big);
  const afterJoin = await state();
  check('newcomer joins the same epoch', afterJoin.epoch === epochA); check('two members', afterJoin.members === 2n);
  check('newcomer position worth its deposit (<=1 unit rounding)', within1((await pos(bob))[coin(side)], big));
  check('incumbent position unchanged by the join (<=1 unit)', within1((await pos(alice))[coin(side)], restA));
  const bobMid = await bal(side, bob); await exit(bob);
  check('newcomer exits with its deposit (<=1 unit)', within1((await bal(side, bob)) - bobMid, big));
  const aPos = await pos(alice), aWallet = await bal(side, alice);
  await exit(alice);
  check('last member receives exact unsold position', (await bal(side, alice)) - aWallet === aPos[coin(side)]);
  const emptyA = await state();
  check('last exit closes epoch', emptyA.epoch === epochA + 1n); check('last exit resets index', emptyA['unfilled-index'] === SCALE); check('last exit burns every share', emptyA['total-shares'] === 0n);
  check('pool input fully paid out', (await actual()) === 0n);

  S.group = `${side} B tail roll`;
  await deposit(alice, big); await deposit(carol, big);
  const stB = await state(), epochB = stB.epoch, sharesB = stB['total-shares'];
  await sellTo(big * 2n / 1000n); await sellTo(big * 2n / 2_000_000n);
  const residual = await actual();
  const dust = side === 'x' ? 10n : 10_000n;
  check(`nonzero residual avoids absolute-dust close (>= ${dust})`, residual >= dust, `${residual}`);
  check('residual crosses the roll threshold (index < MINT_FLOOR/RESCALE)', residual * SCALE / sharesB < 1_000_000n, `${residual * SCALE / sharesB}`);
  await sync();
  const rolled = await state();
  check('tail roll closes the epoch', rolled.epoch === epochB + 1n);
  check('fresh epoch index = SCALE', rolled['unfilled-index'] === SCALE);
  check('fresh epoch has no shares', rolled['total-shares'] === 0n);
  check('fresh epoch has no members', rolled.members === 0n);
  check('tail roll takes the order off the market', rolled.resting === 0n);
  check('tail roll reserves the rest (nothing held for the pool)', rolled[side === 'x' ? 'held-sats' : 'held-uusdcx'] === 0n);
  const aliceB = await pos(alice);
  const aliceBack = aliceB[coin(side)], aliceOwed = aliceB[coin(opposite(side))];
  check('closed member has positive proceeds claim', aliceOwed > 0n, show(aliceB));
  const nBefore = await bal(side, bob);
  const joinB = await deposit(bob, big);
  check('newcomer after roll mints fresh shares 1:1', joinB.res?.ok?.shares === big, show(joinB.res));
  check('newcomer after roll moves exactly the amount', nBefore - (await bal(side, bob)) === big);
  const fresh = await state();
  check('newcomer opens the fresh epoch', fresh.epoch === epochB + 1n); check('fresh epoch one member', fresh.members === 1n);
  check('newcomer owns exactly its deposit', (await pos(bob))[coin(side)] === big);
  check('closed members claims untouched by the newcomer', show(await pos(alice)) === show(aliceB));
  // alice: closed rung + a second live rung in one real dispatch withdrawal (live dispatch)
  const second = await deployRung(side, 80);
  await tx('initialize second band rung (bps 80, replaces the live holder)', LO, second, 'initialize', [uintCV(80), boolCV(true)], { ok: true });
  await tx('same member funds live rung', alice, second, 'deposit', [uintCV(small * 10n)], ok);
  const payoutBefore = await bal(opposite(side), alice), inputBefore = await bal(side, alice);
  const out = await tx('dispatch closed + live rung exits atomically', alice, DISPATCH, `withdraw-${dir}`, [listCV([rung, second].map((r) => tupleCV({ rung: P_(r), amount: uintCV(big * 100n) }))), someCV(signed)], ok);
  const result = out.res?.ok ?? {};
  check('dispatch includes both withdrawals', result.withdrawn === 2n, show(out.res));
  check('dispatch closed proceeds paid exactly', result[coin(opposite(side))] === aliceOwed);
  check('dispatch input = closed reserve share + live deposit', result[coin(side)] === aliceBack + small * 10n);
  check('proceeds wallet exact', (await bal(opposite(side), alice)) - payoutBefore === aliceOwed);
  check('input wallet exact', (await bal(side, alice)) - inputBefore === aliceBack + small * 10n);
  await tx('second old-epoch withdraw has no position', alice, rung, 'withdraw', [uintCV(1), noneCV()], err(7006));
  const carolLast = await pos(carol), carolBack = carolLast[coin(side)], carolOwed = carolLast[coin(opposite(side))];
  check('last closed member gets the whole remaining reserve', aliceBack + carolBack === residual, `${aliceBack} + ${carolBack} vs ${residual}`);
  const cOut = await bal(opposite(side), carol), cIn = await bal(side, carol);
  await tx('last closed member claims', carol, rung, 'claim', [], ok);
  check('claim pays proceeds exactly', (await bal(opposite(side), carol)) - cOut === carolOwed);
  check('claim pays reserve share exactly', (await bal(side, carol)) - cIn === carolBack);
  check('claim deletes old member position', (await pos(carol)).shares === 0n);
  const bMid = await bal(side, bob); await exit(bob);
  check('newcomer exits fresh epoch with exactly its deposit', (await bal(side, bob)) - bMid === big);
  check('no input left in the rung after every exit', (await actual()) === 0n);
  check('rung proceeds solvent (deficit 0)', (await evalIn(rung, '(get-deficit)')) === 0n);
}

for (const side of (process.env.SIDE ? [process.env.SIDE] : ['x', 'y'])) {
  try { await scenario(side); } catch (e) { console.error(e); S.fails.push(`STOP: ${e.message}`); }
  summary();
  totals.passed += S.passed; totals.checks += S.checks;
  if (S.fails.length) process.exitCode = 1;
}
console.log(`\nTOTAL ${totals.passed}/${totals.checks} checks green`);
console.log(links.join('\n'));
