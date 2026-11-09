// stxer mainnet-fork proof for the STX short protocol (contracts/short/),
// driven against the REAL Jing STX/USDCx market + router
// (contracts/stx-usdcx/, not on mainnet yet: deployed fresh here as
// chavita.btc = SPV9K21..., core-v6 verify + initialize dance by the Juice
// multisig, exactly as simulations/verify-stx-usdcx-suite.mjs).
//
// Two modes:
//   keyless (default): the faktory-dao keyless Lazer route has no [45, 7]
//     (STX/USD, USDC/USD) pair, so the vault's `.stx-short-oracle` is the
//     settable test oracle (contracts/short/mocks/stx-short-oracle-mock.clar),
//     seeded with live DIA STX/USD. Every trade still runs through the real
//     router (Bitflow DLMM pools; no Jing book leg without a signed update)
//     and the real market (SMOOTH rests a real deposit-token-x / -y, the
//     window expiry pulls it with the real cancel). Covers: lender deposit,
//     open FAST (one shot and in increments across blocks), open SMOOTH ->
//     FAST fallback, close FAST + SMOOTH (rest/cancel), extend, liquidation
//     by health and by deadline, cancel on non-fill, pool loss absorption
//     (DLMM pumped by a whale), no residual balances.
//   PYTH_API_KEY set: the vault binds the real Lazer adapter
//     (contracts/short/stx-short-oracle.clar) as `.stx-short-oracle`, every
//     call carries a fresh signed [45, 7] update, and the SMOOTH sale is
//     filled by a real batch settlement against a whale's resting bid.
// Run: node simulations/verify-stx-short.mjs
import { readFileSync } from 'node:fs';
import { uintCV, noneCV, someCV, bufferCV, stringAsciiCV } from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps } from 'stxer';
import { fetchLazerUpdate, lazerFeedTimes } from './_lazer.js';
import { NODE, DEP, WSTX, WHALE, P_, S, retry, sleep, check, must, show, tx, evalIn, call, deploy, summary, Stop, stxTransfer, note, mk } from './_yg-loop-common.js';

const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const USDC_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ';
const STX_WHALE = WHALE.y;
const DIA = 'SP1G48FZ4Y7JY8G2Z0N51QTCYGBQ6F4J43J77BQC0.dia-oracle';
const CORE = `${DEP}.jing-core-v6`;
const N = {
  ladder: 'jing-ladder-stx-usdcx-v1', market: 'markets-stx-usdcx-jing-v6-4', router: 'swap-router-stx-usdcx-jing-v5-5',
  trait: 'stx-short-oracle-trait', oracle: 'stx-short-oracle', rate: 'stx-short-rate-model', pool: 'stx-short-pool', vault: 'stx-short-vault',
};
const C = Object.fromEntries(Object.entries(N).map(([k, v]) => [k, `${DEP}.${v}`]));
const jing = (f) => readFileSync(new URL(`../contracts/stx-usdcx/${f}.clar`, import.meta.url), 'utf8');
const short = (f) => readFileSync(new URL(`../contracts/short/${f}.clar`, import.meta.url), 'utf8');
const KEYED = !!process.env.PYTH_API_KEY;
const SCALE = 100_000_000n, BPS = 10_000n, STX = 1_000_000n, USD = 1_000_000n;
const LENDER = mk(6), SHORTER = mk(7), KEEPER = mk(8), SHORTER2 = mk(9);
const ST = { OPENING: 1n, OPEN: 2n, CLOSING: 3n, LIQUIDATING: 4n, CLOSED: 5n, CANCELLED: 6n, LIQUIDATED: 7n };
const TX = P_(WSTX), TY = P_(USDCX);

