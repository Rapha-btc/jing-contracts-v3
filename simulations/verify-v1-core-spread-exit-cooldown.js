// Fork only. Run: node simulations/verify-v1-core-spread-exit-cooldown.js
// Bounty mv8wal #3 (Violet Reed), fix 2bde226: the exit-path cancel in
// pull-to-held-sats (buy) / pull-to-held-ustx (sell) now sets
// escrow-cancelled-at, so the 24h push cooldown also follows that cancel.
// Reporter repro on the old code: https://stxer.xyz/simulations/mainnet/4b0441499891c215c8b4ade8ded3523a
//
// The fork is pinned before the live Jing v6-3 deploys (core-v6 9210837), so
// jing-core-v6, jing-ladder-v1 and markets-sbtc-stx-jing-v6-3 deploy from the
// working tree under their own names: the rungs name the market and the RFQ
// oracle as literals. Per side, two rungs on the same market:
//   jing-<dir>-stx-spread-20  the FIXED working-tree source
//   jing-<dir>-stx-spread-30  the source at 2bde226^ (old), the control
// (both seated; each initializes while its own hash is the side's canonical)
// Both sides of the book hold a non-crossing whale order, so every rung push
// becomes a pending escrow. Sequence per rung (the reporter's fixture 1):
//   1. A deposits 3 min -> pending; a keeper settles it -> live
//   2. B deposits 6 min -> a pending top-up next to the live deposit
//   3. A deposits min/2 while the pending is open -> held (market u1031)
//   4. A exits in full, no update: the gap leaves the market under its minimum,
//      so pull-to-held cancels the whole position (pending + live -> held)
//   5. old: escrow-cancelled-at stays u0, a keeper push re-locks B's funds as a
//      fresh pending, and B's exit without an update fails u7012
//      fixed: escrow-cancelled-at = the exit's block time, push-to-market
//      returns u7015 (ERR_ESCROW_COOLDOWN), push is (ok false) and holds, a
//      deposit is held, B exits from held with no oracle
//   6. fixed, 24h later: the cooldown gate is open; push-to-market now stops
//      at the next guard (miner band u7008) instead of u7015
// After AdvanceBlocks the fork serves no historical tenure data (any read of
// a real tenure is a BlockingError), so the RFQ native oracle reads u0 and a
// real push cannot land after the advance; the reporter's control hit the same
// limit. The u7015 -> u7008 change on the same held funds is the proof.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  noneCV, boolCV, deserializeCV, cvToString, getAddressFromPrivateKey,
  makeUnsignedSTXTokenTransfer, makeUnsignedContractDeploy, PostConditionMode,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, submitSimulationSteps, callContract, getNonce, setSender,
} from 'stxer';
import { fetchLazerUpdateAny } from './_lazer.js';

