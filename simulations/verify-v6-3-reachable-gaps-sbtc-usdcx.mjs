// Port of verify-v6-3-reachable-gaps.js to the sBTC/USDCx v6-5 market.
// Fork only. Run: node simulations/verify-v6-3-reachable-gaps-sbtc-usdcx.mjs
// Every market is the exact markets-sbtc-usdcx-jing-v6-5 deploy bytes
// (faktory-dao template, SHA-256 checked) deployed as `gaps-*`, on the LIVE
// jing-core-v6 / jing-ladder-sbtc-usdcx-v1 (bound by relative name).
// Environment differences from the sBTC/STX suite (not logic):
//  - fork at tip; verify / initialize / ladder calls by the live owners
//    (initialize needs tx-sender = operator = core owner);
//  - the live ladder seats 10 band rungs per side: setup retires them all
//    (band-count 0) so max band 2 / 1 reproduces the suite's seat state;
//  - this ladder names the x-resting band "sel-band" and the y-resting band
//    "buy-band" (is-band-x / is-band-y), the reverse of jing-ladder-v1;
//  - token y = USDCx: 1 unit = 1 USDCx (the live min), x unit 1000 sats;
//    Lazer feeds [1,7]; section 3 taker G = 20 USDCx against X1 0.01 sBTC
//    (still y binding with an X1 remainder, checked on the model).
//
// 1. Stale-seat readmit append (settle-token-y-readmit / -x-readmit,
//    `(unwrap! (as-max-len? (append depositors who) u50) ERR_QUEUE_FULL)`).
//    State (as verify-v6-3-ghost-deposit.js builds it): 2 seated band rungs +
//    47 fillers + P -> 50; N1 bumps P (P parked); retire one band per side,
//    max-band 1, sync-seat from the OTHER side -> seats-per-side 1 but the
//    retired rung is still in seated-*. List at 50, side-full-* false for P.
//    P's readmit settle: not gone, not full, not crossing -> append on a
//    50-entry list -> (err u1010), whole tx rolled back: pending readmit,
//    parked amount, list, totals and balances exactly unchanged, no prints.
//    Then prune-seats drops the retired rung from seated-*: seated-on 1,
//    unseated 49 >= 50 - 1 -> side-full true -> the same pending readmit is
//    refused "queue-full" (ok u0), pending cleared, parked kept.
// 2. Read-only getters no suite calls, traced through gapsprobe-v1 public
//    functions: get-token-{x,y}-limit, get-seated-{x,y}, is-protected-{x,y},
//    get-token-{x,y}-pending-readmit, asserted against the market state.
// 3. Read-only getters the other suites only read through evals (not traced
//    by stxer), called inside transactions through gapsprobe-v2 on a fresh
//    `gaps-ms` market deployed after 1-2: get-distance-slots (changed from
//    the default u10), get-settlement (a cycle settled by a y swap against one
//    x maker, every field asserted against the settlement model; an
//    unsettled cycle -> none), get-token-{y,x}-pending-limit (a pending limit
//    on each side, both sides on the book; a non-submitter -> none).
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  noneCV, someCV, boolCV, deserializeCV, cvToString, getAddressFromPrivateKey,
  makeUnsignedContractDeploy, PostConditionMode, serializeCV, hexToCV,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, getSimulationTip, submitSimulationSteps,
  callContract, getNonce, setSender,
} from 'stxer';
import { installChunkedSubmit } from './_chunked-submit.js';
import {
  DEP, NODE, SBTC, USDCX, SBTC_WHALE, USDC_WHALE, CORE, LADDER, bytes, printHashes,
  fetchUsdcxUpdate, usdcxFeedTimes, midOf,
} from './_sbtc-usdcx-v6-5-common.mjs';

installChunkedSubmit(60);
const WHALE = { x: SBTC_WHALE, y: USDC_WHALE };
const P = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const T = { x: P(SBTC), y: P(USDCX) };
const A = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('usdcx-token') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const MY = `${DEP}.gaps-my`, MX = `${DEP}.gaps-mx`;
const MKT = { y: MY, x: MX };
const PROBE = `${DEP}.gapsprobe-v1`;
// Units per side: Y in uUSDCx, X in sats (live min deposits 1 USDCx / 1000 sats).
const U = { y: 1_000_000, x: 1000 };
// band sides on jing-ladder-sbtc-usdcx-v1: y rungs = buy-band, x rungs = sel-band
const BAND = { y: 'buy-band', x: 'sel-band' };
const FILL = { y: 2 * U.y, x: 2 * U.x };

