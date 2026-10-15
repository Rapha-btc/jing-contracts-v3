// Fork only. Run: npx tsx simulations/verify-ladder-tab-dispatch.js
// Proof for the jingswap.com /swap Ladder tab on a mainnet fork of the LIVE
// set (nothing deployed, nothing patched): jing-ladder-dispatch, jing-ladder-v1,
// markets-sbtc-stx-jing-v6-3, jing-core-v6 and the 20 seated rungs
// jing-buy-stx-spread-0..90 (Buy STX) / jing-sell-stx-spread-0..90 (Sell STX).
//
// Every ladder tx is built by the page's own pure module,
// jingswap-frontend/src/lib/ladder.ts (imported, not copied): the split, the
// dispatch call, AND its post-conditions + mode. Never allow mode:
//   originator (SIP-040, Leather / Xverse): only the user's transfers are
//     checked; deposit = user sends exactly the total, withdraw / claim = no
//     condition (the user can send nothing).
//   deny (any other wallet): plus a willSendLte bound on every rung (input
//     and payout asset) and on the market, from balances read just before
//     signing (RungFunds); any unlisted transfer aborts.
// The txs are serialized with that mode and those conditions and run by the
// stxer node, which ENFORCES them: the tamper checks below abort with
// post_condition_aborted in both modes.
//
//  0. live state: seated rungs = the page's rung ids, minimums
//  1. Buy STX (deposit-buy) x 3 presets, ONE-STEP (bid side empty, every leg
//     rests at once). near = originator, even / wide = deny. Tampers: user
//     total - 1 aborts (both modes); deny set minus one rung's bound aborts.
//  2. Sell STX (deposit-sell) x 3 presets, PENDING (asks rest): each push
//     goes pending. Then a second deny deposit while the rungs' escrows are
//     still pending: the market refuses the push (already pending), the leg
//     waits in the rung, the deny set holds. Keeper settles.
//  3. Buy STX x 3 presets again, PENDING (bids rest now), keeper settles.
//  4. takers -> proceeds; 5. Claim all (originator / deny; deny minus the
//     payout bounds aborts); 6. Withdraw all Sell STX (deny minus the market
//     bound aborts); 7. Withdraw all while every rung is PENDING (deny);
//  8. Withdraw all Buy STX; 9. Sell STX x 3 presets ONE-STEP (bid side
//     empty now) and withdraw them.
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
const MODE = ['originator', 'deny', 'deny']; // per preset index
const SIDE_LABEL = { buy: 'Buy STX', sell: 'Sell STX' };
const PCM = { originator: PostConditionMode.Originator, deny: PostConditionMode.Deny };

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

