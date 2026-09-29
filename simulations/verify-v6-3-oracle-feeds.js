// Fork only. Run: PYTH_API_KEY=<Pyth Pro key> node simulations/verify-v6-3-oracle-feeds.js
// markets-sbtc-stx-jing-v6-3: the oracle failure arms that the BTC/USD (u1)
// + STX/USD (u45) feed pair can never reach ("B signed-oracle fixtures" in
// README-v6-3-coverage.md section 4). `initialize` takes the two Lazer feed
// ids, so markets initialized with other real feed pairs reach them with
// genuine signed Lazer updates (no crafted payloads, no source changes).
// Every market is the unmodified working-tree source deployed as `oracle-*`.
//
//   oracle-shape  x = u1 BTC/USD (-8)          y = u112 FundingRate.Binance.BTC/USDT (-12)
//                 funding-rate feeds carry no confidence: shape-feed(fy)
//                 -> ERR_PRICE_UNCERTAIN u1004 on the y feed (x has it).
//   oracle-expo   x = u1 BTC/USD (-8)          y = u4 PEPE/USD (-10)
//                 -> ERR_EXPO_MISMATCH u1014 in execute-settlement.
//   oracle-ratio  x = u4 PEPE/USD (-10)        y = u1575 NAV.ACRED/USD (-10)
//                 px * 1e8 < py, so the ratio floors to 0
//                 -> ERR_ZERO_PRICE u1006 (ratio arm) in execute-settlement.
//   oracle-conf-x x = u3445 NAV.XBTC/USDC (-8) y = u1 BTC/USD
//   oracle-conf-y x = u1 BTC/USD              y = u3445 NAV.XBTC/USDC
//                 conf >= price / 50 -> ERR_PRICE_UNCERTAIN u1004 (conf
//                 arms). u3445 is the widest feed at hand (~1.97% at its
//                 widest) but never reached 2% while probed; the sim polls
//                 for a print at >= 2% and asserts the arms only if one
//                 shows up. Otherwise it logs the widest ratio it saw.
//
// Not producible with real Lazer prints (see the coverage README):
//   y-feed ERR_STALE_PRICE (both functions): every feed in an update carries
//     the same feedUpdateTimestamp as the envelope, so x == y publish time
//     and the x check is always the one that fails.
//   ERR_ZERO_PRICE on x / y price (both functions): no feed with a
//     confidence publishes price <= 0; the funding-rate feeds, which can,
//     carry no confidence and are refused by shape-feed first.
//
// Each refused call is wrapped in a full before/after snapshot of the market
// (settings, cycle, totals, both books, settlement map, escrow, rebates) and
// every actor (wallets, live/parked positions, pending deposits / limits /
// readmits, stored orders): a refusal must move nothing.
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV,
  standardPrincipalCV, noneCV, boolCV, makeUnsignedSTXTokenTransfer,
  deserializeCV, cvToString, getAddressFromPrivateKey,
} from '@stacks/transactions';
import fs from 'node:fs';
import {
  SimulationBuilder, getSimulationResult, submitSimulationSteps, callContract, getNonce, setSender,
} from 'stxer';
import { fetchLazerUpdateOpts } from './_lazer.js';

