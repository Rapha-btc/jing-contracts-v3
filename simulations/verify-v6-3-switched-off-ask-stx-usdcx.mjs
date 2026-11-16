// Fork only. Run: node simulations/verify-v6-3-switched-off-ask-stx-usdcx.mjs
// STX/USDCx port of verify-v6-3-switched-off-ask.js, `patched` mode only
// (prefix = historical sBTC/STX bytes, no STX/USDCx equivalent).
//
// Market = contracts/stx-usdcx/markets-stx-usdcx-jing-v6-4.clar (stripped
// deploy bytes) x2 (swoff-mx / swoff-my) on the LIVE jing-core-v6
// (CORE_OWNER verifies + initializes) + fresh jing-ladder-stx-usdcx-v1.
// x = native STX, y = USDCx, 6 dp each, mins 1 STX / 1 USDCx.
//
// A switched-off pegged ask (MAX_UINT) from a new maker on a full X side must
// be refunded "queue-full" (the fix tests MAX_UINT), not park a live resident.
//   MX (X side full): 38 fillers x 2 STX at fixed asks mid*(1.50+0.01i),
//     O1 1 STX at mid*1.95 and O2 1.5 STX at mid*1.96 (live, outside top 10).
//   MY (Y side full): 39 fillers x 2 USDCx at fixed bid mid/2, Q1 1 USDCx.
//   ON  (MX): N_on pegged ask (100 bps, floor mid*1.005) parks O1 (edge path).
//   OFF (MX): N_off pegged ask (100 bps, floor mid*3 -> MAX_UINT), 3 STX:
//     refund "queue-full", nothing parked, book unchanged.
//   mirror (MY): N_y pegged bid (100 bps, cap mid/4 -> u0), 3 USDCx: refund.
import {
  ClarityVersion, uintCV, bufferCV, noneCV, someCV, deserializeCV, cvToString, makeUnsignedSTXTokenTransfer,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, getSimulationTip, submitSimulationSteps,
  callContract, getNonce, setSender,
} from 'stxer';
import { installChunkedSubmit } from './_chunked-submit.js';
import { installRetrySubmit } from './_retry-submit.js';
import {
  NODE, DEP, CORE, CORE_OWNER, WSTX, USDCX, STX_WHALES, USDCX_WHALES, N, P_ as P, traits as T, assets as A,
  mk, balanceExpr, src, lazer, lazerTimes, midOf, MIN,
} from './_stx-usdcx-v6-common.mjs';

