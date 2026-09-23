// Fork only. Run: node simulations/verify-v6-3-submit-settle-lazer.js
// Mainnet-fork submit/settle regression. Stops at the first failing scenario.
// Coverage is recorded in verify-v6-3-submit-settle-coverage.md.
// No source substitution, fake oracle, or mainnet broadcasts. One explicitly
// labelled, fully funded cancel fixture splits live/parked storage via Eval.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV,
  standardPrincipalCV, noneCV, someCV, boolCV, makeUnsignedSTXTokenTransfer,
  deserializeCV, cvToString, getAddressFromPrivateKey, makeUnsignedContractDeploy, PostConditionMode,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, getSimulationTip,
  submitSimulationSteps, callContract, getNonce, setSender,
} from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const CORE = `${DEP}.jing-core-v6`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const STX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALES = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51' };
const principal = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const traits = { x: principal(SBTC), y: principal(STX) };
const assets = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const keeper = mk(871);
const source = (name) => fs.readFileSync(new URL(`../contracts/${name}.clar`, import.meta.url), 'utf8');
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
const update = (u) => bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex'));
let passed = 0, checks = 0, failures = 0, sid;
function check(label, actual, want) {
  checks++;
  const good = typeof want === 'function' ? want(actual) : actual === want;
  if (good) passed++; else failures++;
  console.log(`${good ? 'ok  ' : 'FAIL'} ${checks}. ${label}: ${String(actual).slice(0, 700)}${good ? '' : `; expected ${want}`}`);
  return good;
}
function finishPhase() {
  if (failures) {
    console.log(`${passed}/${checks} checks green`);
    throw new Error(`Stopped on failed checks. Fork: https://stxer.xyz/simulations/mainnet/${sid}`);
  }
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
const balance = (side, p) => side === 'y' ? `(stx-get-balance '${p})` : `(unwrap-panic (contract-call? '${SBTC} get-balance '${p}))`;
const pending = (side, p) => `(get-token-${side}-pending-deposit '${p})`;
const live = (side, p) => `(get-token-${side}-deposit (var-get current-cycle) '${p})`;
const depArgs = (side, amount, limit) => [uintCV(amount), uintCV(limit), noneCV(), traits[side], assets[side]];
const settleArgs = (side, who, u) => [principal(who), update(u), traits[side], assets[side]];

async function main() {
  let b = SimulationBuilder.new({ stacksNodeAPI: 'http://77.42.3.101/stacks-api' });
  const steps = [];
  const add = (label, build, want) => { b = build(b); steps.push({ label, want }); };
  const call = (sender, cid, fn, args) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const read = (label, cid, code, want) => add(label, (bb) => bb.addEvalCode(cid, code), want);
  const deploy = (name, file = name) => add(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: source(file), clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes('ERR'));
  deploy('jing-core-v6');
  deploy('jing-ladder-v1');
  // Reserve 49 protected seats, leaving one public seat. This reaches the
  // ordinary full-side branch with two principals instead of 41. No seats
  // are fabricated; use the public ladder and market operator APIs.
  add('reserve 49 seats', call(DEP, `${DEP}.jing-ladder-v1`, 'set-max-band-per-side', [uintCV(49)]), '(ok true)');
  const u1 = await fetchLazerUpdateAny();
  const times1 = await lazerFeedTimes(u1.hex);
  const mid = u1.px * 100_000_000n / u1.py;
  const cases = ['x', 'y'].map((side, i) => ({
    side, name: `submit-settle-${side}`, cid: `${DEP}.submit-settle-${side}`,
    maker: mk(872 + i * 2), entrant: mk(873 + i * 2),
    big: side === 'x' ? 6000 : 12_000_000,
    small: side === 'x' ? 3000 : 6_000_000,
    limit: side === 'x' ? mid * 2n : mid / 2n,
  }));
  for (const c of cases) {
    const { side, name, cid, maker, entrant, big, small, limit } = c;
    deploy(name, 'markets-sbtc-stx-jing-v6-3');
    add(`${side}: sync seats`, call(DEP, cid, 'sync-seat-count', []), '(ok u49)');
    add(`${side}: verify`, call(DEP, CORE, 'set-verified-contract', [principal(cid)]), '(ok true)');
    add(`${side}: initialize/register`, call(DEP, cid, 'initialize', [principal(cid), traits.x, traits.y, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), '(ok true)');
    read(`${side}: registered in core-v6`, CORE, `(is-registered '${cid})`, 'true');
    // Disable price-priority slots to isolate the size-based queue branch.
    add(`${side}: use size queue`, call(DEP, cid, 'set-distance-slots', [uintCV(0)]), '(ok true)');
    for (const [p, amount] of [[maker, big], [entrant, small]]) {
      read(`${side}: fresh principal balance`, cid, balance(side, p), 'u0');
      add(`${side}: fund ${p}`, side === 'x'
        ? call(WHALES.x, SBTC, 'transfer', [uintCV(amount), principal(WHALES.x), principal(p), noneCV()])
        : (bb) => bb.withSender(WHALES.y).addSTXTransfer({ recipient: p, amount }), ok);
    }
    add(`${side}: direct deposit with opposite empty`, call(maker, cid, `deposit-token-${side}`, depArgs(side, big, limit)), `(ok u${big})`);
    read(`${side}: direct has no pending`, cid, pending(side, maker), 'none');
    read(`${side}: direct book amount`, cid, live(side, maker), `u${big}`);
    read(`${side}: direct book limit`, cid, `(get-token-${side}-limit '${maker})`, `u${limit}`);
    read(`${side}: direct exact balance`, cid, balance(side, maker), 'u0');
    read(`${side}: side is full`, cid, `(side-full-${side} (get-token-${side}-depositors (var-get current-cycle)) '${entrant})`, 'true');
  }
  sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const setup = (await getSimulationResult(sid)).steps.filter((s) => s.Result?.Transaction || s.Result?.Eval);
  if (setup.length !== steps.length) throw new Error('Setup result count mismatch');
  steps.forEach((s, i) => check(s.label, decode(setup[i]), s.want));
  finishPhase();

  // Probe first: pin submit time to a real signed U1 feed timestamp. The
  // interval is relative to burn time, NOT the previous Stacks block time.
  const tip = await getSimulationTip(sid);
  const stamp = Math.max(times1.at, Number(tip.block_time));
  if (stamp - times1.at >= 80) throw new Error('U1 too old; rerun for a fresh probe');
  const interval = stamp - Number(tip.burn_block_time);
  if (interval <= 0) throw new Error('Cannot advance to U1 timestamp');
  await submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: {
    bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: interval,
  } }] });
  await ev('probe: exact simulated submit time', cases[0].cid, 'stacks-block-time', `u${stamp}`);
  finishPhase();
  // Three-step real-market probe: submit, settle with U1, inspect pending.
  const first = cases[0];
  await tx('probe: submit x escrow', first.entrant, first.cid, 'deposit-token-x', depArgs('x', first.small, first.limit), `(ok u${first.small})`);
  await tx('probe: U1 is fresh but not after submit', keeper, first.cid, 'settle-token-x-deposit', settleArgs('x', first.entrant, u1), '(err u1032)');
  await ev('probe: escrow survives old-price rejection', first.cid, `(get submitted-at (unwrap-panic ${pending('x', first.entrant)}))`, `u${stamp}`);
  finishPhase();
  const second = cases[1];
  await tx('y: submit escrow', second.entrant, second.cid, 'deposit-token-y', depArgs('y', second.small, second.limit), `(ok u${second.small})`);
  for (const c of cases) {
    const { side, cid, entrant, small, big, limit } = c;
    await tx(`${side}: double deposit refused`, entrant, cid, `deposit-token-${side}`, depArgs(side, small, limit), '(err u1031)');
    await tx(`${side}: wrong-trait cancel preserves pending escrow`, entrant, cid, `cancel-token-${side}-deposit`, [traits[other(side)], assets[side]], '(err u1013)');
    await tx(`${side}: withdraw cannot withdraw pending-only escrow`, entrant, cid, `withdraw-token-${side}`, [uintCV(1), traits[side], assets[side]], '(err u1005)');
    await ev(`${side}: escrow exact`, cid, balance(side, entrant), 'u0');
    await ev(`${side}: book plus pending equals market balance`, cid, balance(side, cid), `u${big + small}`);
    await ev(`${side}: pending not on book`, cid, live(side, entrant), 'u0');
  }
  finishPhase();
  // Fetch U2 only AFTER submissions have executed. Decode per-feed times;
  // the keyless route's envelope timestamp alone is insufficient.
  let u2, times2;
  for (let attempt = 0; attempt < 30; attempt++) {
    u2 = await fetchLazerUpdateAny();
    times2 = await lazerFeedTimes(u2.hex);
    if (times2.at > stamp) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (times2.at <= stamp) throw new Error('No post-submit U2 within 60 seconds');
  console.log(`Timing: U1 at=${times1.at}, submitted-at=${stamp}, U2 at=${times2.at}`);
  // A failed queue admission must clear pending and refund, per matrix row 4.
  // Read diagnostics after the failure, then STOP; do not continue the matrix.
  for (const c of cases) {
    const { side, cid, entrant, small, big } = c;
    const r = await tx(`${side}: too-small full-side settle refunds`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, entrant, u2), `(ok u${small})`);
    await ev(`${side}: refusal clears pending`, cid, pending(side, entrant), 'none');
    await ev(`${side}: refusal restores exact starting balance`, cid, balance(side, entrant), `u${small}`);
    await ev(`${side}: refusal leaves only book balance`, cid, balance(side, cid), `u${big}`);
    const events = r.receipt.events.map((e) => typeof e === 'string' ? JSON.parse(e) : e);
    // Print raw events for review; match decoded Clarity print values.
    const strings = JSON.stringify(events);
    const decoded = strings.replace(/"(?:0x)?([0-9a-f]{20,})"/g, (all, hex) => {
      try { return JSON.stringify(cv(hex)); } catch { return all; }
    });
    check(`${side}: refusal logs queue-full`, decoded, (v) => v.includes('queue-full') && v.includes(`pending-refund-${side}`));
    if (failures) {
      console.log(`CONTRACT FAILURE: settle-token-${side}-deposit; queue rejection rolls back pending deletion and retains escrow. See market lines ${side === 'x' ? '1539-1564, 887-893' : '1336-1361, 796-802'}.`);
      finishPhase();
    }
  }
  await depositAndReadmitCoverage(cases, { u1, stamp });
  await limitAndRepriceCoverage(cases, { u1, stamp, mid });
  await pendingAndTakerCoverage(cases, { u1, stamp, mid });
  await batchFillCoverage(cases, { stamp });
  await queueFallbackCoverage(cases, { stamp, mid });
  await minimumCoverage(cases, { stamp, mid });
  await raisedMinimumAfterParkingCoverage(cases, { stamp, mid });
  await swapMinimumCoverage(cases, { stamp });
  await swapZeroLimitCoverage({ stamp });
  await cancelRecoveryCoverage({ stamp });
  console.log(`${passed}/${checks} checks green`);
  console.log('Covered phases: queue refusal, deposit admission/guards, readmit lifecycle, limits/reprice, moving book.');
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });

