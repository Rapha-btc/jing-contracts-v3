// stxer mainnet-fork proof for contracts/btc-in/jing-btc-in-escrow.clar: the
// walk-away BTC-in flow. The user's presigned arm tx parks the net sBTC; the
// keeper executes later with a fresh Lazer update. The Jing deployer deploys
// the escrow so it sits next to the LIVE routers v5-5, markets v6-4 and pools.
//   A  config defaults, owner setters (non-owner u4200), timeout bounds u4208,
//      keeper set / revoke, propose -> accept hand-over
//   B  arm on both pairs: exact deltas (user -amount, fee-recipient +fee,
//      escrow +net), get-order, btc-in-armed print exact; guards with nothing
//      moved: paused u4203, fee > max u4201, fee >= amount u4202, slippage
//      10000 u4207 (9999 and 0 accepted)
//   C  execute sBTC/STX with a fresh Lazer update: a maker STX bid rests, the
//      book leg fills (jing-ok, jing-in > 0), the user gets exactly `out` STX
//      and any unsold sats, escrow back to 0 sBTC / 0 STX, order deleted,
//      btc-in-executed print exact; gross escrow sBTC outflows reported
//   D  same on sBTC/USDCx
//   E  router err (min-out too high, u3002): swap rolled back inside
//      as-contract?, net refunded exactly, no STX/USDCx moves, order deleted;
//      the keeper's refund path: mid 0 -> limit 0 -> router u3006 -> refund
//   (order map has no armed-at / armed-at-height: cancel-height is checked
//   against the arm block height read from the sim)
//   J  slippage-bps: exact derived limit in the print, 0 / 5 bps with a maker
//      bid at the mid, too tight for the pools (router err, exact refund),
//      300 bps fills on the book on both pairs
//   F  non-keeper u4204, revoked keeper u4204, double execute u4205, unknown
//      id u4205, paused execute u4203 (order stays armed)
//   G  real signed arm txs, sBTC cap on the user: Originator cap == amount ok,
//      amount - 1 aborts with nothing moved; strict Deny cap == amount ok
//      (only the user's sBTC moves at arm time)
//   H  stale update (moves the clock past the 80 s window): the book leg is
//      skipped, the pools fill, user gets the output
//   I  cancel (moves the chain height): before cancel-height anyone (user,
//      stranger) u4206; after it a stranger cancels and the refund goes to the
//      user; the stranger gains nothing; cancel / execute again u4205; cancel
//      works while paused; a later timeout change does not move an armed order
//   X  probe: the same escrow with an exact `net` allowance, on a book fill
// Every path ends with the escrow holding 0 sBTC (and 0 STX / 0 USDCx).
// Run: node simulations/verify-btc-in-escrow.js
import { readFileSync } from 'node:fs';
import {
  uintCV, boolCV, bufferCV, stringAsciiCV, noneCV, Pc, PostConditionMode, makeUnsignedContractCall, deserializeCV,
} from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps, getNonce, setSender } from 'stxer';
import {
  NODE, DEP, SBTC, WSTX, WHALE, P_, mk, S, retry, sleep, check, must, show, tx, evalIn, call, deploy, summary, Stop,
  setGroup, E, OK, sbtcBal, stxBal, freshUpd, updCV, stxTransfer, note, plain, blockTime,
} from './_yg-loop-common.js';
import { lazerFeedTimes, fetchLazerUpdateAny } from './_lazer.js';

const SRC = readFileSync(new URL('../contracts/btc-in/jing-btc-in-escrow.clar', import.meta.url), 'utf8');
const ESC = `${DEP}.jing-btc-in-escrow`;
const R_STX = `${DEP}.swap-router-sbtc-stx-jing-v5-5`, R_USD = `${DEP}.swap-router-sbtc-usdcx-jing-v5-5`;
const MKT_S = `${DEP}.markets-sbtc-stx-jing-v6-4`, MKT_U = `${DEP}.markets-sbtc-usdcx-jing-v6-4`;
const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const USDC_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ';
const BPS = 10_000n;
const FEE = mk(8), STRANGER = mk(6), NEWOWNER = mk(2), KEEPER = mk(9), MAKER_S = mk(5), MAKER_U = mk(4), PCU = mk(3);
const U = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`u${i + 1}`, mk(41 + i)]));
const LAZER_HDR = { headers: { 'x-api-key': 'jc_e4d2e10396eef95215a7afd492f42d743a3325739d29200c2a28b256f778be01' } };
const buf = (hex) => bufferCV(Buffer.from(hex.replace(/^0x/, ''), 'hex'));
const canon = (o) => show(Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b))));
const usdcxBal = async (who) => (await evalIn(USDCX, `(get-balance '${who})`)).ok;
const height = async () => Number(await evalIn(MKT_S, 'stacks-block-height'));

// the two pairs, as one table
const P = {
  stx: { arm: 'arm-swap-sbtc-for-stx', router: R_STX, outBal: stxBal, topic: 'smart-swap-sbtc-for-stx', fresh: async () => { await freshUpd(true); return { hex: S.UPD.hex, mid: S.MID, at: S.UPD.at }; } },
  usdcx: { arm: 'arm-swap-sbtc-for-usdcx', router: R_USD, outBal: usdcxBal, topic: 'smart-swap-sbtc-for-usdcx', fresh: freshUsdcx },
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

// one AdvanceBlocks step: `bitcoin_blocks` burn blocks, `per` Stacks blocks each
async function advance(interval, bitcoin = 1, per = 1) {
  const out = await retry(() => submitSimulationSteps(S.sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: bitcoin, stacks_blocks_per_bitcoin: per, bitcoin_interval_secs: interval } }] }));
  const b = out.steps[0]?.AdvanceBlocks?.Ok;
  if (!b) throw new Error(`AdvanceBlocks failed: ${JSON.stringify(out.steps[0]).slice(0, 300)}`);
  return Number(b[b.length - 1].block_time);
}

