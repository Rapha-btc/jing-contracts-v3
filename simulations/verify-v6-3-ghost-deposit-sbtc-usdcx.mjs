// Port of verify-v6-3-ghost-deposit.js (patched mode) to the sBTC/USDCx v6-5
// market. Fork only. Run: node simulations/verify-v6-3-ghost-deposit-sbtc-usdcx.mjs
//
// AIBTC bounty muerdzoc805a745ecc99 (Eternal Harp / ARION, HIGH): the
// non-full branch of deposit-token-{x,y}-core used to write deposits, limits
// and cycle-totals BEFORE the fallible append -> ERR_QUEUE_FULL; a settle that
// caught u1010 left a ghost deposit that cancel paid again. Reach: stale seated
// entries keep the list at 50 while side-full returns false.
//
// Same sequence as the sBTC/STX suite, both sides (MY = Y/USDCx, MX = X/sBTC):
//   setup  2 band rungs seated per side, 47 x 2-unit makers + P (1 unit) -> 50
//   bump   N1 on the full side: settle parks P (smallest), N1 placed
//   stale  retire one band per side, max-band 1, sync-seat of the other side
//          -> seats 1, stale seat still counted, list 50, side-full false
//   seed   one opposite-side order via submit+settle on a non-full side
//   ghost  V (fresh) and P (parked 1 unit) submit; settle refunds queue-full;
//          asserted correct (no ghost, parked kept, solvent)
// Only the patched proof runs: ghost-my / ghost-mx are the exact
// markets-sbtc-usdcx-jing-v6-5 deploy bytes (faktory-dao template, SHA-256
// checked) under fresh names. The prefix / followAll modes rebuild historical
// sBTC/STX markets that have no sBTC/USDCx counterpart.
// Differences from the sBTC/STX suite (environment, not logic):
//  - fork at tip on the LIVE jing-core-v6 / jing-ladder-sbtc-usdcx-v1 (the
//    markets bind them by relative name); verify, initialize and ladder calls
//    by the live owners. initialize needs tx-sender = operator = core owner.
//  - the live ladder seats 10 band rungs per side: setup retires them all
//    (band-count 0) so max band 2 / 1 reproduces the suite's seat state.
//  - this ladder names the x-resting band "sel-band" and the y-resting band
//    "buy-band" (is-band-x / is-band-y), the reverse of jing-ladder-v1.
//  - token y = USDCx: 1 unit = 1 USDCx (the live min), x unit 1000 sats;
//    Lazer feeds [1,7].
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  noneCV, deserializeCV, cvToString, getAddressFromPrivateKey, serializeCV, hexToCV,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, getSimulationTip, submitSimulationSteps, callContract,
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
const MY = `${DEP}.ghost-my`, MX = `${DEP}.ghost-mx`;
const MKT = { y: MY, x: MX };
// Units per side: Y in uUSDCx, X in sats (live min deposits 1 USDCx / 1000 sats).
const U = { y: 1_000_000, x: 1000 };
const FILL = { y: 2 * U.y, x: 2 * U.x };
// band sides on jing-ladder-sbtc-usdcx-v1: y rungs = buy-band, x rungs = sel-band
const BAND = { y: 'buy-band', x: 'sel-band' };

// Minimal band rung (after ARION's f1-rung): registers itself with the ladder
// and pushes its own balance to the market through as-contract?, so the
// market records the rung contract as the depositor. One source for every
// rung -> one code hash -> the canonical-hash gate accepts all of them.
const RUNG = `
(define-public (initialize (side (string-ascii 8)) (price uint))
  (contract-call? .jing-ladder-sbtc-usdcx-v1 register side price u0))
(define-public (deposit-y (amount uint) (limit-price uint))
  (as-contract? ((with-ft '${USDCX} "usdcx-token" amount))
    (try! (contract-call? .ghost-my deposit-token-y amount limit-price none '${USDCX} "usdcx-token"))))
(define-public (deposit-x (amount uint) (limit-price uint))
  (as-contract? ((with-ft '${SBTC} "sbtc-token" amount))
    (try! (contract-call? .ghost-mx deposit-token-x amount limit-price none '${SBTC} "sbtc-token"))))
`;

