// stxer mainnet-fork proof for contracts/jing-settle-batch.clar (settle-many).
//
// Deposits through jing-ladder-dispatch park pending requests on
// markets-sbtc-stx-jing-v6-4; settle-many then settles them in one tx with one
// Lazer update. Covers both sides, a full 10-item list, a mixed batch (u1030 /
// u7202 / duplicates), a third-party caller, empty and all-fail lists, a stale
// update and one older than the request (u1032), and the limit kind.
// See contracts/README-settle-batch.md. Run: node simulations/verify-settle-batch.mjs
import { readFileSync } from 'node:fs';
import { fetchLazerUpdateAny } from './_lazer.js';
import { SimulationBuilder } from 'stxer';
import { ClarityVersion, Cl, cvToString, deserializeCV, hexToCV, serializeCV, cvToJSON } from '@stacks/transactions';

const NODE = 'http://77.42.3.101/stacks-api', API = 'https://api.stxer.xyz';
const D = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const MARKET = `${D}.markets-sbtc-stx-jing-v6-4`;
const DISPATCH = `${D}.jing-ladder-dispatch`;
const SELLER = 'SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q'; // STX holder: deposit-sell, deploys the wrapper
const BUYER = 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';  // sBTC whale: deposit-buy
const THIRD = 'SP1SFGRJ8R660527743WFCPPY1HS64VPGEYGTYYZ2';  // unrelated caller
const BATCH = `${SELLER}.jing-settle-batch`;
const SRC = readFileSync(new URL('../contracts/jing-settle-batch.clar', import.meta.url), 'utf8');
const sbtcT = Cl.contractPrincipal('SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4', 'sbtc-token');
const wstxT = Cl.contractPrincipal('SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR', 'token-stx-v-1-2');
const rung = (side, n) => `${D}.jing-${side}-stx-${n}`;
const P = (p) => p.includes('.') ? Cl.contractPrincipal(...p.split('.')) : Cl.principal(p);

