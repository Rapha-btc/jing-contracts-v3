// stxer mainnet-fork proof for the jing-btc-in-adapter v2 entry points, on top
// of verify-btc-in-adapter.js (A-J) and verify-btc-in-adapter-edges.js (K-R).
// The Jing deployer deploys smart-buy-sbtc-trait, the two relays
// (jing-ladder-dispatch-relay, jing-ladder-dispatch-sbtc-usdcx-relay) and the
// adapter, so every `.` ref resolves under SPV9K21... and the DEPLOYED
// jing-rung-deposit-trait is the rung trait. Everything else is LIVE: markets
// v6-4, both ladders, the seated band rungs, the live dispatchers.
//   A  owner: propose -> accept; stranger accept u4100; old owner keeps every
//      right until accept; re-propose overwrites; pending cleared after accept
//   B  sBTC/STX limit order, pending path (the book has bids): exact fee/net,
//      market pending-deposit == net with limit + spread, prints; keeper
//      settle-token-x-deposit with a fresh Lazer update -> rests with the same
//      limit/spread. Fixed limit and pegged (spread-bps) variants. Market errors
//      propagate with the fee rolled back: below min u1001, limit 0 u1011,
//      already pending u1031
//   C  same on sBTC/USDCx
//   D  rungs, sBTC/STX ladder buy side (is-band-x = jing-buy-stx-*, sBTC in):
//      1, 2 and all 10 seated rungs; exact positions (rung get-position), shares,
//      rung inventory delta, fee, prints
//   E  rungs, sBTC/USDCx ladder sell side (is-band-x = jing-sell-sbtc-*): same
//   F  dispatch errors with full rollback (fee too): sum != net u7102,
//      wrong-side / unseated / other-ladder rung u7104, duplicate u7105, zero
//      u7103, empty u7101, a rung's own error after an earlier rung deposited
//   G  LIVE dispatcher through a proxy contract -> u7106; the relay through the
//      same proxy -> ok (both ladders); the live dispatcher direct -> ok
//   H  real signed txs, SIP-040 Originator mode, sBTC cap on the user: limit and
//      rung paths, cap == amount ok (exact deltas), cap == amount - 1 aborts
//   I  direct-rest branch (runs last: it empties the bid side of each book on
//      the fork): every EOA bid cancels itself, the yguazu vault's operator
//      cancels its buy-back, a rung's members withdraw in full (a taker sweep
//      cannot: market swap refuses partial fills, u1017); then the adapter
//      limit order rests at once, no pending
// Run: node simulations/verify-btc-in-adapter-v2.js
import { readFileSync } from 'node:fs';
import {
  uintCV, noneCV, boolCV, someCV, bufferCV, stringAsciiCV, listCV, tupleCV as rawTupleCV, Pc, PostConditionMode,
  makeUnsignedContractCall, deserializeCV,
} from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps, getNonce, setSender } from 'stxer';
import {
  NODE, DEP, SBTC, WSTX, WHALE, P_, mk, S, retry, sleep, check, must, show, tx, evalIn, call, deploy, prints, summary, Stop,
  setGroup, E, OK, sbtcBal, freshUpd, updCV, note, plain, stxTransfer,
} from './_yg-loop-common.js';
import { lazerFeedTimes } from './_lazer.js';

const src = (f) => readFileSync(new URL(`../contracts/btc-in/${f}.clar`, import.meta.url), 'utf8');
const csrc = (f) => readFileSync(new URL(`../contracts/${f}.clar`, import.meta.url), 'utf8');
const tupleCV = (o) => rawTupleCV(Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))));
const AD = `${DEP}.jing-btc-in-adapter`;
const RELAY_S = `${DEP}.jing-ladder-dispatch-relay`, RELAY_U = `${DEP}.jing-ladder-dispatch-sbtc-usdcx-relay`;
const LIVE_S = `${DEP}.jing-ladder-dispatch`, LIVE_U = `${DEP}.jing-ladder-dispatch-sbtc-usdcx`;
const LAD_S = `${DEP}.jing-ladder-v1`, LAD_U = `${DEP}.jing-ladder-sbtc-usdcx-v1`;
const MKT_S = `${DEP}.markets-sbtc-stx-jing-v6-4`, MKT_U = `${DEP}.markets-sbtc-usdcx-jing-v6-4`;
const PROXY = `${DEP}.btc-in-dispatch-proxy`;
const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const BPS = 10_000n, RSCALE = 1_000_000_000_000n;
const FEE = mk(8), STRANGER = mk(6), NEWOWNER = mk(2);
const U = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`u${i + 1}`, mk(41 + i)]));
const SPREADS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90];
const LAZER_HDR = { headers: { 'x-api-key': 'jc_e4d2e10396eef95215a7afd492f42d743a3325739d29200c2a28b256f778be01' } };
const buf = (hex) => bufferCV(Buffer.from(hex.replace(/^0x/, ''), 'hex'));
const canon = (o) => show(Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b))));
const btcIn = (receipt) => prints(receipt).filter((p) => p.event === 'btc-in');
const isStd = (p) => !p.includes('.');

// the two markets, as one table
const M = {
  stx: { mkt: MKT_S, fn: 'deposit-sbtc-limit-stx', ty: WSTX, ay: 'wstx', fresh: async () => { await freshUpd(true); return { hex: S.UPD.hex, mid: S.MID }; } },
  usdcx: { mkt: MKT_U, fn: 'deposit-sbtc-limit-usdcx', ty: USDCX, ay: 'usdcx-token', fresh: freshUsdcx },
};
// the two ladders, as one table: is-band-x is the sBTC side on both
const L = {
  stx: { lad: LAD_S, relay: RELAY_S, live: LIVE_S, fn: 'dispatch-sbtc-rungs-stx', relayFn: 'deposit-buy', side: 'buy-band', buy: true, wrong: 'sel-band', pBuy: 'p-live-buy', pRelay: 'p-relay-buy' },
  usdcx: { lad: LAD_U, relay: RELAY_U, live: LIVE_U, fn: 'dispatch-sbtc-rungs-usdcx', relayFn: 'deposit-sell', side: 'sel-band', buy: false, wrong: 'buy-band', pBuy: 'p-live-sell', pRelay: 'p-relay-sell' },
};

