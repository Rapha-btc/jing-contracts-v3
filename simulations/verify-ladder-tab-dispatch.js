// Fork only. Run: npx tsx simulations/verify-ladder-tab-dispatch.js
// Proof for the jingswap.com /swap Ladder tab on a mainnet fork of the LIVE
// set (nothing deployed, nothing patched): jing-ladder-dispatch, jing-ladder-v1,
// markets-sbtc-stx-jing-v6-3, jing-core-v6 and the 20 seated rungs
// jing-buy-stx-spread-0..90 / jing-sell-stx-spread-0..90.
//
// Every ladder tx is built by the page's own pure module,
// jingswap-frontend/src/lib/ladder.ts (imported, not copied): the split
// (presets + per-rung minimum + redistribution), the dispatch function name,
// its args and the exact post-condition. Txs are signed in allow mode with
// that post-condition, so a wrong total aborts. The keeper's settles are
// built by faktory-dao backend/server/utils/jing-settle-args.ts (imported).
//
//  0. live state: 10 seats per side in the market (get-seated-x / -y) are
//     the page's rung ids, in order; market minimums; rungs empty
//  1. Sell sBTC (deposit-buy), one user per preset: Near the mid (small total:
//     the far rungs fall under the market minimum, are dropped and their
//     share redistributed), Even, Wide. Opposite side empty: every leg rests
//     live at once ("Live on the book"). Per rung: the member's position
//     value = the leg, the market custody of the rung grew by the leg, the
//     user paid exactly the total. A tampered post-condition (total - 1) aborts.
//  2. Sell STX (deposit-sell), same three presets. The buy side now rests, so
//     each rung push goes PENDING (pending-deposit-y per rung). The keeper
//     settles each rung (settle-token-y-deposit who = the rung): placed, or
//     refunded to the rung when it would cross (sell-0 at the mid vs buy-0
//     at the mid). Each round settles before the next deposit.
//  3. takers: an STX taker and an sBTC taker swap through the book, so the
//     rungs earn proceeds
//  4. Claim all (claim-buy / claim-sell over every rung holding a position):
//     the user's wallet moves by exactly the claim's receipt, proceeds > 0 on
//     both sides, a second claim pays 0
//  5. Withdraw all (withdraw-buy / withdraw-sell, full exit, with the page's
//     Lazer update): every position gone, the user gets back exactly the
//     resting value read just before
//  6. Withdraw all while every rung is PENDING: without an update the rung
//     cannot settle its escrow (u7012); with the page's update it settles
//     and exits, the user gets the whole deposit back
import { homedir } from 'node:os';
import {
  uintCV, boolCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV, noneCV,
  deserializeCV, cvToString, hexToCV, cvToHex, getAddressFromPrivateKey,
  makeUnsignedContractCall, makeUnsignedSTXTokenTransfer, PostConditionMode,
} from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps, callContract, getNonce, setSender } from 'stxer';
import { fetchLazerUpdateAny } from './_lazer.js';

const FE = process.env.JINGSWAP_FE_DIR || `${homedir()}/projects/jingswap/jingswap-frontend`;
const BE = process.env.FAKTORY_DIR || `${homedir()}/projects/faktory-dao`;
const L0 = await import(`${FE}/src/lib/ladder.ts`);
const L = L0.splitLadder ? L0 : L0.default;
const K0 = await import(`${BE}/backend/server/utils/jing-settle-args.ts`);
const K = K0.settleArgs ? K0 : K0.default;

const NODE = 'http://77.42.3.101/stacks-api';
const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const MARKET = `${DEP}.markets-sbtc-stx-jing-v6-3`;
const CORE = `${DEP}.jing-core-v6`;
const LADDER = `${DEP}.jing-ladder-v1`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALE = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR' };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const PR = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const PX = 10n ** 10n;
const PRESETS = ['near', 'even', 'wide'];
// per side: the user of each preset and its total (sats / uSTX). Near is
// small on purpose: its far rungs fall under the market minimum.
const PLAN = {
  buy: { users: [mk(741), mk(742), mk(743)], totals: [12_000n, 60_000n, 40_000n] },
  sell: { users: [mk(744), mk(745), mk(746)], totals: [12_000_000n, 60_000_000n, 40_000_000n] },
};
const TAKER_Y = mk(747), TAKER_X = mk(748);