const other = (side) => side === 'x' ? 'y' : 'x';
const parked = (side, p) => `(get-token-${side}-parked '${p})`;
const pendingKind = (side, kind, p) => `(get-token-${side}-pending-${kind} '${p})`;
const order = (side, p) => `(get-token-${side}-order '${p})`;
const pairArgs = () => [traits.x, assets.x, traits.y, assets.y];
const zeroSwap = '(ok (tuple (rebate-refunded u0) (token-x-received u0) (token-x-rolled u0) (token-y-received u0) (token-y-rolled u0)))';
async function freshAfter(stamp) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const u = await fetchLazerUpdateAny();
    const times = await lazerFeedTimes(u.hex);
    if (times.at > stamp) return u;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`No newer signed feed after ${stamp}`);
}
function event(label, receipt, side, name, fields = {}) {
  const prints = receipt.events.map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.committed && e.contract_event?.contract_identifier === CORE)
    .map((e) => cv(e.contract_event.raw_value));
  check(label, prints.join(' | '), () => prints.some((value) => value.includes(`(event "${name}${side ? `-${side}` : ''}")`) &&
    Object.entries(fields).every(([key, val]) => value.includes(`(${key} ${val})`))));
}
async function fund(side, who, amount) {
  if (side === 'x') {
    await tx('fund fresh sBTC', WHALES.x, SBTC, 'transfer', [uintCV(amount), principal(WHALES.x), principal(who), noneCV()], '(ok true)');
  } else {
    const raw = await makeUnsignedSTXTokenTransfer({ recipient: who, amount, nonce: await getNonce(sid, WHALES.y), network: 'mainnet', publicKey: '', fee: 0 });
    setSender(raw, WHALES.y);
    const out = await submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] });
    check('fund fresh STX', decode({ Result: out.steps[0] }), '(ok true)');
  }
  finishPhase();
}
async function noPending(side, cid, who, kind, u) {
  const args = [principal(who), update(u), ...(kind === 'deposit' ? [traits[side], assets[side]] : [])];
  await tx(`${side}: ${kind} nothing pending`, keeper, cid, `settle-token-${side}-${kind}`, args, '(err u1030)');
}
async function paused(cid, value) {
  await tx(`market pause=${value}`, DEP, cid, 'set-paused', [boolCV(value)], '(ok true)');
}
async function cancel(side, cid, who, amount) {
  await tx(`${side}: cancel ${amount}`, who, cid, `cancel-token-${side}-deposit`, [traits[side], assets[side]], `(ok u${amount})`);
}
async function depositAndReadmitCoverage(cases, { u1, stamp }) {
  console.log('PHASE: deposit admission and readmit lifecycle, both sides');
  for (const c of cases) {
    const { side, cid, maker, entrant, big, small, limit } = c;
    const opp = other(side), admitted = big * 2;
    for (const kind of ['deposit', 'limit', 'readmit']) await noPending(side, cid, maker, kind, u1);
    await tx(`${side}: wrong deposit trait`, entrant, cid, `deposit-token-${side}`, [uintCV(small), uintCV(limit), noneCV(), traits[opp], assets[opp]], '(err u1013)');
    await paused(cid, true);
    await tx(`${side}: paused submit`, entrant, cid, `deposit-token-${side}`, depArgs(side, small, limit), '(err u1007)');
    // PLOB heuristic 6: quoting remains available while paused.
    await tx(`${side}: direct limit while paused`, maker, cid, `set-token-${side}-limit`, [uintCV(limit), noneCV()], '(ok true)');
    await paused(cid, false);
    await tx(`${side}: direct reprice with empty opposite book`, maker, cid, `reprice-or-swap-token-${side}`, [uintCV(limit), noneCV(), update(u1), ...pairArgs()], zeroSwap);
    await ev(`${side}: direct reprice has no pending limit`, cid, pendingKind(side, 'limit', maker), 'none');
    await fund(side, entrant, admitted - small);
    await tx(`${side}: larger entrant submits escrow`, entrant, cid, `deposit-token-${side}`, depArgs(side, admitted, limit), `(ok u${admitted})`);
    await ev(`${side}: pending stores exact amount/limit/time`, cid,
      `(is-eq ${pending(side, entrant)} (some { amount: u${admitted}, limit: u${limit}, spread-bps: none, submitted-at: u${stamp} }))`, 'true');
    await tx(`${side}: old price cannot admit`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, entrant, u1), '(err u1032)');
    let fresh = await freshAfter(stamp);
    await tx(`${side}: wrong settlement trait`, keeper, cid, `settle-token-${side}-deposit`, [principal(entrant), update(fresh), traits[opp], assets[opp]], '(err u1013)');
    await paused(cid, true);
    await tx(`${side}: paused settlement`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, entrant, fresh), '(err u1007)');
    await paused(cid, false);
    const admission = await tx(`${side}: third-party admission parks incumbent`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, entrant, fresh), `(ok u${admitted})`);
    event(`${side}: successful deposit log attributes entrant`, admission.receipt, side, 'deposit', { depositor: entrant });
    await ev(`${side}: admitted pending cleared`, cid, pending(side, entrant), 'none');
    await ev(`${side}: entrant is live`, cid, live(side, entrant), `u${admitted}`);
    await ev(`${side}: admitted order exact`, cid, `(is-eq ${order(side, entrant)} { limit: u${limit}, spread-bps: none })`, 'true');
    await ev(`${side}: incumbent parked`, cid, parked(side, maker), `u${big}`);
    await ev(`${side}: incumbent no longer live`, cid, live(side, maker), 'u0');
    await ev(`${side}: no second escrow transfer`, cid, balance(side, entrant), 'u0');
    await ev(`${side}: keeper receives no funds`, cid, balance(side, keeper), 'u0');
    await ev(`${side}: keeper receives no order`, cid, live(side, keeper), 'u0');
    await ev(`${side}: balance equals book plus parked`, cid, balance(side, cid), `u${big + admitted}`);
    finishPhase();

    const submitReadmit = () => tx(`${side}: permissionless readmit submit`, keeper, cid, `readmit-token-${side}`, [principal(maker)], `(ok u${big})`);
    const settleReadmit = (label, u, want) => tx(`${side}: ${label}`, keeper, cid, `settle-token-${side}-readmit`, [principal(maker), update(u)], want);
    await submitReadmit();
    await ev(`${side}: readmit pending timestamp`, cid, pendingKind(side, 'readmit', maker), `(some u${stamp})`);
    await tx(`${side}: double readmit refused`, keeper, cid, `readmit-token-${side}`, [principal(maker)], '(err u1031)');
    await settleReadmit('old-price readmit refused', u1, '(err u1032)');
    await paused(cid, true);
    await tx(`${side}: paused readmit submit`, keeper, cid, `readmit-token-${side}`, [principal(maker)], '(err u1007)');
    await settleReadmit('paused readmit settle', fresh, '(err u1007)');
    await paused(cid, false);
    fresh = await freshAfter(stamp);
    const full = await settleReadmit('full-side readmit refusal', fresh, '(ok u0)');
    event(`${side}: full readmit logs reason`, full.receipt, side, 'settle-refused', { action: '"readmit"', reason: '"queue-full"' });
    await ev(`${side}: refused readmit cleared`, cid, pendingKind(side, 'readmit', maker), 'none');
    await ev(`${side}: refused readmit preserves parked amount`, cid, parked(side, maker), `u${big}`);
    await ev(`${side}: refused readmit transfers nothing`, cid, balance(side, maker), 'u0');
    await submitReadmit();
    await cancel(side, cid, entrant, admitted);
    fresh = await freshAfter(stamp);
    const r = await settleReadmit('seat freed after submit: readmit succeeds', fresh, `(ok u${big})`);
    event(`${side}: readmit log`, r.receipt, side, 'readmit');
    await ev(`${side}: readmit clears parked`, cid, parked(side, maker), 'u0');
    await ev(`${side}: readmit book amount exact`, cid, live(side, maker), `u${big}`);
    await ev(`${side}: readmit pending cleared`, cid, pendingKind(side, 'readmit', maker), 'none');
    await ev(`${side}: readmit custody exact`, cid, balance(side, cid), `u${big}`);
    await ev(`${side}: readmit recipient did not pay again`, cid, balance(side, maker), 'u0');
    finishPhase();

    await tx(`${side}: park again: submit larger entrant`, entrant, cid, `deposit-token-${side}`, depArgs(side, admitted, limit), `(ok u${admitted})`);
    fresh = await freshAfter(stamp);
    await tx(`${side}: park again: settle entrant`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, entrant, fresh), `(ok u${admitted})`);
    // Readmit evaluates the opposite book at settle, even if it was empty
    // when the readmit was submitted. This is a refusal, not a refund:
    // the owner's already-parked amount remains withdrawable.
    const readmitOpponent = mk(side === 'x' ? 910 : 911);
    const readmitOppAmount = opp === 'x' ? 6000 : 12_000_000;
    const crossingLimit = side === 'x' ? limit / 4n : limit * 4n;
    const oppWillingLimit = limit;
    await tx(`${side}: parked maker sets crossing quote directly`, maker, cid, `set-token-${side}-limit`, [uintCV(crossingLimit), noneCV()], '(ok true)');
    await submitReadmit();
    await cancel(side, cid, entrant, admitted);
    await fund(opp, readmitOpponent, readmitOppAmount);
    await tx(`${side}: opposite arrives after readmit submit`, readmitOpponent, cid, `deposit-token-${opp}`, depArgs(opp, readmitOppAmount, oppWillingLimit), `(ok u${readmitOppAmount})`);
    fresh = await freshAfter(stamp);
    const crossingReadmit = await settleReadmit('moved opposite book refuses readmit', fresh, '(ok u0)');
    event(`${side}: crossing readmit logs reason`, crossingReadmit.receipt, side, 'settle-refused', { action: '"readmit"', reason: '"crossing"' });
    await ev(`${side}: crossing readmit stays parked`, cid, parked(side, maker), `u${big}`);
    await ev(`${side}: crossing readmit cleared`, cid, pendingKind(side, 'readmit', maker), 'none');
    await cancel(opp, cid, readmitOpponent, readmitOppAmount);
    await tx(`${side}: restore parked maker quote directly`, maker, cid, `set-token-${side}-limit`, [uintCV(limit), noneCV()], '(ok true)');
    await tx(`${side}: restore live entrant directly`, entrant, cid, `deposit-token-${side}`, depArgs(side, admitted, limit), `(ok u${admitted})`);
    await submitReadmit();
    await cancel(side, cid, maker, big);
    fresh = await freshAfter(stamp);
    await settleReadmit('cancel clears readmit before settlement', fresh, '(err u1030)');
    await ev(`${side}: cancel clears parked readmit state`, cid, parked(side, maker), 'u0');
    await ev(`${side}: canceled readmit cleared`, cid, pendingKind(side, 'readmit', maker), 'none');
    await ev(`${side}: canceled parked funds exact`, cid, balance(side, maker), `u${big}`);
    await tx(`${side}: readmit requires parked funds`, keeper, cid, `readmit-token-${side}`, [principal(maker)], '(err u1022)');
    finishPhase();
  }
}

