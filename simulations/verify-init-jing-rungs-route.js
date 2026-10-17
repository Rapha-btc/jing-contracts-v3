// Fork only. Run: npx tsx simulations/verify-init-jing-rungs-route.js
// Proves faktory-dao POST /api/bot/init-jing-rungs before it runs for real.
// Forks mainnet at the tip, where jing-ladder-v1, markets-sbtc-stx-jing-v6-3
// and all 20 rungs (jing-buy-stx-spread-0..90, jing-sell-stx-spread-0..90) are
// deployed and not initialized. Nothing is deployed or patched in the sim.
//  1. reads each side's state on the fork (ladder owner, canonical, band
//     count, max band, each rung's `initialized` var)
//  2. plans with the route's own planner (faktory-dao backend
//     server/utils/jing-rungs-init.ts, imported, not copied)
//  3. builds the route's txs (same fee, deny mode, no post-conditions,
//     sequential deployer nonces) and submits each side's 11 txs as ONE
//     batch, so set-canonical and the ten initialize calls share a block
//  4. asserts every rung initialized with its spread, the ladder's
//     registered / rung / band maps (10 seats per side), the market's
//     seated-x (buy) and seated-y (sell), a re-plan that is empty, a second
//     initialize refused (u7002), and a small deposit into buy-0 and sell-0
import { homedir } from 'node:os';
import {
  uintCV, stringAsciiCV, boolCV, contractPrincipalCV, standardPrincipalCV, deserializeCV, cvToString,
  getAddressFromPrivateKey, makeUnsignedContractCall, makeUnsignedSTXTokenTransfer, PostConditionMode,
} from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps, callContract, getNonce, setSender } from 'stxer';

const PLANNER = `${process.env.FAKTORY_DIR || `${homedir()}/projects/faktory-dao`}/backend/server/utils/jing-rungs-init.ts`;
const P = await import(PLANNER);

