// verify-v6-rungs-escrow-timeout-stx-usdcx.mjs
// STX/USDCx port of verify-v6-rungs-escrow-timeout.js: the 24-hour escrow
// recovery test (no-update / market-paused / core-paused), both sides.
// Fork at the TIP on the LIVE jing-core-v6: fresh jing-ladder-stx-usdcx-v1 +
// markets-stx-usdcx-jing-v6-4 (stripped source) by DEP; verify + initialize by
// the core owner multisig (operator handed to it and back to DEP); the core
// pause by CORE_OWNER. Lazer [45, 7].
//
// Rungs: only BAND rungs exist on the STX/USDCx set, so the original's fixed
//   (jing-*-stx) and peg (jing-*-stx-market-spread) fixtures are N/A (no
//   fixed / peg rung on this set): 6 of the original 18 fixtures run.
//   x side (rests STX)   = jing-sell-stx-usdc-<bps>, ladder "sel-band" (orig jing-buy-stx-spread-*, sBTC)
//   y side (rests USDCx) = jing-buy-stx-usdc-<bps>,  ladder "buy-band" (orig jing-sell-stx-spread-*, STX)
// Amounts in the same relation to the market minimums (1 STX / 1 USDCx; orig 1000 sats / 1 STX):
//   x: seed 6 min, initial 3 min, escrow 6 min, held 0.5 min, part 1 min
//   y: seed 12 min, initial 6 min, escrow 12 min, held 1 min, part 2 min
// Seeds: x ask at mid*2, y bid at mid/2 (noncrossing), mid = px*1e8/py.
// Exiting member: the original ran the pre-v1 core-spread rungs, whose withdraw
//   always settles the escrow; these templates descend from core-spread-v1, whose
//   withdraw consults the escrow only when the take exceeds held + on-book. A's
//   claim (live 3 + held 0.5 min) never needs it (first run: A's exit paid with
//   the market paused / without an update), so B (the pending top-up) drives
//   every escrow check and A is the shareholder kept exact (roles swapped).
// Receipt / position keys are positional: sbtc = token x (uSTX), stx = token y (uUSDCx).
//
// Run: node simulations/verify-v6-rungs-escrow-timeout-stx-usdcx.mjs
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, noneCV, someCV, boolCV, makeUnsignedSTXTokenTransfer,
  deserializeCV, cvToString, makeUnsignedContractDeploy, PostConditionMode,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationTip, submitSimulationSteps, callContract, getNonce, setSender,
} from 'stxer';
import { P_ as P, NODE, DEP, CORE, CORE_OWNER, USDCX, STX_WHALES, USDCX_WHALES, N, C, src, traits, assets, mk, balanceExpr, freshAfter, updCV } from './_stx-usdcx-v6-common.mjs';

const keeper = mk(871);
const cv = (hex) => cvToString(deserializeCV(hex));
const decode = (step) => {
  const r = step?.Result;
  if (r?.Eval?.Ok) return cv(r.Eval.Ok);
  if (r?.Transaction?.Ok) {
    const tx = r.Transaction.Ok;
    if (tx.vm_error || tx.post_condition_aborted) return `ENGINE-ERR ${JSON.stringify(tx)}`;
    return cv(tx.result);
  }
  return `ENGINE-ERR ${JSON.stringify(r)}`;
};
const ok = (v) => v.startsWith('(ok');
const update = updCV;
let passed = 0, checks = 0, failures = 0, sid;
function check(label, actual, want) {
  checks++;
  const good = typeof want === 'function' ? want(actual) : actual === want;
  if (good) passed++; else failures++;
  console.log(`${good ? 'ok  ' : 'FAIL'} ${checks}. ${label}: ${String(actual).slice(0, 700)}${good ? '' : `; expected ${want}`}`);
  return good;
}
function finishPhase() {
  if (failures) { console.log(`${passed}/${checks} checks green`); throw new Error(`Fork checks failed: https://stxer.xyz/simulations/mainnet/${sid}`); }
}
async function ev(label, cid, code, want) {
  const out = await submitSimulationSteps(sid, { steps: [{ Eval: [DEP, '', cid, code] }] });
  const actual = decode({ Result: out.steps[0] });
  check(label, actual, want);
  return actual;
}
async function tx(label, sender, cid, fn, args, want) {
  const r = await callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 });
  const actual = r.vmError || r.pcAborted ? `ENGINE-ERR ${JSON.stringify(r)}` : r.result;
  check(label, actual, want);
  return r;
}
const balance = balanceExpr;
const pending = (side, p) => `(get-token-${side}-pending-deposit '${p})`;
const live = (side, p) => `(get-token-${side}-deposit (var-get current-cycle) '${p})`;
const depArgs = (side, amount, limit) => [uintCV(amount), uintCV(limit), noneCV(), traits[side], assets[side]];
const settleArgs = (side, who, u) => [P(who), update(u), traits[side], assets[side]];
const parked = (side, p) => `(get-token-${side}-parked '${p})`;