const MARKET = bytes('market');
const RUNG = `
(define-public (initialize (side (string-ascii 8)) (price uint))
  (contract-call? .jing-ladder-sbtc-usdcx-v1 register side price u0))
(define-public (deposit-y (amount uint) (limit-price uint))
  (as-contract? ((with-ft '${USDCX} "usdcx-token" amount))
    (try! (contract-call? .gaps-my deposit-token-y amount limit-price none '${USDCX} "usdcx-token"))))
(define-public (deposit-x (amount uint) (limit-price uint))
  (as-contract? ((with-ft '${SBTC} "sbtc-token" amount))
    (try! (contract-call? .gaps-mx deposit-token-x amount limit-price none '${SBTC} "sbtc-token"))))
`;
// Probe: each public function calls one market getter and returns its value,
// so the getter runs inside a traced transaction.
const PROBE_SRC = `
(define-public (limit-y (who principal)) (ok (contract-call? .gaps-my get-token-y-limit who)))
(define-public (limit-x (who principal)) (ok (contract-call? .gaps-mx get-token-x-limit who)))
(define-public (seated-y) (ok (contract-call? .gaps-my get-seated-y)))
(define-public (seated-x) (ok (contract-call? .gaps-mx get-seated-x)))
(define-public (protected-y (who principal)) (ok (contract-call? .gaps-my is-protected-y who)))
(define-public (protected-x (who principal)) (ok (contract-call? .gaps-mx is-protected-x who)))
(define-public (readmit-y (who principal)) (ok (contract-call? .gaps-my get-token-y-pending-readmit who)))
(define-public (readmit-x (who principal)) (ok (contract-call? .gaps-mx get-token-x-pending-readmit who)))
`;

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
const isTransient = (e) => /failed to get block info|ECONNRESET|fetch failed|socket hang|\b(429|502|503|504|520|522|524)\b/i.test(String(e?.message ?? e));
async function retry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= 5 || !isTransient(e)) throw e;
      console.log(`  transient stxer error (${String(e.message ?? e).slice(0, 120)}), retry ${i + 1}`);
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
const fund = (side, who, amount) => tx(`fund ${who.slice(0, 8)} ${amount} ${side === 'y' ? 'uUSDCx' : 'sats'}`, WHALE[side], side === 'y' ? USDCX : SBTC, 'transfer', [uintCV(amount), P(WHALE[side]), P(who), noneCV()], '(ok true)');
async function liveRead(cid, fn, args = []) {
  const [a, n] = cid.split('.');
  const r = await retry(async () => (await fetch(`${NODE}/v2/contracts/call-read/${a}/${n}/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sender: DEP, arguments: args.map((x) => `0x${String(serializeCV(x)).replace(/^0x/, '')}`) }) })).json());
  if (!r.okay) throw new Error(`${cid} ${fn}: ${JSON.stringify(r).slice(0, 200)}`);
  return cvToString(hexToCV(r.result));
}
let CORE_OWNER, LADDER_OWNER;
function events(r) {
  return (r.receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e);
}
function prints(r) {
  return events(r).filter((e) => e.contract_event?.contract_identifier === CORE).map((e) => cv(e.contract_event.raw_value));
}
const bal = (side, p) => `(unwrap-panic (contract-call? '${side === 'y' ? USDCX : SBTC} get-balance '${p}))`;
const cyc = '(var-get current-cycle)';
const dep = (side, p) => `(get-token-${side}-deposit ${cyc} '${p})`;
const total = (side) => `(get total-token-${side} (get-cycle-totals ${cyc}))`;
const list = (side) => `(get-token-${side}-depositors ${cyc})`;
const onList = (side, p) => `(is-some (index-of? ${list(side)} '${p}))`;
const depArgs = (side, amount, limit) => [uintCV(amount), uintCV(limit), noneCV(), T[side], A[side]];
const settleArgs = (side, who, upd) => [P(who), upd, T[side], A[side]];

async function run() {
  printHashes();
  console.log(`market bytes ${Buffer.byteLength(MARKET)} (template, hash-checked)`);
  CORE_OWNER = await liveRead(CORE, 'get-contract-owner');
  LADDER_OWNER = await liveRead(LADDER, 'get-owner');
  const liveBands = {};
  for (const side of ['y', 'x']) {
    liveBands[side] = [];
    for (let p = 0; p <= 100; p++) if ((await liveRead(LADDER, 'get-rung', [stringAsciiCV(BAND[side]), uintCV(p)])) !== 'none') liveBands[side].push(p);
  }
  console.log(`core owner ${CORE_OWNER}, ladder owner ${LADDER_OWNER}, live bands buy ${liveBands.y} / sel ${liveBands.x}`);
  const u0 = await retry(fetchUsdcxUpdate);
  const mid = midOf(u0);
  console.log(`mid ${mid} ($${Number(mid) / 1e8} per BTC)`);
  const LIM = { y: mid / 2n, x: mid * 2n }; // never cross the mid
  const keeper = mk(4999);
  const base = { y: 5000, x: 6000 };
  const fillers = (side) => Array.from({ length: 47 }, (_, i) => mk(base[side] + i));
  const who = { y: { P: mk(7001), N1: mk(7002) }, x: { P: mk(7101), N1: mk(7102) } };

  // ---------- phase 1: builder setup ----------
  let b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  const plan = [];
  const add = (label, build, want) => { b = build(b); plan.push({ label, want }); };
  const call = (sender, cid, fn, args) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const deploy = (name, code) => add(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes('ERR'));
  const read = (label, cid, code, want) => add(label, (bb) => bb.addEvalCode(cid, code), want);
  const fundB2 = (side, p, amt) => add(`fund ${p.slice(0, 8)}`, call(WHALE[side], side === 'y' ? USDCX : SBTC, 'transfer', [uintCV(amt), P(WHALE[side]), P(p), noneCV()]), '(ok true)');
  deploy('gaps-my', MARKET);
  deploy('gaps-mx', MARKET);
  deploy('gapsprobe-v1', PROBE_SRC);
  const R = { a: 'gaps-rung-a', b: 'gaps-rung-b', c: 'gaps-rung-c', e: 'gaps-rung-e' };
  for (const n of Object.values(R)) deploy(n, RUNG);
  const rid = (k) => `${DEP}.${R[k]}`;
  // live ladder: retire every seated band so the suite's seat counts apply
  for (const side of ['y', 'x']) for (const p of liveBands[side]) add(`live ladder: retire ${BAND[side]} ${p}`, call(LADDER_OWNER, LADDER, 'retire-band', [stringAsciiCV(BAND[side]), uintCV(p)]), '(ok true)');
  for (const side of ['y', 'x']) read(`live ladder: ${BAND[side]} count 0`, LADDER, `(get-band-count "${BAND[side]}")`, 'u0');
  add('canonical buy-band (y rungs)', call(LADDER_OWNER, LADDER, 'set-canonical', [stringAsciiCV('buy-band'), P(rid('a'))]), '(ok true)');
  add('canonical sel-band (x rungs)', call(LADDER_OWNER, LADDER, 'set-canonical', [stringAsciiCV('sel-band'), P(rid('c'))]), '(ok true)');
  add('max band 2', call(LADDER_OWNER, LADDER, 'set-max-band-per-side', [uintCV(2)]), '(ok true)');
  for (const m of [MY, MX]) {
    add(`verify ${m}`, call(CORE_OWNER, CORE, 'set-verified-contract', [P(m)]), '(ok true)');
    add(`operator -> core owner ${m}`, call(DEP, m, 'set-operator', [P(CORE_OWNER)]), '(ok true)');
    add(`initialize ${m} (1000 sats / 1 USDCx, feeds 1/7)`, call(CORE_OWNER, m, 'initialize', [P(m), T.x, T.y, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(7)]), '(ok true)');
    add(`operator -> DEP ${m}`, call(CORE_OWNER, m, 'set-operator', [P(DEP)]), '(ok true)');
    add(`size queue ${m}`, call(DEP, m, 'set-distance-slots', [uintCV(0)]), '(ok true)');
  }
  for (const k of ['a', 'b']) fundB2('y', rid(k), FILL.y);
  for (const k of ['c', 'e']) fundB2('x', rid(k), FILL.x);
  const reg = { a: ['buy-band', 10], b: ['buy-band', 20], c: ['sel-band', 30], e: ['sel-band', 40] };
  for (const [k, [side, px]] of Object.entries(reg)) add(`rung ${k} registers ${side} ${px}`, call(DEP, rid(k), 'initialize', [stringAsciiCV(side), uintCV(px)]), '(ok true)');
  for (const k of ['a', 'b']) add(`rung ${k} deposits y`, call(DEP, rid(k), 'deposit-y', [uintCV(FILL.y), uintCV(LIM.y)]), `(ok u${FILL.y})`);
  for (const k of ['c', 'e']) add(`rung ${k} deposits x`, call(DEP, rid(k), 'deposit-x', [uintCV(FILL.x), uintCV(LIM.x)]), `(ok u${FILL.x})`);
  add('MY seats rung a', call(DEP, MY, 'sync-seat', [P(rid('a'))]), '(ok (tuple (seats u2) (x false) (y true)))');
  add('MY seats rung b', call(DEP, MY, 'sync-seat', [P(rid('b'))]), '(ok (tuple (seats u2) (x false) (y true)))');
  add('MX seats rung c', call(DEP, MX, 'sync-seat', [P(rid('c'))]), '(ok (tuple (seats u2) (x true) (y false)))');
  add('MX seats rung e', call(DEP, MX, 'sync-seat', [P(rid('e'))]), '(ok (tuple (seats u2) (x true) (y false)))');
  for (const side of ['y', 'x']) {
    const m = MKT[side];
    const fundB = (p, amt) => fundB2(side, p, amt);
    for (const p of fillers(side)) {
      fundB(p, FILL[side]);
      add(`${side}: filler direct deposit`, call(p, m, `deposit-token-${side}`, depArgs(side, FILL[side], LIM[side])), `(ok u${FILL[side]})`);
    }
    fundB(who[side].P, U[side]);
    add(`${side}: P deposits 1 unit (smallest)`, call(who[side].P, m, `deposit-token-${side}`, depArgs(side, U[side], LIM[side])), `(ok u${U[side]})`);
    read(`${side}: list at 50`, m, `(len ${list(side)})`, 'u50');
    read(`${side}: side genuinely full for a newcomer`, m, `(side-full-${side} ${list(side)} '${who[side].N1})`, 'true');
  }
  sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const setup = (await retry(() => getSimulationResult(sid))).steps.filter((s) => s.Result?.Transaction || s.Result?.Eval);
  if (setup.length !== plan.length) throw new Error(`setup result count ${setup.length} != ${plan.length}`);
  plan.forEach((s, i) => check(s.label, decode(setup[i]), s.want));
  if (failures) return;

  // ---------- phase 2: pin fork time just before one signed Lazer update ----------
  let upd, at, uUsed;
  const tip0 = await retry(() => getSimulationTip(sid));
  for (let i = 0; i < 30; i++) {
    const u = await retry(fetchUsdcxUpdate);
    at = (await retry(() => usdcxFeedTimes(u.hex))).at;
    if (at - 2 > Number(tip0.block_time)) { upd = bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex')); uUsed = u; break; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!upd) throw new Error('no Lazer update newer than the fork tip');
  const stamp = at - 2;
  await retry(() => submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: stamp - Number(tip0.burn_block_time) } }] }));
  await ev('fork clock pinned 2s before the signed update', MY, 'stacks-block-time', `u${stamp}`);

  // ---- getters, live state: limits of a live filler, seated / protected rungs ----
  const f0 = { y: fillers('y')[0], x: fillers('x')[0] };
  for (const side of ['y', 'x']) {
    const m = MKT[side];
    await ev(`${side}: filler limit (eval)`, m, `(get limit (get-token-${side}-order '${f0[side]}))`, `u${LIM[side]}`);
    await tx(`${side}: probe get-token-${side}-limit(filler) = live limit`, keeper, PROBE, `limit-${side}`, [P(f0[side])], `(ok u${LIM[side]})`);
    await tx(`${side}: probe get-token-${side}-limit(non-depositor) = default u0`, keeper, PROBE, `limit-${side}`, [P(keeper)], '(ok u0)');
  }
  await tx('y: probe get-seated-y = rungs a, b', keeper, PROBE, 'seated-y', [], `(ok (list ${rid('a')} ${rid('b')}))`);
  await tx('x: probe get-seated-x = rungs c, e', keeper, PROBE, 'seated-x', [], `(ok (list ${rid('c')} ${rid('e')}))`);
  await ev('y: seated-y (eval)', MY, '(var-get seated-y)', `(list ${rid('a')} ${rid('b')})`);
  await ev('x: seated-x (eval)', MX, '(var-get seated-x)', `(list ${rid('c')} ${rid('e')})`);
  await tx('y: probe is-protected-y(rung b) = true', keeper, PROBE, 'protected-y', [P(rid('b'))], '(ok true)');
  await tx('y: probe is-protected-y(filler) = false', keeper, PROBE, 'protected-y', [P(f0.y)], '(ok false)');
  await tx('x: probe is-protected-x(rung e) = true', keeper, PROBE, 'protected-x', [P(rid('e'))], '(ok true)');
  await tx('x: probe is-protected-x(filler) = false', keeper, PROBE, 'protected-x', [P(f0.x)], '(ok false)');

  // ---- N1 bumps P on the full side: P parked 1 unit ----
  for (const side of ['y', 'x']) {
    const m = MKT[side], { P: p, N1 } = who[side];
    await fund(side, N1, FILL[side]);
    await tx(`${side}: N1 submits on a full side (pending)`, N1, m, `deposit-token-${side}`, depArgs(side, FILL[side], LIM[side]), `(ok u${FILL[side]})`);
    const r = await tx(`${side}: settle N1 (full side)`, keeper, m, `settle-token-${side}-deposit`, settleArgs(side, N1, upd), `(ok u${FILL[side]})`);
    check(`${side}: settle logs park of P and deposit of N1`, prints(r).join(' '), (v) => v.includes(`park-${side}`) && v.includes(`deposit-${side}`));
    await ev(`${side}: P parked 1 unit`, m, `(get-token-${side}-parked '${p})`, `u${U[side]}`);
    await ev(`${side}: P off the list`, m, onList(side, p), 'false');
    await ev(`${side}: list still 50`, m, `(len ${list(side)})`, 'u50');
  }

  // ---- stale seats ----
  await tx('retire buy-band 10 (rung a, y)', LADDER_OWNER, LADDER, 'retire-band', [stringAsciiCV('buy-band'), uintCV(10)], '(ok true)');
  await tx('retire sel-band 30 (rung c, x)', LADDER_OWNER, LADDER, 'retire-band', [stringAsciiCV('sel-band'), uintCV(30)], '(ok true)');
  await tx('max band 1', LADDER_OWNER, LADDER, 'set-max-band-per-side', [uintCV(1)], '(ok true)');
  await tx('MY sync-seat rung e (x side) -> seats 1, seated-y not pruned', DEP, MY, 'sync-seat', [P(rid('e'))], '(ok (tuple (seats u1) (x true) (y false)))');
  await tx('MX sync-seat rung b (y side) -> seats 1, seated-x not pruned', DEP, MX, 'sync-seat', [P(rid('b'))], '(ok (tuple (seats u1) (x false) (y true)))');
  const stale = { y: rid('a'), x: rid('c') }, live = { y: rid('b'), x: rid('e') };
  for (const side of ['y', 'x']) {
    const m = MKT[side];
    await ev(`${side}: protected-seats 1`, m, '(protected-seats)', 'u1');
    await ev(`${side}: stale rung still seated`, m, `(var-get seated-${side})`, `(list ${stale[side]} ${live[side]})`);
    await tx(`${side}: probe is-protected-${side}(stale rung) = true`, keeper, PROBE, `protected-${side}`, [P(stale[side])], '(ok true)');
    await ev(`${side}: list at 50`, m, `(len ${list(side)})`, 'u50');
    await ev(`${side}: side-full-${side} false for P (stale-seat state)`, m, `(side-full-${side} ${list(side)} '${who[side].P})`, 'false');
  }

  // ---- 1: readmit append fails u1010 and rolls back whole ----
  for (const side of ['y', 'x']) {
    const m = MKT[side], p = who[side].P, u = U[side];
    await tx(`${side}: probe pending readmit(P) before submit = none`, keeper, PROBE, `readmit-${side}`, [P(p)], '(ok none)');
    let r = await tx(`${side}: readmit-token-${side}(P) submits`, p, m, `readmit-token-${side}`, [P(p)], `(ok u${u})`);
    check(`${side}: submit logs pending-readmit`, prints(r).join(' '), (v) => v.includes(`pending-readmit-${side}`));
    await tx(`${side}: probe get-token-${side}-pending-readmit(P) = (some stamp)`, keeper, PROBE, `readmit-${side}`, [P(p)], `(ok (some u${stamp}))`);
    await tx(`${side}: probe get-token-${side}-limit(P, parked) = kept limit`, keeper, PROBE, `limit-${side}`, [P(p)], `(ok u${LIM[side]})`);
    // pre-settle snapshot
    const snap = {};
    const keys = {
      pending: `(get-token-${side}-pending-readmit '${p})`,
      parked: `(get-token-${side}-parked '${p})`,
      live: dep(side, p),
      list: list(side),
      totals: `(get-cycle-totals ${cyc})`,
      market: bal(side, m),
      wallet: bal(side, p),
      keeper: bal(side, keeper),
      cycle: cyc,
    };
    for (const [k, code] of Object.entries(keys)) snap[k] = await ev(`${side}: snapshot ${k}`, m, code);
    check(`${side}: snapshot pending = (some stamp)`, snap.pending, `(some u${stamp})`);
    check(`${side}: snapshot parked = 1 unit`, snap.parked, `u${u}`);
    check(`${side}: snapshot list has 50 entries, P absent`, snap.list, (v) => (v.match(/ S[PM]/g) ?? []).length === 50 && !v.includes(p));
    r = await tx(`${side}: settle-token-${side}-readmit(P) -> ERR_QUEUE_FULL from the append`, keeper, m, `settle-token-${side}-readmit`, [P(p), upd], '(err u1010)');
    check(`${side}: rolled back tx emits no events`, events(r).length, 0);
    for (const [k, code] of Object.entries(keys)) await ev(`${side}: after u1010 ${k} unchanged`, m, code, snap[k]);
    await tx(`${side}: probe pending readmit(P) still (some stamp)`, keeper, PROBE, `readmit-${side}`, [P(p)], `(ok (some u${stamp}))`);

    // ---- prune-seats restores the normal path: side-full true -> queue-full ----
    await tx(`${side}: prune-seats -> seats 1`, keeper, m, 'prune-seats', [], '(ok u1)');
    await tx(`${side}: probe get-seated-${side} = live rung only`, keeper, PROBE, `seated-${side}`, [], `(ok (list ${live[side]}))`);
    await tx(`${side}: probe is-protected-${side}(stale rung) = false after prune`, keeper, PROBE, `protected-${side}`, [P(stale[side])], '(ok false)');
    await ev(`${side}: side-full-${side} true for P after prune`, m, `(side-full-${side} ${list(side)} '${p})`, 'true');
    r = await tx(`${side}: settle-token-${side}-readmit(P) after prune -> refused (ok u0)`, keeper, m, `settle-token-${side}-readmit`, [P(p), upd], '(ok u0)');
    check(`${side}: refusal print readmit / queue-full`, prints(r).join(' '), (v) => v.includes(`settle-refused-${side}`) && v.includes('"readmit"') && v.includes('"queue-full"'));
    await tx(`${side}: probe pending readmit(P) cleared`, keeper, PROBE, `readmit-${side}`, [P(p)], '(ok none)');
    await ev(`${side}: P still parked 1 unit`, m, keys.parked, `u${u}`);
    await ev(`${side}: P still off the book`, m, keys.live, 'u0');
    await ev(`${side}: list unchanged by the refusal`, m, keys.list, snap.list);
    await ev(`${side}: totals unchanged by the refusal`, m, keys.totals, snap.totals);
    await ev(`${side}: market balance unchanged`, m, keys.market, snap.market);
    await ev(`${side}: P wallet unchanged`, m, keys.wallet, snap.wallet);
    await ev(`${side}: solvent: market = book + P parked`, m, `(is-eq ${bal(side, m)} (+ ${total(side)} (get-token-${side}-parked '${p})))`, 'true');
  }

  await evalOnlyGetters(upd, uUsed, stamp, keeper);
}

// ---------- 3: getters the suites read only through evals ----------
const MS = `${DEP}.gaps-ms`;
const PROBE2 = `${DEP}.gapsprobe-v2`;
const PROBE2_SRC = `
(define-public (distance-slots-y) (ok (contract-call? .gaps-my get-distance-slots)))
(define-public (distance-slots-s) (ok (contract-call? .gaps-ms get-distance-slots)))
(define-public (settlement-s (cycle uint)) (ok (contract-call? .gaps-ms get-settlement cycle)))
(define-public (pending-limit-y (who principal)) (ok (contract-call? .gaps-ms get-token-y-pending-limit who)))
(define-public (pending-limit-x (who principal)) (ok (contract-call? .gaps-ms get-token-x-pending-limit who)))
`;
async function deployMid(name, code) {
  const raw = await makeUnsignedContractDeploy({ contractName: name, codeBody: code, clarityVersion: ClarityVersion.Clarity5, nonce: await retry(() => getNonce(sid, DEP)), network: 'mainnet', publicKey: '', fee: 0, postConditionMode: PostConditionMode.Allow });
  setSender(raw, DEP);
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] }));
  check(`deploy ${name}`, decode(out.steps[0]), ok);
}
async function evalOnlyGetters(upd, u, stamp, keeper) {
  const S = 10_000_000_000n, BPS = 10_000n, FEE = 10n, REBATE_BPS = 20n;
  const Pm = midOf(u); // the market's oracle price for this print
  const at = (k) => Pm * BigInt(k) / 1000n;
  const X1 = mk(7201), TK = mk(7202), Y2 = mk(7203), NOBODY = mk(7204);
  const X1AMT = 1_000_000n, G = 20_000_000n, Y2AMT = 2_000_000n;
  console.log(`section 3: oracle price ${Pm}`);

  // fresh gaps-ms market: exact template bytes, verified + initialized
  await deployMid('gaps-ms', MARKET);
  await deployMid('gapsprobe-v2', PROBE2_SRC);
  await tx('ms: verify in core', CORE_OWNER, CORE, 'set-verified-contract', [P(MS)], '(ok true)');
  await tx('ms: operator -> core owner', DEP, MS, 'set-operator', [P(CORE_OWNER)], '(ok true)');
  await tx('ms: initialize (1000 sats / 1 USDCx, feeds 1/7)', CORE_OWNER, MS, 'initialize', [P(MS), T.x, T.y, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(7)], '(ok true)');
  await tx('ms: operator -> DEP', CORE_OWNER, MS, 'set-operator', [P(DEP)], '(ok true)');

  // ---- get-distance-slots: gaps-my changed to u0 at setup; gaps-ms default u10 -> u7 ----
  await ev('my: distance-slots (eval)', MY, '(var-get distance-slots)', 'u0');
  await tx('my: probe get-distance-slots = u0 (changed from default u10)', keeper, PROBE2, 'distance-slots-y', [], '(ok u0)');
  await tx('ms: probe get-distance-slots = default u10', keeper, PROBE2, 'distance-slots-s', [], '(ok u10)');
  await tx('ms: set-distance-slots u7', DEP, MS, 'set-distance-slots', [uintCV(7)], '(ok true)');
  await tx('ms: probe get-distance-slots = u7', keeper, PROBE2, 'distance-slots-s', [], '(ok u7)');
  await ev('ms: distance-slots (eval)', MS, '(var-get distance-slots)', 'u7');

  // ---- get-settlement: y swap against one x maker settles cycle 0 ----
  await tx('ms: probe get-settlement(u0) before settle = none', keeper, PROBE2, 'settlement-s', [uintCV(0)], '(ok none)');
  await fund('x', X1, Number(X1AMT));
  await tx(`ms: X1 places ${X1AMT} sats @ 0.9 P`, X1, MS, 'deposit-token-x', depArgs('x', Number(X1AMT), at(900)), `(ok u${X1AMT})`);
  await ev('ms: X1 on the book', MS, dep('x', X1), `u${X1AMT}`);
  await fund('y', TK, Number(G));
  // model (settlement-edges.js phase a): age 0 -> 20 bps rebate; y binding
  const net = G * BPS / (BPS + REBATE_BPS), rebate = G - net;
  const Ty = net, Tx = X1AMT;
  const yvx = Tx * Pm / S, xb = yvx <= Ty;
  const yc = xb ? yvx : Ty, xc = xb ? Tx : Ty * S / Pm;
  const yfee = yc * FEE / BPS, xfee = xc * FEE / BPS;
  const rideY = Ty > 0n ? rebate * yc / Ty : 0n;
  const xAfter = xc - xfee;
  const xRoll = Tx - xc;
  check('ms: model is y binding with a remainder for X1 (no taker rest)', `${xb} ${yc === Ty} ${xRoll > 0n}`, 'false true true');
  const height = await ev('ms: block height before the swap', MS, 'stacks-block-height');
  const treasury = await ev('ms: treasury', MS, '(var-get treasury)');
  const tBefore = { y: await ev('ms: treasury USDCx before', MS, bal('y', treasury)), x: await ev('ms: treasury sBTC before', MS, bal('x', treasury)) };
  const r = await tx(`ms: T swaps ${G} uUSDCx @ 1.1 P, settles cycle 0`, TK, MS, 'swap',
    [uintCV(G), uintCV(at(1100)), upd, T.x, A.x, T.y, A.y, boolCV(false)],
    `(ok (tuple (rebate-refunded u${rebate - rideY}) (token-x-received u${xAfter}) (token-x-rolled u0) (token-y-received u0) (token-y-rolled u0)))`);
  check('ms: swap prints settlement and no refund', prints(r).join(' '), (v) => v.includes('"settlement"') && !v.includes('refund'));
  await ev('ms: cycle advanced to 1', MS, cyc, 'u1');
  const settlement = `(some (tuple (price u${Pm}) (settled-at ${height}) (token-x-cleared u${xc}) (token-x-fee u${xfee}) (token-y-cleared u${yc}) (token-y-fee u${yfee})))`;
  await tx('ms: probe get-settlement(u0) = the settled cycle, every field', keeper, PROBE2, 'settlement-s', [uintCV(0)], `(ok ${settlement})`);
  await ev('ms: settlements map (eval) agrees', MS, '(map-get? settlements u0)', settlement);
  await tx('ms: probe get-settlement(u1) (open cycle) = none', keeper, PROBE2, 'settlement-s', [uintCV(1)], '(ok none)');
  await ev('ms: treasury received the USDCx fee', MS, `(- ${bal('y', treasury)} ${tBefore.y})`, `u${yfee}`);
  await ev('ms: treasury received the sBTC fee', MS, `(- ${bal('x', treasury)} ${tBefore.x})`, `u${xfee}`);
  await ev('ms: X1 remainder rolled into cycle 1', MS, dep('x', X1), `u${xRoll}`);
  await ev('ms: cycle 1 totals', MS, `(get-cycle-totals ${cyc})`, `(tuple (total-token-x u${xRoll}) (total-token-y u0))`);

  // ---- get-token-{y,x}-pending-limit: both sides on the book, limits go pending ----
  await fund('y', Y2, Number(Y2AMT));
  await tx(`ms: Y2 submits ${Y2AMT} uUSDCx @ 0.5 P (x side non-empty -> pending)`, Y2, MS, 'deposit-token-y', depArgs('y', Number(Y2AMT), at(500)), `(ok u${Y2AMT})`);
  await tx('ms: settle Y2 deposit (bid below the ask, not crossing)', keeper, MS, 'settle-token-y-deposit', settleArgs('y', Y2, upd), `(ok u${Y2AMT})`);
  await ev('ms: Y2 on the book', MS, dep('y', Y2), `u${Y2AMT}`);
  await tx('ms: probe pending-limit-y(Y2) before submit = none', keeper, PROBE2, 'pending-limit-y', [P(Y2)], '(ok none)');
  await tx('ms: probe pending-limit-x(X1) before submit = none', keeper, PROBE2, 'pending-limit-x', [P(X1)], '(ok none)');
  await tx('ms: Y2 set-token-y-limit 0.6 P (x side non-empty -> pending)', Y2, MS, 'set-token-y-limit', [uintCV(at(600)), noneCV()], '(ok false)');
  await tx('ms: X1 set-token-x-limit 0.95 P spread 50 bps (y side non-empty -> pending)', X1, MS, 'set-token-x-limit', [uintCV(at(950)), someCV(uintCV(50))], '(ok false)');
  const now = await ev('ms: block time of the submits', MS, 'stacks-block-time');
  check('ms: clock still pinned', now, `u${stamp}`);
  await tx('ms: probe get-token-y-pending-limit(Y2) = submitted limit', keeper, PROBE2, 'pending-limit-y', [P(Y2)],
    `(ok (some (tuple (limit u${at(600)}) (spread-bps none) (submitted-at u${stamp}))))`);
  await tx('ms: probe get-token-x-pending-limit(X1) = submitted limit + spread', keeper, PROBE2, 'pending-limit-x', [P(X1)],
    `(ok (some (tuple (limit u${at(950)}) (spread-bps (some u50)) (submitted-at u${stamp}))))`);
  await tx('ms: probe get-token-y-pending-limit(non-submitter) = none', keeper, PROBE2, 'pending-limit-y', [P(NOBODY)], '(ok none)');
  await tx('ms: probe get-token-x-pending-limit(non-submitter) = none', keeper, PROBE2, 'pending-limit-x', [P(NOBODY)], '(ok none)');
  await ev('ms: stored limits unchanged while pending', MS, `(list (get limit (get-token-y-order '${Y2})) (get limit (get-token-x-order '${X1})))`, `(list u${at(500)} u${at(900)})`);
}

try { await run(); } catch (e) { console.error(e.stack || e); failures++; failed.push(`exception: ${String(e.message ?? e).slice(0, 120)}`); }
console.log(`\n${passed}/${checks} checks green${failures ? ` FAIL (${failed.slice(0, 6).join('; ')})` : ''}`);
if (sid) console.log(`https://stxer.xyz/simulations/mainnet/${sid}`);
if (failures) process.exitCode = 1;