const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const CORE = `${DEP}.jing-core-v6`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const STX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALES = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51' };
const PROPS = ['price', 'exponent', 'confidence', 'publisherCount', 'feedUpdateTimestamp'];
const principal = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const traits = { x: principal(SBTC), y: principal(STX) };
const assets = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const source = (name) => fs.readFileSync(new URL(`../contracts/${name}.clar`, import.meta.url), 'utf8');
const cv = (hex) => cvToString(deserializeCV(hex));
const decode = (step) => {
  const r = step?.Result;
  if (r?.Eval?.Ok) return cv(r.Eval.Ok);
  if (r?.Transaction?.Ok) {
    const t = r.Transaction.Ok;
    if (t.vm_error || t.post_condition_aborted) return `ENGINE-ERR ${JSON.stringify(t)}`;
    return cv(t.result);
  }
  return `ENGINE-ERR ${JSON.stringify(r)}`;
};
const ok = (v) => v.startsWith('(ok');
const buf = (hex) => bufferCV(Buffer.from(hex.replace(/^0x/, ''), 'hex'));
let passed = 0, checks = 0, failures = 0, sid;
function check(label, actual, want) {
  checks++;
  const good = typeof want === 'function' ? want(actual) : actual === want;
  if (good) passed++; else failures++;
  console.log(`${good ? 'ok  ' : 'FAIL'} ${checks}. ${label}: ${String(actual).slice(0, 400)}${good ? '' : `; expected ${typeof want === 'function' ? want.toString() : want}`}`);
  if (!good) finish();
  return good;
}
function finish() {
  if (failures) {
    console.log(`${passed}/${checks} checks green`);
    throw new Error(`Stopped on failed checks. Fork: https://stxer.xyz/simulations/mainnet/${sid}`);
  }
}
async function retry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i < 8 && /block info|ECONNRESET|fetch failed|50[234]|busy|409|timeout/i.test(String(e?.message ?? e))) { await new Promise((r) => setTimeout(r, 3000)); continue; }
      throw e;
    }
  }
}
async function evRaw(cid, code) {
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ TenureExtend: { cause: 'Extended' } }, { Eval: [DEP, '', cid, code] }] }));
  return decode({ Result: out.steps[1] });
}
async function ev(label, cid, code, want) {
  const actual = await evRaw(cid, code);
  check(label, actual, want);
  return actual;
}
async function tx(label, sender, cid, fn, args, want) {
  const r = await retry(() => callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 }));
  const actual = r.vmError || r.pcAborted ? `ENGINE-ERR ${JSON.stringify(r)}` : r.result;
  check(label, actual, want);
  return actual;
}
async function fund(side, who, amount) {
  if (side === 'x') {
    await tx(`fund ${amount} sats`, WHALES.x, SBTC, 'transfer', [uintCV(amount), principal(WHALES.x), principal(who), noneCV()], '(ok true)');
  } else {
    const raw = await makeUnsignedSTXTokenTransfer({ recipient: who, amount, nonce: await getNonce(sid, WHALES.y), network: 'mainnet', publicKey: '', fee: 0 });
    setSender(raw, WHALES.y);
    const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] }));
    check(`fund ${amount} uSTX`, decode({ Result: out.steps[0] }), '(ok true)');
  }
}
async function snapshot(cid, whos) {
  const w = whos.map((a) => `{ s: (stx-get-balance '${a}), b: (unwrap-panic (contract-call? '${SBTC} get-balance '${a})), dy: (get-token-y-deposit (var-get current-cycle) '${a}), dx: (get-token-x-deposit (var-get current-cycle) '${a}), py: (get-token-y-parked '${a}), px: (get-token-x-parked '${a}), qy: (map-get? token-y-pending-deposits '${a}), qx: (map-get? token-x-pending-deposits '${a}), ly: (map-get? token-y-pending-limits '${a}), lx: (map-get? token-x-pending-limits '${a}), ry: (map-get? token-y-pending-readmits '${a}), rx: (map-get? token-x-pending-readmits '${a}), oy: (map-get? token-y-deposit-limits '${a}), ox: (map-get? token-x-deposit-limits '${a}) }`).join(' ');
  const code = `{ tr: (var-get treasury), op: (var-get operator), pz: (var-get paused), init: (var-get initialized), tx: (var-get token-x), ty: (var-get token-y), fx: (var-get feed-id-x), fy: (var-get feed-id-y), my: (var-get min-token-y-deposit), mx: (var-get min-token-x-deposit), ds: (var-get distance-slots), sp: (var-get seats-per-side), sx: (var-get seated-x), sy: (var-get seated-y), cy: (var-get current-cycle), tot: (get-cycle-totals (var-get current-cycle)), bky: (get-token-y-depositors (var-get current-cycle)), bkx: (get-token-x-depositors (var-get current-cycle)), st: (map-get? settlements (var-get current-cycle)), st0: (map-get? settlements u0), rb: (list (var-get pending-rebate-x) (var-get pending-rebate-y)), esc: (list (stx-get-balance '${cid}) (unwrap-panic (contract-call? '${SBTC} get-balance '${cid}))), w: (list ${w}) }`;
  const v = await evRaw(cid, code);
  if (!v.startsWith('(tuple')) throw new Error(`snapshot failed: ${v.slice(0, 300)}`);
  return v;
}
async function refused(label, sender, cid, fn, args, want, whos) {
  const before = await snapshot(cid, whos);
  const got = await tx(label, sender, cid, fn, args, want);
  const after = await snapshot(cid, whos);
  check(`${label}: nothing moved`, after === before ? 'unchanged' : `CHANGED\n  before ${before}\n  after  ${after}`, 'unchanged');
  return got;
}

