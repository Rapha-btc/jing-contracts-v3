// stxer mainnet-fork proof: contracts/btc-in/jing-btc-in-adapter (+ smart-buy-sbtc-trait).
// Deployed fresh by the Jing deployer (so `.smart-buy-sbtc-trait` resolves),
// calling the LIVE routers swap-router-sbtc-stx-jing-v5-5 /
// swap-router-sbtc-usdcx-jing-v5-5 and a LIVE *-smart-faktory. `update` = none,
// as in the bridged BTC flow (signed before the BTC confirms).
//   A  config defaults + owner setters (non-owner -> u4100)
//   B  sBTC -> STX: fee to fee-recipient, net into the router, exact deltas, print
//   C  sBTC -> USDCx: same
//   D  smart buy: approved target fills, unapproved -> u4103
//   E  fee 0 (no fee transfer, swap still runs)
//   F  guards: fee > max -> u4101, fee >= amount -> u4102, paused -> u4104
//   G  Jing book leg, sBTC/STX: a maker rests an STX bid on the LIVE
//      markets-sbtc-stx-jing-v6-4; the adapter swap carries update =
//      some(fresh Lazer) ("deferred": signed after the sBTC lands) -> jing-in > 0
//   H  Jing book leg, sBTC/USDCx: same on the LIVE markets-sbtc-usdcx-jing-v6-4
//   I  presigned fallback: update = none and a stale (reused) update still settle
//   J  real signed txs + an sBTC FT PC on the user capped at amount. Swaps
//      run in SIP-040 Originator mode (what the FE's swapPcMode() signs):
//      cap == amount -> ok; cap == amount - 1 -> post-condition abort, nothing
//      moves. Strict Deny is shown to abort even at cap == amount: on Stacks
//      3.4 Deny also covers what the pools move, which a swap cannot enumerate.
// Owner hand-over is two-step (propose-owner, then accept-owner by the new
// owner); the relays the adapter's rung entry points name are deployed first.
// Run: node simulations/verify-btc-in-adapter.js
import { readFileSync } from 'node:fs';
import {
  uintCV, noneCV, boolCV, someCV, bufferCV, stringAsciiCV, Pc, PostConditionMode, makeUnsignedContractCall,
  deserializeCV, cvToString,
} from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps, getNonce, setSender } from 'stxer';
import {
  NODE, DEP, SBTC, WSTX, WHALE, P_, mk, S, retry, sleep, check, must, show, tx, evalIn, call, deploy, prints, summary, Stop,
  setGroup, E, OK, sbtcBal, stxBal, freshUpd, updCV, stxTransfer,
} from './_yg-loop-common.js';
import { lazerFeedTimes } from './_lazer.js';

const src = (f) => readFileSync(new URL(`../contracts/btc-in/${f}.clar`, import.meta.url), 'utf8');
const csrc = (f) => readFileSync(new URL(`../contracts/${f}.clar`, import.meta.url), 'utf8');
const AD = `${DEP}.jing-btc-in-adapter`;
const R_STX = `${DEP}.swap-router-sbtc-stx-jing-v5-5`;
const R_USD = `${DEP}.swap-router-sbtc-usdcx-jing-v5-5`;
const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const USDC_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ';
const MKT_S = `${DEP}.markets-sbtc-stx-jing-v6-4`, MKT_U = `${DEP}.markets-sbtc-usdcx-jing-v6-4`;
const MAKER_S = mk(5), MAKER_U = mk(4), PCU = mk(3);
const SMART = [`${DEP}.pepe-smart-faktory`, `${DEP}.welsh-smart-faktory`];
const BPS = 10_000n;
const USER = mk(7), FEE = mk(8), STRANGER = mk(6);
const usdcxBal = async (who) => (await evalIn(USDCX, `(get-balance '${who})`)).ok;

// sBTC/USDCx mid (feeds 1/7) from the faktory-dao Lazer route, as verify-router-sbtc-usdcx-v5-5.mjs
async function usdcxMid() {
  const r = await fetch('https://faktory-dao-backend.vercel.app/api/auction/pyth-lazer-update?pair=sbtc-usdcx', { headers: { 'x-api-key': 'jc_e4d2e10396eef95215a7afd492f42d743a3325739d29200c2a28b256f778be01' } });
  if (!r.ok) throw new Error(`backend lazer ${r.status}`);
  const d = (await r.json()).data;
  return BigInt(d.priceX) * 100000000n / BigInt(d.priceY);
}

