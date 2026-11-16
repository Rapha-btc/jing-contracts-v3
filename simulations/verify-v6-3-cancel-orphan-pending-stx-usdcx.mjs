// Fork only. Run: node simulations/verify-v6-3-cancel-orphan-pending-stx-usdcx.mjs
// STX/USDCx port of verify-v6-3-cancel-orphan-pending.js, `patched` mode only
// (prefix = historical sBTC/STX bytes, no STX/USDCx equivalent).
//
// Market = contracts/stx-usdcx/markets-stx-usdcx-jing-v6-4.clar (stripped
// deploy bytes) x3 (orphan-my / orphan-mx / orphan-mr) on the LIVE
// jing-core-v6 (CORE_OWNER verifies + initializes) + fresh
// jing-ladder-stx-usdcx-v1. x = native STX, y = USDCx, 6 dp each, mins 1 / 1,
// y = x * price / 1e8.
//
// A maker submits set-token-{x,y}-limit while the other side's list is
// non-empty, so the new limit goes PENDING. A taker then fills the order
// completely before anyone settles the limit: the pending limit is orphaned.
// The patched cancel runs on a leftover pending-limit / pending-readmit entry:
// deletes pending-limits, pending-readmits and deposit-limits, moves no funds,
// returns (ok u0); a later settle of the old limit errs u1030.
//   MY  Y side: A bids 10 USDCx at mid*2 (live), O asks 5 STX at mid*3,
//       A sets limit mid*1.5 (pending), taker swap (X in) fills A completely.
//   MX  X mirror: A asks 10 STX at mid/2, O bids 5 USDCx at mid/3, A sets
//       limit mid*2/3 (pending), taker swap (Y in) fills A completely.
//   MR  orphan pending-readmit (Y): 40 makers (side full, distance-slots 0),
//       newcomer parks Q; Q readmit; Q deposits; taker fills Q -> orphan.
import {
  ClarityVersion, uintCV, bufferCV, noneCV, boolCV, deserializeCV, cvToString, makeUnsignedSTXTokenTransfer,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, getSimulationTip, submitSimulationSteps,
  callContract, getNonce, setSender,
} from 'stxer';
import { installChunkedSubmit } from './_chunked-submit.js';
import { installRetrySubmit } from './_retry-submit.js';
import {
  NODE, DEP, CORE, CORE_OWNER, WSTX, USDCX, STX_WHALES, USDCX_WHALES, N, P_ as P, traits as T, assets as A,
  mk, balanceExpr, src, lazer, lazerTimes, midOf, MIN, SCALE,
} from './_stx-usdcx-v6-common.mjs';

installChunkedSubmit(60);
installRetrySubmit();
const WHALE = { x: STX_WHALES[0], y: USDCX_WHALES[0] };
const MKT = { y: `${DEP}.orphan-my`, x: `${DEP}.orphan-mx` };
const MR = `${DEP}.orphan-mr`;
const U = { y: Number(MIN.y), x: Number(MIN.x) }; // 1 unit = min deposit

const SOURCES = { patched: () => src(N.market) };

