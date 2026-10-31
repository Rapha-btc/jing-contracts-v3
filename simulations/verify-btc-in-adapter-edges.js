// stxer mainnet-fork edge coverage for contracts/btc-in/jing-btc-in-adapter,
// on top of verify-btc-in-adapter.js (groups A-J). Same setup: the adapter and
// trait deployed fresh by the Jing deployer, LIVE routers / markets / smart buys.
// Every successful adapter path asserts the btc-in print EXACTLY (same keys,
// same values, nothing extra) and that it comes before the router's print.
//   K  atomicity: router min-out too high (STX u3002, USDCx u3002) and smart-buy
//      min-token-out too high revert the whole tx: no fee taken, nothing moved
//   L  boundaries: fee == max ok; fee == amount - 1 (net 1 sat: router keeps it
//      unsold, min-out 0 ok, min-out 1 -> u3002; smart buy spends the 1 sat);
//      amount 0 -> u4102; amount above balance (swap leg fails); balance below
//      the fee (fee leg fails, sBTC u1)
//   M  owner lifecycle: fee-recipient move, max-fee raise/lower, pause/unpause,
//      target revoke, set-owner hand-over (old owner u4100 on all 5 setters)
//   N  contract-caller guard: the owner via an intermediate contract -> u4100;
//      a contract owner works, and must guard itself
//   O  error precedence: paused > fee > max > fee >= amount > target approval
//   P  smart buy over every deployed *-smart-faktory (10)
//   Q  real signed txs, Originator mode, sBTC cap: USDCx path and smart buy
//      (cap == amount ok with exact deltas, amount - 1 aborts, nothing moves)
//   R  Lazer update age at the 80 s market window (runs LAST: it moves the
//      fork's clock with AdvanceBlocks). At block time = at1 + 80 the market
//      swap refuses u1 with u1003; the adapter call still succeeds with the
//      book leg skipped (jing-ok false, jing-in 0) and the pools take the net.
//      A second update one second newer (age < 80) fills the book at that
//      same block time.
// Run: node simulations/verify-btc-in-adapter-edges.js
import { readFileSync } from 'node:fs';
import {
  uintCV, noneCV, boolCV, someCV, bufferCV, stringAsciiCV, Pc, PostConditionMode, makeUnsignedContractCall, deserializeCV, cvToString,
} from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps, getNonce, setSender, callContract } from 'stxer';
import {
  NODE, DEP, SBTC, WSTX, WHALE, P_, mk, S, retry, sleep, check, must, show, tx, evalIn, call, deploy, prints, summary, Stop,
  setGroup, E, OK, sbtcBal, stxBal, freshUpd, stxTransfer, note, plain, blockTime,
} from './_yg-loop-common.js';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

const src = (f) => readFileSync(new URL(`../contracts/btc-in/${f}.clar`, import.meta.url), 'utf8');
const AD = `${DEP}.jing-btc-in-adapter`;
const PROXY = `${DEP}.btc-in-owner-proxy`;
const R_STX = `${DEP}.swap-router-sbtc-stx-jing-v5-5`;
const R_USD = `${DEP}.swap-router-sbtc-usdcx-jing-v5-5`;
const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const MKT_S = `${DEP}.markets-sbtc-stx-jing-v6-4`;
const SMART_ALL = ['pepe', 'welsh', 'b', 'mia', 'leo', 'flatearth', 'fakfun', 'lwb', 'rock', 'rock-smart-faktory-2']
  .map((n) => `${DEP}.${n.includes('faktory') ? n : `${n}-smart-faktory`}`);
const PEPE = SMART_ALL[0], NEVER = `${DEP}.b-smart-faktory`;
const BPS = 10_000n, HUGE = 10n ** 30n;
const USER = mk(7), FEE = mk(8), FEE2 = mk(9), STRANGER = mk(6), NEWOWNER = mk(2), PCU = mk(3), MAKER_S = mk(5);
const POOR = mk(23), TAKER = mk(34);
const usdcxBal = async (who) => (await evalIn(USDCX, `(get-balance '${who})`)).ok;
const sumLegs = (sw) => (sw['jing-in'] ?? 0n) + (sw['dlmm-in'] ?? 0n) + (sw['xyk-in'] ?? 0n) + (sw['velar-in'] ?? 0n) + (sw.unsold ?? 0n);

const LAZER_HDR = { headers: { 'x-api-key': 'jc_e4d2e10396eef95215a7afd492f42d743a3325739d29200c2a28b256f778be01' } };
async function usdcxMid() {
  const r = await fetch('https://faktory-dao-backend.vercel.app/api/auction/pyth-lazer-update?pair=sbtc-usdcx', LAZER_HDR);
  if (!r.ok) throw new Error(`backend lazer ${r.status}`);
  const d = (await r.json()).data;
  return BigInt(d.priceX) * 100000000n / BigInt(d.priceY);
}
const buf = (hex) => bufferCV(Buffer.from(hex.replace(/^0x/, ''), 'hex'));

