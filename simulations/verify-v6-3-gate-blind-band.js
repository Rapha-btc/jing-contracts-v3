// Fork only. Run: node simulations/verify-v6-3-gate-blind-band.js
// stxer mainnet-fork regression for the maker-margin gate blind band
// (AIBTC bounty muaqb2yb546e17c25866) on markets-sbtc-stx-jing-v6-3.
//
// v6-3 is submit + settle: with the opposite side non-empty, deposit-token-*
// escrows a pending order; settle-token-*-deposit (permissionless, needs a
// Lazer print newer than the pending's submitted-at) either places it or
// refunds it as "crossing" (would-take-as-* at the settle mid: the entrant's
// limit reaches the mid AND some opposite order is willing at the mid) or
// "queue-full".
//
// Scenarios, both sides, each on its own fresh `gate-*` market deployed from
// the unmodified working-tree v6-3 source:
//   1. blind band: a maker rests 20 bps through the mid (willing at the mid);
//      an entrant submits 5% through the mid -> settle REFUNDS as "crossing".
//      Controls 30 and 100 bps away (can never meet the maker) are PLACED.
//   2. Rushing Orion overlap: the maker rests 20 bps OUTSIDE the mid (not
//      willing at the mid); the entrant overlaps it at 30 bps. would-take-as-*
//      only looks for an opposite order willing AT the mid, so v6-3 PLACES
//      it; nothing fills at settle and a batch at the same print fills nothing.
//   3. Void Kael gap 6: the maker's order rests, the owner raises that side's
//      minimum above it; an entrant crossing it is still refused "crossing".
//   4. jing-ladder-v1 seat cap: 50 refused, 49 accepted, sync-seat-count 49.
//
// Timing: submissions run at a fork time pinned to a real signed print U1;
// every settle uses a print U2 fetched afterwards (U2.at > submitted-at), and
// all limits are computed from U2's mid, so the settle-time mid is exact.
import fs from 'node:fs';
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV,
  standardPrincipalCV, noneCV, deserializeCV, cvToString, getAddressFromPrivateKey,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, getSimulationTip,
  submitSimulationSteps, callContract,
} from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const CORE = `${DEP}.jing-core-v6`;
const LAD = `${DEP}.jing-ladder-v1`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const STX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALES = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51' };
const principal = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const traits = { x: principal(SBTC), y: principal(STX) };
const assets = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const keeper = mk(399);
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
const other = (side) => side === 'x' ? 'y' : 'x';
const PP = 100_000_000n, BPS = 10_000n;
// x amounts in sats, y amounts in uSTX. 3000 sats is worth more than 6 STX.
const AMT = { x: 3000, y: 6_000_000 };

let passed = 0, checks = 0, failures = 0, sid;
function check(label, actual, want) {
  checks++;
  const good = typeof want === 'function' ? want(actual) : actual === want;
  if (good) passed++; else failures++;
  console.log(`${good ? 'ok  ' : 'FAIL'} ${checks}. ${label}: ${String(actual).slice(0, 400)}${good ? '' : `; expected ${want}`}`);
  return good;
}
function finishPhase() {
  if (failures) {
    console.log(`${passed}/${checks} checks green`);
    throw new Error(`Stopped on failed checks. Fork: https://stxer.xyz/simulations/mainnet/${sid}`);
  }
}
async function ev(label, cid, code, want) {
  const out = await submitSimulationSteps(sid, { steps: [{ Eval: [DEP, '', cid, code] }] });
  const actual = decode({ Result: out.steps[0] });
  check(label, actual, want);
  return actual;
}
async function tx(label, sender, cid, fn, args, want) {
  const r = await callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 });
  const actual = r.vmError || r.pcAborted ? `ENGINE-ERR ${JSON.stringify(r)}` : r.result;
  check(label, actual, want);
  return r;
}
const balance = (side, p) => side === 'y' ? `(stx-get-balance '${p})` : `(unwrap-panic (contract-call? '${SBTC} get-balance '${p}))`;
const pending = (side, p) => `(get-token-${side}-pending-deposit '${p})`;
const live = (side, p) => `(get-token-${side}-deposit (var-get current-cycle) '${p})`;
const limitOf = (side, p) => `(get-token-${side}-limit '${p})`;
const depArgs = (side, amount, limit) => [uintCV(amount), uintCV(limit), noneCV(), traits[side], assets[side]];
const settleArgs = (side, who, u) => [principal(who), update(u), traits[side], assets[side]];
const pairArgs = () => [traits.x, assets.x, traits.y, assets.y];

