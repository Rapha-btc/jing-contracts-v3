// Fork only. Run: node simulations/verify-v6-3-gate-blind-band-stx-usdcx.mjs
// STX/USDCx port of verify-v6-3-gate-blind-band.js (maker-margin gate blind
// band, AIBTC bounty muaqb2yb546e17c25866) on markets-stx-usdcx-jing-v6-4.
//
// Same scenarios, both sides, each on its own fresh `gate-*` market copy
// deployed from the stripped contracts/stx-usdcx/ market source:
//   1. blind band: maker 20 bps through the mid, entrant 5% through ->
//      settle REFUNDS "crossing"; controls 30 / 100 bps away are PLACED.
//   2. Rushing Orion overlap: maker 20 bps OUTSIDE the mid, entrant 30 bps
//      through -> PLACED, nothing fills, a batch at the same print -> u1009.
//   3. Void Kael gap 6: maker rests, operator raises that side's minimum
//      above it; an entrant crossing it is still refused "crossing".
//   4. jing-ladder-stx-usdcx-v1 seat cap: 50 refused, 49 accepted,
//      sync-seat-count 49.
//
// Differences from the sBTC/STX original (fork setup only, same checks):
//   - fork at the tip; jing-core-v6 is the LIVE one (not redeployed); verify
//     and initialize are sent by its owner CORE_OWNER (multisig), and each copy
//     hands the operator to CORE_OWNER for initialize and back to DEP after.
//   - x = native STX (6 dp), y = USDCx (6 dp); y = x * price / 1e8.
//   - feeds [45, 7]; mid = px * 1e8 / py (USDCx per STX x 1e8).
//   - amounts: AMT x = 12 STX (~$3.2), y = 3 USDCx; mins 1 STX / 1 USDCx
//     (orig: 3000 sats / 6 STX with mins 1000 sats / 1 STX: both sides a few
//     times their min, x worth more than y). Raised mins (phase 3): x 20 STX,
//     y 5 USDCx (orig 5000 sats / 10 STX): both above the resting amount.
import {
  ClarityVersion, uintCV, noneCV, deserializeCV, cvToString,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, getSimulationTip,
  submitSimulationSteps, callContract,
} from 'stxer';
import { installChunkedSubmit } from './_chunked-submit.js';
import { installRetrySubmit } from './_retry-submit.js';
import {
  NODE, DEP, CORE, CORE_OWNER, USDCX, STX_WHALES, USDCX_WHALES, N, C,
  P_ as principal, traits, assets, mk, src, balanceExpr as balance,
  lazer, lazerTimes, freshAfter, midOf, updCV as update, MIN,
} from './_stx-usdcx-v6-common.mjs';
installChunkedSubmit(4);
installRetrySubmit();

const LAD = C.ladder;
const WHALES = { x: STX_WHALES[0], y: USDCX_WHALES[1] };
const keeper = mk(399);
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
const other = (side) => side === 'x' ? 'y' : 'x';
const PP = 100_000_000n, BPS = 10_000n;
// x amounts in uSTX, y amounts in uUSDCx. 12 STX is worth more than 3 USDCx.
const AMT = { x: 12_000_000, y: 3_000_000 };
const RAISED = { x: 20_000_000, y: 5_000_000 };

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

const MARKETS = [
  { key: 'blind-y', side: 'y' }, { key: 'blind-x', side: 'x' },
  { key: 'overlap-y', side: 'y' }, { key: 'overlap-x', side: 'x' },
  { key: 'minraise-y', side: 'y' }, { key: 'minraise-x', side: 'x' },
];