const NODE = 'http://77.42.3.101/stacks-api';
const FORK_BLOCK = Number(process.env.FORK_BLOCK ?? 9210830); // before jing-core-v6 (9210837)
const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const CORE = `${DEP}.jing-core-v6`;
const LADDER = `${DEP}.jing-ladder-v1`;
const MARKET = `${DEP}.markets-sbtc-stx-jing-v6-3`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALE = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR' };
const FIX = '2bde226';
const P_ = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const T = { x: P_(SBTC), y: P_(WSTX) };
const A = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const work = (f) => fs.readFileSync(new URL(`../contracts/${f}.clar`, import.meta.url), 'utf8');
const old = (f) => execFileSync('git', ['show', `${FIX}^:contracts/${f}.clar`], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
const keeper = mk(871);

class CErr extends Error {}
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
function eq(a, b) {
  if (typeof a === 'bigint' || typeof b === 'bigint') return typeof a === typeof b && a === b;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => eq(a[k], b[k]));
}
let passed = 0, checks = 0, sid;
function check(label, ok, detail = '') {
  checks++;
  if (ok) passed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${checks}. ${label}${detail ? `: ${String(detail).slice(0, 600)}` : ''}`);
  if (!ok) throw new CErr(`STOP at check ${checks} (${label}): https://stxer.xyz/simulations/mainnet/${sid}`);
}
async function retry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const m = String(e?.message ?? e);
      if (!(e instanceof CErr) && i < 8 && /ECONNRESET|fetch failed|socket hang|timed? ?out|HTTP 50[0234]\b|\b(502|503|504|429)\b(?!,)|ETIMEDOUT|EAI_AGAIN/i.test(m)) { console.log(`  retry after: ${m.slice(0, 120)}`); await new Promise((r) => setTimeout(r, 5000 * (i + 1))); continue; }
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
  if (r.vmError || r.pcAborted) throw new Error(`ENGINE ${cid}.${fn}: ${JSON.stringify({ vm: r.vmError, pc: r.pcAborted }).slice(0, 400)} https://stxer.xyz/simulations/mainnet/${sid}`);
  return { res: plain(deserializeCV(r.resultHex)), receipt: r.receipt };
}
async function txExpect(label, sender, cid, fn, args, want) {
  const r = await send(sender, cid, fn, args);
  check(label, typeof want === 'function' ? want(r.res) : eq(r.res, want), show(r.res));
  return r;
}
async function stxTransfer(from, to, amount) {
  const raw = await makeUnsignedSTXTokenTransfer({ recipient: to, amount, nonce: await retry(() => getNonce(sid, from)), network: 'mainnet', publicKey: '', fee: 0 });
  setSender(raw, from);
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] }));
  const t = out.steps[0]?.Transaction?.Ok;
  check(`stx transfer ${amount} -> ${to.slice(0, 10)}`, t && !t.vm_error && cvToString(deserializeCV(t.result)) === '(ok true)', JSON.stringify(out.steps[0]).slice(0, 200));
}
async function sbtcTransfer(from, to, amount) {
  await txExpect(`sbtc transfer ${amount} -> ${to.slice(0, 10)}`, from, SBTC, 'transfer', [uintCV(amount), P_(from), P_(to), noneCV()], { ok: true });
}
async function deploy(name, code, note = '') {
  const raw = await makeUnsignedContractDeploy({ contractName: name, codeBody: code, clarityVersion: ClarityVersion.Clarity5, nonce: await retry(() => getNonce(sid, DEP)), network: 'mainnet', publicKey: '', fee: 0, postConditionMode: PostConditionMode.Allow });
  setSender(raw, DEP);
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] }));
  const t = out.steps[0]?.Transaction?.Ok;
  check(`deploy ${name}${note}`, t && !t.vm_error && cvToString(deserializeCV(t.result)).startsWith('(ok'), JSON.stringify(out.steps[0]).slice(0, 300));
}
async function advance(bitcoinBlocks, stacksPer, secs) {
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: bitcoinBlocks, stacks_blocks_per_bitcoin: stacksPer, bitcoin_interval_secs: secs } }] }));
  check(`advance ${bitcoinBlocks}x${stacksPer} blocks, ${secs}s`, !!out.steps[0]?.AdvanceBlocks?.Ok, JSON.stringify(out.steps[0]).slice(-200));
}
function ladderPrints(receipt, rung) {
  return (receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.committed !== false && e.contract_event?.contract_identifier === LADDER)
    .map((e) => plain(deserializeCV(e.contract_event.raw_value)))
    .filter((p) => p?.rung === rung);
}

// ------------------------------------------------------------- rungs -----
function rung(dir, bps, fixed) {
  const buy = dir === 'buy', file = `jing-${dir}-stx-core-spread-v1`;
  return {
    dir, buy, bps: BigInt(bps), fixed, file, name: `jing-${dir}-stx-spread-${bps}`, id: `${DEP}.jing-${dir}-stx-spread-${bps}`,
    side: buy ? 'x' : 'y', band: buy ? 'buy-band' : 'sel-band', heldVar: buy ? 'held-sats' : 'held-ustx',
    min: buy ? 1000n : 1000000n, body: fixed ? work(file) : old(file),
  };
}
const RUNGS = [rung('buy', 20, true), rung('buy', 30, false), rung('sell', 20, true), rung('sell', 30, false)];
let UPD;
const upd = () => bufferCV(Buffer.from(UPD.hex.replace(/^0x/, ''), 'hex'));
const pBal = (r, who) => r.buy ? `(unwrap-panic (contract-call? '${SBTC} get-balance '${who}))` : `(stx-get-balance '${who})`;
const snap = (r) => evalIn(r.id, `{ held: (var-get ${r.heldVar}), cat: (var-get escrow-cancelled-at), now: stacks-block-time, mm: (miner-mid), paused: (var-get push-paused),
  gate: (>= stacks-block-time (+ (var-get escrow-cancelled-at) u86400)),
  live: (contract-call? '${MARKET} get-token-${r.side}-deposit (contract-call? '${MARKET} get-current-cycle) '${r.id}),
  parked: (contract-call? '${MARKET} get-token-${r.side}-parked '${r.id}),
  pend: (contract-call? '${MARKET} get-token-${r.side}-pending-deposit '${r.id}),
  bal: ${pBal(r, r.id)} }`);