async function limitAndRepriceCoverage(cases, { u1, stamp, mid }) {
  console.log('PHASE: limits/reprice, pending replacement, and settle-time classification');
  await tx('restore normal public capacity', DEP, `${DEP}.jing-ladder-v1`, 'set-max-band-per-side', [uintCV(10)], '(ok true)');
  for (const [i, c] of cases.entries()) {
    const { side, cid, maker, entrant, big, limit } = c;
    const opp = other(side), opposing = mk(890 + i), oppAmount = opp === 'x' ? 6000 : 12_000_000;
    c.opposing = opposing;
    c.oppAmount = oppAmount;
    const safe = side === 'x' ? mid * 3n : mid / 3n;
    const safe2 = side === 'x' ? mid * 4n : mid / 4n;
    const cross = side === 'x' ? mid / 2n : mid * 2n;
    const oppSafe = opp === 'x' ? mid * 2n : mid / 2n;
    const oppCross = opp === 'x' ? mid / 2n : mid * 2n;
    const limitArgs = (p, u) => [principal(p), update(u)];
    const settleLimit = (p, u, want, label = 'settle limit') => tx(`${side}: ${label}`, keeper, cid, `settle-token-${side}-limit`, limitArgs(p, u), want);
    const reprice = (p, value, u, want, label = 'maker reprice', extra = pairArgs()) => tx(`${side}: ${label}`, p, cid, `reprice-or-swap-token-${side}`, [uintCV(value), noneCV(), update(u), ...extra], want);
    await tx(`${side}: sync normal capacity`, DEP, cid, 'sync-seat-count', [], '(ok u10)');
    await fund(opp, opposing, oppAmount);
    await tx(`${side}: opposite book submit`, opposing, cid, `deposit-token-${opp}`, depArgs(opp, oppAmount, oppSafe), `(ok u${oppAmount})`);
    let fresh = await freshAfter(stamp);
    await tx(`${side}: opposite book admit`, keeper, cid, `settle-token-${opp}-deposit`, settleArgs(opp, opposing, fresh), `(ok u${oppAmount})`);
    await tx(`${side}: limit submit`, entrant, cid, `set-token-${side}-limit`, [uintCV(safe), noneCV()], '(ok false)');
    await ev(`${side}: pending limit exact`, cid,
      `(is-eq ${pendingKind(side, 'limit', entrant)} (some { limit: u${safe}, spread-bps: none, submitted-at: u${stamp} }))`, 'true');
    await ev(`${side}: old quote remains until settle`, cid, `(get-token-${side}-limit '${entrant})`, `u${limit}`);
    await settleLimit(entrant, u1, '(err u1032)', 'old limit price refused');
    fresh = await freshAfter(stamp);
    await settleLimit(entrant, fresh, '(ok true)', 'permissionless limit settlement');
    await ev(`${side}: new quote applied`, cid, `(get-token-${side}-limit '${entrant})`, `u${safe}`);
    await ev(`${side}: pending limit cleared`, cid, pendingKind(side, 'limit', entrant), 'none');
    await ev(`${side}: quote change transfers nothing`, cid, balance(side, cid), `u${big * 2}`);
    await ev(`${side}: quote stays with its owner`, cid, live(side, entrant), `u${big * 2}`);
    await noPending(side, cid, entrant, 'limit', fresh);
    finishPhase();

    // Source behavior: set-limit/reprice replace pending limits. Unlike
    // deposits/readmits, they have no ERR_ALREADY_PENDING guard or trait arg
    // on the settle function. PLOB heuristic 6 allows quoting while paused.
    await tx(`${side}: submit replaceable limit`, entrant, cid, `set-token-${side}-limit`, [uintCV(safe), noneCV()], '(ok false)');
    await tx(`${side}: latest pending limit replaces previous`, entrant, cid, `set-token-${side}-limit`, [uintCV(safe2), noneCV()], '(ok false)');
    await ev(`${side}: replacement value recorded`, cid, `(get limit (unwrap-panic ${pendingKind(side, 'limit', entrant)}))`, `u${safe2}`);
    await paused(cid, true);
    fresh = await freshAfter(stamp);
    await settleLimit(entrant, fresh, '(ok true)', 'limit settlement allowed while paused');
    await reprice(entrant, safe, fresh, zeroSwap, 'maker reprice allowed while paused');
    await ev(`${side}: maker reprice creates pending limit`, cid,
      `(is-eq ${pendingKind(side, 'limit', entrant)} (some { limit: u${safe}, spread-bps: none, submitted-at: u${stamp} }))`, 'true');
    await reprice(entrant, safe2, fresh, zeroSwap, 'latest maker reprice replaces pending');
    await settleLimit(entrant, u1, '(err u1032)', 'old price cannot settle maker reprice');
    fresh = await freshAfter(stamp);
    await settleLimit(entrant, fresh, '(ok true)', 'maker reprice settles');
    await ev(`${side}: maker reprice quote applied`, cid, `(get-token-${side}-limit '${entrant})`, `u${safe2}`);
    await ev(`${side}: maker reprice pending cleared`, cid, pendingKind(side, 'limit', entrant), 'none');
    await paused(cid, false);
    await reprice(entrant, safe, fresh, '(err u1013)', 'reprice wrong x trait', [traits.y, assets.y, traits.y, assets.y]);
    await reprice(entrant, safe, fresh, '(err u1013)', 'reprice wrong y trait', [traits.x, assets.x, traits.x, assets.x]);
    finishPhase();

    // Both requests would be admitted against the current non-willing book.
    // Make the opposite book willing AFTER submission, before settlement.
    await tx(`${side}: limit pending before opposite moves`, entrant, cid, `set-token-${side}-limit`, [uintCV(cross), noneCV()], '(ok false)');
    await tx(`${side}: deposit pending before opposite moves`, maker, cid, `deposit-token-${side}`, depArgs(side, big, cross), `(ok u${big})`);
    await ev(`${side}: escrow custody while existing book rests`, cid, balance(side, cid), `u${big * 3}`);
    await tx(`${side}: opposite reprices after submissions`, opposing, cid, `set-token-${opp}-limit`, [uintCV(oppCross), noneCV()], '(ok false)');
    fresh = await freshAfter(stamp);
    await tx(`${side}: opposite new quote applied`, keeper, cid, `settle-token-${opp}-limit`, [principal(opposing), update(fresh)], '(ok true)');
    const refused = await settleLimit(entrant, fresh, '(ok false)', 'limit refusal uses moved opposite book');
    event(`${side}: limit crossing logs reason`, refused.receipt, side, 'settle-refused', { action: '"limit"', reason: '"crossing"' });
    await ev(`${side}: refused limit retains previous quote`, cid, `(get-token-${side}-limit '${entrant})`, `u${safe2}`);
    await ev(`${side}: refused limit clears pending`, cid, pendingKind(side, 'limit', entrant), 'none');
    const refund = await tx(`${side}: deposit refusal uses moved opposite book`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, maker, fresh), `(ok u${big})`);
    event(`${side}: crossing refund reason and recipient`, refund.receipt, side, 'pending-refund', { reason: '"crossing"', depositor: maker, amount: `u${big}` });
    await ev(`${side}: crossing restores exact starting balance`, cid, balance(side, maker), `u${big}`);
    await ev(`${side}: crossing clears pending`, cid, pending(side, maker), 'none');
    await ev(`${side}: keeper not paid refund`, cid, balance(side, keeper), 'u0');
    finishPhase();

    // Book moves the other way: a currently crossing request becomes a maker
    // when the only opposite order is canceled before settle.
    await tx(`${side}: submit while opposite is willing`, maker, cid, `deposit-token-${side}`, depArgs(side, big, cross), `(ok u${big})`);
    await cancel(opp, cid, opposing, oppAmount);
    fresh = await freshAfter(stamp);
    await tx(`${side}: deposit admits after opposite disappears`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, maker, fresh), `(ok u${big})`);
    await ev(`${side}: moved-book admission clears pending`, cid, pending(side, maker), 'none');
    await ev(`${side}: moved-book admission position exact`, cid, live(side, maker), `u${big}`);
    await ev(`${side}: moved-book admission amount not charged twice`, cid, balance(side, maker), 'u0');
    await ev(`${side}: moved-book admission total custody`, cid, balance(side, cid), `u${big * 3}`);
    // Restore non-willing maker quote directly with opposite empty.
    await tx(`${side}: direct limit after opposite disappears`, maker, cid, `set-token-${side}-limit`, [uintCV(safe), noneCV()], '(ok true)');
    await tx(`${side}: restore opposite book submit`, opposing, cid, `deposit-token-${opp}`, depArgs(opp, oppAmount, oppSafe), `(ok u${oppAmount})`);
    fresh = await freshAfter(stamp);
    await tx(`${side}: restore opposite book settle`, keeper, cid, `settle-token-${opp}-deposit`, settleArgs(opp, opposing, fresh), `(ok u${oppAmount})`);
    await tx(`${side}: limit submit before cancel`, maker, cid, `set-token-${side}-limit`, [uintCV(safe2), noneCV()], '(ok false)');
    await cancel(side, cid, maker, big);
    fresh = await freshAfter(stamp);
    await settleLimit(maker, fresh, '(err u1030)', 'cancel clears limit before settlement');
    await ev(`${side}: cancel clears active limit too`, cid, `(get-token-${side}-limit '${maker})`, 'u0');
    await ev(`${side}: canceled pending limit cleared`, cid, pendingKind(side, 'limit', maker), 'none');
    await ev(`${side}: canceled live funds restored`, cid, balance(side, maker), `u${big}`);
    finishPhase();
  }
}

