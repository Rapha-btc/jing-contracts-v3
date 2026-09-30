// Fork only. Run: node simulations/verify-v6-3-swap-walk.js
// markets-sbtc-stx-jing-v6-3: swaps that walk the book BEYOND the mid batch
// (cross-remainder-as-x/-y -> sorted-asks/-bids -> walk-*-book-step ->
// execute-fill), both taker sides. Every instance is the unmodified
// working-tree market source deployed as `swapwalk-*`. Each scenario builds
// the book, predicts every transfer with a BigInt model of the contract math
// (mid batch, rides, walk fills, fees, rebates, refunds, dust) and asserts
// exact wallets, treasury, market escrow, book amounts/order, cycle totals
// and the core `match` prints.
//
// Scenarios
//  ya  y taker (sells STX): in-range ask fills at mid, then the walk:
//      self-ask skipped, pegged ask ON, pegged ask OFF skipped, ask above the
//      limit skipped, makers taken in price order (list order is not price
//      order), two makers consumed whole, one partially with a sub-minimum
//      remainder refunded, a later ask gets a zero-size fill (x-traded 0),
//      taker dust refunded.
//  yb  y taker, nothing at mid: partial fill of one ask (<1000 sats, zero
//      sBTC fee) whose remainder stays on the book.
//  yc  y taker whose walk cannot reach its size: ERR_PARTIAL_FILL u1017,
//      nothing moves.
//  xa  x taker (sells sBTC): in-range bid fills at mid, then the walk:
//      self-bid skipped, pegged bid ON / OFF, bid below the floor skipped,
//      two bids consumed with sub-minimum STX dust refunded, a deep bid
//      fills a dust remainder (zero STX fee AND zero sBTC fee) and keeps its
//      rest, a later bid is skipped because the taker is done.
//  xc  x taker ERR_PARTIAL_FILL u1017.
//  rp  reprice-or-swap-token-y: a resting bid reprices through the book
//      (mid batch + walk); the asks were submitted and settled with a print
//      newer than submitted-at.
//  rx  reprice-or-swap-token-x mirror.
//  tr  treasury set to the market itself: the first walk fee transfer
//      fails and the next maker step sees the error accumulator; the swap
//      aborts and nothing moves.
//  tx  x-taker mirror of tr (walk-y-book-step error arm).
//  full / fullx  taker on a FULL side (49 protected seats): the off-pegged
//      resting maker on the taker's side is parked (swap lines 2664,
//      2698-2700 -> park-tenth-token-y / -x) and the walk runs.
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
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const STX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALES = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51' };
const principal = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const traits = { x: principal(SBTC), y: principal(STX) };
const assets = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const keeper = mk(871);
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
      if (i < 4 && /block info|ECONNRESET|fetch failed|50[234]/i.test(String(e?.message ?? e))) { await new Promise((r) => setTimeout(r, 3000)); continue; }
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
async function freshAfter(stamp) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const u = await fetchLazerUpdateAny();
    const times = await lazerFeedTimes(u.hex);
    if (times.at > stamp) return { ...u, at: times.at };
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`No newer signed feed after ${stamp}`);
}
const corePrints = (receipt) => receipt.events.map((e) => typeof e === 'string' ? JSON.parse(e) : e)
  .filter((e) => e.committed && e.contract_event?.contract_identifier === CORE)
  .map((e) => cv(e.contract_event.raw_value));
const field = (s, k) => (s.match(new RegExp(`\\(${k} ([^()\\s]+)\\)`)) ?? [])[1];

