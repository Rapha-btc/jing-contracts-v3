// Fork only. Run: node simulations/verify-ladder-v1-admin-seats.js
// jing-ladder-v1, every public function and every refusal, from the unmodified
// working-tree source deployed as `jing-ladder-v1` (sha256 printed at start
// and end). The ladder has no external calls, so the fork needs no oracle:
// rungs are stand-ins, probe contracts whose only job is to be the
// `contract-caller` the ladder hashes.
//
//   ladprobe-a1..a8  one code (hash A)       the canonical side "buy-band"
//   ladprobe-b1..b3  one comment more (B)     canonical "sel-band" / "buy-stx"
//   ladprobe-c1      another comment (C)      never canonical: hash mismatch
//
// Covered: set-canonical (owner, bad side, every valid side); register on a
// fixed side (one per price, u6006) and on a band side (free seat -> count,
// taken seat -> replace, full -> u6011); register-unseated; seat-band
// (never-seated, replaced and retired rungs, free and taken spreads, full,
// already seated, not registered, not a band side); set-max-band-per-side
// (floor per side, ceiling 50); retire-band; propose-owner / accept-owner with
// the 144-burn-block timelock; the six `log-*` entry points, gated to
// registered rungs, with `current` true for the seat holder and false for a
// replaced / retired / unseated rung; every read-only getter, read inside a
// transaction through the probe so the stxer trace records it.
// Every refused call is wrapped in a before/after snapshot of the ladder's
// whole state: a refusal must move nothing and print nothing.
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  ClarityVersion, uintCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV, noneCV, someCV, boolCV,
  deserializeCV, cvToString, getAddressFromPrivateKey,
} from '@stacks/transactions';
import { SimulationBuilder, getSimulationResult, submitSimulationSteps, callContract } from 'stxer';

const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const LADDER = `${DEP}.jing-ladder-v1`;
const TIMELOCK = 144;
const principal = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const source = (name) => fs.readFileSync(new URL(`../contracts/${name}.clar`, import.meta.url), 'utf8');
const shaOf = (s) => crypto.createHash('sha256').update(s).digest('hex');
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
let passed = 0, checks = 0, failures = 0, sid;
function check(label, actual, want) {
  checks++;
  const good = typeof want === 'function' ? want(actual) : actual === want;
  if (good) passed++; else failures++;
  console.log(`${good ? 'ok  ' : 'FAIL'} ${checks}. ${label}: ${String(actual).slice(0, 500)}${good ? '' : `; expected ${typeof want === 'function' ? want.toString() : want}`}`);
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
      if (i < 6 && /block info|ECONNRESET|fetch failed|50[234]|busy|409/i.test(String(e?.message ?? e))) { await new Promise((r) => setTimeout(r, 3000)); continue; }
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
// the ladder's print events of a receipt, as Clarity strings
const ladderPrints = (r) => (r.receipt?.events ?? r.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e)
  .filter((e) => e.committed !== false && e.contract_event?.contract_identifier === LADDER)
  .map((e) => cv(e.contract_event.raw_value));
async function txr(label, sender, cid, fn, args, want) {
  const r = await retry(() => callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 }));
  const actual = r.vmError || r.pcAborted ? `ENGINE-ERR ${JSON.stringify(r)}` : r.result;
  check(label, actual, want);
  return { result: actual, prints: ladderPrints(r) };
}
async function advanceBurn(n) {
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 600 } }] }));
  const blocks = out.steps[0]?.AdvanceBlocks?.Ok;
  if (!blocks) throw new Error(`AdvanceBlocks failed: ${JSON.stringify(out.steps[0]).slice(0, 300)}`);
  return Number(blocks[blocks.length - 1].burn_height);
}
const tuple = (o) => `(tuple ${Object.keys(o).sort().map((k) => `(${k} ${o[k]})`).join(' ')})`;