// A signed Lazer update for [fx, fy] with the full property set, plus the
// parsed feeds (the fixture facts each arm relies on are asserted from them).
async function lazer(fx, fy) {
  const u = await retry(() => fetchLazerUpdateOpts({ ids: [fx, fy], properties: PROPS }));
  const byId = Object.fromEntries(u.parsed.priceFeeds.map((f) => [f.priceFeedId, f]));
  return { U: buf(u.hex), x: byId[fx], y: byId[fy], ts: Math.floor(Number(u.parsed.timestampUs) / 1e6) };
}
// Fetch until the signed feed times are strictly after `after` (a pending
// deposit's submitted-at), so settle-*-deposit is not ERR_PRICE_BEFORE_ORDER.
async function lazerAfter(fx, fy, after) {
  for (let i = 0; i < 40; i++) {
    const u = await lazer(fx, fy);
    const at = Math.floor(Math.min(Number(u.x.feedUpdateTimestamp), Number(u.y.feedUpdateTimestamp)) / 1e6);
    if (at > after) return u;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`no Lazer print after ${after}`);
}
const mid = (u) => BigInt(u.x.price) * 100_000_000n / BigInt(u.y.price);

async function main() {
  if (!process.env.PYTH_API_KEY) throw new Error('PYTH_API_KEY is required (pass it as an env var only)');
  const M = {
    shape: { fx: 1, fy: 112 },
    expo: { fx: 1, fy: 4 },
    ratio: { fx: 4, fy: 1575 },
    confx: { fx: 3445, fy: 1 },
    confy: { fx: 1, fy: 3445 },
  };
  const nameOf = { shape: 'oracle-shape', expo: 'oracle-expo', ratio: 'oracle-ratio', confx: 'oracle-conf-x', confy: 'oracle-conf-y' };
  for (const k of Object.keys(M)) M[k].cid = `${DEP}.${nameOf[k]}`;

  // ---- fork + deploys --------------------------------------------------
  const b = SimulationBuilder.new({ stacksNodeAPI: 'http://77.42.3.101/stacks-api' });
  for (const name of ['jing-core-v6', 'jing-ladder-v1']) b.withSender(DEP).addContractDeploy({ contract_name: name, source_code: source(name), clarity_version: ClarityVersion.Clarity5 });
  const market = source('markets-sbtc-stx-jing-v6-3');
  for (const k of Object.keys(M)) b.withSender(DEP).addContractDeploy({ contract_name: nameOf[k], source_code: market, clarity_version: ClarityVersion.Clarity5 });
  sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const setup = await retry(() => getSimulationResult(sid));
  for (const st of setup.steps.filter((s) => s.Result?.Transaction)) check('deploy exact working-tree source', decode(st), ok);

  const MIN_X = 1000n, MIN_Y = 1_000_000n;
  let nk = 611;
  const fresh = () => mk(nk++);
  const keeper = fresh();
  for (const k of Object.keys(M)) {
    const { cid, fx, fy } = M[k];
    await tx(`${nameOf[k]}: verify in core`, DEP, CORE, 'set-verified-contract', [principal(cid)], '(ok true)');
    await tx(`${nameOf[k]}: initialize (feed-x u${fx}, feed-y u${fy})`, DEP, cid, 'initialize', [principal(cid), traits.x, traits.y, uintCV(MIN_X), uintCV(MIN_Y), uintCV(fx), uintCV(fy)], '(ok true)');
    await ev(`${nameOf[k]}: feed ids stored`, cid, '(list (var-get feed-id-x) (var-get feed-id-y))', `(list u${fx} u${fy})`);
  }
  const depY = (amt, lim) => [uintCV(amt), uintCV(lim), noneCV(), traits.y, assets.y];
  const depX = (amt, lim) => [uintCV(amt), uintCV(lim), noneCV(), traits.x, assets.x];
  const swapArgs = (amt, lim, upd, depositX) => [uintCV(amt), uintCV(lim), upd, traits.x, assets.x, traits.y, assets.y, boolCV(depositX)];
  const swrArgs = (upd) => [upd, traits.x, assets.x, traits.y, assets.y];

  // Build a settleable book: an ask far above mid rests directly (the bid
  // side is empty), a bid far below mid is submitted (pending: the ask side
  // is not empty), then a keeper settles it with a Lazer print made after
  // the submission. Both sides then rest at or above their minimums.
  async function book(k, askLimit, bidLimit) {
    const { cid, fx, fy } = M[k];
    const Xm = fresh(), Yb = fresh(), Tx = fresh(), Ty = fresh();
    await fund('x', Xm, 2000n); await fund('y', Yb, 2_000_000n);
    await fund('x', Tx, 4000n); await fund('y', Ty, 4_000_000n);
    await tx(`${k}: ask 2000 sats rests (direct)`, Xm, cid, 'deposit-token-x', depX(2000n, askLimit), '(ok u2000)');
    await tx(`${k}: bid 2 STX submits (pending)`, Yb, cid, 'deposit-token-y', depY(2_000_000n, bidLimit), '(ok u2000000)');
    const sub = BigInt((await ev(`${k}: pending submitted-at`, cid, `(get submitted-at (unwrap-panic (map-get? token-y-pending-deposits '${Yb})))`, (v) => /^u\d+$/.test(v))).slice(1));
    const u = await lazerAfter(fx, fy, Number(sub));
    await tx(`${k}: keeper settles the bid with a print after it (u${fx}/u${fy})`, keeper, cid, 'settle-token-y-deposit', [principal(Yb), u.U, traits.y, assets.y], '(ok u2000000)');
    await ev(`${k}: both sides rest (settlement reaches the price checks)`, cid, '(get-cycle-totals (var-get current-cycle))', '(tuple (total-token-x u2000) (total-token-y u2000000))');
    await ev(`${k}: no settlement for the open cycle`, cid, '(map-get? settlements (var-get current-cycle))', 'none');
    return { who: [DEP, keeper, Xm, Yb, Tx, Ty], Xm, Yb, Tx, Ty };
  }

  // ======================================== shape: y feed without conf ==
  console.log('PHASE 1: oracle-shape (u1 BTC/USD, u112 FundingRate.Binance.BTC/USDT)');
  {
    const { cid, fx, fy } = M.shape;
    const Xm = fresh(), Yp = fresh(), T = fresh();
    const who = [DEP, keeper, Xm, Yp, T];
    await fund('x', Xm, 2000n); await fund('y', Yp, 2_000_000n); await fund('y', T, 4_000_000n);
    await tx('shape: ask 2000 sats rests (direct)', Xm, cid, 'deposit-token-x', depX(2000n, 10n ** 30n), '(ok u2000)');
    await tx('shape: bid 2 STX submits (pending)', Yp, cid, 'deposit-token-y', depY(2_000_000n, 1n), '(ok u2000000)');
    const sub = Number((await evRaw(cid, `(get submitted-at (unwrap-panic (map-get? token-y-pending-deposits '${Yp})))`)).slice(1));
    const u = await lazerAfter(fx, fy, sub);
    console.log(`   u${fx}: price ${u.x.price} expo ${u.x.exponent} conf ${u.x.confidence}; u${fy}: price ${u.y.price} expo ${u.y.exponent} conf ${u.y.confidence}`);
    check('fixture: x feed u1 carries a confidence', String(u.x.confidence != null), 'true');
    check('fixture: y feed u112 (funding rate) carries no confidence', String(u.y.confidence == null), 'true');
    check('fixture: both feeds carry a feedUpdateTimestamp', String(u.x.feedUpdateTimestamp != null && u.y.feedUpdateTimestamp != null), 'true');
    await refused('shape: refresh-mid -> y shape-feed ERR_PRICE_UNCERTAIN u1004 (lazer-feeds, fresh-classification-price-aged)', keeper, cid, 'refresh-mid', [u.U], '(err u1004)', who);
    await refused('shape: settle-token-y-deposit -> u1004 (pending bid kept)', keeper, cid, 'settle-token-y-deposit', [principal(Yp), u.U, traits.y, assets.y], '(err u1004)', who);
    await refused('shape: swap y -> u1004', T, cid, 'swap', swapArgs(2_000_000n, 1n, u.U, false), '(err u1004)', who);
    await refused('shape: settle-with-refresh -> u1004 (lazer-feeds before execute-settlement)', keeper, cid, 'settle-with-refresh', swrArgs(u.U), '(err u1004)', who);
  }

  // ========================================== expo: -8 vs -10 feeds ====
  console.log('PHASE 2: oracle-expo (u1 BTC/USD expo -8, u4 PEPE/USD expo -10)');
  {
    const { cid, fx, fy } = M.expo;
    const a = await book('expo', 10n ** 30n, 1n);
    const u = await lazer(fx, fy);
    const cx = BigInt(u.x.confidence), cy = BigInt(u.y.confidence), px = BigInt(u.x.price), py = BigInt(u.y.price);
    console.log(`   u${fx}: price ${px} expo ${u.x.exponent} conf ${cx}; u${fy}: price ${py} expo ${u.y.exponent} conf ${cy}`);
    check('fixture: exponents differ (-8 vs -10)', `${u.x.exponent}/${u.y.exponent}`, '-8/-10');
    check('fixture: both confidences are under price / 50 (the conf checks pass)', String(cx < px / 50n && cy < py / 50n), 'true');
    await tx('expo: refresh-mid accepts the pair (the price gate does not compare exponents)', keeper, cid, 'refresh-mid', [u.U], `(ok u${mid(u)})`);
    await refused('expo: settle-with-refresh -> ERR_EXPO_MISMATCH u1014', keeper, cid, 'settle-with-refresh', swrArgs(u.U), '(err u1014)', a.who);
    await refused('expo: swap x (taker) -> u1014 (via settle-with-refresh)', a.Tx, cid, 'swap', swapArgs(2000n, mid(u) / 2n, u.U, true), '(err u1014)', a.who);
    await refused('expo: swap y (taker) -> u1014', a.Ty, cid, 'swap', swapArgs(2_000_000n, mid(u) * 2n, u.U, false), '(err u1014)', a.who);
  }

  // ============================== ratio: px * 1e8 < py, same exponent ==
  console.log('PHASE 3: oracle-ratio (u4 PEPE/USD, u1575 NAV.ACRED/USD, both expo -10)');
  {
    const { cid, fx, fy } = M.ratio;
    const a = await book('ratio', 10n ** 12n, 1n);
    const u = await lazer(fx, fy);
    const cx = BigInt(u.x.confidence), cy = BigInt(u.y.confidence), px = BigInt(u.x.price), py = BigInt(u.y.price);
    console.log(`   u${fx}: price ${px} expo ${u.x.exponent} conf ${cx}; u${fy}: price ${py} expo ${u.y.exponent} conf ${cy}`);
    check('fixture: same exponent', String(u.x.exponent === u.y.exponent), 'true');
    check('fixture: both prices positive, confidences under price / 50', String(px > 0n && py > 0n && cx < px / 50n && cy < py / 50n), 'true');
    check('fixture: px * 1e8 / py floors to 0', String(px * 100_000_000n / py), '0');
    await tx('ratio: refresh-mid returns a 0 mid (the price gate only checks each price > 0)', keeper, cid, 'refresh-mid', [u.U], '(ok u0)');
    await refused('ratio: settle-with-refresh -> ERR_ZERO_PRICE u1006 (oracle-price arm)', keeper, cid, 'settle-with-refresh', swrArgs(u.U), '(err u1006)', a.who);
    await refused('ratio: swap x (taker) -> u1006 (via settle-with-refresh)', a.Tx, cid, 'swap', swapArgs(2000n, 1n, u.U, true), '(err u1006)', a.who);
    await refused('ratio: swap y (taker) -> u1006', a.Ty, cid, 'swap', swapArgs(2_000_000n, 10n ** 12n, u.U, false), '(err u1006)', a.who);
  }

  // ===================================== conf: >= 2% (opportunistic) ===
  console.log('PHASE 4: oracle-conf-x / oracle-conf-y (u3445 NAV.XBTC/USDC vs u1 BTC/USD)');
  {
    const ax = await book('confx', 10n ** 30n, 1n);
    const ay = await book('confy', 10n ** 30n, 1n);
    let hit = null, widest = 0, widestAt = '';
    const polls = Number(process.env.CONF_POLLS ?? 60);
    for (let i = 0; i < polls && !hit; i++) {
      const u = await lazer(3445, 1);
      const c = BigInt(u.x.confidence), p = BigInt(u.x.price);
      const pct = Number(c) / Number(p) * 100;
      if (pct > widest) { widest = pct; widestAt = `${p}/${c}`; }
      if (c >= p / 50n) hit = u; else await new Promise((r) => setTimeout(r, 2000));
    }
    if (!hit) {
      console.log(`   no u3445 print at >= 2% in ${polls} polls; widest ${widest.toFixed(4)}% (price/conf ${widestAt}); conf arms not asserted`);
    } else {
      // one update carries both feeds; each market picks its x / y by id
      console.log(`   u3445 print at ${(Number(hit.x.confidence) / Number(hit.x.price) * 100).toFixed(4)}% (price ${hit.x.price}, conf ${hit.x.confidence}); u1 conf ${hit.y.confidence} / price ${hit.y.price}`);
      await refused('conf-x: settle-with-refresh -> ERR_PRICE_UNCERTAIN u1004 (x conf ratio)', keeper, M.confx.cid, 'settle-with-refresh', swrArgs(hit.U), '(err u1004)', ax.who);
      await refused('conf-y: settle-with-refresh -> u1004 (y conf ratio; x = u1 passes)', keeper, M.confy.cid, 'settle-with-refresh', swrArgs(hit.U), '(err u1004)', ay.who);
    }
  }

  console.log(`${passed}/${checks} checks green`);
  console.log(`Sim: https://stxer.xyz/simulations/mainnet/${sid}`);
}
main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; });