// --- print checks (gap 9) ---
const canon = (o) => show(Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b))));
const btcIn = (receipt) => prints(receipt).filter((p) => p.event === 'btc-in');
function allPrints(receipt) {
  return (receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.committed !== false && e.contract_event)
    .map((e) => { try { return plain(deserializeCV(e.contract_event.raw_value)); } catch { return null; } });
}
function checkPrint(label, receipt, user, target, amount, fee, routerTopic) {
  const ev = btcIn(receipt);
  const want = { event: 'btc-in', user, target, amount, 'fee-sats': fee, 'net-sats': amount - fee };
  check(`${label}: btc-in print exact ${canon(want)}`, ev.length === 1 && canon(ev[0]) === canon(want), show(ev));
  if (routerTopic) {
    const ps = allPrints(receipt);
    const iB = ps.findIndex((p) => p?.event === 'btc-in'), iR = ps.findIndex((p) => p?.topic === routerTopic);
    const rp = ps[iR];
    check(`${label}: btc-in printed before the ${routerTopic} print, router saw user + net`, iB >= 0 && iR > iB && rp.user === user && rp.amount === amount - fee, `btc-in@${iB} router@${iR} ${show(rp && { user: rp.user, amount: rp.amount })}`);
  }
}

// every ft transfer in a receipt
function ftMoves(receipt) {
  return (receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.committed !== false && e.ft_transfer_event)
    .map((e) => ({ asset: e.ft_transfer_event.asset_identifier, sender: e.ft_transfer_event.sender, recipient: e.ft_transfer_event.recipient, amount: BigInt(e.ft_transfer_event.amount) }));
}

// snapshot of the balances a failed call must leave alone
async function snap(user, outBal) {
  return { u: await sbtcBal(user), f: await sbtcBal(FEE), f2: await sbtcBal(FEE2), o: outBal ? await outBal(user) : 0n, a: await sbtcBal(AD) };
}
async function unchanged(label, user, before, outBal) {
  const now = await snap(user, outBal);
  check(`${label}: nothing moved (user sBTC, fee-recipients, user output, adapter)`, canon(now) === canon(before), `${canon(before)} -> ${canon(now)}`);
}

// a call expected to fail, with the "nothing moved" proof
async function failing(label, sender, fn, args, want, outBal) {
  const b0 = await snap(sender, outBal);
  const r = await tx(label, sender, AD, fn, args, want);
  await unchanged(label, sender, b0, outBal);
  check(`${label}: no btc-in print committed`, btcIn(r.receipt).length === 0, show(btcIn(r.receipt)));
  return r;
}

// one adapter router swap with exact accounting + exact print
async function adapterSwap(label, fn, args, amount, fee, outBal, target, topic, { user = USER, feeTo = FEE } = {}) {
  const u0 = await sbtcBal(user), f0 = await sbtcBal(feeTo), o0 = await outBal(user), a0 = await sbtcBal(AD);
  const r = await tx(label, user, AD, fn, args, OK);
  const u1 = await sbtcBal(user), f1 = await sbtcBal(feeTo), o1 = await outBal(user), a1 = await sbtcBal(AD);
  const res = r.res?.ok ?? {}, sw = res.swap ?? {}, unsold = sw.unsold ?? 0n;
  check(`${label}: result fee-sats == ${fee}`, res['fee-sats'] === fee, show(res['fee-sats']));
  check(`${label}: fee-recipient +${fee} exactly`, f1 - f0 === fee, `${f1 - f0}`);
  check(`${label}: user sBTC out == amount - unsold`, u0 - u1 === amount - unsold, `${u0 - u1} (unsold ${unsold})`);
  check(`${label}: router legs add up to net ${amount - fee}`, sumLegs(sw) === amount - fee, show(sw));
  check(`${label}: output delta == router out`, o1 - o0 === sw.out, `${o1 - o0} vs ${show(sw.out)}`);
  check(`${label}: adapter holds no sBTC`, a0 === 0n && a1 === 0n, `${a0} -> ${a1}`);
  checkPrint(label, r.receipt, user, target, amount, fee, topic);
  return { r, res, sw, unsold, out: o1 - o0 };
}