const fund = (r, who, amt) => r.buy ? sbtcTransfer(WHALE.x, who, amt) : stxTransfer(WHALE.y, who, amt);
const walletOf = async (r, who) => evalIn(MARKET, pBal(r, who));

async function scenario(r, base) {
  const tag = `${r.name} (${r.fixed ? 'FIXED' : 'OLD 2bde226^'})`;
  console.log(`\n=== ${tag} ===`);
  const Am = mk(base + 1), Bm = mk(base + 2);
  for (const p of [Am, Bm]) await fund(r, p, r.min * 10n);
  const s0 = await snap(r);
  check(`${tag}: starts empty, miner band live, not paused, gate open`, s0.held === 0n && s0.live === 0n && s0.pend === null && s0.mm > 0n && !s0.paused && s0.gate && s0.cat === 0n, show(s0));

  await txExpect(`${tag} 1. A deposits 3 min (opposite side has a whale order) -> ok`, Am, r.id, 'deposit', [uintCV(r.min * 3n)], (v) => !!v.ok);
  let s = await snap(r);
  check(`${tag} 1. A's deposit is a pending escrow`, s.pend?.amount === r.min * 3n && s.held === 0n, show(s));
  await txExpect(`${tag} 1. keeper settles the young placement`, keeper, MARKET, `settle-token-${r.side}-deposit`, [P_(r.id), upd(), T[r.side], A[r.side]], (v) => !!v.ok);
  s = await snap(r);
  check(`${tag} 1. live ${r.min * 3n}, no pending`, s.live === r.min * 3n && s.pend === null, show(s));

  await txExpect(`${tag} 2. B deposits 6 min -> ok`, Bm, r.id, 'deposit', [uintCV(r.min * 6n)], (v) => !!v.ok);
  s = await snap(r);
  check(`${tag} 2. B's top-up is pending next to the live deposit`, s.pend?.amount === r.min * 6n && s.live === r.min * 3n && s.held === 0n, show(s));

  await txExpect(`${tag} 3. A deposits min/2 while the pending is open -> ok`, Am, r.id, 'deposit', [uintCV(r.min / 2n)], (v) => !!v.ok);
  s = await snap(r);
  check(`${tag} 3. the market refuses the push (u1031): min/2 held`, s.held === r.min / 2n && s.pend?.amount === r.min * 6n && s.live === r.min * 3n, show(s));

  const aBefore = await walletOf(r, Am), t0 = (await snap(r)).now;
  const ex = await txExpect(`${tag} 4. A exits in full with no update -> ok`, Am, r.id, 'withdraw', [uintCV(10n ** 15n), noneCV()], (v) => !!v.ok);
  const aAfter = await walletOf(r, Am);
  s = await snap(r);
  check(`${tag} 4. A paid 3.5 min; pull-to-held cancelled the whole market position (pending + live -> held 6 min)`,
    aAfter - aBefore === r.min * 7n / 2n && s.live === 0n && s.parked === 0n && s.pend === null && s.held === r.min * 6n && s.bal === r.min * 6n, `paid ${aAfter - aBefore} ${show(s)}`);
  const wp = ladderPrints(ex.receipt, r.id).find((p) => p.event === 'rung-withdraw');
  check(`${tag} 4. rung-withdraw print: amount 3.5 min, held 6 min`, wp?.amount === r.min * 7n / 2n && wp?.held === r.min * 6n, show(wp));

  if (!r.fixed) {
    check(`${tag} 5. OLD: escrow-cancelled-at stays u0, the push gate is open`, s.cat === 0n && s.gate === true, show(s));
    const pu = await txExpect(`${tag} 5. OLD: keeper push at once -> (ok true)`, keeper, r.id, 'push', [], { ok: true });
    s = await snap(r);
    check(`${tag} 5. OLD: B's 6 min re-locked as a fresh pending, nothing held`, s.pend?.amount === r.min * 6n && s.held === 0n, show(s));
    const pp = ladderPrints(pu.receipt, r.id).find((p) => p.event === 'rung-push');
    check(`${tag} 5. OLD: rung-push print pushed true`, pp?.pushed === true && pp?.amount === r.min * 6n, show(pp));
    await txExpect(`${tag} 5. OLD: B's exit without an update -> u7012 (the grief)`, Bm, r.id, 'withdraw', [uintCV(10n ** 15n), noneCV()], { err: 7012n });
    return;
  }

  const t1 = s.now;
  check(`${tag} 5. FIXED: escrow-cancelled-at is the exit's block time (${t0} <= cat <= ${t1}) and the gate is closed`, s.cat >= t0 && s.cat <= t1 && s.cat > 0n && s.gate === false, show(s));
  const cat = s.cat;
  const pm = await evalIn(r.id, `(push-to-market (var-get ${r.heldVar}))`);
  check(`${tag} 5. FIXED: push-to-market refuses with ERR_ESCROW_COOLDOWN (u7015), miner band live, not paused`, eq(pm, { err: 7015n }) && s.mm > 0n && !s.paused, show(pm));
  const pu = await txExpect(`${tag} 5. FIXED: keeper push during the cooldown -> (ok false)`, keeper, r.id, 'push', [], { ok: false });
  const pp = ladderPrints(pu.receipt, r.id).find((p) => p.event === 'rung-push');
  check(`${tag} 5. FIXED: rung-push print pushed false, held 6 min`, pp?.pushed === false && pp?.held === r.min * 6n, show(pp));
  s = await snap(r);
  check(`${tag} 5. FIXED: nothing re-locked: no pending, held 6 min, cat unchanged`, s.pend === null && s.live === 0n && s.held === r.min * 6n && s.cat === cat, show(s));
  await txExpect(`${tag} 5. FIXED: A deposits min during the cooldown -> ok`, Am, r.id, 'deposit', [uintCV(r.min)], (v) => !!v.ok);
  s = await snap(r);
  check(`${tag} 5. FIXED: that deposit is held too (no pending)`, s.pend === null && s.held === r.min * 7n, show(s));
  const bBefore = await walletOf(r, Bm);
  await txExpect(`${tag} 5. FIXED: B exits 1 min with no update -> ok (paid from held, no u7012)`, Bm, r.id, 'withdraw', [uintCV(r.min), noneCV()], (v) => !!v.ok);
  check(`${tag} 5. FIXED: B received 1 min`, (await walletOf(r, Bm)) - bBefore === r.min);
  s = await snap(r);
  check(`${tag} 5. FIXED: held 6 min, still no pending`, s.pend === null && s.held === r.min * 6n, show(s));
}

