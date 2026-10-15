// Fork only. Run: node simulations/verify-router-v5-5-xyk-status.js
//   env H=<stacks height> pins the fork (default: the tip)
//
// Router v5-5 = v5-4 + XYK pool-status gate (bounty mv8wal, Cunning Nexus #1;
// their v5-3 repro: stxer c6c561c832d6f90bc37cc12de7d203c7). Bitflow's XYK
// admin can set-pool-status false on xyk-pool-sbtc-stx-v-1-1; xyk-core then
// refuses its swaps with u1010, and v5-4's cp-stage still plans an XYK leg
// from the frozen reserves, so the whole smart swap reverts u1010.
//
// One stxer session at the tip, on the LIVE set (markets-sbtc-stx-jing-v6-4,
// jing-core-v6, jing-ladder-v1, rungs, the deployed swap-router-sbtc-stx-jing-v5-4).
// v5-5 is deployed by the Jing deployer under its own (unused) name from its
// deploy bytes (_router-v5-5-bytes.mjs: v5-4 template + the two hunks).
// A probe `rtrdry-v1` runs a smart swap of either router as the caller and
// returns (err <router result>), so the swap rolls back: v5-4 and v5-5 are
// compared on the SAME state. The XYK pool is switched through its real admin
// SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR (the gist's step A2).
// Per scenario (both directions, with and without a Lazer print):
//   (c) XYK enabled: v5-5 result == v5-4 result, every leg (xyk-in > 0)
//   (a) XYK disabled: v5-4 real call -> (err u1010), nothing moved
//   (b) XYK disabled: v5-5 -> ok, xyk 0, book + DLMM legs as with XYK on,
//       the XYK share goes to Velar up to its capacity, the rest unsold;
//       min-out = out + 1 -> u3002 (nothing moved), min-out = out -> ok,
//       exact wallet deltas, XYK pool untouched
import {
  ClarityVersion, uintCV, boolCV, someCV, noneCV, trueCV, falseCV, stringAsciiCV,
} from '@stacks/transactions';
import { SimulationBuilder, getSimulationResult } from 'stxer';
import {
  DEP, SBTC, WSTX, XYK_POOL, VELAR_POOL, DLMM_POOLS, NODE, H, check, retry, evRaw, tx, fund, mk, fields, uint,
  principal, update, printsOf, printAfter, cv,
} from './_router-v5-3-harness.js';
import { routerV54Bytes, routerV55Bytes, sha256 } from './_router-v5-5-bytes.mjs';

// long session: renew the tenure cost budget every 20 fork operations
process.env.ROUTER_RENEW_TENURE = '1';
const MARKET = `${DEP}.markets-sbtc-stx-jing-v6-4`;
const V54 = `${DEP}.swap-router-sbtc-stx-jing-v5-4`;
const V55_NAME = 'swap-router-sbtc-stx-jing-v5-5';
const V55 = `${DEP}.${V55_NAME}`;
const DRY = `${DEP}.rtrdry-v1`;
const XYK_CORE = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-core-v-1-2';
const XYK_ADMIN = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR';
// limits: uSTX per sat x 1e10, the router's unit
const LEGS = ['jing-ok', 'jing-in', 'jing-out', 'dlmm-in', 'dlmm-out', 'xyk-in', 'xyk-out', 'velar-in', 'velar-out', 'unsold', 'out'];

const DRY_SRC = `;; rtrdry-v1: a smart swap of router v5-4 or v5-5 as the caller, rolled back
(define-public (dry (v5 bool) (sell-sbtc bool) (amount uint) (limit uint) (update (optional (buff 8192))) (mid uint) (min-out uint))
  (let ((res (if v5
      (if sell-sbtc
        (contract-call? '${V55} smart-swap-sbtc-for-stx amount limit update mid min-out)
        (contract-call? '${V55} smart-swap-stx-for-sbtc amount limit update mid min-out))
      (if sell-sbtc
        (contract-call? '${V54} smart-swap-sbtc-for-stx amount limit update mid min-out)
        (contract-call? '${V54} smart-swap-stx-for-sbtc amount limit update mid min-out)))))
    (if false (ok true) (err res))))
`;