const cv = (hex) => cvToString(deserializeCV(hex));
const decode = (step) => {
  const r = step?.Result ?? step;
  if (r?.Eval) return 'Ok' in r.Eval ? cv(r.Eval.Ok) : `EVAL-ERR ${JSON.stringify(r.Eval.Err).slice(0, 200)}`;
  if (r?.Transaction?.Ok) { const t = r.Transaction.Ok; if (t.vm_error || t.post_condition_aborted) return `ENGINE-ERR ${JSON.stringify(t).slice(0, 300)}`; return cv(t.result); }
  return `ENGINE-ERR ${JSON.stringify(r).slice(0, 300)}`;
};
const ok = (v) => v.startsWith('(ok');
let passed = 0, checks = 0, failures = 0, sid;
const failed = [];
const keySteps = [];
function check(label, actual, want) {
  checks++;
  const good = typeof want === 'function' ? want(actual) : actual === want;
  if (good) passed++; else { failures++; failed.push(label); }
  console.log(`${good ? 'ok  ' : 'FAIL'} ${checks}. ${label}: ${String(actual).slice(0, 300)}${good ? '' : `; expected ${typeof want === 'function' ? want.toString() : want}`}`);
  return good;
}
async function ev(label, cid, code, want) {
  const out = await submitSimulationSteps(sid, { steps: [{ Eval: [DEP, '', cid, code] }] });
  const v = decode(out.steps[0]);
  if (want !== undefined) check(label, v, want);
  return v;
}
async function tx(label, sender, cid, fn, args, want) {
  const r = await callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 });
  const v = r.vmError || r.pcAborted ? `ENGINE-ERR ${JSON.stringify(r).slice(0, 300)}` : r.result;
  check(label, v, want);
  return r;
}
// Same as tx, and records the stxer UI step number (1-indexed) of the call.
async function keyTx(label, sender, cid, fn, args, want) {
  const r = await tx(label, sender, cid, fn, args, want);
  const steps = (await getSimulationResult(sid)).steps;
  const n = steps.length;
  check(`${label}: stxer step ${n} holds this result`, decode(steps[n - 1]), r.vmError || r.pcAborted ? (() => false) : r.result);
  keySteps.push(`step ${n}: ${label} -> ${r.result}`);
  return r;
}
async function stxTo(label, sender, recipient, amount) {
  const raw = await makeUnsignedSTXTokenTransfer({ recipient, amount, nonce: await getNonce(sid, sender), network: 'mainnet', publicKey: '', fee: 0 });
  setSender(raw, sender);
  const out = await submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] });
  check(label, decode(out.steps[0]), '(ok true)');
}
const fund = (side, who, amount) => side === 'x'
  ? stxTo(`fund ${who.slice(0, 8)} ${amount} uSTX`, WHALE.x, who, BigInt(amount))
  : tx(`fund ${who.slice(0, 8)} ${amount} uUSDCx`, WHALE.y, USDCX, 'transfer', [uintCV(amount), P(WHALE.y), P(who), noneCV()], '(ok true)');
function prints(r) {
  const evs = (r.receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e);
  return evs.filter((e) => e.contract_event?.contract_identifier === CORE).map((e) => cv(e.contract_event.raw_value));
}
const bal = (side, p) => balanceExpr(side, p);
const cyc = '(var-get current-cycle)';
const dep = (side, p) => `(get-token-${side}-deposit ${cyc} '${p})`;
const total = (side) => `(get total-token-${side} (get-cycle-totals ${cyc}))`;
const list = (side) => `(get-token-${side}-depositors ${cyc})`;
const onList = (side, p) => `(is-some (index-of? ${list(side)} '${p}))`;
const pLimit = (side, p) => `(is-some (get-token-${side}-pending-limit '${p}))`;
const pReadmit = (side, p) => `(is-some (get-token-${side}-pending-readmit '${p}))`;
const dLimit = (side, p) => `(map-get? token-${side}-deposit-limits '${p})`;
const parked = (side, p) => `(get-token-${side}-parked '${p})`;
const depArgs = (side, amount, limit) => [uintCV(amount), uintCV(limit), noneCV(), T[side], A[side]];
const settleArgs = (side, who, upd) => [P(who), upd, T[side], A[side]];
const cancelArgs = (side) => [T[side], A[side]];
const other = (s) => (s === 'x' ? 'y' : 'x');
const n = (v) => BigInt(String(v).replace(/^u/, ''));
const swapArgs = (takerSide, amount, limit, upd) => [uintCV(amount), uintCV(limit), upd, T.x, A.x, T.y, A.y, boolCV(takerSide === 'x')];