function corePrints(receipt) {
  return receipt.events.map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.committed && e.contract_event?.contract_identifier === CORE)
    .map((e) => cv(e.contract_event.raw_value));
}
function event(label, receipt, name, fields = {}) {
  const prints = corePrints(receipt);
  check(label, prints.join(' | '), () => prints.some((value) => value.includes(`(event "${name}")`) &&
    Object.entries(fields).every(([key, val]) => value.includes(`(${key} ${val})`))));
}
function noEvent(label, receipt, name) {
  const prints = corePrints(receipt);
  check(label, prints.join(' | '), () => !prints.some((value) => value.includes(`(event "${name}`)));
}
async function freshAfter(stamp) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const u = await fetchLazerUpdateAny();
    const times = await lazerFeedTimes(u.hex);
    if (times.at > stamp) return { u, at: times.at };
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`No newer signed feed after ${stamp}`);
}

// Markets: one per scenario and entrant side. `side` is the ENTRANT's side;
// the resting maker sits on the other side.
const MARKETS = [
  { key: 'blind-y', side: 'y' }, { key: 'blind-x', side: 'x' },
  { key: 'overlap-y', side: 'y' }, { key: 'overlap-x', side: 'x' },
  { key: 'minraise-y', side: 'y' }, { key: 'minraise-x', side: 'x' },
];