let sid, checks = 0, passed = 0;
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
function check(label, ok, detail = '') {
  checks++; if (ok) passed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${checks}. ${label}${detail ? `: ${String(detail).slice(0, 700)}` : ''}`);
  if (!ok) throw new Error(`STOP at check ${checks} (${label}): https://stxer.xyz/simulations/mainnet/${sid}`);
}
async function retry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const m = String(e?.message ?? e);
      if (i < 6 && /ECONNRESET|fetch failed|socket hang|timed? ?out|\b(502|503|504|429)\b|ETIMEDOUT|EAI_AGAIN|UND_ERR/i.test(m)) { await new Promise((r) => setTimeout(r, 5000 * (i + 1))); continue; }
      throw e;
    }
  }
}
async function evalMany(items) {
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ TenureExtend: { cause: 'Extended' } }, ...items.map(([cid, code]) => ({ Eval: [DEP, '', cid, code] }))] }));
  return items.map(([cid, code], i) => {
    const r = out.steps[i + 1];
    if (!r?.Eval || !('Ok' in r.Eval)) throw new Error(`eval failed in ${cid}: ${JSON.stringify(r).slice(0, 300)} :: ${code.slice(0, 200)}`);
    return plain(deserializeCV(r.Eval.Ok));
  });
}
// CVs and PCs built with the front end's own @stacks/transactions copy:
// round-trip CVs through hex so this file's serializer gets local objects.
const local = (cvs) => cvs.map((cv) => hexToCV(cvToHex(cv)));
const events = (receipt) => (receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e).filter((e) => e.committed !== false && e.contract_event);
const printsFrom = (receipt, cid) => events(receipt).filter((e) => e.contract_event.contract_identifier === cid).map((e) => plain(deserializeCV(e.contract_event.raw_value)));

/** Sign-and-run one call the way the page does: its post-conditions, allow mode. */
async function sendCall(sender, call, pcs = call.postConditions) {
  await retry(() => submitSimulationSteps(sid, { steps: [{ TenureExtend: { cause: 'Extended' } }] }));
  const tx = await makeUnsignedContractCall({
    contractAddress: call.contractAddress, contractName: call.contractName, functionName: call.functionName,
    functionArgs: local(call.functionArgs), postConditions: pcs, postConditionMode: PostConditionMode.Allow,
    nonce: Number(await retry(() => getNonce(sid, sender))), fee: 0, network: 'mainnet', publicKey: '',
  });
  setSender(tx, sender);
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: tx.serialize() }] }));
  const t = out.steps[0]?.Transaction;
  if (!t || 'Err' in t) throw new Error(`ENGINE ${call.functionName}: ${JSON.stringify(t).slice(0, 300)}`);
  const r = t.Ok;
  return { res: plain(deserializeCV(r.result)), receipt: r, vm: r.vm_error, pcAborted: !!r.post_condition_aborted };
}
async function send(sender, cid, fn, args) {
  await retry(() => submitSimulationSteps(sid, { steps: [{ TenureExtend: { cause: 'Extended' } }] }));
  const r = await retry(() => callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 }));
  if (r.vmError || r.pcAborted) throw new Error(`ENGINE ${cid}.${fn}: ${JSON.stringify({ vm: r.vmError, pc: r.pcAborted })}`);
  return { res: plain(deserializeCV(r.resultHex)), receipt: r.receipt };
}