function event(label, receipt, side, name, fields = {}) {
  const prints = receipt.events.map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.committed && e.contract_event?.contract_identifier === CORE)
    .map((e) => cv(e.contract_event.raw_value));
  check(label, prints.join(' | '), () => prints.some((value) => value.includes(`(event "${name}${side ? `-${side}` : ''}")`) &&
    Object.entries(fields).every(([key, val]) => value.includes(`(${key} ${val})`))));
}
async function fund(side, who, amount) {
  if (side === 'y') {
    await tx('fund fresh USDCx', USDCX_WHALES[0], USDCX, 'transfer', [uintCV(amount), P(USDCX_WHALES[0]), P(who), noneCV()], '(ok true)');
  } else {
    const raw = await makeUnsignedSTXTokenTransfer({ recipient: who, amount, nonce: await getNonce(sid, STX_WHALES[0]), network: 'mainnet', publicKey: '', fee: 0 });
    setSender(raw, STX_WHALES[0]);
    const out = await submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] });
    check('fund fresh STX', decode({ Result: out.steps[0] }), '(ok true)');
  }
  finishPhase();
}
const MARKET = C.market, LADDER = C.ladder;
async function deploy(name, code) {
  const raw = await makeUnsignedContractDeploy({ contractName: name, codeBody: code, clarityVersion: ClarityVersion.Clarity5, nonce: await getNonce(sid, DEP), network: 'mainnet', publicKey: '', fee: 0, postConditionMode: PostConditionMode.Allow });
  setSender(raw, DEP); const out = await submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] });
  check(`deploy ${name}`, decode({ Result: out.steps[0] }), ok); finishPhase();
}
// by role: min unit per side (1 STX / 1 USDCx); the original's x unit was 1000 sats (= min), y 1 STX (= min)
const MIN = { x: 1_000_000, y: 1_000_000 };
async function main() {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(USDCX, '(get-total-supply)');
  sid = await b.run(); console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  await ev('live core owner = the multisig', CORE, '(get-contract-owner)', CORE_OWNER);
  await deploy(N.ladder, src(N.ladder)); await deploy(N.market, src(N.market));
  await tx('sync seats', DEP, MARKET, 'sync-seat-count', [], '(ok u10)');
  await tx('market operator -> core owner', DEP, MARKET, 'set-operator', [P(CORE_OWNER)], '(ok true)');
  await tx('verify market (core owner)', CORE_OWNER, CORE, 'set-verified-contract', [P(MARKET)], '(ok true)');
  await tx('initialize market (core owner)', CORE_OWNER, MARKET, 'initialize', [P(MARKET), traits.x, traits.y, uintCV(MIN.x), uintCV(MIN.y), uintCV(45), uintCV(7)], '(ok true)');
  await tx('market operator -> DEP', CORE_OWNER, MARKET, 'set-operator', [P(DEP)], '(ok true)');
  const clock = await submitSimulationSteps(sid, { steps: [{ Eval: [DEP, '', MARKET, 'stacks-block-time'] }] });
  const stamp = Number(decode({ Result: clock.steps[0] }).slice(1));
  const first = await freshAfter(stamp), mid = first.mid;
  console.log(`  Lazer [45,7] mid ${mid} ($${Number(mid) / 1e8}/STX)`);
  // Noncrossing opposite liquidity makes both sides submit pending deposits.
  for (const side of ['x', 'y']) {
    const who = mk(side === 'x' ? 601 : 602), amount = side === 'x' ? 6 * MIN.x : 12 * MIN.y;
    await fund(side, who, amount);
    await tx('seed opposite book', who, MARKET, `deposit-token-${side}`, depArgs(side, amount, side === 'x' ? mid * 2n : mid / 2n), `(ok u${amount})`);
    if (side === 'y') await tx('admit seed', keeper, MARKET, `settle-token-${side}-deposit`, settleArgs(side, who, first), `(ok u${amount})`);
  }
  const fixtures = []; let serial = 610;
  for (const mode of ['no-update', 'market-paused', 'core-paused']) for (const side of ['x', 'y']) for (const kind of ['band']) {
    // x unit: 1 min = 1 STX (orig scale 1 x 1000 sats); y unit: 2 min = 2 USDCx (orig scale 2000 x 1000 uSTX = 2 STX)
    const scale = side === 'x' ? MIN.x / 1000 : 2 * MIN.y / 1000;
    const a = mk(serial++), memberB = mk(serial++), initial = 3000 * scale, escrow = 6000 * scale, held = 500 * scale;
    const n = ['no-update', 'market-paused', 'core-paused'].indexOf(mode), bps = 20 + 10 * n;
    const tpl = side === 'x' ? N.sellTpl : N.buyTpl;
    const name = side === 'x' ? `jing-sell-stx-usdc-${bps}` : `jing-buy-stx-usdc-${bps}`;
    const rung = `${DEP}.${name}`, ladderSide = side === 'x' ? 'sel-band' : 'buy-band';
    const label = `${tpl}/${mode}`, positionField = side === 'x' ? 'sbtc' : 'stx', heldField = side === 'x' ? 'held-ustx' : 'held-uusdcx';
    await deploy(name, src(tpl));
    await tx(`${label}: canonical`, DEP, LADDER, 'set-canonical', [stringAsciiCV(ladderSide), P(rung)], '(ok true)');
    await tx(`${label}: init`, DEP, rung, 'initialize', [uintCV(bps), boolCV(false)], '(ok true)');
    await fund(side, a, initial + held); await fund(side, memberB, escrow);
    await tx(`${label}: A deposits`, a, rung, 'deposit', [uintCV(initial)], ok);
    let toSettle = initial;
    if (mode === 'no-update') {
      // Successful young escrow placement + member exit must keep its old behavior.
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
   (is-eq (get ${heldField} (contract-call? '${rung} get-state)) u${held}))`, 'true');
    await ev(`${label}: B starts with exact shares`, rung, `(get shares (get-position '${memberB}))`, `u${escrow}`);
    fixtures.push({ label, side, rung, a, memberB, initial, escrow, held, positionField, heldField, mode, scale });
    finishPhase();
  }
  const youngUpdate = await freshAfter(stamp);
  await tx('pause market while escrow young', DEP, MARKET, 'set-paused', [boolCV(true)], '(ok true)');
  for (const f of fixtures.filter((f) => f.mode === 'market-paused')) {
    await tx(`${f.label}: young paused exit refused`, f.memberB, f.rung, 'withdraw', [uintCV(f.escrow), someCV(update(youngUpdate))], '(err u1007)');
    await ev(`${f.label}: refusal preserves pending`, MARKET, `(get amount (unwrap-panic ${pending(f.side, f.rung)}))`, `u${f.escrow}`);
  }
  await tx('unpause market', DEP, MARKET, 'set-paused', [boolCV(false)], '(ok true)');
  async function age(seconds) {
    const tip = await getSimulationTip(sid), target = stamp + seconds;
    await submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: target - Number(tip.burn_block_time) } }] });
    await ev(`exact escrow age ${seconds}`, MARKET, `(- stacks-block-time u${stamp})`, `u${seconds}`);
  }
  await age(86399);
  for (const f of fixtures.filter((f) => f.mode === 'no-update')) {
    await tx(`${f.label}: one second before timeout still needs update`, f.memberB, f.rung, 'withdraw', [uintCV(f.escrow), noneCV()], '(err u7012)');
  }
  await age(86400);
  // v1-lineage rungs (these templates) consult the escrow only when the exit
  // exceeds held + on-book (escrow-for), so A's own claim (live + held) never
  // needs it; the member whose claim IS the pending escrow (B) is the one that
  // drives the 24h recovery. Roles of the original's A / B are swapped here:
  // B exits through the recovery, A is the shareholder kept exact.
  async function exit(f, providedUpdate) {
    const { label, side, rung, a, memberB, initial, escrow, held, positionField, heldField, scale } = f, take = escrow, keep = initial + held;
    const receipt = (value) => side === 'x' ? `(ok (tuple (sbtc u${value}) (stx u0)))` : `(ok (tuple (sbtc u0) (stx u${value})))`;
    await tx(`${label}: stranger cannot trigger recovery`, keeper, rung, 'withdraw', [uintCV(1), noneCV()], '(err u7006)');
    const out = await tx(`${label}: timed-out exit returns exact B claim`, memberB, rung, 'withdraw', [uintCV(take), providedUpdate], receipt(take));
    event(`${label}: pending escrow logged as cancel`, out.receipt, side, 'pending-refund', { reason: '"cancel"', amount: `u${escrow}`, price: 'u0' });
    event(`${label}: live amount also refunded`, out.receipt, side, 'refund', { amount: `u${initial}` });
    await ev(`${label}: market position and pending cleared`, MARKET, `(and
   (is-eq ${live(side, rung)} u0) (is-eq ${parked(side, rung)} u0) (is-none ${pending(side, rung)}))`, 'true');
    await ev(`${label}: B wallet exact`, MARKET, balance(side, memberB), `u${take}`);
    await ev(`${label}: A wallet untouched`, MARKET, balance(side, a), 'u0');
    await ev(`${label}: A shares and claim unchanged`, rung, `(and
   (is-eq (get shares (get-position '${a})) u${keep})
   (is-eq (get ${positionField} (get-position '${a})) u${keep})
   (is-eq (get total-shares (get-state)) u${keep})
   (is-eq (get ${heldField} (get-state)) u${keep})
   (is-eq (get unfilled-index (get-state)) u1000000000000)
   (is-eq (get resting (get-state)) u0))`, 'true');
    await ev(`${label}: remaining funds held exactly`, MARKET, balance(side, rung), `u${keep}`);
    const part = 1000 * scale;
    await tx(`${label}: A partial withdrawal remains exact`, a, rung, 'withdraw', [uintCV(part), noneCV()], receipt(part));
    await ev(`${label}: A remaining shares exact`, rung, `(get shares (get-position '${a}))`, `u${keep - part}`);
    await tx(`${label}: A withdraws remaining claim`, a, rung, 'withdraw', [uintCV(keep - part), noneCV()], receipt(keep - part));
    await ev(`${label}: A final wallet exact`, MARKET, balance(side, a), `u${keep}`);
    await ev(`${label}: pool fully empty`, rung, `(and (is-eq (get total-shares (get-state)) u0) (is-eq (get ${heldField} (get-state)) u0))`, 'true');
    await ev(`${label}: no funds left at rung`, MARKET, balance(side, rung), 'u0');
    finishPhase();
  }
  for (const f of fixtures.filter((f) => f.mode === 'no-update')) await exit(f, noneCV());
  await age(86401);
  await tx('pause market after timeout', DEP, MARKET, 'set-paused', [boolCV(true)], '(ok true)');
  for (const f of fixtures.filter((f) => f.mode === 'market-paused')) await exit(f, noneCV());
  await ev('recovery leaves market paused', MARKET, '(var-get paused)', 'true');
  await tx('unpause market for core-only pause', DEP, MARKET, 'set-paused', [boolCV(false)], '(ok true)');
  await tx('pause core (core owner)', CORE_OWNER, CORE, 'pause', [], '(ok true)');
  // Deliberately invalid update: old escrow must not try to read it.
  for (const f of fixtures.filter((f) => f.mode === 'core-paused')) await exit(f, someCV(bufferCV(Buffer.from('00', 'hex'))));
  await ev('recovery leaves core paused', CORE, '(var-get paused)', 'true');
  finishPhase(); console.log(`${passed}/${checks} checks green`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
