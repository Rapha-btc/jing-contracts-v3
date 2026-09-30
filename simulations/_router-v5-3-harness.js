// _router-v5-3-harness.js: shared stxer fork harness for the
// verify-router-v5-3-*.js suites. Deploys the unmodified working-tree
// jing-core-v6, jing-ladder-v1, markets-sbtc-stx-jing-v6-3 and
// swap-router-sbtc-stx-jing-v5-3 (the router's JING_MARKET is this exact id),
// plus `rtrprobe-v1`, which reads the router's read-only getter inside a
// transaction so the stxer trace records it. Real mainnet DLMM / XYK / Velar
// pools, real signed Lazer prints; nothing is patched.
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  ClarityVersion, tupleCV as rawTupleCV, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  noneCV, someCV, makeUnsignedSTXTokenTransfer, deserializeCV, cvToString, getAddressFromPrivateKey,
} from '@stacks/transactions';
import { SimulationBuilder, getSimulationResult, submitSimulationSteps, callContract, getNonce, setSender } from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

export const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
export const CORE = `${DEP}.jing-core-v6`;
export const LADDER = `${DEP}.jing-ladder-v1`;
export const MARKET = `${DEP}.markets-sbtc-stx-jing-v6-3`;
export const ROUTER = `${DEP}.swap-router-sbtc-stx-jing-v5-3`;
export const PROBE = `${DEP}.rtrprobe-v1`;
export const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
export const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
export const DLMM_POOL = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-2-bps-15';
export const XYK_POOL = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-pool-sbtc-stx-v-1-1';
export const VELAR_POOL = 'SP20X3DC5R091J8B6YPQT638J8NR1W83KN6TN5BJY.univ2-pool-v1_0_0-0070';
export const WHALE_X = 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2'; // ~40 BTC of sBTC
export const WHALE_Y = 'SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR'; // ~1M STX
export const NODE = 'http://77.42.3.101/stacks-api';
export const FILES = ['swap-router-sbtc-stx-jing-v5-3', 'jing-ladder-v1', 'markets-sbtc-stx-jing-v6-3', 'jing-core-v6'];
export const principal = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
export const tupleCV = (f) => rawTupleCV(Object.fromEntries(Object.entries(f).sort(([a], [b]) => a.localeCompare(b))));
export const traits = { x: principal(SBTC), y: principal(WSTX) };
export const assets = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
export const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
export const source = (name) => fs.readFileSync(new URL(`../contracts/${name}.clar`, import.meta.url), 'utf8');
export const shas = () => Object.fromEntries(FILES.map((f) => [f, crypto.createHash('sha256').update(source(f)).digest('hex')]));
export const cv = (hex) => cvToString(deserializeCV(hex));
export const update = (u) => bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex'));
export const ok = (v) => String(v).startsWith('(ok');
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
// (tuple (a u1) (b true) ...) -> { a: 1n, b: true }; nested values stay strings
export function fields(s) {
  const o = {};
  for (const m of String(s).matchAll(/\(([a-z0-9-]+) (u\d+|true|false)\)/g)) o[m[1]] = m[2] === 'true' ? true : m[2] === 'false' ? false : BigInt(m[2].slice(1));
  return o;
}
export const uint = (s) => { const m = /^u(\d+)$/.exec(String(s)); if (!m) throw new Error(`not a uint: ${s}`); return BigInt(m[1]); };

