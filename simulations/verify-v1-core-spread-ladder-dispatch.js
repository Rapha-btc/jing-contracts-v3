// Fork only. Run: node simulations/verify-v1-core-spread-ladder-dispatch.js
// End-to-end system scenario for the two deploy-scope rungs,
// jing-buy-stx-core-spread-v1 and jing-sell-stx-core-spread-v1, used through
// jing-ladder-dispatch, next to markets-sbtc-stx-jing-v6-3, jing-core-v6 and
// jing-ladder-v1. Every contract is deployed from the unmodified working tree
// (sha256 of the six recorded at start and end). No storage writes, no mock
// prices: fills are real market swaps priced by one signed Lazer update.
//
//  1. ten buy rungs (jing-buy-stx-spread-0 .. -90) and ten sell rungs
//     (jing-sell-stx-spread-0 .. -90), seated through initialize; the
//     ladder's max-band-per-side (10) is enough, an 11th seat is refused
//  2. A: one deposit-buy across all ten buy rungs, weighted 1x..10x; C: a
//     smaller batch on four of them. B: one deposit-sell across all ten sell
//     rungs; D: a smaller batch on four. Buy rungs rest directly (empty
//     opposite side); sell rungs go pending, a keeper settles them (the 0 bps
//     sell bid crosses the 0 bps buy ask and is refunded to the rung: held)
//  3. an STX taker swaps through the buy book: buy-0 clears in the mid batch,
//     buy-10/20/30 fill in the walk at their own ask, buy-40 partially; the
//     keeper pushes and settles sell-0 (no longer crossing); an sBTC taker
//     swaps through the sell book the same way. A BigInt market model predicts
//     every batch / walk amount, fee, rebate and the taker's receipt; a BigInt
//     rung model (the one of verify-v1-core-spread-rungs.js) predicts every
//     rung's sync, proceeds index, per-member split and unfilled index
//  4. exits through withdraw-buy / withdraw-sell: A full across all ten, B
//     partial across four, D mixed (filled + unfilled), then everyone drains
//  5. after every fund-moving step: every rung's state, market position and
//     balances exact against the model; every wallet exact; market custody
//     equals the book; sum of members' positions <= pooled <= backing;
//     proceeds claims <= proceeds balance; old-epoch backs <= reserve; the
//     dispatch holds nothing; conservation per asset (in - out = held + fees)
//  6. refusals through the dispatch: wrong side (deposit u7104 / exit u7108),
//     duplicate legs (u7105), 11 legs (the (list 10) type), an intermediary
//     contract (u7106), zero / total mismatch / empty; each moves nothing
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  noneCV, someCV, boolCV, listCV, tupleCV as rawTupleCV, deserializeCV, cvToString, getAddressFromPrivateKey,
  makeUnsignedSTXTokenTransfer, makeUnsignedContractDeploy, PostConditionMode,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, submitSimulationSteps, callContract, getNonce, setSender,
} from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

const NODE = 'http://77.42.3.101/stacks-api';
const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const CORE = `${DEP}.jing-core-v6`;
const LADDER = `${DEP}.jing-ladder-v1`;
const MARKET = `${DEP}.markets-sbtc-stx-jing-v6-3`;
const DISPATCH = `${DEP}.jing-ladder-dispatch`;
const PROXY = `${DEP}.dispatch-intermediary`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALE = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR' };
const P_ = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const tupleCV = (f) => rawTupleCV(Object.fromEntries(Object.entries(f).sort(([a], [b]) => a.localeCompare(b))));
const T = { x: P_(SBTC), y: P_(WSTX) };
const A = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const src = (f) => fs.readFileSync(new URL(`../contracts/${f}.clar`, import.meta.url), 'utf8');
const S = 10n ** 12n, MINT_FLOOR = 10n ** 9n, RESCALE = 1000n, DAY = 86400n, BIG = 10n ** 15n;
const PX = 10n ** 10n; // PRICE_PRECISION * DECIMAL_FACTOR
const FEE_BPS = 10n, MIN_SHARE_BPS = 20n;
const keeper = mk(871), stranger = mk(872), TREAS = mk(880);
const UA = mk(731), UB = mk(732), UC = mk(733), UD = mk(734), TAKER_Y = mk(735), TAKER_X = mk(736);
const PEOPLE = { A: UA, B: UB, C: UC, D: UD, takerSTX: TAKER_Y, takerSBTC: TAKER_X, keeper, stranger };
const USERS = [UA, UB, UC, UD, TAKER_Y, TAKER_X, keeper, stranger];
const SIX = ['jing-buy-stx-core-spread-v1', 'jing-sell-stx-core-spread-v1', 'jing-ladder-dispatch', 'markets-sbtc-stx-jing-v6-3', 'jing-core-v6', 'jing-ladder-v1'];
const sha = () => Object.fromEntries(SIX.map((f) => [f, crypto.createHash('sha256').update(src(f)).digest('hex')]));
const BLOCK = { runtime: 5_000_000_000, read_count: 15_000, read_length: 100_000_000, write_count: 15_000, write_length: 15_000_000 };
const costs = [];

// ------------------------------------------------------------ harness ----
class CErr extends Error { constructor(code) { super(`clarity err u${code}`); this.code = BigInt(code); } }
function plain(c) {
  switch (c.type) {
    case 'uint': case 'int': return BigInt(c.value);
    case 'true': return true; case 'false': return false;
    case 'none': return null; case 'some': return plain(c.value);
    case 'ok': return { ok: plain(c.value) }; case 'err': return { err: plain(c.value) };
    case 'tuple': return Object.fromEntries(Object.entries(c.value).map(([k, v]) => [k, plain(v)]));
    case 'list': return c.value.map(plain);
    default: return c.value;
  }
}
const show = (v) => JSON.stringify(v, (k, x) => typeof x === 'bigint' ? `u${x}` : x);
function eq(a, b) {
  if (typeof a === 'bigint' || typeof b === 'bigint') return typeof a === typeof b && a === b;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => eq(a[k], b[k]));
}
function diff(got, want, path = '') {
  const out = [];
  if (want !== null && typeof want === 'object' && !Array.isArray(want)) {
    for (const k of Object.keys(want)) out.push(...diff(got?.[k], want[k], `${path}.${k}`));
  } else if (Array.isArray(want)) {
    if (!Array.isArray(got) || got.length !== want.length) out.push(`${path}: got ${show(got)} want ${show(want)}`);
    else want.forEach((w, i) => out.push(...diff(got[i], w, `${path}[${i}]`)));
  } else if (!eq(got, want)) out.push(`${path}: got ${show(got)} want ${show(want)}`);
  return out;
}
let passed = 0, checks = 0, sid, stepNo = 0;
const failed = [];
function check(label, ok, detail = '') {
  checks++;
  if (ok) passed++; else failed.push(label);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${checks}. ${label}${detail ? `: ${String(detail).slice(0, 1200)}` : ''}`);
  if (!ok) throw new Error(`STOP at check ${checks} (${label}): https://stxer.xyz/simulations/mainnet/${sid}`);
  return ok;
}
async function retry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const m = String(e?.message ?? e);
      if (i < 8 && /ECONNRESET|fetch failed|socket hang|timed? ?out|HTTP 50[0234]\b|\b(502|503|504|429)\b(?!,)|ETIMEDOUT|EAI_AGAIN|UND_ERR/i.test(m)) { console.log(`  retry after: ${m.slice(0, 120)}`); await new Promise((r) => setTimeout(r, 5000 * (i + 1))); continue; }
      throw e;
    }
  }
}
// many read-only evals in one request: [[cid, code], ...] -> plain values
async function evalMany(items) {
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ TenureExtend: { cause: 'Extended' } }, ...items.map(([cid, code]) => ({ Eval: [DEP, '', cid, code] }))] }));
  return items.map(([cid, code], i) => {
    const r = out.steps[i + 1];
    if (!r?.Eval || !('Ok' in r.Eval)) throw new Error(`eval failed in ${cid}: ${JSON.stringify(r).slice(0, 300)} :: ${code.slice(0, 200)}`);
    return plain(deserializeCV(r.Eval.Ok));
  });
}
const evalIn = async (cid, code) => (await evalMany([[cid, code]]))[0];
function noteCost(label, receipt) {
  const ec = receipt?.execution_cost; if (!ec) return;
  const pct = Object.fromEntries(Object.keys(BLOCK).map((k) => [k, (100 * Number(ec[k]) / BLOCK[k]).toFixed(1)]));
  costs.push({ label, ...pct, txid: receipt.txid });
  console.log(`  cost ${label}: runtime ${pct.runtime}% read_count ${pct.read_count}% read_length ${pct.read_length}% write_count ${pct.write_count}% write_length ${pct.write_length}% of a block`);
}
async function send(sender, cid, fn, args) {
  await retry(() => submitSimulationSteps(sid, { steps: [{ TenureExtend: { cause: 'Extended' } }] }));
  const r = await retry(() => callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 }));
  if (r.vmError || r.pcAborted) throw new Error(`ENGINE ${cid}.${fn}: ${JSON.stringify({ vm: r.vmError, pc: r.pcAborted }).slice(0, 400)} https://stxer.xyz/simulations/mainnet/${sid}`);
  return { res: plain(deserializeCV(r.resultHex)), receipt: r.receipt, txid: r.receipt?.txid };
}
async function txExpect(label, sender, cid, fn, args, want) {
  const r = await send(sender, cid, fn, args);
  check(label, typeof want === 'function' ? want(r.res) : eq(r.res, want), show(r.res));
  return r;
}
async function stxTransfer(from, to, amount) {
  const raw = await makeUnsignedSTXTokenTransfer({ recipient: to, amount, nonce: await retry(() => getNonce(sid, from)), network: 'mainnet', publicKey: '', fee: 0 });
  setSender(raw, from);
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] }));
  const t = out.steps[0]?.Transaction?.Ok;
  check(`stx transfer ${amount} -> ${to.slice(0, 10)}`, t && !t.vm_error && cvToString(deserializeCV(t.result)) === '(ok true)', JSON.stringify(out.steps[0]).slice(0, 200));
}
async function sbtcTransfer(from, to, amount) {
  await txExpect(`sbtc transfer ${amount} -> ${to.slice(0, 10)}`, from, SBTC, 'transfer', [uintCV(amount), P_(from), P_(to), noneCV()], { ok: true });
}
async function deploy(name, code) {
  const raw = await makeUnsignedContractDeploy({ contractName: name, codeBody: code, clarityVersion: ClarityVersion.Clarity5, nonce: await retry(() => getNonce(sid, DEP)), network: 'mainnet', publicKey: '', fee: 0, postConditionMode: PostConditionMode.Allow });
  setSender(raw, DEP);
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] }));
  const t = out.steps[0]?.Transaction?.Ok;
  check(`deploy ${name}`, t && !t.vm_error && cvToString(deserializeCV(t.result)).startsWith('(ok'), JSON.stringify(out.steps[0]).slice(0, 300));
}
const events = (receipt) => (receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e).filter((e) => e.committed !== false && e.contract_event);
function prints(receipt, ids) {
  return events(receipt).filter((e) => ids.includes(e.contract_event.contract_identifier))
    .map((e) => plain(deserializeCV(e.contract_event.raw_value)))
    .filter((p) => typeof p?.event === 'string' && p.event.startsWith('rung-'));
}
const corePrints = (receipt, name) => events(receipt).filter((e) => e.contract_event.contract_identifier === CORE)
  .map((e) => plain(deserializeCV(e.contract_event.raw_value))).filter((p) => p?.event === name);

