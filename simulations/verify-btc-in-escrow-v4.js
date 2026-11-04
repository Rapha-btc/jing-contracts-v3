// stxer mainnet-fork proof for the deposit-keyed BTC-in escrow (deploy bytes in
// simulations/deploy-bytes-btc-in-escrow-v4/, commented source
// contracts/btc-in/jing-btc-in-escrow-v2.clar), deployed on the fork as
// SPV9K21….jing-btc-in-escrow-v4 next to the LIVE routers v5-5 / markets v6-4.
// Adapted from verify-btc-in-escrow-v2.js (df2b9d1). What is new in v4:
//   arm-swap-sbtc-for-{stx,usdcx} take (txid, vout) of a REAL completed sBTC
//   deposit; the amount is read from sbtc-registry get-completed-deposit;
//   u4215 no deposit, u4216 tx-sender != deposit recipient, u4217 deposit used.
//   One orders map keyed {txid, vout} with status u0 open / u1 executed /
//   u2 cancelled, never deleted; execute / cancel need status open (u4205).
// Arms are signed as the real deposit recipients (stxer sets the sender).
//   P  the real deposits read back from the registry on the fork
//   A  config defaults (no last-id), keeper
//   B  arm STX + USDCx with the exact minted amount: deltas, parked, get-order
//      status u0, armed print exact (incl. txid / vout / amount / fee-sats)
//   U  second arm of a used deposit u4217 (same + other route, both users)
//   N  non-recipient u4216; unknown txid / wrong vout / reversed bytes / short
//      buffer u4215; arm-by passed u4213; paused u4203; fee > max u4201;
//      slippage u4207; recipient without the sBTC -> sBTC u1 and the deposit
//      is NOT burned (armable later)
//   C  execute STX (book bid resting): status u1, parked -net, user gets out;
//      execute twice u4205; cancel an executed order u4205
//   D  execute USDCx
//   I  cancel before cancel-height u4206; after -> refund, status u2; execute /
//      cancel again u4205; re-arm a cancelled deposit u4217
//   W  sweep-sbtc of a donation ok, into parked u4212, order untouched
//   K  execute at / past cancel-height u4211, order stays open, cancel refunds
//   G  real signed arm (Deny mode, sBTC cap == amount ok, amount - 1 aborts)
// Run: node simulations/verify-btc-in-escrow-v4.js
import { readFileSync } from 'node:fs';
import {
  uintCV, boolCV, bufferCV, stringAsciiCV, noneCV, Pc, PostConditionMode, makeUnsignedContractCall, deserializeCV,
} from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps, getNonce, setSender } from 'stxer';
import {
  NODE, DEP, SBTC, WSTX, WHALE, P_, mk, S, retry, sleep, check, must, show, tx, evalIn, call, deploy, summary, Stop,
  setGroup, E, OK, sbtcBal, stxBal, freshUpd, stxTransfer, note, plain,
} from './_yg-loop-common.js';
import { lazerFeedTimes } from './_lazer.js';

const SRC = readFileSync(process.env.ESC_SRC || new URL('./deploy-bytes-btc-in-escrow-v4/jing-btc-in-escrow-v4.clar', import.meta.url), 'utf8');
const ESC_NAME = process.env.ESC_NAME || 'jing-btc-in-escrow-v4';
const ESC = `${DEP}.${ESC_NAME}`;
const REG = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-registry';
const R_STX = `${DEP}.swap-router-sbtc-stx-jing-v5-5`, R_USD = `${DEP}.swap-router-sbtc-usdcx-jing-v5-5`;
const MKT_S = `${DEP}.markets-sbtc-stx-jing-v6-4`, MKT_U = `${DEP}.markets-sbtc-usdcx-jing-v6-4`;
const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const USDC_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ';
const BPS = 10_000n;
const ARM_BY = 10n ** 12n, AB = uintCV(ARM_BY);
const FEE = mk(8), STRANGER = mk(6), KEEPER = mk(9), MAKER_S = mk(5), MAKER_U = mk(4);
const LAZER_HDR = { headers: { 'x-api-key': 'jc_e4d2e10396eef95215a7afd492f42d743a3325739d29200c2a28b256f778be01' } };