// a fresh sBTC/USDCx (feeds 1/7) Lazer update newer than the sim block time
async function freshUsdcx() {
  const bt = Number(await evalIn(MKT_U, 'stacks-block-time'));
  for (let i = 0; i < 40; i++) {
    const r = await fetch('https://faktory-dao-backend.vercel.app/api/auction/pyth-lazer-update?pair=sbtc-usdcx', { headers: { 'x-api-key': 'jc_e4d2e10396eef95215a7afd492f42d743a3325739d29200c2a28b256f778be01' } });
    if (!r.ok) throw new Error(`backend lazer ${r.status}`);
    const d = (await r.json()).data;
    const hex = d.hex.replace(/^0x/, ''), t = await retry(() => lazerFeedTimes(hex, [1, 7]));
    if (t.at > bt) return { hex, at: t.at, mid: BigInt(d.priceX) * 100000000n / BigInt(d.priceY) };
    await sleep(3000);
  }
  throw new Error('no fresh [1,7] update');
}
const buf = (hex) => bufferCV(Buffer.from(hex.replace(/^0x/, ''), 'hex'));

// A maker rests a y-side (STX / USDCx) bid at the mid on a live market; when
// the market parks it pending, settle it with a print signed after the submit.
async function restBid(tag, mkt, maker, ty, ay, amount, mid, freshFn) {
  await tx(`${tag}: maker deposit-token-y ${amount} at mid ${mid}`, maker, mkt, 'deposit-token-y', [uintCV(amount), uintCV(mid), noneCV(), P_(ty), stringAsciiCV(ay)], OK);
  if ((await evalIn(mkt, `(get-token-y-pending-deposit '${maker})`)) !== null) {
    const u = await freshFn();
    await tx(`${tag}: settle the maker's pending bid`, DEP, mkt, 'settle-token-y-deposit', [P_(maker), buf(u.hex), P_(ty), stringAsciiCV(ay)], OK);
  }
  const cyc = await evalIn(mkt, '(get-current-cycle)');
  const resting = await evalIn(mkt, `(get-token-y-deposit u${cyc} '${maker})`);
  must(`${tag}: maker bid rests on the book`, resting > 0n, show(resting));
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
  return { result: cvToString(deserializeCV(t.result)), pcAborted: !!t.post_condition_aborted, vm: t.vm_error ?? null };
}

// every ft transfer in a receipt, as { asset, sender, recipient, amount }
function ftMoves(receipt) {
  return (receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.committed !== false && e.ft_transfer_event)
    .map((e) => ({ asset: e.ft_transfer_event.asset_identifier, sender: e.ft_transfer_event.sender, recipient: e.ft_transfer_event.recipient, amount: BigInt(e.ft_transfer_event.amount) }));
}
const btcIn = (receipt) => prints(receipt).filter((p) => p.event === 'btc-in');
// sBTC the market paid out in a receipt to makers (anyone but the taker): the
// book leg crosses whichever live bids are best, not only the test maker's
const makerPaid = (receipt, mkt, taker) => ftMoves(receipt).filter((m) => m.asset.startsWith(SBTC) && m.sender === mkt && m.recipient !== taker)
  .reduce((a, m) => a + m.amount, 0n);

// one adapter swap with exact accounting; returns the call + deltas
async function adapterSwap(label, fn, args, amount, fee, outBal, target) {
  const u0 = await sbtcBal(USER), f0 = await sbtcBal(FEE), o0 = await outBal(USER), a0 = await sbtcBal(AD);
  const r = await tx(label, USER, AD, fn, args, OK);
  const u1 = await sbtcBal(USER), f1 = await sbtcBal(FEE), o1 = await outBal(USER), a1 = await sbtcBal(AD);
  const res = r.res?.ok ?? {}, sw = res.swap ?? {};
  const unsold = sw.unsold ?? 0n;
  check(`${label}: result fee-sats == ${fee}`, res['fee-sats'] === fee, show(res['fee-sats']));
  check(`${label}: fee-recipient got exactly fee-sats`, f1 - f0 === fee, `${f1 - f0}`);
  check(`${label}: user sBTC out == fee + net - unsold (post-condition total <= amount)`, u0 - u1 === fee + (amount - fee) - unsold && u0 - u1 <= amount, `${u0 - u1} (unsold ${unsold})`);
  check(`${label}: output landed in the user wallet`, o1 - o0 > 0n && (sw.out === undefined || o1 - o0 === sw.out), `${o1 - o0} vs out ${show(sw.out)}`);
  check(`${label}: adapter holds no sBTC`, a0 === 0n && a1 === 0n, `${a0} -> ${a1}`);
  const ev = btcIn(r.receipt);
  check(`${label}: one btc-in print with user/target/amount/fee/net`, ev.length === 1 && ev[0].user === USER && ev[0].target === target && ev[0].amount === amount && ev[0]['fee-sats'] === fee && ev[0]['net-sats'] === amount - fee, show(ev));
  return { r, res, sw, unsold, out: o1 - o0 };
}