// ------------------------------------------------------------- contracts --
const PROBE = `;; ladprobe: a rung stand-in; contract-caller for the ladder
(define-public (reg (side (string-ascii 8)) (price uint) (mp uint))
  (contract-call? .jing-ladder-v1 register side price mp))
(define-public (reg-unseated (side (string-ascii 8)) (price uint) (mp uint))
  (contract-call? .jing-ladder-v1 register-unseated side price mp))
(define-public (l-deposit) (contract-call? .jing-ladder-v1 log-deposit tx-sender u11 u12 u13 true u14))
(define-public (l-push) (contract-call? .jing-ladder-v1 log-push tx-sender u21 false u22))
(define-public (l-withdraw) (contract-call? .jing-ladder-v1 log-withdraw tx-sender u31 u32 u33 u34))
(define-public (l-payout) (contract-call? .jing-ladder-v1 log-payout tx-sender u41 u42 u43))
(define-public (l-epoch) (contract-call? .jing-ladder-v1 log-epoch-closed u51 u52))
(define-public (l-rescale) (contract-call? .jing-ladder-v1 log-rescale u61 u62 u63 u64 u65))
(define-public (read (side (string-ascii 8)) (price uint) (who principal))
  (ok {
    owner: (contract-call? .jing-ladder-v1 get-owner),
    pending: (contract-call? .jing-ladder-v1 get-pending-owner),
    canonical: (contract-call? .jing-ladder-v1 get-canonical side),
    rung: (contract-call? .jing-ladder-v1 get-rung side price),
    registered: (contract-call? .jing-ladder-v1 get-registered who),
    is-reg: (contract-call? .jing-ladder-v1 is-registered who),
    count: (contract-call? .jing-ladder-v1 get-band-count side),
    max: (contract-call? .jing-ladder-v1 get-max-band-per-side),
    band-x: (contract-call? .jing-ladder-v1 is-band-x who),
    band-y: (contract-call? .jing-ladder-v1 is-band-y who),
    current: (contract-call? .jing-ladder-v1 is-current-rung who),
    burn: burn-block-height,
  }))
`;
const PROBE_B = `${PROBE};; variant b\n`;
const PROBE_C = `${PROBE};; variant c\n`;
const SIDES = ['buy-stx', 'sell-stx', 'buy-peg', 'sell-peg', 'buy-band', 'sel-band'];