const bal = (who) => [[MARKET, `(unwrap-panic (contract-call? '${SBTC} get-balance '${who}))`], [MARKET, `(stx-get-balance '${who})`]];
async function balances(who) { const [sbtc, stx] = await evalMany(bal(who)); return { sbtc, stx }; }
const cycle = async () => (await evalMany([[MARKET, '(get-current-cycle)']]))[0];
/** what the market holds for a rung: live + parked + pending, and the rung's state */
async function rungBook(side) {
  const ids = L.ladderRungIds(side), s = L.marketSideOf(side), c = await cycle();
  const reads = await evalMany(ids.flatMap((r) => [
    [MARKET, `(get-token-${s}-deposit u${c} '${r})`],
    [MARKET, `(get-token-${s}-parked '${r})`],
    [MARKET, `(get-token-${s}-pending-deposit '${r})`],
    [r, '(get-state)'],
  ]));
  return ids.map((id, i) => {
    const [live, parked, pend, st] = reads.slice(4 * i, 4 * i + 4);
    return { id, live, parked, pending: pend?.amount ?? 0n, state: st, held: side === 'buy' ? st['held-sats'] : st['held-ustx'] };
  });
}
async function positions(side, who) {
  return evalMany(L.ladderRungIds(side).map((r) => [r, `(get-position '${who})`]));
}
const has = (p) => p.shares > 0n || p.sbtc > 0n || p.stx > 0n;
const heldIdx = (pos) => pos.map((p, i) => has(p) ? L.LADDER_BPS[i] : null).filter((b) => b != null);
let LZ;
async function freshUpdate() { LZ = await fetchLazerUpdateAny(); return LZ.hex; }

async function settleRound(side, label) {
  const s = L.marketSideOf(side), hex = await freshUpdate();
  const book = await rungBook(side);
  const out = { placed: [], refunded: [] };
  for (const r of book.filter((x) => x.pending > 0n)) {
    const args = local(K.settleArgs({ who: r.id, side: s, kind: 'deposit' }, hex));
    const t = await send(DEP, MARKET, K.settleFnName(s, 'deposit'), args);
    const ev = printsFrom(t.receipt, CORE).map((p) => p.event);
    const bps = r.id.split('spread-')[1];
    if (ev.includes(`deposit-${s}`)) out.placed.push(bps);
    else if (ev.includes(`pending-refund-${s}`)) out.refunded.push(bps);
    check(`${label}: keeper settle-token-${s}-deposit(${r.id.split('.')[1]}) -> placed or refunded`, t.res?.ok != null && (ev.includes(`deposit-${s}`) || ev.includes(`pending-refund-${s}`)), `${show(t.res)} ${ev.join(',')}`);
  }
  const after = await rungBook(side);
  check(`${label}: no rung pending after the keeper`, after.every((x) => x.pending === 0n), show(after.map((x) => x.pending)));
  console.log(`  ${label}: placed bps [${out.placed}], refunded to the rung (crossing) bps [${out.refunded}]`);
  return out;
}