// ---------- Lazer ----------
async function fetchLazer() {
  return (await fetchLazerUpdateAny()).hex.replace(/^0x/, '');
}
async function lazerAt(hex) {
  const buf = Buffer.from(hex, 'hex'); const len = buf.readUInt16BE(69); const payload = buf.subarray(71, 71 + len);
  const r = await fetch(`${NODE}/v2/contracts/call-read/SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8/pyth-lazer-decoder-v1/decode-lazer-payload`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sender: D, arguments: ['0x' + Buffer.from(serializeCV(Cl.buffer(payload)), 'hex').toString('hex').replace(/^0x/, '')] }) });
  const j = await r.json(); const v = cvToJSON(hexToCV(j.result)).value.value;
  const ts = v['price-feeds'].value.map((f) => Number(f.value['feed-update-timestamp'].value.value) / 1e6);
  return Math.floor(Math.min(...ts));
}
const tip = async () => { const t = (await (await fetch(`${NODE}/extended/v2/blocks?limit=1`)).json()).results[0]; return { h: t.height, T: t.block_time }; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const staleHex = (() => { const cv = hexToCV(readFileSync(new URL('./fixtures/settle-batch-stale-lazer.hex', import.meta.url), 'utf8').trim()); return Buffer.from(cv.value.value, 'hex').toString('hex'); })();

// U_before: an update that is fresh (<80 s) but NOT newer than the block's time
const uBefore = await fetchLazer(); const atBefore = await lazerAt(uBefore);
let pin; for (;;) { pin = await tip(); if (pin.T >= atBefore) break; await sleep(2000); }
let uFresh, atFresh; for (;;) { uFresh = await fetchLazer(); atFresh = await lazerAt(uFresh); if (atFresh > pin.T) break; await sleep(1000); }
const atStale = await lazerAt(staleHex);
console.log(`pin block ${pin.h} time ${pin.T} | U_before.at ${atBefore} (T-at=${pin.T - atBefore}) | U_fresh.at ${atFresh} | U_stale.at ${atStale} (age ${pin.T - atStale}s)`);
if (pin.T - atBefore >= 80) throw new Error('U_before too old, rerun');
const UF = Cl.buffer(Buffer.from(uFresh, 'hex')), UB = Cl.buffer(Buffer.from(uBefore, 'hex')), US = Cl.buffer(Buffer.from(staleHex, 'hex'));

// ---------- plan ----------
const BUY_NEW = [1, 10];              // not pending on mainnet -> the deposit-buy makes them pending
const BUY_ALL10 = [1, 10, 20, 30, 40, 50, 60, 70, 80]; // + BUYER's own direct deposit = 10; 90 is used by the u1032 mix
const SELL = [10, 20, 30, 40, 50];
const BUY_AMT = 10_000n, SELL_AMT = 20_000_000n;
const req = (who, x, kind) => Cl.tuple({ who: P(who), x: Cl.bool(x), kind: Cl.uint(kind) });

const b = SimulationBuilder.new({ stacksNodeAPI: NODE, apiEndpoint: API, skipTracing: true }).useBlockHeight(pin.h);
const steps = [];
const tx = (label, sender, contract, fn, args, want) => { b.withSender(sender).addContractCall({ contract_id: contract, function_name: fn, function_args: args }); steps.push({ label, kind: 'tx', want }); return steps.at(-1); };
const ev = (label, code, want, ctx = MARKET) => { b.addEvalCode(ctx, code); steps.push({ label, kind: 'eval', want }); return steps.at(-1); };
const snap = (tag, rungs, side) => rungs.map((n) => {
  const t = side === 'buy' ? 'x' : 'y';
  return ev(`${tag} ${side}-${n}`, `{ pd: (get-token-${t}-pending-deposit '${rung(side, n)}), pl: (get-token-${t}-pending-limit '${rung(side, n)}), live: (get-token-${t}-deposit (get-current-cycle) '${rung(side, n)}) }`, null);
});
const bal = (tag, who) => ev(`${tag} balances ${who.slice(0, 6)}`, `{ stx: (stx-get-balance '${who}), sbtc: (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance '${who})) }`, null);

b.withSender(SELLER).addContractDeploy({ contract_name: 'jing-settle-batch', source_code: SRC, clarity_version: ClarityVersion.Clarity6 ?? 6 });
steps.push({ label: 'deploy jing-settle-batch (Clarity 6)', kind: 'tx', want: (v) => v.startsWith('(ok') || v === 'true' });

const pre = [...snap('PRE', [0, 1, 10, 20, 30, 40, 50, 60, 70, 80, 90], 'buy'), ...snap('PRE', [10, 20, 30, 40, 50, 60, 70], 'sell')];

// S1 ladders
tx('S1 deposit-buy 2 rungs (1,10) (BUYER)', BUYER, DISPATCH, 'deposit-buy', [Cl.uint(BUY_AMT * 2n), Cl.list(BUY_NEW.map((n) => Cl.tuple({ rung: P(rung('buy', n)), amount: Cl.uint(BUY_AMT) })))], (v) => v.startsWith('(ok'));
tx('S1 BUYER direct deposit-token-x -> pending', BUYER, MARKET, 'deposit-token-x', [Cl.uint(BUY_AMT), Cl.uint(8518192303302n), Cl.some(Cl.uint(50)), sbtcT, Cl.stringAscii('sbtc-token')], `(ok u${BUY_AMT})`);
tx('S1 deposit-sell 5 rungs (SELLER)', SELLER, DISPATCH, 'deposit-sell', [Cl.uint(SELL_AMT * 5n), Cl.list(SELL.map((n) => Cl.tuple({ rung: P(rung('sell', n)), amount: Cl.uint(SELL_AMT) })))], (v) => v.startsWith('(ok'));
tx('S1 refresh-guard sell-60 -> pending y limit', THIRD, rung('sell', 60), 'refresh-guard', [], (v) => v.startsWith('(ok'));
const mid = [...snap('MID', [0, 1, 10, 20, 30, 40, 50, 60, 70, 80, 90], 'buy'), ...snap('MID', [10, 20, 30, 40, 50, 60, 70], 'sell')];

// S7a empty
tx('S7a empty list -> (err u7201)', SELLER, BATCH, 'settle-many', [UF, Cl.list([])], '(err u7201)');
// S8 stale (>80 s)
tx('S8 stale update via batch -> (err u7203)', SELLER, BATCH, 'settle-many', [US, Cl.list([req(rung('buy', 1), true, 0)])], '(err u7203)');
// The Lazer oracle's own staleness check (u1002) fires before the market's u1003.
tx('S8 stale update direct market settle -> (err u1002)', SELLER, MARKET, 'settle-token-x-deposit', [P(rung('buy', 1)), US, sbtcT, Cl.stringAscii('sbtc-token')], '(err u1002)');
ev('S8 buy-1 still pending', `(is-some (get-token-x-pending-deposit '${rung('buy', 1)}))`, 'true');
// S8b before-order: buy-1 (submitted at T) u1032, buy-90 (live mainnet pending, older) settles
tx('S8b U_before: [buy-1, buy-90] -> buy-1 u1032, buy-90 u0', SELLER, BATCH, 'settle-many', [UB, Cl.list([req(rung('buy', 1), true, 0), req(rung('buy', 90), true, 0)])], '(ok (tuple (codes (list u1032 u0)) (settled u1)))');
ev('S8b buy-1 still pending', `(is-some (get-token-x-pending-deposit '${rung('buy', 1)}))`, 'true');
ev('S8b buy-90 pending gone (seated)', `(get-token-x-pending-deposit '${rung('buy', 90)})`, 'none');
// S7b all fail with a fresh update
tx('S7b all fail [never-pending, already-settled] -> (err u7203)', SELLER, BATCH, 'settle-many', [UF, Cl.list([req(THIRD, true, 0), req(rung('buy', 90), true, 0)])], '(err u7203)');
ev('S7b buy-1 still pending (nothing changed)', `(is-some (get-token-x-pending-deposit '${rung('buy', 1)}))`, 'true');

// S2 main: 10 buy rungs in one call, by the depositor
const balB0 = bal('S2 pre', BUYER);
const main = tx('S2 settle-many 10 buy rungs (BUYER)', BUYER, BATCH, 'settle-many', [UF, Cl.list([...BUY_ALL10.map((n) => req(rung('buy', n), true, 0)), req(BUYER, true, 0)])], '(ok (tuple (codes (list u0 u0 u0 u0 u0 u0 u0 u0 u0 u0)) (settled u10)))');
const balB1 = bal('S2 post', BUYER);
const post2 = [...snap('POST2', BUY_ALL10, 'buy'), ev('POST2 BUYER', `{ pd: (get-token-x-pending-deposit '${BUYER}), live: (get-token-x-deposit (get-current-cycle) '${BUYER}) }`, null)];

// S3 mixed sell-side batch by a THIRD party
const balC0 = bal('S3 pre', THIRD);
const r0 = [10, 20, 40, 50].map((n) => ev(`S3 pre sell-${n} stx bal`, `(stx-get-balance '${rung('sell', n)})`, null));
const mix = tx('S3 mixed 10 items (THIRD)', THIRD, BATCH, 'settle-many', [UF, Cl.list([
  req(rung('sell', 10), false, 0),   // u0
  req(rung('sell', 20), false, 0),   // u0
  req(rung('sell', 20), false, 0),   // dup -> u1030
  req(rung('sell', 30), false, 3),   // bad kind -> u7202
  req(THIRD, false, 0),              // never pending -> u1030
  req(rung('sell', 60), false, 1),   // pending limit -> u0
  req(rung('sell', 70), false, 2),   // readmit not pending -> u1030
  req(rung('buy', 90), true, 0),     // already settled -> u1030
  req(rung('sell', 40), false, 0),   // u0
  req(rung('sell', 50), false, 0),   // u0
])], '(ok (tuple (codes (list u0 u0 u1030 u7202 u1030 u0 u1030 u1030 u0 u0)) (settled u5)))');
const balC1 = bal('S3 post', THIRD);
const post3 = snap('POST3', [10, 20, 30, 40, 50, 60], 'sell');

// cost baseline: one direct keeper settle vs a 1-item batch
const single = tx('C1 single keeper settle-token-y-deposit(sell-30)', D, MARKET, 'settle-token-y-deposit', [P(rung('sell', 30)), UF, wstxT, Cl.stringAscii('wstx')], (v) => v.startsWith('(ok'));
tx('C2 refresh-guard buy-1 -> pending x limit', THIRD, rung('buy', 1), 'refresh-guard', [], (v) => v.startsWith('(ok'));
const one = tx('C2 settle-many 1 item: buy-1 x limit (u1)', SELLER, BATCH, 'settle-many', [UF, Cl.list([req(rung('buy', 1), true, 1)])], '(ok (tuple (codes (list u0)) (settled u1)))');
ev('C2 buy-1 pending limit gone', `(get-token-x-pending-limit '${rung('buy', 1)})`, 'none');

// ---------- run ----------
const id = await b.run();
console.log(`stxer https://stxer.xyz/simulations/mainnet/${id}`);
let res; for (let i = 0; i < 60; i++) { const r = await fetch(`${API}/devtools/v2/simulations/${id}`); if (r.ok) { res = await r.json(); if ((res?.steps?.length ?? 0) >= steps.length) break; } await sleep(2000); }
const raw = res.steps;
const dec = (s) => { const R = s?.Result; if (R?.Transaction) { const t = R.Transaction; if ('Err' in t) return `ENGINE-ERR ${JSON.stringify(t.Err).slice(0, 200)}`; if (t.Ok?.vm_error) return `VM-ERR ${t.Ok.vm_error}`; try { return cvToString(deserializeCV(t.Ok.result)); } catch { return JSON.stringify(t.Ok).slice(0, 200); } } if (R?.Eval) { if (!('Ok' in R.Eval)) return `EVAL-ERR ${JSON.stringify(R.Eval).slice(0, 200)}`; return cvToString(deserializeCV(R.Eval.Ok)); } return JSON.stringify(R).slice(0, 200); };
let ok = 0, fail = 0;
steps.forEach((s, i) => { s.raw = raw[i]; s.value = dec(raw[i]); if (s.want == null) return; const pass = typeof s.want === 'function' ? s.want(s.value) : s.value === s.want; pass ? ok++ : fail++; console.log(`${pass ? 'ok  ' : 'FAIL'} ${s.label}: ${s.value.slice(0, 300)}`); });
console.log('\n--- snapshots ---');
for (const s of [...pre, ...mid, ...post2, ...post3]) console.log(s.label, s.value.replace(/SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22/g, 'D'));
for (const s of [balB0, balB1, balC0, balC1, ...r0]) console.log(s.label, s.value);
console.log('\n--- costs ---');
for (const s of [main, mix, single, one]) { const t = s.raw?.Result?.Transaction?.Ok; console.log(s.label, JSON.stringify(t?.cost ?? t?.execution_cost ?? Object.keys(t || {}))); }
console.log('\n--- main prints ---');
for (const s of [main, mix]) for (const e of (s.raw?.Result?.Transaction?.Ok?.events || [])) { try { const o = typeof e === 'string' ? JSON.parse(e) : e; const rv = o.contract_event?.raw_value; if (rv) { const str = cvToString(hexToCV(rv)); if (/settle-many|deposit-x"|deposit-y"|refund|limit-y"|limit-x"/.test(str)) console.log(' ', s.label.slice(0, 3), str.replace(/SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22/g, 'D').slice(0, 260)); } } catch {} }
console.log(`\n${ok}/${ok + fail} checks passed (sim ${id})`);
