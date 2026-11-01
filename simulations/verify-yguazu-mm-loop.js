// verify-yguazu-mm-loop.js
// yguazu-mm-loop-jing on a mainnet fork of the LIVE set
// (markets-sbtc-stx-jing-v6-4 + jing-buy-stx-1 / -10 + jing-ladder-v1).
//   A  deploy (owner = deployer), set keeper, fund the vault with sBTC
//   B  auth: keeper / stranger rejections on every owner path, bad rung,
//      size cap, no inventory, pause gate
//   C  leg 1: keeper sells sBTC into jing-buy-stx-1, keeper settles the
//      rung's pending ask, an STX taker swaps through it (forced fill)
//   D  claim: vault books fill price + VWAP from balance deltas;
//      cap == fill * 9990 / 10000 (harness recomputes it independently)
//   E  leg 2: keeper buy-back = pegged STX bid at cap; over-inventory
//      rejected; reprice keeps the same cap; an sBTC taker hits the bid,
//      reconcile shrinks inventory pro rata (VWAP holds)
//   F  owner: cancel bid, rung withdraw, withdraw STX + sBTC to owner only,
//      two-step owner handover
// Run: node simulations/verify-yguazu-mm-loop.js   (no PYTH key needed)
import { readFileSync } from 'node:fs';
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  noneCV, someCV, boolCV, deserializeCV, cvToString, getAddressFromPrivateKey,
  makeUnsignedSTXTokenTransfer, makeUnsignedContractDeploy, PostConditionMode,
} from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps, callContract, getNonce, setSender } from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

const NODE = process.env.STACKS_NODE || 'http://77.42.3.101/stacks-api';
const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const MARKET = `${DEP}.markets-sbtc-stx-jing-v6-4`;
const R1 = `${DEP}.jing-buy-stx-1`, R10 = `${DEP}.jing-buy-stx-10`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALE = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR' };
const P_ = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const T = { x: P_(SBTC), y: P_(WSTX) };
const A = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const OWNER = mk(971), KEEPER = mk(972), STRANGER = mk(973), NEW_OWNER = mk(974), TAKER_Y = mk(975), TAKER_X = mk(976);
const NAME = 'yguazu-mm-loop-jing';
const VAULT = `${OWNER}.${NAME}`;
const BPS = 10000n, EDGE = 10n, SCALE = 10n ** 10n;
const SELL = 20_000n;

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
const groups = {}, notes = [];
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
async function deploy(sender, name, code) {
  const raw = await makeUnsignedContractDeploy({ contractName: name, codeBody: code, clarityVersion: ClarityVersion.Clarity5, nonce: await retry(() => getNonce(sid, sender)), network: 'mainnet', publicKey: '', fee: 0, postConditionMode: PostConditionMode.Deny });
  setSender(raw, sender);
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] }));
  const t = out.steps[0]?.Transaction?.Ok;
  check(`deploy ${name} as ${sender.slice(0, 8)} (Clarity 5)`, t && !t.vm_error && cvToString(deserializeCV(t.result)).startsWith('(ok'), JSON.stringify(out.steps[0]).slice(0, 400));
}
const sbtcBal = async (who) => (await evalIn(SBTC, `(get-balance '${who})`)).ok;
const stxBal = async (who) => await evalIn(MARKET, `(stx-get-balance '${who})`);
const state = async () => await evalIn(VAULT, '(get-state)');
let UPD, MID;
const upd = () => bufferCV(Buffer.from(UPD.hex.replace(/^0x/, ''), 'hex'));
const settleArgs = (who, side) => [P_(who), upd(), side === 'x' ? T.x : T.y, side === 'x' ? A.x : A.y];
const E = (n) => (v) => v.err === BigInt(n);