async function run(mode) {
  passed = checks = failures = 0; failed.length = 0; keySteps.length = 0;
  console.log(`\n===== mode ${mode} =====`);
  const market = SOURCES[mode]();
  console.log(`market source ${market.length} bytes, cancel gate: ${market.includes('(is-some (map-get? token-y-pending-limits caller))') ? 'patched' : 'prefix'}`);
  const u0 = await lazer();
  const mid0 = midOf(u0);
  const keeper = mk(4999);
  const who = {
    y: { A: mk(7001), O: mk(7002), T: mk(7003), C: mk(7004) },
    x: { A: mk(7101), O: mk(7102), T: mk(7103), C: mk(7104) },
  };
  const LIVE = { y: mid0 * 2n, x: mid0 / 2n };
  const OPP = { x: mid0 * 3n, y: mid0 / 3n };
  const OLD = { y: (mid0 * 3n) / 2n, x: (mid0 * 2n) / 3n };
  const NEW = { y: mid0 / 3n, x: mid0 * 3n };
  const AMT = { y: 10n * BigInt(U.y), x: 10n * BigInt(U.x) };
  const OAMT = { x: 5n * BigInt(U.x), y: 5n * BigInt(U.y) };
  const NAMT = { y: 5n * BigInt(U.y), x: 5n * BigInt(U.x) };

  // ---------- phase 1: builder setup ----------
  let b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  const plan = [];
  const add = (label, build, want) => { b = build(b); plan.push({ label, want }); };
  const call = (sender, cid, fn, args) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const deploy = (name, code) => add(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes('ERR'));
  const read = (label, cid, code, want) => add(label, (bb) => bb.addEvalCode(cid, code), want);
  const fundB = (side, p, amt) => side === 'x'
    ? add(`fund ${p.slice(0, 8)}`, (bb) => bb.withSender(WHALE.x).addSTXTransfer({ recipient: p, amount: Number(amt) }), ok)
    : add(`fund ${p.slice(0, 8)}`, call(WHALE.y, USDCX, 'transfer', [uintCV(amt), P(WHALE.y), P(p), noneCV()]), '(ok true)');
  read('live core owner = CORE_OWNER', CORE, '(get-contract-owner)', CORE_OWNER);
  deploy(N.ladder, src(N.ladder));
  deploy('orphan-my', market);
  deploy('orphan-mx', market);
  deploy('orphan-mr', market);
  for (const m of [MKT.y, MKT.x, MR]) {
    add(`${m}: set-operator -> core owner`, call(DEP, m, 'set-operator', [P(CORE_OWNER)]), '(ok true)');
    add(`verify ${m} (core owner)`, call(CORE_OWNER, CORE, 'set-verified-contract', [P(m)]), '(ok true)');
    add(`initialize ${m} (core owner)`, call(CORE_OWNER, m, 'initialize', [P(m), P(WSTX), P(USDCX), uintCV(MIN.x), uintCV(MIN.y), uintCV(45), uintCV(7)]), '(ok true)');
    add(`${m}: set-operator -> DEP`, call(CORE_OWNER, m, 'set-operator', [P(DEP)]), '(ok true)');
  }
  add('MR distance-slots 0 (park the smallest)', call(DEP, MR, 'set-distance-slots', [uintCV(0)]), '(ok true)');
  for (const side of ['y', 'x']) {
    const m = MKT[side], o = other(side), { A: a, O: op } = who[side];
    fundB(side, a, AMT[side]);
    add(`${side}: A deposits (opposite empty -> live)`, call(a, m, `deposit-token-${side}`, depArgs(side, AMT[side], LIVE[side])), `(ok u${AMT[side]})`);
    read(`${side}: A live`, m, dep(side, a), `u${AMT[side]}`);
    fundB(o, op, OAMT[o]);
    add(`${side}: O submits ${o} order (pending, ${side} list non-empty)`, call(op, m, `deposit-token-${o}`, depArgs(o, OAMT[o], OPP[o])), `(ok u${OAMT[o]})`);
  }
  // MR: 39 fillers x 2 USDCx + Q 1 USDCx, all at bid mid/2 -> 40 unseated, full
  const fr = Array.from({ length: 39 }, (_, i) => mk(5000 + i));
  const R = { Q: mk(7201), N: mk(7202), T: mk(7203) };
  const BID = mid0 / 2n;
  for (const p of fr) {
    fundB('y', p, 2 * U.y);
    add('MR filler bid mid/2', call(p, MR, 'deposit-token-y', depArgs('y', 2 * U.y, BID)), `(ok u${2 * U.y})`);
  }
  fundB('y', R.Q, U.y);
  add('MR: Q 1 USDCx (smallest)', call(R.Q, MR, 'deposit-token-y', depArgs('y', U.y, BID)), `(ok u${U.y})`);
  read('MR: list at 40', MR, `(len ${list('y')})`, 'u40');
  read('MR: side full for a newcomer', MR, `(side-full-y ${list('y')} '${R.N})`, 'true');
  sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const setup = (await getSimulationResult(sid)).steps.filter((s) => s.Result?.Transaction || s.Result?.Eval);
  if (setup.length !== plan.length) throw new Error(`setup result count ${setup.length} != ${plan.length}`);
  plan.forEach((s, i) => check(s.label, decode(setup[i]), s.want));
  if (failures) return;

  // ---------- phase 2: pin fork time just before one signed [45,7] Lazer update ----------
  let upd, at, uu;
  const tip0 = await getSimulationTip(sid);
  for (let i = 0; i < 30; i++) {
    const u = await lazer();
    at = (await lazerTimes(u.hex)).at;
    if (at - 2 > Number(tip0.block_time)) { upd = bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex')); uu = u; break; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!upd) throw new Error('no Lazer update newer than the fork tip');
  const px = midOf(uu); // clearing price used by settle
  console.log(`setup mid ${mid0}, settle mid ${px}`);
  const stamp = at - 2;
  await submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: stamp - Number(tip0.burn_block_time) } }] });
  await ev('fork clock pinned 2s before the signed update', MKT.y, 'stacks-block-time', `u${stamp}`);
  // Taker input that fills 95% of a maker's value at the settle mid: all of
  // it trades, the maker's leftover (< min deposit) is refunded -> maker 0.
  // 6/6 dp: y = x * px / 1e8.
  const takerIn = (makerSide, amt) => makerSide === 'y'
    ? (amt * SCALE * 95n) / (px * 100n)
    : (amt * px * 95n) / (SCALE * 100n);

  for (const side of ['y', 'x']) {
    const m = MKT[side], o = other(side), { A: a, O: op, T: tk, C: c } = who[side];
    console.log(`\n--- ${side} side (market ${m}) ---`);
    await tx(`${side}: settle O (${o} order placed, non-willing)`, keeper, m, `settle-token-${o}-deposit`, settleArgs(o, op, upd), `(ok u${OAMT[o]})`);
    await ev(`${side}: O on the ${o} book`, m, dep(o, op), `u${OAMT[o]}`);
    await tx(`${side}: A set-token-${side}-limit -> PENDING`, a, m, `set-token-${side}-limit`, [uintCV(OLD[side]), noneCV()], '(ok false)');
    await ev(`${side}: A pending limit set`, m, `(get limit (unwrap-panic (get-token-${side}-pending-limit '${a})))`, `u${OLD[side]}`);
    await ev(`${side}: A live limit still the first one`, m, `(get limit (unwrap-panic ${dLimit(side, a)}))`, `u${LIVE[side]}`);
    const tin = takerIn(side, AMT[side]);
    await fund(o, tk, tin);
    const sw = await tx(`${side}: taker swap (${o} in, ${tin}) fills A`, tk, m, 'swap', swapArgs(o, tin, o === 'x' ? mid0 / 2n : mid0 * 2n, upd), ok);
    console.log(`   swap prints: ${prints(sw).map((s) => s.slice(0, 120)).join(' | ')}`);
    await ev(`${side}: A deposit 0 (filled completely)`, m, dep(side, a), 'u0');
    await ev(`${side}: A parked 0`, m, parked(side, a), 'u0');
    await ev(`${side}: A off the list`, m, onList(side, a), 'false');
    await ev(`${side}: A received ${o}`, m, `(> ${bal(o, a)} u0)`, 'true');
    await ev(`${side}: A pending limit ORPHANED (still set)`, m, pLimit(side, a), 'true');
    await ev(`${side}: A no pending readmit`, m, pReadmit(side, a), 'false');
    await ev(`${side}: O untouched`, m, dep(o, op), `u${OAMT[o]}`);
    await ev(`${side}: taker holds no resting order`, m, dep(o, tk), 'u0');
    const BA = await ev(`${side}: A ${side} balance (leftover refund)`, m, bal(side, a));
    const BAo = await ev(`${side}: A ${o} balance`, m, bal(o, a));
    const BM = await ev(`${side}: market ${side} balance`, m, bal(side, m));
    const BMo = await ev(`${side}: market ${o} balance`, m, bal(o, m));
    await keyTx(`${side}: A cancel with only an orphan pending limit`, a, m, `cancel-token-${side}-deposit`, cancelArgs(side), '(ok u0)');
    await ev(`${side}: A pending limit cleared`, m, pLimit(side, a), 'false');
    await ev(`${side}: A pending readmit none`, m, pReadmit(side, a), 'false');
    await ev(`${side}: A deposit-limits none`, m, dLimit(side, a), 'none');
    await ev(`${side}: A ${side} balance unchanged`, m, bal(side, a), BA);
    await ev(`${side}: A ${o} balance unchanged`, m, bal(o, a), BAo);
    await ev(`${side}: market ${side} balance unchanged`, m, bal(side, m), BM);
    await ev(`${side}: market ${o} balance unchanged`, m, bal(o, m), BMo);
    await fund(side, a, NAMT[side]);
    await tx(`${side}: A new deposit at a different limit (pending, ${o} list non-empty)`, a, m, `deposit-token-${side}`, depArgs(side, NAMT[side], NEW[side]), `(ok u${NAMT[side]})`);
    await tx(`${side}: settle A's new deposit`, keeper, m, `settle-token-${side}-deposit`, settleArgs(side, a, upd), `(ok u${NAMT[side]})`);
    await ev(`${side}: A new order live`, m, dep(side, a), `u${NAMT[side]}`);
    await ev(`${side}: A new limit stored`, m, `(get limit (unwrap-panic ${dLimit(side, a)}))`, `u${NEW[side]}`);
    await keyTx(`${side}: third party settle-token-${side}-limit for A`, keeper, m, `settle-token-${side}-limit`, [P(a), upd], '(err u1030)');
    await ev(`${side}: A limit unchanged (new)`, m, `(get limit (unwrap-panic ${dLimit(side, a)}))`, `u${NEW[side]}`);
    await ev(`${side}: A pending limit none`, m, pLimit(side, a), 'false');
    await keyTx(`${side}: C cancel with nothing at all`, c, m, `cancel-token-${side}-deposit`, cancelArgs(side), '(err u1005)');
    const BA2 = n(await ev(`${side}: A balance before live cancel`, m, bal(side, a)));
    const BM2 = n(await ev(`${side}: market balance before live cancel`, m, bal(side, m)));
    await keyTx(`${side}: A cancel with a live order refunds it`, a, m, `cancel-token-${side}-deposit`, cancelArgs(side), `(ok u${NAMT[side]})`);
    await ev(`${side}: A refunded exactly`, m, bal(side, a), `u${BA2 + NAMT[side]}`);
    await ev(`${side}: market paid exactly`, m, bal(side, m), `u${BM2 - NAMT[side]}`);
    await ev(`${side}: A deposit 0`, m, dep(side, a), 'u0');
    await ev(`${side}: A off the list`, m, onList(side, a), 'false');
    await ev(`${side}: A deposit-limits none`, m, dLimit(side, a), 'none');
    await ev(`${side}: A pending limit none`, m, pLimit(side, a), 'false');
    await ev(`${side}: A pending deposit none`, m, `(get-token-${side}-pending-deposit '${a})`, 'none');
    await tx(`${side}: A repeat cancel refuses`, a, m, `cancel-token-${side}-deposit`, cancelArgs(side), '(err u1005)');
    await ev(`${side}: market ${side} = book (solvent)`, m, `(is-eq ${bal(side, m)} ${total(side)})`, 'true');
    await ev(`${side}: market ${o} = book (solvent)`, m, `(is-eq ${bal(o, m)} ${total(o)})`, 'true');
  }

  // ---------- MR: orphan pending-readmit ----------
  console.log('\n--- MR: orphan pending readmit ---');
  await fund('y', R.N, 3 * U.y);
  await tx('MR: N submits 3 USDCx (pending, side full)', R.N, MR, 'deposit-token-y', depArgs('y', 3 * U.y, BID), `(ok u${3 * U.y})`);
  await tx('MR: settle N parks Q', keeper, MR, 'settle-token-y-deposit', settleArgs('y', R.N, upd), `(ok u${3 * U.y})`);
  await ev('MR: Q parked 1 USDCx', MR, parked('y', R.Q), `u${U.y}`);
  await ev('MR: Q off the book', MR, dep('y', R.Q), 'u0');
  await tx('MR: Q submits readmit', R.Q, MR, 'readmit-token-y', [P(R.Q)], `(ok u${U.y})`);
  await ev('MR: Q pending readmit set', MR, pReadmit('y', R.Q), 'true');
  await fund('y', R.Q, 9 * U.y);
  await tx('MR: Q deposits 9 USDCx at mid*2 (pending, side full)', R.Q, MR, 'deposit-token-y', depArgs('y', 9 * U.y, mid0 * 2n), `(ok u${9 * U.y})`);
  await tx('MR: settle Q (parked carried in, a filler parked)', keeper, MR, 'settle-token-y-deposit', settleArgs('y', R.Q, upd), (v) => ok(v));
  await ev('MR: Q live 10 USDCx (1 carried + 9)', MR, dep('y', R.Q), `u${10 * U.y}`);
  await ev('MR: Q parked 0', MR, parked('y', R.Q), 'u0');
  await ev('MR: Q pending readmit still set', MR, pReadmit('y', R.Q), 'true');
  const tin = takerIn('y', BigInt(10 * U.y));
  await fund('x', R.T, tin);
  await tx(`MR: taker swap (x in, ${tin}) fills Q`, R.T, MR, 'swap', swapArgs('x', tin, mid0 / 2n, upd), ok);
  await ev('MR: Q deposit 0 (filled)', MR, dep('y', R.Q), 'u0');
  await ev('MR: Q parked 0', MR, parked('y', R.Q), 'u0');
  await ev('MR: Q pending readmit ORPHANED', MR, pReadmit('y', R.Q), 'true');
  const QB = await ev('MR: Q USDCx balance', MR, bal('y', R.Q));
  const MB = await ev('MR: market USDCx balance', MR, bal('y', MR));
  await keyTx('MR: Q cancel with only an orphan pending readmit', R.Q, MR, 'cancel-token-y-deposit', cancelArgs('y'), '(ok u0)');
  await ev('MR: Q pending readmit cleared', MR, pReadmit('y', R.Q), 'false');
  await ev('MR: Q balance unchanged', MR, bal('y', R.Q), QB);
  await ev('MR: market balance unchanged', MR, bal('y', MR), MB);
  await keyTx('MR: settle-token-y-readmit for Q', keeper, MR, 'settle-token-y-readmit', [P(R.Q), upd], '(err u1030)');
  await ev('MR: Q pending readmit none', MR, pReadmit('y', R.Q), 'false');
}

const summary = [];
for (const mode of ['patched']) {
  try { await run(mode); } catch (e) { console.error(`${mode}: ${e.stack || e}`); failures++; }
  summary.push(`${mode}: ${passed}/${checks}${failures ? ` FAIL (${failed.slice(0, 6).join('; ')})` : ''} https://stxer.xyz/simulations/mainnet/${sid}\n  ${keySteps.join('\n  ')}`);
}
console.log('\n' + summary.join('\n'));
if (summary.some((s) => s.includes('FAIL'))) process.exitCode = 1;