async function main() {
  // ---------------- setup: one batch ----------------
  let b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  const steps = [];
  const add = (label, build, want) => { b = build(b); steps.push({ label, want }); };
  const call = (sender, cid, fn, args) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const read = (label, cid, code, want) => add(label, (bb) => bb.addEvalCode(cid, code), want);
  const deploy = (name, file = name) => add(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: src(file), clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes('ERR'));
  read('live jing-core-v6 owner = CORE_OWNER', CORE, '(get-contract-owner)', CORE_OWNER);
  deploy(N.ladder);
  read('fresh ladder owner = DEP', LAD, '(get-owner)', DEP);
  let n = 300;
  const fundStep = (side, p, amount) => add(`fund ${amount} ${side} -> ${p.slice(0, 8)}`, side === 'x'
    ? (bb) => bb.withSender(WHALES.x).addSTXTransfer({ recipient: p, amount })
    : call(WHALES.y, USDCX, 'transfer', [uintCV(amount), principal(WHALES.y), principal(p), noneCV()]), ok);
  for (const m of MARKETS) {
    m.name = `gate-${m.key}`;
    m.cid = `${DEP}.${m.name}`;
    m.opp = other(m.side);
    m.maker = mk(n++);
    m.entrant = mk(n++);
    m.controls = m.key.startsWith('blind') ? [mk(n++), mk(n++)] : [];
    deploy(m.name, N.market);
    add(`${m.name}: sync seats`, call(DEP, m.cid, 'sync-seat-count', []), '(ok u10)');
    add(`${m.name}: verify (core owner)`, call(CORE_OWNER, CORE, 'set-verified-contract', [principal(m.cid)]), '(ok true)');
    add(`${m.name}: operator -> core owner`, call(DEP, m.cid, 'set-operator', [principal(CORE_OWNER)]), '(ok true)');
    add(`${m.name}: initialize`, call(CORE_OWNER, m.cid, 'initialize', [principal(m.cid), traits.x, traits.y, uintCV(MIN.x), uintCV(MIN.y), uintCV(45), uintCV(7)]), '(ok true)');
    add(`${m.name}: operator -> DEP`, call(CORE_OWNER, m.cid, 'set-operator', [principal(DEP)]), '(ok true)');
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
  const u1 = await lazer();
  const times1 = await lazerTimes(u1.hex);
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

  const u2 = await freshAfter(stamp);
  const u2at = u2.at;
  const mid = midOf(u2);
  const down = (bps) => (mid * (BPS - bps)) / BPS;
  const up = (bps) => (mid * (BPS + bps)) / BPS;
  // x ask willing when limit <= mid; y bid willing when limit >= mid
  const through = (side, bps) => side === 'x' ? down(bps) : up(bps);
  const away = (side, bps) => side === 'x' ? up(bps) : down(bps);
  console.log(`Timing: U1 at=${times1.at}, submitted-at=${stamp}, U2 at=${u2at}; settle mid ${mid} ($${(Number(mid) / 1e8).toFixed(4)} per STX)`);

  const m = Object.fromEntries(MARKETS.map((x) => [x.key, x]));

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
    await ev(`[${mm.name}] market STX custody`, mm.cid, balance('x', mm.cid), `u${xAmt}`);
    await ev(`[${mm.name}] market USDCx custody`, mm.cid, balance('y', mm.cid), `u${yAmt}`);
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
    await tx(`[${mm.name}] batch at the settle print fills nothing`, keeper, mm.cid, 'settle-with-refresh', [update(u2), ...pairArgs()], '(err u1009)');
    await makerUntouched(mm, makerLimit);
    await ev(`[${mm.name}] entrant still rests full amount`, mm.cid, live(mm.side, mm.entrant), `u${AMT[mm.side]}`);
    await ev(`[${mm.name}] entrant received no ${mm.opp}`, mm.cid, balance(mm.opp, mm.entrant), 'u0');
    await custody(mm, c.x, c.y);
    finishPhase();
  }

  // ---------------- 3. raised minimum ----------------
  console.log('PHASE 3: Void Kael gap 6, operator raises the maker side minimum above the resting order');
  for (const mm of [m['minraise-y'], m['minraise-x']]) {
    const makerLimit = through(mm.opp, 20n);
    const entrantLimit = through(mm.side, 500n);
    const raised = RAISED[mm.opp];
    await restMaker(mm, makerLimit, `maker rests ${AMT[mm.opp]} ${mm.opp} 20 bps through the mid`);
    await tx(`[${mm.name}] operator raises ${mm.opp} minimum to ${raised}`, DEP, mm.cid, `set-min-token-${mm.opp}-deposit`, [uintCV(raised)], '(ok true)');
    await ev(`[${mm.name}] resting order now under the minimum`, mm.cid, `(< ${live(mm.opp, mm.maker)} (var-get min-token-${mm.opp}-deposit))`, 'true');
    await submit(mm, mm.entrant, entrantLimit, 'entrant 5% through the now-small order');
    await settleRefundCrossing(mm, mm.entrant, 'entrant 5% through the now-small order');
    await makerUntouched(mm, makerLimit);
    const c = custodyOf(mm, false);
    await custody(mm, c.x, c.y);
    finishPhase();
  }

  // ---------------- 4. ladder seat cap ----------------
  console.log('PHASE 4: jing-ladder-stx-usdcx-v1 seat cap');
  await tx('ladder: 50 seats per side refused', DEP, LAD, 'set-max-band-per-side', [uintCV(50)], '(err u6011)');
  await ev('ladder: max unchanged after refusal', LAD, '(get-max-band-per-side)', 'u10');
  await tx('ladder: 49 seats per side accepted', DEP, LAD, 'set-max-band-per-side', [uintCV(49)], '(ok true)');
  await ev('ladder: max reads 49', LAD, '(get-max-band-per-side)', 'u49');
  await tx('market: sync-seat-count reads 49', DEP, m['blind-y'].cid, 'sync-seat-count', [], '(ok u49)');
  finishPhase();

  console.log(`${passed}/${checks} checks green`);
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  if (failures) process.exitCode = 1;
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
