// Port of verify-v6-3-cancel-orphan-pending.js (patched mode) to the
// sBTC/USDCx v6-5 market. Fork only.
// Run: node simulations/verify-v6-3-cancel-orphan-pending-sbtc-usdcx.mjs
//
// AIBTC bounty muerdzoc805a745ecc99 (ARION F-4 / Light Brio L-2, ARION F-3):
// a maker's set-token-{x,y}-limit goes PENDING (other side non-empty); a taker
// fills the order completely before anyone settles the limit -> orphaned
// pending limit. The patched cancel runs on a leftover pending-limit /
// pending-readmit entry: deletes pending-limits, pending-readmits and
// deposit-limits, moves no funds, returns (ok u0); the old limit can no longer
// be settled onto a later order (u1030).
//
// Markets (one per scenario, the same exact bytes under fresh names):
//   MY  Y side: A bids 10 USDCx at mid*2 (live), O asks 5000 sats at mid*3
//       (non-willing, makes set-token-y-limit pending), A sets limit mid*1.5
//       (pending), taker swap (X in) fills A completely.
//   MX  X mirror: A asks 10000 sats at mid/2, O bids 5 USDCx at mid/3, A sets
//       limit mid*2/3 (pending), taker swap (Y in) fills A completely.
//   then per side: A cancel (ok u0), A deposits a new order at a different
//       limit, third party settles A's old limit (err u1030); regressions:
//       empty cancel u1005, cancel of a live order refunds it.
//   MR  orphan pending-readmit (Y): 40 makers (side full at the market's
//       default seats-per-side 10, distance-slots 0), newcomer parks Q; Q
//       submits readmit; Q deposits (parked carried in, parked 0); taker fills
//       Q completely -> readmit orphan; cancel ok u0, cleared,
//       settle-token-y-readmit err u1030.
// Only the patched proof runs: orphan-my / -mx / -mr are the exact
// markets-sbtc-usdcx-jing-v6-5 deploy bytes (faktory-dao template, SHA-256
// checked). The prefix mode rebuilds a historical sBTC/STX market (git
// 7c6172b) with no sBTC/USDCx counterpart.
// Environment differences from the sBTC/STX suite: fork at tip on the LIVE
// jing-core-v6 / jing-ladder-sbtc-usdcx-v1 (bound by relative name); verify
// and initialize by the live core owner (initialize needs tx-sender =
// operator = core owner); token y = USDCx (1 unit = 1 USDCx, the live min;
// x unit 1000 sats); Lazer feeds [1,7].
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  noneCV, boolCV, deserializeCV, cvToString, getAddressFromPrivateKey, hexToCV,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, getSimulationTip, submitSimulationSteps, callContract,
} from 'stxer';
import { installChunkedSubmit } from './_chunked-submit.js';
import {
  DEP, NODE, SBTC, USDCX, SBTC_WHALE, USDC_WHALE, CORE, bytes, printHashes,
  fetchUsdcxUpdate, usdcxFeedTimes, midOf,
} from './_sbtc-usdcx-v6-5-common.mjs';