const NODE = 'http://77.42.3.101/stacks-api';
const DEP = P.JING_DEPLOYER;
const LADDER = `${DEP}.${P.JING_LADDER}`;
const MARKET = `${DEP}.${P.JING_RUNG_MARKET}`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const WHALE = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR' };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const UA = mk(731), UB = mk(732);
const PR = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const toCV = (a) => a.type === 'ascii' ? stringAsciiCV(a.value) : a.type === 'uint' ? uintCV(a.value) : a.type === 'bool' ? boolCV(a.value) : PR(a.value);

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
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${checks}. ${label}${detail ? `: ${String(detail).slice(0, 600)}` : ''}`);
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
// read-only evals in one request; a failed eval returns { evalError }
async function evalMany(items) {
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ TenureExtend: { cause: 'Extended' } }, ...items.map(([cid, code]) => ({ Eval: [DEP, '', cid, code] }))] }));
  return items.map((_, i) => {
    const r = out.steps[i + 1];
    return r?.Eval && 'Ok' in r.Eval ? plain(deserializeCV(r.Eval.Ok)) : { evalError: JSON.stringify(r).slice(0, 200) };
  });
}
async function send(sender, cid, fn, args) {
  await retry(() => submitSimulationSteps(sid, { steps: [{ TenureExtend: { cause: 'Extended' } }] }));
  const r = await retry(() => callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 }));
  if (r.vmError || r.pcAborted) throw new Error(`ENGINE ${cid}.${fn}: ${JSON.stringify({ vm: r.vmError, pc: r.pcAborted })}`);
  return plain(deserializeCV(r.resultHex));
}

async function readSideState(side) {
  const band = P.ladderBandSide(side);
  const names = P.JING_RUNG_SETS.v1.bps.map((b) => P.rungName(side, b));
  const [owner, canonical, bandCount, maxBand, ...inits] = await evalMany([
    [LADDER, '(get-owner)'],
    [LADDER, `(get-canonical "${band}")`],
    [LADDER, `(get-band-count "${band}")`],
    [LADDER, '(get-max-band-per-side)'],
    ...names.map((n) => [`${DEP}.${n}`, '(var-get initialized)']),
  ]);
  return {
    ladderOwner: owner, canonical, bandCount: Number(bandCount), maxBand: Number(maxBand),
    rungs: names.map((name, i) => ({ name, bps: P.JING_RUNG_SETS.v1.bps[i], deployed: typeof inits[i] === 'boolean', initialized: inits[i] === true })),
  };
}

// the route's broadcast loop, as fork transactions: one nonce read, then +1
async function runRouteCalls(side, calls) {
  let nonce = Number(await retry(() => getNonce(sid, DEP)));
  const steps = [];
  for (const c of calls) {
    const tx = await makeUnsignedContractCall({
      contractAddress: c.contractAddress, contractName: c.contractName, functionName: c.functionName,
      functionArgs: c.args.map(toCV), nonce: nonce++, fee: P.JING_RUNG_INIT_FEE, network: 'mainnet', publicKey: '',
      postConditionMode: P.JING_RUNG_INIT_PC_MODE === 'deny' ? PostConditionMode.Deny : PostConditionMode.Allow, postConditions: [],
    });
    setSender(tx, DEP);
    steps.push({ Transaction: tx.serialize() });
  }
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ TenureExtend: { cause: 'Extended' } }, ...steps] }));
  calls.forEach((c, i) => {
    const t = out.steps[i + 1]?.Transaction?.Ok;
    const res = t ? cvToString(deserializeCV(t.result)) : JSON.stringify(out.steps[i + 1]).slice(0, 300);
    check(`${side}: ${c.contractName}.${c.functionName} ${c.args.map((a) => a.value).join(' ')} (same batch, nonce order)`,
      !!t && !t.vm_error && !t.post_condition_aborted && res === '(ok true)', res);
  });
}

async function main() {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(LADDER, '(get-owner)');
  sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);

  // ---- plan both sides from the pre-broadcast state: the sell run is
  // planned while the whole buy batch is still in the mempool ----
  const plans = {};
  for (const side of ['buy', 'sell']) {
    const band = P.ladderBandSide(side);
    const st = await readSideState(side);
    check(`${side}: all 10 rungs on chain at the fork tip, none initialized`, st.rungs.every((r) => r.deployed && !r.initialized), show(st.rungs.map((r) => [r.name, r.deployed, r.initialized])));
    check(`${side}: ladder owner = deployer, canonical unset, 0/${st.maxBand} seats`, st.ladderOwner === DEP && st.canonical === null && st.bandCount === 0 && st.maxBand === 10, show({ ...st, rungs: undefined }));
    plans[side] = P.planRungInit(side, st);
  }
  // the mempool as the Stacks API lists the pending buy batch (string-ascii
  // repr is the quoted value)
  const repr = (a) => a.type === 'ascii' ? `"${a.value}"` : a.type === 'uint' ? `u${a.value}` : a.type === 'principal' ? `'${a.value}` : String(a.value);
  const buyMempool = new Set(plans.buy.calls.map((c) => P.mempoolKey({ contract_id: `${c.contractAddress}.${c.contractName}`, function_name: c.functionName, function_args: c.args.map((a) => ({ repr: repr(a) })) })));
  plans.sell = P.dropPending(plans.sell, buyMempool);
  check('sell planned while buy set-canonical("buy-band") is pending keeps its own set-canonical("sel-band")', plans.sell.calls.length === 11 && plans.sell.calls[0].functionName === 'set-canonical' && plans.sell.calls[0].args[0].value === 'sel-band', show(plans.sell.skipped));
  const buyAgain = P.dropPending(plans.buy, buyMempool);
  check('a buy re-run while the buy batch is pending drops all 11 (no double broadcast)', buyAgain.calls.length === 0 && buyAgain.skipped.length === 11, show(buyAgain.skipped));

  for (const side of ['buy', 'sell']) {
    console.log(`\n=== ${side} side ===`);
    const band = P.ladderBandSide(side);
    const plan = plans[side];
    const want = [`${P.JING_LADDER}.set-canonical(${band},${DEP}.${P.rungName(side, 0)})`, ...P.JING_RUNG_SETS.v1.bps.map((b) => `${P.rungName(side, b)}.initialize(${b},true)`)];
    const got = plan.calls.map((c) => `${c.contractName}.${c.functionName}(${c.args.map((a) => a.value).join(',')})`);
    check(`${side}: route plan = set-canonical + 10 initialize, no blockers`, plan.blockers.length === 0 && show(got) === show(want), got.join(' | '));
  }
  // back to back: buy batch then sell batch, sequential deployer nonces
  await runRouteCalls('buy', plans.buy.calls);
  await runRouteCalls('sell', plans.sell.calls);

  for (const side of ['buy', 'sell']) {
    console.log(`\n=== ${side} side: state after both batches ===`);
    const band = P.ladderBandSide(side);

    const rungs = P.JING_RUNG_SETS.v1.bps.map((b) => `${DEP}.${P.rungName(side, b)}`);
    const reads = await evalMany([
      [LADDER, `(get-canonical "${band}")`],
      [LADDER, `(get-band-count "${band}")`],
      ...rungs.flatMap((r) => [[r, '(var-get initialized)'], [r, '(get-spread-bps)']]),
      ...rungs.map((r) => [LADDER, `(get-registered '${r})`]),
      ...P.JING_RUNG_SETS.v1.bps.map((b) => [LADDER, `(get-rung "${band}" u${b})`]),
      ...rungs.map((r) => [LADDER, side === 'buy' ? `(is-band-x '${r})` : `(is-band-y '${r})`]),
      [MARKET, side === 'buy' ? '(get-seated-x)' : '(get-seated-y)'],
    ]);
    let i = 0;
    check(`${side}: canonical ${band} = ${P.rungName(side, 0)}`, reads[i++] === `${DEP}.${P.rungName(side, 0)}`, show(reads[0]));
    check(`${side}: ladder band count = 10`, reads[i++] === 10n, show(reads[1]));
    const per = rungs.map((r, k) => ({ r, init: reads[i + 2 * k], bps: reads[i + 2 * k + 1] })); i += 2 * rungs.length;
    check(`${side}: every rung initialized with its own spread-bps`, per.every((x, k) => x.init === true && x.bps === BigInt(P.JING_RUNG_SETS.v1.bps[k])), show(per.map((x) => [x.r.split('.')[1], x.init, x.bps])));
    const reg = reads.slice(i, i + 10); i += 10;
    check(`${side}: ladder registered {side ${band}, price bps} for each`, reg.every((x, k) => x?.side === band && x?.price === BigInt(P.JING_RUNG_SETS.v1.bps[k])), show(reg));
    const seat = reads.slice(i, i + 10); i += 10;
    check(`${side}: ladder rung map (${band}, bps) -> rung, 10 seats`, seat.every((x, k) => x === rungs[k]), show(seat));
    const cur = reads.slice(i, i + 10); i += 10;
    check(`${side}: is-band-${side === 'buy' ? 'x' : 'y'} true for all 10`, cur.every((x) => x === true), show(cur));
    const seated = reads[i++];
    check(`${side}: market ${side === 'buy' ? 'seated-x' : 'seated-y'} = the 10 rungs in order`, show(seated) === show(rungs), show(seated));

    const again = P.planRungInit(side, await readSideState(side));
    check(`${side}: re-run plans nothing (idempotent), no blockers`, again.calls.length === 0 && again.blockers.length === 0 && again.skipped.length === 11, show(again.skipped));
    const r2 = await send(DEP, rungs[3], 'initialize', [uintCV(30), boolCV(true)]);
    check(`${side}: a second initialize is refused u7002`, r2?.err === 7002n, show(r2));
  }

  console.log('\n=== deposits after init ===');
  const [seatedX, seatedY] = await evalMany([[MARKET, '(get-seated-x)'], [MARKET, '(get-seated-y)']]);
  check('market still holds 10 seated-x and 10 seated-y after both sides', seatedX.length === 10 && seatedY.length === 10, `${seatedX.length}/${seatedY.length}`);
  const buy0 = `${DEP}.${P.rungName('buy', 0)}`, sell0 = `${DEP}.${P.rungName('sell', 0)}`;
  check('fund A with 10,000 sats', show(await send(WHALE.x, SBTC, 'transfer', [uintCV(10000), PR(WHALE.x), PR(UA), { type: 'none' }])) === show({ ok: true }));
  const raw = await makeUnsignedSTXTokenTransfer({ recipient: UB, amount: 10_000_000n, nonce: await retry(() => getNonce(sid, WHALE.y)), network: 'mainnet', publicKey: '', fee: 0 });
  setSender(raw, WHALE.y);
  const tOut = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] }));
  check('fund B with 10 STX', cvToString(deserializeCV(tOut.steps[0].Transaction.Ok.result)) === '(ok true)');
  const dA = await send(UA, buy0, 'deposit', [uintCV(1000)]);
  check('A deposits 1000 sats into jing-buy-stx-spread-0', dA?.ok?.amount === 1000n && dA.ok.shares > 0n, show(dA));
  const dB = await send(UB, sell0, 'deposit', [uintCV(1_000_000)]);
  check('B deposits 1 STX into jing-sell-stx-spread-0', dB?.ok?.amount === 1_000_000n && dB.ok.shares > 0n, show(dB));
  const [pA, pB, sA, sB] = await evalMany([[buy0, `(get-position '${UA})`], [sell0, `(get-position '${UB})`], [buy0, '(get-state)'], [sell0, '(get-state)']]);
  check('positions exist for A and B; each rung counts 1 member', !!pA && !!pB && sA.members === 1n && sB.members === 1n, show({ pA, pB, mA: sA.members, mB: sB.members }));

  console.log(`\n${passed}/${checks} checks green`);
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
}
main().catch((e) => { console.error(e.message ?? e); console.log(`${passed}/${checks} checks green`); process.exit(1); });