// ---------------------------------------------------------------- model ---
const S = 10_000_000_000n, BPS = 10_000n, FEE = 10n, MAXU = (1n << 128n) - 1n, MIN_SHARE = 20n;
const MIN_X = 1000n, MIN_Y = 1_000_000n;
const minB = (a, b) => (a < b ? a : b);
const peggedAsk = (P, s, floor) => { const p = s < BPS ? P * (BPS + s) / BPS : MAXU; return p >= floor ? p : MAXU; };
const peggedBid = (P, s, cap) => { const p = s < BPS ? P * (BPS - s) / BPS : 0n; return p <= cap ? p : 0n; };
const rebateBps = (age) => age <= 30n ? 20n : age >= 80n ? 70n : 20n + (age - 30n);
function ledger() {
  const m = new Map();
  return {
    add(who, k, v) { const o = m.get(who) ?? { x: 0n, y: 0n }; o[k] += v; m.set(who, o); },
    get(who) { return m.get(who) ?? { x: 0n, y: 0n }; },
  };
}
// Taker on side `ts` ('y' sells STX into asks, 'x' sells sBTC into bids).
// book: resting makers of the OPPOSITE side in depositor-list order,
// { who, amt, limit, spread|null }. net = taker amount on the book,
// rebate = pending rebate escrowed by the taker.
function model({ ts, P, net, rebate, bps, limit, taker, book }) {
  const L = ledger(), T = 'treasury';
  const isY = ts === 'y';
  const minM = isY ? MIN_X : MIN_Y, minT = isY ? MIN_Y : MIN_X;
  const eff = book.map((m) => ({ ...m, l: m.spread == null ? m.limit : (isY ? peggedAsk(P, m.spread, m.limit) : peggedBid(P, m.spread, m.limit)) }));
  // filter-limit-violating: asks priced above mid / bids below mid roll to the next cycle
  const inMid = eff.filter((m) => isY ? m.l <= P : m.l >= P);
  const next = eff.filter((m) => !(isY ? m.l <= P : m.l >= P)).map((m) => ({ ...m }));
  const Tm = inMid.reduce((a, m) => a + m.amt, 0n);
  for (const m of inMid) if (m.amt * BPS < Tm * MIN_SHARE) throw new Error('model: small-share maker not modelled');
  const Tx = isY ? Tm : net, Ty = isY ? net : Tm;
  const yvx = Tx * P / S, xb = yvx <= Ty;
  const yc = xb ? yvx : Ty, xc = xb ? Tx : Ty * S / P;
  const yfee = yc * FEE / BPS, xfee = xc * FEE / BPS;
  const rideY = isY && Ty > 0n ? rebate * yc / Ty : 0n;
  const rideX = !isY && Tx > 0n ? rebate * xc / Tx : 0n;
  const xAfter = xc - xfee + rideX, yAfter = yc - yfee + rideY;
  L.add(T, 'y', yfee); L.add(T, 'x', xfee);
  // distribute-to-token-y-depositor then -x-depositor
  let accXout = 0n, accYout = 0n, accXroll = 0n, accYroll = 0n, accXref = 0n, accYref = 0n;
  const midRecv = isY ? net * xAfter / Ty : net * yAfter / Tx; // taker's mid-batch proceeds
  let R = isY ? net * (Ty - yc) / Ty : net * (Tx - xc) / Tx;     // taker's rolled size (crossing: never refunded)
  if (isY) { accXout += midRecv; accYroll += R; L.add(taker, 'x', midRecv); } else { accYout += midRecv; accXroll += R; L.add(taker, 'y', midRecv); }
  const midFills = [];
  for (const m of inMid) {
    const recv = isY ? m.amt * yAfter / Tm : m.amt * xAfter / Tm;
    const unf = isY ? m.amt * (Tx - xc) / Tx : m.amt * (Ty - yc) / Ty;
    const ref = unf > 0n && unf < minM ? unf : 0n, roll = unf - ref;
    if (isY) { accYout += recv; accXroll += roll; accXref += ref; L.add(m.who, 'y', recv); L.add(m.who, 'x', ref); }
    else { accXout += recv; accYroll += roll; accYref += ref; L.add(m.who, 'x', recv); L.add(m.who, 'y', ref); }
    midFills.push({ who: m.who, recv, unf, ref, roll });
    if (roll > 0n) next.push({ ...m, amt: roll });
  }
  const yDust = (yAfter - accYout) + ((Ty - yc) - (accYroll + accYref));
  const xDust = (xAfter - accXout) + ((Tx - xc) - (accXroll + accXref));
  L.add(T, 'y', yDust); L.add(T, 'x', xDust);
  let pending = rebate - (isY ? rideY : rideX);
  // collect-*-step + insert-*-step (stable insertion by price)
  const sorted = [];
  for (const m of next) {
    if (m.amt < minM || (isY ? (m.l === MAXU || m.l <= P || m.l > limit) : (m.l === 0n || m.l >= P || m.l < limit))) continue;
    const i = sorted.findIndex((e) => isY ? m.l < e.l : m.l > e.l);
    if (i < 0) sorted.push(m); else sorted.splice(i, 0, m);
  }
  const fills = [];
  let walkRecv = 0n;
  const gone = new Set();
  for (const m of sorted) {
    if (R === 0n || m.who === taker || m.amt < minM) { fills.push({ who: m.who, skip: true }); continue; }
    // execute-fill: y-amt is the y side's size, x-amt the x side's
    const yAmt = isY ? R : m.amt, xAmt = isY ? m.amt : R;
    const xfy = yAmt * S / m.l;
    const xt = xAmt > xfy ? xfy : xAmt;
    const yt = xt * m.l / S;
    const yf = yt * FEE / BPS, xf = xt * FEE / BPS;
    if (xt === 0n || yt === 0n) { fills.push({ who: m.who, zero: true }); continue; }
    const reb = minB((isY ? yt : xt) * bps / BPS, pending);
    pending -= reb;
    const yWho = isY ? taker : m.who, xWho = isY ? m.who : taker;
    L.add(xWho, 'y', yt - yf + (isY ? reb : 0n)); L.add(T, 'y', yf);
    L.add(yWho, 'x', xt - xf + (isY ? 0n : reb)); L.add(T, 'x', xf);
    walkRecv += isY ? xt - xf : yt - yf;
    const yLeft = yAmt - yt, xLeft = xAmt - xt;
    const yRef = !isY && yLeft > 0n && yLeft < MIN_Y ? yLeft : 0n;
    const xRef = isY && xLeft > 0n && xLeft < MIN_X ? xLeft : 0n;
    if (isY) { R = yLeft; if (xLeft === 0n || xRef > 0n) gone.add(m.who); else m.amt = xLeft; L.add(m.who, 'x', xRef); }
    else { R = xLeft; if (yLeft === 0n || yRef > 0n) gone.add(m.who); else m.amt = yLeft; L.add(m.who, 'y', yRef); }
    fills.push({ who: m.who, xt, yt, price: m.l, reb, ref: isY ? xRef : yRef });
  }
  const left = pending;
  const partial = R >= minT;
  L.add(taker, ts, left + R);
  const rest = next.filter((m) => !gone.has(m.who));
  const result = isY
    ? `(ok (tuple (rebate-refunded u${left}) (token-x-received u${midRecv + walkRecv}) (token-x-rolled u0) (token-y-received u0) (token-y-rolled u${R})))`
    : `(ok (tuple (rebate-refunded u${left}) (token-x-received u0) (token-x-rolled u${R}) (token-y-received u${midRecv + walkRecv}) (token-y-rolled u0)))`;
  return { L, fills: fills.filter((f) => !f.skip && !f.zero), allFills: fills, sorted, rest, result, partial, R, left, yc, xc, midRecv, walkRecv, midFills, inMid, pendingStart: rebate - (isY ? rideY : rideX) };
}

