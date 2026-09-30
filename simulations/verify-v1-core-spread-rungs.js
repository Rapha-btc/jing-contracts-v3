// Fork only. Run: node simulations/verify-v1-core-spread-rungs.js
// The two deploy-scope rungs, jing-buy-stx-core-spread-v1 (sBTC resting on
// the market's x side, earns STX) and jing-sell-stx-core-spread-v1 (STX on the
// y side, earns sBTC), deployed from the unmodified working-tree sources as
// jing-{buy,sell}-stx-spread-20 (seated) and -30 (unseated) next to the
// working-tree markets-sbtc-stx-jing-v6-3, jing-core-v6 and jing-ladder-v1.
// No source substitution, no storage writes, no mock prices: fills are real
// market swaps priced by one signed Lazer update, time moves by AdvanceBlocks.
//
// A BigInt model of the rung (sync, rescale, roll-tail, settle-proceeds,
// count-reserve-claim, escrow-for, pull-to-held, push-to-market) predicts every
// rung transaction: its result, its ladder prints, and afterwards the rung's
// variables, positions, get-position, scale-start / epoch maps, its market
// position and balances and every member's wallet, all compared exactly. The
// market is only an input: after a swap or a keeper settle the model re-reads
// the rung's market position and balances.
//
// Scenarios, both rungs (u = 1 sat on buy, 1000 uSTX on sell):
//  g   guards: not initialized, initialize (owner / spread / name / ladder
//      refusal / seat and unseated / twice), set-push-paused owner-only,
//      deposit minimum and unfunded, withdraw / claim without a position
//  e0  small pool: held under the market minimum, push nothing / under min,
//      partial exit from held, last-member close
//  a   rescale: 98.5% fill + refill rounds until 4 rescales; A acts after 1,
//      B after 2 (deposit), C after 3, D after 4 (carried to 0, early proceeds
//      paid, exits with 0); rounding per position < 1 unit at every rescale;
//      F-8 partial->full exit; partial exit from the market
//  b   last-member close with leftover rescale shares (members 0, shares > 0),
//      all remaining input and proceeds go to the final member
//  c   tail roll by one fill under 1e6 with 3 members: rounded claims, the last
//      one receives both exact remaining reserves; dust tail roll
//  d   escrow and pushes (both rungs on the book): 1-unit grief pending does
//      not block exits; dust roll with a pending on the book; a refused push
//      holds; an exit that needs the pending settles it (u7012 without update,
//      market pause) or, after 24h, cancels it; 24h push cooldown; owner push
//      pause; after the cooldown the push reaches the miner band (u7008: the
//      fork's synthetic tenures carry no miner spend)
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  noneCV, someCV, boolCV, deserializeCV, cvToString, getAddressFromPrivateKey,
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
const PROBE = `${DEP}.core-spread-probe`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALE = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR' };
const P_ = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const T = { x: P_(SBTC), y: P_(WSTX) };
const A = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const sources = new Map();
const src = (f) => {
  const body = fs.readFileSync(new URL(`../contracts/${f}.clar`, import.meta.url), 'utf8');
  sources.set(f, body); return body;
};
const Q = 10n ** 18n; // proceeds precision and total-share ceiling
const S = 10n ** 12n, MINT_FLOOR = 10n ** 9n, RESCALE = 1000n, DAY = 86400n;
const BIG = 10n ** 15n;
const keeper = mk(871), stranger = mk(872), poor = mk(873);

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
// fields of `want` that differ in `got` (want may be a subset)
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
let passed = 0, checks = 0, sid;
const failed = [];
function check(label, ok, detail = '') {
  checks++;
  if (ok) passed++; else failed.push(label);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${checks}. ${label}${detail ? `: ${String(detail).slice(0, 900)}` : ''}`);
  if (!ok) throw new Error(`STOP at check ${checks} (${label}): https://stxer.xyz/simulations/mainnet/${sid}`);
  return ok;
}
async function retry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const m = String(e?.message ?? e);
      if (i < 8 && /ECONNRESET|fetch failed|socket hang|timed? ?out|HTTP 50[0234]\b|\b(502|503|504|429)\b(?!,)|ETIMEDOUT|EAI_AGAIN/i.test(m)) { console.log(`  retry after: ${m.slice(0, 120)}`); await new Promise((r) => setTimeout(r, 5000 * (i + 1))); continue; }
      throw e;
    }
  }
}
async function evalIn(cid, code) {
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ TenureExtend: { cause: 'Extended' } }, { Eval: [DEP, '', cid, code] }] }));
  const r = out.steps[1];
  if (!r?.Eval || !('Ok' in r.Eval)) throw new Error(`eval failed in ${cid}: ${JSON.stringify(r).slice(0, 300)} :: ${code.slice(0, 200)}`);
  return plain(deserializeCV(r.Eval.Ok));
}
// a raw tx: returns { res (plain), receipt }
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
async function advance(bitcoinBlocks, stacksPer, secs) {
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: bitcoinBlocks, stacks_blocks_per_bitcoin: stacksPer, bitcoin_interval_secs: secs } }] }));
  const ok = out.steps[0]?.AdvanceBlocks?.Ok;
  check(`advance ${bitcoinBlocks}x${stacksPer} blocks, ${secs}s`, !!ok, JSON.stringify(out.steps[0]).slice(-200));
}
// committed ladder / rung prints of a receipt, as plain tuples
function prints(receipt, ids) {
  return (receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.committed !== false && e.contract_event && ids.includes(e.contract_event.contract_identifier))
    .map((e) => plain(deserializeCV(e.contract_event.raw_value)))
    .filter((p) => typeof p?.event === 'string' && p.event.startsWith('rung-'));
}

// ------------------------------------------------------------- rungs -----
function rungCfg(dir, bps) {
  const buy = dir === 'buy';
  return {
    dir, buy, bps: BigInt(bps), name: `jing-${dir}-stx-spread-${bps}`, id: `${DEP}.jing-${dir}-stx-spread-${bps}`,
    file: `jing-${dir}-stx-core-spread-v1`, side: buy ? 'x' : 'y', opp: buy ? 'y' : 'x', band: buy ? 'buy-band' : 'sel-band',
    heldVar: buy ? 'held-sats' : 'held-ustx', resVar: buy ? 'reserved-sats' : 'reserved-ustx', accVar: buy ? 'stx-accounted' : 'sats-accounted',
    guardVar: buy ? 'floor' : 'cap', pooledFn: buy ? 'pooled-sbtc' : 'pooled-stx', guardGetter: buy ? 'get-floor' : 'get-cap', guardFn: buy ? 'current-floor' : 'current-cap',
    // principal asset (what rests) and proceeds asset (what fills pay)
    pKey: buy ? 'sbtc' : 'stx', qKey: buy ? 'stx' : 'sbtc',
    ppl: new Set(), u: buy ? 1n : 1000n, MIN_DEPOSIT: buy ? 100n : 100000n, DUST: buy ? 10n : 10000n, min: buy ? 1000n : 1000000n,
  };
}
const pBal = (r, who) => r.buy ? `(unwrap-panic (contract-call? '${SBTC} get-balance '${who}))` : `(stx-get-balance '${who})`;
const qBal = (r, who) => r.buy ? `(stx-get-balance '${who})` : `(unwrap-panic (contract-call? '${SBTC} get-balance '${who}))`;

function newModel() {
  return {
    ts: 0n, mem: 0n, sc: 0n, ui: S, pi: 0n, held: 0n, res: 0n, acc: 0n, cp: 0n, carry: 0n, ep: 0n, cat: 0n, paused: false, guard: 0n, init: false,
    scaleStart: new Map(), finalP: new Map(), finalU: new Map(), finalS: new Map(), eres: new Map(), pos: new Map(),
    live: 0n, parked: 0n, pend: 0n, pendAt: 0n, pbal: 0n, qbal: 0n, w: new Map(),
    // externals, refreshed from the chain
    now: 0n, opp: 0n, mm: 0n, marketPaused: false,
  };
}
const msize = (m) => m.live + m.parked + m.pend;
const onBook = (m) => m.live + m.parked;
function wallet(m, who) { if (!m.w.has(who)) m.w.set(who, { p: 0n, q: 0n }); return m.w.get(who); }

