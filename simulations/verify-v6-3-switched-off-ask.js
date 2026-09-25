// Fork only. Run: node simulations/verify-v6-3-switched-off-ask.js [prefix] [patched]
// (no args = prefix patched). Each mode is its own stxer mainnet fork.
//
// AIBTC bounty muerdzoc805a745ecc99 (Fluid Briar, finding 3): at bb1535d
// settle-token-x-deposit refunds a new maker on a full X side as "queue-full"
// only when (is-eq ask u0). ask = order-x-price, and a switched-off ask is
// MAX_UINT (pegged-ask: spread >= 10000 or pegged under the floor), a fixed
// ask is its limit (> 0). So the test never fires: the switched-off ask goes
// into park-tenth-token-x with ask = MAX_UINT. There `edge` is never true
// (no top ask is > MAX_UINT), so it parks the smallest LIVE resident outside
// the top distance-slots asks when size > that resident. The newcomer then
// sits on the list with an ask that can never fill. The fix tests MAX_UINT
// (as v6-2 did). The Y side (bid u0) was always correct.
//
// Setup (no rungs): seats-per-side stays at its default 10, so a side is full
// for an unseated newcomer at 40 unseated makers. distance-slots default 10.
//   MX (X side full): 38 fillers x 2000 sats at fixed asks mid*(1.50+0.01i),
//     O1 1000 sats at mid*1.95 and O2 1500 sats at mid*1.96 (live, outside
//     the top 10). Y side empty (direct deposits).
//   MY (Y side full): 38 fillers x 2 STX at fixed bid mid/2, Q1 1 STX.
// Sequence:
//   regression ON (MX): N_on pegged ask (spread 100 bps, floor mid*1.005 ->
//     live ask ~mid*1.01). Edge path: parks O1 (smallest outside). Same on
//     both modes.
//   bug (MX): N_off pegged ask (spread 100 bps, floor mid*3 -> pegged under
//     floor -> MAX_UINT), 3000 sats > O2.
//     prefix: settle places N_off, parks live O2 (asserted as the bug).
//     patched: refund "queue-full", nothing parked, book unchanged.
//   mirror (MY): N_y pegged bid (spread 100 bps, cap mid/4 -> u0), 3 STX.
//     Both modes: refund "queue-full", Q1 not parked.
// Modes: prefix = git bb1535d markets-sbtc-stx-jing-v6-3.clar;
//        patched = working-tree markets-sbtc-stx-jing-v6-3.clar.
// Results 2026-09-24: prefix 222/222 (bug reproduced, f08e4ebe...),
// patched 221/221 (d1ea2618...).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  noneCV, someCV, deserializeCV, cvToString, getAddressFromPrivateKey, makeUnsignedSTXTokenTransfer,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, getSimulationTip, submitSimulationSteps,
  callContract, getNonce, setSender,
} from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';
import { installChunkedSubmit } from './_chunked-submit.js';

installChunkedSubmit(60);
const NODE = 'http://77.42.3.101/stacks-api';
const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const CORE = `${DEP}.jing-core-v6`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALE = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51' };
const MAX_UINT = 340282366920938463463374607431768211455n;
const P = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const T = { x: P(SBTC), y: P(WSTX) };
const A = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const MX = `${DEP}.swoff-mx`, MY = `${DEP}.swoff-my`;
const U = { y: 1_000_000, x: 1000 };
const FILL = { y: 2 * U.y, x: 2 * U.x };
const NFILL = 38;

const SOURCES = {
  prefix: () => execFileSync('git', ['show', 'bb1535d:contracts/markets-sbtc-stx-jing-v6-3.clar'], { cwd: new URL('..', import.meta.url) }).toString(),
  patched: () => fs.readFileSync(new URL('../contracts/markets-sbtc-stx-jing-v6-3.clar', import.meta.url), 'utf8'),
};
const fit = (code) => code.length < 100_000 ? code
  : code.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith(';')).join('\n');
const src = (name) => fs.readFileSync(new URL(`../contracts/${name}.clar`, import.meta.url), 'utf8');

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
const fund = (side, who, amount) => side === 'y'
  ? stxTo(`fund ${who.slice(0, 8)} ${amount} uSTX`, WHALE.y, who, amount)
  : tx(`fund ${who.slice(0, 8)} ${amount} sats`, WHALE.x, SBTC, 'transfer', [uintCV(amount), P(WHALE.x), P(who), noneCV()], '(ok true)');
