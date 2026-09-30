// Fork only. Run: node simulations/verify-v6-3-capacity.js
// markets-sbtc-stx-jing-v6-3 `get-taker-capacity` (cap-bid-fold, cap-ask-fold,
// cap-kept-bid-fold, cap-kept-ask-fold, gross-up). The function is read-only,
// so every read runs INSIDE a transaction through a tiny helper contract
// (`capprobe-v1`, one public `probe-<market>` per market that calls the
// market's get-taker-capacity and prints/returns the tuple), which puts it in
// the stxer debug traces. Every market is the unmodified working-tree source
// deployed as `capacity-*`. Every returned field (mid-cap, walk-cap, net-cap,
// gross-cap, min-taker) is predicted with a BigInt model of the contract math
// and asserted exactly; every swap is predicted with a BigInt model of the
// settlement + walk (limit filter, small-share filter, clearing, pro-rata
// distribution, rides, walk fills, rebates) and its result tuple, the
// taker's wallet and every maker's remaining size are asserted exactly.
//
// Both taker sides (deposit-x false = y taker buys sBTC from asks,
// deposit-x true = x taker sells sBTC into bids):
//  mix    empty-book probe (all zero); in-range makers (plain, spread-0 peg),
//         one EXACTLY at the 0.2% bar (counts) and one under it (excluded,
//         rolls whole at settlement), walk makers inside the limit (plain,
//         peg on), outside the limit, a switched-off peg, the taker's own
//         out-of-range opposite order (excluded for the taker, counted for
//         another principal), an out-of-range own-side maker (not counted),
//         a walk maker under a raised minimum (counted before the raise,
//         excluded after); taker limit out of range (all zero) and exactly
//         at the mid (walk zero). gross-cap + 3 minimums -> u1017 (nothing
//         moves), then exactly gross-cap on the fresh print FILLS.
//  own    own-side in-range makers (own < opposite): mid-cap = opposite - own;
//         gross-cap fills (own makers share the mid batch pro rata).
//  ownbig own >= opposite: mid-cap 0 with the taker in range, walk-cap only;
//         gross-cap fills.
//         (own/ownbig: every in-range limit sits EXACTLY at the swap print's
//         mid P and the pending side is settled with a print P2 != P, so the
//         settle crossing check passes and both sides rest in range at P.)
//  edge   gross-cap + a sub-minimum margin: fills and refunds exactly the
//         predicted rest.
//  foff   side FULL (49 ladder seats), the one unseated maker on the taker's
//         side is a switched-off peg: door-parks, min-taker 0, admitted;
//         gross-cap fills and parks it.
//  ftop   side FULL, the unseated maker is out of range: door-parks via the
//         distance slots; gross-cap fills and parks it.
//  fin    side FULL, the unseated maker is IN range (no door): min-taker =
//         smallest + 1, admitted (walk > smallest); gross-cap fills, bumps it.
//  fout   side FULL, no door, capacity <= smallest: not admitted, every cap
//         0 (net-cap 0), min-taker = smallest + 1; a swap netting exactly the
//         smallest is refused u1010, smallest + 1 enters and fails u1017.
//
// swap puts net = floor(gross * 10000 / (10000 + bps)) on the book; gross-up
// is its exact inverse at 20 bps: the largest gross whose net fits (checked
// below by brute force as a model check).
import fs from 'node:fs';
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV,
  standardPrincipalCV, noneCV, someCV, boolCV, makeUnsignedSTXTokenTransfer,
  deserializeCV, cvToString, getAddressFromPrivateKey,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, submitSimulationSteps, callContract, getNonce, setSender,
} from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const CORE = `${DEP}.jing-core-v6`;
const LADDER = `${DEP}.jing-ladder-v1`;
const PROBE = `${DEP}.capprobe-v1`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const STX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALES = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51' };
const principal = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const traits = { x: principal(SBTC), y: principal(STX) };
const assets = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const keeper = mk(873);
const source = (name) => fs.readFileSync(new URL(`../contracts/${name}.clar`, import.meta.url), 'utf8');
const cv = (hex) => cvToString(deserializeCV(hex));
const decode = (step) => {
  const r = step?.Result;
  if (r?.Eval?.Ok) return cv(r.Eval.Ok);
  if (r?.Transaction?.Ok) {
    const tx = r.Transaction.Ok;
    if (tx.vm_error || tx.post_condition_aborted) return `ENGINE-ERR ${JSON.stringify(tx)}`;
    return cv(tx.result);
  }
  return `ENGINE-ERR ${JSON.stringify(r)}`;
};
const ok = (v) => v.startsWith('(ok');
const update = (u) => bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex'));
let passed = 0, checks = 0, failures = 0, sid;
function check(label, actual, want) {
  checks++;
  const good = typeof want === 'function' ? want(actual) : actual === want;
  if (good) passed++; else failures++;
  console.log(`${good ? 'ok  ' : 'FAIL'} ${checks}. ${label}: ${String(actual).slice(0, 700)}${good ? '' : `; expected ${typeof want === 'function' ? want.toString() : want}`}`);
  if (!good) finishPhase();
  return good;
}
function finishPhase() {
  if (failures) {
    console.log(`${passed}/${checks} checks green`);
    throw new Error(`Stopped on failed checks. Fork: https://stxer.xyz/simulations/mainnet/${sid}`);
  }
}
async function retry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i < 6 && /block info|ECONNRESET|fetch failed|socket|50[234]/i.test(String(e?.message ?? e))) { await new Promise((r) => setTimeout(r, 3000)); continue; }
      throw e;
    }
  }
}
async function evRaw(cid, code) {
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Eval: [DEP, '', cid, code] }] }));
  return decode({ Result: out.steps[0] });
}
async function ev(label, cid, code, want) {
  const actual = await evRaw(cid, code);
  check(label, actual, want);
  return actual;
}
async function tx(label, sender, cid, fn, args, want) {
  const r = await retry(() => callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 }));
  const actual = r.vmError || r.pcAborted ? `ENGINE-ERR ${JSON.stringify(r)}` : r.result;
  check(label, actual, want);
  return r;
}
async function fund(side, who, amount) {
  if (side === 'x') {
    await tx(`fund ${amount} sats`, WHALES.x, SBTC, 'transfer', [uintCV(amount), principal(WHALES.x), principal(who), noneCV()], '(ok true)');
  } else {
    const raw = await makeUnsignedSTXTokenTransfer({ recipient: who, amount, nonce: await getNonce(sid, WHALES.y), network: 'mainnet', publicKey: '', fee: 0 });
    setSender(raw, WHALES.y);
    const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] }));
    check(`fund ${amount} uSTX`, decode({ Result: out.steps[0] }), '(ok true)');
  }
}
async function printAfter(stamp, notMid) {
  for (let attempt = 0; attempt < 45; attempt++) {
    const u = await fetchLazerUpdateAny();
    const times = await lazerFeedTimes(u.hex);
    const mid = u.px * 100_000_000n / u.py;
    if (times.at > stamp && (notMid == null || mid !== notMid)) return { ...u, at: times.at, mid };
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`No suitable signed feed after ${stamp}${notMid != null ? ` with mid != ${notMid}` : ''}`);
}
const corePrints = (receipt) => receipt.events.map((e) => typeof e === 'string' ? JSON.parse(e) : e)
  .filter((e) => e.committed && e.contract_event?.contract_identifier === CORE)
  .map((e) => cv(e.contract_event.raw_value));

