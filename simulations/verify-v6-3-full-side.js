// Fork only. Run: node simulations/verify-v6-3-full-side.js [--dry]
// markets-sbtc-stx-jing-v6-3: FULL sides, protected seats and parking, both
// sides. Every market is the unmodified working-tree source deployed as
// `fullside-*` next to fresh jing-core-v6 / jing-ladder-v1.
//
// Markets
//  fullside-y / fullside-x   the side under test filled to 50: 2 seated band
//      rungs (1 unit each, the smallest on the book, protected), 47 fixed
//      makers at distinct distances from the mid (a tie pair at the
//      distance-slots boundary, a few special sizes) and one pegged maker G.
//      The opposite side stays empty so fillers deposit directly.
//  fullside-yb / fullside-xb seats-per-side 45 (synced while the ladder's
//      max-band was 45, before it went back to 2): 5 unseated makers fill
//      the side, all on the crossing side of the mid -> nobody is parkable.
//
// Scenarios (y = bids in uSTX, x = asks in sats; 1 unit = 1 STX / 1000 sats)
//  s0  pegged newcomer switched OFF by its cap / floor -> refund queue-full
//  s1  G switched off by a new cap / floor -> first-off parks G ahead of
//      everyone; G switched back on while parked
//  s2  edge newcomer, last-of-top bigger than the smallest outside -> parks
//      the smallest outside (distance-slots 10)
//  s3  edge newcomer, last-of-top == smallest outside (boundary) -> parks the
//      last of the top (distance-slots 5)
//  s4  tie pair straddling distance-slots: the earlier-listed is in the top,
//      the later-listed is outside and parked by a far newcomer
//  s5  far newcomer the same size as the smallest outside -> queue-full
//  s6  distance-slots 50 (no outside), edge newcomer -> parks the last
//  s7  distance-slots 50, far newcomer -> queue-full (nothing outside)
//  s8  seats: sync-seat of a seated rung (with-seat keeps the list), a
//      non-band sync-seat refused, rung B retired + sync-seat-count prunes
//      it -> B (smallest) becomes parkable and an edge newcomer parks it
//      a seated rung tops up on the full side (side-full seated arm)
//  s9  withdraw on a parked position: partial ok, USE_CANCEL, minimum
//  s10 readmit refused queue-full, duplicate / nothing-to-readmit errors
//  s11 slots freed by cancels -> readmit succeeds
//  s12 readmit pending, the maker re-deposits (carry clears parked) -> gone
//  s13 parked maker re-limited across the mid, opposite order at the mid ->
//      readmit refused crossing
//  pg  pegged-bid / pegged-ask spread guard (>= 100%) through a wrapper tx
//  s14 max-band raised, sync-seat-count -> reservation grows, side-full flips
//  b1  (yb/xb) nobody parkable, crossing newcomer -> core bumps the smallest
//  b2  (yb/xb) newcomer equal to the smallest -> core refuses, queue-full
//  b3  (yb/xb) non-crossing newcomer, nothing outside -> queue-full
// Expectations come from a JS model of park-tenth / side-full / the core
// bump; each scenario also asserts the branch label it was built to hit and
// the exact victim, then the exact depositor list, live / parked amounts,
// cycle totals, wallet and market balances and the core prints.
import fs from 'node:fs';
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  noneCV, someCV, deserializeCV, cvToString, getAddressFromPrivateKey, makeUnsignedSTXTokenTransfer,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, submitSimulationSteps, callContract, getNonce, setSender,
} from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';
import { installChunkedSubmit } from './_chunked-submit.js';

const DRY = process.argv.includes('--dry');
if (!DRY) installChunkedSubmit(60);
const NODE = 'http://77.42.3.101/stacks-api';
const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const CORE = `${DEP}.jing-core-v6`;
const LADDER = `${DEP}.jing-ladder-v1`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALE = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51' };
const P_ = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const T = { x: P_(SBTC), y: P_(WSTX) };
const A = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const other = (s) => (s === 'x' ? 'y' : 'x');
const U = { y: 1_000_000n, x: 1000n };
const MAXU = (1n << 128n) - 1n;
const HUGE = 999999999999999999n;
const MKT = { y: `${DEP}.fullside-y`, x: `${DEP}.fullside-x` };
const BMKT = { y: `${DEP}.fullside-yb`, x: `${DEP}.fullside-xb` };
const RUNGS = { a: 'fullside-rung-a', b: 'fullside-rung-b', c: 'fullside-rung-c', e: 'fullside-rung-e' };
const rid = (k) => `${DEP}.${RUNGS[k]}`;
// seated rungs per side: y (sel-band) a@10 b@20, x (buy-band) c@30 e@40
const SEATS = { y: { A: rid('a'), B: rid('b'), band: 'sel-band', spreadB: 20 }, x: { A: rid('c'), B: rid('e'), band: 'buy-band', spreadB: 40 } };
const RUNG = `
(define-public (initialize (side (string-ascii 8)) (price uint))
  (contract-call? .jing-ladder-v1 register side price u0))
(define-public (deposit-y (amount uint) (limit-price uint))
  (as-contract? ((with-stx amount))
    (try! (contract-call? .fullside-y deposit-token-y amount limit-price none '${WSTX} "wstx"))))
(define-public (deposit-x (amount uint) (limit-price uint))
  (as-contract? ((with-ft '${SBTC} "sbtc-token" amount))
    (try! (contract-call? .fullside-x deposit-token-x amount limit-price none '${SBTC} "sbtc-token"))))
`;
// pegged-bid / pegged-ask are read-only; a spread >= 100% cannot be stored
// (valid-spread), so a tiny public wrapper reaches their spread guard in a tx
const PROBE = `
(define-public (peg (mid uint) (spread uint) (bound uint))
  (ok (list (contract-call? .fullside-y pegged-bid mid spread bound)
            (contract-call? .fullside-x pegged-ask mid spread bound))))
`;
const src = (name) => fs.readFileSync(new URL(`../contracts/${name}.clar`, import.meta.url), 'utf8');