// ----------------------------------------------------------- harness ---
const cidOf = (name) => `${DEP}.${name}`;
const pairArgs = () => [traits.x, assets.x, traits.y, assets.y];
let nextKey = 601;
const fresh = () => mk(nextKey++);
async function balances(cid, whos) {
  const code = `(list ${whos.map((w) => `(stx-get-balance '${w}) (unwrap-panic (contract-call? '${SBTC} get-balance '${w}))`).join(' ')})`;
  const v = await evRaw(cid, code);
  const nums = [...v.matchAll(/u(\d+)/g)].map((m) => BigInt(m[1]));
  if (nums.length !== whos.length * 2) throw new Error(`balance read failed: ${v}`);
  return Object.fromEntries(whos.map((w, i) => [w, { y: nums[2 * i], x: nums[2 * i + 1] }]));
}
function checkDeltas(label, before, after, expect) {
  for (const [name, who, d] of expect) {
    check(`${label}: ${name} STX delta`, String(after[who].y - before[who].y), String(d.y));
    check(`${label}: ${name} sBTC delta`, String(after[who].x - before[who].x), String(d.x));
  }
}
async function newMarket(name) {
  const cid = cidOf(name);
  await tx(`${name}: verify in core`, DEP, CORE, 'set-verified-contract', [principal(cid)], '(ok true)');
  await tx(`${name}: initialize`, DEP, cid, 'initialize', [principal(cid), traits.x, traits.y, uintCV(MIN_X), uintCV(MIN_Y), uintCV(1), uintCV(45)], '(ok true)');
  return cid;
}
// Direct deposit (opposite side empty -> book).
async function place(cid, side, m) {
  await fund(side, m.who, m.amt);
  await tx(`place ${side} ${m.tag} ${m.amt} @ ${m.limit}${m.spread != null ? ` peg ${m.spread}bps` : ''}`, m.who, cid, `deposit-token-${side}`,
    [uintCV(m.amt), uintCV(m.limit), m.spread == null ? noneCV() : someCV(uintCV(m.spread)), traits[side], assets[side]], `(ok u${m.amt})`);
}
async function bookState(label, cid, side, rest, gone) {
  const cyc = '(var-get current-cycle)';
  const list = await evRaw(cid, `(get-token-${side}-depositors ${cyc})`);
  check(`${label}: ${side} book order`, list, `(list ${rest.map((m) => m.who).join(' ')})`);
  for (const m of rest) {
    await ev(`${label}: ${m.tag} rests ${m.amt}`, cid, `(get-token-${side}-deposit ${cyc} '${m.who})`, `u${m.amt}`);
    await ev(`${label}: ${m.tag} order kept`, cid, `(get limit (get-token-${side}-order '${m.who}))`, `u${m.limit}`);
  }
  for (const m of gone) {
    await ev(`${label}: ${m.tag} off the book, order deleted`, cid, `(list (get-token-${side}-deposit ${cyc} '${m.who}) (get limit (get-token-${side}-order '${m.who})))`, '(list u0 u0)');
  }
  const sum = rest.reduce((a, m) => a + m.amt, 0n);
  const tot = await evRaw(cid, `(get-cycle-totals ${cyc})`);
  check(`${label}: cycle ${side} total equals book`, field(tot, `total-token-${side}`), `u${sum}`);
  return sum;
}
function checkMatches(label, receipt, mdl, taker) {
  const prints = corePrints(receipt).filter((p) => p.includes('(event "match")'));
  check(`${label}: match prints`, String(prints.length), String(mdl.fills.length));
  mdl.fills.forEach((f, i) => {
    const p = prints[i] ?? '';
    check(`${label}: match ${i + 1} maker/x/y/price`, [field(p, 'maker'), field(p, 'taker'), field(p, 'x-traded'), field(p, 'y-traded'), field(p, 'price')].join(' '),
      [f.who, taker, `u${f.xt}`, `u${f.yt}`, `u${f.price}`].join(' '));
  });
  return prints;
}
// Pick the gross swap amount whose net (gross * BPS / (BPS + bps)) is `net`.
function grossFor(net, bps) {
  for (let a = net; a < net + net / 100n + 10n; a++) if (a * BPS / (BPS + bps) === net) return a;
  throw new Error(`no gross for net ${net}`);
}

async function main() {
  // ---- fork + deploys --------------------------------------------------
  const names = ['swapwalk-ya', 'swapwalk-yb', 'swapwalk-yc', 'swapwalk-xa', 'swapwalk-xc', 'swapwalk-rp', 'swapwalk-rx', 'swapwalk-tr', 'swapwalk-tx', 'swapwalk-full', 'swapwalk-fullx'];
  const b = SimulationBuilder.new({ stacksNodeAPI: 'http://77.42.3.101/stacks-api' });
  for (const name of ['jing-core-v6', 'jing-ladder-v1']) b.withSender(DEP).addContractDeploy({ contract_name: name, source_code: source(name), clarity_version: ClarityVersion.Clarity5 });
  const market = source('markets-sbtc-stx-jing-v6-3');
  for (const name of names) b.withSender(DEP).addContractDeploy({ contract_name: name, source_code: market, clarity_version: ClarityVersion.Clarity5 });
  sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const setup = await getSimulationResult(sid);
  for (const st of setup.steps.filter((s) => s.Result?.Transaction)) check('deploy exact working-tree source', decode(st), ok);
  const stamp = Number((await ev('fork clock', cidOf(names[0]), 'stacks-block-time', (v) => /^u\d+$/.test(v))).slice(1));
  const u = await freshAfter(stamp);
  const P = u.px * 100_000_000n / u.py;
  console.log(`mid ${P} (STX per BTC * 1e8 / 1e8), update at ${u.at}, fork clock ${stamp}`);
  const cids = {};
  for (const name of names) cids[name] = await newMarket(name);
  const at = (k) => P * BigInt(k) / 1000n; // k per mille of mid
  const U = update(u);
  const age = BigInt(Math.max(0, stamp - u.at));
  const bps = rebateBps(age);

  // ================================================================ ya ==
  {
    const cid = cids['swapwalk-ya'], label = 'ya';
    console.log('PHASE ya: y taker, mid fill + full walk');
    const taker = fresh();
    const A = { tag: 'A', who: fresh(), amt: 3000n, limit: at(1030) };
    const Tself = { tag: 'T(self)', who: taker, amt: 2000n, limit: at(1010) };
    const B = { tag: 'B', who: fresh(), amt: 1500n, limit: at(1010) };
    const C = { tag: 'C(peg on)', who: fresh(), amt: 1200n, limit: at(500), spread: 200n };
    const D = { tag: 'D(peg off)', who: fresh(), amt: 2000n, limit: at(1500), spread: 100n };
    const E = { tag: 'E(above limit)', who: fresh(), amt: 2000n, limit: at(1200) };
    const F = { tag: 'F(at mid)', who: fresh(), amt: 1000n, limit: at(990) };
    const G = { tag: 'G(after dust)', who: fresh(), amt: 1500n, limit: at(1040) };
    const book = [A, Tself, B, C, D, E, F, G];
    for (const m of book) await place(cid, 'x', m);
    const limit = at(1050);
    // size: fill F at mid, B and C whole, A for 2300 sats leaving 700 (< min, refunded), plus half-a-sat of dust
    const lA = A.limit, lB = B.limit, lC = peggedAsk(P, 200n, C.limit);
    const yc = F.amt * P / S;
    const R3 = (2300n * lA + S - 1n) / S + lA / S / 2n;
    const net = yc + 1500n * lB / S + 1200n * lC / S + R3;
    const gross = grossFor(net, bps);
    const mdl = model({ ts: 'y', P, net, rebate: gross - net, bps, limit, taker, book });
    check('ya model: walk order T,B,C,A,G', mdl.sorted.map((m) => m.tag).join(','), 'T(self),B,C(peg on),A,G(after dust)');
    check('ya model: A partial 2300 leaves sub-min 700', String(mdl.fills.find((f) => f.who === A.who)?.xt), '2300');
    check('ya model: G gets a zero-size fill', String(mdl.allFills.some((f) => f.who === G.who && f.zero)), 'true');
    check('ya model: taker dust under minimum', String(mdl.R > 0n && mdl.R < MIN_Y), 'true');
    await fund('y', taker, gross);
    const whos = [taker, ...book.filter((m) => m.who !== taker).map((m) => m.who), DEP, cid];
    const before = await balances(cid, whos);
    const r = await tx('ya: swap y walks the asks', taker, cid, 'swap', [uintCV(gross), uintCV(limit), U, ...pairArgs(), boolCV(false)], mdl.result);
    await ev('ya: rebate bps for a fresh print', cid, '(var-get pending-rebate-bps-y)', `u${bps}`);
    const after = await balances(cid, whos);
    const d = (w) => mdl.L.get(w);
    checkDeltas(label, before, after, [
      ['taker', taker, { y: d(taker).y - gross, x: d(taker).x }],
      ...book.filter((m) => m.who !== taker).map((m) => [m.tag, m.who, d(m.who)]),
      ['treasury', DEP, d('treasury')],
    ]);
    const prints = checkMatches(label, r.receipt, mdl, taker);
    check('ya: refund-x print for A remainder', corePrints(r.receipt).filter((p) => p.includes('(event "refund-x")') && p.includes(A.who)).map((p) => field(p, 'amount')).join(','), 'u700');
    const rest = await bookState(label, cid, 'x', mdl.rest, [A, B, C, F]);
    check('ya: rest is T,D,E,G', mdl.rest.map((m) => m.tag).join(','), 'T(self),D(peg off),E(above limit),G(after dust)');
    await ev('ya: taker has no y position', cid, `(get-token-y-deposit (var-get current-cycle) '${taker})`, 'u0');
    check('ya: market escrow = book', `${after[cid].x} ${after[cid].y}`, `${rest} 0`);
    await ev('ya: pending rebate cleared', cid, '(list (var-get pending-rebate-y) (var-get pending-rebate-x))', '(list u0 u0)');
    void prints;
  }

  // ================================================================ yb ==
  {
    const cid = cids['swapwalk-yb'], label = 'yb';
    console.log('PHASE yb: y taker, nothing at mid, partial ask stays');
    const taker = fresh();
    const A = { tag: 'A', who: fresh(), amt: 2000n, limit: at(1010) };
    const B = { tag: 'B', who: fresh(), amt: 1500n, limit: at(1020) };
    const book = [B, A];
    for (const m of book) await place(cid, 'x', m);
    const limit = at(1050);
    const net = (700n * A.limit + S - 1n) / S + A.limit / S / 3n; // 700 sats from A (zero sBTC fee), dust stays below B's price
    const gross = grossFor(net, bps);
    const mdl = model({ ts: 'y', P, net, rebate: gross - net, bps, limit, taker, book });
    check('yb model: one fill of 700 sats, sBTC fee 0', mdl.fills.map((f) => `${f.xt}/${f.xt * FEE / BPS}`).join(','), '700/0');
    check('yb model: nothing cleared at mid', `${mdl.yc} ${mdl.xc}`, '0 0');
    await fund('y', taker, gross);
    const whos = [taker, A.who, B.who, DEP, cid];
    const before = await balances(cid, whos);
    const r = await tx('yb: swap y', taker, cid, 'swap', [uintCV(gross), uintCV(limit), U, ...pairArgs(), boolCV(false)], mdl.result);
    const after = await balances(cid, whos);
    const d = (w) => mdl.L.get(w);
    checkDeltas(label, before, after, [['taker', taker, { y: d(taker).y - gross, x: d(taker).x }], ['A', A.who, d(A.who)], ['B', B.who, d(B.who)], ['treasury', DEP, d('treasury')]]);
    checkMatches(label, r.receipt, mdl, taker);
    const rest = await bookState(label, cid, 'x', mdl.rest, []);
    check('yb: A keeps 1300', String(mdl.rest.find((m) => m.who === A.who)?.amt), '1300');
    check('yb: market escrow = book', `${after[cid].x} ${after[cid].y}`, `${rest} 0`);
  }

  // ================================================================ yc ==
  {
    const cid = cids['swapwalk-yc'], label = 'yc';
    console.log('PHASE yc: y taker ERR_PARTIAL_FILL');
    const taker = fresh();
    const A = { tag: 'A', who: fresh(), amt: 1500n, limit: at(1010) };
    const E = { tag: 'E(above limit)', who: fresh(), amt: 5000n, limit: at(1100) };
    for (const m of [A, E]) await place(cid, 'x', m);
    const limit = at(1050);
    const net = 4000n * A.limit / S;
    const gross = grossFor(net, bps);
    const mdl = model({ ts: 'y', P, net, rebate: gross - net, bps, limit, taker, book: [A, E] });
    check('yc model: remainder over minimum', String(mdl.partial), 'true');
    await fund('y', taker, gross);
    const whos = [taker, A.who, E.who, DEP, cid];
    const before = await balances(cid, whos);
    await tx('yc: swap y aborts with ERR_PARTIAL_FILL', taker, cid, 'swap', [uintCV(gross), uintCV(limit), U, ...pairArgs(), boolCV(false)], '(err u1017)');
    const after = await balances(cid, whos);
    check('yc: no wallet moved', JSON.stringify(after, (_, v) => typeof v === 'bigint' ? String(v) : v), JSON.stringify(before, (_, v) => typeof v === 'bigint' ? String(v) : v));
    await ev('yc: cycle not advanced', cid, '(var-get current-cycle)', 'u0');
    await bookState(label, cid, 'x', [A, E], []);
  }

  // ================================================================ xa ==
  {
    const cid = cids['swapwalk-xa'], label = 'xa';
    console.log('PHASE xa: x taker, mid fill + full walk');
    const taker = fresh();
    let Hamt = 3_300_000n;
    const lH = at(990);
    while (Hamt - (Hamt * S / lH) * lH / S === 0n) Hamt++; // guarantee STX dust after H is consumed
    const H = { tag: 'H', who: fresh(), amt: Hamt, limit: lH };
    const Tself = { tag: 'T(self)', who: taker, amt: 2_000_000n, limit: at(995) };
    const Pn = { tag: 'Pn(peg on)', who: fresh(), amt: 2_500_000n, limit: at(2000), spread: 150n };
    const Poff = { tag: 'Poff(peg off)', who: fresh(), amt: 2_000_000n, limit: at(500), spread: 100n };
    const G = { tag: 'G(at mid)', who: fresh(), amt: 2_000_000n, limit: at(1010) };
    const Z = { tag: 'Z(deep)', who: fresh(), amt: 2_000_000n, limit: 20_000_000_000n };
    const W = { tag: 'W(after done)', who: fresh(), amt: 1_000_000n, limit: 10_000_000_000n };
    const V = { tag: 'V(below floor)', who: fresh(), amt: 1_000_000n, limit: 2_000_000_000n };
    const book = [Z, H, Tself, W, Pn, Poff, G, V];
    for (const m of book) await place(cid, 'y', m);
    const limit = 4_000_000_000n;
    const lPn = peggedBid(P, 150n, Pn.limit);
    const xcMid = G.amt * S / P;
    const dust = 300n;
    const net = xcMid + H.amt * S / lH + Pn.amt * S / lPn + dust;
    const gross = grossFor(net, bps);
    const mdl = model({ ts: 'x', P, net, rebate: gross - net, bps, limit, taker, book });
    check('xa model: walk order T,H,Pn,Z,W', mdl.sorted.map((m) => m.tag).join(','), 'T(self),H,Pn(peg on),Z(deep),W(after done)');
    check('xa model: mid batch is y-binding (taker rolls)', String(mdl.yc === G.amt && mdl.xc === xcMid), 'true');
    const z = mdl.fills.find((f) => f.who === Z.who);
    check('xa model: Z fills the 300-sat dust with zero fees', `${z?.xt} ${z?.yt * FEE / BPS} ${z?.xt * FEE / BPS}`, '300 0 0');
    check('xa model: H and Pn dust refunded', mdl.fills.filter((f) => f.ref > 0n).map((f) => f.who === H.who ? 'H' : f.who === Pn.who ? 'Pn' : '?').join(','), 'H,Pn');
    check('xa model: taker fully filled', String(mdl.R), '0');
    await fund('x', taker, gross);
    const whos = [taker, ...book.filter((m) => m.who !== taker).map((m) => m.who), DEP, cid];
    const before = await balances(cid, whos);
    const r = await tx('xa: swap x walks the bids', taker, cid, 'swap', [uintCV(gross), uintCV(limit), U, ...pairArgs(), boolCV(true)], mdl.result);
    await ev('xa: rebate bps for a fresh print', cid, '(var-get pending-rebate-bps-x)', `u${bps}`);
    const after = await balances(cid, whos);
    const d = (w) => mdl.L.get(w);
    checkDeltas(label, before, after, [
      ['taker', taker, { y: d(taker).y, x: d(taker).x - gross }],
      ...book.filter((m) => m.who !== taker).map((m) => [m.tag, m.who, d(m.who)]),
      ['treasury', DEP, d('treasury')],
    ]);
    checkMatches(label, r.receipt, mdl, taker);
    const refunds = corePrints(r.receipt).filter((p) => p.includes('(event "refund-y")')).map((p) => `${field(p, 'depositor') === H.who ? 'H' : 'Pn'}:${field(p, 'amount')}`).join(',');
    check('xa: refund-y prints for H and Pn dust', refunds, mdl.fills.filter((f) => f.ref > 0n).map((f) => `${f.who === H.who ? 'H' : 'Pn'}:u${f.ref}`).join(','));
    const rest = await bookState(label, cid, 'y', mdl.rest, [H, Pn, G]);
    check('xa: rest is Z,T,W,Poff,V', mdl.rest.map((m) => m.tag).join(','), 'Z(deep),T(self),W(after done),Poff(peg off),V(below floor)');
    await ev('xa: taker has no x position', cid, `(get-token-x-deposit (var-get current-cycle) '${taker})`, 'u0');
    check('xa: market escrow = book', `${after[cid].x} ${after[cid].y}`, `0 ${rest}`);
  }

  // ================================================================ xc ==
  {
    const cid = cids['swapwalk-xc'], label = 'xc';
    console.log('PHASE xc: x taker ERR_PARTIAL_FILL');
    const taker = fresh();
    const H = { tag: 'H', who: fresh(), amt: 2_000_000n, limit: at(990) };
    const V = { tag: 'V(below floor)', who: fresh(), amt: 20_000_000n, limit: at(800) };
    for (const m of [H, V]) await place(cid, 'y', m);
    const limit = at(900);
    const gross = 5000n;
    const mdl = model({ ts: 'x', P, net: gross * BPS / (BPS + bps), rebate: gross - gross * BPS / (BPS + bps), bps, limit, taker, book: [H, V] });
    check('xc model: remainder over minimum', String(mdl.partial), 'true');
    await fund('x', taker, gross);
    const whos = [taker, H.who, V.who, DEP, cid];
    const before = await balances(cid, whos);
    await tx('xc: swap x aborts with ERR_PARTIAL_FILL', taker, cid, 'swap', [uintCV(gross), uintCV(limit), U, ...pairArgs(), boolCV(true)], '(err u1017)');
    const after = await balances(cid, whos);
    check('xc: no wallet moved', JSON.stringify(after, (_, v) => typeof v === 'bigint' ? String(v) : v), JSON.stringify(before, (_, v) => typeof v === 'bigint' ? String(v) : v));
    await bookState(label, cid, 'y', [H, V], []);
  }

  // ================================================== rp / rx (settle) ==
  // Makers on the far side are SUBMITTED (pending) because the near side
  // already rests; a keeper settles them with a print newer than submitted-at.
  const rp = { cid: cids['swapwalk-rp'], taker: fresh() };
  const rx = { cid: cids['swapwalk-rx'], taker: fresh() };
  rp.rest = { tag: 'M(taker bid)', who: rp.taker, amt: 0n, limit: at(900) };
  rx.rest = { tag: 'M(taker ask)', who: rx.taker, amt: 0n, limit: at(1100) };
  rp.book = [
    { tag: 'A', who: fresh(), amt: 2500n, limit: at(1020) },
    { tag: 'F(at mid)', who: fresh(), amt: 1000n, limit: at(990) },
    { tag: 'B', who: fresh(), amt: 1500n, limit: at(1010) },
  ];
  rx.book = [
    { tag: 'H', who: fresh(), amt: 4_000_000n, limit: at(980) },
    { tag: 'G(at mid)', who: fresh(), amt: 2_000_000n, limit: at(1010) },
    { tag: 'K', who: fresh(), amt: 3_000_000n, limit: at(990) },
  ];
  // taker sizes: rp buys F at mid + B whole + A for ~1000 sats (A keeps the rest);
  // rx sells G at mid + K whole + H partially (H keeps the rest)
  rp.rest.amt = F_Y(rp.book[1].amt) + 1500n * rp.book[2].limit / S + (1000n * rp.book[0].limit + S - 1n) / S + rp.book[0].limit / S / 4n;
  function F_Y(x) { return x * P / S; }
  rx.rest.amt = rx.book[1].amt * S / P + rx.book[2].amt * S / rx.book[2].limit + 1200n;
  await fund('y', rp.taker, rp.rest.amt * 2n);
  await tx('rp: resting bid (direct, asks empty)', rp.taker, rp.cid, 'deposit-token-y', [uintCV(rp.rest.amt), uintCV(rp.rest.limit), noneCV(), traits.y, assets.y], `(ok u${rp.rest.amt})`);
  await fund('x', rx.taker, rx.rest.amt * 2n);
  await tx('rx: resting ask (direct, bids empty)', rx.taker, rx.cid, 'deposit-token-x', [uintCV(rx.rest.amt), uintCV(rx.rest.limit), noneCV(), traits.x, assets.x], `(ok u${rx.rest.amt})`);
  for (const [c, side] of [[rp, 'x'], [rx, 'y']]) {
    for (const m of c.book) {
      await fund(side, m.who, m.amt);
      await tx(`${side} ${m.tag} submits (pending)`, m.who, c.cid, `deposit-token-${side}`, [uintCV(m.amt), uintCV(m.limit), noneCV(), traits[side], assets[side]], `(ok u${m.amt})`);
    }
  }
  const submitClock = Number((await evRaw(rp.cid, 'stacks-block-time')).slice(1));
  const u2 = await freshAfter(submitClock);
  const P2 = u2.px * 100_000_000n / u2.py;
  const U2 = update(u2);
  console.log(`settle print at ${u2.at} > submitted-at ${submitClock}; mid ${P2}`);
  const bps2 = rebateBps(BigInt(Math.max(0, Number((await evRaw(rp.cid, 'stacks-block-time')).slice(1)) - u2.at)));
  for (const [c, side] of [[rp, 'x'], [rx, 'y']]) {
    for (const m of c.book) {
      await tx(`${side} ${m.tag} settled by keeper`, keeper, c.cid, `settle-token-${side}-deposit`, [principal(m.who), U2, traits[side], assets[side]], `(ok u${m.amt})`);
      await ev(`${side} ${m.tag} pending cleared, on book`, c.cid, `(list (is-none (get-token-${side}-pending-deposit '${m.who})) (is-eq (get-token-${side}-deposit (var-get current-cycle) '${m.who}) u${m.amt}))`, '(list true true)');
    }
  }
  for (const [c, ts] of [[rp, 'y'], [rx, 'x']]) {
    const label = ts === 'y' ? 'rp' : 'rx';
    console.log(`PHASE ${label}: reprice-or-swap-token-${ts} crosses and walks`);
    const limit = ts === 'y' ? P2 * 1050n / 1000n : P2 * 950n / 1000n;
    const amount = c.rest.amt;
    const rebate = amount * bps2 / BPS;
    const mdl = model({ ts, P: P2, net: amount, rebate, bps: bps2, limit, taker: c.taker, book: c.book });
    check(`${label} model: mid fill + two walk fills`, `${mdl.inMid.length} ${mdl.fills.length}`, '1 2');
    check(`${label} model: fully filled`, String(mdl.R < (ts === 'y' ? MIN_Y : MIN_X)), 'true');
    const whos = [c.taker, ...c.book.map((m) => m.who), DEP, c.cid];
    const before = await balances(c.cid, whos);
    const r = await tx(`${label}: reprice-or-swap-token-${ts}`, c.taker, c.cid, `reprice-or-swap-token-${ts}`, [uintCV(limit), noneCV(), U2, ...pairArgs()], mdl.result);
    const after = await balances(c.cid, whos);
    const d = (w) => mdl.L.get(w);
    const t = d(c.taker);
    checkDeltas(label, before, after, [
      ['taker', c.taker, ts === 'y' ? { y: t.y - rebate, x: t.x } : { y: t.y, x: t.x - rebate }],
      ...c.book.map((m) => [m.tag, m.who, d(m.who)]),
      ['treasury', DEP, d('treasury')],
    ]);
    checkMatches(label, r.receipt, mdl, c.taker);
    const ms = ts === 'y' ? 'x' : 'y';
    const rest = await bookState(label, c.cid, ms, mdl.rest, c.book.filter((m) => !mdl.rest.some((q) => q.who === m.who)));
    await ev(`${label}: taker off the book`, c.cid, `(get-token-${ts}-deposit (var-get current-cycle) '${c.taker})`, 'u0');
    check(`${label}: market escrow = book`, ts === 'y' ? `${after[c.cid].x} ${after[c.cid].y}` : `${after[c.cid].x} ${after[c.cid].y}`, ts === 'y' ? `${rest} 0` : `0 ${rest}`);
  }

  // ========================================================== tr / tx ==
  // Treasury pointed at the market itself used to make every fee transfer a
  // self-transfer (err u2) and abort every swap; set-treasury now refuses it
  // (ERR_BAD_TREASURY u1033). With it the walk steps' `match` error arm
  // (2960 / 3001) has no reachable trigger left.
  for (const ts of ['y', 'x']) {
    const label = ts === 'y' ? 'tr' : 'tx', cid = cids[`swapwalk-${label}`], ms = ts === 'y' ? 'x' : 'y';
    console.log(`PHASE ${label}: set-treasury refuses the market itself`);
    const taker = fresh();
    const book = ts === 'y'
      ? [{ tag: 'A', who: fresh(), amt: 1500n, limit: at(1010) }, { tag: 'B', who: fresh(), amt: 1500n, limit: at(1020) }]
      : [{ tag: 'H', who: fresh(), amt: 2_000_000n, limit: at(990) }, { tag: 'K', who: fresh(), amt: 2_000_000n, limit: at(980) }];
    for (const m of book) await place(cid, ms, m);
    const treasury = await ev(`${label}: treasury before`, cid, '(var-get treasury)', (v) => /^'?S[PM][0-9A-Z]+/.test(v));
    await tx(`${label}: set-treasury refuses the market itself`, DEP, cid, 'set-treasury', [principal(cid)], '(err u1033)');
    await tx(`${label}: set-treasury is operator-only`, taker, cid, 'set-treasury', [principal(taker)], '(err u1008)');
    await ev(`${label}: treasury unchanged`, cid, '(var-get treasury)', treasury);
    await bookState(label, cid, ms, book, []);
  }

  // ======================================================== full / fullx ==
  // 49 protected ladder seats leave one public seat per side, so one resting
  // unseated maker makes the taker's side FULL: swap prices the park
  // (line 2664), calls park-tenth-token-* (2698-2700), which parks the
  // switched-off pegged maker, then the swap settles and walks.
  await tx('full: reserve 49 ladder seats', DEP, LADDER, 'set-max-band-per-side', [uintCV(49)], '(ok true)');
  for (const ts of ['y', 'x']) {
    const label = ts === 'y' ? 'full' : 'fullx', cid = cids[`swapwalk-${label}`], ms = ts === 'y' ? 'x' : 'y';
    console.log(`PHASE ${label}: ${ts} side full, off-pegged ${ts === 'y' ? 'bid' : 'ask'} parked by the swap`);
    await tx(`${label}: sync seats`, DEP, cid, 'sync-seat-count', [], '(ok u49)');
    const Q = ts === 'y'
      ? { tag: 'Q(peg off bid)', who: fresh(), amt: 5_000_000n, limit: at(500), spread: 100n }
      : { tag: 'Q(peg off ask)', who: fresh(), amt: 4000n, limit: at(1500), spread: 100n };
    await place(cid, ts, Q);
    const A = ts === 'y' ? { tag: 'A', who: fresh(), amt: 3000n, limit: at(1010) } : { tag: 'A', who: fresh(), amt: 5_000_000n, limit: at(990) };
    await fund(ms, A.who, A.amt);
    await tx(`${label}: A submits (pending)`, A.who, cid, `deposit-token-${ms}`, [uintCV(A.amt), uintCV(A.limit), noneCV(), traits[ms], assets[ms]], `(ok u${A.amt})`);
    await ev(`${label}: A is pending, not on the book`, cid, `(list (get amount (unwrap-panic (get-token-${ms}-pending-deposit '${A.who}))) (get-token-${ms}-deposit (var-get current-cycle) '${A.who}))`, `(list u${A.amt} u0)`);
    const clock = Number((await evRaw(cid, 'stacks-block-time')).slice(1));
    const u3 = await freshAfter(clock);
    const P3 = u3.px * 100_000_000n / u3.py, U3 = update(u3);
    const bps3 = rebateBps(BigInt(Math.max(0, clock - u3.at)));
    await tx(`${label}: keeper settles A with a print newer than submitted-at`, keeper, cid, `settle-token-${ms}-deposit`, [principal(A.who), U3, traits[ms], assets[ms]], `(ok u${A.amt})`);
    const taker = fresh();
    await ev(`${label}: ${ts} side is full for a new taker`, cid, `(side-full-${ts} (get-token-${ts}-depositors (var-get current-cycle)) '${taker})`, 'true');
    const limit = ts === 'y' ? P3 * 1050n / 1000n : P3 * 950n / 1000n;
    const net = ts === 'y' ? (2000n * A.limit + S - 1n) / S + A.limit / S / 2n : 1000n;
    const gross = grossFor(net, bps3);
    const mdl = model({ ts, P: P3, net, rebate: gross - net, bps: bps3, limit, taker, book: [A] });
    check(`${label} model: A partially filled, keeps the rest, taker done`, `${mdl.fills.length} ${mdl.rest.length} ${mdl.R < (ts === 'y' ? MIN_Y : MIN_X)}`, '1 1 true');
    await fund(ts, taker, gross);
    const whos = [taker, A.who, Q.who, DEP, cid];
    const before = await balances(cid, whos);
    const r = await tx(`${label}: swap ${ts} parks Q then walks`, taker, cid, 'swap', [uintCV(gross), uintCV(limit), U3, ...pairArgs(), boolCV(ts === 'x')], mdl.result);
    const after = await balances(cid, whos);
    const d = (w) => mdl.L.get(w);
    const t = d(taker);
    checkDeltas(label, before, after, [['taker', taker, ts === 'y' ? { y: t.y - gross, x: t.x } : { y: t.y, x: t.x - gross }], ['A', A.who, d(A.who)], ['Q', Q.who, { x: 0n, y: 0n }], ['treasury', DEP, d('treasury')]]);
    check(`${label}: park-${ts} print for Q`, corePrints(r.receipt).filter((p) => p.includes(`(event "park-${ts}")`)).map((p) => `${field(p, 'depositor') ?? field(p, 'who')}:${field(p, 'amount')}`).join(','), `${Q.who}:u${Q.amt}`);
    checkMatches(label, r.receipt, mdl, taker);
    await ev(`${label}: Q parked with its full size`, cid, `(get-token-${ts}-parked '${Q.who})`, `u${Q.amt}`);
    await ev(`${label}: ${ts} book empty`, cid, `(get-token-${ts}-depositors (var-get current-cycle))`, '(list )');
    const rest = await bookState(label, cid, ms, mdl.rest, []);
    check(`${label}: market escrow = book + parked`, `${after[cid].x} ${after[cid].y}`, ts === 'y' ? `${rest} ${Q.amt}` : `${Q.amt} ${rest}`);
  }
  console.log(`${passed}/${checks} checks green`);
  console.log(`Sim: https://stxer.xyz/simulations/mainnet/${sid}`);
}
main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; });