const cv = (hex) => cvToString(deserializeCV(hex));
const decode = (step) => {
  const r = step?.Result ?? step;
  if (r?.Eval) return 'Ok' in r.Eval ? cv(r.Eval.Ok) : `EVAL-ERR ${JSON.stringify(r.Eval.Err).slice(0, 200)}`;
  if (r?.Transaction?.Ok) { const t = r.Transaction.Ok; if (t.vm_error || t.post_condition_aborted) return `ENGINE-ERR ${JSON.stringify(t).slice(0, 300)}`; return cv(t.result); }
  return `ENGINE-ERR ${JSON.stringify(r).slice(0, 300)}`;
};
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
const fund = (side, who, amount) => side === 'y'
  ? tx(`fund ${who.slice(0, 8)} ${amount} uUSDCx`, WHALE.y, USDCX, 'transfer', [uintCV(amount), P(WHALE.y), P(who), noneCV()], '(ok true)')
  : tx(`fund ${who.slice(0, 8)} ${amount} sats`, WHALE.x, SBTC, 'transfer', [uintCV(amount), P(WHALE.x), P(who), noneCV()], '(ok true)');
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
const depArgs = (side, amount, limit) => [uintCV(amount), uintCV(limit), noneCV(), T[side], A[side]];
const settleArgs = (side, who, upd) => [P(who), upd, T[side], A[side]];
const other = (s) => (s === 'x' ? 'y' : 'x');
async function liveRead(cid, fn, args = []) {
  const [a, n] = cid.split('.');
  const r = await retry(async () => (await fetch(`${NODE}/v2/contracts/call-read/${a}/${n}/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sender: DEP, arguments: args.map((x) => `0x${String(serializeCV(x)).replace(/^0x/, '')}`) }) })).json());
  if (!r.okay) throw new Error(`${cid} ${fn}: ${JSON.stringify(r).slice(0, 200)}`);
  return cvToString(hexToCV(r.result));
}

async function run() {
  printHashes();
  const market = bytes('market');
  console.log(`market bytes ${Buffer.byteLength(market)} (template, hash-checked)`);
  const CORE_OWNER = await liveRead(CORE, 'get-contract-owner');
  const LADDER_OWNER = await liveRead(LADDER, 'get-owner');
  const live = {};
  for (const side of ['y', 'x']) {
    live[side] = [];
    for (let p = 0; p <= 100; p++) if ((await liveRead(LADDER, 'get-rung', [stringAsciiCV(BAND[side]), uintCV(p)])) !== 'none') live[side].push(p);
  }
  console.log(`core owner ${CORE_OWNER}, ladder owner ${LADDER_OWNER}, live bands buy ${live.y} / sel ${live.x}`);
  const u0 = await retry(fetchUsdcxUpdate);
  const mid = midOf(u0);
  console.log(`mid ${mid} ($${Number(mid) / 1e8} per BTC)`);
  const LIM = { y: mid / 2n, x: mid * 2n }; // never cross the mid
  const keeper = mk(4999);
  const base = { y: 5000, x: 6000 };
  const fillers = (side) => Array.from({ length: 47 }, (_, i) => mk(base[side] + i));
  const who = { // P gets parked by N1, V is fresh, S seeds the opposite side
    y: { P: mk(7001), N1: mk(7002), V: mk(7003), S: mk(7004) },
    x: { P: mk(7101), N1: mk(7102), V: mk(7103), S: mk(7104) },
  };

  // ---------- phase 1: builder setup (no Lazer needed) ----------
  let b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  const plan = [];
  const add = (label, build, want) => { b = build(b); plan.push({ label, want }); };
  const call = (sender, cid, fn, args) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const deploy = (name, code) => add(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes('ERR'));
  const read = (label, cid, code, want) => add(label, (bb) => bb.addEvalCode(cid, code), want);
  const fundB = (side, p, amt) => add(`fund ${p.slice(0, 8)}`, call(WHALE[side], side === 'y' ? USDCX : SBTC, 'transfer', [uintCV(amt), P(WHALE[side]), P(p), noneCV()]), '(ok true)');
  deploy('ghost-my', market);
  deploy('ghost-mx', market);
  const R = { a: 'ghost-rung-a', b: 'ghost-rung-b', c: 'ghost-rung-c', e: 'ghost-rung-e' };
  for (const n of Object.values(R)) deploy(n, RUNG);
  const rid = (k) => `${DEP}.${R[k]}`;
  // live ladder: retire every seated band so the suite's seat counts apply
  for (const side of ['y', 'x']) for (const p of live[side]) add(`live ladder: retire ${BAND[side]} ${p}`, call(LADDER_OWNER, LADDER, 'retire-band', [stringAsciiCV(BAND[side]), uintCV(p)]), '(ok true)');
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
  for (const k of ['a', 'b']) fundB('y', rid(k), FILL.y);
  for (const k of ['c', 'e']) fundB('x', rid(k), FILL.x);
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
    for (const p of fillers(side)) {
      fundB(side, p, FILL[side]);
      add(`${side}: filler direct deposit`, call(p, m, `deposit-token-${side}`, depArgs(side, FILL[side], LIM[side])), `(ok u${FILL[side]})`);
    }
    fundB(side, who[side].P, U[side]);
    add(`${side}: P deposits 1 unit (smallest, 48th unseated)`, call(who[side].P, m, `deposit-token-${side}`, depArgs(side, U[side], LIM[side])), `(ok u${U[side]})`);
    read(`${side}: list at 50`, m, `(len ${list(side)})`, 'u50');
    read(`${side}: side genuinely full for a newcomer`, m, `(side-full-${side} ${list(side)} '${who[side].N1})`, 'true');
    read(`${side}: totals = 2 rungs + 47 fillers + P`, m, total(side), `u${2 * FILL[side] + 47 * FILL[side] + U[side]}`);
  }
  sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const setup = (await retry(() => getSimulationResult(sid))).steps.filter((s) => s.Result?.Transaction || s.Result?.Eval);
  if (setup.length !== plan.length) throw new Error(`setup result count ${setup.length} != ${plan.length}`);
  plan.forEach((s, i) => check(s.label, decode(setup[i]), s.want));
  if (failures) return;

  // ---------- phase 2: pin fork time just before one signed Lazer update ----------
  let upd, at;
  const tip0 = await retry(() => getSimulationTip(sid));
  for (let i = 0; i < 30; i++) {
    const u = await retry(fetchUsdcxUpdate);
    at = (await retry(() => usdcxFeedTimes(u.hex))).at;
    if (at - 2 > Number(tip0.block_time)) { upd = bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex')); break; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!upd) throw new Error('no Lazer update newer than the fork tip');
  const stamp = at - 2;
  await retry(() => submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: stamp - Number(tip0.burn_block_time) } }] }));
  await ev('fork clock pinned 2s before the signed update', MY, 'stacks-block-time', `u${stamp}`);

  // ---- regression: full-side newcomer settle bumps the smallest (P) ----
  for (const side of ['y', 'x']) {
    const m = MKT[side], { P: p, N1 } = who[side];
    await fund(side, N1, FILL[side]);
    await tx(`${side}: N1 submits on a full side (pending)`, N1, m, `deposit-token-${side}`, depArgs(side, FILL[side], LIM[side]), `(ok u${FILL[side]})`);
    const r = await tx(`${side}: settle N1 (full side)`, keeper, m, `settle-token-${side}-deposit`, settleArgs(side, N1, upd), `(ok u${FILL[side]})`);
    check(`${side}: settle logs park of P and deposit of N1`, prints(r).join(' '), (v) => v.includes(`park-${side}`) && v.includes(`deposit-${side}`));
    await ev(`${side}: P parked 1 unit`, m, `(get-token-${side}-parked '${p})`, `u${U[side]}`);
    await ev(`${side}: P off the book`, m, dep(side, p), 'u0');
    await ev(`${side}: P off the list`, m, onList(side, p), 'false');
    await ev(`${side}: N1 on the book`, m, dep(side, N1), `u${FILL[side]}`);
    await ev(`${side}: N1 on the list`, m, onList(side, N1), 'true');
    await ev(`${side}: list still 50`, m, `(len ${list(side)})`, 'u50');
    await ev(`${side}: totals = 50 x 2 units (P out, N1 in)`, m, total(side), `u${50 * FILL[side]}`);
    await ev(`${side}: market holds book + parked`, m, bal(side, m), `u${50 * FILL[side] + U[side]}`);
  }

  // ---- stale seats: retire a band per side, lower seats via the OTHER side ----
  await tx('retire buy-band 10 (rung a, y)', LADDER_OWNER, LADDER, 'retire-band', [stringAsciiCV('buy-band'), uintCV(10)], '(ok true)');
  await tx('retire sel-band 30 (rung c, x)', LADDER_OWNER, LADDER, 'retire-band', [stringAsciiCV('sel-band'), uintCV(30)], '(ok true)');
  await tx('max band 1', LADDER_OWNER, LADDER, 'set-max-band-per-side', [uintCV(1)], '(ok true)');
  await tx('MY sync-seat rung e (x side) -> seats 1, seated-y not pruned', DEP, MY, 'sync-seat', [P(rid('e'))], '(ok (tuple (seats u1) (x true) (y false)))');
  await tx('MX sync-seat rung b (y side) -> seats 1, seated-x not pruned', DEP, MX, 'sync-seat', [P(rid('b'))], '(ok (tuple (seats u1) (x false) (y true)))');
  for (const side of ['y', 'x']) {
    const m = MKT[side], stale = side === 'y' ? rid('a') : rid('c');
    await ev(`${side}: stale seat still in seated-${side}`, m, `(is-some (index-of? (get-seated-${side}) '${stale}))`, 'true');
    await ev(`${side}: list at 50`, m, `(len ${list(side)})`, 'u50');
    await ev(`${side}: side-full-${side} false for a newcomer (the reach)`, m, `(side-full-${side} ${list(side)} '${who[side].V})`, 'false');
  }

  // ---- regression: normal settle on a non-full side places the order ----
  for (const side of ['y', 'x']) {
    const o = other(side), m = MKT[side], s = who[side].S, amt = side === 'y' ? 10 * U.x : 2 * U.y;
    await fund(o, s, amt);
    await tx(`${side}-market: seed ${o} submits (pending, opposite book non-empty)`, s, m, `deposit-token-${o}`, depArgs(o, amt, LIM[o]), `(ok u${amt})`);
    await ev(`${side}-market: seed pending`, m, `(is-some (get-token-${o}-pending-deposit '${s}))`, 'true');
    await tx(`${side}-market: settle seed on non-full ${o} side`, keeper, m, `settle-token-${o}-deposit`, settleArgs(o, s, upd), `(ok u${amt})`);
    await ev(`${side}-market: seed pending cleared`, m, `(get-token-${o}-pending-deposit '${s})`, 'none');
    await ev(`${side}-market: seed on the book`, m, dep(o, s), `u${amt}`);
    await ev(`${side}-market: seed on the list`, m, onList(o, s), 'true');
    await ev(`${side}-market: seed limit stored`, m, `(get limit (get-token-${o}-order '${s}))`, `u${LIM[o]}`);
    await ev(`${side}-market: ${o} totals = seed`, m, total(o), `u${amt}`);
    await ev(`${side}-market: seed wallet emptied`, m, bal(o, s), 'u0');
  }

  // ---- the attack, both sides (patched: no ghost) ----
  for (const side of ['y', 'x']) {
    const m = MKT[side], { P: p, V: v } = who[side], u = U[side];
    const T0 = await ev(`${side}: totals before`, m, total(side));
    const B0 = await ev(`${side}: market balance before`, m, bal(side, m));
    const t0 = BigInt(T0.slice(1)), b0 = BigInt(B0.slice(1));
    await fund(side, v, 5 * u);
    await tx(`${side}: V submits 5 units (pending)`, v, m, `deposit-token-${side}`, depArgs(side, 5 * u, LIM[side]), `(ok u${5 * u})`);
    let r = await tx(`${side}: settle V refunds`, keeper, m, `settle-token-${side}-deposit`, settleArgs(side, v, upd), `(ok u${5 * u})`);
    check(`${side}: refund reason queue-full`, prints(r).join(' '), (x) => x.includes(`pending-refund-${side}`) && x.includes('"queue-full"'));
    await ev(`${side}: V pending cleared`, m, `(get-token-${side}-pending-deposit '${v})`, 'none');
    await ev(`${side}: V refunded to wallet`, m, bal(side, v), `u${5 * u}`);
    await ev(`${side}: V off the list`, m, onList(side, v), 'false');
    await ev(`${side}: V deposit record none`, m, dep(side, v), 'u0');
    await ev(`${side}: V limit record none`, m, `(is-some (map-get? token-${side}-deposit-limits '${v}))`, 'false');
    await ev(`${side}: totals unchanged`, m, total(side), `u${t0}`);
    await ev(`${side}: market balance back to before`, m, bal(side, m), `u${b0}`);
    await fund(side, p, 3 * u);
    await tx(`${side}: P (parked 1) submits 3 units (pending)`, p, m, `deposit-token-${side}`, depArgs(side, 3 * u, LIM[side]), `(ok u${3 * u})`);
    r = await tx(`${side}: settle P refunds`, keeper, m, `settle-token-${side}-deposit`, settleArgs(side, p, upd), `(ok u${3 * u})`);
    check(`${side}: P refund reason queue-full`, prints(r).join(' '), (x) => x.includes('"queue-full"'));
    await ev(`${side}: P refunded 3 units`, m, bal(side, p), `u${3 * u}`);
    await ev(`${side}: P parked kept at 1 unit`, m, `(get-token-${side}-parked '${p})`, `u${u}`);
    await ev(`${side}: P deposit record none`, m, dep(side, p), 'u0');
    await ev(`${side}: P off the list`, m, onList(side, p), 'false');
    await ev(`${side}: totals unchanged`, m, total(side), `u${t0}`);
    await ev(`${side}: solvent: market = book + P parked`, m, `(is-eq ${bal(side, m)} (+ ${total(side)} (get-token-${side}-parked '${p})))`, 'true');
    await tx(`${side}: V cancel has nothing`, v, m, `cancel-token-${side}-deposit`, [T[side], A[side]], '(err u1005)');
    await tx(`${side}: P cancel pays parked 1`, p, m, `cancel-token-${side}-deposit`, [T[side], A[side]], `(ok u${u})`);
    await ev(`${side}: V net = funded 5 units`, m, bal(side, v), `u${5 * u}`);
    await ev(`${side}: P net = funded 1 + 3 units`, m, bal(side, p), `u${4 * u}`);
    await ev(`${side}: totals back to before`, m, total(side), `u${t0}`);
    await ev(`${side}: market balance = book (solvent)`, m, `(- (to-int ${bal(side, m)}) (to-int ${total(side)}))`, '0');
    await ev(`${side}: no stray pending/parked`, m, `(list (get-token-${side}-pending-deposit '${v}) (get-token-${side}-pending-deposit '${p}))`, '(list none none)');
  }
}

try { await run(); } catch (e) { console.error(e.stack || e); failures++; failed.push(`exception: ${String(e.message ?? e).slice(0, 160)}`); }
console.log(`\npatched: ${passed}/${checks}${failures ? ` FAIL (${failed.slice(0, 6).join('; ')})` : ''} https://stxer.xyz/simulations/mainnet/${sid}`);
if (failures) process.exitCode = 1;