// ------------------------------------------------------------ harness ----
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
  console.log(`${good ? 'ok  ' : 'FAIL'} ${checks}. ${label}: ${String(actual).slice(0, 400)}${good ? '' : `; expected ${typeof want === 'function' ? want.toString() : want}`}`);
  return good;
}
async function retry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i < 6 && /block info|ECONNRESET|fetch failed|socket|50[234]/i.test(String(e?.message ?? e))) { console.log(`  retry after: ${String(e?.message ?? e).slice(0, 120)}`); await new Promise((r) => setTimeout(r, 4000)); continue; }
      throw e;
    }
  }
}
async function ev(label, cid, code, want) {
  if (DRY) return undefined;
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Eval: [DEP, '', cid, code] }] }));
  const v = decode(out.steps[0]);
  if (want !== undefined) check(label, v, want);
  return v;
}
async function tx(label, sender, cid, fn, args, want) {
  if (DRY) return { receipt: { events: [] } };
  const r = await retry(() => callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 }));
  const v = r.vmError || r.pcAborted ? `ENGINE-ERR ${JSON.stringify(r).slice(0, 300)}` : r.result;
  check(label, v, want);
  return r;
}
async function stxTo(sender, recipient, amount) {
  if (DRY) return;
  const raw = await makeUnsignedSTXTokenTransfer({ recipient, amount, nonce: await retry(() => getNonce(sid, sender)), network: 'mainnet', publicKey: '', fee: 0 });
  setSender(raw, sender);
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] }));
  check(`fund ${recipient.slice(0, 8)} ${amount} uSTX`, decode(out.steps[0]), '(ok true)');
}
const fund = (side, who, amount) => side === 'y'
  ? stxTo(WHALE.y, who, amount)
  : tx(`fund ${who.slice(0, 8)} ${amount} sats`, WHALE.x, SBTC, 'transfer', [uintCV(amount), P_(WHALE.x), P_(who), noneCV()], '(ok true)');