// ------------------------------------------------------ global wallets ---
// every tracked principal's sBTC / STX as the model predicts it
const W = new Map();
const wal = (who) => { if (!W.has(who)) W.set(who, { sbtc: 0n, stx: 0n }); return W.get(who); };
const USERSET = new Set([UA, UB, UC, UD, TAKER_Y, TAKER_X]);
const FLOW = { sbtc: { in: 0n, out: 0n }, stx: { in: 0n, out: 0n } };
const FEES = { sbtc: 0n, stx: 0n };
function credit(who, asset, amt) { if (amt === 0n) return; wal(who)[asset] += amt; if (USERSET.has(who)) FLOW[asset].out += amt; }
function debit(who, asset, amt) { if (amt === 0n) return; if (wal(who)[asset] < amt) throw new Error(`model: ${who} short of ${asset}`); wal(who)[asset] -= amt; if (USERSET.has(who)) FLOW[asset].in += amt; }

// ------------------------------------------------------------- rungs -----
function rungCfg(dir, bps) {
  const buy = dir === 'buy';
  return {
    dir, buy, bps: BigInt(bps), name: `jing-${dir}-stx-spread-${bps}`, id: `${DEP}.jing-${dir}-stx-spread-${bps}`,
    file: `jing-${dir}-stx-core-spread-v1`, side: buy ? 'x' : 'y', opp: buy ? 'y' : 'x', band: buy ? 'buy-band' : 'sel-band',
    heldVar: buy ? 'held-sats' : 'held-ustx', resVar: buy ? 'reserved-sats' : 'reserved-ustx', accVar: buy ? 'stx-accounted' : 'sats-accounted',
    guardVar: buy ? 'floor' : 'cap', pKey: buy ? 'sbtc' : 'stx', qKey: buy ? 'stx' : 'sbtc',
    ppl: new Set(), MIN_DEPOSIT: buy ? 100n : 100000n, DUST: buy ? 10n : 10000n, min: buy ? 1000n : 1000000n,
  };
}
const pBal = (r, who) => r.buy ? `(unwrap-panic (contract-call? '${SBTC} get-balance '${who}))` : `(stx-get-balance '${who})`;
const qBal = (r, who) => r.buy ? `(stx-get-balance '${who})` : `(unwrap-panic (contract-call? '${SBTC} get-balance '${who}))`;
const msize = (m) => m.live + m.parked + m.pend;
const onBook = (m) => m.live + m.parked;

