// Fork only. Run: node simulations/verify-v6-3-settlement-edges.js
// markets-sbtc-stx-jing-v6-3: settlement edges. Every instance is the
// unmodified working-tree market source deployed as `settle-edge-*`, verified
// in jing-core-v6 and initialized (min 1000 sats / 1 STX, Lazer feeds 1/45).
// Real signed Lazer prints only (./_lazer.js); the fork clock is pinned to a
// print's feed time and advanced with AdvanceBlocks where an ordering or a
// print age matters. Asserts exact wallets, treasury, market escrow, book
// amounts / list order, cycle totals, stored orders (incl. set-at) and prints.
//
// Scenarios
//  a   y taker; x side holds a big maker, a small non-taker and the TAKER's
//      own small x order: both small x orders roll (filter-small-x, taker on
//      the OPPOSITE side is rolled, not u1020). prune-cycles / prune-one.
//  b   x taker whose own x order is under 0.2%: ERR_TAKER_TOO_SMALL u1020
//      (filter-small-x crossing-x flag), nothing moves.
//  b2  y mirror of b (filter-small-y flag).
//  c   x taker whose own small y order is on the opposite side: rolled.
//  d   y taker, y binding: every x maker's unfilled rest is sub-minimum and
//      refunded, INCLUDING the taker's own x order (no exemption off the
//      taker's side); payout + roll dust swept on both sides.
//  e   y taker, x binding, two prints (A admits a same-side maker whose bid
//      sits between the prints, B settles): the maker's sub-minimum rest is
//      refunded, the taker's is rolled (exemption on its side) and handed back
//      by cross-remainder. The fully filled x maker's pending limit then
//      settles as "gone" with no stored order.
//  ex  x mirror of e (and the y maker's pending limit "gone").
//  f   limits: y "crossing" refusal; per side, a limit submitted before a
//      top-up is "stale" once the top-up settled; a top-up submitted before a
//      settled limit keeps the newer stored limit but adds its amount.
//  g   49 protected seats: withdraw from a parked position (y and x); a
//      pending readmit whose parked amount was carried into a new deposit
//      settles as "gone".
//  i   print age bands: age 30 -> 20 bps, 31 -> 21 bps, 79 -> 69 bps, 80 ->
//      stale print refused (the >= 80 band of rebate-bps-for-age cannot be
//      reached: every aged price is asserted fresher than 80 s first).
import fs from 'node:fs';
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV,
  standardPrincipalCV, noneCV, boolCV, listCV, makeUnsignedSTXTokenTransfer,
  deserializeCV, cvToString, getAddressFromPrivateKey,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, getSimulationTip, submitSimulationSteps, callContract, getNonce, setSender,
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
    const t = r.Transaction.Ok;
    if (t.vm_error || t.post_condition_aborted) return `ENGINE-ERR ${JSON.stringify(t)}`;
    return cv(t.result);
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
      if (i < 6 && /block info|ECONNRESET|fetch failed|socket|timeout|50[0234]/i.test(String(e?.message ?? e))) { await new Promise((r) => setTimeout(r, 3000)); continue; }
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
    const raw = await makeUnsignedSTXTokenTransfer({ recipient: who, amount, nonce: await retry(() => getNonce(sid, WHALES.y)), network: 'mainnet', publicKey: '', fee: 0 });
    setSender(raw, WHALES.y);
    const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] }));
    check(`fund ${amount} uSTX`, decode({ Result: out.steps[0] }), '(ok true)');
  }
}
async function fetchPrint() {
  const u = await retry(() => fetchLazerUpdateAny());
  const times = await retry(() => lazerFeedTimes(u.hex));
  return { ...u, at: times.at, P: u.px * 100_000_000n / u.py };
}
async function freshAfter(t) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const u = await fetchPrint();
    if (u.at > t) return u;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`No newer signed feed after ${t}`);
}
// fork clock: pin the next block's time (relative to the burn tip)
let now = 0;
async function pinTo(t) {
  const tip = await retry(() => getSimulationTip(sid));
  const interval = t - Number(tip.burn_block_time);
  if (interval <= 0) throw new Error(`cannot move the clock to ${t} (burn tip ${tip.burn_block_time})`);
  await retry(() => submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: interval } }] }));
  now = t;
}
const corePrints = (receipt) => receipt.events.map((e) => typeof e === 'string' ? JSON.parse(e) : e)
  .filter((e) => e.committed && e.contract_event?.contract_identifier === CORE)
  .map((e) => cv(e.contract_event.raw_value));
const field = (s, k) => (s.match(new RegExp(`\\(${k} ([^()\\s]+)\\)`)) ?? [])[1];
function printed(label, r, name, fields = {}) {
  const prints = corePrints(r.receipt);
  const hit = prints.find((p) => p.includes(`(event "${name}")`) && Object.entries(fields).every(([k, v]) => p.includes(`(${k} ${v})`)));
  check(`${label}: print ${name} ${JSON.stringify(fields)}`, hit ?? (prints.filter((p) => p.includes(`"${name}"`)).join(' | ') || '(none)'), () => !!hit);
  return hit;
}
function notPrinted(label, r, name) {
  const prints = corePrints(r.receipt).filter((p) => p.includes(`(event "${name}")`));
  check(`${label}: no ${name} print`, String(prints.length), '0');
}