try {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  if (process.env.H) b.useBlockHeight(Number(process.env.H));
  b.withSender(DEP).addEvalCode(SBTC, '(get-total-supply)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);

  setGroup('setup');
  await deploy(DEP, 'smart-buy-sbtc-trait', src('smart-buy-sbtc-trait'));
  // relays are LIVE on mainnet since 2026-10-30 (faktory-dao 1fcd8dfd): use them, no redeploy
  await deploy(DEP, 'jing-btc-in-adapter', src('jing-btc-in-adapter'));
  const r0 = await call(WHALE.x, SBTC, 'transfer', [uintCV(2_000_000n), P_(WHALE.x), P_(USER), noneCV()]);
  must('fund user 0.02 sBTC', r0.res?.ok === true, show(r0.res ?? r0.vm));
  const r1 = await call(WHALE.x, SBTC, 'transfer', [uintCV(10_000n), P_(WHALE.x), P_(FEE), noneCV()]);
  must('fund fee-recipient 10k sats (non-zero start)', r1.res?.ok === true, show(r1.res ?? r1.vm));

  setGroup('A config + owner');
  const cfg = await evalIn(AD, '(get-config)');
  check('defaults: owner = fee-recipient = deployer, no pending owner, max 5000, not paused', cfg.owner === DEP && cfg['pending-owner'] === null && cfg['fee-recipient'] === DEP && cfg['max-fee-sats'] === 5000n && cfg.paused === false, show(cfg));
  check('no target approved by default', (await evalIn(AD, `(is-approved-target '${SMART[0]})`)) === false);
  await tx('non-owner set-fee-recipient -> u4100', STRANGER, AD, 'set-fee-recipient', [P_(STRANGER)], E(4100));
  await tx('non-owner set-max-fee-sats -> u4100', STRANGER, AD, 'set-max-fee-sats', [uintCV(1n)], E(4100));
  await tx('non-owner set-target -> u4100', STRANGER, AD, 'set-target', [P_(SMART[0]), boolCV(true)], E(4100));
  await tx('non-owner set-paused -> u4100', STRANGER, AD, 'set-paused', [boolCV(true)], E(4100));
  await tx('non-owner propose-owner -> u4100', STRANGER, AD, 'propose-owner', [P_(STRANGER)], E(4100));
  await tx('accept-owner with nothing proposed -> u4100', STRANGER, AD, 'accept-owner', [], E(4100));
  await tx('owner set-fee-recipient FEE', DEP, AD, 'set-fee-recipient', [P_(FEE)], { ok: true });
  await tx('owner set-max-fee-sats 3000', DEP, AD, 'set-max-fee-sats', [uintCV(3000n)], { ok: true });
  for (const t of SMART) await tx(`owner set-target ${t.split('.')[1]} true`, DEP, AD, 'set-target', [P_(t), boolCV(true)], { ok: true });
  const cfg2 = await evalIn(AD, '(get-config)');
  check('config after setters', cfg2['fee-recipient'] === FEE && cfg2['max-fee-sats'] === 3000n && cfg2.paused === false, show(cfg2));
  check('targets approved', (await evalIn(AD, `(is-approved-target '${SMART[0]})`)) === true && (await evalIn(AD, `(is-approved-target '${SMART[1]})`)) === true);

  setGroup('B sBTC -> STX via router v5-5');
  await freshUpd();
  const midS = S.MID;
  const argsS = (amt, fee) => [uintCV(amt), uintCV(fee), uintCV(midS * 9700n / BPS), noneCV(), uintCV(midS), uintCV(1n)];
  const B = await adapterSwap('B1 swap-sbtc-for-stx 200k sats, fee 2000', 'swap-sbtc-for-stx', argsS(200_000n, 2_000n), 200_000n, 2_000n, stxBal, R_STX);
  check('B1 router got net (jing-in + dlmm-in + xyk-in + velar-in + unsold == net)', (B.sw['jing-in'] ?? 0n) + (B.sw['dlmm-in'] ?? 0n) + (B.sw['xyk-in'] ?? 0n) + (B.sw['velar-in'] ?? 0n) + B.unsold === 198_000n, show(B.sw));
  check('B1 STX price sane (within 3% of mid)', B.out * 10n ** 10n / (198_000n - B.unsold) * 10000n / midS > 9700n, `${B.out} uSTX for ${198_000n - B.unsold} sats; mid ${midS}`);

  setGroup('C sBTC -> USDCx via router v5-5');
  const midU = await retry(usdcxMid);
  console.log(`  sbtc-usdcx mid ${midU}`);
  const argsU = (amt, fee) => [uintCV(amt), uintCV(fee), uintCV(midU * 9700n / BPS), noneCV(), uintCV(midU), uintCV(1n)];
  const C = await adapterSwap('C1 swap-sbtc-for-usdcx 100k sats, fee 1500', 'swap-sbtc-for-usdcx', argsU(100_000n, 1_500n), 100_000n, 1_500n, usdcxBal, R_USD);
  check('C1 router got net', (C.sw['jing-in'] ?? 0n) + (C.sw['dlmm-in'] ?? 0n) + (C.sw['xyk-in'] ?? 0n) + (C.sw['velar-in'] ?? 0n) + C.unsold === 98_500n, show(C.sw));

  setGroup('D smart buy (fak.fun token)');
  let bought = 0;
  for (const t of SMART) {
    const name = t.split('.')[1];
    const u0 = await sbtcBal(USER), f0 = await sbtcBal(FEE);
    const r = await call(USER, AD, 'smart-buy-with-sbtc', [P_(t), uintCV(50_000n), uintCV(1_000n), uintCV(1n)]);
    if (r.vm || r.res?.ok === undefined) { check(`D1 ${name}: smart buy through the adapter`, false, show(r.res ?? r.vm)); continue; }
    const u1 = await sbtcBal(USER), f1 = await sbtcBal(FEE);
    const res = r.res.ok, sw = res.swap;
    check(`D1 ${name}: ok, token-out > 0, sbtc-amount == net 49000`, sw['token-out'] > 0n && sw['sbtc-amount'] === 49_000n, show(res));
    check(`D1 ${name}: fee-recipient got 1000`, f1 - f0 === 1_000n, `${f1 - f0}`);
    check(`D1 ${name}: user sBTC out == 50000 exactly`, u0 - u1 === 50_000n, `${u0 - u1}`);
    const toUser = ftMoves(r.receipt).filter((m) => m.recipient === USER && !m.asset.startsWith(SBTC));
    check(`D1 ${name}: tokens landed in the user wallet (ft transfer to user)`, toUser.length > 0 && toUser.some((m) => m.amount > 0n), show(toUser));
    const ev = btcIn(r.receipt);
    check(`D1 ${name}: btc-in print target = ${name}`, ev.length === 1 && ev[0].target === t && ev[0]['net-sats'] === 49_000n, show(ev));
    bought++;
  }
  check('D1 both live smart-faktory contracts (pepe + welsh) filled through the one trait', bought === SMART.length, `${bought}/${SMART.length}`);
  await tx('D2 unapproved target (welsh revoked) -> u4103', DEP, AD, 'set-target', [P_(SMART[1]), boolCV(false)], { ok: true });
  const u0 = await sbtcBal(USER), f0 = await sbtcBal(FEE);
  await tx('D2 smart-buy via unapproved welsh-smart-faktory -> u4103', USER, AD, 'smart-buy-with-sbtc', [P_(SMART[1]), uintCV(50_000n), uintCV(1_000n), uintCV(1n)], E(4103));
  check('D2 nothing moved (fee rolled back too)', (await sbtcBal(USER)) === u0 && (await sbtcBal(FEE)) === f0);
  await tx('D3 smart-buy via a never-approved contract (b-smart-faktory) -> u4103', USER, AD, 'smart-buy-with-sbtc', [P_(`${DEP}.b-smart-faktory`), uintCV(50_000n), uintCV(1_000n), uintCV(1n)], E(4103));

  setGroup('E fee 0');
  await freshUpd();
  const midS2 = S.MID;
  const f0e = await sbtcBal(FEE);
  const Ez = await adapterSwap('E1 swap-sbtc-for-stx 50k sats, fee 0', 'swap-sbtc-for-stx', [uintCV(50_000n), uintCV(0n), uintCV(midS2 * 9700n / BPS), noneCV(), uintCV(midS2), uintCV(1n)], 50_000n, 0n, stxBal, R_STX);
  check('E1 no sBTC transfer to fee-recipient in the receipt', !ftMoves(Ez.r.receipt).some((m) => m.recipient === FEE), show(ftMoves(Ez.r.receipt)));
  check('E1 fee-recipient balance unchanged', (await sbtcBal(FEE)) === f0e);

  setGroup('F guards');
  const g0 = await sbtcBal(USER);
  await tx('F1 fee 3001 > max 3000 -> u4101', USER, AD, 'swap-sbtc-for-stx', argsS(100_000n, 3_001n), E(4101));
  await tx('F2 fee == max 3000 accepted (boundary)', USER, AD, 'swap-sbtc-for-stx', argsS(100_000n, 3_000n), OK);
  const g1 = await sbtcBal(USER);
  await tx('F3 fee == amount -> u4102', USER, AD, 'swap-sbtc-for-usdcx', argsU(2_000n, 2_000n), E(4102));
  await tx('F4 fee > amount -> u4102', USER, AD, 'swap-sbtc-for-usdcx', argsU(1_000n, 2_000n), E(4102));
  await tx('F5 smart-buy fee > max -> u4101', USER, AD, 'smart-buy-with-sbtc', [P_(SMART[0]), uintCV(50_000n), uintCV(9_999n), uintCV(1n)], E(4101));
  await tx('owner set-paused true', DEP, AD, 'set-paused', [boolCV(true)], { ok: true });
  await tx('F6 paused: swap-sbtc-for-stx -> u4104', USER, AD, 'swap-sbtc-for-stx', argsS(100_000n, 1_000n), E(4104));
  await tx('F7 paused: swap-sbtc-for-usdcx -> u4104', USER, AD, 'swap-sbtc-for-usdcx', argsU(100_000n, 1_000n), E(4104));
  await tx('F8 paused: smart-buy -> u4104', USER, AD, 'smart-buy-with-sbtc', [P_(SMART[0]), uintCV(50_000n), uintCV(1_000n), uintCV(1n)], E(4104));
  check('F guards: only F2 moved sBTC', (await sbtcBal(USER)) === g1 && g0 - g1 > 0n, `${g0} -> ${g1} -> ${await sbtcBal(USER)}`);
  await tx('owner set-paused false', DEP, AD, 'set-paused', [boolCV(false)], { ok: true });
  await tx('owner propose-owner -> STRANGER', DEP, AD, 'propose-owner', [P_(STRANGER)], { ok: true });
  check('pending-owner = STRANGER, owner still deployer', (await evalIn(AD, '(get-config)'))['pending-owner'] === STRANGER && (await evalIn(AD, '(get-config)')).owner === DEP);
  await tx('proposed only: old owner still works (set-paused false)', DEP, AD, 'set-paused', [boolCV(false)], { ok: true });
  await tx('proposed only: STRANGER not yet owner -> u4100', STRANGER, AD, 'set-paused', [boolCV(true)], E(4100));
  await tx('USER (not proposed) accept-owner -> u4100', USER, AD, 'accept-owner', [], E(4100));
  await tx('STRANGER accept-owner', STRANGER, AD, 'accept-owner', [], { ok: true });
  check('owner = STRANGER, pending cleared', (await evalIn(AD, '(get-config)')).owner === STRANGER && (await evalIn(AD, '(get-config)'))['pending-owner'] === null);
  await tx('old owner now refused -> u4100', DEP, AD, 'set-paused', [boolCV(true)], E(4100));
  await tx('new owner accepted', STRANGER, AD, 'set-paused', [boolCV(false)], { ok: true });
  check('adapter never holds sBTC', (await sbtcBal(AD)) === 0n);
  // the rest runs under the new owner STRANGER; adapter config is unchanged

  setGroup('G Jing book leg, sBTC/STX (deferred: fresh update)');
  await freshUpd(true);
  await stxTransfer(WHALE.y, MAKER_S, 5_001_000_000n);
  await restBid('G0', MKT_S, MAKER_S, WSTX, 'wstx', 5_000_000_000n, S.MID, async () => { await freshUpd(true); return S.UPD; });
  await freshUpd(true);
  const mG = S.MID;
  const cap = await evalIn(MKT_S, `(get-taker-capacity u${mG} u${mG * 9700n / BPS} true '${USER} (some 0x${S.UPD.hex.replace(/^0x/, '')}))`);
  console.log(`  book capacity for the taker at the limit: ${show(cap)}`);
  const mkS0 = await sbtcBal(MAKER_S);
  const G = await adapterSwap('G1 swap-sbtc-for-stx 200k sats, fee 2000, update = some(fresh)', 'swap-sbtc-for-stx',
    [uintCV(200_000n), uintCV(2_000n), uintCV(mG * 9700n / BPS), someCV(updCV()), uintCV(mG), uintCV(1n)], 200_000n, 2_000n, stxBal, R_STX);
  check('G1 the book leg filled (jing-ok, jing-in > 0)', G.sw['jing-ok'] === true && G.sw['jing-in'] > 0n, show(G.sw));
  check('G1 legs add up to net 198000', G.sw['jing-in'] + G.sw['dlmm-in'] + G.sw['xyk-in'] + G.sw['velar-in'] + G.unsold === 198_000n, show(G.sw));
  const pg = makerPaid(G.r.receipt, MKT_S, USER);
  check('G1 book makers were paid in sBTC: jing-in less the market fee (0 < paid <= jing-in, within 50 bps)', pg > 0n && pg <= G.sw['jing-in'] && (G.sw['jing-in'] - pg) * BPS <= G.sw['jing-in'] * 50n, `${pg} vs ${G.sw['jing-in']} (test maker got ${(await sbtcBal(MAKER_S)) - mkS0})`);

  setGroup('H Jing book leg, sBTC/USDCx (deferred: fresh update)');
  const uh = await freshUsdcx();
  const r2 = await call(USDC_WHALE, USDCX, 'transfer', [uintCV(500_000_000n), P_(USDC_WHALE), P_(MAKER_U), noneCV()]);
  must('fund maker 500 USDCx', r2.res?.ok === true, show(r2.res ?? r2.vm));
  await stxTransfer(WHALE.y, MAKER_U, 10_000_000n);
  await restBid('H0', MKT_U, MAKER_U, USDCX, 'usdcx-token', 500_000_000n, uh.mid, freshUsdcx);
  const uh2 = await freshUsdcx();
  const mkU0 = await sbtcBal(MAKER_U);
  const Hh = await adapterSwap('H1 swap-sbtc-for-usdcx 100k sats, fee 1500, update = some(fresh)', 'swap-sbtc-for-usdcx',
    [uintCV(100_000n), uintCV(1_500n), uintCV(uh2.mid * 9700n / BPS), someCV(buf(uh2.hex)), uintCV(uh2.mid), uintCV(1n)], 100_000n, 1_500n, usdcxBal, R_USD);
  check('H1 the book leg filled (jing-ok, jing-in > 0)', Hh.sw['jing-ok'] === true && Hh.sw['jing-in'] > 0n, show(Hh.sw));
  check('H1 legs add up to net 98500', Hh.sw['jing-in'] + Hh.sw['dlmm-in'] + Hh.sw['xyk-in'] + Hh.sw['velar-in'] + Hh.unsold === 98_500n, show(Hh.sw));
  const ph = makerPaid(Hh.r.receipt, MKT_U, USER);
  check('H1 book makers were paid in sBTC: jing-in less the market fee (0 < paid <= jing-in, within 50 bps)', ph > 0n && ph <= Hh.sw['jing-in'] && (Hh.sw['jing-in'] - ph) * BPS <= Hh.sw['jing-in'] * 50n, `${ph} vs ${Hh.sw['jing-in']} (test maker got ${(await sbtcBal(MAKER_U)) - mkU0})`);

  setGroup('I presigned fallback (no / stale update)');
  await freshUpd(true);
  const stale = S.UPD, mI = S.MID;
  const I1 = await adapterSwap('I1 swap-sbtc-for-stx 50k sats, fee 500, update = none (presigned)', 'swap-sbtc-for-stx',
    [uintCV(50_000n), uintCV(500n), uintCV(mI * 9700n / BPS), noneCV(), uintCV(mI), uintCV(1n)], 50_000n, 500n, stxBal, R_STX);
  check('I1 settles without the book leg', I1.sw['jing-in'] === 0n && I1.out > 0n, show(I1.sw));
  // the same Lazer bytes again: now not newer than the market's stored print
  const r3 = await call(USER, AD, 'swap-sbtc-for-stx', [uintCV(50_000n), uintCV(500n), uintCV(mI * 9700n / BPS), someCV(buf(stale.hex)), uintCV(mI), uintCV(1n)]);
  console.log(`  I2 reused (stale) update -> ${show(r3.res ?? r3.vm)}`);
  check('I2 reused (stale) update: still settles through the pools or fails cleanly (no VM error)', !r3.vm && (r3.res?.ok !== undefined || r3.res?.err !== undefined), show(r3.res ?? r3.vm));
  if (r3.res?.ok) check('I2 stale update did not fill on the book', r3.res.ok.swap['jing-in'] === 0n || r3.res.ok.swap['jing-ok'] === true, show(r3.res.ok.swap));

  setGroup('J post-conditions on signed txs (Originator + Deny)');
  const fr = await call(WHALE.x, SBTC, 'transfer', [uintCV(300_000n), P_(WHALE.x), P_(PCU), noneCV()]);
  must('fund PC user 300k sats', fr.res?.ok === true, show(fr.res ?? fr.vm));
  await freshUpd(true);
  const mJ = S.MID;
  const jArgs = (amt) => [uintCV(amt), uintCV(1_000n), uintCV(mJ * 9700n / BPS), noneCV(), uintCV(mJ), uintCV(1n)];
  const capPc = (n) => [Pc.principal(PCU).willSendLte(n).ft(SBTC, 'sbtc-token')];
  const d0 = await sbtcBal(PCU);
  const j0 = await signedCall(PCU, AD, 'swap-sbtc-for-stx', jArgs(100_000n), capPc(100_000n), PostConditionMode.Deny);
  check('J0 strict Deny, cap = amount: aborts on the pools\' unlisted moves (why swaps sign Originator)', j0.pcAborted === true && /was moved by .* but not checked/.test(j0.vm ?? ''), show(j0));
  check('J0 nothing moved', (await sbtcBal(PCU)) === d0);
  const p0 = await sbtcBal(PCU), q0 = await sbtcBal(FEE), s0 = await stxBal(PCU);
  const j1 = await signedCall(PCU, AD, 'swap-sbtc-for-stx', jArgs(100_000n), capPc(99_999n));
  check('J1 cap = amount - 1: post-condition aborts', j1.pcAborted === true, show(j1));
  check('J1 nothing moved (user sBTC, fee-recipient, user STX)', (await sbtcBal(PCU)) === p0 && (await sbtcBal(FEE)) === q0 && (await stxBal(PCU)) === s0);
  const j2 = await signedCall(PCU, AD, 'swap-sbtc-for-stx', jArgs(100_000n), capPc(100_000n));
  check('J2 cap = amount: ok, no abort', j2.pcAborted === false && !j2.vm && j2.result.startsWith('(ok'), show(j2));
  check('J2 user sBTC out == 100000 exactly, fee-recipient +1000, STX received', p0 - (await sbtcBal(PCU)) === 100_000n && (await sbtcBal(FEE)) - q0 === 1_000n && (await stxBal(PCU)) > s0,
    `${p0 - (await sbtcBal(PCU))} / ${(await sbtcBal(FEE)) - q0}`);
  const j3 = await signedCall(PCU, AD, 'smart-buy-with-sbtc', [P_(SMART[0]), uintCV(50_000n), uintCV(1_000n), uintCV(1n)], capPc(49_999n));
  check('J3 smart buy, cap = amount - 1: aborts', j3.pcAborted === true, show(j3));
  const j4 = await signedCall(PCU, AD, 'smart-buy-with-sbtc', [P_(SMART[0]), uintCV(50_000n), uintCV(1_000n), uintCV(1n)], capPc(50_000n));
  check('J4 smart buy, cap = amount: ok', j4.pcAborted === false && !j4.vm && j4.result.startsWith('(ok'), show(j4));
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(`EXC ${e.message}`); }
}
summary();