async function depositRound(side, k) {
  const preset = PRESETS[k], user = PLAN[side].users[k], total = PLAN[side].totals[k];
  const label = `${side === 'buy' ? 'Sell sBTC' : 'Sell STX'} / ${preset}`;
  console.log(`\n=== ${label}: ${total} ===`);
  const [mins] = await evalMany([[MARKET, '(get-min-deposits)']]);
  const marketMin = side === 'buy' ? mins['min-token-x'] : mins['min-token-y'];
  const before = await rungBook(side);
  const rmins = before.map((r) => L.rungMinimum(side, marketMin, r.state.resting, r.held));
  const split = L.splitLadder(total, preset, rmins);
  const kept = split.amounts.map((a, i) => (a > 0n ? i : null)).filter((i) => i != null);
  check(`${label}: split adds up to the total, every kept share >= its rung minimum`, split.total === total && split.amounts.reduce((a, b) => a + b, 0n) === total && kept.every((i) => split.amounts[i] >= rmins[i]), show({ amounts: split.amounts, mins: rmins, dropped: split.dropped }));
  if (preset === 'near' && k === 0) check(`${label}: far rungs under the market minimum are dropped and redistributed`, split.dropped.length > 0 && split.dropped.every((i) => i >= 5), show(split.dropped.map((i) => L.LADDER_BPS[i])));
  if (preset === 'near') check(`${label}: weighted toward the tight rungs`, kept.every((i, j) => j === 0 || split.amounts[kept[j - 1]] >= split.amounts[i]), show(split.amounts));
  if (preset === 'wide') check(`${label}: weighted toward the far rungs`, kept.every((i, j) => j === 0 || split.amounts[kept[j - 1]] <= split.amounts[i]), show(split.amounts));
  if (preset === 'even') check(`${label}: equal split (dust to the tightest)`, kept.length === 10 && kept.slice(1).every((i) => split.amounts[i] === total / 10n), show(split.amounts));

  const call = L.ladderDepositCall(side, user, split.amounts);
  check(`${label}: page builds ${call.contractName}.${call.functionName} (total, ${kept.length} legs), PC user sends exactly ${total}`,
    call.contractName === 'jing-ladder-dispatch' && call.functionName === (side === 'buy' ? 'deposit-buy' : 'deposit-sell') && call.postConditions.length === 1 && BigInt(call.postConditions[0].amount) === total && call.postConditions[0].condition === 'eq',
    `${cvToString(local(call.functionArgs)[0])} ${cvToString(local(call.functionArgs)[1]).slice(0, 300)}`);

  if (k === 0) {
    const bad = { ...call.postConditions[0], amount: (total - 1n).toString() };
    const t = await sendCall(user, call, [bad]);
    check(`${label}: a post-condition of total - 1 aborts (nothing moves)`, t.pcAborted, show({ res: t.res, pc: t.pcAborted }));
  }
  const w0 = await balances(user);
  const t = await sendCall(user, call);
  check(`${label}: ONE dispatch tx ok, ${kept.length} rungs`, !t.pcAborted && !t.vm && t.res?.ok?.rungs === BigInt(kept.length) && t.res.ok.amount === total, show(t.res).slice(0, 400));
  const w1 = await balances(user);
  const paid = side === 'buy' ? w0.sbtc - w1.sbtc : w0.stx - w1.stx;
  check(`${label}: user paid exactly the total`, paid === total, `${paid}`);

  const ladderPrints = printsFrom(t.receipt, LADDER).filter((p) => p.event === 'rung-deposit');
  const core = printsFrom(t.receipt, CORE);
  const s = L.marketSideOf(side);
  check(`${label}: a rung-deposit print per leg, member = user, amount = leg`, ladderPrints.length === kept.length && ladderPrints.every((p, j) => p.member === user && p.amount === split.amounts[kept[j]] && p.price === BigInt(L.LADDER_BPS[kept[j]])), show(ladderPrints.map((p) => [p.price, p.amount, p.pushed, p.held])));
  const live = core.filter((p) => p.event === `deposit-${s}`).length, pend = core.filter((p) => p.event === `pending-deposit-${s}`).length;
  console.log(`  pushes: ${live} live, ${pend} pending, ${ladderPrints.filter((p) => !p.pushed).length} held in the rung`);

  const after = await rungBook(side);
  const pos = await positions(side, user);
  for (const i of kept) {
    const a = split.amounts[i], b = before[i], r = after[i];
    const grew = (r.live + r.parked + r.pending + r.held) - (b.live + b.parked + b.pending + b.held);
    const val = side === 'buy' ? pos[i].sbtc : pos[i].stx;
    check(`${label}: rung ${L.LADDER_BPS[i]} bps holds the leg ${a} (market + held), position worth ${val}`, grew >= a && pos[i].shares > 0n && val <= a && a - val <= 1n, show({ grew, live: r.live, pending: r.pending, held: r.held, pos: pos[i] }));
  }
  for (const i of split.dropped) check(`${label}: dropped rung ${L.LADDER_BPS[i]} bps untouched, no position`, pos[i].shares === 0n && after[i].live === before[i].live, show(pos[i]));
  return { t, live, pend };
}

async function withdrawSide(side) {
  {
    for (let k = 0; k < 3; k++) {
      const user = PLAN[side].users[k], label = `${side === 'buy' ? 'Sell sBTC' : 'Sell STX'} / ${PRESETS[k]}`;
      const pos = await positions(side, user);
      const idx = heldIdx(pos);
      if (!idx.length) { console.log(`  ${label}: nothing left to withdraw`); continue; }
      const want = pos.reduce((a, p) => a + (side === 'buy' ? p.sbtc : p.stx), 0n);
      const call = L.ladderWithdrawAllCall(side, idx, await freshUpdate());
      const w0 = await balances(user);
      const t = await sendCall(user, call);
      const w1 = await balances(user);
      const got = side === 'buy' ? w1.sbtc - w0.sbtc : w1.stx - w0.stx;
      check(`${label}: Withdraw all = ${call.functionName} over ${idx.length} rungs ok, wallet = receipt, input back = resting value ${want}`,
        t.res?.ok?.withdrawn === BigInt(idx.length) && w1.stx - w0.stx === t.res.ok.stx && w1.sbtc - w0.sbtc === t.res.ok.sbtc && got >= want && got - want <= BigInt(idx.length),
        `got ${got} ${show(t.res?.ok ?? t.res).slice(0, 300)}`);
      const left = await positions(side, user);
      check(`${label}: no position left on any rung`, left.every((p) => !has(p)), show(left.filter(has)));
    }
  }
}