export const H = { passed: 0, checks: 0, failures: 0, sid: null };
export function check(label, actual, want) {
  H.checks++;
  const good = typeof want === 'function' ? want(actual) : actual === want;
  if (good) H.passed++; else H.failures++;
  console.log(`${good ? 'ok  ' : 'FAIL'} ${H.checks}. ${label}: ${String(actual).slice(0, 700)}${good ? '' : `; expected ${typeof want === 'function' ? want.toString() : want}`}`);
  if (!good) {
    console.log(`${H.passed}/${H.checks} checks green`);
    throw new Error(`Stopped on failed checks. Fork: https://stxer.xyz/simulations/mainnet/${H.sid}`);
  }
  return good;
}
export async function retry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i < 8 && /block info|ECONNRESET|fetch failed|socket|50[234]|busy|409|timeout/i.test(String(e?.message ?? e))) { await new Promise((r) => setTimeout(r, 4000)); continue; }
      throw e;
    }
  }
}
let budgetOperations = 0;
async function renewBudget() {
  // Exact-age tests advance blocks explicitly and must not renew mid-case.
  if (process.env.ROUTER_KEEP_TENURE === '1' || process.env.ROUTER_RENEW_TENURE !== '1') return;
  // Long regression sessions span several tenure cost budgets; each
  // individual call remains limited. Tenure extension may advance time.
  if (budgetOperations++ % 20 !== 0) return;
  const r = await retry(() => submitSimulationSteps(H.sid, {steps: [{TenureExtend: {cause: 'Extended'}}]}));
  if (!r.steps[0].TenureExtend) throw new Error(`Tenure extension failed: ${JSON.stringify(r)}`);
}
export async function evRaw(cid, code, sender = DEP) {
  await renewBudget();
  const out = await retry(() => submitSimulationSteps(H.sid, { steps: [{ Eval: [sender, '', cid, code] }] }));
  return decode({ Result: out.steps[0] });
}
export async function ev(label, cid, code, want) {
  const actual = await evRaw(cid, code);
  check(label, actual, want);
  return actual;
}
export const printsOf = (r, contract) => (r.receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e)
  .filter((e) => e.committed !== false && e.contract_event && (!contract || e.contract_event.contract_identifier === contract))
  .map((e) => cv(e.contract_event.raw_value));