// one smart buy with exact accounting + exact print
async function smartBuy(label, target, amount, fee, { user = USER, feeTo = FEE } = {}) {
  const u0 = await sbtcBal(user), f0 = await sbtcBal(feeTo);
  const r = await call(user, AD, 'smart-buy-with-sbtc', [P_(target), uintCV(amount), uintCV(fee), uintCV(1n)]);
  if (r.vm || r.res?.ok === undefined) return { ok: false, r };
  const sw = r.res.ok.swap;
  check(`${label}: ok, sbtc-amount == net ${amount - fee}, fee-sats ${fee}`, sw['sbtc-amount'] === amount - fee && r.res.ok['fee-sats'] === fee, show(r.res.ok));
  check(`${label}: user sBTC out == ${amount}, fee-recipient +${fee}`, u0 - (await sbtcBal(user)) === amount && (await sbtcBal(feeTo)) - f0 === fee);
  const toUser = ftMoves(r.receipt).filter((m) => m.recipient === user && !m.asset.startsWith(SBTC));
  check(`${label}: tokens landed in the user wallet`, toUser.some((m) => m.amount > 0n), show(toUser));
  check(`${label}: adapter holds no sBTC`, (await sbtcBal(AD)) === 0n);
  checkPrint(label, r.receipt, user, target, amount, fee);
  return { ok: true, r };
}

// a real signed (sender-overridden) contract call with post-conditions
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

async function advance(interval) {
  const out = await retry(() => submitSimulationSteps(S.sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: interval } }] }));
  const b = out.steps[0]?.AdvanceBlocks?.Ok;
  if (!b) throw new Error(`AdvanceBlocks failed: ${JSON.stringify(out.steps[0]).slice(0, 300)}`);
  return Number(b[b.length - 1].block_time);
}

const PROXY_SRC = `;; test-only: forwards owner setters, so contract-caller at the adapter is this contract
(define-public (p-set-owner (p principal)) (contract-call? .jing-btc-in-adapter set-owner p))
(define-public (p-set-fee-recipient (p principal)) (contract-call? .jing-btc-in-adapter set-fee-recipient p))
(define-public (p-set-max-fee-sats (n uint)) (contract-call? .jing-btc-in-adapter set-max-fee-sats n))
(define-public (p-set-paused (on bool)) (contract-call? .jing-btc-in-adapter set-paused on))
(define-public (p-set-target (t principal) (on bool)) (contract-call? .jing-btc-in-adapter set-target t on))
`;