async function custodyEqualsBook(side, cid, extra = 0) {
  await ev(`${side}: custody equals book${extra ? ' plus pending' : ''}`, cid,
    `(is-eq ${balance(side, cid)} (+ (get total-token-${side} (get-cycle-totals (var-get current-cycle))) u${extra}))`, 'true');
}
async function pendingAndTakerCoverage(cases, { stamp, mid }) {
  console.log('PHASE: live + pending escape hatches, pending isolation, swap and reprice taker legs');
  for (const [i, c] of cases.entries()) {
    const { side, cid, entrant, maker, opposing, oppAmount, big, small } = c;
    const opp = other(side), safe = side === 'x' ? mid * 4n : mid / 4n;
    const willing = side === 'x' ? mid / 2n : mid * 2n;
    const oppWilling = opp === 'x' ? mid / 2n : mid * 2n;
    const totalLive = big * 2, withdraw = big / 4;
    await fund(side, entrant, small);
    await tx(`${side}: top-up submits independently of live position`, entrant, cid, `deposit-token-${side}`, depArgs(side, small, safe), `(ok u${small})`);
    await custodyEqualsBook(side, cid, small);
    await tx(`${side}: withdraw touches live funds only`, entrant, cid, `withdraw-token-${side}`, [uintCV(withdraw), traits[side], assets[side]], `(ok u${totalLive - withdraw})`);
    await ev(`${side}: pending survives partial withdrawal`, cid, `(get amount (unwrap-panic ${pending(side, entrant)}))`, `u${small}`);
    await ev(`${side}: withdrawal balance exact`, cid, balance(side, entrant), `u${withdraw}`);
    await cancel(side, cid, entrant, totalLive - withdraw + small);
    await ev(`${side}: cancel returns live plus pending funds`, cid, balance(side, entrant), `u${totalLive + small}`);
    await ev(`${side}: cancel clears pending too`, cid, pending(side, entrant), 'none');
    await custodyEqualsBook(side, cid);
    let fresh = await freshAfter(stamp);
    await tx(`${side}: canceled pending top-up cannot settle`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, entrant, fresh), '(err u1030)');
    await ev(`${side}: failed settle leaves all returned funds intact`, cid, balance(side, entrant), `u${totalLive + small}`);
    await ev(`${side}: canceled top-up cannot recreate an order`, cid, live(side, entrant), 'u0');
    await tx(`${side}: repeat empty cancel refuses`, entrant, cid, `cancel-token-${side}-deposit`, [traits[side], assets[side]], '(err u1005)');
    finishPhase();

    // Only the opposite, non-willing book rests now. The willing maker's
    // funds are escrow until admitted; neither taker nor batch may see them.
    const taker = mk(920 + i), takerAmount = opp === 'x' ? 1500 : 2_000_000;
    await fund(opp, taker, takerAmount);
    await tx(`${side}: willing maker submits escrow`, maker, cid, `deposit-token-${side}`, depArgs(side, small, willing), `(ok u${small})`);
    fresh = await freshAfter(stamp);
    await tx(`${side}: batch cannot fill pending escrow`, keeper, cid, 'settle-with-refresh', [update(fresh), ...pairArgs()], '(err u1009)');
    await ev(`${side}: pending remains after batch attempt`, cid, `(get amount (unwrap-panic ${pending(side, maker)}))`, `u${small}`);
    const swapArgs = [uintCV(takerAmount), uintCV(oppWilling), update(fresh), ...pairArgs(), boolCV(opp === 'x')];
    await tx(`${side}: swap cannot fill pending escrow`, taker, cid, 'swap', swapArgs, '(err u1009)');
    await ev(`${side}: unsuccessful taker loses no funds`, cid, balance(opp, taker), `u${takerAmount}`);
    await ev(`${side}: pending maker receives no counter-asset`, cid, balance(opp, maker), 'u0');
    await custodyEqualsBook(side, cid, small);
    await custodyEqualsBook(opp, cid);
    await tx(`${side}: settle maker escrow before swap`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, maker, fresh), `(ok u${small})`);
    await ev(`${side}: maker escrow now book liquidity`, cid, live(side, maker), `u${small}`);
    const fill = await tx(`${side}: same swap fills settled maker`, taker, cid, 'swap', swapArgs, ok);
    event(`${side}: swap emits settlement`, fill.receipt, '', 'settlement');
    await ev(`${side}: settled maker paid counter-asset`, cid, `(> ${balance(opp, maker)} u0)`, 'true');
    await ev(`${side}: settled maker position reduced`, cid, `(< ${live(side, maker)} u${small})`, 'true');
    await ev(`${side}: swap left no pending escrow`, cid, pending(side, maker), 'none');
    await custodyEqualsBook(side, cid);
    await custodyEqualsBook(opp, cid);
    finishPhase();

    // Turn the remaining maker position away, then make the opposite order
    // willing. Repricing through it must take immediately and not create a
    // pending limit. The owner's unused wallet balance covers its rebate.
    await tx(`${side}: turn remaining maker away`, maker, cid, `set-token-${side}-limit`, [uintCV(safe), noneCV()], '(ok false)');
    fresh = await freshAfter(stamp);
    await tx(`${side}: apply non-crossing remaining quote`, keeper, cid, `settle-token-${side}-limit`, [principal(maker), update(fresh)], '(ok true)');
    await tx(`${side}: make resting opposite willing`, opposing, cid, `set-token-${opp}-limit`, [uintCV(oppWilling), noneCV()], '(ok false)');
    fresh = await freshAfter(stamp);
    await tx(`${side}: apply willing opposite quote`, keeper, cid, `settle-token-${opp}-limit`, [principal(opposing), update(fresh)], '(ok true)');
    const before = BigInt((await ev(`${side}: counter-asset before reprice swap`, cid, balance(opp, maker), (v) => /^u[0-9]+$/.test(v))).slice(1));
    await tx(`${side}: crossing reprice swaps immediately`, maker, cid, `reprice-or-swap-token-${side}`, [uintCV(willing), noneCV(), update(fresh), ...pairArgs()], ok);
    await ev(`${side}: crossing reprice leaves no pending limit`, cid, pendingKind(side, 'limit', maker), 'none');
    await ev(`${side}: crossing reprice fully clears position`, cid, live(side, maker), 'u0');
    await ev(`${side}: crossing reprice pays owner now`, cid, `(> ${balance(opp, maker)} u${before})`, 'true');
    await custodyEqualsBook(side, cid);
    await custodyEqualsBook(opp, cid);
    finishPhase();
  }
}