// ---------------------------------------------------------------- model ---
const S = 10_000_000_000n, BPS = 10_000n, FEE = 10n, MAXU = (1n << 128n) - 1n, MIN_SHARE = 20n, REBATE = 20n;
const MIN_X = 1000n, MIN_Y = 1_000_000n, SMALLEST0 = 999999999999999999n;
const minB = (a, b) => (a < b ? a : b);
const sum = (ms) => ms.reduce((a, m) => a + m.amt, 0n);
const peggedAsk = (P, s, floor) => { const p = s < BPS ? P * (BPS + s) / BPS : MAXU; return p >= floor ? p : MAXU; };
const peggedBid = (P, s, cap) => { const p = s < BPS ? P * (BPS - s) / BPS : 0n; return p <= cap ? p : 0n; };
const pxAt = (side, m, P) => m.spread == null ? m.limit : side === 'y' ? peggedBid(P, m.spread, m.limit) : peggedAsk(P, m.spread, m.limit);
const inRange = (side, m, P) => side === 'y' ? pxAt('y', m, P) >= P : pxAt('x', m, P) <= P;
const rebateBps = (age) => age <= 30n ? 20n : age >= 80n ? 70n : 20n + (age - 30n);
const netOf = (gross, bps = REBATE) => gross * BPS / (BPS + bps);
function grossUp(net) {
  return net === 0n ? 0n : ((net + 1n) * (BPS + REBATE) - 1n) / BPS;
}
function grossFor(net, bps = REBATE) {
  for (let a = net; a < net + net / 100n + 10n; a++) if (netOf(a, bps) === net) return a;
  throw new Error(`no gross for net ${net}`);
}
// get-taker-capacity. bids / asks: the book in list order; seats: protected
// seats (taker and makers unseated); slots: distance-slots.
function capModel({ ds, P, limit, taker, bids, asks, minX = MIN_X, minY = MIN_Y, seats = 10n, slots = 10n }) {
  let bIn = 0n, bWalk = 0n, aIn = 0n, aWalk = 0n;
  const limB = ds ? limit : P, limA = ds ? P : limit;
  for (const m of bids) {
    const l = pxAt('y', m, P);
    if (l >= P) bIn += m.amt;
    else if (m.who !== taker && l !== 0n && l >= limB && m.amt >= minY) bWalk += m.amt * S / l;
  }
  for (const m of asks) {
    const l = pxAt('x', m, P);
    if (l <= P) aIn += m.amt;
    else if (m.who !== taker && l !== MAXU && l <= limA && m.amt >= minX) aWalk += m.amt * l / S;
  }
  const keptB = sum(bids.filter((m) => pxAt('y', m, P) >= P && m.amt * BPS >= bIn * MIN_SHARE));
  const keptA = sum(asks.filter((m) => pxAt('x', m, P) <= P && m.amt * BPS >= aIn * MIN_SHARE));
  const opposite = ds ? keptB * S / P : keptA * P / S;
  const own = ds ? aIn : bIn;
  const tin = ds ? limit <= P : limit >= P;
  const midCap = tin && opposite > own ? opposite - own : 0n;
  const walkCap = ds ? bWalk : aWalk;
  const mine = ds ? asks : bids, ts = ds ? 'x' : 'y';
  const full = BigInt(mine.length) >= 50n - seats;
  const off = mine.some((m) => pxAt(ts, m, P) === (ds ? MAXU : 0n));
  const outside = mine.some((m) => !inRange(ts, m, P));
  const door = full && (off || (slots > 0n && outside));
  const smallest = !full || door ? 0n : mine.reduce((a, m) => (m.amt < a ? m.amt : a), SMALLEST0);
  const minTaker = full && !door ? smallest + 1n : 0n;
  const admitted = !full || door || midCap + walkCap > smallest;
  const net = admitted ? midCap + walkCap : 0n;
  return { midCap: admitted ? midCap : 0n, walkCap: admitted ? walkCap : 0n, net, gross: grossUp(net), minTaker, opposite, own, full, door };
}
const capString = (c) => `(ok (tuple (gross-cap u${c.gross}) (mid-cap u${c.midCap}) (min-taker u${c.minTaker}) (net-cap u${c.net}) (walk-cap u${c.walkCap})))`;
// swap: settlement (limit filter, small-share filter, clearing, distribution)
// then cross-remainder (walk). own: the taker side AFTER any park/bump, in
// list order (the taker is appended at the end). opp: the other side.
function swapModel({ ts, P, gross, bps = REBATE, limit, taker, opp, own, minX = MIN_X, minY = MIN_Y }) {
  const ms = ts === 'y' ? 'x' : 'y';
  const net = gross * BPS / (BPS + bps), rebate = gross - net;
  const book = { [ts]: [...own.map((m) => ({ ...m })), { who: taker, amt: net, limit, spread: null }], [ms]: opp.map((m) => ({ ...m })) };
  if (sum(book.y) < minY || sum(book.x) < minX) return { err: '(err u1009)' };
  const next = { x: [], y: [] }, kept = { x: [], y: [] };
  for (const side of ['y', 'x']) for (const m of book[side]) (inRange(side, m, P) ? kept[side] : next[side]).push(m);
  for (const side of ['y', 'x']) {
    const base = sum(kept[side]);
    const k = [];
    for (const m of kept[side]) {
      if (m.amt * BPS < base * MIN_SHARE) { if (m.who === taker && side === ts) return { err: '(err u1020)' }; next[side].push(m); } else k.push(m);
    }
    kept[side] = k;
  }
  const Ty = sum(kept.y), Tx = sum(kept.x);
  const yvx = Tx * P / S, xb = yvx <= Ty;
  const yc = xb ? yvx : Ty, xc = xb ? Tx : Ty * S / P;
  const yfee = yc * FEE / BPS, xfee = xc * FEE / BPS;
  const rideY = ts === 'y' && Ty > 0n ? rebate * yc / Ty : 0n;
  const rideX = ts === 'x' && Tx > 0n ? rebate * xc / Tx : 0n;
  const xAfter = xc - xfee + rideX, yAfter = yc - yfee + rideY;
  const caller = { xr: 0n, yroll: 0n, yr: 0n, xroll: 0n };
  for (const m of kept.y) {
    const recv = m.amt * xAfter / Ty, unf = m.amt * (Ty - yc) / Ty;
    const isT = m.who === taker;
    const ref = unf > 0n && unf < minY && !(ts === 'y' && isT) ? unf : 0n;
    if (isT) { caller.xr = recv; caller.yroll = unf; }
    if (unf - ref > 0n) next.y.push({ ...m, amt: unf - ref });
  }
  for (const m of kept.x) {
    const recv = m.amt * yAfter / Tx, unf = m.amt * (Tx - xc) / Tx;
    const isT = m.who === taker;
    const ref = unf > 0n && unf < minX && !(ts === 'x' && isT) ? unf : 0n;
    if (isT) { caller.yr = recv; caller.xroll = unf; }
    if (unf - ref > 0n) next.x.push({ ...m, amt: unf - ref });
  }
  // walk
  let pending = rebate - (ts === 'y' ? rideY : rideX);
  const mMin = ms === 'x' ? minX : minY, tMin = ts === 'y' ? minY : minX;
  const sorted = [];
  for (const m of next[ms]) {
    const l = pxAt(ms, m, P);
    if (m.amt < mMin || (ms === 'x' ? (l === MAXU || l <= P || l > limit) : (l === 0n || l >= P || l < limit))) continue;
    const i = sorted.findIndex((e) => ms === 'x' ? l < e.l : l > e.l);
    const e = { m, l };
    if (i < 0) sorted.push(e); else sorted.splice(i, 0, e);
  }
  const tEntry = next[ts].find((m) => m.who === taker);
  let R = tEntry ? tEntry.amt : 0n, walkRecv = 0n;
  const fills = [];
  for (const { m, l } of sorted) {
    if (R === 0n || m.who === taker || m.amt < mMin) continue;
    const yAmt = ts === 'y' ? R : m.amt, xAmt = ts === 'y' ? m.amt : R;
    const xfy = yAmt * S / l;
    const xt = xAmt > xfy ? xfy : xAmt, yt = xt * l / S;
    if (xt === 0n || yt === 0n) continue;
    const reb = minB((ts === 'y' ? yt : xt) * bps / BPS, pending);
    pending -= reb;
    walkRecv += ts === 'y' ? xt - xt * FEE / BPS : yt - yt * FEE / BPS;
    R -= ts === 'y' ? yt : xt;
    const left = m.amt - (ts === 'y' ? xt : yt);
    m.amt = left === 0n || left < mMin ? 0n : left;
    fills.push({ who: m.who, xt, yt, l });
  }
  if (tEntry) tEntry.amt = 0n;
  if (R >= tMin) return { err: '(err u1017)', R, net, rebate };
  const result = ts === 'y'
    ? `(ok (tuple (rebate-refunded u${pending}) (token-x-received u${caller.xr + walkRecv}) (token-x-rolled u${caller.xroll}) (token-y-received u${caller.yr}) (token-y-rolled u${R})))`
    : `(ok (tuple (rebate-refunded u${pending}) (token-x-received u${caller.xr}) (token-x-rolled u${R}) (token-y-received u${caller.yr + walkRecv}) (token-y-rolled u${caller.yroll})))`;
  const rest = new Map();
  for (const side of ['x', 'y']) for (const m of next[side]) rest.set(`${side}:${m.who}`, m.amt);
  return { result, R, left: pending, received: (ts === 'y' ? caller.xr : caller.yr) + walkRecv, net, rebate, fills, rest, yc, xc, Tx, Ty };
}