installChunkedSubmit(60);
const WHALE = { x: SBTC_WHALE, y: USDC_WHALE };
const P = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const T = { x: P(SBTC), y: P(USDCX) };
const A = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('usdcx-token') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const MKT = { y: `${DEP}.orphan-my`, x: `${DEP}.orphan-mx` };
const MR = `${DEP}.orphan-mr`;
const U = { y: 1_000_000, x: 1000 };
const SCALE = 10_000_000_000n; // PRICE_PRECISION * DECIMAL_FACTOR

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
const isTransient = (e) => /failed to get block info|ECONNRESET|fetch failed|socket hang|\b(429|502|503|504|520|522|524)\b/i.test(String(e?.message ?? e));
async function retry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= 6 || !isTransient(e)) throw e;
      console.log(`  transient error (${String(e.message ?? e).slice(0, 120)}), retry ${i + 1}`);
      await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
    }
  }
}
async function ev(label, cid, code, want) {
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Eval: [DEP, '', cid, code] }] }));
  const v = decode(out.steps[0]);
  if (want !== undefined) check(label, v, want);
  return v;
}
async function tx(label, sender, cid, fn, args, want) {
  const r = await retry(() => callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 }));
  const v = r.vmError || r.pcAborted ? `ENGINE-ERR ${JSON.stringify(r).slice(0, 300)}` : r.result;
  check(label, v, want);
  return r;
}
// Same as tx, and records the stxer UI step number (1-indexed) of the call.
async function keyTx(label, sender, cid, fn, args, want) {
  const r = await tx(label, sender, cid, fn, args, want);
  const steps = (await retry(() => getSimulationResult(sid))).steps;
  const n = steps.length;
  check(`${label}: stxer step ${n} holds this result`, decode(steps[n - 1]), r.vmError || r.pcAborted ? (() => false) : r.result);
  keySteps.push(`step ${n}: ${label} -> ${r.result}`);
  return r;
}
const fund = (side, who, amount) => tx(`fund ${who.slice(0, 8)} ${amount} ${side === 'y' ? 'uUSDCx' : 'sats'}`, WHALE[side], side === 'y' ? USDCX : SBTC, 'transfer', [uintCV(amount), P(WHALE[side]), P(who), noneCV()], '(ok true)');
function prints(r) {
  const evs = (r.receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e);
  return evs.filter((e) => e.contract_event?.contract_identifier === CORE).map((e) => cv(e.contract_event.raw_value));
}
const bal = (side, p) => `(unwrap-panic (contract-call? '${side === 'y' ? USDCX : SBTC} get-balance '${p}))`;
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
async function liveRead(cid, fn) {
  const [a, nm] = cid.split('.');
  const r = await retry(async () => (await fetch(`${NODE}/v2/contracts/call-read/${a}/${nm}/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sender: DEP, arguments: [] }) })).json());
  if (!r.okay) throw new Error(`${cid} ${fn}: ${JSON.stringify(r).slice(0, 200)}`);
  return cvToString(hexToCV(r.result));
}

async function run() {
  printHashes();
  const market = bytes('market');
  const CORE_OWNER = await liveRead(CORE, 'get-contract-owner');
  console.log(`market bytes ${Buffer.byteLength(market)}, cancel gate: ${market.includes('(is-some (map-get? token-y-pending-limits caller))') ? 'patched' : 'NOT PATCHED'}; core owner ${CORE_OWNER}`);
  const u0 = await retry(fetchUsdcxUpdate);
  const mid0 = midOf(u0);
  const keeper = mk(4999);
  const who = {
    y: { A: mk(7001), O: mk(7002), T: mk(7003), C: mk(7004) },
    x: { A: mk(7101), O: mk(7102), T: mk(7103), C: mk(7104) },
  };
  // Limits from the setup mid; the settle mid is within a few bps of it.
  const LIVE = { y: mid0 * 2n, x: mid0 / 2n };          // A's first order: willing
  const OPP = { x: mid0 * 3n, y: mid0 / 3n };           // O's order: never willing
  const OLD = { y: (mid0 * 3n) / 2n, x: (mid0 * 2n) / 3n }; // pending limit that gets orphaned
  const NEW = { y: mid0 / 3n, x: mid0 * 3n };           // A's second order: passive
  const AMT = { y: 10n * BigInt(U.y), x: 10n * BigInt(U.x) };
  const OAMT = { x: 5n * BigInt(U.x), y: 5n * BigInt(U.y) };
  const NAMT = { y: 5n * BigInt(U.y), x: 5n * BigInt(U.x) };
  console.log(`setup mid ${mid0} ($${Number(mid0) / 1e8} per BTC)`);

  // ---------- phase 1: builder setup ----------
  let b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  const plan = [];
  const add = (label, build, want) => { b = build(b); plan.push({ label, want }); };
  const call = (sender, cid, fn, args) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const deploy = (name, code) => add(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes('ERR'));
  const read = (label, cid, code, want) => add(label, (bb) => bb.addEvalCode(cid, code), want);
  const fundB = (side, p, amt) => add(`fund ${p.slice(0, 8)}`, call(WHALE[side], side === 'y' ? USDCX : SBTC, 'transfer', [uintCV(amt), P(WHALE[side]), P(p), noneCV()]), '(ok true)');
  deploy('orphan-my', market);
  deploy('orphan-mx', market);
  deploy('orphan-mr', market);
  for (const m of [MKT.y, MKT.x, MR]) {
    add(`verify ${m}`, call(CORE_OWNER, CORE, 'set-verified-contract', [P(m)]), '(ok true)');
    add(`operator -> core owner ${m}`, call(DEP, m, 'set-operator', [P(CORE_OWNER)]), '(ok true)');
    add(`initialize ${m} (1000 sats / 1 USDCx, feeds 1/7)`, call(CORE_OWNER, m, 'initialize', [P(m), T.x, T.y, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(7)]), '(ok true)');
    add(`operator -> DEP ${m}`, call(CORE_OWNER, m, 'set-operator', [P(DEP)]), '(ok true)');
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
  read('MR: seats-per-side default 10', MR, '(protected-seats)', 'u10');
  for (const p of fr) {
    fundB('y', p, 2 * U.y);
    add('MR filler bid mid/2', call(p, MR, 'deposit-token-y', depArgs('y', 2 * U.y, BID)), `(ok u${2 * U.y})`);
  }
  fundB('y', R.Q, U.y);
  add('MR: Q 1 USDCx (smallest)', call(R.Q, MR, 'deposit-token-y', depArgs('y', U.y, BID)), `(ok u${U.y})`);
  read('MR: list at 40', MR, `(len ${list('y')})`, 'u40');
  read('MR: side full for a newcomer', MR, `(side-full-y ${list('y')} '${R.N})`, 'true');
  sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const setup = (await retry(() => getSimulationResult(sid))).steps.filter((s) => s.Result?.Transaction || s.Result?.Eval);
  if (setup.length !== plan.length) throw new Error(`setup result count ${setup.length} != ${plan.length}`);
  plan.forEach((s, i) => check(s.label, decode(setup[i]), s.want));
  if (failures) return;

  // ---------- phase 2: pin fork time just before one signed Lazer update ----------
  let upd, at, uu;
  const tip0 = await retry(() => getSimulationTip(sid));
  for (let i = 0; i < 30; i++) {
    const u = await retry(fetchUsdcxUpdate);
    at = (await retry(() => usdcxFeedTimes(u.hex))).at;
    if (at - 2 > Number(tip0.block_time)) { upd = bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex')); uu = u; break; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!upd) throw new Error('no Lazer update newer than the fork tip');
  const px = midOf(uu); // clearing price used by settle
  console.log(`setup mid ${mid0}, settle mid ${px}`);
  const stamp = at - 2;
  await retry(() => submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: stamp - Number(tip0.burn_block_time) } }] }));
  await ev('fork clock pinned 2s before the signed update', MKT.y, 'stacks-block-time', `u${stamp}`);
  // Taker input that fills 95% of a maker's value at the settle mid: all of
  // it trades, the maker's leftover (< min deposit) is refunded -> maker 0.
  const takerIn = (makerSide, amt) => makerSide === 'y'
    ? (amt * SCALE * 95n) / (px * 100n)
    : (amt * px * 95n) / (SCALE * 100n);
  // the leftover 5% must be under the min deposit for the "maker 0" claims
  check('model: 5% leftovers under the min deposits (0.5 USDCx < 1, 500 sats < 1000)', `${AMT.y / 20n < BigInt(U.y)} ${AMT.x / 20n < BigInt(U.x)}`, 'true true');

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

try { await run(); } catch (e) { console.error(e.stack || e); failures++; failed.push(`exception: ${String(e.message ?? e).slice(0, 160)}`); }
console.log(`\npatched: ${passed}/${checks}${failures ? ` FAIL (${failed.slice(0, 6).join('; ')})` : ''} https://stxer.xyz/simulations/mainnet/${sid}\n  ${keySteps.join('\n  ')}`);
if (failures) process.exitCode = 1;