async function readUint(label, cid, code) {
  return BigInt((await ev(label, cid, code, (v) => /^u[0-9]+$/.test(v))).slice(1));
}
async function batchFillCoverage(cases, { stamp }) {
  console.log('PHASE: batch can fill admitted orders on a different real oracle print');
  // Transactions remain at the probed fork timestamp. Both signed prints
  // postdate it; their price movement, not fabricated oracle data, changes
  // eligibility at the mid. Batch accepts any fresh print, so the y mirror
  // may fill with the earlier captured print. Report both timestamps.
  let a = await freshAfter(stamp), b;
  const midOf = (u) => u.px * 100_000_000n / u.py;
  for (let tries = 0; tries < 30; tries++) {
    b = await freshAfter(stamp);
    if (midOf(a) !== midOf(b)) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (midOf(a) === midOf(b)) throw new Error('No real price movement for batch fixture within 60 seconds');
  const [low, high] = midOf(a) < midOf(b) ? [a, b] : [b, a];
  const lo = midOf(low), hi = midOf(high);
  if (hi - lo < 2n) throw new Error('Real price movement too small for an integer midpoint');
  const threshold = (lo + hi) / 2n;
  console.log(`Batch prints: low=${lo} at=${(await lazerFeedTimes(low.hex)).at}, high=${hi} at=${(await lazerFeedTimes(high.hex)).at}, quote=${threshold}`);
  for (const [i, c] of cases.entries()) {
    const { side, cid, opposing } = c;
    const opp = other(side);
    const oldAmount = await readUint(`${side}: remaining old opposite liquidity`, cid, live(opp, opposing));
    if (oldAmount > 0n) await cancel(opp, cid, opposing, oldAmount);
    const xMaker = mk(940 + i * 2), yMaker = mk(941 + i * 2);
    const xAmount = 3000n, yAmount = 20_000_000n;
    const maker = side === 'x' ? xMaker : yMaker;
    const resting = side === 'x' ? yMaker : xMaker;
    const restingAmount = side === 'x' ? yAmount : xAmount;
    const pendingAmount = side === 'x' ? xAmount : yAmount;
    const restingLimit = side === 'x' ? hi * 2n : lo / 2n;
    const admissionPrint = side === 'x' ? low : high;
    const fillPrint = side === 'x' ? high : low;
    await fund('x', xMaker, xAmount);
    await fund('y', yMaker, yAmount);
    await tx(`${side}: batch counterpart direct deposit`, resting, cid, `deposit-token-${opp}`, depArgs(opp, restingAmount, restingLimit), `(ok u${restingAmount})`);
    await tx(`${side}: batch maker submits future-fill quote`, maker, cid, `deposit-token-${side}`, depArgs(side, pendingAmount, threshold), `(ok u${pendingAmount})`);
    await tx(`${side}: batch maker admits at non-crossing print`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, maker, admissionPrint), `(ok u${pendingAmount})`);
    await ev(`${side}: batch maker is admitted before fill`, cid, live(side, maker), `u${pendingAmount}`);
    await ev(`${side}: batch maker no longer pending`, cid, pending(side, maker), 'none');
    const fill = await tx(`${side}: batch fills admitted order at changed mid`, keeper, cid, 'settle-with-refresh', [update(fillPrint), ...pairArgs()], ok);
    event(`${side}: batch logs settlement`, fill.receipt, '', 'settlement');
    const yCleared = xAmount * midOf(fillPrint) / 10_000_000_000n;
    if (yCleared >= yAmount || yAmount - yCleared < 1_000_000n) throw new Error('Batch fixture size no longer binds x with a live y remainder');
    await ev(`${side}: batch x-maker receives exact STX less fee`, cid, balance('y', xMaker), `u${yCleared - yCleared / 1000n}`);
    await ev(`${side}: batch y-maker receives exact sats less fee`, cid, balance('x', yMaker), `u${xAmount - xAmount / 1000n}`);
    await ev(`${side}: batch fully filled x order`, cid, live('x', xMaker), 'u0');
    await ev(`${side}: batch y remainder exact`, cid, live('y', yMaker), `u${yAmount - yCleared}`);
    await custodyEqualsBook('x', cid);
    await custodyEqualsBook('y', cid);
    await cancel('y', cid, yMaker, yAmount - yCleared);
    finishPhase();
  }
}

async function queueFallbackCoverage(cases, { stamp, mid }) {
  console.log('PHASE: full queue, park-tenth returns (ok false), then core size admission');
  await tx('reserve 49 seats for remaining full-queue branch', DEP, `${DEP}.jing-ladder-v1`, 'set-max-band-per-side', [uintCV(49)], '(ok true)');
  for (const [i, c] of cases.entries()) {
    const { side, cid, big, small } = c;
    const incumbent = mk(960 + i * 2), entrant = mk(961 + i * 2);
    const willing = side === 'x' ? mid / 2n : mid * 2n;
    await tx(`${side}: sync one public seat`, DEP, cid, 'sync-seat-count', [], '(ok u49)');
    await fund(side, incumbent, big);
    await fund(side, entrant, small);
    await tx(`${side}: willing incumbent direct deposit`, incumbent, cid, `deposit-token-${side}`, depArgs(side, big, willing), `(ok u${big})`);
    await ev(`${side}: full queue prerequisite`, cid, `(side-full-${side} (get-token-${side}-depositors (var-get current-cycle)) '${entrant})`, 'true');
    await tx(`${side}: willing small entrant escrows on full side`, entrant, cid, `deposit-token-${side}`, depArgs(side, small, willing), `(ok u${small})`);
    const fresh = await freshAfter(stamp);
    // No opposite book and no off orders; all quotes are willing at mid,
    // so top has n=0. park-tenth returns (ok false) without parking anyone.
    const r = await tx(`${side}: core size refusal must refund pending escrow`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, entrant, fresh), `(ok u${small})`);
    await ev(`${side}: core size refusal clears pending`, cid, pending(side, entrant), 'none');
    await ev(`${side}: core size refusal refunds exactly`, cid, balance(side, entrant), `u${small}`);
    event(`${side}: core size refusal logs queue-full`, r.receipt, side, 'pending-refund', { amount: `u${small}`, reason: '"queue-full"' });
    await ev(`${side}: core size refusal custody excludes refunded escrow`, cid, balance(side, cid), `u${big}`);
    if (failures) console.log(`CONTRACT FAILURE: ${side} queue admission returned (ok false) from park-tenth, then deposit-token-${side}-core returned ERR_QUEUE_FULL; its try! rolls back pending deletion without a refund.`);
    finishPhase();

    // The same fallback must still admit a larger entrant. Then refuse a
    // parked owner's smaller top-up without consuming its parked carry.
    await fund(side, entrant, 2 * big - small);
    await tx(`${side}: larger fallback entrant submits`, entrant, cid, `deposit-token-${side}`, depArgs(side, 2 * big, willing), `(ok u${2 * big})`);
    let next = await freshAfter(stamp);
    await tx(`${side}: larger fallback entrant admits`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, entrant, next), `(ok u${2 * big})`);
    await ev(`${side}: successful fallback clears pending`, cid, pending(side, entrant), 'none');
    await ev(`${side}: successful fallback parks incumbent`, cid, parked(side, incumbent), `u${big}`);
    await ev(`${side}: successful fallback live amount`, cid, live(side, entrant), `u${2 * big}`);
    await fund(side, incumbent, small);
    await tx(`${side}: parked owner submits smaller top-up`, incumbent, cid, `deposit-token-${side}`, depArgs(side, small, willing), `(ok u${small})`);
    next = await freshAfter(stamp);
    const refusedCarry = await tx(`${side}: refund preserves parked carry`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, incumbent, next), `(ok u${small})`);
    event(`${side}: parked-carry refusal log`, refusedCarry.receipt, side, 'pending-refund', { amount: `u${small}`, reason: '"queue-full"' });
    await ev(`${side}: parked carry remains intact`, cid, parked(side, incumbent), `u${big}`);
    await ev(`${side}: only new escrow is refunded`, cid, balance(side, incumbent), `u${small}`);
    await ev(`${side}: parked owner pending cleared`, cid, pending(side, incumbent), 'none');
    await ev(`${side}: fallback book plus parked custody exact`, cid, balance(side, cid), `u${3 * big}`);
    finishPhase();
  }
}

async function minimumCoverage(cases, { stamp, mid }) {
  console.log('PHASE: entry minimum, queue refusals, and submit-time admission');
  for (const [i, c] of cases.entries()) {
    const { side, cid, big, small } = c;
    const opp = other(side), min = side === 'x' ? 1000 : 1_000_000, tiny = min - 1;
    const parkedOwner = mk(960 + i * 2), liveOwner = mk(961 + i * 2);
    const undersized = mk(970 + i), newOwner = mk(980 + i), opposing = mk(990 + i);
    const willing = side === 'x' ? mid / 2n : mid * 2n;
    const oppSafe = opp === 'x' ? mid * 2n : mid / 2n;
    const oppAmount = opp === 'x' ? 6000 : 12_000_000;
    const setMin = (value) => tx(`${side}: set minimum ${value}`, DEP, cid, `set-min-token-${side}-deposit`, [uintCV(value)], '(ok true)');
    const settle = (who, u, amount, label) => tx(`${side}: ${label}`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, who, u), `(ok u${amount})`);
    const queueEvent = (r, who, amount) => event(`${side}: queue refusal reason/owner/amount`, r.receipt, side, 'pending-refund', { reason: '"queue-full"', depositor: who, amount: `u${amount}` });

    await fund(side, undersized, tiny);
    await tx(`${side}: undersized submit rejected before escrow`, undersized, cid, `deposit-token-${side}`, depArgs(side, tiny, willing), '(err u1001)');
    await ev(`${side}: rejected submit creates no pending`, cid, pending(side, undersized), 'none');
    await ev(`${side}: rejected submit leaves wallet intact`, cid, balance(side, undersized), `u${tiny}`);
    await ev(`${side}: rejected submit leaves custody intact`, cid, balance(side, cid), `u${3 * big}`);

    await fund(side, newOwner, small);
    await tx(`${side}: valid new owner submits before min raise`, newOwner, cid, `deposit-token-${side}`, depArgs(side, small, willing), `(ok u${small})`);
    await setMin(small + 1);
    let fresh = await freshAfter(stamp);
    const newRefund = await settle(newOwner, fresh, small, 'full queue refunds smaller new owner despite minimum change');
    queueEvent(newRefund, newOwner, small);
    await ev(`${side}: raised minimum clears pending`, cid, pending(side, newOwner), 'none');
    await ev(`${side}: raised minimum exact refund`, cid, balance(side, newOwner), `u${small}`);
    await ev(`${side}: raised minimum did not park live owner`, cid, live(side, liveOwner), `u${2 * big}`);
    await setMin(min);

    // The parked owner's wallet contains the earlier queue refund. The
    // minimum is raised above parked+new; the independent queue refusal refunds new escrow.
    await tx(`${side}: parked owner valid submit before min raise`, parkedOwner, cid, `deposit-token-${side}`, depArgs(side, small, willing), `(ok u${small})`);
    await setMin(big + small + 1);
    fresh = await freshAfter(stamp);
    const parkedRefund = await settle(parkedOwner, fresh, small, 'full queue preserves parked carry despite minimum change');
    queueEvent(parkedRefund, parkedOwner, small);
    await ev(`${side}: queue refusal keeps parked amount`, cid, parked(side, parkedOwner), `u${big}`);
    await ev(`${side}: queue refusal refunds only new amount`, cid, balance(side, parkedOwner), `u${small}`);
    await ev(`${side}: parked queue refusal clears pending`, cid, pending(side, parkedOwner), 'none');
    await ev(`${side}: queue refusal custody exact`, cid, balance(side, cid), `u${3 * big}`);
    await setMin(min);
    finishPhase();

    // Add a non-crossing opposite order so a live owner's top-up must pend.
    await fund(opp, opposing, oppAmount);
    await tx(`${side}: opposite submit for live top-up test`, opposing, cid, `deposit-token-${opp}`, depArgs(opp, oppAmount, oppSafe), `(ok u${oppAmount})`);
    fresh = await freshAfter(stamp);
    await tx(`${side}: opposite admit for live top-up test`, keeper, cid, `settle-token-${opp}-deposit`, settleArgs(opp, opposing, fresh), `(ok u${oppAmount})`);
    await fund(side, liveOwner, 2 * tiny);
    await tx(`${side}: sub-minimum top-up accepted with sufficient live total`, liveOwner, cid, `deposit-token-${side}`, depArgs(side, tiny, willing), `(ok u${tiny})`);
    await ev(`${side}: top-up is pending`, cid, `(get amount (unwrap-panic ${pending(side, liveOwner)}))`, `u${tiny}`);
    await setMin(2 * big + tiny + 1);
    fresh = await freshAfter(stamp);
    const liveAdmission = await settle(liveOwner, fresh, tiny, 'raised minimum honours submitted top-up');
    event(`${side}: raised-minimum top-up logs deposit`, liveAdmission.receipt, side, 'deposit', { depositor: liveOwner, amount: `u${2 * big + tiny}`, delta: `u${tiny}` });
    await ev(`${side}: raised minimum admits pending top-up`, cid, live(side, liveOwner), `u${2 * big + tiny}`);
    await ev(`${side}: admitted top-up keeps quote`, cid, `(get-token-${side}-limit '${liveOwner})`, `u${willing}`);
    await ev(`${side}: only reserved next top-up remains in wallet`, cid, balance(side, liveOwner), `u${tiny}`);
    await ev(`${side}: admitted top-up clears pending`, cid, pending(side, liveOwner), 'none');
    // Equality with the minimum succeeds, counting the existing live amount.
    await setMin(2 * big + 2 * tiny);
    await tx(`${side}: exact-minimum aggregate top-up submits`, liveOwner, cid, `deposit-token-${side}`, depArgs(side, tiny, willing), `(ok u${tiny})`);
    fresh = await freshAfter(stamp);
    await settle(liveOwner, fresh, tiny, 'exact-minimum aggregate top-up settles');
    await ev(`${side}: successful aggregate top-up amount`, cid, live(side, liveOwner), `u${2 * big + 2 * tiny}`);
    await ev(`${side}: successful aggregate top-up clears pending`, cid, pending(side, liveOwner), 'none');
    await ev(`${side}: successful top-up charged once`, cid, balance(side, liveOwner), 'u0');
    await ev(`${side}: successful top-up custody exact`, cid, balance(side, cid), `u${3 * big + 2 * tiny}`);
    await setMin(min);
    finishPhase();
  }
}