// real completed sBTC deposits (txid in display order, as the registry keys
// it), both recipients previously used jing-btc-in-escrow-v3 / the adapter
const RB = 'SP1RB1V65A1PAAXYT8PVFFFC6T1FN9E8RQX7HMDKC', HB = 'SP34HBPH4EHPVW0NSXBCV5Z27FAGTC62RV5Y9Y9MR';
const DEPS = {
  A: { txid: 'a705ab967c6989005dad4c54b32dc509149ec3ca3f940a9a34daef605cdaeb61', vout: 0n, amount: 12_371n, user: RB },
  B: { txid: 'bf43a59476999c6f66d0cf1a8a1890ca5ccb2c34f24b574078adfa18be044a85', vout: 0n, amount: 11_380n, user: HB },
  C: { txid: '2ef22fb04bd29943119cdc9efaf6ca2082f3e3652816baf076ff990df6d9849b', vout: 0n, amount: 14_004n, user: HB },
  D: { txid: 'e07b3fa93c82612d3f5b01af675d9ad6bbc974b77df72c7cd72ff3d3162a4152', vout: 0n, amount: 13_678n, user: HB },
  E: { txid: '5a2510ced4829cb7e3d11b0fb6b631bd89217c738bca4c3a67f07f4d71de1080', vout: 0n, amount: 14_025n, user: HB },
};

const hx = (v) => String(v ?? '').replace(/^0x/, '').toLowerCase();
const buf = (hex) => bufferCV(Buffer.from(hx(hex), 'hex'));
const kArgs = (d) => [buf(d.txid), uintCV(d.vout)];
const norm = (o) => o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'txid' ? hx(v) : v])) : o;
const canon = (o) => show(Object.fromEntries(Object.entries(norm(o) ?? {}).sort(([a], [b]) => a.localeCompare(b))));
const usdcxBal = async (who) => (await evalIn(USDCX, `(get-balance '${who})`)).ok;
const height = async () => Number(await evalIn(MKT_S, 'stacks-block-height'));
const parked = async () => await evalIn(ESC, '(get-parked)');
const getOrder = async (d) => await evalIn(ESC, `(get-order 0x${d.txid} u${d.vout})`);

const P = {
  stx: { arm: 'arm-swap-sbtc-for-stx', router: R_STX, mkt: MKT_S, outBal: stxBal, topic: 'smart-swap-sbtc-for-stx', fresh: async () => { await freshUpd(true); return { hex: S.UPD.hex, mid: S.MID, at: S.UPD.at }; } },
  usdcx: { arm: 'arm-swap-sbtc-for-usdcx', router: R_USD, mkt: MKT_U, outBal: usdcxBal, topic: 'smart-swap-sbtc-for-usdcx', fresh: freshUsdcx },
};

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

const evs = (receipt) => (receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e).filter((e) => e.committed !== false);
function ftMoves(receipt) {
  return evs(receipt).filter((e) => e.ft_transfer_event)
    .map((e) => ({ asset: e.ft_transfer_event.asset_identifier, sender: e.ft_transfer_event.sender, recipient: e.ft_transfer_event.recipient, amount: BigInt(e.ft_transfer_event.amount) }));
}
function allPrints(receipt) {
  return evs(receipt).filter((e) => e.contract_event)
    .map((e) => { try { return plain(deserializeCV(e.contract_event.raw_value)); } catch { return null; } }).filter(Boolean);
}
const evPrints = (receipt, ev) => allPrints(receipt).filter((p) => p.event === ev);

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

async function advance(interval, bitcoin = 1, per = 1) {
  const out = await retry(() => submitSimulationSteps(S.sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: bitcoin, stacks_blocks_per_bitcoin: per, bitcoin_interval_secs: interval } }] }));
  const b = out.steps[0]?.AdvanceBlocks?.Ok;
  if (!b) throw new Error(`AdvanceBlocks failed: ${JSON.stringify(out.steps[0]).slice(0, 300)}`);
  return Number(b[b.length - 1].block_time);
}
const toHeight = async (target) => { const h0 = await height(); if (target - h0 > 0) await advance(target - h0, 1, target - h0); return await height(); };

async function escrowEmpty(label) {
  const s = await sbtcBal(ESC), x = await stxBal(ESC), u = await usdcxBal(ESC);
  check(`${label}: escrow holds 0 sBTC / 0 STX / 0 USDCx`, s === 0n && x === 0n && u === 0n, `${s} / ${x} / ${u}`);
}
async function escrowHolds(label, want) {
  const s = await sbtcBal(ESC), pk = await parked();
  check(`${label}: escrow sBTC == get-parked == ${want}`, s === want && pk === want, `${s} / ${pk}`);
}

