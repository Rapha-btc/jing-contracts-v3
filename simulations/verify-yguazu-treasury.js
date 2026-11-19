// Mainnet fork: exact local sources, all loops + treasury under one deployer.
// node simulations/verify-yguazu-treasury.js
import { readFileSync } from 'node:fs';
import { uintCV, someCV, noneCV, tupleCV } from '@stacks/transactions';
import { MARKET, SBTC, WHALE, P_, mk, S, show, setGroup, check, must, startSim, evalIn, tx, E, OK, prints, deploy, stxTransfer, sbtcTransfer, summary } from './_yg-loop-common.js';
import { USDCX, WHALE as UW, usdcxTransfer } from './_yg-loop-usdcx-common.js';

const OWNER = mk(1201), KEEPER = mk(1202), STRANGER = mk(1203), NEXT = mk(1204);
const names = ['stx', 'sbtc', 'usdcx', 'sbtc-usdcx'].map(s => `yguazu-mm-loop-sell-${s}`);
const loops = names.map(n => `${OWNER}.${n}`), TREASURY = `${OWNER}.yguazu-treasury`;
const assets = [0, 1, 2, 1], bases = [8200, 8100, 8200, 8100];
const U = uintCV, zero = { dlmm: 0n, xyk: 0n, velar: 0n };
const tuple = o => tupleCV(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, U(v)])));
const split = (amount, usdcx = false, min = 0n) => [U(amount), U(0), U(1), noneCV(), noneCV(), tuple({ ...zero, [usdcx ? 'dlmm' : 'xyk']: amount }), tuple(zero), U(min)];
const state = i => evalIn(loops[i], '(get-state)');
const accounting = s => Object.fromEntries(Object.entries(s).filter(([k]) => !k.endsWith('-held')));
const balanceExpr = p => `{ stx: (stx-get-balance '${p}), sbtc: (unwrap-panic (contract-call? '${SBTC} get-balance '${p})), usdcx: (unwrap-panic (contract-call? '${USDCX} get-balance '${p})) }`;
const keys = ['stx', 'sbtc', 'usdcx'];
const balances = () => evalIn(TREASURY, `(list ${[...loops, TREASURY, OWNER, NEXT, STRANGER].map(balanceExpr).join(' ')})`);
// Reads share a stxer session; keep them sequential (every eval extends tenure).
async function snap() {
  const states = [];
  for (let i = 0; i < 4; i++) states.push(await state(i));
  return { balances: await balances(), states, treasury: await evalIn(TREASURY, '(get-state)'), pending: await evalIn(TREASURY, '(get-pending-owner)') };
}
async function reject(label, sender, cid, fn, args, err) {
  const pre = await snap();
  await tx(label, sender, cid, fn, args, E(err));
  check(`${label}: atomic, all balances/state unchanged`, show(pre) === show(await snap()));
}
async function movement(label, sender, cid, fn, args, from, to, asset, amount) {
  const pre = await snap();
  const r = await tx(label, sender, cid, fn, args, { ok: amount });
  const post = await snap(), expected = structuredClone(pre.balances);
  expected[from][keys[asset]] -= amount;
  expected[to][keys[asset]] += amount;
  check(`${label}: only intended starting asset moved to intended destination`, show(post.balances) === show(expected), show({ before: pre.balances, after: post.balances }));
  check(`${label}: all loop inventory, orders and configuration untouched`, show(pre.states.map(accounting)) === show(post.states.map(accounting)));
  return r;
}
async function main() {
  await startSim(MARKET);
  setGroup('T deploy + fund');
  await stxTransfer(WHALE.y, OWNER, 5_000_000n);
  for (const n of names) await deploy(OWNER, n, readFileSync(new URL(`../contracts/rfq/${n}.clar`, import.meta.url), 'utf8'));
  await deploy(OWNER, 'yguazu-treasury', readFileSync(new URL('../contracts/rfq/yguazu-treasury.clar', import.meta.url), 'utf8'));
  check('treasury owner = shared deployer', await evalIn(TREASURY, '(get-owner)') === OWNER);
  for (let i = 0; i < 4; i++) {
    check(`loop ${i} principal + starting asset mapping`, await evalIn(TREASURY, `(loop-principal u${i})`) === loops[i] && await evalIn(TREASURY, `(loop-asset u${i})`) === BigInt(assets[i]));
    await tx(`loop ${i} set keeper`, OWNER, loops[i], 'set-keeper', [someCV(P_(KEEPER))], { ok: true });
    await reject(`loop ${i} no treasury -> ERR_NO_TREASURY`, OWNER, loops[i], 'to-treasury', [U(1)], bases[i] + 13);
  }
  // Fund all three assets in every loop: wrong-asset transfers cannot pass unnoticed.
  for (const p of [...loops, TREASURY]) {
    await stxTransfer(WHALE.y, p, 500_000_000n);
    await sbtcTransfer(WHALE.x, p, 300_000n);
    await usdcxTransfer(UW.y, p, 500_000_000n);
  }
  for (let i = 0; i < 4; i++) {
    await tx(`loop ${i} create real inventory through swap-open`, OWNER, loops[i], 'swap-open', split(assets[i] === 1 ? 30_000n : 30_000_000n, i >= 2), OK);
    const s = await state(i);
    must(`loop ${i} inventory is nonzero`, s['inv-sats'] > 0n && s[i < 2 ? 'inv-stx' : 'inv-usdcx'] > 0n, show(s));
  }
  setGroup('T loop authorization + pull/push');
  for (let i = 0; i < 4; i++) {
    for (const who of [KEEPER, STRANGER]) await reject(`loop ${i} non-owner set-treasury`, who, loops[i], 'set-treasury', [someCV(P_(TREASURY))], bases[i] + 1);
    await tx(`loop ${i} owner set-treasury`, OWNER, loops[i], 'set-treasury', [someCV(P_(TREASURY))], { ok: true });
    check(`loop ${i} treasury saved`, await evalIn(loops[i], '(var-get treasury)') === TREASURY);
    for (const who of [KEEPER, STRANGER]) await reject(`loop ${i} non-owner/non-treasury to-treasury`, who, loops[i], 'to-treasury', [U(1000)], bases[i] + 2);
    await reject(`loop ${i} zero to-treasury`, OWNER, loops[i], 'to-treasury', [U(0)], bases[i] + 6);
    const amount = assets[i] === 1 ? 5000n : 5_000_000n;
    await movement(`loop ${i} direct owner to-treasury`, OWNER, loops[i], 'to-treasury', [U(amount)], i, 4, assets[i], amount);
    const pulled = await movement(`loop ${i} treasury pulls as contract-caller`, OWNER, TREASURY, 'pull', [U(i), U(amount)], i, 4, assets[i], amount);
    check(`loop ${i} pull event proves treasury caller`, prints(pulled.receipt).some(p => p.event === 'yg-to-treasury' && p.caller === TREASURY && p.to === TREASURY && p.amount === amount));
    await movement(`loop ${i} treasury pushes`, OWNER, TREASURY, 'push', [U(i), U(amount)], 4, i, assets[i], amount);
    await tx(`loop ${i} revoke treasury`, OWNER, loops[i], 'set-treasury', [noneCV()], { ok: true });
    await reject(`loop ${i} revoked treasury cannot pull`, OWNER, TREASURY, 'pull', [U(i), U(amount)], bases[i] + 13);
    await tx(`loop ${i} restore treasury`, OWNER, loops[i], 'set-treasury', [someCV(P_(TREASURY))], { ok: true });
  }
  setGroup('T move + rebalance + swap');
  for (const [a, b] of [[1, 3], [3, 1]]) await movement(`move ${a}->${b}`, OWNER, TREASURY, 'move', [U(a), U(b), U(5000)], a, b, 1, 5000n);
  await reject('move different assets', OWNER, TREASURY, 'move', [U(0), U(1), U(1)], 8307);
  await reject('move same loop', OWNER, TREASURY, 'move', [U(1), U(1), U(1)], 8309);
  for (const [a, b] of [[0, 2], [2, 0]]) await reject(`rebalance ${a}->${b} no one-hop route`, OWNER, TREASURY, 'rebalance', [U(a), U(b), ...split(1000n)], 8308);
  await reject('rebalance same asset', OWNER, TREASURY, 'rebalance', [U(1), U(3), ...split(1000n)], 8306);
  for (const [a, b, kind] of [[1, 0, 0], [0, 1, 1], [3, 2, 2], [2, 3, 3]]) {
    const amount = assets[a] === 1 ? 10_000n : 10_000_000n;
    await reject(`rebalance ${a}->${b} min-out rolls back pull`, OWNER, TREASURY, 'rebalance', [U(a), U(b), ...split(amount, kind >= 2, 2n ** 100n)], 3002);
    const pre = await snap();
    const r = await tx(`rebalance ${a}->${b} live router`, OWNER, TREASURY, 'rebalance', [U(a), U(b), ...split(amount, kind >= 2)], OK);
    const post = await snap(), out = r.res?.ok;
    if (typeof out === 'bigint') {
      const expected = structuredClone(pre.balances);
      expected[a][keys[assets[a]]] -= amount;
      expected[b][keys[assets[b]]] += out;
      check(`rebalance ${a}->${b} exact deltas, treasury retains no output`, out > 0n && show(expected) === show(post.balances), show({ out, before: pre.balances, after: post.balances }));
      check(`rebalance ${a}->${b} all loop inventory/state untouched`, show(pre.states.map(accounting)) === show(post.states.map(accounting)));
      check(`rebalance ${a}->${b} event matches`, prints(r.receipt).some(p => p.event === 'yt-rebalance' && p.kind === BigInt(kind) && p.got === out && p.amount === amount));
    }
  }
  for (const [kind, input, output] of [[0, 1, 0], [1, 0, 1], [2, 1, 2], [3, 2, 1]]) {
    const amount = input === 1 ? 5000n : 5_000_000n;
    await reject(`swap ${kind} min-out`, OWNER, TREASURY, 'swap', [U(kind), ...split(amount, kind >= 2, 2n ** 100n)], 3002);
    const pre = await balances();
    const r = await tx(`swap ${kind} live router`, OWNER, TREASURY, 'swap', [U(kind), ...split(amount, kind >= 2)], OK);
    if (typeof r.res?.ok === 'bigint') {
      const expected = structuredClone(pre);
      expected[4][keys[input]] -= amount;
      expected[4][keys[output]] += r.res.ok;
      check(`swap ${kind} return equals measured output, only treasury traded`, r.res.ok > 0n && show(expected) === show(await balances()));
    }
  }
  setGroup('T guards + withdraw + handover');
  const calls = [
    ['pull', [U(0), U(1)]], ['push', [U(0), U(1)]], ['move', [U(1), U(3), U(1)]],
    ['swap', [U(0), ...split(1000n)]], ['rebalance', [U(1), U(0), ...split(1000n)]],
    ['withdraw', [U(0), U(1)]], ['set-max-oracle-fee', [U(1)]], ['propose-owner', [someCV(P_(STRANGER))]],
  ];
  for (const who of [KEEPER, STRANGER]) for (const [fn, args] of calls) await reject(`non-owner ${who === KEEPER ? 'keeper' : 'stranger'} ${fn}`, who, TREASURY, fn, args, 8301);
  for (const [fn, args, err] of [
    ['pull', [U(9), U(1)], 8304], ['push', [U(9), U(1)], 8304],
    ['pull', [U(0), U(0)], 8303], ['push', [U(0), U(0)], 8303],
    ['move', [U(1), U(3), U(0)], 8303], ['swap', [U(4), ...split(1000n)], 8305],
    ['swap', [U(0), ...split(0n)], 8303], ['withdraw', [U(3), U(1)], 8305], ['withdraw', [U(0), U(0)], 8303],
  ]) await reject(`guard ${fn} ${show(args)}`, OWNER, TREASURY, fn, args, err);
  for (let asset = 0; asset < 3; asset++) {
    const r = await movement(`withdraw asset ${asset} only to owner`, OWNER, TREASURY, 'withdraw', [U(asset), U(1000)], 4, 5, asset, 1000n);
    check(`withdraw ${asset} event destination is owner`, prints(r.receipt).some(p => p.event === 'yt-withdraw' && p.to === OWNER && p.asset === BigInt(asset)));
  }
  await reject('accept with no nomination', NEXT, TREASURY, 'accept-owner', [], 8302);
  await tx('owner proposes successor', OWNER, TREASURY, 'propose-owner', [someCV(P_(NEXT))], { ok: true });
  check('proposal leaves current owner in control', await evalIn(TREASURY, '(get-owner)') === OWNER && await evalIn(TREASURY, '(get-pending-owner)') === NEXT);
  await reject('pending owner cannot withdraw before acceptance', NEXT, TREASURY, 'withdraw', [U(0), U(1)], 8301);
  await reject('stranger cannot accept nomination', STRANGER, TREASURY, 'accept-owner', [], 8302);
  await tx('owner cancels nomination', OWNER, TREASURY, 'propose-owner', [noneCV()], { ok: true });
  await reject('cancelled successor cannot accept', NEXT, TREASURY, 'accept-owner', [], 8302);
  await tx('owner re-proposes successor', OWNER, TREASURY, 'propose-owner', [someCV(P_(NEXT))], { ok: true });
  await tx('successor accepts', NEXT, TREASURY, 'accept-owner', [], { ok: true });
  check('handover changes owner and clears nomination', await evalIn(TREASURY, '(get-owner)') === NEXT && await evalIn(TREASURY, '(get-pending-owner)') === null);
  await reject('old owner loses authority', OWNER, TREASURY, 'withdraw', [U(0), U(1)], 8301);
  await movement('new owner withdraws only to new owner', NEXT, TREASURY, 'withdraw', [U(0), U(1000)], 4, 6, 0, 1000n);
  await movement('new treasury owner can still pull loop via treasury caller', NEXT, TREASURY, 'pull', [U(1), U(1000)], 1, 4, 1, 1000n);
}
main().then(() => { summary(); process.exitCode = S.fails.length ? 1 : 0; })
  .catch(e => { console.error(e.stack ?? e); summary(); process.exitCode = 1; });