async function raisedMinimumAfterParkingCoverage(cases, { stamp, mid }) {
  console.log('PHASE: queue refusals preserve incumbents; raised minimum does not block admission');
  for (const [i, c] of cases.entries()) {
    const { side, cid, big, small } = c;
    const min = side === 'x' ? 1000 : 1_000_000;
    const incumbent = mk(961 + i * 2), entrant = mk(995 + i);
    const incumbentAmount = 2 * big + 2 * (min - 1), amount = small, larger = 4 * big;
    const nonWilling = side === 'x' ? mid * 2n : mid / 2n;
    await tx(`${side}: incumbent submits non-willing quote`, incumbent, cid, `set-token-${side}-limit`, [uintCV(nonWilling), noneCV()], '(ok false)');
    let fresh = await freshAfter(stamp);
    await tx(`${side}: incumbent settles non-willing quote`, keeper, cid, `settle-token-${side}-limit`, [principal(incumbent), update(fresh)], '(ok true)');
    await ev(`${side}: incumbent live before rejected admission`, cid, live(side, incumbent), `u${incumbentAmount}`);
    await ev(`${side}: incumbent not parked before rejected admission`, cid, parked(side, incumbent), 'u0');
    await fund(side, entrant, amount);
    await tx(`${side}: small entrant submits before minimum raise`, entrant, cid, `deposit-token-${side}`, depArgs(side, amount, nonWilling), `(ok u${amount})`);
    await tx(`${side}: raise minimum above small entrant`, DEP, cid, `set-min-token-${side}-deposit`, [uintCV(amount + 1)], '(ok true)');
    fresh = await freshAfter(stamp);
    const refund = await tx(`${side}: small entrant receives queue refund`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, entrant, fresh), `(ok u${amount})`);
    event(`${side}: small entrant queue refund event`, refund.receipt, side, 'pending-refund', { depositor: entrant, amount: `u${amount}`, reason: '"queue-full"' });
    await ev(`${side}: small entrant pending cleared`, cid, pending(side, entrant), 'none');
    await ev(`${side}: small entrant refunded exactly`, cid, balance(side, entrant), `u${amount}`);
    await ev(`${side}: rejected entrant leaves incumbent live`, cid, live(side, incumbent), `u${incumbentAmount}`);
    await ev(`${side}: rejected entrant leaves incumbent unparked`, cid, parked(side, incumbent), 'u0');
    await ev(`${side}: rejected entrant leaves custody unchanged`, cid, balance(side, cid), `u${3 * big + 2 * (min - 1)}`);
    if (failures) console.log(`CONTRACT FAILURE: a smaller entrant should be refunded for queue-full without parking the incumbent.`);
    finishPhase();
    const committedPrints = refund.receipt.events.map((e) => typeof e === 'string' ? JSON.parse(e) : e)
      .filter((e) => e.committed && e.contract_event?.contract_identifier === CORE)
      .map((e) => cv(e.contract_event.raw_value));
    check(`${side}: queue refund emits no park event`, committedPrints.join(' | '), (v) => !v.includes(`(event "park-${side}")`));
    await ev(`${side}: queue refund keeps incumbent quote`, cid, `(get-token-${side}-limit '${incumbent})`, `u${nonWilling}`);
    await ev(`${side}: queue refund keeps book totals`, cid, `(get total-token-${side} (get-cycle-totals (var-get current-cycle)))`, `u${incumbentAmount}`);
    finishPhase();
    await tx(`${side}: restore minimum after parking regression`, DEP, cid, `set-min-token-${side}-deposit`, [uintCV(min)], '(ok true)');

    // A larger resubmission still earns a seat even if the minimum rises.
    // Parking is now justified because core admits the accepted escrow.
    await fund(side, entrant, larger - amount);
    await tx(`${side}: refunded entrant resubmits`, entrant, cid, `deposit-token-${side}`, depArgs(side, larger, nonWilling), `(ok u${larger})`);
    await tx(`${side}: raise minimum after larger resubmission`, DEP, cid, `set-min-token-${side}-deposit`, [uintCV(larger + 1)], '(ok true)');
    fresh = await freshAfter(stamp);
    const admitted = await tx(`${side}: raised minimum still admits and parks for accepted entrant`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, entrant, fresh), `(ok u${larger})`);
    event(`${side}: successful retry logs incumbent parking`, admitted.receipt, side, 'park', { who: incumbent, amount: `u${incumbentAmount}` });
    await ev(`${side}: successful retry clears pending`, cid, pending(side, entrant), 'none');
    await ev(`${side}: successful retry has exact live amount`, cid, live(side, entrant), `u${larger}`);
    await ev(`${side}: successful retry consumes escrow once`, cid, balance(side, entrant), 'u0');
    await ev(`${side}: successful retry parks incumbent exactly`, cid, parked(side, incumbent), `u${incumbentAmount}`);
    await ev(`${side}: successful retry removes incumbent from book`, cid, live(side, incumbent), 'u0');
    await ev(`${side}: successful retry uses post-parking totals`, cid, `(get total-token-${side} (get-cycle-totals (var-get current-cycle)))`, `u${larger}`);
    await ev(`${side}: successful retry uses post-parking list`, cid, `(get-token-${side}-depositors (var-get current-cycle))`, `(list ${entrant})`);
    await ev(`${side}: successful retry custody equals book plus parked`, cid, balance(side, cid), `u${3 * big + 2 * (min - 1) + larger}`);
    finishPhase();

    await tx(`${side}: restore minimum before carry top-up`, DEP, cid, `set-min-token-${side}-deposit`, [uintCV(min)], '(ok true)');

    // A parked owner can combine its retained carry with a new pending
    // top-up, bumping the entrant while consuming only its own parked funds.
    const topUp = 2 * big, withCarry = incumbentAmount + topUp;
    await fund(side, incumbent, topUp);
    await tx(`${side}: parked owner submits qualifying top-up`, incumbent, cid, `deposit-token-${side}`, depArgs(side, topUp, nonWilling), `(ok u${topUp})`);
    fresh = await freshAfter(stamp);
    await tx(`${side}: pending top-up admits with parked carry`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, incumbent, fresh), `(ok u${topUp})`);
    await ev(`${side}: admitted carry plus top-up exact`, cid, live(side, incumbent), `u${withCarry}`);
    await ev(`${side}: admitted carry clears parked owner`, cid, parked(side, incumbent), 'u0');
    await ev(`${side}: admitted carry clears pending`, cid, pending(side, incumbent), 'none');
    await ev(`${side}: admitted carry charges only new escrow`, cid, balance(side, incumbent), 'u0');
    await ev(`${side}: admitted carry parks previous entrant`, cid, parked(side, entrant), `u${larger}`);
    await ev(`${side}: admitted carry uses current book totals`, cid, `(get total-token-${side} (get-cycle-totals (var-get current-cycle)))`, `u${withCarry}`);
    await ev(`${side}: admitted carry custody exact`, cid, balance(side, cid), `u${big + larger + withCarry}`);
    finishPhase();
  }
}