function prints(r) {
  const evs = (r.receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e);
  return evs.filter((e) => e.contract_event?.contract_identifier === CORE).map((e) => cv(e.contract_event.raw_value));
}
const bal = (side, p) => side === 'y' ? `(stx-get-balance '${p})` : `(unwrap-panic (contract-call? '${SBTC} get-balance '${p}))`;
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
  const market = fit(SOURCES[mode]());
  console.log(`market source ${market.length} bytes, refund test: ${market.match(/\(and new-maker full \(is-eq ask [^)]+\)\)/)?.[0]}`);
  const u0 = await fetchLazerUpdateAny();
  const mid = (u0.px * 100_000_000n) / u0.py;
  const pct = (n) => (mid * BigInt(n)) / 10000n; // n in bps of mid
  const keeper = mk(4999);
  const fx = Array.from({ length: NFILL }, (_, i) => mk(5000 + i));
  const fy = Array.from({ length: NFILL }, (_, i) => mk(6000 + i));
  const X = { O1: mk(7101), O2: mk(7102), Non: mk(7103), Noff: mk(7104) };
  const Y = { Q1: mk(7201), N: mk(7202) };
  const askOf = (i) => pct(15000 + 100 * i);   // fillers: mid*1.50 .. mid*1.87
  const ASK_O1 = pct(19500), ASK_O2 = pct(19600);
  const BID = mid / 2n;

  // ---------- phase 1: builder setup ----------
  let b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  const plan = [];
  const add = (label, build, want) => { b = build(b); plan.push({ label, want }); };
  const call = (sender, cid, fn, args) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const deploy = (name, code) => add(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes('ERR'));
  const read = (label, cid, code, want) => add(label, (bb) => bb.addEvalCode(cid, code), want);
  const fundB = (side, p, amt) => side === 'y'
    ? add(`fund ${p.slice(0, 8)}`, (bb) => bb.withSender(WHALE.y).addSTXTransfer({ recipient: p, amount: amt }), ok)
    : add(`fund ${p.slice(0, 8)}`, call(WHALE.x, SBTC, 'transfer', [uintCV(amt), P(WHALE.x), P(p), noneCV()]), '(ok true)');
  deploy('jing-core-v6', src('jing-core-v6'));
  deploy('jing-ladder-v1', src('jing-ladder-v1'));
  deploy('swoff-mx', market);
  deploy('swoff-my', market);
  for (const m of [MX, MY]) {
    add(`verify ${m}`, call(DEP, CORE, 'set-verified-contract', [P(m)]), '(ok true)');
    add(`initialize ${m}`, call(DEP, m, 'initialize', [P(m), T.x, T.y, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), '(ok true)');
    read(`${m}: protected seats 10, distance slots 10`, m, '(list (protected-seats) (get-distance-slots))', '(list u10 u10)');
  }
  // MX: 38 fillers + O1 + O2 = 40 unseated X asks, all live, all fixed
  fx.forEach((p, i) => {
    fundB('x', p, FILL.x);
    add(`x filler ${i} ask mid*${(1.5 + i / 100).toFixed(2)}`, call(p, MX, 'deposit-token-x', depArgs('x', FILL.x, askOf(i))), `(ok u${FILL.x})`);
  });
  fundB('x', X.O1, U.x);
  add('x: O1 1000 sats ask mid*1.95 (live, outside top 10)', call(X.O1, MX, 'deposit-token-x', depArgs('x', U.x, ASK_O1)), `(ok u${U.x})`);
  fundB('x', X.O2, 1500);
  add('x: O2 1500 sats ask mid*1.96 (live, outside top 10)', call(X.O2, MX, 'deposit-token-x', depArgs('x', 1500, ASK_O2)), '(ok u1500)');
  read('x: list at 40', MX, `(len ${list('x')})`, 'u40');
  read('x: side full for a newcomer', MX, `(side-full-x ${list('x')} '${X.Noff})`, 'true');
  read('x: totals', MX, total('x'), `u${NFILL * FILL.x + U.x + 1500}`);
  // MY: 38 fillers + Q1 = 39 ... plus one more filler to 40
  fy.forEach((p) => {
    fundB('y', p, FILL.y);
    add('y filler bid mid/2', call(p, MY, 'deposit-token-y', depArgs('y', FILL.y, BID)), `(ok u${FILL.y})`);
  });
  const fy39 = mk(6100);
  fundB('y', fy39, FILL.y);
  add('y filler 39 bid mid/2', call(fy39, MY, 'deposit-token-y', depArgs('y', FILL.y, BID)), `(ok u${FILL.y})`);
  fundB('y', Y.Q1, U.y);
  add('y: Q1 1 STX (smallest)', call(Y.Q1, MY, 'deposit-token-y', depArgs('y', U.y, BID)), `(ok u${U.y})`);
  read('y: list at 40', MY, `(len ${list('y')})`, 'u40');
  read('y: side full for a newcomer', MY, `(side-full-y ${list('y')} '${Y.N})`, 'true');
  sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const setup = (await getSimulationResult(sid)).steps.filter((s) => s.Result?.Transaction || s.Result?.Eval);
  if (setup.length !== plan.length) throw new Error(`setup result count ${setup.length} != ${plan.length}`);
  plan.forEach((s, i) => check(s.label, decode(setup[i]), s.want));
  if (failures) return;

  // ---------- phase 2: pin fork time just before one signed Lazer update ----------
  let upd, at, uu;
  const tip0 = await getSimulationTip(sid);
  for (let i = 0; i < 30; i++) {
    const u = await fetchLazerUpdateAny();
    at = (await lazerFeedTimes(u.hex)).at;
    if (at - 2 > Number(tip0.block_time)) { upd = bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex')); uu = u; break; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!upd) throw new Error('no Lazer update newer than the fork tip');
  const px = (uu.px * 100_000_000n) / uu.py; // settle price (classification mid)
  console.log(`setup mid ${mid}, settle mid ${px}`);
  const stamp = at - 2;
  await submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: stamp - Number(tip0.burn_block_time) } }] });
  await ev('fork clock pinned 2s before the signed update', MX, 'stacks-block-time', `u${stamp}`);
  // shape of the price read by settle
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
    await ev('x: O1 parked 1000 (smallest outside top, edge path)', MX, `(get-token-x-parked '${X.O1})`, `u${U.x}`);
    await ev('x: O1 off the book', MX, dep('x', X.O1), 'u0');
    await ev('x: O1 off the list', MX, onList('x', X.O1), 'false');
    await ev('x: N_on on the book', MX, dep('x', X.Non), `u${amt}`);
    await ev('x: N_on on the list', MX, onList('x', X.Non), 'true');
    await ev('x: N_on live ask = mid*1.01', MX, `(token-x-limit-at '${X.Non} u${px})`, `u${(px * 10100n) / 10000n}`);
    await ev('x: O2 untouched', MX, dep('x', X.O2), 'u1500');
    await ev('x: list still 40', MX, `(len ${list('x')})`, 'u40');
    await ev('x: totals -O1 +N_on', MX, total('x'), `u${NFILL * FILL.x + 1500 + amt}`);
    await ev('x: market = book + parked', MX, `(is-eq ${bal('x', MX)} (+ ${total('x')} ${parkedSum('x', xAll)}))`, 'true');
  }

  // ---- the bug: switched-OFF pegged ask from a new maker, full X side ----
  const bug = mode === 'prefix';
  {
    const amt = 3 * U.x;
    const T0 = BigInt((await ev('x: totals before', MX, total('x'))).slice(1));
    const L0 = await ev('x: list before', MX, list('x'));
    await fund('x', X.Noff, amt);
    await tx('x: N_off submits pegged ask OFF (pending, side full)', X.Noff, MX, 'deposit-token-x', depArgs('x', amt, pct(30000), 100), `(ok u${amt})`);
    await ev('x: N_off wallet emptied', MX, bal('x', X.Noff), 'u0');
    const r = await tx('x: settle N_off', keeper, MX, 'settle-token-x-deposit', settleArgs('x', X.Noff, upd), `(ok u${amt})`);
    const pr = prints(r).join(' ');
    if (bug) {
      check('x: BUG: no refund, settle logs park-x of O2 + deposit-x of N_off', pr, (v) => !v.includes('pending-refund-x') && v.includes('park-x') && v.includes('deposit-x'));
      await ev('x: BUG: live O2 parked (1500)', MX, `(get-token-x-parked '${X.O2})`, 'u1500');
      await ev('x: BUG: O2 off the book', MX, dep('x', X.O2), 'u0');
      await ev('x: BUG: O2 off the list', MX, onList('x', X.O2), 'false');
      await ev('x: BUG: O2 ask was live (mid*1.96 < MAX)', MX, `(< (get limit (get-token-x-order '${X.O2})) u${MAX_UINT})`, 'true');
      await ev('x: BUG: switched-off N_off on the list', MX, onList('x', X.Noff), 'true');
      await ev('x: BUG: N_off on the book', MX, dep('x', X.Noff), `u${amt}`);
      await ev('x: BUG: N_off ask at settle mid = MAX_UINT (never fills)', MX, `(token-x-limit-at '${X.Noff} u${px})`, `u${MAX_UINT}`);
      await ev('x: BUG: N_off not refunded', MX, bal('x', X.Noff), 'u0');
      await ev('x: BUG: totals -1500 +3000', MX, total('x'), `u${T0 - 1500n + BigInt(amt)}`);
      await ev('x: list still 40', MX, `(len ${list('x')})`, 'u40');
    } else {
      check('x: refund reason queue-full, no park, no deposit', pr, (v) => v.includes('pending-refund-x') && v.includes('"queue-full"') && !v.includes('park-x') && !v.includes('deposit-x'));
      await ev('x: N_off got its sBTC back exactly', MX, bal('x', X.Noff), `u${amt}`);
      await ev('x: N_off pending cleared', MX, `(get-token-x-pending-deposit '${X.Noff})`, 'none');
      await ev('x: N_off off the list', MX, onList('x', X.Noff), 'false');
      await ev('x: N_off no deposit', MX, dep('x', X.Noff), 'u0');
      await ev('x: O2 not parked', MX, `(get-token-x-parked '${X.O2})`, 'u0');
      await ev('x: O2 still on the book', MX, dep('x', X.O2), 'u1500');
      await ev('x: list unchanged', MX, list('x'), L0);
      await ev('x: totals unchanged', MX, total('x'), `u${T0}`);
    }
    await ev('x: parked total', MX, parkedSum('x', xAll), `u${U.x + (bug ? 1500 : 0)}`);
    await ev('x: market balance = book + parked (solvent)', MX, `(is-eq ${bal('x', MX)} (+ ${total('x')} ${parkedSum('x', xAll)}))`, 'true');
    if (!bug) await ev('x: market balance = book + O1 parked', MX, bal('x', MX), `u${T0 + BigInt(U.x)}`);
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
    await ev('y: N got its STX back exactly', MY, bal('y', Y.N), `u${amt}`);
    await ev('y: N off the list', MY, onList('y', Y.N), 'false');
    await ev('y: Q1 not parked', MY, `(get-token-y-parked '${Y.Q1})`, 'u0');
    await ev('y: Q1 still on the book', MY, dep('y', Y.Q1), `u${U.y}`);
    await ev('y: list unchanged', MY, list('y'), L0);
    await ev('y: totals unchanged', MY, total('y'), `u${T0}`);
    await ev('y: market balance unchanged = book', MY, bal('y', MY), `u${B0}`);
    await ev('y: market balance = book', MY, `(is-eq ${bal('y', MY)} ${total('y')})`, 'true');
  }
}

const modes = process.argv.slice(2).length ? process.argv.slice(2) : ['prefix', 'patched'];
const summary = [];
for (const mode of modes) {
  if (!SOURCES[mode]) throw new Error(`unknown mode ${mode}`);
  try { await run(mode); } catch (e) { console.error(`${mode}: ${e.stack || e}`); failures++; }
  summary.push(`${mode}: ${passed}/${checks}${failures ? ` FAIL (${failed.slice(0, 6).join('; ')})` : ''} https://stxer.xyz/simulations/mainnet/${sid}`);
}
console.log('\n' + summary.join('\n'));
if (summary.some((s) => s.includes('FAIL'))) process.exitCode = 1;