const inner = (s) => { const m = /^\(err (\((?:ok|err) [\s\S]*\))\)$/.exec(String(s)); if (!m) throw new Error(`not a dry result: ${s}`); return m[1]; };
const legs = (s) => { const f = fields(s); for (const k of LEGS) if (!(k in f)) throw new Error(`missing ${k} in ${s}`); return f; };
const bal = (p) => `{ x: (unwrap-panic (contract-call? '${SBTC} get-balance '${p})), y: (stx-get-balance '${p}) }`;
async function snapshot(who) {
  const v = await evRaw(MARKET, `{ w: ${bal(who)}, m: ${bal(MARKET)},
    d: (list ${DLMM_POOLS.map((d) => `(unwrap-panic (contract-call? '${d} get-pool))`).join(' ')}), dx: (list ${DLMM_POOLS.map(bal).join(' ')}),
    k: (unwrap-panic (contract-call? '${XYK_POOL} get-pool)), v: (unwrap-panic (contract-call? '${VELAR_POOL} get-pool)), vx: ${bal(VELAR_POOL)} }`);
  if (!v.startsWith('(tuple')) throw new Error(`snapshot failed: ${v.slice(0, 300)}`);
  return v;
}
const xykPool = () => evRaw(MARKET, `(unwrap-panic (contract-call? '${XYK_POOL} get-pool))`);
const wallet = async (p) => { const f = fields(await evRaw(MARKET, bal(p))); return { x: f.x, y: f.y }; };
const setStatus = (on) => tx(`XYK admin set-pool-status ${on}`, XYK_ADMIN, XYK_CORE, 'set-pool-status', [principal(XYK_POOL), on ? trueCV() : falseCV()], '(ok true)');
const dryArgs = (v5, s, minOut) => [boolCV(v5), boolCV(s.sellX), uintCV(s.amount), uintCV(s.limit), s.print ? someCV(update(s.u)) : noneCV(), uintCV(s.mid), uintCV(minOut)];
const realArgs = (s, minOut) => [uintCV(s.amount), uintCV(s.limit), s.print ? someCV(update(s.u)) : noneCV(), uintCV(s.mid), uintCV(minOut)];
const smartFn = (sellX) => (sellX ? 'smart-swap-sbtc-for-stx' : 'smart-swap-stx-for-sbtc');

// A maker order on the live v6-4 book on the taker's opposite side, fixed
// limit at the fork's Lazer mid; when the opposite side holds orders it goes
// pending and is settled with a print signed after the submit.
async function placeMaker(s) {
  const side = s.sellX ? 'y' : 'x', who = s.maker;
  const u = await printAfter(Number(uint(await evRaw(MARKET, 'stacks-block-time'))));
  const amount = side === 'y' ? 5_000_000_000n : 2_500_000n;
  await fund(side, who, amount + (side === 'y' ? 1_000_000n : 0n));
  const t = side === 'y' ? principal(WSTX) : principal(SBTC), a = stringAsciiCV(side === 'y' ? 'wstx' : 'sbtc-token');
  await tx(`${s.name}: maker deposit-token-${side} ${amount} at mid ${u.mid}`, who, MARKET, `deposit-token-${side}`, [uintCV(amount), uintCV(u.mid), noneCV(), t, a], `(ok u${amount})`);
  const pending = await evRaw(MARKET, `(map-get? token-${side}-pending-deposits '${who})`);
  if (pending !== 'none') {
    const v = await printAfter(Number(uint(await evRaw(MARKET, 'stacks-block-time'))));
    const r = await tx(`${s.name}: settle the maker's pending deposit`, DEP, MARKET, `settle-token-${side}-deposit`, [principal(who), update(v), t, a], (x) => x.startsWith('(ok'));
    console.log(`  settle events: ${printsOf(r, MARKET).map((p) => p.slice(0, 200)).join(' | ')}`);
  }
  const resting = uint(await evRaw(MARKET, `(get-token-${side}-deposit (var-get current-cycle) '${who})`));
  check(`${s.name}: maker order rests on the book`, resting > 0n, true);
}

async function scenario(s) {
  const tag = s.name, sold = s.sellX ? 'x' : 'y', bought = s.sellX ? 'y' : 'x';
  console.log(`\n######## ${tag}: ${s.sellX ? 'sell sBTC' : 'sell STX'} ${s.amount}, limit ${s.limit}, ${s.print ? 'with' : 'no'} Lazer print ########`);
  check(`${tag}: XYK pool enabled`, /\(pool-status true\)/.test(await xykPool()), true);
  if (s.maker) await placeMaker(s);
  if (s.print) {
    // a fresh signed print per scenario (the market refuses one older than 80 s)
    s.u = await printAfter(Number(uint(await evRaw(MARKET, 'stacks-block-time'))));
    s.mid = s.u.mid;
    const q = await evRaw(MARKET, `(get-taker-capacity u${s.mid} u${s.limit} ${s.sellX} '${s.taker} (some 0x${s.u.hex.replace(/^0x/, '')}))`);
    console.log(`  print at ${s.u.at}, mid ${s.mid}; book quote at the limit: ${q}`);
    if (s.maker) check(`${tag}: the book has room at the limit (gross-cap > 0)`, fields(q)['gross-cap'] > 0n, true);
  }
  // (c) XYK enabled: same state, both routers
  const e4 = inner((await tx(`${tag}: v5-4 dry, XYK enabled`, s.taker, DRY, 'dry', dryArgs(false, s, 0n), (v) => /^\(err \(ok /.test(v))).result);
  const e5 = inner((await tx(`${tag}: v5-5 dry, XYK enabled`, s.taker, DRY, 'dry', dryArgs(true, s, 0n), (v) => /^\(err \(ok /.test(v))).result);
  const L4 = legs(e4);
  check(`${tag}: v5-4 plans an XYK leg (xyk-in > 0)`, L4['xyk-in'] > 0n, true);
  check(`${tag}: (c) v5-5 == v5-4, every leg, XYK enabled`, e5, e4);
  if (s.maker) check(`${tag}: the book leg fills (jing-ok, jing-in > 0)`, L4['jing-ok'] === true && L4['jing-in'] > 0n, true);
  // disable through the real admin
  await setStatus(false);
  const k0 = await xykPool();
  check(`${tag}: XYK pool disabled`, /\(pool-status false\)/.test(k0), true);
  if (s.direct) {
    await tx(`${tag}: direct xyk-core swap-y-for-x 100 STX on the disabled pool`, s.taker, XYK_CORE, 'swap-y-for-x',
      [principal(XYK_POOL), principal(SBTC), principal(WSTX), uintCV(100_000_000n), uintCV(1n)], '(err u1010)');
  }
  // (a) v5-4 control: the real call reverts u1010, nothing moves
  const before = await snapshot(s.taker);
  const ra = await tx(`${tag}: (a) v5-4 ${smartFn(s.sellX)}, XYK disabled`, s.taker, V54, smartFn(s.sellX), realArgs(s, 0n), '(err u1010)');
  check(`${tag}: (a) nothing moved`, (await snapshot(s.taker)) === before ? 'unchanged' : 'CHANGED', 'unchanged');
  check(`${tag}: (a) no committed event`, printsOf(ra).length, 0);
  await tx(`${tag}: v5-4 dry, XYK disabled`, s.taker, DRY, 'dry', dryArgs(false, s, 0n), '(err (err u1010))');
  // (b) v5-5: succeeds without the XYK leg
  const d5 = inner((await tx(`${tag}: (b) v5-5 dry, XYK disabled`, s.taker, DRY, 'dry', dryArgs(true, s, 0n), (v) => /^\(err \(ok /.test(v))).result);
  const D = legs(d5), E = legs(e5);
  check(`${tag}: (b) xyk-in 0, xyk-out 0`, `${D['xyk-in']} ${D['xyk-out']}`, '0 0');
  for (const k of ['jing-ok', 'jing-in', 'jing-out', 'dlmm-in', 'dlmm-out']) check(`${tag}: (b) ${k} as with XYK enabled`, D[k], E[k]);
  // S1 (the finding's shape) can sit where the book and DLMM have no room;
  // the wider scenarios must route part through them
  if (s.bookOrDlmm) check(`${tag}: (b) book + DLMM fill part of it (jing-in + dlmm-in > 0)`, D['jing-in'] + D['dlmm-in'] > 0n, true);
  const left = s.amount - D['jing-in'] - D['dlmm-in'];
  const capV = uint(await evRaw(V55, `(cp-capacity (velar-reserves ${s.sellX}) (velar-keep) u${s.limit} ${s.sellX})`));
  const share = left <= capV ? left : capV;
  const dust = await evRaw(V55, `(list (dust-left u${left} u${s.limit} ${s.sellX}) (dust-left u${share} u${s.limit} ${s.sellX}))`);
  const wantV = dust.startsWith('(list true') || dust === '(list false true)' ? 0n : share;
  console.log(`  left after book+DLMM ${left}; velar cap ${capV}; enabled split xyk ${E['xyk-in']} velar ${E['velar-in']} unsold ${E.unsold}`);
  check(`${tag}: (b) velar-in == min(left ${left}, velar cap ${capV}) (dust ${dust})`, D['velar-in'], wantV);
  check(`${tag}: (b) unsold == left - velar-in`, D.unsold, left - D['velar-in']);
  check(`${tag}: (b) the XYK share is not filled elsewhere above Velar's room: velar-in >= enabled velar-in`, D['velar-in'] >= E['velar-in'], true);
  check(`${tag}: (b) out > 0`, D.out > 0n, true);
  // min-out respected: out + 1 refused, nothing moved
  const b1 = await snapshot(s.taker);
  const rm = await tx(`${tag}: (b) v5-5 real call, min-out = out + 1`, s.taker, V55, smartFn(s.sellX), realArgs(s, D.out + 1n), '(err u3002)');
  check(`${tag}: (b) min-out refusal moved nothing`, (await snapshot(s.taker)) === b1 ? 'unchanged' : 'CHANGED', 'unchanged');
  check(`${tag}: (b) min-out refusal: no committed event`, printsOf(rm).length, 0);
  // min-out = out: executes exactly as the dry run
  const w0 = await wallet(s.taker);
  const r = await tx(`${tag}: (b) v5-5 real call, min-out = out, XYK disabled`, s.taker, V55, smartFn(s.sellX), realArgs(s, D.out), (v) => v.startsWith('(ok'));
  check(`${tag}: (b) real result == dry result`, r.result, d5);
  const w1 = await wallet(s.taker);
  check(`${tag}: (b) taker paid amount - unsold`, w0[sold] - w1[sold], s.amount - D.unsold);
  check(`${tag}: (b) taker got out`, w1[bought] - w0[bought], D.out);
  check(`${tag}: (b) XYK pool untouched`, await xykPool(), k0);
  const pr = printsOf(r, V55).find((p) => p.includes('smart-swap'));
  check(`${tag}: (b) print xyk-cap u0, xyk-in u0`, pr && /\(xyk-cap u0\)/.test(pr) && /\(xyk-in u0\)/.test(pr), true);
  await setStatus(true);
  return { tag, enabled: e4, disabled: d5, sid: H.sid };
}

async function main() {
  // provenance: the deployed v5-4 is the template the v5-5 bytes are built on
  const live = await (await fetch(`${NODE}/v2/contracts/source/${DEP}/swap-router-sbtc-stx-jing-v5-4?proof=0`)).json();
  check('deployed v5-4 source == v5-4 template (base of the v5-5 bytes)', live.source === routerV54Bytes(), true);
  const v55 = routerV55Bytes();
  console.log(`v5-5 deploy bytes: ${Buffer.byteLength(v55)} B, sha256 ${sha256(v55)}`);
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  if (process.env.H) b.useBlockHeight(Number(process.env.H));
  b.withSender(DEP).addContractDeploy({ contract_name: V55_NAME, source_code: v55, clarity_version: ClarityVersion.Clarity5 });
  b.withSender(DEP).addContractDeploy({ contract_name: 'rtrdry-v1', source_code: DRY_SRC, clarity_version: ClarityVersion.Clarity5 });
  H.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${H.sid}`);
  const setup = await retry(() => getSimulationResult(H.sid));
  const deploys = setup.steps.filter((st) => st.Result?.Transaction);
  check('two deploys', deploys.length, 2);
  for (const st of deploys) {
    const t = st.Result.Transaction.Ok;
    check('deploy ok', t && !t.vm_error ? cv(t.result) : JSON.stringify(st.Result).slice(0, 300), '(ok true)');
  }
  check('v5-5 targets the live market v6-4', await evRaw(V55, '(list JING_MARKET)'), `(list ${MARKET})`);
  check('v5-4 targets the live market v6-4', await evRaw(V54, '(list JING_MARKET)'), `(list ${MARKET})`);
  check('XYK core admins', await evRaw(MARKET, `(contract-call? '${XYK_CORE} get-admins)`), `(ok (list ${XYK_ADMIN}))`);
  check('XYK pool x-token is sBTC', /\(x-token SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4\.sbtc-token\)/.test(await xykPool()), true);

  const TX = mk(551), TY = mk(552);
  await fund('x', TX, 20_000_000n);
  await fund('y', TY, 60_000_000_000n);
  const u0 = await printAfter(Number(uint(await evRaw(MARKET, 'stacks-block-time'))));
  const mid = u0.mid;
  console.log(`Lazer print at ${u0.at}, mid ${mid}`);
  // limits around the XYK pool's own price (the Lazer mid can sit ~1% off
  // the AMMs; a limit inside the XYK fee band would plan no XYK leg at all)
  const kp = fields(await xykPool());
  const P = kp['y-balance'] * 10_000_000_000n / kp['x-balance'];
  console.log(`XYK price ${P} (${Number((P - mid) * 100_000n / mid) / 10} bps vs mid)`);
  const at = (bps) => P * BigInt(10_000 + bps) / 10_000n;
  const S = [
    // the finding's A7 shape: 2,000 STX, with the print
    { name: 'S1', sellX: false, amount: 2_000_000_000n, limit: at(150), print: true, mid, taker: TY, direct: true },
    { name: 'S2', bookOrDlmm: true, sellX: false, amount: 20_000_000_000n, limit: at(300), mid, taker: TY },
    { name: 'S3', bookOrDlmm: true, sellX: true, amount: 5_000_000n, limit: at(-300), print: true, mid, taker: TX },
    { name: 'S4', bookOrDlmm: true, sellX: true, amount: 2_000_000n, limit: at(-500), mid, taker: TX },
    // with a maker resting on the book: book + DLMM + Velar (+ XYK when on)
    { name: 'S5', bookOrDlmm: true, sellX: true, amount: 5_000_000n, limit: at(-300), print: true, mid, taker: TX, maker: mk(553) },
    { name: 'S6', bookOrDlmm: true, sellX: false, amount: 20_000_000_000n, limit: at(300), print: true, mid, taker: TY, maker: mk(554) },
  ];
  const out = [];
  for (const s of S) out.push(await scenario(s));
  console.log(`\nresults: ${JSON.stringify(out.map(({ tag, enabled, disabled }) => ({ tag, enabled, disabled })))}`);
  console.log(`${H.passed}/${H.checks} checks green`);
  console.log(`Sim: https://stxer.xyz/simulations/mainnet/${H.sid}`);
}
main().catch((e) => { console.error(e.message ?? e); console.log(`${H.passed}/${H.checks} checks green`); process.exit(1); });