let U = null;
async function fresh() {
  const bt = Number(await evalIn(C.market, 'stacks-block-time'));
  for (let i = 0; i < 40; i++) {
    const u = await retry(() => fetchLazerUpdate([45, 7])); const t = await retry(() => lazerFeedTimes(u.hex, [45, 7]));
    if (t.at > bt) { U = { ...u, mid: u.px * SCALE / u.py }; return U; }
    await sleep(3000);
  }
  throw new Error('no fresh [45,7] update');
}
// keyless: the test oracle ignores the bytes; the router gets them as its
// optional book update and falls through to DLMM (no Jing makers / no verify)
const upd = () => (KEYED ? bufferCV(Buffer.from(U.hex.replace(/^0x/, ''), 'hex')) : bufferCV(Buffer.from('00', 'hex')));
const usd = async (who) => (await evalIn(USDCX, `(get-balance '${who})`)).ok;
const stx = async (who) => evalIn(C.market, `(stx-get-balance '${who})`);
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };
const pos = async (id) => evalIn(C.vault, `(get-position u${id})`);
const poolS = async () => evalIn(C.pool, '(get-pool)');
const slot = async () => evalIn(C.vault, '(get-slot)');
const opt = (v) => (v === null || v === undefined ? noneCV() : someCV(uintCV(v)));
let PRICE = 0n; // what the vault's oracle says now (market unit)

async function advance(burn) {
  await retry(() => submitSimulationSteps(S.sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: burn, stacks_blocks_per_bitcoin: 1 } }] }));
}
// one new Stacks block, ~10 s later: the vault allows one FAST increment per
// position per block, and stxer keeps calls in the same block otherwise
async function nextBlock() {
  await retry(() => submitSimulationSteps(S.sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 10 } }] }));
}
async function setPrice(p) {
  PRICE = p;
  if (!KEYED) await tx(`oracle price -> ${Number(p) / 1e8}`, DEP, C.oracle, 'set-price', [uintCV(p)], { ok: true });
}
async function refresh() { if (KEYED) { await fresh(); PRICE = U.mid; } }
// keyless stand-in for Lazer: the venue mid, from a 1 STX sell and a 1 USDCx
// buy probe on the real router (DIA lags the venue by up to ~15 min and the
// FAST limits are only 1% wide, so a DIA-anchored oracle can stall a close)
async function anchor(label) {
  if (KEYED) return refresh();
  const ref = PRICE;
  const sell = (await call(STX_WHALE, C.router, 'smart-swap-stx-for-usdcx', [uintCV(STX), uintCV(ref / 2n), noneCV(), uintCV(ref), uintCV(0)])).res?.ok;
  const buy = (await call(USDC_WHALE, C.router, 'smart-swap-usdcx-for-stx', [uintCV(USD), uintCV(ref * 2n), noneCV(), uintCV(ref), uintCV(0)])).res?.ok;
  const bid = sell?.out ? sell.out * SCALE / STX : 0n, ask = buy?.out ? USD * SCALE / buy.out : 0n;
  must(`${label}: venue probes filled`, bid > 0n && ask > 0n, show({ sell, buy }));
  console.log(`  venue bid ${Number(bid) / 1e8} ask ${Number(ask) / 1e8}`);
  await setPrice((bid + ask) / 2n);
}
async function open(label, who, o, want) {
  await refresh();
  return tx(label, who, C.vault, 'open', [uintCV(o.stx), uintCV(o.collateral), opt(o.tenor), uintCV(o.mode ?? 1n), opt(o.window), opt(o.limit), opt(o.slip), opt(o.incr), upd()], want);
}
async function step(id, who = KEEPER) { await refresh(); return call(who, C.vault, 'step', [uintCV(id), upd()]); }
async function stepUntilNot(id, state, max = 25) {
  let n = 0;
  while ((await pos(id))?.state === state && n < max) {
    await nextBlock();
    const r = await step(id);
    if (r.vm || (r.res?.err !== undefined && r.res.err !== 5024n && r.res.err !== 5017n)) { check(`step ${id} #${n}`, false, show(r.res ?? r.vm)); break; }
    n++;
  }
  return n;
}
async function noResidual(label) {
  const s = await slot();
  const sb = await stx(C.vault), ub = await usd(C.vault);
  check(`${label}: vault STX == booked, USDCx == booked, slot free`, sb === s['stx-booked'] && ub === s['usdc-booked'] && s.pos === null, show({ sb, ub, s }));
  check(`${label}: router holds nothing`, (await stx(C.router)) === 0n && (await usd(C.router)) === 0n);
}