// a fresh sBTC/USDCx (feeds 1/7) Lazer update newer than the sim block time
async function freshUsdcx() {
  const bt = Number(await evalIn(MKT_U, 'stacks-block-time'));
  for (let i = 0; i < 40; i++) {
    const r = await retry(() => fetch('https://faktory-dao-backend.vercel.app/api/auction/pyth-lazer-update?pair=sbtc-usdcx', LAZER_HDR));
    if (!r.ok) throw new Error(`backend lazer ${r.status}`);
    const d = (await r.json()).data;
    const hex = d.hex.replace(/^0x/, ''), t = await retry(() => lazerFeedTimes(hex, [1, 7]));
    if (t.at > bt) { console.log(`  usdcx lazer update at ${t.at} (block time ${bt})`); return { hex, at: t.at, mid: BigInt(d.priceX) * 100000000n / BigInt(d.priceY) }; }
    await sleep(3000);
  }
  throw new Error('no fresh [1,7] update');
}

function ftMoves(receipt) {
  return (receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.committed !== false && e.ft_transfer_event)
    .map((e) => ({ asset: e.ft_transfer_event.asset_identifier, sender: e.ft_transfer_event.sender, recipient: e.ft_transfer_event.recipient, amount: BigInt(e.ft_transfer_event.amount) }));
}
function allPrints(receipt) {
  return (receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.committed !== false && e.contract_event)
    .map((e) => { try { return plain(deserializeCV(e.contract_event.raw_value)); } catch { return null; } }).filter(Boolean);
}
function checkBtcIn(label, receipt, user, target, amount, fee) {
  const ev = btcIn(receipt);
  const want = { event: 'btc-in', user, target, amount, 'fee-sats': fee, 'net-sats': amount - fee };
  check(`${label}: btc-in print exact`, ev.length === 1 && canon(ev[0]) === canon(want), show(ev));
}

async function signedCall(sender, cid, fn, args, postConditions, mode = PostConditionMode.Originator) {
  const [addr, name] = cid.split('.');
  const raw = await makeUnsignedContractCall({
    contractAddress: addr, contractName: name, functionName: fn, functionArgs: args, postConditions,
    postConditionMode: mode, nonce: await retry(() => getNonce(S.sid, sender)), network: 'mainnet', publicKey: '0'.repeat(66), fee: 0,
  });
  setSender(raw, sender);
  await retry(() => submitSimulationSteps(S.sid, { steps: [{ TenureExtend: { cause: 'Extended' } }] }));
  const out = await retry(() => submitSimulationSteps(S.sid, { steps: [{ Transaction: raw.serialize() }] }));
  const t = out.steps[0]?.Transaction?.Ok;
  if (!t) throw new Error(`tx step failed: ${JSON.stringify(out.steps[0]).slice(0, 400)}`);
  let res = null; try { res = plain(deserializeCV(t.result)); } catch { /* */ }
  return { res, receipt: t, pcAborted: !!t.post_condition_aborted, vm: t.vm_error ?? null };
}

// test-only: forwards a dispatch, so contract-caller at the dispatcher is this contract
const PROXY_SRC = `;; test-only proxy: tx-sender stays the user, contract-caller is this contract
(use-trait rung '${DEP}.jing-rung-deposit-trait.rung-trait)
(define-public (p-live-buy (total uint) (a (list 10 { rung: <rung>, amount: uint })))
  (contract-call? '${LIVE_S} deposit-buy total a))
(define-public (p-relay-buy (total uint) (a (list 10 { rung: <rung>, amount: uint })))
  (contract-call? .jing-ladder-dispatch-relay deposit-buy total a))
(define-public (p-live-sell (total uint) (a (list 10 { rung: <rung>, amount: uint })))
  (contract-call? '${LIVE_U} deposit-sell total a))
(define-public (p-relay-sell (total uint) (a (list 10 { rung: <rung>, amount: uint })))
  (contract-call? .jing-ladder-dispatch-sbtc-usdcx-relay deposit-sell total a))
`;

