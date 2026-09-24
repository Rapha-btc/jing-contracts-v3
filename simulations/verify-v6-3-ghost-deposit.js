// Fork only. Run: node simulations/verify-v6-3-ghost-deposit.js [prefix] [patched] [followAll]
// (no args = prefix patched). Each mode is its own stxer mainnet fork.
//
// AIBTC bounty muerdzoc805a745ecc99 (Eternal Harp / ARION, HIGH): at 24f3e23
// the non-full branch of deposit-token-{x,y}-core wrote deposits, limits and
// cycle-totals BEFORE the fallible (append depositors who) -> ERR_QUEUE_FULL.
// settle-token-{x,y}-deposit catches u1010 and refunds the pending amount;
// Clarity keeps a private function's writes when the caller catches its err,
// so a ghost deposit stayed (off the list) and cancel paid it a second time.
// Reach: side-full-* counts unseated vs (50 - protected-seats). Stale seated
// entries (sync-seat of the OTHER side lowers seats-per-side without pruning
// this side) keep the list at 50 while side-full returns false.
// ARION's proof: stxer eec7dac25d4c06c4eee55a79864435ab (Y side only).
//
// Same sequence on every mode, both sides (MY = Y/STX ghost, MX = X/sBTC ghost):
//   setup  2 band rungs seated per side, 47 x 2-unit makers + P (1 unit) -> 50
//   bump   N1 new maker on the full side: settle parks P (smallest), N1 placed
//          (regression: full-side bump still works)
//   stale  retire one band per side, max-band 1, sync-seat of the other side
//          -> seats 1, stale seat still counted, list 50, side-full false
//   seed   one opposite-side order via submit+settle on a non-full side
//          (regression: normal settle places the order)
//   ghost  V (fresh) and P (parked 1 unit) submit; settle refunds queue-full
//          prefix: ghost deposit, cancel pays again (asserted as the bug)
//          patched/followAll: asserted correct (no ghost, parked kept, solvent)
// Modes: prefix = git 24f3e23 markets-sbtc-stx-jing-v6-3.clar;
//        patched = working-tree markets-sbtc-stx-jing-v6-3.clar;
//        followAll = working-tree markets-sbtc-stx-jing-v6-3-followAll.clar.
// followAll is the pre-wave-1 baseline copy: its settle uses try! (no u1010
// catch, so no ghost is possible) and its cancel ignores pending escrow, so
// the "ghost" phase is EXPECTED to fail there (settle errs u1010, escrow stays
// pending). Run it only for comparison; prefix + patched are the proof.
// Results 2026-09-24: prefix 341/341 (bug reproduced, 89b43413...),
// patched 343/343 (df2479d9...), followAll 317/343 (bf2835b2..., as above).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  noneCV, deserializeCV, cvToString, getAddressFromPrivateKey, makeUnsignedSTXTokenTransfer,
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
const LADDER = `${DEP}.jing-ladder-v1`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALE = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51' };
const P = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const T = { x: P(SBTC), y: P(WSTX) };
const A = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const MY = `${DEP}.ghost-my`, MX = `${DEP}.ghost-mx`;
const MKT = { y: MY, x: MX };
// Units per side: Y in uSTX, X in sats (min deposits 1 STX / 1000 sats).
const U = { y: 1_000_000, x: 1000 };
const FILL = { y: 2 * U.y, x: 2 * U.x };

const SOURCES = {
  prefix: () => execFileSync('git', ['show', '24f3e23:contracts/markets-sbtc-stx-jing-v6-3.clar'], { cwd: new URL('..', import.meta.url) }).toString(),
  patched: () => fs.readFileSync(new URL('../contracts/markets-sbtc-stx-jing-v6-3.clar', import.meta.url), 'utf8'),
  followAll: () => fs.readFileSync(new URL('../contracts/markets-sbtc-stx-jing-v6-3-followAll.clar', import.meta.url), 'utf8'),
};
// Deploy payloads cap at 100 KB: an oversize source (followAll) is sent with
// full-line comments and indentation stripped; the code itself is unchanged.
const fit = (code) => code.length < 100_000 ? code
  : code.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith(';')).join('\n');