// The rung model of verify-v1-core-spread-rungs.js, with one wallet book
// shared by every rung (a member sits in many rungs here).
class Model {
  constructor(r) {
    this.r = r;
    this.m = { ts: 0n, mem: 0n, sc: 0n, ui: S, pi: 0n, held: 0n, res: 0n, acc: 0n, ep: 0n, cat: 0n, paused: false, guard: 0n, init: false,
      scaleStart: new Map(), finalP: new Map(), finalU: new Map(), finalS: new Map(), eres: new Map(), pos: new Map(),
      live: 0n, parked: 0n, pend: 0n, pendAt: 0n, pbal: 0n, qbal: 0n, now: 0n, opp: 0n, mm: 0n, marketPaused: false };
  }
  carried(sh, from, to) { const d = to - from; return d > 3n ? 0n : sh / RESCALE ** d; }
  earned(sh, from, to, paid, upto) {
    const m = this.m; let owed = 0n;
    for (let step = 0n; step <= 3n; step++) {
      const j = from + step;
      if (j > to) continue;
      const segStart = step === 0n ? paid : (m.scaleStart.get(j) ?? 0n);
      const segEnd = j === to ? upto : (m.scaleStart.get(j + 1n) ?? 0n);
      if (segEnd < segStart) throw new Error('model: earned underflow');
      owed += sh * (segEnd - segStart) / (S * RESCALE ** step);
    }
    return owed;
  }
  finalScale(e) { return this.m.finalS.get(e) ?? this.m.sc; }
  finalIndex(e) { return this.m.finalP.get(e) ?? this.m.pi; }
  finalUnfilled(e) { return this.m.finalU.get(e) ?? 0n; }
  getPosition(who) {
    const m = this.m, p = m.pos.get(who), r = this.r;
    if (!p) return { shares: 0n, [r.pKey]: 0n, [r.qKey]: 0n };
    const cur = p.epoch === m.ep, to = cur ? m.sc : this.finalScale(p.epoch);
    const sh = this.carried(p.shares, p.scale, to);
    return { shares: sh, [r.pKey]: sh * (cur ? m.ui : this.finalUnfilled(p.epoch)) / S, [r.qKey]: this.earned(p.shares, p.scale, to, p.paid, cur ? m.pi : this.finalIndex(p.epoch)) };
  }
  sync(ev) {
    const m = this.m, r = this.r;
    if (!m.init) throw new CErr(7003);
    const shares = m.ts, local = m.pbal - m.res, actual = msize(m) + local, recorded = shares * m.ui / S, gained = m.qbal - m.acc;
    if (local < 0n || gained < 0n) throw new Error('model: sync underflow');
    m.held = local;
    if (shares === 0n) return;
    const ni = (actual < recorded && recorded > 0n) ? m.ui * actual / recorded : m.ui;
    const np = gained > 0n ? m.pi + gained * S / shares : m.pi;
    m.pi = np; m.acc = m.qbal;
    if (actual < r.DUST || ni < MINT_FLOOR / RESCALE) { m.ui = ni; this.rollTail(ev, actual < r.DUST ? 'dust' : 'index'); }
    else if (ni < MINT_FLOOR) {
      const next = m.sc + 1n;
      m.ui = ni * RESCALE; m.ts = shares / RESCALE; m.sc = next; m.scaleStart.set(next, np);
      ev.push({ event: 'rung-rescale', epoch: m.ep, scale: next, 'proceeds-index': np, 'unfilled-index': m.ui, 'total-shares': m.ts });
    } else m.ui = ni;
  }
  rollTail(ev, why) {
    const m = this.m, epo = m.ep;
    const hadMarket = msize(m) > 0n;
    if (hadMarket) { m.pbal += msize(m); m.live = 0n; m.parked = 0n; m.pend = 0n; m.pendAt = 0n; }
    const free = m.pbal - m.res, owed = m.ts * m.ui / S, reserve = owed < free ? owed : free;
    m.finalP.set(epo, m.pi); m.finalU.set(epo, m.ui); m.finalS.set(epo, m.sc);
    m.res += reserve; m.held = free - reserve;
    m.eres.set(epo, { left: m.mem, reserve });
    ev.push({ event: 'rung-epoch-closed', epoch: epo, 'final-proceeds-index': m.pi });
    this.lastRoll = { epoch: epo, why, hadMarket, owed, free, reserve, members: m.mem, ui: m.ui };
    m.ep = epo + 1n; m.ts = 0n; m.mem = 0n; m.ui = S;
  }
  countReserveClaim(e, back) {
    const m = this.m, rr = m.eres.get(e);
    if (!rr) return;
    const rest = back > rr.reserve ? 0n : rr.reserve - back;
    if (rr.left <= 1n) { m.eres.delete(e); m.res -= rest; m.held += rest; this.lastRelease = { epoch: e, rest }; }
    else m.eres.set(e, { left: rr.left - 1n, reserve: rest });
  }
  settle(who, ev) {
    const m = this.m, r = this.r, pos = m.pos.get(who);
    if (!pos) return { owed: 0n, back: 0n };
    const cur = pos.epoch === m.ep, to = cur ? m.sc : this.finalScale(pos.epoch), upto = cur ? m.pi : this.finalIndex(pos.epoch);
    const owed = this.earned(pos.shares, pos.scale, to, pos.paid, upto), cs = this.carried(pos.shares, pos.scale, to);
    const back = cur ? 0n : cs * this.finalUnfilled(pos.epoch) / S;
    if (owed > 0n) { m.qbal -= owed; credit(who, r.qKey, owed); }
    m.acc -= owed;
    if (back > 0n) { m.pbal -= back; credit(who, r.pKey, back); }
    m.res -= back;
    if (m.acc < 0n || m.res < 0n || m.qbal < 0n || m.pbal < 0n) throw new Error('model: settle underflow');
    if (!cur) this.countReserveClaim(pos.epoch, back);
    if (cur) m.pos.set(who, { ...pos, scale: to, shares: cs, paid: upto }); else m.pos.delete(who);
    if (owed > 0n || back > 0n) ev.push({ event: 'rung-payout', member: who, proceeds: owed, back, epoch: pos.epoch });
    return { owed, back };
  }
  paidTuple(p) { return this.r.buy ? { stx: p.owed, sbtc: p.back } : { sbtc: p.owed, stx: p.back }; }
  pushToMarket(amount) {
    const m = this.m, r = this.r;
    if (m.paused) return 7014n;
    if (m.now < m.cat + DAY) return 7015n;
    const g = r.buy ? m.mm / 2n : m.mm * 2n;
    if (g === 0n) return 7008n;
    m.guard = g;
    if (m.marketPaused) return 1007n;
    if (m.pend > 0n) return 1031n;
    m.pbal -= amount;
    if (m.opp > 0n) { m.pend = amount; m.pendAt = m.now; return 'pending'; }
    m.live += amount + m.parked; m.parked = 0n; return 'direct';
  }
  deposit(who, amount, ev) {
    const m = this.m, r = this.r;
    if (!m.init) throw new CErr(7003);
    if (amount < r.MIN_DEPOSIT) throw new CErr(7005);
    this.sync(ev);
    const paid = this.settle(who, ev);
    if (wal(who)[r.pKey] < amount) throw new CErr(1);
    debit(who, r.pKey, amount); m.pbal += amount;
    const toPush = amount + m.held;
    const orphan = m.ts === 0n ? msize(m) + m.held : 0n;
    const shares = (amount + orphan) * S / m.ui;
    const pos = m.pos.get(who) ?? { epoch: m.ep, scale: m.sc, shares: 0n, paid: m.pi };
    const joining = !m.pos.has(who), epo = m.ep;
    let outcome = 'under-min';
    if (toPush + msize(m) >= r.min) outcome = this.pushToMarket(toPush);
    m.held = (outcome === 'direct' || outcome === 'pending') ? 0n : toPush;
    this.lastPush = outcome;
    m.pos.set(who, { epoch: epo, scale: m.sc, shares: pos.shares + shares, paid: m.pi });
    m.ts += shares; if (joining) m.mem += 1n;
    ev.push({ event: 'rung-deposit', member: who, amount, shares, epoch: epo, pushed: m.held === 0n, held: m.held });
    const pt = this.paidTuple(paid);
    return { amount, shares, epoch: epo, 'stx-paid': pt.stx, 'sbtc-paid': pt.sbtc };
  }
  push(who, ev) {
    const m = this.m, r = this.r;
    if (!m.init) throw new CErr(7003);
    this.sync(ev);
    const toPush = m.held;
    let pushed = false, outcome = toPush === 0n ? 'nothing' : 'under-min';
    if (toPush > 0n && toPush + msize(m) >= r.min) { outcome = this.pushToMarket(toPush); pushed = outcome === 'direct' || outcome === 'pending'; }
    if (pushed) m.held = 0n;
    this.lastPush = outcome;
    ev.push({ event: 'rung-push', keeper: who, amount: toPush, pushed, held: m.held });
    return pushed;
  }
  settleEscrow(update) {
    const m = this.m;
    if (m.pend === 0n) return 'none';
    if (m.now >= m.pendAt + DAY) {
      const refunded = msize(m);
      m.pbal += refunded; m.live = 0n; m.parked = 0n; m.pend = 0n; m.pendAt = 0n;
      m.held += refunded; m.cat = m.now; return 'cancel';
    }
    if (!update) throw new CErr(7012);
    if (m.marketPaused) throw new CErr(1007);
    m.live += m.pend + m.parked; m.parked = 0n; m.pend = 0n; m.pendAt = 0n; return 'settle';
  }
  pullToHeld(amount) {
    const m = this.m, r = this.r, have = m.held;
    if (have >= amount) return 'held';
    const gap = amount - have, onm = onBook(m);
    if (onm < gap) throw new CErr(7007);
    if (onm - gap >= r.min) {
      if (m.live > 0n) m.live -= gap; else m.parked -= gap;
      m.pbal += gap; m.held = have + gap; return 'partial';
    }
    const refunded = msize(m);
    m.pbal += refunded; m.live = 0n; m.parked = 0n; m.pend = 0n; m.pendAt = 0n; m.held = have + refunded; return 'cancel';
  }
  withdraw(who, amount, update, ev) {
    const m = this.m, r = this.r;
    if (!m.pos.has(who)) throw new CErr(7006);
    if (amount === 0n) throw new CErr(7004);
    this.sync(ev);
    const paid = this.settle(who, ev);
    this.lastExit = { escrow: 'no', pull: 'none', full: false, take: 0n, close: false, old: false };
    if (!m.pos.has(who)) { this.lastExit.old = true; return this.paidTuple(paid); }
    const fi = m.ui, ms = m.pos.get(who).shares, mine = ms * fi / S, partial = (amount * S + fi - 1n) / fi;
    const byRest = !(amount >= mine) && (ms - partial) * fi / S === 0n;
    const full = amount >= mine || byRest;
    const sharesOut = full ? ms : partial, take = full ? mine : amount, epo = m.ep;
    Object.assign(this.lastExit, { full, take });
    if (take > 0n) {
      if (take > m.held + onBook(m)) { this.lastExit.escrow = this.settleEscrow(update); this.sync(ev); }
      this.lastExit.pull = this.pullToHeld(take);
      m.pbal -= take; credit(who, r.pKey, take); m.held -= take;
    }
    if (full) m.pos.delete(who); else m.pos.set(who, { epoch: epo, scale: m.sc, shares: ms - sharesOut, paid: m.pi });
    m.ts -= sharesOut;
    if (full) m.mem -= 1n;
    if (m.mem === 0n) {
      this.lastExit.close = true;
      m.finalP.set(epo, m.pi); m.finalS.set(epo, m.sc);
      ev.push({ event: 'rung-epoch-closed', epoch: epo, 'final-proceeds-index': m.pi });
      m.ep = epo + 1n; m.ts = 0n; m.ui = S;
    }
    ev.push({ event: 'rung-withdraw', member: who, amount: take, shares: sharesOut, epoch: epo, held: m.held });
    return r.buy ? { stx: paid.owed, sbtc: take } : { stx: take, sbtc: paid.owed };
  }
}