// ---------------------------------------------------------------- model ---
const S = 10_000_000_000n, BPS = 10_000n, FEE = 10n;
const MIN_X = 1000n, MIN_Y = 1_000_000n;
const at = (P, k) => P * BigInt(k) / 1000n;
const rebateOf = (g, bps) => g * bps / BPS;
function grossFor(net, bps) {
  for (let a = net; a < net + net / 100n + 10n; a++) if (a - a * bps / BPS === net) return a;
  return null;
}
// One settle-with-refresh over the books that survive the filters (no walk).
// ys / xs: [{ who, amt }], in list order. taker: tx-sender; tside: 'y' | 'x'.
function settle({ P, ys, xs, rebate, taker, tside }) {
  const Ty = ys.reduce((a, m) => a + m.amt, 0n), Tx = xs.reduce((a, m) => a + m.amt, 0n);
  const yvx = Tx * P / S, xb = yvx <= Ty;
  const yc = xb ? yvx : Ty, xc = xb ? Tx : Ty * S / P;
  const yfee = yc * FEE / BPS, xfee = xc * FEE / BPS;
  const rideY = tside === 'y' && Ty > 0n ? rebate * yc / Ty : 0n;
  const rideX = tside === 'x' && Tx > 0n ? rebate * xc / Tx : 0n;
  const yAfter = yc - yfee + rideY, xAfter = xc - xfee + rideX;
  const out = { Ty, Tx, xb, yc, xc, yfee, xfee, rideY, rideX, yAfter, xAfter, y: [], x: [] };
  let accX = 0n, accY = 0n, yRoll = 0n, yRef = 0n, xRoll = 0n, xRef = 0n;
  for (const m of ys) {
    const recv = m.amt * xAfter / Ty, unf = m.amt * (Ty - yc) / Ty;
    const exempt = tside === 'y' && m.who === taker;
    const ref = unf > 0n && unf < MIN_Y && !exempt ? unf : 0n, roll = unf - ref;
    accX += recv; yRoll += roll; yRef += ref;
    out.y.push({ who: m.who, recv, unf, ref, roll, cleared: m.amt - unf });
  }
  for (const m of xs) {
    const recv = m.amt * yAfter / Tx, unf = m.amt * (Tx - xc) / Tx;
    const exempt = tside === 'x' && m.who === taker;
    const ref = unf > 0n && unf < MIN_X && !exempt ? unf : 0n, roll = unf - ref;
    accY += recv; xRoll += roll; xRef += ref;
    out.x.push({ who: m.who, recv, unf, ref, roll, cleared: m.amt - unf });
  }
  out.yPayoutDust = yAfter - accY; out.yRollDust = (Ty - yc) - (yRoll + yRef);
  out.xPayoutDust = xAfter - accX; out.xRollDust = (Tx - xc) - (xRoll + xRef);
  out.yDust = out.yPayoutDust + out.yRollDust; out.xDust = out.xPayoutDust + out.xRollDust;
  out.yRoll = yRoll; out.xRoll = xRoll;
  out.left = rebate - (tside === 'y' ? rideY : rideX);
  return out;
}