export async function tx(label, sender, cid, fn, args, want) {
  await renewBudget();
  const r = await retry(() => callContract(H.sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 }));
  const result = r.vmError || r.pcAborted ? `ENGINE-ERR ${JSON.stringify(r).slice(0, 600)}` : r.result;
  check(label, result, want);
  return { result, receipt: r.receipt, f: fields(result) };
}
export async function fund(side, who, amount) {
  if (side === 'x') {
    await tx(`fund ${amount} sats`, WHALE_X, SBTC, 'transfer', [uintCV(amount), principal(WHALE_X), principal(who), noneCV()], '(ok true)');
  } else {
    const raw = await makeUnsignedSTXTokenTransfer({ recipient: who, amount, nonce: await getNonce(H.sid, WHALE_Y), network: 'mainnet', publicKey: '', fee: 0 });
    setSender(raw, WHALE_Y);
    const out = await retry(() => submitSimulationSteps(H.sid, { steps: [{ Transaction: raw.serialize() }] }));
    check(`fund ${amount} uSTX`, decode({ Result: out.steps[0] }), '(ok true)');
  }
}
const PROBE_SRC = `;; rtrprobe-v1: the router's read-only getter, read inside a transaction
(define-public (mins)
  (ok { router: (contract-call? .swap-router-sbtc-stx-jing-v5-3 get-jing-min-deposits),
        market: (contract-call? .markets-sbtc-stx-jing-v6-3 get-min-deposits) }))
`;
export async function deployAll(extra = [], sourceOverrides = {}) {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  // Optional historical pool snapshot for scenarios that require depth in
  // every venue. Oracle updates still use real signed bytes.
  if (process.env.ROUTER_FORK_HEIGHT) {
    const height = Number(process.env.ROUTER_FORK_HEIGHT);
    if (!Number.isSafeInteger(height) || height <= 0) throw new Error('Invalid ROUTER_FORK_HEIGHT');
    b.useBlockHeight(height);
  }
  for (const name of ['jing-core-v6', 'jing-ladder-v1', 'markets-sbtc-stx-jing-v6-3', 'swap-router-sbtc-stx-jing-v5-3']) {
    b.withSender(DEP).addContractDeploy({ contract_name: name, source_code: sourceOverrides[name] ?? source(name), clarity_version: ClarityVersion.Clarity5 });
  }
  b.withSender(DEP).addContractDeploy({ contract_name: 'rtrprobe-v1', source_code: PROBE_SRC, clarity_version: ClarityVersion.Clarity5 });
  for (const [name, code] of extra) b.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 });
  H.sid = await retry(() => b.run());
  budgetOperations = 0;
  console.log(`View: https://stxer.xyz/simulations/mainnet/${H.sid}`);
  const setup = await retry(() => getSimulationResult(H.sid));
  for (const st of setup.steps.filter((s) => s.Result?.Transaction)) check('deploy supplied source', decode(st), ok);
  // AMM depth on this fork, logged rather than assumed
  console.log('AMM depth at the fork:', await evRaw(ROUTER, `{ dlmm: (let ((p (unwrap-panic (contract-call? DLMM_POOL get-pool)))) { active-bin: (get active-bin-id p), bin-step: (get bin-step p), fee-x: (+ (get x-protocol-fee p) (get x-provider-fee p) (get x-variable-fee p)), fee-y: (+ (get y-protocol-fee p) (get y-provider-fee p) (get y-variable-fee p)), stx: (stx-get-balance DLMM_POOL), sbtc: (unwrap-panic (contract-call? SBTC get-balance DLMM_POOL)) }),
    xyk: (let ((p (unwrap-panic (contract-call? XYK_POOL get-pool)))) { sbtc: (get x-balance p), stx: (get y-balance p) }),
    velar: (let ((p (unwrap-panic (contract-call? VELAR_POOL get-pool)))) { stx: (get reserve0 p), sbtc: (get reserve1 p) }) }`));
  const deployed = await evRaw(ROUTER, '(list JING_MARKET)');
  check('router JING_MARKET is the deployed market id', deployed, `(list ${MARKET})`);
}
export const MIN_X = 1000n, MIN_Y = 1_000_000n;
export async function initMarket() {
  await tx('core verifies the market', DEP, CORE, 'set-verified-contract', [principal(MARKET)], '(ok true)');
  await tx('market initialize (min 1000 sats / 1 STX, feeds 1 / 45)', DEP, MARKET, 'initialize', [principal(MARKET), traits.x, traits.y, uintCV(MIN_X), uintCV(MIN_Y), uintCV(1), uintCV(45)], '(ok true)');
  await tx('sync seat count', DEP, MARKET, 'sync-seat-count', [], '(ok u10)');
}
// a signed print strictly newer than the fork clock (both feeds), and its mid
export async function printAfter(stamp) {
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      const u = await fetchLazerUpdateAny();
      const times = await lazerFeedTimes(u.hex);
      if (times.at > stamp) return { ...u, at: times.at, mid: u.px * 100_000_000n / u.py };
    } catch (e) { console.log(`  (lazer retry: ${String(e.message ?? e).slice(0, 120)})`); }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`no newer signed feed after ${stamp}`);
}
export async function forkClock() { return Number(uint(await evRaw(MARKET, 'stacks-block-time'))); }