async function main() {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(MARKET, '(get-current-cycle)');
  sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);

  console.log('\n=== live state ===');
  const [sx, sy, mins] = await evalMany([[MARKET, '(get-seated-x)'], [MARKET, '(get-seated-y)'], [MARKET, '(get-min-deposits)']]);
  check('market seated-x = the page\'s 10 Sell sBTC rungs (jing-buy-stx-spread-0..90), in order', show(sx) === show(L.ladderRungIds('buy')), show(sx));
  check('market seated-y = the page\'s 10 Sell STX rungs (jing-sell-stx-spread-0..90), in order', show(sy) === show(L.ladderRungIds('sell')), show(sy));
  check('market minimums 1000 sats / 1 STX', mins['min-token-x'] === 1000n && mins['min-token-y'] === 1_000_000n, show(mins));
  const reg = await evalMany([...L.ladderRungIds('buy').map((r) => [LADDER, `(is-band-x '${r})`]), ...L.ladderRungIds('sell').map((r) => [LADDER, `(is-band-y '${r})`])]);
  check('ladder: all 20 rungs current on their band', reg.every((x) => x === true), show(reg));

  console.log('\n=== funding ===');
  for (const u of [...PLAN.buy.users, TAKER_X]) {
    const t = await send(WHALE.x, SBTC, 'transfer', [uintCV(u === TAKER_X ? 30_000n : 100_000n), PR(WHALE.x), PR(u), noneCV()]);
    check(`fund ${u.slice(0, 8)} with sBTC`, t.res?.ok === true, show(t.res));
  }
  for (const u of [...PLAN.sell.users, TAKER_Y]) {
    const raw = await makeUnsignedSTXTokenTransfer({ recipient: u, amount: 150_000_000n, nonce: Number(await retry(() => getNonce(sid, WHALE.y))), network: 'mainnet', publicKey: '', fee: 0 });
    setSender(raw, WHALE.y);
    const o = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] }));
    check(`fund ${u.slice(0, 8)} with 150 STX`, cvToString(deserializeCV(o.steps[0].Transaction.Ok.result)) === '(ok true)');
  }

  // 1. Sell sBTC: the bid side is empty, every push rests at once
  for (let k = 0; k < 3; k++) {
    const r = await depositRound('buy', k);
    check(`Sell sBTC / ${PRESETS[k]}: every leg live on the book at once (no pending)`, r.pend === 0 && r.live > 0, `${r.live} live`);
  }
  // 2. Sell STX: the ask side rests, each push goes pending for the keeper
  for (let k = 0; k < 3; k++) {
    const r = await depositRound('sell', k);
    check(`Sell STX / ${PRESETS[k]}: rung pushes go PENDING (the ask side rests)`, r.pend > 0, `${r.pend} pending, ${r.live} live`);
    await settleRound('sell', `Sell STX / ${PRESETS[k]}`);
  }

  // 3. takers, so the rungs earn proceeds
  console.log('\n=== takers ===');
  const hex = await freshUpdate();
  const MID = (LZ.px * 10n ** 8n) / LZ.py; // uSTX per sat x 1e10 (the market unit)
  const upd = bufferCV(Buffer.from(hex.replace(/^0x/, ''), 'hex'));
  const T = [contractPrincipalCV(...SBTC.split('.')), stringAsciiCV('sbtc-token'), contractPrincipalCV(...WSTX.split('.')), stringAsciiCV('wstx')];
  const ty = await send(TAKER_Y, MARKET, 'swap', [uintCV(30_000_000n), uintCV(MID * 10_100n / 10_000n), upd, ...T, boolCV(false)]);
  check('STX taker swaps 30 STX through the Sell sBTC rungs', ty.res?.ok != null, show(ty.res));
  const tx = await send(TAKER_X, MARKET, 'swap', [uintCV(15_000n), uintCV(MID * 9_900n / 10_000n), upd, ...T, boolCV(true)]);
  check('sBTC taker swaps 15,000 sats through the Sell STX rungs', tx.res?.ok != null, show(tx.res));

  // 4. Claim all
  const proceeds = { buy: 0n, sell: 0n };
  for (const side of ['buy', 'sell']) {
    for (let k = 0; k < 3; k++) {
      const user = PLAN[side].users[k], label = `${side === 'buy' ? 'Sell sBTC' : 'Sell STX'} / ${PRESETS[k]}`;
      const idx = heldIdx(await positions(side, user));
      const call = L.ladderClaimAllCall(side, idx);
      const w0 = await balances(user);
      const t = await sendCall(user, call);
      const w1 = await balances(user);
      check(`${label}: Claim all = ${call.functionName} over ${idx.length} rungs, wallet moves by exactly the receipt`,
        t.res?.ok?.claimed === BigInt(idx.length) && w1.stx - w0.stx === t.res.ok.stx && w1.sbtc - w0.sbtc === t.res.ok.sbtc, show(t.res?.ok ?? t.res).slice(0, 300));
      proceeds[side] += side === 'buy' ? t.res.ok.stx : t.res.ok.sbtc;
      const idx2 = heldIdx(await positions(side, user));
      if (idx2.length) {
        const again = await sendCall(user, L.ladderClaimAllCall(side, idx2));
        check(`${label}: a second Claim all pays 0`, again.res?.ok?.stx === 0n && again.res.ok.sbtc === 0n, show(again.res?.ok ?? again.res).slice(0, 200));
      }
    }
  }
  check('Claim all paid proceeds on both sides (STX to Sell sBTC makers, sBTC to Sell STX makers)', proceeds.buy > 0n && proceeds.sell > 0n, show(proceeds));

  // 5. Withdraw all: the Sell STX side first, so 6. finds its rungs empty
  // while the Sell sBTC side still rests (a new push then goes pending)
  await withdrawSide('sell');

  // 6. Withdraw all with every rung pending
  console.log('\n=== Withdraw all while pending ===');
  const user = PLAN.sell.users[1];
  const [mm] = await evalMany([[MARKET, '(get-min-deposits)']]);
  const book = await rungBook('sell');
  const split = L.splitLadder(10_000_000n, 'even', book.map((r) => L.rungMinimum('sell', mm['min-token-y'], r.state.resting, r.held)));
  const dep = await sendCall(user, L.ladderDepositCall('sell', user, split.amounts));
  const pendNow = (await rungBook('sell')).filter((r) => r.pending > 0n).length;
  check('Sell STX / even 10 STX again: ok, rungs pending', dep.res?.ok != null && pendNow > 0, `${pendNow} pending`);
  const idx = heldIdx(await positions('sell', user));
  const noUpd = await sendCall(user, L.ladderWithdrawAllCall('sell', idx, null));
  check('Withdraw all with no price update refuses (u7012: the rung must settle its escrow first)', noUpd.res?.err === 7012n, show(noUpd.res));
  const w0 = await balances(user);
  const ok = await sendCall(user, L.ladderWithdrawAllCall('sell', idx, await freshUpdate()));
  const w1 = await balances(user);
  check('Withdraw all with the page\'s Lazer update: escrow settled, full deposit back', ok.res?.ok?.withdrawn === BigInt(idx.length) && w1.stx - w0.stx === 10_000_000n, `${w1.stx - w0.stx} ${show(ok.res?.ok ?? ok.res).slice(0, 300)}`);
  const left = await positions('sell', user);
  check('no position left', left.every((p) => !has(p)), show(left.filter(has)));


  await withdrawSide('buy');

  const states = await evalMany([...L.ladderRungIds('buy'), ...L.ladderRungIds('sell')].map((r) => [r, '(get-state)']));
  check('every rung has 0 members after everyone exits', states.every((s) => s.members === 0n), show(states.map((s) => s.members)));

  console.log(`\n${passed}/${checks} checks green`);
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
}
main().catch((e) => { console.error(e.message ?? e); console.log(`${passed}/${checks} checks green`); process.exit(1); });