async function after24h(r) {
  const tag = `${r.name} (FIXED)`;
  const s = await snap(r);
  check(`${tag} 6. 24h after the cancel: gate open (now >= cat + 86400), held 6 min, no pending`, s.gate === true && s.now >= s.cat + 86400n && s.held === r.min * 6n && s.pend === null, show(s));
  // push-to-market asserts, in order: push-paused (u7014), cooldown (u7015),
  // miner band > 0 (u7008). The fork serves no tenure data after AdvanceBlocks
  // (miner-mid u0), so a push past the cooldown stops at the band guard.
  const pm = await evalIn(r.id, `(push-to-market (var-get ${r.heldVar}))`);
  check(`${tag} 6. push-to-market passes the cooldown and stops at the next guard, the miner band (u7008, mm ${s.mm}), not u7015`, eq(pm, { err: 7008n }) && s.mm === 0n && !s.paused, show(pm));
  const pu = await txExpect(`${tag} 6. keeper push after the cooldown -> (ok false) on the band guard only`, keeper, r.id, 'push', [], { ok: false });
  const pp = ladderPrints(pu.receipt, r.id).find((p) => p.event === 'rung-push');
  check(`${tag} 6. rung-push print pushed false, held 6 min`, pp?.pushed === false && pp?.held === r.min * 6n, show(pp));
}