/** Sign-and-run one call the way the page does: its post-conditions, its mode. */
async function sendCall(sender, call, pcs = call.postConditions, mode = call.postConditionMode) {
  if (!PCM[mode]) throw new Error(`no post-condition mode for ${mode}`);
  await retry(() => submitSimulationSteps(sid, { steps: [{ TenureExtend: { cause: 'Extended' } }] }));
  const tx = await makeUnsignedContractCall({
    contractAddress: call.contractAddress, contractName: call.contractName, functionName: call.functionName,
    functionArgs: local(call.functionArgs), postConditions: pcs, postConditionMode: PCM[mode],
    nonce: Number(await retry(() => getNonce(sid, sender))), fee: 0, network: 'mainnet', publicKey: '',
  });
  if (tx.postConditionMode !== PCM[mode] || tx.postConditions.values.length !== pcs.length) throw new Error('tx lost its post-conditions');
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


/** RungFunds for the deny set, read on the fork right before signing (the
 *  page reads the same three numbers through its backend). */
async function rungFunds(side, bpsList) {
  const ids = bpsList.map((b) => L.rungId(side, b));
  const reads = await evalMany(ids.flatMap((r) => [...bal(r), [r, '(get-state)']]));
  return bpsList.map((bps, i) => {
    const [sbtc, stx, st] = reads.slice(3 * i, 3 * i + 3);
    return side === 'buy' ? { bps, input: sbtc, payout: stx, resting: st.resting } : { bps, input: stx, payout: sbtc, resting: st.resting };
  });
}
async function pcFor(mode, side, bpsList) {
  return mode === 'originator' ? { mode } : { mode, funds: await rungFunds(side, bpsList) };
}
const usedBps = (amounts) => L.LADDER_BPS.filter((_, i) => amounts[i] > 0n);
const pcSummary = (call) => `${call.postConditionMode}: ${call.postConditions.map((p) => `${p.address.split('.').pop().replace('jing-', '').replace('-stx-spread', '')} ${p.condition} ${p.amount}${p.type === 'ft-postcondition' ? ' sats' : ' ustx'}`).join(', ')}`;
/** the deny set must name the user (eq total), both assets of every leg rung, and the market */
function denyShapeOk(side, call, user, total, bpsList) {
  const pcs = call.postConditions;
  const inFt = side === 'buy';
  const isIn = (p) => (p.type === 'ft-postcondition') === inFt;
  const userPcs = pcs.filter((p) => p.address === user);
  const okUser = total == null ? userPcs.length === 0 : userPcs.length === 1 && userPcs[0].condition === 'eq' && BigInt(userPcs[0].amount) === total && isIn(userPcs[0]);
  const okRungs = bpsList.every((b) => {
    const mine = pcs.filter((p) => p.address === L.rungId(side, b));
    return mine.length === 2 && mine.every((p) => p.condition === 'lte') && mine.some(isIn) && mine.some((p) => !isIn(p));
  });
  const m = pcs.filter((p) => p.address === MARKET);
  return okUser && okRungs && m.length === 1 && m[0].condition === 'lte' && isIn(m[0]) && pcs.length === (total == null ? 0 : 1) + 2 * bpsList.length + 1;
}

async function depositRound(side, k, state, opts = {}) {
  const preset = opts.preset ?? PRESETS[k], user = PLAN[side].users[k], total = opts.total ?? PLAN[side].totals[k];
  const mode = opts.mode ?? MODE[k];
  const label = `${SIDE_LABEL[side]} / ${preset} / ${state} / ${mode}${opts.tag ? ` / ${opts.tag}` : ''}`;
  console.log(`\n=== ${label}: ${total} ===`);
  const [mins] = await evalMany([[MARKET, '(get-min-deposits)']]);
  const marketMin = side === 'buy' ? mins['min-token-x'] : mins['min-token-y'];
  const before = await rungBook(side);
  const rmins = before.map((r) => L.rungMinimum(side, marketMin, r.state.resting, r.held));
  const split = L.splitLadder(total, preset, rmins);
  const kept = split.amounts.map((a, i) => (a > 0n ? i : null)).filter((i) => i != null);
  check(`${label}: split adds up to the total, every kept share >= its rung minimum`, split.total === total && split.amounts.reduce((a, b) => a + b, 0n) === total && kept.every((i) => split.amounts[i] >= rmins[i]), show({ amounts: split.amounts, mins: rmins, dropped: split.dropped }));
  if (preset === 'near' && state === 'one-step' && side === 'buy') check(`${label}: far rungs under the market minimum are dropped and redistributed`, split.dropped.length > 0 && split.dropped.every((i) => i >= 5), show(split.dropped.map((i) => L.LADDER_BPS[i])));
  if (preset === 'near') check(`${label}: weighted toward the tight rungs`, kept.every((i, j) => j === 0 || split.amounts[kept[j - 1]] >= split.amounts[i]), show(split.amounts));
  if (preset === 'wide') check(`${label}: weighted toward the far rungs`, kept.every((i, j) => j === 0 || split.amounts[kept[j - 1]] <= split.amounts[i]), show(split.amounts));

  const bpsList = usedBps(split.amounts);
  const call = L.ladderDepositCall(side, user, split.amounts, await pcFor(mode, side, bpsList));
  const shapeOk = mode === 'originator'
    ? call.postConditions.length === 1 && call.postConditions[0].address === user && call.postConditions[0].condition === 'eq' && BigInt(call.postConditions[0].amount) === total
    : denyShapeOk(side, call, user, total, bpsList);
  check(`${label}: page builds ${call.functionName} (${kept.length} legs), ${mode} set`, call.contractName === 'jing-ladder-dispatch' && call.functionName === (side === 'buy' ? 'deposit-buy' : 'deposit-sell') && call.postConditionMode === mode && shapeOk, pcSummary(call).slice(0, 600));

  if (opts.tamperUser) {
    const pcs = call.postConditions.map((p) => p.address === user ? { ...p, amount: (total - 1n).toString() } : p);
    const t = await sendCall(user, call, pcs);
    check(`${label}: user condition total - 1 aborts (${mode})`, t.pcAborted, show({ res: t.res, pc: t.pcAborted }));
  }
  if (opts.tamperRung) {
    // drop the input-asset bound of the first leg rung: its push to the market is now unlisted
    const id = L.rungId(side, bpsList[0]);
    const inFt = side === 'buy';
    const pcs = call.postConditions.filter((p) => !(p.address === id && (p.type === 'ft-postcondition') === inFt));
    const t = await sendCall(user, call, pcs);
    check(`${label}: deny set without ${id.split('.')[1]}'s input bound aborts (stxer enforces deny on contract principals)`, t.pcAborted, show({ res: t.res, pc: t.pcAborted }));
  }
  const posBefore = await positions(side, user);
  const w0 = await balances(user);
  const t = await sendCall(user, call);
  check(`${label}: ONE dispatch tx ok under its ${mode} post-conditions, ${kept.length} rungs`, !t.pcAborted && !t.vm && t.res?.ok?.rungs === BigInt(kept.length) && t.res.ok.amount === total, show({ pc: t.pcAborted, vm: t.vm, res: t.res }).slice(0, 400));
  const w1 = await balances(user);
  const paid = side === 'buy' ? w0.sbtc - w1.sbtc : w0.stx - w1.stx;
  check(`${label}: user paid exactly the total`, paid === total, `${paid}`);

  const ladderPrints = printsFrom(t.receipt, LADDER).filter((p) => p.event === 'rung-deposit');
  const core = printsFrom(t.receipt, CORE);
  const s = L.marketSideOf(side);
  check(`${label}: a rung-deposit print per leg, member = user, amount = leg`, ladderPrints.length === kept.length && ladderPrints.every((p, j) => p.member === user && p.amount === split.amounts[kept[j]] && p.price === BigInt(L.LADDER_BPS[kept[j]])), show(ladderPrints.map((p) => [p.price, p.amount, p.pushed, p.held])));
  const live = core.filter((p) => p.event === `deposit-${s}`).length, pend = core.filter((p) => p.event === `pending-deposit-${s}`).length;
  const held = ladderPrints.filter((p) => !p.pushed).length;
  console.log(`  pushes: ${live} live, ${pend} pending, ${held} held in the rung`);

  const after = await rungBook(side);
  const pos = await positions(side, user);
  const val = (p) => (side === 'buy' ? p.sbtc : p.stx);
  for (const i of kept) {
    const a = split.amounts[i], b = before[i], r = after[i];
    const grew = (r.live + r.parked + r.pending + r.held) - (b.live + b.parked + b.pending + b.held);
    const added = val(pos[i]) - val(posBefore[i]);
    check(`${label}: rung ${L.LADDER_BPS[i]} bps took the leg ${a} (market + held), position value +${added}`, grew >= a && pos[i].shares > 0n && added <= a && a - added <= 1n, show({ grew, live: r.live, pending: r.pending, held: r.held, pos: pos[i] }));
  }
  for (const i of split.dropped) check(`${label}: dropped rung ${L.LADDER_BPS[i]} bps untouched`, val(pos[i]) === val(posBefore[i]) && after[i].live === before[i].live, show(pos[i]));
  return { t, live, pend, held, kept };
}

async function claimOrWithdraw(kind, side, k, opts = {}) {
  const user = opts.user ?? PLAN[side].users[k], mode = opts.mode ?? MODE[k];
  const label = `${SIDE_LABEL[side]} / ${opts.tag ?? PRESETS[k]} / ${kind} / ${mode}`;
  const pos = await positions(side, user);
  const idx = heldIdx(pos);
  if (!idx.length) { console.log(`  ${label}: nothing held`); return null; }
  const pc = await pcFor(mode, side, idx);
  const call = kind === 'claim' ? L.ladderClaimAllCall(side, idx, pc) : L.ladderWithdrawAllCall(side, idx, opts.noUpdate ? null : await freshUpdate(), pc);
  const shapeOk = mode === 'originator' ? call.postConditions.length === 0 : denyShapeOk(side, call, user, null, idx);
  check(`${label}: page builds ${call.functionName} over ${idx.length} rungs, ${mode} set`, call.postConditionMode === mode && shapeOk, pcSummary(call).slice(0, 600));
  if (opts.tamperDrop) {
    const pcs = call.postConditions.filter(opts.tamperDrop.keep);
    const t = await sendCall(user, call, pcs);
    check(`${label}: deny set without ${opts.tamperDrop.what} aborts`, t.pcAborted, show({ res: t.res, pc: t.pcAborted }));
  }
  const want = pos.reduce((a, p) => a + (side === 'buy' ? p.sbtc : p.stx), 0n);
  const w0 = await balances(user);
  const t = await sendCall(user, call);
  const w1 = await balances(user);
  return { t, w0, w1, idx, want, label, call };
}

async function withdrawSide(side, tamperK = -1) {
  for (let k = 0; k < 3; k++) {
    const opts = k === tamperK ? { tamperDrop: { what: 'the market bound', keep: (p) => p.address !== MARKET } } : {};
    const r = await claimOrWithdraw('withdraw', side, k, opts);
    if (!r) continue;
    const { t, w0, w1, idx, want, label } = r;
    const got = side === 'buy' ? w1.sbtc - w0.sbtc : w1.stx - w0.stx;
    check(`${label}: ok under its post-conditions, wallet = receipt, input back = resting value ${want}`,
      !t.pcAborted && t.res?.ok?.withdrawn === BigInt(idx.length) && w1.stx - w0.stx === t.res.ok.stx && w1.sbtc - w0.sbtc === t.res.ok.sbtc && got >= want && got - want <= BigInt(idx.length),
      `got ${got} ${show({ pc: t.pcAborted, res: t.res?.ok ?? t.res }).slice(0, 300)}`);
    const left = await positions(side, PLAN[side].users[k]);
    check(`${label}: no position left on any rung`, left.every((p) => !has(p)), show(left.filter(has)));
  }
}

async function main() {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(MARKET, '(get-current-cycle)');
  sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);

  console.log('\n=== live state ===');
  const [sx, sy, mins] = await evalMany([[MARKET, '(get-seated-x)'], [MARKET, '(get-seated-y)'], [MARKET, '(get-min-deposits)']]);
  check('market seated-x = the page\'s 10 Buy STX rungs (jing-buy-stx-spread-0..90), in order', show(sx) === show(L.ladderRungIds('buy')), show(sx));
  check('market seated-y = the page\'s 10 Sell STX rungs (jing-sell-stx-spread-0..90), in order', show(sy) === show(L.ladderRungIds('sell')), show(sy));
  check('market minimums 1000 sats / 1 STX', mins['min-token-x'] === 1000n && mins['min-token-y'] === 1_000_000n, show(mins));
  const reg = await evalMany([...L.ladderRungIds('buy').map((r) => [LADDER, `(is-band-x '${r})`]), ...L.ladderRungIds('sell').map((r) => [LADDER, `(is-band-y '${r})`])]);
  check('ladder: all 20 rungs current on their band', reg.every((x) => x === true), show(reg));

  console.log('\n=== funding ===');
  for (const u of [...PLAN.buy.users, TAKER_X]) {
    const t = await send(WHALE.x, SBTC, 'transfer', [uintCV(u === TAKER_X ? 30_000n : 250_000n), PR(WHALE.x), PR(u), noneCV()]);
    check(`fund ${u.slice(0, 8)} with sBTC`, t.res?.ok === true, show(t.res));
  }
  for (const u of [...PLAN.sell.users, TAKER_Y]) {
    const raw = await makeUnsignedSTXTokenTransfer({ recipient: u, amount: u === TAKER_Y ? 150_000_000n : 300_000_000n, nonce: Number(await retry(() => getNonce(sid, WHALE.y))), network: 'mainnet', publicKey: '', fee: 0 });
    setSender(raw, WHALE.y);
    const o = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] }));
    check(`fund ${u.slice(0, 8)} with STX`, cvToString(deserializeCV(o.steps[0].Transaction.Ok.result)) === '(ok true)');
  }

  // 1. Buy STX, one-step: the bid side is empty, every push rests at once
  for (let k = 0; k < 3; k++) {
    const r = await depositRound('buy', k, 'one-step', { tamperUser: k <= 1, tamperRung: k === 1 });
    check(`Buy STX / ${PRESETS[k]} / one-step: every leg live on the book at once (no pending)`, r.pend === 0 && r.live > 0, `${r.live} live`);
  }
  // 2. Sell STX, pending: the ask side rests, each push goes pending
  for (let k = 0; k < 3; k++) {
    const r = await depositRound('sell', k, 'pending', { tamperUser: k === 0, tamperRung: k === 2 });
    check(`Sell STX / ${PRESETS[k]} / pending: rung pushes go PENDING (the ask side rests)`, r.pend > 0, `${r.pend} pending, ${r.live} live`);
    if (k === 1) {
      // the market already holds these rungs' escrows: a second push is refused, the leg waits in the rung
      const r2 = await depositRound('sell', 1, 'escrow-pending', { mode: 'deny', total: 20_000_000n, preset: 'even', tag: 'second deposit' });
      check('Sell STX / escrow-pending: rungs with a pending escrow hold the new leg (no push, no market transfer), deny set holds', r2.held > 0 && r2.pend === 0, `${r2.held} held, ${r2.pend} pending, ${r2.live} live`);
    }
    await settleRound('sell', `Sell STX / ${PRESETS[k]}`);
  }
  // 3. Buy STX, pending: the bids rest now
  for (let k = 0; k < 3; k++) {
    const r = await depositRound('buy', k, 'pending', { tamperUser: k === 0 });
    check(`Buy STX / ${PRESETS[k]} / pending: rung pushes go PENDING (the bid side rests)`, r.pend > 0, `${r.pend} pending, ${r.live} live, ${r.held} held`);
    await settleRound('buy', `Buy STX / ${PRESETS[k]}`);
  }

  // 4. takers, so the rungs earn proceeds
  console.log('\n=== takers ===');
  const hex = await freshUpdate();
  const MID = (LZ.px * 10n ** 8n) / LZ.py;
  const upd = bufferCV(Buffer.from(hex.replace(/^0x/, ''), 'hex'));
  const T = [contractPrincipalCV(...SBTC.split('.')), stringAsciiCV('sbtc-token'), contractPrincipalCV(...WSTX.split('.')), stringAsciiCV('wstx')];
  const ty = await send(TAKER_Y, MARKET, 'swap', [uintCV(30_000_000n), uintCV(MID * 10_100n / 10_000n), upd, ...T, boolCV(false)]);
  check('STX taker swaps 30 STX through the Buy STX rungs', ty.res?.ok != null, show(ty.res));
  const tx = await send(TAKER_X, MARKET, 'swap', [uintCV(15_000n), uintCV(MID * 9_900n / 10_000n), upd, ...T, boolCV(true)]);
  check('sBTC taker swaps 15,000 sats through the Sell STX rungs', tx.res?.ok != null, show(tx.res));

  // 5. Claim all
  const proceeds = { buy: 0n, sell: 0n };
  for (const side of ['buy', 'sell']) {
    for (let k = 0; k < 3; k++) {
      const payoutFt = side === 'sell';
      const opts = k === 1 ? { tamperDrop: { what: 'the rungs\' payout bounds', keep: (p) => (p.type === 'ft-postcondition') !== payoutFt || p.address === MARKET } } : {};
      const r = await claimOrWithdraw('claim', side, k, opts);
      const { t, w0, w1, idx, label } = r;
      check(`${label}: ok under its post-conditions, wallet moves by exactly the receipt`,
        !t.pcAborted && t.res?.ok?.claimed === BigInt(idx.length) && w1.stx - w0.stx === t.res.ok.stx && w1.sbtc - w0.sbtc === t.res.ok.sbtc, show({ pc: t.pcAborted, res: t.res?.ok ?? t.res }).slice(0, 300));
      proceeds[side] += side === 'buy' ? t.res.ok.stx : t.res.ok.sbtc;
      if (k === 1) check(`${label}: proceeds > 0 (so the tamper above really dropped a moving transfer)`, (side === 'buy' ? t.res.ok.stx : t.res.ok.sbtc) > 0n, show(t.res.ok));
      const again = await claimOrWithdraw('claim', side, k, { mode: 'deny', tag: `${PRESETS[k]} again` });
      if (again) check(`${again.label}: a second Claim all pays 0`, !again.t.pcAborted && again.t.res?.ok?.stx === 0n && again.t.res.ok.sbtc === 0n, show(again.t.res?.ok ?? again.t.res).slice(0, 200));
    }
  }
  check('Claim all paid proceeds on both sides', proceeds.buy > 0n && proceeds.sell > 0n, show(proceeds));

  // 6. Withdraw all Sell STX
  await withdrawSide('sell', 1);

  // 7. Withdraw all with every rung pending (deny)
  console.log('\n=== Withdraw all while pending ===');
  const user = PLAN.sell.users[1];
  const dep = await depositRound('sell', 1, 'pending', { mode: 'deny', total: 10_000_000n, preset: 'even', tag: 'for pending exit' });
  const pendNow = (await rungBook('sell')).filter((r) => r.pending > 0n).length;
  check('Sell STX 10 STX again: rungs pending', dep.pend > 0 && pendNow > 0, `${pendNow} pending`);
  const noUpd = await claimOrWithdraw('withdraw', 'sell', 1, { mode: 'deny', noUpdate: true, tag: 'pending, no update' });
  check('Withdraw all with no price update refuses (u7012)', noUpd.t.res?.err === 7012n, show(noUpd.t.res));
  const ok = await claimOrWithdraw('withdraw', 'sell', 1, { mode: 'deny', tag: 'pending, with update', tamperDrop: { what: 'the market bound (escrow settle / refund leg)', keep: (p) => p.address !== MARKET } });
  check('Withdraw all (deny) with the page\'s Lazer update: escrow settled, full deposit back', !ok.t.pcAborted && ok.t.res?.ok?.withdrawn === BigInt(ok.idx.length) && ok.w1.stx - ok.w0.stx === 10_000_000n, `${ok.w1.stx - ok.w0.stx} ${show({ pc: ok.t.pcAborted, res: ok.t.res?.ok ?? ok.t.res }).slice(0, 300)}`);
  const left = await positions('sell', user);
  check('no position left', left.every((p) => !has(p)), show(left.filter(has)));

  // 8. Withdraw all Buy STX
  await withdrawSide('buy', 2);

  // 9. Sell STX one-step: the bid side is empty again
  const [xdeps] = await evalMany([[MARKET, `(get-token-x-depositors (get-current-cycle))`]]);
  console.log(`  x depositors now: ${xdeps.length}`);
  for (let k = 0; k < 3; k++) {
    const r = await depositRound('sell', k, 'one-step', {});
    check(`Sell STX / ${PRESETS[k]} / one-step: every leg live on the book at once (no pending)`, r.pend === 0 && r.live > 0, `${r.live} live, ${r.pend} pending, ${r.held} held`);
  }
  await withdrawSide('sell');

  const states = await evalMany([...L.ladderRungIds('buy'), ...L.ladderRungIds('sell')].map((r) => [r, '(get-state)']));
  check('every rung has 0 members after everyone exits', states.every((s) => s.members === 0n), show(states.map((s) => s.members)));

  console.log(`\n${passed}/${checks} checks green`);
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
}
main().catch((e) => { console.error(e.message ?? e); console.log(`${passed}/${checks} checks green`); process.exit(1); });