async function escrowEmpty(label, cid = ESC) {
  const s = await sbtcBal(cid), x = await stxBal(cid), u = await usdcxBal(cid);
  check(`${label}: escrow holds 0 sBTC / 0 STX / 0 USDCx`, s === 0n && x === 0n && u === 0n, `${s} / ${x} / ${u}`);
}
async function escrowHolds(label, want) {
  const s = await sbtcBal(ESC);
  check(`${label}: escrow holds exactly ${want} sBTC (the armed nets)`, s === want, `${s}`);
}

// arm with exact accounting; returns { id, net, order }
async function arm(tag, k, user, amount, fee, bps, minOut) {
  const p = P[k];
  const u0 = await sbtcBal(user), f0 = await sbtcBal(FEE), e0 = await sbtcBal(ESC);
  const c0 = await evalIn(ESC, '(get-config)');
  const h = await height();
  const r = await tx(`${tag} ${p.arm} ${amount} fee ${fee} slippage-bps ${bps} min-out ${minOut}`, user, ESC, p.arm, [uintCV(amount), uintCV(fee), uintCV(bps), uintCV(minOut)], OK);
  const id = r.res?.ok, net = amount - fee;
  check(`${tag}: id == last-id + 1 (${c0['last-id'] + 1n})`, id === c0['last-id'] + 1n && (await evalIn(ESC, '(get-config)'))['last-id'] === id, show(r.res));
  const du = u0 - (await sbtcBal(user)), df = (await sbtcBal(FEE)) - f0, de = (await sbtcBal(ESC)) - e0;
  check(`${tag}: user sBTC -${amount}, fee-recipient +${fee}, escrow +${net}`, du === amount && df === fee && de === net, `${du} / ${df} / ${de}`);
  const order = await evalIn(ESC, `(get-order u${id})`);
  // the arm tx's block height, read from the sim right after it
  const ah = BigInt(await height());
  const want = { user, router: p.router, net, 'slippage-bps': bps, 'min-out': minOut, 'cancel-height': ah + c0['cancel-after-blocks'] };
  check(`${tag}: get-order exact {user, router, net, slippage-bps, min-out, cancel-height = arm height ${ah} + ${c0['cancel-after-blocks']}}`, canon(order) === canon(want), `${show(order)} vs ${show(want)}`);
  check(`${tag}: arm height ${ah} in [${h}, ${h + 2}]`, ah >= BigInt(h) && ah <= BigInt(h + 2));
  const pr = evPrints(r.receipt, 'btc-in-armed');
  check(`${tag}: btc-in-armed print exact (order + event, id, amount, fee-sats)`, pr.length === 1 && canon(pr[0]) === canon({ ...want, event: 'btc-in-armed', id, amount, 'fee-sats': fee }), show(pr));
  return { id, net, order, r, ah };
}

// execute with exact accounting
async function execute(tag, k, id, upd, mid, wantFilled = true) { // wantFilled null = either
  const p = P[k];
  const order = await evalIn(ESC, `(get-order u${id})`);
  const user = order.user, net = order.net;
  const u0 = await sbtcBal(user), o0 = await p.outBal(user), e0 = await sbtcBal(ESC), k0 = await sbtcBal(KEEPER), ko0 = await p.outBal(KEEPER);
  const r = await tx(`${tag} keeper execute u${id}`, KEEPER, ESC, 'execute', [uintCV(id), buf(upd), uintCV(mid)], OK);
  const res = r.res?.ok ?? {};
  const du = (await sbtcBal(user)) - u0, dout = (await p.outBal(user)) - o0, de = e0 - (await sbtcBal(ESC));
  if (wantFilled === null) note(`${tag}: result ${show(res)}`); else check(`${tag}: result ok == ${wantFilled}`, res.ok === wantFilled, show(res));
  const limit = mid * (BPS - order['slippage-bps']) / BPS;
  check(`${tag}: spent + refund == net ${net}`, res.spent + res.refund === net, show(res));
  check(`${tag}: user got exactly out (${show(res.out)}) and refund (${show(res.refund)}) sBTC`, dout === res.out && du === res.refund, `${dout} / ${du}`);
  check(`${tag}: escrow sBTC -net exactly`, de === net, `${de}`);
  check(`${tag}: keeper gained nothing`, (await sbtcBal(KEEPER)) === k0 && (await p.outBal(KEEPER)) === ko0);
  check(`${tag}: order deleted`, (await evalIn(ESC, `(get-order u${id})`)) === null);
  const pr = evPrints(r.receipt, 'btc-in-executed');
  const want = { event: 'btc-in-executed', id, user, router: p.router, net, mid, 'limit-price': limit, ok: res.ok, code: res.code, spent: res.spent, out: res.out, refund: res.refund };
  check(`${tag}: btc-in-executed print exact (mid ${mid}, limit-price ${limit})`, pr.length === 1 && canon(pr[0]) === canon(want), show(pr));
  const rp = allPrints(r.receipt).filter((x) => x.topic === p.topic);
  if (res.ok) {
    check(`${tag}: router print: user = escrow, amount = net, out = result out`, rp.length === 1 && rp[0].user === ESC && rp[0].amount === net && rp[0].out === res.out && rp[0].unsold === res.refund, show(rp));
    check(`${tag}: no STX/USDCx left on the escrow, out > 0`, res.out > 0n);
  } else {
    check(`${tag}: no router print committed, out 0, spent 0, refund == net`, rp.length === 0 && res.out === 0n && res.spent === 0n && res.refund === net, show({ rp, res }));
  }
  const gross = ftMoves(r.receipt).filter((m) => m.asset.startsWith(SBTC) && m.sender === ESC).reduce((a, m) => a + m.amount, 0n);
  const back = ftMoves(r.receipt).filter((m) => m.asset.startsWith(SBTC) && m.recipient === ESC).reduce((a, m) => a + m.amount, 0n);
  note(`${tag}: escrow sBTC gross out ${gross}, back in ${back}, net ${net}, spent ${res.spent}, refund ${res.refund}`);
  check(`${tag}: gross sBTC out (${gross}) <= 2 * net, and gross - back == net (spent + refund)`, gross <= 2n * net && gross - back === net, `${gross} - ${back}`);
  return { r, res, gross, back, limit, rp: rp[0] };
}