async function main() {
  // ---------------- setup: one batch ----------------
  let b = SimulationBuilder.new({ stacksNodeAPI: 'http://77.42.3.101/stacks-api' });
  const steps = [];
  const add = (label, build, want) => { b = build(b); steps.push({ label, want }); };
  const call = (sender, cid, fn, args) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const read = (label, cid, code, want) => add(label, (bb) => bb.addEvalCode(cid, code), want);
  const deploy = (name, file = name) => add(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: source(file), clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes('ERR'));
  deploy('jing-core-v6');
  deploy('jing-ladder-v1');
  let n = 300;
  const fundStep = (side, p, amount) => add(`fund ${amount} ${side} -> ${p.slice(0, 8)}`, side === 'x'
    ? call(WHALES.x, SBTC, 'transfer', [uintCV(amount), principal(WHALES.x), principal(p), noneCV()])
    : (bb) => bb.withSender(WHALES.y).addSTXTransfer({ recipient: p, amount }), ok);
  for (const m of MARKETS) {
    m.name = `gate-${m.key}`;
    m.cid = `${DEP}.${m.name}`;
    m.opp = other(m.side);
    m.maker = mk(n++);
    m.entrant = mk(n++);
    m.controls = m.key.startsWith('blind') ? [mk(n++), mk(n++)] : [];
    deploy(m.name, 'markets-sbtc-stx-jing-v6-3');
    add(`${m.name}: sync seats`, call(DEP, m.cid, 'sync-seat-count', []), '(ok u10)');
    add(`${m.name}: verify`, call(DEP, CORE, 'set-verified-contract', [principal(m.cid)]), '(ok true)');
    add(`${m.name}: initialize`, call(DEP, m.cid, 'initialize', [principal(m.cid), traits.x, traits.y, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), '(ok true)');
    read(`${m.name}: registered in core-v6`, CORE, `(is-registered '${m.cid})`, 'true');
    for (const [side, p] of [[m.opp, m.maker], [m.side, m.entrant], ...m.controls.map((c) => [m.side, c])]) {
      read(`${m.name}: fresh principal ${side} balance`, m.cid, balance(side, p), 'u0');
      read(`${m.name}: fresh principal ${other(side)} balance`, m.cid, balance(other(side), p), 'u0');
      fundStep(side, p, AMT[side]);
    }
  }
  sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const setup = (await getSimulationResult(sid)).steps.filter((s) => s.Result?.Transaction || s.Result?.Eval);
  if (setup.length !== steps.length) throw new Error(`Setup result count mismatch ${setup.length} vs ${steps.length}`);
  steps.forEach((s, i) => check(s.label, decode(setup[i]), s.want));
  finishPhase();

  // ---------------- pin fork time to a real signed print U1 ----------------
  const u1 = await fetchLazerUpdateAny();
  const times1 = await lazerFeedTimes(u1.hex);
  const tip = await getSimulationTip(sid);
  const stamp = Math.max(times1.at, Number(tip.block_time));
  if (stamp - times1.at >= 80) throw new Error('U1 too old; rerun');
  const interval = stamp - Number(tip.burn_block_time);
  if (interval <= 0) throw new Error('Cannot advance to U1 timestamp');
  await submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: {
    bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: interval,
  } }] });
  await ev('fork time pinned to U1', MARKETS[0].cid, 'stacks-block-time', `u${stamp}`);
  finishPhase();

  // U2 is fetched now but is strictly newer than every submit below (they all
  // run at `stamp`). All limits derive from U2's mid, the exact settle mid.
  const { u: u2, at: u2at } = await freshAfter(stamp);
  const mid = (u2.px * PP) / u2.py;
  const down = (bps) => (mid * (BPS - bps)) / BPS;
  const up = (bps) => (mid * (BPS + bps)) / BPS;
  // "through the mid" = willing at the mid. An x ask is willing when its limit
  // is <= mid; a y bid is willing when its limit is >= mid.
  const through = (side, bps) => side === 'x' ? down(bps) : up(bps);
  const away = (side, bps) => side === 'x' ? up(bps) : down(bps);
  console.log(`Timing: U1 at=${times1.at}, submitted-at=${stamp}, U2 at=${u2at}; settle mid ${mid} (${(1e16 / Number(mid)).toFixed(2)} sats/STX)`);

  const m = Object.fromEntries(MARKETS.map((x) => [x.key, x]));

  // Rests the maker directly (entrant side is empty, so no pending).
  async function restMaker(mm, limit, label) {
    const { cid, name, opp, maker } = mm;
    await tx(`[${name}] ${label}`, maker, cid, `deposit-token-${opp}`, depArgs(opp, AMT[opp], limit), `(ok u${AMT[opp]})`);
    await ev(`[${name}] maker placed directly, no pending`, cid, pending(opp, maker), 'none');
    await ev(`[${name}] maker live amount`, cid, live(opp, maker), `u${AMT[opp]}`);
    await ev(`[${name}] maker limit`, cid, limitOf(opp, maker), `u${limit}`);
    await ev(`[${name}] maker wallet emptied`, cid, balance(opp, maker), 'u0');
  }
  async function submit(mm, who, limit, label) {
    const { cid, name, side } = mm;
    const r = await tx(`[${name}] ${label}: submit escrows`, who, cid, `deposit-token-${side}`, depArgs(side, AMT[side], limit), `(ok u${AMT[side]})`);
    event(`[${name}] ${label}: pending-deposit logged`, r.receipt, `pending-deposit-${side}`, { depositor: who, amount: `u${AMT[side]}` });
    await ev(`[${name}] ${label}: pending exact`, cid,
      `(is-eq ${pending(side, who)} (some { amount: u${AMT[side]}, limit: u${limit}, spread-bps: none, submitted-at: u${stamp} }))`, 'true');
    await ev(`[${name}] ${label}: not on book yet`, cid, live(side, who), 'u0');
    await ev(`[${name}] ${label}: wallet escrowed`, cid, balance(side, who), 'u0');
  }
  async function makerUntouched(mm, limit) {
    const { cid, name, opp, side, maker } = mm;
    await ev(`[${name}] maker still rests full amount`, cid, live(opp, maker), `u${AMT[opp]}`);
    await ev(`[${name}] maker limit unchanged`, cid, limitOf(opp, maker), `u${limit}`);
    await ev(`[${name}] maker received no ${side}`, cid, balance(side, maker), 'u0');
    await ev(`[${name}] maker own-asset wallet unchanged`, cid, balance(opp, maker), 'u0');
  }
  async function settleRefundCrossing(mm, who, label) {
    const { cid, name, side, opp } = mm;
    const r = await tx(`[${name}] ${label}: settle REFUNDS`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, who, u2), `(ok u${AMT[side]})`);
    event(`[${name}] ${label}: refund logged as crossing`, r.receipt, `pending-refund-${side}`,
      { depositor: who, amount: `u${AMT[side]}`, price: `u${mid}`, reason: '"crossing"' });
    noEvent(`[${name}] ${label}: no deposit/settlement at settle`, r.receipt, `deposit-${side}`);
    noEvent(`[${name}] ${label}: no settlement event`, r.receipt, 'settlement');
    await ev(`[${name}] ${label}: pending cleared`, cid, pending(side, who), 'none');
    await ev(`[${name}] ${label}: exact refund`, cid, balance(side, who), `u${AMT[side]}`);
    await ev(`[${name}] ${label}: no fill received`, cid, balance(opp, who), 'u0');
    await ev(`[${name}] ${label}: not on book`, cid, live(side, who), 'u0');
    await ev(`[${name}] ${label}: keeper paid nothing`, cid, balance(side, keeper), 'u0');
  }
  async function settlePlaced(mm, who, limit, label) {
    const { cid, name, side, opp } = mm;
    const r = await tx(`[${name}] ${label}: settle PLACES`, keeper, cid, `settle-token-${side}-deposit`, settleArgs(side, who, u2), `(ok u${AMT[side]})`);
    event(`[${name}] ${label}: deposit logged`, r.receipt, `deposit-${side}`, { depositor: who, amount: `u${AMT[side]}`, limit: `u${limit}` });
    noEvent(`[${name}] ${label}: no refund`, r.receipt, `pending-refund-${side}`);
    noEvent(`[${name}] ${label}: nothing fills at settle`, r.receipt, 'settlement');
    await ev(`[${name}] ${label}: pending cleared`, cid, pending(side, who), 'none');
    await ev(`[${name}] ${label}: on book`, cid, live(side, who), `u${AMT[side]}`);
    await ev(`[${name}] ${label}: limit recorded`, cid, limitOf(side, who), `u${limit}`);
    await ev(`[${name}] ${label}: no second charge`, cid, balance(side, who), 'u0');
    await ev(`[${name}] ${label}: no fill received`, cid, balance(opp, who), 'u0');
  }
  async function custody(mm, xAmt, yAmt) {
    await ev(`[${mm.name}] market sBTC custody`, mm.cid, balance('x', mm.cid), `u${xAmt}`);
    await ev(`[${mm.name}] market STX custody`, mm.cid, balance('y', mm.cid), `u${yAmt}`);
  }
  const custodyOf = (mm, entrantPlaced, controls = 0) => {
    const c = { x: 0, y: 0 };
    c[mm.opp] += AMT[mm.opp];
    c[mm.side] += (entrantPlaced ? AMT[mm.side] : 0) + controls * AMT[mm.side];
    return c;
  };

  // ---------------- 1. blind band ----------------
  console.log('PHASE 1: blind band, maker 20 bps through the mid, entrant 5% through');
  for (const mm of [m['blind-y'], m['blind-x']]) {
    const makerLimit = through(mm.opp, 20n);
    const entrantLimit = through(mm.side, 500n);
    await restMaker(mm, makerLimit, `maker rests ${mm.opp} 20 bps through the mid`);
    await submit(mm, mm.entrant, entrantLimit, 'entrant 5% through');
    let c = custodyOf(mm, true);
    await custody(mm, c.x, c.y);
    await settleRefundCrossing(mm, mm.entrant, 'entrant 5% through');
    await makerUntouched(mm, makerLimit);
    c = custodyOf(mm, false);
    await custody(mm, c.x, c.y);
    finishPhase();
    const [c30, c100] = mm.controls;
    const l30 = away(mm.side, 30n), l100 = away(mm.side, 100n);
    await submit(mm, c30, l30, 'control 30 bps away');
    await submit(mm, c100, l100, 'control 100 bps away');
    await settlePlaced(mm, c30, l30, 'control 30 bps away');
    await settlePlaced(mm, c100, l100, 'control 100 bps away');
    await makerUntouched(mm, makerLimit);
    c = custodyOf(mm, false, 2);
    await custody(mm, c.x, c.y);
    finishPhase();
  }

  // ---------------- 2. overlap just outside the mid ----------------
  console.log('PHASE 2: Rushing Orion overlap, maker 20 bps outside the mid, entrant 30 bps');
  for (const mm of [m['overlap-y'], m['overlap-x']]) {
    const makerLimit = away(mm.opp, 20n);
    const entrantLimit = through(mm.side, 30n);
    await restMaker(mm, makerLimit, `maker rests ${mm.opp} 20 bps outside the mid`);
    await ev(`[${mm.name}] maker not willing at the settle mid`, mm.cid, `(would-take-as-${mm.side} u${mid} u${entrantLimit})`, 'false');
    await submit(mm, mm.entrant, entrantLimit, 'entrant overlaps at 30 bps');
    await settlePlaced(mm, mm.entrant, entrantLimit, 'entrant overlaps at 30 bps');
    await makerUntouched(mm, makerLimit);
    const c = custodyOf(mm, true);
    await custody(mm, c.x, c.y);
    // The limits overlap, but at the U2 mid the maker is not willing:
    // the batch at the same print has nothing to clear.
    await tx(`[${mm.name}] batch at the settle print fills nothing`, keeper, mm.cid, 'settle-with-refresh', [update(u2), ...pairArgs()], '(err u1009)');
    await makerUntouched(mm, makerLimit);
    await ev(`[${mm.name}] entrant still rests full amount`, mm.cid, live(mm.side, mm.entrant), `u${AMT[mm.side]}`);
    await ev(`[${mm.name}] entrant received no ${mm.opp}`, mm.cid, balance(mm.opp, mm.entrant), 'u0');
    await custody(mm, c.x, c.y);
    finishPhase();
  }

  // ---------------- 3. raised minimum ----------------
  console.log('PHASE 3: Void Kael gap 6, owner raises the maker side minimum above the resting order');
  for (const mm of [m['minraise-y'], m['minraise-x']]) {
    const makerLimit = through(mm.opp, 20n);
    const entrantLimit = through(mm.side, 500n);
    const raised = mm.opp === 'x' ? 5000 : 10_000_000;
    await restMaker(mm, makerLimit, `maker rests ${AMT[mm.opp]} ${mm.opp} 20 bps through the mid`);
    await tx(`[${mm.name}] owner raises ${mm.opp} minimum to ${raised}`, DEP, mm.cid, `set-min-token-${mm.opp}-deposit`, [uintCV(raised)], '(ok true)');
    await ev(`[${mm.name}] resting order now under the minimum`, mm.cid, `(< ${live(mm.opp, mm.maker)} (var-get min-token-${mm.opp}-deposit))`, 'true');
    await submit(mm, mm.entrant, entrantLimit, 'entrant 5% through the now-small order');
    await settleRefundCrossing(mm, mm.entrant, 'entrant 5% through the now-small order');
    await makerUntouched(mm, makerLimit);
    const c = custodyOf(mm, false);
    await custody(mm, c.x, c.y);
    finishPhase();
  }

  // ---------------- 4. ladder-v1 seat cap ----------------
  console.log('PHASE 4: jing-ladder-v1 seat cap');
  await tx('ladder-v1: 50 seats per side refused', DEP, LAD, 'set-max-band-per-side', [uintCV(50)], '(err u6011)');
  await ev('ladder-v1: max unchanged after refusal', LAD, '(get-max-band-per-side)', 'u10');
  await tx('ladder-v1: 49 seats per side accepted', DEP, LAD, 'set-max-band-per-side', [uintCV(49)], '(ok true)');
  await ev('ladder-v1: max reads 49', LAD, '(get-max-band-per-side)', 'u49');
  await tx('v6-3: sync-seat-count reads 49', DEP, m['blind-y'].cid, 'sync-seat-count', [], '(ok u49)');
  finishPhase();

  console.log(`${passed}/${checks} checks green`);
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  if (failures) process.exitCode = 1;
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