async function main() {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE }).useBlockHeight(FORK_BLOCK);
  b.withSender(DEP).addContractDeploy({ contract_name: 'jing-core-v6', source_code: work('jing-core-v6'), clarity_version: ClarityVersion.Clarity5 });
  sid = await retry(() => b.run());
  console.log(`fork block ${FORK_BLOCK}\nView: https://stxer.xyz/simulations/mainnet/${sid}`);
  const first = (await getSimulationResult(sid)).steps.find((x) => x.Result?.Transaction);
  check('deploy jing-core-v6 (working tree)', !!first && cvToString(deserializeCV(first.Result.Transaction.Ok.result)).startsWith('(ok'), JSON.stringify(first).slice(0, 200));
  await deploy('jing-ladder-v1', work('jing-ladder-v1'));
  await deploy('markets-sbtc-stx-jing-v6-3', work('markets-sbtc-stx-jing-v6-3'));
  await txExpect('sync seats', DEP, MARKET, 'sync-seat-count', [], { ok: 10n });
  await txExpect('verify market', DEP, CORE, 'set-verified-contract', [P_(MARKET)], { ok: true });
  await txExpect('initialize market (min 1000 sats / 1 STX)', DEP, MARKET, 'initialize', [P_(MARKET), T.x, T.y, uintCV(1000), uintCV(1000000), uintCV(1), uintCV(45)], { ok: true });
  UPD = await retry(() => fetchLazerUpdateAny());
  const MID = UPD.px * 100000000n / UPD.py;
  console.log(`mid ${MID}`);
  for (const r of RUNGS) await deploy(r.name, r.body, r.fixed ? ' (FIXED working tree)' : ` (OLD ${FIX}^)`);
  const fixedHas = RUNGS.filter((r) => r.fixed).every((r) => (r.body.match(/\(var-set escrow-cancelled-at stacks-block-time\)/g) ?? []).length === 2);
  const oldHas = RUNGS.filter((r) => !r.fixed).every((r) => (r.body.match(/\(var-set escrow-cancelled-at stacks-block-time\)/g) ?? []).length === 1);
  check('sources: FIXED rungs write escrow-cancelled-at twice (settle-escrow + pull-to-held), OLD once', fixedHas && oldHas);
  for (const dir of ['buy', 'sell']) {
    const [f, o] = RUNGS.filter((r) => r.dir === dir);
    // the ladder registers a rung only while its code hash is the side's canonical
    await txExpect(`${o.name} (old) canonical for ${o.band}`, DEP, LADDER, 'set-canonical', [stringAsciiCV(o.band), P_(o.id)], { ok: true });
    await txExpect(`${o.name} initialize seated`, DEP, o.id, 'initialize', [uintCV(o.bps), boolCV(true)], { ok: true });
    await txExpect(`${f.name} (fixed) canonical for ${f.band}`, DEP, LADDER, 'set-canonical', [stringAsciiCV(f.band), P_(f.id)], { ok: true });
    await txExpect(`${f.name} initialize seated`, DEP, f.id, 'initialize', [uintCV(f.bps), boolCV(true)], { ok: true });
  }
  // whale orders on both sides that never cross a rung: every rung push turns pending
  await txExpect('whale sBTC ask at 2x mid (x side, book empty: direct)', WHALE.x, MARKET, 'deposit-token-x', [uintCV(10000), uintCV(MID * 2n), noneCV(), T.x, A.x], { ok: 10000n });
  await txExpect('whale STX bid at mid/2 (y side) -> ok', WHALE.y, MARKET, 'deposit-token-y', [uintCV(50_000_000), uintCV(MID / 2n), noneCV(), T.y, A.y], (v) => !!v.ok);
  await txExpect('settle the whale bid', keeper, MARKET, 'settle-token-y-deposit', [P_(WHALE.y), upd(), T.y, A.y], (v) => !!v.ok);
  const book = await evalIn(MARKET, `{ x: (len (get-token-x-depositors (get-current-cycle))), y: (len (get-token-y-depositors (get-current-cycle))) }`);
  check('both sides of the book hold the whale orders', book.x === 1n && book.y === 1n, show(book));

  let base = 400;
  for (const r of RUNGS) { await scenario(r, base); base += 10; }

  console.log('\n=== 24h later (17300 synthetic stacks blocks, 86500s) ===');
  await advance(1, 17300, 86500);
  for (const r of RUNGS.filter((x) => x.fixed)) await after24h(r);

  console.log(`\n${passed}/${checks} checks green`);
  console.log(`https://stxer.xyz/simulations/mainnet/${sid}`);
}
main().catch((e) => { console.error(e.message ?? e); console.log(`${passed}/${checks} checks green`); console.log(`https://stxer.xyz/simulations/mainnet/${sid}`); process.exit(1); });