class Model {
  constructor(r) { this.r = r; this.m = newModel(); this.rescaleLog = []; }
  carried(sh, from, to) { const d = to - from; return d > 3n ? 0n : sh / RESCALE ** d; }
  earned(sh, from, to, paid, upto) {
    const m = this.m; let owed = 0n;
    for (let step = 0n; step <= 3n; step++) {
      const j = from + step;
      if (j > to) continue;
      const segStart = step === 0n ? paid : (m.scaleStart.get(j) ?? 0n);
      const segEnd = j === to ? upto : (m.scaleStart.get(j + 1n) ?? 0n);
      if (segEnd < segStart) throw new Error(`model: earned underflow (${segStart} > ${segEnd})`);
      owed += (sh / RESCALE ** step) * (segEnd - segStart) / Q;
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
    const reserve = m.eres.get(p.epoch), last = !cur && reserve?.left === 1n;
    return { shares: sh,
      [r.pKey]: last ? reserve.reserve : cur && m.mem === 1n ? msize(m) + m.held : sh * (cur ? m.ui : this.finalUnfilled(p.epoch)) / S,
      [r.qKey]: last ? reserve.proceeds : cur && m.mem === 1n ? m.cp : this.earned(p.shares, p.scale, to, p.paid, cur ? m.pi : this.finalIndex(p.epoch)) };
  }
  // ---- rung internals ----
  sync(ev) {
    const m = this.m, r = this.r;
    if (!m.init) throw new CErr(7003);
    const shares = m.ts, local = m.pbal - m.res, actual = msize(m) + local, recorded = shares * m.ui / S, gained = m.qbal - m.acc;
    if (local < 0n || gained < 0n) throw new Error('model: sync underflow');
    m.held = local;
    if (shares === 0n) return;
    const ni = (actual < recorded && recorded > 0n) ? m.ui * actual / recorded : m.ui;
    const scaled = gained * Q + m.carry, np = m.pi + scaled / shares;
    m.pi = np; m.acc = m.qbal; m.cp += gained; m.carry = scaled % shares;
    if (actual < r.DUST || ni < MINT_FLOOR / RESCALE) { m.ui = ni; this.rollTail(ev, actual < r.DUST ? 'dust' : 'index'); }
    else if (ni < MINT_FLOOR) {
      // rounding per position at this rescale: what each loses is (carried mod 1000) * index / SCALE
      const before = m.sc, next = m.sc + 1n, losses = [];
      for (const [who, p] of m.pos) {
        if (p.epoch !== m.ep) continue;
        const pre = this.carried(p.shares, p.scale, before), post = this.carried(p.shares, p.scale, next);
        const lossScaled = pre * ni - post * RESCALE * ni; // x SCALE
        losses.push({ who, pre, post, lossScaled, preValue: pre * ni / S, postValue: post * (ni * RESCALE) / S });
      }
      m.ui = ni * RESCALE; m.carry = 0n; m.ts = shares / RESCALE; m.sc = next; m.scaleStart.set(next, np);
      this.rescaleLog.push({ epoch: m.ep, scale: next, np, newIndex: ni, ui: m.ui, ts: m.ts, sharesBefore: shares, losses });
      ev.push({ event: 'rung-rescale', epoch: m.ep, scale: next, 'proceeds-index': np, 'unfilled-index': m.ui, 'total-shares': m.ts });
    } else m.ui = ni;
  }
  rollTail(ev, why) {
    const m = this.m, epo = m.ep;
    const hadMarket = msize(m) > 0n;
    if (hadMarket) { m.pbal += msize(m); m.live = 0n; m.parked = 0n; m.pend = 0n; m.pendAt = 0n; }
    const free = m.pbal - m.res, owed = m.ts * m.ui / S, reserve = free;
    m.finalP.set(epo, m.pi); m.finalU.set(epo, m.ui); m.finalS.set(epo, m.sc);
    m.res += reserve; m.held = free - reserve;
    m.eres.set(epo, { left: m.mem, reserve, proceeds: m.cp });
    m.cp = 0n; m.carry = 0n;
    ev.push({ event: 'rung-epoch-closed', epoch: epo, 'final-proceeds-index': m.pi });
    this.lastRoll = { epoch: epo, why, hadMarket, owed, free, reserve, members: m.mem, ui: m.ui };
    m.ep = epo + 1n; m.ts = 0n; m.mem = 0n; m.ui = S;
  }
  countReserveClaim(e, back, paid) {
    const m = this.m, rr = m.eres.get(e);
    if (!rr) return;
    if (back > rr.reserve || paid > rr.proceeds) throw new Error('Epoch payout exceeds remaining receipts');
    if (rr.left === 1n) { m.eres.delete(e); this.lastRelease = { epoch: e, input: back, proceeds: paid }; }
    else m.eres.set(e, { left: rr.left - 1n, reserve: back > rr.reserve ? 0n : rr.reserve - back, proceeds: paid > rr.proceeds ? 0n : rr.proceeds - paid });
  }
  settle(who, ev) {
    const m = this.m, pos = m.pos.get(who);
    if (!pos) return { owed: 0n, back: 0n };
    const cur = pos.epoch === m.ep, to = cur ? m.sc : this.finalScale(pos.epoch), upto = cur ? m.pi : this.finalIndex(pos.epoch);
    const rr = m.eres.get(pos.epoch), last = !cur && rr?.left === 1n;
    const owed = last ? rr.proceeds : cur && m.mem === 1n ? m.cp : this.earned(pos.shares, pos.scale, to, pos.paid, upto);
    const cs = this.carried(pos.shares, pos.scale, to);
    const back = cur ? 0n : last ? rr.reserve : cs * this.finalUnfilled(pos.epoch) / S;
    if (cur) { m.cp -= owed; if (m.mem === 1n) m.carry = 0n; }
    if (owed > 0n) { m.qbal -= owed; wallet(m, who).q += owed; }
    m.acc -= owed;
    if (back > 0n) { m.pbal -= back; wallet(m, who).p += back; }
    m.res -= back;
    if (m.acc < 0n || m.res < 0n || m.qbal < 0n || m.pbal < 0n) throw new Error('model: settle underflow');
    if (!cur) this.countReserveClaim(pos.epoch, back, owed);
    if (cur) m.pos.set(who, { ...pos, scale: to, shares: cs, paid: upto }); else m.pos.delete(who);
    if (owed > 0n || back > 0n) ev.push({ event: 'rung-payout', member: who, proceeds: owed, back, epoch: pos.epoch });
    return { owed, back };
  }
  paidTuple(p) { return this.r.buy ? { stx: p.owed, sbtc: p.back } : { sbtc: p.owed, stx: p.back }; }
  // push-to-market: 'direct' | 'pending' | refusal code
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
  // ---- public functions ----
  deposit(who, amount, ev) {
    const m = this.m, r = this.r;
    if (!m.init) throw new CErr(7003);
    if (amount < r.MIN_DEPOSIT) throw new CErr(7005);
    this.sync(ev);
    const paid = this.settle(who, ev);
    if (wallet(m, who).p < amount) throw new CErr(1);
    wallet(m, who).p -= amount; m.pbal += amount;
    const toPush = amount + m.held;
    const orphan = m.ts === 0n ? msize(m) + m.held : 0n;
    const shares = (amount + orphan) * S / m.ui;
    if (m.ts + shares > Q) throw new CErr(7016);
    const pos = m.pos.get(who) ?? { epoch: m.ep, scale: m.sc, shares: 0n, paid: m.pi };
    const joining = !m.pos.has(who), epo = m.ep;
    let outcome = 'under-min';
    if (toPush + msize(m) >= r.min) outcome = this.pushToMarket(toPush);
    m.held = (outcome === 'direct' || outcome === 'pending') ? 0n : toPush;
    this.lastPush = outcome;
    m.pos.set(who, { epoch: epo, scale: m.sc, shares: pos.shares + shares, paid: m.pi });
    m.carry = 0n; m.ts += shares; if (joining) m.mem += 1n;
    ev.push({ event: 'rung-deposit', member: who, amount, shares, epoch: epo, pushed: m.held === 0n, held: m.held });
    const pt = this.paidTuple(paid);
    return { amount, shares, epoch: epo, 'stx-paid': pt.stx, 'sbtc-paid': pt.sbtc, orphan };
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
    // placed (the rung's ask / bid never crosses the other rung here)
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
    this.lastExit = { escrow: 'no', pull: 'none', full: false, f8: false, take: 0n, close: false, old: false };
    if (!m.pos.has(who)) { this.lastExit.old = true; return this.paidTuple(paid); }
    const fi = m.ui, ms = m.pos.get(who).shares, mine = ms * fi / S, partial = (amount * S + fi - 1n) / fi;
    const byRest = !(amount >= mine) && (ms - partial) * fi / S === 0n;
    const full = amount >= mine || byRest;
    const sharesOut = full ? ms : partial, take = full && m.mem === 1n ? msize(m) + m.held : full ? mine : amount, epo = m.ep;
    Object.assign(this.lastExit, { full, f8: byRest, take });
    if (take > 0n) {
      if (take > m.held + onBook(m)) { this.lastExit.escrow = this.settleEscrow(update); this.sync(ev); }
      this.lastExit.pull = this.pullToHeld(take);
      m.pbal -= take; wallet(m, who).p += take; m.held -= take;
    }
    if (full) m.pos.delete(who); else m.pos.set(who, { epoch: epo, scale: m.sc, shares: ms - sharesOut, paid: m.pi });
    m.carry = 0n; m.ts -= sharesOut;
    if (full) m.mem -= 1n;
    if (m.mem === 0n) {
      m.carry = 0n;
      this.lastExit.close = true; this.lastExit.leftoverShares = m.ts;
      m.finalP.set(epo, m.pi); m.finalS.set(epo, m.sc);
      ev.push({ event: 'rung-epoch-closed', epoch: epo, 'final-proceeds-index': m.pi });
      m.ep = epo + 1n; m.ts = 0n; m.ui = S;
    }
    ev.push({ event: 'rung-withdraw', member: who, amount: take, shares: sharesOut, epoch: epo, held: m.held });
    return r.buy ? { stx: paid.owed, sbtc: take } : { stx: take, sbtc: paid.owed };
  }
  claim(who, ev) {
    if (!this.m.pos.has(who)) throw new CErr(7006);
    this.sync(ev);
    return this.paidTuple(this.settle(who, ev));
  }
}

// ------------------------------------------------------- snapshots -------
function snapCode(r, mdl) {
  const m = mdl.m, M = `'${MARKET}`, ppl = [...r.ppl];
  const L = (xs) => xs.length ? `(list ${xs.join(' ')})` : '(list)';
  const eps = [...Array(Number(m.ep)).keys()];
  return `{ ts: (var-get total-shares), mem: (var-get members), sc: (var-get scale), ui: (var-get unfilled-index), pi: (var-get proceeds-index),
    held: (var-get ${r.heldVar}), res: (var-get ${r.resVar}), acc: (var-get ${r.accVar}), cp: (var-get current-proceeds), carry: (var-get proceeds-carry), ep: (var-get epoch), cat: (var-get escrow-cancelled-at),
    paused: (var-get push-paused), guard: (var-get ${r.guardVar}), init: (var-get initialized),
    live: (contract-call? ${M} get-token-${r.side}-deposit (contract-call? ${M} get-current-cycle) '${r.id}),
    parked: (contract-call? ${M} get-token-${r.side}-parked '${r.id}),
    pend: (contract-call? ${M} get-token-${r.side}-pending-deposit '${r.id}),
    opp: (len (contract-call? ${M} get-token-${r.opp}-depositors (contract-call? ${M} get-current-cycle))),
    pbal: ${pBal(r, r.id)}, qbal: ${qBal(r, r.id)}, now: stacks-block-time, mm: (miner-mid),
    pos: ${L(ppl.map((p) => `(map-get? positions '${p})`))},
    gp: ${L(ppl.map((p) => `(get-position '${p})`))},
    wp: ${L(ppl.map((p) => pBal(r, p)))}, wq: ${L(ppl.map((p) => qBal(r, p)))},
    ss: ${L([...Array(Number(m.sc)).keys()].map((k) => `(map-get? scale-start u${k + 1})`))},
    fp: ${L(eps.map((e) => `(map-get? epoch-final-proceeds u${e})`))},
    fu: ${L(eps.map((e) => `(map-get? epoch-final-unfilled u${e})`))},
    fs: ${L(eps.map((e) => `(map-get? epoch-final-scale u${e})`))},
    er: ${L(eps.map((e) => `(map-get? epoch-reserve u${e})`))} }`;
}
function modelView(r, mdl) {
  const m = mdl.m, ppl = [...r.ppl], eps = [...Array(Number(m.ep)).keys()].map(BigInt);
  return {
    ts: m.ts, mem: m.mem, sc: m.sc, ui: m.ui, pi: m.pi, held: m.held, res: m.res, acc: m.acc, cp: m.cp, carry: m.carry, ep: m.ep, cat: m.cat, paused: m.paused, guard: m.guard, init: m.init,
    live: m.live, parked: m.parked, pbal: m.pbal, qbal: m.qbal,
    pos: ppl.map((p) => { const x = m.pos.get(p); return x ? { epoch: x.epoch, scale: x.scale, shares: x.shares, 'paid-index': x.paid } : null; }),
    gp: ppl.map((p) => mdl.getPosition(p)),
    wp: ppl.map((p) => wallet(m, p).p), wq: ppl.map((p) => wallet(m, p).q),
    ss: [...Array(Number(m.sc)).keys()].map((k) => m.scaleStart.get(BigInt(k + 1)) ?? null),
    fp: eps.map((e) => m.finalP.get(e) ?? null), fu: eps.map((e) => m.finalU.get(e) ?? null), fs: eps.map((e) => m.finalS.get(e) ?? null),
    er: eps.map((e) => m.eres.get(e) ?? null),
  };
}
async function snap(r, mdl) { return evalIn(r.id, snapCode(r, mdl)); }
function absorbExternals(r, mdl, o, { wallets = true } = {}) {
  const m = mdl.m;
  m.live = o.live; m.parked = o.parked; m.pend = o.pend ? o.pend.amount : 0n; m.pendAt = o.pend ? o.pend['submitted-at'] : 0n;
  m.pbal = o.pbal; m.qbal = o.qbal; m.now = o.now; m.opp = o.opp; m.mm = o.mm;
  if (wallets) [...r.ppl].forEach((p, i) => { wallet(m, p).p = o.wp[i]; wallet(m, p).q = o.wq[i]; });
}
// compare every rung-owned value; market / balance / wallet values too unless `external`
async function verify(r, mdl, label, { external = false } = {}) {
  const o = await snap(r, mdl);
  if (external) absorbExternals(r, mdl, o);
  const want = modelView(r, mdl);
  if (external) for (const k of ['live', 'parked', 'pbal', 'qbal', 'wp', 'wq']) delete want[k];
  else {
    const pa = o.pend ? o.pend.amount : 0n, pt = o.pend ? o.pend['submitted-at'] : 0n;
    check(`${r.name} ${label}: market pending as modelled`, pa === mdl.m.pend && pt === mdl.m.pendAt, `pending ${pa}@${pt} model ${mdl.m.pend}@${mdl.m.pendAt}`);
  }
  const d = diff(o, want);
  const reservedQ = [...mdl.m.eres.values()].reduce((n, e) => n + e.proceeds, 0n);
  if (o.acc !== o.cp + reservedQ || o.acc > o.qbal) d.push('exact epoch proceeds ledger');
  if (!(o.ts === 0n ? o.carry === 0n : o.carry < o.ts)) d.push('carry bound');
  check(`${r.name} ${label}: rung state${external ? '' : ', market position, balances, wallets'} exact`, d.length === 0, d.length ? d.join(' | ') : `ts ${o.ts} ui ${o.ui} sc ${o.sc} pi ${o.pi} held ${o.held} res ${o.res} ep ${o.ep} mem ${o.mem}`);
  absorbExternals(r, mdl, o);
  return o;
}
// after a non-rung tx (swap, keeper settle, funding, advance): re-read the market side
async function refresh(r, mdl, label) { return verify(r, mdl, label, { external: true }); }

// one rung transaction, predicted by the model: result, prints, then state
async function act(r, mdl, label, sender, fn, args, op, { extra } = {}) {
  const saved = structuredClone(mdl.m);
  const ev = [];
  let want;
  try { want = { ok: op(ev) }; } catch (e) { if (!(e instanceof CErr)) throw e; for (const k of Object.keys(mdl.m)) delete mdl.m[k]; Object.assign(mdl.m, saved); ev.length = 0; want = { err: e.code }; }
  const tx = await send(sender, r.id, fn, args);
  let wantRes = want;
  if (want.ok && typeof want.ok === 'object' && 'orphan' in want.ok) { const { orphan, ...rest } = want.ok; wantRes = { ok: rest }; }
  check(`${r.name} ${label}: result`, eq(tx.res, wantRes), `${show(tx.res)}${eq(tx.res, wantRes) ? '' : ` want ${show(wantRes)}`}`);
  const got = prints(tx.receipt, [LADDER]);
  const expected = want.ok !== undefined ? ev.map((e) => ({ ...e, rung: r.id, side: r.band, price: r.bps })) : [];
  const pd = got.length === expected.length ? expected.flatMap((e, i) => diff(got[i], e, `[${i}]`)) : [`count ${got.length} vs ${expected.length}: ${got.map((g) => g.event).join(',')} vs ${expected.map((g) => g.event).join(',')}`];
  check(`${r.name} ${label}: ladder prints ${expected.map((e) => e.event.slice(5)).join(',') || 'none'}`, pd.length === 0, pd.join(' | '));
  if (extra) extra(tx, want);
  await verify(r, mdl, label);
  return { tx, want, ev };
}

// ------------------------------------------------------------ fills ------
let MID = 0n, UPD;
const upd = () => bufferCV(Buffer.from(UPD.hex.replace(/^0x/, ''), 'hex'));
const ceilDiv = (a, b) => (a + b - 1n) / b;
function grossFor(net) {
  // v6-3 charges rebate on net: net = floor(gross * 10000 / 10020).
  return ceilDiv(net * 10020n, 10000n);
}

const takerFor = (r) => r.buy ? mk(961) : mk(962);
// real swap against the rung's resting order, leaving `keep` units of its live position
async function fill(r, mdl, keep, label) {
  const m = mdl.m, L = m.live;
  check(`${r.name} ${label}: rung rests before the fill`, L >= r.min && m.parked === 0n, `live ${L}`);
  const l = await evalIn(MARKET, `(token-${r.side}-limit-at '${r.id} u${MID})`);
  const taker = takerFor(r);
  let args, expectKeep;
  if (r.buy) {
    const xt = L - keep, net = ceilDiv(xt * l, 10n ** 10n);
    args = [uintCV(grossFor(net)), uintCV(l + l / 100n), upd(), T.x, A.x, T.y, A.y, boolCV(false)];
    expectKeep = keep;
  } else {
    const X = (L - keep) * 10n ** 10n / l, yt = X * l / 10n ** 10n;
    args = [uintCV(grossFor(X)), uintCV(l - l / 100n), upd(), T.x, A.x, T.y, A.y, boolCV(true)];
    expectKeep = L - yt;
  }
  const before = { pbal: m.pbal, qbal: m.qbal };
  const t = await send(taker, MARKET, 'swap', args);
  check(`${r.name} ${label}: swap fills the rung (keep ${expectKeep})`, !!t.res.ok, show(t.res));
  await refresh(r, mdl, `${label} (after swap)`);
  const kept = m.live + (m.pbal - before.pbal);
  check(`${r.name} ${label}: rung kept exactly ${expectKeep}${expectKeep < r.min ? ' (refunded under the market minimum)' : ' on the book'}`,
    kept === expectKeep && (expectKeep < r.min ? m.live === 0n : m.live === expectKeep) && m.qbal > before.qbal, `live ${m.live} refunded ${m.pbal - before.pbal} proceeds +${m.qbal - before.qbal}`);
  return expectKeep;
}

// ------------------------------------------------------------ probe ------
const probeSrc = (rs) => rs.map((r) => `
(define-public (probe-${r.dir} (who principal) (e uint))
  (ok {
    pos: (contract-call? .${r.name} get-position who),
    st: (contract-call? .${r.name} get-state),
    bps: (contract-call? .${r.name} get-spread-bps),
    guard: (contract-call? .${r.name} ${r.guardGetter}),
    mm: (contract-call? .${r.name} miner-mid),
    cg: (contract-call? .${r.name} ${r.guardFn}),
    mn: (contract-call? .${r.name} min-market),
    fu: (contract-call? .${r.name} final-unfilled e),
    fi: (contract-call? .${r.name} final-index e),
    fs: (contract-call? .${r.name} final-scale e),
    c2: (contract-call? .${r.name} carried u123456789 u0 u2),
    c4: (contract-call? .${r.name} carried u123456789 u0 u4),
    ea: (contract-call? .${r.name} earned u1000000 u0 u0 u0 u5000000000000000000),
    es: (contract-call? .${r.name} earned-step u1 { shares: u7, from: u0, to: u0, paid: u0, upto: u0, owed: u3 }),
    ms: (contract-call? .${r.name} market-size),
    pl: (contract-call? .${r.name} ${r.pooledFn}),
  }))`).join('\n');
async function probe(r, mdl, who, e, label) {
  const m = mdl.m, t = await send(stranger, PROBE, `probe-${r.dir}`, [P_(who), uintCV(e)]);
  const o = t.res.ok, g = r.buy ? m.mm / 2n : m.mm * 2n;
  const want = {
    pos: mdl.getPosition(who),
    st: { 'spread-bps': r.bps, [r.guardVar]: m.guard, epoch: m.ep, 'total-shares': m.ts, members: m.mem, scale: m.sc, 'unfilled-index': m.ui, 'proceeds-index': m.pi, [r.heldVar]: m.held, resting: msize(m), pooled: m.ts * m.ui / S },
    bps: r.bps, guard: m.guard, mm: m.mm, cg: g, mn: r.min, fu: mdl.finalUnfilled(e), fi: mdl.finalIndex(e), fs: mdl.finalScale(e),
    c2: 123n, c4: 0n, ea: 5000000n, es: { shares: 7n, from: 0n, to: 0n, paid: 0n, upto: 0n, owed: 3n }, ms: msize(m), pl: m.ts * m.ui / S,
  };
  const d = diff(o, want);
  check(`${r.name} probe ${label}: every read-only, traced in a tx, as modelled`, !!o && d.length === 0, d.join(' | ') || `pos ${show(o.pos)} mm ${o.mm}`);
}

// ------------------------------------------------------------ phases -----
const B = rungCfg('buy', 20), Sl = rungCfg('sell', 20), B30 = rungCfg('buy', 30), S30 = rungCfg('sell', 30);
const MB = new Model(B), MS = new Model(Sl);
const U = (r, n) => BigInt(n) * r.u;

async function fund(r, mdl, who, amount) {
  if (r.buy) await sbtcTransfer(WHALE.x, who, amount); else await stxTransfer(WHALE.y, who, amount);
}

async function guards(r, r30, mdl) {
  const m = mdl.m;
  const up = someCV(upd());
  await act(r, mdl, 'sync before initialize -> u7003', keeper, 'sync', [], (ev) => mdl.sync(ev));
  await act(r, mdl, 'deposit before initialize -> u7003', keeper, 'deposit', [uintCV(r.MIN_DEPOSIT)], (ev) => mdl.deposit(keeper, r.MIN_DEPOSIT, ev));
  await act(r, mdl, 'push before initialize -> u7003', keeper, 'push', [], (ev) => mdl.push(keeper, ev));
  await txExpect(`${r.name} refresh-guard before initialize -> u7003`, keeper, r.id, 'refresh-guard', [], { err: 7003n });
  await act(r, mdl, 'withdraw without a position -> u7006', keeper, 'withdraw', [uintCV(1), up], (ev) => mdl.withdraw(keeper, 1n, true, ev));
  await act(r, mdl, 'claim without a position -> u7006', keeper, 'claim', [], (ev) => mdl.claim(keeper, ev));
  await txExpect(`${r.name} initialize by a stranger -> u7001`, stranger, r.id, 'initialize', [uintCV(r.bps), boolCV(true)], { err: 7001n });
  await txExpect(`${r.name} initialize at 10000 bps -> u7010`, DEP, r.id, 'initialize', [uintCV(10000), boolCV(true)], { err: 7010n });
  await txExpect(`${r.name} initialize at a spread its name does not carry -> u7009`, DEP, r.id, 'initialize', [uintCV(r.bps + 1n), boolCV(true)], { err: 7009n });
  await txExpect(`${r.name} seated initialize before the side is canonical -> ladder u6003`, DEP, r.id, 'initialize', [uintCV(r.bps), boolCV(true)], { err: 6003n });
  await txExpect(`${r30.name} unseated initialize before the side is canonical -> ladder u6003`, DEP, r30.id, 'initialize', [uintCV(r30.bps), boolCV(false)], { err: 6003n });
  await txExpect(`${r.name} canonical for ${r.band}`, DEP, LADDER, 'set-canonical', [stringAsciiCV(r.band), P_(r.id)], { ok: true });
  await txExpect(`${r.name} initialize seated`, DEP, r.id, 'initialize', [uintCV(r.bps), boolCV(true)], { ok: true });
  m.init = true;
  await txExpect(`${r.name} initialize twice -> u7002`, DEP, r.id, 'initialize', [uintCV(r.bps), boolCV(true)], { err: 7002n });
  const reg = await evalIn(LADDER, `{ reg: (get-registered '${r.id}), band: (is-band-${r.side} '${r.id}), seated: (is-some (index-of? (contract-call? '${MARKET} get-seated-${r.side}) '${r.id})) }`);
  check(`${r.name} registered at (${r.band}, ${r.bps}), seated on the ladder and the market`, eq(reg, { reg: { side: r.band, price: r.bps }, band: true, seated: true }), show(reg));
  await txExpect(`${r30.name} initialize unseated`, DEP, r30.id, 'initialize', [uintCV(r30.bps), boolCV(false)], { ok: true });
  const reg30 = await evalIn(LADDER, `{ reg: (get-registered '${r30.id}), band: (is-band-${r.side} '${r30.id}) }`);
  check(`${r30.name} registered unseated (prints, no seat)`, eq(reg30, { reg: { side: r.band, price: r30.bps }, band: false }), show(reg30));
  await txExpect(`${r.name} set-push-paused by a stranger -> u7001`, stranger, r.id, 'set-push-paused', [boolCV(true)], { err: 7001n });
  await verify(r, mdl, 'after guards');
}

async function pushPaused(r, mdl, paused) {
  const t = await txExpect(`${r.name} set-push-paused ${paused} by the ladder owner`, DEP, r.id, 'set-push-paused', [boolCV(paused)], { ok: true });
  const own = (t.receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e).filter((e) => e.contract_event?.contract_identifier === r.id).map((e) => plain(deserializeCV(e.contract_event.raw_value)));
  check(`${r.name} rung-push-paused print`, own.length === 1 && eq(own[0], { event: 'rung-push-paused', paused }), show(own));
  mdl.m.paused = paused;
  await verify(r, mdl, `push paused ${paused}`);
}

// e0 + a + b + c for one rung (the other rung stays off the book)
async function scenarioABC(r, mdl, base) {
  const m = mdl.m, up = someCV(upd());
  const who = (k) => mk(base + k);
  const [K, Am, Bm, Cm, Dm, R, M8, E, F, G, H, I, M9] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(who);
  for (const p of [K, Am, Bm, Cm, Dm, R, M8, E, F, G, H, I, M9]) r.ppl.add(p);
  for (const p of [K, Am, Bm, Cm, Dm, M8, E, F, G, H, I, M9]) await fund(r, mdl, p, U(r, 1_000_000));
  await fund(r, mdl, R, U(r, 6_000_000));
  await refresh(r, mdl, 'members funded');
  const P = U(r, 300_000);
  const dep = (label, p, amt) => act(r, mdl, label, p, 'deposit', [uintCV(amt)], (ev) => mdl.deposit(p, amt, ev));
  const wd = (label, p, amt, u = up) => act(r, mdl, label, p, 'withdraw', [uintCV(amt), u], (ev) => mdl.withdraw(p, amt, u.type !== 'none', ev));
  const claim = (label, p) => act(r, mdl, label, p, 'claim', [], (ev) => mdl.claim(p, ev));
  const push = (label, p = keeper) => act(r, mdl, label, p, 'push', [], (ev) => mdl.push(p, ev));

  // ---- e0: a pool under the market minimum ----
  console.log(`\n=== ${r.name}: e0 small pool ===`);
  await txExpect(`${r.name} refresh-guard with nothing on the market -> market u1005`, keeper, r.id, 'refresh-guard', [], { err: 1005n });
  await act(r, mdl, 'deposit under the minimum -> u7005', stranger, 'deposit', [uintCV(r.MIN_DEPOSIT - 1n)], (ev) => mdl.deposit(stranger, r.MIN_DEPOSIT - 1n, ev));
  await act(r, mdl, 'unfunded deposit -> token transfer u1', poor, 'deposit', [uintCV(r.MIN_DEPOSIT)], (ev) => mdl.deposit(poor, r.MIN_DEPOSIT, ev));
  await dep('K deposits the minimum: held (under the market minimum)', K, r.MIN_DEPOSIT);
  check(`${r.name} held, not pushed`, mdl.lastPush === 'under-min' && m.held === r.MIN_DEPOSIT);
  await dep('K tops up, still under the market minimum', K, U(r, 400));
  await push('push with the pool under the market minimum -> (ok false)');
  check(`${r.name} push refused under min`, mdl.lastPush === 'under-min');
  await wd('K withdraws 0 -> u7004', K, 0n);
  await wd('K partial exit paid from held', K, U(r, 200));
  check(`${r.name} partial from held`, mdl.lastExit.pull === 'held' && !mdl.lastExit.full);
  await wd('K last member full exit closes the epoch', K, BIG);
  check(`${r.name} last-member close (shares 0)`, mdl.lastExit.close && mdl.lastExit.leftoverShares === 0n);
  await push('push with nothing held -> (ok false)');
  check(`${r.name} nothing to push`, mdl.lastPush === 'nothing');

  // ---- a: rescale ----
  console.log(`\n=== ${r.name}: a rescale ===`);
  const amts = r.buy ? [123457n, 76543n, 54321n, 45679n] : [123456789n, 76543211n, 54320987n, 45679013n];
  for (const [i, p] of [Am, Bm, Cm, Dm].entries()) await dep(`${'ABCD'[i]} deposits at scale ${m.sc}`, p, amts[i]);
  check(`${r.name} pool of ${P} rests on the market`, m.live === P && m.held === 0n, `live ${m.live}`);
  const rg = await send(keeper, r.id, 'refresh-guard', []);
  check(`${r.name} refresh-guard moves the market's guard (opposite side empty -> set now)`, eq(rg.res, { ok: true }), show(rg.res));
  m.guard = r.buy ? m.mm / 2n : m.mm * 2n;
  await verify(r, mdl, 'after refresh-guard');
  const lim = await evalIn(MARKET, `(get-token-${r.side}-order '${r.id})`);
  check(`${r.name} market order is the miner band, spread ${r.bps}`, eq(lim?.limit, m.guard) && eq(lim?.['spread-bps'], r.bps), show(lim));
  await probe(r, mdl, Am, m.ep, 'current position');
  await probe(r, mdl, stranger, m.ep, 'no position');
  const sc0 = m.sc;
  let round = 0, f8done = false, rpartial = false;
  while (m.sc - sc0 < 4n) {
    round++; if (round > 14) throw new Error('rescale loop did not converge');
    if (m.sc - sc0 === 3n && m.ui * 15n / 1000n < MINT_FLOOR * 99n / 100n) {
      // the 4th rescale comes with this fill: make sure its rounding leaves shares
      // nobody owns (sum of each position's shares mod 1000, plus what is already
      // unowned, reaches 1000), for the last-member close in b
      for (let k = 0; k < 4; k++) {
        const owned = [...m.pos.values()].filter((p) => p.epoch === m.ep).map((p) => mdl.carried(p.shares, p.scale, m.sc));
        const unowned = m.ts - owned.reduce((a, x) => a + x, 0n), frac = owned.reduce((a, x) => a + x % 1000n, 0n) + unowned;
        if (frac >= 1000n) break;
        const need = 1000n - frac;
        const mine = m.pos.get(M9) ? mdl.carried(m.pos.get(M9).shares, m.pos.get(M9).scale, m.sc) : 0n;
        let amt = r.MIN_DEPOSIT;
        while ((mine + amt * S / m.ui) % 1000n < 990n) amt++;
        await dep(`M9 deposits ${amt} so the coming rescale leaves unowned shares (needed ${need})`, M9, amt);
      }
    }
    await fill(r, mdl, m.live * 15n / 1000n, `round ${round}`);
    const scBefore = m.sc, nRes = mdl.rescaleLog.length;
    const refill = P - m.live - m.held;
    await dep(`R refills ${refill} (round ${round}, index before ${m.ui})`, R, refill);
    if (m.sc > scBefore) {
      const rs = mdl.rescaleLog[nRes];
      check(`${r.name} rescale ${rs.scale}: index ${rs.newIndex} in [1e6, 1e9) -> x1000 = ${rs.ui}, shares ${rs.sharesBefore} / 1000 = ${rs.ts}, scale-start ${rs.np}`, rs.newIndex >= 1000000n && rs.newIndex < MINT_FLOOR && rs.ui === rs.newIndex * 1000n && rs.ts === rs.sharesBefore / 1000n);
      const worst = rs.losses.reduce((a, x) => x.lossScaled > a ? x.lossScaled : a, 0n);
      check(`${r.name} rescale ${rs.scale}: every position loses under 1 unit (worst ${worst} / 1e12), value drop <= 1 after flooring`,
        rs.losses.every((x) => x.lossScaled < S && x.preValue - x.postValue <= 1n && x.preValue >= x.postValue), rs.losses.map((x) => `${x.who.slice(0, 6)} ${x.preValue}->${x.postValue}`).join(', '));
      const c = m.sc - sc0;
      if (c === 1n) await claim('A acts after 1 rescale: claim pays both segments', Am);
      if (c === 2n) await dep('B acts after 2 rescales: deposit carries it 2 steps and adds', Bm, r.MIN_DEPOSIT * 3n);
      if (c === 3n) await claim('C acts after 3 rescales: claim pays four segments', Cm);
      if (c === 4n) {
        const before = mdl.getPosition(Dm);
        await claim('D acts 4 rescales behind: carried to 0, early proceeds still paid', Dm);
        check(`${r.name} D: shares carried to 0, proceeds of segments 0..3 paid (${before[r.qKey]})`, before.shares === 0n && before[r.qKey] > 0n && m.pos.get(Dm).shares === 0n, show(before));
        await wd('D exits with a 0-worth position: burns, moves nothing', Dm, BIG);
        check(`${r.name} D exit take 0`, mdl.lastExit.full && mdl.lastExit.take === 0n);
      }
    } else if (!rpartial) {
      await wd('R partial exit from the market', R, U(r, 1000));
      check(`${r.name} R partial from market`, mdl.lastExit.pull === 'partial' && !mdl.lastExit.full);
      rpartial = true;
    }
    if (!f8done && m.ui < S) {
      // a deposit whose (mine - 1) exit leaves shares worth under 1 unit (ARION F-8)
      let a = r.MIN_DEPOSIT, found = null;
      for (let k = 0n; k < 20000n && !found; k++) {
        const amt = a + k, sh = amt * S / m.ui, mine = sh * m.ui / S;
        if (mine < 2n) continue;
        const part = ((mine - 1n) * S + m.ui - 1n) / m.ui;
        if ((sh - part) * m.ui / S === 0n) found = { amt, mine };
      }
      if (found) {
        await dep(`M8 deposits ${found.amt}`, M8, found.amt);
        await wd(`M8 asks mine - 1 = ${found.mine - 1n}: the rest would be worth 0, so a full exit`, M8, found.mine - 1n);
        check(`${r.name} F-8 partial became a full exit`, mdl.lastExit.f8 && mdl.lastExit.full && mdl.lastExit.pull === 'partial');
        f8done = true;
      }
    }
  }
  check(`${r.name} F-8 case found and run`, f8done);
  // ---- b: last member closes with leftover rescale shares ----
  console.log(`\n=== ${r.name}: b last-member close with leftover shares ===`);
  for (const [n, p] of [['A', Am], ['B', Bm], ['C', Cm], ['M9', M9]].filter(([, q]) => m.pos.has(q))) await wd(`${n} full exit`, p, BIG);
  const rShares = m.pos.get(R).shares, left = m.ts - mdl.carried(rShares, m.pos.get(R).scale, m.sc);
  check(`${r.name} before the last exit: total-shares ${m.ts} > R's ${rShares} (leftover ${left})`, left > 0n && m.mem === 1n);
  const epClose = m.ep;
  await wd('R, the last member, exits: members 0 with shares left -> close', R, BIG);
  check(`${r.name} closed at members 0 while ${mdl.lastExit.leftoverShares} rescale shares had no owner; index reset`, mdl.lastExit.close && mdl.lastExit.leftoverShares > 0n && m.ep === epClose + 1n && m.ts === 0n && m.ui === S && mdl.lastExit.pull === 'cancel');
  const orphanUnits = msize(m) + m.held;
  // ---- c: tail roll by one fill under 1e6, 3 members ----
  console.log(`\n=== ${r.name}: c tail roll (index) with 3 members ===`);
  const e1 = await dep('E deposits first: prior epoch left no funds', E, P / 3n);
  check(`${r.name} orphan ${orphanUnits} counted in E's shares`, e1.want.ok.orphan === orphanUnits && orphanUnits === 0n && m.qbal === 0n, `orphan ${e1.want.ok.orphan}`);
  await dep('F deposits', F, P / 3n);
  await dep('G deposits', G, P / 3n);
  await fill(r, mdl, m.live * 15n / 1000n, 'c pre-fill');
  await dep('F refills', F, P - m.live - m.held);
  const recorded = m.ts * m.ui / S, rmax = (1000000n * recorded - 1n) / m.ui;
  check(`${r.name} a window for an index tail roll: dust ${r.DUST} <= keep <= ${rmax}`, rmax >= r.DUST + (r.buy ? 2n : 3000n), `ui ${m.ui} recorded ${recorded}`);
  await fill(r, mdl, r.DUST + (rmax - r.DUST) / 3n, 'c fill over 99.9%');
  await probe(r, mdl, G, m.ep, 'current position before the roll');
  const epRoll = m.ep;
  await claim('G claims: sync tail-rolls (index under 1e6), G takes its reserve share', G);
  check(`${r.name} index tail roll: ${show(mdl.lastRoll)}`, mdl.lastRoll.epoch === epRoll && mdl.lastRoll.why === 'index' && !mdl.lastRoll.hadMarket && mdl.lastRoll.members === 3n && mdl.lastRoll.ui < 1000000n);
  await probe(r, mdl, E, epRoll, 'old-epoch position');
  await claim('E claims its rounded reserve share', E);
  const resBefore = m.res, heldBefore = m.held;
  await wd('F, the last old member, withdraws both exact reserve remainders', F, BIG);
  check(`${r.name} last old claim pays all epoch input and proceeds`, mdl.lastExit.old && mdl.lastRelease?.epoch === epRoll && !m.eres.has(epRoll) && m.res === 0n && m.pbal === 0n && m.qbal === 0n);
  // ---- c': dust tail roll ----
  console.log(`\n=== ${r.name}: c dust tail roll ===`);
  await dep('H deposits into the next epoch with no prior dust', H, P / 2n);
  await dep('I deposits', I, P / 2n);
  await fill(r, mdl, r.buy ? 5n : 4000n, 'dust fill');
  const epDust = m.ep;
  await claim('H claims: sync tail-rolls on dust (index still >= 1e6)', H);
  check(`${r.name} dust tail roll: ${show(mdl.lastRoll)}`, mdl.lastRoll.epoch === epDust && mdl.lastRoll.why === 'dust' && mdl.lastRoll.ui >= 1000000n && !mdl.lastRoll.hadMarket);
  await dep('I deposits again: its old-epoch share is paid first, the reserve dust released, then a fresh position', I, P / 2n);
  check(`${r.name} I's old-epoch reserve paid inside deposit, last one releases`, mdl.lastRelease?.epoch === epDust);
  await wd('I, the only member, exits: closes the epoch', I, BIG);
  check(`${r.name} market position empty after the rung scenarios`, msize(m) === 0n && m.res === 0n, `msize ${msize(m)} res ${m.res}`);
}

// d: both rungs on the book
async function scenarioD() {
  const up = someCV(upd()), none = noneCV();
  const rs = [[B, MB], [Sl, MS]];
  const P = (r, k) => mk((r.buy ? 940 : 950) + k);
  for (const [r, mdl] of rs) { for (let k = 0; k <= 6; k++) { r.ppl.add(P(r, k)); await fund(r, mdl, P(r, k), U(r, 2_000_000)); } }
  for (const [r, mdl] of rs) await refresh(r, mdl, 'd members funded');
  const dep = (r, mdl, label, p, amt) => act(r, mdl, label, p, 'deposit', [uintCV(amt)], (ev) => mdl.deposit(p, amt, ev));
  const wd = (r, mdl, label, p, amt, u) => act(r, mdl, label, p, 'withdraw', [uintCV(amt), u], (ev) => mdl.withdraw(p, amt, u.type !== 'none', ev));
  const push = (r, mdl, label, p = keeper) => act(r, mdl, label, p, 'push', [], (ev) => mdl.push(p, ev));
  const claim = (r, mdl, label, p) => act(r, mdl, label, p, 'claim', [], (ev) => mdl.claim(p, ev));
  const allRefresh = async (label) => { for (const [r, mdl] of rs) await refresh(r, mdl, label); };
  const keeperSettle = async (r, mdl, label) => {
    const t = await send(keeper, MARKET, `settle-token-${r.side}-deposit`, [P_(r.id), upd(), T[r.side], A[r.side]]);
    check(`${r.name} ${label}: keeper settles the rung's pending on the market`, !!t.res.ok, show(t.res));
    for (const [r2, m2] of rs) await refresh(r2, m2, `${label} (after keeper settle)`);
  };
  const grief = async (r, mdl) => {
    if (r.buy) await sbtcTransfer(stranger, r.id, 1n); else await stxTransfer(stranger, r.id, 1n);
    await allRefresh('stranger sent 1 unit');
    await push(r, mdl, 'stranger pushes the 1 unit: a young 1-unit pending', stranger);
    check(`${r.name} grief pending of 1`, mdl.lastPush === 'pending' && mdl.m.pend === 1n);
  };
  await sbtcTransfer(WHALE.x, stranger, 10n); await stxTransfer(WHALE.y, stranger, 10n);
  await allRefresh('stranger funded');

  console.log('\n=== d0: dust roll with a pending on the book (roll-tail cancels it) ===');
  await dep(B, MB, 'P0 deposits (opposite side empty: direct)', P(B, 0), U(B, 200_000));
  check('buy direct placement', MB.lastPush === 'direct');
  await allRefresh('after buy placement');
  await dep(Sl, MS, 'Q0 deposits (buy rung on the book: pending)', P(Sl, 0), U(Sl, 200_000));
  check('sell pending', MS.lastPush === 'pending');
  await keeperSettle(Sl, MS, 'Q0');
  await grief(B, MB); await grief(Sl, MS);
  await fill(B, MB, 0n, 'd0 sell-out');
  await allRefresh('after buy sell-out');
  await claim(B, MB, 'P0 claims: 1 unit left (the pending) < dust -> tail roll cancels the pending', P(B, 0));
  check('buy roll-tail with a market position (pending 1)', MB.lastRoll.hadMarket && MB.lastRoll.why === 'dust' && MB.lastRelease?.epoch === MB.lastRoll.epoch);
  await allRefresh('after buy roll');
  await fill(Sl, MS, 0n, 'd0 sell-out');
  await claim(Sl, MS, 'Q0 claims: pending 1 + refunded remainder < dust -> tail roll cancels the pending', P(Sl, 0));
  check('sell roll-tail with a market position (pending 1)', MS.lastRoll.hadMarket && MS.lastRoll.why === 'dust' && MS.lastRelease?.epoch === MS.lastRoll.epoch);
  await allRefresh('after sell roll');

  console.log('\n=== d1-d7: grief pending, refused push, exits that need the pending ===');
  for (const [k, n] of [[1, 100_000], [2, 100_000], [3, 300_000]]) { await dep(B, MB, `P${k} deposits`, P(B, k), U(B, n)); }
  check('buy placed directly (sell rung off the book)', MB.lastPush === 'direct' && MB.m.pend === 0n);
  await allRefresh('buy placed');
  for (const [k, n] of [[1, 100_000], [2, 100_000], [3, 300_000]]) {
    await dep(Sl, MS, `Q${k} deposits (pending)`, P(Sl, k), U(Sl, n));
    check('sell pending', MS.lastPush === 'pending');
    await keeperSettle(Sl, MS, `Q${k}`);
  }
  for (const [r, mdl] of rs) await grief(r, mdl);
  for (const [r, mdl] of rs) {
    await wd(r, mdl, 'member 1 exits 50k with NO update while the 1-unit pending is young: live + held pay it', P(r, 1), U(r, 50_000), none);
    check(`${r.name} exit did not touch the pending`, mdl.lastExit.escrow === 'no' && mdl.lastExit.pull === 'partial' && mdl.m.pend === 1n);
  }
  for (const [r, mdl] of rs) {
    await dep(r, mdl, 'member 2 deposits 400k while a pending is open: the market refuses (u1031), held', P(r, 2), U(r, 400_000));
    check(`${r.name} market refusal holds`, mdl.lastPush === 1031n && mdl.m.held === U(r, 400_000));
    await push(r, mdl, 'keeper push while the pending is open -> (ok false)');
    check(`${r.name} push refused by the market`, mdl.lastPush === 1031n);
  }
  for (const [r, mdl] of rs) {
    await keeperSettle(r, mdl, 'grief');
    await push(r, mdl, 'keeper pushes the held 400k: a big young pending');
    check(`${r.name} big pending`, mdl.lastPush === 'pending' && mdl.m.pend === U(r, 400_000));
  }
  for (const [r, mdl] of rs) {
    await wd(r, mdl, 'member 2 full exit needs the pending, no update -> u7012', P(r, 2), BIG, none);
    await txExpect('market paused by the operator', DEP, MARKET, 'set-paused', [boolCV(true)], { ok: true });
    for (const [, m2] of rs) m2.m.marketPaused = true;
    await wd(r, mdl, 'member 2 full exit with an update while the market is paused -> settle u1007', P(r, 2), BIG, up);
    await txExpect('market unpaused', DEP, MARKET, 'set-paused', [boolCV(false)], { ok: true });
    for (const [, m2] of rs) m2.m.marketPaused = false;
    await wd(r, mdl, 'member 2 full exit with an update: settles the pending, then a partial market withdraw', P(r, 2), BIG, up);
    check(`${r.name} escrow settled for the exit`, mdl.lastExit.escrow === 'settle' && mdl.lastExit.pull === 'partial' && mdl.m.pend === 0n);
  }
  await allRefresh('after settle exits');
  for (const [r, mdl] of rs) {
    await dep(r, mdl, 'member 1 deposits 400k: a pending the next exit will need', P(r, 1), U(r, 400_000));
    check(`${r.name} pending for the timeout`, mdl.lastPush === 'pending');
  }
  for (const [r, mdl] of rs) await probe(r, mdl, P(r, 1), mdl.m.ep, 'd before the time advance');

  console.log('\n=== d8: 24h later (17300 synthetic blocks: the miner band reads 0 from here) ===');
  await advance(1, 17300, 86500);
  await allRefresh('after the time advance');
  for (const [r, mdl] of rs) check(`${r.name} pending older than 24h, miner-mid 0`, mdl.m.now >= mdl.m.pendAt + DAY && mdl.m.mm === 0n, `now ${mdl.m.now} pending at ${mdl.m.pendAt}`);
  for (const [r, mdl] of rs) {
    await wd(r, mdl, 'member 1 full exit needs the pending, no update: the 24h cancel, cooldown starts', P(r, 1), BIG, none);
    check(`${r.name} 24h cancel`, mdl.lastExit.escrow === 'cancel' && mdl.m.cat === mdl.m.now && msize(mdl.m) === 0n);
  }
  for (const [r, mdl] of rs) {
    await push(r, mdl, 'keeper push during the cooldown -> held (u7015)');
    check(`${r.name} cooldown refusal`, mdl.lastPush === 7015n);
    await dep(r, mdl, 'member 4 deposits during the cooldown: held (u7015)', P(r, 4), U(r, 1000));
    check(`${r.name} deposit held by cooldown`, mdl.lastPush === 7015n);
    await wd(r, mdl, 'member 3 exits 100k with no oracle during the cooldown', P(r, 3), U(r, 100_000), none);
    check(`${r.name} cooldown exit from held`, mdl.lastExit.pull === 'held');
  }
  for (const [r, mdl] of rs) {
    await txExpect(`${r.name} set-push-paused by a stranger -> u7001`, stranger, r.id, 'set-push-paused', [boolCV(true)], { err: 7001n });
    await pushPaused(r, mdl, true);
    await push(r, mdl, 'keeper push while push-paused -> (ok false) (u7014)');
    check(`${r.name} paused refusal`, mdl.lastPush === 7014n);
    await dep(r, mdl, 'member 4 deposits while push-paused: held', P(r, 4), U(r, 1000));
    await wd(r, mdl, 'member 3 withdraws while push-paused', P(r, 3), U(r, 1000), none);
    await pushPaused(r, mdl, false);
  }
  console.log('\n=== d9: the cooldown is over ===');
  await advance(1, 1, 200000);
  await allRefresh('after the cooldown');
  for (const [r, mdl] of rs) {
    check(`${r.name} cooldown over`, mdl.m.now >= mdl.m.cat + DAY);
    await push(r, mdl, 'keeper push after the cooldown: passes it, stops at the miner band (u7008, no miner spend on synthetic tenures)');
    check(`${r.name} push past the cooldown reaches the band guard`, mdl.lastPush === 7008n);
    await txExpect(`${r.name} refresh-guard with no miner data -> u7008`, keeper, r.id, 'refresh-guard', [], { err: 7008n });
    await dep(r, mdl, 'member 5 deposits with no miner data: held', P(r, 5), U(r, 1000));
    await probe(r, mdl, P(r, 3), mdl.m.ep, 'miner-mid err arm');
    for (const k of [3, 4, 5]) await wd(r, mdl, `member ${k} full exit (no oracle)`, P(r, k), BIG, none);
    check(`${r.name} last exit closed the epoch`, mdl.lastExit.close && mdl.m.mem === 0n);
  }
}

async function main() {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addContractDeploy({ contract_name: 'jing-core-v6', source_code: src('jing-core-v6'), clarity_version: ClarityVersion.Clarity5 });
  sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const first = (await getSimulationResult(sid)).steps.find((s) => s.Result?.Transaction || s.Transaction);
  check('deploy jing-core-v6 (working tree)', !!first);
  await deploy('jing-ladder-v1', src('jing-ladder-v1'));
  await deploy('markets-sbtc-stx-jing-v6-3', src('markets-sbtc-stx-jing-v6-3'));
  await txExpect('sync seats', DEP, MARKET, 'sync-seat-count', [], { ok: 10n });
  await txExpect('verify market', DEP, CORE, 'set-verified-contract', [P_(MARKET)], { ok: true });
  await txExpect('initialize market (min 1000 sats / 1 STX)', DEP, MARKET, 'initialize', [P_(MARKET), T.x, T.y, uintCV(1000), uintCV(1000000), uintCV(1), uintCV(45)], { ok: true });
  const stamp = await evalIn(MARKET, 'stacks-block-time');
  for (let i = 0; i < 40; i++) {
    const u = await retry(() => fetchLazerUpdateAny()), t = await retry(() => lazerFeedTimes(u.hex));
    if (t.at > Number(stamp)) { UPD = u; break; }
    await new Promise((res) => setTimeout(res, 3000));
  }
  if (!UPD) throw new Error('no Lazer update newer than the fork clock');
  MID = UPD.px * 100000000n / UPD.py;
  console.log(`fork clock ${stamp}, mid ${MID}`);
  for (const r of [B, B30, Sl, S30]) await deploy(r.name, src(r.file));
  await deploy('core-spread-probe', probeSrc([B, Sl]));
  for (const r of [B, Sl]) for (const p of [keeper, stranger, poor]) r.ppl.add(p);
  for (const [r, mdl] of [[B, MB], [Sl, MS]]) { await refresh(r, mdl, 'deployed'); }
  for (const [r, r30, mdl] of [[B, B30, MB], [Sl, S30, MS]]) await guards(r, r30, mdl);
  // takers
  await stxTransfer(WHALE.y, takerFor(B), 60_000_000_000n);
  await sbtcTransfer(WHALE.x, takerFor(Sl), 30_000_000n);
  await scenarioABC(B, MB, 900);
  const clearing = await evalIn(MARKET, '(var-get settle-clearing-price)');
  check('fill price basis: the settle clearing price is the Lazer mid used for sizing', clearing === MID, `${clearing} vs ${MID}`);
  await refresh(Sl, MS, 'before the sell scenarios');
  await scenarioABC(Sl, MS, 920);
  await scenarioD();
  for (const mdl of [MB, MS]) {
    const m = mdl.m;
    check(`${mdl.r.name}: all members paid, both token balances exactly zero`,
      m.pos.size === 0 && m.eres.size === 0 && msize(m) === 0n &&
      m.pbal === 0n && m.qbal === 0n && m.cp === 0n && m.res === 0n);
  }
  for (const [file, body] of sources) {
    const current = fs.readFileSync(new URL(`../contracts/${file}.clar`, import.meta.url), 'utf8');
    check(`${file}: deployed source unchanged`, current === body,
      crypto.createHash('sha256').update(body).digest('hex'));
  }
  console.log(`\n${passed}/${checks} checks green`);
  console.log(`https://stxer.xyz/simulations/mainnet/${sid}`);
}
main().catch((e) => { console.error(e); console.log(`${passed}/${checks} checks green; failed: ${failed.join('; ')}`); console.log(`https://stxer.xyz/simulations/mainnet/${sid}`); process.exit(1); });