// every member a rung ever logged a deposit for, from the ladder's print log
async function rungMembers(lad, rung) {
  const out = new Set(), api = NODE.replace(/\/$/, '');
  for (let off = 0; off < 2000; off += 50) {
    const r = await retry(() => fetch(`${api}/extended/v1/contract/${lad}/events?limit=50&offset=${off}`));
    const j = await r.json(), rs = j.results ?? [];
    for (const e of rs) {
      const repr = e.contract_log?.value?.repr ?? '';
      if (repr.includes('(event "rung-deposit")') && repr.includes(`(rung '${rung})`)) { const mm = repr.match(/\(member '([A-Z0-9a-z.-]+)\)/); if (mm) out.add(mm[1]); }
    }
    if (rs.length < 50) break;
  }
  return [...out];
}
const allocCV = (allocs) => listCV(allocs.map(([r, a]) => tupleCV({ rung: P_(r), amount: uintCV(a) })));
const split = (net, n) => Array.from({ length: n }, (_, i) => net / BigInt(n) + (i === 0 ? net % BigInt(n) : 0n));
const rungState = async (r) => await evalIn(r, '(get-state)');
const rungPos = async (r, who) => await evalIn(r, `(get-position '${who})`);

// --- limit orders ---
async function limitPending(tag, k, user, amount, fee, limit, spread) {
  const m = M[k];
  const cyc = await evalIn(m.mkt, '(get-current-cycle)');
  const u0 = await sbtcBal(user), f0 = await sbtcBal(FEE), k0 = await sbtcBal(m.mkt);
  const spreadCV = spread === null ? noneCV() : someCV(uintCV(spread));
  const r = await tx(`${tag} ${m.fn} ${amount} fee ${fee} limit ${limit} spread ${spread ?? 'none'}`, user, AD, m.fn, [uintCV(amount), uintCV(fee), uintCV(limit), spreadCV], OK);
  const net = amount - fee;
  check(`${tag}: result {fee-sats ${fee}, deposit ${net}}`, canon(r.res?.ok) === canon({ 'fee-sats': fee, deposit: net }), show(r.res));
  check(`${tag}: user sBTC -${amount}, fee-recipient +${fee}, market +${net}`, u0 - (await sbtcBal(user)) === amount && (await sbtcBal(FEE)) - f0 === fee && (await sbtcBal(m.mkt)) - k0 === net,
    `${u0 - (await sbtcBal(user))} / ${(await sbtcBal(FEE)) - f0} / ${(await sbtcBal(m.mkt)) - k0}`);
  check(`${tag}: adapter holds no sBTC`, (await sbtcBal(AD)) === 0n);
  const pend = await evalIn(m.mkt, `(get-token-x-pending-deposit '${user})`);
  check(`${tag}: market pending-deposit == {amount ${net}, limit ${limit}, spread ${spread ?? 'none'}}`, pend && pend.amount === net && pend.limit === limit && pend['spread-bps'] === (spread === null ? null : BigInt(spread)), show(pend));
  check(`${tag}: nothing resting yet (cycle ${cyc} deposit 0)`, (await evalIn(m.mkt, `(get-token-x-deposit u${cyc} '${user})`)) === 0n);
  checkBtcIn(tag, r.receipt, user, m.mkt, amount, fee);
  const pp = allPrints(r.receipt).filter((p) => p.event === 'pending-deposit-x');
  check(`${tag}: pending-deposit-x print {depositor user, amount net, limit, spread}`, pp.length === 1 && pp[0].depositor === user && pp[0].amount === net && pp[0].limit === limit && pp[0]['spread-bps'] === (spread === null ? null : BigInt(spread)) && pp[0].market === m.mkt, show(pp));
  const ps = allPrints(r.receipt), iB = ps.findIndex((p) => p.event === 'btc-in'), iP = ps.findIndex((p) => p.event === 'pending-deposit-x');
  check(`${tag}: btc-in printed before the market print`, iB >= 0 && iP > iB, `${iB} ${iP}`);
  return { net, submittedAt: pend?.['submitted-at'] };
}

async function keeperSettle(tag, k, user, net, limit, spread) {
  const m = M[k];
  const u = await m.fresh();
  const u0 = await sbtcBal(user);
  const r = await tx(`${tag} keeper settle-token-x-deposit with a fresh Lazer update`, DEP, m.mkt, 'settle-token-x-deposit', [P_(user), buf(u.hex), P_(SBTC), stringAsciiCV('sbtc-token')], (v) => v?.ok === net);
  const cyc = await evalIn(m.mkt, '(get-current-cycle)');
  check(`${tag}: pending cleared`, (await evalIn(m.mkt, `(get-token-x-pending-deposit '${user})`)) === null);
  check(`${tag}: rests: get-token-x-deposit(cycle ${cyc}) == ${net}`, (await evalIn(m.mkt, `(get-token-x-deposit u${cyc} '${user})`)) === net);
  const ord = await evalIn(m.mkt, `(get-token-x-order '${user})`);
  check(`${tag}: order limit ${limit}, spread ${spread ?? 'none'}`, ord.limit === limit && ord['spread-bps'] === (spread === null ? null : BigInt(spread)), show(ord));
  check(`${tag}: no refund to the user (did not cross)`, (await sbtcBal(user)) === u0);
  const dx = allPrints(r.receipt).filter((p) => p.event === 'deposit-x');
  check(`${tag}: deposit-x print {depositor user, delta net, limit}`, dx.length === 1 && dx[0].depositor === user && dx[0].delta === net && dx[0].limit === limit, show(dx));
}

// a failing adapter call: nothing moved, no print
async function failing(label, user, fn, args, want, extra = []) {
  const snap = async () => canon({ u: await sbtcBal(user), f: await sbtcBal(FEE), a: await sbtcBal(AD), ...Object.fromEntries(await Promise.all(extra.map(async (x) => [x, await sbtcBal(x)]))) });
  const b0 = await snap();
  const r = await tx(label, user, AD, fn, args, want);
  const b1 = await snap();
  check(`${label}: nothing moved (user, fee-recipient, adapter${extra.length ? `, ${extra.length} contracts` : ''})`, b0 === b1, `${b0} -> ${b1}`);
  check(`${label}: no btc-in print committed`, btcIn(r.receipt).length === 0);
  return r;
}

// --- rungs ---
async function dispatchRungs(tag, k, user, amount, fee, rungs) {
  const l = L[k], net = amount - fee;
  const allocs = rungs.map((r, i) => [r, split(net, rungs.length)[i]]);
  const before = await Promise.all(rungs.map(async (r) => ({ st: await rungState(r), pos: await rungPos(r, user), bal: await sbtcBal(r) })));
  const u0 = await sbtcBal(user), f0 = await sbtcBal(FEE);
  const r = await tx(`${tag} ${l.fn} ${amount} fee ${fee} across ${rungs.length} rung(s)`, user, AD, l.fn, [uintCV(amount), uintCV(fee), allocCV(allocs)], OK);
  const d = r.res?.ok?.dispatch ?? {};
  check(`${tag}: result fee-sats ${fee}, dispatch amount ${net}, rungs ${rungs.length}, paid 0/0`, r.res?.ok?.['fee-sats'] === fee && d.amount === net && d.rungs === BigInt(rungs.length) && d['stx-paid'] === 0n && d['sbtc-paid'] === 0n, show(r.res));
  check(`${tag}: user sBTC -${amount} exactly, fee-recipient +${fee}`, u0 - (await sbtcBal(user)) === amount && (await sbtcBal(FEE)) - f0 === fee, `${u0 - (await sbtcBal(user))} / ${(await sbtcBal(FEE)) - f0}`);
  check(`${tag}: adapter + relay hold no sBTC`, (await sbtcBal(AD)) === 0n && (await sbtcBal(l.relay)) === 0n);
  let good = 0;
  for (let i = 0; i < rungs.length; i++) {
    const rg = rungs[i], [, a] = allocs[i], p = (d.positions ?? [])[i] ?? {};
    const st = await rungState(rg), pos = await rungPos(rg, user), b = before[i];
    // inventory on balance + market (sync folds any unrecorded sats on the
    // rung's balance into held-sats, so the recorded held is not a baseline)
    const inv0 = b.st.resting + b.bal, inv1 = st.resting + (await sbtcBal(rg));
    // sync may roll a sold-out epoch inside deposit: then the user opens the
    // new epoch alone (total-shares == the user's shares, members 1)
    const rolled = st.epoch !== b.st.epoch;
    const wantSbtc = st.members === 1n ? st.resting + st['held-sats'] : pos.shares * st['unfilled-index'] / RSCALE;
    const ok = p.rung === rg && p.amount === a && p.epoch === st.epoch && p['stx-paid'] === 0n && p['sbtc-paid'] === 0n
      && b.pos.shares === 0n && pos.shares === p.shares && p.shares > 0n && pos.sbtc === wantSbtc
      && (st.members === 1n ? pos.sbtc >= a : a - pos.sbtc <= 1n && pos.sbtc <= a)
      && inv1 - inv0 === a
      && (rolled ? st['total-shares'] === p.shares && st.members === 1n
        : st['total-shares'] - b.st['total-shares'] === p.shares && st.members - b.st.members === 1n);
    if (rolled) note(`${tag}: ${rg.split('.')[1]} rolled epoch ${b.st.epoch} -> ${st.epoch} inside the deposit (sold-out sync)`);
    if (ok) good++;
    else check(`${tag}: rung ${rg.split('.')[1]} position`, false, show({ p, pos, wantSbtc, inv0, inv1, a, st: { members: st.members, ts: st['total-shares'], ts0: b.st['total-shares'], idx: st['unfilled-index'] } }));
  }
  check(`${tag}: every rung: position shares == result shares == total-shares delta (or == total-shares after an epoch roll), get-position sbtc == shares * unfilled-index / SCALE (floor, within 1 sat of alloc), inventory (market + rung sBTC balance) +alloc exactly, members +1`, good === rungs.length, `${good}/${rungs.length}`);
  const rd = allPrints(r.receipt).filter((p) => p.event === 'rung-deposit');
  check(`${tag}: one rung-deposit print per rung, member = user, amount = alloc`, rd.length === rungs.length && rd.every((p, i) => p.member === user && p.rung === rungs[i] && p.amount === allocs[i][1] && p.side === l.side && p.current === true), show(rd.map((p) => [p.rung, p.amount, p.member])));
  const ld = allPrints(r.receipt).filter((p) => p.event === 'ladder-dispatched');
  check(`${tag}: ladder-dispatched print {member user, buy ${l.buy}, amount net, rungs n}`, ld.length === 1 && canon(ld[0]) === canon({ event: 'ladder-dispatched', member: user, buy: l.buy, amount: net, rungs: BigInt(rungs.length) }), show(ld));
  checkBtcIn(tag, r.receipt, user, l.relay, amount, fee);
  return r;
}

try {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  if (process.env.H) b.useBlockHeight(Number(process.env.H));
  b.withSender(DEP).addEvalCode(SBTC, '(get-total-supply)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);

  setGroup('setup');
  await deploy(DEP, 'smart-buy-sbtc-trait', src('smart-buy-sbtc-trait'));
  await deploy(DEP, 'jing-ladder-dispatch-relay', csrc('jing-ladder-dispatch-relay'));
  await deploy(DEP, 'jing-ladder-dispatch-sbtc-usdcx-relay', csrc('sbtc-usdcx/jing-ladder-dispatch-sbtc-usdcx-relay'));
  await deploy(DEP, 'jing-btc-in-adapter', src('jing-btc-in-adapter'));
  await deploy(DEP, 'btc-in-dispatch-proxy', PROXY_SRC);
  for (const [who, amt] of [...Object.values(U).map((u) => [u, 600_000n]), [FEE, 10_000n]]) {
    const r = await call(WHALE.x, SBTC, 'transfer', [uintCV(amt), P_(WHALE.x), P_(who), noneCV()]);
    must(`fund ${who.slice(0, 8)} ${amt} sats`, r.res?.ok === true, show(r.res ?? r.vm));
  }
  await tx('owner set-fee-recipient FEE', DEP, AD, 'set-fee-recipient', [P_(FEE)], { ok: true });

  // the seated band rungs, read from the ladders
  const seated = {};
  for (const [k, l] of Object.entries(L)) {
    seated[k] = []; const wrong = [];
    for (const s of SPREADS) {
      const r = await evalIn(l.lad, `(get-rung "${l.side}" u${s})`);
      if (r && (await evalIn(l.lad, `(is-band-x '${r})`)) === true) seated[k].push(r);
      const w = await evalIn(l.lad, `(get-rung "${l.wrong}" u${s})`);
      if (w) wrong.push(w);
    }
    l.wrongRungs = wrong;
    console.log(`  ${k}: ${seated[k].length} seated ${l.side} (is-band-x): ${seated[k].map((x) => x.split('.')[1]).join(' ')}`);
    must(`${k}: ladder ${l.lad.split('.')[1]} has seated is-band-x rungs (count ${await evalIn(l.lad, `(get-band-count "${l.side}")`)}, max ${await evalIn(l.lad, '(get-max-band-per-side)')})`, seated[k].length > 0, `${seated[k].length}`);
    check(`${k}: every ${l.wrong} rung answers is-band-x false, is-band-y true (the other side)`, wrong.length > 0 && (await Promise.all(wrong.map(async (w) => (await evalIn(l.lad, `(is-band-x '${w})`)) === false && (await evalIn(l.lad, `(is-band-y '${w})`)) === true))).every(Boolean), `${wrong.length}`);
  }
  // side mapping, from the rung code itself: the is-band-x rung's input asset is sBTC
  for (const k of ['stx', 'usdcx']) {
    const r0 = seated[k][0];
    const w = L[k].wrongRungs[0];
    check(`${k}: is-band-x rung ${r0.split('.')[1]} reports pooled sBTC (sBTC input) and side ${L[k].side}`, (await evalIn(L[k].lad, `(get-registered '${r0})`))?.side === L[k].side && (await rungState(r0)).pooled !== undefined);
    note(`${k}: is-band-x = ${r0.split('.')[1]} (side ${L[k].side}); other side = ${w.split('.')[1]} (side ${L[k].wrong})`);
  }

  setGroup('A owner: propose / accept');
  const c0 = await evalIn(AD, '(get-config)');
  check('A0 defaults: owner DEP, pending none', c0.owner === DEP && c0['pending-owner'] === null, show(c0));
  await tx('A1 stranger propose-owner -> u4100', STRANGER, AD, 'propose-owner', [P_(STRANGER)], E(4100));
  await tx('A1 accept-owner with nothing pending -> u4100', NEWOWNER, AD, 'accept-owner', [], E(4100));
  await tx('A2 owner propose-owner STRANGER', DEP, AD, 'propose-owner', [P_(STRANGER)], { ok: true });
  check('A2 pending STRANGER, owner DEP', (await evalIn(AD, '(get-config)'))['pending-owner'] === STRANGER && (await evalIn(AD, '(get-config)')).owner === DEP);
  await tx('A3 re-propose NEWOWNER overwrites', DEP, AD, 'propose-owner', [P_(NEWOWNER)], { ok: true });
  check('A3 pending NEWOWNER', (await evalIn(AD, '(get-config)'))['pending-owner'] === NEWOWNER);
  await tx('A3 overwritten STRANGER accept-owner -> u4100', STRANGER, AD, 'accept-owner', [], E(4100));
  await tx('A4 a stranger (U1) accept-owner -> u4100', U.u1, AD, 'accept-owner', [], E(4100));
  await tx('A5 before accept, the old owner keeps rights: set-max-fee-sats 4000', DEP, AD, 'set-max-fee-sats', [uintCV(4000n)], { ok: true });
  await tx('A5 before accept, the old owner can still re-propose (NEWOWNER again)', DEP, AD, 'propose-owner', [P_(NEWOWNER)], { ok: true });
  await tx('A5 before accept, NEWOWNER has no rights -> u4100', NEWOWNER, AD, 'set-paused', [boolCV(true)], E(4100));
  await tx('A6 NEWOWNER accept-owner', NEWOWNER, AD, 'accept-owner', [], { ok: true });
  const c6 = await evalIn(AD, '(get-config)');
  check('A6 owner NEWOWNER, pending cleared (none)', canon(c6) === canon({ owner: NEWOWNER, 'pending-owner': null, 'fee-recipient': FEE, 'max-fee-sats': 4000n, paused: false }), show(c6));
  await tx('A6 accept-owner again -> u4100 (nothing pending)', NEWOWNER, AD, 'accept-owner', [], E(4100));
  for (const [fn, args] of [['propose-owner', [P_(DEP)]], ['set-fee-recipient', [P_(DEP)]], ['set-max-fee-sats', [uintCV(1n)]], ['set-paused', [boolCV(true)]], ['set-target', [P_(`${DEP}.pepe-smart-faktory`), boolCV(true)]]]) {
    await tx(`A7 old owner after accept: ${fn} -> u4100`, DEP, AD, fn, args, E(4100));
  }
  await tx('A8 new owner set-max-fee-sats 3000', NEWOWNER, AD, 'set-max-fee-sats', [uintCV(3000n)], { ok: true });
  await tx('A8 new owner proposes DEP back', NEWOWNER, AD, 'propose-owner', [P_(DEP)], { ok: true });
  await tx('A8 DEP accept-owner', DEP, AD, 'accept-owner', [], { ok: true });
  const c8 = await evalIn(AD, '(get-config)');
  check('A8 owner DEP again, pending none, max 3000', c8.owner === DEP && c8['pending-owner'] === null && c8['max-fee-sats'] === 3000n, show(c8));
  await tx('A8 NEWOWNER lost rights -> u4100', NEWOWNER, AD, 'set-paused', [boolCV(true)], E(4100));

  for (const [g, k] of [['B', 'stx'], ['C', 'usdcx']]) {
    setGroup(`${g} limit order, ${k} market, pending path + keeper settle`);
    const m = M[k];
    const ys = await evalIn(m.mkt, `(get-token-y-depositors (get-current-cycle))`);
    must(`${g}0 the ${k} book has bids (${ys.length} y depositors) -> deposit-token-x parks pending`, ys.length > 0, show(ys));
    const u = await m.fresh();
    const lim = u.mid * 10500n / BPS;
    const [ua, ub, uc, ud] = g === 'B' ? [U.u1, U.u2, U.u3, U.u4] : [U.u5, U.u6, U.u7, U.u8];
    const p1 = await limitPending(`${g}1 fixed limit (mid + 5%)`, k, ua, 100_000n, 1_000n, lim, null);
    await keeperSettle(`${g}1`, k, ua, p1.net, lim, null);
    const floor = u.mid * 9000n / BPS;
    const p2 = await limitPending(`${g}2 pegged (spread 50 bps, floor mid - 10%)`, k, ub, 80_000n, 2_500n, floor, 50);
    await keeperSettle(`${g}2`, k, ub, p2.net, floor, 50);
    // errors, fee rolled back
    const p3 = await limitPending(`${g}3 pending again (setup for already-pending)`, k, uc, 50_000n, 500n, lim, null);
    await failing(`${g}4 second deposit while pending -> u1031 (fee rolled back)`, uc, m.fn, [uintCV(40_000n), uintCV(500n), uintCV(lim), noneCV()], E(1031), [m.mkt]);
    check(`${g}4 the first pending deposit is untouched`, (await evalIn(m.mkt, `(get-token-x-pending-deposit '${uc})`))?.amount === p3.net);
    await failing(`${g}5 net 999 < min-token-x 1000 -> u1001 (fee rolled back)`, ud, m.fn, [uintCV(1_999n), uintCV(1_000n), uintCV(lim), noneCV()], E(1001), [m.mkt]);
    await failing(`${g}6 limit 0 -> u1011 (fee rolled back)`, ud, m.fn, [uintCV(50_000n), uintCV(500n), uintCV(0n), noneCV()], E(1011), [m.mkt]);
    await failing(`${g}7 spread 10000 -> u1026 (fee rolled back)`, ud, m.fn, [uintCV(50_000n), uintCV(500n), uintCV(lim), someCV(uintCV(10_000n))], E(1026), [m.mkt]);
    await failing(`${g}8 fee > max -> u4101 before the market`, ud, m.fn, [uintCV(50_000n), uintCV(3_001n), uintCV(lim), noneCV()], E(4101), [m.mkt]);
    const p9 = await limitPending(`${g}9 net exactly min 1000 (amount 1500, fee 500)`, k, ud, 1_500n, 500n, lim, null);
    check(`${g}9 net 1000 accepted`, p9.net === 1_000n);
  }

  for (const [g, k] of [['D', 'stx'], ['E', 'usdcx']]) {
    setGroup(`${g} rungs, ${k} ladder (${L[k].side} = is-band-x, sBTC in)`);
    const R = seated[k];
    const [ua, ub, uc] = g === 'D' ? [U.u9, U.u10, U.u11] : [U.u12, U.u13, U.u14];
    await dispatchRungs(`${g}1 one rung`, k, ua, 50_000n, 1_000n, [R[0]]);
    if (R.length >= 2) await dispatchRungs(`${g}2 two rungs`, k, ub, 60_001n, 1_000n, [R[1], R[R.length - 1]]);
    await dispatchRungs(`${g}3 all ${R.length} seated rungs (max)`, k, uc, 100_007n, 2_000n, R);
    check(`${g}3 ${R.length} == ladder band count`, BigInt(R.length) === await evalIn(L[k].lad, `(get-band-count "${L[k].side}")`));
  }

  setGroup('F dispatch errors, full rollback');
  for (const k of ['stx', 'usdcx']) {
    const l = L[k], R = seated[k], user = k === 'stx' ? U.u15 : U.u16, fn = l.fn;
    const ex = [...R.slice(0, 3), l.relay];
    const other = k === 'stx' ? seated.usdcx[0] : seated.stx[0];
    await failing(`F ${k}: allocations sum < net -> u7102`, user, fn, [uintCV(50_000n), uintCV(1_000n), allocCV([[R[0], 20_000n], [R[1], 28_999n]])], E(7102), ex);
    await failing(`F ${k}: allocations sum > net -> u7102`, user, fn, [uintCV(50_000n), uintCV(1_000n), allocCV([[R[0], 20_000n], [R[1], 29_001n]])], E(7102), ex);
    await failing(`F ${k}: allocations sum == amount (fee forgotten) -> u7102`, user, fn, [uintCV(50_000n), uintCV(1_000n), allocCV([[R[0], 50_000n]])], E(7102), ex);
    await failing(`F ${k}: wrong-side rung ${l.wrongRungs[0].split('.')[1]} -> u7104`, user, fn, [uintCV(50_000n), uintCV(1_000n), allocCV([[R[0], 20_000n], [l.wrongRungs[0], 29_000n]])], E(7104), ex);
    await failing(`F ${k}: other ladder's rung ${other.split('.')[1]} (unregistered here) -> u7104`, user, fn, [uintCV(50_000n), uintCV(1_000n), allocCV([[other, 49_000n]])], E(7104), [...ex, other]);
    await failing(`F ${k}: a non-rung contract (the adapter) as rung -> u7104`, user, fn, [uintCV(50_000n), uintCV(1_000n), allocCV([[R[0], 20_000n], [AD, 29_000n]])], (v) => v?.err !== undefined, ex);
    await failing(`F ${k}: duplicate rung -> u7105`, user, fn, [uintCV(50_000n), uintCV(1_000n), allocCV([[R[0], 20_000n], [R[0], 29_000n]])], E(7105), ex);
    await failing(`F ${k}: zero allocation -> u7103`, user, fn, [uintCV(50_000n), uintCV(1_000n), allocCV([[R[0], 49_000n], [R[1], 0n]])], E(7103), ex);
    await failing(`F ${k}: empty allocations -> u7101`, user, fn, [uintCV(50_000n), uintCV(1_000n), listCV([])], E(7101), ex);
    // validation passes, rung 1 deposits, rung 2 refuses (below its MIN_DEPOSIT 100): all of it rolls back
    const st0 = await rungState(R[0]);
    await failing(`F ${k}: rung 2 below its min deposit (99) after rung 1 deposited -> u7005, all rolled back`, user, fn, [uintCV(50_000n), uintCV(1_000n), allocCV([[R[0], 48_901n], [R[1], 99n]])], E(7005), ex);
    check(`F ${k}: rung 1 state unchanged and no position (rollback reached the first rung)`, canon(await rungState(R[0])) === canon(st0) && (await rungPos(R[0], user)).shares === 0n);
  }
  await tx('F owner pause', DEP, AD, 'set-paused', [boolCV(true)], { ok: true });
  await failing('F paused: dispatch-sbtc-rungs-stx -> u4104', U.u15, 'dispatch-sbtc-rungs-stx', [uintCV(50_000n), uintCV(1_000n), allocCV([[seated.stx[0], 49_000n]])], E(4104));
  await failing('F paused: deposit-sbtc-limit-usdcx -> u4104', U.u16, 'deposit-sbtc-limit-usdcx', [uintCV(50_000n), uintCV(1_000n), uintCV(1n), noneCV()], E(4104));
  await tx('F owner unpause', DEP, AD, 'set-paused', [boolCV(false)], { ok: true });

  setGroup('G live dispatcher vs relay through a proxy');
  for (const k of ['stx', 'usdcx']) {
    const l = L[k], R = seated[k], user = k === 'stx' ? U.u17 : U.u18;
    const allocs = allocCV([[R[0], 30_000n], [R[1], 20_000n]]);
    const u0 = await sbtcBal(user);
    await tx(`G ${k}: LIVE ${l.live.split('.')[1]} ${l.relayFn} via proxy -> u7106`, user, PROXY, l.pBuy, [uintCV(50_000n), allocs], E(7106));
    check(`G ${k}: nothing moved`, (await sbtcBal(user)) === u0);
    const r = await tx(`G ${k}: relay ${l.relayFn} via the same proxy -> ok`, user, PROXY, l.pRelay, [uintCV(50_000n), allocs], (v) => v?.ok?.amount === 50_000n && v?.ok?.rungs === 2n);
    check(`G ${k}: relay via proxy: user sBTC -50000 (tx-sender stays the user), positions credited to the user`, u0 - (await sbtcBal(user)) === 50_000n && (await rungPos(R[0], user)).shares > 0n && (await rungPos(R[1], user)).shares > 0n);
    const ld = allPrints(r.receipt).filter((p) => p.event === 'ladder-dispatched');
    check(`G ${k}: relay print member = user`, ld.length === 1 && ld[0].member === user, show(ld));
    const user2 = k === 'stx' ? U.u19 : U.u20, v0 = await sbtcBal(user2);
    await tx(`G ${k}: LIVE ${l.live.split('.')[1]} called direct by the user -> ok (control)`, user2, l.live, l.relayFn, [uintCV(50_000n), allocs], (v) => v?.ok?.amount === 50_000n);
    check(`G ${k}: direct live call moved 50000`, v0 - (await sbtcBal(user2)) === 50_000n);
  }

  setGroup('H signed txs, Originator mode, sBTC cap');
  const capPc = (who, n) => [Pc.principal(who).willSendLte(n).ft(SBTC, 'sbtc-token')];
  {
    const uS = await M.stx.fresh();
    const lim = uS.mid * 10500n / BPS, who = U.u21;
    const args = [uintCV(100_000n), uintCV(1_000n), uintCV(lim), noneCV()];
    const p0 = await sbtcBal(who), q0 = await sbtcBal(FEE), m0 = await sbtcBal(MKT_S);
    const h1 = await signedCall(who, AD, 'deposit-sbtc-limit-stx', args, capPc(who, 99_999n));
    check('H1 limit stx, cap = amount - 1: post-condition aborts', h1.pcAborted === true, show({ pc: h1.pcAborted, vm: h1.vm }));
    check('H1 nothing moved, nothing pending', (await sbtcBal(who)) === p0 && (await sbtcBal(FEE)) === q0 && (await sbtcBal(MKT_S)) === m0 && (await evalIn(MKT_S, `(get-token-x-pending-deposit '${who})`)) === null);
    const h2 = await signedCall(who, AD, 'deposit-sbtc-limit-stx', args, capPc(who, 100_000n));
    check('H2 limit stx, cap = amount: ok', h2.pcAborted === false && !h2.vm && h2.res?.ok?.deposit === 99_000n, show({ res: h2.res, vm: h2.vm }));
    check('H2 user -100000, fee +1000, market +99000, pending 99000', p0 - (await sbtcBal(who)) === 100_000n && (await sbtcBal(FEE)) - q0 === 1_000n && (await sbtcBal(MKT_S)) - m0 === 99_000n && (await evalIn(MKT_S, `(get-token-x-pending-deposit '${who})`))?.amount === 99_000n);
    const who2 = U.u24;
    const h2d = await signedCall(who2, AD, 'deposit-sbtc-limit-stx', args, capPc(who2, 100_000n), PostConditionMode.Deny);
    note(`H2d limit stx, strict Deny, cap = amount: ${h2d.pcAborted ? 'ABORTS' : 'ok'} ${h2d.vm ? h2d.vm.slice(0, 160) : ''}`);
  }
  {
    const who = U.u22, R = seated.stx;
    const args = [uintCV(60_000n), uintCV(1_000n), allocCV([[R[0], 29_000n], [R[1], 30_000n]])];
    const p0 = await sbtcBal(who), q0 = await sbtcBal(FEE);
    const h3 = await signedCall(who, AD, 'dispatch-sbtc-rungs-stx', args, capPc(who, 59_999n));
    check('H3 rungs stx, cap = amount - 1: post-condition aborts', h3.pcAborted === true, show({ pc: h3.pcAborted, vm: h3.vm }));
    check('H3 nothing moved, no position', (await sbtcBal(who)) === p0 && (await sbtcBal(FEE)) === q0 && (await rungPos(R[0], who)).shares === 0n);
    const h4 = await signedCall(who, AD, 'dispatch-sbtc-rungs-stx', args, capPc(who, 60_000n));
    check('H4 rungs stx, cap = amount: ok', h4.pcAborted === false && !h4.vm && h4.res?.ok?.dispatch?.amount === 59_000n, show({ res: h4.res, vm: h4.vm }));
    check('H4 user -60000, fee +1000, both rung positions credited', p0 - (await sbtcBal(who)) === 60_000n && (await sbtcBal(FEE)) - q0 === 1_000n && (await rungPos(R[0], who)).shares > 0n && (await rungPos(R[1], who)).shares > 0n);
  }
  {
    const who = U.u23, R = seated.usdcx;
    const args = [uintCV(40_000n), uintCV(500n), allocCV([[R[0], 39_500n]])];
    const p0 = await sbtcBal(who);
    const h5 = await signedCall(who, AD, 'dispatch-sbtc-rungs-usdcx', args, capPc(who, 39_999n));
    check('H5 rungs usdcx, cap = amount - 1: aborts, nothing moved', h5.pcAborted === true && (await sbtcBal(who)) === p0, show({ pc: h5.pcAborted, vm: h5.vm }));
    const h6 = await signedCall(who, AD, 'dispatch-sbtc-rungs-usdcx', args, capPc(who, 40_000n));
    check('H6 rungs usdcx, cap = amount: ok, user -40000', h6.pcAborted === false && !h6.vm && p0 - (await sbtcBal(who)) === 40_000n, show({ res: h6.res, vm: h6.vm }));
    const uU = await freshUsdcx();
    const largs = [uintCV(30_000n), uintCV(500n), uintCV(uU.mid * 10500n / BPS), noneCV()];
    const q0 = await sbtcBal(who);
    const h7 = await signedCall(who, AD, 'deposit-sbtc-limit-usdcx', largs, capPc(who, 29_999n));
    check('H7 limit usdcx, cap = amount - 1: aborts, nothing moved', h7.pcAborted === true && (await sbtcBal(who)) === q0, show({ pc: h7.pcAborted, vm: h7.vm }));
    const h8 = await signedCall(who, AD, 'deposit-sbtc-limit-usdcx', largs, capPc(who, 30_000n));
    check('H8 limit usdcx, cap = amount: ok, user -30000', h8.pcAborted === false && !h8.vm && q0 - (await sbtcBal(who)) === 30_000n, show({ res: h8.res, vm: h8.vm }));
  }

  setGroup('I direct-rest branch (empties each book\'s bid side on the fork; runs last)');
  for (const [k, who] of [['stx', U.u4], ['usdcx', U.u8]]) {
    const m = M[k];
    // U.u4 / U.u8 have a pending deposit from B9 / C9: cancel it so the next one is a fresh order
    await tx(`I ${k}: ${who.slice(0, 6)} cancels its B9/C9 pending deposit`, who, m.mkt, 'cancel-token-x-deposit', [P_(SBTC), stringAsciiCV('sbtc-token')], OK);
    let ys = await evalIn(m.mkt, '(get-token-y-depositors (get-current-cycle))');
    for (const y of ys.filter(isStd)) await tx(`I ${k}: EOA bidder ${y.slice(0, 8)} cancels its bid`, y, m.mkt, 'cancel-token-y-deposit', [P_(m.ty), stringAsciiCV(m.ay)], OK);
    ys = await evalIn(m.mkt, '(get-token-y-depositors (get-current-cycle))');
    // contract bidders: no taker sweep (market swap refuses a partial fill,
    // u1017), so each one is pulled by the principal that controls it
    for (const y of ys.filter((x) => !isStd(x))) {
      const name = y.split('.')[1];
      if (name.startsWith('yguazu-')) {
        const own = await evalIn(y, '(get-owner)'), kp = await evalIn(y, '(get-keeper)');
        const op = isStd(own) ? own : kp;
        await tx(`I ${k}: ${name} owner ${op.slice(0, 8)} cancel-buy-back`, op, y, 'cancel-buy-back', [], OK);
      } else if ((await evalIn(L[k].lad, `(get-registered '${y})`)) !== null) {
        const members = await rungMembers(L[k].lad, y);
        note(`I ${k}: rung ${name} members on the ladder log: ${members.length} (get-state members ${(await rungState(y)).members})`);
        const u = await m.fresh();
        for (const mem of members) {
          if ((await rungPos(y, mem)).shares === 0n) continue;
          await tx(`I ${k}: rung ${name} member ${mem.slice(0, 8)} withdraws in full`, mem, y, 'withdraw', [uintCV(10n ** 20n), someCV(buf(u.hex))], OK);
        }
      } else note(`I ${k}: no cancel path known for contract bidder ${y}`);
    }
    ys = await evalIn(m.mkt, '(get-token-y-depositors (get-current-cycle))');
    if (!check(`I ${k}: bid side empty on the fork (get-token-y-depositors current cycle)`, ys.length === 0, show(ys))) continue;
    const u = await m.fresh();
    const lim = u.mid * 10500n / BPS;
    const cyc = await evalIn(m.mkt, '(get-current-cycle)');
    const u0 = await sbtcBal(who), f0 = await sbtcBal(FEE), k0 = await sbtcBal(m.mkt);
    const r = await tx(`I ${k}: ${m.fn} 70000 fee 700 limit mid + 5% spread 25`, who, AD, m.fn, [uintCV(70_000n), uintCV(700n), uintCV(lim), someCV(uintCV(25n))], (v) => canon(v?.ok) === canon({ 'fee-sats': 700n, deposit: 69_300n }));
    check(`I ${k}: user -70000, fee +700, market +69300`, u0 - (await sbtcBal(who)) === 70_000n && (await sbtcBal(FEE)) - f0 === 700n && (await sbtcBal(m.mkt)) - k0 === 69_300n);
    check(`I ${k}: rests at once: no pending, get-token-x-deposit(cycle ${cyc}) == 69300`, (await evalIn(m.mkt, `(get-token-x-pending-deposit '${who})`)) === null && (await evalIn(m.mkt, `(get-token-x-deposit u${cyc} '${who})`)) === 69_300n);
    const ord = await evalIn(m.mkt, `(get-token-x-order '${who})`);
    check(`I ${k}: order limit ${lim}, spread 25`, ord.limit === lim && ord['spread-bps'] === 25n, show(ord));
    const ps = allPrints(r.receipt);
    const dx = ps.filter((p) => p.event === 'deposit-x'), pend = ps.filter((p) => p.event === 'pending-deposit-x');
    check(`I ${k}: deposit-x print {depositor user, delta 69300, limit, spread 25}, no pending-deposit-x`, dx.length === 1 && dx[0].depositor === who && dx[0].delta === 69_300n && dx[0].limit === lim && dx[0]['spread-bps'] === 25n && pend.length === 0, show(dx));
    checkBtcIn(`I ${k}`, r.receipt, who, m.mkt, 70_000n, 700n);
  }
  check('adapter never holds sBTC (end)', (await sbtcBal(AD)) === 0n && (await sbtcBal(RELAY_S)) === 0n && (await sbtcBal(RELAY_U)) === 0n);
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(`EXC ${e.message}`); }
}
summary();