async function swapMinimumCoverage(cases, { stamp }) {
  console.log('PHASE: direct-entry minimum, swap entry minimum, and refunded sub-minimum swap remainder');
  await tx('reserve 48 seats for swap minimum fixtures', DEP, `${DEP}.jing-ladder-v1`, 'set-max-band-per-side', [uintCV(48)], '(ok true)');
  for (const [i, c] of cases.entries()) {
    const { side, cid } = c, opp = other(side);
    const min = side === 'x' ? 1000n : 1_000_000n;
    const tiny = min - 1n, undersized = mk(1001 + i), maker = mk(1011 + i), taker = mk(1021 + i);
    await tx(`${side}: sync two public seats`, DEP, cid, 'sync-seat-count', [], '(ok u48)');
    await cancel(opp, cid, mk(990 + i), opp === 'x' ? 6000 : 12_000_000);
    await ev(`${side}: direct minimum fixture opposite book empty`, cid, `(len (get-token-${opp}-depositors (var-get current-cycle)))`, 'u0');
    await ev(`${side}: direct minimum fixture has free seat`, cid, `(side-full-${side} (get-token-${side}-depositors (var-get current-cycle)) '${undersized})`, 'false');
    let fresh = await freshAfter(stamp);
    const mid = fresh.px * 100_000_000n / fresh.py;
    const safe = side === 'x' ? mid * 2n : mid / 2n;
    const aggressive = side === 'x' ? mid / 2n : mid * 2n;
    const custody = await readUint(`${side}: custody before undersized entries`, cid, balance(side, cid));
    await fund(side, undersized, tiny);
    await tx(`${side}: under-minimum direct deposit refused`, undersized, cid, `deposit-token-${side}`, depArgs(side, tiny, safe), '(err u1001)');
    await ev(`${side}: undersized direct submit has no pending`, cid, pending(side, undersized), 'none');
    await ev(`${side}: undersized direct submit has no live order`, cid, live(side, undersized), 'u0');
    await ev(`${side}: undersized direct submit does not escrow`, cid, balance(side, undersized), `u${tiny}`);
    await tx(`${side}: swap under-minimum net refused before escrow`, undersized, cid, 'swap', [uintCV(tiny), uintCV(aggressive), update(fresh), ...pairArgs(), boolCV(side === 'x')], '(err u1001)');
    await ev(`${side}: rejected swap preserves entire wallet`, cid, balance(side, undersized), `u${tiny}`);
    await ev(`${side}: rejected swap creates no order`, cid, live(side, undersized), 'u0');
    await ev(`${side}: rejected swap leaves custody unchanged`, cid, balance(side, cid), `u${custody}`);
    finishPhase();

    // The input meets the minimum; a deliberately smaller counterpart
    // leaves a positive, sub-minimum remainder after clearing. The existing
    // cross-remainder path refunds it rather than leaving it on the book.
    const input = side === 'x' ? 2000n : 4_000_000n;
    const counterpart = side === 'x' ? 1500n * mid / 10_000_000_000n : 3_500_000n * 10_000_000_000n / mid;
    const oppMin = opp === 'x' ? 1000n : 1_000_000n;
    if (counterpart < oppMin) throw new Error('Swap remainder fixture counterpart fell below its own entry minimum');
    const willing = opp === 'x' ? mid / 2n : mid * 2n;
    await fund(opp, maker, counterpart);
    await tx(`${side}: remainder fixture counterpart submits`, maker, cid, `deposit-token-${opp}`, depArgs(opp, counterpart, willing), `(ok u${counterpart})`);
    await tx(`${side}: remainder fixture counterpart settles`, keeper, cid, `settle-token-${opp}-deposit`, settleArgs(opp, maker, fresh), `(ok u${counterpart})`);
    await fund(side, taker, input);
    const swapped = await tx(`${side}: swap refunds sub-minimum unfilled remainder`, taker, cid, 'swap', [uintCV(input), uintCV(aggressive), update(fresh), ...pairArgs(), boolCV(side === 'x')], ok);
    finishPhase();
    const value = (key) => {
      const found = swapped.result.match(new RegExp(`\\(${key} u([0-9]+)\\)`));
      if (!found) throw new Error(`Missing ${key} in swap receipt: ${swapped.result}`);
      return BigInt(found[1]);
    };
    const remainder = value(`token-${side}-rolled`), rebate = value('rebate-refunded');
    check(`${side}: returned remainder is positive and below minimum`, remainder.toString(), () => remainder > 0n && remainder < min);
    await ev(`${side}: swap returns remainder plus unused rebate exactly`, cid, balance(side, taker), `u${remainder + rebate}`);
    await ev(`${side}: swap pays exact output`, cid, balance(opp, taker), `u${value(`token-${opp}-received`)}`);
    await ev(`${side}: sub-minimum remainder does not rest`, cid, live(side, taker), 'u0');
    await ev(`${side}: sub-minimum remainder is not pending`, cid, pending(side, taker), 'none');
    finishPhase();
  }
}

async function swapZeroLimitCoverage({ stamp }) {
  console.log('PHASE: zero-limit behavior against reviewed baseline 08a9ef8');
  // These are verbatim sources, not rewritten test contracts. Current swap
  // admits its whole net input through core BEFORE matching, so baseline
  // zero-limit swaps reject even when a positive-limit control fills fully.
  const before = execFileSync('git', ['show', '08a9ef8:contracts/markets-sbtc-stx-jing-v6-3.clar'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8',
  });
  const versions = [['before', before], ['after', source('markets-sbtc-stx-jing-v6-3')]];
  for (const [i, side] of ['x', 'y'].entries()) {
    const opp = other(side), fresh = await freshAfter(stamp);
    const mid = fresh.px * 100_000_000n / fresh.py;
    const limit = side === 'x' ? mid / 2n : mid * 2n;
    const makerLimit = opp === 'x' ? mid / 2n : mid * 2n;
    const ample = opp === 'x' ? 12000n : 30_000_000n;
    const fullInput = side === 'x' ? 3000n : 6_000_000n;
    const partialInput = side === 'x' ? 2000n : 4_000_000n;
    const small = side === 'x' ? 1500n * mid / 10_000_000_000n : 3_500_000n * 10_000_000_000n / mid;
    const outcomes = {};
    for (const [j, [version, codeBody]] of versions.entries()) {
      const name = `zero-limit-${version}-${side}`, cid = `${DEP}.${name}`;
      const maker = mk(1200 + i * 10 + j * 2), taker = mk(1201 + i * 10 + j * 2);
      const raw = await makeUnsignedContractDeploy({
        contractName: name, codeBody, nonce: await getNonce(sid, DEP), fee: 0,
        publicKey: '', network: 'mainnet', clarityVersion: ClarityVersion.Clarity5,
        postConditionMode: PostConditionMode.Allow,
      });
      setSender(raw, DEP);
      const deployed = await submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] });
      check(`${side}/${version}: deploy actual source`, decode({ Result: deployed.steps[0] }), (v) => !v.includes('ERR') && !v.startsWith('(err'));
      finishPhase();
      await tx(`${side}/${version}: sync seats`, DEP, cid, 'sync-seat-count', [], '(ok u48)');
      await tx(`${side}/${version}: verify`, DEP, CORE, 'set-verified-contract', [principal(cid)], '(ok true)');
      await tx(`${side}/${version}: initialize`, DEP, cid, 'initialize', [principal(cid), traits.x, traits.y, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)], '(ok true)');
      const state = `(tuple
        (input-wallet ${balance(side, taker)}) (output-wallet ${balance(opp, taker)})
        (maker-input ${balance(side, maker)}) (maker-output ${balance(opp, maker)})
        (market-input ${balance(side, cid)}) (market-output ${balance(opp, cid)})
        (cycle (var-get current-cycle)) (totals (get-cycle-totals (var-get current-cycle)))
        (input-order ${live(side, taker)}) (maker-order ${live(opp, maker)})
        (pending ${pending(side, taker)}) (parked ${parked(side, taker)})
        (rebate (var-get pending-rebate-${side})) (crossing (var-get crossing)))`;
      const zero = async (label, amount) => {
        const snapshot = await ev(`${side}/${version}: snapshot ${label}`, cid, state, (v) => v.startsWith('(tuple'));
        const r = await tx(`${side}/${version}: zero limit ${label} preserves existing refusal`, taker, cid, 'swap', [uintCV(amount), uintCV(0), update(fresh), ...pairArgs(), boolCV(side === 'x')], '(err u1011)');
        await ev(`${side}/${version}: zero limit ${label} changes nothing`, cid, state, snapshot);
        const events = r.receipt.events.map((e) => typeof e === 'string' ? JSON.parse(e) : e);
        check(`${side}/${version}: zero limit ${label} commits no events`, String(events.filter((e) => e.committed).length), '0');
        finishPhase();
        return r.result;
      };
      await fund(opp, maker, ample);
      await tx(`${side}/${version}: enough liquidity for complete fill`, maker, cid, `deposit-token-${opp}`, depArgs(opp, ample, makerLimit), `(ok u${ample})`);
      await fund(side, taker, fullInput);
      const fullZero = await zero('with ample liquidity', fullInput);
      const full = await tx(`${side}/${version}: positive-limit control fills completely`, taker, cid, 'swap', [uintCV(fullInput), uintCV(limit), update(fresh), ...pairArgs(), boolCV(side === 'x')], ok);
      check(`${side}/${version}: complete-fill control has zero remainder`, full.result, (v) => v.includes(`(token-${side}-rolled u0)`));
      await ev(`${side}/${version}: complete-fill control leaves no order`, cid, live(side, taker), 'u0');
      finishPhase();
      const left = await readUint(`${side}/${version}: unused opposite liquidity`, cid, live(opp, maker));
      await cancel(opp, cid, maker, left);
      await fund(opp, maker, small);
      await tx(`${side}/${version}: insufficient liquidity fixture`, maker, cid, `deposit-token-${opp}`, depArgs(opp, small, makerLimit), `(ok u${small})`);
      await fund(side, taker, partialInput);
      const partialZero = await zero('with insufficient liquidity', partialInput);
      const partial = await tx(`${side}/${version}: positive-limit control leaves refunded dust`, taker, cid, 'swap', [uintCV(partialInput), uintCV(limit), update(fresh), ...pairArgs(), boolCV(side === 'x')], ok);
      check(`${side}/${version}: partial-fill control has positive remainder`, partial.result, (v) => new RegExp(`\\(token-${side}-rolled u[1-9][0-9]*\\)`).test(v));
      finishPhase();
      outcomes[version] = { fullZero, full: full.result, partialZero, partial: partial.result };
    }
    check(`${side}: before/after results match for both zero-limit cases and positive controls`, JSON.stringify(outcomes.after), JSON.stringify(outcomes.before));
    finishPhase();
  }
}

