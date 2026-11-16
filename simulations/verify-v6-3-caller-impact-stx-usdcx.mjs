// STX/USDCx port of verify-v6-3-caller-impact.js (six-rung queue-refund / exit
// audit, real source and real Lazer [45, 7]). Fork only, at the tip.
// Run: node simulations/verify-v6-3-caller-impact-stx-usdcx.mjs
//
// Differences from the sBTC/STX original (see _stx-usdcx-v6-common.mjs):
// - jing-core-v6 is the LIVE one (not redeployed); its owner is the multisig
//   CORE_OWNER, so verify / initialize / core pause are sent as CORE_OWNER.
//   initialize needs operator = core owner: DEP hands the operator over and
//   takes it back (DEP stays operator for set-paused / set-distance-slots).
// - token x = native STX (uSTX), token y = USDCx (uUSDCx); mins 1 STX / 1 USDCx.
//   Original sizes were x 3000 sats = 3 x min-x, y 6 STX = 6 x min-y; kept as
//   x 3 STX (3 x min), y 6 USDCx (6 x min); incumbents rest twice that.
// - Only BAND rungs exist on this set: fixed (jing-*-stx) and peg
//   (jing-*-stx-market-spread) rungs are N/A (no fixed/peg rung on the
//   STX/USDCx set). Per side the band rung is the role match:
//   x (rests STX)   = jing-sell-stx-usdc-20 ("sel-band", held-ustx)
//   y (rests USDCx) = jing-buy-stx-usdc-20  ("buy-band", held-uusdcx)
// - The final core-pause section used the fixed rungs as its pending
//   placements; here the band rungs take that role (same subject: a rung's
//   pending exit under a core pause).
import { uintCV, stringAsciiCV, noneCV, someCV, boolCV, makeUnsignedSTXTokenTransfer, deserializeCV, cvToString, makeUnsignedContractDeploy, ClarityVersion, PostConditionMode } from '@stacks/transactions';
import { SimulationBuilder, getSimulationResult, getSimulationTip, submitSimulationSteps, callContract, getNonce, setSender } from 'stxer';
import { installChunkedSubmit } from './_chunked-submit.js';
import { installRetrySubmit } from './_retry-submit.js';
import { NODE, DEP, CORE, CORE_OWNER, USDCX, STX_WHALES, USDCX_WHALES, N, C, RUNG, LADDER_SIDE, P_, traits, assets, mk, MIN, balanceExpr, src, freshAfter, updCV } from './_stx-usdcx-v6-common.mjs';

installChunkedSubmit();
installRetrySubmit();

const principal = P_;
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
const settleArgs = (side, who, u) => [principal(who), update(u), traits[side], assets[side]];