async function main() {
  const ladderSrc = source('jing-ladder-v1');
  const shaStart = shaOf(ladderSrc);
  console.log(`jing-ladder-v1 sha256 at start: ${shaStart}`);
  const A = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `${DEP}.ladprobe-a${i}`);
  const B = [1, 2, 3].map((i) => `${DEP}.ladprobe-b${i}`);
  const C1 = `${DEP}.ladprobe-c1`;
  const b = SimulationBuilder.new({ stacksNodeAPI: 'http://77.42.3.101/stacks-api' });
  b.withSender(DEP).addContractDeploy({ contract_name: 'jing-ladder-v1', source_code: ladderSrc, clarity_version: ClarityVersion.Clarity5 });
  for (const c of A) b.withSender(DEP).addContractDeploy({ contract_name: c.split('.')[1], source_code: PROBE, clarity_version: ClarityVersion.Clarity5 });
  for (const c of B) b.withSender(DEP).addContractDeploy({ contract_name: c.split('.')[1], source_code: PROBE_B, clarity_version: ClarityVersion.Clarity5 });
  b.withSender(DEP).addContractDeploy({ contract_name: 'ladprobe-c1', source_code: PROBE_C, clarity_version: ClarityVersion.Clarity5 });
  sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const setup = await getSimulationResult(sid);
  for (const st of setup.steps.filter((s) => s.Result?.Transaction)) check('deploy', decode(st), ok);

  const stranger = mk(741), NEW = mk(742), NEW2 = mk(743);
  const hashOf = (c) => evRaw(LADDER, `(unwrap-panic (contract-hash? '${c}))`);
  const H = { A: await hashOf(A[0]), A2: await hashOf(A[1]), B: await hashOf(B[0]), C: await hashOf(C1) };
  check('probe hashes: a1 = a2, a / b / c distinct', String(H.A === H.A2 && H.A !== H.B && H.A !== H.C && H.B !== H.C), 'true');

  // the ladder's whole state over every probe and every (side, price) key the suite touches
  const KEYS = [];
  for (const s of SIDES) for (const p of [100, 200, 300, 400, 500, 600, 700]) KEYS.push([s, p]);
  const who = [...A, ...B, C1];
  async function snapshot() {
    const code = `{ o: (var-get contract-owner), p: (var-get pending-owner), pa: (var-get proposed-at), m: (var-get max-band-per-side),
      bc: (list (map-get? band-count "buy-band") (map-get? band-count "sel-band")),
      c: (list ${SIDES.map((s) => `(map-get? canonical "${s}")`).join(' ')}),
      r: (list ${KEYS.map(([s, p]) => `(map-get? rungs { side: "${s}", price: u${p} })`).join(' ')}),
      g: (list ${who.map((c) => `(map-get? registered '${c})`).join(' ')}) }`;
    const v = await evRaw(LADDER, code);
    if (!v.startsWith('(tuple')) throw new Error(`snapshot failed: ${v.slice(0, 300)}`);
    return v;
  }
  async function refused(label, sender, cid, fn, args, want) {
    const before = await snapshot();
    const r = await txr(label, sender, cid, fn, args, want);
    const after = await snapshot();
    check(`${label}: nothing moved`, after === before ? 'unchanged' : `CHANGED\n  before ${before}\n  after  ${after}`, 'unchanged');
    check(`${label}: no ladder print`, String(r.prints.length), '0');
    return r;
  }
  const s = (x) => stringAsciiCV(x);
  const reg = (label, probe, side, price, want) => (want.startsWith('(err') ? refused : txr)(label, stranger, probe, 'reg', [s(side), uintCV(price), uintCV(price * 7)], want);
  const regU = (label, probe, side, price, want) => (want.startsWith('(err') ? refused : txr)(label, stranger, probe, 'reg-unseated', [s(side), uintCV(price), uintCV(price * 7)], want);
  const burnNow = async () => {
    const r = await retry(() => callContract(sid, { sender: stranger, contract: A[0], functionName: 'read', functionArgs: [s('buy-band'), uintCV(0), principal(A[0])], fee: 0 }));
    const m = /\(burn u(\d+)\)/.exec(r.result ?? ''); if (!m) throw new Error(`burn read failed: ${JSON.stringify(r).slice(0, 300)}`);
    return Number(m[1]);
  };
  // every getter through the probe, inside a transaction
  async function read(label, side, price, w, want) {
    return txr(`getters: ${label}`, stranger, A[0], 'read', [s(side), uintCV(price), principal(w)], `(ok ${tuple({ burn: `u${B0}`, ...want })})`);
  }
  const printHas = (r, fields) => check(`print: ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ')}`, r.prints.join(' | '),
    () => r.prints.length === 1 && Object.entries(fields).every(([k, v]) => r.prints[0].includes(`(${k} ${v})`)));
  const rungT = (side, price) => `(some (tuple (price u${price}) (side "${side}")))`;

  // ============================================ phase 1: initial state ====
  console.log('PHASE 1: initial state through every getter');
  const B0 = await burnNow();
  const blank = { owner: DEP, pending: `(tuple (eligible-at u${TIMELOCK}) (pending none))`, canonical: 'none', rung: 'none', registered: 'none', 'is-reg': 'false', count: 'u0', max: 'u10', 'band-x': 'false', 'band-y': 'false', current: 'false' };
  await read('fresh ladder', 'buy-band', 100, A[0], blank);

  // ============================================ phase 2: set-canonical ====
  console.log('PHASE 2: set-canonical');
  await refused('set-canonical by a non-owner -> ERR_NOT_AUTHORIZED u6001', stranger, LADDER, 'set-canonical', [s('buy-band'), principal(A[0])], '(err u6001)');
  await refused('set-canonical on an unknown side -> ERR_BAD_SIDE u6007', DEP, LADDER, 'set-canonical', [s('buy-bnd'), principal(A[0])], '(err u6007)');
  await refused('set-canonical by a non-owner on an unknown side -> u6001 (owner first)', stranger, LADDER, 'set-canonical', [s('nope'), principal(A[0])], '(err u6001)');
  // before any canonical: register / register-unseated -> u6003
  await reg('register before a canonical exists -> ERR_NOT_VERIFIED u6003', A[0], 'buy-band', 100, '(err u6003)');
  await regU('register-unseated before a canonical exists -> u6003', A[0], 'buy-band', 100, '(err u6003)');
  for (const side of SIDES) {
    const canon = side === 'buy-band' ? A[0] : side === 'sell-peg' ? stranger : B[0];
    const r = await txr(`owner sets canonical ${side}`, DEP, LADDER, 'set-canonical', [s(side), principal(canon)], '(ok true)');
    printHas(r, { event: '"canonical-set"', side: `"${side}"`, contract: canon });
  }
  await read('canonical buy-band = a1', 'buy-band', 100, A[0], { ...blank, canonical: `(some ${A[0]})` });
  // overwrite is allowed; set sel-band back to b1 after proving it
  await txr('set-canonical overwrites (sel-band -> a1)', DEP, LADDER, 'set-canonical', [s('sel-band'), principal(A[0])], '(ok true)');
  await ev('canonical sel-band = a1', LADDER, '(get-canonical "sel-band")', `(some ${A[0]})`);
  await txr('set-canonical sel-band back to b1', DEP, LADDER, 'set-canonical', [s('sel-band'), principal(B[0])], '(ok true)');

  // ============================================ phase 3: register =========
  console.log('PHASE 3: register (hash gate, fixed sides, band seats)');
  await refused('register called by a wallet -> u6002 (a standard principal has no contract hash)', stranger, LADDER, 'register', [s('buy-band'), uintCV(100), uintCV(1)], '(err u6002)');
  await regU('register-unseated on a fixed side (buy-stx) -> ERR_BAD_SIDE u6007', A[0], 'buy-stx', 100, '(err u6007)');
  await refused('register-unseated called by a wallet -> u6002', stranger, LADDER, 'register-unseated', [s('buy-band'), uintCV(100), uintCV(1)], '(err u6002)');
  await reg('register on a side with no canonical (unknown side) -> u6003', A[0], 'xx', 100, '(err u6003)');
  await reg('register under a canonical that is a wallet (sell-peg) -> u6002 (canonical hash)', B[1], 'sell-peg', 100, '(err u6002)');
  await txr('set-canonical sel-band to a wallet (to reach the canonical-hash arm)', DEP, LADDER, 'set-canonical', [s('sel-band'), principal(stranger)], '(ok true)');
  await regU('register-unseated under a wallet canonical (sel-band) -> u6002 (canonical hash)', B[1], 'sel-band', 100, '(err u6002)');
  await reg('register under a wallet canonical (sel-band) -> u6002 (canonical hash)', B[1], 'sel-band', 100, '(err u6002)');
  await txr('set-canonical sel-band back to b1', DEP, LADDER, 'set-canonical', [s('sel-band'), principal(B[0])], '(ok true)');
  await reg('c1 on buy-band (hash C vs A) -> ERR_HASH_MISMATCH u6004', C1, 'buy-band', 100, '(err u6004)');
  await reg('a2 on buy-stx (hash A vs canonical b1) -> u6004', A[1], 'buy-stx', 100, '(err u6004)');

  // fixed side: b2 at buy-stx 100, then b3 at the same price -> u6006
  let r = await reg('b2 registers buy-stx at 100', B[1], 'buy-stx', 100, '(ok true)');
  printHas(r, { event: '"rung-registered"', side: '"buy-stx"', price: 'u100', 'market-price': 'u700', contract: B[1], hash: H.B, seated: 'false', replaced: 'none' });
  await reg('b3 at the taken buy-stx 100 -> ERR_PRICE_TAKEN u6006', B[2], 'buy-stx', 100, '(err u6006)');
  await reg('b2 again (other price) -> ERR_ALREADY_REGISTERED u6005', B[1], 'buy-stx', 200, '(err u6005)');
  await reg('b2 on sell-stx (hash B = canonical b1) -> u6005 (one row per contract)', B[1], 'sell-stx', 100, '(err u6005)');
  await read('b2: fixed rung, current, not band', 'buy-stx', 100, B[1], { ...blank, canonical: `(some ${B[0]})`, rung: `(some ${B[1]})`, registered: rungT('buy-stx', 100), 'is-reg': 'true', current: 'true' });
  // canonical itself registers on sell-stx
  await reg('b1 (the canonical) registers sell-stx at 100', B[0], 'sell-stx', 100, '(ok true)');

  // band side, free seats
  r = await reg('a1 registers buy-band spread 100 (free seat: count 1)', A[0], 'buy-band', 100, '(ok true)');
  printHas(r, { event: '"rung-registered"', side: '"buy-band"', price: 'u100', contract: A[0], hash: H.A, seated: 'true', replaced: 'none' });
  await read('a1 seated buy-band 100', 'buy-band', 100, A[0], { ...blank, canonical: `(some ${A[0]})`, rung: `(some ${A[0]})`, registered: rungT('buy-band', 100), 'is-reg': 'true', count: 'u1', 'band-x': 'true', current: 'true' });
  await reg('a1 again -> u6005', A[0], 'buy-band', 200, '(err u6005)');
  await reg('a2 registers buy-band 200 (count 2)', A[1], 'buy-band', 200, '(ok true)');
  // replace: a3 at the taken spread 100
  r = await reg('a3 registers buy-band 100 (taken: replaces a1, count stays 2)', A[2], 'buy-band', 100, '(ok true)');
  printHas(r, { event: '"rung-registered"', contract: A[2], seated: 'true', replaced: `(some ${A[0]})` });
  await read('a1 replaced: registered, not band, not current', 'buy-band', 100, A[0], { ...blank, canonical: `(some ${A[0]})`, rung: `(some ${A[2]})`, registered: rungT('buy-band', 100), 'is-reg': 'true', count: 'u2', 'band-x': 'false', current: 'false' });
  await read('a3 holds 100', 'buy-band', 100, A[2], { ...blank, canonical: `(some ${A[0]})`, rung: `(some ${A[2]})`, registered: rungT('buy-band', 100), 'is-reg': 'true', count: 'u2', 'band-x': 'true', current: 'true' });
  await ev('is-band-y of a buy-band rung is false (side arm)', LADDER, `(list (is-band-y '${A[2]}) (is-band-x '${A[2]}) (is-band-x '${B[1]}) (is-band-x '${C1}))`, '(list false true false false)');

  // ============================================ phase 4: seat cap =========
  console.log('PHASE 4: max-band-per-side and u6011');
  await refused('set-max by a non-owner -> u6001', stranger, LADDER, 'set-max-band-per-side', [uintCV(5)], '(err u6001)');
  await refused('set-max under the buy-band count (1 < 2) -> ERR_BAND_FULL u6011', DEP, LADDER, 'set-max-band-per-side', [uintCV(1)], '(err u6011)');
  await refused('set-max to 50 (the market seat list) -> u6011', DEP, LADDER, 'set-max-band-per-side', [uintCV(50)], '(err u6011)');
  r = await txr('set-max to 49 (the ceiling) -> ok', DEP, LADDER, 'set-max-band-per-side', [uintCV(49)], '(ok true)');
  printHas(r, { event: '"max-band-per-side-set"', max: 'u49' });
  r = await txr('set-max to 2 (exactly the buy-band count) -> ok', DEP, LADDER, 'set-max-band-per-side', [uintCV(2)], '(ok true)');
  await reg('a4 at a new buy-band spread 300 with 2/2 seats -> u6011', A[3], 'buy-band', 300, '(err u6011)');
  r = await reg('a4 at the taken spread 200 while full -> ok (replacement needs no free seat)', A[3], 'buy-band', 200, '(ok true)');
  printHas(r, { replaced: `(some ${A[1]})`, seated: 'true' });
  await ev('buy-band count still 2', LADDER, '(get-band-count "buy-band")', 'u2');
  // sel-band: b-hash rungs; two seats on the other side
  await reg('b3 registers sel-band 100 (count 1)', B[2], 'sel-band', 100, '(ok true)');
  await ev('sel-band rung: is-band-y true, is-band-x false', LADDER, `(list (is-band-y '${B[2]}) (is-band-x '${B[2]}))`, '(list true false)');
  await txr('set-max to 3', DEP, LADDER, 'set-max-band-per-side', [uintCV(3)], '(ok true)');
  await refused('set-max to 1: under buy-band 2 (sel-band 1 ok) -> u6011', DEP, LADDER, 'set-max-band-per-side', [uintCV(1)], '(err u6011)');

  // ============================================ phase 5: unseated =========
  console.log('PHASE 5: register-unseated and seat-band');
  await regU('register-unseated on a fixed side -> ERR_BAD_SIDE u6007', A[4], 'buy-stx', 500, '(err u6007)');
  await regU('register-unseated with a mismatched hash -> u6004', C1, 'buy-band', 500, '(err u6004)');
  r = await regU('a5 register-unseated buy-band 100 (a taken spread: no seat, no key)', A[4], 'buy-band', 100, '(ok true)');
  printHas(r, { event: '"rung-registered"', contract: A[4], seated: 'false', replaced: 'none', price: 'u100' });
  await regU('a5 again -> u6005', A[4], 'buy-band', 100, '(err u6005)');
  r = await regU('a6 register-unseated buy-band 500 (free spread, still no seat)', A[5], 'buy-band', 500, '(ok true)');
  await read('a6 unseated: registered, not current, count unchanged', 'buy-band', 500, A[5], { ...blank, canonical: `(some ${A[0]})`, rung: 'none', registered: rungT('buy-band', 500), 'is-reg': 'true', count: 'u2', max: 'u3', 'band-x': 'false', current: 'false' });
  await refused('seat-band of an unregistered contract -> ERR_NOT_REGISTERED u6010', DEP, LADDER, 'seat-band', [principal(A[7])], '(err u6010)');
  await refused('seat-band by a non-owner -> u6001', stranger, LADDER, 'seat-band', [principal(A[5])], '(err u6001)');
  await refused('seat-band of a fixed-side rung -> u6007', DEP, LADDER, 'seat-band', [principal(B[1])], '(err u6007)');
  await refused('seat-band of the current holder -> ERR_ALREADY_SEATED u6012', DEP, LADDER, 'seat-band', [principal(A[2])], '(err u6012)');
  r = await txr('seat-band a6 at the free spread 500 (count 3)', DEP, LADDER, 'seat-band', [principal(A[5])], '(ok true)');
  printHas(r, { event: '"band-seated"', side: '"buy-band"', spread: 'u500', contract: A[5], replaced: 'none' });
  await ev('buy-band count 3', LADDER, '(get-band-count "buy-band")', 'u3');
  await refused('seat-band a4 is current (200) -> u6012', DEP, LADDER, 'seat-band', [principal(A[3])], '(err u6012)');
  r = await txr('seat-band a5 at the taken spread 100 while full (replaces a3)', DEP, LADDER, 'seat-band', [principal(A[4])], '(ok true)');
  printHas(r, { event: '"band-seated"', spread: 'u100', contract: A[4], replaced: `(some ${A[2]})` });
  await ev('a3 lost the seat, a5 has it', LADDER, `(list (is-current-rung '${A[2]}) (is-current-rung '${A[4]}) (is-band-x '${A[2]}))`, '(list false true false)');
  // a3 (replaced) at 100 cannot be reseated when full? spread 100 is taken -> replace allowed; do it at a full free spread instead
  await regU('a7 register-unseated buy-band 600', A[6], 'buy-band', 600, '(ok true)');
  await refused('seat-band a7 at a free spread with 3/3 seats -> u6011 (claim-seat)', DEP, LADDER, 'seat-band', [principal(A[6])], '(err u6011)');

  // ============================================ phase 6: retire ===========
  console.log('PHASE 6: retire-band');
  await refused('retire a spread nobody holds -> u6010', DEP, LADDER, 'retire-band', [s('buy-band'), uintCV(700)], '(err u6010)');
  await refused('retire a spread nobody holds, as a stranger -> u6010 (key read first)', stranger, LADDER, 'retire-band', [s('buy-band'), uintCV(700)], '(err u6010)');
  await refused('retire by a non-owner -> u6001', stranger, LADDER, 'retire-band', [s('buy-band'), uintCV(500)], '(err u6001)');
  await refused('retire a fixed-side key (buy-stx 100) -> u6007', DEP, LADDER, 'retire-band', [s('buy-stx'), uintCV(100)], '(err u6007)');
  r = await txr('retire buy-band 500 (a6)', DEP, LADDER, 'retire-band', [s('buy-band'), uintCV(500)], '(ok true)');
  printHas(r, { event: '"band-retired"', side: '"buy-band"', spread: 'u500', contract: A[5] });
  await read('a6 retired: registered, no seat, count 2', 'buy-band', 500, A[5], { ...blank, canonical: `(some ${A[0]})`, rung: 'none', registered: rungT('buy-band', 500), 'is-reg': 'true', count: 'u2', max: 'u3', 'band-x': 'false', current: 'false' });
  r = await txr('seat-band a7 now fits (count 3)', DEP, LADDER, 'seat-band', [principal(A[6])], '(ok true)');
  printHas(r, { spread: 'u600', replaced: 'none' });
  await txr('retire buy-band 600 (a7)', DEP, LADDER, 'retire-band', [s('buy-band'), uintCV(600)], '(ok true)');
  r = await txr('seat-band the retired a6 again (free spread 500)', DEP, LADDER, 'seat-band', [principal(A[5])], '(ok true)');
  printHas(r, { spread: 'u500', contract: A[5], replaced: 'none' });
  r = await txr('seat-band the replaced a1 back at 100 (replaces a5)', DEP, LADDER, 'seat-band', [principal(A[0])], '(ok true)');
  printHas(r, { spread: 'u100', contract: A[0], replaced: `(some ${A[4]})` });
  await ev('band counts buy 3, sel 1', LADDER, '(list (get-band-count "buy-band") (get-band-count "sel-band") (get-band-count "buy-stx"))', '(list u3 u1 u0)');

  // ============================================ phase 7: log-* gating =====
  console.log('PHASE 7: log-* gating and the `current` flag');
  const LOGS = [['l-deposit', 'rung-deposit', { member: stranger, amount: 'u11', shares: 'u12', epoch: 'u13', pushed: 'true', held: 'u14' }],
    ['l-push', 'rung-push', { keeper: stranger, amount: 'u21', pushed: 'false', held: 'u22' }],
    ['l-withdraw', 'rung-withdraw', { member: stranger, amount: 'u31', shares: 'u32', epoch: 'u33', held: 'u34' }],
    ['l-payout', 'rung-payout', { member: stranger, proceeds: 'u41', back: 'u42', epoch: 'u43' }],
    ['l-epoch', 'rung-epoch-closed', { epoch: 'u51', 'final-proceeds-index': 'u52' }],
    ['l-rescale', 'rung-rescale', { epoch: 'u61', scale: 'u62', 'proceeds-index': 'u63', 'unfilled-index': 'u64', 'total-shares': 'u65' }]];
  // [probe, label, current, side, price]
  const emitters = [[A[0], 'seated band a1', 'true', 'buy-band', 100], [A[4], 'replaced band a5', 'false', 'buy-band', 100],
    [A[6], 'retired band a7', 'false', 'buy-band', 600], [B[1], 'fixed rung b2', 'true', 'buy-stx', 100],
    [B[2], 'sel-band b3', 'true', 'sel-band', 100]];
  for (const [fn, event, fields] of LOGS) {
    await refused(`${fn} from an unregistered contract (c1) -> u6010`, stranger, C1, fn, [], '(err u6010)');
    for (const [probe, label, current, side, price] of emitters) {
      const rr = await txr(`${fn} from ${label}`, stranger, probe, fn, [], '(ok true)');
      printHas(rr, { event: `"${event}"`, rung: probe, current, side: `"${side}"`, price: `u${price}`, ...fields });
    }
  }
  await refused('log-deposit called by a wallet directly -> u6010', stranger, LADDER, 'log-deposit', [principal(stranger), uintCV(1), uintCV(1), uintCV(1), boolCV(true), uintCV(1)], '(err u6010)');

  // ============================================ phase 8: ownership ========
  console.log('PHASE 8: propose-owner / accept-owner, 144-burn-block timelock');
  await refused('accept with no pending owner -> ERR_NO_PENDING_OWNER u6008', NEW, LADDER, 'accept-owner', [], '(err u6008)');
  await refused('propose by a non-owner -> u6001', stranger, LADDER, 'propose-owner', [someCV(principal(stranger))], '(err u6001)');
  await refused('cancel (none) by a non-owner -> u6001', stranger, LADDER, 'propose-owner', [noneCV()], '(err u6001)');
  const P1 = await burnNow();
  r = await txr('owner proposes NEW', DEP, LADDER, 'propose-owner', [someCV(principal(NEW))], '(ok true)');
  printHas(r, { event: '"owner-proposed"', 'proposed-by': DEP, 'pending-owner': `(some ${NEW})`, 'eligible-at': `u${P1 + TIMELOCK}` });
  await ev('pending NEW, eligible at +144', LADDER, '(get-pending-owner)', `(tuple (eligible-at u${P1 + TIMELOCK}) (pending (some ${NEW})))`);
  await refused('accept by a stranger -> u6001', stranger, LADDER, 'accept-owner', [], '(err u6001)');
  await refused('accept by the current owner -> u6001', DEP, LADDER, 'accept-owner', [], '(err u6001)');
  await refused('accept by NEW at once -> ERR_TIMELOCK_NOT_ELAPSED u6009', NEW, LADDER, 'accept-owner', [], '(err u6009)');
  await txr('owner cancels (none)', DEP, LADDER, 'propose-owner', [noneCV()], '(ok true)');
  await refused('accept by NEW after the cancel -> u6008', NEW, LADDER, 'accept-owner', [], '(err u6008)');
  await txr('owner proposes NEW2', DEP, LADDER, 'propose-owner', [someCV(principal(NEW2))], '(ok true)');
  const P2 = await burnNow();
  await txr('owner replaces the proposal with NEW (restarts the clock)', DEP, LADDER, 'propose-owner', [someCV(principal(NEW))], '(ok true)');
  let h = await advanceBurn(TIMELOCK - 1);
  check('advanced to eligible - 1', String(h), String(P2 + TIMELOCK - 1));
  await refused('accept one burn block early -> u6009', NEW, LADDER, 'accept-owner', [], '(err u6009)');
  await refused('accept by the replaced nominee NEW2 -> u6001', NEW2, LADDER, 'accept-owner', [], '(err u6001)');
  h = await advanceBurn(1);
  check('advanced exactly to eligibility', String(h), String(P2 + TIMELOCK));
  r = await txr('NEW accepts exactly at eligibility', NEW, LADDER, 'accept-owner', [], '(ok true)');
  printHas(r, { event: '"owner-accepted"', 'new-owner': NEW });
  await ev('owner NEW, pending none', LADDER, '{ o: (get-owner), p: (get pending (get-pending-owner)) }', `(tuple (o ${NEW}) (p none))`);
  await refused('accept again -> u6008', NEW, LADDER, 'accept-owner', [], '(err u6008)');
  // the old owner has no powers; the new owner has them all
  for (const [fn, args] of [['set-canonical', [s('buy-stx'), principal(A[0])]], ['set-max-band-per-side', [uintCV(5)]], ['seat-band', [principal(A[4])]],
    ['retire-band', [s('buy-band'), uintCV(500)]], ['propose-owner', [someCV(principal(DEP))]]]) {
    await refused(`old owner ${fn} -> u6001`, DEP, LADDER, fn, args, '(err u6001)');
  }
  await txr('new owner set-max 4', NEW, LADDER, 'set-max-band-per-side', [uintCV(4)], '(ok true)');
  await txr('new owner retires buy-band 500', NEW, LADDER, 'retire-band', [s('buy-band'), uintCV(500)], '(ok true)');
  r = await txr('new owner seats a5 (replaced earlier) at 100: replaces a1', NEW, LADDER, 'seat-band', [principal(A[4])], '(ok true)');
  printHas(r, { replaced: `(some ${A[0]})` });
  await txr('new owner sets canonical buy-stx to a1', NEW, LADDER, 'set-canonical', [s('buy-stx'), principal(A[0])], '(ok true)');
  await reg('a8 (hash A) now registers buy-stx 200', A[7], 'buy-stx', 200, '(ok true)');
  await reg('b3 (hash B) on buy-stx 300 now mismatches -> u6004', B[2], 'buy-stx', 300, '(err u6004)');
  await txr('new owner proposes the old owner back', NEW, LADDER, 'propose-owner', [someCV(principal(DEP))], '(ok true)');
  const B1 = await burnNow();
  await txr('getters: final state', stranger, A[0], 'read', [s('buy-band'), uintCV(100), principal(A[4])],
    `(ok ${tuple({ burn: `u${B1}`, owner: NEW, pending: `(tuple (eligible-at u${B1 + TIMELOCK}) (pending (some ${DEP})))`, canonical: `(some ${A[0]})`, rung: `(some ${A[4]})`, registered: rungT('buy-band', 100), 'is-reg': 'true', count: 'u2', max: 'u4', 'band-x': 'true', 'band-y': 'false', current: 'true' })})`);

  const shaEnd = shaOf(source('jing-ladder-v1'));
  console.log(`jing-ladder-v1 sha256 at end: ${shaEnd}`);
  check('ladder source unchanged during the run', shaEnd, shaStart);
  console.log(`${passed}/${checks} checks green`);
  console.log(`Sim: https://stxer.xyz/simulations/mainnet/${sid}`);
}
main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; });
