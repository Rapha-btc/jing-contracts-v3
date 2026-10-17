// verify-ladder-1bps-swap.js
// Replace the two 0-bps band rungs (jing-buy-stx-0 / jing-sell-stx-0) with
// 1-bps rungs (jing-buy-stx-1 / jing-sell-stx-1) on a mainnet fork of the LIVE
// set: markets-sbtc-stx-jing-v6-4 + jing-ladder-v1 + jing-ladder-dispatch +
// the 20 live rungs. The new rungs are the ON-CHAIN bytes of jing-*-stx-0
// (fetched from the node, not the repo), deployed under the new names. Their
// code hash is the same, so the ladder canonical needs no change.
//   R  root cause on the live state: jing-buy-stx-0 rests an ask AT the mid; a
//      push of jing-sell-stx-0 (bid AT the mid) is refunded at settle with
//      reason "crossing" (settle-token-y-deposit returns (ok amount), no err)
//   C  owner: initialize before retire -> u6011 (band full); retire-band u0 on
//      both sides, push-pause the old rungs, initialize(u1, true) both new rungs
//   D  users deposit into the 1-bps rungs through jing-ladder-dispatch, keeper
//      settles, both rest at mid -/+ 1 bps next to the old ask at the mid
//   E  takers fill: sBTC taker hits the 1-bps bid; STX taker eats the retired
//      0-bps ask, then the 1-bps ask
//   F  every maker exits: new 1-bps members, old 0-bps members (both sides)
// Run: node simulations/verify-ladder-1bps-swap.js   (no PYTH key needed)
// ROUTE=1 npx tsx simulations/verify-ladder-1bps-swap.js: group C runs exactly
// what faktory-dao POST /api/bot/init-jing-rungs {action:"replace",from:0,to:1}
// broadcasts: state read on the fork, planned by the route's own planner
// (backend/server/utils/jing-rungs-init.ts planRungReplace, imported; set
// FAKTORY_DIR for a worktree), built as the route's txs (fee, deny mode, no
// post-conditions, sequential deployer nonces, both calls in one batch). No
// set-push-paused: the 0-bps rungs stay live for their members. The new
// rungs are used as deployed on mainnet when the fork tip has them.
import { homedir } from 'node:os';
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  noneCV, someCV, boolCV, tupleCV, listCV, deserializeCV, cvToString, getAddressFromPrivateKey,
  makeUnsignedSTXTokenTransfer, makeUnsignedContractDeploy, makeUnsignedContractCall, PostConditionMode,
} from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps, callContract, getNonce, setSender } from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

const NODE = 'http://77.42.3.101/stacks-api';
const ROUTE = process.env.ROUTE === '1';
const P = ROUTE ? await import(`${process.env.FAKTORY_DIR || `${homedir()}/projects/faktory-dao`}/backend/server/utils/jing-rungs-init.ts`) : null;
const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const LADDER = `${DEP}.jing-ladder-v1`;
const DISPATCH = `${DEP}.jing-ladder-dispatch`;
const MARKET = `${DEP}.markets-sbtc-stx-jing-v6-4`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALE = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR' };
const OLD_BUY_MEMBERS = ['SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q', 'SP1RB1V65A1PAAXYT8PVFFFC6T1FN9E8RQX7HMDKC', 'SP1SFGRJ8R660527743WFCPPY1HS64VPGEYGTYYZ2'];
const OLD_SELL_MEMBERS = ['SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q', DEP];
const P_ = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const T = { x: P_(SBTC), y: P_(WSTX) };
const A = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const R = (dir, bps) => `${DEP}.jing-${dir}-stx-${bps}`;
const B0 = R('buy', 0), S0 = R('sell', 0), B1 = R('buy', 1), S1 = R('sell', 1);
const BIG = 10n ** 15n, BPS = 10000n;
const takerX = mk(961), takerY = mk(962);