const src = (name) => fs.readFileSync(new URL(`../contracts/${name}.clar`, import.meta.url), 'utf8');
// Minimal band rung (after ARION's f1-rung): registers itself with the ladder
// and pushes its own balance to the market through as-contract?, so the
// market records the rung contract as the depositor. One source for every
// rung -> one code hash -> the canonical-hash gate accepts all of them.
const RUNG = `
(define-public (initialize (side (string-ascii 8)) (price uint))
  (contract-call? .jing-ladder-v1 register side price u0))
(define-public (deposit-y (amount uint) (limit-price uint))
  (as-contract? ((with-stx amount))
    (try! (contract-call? .ghost-my deposit-token-y amount limit-price none '${WSTX} "wstx"))))
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
const depArgs = (side, amount, limit) => [uintCV(amount), uintCV(limit), noneCV(), T[side], A[side]];
const settleArgs = (side, who, upd) => [P(who), upd, T[side], A[side]];
const other = (s) => (s === 'x' ? 'y' : 'x');

async function run(mode) {
  passed = checks = failures = 0; failed.length = 0;
  console.log(`\n===== mode ${mode} =====`);
  const market = fit(SOURCES[mode]());
  console.log(`market source ${market.length} bytes`);
  const u0 = await fetchLazerUpdateAny();
  const mid = (u0.px * 100_000_000n) / u0.py;
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
  deploy('jing-core-v6', src('jing-core-v6'));
  deploy('jing-ladder-v1', src('jing-ladder-v1'));
  deploy('ghost-my', market);
  deploy('ghost-mx', market);
  const R = { a: 'ghost-rung-a', b: 'ghost-rung-b', c: 'ghost-rung-c', e: 'ghost-rung-e' };
  for (const n of Object.values(R)) deploy(n, RUNG);
  const rid = (k) => `${DEP}.${R[k]}`;
  add('canonical sel-band', call(DEP, LADDER, 'set-canonical', [stringAsciiCV('sel-band'), P(rid('a'))]), '(ok true)');
  add('canonical buy-band', call(DEP, LADDER, 'set-canonical', [stringAsciiCV('buy-band'), P(rid('c'))]), '(ok true)');
  add('max band 2', call(DEP, LADDER, 'set-max-band-per-side', [uintCV(2)]), '(ok true)');
  for (const m of [MY, MX]) {
    add(`verify ${m}`, call(DEP, CORE, 'set-verified-contract', [P(m)]), '(ok true)');
    add(`initialize ${m}`, call(DEP, m, 'initialize', [P(m), T.x, T.y, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), '(ok true)');
    add(`size queue ${m}`, call(DEP, m, 'set-distance-slots', [uintCV(0)]), '(ok true)');
  }
  for (const k of ['a', 'b']) add(`fund rung ${k}`, (bb) => bb.withSender(WHALE.y).addSTXTransfer({ recipient: rid(k), amount: FILL.y }), ok);
  for (const k of ['c', 'e']) add(`fund rung ${k}`, call(WHALE.x, SBTC, 'transfer', [uintCV(FILL.x), P(WHALE.x), P(rid(k)), noneCV()]), '(ok true)');
  const reg = { a: ['sel-band', 10], b: ['sel-band', 20], c: ['buy-band', 30], e: ['buy-band', 40] };
  for (const [k, [side, px]] of Object.entries(reg)) add(`rung ${k} registers ${side} ${px}`, call(DEP, rid(k), 'initialize', [stringAsciiCV(side), uintCV(px)]), '(ok true)');
  for (const k of ['a', 'b']) add(`rung ${k} deposits y`, call(DEP, rid(k), 'deposit-y', [uintCV(FILL.y), uintCV(LIM.y)]), `(ok u${FILL.y})`);
  for (const k of ['c', 'e']) add(`rung ${k} deposits x`, call(DEP, rid(k), 'deposit-x', [uintCV(FILL.x), uintCV(LIM.x)]), `(ok u${FILL.x})`);
  add('MY seats rung a', call(DEP, MY, 'sync-seat', [P(rid('a'))]), '(ok (tuple (seats u2) (x false) (y true)))');
  add('MY seats rung b', call(DEP, MY, 'sync-seat', [P(rid('b'))]), '(ok (tuple (seats u2) (x false) (y true)))');
  add('MX seats rung c', call(DEP, MX, 'sync-seat', [P(rid('c'))]), '(ok (tuple (seats u2) (x true) (y false)))');
  add('MX seats rung e', call(DEP, MX, 'sync-seat', [P(rid('e'))]), '(ok (tuple (seats u2) (x true) (y false)))');
  for (const side of ['y', 'x']) {
    const m = MKT[side];
    const fundB = (p, amt) => side === 'y'
      ? add(`fund ${p.slice(0, 8)}`, (bb) => bb.withSender(WHALE.y).addSTXTransfer({ recipient: p, amount: amt }), ok)
      : add(`fund ${p.slice(0, 8)}`, call(WHALE.x, SBTC, 'transfer', [uintCV(amt), P(WHALE.x), P(p), noneCV()]), '(ok true)');
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

  // ---------- phase 2: pin fork time just before one signed Lazer update ----------
  let upd, at;
  const tip0 = await getSimulationTip(sid);
  for (let i = 0; i < 30; i++) {
    const u = await fetchLazerUpdateAny();
    at = (await lazerFeedTimes(u.hex)).at;
    if (at - 2 > Number(tip0.block_time)) { upd = bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex')); break; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!upd) throw new Error('no Lazer update newer than the fork tip');
  const stamp = at - 2;
  await submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: stamp - Number(tip0.burn_block_time) } }] });
  await ev('fork clock pinned 2s before the signed update', MY, 'stacks-block-time', `u${stamp}`);
  // Fork time stays fixed from here: every submit is at `stamp`, every
  // settle uses the same update (at > submitted-at, well inside staleness).

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
  await tx('retire sel-band 10 (rung a)', DEP, LADDER, 'retire-band', [stringAsciiCV('sel-band'), uintCV(10)], '(ok true)');
  await tx('retire buy-band 30 (rung c)', DEP, LADDER, 'retire-band', [stringAsciiCV('buy-band'), uintCV(30)], '(ok true)');
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

  // ---- the attack, both sides ----
  const bug = mode === 'prefix';
  for (const side of ['y', 'x']) {
    const m = MKT[side], { P: p, V: v } = who[side], u = U[side];
    const T0 = await ev(`${side}: totals before`, m, total(side));
    const B0 = await ev(`${side}: market balance before`, m, bal(side, m));
    const t0 = BigInt(T0.slice(1)), b0 = BigInt(B0.slice(1));
    // V: fresh victim, 5 units
    await fund(side, v, 5 * u);
    await tx(`${side}: V submits 5 units (pending)`, v, m, `deposit-token-${side}`, depArgs(side, 5 * u, LIM[side]), `(ok u${5 * u})`);
    let r = await tx(`${side}: settle V refunds`, keeper, m, `settle-token-${side}-deposit`, settleArgs(side, v, upd), `(ok u${5 * u})`);
    check(`${side}: refund reason queue-full`, prints(r).join(' '), (x) => x.includes(`pending-refund-${side}`) && x.includes('"queue-full"'));
    await ev(`${side}: V pending cleared`, m, `(get-token-${side}-pending-deposit '${v})`, 'none');
    await ev(`${side}: V refunded to wallet`, m, bal(side, v), `u${5 * u}`);
    await ev(`${side}: V off the list`, m, onList(side, v), 'false');
    await ev(`${side}: V deposit record ${bug ? 'GHOST' : 'none'}`, m, dep(side, v), bug ? `u${5 * u}` : 'u0');
    await ev(`${side}: V limit record ${bug ? 'GHOST' : 'none'}`, m, `(is-some (map-get? token-${side}-deposit-limits '${v}))`, bug ? 'true' : 'false');
    await ev(`${side}: totals ${bug ? 'inflated by ghost' : 'unchanged'}`, m, total(side), `u${bug ? t0 + BigInt(5 * u) : t0}`);
    await ev(`${side}: market balance back to before`, m, bal(side, m), `u${b0}`);
    // P: parked 1 unit, submits 3 more (carry = 1)
    await fund(side, p, 3 * u);
    await tx(`${side}: P (parked 1) submits 3 units (pending)`, p, m, `deposit-token-${side}`, depArgs(side, 3 * u, LIM[side]), `(ok u${3 * u})`);
    r = await tx(`${side}: settle P refunds`, keeper, m, `settle-token-${side}-deposit`, settleArgs(side, p, upd), `(ok u${3 * u})`);
    check(`${side}: P refund reason queue-full`, prints(r).join(' '), (x) => x.includes('"queue-full"'));
    await ev(`${side}: P refunded 3 units`, m, bal(side, p), `u${3 * u}`);
    await ev(`${side}: P parked ${bug ? 'WIPED' : 'kept at 1 unit'}`, m, `(get-token-${side}-parked '${p})`, bug ? 'u0' : `u${u}`);
    await ev(`${side}: P deposit record ${bug ? 'GHOST carry+amount' : 'none'}`, m, dep(side, p), bug ? `u${4 * u}` : 'u0');
    await ev(`${side}: P off the list`, m, onList(side, p), 'false');
    await ev(`${side}: totals ${bug ? 'inflated by both ghosts' : 'unchanged'}`, m, total(side), `u${bug ? t0 + BigInt(9 * u) : t0}`);
    if (!bug) await ev(`${side}: solvent: market = book + P parked`, m, `(is-eq ${bal(side, m)} (+ ${total(side)} (get-token-${side}-parked '${p})))`, 'true');
    // cancels
    await tx(`${side}: V cancel ${bug ? 'PAYS AGAIN' : 'has nothing'}`, v, m, `cancel-token-${side}-deposit`, [T[side], A[side]], bug ? `(ok u${5 * u})` : '(err u1005)');
    await tx(`${side}: P cancel ${bug ? 'pays ghost 4' : 'pays parked 1'}`, p, m, `cancel-token-${side}-deposit`, [T[side], A[side]], bug ? `(ok u${4 * u})` : `(ok u${u})`);
    await ev(`${side}: V net ${bug ? 'DOUBLE (10 units)' : '= funded 5 units'}`, m, bal(side, v), `u${(bug ? 10 : 5) * u}`);
    await ev(`${side}: P net ${bug ? '7 units (+3 stolen)' : '= funded 1 + 3 units'}`, m, bal(side, p), `u${(bug ? 7 : 4) * u}`);
    await ev(`${side}: totals back to before`, m, total(side), `u${t0}`);
    await ev(`${side}: market ${bug ? 'short 8 units vs book (other makers\' funds)' : 'balance = book (solvent)'}`, m, `(- (to-int ${bal(side, m)}) (to-int ${total(side)}))`, bug ? `-${8 * u}` : '0');
    await ev(`${side}: no stray pending/parked`, m, `(list (get-token-${side}-pending-deposit '${v}) (get-token-${side}-pending-deposit '${p}))`, '(list none none)');
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