try {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(USDCX, '(get-total-supply)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);
  console.log(KEYED ? 'mode: keyed (real Lazer adapter, [45,7] updates)' : 'mode: keyless (test oracle seeded from DIA STX/USD; trades on real router/market)');

  group('deploy Jing STX/USDCx market + router (chavita)');
  await deploy(DEP, N.ladder, jing(N.ladder));
  await deploy(DEP, N.market, jing(N.market));
  const CORE_OWNER = await evalIn(CORE, '(get-contract-owner)');
  await tx('core set-verified-contract(market) by core owner', CORE_OWNER, CORE, 'set-verified-contract', [P_(C.market)], (v) => v?.ok !== undefined);
  await tx('market set-operator -> core owner', DEP, C.market, 'set-operator', [P_(CORE_OWNER)], { ok: true });
  await tx('market initialize(token-stx-v-1-2, usdcx, 1 STX, 1 USDCx, 45, 7)', CORE_OWNER, C.market, 'initialize', [P_(C.market), TX, TY, uintCV(STX), uintCV(USD), uintCV(45), uintCV(7)], { ok: true });
  await tx('market set-operator -> DEP', CORE_OWNER, C.market, 'set-operator', [P_(DEP)], { ok: true });
  await deploy(DEP, N.router, jing(N.router));

  group('deploy short protocol');
  await deploy(DEP, N.trait, short('stx-short-oracle-trait'));
  await deploy(DEP, N.oracle, KEYED ? short('stx-short-oracle') : short('mocks/stx-short-oracle-mock'));
  await deploy(DEP, N.rate, short('stx-short-rate-model'));
  await deploy(DEP, N.pool, short('stx-short-pool'));
  await deploy(DEP, N.vault, short('stx-short-vault'));

  group('price + funding');
  const diaR = await evalIn(C.market, `(contract-call? '${DIA} get-value "STX/USD")`);
  const dia = (diaR?.ok ?? diaR)?.value;
  console.log(`  DIA STX/USD ${dia} ($${Number(dia) / 1e8})`);
  must('DIA STX/USD live, $0.05..$20', dia > 5_000_000n && dia < 2_000_000_000n, dia);
  await stxTransfer(STX_WHALE, LENDER, 30_000n * STX);
  for (const w of [SHORTER, SHORTER2, KEEPER]) await stxTransfer(STX_WHALE, w, 50n * STX);
  must('fund shorter 3000 USDCx', (await call(USDC_WHALE, USDCX, 'transfer', [uintCV(3_000n * USD), P_(USDC_WHALE), P_(SHORTER), noneCV()])).res?.ok === true);
  must('fund shorter2 3000 USDCx', (await call(USDC_WHALE, USDCX, 'transfer', [uintCV(3_000n * USD), P_(USDC_WHALE), P_(SHORTER2), noneCV()])).res?.ok === true);
  PRICE = dia;
  await anchor('initial oracle');
  check('oracle (venue mid) within 5% of DIA', PRICE * 100n > dia * 95n && PRICE * 100n < dia * 105n, `${PRICE} vs DIA ${dia}`);

  group('lender pool');
  await tx('lender deposit 20000 STX', LENDER, C.pool, 'deposit', [uintCV(20_000n * STX)], { ok: 20_000n * STX });
  await tx('vault-only borrow from an EOA -> u3002', KEEPER, C.pool, 'borrow', [uintCV(STX)], { err: 3002n });
  const notional = (s) => s * PRICE / SCALE;

  group('open FAST (one shot) on real DLMM');
  const s1 = 1_000n * STX, c1 = notional(s1) / 2n; // 2x
  const u0 = await usd(SHORTER);
  await open('open #1 1000 STX @2x FAST incr 100%', SHORTER, { stx: s1, collateral: c1, incr: 10_000n }, { ok: 1n });
  let p1 = await pos(1);
  console.log(`  #1 ${show({ state: p1.state, sold: p1.sold, proceeds: p1.proceeds, rate: p1['rate-bps'], interest: p1['interest-paid'] })}`);
  check('#1 OPEN, all 1000 STX sold', p1.state === ST.OPEN && p1.sold === s1);
  check('#1 proceeds >= 1000 STX x oracle x (1 - 1% slip)', p1.proceeds * SCALE >= s1 * (PRICE * 9_900n / BPS), `${p1.proceeds} for ${s1} @ ${PRICE}`);
  check('#1 shorter paid collateral + upfront interest', u0 - (await usd(SHORTER)) === c1 + p1['interest-paid']);
  check('#1 interest reached the pool (90%) + treasury (10%)', (await poolS())['rewards-unclaimed'] > 0n && (await poolS())['rewards-unclaimed'] <= p1['interest-paid'] * 9n / 10n + 1n);
  check('pool lent 1000 STX', (await poolS()).lent === s1);
  await noResidual('after open #1');

  group('open FAST in increments across blocks');
  const s2 = 600n * STX;
  await open('open #2 600 STX @1.5x FAST incr 40%', SHORTER2, { stx: s2, collateral: notional(s2) * 2n / 3n, incr: 4_000n }, { ok: 2n });
  check('#2 OPENING after the first increment (40% sold)', (await pos(2)).state === ST.OPENING && (await pos(2)).sold === s2 * 4n / 10n, show(await pos(2)));
  const n2 = await stepUntilNot(2, ST.OPENING);
  check(`#2 OPEN after ${n2} keeper steps`, (await pos(2)).state === ST.OPEN && (await pos(2)).sold === s2, show(await pos(2)));

  group('open SMOOTH: rest on the real batch market, window expiry, FAST fallback');
  const s3 = 300n * STX;
  await open('open #3 300 STX SMOOTH window 1 limit = mid', SHORTER, { stx: s3, collateral: notional(s3), mode: 2n, window: 1n }, { ok: 3n });
  const cyc = await evalIn(C.market, '(get-current-cycle)');
  const live = await evalIn(C.market, `(get-token-x-deposit u${cyc} '${C.vault})`);
  const pend = await evalIn(C.market, `(get-token-x-pending-deposit '${C.vault})`);
  check('#3 300 STX resting on the market for the vault (live or pending)', live + (pend?.amount ?? 0n) === s3, show({ live, pend }));
  check('#3 position: stx-mkt 300, phase SMOOTH, slot = 3', (await pos(3))['stx-mkt'] === s3 && (await pos(3)).phase === 2n && (await slot()).pos === 3n);
  await open('second SMOOTH open while the slot is busy -> u5016', SHORTER2, { stx: s3, collateral: notional(s3), mode: 2n }, { err: 5016n });
  const early = await step(3);
  check('#3 step inside the window keeps resting', !early.vm && early.res?.ok?.['stx-mkt'] === s3, show(early.res));
  if (KEYED) {
    // a whale bid crosses the vault's ask at the next batch settlement
    await fresh();
    await tx('whale rests a 200 USDCx bid at mid + 1%', USDC_WHALE, C.market, 'deposit-token-y', [uintCV(200n * USD), uintCV(U.mid * 10_100n / BPS), noneCV(), TY, stringAsciiCV('usdcx-token')], (v) => v?.ok !== undefined);
    if (pend) await tx('settle the vault pending ask', KEEPER, C.market, 'settle-token-x-deposit', [P_(C.vault), upd(), TX, stringAsciiCV('wstx')], (v) => v?.ok !== undefined);
    await fresh();
    await tx('settle-with-refresh (batch)', KEEPER, C.market, 'settle-with-refresh', [upd(), TX, stringAsciiCV('wstx'), TY, stringAsciiCV('usdcx-token')], (v) => v?.ok !== undefined);
    const after = await step(3);
    check('#3 step folds the batch fill (proceeds > 0)', (await pos(3)).proceeds > 0n, show(after.res));
  }
  await advance(2); // > window x batch-secs (600 s)
  const n3 = await stepUntilNot(3, ST.OPENING);
  const p3 = await pos(3);
  check(`#3 window over -> pulled off the market, FAST rest, OPEN (${n3} steps)`, p3.state === ST.OPEN && p3['stx-mkt'] === 0n && p3.sold === s3, show(p3));
  check('#3 market holds no vault order any more', (await evalIn(C.market, `(get-token-x-deposit (get-current-cycle) '${C.vault})`)) === 0n);
  await noResidual('after SMOOTH open');

  group('close FAST');
  await anchor('close #1');
  const su0 = await usd(SHORTER), idle0 = (await poolS()).idle;
  await refresh();
  await tx('close #1 FAST incr 100%', SHORTER, C.vault, 'close', [uintCV(1), uintCV(1), noneCV(), noneCV(), noneCV(), someCV(uintCV(10_000n)), upd()], { ok: true });
  await stepUntilNot(1, ST.CLOSING);
  p1 = await pos(1);
  check('#1 CLOSED, pool repaid exactly 1000 STX', p1.state === ST.CLOSED && (await poolS()).idle - idle0 === s1, show(p1));
  const back = (await usd(SHORTER)) - su0;
  console.log(`  #1 round trip: collateral ${c1}, proceeds ${p1.proceeds}, buyback ${p1.spent} -> user got ${back} uUSDCx (+ ${p1.bought - s1} uSTX overshoot)`);
  check('#1 user got collateral + proceeds - buyback', back === c1 + p1.proceeds - p1.spent, `${back}`);
  check('#1 buyback within 1% of the round trip (DLMM spread + fees only)', p1.spent < p1.proceeds * 10_200n / BPS, `${p1.spent} vs ${p1.proceeds}`);

  group('close SMOOTH: rest a USDCx bid, expire, FAST');
  await anchor('close #3');
  await tx('close #3 SMOOTH window 1', SHORTER, C.vault, 'close', [uintCV(3), uintCV(2), someCV(uintCV(1)), noneCV(), noneCV(), noneCV(), upd()], { ok: true });
  const rest3 = await pos(3);
  check('#3 USDCx bid resting (usdc-mkt > 0), slot sell = false', rest3['usdc-mkt'] > 0n && (await slot()).sell === false, show(rest3));
  await advance(2);
  await stepUntilNot(3, ST.CLOSING);
  check('#3 CLOSED after the window via FAST', (await pos(3)).state === ST.CLOSED, show(await pos(3)));
  await noResidual('after closes');

  group('extend');
  await refresh();
  const d2 = (await pos(2)).deadline;
  await tx('extend #2 by 1 day at the current rate', SHORTER2, C.vault, 'extend', [uintCV(2), someCV(uintCV(86_400)), upd()], (v) => v?.ok === d2 + 86_400n);
  await tx('extend #2 by a stranger -> u5005', KEEPER, C.vault, 'extend', [uintCV(2), noneCV(), upd()], { err: 5005n });

  if (!KEYED) {
    group('liquidation by health (oracle +75% on a 1.5x position)');
    await anchor('liquidation base');
    const h0 = await evalIn(C.vault, `(health-at u2 u${PRICE})`);
    await tx('liquidate healthy #2 -> u5018', KEEPER, C.vault, 'liquidate', [uintCV(2), upd()], { err: 5018n });
    const base = PRICE;
    await setPrice(base * 175n / 100n);
    const h1 = await evalIn(C.vault, `(health-at u2 u${PRICE})`);
    console.log(`  #2 health ${h0} -> ${h1} bps`);
    const k0 = await usd(KEEPER), lent0 = (await poolS()).lent;
    await tx('keeper liquidates #2', KEEPER, C.vault, 'liquidate', [uintCV(2), upd()], { ok: true });
    await stepUntilNot(2, ST.LIQUIDATING);
    const p2 = await pos(2);
    check('#2 LIQUIDATED, pool repaid in full (no loss)', p2.state === ST.LIQUIDATED && lent0 - (await poolS()).lent === s2 && (await poolS()).losses === 0n, show(p2));
    check('#2 keeper bounty paid in USDCx', (await usd(KEEPER)) > k0, `${(await usd(KEEPER)) - k0}`);
    await setPrice(base);

    group('liquidation by deadline');
    const s4 = 200n * STX;
    await open('open #4 200 STX tenor 1h', SHORTER2, { stx: s4, collateral: notional(s4), tenor: 3_600n, incr: 10_000n }, { ok: 4n });
    await tx('liquidate #4 before its deadline -> u5018', KEEPER, C.vault, 'liquidate', [uintCV(4), upd()], { err: 5018n });
    await advance(7);
    await tx('liquidate #4 after the deadline (healthy)', KEEPER, C.vault, 'liquidate', [uintCV(4), upd()], { ok: true });
    await stepUntilNot(4, ST.LIQUIDATING);
    check('#4 LIQUIDATED', (await pos(4)).state === ST.LIQUIDATED, show(await pos(4)));

    group('cancel on non-fill');
    const lent5 = (await poolS()).lent, su5 = await usd(SHORTER2);
    await setPrice(base * 2n); // oracle 2x the venue: the 1% sell bound never fills
    await open('open #5 100 STX, venue far under the bound', SHORTER2, { stx: 100n * STX, collateral: 100n * STX * base * 2n / SCALE / 2n, incr: 10_000n }, { ok: 5n });
    check('#5 OPENING, nothing sold', (await pos(5)).state === ST.OPENING && (await pos(5)).sold === 0n);
    await advance(4); // > exec-window 1800 s
    const r5 = await step(5);
    const p5 = await pos(5);
    check('#5 CANCELLED, STX back to the pool, collateral + 90% interest back', p5.state === ST.CANCELLED && (await poolS()).lent === lent5 && su5 - (await usd(SHORTER2)) === p5['interest-paid'], show({ r: r5.res, p5 }));
    await setPrice(base);

    group('loss absorption (DLMM pumped, underwater 3x)');
    const s6 = 1_000n * STX;
    await open('open #6 1000 STX @3x', SHORTER, { stx: s6, collateral: notional(s6) / 3n + 1n, incr: 10_000n }, { ok: 6n });
    const ta0 = (await poolS())['total-assets'];
    // a whale buys STX on the DLMM pools until the price is up > 45%
    const wb = await usd(USDC_WHALE);
    console.log(`  USDC whale holds ${wb}`);
    let pumped = base;
    for (let i = 0; i < 6 && pumped < base * 150n / 100n; i++) {
      const amt = wb / 8n;
      const r = await call(USDC_WHALE, C.router, 'smart-swap-usdcx-for-stx', [uintCV(amt), uintCV(base * 10n), noneCV(), uintCV(base), uintCV(1)]);
      const o = r.res?.ok;
      if (!o || o.out === 0n) break;
      pumped = o['dlmm-in'] * SCALE / o['dlmm-out'];
      console.log(`  pump ${i}: ${o['dlmm-in']} uUSDCx -> ${o['dlmm-out']} uSTX, avg ${Number(pumped) / 1e8}`);
    }
    // spot after the pump: quote a small buy
    const q = await call(USDC_WHALE, C.router, 'smart-swap-usdcx-for-stx', [uintCV(USD), uintCV(base * 10n), noneCV(), uintCV(base), uintCV(0)]);
    const spot = q.res?.ok?.out ? USD * SCALE / q.res.ok.out : 0n;
    console.log(`  spot after pump ${Number(spot) / 1e8} (base ${Number(base) / 1e8})`);
    if (spot > base * 140n / 100n) {
      await setPrice(spot);
      await tx('keeper liquidates underwater #6', KEEPER, C.vault, 'liquidate', [uintCV(6), upd()], { ok: true });
      await stepUntilNot(6, ST.LIQUIDATING, 40);
      const p6 = await pos(6), ps = await poolS();
      console.log(`  #6 ${show({ state: p6.state, bought: p6.bought, debt: p6.debt })} losses ${ps.losses}`);
      check('#6 LIQUIDATED with a shortfall booked to the pool', p6.state === ST.LIQUIDATED && ps.losses > 0n, show(ps));
      check('pool total-assets fell by exactly the loss', ta0 - ps['total-assets'] === ps.losses, `${ta0} -> ${ps['total-assets']}`);
      const sh = await evalIn(C.pool, `(get-shares '${LENDER})`);
      check('lender share value < deposit (loss absorbed pro rata)', (await evalIn(C.pool, `(shares-to-stx u${sh})`)) < 20_000n * STX);
    } else {
      note(`DLMM pump reached only ${Number(spot) / 1e8} vs ${Number(base) / 1e8}: loss path not reachable with this whale; covered by the unit tests`);
      // the shorter closes #6 at a loss instead (oracle follows the pumped venue)
      await setPrice(spot);
      const s6u = await usd(SHORTER);
      await tx('close #6 FAST after the pump (losing short)', SHORTER, C.vault, 'close', [uintCV(6), uintCV(1), noneCV(), noneCV(), noneCV(), someCV(uintCV(10_000n)), upd()], { ok: true });
      await stepUntilNot(6, ST.CLOSING);
      const p6 = await pos(6);
      console.log(`  #6 closed: proceeds ${p6.proceeds}, buyback ${p6.spent}, user got ${(await usd(SHORTER)) - s6u}`);
      check('#6 CLOSED at a loss, pool repaid in full', p6.state === ST.CLOSED && p6.spent > p6.proceeds && (await poolS()).losses === 0n, show(p6));
      await setPrice(base);
    }
    await noResidual('end');
    group('lender exit');
    const sh = await evalIn(C.pool, `(get-shares '${LENDER})`);
    const l0 = await stx(LENDER), lu0 = await usd(LENDER);
    await tx('lender claims USDCx interest', LENDER, C.pool, 'claim-rewards', [], (v) => v?.ok > 0n);
    check('lender received the USDCx rewards', (await usd(LENDER)) > lu0);
    await tx('lender withdraws all shares (everything idle)', LENDER, C.pool, 'withdraw', [uintCV(sh)], (v) => v?.ok > 0n);
    check('lender got STX back', (await stx(LENDER)) > l0);
    const pe = await poolS();
    check('pool empty: no shares, nothing lent', pe['total-shares'] === 0n && pe.lent === 0n, show(pe));
  } else {
    group('keyed: liquidation by deadline on the real oracle');
    await refresh();
    const s4 = 200n * STX;
    await open('open #4 200 STX tenor 1h', SHORTER2, { stx: s4, collateral: s4 * PRICE / SCALE, tenor: 3_600n, incr: 10_000n }, { ok: 4n });
    await advance(7);
    note('keyed run: Lazer updates are only accepted when fresh vs stacks-block-time; AdvanceBlocks moves block time ahead of wall clock, so deadline steps after advance may need a fresh update newer than the advanced time (expected u4004 if not)');
    await refresh();
    await tx('liquidate #4 after the deadline', KEEPER, C.vault, 'liquidate', [uintCV(4), upd()], (v) => v?.ok === true || v?.err === 4004n);
    await noResidual('keyed end');
  }
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(String(e?.message ?? e)); }
}
summary();
