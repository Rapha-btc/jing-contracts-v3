// Active entries through the live router; shared by all four loop harnesses.
// Run before SC changes AMM prices and K advances the fork clock.
import { ORACLE, setOracleFee } from './_yg-oracle-fee.js';
import { uintCV, someCV, noneCV, tupleCV } from '@stacks/transactions';
import { BPS, SCALE, P_, mk, S, show, setGroup, check, must, evalIn, call, tx, E, OK, prints, deploy, stxBal } from './_yg-loop-common.js';

export async function swapOpenGroup(c) {
  const { cfg, src, MARKET, KEEPER, STRANGER, bal, fund, fundStx, freshUpd, updCV, pair, invGot, invSold } = c;
  const OWN = mk(cfg.seed + 8), V = `${OWN}.${cfg.name}`;
  const { sold, got } = cfg, q = pair.yKey;
  const inKey = sold === 'x' ? 'sats-in' : `${q}-in`;
  const outKey = got === 'x' ? 'sats-out' : `${q}-out`;
  const zero = { dlmm: 0n, xyk: 0n, velar: 0n };
  const t3 = (v) => tupleCV(Object.fromEntries(Object.entries(v).map(([k, n]) => [k, uintCV(n)])));
  const args = (amount, { jing = false, min = 0n, close = false } = {}) => {
    const sx = close ? got === 'x' : sold === 'x';
    return [uintCV(amount), uintCV(jing ? amount : 0n), uintCV(sx ? S.MID * 97n / 100n : S.MID * 103n / 100n),
      jing ? someCV(updCV()) : noneCV(), noneCV(), t3(jing ? zero : { ...zero, [pair.venue]: amount }), t3(zero), uintCV(min)];
  };
  const state = () => evalIn(V, '(get-state)');
  const snap = async () => ({ state: await state(), stx: await stxBal(V) });
  async function reject(label, sender, a, want) {
    const pre = await snap();
    await tx(label, sender, V, 'swap-open', a, want);
    check(`${label}: balances and state unchanged`, show(pre) === show(await snap()));
  }
  async function open(label, amount, opts = {}) {
    const pre = await state(), s0 = await bal(sold, V), g0 = await bal(got, V);
    const r = await call(OWN, V, 'swap-open', args(amount, opts));
    must(`${label}: owner swap-open succeeds`, !r.vm && OK(r.res), show(r.res ?? r.vm));
    const post = await state();
    const spent = s0 - await bal(sold, V);
    // Cancellation returns already-booked proceeds; exclude that return from the new gain.
    const gained = await bal(got, V) - g0 - (pre[cfg.onMarketKey] - post[cfg.onMarketKey]);
    check(`${label}: result equals measured input/output deltas`, r.res.ok[inKey] === spent && r.res.ok[outKey] === gained && spent > 0n && gained > 0n, show({ result: r.res, spent, gained }));
    check(`${label}: inventory adds exactly the deltas`, post[invSold] === pre[invSold] + spent && post[invGot] === pre[invGot] + gained, show(post));
    const sats = post['inv-sats'], quote = post[`inv-${q}`], edge = post['edge-bps'];
    const vw = quote * SCALE / sats;
    const bound = cfg.capIsFloor ? (quote * SCALE * (BPS + edge) + sats * BPS - 1n) / (sats * BPS) : vw * (BPS - edge) / BPS;
    check(`${label}: exact VWAP and ${cfg.capFn}`, post['vwap-sell'] === vw && post[cfg.capFn] === bound, show({ vw, bound }));
    check(`${label}: event matches result and inventory`, prints(r.receipt).some(p => p.event === 'yg-swap-open' && p.caller === OWN && p[inKey] === spent && p[outKey] === gained && p['inv-sats'] === sats && p['vwap-sell'] === vw));
    return { pre, post, r, spent, gained };
  }
  setGroup('SO swap-open');
  await fundStx(OWN, 2_000_000n);
  await deploy(OWN, cfg.name, src);
  await fundStx(V, 1_000_000n);
  await fund(sold, V, cfg.scSell * 6n);
  await tx('SO set keeper', OWN, V, 'set-keeper', [someCV(P_(KEEPER))], { ok: true });
  await freshUpd();
  const amount = cfg.scSell;
  await reject('SO keeper -> NOT_OWNER', KEEPER, args(amount), E(cfg.errBase + 1));
  await reject('SO stranger -> NOT_OWNER', STRANGER, args(amount), E(cfg.errBase + 1));
  await reject('SO amount zero', OWN, args(0n), E(cfg.errBase + 6));
  await reject('SO min-out guard', OWN, args(amount, { min: 2n ** 100n }), E(3002));
  await open('SO first AMM entry', amount);
  let st = await state();
  await tx('SO rest first inventory as buy-back', KEEPER, V, 'buy-back', [uintCV(st[invGot]), uintCV(30n)], OK);
  await c.settlePending(got, V, 'SO stale setup');
  st = await state();
  must('SO buy-back actually resting before second entry', st[cfg.onMarketKey] > 0n, show(st));
  const second = await open('SO second AMM entry', amount);
  check('SO new bound makes old buy-back stale', cfg.capIsFloor ? second.post[cfg.capFn] > st[cfg.capFn] : second.post[cfg.capFn] < st[cfg.capFn], show({ before: st[cfg.capFn], after: second.post[cfg.capFn] }));
  check('SO stale buy-back pulled and cancellation printed', second.post[cfg.onMarketKey] === 0n && prints(second.r.receipt).some(p => p.event === 'yg-stale-buy-back-cancel' && p.cancelled === true));

  // An actual Jing update with a nonzero governance-set fee exercises Clarity 5 allowances.
  const oldFee = await evalIn(ORACLE, '(get-fee)'), F = 1000n;
  const recipient = await evalIn(ORACLE, '(get-fee-recipient)');
  const MAKER = mk(cfg.seed + 9);
  await freshUpd(true);
  const seed = got === 'x' ? 1_000_000n : 1_000_000_000n;
  await fundStx(MAKER, 2_000_000n);
  await fund(got, MAKER, seed);
  await tx('SO seed Jing liquidity for fee path', MAKER, MARKET, `deposit-token-${got}`, [uintCV(seed), uintCV(got === 'x' ? S.MID * 101n / 100n : S.MID * 99n / 100n), noneCV(), c.T[got], c.A[got]], OK);
  await c.settlePending(got, MAKER, 'SO fee maker');
  await setOracleFee('SO governance enables oracle fee', F);
  try {
    await freshUpd(true);
    const a = args(amount / 4n, { jing: true });
    const before = await snap(), r0 = await call(OWN, V, 'swap-open', a);
    check('SO zero oracle allowance refuses paid Jing entry atomically', (r0.vm || r0.res?.err !== undefined) && show(before) === show(await snap()), show(r0.res ?? r0.vm));
    await tx('SO allow oracle fee', OWN, V, 'set-max-oracle-fee', [uintCV(F)], { ok: true });
    const fee0 = await stxBal(recipient);
    await open('SO paid Jing entry', amount / 4n, { jing: true });
    check('SO oracle recipient received exact fee', await stxBal(recipient) === fee0 + F);
    await tx('SO allowance one below fee', OWN, V, 'set-max-oracle-fee', [uintCV(F - 1n)], { ok: true });
    const pre = await snap(), r = await call(OWN, V, 'swap-open', a);
    check('SO insufficient oracle allowance refuses atomically', (r.vm || r.res?.err !== undefined) && show(pre) === show(await snap()), show(r.res ?? r.vm));
  } finally {
    await setOracleFee('SO restore oracle fee', oldFee);
  }
  await tx('SO reset fee allowance', OWN, V, 'set-max-oracle-fee', [uintCV(0n)], { ok: true });
  await freshUpd(true);
  st = await state();
  const bound = st[cfg.capFn];
  const spread = cfg.capIsFloor ? (bound > S.MID ? (bound - S.MID) * BPS / S.MID + 100n : 100n) : (bound < S.MID ? (S.MID - bound) * BPS / S.MID + 100n : 100n);
  must('SO exit spread within market range', spread < BPS);
  await tx('SO keeper buy-back half of active-entry inventory', KEEPER, V, 'buy-back', [uintCV(st[invGot] / 2n), uintCV(spread)], OK);
  await c.settlePending(got, V, 'SO exit');
  const fill = await c.forceFill(got, V, 1, 'SO buy-back exit', { full: true });
  must('SO buy-back exit actually filled', fill && fill.d0 > fill.d1);
  await tx('SO reconcile buy-back exit', KEEPER, V, 'reconcile', [], OK);
  let post = await state();
  const have = post[cfg.heldGotKey] + post[cfg.onMarketKey];
  check('SO buy-back reduces inventory pro rata', post[invGot] === have && have < st[invGot] && post[invSold] === st[invSold] - st[invSold] * (st[invGot] - have) / st[invGot]);
  const r = await tx('SO owner swap-close remaining active-entry inventory', OWN, V, 'swap-close', args(post[invGot], { close: true }), OK);
  post = await state();
  check('SO both exit paths reset inventory, VWAP and bound', OK(r.res) && post[invGot] === 0n && post[invSold] === 0n && post['vwap-sell'] === 0n && post[cfg.capFn] === 0n, show(post));
}