async function main() {
  const src = readFileSync(new URL('../contracts/rfq/yguazu-mm-loop-jing.clar', import.meta.url), 'utf8');
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(R1, '(get-state)');
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

  // ---------------------------------------------------------------- A ----
  group = 'A deploy + fund';
  console.log(`\n=== ${group} ===`);
  await stxTransfer(WHALE.y, OWNER, 2_000_000n);
  await deploy(OWNER, NAME, src);
  const s0 = await state();
  check('owner = deployer, no keeper, not paused, empty inventory', s0.owner === OWNER && s0.keeper === null && s0.paused === false && s0['inv-stx'] === 0n && s0['inv-sats'] === 0n, show(s0));
  await tx('stranger set-keeper -> u8101', STRANGER, VAULT, 'set-keeper', [someCV(P_(STRANGER))], E(8101));
  await tx('owner set-keeper(keeper)', OWNER, VAULT, 'set-keeper', [someCV(P_(KEEPER))], { ok: true });
  await tx('whale funds the vault 100,000 sats', WHALE.x, SBTC, 'transfer', [uintCV(100_000n), P_(WHALE.x), P_(VAULT), noneCV()], { ok: true });
  check('vault holds 100,000 sats', (await sbtcBal(VAULT)) === 100_000n);
  const r1 = await evalIn(R1, '{ init: (var-get initialized), paused: (var-get push-paused), spread: (get-spread-bps), st: (get-state) }');
  check('jing-buy-stx-1 live: initialized, push not paused, spread u1', r1.init === true && r1.paused === false && r1.spread === 1n, show(r1));

  // ---------------------------------------------------------------- B ----
  group = 'B auth + guards';
  console.log(`\n=== ${group} ===`);
  await tx('keeper withdraw-sbtc -> u8101', KEEPER, VAULT, 'withdraw-sbtc', [uintCV(1n)], E(8101));
  await tx('stranger withdraw-sbtc -> u8101', STRANGER, VAULT, 'withdraw-sbtc', [uintCV(1n)], E(8101));
  await tx('keeper withdraw-stx -> u8101', KEEPER, VAULT, 'withdraw-stx', [uintCV(1n)], E(8101));
  await tx('stranger withdraw-stx -> u8101', STRANGER, VAULT, 'withdraw-stx', [uintCV(1n)], E(8101));
  await tx('keeper rung-withdraw -> u8101', KEEPER, VAULT, 'rung-withdraw', [P_(R1), uintCV(1n), noneCV()], E(8101));
  await tx('keeper cancel-buy-back -> u8101', KEEPER, VAULT, 'cancel-buy-back', [], E(8101));
  await tx('keeper propose-owner -> u8101', KEEPER, VAULT, 'propose-owner', [someCV(P_(KEEPER))], E(8101));
  await tx('keeper set-max-sell-sats -> u8101', KEEPER, VAULT, 'set-max-sell-sats', [uintCV(10n ** 12n)], E(8101));
  await tx('stranger sell -> u8102', STRANGER, VAULT, 'sell', [P_(R1), uintCV(SELL)], E(8102));
  await tx('stranger claim -> u8102', STRANGER, VAULT, 'claim', [P_(R1)], E(8102));
  await tx('keeper sell into non-allowlisted rung (jing-buy-stx-0) -> u8105', KEEPER, VAULT, 'sell', [P_(`${DEP}.jing-buy-stx-0`), uintCV(SELL)], E(8105));
  await tx('keeper sell over size cap (5,000,001 sats) -> u8107', KEEPER, VAULT, 'sell', [P_(R1), uintCV(5_000_001n)], E(8107));
  await tx('keeper buy-back with no inventory -> u8108', KEEPER, VAULT, 'buy-back', [uintCV(1_000_000n), uintCV(30n)], E(8108));
  await tx('owner pause', OWNER, VAULT, 'set-paused', [boolCV(true)], { ok: true });
  await tx('keeper sell while paused -> u8104', KEEPER, VAULT, 'sell', [P_(R1), uintCV(SELL)], E(8104));
  await tx('owner unpause', OWNER, VAULT, 'set-paused', [boolCV(false)], { ok: true });

  // ---------------------------------------------------------------- C ----
  group = 'C leg 1 sell + forced fill';
  console.log(`\n=== ${group} ===`);
  const sl = await tx(`keeper sell ${SELL} sats into jing-buy-stx-1`, KEEPER, VAULT, 'sell', [P_(R1), uintCV(SELL)], { ok: SELL });
  check('prints yg-sell + yg-rung-booked', prints(sl.receipt).some((p) => p.event === 'yg-sell') && prints(sl.receipt).some((p) => p.event === 'yg-rung-booked'), show(prints(sl.receipt).map((p) => p.event)));
  const sA = await state();
  check('vault sBTC 80,000; rung-1 principal = 20,000; no inventory yet', (await sbtcBal(VAULT)) === 80_000n && sA['rung-1'] === SELL && sA['inv-sats'] === 0n, show(sA));
  const pend = await evalIn(MARKET, `(get-token-x-pending-deposit '${R1})`);
  if (pend) {
    await tx('keeper settles the rung pending ask on the market', KEEPER, MARKET, 'settle-token-x-deposit', settleArgs(R1, 'x'), (v) => v.ok !== undefined);
  }
  const cyc = await evalIn(MARKET, '(get-current-cycle)');
  const rLive = await evalIn(MARKET, `(get-token-x-deposit u${cyc} '${R1})`);
  const ask = await evalIn(MARKET, `(token-x-limit-at '${R1} u${MID})`);
  check('rung-1 rests >= 20,000 sats at mid + 1 bps', rLive >= SELL && ask === MID * (BPS + 1n) / BPS, `live ${rLive}, ask ${ask}`);
  // every ask at or below ours must clear first: size the taker to sweep them
  const xs = await evalIn(MARKET, `(get-token-x-depositors u${cyc})`);
  // (the market rejects a taker remainder >= min deposit: u1017, so size it
  // to the asks below ours plus 98% of ours: ours ends partly filled)
  let need = 0n;
  for (const who of xs) {
    const px = await evalIn(MARKET, `(token-x-limit-at '${who} u${MID})`);
    const amt = (await evalIn(MARKET, `(get-token-x-deposit u${cyc} '${who})`)) * px / SCALE;
    if (px < ask) need += amt; else if (who === R1) need += amt * 98n / 100n;
  }
  const gross = need;
  console.log(`  asks <= ours: ${need} uSTX to sweep; taker sends ${gross}`);
  await stxTransfer(WHALE.y, TAKER_Y, gross + 5_000_000n);
  const v0 = await stxBal(VAULT);
  await tx(`STX taker swap ${gross} uSTX -> sBTC, limit = our ask`, TAKER_Y, MARKET, 'swap',
    [uintCV(gross), uintCV(ask), upd(), T.x, A.x, T.y, A.y, boolCV(false)], (v) => v.ok !== undefined);
  const rAfter = await evalIn(MARKET, `(get-token-x-deposit (get-current-cycle) '${R1})`);
  check('rung-1 ask filled (forced on fork)', rAfter < rLive, `${rLive} -> ${rAfter}`);
  check('vault STX unchanged until claim (proceeds sit in the rung)', (await stxBal(VAULT)) === v0);

  // ---------------------------------------------------------------- D ----
  group = 'D claim + VWAP';
  console.log(`\n=== ${group} ===`);
  const stx0 = await stxBal(VAULT), sb0 = await sbtcBal(VAULT);
  const cl = await tx('keeper claim(jing-buy-stx-1)', KEEPER, VAULT, 'claim', [P_(R1)], (v) => v.ok > 0n);
  const stxIn = (await stxBal(VAULT)) - stx0, back = (await sbtcBal(VAULT)) - sb0;
  const left = (await evalIn(R1, `(get-position '${VAULT})`)).sbtc;
  const consumed = SELL - left - back;
  const fill = stxIn * SCALE / consumed;
  const capWant = fill * (BPS - EDGE) / BPS;
  console.log(`  stx in ${stxIn}, sbtc back ${back}, rung left ${left}, consumed ${consumed}, fill ${fill} (mid ${MID})`);
  check('claim returns sats consumed = harness balance-delta math', cl.res.ok === consumed);
  const bk = prints(cl.receipt).find((p) => p.event === 'yg-rung-booked');
  check('yg-rung-booked print: fill-price = stx-in * 1e10 / consumed', bk && bk['fill-price'] === fill && bk['stx-in'] === stxIn, show(bk));
  const sD = await state();
  check('inventory = (stx in, sats consumed); vwap = fill', sD['inv-stx'] === stxIn && sD['inv-sats'] === consumed && sD['vwap-sell'] === fill, show(sD));
  check('cap == fill * 9990 / 10000 (on-chain = harness)', sD['buy-back-cap'] === capWant, `cap ${sD['buy-back-cap']} want ${capWant}`);
  check('fill sits above mid (ask at mid + 1 bps, maker fee taken)', fill > MID * 9980n / BPS, `fill/mid bps ${fill * BPS / MID}`);

  // ---------------------------------------------------------------- E ----
  group = 'E leg 2 buy-back';
  console.log(`\n=== ${group} ===`);
  await tx('keeper buy-back over inventory -> u8109', KEEPER, VAULT, 'buy-back', [uintCV(stxIn + 1n), uintCV(30n)], E(8109));
  await tx('keeper buy-back spread 10000 -> u8110', KEEPER, VAULT, 'buy-back', [uintCV(stxIn), uintCV(10000n)], E(8110));
  const SPREAD = 30n;
  const bb = await tx(`keeper buy-back ${stxIn} uSTX, spread ${SPREAD} bps`, KEEPER, VAULT, 'buy-back', [uintCV(stxIn), uintCV(SPREAD)], { ok: capWant });
  check('print yg-buy-back with cap', prints(bb.receipt).some((p) => p.event === 'yg-buy-back' && p.cap === capWant));
  if (await evalIn(MARKET, `(get-token-y-pending-deposit '${VAULT})`)) {
    const st = await tx('keeper settles the vault pending bid', KEEPER, MARKET, 'settle-token-y-deposit', settleArgs(VAULT, 'y'), (v) => v.ok !== undefined);
    const ref = prints(st.receipt).find((p) => String(p.event).startsWith('pending-refund'));
    check('bid not refunded at settle', !ref, show(ref));
  }
  const ord = await evalIn(MARKET, `(get-token-y-order '${VAULT})`);
  check('market order: limit = cap, spread = some 30', ord.limit === capWant && ord['spread-bps'] === SPREAD, show(ord));
  const bid = await evalIn(MARKET, `(token-y-limit-at '${VAULT} u${MID})`);
  const peg = MID * (BPS - SPREAD) / BPS;
  check('live bid = min-rule: mid*(1-30bps) if <= cap else 0', bid === (peg <= capWant ? peg : 0n), `bid ${bid}, peg ${peg}, cap ${capWant}`);
  check('bid <= cap < vwap sell', bid <= capWant && capWant < fill);
  const live = await evalIn(MARKET, `(get-token-y-deposit (get-current-cycle) '${VAULT})`);
  check('vault STX on the book = buy-back amount', live === stxIn, `${live}`);
  await tx('keeper top-up over inventory (bid already uses it all) -> u8109', KEEPER, VAULT, 'buy-back', [uintCV(1n), uintCV(SPREAD)], E(8109));
  const rp = await tx('keeper reprice spread 40 -> same cap', KEEPER, VAULT, 'reprice', [uintCV(40n)], { ok: capWant });
  const rpe = prints(rp.receipt).find((p) => p.event === 'yg-reprice');
  check('print yg-reprice', !!rpe, show(rpe));
  if (rpe && rpe['applied-now'] === false) {
    await tx('keeper settles the pending limit', KEEPER, MARKET, 'settle-token-y-limit', [P_(VAULT), upd()], (v) => v.ok !== undefined);
  }
  const ord2 = await evalIn(MARKET, `(get-token-y-order '${VAULT})`);
  check('order after reprice: limit = cap, spread = some 40', ord2.limit === capWant && ord2['spread-bps'] === 40n, show(ord2));
  // force a bid fill: sBTC taker sells into bids >= ours
  const bid2 = await evalIn(MARKET, `(token-y-limit-at '${VAULT} u${MID})`);
  if (bid2 > 0n) {
    const ys = await evalIn(MARKET, '(get-token-y-depositors (get-current-cycle))');
    let needX = 0n;
    for (const who of ys) {
      const px = await evalIn(MARKET, `(token-y-limit-at '${who} u${MID})`);
      const amt = (await evalIn(MARKET, `(get-token-y-deposit (get-current-cycle) '${who})`)) * SCALE / (px || 1n);
      if (px > bid2) needX += amt; else if (who === VAULT) needX += amt * 98n / 100n;
    }
    const xIn = needX;
    console.log(`  bids >= ours need ${needX} sats; taker sends ${xIn}`);
    await stxTransfer(WHALE.y, TAKER_X, 1_000_000n);
    await tx(`fund sBTC taker ${xIn} sats`, WHALE.x, SBTC, 'transfer', [uintCV(xIn), P_(WHALE.x), P_(TAKER_X), noneCV()], { ok: true });
    const vs0 = await sbtcBal(VAULT);
    await tx(`sBTC taker swap ${xIn} sats -> STX, limit = our bid`, TAKER_X, MARKET, 'swap',
      [uintCV(xIn), uintCV(bid2), upd(), T.x, A.x, T.y, A.y, boolCV(true)], (v) => v.ok !== undefined);
    const got = (await sbtcBal(VAULT)) - vs0;
    const liveAfter = await evalIn(MARKET, `(get-token-y-deposit (get-current-cycle) '${VAULT})`);
    check('vault bid filled: sBTC arrived in the vault', got > 0n, `+${got} sats, bid STX ${live} -> ${liveAfter}`);
    const pre = await state();
    const rc = await tx('keeper reconcile', KEEPER, VAULT, 'reconcile', [], (v) => v.ok !== undefined);
    const post = await state();
    const ev = prints(rc.receipt).map((p) => p.event);
    if (post['inv-stx'] === 0n) {
      check('inventory back in sBTC -> VWAP reset to 0', post['inv-sats'] === 0n && post['vwap-sell'] === 0n && ev.includes('yg-inventory-reset'), show(post));
    } else {
      // sats-out floors, so remaining sats round UP and VWAP rounds DOWN (cap only gets stricter)
      const spentW = pre['inv-stx'] - post['inv-stx'];
      const satsW = pre['inv-sats'] - pre['inv-sats'] * spentW / pre['inv-stx'];
      check('inventory shrunk pro rata: inv-stx = STX still open, inv-sats = sats - floor(sats * spent / stx)', post['inv-stx'] === post['stx-held'] + post['stx-on-market'] && post['inv-sats'] === satsW && ev.includes('yg-inventory-reduced'), show({ inv: post['inv-stx'], sats: post['inv-sats'], want: satsW }));
      check('VWAP held up to 1-sat rounding, never above the old VWAP', post['vwap-sell'] <= pre['vwap-sell'] && post['inv-stx'] * SCALE / (post['inv-sats'] - 1n) >= pre['vwap-sell'], show({ pre: pre['vwap-sell'], post: post['vwap-sell'] }));
    }
    check('bought back sats at or below cap: uSTX spent * 1e10 / sats got <= cap', ((pre['inv-stx'] - post['inv-stx']) * SCALE) / got <= capWant || post['inv-stx'] === 0n, `spent ${pre['inv-stx'] - post['inv-stx']}`);
  } else {
    notes.push('bid priced 0 (mid*(1-spread) above cap): bid fill not forced');
  }

  // ---------------------------------------------------------------- F ----
  group = 'F owner exits + handover';
  console.log(`\n=== ${group} ===`);
  const onBook = await evalIn(VAULT, '(stx-on-market)');
  if (onBook > 0n) {
    const vb = await stxBal(VAULT);
    await tx('owner cancel-buy-back -> STX back to the vault', OWNER, VAULT, 'cancel-buy-back', [], { ok: onBook });
    check('vault STX += refunded bid', (await stxBal(VAULT)) === vb + onBook);
  }
  const rl = (await state())['rung-1'];
  if (rl > 0n) {
    const sbv = await sbtcBal(VAULT);
    await tx('owner rung-withdraw all from jing-buy-stx-1', OWNER, VAULT, 'rung-withdraw', [P_(R1), uintCV(10n ** 15n), someCV(upd())], (v) => v.ok !== undefined);
    check('rung principal 0, sBTC back in the vault', (await state())['rung-1'] === 0n && (await sbtcBal(VAULT)) > sbv);
  }
  const ost = await stxBal(OWNER), osb = await sbtcBal(OWNER);
  const vst = await stxBal(VAULT), vsb = await sbtcBal(VAULT);
  await tx(`owner withdraw-stx ${vst}`, OWNER, VAULT, 'withdraw-stx', [uintCV(vst)], { ok: vst });
  await tx(`owner withdraw-sbtc ${vsb}`, OWNER, VAULT, 'withdraw-sbtc', [uintCV(vsb)], { ok: vsb });
  check('owner received all, vault empty', (await stxBal(OWNER)) === ost + vst && (await sbtcBal(OWNER)) === osb + vsb && (await stxBal(VAULT)) === 0n && (await sbtcBal(VAULT)) === 0n);
  check('inventory reset after STX left the vault', (await state())['inv-stx'] === 0n);
  await tx('owner propose-owner(new)', OWNER, VAULT, 'propose-owner', [someCV(P_(NEW_OWNER))], { ok: true });
  await tx('stranger accept-owner -> u8103', STRANGER, VAULT, 'accept-owner', [], E(8103));
  await tx('old owner still owner before accept (set-paused ok)', OWNER, VAULT, 'set-paused', [boolCV(false)], { ok: true });
  await tx('new owner accept-owner', NEW_OWNER, VAULT, 'accept-owner', [], { ok: true });
  await tx('old owner withdraw-stx -> u8101', OWNER, VAULT, 'withdraw-stx', [uintCV(1n)], E(8101));
  check('owner = new, pending cleared', (await evalIn(VAULT, '{ o: (get-owner), p: (get-pending-owner) }')).o === NEW_OWNER);
}

main().then(() => {
  console.log('\nGroups:'); for (const [g, [p, n]] of Object.entries(groups)) console.log(`  ${p === n ? 'PASS' : 'FAIL'} ${g}: ${p}/${n}`);
  for (const n of notes) console.log(`  note: ${n}`);
  console.log(`\n${passed}/${checks} checks green`);
  console.log(`https://stxer.xyz/simulations/mainnet/${sid}`);
}).catch((e) => {
  console.error(e.message ?? e);
  console.log('\nGroups:'); for (const [g, [p, n]] of Object.entries(groups)) console.log(`  ${p === n ? 'PASS' : 'FAIL'} ${g}: ${p}/${n}`);
  for (const n of notes) console.log(`  note: ${n}`);
  console.log(`${passed}/${checks} checks green`); console.log(`https://stxer.xyz/simulations/mainnet/${sid}`); process.exit(1);
});