installChunkedSubmit(60);
installRetrySubmit();
const WHALE = { x: STX_WHALES[0], y: USDCX_WHALES[0] };
const MAX_UINT = 340282366920938463463374607431768211455n;
const MX = `${DEP}.swoff-mx`, MY = `${DEP}.swoff-my`;
const U = { y: Number(MIN.y), x: Number(MIN.x) };
const FILL = { y: 2 * U.y, x: 2 * U.x };
const O2AMT = (3 * U.x) / 2; // 1.5 units (original 1500 sats at a 1000-sat min)
const NFILL = 38;

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
async function stxTo(label, sender, recipient, amount) {
  const raw = await makeUnsignedSTXTokenTransfer({ recipient, amount, nonce: await getNonce(sid, sender), network: 'mainnet', publicKey: '', fee: 0 });
  setSender(raw, sender);
  const out = await submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] });
  check(label, decode(out.steps[0]), '(ok true)');
}
const fund = (side, who, amount) => side === 'x'
  ? stxTo(`fund ${who.slice(0, 8)} ${amount} uSTX`, WHALE.x, who, amount)
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
const depArgs = (side, amount, limit, spread) => [uintCV(amount), uintCV(limit), spread === undefined ? noneCV() : someCV(uintCV(spread)), T[side], A[side]];
const settleArgs = (side, who, upd) => [P(who), upd, T[side], A[side]];
const parkedSum = (side, ps) => `(+ u0 ${ps.map((p) => `(get-token-${side}-parked '${p})`).join(' ')})`;

async function run(mode) {
  passed = checks = failures = 0; failed.length = 0;
  console.log(`\n===== mode ${mode} =====`);
  const market = SOURCES[mode]();
  console.log(`market source ${market.length} bytes, refund test: ${market.match(/\(and new-maker full \(is-eq ask [^)]+\)\)/)?.[0]}`);
  const u0 = await lazer();
  const mid = midOf(u0);
  const pct = (n) => (mid * BigInt(n)) / 10000n; // n in bps of mid
  const keeper = mk(4999);
  const fx = Array.from({ length: NFILL }, (_, i) => mk(5000 + i));
  const fy = Array.from({ length: NFILL }, (_, i) => mk(6000 + i));
  const X = { O1: mk(7101), O2: mk(7102), Non: mk(7103), Noff: mk(7104) };
  const Y = { Q1: mk(7201), N: mk(7202) };
  const askOf = (i) => pct(15000 + 100 * i);
  const ASK_O1 = pct(19500), ASK_O2 = pct(19600);
  const BID = mid / 2n;

  // ---------- phase 1: builder setup ----------
  let b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  const plan = [];
  const add = (label, build, want) => { b = build(b); plan.push({ label, want }); };
  const call = (sender, cid, fn, args) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const deploy = (name, code) => add(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes('ERR'));
  const read = (label, cid, code, want) => add(label, (bb) => bb.addEvalCode(cid, code), want);
  const fundB = (side, p, amt) => side === 'x'
    ? add(`fund ${p.slice(0, 8)}`, (bb) => bb.withSender(WHALE.x).addSTXTransfer({ recipient: p, amount: amt }), ok)
    : add(`fund ${p.slice(0, 8)}`, call(WHALE.y, USDCX, 'transfer', [uintCV(amt), P(WHALE.y), P(p), noneCV()]), '(ok true)');
  read('live core owner = CORE_OWNER', CORE, '(get-contract-owner)', CORE_OWNER);
  deploy(N.ladder, src(N.ladder));
  deploy('swoff-mx', market);
  deploy('swoff-my', market);
  for (const m of [MX, MY]) {
    add(`${m}: set-operator -> core owner`, call(DEP, m, 'set-operator', [P(CORE_OWNER)]), '(ok true)');
    add(`verify ${m} (core owner)`, call(CORE_OWNER, CORE, 'set-verified-contract', [P(m)]), '(ok true)');
    add(`initialize ${m} (core owner)`, call(CORE_OWNER, m, 'initialize', [P(m), P(WSTX), P(USDCX), uintCV(MIN.x), uintCV(MIN.y), uintCV(45), uintCV(7)]), '(ok true)');
    add(`${m}: set-operator -> DEP`, call(CORE_OWNER, m, 'set-operator', [P(DEP)]), '(ok true)');
    read(`${m}: protected seats 10, distance slots 10`, m, '(list (protected-seats) (get-distance-slots))', '(list u10 u10)');
  }
  fx.forEach((p, i) => {
    fundB('x', p, FILL.x);
    add(`x filler ${i} ask mid*${(1.5 + i / 100).toFixed(2)}`, call(p, MX, 'deposit-token-x', depArgs('x', FILL.x, askOf(i))), `(ok u${FILL.x})`);
  });
  fundB('x', X.O1, U.x);
  add('x: O1 1 STX ask mid*1.95 (live, outside top 10)', call(X.O1, MX, 'deposit-token-x', depArgs('x', U.x, ASK_O1)), `(ok u${U.x})`);
  fundB('x', X.O2, O2AMT);
  add('x: O2 1.5 STX ask mid*1.96 (live, outside top 10)', call(X.O2, MX, 'deposit-token-x', depArgs('x', O2AMT, ASK_O2)), `(ok u${O2AMT})`);
  read('x: list at 40', MX, `(len ${list('x')})`, 'u40');
  read('x: side full for a newcomer', MX, `(side-full-x ${list('x')} '${X.Noff})`, 'true');
  read('x: totals', MX, total('x'), `u${NFILL * FILL.x + U.x + O2AMT}`);
  fy.forEach((p) => {
    fundB('y', p, FILL.y);
    add('y filler bid mid/2', call(p, MY, 'deposit-token-y', depArgs('y', FILL.y, BID)), `(ok u${FILL.y})`);
  });
  const fy39 = mk(6100);
  fundB('y', fy39, FILL.y);
  add('y filler 39 bid mid/2', call(fy39, MY, 'deposit-token-y', depArgs('y', FILL.y, BID)), `(ok u${FILL.y})`);
  fundB('y', Y.Q1, U.y);
  add('y: Q1 1 USDCx (smallest)', call(Y.Q1, MY, 'deposit-token-y', depArgs('y', U.y, BID)), `(ok u${U.y})`);
  read('y: list at 40', MY, `(len ${list('y')})`, 'u40');
  read('y: side full for a newcomer', MY, `(side-full-y ${list('y')} '${Y.N})`, 'true');
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
  const px = midOf(uu);
  console.log(`setup mid ${mid}, settle mid ${px}`);
  const stamp = at - 2;
  await submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: stamp - Number(tip0.burn_block_time) } }] });
  await ev('fork clock pinned 2s before the signed update', MX, 'stacks-block-time', `u${stamp}`);
  await ev('pegged-ask off (floor mid*3, 100 bps) = MAX_UINT', MX, `(pegged-ask u${px} u100 u${pct(30000)})`, `u${MAX_UINT}`);
  await ev('pegged-ask on (floor mid*1.005, 100 bps) = mid*1.01', MX, `(pegged-ask u${px} u100 u${pct(10050)})`, `u${(px * 10100n) / 10000n}`);
  await ev('pegged-bid off (cap mid/4, 100 bps) = u0', MY, `(pegged-bid u${px} u100 u${mid / 4n})`, 'u0');
  const xAll = [...fx, X.O1, X.O2, X.Non, X.Noff];

  // ---- regression: switched-ON pegged ask from a new maker, full X side ----
  {
    const amt = 3 * U.x;
    await fund('x', X.Non, amt);
    await tx('x: N_on submits pegged ask ON (pending, side full)', X.Non, MX, 'deposit-token-x', depArgs('x', amt, pct(10050), 100), `(ok u${amt})`);
    const r = await tx('x: settle N_on', keeper, MX, 'settle-token-x-deposit', settleArgs('x', X.Non, upd), `(ok u${amt})`);
    const pr = prints(r).join(' ');
    check('x: N_on settle logs park-x + deposit-x, no refund', pr, (v) => v.includes('park-x') && v.includes('deposit-x') && !v.includes('pending-refund-x'));
    await ev('x: O1 parked 1 STX (smallest outside top, edge path)', MX, `(get-token-x-parked '${X.O1})`, `u${U.x}`);
    await ev('x: O1 off the book', MX, dep('x', X.O1), 'u0');
    await ev('x: O1 off the list', MX, onList('x', X.O1), 'false');
    await ev('x: N_on on the book', MX, dep('x', X.Non), `u${amt}`);
    await ev('x: N_on on the list', MX, onList('x', X.Non), 'true');
    await ev('x: N_on live ask = mid*1.01', MX, `(token-x-limit-at '${X.Non} u${px})`, `u${(px * 10100n) / 10000n}`);
    await ev('x: O2 untouched', MX, dep('x', X.O2), `u${O2AMT}`);
    await ev('x: list still 40', MX, `(len ${list('x')})`, 'u40');
    await ev('x: totals -O1 +N_on', MX, total('x'), `u${NFILL * FILL.x + O2AMT + amt}`);
    await ev('x: market = book + parked', MX, `(is-eq ${bal('x', MX)} (+ ${total('x')} ${parkedSum('x', xAll)}))`, 'true');
  }

  // ---- switched-OFF pegged ask from a new maker, full X side (patched: refunded) ----
  {
    const amt = 3 * U.x;
    const T0 = BigInt((await ev('x: totals before', MX, total('x'))).slice(1));
    const L0 = await ev('x: list before', MX, list('x'));
    await fund('x', X.Noff, amt);
    await tx('x: N_off submits pegged ask OFF (pending, side full)', X.Noff, MX, 'deposit-token-x', depArgs('x', amt, pct(30000), 100), `(ok u${amt})`);
    await ev('x: N_off wallet emptied', MX, bal('x', X.Noff), 'u0');
    const r = await tx('x: settle N_off', keeper, MX, 'settle-token-x-deposit', settleArgs('x', X.Noff, upd), `(ok u${amt})`);
    const pr = prints(r).join(' ');
    check('x: refund reason queue-full, no park, no deposit', pr, (v) => v.includes('pending-refund-x') && v.includes('"queue-full"') && !v.includes('park-x') && !v.includes('deposit-x'));
    await ev('x: N_off got its STX back exactly', MX, bal('x', X.Noff), `u${amt}`);
    await ev('x: N_off pending cleared', MX, `(get-token-x-pending-deposit '${X.Noff})`, 'none');
    await ev('x: N_off off the list', MX, onList('x', X.Noff), 'false');
    await ev('x: N_off no deposit', MX, dep('x', X.Noff), 'u0');
    await ev('x: O2 not parked', MX, `(get-token-x-parked '${X.O2})`, 'u0');
    await ev('x: O2 still on the book', MX, dep('x', X.O2), `u${O2AMT}`);
    await ev('x: list unchanged', MX, list('x'), L0);
    await ev('x: totals unchanged', MX, total('x'), `u${T0}`);
    await ev('x: parked total', MX, parkedSum('x', xAll), `u${U.x}`);
    await ev('x: market balance = book + parked (solvent)', MX, `(is-eq ${bal('x', MX)} (+ ${total('x')} ${parkedSum('x', xAll)}))`, 'true');
    await ev('x: market balance = book + O1 parked', MX, bal('x', MX), `u${T0 + BigInt(U.x)}`);
  }

  // ---- mirror: switched-OFF pegged bid from a new maker, full Y side ----
  {
    const amt = 3 * U.y;
    const T0 = BigInt((await ev('y: totals before', MY, total('y'))).slice(1));
    const L0 = await ev('y: list before', MY, list('y'));
    const B0 = BigInt((await ev('y: market balance before', MY, bal('y', MY))).slice(1));
    await fund('y', Y.N, amt);
    await tx('y: N submits pegged bid OFF (pending, side full)', Y.N, MY, 'deposit-token-y', depArgs('y', amt, mid / 4n, 100), `(ok u${amt})`);
    const r = await tx('y: settle N', keeper, MY, 'settle-token-y-deposit', settleArgs('y', Y.N, upd), `(ok u${amt})`);
    check('y: refund reason queue-full, no park', prints(r).join(' '), (v) => v.includes('pending-refund-y') && v.includes('"queue-full"') && !v.includes('park-y') && !v.includes('deposit-y'));
    await ev('y: N got its USDCx back exactly', MY, bal('y', Y.N), `u${amt}`);
    await ev('y: N off the list', MY, onList('y', Y.N), 'false');
    await ev('y: Q1 not parked', MY, `(get-token-y-parked '${Y.Q1})`, 'u0');
    await ev('y: Q1 still on the book', MY, dep('y', Y.Q1), `u${U.y}`);
    await ev('y: list unchanged', MY, list('y'), L0);
    await ev('y: totals unchanged', MY, total('y'), `u${T0}`);
    await ev('y: market balance unchanged = book', MY, bal('y', MY), `u${B0}`);
    await ev('y: market balance = book', MY, `(is-eq ${bal('y', MY)} ${total('y')})`, 'true');
  }
}

const summary = [];
for (const mode of ['patched']) {
  try { await run(mode); } catch (e) { console.error(`${mode}: ${e.stack || e}`); failures++; }
  summary.push(`${mode}: ${passed}/${checks}${failures ? ` FAIL (${failed.slice(0, 6).join('; ')})` : ''} https://stxer.xyz/simulations/mainnet/${sid}`);
}
console.log('\n' + summary.join('\n'));
if (summary.some((s) => s.includes('FAIL'))) process.exitCode = 1;