function prints(r) {
  const evs = (r.receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e);
  return evs.filter((e) => e.contract_event?.contract_identifier === CORE && e.committed !== false).map((e) => cv(e.contract_event.raw_value));
}
// one core print with this event name carrying every (key value) given
function evt(label, r, name, fields) {
  if (DRY) return;
  const all = prints(r);
  const hit = all.find((p) => p.includes(`(event "${name}")`) && Object.entries(fields).every(([k, v]) => p.includes(`(${k} ${v})`)));
  check(label, hit ?? all.join(' | '), () => !!hit);
}
function noEvt(label, r, name) {
  if (DRY) return;
  const all = prints(r);
  check(label, all.map((p) => (p.match(/\(event "([^"]+)"\)/) ?? [])[1]).join(','), () => !all.some((p) => p.includes(`(event "${name}")`)));
}
const cyc = '(var-get current-cycle)';
const bal = (side, p) => side === 'y' ? `(stx-get-balance '${p})` : `(unwrap-panic (contract-call? '${SBTC} get-balance '${p}))`;
const spreadCV = (s) => (s == null ? noneCV() : someCV(uintCV(s)));
const depArgs = (side, amount, limit, spread) => [uintCV(amount), uintCV(limit), spreadCV(spread), T[side], A[side]];

// -------------------------------------------------------------- model ----
// Mirrors park-tenth-token-*, side-full-*, the core bump and settle routing.
function newBook(side, cid, seats) {
  return { side, cid, seats, seated: [], list: [], live: new Map(), lim: new Map(), parked: new Map(), slots: 10, names: new Map(), opp: { list: [], live: new Map(), lim: new Map() } };
}
function pegPrice(side, P, spread, bound) {
  if (side === 'y') { const p = spread < 10000n ? P * (10000n - spread) / 10000n : 0n; return p <= bound ? p : 0n; }
  const p = spread < 10000n ? P * (10000n + spread) / 10000n : MAXU; return p >= bound ? p : MAXU;
}
const orderPrice = (side, o, P) => (o.spread == null ? o.limit : pegPrice(side, P, BigInt(o.spread), o.limit));
const limitAt = (m, who, P) => orderPrice(m.side, m.lim.get(who) ?? { limit: 0n, spread: null }, P);
const better = (side, a, b) => (side === 'y' ? a > b : a < b);
const eligible = (side, l, P) => (side === 'y' ? l < P : l > P);
const isOff = (side, l) => (side === 'y' ? l === 0n : l === MAXU);
function sideFull(m, who) {
  if (m.seated.includes(who)) return m.list.length >= 50;
  const on = m.list.filter((p) => m.seated.includes(p)).length;
  return m.list.length - on >= 50 - m.seats;
}
function parkTenth(m, P, bid, size) {
  const s = m.side;
  let top = [];
  for (const who of m.list) {
    const l = limitAt(m, who, P);
    if (m.seated.includes(who) || !eligible(s, l, P)) continue;
    const out = []; let placed = false;
    for (const e of top) { if (!placed && better(s, l, e.l)) { out.push({ who, l }, e); placed = true; } else out.push(e); }
    if (!placed) out.push({ who, l });
    top = out.slice(0, m.slots);
  }
  const off = m.list.find((who) => !m.seated.includes(who) && isOff(s, limitAt(m, who, P)));
  let smallest = HUGE, found = null;
  for (const who of m.list) {
    if (m.seated.includes(who) || top.some((t) => t.who === who) || !eligible(s, limitAt(m, who, P), P)) continue;
    const a = m.live.get(who) ?? 0n;
    if (a < smallest) { smallest = a; found = who; }
  }
  const n = top.length, last = top[n - 1];
  const edge = n > 0 && better(s, bid, last.l);
  if (off) return { label: 'off', victim: off };
  if ((s === 'y' ? bid >= P : bid <= P) && n === 0) return { label: 'none-parkable' };
  if (edge) {
    if (found) return (m.live.get(last.who) > smallest) ? { label: 'edge-small', victim: found } : { label: 'edge-last', victim: last.who };
    return { label: 'edge-last-none', victim: last.who };
  }
  if (found) return size > smallest ? { label: 'far-small', victim: found } : { label: 'far-full' };
  return { label: 'far-none' };
}
function park(m, who) {
  m.parked.set(who, m.live.get(who));
  m.live.delete(who);
  m.list = m.list.filter((p) => p !== who);
}
// settle-token-*-deposit for a fresh newcomer (no carry)
function modelSettle(m, P, who, amount, order) {
  const s = m.side, bid = orderPrice(s, order, P);
  const oppHas = [...m.opp.live.keys()].some((p) => (s === 'y' ? orderPrice('x', m.opp.lim.get(p), P) <= P : orderPrice('y', m.opp.lim.get(p), P) >= P));
  const crosses = (s === 'y' ? P <= bid : P >= bid) && oppHas;
  const isNew = !m.live.has(who), full = sideFull(m, who);
  if (crosses) return { refund: 'crossing', label: 'crossing' };
  if (isNew && full && isOff(s, bid)) return { refund: 'queue-full', label: 'newcomer-off' };
  let bumped = false, pt = { label: 'not-full' };
  if (isNew && full) {
    pt = parkTenth(m, P, bid, amount);
    if (pt.label === 'far-full' || pt.label === 'far-none') return { refund: 'queue-full', label: pt.label };
    if (pt.victim) { park(m, pt.victim); bumped = true; }
  }
  if (isNew && !bumped && sideFull(m, who)) {
    let smallest = HUGE, sw = who;
    for (const p of m.list) { const a = m.live.get(p) ?? 0n; if (!m.seated.includes(p) && a < smallest) { smallest = a; sw = p; } }
    if (!(amount > smallest)) return { refund: 'queue-full', label: `${pt.label}/core-full` };
    park(m, sw);
    m.list.push(who); m.live.set(who, amount); m.lim.set(who, order);
    return { victim: sw, core: true, label: `${pt.label}/core-bump` };
  }
  m.list.push(who); m.live.set(who, (m.live.get(who) ?? 0n) + amount); m.lim.set(who, order);
  return { victim: pt.victim, core: false, label: pt.label };
}
const sum = (mp) => [...mp.values()].reduce((a, b) => a + b, 0n);

// ------------------------------------------------------------ scenario ----
async function main() {
  const u0 = DRY ? { px: 6_500_000_000_000n, py: 60_000_000n } : await fetchLazerUpdateAny();
  const mid = (u0.px * 100_000_000n) / u0.py;
  // per-mille of the mid; on x the mirror (2 - f) so the x book is the y book reflected
  const L = (side, pm) => (side === 'y' ? mid * BigInt(pm) / 1000n : mid * BigInt(2000 - pm) / 1000n);
  console.log(`mid0 ${mid}`);
  const book = { y: newBook('y', MKT.y, 2), x: newBook('x', MKT.x, 2) };
  const bbook = { y: newBook('y', BMKT.y, 45), x: newBook('x', BMKT.x, 45) };
  const keeper = mk(4999);
  // fixed makers r1..r47 at 900 - 10r per mille (r21 tied with r20 at 700)
  const pmOf = (r) => (r === 21 ? 700 : 900 - 10 * r);
  const amtOf = (r) => (r === 5 || r === 20 || r === 21 ? 2n : r === 30 ? 3n / 2n : 3n); // units, r30 set below
  const units = (side, r) => (r === 30 ? U[side] * 3n / 2n : amtOf(r) * U[side]);
  const base = { y: 5000, x: 6000 };
  const R = (side, r) => mk(base[side] + r);
  const order47 = Array.from({ length: 47 }, (_, i) => ((i * 7) % 47) + 1); // shuffled list order
  const G = { y: mk(5100), x: mk(6100) };
  const PEG = { spread: 9500, on: { y: 100, x: 1900 }, off: { y: 40, x: 2000 } }; // per mille of mid0 (cap / floor)
  const pegBound = (side, st) => mid * BigInt(PEG[st][side]) / 1000n;
  const N = (side, i) => mk((side === 'y' ? 7000 : 8000) + i);

  // ---------------- phase 1: builder setup ----------------
  let b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  const plan = [];
  const add = (label, build, want) => { b = build(b); plan.push({ label, want }); };
  const call = (sender, cid, fn, args) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const deploy = (name, code) => add(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes('ERR'));
  const read = (label, cid, code, want) => add(label, (bb) => bb.addEvalCode(cid, code), want);
  const fundB = (side, p, amt) => side === 'y'
    ? add(`fund ${p.slice(0, 8)}`, (bb) => bb.withSender(WHALE.y).addSTXTransfer({ recipient: p, amount: Number(amt) }), ok)
    : add(`fund ${p.slice(0, 8)}`, call(WHALE.x, SBTC, 'transfer', [uintCV(amt), P_(WHALE.x), P_(p), noneCV()]), '(ok true)');
  const market = src('markets-sbtc-stx-jing-v6-3');
  deploy('jing-core-v6', src('jing-core-v6'));
  deploy('jing-ladder-v1', src('jing-ladder-v1'));
  for (const c of [MKT.y, MKT.x, BMKT.y, BMKT.x]) deploy(c.split('.')[1], market);
  for (const n of Object.values(RUNGS)) deploy(n, RUNG);
  deploy('fullside-probe', PROBE);
  for (const m of [MKT.y, MKT.x, BMKT.y, BMKT.x]) {
    add(`verify ${m}`, call(DEP, CORE, 'set-verified-contract', [P_(m)]), '(ok true)');
    add(`initialize ${m}`, call(DEP, m, 'initialize', [P_(m), T.x, T.y, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), '(ok true)');
  }
  // ladder max-band is fork-global: the bump markets take 45 now, the main ones 2 later
  add('max band 45', call(DEP, LADDER, 'set-max-band-per-side', [uintCV(45)]), '(ok true)');
  for (const m of [BMKT.y, BMKT.x]) add(`${m}: sync-seat-count -> 45`, call(DEP, m, 'sync-seat-count', []), '(ok u45)');
  add('max band back to 2', call(DEP, LADDER, 'set-max-band-per-side', [uintCV(2)]), '(ok true)');
  add('canonical sel-band', call(DEP, LADDER, 'set-canonical', [stringAsciiCV('sel-band'), P_(rid('a'))]), '(ok true)');
  add('canonical buy-band', call(DEP, LADDER, 'set-canonical', [stringAsciiCV('buy-band'), P_(rid('c'))]), '(ok true)');
  for (const k of ['a', 'b']) fundB('y', rid(k), U.y);
  for (const k of ['c', 'e']) fundB('x', rid(k), U.x);
  const reg = { a: ['sel-band', 10], b: ['sel-band', 20], c: ['buy-band', 30], e: ['buy-band', 40] };
  for (const [k, [bs, px]] of Object.entries(reg)) add(`rung ${k} registers ${bs} ${px}`, call(DEP, rid(k), 'initialize', [stringAsciiCV(bs), uintCV(px)]), '(ok true)');
  const rungPm = { A: 950, B: 300 }; // A nearer the mid than every maker, B far
  for (const side of ['y', 'x']) {
    const m = book[side], fn = side === 'y' ? 'deposit-y' : 'deposit-x';
    for (const tag of ['A', 'B']) {
      const who = SEATS[side][tag];
      add(`${side}: rung ${tag} deposits 1 unit`, call(DEP, who, fn, [uintCV(U[side]), uintCV(L(side, rungPm[tag]))]), `(ok u${U[side]})`);
      m.list.push(who); m.live.set(who, U[side]); m.lim.set(who, { limit: L(side, rungPm[tag]), spread: null }); m.names.set(who, `rung-${tag}`);
    }
    for (const tag of ['A', 'B']) {
      add(`${side}: sync-seat rung ${tag}`, call(DEP, m.cid, 'sync-seat', [P_(SEATS[side][tag])]), `(ok (tuple (seats u2) (x ${side === 'x'}) (y ${side === 'y'})))`);
      m.seated.push(SEATS[side][tag]);
    }
    for (const r of order47) {
      const who = R(side, r), amt = units(side, r), lim = L(side, pmOf(r));
      fundB(side, who, amt);
      add(`${side}: r${r} deposits ${amt} @ ${pmOf(r)}‰`, call(who, m.cid, `deposit-token-${side}`, depArgs(side, amt, lim, null)), `(ok u${amt})`);
      m.list.push(who); m.live.set(who, amt); m.lim.set(who, { limit: lim, spread: null }); m.names.set(who, `r${r}`);
    }
    const g = G[side], gAmt = 3n * U[side];
    fundB(side, g, gAmt);
    add(`${side}: G pegged ${PEG.spread}bps, bound ON`, call(g, m.cid, `deposit-token-${side}`, depArgs(side, gAmt, pegBound(side, 'on'), PEG.spread)), `(ok u${gAmt})`);
    m.list.push(g); m.live.set(g, gAmt); m.lim.set(g, { limit: pegBound(side, 'on'), spread: PEG.spread }); m.names.set(g, 'G');
    read(`${side}: list at 50`, m.cid, `(len (get-token-${side}-depositors ${cyc}))`, 'u50');
    read(`${side}: seated list`, m.cid, `(get-seated-${side})`, `(list ${m.seated.join(' ')})`);
    read(`${side}: protected-seats 2`, m.cid, '(protected-seats)', 'u2');
    read(`${side}: full for a newcomer`, m.cid, `(side-full-${side} (get-token-${side}-depositors ${cyc}) '${N(side, 99)})`, 'true');
    read(`${side}: full for a seated rung too (list at 50)`, m.cid, `(side-full-${side} (get-token-${side}-depositors ${cyc}) '${SEATS[side].A})`, 'true');
    read(`${side}: totals`, m.cid, `(get total-token-${side} (get-cycle-totals ${cyc}))`, `u${sum(m.live)}`);
    // bump markets: 5 unseated makers, all across the mid (nobody parkable)
    const bm = bbook[side];
    [3n, 3n, 2n, 3n, 3n].forEach((un, i) => {
      const who = mk((side === 'y' ? 5300 : 6300) + i), amt = un * U[side], lim = L(side, 1500);
      fundB(side, who, amt);
      add(`${side}b: maker ${i} deposits ${amt} across the mid`, call(who, bm.cid, `deposit-token-${side}`, depArgs(side, amt, lim, null)), `(ok u${amt})`);
      bm.list.push(who); bm.live.set(who, amt); bm.lim.set(who, { limit: lim, spread: null }); bm.names.set(who, `b${i}`);
    });
    read(`${side}b: protected-seats 45`, bm.cid, '(protected-seats)', 'u45');
    read(`${side}b: 5 unseated fill the side`, bm.cid, `(side-full-${side} (get-token-${side}-depositors ${cyc}) '${N(side, 99)})`, 'true');
  }
  if (!DRY) {
    sid = await retry(() => b.run());
    console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
    const setup = (await retry(() => getSimulationResult(sid))).steps.filter((s) => s.Result?.Transaction || s.Result?.Eval);
    if (setup.length !== plan.length) throw new Error(`setup result count ${setup.length} != ${plan.length}`);
    plan.forEach((s, i) => check(s.label, decode(setup[i]), s.want));
    if (failures) return;
  }

  // ---------------- phase 2: one signed print newer than every submit ----------------
  let P, upd;
  if (DRY) { P = mid * 1003n / 1000n; upd = bufferCV(Buffer.alloc(1)); } else {
    const stamp = Number((await ev('fork clock', MKT.y, 'stacks-block-time', (v) => /^u\d+$/.test(v))).slice(1));
    let u;
    for (let i = 0; i < 30 && !u; i++) {
      const c = await fetchLazerUpdateAny();
      if ((await lazerFeedTimes(c.hex)).at > stamp) u = c; else await new Promise((r) => setTimeout(r, 2000));
    }
    if (!u) throw new Error('no Lazer update newer than the fork clock');
    P = (u.px * 100_000_000n) / u.py;
    upd = bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex'));
    console.log(`settle price ${P} (mid0 ${mid}), fork clock ${stamp}`);
  }
  const name = (m, p) => m.names.get(p) ?? p.slice(0, 10);

  async function verifyBook(tag, m) {
    const s = m.side;
    await ev(`${tag}: exact ${s} list`, m.cid, `(get-token-${s}-depositors ${cyc})`, `(list ${m.list.join(' ')})`);
    await ev(`${tag}: ${s} totals = live sum`, m.cid, `(get total-token-${s} (get-cycle-totals ${cyc}))`, `u${sum(m.live)}`);
    const opp = sum(m.opp.live);
    await ev(`${tag}: market ${s} balance = live + parked`, m.cid, bal(s, m.cid), `u${sum(m.live) + sum(m.parked) + (s === 'x' ? 0n : 0n)}`);
    if (opp) await ev(`${tag}: market ${other(s)} balance = opposite book`, m.cid, bal(other(s), m.cid), `u${opp}`);
    for (const [p, a] of m.parked) await ev(`${tag}: ${name(m, p)} parked ${a}, off the book`, m.cid, `(list (get-token-${s}-parked '${p}) (get-token-${s}-deposit ${cyc} '${p}))`, `(list u${a} u0)`);
  }
  // newcomer submits on a full side (pending) and settles with the print
  async function newcomer(tag, m, who, amt, order, want) {
    const s = m.side;
    m.names.set(who, tag.split(' ')[0]);
    const before = { list: [...m.list] };
    const res = modelSettle(m, P, who, amt, order);
    check(`${tag}: model branch`, res.label, want.label);
    if (want.victim !== undefined) check(`${tag}: model victim`, res.victim ? name(m, res.victim) : 'none', want.victim);
    if (DRY) { console.log(`  [dry] ${tag}: ${res.label} ${res.victim ? name(m, res.victim) : ''} ${res.refund ?? ''}`); return res; }
    await fund(s, who, amt);
    await tx(`${tag}: submit ${amt} (pending, full side)`, who, m.cid, `deposit-token-${s}`, depArgs(s, amt, order.limit, order.spread), `(ok u${amt})`);
    await ev(`${tag}: pending escrowed`, m.cid, `(get amount (get-token-${s}-pending-deposit '${who}))`, `(some u${amt})`);
    const r = await tx(`${tag}: settle with the print`, keeper, m.cid, `settle-token-${s}-deposit`, [P_(who), upd, T[s], A[s]], `(ok u${amt})`);
    await ev(`${tag}: pending cleared`, m.cid, `(get-token-${s}-pending-deposit '${who})`, 'none');
    if (res.refund) {
      evt(`${tag}: refund print ${res.refund}`, r, `pending-refund-${s}`, { depositor: who, amount: `u${amt}`, price: `u${P}`, reason: `"${res.refund}"` });
      noEvt(`${tag}: nobody parked`, r, `park-${s}`);
      await ev(`${tag}: refunded to wallet`, m.cid, bal(s, who), `u${amt}`);
      await ev(`${tag}: not on the book`, m.cid, `(get-token-${s}-deposit ${cyc} '${who})`, 'u0');
      check(`${tag}: list unchanged (model)`, m.list.join(), before.list.join());
    } else {
      evt(`${tag}: park print ${name(m, res.victim)}`, r, `park-${s}`, { who: res.victim, amount: `u${m.parked.get(res.victim)}`, price: `u${P}` });
      evt(`${tag}: deposit print`, r, `deposit-${s}`, { depositor: who, amount: `u${amt}`, parked: res.core ? `(some ${res.victim})` : 'none' });
      await ev(`${tag}: newcomer on the book`, m.cid, `(get-token-${s}-deposit ${cyc} '${who})`, `u${amt}`);
      await ev(`${tag}: newcomer wallet emptied`, m.cid, bal(s, who), 'u0');
    }
    await verifyBook(tag, m);
    return res;
  }
  const setSlots = async (m, k) => { m.slots = k; await tx(`${m.side}: distance-slots ${k}`, DEP, m.cid, 'set-distance-slots', [uintCV(k)], '(ok true)'); };
  const ord = (limit, spread = null) => ({ limit, spread });

  for (const side of ['y', 'x']) {
    const m = book[side], s = side;
    console.log(`\n===== ${s} side: fullside-${s} =====`);
    await verifyBook(`${s} setup`, m);
    // s0: pegged newcomer switched off -> refund queue-full
    await newcomer(`${s}N0 pegged-off newcomer`, m, N(s, 0), 3n * U[s], ord(pegBound(s, 'off'), PEG.spread), { label: 'newcomer-off' });
    // s1: G switched off, parked first; switched back on while parked
    await ev(`${s}: G on at the print (pegged-${s === 'y' ? 'bid' : 'ask'} within bound)`, m.cid, `(token-${s}-limit-at '${G[s]} u${P})`, `u${limitAt(m, G[s], P)}`);
    await tx(`${s}: G moves its bound past the peg (switch off)`, G[s], m.cid, `set-token-${s}-limit`, [uintCV(pegBound(s, 'off')), spreadCV(PEG.spread)], '(ok true)');
    m.lim.set(G[s], ord(pegBound(s, 'off'), PEG.spread));
    await ev(`${s}: G off at the print`, m.cid, `(token-${s}-limit-at '${G[s]} u${P})`, s === 'y' ? 'u0' : `u${MAXU}`);
    await newcomer(`${s}N1 far newcomer`, m, N(s, 1), 3n * U[s], ord(L(s, 200)), { label: 'off', victim: 'G' });
    await tx(`${s}: parked G switches back on`, G[s], m.cid, `set-token-${s}-limit`, [uintCV(pegBound(s, 'on')), spreadCV(PEG.spread)], '(ok true)');
    m.lim.set(G[s], ord(pegBound(s, 'on'), PEG.spread));
    await ev(`${s}: G on again`, m.cid, `(token-${s}-limit-at '${G[s]} u${P})`, `u${limitAt(m, G[s], P)}`);
    check(`${s}: G on-price is a real price`, String(limitAt(m, G[s], P)), (v) => v !== '0' && v !== String(MAXU));
    // s2: edge, last bigger than the smallest outside -> smallest outside (r30)
    await setSlots(m, 10);
    await newcomer(`${s}N2 edge newcomer (slots 10)`, m, N(s, 2), 3n * U[s], ord(L(s, 805)), { label: 'edge-small', victim: 'r30' });
    // s3: edge, last == smallest outside -> last (r5)
    await setSlots(m, 5);
    await newcomer(`${s}N3 edge newcomer (slots 5, equal sizes)`, m, N(s, 3), 3n * U[s], ord(L(s, 855)), { label: 'edge-last', victim: 'r5' });
    // s4: tie pair r20/r21 straddling the boundary
    const tieL = L(s, 700);
    const closer = m.list.filter((p) => !m.seated.includes(p) && better(s, limitAt(m, p, P), tieL) && eligible(s, limitAt(m, p, P), P)).length;
    const pair = m.list.filter((p) => ['r20', 'r21'].includes(name(m, p)));
    check(`${s}: tie pair both live`, pair.length, 2);
    await setSlots(m, closer + 1);
    await newcomer(`${s}N4 far newcomer (tie at the boundary)`, m, N(s, 4), 3n * U[s], ord(L(s, 190)), { label: 'far-small', victim: name(m, pair[1]) });
    // s5: far newcomer the size of the smallest outside -> refused
    await setSlots(m, 10);
    await newcomer(`${s}N5 far newcomer, size == smallest outside`, m, N(s, 5), 2n * U[s], ord(L(s, 180)), { label: 'far-full' });
    // s6/s7: slots 50, nothing outside
    await setSlots(m, 50);
    await newcomer(`${s}N6 edge newcomer (slots 50)`, m, N(s, 6), 3n * U[s], ord(L(s, 195)), { label: 'edge-last-none', victim: `${s}N4` });
    await newcomer(`${s}N7 far newcomer (slots 50)`, m, N(s, 7), 3n * U[s], ord(L(s, 100)), { label: 'far-none' });
    // s8: seats
    await ev(`${s}: seated rungs still live (protected though smallest)`, m.cid, `(list (get-token-${s}-deposit ${cyc} '${SEATS[s].A}) (get-token-${s}-deposit ${cyc} '${SEATS[s].B}))`, `(list u${U[s]} u${U[s]})`);
    await tx(`${s}: sync-seat of an already seated rung keeps the list`, keeper, m.cid, 'sync-seat', [P_(SEATS[s].A)], `(ok (tuple (seats u2) (x ${s === 'x'}) (y ${s === 'y'})))`);
    await ev(`${s}: seated list unchanged`, m.cid, `(get-seated-${s})`, `(list ${m.seated.join(' ')})`);
    await tx(`${s}: sync-seat of a plain maker refused`, keeper, m.cid, 'sync-seat', [P_(R(s, 1))], '(err u1028)');
    await tx(`${s}: retire rung B's band`, DEP, LADDER, 'retire-band', [stringAsciiCV(SEATS[s].band), uintCV(SEATS[s].spreadB)], '(ok true)');
    await ev(`${s}: B still seated in the market until a sync`, m.cid, `(is-protected-${s} '${SEATS[s].B})`, 'true');
    await tx(`${s}: sync-seat-count prunes B`, keeper, m.cid, 'sync-seat-count', [], '(ok u2)');
    m.seated = [SEATS[s].A];
    await ev(`${s}: seated list = [A]`, m.cid, `(get-seated-${s})`, `(list ${SEATS[s].A})`);
    await ev(`${s}: B unprotected`, m.cid, `(is-protected-${s} '${SEATS[s].B})`, 'false');
    // a seated maker topping up on a full side: side-full-* takes the seated arm
    await fund(s, SEATS[s].A, U[s]);
    await tx(`${s}: seated rung A tops up 1 unit on the full side`, DEP, SEATS[s].A, s === 'y' ? 'deposit-y' : 'deposit-x', [uintCV(U[s]), uintCV(L(s, rungPm.A))], `(ok u${U[s]})`);
    m.live.set(SEATS[s].A, 2n * U[s]);
    await ev(`${s}: rung A live 2 units`, m.cid, `(get-token-${s}-deposit ${cyc} '${SEATS[s].A})`, `u${2n * U[s]}`);
    await setSlots(m, 10);
    await newcomer(`${s}N8 edge newcomer after the prune`, m, N(s, 8), 3n * U[s], ord(L(s, 845)), { label: 'edge-small', victim: 'rung-B' });
    // s9: withdraw on a parked position (r30 parked 1.5 units)
    const r30 = R(s, 30), half = U[s] / 2n;
    await tx(`${s}: r30 withdraw all parked -> use cancel`, r30, m.cid, `withdraw-token-${s}`, [uintCV(m.parked.get(r30)), T[s], A[s]], '(err u1024)');
    await tx(`${s}: r30 withdraw leaving 0.5 unit -> below minimum`, r30, m.cid, `withdraw-token-${s}`, [uintCV(U[s]), T[s], A[s]], '(err u1001)');
    let r = await tx(`${s}: r30 withdraw 0.5 unit of parked`, r30, m.cid, `withdraw-token-${s}`, [uintCV(half), T[s], A[s]], `(ok u${U[s]})`);
    evt(`${s}: withdraw print parked true`, r, `withdraw-${s}`, { depositor: r30, amount: `u${half}`, remaining: `u${U[s]}`, parked: 'true' });
    m.parked.set(r30, U[s]);
    await ev(`${s}: r30 wallet got 0.5 unit`, m.cid, bal(s, r30), `u${half}`);
    await tx(`${s}: r30 withdraw again to exactly the minimum -> use cancel`, r30, m.cid, `withdraw-token-${s}`, [uintCV(U[s]), T[s], A[s]], '(err u1024)');
    await tx(`${s}: r30 withdraw 1 base unit -> below minimum`, r30, m.cid, `withdraw-token-${s}`, [uintCV(1), T[s], A[s]], '(err u1001)');
    await verifyBook(`${s} after parked withdraw`, m);
    // s10: readmit refused queue-full
    await tx(`${s}: readmit of a live maker -> nothing to readmit`, keeper, m.cid, `readmit-token-${s}`, [P_(R(s, 1))], '(err u1022)');
    r = await tx(`${s}: readmit r30 (pending)`, keeper, m.cid, `readmit-token-${s}`, [P_(r30)], `(ok u${U[s]})`);
    evt(`${s}: pending-readmit print`, r, `pending-readmit-${s}`, { depositor: r30, amount: `u${U[s]}` });
    await tx(`${s}: second readmit -> already pending`, keeper, m.cid, `readmit-token-${s}`, [P_(r30)], '(err u1031)');
    check(`${s}: model side full for r30`, sideFull(m, r30), true);
    r = await tx(`${s}: settle readmit r30 on a full side`, keeper, m.cid, `settle-token-${s}-readmit`, [P_(r30), upd], '(ok u0)');
    evt(`${s}: refused queue-full print`, r, `settle-refused-${s}`, { depositor: r30, action: '"readmit"', reason: '"queue-full"', amount: `u${U[s]}`, price: `u${P}` });
    await ev(`${s}: readmit pending cleared`, m.cid, `(get-token-${s}-pending-readmit '${r30})`, 'none');
    await verifyBook(`${s} after refused readmit`, m);
    // s11: free slots by cancels -> readmit r30 succeeds
    const cancelUntilOpen = async (tag, who) => {
      let i = 0;
      while (sideFull(m, who)) {
        const c = R(s, 40 + (m.cancelled = (m.cancelled ?? 0) + 1));
        const a = m.live.get(c);
        await tx(`${tag}: r${40 + m.cancelled} cancels ${a}`, c, m.cid, `cancel-token-${s}-deposit`, [T[s], A[s]], `(ok u${a})`);
        m.live.delete(c); m.list = m.list.filter((p) => p !== c);
        await ev(`${tag}: r${40 + m.cancelled} wallet refunded`, m.cid, bal(s, c), `u${a}`);
        if (++i > 5) throw new Error('cancel loop');
      }
      await ev(`${tag}: side open for ${name(m, who)}`, m.cid, `(side-full-${s} (get-token-${s}-depositors ${cyc}) '${who})`, 'false');
    };
    await cancelUntilOpen(`${s} s11`, r30);
    await tx(`${s}: readmit r30 again`, keeper, m.cid, `readmit-token-${s}`, [P_(r30)], `(ok u${U[s]})`);
    r = await tx(`${s}: settle readmit r30 with a free slot`, keeper, m.cid, `settle-token-${s}-readmit`, [P_(r30), upd], `(ok u${U[s]})`);
    evt(`${s}: readmit print`, r, `readmit-${s}`, { who: r30, amount: `u${U[s]}`, price: `u${P}` });
    m.parked.delete(r30); m.live.set(r30, U[s]); m.list.push(r30);
    await ev(`${s}: r30 back on the book`, m.cid, `(get-token-${s}-deposit ${cyc} '${r30})`, `u${U[s]}`);
    await verifyBook(`${s} after readmit`, m);
    // s12: readmit pending, the maker re-deposits (carry) -> gone
    const n4 = N(s, 4), n4p = m.parked.get(n4);
    await cancelUntilOpen(`${s} s12`, n4);
    await tx(`${s}: readmit N4 (pending)`, keeper, m.cid, `readmit-token-${s}`, [P_(n4)], `(ok u${n4p})`);
    await fund(s, n4, U[s]);
    r = await tx(`${s}: N4 deposits 1 unit directly (carries its parked)`, n4, m.cid, `deposit-token-${s}`, depArgs(s, U[s], L(s, 190), null), `(ok u${U[s]})`);
    evt(`${s}: deposit print carries the parked amount`, r, `deposit-${s}`, { depositor: n4, amount: `u${n4p + U[s]}`, delta: `u${U[s]}`, readmitted: `u${n4p}` });
    m.parked.delete(n4); m.live.set(n4, n4p + U[s]); m.list.push(n4);
    r = await tx(`${s}: settle readmit N4 -> gone`, keeper, m.cid, `settle-token-${s}-readmit`, [P_(n4), upd], '(ok u0)');
    evt(`${s}: refused gone print`, r, `settle-refused-${s}`, { depositor: n4, action: '"readmit"', reason: '"gone"', amount: 'u0' });
    await ev(`${s}: N4 live parked+1`, m.cid, `(get-token-${s}-deposit ${cyc} '${n4})`, `u${n4p + U[s]}`);
    await verifyBook(`${s} after gone`, m);
    // s13: crossing refusal
    const r5 = R(s, 5);
    await cancelUntilOpen(`${s} s13`, r5);
    await tx(`${s}: parked r5 re-limits across the mid`, r5, m.cid, `set-token-${s}-limit`, [uintCV(L(s, 1500)), noneCV()], '(ok true)');
    m.lim.set(r5, ord(L(s, 1500)));
    const o = other(s), K = mk(s === 'y' ? 7900 : 8900), kAmt = 2n * U[o], kLim = (o === 'x' ? mid * 900n / 1000n : mid * 1100n / 1000n);
    await fund(o, K, kAmt);
    await tx(`${s}: K submits a ${o} order at the mid side (pending)`, K, m.cid, `deposit-token-${o}`, depArgs(o, kAmt, kLim, null), `(ok u${kAmt})`);
    await tx(`${s}: settle K (nothing to cross on ${s})`, keeper, m.cid, `settle-token-${o}-deposit`, [P_(K), upd, T[o], A[o]], `(ok u${kAmt})`);
    m.opp.list.push(K); m.opp.live.set(K, kAmt); m.opp.lim.set(K, ord(kLim));
    await ev(`${s}: K on the ${o} book`, m.cid, `(get-token-${o}-deposit ${cyc} '${K})`, `u${kAmt}`);
    await tx(`${s}: readmit r5`, keeper, m.cid, `readmit-token-${s}`, [P_(r5)], `(ok u${m.parked.get(r5)})`);
    r = await tx(`${s}: settle readmit r5 -> crossing`, keeper, m.cid, `settle-token-${s}-readmit`, [P_(r5), upd], '(ok u0)');
    evt(`${s}: refused crossing print`, r, `settle-refused-${s}`, { depositor: r5, action: '"readmit"', reason: '"crossing"', amount: `u${m.parked.get(r5)}` });
    await verifyBook(`${s} after crossing refusal`, m);
  }
  // pegged guards: spread >= 100% (only reachable through the read-only)
  await tx('probe: spread 10000 -> bid 0, ask MAX (cap/floor 1)', DEP, `${DEP}.fullside-probe`, 'peg', [uintCV(mid), uintCV(10000), uintCV(1)], `(ok (list u0 u${MAXU}))`);
  await tx('probe: spread 500 within cap/floor', DEP, `${DEP}.fullside-probe`, 'peg', [uintCV(1000000), uintCV(500), uintCV(1000000)], '(ok (list u950000 u1050000))');
  // s14: max-band raised; each market picks it up only on its own sync
  await tx('max band 5 (fork-global)', DEP, LADDER, 'set-max-band-per-side', [uintCV(5)], '(ok true)');
  for (const s of ['y', 'x']) {
    const m = book[s], who = N(s, 98);
    const before = sideFull(m, who);
    await ev(`${s}: before sync still 2 seats`, m.cid, '(protected-seats)', 'u2');
    await ev(`${s}: before sync side-full ${before}`, m.cid, `(side-full-${s} (get-token-${s}-depositors ${cyc}) '${who})`, String(before));
    await tx(`${s}: sync-seat-count -> 5`, keeper, m.cid, 'sync-seat-count', [], '(ok u5)');
    m.seats = 5;
    check(`${s}: model flips to full`, `${before}->${sideFull(m, who)}`, 'false->true');
    await ev(`${s}: after sync side-full true`, m.cid, `(side-full-${s} (get-token-${s}-depositors ${cyc}) '${who})`, 'true');
    await ev(`${s}b: bump market untouched (still 45)`, bbook[s].cid, '(protected-seats)', 'u45');
  }
  // b1-b3: nobody parkable
  for (const s of ['y', 'x']) {
    const m = bbook[s];
    console.log(`\n===== ${s} side: fullside-${s}b =====`);
    await verifyBook(`${s}b setup`, m);
    await newcomer(`${s}B1 crossing newcomer, nobody parkable`, m, mk((s === 'y' ? 7500 : 8500) + 1), 5n * U[s], ord(L(s, 1500)), { label: 'none-parkable/core-bump', victim: 'b2' });
    await newcomer(`${s}B2 crossing newcomer == smallest`, m, mk((s === 'y' ? 7500 : 8500) + 2), 3n * U[s], ord(L(s, 1500)), { label: 'none-parkable/core-full' });
    await newcomer(`${s}B3 non-crossing newcomer, nothing outside`, m, mk((s === 'y' ? 7500 : 8500) + 3), 10n * U[s], ord(L(s, 500)), { label: 'far-none' });
  }
}

try { await main(); } catch (e) { console.error(e.stack || e); failures++; failed.push(String(e.message ?? e)); }
console.log(`\n${passed}/${checks} checks green${failures ? ` FAIL (${failed.slice(0, 8).join('; ')})` : ''}`);
if (sid) console.log(`sim ${sid} https://stxer.xyz/simulations/mainnet/${sid}`);
if (failures) process.exitCode = 1;
