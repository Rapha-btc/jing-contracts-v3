// Fork only. Run: node simulations/verify-v6-3-ghost-deposit-stx-usdcx.mjs
// STX/USDCx port of verify-v6-3-ghost-deposit.js, `patched` mode only (the
// prefix / followAll modes deploy historical sBTC/STX bytes and have no
// STX/USDCx equivalent; v6-5 regression ran patched only as well).
//
// Market = contracts/stx-usdcx/markets-stx-usdcx-jing-v6-4.clar (whole-line
// comments stripped = the deploy bytes), deployed twice (ghost-my / ghost-mx)
// against the LIVE jing-core-v6 (owner CORE_OWNER: verify + initialize go
// through it) and a fresh jing-ladder-stx-usdcx-v1 (owner DEP).
// Token x = native STX, token y = USDCx; both 6 dp, mins 1 STX / 1 USDCx.
// Ladder sides by role: y-resting = "buy-band", x-resting = "sel-band"
// (sBTC/STX: y = sel-band, x = buy-band).
//
// Same sequence as the original, both sides (MY = Y/USDCx ghost, MX = X/STX ghost):
//   setup  2 band rungs seated per side, 47 x 2-unit makers + P (1 unit) -> 50
//   bump   N1 new maker on the full side: settle parks P (smallest), N1 placed
//   stale  retire one band per side, max-band 1, sync-seat of the other side
//          -> seats 1, stale seat still counted, list 50, side-full false
//   seed   one opposite-side order via submit+settle on a non-full side
//   ghost  V (fresh) and P (parked 1 unit) submit; settle refunds queue-full;
//          asserted correct (no ghost, parked kept, solvent)
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, noneCV, deserializeCV, cvToString, makeUnsignedSTXTokenTransfer,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, getSimulationTip, submitSimulationSteps,
  callContract, getNonce, setSender,
} from 'stxer';
import { installChunkedSubmit } from './_chunked-submit.js';
import { installRetrySubmit } from './_retry-submit.js';
import {
  NODE, DEP, CORE, CORE_OWNER, WSTX, USDCX, USDCX_ASSET, STX_WHALES, USDCX_WHALES, N, P_ as P, traits as T, assets as A,
  mk, balanceExpr, src, lazer, lazerTimes, midOf, MIN,
} from './_stx-usdcx-v6-common.mjs';

installChunkedSubmit(60);
installRetrySubmit();
const LADDER = `${DEP}.${N.ladder}`;
const WHALE = { x: STX_WHALES[0], y: USDCX_WHALES[0] };
const MY = `${DEP}.ghost-my`, MX = `${DEP}.ghost-mx`;
const MKT = { y: MY, x: MX };
// Units per side = the market min: 1 USDCx (y) / 1 STX (x), both 6 dp.
const U = { y: Number(MIN.y), x: Number(MIN.x) };
const FILL = { y: 2 * U.y, x: 2 * U.x };