class Stop extends Error {}
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
let passed = 0, checks = 0, sid;
const groups = {};
let group = '';
function check(label, ok, detail = '') {
  checks++; groups[group] ??= [0, 0]; groups[group][1]++;
  if (ok) { passed++; groups[group][0]++; }
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${checks}. ${label}${detail ? `: ${String(detail).slice(0, 600)}` : ''}`);
  if (!ok) throw new Stop(`STOP at check ${checks} (${label})`);
}
async function retry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const m = String(e?.message ?? e);
      if (i < 8 && /ECONNRESET|fetch failed|socket hang|timed? ?out|\b(502|503|504|520|522|524|429)\b|ETIMEDOUT|EAI_AGAIN/i.test(m)) { await new Promise((r) => setTimeout(r, 5000 * (i + 1))); continue; }
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
async function send(sender, cid, fn, args) {
  await retry(() => submitSimulationSteps(sid, { steps: [{ TenureExtend: { cause: 'Extended' } }] }));
  const r = await retry(() => callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 }));
  if (r.vmError || r.pcAborted) throw new Error(`ENGINE ${cid}.${fn}: ${JSON.stringify({ vm: r.vmError, pc: r.pcAborted }).slice(0, 400)}`);
  return { res: plain(deserializeCV(r.resultHex)), receipt: r.receipt };
}
async function tx(label, sender, cid, fn, args, want) {
  const r = await send(sender, cid, fn, args);
  check(label, typeof want === 'function' ? want(r.res) : show(r.res) === show(want), show(r.res));
  return r;
}
function prints(receipt) {
  return (receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.committed !== false && e.contract_event)
    .map((e) => { try { return plain(deserializeCV(e.contract_event.raw_value)); } catch { return null; } })
    .filter((p) => p && typeof p.event === 'string');
}
async function stxTransfer(from, to, amount) {
  const raw = await makeUnsignedSTXTokenTransfer({ recipient: to, amount, nonce: await retry(() => getNonce(sid, from)), network: 'mainnet', publicKey: '', fee: 0 });
  setSender(raw, from);
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] }));
  const t = out.steps[0]?.Transaction?.Ok;
  check(`fund ${to.slice(0, 8)} with ${amount} uSTX`, t && !t.vm_error && cvToString(deserializeCV(t.result)) === '(ok true)');
}
async function deploy(name, code) {
  const raw = await makeUnsignedContractDeploy({ contractName: name, codeBody: code, clarityVersion: ClarityVersion.Clarity5, nonce: await retry(() => getNonce(sid, DEP)), network: 'mainnet', publicKey: '', fee: 0, postConditionMode: PostConditionMode.Deny });
  setSender(raw, DEP);
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] }));
  const t = out.steps[0]?.Transaction?.Ok;
  check(`deploy ${name} (on-chain jing-*-stx-0 bytes, Clarity 5)`, t && !t.vm_error && cvToString(deserializeCV(t.result)).startsWith('(ok'), JSON.stringify(out.steps[0]).slice(0, 300));
}
const sbtcBal = async (who) => (await evalIn(SBTC, `(get-balance '${who})`)).ok;
const stxBal = async (who) => await evalIn(MARKET, `(stx-get-balance '${who})`);
const cyc = async () => await evalIn(MARKET, '(get-current-cycle)');
const liveX = async (who) => evalIn(MARKET, `(get-token-x-deposit (get-current-cycle) '${who})`);
const liveY = async (who) => evalIn(MARKET, `(get-token-y-deposit (get-current-cycle) '${who})`);
let UPD, MID;
const upd = () => bufferCV(Buffer.from(UPD.hex.replace(/^0x/, ''), 'hex'));
const settleArgs = (who, side) => [P_(who), upd(), side === 'x' ? T.x : T.y, side === 'x' ? A.x : A.y];
const legs = (rung, amount) => listCV([tupleCV({ rung: P_(rung), amount: uintCV(amount) })]);

async function onchainSource(name) {
  const r = await retry(() => fetch(`${NODE}/v2/contracts/source/${DEP}/${name}?proof=0`));
  if (!r.ok) throw new Error(`source ${name}: ${r.status}`);
  return (await r.json()).source;
}

async function main() {
  const srcBuy = await onchainSource('jing-buy-stx-0');
  const srcSell = await onchainSource('jing-sell-stx-0');
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(B0, '(get-state)');
  sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const stamp = await evalIn(MARKET, 'stacks-block-time');
  for (let i = 0; i < 40; i++) {
    const u = await retry(() => fetchLazerUpdateAny()), t = await retry(() => lazerFeedTimes(u.hex));
    if (t.at > Number(stamp)) { UPD = u; break; }
    await new Promise((res) => setTimeout(res, 3000));
  }
  if (!UPD) throw new Error('no Lazer update newer than the fork tip');
  MID = UPD.px * 100000000n / UPD.py;
  console.log(`fork tip time ${stamp}, mid ${MID} (uSTX per sat x 1e10)`);

  // ---------------------------------------------------------------- R ----
  group = 'R root cause (live state)';
  console.log(`\n=== ${group} ===`);
  const c0 = await cyc();
  check('buy-stx-0 rests an ask on the live book', (await liveX(B0)) > 0n, `${await liveX(B0)} sats`);
  const ask0 = await evalIn(MARKET, `(token-x-limit-at '${B0} u${MID})`);
  check('buy-stx-0 ask = the mid exactly (0 bps)', ask0 === MID, `ask ${ask0}`);
  const s0bal = await stxBal(S0);
  check('sell-stx-0 holds STX off the book (refunded on mainnet, reason crossing)', s0bal > 0n && (await liveY(S0)) === 0n, `rung balance ${s0bal} uSTX, live 0`);
  check('a bid at the mid crosses: would-take-as-y(mid, mid) = true', (await evalIn(MARKET, `(would-take-as-y u${MID} u${MID})`)) === true);
  const bid1 = MID * (BPS - 1n) / BPS, ask1 = MID * (BPS + 1n) / BPS;
  check('a bid at mid - 1 bps never crosses: would-take-as-y(mid, bid1) = false', (await evalIn(MARKET, `(would-take-as-y u${MID} u${bid1})`)) === false);
  check('an ask at mid + 1 bps never crosses: would-take-as-x(mid, ask1) = false', (await evalIn(MARKET, `(would-take-as-x u${MID} u${ask1})`)) === false);
  const rdep = 10_000_000n;
  await tx('user deposits 10 STX into sell-stx-0 (direct): accepted, held + pushed as a pending bid', WHALE.y, S0, 'deposit', [uintCV(rdep)], (v) => v.ok?.amount === rdep);
  const pend0 = await evalIn(MARKET, `(get-token-y-pending-deposit '${S0})`);
  check('sell-stx-0 pending bid in the market', pend0 && pend0.amount === s0bal + rdep, show(pend0));
  const rs = await tx('keeper settle-token-y-deposit(sell-stx-0) -> (ok amount) = REFUND', DEP, MARKET, 'settle-token-y-deposit', settleArgs(S0, 'y'), { ok: s0bal + rdep });
  const ref = prints(rs.receipt).find((p) => p.event === 'pending-refund-y');
  check('print pending-refund-y reason "crossing"', ref?.reason === 'crossing', show(ref));
  check('sell-stx-0 still not on the book, STX back in the rung', (await liveY(S0)) === 0n && (await stxBal(S0)) === s0bal + rdep);

  // ---------------------------------------------------------------- C ----
  group = 'C owner swaps 0 -> 1 bps';
  console.log(`\n=== ${group} ===`);
  const onChain = async (cid) => { try { return typeof (await evalIn(cid, '(var-get initialized)')) === 'boolean'; } catch { return false; } };
  if (await onChain(B1)) check('jing-buy-stx-1 already deployed at the fork tip (mainnet)', true); else await deploy('jing-buy-stx-1', srcBuy);
  if (await onChain(S1)) check('jing-sell-stx-1 already deployed at the fork tip (mainnet)', true); else await deploy('jing-sell-stx-1', srcSell);
  const h = await evalIn(LADDER, `{ b0: (contract-hash? '${B0}), b1: (contract-hash? '${B1}), s0: (contract-hash? '${S0}), s1: (contract-hash? '${S1}) }`);
  check('new rungs hash = live rungs hash (canonical unchanged)', show(h.b0) === show(h.b1) && show(h.s0) === show(h.s1), show(h));
  console.log(`  buy hash ${show(h.b1)}\n  sell hash ${show(h.s1)}`);
  await tx('initialize buy-stx-1 before retire -> u6011 band full', DEP, B1, 'initialize', [uintCV(1), boolCV(true)], { err: 6011n });
  if (ROUTE) {
    const readReplace = async (side) => {
      const band = P.ladderBandSide(side), nw = side === 'buy' ? B1 : S1;
      const st = await evalIn(LADDER, `{ owner: (get-owner), canon: (get-canonical "${band}"), n: (get-band-count "${band}"), max: (get-max-band-per-side), from: (get-rung "${band}" u0), to: (get-rung "${band}" u1), same: (is-eq (contract-hash? (unwrap-panic (get-canonical "${band}"))) (contract-hash? '${nw})) }`);
      const init = await evalIn(nw, '(var-get initialized)');
      return { ladderOwner: st.owner, bandCount: Number(st.n), maxBand: Number(st.max), fromHolder: st.from, toHolder: st.to,
        newRung: { name: nw.split('.')[1], bps: 1, deployed: true, initialized: init === true }, sameCodeAsCanonical: st.same };
    };
    const plans = {};
    for (const side of ['buy', 'sell']) {
      const st = await readReplace(side);
      check(`${side}: fork state = owner deployer, 10/10 seats, u0 held by the 0 rung, u1 free, new rung not initialized, same code`,
        st.ladderOwner === DEP && st.bandCount === 10 && st.maxBand === 10 && st.fromHolder === (side === 'buy' ? B0 : S0) && st.toHolder === null && !st.newRung.initialized && st.sameCodeAsCanonical === true, show(st));
      plans[side] = P.planRungReplace(side, 0, 1, st);
      const got = plans[side].calls.map((c) => `${c.contractName}.${c.functionName}(${c.args.map((a) => a.value).join(',')})`);
      const want = [`${P.JING_LADDER}.retire-band(${P.ladderBandSide(side)},0)`, `jing-${side}-stx-1.initialize(1,true)`];
      check(`${side}: route plan = retire-band then initialize, no pause, no set-canonical, no blockers`, plans[side].blockers.length === 0 && show(got) === show(want), got.join(' | '));
    }
    // pure-planner pre-checks (no chain): every 409 case blocks
    const base = await readReplace('buy');
    const blk = (st, from = 0, to = 1) => P.planRungReplace('buy', from, to, { ...base, ...st }).blockers.length > 0;
    check('planner blocks: new rung not deployed / already-held to seat / foreign from holder / wrong owner / code differs / band full / from = to',
      blk({ newRung: { ...base.newRung, deployed: false } }) && blk({ toHolder: S0 }) && blk({ fromHolder: S0 }) && blk({ ladderOwner: WHALE.x })
      && blk({ sameCodeAsCanonical: false }) && blk({ fromHolder: null }) && blk({}, 1, 1));
    const half = P.planRungReplace('buy', 0, 1, { ...base, fromHolder: null, bandCount: 9 });
    check('planner: from already retired -> skips retire, plans initialize only', half.blockers.length === 0 && half.calls.length === 1 && half.calls[0].functionName === 'initialize', show(half));
    let nonce = Number(await retry(() => getNonce(sid, DEP)));
    const all = [...plans.buy.calls, ...plans.sell.calls];
    const steps = [];
    for (const c of all) {
      const t = await makeUnsignedContractCall({ contractAddress: c.contractAddress, contractName: c.contractName, functionName: c.functionName,
        functionArgs: c.args.map((a) => a.type === 'ascii' ? stringAsciiCV(a.value) : a.type === 'uint' ? uintCV(a.value) : a.type === 'bool' ? boolCV(a.value) : P_(a.value)),
        nonce: nonce++, fee: P.JING_RUNG_INIT_FEE, network: 'mainnet', publicKey: '', postConditionMode: PostConditionMode.Deny, postConditions: [] });
      setSender(t, DEP);
      steps.push({ Transaction: t.serialize() });
    }
    const out = await retry(() => submitSimulationSteps(sid, { steps: [{ TenureExtend: { cause: 'Extended' } }, ...steps] }));
    all.forEach((c, i) => {
      const t = out.steps[i + 1]?.Transaction?.Ok;
      const res = t ? cvToString(deserializeCV(t.result)) : JSON.stringify(out.steps[i + 1]).slice(0, 300);
      check(`route tx ${c.contractName}.${c.functionName} ${c.args.map((a) => a.value).join(' ')} (one batch, nonce order, deny mode)`, !!t && !t.vm_error && !t.post_condition_aborted && res === '(ok true)', res);
    });
    for (const side of ['buy', 'sell']) {
      const again = P.planRungReplace(side, 0, 1, await readReplace(side));
      check(`${side}: re-run plans nothing (idempotent), no blockers`, again.calls.length === 0 && again.blockers.length === 0 && again.skipped.length === 2, show(again.skipped));
    }
    const pb = await evalIn(B0, '(var-get push-paused)'), ps = await evalIn(S0, '(var-get push-paused)');
    check('old 0-bps rungs NOT push-paused (stay live for their members)', pb === false && ps === false, show({ pb, ps }));
    // informational: a direct deposit into the unseated, unpaused 0 rung
    const dd = await send(WHALE.y, S0, 'deposit', [uintCV(1_000_000n)]);
    console.log(`  info: direct deposit 1 STX into unseated sell-stx-0 -> ${show(dd.res)}; events ${show(prints(dd.receipt).map((p) => p.event))}`);
  } else {
    await tx('ladder retire-band("buy-band", u0)', DEP, LADDER, 'retire-band', [stringAsciiCV('buy-band'), uintCV(0)], { ok: true });
    await tx('ladder retire-band("sel-band", u0)', DEP, LADDER, 'retire-band', [stringAsciiCV('sel-band'), uintCV(0)], { ok: true });
    await tx('buy-stx-0 set-push-paused true', DEP, B0, 'set-push-paused', [boolCV(true)], { ok: true });
    await tx('sell-stx-0 set-push-paused true', DEP, S0, 'set-push-paused', [boolCV(true)], { ok: true });
    await tx('buy-stx-1 initialize(u1, true)', DEP, B1, 'initialize', [uintCV(1), boolCV(true)], { ok: true });
    await tx('sell-stx-1 initialize(u1, true)', DEP, S1, 'initialize', [uintCV(1), boolCV(true)], { ok: true });
  }
  const lad = await evalIn(LADDER, `{ nb: (get-band-count "buy-band"), ns: (get-band-count "sel-band"), b1: (get-rung "buy-band" u1), s1: (get-rung "sel-band" u1), b0: (get-rung "buy-band" u0), s0: (get-rung "sel-band" u0), b0x: (is-band-x '${B0}), s0y: (is-band-y '${S0}), b0reg: (is-registered '${B0}), s0reg: (is-registered '${S0}) }`);
  check('ladder: 10/10 seats, u1 -> new rungs, u0 empty, old rungs unseated but still registered',
    lad.nb === 10n && lad.ns === 10n && lad.b1 === B1 && lad.s1 === S1 && lad.b0 === null && lad.s0 === null && !lad.b0x && !lad.s0y && lad.b0reg && lad.s0reg, show(lad));
  const seats = await evalIn(MARKET, `{ x: (get-seated-x), y: (get-seated-y) }`);
  check('market seated lists: new rungs in, old rungs out (sync-seat filtered them)',
    seats.x.includes(B1) && !seats.x.includes(B0) && seats.y.includes(S1) && !seats.y.includes(S0) && seats.x.length === 10 && seats.y.length === 10, show(seats).slice(0, 200));
  check('new rungs spread-bps = u1', (await evalIn(B1, '(get-spread-bps)')) === 1n && (await evalIn(S1, '(get-spread-bps)')) === 1n);
  await tx('dispatch deposit-buy into retired buy-stx-0 -> u7104 not seated', WHALE.x, DISPATCH, 'deposit-buy', [uintCV(5000), legs(B0, 5000n)], { err: 7104n });

  // ---------------------------------------------------------------- D ----
  group = 'D deposits rest at 1 bps';
  console.log(`\n=== ${group} ===`);
  const DY = 50_000_000n, DX = 20_000n;
  const wyStx0 = await stxBal(WHALE.y), wxSbtc0 = await sbtcBal(WHALE.x);
  await tx('user dispatch deposit-sell 50 STX into sell-stx-1', WHALE.y, DISPATCH, 'deposit-sell', [uintCV(DY), legs(S1, DY)], (v) => v.ok?.rungs === 1n);
  check('sell-stx-1 pending bid', (await evalIn(MARKET, `(get-token-y-pending-deposit '${S1})`))?.amount === DY);
  const sy = await tx('keeper settle-token-y-deposit(sell-stx-1) -> (ok) placed', DEP, MARKET, 'settle-token-y-deposit', settleArgs(S1, 'y'), (v) => v.ok !== undefined);
  check('no refund print (not crossing)', !prints(sy.receipt).some((p) => String(p.event).startsWith('pending-refund')), show(prints(sy.receipt).map((p) => p.event)));
  check('sell-stx-1 rests 50 STX on the book', (await liveY(S1)) === DY);
  const b1p = await evalIn(MARKET, `(token-y-limit-at '${S1} u${MID})`);
  check('sell-stx-1 bid = mid - 1 bps (below the old ask at mid)', b1p === bid1 && b1p < ask0, `bid ${b1p}`);
  await tx('user dispatch deposit-buy 20,000 sats into buy-stx-1', WHALE.x, DISPATCH, 'deposit-buy', [uintCV(DX), legs(B1, DX)], (v) => v.ok?.rungs === 1n);
  check('buy-stx-1 pending ask', (await evalIn(MARKET, `(get-token-x-pending-deposit '${B1})`))?.amount === DX);
  const sx = await tx('keeper settle-token-x-deposit(buy-stx-1) -> (ok) placed', DEP, MARKET, 'settle-token-x-deposit', settleArgs(B1, 'x'), (v) => v.ok !== undefined);
  check('no refund print (not crossing)', !prints(sx.receipt).some((p) => String(p.event).startsWith('pending-refund')));
  check('buy-stx-1 rests 20,000 sats on the book', (await liveX(B1)) === DX);
  const a1p = await evalIn(MARKET, `(token-x-limit-at '${B1} u${MID})`);
  check('buy-stx-1 ask = mid + 1 bps; book not crossed (best bid < best ask)', a1p === ask1 && b1p < ask0, `ask ${a1p}`);
  check('cycle unchanged (no settlement happened on deposit)', (await cyc()) === c0);

  // ---------------------------------------------------------------- E ----
  group = 'E takers fill';
  console.log(`\n=== ${group} ===`);
  // sBTC taker hits the best bid (sell-stx-1 at mid - 1 bps): ~20 STX worth
  await tx('fund sBTC taker 50,000 sats', WHALE.x, SBTC, 'transfer', [uintCV(50_000n), P_(WHALE.x), P_(takerX), noneCV()], { ok: true });
  await stxTransfer(WHALE.y, takerX, 1_000_000n);
  const X = 20_000_000n * 10n ** 10n / b1p;
  const tX = await tx(`taker swap ${X} sats -> STX (limit bid1 - 1%)`, takerX, MARKET, 'swap',
    [uintCV(X), uintCV(b1p - b1p / 100n), upd(), T.x, A.x, T.y, A.y, boolCV(true)], (v) => v.ok !== undefined);
  const s1after = await liveY(S1);
  check('sell-stx-1 bid partly filled first (best bid)', s1after < DY && s1after > 0n, `live ${s1after} of ${DY}`);
  // STX taker eats the retired 0-bps ask, then the 1-bps ask
  const b0live = await liveX(B0);
  const needY = (b0live * ask0 + 10_000n * ask1) / 10n ** 10n;
  const gross = needY * 10100n / 10000n;
  await stxTransfer(WHALE.y, takerY, gross + 5_000_000n);
  await tx(`taker swap ${gross} uSTX -> sBTC (limit ask1 + 1%)`, takerY, MARKET, 'swap',
    [uintCV(gross), uintCV(ask1 + ask1 / 100n), upd(), T.x, A.x, T.y, A.y, boolCV(false)], (v) => v.ok !== undefined);
  const b0after = await liveX(B0), b1after = await liveX(B1);
  check('retired buy-stx-0 ask filled (it still trades for its members)', b0after < b0live, `${b0live} -> ${b0after}`);
  check('buy-stx-1 ask filled after it', b1after < DX, `${DX} -> ${b1after}`);

  // ---------------------------------------------------------------- F ----
  group = 'F makers withdraw';
  console.log(`\n=== ${group} ===`);
  const ex = async (label, who, rung, isBuy, updArg) => {
    const s0 = await sbtcBal(who), y0 = await stxBal(who);
    const pos = await evalIn(rung, `(get-position '${who})`);
    const r = await tx(`${label} withdraw all`, who, rung, 'withdraw', [uintCV(BIG), updArg], (v) => v.ok !== undefined);
    const ds = (await sbtcBal(who)) - s0, dy = (await stxBal(who)) - y0;
    // get-position reads before sync, so fills not yet synced show up only in the withdraw result
    check(`${label} wallet got exactly the withdraw result (sbtc +${ds}, stx +${dy})`, ds === r.res.ok.sbtc && dy === r.res.ok.stx && (ds > 0n || dy > 0n), `pre-sync position ${show(pos)}`);
    check(`${label} position gone`, (await evalIn(rung, `(get-position '${who})`)).shares === 0n);
    return r;
  };
  await ex('new sell-stx-1 member (STX left + sBTC proceeds)', WHALE.y, S1, false, someCV(upd()));
  await ex('new buy-stx-1 member (sats left + STX proceeds)', WHALE.x, B1, true, someCV(upd()));
  for (const m of OLD_BUY_MEMBERS) await ex(`old buy-stx-0 member ${m.slice(0, 8)}`, m, B0, true, someCV(upd()));
  check('buy-stx-0 empty: no members, nothing on the book', (await evalIn(B0, '(get-state)')).members === 0n && (await liveX(B0)) === 0n);
  for (const m of [...OLD_SELL_MEMBERS, WHALE.y]) {
    const pos = await evalIn(S0, `(get-position '${m})`);
    if (pos.shares === 0n) continue;
    // ROUTE: the unpaused 0 rung pushed the info deposit as a pending bid, so
    // withdraw needs a price update (u7012 without one)
    await ex(`old sell-stx-0 member ${m.slice(0, 8)}`, m, S0, false, ROUTE ? someCV(upd()) : noneCV());
  }
  const s0end = await evalIn(S0, '(get-state)');
  check('sell-stx-0 empty: no members', s0end.members === 0n, `${show(s0end)} balance ${await stxBal(S0)}`);
  console.log(`\nsell-stx-0 leftover balance ${await stxBal(S0)} uSTX, buy-stx-0 ${await sbtcBal(B0)} sats`);
}

main().then(() => {
  console.log('\nGroups:'); for (const [g, [p, n]] of Object.entries(groups)) console.log(`  ${p === n ? 'PASS' : 'FAIL'} ${g}: ${p}/${n}`);
  console.log(`\n${passed}/${checks} checks green`);
  console.log(`https://stxer.xyz/simulations/mainnet/${sid}`);
}).catch((e) => {
  console.error(e.message ?? e);
  console.log('\nGroups:'); for (const [g, [p, n]] of Object.entries(groups)) console.log(`  ${p === n ? 'PASS' : 'FAIL'} ${g}: ${p}/${n}`);
  console.log(`${passed}/${checks} checks green`); console.log(`https://stxer.xyz/simulations/mainnet/${sid}`); process.exit(1);
});