try {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  if (process.env.H) b.useBlockHeight(Number(process.env.H));
  b.withSender(DEP).addEvalCode(SBTC, '(get-total-supply)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);

  setGroup('setup');
  await deploy(DEP, 'smart-buy-sbtc-trait', src('smart-buy-sbtc-trait'));
  await deploy(DEP, 'jing-btc-in-adapter', src('jing-btc-in-adapter'));
  await deploy(DEP, 'btc-in-owner-proxy', PROXY_SRC);
  for (const [who, amt] of [[USER, 4_000_000n], [FEE, 10_000n], [FEE2, 10_000n], [PCU, 1_000_000n], [TAKER, 200_000n]]) {
    const r = await call(WHALE.x, SBTC, 'transfer', [uintCV(amt), P_(WHALE.x), P_(who), noneCV()]);
    must(`fund ${who.slice(0, 8)} ${amt} sats`, r.res?.ok === true, show(r.res ?? r.vm));
  }
  must('POOR starts with 0 sBTC', (await sbtcBal(POOR)) === 0n);
  await tx('owner set-fee-recipient FEE', DEP, AD, 'set-fee-recipient', [P_(FEE)], { ok: true });
  await tx('owner set-max-fee-sats 3000', DEP, AD, 'set-max-fee-sats', [uintCV(3000n)], { ok: true });
  await tx('owner approve pepe', DEP, AD, 'set-target', [P_(PEPE), boolCV(true)], { ok: true });

  await freshUpd(true);
  const midS = S.MID, midU = await retry(usdcxMid);
  console.log(`  mids: sbtc-stx ${midS}, sbtc-usdcx ${midU}`);
  const argsS = (amt, fee, min = 1n) => [uintCV(amt), uintCV(fee), uintCV(midS * 9700n / BPS), noneCV(), uintCV(midS), uintCV(min)];
  const argsU = (amt, fee, min = 1n) => [uintCV(amt), uintCV(fee), uintCV(midU * 9700n / BPS), noneCV(), uintCV(midU), uintCV(min)];
  const TS = 'smart-swap-sbtc-for-stx', TU = 'smart-swap-sbtc-for-usdcx';

  setGroup('K atomicity: slippage aborts revert the fee');
  await failing('K1 sBTC->STX min-stx-out 10^30 -> u3002', USER, 'swap-sbtc-for-stx', argsS(100_000n, 2_000n, HUGE), E(3002), stxBal);
  await failing('K2 sBTC->USDCx min-usdcx-out 10^30 -> u3002', USER, 'swap-sbtc-for-usdcx', argsU(100_000n, 2_000n, HUGE), E(3002), usdcxBal);
  const k3 = await failing('K3 smart-buy pepe min-token-out 10^30 -> err', USER, 'smart-buy-with-sbtc', [P_(PEPE), uintCV(50_000n), uintCV(1_000n), uintCV(HUGE)], (v) => v?.err !== undefined);
  note(`K3 pepe-smart-faktory slippage error = ${show(k3.res ?? k3.vm)}`);
  await adapterSwap('K4 control: same STX swap with min-stx-out 1 succeeds', 'swap-sbtc-for-stx', argsS(100_000n, 2_000n), 100_000n, 2_000n, stxBal, R_STX, TS);

  setGroup('L boundaries');
  await adapterSwap('L1 fee == max-fee-sats 3000 (STX)', 'swap-sbtc-for-stx', argsS(100_000n, 3_000n), 100_000n, 3_000n, stxBal, R_STX, TS);
  await adapterSwap('L2 fee == max-fee-sats 3000 (USDCx)', 'swap-sbtc-for-usdcx', argsU(100_000n, 3_000n), 100_000n, 3_000n, usdcxBal, R_USD, TU);
  // net 1 sat: the router's dust rule keeps it unsold in the user's wallet
  const l3 = await adapterSwap('L3 fee == amount - 1 (2001 / 2000, net 1), min-stx-out 0', 'swap-sbtc-for-stx', argsS(2_001n, 2_000n, 0n), 2_001n, 2_000n, stxBal, R_STX, TS);
  check('L3 the 1 net sat stays unsold, out 0: user pays only the fee', l3.unsold === 1n && l3.out === 0n, show(l3.sw));
  await failing('L4 net 1 sat with min-stx-out 1 -> u3002 (fee reverted)', USER, 'swap-sbtc-for-stx', argsS(2_001n, 2_000n, 1n), E(3002), stxBal);
  await failing('L5 net 1 sat USDCx, min-usdcx-out 1 -> u3002', USER, 'swap-sbtc-for-usdcx', argsU(2_001n, 2_000n, 1n), E(3002), usdcxBal);
  await failing('L6 amount 0, fee 0 -> u4102', USER, 'swap-sbtc-for-stx', argsS(0n, 0n), E(4102), stxBal);
  // the smart buy has no dust rule: pepe spends the 1 net sat and pays out tokens
  const l7 = await smartBuy('L7 smart-buy pepe fee == amount - 1 (2001 / 2000, net 1 sat)', PEPE, 2_001n, 2_000n);
  check('L7 net-1-sat smart buy succeeds (the target accepts 1 sat)', l7.ok, show(l7.r?.res ?? l7.r?.vm));
  const bal = await sbtcBal(USER);
  const l8 = await failing(`L8 amount = balance + 1 (${bal + 1n}), fee 1000: router leg fails`, USER, 'swap-sbtc-for-stx', argsS(bal + 1n, 1_000n), (v) => v?.err !== undefined, stxBal);
  note(`L8 amount above balance -> ${show(l8.res ?? l8.vm)}`);
  const l9 = await failing('L9 amount = balance + 1, smart buy pepe: fails', USER, 'smart-buy-with-sbtc', [P_(PEPE), uintCV(bal + 1n), uintCV(1_000n), uintCV(1n)], (v) => v?.err !== undefined);
  note(`L9 smart buy above balance -> ${show(l9.res ?? l9.vm)}`);
  await failing('L10 balance 0 < fee 1000: the fee transfer fails -> u1 (sBTC)', POOR, 'swap-sbtc-for-stx', argsS(50_000n, 1_000n), E(1), stxBal);

  setGroup('M owner lifecycle');
  await tx('M1 set-fee-recipient FEE2', DEP, AD, 'set-fee-recipient', [P_(FEE2)], { ok: true });
  const fOld = await sbtcBal(FEE);
  await adapterSwap('M1 fee lands on FEE2', 'swap-sbtc-for-stx', argsS(50_000n, 1_234n), 50_000n, 1_234n, stxBal, R_STX, TS, { feeTo: FEE2 });
  check('M1 old fee-recipient got nothing', (await sbtcBal(FEE)) === fOld);
  await tx('M1 set-fee-recipient back to FEE', DEP, AD, 'set-fee-recipient', [P_(FEE)], { ok: true });
  await tx('M2 raise max-fee-sats to 10000', DEP, AD, 'set-max-fee-sats', [uintCV(10_000n)], { ok: true });
  await adapterSwap('M2 fee 9000 now accepted', 'swap-sbtc-for-stx', argsS(100_000n, 9_000n), 100_000n, 9_000n, stxBal, R_STX, TS);
  await tx('M3 lower max-fee-sats to 100', DEP, AD, 'set-max-fee-sats', [uintCV(100n)], { ok: true });
  await failing('M3 fee 101 > new max 100 -> u4101', USER, 'swap-sbtc-for-stx', argsS(50_000n, 101n), E(4101), stxBal);
  await adapterSwap('M3 fee 100 == new max accepted', 'swap-sbtc-for-stx', argsS(50_000n, 100n), 50_000n, 100n, stxBal, R_STX, TS);
  await tx('M3 restore max-fee-sats 3000', DEP, AD, 'set-max-fee-sats', [uintCV(3000n)], { ok: true });
  await tx('M4 pause', DEP, AD, 'set-paused', [boolCV(true)], { ok: true });
  await failing('M4 paused USDCx swap -> u4104', USER, 'swap-sbtc-for-usdcx', argsU(50_000n, 500n), E(4104), usdcxBal);
  await tx('M4 unpause', DEP, AD, 'set-paused', [boolCV(false)], { ok: true });
  await adapterSwap('M4 swaps restored after unpause (USDCx)', 'swap-sbtc-for-usdcx', argsU(50_000n, 500n), 50_000n, 500n, usdcxBal, R_USD, TU);
  const m5 = await smartBuy('M5 pepe approved: buy fills', PEPE, 30_000n, 500n);
  check('M5 pepe buy filled', m5.ok, show(m5.r?.res ?? m5.r?.vm));
  await tx('M5 set-target pepe false', DEP, AD, 'set-target', [P_(PEPE), boolCV(false)], { ok: true });
  check('M5 is-approved-target pepe == false', (await evalIn(AD, `(is-approved-target '${PEPE})`)) === false);
  await failing('M5 revoked pepe -> u4103', USER, 'smart-buy-with-sbtc', [P_(PEPE), uintCV(30_000n), uintCV(500n), uintCV(1n)], E(4103));
  await tx('M5 re-approve pepe', DEP, AD, 'set-target', [P_(PEPE), boolCV(true)], { ok: true });
  await tx('M6 set-owner NEWOWNER', DEP, AD, 'set-owner', [P_(NEWOWNER)], { ok: true });
  check('M6 get-config owner == NEWOWNER', (await evalIn(AD, '(get-config)')).owner === NEWOWNER);
  await tx('M6 old owner set-owner -> u4100', DEP, AD, 'set-owner', [P_(DEP)], E(4100));
  await tx('M6 old owner set-fee-recipient -> u4100', DEP, AD, 'set-fee-recipient', [P_(DEP)], E(4100));
  await tx('M6 old owner set-max-fee-sats -> u4100', DEP, AD, 'set-max-fee-sats', [uintCV(1n)], E(4100));
  await tx('M6 old owner set-paused -> u4100', DEP, AD, 'set-paused', [boolCV(true)], E(4100));
  await tx('M6 old owner set-target -> u4100', DEP, AD, 'set-target', [P_(PEPE), boolCV(false)], E(4100));
  await tx('M6 new owner set-fee-recipient FEE2', NEWOWNER, AD, 'set-fee-recipient', [P_(FEE2)], { ok: true });
  await tx('M6 new owner set-max-fee-sats 4000', NEWOWNER, AD, 'set-max-fee-sats', [uintCV(4000n)], { ok: true });
  await tx('M6 new owner set-paused true', NEWOWNER, AD, 'set-paused', [boolCV(true)], { ok: true });
  await tx('M6 new owner set-target welsh true', NEWOWNER, AD, 'set-target', [P_(SMART_ALL[1]), boolCV(true)], { ok: true });
  const c6 = await evalIn(AD, '(get-config)');
  check('M6 config reflects the new owner\'s writes', canon(c6) === canon({ owner: NEWOWNER, 'fee-recipient': FEE2, 'max-fee-sats': 4000n, paused: true }) && (await evalIn(AD, `(is-approved-target '${SMART_ALL[1]})`)) === true, show(c6));
  await tx('M6 new owner restores: unpause', NEWOWNER, AD, 'set-paused', [boolCV(false)], { ok: true });
  await tx('M6 new owner restores: fee-recipient FEE', NEWOWNER, AD, 'set-fee-recipient', [P_(FEE)], { ok: true });
  await tx('M6 new owner restores: max 3000', NEWOWNER, AD, 'set-max-fee-sats', [uintCV(3000n)], { ok: true });
  await tx('M6 new owner hands back: set-owner DEP', NEWOWNER, AD, 'set-owner', [P_(DEP)], { ok: true });
  await tx('M6 NEWOWNER no longer owner -> u4100', NEWOWNER, AD, 'set-paused', [boolCV(true)], E(4100));

  setGroup('N contract-caller guard');
  const cfgN = await evalIn(AD, '(get-config)');
  await tx('N1 owner via proxy: set-owner -> u4100', DEP, PROXY, 'p-set-owner', [P_(STRANGER)], E(4100));
  await tx('N1 owner via proxy: set-fee-recipient -> u4100', DEP, PROXY, 'p-set-fee-recipient', [P_(STRANGER)], E(4100));
  await tx('N1 owner via proxy: set-max-fee-sats -> u4100', DEP, PROXY, 'p-set-max-fee-sats', [uintCV(1n)], E(4100));
  await tx('N1 owner via proxy: set-paused -> u4100', DEP, PROXY, 'p-set-paused', [boolCV(true)], E(4100));
  await tx('N1 owner via proxy: set-target -> u4100', DEP, PROXY, 'p-set-target', [P_(NEVER), boolCV(true)], E(4100));
  check('N1 config unchanged', canon(await evalIn(AD, '(get-config)')) === canon(cfgN) && (await evalIn(AD, `(is-approved-target '${NEVER})`)) === false);
  await tx('N2 set-owner to the proxy contract', DEP, AD, 'set-owner', [P_(PROXY)], { ok: true });
  await tx('N2 deployer direct now -> u4100', DEP, AD, 'set-paused', [boolCV(true)], E(4100));
  await tx('N2 proxy (contract owner) set-max-fee-sats 3500 ok', DEP, PROXY, 'p-set-max-fee-sats', [uintCV(3500n)], { ok: true });
  await tx('N2 an unguarded contract owner forwards ANY caller (stranger) ok', STRANGER, PROXY, 'p-set-max-fee-sats', [uintCV(3000n)], { ok: true });
  await tx('N2 proxy hands back: set-owner DEP', DEP, PROXY, 'p-set-owner', [P_(DEP)], { ok: true });
  check('N2 owner back to deployer, max 3000', (await evalIn(AD, '(get-config)')).owner === DEP && (await evalIn(AD, '(get-config)'))['max-fee-sats'] === 3000n);

  setGroup('O error precedence');
  await failing('O1 fee > max AND unapproved target -> u4101 (fee checks run first)', USER, 'smart-buy-with-sbtc', [P_(NEVER), uintCV(50_000n), uintCV(3_001n), uintCV(1n)], E(4101));
  await failing('O2 fee >= amount AND unapproved -> u4102', USER, 'smart-buy-with-sbtc', [P_(NEVER), uintCV(1_000n), uintCV(1_000n), uintCV(1n)], E(4102));
  await failing('O3 fee > max AND fee >= amount -> u4101', USER, 'swap-sbtc-for-stx', argsS(3_001n, 3_001n), E(4101), stxBal);
  await tx('O pause', DEP, AD, 'set-paused', [boolCV(true)], { ok: true });
  await failing('O4 paused AND unapproved -> u4104', USER, 'smart-buy-with-sbtc', [P_(NEVER), uintCV(50_000n), uintCV(1_000n), uintCV(1n)], E(4104));
  await failing('O5 paused AND fee > max -> u4104', USER, 'swap-sbtc-for-stx', argsS(50_000n, 3_001n), E(4104), stxBal);
  await failing('O6 paused AND fee >= amount -> u4104', USER, 'swap-sbtc-for-usdcx', argsU(1_000n, 1_000n), E(4104), usdcxBal);
  await failing('O7 paused, approved pepe smart-buy -> u4104', USER, 'smart-buy-with-sbtc', [P_(PEPE), uintCV(50_000n), uintCV(1_000n), uintCV(1n)], E(4104));
  await tx('O unpause', DEP, AD, 'set-paused', [boolCV(false)], { ok: true });

  setGroup('P smart buy over every deployed *-smart-faktory');
  const filled = [], refused = [];
  for (const t of SMART_ALL) {
    const name = t.split('.')[1];
    await tx(`P approve ${name}`, DEP, AD, 'set-target', [P_(t), boolCV(true)], { ok: true });
    const b0 = await snap(USER);
    const r = await smartBuy(`P ${name}`, t, 30_000n, 500n);
    if (r.ok) { filled.push(name); continue; }
    const raw = await retry(() => callContract(S.sid, { sender: USER, contract: AD, functionName: 'smart-buy-with-sbtc', functionArgs: [P_(t), uintCV(30_000n), uintCV(500n), uintCV(1n)], fee: 0 }));
    refused.push(`${name}: ${raw.resultHex ? cvToString(deserializeCV(raw.resultHex)) : ''} ${raw.vmError ?? ''}`);
    await unchanged(`P ${name} refused by the target`, USER, b0);
    check(`P ${name}: refusal came from the target, not an adapter guard`, !(r.r.res?.err >= 4100n && r.r.res?.err <= 4104n), show(r.r.res ?? r.r.vm));
  }
  note(`P filled (${filled.length}/${SMART_ALL.length}): ${filled.join(', ')}`);
  for (const x of refused) note(`P refused: ${x}`);
  check('P pepe and welsh fill (liquid targets)', filled.includes('pepe-smart-faktory') && filled.includes('welsh-smart-faktory'), filled.join(','));

  setGroup('Q signed txs, Originator, sBTC cap (USDCx + smart buy)');
  const capPc = (n) => [Pc.principal(PCU).willSendLte(n).ft(SBTC, 'sbtc-token')];
  const qU = [uintCV(100_000n), uintCV(1_000n), uintCV(midU * 9700n / BPS), noneCV(), uintCV(midU), uintCV(1n)];
  let b0 = await snap(PCU, usdcxBal);
  const q1 = await signedCall(PCU, AD, 'swap-sbtc-for-usdcx', qU, capPc(99_999n));
  check('Q1 USDCx cap = amount - 1: post-condition aborts', q1.pcAborted === true, show({ pc: q1.pcAborted, vm: q1.vm }));
  await unchanged('Q1', PCU, b0, usdcxBal);
  b0 = await snap(PCU, usdcxBal);
  const q2 = await signedCall(PCU, AD, 'swap-sbtc-for-usdcx', qU, capPc(100_000n));
  check('Q2 USDCx cap = amount: ok, no abort', !q2.pcAborted && !q2.vm && q2.res?.ok !== undefined, show({ res: q2.res, vm: q2.vm }));
  {
    const sw = q2.res?.ok?.swap ?? {}, now = await snap(PCU, usdcxBal);
    check('Q2 PCU sBTC out == 100000 - unsold, FEE +1000, USDCx delta == out', b0.u - now.u === 100_000n - (sw.unsold ?? 0n) && now.f - b0.f === 1_000n && now.o - b0.o === sw.out && sw.out > 0n, `${b0.u - now.u} / ${now.f - b0.f} / ${now.o - b0.o} vs ${show(sw.out)}`);
    checkPrint('Q2', q2.receipt, PCU, R_USD, 100_000n, 1_000n, TU);
  }
  b0 = await snap(PCU);
  const q3 = await signedCall(PCU, AD, 'smart-buy-with-sbtc', [P_(PEPE), uintCV(50_000n), uintCV(1_000n), uintCV(1n)], capPc(49_999n));
  check('Q3 smart buy cap = amount - 1: aborts', q3.pcAborted === true, show({ pc: q3.pcAborted, vm: q3.vm }));
  await unchanged('Q3', PCU, b0);
  b0 = await snap(PCU);
  const q4 = await signedCall(PCU, AD, 'smart-buy-with-sbtc', [P_(PEPE), uintCV(50_000n), uintCV(1_000n), uintCV(1n)], capPc(50_000n));
  check('Q4 smart buy cap = amount: ok', !q4.pcAborted && !q4.vm && q4.res?.ok !== undefined, show({ res: q4.res, vm: q4.vm }));
  {
    const now = await snap(PCU);
    check('Q4 PCU sBTC out == 50000 exactly, FEE +1000', b0.u - now.u === 50_000n && now.f - b0.f === 1_000n, `${b0.u - now.u} / ${now.f - b0.f}`);
    check('Q4 tokens landed with PCU', ftMoves(q4.receipt).some((m) => m.recipient === PCU && !m.asset.startsWith(SBTC) && m.amount > 0n), show(ftMoves(q4.receipt)));
    checkPrint('Q4', q4.receipt, PCU, PEPE, 50_000n, 1_000n);
  }

  setGroup('R Lazer age at the 80 s market window (moves the clock, runs last)');
  await freshUpd(true);
  await stxTransfer(WHALE.y, MAKER_S, 5_001_000_000n);
  await tx('R0 maker deposit-token-y 5000 STX at mid', MAKER_S, MKT_S, 'deposit-token-y', [uintCV(5_000_000_000n), uintCV(S.MID), noneCV(), P_(WSTX), stringAsciiCV('wstx')], OK);
  if ((await evalIn(MKT_S, `(get-token-y-pending-deposit '${MAKER_S})`)) !== null) {
    await freshUpd(true);
    await tx('R0 settle the maker\'s pending bid', DEP, MKT_S, 'settle-token-y-deposit', [P_(MAKER_S), buf(S.UPD.hex), P_(WSTX), stringAsciiCV('wstx')], OK);
  }
  const cyc = await evalIn(MKT_S, '(get-current-cycle)');
  must('R0 maker bid rests on the book', (await evalIn(MKT_S, `(get-token-y-deposit u${cyc} '${MAKER_S})`)) > 0n);
  // two updates: u1, then u2 at least one second newer
  const bt0 = await blockTime();
  let u1 = null, u2 = null;
  for (let i = 0; i < 60 && !u2; i++) {
    const u = await retry(() => fetchLazerUpdateAny()), t = await retry(() => lazerFeedTimes(u.hex));
    const v = { ...u, at: t.at, mid: u.px * 100000000n / u.py };
    if (!u1) { if (v.at > bt0) u1 = v; } else if (v.at > u1.at) u2 = v;
    if (!u2) await sleep(1000);
  }
  must('R0 two Lazer updates, u2 newer than u1', u1 && u2 && u2.at > u1.at, show({ u1: u1?.at, u2: u2?.at, bt0 }));
  console.log(`  u1 at ${u1.at}, u2 at ${u2.at} (block time ${bt0})`);
  const capR = await evalIn(MKT_S, `(get-taker-capacity u${u1.mid} u${u1.mid * 9700n / BPS} true '${USER} (some 0x${u1.hex.replace(/^0x/, '')}))`);
  check('R0 fresh u1: the book has capacity for the taker', capR['gross-cap'] > 0n, show(capR));
  // synthetic block time = previous burn time + interval: step once to learn the base, then land on at1 + 80
  const base = await advance(1);
  const target = u1.at + 80;
  const btR = await advance(target - base);
  check(`R0 block time now u1.at + 80 (${target})`, btR === target && (await blockTime()) === target, `${btR} / ${await blockTime()}`);
  const ageU2 = target - u2.at;
  // direct market swap with u1 (TAKER): the exact refusal
  const rm = await call(TAKER, MKT_S, 'swap', [uintCV(50_000n), uintCV(u1.mid * 9700n / BPS), buf(u1.hex), P_(SBTC), stringAsciiCV('sbtc-token'), P_(WSTX), stringAsciiCV('wstx'), boolCV(true)]);
  check('R1 market swap with u1 at age 80 -> err u1003 (ERR_STALE_PRICE)', rm.res?.err === 1003n, show(rm.res ?? rm.vm));
  const mk0 = await sbtcBal(MAKER_S);
  const R2 = await adapterSwap('R2 adapter swap, update = some(u1) at age 80', 'swap-sbtc-for-stx',
    [uintCV(200_000n), uintCV(2_000n), uintCV(u1.mid * 9700n / BPS), someCV(buf(u1.hex)), uintCV(u1.mid), uintCV(1n)], 200_000n, 2_000n, stxBal, R_STX, TS);
  const rp2 = allPrints(R2.r.receipt).find((p) => p?.topic === TS);
  check('R2 book leg skipped, not reverted: jing-ok false, jing-in 0, pools took the net', R2.sw['jing-ok'] === false && R2.sw['jing-in'] === 0n && R2.out > 0n, show(R2.sw));
  note(`R2 router jing-cap at age 80 = ${show(rp2?.['jing-cap'])} (sized, then the market refused the stale print)`);
  check('R2 maker untouched (no book fill)', (await sbtcBal(MAKER_S)) === mk0);
  const R3 = await adapterSwap(`R3 same block time, update = some(u2) at age ${ageU2} (< 80)`, 'swap-sbtc-for-stx',
    [uintCV(200_000n), uintCV(2_000n), uintCV(u2.mid * 9700n / BPS), someCV(buf(u2.hex)), uintCV(u2.mid), uintCV(1n)], 200_000n, 2_000n, stxBal, R_STX, TS);
  check('R3 the book leg fills (jing-ok, jing-in > 0)', R3.sw['jing-ok'] === true && R3.sw['jing-in'] > 0n, show(R3.sw));
  // the live book may hold other bids ahead of MAKER_S, so prove the book got
  // the sBTC from the receipt rather than from one maker's balance
  const toBook = ftMoves(R3.r.receipt).filter((m) => m.asset.startsWith(SBTC) && m.sender === USER && m.recipient !== FEE);
  check('R3 the user\'s net sBTC went to the Jing market / its makers (no pool)', toBook.reduce((a, m) => a + m.amount, 0n) === R3.sw['jing-in'] && toBook.every((m) => m.recipient === MKT_S || !m.recipient.includes('.')), show(toBook));
  note(`R3 MAKER_S sBTC delta ${(await sbtcBal(MAKER_S)) - mk0} (other live bids may rank ahead)`);
  const btR4 = await advance(80);
  const R4 = await adapterSwap(`R4 one more block (+80 s): u2 at age ${btR4 - u2.at}`, 'swap-sbtc-for-stx',
    [uintCV(100_000n), uintCV(1_000n), uintCV(u2.mid * 9700n / BPS), someCV(buf(u2.hex)), uintCV(u2.mid), uintCV(1n)], 100_000n, 1_000n, stxBal, R_STX, TS);
  check('R4 old update far past the window: book skipped, swap settles on the pools', R4.sw['jing-ok'] === false && R4.sw['jing-in'] === 0n && R4.out > 0n, show(R4.sw));
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(`EXC ${e.message}`); }
}
summary();