// arm a real deposit as its recipient, exact accounting
async function arm(tag, k, d, fee, bps, minOut, armBy = ARM_BY) {
  const p = P[k], user = d.user;
  const u0 = await sbtcBal(user), f0 = await sbtcBal(FEE), e0 = await sbtcBal(ESC), pk0 = await parked();
  const c0 = await evalIn(ESC, '(get-config)');
  check(`${tag}: no order for the deposit before arm`, (await getOrder(d)) === null);
  const net = d.amount - fee;
  const r = await tx(`${tag} ${p.arm} deposit ${d.txid.slice(0, 8)}:${d.vout} (${d.amount} sats) fee ${fee} bps ${bps}`, user, ESC, p.arm, [...kArgs(d), uintCV(fee), uintCV(bps), uintCV(minOut), uintCV(armBy)], { ok: net });
  const pk1 = await parked();
  check(`${tag}: get-parked +net (${pk0} -> ${pk0 + net})`, pk1 === pk0 + net, `${pk1}`);
  const du = u0 - (await sbtcBal(user)), df = (await sbtcBal(FEE)) - f0, de = (await sbtcBal(ESC)) - e0;
  check(`${tag}: user sBTC -${d.amount} (exact minted amount), fee-recipient +${fee}, escrow +${net}`, du === d.amount && df === fee && de === net, `${du} / ${df} / ${de}`);
  const order = await getOrder(d);
  const ah = BigInt(await height());
  const want = { status: 0n, user, router: p.router, net, 'slippage-bps': bps, 'min-out': minOut, 'cancel-height': ah + c0['cancel-after-blocks'] };
  check(`${tag}: get-order exact, status u0, cancel-height = ${ah} + ${c0['cancel-after-blocks']}`, canon(order) === canon(want), `${show(order)} vs ${show(want)}`);
  const pr = evPrints(r.receipt, 'btc-in-armed');
  check(`${tag}: btc-in-armed print exact (order + txid, vout, amount, fee-sats)`, pr.length === 1 && canon(pr[0]) === canon({ ...want, event: 'btc-in-armed', amount: d.amount, 'fee-sats': fee, txid: d.txid, vout: d.vout }), show(pr));
  return { d, net, order, r, ah };
}

async function execute(tag, k, d, upd, wantFilled = true) {
  const p = P[k];
  const pk0 = await parked();
  const rm = await call(STRANGER, p.mkt, 'refresh-mid', [buf(upd)]);
  must(`${tag}: refresh-mid read-out ok`, rm.res?.ok !== undefined && !rm.vm, show(rm.res ?? rm.vm));
  const mid = rm.res.ok;
  const order = await getOrder(d);
  const user = order.user, net = order.net;
  const u0 = await sbtcBal(user), o0 = await p.outBal(user), e0 = await sbtcBal(ESC), k0 = await sbtcBal(KEEPER), ko0 = await p.outBal(KEEPER);
  const r = await tx(`${tag} keeper execute ${d.txid.slice(0, 8)}:${d.vout}`, KEEPER, ESC, 'execute', [...kArgs(d), buf(upd)], OK);
  const res = r.res?.ok ?? {};
  const du = (await sbtcBal(user)) - u0, dout = (await p.outBal(user)) - o0, de = e0 - (await sbtcBal(ESC));
  if (wantFilled === null) note(`${tag}: result ${show(res)}`); else check(`${tag}: result ok == ${wantFilled}`, res.ok === wantFilled, show(res));
  const limit = mid * (BPS - order['slippage-bps']) / BPS;
  check(`${tag}: spent + refund == net ${net}`, res.spent + res.refund === net, show(res));
  check(`${tag}: user got exactly out (${show(res.out)}) and refund (${show(res.refund)}) sBTC`, dout === res.out && du === res.refund, `${dout} / ${du}`);
  if (wantFilled) check(`${tag}: user output > 0`, dout > 0n, `${dout}`);
  check(`${tag}: escrow sBTC -net exactly`, de === net, `${de}`);
  check(`${tag}: keeper gained nothing`, (await sbtcBal(KEEPER)) === k0 && (await p.outBal(KEEPER)) === ko0);
  const after = await getOrder(d);
  check(`${tag}: order kept with status u1 (executed), other fields unchanged`, canon(after) === canon({ ...order, status: 1n }), show(after));
  const pk1 = await parked();
  check(`${tag}: get-parked -net (${pk0} -> ${pk0 - net})`, pk1 === pk0 - net, `${pk1}`);
  const pr = evPrints(r.receipt, 'btc-in-executed');
  const want = { event: 'btc-in-executed', txid: d.txid, vout: d.vout, user, router: p.router, net, mid, 'limit-price': limit, ok: res.ok, code: res.code, spent: res.spent, out: res.out, refund: res.refund };
  check(`${tag}: btc-in-executed print exact (txid, vout, mid ${mid}, limit ${limit})`, pr.length === 1 && canon(pr[0]) === canon(want), show(pr));
  const rp = allPrints(r.receipt).filter((x) => x.topic === p.topic);
  if (res.ok) check(`${tag}: router print: user = escrow, amount = net, out = result out`, rp.length === 1 && rp[0].user === ESC && rp[0].amount === net && rp[0].out === res.out, show(rp));
  const gross = ftMoves(r.receipt).filter((m) => m.asset.startsWith(SBTC) && m.sender === ESC).reduce((a, m) => a + m.amount, 0n);
  const back = ftMoves(r.receipt).filter((m) => m.asset.startsWith(SBTC) && m.recipient === ESC).reduce((a, m) => a + m.amount, 0n);
  check(`${tag}: gross sBTC out (${gross}) <= 2 * net, gross - back == net`, gross <= 2n * net && gross - back === net, `${gross} - ${back}`);
  return { r, res, mid, limit, rp: rp[0] };
}