function event(label, receipt, side, name, fields = {}) {
  const prints = receipt.events.map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.committed && e.contract_event?.contract_identifier === CORE)
    .map((e) => cv(e.contract_event.raw_value));
  check(label, prints.join(' | '), () => prints.some((value) => value.includes(`(event "${name}${side ? `-${side}` : ''}")`) &&
    Object.entries(fields).every(([key, val]) => value.includes(`(${key} ${val})`))));
}
async function fund(side, who, amount) {
  if (side === 'y') {
    await tx('fund fresh USDCx', USDCX_WHALES[0], USDCX, 'transfer', [uintCV(amount), principal(USDCX_WHALES[0]), principal(who), noneCV()], '(ok true)');
  } else {
    const raw = await makeUnsignedSTXTokenTransfer({ recipient: who, amount, nonce: await getNonce(sid, STX_WHALES[0]), network: 'mainnet', publicKey: '', fee: 0 });
    setSender(raw, STX_WHALES[0]);
    const out = await submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] });
    check('fund fresh STX', decode({ Result: out.steps[0] }), '(ok true)');
  }
  finishPhase();
}
const MARKET = C.market, LADDER = C.ladder;
async function deploy(name, file) {
  const raw = await makeUnsignedContractDeploy({ contractName: name, codeBody: src(file ?? name), clarityVersion: ClarityVersion.Clarity5, nonce: await getNonce(sid, DEP), network: 'mainnet', publicKey: '', fee: 0, postConditionMode: PostConditionMode.Allow });
  setSender(raw, DEP); const out = await submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] });
  check(`deploy ${name}`, decode({ Result: out.steps[0] }), ok); finishPhase();
}
async function main() {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(CORE, '(get-contract-owner)');
  for (let k = 0; ; k++) { try { sid = await b.run(); break; } catch (e) { if (k >= 5) throw e; console.log(`  builder run failed (${e.message}), retry in 15s`); await new Promise((r) => setTimeout(r, 15000)); } }
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const r = await getSimulationResult(sid);
  check('live core owner = CORE_OWNER multisig', decode(r.steps.find((s) => s.Result?.Eval)), CORE_OWNER); finishPhase();
  await deploy(N.ladder); await deploy(N.market);
  await tx('reserve 49 seats', DEP, LADDER, 'set-max-band-per-side', [uintCV(49)], '(ok true)');
  await tx('sync seats', DEP, MARKET, 'sync-seat-count', [], '(ok u49)');
  await tx('verify market (core owner)', CORE_OWNER, CORE, 'set-verified-contract', [principal(MARKET)], '(ok true)');
  await tx('operator -> core owner', DEP, MARKET, 'set-operator', [principal(CORE_OWNER)], '(ok true)');
  await tx('initialize market (core owner)', CORE_OWNER, MARKET, 'initialize', [principal(MARKET), traits.x, traits.y, uintCV(MIN.x), uintCV(MIN.y), uintCV(45), uintCV(7)], '(ok true)');
  await tx('operator -> DEP', CORE_OWNER, MARKET, 'set-operator', [principal(DEP)], '(ok true)');
  await tx('size queue', DEP, MARKET, 'set-distance-slots', [uintCV(0)], '(ok true)');
  finishPhase();
  const tip = await getSimulationTip(sid);
  const stamp = Number(tip.block_time);
  const initial = await freshAfter(0);
  const mid = initial.mid;
  console.log(`  Lazer STX/USDC mid ${mid} ($${Number(mid) / 1e8}), fork block_time ${stamp}`);
  let i = 0; const parkedRungs = [];
  for (const side of ['x', 'y']) {
    // x: 3 STX (3 x min-x), y: 6 USDCx (6 x min-y), as the original's 3000 sats / 6 STX
    const amount = side === 'x' ? 3 * Number(MIN.x) : 6 * Number(MIN.y), big = amount * 2;
    const incumbent = mk(981 + i++), limit = side === 'x' ? mid * 2n : mid / 2n;
    await fund(side, incumbent, big);
    await tx(`${side}: incumbent rests`, incumbent, MARKET, `deposit-token-${side}`, depArgs(side, big, limit), `(ok u${big})`);
    for (const kind of ['band']) { // fixed + peg: N/A on the STX/USDCx set
      const who = mk(981 + i++);
      const name = RUNG[side](20), file = side === 'x' ? N.sellTpl : N.buyTpl;
      const rung = `${DEP}.${name}`, ladderSide = LADDER_SIDE[side], held = side === 'x' ? 'held-ustx' : 'held-uusdcx';
      await deploy(name, file);
      parkedRungs.push({ side, rung, who, amount });
      await tx(`${name}: canonical`, DEP, LADDER, 'set-canonical', [stringAsciiCV(ladderSide), principal(rung)], '(ok true)');
      await tx(`${name}: initialize unseated`, DEP, rung, 'initialize', [uintCV(20), boolCV(false)], '(ok true)');
      await fund(side, who, amount);
      await tx(`${name}: member submit`, who, rung, 'deposit', [uintCV(amount)], ok);
      await ev(`${name}: pending escrow exact`, MARKET, `(get amount (unwrap-panic ${pending(side, rung)}))`, `u${amount}`);
      await ev(`${name}: pooled counts escrow`, rung, `(get pooled (get-state))`, `u${amount}`);
      await ev(`${name}: resting label includes UNSETTLED escrow`, rung, `(get resting (get-state))`, `u${amount}`);
      await tx(`${name}: exit still requires update despite cancel capability`, who, rung, 'withdraw', [uintCV(amount), noneCV()], '(err u7012)');
      const fresh = await freshAfter(stamp);
      await tx('pause market', DEP, MARKET, 'set-paused', [boolCV(true)], '(ok true)');
      await tx(`${name}: pending exit blocked by market pause`, who, rung, 'withdraw', [uintCV(amount), someCV(update(fresh))], '(err u1007)');
      await tx('unpause market', DEP, MARKET, 'set-paused', [boolCV(false)], '(ok true)');
      const settled = await tx(`${name}: keeper settle refunds queue-full`, keeper, MARKET, `settle-token-${side}-deposit`, settleArgs(side, rung, fresh), `(ok u${amount})`);
      event(`${name}: refund reason`, settled.receipt, side, 'pending-refund', { reason: '"queue-full"', amount: `u${amount}` });
      await ev(`${name}: no live order after refund`, MARKET, live(side, rung), 'u0');
      await ev(`${name}: refunded tokens held in rung wallet`, MARKET, balance(side, rung), `u${amount}`);
      await ev(`${name}: held field stale until sync`, rung, `(get ${held} (get-state))`, 'u0');
      await tx(`${name}: reconcile refund`, keeper, rung, 'sync', [], '(ok true)');
      await ev(`${name}: shares preserved, no false fill`, rung, `(and (is-eq (get pooled (get-state)) u${amount}) (is-eq (get ${held} (get-state)) u${amount}) (is-eq (get unfilled-index (get-state)) u1000000000000) (is-eq (get resting (get-state)) u0))`, 'true');
      await ev(`${name}: incumbent untouched`, MARKET, live(side, incumbent), `u${big}`);
      await tx(`${name}: exit refunded wallet without oracle`, who, rung, 'withdraw', [uintCV(amount), noneCV()], side === 'x' ? `(ok (tuple (sbtc u${amount}) (stx u0)))` : `(ok (tuple (sbtc u0) (stx u${amount})))`);
      await ev(`${name}: member exact returned amount`, MARKET, balance(side, who), `u${amount}`);
      await ev(`${name}: empty pool`, rung, '(get total-shares (get-state))', 'u0');
      // Repeat through the rung's OWN settle-before-withdraw helper.
      await tx(`${name}: resubmit refunded principal`, who, rung, 'deposit', [uintCV(amount)], ok);
      const ownExit = await tx(`${name}: own exit settles refund then pays member`, who, rung, 'withdraw', [uintCV(amount), someCV(update(fresh))], side === 'x' ? `(ok (tuple (sbtc u${amount}) (stx u0)))` : `(ok (tuple (sbtc u0) (stx u${amount})))`);
      event(`${name}: own exit refund reason`, ownExit.receipt, side, 'pending-refund', { reason: '"queue-full"', amount: `u${amount}` });
      await ev(`${name}: own exit leaves no pending or shares`, MARKET, `(and (is-none ${pending(side, rung)}) (is-eq (get total-shares (contract-call? '${rung} get-state)) u0))`, 'true');
      await ev(`${name}: own exit exact member refund`, MARKET, balance(side, who), `u${amount}`); finishPhase();
    }
    await tx(`${side}: remove incumbent`, incumbent, MARKET, `cancel-token-${side}-deposit`, [traits[side], assets[side]], `(ok u${big})`);
  }
  // A core pause prevents placement, even though the market's cancel is open.
  await tx('reserve 48 for placement-pending exits', DEP, LADDER, 'set-max-band-per-side', [uintCV(48)], '(ok true)');
  await tx('sync 48 seats', DEP, MARKET, 'sync-seat-count', [], '(ok u48)');
  for (const side of ['x', 'y']) {
    // original 6000 sats / 12 STX = 6 x min-x / 12 x min-y
    const owner = mk(side === 'x' ? 997 : 998), a = side === 'x' ? 6 * Number(MIN.x) : 12 * Number(MIN.y), l = side === 'x' ? mid * 2n : mid / 2n;
    await fund(side, owner, a); await tx('prepare noncrossing book', owner, MARKET, `deposit-token-${side}`, depArgs(side, a, l), `(ok u${a})`);
    if (side === 'y') await tx('admit opposite', keeper, MARKET, 'settle-token-y-deposit', settleArgs(side, owner, await freshAfter(stamp)), `(ok u${a})`);
  }
  // the original used its fixed rungs here; the band rungs (empty after own exit) take their place
  for (const { side, rung, who, amount } of parkedRungs) {
    await tx('prepare pending rung placement', who, rung, 'deposit', [uintCV(amount)], ok);
    await ev('placement waits in pending', MARKET, `(get amount (unwrap-panic ${pending(side, rung)}))`, `u${amount}`);
  }
  await tx('pause core (core owner)', CORE_OWNER, CORE, 'pause', [], '(ok true)');
  for (const { side, rung, who, amount } of parkedRungs) {
    await tx(`${side}: core pause blocks rung pending exit`, who, rung, 'withdraw', [uintCV(amount), someCV(update(await freshAfter(stamp)))], '(err u5016)');
    await ev(`${side}: exit refusal retains exact escrow`, MARKET, `(get amount (unwrap-panic ${pending(side, rung)}))`, `u${amount}`);
  }
  finishPhase();
  console.log(`${passed}/${checks} checks green`);
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