const SOURCES = { patched: () => src(N.market) };
// Minimal band rung (after ARION's f1-rung): registers itself with the ladder
// and pushes its own balance to the market through as-contract?, so the
// market records the rung contract as the depositor. One source for every
// rung -> one code hash -> the canonical-hash gate accepts all of them.
// y = USDCx (with-ft), x = native STX (with-stx).
const RUNG = `
(define-public (initialize (side (string-ascii 8)) (price uint))
  (contract-call? .${N.ladder} register side price u0))
(define-public (deposit-y (amount uint) (limit-price uint))
  (as-contract? ((with-ft '${USDCX} "${USDCX_ASSET}" amount))
    (try! (contract-call? .ghost-my deposit-token-y amount limit-price none '${USDCX} "${USDCX_ASSET}"))))
(define-public (deposit-x (amount uint) (limit-price uint))
  (as-contract? ((with-stx amount))
    (try! (contract-call? .ghost-mx deposit-token-x amount limit-price none '${WSTX} "wstx"))))
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
const depArgs = (side, amount, limit) => [uintCV(amount), uintCV(limit), noneCV(), T[side], A[side]];
const settleArgs = (side, who, upd) => [P(who), upd, T[side], A[side]];
const other = (s) => (s === 'x' ? 'y' : 'x');

async function run(mode) {
  passed = checks = failures = 0; failed.length = 0;
  console.log(`\n===== mode ${mode} =====`);
  const market = SOURCES[mode]();
  console.log(`market source ${market.length} bytes`);
  const u0 = await lazer();
  const mid = midOf(u0);
  console.log(`setup mid ${mid} ($${Number(mid) / 1e8} USDCx/STX)`);
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
  read('live core owner = CORE_OWNER', CORE, '(get-contract-owner)', CORE_OWNER);
  deploy(N.ladder, src(N.ladder));
  deploy('ghost-my', market);
  deploy('ghost-mx', market);
  const R = { a: 'ghost-rung-a', b: 'ghost-rung-b', c: 'ghost-rung-c', e: 'ghost-rung-e' };
  for (const n of Object.values(R)) deploy(n, RUNG);
  const rid = (k) => `${DEP}.${R[k]}`;
  // y-resting rungs a/b on buy-band, x-resting c/e on sel-band (by role)
  add('canonical buy-band (y)', call(DEP, LADDER, 'set-canonical', [stringAsciiCV('buy-band'), P(rid('a'))]), '(ok true)');
  add('canonical sel-band (x)', call(DEP, LADDER, 'set-canonical', [stringAsciiCV('sel-band'), P(rid('c'))]), '(ok true)');
  add('max band 2', call(DEP, LADDER, 'set-max-band-per-side', [uintCV(2)]), '(ok true)');
  for (const m of [MY, MX]) {
    add(`${m}: set-operator -> core owner`, call(DEP, m, 'set-operator', [P(CORE_OWNER)]), '(ok true)');
    add(`verify ${m} (core owner)`, call(CORE_OWNER, CORE, 'set-verified-contract', [P(m)]), '(ok true)');
    add(`initialize ${m} (core owner)`, call(CORE_OWNER, m, 'initialize', [P(m), P(WSTX), P(USDCX), uintCV(MIN.x), uintCV(MIN.y), uintCV(45), uintCV(7)]), '(ok true)');
    add(`${m}: set-operator -> DEP`, call(CORE_OWNER, m, 'set-operator', [P(DEP)]), '(ok true)');
    add(`size queue ${m}`, call(DEP, m, 'set-distance-slots', [uintCV(0)]), '(ok true)');
  }
  for (const k of ['a', 'b']) add(`fund rung ${k} USDCx`, call(WHALE.y, USDCX, 'transfer', [uintCV(FILL.y), P(WHALE.y), P(rid(k)), noneCV()]), '(ok true)');
  for (const k of ['c', 'e']) add(`fund rung ${k} STX`, (bb) => bb.withSender(WHALE.x).addSTXTransfer({ recipient: rid(k), amount: FILL.x }), ok);
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
    const fundB = (p, amt) => side === 'x'
      ? add(`fund ${p.slice(0, 8)}`, (bb) => bb.withSender(WHALE.x).addSTXTransfer({ recipient: p, amount: amt }), ok)
      : add(`fund ${p.slice(0, 8)}`, call(WHALE.y, USDCX, 'transfer', [uintCV(amt), P(WHALE.y), P(p), noneCV()]), '(ok true)');
    for (const p of fillers(side)) {
      fundB(p, FILL[side]);
      add(`${side}: filler direct deposit`, call(p, m, `deposit-token-${side}`, depArgs(side, FILL[side], LIM[side])), `(ok u${FILL[side]})`);
    }
    fundB(who[side].P, U[side]);
    add(`${side}: P deposits 1 unit (smallest, 48th unseated)`, call(who[side].P, m, `deposit-token-${side}`, depArgs(side, U[side], LIM[side])), `(ok u${U[side]})`);
    read(`${side}: list at 50`, m, `(len ${list(side)})`, 'u50');
    read(`${side}: side genuinely full for a newcomer`, m, `(side-full-${side} ${list(side)} '${who[side].N1})`, 'true');
    read(`${side}: totals = 2 rungs + 47 fillers + P`, m, total(side), `u${2 * FILL[side] + 47 * FILL[side] + U[side]}`);
  }
  sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const setup = (await getSimulationResult(sid)).steps.filter((s) => s.Result?.Transaction || s.Result?.Eval);
  if (setup.length !== plan.length) throw new Error(`setup result count ${setup.length} != ${plan.length}`);
  plan.forEach((s, i) => check(s.label, decode(setup[i]), s.want));
  if (failures) return;

  // ---------- phase 2: pin fork time just before one signed [45,7] Lazer update ----------
  let upd, at;
  const tip0 = await getSimulationTip(sid);
  for (let i = 0; i < 30; i++) {
    const u = await lazer();
    at = (await lazerTimes(u.hex)).at;
    if (at - 2 > Number(tip0.block_time)) { upd = bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex')); break; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!upd) throw new Error('no Lazer update newer than the fork tip');
  const stamp = at - 2;
  await submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: stamp - Number(tip0.burn_block_time) } }] });
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
  await tx('retire buy-band 10 (rung a, y side)', DEP, LADDER, 'retire-band', [stringAsciiCV('buy-band'), uintCV(10)], '(ok true)');
  await tx('retire sel-band 30 (rung c, x side)', DEP, LADDER, 'retire-band', [stringAsciiCV('sel-band'), uintCV(30)], '(ok true)');
  await tx('max band 1', DEP, LADDER, 'set-max-band-per-side', [uintCV(1)], '(ok true)');
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

  // ---- the attack, both sides (patched: asserted correct) ----
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

const summary = [];
for (const mode of ['patched']) {
  try { await run(mode); } catch (e) { console.error(`${mode}: ${e.stack || e}`); failures++; }
  summary.push(`${mode}: ${passed}/${checks}${failures ? ` FAIL (${failed.slice(0, 6).join('; ')})` : ''} https://stxer.xyz/simulations/mainnet/${sid}`);
}
console.log('\n' + summary.join('\n'));
if (summary.some((s) => s.includes('FAIL'))) process.exitCode = 1;