// a failing call: nothing moved, no escrow print
async function failing(label, sender, fn, args, want, who = []) {
  const snap = async () => canon({ e: await sbtcBal(ESC), f: await sbtcBal(FEE), s: await sbtcBal(sender), p: await parked(), ...Object.fromEntries(await Promise.all(who.map(async (x) => [x, await sbtcBal(x)]))) });
  const b0 = await snap();
  const r = await tx(label, sender, ESC, fn, args, want);
  check(`${label}: nothing moved`, b0 === await snap());
  check(`${label}: no escrow print`, allPrints(r.receipt).filter((p) => String(p.event ?? '').startsWith('btc-in')).length === 0);
  return r;
}

async function restBid(tag, mkt, maker, ty, ay, amount, freshFn) {
  const u = await freshFn();
  await tx(`${tag}: maker deposit-token-y ${amount} at mid ${u.mid}`, maker, mkt, 'deposit-token-y', [uintCV(amount), uintCV(u.mid), noneCV(), P_(ty), stringAsciiCV(ay)], OK);
  if ((await evalIn(mkt, `(get-token-y-pending-deposit '${maker})`)) !== null) {
    const u2 = await freshFn();
    await tx(`${tag}: settle the maker's pending bid`, DEP, mkt, 'settle-token-y-deposit', [P_(maker), buf(u2.hex), P_(ty), stringAsciiCV(ay)], OK);
  }
  const cyc = await evalIn(mkt, '(get-current-cycle)');
  must(`${tag}: maker bid rests on the book`, (await evalIn(mkt, `(get-token-y-deposit u${cyc} '${maker})`)) > 0n);
}

const armArgs = (d, fee = 50n, bps = 300n, armBy = ARM_BY) => [...kArgs(d), uintCV(fee), uintCV(bps), uintCV(1n), uintCV(armBy)];