// a failing call: nothing moved
async function failing(label, sender, fn, args, want, who = []) {
  const snap = async () => canon({ e: await sbtcBal(ESC), f: await sbtcBal(FEE), s: await sbtcBal(sender), ...Object.fromEntries(await Promise.all(who.map(async (x) => [x, await sbtcBal(x)]))) });
  const b0 = await snap();
  const r = await tx(label, sender, ESC, fn, args, want);
  check(`${label}: nothing moved`, b0 === await snap());
  check(`${label}: no escrow print`, allPrints(r.receipt).filter((p) => String(p.event ?? '').startsWith('btc-in')).length === 0);
  return r;
}

// a maker rests a y-side bid at the mid; settle it if the market parks it
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

try {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  if (process.env.H) b.useBlockHeight(Number(process.env.H));
  b.withSender(DEP).addEvalCode(SBTC, '(get-total-supply)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);

  setGroup('setup');
  await deploy(DEP, 'jing-btc-in-escrow', SRC);
  await deploy(DEP, 'jing-btc-in-escrow-exact', SRC.replace('(with-ft SBTC ASSET_SBTC (* u2 net))', '(with-ft SBTC ASSET_SBTC net)'));
  for (const [who, amt] of [...Object.values(U).map((u) => [u, 1_000_000n]), [PCU, 600_000n], [FEE, 10_000n]]) {
    const r = await call(WHALE.x, SBTC, 'transfer', [uintCV(amt), P_(WHALE.x), P_(who), noneCV()]);
    must(`fund ${who.slice(0, 8)} ${amt} sats`, r.res?.ok === true, show(r.res ?? r.vm));
  }
  await escrowEmpty('setup');

  setGroup('A config + owner');
  const c0 = await evalIn(ESC, '(get-config)');
  check('A0 defaults', canon(c0) === canon({ owner: DEP, 'pending-owner': null, 'fee-recipient': DEP, 'max-fee-sats': 5000n, paused: false, 'cancel-after-blocks': 30n, 'last-id': 0n }), show(c0));
  check('A0 nobody is a keeper', (await evalIn(ESC, `(is-keeper '${KEEPER})`)) === false && (await evalIn(ESC, `(is-keeper '${DEP})`)) === false);
  for (const [fn, args] of [['propose-owner', [P_(STRANGER)]], ['set-fee-recipient', [P_(STRANGER)]], ['set-max-fee-sats', [uintCV(1n)]], ['set-paused', [boolCV(true)]], ['set-keeper', [P_(STRANGER), boolCV(true)]], ['set-cancel-after-blocks', [uintCV(10n)]]]) {
    await tx(`A1 stranger ${fn} -> u4200`, STRANGER, ESC, fn, args, E(4200));
  }
  await tx('A2 set-cancel-after-blocks 0 -> u4208', DEP, ESC, 'set-cancel-after-blocks', [uintCV(0n)], E(4208));
  await tx('A2 set-cancel-after-blocks 361 -> u4208', DEP, ESC, 'set-cancel-after-blocks', [uintCV(361n)], E(4208));
  await tx('A2 set-cancel-after-blocks 360 ok', DEP, ESC, 'set-cancel-after-blocks', [uintCV(360n)], { ok: true });
  await tx('A2 set-cancel-after-blocks back to 30', DEP, ESC, 'set-cancel-after-blocks', [uintCV(30n)], { ok: true });
  await tx('A3 set-fee-recipient FEE', DEP, ESC, 'set-fee-recipient', [P_(FEE)], { ok: true });
  await tx('A3 max-fee-sats 10001 above MAX_FEE_SATS -> u4201', DEP, ESC, 'set-max-fee-sats', [uintCV(10_001n)], E(4201));
  await tx('A3 max-fee-sats 10000 ok', DEP, ESC, 'set-max-fee-sats', [uintCV(10_000n)], { ok: true });
  await tx('A3 set-max-fee-sats 3000', DEP, ESC, 'set-max-fee-sats', [uintCV(3000n)], { ok: true });
  await tx('A3 set-keeper KEEPER', DEP, ESC, 'set-keeper', [P_(KEEPER), boolCV(true)], { ok: true });
  await tx('A3 set-keeper STRANGER on, then off', DEP, ESC, 'set-keeper', [P_(STRANGER), boolCV(true)], { ok: true });
  await tx('A3 set-keeper STRANGER off', DEP, ESC, 'set-keeper', [P_(STRANGER), boolCV(false)], { ok: true });
  check('A3 keepers: KEEPER yes, STRANGER no', (await evalIn(ESC, `(is-keeper '${KEEPER})`)) === true && (await evalIn(ESC, `(is-keeper '${STRANGER})`)) === false);
  await tx('A4 accept-owner with nothing pending -> u4200', NEWOWNER, ESC, 'accept-owner', [], E(4200));
  await tx('A4 propose NEWOWNER', DEP, ESC, 'propose-owner', [P_(NEWOWNER)], { ok: true });
  await tx('A4 stranger accept -> u4200', STRANGER, ESC, 'accept-owner', [], E(4200));
  await tx('A4 NEWOWNER has no rights before accept -> u4200', NEWOWNER, ESC, 'set-paused', [boolCV(true)], E(4200));
  await tx('A4 old owner keeps rights before accept', DEP, ESC, 'set-max-fee-sats', [uintCV(3000n)], { ok: true });
  await tx('A4 NEWOWNER accept-owner', NEWOWNER, ESC, 'accept-owner', [], { ok: true });
  for (const [fn, args] of [['propose-owner', [P_(DEP)]], ['set-paused', [boolCV(true)]], ['set-keeper', [P_(DEP), boolCV(true)]], ['set-cancel-after-blocks', [uintCV(10n)]], ['set-fee-recipient', [P_(DEP)]], ['set-max-fee-sats', [uintCV(1n)]]]) {
    await tx(`A5 old owner after accept: ${fn} -> u4200`, DEP, ESC, fn, args, E(4200));
  }
  await tx('A6 NEWOWNER proposes DEP back', NEWOWNER, ESC, 'propose-owner', [P_(DEP)], { ok: true });
  await tx('A6 DEP accept-owner', DEP, ESC, 'accept-owner', [], { ok: true });
  const c6 = await evalIn(ESC, '(get-config)');
  check('A6 owner DEP, pending none, fee-recipient FEE, max 3000', canon(c6) === canon({ ...c0, 'fee-recipient': FEE, 'max-fee-sats': 3000n }), show(c6));

  setGroup('B arm');
  await freshUpd(true);
  const midS = S.MID, uU0 = await freshUsdcx(), midU = uU0.mid;
  const limS = 300n, limU = 300n; // slippage-bps
  const B1 = await arm('B1', 'stx', U.u1, 200_000n, 2_000n, limS, 1n);
  const B2 = await arm('B2', 'usdcx', U.u2, 100_000n, 1_500n, limU, 1n);
  const B3 = await arm('B3 fee 0', 'stx', U.u3, 50_000n, 0n, limS, 1n);
  check('B3 fee 0: no transfer to fee-recipient in the receipt', ftMoves(B3.r.receipt).filter((m) => m.recipient === FEE).length === 0);
  await escrowHolds('B', B1.net + B2.net + B3.net);
  await tx('B4 pause', DEP, ESC, 'set-paused', [boolCV(true)], { ok: true });
  await failing('B4 arm while paused -> u4203', U.u4, 'arm-swap-sbtc-for-stx', [uintCV(10_000n), uintCV(100n), uintCV(limS), uintCV(1n)], E(4203));
  await failing('B4 arm usdcx while paused -> u4203', U.u4, 'arm-swap-sbtc-for-usdcx', [uintCV(10_000n), uintCV(100n), uintCV(limU), uintCV(1n)], E(4203));
  await tx('B4 unpause', DEP, ESC, 'set-paused', [boolCV(false)], { ok: true });
  await failing('B5 fee 3001 > max -> u4201', U.u4, 'arm-swap-sbtc-for-stx', [uintCV(10_000n), uintCV(3001n), uintCV(limS), uintCV(1n)], E(4201));
  await failing('B5 fee == amount -> u4202', U.u4, 'arm-swap-sbtc-for-stx', [uintCV(2000n), uintCV(2000n), uintCV(limS), uintCV(1n)], E(4202));
  await failing('B5 amount 0 -> u4202', U.u4, 'arm-swap-sbtc-for-usdcx', [uintCV(0n), uintCV(0n), uintCV(limU), uintCV(1n)], E(4202));
  await failing('B5 slippage-bps 10000 -> u4207', U.u4, 'arm-swap-sbtc-for-stx', [uintCV(10_000n), uintCV(100n), uintCV(10_000n), uintCV(1n)], E(4207));
  await failing('B5 usdcx slippage-bps 10000 -> u4207', U.u4, 'arm-swap-sbtc-for-usdcx', [uintCV(10_000n), uintCV(100n), uintCV(10_000n), uintCV(1n)], E(4207));
  await failing('B5 slippage-bps 2^128-1 -> u4207', U.u4, 'arm-swap-sbtc-for-stx', [uintCV(2n ** 128n - 1n), uintCV(100n), uintCV(2n ** 128n - 1n), uintCV(1n)], E(4207));
  await failing('B5 amount above balance -> sBTC u1', U.u4, 'arm-swap-sbtc-for-stx', [uintCV(2_000_000n), uintCV(100n), uintCV(limS), uintCV(1n)], E(1));
  check('B5 last-id unchanged by failures (3)', (await evalIn(ESC, '(get-config)'))['last-id'] === 3n);
  const B6 = await arm('B6 slippage-bps 9999 accepted', 'stx', U.u4, 20_000n, 200n, 9999n, 1n);
  const B7 = await arm('B7 slippage-bps 0 accepted', 'usdcx', U.u4, 20_000n, 200n, 0n, 1n);
  // refund both through the keeper's mid-0 path: limit 0 -> router u3006
  const B6x = await execute('B6 mid 0 -> limit 0 -> router u3006 -> refund', 'stx', B6.id, S.UPD.hex, 0n, false);
  check('B6 code u3006, print limit-price 0', B6x.res.code === 3006n && B6x.limit === 0n, show(B6x.res));
  const B7x = await execute('B7 usdcx mid 0 -> router u3006 -> refund', 'usdcx', B7.id, uU0.hex, 0n, false);
  check('B7 code u3006', B7x.res.code === 3006n, show(B7x.res));
  await escrowHolds('B7', B1.net + B2.net + B3.net);

  setGroup('C execute sBTC/STX, fresh update, book leg fills');
  await stxTransfer(WHALE.y, MAKER_S, 5_001_000_000n);
  await restBid('C0', MKT_S, MAKER_S, WSTX, 'wstx', 5_000_000_000n, P.stx.fresh);
  const uC = await P.stx.fresh();
  const C1 = await execute('C1', 'stx', B1.id, uC.hex, uC.mid);
  const rpC = allPrints(C1.r.receipt).find((x) => x.topic === P.stx.topic);
  check('C1 the book leg filled (jing-ok, jing-in > 0)', rpC?.['jing-ok'] === true && rpC['jing-in'] > 0n, show(rpC));
  check('C1 legs add up to net', rpC['jing-in'] + rpC['dlmm-in'] + rpC['xyk-in'] + rpC['velar-in'] + rpC.unsold === B1.net, show(rpC));
  await escrowHolds('C1', B2.net + B3.net);
  const C2 = await execute('C2 fee-0 order, same block', 'stx', B3.id, uC.hex, uC.mid);
  await escrowHolds('C2', B2.net);

  setGroup('D execute sBTC/USDCx, fresh update, book leg fills');
  const r2 = await call(USDC_WHALE, USDCX, 'transfer', [uintCV(500_000_000n), P_(USDC_WHALE), P_(MAKER_U), noneCV()]);
  must('fund maker 500 USDCx', r2.res?.ok === true, show(r2.res ?? r2.vm));
  await stxTransfer(WHALE.y, MAKER_U, 10_000_000n);
  await restBid('D0', MKT_U, MAKER_U, USDCX, 'usdcx-token', 500_000_000n, freshUsdcx);
  const uD = await freshUsdcx();
  const D1 = await execute('D1', 'usdcx', B2.id, uD.hex, uD.mid);
  const rpD = allPrints(D1.r.receipt).find((x) => x.topic === P.usdcx.topic);
  check('D1 the book leg filled (jing-ok, jing-in > 0)', rpD?.['jing-ok'] === true && rpD['jing-in'] > 0n, show(rpD));
  await escrowEmpty('D1');

  setGroup('E router err -> refund');
  const uE = await P.stx.fresh();
  const E1 = await arm('E1', 'stx', U.u5, 120_000n, 1_000n, 300n, 10n ** 15n);
  const sx0 = await stxBal(U.u5);
  const E1x = await execute('E1 min-stx-out 1e15 -> router u3002', 'stx', E1.id, uE.hex, uE.mid, false);
  check('E1 code u3002, user STX unchanged', E1x.res.code === 3002n && (await stxBal(U.u5)) === sx0, show(E1x.res));
  check('E1 rolled back: no committed sBTC move but the refund', ftMoves(E1x.r.receipt).filter((m) => m.asset.startsWith(SBTC)).length === 1 && E1x.gross === E1.net, show(ftMoves(E1x.r.receipt)));
  await escrowEmpty('E1');
  const uE2 = await freshUsdcx();
  const E2 = await arm('E2', 'usdcx', U.u6, 90_000n, 900n, 300n, 10n ** 15n);
  const ux0 = await usdcxBal(U.u6);
  const E2x = await execute('E2 min-usdcx-out 1e15 -> router u3002', 'usdcx', E2.id, uE2.hex, uE2.mid, false);
  check('E2 code u3002, user USDCx unchanged', E2x.res.code === 3002n && (await usdcxBal(U.u6)) === ux0, show(E2x.res));
  await escrowEmpty('E2');
  // the keeper's refund path: mid 0 makes the router refuse (u3007), so the
  // keeper can refund an armed order at any time, and only to its user
  const E3 = await arm('E3', 'stx', U.u6, 50_000n, 500n, 300n, 1n);
  const E3x = await execute('E3 keeper execute with mid 0 -> limit 0 -> router u3006 -> refund', 'stx', E3.id, uE.hex, 0n, false);
  check('E3 code u3006', E3x.res.code === 3006n, show(E3x.res));
  await escrowEmpty('E3');

  setGroup('F execute guards');
  const uF = await P.stx.fresh();
  const F1 = await arm('F1', 'stx', U.u7, 60_000n, 600n, 300n, 1n);
  const fArgs = [uintCV(F1.id), buf(uF.hex), uintCV(uF.mid)];
  await failing('F1 stranger execute -> u4204', STRANGER, 'execute', fArgs, E(4204), [U.u7]);
  await failing('F1 order user execute -> u4204', U.u7, 'execute', fArgs, E(4204));
  await failing('F1 owner (not keeper) execute -> u4204', DEP, 'execute', fArgs, E(4204), [U.u7]);
  await failing('F2 unknown id -> u4205', KEEPER, 'execute', [uintCV(999n), buf(uF.hex), uintCV(uF.mid)], E(4205), [U.u7]);
  await tx('F3 pause', DEP, ESC, 'set-paused', [boolCV(true)], { ok: true });
  await failing('F3 keeper execute while paused -> u4203', KEEPER, 'execute', fArgs, E(4203), [U.u7]);
  await tx('F3 unpause', DEP, ESC, 'set-paused', [boolCV(false)], { ok: true });
  await tx('F4 revoke KEEPER', DEP, ESC, 'set-keeper', [P_(KEEPER), boolCV(false)], { ok: true });
  await failing('F4 revoked keeper -> u4204', KEEPER, 'execute', fArgs, E(4204), [U.u7]);
  await tx('F4 re-add KEEPER', DEP, ESC, 'set-keeper', [P_(KEEPER), boolCV(true)], { ok: true });
  check('F order still armed after the refusals', canon(await evalIn(ESC, `(get-order u${F1.id})`)) === canon(F1.order));
  await execute('F5 execute', 'stx', F1.id, uF.hex, uF.mid);
  await failing('F5 double execute -> u4205', KEEPER, 'execute', fArgs, E(4205), [U.u7]);
  await escrowEmpty('F5');

  setGroup('G signed arm txs, sBTC cap');
  const capPc = (n) => [Pc.principal(PCU).willSendLte(n).ft(SBTC, 'sbtc-token')];
  const gArgs = (amt) => [uintCV(amt), uintCV(1_000n), uintCV(limS), uintCV(1n)];
  const g0 = await sbtcBal(PCU), gf0 = await sbtcBal(FEE), ge0 = await sbtcBal(ESC), gid0 = (await evalIn(ESC, '(get-config)'))['last-id'];
  const G1 = await signedCall(PCU, ESC, 'arm-swap-sbtc-for-stx', gArgs(100_000n), capPc(99_999n));
  check('G1 Originator, cap = amount - 1: post-condition aborts', G1.pcAborted === true, show({ vm: G1.vm, res: G1.res }));
  check('G1 nothing moved, no order', (await sbtcBal(PCU)) === g0 && (await sbtcBal(FEE)) === gf0 && (await sbtcBal(ESC)) === ge0 && (await evalIn(ESC, '(get-config)'))['last-id'] === gid0);
  const G2 = await signedCall(PCU, ESC, 'arm-swap-sbtc-for-stx', gArgs(100_000n), capPc(100_000n));
  check('G2 Originator, cap = amount: ok', G2.pcAborted === false && !G2.vm && G2.res?.ok === gid0 + 1n, show({ vm: G2.vm, res: G2.res }));
  check('G2 user -100000, fee +1000, escrow +99000', g0 - (await sbtcBal(PCU)) === 100_000n && (await sbtcBal(FEE)) - gf0 === 1_000n && (await sbtcBal(ESC)) - ge0 === 99_000n);
  const G3 = await signedCall(PCU, ESC, 'arm-swap-sbtc-for-usdcx', [uintCV(80_000n), uintCV(800n), uintCV(limU), uintCV(1n)], capPc(80_000n), PostConditionMode.Deny);
  check('G3 strict Deny, cap = amount: ok (only the user moves sBTC at arm)', G3.pcAborted === false && !G3.vm && G3.res?.ok === gid0 + 2n, show({ vm: G3.vm, res: G3.res }));
  const G4 = await signedCall(PCU, ESC, 'arm-swap-sbtc-for-usdcx', [uintCV(80_000n), uintCV(800n), uintCV(limU), uintCV(1n)], capPc(79_999n), PostConditionMode.Deny);
  check('G4 strict Deny, cap = amount - 1: aborts', G4.pcAborted === true, show({ vm: G4.vm, res: G4.res }));
  const uG = await P.stx.fresh();
  await execute('G5 execute the signed stx order', 'stx', gid0 + 1n, uG.hex, uG.mid);
  const uG2 = await freshUsdcx();
  await execute('G5 execute the signed usdcx order', 'usdcx', gid0 + 2n, uG2.hex, uG2.mid);
  await escrowEmpty('G5');

  setGroup('X probe: exact `net` allowance on a book fill');
  {
    const EX = `${DEP}.jing-btc-in-escrow-exact`;
    await tx('X0 set-keeper on the exact copy', DEP, EX, 'set-keeper', [P_(KEEPER), boolCV(true)], { ok: true });
    await tx('X0 arm on the exact copy', U.u8, EX, 'arm-swap-sbtc-for-stx', [uintCV(200_000n), uintCV(0n), uintCV(limS), uintCV(1n)], OK);
    await stxTransfer(WHALE.y, MAKER_S, 3_001_000_000n);
    await restBid('X0', MKT_S, MAKER_S, WSTX, 'wstx', 3_000_000_000n, P.stx.fresh);
    const uX = await P.stx.fresh();
    const rx = await call(KEEPER, EX, 'execute', [uintCV(1n), buf(uX.hex), uintCV(uX.mid)]);
    const rpx = allPrints(rx.receipt).find((x) => x.topic === P.stx.topic);
    note(`X1 exact allowance: execute -> ${show(rx.res ?? rx.vm)}; router jing-ok ${show(rpx?.['jing-ok'])} jing-in ${show(rpx?.['jing-in'])}`);
    check('X1 exact copy: no VM error (ok or a clean err)', !rx.vm, show(rx.vm));
    const gx = ftMoves(rx.receipt).filter((m) => m.asset.startsWith(SBTC) && m.sender === EX).reduce((a, m) => a + m.amount, 0n);
    if (rx.res?.err === 4209n) note('X1 exact `net` allowance violated (u4209): the gross sBTC outflow exceeded net, so the 2 * net allowance is needed');
    else if (rx.res?.ok) note(`X1 exact allowance held this time (gross out ${gx} incl. the ${show(rx.res.ok.refund)} sat refund): the rolled dust came back to the escrow and was not re-sold`);
  }

  setGroup('J slippage-bps -> derived limit');
  {
    // J1 exact derived limit for a known mid: 123456789 * (10000 - 37) / 10000 = 122999998
    const uJ = await P.stx.fresh();
    const J1 = await arm('J1 bps 37', 'stx', U.u1, 30_000n, 0n, 37n, 1n);
    const J1x = await execute('J1 known mid 123456789, bps 37', 'stx', J1.id, uJ.hex, 123_456_789n, null);
    check('J1 print limit-price == 122999998 exactly', J1x.limit === 122_999_998n, show(J1x.res));
    // J2 tight slippage with a maker bid resting exactly at the mid
    await stxTransfer(WHALE.y, MAKER_S, 2_001_000_000n);
    for (const bps of [0n, 5n]) {
      await restBid(`J2 ${bps}`, MKT_S, MAKER_S, WSTX, 'wstx', 1_000_000_000n, P.stx.fresh);
      const u = await P.stx.fresh();
      const o = await arm(`J2 bps ${bps}`, 'stx', U.u2, 100_000n, 0n, bps, 1n);
      const x = await execute(`J2 bps ${bps}, maker bid at mid`, 'stx', o.id, u.hex, u.mid, null);
      note(`J2 bps ${bps}: mid ${u.mid} limit ${x.limit} ok ${x.res.ok} code ${x.res.code} out ${x.res.out} refund ${x.res.refund}; legs jing ${show(x.rp?.['jing-in'])} dlmm ${show(x.rp?.['dlmm-in'])} xyk ${show(x.rp?.['xyk-in'])} velar ${show(x.rp?.['velar-in'])} unsold ${show(x.rp?.unsold)}`);
      await escrowEmpty(`J2 bps ${bps}`);
    }
    // J3 limit too tight for every venue: keeper mid 2x the market, bps 0
    const u3 = await P.stx.fresh();
    const J3 = await arm('J3 bps 0', 'stx', U.u3, 80_000n, 0n, 0n, 1n);
    const J3x = await execute('J3 mid 2x market -> limit above every venue -> router err -> refund', 'stx', J3.id, u3.hex, u3.mid * 2n, false);
    note(`J3 router code ${J3x.res.code}, limit ${J3x.limit}`);
    await escrowEmpty('J3');
    // J4 wide 300 bps, fresh update, book fills on both pairs
    await stxTransfer(WHALE.y, MAKER_S, 901_000_000n);
    await restBid('J4 stx', MKT_S, MAKER_S, WSTX, 'wstx', 900_000_000n, P.stx.fresh);
    const u4 = await P.stx.fresh();
    const J4 = await arm('J4 stx bps 300', 'stx', U.u3, 100_000n, 0n, 300n, 1n);
    const J4x = await execute('J4 stx bps 300', 'stx', J4.id, u4.hex, u4.mid);
    check('J4 stx: book leg filled (jing-ok, jing-in > 0)', J4x.rp?.['jing-ok'] === true && J4x.rp['jing-in'] > 0n, show(J4x.rp));
    const r4 = await call(USDC_WHALE, USDCX, 'transfer', [uintCV(200_000_000n), P_(USDC_WHALE), P_(MAKER_U), noneCV()]);
    must('J4 fund maker 200 USDCx', r4.res?.ok === true, show(r4.res ?? r4.vm));
    await restBid('J4 usdcx', MKT_U, MAKER_U, USDCX, 'usdcx-token', 200_000_000n, freshUsdcx);
    const u4u = await freshUsdcx();
    const J4u = await arm('J4 usdcx bps 300', 'usdcx', U.u5, // not U.u4: mk(44) == mk(4) == MAKER_U
      50_000n, 0n, 300n, 1n);
    const J4ux = await execute('J4 usdcx bps 300', 'usdcx', J4u.id, u4u.hex, u4u.mid);
    note(`J4 usdcx sBTC moves: ${show(ftMoves(J4ux.r.receipt).filter((m) => m.asset.startsWith(SBTC)))}`);
    check('J4 usdcx: book leg filled (jing-ok, jing-in > 0)', J4ux.rp?.['jing-ok'] === true && J4ux.rp['jing-in'] > 0n, show(J4ux.rp));
    await escrowEmpty('J4');
  }

  setGroup('H stale update (clock past the 80 s window), pools fill');
  const uH = await P.stx.fresh();
  const H1 = await arm('H1', 'stx', U.u9, 150_000n, 1_500n, 300n, 1n);
  const base = await advance(1);
  const btH = await advance(Math.max(1, uH.at + 85 - base));
  check(`H1 block time now >= update at + 85 (${uH.at + 85})`, btH >= uH.at + 85, `${btH}`);
  const H1x = await execute('H1 execute with the stale update', 'stx', H1.id, uH.hex, uH.mid);
  const rpH = allPrints(H1x.r.receipt).find((x) => x.topic === P.stx.topic);
  check('H1 book leg skipped (jing-ok false, jing-in 0), pools filled (out > 0)', rpH?.['jing-ok'] === false && rpH['jing-in'] === 0n && H1x.res.out > 0n, show(rpH));
  await escrowEmpty('H1');

  setGroup('I cancel after the timeout (moves the chain height)');
  const uI = { mid: uH.mid };
  const I1 = await arm('I1', 'stx', U.u10, 70_000n, 700n, 300n, 1n);
  const I2 = await arm('I2', 'usdcx', U.u11, 40_000n, 400n, limU, 1n);
  await failing('I1 user cancel before cancel-height -> u4206', U.u10, 'cancel', [uintCV(I1.id)], E(4206), [U.u10]);
  await failing('I1 stranger cancel before cancel-height -> u4206', STRANGER, 'cancel', [uintCV(I1.id)], E(4206), [U.u10]);
  await failing('I1 keeper cancel before cancel-height -> u4206', KEEPER, 'cancel', [uintCV(I1.id)], E(4206), [U.u10]);
  await failing('I1 unknown id cancel -> u4205', STRANGER, 'cancel', [uintCV(999n)], E(4205));
  // a later timeout change must not move armed orders
  await tx('I2 owner set-cancel-after-blocks 360', DEP, ESC, 'set-cancel-after-blocks', [uintCV(360n)], { ok: true });
  check('I2 armed orders keep their cancel-height', canon(await evalIn(ESC, `(get-order u${I1.id})`)) === canon(I1.order) && canon(await evalIn(ESC, `(get-order u${I2.id})`)) === canon(I2.order));
  const ch = Number(I1.order['cancel-height']);
  // step to one block before cancel-height, check, then one more
  let h = await height();
  if (ch - 1 - h > 0) await advance(5 * (ch - 1 - h), 1, ch - 1 - h);
  h = await height();
  check(`I3 height ${h} == cancel-height - 1 (${ch - 1})`, h === ch - 1, `${h}`);
  await failing('I3 stranger cancel at cancel-height - 1 -> u4206', STRANGER, 'cancel', [uintCV(I1.id)], E(4206), [U.u10]);
  await advance(10, 1, 1);
  h = await height();
  check(`I4 height ${h} >= cancel-height ${ch}`, h >= ch, `${h}`);
  const iu0 = await sbtcBal(U.u10), is0 = await sbtcBal(STRANGER), isx0 = await stxBal(STRANGER), ie0 = await sbtcBal(ESC);
  const I4 = await tx('I4 stranger cancel after the timeout -> ok net', STRANGER, ESC, 'cancel', [uintCV(I1.id)], { ok: I1.net });
  check('I4 refund went to the user (+net), stranger gained nothing, escrow -net', (await sbtcBal(U.u10)) - iu0 === I1.net && (await sbtcBal(STRANGER)) === is0 && (await stxBal(STRANGER)) === isx0 && ie0 - (await sbtcBal(ESC)) === I1.net);
  check('I4 order deleted', (await evalIn(ESC, `(get-order u${I1.id})`)) === null);
  const pc = evPrints(I4.receipt, 'btc-in-cancelled');
  check('I4 btc-in-cancelled print exact', pc.length === 1 && canon(pc[0]) === canon({ event: 'btc-in-cancelled', id: I1.id, user: U.u10, router: R_STX, net: I1.net, caller: STRANGER }), show(pc));
  await failing('I5 cancel again -> u4205', STRANGER, 'cancel', [uintCV(I1.id)], E(4205), [U.u10]);
  await failing('I5 execute a cancelled order -> u4205', KEEPER, 'execute', [uintCV(I1.id), buf(uH.hex), uintCV(uI.mid)], E(4205), [U.u10]);
  await tx('I6 pause', DEP, ESC, 'set-paused', [boolCV(true)], { ok: true });
  const iu2 = await sbtcBal(U.u11);
  await tx('I6 the user cancels its usdcx order while paused -> ok net', U.u11, ESC, 'cancel', [uintCV(I2.id)], { ok: I2.net });
  check('I6 user +net', (await sbtcBal(U.u11)) - iu2 === I2.net);
  await tx('I6 unpause', DEP, ESC, 'set-paused', [boolCV(false)], { ok: true });
  // an order armed under the 360 timeout: still locked after 60 blocks
  const I7 = await arm('I7 under timeout 360', 'stx', U.u12, 30_000n, 300n, limS, 1n);
  check(`I7 cancel-height = arm height (${I7.ah}) + 360`, I7.order['cancel-height'] - I7.ah === 360n, show(I7.order));
  await advance(300, 1, 60);
  await failing('I7 stranger cancel 60 blocks later -> u4206', STRANGER, 'cancel', [uintCV(I7.id)], E(4206), [U.u12]);
  await tx('I7 owner set-cancel-after-blocks 30 (does not free I7)', DEP, ESC, 'set-cancel-after-blocks', [uintCV(30n)], { ok: true });
  await failing('I7 still u4206', STRANGER, 'cancel', [uintCV(I7.id)], E(4206), [U.u12]);
  // the clock is past real time here, so the keeper uses the old update: pools fill
  await execute('I8 the keeper executes I7 instead (stale update, pools)', 'stx', I7.id, uH.hex, uH.mid);
  await escrowEmpty('I end');
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(`EXC ${e.message}`); }
}
summary();