async function cancelRecoveryCoverage({ stamp }) {
  console.log('PHASE: pending cancellation, stale metadata, and recovery during both pauses');
  const fixtures = [];
  for (const [i, side] of ['x', 'y'].entries()) {
    const opp = other(side), name = `cancel-exit-${side}`, cid = `${DEP}.${name}`;
    const amount = side === 'x' ? 3000 : 6_000_000, liveAmount = 2 * amount, parkedAmount = amount;
    const oppositeAmount = opp === 'x' ? 6000 : 12_000_000;
    const oppositeOwner = mk(1300 + i * 10), normal = mk(1301 + i * 10);
    const marketPaused = mk(1302 + i * 10), corePaused = mk(1303 + i * 10), triple = mk(1304 + i * 10);
    const raw = await makeUnsignedContractDeploy({
      contractName: name, codeBody: source('markets-sbtc-stx-jing-v6-3'), nonce: await getNonce(sid, DEP), fee: 0,
      publicKey: '', network: 'mainnet', clarityVersion: ClarityVersion.Clarity5, postConditionMode: PostConditionMode.Allow,
    });
    setSender(raw, DEP);
    const deployed = await submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] });
    check(`${side}: deploy cancellation fixture`, decode({ Result: deployed.steps[0] }), (v) => !v.includes('ERR') && !v.startsWith('(err'));
    finishPhase();
    await tx(`${side}: cancellation fixture sync seats`, DEP, cid, 'sync-seat-count', [], '(ok u48)');
    await tx(`${side}: cancellation fixture verify`, DEP, CORE, 'set-verified-contract', [principal(cid)], '(ok true)');
    await tx(`${side}: cancellation fixture initialize`, DEP, cid, 'initialize', [principal(cid), traits.x, traits.y, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)], '(ok true)');
    let fresh = await freshAfter(stamp);
    const mid = fresh.px * 100_000_000n / fresh.py;
    const safe = side === 'x' ? mid * 2n : mid / 2n;
    const oppositeSafe = opp === 'x' ? mid * 2n : mid / 2n;
    await fund(opp, oppositeOwner, oppositeAmount);
    await tx(`${side}: cancellation fixture opposite book`, oppositeOwner, cid, `deposit-token-${opp}`, depArgs(opp, oppositeAmount, oppositeSafe), `(ok u${oppositeAmount})`);
    for (const [label, who] of [['normal', normal], ['market-paused', marketPaused]]) {
      await fund(side, who, amount);
      await tx(`${side}/${label}: submit pending-only deposit`, who, cid, `deposit-token-${side}`, depArgs(side, amount, safe), `(ok u${amount})`);
      await ev(`${side}/${label}: all submitted funds escrowed`, cid, balance(side, who), 'u0');
      if (label === 'market-paused') await paused(cid, true);
      const canceled = await tx(`${side}/${label}: cancel pending-only deposit`, who, cid, `cancel-token-${side}-deposit`, [traits[side], assets[side]], `(ok u${amount})`);
      event(`${side}/${label}: pending cancel event`, canceled.receipt, side, 'pending-refund', { depositor: who, amount: `u${amount}`, reason: '"cancel"', price: 'u0' });
      await ev(`${side}/${label}: exact pending refund`, cid, balance(side, who), `u${amount}`);
      await ev(`${side}/${label}: pending cleared`, cid, pending(side, who), 'none');
      await ev(`${side}/${label}: market retains no refunded escrow`, cid, balance(side, cid), 'u0');
      await tx(`${side}/${label}: canceled deposit cannot settle`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, who, fresh), '(err u1030)');
      if (label === 'market-paused') {
        await ev(`${side}: cancel leaves market paused`, cid, '(var-get paused)', 'true');
        await paused(cid, false);
      }
      finishPhase();
    }

    // All balances are funded by real fork transfers. Ordinary admission
    // consumes parked carry, so this synthetic split tests the defensive
    // live+parked combination without claiming a public path creates it.
    await fund(side, triple, liveAmount + parkedAmount);
    await tx(`${side}: fund triple fixture through ordinary submit`, triple, cid, `deposit-token-${side}`, depArgs(side, liveAmount + parkedAmount, safe), `(ok u${liveAmount + parkedAmount})`);
    fresh = await freshAfter(stamp);
    await tx(`${side}: admit fully backed fixture funds`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, triple, fresh), `(ok u${liveAmount + parkedAmount})`);
    await ev(`${side}: SYNTHETIC FIXTURE split funded live order into live and parked`, cid, `(begin
      (map-set token-${side}-parked '${triple} u${parkedAmount})
      (map-set token-${side}-deposits {cycle: (var-get current-cycle), depositor: '${triple}} u${liveAmount})
      (map-set cycle-totals (var-get current-cycle)
        (merge (get-cycle-totals (var-get current-cycle)) {total-token-${side}: u${liveAmount}})))`, 'true');
    finishPhase();
    await ev(`${side}: fixture split preserves full custody`, cid, balance(side, cid), `u${liveAmount + parkedAmount}`);
    await ev(`${side}: fixture equity remains fully backed`, CORE, `(get-token-equity '${side === 'x' ? SBTC : STX} '${triple})`, `u${liveAmount + parkedAmount}`);
    await fund(side, triple, amount);
    await tx(`${side}: triple owner submits new pending escrow`, triple, cid, `deposit-token-${side}`, depArgs(side, amount, safe), `(ok u${amount})`);
    await tx(`${side}: triple owner submits pending quote`, triple, cid, `set-token-${side}-limit`, [uintCV(safe), noneCV()], '(ok false)');
    await tx(`${side}: triple owner submits pending readmit`, keeper, cid, `readmit-token-${side}`, [principal(triple)], `(ok u${parkedAmount})`);
    await ev(`${side}: triple fixture has every balance and pending record`, cid, `(and
      (is-eq ${live(side, triple)} u${liveAmount}) (is-eq ${parked(side, triple)} u${parkedAmount})
      (is-eq (get amount (unwrap-panic ${pending(side, triple)})) u${amount})
      (is-some ${pendingKind(side, 'limit', triple)}) (is-some ${pendingKind(side, 'readmit', triple)}))`, 'true');
    await fund(side, corePaused, amount);
    await tx(`${side}: prepare pending-only core-pause recovery`, corePaused, cid, `deposit-token-${side}`, depArgs(side, amount, safe), `(ok u${amount})`);
    await paused(cid, true);
    fixtures.push({ side, opp, cid, triple, corePaused, amount, liveAmount, parkedAmount, oppositeOwner, oppositeAmount, fresh });
    finishPhase();
  }

  // Pause last: unpause has a burn-block timelock, and cancellation must not
  // need the owner or an unpause. Both markets are already paused too.
  await tx('core-v6 pause before recovery', DEP, CORE, 'pause', [], '(ok true)');
  for (const f of fixtures) {
    const { side, opp, cid, triple, corePaused, amount, liveAmount, parkedAmount, oppositeOwner, oppositeAmount, fresh } = f;
    await paused(cid, false);
    const pendingCancel = await tx(`${side}: pending-only cancel while core paused`, corePaused, cid, `cancel-token-${side}-deposit`, [traits[side], assets[side]], `(ok u${amount})`);
    event(`${side}: core-paused pending refund event`, pendingCancel.receipt, side, 'pending-refund', { depositor: corePaused, amount: `u${amount}`, reason: '"cancel"' });
    await ev(`${side}: core-paused pending refund exact`, cid, balance(side, corePaused), `u${amount}`);
    await ev(`${side}: core-paused pending cleared`, cid, pending(side, corePaused), 'none');
    await tx(`${side}: core-paused canceled deposit cannot settle`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, corePaused, fresh), '(err u1030)');
    const total = amount + liveAmount + parkedAmount;
    await paused(cid, true);
    await ev(`${side}: triple owner wallet empty before cancel`, cid, balance(side, triple), 'u0');
    const all = await tx(`${side}: one paused cancel returns pending plus live plus parked`, triple, cid, `cancel-token-${side}-deposit`, [traits[side], assets[side]], `(ok u${total})`);
    event(`${side}: triple pending refund logs cancel`, all.receipt, side, 'pending-refund', { depositor: triple, amount: `u${amount}`, reason: '"cancel"', price: 'u0' });
    event(`${side}: triple parked refund logs while core paused`, all.receipt, side, 'refund', { depositor: triple, amount: `u${parkedAmount}` });
    event(`${side}: triple live refund logs while core paused`, all.receipt, side, 'refund', { depositor: triple, amount: `u${liveAmount}` });
    await ev(`${side}: combined cancel wallet exact`, cid, balance(side, triple), `u${total}`);
    await ev(`${side}: combined cancel clears all balances and pending metadata`, cid, `(and
      (is-eq ${live(side, triple)} u0) (is-eq ${parked(side, triple)} u0)
      (is-none ${pending(side, triple)}) (is-none ${pendingKind(side, 'limit', triple)})
      (is-none ${pendingKind(side, 'readmit', triple)})
      (is-none (map-get? token-${side}-deposit-limits '${triple})))`, 'true');
    await ev(`${side}: combined cancel clears book list and totals`, cid, `(and
      (is-eq (get-token-${side}-depositors (var-get current-cycle)) (list))
      (is-eq (get total-token-${side} (get-cycle-totals (var-get current-cycle))) u0))`, 'true');
    await ev(`${side}: combined cancel leaves no escrow or parked custody`, cid, balance(side, cid), 'u0');
    await ev(`${side}: combined cancel debits only live and parked equity`, CORE, `(get-token-equity '${side === 'x' ? SBTC : STX} '${triple})`, 'u0');
    await ev(`${side}: opposite maker unaffected by combined cancel`, cid, live(opp, oppositeOwner), `u${oppositeAmount}`);
    for (const kind of ['deposit', 'limit', 'readmit']) await noPending(side, cid, triple, kind, fresh);
    await ev(`${side}: cancel did not unpause market`, cid, '(var-get paused)', 'true');
    await ev(`${side}: cancel did not unpause core`, CORE, '(var-get paused)', 'true');
    finishPhase();
  }
}