try {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  if (process.env.H) b.useBlockHeight(Number(process.env.H));
  b.withSender(DEP).addEvalCode(SBTC, '(get-total-supply)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);

  setGroup('P real deposits on the fork');
  for (const [k, d] of Object.entries(DEPS)) {
    const r = await evalIn(REG, `(get-completed-deposit 0x${d.txid} u${d.vout})`);
    must(`P ${k} registry ${d.txid.slice(0, 8)}:${d.vout} amount ${d.amount} recipient ${d.user.slice(0, 8)}`, r && r.amount === d.amount && r.recipient === d.user, show(r));
  }
  const rev = Buffer.from(DEPS.A.txid, 'hex').reverse().toString('hex');
  check('P A with reversed (internal) byte order is not in the registry', (await evalIn(REG, `(get-completed-deposit 0x${rev} u0)`)) === null);
  const bal0 = { RB: await sbtcBal(RB), HB: await sbtcBal(HB) };
  note(`fork sBTC balances: ${RB} ${bal0.RB}, ${HB} ${bal0.HB}`);
  must('RB holds >= deposit A', bal0.RB >= DEPS.A.amount);
  must('HB holds >= deposits B + C', bal0.HB >= DEPS.B.amount + DEPS.C.amount);

  setGroup('setup');
  // jing-btc-in-escrow-v4 went live on mainnet (tx d2dd5342…, block 9413927)
  // with these exact bytes: test the live instance when the source matches,
  // deploy it on the fork when the name is free, stop on a mismatch
  const live = await retry(() => fetch(`${NODE}/extended/v1/contract/${ESC}`).then((r) => r.ok ? r.json() : null));
  if (live?.source_code) {
    must(`${ESC_NAME} exists on mainnet: source byte-identical to the deploy bytes under test`, live.source_code === SRC, `tx ${live.tx_id}`);
    note(`testing the LIVE ${ESC} (deploy tx ${live.tx_id}, block ${live.block_height}) on the fork, no redeploy`);
  } else await deploy(DEP, ESC_NAME, SRC);
  const r0 = await call(WHALE.x, SBTC, 'transfer', [uintCV(10_000n), P_(WHALE.x), P_(FEE), noneCV()]);
  must('fund FEE 10000 sats', r0.res?.ok === true, show(r0.res ?? r0.vm));
  await escrowEmpty('setup');

  setGroup('A config');
  const c0 = await evalIn(ESC, '(get-config)');
  check('A0 defaults (no last-id)', canon(c0) === canon({ owner: DEP, 'pending-owner': null, 'fee-recipient': DEP, 'max-fee-sats': 5000n, paused: false, 'cancel-after-blocks': 30n, 'lazer-fee-ustx': 0n }), show(c0));
  check('A0 get-parked == 0', (await parked()) === 0n);
  await tx('A1 stranger set-keeper -> u4200', STRANGER, ESC, 'set-keeper', [P_(STRANGER), boolCV(true)], E(4200));
  await tx('A1 set-fee-recipient FEE', DEP, ESC, 'set-fee-recipient', [P_(FEE)], { ok: true });
  await tx('A1 set-keeper KEEPER', DEP, ESC, 'set-keeper', [P_(KEEPER), boolCV(true)], { ok: true });
  check('A1 get-order of an unarmed real deposit is none', (await getOrder(DEPS.A)) === null);

  setGroup('B arm STX + USDCx with the exact minted amount');
  const BA = await arm('B1 RB stx', 'stx', DEPS.A, 58n, 300n, 1n);
  const BB = await arm('B2 HB usdcx', 'usdcx', DEPS.B, 56n, 300n, 1n);
  await escrowHolds('B', BA.net + BB.net);

  setGroup('U deposit used -> u4217');
  await failing('U1 RB re-arms A same route (stx) -> u4217', RB, 'arm-swap-sbtc-for-stx', armArgs(DEPS.A), E(4217));
  await failing('U1 RB re-arms A other route (usdcx) -> u4217', RB, 'arm-swap-sbtc-for-usdcx', armArgs(DEPS.A), E(4217));
  await failing('U1 RB re-arms A fee 0 -> u4217', RB, 'arm-swap-sbtc-for-stx', armArgs(DEPS.A, 0n), E(4217));
  await failing('U2 HB re-arms B same route (usdcx) -> u4217', HB, 'arm-swap-sbtc-for-usdcx', armArgs(DEPS.B), E(4217));
  await failing('U2 HB re-arms B other route (stx) -> u4217', HB, 'arm-swap-sbtc-for-stx', armArgs(DEPS.B), E(4217));
  check('U orders unchanged', canon(await getOrder(DEPS.A)) === canon(BA.order) && canon(await getOrder(DEPS.B)) === canon(BB.order));

  setGroup('N arm guards');
  await failing('N1 RB arms HB\'s deposit C -> u4216', RB, 'arm-swap-sbtc-for-stx', armArgs(DEPS.C), E(4216), [HB]);
  await failing('N1 stranger arms deposit C (usdcx) -> u4216', STRANGER, 'arm-swap-sbtc-for-usdcx', armArgs(DEPS.C), E(4216), [HB]);
  await failing('N1 HB arms RB\'s used deposit A -> u4216 (recipient first)', HB, 'arm-swap-sbtc-for-stx', armArgs(DEPS.A), E(4216));
  await failing('N1 the escrow owner arms deposit C -> u4216', DEP, 'arm-swap-sbtc-for-stx', armArgs(DEPS.C), E(4216));
  const zero = '00'.repeat(32), rnd = 'ab'.repeat(32);
  await failing('N2 unknown txid (zeros) -> u4215', HB, 'arm-swap-sbtc-for-stx', [buf(zero), uintCV(0n), uintCV(50n), uintCV(300n), uintCV(1n), AB], E(4215));
  await failing('N2 unknown txid (random) usdcx -> u4215', HB, 'arm-swap-sbtc-for-usdcx', [buf(rnd), uintCV(0n), uintCV(50n), uintCV(300n), uintCV(1n), AB], E(4215));
  await failing('N2 real txid C wrong vout 1 -> u4215', HB, 'arm-swap-sbtc-for-stx', [buf(DEPS.C.txid), uintCV(1n), uintCV(50n), uintCV(300n), uintCV(1n), AB], E(4215));
  await failing('N2 real txid C vout 2^128-1 -> u4215', HB, 'arm-swap-sbtc-for-stx', [buf(DEPS.C.txid), uintCV(2n ** 128n - 1n), uintCV(50n), uintCV(300n), uintCV(1n), AB], E(4215));
  await failing('N2 txid C reversed byte order -> u4215', HB, 'arm-swap-sbtc-for-stx', [buf(Buffer.from(DEPS.C.txid, 'hex').reverse().toString('hex')), uintCV(0n), uintCV(50n), uintCV(300n), uintCV(1n), AB], E(4215));
  await failing('N2 txid C truncated to 31 bytes -> u4215', HB, 'arm-swap-sbtc-for-stx', [buf(DEPS.C.txid.slice(0, 62)), uintCV(0n), uintCV(50n), uintCV(300n), uintCV(1n), AB], E(4215));
  await failing('N2 empty txid -> u4215', HB, 'arm-swap-sbtc-for-stx', [buf(''), uintCV(0n), uintCV(50n), uintCV(300n), uintCV(1n), AB], E(4215));
  {
    const h = BigInt(await height());
    await failing(`N3 arm-by == height ${h} -> u4213`, HB, 'arm-swap-sbtc-for-stx', armArgs(DEPS.C, 50n, 300n, h), E(4213));
    await failing('N3 arm-by == height - 1 (usdcx) -> u4213', HB, 'arm-swap-sbtc-for-usdcx', armArgs(DEPS.C, 50n, 300n, h - 1n), E(4213));
    await failing('N3 arm-by 0 -> u4213', HB, 'arm-swap-sbtc-for-stx', armArgs(DEPS.C, 50n, 300n, 0n), E(4213));
  }
  await tx('N4 pause', DEP, ESC, 'set-paused', [boolCV(true)], { ok: true });
  await failing('N4 arm stx while paused -> u4203', HB, 'arm-swap-sbtc-for-stx', armArgs(DEPS.C), E(4203));
  await failing('N4 arm usdcx while paused -> u4203', HB, 'arm-swap-sbtc-for-usdcx', armArgs(DEPS.C), E(4203));
  await tx('N4 unpause', DEP, ESC, 'set-paused', [boolCV(false)], { ok: true });
  await failing('N5 fee 5001 > max 5000 -> u4201', HB, 'arm-swap-sbtc-for-stx', armArgs(DEPS.C, 5001n), E(4201));
  await failing('N5 slippage-bps 10000 -> u4207', HB, 'arm-swap-sbtc-for-stx', armArgs(DEPS.C, 50n, 10_000n), E(4207));
  await failing('N5 usdcx slippage-bps 2^128-1 -> u4207', HB, 'arm-swap-sbtc-for-usdcx', armArgs(DEPS.C, 50n, 2n ** 128n - 1n), E(4207));
  note('N5 u4202 (fee >= amount) is unreachable with these deposits: every amount > MAX_FEE_SATS 10000');
  check('N no order for C after the refusals', (await getOrder(DEPS.C)) === null);
  // C armed now (stx, fee 0); D needs more sBTC than HB has left -> sBTC u1
  const IC = await arm('N6 HB arms C stx fee 0', 'stx', DEPS.C, 0n, 300n, 1n);
  check('N6 fee 0: no transfer to fee-recipient', ftMoves(IC.r.receipt).filter((m) => m.recipient === FEE).length === 0);
  const hbLeft = await sbtcBal(HB);
  if (hbLeft < DEPS.D.amount) {
    await failing(`N7 HB arms D (${DEPS.D.amount}) holding only ${hbLeft} -> sBTC err u1`, HB, 'arm-swap-sbtc-for-usdcx', armArgs(DEPS.D, 100n), E(1));
    check('N7 the failed arm did not burn deposit D (no order)', (await getOrder(DEPS.D)) === null);
  } else note(`N7 skipped: HB holds ${hbLeft} >= ${DEPS.D.amount}`);
  await escrowHolds('N', BA.net + BB.net + IC.net);

  setGroup('C execute sBTC/STX, then u4205 on a closed order');
  await stxTransfer(WHALE.y, MAKER_S, 2_001_000_000n);
  await restBid('C0', MKT_S, MAKER_S, WSTX, 'wstx', 2_000_000_000n, P.stx.fresh);
  const uC = await P.stx.fresh();
  const C1 = await execute('C1', 'stx', DEPS.A, uC.hex);
  note(`C1 legs ${show({ jing: C1.rp?.['jing-in'], dlmm: C1.rp?.['dlmm-in'], xyk: C1.rp?.['xyk-in'], velar: C1.rp?.['velar-in'], unsold: C1.rp?.unsold })}`);
  await escrowHolds('C1', BB.net + IC.net);
  await failing('C2 execute A twice -> u4205', KEEPER, 'execute', [...kArgs(DEPS.A), buf(uC.hex)], E(4205), [RB]);
  await failing('C2 cancel executed A -> u4205', STRANGER, 'cancel', kArgs(DEPS.A), E(4205), [RB]);
  await failing('C2 re-arm executed A -> u4217', RB, 'arm-swap-sbtc-for-stx', armArgs(DEPS.A), E(4217));
  await failing('C3 execute unknown key -> u4205', KEEPER, 'execute', [buf(zero), uintCV(0n), buf(uC.hex)], E(4205));
  await failing('C3 execute B wrong vout -> u4205', KEEPER, 'execute', [buf(DEPS.B.txid), uintCV(1n), buf(uC.hex)], E(4205));
  await failing('C3 stranger execute B -> u4204', STRANGER, 'execute', [...kArgs(DEPS.B), buf(uC.hex)], E(4204), [HB]);
  check('C get-order A status u1', (await getOrder(DEPS.A))?.status === 1n);

  setGroup('D execute sBTC/USDCx');
  const r2 = await call(USDC_WHALE, USDCX, 'transfer', [uintCV(200_000_000n), P_(USDC_WHALE), P_(MAKER_U), noneCV()]);
  must('fund maker 200 USDCx', r2.res?.ok === true, show(r2.res ?? r2.vm));
  await stxTransfer(WHALE.y, MAKER_U, 10_000_000n);
  await restBid('D0', MKT_U, MAKER_U, USDCX, 'usdcx-token', 200_000_000n, freshUsdcx);
  await execute('D1', 'usdcx', DEPS.B, (await freshUsdcx()).hex);
  await failing('D2 execute B twice -> u4205', KEEPER, 'execute', [...kArgs(DEPS.B), buf((await freshUsdcx()).hex)], E(4205), [HB]);
  await escrowHolds('D', IC.net);

  setGroup('I cancel');
  {
    await failing('I1 user cancel C before cancel-height -> u4206', HB, 'cancel', kArgs(DEPS.C), E(4206), [HB]);
    await failing('I1 stranger cancel C before cancel-height -> u4206', STRANGER, 'cancel', kArgs(DEPS.C), E(4206), [HB]);
    await failing('I1 cancel unknown key -> u4205', STRANGER, 'cancel', [buf(zero), uintCV(0n)], E(4205));
    const ch = Number(IC.order['cancel-height']);
    const h1 = await toHeight(ch - 1);
    check(`I2 height ${h1} == cancel-height - 1`, h1 === ch - 1, `${h1}`);
    await failing('I2 cancel at cancel-height - 1 -> u4206', STRANGER, 'cancel', kArgs(DEPS.C), E(4206), [HB]);
    await advance(1, 1, 1);
    const u0 = await sbtcBal(HB), s0 = await sbtcBal(STRANGER), pk0 = await parked();
    const ci = await tx('I3 stranger cancels C at cancel-height -> ok net', STRANGER, ESC, 'cancel', kArgs(DEPS.C), { ok: IC.net });
    check('I3 refund to the recipient +net, stranger +0, parked -net', (await sbtcBal(HB)) - u0 === IC.net && (await sbtcBal(STRANGER)) === s0 && pk0 - (await parked()) === IC.net);
    check('I3 order kept, status u2 (cancelled)', canon(await getOrder(DEPS.C)) === canon({ ...IC.order, status: 2n }), show(await getOrder(DEPS.C)));
    const pc = evPrints(ci.receipt, 'btc-in-cancelled');
    check('I3 btc-in-cancelled print exact', pc.length === 1 && canon(pc[0]) === canon({ event: 'btc-in-cancelled', txid: DEPS.C.txid, vout: 0n, user: HB, router: R_STX, net: IC.net, caller: STRANGER }), show(pc));
    await failing('I4 cancel C again -> u4205', STRANGER, 'cancel', kArgs(DEPS.C), E(4205), [HB]);
    await failing('I4 user cancel C again -> u4205', HB, 'cancel', kArgs(DEPS.C), E(4205));
    await failing('I4 execute cancelled C -> u4205', KEEPER, 'execute', [...kArgs(DEPS.C), buf((await P.stx.fresh()).hex)], E(4205), [HB]);
    await failing('I4 re-arm cancelled C (stx) -> u4217', HB, 'arm-swap-sbtc-for-stx', armArgs(DEPS.C), E(4217));
    await failing('I4 re-arm cancelled C (usdcx) -> u4217', HB, 'arm-swap-sbtc-for-usdcx', armArgs(DEPS.C), E(4217));
    await escrowEmpty('I');
  }

  setGroup('W sweep-sbtc cannot touch parked');
  const KD = await arm('W0 HB arms D usdcx (after the earlier failed arm)', 'usdcx', DEPS.D, 100n, 300n, 1n);
  {
    const r = await call(WHALE.x, SBTC, 'transfer', [uintCV(5_000n), P_(WHALE.x), P_(ESC), noneCV()]);
    must('W1 donate 5000 sats to the escrow', r.res?.ok === true, show(r.res ?? r.vm));
    check('W1 escrow == net + 5000, parked == net', (await sbtcBal(ESC)) === KD.net + 5_000n && (await parked()) === KD.net);
    await failing('W2 stranger sweep-sbtc -> u4200', STRANGER, 'sweep-sbtc', [uintCV(1n), P_(STRANGER)], E(4200));
    await failing('W2 owner sweep 5001 (1 sat into parked) -> u4212', DEP, 'sweep-sbtc', [uintCV(5_001n), P_(FEE)], E(4212), [HB]);
    await failing('W2 owner sweep all held -> u4212', DEP, 'sweep-sbtc', [uintCV(KD.net + 5_000n), P_(FEE)], E(4212), [HB]);
    await failing('W2 owner sweep 2^128-1-net (overflow edge) -> u4212', DEP, 'sweep-sbtc', [uintCV(2n ** 128n - 1n - KD.net), P_(FEE)], E(4212), [HB]);
    const f0 = await sbtcBal(FEE);
    await tx('W3 owner sweep 5000 -> FEE', DEP, ESC, 'sweep-sbtc', [uintCV(5_000n), P_(FEE)], { ok: true });
    check('W3 FEE +5000, escrow == parked == net', (await sbtcBal(FEE)) - f0 === 5_000n && (await sbtcBal(ESC)) === KD.net && (await parked()) === KD.net);
    await failing('W3 sweep 1 more -> u4212', DEP, 'sweep-sbtc', [uintCV(1n), P_(FEE)], E(4212), [HB]);
    check('W3 order D untouched', canon(await getOrder(DEPS.D)) === canon(KD.order));
  }

  setGroup('K expiry: execute at / past cancel-height u4211');
  {
    const ch = Number(KD.order['cancel-height']);
    const h = await toHeight(ch);
    check(`K1 height ${h} == cancel-height ${ch}`, h === ch, `${h}`);
    await failing('K1 execute D at cancel-height -> u4211', KEEPER, 'execute', [...kArgs(DEPS.D), buf((await freshUsdcx()).hex)], E(4211), [HB]);
    await advance(5, 1, 5);
    await failing('K1 execute D 5 blocks past -> u4211', KEEPER, 'execute', [...kArgs(DEPS.D), buf((await freshUsdcx()).hex)], E(4211), [HB]);
    check('K1 order D still open, unchanged', canon(await getOrder(DEPS.D)) === canon(KD.order));
    const u0 = await sbtcBal(HB);
    await tx('K2 user cancels expired D -> ok net', HB, ESC, 'cancel', kArgs(DEPS.D), { ok: KD.net });
    check('K2 user +net, status u2', (await sbtcBal(HB)) - u0 === KD.net && (await getOrder(DEPS.D))?.status === 2n);
    await escrowEmpty('K');
  }

  setGroup('G signed arm, Deny mode, sBTC cap');
  {
    const d = DEPS.E;
    const hb = await sbtcBal(HB);
    if (hb < d.amount) {
      const r = await call(WHALE.x, SBTC, 'transfer', [uintCV(d.amount - hb), P_(WHALE.x), P_(HB), noneCV()]);
      must(`G0 top up HB by ${d.amount - hb} sats on the fork`, r.res?.ok === true, show(r.res ?? r.vm));
      note(`G0 HB topped up ${d.amount - hb} sats from the whale on the fork`);
    }
    const cap = (n) => [Pc.principal(HB).willSendLte(n).ft(SBTC, 'sbtc-token')];
    const g0 = await sbtcBal(HB), e0 = await sbtcBal(ESC), f0 = await sbtcBal(FEE);
    const G1 = await signedCall(HB, ESC, 'arm-swap-sbtc-for-stx', armArgs(d, 70n), cap(d.amount - 1n), PostConditionMode.Deny);
    check('G1 cap = amount - 1: post-condition aborts', G1.pcAborted === true, show({ vm: G1.vm, res: G1.res }));
    check('G1 nothing moved, no order', (await sbtcBal(HB)) === g0 && (await sbtcBal(ESC)) === e0 && (await sbtcBal(FEE)) === f0 && (await getOrder(d)) === null);
    const G2 = await signedCall(HB, ESC, 'arm-swap-sbtc-for-stx', armArgs(d, 70n), cap(d.amount), PostConditionMode.Deny);
    check('G2 cap = amount: ok net', G2.pcAborted === false && !G2.vm && G2.res?.ok === d.amount - 70n, show({ vm: G2.vm, res: G2.res }));
    check('G2 user -amount, fee +70, escrow +net, status u0', g0 - (await sbtcBal(HB)) === d.amount && (await sbtcBal(FEE)) - f0 === 70n && (await sbtcBal(ESC)) - e0 === d.amount - 70n && (await getOrder(d))?.status === 0n);
    await execute('G3 execute signed E', 'stx', d, (await P.stx.fresh()).hex);
    await escrowEmpty('G');
  }
  check('END get-parked == 0', (await parked()) === 0n, show(await parked()));
  const fin = await Promise.all(Object.values(DEPS).map(getOrder));
  check('END statuses A..E = 1 1 2 2 1', show(fin.map((o) => o?.status)) === show([1n, 1n, 2n, 2n, 1n]), show(fin.map((o) => o?.status)));
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(`EXC ${e.message}`); }
}
summary();