// ----------------------------------------------------------- harness ---
const cidOf = (name) => `${DEP}.${name}`;
const pairArgs = () => [traits.x, assets.x, traits.y, assets.y];
let nextKey = 1301;
const fresh = () => mk(nextKey++);
const CYC = '(var-get current-cycle)';
async function balances(cid, whos) {
  const code = `(list ${whos.map((w) => `(stx-get-balance '${w}) (unwrap-panic (contract-call? '${SBTC} get-balance '${w}))`).join(' ')})`;
  const v = await evRaw(cid, code);
  const nums = [...v.matchAll(/u(\d+)/g)].map((m) => BigInt(m[1]));
  if (nums.length !== whos.length * 2) throw new Error(`balance read failed: ${v}`);
  return Object.fromEntries(whos.map((w, i) => [w, { y: nums[2 * i], x: nums[2 * i + 1] }]));
}
function deltas(label, before, after, expect) {
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
const depArgs = (side, amount, limit) => [uintCV(amount), uintCV(limit), noneCV(), traits[side], assets[side]];
// Direct deposit (opposite side empty -> book).
async function place(cid, side, who, amt, limit, tag) {
  await fund(side, who, amt);
  await tx(`place ${side} ${tag} ${amt} @ ${limit}`, who, cid, `deposit-token-${side}`, depArgs(side, amt, limit), `(ok u${amt})`);
  await ev(`${tag}: on the book`, cid, `(get-token-${side}-deposit ${CYC} '${who})`, `u${amt}`);
}
// Pending deposit (opposite side non-empty), admitted with print u.
async function admit(cid, side, who, amt, limit, tag, u) {
  await fund(side, who, amt);
  await tx(`submit ${side} ${tag} ${amt} @ ${limit}`, who, cid, `deposit-token-${side}`, depArgs(side, amt, limit), `(ok u${amt})`);
  await ev(`${tag}: pending, not on the book`, cid, `{ a: (is-some (get-token-${side}-pending-deposit '${who})), b: (get-token-${side}-deposit ${CYC} '${who}) }`, '(tuple (a true) (b u0))');
  const pu = u ?? await freshAfter(now);
  const r = await tx(`settle ${side} ${tag}`, keeper, cid, `settle-token-${side}-deposit`, [principal(who), update(pu), traits[side], assets[side]], `(ok u${amt})`);
  await ev(`${tag}: admitted`, cid, `(get-token-${side}-deposit ${CYC} '${who})`, `u${amt}`);
  return r;
}
const swapArgs = (g, limit, u, depositX) => [uintCV(g), uintCV(limit), update(u), ...pairArgs(), boolCV(depositX)];
const order = (side, who) => `(get-token-${side}-order '${who})`;
const orderStr = (limit, setAt) => `(tuple (limit u${limit}) (set-at u${setAt}) (spread-bps none))`;

async function main() {
  // ---- fork + deploys --------------------------------------------------
  const names = ['a', 'b', 'b2', 'c', 'd', 'e', 'ex', 'f', 'g', 'i'].map((s) => `settle-edge-${s}`);
  const b = SimulationBuilder.new({ stacksNodeAPI: 'http://77.42.3.101/stacks-api' });
  for (const name of ['jing-core-v6', 'jing-ladder-v1']) b.withSender(DEP).addContractDeploy({ contract_name: name, source_code: source(name), clarity_version: ClarityVersion.Clarity5 });
  const market = source('markets-sbtc-stx-jing-v6-3');
  for (const name of names) b.withSender(DEP).addContractDeploy({ contract_name: name, source_code: market, clarity_version: ClarityVersion.Clarity5 });
  sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const setup = await retry(() => getSimulationResult(sid));
  for (const st of setup.steps.filter((s) => s.Result?.Transaction)) check('deploy exact working-tree source', decode(st), ok);
  const cids = {};
  for (const name of names) cids[name.replace('settle-edge-', '')] = await newMarket(name);
  // g: 49 protected seats (one public seat per side), size queue.
  await tx('ladder: reserve 49 seats', DEP, LADDER, 'set-max-band-per-side', [uintCV(49)], '(ok true)');
  await tx('g: sync seat count', DEP, cids.g, 'sync-seat-count', [], '(ok u49)');
  await tx('g: size queue', DEP, cids.g, 'set-distance-slots', [uintCV(0)], '(ok true)');
  await ev('a: unsynced market keeps 10 seats', cids.a, '(protected-seats)', 'u10');
  // Pin the clock to a real print's feed time.
  const u0 = await fetchPrint();
  const tip = await retry(() => getSimulationTip(sid));
  await pinTo(Math.max(u0.at, Number(tip.block_time) + 1));
  await ev('fork clock pinned', cids.a, 'stacks-block-time', `u${now}`);
  const P0 = u0.P;
  console.log(`mid ${P0}, print at ${u0.at}, clock ${now}`);
  finishPhase();

  await phaseA(cids.a, P0);
  await phaseB(cids.b, P0);
  await phaseB2(cids.b2, P0);
  await phaseC(cids.c, P0);
  await phaseD(cids.d, P0);
  await phaseE(cids.e, cids.ex, P0);
  await phaseF(cids.f, P0);
  await phaseG(cids.g, P0);
  await phaseI(cids.i, P0);
  console.log(`${passed}/${checks} checks green`);
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
}

// ================================================================== a ==
async function phaseA(cid, P0) {
  console.log('PHASE a: y taker, small x orders (incl. the taker\'s own) roll');
  const X1 = fresh(), Sm = fresh(), T = fresh();
  await place(cid, 'x', X1, 1_000_000n, at(P0, 900), 'a X1');
  await place(cid, 'x', Sm, 1000n, at(P0, 900), 'a S(small)');
  await place(cid, 'x', T, 1000n, at(P0, 900), 'a T own x (small)');
  const G = 20_000_000n;
  await fund('y', T, G);
  const u = await freshAfter(now);
  const bps = 20n, rebate = rebateOf(G, bps), net = G - rebate;
  const m = settle({ P: u.P, ys: [{ who: T, amt: net }], xs: [{ who: X1, amt: 1_000_000n }], rebate, taker: T, tside: 'y' });
  const before = await balances(cid, [T, X1, Sm, DEP, cid]);
  const r = await tx('a: y swap settles', T, cid, 'swap', swapArgs(G, at(u.P, 1100), u, false),
    `(ok (tuple (rebate-refunded u0) (token-x-received u${m.xAfter}) (token-x-rolled u0) (token-y-received u0) (token-y-rolled u0)))`);
  printed('a', r, 'small-share-roll-x', { depositor: Sm, amount: 'u1000', cycle: 'u0' });
  printed('a', r, 'small-share-roll-x', { depositor: T, amount: 'u1000', cycle: 'u0' });
  printed('a', r, 'settlement', { 'x-cleared': `u${m.xc}`, 'y-cleared': `u${m.yc}`, 'y-rebate': `u${m.rideY}`, 'binding-side': '"y"' });
  printed('a', r, 'distribute-x-depositor', { depositor: X1, 'y-received': `u${m.x[0].recv}`, 'x-rolled': `u${m.x[0].roll}` });
  printed('a', r, 'sweep-dust', { 'x-dust': 'u0', 'y-dust': 'u0', 'x-unfilled': `u${m.xRoll}` });
  const after = await balances(cid, [T, X1, Sm, DEP, cid]);
  deltas('a', before, after, [
    ['taker', T, { y: -G, x: m.xAfter }], ['X1', X1, { y: m.x[0].recv, x: 0n }], ['S', Sm, { y: 0n, x: 0n }],
    ['treasury', DEP, { y: m.yfee, x: m.xfee }], ['market', cid, { y: 0n, x: -m.xc }],
  ]);
  await ev('a: cycle advanced', cid, CYC, 'u1');
  await ev('a: next x book: small rolls first, then X1 rest', cid, '(get-token-x-depositors u1)', `(list ${Sm} ${T} ${X1})`);
  await ev('a: next x amounts', cid, `(list (get-token-x-deposit u1 '${Sm}) (get-token-x-deposit u1 '${T}) (get-token-x-deposit u1 '${X1}))`, `(list u1000 u1000 u${m.x[0].roll})`);
  await ev('a: next totals', cid, '(get-cycle-totals u1)', `(tuple (total-token-x u${2000n + m.x[0].roll}) (total-token-y u0))`);
  await ev('a: taker\'s rolled x order keeps its limit', cid, `(get limit ${order('x', T)})`, `u${at(P0, 900)}`);
  await ev('a: taker\'s filled y order deleted', cid, order('y', T), orderStr(0n, 0n));
  finishPhase();
  console.log('PHASE a2: prune-cycles');
  await ev('a2: cycle 0 book exists before prune', cid, '(get-cycle-totals u0)', (v) => v !== '(tuple (total-token-x u0) (total-token-y u0))');
  await tx('a2: prune open cycle refused', keeper, cid, 'prune-cycles', [listOf([1n])], '(err u1027)');
  await tx('a2: closed then open cycle refused as a whole', keeper, cid, 'prune-cycles', [listOf([0n, 1n])], '(err u1027)');
  await ev('a2: nothing pruned by the refused call', cid, '(get-cycle-totals u0)', (v) => v !== '(tuple (total-token-x u0) (total-token-y u0))');
  await tx('a2: prune closed cycle', keeper, cid, 'prune-cycles', [listOf([0n])], '(ok u1)');
  await ev('a2: cycle 0 lists and totals gone', cid, '{ x: (get-token-x-depositors u0), y: (get-token-y-depositors u0), t: (get-cycle-totals u0) }', '(tuple (t (tuple (total-token-x u0) (total-token-y u0))) (x (list )) (y (list )))');
  await ev('a2: settlement record kept', cid, '(is-some (get-settlement u0))', 'true');
  await ev('a2: live cycle untouched', cid, '(get-token-x-depositors u1)', `(list ${Sm} ${T} ${X1})`);
  finishPhase();
}
const listOf = (ns) => listCV(ns.map((n) => uintCV(n)));

// ================================================================== b ==
async function phaseB(cid, P0) {
  console.log('PHASE b: x taker under 0.2% of its side -> u1020');
  const X1 = fresh(), Y1 = fresh(), T = fresh();
  await place(cid, 'x', X1, 1_000_000n, at(P0, 900), 'b X1');
  await admit(cid, 'y', Y1, 10_000_000n, at(P0, 500), 'b Y1 (low bid)');
  const G = 1003n;
  await fund('x', T, G);
  const u = await freshAfter(now);
  const before = await balances(cid, [T, X1, Y1, DEP, cid]);
  await tx('b: small x taker refused', T, cid, 'swap', swapArgs(G, at(u.P, 900), u, true), '(err u1020)');
  const after = await balances(cid, [T, X1, Y1, DEP, cid]);
  deltas('b', before, after, [['taker', T, { y: 0n, x: 0n }], ['market', cid, { y: 0n, x: 0n }], ['treasury', DEP, { y: 0n, x: 0n }]]);
  await ev('b: cycle not advanced', cid, CYC, 'u0');
  await ev('b: books unchanged', cid, '{ a: (get-token-x-depositors u0), b: (get-token-y-depositors u0), c: (get-cycle-totals u0) }',
    `(tuple (a (list ${X1})) (b (list ${Y1})) (c (tuple (total-token-x u1000000) (total-token-y u10000000))))`);
  await ev('b: no settlement', cid, '(get-settlement u0)', 'none');
  finishPhase();
}
async function phaseB2(cid, P0) {
  console.log('PHASE b2: y taker under 0.2% of its side -> u1020');
  const Y1 = fresh(), X1 = fresh(), T = fresh();
  await place(cid, 'y', Y1, 1_000_000_000n, at(P0, 1100), 'b2 Y1');
  await admit(cid, 'x', X1, 5000n, at(P0, 2000), 'b2 X1 (high ask)');
  const G = 1_002_100n;
  await fund('y', T, G);
  const u = await freshAfter(now);
  const before = await balances(cid, [T, cid]);
  await tx('b2: small y taker refused', T, cid, 'swap', swapArgs(G, at(u.P, 1100), u, false), '(err u1020)');
  const after = await balances(cid, [T, cid]);
  deltas('b2', before, after, [['taker', T, { y: 0n, x: 0n }], ['market', cid, { y: 0n, x: 0n }]]);
  await ev('b2: books unchanged', cid, '{ a: (get-token-y-depositors u0), b: (get-cycle-totals u0), c: (get-settlement u0) }',
    `(tuple (a (list ${Y1})) (b (tuple (total-token-x u5000) (total-token-y u1000000000))) (c none))`);
  finishPhase();
}

// ================================================================== c ==
async function phaseC(cid, P0) {
  console.log('PHASE c: x taker\'s own small y order (opposite side) rolls');
  const Y1 = fresh(), T = fresh();
  await place(cid, 'y', Y1, 1_000_000_000n, at(P0, 1100), 'c Y1');
  await place(cid, 'y', T, 1_000_000n, at(P0, 1100), 'c T own y (small)');
  const G = 5010n;
  await fund('x', T, G);
  const u = await freshAfter(now);
  const rebate = rebateOf(G, 20n), net = G - rebate;
  const m = settle({ P: u.P, ys: [{ who: Y1, amt: 1_000_000_000n }], xs: [{ who: T, amt: net }], rebate, taker: T, tside: 'x' });
  check('c: model x binding', String(m.xb), 'true');
  const before = await balances(cid, [T, Y1, DEP, cid]);
  const r = await tx('c: x swap settles', T, cid, 'swap', swapArgs(G, at(u.P, 900), u, true),
    `(ok (tuple (rebate-refunded u${m.left}) (token-x-received u0) (token-x-rolled u0) (token-y-received u${m.x[0].recv}) (token-y-rolled u0)))`);
  printed('c', r, 'small-share-roll-y', { depositor: T, amount: 'u1000000' });
  printed('c', r, 'settlement', { 'x-cleared': `u${m.xc}`, 'y-cleared': `u${m.yc}`, 'x-rebate': `u${m.rideX}`, 'binding-side': '"x"' });
  printed('c', r, 'distribute-y-depositor', { depositor: Y1, 'x-received': `u${m.y[0].recv}`, 'y-rolled': `u${m.y[0].roll}` });
  const after = await balances(cid, [T, Y1, DEP, cid]);
  deltas('c', before, after, [
    ['taker', T, { y: m.x[0].recv, x: -G + m.left }], ['Y1', Y1, { y: 0n, x: m.y[0].recv }],
    ['treasury', DEP, { y: m.yfee + m.yDust, x: m.xfee + m.xDust }],
  ]);
  await ev('c: next y book', cid, '(get-token-y-depositors u1)', `(list ${T} ${Y1})`);
  await ev('c: next y amounts', cid, `(list (get-token-y-deposit u1 '${T}) (get-token-y-deposit u1 '${Y1}))`, `(list u1000000 u${m.y[0].roll})`);
  await ev('c: next totals', cid, '(get-cycle-totals u1)', `(tuple (total-token-x u0) (total-token-y u${1_000_000n + m.y[0].roll}))`);
  await ev('c: taker\'s rolled y order keeps its limit', cid, `(get limit ${order('y', T)})`, `u${at(P0, 1100)}`);
  finishPhase();
}

// ================================================================== d ==
async function phaseD(cid, P0) {
  console.log('PHASE d: sub-minimum x rests refunded (taker\'s own x too), dust both sides');
  const X1 = fresh(), X2 = fresh(), T = fresh();
  const xs = [{ who: X1, amt: 3001n }, { who: X2, amt: 2999n }, { who: T, amt: 1500n }];
  await place(cid, 'x', X1, 3001n, at(P0, 900), 'd X1');
  await place(cid, 'x', X2, 2999n, at(P0, 900), 'd X2');
  await place(cid, 'x', T, 1500n, at(P0, 900), 'd T own x');
  const u = await freshAfter(now);
  let net = 6000n * u.P / S, G, m;
  for (let i = 0; i < 5000; i++, net++) {
    G = grossFor(net, 20n);
    if (!G || net < MIN_Y) continue;
    m = settle({ P: u.P, ys: [{ who: T, amt: net }], xs, rebate: G - net, taker: T, tside: 'y' });
    if (!m.xb && m.yDust > 0n && m.xDust > 0n && m.x.every((e) => e.unf > 0n && e.ref === e.unf)) break;
    m = null;
  }
  if (!m) throw new Error('d: no sizing with dust on both sides');
  console.log(`d: net ${net} gross ${G} xc ${m.xc} yDust ${m.yDust} xDust ${m.xDust}`);
  await fund('y', T, G);
  const before = await balances(cid, [T, X1, X2, DEP, cid]);
  const r = await tx('d: y swap settles', T, cid, 'swap', swapArgs(G, at(u.P, 1100), u, false),
    `(ok (tuple (rebate-refunded u0) (token-x-received u${m.xAfter}) (token-x-rolled u${m.x[2].unf}) (token-y-received u${m.x[2].recv}) (token-y-rolled u0)))`);
  for (const [i, tag] of [[0, 'X1'], [1, 'X2'], [2, 'T']]) {
    printed(`d ${tag}`, r, 'refund-x', { depositor: xs[i].who, amount: `u${m.x[i].ref}` });
    printed(`d ${tag}`, r, 'distribute-x-depositor', { depositor: xs[i].who, 'y-received': `u${m.x[i].recv}`, 'x-rolled': 'u0', 'x-cleared': `u${m.x[i].cleared}` });
  }
  printed('d', r, 'sweep-dust', { 'x-unfilled': 'u0', 'y-unfilled': 'u0', 'x-dust': `u${m.xDust}`, 'x-payout-dust': `u${m.xPayoutDust}`, 'x-roll-dust': `u${m.xRollDust}`,
    'y-dust': `u${m.yDust}`, 'y-payout-dust': `u${m.yPayoutDust}`, 'y-roll-dust': `u${m.yRollDust}` });
  const after = await balances(cid, [T, X1, X2, DEP, cid]);
  deltas('d', before, after, [
    ['taker', T, { y: -G + m.x[2].recv, x: m.xAfter + m.x[2].ref }],
    ['X1', X1, { y: m.x[0].recv, x: m.x[0].ref }], ['X2', X2, { y: m.x[1].recv, x: m.x[1].ref }],
    ['treasury', DEP, { y: m.yfee + m.yDust, x: m.xfee + m.xDust }], ['market', cid, { y: 0n, x: -7500n }],
  ]);
  await ev('d: nothing rolls', cid, '{ x: (get-token-x-depositors u1), y: (get-token-y-depositors u1), t: (get-cycle-totals u1) }', '(tuple (t (tuple (total-token-x u0) (total-token-y u0))) (x (list )) (y (list )))');
  await ev('d: refunded orders deleted (taker\'s too)', cid, `(list (get limit ${order('x', X1)}) (get limit ${order('x', X2)}) (get limit ${order('x', T)}) (get limit ${order('y', T)}))`, '(list u0 u0 u0 u0)');
  await ev('d: market holds nothing', cid, `(list (stx-get-balance '${cid}) (unwrap-panic (contract-call? '${SBTC} get-balance '${cid})))`, '(list u0 u0)');
  finishPhase();
}

// ============================================================ e / ex ==
async function phaseE(cidY, cidX, P0) {
  console.log('PHASE e: two prints; same-side maker refunded, taker rest rolled + returned; pending limit "gone"');
  // A pool of prints, all newer than the pinned clock: pick the lowest and
  // highest mid. A maker quoting exactly one of them is admitted with the
  // other (not crossing) and fills at mid when the swap uses the first.
  let lo, hi;
  for (let i = 0; i < 90; i++) {
    const u = await freshAfter(now);
    if (!lo || u.P < lo.P) lo = u;
    if (!hi || u.P > hi.P) hi = u;
    if (lo.P !== hi.P) break;
    await new Promise((res) => setTimeout(res, 1000));
  }
  if (lo.P === hi.P) throw new Error('e: mid did not move');
  console.log(`e: lo ${lo.P} @${lo.at}, hi ${hi.P} @${hi.at}, clock ${now}`);

  // ---- e: y side ----
  {
    const cid = cidY, X1 = fresh(), M = fresh(), T = fresh();
    const X1amt = 8000n, Mamt = 5_000_000n;
    await place(cid, 'x', X1, X1amt, at(P0, 900), 'e X1');
    const ra = await admit(cid, 'y', M, Mamt, lo.P, 'e M (bid = lo mid, admitted with hi)', hi);
    printed('e', ra, 'deposit-y', { depositor: M, limit: `u${lo.P}` });
    await tx('e: X1 submits a new ask (pending)', X1, cid, 'set-token-x-limit', [uintCV(at(P0, 950)), noneCV()], '(ok false)');
    await ev('e: X1 pending limit stored', cid, `(get-token-x-pending-limit '${X1})`, `(some (tuple (limit u${at(P0, 950)}) (spread-bps none) (submitted-at u${now})))`);
    const yc = X1amt * lo.P / S;
    let net = yc + 1_200_000n - Mamt, G, m;
    for (let i = 0; i < 5000; i++, net++) {
      G = grossFor(net, 20n);
      if (!G || net < MIN_Y) continue;
      m = settle({ P: lo.P, ys: [{ who: M, amt: Mamt }, { who: T, amt: net }], xs: [{ who: X1, amt: X1amt }], rebate: G - net, taker: T, tside: 'y' });
      if (m.xb && m.y[0].ref > 0n && m.y[1].roll > 0n && m.y[1].roll < MIN_Y) break;
      m = null;
    }
    if (!m) throw new Error('e: no sizing');
    await fund('y', T, G);
    const before = await balances(cid, [T, M, X1, DEP, cid]);
    const r = await tx('e: y swap settles at lo', T, cid, 'swap', swapArgs(G, at(lo.P, 1100), lo, false),
      `(ok (tuple (rebate-refunded u${m.left}) (token-x-received u${m.y[1].recv}) (token-x-rolled u0) (token-y-received u0) (token-y-rolled u${m.y[1].roll})))`);
    notPrinted('e: M kept at mid', r, 'limit-roll-y');
    printed('e', r, 'settlement', { 'x-cleared': `u${X1amt}`, 'y-cleared': `u${m.yc}`, 'y-rebate': `u${m.rideY}`, 'binding-side': '"x"', 'oracle-price': `u${lo.P}` });
    printed('e M', r, 'refund-y', { depositor: M, amount: `u${m.y[0].ref}` });
    printed('e M', r, 'distribute-y-depositor', { depositor: M, 'y-rolled': 'u0', 'x-received': `u${m.y[0].recv}` });
    printed('e T', r, 'distribute-y-depositor', { depositor: T, 'y-rolled': `u${m.y[1].roll}`, 'x-received': `u${m.y[1].recv}` });
    printed('e', r, 'sweep-dust', { 'y-unfilled': `u${m.yRoll}`, 'x-dust': `u${m.xDust}`, 'y-dust': `u${m.yDust}` });
    const after = await balances(cid, [T, M, X1, DEP, cid]);
    deltas('e', before, after, [
      ['taker', T, { y: -G + m.left + m.y[1].roll, x: m.y[1].recv }], ['M', M, { y: m.y[0].ref, x: m.y[0].recv }],
      ['X1', X1, { y: m.x[0].recv, x: 0n }], ['treasury', DEP, { y: m.yfee + m.yDust, x: m.xfee + m.xDust }],
    ]);
    await ev('e: books empty after', cid, '{ x: (get-token-x-depositors u1), y: (get-token-y-depositors u1), t: (get-cycle-totals u1) }', '(tuple (t (tuple (total-token-x u0) (total-token-y u0))) (x (list )) (y (list )))');
    await ev('e: market holds nothing', cid, `(list (stx-get-balance '${cid}) (unwrap-panic (contract-call? '${SBTC} get-balance '${cid})))`, '(list u0 u0)');
    await ev('e: X1 filled: no stored order', cid, order('x', X1), orderStr(0n, 0n));
    const g = await tx('e: X1 pending limit settles as gone', keeper, cid, 'settle-token-x-limit', [principal(X1), update(await freshAfter(now))], '(ok false)');
    printed('e', g, 'settle-refused-x', { depositor: X1, action: '"limit"', reason: '"gone"' });
    await ev('e: gone clears the pending limit, stores nothing', cid, `{ a: (get-token-x-pending-limit '${X1}), b: (get limit ${order('x', X1)}) }`, '(tuple (a none) (b u0))');
    finishPhase();
  }
  // ---- ex: x side ----
  {
    const cid = cidX, Y1 = fresh(), M = fresh(), T = fresh();
    const Y1amt = 8000n * P0 / S, Mamt = 5000n; // ~8000 sats of bids
    await place(cid, 'y', Y1, Y1amt, at(P0, 1100), 'ex Y1');
    const ra = await admit(cid, 'x', M, Mamt, hi.P, 'ex M (ask = hi mid, admitted with lo)', lo);
    printed('ex', ra, 'deposit-x', { depositor: M, limit: `u${hi.P}` });
    await tx('ex: Y1 submits a new bid (pending)', Y1, cid, 'set-token-y-limit', [uintCV(at(P0, 1050)), noneCV()], '(ok false)');
    const xc = Y1amt * S / hi.P;
    let net = xc + 1200n - Mamt, G, m;
    for (let i = 0; i < 5000; i++, net++) {
      G = grossFor(net, 20n);
      if (!G || net < MIN_X) continue;
      m = settle({ P: hi.P, ys: [{ who: Y1, amt: Y1amt }], xs: [{ who: M, amt: Mamt }, { who: T, amt: net }], rebate: G - net, taker: T, tside: 'x' });
      if (!m.xb && m.x[0].ref > 0n && m.x[1].roll > 0n && m.x[1].roll < MIN_X) break;
      m = null;
    }
    if (!m) throw new Error('ex: no sizing');
    await fund('x', T, G);
    const before = await balances(cid, [T, M, Y1, DEP, cid]);
    const r = await tx('ex: x swap settles at hi', T, cid, 'swap', swapArgs(G, at(hi.P, 900), hi, true),
      `(ok (tuple (rebate-refunded u${m.left}) (token-x-received u0) (token-x-rolled u${m.x[1].roll}) (token-y-received u${m.x[1].recv}) (token-y-rolled u0)))`);
    notPrinted('ex: M kept at mid', r, 'limit-roll-x');
    printed('ex', r, 'settlement', { 'y-cleared': `u${Y1amt}`, 'x-cleared': `u${m.xc}`, 'x-rebate': `u${m.rideX}`, 'binding-side': '"y"', 'oracle-price': `u${hi.P}` });
    printed('ex M', r, 'refund-x', { depositor: M, amount: `u${m.x[0].ref}` });
    printed('ex T', r, 'distribute-x-depositor', { depositor: T, 'x-rolled': `u${m.x[1].roll}`, 'y-received': `u${m.x[1].recv}` });
    printed('ex', r, 'sweep-dust', { 'x-unfilled': `u${m.xRoll}`, 'x-dust': `u${m.xDust}`, 'y-dust': `u${m.yDust}` });
    const after = await balances(cid, [T, M, Y1, DEP, cid]);
    deltas('ex', before, after, [
      ['taker', T, { y: m.x[1].recv, x: -G + m.left + m.x[1].roll }], ['M', M, { y: m.x[0].recv, x: m.x[0].ref }],
      ['Y1', Y1, { y: 0n, x: m.y[0].recv }], ['treasury', DEP, { y: m.yfee + m.yDust, x: m.xfee + m.xDust }],
    ]);
    await ev('ex: market holds nothing', cid, `(list (stx-get-balance '${cid}) (unwrap-panic (contract-call? '${SBTC} get-balance '${cid})))`, '(list u0 u0)');
    const g = await tx('ex: Y1 pending limit settles as gone', keeper, cid, 'settle-token-y-limit', [principal(Y1), update(await freshAfter(now))], '(ok false)');
    printed('ex', g, 'settle-refused-y', { depositor: Y1, action: '"limit"', reason: '"gone"' });
    await ev('ex: gone clears the pending limit, stores nothing', cid, `{ a: (get-token-y-pending-limit '${Y1}), b: (get limit ${order('y', Y1)}) }`, '(tuple (a none) (b u0))');
    finishPhase();
  }
}

// ================================================================== f ==
async function phaseF(cid, P0) {
  console.log('PHASE f: limit refusals (crossing, stale) and a top-up behind a newer limit');
  const XM = fresh(), YM = fresh();
  await place(cid, 'x', XM, 5000n, at(P0, 900), 'f XM');
  await admit(cid, 'y', YM, 5_000_000n, at(P0, 500), 'f YM');
  const tY0 = now;
  await ev('f: YM order', cid, order('y', YM), orderStr(at(P0, 500), tY0));
  // y crossing
  await tx('f: YM bids through the ask (pending)', YM, cid, 'set-token-y-limit', [uintCV(at(P0, 1100)), noneCV()], '(ok false)');
  let r = await tx('f: crossing limit refused', keeper, cid, 'settle-token-y-limit', [principal(YM), update(await freshAfter(now))], '(ok false)');
  printed('f', r, 'settle-refused-y', { depositor: YM, action: '"limit"', reason: '"crossing"' });
  await ev('f: crossing: order unchanged, pending cleared', cid, `{ a: ${order('y', YM)}, b: (get-token-y-pending-limit '${YM}) }`, `(tuple (a ${orderStr(at(P0, 500), tY0)}) (b none))`);
  finishPhase();

  for (const side of ['x', 'y']) {
    const who = side === 'x' ? XM : YM;
    const k = side === 'x' ? [1200, 1300, 1400, 1500] : [600, 550, 520, 510];
    const top = side === 'x' ? [2000n, 1000n] : [2_000_000n, 1_000_000n];
    let amt = side === 'x' ? 5000n : 5_000_000n;
    // order 1: limit at t1, top-up at t2 > t1; the top-up settles first
    await pinTo(now + 1);
    const t1 = now;
    await tx(`f ${side}: limit ${k[0]} submitted`, who, cid, `set-token-${side}-limit`, [uintCV(at(P0, k[0])), noneCV()], '(ok false)');
    await pinTo(now + 1);
    const t2 = now;
    await fund(side, who, top[0]);
    await tx(`f ${side}: top-up ${top[0]} @ ${k[1]} submitted`, who, cid, `deposit-token-${side}`, depArgs(side, top[0], at(P0, k[1])), `(ok u${top[0]})`);
    let u = await freshAfter(now);
    await tx(`f ${side}: top-up settles first`, keeper, cid, `settle-token-${side}-deposit`, [principal(who), update(u), traits[side], assets[side]], `(ok u${top[0]})`);
    amt += top[0];
    await ev(`f ${side}: top-up wrote its newer limit`, cid, order(side, who), orderStr(at(P0, k[1]), t2));
    r = await tx(`f ${side}: older limit refused as stale`, keeper, cid, `settle-token-${side}-limit`, [principal(who), update(u)], '(ok false)');
    printed(`f ${side}`, r, `settle-refused-${side}`, { depositor: who, action: '"limit"', reason: '"stale"', amount: 'u0' });
    await ev(`f ${side}: stale: order unchanged, pending cleared`, cid, `{ a: ${order(side, who)}, b: (get-token-${side}-pending-limit '${who}) }`, `(tuple (a ${orderStr(at(P0, k[1]), t2)}) (b none))`);
    await ev(`f ${side}: amount`, cid, `(get-token-${side}-deposit ${CYC} '${who})`, `u${amt}`);
    finishPhase();
    // order 2: top-up at t3, limit at t4 > t3; the limit settles first
    const t3 = now;
    await fund(side, who, top[1]);
    await tx(`f ${side}: top-up ${top[1]} @ ${k[2]} submitted`, who, cid, `deposit-token-${side}`, depArgs(side, top[1], at(P0, k[2])), `(ok u${top[1]})`);
    await pinTo(now + 1);
    const t4 = now;
    await tx(`f ${side}: limit ${k[3]} submitted`, who, cid, `set-token-${side}-limit`, [uintCV(at(P0, k[3])), noneCV()], '(ok false)');
    u = await freshAfter(now);
    r = await tx(`f ${side}: newer limit settles first`, keeper, cid, `settle-token-${side}-limit`, [principal(who), update(u)], '(ok true)');
    printed(`f ${side}`, r, `limit-${side}`, { depositor: who, limit: `u${at(P0, k[3])}` });
    await ev(`f ${side}: limit stored with its submitted-at`, cid, order(side, who), orderStr(at(P0, k[3]), t4));
    r = await tx(`f ${side}: older top-up still adds its amount`, keeper, cid, `settle-token-${side}-deposit`, [principal(who), update(u), traits[side], assets[side]], `(ok u${top[1]})`);
    amt += top[1];
    printed(`f ${side}`, r, `deposit-${side}`, { depositor: who, amount: `u${amt}`, delta: `u${top[1]}` });
    await ev(`f ${side}: newer stored limit kept`, cid, order(side, who), orderStr(at(P0, k[3]), t4));
    await ev(`f ${side}: amount includes the top-up`, cid, `(get-token-${side}-deposit ${CYC} '${who})`, `u${amt}`);
    await ev(`f ${side}: cycle total`, cid, `(get total-token-${side} (get-cycle-totals ${CYC}))`, `u${amt}`);
    await ev(`f ${side}: market escrow`, cid, side === 'x' ? `(unwrap-panic (contract-call? '${SBTC} get-balance '${cid}))` : `(stx-get-balance '${cid})`, `u${amt}`);
    finishPhase();
  }
}

// ================================================================== g ==
async function phaseG(cid, P0) {
  console.log('PHASE g: parked withdraw, readmit gone (49 seats)');
  const sides = { y: { a: 10_000_000n, b: 20_000_000n, w: 3_000_000n, again: 15_000_000n, lim: at(P0, 500) },
    x: { a: 5000n, b: 8000n, w: 2000n, again: 6000n, lim: at(P0, 2000) } };
  for (const side of ['y', 'x']) {
    const s = sides[side], A = fresh(), B = fresh();
    if (side === 'y') await place(cid, 'y', A, s.a, s.lim, 'g yA');
    else await admit(cid, 'x', A, s.a, s.lim, 'g xA');
    await fund(side, B, s.b);
    await tx(`g ${side}: B submits (side full)`, B, cid, `deposit-token-${side}`, depArgs(side, s.b, s.lim), `(ok u${s.b})`);
    await tx(`g ${side}: B admitted, parks A`, keeper, cid, `settle-token-${side}-deposit`, [principal(B), update(await freshAfter(now)), traits[side], assets[side]], `(ok u${s.b})`);
    await ev(`g ${side}: A parked`, cid, `(list (get-token-${side}-parked '${A}) (get-token-${side}-deposit ${CYC} '${A}))`, `(list u${s.a} u0)`);
    const bal = side === 'y' ? `(stx-get-balance '${A})` : `(unwrap-panic (contract-call? '${SBTC} get-balance '${A}))`;
    const mbal = side === 'y' ? `(stx-get-balance '${cid})` : `(unwrap-panic (contract-call? '${SBTC} get-balance '${cid}))`;
    const m0 = BigInt((await evRaw(cid, mbal)).slice(1));
    let r = await tx(`g ${side}: withdraw from parked`, A, cid, `withdraw-token-${side}`, [uintCV(s.w), traits[side], assets[side]], `(ok u${s.a - s.w})`);
    printed(`g ${side}`, r, `withdraw-${side}`, { depositor: A, amount: `u${s.w}`, remaining: `u${s.a - s.w}`, parked: 'true' });
    await ev(`g ${side}: parked reduced, book untouched`, cid, `(list (get-token-${side}-parked '${A}) (get-token-${side}-deposit ${CYC} '${A}) (get total-token-${side} (get-cycle-totals ${CYC})))`, `(list u${s.a - s.w} u0 u${s.b})`);
    await ev(`g ${side}: A wallet`, cid, bal, `u${s.w}`);
    await ev(`g ${side}: market escrow`, cid, mbal, `u${m0 - s.w}`);
    await tx(`g ${side}: parked withdraw to below minimum refused`, A, cid, `withdraw-token-${side}`, [uintCV(s.a - s.w - (side === 'y' ? MIN_Y : MIN_X) + 1n), traits[side], assets[side]], '(err u1001)');
    finishPhase();
    const readAt = now;
    await tx(`g ${side}: readmit A submitted`, keeper, cid, `readmit-token-${side}`, [principal(A)], `(ok u${s.a - s.w})`);
    await fund(side, A, s.again);
    await tx(`g ${side}: A deposits again (carries parked)`, A, cid, `deposit-token-${side}`, depArgs(side, s.again, s.lim), `(ok u${s.again})`);
    const u = await freshAfter(now);
    r = await tx(`g ${side}: A admitted with carry, parks B`, keeper, cid, `settle-token-${side}-deposit`, [principal(A), update(u), traits[side], assets[side]], `(ok u${s.again})`);
    printed(`g ${side}`, r, `deposit-${side}`, { depositor: A, amount: `u${s.a - s.w + s.again}`, readmitted: `u${s.a - s.w}` });
    await ev(`g ${side}: A live with carry, B parked`, cid, `(list (get-token-${side}-deposit ${CYC} '${A}) (get-token-${side}-parked '${A}) (get-token-${side}-parked '${B}))`, `(list u${s.a - s.w + s.again} u0 u${s.b})`);
    await ev(`g ${side}: readmit still pending`, cid, `(get-token-${side}-pending-readmit '${A})`, `(some u${readAt})`);
    r = await tx(`g ${side}: readmit settles as gone`, keeper, cid, `settle-token-${side}-readmit`, [principal(A), update(u)], '(ok u0)');
    printed(`g ${side}`, r, `settle-refused-${side}`, { depositor: A, action: '"readmit"', reason: '"gone"', amount: 'u0' });
    await ev(`g ${side}: gone: nothing moved`, cid, `{ a: (get-token-${side}-pending-readmit '${A}), b: (get-token-${side}-deposit ${CYC} '${A}), c: (get-token-${side}-depositors ${CYC}) }`, `(tuple (a none) (b u${s.a - s.w + s.again}) (c (list ${A})))`);
    finishPhase();
  }
}

// ================================================================== i ==
async function phaseI(cid, P0) {
  console.log('PHASE i: print age bands');
  const X1 = fresh();
  await place(cid, 'x', X1, 200_000n, at(P0, 900), 'i X1');
  const u = await freshAfter(now);
  const G = 10_000_000n;
  let cyc = 0;
  for (const [age, bps] of [[30, 20n], [31, 21n], [79, 69n]]) {
    await pinTo(u.at + age);
    await ev(`i: age ${age}`, cid, 'stacks-block-time', `u${u.at + age}`);
    const T = fresh();
    await fund('y', T, G);
    const rebate = rebateOf(G, bps), net = G - rebate;
    const x1 = BigInt((await evRaw(cid, `(get-token-x-deposit ${CYC} '${X1})`)).slice(1));
    const m = settle({ P: u.P, ys: [{ who: T, amt: net }], xs: [{ who: X1, amt: x1 }], rebate, taker: T, tside: 'y' });
    const before = await balances(cid, [T, DEP]);
    const r = await tx(`i: age ${age} swap`, T, cid, 'swap', swapArgs(G, at(u.P, 1100), u, false),
      `(ok (tuple (rebate-refunded u0) (token-x-received u${m.xAfter}) (token-x-rolled u0) (token-y-received u0) (token-y-rolled u0)))`);
    printed(`i age ${age}`, r, 'deposit-y', { depositor: T, amount: `u${net}`, delta: `u${net}` });
    printed(`i age ${age}`, r, 'settlement', { 'y-rebate': `u${rebate}`, 'y-cleared': `u${net}` });
    const after = await balances(cid, [T, DEP]);
    deltas(`i age ${age} (${bps} bps)`, before, after, [['taker', T, { y: -G, x: m.xAfter }], ['treasury', DEP, { y: m.yfee, x: m.xfee }]]);
    cyc++;
    await ev(`i: age ${age}: cycle`, cid, CYC, `u${cyc}`);
    finishPhase();
  }
  await pinTo(u.at + 80);
  const T = fresh();
  await fund('y', T, G);
  await tx('i: age 80 print refused (stale)', T, cid, 'swap', swapArgs(G, at(u.P, 1100), u, false), (v) => v.startsWith('(err'));
  await ev('i: nothing moved', cid, `(list ${CYC} (stx-get-balance '${T}))`, `(list u${cyc} u${G})`);
  finishPhase();
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