// ------------------------------------------------------- snapshots -------
function snapCode(r, mdl) {
  const m = mdl.m, M = `'${MARKET}`, ppl = [...r.ppl];
  const L = (xs) => xs.length ? `(list ${xs.join(' ')})` : '(list)';
  const eps = [...Array(Number(m.ep)).keys()];
  return `{ ts: (var-get total-shares), mem: (var-get members), sc: (var-get scale), ui: (var-get unfilled-index), pi: (var-get proceeds-index),
    held: (var-get ${r.heldVar}), res: (var-get ${r.resVar}), acc: (var-get ${r.accVar}), ep: (var-get epoch), cat: (var-get escrow-cancelled-at),
    paused: (var-get push-paused), guard: (var-get ${r.guardVar}), init: (var-get initialized),
    live: (contract-call? ${M} get-token-${r.side}-deposit (contract-call? ${M} get-current-cycle) '${r.id}),
    parked: (contract-call? ${M} get-token-${r.side}-parked '${r.id}),
    pend: (contract-call? ${M} get-token-${r.side}-pending-deposit '${r.id}),
    opp: (len (contract-call? ${M} get-token-${r.opp}-depositors (contract-call? ${M} get-current-cycle))),
    pbal: ${pBal(r, r.id)}, qbal: ${qBal(r, r.id)}, now: stacks-block-time, mm: (miner-mid),
    pos: ${L(ppl.map((p) => `(map-get? positions '${p})`))},
    gp: ${L(ppl.map((p) => `(get-position '${p})`))},
    ss: ${L([...Array(Number(m.sc)).keys()].map((k) => `(map-get? scale-start u${k + 1})`))},
    fp: ${L(eps.map((e) => `(map-get? epoch-final-proceeds u${e})`))},
    fu: ${L(eps.map((e) => `(map-get? epoch-final-unfilled u${e})`))},
    fs: ${L(eps.map((e) => `(map-get? epoch-final-scale u${e})`))},
    er: ${L(eps.map((e) => `(map-get? epoch-reserve u${e})`))} }`;
}
function modelView(r, mdl) {
  const m = mdl.m, ppl = [...r.ppl], eps = [...Array(Number(m.ep)).keys()].map(BigInt);
  return {
    ts: m.ts, mem: m.mem, sc: m.sc, ui: m.ui, pi: m.pi, held: m.held, res: m.res, acc: m.acc, ep: m.ep, cat: m.cat, paused: m.paused, guard: m.guard, init: m.init,
    live: m.live, parked: m.parked, pbal: m.pbal, qbal: m.qbal,
    pos: ppl.map((p) => { const x = m.pos.get(p); return x ? { epoch: x.epoch, scale: x.scale, shares: x.shares, 'paid-index': x.paid } : null; }),
    gp: ppl.map((p) => mdl.getPosition(p)),
    ss: [...Array(Number(m.sc)).keys()].map((k) => m.scaleStart.get(BigInt(k + 1)) ?? null),
    fp: eps.map((e) => m.finalP.get(e) ?? null), fu: eps.map((e) => m.finalU.get(e) ?? null), fs: eps.map((e) => m.finalS.get(e) ?? null),
    er: eps.map((e) => m.eres.get(e) ?? null),
  };
}
function absorb(mdl, o) {
  const m = mdl.m;
  m.live = o.live; m.parked = o.parked; m.pend = o.pend ? o.pend.amount : 0n; m.pendAt = o.pend ? o.pend['submitted-at'] : 0n;
  m.pbal = o.pbal; m.qbal = o.qbal; m.now = o.now; m.opp = o.opp; m.mm = o.mm;
}

// ----------------------------------------------------------- the book ----
const SPREADS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
const BUY = SPREADS.map((s) => rungCfg('buy', s)), SELL = SPREADS.map((s) => rungCfg('sell', s));
const ALL = [...BUY, ...SELL];
const MD = new Map(ALL.map((r) => [r.id, new Model(r)]));
const md = (r) => MD.get(r.id);
const TRACKED = [...USERS, TREAS, DISPATCH, PROXY];
let BASE = null; // treasury balances at the baseline
let MID = 0n, UPD, UPD_AT = 0n;
const upd = () => bufferCV(Buffer.from(UPD.hex.replace(/^0x/, ''), 'hex'));

// Every rung exact (state, market position, balances), every wallet exact,
// custody = book, the position / proceeds / reserve bounds, the dispatch
// holds nothing, conservation per asset.
async function checkpoint(label, { external = false } = {}) {
  const items = ALL.map((r) => [r.id, snapCode(r, md(r))]);
  items.push([MARKET, `{ sb: (unwrap-panic (contract-call? '${SBTC} get-balance current-contract)), st: (stx-get-balance current-contract),
    tot: (get-cycle-totals (var-get current-cycle)), prx: (var-get pending-rebate-x), pry: (var-get pending-rebate-y) }`]);
  items.push([MARKET, `(list ${TRACKED.map((p) => `{ sbtc: (unwrap-panic (contract-call? '${SBTC} get-balance '${p})), stx: (stx-get-balance '${p}) }`).join(' ')})`]);
  const res = await evalMany(items);
  const mk_ = res[ALL.length], wl = res[ALL.length + 1];
  const bad = [];
  for (const [i, r] of ALL.entries()) {
    const o = res[i], mdl = md(r), want = modelView(r, mdl);
    if (external) for (const k of ['live', 'parked', 'pbal', 'qbal']) delete want[k];
    else {
      const pa = o.pend ? o.pend.amount : 0n;
      if (pa !== mdl.m.pend) bad.push(`${r.name} pending ${pa} model ${mdl.m.pend}`);
    }
    const d = diff(o, want);
    if (d.length) bad.push(`${r.name} ${d.join(' | ')}`);
    absorb(mdl, o);
  }
  check(`${label}: all 20 rungs exact (vars, positions, get-position, epochs${external ? '' : ', market position, balances'})`, bad.length === 0, bad.join(' || ') || 'ok');
  const wbad = [];
  TRACKED.forEach((p, i) => {
    if (p === TREAS && BASE) { if (wl[i].sbtc - BASE.sbtc !== FEES.sbtc || wl[i].stx - BASE.stx !== FEES.stx) wbad.push(`treasury +${wl[i].sbtc - BASE.sbtc} sats +${wl[i].stx - BASE.stx} uSTX, model fees ${FEES.sbtc} / ${FEES.stx}`); return; }
    if (W.has(p) && !eq(wl[i], W.get(p))) wbad.push(`${p.slice(0, 8)} got ${show(wl[i])} want ${show(W.get(p))}`);
  });
  const dz = TRACKED.indexOf(DISPATCH), pz = TRACKED.indexOf(PROXY);
  check(`${label}: every wallet exact; treasury got exactly the modelled fees (${FEES.sbtc} sats, ${FEES.stx} uSTX); dispatch and intermediary hold 0`,
    wbad.length === 0 && wl[dz].sbtc === 0n && wl[dz].stx === 0n && wl[pz].sbtc === 0n && wl[pz].stx === 0n, wbad.join(' | ') || `dispatch ${show(wl[dz])}`);
  // custody = the book (only rungs rest on this market outside a swap)
  const sum = (rs, f) => rs.reduce((a, r) => a + f(md(r).m), 0n);
  const bx = sum(BUY, msize), by = sum(SELL, msize), lx = sum(BUY, (m) => m.live), ly = sum(SELL, (m) => m.live);
  check(`${label}: market custody = the book (sBTC ${mk_.sb} = buy rungs live+parked+pending ${bx}; STX ${mk_.st} = sell rungs ${by}; cycle totals = live)`,
    mk_.sb === bx && mk_.st === by && mk_.tot['total-token-x'] === lx && mk_.tot['total-token-y'] === ly && mk_.prx === 0n && mk_.pry === 0n, show(mk_));
  // bounds per rung
  const ib = [];
  for (const [i, r] of ALL.entries()) {
    const m = md(r).m, o = res[i], ppl = [...r.ppl];
    let curP = 0n, allQ = 0n, backs = 0n;
    ppl.forEach((p, k) => {
      const pos = m.pos.get(p); if (!pos) return;
      const g = o.gp[k];
      allQ += g[r.qKey];
      if (pos.epoch === m.ep) curP += g[r.pKey]; else backs += g[r.pKey];
    });
    // backing: what the rung really has for the pool (market + balance less reserve); pooled <= backing
    // once synced (after a fill and before its sync the indices still show the pre-fill pool)
    const pooled = m.ts * m.ui / S, backing = m.pbal - m.res + msize(m), synced = m.qbal === m.acc;
    if (!(curP <= pooled && (!synced || pooled <= backing))) ib.push(`${r.name} members ${curP} pooled ${pooled} backing ${backing}`);
    if (!(allQ <= m.qbal)) ib.push(`${r.name} proceeds claims ${allQ} > balance ${m.qbal}`);
    if (!(backs <= m.res)) ib.push(`${r.name} old-epoch backs ${backs} > reserve ${m.res}`);
    if (m.pbal < m.held + m.res) ib.push(`${r.name} balance ${m.pbal} < held ${m.held} + reserved ${m.res}`);
  }
  check(`${label}: per rung, sum of members' get-position <= pooled (<= backing once synced); proceeds claims <= proceeds balance; old-epoch backs <= reserve; balance >= held + reserved`, ib.length === 0, ib.join(' | ') || 'ok');
  // conservation: in - out = held (rungs + market) + fees
  if (BASE) {
    const heldS = BUY.reduce((a, r) => a + md(r).m.pbal, 0n) + SELL.reduce((a, r) => a + md(r).m.qbal, 0n) + mk_.sb;
    const heldT = SELL.reduce((a, r) => a + md(r).m.pbal, 0n) + BUY.reduce((a, r) => a + md(r).m.qbal, 0n) + mk_.st;
    const okS = FLOW.sbtc.in - FLOW.sbtc.out === heldS + FEES.sbtc, okT = FLOW.stx.in - FLOW.stx.out === heldT + FEES.stx;
    check(`${label}: conservation sBTC in ${FLOW.sbtc.in} - out ${FLOW.sbtc.out} = held ${heldS} + fees ${FEES.sbtc}; STX in ${FLOW.stx.in} - out ${FLOW.stx.out} = held ${heldT} + fees ${FEES.stx}`, okS && okT);
  }
  return res;
}

// ------------------------------------------------------- dispatch --------
const entries = (legs) => listCV(legs.map(({ r, amt }) => tupleCV({ rung: P_(r.id), amount: uintCV(amt) })));
function snapshotModels() { return { models: ALL.map((r) => structuredClone(md(r).m)), W: structuredClone([...W]), FLOW: structuredClone(FLOW) }; }
function restoreModels(s) {
  ALL.forEach((r, i) => { const m = md(r).m; for (const k of Object.keys(m)) delete m[k]; Object.assign(m, s.models[i]); });
  W.clear(); for (const [k, v] of s.W) W.set(k, v);
  Object.assign(FLOW.sbtc, s.FLOW.sbtc); Object.assign(FLOW.stx, s.FLOW.stx);
}
function checkPrints(label, receipt, expected) {
  const got = prints(receipt, [LADDER]);
  const pd = got.length === expected.length ? expected.flatMap((e, i) => diff(got[i], e, `[${i}]`)) : [`count ${got.length} vs ${expected.length}: ${got.map((g) => g.event).join(',')} vs ${expected.map((g) => g.event).join(',')}`];
  check(`${label}: ladder prints of every leg, in order (${expected.length})`, pd.length === 0, pd.join(' | '));
}
function dispatchPrint(receipt) {
  return events(receipt).filter((e) => e.contract_event.contract_identifier === DISPATCH).map((e) => plain(deserializeCV(e.contract_event.raw_value)));
}
async function dispatchDeposit(label, who, dir, legs) {
  const buy = dir === 'buy', total = legs.reduce((a, l) => a + l.amt, 0n);
  for (const { r } of legs) r.ppl.add(who);
  const saved = snapshotModels(), ev = [], rows = [];
  let want;
  try {
    for (const { r, amt } of legs) {
      const e = [];
      const o = md(r).deposit(who, amt, e);
      ev.push(...e.map((x) => ({ ...x, rung: r.id, side: r.band, price: r.bps })));
      rows.push({ ...o, rung: r.id, outcome: md(r).lastPush });
    }
    const sum = (k) => rows.reduce((a, x) => a + x[k], 0n);
    want = { ok: { amount: total, rungs: BigInt(legs.length), 'stx-paid': sum('stx-paid'), 'sbtc-paid': sum('sbtc-paid'),
      positions: rows.map(({ outcome, ...x }) => x) } };
  } catch (e) { if (!(e instanceof CErr)) throw e; restoreModels(saved); want = { err: e.code }; ev.length = 0; }
  const t = await send(who, DISPATCH, `deposit-${dir}`, [uintCV(total), entries(legs)]);
  noteCost(`${label} (${legs.length} legs)`, t.receipt);
  check(`${label}: exact aggregate and per-rung receipts`, eq(t.res, want), `${show(t.res)}${eq(t.res, want) ? '' : ` want ${show(want)}`}`);
  checkPrints(label, t.receipt, ev);
  const dp = dispatchPrint(t.receipt);
  check(`${label}: dispatch print`, dp.length === 1 && eq(dp[0], { event: 'ladder-dispatched', member: who, buy, amount: total, rungs: BigInt(legs.length) }), show(dp));
  console.log(`  outcomes: ${rows.map((x) => `${x.rung.split('.')[1]}=${x.outcome}`).join(' ')}`);
  await checkpoint(label);
  return { t, rows };
}
async function dispatchWithdraw(label, who, dir, legs) {
  const buy = dir === 'buy', saved = snapshotModels(), ev = [], rows = [], before = { ...wal(who) };
  let want;
  try {
    for (const { r, amt } of legs) {
      const e = [];
      const o = md(r).withdraw(who, amt, false, e);
      ev.push(...e.map((x) => ({ ...x, rung: r.id, side: r.band, price: r.bps })));
      rows.push({ rung: r.id, ...o, exit: { ...md(r).lastExit } });
    }
    const sum = (k) => rows.reduce((a, x) => a + x[k], 0n);
    want = { ok: { rungs: BigInt(legs.length), withdrawn: BigInt(legs.length), stx: sum('stx'), sbtc: sum('sbtc'), positions: rows.map(({ exit, ...x }) => x) } };
  } catch (e) { if (!(e instanceof CErr)) throw e; restoreModels(saved); want = { err: e.code }; ev.length = 0; }
  const t = await send(who, DISPATCH, `withdraw-${dir}`, [entries(legs), noneCV()]);
  noteCost(`${label} (${legs.length} legs)`, t.receipt);
  check(`${label}: exact aggregate and per-rung payouts (principal + proceeds)`, eq(t.res, want), `${show(t.res)}${eq(t.res, want) ? '' : ` want ${show(want)}`}`);
  checkPrints(label, t.receipt, ev);
  const dp = dispatchPrint(t.receipt);
  check(`${label}: dispatch print`, dp.length === 1 && eq(dp[0], { event: 'ladder-withdrawn', member: who, buy, rungs: BigInt(legs.length), withdrawn: BigInt(legs.length) }), show(dp));
  if (want.ok) {
    const after = wal(who);
    check(`${label}: wallet delta = the receipt totals (+${after.sbtc - before.sbtc} sats, +${after.stx - before.stx} uSTX)`, after.sbtc - before.sbtc === want.ok.sbtc && after.stx - before.stx === want.ok.stx);
    for (const x of rows) console.log(`  ${x.rung.split('.')[1]}: stx ${x.stx} sbtc ${x.sbtc} ${x.exit.old ? 'old-epoch payout' : `${x.exit.full ? 'full' : 'partial'} pull=${x.exit.pull}${x.exit.close ? ' closes epoch' : ''}`}`);
  }
  await checkpoint(label);
  return { t, rows };
}
// a refusal: exact error, nothing moves (every rung / wallet / market exact against the unchanged model)
async function refused(label, who, cid, fn, args, code) {
  const t = await send(who, cid, fn, args);
  check(`${label} -> u${code}`, eq(t.res, { err: BigInt(code) }), show(t.res));
  await checkpoint(`${label} (nothing moved)`);
}

// ------------------------------------------------------ market model -----
const rebateBps = (age) => age <= 30n ? 20n : age >= 80n ? 70n : 20n + (age - 30n);
function grossFor(net, bps) {
  let a = net * 10000n / (10000n - bps) - 2n; if (a < net) a = net;
  while (a - a * bps / 10000n < net) a++;
  if (a - a * bps / 10000n !== net) throw new Error(`no gross for ${net}`);
  return a;
}
const askAt = (mid, s, floor) => { const p = mid * (10000n + s) / 10000n; return p >= floor ? p : null; };
const bidAt = (mid, s, cap) => { const p = mid * (10000n - s) / 10000n; return p <= cap ? p : 0n; };
// A swap through the rung book, exactly as the v6-3 market computes it:
// the taker joins the current cycle, the settlement at mid keeps only the
// makers whose price accepts mid (a 0 bps rung), clears them pro rata, rolls
// every other maker to the next cycle; the rest of the taker's input walks the
// makers at their own price, best first. takerY = true: the taker brings STX
// and takes the buy rungs' sBTC asks.
function simSwap({ takerY, gross, limit, bps, mid, makers, minX, minY }) {
  const rebate = gross * bps / 10000n, net = gross - rebate;
  const out = { rebate, net, fills: new Map(), fees: { sbtc: 0n, stx: 0n }, matches: [], batch: null };
  const fill = (id) => { if (!out.fills.has(id)) out.fills.set(id, { recv: 0n, refund: 0n, traded: 0n, how: [] }); return out.fills.get(id); };
  const live = new Map(makers.map((x) => [x.r.id, x.live]));
  // settlement: limit filter, small-share filter
  const accepts = (x) => takerY ? x.l <= mid : x.l >= mid;
  let inBatch = makers.filter((x) => x.live > 0n && accepts(x));
  const base = inBatch.reduce((a, x) => a + x.live, 0n);
  inBatch = inBatch.filter((x) => !(x.live * 10000n < base * MIN_SHARE_BPS));
  const totM = inBatch.reduce((a, x) => a + x.live, 0n);
  const totalX = takerY ? totM : net, totalY = takerY ? net : totM;
  const yValue = totalX * mid / PX, xBinding = yValue <= totalY;
  const yc = xBinding ? yValue : totalY, xc = xBinding ? totalX : totalY * PX / mid;
  const yfee = yc * FEE_BPS / 10000n, xfee = xc * FEE_BPS / 10000n;
  const rideX = takerY ? 0n : (totalX > 0n ? rebate * xc / totalX : 0n), rideY = takerY ? (totalY > 0n ? rebate * yc / totalY : 0n) : 0n;
  const xAfter = xc - xfee + rideX, yAfter = yc - yfee + rideY;
  out.fees.sbtc += xfee; out.fees.stx += yfee;
  let pendingRebate = rebate - (takerY ? rideY : rideX);
  let paidM = 0n, rolledM = 0n, refundedM = 0n;
  for (const x of inBatch) {
    const f = fill(x.r.id), recv = totM > 0n ? x.live * (takerY ? yAfter : xAfter) / totM : 0n;
    const unf = totM > 0n ? x.live * (totM - (takerY ? xc : yc)) / totM : 0n;
    const minM = takerY ? minX : minY, refund = unf > 0n && unf < minM ? unf : 0n;
    f.recv += recv; f.refund += refund; f.traded += x.live - unf; f.how.push('batch');
    paidM += recv; rolledM += unf - refund; refundedM += refund;
    live.set(x.r.id, unf - refund);
  }
  const takerBatchRecv = takerY ? net * xAfter / net : net * yAfter / net;
  const takerRoll = takerY ? net * (net - yc) / net : net * (net - xc) / net;
  // dust to the treasury
  if (takerY) {
    out.fees.stx += (yAfter - paidM) + ((totalY - yc) - takerRoll);
    out.fees.sbtc += (xAfter - takerBatchRecv) + ((totalX - xc) - (rolledM + refundedM));
  } else {
    out.fees.sbtc += (xAfter - paidM) + ((totalX - xc) - takerRoll);
    out.fees.stx += (yAfter - takerBatchRecv) + ((totalY - yc) - (rolledM + refundedM));
  }
  out.batch = { totalX, totalY, xc, yc, xfee, yfee, rideX, rideY, xBinding, takerBatchRecv, takerRoll, inBatch: inBatch.map((x) => x.r.name) };
  // walk
  let rem = takerRoll, walkRecv = 0n;
  const walkers = makers.filter((x) => (takerY ? (x.l > mid && x.l <= limit) : (x.l < mid && x.l >= limit)))
    .sort((a, b) => takerY ? (a.l < b.l ? -1 : a.l > b.l ? 1 : 0) : (a.l > b.l ? -1 : a.l < b.l ? 1 : 0));
  for (const x of walkers) {
    const mAmt = live.get(x.r.id);
    if (rem === 0n || mAmt < (takerY ? minX : minY)) continue;
    const l = x.l, f = fill(x.r.id);
    let xt, yt;
    if (takerY) { const xFromY = rem * PX / l; xt = mAmt < xFromY ? mAmt : xFromY; }
    else { const xFromY = mAmt * PX / l; xt = rem < xFromY ? rem : xFromY; }
    yt = xt * l / PX;
    if (xt === 0n || yt === 0n) continue;
    const yf = yt * FEE_BPS / 10000n, xf = xt * FEE_BPS / 10000n;
    const r0 = (takerY ? yt : xt) * bps / 10000n, reb = r0 > pendingRebate ? pendingRebate : r0;
    pendingRebate -= reb;
    out.fees.sbtc += xf; out.fees.stx += yf;
    let makerRecv, left, refund = 0n;
    if (takerY) { makerRecv = yt - yf + reb; walkRecv += xt - xf; left = mAmt - xt; if (left > 0n && left < minX) refund = left; rem -= yt; }
    else { makerRecv = xt - xf + reb; walkRecv += yt - yf; left = mAmt - yt; if (left > 0n && left < minY) refund = left; rem -= xt; }
    f.recv += makerRecv; f.refund += refund; f.traded += takerY ? xt : yt; f.how.push(`walk@${l}`);
    live.set(x.r.id, refund > 0n ? 0n : left);
    out.matches.push({ maker: x.r.id, 'x-traded': xt, 'y-traded': yt, price: l, 'maker-received': makerRecv });
  }
  out.left = pendingRebate; out.rem = rem; out.walkRecv = walkRecv; out.live = live;
  out.partialFill = rem >= (takerY ? minY : minX);
  out.result = takerY
    ? { 'token-x-received': takerBatchRecv + walkRecv, 'token-y-rolled': rem, 'token-y-received': 0n, 'token-x-rolled': 0n, 'rebate-refunded': pendingRebate }
    : { 'token-x-received': 0n, 'token-y-rolled': 0n, 'token-y-received': takerBatchRecv + walkRecv, 'token-x-rolled': rem, 'rebate-refunded': pendingRebate };
  return out;
}
// the book as the market prices it at MID, read from the chain and checked against mid +/- spread in the miner band
async function bookAt(rs, label) {
  const res = await evalMany(rs.map((r) => [MARKET, `{ l: (token-${r.side}-limit-at '${r.id} u${MID}), ord: (get-token-${r.side}-order '${r.id}) }`]));
  const bad = [];
  const out = rs.map((r, i) => {
    const m = md(r).m, o = res[i], resting = m.live > 0n;
    const want = !resting && !o.ord['set-at'] ? null : (r.buy ? askAt(MID, r.bps, m.guard) : bidAt(MID, r.bps, m.guard));
    if (resting) {
      if (!(eq(o.ord.limit, m.guard) && eq(o.ord['spread-bps'], r.bps))) bad.push(`${r.name} order ${show(o.ord)} want limit ${m.guard} spread ${r.bps}`);
      if (o.l !== want) bad.push(`${r.name} price ${o.l} want ${want}`);
      if (r.buy ? !(m.guard <= o.l) : !(o.l <= m.guard && o.l > 0n)) bad.push(`${r.name} price ${o.l} outside the miner band (guard ${m.guard})`);
    }
    return { r, l: o.l, live: m.live, ord: o.ord };
  });
  check(`${label}: every resting rung's order is mid ${r0(rs).buy ? '+' : '-'} spread (floor/cap = miner band, spread-bps as named), price inside the band`, bad.length === 0,
    bad.join(' | ') || out.filter((x) => x.live > 0n).map((x) => `${x.r.bps}:${x.l}`).join(' '));
  return out;
}
const r0 = (rs) => rs[0];

// ------------------------------------------------------------ phases -----
async function fundAll() {
  const want = { [UA]: ['x', 400_000n], [UC]: ['x', 50_000n], [TAKER_X]: ['x', 400_000n], [UB]: ['y', 1_000_000_000n], [UD]: ['y', 100_000_000n], [TAKER_Y]: ['y', 1_000_000_000n] };
  for (const [who, [side, amt]] of Object.entries(want)) {
    if (side === 'x') await sbtcTransfer(WHALE.x, who, amt); else await stxTransfer(WHALE.y, who, amt);
  }
  const wl = await evalMany([[MARKET, `(list ${TRACKED.map((p) => `{ sbtc: (unwrap-panic (contract-call? '${SBTC} get-balance '${p})), stx: (stx-get-balance '${p}) }`).join(' ')})`]]);
  TRACKED.forEach((p, i) => { W.set(p, { ...wl[0][i] }); });
  BASE = { ...W.get(TREAS) };
  W.delete(TREAS);
}

async function keeperSettle(r, want) {
  const m = md(r).m, amount = m.pend;
  const t = await send(keeper, MARKET, `settle-token-${r.side}-deposit`, [P_(r.id), upd(), T[r.side], A[r.side]]);
  check(`${r.name}: keeper settles the rung's pending ${amount}`, eq(t.res, { ok: amount }), show(t.res));
  const refunds = corePrints(t.receipt, `pending-refund-${r.side}`);
  if (want === 'crossing') {
    check(`${r.name}: the pending bid crosses a live ask at mid -> refunded to the rung ("crossing")`, refunds.length === 1 && refunds[0].reason === 'crossing', show(refunds));
    m.pbal += m.pend; m.pend = 0n; m.pendAt = 0n;
  } else {
    check(`${r.name}: placed on the book (no refund)`, refunds.length === 0, show(refunds));
    m.live += m.pend + m.parked; m.parked = 0n; m.pend = 0n; m.pendAt = 0n;
  }
  return t;
}
async function rungTx(label, r, sender, fn, op) {
  const saved = snapshotModels(), ev = [];
  let want;
  try { want = { ok: op(ev) }; } catch (e) { if (!(e instanceof CErr)) throw e; restoreModels(saved); want = { err: e.code }; ev.length = 0; }
  const t = await send(sender, r.id, fn, []);
  check(`${r.name} ${label}: result`, eq(t.res, want), `${show(t.res)}${eq(t.res, want) ? '' : ` want ${show(want)}`}`);
  checkPrints(`${r.name} ${label}`, t.receipt, ev.map((x) => ({ ...x, rung: r.id, side: r.band, price: r.bps })));
  return t;
}

async function swapThrough(label, takerY, rungs, plan) {
  const taker = takerY ? TAKER_Y : TAKER_X;
  const book = await bookAt(rungs, `${label} book`);
  const [mm] = await evalMany([[MARKET, '{ now: stacks-block-time, min: (get-min-deposits) }']]);
  const age = mm.now > UPD_AT ? mm.now - UPD_AT : 0n, bps = rebateBps(age);
  const minX = mm.min['min-token-x'], minY = mm.min['min-token-y'];
  const makers = book.filter((x) => x.live > 0n);
  // size the taker: batch rung(s) at mid, then walk `full` rungs whole and take `frac` of the next
  const batchVal = makers.filter((x) => (takerY ? x.l <= MID : x.l >= MID)).reduce((a, x) => a + (takerY ? x.live * MID / PX : x.live * PX / MID), 0n);
  let need = batchVal;
  const walkers = makers.filter((x) => (takerY ? x.l > MID : x.l < MID)).sort((a, b) => takerY ? (a.l < b.l ? -1 : 1) : (a.l > b.l ? -1 : 1));
  for (let k = 0; k < plan.full; k++) { const x = walkers[k]; need += takerY ? x.live * x.l / PX : x.live * PX / x.l; }
  const part = walkers[plan.full];
  const takeOfPart = part.live * plan.frac / 100n;
  need += takerY ? (takeOfPart * part.l + PX - 1n) / PX : takeOfPart * PX / part.l;
  const limit = part.l;
  const gross = grossFor(need, bps);
  const sim = simSwap({ takerY, gross, limit, bps, mid: MID, makers, minX, minY });
  check(`${label}: model plan: batch ${sim.batch.inBatch.join(',') || 'none'}, walk ${sim.matches.map((x) => x.maker.split('spread-')[1]).join(',')}, no partial-fill refusal`,
    !sim.partialFill && sim.matches.length === plan.full + 1, `gross ${gross} net ${sim.net} rebate ${sim.rebate} (${bps} bps, age ${age}) rem ${sim.rem}`);
  const before = { ...wal(taker) };
  const t = await send(taker, MARKET, 'swap', [uintCV(gross), uintCV(limit), upd(), T.x, A.x, T.y, A.y, boolCV(!takerY)]);
  noteCost(label, t.receipt);
  check(`${label}: taker receipt exact`, eq(t.res, { ok: sim.result }), `${show(t.res)} want ${show(sim.result)}`);
  const st = corePrints(t.receipt, 'settlement');
  const b = sim.batch;
  check(`${label}: mid batch at the Lazer mid ${MID}: x ${b.xc} / y ${b.yc} cleared, fees ${b.xfee} / ${b.yfee}, rebates ${b.rideX} / ${b.rideY}, binding ${b.xBinding ? 'x' : 'y'}`,
    st.length === 1 && eq(st[0]['oracle-price'], MID) && eq(st[0]['x-cleared'], b.xc) && eq(st[0]['y-cleared'], b.yc) && eq(st[0]['x-fee'], b.xfee) && eq(st[0]['y-fee'], b.yfee)
      && eq(st[0]['x-rebate'], b.rideX) && eq(st[0]['y-rebate'], b.rideY) && st[0]['binding-side'] === (b.xBinding ? 'x' : 'y'), show(st));
  const matches = corePrints(t.receipt, 'match').map((x) => ({ maker: x.maker, 'x-traded': x['x-traded'], 'y-traded': x['y-traded'], price: x.price }));
  check(`${label}: walk matches at each rung's own price, best first`, eq(matches, sim.matches.map(({ 'maker-received': _, ...x }) => x)), show(matches));
  // apply to the models and wallets
  for (const x of makers) {
    const m = md(x.r).m, f = sim.fills.get(x.r.id);
    m.live = sim.live.get(x.r.id);
    if (f) { m.qbal += f.recv; m.pbal += f.refund; }
  }
  if (takerY) { debit(taker, 'stx', gross); credit(taker, 'stx', sim.left + sim.rem); credit(taker, 'sbtc', sim.result['token-x-received']); }
  else { debit(taker, 'sbtc', gross); credit(taker, 'sbtc', sim.left + sim.rem); credit(taker, 'stx', sim.result['token-y-received']); }
  FEES.sbtc += sim.fees.sbtc; FEES.stx += sim.fees.stx;
  for (const x of makers) {
    const f = sim.fills.get(x.r.id);
    console.log(`  ${x.r.name}: price ${x.l} live ${x.live} -> ${sim.live.get(x.r.id)} ${f ? `${f.how.join('+')} traded ${f.traded} received ${f.recv} ${x.r.qKey} refund ${f.refund}` : 'untouched (rolled to the next cycle)'}`);
  }
  console.log(`  taker: -${gross} ${takerY ? 'uSTX' : 'sats'}, +${sim.left + sim.rem} back (rebate left ${sim.left}, rem ${sim.rem}), received ${takerY ? sim.result['token-x-received'] + ' sats' : sim.result['token-y-received'] + ' uSTX'}; fees ${sim.fees.sbtc} sats / ${sim.fees.stx} uSTX`);
  await checkpoint(`${label} (rung market positions and balances as the market model predicts)`);
  return { sim, t, taker, before };
}

async function main() {
  const h0 = sha();
  console.log('sha256 at start:'); for (const [k, v] of Object.entries(h0)) console.log(`  ${v}  ${k}.clar`);
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addContractDeploy({ contract_name: 'jing-core-v6', source_code: src('jing-core-v6'), clarity_version: ClarityVersion.Clarity5 });
  sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const first = (await retry(() => getSimulationResult(sid))).steps.find((s) => s.Result?.Transaction || s.Transaction);
  check('deploy jing-core-v6 (working tree)', !!first);
  await deploy('jing-ladder-v1', src('jing-ladder-v1'));
  await deploy('markets-sbtc-stx-jing-v6-3', src('markets-sbtc-stx-jing-v6-3'));
  await deploy('jing-rung-deposit-trait', src('jing-rung-deposit-trait'));
  await txExpect('sync seats', DEP, MARKET, 'sync-seat-count', [], { ok: 10n });
  await txExpect('verify market', DEP, CORE, 'set-verified-contract', [P_(MARKET)], { ok: true });
  await txExpect('initialize market (min 1000 sats / 1 STX)', DEP, MARKET, 'initialize', [P_(MARKET), T.x, T.y, uintCV(1000), uintCV(1000000), uintCV(1), uintCV(45)], { ok: true });
  await txExpect('treasury -> a fresh principal (fees measured exactly)', DEP, MARKET, 'set-treasury', [P_(TREAS)], { ok: true });
  const stamp = await evalIn(MARKET, 'stacks-block-time');
  for (let i = 0; i < 40; i++) {
    const u = await retry(() => fetchLazerUpdateAny()), t = await retry(() => lazerFeedTimes(u.hex));
    if (t.at > Number(stamp)) { UPD = u; UPD_AT = BigInt(t.at); break; }
    await new Promise((res) => setTimeout(res, 3000));
  }
  if (!UPD) throw new Error('no Lazer update newer than the fork clock');
  MID = UPD.px * 100000000n / UPD.py;
  console.log(`fork clock ${stamp}, update at ${UPD_AT}, mid ${MID}`);

  // ---- 1. twenty rungs, seated ----
  console.log('\n=== 1. deploy and seat 10 buy + 10 sell core-spread v1 rungs ===');
  for (const r of ALL) await deploy(r.name, src(r.file));
  await txExpect('canonical buy-band = jing-buy-stx-spread-0', DEP, LADDER, 'set-canonical', [stringAsciiCV('buy-band'), P_(BUY[0].id)], { ok: true });
  await txExpect('canonical sel-band = jing-sell-stx-spread-0', DEP, LADDER, 'set-canonical', [stringAsciiCV('sel-band'), P_(SELL[0].id)], { ok: true });
  for (const r of ALL) { await txExpect(`${r.name} initialize (u${r.bps}, seated)`, DEP, r.id, 'initialize', [uintCV(r.bps), boolCV(true)], { ok: true }); md(r).m.init = true; }
  const seats = await evalMany([[LADDER, `{ max: (get-max-band-per-side), nb: (get-band-count "buy-band"), ns: (get-band-count "sel-band"),
      bx: (list ${BUY.map((r) => `(is-band-x '${r.id})`).join(' ')}), sy: (list ${SELL.map((r) => `(is-band-y '${r.id})`).join(' ')}),
      cross: (list ${SELL.map((r) => `(is-band-x '${r.id})`).join(' ')} ${BUY.map((r) => `(is-band-y '${r.id})`).join(' ')}),
      reg: (list ${ALL.map((r) => `(get-registered '${r.id})`).join(' ')}) }`],
    [MARKET, '{ seats: (protected-seats), x: (get-seated-x), y: (get-seated-y) }']]);
  check('ladder: max-band-per-side 10 (no raise needed), 10 buy-band + 10 sel-band seats, each rung current on its own side only, registered (side, spread)',
    seats[0].max === 10n && seats[0].nb === 10n && seats[0].ns === 10n && seats[0].bx.every((x) => x) && seats[0].sy.every((x) => x) && seats[0].cross.every((x) => !x)
      && eq(seats[0].reg, ALL.map((r) => ({ side: r.band, price: r.bps }))), show(seats[0]));
  check('market: protected seats 10 per side, seated-x = the 10 buy rungs, seated-y = the 10 sell rungs',
    seats[1].seats === 10n && eq(seats[1].x, BUY.map((r) => r.id)) && eq(seats[1].y, SELL.map((r) => r.id)), show(seats[1]));
  const extra = [rungCfg('buy', 100), rungCfg('sell', 100)];
  for (const r of extra) {
    await deploy(r.name, src(r.file));
    await txExpect(`${r.name}: an 11th seat on its side -> ladder ERR_BAND_FULL u6011`, DEP, r.id, 'initialize', [uintCV(100), boolCV(true)], { err: 6011n });
  }
  await deploy('jing-ladder-dispatch', src('jing-ladder-dispatch'));
  await deploy('dispatch-intermediary', `(use-trait rung .jing-rung-deposit-trait.rung-trait)
(define-public (deposit-buy (total uint) (allocations (list 10 { rung: <rung>, amount: uint })))
  (contract-call? .jing-ladder-dispatch deposit-buy total allocations))
(define-public (withdraw-sell (requests (list 10 { rung: <rung>, amount: uint })))
  (contract-call? .jing-ladder-dispatch withdraw-sell requests none))`);
  await fundAll();
  await checkpoint('baseline after funding');

  // ---- 2. deposits ----
  console.log('\n=== 2. dispatch deposits ===');
  const aAmts = SPREADS.map((_, k) => BigInt(k + 1) * 3000n);            // 3,000 .. 30,000 sats
  const bAmts = SPREADS.map((_, k) => BigInt(k + 1) * 10_000_000n);      // 10 .. 100 STX
  const SUB = [0, 3, 4, 6];                                              // spreads 0, 30, 40, 60
  const cAmts = [1500n, 2500n, 3500n, 4500n], dAmts = [5_000_000n, 8_000_000n, 12_000_000n, 15_000_000n];
  const depA = await dispatchDeposit('A deposit-buy across all 10 buy rungs, weighted 1x..10x', UA, 'buy', BUY.map((r, k) => ({ r, amt: aAmts[k] })));
  check('A: every leg rests directly (sell side empty)', depA.rows.every((x) => x.outcome === 'direct'));
  const depC = await dispatchDeposit('C deposit-buy on buy 0/30/40/60', UC, 'buy', SUB.map((k, i) => ({ r: BUY[k], amt: cAmts[i] })));
  check('C: every leg tops up the resting order directly', depC.rows.every((x) => x.outcome === 'direct'));
  await bookAt(BUY, 'buy book after A and C');
  const depB = await dispatchDeposit('B deposit-sell across all 10 sell rungs, weighted 1x..10x', UB, 'sell', SELL.map((r, k) => ({ r, amt: bAmts[k] })));
  check('B: every leg goes pending (buy side resting)', depB.rows.every((x) => x.outcome === 'pending'));
  for (const r of SELL) await keeperSettle(r, r.bps === 0n ? 'crossing' : 'placed');
  await checkpoint('keeper settled the sell rungs (sell-0 refunded as crossing, held)');
  const depD = await dispatchDeposit('D deposit-sell on sell 0/30/40/60', UD, 'sell', SUB.map((k, i) => ({ r: SELL[k], amt: dAmts[i] })));
  check('D: every leg goes pending (sell-0 pushes its held funds along)', depD.rows.every((x) => x.outcome === 'pending'));
  for (const k of SUB) await keeperSettle(SELL[k], k === 0 ? 'crossing' : 'placed');
  await checkpoint('keeper settled D\'s legs');
  await bookAt(SELL, 'sell book after B and D');
  const s0 = md(SELL[0]).m;
  check('sell-0: B + D both members, their STX held in the rung (the 0 bps bid crossed buy-0 at mid)', s0.mem === 2n && s0.live === 0n && s0.pend === 0n && s0.pbal === bAmts[0] + dAmts[0], `held ${s0.pbal}`);
  for (const [nm, rs] of [['buy', BUY], ['sell', SELL]]) {
    const detail = rs.map((r) => { const m = md(r).m; return `${r.bps}:mem ${m.mem} ts ${m.ts} live ${m.live} held ${m.pbal - m.res}`; }).join('; ');
    console.log(`  ${nm}: ${detail}`);
  }

  // ---- 6. refusals (with positions in place) ----
  console.log('\n=== 6. refusals through the dispatch ===');
  await refused('deposit-buy naming a sell rung', UA, DISPATCH, 'deposit-buy', [uintCV(2000), entries([{ r: BUY[1], amt: 1000n }, { r: SELL[1], amt: 1000n }])], 7104);
  await refused('deposit-sell naming a buy rung', UB, DISPATCH, 'deposit-sell', [uintCV(2_000_000), entries([{ r: SELL[2], amt: 1_000_000n }, { r: BUY[2], amt: 1_000_000n }])], 7104);
  await refused('withdraw-buy naming a sell rung', UA, DISPATCH, 'withdraw-buy', [entries([{ r: BUY[5], amt: 100n }, { r: SELL[5], amt: 100n }]), noneCV()], 7108);
  await refused('withdraw-sell naming a buy rung', UB, DISPATCH, 'withdraw-sell', [entries([{ r: BUY[5], amt: 100n }]), noneCV()], 7108);
  await refused('deposit-buy with a duplicate leg', UA, DISPATCH, 'deposit-buy', [uintCV(3000), entries([{ r: BUY[1], amt: 1000n }, { r: BUY[2], amt: 1000n }, { r: BUY[1], amt: 1000n }])], 7105);
  await refused('withdraw-sell with a duplicate leg', UB, DISPATCH, 'withdraw-sell', [entries([{ r: SELL[5], amt: 100n }, { r: SELL[5], amt: 100n }]), noneCV()], 7105);
  await refused('deposit-buy with a zero leg', UA, DISPATCH, 'deposit-buy', [uintCV(1000), entries([{ r: BUY[1], amt: 1000n }, { r: BUY[2], amt: 0n }])], 7103);
  await refused('deposit-buy whose legs do not add up to the total', UA, DISPATCH, 'deposit-buy', [uintCV(3000), entries([{ r: BUY[1], amt: 1000n }, { r: BUY[2], amt: 1000n }])], 7102);
  await refused('deposit-buy with no legs', UA, DISPATCH, 'deposit-buy', [uintCV(1000), listCV([])], 7101);
  await refused('deposit-buy through an intermediary contract (tx-sender != contract-caller)', UA, PROXY, 'deposit-buy', [uintCV(1000), entries([{ r: BUY[1], amt: 1000n }])], 7106);
  await refused('withdraw-sell through an intermediary contract', UB, PROXY, 'withdraw-sell', [entries([{ r: SELL[5], amt: 100n }])], 7106);
  {
    const legs = [...BUY, rungCfg('buy', 100)].map((r) => ({ r, amt: 1000n }));
    let outcome;
    try { const r = await retry(() => callContract(sid, { sender: UA, contract: DISPATCH, functionName: 'deposit-buy', functionArgs: [uintCV(11000), entries(legs)], fee: 0 })); outcome = `included: ${r.result} vm ${r.vmError}`; }
    catch (e) { outcome = `rejected: ${String(e.message).slice(0, 300)}`; }
    check('deposit-buy with 11 legs: refused by the (list 10) argument type before any code runs', /^rejected/.test(outcome) || (/^included/.test(outcome) && !/vm undefined|vm null/.test(outcome)), outcome);
    await checkpoint('11-leg batch (nothing moved)');
  }

  // ---- 3. settlement ----
  console.log('\n=== 3. takers through the book ===');
  const sw1 = await swapThrough('STX taker through the buy book (buy-0 in the mid batch, walk 10/20/30, 60% of 40)', true, BUY, { full: 3, frac: 60n });
  for (const r of BUY) await rungTx('sync after the swap', r, keeper, 'sync', (ev) => { md(r).sync(ev); return true; });
  await checkpoint('buy rungs synced');
  const reportRung = (r) => { const m = md(r).m; return `${r.name}: epoch ${m.ep} pi ${m.pi} ui ${m.ui} ${r.qKey} ${m.qbal} unsold ${m.held + msize(m)}`; };
  for (const r of BUY) console.log('  ' + reportRung(r));
  for (const k of [0, 1, 2, 3]) check(`${BUY[k].name}: sold out -> tail roll, epoch 1, all proceeds with the old epoch's members`, md(BUY[k]).m.ep === 1n && md(BUY[k]).lastRoll?.epoch === 0n);
  check('buy-40: partial fill, still epoch 0, unfilled index < 1', md(BUY[4]).m.ep === 0n && md(BUY[4]).m.ui < S && md(BUY[4]).m.pi > 0n);
  for (const k of [5, 6, 7, 8, 9]) check(`${BUY[k].name}: untouched (index 1, no proceeds, same live)`, md(BUY[k]).m.ui === S && md(BUY[k]).m.pi === 0n && md(BUY[k]).m.live === (k === 6 ? aAmts[k] + cAmts[3] : aAmts[k]));
  // per-member split in the multi-member rungs
  for (const k of [0, 3, 4]) {
    const r = BUY[k], mdl = md(r), ga = mdl.getPosition(UA), gc = mdl.getPosition(UC);
    const i = SUB.indexOf(k), fa = aAmts[k], fc = cAmts[i], tot = sw1.sim.fills.get(r.id).recv, idx = mdl.m.finalP.get(0n) ?? mdl.m.pi;
    check(`${r.name}: A / C split ${ga.stx} / ${gc.stx} uSTX of ${tot} by shares ${fa}:${fc} (each floor(shares * index / 1e12))`,
      ga.stx === fa * idx / S && gc.stx === fc * idx / S && ga.stx + gc.stx <= tot, `sum ${ga.stx + gc.stx}`);
  }
  // sell-0 no longer crosses: keeper push + settle
  await rungTx('keeper push of the held STX (buy-0 is gone)', SELL[0], keeper, 'push', (ev) => md(SELL[0]).push(keeper, ev));
  check('sell-0 push went pending', md(SELL[0]).lastPush === 'pending');
  await checkpoint('sell-0 pushed');
  await keeperSettle(SELL[0], 'placed');
  await checkpoint('sell-0 placed');
  const sw2 = await swapThrough('sBTC taker through the sell book (sell-0 in the mid batch, walk 10/20/30, 60% of 40)', false, SELL, { full: 3, frac: 60n });
  for (const r of SELL) await rungTx('sync after the swap', r, keeper, 'sync', (ev) => { md(r).sync(ev); return true; });
  await checkpoint('sell rungs synced');
  for (const r of SELL) console.log('  ' + reportRung(r));
  for (const k of [0, 1, 2, 3]) check(`${SELL[k].name}: sold out -> tail roll, epoch 1`, md(SELL[k]).m.ep === 1n && md(SELL[k]).lastRoll?.epoch === 0n);
  check('sell-40: partial fill, still epoch 0', md(SELL[4]).m.ep === 0n && md(SELL[4]).m.ui < S && md(SELL[4]).m.pi > 0n);
  for (const k of [5, 6, 7, 8, 9]) check(`${SELL[k].name}: untouched`, md(SELL[k]).m.ui === S && md(SELL[k]).m.pi === 0n && md(SELL[k]).m.live === (k === 6 ? bAmts[k] + dAmts[3] : bAmts[k]));
  for (const k of [0, 3, 4]) {
    const r = SELL[k], mdl = md(r), gb = mdl.getPosition(UB), gd = mdl.getPosition(UD), i = SUB.indexOf(k);
    const idx = mdl.m.finalP.get(0n) ?? mdl.m.pi;
    check(`${r.name}: B / D split ${gb.sbtc} / ${gd.sbtc} sats by shares ${bAmts[k]}:${dAmts[i]}`, gb.sbtc === bAmts[k] * idx / S && gd.sbtc === dAmts[i] * idx / S, `rung got ${sw2.sim.fills.get(r.id).recv}`);
  }

  // ---- 4. exits ----
  console.log('\n=== 4. exits through the dispatch ===');
  await dispatchWithdraw('A withdraw-buy: full exit across all 10 buy rungs', UA, 'buy', BUY.map((r) => ({ r, amt: BIG })));
  await dispatchWithdraw('B withdraw-sell: partial across sell 40/50/70/90 (half of each unsold position)', UB, 'sell',
    [4, 5, 7, 9].map((k) => ({ r: SELL[k], amt: md(SELL[k]).getPosition(UB).stx / 2n })));
  await dispatchWithdraw('D withdraw-sell: mixed, filled sell-0 / sell-30 with unfilled sell-60', UD, 'sell', [0, 3, 6].map((k) => ({ r: SELL[k], amt: BIG })));
  console.log('\n=== 4b. drain: everyone else exits ===');
  await dispatchWithdraw('C withdraw-buy: full exit of buy 0/30/40/60', UC, 'buy', SUB.map((k) => ({ r: BUY[k], amt: BIG })));
  await dispatchWithdraw('B withdraw-sell: full exit across all 10 sell rungs', UB, 'sell', SELL.map((r) => ({ r, amt: BIG })));
  await dispatchWithdraw('D withdraw-sell: full exit of sell-40', UD, 'sell', [{ r: SELL[4], amt: BIG }]);
  const fin = await checkpoint('after every member left');
  const left = ALL.map((r) => { const m = md(r).m; return { r, mem: m.mem, ep: m.ep, ts: m.ts, pbal: m.pbal, qbal: m.qbal, res: m.res, live: msize(m) }; });
  check('every rung: members 0, total-shares 0, nothing on the market, no reserve owed', left.every((x) => x.mem === 0n && x.ts === 0n && x.live === 0n && x.res === 0n),
    left.map((x) => `${x.r.name.replace('jing-', '').replace('-stx-spread', '')}: ep ${x.ep} ${x.r.pKey} ${x.pbal} ${x.r.qKey} ${x.qbal}`).join('; '));
  const dust = left.reduce((a, x) => { a[x.r.pKey] += x.pbal; a[x.r.qKey] += x.qbal; return a; }, { sbtc: 0n, stx: 0n });
  console.log(`  rounding left in the rungs (ownerless, goes to the next depositor as orphan): ${dust.sbtc} sats, ${dust.stx} uSTX`);
  console.log(`  users: sBTC in ${FLOW.sbtc.in} out ${FLOW.sbtc.out}; STX in ${FLOW.stx.in} out ${FLOW.stx.out}; treasury ${FEES.sbtc} sats ${FEES.stx} uSTX`);
  void fin;
  const h1 = sha();
  check('sha256 of the six contracts unchanged start -> end', eq(h0, h1), Object.entries(h1).map(([k, v]) => `${k} ${v.slice(0, 12)}`).join(', '));
  console.log('\ncosts (% of a mainnet block):');
  for (const c of costs) console.log(`  ${c.label}: runtime ${c.runtime} read_count ${c.read_count} read_length ${c.read_length} write_count ${c.write_count} write_length ${c.write_length}`);
  console.log(`\n${passed}/${checks} checks green`);
  console.log(`https://stxer.xyz/simulations/mainnet/${sid}`);
}
main().catch((e) => { console.error(e); console.log(`${passed}/${checks} checks green; failed: ${failed.join('; ')}`); console.log(`https://stxer.xyz/simulations/mainnet/${sid}`); process.exit(1); });