// ----------------------------------------------------------- harness ---
const cidOf = (name) => `${DEP}.${name}`;
const pairArgs = () => [traits.x, assets.x, traits.y, assets.y];
let nextKey = 701;
const fresh = () => mk(nextKey++);
async function balances(cid, whos) {
  const code = `(list ${whos.map((w) => `(stx-get-balance '${w}) (unwrap-panic (contract-call? '${SBTC} get-balance '${w}))`).join(' ')})`;
  const v = await evRaw(cid, code);
  const nums = [...v.matchAll(/u(\d+)/g)].map((m) => BigInt(m[1]));
  if (nums.length !== whos.length * 2) throw new Error(`balance read failed: ${v}`);
  return Object.fromEntries(whos.map((w, i) => [w, { y: nums[2 * i], x: nums[2 * i + 1] }]));
}
async function newMarket(name) {
  const cid = cidOf(name);
  await tx(`${name}: verify in core`, DEP, CORE, 'set-verified-contract', [principal(cid)], '(ok true)');
  await tx(`${name}: initialize`, DEP, cid, 'initialize', [principal(cid), traits.x, traits.y, uintCV(MIN_X), uintCV(MIN_Y), uintCV(1), uintCV(45)], '(ok true)');
  return cid;
}
const depArgs = (side, m) => [uintCV(m.amt), uintCV(m.limit), m.spread == null ? noneCV() : someCV(uintCV(m.spread)), traits[side], assets[side]];
const tagOf = (side, m) => `${side} ${m.tag} ${m.amt} @ ${m.limit}${m.spread != null ? ` peg ${m.spread}bps` : ''}`;
// Direct deposit (opposite side empty -> book).
async function place(cid, side, m) {
  if (!m.funded) await fund(side, m.who, m.amt);
  await tx(`place ${tagOf(side, m)}`, m.who, cid, `deposit-token-${side}`, depArgs(side, m), `(ok u${m.amt})`);
}
// Pending deposit (opposite side resting) settled by a keeper with a print newer than submitted-at.
async function submitSettle(cid, side, m, U) {
  await fund(side, m.who, m.amt);
  await tx(`submit ${tagOf(side, m)} (pending)`, m.who, cid, `deposit-token-${side}`, depArgs(side, m), `(ok u${m.amt})`);
  await ev(`${m.tag} pending, not on the book`, cid, `{ b: (get-token-${side}-deposit (var-get current-cycle) '${m.who}), p: (is-some (get-token-${side}-pending-deposit '${m.who})) }`, '(tuple (b u0) (p true))');
  await tx(`keeper settles ${m.tag} with a later print`, keeper, cid, `settle-token-${side}-deposit`, [principal(m.who), U, traits[side], assets[side]], `(ok u${m.amt})`);
  await ev(`${m.tag} settled onto the book (not refunded)`, cid, `{ b: (get-token-${side}-deposit (var-get current-cycle) '${m.who}), p: (is-some (get-token-${side}-pending-deposit '${m.who})) }`, `(tuple (b u${m.amt}) (p false))`);
}
async function probe(label, name, c, P, limit, ds, taker) {
  const r = await tx(`${label}: get-taker-capacity (deposit-x ${ds})`, keeper, PROBE, `probe-${name}`, [uintCV(P), uintCV(limit), boolCV(ds), principal(taker)], capString(c));
  return r;
}
async function bookCheck(label, cid, m, side, want) {
  await ev(`${label}: ${m.tag} rests ${want}`, cid, `(get-token-${side}-deposit (var-get current-cycle) '${m.who})`, `u${want}`);
}
// Swap `gross` and assert the model: u1017 (nothing moves) or the exact fill.
async function swapCheck(label, cid, { ts, P, U, gross, limit, taker, opp, own, minX, minY, makers }) {
  const mdl = swapModel({ ts, P, gross, limit, taker, opp, own, minX, minY });
  const ms = ts === 'y' ? 'x' : 'y';
  await fund(ts, taker, gross);
  const whos = [taker, cid];
  const before = await balances(cid, whos);
  const cyc0 = await evRaw(cid, '(var-get current-cycle)');
  const r = await tx(`${label}: swap ${gross} (net ${mdl.net}) ${mdl.err ? 'fails' : 'fills'}`, taker, cid, 'swap', [uintCV(gross), uintCV(limit), U, ...pairArgs(), boolCV(ts === 'x')], mdl.err ?? mdl.result);
  const after = await balances(cid, whos);
  const ser = (o) => JSON.stringify(o, (_, v) => typeof v === 'bigint' ? String(v) : v);
  if (mdl.err) {
    check(`${label}: nothing moved`, ser(after), ser(before));
    await ev(`${label}: cycle not advanced`, cid, '(var-get current-cycle)', cyc0);
    return mdl;
  }
  const d = { x: after[taker].x - before[taker].x, y: after[taker].y - before[taker].y };
  const spent = -gross + mdl.left + mdl.R;
  check(`${label}: taker wallet (spent ${ts}, received ${ms})`, `${d[ts]} ${d[ms]}`, `${spent} ${mdl.received}`);
  check(`${label}: rem under the minimum (FILLED, no u1017)`, String(mdl.R < (ts === 'y' ? (minY ?? MIN_Y) : (minX ?? MIN_X))), 'true');
  await ev(`${label}: taker holds nothing on the book`, cid, `(list (get-token-x-deposit (var-get current-cycle) '${taker}) (get-token-y-deposit (var-get current-cycle) '${taker}))`,
    `(list u${mdl.rest.get(`x:${taker}`) ?? 0n} u${mdl.rest.get(`y:${taker}`) ?? 0n})`);
  for (const [side, m] of makers) await bookCheck(label, cid, m, side, mdl.rest.get(`${side}:${m.who}`) ?? 0n);
  void r;
  return mdl;
}

async function main() {
  // model self-checks: gross-up is the largest gross whose net fits
  {
    let hits = 0;
    // net-cap 0 means no swap: gross-up returns 0 (the guard), not the 1 that also nets 0
    const probe = (n) => { const g = grossUp(n); if (netOf(g) !== n) hits++; if (n > 0n && netOf(g + 1n) <= n) hits++; };
    for (let n = 0n; n < 200_000n; n++) probe(n);
    for (let n = 10n ** 15n; n < 10n ** 15n + 50_000n; n++) probe(n);
    check('model: net(gross-up(n)) = n and, for n > 0, net(gross-up(n) + 1) > n', String(hits), '0');
    check('model: gross-up(0) = 0', String(grossUp(0n)), '0');
  }
  // ---- fork + deploys --------------------------------------------------
  const kinds = ['mix', 'own', 'ownbig', 'edge', 'foff', 'ftop', 'fin', 'fout'];
  const names = kinds.flatMap((k) => [`capacity-${k}-y`, `capacity-${k}-x`]);
  const probeSrc = names.map((n) => `(define-public (probe-${n} (mid uint) (limit uint) (deposit-x bool) (taker principal))
  (let ((r (contract-call? .${n} get-taker-capacity mid limit deposit-x taker)))
    (print r)
    (ok r)))`).join('\n');
  const b = SimulationBuilder.new({ stacksNodeAPI: 'http://77.42.3.101/stacks-api' });
  for (const name of ['jing-core-v6', 'jing-ladder-v1']) b.withSender(DEP).addContractDeploy({ contract_name: name, source_code: source(name), clarity_version: ClarityVersion.Clarity5 });
  const market = source('markets-sbtc-stx-jing-v6-3');
  for (const name of names) b.withSender(DEP).addContractDeploy({ contract_name: name, source_code: market, clarity_version: ClarityVersion.Clarity5 });
  b.withSender(DEP).addContractDeploy({ contract_name: 'capprobe-v1', source_code: probeSrc, clarity_version: ClarityVersion.Clarity5 });
  sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const setup = await getSimulationResult(sid);
  for (const st of setup.steps.filter((s) => s.Result?.Transaction)) check('deploy exact working-tree source', decode(st), ok);
  const stamp = Number((await ev('fork clock', cidOf(names[0]), 'stacks-block-time', (v) => /^u\d+$/.test(v))).slice(1));
  const u = await printAfter(stamp);
  const P = u.mid, U = update(u);
  const bps = rebateBps(BigInt(Math.max(0, stamp - u.at)));
  console.log(`mid ${P}, print at ${u.at}, fork clock ${stamp}`);
  check('swap print is fresh: rebate at TAKER_REBATE_BPS (the rate gross-up assumes)', String(bps), '20');
  const cids = {};
  for (const name of names) cids[name] = await newMarket(name);
  await tx('ladder: 49 protected seats (FULL markets sync this; the others keep 10)', DEP, LADDER, 'set-max-band-per-side', [uintCV(49)], '(ok true)');
  const at = (k) => P * BigInt(k) / 1000n; // k per mille of mid
  const nameOf = (k, ts) => `capacity-${k}-${ts}`;
  const other = (s) => (s === 'y' ? 'x' : 'y');
  // a maker; `side` of the book it sits on
  const M = (tag, amt, limit, spread = null, who = fresh()) => ({ tag, who, amt: BigInt(amt), limit, spread: spread == null ? null : BigInt(spread) });

  // ================================================================ mix ==
  for (const ts of ['y', 'x']) {
    const name = nameOf('mix', ts), cid = cids[name], ms = other(ts), ds = ts === 'x';
    console.log(`PHASE mix-${ts}: ${ds ? 'x taker into bids' : 'y taker into asks'}, every maker kind`);
    const taker = fresh();
    const limit = ds ? at(950) : at(1050);
    await probe(`mix-${ts} empty book`, name, capModel({ ds, P, limit, taker, bids: [], asks: [] }), P, limit, ds, taker);
    // opposite book: in-range total T = 1e6 sats (asks) / 1e9 uSTX (bids): Bar = T/500 exactly, Und < T/500
    const inR = ds ? at(1010) : at(990);
    // maker-side minimum lowered 10x first (whale budget), so T = 1e5 sats / 1e8 uSTX
    const low = ds ? 100_000n : 100n;
    await tx(`mix-${ts}: operator lowers the ${ms} minimum to ${low}`, DEP, cid, `set-min-token-${ms}-deposit`, [uintCV(low)], '(ok true)');
    const opp = ds ? [
      M('K', 98_650_000, inR), M('Z(peg 0 in range)', 1_000_000, at(2000), 0), M('Bar(=0.2%)', 200_000, at(1005)), M('Und(<0.2%)', 150_000, at(1020)),
      M('W1', 300_000, at(990)), M('W2(peg on)', 250_000, at(2000), 200), M('Out(past limit)', 400_000, at(900)), M('Off(peg off)', 200_000, at(500), 100),
      M('Self(taker)', 200_000, at(980), null, taker), M('Tiny(<raised min)', 150_000, at(985)),
    ] : [
      M('K', 98_650, inR), M('Z(peg 0 in range)', 1000, at(500), 0), M('Bar(=0.2%)', 200, at(995)), M('Und(<0.2%)', 150, at(980)),
      M('W1', 300, at(1010)), M('W2(peg on)', 250, at(500), 200), M('Out(past limit)', 400, at(1100)), M('Off(peg off)', 200, at(1500), 100),
      M('Self(taker)', 200, at(1020), null, taker), M('Tiny(<raised min)', 150, at(1015)),
    ];
    const T = sum(opp.filter((m) => inRange(ms, m, P)));
    check(`mix-${ts} model: in-range T, Bar exactly T/500, Und below`, `${T} ${opp[2].amt * BPS === T * MIN_SHARE} ${opp[3].amt * BPS < T * MIN_SHARE}`, `${ds ? 100_000_000n : 100_000n} true true`);
    for (const m of opp) await place(cid, ms, m);
    const ownOut = M('OwnOut(own side, out of range)', ds ? 3000 : 3_000_000, ds ? at(1050) : at(950));
    await submitSettle(cid, ts, ownOut, U);
    const own = [ownOut];
    const book = (minX, minY) => ({ bids: ds ? opp : own, asks: ds ? own : opp, minX, minY });
    let c = capModel({ ds, P, limit, taker, ...book(ds ? MIN_X : low, ds ? low : MIN_Y) });
    check(`mix-${ts} model: Tiny counted before the raise, Self not, walk = W1+W2+Tiny`, String(c.walkCap), String(
      [opp[4], opp[5], opp[9]].reduce((a, m) => { const l = pxAt(ms, m, P); return a + (ds ? m.amt * S / l : m.amt * l / S); }, 0n)));
    await probe(`mix-${ts} before min raise`, name, c, P, limit, ds, taker);
    const raised = low * 16n / 10n;
    await tx(`mix-${ts}: operator raises the ${ms} minimum to ${raised}`, DEP, cid, `set-min-token-${ms}-deposit`, [uintCV(raised)], '(ok true)');
    const minX = ds ? MIN_X : raised, minY = ds ? raised : MIN_Y;
    c = capModel({ ds, P, limit, taker, ...book(minX, minY) });
    check(`mix-${ts} model: mid-cap is the kept side (K+Z+Bar, Und excluded) at mid`, String(c.midCap), String(ds ? (98_650_000n + 1_000_000n + 200_000n) * S / P : (98_650n + 1000n + 200n) * P / S));
    check(`mix-${ts} model: walk = W1 + W2(peg) only`, String(c.walkCap), String([opp[4], opp[5]].reduce((a, m) => { const l = pxAt(ms, m, P); return a + (ds ? m.amt * S / l : m.amt * l / S); }, 0n)));
    await probe(`mix-${ts} in range`, name, c, P, limit, ds, taker);
    const stranger = fresh();
    const cs = capModel({ ds, P, limit, taker: stranger, ...book(minX, minY) });
    check(`mix-${ts} model: for another principal the Self order counts`, String(cs.walkCap > c.walkCap), 'true');
    await probe(`mix-${ts} other principal`, name, cs, P, limit, ds, stranger);
    const outLim = ds ? at(1010) : at(990);
    const co = capModel({ ds, P, limit: outLim, taker, ...book(minX, minY) });
    check(`mix-${ts} model: taker limit out of range -> all zero`, `${co.net} ${co.gross}`, '0 0');
    await probe(`mix-${ts} taker out of range`, name, co, P, outLim, ds, taker);
    const cm = capModel({ ds, P, limit: P, taker, ...book(minX, minY) });
    check(`mix-${ts} model: limit exactly the mid -> walk 0, mid-cap only`, `${cm.walkCap} ${cm.midCap === c.midCap}`, '0 true');
    await probe(`mix-${ts} limit = mid`, name, cm, P, P, ds, taker);
    // swaps
    const makers = [...opp.filter((m) => m.who !== taker).map((m) => [ms, m]), [ts, ownOut]];
    const margin = 3n * (ds ? MIN_X : MIN_Y);
    const over = await swapCheck(`mix-${ts} gross-cap + 3 minimums`, cid, { ts, P, U, gross: c.gross + margin, limit, taker, opp, own, minX, minY, makers: [] });
    check(`mix-${ts}: over-capacity swap predicted u1017`, over.err, '(err u1017)');
    check(`mix-${ts} model: gross-cap nets exactly net-cap on a fresh print`, String(netOf(c.gross)), String(c.net));
    const mdl = await swapCheck(`mix-${ts} exactly gross-cap`, cid, { ts, P, U, gross: c.gross, limit, taker, opp, own, minX, minY, makers });
    check(`mix-${ts}: Und (under the bar) rolled whole, Bar filled`, `${mdl.rest.get(`${ms}:${opp[3].who}`)} ${mdl.rest.get(`${ms}:${opp[2].who}`) ?? 0n}`, `${opp[3].amt} 0`);
    await bookCheck(`mix-${ts}`, cid, opp[8], ms, opp[8].amt); // Self untouched
  }

  // ======================================================= own / ownbig ==
  // In-range limits EXACTLY at P on both sides; the pending side settles at P2 != P.
  const u2 = await printAfter(stamp, P);
  const U2 = update(u2);
  console.log(`crossing-free settle print: mid ${u2.mid} (swap mid ${P})`);
  for (const k of ['own', 'ownbig']) {
    for (const ts of ['y', 'x']) {
      const name = nameOf(k, ts), cid = cids[name], ms = other(ts), ds = ts === 'x';
      console.log(`PHASE ${k}-${ts}: own-side in-range makers ${k === 'own' ? '< opposite' : '>= opposite'}`);
      const taker = fresh();
      const limit = ds ? at(950) : at(1050);
      const opp = ds
        ? [M('A(at P)', k === 'own' ? 32_000_000 : 8_000_000, P), M('W', 5_000_000, at(990))]
        : [M('A(at P)', k === 'own' ? 20_000 : 5000, P), M('W', 3000, at(1010))];
      // own sized off the opposite's value V at P: 55% of V (own) or 125% of V (ownbig)
      const V = ds ? opp[0].amt * S / P : opp[0].amt * P / S;
      const own = k === 'own' ? [M('B1(at P)', V * 3n / 10n, P), M('B2(at P)', V / 4n, P)] : [M('B1(at P)', V * 5n / 4n, P)];
      for (const m of opp) await place(cid, ms, m);
      for (const m of own) await submitSettle(cid, ts, m, U2);
      const c = capModel({ ds, P, limit, taker, bids: ds ? opp : own, asks: ds ? own : opp });
      check(`${k}-${ts} model: own ${k === 'own' ? '<' : '>='} opposite, mid-cap ${k === 'own' ? '= opposite - own' : '0'}`,
        `${k === 'own' ? c.own < c.opposite && c.midCap === c.opposite - c.own : c.own >= c.opposite && c.midCap === 0n} ${c.walkCap > 0n}`, 'true true');
      await probe(`${k}-${ts}`, name, c, P, limit, ds, taker);
      const makers = [...opp.map((m) => [ms, m]), ...own.map((m) => [ts, m])];
      if (k === 'own') {
        const over = swapModel({ ts, P, gross: c.gross + 20n * (ds ? MIN_X : MIN_Y), limit, taker, opp, own });
        check(`${k}-${ts} model: gross-cap + 20 minimums overflows`, over.err, '(err u1017)');
        await swapCheck(`${k}-${ts} gross-cap + 20 minimums`, cid, { ts, P, U, gross: c.gross + 20n * (ds ? MIN_X : MIN_Y), limit, taker, opp, own, makers: [] });
      }
      await swapCheck(`${k}-${ts} exactly gross-cap`, cid, { ts, P, U, gross: c.gross, limit, taker, opp, own, makers });
    }
  }

  // =============================================================== edge ==
  for (const ts of ['y', 'x']) {
    const name = nameOf('edge', ts), cid = cids[name], ms = other(ts), ds = ts === 'x';
    console.log(`PHASE edge-${ts}: gross-cap + a sub-minimum margin leaves the predicted rest`);
    const taker = fresh();
    const limit = ds ? at(950) : at(1050);
    const opp = ds ? [M('K', 8_000_000, at(1010)), M('W', 5_000_000, at(990))] : [M('K', 5000, at(990)), M('W', 3000, at(1010))];
    for (const m of opp) await place(cid, ms, m);
    const c = capModel({ ds, P, limit, taker, bids: ds ? opp : [], asks: ds ? [] : opp });
    await probe(`edge-${ts}`, name, c, P, limit, ds, taker);
    const marginNet = ds ? 500n : 500_000n;
    const gross = grossFor(c.net + marginNet);
    const mdl = swapModel({ ts, P, gross, limit, taker, opp, own: [] });
    check(`edge-${ts} model: fills with a rest refunded (0 < rest < min)`, `${!mdl.err} ${mdl.R > 0n}`, 'true true');
    await swapCheck(`edge-${ts} gross-cap + ${marginNet} net`, cid, { ts, P, U, gross, limit, taker, opp, own: [], makers: opp.map((m) => [ms, m]) });
  }

  // ========================================================= full sides ==
  // Opposite placed directly, the one unseated taker-side maker Q submitted and
  // settled while the side is still not full, then sync-seat-count (49 seats):
  // one unseated maker = FULL for any new unseated taker.
  for (const k of ['foff', 'ftop', 'fin', 'fout']) {
    for (const ts of ['y', 'x']) {
      const name = nameOf(k, ts), cid = cids[name], ms = other(ts), ds = ts === 'x';
      console.log(`PHASE ${k}-${ts}: ${ts} side FULL`);
      const taker = fresh();
      const limit = ds ? at(950) : at(1050);
      let opp, Q;
      if (k === 'foff' || k === 'ftop') {
        opp = ds ? [M('K', 8_000_000, at(1010)), M('W', 5_000_000, at(990))] : [M('K', 5000, at(990)), M('W', 3000, at(1010))];
        Q = k === 'foff'
          ? (ds ? M('Q(peg off ask)', 2000, at(1500), 100) : M('Q(peg off bid)', 2_000_000, at(500), 100))
          : (ds ? M('Q(out-of-range ask)', 2000, at(1050)) : M('Q(out-of-range bid)', 2_000_000, at(950)));
      } else if (k === 'fin') {
        opp = ds ? [M('W1', 5_000_000, at(990)), M('W2', 4_000_000, at(980))] : [M('W1', 3000, at(1010)), M('W2', 2000, at(1020))];
        Q = ds ? M('Q(in-range ask)', 2000, at(990)) : M('Q(in-range bid)', 2_000_000, at(1010));
      } else {
        opp = ds ? [M('W', 5_000_000, at(990))] : [M('W', 3000, at(1010))];
        Q = ds ? M('Q(in-range ask)', 20_000, at(990)) : M('Q(in-range bid)', 20_000_000, at(1010));
      }
      for (const m of opp) await place(cid, ms, m);
      await submitSettle(cid, ts, Q, U);
      await tx(`${k}-${ts}: sync seats`, DEP, cid, 'sync-seat-count', [], '(ok u49)');
      await ev(`${k}-${ts}: ${ts} side is full for the taker`, cid, `(side-full-${ts} (get-token-${ts}-depositors (var-get current-cycle)) '${taker})`, 'true');
      const c = capModel({ ds, P, limit, taker, bids: ds ? opp : [Q], asks: ds ? [Q] : opp, seats: 49n });
      const want = { foff: 'true true 0 true', ftop: 'true true 0 true', fin: `true false ${Q.amt + 1n} true`, fout: `true false ${Q.amt + 1n} false` }[k];
      check(`${k}-${ts} model: full / door-parks / min-taker / admitted`, `${c.full} ${c.door} ${c.minTaker} ${c.net > 0n}`, want);
      await probe(`${k}-${ts}`, name, c, P, limit, ds, taker);
      const makers = opp.map((m) => [ms, m]);
      if (k === 'fout') {
        check(`${k}-${ts} model: every cap 0, net-cap 0`, `${c.midCap} ${c.walkCap} ${c.net} ${c.gross}`, '0 0 0 0');
        const g0 = grossFor(Q.amt);
        await fund(ts, taker, g0 + 10n);
        await tx(`${k}-${ts}: swap netting exactly the smallest is refused (queue full)`, taker, cid, 'swap', [uintCV(g0), uintCV(limit), U, ...pairArgs(), boolCV(ds)], '(err u1010)');
        const g1 = grossFor(Q.amt + 1n);
        const mdl = swapModel({ ts, P, gross: g1, limit, taker, opp, own: [] });
        check(`${k}-${ts} model: min-taker enters, bumps Q, cannot fill`, mdl.err, '(err u1017)');
        await swapCheck(`${k}-${ts} net = min-taker`, cid, { ts, P, U, gross: g1, limit, taker, opp, own: [], makers: [] });
        await bookCheck(`${k}-${ts}`, cid, Q, ts, Q.amt);
        continue;
      }
      // the swap parks (foff/ftop) or bumps (fin) Q first: the taker side is the taker alone
      await swapCheck(`${k}-${ts} exactly gross-cap`, cid, { ts, P, U, gross: c.gross, limit, taker, opp, own: [], makers });
      await ev(`${k}-${ts}: Q parked with its full size`, cid, `(list (get-token-${ts}-parked '${Q.who}) (get-token-${ts}-deposit (var-get current-cycle) '${Q.who}))`, `(list u${Q.amt} u0)`);
    }
  }
  await ev('fork clock unchanged (every print stays fresh, rebate at 20 bps)', cidOf(names[0]), 'stacks-block-time', `u${stamp}`);
  console.log(`${passed}/${checks} checks green`);
  console.log(`Sim: https://stxer.xyz/simulations/mainnet/${sid}`);
}
main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; });