// Everything a refused router call could move: the taker's and the market's
// balances in both assets, and every pool's state.
export async function snapshot(who) {
  const bal = (p) => `{ x: (unwrap-panic (contract-call? '${SBTC} get-balance '${p})), y: (stx-get-balance '${p}) }`;
  const code = `{ w: (list ${who.map(bal).join(' ')}), m: ${bal(MARKET)},
    d: (unwrap-panic (contract-call? '${DLMM_POOL} get-pool)), dx: ${bal(DLMM_POOL)},
    k: (unwrap-panic (contract-call? '${XYK_POOL} get-pool)),
    v: (contract-call? '${VELAR_POOL} get-pool), vx: ${bal(VELAR_POOL)},
    c: (var-get current-cycle) }`;
  const v = await evRaw(MARKET, code);
  if (!v.startsWith('(tuple')) throw new Error(`snapshot failed: ${v.slice(0, 300)}`);
  return v;
}
export async function refused(label, sender, cid, fn, args, want, who) {
  const before = await snapshot(who);
  const r = await tx(label, sender, cid, fn, args, want);
  const after = await snapshot(who);
  check(`${label}: nothing moved`, after === before ? 'unchanged' : `CHANGED\n  before ${before}\n  after  ${after}`, 'unchanged');
  check(`${label}: no committed event`, String(printsOf(r).length), '0');
  return r;
}
export async function wallet(p) {
  const v = await evRaw(MARKET, `{ x: (unwrap-panic (contract-call? '${SBTC} get-balance '${p})), y: (stx-get-balance '${p}) }`);
  const f = fields(v);
  return { x: f.x, y: f.y };
}
export const amts = (d = 0n, x = 0n, v = 0n) => tupleCV({ dlmm: uintCV(d), xyk: uintCV(x), velar: uintCV(v) });
// manual: sellX true = swap-sbtc-for-stx
export const manualArgs = ({ amount, jing = 0n, limit = 1n, u = null, fallback = null, a = [0n, 0n, 0n], m = [0n, 0n, 0n], minOut = 0n }) =>
  [uintCV(amount), uintCV(jing), uintCV(limit), u ? someCV(update(u)) : noneCV(), fallback == null ? noneCV() : someCV(uintCV(fallback)), amts(...a), amts(...m), uintCV(minOut)];
export const smartArgs = ({ amount, limit, u = null, mid, minOut = 0n }) =>
  [uintCV(amount), uintCV(limit), u ? someCV(update(u)) : noneCV(), uintCV(mid), uintCV(minOut)];
export const manualFn = (sellX) => sellX ? 'swap-sbtc-for-stx' : 'swap-stx-for-sbtc';
export const smartFn = (sellX) => sellX ? 'smart-swap-sbtc-for-stx' : 'smart-swap-stx-for-sbtc';

// ---- venue models (the pools' own formulas, read from their mainnet source) ----
// XYK (xyk-core-v-1-2): fees off the input per side, dy = out * dx / (in + dx)
export async function xykQuote(sellX, amount) {
  const p = fields(await evRaw(MARKET, `(unwrap-panic (contract-call? '${XYK_POOL} get-pool))`));
  // x-token is sBTC on the live pool (asserted by the suites)
  const [pf, lf, rin, rout] = sellX ? [p['x-protocol-fee'], p['x-provider-fee'], p['x-balance'], p['y-balance']] : [p['y-protocol-fee'], p['y-provider-fee'], p['y-balance'], p['x-balance']];
  const dx = amount - amount * pf / 10_000n - amount * lf / 10_000n;
  return rout * dx / (rin + dx);
}
// Velar univ2: amt-in-adjusted = amt * num / den (calc-fees), out = find-dx
export async function velarQuote(sellX, amount) {
  const p = fields(await evRaw(MARKET, `(unwrap-panic (contract-call? '${VELAR_POOL} get-pool))`));
  const fee = fields(await evRaw(MARKET, `(get swap-fee (unwrap-panic (contract-call? 'SP20X3DC5R091J8B6YPQT638J8NR1W83KN6TN5BJY.univ2-fees-v1_0_0-0070 get-fees)))`));
  const adj = amount * fee.num / fee.den;
  // token0 = wSTX, token1 = sBTC on the live pool (asserted by the suites)
  const [rin, rout] = sellX ? [p.reserve1, p.reserve0] : [p.reserve0, p.reserve1];
  const q = await evRaw(MARKET, `(contract-call? 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-math find-dx u${rout} u${rin} u${adj})`);
  return uint(/u\d+/.exec(q)[0]);
}
export function done() {
  console.log(`${H.passed}/${H.checks} checks green`);
  console.log(`Sim: https://stxer.xyz/simulations/mainnet/${H.sid}`);
}
export { fetchLazerUpdateAny };
